import { dbManager, getWIBDateTime } from '../db.ts';
import {
  AlokasiPembayaranBon,
  AuditLog,
  BukuRekeningKaryawanSummary,
  CatatanUpahHarian,
  DAFTAR_DIVISI,
  ItemPenjualan,
  MutasiBukuRekeningKaryawan,
  MutasiKeuanganDivisi,
  NamaDivisi,
  PergerakanKeuanganDivisiSummary,
  RekapGajiKaryawanBulanan,
  RekeningKoranMitraSummary,
  RekapMasterMitraSummary,
  RekapMitraItem,
  RekapKaryawanItem,
  RekapMasterKaryawanSummary,
  DetailHarianKaryawanResponse,
  ItemRekapPayrollBulanan,
  RekapPayrollBulananSummary,
  ItemRincianHarianPayroll,
  ItemPembelianBarang,
  LabaRugiProdukItem,
  LabaRugiSummary,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
} from '../types.ts';

// Helper to generate unique sequential transaction IDs
function generateId(prefix: string): string {
  const { tanggal } = getWIBDateTime();
  const [d, m, y] = tanggal.split('/');
  const dateCode = `${y.slice(2)}${m}${d}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${dateCode}${randomSuffix}`;
}

export class TransactionService {
  /**
   * Helper: Add an immutable audit log
   */
  private static addAuditLog(
    db: ReturnType<typeof dbManager.get>,
    jenis: AuditLog['jenisTransaksi'],
    idTransaksi: string,
    detail: string,
    nominal: number,
    rekeningTerkait: string = '',
    user: string = 'Kasir Wijaya Agro'
  ) {
    const { tanggal, jam, iso } = getWIBDateTime();
    db.auditLogs.unshift({
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: iso,
      tanggal,
      jam,
      user,
      jenisTransaksi: jenis,
      idTransaksi,
      detail,
      nominal,
      rekeningTerkait,
    });
  }

  // ==========================================
  // 1. PENJUALAN TOKO (DENGAN HARGA SUGESTI & PROSES NEGO)
  // ==========================================
  public static async processPenjualan(params: {
    idMitra?: string;
    namaPembeliManual?: string;
    tipePembeli?: 'UMUM' | 'REKANAN';
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON';
    rekeningTujuan?: string;
    items: Array<{ kodeProduk: string; qty: number; harga?: number; hargaSugesti?: number }>;
    keterangan?: string;
  }): Promise<TransaksiPenjualan> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Resolve Mitra or Manual General Customer
      let finalMitraId = 'UMUM';
      let finalMitraNama = params.namaPembeliManual?.trim() || 'Pelanggan Umum';

      if (params.idMitra && params.idMitra !== 'UMUM') {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) {
          throw new Error('Mitra tidak ditemukan');
        }
        if (mitra.status !== 'AKTIF') {
          throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
        }
        finalMitraId = mitra.id;
        finalMitraNama = mitra.nama;
      } else if (params.namaPembeliManual && params.namaPembeliManual.trim()) {
        finalMitraId = 'UMUM';
        finalMitraNama = params.namaPembeliManual.trim();
      }

      if (params.metode === 'KASBON' && finalMitraId === 'UMUM') {
        throw new Error('Metode KASBON piutang hanya berlaku untuk mitra terdaftar');
      }

      if (!params.items || params.items.length === 0) {
        throw new Error('Item penjualan tidak boleh kosong');
      }

      // Determine buyer type (if not explicitly passed, infer from mitra role)
      const tipePembeli: 'UMUM' | 'REKANAN' =
        params.tipePembeli || (finalMitraId === 'UMUM' ? 'UMUM' : 'REKANAN');

      // Validate & deduct stock real-time, compute profit/loss per item
      const processedItems: ItemPenjualan[] = [];
      let totalNominal = 0;
      let totalModalHpp = 0;

      for (const item of params.items) {
        if (!item.qty || item.qty <= 0) {
          throw new Error(`Qty untuk produk ${item.kodeProduk} harus lebih dari 0`);
        }

        const product = db.produk.find((p) => p.kode === item.kodeProduk);
        if (!product) {
          throw new Error(`Produk dengan kode ${item.kodeProduk} tidak ditemukan`);
        }
        if (product.status !== 'AKTIF') {
          throw new Error(`Produk ${product.nama} tidak aktif`);
        }

        const stokItem = db.stokBarang.find((s) => s.kode === item.kodeProduk);
        if (!stokItem) {
          throw new Error(`Data stok untuk produk ${product.nama} tidak ditemukan`);
        }

        if (stokItem.stok < item.qty) {
          throw new Error(
            `Stok tidak mencukupi untuk "${product.nama}". Stok tersedia: ${stokItem.stok} ${stokItem.satuan}, diminta: ${item.qty} ${stokItem.satuan}`
          );
        }

        // Suggested price based on buyer type
        const defaultSuggested =
          tipePembeli === 'REKANAN' && product.hargaKhususRekanan
            ? product.hargaKhususRekanan
            : product.hargaJual;

        const hargaSugesti = item.hargaSugesti !== undefined ? item.hargaSugesti : defaultSuggested;
        const hargaDeal = item.harga !== undefined && item.harga >= 0 ? item.harga : defaultSuggested;

        const subtotal = hargaDeal * item.qty;
        const modalHppItem = (product.hargaBeli || 0) * item.qty;
        const labaKotorItem = subtotal - modalHppItem;

        totalNominal += subtotal;
        totalModalHpp += modalHppItem;

        processedItems.push({
          kodeProduk: product.kode,
          namaProduk: product.nama,
          satuan: product.satuan,
          qty: item.qty,
          hargaBeli: product.hargaBeli || 0,
          hargaSugesti,
          harga: hargaDeal,
          subtotal,
          labaKotor: labaKotorItem,
        });

        // Deduct stock in DB_STOK
        stokItem.stok -= item.qty;
        stokItem.updateTerakhir = iso;
      }

      // Handle Destination Account & Balance update based on method
      let finalRekeningTujuan = '';
      let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' = 'LUNAS';
      let sisaPiutang = 0;

      if (params.metode === 'TUNAI') {
        finalRekeningTujuan = 'KAS01';
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
        kasAcc.saldoSaatIni += totalNominal;
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (params.metode === 'TRANSFER') {
        if (!params.rekeningTujuan) {
          throw new Error('Rekening bank tujuan transfer wajib dipilih');
        }
        if (params.rekeningTujuan === 'BON01' || params.rekeningTujuan === 'TIT01') {
          throw new Error('Rekening BON01 / TIT01 tidak dapat digunakan untuk pembayaran transfer');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningTujuan} tidak ditemukan`);
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        bankAcc.saldoSaatIni += totalNominal;
        finalRekeningTujuan = bankAcc.kode;
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (params.metode === 'KASBON') {
        // Barang keluar, customer memiliki piutang, TIDAK ada uang kas masuk
        finalRekeningTujuan = 'BON01';
        statusPembayaran = 'BELUM_BAYAR';
        sisaPiutang = totalNominal;
      }

      const totalLabaKotor = totalNominal - totalModalHpp;
      const noPenjualan = generateId('PJ');
      const penjualanRecord: TransaksiPenjualan = {
        noPenjualan,
        tanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        tipePembeli,
        metode: params.metode,
        rekeningTujuan: finalRekeningTujuan,
        items: processedItems,
        totalModalHpp,
        totalNominal,
        totalLabaKotor,
        statusPembayaran,
        sisaPiutang,
        keterangan:
          params.keterangan ||
          (params.metode === 'KASBON'
            ? `Penjualan Kasbon (${tipePembeli})`
            : `Penjualan Barang Toko (${tipePembeli})`),
        createdAt: iso,
      };

      db.penjualan.unshift(penjualanRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noPenjualan,
        `Penjualan ${params.metode} [${tipePembeli}] kepada ${finalMitraNama} (${processedItems.length} item) - Omzet: Rp ${totalNominal.toLocaleString('id-ID')}, Laba: Rp ${totalLabaKotor.toLocaleString('id-ID')}`,
        totalNominal,
        finalRekeningTujuan
      );

      return penjualanRecord;
    });
  }

  // ==========================================
  // 1B. PEMBELIAN BARANG DAGANG (DISTRIBUTOR / PEMASOK)
  // ==========================================
  public static async processPembelianBarang(params: {
    idMitra?: string; // Registered Supplier ID (optional if manual name is provided)
    namaDistributorManual?: string; // Optional manual distributor name for non-fixed suppliers
    noFakturSupplier?: string;
    fotoNota?: string; // Base64 image data URL of invoice / receipt
    isRekapanGlobal?: boolean;
    judulRekapan?: string;
    totalNominalRekapan?: number;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'HUTANG';
    rekeningSumber?: string;
    items?: Array<{
      kodeProduk: string;
      qty: number;
      hargaBeliSatuan: number;
      sesuaikanHargaJual?: number;
      sesuaikanHargaRekanan?: number;
    }>;
    keterangan?: string;
  }): Promise<TransaksiPembelianBarang> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Resolve Supplier (Registered or Dynamic/Manual)
      let supplier = params.idMitra ? db.mitra.find((m) => m.id === params.idMitra) : undefined;
      const isManual = Boolean(params.namaDistributorManual && params.namaDistributorManual.trim());

      if (isManual) {
        const manualName = params.namaDistributorManual!.trim();
        // Check if an existing supplier has this exact name
        supplier = db.mitra.find((m) => m.nama.toLowerCase() === manualName.toLowerCase());
        if (!supplier) {
          const newMitraId = generateId('MTR');
          const kodeRandom = `DIST${Math.floor(100 + Math.random() * 900)}`;
          supplier = {
            id: newMitraId,
            kode: kodeRandom,
            nama: manualName,
            role: 'SUPPLIER',
            telepon: '-',
            alamat: 'Distributor / Pemasok Bebas (Non-Tetap)',
            status: 'AKTIF',
            catatan: 'Pemasok / distributor lepas yang diinput langsung saat penerimaan barang',
          };
          db.mitra.push(supplier);
        }
      }

      if (!supplier) {
        throw new Error('Pilih distributor terdaftar atau ketik nama distributor / pemasok manual');
      }
      if (supplier.status !== 'AKTIF') {
        throw new Error(`Distributor / pemasok ${supplier.nama} berstatus NONAKTIF`);
      }

      const isRekapan = Boolean(
        params.isRekapanGlobal ||
        ((!params.items || params.items.length === 0) && params.totalNominalRekapan && params.totalNominalRekapan > 0)
      );

      let totalNominal = 0;
      const processedItems: ItemPembelianBarang[] = [];

      if (isRekapan) {
        const nominalRekap = Number(params.totalNominalRekapan) || 0;
        if (nominalRekap <= 0) {
          throw new Error('Nominal total rekapan nota pembelian harus lebih dari Rp 0');
        }
        totalNominal = nominalRekap;
        processedItems.push({
          kodeProduk: 'REKAP-NOTA',
          namaProduk: params.judulRekapan || `Rekapan Nota Pembelian Supplier (${supplier.nama})`,
          satuan: 'Faktur/Nota',
          qty: 1,
          hargaBeliSatuan: nominalRekap,
          subtotal: nominalRekap,
          stokSebelum: 0,
          stokSetelah: 0,
        });
      } else {
        if (!params.items || params.items.length === 0) {
          throw new Error('Daftar barang pembelian distributor tidak boleh kosong');
        }

        for (const item of params.items) {
          if (!item.qty || item.qty <= 0) {
            throw new Error(`Kuantitas untuk produk ${item.kodeProduk} harus lebih dari 0`);
          }
          if (item.hargaBeliSatuan === undefined || item.hargaBeliSatuan < 0) {
            throw new Error(`Harga beli satuan untuk produk ${item.kodeProduk} tidak valid`);
          }

          let product = db.produk.find((p) => p.kode === item.kodeProduk);
          if (!product) {
            const itemAny = item as any;
            const newProd = {
              kode: item.kodeProduk,
              kategori: itemAny.kategori || 'PUPUK & SAPROTAN',
              nama: itemAny.namaProduk || itemAny.nama || item.kodeProduk,
              satuan: itemAny.satuan || 'Sak',
              hargaBeli: item.hargaBeliSatuan,
              hargaJual: item.sesuaikanHargaJual || Math.round(item.hargaBeliSatuan * 1.15),
              hargaKhususRekanan: item.sesuaikanHargaRekanan || item.sesuaikanHargaJual || item.hargaBeliSatuan,
              status: 'AKTIF' as const,
            };
            db.produk.push(newProd);
            product = newProd;
          }

          let stokItem = db.stokBarang.find((s) => s.kode === item.kodeProduk);
          if (!stokItem) {
            // If somehow missing in stock table, create it
            stokItem = {
              kode: product.kode,
              namaProduk: product.nama,
              satuan: product.satuan,
              stok: 0,
              minimum: 10,
              updateTerakhir: iso,
            };
            db.stokBarang.push(stokItem);
          }

          const stokSebelum = stokItem.stok;
          const subtotal = item.qty * item.hargaBeliSatuan;
          totalNominal += subtotal;

          // Auto-increment stock
          stokItem.stok += item.qty;
          const stokSetelah = stokItem.stok;
          stokItem.updateTerakhir = iso;

          // Update product HPP / latest purchase price
          product.hargaBeli = item.hargaBeliSatuan;

          // Optionally adjust selling prices
          if (item.sesuaikanHargaJual && item.sesuaikanHargaJual > 0) {
            product.hargaJual = item.sesuaikanHargaJual;
          }
          if (item.sesuaikanHargaRekanan && item.sesuaikanHargaRekanan > 0) {
            product.hargaKhususRekanan = item.sesuaikanHargaRekanan;
          }

          processedItems.push({
            kodeProduk: product.kode,
            namaProduk: product.nama,
            satuan: product.satuan,
            qty: item.qty,
            hargaBeliSatuan: item.hargaBeliSatuan,
            subtotal,
            stokSebelum,
            stokSetelah,
          });
        }
      }

      // Handle payment deduction
      let finalRekeningSumber = '';
      let statusPembayaran: 'LUNAS' | 'HUTANG_BELUM_LUNAS' = 'LUNAS';

      if (params.metodePembayaran === 'TUNAI') {
        finalRekeningSumber = 'KAS01';
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening Kas Tunai (KAS01) tidak ditemukan');
        if (kasAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo Kas Tunai tidak mencukupi untuk kulakan. Saldo: Rp ${kasAcc.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${totalNominal.toLocaleString('id-ID')}`
          );
        }
        kasAcc.saldoSaatIni -= totalNominal;
        statusPembayaran = 'LUNAS';
      } else if (params.metodePembayaran === 'TRANSFER') {
        if (!params.rekeningSumber) {
          throw new Error('Rekening bank sumber dana transfer wajib dipilih');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo rekening ${bankAcc.nama} tidak mencukupi. Saldo: Rp ${bankAcc.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${totalNominal.toLocaleString('id-ID')}`
          );
        }
        bankAcc.saldoSaatIni -= totalNominal;
        finalRekeningSumber = bankAcc.kode;
        statusPembayaran = 'LUNAS';
      } else if (params.metodePembayaran === 'HUTANG') {
        finalRekeningSumber = 'TIT01';
        statusPembayaran = 'HUTANG_BELUM_LUNAS';
      }

      const noPembelian = generateId('PB');
      const record: TransaksiPembelianBarang = {
        noPembelian,
        tanggal,
        jam,
        idMitra: supplier.id,
        namaMitra: supplier.nama,
        isDistributorManual: isManual,
        namaDistributorManual: isManual ? supplier.nama : undefined,
        noFakturSupplier: params.noFakturSupplier || '-',
        fotoNota: params.fotoNota || '',
        metodePembayaran: params.metodePembayaran,
        rekeningSumber: finalRekeningSumber,
        items: processedItems,
        totalNominal,
        status: statusPembayaran,
        keterangan: params.keterangan || (isRekapan ? `Rekapan Nota Pembelian Supplier ${supplier.nama}` : `Pembelian barang stok dari distributor ${supplier.nama}`),
        createdAt: iso,
      };

      if (!Array.isArray(db.pembelianBarang)) {
        db.pembelianBarang = [];
      }
      db.pembelianBarang.unshift(record);

      this.addAuditLog(
        db,
        'CREATE',
        noPembelian,
        `Pembelian dari Distributor/Pemasok "${supplier.nama}" (${isRekapan ? 'Rekapan Nota Global' : `${processedItems.length} produk`}) - Total: Rp ${totalNominal.toLocaleString('id-ID')} via ${params.metodePembayaran}${record.fotoNota ? ' (Foto Nota Tersimpan)' : ''}`,
        totalNominal,
        finalRekeningSumber
      );

      return record;
    });
  }

  // ==========================================
  // 1C. LAPORAN LABA RUGI PRODUK PENJUALAN
  // ==========================================
  public static getLabaRugiSummary(): LabaRugiSummary {
    const db = dbManager.get();

    // Map all sales items to products
    const productStatsMap = new Map<
      string,
      {
        totalQty: number;
        totalOmzet: number;
        totalHppModal: number;
        totalLabaKotor: number;
      }
    >();

    let totalPenjualanTransaksi = 0;
    let totalOmzet = 0;
    let totalHppModal = 0;

    for (const pj of db.penjualan) {
      totalPenjualanTransaksi++;
      for (const item of pj.items) {
        const prod = db.produk.find((p) => p.kode === item.kodeProduk);
        const hppPerUnit = item.hargaBeli !== undefined ? item.hargaBeli : prod?.hargaBeli || 0;
        const subtotal = item.subtotal || item.harga * item.qty;
        const modalHpp = hppPerUnit * item.qty;
        const labaKotor = subtotal - modalHpp;

        totalOmzet += subtotal;
        totalHppModal += modalHpp;

        const curr = productStatsMap.get(item.kodeProduk) || {
          totalQty: 0,
          totalOmzet: 0,
          totalHppModal: 0,
          totalLabaKotor: 0,
        };

        curr.totalQty += item.qty;
        curr.totalOmzet += subtotal;
        curr.totalHppModal += modalHpp;
        curr.totalLabaKotor += labaKotor;

        productStatsMap.set(item.kodeProduk, curr);
      }
    }

    const totalLabaKotor = totalOmzet - totalHppModal;
    const persentaseMarginRataRata = totalOmzet > 0 ? (totalLabaKotor / totalOmzet) * 100 : 0;

    const items: LabaRugiProdukItem[] = db.produk.map((prod) => {
      const stats = productStatsMap.get(prod.kode) || {
        totalQty: 0,
        totalOmzet: 0,
        totalHppModal: 0,
        totalLabaKotor: 0,
      };

      const stokItem = db.stokBarang.find((s) => s.kode === prod.kode);
      const margin = stats.totalOmzet > 0 ? (stats.totalLabaKotor / stats.totalOmzet) * 100 : 0;

      return {
        kodeProduk: prod.kode,
        namaProduk: prod.nama,
        satuan: prod.satuan,
        kategori: prod.kategori,
        totalQtyTerjual: stats.totalQty,
        totalOmzet: stats.totalOmzet,
        totalHppModal: stats.totalHppModal,
        totalLabaKotor: stats.totalLabaKotor,
        persentaseMargin: Math.round(margin * 10) / 10,
        stokSaatIni: stokItem?.stok || 0,
        hargaBeliSaatIni: prod.hargaBeli || 0,
        hargaJualSugesti: prod.hargaJual || 0,
        hargaKhususRekanan: prod.hargaKhususRekanan,
      };
    });

    // Sort items by highest profit
    items.sort((a, b) => b.totalLabaKotor - a.totalLabaKotor);

    const produkTerlaris = items.length > 0 && items[0].totalQtyTerjual > 0 ? items[0].namaProduk : '-';

    const totalPembelianBarangMasuk = (db.pembelianBarang || []).reduce(
      (sum, p) => sum + (p.totalNominal || 0),
      0
    );

    return {
      periode: 'Akumulasi Berjalan (Realtime)',
      totalPenjualanTransaksi,
      totalOmzet,
      totalHppModal,
      totalLabaKotor,
      persentaseMarginRataRata: Math.round(persentaseMarginRataRata * 10) / 10,
      produkTerlaris,
      totalPembelianBarangMasuk,
      items,
    };
  }

  // ==========================================
  // 2. PEMBELIAN HASIL BUMI
  // ==========================================
  public static async processPembelianHasilBumi(params: {
    idMitra?: string;
    namaPetaniManual?: string;
    teleponPetaniManual?: string;
    alamatPetaniManual?: string;
    komoditasKode?: string;
    namaKomoditasBaru?: string;
    beratKotor: number;
    potonganRafaksi: number;
    hargaPerKg: number;
    fotoNota?: string;
    isBelumPutusHarga?: boolean;
    isNotaLalu?: boolean;
    noNotaLalu?: string;
    tanggalNotaLalu?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      if (!Array.isArray(db.mitra)) db.mitra = [];
      if (!Array.isArray(db.pembelianHasilBumi)) db.pembelianHasilBumi = [];

      // 1. Resolve Farmer / Supplier (Terdaftar atau Petani Umum Manual)
      let finalMitraId = 'UMUM';
      let finalMitraNama = params.namaPetaniManual?.trim() || 'Petani Umum';

      if (params.idMitra && params.idMitra !== 'UMUM') {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) {
          throw new Error('Petani / supplier terdaftar tidak ditemukan');
        }
        if (mitra.status !== 'AKTIF') {
          throw new Error(`Petani / supplier ${mitra.nama} berstatus NONAKTIF`);
        }
        finalMitraId = mitra.id;
        finalMitraNama = mitra.nama;
      } else if (params.namaPetaniManual && params.namaPetaniManual.trim()) {
        finalMitraId = 'UMUM';
        finalMitraNama = params.namaPetaniManual.trim();
      } else if (params.idMitra === 'UMUM') {
        finalMitraId = 'UMUM';
        finalMitraNama = 'Petani Umum';
      } else {
        throw new Error('Pilih petani terdaftar atau ketik nama petani umum');
      }

      // 2. Resolve or Create Commodity (Hasil Bumi)
      let komoditas = params.komoditasKode ? db.stokHasilBumi.find((k) => k.kode === params.komoditasKode) : undefined;
      const isKomoditasBaru = Boolean(params.namaKomoditasBaru && params.namaKomoditasBaru.trim());

      if (isKomoditasBaru) {
        const cleanKomNama = params.namaKomoditasBaru!.trim();
        komoditas = db.stokHasilBumi.find((k) => k.nama.toLowerCase() === cleanKomNama.toLowerCase());
        if (!komoditas) {
          const cleanKode = params.komoditasKode?.trim().toUpperCase() || `HB-${Math.floor(100 + Math.random() * 900)}`;
          komoditas = {
            kode: cleanKode,
            nama: cleanKomNama,
            satuan: 'Kg',
            stok: 0,
            hargaBeliStandar: params.hargaPerKg,
            updateTerakhir: iso,
          };
          db.stokHasilBumi.push(komoditas);
        }
      }

      if (!komoditas) {
        throw new Error('Pilih komoditas hasil bumi terdaftar atau masukkan nama komoditas baru');
      }

      if (params.beratKotor <= 0) throw new Error('Berat kotor timbangan harus lebih dari 0 kg');
      if (params.potonganRafaksi < 0 || params.potonganRafaksi >= 100) {
        throw new Error('Potongan rafaksi harus antara 0% dan 99.9%');
      }

      // Check whether this transaction is Belum Putus Harga (such as HB-08 KOPI TITIP or explicit flag)
      const isBelumPutus = Boolean(
        params.isBelumPutusHarga ||
        params.komoditasKode === 'HB-08' ||
        komoditas.isBelumPutusHarga ||
        komoditas.nama.toLowerCase().includes('titip')
      );

      if (!isBelumPutus && params.hargaPerKg <= 0) {
        throw new Error('Harga beli per kg harus lebih dari Rp 0 (atau aktifkan opsi Belum Putus Harga)');
      }

      const beratBersih = Math.round(params.beratKotor * (1 - params.potonganRafaksi / 100) * 100) / 100;
      const totalNominal = Math.round(beratBersih * (params.hargaPerKg || 0));

      let finalRekeningSumber = '';
      let status: 'LUNAS' | 'BELUM_DIAMBIL' | 'TITIP' | 'BELUM_PUTUS_HARGA' = 'LUNAS';

      if (isBelumPutus) {
        finalRekeningSumber = 'TIT01';
        status = 'BELUM_PUTUS_HARGA';
      } else if (params.metodePembayaran === 'TUNAI') {
        finalRekeningSumber = 'KAS01';
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
        if (kasAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo kas tidak mencukupi untuk pembayaran tunai. Saldo KAS01: Rp ${kasAcc.saldoSaatIni.toLocaleString(
              'id-ID'
            )}, Total tagihan: Rp ${totalNominal.toLocaleString('id-ID')}`
          );
        }
        kasAcc.saldoSaatIni -= totalNominal;
        status = 'LUNAS';
      } else if (params.metodePembayaran === 'TRANSFER') {
        if (!params.rekeningSumber) {
          throw new Error('Rekening bank sumber transfer wajib dipilih');
        }
        if (params.rekeningSumber === 'BON01' || params.rekeningSumber === 'TIT01') {
          throw new Error('Rekening BON01 / TIT01 tidak dapat digunakan sebagai sumber transfer');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        if (bankAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo rekening ${bankAcc.nama} tidak mencukupi. Saldo: Rp ${bankAcc.saldoSaatIni.toLocaleString(
              'id-ID'
            )}, Tagihan: Rp ${totalNominal.toLocaleString('id-ID')}`
          );
        }
        bankAcc.saldoSaatIni -= totalNominal;
        finalRekeningSumber = bankAcc.kode;
        status = 'LUNAS';
      } else if (params.metodePembayaran === 'TITIP') {
        finalRekeningSumber = 'TIT01';
        status = 'TITIP';
      }

      // Add to Hasil Bumi Stock (stock enters warehouse immediately)
      komoditas.stok += beratBersih;
      komoditas.updateTerakhir = iso;

      const noPembelian = generateId('PHB');
      const pembelianRecord: TransaksiPembelianHasilBumi = {
        noPembelian,
        tanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        komoditasKode: komoditas.kode,
        komoditasNama: komoditas.nama,
        beratKotor: params.beratKotor,
        potonganRafaksi: params.potonganRafaksi,
        beratBersih,
        hargaPerKg: params.hargaPerKg || 0,
        totalNominal,
        metodePembayaran: isBelumPutus ? 'TITIP' : params.metodePembayaran,
        rekeningSumber: finalRekeningSumber,
        status,
        isBelumPutusHarga: isBelumPutus,
        statusHarga: isBelumPutus ? 'BELUM_PUTUS_HARGA' : 'HARGA_PUTUS',
        fotoNota: params.fotoNota || '',
        isNotaLalu: params.isNotaLalu || false,
        noNotaLalu: params.noNotaLalu || '',
        tanggalNotaLalu: params.tanggalNotaLalu || '',
        keterangan:
          params.keterangan ||
          (isBelumPutus
            ? `Pembelian ${komoditas.nama} dari ${finalMitraNama} - Titip Timbang (Belum Putus Harga)`
            : `Pembelian ${komoditas.nama} dari ${finalMitraNama}`),
        createdAt: iso,
      };

      db.pembelianHasilBumi.unshift(pembelianRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noPembelian,
        `Pembelian Hasil Bumi ${komoditas.nama} (${beratBersih} kg) dari ${finalMitraNama} - Metode: ${params.metodePembayaran}`,
        totalNominal,
        finalRekeningSumber
      );

      return pembelianRecord;
    });
  }

  // ==========================================
  // 2B. PUTUS HARGA HASIL BUMI (TITIP PANEN -> HARGA DEAL)
  // Menetapkan harga definitif untuk hasil panen yang sebelumnya Belum Putus Harga
  // ==========================================
  public static async putusHargaHasilBumi(params: {
    noPembelian: string;
    hargaDealPerKg: number;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam } = getWIBDateTime();
      const record = db.pembelianHasilBumi.find((p) => p.noPembelian === params.noPembelian);
      if (!record) throw new Error(`Transaksi pembelian ${params.noPembelian} tidak ditemukan`);
      if (params.hargaDealPerKg <= 0) throw new Error('Harga deal per kg harus lebih dari Rp 0');

      const totalNominalBaru = Math.round(record.beratBersih * params.hargaDealPerKg);
      record.hargaPerKg = params.hargaDealPerKg;
      record.totalNominal = totalNominalBaru;
      record.statusHarga = 'HARGA_PUTUS';
      record.tanggalPutusHarga = `${tanggal} ${jam}`;
      record.keterangan = params.keterangan
        ? params.keterangan
        : `${record.keterangan} - (Harga diputus pada ${tanggal} @ Rp ${params.hargaDealPerKg.toLocaleString('id-ID')}/Kg)`;

      if (params.metodePembayaran === 'TUNAI') {
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening Kas Tunai KAS01 tidak ditemukan');
        if (kasAcc.saldoSaatIni < totalNominalBaru) {
          throw new Error(`Saldo KAS01 tidak cukup untuk bayar tunai Rp ${totalNominalBaru.toLocaleString('id-ID')}`);
        }
        kasAcc.saldoSaatIni -= totalNominalBaru;
        record.metodePembayaran = 'TUNAI';
        record.rekeningSumber = 'KAS01';
        record.status = 'LUNAS';
      } else if (params.metodePembayaran === 'TRANSFER') {
        if (!params.rekeningSumber) throw new Error('Pilih rekening bank sumber transfer');
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc || bankAcc.status !== 'AKTIF') throw new Error('Rekening bank tidak aktif');
        if (bankAcc.saldoSaatIni < totalNominalBaru) {
          throw new Error(`Saldo bank ${bankAcc.nama} tidak mencukupi`);
        }
        bankAcc.saldoSaatIni -= totalNominalBaru;
        record.metodePembayaran = 'TRANSFER';
        record.rekeningSumber = bankAcc.kode;
        record.status = 'LUNAS';
      } else {
        record.metodePembayaran = 'TITIP';
        record.rekeningSumber = 'TIT01';
        record.status = 'TITIP';
      }

      this.addAuditLog(
        db,
        'UPDATE',
        record.noPembelian,
        `Putus Harga Hasil Bumi ${record.komoditasNama} (${record.beratBersih} kg) @ Rp ${params.hargaDealPerKg.toLocaleString('id-ID')} - Total: Rp ${totalNominalBaru.toLocaleString('id-ID')} via ${record.metodePembayaran}`,
        totalNominalBaru,
        record.rekeningSumber
      );

      return record;
    });
  }

  // ==========================================
  // 3. KASBON UANG (FITUR BARU C)
  // Perusahaan memberikan UANG kepada MITRA
  // ==========================================
  public static async processKasbonUang(params: {
    idMitra: string;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string;
    nominal: number;
    keterangan?: string;
    fotoNota?: string;
  }): Promise<TransaksiKasbonUang> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Validasi nominal
      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal kasbon uang harus lebih dari Rp 0');
      }

      // Validasi Mitra
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) {
        throw new Error('Mitra penerima kasbon tidak ditemukan');
      }
      if (mitra.status !== 'AKTIF') {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }

      let rekeningSumberKode = '';
      if (params.metode === 'TUNAI') {
        rekeningSumberKode = 'KAS01';
      } else if (params.metode === 'TRANSFER') {
        if (!params.rekeningSumber) {
          throw new Error('User wajib memilih rekening bank perusahaan untuk transfer kasbon uang');
        }
        rekeningSumberKode = params.rekeningSumber;
      }

      // Dilarang keras menggunakan BON01 atau TIT01
      if (rekeningSumberKode === 'BON01' || rekeningSumberKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 DILARANG digunakan sebagai sumber kasbon uang!');
      }

      // Validasi rekening sumber dan saldo aktual di database
      const rekeningSumber = db.rekening.find((r) => r.kode === rekeningSumberKode);
      if (!rekeningSumber) {
        throw new Error(`Rekening sumber dengan kode ${rekeningSumberKode} tidak ditemukan`);
      }
      if (rekeningSumber.status !== 'AKTIF') {
        throw new Error(`Rekening sumber ${rekeningSumber.nama} tidak aktif`);
      }
      if (rekeningSumber.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening ${rekeningSumber.nama} (${rekeningSumber.kode}) tidak mencukupi! Saldo saat ini: Rp ${rekeningSumber.saldoSaatIni.toLocaleString(
            'id-ID'
          )}, kasbon yang diajukan: Rp ${params.nominal.toLocaleString('id-ID')}`
        );
      }

      // Potong saldo rekening sumber aktual
      rekeningSumber.saldoSaatIni -= params.nominal;

      const idTransaksi = generateId('KBU');
      const kasbonUangRecord: TransaksiKasbonUang = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        jenisTransaksi: 'KASBON UANG',
        metode: params.metode,
        rekeningSumber: rekeningSumber.kode,
        nominal: params.nominal,
        sisaKasbon: params.nominal,
        keterangan: params.keterangan || `Pemberian Kasbon Uang Operasional Tani kepada ${mitra.nama}`,
        status: 'BELUM LUNAS',
        fotoNota: params.fotoNota || '',
        createdAt: iso,
      };

      db.kasbonUang.unshift(kasbonUangRecord);

      this.addAuditLog(
        db,
        'CREATE',
        idTransaksi,
        `Kasbon Uang diberikan kepada ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString(
          'id-ID'
        )} dari ${rekeningSumber.nama} (${rekeningSumber.kode}) via ${params.metode}`,
        params.nominal,
        rekeningSumber.kode
      );

      return kasbonUangRecord;
    });
  }

  // ==========================================
  // 3B. INPUT NOTA LALU & SALDO AWAL MITRA
  // Pencatatan piutang bon barang atau titipan hasil panen dari tahun-tahun sebelumnya
  // ==========================================
  public static async processInputNotaLalu(params: {
    idMitra: string;
    tipe: 'PIUTANG_BARANG_NOTA_LALU' | 'TITIP_UANG_NOTA_LALU';
    nominal: number;
    tanggalNotaLalu: string;
    noNotaLalu?: string;
    rincianBarang?: string;
    fotoNota?: string;
    driveFileUrl?: string;
    driveFileId?: string;
    driveFolderPath?: string;
    keterangan?: string;
  }): Promise<{ record: any; tipe: string; mitraNama: string; nominal: number }> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal nota lalu harus lebih dari Rp 0');
      }

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) {
        throw new Error('Mitra / customer tidak ditemukan');
      }
      if (mitra.status !== 'AKTIF') {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }

      const cleanTglNota = params.tanggalNotaLalu ? params.tanggalNotaLalu.trim() : tanggal;
      const cleanNoNota = params.noNotaLalu ? params.noNotaLalu.trim() : `NL-${Date.now().toString().slice(-4)}`;

      if (params.tipe === 'PIUTANG_BARANG_NOTA_LALU') {
        // Dicatat sebagai Piutang Bon Barang Masa Lalu ke dalam Kasbon Uang dengan penanda Nota Lalu
        // Rekening sumber: BON01 (Virtual Piutang Awal, tidak memotong uang kasir tunai 2026!)
        const idTransaksi = generateId('NTL');
        const ketText = params.keterangan
          ? params.keterangan.trim()
          : `Nota Lalu (Piutang Barang Masa Lalu): ${params.rincianBarang ? params.rincianBarang.trim() : 'Rekapan Bon Barang Bertahun-Tahun Lalu'}`;

        const kasbonRecord: TransaksiKasbonUang = {
          idTransaksi,
          tanggal: cleanTglNota,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          jenisTransaksi: 'KASBON UANG',
          metode: 'TUNAI',
          rekeningSumber: 'BON01',
          nominal: params.nominal,
          sisaKasbon: params.nominal,
          keterangan: ketText,
          status: 'BELUM LUNAS',
          fotoNota: params.fotoNota || '',
          driveFileUrl: params.driveFileUrl || '',
          driveFileId: params.driveFileId || '',
          driveFolderPath: params.driveFolderPath || 'NOTA LALU / PIUTANG NOTA LAMA',
          isNotaLalu: true,
          noNotaLalu: cleanNoNota,
          tanggalNotaLalu: cleanTglNota,
          rincianBarangNotaLalu: params.rincianBarang || '',
          createdAt: iso,
        };

        db.kasbonUang.unshift(kasbonRecord);

        this.addAuditLog(
          db,
          'CREATE',
          idTransaksi,
          `Input Piutang Barang Nota Lalu untuk ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString('id-ID')} (No Faktur: ${cleanNoNota})`,
          params.nominal,
          'BON01'
        );

        return {
          record: kasbonRecord,
          tipe: 'PIUTANG_BARANG_NOTA_LALU',
          mitraNama: mitra.nama,
          nominal: params.nominal,
        };
      } else {
        // Dicatat sebagai Titipan Uang / Hasil Bumi Masa Lalu (Kewajiban PT terhadap mitra)
        // Rekening sumber: TIT01 (Virtual Titipan Hasil Bumi / Dana Mitra)
        const noPembelian = generateId('TTL');
        const ketText = params.keterangan
          ? params.keterangan.trim()
          : `Nota Lalu (Titipan Uang / Hasil Panen Masa Lalu): ${params.rincianBarang ? params.rincianBarang.trim() : 'Saldo Titip Hasil Panen Belum Diambil'}`;

        const titipRecord: TransaksiPembelianHasilBumi = {
          noPembelian,
          tanggal: cleanTglNota,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          komoditasKode: 'TITIP_DANA',
          komoditasNama: 'Titipan Dana / Panen Nota Lalu',
          beratKotor: 0,
          potonganRafaksi: 0,
          beratBersih: 0,
          hargaPerKg: 0,
          totalNominal: params.nominal,
          metodePembayaran: 'TITIP',
          rekeningSumber: 'TIT01',
          status: 'TITIP',
          fotoNota: params.fotoNota || '',
          driveFileUrl: params.driveFileUrl || '',
          driveFileId: params.driveFileId || '',
          driveFolderPath: params.driveFolderPath || 'NOTA LALU / HUTANG NOTA LAMA',
          isNotaLalu: true,
          noNotaLalu: cleanNoNota,
          tanggalNotaLalu: cleanTglNota,
          keterangan: ketText,
          createdAt: iso,
        };

        db.pembelianHasilBumi.unshift(titipRecord);

        this.addAuditLog(
          db,
          'CREATE',
          noPembelian,
          `Input Titipan Uang / Hasil Panen Nota Lalu untuk ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString('id-ID')} (No Faktur: ${cleanNoNota})`,
          params.nominal,
          'TIT01'
        );

        return {
          record: titipRecord,
          tipe: 'TITIP_UANG_NOTA_LALU',
          mitraNama: mitra.nama,
          nominal: params.nominal,
        };
      }
    });
  }

  // ==========================================
  // 4. BAYAR BON (FITUR BARU D)
  // Pelunasan seluruh atau sebagian bon mitra (Kasbon Barang + Kasbon Uang)
  // ==========================================
  public static async processBayarBon(params: {
    idMitra: string;
    nominalBayar: number;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningTujuan?: string;
    keterangan?: string;
  }): Promise<TransaksiBayarBon> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      if (!params.nominalBayar || params.nominalBayar <= 0) {
        throw new Error('Nominal pembayaran bon harus lebih dari Rp 0');
      }

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Mitra tidak ditemukan');

      // Ambil seluruh kewajiban bon mitra yang outstanding
      // 1. Kasbon Barang
      const outstandingPenjualan = db.penjualan.filter(
        (p) => p.idMitra === mitra.id && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR' && p.sisaPiutang > 0
      );
      const totalKasbonBarang = outstandingPenjualan.reduce((s, p) => s + p.sisaPiutang, 0);

      // 2. Kasbon Uang
      const outstandingKasbonUang = db.kasbonUang.filter(
        (k) => k.idMitra === mitra.id && k.status !== 'LUNAS' && k.sisaKasbon > 0
      );
      const totalKasbonUang = outstandingKasbonUang.reduce((s, k) => s + k.sisaKasbon, 0);

      const totalBonSebelum = totalKasbonBarang + totalKasbonUang;

      if (totalBonSebelum <= 0) {
        throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon yang harus dibayar saat ini`);
      }

      if (params.nominalBayar > totalBonSebelum) {
        throw new Error(
          `Nominal pembayaran (Rp ${params.nominalBayar.toLocaleString(
            'id-ID'
          )}) melebihi total bon keseluruhan mitra (Rp ${totalBonSebelum.toLocaleString('id-ID')})`
        );
      }

      // Validasi Rekening Tujuan Uang Masuk
      let rekeningTujuanKode = '';
      if (params.metode === 'TUNAI') {
        rekeningTujuanKode = 'KAS01';
      } else if (params.metode === 'TRANSFER') {
        if (!params.rekeningTujuan) {
          throw new Error('User wajib memilih rekening bank perusahaan penampung setoran');
        }
        rekeningTujuanKode = params.rekeningTujuan;
      }

      if (rekeningTujuanKode === 'BON01' || rekeningTujuanKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 tidak dapat dijadikan rekening tujuan pembayaran!');
      }

      const rekeningTujuan = db.rekening.find((r) => r.kode === rekeningTujuanKode);
      if (!rekeningTujuan) {
        throw new Error(`Rekening ${rekeningTujuanKode} tidak ditemukan`);
      }
      if (rekeningTujuan.status !== 'AKTIF') {
        throw new Error(`Rekening ${rekeningTujuan.nama} tidak aktif`);
      }

      // Tambahkan saldo rekening penerima
      rekeningTujuan.saldoSaatIni += params.nominalBayar;

      // Alokasi pembayaran konsisten (FIFO: urutan transaksi lama ke baru)
      // Gabungkan semua bon outstanding dengan tanggal createdAt
      type BonItem = {
        jenis: 'KASBON_BARANG' | 'KASBON_UANG';
        refId: string;
        sisa: number;
        createdAt: string;
        sourceObj: TransaksiPenjualan | TransaksiKasbonUang;
      };

      const allBons: BonItem[] = [
        ...outstandingPenjualan.map((p) => ({
          jenis: 'KASBON_BARANG' as const,
          refId: p.noPenjualan,
          sisa: p.sisaPiutang,
          createdAt: p.createdAt,
          sourceObj: p,
        })),
        ...outstandingKasbonUang.map((k) => ({
          jenis: 'KASBON_UANG' as const,
          refId: k.idTransaksi,
          sisa: k.sisaKasbon,
          createdAt: k.createdAt,
          sourceObj: k,
        })),
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let remainingPayment = params.nominalBayar;
      const alokasiList: AlokasiPembayaranBon[] = [];

      for (const bon of allBons) {
        if (remainingPayment <= 0) break;

        const nominalSebelum = bon.sisa;
        const alokasiNominal = Math.min(remainingPayment, nominalSebelum);
        const nominalSisa = nominalSebelum - alokasiNominal;

        if (bon.jenis === 'KASBON_BARANG') {
          const pj = bon.sourceObj as TransaksiPenjualan;
          pj.sisaPiutang = nominalSisa;
          if (nominalSisa === 0) {
            pj.statusPembayaran = 'LUNAS';
          }
        } else {
          const kbu = bon.sourceObj as TransaksiKasbonUang;
          kbu.sisaKasbon = nominalSisa;
          if (nominalSisa === 0) {
            kbu.status = 'LUNAS';
          } else {
            kbu.status = 'SEBAGIAN';
          }
        }

        alokasiList.push({
          jenis: bon.jenis,
          refId: bon.refId,
          nominalSebelum,
          nominalDibayar: alokasiNominal,
          nominalSisa,
        });

        remainingPayment -= alokasiNominal;
      }

      const sisaBonSetelah = totalBonSebelum - params.nominalBayar;
      const idTransaksi = generateId('BYB');

      const bayarBonRecord: TransaksiBayarBon = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        totalBonSebelum,
        nominalBayar: params.nominalBayar,
        sisaBonSetelah,
        metode: params.metode,
        rekeningTujuan: rekeningTujuan.kode,
        alokasi: alokasiList,
        keterangan: params.keterangan || `Pembayaran Bon ${mitra.nama} ke ${rekeningTujuan.nama}`,
        createdAt: iso,
      };

      db.bayarBon.unshift(bayarBonRecord);

      this.addAuditLog(
        db,
        'PAYMENT',
        idTransaksi,
        `Pembayaran Bon oleh ${mitra.nama}: Rp ${params.nominalBayar.toLocaleString(
          'id-ID'
        )} masuk ke ${rekeningTujuan.nama}. Sisa kewajiban bon: Rp ${sisaBonSetelah.toLocaleString('id-ID')}`,
        params.nominalBayar,
        rekeningTujuan.kode
      );

      return bayarBonRecord;
    });
  }

  // ==========================================
  // 5. TRANSFER ANTAR REKENING PERUSAHAAN (FITUR BARU E)
  // Perpindahan dana internal antar rekening perusahaan
  // ==========================================
  public static async processTransferRekening(params: {
    rekeningSumber: string;
    rekeningTujuan: string;
    nominal: number;
    keterangan: string;
  }): Promise<TransaksiTransferRekening> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Validasi rekening sumber & tujuan
      if (!params.rekeningSumber || !params.rekeningTujuan) {
        throw new Error('Rekening sumber dan rekening tujuan wajib diisi');
      }

      if (params.rekeningSumber === params.rekeningTujuan) {
        throw new Error('Rekening sumber dan rekening tujuan tidak boleh sama');
      }

      // Validasi BON01 dan TIT01 tidak boleh digunakan
      if (
        params.rekeningSumber === 'BON01' ||
        params.rekeningSumber === 'TIT01' ||
        params.rekeningTujuan === 'BON01' ||
        params.rekeningTujuan === 'TIT01'
      ) {
        throw new Error('Rekening BON01 dan TIT01 TIDAK BOLEH digunakan untuk transfer antar rekening perusahaan!');
      }

      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal transfer harus lebih dari Rp 0');
      }

      const sumberAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (!sumberAcc) {
        throw new Error(`Rekening sumber ${params.rekeningSumber} tidak ditemukan`);
      }
      if (sumberAcc.status !== 'AKTIF') {
        throw new Error(`Rekening sumber ${sumberAcc.nama} tidak aktif`);
      }

      const tujuanAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
      if (!tujuanAcc) {
        throw new Error(`Rekening tujuan ${params.rekeningTujuan} tidak ditemukan`);
      }
      if (tujuanAcc.status !== 'AKTIF') {
        throw new Error(`Rekening tujuan ${tujuanAcc.nama} tidak aktif`);
      }

      // Validasi saldo sumber mencukupi
      if (sumberAcc.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening sumber ${sumberAcc.nama} (${sumberAcc.kode}) tidak mencukupi! Saldo saat ini: Rp ${sumberAcc.saldoSaatIni.toLocaleString(
            'id-ID'
          )}, nominal transfer: Rp ${params.nominal.toLocaleString('id-ID')}`
        );
      }

      // Pindahkan saldo: sumber - nominal, tujuan + nominal
      sumberAcc.saldoSaatIni -= params.nominal;
      tujuanAcc.saldoSaatIni += params.nominal;

      const noTransfer = generateId('TRF');
      const transferRecord: TransaksiTransferRekening = {
        noTransfer,
        tanggal,
        jam,
        rekeningSumber: sumberAcc.kode,
        rekeningTujuan: tujuanAcc.kode,
        nominal: params.nominal,
        keterangan: params.keterangan || 'Pemindahan dana operasional internal',
        status: 'BERHASIL',
        createdAt: iso,
      };

      db.transferRekening.unshift(transferRecord);

      this.addAuditLog(
        db,
        'TRANSFER',
        noTransfer,
        `Transfer Antar Rekening: ${sumberAcc.nama} (${sumberAcc.kode}) -> ${tujuanAcc.nama} (${tujuanAcc.kode}) sebesar Rp ${params.nominal.toLocaleString(
          'id-ID'
        )}. Ket: ${transferRecord.keterangan}`,
        params.nominal,
        `${sumberAcc.kode} -> ${tujuanAcc.kode}`
      );

      return transferRecord;
    });
  }

  // ==========================================
  // PENGGAJIAN KARYAWAN & POTONG KASBON (HARIAN & BULANAN DENGAN DIVISI)
  // ==========================================
  private static readonly DIVISI_REKENING_MAP: Record<string, string> = {
    'Gudang Wijaya Agro': 'REK-GWA',
    'Wijaya Karya': 'REK-WK',
    'Wijaya Transport': 'REK-WT',
    'CV Wijaya Agro': 'REK-CVA',
    'PT Wijaya Agro Perkasa': 'REK-WAP',
    'Okussa': 'REK-OKU',
  };

  public static async processPenggajian(params: {
    idKaryawan: string;
    divisi?: NamaDivisi;
    tipeGaji?: 'HARIAN' | 'BULANAN';
    tanggalKerja?: string;
    periodeBulan?: string;
    gajiNominal?: number; // Manual input nominal upah harian / gaji pokok
    bonus?: number;       // Lembur, insentif, uang makan
    persentasePotongKasbon?: number; // e.g. 100, 50, 25, 0 atau custom
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string; // e.g. Rekening Divisi atau Kas Utama
    keterangan?: string;
  }): Promise<TransaksiPenggajian> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) {
        throw new Error(`Karyawan dengan ID ${params.idKaryawan} tidak ditemukan`);
      }
      if (kry.status !== 'AKTIF') {
        throw new Error(`Karyawan ${kry.nama} berstatus nonaktif`);
      }

      // Validasi Divisi yang ditugaskan hari ini
      const divisi: NamaDivisi = params.divisi || 'Gudang Wijaya Agro';
      const tipeGaji: 'HARIAN' | 'BULANAN' = params.tipeGaji || 'HARIAN';
      const targetTanggal = params.tanggalKerja || tanggal;

      // Tentukan rekening sumber default (utamakan rekening khusus divisi jika tidak dipilih)
      let rekKode = params.rekeningSumber;
      if (!rekKode) {
        rekKode = TransactionService.DIVISI_REKENING_MAP[divisi] || 'KAS01';
      }

      if (rekKode === 'BON01' || rekKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 DILARANG digunakan untuk pembayaran gaji!');
      }

      let rekSumber = db.rekening.find((r) => r.kode === rekKode);
      if (!rekSumber) {
        // Fallback to KAS01 jika rekening divisi belum ada
        rekSumber = db.rekening.find((r) => r.kode === 'KAS01') || db.rekening[0];
      }
      if (rekSumber.status !== 'AKTIF') {
        throw new Error(`Rekening ${rekSumber.nama} tidak aktif`);
      }

      // Upah manual yang diinput kasir
      const upahManual =
        params.gajiNominal !== undefined && params.gajiNominal !== null
          ? Math.max(0, Number(params.gajiNominal))
          : (kry.gajiPokok || 0);

      const tunjangan = tipeGaji === 'BULANAN' ? (kry.tunjanganTetap || 0) : 0;
      const bonus = Math.max(0, Number(params.bonus) || 0);
      const totalGajiKotor = upahManual + tunjangan + bonus;

      if (totalGajiKotor <= 0) {
        throw new Error('Total gaji/upah harian harus lebih dari Rp 0');
      }

      // Find linked mitra to calculate current total outstanding bon
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const outstandingKasbonBarang = db.penjualan
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

      const outstandingKasbonUang = db.kasbonUang
        .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;

      // Calculate potongan kasbon
      let potonganKasbon = 0;
      const persentase = Number(params.persentasePotongKasbon) || 0;
      if (params.nominalPotongKustom !== undefined && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalGajiKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        const calculated = Math.round((totalKasbonAwal * persentase) / 100);
        potonganKasbon = Math.min(calculated, totalKasbonAwal, totalGajiKotor);
      }

      const gajiBersihDibayar = totalGajiKotor - potonganKasbon;

      if (rekSumber.saldoSaatIni < gajiBersihDibayar) {
        throw new Error(
          `Saldo rekening ${rekSumber.nama} (Rp ${rekSumber.saldoSaatIni.toLocaleString(
            'id-ID'
          )}) tidak mencukupi untuk pembayaran gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
        );
      }

      let idBayarBonTerkait: string | undefined;

      // Settle kasbon if deduction > 0
      if (potonganKasbon > 0) {
        let remainingToSettle = potonganKasbon;
        const alokasiList: AlokasiPembayaranBon[] = [];

        // 1. Settle Kasbon Uang first
        const unpaidKasbonUang = db.kasbonUang.filter(
          (k) => k.idMitra === mitraId && k.status !== 'LUNAS'
        );
        for (const kbu of unpaidKasbonUang) {
          if (remainingToSettle <= 0) break;
          const sisa = kbu.sisaKasbon;
          const settled = Math.min(remainingToSettle, sisa);
          kbu.sisaKasbon = sisa - settled;
          kbu.status = kbu.sisaKasbon === 0 ? 'LUNAS' : 'SEBAGIAN';

          alokasiList.push({
            jenis: 'KASBON_UANG',
            refId: kbu.idTransaksi,
            nominalSebelum: sisa,
            nominalDibayar: settled,
            nominalSisa: kbu.sisaKasbon,
          });
          remainingToSettle -= settled;
        }

        // 2. Settle Kasbon Barang
        if (remainingToSettle > 0) {
          const unpaidPenjualan = db.penjualan.filter(
            (p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR'
          );
          for (const pj of unpaidPenjualan) {
            if (remainingToSettle <= 0) break;
            const sisa = pj.sisaPiutang;
            const settled = Math.min(remainingToSettle, sisa);
            pj.sisaPiutang = sisa - settled;
            if (pj.sisaPiutang === 0) {
              pj.statusPembayaran = 'LUNAS';
            }
            alokasiList.push({
              jenis: 'KASBON_BARANG',
              refId: pj.noPenjualan,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: pj.sisaPiutang,
            });
            remainingToSettle -= settled;
          }
        }

        const idBYB = generateId('BYB');
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          idTransaksi: idBYB,
          tanggal: targetTanggal,
          jam,
          idMitra: mitraId,
          namaMitra: `${kry.nama} (Karyawan)`,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: 'TUNAI',
          rekeningTujuan: rekSumber.kode,
          alokasi: alokasiList,
          keterangan: `Potong Gaji ${tipeGaji === 'HARIAN' ? 'Harian' : 'Bulanan'} [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso,
        });
      }

      // Potong saldo rekening sumber
      rekSumber.saldoSaatIni -= gajiBersihDibayar;

      const sisaKasbonAkhir = totalKasbonAwal - potonganKasbon;
      const idPayroll = generateId('GAJI');
      const slipNomor = `SLIP/WA/${targetTanggal.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

      const periodeFormatted =
        params.periodeBulan ||
        (tipeGaji === 'HARIAN' ? `Harian - ${targetTanggal}` : `Bulanan - ${targetTanggal.slice(3)}`);

      const payrollRecord: TransaksiPenggajian = {
        id: idPayroll,
        slipNomor,
        tanggal: targetTanggal,
        jam,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisi,
        tipeGaji,
        periodeBulan: periodeFormatted,
        gajiPokok: upahManual,
        tunjangan,
        bonus,
        totalGajiKotor,
        totalKasbonAwal,
        persentasePotongKasbon: persentase,
        potonganKasbon,
        sisaKasbonAkhir,
        gajiBersihDibayar,
        metodePembayaran: params.metodePembayaran || 'TUNAI',
        rekeningSumber: rekSumber.kode,
        keterangan: params.keterangan || `Gaji ${tipeGaji === 'HARIAN' ? 'Harian' : 'Bulanan'} Divisi ${divisi} - ${kry.nama}`,
        idBayarBonTerkait,
      };

      db.penggajian.unshift(payrollRecord);

      this.addAuditLog(
        db,
        'PAYROLL',
        idPayroll,
        `Penggajian ${tipeGaji} [Divisi: ${divisi}] Karyawan ${kry.nama} (${kry.nik}): Upah Kotor Rp ${totalGajiKotor.toLocaleString('id-ID')}, Potong Bon Rp ${potonganKasbon.toLocaleString('id-ID')} (Sisa Bon Rp ${sisaKasbonAkhir.toLocaleString('id-ID')}), Gaji Bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${rekSumber.nama} (${rekSumber.kode})`,
        gajiBersihDibayar,
        rekSumber.kode
      );

      return payrollRecord;
    });
  }

  /**
   * Process Batch Penggajian Harian (Multi-Karyawan Sekaligus)
   */
  public static async processBatchPenggajianHarian(batchData: {
    tanggalKerja: string;
    items: Array<{
      idKaryawan: string;
      divisi: NamaDivisi;
      gajiNominal: number;
      bonus?: number;
      persentasePotongKasbon?: number;
      nominalPotongKustom?: number;
      rekeningSumber?: string;
      keterangan?: string;
    }>;
  }): Promise<TransaksiPenggajian[]> {
    const results: TransaksiPenggajian[] = [];
    for (const item of batchData.items) {
      const res = await this.processPenggajian({
        idKaryawan: item.idKaryawan,
        divisi: item.divisi,
        tipeGaji: 'HARIAN',
        tanggalKerja: batchData.tanggalKerja,
        gajiNominal: item.gajiNominal,
        bonus: item.bonus,
        persentasePotongKasbon: item.persentasePotongKasbon || 0,
        nominalPotongKustom: item.nominalPotongKustom,
        rekeningSumber: item.rekeningSumber,
        keterangan: item.keterangan,
      });
      results.push(res);
    }
    return results;
  }

  /**
   * Catat / Input Pekerjaan Harian Karyawan
   * Admin bisa memilih divisi, menentukan hari ini kerja untuk apa, dan nominal upah fleksibel/dinamis
   */
  public static async recordKerjaHarian(params: {
    idKaryawan: string;
    tanggalKerja?: string;
    hariTanggal?: string;
    divisi: NamaDivisi;
    divisiKode?: string;
    kategori?: string;
    rekening?: string;
    jenisDana?: string;
    item?: string;
    kuantiti?: number;
    harga?: number;
    jumlah?: number;
    ket?: 'BON' | 'LUNAS';
    catatan?: string;
    noInv?: string;
    tugasPekerjaan?: string; // "hari ini kerja untuk apa"
    upahHarian?: number;     // manual / dinamis tidak baku
    uangMakanLembur?: number;
    modeBayar: 'CATAT_HAK_UPAH' | 'LANGSUNG_CAIR';
    rekeningSumber?: string;
    persentasePotongKasbon?: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
  }): Promise<{ catatan: CatatanUpahHarian; slipGaji?: TransaksiPenggajian }> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) throw new Error(`Karyawan dengan ID ${params.idKaryawan} tidak ditemukan`);
      if (kry.status !== 'AKTIF') throw new Error(`Karyawan ${kry.nama} berstatus nonaktif`);

      const tglKerja = params.tanggalKerja || tanggal;
      const kuantiti = params.kuantiti !== undefined ? Number(params.kuantiti) : 1;
      const harga = params.harga !== undefined ? Number(params.harga) : (Number(params.upahHarian) || 0);
      const uangMakan = Math.max(0, Number(params.uangMakanLembur) || 0);
      const hitungJumlah = params.jumlah !== undefined ? Number(params.jumlah) : (kuantiti * harga);
      const totalUpah = hitungJumlah + uangMakan;

      const isLangsungCair = params.modeBayar === 'LANGSUNG_CAIR';
      if (isLangsungCair && totalUpah <= 0) {
        throw new Error('Nominal upah kerja harian untuk pencairan langsung harus lebih dari Rp 0');
      }

      const itemNama = params.item || params.tugasPekerjaan || 'KERJA GUDANG';
      const idUph = generateId('UPH');

      let slipGaji: TransaksiPenggajian | undefined;

      if (isLangsungCair) {
        const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
        const outstandingKasbonBarang = (db.penjualan || [])
          .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
          .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
        const outstandingKasbonUang = (db.kasbonUang || [])
          .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
          .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
        const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;

        let potonganKasbon = 0;
        const persentase = Number(params.persentasePotongKasbon) || 0;
        if (params.nominalPotongKustom && params.nominalPotongKustom > 0) {
          potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpah);
        } else if (persentase > 0 && totalKasbonAwal > 0) {
          potonganKasbon = Math.min(Math.round((totalKasbonAwal * persentase) / 100), totalKasbonAwal, totalUpah);
        }

        const gajiBersihDibayar = totalUpah - potonganKasbon;
        const rekKode = params.rekeningSumber || TransactionService.DIVISI_REKENING_MAP[params.divisi] || 'KAS01';
        let rekSumber = db.rekening.find((r) => r.kode === rekKode) || db.rekening.find((r) => r.kode === 'KAS01') || db.rekening[0];

        if (rekSumber.saldoSaatIni < gajiBersihDibayar) {
          throw new Error(
            `Saldo rekening ${rekSumber.nama} tidak mencukupi untuk pembayaran upah bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
          );
        }

        let idBayarBonTerkait: string | undefined;
        if (potonganKasbon > 0) {
          let remaining = potonganKasbon;
          const alokasiList: AlokasiPembayaranBon[] = [];
          // 1. Settle Kasbon Uang
          const unpaidUang = db.kasbonUang.filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS');
          for (const kbu of unpaidUang) {
            if (remaining <= 0) break;
            const sisa = kbu.sisaKasbon;
            const settled = Math.min(remaining, sisa);
            kbu.sisaKasbon = sisa - settled;
            kbu.status = kbu.sisaKasbon === 0 ? 'LUNAS' : 'SEBAGIAN';
            alokasiList.push({
              jenis: 'KASBON_UANG',
              refId: kbu.idTransaksi,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: kbu.sisaKasbon,
            });
            remaining -= settled;
          }
          // 2. Settle Kasbon Barang
          if (remaining > 0) {
            const unpaidBarang = db.penjualan.filter(
              (p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR'
            );
            for (const pj of unpaidBarang) {
              if (remaining <= 0) break;
              const sisa = pj.sisaPiutang;
              const settled = Math.min(remaining, sisa);
              pj.sisaPiutang = sisa - settled;
              if (pj.sisaPiutang === 0) pj.statusPembayaran = 'LUNAS';
              alokasiList.push({
                jenis: 'KASBON_BARANG',
                refId: pj.noPenjualan,
                nominalSebelum: sisa,
                nominalDibayar: settled,
                nominalSisa: pj.sisaPiutang,
              });
              remaining -= settled;
            }
          }
          const idBYB = generateId('BYB');
          idBayarBonTerkait = idBYB;
          db.bayarBon.unshift({
            idTransaksi: idBYB,
            tanggal: tglKerja,
            jam,
            idMitra: mitraId,
            namaMitra: `${kry.nama} (Karyawan)`,
            totalBonSebelum: totalKasbonAwal,
            nominalBayar: potonganKasbon,
            sisaBonSetelah: totalKasbonAwal - potonganKasbon,
            metode: 'TUNAI',
            rekeningTujuan: rekSumber.kode,
            alokasi: alokasiList,
            keterangan: `Potong Upah Harian [${params.divisi}] Karyawan ${kry.nama}`,
            createdAt: iso,
          });
        }

        rekSumber.saldoSaatIni -= gajiBersihDibayar;
        const idPayroll = generateId('GAJI');
        const slipNomor = `SLIP/WA/${tglKerja.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

        slipGaji = {
          id: idPayroll,
          slipNomor,
          tanggal: tglKerja,
          jam,
          idKaryawan: kry.id,
          nikKaryawan: kry.nik,
          namaKaryawan: kry.nama,
          jabatan: kry.jabatan,
          departemen: kry.departemen,
          divisi: params.divisi,
          tipeGaji: 'HARIAN',
          periodeBulan: `Harian - ${tglKerja}`,
          gajiPokok: hitungJumlah,
          tunjangan: 0,
          bonus: uangMakan,
          totalGajiKotor: totalUpah,
          totalKasbonAwal,
          persentasePotongKasbon: persentase,
          potonganKasbon,
          sisaKasbonAkhir: totalKasbonAwal - potonganKasbon,
          gajiBersihDibayar,
          metodePembayaran: params.metodePembayaran || 'TUNAI',
          rekeningSumber: rekSumber.kode,
          keterangan: `Upah Harian [${params.divisi}]: ${params.tugasPekerjaan}`,
          idBayarBonTerkait,
        };

        db.penggajian.unshift(slipGaji);

        this.addAuditLog(
          db,
          'PAYROLL',
          idPayroll,
          `Pencairan Upah Harian [${params.divisi}] ${kry.nama} (${kry.nik}) Tugas: "${params.tugasPekerjaan}". Total Rp ${totalUpah.toLocaleString(
            'id-ID'
          )}, Potong Bon Rp ${potonganKasbon.toLocaleString('id-ID')}, Bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`,
          gajiBersihDibayar,
          rekSumber.kode
        );
      }

      const catatan: CatatanUpahHarian = {
        id: idUph,
        tanggalKerja: tglKerja,
        hariTanggal: params.hariTanggal,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        divisi: params.divisi,
        divisiKode: params.divisiKode,
        kategori: params.kategori || 'KELUAR',
        rekening: params.rekening || 'HUTANG',
        jenisDana: params.jenisDana || 'GAJI',
        item: itemNama,
        kuantiti,
        harga,
        jumlah: hitungJumlah,
        ket: params.ket || (isLangsungCair ? 'LUNAS' : (totalUpah === 0 ? 'LUNAS' : 'BON')),
        catatan: params.catatan || '',
        noInv: params.noInv,
        upahHarian: harga,
        uangMakanLembur: uangMakan,
        totalUpahHarian: totalUpah,
        keterangan: itemNama + (params.catatan ? ` (${params.catatan})` : ''),
        status: isLangsungCair ? 'SUDAH_DIBAYAR' : 'TERCATAT',
        idPayrollSettlement: slipGaji?.id,
        tanggalDibayar: isLangsungCair ? tglKerja : undefined,
        createdAt: iso,
      };

      if (!db.upahHarian) db.upahHarian = [];
      db.upahHarian.unshift(catatan);

      if (!isLangsungCair) {
        this.addAuditLog(
          db,
          'CREATE',
          idUph,
          `Pencatatan Pekerjaan Harian [${params.divisi}] Karyawan ${kry.nama} (${kry.nik}): "${itemNama}". Hak Upah: Rp ${totalUpah.toLocaleString(
            'id-ID'
          )} (Akumulasi Berjalan)`,
          totalUpah
        );
      }

      return { catatan, slipGaji };
    });
  }

  /**
   * Update Catatan Upah Harian (Inline Spreadsheet Edit)
   */
  public static async updateKerjaHarian(
    id: string,
    params: Partial<CatatanUpahHarian>
  ): Promise<CatatanUpahHarian> {
    return await dbManager.executeTransaction((db) => {
      const index = (db.upahHarian || []).findIndex((u) => u.id === id);
      if (index === -1) throw new Error('Catatan upah harian tidak ditemukan');
      const item = db.upahHarian[index];
      const kuantiti = params.kuantiti !== undefined ? Number(params.kuantiti) : (item.kuantiti ?? 1);
      const harga = params.harga !== undefined ? Number(params.harga) : (item.harga ?? item.upahHarian);
      const hitungJumlah = params.jumlah !== undefined ? Number(params.jumlah) : (kuantiti * harga);

      const updated: CatatanUpahHarian = {
        ...item,
        ...params,
        kuantiti,
        harga,
        jumlah: hitungJumlah,
        upahHarian: harga,
        totalUpahHarian: hitungJumlah,
        status: params.ket === 'LUNAS' ? 'SUDAH_DIBAYAR' : (hitungJumlah === 0 ? 'SUDAH_DIBAYAR' : 'TERCATAT'),
      };
      db.upahHarian[index] = updated;
      return updated;
    });
  }

  /**
   * Hapus Baris Catatan Upah Harian
   */
  public static async deleteKerjaHarian(id: string): Promise<boolean> {
    return await dbManager.executeTransaction((db) => {
      const index = (db.upahHarian || []).findIndex((u) => u.id === id);
      if (index === -1) throw new Error('Catatan upah harian tidak ditemukan');
      db.upahHarian.splice(index, 1);
      return true;
    });
  }

  /**
   * Rekap Master Karyawan: Hak Upah Harian Berjalan vs Bon Karyawan (Barang + Uang)
   */
  public static getRekapMasterKaryawan(): RekapMasterKaryawanSummary {
    const db = dbManager.get();

    let totalHakUpahBelumDibayar = 0;
    let totalBonKaryawan = 0;
    let karyawanDenganUpahPendingCount = 0;
    let karyawanDenganBonCount = 0;

    const items: RekapKaryawanItem[] = (db.karyawan || []).map((kry) => {
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;

      // 1. Kasbon barang dari penjualan toko
      const kasbonBarang = (db.penjualan || [])
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

      // 2. Kasbon uang dari kasir kasbon uang
      const kasbonUang = (db.kasbonUang || [])
        .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const totalBon = kasbonBarang + kasbonUang;

      // 3. Hak Upah Harian dari db.upahHarian
      const allUpahKry = (db.upahHarian || []).filter((u) => u.idKaryawan === kry.id);
      const totalHariKerja = allUpahKry.length;
      const totalHakUpahHarian = allUpahKry.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const upahBelumDibayar = allUpahKry
        .filter((u) => u.status === 'TERCATAT')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const upahSudahDibayar = allUpahKry
        .filter((u) => u.status === 'SUDAH_DIBAYAR')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const lastJob = allUpahKry[0];
      const divisiTerakhir = lastJob ? lastJob.divisi : ('Gudang Wijaya Agro' as NamaDivisi);

      // Posisi Bersih: Hak Upah Belum Dibayar - Total Bon
      const saldoBersih = upahBelumDibayar - totalBon;
      let posisiStatus: 'PERUSAHAAN_BERHUTANG_UPAH' | 'KARYAWAN_BERHUTANG_BON' | 'LUNAS_IMPAS' = 'LUNAS_IMPAS';
      if (saldoBersih > 0) {
        posisiStatus = 'PERUSAHAAN_BERHUTANG_UPAH';
      } else if (saldoBersih < 0) {
        posisiStatus = 'KARYAWAN_BERHUTANG_BON';
      }

      totalHakUpahBelumDibayar += upahBelumDibayar;
      totalBonKaryawan += totalBon;
      if (upahBelumDibayar > 0) karyawanDenganUpahPendingCount++;
      if (totalBon > 0) karyawanDenganBonCount++;

      return {
        id: kry.id,
        nik: kry.nik,
        nama: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        telepon: kry.telepon,
        alamat: kry.alamat,
        status: kry.status,
        divisiTerakhir,
        standarGajiPokok: kry.gajiPokok,
        tunjanganTetap: kry.tunjanganTetap,
        totalHariKerja,
        totalHakUpahHarian,
        totalUpahBelumDibayar: upahBelumDibayar,
        totalUpahSudahDibayar: upahSudahDibayar,
        totalKasbonBarang: kasbonBarang,
        totalKasbonUang: kasbonUang,
        totalBonKaryawan: totalBon,
        saldoBersih,
        posisiStatus,
        pekerjaanHarianTerakhir: lastJob?.keterangan || `Tugas di ${divisiTerakhir}`,
        tanggalKerjaTerakhir: lastJob?.tanggalKerja || kry.tanggalMasuk,
        idMitraTerkait: mitraId,
      };
    });

    return {
      totalKaryawan: (db.karyawan || []).length,
      totalHakUpahBelumDibayar,
      totalBonKaryawan,
      saldoBersihPenggajian: totalHakUpahBelumDibayar - totalBonKaryawan,
      karyawanDenganUpahPendingCount,
      karyawanDenganBonCount,
      items,
    };
  }

  /**
   * Detail Pekerjaan Harian Karyawan & Mutasi Bon
   */
  public static getDetailHarianKaryawan(idKaryawan: string): DetailHarianKaryawanResponse {
    const rekap = this.getRekapMasterKaryawan();
    const item = rekap.items.find((k) => k.id === idKaryawan);
    if (!item) throw new Error(`Karyawan dengan ID ${idKaryawan} tidak ditemukan`);

    const db = dbManager.get();
    const mitraId = item.idMitraTerkait;

    const logHarian = (db.upahHarian || []).filter((u) => u.idKaryawan === idKaryawan);
    const riwayatGaji = (db.penggajian || []).filter((p) => p.idKaryawan === idKaryawan);
    const riwayatKasbonBarang = (db.penjualan || []).filter(
      (p) => p.idMitra === mitraId && p.metode === 'KASBON'
    );
    const riwayatKasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra === mitraId);
    const riwayatBayarBon = (db.bayarBon || []).filter((b) => b.idMitra === mitraId);

    return {
      karyawan: item,
      logHarian,
      riwayatGaji,
      riwayatKasbonBarang,
      riwayatKasbonUang,
      riwayatBayarBon,
    };
  }

  /**
   * Settlement / Pencairan Hak Upah Karyawan yang Berjalan & Potong Bon
   */
  public static async settleHakUpahKaryawan(params: {
    idKaryawan: string;
    divisi?: NamaDivisi;
    upahHarianIds?: string[];
    rekeningSumber?: string;
    persentasePotongKasbon?: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
    keterangan?: string;
  }): Promise<TransaksiPenggajian> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) throw new Error('Karyawan tidak ditemukan');

      let pendingList = (db.upahHarian || []).filter(
        (u) => u.idKaryawan === kry.id && u.status === 'TERCATAT'
      );
      if (params.upahHarianIds && params.upahHarianIds.length > 0) {
        const idSet = new Set(params.upahHarianIds);
        pendingList = pendingList.filter((u) => idSet.has(u.id));
      }

      if (pendingList.length === 0) {
        throw new Error('Tidak ada hak upah harian berjalan yang belum dibayar');
      }

      const totalUpahKotor = pendingList.reduce((sum, u) => sum + u.totalUpahHarian, 0);
      const divisi: NamaDivisi = params.divisi || pendingList[0].divisi || 'Gudang Wijaya Agro';

      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const outstandingKasbonBarang = (db.penjualan || [])
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const outstandingKasbonUang = (db.kasbonUang || [])
        .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;

      let potonganKasbon = 0;
      const persentase = Number(params.persentasePotongKasbon) || 0;
      if (params.nominalPotongKustom && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpahKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        potonganKasbon = Math.min(Math.round((totalKasbonAwal * persentase) / 100), totalKasbonAwal, totalUpahKotor);
      }

      const gajiBersihDibayar = totalUpahKotor - potonganKasbon;
      const rekKode = params.rekeningSumber || TransactionService.DIVISI_REKENING_MAP[divisi] || 'KAS01';
      let rekSumber = db.rekening.find((r) => r.kode === rekKode) || db.rekening.find((r) => r.kode === 'KAS01') || db.rekening[0];

      if (rekSumber.saldoSaatIni < gajiBersihDibayar) {
        throw new Error(
          `Saldo rekening ${rekSumber.nama} tidak mencukupi untuk pembayaran upah bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
        );
      }

      let idBayarBonTerkait: string | undefined;
      if (potonganKasbon > 0) {
        let remaining = potonganKasbon;
        const alokasiList: AlokasiPembayaranBon[] = [];
        // 1. Settle Kasbon Uang
        const unpaidUang = db.kasbonUang.filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS');
        for (const kbu of unpaidUang) {
          if (remaining <= 0) break;
          const sisa = kbu.sisaKasbon;
          const settled = Math.min(remaining, sisa);
          kbu.sisaKasbon = sisa - settled;
          kbu.status = kbu.sisaKasbon === 0 ? 'LUNAS' : 'SEBAGIAN';
          alokasiList.push({
            jenis: 'KASBON_UANG',
            refId: kbu.idTransaksi,
            nominalSebelum: sisa,
            nominalDibayar: settled,
            nominalSisa: kbu.sisaKasbon,
          });
          remaining -= settled;
        }
        // 2. Settle Kasbon Barang
        if (remaining > 0) {
          const unpaidBarang = db.penjualan.filter(
            (p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR'
          );
          for (const pj of unpaidBarang) {
            if (remaining <= 0) break;
            const sisa = pj.sisaPiutang;
            const settled = Math.min(remaining, sisa);
            pj.sisaPiutang = sisa - settled;
            if (pj.sisaPiutang === 0) pj.statusPembayaran = 'LUNAS';
            alokasiList.push({
              jenis: 'KASBON_BARANG',
              refId: pj.noPenjualan,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: pj.sisaPiutang,
            });
            remaining -= settled;
          }
        }
        const idBYB = generateId('BYB');
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          idTransaksi: idBYB,
          tanggal,
          jam,
          idMitra: mitraId,
          namaMitra: `${kry.nama} (Karyawan)`,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: 'TUNAI',
          rekeningTujuan: rekSumber.kode,
          alokasi: alokasiList,
          keterangan: `Potong Hak Upah Berjalan (${pendingList.length} Hari Kerja) [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso,
        });
      }

      rekSumber.saldoSaatIni -= gajiBersihDibayar;
      const idPayroll = generateId('GAJI');
      const slipNomor = `SLIP/WA/${tanggal.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

      const payrollRecord: TransaksiPenggajian = {
        id: idPayroll,
        slipNomor,
        tanggal,
        jam,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisi,
        tipeGaji: 'HARIAN',
        periodeBulan: `Settlement ${pendingList.length} Hari Kerja - ${tanggal}`,
        gajiPokok: totalUpahKotor,
        tunjangan: 0,
        bonus: 0,
        totalGajiKotor: totalUpahKotor,
        totalKasbonAwal,
        persentasePotongKasbon: persentase,
        potonganKasbon,
        sisaKasbonAkhir: totalKasbonAwal - potonganKasbon,
        gajiBersihDibayar,
        metodePembayaran: params.metodePembayaran || 'TUNAI',
        rekeningSumber: rekSumber.kode,
        keterangan: params.keterangan || `Pencairan ${pendingList.length} Hari Kerja Karyawan ${kry.nama}`,
        idBayarBonTerkait,
      };

      db.penggajian.unshift(payrollRecord);

      for (const u of pendingList) {
        u.status = 'SUDAH_DIBAYAR';
        u.idPayrollSettlement = idPayroll;
        u.tanggalDibayar = tanggal;
      }

      this.addAuditLog(
        db,
        'PAYROLL',
        idPayroll,
        `Settlement Upah Karyawan ${kry.nama} (${kry.nik}) sebanyak ${pendingList.length} hari kerja. Total Upah: Rp ${totalUpahKotor.toLocaleString(
          'id-ID'
        )}, Potong Bon: Rp ${potonganKasbon.toLocaleString('id-ID')}, Bersih Dibayar: Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`,
        gajiBersihDibayar,
        rekSumber.kode
      );

      return payrollRecord;
    });
  }

  /**
   * Rekapitulasi Bulanan Payroll yang Mengakumulasi Upah Harian & Bon Karyawan
   * Mendukung filter bulan, tahun, dan divisi
   */
  public static getRekapBulananPayroll(params?: {
    bulan?: number;
    tahun?: number;
    divisi?: string;
  }): RekapPayrollBulananSummary {
    const db = dbManager.get();
    const { tanggal } = getWIBDateTime();
    const [, currentMonthStr, currentYearStr] = tanggal.split('/');
    const targetBulan = Number(params?.bulan) || Number(currentMonthStr) || 9;
    const targetTahun = Number(params?.tahun) || Number(currentYearStr) || 2026;
    const filterDivisi = params?.divisi && params.divisi !== 'ALL' ? params.divisi : undefined;

    const NAMA_BULAN = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const namaBulanStr = NAMA_BULAN[targetBulan - 1] || `Bulan ${targetBulan}`;
    const periodeBulan = `${namaBulanStr} ${targetTahun}`;

    const items: ItemRekapPayrollBulanan[] = [];
    let totalHariKerja = 0;
    let totalGajiKotor = 0;
    let totalPotonganBon = 0;
    let totalGajiBersihDibayar = 0;
    let totalHakUpahPending = 0;
    let totalSisaBonKaryawan = 0;

    for (const kry of db.karyawan || []) {
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;

      // Filter CatatanUpahHarian for this month
      const allUpahBulanIni = (db.upahHarian || []).filter((u) => {
        if (u.idKaryawan !== kry.id) return false;
        const parts = (u.tanggalKerja || '').split('/');
        if (parts.length < 3) return false;
        const m = Number(parts[1]);
        const y = Number(parts[2]);
        if (m !== targetBulan || y !== targetTahun) return false;
        if (filterDivisi && u.divisi !== filterDivisi) return false;
        return true;
      });

      // Filter Penggajian for this month
      const allGajiBulanIni = (db.penggajian || []).filter((g) => {
        if (g.idKaryawan !== kry.id) return false;
        if (filterDivisi && g.divisi !== filterDivisi) return false;
        const parts = (g.tanggal || '').split('/');
        if (parts.length >= 3) {
          const m = Number(parts[1]);
          const y = Number(parts[2]);
          if (m === targetBulan && y === targetTahun) return true;
        }
        return g.periodeBulan?.toLowerCase().includes(namaBulanStr.toLowerCase());
      });

      // Kasbon Barang Toko (Outstanding)
      const sisaKasbonBarang = (db.penjualan || [])
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

      // Kasbon Uang (Outstanding)
      const sisaKasbonUang = (db.kasbonUang || [])
        .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const sisaBonKaryawan = sisaKasbonBarang + sisaKasbonUang;

      // Accumulate daily stats
      const totalUpahPokok = allUpahBulanIni.reduce((sum, u) => sum + (u.upahHarian || 0), 0);
      const totalUangMakanLembur = allUpahBulanIni.reduce((sum, u) => sum + (u.uangMakanLembur || 0), 0);
      const gajiKotor = allUpahBulanIni.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const hakPending = allUpahBulanIni
        .filter((u) => u.status === 'TERCATAT')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const potongBon = allGajiBulanIni.reduce((sum, g) => sum + (g.potonganKasbon || 0), 0);
      const gajiBersihCair = allGajiBulanIni.reduce((sum, g) => sum + (g.gajiBersihDibayar || 0), 0);

      // Divisions worked
      const divisiCounts: Record<string, number> = {};
      const divisiSet = new Set<NamaDivisi>();
      for (const u of allUpahBulanIni) {
        divisiSet.add(u.divisi);
        divisiCounts[u.divisi] = (divisiCounts[u.divisi] || 0) + 1;
      }
      let divisiUtama: NamaDivisi = 'Gudang Wijaya Agro';
      let maxCount = -1;
      for (const [div, count] of Object.entries(divisiCounts)) {
        if (count > maxCount) {
          maxCount = count;
          divisiUtama = div as NamaDivisi;
        }
      }
      if (divisiSet.size === 0 && kry.departemen) {
        if (kry.departemen.includes('Toko')) divisiUtama = 'CV Wijaya Agro';
        else if (kry.departemen.includes('Transport')) divisiUtama = 'Wijaya Transport';
        else if (kry.departemen.includes('Pabrik') || kry.departemen.includes('Teknik')) divisiUtama = 'Wijaya Karya';
      }

      // Detailed daily records
      const rincianHarian: ItemRincianHarianPayroll[] = allUpahBulanIni.map((u) => ({
        id: u.id,
        tanggal: u.tanggalKerja,
        hariTanggal: u.hariTanggal,
        divisi: u.divisi,
        divisiKode: u.divisiKode,
        item: u.item || u.keterangan || `Tugas di ${u.divisi}`,
        kuantiti: u.kuantiti !== undefined ? u.kuantiti : (u.totalUpahHarian > 0 ? 1 : 0),
        harga: u.harga !== undefined ? u.harga : u.upahHarian,
        jumlah: u.jumlah !== undefined ? u.jumlah : u.totalUpahHarian,
        ket: u.ket || (u.status === 'SUDAH_DIBAYAR' ? 'LUNAS' : (u.totalUpahHarian === 0 ? 'LUNAS' : 'BON')),
        catatan: u.catatan,
        tugas: u.keterangan || u.item || `Tugas harian di ${u.divisi}`,
        upahHarian: u.upahHarian,
        uangMakanLembur: u.uangMakanLembur,
        totalUpah: u.totalUpahHarian,
        status: u.status,
        refSlipGaji: u.idPayrollSettlement,
        tanggalDibayar: u.tanggalDibayar,
      }));

      // Sort chronological
      rincianHarian.sort((a, b) => {
        const [da, ma, ya] = (a.tanggal || '').split('/').map(Number);
        const [db, mb, yb] = (b.tanggal || '').split('/').map(Number);
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      });

      // Kasbon Barang Toko (Semua transaksi penjualan kasbon yang aktif / terjadi di bulan ini)
      const kasbonBarangBulanIni = (db.penjualan || []).filter((p) => {
        if (p.idMitra !== mitraId || p.metode !== 'KASBON') return false;
        const parts = (p.tanggal || '').split('/');
        const matchesMonth = parts.length >= 3 && Number(parts[1]) === targetBulan && Number(parts[2]) === targetTahun;
        return (p.sisaPiutang || 0) > 0 || matchesMonth;
      });

      const rincianBonBarang = kasbonBarangBulanIni.map((p) => ({
        noPenjualan: p.noPenjualan,
        tanggal: p.tanggal,
        jam: p.jam,
        totalNominal: p.totalNominal,
        sisaPiutang: p.sisaPiutang,
        statusPembayaran: p.statusPembayaran,
        keterangan: p.keterangan || 'Kasbon barang toko saprotan',
        items: (p.items || []).map((it) => ({
          kodeProduk: it.kodeProduk,
          namaProduk: it.namaProduk,
          qty: it.qty,
          satuan: it.satuan,
          harga: it.harga,
          subtotal: it.subtotal,
        })),
      }));

      // Kasbon Uang (Semua transaksi kasbon uang yang aktif / terjadi di bulan ini)
      const kasbonUangBulanIni = (db.kasbonUang || []).filter((k) => {
        if (k.idMitra !== mitraId) return false;
        const parts = (k.tanggal || '').split('/');
        const matchesMonth = parts.length >= 3 && Number(parts[1]) === targetBulan && Number(parts[2]) === targetTahun;
        return (k.sisaKasbon || 0) > 0 || matchesMonth;
      });

      const rincianBonUang = kasbonUangBulanIni.map((k) => ({
        idTransaksi: k.idTransaksi,
        tanggal: k.tanggal,
        jam: k.jam,
        nominal: k.nominal,
        sisaKasbon: k.sisaKasbon,
        keterangan: k.keterangan || 'Kasbon pinjaman uang tunai',
        rekeningSumber: k.rekeningSumber,
        status: k.status,
      }));

      const saldoBersih = hakPending - sisaBonKaryawan;
      let posisiStatus: 'PERUSAHAAN_BERHUTANG_UPAH' | 'KARYAWAN_BERHUTANG_BON' | 'LUNAS_IMPAS' = 'LUNAS_IMPAS';
      if (saldoBersih > 0) {
        posisiStatus = 'PERUSAHAAN_BERHUTANG_UPAH';
      } else if (saldoBersih < 0) {
        posisiStatus = 'KARYAWAN_BERHUTANG_BON';
      }

      // Add to overall totals
      totalHariKerja += allUpahBulanIni.length;
      totalGajiKotor += gajiKotor;
      totalPotonganBon += potongBon;
      totalGajiBersihDibayar += gajiBersihCair;
      totalHakUpahPending += hakPending;
      totalSisaBonKaryawan += sisaBonKaryawan;

      items.push({
        idKaryawan: kry.id,
        nik: kry.nik,
        nama: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisiUtama,
        daftarDivisiBekerja: Array.from(divisiSet),
        totalHariKerja: allUpahBulanIni.length,
        totalUpahPokok,
        totalUangMakanLembur,
        totalGajiKotor: gajiKotor,
        totalPotonganBon: potongBon,
        totalGajiBersihDibayar: gajiBersihCair,
        totalHakUpahPending: hakPending,
        sisaKasbonBarang,
        sisaKasbonUang,
        totalSisaBonKaryawan: sisaBonKaryawan,
        saldoBersih,
        posisiStatus,
        rincianHarian,
        rincianBonBarang,
        rincianBonUang,
      });
    }

    return {
      periodeBulan,
      bulan: targetBulan,
      tahun: targetTahun,
      totalPekerja: items.length,
      totalHariKerja,
      totalGajiKotor,
      totalPotonganBon,
      totalGajiBersihDibayar,
      totalHakUpahPending,
      totalSisaBonKaryawan,
      items,
    };
  }

  // ==========================================
  // PERGERAKAN KEUANGAN TIAP DIVISI
  // ==========================================
  public static getPergerakanKeuanganDivisi(): PergerakanKeuanganDivisiSummary[] {
    const db = dbManager.get();

    return DAFTAR_DIVISI.map((div) => {
      const rek = db.rekening.find((r) => r.kode === div.kodeRekening) || {
        kode: div.kodeRekening,
        nama: `Kas Operasional ${div.nama}`,
        atasNama: `Divisi ${div.nama}`,
        nomorRekening: div.id,
        saldoAwal: 0,
        saldoSaatIni: 0,
        status: 'AKTIF' as const,
      };

      // 1. Dropping dana masuk / transfer ke rekening divisi
      const transferMasuk = (db.transferRekening || []).filter(
        (t) => t.rekeningTujuan === div.kodeRekening && t.status === 'BERHASIL'
      );
      const totalDroppingMasuk = transferMasuk.reduce((sum, t) => sum + (t.nominal || 0), 0);

      // 2. Transfer dana keluar dari rekening divisi
      const transferKeluar = (db.transferRekening || []).filter(
        (t) => t.rekeningSumber === div.kodeRekening && t.status === 'BERHASIL'
      );
      const totalTransferKeluar = transferKeluar.reduce((sum, t) => sum + (t.nominal || 0), 0);

      // 3. Gaji karyawan yang bertugas di divisi ini ATAU dibayar dari rekening divisi ini
      const gajiList = (db.penggajian || []).filter(
        (p) => p.divisi === div.nama || p.rekeningSumber === div.kodeRekening
      );
      const totalGajiKeluar = gajiList.reduce((sum, p) => sum + (p.gajiBersihDibayar || 0), 0);

      // Build timeline mutasi gabungan
      const mutasi: MutasiKeuanganDivisi[] = [];

      for (const t of transferMasuk) {
        const dariRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
        mutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: 'DROPPING_MASUK',
          keterangan: `Dropping Kas dari ${dariRek ? dariRek.nama : t.rekeningSumber} (${t.keterangan || 'Operasional'})`,
          masuk: t.nominal,
          keluar: 0,
          saldoSetelah: 0,
          refId: t.noTransfer,
        });
      }

      for (const t of transferKeluar) {
        const keRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
        mutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: 'TRANSFER_KELUAR',
          keterangan: `Transfer Keluar ke ${keRek ? keRek.nama : t.rekeningTujuan} (${t.keterangan || 'Internal'})`,
          masuk: 0,
          keluar: t.nominal,
          saldoSetelah: 0,
          refId: t.noTransfer,
        });
      }

      for (const g of gajiList) {
        mutasi.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          jenis: 'GAJI_KARYAWAN',
          keterangan: `Upah Karyawan: ${g.namaKaryawan} (${g.tipeGaji || 'Harian'}) - Kotor: Rp ${g.totalGajiKotor.toLocaleString('id-ID')}${g.potonganKasbon > 0 ? `, Potong Bon: Rp ${g.potonganKasbon.toLocaleString('id-ID')}` : ''}`,
          masuk: 0,
          keluar: g.gajiBersihDibayar,
          saldoSetelah: 0,
          refId: g.slipNomor,
          karyawanTerkait: g.namaKaryawan,
        });
      }

      // Sort chronological descending
      mutasi.sort((a, b) => {
        const [da, ma, ya] = (a.tanggal || '').split('/').map(Number);
        const [db, mb, yb] = (b.tanggal || '').split('/').map(Number);
        const dateA = new Date(ya || 2026, (ma || 1) - 1, da || 1).getTime();
        const dateB = new Date(yb || 2026, (mb || 1) - 1, db || 1).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return (b.jam || '').localeCompare(a.jam || '');
      });

      const karyawanSet = new Set<string>();
      gajiList.forEach((g) => karyawanSet.add(g.namaKaryawan));

      return {
        divisi: div.nama,
        idDivisi: div.id,
        kodeRekening: div.kodeRekening,
        namaRekening: rek.nama,
        saldoSaatIni: rek.saldoSaatIni,
        totalDroppingMasuk,
        totalGajiKeluar,
        totalTransferKeluar,
        totalTransaksiGaji: gajiList.length,
        daftarKaryawanTerakhir: Array.from(karyawanSet).slice(0, 5),
        mutasi,
      };
    });
  }

  // ==========================================
  // 6. REKENING KORAN MITRA (STATEMENT)
  // ==========================================
  public static getRekeningKoranMitra(idMitra: string): RekeningKoranMitraSummary {
    const db = dbManager.get();
    const mitra = db.mitra.find((m) => m.id === idMitra);
    if (!mitra) throw new Error('Mitra tidak ditemukan');

    // 1. Kasbon Barang
    const kasbonBarangList = db.penjualan.filter((p) => p.idMitra === mitra.id && p.metode === 'KASBON');
    const totalKasbonBarang = kasbonBarangList.reduce((s, p) => s + (p.sisaPiutang || 0), 0);

    // 2. Kasbon Uang
    const kasbonUangList = db.kasbonUang.filter((k) => k.idMitra === mitra.id);
    const totalKasbonUang = kasbonUangList.reduce((s, k) => s + (k.sisaKasbon || 0), 0);

    // 3. Titip Hasil Bumi
    const titipList = db.pembelianHasilBumi.filter(
      (p) => p.idMitra === mitra.id && p.metodePembayaran === 'TITIP' && p.status !== 'LUNAS'
    );
    const totalTitip = titipList.reduce((s, p) => s + p.totalNominal, 0);

    // 4. Pembayaran Bon
    const bayarBonList = db.bayarBon.filter((b) => b.idMitra === mitra.id);
    const totalPembayaranBon = bayarBonList.reduce((s, b) => s + b.nominalBayar, 0);

    const totalBonKeseluruhan = totalKasbonBarang + totalKasbonUang;
    const sisaBon = totalBonKeseluruhan;

    // Timeline ledger transactions
    type TimelineRaw = {
      id: string;
      tanggal: string;
      jam: string;
      createdAt: string;
      jenis: string;
      keterangan: string;
      qtyDisplay: string;
      hargaSatuanDisplay: string;
      itemsDetail?: Array<{ nama: string; qty: number; satuan: string; harga: number; subtotal: number }>;
      debet: number; // Bon bertambah
      kredit: number; // Bon berkurang
      fotoNota?: string;
      isNotaLalu?: boolean;
      noNotaLalu?: string;
    };

    const timeline: TimelineRaw[] = [];

    // All sales to this mitra
    for (const p of db.penjualan.filter((item) => item.idMitra === mitra.id)) {
      const totalQty = p.items.reduce((s, i) => s + i.qty, 0);
      let qtyDisplay = '';
      let hargaSatuanDisplay = '';

      if (p.items.length === 1) {
        qtyDisplay = `${p.items[0].qty} ${p.items[0].satuan}`;
        hargaSatuanDisplay = `Rp ${p.items[0].harga.toLocaleString('id-ID')}`;
      } else if (p.items.length > 1) {
        qtyDisplay = `${totalQty} unit (${p.items.length} macam)`;
        hargaSatuanDisplay = `Ragam (@ Rp ${Math.round(p.totalNominal / (totalQty || 1)).toLocaleString('id-ID')})`;
      } else {
        qtyDisplay = '-';
        hargaSatuanDisplay = '-';
      }

      const itemsDetail = p.items.map((i) => ({
        nama: i.namaProduk,
        qty: i.qty,
        satuan: i.satuan,
        harga: i.harga,
        subtotal: i.subtotal,
      }));

      const rincianText = p.items.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan} @ Rp ${i.harga.toLocaleString('id-ID')})`).join(', ');

      if (p.metode === 'KASBON') {
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis: 'PENJUALAN KASBON',
          keterangan: `Kasbon Barang: ${rincianText}`,
          qtyDisplay,
          hargaSatuanDisplay,
          itemsDetail,
          debet: p.totalNominal,
          kredit: 0,
        });
      } else {
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis: `PENJUALAN ${p.metode}`,
          keterangan: `Penjualan Lunas (${p.metode}) via ${p.rekeningTujuan}: ${rincianText}`,
          qtyDisplay,
          hargaSatuanDisplay,
          itemsDetail,
          debet: 0,
          kredit: 0,
        });
      }
    }

    // Kasbon uang to this mitra (Termasuk Nota Lalu Piutang Barang Masa Lalu)
    for (const k of kasbonUangList) {
      const isNotaLalu = k.isNotaLalu || k.keterangan?.includes('Nota Lalu') || k.rekeningSumber === 'BON01';
      const noNotaLabel = k.noNotaLalu ? ` [No. Nota: ${k.noNotaLalu}]` : '';

      timeline.push({
        id: k.idTransaksi,
        tanggal: k.tanggalNotaLalu || k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        jenis: isNotaLalu ? 'NOTA LALU (PIUTANG BARANG)' : 'KASBON UANG',
        keterangan: isNotaLalu
          ? `${k.keterangan || 'Piutang Nota Barang Masa Lalu'}${noNotaLabel}`
          : `Penerimaan Kasbon Uang via ${k.metode} (${k.rekeningSumber}) - ${k.keterangan}`,
        qtyDisplay: '1',
        hargaSatuanDisplay: `Rp ${k.nominal.toLocaleString('id-ID')}`,
        itemsDetail: [
          {
            nama: isNotaLalu
              ? `Piutang Barang Nota Lalu (${k.noNotaLalu || 'Nota Lama'})`
              : `Kasbon Uang Pinjaman (${k.metode})`,
            qty: 1,
            satuan: 'Trx',
            harga: k.nominal,
            subtotal: k.nominal,
          },
        ],
        debet: k.nominal,
        kredit: 0,
        fotoNota: k.fotoNota,
        isNotaLalu,
        noNotaLalu: k.noNotaLalu,
      });
    }

    // Payments by this mitra
    for (const b of bayarBonList) {
      timeline.push({
        id: b.idTransaksi,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        jenis: 'PEMBAYARAN BON',
        keterangan: `Setoran Bayar Bon via ${b.metode} (${b.rekeningTujuan}) - ${b.keterangan}`,
        qtyDisplay: '1',
        hargaSatuanDisplay: `Rp ${b.nominalBayar.toLocaleString('id-ID')}`,
        itemsDetail: [
          {
            nama: `Setoran Pelunasan Bon (${b.metode})`,
            qty: 1,
            satuan: 'Setoran',
            harga: b.nominalBayar,
            subtotal: b.nominalBayar,
          },
        ],
        debet: 0,
        kredit: b.nominalBayar,
      });
    }

    // Titip pembelian hasil bumi (Termasuk Titipan Uang / Hasil Panen Masa Lalu)
    for (const pb of db.pembelianHasilBumi.filter((item) => item.idMitra === mitra.id)) {
      if (pb.metodePembayaran === 'TITIP') {
        const isNotaLalu = pb.isNotaLalu || pb.keterangan?.includes('Nota Lalu') || pb.komoditasKode === 'TITIP_DANA';
        const noNotaLabel = pb.noNotaLalu ? ` [No. Nota: ${pb.noNotaLalu}]` : '';

        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggalNotaLalu || pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: isNotaLalu ? 'NOTA LALU (TITIPAN UANG/PANEN)' : 'TITIP HASIL BUMI',
          keterangan: isNotaLalu
            ? `${pb.keterangan || 'Titipan Dana / Panen Masa Lalu'}${noNotaLabel}`
            : `Penjualan Hasil Bumi ${pb.komoditasNama} ${pb.beratBersih} kg (Titip/Hutang Pabrik)`,
          qtyDisplay: pb.beratBersih > 0 ? `${pb.beratBersih.toLocaleString('id-ID')} Kg` : '1 (Dana)',
          hargaSatuanDisplay: pb.hargaPerKg > 0 ? `Rp ${pb.hargaPerKg.toLocaleString('id-ID')}` : `Rp ${pb.totalNominal.toLocaleString('id-ID')}`,
          itemsDetail: [
            {
              nama: isNotaLalu
                ? `Titipan Uang / Panen Nota Lalu (${pb.noNotaLalu || 'Nota Titip Lama'})`
                : `Hasil Panen: ${pb.komoditasNama}`,
              qty: pb.beratBersih > 0 ? pb.beratBersih : 1,
              satuan: pb.beratBersih > 0 ? 'Kg' : 'Titip',
              harga: pb.hargaPerKg > 0 ? pb.hargaPerKg : pb.totalNominal,
              subtotal: pb.totalNominal,
            },
          ],
          debet: 0,
          kredit: 0,
          fotoNota: pb.fotoNota,
          isNotaLalu,
          noNotaLalu: pb.noNotaLalu,
        });
      }
    }

    // Sort by createdAt ascending to calculate running balance
    timeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningBon = 0;
    const history = timeline.map((item) => {
      runningBon += item.debet - item.kredit;
      return {
        id: item.id,
        tanggal: item.tanggal,
        jam: item.jam,
        jenis: item.jenis,
        keterangan: item.keterangan,
        qtyDisplay: item.qtyDisplay,
        hargaSatuanDisplay: item.hargaSatuanDisplay,
        itemsDetail: item.itemsDetail,
        debet: item.debet,
        kredit: item.kredit,
        saldoAkumulasi: runningBon,
        fotoNota: item.fotoNota,
        isNotaLalu: item.isNotaLalu,
        noNotaLalu: item.noNotaLalu,
      };
    });

    return {
      idMitra: mitra.id,
      kodeMitra: mitra.kode,
      namaMitra: mitra.nama,
      role: mitra.role,
      telepon: mitra.telepon,
      alamat: mitra.alamat,
      status: mitra.status,
      totalKasbonBarang,
      totalKasbonUang,
      totalTitip,
      totalPembayaranBon,
      totalBonKeseluruhan,
      sisaBon,
      history,
    };
  }

  /**
   * Rekap Master Mitra: Hutang Perusahaan (Titip Panen belum diambil uangnya) & Bon Mitra (Barang + Uang)
   */
  public static getRekapMasterMitra(): RekapMasterMitraSummary {
    const db = dbManager.get();

    let totalHutangPerusahaanKeMitra = 0;
    let totalBonMitra = 0;
    let mitraDenganHutangTitipCount = 0;
    let mitraDenganBonCount = 0;

    const items: RekapMitraItem[] = db.mitra.map((m) => {
      // 1. Kasbon barang
      const kasbonBarang = db.penjualan
        .filter((p) => p.idMitra === m.id && p.metode === 'KASBON')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

      // 2. Kasbon uang
      const kasbonUang = db.kasbonUang
        .filter((k) => k.idMitra === m.id && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const totalBon = kasbonBarang + kasbonUang;

      // 3. Titip hasil bumi belum diambil uangnya (hutang kita ke mitra)
      const titipPanen = db.pembelianHasilBumi
        .filter((pb) => pb.idMitra === m.id && pb.metodePembayaran === 'TITIP' && pb.status !== 'LUNAS')
        .reduce((sum, pb) => sum + pb.totalNominal, 0);

      // Count transactions
      const txCount =
        db.penjualan.filter((p) => p.idMitra === m.id).length +
        db.pembelianHasilBumi.filter((pb) => pb.idMitra === m.id).length +
        db.kasbonUang.filter((k) => k.idMitra === m.id).length +
        db.bayarBon.filter((b) => b.idMitra === m.id).length;

      // Net balance: Titip (Hutang kita ke mitra) - Bon (Hutang mitra ke kita)
      const saldoBersih = titipPanen - totalBon;
      let posisiStatus: 'KITA_BERHUTANG' | 'MITRA_BERHUTANG' | 'LUNAS_IMPAS' = 'LUNAS_IMPAS';
      if (saldoBersih > 0) {
        posisiStatus = 'KITA_BERHUTANG';
      } else if (saldoBersih < 0) {
        posisiStatus = 'MITRA_BERHUTANG';
      }

      totalHutangPerusahaanKeMitra += titipPanen;
      totalBonMitra += totalBon;
      if (titipPanen > 0) mitraDenganHutangTitipCount++;
      if (totalBon > 0) mitraDenganBonCount++;

      return {
        id: m.id,
        kode: m.kode,
        nama: m.nama,
        role: m.role,
        telepon: m.telepon,
        alamat: m.alamat,
        status: m.status,
        catatan: m.catatan,
        totalHutangTitipPanen: titipPanen,
        totalKasbonBarang: kasbonBarang,
        totalKasbonUang: kasbonUang,
        totalBonMitra: totalBon,
        saldoBersih,
        posisiStatus,
        totalTransaksiCount: txCount,
      };
    });

    return {
      totalMitra: db.mitra.length,
      totalHutangPerusahaanKeMitra,
      totalBonMitra,
      saldoBersihKemitraan: totalHutangPerusahaanKeMitra - totalBonMitra,
      mitraDenganHutangTitipCount,
      mitraDenganBonCount,
      items,
    };
  }

  // ==========================================
  // 7. DASHBOARD STATS
  // ==========================================
  public static getDashboardStats() {
    const db = dbManager.get();

    // Total omzet penjualan
    const totalPenjualan = db.penjualan.reduce((s, p) => s + p.totalNominal, 0);

    // Total pembelian hasil bumi
    const totalPembelianHasilBumi = db.pembelianHasilBumi.reduce((s, p) => s + p.totalNominal, 0);

    // Saldo kas & bank ril (tidak termasuk virtual BON01 dan TIT01)
    const realAccounts = db.rekening.filter((r) => !r.isVirtual && r.status === 'AKTIF');
    const totalUangPerusahaan = realAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);

    const kasAccount = db.rekening.find((r) => r.kode === 'KAS01');
    const saldoKas = kasAccount ? kasAccount.saldoSaatIni : 0;

    const bankAccounts = realAccounts.filter((r) => r.kode !== 'KAS01');
    const saldoBank = bankAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);

    // Virtual account values
    const bonAcc = db.rekening.find((r) => r.kode === 'BON01');
    const totalBonOutstanding = bonAcc ? bonAcc.saldoSaatIni : 0;

    const titAcc = db.rekening.find((r) => r.kode === 'TIT01');
    const totalTitipOutstanding = titAcc ? titAcc.saldoSaatIni : 0;

    // Kasbon uang aktif
    const totalKasbonUangAktif = db.kasbonUang
      .filter((k) => k.status !== 'LUNAS')
      .reduce((s, k) => s + (k.sisaKasbon || 0), 0);

    // Nilai persediaan stok barang toko (stok * hargaJual)
    const nilaiStokBarang = db.stokBarang.reduce((s, sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      return s + sb.stok * (prd ? prd.hargaJual : 0);
    }, 0);

    // Total volume stok hasil bumi
    const totalVolumeHasilBumiKg = db.stokHasilBumi.reduce((s, hb) => s + hb.stok, 0);

    // Peringatan stok menipis
    const stokMenipis = db.stokBarang.filter((sb) => sb.stok <= sb.minimum);

    // 10 Transaksi Terakhir (gabungan)
    type RecentTx = {
      id: string;
      tanggal: string;
      jam: string;
      createdAt: string;
      kategori: 'PENJUALAN' | 'PEMBELIAN_HASIL_BUMI' | 'PEMBELIAN_BARANG' | 'KASBON_UANG' | 'BAYAR_BON' | 'TRANSFER_REKENING' | 'PENGGAJIAN';
      label: string;
      nominal: number;
      pihakTerkait: string;
      rekening: string;
      status: string;
      fotoNota?: string;
    };

    const recentTx: RecentTx[] = [];

    if (db.pembelianBarang) {
      for (const pb of db.pembelianBarang.slice(0, 10)) {
        recentTx.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          kategori: 'PEMBELIAN_BARANG',
          label: `Kulakan ${pb.items.map((i) => i.namaProduk).slice(0, 2).join(', ')}`,
          nominal: pb.totalNominal,
          pihakTerkait: pb.namaMitra,
          rekening: pb.rekeningSumber,
          status: pb.status,
          fotoNota: pb.fotoNota,
        });
      }
    }

    for (const p of db.penjualan.slice(0, 10)) {
      recentTx.push({
        id: p.noPenjualan,
        tanggal: p.tanggal,
        jam: p.jam,
        createdAt: p.createdAt,
        kategori: 'PENJUALAN',
        label: `Penjualan ${p.metode}`,
        nominal: p.totalNominal,
        pihakTerkait: p.namaMitra,
        rekening: p.rekeningTujuan,
        status: p.statusPembayaran,
      });
    }

    for (const b of db.pembelianHasilBumi.slice(0, 10)) {
      recentTx.push({
        id: b.noPembelian,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        kategori: 'PEMBELIAN_HASIL_BUMI',
        label: `Beli ${b.komoditasNama} (${b.beratBersih} kg)`,
        nominal: b.totalNominal,
        pihakTerkait: b.namaMitra,
        rekening: b.rekeningSumber,
        status: b.status,
        fotoNota: b.fotoNota,
      });
    }

    for (const k of db.kasbonUang.slice(0, 10)) {
      recentTx.push({
        id: k.idTransaksi,
        tanggal: k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        kategori: 'KASBON_UANG',
        label: `Kasbon Uang (${k.metode})`,
        nominal: k.nominal,
        pihakTerkait: k.namaMitra,
        rekening: k.rekeningSumber,
        status: k.status,
      });
    }

    for (const by of db.bayarBon.slice(0, 10)) {
      recentTx.push({
        id: by.idTransaksi,
        tanggal: by.tanggal,
        jam: by.jam,
        createdAt: by.createdAt,
        kategori: 'BAYAR_BON',
        label: `Bayar Bon (${by.metode})`,
        nominal: by.nominalBayar,
        pihakTerkait: by.namaMitra,
        rekening: by.rekeningTujuan,
        status: 'LUNAS',
      });
    }

    for (const t of db.transferRekening.slice(0, 10)) {
      recentTx.push({
        id: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam,
        createdAt: t.createdAt,
        kategori: 'TRANSFER_REKENING',
        label: `Transfer ${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        pihakTerkait: 'Internal PT Wijaya Agro',
        rekening: `${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        status: t.status,
      });
    }

    if (db.penggajian) {
      for (const g of db.penggajian.slice(0, 10)) {
        recentTx.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          createdAt: `${g.tanggal} ${g.jam}`,
          kategori: 'PENGGAJIAN',
          label: `Gaji ${g.namaKaryawan} (${g.periodeBulan})`,
          nominal: g.gajiBersihDibayar,
          pihakTerkait: g.namaKaryawan,
          rekening: g.rekeningSumber,
          status: 'SELESAI',
        });
      }
    }

    recentTx.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      totalPenjualan,
      totalPembelianHasilBumi,
      totalUangPerusahaan,
      saldoKas,
      saldoBank,
      totalBonOutstanding,
      totalTitipOutstanding,
      totalKasbonUangAktif,
      nilaiStokBarang,
      totalVolumeHasilBumiKg,
      stokMenipis,
      recentTransactions: recentTx.slice(0, 10),
      rekeningList: db.rekening,
    };
  }
}
