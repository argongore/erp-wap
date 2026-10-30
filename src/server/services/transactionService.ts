import { dbManager, getWIBDateTime } from '../db.ts';
import { DAFTAR_DIVISI, isKategoriAlatNonStok, isExcludedFromDivisi } from '../types.ts';
import type {
  AlokasiPembayaranBon,
  AuditLog,
  BukuRekeningKaryawanSummary,
  CatatanUpahHarian,
  ItemPenjualan,
  Mitra,
  MutasiBukuRekeningKaryawan,
  MutasiKeuanganDivisi,
  NamaDivisi,
  Produk,
  Rekening,
  StokBarang,
  StokHasilBumi,
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
  LabaRugiDivisiItem,
  LabaRugiDivisiSummary,
  LabaRugiDivisiTransaksiRingkas,
  LabaRugiProdukItem,
  LabaRugiSummary,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
  RingkasanKomoditasBulananItem,
  RingkasanBulanHasilBumiItem,
  RingkasanStokHasilBumiBulananResponse,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
  ProfilPerusahaan,
  TransaksiPengeluaran,
  TransaksiPencairanTitipan,
  UnifiedTransactionItem,
  RekapSemuaTransaksiResponse,
  KandidatKliringMitra,
  PasanganMitraKembar,
  CatatanCashOpname,
  SmartControlOverviewResponse,
  HasilKliringSilangResponse,
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
   * Helper: Detect whether a Rekening is an Anak Perusahaan / Subsidiary-Mitra account (e.g. DP Parabot)
   */
  private static isAnakPerusahaanRekening(rek?: {
    kode?: string;
    isAnakPerusahaan?: boolean;
    kategori?: string;
  }): boolean {
    if (!rek) return false;
    return Boolean(
      rek.isAnakPerusahaan ||
        rek.kategori === 'ANAK_PERUSAHAAN' ||
        rek.kode === 'REK-DPPARABO'
    );
  }

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
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON' | 'INTERNAL_PT';
    rekeningTujuan?: string;
    divisi?: string;
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

        const cleanKode = String(item.kodeProduk || '').trim().toUpperCase();
        const product = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
        if (!product) {
          throw new Error(`Produk dengan kode ${cleanKode} tidak ditemukan`);
        }
        if (product.status !== 'AKTIF') {
          throw new Error(`Produk ${product.nama} tidak aktif`);
        }

        const isAlatJasa = isKategoriAlatNonStok(product.kategori);
        const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);

        if (!isAlatJasa) {
          if (!stokItem) {
            throw new Error(`Data stok untuk produk ${product.nama} tidak ditemukan`);
          }
          if (stokItem.stok < item.qty) {
            throw new Error(
              `Stok tidak mencukupi untuk "${product.nama}". Stok tersedia: ${stokItem.stok} ${stokItem.satuan}, diminta: ${item.qty} ${stokItem.satuan}`
            );
          }
        }

        // Modal HPP & harga sugesti murni dari modal pembelian & katalog tanpa angka karangan
        const modalHppSatuan = Math.max(0, Number(product.hargaBeli) || 0);
        const baseJualUmum = product.hargaJual && product.hargaJual > 0 ? product.hargaJual : modalHppSatuan;
        const baseJualRekanan =
          product.hargaKhususRekanan && product.hargaKhususRekanan > 0
            ? product.hargaKhususRekanan
            : baseJualUmum;
        const defaultSuggested = tipePembeli === 'REKANAN' ? baseJualRekanan : baseJualUmum;

        const hargaSugesti = item.hargaSugesti !== undefined ? item.hargaSugesti : defaultSuggested;
        const hargaDeal = item.harga !== undefined && item.harga >= 0 ? item.harga : defaultSuggested;

        const subtotal = hargaDeal * item.qty;
        const modalHppItem = modalHppSatuan * item.qty;
        const labaKotorItem = subtotal - modalHppItem;

        totalNominal += subtotal;
        totalModalHpp += modalHppItem;

        processedItems.push({
          kodeProduk: product.kode,
          namaProduk: product.nama,
          satuan: product.satuan,
          qty: item.qty,
          hargaBeli: modalHppSatuan,
          hargaSugesti,
          harga: hargaDeal,
          subtotal,
          labaKotor: labaKotorItem,
        });

        // Deduct stock in DB_STOK only for physical goods (non-ALAT/Jasa)
        if (!isAlatJasa && stokItem) {
          stokItem.stok -= item.qty;
          stokItem.updateTerakhir = iso;
        } else if (stokItem) {
          stokItem.updateTerakhir = iso;
        }
      }

      // Handle Destination Account & Balance update based on method
      let finalRekeningTujuan = '';
      let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' = 'LUNAS';
      let sisaPiutang = 0;

      if (params.metode === 'INTERNAL_PT' || (params.metode as string) === 'INTERNAL') {
        finalRekeningTujuan = 'INTERNAL_PT';
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (params.metode === 'TUNAI') {
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
        if (params.rekeningTujuan === 'KAS01' || params.rekeningTujuan === 'BON01' || params.rekeningTujuan === 'TIT01' || params.rekeningTujuan === 'SINKRON') {
          throw new Error('Pilih rekening bank tujuan transfer yang valid (bukan Kas Tunai / Virtual)');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningTujuan} tidak ditemukan`);
        if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil tempat uang masuk (misal BNI, BCA, BRI, Mandiri).`
          );
        }
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

      const isInternalSale = params.metode === 'INTERNAL_PT' || (params.metode as string) === 'INTERNAL';
      const finalDivisi =
        params.divisi?.trim() || (isInternalSale ? 'PT Wijaya Agro Perkasa' : 'CV Wijaya Agro');
      const totalLabaKotor = totalNominal - totalModalHpp;
      const noPenjualan = generateId('PJ');
      const penjualanRecord: TransaksiPenjualan = {
        noPenjualan,
        tanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        tipePembeli,
        divisi: finalDivisi,
        metode: isInternalSale ? 'INTERNAL_PT' : params.metode,
        rekeningTujuan: finalRekeningTujuan,
        items: processedItems,
        totalModalHpp,
        totalNominal,
        totalLabaKotor,
        statusPembayaran,
        sisaPiutang,
        keterangan:
          params.keterangan ||
          (isInternalSale
            ? `Pemakaian Kebutuhan Internal PT Wijaya Agro (Harga Rp 0)`
            : params.metode === 'KASBON'
            ? `Penjualan Kasbon (${tipePembeli})`
            : `Penjualan Barang Toko (${tipePembeli})`),
        createdAt: iso,
      };

      db.penjualan.unshift(penjualanRecord);

      const logMethodText =
        penjualanRecord.metode === 'INTERNAL_PT' ? 'PEMAKAIAN INTERNAL PT (Rp 0)' : penjualanRecord.metode;
      this.addAuditLog(
        db,
        'CREATE',
        noPenjualan,
        `Penjualan ${logMethodText} [${tipePembeli} | Divisi: ${finalDivisi} | Rek: ${finalRekeningTujuan}] kepada ${finalMitraNama} (${processedItems.length} item) - Omzet: Rp ${totalNominal.toLocaleString('id-ID')}, Modal HPP: Rp ${totalModalHpp.toLocaleString('id-ID')}`,
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
    divisi?: string;
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

      // Jika ada rincian barang (items > 0), WAJIB diproses sebagai pembelian rincian produk agar stok gudang & HPP bertambah!
      const hasValidItems = Array.isArray(params.items) && params.items.length > 0;
      const isRekapan = Boolean(
        !hasValidItems &&
        (params.isRekapanGlobal || (params.totalNominalRekapan && params.totalNominalRekapan > 0))
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
          const cleanKode = String(item.kodeProduk || '').trim().toUpperCase();
          const qtyBeli = Number(item.qty) || 0;
          const modalSatuan = Number(item.hargaBeliSatuan);

          if (!cleanKode) {
            throw new Error('Kode produk pembelian tidak boleh kosong');
          }
          if (qtyBeli <= 0) {
            throw new Error(`Kuantitas untuk produk ${cleanKode} harus lebih dari 0`);
          }
          if (Number.isNaN(modalSatuan) || modalSatuan <= 0) {
            throw new Error(`Harga beli satuan (modal) untuk produk ${cleanKode} harus lebih dari Rp 0`);
          }

          let product = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
          if (!product) {
            const itemAny = item as any;
            const normKat = String(itemAny.kategori || 'LAINNYA')
              .trim()
              .replace(/\s+/g, ' ')
              .toUpperCase();
            if (!Array.isArray(db.kategoriProduk)) db.kategoriProduk = [];
            if (!db.kategoriProduk.some((k) => k.nama.toUpperCase() === normKat)) {
              db.kategoriProduk.push({ nama: normKat, deskripsi: '', createdAt: iso });
            }
            const jualAwal =
              item.sesuaikanHargaJual && item.sesuaikanHargaJual > 0
                ? Math.round(item.sesuaikanHargaJual)
                : Math.round(modalSatuan);
            const rekananAwal =
              item.sesuaikanHargaRekanan && item.sesuaikanHargaRekanan > 0
                ? Math.round(item.sesuaikanHargaRekanan)
                : jualAwal;
            const newProd = {
              kode: cleanKode,
              kategori: normKat,
              nama: String(itemAny.namaProduk || itemAny.nama || cleanKode).trim(),
              satuan: String(itemAny.satuan || 'SAK').trim(),
              hargaBeli: Math.round(modalSatuan),
              hargaJual: jualAwal,
              hargaKhususRekanan: rekananAwal,
              status: 'AKTIF' as const,
            };
            db.produk.push(newProd);
            product = newProd;
          }

          let stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (!stokItem) {
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

          const stokSebelum = Math.max(0, Number(stokItem.stok) || 0);
          const hppSebelum = Math.max(0, Number(product.hargaBeli) || 0);
          const subtotal = Math.round(qtyBeli * modalSatuan);
          totalNominal += subtotal;

          // Hitung HPP murni dari Modal Pembelian (Rata-rata Tertimbang jika masih ada sisa stok lama, atau 100% modal pembelian baru jika stok 0)
          const hppBaru =
            stokSebelum > 0 && hppSebelum > 0
              ? Math.round((stokSebelum * hppSebelum + qtyBeli * modalSatuan) / (stokSebelum + qtyBeli))
              : Math.round(modalSatuan);

          // Auto-increment stock di gudang & siap dijual di Kasir Penjualan
          stokItem.stok = stokSebelum + qtyBeli;
          const stokSetelah = stokItem.stok;
          stokItem.updateTerakhir = iso;

          // Simpan HPP hasil perhitungan modal riil
          product.hargaBeli = hppBaru;

          // Perbarui sugesti harga jual dari input kasir atau fallback murni ke HPP modal (tanpa angka karangan)
          if (item.sesuaikanHargaJual !== undefined && item.sesuaikanHargaJual > 0) {
            product.hargaJual = Math.round(item.sesuaikanHargaJual);
          } else if (!product.hargaJual || product.hargaJual <= 0) {
            product.hargaJual = hppBaru;
          }

          if (item.sesuaikanHargaRekanan !== undefined && item.sesuaikanHargaRekanan > 0) {
            product.hargaKhususRekanan = Math.round(item.sesuaikanHargaRekanan);
          } else if (!product.hargaKhususRekanan || product.hargaKhususRekanan <= 0) {
            product.hargaKhususRekanan = product.hargaJual || hppBaru;
          }

          processedItems.push({
            kodeProduk: product.kode,
            namaProduk: product.nama,
            satuan: product.satuan,
            qty: qtyBeli,
            hargaBeliSatuan: Math.round(modalSatuan),
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
        if (
          params.rekeningSumber === 'KAS01' ||
          params.rekeningSumber === 'BON01' ||
          params.rekeningSumber === 'TIT01' ||
          params.rekeningSumber === 'SINKRON'
        ) {
          throw new Error('Untuk metode Transfer Bank, wajib memilih rekening bank sumber dana (bukan Kas Tunai / Virtual)');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominal) {
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

      const finalDivisi = params.divisi?.trim() || 'CV Wijaya Agro';
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
        divisi: finalDivisi,
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
        `Pembelian dari Distributor/Pemasok "${supplier.nama}" [Divisi: ${finalDivisi} | Rek: ${finalRekeningSumber}] (${isRekapan ? 'Rekapan Nota Global' : `${processedItems.length} produk`}) - Total: Rp ${totalNominal.toLocaleString('id-ID')} via ${params.metodePembayaran}${record.fotoNota ? ' (Foto Nota Tersimpan)' : ''}`,
        totalNominal,
        finalRekeningSumber
      );

      return record;
    });
  }

  // Batalkan / Hapus Transaksi Pembelian Barang yang salah input (Kembalikan Saldo Rekening & Koreksi Stok/HPP)
  public static async deletePembelianBarang(noPembelian: string): Promise<{ deleted: TransaksiPembelianBarang }> {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      if (!Array.isArray(db.pembelianBarang)) {
        throw new Error('Data pembelian barang kosong');
      }

      const idx = db.pembelianBarang.findIndex((p) => p.noPembelian === noPembelian);
      if (idx === -1) {
        throw new Error(`Transaksi pembelian ${noPembelian} tidak ditemukan`);
      }

      const target = db.pembelianBarang[idx];

      // Validasi kecukupan stok sebelum membatalkan pembelian produk fisik
      for (const it of target.items || []) {
        const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
        if (cleanKode && cleanKode !== 'REKAP-NOTA') {
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (stokItem && stokItem.stok < it.qty) {
            throw new Error(
              `Tidak dapat membatalkan ${noPembelian}: Stok "${it.namaProduk}" tersisa ${stokItem.stok} ${it.satuan}, sedangkan pembatalan membutuhkan pengurangan ${it.qty} ${it.satuan} (sebagian barang sudah terjual).`
            );
          }
        }
      }

      // Hapus dari daftar pembelian terlebih dahulu agar rekalkulasi HPP membaca sisa riwayat murni
      db.pembelianBarang.splice(idx, 1);

      // Kembalikan stok & hitung ulang HPP dari sisa riwayat pembelian riil
      for (const it of target.items || []) {
        const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
        if (cleanKode && cleanKode !== 'REKAP-NOTA') {
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (stokItem) {
            stokItem.stok = Math.max(0, stokItem.stok - it.qty);
            stokItem.updateTerakhir = iso;
          }

          const prod = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
          if (prod) {
            let sumQty = 0;
            let sumModal = 0;
            for (const otherPb of db.pembelianBarang) {
              for (const otherIt of otherPb.items || []) {
                if (String(otherIt.kodeProduk || '').trim().toUpperCase() === cleanKode) {
                  sumQty += Number(otherIt.qty) || 0;
                  sumModal += (Number(otherIt.qty) || 0) * (Number(otherIt.hargaBeliSatuan) || 0);
                }
              }
            }
            if (sumQty > 0) {
              prod.hargaBeli = Math.round(sumModal / sumQty);
            } else if ((stokItem?.stok || 0) === 0) {
              prod.hargaBeli = 0;
              prod.hargaJual = 0;
              prod.hargaKhususRekanan = 0;
            }
          }
        }
      }

      // Kembalikan saldo kas/rekening jika pembelian sebelumnya memotong dana (TUNAI / TRANSFER)
      if (target.metodePembayaran === 'TUNAI') {
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (kasAcc) {
          kasAcc.saldoSaatIni += target.totalNominal;
        }
      } else if (target.metodePembayaran === 'TRANSFER' && target.rekeningSumber && target.rekeningSumber !== 'TIT01' && target.rekeningSumber !== 'BON01') {
        const srcAcc = db.rekening.find((r) => r.kode === target.rekeningSumber);
        if (srcAcc) {
          srcAcc.saldoSaatIni += target.totalNominal;
        }
      }

      this.addAuditLog(
        db,
        'VOID',
        noPembelian,
        `Pembatalan Pembelian Barang ${noPembelian} (${target.namaMitra}) senilai Rp ${target.totalNominal.toLocaleString('id-ID')} - Saldo rekening & stok gudang dikembalikan akurat`,
        target.totalNominal,
        target.rekeningSumber
      );

      return { deleted: target };
    });
  }

  // ==========================================
  // 1C. LAPORAN LABA RUGI PER DIVISI & REFERENSI PRODUK
  // ==========================================
  public static getLabaRugiDivisiSummary(): LabaRugiDivisiSummary {
    dbManager.synchronizeDivisiAccounts();
    const db = dbManager.get();
    const allDivisi = dbManager
      .getDivisiList()
      .filter((d) => !isExcludedFromDivisi(d.nama) && !isExcludedFromDivisi(d.id));
    const norm = (s?: string) => String(s || '').trim().toLowerCase();
    const produkMap = new Map((db.produk || []).map((p) => [p.kode, p]));
    const divisiByRekKode = new Map(allDivisi.map((d) => [d.kodeRekening.toUpperCase(), norm(d.nama)]));

    const cleanDiv = (d?: string) => (d && !isExcludedFromDivisi(d) ? d : undefined);
    const resolvePenjualanDivNorm = (divisi?: string, metode?: string) =>
      norm(cleanDiv(divisi) || (metode === 'INTERNAL_PT' ? 'PT Wijaya Agro Perkasa' : 'CV Wijaya Agro'));
    const resolvePembelianBarangDivNorm = (divisi?: string) => norm(cleanDiv(divisi) || 'CV Wijaya Agro');
    const resolveHasilBumiDivNorm = (divisi?: string) => norm(cleanDiv(divisi) || 'Gudang Wijaya Agro');
    const resolveBebanDivNorm = (divisi?: string, rekeningSumber?: string) => {
      const validDiv = cleanDiv(divisi);
      if (validDiv && String(validDiv).trim()) return norm(validDiv);
      if (rekeningSumber) {
        const mapped = divisiByRekKode.get(String(rekeningSumber).toUpperCase());
        if (mapped) return mapped;
      }
      return norm('PT Wijaya Agro Perkasa');
    };

    const penjualanNotaDivMap = new Map<string, string>();
    for (const p of db.penjualan || []) {
      if (p.noPenjualan) {
        penjualanNotaDivMap.set(p.noPenjualan, resolvePenjualanDivNorm(p.divisi, p.metode));
      }
    }
    for (const j of db.penjualanHasilBumi || []) {
      if (j.noPenjualan) {
        penjualanNotaDivMap.set(j.noPenjualan, resolveHasilBumiDivNorm(j.divisi));
      }
    }

    const toTimestamp = (tanggal?: string, jam?: string, isoFallback?: string) => {
      const [d, m, y] = String(tanggal || '').split('/').map(Number);
      const base = new Date(y || 2026, (m || 1) - 1, d || 1).getTime();
      const [hh, mm, ss] = String(jam || '00:00:00').split(':').map(Number);
      const timeAdd = ((hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0)) * 1000;
      if (d && m && y) return base + timeAdd;
      return isoFallback ? new Date(isoFallback).getTime() || 0 : 0;
    };

    const items: LabaRugiDivisiItem[] = allDivisi.map((div) => {
      const targetNorm = norm(div.nama);
      const rek = db.rekening.find((r) => r.kode === div.kodeRekening);

      // 1. Pendapatan / Penjualan Divisi (Exclude pemakaian internal Rp 0)
      const penjualanTokoDiv = (db.penjualan || []).filter(
        (p) =>
          p.metode !== 'INTERNAL_PT' &&
          resolvePenjualanDivNorm(p.divisi, p.metode) === targetNorm
      );
      const penjualanHbDiv = (db.penjualanHasilBumi || []).filter(
        (j) => resolveHasilBumiDivNorm(j.divisi) === targetNorm
      );

      let omzetPenjualanToko = 0;
      let rawHppToko = 0;
      let piutangToko = 0;
      let kasPenjualanToko = 0;

      for (const p of penjualanTokoDiv) {
        const nom = Number(p.totalNominal) || 0;
        omzetPenjualanToko += nom;
        if (p.metode === 'TUNAI' || p.metode === 'TRANSFER') {
          kasPenjualanToko += nom;
        } else if (p.metode === 'KASBON') {
          piutangToko += Number(p.sisaPiutang) || 0;
        }
        const hppNota = (p.items || []).reduce((s, it) => {
          const prod = produkMap.get(it.kodeProduk);
          const hppUnit = it.hargaBeli !== undefined ? Number(it.hargaBeli) : Number(prod?.hargaBeli || 0);
          return s + (Number(it.qty) || 0) * hppUnit;
        }, 0);
        rawHppToko += hppNota;
      }

      let omzetPenjualanHasilBumi = 0;
      let rawHppHb = 0;
      let piutangHb = 0;
      let kasPenjualanHb = 0;

      for (const j of penjualanHbDiv) {
        const nom = Number(j.totalNominal) || 0;
        const hpp =
          Number(j.totalModalHpp) || (Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0);
        omzetPenjualanHasilBumi += nom;
        rawHppHb += hpp;
        if (j.metodePembayaran === 'TUNAI' || j.metodePembayaran === 'TRANSFER') {
          kasPenjualanHb += nom;
        } else if (j.metodePembayaran === 'PIUTANG') {
          piutangHb += Number(j.sisaPiutang) || 0;
        }
      }

      let pelunasanBonKasDiv = 0;
      const pelunasanEntriesDiv: Array<{
        id: string;
        tanggal: string;
        jam: string;
        keterangan: string;
        pihakTerkait?: string;
        metode?: string;
        nominal: number;
        _ts: number;
      }> = [];

      for (const b of db.bayarBon || []) {
        if (b.metode !== 'TUNAI' && b.metode !== 'TRANSFER') continue;
        if (b.isKompensasiTitipan || b.isPotongGaji) continue;
        for (const alok of b.alokasi || []) {
          if (alok.jenis === 'KASBON_BARANG' && (alok.nominalDibayar || 0) > 0) {
            if (penjualanNotaDivMap.get(alok.refId) === targetNorm) {
              const nomAlok = Number(alok.nominalDibayar) || 0;
              pelunasanBonKasDiv += nomAlok;
              pelunasanEntriesDiv.push({
                id: `${b.idTransaksi}-${alok.refId}`,
                tanggal: b.tanggal,
                jam: b.jam,
                keterangan: `Pelunasan Piutang Nota ${alok.refId}${b.keterangan ? ` (${b.keterangan})` : ''}`,
                pihakTerkait: b.namaMitra,
                metode: b.metode,
                nominal: nomAlok,
                _ts: toTimestamp(b.tanggal, b.jam, b.createdAt),
              });
            }
          }
        }
      }

      const totalOmzetPenjualan = omzetPenjualanToko + omzetPenjualanHasilBumi;
      const penjualanKasMasuk = kasPenjualanToko + kasPenjualanHb + pelunasanBonKasDiv;
      const piutangPenjualanAktif = piutangToko + piutangHb;
      const jumlahNotaPenjualan = penjualanTokoDiv.length + penjualanHbDiv.length;

      // Pembelian Divisi
      const pembelianBarangDiv = (db.pembelianBarang || []).filter(
        (pb) => resolvePembelianBarangDivNorm(pb.divisi) === targetNorm && (pb.totalNominal || 0) > 0
      );
      const pembelianHbDiv = (db.pembelianHasilBumi || []).filter(
        (phb) =>
          resolveHasilBumiDivNorm(phb.divisi) === targetNorm &&
          phb.komoditasKode !== 'PINJAMAN_DANA' &&
          phb.komoditasKode !== 'TITIP_DANA' &&
          !String(phb.komoditasNama || '').toLowerCase().includes('pinjaman uang') &&
          !phb.isBelumPutusHarga &&
          (phb.totalNominal || 0) > 0
      );

      const modalPembelianBarang = pembelianBarangDiv.reduce(
        (s, pb) => s + (Number(pb.totalNominal) || 0),
        0
      );
      const modalPembelianHasilBumi = pembelianHbDiv.reduce(
        (s, phb) => s + (Number(phb.totalNominal) || 0),
        0
      );
      const totalModalPembelian = modalPembelianBarang + modalPembelianHasilBumi;

      const pembelianBarangKasDiv = pembelianBarangDiv.filter(
        (pb) => pb.metodePembayaran === 'TUNAI' || pb.metodePembayaran === 'TRANSFER'
      );
      const pembelianHbKasDiv = pembelianHbDiv.filter(
        (phb) =>
          (phb.metodePembayaran === 'TUNAI' || phb.metodePembayaran === 'TRANSFER') &&
          phb.rekeningSumber !== 'TIT01' &&
          phb.rekeningSumber !== 'BON01'
      );

      const pembelianKasKeluar =
        pembelianBarangKasDiv.reduce((s, pb) => s + (Number(pb.totalNominal) || 0), 0) +
        pembelianHbKasDiv.reduce((s, phb) => s + (Number(phb.totalNominal) || 0), 0);

      const rawTotalHpp = rawHppToko + rawHppHb;
      const modalTerpakaiHpp =
        rawTotalHpp > 0
          ? Math.round(rawTotalHpp)
          : totalOmzetPenjualan > 0 && totalModalPembelian > 0
          ? Math.round(Math.min(totalModalPembelian, totalOmzetPenjualan))
          : 0;

      const sisaModalStokBerjalan = Math.max(0, Math.round(totalModalPembelian - modalTerpakaiHpp));
      const jumlahNotaPembelian = pembelianBarangDiv.length + pembelianHbDiv.length;

      const labaKotorDagang = Math.round(totalOmzetPenjualan - modalTerpakaiHpp);
      const marginKotorPersen =
        totalOmzetPenjualan > 0 ? Math.round((labaKotorDagang / totalOmzetPenjualan) * 1000) / 10 : 0;

      // Pengeluaran & Gaji Divisi
      const pengeluaranDiv = (db.pengeluaran || []).filter(
        (ex) => resolveBebanDivNorm(ex.divisi, ex.rekeningSumber) === targetNorm
      );
      const gajiDiv = (db.penggajian || []).filter(
        (gj) => resolveBebanDivNorm(gj.divisi, gj.rekeningSumber) === targetNorm
      );

      const biayaPengeluaranOperasional = pengeluaranDiv.reduce(
        (s, ex) => s + (Number(ex.nominal) || 0),
        0
      );
      const biayaGajiKaryawan = gajiDiv.reduce(
        (s, gj) => s + (Number(gj.gajiBersihDibayar) || 0),
        0
      );
      const totalBebanPengeluaran = Math.round(biayaPengeluaranOperasional + biayaGajiKaryawan);
      const jumlahTransaksiPengeluaran = pengeluaranDiv.length + gajiDiv.length;

      // =========================================================================
      // RUMUS UTAMA LABA RUGI DIVISI: UANG MASUK (+) DIKURANGI UANG KELUAR (-)
      // =========================================================================
      const uangMasuk = Math.round(penjualanKasMasuk);
      const uangKeluar = Math.round(
        pembelianKasKeluar + biayaPengeluaranOperasional + biayaGajiKaryawan
      );
      const labaRugiBersih = Math.round(uangMasuk - uangKeluar);
      const marginBersihPersen =
        uangMasuk > 0 ? Math.round((labaRugiBersih / uangMasuk) * 1000) / 10 : 0;

      const masukDropping = (db.transferRekening || [])
        .filter((t) => t.status === 'BERHASIL' && t.rekeningTujuan === div.kodeRekening)
        .reduce((s, t) => s + (Number(t.nominal) || 0), 0);
      const keluarTransfer = (db.transferRekening || [])
        .filter((t) => t.status === 'BERHASIL' && t.rekeningSumber === div.kodeRekening)
        .reduce((s, t) => s + (Number(t.nominal) || 0), 0);

      const saldoKasTunaiDivisi = Math.round(
        (Number(rek?.saldoAwal) || 0) +
          uangMasuk +
          masukDropping -
          uangKeluar -
          keluarTransfer
      );
      const saldoNilaiBerjalanDivisi = Number(rek?.saldoSaatIni) || 0;

      // Build drill-down transaction timeline strictly for Uang Masuk (+) & Uang Keluar (-)
      const rawRincian: Array<LabaRugiDivisiTransaksiRingkas & { _ts: number }> = [];

      const penjualanTokoKasDiv = penjualanTokoDiv.filter(
        (p) => (p.metode === 'TUNAI' || p.metode === 'TRANSFER') && (Number(p.totalNominal) || 0) > 0
      );
      const penjualanHbKasDiv = penjualanHbDiv.filter(
        (j) =>
          (j.metodePembayaran === 'TUNAI' || j.metodePembayaran === 'TRANSFER') &&
          (Number(j.totalNominal) || 0) > 0
      );

      for (const p of penjualanTokoKasDiv) {
        const ringkas = (p.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        const nom = Number(p.totalNominal) || 0;
        rawRincian.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          arus: 'MASUK',
          kategori: 'PENJUALAN',
          keterangan: `Penjualan / Sewa Jasa: ${ringkas || p.noPenjualan}`,
          pihakTerkait: p.namaMitra,
          metode: p.metode,
          nominal: nom,
          _ts: toTimestamp(p.tanggal, p.jam, p.createdAt),
        });
      }

      for (const j of penjualanHbKasDiv) {
        const nom = Number(j.totalNominal) || 0;
        rawRincian.push({
          id: j.noPenjualan,
          tanggal: j.tanggal,
          jam: j.jam,
          arus: 'MASUK',
          kategori: 'PENJUALAN',
          keterangan: `Penjualan Hasil Bumi: ${j.komoditasNama} (${j.beratBersih.toLocaleString('id-ID')} Kg)`,
          pihakTerkait: j.namaMitra,
          metode: j.metodePembayaran,
          nominal: nom,
          _ts: toTimestamp(j.tanggal, j.jam, j.createdAt),
        });
      }

      for (const pel of pelunasanEntriesDiv) {
        rawRincian.push({
          id: pel.id,
          tanggal: pel.tanggal,
          jam: pel.jam,
          arus: 'MASUK',
          kategori: 'PELUNASAN_PIUTANG',
          keterangan: pel.keterangan,
          pihakTerkait: pel.pihakTerkait,
          metode: pel.metode,
          nominal: pel.nominal,
          _ts: pel._ts,
        });
      }

      for (const pb of pembelianBarangKasDiv) {
        const ringkas = (pb.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        rawRincian.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          arus: 'KELUAR',
          kategori: 'MODAL_PEMBELIAN',
          keterangan: `Pembelian Barang: ${ringkas || pb.keterangan}`,
          pihakTerkait: pb.namaMitra,
          metode: pb.metodePembayaran,
          nominal: Number(pb.totalNominal) || 0,
          _ts: toTimestamp(pb.tanggal, pb.jam, pb.createdAt),
        });
      }

      for (const phb of pembelianHbKasDiv) {
        rawRincian.push({
          id: phb.noPembelian,
          tanggal: phb.tanggal,
          jam: phb.jam,
          arus: 'KELUAR',
          kategori: 'MODAL_PEMBELIAN',
          keterangan: `Pembelian Hasil Bumi: ${phb.komoditasNama} (${phb.beratBersih.toLocaleString('id-ID')} Kg)`,
          pihakTerkait: phb.namaMitra,
          metode: phb.metodePembayaran,
          nominal: Number(phb.totalNominal) || 0,
          _ts: toTimestamp(phb.tanggal, phb.jam, phb.createdAt),
        });
      }

      for (const ex of pengeluaranDiv) {
        rawRincian.push({
          id: ex.idTransaksi,
          tanggal: ex.tanggal,
          jam: ex.jam,
          arus: 'KELUAR',
          kategori: 'BEBAN_PENGELUARAN',
          keterangan: `Pengeluaran (${ex.kategori}): ${ex.keterangan}`,
          pihakTerkait: ex.penerima || ex.kategori,
          metode: ex.rekeningSumber,
          nominal: Number(ex.nominal) || 0,
          _ts: toTimestamp(ex.tanggal, ex.jam, ex.createdAt),
        });
      }

      for (const gj of gajiDiv) {
        rawRincian.push({
          id: gj.id,
          tanggal: gj.tanggal,
          jam: gj.jam,
          arus: 'KELUAR',
          kategori: 'GAJI_UPAH',
          keterangan: `Gaji / Upah Karyawan: ${gj.namaKaryawan} (${gj.periodeBulan})`,
          pihakTerkait: gj.namaKaryawan,
          metode: gj.rekeningSumber,
          nominal: Number(gj.gajiBersihDibayar) || 0,
          _ts: toTimestamp(gj.tanggal, gj.jam),
        });
      }

      const jumlahTransaksiMasuk =
        penjualanTokoKasDiv.length + penjualanHbKasDiv.length + pelunasanEntriesDiv.length;
      const jumlahTransaksiKeluar =
        pembelianBarangKasDiv.length +
        pembelianHbKasDiv.length +
        pengeluaranDiv.length +
        gajiDiv.length;

      rawRincian.sort((a, b) => b._ts - a._ts);
      const rincianTransaksi: LabaRugiDivisiTransaksiRingkas[] = rawRincian
        .slice(0, 60)
        .map(({ _ts: _unused, ...clean }) => clean);

      return {
        idDivisi: div.id,
        divisi: div.nama,
        kodeRekening: div.kodeRekening,
        namaRekening: rek?.nama || `Buku Arus Kas ${div.nama}`,
        penanggungJawab: div.penanggungJawab,
        deskripsi: div.deskripsi,
        logoUrl: div.logoUrl,
        uangMasuk,
        uangKeluar,
        jumlahTransaksiMasuk,
        jumlahTransaksiKeluar,
        omzetPenjualanToko,
        omzetPenjualanHasilBumi,
        totalOmzetPenjualan,
        penjualanKasMasuk,
        piutangPenjualanAktif,
        jumlahNotaPenjualan,
        modalPembelianBarang,
        modalPembelianHasilBumi,
        totalModalPembelian,
        pembelianKasKeluar,
        modalTerpakaiHpp,
        sisaModalStokBerjalan,
        jumlahNotaPembelian,
        labaKotorDagang,
        marginKotorPersen,
        biayaPengeluaranOperasional,
        biayaGajiKaryawan,
        totalBebanPengeluaran,
        jumlahTransaksiPengeluaran,
        labaRugiBersih,
        marginBersihPersen,
        saldoNilaiBerjalanDivisi,
        saldoKasTunaiDivisi,
        rincianTransaksi,
      };
    });

    // Sort: divisions with cash flow activity first (by highest net profit, then uang masuk)
    items.sort((a, b) => {
      const activeA = a.uangMasuk > 0 || a.uangKeluar > 0 ? 1 : 0;
      const activeB = b.uangMasuk > 0 || b.uangKeluar > 0 ? 1 : 0;
      if (activeA !== activeB) return activeB - activeA;
      if (b.labaRugiBersih !== a.labaRugiBersih) return b.labaRugiBersih - a.labaRugiBersih;
      return b.uangMasuk - a.uangMasuk;
    });

    const totalUangMasukSemuaDivisi = items.reduce((s, d) => s + d.uangMasuk, 0);
    const totalUangKeluarSemuaDivisi = items.reduce((s, d) => s + d.uangKeluar, 0);
    const totalOmzetSemuaDivisi = items.reduce((s, d) => s + d.totalOmzetPenjualan, 0);
    const totalModalPembelianSemuaDivisi = items.reduce((s, d) => s + d.totalModalPembelian, 0);
    const totalModalTerpakaiHppSemuaDivisi = items.reduce((s, d) => s + d.modalTerpakaiHpp, 0);
    const totalSisaModalStokBerjalanSemuaDivisi = items.reduce((s, d) => s + d.sisaModalStokBerjalan, 0);
    const totalLabaKotorSemuaDivisi = items.reduce((s, d) => s + d.labaKotorDagang, 0);
    const totalPengeluaranOperasionalSemuaDivisi = items.reduce(
      (s, d) => s + d.biayaPengeluaranOperasional,
      0
    );
    const totalGajiSemuaDivisi = items.reduce((s, d) => s + d.biayaGajiKaryawan, 0);
    const totalBebanPengeluaranSemuaDivisi = items.reduce((s, d) => s + d.totalBebanPengeluaran, 0);
    const totalLabaRugiBersihSemuaDivisi = Math.round(
      totalUangMasukSemuaDivisi - totalUangKeluarSemuaDivisi
    );
    const marginBersihRataRata =
      totalUangMasukSemuaDivisi > 0
        ? Math.round((totalLabaRugiBersihSemuaDivisi / totalUangMasukSemuaDivisi) * 1000) / 10
        : 0;

    const topProfitable = [...items]
      .filter((d) => (d.uangMasuk > 0 || d.uangKeluar > 0) && d.labaRugiBersih > 0)
      .sort((a, b) => b.labaRugiBersih - a.labaRugiBersih)[0];

    return {
      periode: 'Akumulasi Berjalan Per Divisi (Realtime)',
      totalDivisi: items.length,
      totalUangMasukSemuaDivisi,
      totalUangKeluarSemuaDivisi,
      totalOmzetSemuaDivisi,
      totalModalPembelianSemuaDivisi,
      totalModalTerpakaiHppSemuaDivisi,
      totalSisaModalStokBerjalanSemuaDivisi,
      totalLabaKotorSemuaDivisi,
      totalPengeluaranOperasionalSemuaDivisi,
      totalGajiSemuaDivisi,
      totalBebanPengeluaranSemuaDivisi,
      totalLabaRugiBersihSemuaDivisi,
      marginBersihRataRata,
      divisiTeruntung: topProfitable ? topProfitable.divisi : '-',
      items,
    };
  }

  public static getLabaRugiSummary(): LabaRugiSummary {
    const perDivisi = this.getLabaRugiDivisiSummary();
    const db = dbManager.get();

    // Map all sales items to products (kept as secondary item reference)
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
      if (pj.metode === 'INTERNAL_PT') continue;
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

    const bestSelling = [...items]
      .filter((it) => it.totalQtyTerjual > 0)
      .sort((a, b) => {
        if (b.totalQtyTerjual !== a.totalQtyTerjual) return b.totalQtyTerjual - a.totalQtyTerjual;
        return b.totalOmzet - a.totalOmzet;
      })[0];
    const produkTerlaris = bestSelling ? bestSelling.namaProduk : '-';

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
      perDivisi,
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
    divisi?: string;
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
        if (params.rekeningSumber === 'BON01' || params.rekeningSumber === 'TIT01' || params.rekeningSumber === 'KAS01' || params.rekeningSumber === 'SINKRON') {
          throw new Error('Pilih rekening bank sumber transfer yang valid (bukan Kas Tunai / Virtual)');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominal) {
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

      const finalDivisi = params.divisi?.trim() || 'Gudang Wijaya Agro';
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
        divisi: finalDivisi,
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
        `Pembelian Hasil Bumi ${komoditas.nama} (${beratBersih} kg) dari ${finalMitraNama} [Divisi: ${finalDivisi} | Rek: ${finalRekeningSumber}] - Metode: ${pembelianRecord.metodePembayaran}`,
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
    divisi?: string;
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
      record.isBelumPutusHarga = false;
      record.tanggalPutusHarga = `${tanggal} ${jam}`;
      record.divisi = params.divisi?.trim() || record.divisi || 'Gudang Wijaya Agro';
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
        if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana.`
          );
        }
        if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominalBaru) {
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
        `Putus Harga Hasil Bumi ${record.komoditasNama} (${record.beratBersih} kg) @ Rp ${params.hargaDealPerKg.toLocaleString('id-ID')} [Divisi: ${record.divisi} | Rek: ${record.rekeningSumber}] - Total: Rp ${totalNominalBaru.toLocaleString('id-ID')} via ${record.metodePembayaran}`,
        totalNominalBaru,
        record.rekeningSumber
      );

      return record;
    });
  }

  /**
   * Helper: Filter hanya transaksi pembelian hasil bumi fisik (bukan Pinjaman Dana / Titip Dana Nota Lalu 0 Kg)
   */
  public static isPhysicalPembelianHasilBumi(p?: TransaksiPembelianHasilBumi): boolean {
    if (!p) return false;
    if (p.komoditasKode === 'PINJAMAN_DANA' || p.komoditasKode === 'TITIP_DANA') return false;
    if (p.komoditasNama && p.komoditasNama.toLowerCase().includes('pinjaman uang')) return false;
    return (Number(p.beratBersih) || 0) > 0;
  }

  /**
   * Helper: Parse bulan (1..12) dan tahun dari string tanggal DD/MM/YYYY atau YYYY-MM-DD
   */
  private static parseMonthYear(dateStr?: string): { bulan: number; tahun: number } | null {
    if (!dateStr) return null;
    const clean = dateStr.trim().split(' ')[0];
    const parts = clean.split(/[-/]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) {
      const tahun = parseInt(parts[0], 10);
      const bulan = parseInt(parts[1], 10);
      if (!isNaN(bulan) && !isNaN(tahun) && bulan >= 1 && bulan <= 12) {
        return { bulan, tahun };
      }
    } else {
      const bulan = parseInt(parts[1], 10);
      const tahun = parseInt(parts[2], 10);
      if (!isNaN(bulan) && !isNaN(tahun) && bulan >= 1 && bulan <= 12) {
        return { bulan, tahun };
      }
    }
    return null;
  }

  // ==========================================
  // 2C. PENJUALAN / PENGIRIMAN HASIL BUMI KELUAR GUDANG
  // Mengurangi stok fisik gudang (Ready Gudang), menghitung HPP murni dari rata-rata modal beli,
  // serta mencatat uang masuk Kas/Bank atau Piutang Pabrik/Bandar
  // ==========================================
  public static async processPenjualanHasilBumi(params: {
    idMitra?: string;
    namaPembeliManual?: string;
    komoditasKode: string;
    beratKotor: number;
    potonganRafaksi?: number;
    hargaJualPerKg: number;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'PIUTANG';
    rekeningTujuan?: string;
    noSuratJalan?: string;
    tanggal?: string;
    keterangan?: string;
  }): Promise<TransaksiPenjualanHasilBumi> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: todayWib, jam, iso } = getWIBDateTime();

      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      if (!Array.isArray(db.pembelianHasilBumi)) db.pembelianHasilBumi = [];
      if (!Array.isArray(db.penjualanHasilBumi)) db.penjualanHasilBumi = [];

      const komoditas = db.stokHasilBumi.find((k) => k.kode === params.komoditasKode);
      if (!komoditas) {
        throw new Error(`Komoditas dengan kode ${params.komoditasKode} tidak ditemukan di gudang`);
      }

      const beratKotor = Number(params.beratKotor) || 0;
      const potonganRafaksi = Number(params.potonganRafaksi) || 0;
      const hargaJualPerKg = Number(params.hargaJualPerKg) || 0;

      if (beratKotor <= 0) {
        throw new Error('Berat timbangan jual harus lebih dari 0 Kg');
      }
      if (potonganRafaksi < 0 || potonganRafaksi >= 100) {
        throw new Error('Potongan rafaksi harus antara 0% dan 99.9%');
      }
      if (hargaJualPerKg <= 0) {
        throw new Error('Harga jual per Kg harus lebih dari Rp 0');
      }

      const beratBersih = Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;
      if (beratBersih <= 0) {
        throw new Error('Berat bersih hasil timbangan harus lebih dari 0 Kg');
      }

      const stokTersedia = Math.max(0, Number(komoditas.stok) || 0);
      if (stokTersedia < beratBersih) {
        throw new Error(
          `Stok Ready Gudang tidak mencukupi untuk "${komoditas.nama}". Ready di gudang: ${stokTersedia.toLocaleString(
            'id-ID'
          )} ${komoditas.satuan}, akan dijual: ${beratBersih.toLocaleString('id-ID')} ${komoditas.satuan}`
        );
      }

      // Resolve Pembeli (Pabrik / Bandar / Mitra Terdaftar atau Pembeli Manual)
      let finalMitraId = 'UMUM';
      let finalMitraNama = params.namaPembeliManual?.trim() || 'Pembeli / Pabrik Umum';

      if (params.idMitra && params.idMitra !== 'UMUM') {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) {
          throw new Error('Mitra pembeli terdaftar tidak ditemukan');
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

      if (params.metodePembayaran === 'PIUTANG' && finalMitraId === 'UMUM') {
        throw new Error('Metode PIUTANG (Tempo) hanya berlaku untuk Mitra / Pabrik yang terdaftar di Master Mitra');
      }

      // Hitung Modal Rata-rata Gudang murni dari akumulasi modal pembelian riil (tanpa angka karangan)
      const stokAwalKg = Number(komoditas.stokAwal) || 0;
      const modalAwalUang =
        Number(komoditas.modalAwalTotal) || stokAwalKg * (Number(komoditas.rataRataModalAwal) || 0);

      const physicalPurchases = db.pembelianHasilBumi.filter(
        (p) =>
          this.isPhysicalPembelianHasilBumi(p) &&
          (p.komoditasKode === komoditas.kode ||
            p.komoditasNama.toUpperCase().trim() === komoditas.nama.toUpperCase().trim())
      );

      const totalUangBeli =
        modalAwalUang + physicalPurchases.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0);
      const totalKgBeli =
        stokAwalKg + physicalPurchases.reduce((sum, p) => sum + (Number(p.beratBersih) || 0), 0);

      const modalRataRataPerKg =
        totalKgBeli > 0 && totalUangBeli > 0
          ? Math.round(totalUangBeli / totalKgBeli)
          : Math.max(0, Number(komoditas.rataRataModalAwal) || 0);

      const totalModalHpp = Math.round(beratBersih * modalRataRataPerKg);
      const totalNominal = Math.round(beratBersih * hargaJualPerKg);
      const labaKotor = totalNominal - totalModalHpp;

      // Update Rekening Penerima / Piutang
      let finalRekeningTujuan = '';
      let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' = 'LUNAS';
      let sisaPiutang = 0;

      if (params.metodePembayaran === 'TUNAI') {
        finalRekeningTujuan = 'KAS01';
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
        kasAcc.saldoSaatIni += totalNominal;
      } else if (params.metodePembayaran === 'TRANSFER') {
        if (!params.rekeningTujuan) {
          throw new Error('Pilih rekening bank tujuan transfer pembayaran hasil bumi');
        }
        if (
          params.rekeningTujuan === 'KAS01' ||
          params.rekeningTujuan === 'BON01' ||
          params.rekeningTujuan === 'TIT01' ||
          params.rekeningTujuan === 'SINKRON'
        ) {
          throw new Error('Pilih rekening bank tujuan transfer yang valid (bukan Kas Tunai / Virtual)');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningTujuan} tidak ditemukan`);
        if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil tempat uang masuk (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        bankAcc.saldoSaatIni += totalNominal;
        finalRekeningTujuan = bankAcc.kode;
      } else if (params.metodePembayaran === 'PIUTANG') {
        finalRekeningTujuan = 'BON01';
        statusPembayaran = 'BELUM_BAYAR';
        sisaPiutang = totalNominal;
      }

      // Kurangi Stok Fisik Ready Gudang
      const stokGudangSebelum = stokTersedia;
      const stokGudangSetelah = Math.max(0, Math.round((stokTersedia - beratBersih) * 100) / 100);
      komoditas.stok = stokGudangSetelah;
      komoditas.updateTerakhir = iso;

      // Normalisasi tanggal jika diberikan (YYYY-MM-DD -> DD/MM/YYYY)
      let finalTanggal = todayWib;
      if (params.tanggal && params.tanggal.trim()) {
        const rawTgl = params.tanggal.trim();
        const parts = rawTgl.split(/[-/]/);
        if (parts.length === 3) {
          finalTanggal =
            parts[0].length === 4
              ? `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`
              : `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
      }

      const finalDivisi = params.divisi?.trim() || 'PT Wijaya Agro Perkasa';
      const noPenjualan = generateId('JHB');
      const record: TransaksiPenjualanHasilBumi = {
        noPenjualan,
        tanggal: finalTanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        komoditasKode: komoditas.kode,
        komoditasNama: komoditas.nama,
        beratKotor,
        potonganRafaksi,
        beratBersih,
        modalRataRataPerKg,
        totalModalHpp,
        hargaJualPerKg,
        totalNominal,
        labaKotor,
        divisi: finalDivisi,
        metodePembayaran: params.metodePembayaran,
        rekeningTujuan: finalRekeningTujuan,
        statusPembayaran,
        sisaPiutang,
        noSuratJalan: params.noSuratJalan?.trim() || '',
        stokGudangSebelum,
        stokGudangSetelah,
        keterangan:
          params.keterangan?.trim() ||
          `Penjualan Hasil Bumi ${komoditas.nama} (${beratBersih.toLocaleString('id-ID')} Kg) kepada ${finalMitraNama}`,
        createdAt: iso,
      };

      db.penjualanHasilBumi.unshift(record);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'CREATE',
        noPenjualan,
        `Penjualan Hasil Bumi ${komoditas.nama} [Divisi: ${finalDivisi} | Rek: ${finalRekeningTujuan}]: ${beratBersih.toLocaleString('id-ID')} Kg @ Rp ${hargaJualPerKg.toLocaleString(
          'id-ID'
        )}/Kg kepada ${finalMitraNama} (${params.metodePembayaran}). Sisa Ready Gudang: ${stokGudangSetelah.toLocaleString(
          'id-ID'
        )} Kg`,
        totalNominal,
        finalRekeningTujuan
      );

      return record;
    });
  }

  public static async deletePenjualanHasilBumi(
    noPenjualan: string
  ): Promise<{ deleted: TransaksiPenjualanHasilBumi }> {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      if (!Array.isArray(db.penjualanHasilBumi)) db.penjualanHasilBumi = [];

      const idx = db.penjualanHasilBumi.findIndex((j) => j.noPenjualan === noPenjualan);
      if (idx === -1) {
        throw new Error(`Transaksi penjualan hasil bumi ${noPenjualan} tidak ditemukan`);
      }

      const record = db.penjualanHasilBumi[idx];

      if (record.metodePembayaran === 'PIUTANG' && record.sisaPiutang < record.totalNominal) {
        throw new Error(
          `Transaksi piutang ${noPenjualan} sudah menerima pembayaran sebagian/lunas dan tidak dapat dibatalkan langsung.`
        );
      }

      // Kembalikan stok fisik ke gudang
      const komoditas = (db.stokHasilBumi || []).find(
        (k) =>
          k.kode === record.komoditasKode ||
          k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
      );
      if (komoditas) {
        komoditas.stok = Math.round(((Number(komoditas.stok) || 0) + record.beratBersih) * 100) / 100;
        komoditas.updateTerakhir = iso;
      }

      // Kembalikan saldo rekening jika pembayaran tunai/transfer
      if (record.metodePembayaran !== 'PIUTANG' && record.rekeningTujuan) {
        const rek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
        if (rek) {
          rek.saldoSaatIni -= record.totalNominal;
        }
      }

      db.penjualanHasilBumi.splice(idx, 1);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'VOID',
        noPenjualan,
        `Pembatalan Penjualan Hasil Bumi ${record.komoditasNama} (${record.beratBersih.toLocaleString(
          'id-ID'
        )} Kg - ${record.namaMitra}). Stok dikembalikan ke gudang.`,
        record.totalNominal,
        record.rekeningTujuan
      );

      return { deleted: record };
    });
  }

  // ==========================================
  // 2D. RINGKASAN STOK HASIL BUMI BULANAN (TERJUAL VS READY DI GUDANG)
  // ==========================================
  public static getRingkasanStokHasilBumiBulanan(params?: {
    bulan?: number;
    tahun?: number;
    kodeKomoditas?: string;
  }): RingkasanStokHasilBumiBulananResponse {
    const db = dbManager.get();
    const { tanggal: todayWib } = getWIBDateTime();
    const parsedToday = this.parseMonthYear(todayWib) || { bulan: 10, tahun: 2026 };

    const targetBulan =
      params?.bulan && params.bulan >= 1 && params.bulan <= 12 ? Number(params.bulan) : parsedToday.bulan;
    const targetTahun =
      params?.tahun && params.tahun >= 2020 && params.tahun <= 2100 ? Number(params.tahun) : parsedToday.tahun;
    const kodeKomoditasFilter =
      params?.kodeKomoditas && params.kodeKomoditas !== 'ALL' ? params.kodeKomoditas.trim() : 'ALL';

    const NAMA_BULAN = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember',
    ];
    const NAMA_BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

    const activeKomoditas = (db.stokHasilBumi || []).filter(
      (h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN')
    );

    const physicalPembelian = (db.pembelianHasilBumi || []).filter((p) =>
      this.isPhysicalPembelianHasilBumi(p)
    );
    const allPenjualanHb = db.penjualanHasilBumi || [];

    // Kumpulkan tahun yang tersedia
    const yearSet = new Set<number>([parsedToday.tahun, targetTahun]);
    for (const p of physicalPembelian) {
      const my = this.parseMonthYear(p.tanggalNotaLalu || p.tanggal);
      if (my) yearSet.add(my.tahun);
    }
    for (const j of allPenjualanHb) {
      const my = this.parseMonthYear(j.tanggal);
      if (my) yearSet.add(my.tahun);
    }
    const daftarTahunTersedia = Array.from(yearSet).sort((a, b) => b - a);

    const isBeforeMonth = (my: { bulan: number; tahun: number } | null, bulan: number, tahun: number) => {
      if (!my) return false;
      return my.tahun < tahun || (my.tahun === tahun && my.bulan < bulan);
    };

    const isSameMonth = (my: { bulan: number; tahun: number } | null, bulan: number, tahun: number) => {
      if (!my) return false;
      return my.tahun === tahun && my.bulan === bulan;
    };

    const matchesKomoditas = (kode: string, nama: string, hb: { kode: string; nama: string }) =>
      kode === hb.kode || (nama || '').toUpperCase().trim() === hb.nama.toUpperCase().trim();

    // 1. Hitung rincian per komoditas untuk (targetBulan, targetTahun)
    const komoditasItems: RingkasanKomoditasBulananItem[] = activeKomoditas.map((hb) => {
      const hbPurchases = physicalPembelian.filter((p) =>
        matchesKomoditas(p.komoditasKode, p.komoditasNama, hb)
      );
      const hbSales = allPenjualanHb.filter((j) =>
        matchesKomoditas(j.komoditasKode, j.komoditasNama, hb)
      );

      const stokAwalManual = Math.max(0, Number(hb.stokAwal) || 0);
      const modalAwalManual =
        Number(hb.modalAwalTotal) || stokAwalManual * (Number(hb.rataRataModalAwal) || 0);

      // Mutasi sebelum bulan terpilih
      const beliSebelumKg = hbPurchases
        .filter((p) => isBeforeMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), targetBulan, targetTahun))
        .reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);

      const jualSebelumKg = hbSales
        .filter((j) => isBeforeMonth(this.parseMonthYear(j.tanggal), targetBulan, targetTahun))
        .reduce((s, j) => s + (Number(j.beratBersih) || 0), 0);

      const stokAwalBulanKg = Math.max(
        0,
        Math.round((stokAwalManual + beliSebelumKg - jualSebelumKg) * 100) / 100
      );

      // Mutasi pada bulan terpilih
      const beliBulanIni = hbPurchases.filter((p) =>
        isSameMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), targetBulan, targetTahun)
      );
      const masukBulanIniKg =
        Math.round(beliBulanIni.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0) * 100) / 100;
      const masukBulanIniNominal = beliBulanIni.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
      const rataHargaBeliBulanIni =
        masukBulanIniKg > 0 && masukBulanIniNominal > 0
          ? Math.round(masukBulanIniNominal / masukBulanIniKg)
          : 0;

      const jualBulanIni = hbSales.filter((j) =>
        isSameMonth(this.parseMonthYear(j.tanggal), targetBulan, targetTahun)
      );
      const terjualBulanIniKg =
        Math.round(jualBulanIni.reduce((s, j) => s + (Number(j.beratBersih) || 0), 0) * 100) / 100;
      const terjualBulanIniOmzet = jualBulanIni.reduce((s, j) => s + (Number(j.totalNominal) || 0), 0);
      const rataHargaJualBulanIni =
        terjualBulanIniKg > 0 && terjualBulanIniOmzet > 0
          ? Math.round(terjualBulanIniOmzet / terjualBulanIniKg)
          : 0;
      const labaBulanIni = jualBulanIni.reduce((s, j) => s + (Number(j.labaKotor) || 0), 0);

      const stokAkhirBulanKg = Math.max(
        0,
        Math.round((stokAwalBulanKg + masukBulanIniKg - terjualBulanIniKg) * 100) / 100
      );

      // Posisi aktual Ready di Gudang saat ini
      const readyGudangSaatIniKg = Math.max(0, Math.round((Number(hb.stok) || 0) * 100) / 100);
      const totalMasukKumulatifKg =
        Math.round(
          (stokAwalManual + hbPurchases.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0)) * 100
        ) / 100;
      const totalUangBeliKumulatif =
        modalAwalManual + hbPurchases.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
      const totalTerjualKumulatifKg =
        Math.round(hbSales.reduce((s, j) => s + (Number(j.beratBersih) || 0), 0) * 100) / 100;

      const rataRataModalGudangPerKg =
        totalMasukKumulatifKg > 0 && totalUangBeliKumulatif > 0
          ? Math.round(totalUangBeliKumulatif / totalMasukKumulatifKg)
          : Math.max(0, Number(hb.rataRataModalAwal) || 0);

      const nilaiModalReadyGudang = Math.round(readyGudangSaatIniKg * rataRataModalGudangPerKg);

      return {
        kode: hb.kode,
        nama: hb.nama,
        satuan: hb.satuan || 'Kg',
        isBelumPutusHarga: Boolean(hb.kode === 'HB-08' || hb.isBelumPutusHarga),
        stokAwalBulanKg,
        masukBulanIniKg,
        masukBulanIniNominal,
        rataHargaBeliBulanIni,
        notaBeliBulanIniCount: beliBulanIni.length,
        terjualBulanIniKg,
        terjualBulanIniOmzet,
        rataHargaJualBulanIni,
        labaBulanIni,
        notaJualBulanIniCount: jualBulanIni.length,
        stokAkhirBulanKg,
        readyGudangSaatIniKg,
        rataRataModalGudangPerKg,
        nilaiModalReadyGudang,
        totalMasukKumulatifKg,
        totalTerjualKumulatifKg,
      };
    });

    const filteredKomoditasForScope =
      kodeKomoditasFilter === 'ALL'
        ? activeKomoditas
        : activeKomoditas.filter((h) => h.kode === kodeKomoditasFilter);

    // 2. Hitung Rekap 12 Bulan dalam targetTahun (sesuai filter komoditas atau ALL)
    const rekapPerBulanTahunIni: RingkasanBulanHasilBumiItem[] = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      let stokAwalKg = 0;
      let masukKg = 0;
      let masukNominal = 0;
      let notaBeliCount = 0;
      let terjualKg = 0;
      let terjualOmzet = 0;
      let terjualLaba = 0;
      let notaJualCount = 0;

      for (const hb of filteredKomoditasForScope) {
        const hbPurchases = physicalPembelian.filter((p) =>
          matchesKomoditas(p.komoditasKode, p.komoditasNama, hb)
        );
        const hbSales = allPenjualanHb.filter((j) =>
          matchesKomoditas(j.komoditasKode, j.komoditasNama, hb)
        );
        const awalManual = Math.max(0, Number(hb.stokAwal) || 0);

        const beliSebelum = hbPurchases
          .filter((p) => isBeforeMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), m, targetTahun))
          .reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);
        const jualSebelum = hbSales
          .filter((j) => isBeforeMonth(this.parseMonthYear(j.tanggal), m, targetTahun))
          .reduce((s, j) => s + (Number(j.beratBersih) || 0), 0);

        stokAwalKg += Math.max(0, awalManual + beliSebelum - jualSebelum);

        const beliBulan = hbPurchases.filter((p) =>
          isSameMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), m, targetTahun)
        );
        masukKg += beliBulan.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);
        masukNominal += beliBulan.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
        notaBeliCount += beliBulan.length;

        const jualBulan = hbSales.filter((j) =>
          isSameMonth(this.parseMonthYear(j.tanggal), m, targetTahun)
        );
        terjualKg += jualBulan.reduce((s, j) => s + (Number(j.beratBersih) || 0), 0);
        terjualOmzet += jualBulan.reduce((s, j) => s + (Number(j.totalNominal) || 0), 0);
        terjualLaba += jualBulan.reduce((s, j) => s + (Number(j.labaKotor) || 0), 0);
        notaJualCount += jualBulan.length;
      }

      stokAwalKg = Math.round(stokAwalKg * 100) / 100;
      masukKg = Math.round(masukKg * 100) / 100;
      terjualKg = Math.round(terjualKg * 100) / 100;
      const stokAkhirKg = Math.max(0, Math.round((stokAwalKg + masukKg - terjualKg) * 100) / 100);

      return {
        bulan: m,
        tahun: targetTahun,
        namaBulan: NAMA_BULAN[idx],
        namaBulanSingkat: NAMA_BULAN_SINGKAT[idx],
        stokAwalKg,
        masukKg,
        masukNominal,
        notaBeliCount,
        terjualKg,
        terjualOmzet,
        terjualLaba,
        notaJualCount,
        stokAkhirKg,
        isCurrentMonth: m === parsedToday.bulan && targetTahun === parsedToday.tahun,
      };
    });

    // Aggregate KPI sesuai kodeKomoditasFilter
    const scopedItems =
      kodeKomoditasFilter === 'ALL'
        ? komoditasItems
        : komoditasItems.filter((it) => it.kode === kodeKomoditasFilter);

    const totalReadyGudangKg =
      Math.round(scopedItems.reduce((s, it) => s + it.readyGudangSaatIniKg, 0) * 100) / 100;
    const totalNilaiModalReadyGudang = scopedItems.reduce((s, it) => s + it.nilaiModalReadyGudang, 0);
    const jumlahKomoditasReady = scopedItems.filter((it) => it.readyGudangSaatIniKg > 0).length;
    const totalMasukKumulatifKg =
      Math.round(scopedItems.reduce((s, it) => s + it.totalMasukKumulatifKg, 0) * 100) / 100;
    const totalTerjualKumulatifKg =
      Math.round(scopedItems.reduce((s, it) => s + it.totalTerjualKumulatifKg, 0) * 100) / 100;

    const stokAwalBulanKg =
      Math.round(scopedItems.reduce((s, it) => s + it.stokAwalBulanKg, 0) * 100) / 100;
    const masukBulanIniKg =
      Math.round(scopedItems.reduce((s, it) => s + it.masukBulanIniKg, 0) * 100) / 100;
    const masukBulanIniNominal = scopedItems.reduce((s, it) => s + it.masukBulanIniNominal, 0);
    const jumlahNotaBeliBulanIni = scopedItems.reduce((s, it) => s + it.notaBeliBulanIniCount, 0);
    const terjualBulanIniKg =
      Math.round(scopedItems.reduce((s, it) => s + it.terjualBulanIniKg, 0) * 100) / 100;
    const terjualBulanIniOmzet = scopedItems.reduce((s, it) => s + it.terjualBulanIniOmzet, 0);
    const terjualBulanIniLaba = scopedItems.reduce((s, it) => s + it.labaBulanIni, 0);
    const terjualBulanIniModal = terjualBulanIniOmzet - terjualBulanIniLaba;
    const jumlahNotaJualBulanIni = scopedItems.reduce((s, it) => s + it.notaJualBulanIniCount, 0);
    const stokAkhirBulanKg =
      Math.round(scopedItems.reduce((s, it) => s + it.stokAkhirBulanKg, 0) * 100) / 100;

    return {
      bulan: targetBulan,
      tahun: targetTahun,
      periodeLabel: `${NAMA_BULAN[targetBulan - 1]} ${targetTahun}`,
      kodeKomoditasFilter,
      daftarTahunTersedia,
      totalReadyGudangKg,
      totalNilaiModalReadyGudang,
      jumlahKomoditasReady,
      totalMasukKumulatifKg,
      totalTerjualKumulatifKg,
      stokAwalBulanKg,
      masukBulanIniKg,
      masukBulanIniNominal,
      jumlahNotaBeliBulanIni,
      terjualBulanIniKg,
      terjualBulanIniOmzet,
      terjualBulanIniModal,
      terjualBulanIniLaba,
      jumlahNotaJualBulanIni,
      stokAkhirBulanKg,
      komoditasItems,
      rekapPerBulanTahunIni,
    };
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
      if (!this.isAnakPerusahaanRekening(rekeningSumber) && rekeningSumber.saldoSaatIni < params.nominal) {
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
    fotoNotaList?: string[];
    driveFileUrl?: string;
    driveFileId?: string;
    driveFolderPath?: string;
    driveFileList?: Array<{ url: string; id: string; folderPath: string }>;
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
          fotoNota: params.fotoNota || (params.fotoNotaList?.[0] || ''),
          fotoNotaList: params.fotoNotaList || (params.fotoNota ? [params.fotoNota] : []),
          driveFileUrl: params.driveFileUrl || (params.driveFileList?.[0]?.url || ''),
          driveFileId: params.driveFileId || (params.driveFileList?.[0]?.id || ''),
          driveFolderPath: params.driveFolderPath || 'NOTA LALU / PIUTANG NOTA LAMA',
          driveFileList: params.driveFileList || [],
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
          fotoNota: params.fotoNota || (params.fotoNotaList?.[0] || ''),
          fotoNotaList: params.fotoNotaList || (params.fotoNota ? [params.fotoNota] : []),
          driveFileUrl: params.driveFileUrl || (params.driveFileList?.[0]?.url || ''),
          driveFileId: params.driveFileId || (params.driveFileList?.[0]?.id || ''),
          driveFolderPath: params.driveFolderPath || 'NOTA LALU / HUTANG NOTA LAMA',
          driveFileList: params.driveFileList || [],
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
  // PINJAM UANG DARI PT KE MITRA (MASUK SALDO TITIP MITRA)
  // PT menerima pinjaman uang dari Mitra -> Uang masuk ke kas/bank PT, dan otomatis masuk Saldo Titip Mitra
  // ==========================================
  public static async processPinjamanUangDariMitra(params: {
    idMitra: string;
    nominal: number;
    rekeningTujuan: string; // kode rekening kasir/bank PT (e.g. KAS01, BANK01)
    tanggal?: string;
    noReferensi?: string;
    keterangan?: string;
    fotoNota?: string;
    fotoNotaList?: string[];
  }): Promise<{ record: TransaksiPembelianHasilBumi; mitraNama: string; nominal: number; rekeningNama: string }> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal pinjaman uang harus lebih dari Rp 0');
      }

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Mitra tidak ditemukan');
      if (mitra.status !== 'AKTIF') throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);

      const rekening = db.rekening.find((r) => r.kode === params.rekeningTujuan);
      if (!rekening) throw new Error(`Rekening kasir/bank PT "${params.rekeningTujuan}" tidak ditemukan`);

      const cleanTgl = params.tanggal ? params.tanggal.trim() : tanggal;
      const noPembelian = generateId('PJM');
      const cleanRef = params.noReferensi ? params.noReferensi.trim() : `PJM-${Date.now().toString().slice(-4)}`;

      // 1. Tambah Saldo Kas / Bank PT karena uang pinjaman masuk ke kas PT
      rekening.saldoSaatIni += params.nominal;

      const allFotos = params.fotoNotaList && params.fotoNotaList.length > 0 
        ? params.fotoNotaList 
        : (params.fotoNota ? [params.fotoNota] : []);

      // 2. Buat Catatan Titipan Dana (Saldo Titip Mitra / Kewajiban Hutang PT ke Mitra)
      const pinjamanRecord: TransaksiPembelianHasilBumi = {
        noPembelian,
        tanggal: cleanTgl,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        komoditasKode: 'PINJAMAN_DANA',
        komoditasNama: 'Pinjaman Uang dari PT ke Mitra (Titipan Dana)',
        beratKotor: 0,
        potonganRafaksi: 0,
        beratBersih: 0,
        hargaPerKg: 0,
        totalNominal: params.nominal,
        metodePembayaran: 'TITIP',
        rekeningSumber: rekening.kode,
        status: 'TITIP',
        fotoNota: allFotos.join('|||'),
        fotoNotaList: allFotos,
        isNotaLalu: true,
        noNotaLalu: cleanRef,
        tanggalNotaLalu: cleanTgl,
        keterangan: params.keterangan 
          ? params.keterangan.trim() 
          : `Pinjaman uang dari PT ke Mitra ${mitra.nama} (Diterima di ${rekening.nama}, Masuk Saldo Titip Mitra)`,
        createdAt: iso,
      };

      if (!db.pembelianHasilBumi) db.pembelianHasilBumi = [];
      db.pembelianHasilBumi.unshift(pinjamanRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noPembelian,
        `Pinjam uang PT ke Mitra "${mitra.nama}" sebesar Rp ${params.nominal.toLocaleString('id-ID')} masuk ke ${rekening.nama} (Tercatat di Saldo Titip Mitra - Ref: ${cleanRef})`,
        params.nominal,
        rekening.kode
      );

      dbManager.synchronizeVirtualAccounts();

      return {
        record: pinjamanRecord,
        mitraNama: mitra.nama,
        nominal: params.nominal,
        rekeningNama: rekening.nama,
      };
    });
  }

  // ==========================================
  // HELPER: SNAPSHOT SALDO SILANG MITRA & ALOKASI FIFO BON
  // ==========================================
  private static getMitraCrossBalanceSnapshot(db: any, mitraId: string) {
    const outstandingPenjualan: TransaksiPenjualan[] = (db.penjualan || []).filter(
      (p: TransaksiPenjualan) =>
        p.idMitra === mitraId &&
        p.metode === 'KASBON' &&
        p.statusPembayaran === 'BELUM_BAYAR' &&
        p.sisaPiutang > 0
    );
    const outstandingPenjualanHb: TransaksiPenjualanHasilBumi[] = (db.penjualanHasilBumi || []).filter(
      (j: TransaksiPenjualanHasilBumi) =>
        j.idMitra === mitraId &&
        j.metodePembayaran === 'PIUTANG' &&
        j.statusPembayaran === 'BELUM_BAYAR' &&
        j.sisaPiutang > 0
    );
    const outstandingKasbonUang: TransaksiKasbonUang[] = (db.kasbonUang || []).filter(
      (k: TransaksiKasbonUang) => k.idMitra === mitraId && k.status !== 'LUNAS' && k.sisaKasbon > 0
    );

    const totalKasbonBarang =
      outstandingPenjualan.reduce((s, p) => s + p.sisaPiutang, 0) +
      outstandingPenjualanHb.reduce((s, j) => s + j.sisaPiutang, 0);
    const totalKasbonUang = outstandingKasbonUang.reduce((s, k) => s + k.sisaKasbon, 0);
    const totalBonKotor = totalKasbonBarang + totalKasbonUang;

    const totalTitipHasilBumi = (db.pembelianHasilBumi || [])
      .filter((p: TransaksiPembelianHasilBumi) => p.idMitra === mitraId && p.metodePembayaran === 'TITIP')
      .reduce((s: number, p: TransaksiPembelianHasilBumi) => s + p.totalNominal, 0);
    const totalHutangKulakan = (db.pembelianBarang || [])
      .filter(
        (pb: TransaksiPembelianBarang) =>
          pb.idMitra === mitraId && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS'
      )
      .reduce((s: number, pb: TransaksiPembelianBarang) => s + (pb.totalNominal || 0), 0);
    const totalTitipKotor = totalTitipHasilBumi + totalHutangKulakan;
    const totalPencairanSebelum = (db.pencairanTitipan || [])
      .filter((pt: TransaksiPencairanTitipan) => pt.idMitra === mitraId)
      .reduce((s: number, pt: TransaksiPencairanTitipan) => s + (pt.nominalPencairan || 0), 0);

    const saldoTitipanAktif = Math.max(0, totalTitipKotor - totalPencairanSebelum);
    const potonganOtomatis = Math.min(totalBonKotor, saldoTitipanAktif);
    const sisaBonBersih = Math.max(0, totalBonKotor - saldoTitipanAktif);
    const sisaTitipanBersih = Math.max(0, saldoTitipanAktif - totalBonKotor);

    return {
      outstandingPenjualan,
      outstandingPenjualanHb,
      outstandingKasbonUang,
      totalKasbonBarang,
      totalKasbonUang,
      totalBonKotor,
      saldoTitipanAktif,
      potonganOtomatis,
      sisaBonBersih,
      sisaTitipanBersih,
    };
  }

  private static allocateMitraBonFifo(
    db: any,
    mitraId: string,
    amountToAllocate: number
  ): AlokasiPembayaranBon[] {
    if (amountToAllocate <= 0) return [];

    type BonItem = {
      jenis: 'KASBON_BARANG' | 'KASBON_UANG';
      refId: string;
      sisa: number;
      createdAt: string;
      sourceObj: TransaksiPenjualan | TransaksiPenjualanHasilBumi | TransaksiKasbonUang;
    };

    const outstandingPenjualan: TransaksiPenjualan[] = (db.penjualan || []).filter(
      (p: TransaksiPenjualan) =>
        p.idMitra === mitraId &&
        p.metode === 'KASBON' &&
        p.statusPembayaran === 'BELUM_BAYAR' &&
        p.sisaPiutang > 0
    );
    const outstandingPenjualanHb: TransaksiPenjualanHasilBumi[] = (db.penjualanHasilBumi || []).filter(
      (j: TransaksiPenjualanHasilBumi) =>
        j.idMitra === mitraId &&
        j.metodePembayaran === 'PIUTANG' &&
        j.statusPembayaran === 'BELUM_BAYAR' &&
        j.sisaPiutang > 0
    );
    const outstandingKasbonUang: TransaksiKasbonUang[] = (db.kasbonUang || []).filter(
      (k: TransaksiKasbonUang) => k.idMitra === mitraId && k.status !== 'LUNAS' && k.sisaKasbon > 0
    );

    const allBons: BonItem[] = [
      ...outstandingPenjualan.map((p) => ({
        jenis: 'KASBON_BARANG' as const,
        refId: p.noPenjualan,
        sisa: p.sisaPiutang,
        createdAt: p.createdAt,
        sourceObj: p,
      })),
      ...outstandingPenjualanHb.map((j) => ({
        jenis: 'KASBON_BARANG' as const,
        refId: j.noPenjualan,
        sisa: j.sisaPiutang,
        createdAt: j.createdAt,
        sourceObj: j,
      })),
      ...outstandingKasbonUang.map((k) => ({
        jenis: 'KASBON_UANG' as const,
        refId: k.idTransaksi,
        sisa: k.sisaKasbon,
        createdAt: k.createdAt,
        sourceObj: k,
      })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let remainingPayment = amountToAllocate;
    const alokasiList: AlokasiPembayaranBon[] = [];

    for (const bon of allBons) {
      if (remainingPayment <= 0) break;

      const nominalSebelum = bon.sisa;
      const alokasiNominal = Math.min(remainingPayment, nominalSebelum);
      const nominalSisa = nominalSebelum - alokasiNominal;

      if (bon.jenis === 'KASBON_BARANG') {
        const pj = bon.sourceObj as TransaksiPenjualan | TransaksiPenjualanHasilBumi;
        pj.sisaPiutang = nominalSisa;
        if (nominalSisa === 0) {
          pj.statusPembayaran = 'LUNAS';
        }
      } else {
        const kbu = bon.sourceObj as TransaksiKasbonUang;
        kbu.sisaKasbon = nominalSisa;
        kbu.status = nominalSisa === 0 ? 'LUNAS' : 'SEBAGIAN';
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

    return alokasiList;
  }

  private static executeAutoCrossOffsetInTx(params: {
    db: any;
    mitra: { id: string; nama: string };
    nominalPotong: number;
    totalBonSebelum: number;
    saldoTitipanSebelum: number;
    tanggal: string;
    jam: string;
    iso: string;
    refId: string;
  }) {
    const {
      db,
      mitra,
      nominalPotong,
      totalBonSebelum,
      saldoTitipanSebelum,
      tanggal,
      jam,
      iso,
      refId,
    } = params;
    if (nominalPotong <= 0) return [];

    const alokasiKompensasi = this.allocateMitraBonFifo(db, mitra.id, nominalPotong);
    const sisaBonSetelahPotong = Math.max(0, totalBonSebelum - nominalPotong);
    const sisaTitipSetelahPotong = Math.max(0, saldoTitipanSebelum - nominalPotong);

    if (!db.bayarBon) db.bayarBon = [];
    db.bayarBon.unshift({
      idTransaksi: `${refId}-POTBON`,
      tanggal,
      jam,
      idMitra: mitra.id,
      namaMitra: mitra.nama,
      totalBonSebelum,
      nominalBayar: nominalPotong,
      sisaBonSetelah: sisaBonSetelahPotong,
      metode: 'SINKRON',
      rekeningTujuan: 'SINKRON',
      isKompensasiTitipan: true,
      alokasi: alokasiKompensasi,
      keterangan: `Sinkron Potong Bon Otomatis dari Titipan Hasil Bumi (${refId})`,
      createdAt: iso,
    });

    if (!db.pencairanTitipan) db.pencairanTitipan = [];
    db.pencairanTitipan.unshift({
      idPencairan: `${refId}-POTTIT`,
      tanggal,
      jam,
      idMitra: mitra.id,
      namaMitra: mitra.nama,
      nominalPencairan: nominalPotong,
      rekeningSumber: 'SINKRON',
      saldoTitipanSebelum,
      saldoTitipanSisa: sisaTitipSetelahPotong,
      metodePembayaran: 'SINKRON',
      isKompensasiBon: true,
      keterangan: `Sinkron Potong Titipan Hasil Bumi untuk Pelunasan Bon Mitra (${refId})`,
      createdAt: iso,
    });

    return alokasiKompensasi;
  }

  // ==========================================
  // 4. BAYAR BON (FITUR BARU D + REKENING SINKRON)
  // Pelunasan bon mitra via Tunai, Transfer, atau SINKRON (Potong langsung Titipan Hasil Bumi / Uang Kopi tanpa kas keluar/masuk)
  // ==========================================
  public static async processBayarBon(params: {
    idMitra: string;
    nominalBayar: number;
    metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
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

      const snap = this.getMitraCrossBalanceSnapshot(db, mitra.id);
      const {
        totalBonKotor,
        saldoTitipanAktif,
        potonganOtomatis,
        sisaBonBersih,
      } = snap;

      const isSinkronMode =
        params.metode === 'SINKRON' || params.rekeningTujuan === 'SINKRON';

      // =========================================================
      // JALUR 1: METODE SINKRON (POTONG LANGSUNG DARI TITIPAN / UANG HASIL BUMI TANPA UANG KELUAR/MASUK)
      // =========================================================
      if (isSinkronMode) {
        if (totalBonKotor <= 0) {
          throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon aktif yang perlu disinkronkan (Rp 0).`);
        }
        if (saldoTitipanAktif <= 0) {
          throw new Error(
            `Mitra ${mitra.nama} tidak memiliki Saldo Titipan Hasil Bumi / Uang Kopi (Rp 0) untuk dipotong via Rekening SINKRON. Silakan gunakan metode Tunai atau Transfer.`
          );
        }

        const maksPotongSinkron = Math.min(totalBonKotor, saldoTitipanAktif);
        if (params.nominalBayar > maksPotongSinkron) {
          throw new Error(
            `Nominal SINKRON (Rp ${params.nominalBayar.toLocaleString(
              'id-ID'
            )}) melebihi batas maksimal potong silang antara Bon (Rp ${totalBonKotor.toLocaleString(
              'id-ID'
            )}) dan Saldo Titipan Hasil Bumi (Rp ${saldoTitipanAktif.toLocaleString('id-ID')}), yaitu maksimal Rp ${maksPotongSinkron.toLocaleString('id-ID')}.`
          );
        }

        const idTransaksi = generateId('BYB');

        // 1. Alokasikan pelunasan bon secara FIFO tanpa menyentuh kas/bank fisik sedikit pun
        const alokasiSinkron = this.allocateMitraBonFifo(db, mitra.id, params.nominalBayar);
        const sisaBonSetelah = Math.max(0, totalBonKotor - params.nominalBayar);
        const sisaTitipanSetelah = Math.max(0, saldoTitipanAktif - params.nominalBayar);

        const ketSinkron =
          params.keterangan && params.keterangan.trim()
            ? params.keterangan.trim()
            : `Pelunasan Bon via SINKRON — Potong langsung dari Saldo Titipan / Uang Hasil Bumi (Sisa Titipan: Rp ${sisaTitipanSetelah.toLocaleString('id-ID')})`;

        const bayarBonSinkronRecord: TransaksiBayarBon = {
          idTransaksi,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: totalBonKotor,
          totalBonAwalKotor: totalBonKotor,
          nominalPotongTitipanOtomatis: params.nominalBayar,
          nominalBayar: params.nominalBayar,
          sisaBonSetelah,
          metode: 'SINKRON',
          rekeningTujuan: 'SINKRON',
          isKompensasiTitipan: true,
          alokasi: alokasiSinkron,
          keterangan: ketSinkron,
          createdAt: iso,
        };

        if (!db.bayarBon) db.bayarBon = [];
        db.bayarBon.unshift(bayarBonSinkronRecord);

        // 2. Catat pemotongan pasangan pada Saldo Titipan Hasil Bumi mitra agar saldo uang kopinya berkurang presisi
        if (!db.pencairanTitipan) db.pencairanTitipan = [];
        db.pencairanTitipan.unshift({
          idPencairan: `${idTransaksi}-SINKRON`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: params.nominalBayar,
          rekeningSumber: 'SINKRON',
          saldoTitipanSebelum: saldoTitipanAktif,
          totalTitipanAwalKotor: saldoTitipanAktif,
          nominalPotongBonOtomatis: params.nominalBayar,
          saldoTitipanSisa: sisaTitipanSetelah,
          metodePembayaran: 'SINKRON',
          isKompensasiBon: true,
          keterangan: `Potong Saldo Titipan / Uang Hasil Bumi via Rekening SINKRON untuk Pelunasan Bon (${idTransaksi})`,
          createdAt: iso,
        });

        dbManager.synchronizeVirtualAccounts();

        this.addAuditLog(
          db,
          'PAYMENT',
          idTransaksi,
          `Pelunasan Bon via SINKRON (${mitra.nama}): Bon Rp ${params.nominalBayar.toLocaleString(
            'id-ID'
          )} dipotong langsung dari Saldo Titipan / Uang Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
            'id-ID'
          )} tanpa uang keluar/masuk. Sisa Bon: Rp ${sisaBonSetelah.toLocaleString(
            'id-ID'
          )}, Sisa Titipan Mitra: Rp ${sisaTitipanSetelah.toLocaleString('id-ID')}.`,
          params.nominalBayar,
          'SINKRON'
        );

        return bayarBonSinkronRecord;
      }

      // =========================================================
      // JALUR 2: METODE TUNAI / TRANSFER FISIK (UANG MASUK KE KAS01 / BANK)
      // =========================================================
      if (sisaBonBersih <= 0) {
        if (totalBonKotor > 0 && saldoTitipanAktif >= totalBonKotor) {
          throw new Error(
            `Bon ${mitra.nama} sebesar Rp ${totalBonKotor.toLocaleString(
              'id-ID'
            )} sudah tertutup oleh Saldo Titipan Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
              'id-ID'
            )}. Pilih metode SINKRON untuk memotong langsung dari uang titipan tanpa uang fisik!`
          );
        }
        throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon yang harus dibayar saat ini`);
      }

      if (params.nominalBayar > sisaBonBersih) {
        throw new Error(
          `Nominal pembayaran tunai/transfer (Rp ${params.nominalBayar.toLocaleString(
            'id-ID'
          )}) melebihi sisa bon bersih mitra setelah potong titipan hasil bumi (Rp ${sisaBonBersih.toLocaleString(
            'id-ID'
          )})`
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

      if (
        rekeningTujuanKode === 'BON01' ||
        rekeningTujuanKode === 'TIT01' ||
        rekeningTujuanKode === 'SINKRON'
      ) {
        throw new Error('Rekening sistem BON01 / TIT01 / SINKRON tidak dapat dijadikan rekening transfer bank fisik!');
      }

      const rekeningTujuan = db.rekening.find((r) => r.kode === rekeningTujuanKode);
      if (!rekeningTujuan) {
        throw new Error(`Rekening ${rekeningTujuanKode} tidak ditemukan`);
      }
      if (rekeningTujuan.status !== 'AKTIF') {
        throw new Error(`Rekening ${rekeningTujuan.nama} tidak aktif`);
      }

      const idTransaksi = generateId('BYB');

      // 1. Jika ada saldo Titipan Hasil Bumi pada mitra ini, sinkronkan potongan otomatis terlebih dahulu secara non-tunai
      if (potonganOtomatis > 0) {
        this.executeAutoCrossOffsetInTx({
          db,
          mitra,
          nominalPotong: potonganOtomatis,
          totalBonSebelum: totalBonKotor,
          saldoTitipanSebelum: saldoTitipanAktif,
          tanggal,
          jam,
          iso,
          refId: idTransaksi,
        });
      }

      // 2. Tambahkan saldo rekening penerima sebesar uang fisik yang disetor
      rekeningTujuan.saldoSaatIni += params.nominalBayar;

      // 3. Alokasi pembayaran fisik terhadap sisa bon bersih (FIFO)
      const alokasiList = this.allocateMitraBonFifo(db, mitra.id, params.nominalBayar);
      const sisaBonSetelah = Math.max(0, sisaBonBersih - params.nominalBayar);

      const bayarBonRecord: TransaksiBayarBon = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        totalBonSebelum: sisaBonBersih,
        ...(potonganOtomatis > 0
          ? {
              totalBonAwalKotor: totalBonKotor,
              nominalPotongTitipanOtomatis: potonganOtomatis,
            }
          : {}),
        nominalBayar: params.nominalBayar,
        sisaBonSetelah,
        metode: params.metode,
        rekeningTujuan: rekeningTujuan.kode,
        alokasi: alokasiList,
        keterangan:
          params.keterangan ||
          (potonganOtomatis > 0
            ? `Pelunasan Sisa Bon ${mitra.nama} ke ${rekeningTujuan.nama} (setelah Sinkron Titipan Rp ${potonganOtomatis.toLocaleString(
                'id-ID'
              )})`
            : `Pembayaran Bon ${mitra.nama} ke ${rekeningTujuan.nama}`),
        createdAt: iso,
      };

      db.bayarBon.unshift(bayarBonRecord);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'PAYMENT',
        idTransaksi,
        potonganOtomatis > 0
          ? `Pembayaran Sisa Bon oleh ${mitra.nama}: Bon Awal Rp ${totalBonKotor.toLocaleString(
              'id-ID'
            )} dipotong Sinkron Titipan Hasil Bumi Rp ${potonganOtomatis.toLocaleString(
              'id-ID'
            )}, dibayar tunai/transfer Rp ${params.nominalBayar.toLocaleString('id-ID')} masuk ke ${
              rekeningTujuan.nama
            }. Sisa bon: Rp ${sisaBonSetelah.toLocaleString('id-ID')}`
          : `Pembayaran Bon oleh ${mitra.nama}: Rp ${params.nominalBayar.toLocaleString(
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

      // Validasi saldo sumber mencukupi (Anak Perusahaan seperti DP Parabot bukan bank, sehingga dapat menalangi dana PT)
      const isSumberAnak = this.isAnakPerusahaanRekening(sumberAcc);
      const isTujuanAnak = this.isAnakPerusahaanRekening(tujuanAcc);

      if (!isSumberAnak && sumberAcc.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening sumber ${sumberAcc.nama} (${sumberAcc.kode}) tidak mencukupi! Saldo saat ini: Rp ${sumberAcc.saldoSaatIni.toLocaleString(
            'id-ID'
          )}, nominal transfer: Rp ${params.nominal.toLocaleString('id-ID')}`
        );
      }

      // Pindahkan saldo: sumber - nominal, tujuan + nominal
      sumberAcc.saldoSaatIni -= params.nominal;
      tujuanAcc.saldoSaatIni += params.nominal;

      let idMitraTerkait: string | undefined;
      let namaMitraTerkait: string | undefined;
      let tipeMutasiAfiliasi: TransaksiTransferRekening['tipeMutasiAfiliasi'];

      if (isTujuanAnak && !isSumberAnak) {
        idMitraTerkait = tujuanAcc.idMitraTerkait || 'MTR-DPPARABOT';
        namaMitraTerkait = tujuanAcc.namaMitraTerkait || tujuanAcc.nama;
        tipeMutasiAfiliasi = 'SIMPAN_KE_ANAK_PERUSAHAAN';
      } else if (isSumberAnak && !isTujuanAnak) {
        idMitraTerkait = sumberAcc.idMitraTerkait || 'MTR-DPPARABOT';
        namaMitraTerkait = sumberAcc.namaMitraTerkait || sumberAcc.nama;
        tipeMutasiAfiliasi = 'TARIK_DARI_ANAK_PERUSAHAAN';
      } else if (isSumberAnak && isTujuanAnak) {
        idMitraTerkait = tujuanAcc.idMitraTerkait || sumberAcc.idMitraTerkait;
        namaMitraTerkait = tujuanAcc.namaMitraTerkait || tujuanAcc.nama;
        tipeMutasiAfiliasi = 'ANTAR_ANAK_PERUSAHAAN';
      }

      const defaultKet =
        tipeMutasiAfiliasi === 'SIMPAN_KE_ANAK_PERUSAHAAN'
          ? `Simpan / Titip Dana PT ke Anak Perusahaan ${namaMitraTerkait} (1 Transaksi Terpadu Rekening & Mitra)`
          : tipeMutasiAfiliasi === 'TARIK_DARI_ANAK_PERUSAHAAN'
          ? `Tarik / Talangan Dana dari Anak Perusahaan ${namaMitraTerkait} ke ${tujuanAcc.nama} (1 Transaksi Terpadu Rekening & Mitra)`
          : 'Pemindahan dana operasional internal';

      const noTransfer = generateId('TRF');
      const transferRecord: TransaksiTransferRekening = {
        noTransfer,
        tanggal,
        jam,
        rekeningSumber: sumberAcc.kode,
        rekeningTujuan: tujuanAcc.kode,
        nominal: params.nominal,
        keterangan: params.keterangan?.trim() || defaultKet,
        status: 'BERHASIL',
        ...(idMitraTerkait ? { idMitraTerkait } : {}),
        ...(namaMitraTerkait ? { namaMitraTerkait } : {}),
        ...(tipeMutasiAfiliasi ? { tipeMutasiAfiliasi } : {}),
        createdAt: iso,
      };

      db.transferRekening.unshift(transferRecord);

      this.addAuditLog(
        db,
        'TRANSFER',
        noTransfer,
        idMitraTerkait
          ? `1 Transaksi Terpadu (Rekening & Mitra Anak Perusahaan ${namaMitraTerkait}): ${sumberAcc.nama} (${sumberAcc.kode}) -> ${tujuanAcc.nama} (${tujuanAcc.kode}) sebesar Rp ${params.nominal.toLocaleString(
              'id-ID'
            )}. Ket: ${transferRecord.keterangan}`
          : `Transfer Antar Rekening: ${sumberAcc.nama} (${sumberAcc.kode}) -> ${tujuanAcc.nama} (${tujuanAcc.kode}) sebesar Rp ${params.nominal.toLocaleString(
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
    tunjanganNominal?: number; // Tunjangan opsional (override tunjanganTetap jika diisi)
    bonus?: number;       // Lembur, insentif, uang makan
    lunasiUpahHarianPending?: boolean; // Jika true, tandai catatan upah harian TERCATAT jadi SUDAH_DIBAYAR
    upahHarianIds?: string[]; // Daftar ID upah harian spesifik yang ikut dilunasi
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
      const divisi: NamaDivisi =
        params.divisi ||
        ((kry.divisi || kry.departemen || 'Gudang Wijaya Agro') as NamaDivisi);
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

      // Upah dihitung murni berdasarkan input per hari kerja (tanpa standar gaji bulanan tetap)
      const upahManual =
        params.gajiNominal !== undefined && params.gajiNominal !== null
          ? Math.max(0, Number(params.gajiNominal))
          : 0;

      const tunjangan =
        params.tunjanganNominal !== undefined && params.tunjanganNominal !== null
          ? Math.max(0, Number(params.tunjanganNominal))
          : 0;
      const bonus = Math.max(0, Number(params.bonus) || 0);
      const totalGajiKotor = upahManual + tunjangan + bonus;

      if (totalGajiKotor <= 0) {
        throw new Error('Total gaji/upah harus lebih dari Rp 0');
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

      if (
        !this.isAnakPerusahaanRekening(rekSumber) &&
        rekSumber.kategori !== 'OPERASIONAL_DIVISI' &&
        rekSumber.saldoSaatIni < gajiBersihDibayar
      ) {
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
          namaMitra: kry.nama,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: 'POTONG_GAJI',
          rekeningTujuan: 'POTONG_GAJI',
          isPotongGaji: true,
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

      // Jika diminta melunasi catatan upah harian yang masih TERCATAT (misal saat gajian 1 bulan penuh)
      let settledDailyLogs: CatatanUpahHarian[] = [];
      if (params.lunasiUpahHarianPending || (params.upahHarianIds && params.upahHarianIds.length > 0)) {
        const idFilter =
          params.upahHarianIds && params.upahHarianIds.length > 0
            ? new Set(params.upahHarianIds)
            : null;
        settledDailyLogs = (db.upahHarian || []).filter(
          (u) =>
            u.idKaryawan === kry.id &&
            u.status === 'TERCATAT' &&
            (!idFilter || idFilter.has(u.id))
        );
        for (const u of settledDailyLogs) {
          u.status = 'SUDAH_DIBAYAR';
          u.ket = 'LUNAS';
          u.idPayrollSettlement = idPayroll;
          u.tanggalDibayar = targetTanggal;
        }
      }

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
        ...(settledDailyLogs.length > 0
          ? {
              jumlahHariKerja: settledDailyLogs.length,
              daftarUpahHarianIds: settledDailyLogs.map((u) => u.id),
            }
          : {}),
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

        if (
          !this.isAnakPerusahaanRekening(rekSumber) &&
          rekSumber.kategori !== 'OPERASIONAL_DIVISI' &&
          rekSumber.saldoSaatIni < gajiBersihDibayar
        ) {
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
            metode: 'POTONG_GAJI',
            rekeningTujuan: 'POTONG_GAJI',
            isPotongGaji: true,
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

      // 1. Kasbon barang dari penjualan toko + piutang hasil bumi
      const kasbonBarang =
        (db.penjualan || [])
          .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
          .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0) +
        (db.penjualanHasilBumi || [])
          .filter((j) => j.idMitra === mitraId && j.metodePembayaran === 'PIUTANG' && j.statusPembayaran === 'BELUM_BAYAR')
          .reduce((sum, j) => sum + (j.sisaPiutang || 0), 0);

      // 2. Kasbon uang dari kasir kasbon uang
      const kasbonUang = (db.kasbonUang || [])
        .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const totalBon = kasbonBarang + kasbonUang;

      // 2b. Saldo Titip Hasil Panen / Pinjaman Dana sebagai Mitra (Karyawan juga bisa jadi Mitra)
      const titipPanenKotor = (db.pembelianHasilBumi || [])
        .filter((pb) => pb.idMitra === mitraId && pb.metodePembayaran === 'TITIP')
        .reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const hutangKulakan = (db.pembelianBarang || [])
        .filter((pb) => pb.idMitra === mitraId && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
        .reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const totalDicairkanMitra = (db.pencairanTitipan || [])
        .filter((pt) => pt.idMitra === mitraId)
        .reduce((sum, pt) => sum + (pt.nominalPencairan || 0), 0);
      const totalTitipHasilPanen = Math.max(0, titipPanenKotor + hutangKulakan - totalDicairkanMitra);

      // 3. Hak Upah Harian dari db.upahHarian & Slip Penggajian (Hari tanpa input = Tidak Masuk)
      const allUpahKry = (db.upahHarian || []).filter((u) => u.idKaryawan === kry.id);
      const allSlipsKry = (db.penggajian || []).filter((g) => g.idKaryawan === kry.id);
      const totalHariKerja = new Set(
        allUpahKry.filter((u) => (u.totalUpahHarian || 0) > 0).map((u) => u.tanggalKerja)
      ).size;
      const totalHakUpahHarian = allUpahKry.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const upahBelumDibayar = allUpahKry
        .filter((u) => u.status === 'TERCATAT')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const upahSudahDibayarLog = allUpahKry
        .filter((u) => u.status === 'SUDAH_DIBAYAR')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      const totalGajiSlipDibayar = allSlipsKry.reduce(
        (sum, g) => sum + (Number(g.totalGajiKotor) || Number(g.gajiBersihDibayar) || 0),
        0
      );
      const upahSudahDibayar = Math.max(upahSudahDibayarLog, totalGajiSlipDibayar);

      const lastJob = allUpahKry[0];
      const divisiTerakhir = lastJob
        ? lastJob.divisi
        : ((kry.divisi || kry.departemen || 'Gudang Wijaya Agro') as NamaDivisi);

      // Posisi Bersih Gaji: Hak Upah Belum Dibayar - Total Bon
      const saldoBersih = upahBelumDibayar - totalBon;
      const totalHakGabunganMitraKaryawan = upahBelumDibayar + totalTitipHasilPanen;
      const saldoBersihTerpaduMitra = totalHakGabunganMitraKaryawan - totalBon;

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
        divisi: kry.divisi || kry.departemen,
        departemen: kry.departemen,
        telepon: kry.telepon,
        alamat: kry.alamat,
        status: kry.status,
        divisiTerakhir,
        standarGajiPokok: 0,
        tunjanganTetap: 0,
        totalHariKerja,
        totalHakUpahHarian: Math.max(totalHakUpahHarian, upahBelumDibayar + upahSudahDibayar),
        totalUpahBelumDibayar: upahBelumDibayar,
        totalUpahSudahDibayar: upahSudahDibayar,
        totalGajiSudahDibayar: totalGajiSlipDibayar,
        totalKasbonBarang: kasbonBarang,
        totalKasbonUang: kasbonUang,
        totalBonKaryawan: totalBon,
        totalTitipHasilPanen,
        totalHakGabunganMitraKaryawan,
        saldoBersih,
        saldoBersihTerpaduMitra,
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
    tipeGaji?: 'HARIAN' | 'BULANAN';
    periodeBulan?: string;
    gajiPokokTambahan?: number;
    tunjangan?: number;
    bonus?: number;
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

      const nominalUpahHarian = pendingList.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const tambahanPokok = Math.max(0, Number(params.gajiPokokTambahan) || 0);
      const tunjangan = Math.max(0, Number(params.tunjangan) || 0);
      const bonus = Math.max(0, Number(params.bonus) || 0);
      const totalUpahKotor = nominalUpahHarian + tambahanPokok + tunjangan + bonus;

      if (totalUpahKotor <= 0) {
        throw new Error('Tidak ada hak upah atau nominal gaji yang akan dibayarkan');
      }

      const divisi: NamaDivisi =
        params.divisi ||
        pendingList[0]?.divisi ||
        ((kry.divisi || kry.departemen || 'Gudang Wijaya Agro') as NamaDivisi);

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
      if (params.nominalPotongKustom !== undefined && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpahKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        potonganKasbon = Math.min(Math.round((totalKasbonAwal * persentase) / 100), totalKasbonAwal, totalUpahKotor);
      }

      const gajiBersihDibayar = totalUpahKotor - potonganKasbon;
      const rekKode = params.rekeningSumber || TransactionService.DIVISI_REKENING_MAP[divisi] || 'KAS01';
      if (rekKode === 'BON01' || rekKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 tidak dapat digunakan untuk pembayaran gaji');
      }
      const rekSumber =
        db.rekening.find((r) => r.kode === rekKode) ||
        db.rekening.find((r) => r.kode === 'KAS01') ||
        db.rekening[0];

      if (
        !this.isAnakPerusahaanRekening(rekSumber) &&
        rekSumber.kategori !== 'OPERASIONAL_DIVISI' &&
        rekSumber.saldoSaatIni < gajiBersihDibayar
      ) {
        throw new Error(
          `Saldo rekening ${rekSumber.nama} (Rp ${rekSumber.saldoSaatIni.toLocaleString(
            'id-ID'
          )}) tidak mencukupi untuk pembayaran gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
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
          namaMitra: kry.nama,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: 'POTONG_GAJI',
          rekeningTujuan: 'POTONG_GAJI',
          isPotongGaji: true,
          alokasi: alokasiList,
          keterangan: `Potong Gaji / Upah (${pendingList.length > 0 ? `${pendingList.length} Hari Kerja` : params.periodeBulan || 'Bulanan'}) [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso,
        });
      }

      rekSumber.saldoSaatIni -= gajiBersihDibayar;
      const idPayroll = generateId('GAJI');
      const slipNomor = `SLIP/WA/${tanggal.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

      const resolvedTipeGaji: 'HARIAN' | 'BULANAN' =
        params.tipeGaji || (params.periodeBulan ? 'BULANAN' : 'HARIAN');
      const resolvedPeriode =
        params.periodeBulan ||
        (pendingList.length > 0
          ? `Settlement ${pendingList.length} Hari Kerja - ${tanggal}`
          : `Penggajian Bulanan - ${tanggal}`);

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
        tipeGaji: resolvedTipeGaji,
        periodeBulan: resolvedPeriode,
        gajiPokok: nominalUpahHarian + tambahanPokok,
        tunjangan,
        bonus,
        totalGajiKotor: totalUpahKotor,
        totalKasbonAwal,
        persentasePotongKasbon: persentase,
        potonganKasbon,
        sisaKasbonAkhir: totalKasbonAwal - potonganKasbon,
        gajiBersihDibayar,
        metodePembayaran: params.metodePembayaran || 'TUNAI',
        rekeningSumber: rekSumber.kode,
        ...(pendingList.length > 0
          ? {
              jumlahHariKerja: pendingList.length,
              daftarUpahHarianIds: pendingList.map((u) => u.id),
            }
          : {}),
        keterangan:
          params.keterangan ||
          (pendingList.length > 0
            ? `Pembayaran Gaji / Upah (${pendingList.length} Hari Kerja) Karyawan ${kry.nama}`
            : `Pembayaran Gaji Bulanan (${resolvedPeriode}) Karyawan ${kry.nama}`),
        idBayarBonTerkait,
      };

      db.penggajian.unshift(payrollRecord);

      for (const u of pendingList) {
        u.status = 'SUDAH_DIBAYAR';
        u.ket = 'LUNAS';
        u.idPayrollSettlement = idPayroll;
        u.tanggalDibayar = tanggal;
      }

      this.addAuditLog(
        db,
        'PAYROLL',
        idPayroll,
        `Pembayaran Gaji Karyawan ${kry.nama} (${kry.nik}) [${resolvedPeriode}]. Total Gaji Kotor: Rp ${totalUpahKotor.toLocaleString(
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
      const upahPokokHarian = allUpahBulanIni.reduce((sum, u) => sum + (u.upahHarian || 0), 0);
      const uangMakanLemburHarian = allUpahBulanIni.reduce((sum, u) => sum + (u.uangMakanLembur || 0), 0);
      const gajiKotorHarian = allUpahBulanIni.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      // Sertakan slip gaji bulanan/manual di bulan ini yang tidak berasal dari pencairan catatan harian (agar tidak dobel hitung)
      const settledSlipIdsFromLogs = new Set(
        (db.upahHarian || [])
          .filter((u) => u.idKaryawan === kry.id && u.idPayrollSettlement)
          .map((u) => u.idPayrollSettlement!)
      );
      const standaloneSlipsBulanIni = allGajiBulanIni.filter(
        (g) => !(g.daftarUpahHarianIds && g.daftarUpahHarianIds.length > 0) && !settledSlipIdsFromLogs.has(g.id)
      );
      const gajiPokokStandalone = standaloneSlipsBulanIni.reduce((sum, g) => sum + (g.gajiPokok || 0), 0);
      const bonusTunjanganStandalone = standaloneSlipsBulanIni.reduce(
        (sum, g) => sum + (g.tunjangan || 0) + (g.bonus || 0),
        0
      );
      const gajiKotorStandalone = standaloneSlipsBulanIni.reduce((sum, g) => sum + (g.totalGajiKotor || 0), 0);

      const totalUpahPokok = upahPokokHarian + gajiPokokStandalone;
      const totalUangMakanLembur = uangMakanLemburHarian + bonusTunjanganStandalone;
      const gajiKotor = gajiKotorHarian + gajiKotorStandalone;

      const hakPending = allUpahBulanIni
        .filter((u) => u.status === 'TERCATAT')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);

      // Seluruh upah belum dibayar lintas bulan (penting untuk penggajian akhir bulan / tunggakan bulan sebelumnya)
      const allPendingLintasBulan = (db.upahHarian || []).filter(
        (u) => u.idKaryawan === kry.id && u.status === 'TERCATAT'
      );
      const totalUpahBelumDibayarSemuaPeriode = allPendingLintasBulan.reduce(
        (sum, u) => sum + (u.totalUpahHarian || 0),
        0
      );
      const totalHariBelumDibayarSemuaPeriode = allPendingLintasBulan.length;

      // Saldo Titip Hasil Panen karyawan sebagai Mitra
      const titipPanenKotorMtr = (db.pembelianHasilBumi || [])
        .filter((pb) => pb.idMitra === mitraId && pb.metodePembayaran === 'TITIP')
        .reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const hutangKulakanMtr = (db.pembelianBarang || [])
        .filter((pb) => pb.idMitra === mitraId && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
        .reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const cairTitipanMtr = (db.pencairanTitipan || [])
        .filter((pt) => pt.idMitra === mitraId)
        .reduce((sum, pt) => sum + (pt.nominalPencairan || 0), 0);
      const saldoTitipHasilPanenMitra = Math.max(0, titipPanenKotorMtr + hutangKulakanMtr - cairTitipanMtr);

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

      const hariDalamBulan = new Date(targetTahun, targetBulan, 0).getDate();
      const hariMasukBulanIni = new Set(
        allUpahBulanIni.filter((u) => (u.totalUpahHarian || 0) > 0).map((u) => u.tanggalKerja)
      ).size;
      const hariTidakMasukBulanIni = Math.max(0, hariDalamBulan - hariMasukBulanIni);

      // Add to overall totals
      totalHariKerja += hariMasukBulanIni;
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
        totalHariKerja: hariMasukBulanIni,
        totalHariDalamBulan: hariDalamBulan,
        totalHariTidakMasuk: hariTidakMasukBulanIni,
        totalUpahPokok,
        totalUangMakanLembur,
        totalGajiKotor: gajiKotor,
        totalPotonganBon: potongBon,
        totalGajiBersihDibayar: gajiBersihCair,
        totalHakUpahPending: hakPending,
        standarGajiPokok: 0,
        tunjanganTetap: 0,
        totalUpahBelumDibayarSemuaPeriode,
        totalHariBelumDibayarSemuaPeriode,
        saldoTitipHasilPanenMitra,
        idMitraTerkait: mitraId,
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
  // PERGERAKAN ARUS KAS KEUANGAN TIAP DIVISI
  // ==========================================
  public static getPergerakanKeuanganDivisi(): PergerakanKeuanganDivisiSummary[] {
    const labaRugiDivisi = this.getLabaRugiDivisiSummary();
    const lrMap = new Map(labaRugiDivisi.items.map((it) => [it.idDivisi, it]));

    const db = dbManager.get();
    const allDivisi = dbManager
      .getDivisiList()
      .filter((d) => !isExcludedFromDivisi(d.nama) && !isExcludedFromDivisi(d.id));
    const norm = (s?: string) => String(s || '').trim().toLowerCase();
    const divisiByRekKode = new Map(allDivisi.map((d) => [d.kodeRekening.toUpperCase(), norm(d.nama)]));

    const cleanDiv = (d?: string) => (d && !isExcludedFromDivisi(d) ? d : undefined);
    const resolvePenjualanDivNorm = (divisi?: string, metode?: string) =>
      norm(cleanDiv(divisi) || (metode === 'INTERNAL_PT' ? 'PT Wijaya Agro Perkasa' : 'CV Wijaya Agro'));
    const resolvePembelianBarangDivNorm = (divisi?: string) => norm(cleanDiv(divisi) || 'CV Wijaya Agro');
    const resolveHasilBumiDivNorm = (divisi?: string) => norm(cleanDiv(divisi) || 'Gudang Wijaya Agro');
    const resolveBebanDivNorm = (divisi?: string, rekeningSumber?: string) => {
      const validDiv = cleanDiv(divisi);
      if (validDiv && String(validDiv).trim()) return norm(validDiv);
      if (rekeningSumber) {
        const mapped = divisiByRekKode.get(String(rekeningSumber).toUpperCase());
        if (mapped) return mapped;
      }
      return norm('PT Wijaya Agro Perkasa');
    };

    // Map nota penjualan -> divisi & ringkasan item (untuk pelunasan piutang barang tunai/transfer)
    const penjualanNotaMap = new Map<string, { divisiNorm: string; label: string }>();
    for (const p of db.penjualan || []) {
      if (p.noPenjualan) {
        const ringkas = (p.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        penjualanNotaMap.set(p.noPenjualan, {
          divisiNorm: resolvePenjualanDivNorm(p.divisi, p.metode),
          label: ringkas || p.noPenjualan,
        });
      }
    }
    for (const j of db.penjualanHasilBumi || []) {
      if (j.noPenjualan) {
        penjualanNotaMap.set(j.noPenjualan, {
          divisiNorm: resolveHasilBumiDivNorm(j.divisi),
          label: `${j.komoditasNama} (${j.beratBersih.toLocaleString('id-ID')} Kg)`,
        });
      }
    }

    return allDivisi.map((div) => {
      const targetNorm = norm(div.nama);
      const lrInfo = lrMap.get(div.id);
      const rek = db.rekening.find((r) => r.kode === div.kodeRekening) || {
        kode: div.kodeRekening,
        nama: `Buku Arus Kas ${div.nama}`,
        atasNama: `Divisi ${div.nama}`,
        nomorRekening: div.id,
        saldoAwal: 0,
        saldoSaatIni: 0,
        status: 'AKTIF' as const,
      };

      // 1. Penjualan Masuk (+) — Kasir Toko + Hasil Bumi + Pelunasan Piutang Barang Tunai/Transfer
      const penjualanTokoList = (db.penjualan || []).filter(
        (p) =>
          resolvePenjualanDivNorm(p.divisi, p.metode) === targetNorm &&
          (p.metode === 'TUNAI' || p.metode === 'TRANSFER') &&
          (p.totalNominal || 0) > 0
      );

      const penjualanHasilBumiList = (db.penjualanHasilBumi || []).filter(
        (j) =>
          resolveHasilBumiDivNorm(j.divisi) === targetNorm &&
          (j.metodePembayaran === 'TUNAI' || j.metodePembayaran === 'TRANSFER') &&
          (j.totalNominal || 0) > 0
      );

      let totalPelunasanBonBarang = 0;
      const pelunasanBonEntries: Array<{
        id: string;
        tanggal: string;
        jam: string;
        nominal: number;
        keterangan: string;
        refId: string;
        pihakTerkait: string;
        rekeningFisik: string;
        createdAt?: string;
      }> = [];

      for (const b of db.bayarBon || []) {
        if (b.metode !== 'TUNAI' && b.metode !== 'TRANSFER') continue;
        if (b.isKompensasiTitipan || b.isPotongGaji) continue;
        for (const alok of b.alokasi || []) {
          if (alok.jenis === 'KASBON_BARANG' && (alok.nominalDibayar || 0) > 0) {
            const notaInfo = penjualanNotaMap.get(alok.refId);
            if (notaInfo && notaInfo.divisiNorm === targetNorm) {
              const nom = Number(alok.nominalDibayar) || 0;
              totalPelunasanBonBarang += nom;
              pelunasanBonEntries.push({
                id: `${b.idTransaksi}-${alok.refId}`,
                tanggal: b.tanggal,
                jam: b.jam,
                nominal: nom,
                keterangan: `Pelunasan Piutang Penjualan (${alok.refId}: ${notaInfo.label})`,
                refId: b.idTransaksi,
                pihakTerkait: b.namaMitra,
                rekeningFisik: b.rekeningTujuan || (b.metode === 'TUNAI' ? 'KAS01' : b.metode),
                createdAt: b.createdAt,
              });
            }
          }
        }
      }

      const totalPenjualanMasuk =
        penjualanTokoList.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0) +
        penjualanHasilBumiList.reduce((sum, j) => sum + (Number(j.totalNominal) || 0), 0) +
        totalPelunasanBonBarang;

      // 2. Pembelian / Kulakan = MODAL DAGANG (Barang Dagang + Hasil Bumi Tunai/Transfer)
      const pembelianBarangList = (db.pembelianBarang || []).filter(
        (pb) =>
          resolvePembelianBarangDivNorm(pb.divisi) === targetNorm &&
          (pb.metodePembayaran === 'TUNAI' || pb.metodePembayaran === 'TRANSFER') &&
          (pb.totalNominal || 0) > 0
      );

      const pembelianHasilBumiList = (db.pembelianHasilBumi || []).filter(
        (phb) =>
          resolveHasilBumiDivNorm(phb.divisi) === targetNorm &&
          phb.komoditasKode !== 'PINJAMAN_DANA' &&
          phb.komoditasKode !== 'TITIP_DANA' &&
          !String(phb.komoditasNama || '').toLowerCase().includes('pinjaman uang') &&
          !phb.isBelumPutusHarga &&
          (phb.metodePembayaran === 'TUNAI' || phb.metodePembayaran === 'TRANSFER') &&
          phb.rekeningSumber !== 'TIT01' &&
          phb.rekeningSumber !== 'BON01' &&
          (phb.totalNominal || 0) > 0
      );

      const totalPembelianKeluar =
        pembelianBarangList.reduce((sum, pb) => sum + (Number(pb.totalNominal) || 0), 0) +
        pembelianHasilBumiList.reduce((sum, phb) => sum + (Number(phb.totalNominal) || 0), 0);

      // 3. Dropping dana masuk / transfer ke rekening divisi (+)
      const transferMasuk = (db.transferRekening || []).filter(
        (t) => t.rekeningTujuan === div.kodeRekening && t.status === 'BERHASIL'
      );
      const totalDroppingMasuk = transferMasuk.reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);

      // 4. Transfer dana keluar dari rekening divisi (-)
      const transferKeluar = (db.transferRekening || []).filter(
        (t) => t.rekeningSumber === div.kodeRekening && t.status === 'BERHASIL'
      );
      const totalTransferKeluar = transferKeluar.reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);

      // 5. Gaji karyawan divisi (-) -> Beban Pengurang Saldo Divisi
      const gajiList = (db.penggajian || []).filter(
        (g) => resolveBebanDivNorm(g.divisi, g.rekeningSumber) === targetNorm
      );
      const totalGajiKeluar = gajiList.reduce((sum, g) => sum + (Number(g.gajiBersihDibayar) || 0), 0);

      // 6. Pengeluaran & Biaya operasional divisi (-) -> Beban Pengurang Saldo Divisi
      const pengeluaranList = (db.pengeluaran || []).filter(
        (p) => resolveBebanDivNorm(p.divisi, p.rekeningSumber) === targetNorm
      );
      const totalPengeluaranOperasional = pengeluaranList.reduce(
        (sum, p) => sum + (Number(p.nominal) || 0),
        0
      );

      // Build timeline mutasi gabungan
      const rawMutasi: Array<MutasiKeuanganDivisi & { _sortIso?: string }> = [];

      for (const p of penjualanTokoList) {
        const ringkasItem = (p.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        rawMutasi.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          jenis: 'PENJUALAN_MASUK',
          keterangan: `Penjualan Kasir: ${ringkasItem || 'Barang Dagang'}${p.keterangan ? ` — ${p.keterangan}` : ''}`,
          masuk: Number(p.totalNominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: p.noPenjualan,
          pihakTerkait: p.namaMitra,
          rekeningFisik: p.rekeningTujuan || (p.metode === 'TUNAI' ? 'KAS01' : p.metode),
          _sortIso: p.createdAt,
        });
      }

      for (const j of penjualanHasilBumiList) {
        rawMutasi.push({
          id: j.noPenjualan,
          tanggal: j.tanggal,
          jam: j.jam,
          jenis: 'PENJUALAN_MASUK',
          keterangan: `Penjualan Hasil Bumi: ${j.komoditasNama} (${j.beratBersih.toLocaleString('id-ID')} Kg @ Rp ${j.hargaJualPerKg.toLocaleString('id-ID')}/Kg)`,
          masuk: Number(j.totalNominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: j.noPenjualan,
          pihakTerkait: j.namaMitra,
          rekeningFisik: j.rekeningTujuan || (j.metodePembayaran === 'TUNAI' ? 'KAS01' : j.metodePembayaran),
          _sortIso: j.createdAt,
        });
      }

      for (const pbEntry of pelunasanBonEntries) {
        rawMutasi.push({
          id: pbEntry.id,
          tanggal: pbEntry.tanggal,
          jam: pbEntry.jam,
          jenis: 'PENJUALAN_MASUK',
          keterangan: pbEntry.keterangan,
          masuk: pbEntry.nominal,
          keluar: 0,
          saldoSetelah: 0,
          refId: pbEntry.refId,
          pihakTerkait: pbEntry.pihakTerkait,
          rekeningFisik: pbEntry.rekeningFisik,
          _sortIso: pbEntry.createdAt,
        });
      }

      for (const pb of pembelianBarangList) {
        const ringkasItem = (pb.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        rawMutasi.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          jenis: 'PEMBELIAN_KELUAR',
          keterangan: `[Modal Dagang] Pembelian Barang: ${ringkasItem || 'Barang Dagang'}`,
          masuk: 0,
          keluar: Number(pb.totalNominal) || 0,
          saldoSetelah: 0,
          refId: pb.noPembelian,
          pihakTerkait: pb.namaMitra,
          rekeningFisik: pb.rekeningSumber || (pb.metodePembayaran === 'TUNAI' ? 'KAS01' : pb.metodePembayaran),
          _sortIso: pb.createdAt,
        });
      }

      for (const phb of pembelianHasilBumiList) {
        rawMutasi.push({
          id: phb.noPembelian,
          tanggal: phb.tanggal,
          jam: phb.jam,
          jenis: 'PEMBELIAN_KELUAR',
          keterangan: `[Modal Komoditas] Pembelian Hasil Bumi: ${phb.komoditasNama} (${phb.beratBersih.toLocaleString('id-ID')} Kg @ Rp ${(phb.hargaPerKg || 0).toLocaleString('id-ID')}/Kg)`,
          masuk: 0,
          keluar: Number(phb.totalNominal) || 0,
          saldoSetelah: 0,
          refId: phb.noPembelian,
          pihakTerkait: phb.namaMitra,
          rekeningFisik: phb.rekeningSumber || (phb.metodePembayaran === 'TUNAI' ? 'KAS01' : phb.metodePembayaran),
          _sortIso: phb.createdAt,
        });
      }

      for (const t of transferMasuk) {
        const dariRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
        rawMutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: 'DROPPING_MASUK',
          keterangan: `Dropping Kas dari ${dariRek ? dariRek.nama : t.rekeningSumber} (${t.keterangan || 'Operasional'})`,
          masuk: Number(t.nominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: t.noTransfer,
          pihakTerkait: dariRek ? dariRek.nama : t.rekeningSumber,
          rekeningFisik: t.rekeningSumber,
          _sortIso: t.createdAt,
        });
      }

      for (const t of transferKeluar) {
        const keRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
        rawMutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: 'TRANSFER_KELUAR',
          keterangan: `Transfer Keluar ke ${keRek ? keRek.nama : t.rekeningTujuan} (${t.keterangan || 'Internal'})`,
          masuk: 0,
          keluar: Number(t.nominal) || 0,
          saldoSetelah: 0,
          refId: t.noTransfer,
          pihakTerkait: keRek ? keRek.nama : t.rekeningTujuan,
          rekeningFisik: t.rekeningTujuan,
          _sortIso: t.createdAt,
        });
      }

      for (const g of gajiList) {
        rawMutasi.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          jenis: 'GAJI_KARYAWAN',
          keterangan: `Upah Karyawan: ${g.namaKaryawan} (${g.tipeGaji || 'Harian'}) - Kotor: Rp ${g.totalGajiKotor.toLocaleString('id-ID')}${g.potonganKasbon > 0 ? `, Potong Bon: Rp ${g.potonganKasbon.toLocaleString('id-ID')}` : ''}`,
          masuk: 0,
          keluar: Number(g.gajiBersihDibayar) || 0,
          saldoSetelah: 0,
          refId: g.slipNomor,
          karyawanTerkait: g.namaKaryawan,
          pihakTerkait: g.namaKaryawan,
          rekeningFisik: g.rekeningSumber,
        });
      }

      for (const p of pengeluaranList) {
        rawMutasi.push({
          id: p.idTransaksi,
          tanggal: p.tanggal,
          jam: p.jam,
          jenis: 'PENGELUARAN_OPERASIONAL',
          keterangan: `[Pengurang Saldo] Pengeluaran (${p.kategori}): ${p.keterangan}${p.penerima ? ` — Penerima: ${p.penerima}` : ''}`,
          masuk: 0,
          keluar: Number(p.nominal) || 0,
          saldoSetelah: 0,
          refId: p.idTransaksi,
          pihakTerkait: p.penerima || p.kategori,
          rekeningFisik: p.rekeningSumber,
          _sortIso: p.createdAt,
        });
      }

      // Sort chronological ASCENDING first to compute running cash balance (saldoSetelah)
      rawMutasi.sort((a, b) => {
        const [da, ma, ya] = (a.tanggal || '').split('/').map(Number);
        const [dbD, mb, yb] = (b.tanggal || '').split('/').map(Number);
        const dateA = new Date(ya || 2026, (ma || 1) - 1, da || 1).getTime();
        const dateB = new Date(yb || 2026, (mb || 1) - 1, dbD || 1).getTime();
        if (dateA !== dateB) return dateA - dateB;
        const jamCmp = (a.jam || '').localeCompare(b.jam || '');
        if (jamCmp !== 0) return jamCmp;
        return (a._sortIso || '').localeCompare(b._sortIso || '');
      });

      let runningSaldoKas = Number(rek.saldoAwal) || 0;
      const mutasiWithSaldo: MutasiKeuanganDivisi[] = rawMutasi.map((item) => {
        runningSaldoKas = Math.round(runningSaldoKas + (item.masuk || 0) - (item.keluar || 0));
        const { _sortIso: _unused, ...clean } = item;
        return {
          ...clean,
          saldoSetelah: runningSaldoKas,
        };
      });

      // Reverse to newest-first for display
      mutasiWithSaldo.reverse();

      const karyawanSet = new Set<string>();
      gajiList.forEach((g) => karyawanSet.add(g.namaKaryawan));

      const totalArusMasuk = totalPenjualanMasuk + totalDroppingMasuk;
      const totalBebanPengeluaran = totalPengeluaranOperasional + totalGajiKeluar;
      const totalArusKeluar =
        totalPembelianKeluar +
        totalPengeluaranOperasional +
        totalGajiKeluar +
        totalTransferKeluar;

      return {
        divisi: div.nama,
        idDivisi: div.id,
        kodeRekening: div.kodeRekening,
        namaRekening: rek.nama,
        penanggungJawab: div.penanggungJawab,
        deskripsi: div.deskripsi,
        logoUrl: div.logoUrl,
        saldoSaatIni: rek.saldoSaatIni,
        saldoKasTunaiDivisi: lrInfo?.saldoKasTunaiDivisi ?? runningSaldoKas,
        totalPenjualanMasuk,
        totalOmzetPenjualan: lrInfo?.totalOmzetPenjualan ?? totalPenjualanMasuk,
        totalPembelianKeluar,
        totalModalPembelian: lrInfo?.totalModalPembelian ?? totalPembelianKeluar,
        modalTerpakaiHpp: lrInfo?.modalTerpakaiHpp ?? 0,
        sisaModalStokBerjalan: lrInfo?.sisaModalStokBerjalan ?? 0,
        labaKotorDagang: lrInfo?.labaKotorDagang ?? 0,
        totalPengeluaranOperasional,
        totalDroppingMasuk,
        totalGajiKeluar,
        totalBebanPengeluaran,
        labaRugiBersih: lrInfo?.labaRugiBersih ?? 0,
        totalTransferKeluar,
        totalArusMasuk,
        totalArusKeluar,
        totalTransaksiGaji: mutasiWithSaldo.length,
        daftarKaryawanTerakhir: Array.from(karyawanSet).slice(0, 5),
        mutasi: mutasiWithSaldo,
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

    // 1. Kasbon Barang Toko & Piutang Penjualan Hasil Bumi
    const kasbonBarangList = db.penjualan.filter((p) => p.idMitra === mitra.id && p.metode === 'KASBON');
    const piutangHasilBumiList = (db.penjualanHasilBumi || []).filter(
      (j) => j.idMitra === mitra.id && j.metodePembayaran === 'PIUTANG'
    );
    const totalKasbonBarang =
      kasbonBarangList.reduce((s, p) => s + (p.sisaPiutang || 0), 0) +
      piutangHasilBumiList.reduce((s, j) => s + (j.sisaPiutang || 0), 0);

    // 2. Kasbon Uang
    const kasbonUangList = db.kasbonUang.filter((k) => k.idMitra === mitra.id);
    const totalKasbonUang = kasbonUangList.reduce((s, k) => s + (k.sisaKasbon || 0), 0);

    // 3. Titip Hasil Bumi, Pinjaman Uang, & Hutang Kulakan Supplier (Kewajiban PT kepada Mitra)
    const titipHasilBumiKotor = db.pembelianHasilBumi
      .filter((p) => p.idMitra === mitra.id && p.metodePembayaran === 'TITIP')
      .reduce((s, p) => s + p.totalNominal, 0);
    const hutangKulakanKotor = (db.pembelianBarang || [])
      .filter((pb) => pb.idMitra === mitra.id && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
      .reduce((s, pb) => s + (pb.totalNominal || 0), 0);
    const titipKotor = titipHasilBumiKotor + hutangKulakanKotor;
    const totalPencairanMitra = (db.pencairanTitipan || [])
      .filter((pt) => pt.idMitra === mitra.id)
      .reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const totalTitipPanenMurni = Math.max(0, titipKotor - totalPencairanMitra);

    // 3b. Integrasi Karyawan <-> Mitra (Karyawan juga bisa jadi Mitra: rekap Hak Gaji & Slip Gaji di Rekening Mitra)
    const linkedKaryawan = (db.karyawan || []).find(
      (k) =>
        (mitra.idKaryawanTerkait && k.id === mitra.idKaryawanTerkait) ||
        k.idMitraTerkait === mitra.id ||
        (k.nik && k.nik === mitra.kode) ||
        (!mitra.isAnakPerusahaan &&
          mitra.role !== 'ANAK_PERUSAHAAN' &&
          String(k.nama || '').trim().toLowerCase() === String(mitra.nama || '').trim().toLowerCase())
    );
    const linkedUpahList = linkedKaryawan
      ? (db.upahHarian || []).filter((u) => u.idKaryawan === linkedKaryawan.id)
      : [];
    const linkedPenggajianList = linkedKaryawan
      ? (db.penggajian || []).filter((g) => g.idKaryawan === linkedKaryawan.id)
      : [];
    const totalUpahBelumDibayar = linkedUpahList
      .filter((u) => u.status === 'TERCATAT')
      .reduce((s, u) => s + (u.totalUpahHarian || 0), 0);
    const totalGajiSudahDibayar = linkedPenggajianList.reduce(
      (s, g) => s + (Number(g.totalGajiKotor) || Number(g.gajiBersihDibayar) || 0),
      0
    );

    // Total hak mitra keseluruhan yang masih tersimpan di PT = Titip Hasil Panen + Upah Kerja Belum Cair
    const totalTitip = totalTitipPanenMurni + totalUpahBelumDibayar;

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
      nominalMutasiHak?: number;
      kategoriMutasiHak?: 'TITIP_MASUK' | 'TITIP_CAIR' | 'UPAH_TERCATAT' | 'UPAH_SUDAH_CAIR' | 'SLIP_GAJI';
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

    // Penjualan Hasil Bumi keluar gudang ke Mitra ini
    for (const jhb of (db.penjualanHasilBumi || []).filter((item) => item.idMitra === mitra.id)) {
      const isPiutang = jhb.metodePembayaran === 'PIUTANG';
      timeline.push({
        id: jhb.noPenjualan,
        tanggal: jhb.tanggal,
        jam: jhb.jam,
        createdAt: jhb.createdAt,
        jenis: isPiutang ? 'PIUTANG JUAL HASIL BUMI' : `JUAL HASIL BUMI (${jhb.metodePembayaran})`,
        keterangan: isPiutang
          ? `Piutang Penjualan Hasil Bumi ${jhb.komoditasNama} (${jhb.beratBersih} Kg @ Rp ${jhb.hargaJualPerKg.toLocaleString('id-ID')})`
          : `Penjualan Hasil Bumi Lunas (${jhb.metodePembayaran}) via ${jhb.rekeningTujuan}: ${jhb.komoditasNama} (${jhb.beratBersih} Kg)`,
        qtyDisplay: `${jhb.beratBersih.toLocaleString('id-ID')} Kg`,
        hargaSatuanDisplay: `Rp ${jhb.hargaJualPerKg.toLocaleString('id-ID')}`,
        itemsDetail: [
          {
            nama: `Hasil Bumi: ${jhb.komoditasNama}`,
            qty: jhb.beratBersih,
            satuan: 'Kg',
            harga: jhb.hargaJualPerKg,
            subtotal: jhb.totalNominal,
          },
        ],
        debet: isPiutang ? jhb.totalNominal : 0,
        kredit: 0,
      });
    }

    // Kasbon uang to this mitra (Termasuk Nota Lalu Piutang Barang Masa Lalu)
    for (const k of kasbonUangList) {
      const isNotaLalu = k.isNotaLalu || k.keterangan?.includes('Nota Lalu') || k.rekeningSumber === 'BON01';
      const noNotaLabel = k.noNotaLalu ? ` [No. Nota: ${k.noNotaLalu}]` : '';
      const fotoK = (k.fotoNotaList && k.fotoNotaList.length > 0) ? k.fotoNotaList.join('|||') : (k.fotoNota || '');

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
        fotoNota: fotoK,
        isNotaLalu,
        noNotaLalu: k.noNotaLalu,
      });
    }

    // Payments by this mitra
    for (const b of bayarBonList) {
      const isSinkronBon =
        b.metode === 'SINKRON' ||
        b.metode === 'KOMPENSASI_TITIP' ||
        b.rekeningTujuan === 'SINKRON' ||
        Boolean(b.isKompensasiTitipan);
      timeline.push({
        id: b.idTransaksi,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        jenis: isSinkronBon ? 'PELUNASAN BON (SINKRON POTONG TITIPAN)' : 'PEMBAYARAN BON',
        keterangan: isSinkronBon
          ? `Pelunasan Bon via Rekening SINKRON (Potong Saldo Titipan / Uang Hasil Bumi — Tanpa Uang Fisik) - ${b.keterangan}`
          : `Setoran Bayar Bon via ${b.metode} (${b.rekeningTujuan}) - ${b.keterangan}`,
        qtyDisplay: '1',
        hargaSatuanDisplay: `Rp ${b.nominalBayar.toLocaleString('id-ID')}`,
        itemsDetail: [
          {
            nama: isSinkronBon
              ? 'Pelunasan Bon via SINKRON (Potong Titipan Hasil Bumi)'
              : `Setoran Pelunasan Bon (${b.metode})`,
            qty: 1,
            satuan: isSinkronBon ? 'Sinkron' : 'Setoran',
            harga: b.nominalBayar,
            subtotal: b.nominalBayar,
          },
        ],
        debet: 0,
        kredit: b.nominalBayar,
        fotoNota: b.fotoBukti || b.fotoNota,
      });
    }

    // Pembelian hasil bumi (TITIP maupun TUNAI/TRANSFER) dengan Mitra ini
    for (const pb of db.pembelianHasilBumi.filter((item) => item.idMitra === mitra.id)) {
      const fotoPb = (pb.fotoNotaList && pb.fotoNotaList.length > 0) ? pb.fotoNotaList.join('|||') : (pb.fotoNota || '');
      if (pb.metodePembayaran === 'TITIP') {
        const isPinjaman = pb.komoditasKode === 'PINJAMAN_DANA' || pb.komoditasNama?.includes('Pinjaman Uang');
        const isNotaLalu = pb.isNotaLalu || pb.keterangan?.includes('Nota Lalu') || pb.komoditasKode === 'TITIP_DANA';
        const noNotaLabel = pb.noNotaLalu ? ` [No. Nota: ${pb.noNotaLalu}]` : '';

        const jenisLabel = isPinjaman
          ? 'PINJAMAN UANG PT KE MITRA (SALDO TITIP)'
          : isNotaLalu
          ? 'NOTA LALU (TITIPAN UANG/PANEN)'
          : 'TITIP HASIL BUMI';

        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggalNotaLalu || pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: jenisLabel,
          keterangan: isPinjaman
            ? `${pb.keterangan || 'Pinjaman Uang dari PT ke Mitra (Masuk Saldo Titip)'}${noNotaLabel}`
            : isNotaLalu
            ? `${pb.keterangan || 'Titipan Dana / Panen Masa Lalu'}${noNotaLabel}`
            : `Penjualan Hasil Bumi ${pb.komoditasNama} ${pb.beratBersih} kg (Titip/Hutang Pabrik)`,
          qtyDisplay: isPinjaman ? 'Dana Tunai' : (pb.beratBersih > 0 ? `${pb.beratBersih.toLocaleString('id-ID')} Kg` : '1 (Dana)'),
          hargaSatuanDisplay: `Rp ${pb.totalNominal.toLocaleString('id-ID')}`,
          itemsDetail: [
            {
              nama: isPinjaman
                ? `Pinjaman Uang dari PT ke Mitra (Masuk Saldo Titip)`
                : isNotaLalu
                ? `Titipan Uang / Panen Nota Lalu (${pb.noNotaLalu || 'Nota Titip Lama'})`
                : `Hasil Panen: ${pb.komoditasNama}`,
              qty: 1,
              satuan: isPinjaman ? 'Dana' : (pb.beratBersih > 0 ? 'Kg' : 'Titip'),
              harga: pb.totalNominal,
              subtotal: pb.totalNominal,
            },
          ],
          debet: 0,
          kredit: 0,
          nominalMutasiHak: pb.totalNominal,
          kategoriMutasiHak: 'TITIP_MASUK',
          fotoNota: fotoPb,
          isNotaLalu: isPinjaman ? true : isNotaLalu,
          noNotaLalu: pb.noNotaLalu,
        });
      } else {
        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: `BELI HASIL BUMI (${pb.metodePembayaran})`,
          keterangan: `Pembelian Lunas ${pb.komoditasNama} ${pb.beratBersih} kg via ${pb.rekeningSumber}`,
          qtyDisplay: `${pb.beratBersih.toLocaleString('id-ID')} Kg`,
          hargaSatuanDisplay: `Rp ${(pb.hargaPerKg || 0).toLocaleString('id-ID')}`,
          itemsDetail: [
            {
              nama: `Hasil Bumi Lunas: ${pb.komoditasNama}`,
              qty: pb.beratBersih,
              satuan: 'Kg',
              harga: pb.hargaPerKg || 0,
              subtotal: pb.totalNominal,
            },
          ],
          debet: 0,
          kredit: 0,
          fotoNota: fotoPb,
        });
      }
    }

    // Pembelian Barang / Kulakan dari Mitra (Supplier / Distributor)
    for (const kpb of (db.pembelianBarang || []).filter((item) => item.idMitra === mitra.id)) {
      const totalQty = (kpb.items || []).reduce((s, i) => s + i.qty, 0);
      const rincianKulakan = (kpb.items || [])
        .map((i) => `${i.namaProduk} (${i.qty} ${i.satuan} @ Rp ${i.hargaBeliSatuan.toLocaleString('id-ID')})`)
        .join(', ');
      const isHutang = kpb.metodePembayaran === 'HUTANG';
      timeline.push({
        id: kpb.noPembelian,
        tanggal: kpb.tanggal,
        jam: kpb.jam,
        createdAt: kpb.createdAt,
        jenis: isHutang ? 'HUTANG KULAKAN SUPPLIER (SALDO TITIP)' : `KULAKAN SUPPLIER (${kpb.metodePembayaran})`,
        keterangan: isHutang
          ? `Hutang Pembelian Barang dari Supplier: ${rincianKulakan || kpb.keterangan}`
          : `Kulakan Lunas (${kpb.metodePembayaran}) via ${kpb.rekeningSumber}: ${rincianKulakan || kpb.keterangan}`,
        qtyDisplay: kpb.items?.length === 1 ? `${kpb.items[0].qty} ${kpb.items[0].satuan}` : `${totalQty} unit (${kpb.items?.length || 0} item)`,
        hargaSatuanDisplay: `Rp ${kpb.totalNominal.toLocaleString('id-ID')}`,
        itemsDetail: (kpb.items || []).map((i) => ({
          nama: i.namaProduk,
          qty: i.qty,
          satuan: i.satuan,
          harga: i.hargaBeliSatuan,
          subtotal: i.subtotal,
        })),
        debet: 0,
        kredit: 0,
        fotoNota: kpb.fotoNota || '',
      });
    }

    // Pencairan Titipan oleh Mitra (Pengembalian / Penarikan Dana Titipan atau Sinkron Potong Bon)
    for (const pt of (db.pencairanTitipan || []).filter((item) => item.idMitra === mitra.id)) {
      const isSinkronTitip =
        pt.metodePembayaran === 'SINKRON' ||
        pt.metodePembayaran === 'KOMPENSASI_BON' ||
        pt.rekeningSumber === 'SINKRON' ||
        Boolean(pt.isKompensasiBon);
      timeline.push({
        id: pt.idPencairan,
        tanggal: pt.tanggal,
        jam: pt.jam,
        createdAt: pt.createdAt,
        jenis: isSinkronTitip ? 'POTONG TITIPAN (SINKRON PELUNASAN BON)' : 'PENCAIRAN TITIPAN',
        keterangan: isSinkronTitip
          ? `Pemotongan Saldo Titipan / Uang Hasil Bumi via Rekening SINKRON untuk Pelunasan Bon - ${pt.keterangan}`
          : `Pencairan Saldo Titip via ${pt.metodePembayaran} (${pt.rekeningSumber}) - ${pt.keterangan}`,
        qtyDisplay: '1',
        hargaSatuanDisplay: `Rp ${pt.nominalPencairan.toLocaleString('id-ID')}`,
        itemsDetail: [
          {
            nama: isSinkronTitip
              ? 'Potong Saldo Titipan / Uang Hasil Bumi (SINKRON Bon)'
              : 'Pencairan / Penarikan Saldo Titip Mitra',
            qty: 1,
            satuan: isSinkronTitip ? 'Sinkron' : 'Pencairan',
            harga: pt.nominalPencairan,
            subtotal: pt.nominalPencairan,
          },
        ],
        debet: 0,
        kredit: 0,
        nominalMutasiHak: pt.nominalPencairan,
        kategoriMutasiHak: 'TITIP_CAIR',
      });
    }

    // Mutasi Hak Upah Kerja & Slip Pembayaran Gaji (Apabila Mitra ini juga terdaftar sebagai Karyawan PT)
    if (linkedKaryawan) {
      for (const u of linkedUpahList) {
        const jamUpah =
          u.createdAt && u.createdAt.includes('T')
            ? new Date(u.createdAt)
                .toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })
                .replace(/\./g, ':')
            : '08:00:00';
        const isPaid = u.status === 'SUDAH_DIBAYAR';
        const uraianTugas = u.item || u.keterangan || `Tugas Harian di ${u.divisi}`;
        timeline.push({
          id: u.id,
          tanggal: u.tanggalKerja,
          jam: jamUpah,
          createdAt: u.createdAt || u.tanggalKerja,
          jenis: isPaid ? 'UPAH KERJA (SUDAH CAIR)' : 'UPAH KERJA (BELUM CAIR)',
          keterangan: `[${u.divisi}] ${uraianTugas}${u.catatan ? ` (${u.catatan})` : ''} — ${
            isPaid
              ? `Sudah dibayarkan pada ${u.tanggalDibayar || '-'}${u.idPayrollSettlement ? ` (${u.idPayrollSettlement})` : ''}`
              : 'Hak Gaji / Upah Karyawan Tercatat (Belum Dicairkan)'
          }`,
          qtyDisplay: `${u.kuantiti !== undefined ? u.kuantiti : 1} Hari`,
          hargaSatuanDisplay: `Rp ${(u.totalUpahHarian || 0).toLocaleString('id-ID')}`,
          itemsDetail: [
            {
              nama: `Upah Kerja [${u.divisi}]: ${uraianTugas}`,
              qty: u.kuantiti !== undefined ? u.kuantiti : 1,
              satuan: 'Hari',
              harga: u.harga !== undefined ? u.harga : u.upahHarian || u.totalUpahHarian || 0,
              subtotal: u.totalUpahHarian || 0,
            },
          ],
          debet: 0,
          kredit: 0,
          nominalMutasiHak: u.totalUpahHarian || 0,
          kategoriMutasiHak: isPaid ? 'UPAH_SUDAH_CAIR' : 'UPAH_TERCATAT',
        });
      }

      for (const g of linkedPenggajianList) {
        timeline.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam || '16:00:00',
          createdAt: `${g.tanggal} ${g.jam || '16:00:00'}`,
          jenis: 'PEMBAYARAN GAJI KARYAWAN',
          keterangan: `Slip Gaji [${g.slipNomor}] (${g.periodeBulan}) via ${g.metodePembayaran} (${g.rekeningSumber}) — Gaji Kotor Rp ${g.totalGajiKotor.toLocaleString(
            'id-ID'
          )}${
            g.potonganKasbon > 0
              ? ` · Potong Kasbon Rp ${g.potonganKasbon.toLocaleString('id-ID')}`
              : ''
          } · Cair Bersih Rp ${g.gajiBersihDibayar.toLocaleString('id-ID')}`,
          qtyDisplay: g.jumlahHariKerja ? `${g.jumlahHariKerja} Hari` : '1 Slip',
          hargaSatuanDisplay: `Rp ${g.totalGajiKotor.toLocaleString('id-ID')}`,
          itemsDetail: [
            {
              nama: `Slip Gaji ${g.slipNomor} (${g.periodeBulan}) — Cair Bersih via ${g.rekeningSumber}`,
              qty: 1,
              satuan: 'Slip',
              harga: g.gajiBersihDibayar,
              subtotal: g.totalGajiKotor,
            },
          ],
          debet: 0,
          kredit: 0,
          nominalMutasiHak: g.gajiBersihDibayar,
          kategoriMutasiHak: 'SLIP_GAJI',
        });
      }
    }

    // ====================================================================
    // INTEGRASI 1 TRANSAKSI TERPADU: ANAK PERUSAHAAN & MITRA (DP PARABOT)
    // Jika mitra ini adalah Anak Perusahaan yang memiliki Rekening terkait
    // (misal MTR-DPPARABOT <-> REK-DPPARABO), seluruh transaksi di Rekening
    // tersebut otomatis disatukan sebagai 1 transaksi di buku besar mitra!
    // ====================================================================
    const linkedRek =
      (mitra.kodeRekeningTerkait && db.rekening.find((r) => r.kode === mitra.kodeRekeningTerkait)) ||
      db.rekening.find((r) => r.idMitraTerkait === mitra.id && this.isAnakPerusahaanRekening(r));
    const isAnakPerusahaan = Boolean(mitra.isAnakPerusahaan || mitra.role === 'ANAK_PERUSAHAAN' || linkedRek);

    let totalSimpanKeAnakPerusahaan = 0;
    let totalPakaiDariAnakPerusahaan = 0;

    if (isAnakPerusahaan && linkedRek) {
      const rekKode = linkedRek.kode;
      const seenIds = new Set(timeline.map((item) => item.id));

      if ((linkedRek.saldoAwal || 0) !== 0) {
        const awalAbs = Math.abs(linkedRek.saldoAwal);
        if (linkedRek.saldoAwal > 0) {
          totalSimpanKeAnakPerusahaan += linkedRek.saldoAwal;
        } else {
          totalPakaiDariAnakPerusahaan += awalAbs;
        }
        timeline.push({
          id: `SALDO-AWAL-${rekKode}`,
          tanggal: '01/01/2026',
          jam: '00:00:00',
          createdAt: '2026-01-01T00:00:00.000Z',
          jenis: linkedRek.saldoAwal >= 0 ? 'SALDO AWAL ANAK PERUSAHAAN (+)' : 'SALDO AWAL TALANGAN ANAK PERUSAHAAN (-)',
          keterangan: `Saldo awal buku rekening Anak Perusahaan ${linkedRek.nama} (${rekKode})`,
          qtyDisplay: 'Saldo Awal',
          hargaSatuanDisplay: `Rp ${awalAbs.toLocaleString('id-ID')}`,
          itemsDetail: [
            {
              nama: `Saldo Awal Rekening ${linkedRek.nama} (${rekKode})`,
              qty: 1,
              satuan: 'Buku',
              harga: awalAbs,
              subtotal: awalAbs,
            },
          ],
          debet: 0,
          kredit: 0,
        });
      }

      // A. Transfer Rekening masuk / keluar dari Rekening Anak Perusahaan
      for (const trf of db.transferRekening || []) {
        if (trf.status !== 'BERHASIL') continue;
        if (trf.rekeningTujuan === rekKode) {
          totalSimpanKeAnakPerusahaan += trf.nominal;
          if (!seenIds.has(trf.noTransfer)) {
            seenIds.add(trf.noTransfer);
            const dariRek = db.rekening.find((r) => r.kode === trf.rekeningSumber);
            timeline.push({
              id: trf.noTransfer,
              tanggal: trf.tanggal,
              jam: trf.jam,
              createdAt: trf.createdAt,
              jenis: 'SIMPAN DANA KE ANAK PERUSAHAAN',
              keterangan: `Simpan / Titip Dana PT dari ${dariRek?.nama || trf.rekeningSumber} (${trf.rekeningSumber}) ke ${linkedRek.nama} — ${trf.keterangan || '1 Transaksi Terpadu'}`,
              qtyDisplay: '1 Mutasi',
              hargaSatuanDisplay: `Rp ${trf.nominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Simpan Dana PT ke ${linkedRek.nama} (Dari ${trf.rekeningSumber})`,
                  qty: 1,
                  satuan: 'Mutasi',
                  harga: trf.nominal,
                  subtotal: trf.nominal,
                },
              ],
              debet: 0,
              kredit: 0,
            });
          }
        } else if (trf.rekeningSumber === rekKode) {
          totalPakaiDariAnakPerusahaan += trf.nominal;
          if (!seenIds.has(trf.noTransfer)) {
            seenIds.add(trf.noTransfer);
            const keRek = db.rekening.find((r) => r.kode === trf.rekeningTujuan);
            timeline.push({
              id: trf.noTransfer,
              tanggal: trf.tanggal,
              jam: trf.jam,
              createdAt: trf.createdAt,
              jenis: 'TARIK / TALANGAN DARI ANAK PERUSAHAAN',
              keterangan: `Tarik / Talangan Dana dari ${linkedRek.nama} (${rekKode}) ke ${keRek?.nama || trf.rekeningTujuan} — ${trf.keterangan || '1 Transaksi Terpadu'}`,
              qtyDisplay: '1 Mutasi',
              hargaSatuanDisplay: `Rp ${trf.nominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Tarik / Talangan Dana dari ${linkedRek.nama} (Ke ${trf.rekeningTujuan})`,
                  qty: 1,
                  satuan: 'Mutasi',
                  harga: trf.nominal,
                  subtotal: trf.nominal,
                },
              ],
              debet: 0,
              kredit: 0,
            });
          }
        }
      }

      // B. Penjualan Toko yang uangnya disetor langsung ke Rekening Anak Perusahaan
      for (const pj of db.penjualan || []) {
        if (pj.rekeningTujuan === rekKode && pj.metode !== 'KASBON') {
          totalSimpanKeAnakPerusahaan += pj.totalNominal;
          if (!seenIds.has(pj.noPenjualan)) {
            seenIds.add(pj.noPenjualan);
            const rincian = (pj.items || []).map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ');
            timeline.push({
              id: pj.noPenjualan,
              tanggal: pj.tanggal,
              jam: pj.jam,
              createdAt: pj.createdAt,
              jenis: 'SETORAN PENJUALAN KE ANAK PERUSAHAAN',
              keterangan: `Uang penjualan toko (${pj.namaMitra}) disimpan di ${linkedRek.nama}: ${rincian}`,
              qtyDisplay: '1 Nota',
              hargaSatuanDisplay: `Rp ${pj.totalNominal.toLocaleString('id-ID')}`,
              itemsDetail: (pj.items || []).map((i) => ({
                nama: i.namaProduk,
                qty: i.qty,
                satuan: i.satuan,
                harga: i.harga,
                subtotal: i.subtotal,
              })),
              debet: 0,
              kredit: 0,
            });
          }
        }
      }

      // C. Pembayaran Bon Mitra lain yang ditampung di Rekening Anak Perusahaan
      for (const bb of db.bayarBon || []) {
        if (bb.rekeningTujuan === rekKode) {
          totalSimpanKeAnakPerusahaan += bb.nominalBayar;
          if (!seenIds.has(bb.idTransaksi)) {
            seenIds.add(bb.idTransaksi);
            timeline.push({
              id: bb.idTransaksi,
              tanggal: bb.tanggal,
              jam: bb.jam,
              createdAt: bb.createdAt,
              jenis: 'SETORAN BAYAR BON KE ANAK PERUSAHAAN',
              keterangan: `Setoran pelunasan bon ${bb.namaMitra} disimpan di ${linkedRek.nama} — ${bb.keterangan}`,
              qtyDisplay: '1 Setoran',
              hargaSatuanDisplay: `Rp ${bb.nominalBayar.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Setoran Bayar Bon ${bb.namaMitra} ke ${linkedRek.nama}`,
                  qty: 1,
                  satuan: 'Setoran',
                  harga: bb.nominalBayar,
                  subtotal: bb.nominalBayar,
                },
              ],
              debet: 0,
              kredit: 0,
              fotoNota: bb.fotoBukti || bb.fotoNota,
            });
          }
        }
      }

      // D. Pembelian Hasil Bumi / Pinjaman Dana yang menggunakan Rekening Anak Perusahaan
      for (const pb of db.pembelianHasilBumi || []) {
        if (pb.rekeningSumber === rekKode) {
          const isPinjaman = pb.komoditasKode === 'PINJAMAN_DANA' || pb.komoditasNama?.includes('Pinjaman Uang');
          if (isPinjaman) {
            totalSimpanKeAnakPerusahaan += pb.totalNominal;
          } else if (pb.metodePembayaran !== 'TITIP') {
            totalPakaiDariAnakPerusahaan += pb.totalNominal;
          }
          if (!seenIds.has(pb.noPembelian)) {
            seenIds.add(pb.noPembelian);
            timeline.push({
              id: pb.noPembelian,
              tanggal: pb.tanggal,
              jam: pb.jam,
              createdAt: pb.createdAt,
              jenis: isPinjaman
                ? 'TERIMA PINJAMAN DANA DI ANAK PERUSAHAAN'
                : 'BAYAR HASIL BUMI VIA ANAK PERUSAHAAN',
              keterangan: isPinjaman
                ? `Dana pinjaman dari ${pb.namaMitra} diterima di ${linkedRek.nama}`
                : `Pembayaran hasil bumi ${pb.komoditasNama} (${pb.beratBersih} kg - ${pb.namaMitra}) via dana ${linkedRek.nama}`,
              qtyDisplay: pb.beratBersih > 0 ? `${pb.beratBersih.toLocaleString('id-ID')} Kg` : '1 Trx',
              hargaSatuanDisplay: `Rp ${pb.totalNominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: isPinjaman ? `Pinjaman Dana (${pb.namaMitra})` : `${pb.komoditasNama} (${pb.namaMitra})`,
                  qty: pb.beratBersih > 0 ? pb.beratBersih : 1,
                  satuan: pb.beratBersih > 0 ? 'Kg' : 'Trx',
                  harga: pb.beratBersih > 0 ? pb.hargaPerKg : pb.totalNominal,
                  subtotal: pb.totalNominal,
                },
              ],
              debet: 0,
              kredit: 0,
              fotoNota: pb.fotoNota,
            });
          }
        }
      }

      // E. Kulakan Barang Supplier yang dibayar memakai Rekening Anak Perusahaan
      for (const kpb of db.pembelianBarang || []) {
        if (kpb.rekeningSumber === rekKode && kpb.metodePembayaran !== 'HUTANG') {
          totalPakaiDariAnakPerusahaan += kpb.totalNominal;
          if (!seenIds.has(kpb.noPembelian)) {
            seenIds.add(kpb.noPembelian);
            const rincian = (kpb.items || []).map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ');
            timeline.push({
              id: kpb.noPembelian,
              tanggal: kpb.tanggal,
              jam: kpb.jam,
              createdAt: kpb.createdAt,
              jenis: 'BAYAR KULAKAN VIA ANAK PERUSAHAAN',
              keterangan: `Pembayaran kulakan supplier ${kpb.namaMitra} menggunakan dana ${linkedRek.nama}: ${rincian}`,
              qtyDisplay: '1 Faktur',
              hargaSatuanDisplay: `Rp ${kpb.totalNominal.toLocaleString('id-ID')}`,
              itemsDetail: (kpb.items || []).map((i) => ({
                nama: i.namaProduk,
                qty: i.qty,
                satuan: i.satuan,
                harga: i.hargaBeliSatuan,
                subtotal: i.subtotal,
              })),
              debet: 0,
              kredit: 0,
              fotoNota: kpb.fotoNota,
            });
          }
        }
      }

      // F. Kasbon Uang Mitra yang dicairkan dari Rekening Anak Perusahaan
      for (const ku of db.kasbonUang || []) {
        if (ku.rekeningSumber === rekKode && !ku.isNotaLalu) {
          totalPakaiDariAnakPerusahaan += ku.nominal;
          if (!seenIds.has(ku.idTransaksi)) {
            seenIds.add(ku.idTransaksi);
            timeline.push({
              id: ku.idTransaksi,
              tanggal: ku.tanggal,
              jam: ku.jam,
              createdAt: ku.createdAt,
              jenis: 'CAIRKAN KASBON VIA ANAK PERUSAHAAN',
              keterangan: `Pencairan kasbon uang untuk ${ku.namaMitra} dari dana ${linkedRek.nama} — ${ku.keterangan}`,
              qtyDisplay: '1 Trx',
              hargaSatuanDisplay: `Rp ${ku.nominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Kasbon Uang ${ku.namaMitra} via ${linkedRek.nama}`,
                  qty: 1,
                  satuan: 'Trx',
                  harga: ku.nominal,
                  subtotal: ku.nominal,
                },
              ],
              debet: 0,
              kredit: 0,
              fotoNota: ku.fotoNota,
            });
          }
        }
      }

      // G. Pencairan Titipan Petani yang dibayar dari Rekening Anak Perusahaan
      for (const pt of db.pencairanTitipan || []) {
        if (pt.rekeningSumber === rekKode && pt.metodePembayaran !== 'KOMPENSASI_BON' && !pt.isKompensasiBon) {
          totalPakaiDariAnakPerusahaan += pt.nominalPencairan;
          if (!seenIds.has(pt.idPencairan)) {
            seenIds.add(pt.idPencairan);
            timeline.push({
              id: pt.idPencairan,
              tanggal: pt.tanggal,
              jam: pt.jam,
              createdAt: pt.createdAt,
              jenis: 'PENCAIRAN TITIPAN VIA ANAK PERUSAHAAN',
              keterangan: `Pembayaran titipan hasil bumi ${pt.namaMitra} menggunakan dana ${linkedRek.nama} — ${pt.keterangan}`,
              qtyDisplay: '1 Trx',
              hargaSatuanDisplay: `Rp ${pt.nominalPencairan.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Pencairan Titipan ${pt.namaMitra} via ${linkedRek.nama}`,
                  qty: 1,
                  satuan: 'Trx',
                  harga: pt.nominalPencairan,
                  subtotal: pt.nominalPencairan,
                },
              ],
              debet: 0,
              kredit: 0,
            });
          }
        }
      }

      // H. Beban / Pengeluaran Operasional yang dibayar dari Rekening Anak Perusahaan
      for (const exp of db.pengeluaran || []) {
        if (exp.rekeningSumber === rekKode) {
          totalPakaiDariAnakPerusahaan += exp.nominal;
          if (!seenIds.has(exp.idTransaksi)) {
            seenIds.add(exp.idTransaksi);
            timeline.push({
              id: exp.idTransaksi,
              tanggal: exp.tanggal,
              jam: exp.jam,
              createdAt: exp.createdAt,
              jenis: 'BIAYA OPERASIONAL VIA ANAK PERUSAHAAN',
              keterangan: `Pengeluaran [${exp.divisi}] ${exp.kategori}: ${exp.keterangan} dibayar via ${linkedRek.nama}`,
              qtyDisplay: '1 Biaya',
              hargaSatuanDisplay: `Rp ${exp.nominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `[${exp.divisi}] ${exp.kategori} — ${exp.keterangan}`,
                  qty: 1,
                  satuan: 'Biaya',
                  harga: exp.nominal,
                  subtotal: exp.nominal,
                },
              ],
              debet: 0,
              kredit: 0,
              fotoNota: exp.fotoKuitansi,
            });
          }
        }
      }

      // I. Penggajian Karyawan yang dibayar dari Rekening Anak Perusahaan
      for (const g of db.penggajian || []) {
        if (g.rekeningSumber === rekKode) {
          totalPakaiDariAnakPerusahaan += g.gajiBersihDibayar;
          if (!seenIds.has(g.id)) {
            seenIds.add(g.id);
            timeline.push({
              id: g.id,
              tanggal: g.tanggal,
              jam: g.jam,
              createdAt: `${g.tanggal} ${g.jam}`,
              jenis: 'BAYAR UPAH VIA ANAK PERUSAHAAN',
              keterangan: `Pembayaran gaji/upah ${g.namaKaryawan} (${g.divisi}) via ${linkedRek.nama}`,
              qtyDisplay: '1 Slip',
              hargaSatuanDisplay: `Rp ${g.gajiBersihDibayar.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Gaji ${g.namaKaryawan} (${g.periodeBulan})`,
                  qty: 1,
                  satuan: 'Slip',
                  harga: g.gajiBersihDibayar,
                  subtotal: g.gajiBersihDibayar,
                },
              ],
              debet: 0,
              kredit: 0,
            });
          }
        }
      }
    }

    const parseTimelineSortMs = (createdAt?: string, tgl?: string, jm?: string) => {
      if (createdAt && createdAt.includes('T')) {
        const ms = new Date(createdAt).getTime();
        if (!Number.isNaN(ms)) return ms;
      }
      const [dd, mm, yyyy] = String(tgl || '').split('/').map(Number);
      const [hh, min, ss] = String(jm || '00:00:00').split(':').map(Number);
      if (yyyy && mm && dd) {
        return new Date(yyyy, mm - 1, dd, hh || 0, min || 0, ss || 0).getTime();
      }
      return 0;
    };

    // Sort chronologically ascending to calculate running balance accurately
    timeline.sort(
      (a, b) =>
        parseTimelineSortMs(a.createdAt, a.tanggal, a.jam) -
        parseTimelineSortMs(b.createdAt, b.tanggal, b.jam)
    );

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
        nominalMutasiHak: item.nominalMutasiHak,
        kategoriMutasiHak: item.kategoriMutasiHak,
        fotoNota: item.fotoNota,
        isNotaLalu: item.isNotaLalu,
        noNotaLalu: item.noNotaLalu,
      };
    });

    const posisiBersihTerpadu =
      isAnakPerusahaan && linkedRek
        ? totalTitip - totalBonKeseluruhan - (linkedRek.saldoSaatIni || 0)
        : totalTitip - totalBonKeseluruhan;

    const rekUtama = db.rekening.find(
      (r) => r.kode === (db.profilPerusahaan?.rekeningUtama || 'KAS01')
    );

    return {
      idMitra: mitra.id,
      kodeMitra: mitra.kode,
      namaMitra: mitra.nama,
      role: mitra.role,
      telepon: mitra.telepon,
      alamat: mitra.alamat,
      status: mitra.status,
      ...(linkedKaryawan
        ? {
            isKaryawan: true,
            idKaryawanTerkait: linkedKaryawan.id,
            nikKaryawan: linkedKaryawan.nik,
            jabatanKaryawan: linkedKaryawan.jabatan,
            divisiKaryawan: linkedKaryawan.divisi || linkedKaryawan.departemen,
          }
        : {}),
      totalTitipPanenMurni,
      totalUpahBelumDibayar,
      totalGajiSudahDibayar,
      totalHakMitraGabungan: totalTitip,
      profilPerusahaan: db.profilPerusahaan,
      ...(rekUtama
        ? {
            rekeningUtamaDetail: {
              kode: rekUtama.kode,
              nama: rekUtama.nama,
              nomorRekening: rekUtama.nomorRekening,
              atasNama: rekUtama.atasNama,
            },
          }
        : {}),
      ...(isAnakPerusahaan
        ? {
            isAnakPerusahaan: true,
            kodeRekeningTerkait: linkedRek?.kode || mitra.kodeRekeningTerkait,
            namaRekeningTerkait: linkedRek?.nama || mitra.nama,
            saldoAwalRekeningAnakPerusahaan: linkedRek?.saldoAwal || 0,
            saldoRekeningAnakPerusahaan: linkedRek?.saldoSaatIni || 0,
            totalSimpanKeAnakPerusahaan,
            totalPakaiDariAnakPerusahaan,
            posisiBersihTerpadu,
          }
        : {}),
      totalKasbonBarang,
      totalKasbonUang,
      totalTitip,
      totalPembayaranBon,
      totalBonKeseluruhan,
      sisaBon,
      potonganTitipanOtomatis: Math.min(totalBonKeseluruhan, totalTitip),
      sisaBonBersih: Math.max(0, totalBonKeseluruhan - totalTitip),
      sisaTitipanBersih: Math.max(0, totalTitip - totalBonKeseluruhan),
      history,
    };
  }

  /**
   * Rekap Master Mitra: Hutang Perusahaan (Titip Panen + Hak Upah Belum Cair) & Bon Mitra (Barang + Uang)
   */
  public static getRekapMasterMitra(): RekapMasterMitraSummary {
    const db = dbManager.get();

    let totalHutangPerusahaanKeMitra = 0;
    let totalTitipPanenMurniGlobal = 0;
    let totalUpahKaryawanBelumDibayarGlobal = 0;
    let totalBonMitra = 0;
    let mitraDenganHutangTitipCount = 0;
    let mitraDenganBonCount = 0;

    const items: RekapMitraItem[] = db.mitra.map((m) => {
      // 1. Kasbon barang & Piutang Hasil Bumi
      const kasbonBarang =
        db.penjualan
          .filter((p) => p.idMitra === m.id && p.metode === 'KASBON')
          .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0) +
        (db.penjualanHasilBumi || [])
          .filter((j) => j.idMitra === m.id && j.metodePembayaran === 'PIUTANG')
          .reduce((sum, j) => sum + (j.sisaPiutang || 0), 0);

      // 2. Kasbon uang
      const kasbonUang = db.kasbonUang
        .filter((k) => k.idMitra === m.id && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const totalBon = kasbonBarang + kasbonUang;

      // 3. Titip hasil bumi, pinjaman dana, & hutang kulakan supplier belum dibayar (hutang kita ke mitra)
      const mitraHasilBumiList = db.pembelianHasilBumi.filter((pb) => pb.idMitra === m.id);
      const titipPanenKotor = mitraHasilBumiList
        .filter((pb) => pb.metodePembayaran === 'TITIP')
        .reduce((sum, pb) => sum + pb.totalNominal, 0);
      const hutangKulakan = (db.pembelianBarang || [])
        .filter((pb) => pb.idMitra === m.id && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
        .reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const titipKotor = titipPanenKotor + hutangKulakan;
      const totalPencairanM = (db.pencairanTitipan || [])
        .filter((pt) => pt.idMitra === m.id)
        .reduce((sum, pt) => sum + (pt.nominalPencairan || 0), 0);
      const titipPanenMurni = Math.max(0, titipKotor - totalPencairanM);

      // 3b. Integrasi Karyawan <-> Mitra (Karyawan juga bisa jadi Mitra)
      const linkedKry = (db.karyawan || []).find(
        (k) =>
          (m.idKaryawanTerkait && k.id === m.idKaryawanTerkait) ||
          k.idMitraTerkait === m.id ||
          (k.nik && k.nik === m.kode) ||
          (!m.isAnakPerusahaan &&
            m.role !== 'ANAK_PERUSAHAAN' &&
            String(k.nama || '').trim().toLowerCase() === String(m.nama || '').trim().toLowerCase())
      );
      const upahListKry = linkedKry
        ? (db.upahHarian || []).filter((u) => u.idKaryawan === linkedKry.id)
        : [];
      const slipListKry = linkedKry
        ? (db.penggajian || []).filter((g) => g.idKaryawan === linkedKry.id)
        : [];
      const upahBelumDibayarKry = upahListKry
        .filter((u) => u.status === 'TERCATAT')
        .reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const gajiSudahDibayarKry = slipListKry.reduce(
        (sum, g) => sum + (Number(g.totalGajiKotor) || Number(g.gajiBersihDibayar) || 0),
        0
      );

      // Total hak mitra keseluruhan yang belum cair di PT = Titip Hasil Panen + Upah Kerja Belum Cair
      const totalHakGabungan = titipPanenMurni + upahBelumDibayarKry;

      // Check linked Anak Perusahaan account (e.g. DP Parabot <-> REK-DPPARABO)
      const linkedRek =
        (m.kodeRekeningTerkait && db.rekening.find((r) => r.kode === m.kodeRekeningTerkait)) ||
        db.rekening.find((r) => r.idMitraTerkait === m.id && this.isAnakPerusahaanRekening(r));
      const isAnakPerusahaan = Boolean(m.isAnakPerusahaan || m.role === 'ANAK_PERUSAHAAN' || linkedRek);

      // Count unique transactions across all linked partner ledgers (+ Karyawan Upah/Slip + Rekening Anak Perusahaan)
      const txIdSet = new Set<string>();
      db.penjualan.filter((p) => p.idMitra === m.id).forEach((p) => txIdSet.add(p.noPenjualan));
      (db.penjualanHasilBumi || []).filter((j) => j.idMitra === m.id).forEach((j) => txIdSet.add(j.noPenjualan));
      mitraHasilBumiList.forEach((pb) => txIdSet.add(pb.noPembelian));
      (db.pembelianBarang || []).filter((pb) => pb.idMitra === m.id).forEach((pb) => txIdSet.add(pb.noPembelian));
      (db.pencairanTitipan || []).filter((pt) => pt.idMitra === m.id).forEach((pt) => txIdSet.add(pt.idPencairan));
      db.kasbonUang.filter((k) => k.idMitra === m.id).forEach((k) => txIdSet.add(k.idTransaksi));
      db.bayarBon.filter((b) => b.idMitra === m.id).forEach((b) => txIdSet.add(b.idTransaksi));
      upahListKry.forEach((u) => txIdSet.add(u.id));
      slipListKry.forEach((g) => txIdSet.add(g.id));

      if (isAnakPerusahaan && linkedRek) {
        const rekKode = linkedRek.kode;
        (db.transferRekening || [])
          .filter((t) => (t.rekeningSumber === rekKode || t.rekeningTujuan === rekKode) && t.status === 'BERHASIL')
          .forEach((t) => txIdSet.add(t.noTransfer));
        db.penjualan.filter((p) => p.rekeningTujuan === rekKode).forEach((p) => txIdSet.add(p.noPenjualan));
        db.bayarBon.filter((b) => b.rekeningTujuan === rekKode).forEach((b) => txIdSet.add(b.idTransaksi));
        db.pembelianHasilBumi.filter((pb) => pb.rekeningSumber === rekKode).forEach((pb) => txIdSet.add(pb.noPembelian));
        (db.pembelianBarang || []).filter((pb) => pb.rekeningSumber === rekKode).forEach((pb) => txIdSet.add(pb.noPembelian));
        db.kasbonUang.filter((k) => k.rekeningSumber === rekKode).forEach((k) => txIdSet.add(k.idTransaksi));
        (db.pencairanTitipan || []).filter((pt) => pt.rekeningSumber === rekKode).forEach((pt) => txIdSet.add(pt.idPencairan));
        (db.pengeluaran || []).filter((e) => e.rekeningSumber === rekKode).forEach((e) => txIdSet.add(e.idTransaksi));
        (db.penggajian || []).filter((g) => g.rekeningSumber === rekKode).forEach((g) => txIdSet.add(g.id));
      }

      const txCount = txIdSet.size;

      // Net balance: Total Hak Gabungan (Titip Panen + Upah Belum Cair) - Bon (Hutang mitra ke PT)
      const saldoBersih = totalHakGabungan - totalBon;
      const posisiBersihTerpadu =
        isAnakPerusahaan && linkedRek
          ? totalHakGabungan - totalBon - (linkedRek.saldoSaatIni || 0)
          : saldoBersih;

      let posisiStatus: 'KITA_BERHUTANG' | 'MITRA_BERHUTANG' | 'LUNAS_IMPAS' = 'LUNAS_IMPAS';
      const basisPosisi = isAnakPerusahaan ? posisiBersihTerpadu : saldoBersih;
      if (basisPosisi > 0) {
        posisiStatus = 'KITA_BERHUTANG';
      } else if (basisPosisi < 0) {
        posisiStatus = 'MITRA_BERHUTANG';
      }

      totalHutangPerusahaanKeMitra += totalHakGabungan;
      totalTitipPanenMurniGlobal += titipPanenMurni;
      totalUpahKaryawanBelumDibayarGlobal += upahBelumDibayarKry;
      totalBonMitra += totalBon;
      if (totalHakGabungan > 0) mitraDenganHutangTitipCount++;
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
        ...(linkedKry
          ? {
              isKaryawan: true,
              idKaryawanTerkait: linkedKry.id,
              nikKaryawan: linkedKry.nik,
              jabatanKaryawan: linkedKry.jabatan,
              divisiKaryawan: linkedKry.divisi || linkedKry.departemen,
            }
          : {}),
        hasTransaksiMitraPanen: mitraHasilBumiList.length > 0 || hutangKulakan > 0,
        totalTitipPanenMurni: titipPanenMurni,
        totalUpahBelumDibayar: upahBelumDibayarKry,
        totalGajiSudahDibayar: gajiSudahDibayarKry,
        totalHakMitraGabungan: totalHakGabungan,
        ...(isAnakPerusahaan
          ? {
              isAnakPerusahaan: true,
              kodeRekeningTerkait: linkedRek?.kode || m.kodeRekeningTerkait,
              namaRekeningTerkait: linkedRek?.nama || m.nama,
              saldoRekeningAnakPerusahaan: linkedRek?.saldoSaatIni || 0,
              posisiBersihTerpadu,
            }
          : {}),
        totalHutangTitipPanen: totalHakGabungan,
        totalKasbonBarang: kasbonBarang,
        totalKasbonUang: kasbonUang,
        totalBonMitra: totalBon,
        potonganSilangOtomatis: Math.min(totalHakGabungan, totalBon),
        sisaBonBersih: Math.max(0, totalBon - totalHakGabungan),
        sisaTitipanBersih: Math.max(0, totalHakGabungan - totalBon),
        saldoBersih,
        posisiStatus,
        totalTransaksiCount: txCount,
      };
    });

    return {
      totalMitra: db.mitra.length,
      totalHutangPerusahaanKeMitra,
      totalTitipPanenMurni: totalTitipPanenMurniGlobal,
      totalUpahKaryawanBelumDibayar: totalUpahKaryawanBelumDibayarGlobal,
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

    // Total omzet penjualan toko & hasil bumi
    const totalPenjualan = db.penjualan.reduce((s, p) => s + p.totalNominal, 0);
    const totalPenjualanHasilBumi = (db.penjualanHasilBumi || []).reduce((s, j) => s + (j.totalNominal || 0), 0);
    const totalTerjualHasilBumiKg = (db.penjualanHasilBumi || []).reduce((s, j) => s + (j.beratBersih || 0), 0);

    // Total pembelian hasil bumi fisik (tidak termasuk Pinjaman Dana / Titip Dana 0 Kg)
    const totalPembelianHasilBumi = db.pembelianHasilBumi
      .filter((p) => this.isPhysicalPembelianHasilBumi(p))
      .reduce((s, p) => s + p.totalNominal, 0);

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

    // Nilai persediaan stok barang toko (stok * hargaJual), exclude item jasa ALAT
    const nilaiStokBarang = db.stokBarang.reduce((s, sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      if (isKategoriAlatNonStok(prd?.kategori || sb.kategori)) return s;
      return s + sb.stok * (prd ? prd.hargaJual : 0);
    }, 0);

    // Total volume stok hasil bumi ready di gudang
    const totalVolumeHasilBumiKg = db.stokHasilBumi
      .filter((h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN'))
      .reduce((s, hb) => s + (hb.stok || 0), 0);

    // Peringatan stok menipis (kecualikan item sewa jasa / ALAT yang memang tanpa stok fisik)
    const stokMenipis = db.stokBarang.filter((sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      if (isKategoriAlatNonStok(prd?.kategori || sb.kategori)) return false;
      return sb.stok <= sb.minimum;
    });

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

    for (const jhb of (db.penjualanHasilBumi || []).slice(0, 10)) {
      recentTx.push({
        id: jhb.noPenjualan,
        tanggal: jhb.tanggal,
        jam: jhb.jam,
        createdAt: jhb.createdAt,
        kategori: 'PENJUALAN',
        label: `Jual ${jhb.komoditasNama} (${jhb.beratBersih} kg)`,
        nominal: jhb.totalNominal,
        pihakTerkait: jhb.namaMitra,
        rekening: jhb.rekeningTujuan,
        status: jhb.statusPembayaran,
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
      const sRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
      const dRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
      const isAnakTx = Boolean(
        t.idMitraTerkait || this.isAnakPerusahaanRekening(sRek) || this.isAnakPerusahaanRekening(dRek)
      );
      const namaAfiliasi =
        t.namaMitraTerkait ||
        (this.isAnakPerusahaanRekening(dRek) ? dRek?.nama : this.isAnakPerusahaanRekening(sRek) ? sRek?.nama : '');
      recentTx.push({
        id: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam,
        createdAt: t.createdAt,
        kategori: 'TRANSFER_REKENING',
        label: isAnakTx
          ? t.tipeMutasiAfiliasi === 'TARIK_DARI_ANAK_PERUSAHAAN' || this.isAnakPerusahaanRekening(sRek)
            ? `Tarik/Talangan ${namaAfiliasi}`
            : `Simpan Dana ke ${namaAfiliasi}`
          : `Transfer ${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        pihakTerkait: isAnakTx ? `${namaAfiliasi} (Anak Perusahaan & Mitra)` : 'Internal PT Wijaya Agro',
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
      totalPenjualanHasilBumi,
      totalTerjualHasilBumiKg,
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

  /**
   * 8. LOGIKA PEMBUKUAN ARUS KAS HARIAN BOS (UANG MASUK & UANG KELUAR)
   * Mengadopsi logika jurnal rekapitulasi harian bos PT. WIJAYA AGRO PERKASA
   */
  public static getRekapHarianKas(tanggalQuery?: string) {
    const db = dbManager.get();
    const today = getWIBDateTime().tanggal;
    const targetTanggal = tanggalQuery || today;

    const isSameDate = (txDate?: string) => {
      if (!txDate) return false;
      if (txDate === targetTanggal) return true;
      const partsA = txDate.split(/[-/]/);
      const partsB = targetTanggal.split(/[-/]/);
      if (partsA.length === 3 && partsB.length === 3) {
        if (partsA[0].length === 4) {
          const normA = `${partsA[2].padStart(2, '0')}/${partsA[1].padStart(2, '0')}/${partsA[0]}`;
          if (normA === targetTanggal) return true;
        }
        if (partsB[0].length === 4) {
          const normB = `${partsB[2].padStart(2, '0')}/${partsB[1].padStart(2, '0')}/${partsB[0]}`;
          if (txDate === normB) return true;
        }
      }
      return false;
    };

    // 1. UANG MASUK RIIL (PENERIMAAN KAS & BANK)
    const penjualanHariIni = (db.penjualan || []).filter(
      (p) => isSameDate(p.tanggal) && p.metode !== 'KASBON' && p.metode !== 'INTERNAL_PT' && p.rekeningTujuan !== 'INTERNAL_PT'
    );
    const penjualanHasilBumiHariIni = (db.penjualanHasilBumi || []).filter(
      (j) => isSameDate(j.tanggal) && j.metodePembayaran !== 'PIUTANG'
    );
    const totalPenjualanMasuk =
      penjualanHariIni.reduce((s, p) => s + (p.totalNominal || 0), 0) +
      penjualanHasilBumiHariIni.reduce((s, j) => s + (j.totalNominal || 0), 0);

    const bayarBonHariIni = (db.bayarBon || []).filter(
      (b) =>
        isSameDate(b.tanggal) &&
        b.metode !== 'SINKRON' &&
        b.metode !== 'KOMPENSASI_TITIP' &&
        b.metode !== 'POTONG_GAJI' &&
        !b.isKompensasiTitipan &&
        !b.isPotongGaji &&
        b.rekeningTujuan !== 'SINKRON' &&
        b.rekeningTujuan !== 'KOMPENSASI_TITIP' &&
        b.rekeningTujuan !== 'POTONG_GAJI'
    );
    const totalBayarBon = bayarBonHariIni.reduce((s, b) => s + (b.nominalBayar || 0), 0);

    const pinjamanDanaMasukHariIni = (db.pembelianHasilBumi || []).filter(
      (b) =>
        isSameDate(b.tanggal) &&
        (b.komoditasKode === 'PINJAMAN_DANA' || b.komoditasNama?.includes('Pinjaman Uang')) &&
        b.rekeningSumber &&
        b.rekeningSumber !== 'TIT01'
    );
    const totalPinjamanDanaMasuk = pinjamanDanaMasukHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);

    const transferMasukHariIni = (db.transferRekening || []).filter(
      (t) => isSameDate(t.tanggal) && t.rekeningTujuan === 'KAS01' && t.status === 'BERHASIL'
    );
    const totalTransferMasuk = transferMasukHariIni.reduce((s, t) => s + (t.nominal || 0), 0);

    const totalUangMasuk = totalPenjualanMasuk + totalBayarBon + totalPinjamanDanaMasuk + totalTransferMasuk;

    // 2. UANG KELUAR RIIL (PENGELUARAN KAS & BANK)
    const pengeluaranHariIni = (db.pengeluaran || []).filter((p) => isSameDate(p.tanggal));
    const totalPengeluaranDivisi = pengeluaranHariIni.reduce((s, p) => s + (p.nominal || 0), 0);

    const beliHasilBumiHariIni = (db.pembelianHasilBumi || []).filter(
      (b) =>
        isSameDate(b.tanggal) &&
        b.metodePembayaran !== 'TITIP' &&
        b.komoditasKode !== 'PINJAMAN_DANA' &&
        !b.komoditasNama?.includes('Pinjaman Uang')
    );
    const totalBeliHasilBumi = beliHasilBumiHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);

    const kasbonUangHariIni = (db.kasbonUang || []).filter(
      (k) => isSameDate(k.tanggal) && !k.isNotaLalu && k.rekeningSumber !== 'BON01'
    );
    const totalKasbonUang = kasbonUangHariIni.reduce((s, k) => s + (k.nominal || 0), 0);

    const beliBarangHariIni = (db.pembelianBarang || []).filter(
      (b) => isSameDate(b.tanggal) && b.metodePembayaran !== 'HUTANG'
    );
    const totalBeliBarang = beliBarangHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);

    const pencairanTitipanHariIni = (db.pencairanTitipan || []).filter(
      (pt) =>
        isSameDate(pt.tanggal) &&
        pt.metodePembayaran !== 'SINKRON' &&
        pt.metodePembayaran !== 'KOMPENSASI_BON' &&
        pt.rekeningSumber !== 'SINKRON' &&
        !pt.isKompensasiBon
    );
    const totalPencairanTitipan = pencairanTitipanHariIni.reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);

    const gajiHariIni = (db.penggajian || []).filter((g) => isSameDate(g.tanggal));
    const totalGaji = gajiHariIni.reduce((s, g) => s + (g.gajiBersihDibayar || 0), 0);

    const totalUangKeluar =
      totalPengeluaranDivisi +
      totalBeliHasilBumi +
      totalKasbonUang +
      totalBeliBarang +
      totalPencairanTitipan +
      totalGaji;

    const arusKasBersih = totalUangMasuk - totalUangKeluar;

    const kasAccount = db.rekening.find((r) => r.kode === 'KAS01');
    const saldoKasFisik = kasAccount ? kasAccount.saldoSaatIni : 0;
    const realBankAccounts = db.rekening.filter(
      (r) =>
        !r.isVirtual &&
        r.kode !== 'KAS01' &&
        !r.kode.startsWith('REK-') &&
        !this.isAnakPerusahaanRekening(r) &&
        r.status === 'AKTIF'
    );
    const saldoTotalBank = realBankAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);

    const divMap = new Map<string, { total: number; count: number }>();
    pengeluaranHariIni.forEach((p) => {
      const d = p.divisi || 'Lain-lain';
      const cur = divMap.get(d) || { total: 0, count: 0 };
      divMap.set(d, { total: cur.total + p.nominal, count: cur.count + 1 });
    });
    const rekapDivisiHariIni = Array.from(divMap.entries()).map(([divisi, data]) => ({
      divisi,
      total: data.total,
      count: data.count,
    }));

    return {
      tanggal: targetTanggal,
      totalUangMasuk,
      rincianMasuk: {
        penjualanToko: totalPenjualanMasuk,
        bayarBon: totalBayarBon,
        droppingMasuk: totalTransferMasuk + totalPinjamanDanaMasuk,
        jumlahTransaksi:
          penjualanHariIni.length +
          penjualanHasilBumiHariIni.length +
          bayarBonHariIni.length +
          pinjamanDanaMasukHariIni.length +
          transferMasukHariIni.length,
      },
      totalUangKeluar,
      rincianKeluar: {
        pengeluaranDivisi: totalPengeluaranDivisi,
        beliHasilBumi: totalBeliHasilBumi,
        kasbonUang: totalKasbonUang,
        kulakanBarang: totalBeliBarang,
        pencairanTitipan: totalPencairanTitipan,
        upahGaji: totalGaji,
        jumlahTransaksi:
          pengeluaranHariIni.length +
          beliHasilBumiHariIni.length +
          kasbonUangHariIni.length +
          beliBarangHariIni.length +
          pencairanTitipanHariIni.length +
          gajiHariIni.length,
      },
      arusKasBersih,
      saldoKasFisik,
      saldoTotalBank,
      totalSaldoRil: saldoKasFisik + saldoTotalBank,
      rekapDivisiHariIni,
    };
  }

  // ==========================================
  // 7. PENGELUARAN & BEBAN OPERASIONAL PER DIVISI
  // ==========================================
  public static async processPengeluaran(params: {
    divisi: string;
    kategori: string;
    keterangan: string;
    nominal: number;
    rekeningSumber: string;
    penerima?: string;
    idInventaris?: string;
    tanggal?: string;
    fotoKuitansi?: string;
  }): Promise<TransaksiPengeluaran> {
    return dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal pengeluaran harus lebih dari Rp 0');
      }

      const rekening = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (!rekening) throw new Error('Rekening sumber dana tidak ditemukan');

      if (!this.isAnakPerusahaanRekening(rekening) && rekening.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo ${rekening.nama} tidak mencukupi (Tersedia: Rp ${rekening.saldoSaatIni.toLocaleString('id-ID')})`
        );
      }

      const idTransaksi = generateId('EXP');
      const record: TransaksiPengeluaran = {
        idTransaksi,
        tanggal: params.tanggal || tanggal,
        jam,
        divisi: params.divisi,
        kategori: params.kategori,
        keterangan: params.keterangan,
        nominal: params.nominal,
        rekeningSumber: params.rekeningSumber,
        penerima: params.penerima,
        idInventaris: params.idInventaris || undefined,
        fotoKuitansi: params.fotoKuitansi,
        createdAt: iso,
      };

      if (!db.pengeluaran) db.pengeluaran = [];
      db.pengeluaran.unshift(record);

      // Kurangi saldo rekening
      rekening.saldoSaatIni -= params.nominal;

      this.addAuditLog(
        db,
        'PAYMENT',
        idTransaksi,
        `Pengeluaran Divisi [${params.divisi}] (${params.kategori}): ${params.keterangan} sebesar Rp ${params.nominal.toLocaleString('id-ID')} via ${rekening.nama}`,
        params.nominal,
        params.rekeningSumber
      );

      return record;
    });
  }

  public static getPengeluaranList(): TransaksiPengeluaran[] {
    const db = dbManager.get();
    return db.pengeluaran || [];
  }

  public static async deletePengeluaran(idTransaksi: string): Promise<{ success: boolean; message: string }> {
    return dbManager.executeTransaction((db) => {
      const idx = (db.pengeluaran || []).findIndex((p) => p.idTransaksi === idTransaksi);
      if (idx === -1) throw new Error('Catatan pengeluaran tidak ditemukan');

      const exp = db.pengeluaran[idx];
      const rek = db.rekening.find((r) => r.kode === exp.rekeningSumber);
      if (rek) {
        rek.saldoSaatIni += exp.nominal; // Kembalikan saldo
      }

      db.pengeluaran.splice(idx, 1);
      this.addAuditLog(
        db,
        'VOID',
        idTransaksi,
        `Batalkan Pengeluaran [${exp.divisi}]: ${exp.keterangan} (Rp ${exp.nominal.toLocaleString('id-ID')})`,
        exp.nominal,
        exp.rekeningSumber
      );

      return { success: true, message: 'Pengeluaran berhasil dibatalkan dan saldo dikembalikan' };
    });
  }

  // ==========================================
  // 8. PENCAIRAN TITIPAN HASIL BUMI (PEMBAYARAN DARI PT KE MITRA)
  // Otomatis memotong Bon Mitra terlebih dahulu sehingga PT hanya membayar sisa bersih ke Mitra
  // ==========================================
  public static async processPencairanTitipan(params: {
    idMitra: string;
    nominal: number;
    rekeningSumber: string;
    metode: 'TUNAI' | 'TRANSFER';
    keterangan?: string;
    tanggal?: string;
  }): Promise<TransaksiPencairanTitipan> {
    return dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const targetTanggal = params.tanggal || tanggal;
      const nominalFisik = Math.round(Number(params.nominal) || 0);

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Mitra tidak ditemukan');

      const snap = this.getMitraCrossBalanceSnapshot(db, mitra.id);
      const {
        totalBonKotor,
        saldoTitipanAktif,
        potonganOtomatis,
        sisaBonBersih,
        sisaTitipanBersih,
      } = snap;

      const isImpasZeroCash = nominalFisik === 0 && potonganOtomatis > 0 && sisaTitipanBersih === 0;

      if (!isImpasZeroCash && nominalFisik <= 0) {
        throw new Error('Nominal pembayaran dari PT ke mitra harus lebih dari Rp 0');
      }

      if (sisaTitipanBersih <= 0 && !isImpasZeroCash) {
        if (saldoTitipanAktif > 0 && totalBonKotor > saldoTitipanAktif) {
          throw new Error(
            `Titipan Hasil Bumi ${mitra.nama} (Rp ${saldoTitipanAktif.toLocaleString(
              'id-ID'
            )}) sudah habis terpotong untuk mengurangi Bon Mitra (Rp ${totalBonKotor.toLocaleString(
              'id-ID'
            )}). Tidak ada uang yang dibayar PT ke Mitra — justru sisa Bon Mitra Rp ${sisaBonBersih.toLocaleString(
              'id-ID'
            )}.`
          );
        }
        throw new Error(`Mitra ${mitra.nama} tidak memiliki sisa titipan bersih yang harus dibayar PT`);
      }

      if (nominalFisik > sisaTitipanBersih) {
        throw new Error(
          `Nominal pembayaran (Rp ${nominalFisik.toLocaleString(
            'id-ID'
          )}) melebihi sisa bersih wajib bayar PT ke Mitra (Rp ${sisaTitipanBersih.toLocaleString(
            'id-ID'
          )} setelah potong bon otomatis Rp ${potonganOtomatis.toLocaleString('id-ID')})`
        );
      }

      let rekening = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (nominalFisik > 0) {
        if (!rekening) throw new Error('Rekening pembayaran kas/bank tidak ditemukan');
        if (!this.isAnakPerusahaanRekening(rekening) && rekening.saldoSaatIni < nominalFisik) {
          throw new Error(
            `Saldo ${rekening.nama} tidak mencukupi untuk pembayaran bersih (Tersedia: Rp ${rekening.saldoSaatIni.toLocaleString(
              'id-ID'
            )}, dibutuhkan: Rp ${nominalFisik.toLocaleString('id-ID')})`
          );
        }
      }

      const idPencairan = generateId('PCT');

      // 1. Jika Mitra memiliki Bon aktif, potong otomatis dari Saldo Titipan terlebih dahulu (Non-Tunai)
      if (potonganOtomatis > 0) {
        this.executeAutoCrossOffsetInTx({
          db,
          mitra,
          nominalPotong: potonganOtomatis,
          totalBonSebelum: totalBonKotor,
          saldoTitipanSebelum: saldoTitipanAktif,
          tanggal: targetTanggal,
          jam,
          iso,
          refId: idPencairan,
        });
      }

      // Jika transaksi tepat Impas (Rp 0 uang keluar setelah potong bon 100%), kembalikan bukti potongnya
      if (isImpasZeroCash) {
        dbManager.synchronizeVirtualAccounts();
        const impasRecord = (db.pencairanTitipan || []).find(
          (pt) => pt.idPencairan === `${idPencairan}-POTTIT`
        );
        this.addAuditLog(
          db,
          'PAYMENT',
          idPencairan,
          `Tutup Buku Lunas Impas ${mitra.nama}: Titipan Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
            'id-ID'
          )} langsung menutup Bon Rp ${totalBonKotor.toLocaleString('id-ID')} via SINKRON (Rp 0 uang keluar).`,
          0,
          'SINKRON'
        );
        return (
          impasRecord || {
            idPencairan: `${idPencairan}-POTTIT`,
            tanggal: targetTanggal,
            jam,
            idMitra: mitra.id,
            namaMitra: mitra.nama,
            nominalPencairan: potonganOtomatis,
            rekeningSumber: 'SINKRON',
            saldoTitipanSebelum: saldoTitipanAktif,
            totalTitipanAwalKotor: saldoTitipanAktif,
            nominalPotongBonOtomatis: potonganOtomatis,
            saldoTitipanSisa: 0,
            metodePembayaran: 'SINKRON',
            isKompensasiBon: true,
            keterangan: params.keterangan || 'Tutup Buku Impas Otomatis Titipan Hasil Bumi & Bon Mitra (SINKRON)',
            createdAt: iso,
          }
        );
      }

      // 2. Bayarkan sisa bersih dari Kas / Bank PT ke Mitra
      const saldoTitipanSisa = Math.max(0, sisaTitipanBersih - nominalFisik);

      const record: TransaksiPencairanTitipan = {
        idPencairan,
        tanggal: targetTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        nominalPencairan: nominalFisik,
        rekeningSumber: params.rekeningSumber,
        saldoTitipanSebelum: sisaTitipanBersih,
        ...(potonganOtomatis > 0
          ? {
              totalTitipanAwalKotor: saldoTitipanAktif,
              nominalPotongBonOtomatis: potonganOtomatis,
            }
          : {}),
        saldoTitipanSisa,
        metodePembayaran: params.metode,
        keterangan:
          params.keterangan ||
          (potonganOtomatis > 0
            ? `Pembayaran PT ke Mitra ${mitra.nama} (Titipan Rp ${saldoTitipanAktif.toLocaleString(
                'id-ID'
              )} - Potong Bon Otomatis Rp ${potonganOtomatis.toLocaleString('id-ID')})`
            : 'Pembayaran Titipan Pembelian Hasil Bumi dari PT ke Mitra'),
        createdAt: iso,
      };

      if (!db.pencairanTitipan) db.pencairanTitipan = [];
      db.pencairanTitipan.unshift(record);

      // Potong saldo rekening kas/bank perusahaan hanya sebesar pembayaran bersih fisik
      if (rekening) {
        rekening.saldoSaatIni -= nominalFisik;
      }

      this.addAuditLog(
        db,
        'PAYMENT',
        idPencairan,
        potonganOtomatis > 0
          ? `Pembayaran PT ke Mitra ${mitra.nama}: Titipan Awal Rp ${saldoTitipanAktif.toLocaleString(
              'id-ID'
            )} dipotong otomatis Bon Mitra Rp ${potonganOtomatis.toLocaleString(
              'id-ID'
            )} (Bon Lunas), dibayar bersih Rp ${nominalFisik.toLocaleString('id-ID')} via ${rekening?.nama || params.rekeningSumber}`
          : `Pembayaran Titipan Hasil Bumi dari PT ke Mitra ${mitra.nama} sebesar Rp ${nominalFisik.toLocaleString(
              'id-ID'
            )} via ${rekening?.nama || params.rekeningSumber}`,
        nominalFisik,
        params.rekeningSumber
      );

      dbManager.synchronizeVirtualAccounts();
      return record;
    });
  }

  public static getPencairanTitipanList(): TransaksiPencairanTitipan[] {
    const db = dbManager.get();
    return db.pencairanTitipan || [];
  }

  // ==========================================
  // 9. SINKRONISASI & EDIT DARI REKENING KORAN MITRA
  // ==========================================
  public static async updateTransactionFromStatement(params: {
    idTransaksi: string;
    nominalBaru: number;
    keteranganBaru?: string;
    tanggalBaru?: string;
  }): Promise<{ success: boolean; message: string; updatedRecord: any }> {
    return dbManager.executeTransaction((db) => {
      const { idTransaksi, nominalBaru, keteranganBaru, tanggalBaru } = params;
      let updatedRecord: any = null;

      // 1. Pembelian Hasil Bumi
      const pb = db.pembelianHasilBumi.find((p) => p.noPembelian === idTransaksi);
      if (pb) {
        const diff = nominalBaru - pb.totalNominal;
        pb.totalNominal = nominalBaru;
        if (pb.beratBersih > 0) {
          pb.hargaPerKg = Math.round(nominalBaru / pb.beratBersih);
        }
        if (keteranganBaru) pb.keterangan = keteranganBaru;
        if (tanggalBaru) pb.tanggal = tanggalBaru;
        if (pb.metodePembayaran !== 'TITIP') {
          const rek = db.rekening.find((r) => r.kode === pb.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = pb;
      }

      // 2. Penjualan Toko
      const pj = db.penjualan.find((p) => p.noPenjualan === idTransaksi);
      if (pj) {
        const diff = nominalBaru - pj.totalNominal;
        pj.totalNominal = nominalBaru;
        if (pj.metode === 'KASBON') {
          pj.sisaPiutang = Math.max(0, pj.sisaPiutang + diff);
        } else {
          const rek = db.rekening.find((r) => r.kode === pj.rekeningTujuan);
          if (rek) rek.saldoSaatIni += diff;
        }
        if (keteranganBaru) pj.keterangan = keteranganBaru;
        if (tanggalBaru) pj.tanggal = tanggalBaru;
        updatedRecord = pj;
      }

      // 3. Kasbon Uang
      const ku = db.kasbonUang.find((k) => k.idTransaksi === idTransaksi);
      if (ku) {
        const diff = nominalBaru - ku.nominal;
        ku.nominal = nominalBaru;
        ku.sisaKasbon = Math.max(0, ku.sisaKasbon + diff);
        if (keteranganBaru) ku.keterangan = keteranganBaru;
        if (tanggalBaru) ku.tanggal = tanggalBaru;
        if (ku.rekeningSumber !== 'BON01') {
          const rek = db.rekening.find((r) => r.kode === ku.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = ku;
      }

      // 4. Bayar Bon
      const bb = db.bayarBon.find((b) => b.idTransaksi === idTransaksi);
      if (bb) {
        const diff = nominalBaru - bb.nominalBayar;
        bb.nominalBayar = nominalBaru;
        if (keteranganBaru) bb.keterangan = keteranganBaru;
        if (tanggalBaru) bb.tanggal = tanggalBaru;
        const isNonCashBon =
          bb.metode === 'SINKRON' ||
          bb.metode === 'KOMPENSASI_TITIP' ||
          bb.metode === 'POTONG_GAJI' ||
          bb.rekeningTujuan === 'SINKRON' ||
          Boolean(bb.isKompensasiTitipan) ||
          Boolean(bb.isPotongGaji);
        if (!isNonCashBon) {
          const rek = db.rekening.find((r) => r.kode === bb.rekeningTujuan);
          if (rek) rek.saldoSaatIni += diff;
        }
        updatedRecord = bb;
      }

      // 5. Pencairan Titipan
      const pt = (db.pencairanTitipan || []).find((p) => p.idPencairan === idTransaksi);
      if (pt) {
        const diff = nominalBaru - pt.nominalPencairan;
        pt.nominalPencairan = nominalBaru;
        if (keteranganBaru) pt.keterangan = keteranganBaru;
        if (tanggalBaru) pt.tanggal = tanggalBaru;
        if (
          pt.metodePembayaran !== 'SINKRON' &&
          pt.metodePembayaran !== 'KOMPENSASI_BON' &&
          pt.rekeningSumber !== 'SINKRON' &&
          !pt.isKompensasiBon
        ) {
          const rek = db.rekening.find((r) => r.kode === pt.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = pt;
      }

      // 6. Pembelian Barang (Kulakan Supplier)
      const kpb = (db.pembelianBarang || []).find((p) => p.noPembelian === idTransaksi);
      if (kpb) {
        const diff = nominalBaru - kpb.totalNominal;
        kpb.totalNominal = nominalBaru;
        if (keteranganBaru) kpb.keterangan = keteranganBaru;
        if (tanggalBaru) kpb.tanggal = tanggalBaru;
        if (kpb.metodePembayaran !== 'HUTANG') {
          const rek = db.rekening.find((r) => r.kode === kpb.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = kpb;
      }

      // 7. Transfer Rekening / Mutasi Anak Perusahaan (1 Transaksi Terpadu)
      const trf = (db.transferRekening || []).find((t) => t.noTransfer === idTransaksi);
      if (trf) {
        const diff = nominalBaru - trf.nominal;
        trf.nominal = nominalBaru;
        if (keteranganBaru) trf.keterangan = keteranganBaru;
        if (tanggalBaru) trf.tanggal = tanggalBaru;
        const sumber = db.rekening.find((r) => r.kode === trf.rekeningSumber);
        const tujuan = db.rekening.find((r) => r.kode === trf.rekeningTujuan);
        if (sumber) sumber.saldoSaatIni -= diff;
        if (tujuan) tujuan.saldoSaatIni += diff;
        updatedRecord = trf;
      }

      // 8. Pengeluaran Operasional via Rekening Anak Perusahaan
      const exp = (db.pengeluaran || []).find((e) => e.idTransaksi === idTransaksi);
      if (exp) {
        const diff = nominalBaru - exp.nominal;
        exp.nominal = nominalBaru;
        if (keteranganBaru) exp.keterangan = keteranganBaru;
        if (tanggalBaru) exp.tanggal = tanggalBaru;
        const rek = db.rekening.find((r) => r.kode === exp.rekeningSumber);
        if (rek) rek.saldoSaatIni -= diff;
        updatedRecord = exp;
      }

      if (!updatedRecord) {
        throw new Error(`Transaksi ${idTransaksi} tidak ditemukan`);
      }

      this.addAuditLog(
        db,
        'UPDATE',
        idTransaksi,
        `Penyesuaian nilai transaksi/nego di Rekening Koran Mitra: Menjadi Rp ${nominalBaru.toLocaleString('id-ID')} (${keteranganBaru || '-'})`,
        nominalBaru
      );

      dbManager.synchronizeVirtualAccounts();
      return { success: true, message: 'Transaksi berhasil disinkronkan & diperbarui', updatedRecord };
    });
  }

  // ==========================================
  // 10. PROFIL PERUSAHAAN
  // ==========================================
  public static getProfilPerusahaan(): ProfilPerusahaan {
    const db = dbManager.get();
    return {
      ...db.profilPerusahaan,
      logoUrl: db.profilPerusahaan?.logoUrl || '/assets/aistudio/unnamed_cbf747dc.jpg',
    };
  }

  public static async updateProfilPerusahaan(data: Partial<ProfilPerusahaan>): Promise<ProfilPerusahaan> {
    return dbManager.executeTransaction((db) => {
      const now = getWIBDateTime();
      db.profilPerusahaan = {
        ...db.profilPerusahaan,
        ...data,
        updateTerakhir: now.iso,
      };

      this.addAuditLog(
        db,
        'UPDATE',
        'PROFIL-PT',
        `Pembaruan data profil perusahaan: ${db.profilPerusahaan.namaPerusahaan}`,
        0
      );

      return db.profilPerusahaan;
    });
  }

  // ==========================================
  // 11. REKAPAN LENGKAP SEMUA TRANSAKSI (JURNAL HARIAN TERPADU)
  // Menampilkan seluruh transaksi kasir, pembelian kulakan,
  // pembelian hasil bumi, kasbon, bayar bon, biaya divisi, upah, transfer
  // ==========================================
  public static getAllUnifiedTransactions(filters?: {
    tanggal?: string;
    arusUang?: string;
    kategori?: string;
    pihakTerkait?: string;
    search?: string;
  }): RekapSemuaTransaksiResponse {
    const db = dbManager.get();

    const normalizeDateStr = (d?: string): string => {
      if (!d) return '';
      const clean = d.trim();
      const parts = clean.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD -> DD/MM/YYYY
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        } else {
          return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
      }
      return clean;
    };

    const targetDate = filters?.tanggal && filters.tanggal !== 'ALL' ? normalizeDateStr(filters.tanggal) : null;

    const list: UnifiedTransactionItem[] = [];

    // 1. Penjualan Toko / Nego
    for (const p of db.penjualan || []) {
      const isBon = p.metode === 'KASBON';
      const isInternal = p.metode === 'INTERNAL_PT' || p.rekeningTujuan === 'INTERNAL_PT';
      const isNonTunai = isBon || isInternal;
      const itemsDesc =
        p.items?.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ') || 'Penjualan Toko';
      list.push({
        id: p.noPenjualan,
        tanggal: normalizeDateStr(p.tanggal),
        jam: p.jam || '08:00',
        timestamp: p.createdAt || p.tanggal,
        jenis: 'PENJUALAN',
        jenisLabel: isInternal ? 'Pemakaian Internal PT' : 'Penjualan Toko',
        arusUang: isNonTunai ? 'NON_TUNAI' : 'MASUK',
        arusUangLabel: isBon
          ? 'Piutang Bon (Non-Tunai)'
          : isInternal
          ? 'Pemakaian Internal (Non-Tunai)'
          : 'Uang Masuk (+)',
        deskripsi: `${itemsDesc} [${p.metode}]`,
        pihakTerkait: p.namaMitra || 'Pelanggan Umum',
        kategoriPihak: isInternal ? 'INTERNAL' : 'MITRA',
        rekening: p.rekeningTujuan || 'KAS01',
        nominal: p.totalNominal,
        nominalMasuk: isNonTunai ? 0 : p.totalNominal,
        nominalKeluar: 0,
        metode: p.metode,
        status: p.statusPembayaran,
        divisi: p.divisi,
      });
    }

    // 1B. Penjualan Hasil Bumi Keluar Gudang
    for (const jhb of db.penjualanHasilBumi || []) {
      const isPiutang = jhb.metodePembayaran === 'PIUTANG';
      list.push({
        id: jhb.noPenjualan,
        tanggal: normalizeDateStr(jhb.tanggal),
        jam: jhb.jam || '09:30',
        timestamp: jhb.createdAt || jhb.tanggal,
        jenis: 'PENJUALAN_HASIL_BUMI',
        jenisLabel: 'Penjualan Hasil Bumi',
        arusUang: isPiutang ? 'NON_TUNAI' : 'MASUK',
        arusUangLabel: isPiutang ? 'Piutang Pabrik/Mitra (Non-Tunai)' : 'Uang Masuk (+)',
        deskripsi: `Jual ${jhb.komoditasNama} (${jhb.beratBersih.toLocaleString('id-ID')} kg @ Rp ${jhb.hargaJualPerKg.toLocaleString('id-ID')}) [${jhb.metodePembayaran}]${jhb.divisi ? ` · ${jhb.divisi}` : ''}`,
        pihakTerkait: jhb.namaMitra || 'Pembeli Umum',
        kategoriPihak: 'MITRA',
        rekening: jhb.rekeningTujuan || 'KAS01',
        nominal: jhb.totalNominal,
        nominalMasuk: isPiutang ? 0 : jhb.totalNominal,
        nominalKeluar: 0,
        metode: jhb.metodePembayaran,
        status: jhb.statusPembayaran,
        divisi: jhb.divisi,
      });
    }

    // 2. Pembelian Hasil Bumi (Sawit / TBS / Komoditas / Pinjaman Dana Mitra)
    for (const b of db.pembelianHasilBumi || []) {
      const isPinjamanDana =
        b.komoditasKode === 'PINJAMAN_DANA' || Boolean(b.komoditasNama?.includes('Pinjaman Uang'));
      const isTitip = b.metodePembayaran === 'TITIP' && !isPinjamanDana;

      if (isPinjamanDana) {
        const hasRealCashIn = Boolean(b.rekeningSumber && b.rekeningSumber !== 'TIT01');
        list.push({
          id: b.noPembelian,
          tanggal: normalizeDateStr(b.tanggal),
          jam: b.jam || '09:00',
          timestamp: b.createdAt || b.tanggal,
          jenis: 'PEMBELIAN_HASIL_BUMI',
          jenisLabel: 'Pinjaman Dana dari Mitra',
          arusUang: hasRealCashIn ? 'MASUK' : 'NON_TUNAI',
          arusUangLabel: hasRealCashIn ? 'Uang Masuk (+)' : 'Saldo Titip (Non-Tunai)',
          deskripsi: b.keterangan || `Pinjaman Uang PT dari Mitra ${b.namaMitra} (Masuk Saldo Titip)`,
          pihakTerkait: b.namaMitra,
          kategoriPihak: 'MITRA',
          rekening: b.rekeningSumber || 'KAS01',
          nominal: b.totalNominal,
          nominalMasuk: hasRealCashIn ? b.totalNominal : 0,
          nominalKeluar: 0,
          metode: b.metodePembayaran,
          status: b.status,
          fotoBukti: b.fotoNota,
          divisi: b.divisi,
        });
      } else {
        list.push({
          id: b.noPembelian,
          tanggal: normalizeDateStr(b.tanggal),
          jam: b.jam || '09:00',
          timestamp: b.createdAt || b.tanggal,
          jenis: 'PEMBELIAN_HASIL_BUMI',
          jenisLabel: 'Pembelian Hasil Bumi',
          arusUang: isTitip ? 'NON_TUNAI' : 'KELUAR',
          arusUangLabel: isTitip ? 'Titip Timbang (Hutang)' : 'Uang Keluar (-)',
          deskripsi: `Beli ${b.komoditasNama} (${b.beratBersih} kg @ Rp ${(b.hargaPerKg || 0).toLocaleString('id-ID')})${b.divisi ? ` · ${b.divisi}` : ''}`,
          pihakTerkait: b.namaMitra,
          kategoriPihak: 'MITRA',
          rekening: b.rekeningSumber || 'KAS01',
          nominal: b.totalNominal,
          nominalMasuk: 0,
          nominalKeluar: isTitip ? 0 : b.totalNominal,
          metode: b.metodePembayaran,
          status: b.status,
          fotoBukti: b.fotoNota,
          divisi: b.divisi,
        });
      }
    }

    // 3. Pembelian Barang Dagang (Supplier / Distributor)
    for (const pb of db.pembelianBarang || []) {
      const isHutang = pb.metodePembayaran === 'HUTANG';
      const itemsDesc =
        pb.items?.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ') || 'Barang Dagangan';
      const supplierName = pb.namaMitra || pb.namaDistributorManual || 'Pemasok / Distributor';
      list.push({
        id: pb.noPembelian,
        tanggal: normalizeDateStr(pb.tanggal),
        jam: pb.jam || '10:00',
        timestamp: pb.createdAt || pb.tanggal,
        jenis: 'PEMBELIAN_BARANG',
        jenisLabel: 'Kulakan Supplier',
        arusUang: isHutang ? 'NON_TUNAI' : 'KELUAR',
        arusUangLabel: isHutang ? 'Hutang Dagang (Tempo)' : 'Uang Keluar (-)',
        deskripsi: `Kulakan: ${itemsDesc}${pb.divisi ? ` · ${pb.divisi}` : ''}`,
        pihakTerkait: supplierName,
        kategoriPihak: 'VENDOR',
        rekening: pb.rekeningSumber || 'KAS01',
        nominal: pb.totalNominal,
        nominalMasuk: 0,
        nominalKeluar: isHutang ? 0 : pb.totalNominal,
        metode: pb.metodePembayaran,
        status: pb.status,
        fotoBukti: pb.fotoNota,
        divisi: pb.divisi,
      });
    }

    // 4. Kasbon Uang & Nota Lalu
    for (const k of db.kasbonUang || []) {
      const isNotaLalu = Boolean(k.isNotaLalu || k.rekeningSumber === 'BON01');
      list.push({
        id: k.idTransaksi,
        tanggal: normalizeDateStr(k.tanggal),
        jam: k.jam || '11:00',
        timestamp: k.createdAt || k.tanggal,
        jenis: 'KASBON_UANG',
        jenisLabel: isNotaLalu ? 'Piutang Nota Lalu' : 'Kasbon Uang & Pinjaman',
        arusUang: isNotaLalu ? 'NON_TUNAI' : 'KELUAR',
        arusUangLabel: isNotaLalu ? 'Piutang Nota Lalu (Non-Tunai)' : 'Uang Keluar (-)',
        deskripsi: isNotaLalu
          ? `Piutang Nota Lalu: ${k.keterangan || k.noNotaLalu || 'Nota Barang Lama'}`
          : `Kasbon Tunai (${k.keterangan || 'Pinjaman Uang'}) [${k.metode}]`,
        pihakTerkait: k.namaMitra,
        kategoriPihak: 'MITRA',
        rekening: k.rekeningSumber || 'KAS01',
        nominal: k.nominal,
        nominalMasuk: 0,
        nominalKeluar: isNotaLalu ? 0 : k.nominal,
        metode: k.metode,
        status: k.status,
        fotoBukti: k.fotoNota,
      });
    }

    // 5. Bayar Bon (Pelunasan Piutang)
    for (const by of db.bayarBon || []) {
      const isKompensasi =
        by.metode === 'SINKRON' ||
        by.metode === 'KOMPENSASI_TITIP' ||
        by.rekeningTujuan === 'SINKRON' ||
        Boolean(by.isKompensasiTitipan);
      const isPotongGaji =
        by.metode === 'POTONG_GAJI' ||
        Boolean(by.isPotongGaji) ||
        by.rekeningTujuan === 'POTONG_GAJI' ||
        Boolean(by.keterangan?.startsWith('Potong Gaji') || by.keterangan?.startsWith('Potong Upah') || by.keterangan?.startsWith('Potong Hak Upah'));
      const isNonTunai = isKompensasi || isPotongGaji;
      list.push({
        id: by.idTransaksi,
        tanggal: normalizeDateStr(by.tanggal),
        jam: by.jam || '13:00',
        timestamp: by.createdAt || by.tanggal,
        jenis: 'BAYAR_BON',
        jenisLabel: isKompensasi
          ? 'Pelunasan Bon (SINKRON Potong Titipan)'
          : isPotongGaji
          ? 'Pelunasan Bon (Potong Gaji)'
          : 'Bayar Bon / Pelunasan',
        arusUang: isNonTunai ? 'NON_TUNAI' : 'MASUK',
        arusUangLabel: isKompensasi
          ? 'Sinkron Titipan (Non-Tunai)'
          : isPotongGaji
          ? 'Potong Gaji/Upah (Non-Tunai)'
          : 'Uang Masuk (+)',
        deskripsi: `Pelunasan Bon: ${by.keterangan || by.metode}`,
        pihakTerkait: by.namaMitra,
        kategoriPihak: 'MITRA',
        rekening: by.rekeningTujuan || 'KAS01',
        nominal: by.nominalBayar,
        nominalMasuk: isNonTunai ? 0 : by.nominalBayar,
        nominalKeluar: 0,
        metode: by.metode,
        status: 'LUNAS',
      });
    }

    // 6. Beban Operasional Divisi
    for (const exp of db.pengeluaran || []) {
      list.push({
        id: exp.idTransaksi,
        tanggal: normalizeDateStr(exp.tanggal),
        jam: exp.jam || '14:00',
        timestamp: exp.createdAt || exp.tanggal,
        jenis: 'PENGELUARAN_DIVISI',
        jenisLabel: 'Beban Operasional Divisi',
        arusUang: 'KELUAR',
        arusUangLabel: 'Uang Keluar (-)',
        deskripsi: `[${exp.divisi}] ${exp.kategori}: ${exp.keterangan}`,
        pihakTerkait: exp.penerima || exp.divisi,
        kategoriPihak: 'DIVISI',
        rekening: exp.rekeningSumber || 'KAS01',
        nominal: exp.nominal,
        nominalMasuk: 0,
        nominalKeluar: exp.nominal,
        metode: 'TUNAI/TRANSFER',
        status: 'SELESAI',
        fotoBukti: exp.fotoKuitansi,
        divisi: exp.divisi,
      });
    }

    // 7. Pencairan Titipan Hasil Bumi
    for (const pt of db.pencairanTitipan || []) {
      const isKompensasi =
        pt.metodePembayaran === 'SINKRON' ||
        pt.metodePembayaran === 'KOMPENSASI_BON' ||
        pt.rekeningSumber === 'SINKRON' ||
        Boolean(pt.isKompensasiBon);
      list.push({
        id: pt.idPencairan,
        tanggal: normalizeDateStr(pt.tanggal),
        jam: pt.jam || '15:00',
        timestamp: pt.createdAt || pt.tanggal,
        jenis: 'PENCAIRAN_TITIPAN',
        jenisLabel: isKompensasi ? 'Sinkron Potong Titipan ke Bon' : 'Pencairan Titipan Hasil Bumi',
        arusUang: isKompensasi ? 'NON_TUNAI' : 'KELUAR',
        arusUangLabel: isKompensasi ? 'Sinkron Titipan (Non-Tunai)' : 'Uang Keluar (-)',
        deskripsi: `Pencairan Titipan: ${pt.keterangan || pt.metodePembayaran}`,
        pihakTerkait: pt.namaMitra,
        kategoriPihak: 'MITRA',
        rekening: pt.rekeningSumber || 'KAS01',
        nominal: pt.nominalPencairan,
        nominalMasuk: 0,
        nominalKeluar: isKompensasi ? 0 : pt.nominalPencairan,
        metode: pt.metodePembayaran,
        status: 'LUNAS',
      });
    }

    // 8. Catatan Hak Upah Harian Karyawan (Akrual Buku Kerja; Pencairan Kas tercatat di Penggajian)
    for (const u of db.upahHarian || []) {
      const upahNominal = u.totalUpahHarian || u.jumlah || u.upahHarian || 0;
      list.push({
        id: u.id,
        tanggal: normalizeDateStr(u.tanggalKerja),
        jam: '16:30',
        timestamp: u.createdAt || u.tanggalKerja,
        jenis: 'UPAH_HARIAN',
        jenisLabel: 'Hak Upah Kerja Harian',
        arusUang: 'NON_TUNAI',
        arusUangLabel: u.status === 'SUDAH_DIBAYAR' ? 'Tercair via Slip Gaji' : 'Hak Upah Berjalan (Akrual)',
        deskripsi: `Kerja Harian [${u.divisi}]: ${u.item || 'Kerja Harian'}${u.catatan ? ` (${u.catatan})` : ''}`,
        pihakTerkait: u.namaKaryawan,
        kategoriPihak: 'KARYAWAN',
        rekening: u.rekening || 'HUTANG_UPAH',
        nominal: upahNominal,
        nominalMasuk: 0,
        nominalKeluar: 0,
        metode: u.status === 'SUDAH_DIBAYAR' ? 'LUNAS_SLIP' : 'AKRUAL',
        status: u.status || 'TERCATAT',
        divisi: u.divisi,
      });
    }

    // 9. Penggajian Bulanan
    for (const g of db.penggajian || []) {
      list.push({
        id: g.id,
        tanggal: normalizeDateStr(g.tanggal),
        jam: g.jam || '10:00',
        timestamp: `${g.tanggal} ${g.jam || '10:00'}`,
        jenis: 'PENGGAJIAN',
        jenisLabel: 'Gaji Bulanan Karyawan',
        arusUang: 'KELUAR',
        arusUangLabel: 'Uang Keluar (-)',
        deskripsi: `Gaji Karyawan Periode ${g.periodeBulan} [${g.divisi}]`,
        pihakTerkait: g.namaKaryawan,
        kategoriPihak: 'KARYAWAN',
        rekening: g.rekeningSumber || 'KAS01',
        nominal: g.gajiBersihDibayar,
        nominalMasuk: 0,
        nominalKeluar: g.gajiBersihDibayar,
        metode: 'TRANSFER',
        status: 'SELESAI',
        divisi: g.divisi,
      });
    }

    // 10. Transfer Antar Rekening & Transaksi Terpadu Anak Perusahaan (DP Parabot)
    for (const t of db.transferRekening || []) {
      const sRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
      const dRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
      const isAnakTx = Boolean(
        t.idMitraTerkait || this.isAnakPerusahaanRekening(sRek) || this.isAnakPerusahaanRekening(dRek)
      );
      const namaAfiliasi =
        t.namaMitraTerkait ||
        (this.isAnakPerusahaanRekening(dRek) ? dRek?.nama : this.isAnakPerusahaanRekening(sRek) ? sRek?.nama : 'DP Parabot');
      list.push({
        id: t.noTransfer,
        tanggal: normalizeDateStr(t.tanggal),
        jam: t.jam || '12:00',
        timestamp: t.createdAt || t.tanggal,
        jenis: 'TRANSFER_REKENING',
        jenisLabel: isAnakTx
          ? t.tipeMutasiAfiliasi === 'TARIK_DARI_ANAK_PERUSAHAAN' || this.isAnakPerusahaanRekening(sRek)
            ? 'Tarik / Talangan Anak Perusahaan'
            : 'Simpan Dana ke Anak Perusahaan'
          : 'Transfer Antar Rekening',
        arusUang: 'MUTASI',
        arusUangLabel: isAnakTx ? '1 Transaksi Terpadu (Rekening & Mitra)' : 'Mutasi Internal',
        deskripsi: isAnakTx
          ? `[Terpadu Rekening & Mitra ${namaAfiliasi}] ${t.rekeningSumber} -> ${t.rekeningTujuan} (${t.keterangan || '-'})`
          : `Transfer Rekening: ${t.rekeningSumber} -> ${t.rekeningTujuan} (${t.keterangan || '-'})`,
        pihakTerkait: isAnakTx ? `${namaAfiliasi} (Anak Perusahaan & Mitra)` : 'Internal PT Wijaya Agro',
        kategoriPihak: isAnakTx ? 'MITRA' : 'INTERNAL',
        rekening: `${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        nominalMasuk: 0,
        nominalKeluar: 0,
        metode: isAnakTx ? '1_TRANSAKSI_TERPADU' : 'MUTASI',
        status: t.status,
      });
    }

    // Sort newest first
    list.sort((a, b) => {
      const da = a.tanggal.split('/').reverse().join('-');
      const dbDate = b.tanggal.split('/').reverse().join('-');
      if (da !== dbDate) return dbDate.localeCompare(da);
      return (b.jam || '').localeCompare(a.jam || '');
    });

    // Collect all available dates and names
    const dateSet = new Set<string>();
    const partySet = new Set<string>();
    list.forEach((tx) => {
      if (tx.tanggal) dateSet.add(tx.tanggal);
      if (tx.pihakTerkait) partySet.add(tx.pihakTerkait);
    });

    const daftarTanggalTersedia = Array.from(dateSet).sort((a, b) => {
      const da = a.split('/').reverse().join('-');
      const dbDate = b.split('/').reverse().join('-');
      return dbDate.localeCompare(da);
    });
    const daftarPihakTerkait = Array.from(partySet).sort((a, b) => a.localeCompare(b));

    // Filter by targetDate if requested
    let filtered = list;
    if (targetDate) {
      filtered = filtered.filter((tx) => tx.tanggal === targetDate);
    }

    // Filter by arusUang
    if (filters?.arusUang && filters.arusUang !== 'ALL') {
      filtered = filtered.filter((tx) => tx.arusUang === filters.arusUang);
    }

    // Filter by kategori / jenis
    if (filters?.kategori && filters.kategori !== 'ALL') {
      filtered = filtered.filter((tx) => tx.jenis === filters.kategori);
    }

    // Filter by pihakTerkait
    if (filters?.pihakTerkait && filters.pihakTerkait !== 'ALL') {
      filtered = filtered.filter((tx) =>
        tx.pihakTerkait.toLowerCase().includes(filters.pihakTerkait!.toLowerCase())
      );
    }

    // Filter by search
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (tx) =>
          tx.id.toLowerCase().includes(q) ||
          tx.deskripsi.toLowerCase().includes(q) ||
          tx.pihakTerkait.toLowerCase().includes(q) ||
          tx.rekening.toLowerCase().includes(q) ||
          tx.jenisLabel.toLowerCase().includes(q) ||
          tx.metode.toLowerCase().includes(q) ||
          Boolean(tx.divisi && tx.divisi.toLowerCase().includes(q))
      );
    }

    // Calculate Summary
    const totalUangMasuk = filtered.reduce((s, tx) => s + tx.nominalMasuk, 0);
    const totalUangKeluar = filtered.reduce((s, tx) => s + tx.nominalKeluar, 0);
    const arusKasBersih = totalUangMasuk - totalUangKeluar;
    const totalNonTunai = filtered
      .filter((tx) => tx.arusUang === 'NON_TUNAI')
      .reduce((s, tx) => s + tx.nominal, 0);

    const masukCount = filtered.filter((tx) => tx.arusUang === 'MASUK').length;
    const keluarCount = filtered.filter((tx) => tx.arusUang === 'KELUAR').length;
    const mutasiCount = filtered.filter((tx) => tx.arusUang === 'MUTASI').length;
    const nonTunaiCount = filtered.filter((tx) => tx.arusUang === 'NON_TUNAI').length;

    return {
      summary: {
        tanggalQuery: targetDate || 'Semua Tanggal',
        totalTransaksi: filtered.length,
        totalUangMasuk,
        totalUangKeluar,
        arusKasBersih,
        totalNonTunai,
        rincianArus: {
          masukCount,
          keluarCount,
          mutasiCount,
          nonTunaiCount,
        },
      },
      transactions: filtered,
      daftarPihakTerkait,
      daftarTanggalTersedia,
    };
  }

  // ==========================================
  // FITUR: PEMBERSIHAN BUKTI NOTA LALU & SINKRONISASI REKENING MITRA
  // ==========================================
  public static getDaftarBuktiNotaLalu(filters?: {
    idMitra?: string;
    waktuFilter?: 'ALL' | 'BEFORE_DATE' | 'RANGE' | 'TODAY' | 'THIS_MONTH';
    beforeDate?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    hanyaNotaLalu?: boolean;
  }): {
    items: Array<{
      id: string;
      tabel: 'kasbonUang' | 'pembelianHasilBumi';
      tipe: 'PIUTANG_NOTA_LALU' | 'TITIP_NOTA_LALU' | 'KASBON_FOTO' | 'TITIP_FOTO';
      tipeLabel: string;
      idMitra: string;
      namaMitra: string;
      tanggal: string;
      jam?: string;
      noNota: string;
      nominal: number;
      keterangan: string;
      rincianBarang?: string;
      hasFoto: boolean;
      fotoNota: string;
      fotoNotaCount: number;
      driveFileUrl?: string;
      isNotaLalu: boolean;
      createdAt?: string;
    }>;
    summary: {
      totalItems: number;
      totalPiutangNotaLalu: number;
      totalTitipNotaLalu: number;
      totalFotoBukti: number;
      daftarMitraTerkait: Array<{ id: string; nama: string; count: number }>;
    };
  } {
    const db = dbManager.get();

    const parseToTime = (str?: string): number => {
      if (!str) return 0;
      const clean = str.trim();
      const dmParts = clean.split('/');
      if (dmParts.length === 3) {
        return new Date(parseInt(dmParts[2], 10), parseInt(dmParts[1], 10) - 1, parseInt(dmParts[0], 10)).getTime();
      }
      const ymParts = clean.split('-');
      if (ymParts.length === 3 && ymParts[0].length === 4) {
        return new Date(parseInt(ymParts[0], 10), parseInt(ymParts[1], 10) - 1, parseInt(ymParts[2], 10)).getTime();
      }
      const d = new Date(clean).getTime();
      return isNaN(d) ? 0 : d;
    };

    const allItems: Array<{
      id: string;
      tabel: 'kasbonUang' | 'pembelianHasilBumi';
      tipe: 'PIUTANG_NOTA_LALU' | 'TITIP_NOTA_LALU' | 'KASBON_FOTO' | 'TITIP_FOTO';
      tipeLabel: string;
      idMitra: string;
      namaMitra: string;
      tanggal: string;
      jam?: string;
      noNota: string;
      nominal: number;
      keterangan: string;
      rincianBarang?: string;
      hasFoto: boolean;
      fotoNota: string;
      fotoNotaCount: number;
      driveFileUrl?: string;
      isNotaLalu: boolean;
      createdAt?: string;
    }> = [];

    // 1. Dari Kasbon Uang (Piutang Barang / Bon Masa Lalu)
    for (const k of db.kasbonUang || []) {
      const isNotaLalu =
        k.isNotaLalu === true ||
        k.rekeningSumber === 'BON01' ||
        (k.keterangan && k.keterangan.toLowerCase().includes('nota lalu')) ||
        (k.idTransaksi && k.idTransaksi.startsWith('NTL-')) ||
        !!k.noNotaLalu;

      const fotoCount = (k.fotoNotaList && k.fotoNotaList.length > 0)
        ? k.fotoNotaList.length
        : (k.fotoNota ? k.fotoNota.split('|||').filter(Boolean).length : 0);
      const hasFoto = fotoCount > 0;

      if (filters?.hanyaNotaLalu && !isNotaLalu) continue;
      if (!isNotaLalu && !hasFoto) continue;

      const displayTgl = k.tanggalNotaLalu || k.tanggal;
      const primaryFoto = k.fotoNotaList?.[0] || (k.fotoNota ? k.fotoNota.split('|||')[0] : '');

      allItems.push({
        id: k.idTransaksi,
        tabel: 'kasbonUang',
        tipe: isNotaLalu ? 'PIUTANG_NOTA_LALU' : 'KASBON_FOTO',
        tipeLabel: isNotaLalu ? 'Piutang Bon Barang (Nota Lalu)' : 'Kasbon Uang Tunai',
        idMitra: k.idMitra,
        namaMitra: k.namaMitra,
        tanggal: displayTgl,
        jam: k.jam,
        noNota: k.noNotaLalu || k.idTransaksi,
        nominal: k.nominal,
        keterangan: k.keterangan || '-',
        rincianBarang: k.rincianBarangNotaLalu,
        hasFoto,
        fotoNota: primaryFoto,
        fotoNotaCount: fotoCount,
        driveFileUrl: k.driveFileUrl,
        isNotaLalu,
        createdAt: k.createdAt,
      });
    }

    // 2. Dari Pembelian Hasil Bumi (Titipan Uang / Hasil Panen Masa Lalu)
    for (const pb of db.pembelianHasilBumi || []) {
      const isNotaLalu =
        pb.isNotaLalu === true ||
        pb.rekeningSumber === 'TIT01' ||
        pb.komoditasKode === 'TITIP_DANA' ||
        (pb.keterangan && pb.keterangan.toLowerCase().includes('nota lalu')) ||
        (pb.noPembelian && pb.noPembelian.startsWith('TTL-')) ||
        !!pb.noNotaLalu;

      const fotoCount = (pb.fotoNotaList && pb.fotoNotaList.length > 0)
        ? pb.fotoNotaList.length
        : (pb.fotoNota ? pb.fotoNota.split('|||').filter(Boolean).length : 0);
      const hasFoto = fotoCount > 0;

      if (filters?.hanyaNotaLalu && !isNotaLalu) continue;
      if (!isNotaLalu && !(pb.metodePembayaran === 'TITIP' && hasFoto)) continue;

      const displayTgl = pb.tanggalNotaLalu || pb.tanggal;
      const primaryFoto = pb.fotoNotaList?.[0] || (pb.fotoNota ? pb.fotoNota.split('|||')[0] : '');

      allItems.push({
        id: pb.noPembelian,
        tabel: 'pembelianHasilBumi',
        tipe: isNotaLalu ? 'TITIP_NOTA_LALU' : 'TITIP_FOTO',
        tipeLabel: isNotaLalu ? 'Titipan Uang / Panen (Nota Lalu)' : 'Titip Hasil Bumi',
        idMitra: pb.idMitra,
        namaMitra: pb.namaMitra,
        tanggal: displayTgl,
        jam: pb.jam,
        noNota: pb.noNotaLalu || pb.noPembelian,
        nominal: pb.totalNominal,
        keterangan: pb.keterangan || (pb.komoditasNama ? `Titip ${pb.komoditasNama}` : '-'),
        hasFoto,
        fotoNota: primaryFoto,
        fotoNotaCount: fotoCount,
        driveFileUrl: pb.driveFileUrl,
        isNotaLalu,
        createdAt: pb.createdAt,
      });
    }

    // Sort newest to oldest
    allItems.sort((a, b) => parseToTime(b.tanggal) - parseToTime(a.tanggal));

    // Apply Filter by Mitra
    let filtered = allItems;
    if (filters?.idMitra && filters.idMitra !== 'ALL') {
      filtered = filtered.filter((it) => it.idMitra === filters.idMitra);
    }

    // Apply Filter by Search (nama atau no nota)
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(
        (it) =>
          it.namaMitra.toLowerCase().includes(q) ||
          it.noNota.toLowerCase().includes(q) ||
          it.keterangan.toLowerCase().includes(q) ||
          (it.rincianBarang && it.rincianBarang.toLowerCase().includes(q))
      );
    }

    // Apply Filter by Waktu
    if (filters?.waktuFilter && filters.waktuFilter !== 'ALL') {
      const now = new Date();
      const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      if (filters.waktuFilter === 'TODAY') {
        filtered = filtered.filter((it) => {
          const t = parseToTime(it.tanggal);
          return t >= todayTimestamp && t < todayTimestamp + 86400000;
        });
      } else if (filters.waktuFilter === 'THIS_MONTH') {
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
        filtered = filtered.filter((it) => {
          const t = parseToTime(it.tanggal);
          return t >= startMonth && t <= endMonth;
        });
      } else if (filters.waktuFilter === 'BEFORE_DATE' && filters.beforeDate) {
        const threshold = parseToTime(filters.beforeDate) + 86399999;
        filtered = filtered.filter((it) => parseToTime(it.tanggal) <= threshold);
      } else if (filters.waktuFilter === 'RANGE') {
        const start = filters.startDate ? parseToTime(filters.startDate) : 0;
        const end = filters.endDate ? parseToTime(filters.endDate) + 86399999 : Infinity;
        filtered = filtered.filter((it) => {
          const t = parseToTime(it.tanggal);
          return t >= start && t <= end;
        });
      }
    }

    // Summary calculation
    let totalPiutangNotaLalu = 0;
    let totalTitipNotaLalu = 0;
    let totalFotoBukti = 0;
    const mitraCountMap = new Map<string, { id: string; nama: string; count: number }>();

    for (const it of filtered) {
      if (it.tipe === 'PIUTANG_NOTA_LALU' || it.tabel === 'kasbonUang') {
        totalPiutangNotaLalu += it.nominal;
      } else {
        totalTitipNotaLalu += it.nominal;
      }
      if (it.hasFoto) totalFotoBukti += it.fotoNotaCount;

      if (!mitraCountMap.has(it.idMitra)) {
        mitraCountMap.set(it.idMitra, { id: it.idMitra, nama: it.namaMitra, count: 0 });
      }
      mitraCountMap.get(it.idMitra)!.count++;
    }

    return {
      items: filtered,
      summary: {
        totalItems: filtered.length,
        totalPiutangNotaLalu,
        totalTitipNotaLalu,
        totalFotoBukti,
        daftarMitraTerkait: Array.from(mitraCountMap.values()).sort((a, b) => b.count - a.count),
      },
    };
  }

  /**
   * Eksekusi Bersihkan Bukti Nota Lalu & Sinkronkan Rekening Mitra
   */
  public static async bersihkanBuktiNotaLalu(params: {
    targetIds?: string[];
    idMitra?: string;
    waktuFilter?: 'ALL' | 'BEFORE_DATE' | 'RANGE' | 'TODAY' | 'THIS_MONTH';
    beforeDate?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    hanyaNotaLalu?: boolean;
    modeHapus?: 'HAPUS_TRANSAKSI' | 'HANYA_HAPUS_FOTO';
    user?: string;
  }): Promise<{
    success: boolean;
    countDeleted: number;
    affectedMitraIds: string[];
    affectedMitraNames: string[];
    totalNominalPiutang: number;
    totalNominalTitip: number;
    message: string;
  }> {
    return await dbManager.executeTransaction((db) => {
      // Dapatkan daftar kandidat
      const listData = this.getDaftarBuktiNotaLalu({
        idMitra: params.idMitra,
        waktuFilter: params.waktuFilter,
        beforeDate: params.beforeDate,
        startDate: params.startDate,
        endDate: params.endDate,
        search: params.search,
        hanyaNotaLalu: params.hanyaNotaLalu,
      });

      // Filter berdasarkan targetIds jika ada
      const targetItems = params.targetIds && params.targetIds.length > 0
        ? listData.items.filter((it) => params.targetIds!.includes(it.id))
        : listData.items;

      if (targetItems.length === 0) {
        return {
          success: true,
          countDeleted: 0,
          affectedMitraIds: [],
          affectedMitraNames: [],
          totalNominalPiutang: 0,
          totalNominalTitip: 0,
          message: 'Tidak ada bukti nota lalu yang sesuai dengan kriteria yang dipilih.',
        };
      }

      const affectedMitraIdSet = new Set<string>();
      const affectedMitraNameSet = new Set<string>();
      let totalNominalPiutang = 0;
      let totalNominalTitip = 0;
      let count = 0;

      const mode = params.modeHapus || 'HAPUS_TRANSAKSI';

      for (const item of targetItems) {
        affectedMitraIdSet.add(item.idMitra);
        affectedMitraNameSet.add(item.namaMitra);

        if (item.tabel === 'kasbonUang') {
          const idx = (db.kasbonUang || []).findIndex((k) => k.idTransaksi === item.id);
          if (idx !== -1) {
            if (mode === 'HAPUS_TRANSAKSI') {
              totalNominalPiutang += db.kasbonUang[idx].nominal;
              db.kasbonUang.splice(idx, 1);
              count++;
            } else {
              db.kasbonUang[idx].fotoNota = '';
              db.kasbonUang[idx].fotoNotaList = [];
              count++;
            }
          }
        } else if (item.tabel === 'pembelianHasilBumi') {
          const idx = (db.pembelianHasilBumi || []).findIndex((pb) => pb.noPembelian === item.id);
          if (idx !== -1) {
            if (mode === 'HAPUS_TRANSAKSI') {
              totalNominalTitip += db.pembelianHasilBumi[idx].totalNominal;
              db.pembelianHasilBumi.splice(idx, 1);
              count++;
            } else {
              db.pembelianHasilBumi[idx].fotoNota = '';
              db.pembelianHasilBumi[idx].fotoNotaList = [];
              count++;
            }
          }
        }
      }

      // Sinkronkan Virtual Accounts BON01 (Kasbon Piutang) & TIT01 (Titipan)
      dbManager.synchronizeVirtualAccounts();

      const affectedMitraIds = Array.from(affectedMitraIdSet);
      const affectedMitraNames = Array.from(affectedMitraNameSet);

      // Audit Log
      const { tanggal, jam } = getWIBDateTime();
      const auditMsg = mode === 'HAPUS_TRANSAKSI'
        ? `Membersihkan ${count} bukti transaksi nota lalu untuk mitra [${affectedMitraNames.slice(0, 4).join(', ')}${affectedMitraNames.length > 4 ? ` +${affectedMitraNames.length - 4}` : ''}] (Total Piutang Berkurang: Rp ${totalNominalPiutang.toLocaleString('id-ID')}, Total Titip Berkurang: Rp ${totalNominalTitip.toLocaleString('id-ID')})`
        : `Membersihkan foto bukti fisik pada ${count} transaksi untuk mitra [${affectedMitraNames.slice(0, 4).join(', ')}]`;

      this.addAuditLog(
        db,
        'VOID',
        `VOID-NOTALALU-${Date.now()}`,
        auditMsg,
        totalNominalPiutang + totalNominalTitip,
        'BON01/TIT01'
      );

      const msgAction = mode === 'HAPUS_TRANSAKSI'
        ? `Berhasil menghapus ${count} bukti nota lalu. Rekening koran ${affectedMitraNames.length} mitra telah otomatis disesuaikan.`
        : `Berhasil membersihkan foto lampiran pada ${count} transaksi nota.`;

      return {
        success: true,
        countDeleted: count,
        affectedMitraIds,
        affectedMitraNames,
        totalNominalPiutang,
        totalNominalTitip,
        message: msgAction,
      };
    });
  }

  // ==========================================
  // 10. PUSAT KONTROL KASIR: KLIRING SILANG, DETEKSI NAMA KEMBAR & CASH OPNAME
  // ==========================================
  private static normalizeIndonesianName(rawName: string): {
    rawClean: string;
    phoneticKey: string;
  } {
    const lower = (rawName || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Strip common honorifics at start
    const honorificRegex = /^(bapak|bpk|pak|ibu|bu|haji|hj|h|mas|mbak|kang|bang|cak|om|tante|sdr|toko|ud|cv|pt)\s+/i;
    let stripped = lower;
    while (honorificRegex.test(stripped)) {
      stripped = stripped.replace(honorificRegex, '').trim();
    }

    // Indonesian phonetic normalization (e.g. Wiwid <-> Wiwit, Slamed <-> Slamet, Syamsul <-> Samsul, Fajar <-> Pajar)
    const phoneticTokens = stripped.split(' ').map((word) => {
      return word
        .replace(/oe/g, 'u')
        .replace(/dj/g, 'j')
        .replace(/tj/g, 'c')
        .replace(/sy/g, 's')
        .replace(/sh/g, 's')
        .replace(/kh/g, 'k')
        .replace(/ch/g, 'k')
        .replace(/ph/g, 'p')
        .replace(/f/g, 'p')
        .replace(/v/g, 'p')
        .replace(/y/g, 'i')
        .replace(/d$/g, 't') // Wiwid -> Wiwit, Achmad -> Achmat
        .replace(/b$/g, 'p') // Wahab -> Wahap
        .replace(/g$/g, 'k') // Sugeng / Tatag
        .replace(/(.)\1+/g, '$1'); // collapse double letters: Muuhammad -> Muhamad
    });

    return {
      rawClean: stripped,
      phoneticKey: phoneticTokens.join(' '),
    };
  }

  private static levenshteinSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }

    const maxLen = Math.max(m, n);
    return maxLen === 0 ? 1 : (maxLen - dp[m][n]) / maxLen;
  }

  public static getSmartControlOverview(): SmartControlOverviewResponse {
    const db = dbManager.get();
    const { tanggal } = getWIBDateTime();
    const rekapMitra = this.getRekapMasterMitra();

    const semuaMitraSaldo: KandidatKliringMitra[] = rekapMitra.items
      .filter((m) => m.status === 'AKTIF' && (m.totalHutangTitipPanen > 0 || m.totalBonMitra > 0))
      .map((m) => {
        const unpaidBarangCount = (db.penjualan || []).filter(
          (p) => p.idMitra === m.id && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR' && p.sisaPiutang > 0
        ).length;
        const unpaidUangCount = (db.kasbonUang || []).filter(
          (k) => k.idMitra === m.id && k.status !== 'LUNAS' && k.sisaKasbon > 0
        ).length;

        const saldoTitipan = m.totalHutangTitipPanen;
        const totalKasbon = m.totalBonMitra;
        const potensiPotongSilang = Math.min(saldoTitipan, totalKasbon);

        return {
          idMitra: m.id,
          kodeMitra: m.kode,
          namaMitra: m.nama,
          role: m.role,
          telepon: m.telepon,
          saldoTitipan,
          kasbonBarang: m.totalKasbonBarang,
          kasbonUang: m.totalKasbonUang,
          totalKasbon,
          potensiPotongSilang,
          hakBersihMitra: Math.max(0, saldoTitipan - totalKasbon),
          sisaKurangBon: Math.max(0, totalKasbon - saldoTitipan),
          jumlahNotaBonAktif: unpaidBarangCount + unpaidUangCount,
        };
      })
      .sort((a, b) => {
        if (b.potensiPotongSilang !== a.potensiPotongSilang) {
          return b.potensiPotongSilang - a.potensiPotongSilang;
        }
        return b.saldoTitipan + b.totalKasbon - (a.saldoTitipan + a.totalKasbon);
      });

    const kandidatKliring = semuaMitraSaldo.filter((k) => k.potensiPotongSilang > 0);

    // Detect duplicate / phonetically similar Mitra accounts
    const pasanganKembar: PasanganMitraKembar[] = [];
    const activeItems = rekapMitra.items;

    for (let i = 0; i < activeItems.length; i++) {
      for (let j = i + 1; j < activeItems.length; j++) {
        const mA = activeItems[i];
        const mB = activeItems[j];

        const normA = this.normalizeIndonesianName(mA.nama);
        const normB = this.normalizeIndonesianName(mB.nama);

        if (!normA.rawClean || !normB.rawClean) continue;

        const phoneA = (mA.telepon || '').replace(/[^0-9]/g, '');
        const phoneB = (mB.telepon || '').replace(/[^0-9]/g, '');
        const samePhone = phoneA.length >= 8 && phoneA === phoneB;

        const exactPhonetic = normA.phoneticKey.length >= 3 && normA.phoneticKey === normB.phoneticKey;
        const rawSim = this.levenshteinSimilarity(normA.rawClean, normB.rawClean);
        const phoneticSim = this.levenshteinSimilarity(normA.phoneticKey, normB.phoneticKey);

        let score = 0;
        let alasan = '';

        if (normA.rawClean === normB.rawClean) {
          score = 99;
          alasan = 'Nama pokok identik persis (hanya beda gelar/sapaan atau spasi)';
        } else if (exactPhonetic) {
          score = 96;
          alasan = `Ejaan fonetik identik ("${mA.nama}" vs "${mB.nama}", rawan salah input huruf akhir/vokal)`;
        } else if (samePhone) {
          score = Math.max(92, Math.round(phoneticSim * 100));
          alasan = `Nomor telepon/WA sama persis (${mA.telepon})`;
        } else if (phoneticSim >= 0.84 && normA.phoneticKey.length >= 4 && normB.phoneticKey.length >= 4) {
          score = Math.round(phoneticSim * 100);
          alasan = `Kemiripan ejaan nama sangat tinggi (${score}%)`;
        } else if (rawSim >= 0.84 && normA.rawClean.length >= 4 && normB.rawClean.length >= 4) {
          score = Math.round(rawSim * 100);
          alasan = `Kemiripan penulisan nama sangat tinggi (${score}%)`;
        }

        if (score >= 84) {
          const risikoSilang =
            (mA.totalHutangTitipPanen > 0 && mB.totalBonMitra > 0) ||
            (mB.totalHutangTitipPanen > 0 && mA.totalBonMitra > 0);
          pasanganKembar.push({
            pairKey: `${mA.id}_${mB.id}`,
            mitraA: mA,
            mitraB: mB,
            similarityScore: score,
            alasanKemiripan: alasan,
            risikoSilang,
          });
        }
      }
    }

    pasanganKembar.sort((a, b) => {
      if (a.risikoSilang !== b.risikoSilang) return a.risikoSilang ? -1 : 1;
      return b.similarityScore - a.similarityScore;
    });

    const kas01 = db.rekening.find((r) => r.kode === 'KAS01');
    const saldoKas01SaatIni = kas01 ? kas01.saldoSaatIni : 0;

    // Ringkasan pergerakan fisik KAS01 hari ini
    const masukPenjualanKas01 =
      (db.penjualan || [])
        .filter((p) => p.tanggal === tanggal && p.metode === 'TUNAI' && p.rekeningTujuan === 'KAS01')
        .reduce((s, p) => s + (p.totalNominal || 0), 0) +
      (db.penjualanHasilBumi || [])
        .filter((j) => j.tanggal === tanggal && j.metodePembayaran === 'TUNAI' && j.rekeningTujuan === 'KAS01')
        .reduce((s, j) => s + (j.totalNominal || 0), 0);
    const masukBayarBonKas01 = (db.bayarBon || [])
      .filter(
        (b) =>
          b.tanggal === tanggal &&
          b.rekeningTujuan === 'KAS01' &&
          b.metode !== 'KOMPENSASI_TITIP' &&
          b.metode !== 'POTONG_GAJI' &&
          !b.isKompensasiTitipan &&
          !b.isPotongGaji
      )
      .reduce((s, b) => s + (b.nominalBayar || 0), 0);
    const masukPinjamanDanaKas01 = (db.pembelianHasilBumi || [])
      .filter(
        (b) =>
          b.tanggal === tanggal &&
          (b.komoditasKode === 'PINJAMAN_DANA' || b.komoditasNama?.includes('Pinjaman Uang')) &&
          b.rekeningSumber === 'KAS01'
      )
      .reduce((s, b) => s + (b.totalNominal || 0), 0);
    const masukTransferKas01 = (db.transferRekening || [])
      .filter((t) => t.tanggal === tanggal && t.rekeningTujuan === 'KAS01')
      .reduce((s, t) => s + (t.nominal || 0), 0);

    const keluarBeliPanenKas01 = (db.pembelianHasilBumi || [])
      .filter(
        (b) =>
          b.tanggal === tanggal &&
          b.metodePembayaran === 'TUNAI' &&
          b.rekeningSumber === 'KAS01' &&
          b.komoditasKode !== 'PINJAMAN_DANA' &&
          !b.komoditasNama?.includes('Pinjaman Uang')
      )
      .reduce((s, b) => s + (b.totalNominal || 0), 0);
    const keluarKulakanKas01 = (db.pembelianBarang || [])
      .filter((b) => b.tanggal === tanggal && b.metodePembayaran === 'TUNAI' && b.rekeningSumber === 'KAS01')
      .reduce((s, b) => s + (b.totalNominal || 0), 0);
    const keluarKasbonKas01 = (db.kasbonUang || [])
      .filter((k) => k.tanggal === tanggal && k.rekeningSumber === 'KAS01' && !k.isNotaLalu)
      .reduce((s, k) => s + (k.nominal || 0), 0);
    const keluarBiayaKas01 = (db.pengeluaran || [])
      .filter((e) => e.tanggal === tanggal && e.rekeningSumber === 'KAS01')
      .reduce((s, e) => s + (e.nominal || 0), 0);
    const keluarTitipanKas01 = (db.pencairanTitipan || [])
      .filter(
        (pt) =>
          pt.tanggal === tanggal &&
          pt.rekeningSumber === 'KAS01' &&
          pt.metodePembayaran !== 'KOMPENSASI_BON' &&
          !pt.isKompensasiBon
      )
      .reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const keluarGajiKas01 = (db.penggajian || [])
      .filter((g) => g.tanggal === tanggal && g.rekeningSumber === 'KAS01')
      .reduce((s, g) => s + (g.gajiBersihDibayar || 0), 0);
    const keluarTransferKas01 = (db.transferRekening || [])
      .filter((t) => t.tanggal === tanggal && t.rekeningSumber === 'KAS01')
      .reduce((s, t) => s + (t.nominal || 0), 0);

    const kompensasiNonTunaiHariIni = (db.bayarBon || [])
      .filter(
        (b) =>
          b.tanggal === tanggal &&
          (b.metode === 'KOMPENSASI_TITIP' || b.metode === 'POTONG_GAJI' || b.isKompensasiTitipan || b.isPotongGaji)
      )
      .reduce((s, b) => s + (b.nominalBayar || 0), 0);

    return {
      kandidatKliring,
      semuaMitraSaldo,
      pasanganKembar,
      cashOpnameLogs: db.cashOpnameLogs || [],
      saldoKas01SaatIni,
      ringkasanKasHariIni: {
        tanggal,
        masukTunaiKas01: masukPenjualanKas01 + masukBayarBonKas01 + masukPinjamanDanaKas01 + masukTransferKas01,
        keluarTunaiKas01:
          keluarBeliPanenKas01 +
          keluarKulakanKas01 +
          keluarKasbonKas01 +
          keluarBiayaKas01 +
          keluarTitipanKas01 +
          keluarGajiKas01 +
          keluarTransferKas01,
        kompensasiNonTunaiHariIni,
      },
    };
  }

  /**
   * Eksekusi Kliring Silang (Potong Bon dari Saldo Titipan Hasil Bumi) + Penyelesaian Sisa Kas/Bank Opsional
   */
  public static async processKliringSilangMitra(params: {
    idMitra: string;
    nominalPotongSilang: number;
    aksiSisa: 'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON';
    nominalPenyelesaianFisik?: number;
    metodeFisik?: 'TUNAI' | 'TRANSFER';
    rekeningFisik?: string;
    keterangan?: string;
  }): Promise<HasilKliringSilangResponse> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Data mitra tidak ditemukan');
      if (mitra.status !== 'AKTIF') throw new Error(`Mitra ${mitra.nama} berstatus nonaktif`);

      // Hitung saldo aktual saat ini
      const outstandingPenjualan = (db.penjualan || []).filter(
        (p) => p.idMitra === mitra.id && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR' && p.sisaPiutang > 0
      );
      const outstandingPenjualanHb = (db.penjualanHasilBumi || []).filter(
        (j) =>
          j.idMitra === mitra.id &&
          j.metodePembayaran === 'PIUTANG' &&
          j.statusPembayaran === 'BELUM_BAYAR' &&
          j.sisaPiutang > 0
      );
      const totalKasbonBarang =
        outstandingPenjualan.reduce((s, p) => s + p.sisaPiutang, 0) +
        outstandingPenjualanHb.reduce((s, j) => s + j.sisaPiutang, 0);

      const outstandingKasbonUang = (db.kasbonUang || []).filter(
        (k) => k.idMitra === mitra.id && k.status !== 'LUNAS' && k.sisaKasbon > 0
      );
      const totalKasbonUang = outstandingKasbonUang.reduce((s, k) => s + k.sisaKasbon, 0);

      const totalKasbonAwal = totalKasbonBarang + totalKasbonUang;

      const totalTitipHasilBumi = (db.pembelianHasilBumi || [])
        .filter((p) => p.idMitra === mitra.id && p.metodePembayaran === 'TITIP')
        .reduce((s, p) => s + p.totalNominal, 0);
      const totalHutangKulakan = (db.pembelianBarang || [])
        .filter((pb) => pb.idMitra === mitra.id && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
        .reduce((s, pb) => s + (pb.totalNominal || 0), 0);
      const totalTitipKotor = totalTitipHasilBumi + totalHutangKulakan;
      const totalPencairanSebelum = (db.pencairanTitipan || [])
        .filter((pt) => pt.idMitra === mitra.id)
        .reduce((s, pt) => s + pt.nominalPencairan, 0);

      const saldoTitipanAwal = Math.max(0, totalTitipKotor - totalPencairanSebelum);
      const maxPotongSilang = Math.min(saldoTitipanAwal, totalKasbonAwal);

      const nominalPotong = Math.round(Number(params.nominalPotongSilang) || 0);
      const nominalFisik = Math.round(Number(params.nominalPenyelesaianFisik) || 0);

      if (nominalPotong < 0) throw new Error('Nominal potong silang tidak boleh negatif');
      if (nominalPotong > maxPotongSilang) {
        throw new Error(
          `Nominal potong silang (${nominalPotong.toLocaleString('id-ID')}) melebihi batas maksimal silang (${maxPotongSilang.toLocaleString('id-ID')})`
        );
      }
      if (nominalPotong === 0 && nominalFisik <= 0) {
        throw new Error('Tidak ada nominal kliring silang maupun penyelesaian fisik yang diproses');
      }

      const idReferensiKliring = generateId('KLR');
      const alokasiBonLunas: AlokasiPembayaranBon[] = [];

      // Helper FIFO untuk melunasi bon
      const allocateBonPayment = (amountToAllocate: number): AlokasiPembayaranBon[] => {
        if (amountToAllocate <= 0) return [];
        const localAlokasi: AlokasiPembayaranBon[] = [];
        const allBons = [
          ...outstandingPenjualan
            .filter((p) => p.sisaPiutang > 0)
            .map((p) => ({
              jenis: 'KASBON_BARANG' as const,
              refId: p.noPenjualan,
              sisa: p.sisaPiutang,
              createdAt: p.createdAt,
              sourceObj: p as TransaksiPenjualan | TransaksiPenjualanHasilBumi,
            })),
          ...outstandingPenjualanHb
            .filter((j) => j.sisaPiutang > 0)
            .map((j) => ({
              jenis: 'KASBON_BARANG' as const,
              refId: j.noPenjualan,
              sisa: j.sisaPiutang,
              createdAt: j.createdAt,
              sourceObj: j as TransaksiPenjualan | TransaksiPenjualanHasilBumi,
            })),
          ...outstandingKasbonUang
            .filter((k) => k.sisaKasbon > 0)
            .map((k) => ({
              jenis: 'KASBON_UANG' as const,
              refId: k.idTransaksi,
              sisa: k.sisaKasbon,
              createdAt: k.createdAt,
              sourceObj: k,
            })),
        ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        let rem = amountToAllocate;
        for (const bon of allBons) {
          if (rem <= 0) break;
          const sebelum = bon.sisa;
          const bayar = Math.min(rem, sebelum);
          const sisaBaru = sebelum - bayar;

          if (bon.jenis === 'KASBON_BARANG') {
            const pj = bon.sourceObj as TransaksiPenjualan | TransaksiPenjualanHasilBumi;
            pj.sisaPiutang = sisaBaru;
            if (sisaBaru === 0) pj.statusPembayaran = 'LUNAS';
          } else {
            const kbu = bon.sourceObj as TransaksiKasbonUang;
            kbu.sisaKasbon = sisaBaru;
            kbu.status = sisaBaru === 0 ? 'LUNAS' : 'SEBAGIAN';
          }

          localAlokasi.push({
            jenis: bon.jenis,
            refId: bon.refId,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: sisaBaru,
          });
          rem -= bayar;
        }
        return localAlokasi;
      };

      let runningTitipan = saldoTitipanAwal;
      let runningKasbon = totalKasbonAwal;

      // 1. Proses Kompensasi Silang Non-Tunai (Titipan <-> Kasbon)
      if (nominalPotong > 0) {
        const alokasiKompensasi = allocateBonPayment(nominalPotong);
        alokasiBonLunas.push(...alokasiKompensasi);

        const sisaBonSetelahPotong = runningKasbon - nominalPotong;
        const sisaTitipSetelahPotong = runningTitipan - nominalPotong;

        if (!db.bayarBon) db.bayarBon = [];
        db.bayarBon.unshift({
          idTransaksi: `${idReferensiKliring}-BON`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: runningKasbon,
          nominalBayar: nominalPotong,
          sisaBonSetelah: sisaBonSetelahPotong,
          metode: 'KOMPENSASI_TITIP',
          rekeningTujuan: 'KOMPENSASI_TITIP',
          isKompensasiTitipan: true,
          alokasi: alokasiKompensasi,
          keterangan:
            params.keterangan ||
            `Kliring Potong Bon Otomatis dari Saldo Titipan Hasil Bumi (${idReferensiKliring})`,
          createdAt: iso,
        });

        if (!db.pencairanTitipan) db.pencairanTitipan = [];
        db.pencairanTitipan.unshift({
          idPencairan: `${idReferensiKliring}-TIT`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: nominalPotong,
          rekeningSumber: 'KOMPENSASI_BON',
          saldoTitipanSebelum: runningTitipan,
          saldoTitipanSisa: sisaTitipSetelahPotong,
          metodePembayaran: 'KOMPENSASI_BON',
          isKompensasiBon: true,
          keterangan:
            params.keterangan ||
            `Potong Saldo Titipan untuk Pelunasan Kasbon Mitra (${idReferensiKliring})`,
          createdAt: iso,
        });

        runningTitipan = sisaTitipSetelahPotong;
        runningKasbon = sisaBonSetelahPotong;
      }

      // 2. Proses Penyelesaian Sisa secara Fisik (Kas/Bank) bila dipilih
      let usedRekeningKode: string | undefined;
      const metodeFisik = params.metodeFisik || 'TUNAI';

      if (params.aksiSisa === 'CAIRKAN_SISA_TITIPAN' && nominalFisik > 0) {
        if (nominalFisik > runningTitipan) {
          throw new Error(
            `Nominal pencairan sisa (Rp ${nominalFisik.toLocaleString('id-ID')}) melebihi sisa titipan bersih (Rp ${runningTitipan.toLocaleString('id-ID')})`
          );
        }
        const rekKode = metodeFisik === 'TUNAI' ? 'KAS01' : params.rekeningFisik || '';
        if (!rekKode || rekKode === 'BON01' || rekKode === 'TIT01') {
          throw new Error('Pilih rekening Kas/Bank riil untuk pencairan sisa titipan');
        }
        const rekAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
        if (!rekAcc) throw new Error(`Rekening ${rekKode} tidak ditemukan atau tidak aktif`);
        if (rekAcc.saldoSaatIni < nominalFisik) {
          throw new Error(
            `Saldo ${rekAcc.nama} (Rp ${rekAcc.saldoSaatIni.toLocaleString('id-ID')}) tidak cukup untuk mencairkan sisa panen Rp ${nominalFisik.toLocaleString('id-ID')}`
          );
        }

        rekAcc.saldoSaatIni -= nominalFisik;
        usedRekeningKode = rekAcc.kode;

        const sisaAkhirTitip = runningTitipan - nominalFisik;
        db.pencairanTitipan.unshift({
          idPencairan: `${idReferensiKliring}-CAIR`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: nominalFisik,
          rekeningSumber: rekAcc.kode,
          saldoTitipanSebelum: runningTitipan,
          saldoTitipanSisa: sisaAkhirTitip,
          metodePembayaran: metodeFisik,
          isKompensasiBon: false,
          keterangan: `Pencairan Sisa Bersih Hasil Bumi setelah Potong Bon (${idReferensiKliring})`,
          createdAt: iso,
        });
        runningTitipan = sisaAkhirTitip;
      } else if (params.aksiSisa === 'TERIMA_PELUNASAN_SISA_BON' && nominalFisik > 0) {
        if (nominalFisik > runningKasbon) {
          throw new Error(
            `Nominal setoran pelunasan (Rp ${nominalFisik.toLocaleString('id-ID')}) melebihi sisa bon mitra (Rp ${runningKasbon.toLocaleString('id-ID')})`
          );
        }
        const rekKode = metodeFisik === 'TUNAI' ? 'KAS01' : params.rekeningFisik || '';
        if (!rekKode || rekKode === 'BON01' || rekKode === 'TIT01') {
          throw new Error('Pilih rekening Kas/Bank riil penerima pelunasan sisa bon');
        }
        const rekAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
        if (!rekAcc) throw new Error(`Rekening ${rekKode} tidak ditemukan atau tidak aktif`);

        rekAcc.saldoSaatIni += nominalFisik;
        usedRekeningKode = rekAcc.kode;

        const alokasiSisa = allocateBonPayment(nominalFisik);
        alokasiBonLunas.push(...alokasiSisa);

        const sisaAkhirBon = runningKasbon - nominalFisik;
        db.bayarBon.unshift({
          idTransaksi: `${idReferensiKliring}-LUNAS`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: runningKasbon,
          nominalBayar: nominalFisik,
          sisaBonSetelah: sisaAkhirBon,
          metode: metodeFisik,
          rekeningTujuan: rekAcc.kode,
          isKompensasiTitipan: false,
          alokasi: alokasiSisa,
          keterangan: `Setoran Pelunasan Sisa Bon setelah Potong Titipan (${idReferensiKliring})`,
          createdAt: iso,
        });
        runningKasbon = sisaAkhirBon;
      }

      dbManager.synchronizeVirtualAccounts();

      const ketAudit = `Kliring Silang Mitra ${mitra.nama} (${idReferensiKliring}): Potong Silang Non-Tunai Rp ${nominalPotong.toLocaleString('id-ID')}${
        nominalFisik > 0
          ? `, Penyelesaian Fisik (${params.aksiSisa}) Rp ${nominalFisik.toLocaleString('id-ID')} via ${usedRekeningKode}`
          : ''
      }. Sisa Titipan: Rp ${runningTitipan.toLocaleString('id-ID')}, Sisa Bon: Rp ${runningKasbon.toLocaleString('id-ID')}`;

      this.addAuditLog(
        db,
        'PAYMENT',
        idReferensiKliring,
        ketAudit,
        nominalPotong + nominalFisik,
        usedRekeningKode || 'BON01/TIT01'
      );

      return {
        idReferensiKliring,
        tanggal,
        jam,
        idMitra: mitra.id,
        kodeMitra: mitra.kode,
        namaMitra: mitra.nama,
        saldoTitipanAwal,
        totalKasbonAwal,
        nominalPotongSilang: nominalPotong,
        aksiSisa: params.aksiSisa,
        nominalPenyelesaianFisik: nominalFisik,
        metodeFisik: nominalFisik > 0 ? metodeFisik : undefined,
        rekeningFisik: usedRekeningKode,
        saldoTitipanAkhir: runningTitipan,
        sisaKasbonAkhir: runningKasbon,
        alokasiBonLunas,
        keterangan: params.keterangan || ketAudit,
      };
    });
  }

  /**
   * Batch Kliring Otomatis Non-Tunai untuk seluruh Mitra terpilih yang memiliki Saldo Ganda (Titipan & Bon)
   */
  public static async processBatchKliringOtomatis(mitraIds?: string[]): Promise<{
    processedCount: number;
    totalKompensasi: number;
    items: HasilKliringSilangResponse[];
  }> {
    const overview = this.getSmartControlOverview();
    const targets = overview.kandidatKliring.filter(
      (k) => k.potensiPotongSilang > 0 && (!mitraIds || mitraIds.length === 0 || mitraIds.includes(k.idMitra))
    );

    const items: HasilKliringSilangResponse[] = [];
    let totalKompensasi = 0;

    for (const t of targets) {
      const res = await this.processKliringSilangMitra({
        idMitra: t.idMitra,
        nominalPotongSilang: t.potensiPotongSilang,
        aksiSisa: 'HANYA_POTONG_SILANG',
        keterangan: 'Kliring Silang Massal Otomatis (Kompensasi Titipan Panen vs Kasbon)',
      });
      items.push(res);
      totalKompensasi += res.nominalPotongSilang;
    }

    return {
      processedCount: items.length,
      totalKompensasi,
      items,
    };
  }

  /**
   * Konsolidasi / Gabungkan Dua Akun Mitra Kembar secara Atomik di Seluruh Tabel Transaksi
   */
  public static async mergeDuplicateMitra(params: {
    primaryMitraId: string;
    duplicateMitraId: string;
    alasan?: string;
  }): Promise<{
    success: boolean;
    message: string;
    migratedCounts: Record<string, number>;
    primaryMitraNama: string;
    mergedDuplicateNama: string;
  }> {
    return await dbManager.executeTransaction((db) => {
      if (!params.primaryMitraId || !params.duplicateMitraId) {
        throw new Error('Pilih akun mitra utama dan akun mitra duplikat yang akan digabungkan');
      }
      if (params.primaryMitraId === params.duplicateMitraId) {
        throw new Error('Akun mitra utama dan akun duplikat tidak boleh sama');
      }

      const primary = db.mitra.find((m) => m.id === params.primaryMitraId);
      const duplicateIdx = db.mitra.findIndex((m) => m.id === params.duplicateMitraId);
      if (!primary) throw new Error('Akun mitra utama tidak ditemukan');
      if (duplicateIdx === -1) throw new Error('Akun mitra duplikat tidak ditemukan');

      const duplicate = db.mitra[duplicateIdx];

      const counts: Record<string, number> = {
        penjualan: 0,
        penjualanHasilBumi: 0,
        pembelianHasilBumi: 0,
        pembelianBarang: 0,
        kasbonUang: 0,
        bayarBon: 0,
        pencairanTitipan: 0,
        karyawanLink: 0,
      };

      for (const p of db.penjualan || []) {
        if (p.idMitra === duplicate.id) {
          p.idMitra = primary.id;
          p.namaMitra = primary.nama;
          counts.penjualan++;
        }
      }

      for (const jhb of db.penjualanHasilBumi || []) {
        if (jhb.idMitra === duplicate.id) {
          jhb.idMitra = primary.id;
          jhb.namaMitra = primary.nama;
          counts.penjualanHasilBumi++;
        }
      }

      for (const pb of db.pembelianHasilBumi || []) {
        if (pb.idMitra === duplicate.id) {
          pb.idMitra = primary.id;
          pb.namaMitra = primary.nama;
          counts.pembelianHasilBumi++;
        }
      }

      for (const pbb of db.pembelianBarang || []) {
        if (pbb.idMitra === duplicate.id) {
          pbb.idMitra = primary.id;
          pbb.namaMitra = primary.nama;
          counts.pembelianBarang++;
        }
      }

      for (const k of db.kasbonUang || []) {
        if (k.idMitra === duplicate.id) {
          k.idMitra = primary.id;
          k.namaMitra = primary.nama;
          counts.kasbonUang++;
        }
      }

      for (const b of db.bayarBon || []) {
        if (b.idMitra === duplicate.id) {
          b.idMitra = primary.id;
          b.namaMitra = primary.nama;
          counts.bayarBon++;
        }
      }

      for (const pt of db.pencairanTitipan || []) {
        if (pt.idMitra === duplicate.id) {
          pt.idMitra = primary.id;
          pt.namaMitra = primary.nama;
          counts.pencairanTitipan++;
        }
      }

      for (const kry of db.karyawan || []) {
        if (kry.idMitraTerkait === duplicate.id) {
          kry.idMitraTerkait = primary.id;
          counts.karyawanLink++;
        }
      }

      // Lengkapi nomor telepon atau alamat bila akun utama masih kosong/'-'
      if ((!primary.telepon || primary.telepon === '-') && duplicate.telepon && duplicate.telepon !== '-') {
        primary.telepon = duplicate.telepon;
      }
      if ((!primary.alamat || primary.alamat === '-') && duplicate.alamat && duplicate.alamat !== '-') {
        primary.alamat = duplicate.alamat;
      }
      primary.catatan = [
        primary.catatan,
        `Digabung dari akun duplikat "${duplicate.nama}" (${duplicate.kode})`,
      ]
        .filter(Boolean)
        .join(' | ');

      // Hapus entitas duplikat dari daftar master mitra
      db.mitra.splice(duplicateIdx, 1);

      dbManager.synchronizeVirtualAccounts();

      const totalMigrated = Object.values(counts).reduce((a, b) => a + b, 0);
      this.addAuditLog(
        db,
        'UPDATE',
        `MERGE-${primary.kode}`,
        `Penggabungan Akun Mitra Kembar: "${duplicate.nama}" (${duplicate.kode}) digabung ke "${primary.nama}" (${primary.kode}). Total ${totalMigrated} riwayat transaksi disatukan.${
          params.alasan ? ` Catatan: ${params.alasan}` : ''
        }`,
        0,
        'BON01/TIT01'
      );

      return {
        success: true,
        message: `Akun "${duplicate.nama}" berhasil digabungkan ke "${primary.nama}" (${totalMigrated} transaksi dipindahkan).`,
        migratedCounts: counts,
        primaryMitraNama: primary.nama,
        mergedDuplicateNama: duplicate.nama,
      };
    });
  }

  /**
   * Simpan Berita Acara Cash Opname Fisik Laci Kasir (KAS01)
   */
  public static async recordCashOpname(params: {
    petugasKasir: string;
    rincianPecahan: Record<string, number>;
    sesuaikanSaldoSistem: boolean;
    catatan?: string;
  }): Promise<CatatanCashOpname> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kas01 = db.rekening.find((r) => r.kode === 'KAS01');
      if (!kas01) throw new Error('Rekening Kas Utama KAS01 tidak ditemukan');

      let totalFisikLaci = 0;
      const cleanPecahan: Record<string, number> = {};
      for (const [denomStr, lembar] of Object.entries(params.rincianPecahan || {})) {
        const denom = Number(denomStr);
        const qty = Math.max(0, Math.floor(Number(lembar) || 0));
        if (!isNaN(denom) && denom > 0) {
          cleanPecahan[denomStr] = qty;
          totalFisikLaci += denom * qty;
        }
      }

      const saldoSistemSebelum = kas01.saldoSaatIni;
      const selisih = totalFisikLaci - saldoSistemSebelum;
      const statusRekonsiliasi: 'COCOK' | 'SELISIH_LEBIH' | 'SELISIH_KURANG' =
        selisih === 0 ? 'COCOK' : selisih > 0 ? 'SELISIH_LEBIH' : 'SELISIH_KURANG';

      const id = generateId('OPN');
      const record: CatatanCashOpname = {
        id,
        tanggal,
        jam,
        petugasKasir: (params.petugasKasir || 'Staf Kasir Utama').trim(),
        saldoSistemSebelum,
        totalFisikLaci,
        selisih,
        statusRekonsiliasi,
        rincianPecahan: cleanPecahan,
        sesuaikanSaldoSistem: Boolean(params.sesuaikanSaldoSistem && selisih !== 0),
        catatan: (params.catatan || '').trim(),
        createdAt: iso,
      };

      if (!db.cashOpnameLogs) db.cashOpnameLogs = [];
      db.cashOpnameLogs.unshift(record);

      if (params.sesuaikanSaldoSistem && selisih !== 0) {
        kas01.saldoSaatIni = totalFisikLaci;
      }

      this.addAuditLog(
        db,
        'UPDATE',
        id,
        `Berita Acara Cash Opname Laci KAS01 oleh ${record.petugasKasir}: Saldo Sistem Rp ${saldoSistemSebelum.toLocaleString('id-ID')}, Fisik Laci Rp ${totalFisikLaci.toLocaleString('id-ID')}, Selisih Rp ${selisih.toLocaleString('id-ID')} (${statusRekonsiliasi})${
          record.sesuaikanSaldoSistem ? ' [Saldo KAS01 Disesuaikan]' : ''
        }`,
        Math.abs(selisih),
        'KAS01',
        record.petugasKasir
      );

      return record;
    });
  }

  // ==========================================
  // 12. UNIVERSAL DETAIL LOOKUP & ATOMIC TRANSACTION EDITOR
  // Memungkinkan koreksi/edit detail setiap transaksi (Nominal, Tonase, Rafaksi, Qty, Harga, Rekening, Tanggal, Keterangan)
  // dengan sinkronisasi otomatis ke Stok Gudang, HPP Modal Riil, Saldo Kas/Bank, Piutang/Titipan, & Audit Log
  // ==========================================
  public static getTransactionDetail(
    idTransaksi: string,
    jenisHint?: string
  ): {
    jenis:
      | 'PENJUALAN'
      | 'PEMBELIAN_BARANG'
      | 'PEMBELIAN_HASIL_BUMI'
      | 'PENJUALAN_HASIL_BUMI'
      | 'KASBON_UANG'
      | 'BAYAR_BON'
      | 'PENCAIRAN_TITIPAN'
      | 'PENGELUARAN_DIVISI'
      | 'TRANSFER_REKENING'
      | 'UPAH_HARIAN'
      | 'PENGGAJIAN';
    id: string;
    record: any;
    masters: {
      rekeningList: Rekening[];
      produkList: Produk[];
      stokBarangList: StokBarang[];
      stokHasilBumiList: StokHasilBumi[];
      mitraList: Mitra[];
      divisiList: Array<{ id: string; nama: string; kodeRekening: string }>;
    };
  } {
    const db = dbManager.get();
    const cleanId = String(idTransaksi || '').trim();
    if (!cleanId) {
      throw new Error('ID transaksi wajib diisi');
    }

    const masters = {
      rekeningList: db.rekening || [],
      produkList: db.produk || [],
      stokBarangList: db.stokBarang || [],
      stokHasilBumiList: db.stokHasilBumi || [],
      mitraList: db.mitra || [],
      divisiList: dbManager.getDivisiList(),
    };

    const candidates: Array<{
      jenis:
        | 'PENJUALAN'
        | 'PEMBELIAN_BARANG'
        | 'PEMBELIAN_HASIL_BUMI'
        | 'PENJUALAN_HASIL_BUMI'
        | 'KASBON_UANG'
        | 'BAYAR_BON'
        | 'PENCAIRAN_TITIPAN'
        | 'PENGELUARAN_DIVISI'
        | 'TRANSFER_REKENING'
        | 'UPAH_HARIAN'
        | 'PENGGAJIAN';
      finder: () => any;
    }> = [
      { jenis: 'PEMBELIAN_HASIL_BUMI', finder: () => (db.pembelianHasilBumi || []).find((x) => x.noPembelian === cleanId) },
      { jenis: 'PENJUALAN_HASIL_BUMI', finder: () => (db.penjualanHasilBumi || []).find((x) => x.noPenjualan === cleanId) },
      { jenis: 'PEMBELIAN_BARANG', finder: () => (db.pembelianBarang || []).find((x) => x.noPembelian === cleanId) },
      { jenis: 'PENJUALAN', finder: () => (db.penjualan || []).find((x) => x.noPenjualan === cleanId) },
      { jenis: 'KASBON_UANG', finder: () => (db.kasbonUang || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: 'BAYAR_BON', finder: () => (db.bayarBon || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: 'PENCAIRAN_TITIPAN', finder: () => (db.pencairanTitipan || []).find((x) => x.idPencairan === cleanId) },
      { jenis: 'PENGELUARAN_DIVISI', finder: () => (db.pengeluaran || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: 'TRANSFER_REKENING', finder: () => (db.transferRekening || []).find((x) => x.noTransfer === cleanId) },
      { jenis: 'UPAH_HARIAN', finder: () => (db.upahHarian || []).find((x) => x.id === cleanId) },
      { jenis: 'PENGGAJIAN', finder: () => (db.penggajian || []).find((x) => x.id === cleanId) },
    ];

    if (jenisHint) {
      const exact = candidates.find((c) => c.jenis === jenisHint);
      if (exact) {
        const found = exact.finder();
        if (found) {
          return { jenis: exact.jenis, id: cleanId, record: found, masters };
        }
      }
    }

    for (const c of candidates) {
      const found = c.finder();
      if (found) {
        return { jenis: c.jenis, id: cleanId, record: found, masters };
      }
    }

    throw new Error(`Transaksi dengan ID ${cleanId} tidak ditemukan di database`);
  }

  public static async editTransactionDetail(params: {
    idTransaksi: string;
    jenis?: string;
    // Umum
    tanggal?: string;
    keterangan?: string;
    idMitra?: string;
    namaMitraManual?: string;
    nominal?: number;
    metode?: string;
    rekeningSumber?: string;
    rekeningTujuan?: string;
    // Hasil Bumi (Pembelian & Penjualan)
    komoditasKode?: string;
    beratKotor?: number;
    potonganRafaksi?: number;
    beratBersihManual?: number;
    hargaPerKg?: number;
    hargaJualPerKg?: number;
    isBelumPutusHarga?: boolean;
    noSuratJalan?: string;
    noNotaLalu?: string;
    // Multi-item (Penjualan Toko & Pembelian Barang)
    noFakturSupplier?: string;
    items?: Array<{
      kodeProduk: string;
      namaProduk?: string;
      satuan?: string;
      qty: number;
      harga?: number;
      hargaBeliSatuan?: number;
    }>;
    // Kasbon / Pengeluaran / Payroll / Upah Harian
    rincianBarangNotaLalu?: string;
    divisi?: string;
    kategori?: string;
    penerima?: string;
    itemKerja?: string;
    kuantiti?: number;
    hargaSatuanUpah?: number;
    uangMakanLembur?: number;
    catatanKerja?: string;
    gajiPokok?: number;
    tunjangan?: number;
    bonus?: number;
    potonganKasbon?: number;
    periodeBulan?: string;
  }): Promise<{
    success: boolean;
    jenis: string;
    idTransaksi: string;
    message: string;
    updatedRecord: any;
  }> {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      const lookup = this.getTransactionDetail(params.idTransaksi, params.jenis);
      const { jenis, id: cleanId } = lookup;

      const resolveMitraOrManual = (
        currentId: string,
        currentNama: string,
        defaultFallback: string
      ): { id: string; nama: string } => {
        if (params.idMitra !== undefined) {
          if (params.idMitra === 'UMUM' || params.idMitra === 'MANUAL' || params.idMitra === '') {
            return {
              id: params.idMitra === 'MANUAL' ? 'MANUAL-DIST' : 'UMUM',
              nama: params.namaMitraManual?.trim() || currentNama || defaultFallback,
            };
          }
          const m = db.mitra.find((mt) => mt.id === params.idMitra);
          if (!m) throw new Error('Mitra terdaftar yang dipilih tidak ditemukan');
          return { id: m.id, nama: m.nama };
        }
        if (params.namaMitraManual !== undefined && params.namaMitraManual.trim()) {
          return { id: currentId, nama: params.namaMitraManual.trim() };
        }
        return { id: currentId, nama: currentNama || defaultFallback };
      };

      const recalculateProductHppFromRealPurchases = (kodeProduk: string) => {
        const cleanKode = String(kodeProduk || '').trim().toUpperCase();
        if (!cleanKode || cleanKode === 'REKAP-NOTA') return;
        const prod = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
        const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
        if (!prod) return;

        let sumQty = 0;
        let sumModal = 0;
        for (const pb of db.pembelianBarang || []) {
          for (const it of pb.items || []) {
            if (String(it.kodeProduk || '').trim().toUpperCase() === cleanKode) {
              const q = Math.max(0, Number(it.qty) || 0);
              const h = Math.max(0, Number(it.hargaBeliSatuan) || 0);
              sumQty += q;
              sumModal += q * h;
            }
          }
        }
        if (sumQty > 0) {
          prod.hargaBeli = Math.round(sumModal / sumQty);
          if (!prod.hargaJual || prod.hargaJual <= 0) {
            prod.hargaJual = prod.hargaBeli;
          }
          if (!prod.hargaKhususRekanan || prod.hargaKhususRekanan <= 0) {
            prod.hargaKhususRekanan = prod.hargaJual || prod.hargaBeli;
          }
        } else if ((stokItem?.stok || 0) === 0) {
          prod.hargaBeli = 0;
        }
      };

      const computeKomoditasModalPerKg = (komoditas: StokHasilBumi): number => {
        const stokAwalKg = Number(komoditas.stokAwal) || 0;
        const modalAwalUang =
          Number(komoditas.modalAwalTotal) || stokAwalKg * (Number(komoditas.rataRataModalAwal) || 0);
        const physicalPurchases = (db.pembelianHasilBumi || []).filter(
          (p) =>
            this.isPhysicalPembelianHasilBumi(p) &&
            (p.komoditasKode === komoditas.kode ||
              p.komoditasNama.toUpperCase().trim() === komoditas.nama.toUpperCase().trim())
        );
        const totalUangBeli =
          modalAwalUang + physicalPurchases.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0);
        const totalKgBeli =
          stokAwalKg + physicalPurchases.reduce((sum, p) => sum + (Number(p.beratBersih) || 0), 0);
        return totalKgBeli > 0 && totalUangBeli > 0
          ? Math.round(totalUangBeli / totalKgBeli)
          : Math.max(0, Number(komoditas.rataRataModalAwal) || 0);
      };

      let auditSummary = '';
      let auditNominal = 0;
      let auditRekening = '';
      let updatedRecord: any = null;

      // =====================================================
      // 1. PEMBELIAN HASIL BUMI (TERMASUK PINJAMAN DANA / TITIP NOTA LALU)
      // =====================================================
      if (jenis === 'PEMBELIAN_HASIL_BUMI') {
        const record = db.pembelianHasilBumi.find((p) => p.noPembelian === cleanId)!;
        const isNonPhysical =
          record.komoditasKode === 'PINJAMAN_DANA' ||
          record.komoditasKode === 'TITIP_DANA' ||
          Boolean(record.komoditasNama?.toLowerCase().includes('pinjaman uang')) ||
          (record.beratBersih === 0 && record.beratKotor === 0 && params.beratKotor === undefined);

        if (isNonPhysical) {
          const oldNominal = record.totalNominal;
          const isPinjamanDana =
            record.komoditasKode === 'PINJAMAN_DANA' ||
            Boolean(record.komoditasNama?.toLowerCase().includes('pinjaman uang'));

          // Reverse old cash inflow if Pinjaman Dana entered real account
          if (isPinjamanDana && record.rekeningSumber && record.rekeningSumber !== 'TIT01' && record.rekeningSumber !== 'BON01') {
            const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
            if (oldRek) oldRek.saldoSaatIni -= oldNominal;
          }

          const newNominal = Math.round(Number(params.nominal ?? record.totalNominal));
          if (isNaN(newNominal) || newNominal <= 0) {
            throw new Error('Nominal transaksi harus lebih dari Rp 0');
          }

          const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Mitra');
          record.idMitra = party.id;
          record.namaMitra = party.nama;
          record.totalNominal = newNominal;
          if (params.tanggal) {
            record.tanggal = params.tanggal.trim();
            if (record.isNotaLalu) record.tanggalNotaLalu = params.tanggal.trim();
          }
          if (params.noNotaLalu !== undefined) record.noNotaLalu = params.noNotaLalu.trim();
          if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

          if (isPinjamanDana) {
            const targetRekKode = params.rekeningSumber || record.rekeningSumber || 'KAS01';
            if (targetRekKode !== 'TIT01' && targetRekKode !== 'BON01') {
              const newRek = db.rekening.find((r) => r.kode === targetRekKode);
              if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan`);
              if (newRek.saldoSaatIni + newNominal < 0 && !this.isAnakPerusahaanRekening(newRek)) {
                throw new Error(`Saldo rekening ${newRek.nama} menjadi negatif akibat koreksi nominal ini`);
              }
              newRek.saldoSaatIni += newNominal;
              record.rekeningSumber = newRek.kode;
            }
          }

          auditSummary = `Edit Detail ${record.komoditasNama} (${cleanId} - ${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')}`;
          auditNominal = newNominal;
          auditRekening = record.rekeningSumber;
          updatedRecord = record;
        } else {
          // Physical Pembelian Hasil Bumi (Timbangan Komoditas)
          const oldKg = Number(record.beratBersih) || 0;
          const oldNominal = Number(record.totalNominal) || 0;
          const oldKomoditas = db.stokHasilBumi.find(
            (k) =>
              k.kode === record.komoditasKode ||
              k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
          );

          // 1. Reverse old physical stock & old cash outflow
          if (oldKomoditas) {
            oldKomoditas.stok = Math.round((oldKomoditas.stok - oldKg) * 100) / 100;
          }
          if (
            !record.isBelumPutusHarga &&
            (record.metodePembayaran === 'TUNAI' || record.metodePembayaran === 'TRANSFER') &&
            record.rekeningSumber &&
            record.rekeningSumber !== 'TIT01' &&
            record.rekeningSumber !== 'BON01'
          ) {
            const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
            if (oldRek) oldRek.saldoSaatIni += oldNominal;
          }

          // 2. Compute & validate new values
          const targetKomKode = params.komoditasKode || record.komoditasKode;
          const newKomoditas = db.stokHasilBumi.find((k) => k.kode === targetKomKode);
          if (!newKomoditas) {
            throw new Error(`Komoditas dengan kode ${targetKomKode} tidak ditemukan`);
          }

          const beratKotor = Number(params.beratKotor ?? record.beratKotor);
          const potonganRafaksi = Number(params.potonganRafaksi ?? record.potonganRafaksi ?? 0);
          if (isNaN(beratKotor) || beratKotor <= 0) {
            throw new Error('Berat kotor timbangan harus lebih dari 0 Kg');
          }
          if (isNaN(potonganRafaksi) || potonganRafaksi < 0 || potonganRafaksi >= 100) {
            throw new Error('Potongan rafaksi harus antara 0% dan 99.9%');
          }

          const beratBersih =
            params.beratBersihManual !== undefined && Number(params.beratBersihManual) > 0
              ? Math.round(Number(params.beratBersihManual) * 100) / 100
              : Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;

          if (beratBersih <= 0) {
            throw new Error('Berat bersih hasil timbangan harus lebih dari 0 Kg');
          }

          const isBelumPutus =
            params.isBelumPutusHarga !== undefined
              ? Boolean(params.isBelumPutusHarga)
              : Boolean(record.isBelumPutusHarga);

          let hargaPerKg = Math.max(0, Number(params.hargaPerKg ?? record.hargaPerKg ?? 0));
          let totalNominal = Math.round(beratBersih * hargaPerKg);

          // Jika user mengisi override total nominal secara eksplisit tanpa mengubah hargaPerKg
          if (
            params.nominal !== undefined &&
            params.hargaPerKg === undefined &&
            Number(params.nominal) >= 0
          ) {
            totalNominal = Math.round(Number(params.nominal));
            hargaPerKg = beratBersih > 0 ? Math.round(totalNominal / beratBersih) : 0;
          }

          if (!isBelumPutus && hargaPerKg <= 0) {
            throw new Error('Harga beli per Kg harus lebih dari Rp 0 (atau centang Belum Putus Harga)');
          }

          // Apply new stock & validate warehouse stock never becomes negative
          newKomoditas.stok = Math.round((newKomoditas.stok + beratBersih) * 100) / 100;
          newKomoditas.updateTerakhir = iso;

          if (oldKomoditas && oldKomoditas.stok < 0) {
            throw new Error(
              `Tidak dapat mengurangi tonase pembelian menjadi ${beratBersih} Kg karena stok "${oldKomoditas.nama}" di gudang menjadi minus (${oldKomoditas.stok} Kg — sebagian barang sudah terjual keluar gudang).`
            );
          }
          if (newKomoditas.stok < 0) {
            throw new Error(`Stok komoditas "${newKomoditas.nama}" tidak boleh negatif`);
          }

          // Apply new payment method & account
          const rawMetode = (
            isBelumPutus ? 'TITIP' : params.metode || record.metodePembayaran || 'TUNAI'
          ) as 'TUNAI' | 'TRANSFER' | 'TITIP';

          let finalRekSumber = 'TIT01';
          let finalStatus: 'LUNAS' | 'BELUM_DIAMBIL' | 'TITIP' | 'BELUM_PUTUS_HARGA' = 'LUNAS';

          if (isBelumPutus) {
            finalRekSumber = 'TIT01';
            finalStatus = 'BELUM_PUTUS_HARGA';
          } else if (rawMetode === 'TUNAI') {
            finalRekSumber = 'KAS01';
            const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
            if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
            if (kasAcc.saldoSaatIni < totalNominal) {
              throw new Error(
                `Saldo KAS01 tidak mencukupi (Tersedia: Rp ${kasAcc.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${totalNominal.toLocaleString('id-ID')})`
              );
            }
            kasAcc.saldoSaatIni -= totalNominal;
            finalStatus = 'LUNAS';
          } else if (rawMetode === 'TRANSFER') {
            const rekKode = params.rekeningSumber || record.rekeningSumber;
            if (!rekKode || rekKode === 'KAS01' || rekKode === 'TIT01' || rekKode === 'BON01') {
              throw new Error('Pilih rekening Bank sumber transfer yang valid');
            }
            const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
            if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
            if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
              throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
            }
            if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominal) {
              throw new Error(
                `Saldo ${bankAcc.nama} tidak mencukupi (Tersedia: Rp ${bankAcc.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${totalNominal.toLocaleString('id-ID')})`
              );
            }
            bankAcc.saldoSaatIni -= totalNominal;
            finalRekSumber = bankAcc.kode;
            finalStatus = 'LUNAS';
          } else {
            finalRekSumber = 'TIT01';
            finalStatus = 'TITIP';
          }

          const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Petani Umum');
          record.idMitra = party.id;
          record.namaMitra = party.nama;
          record.komoditasKode = newKomoditas.kode;
          record.komoditasNama = newKomoditas.nama;
          record.beratKotor = beratKotor;
          record.potonganRafaksi = potonganRafaksi;
          record.beratBersih = beratBersih;
          record.hargaPerKg = isBelumPutus && hargaPerKg === 0 ? 0 : hargaPerKg;
          record.totalNominal = isBelumPutus && hargaPerKg === 0 ? 0 : totalNominal;
          record.metodePembayaran = rawMetode;
          record.rekeningSumber = finalRekSumber;
          record.status = finalStatus;
          record.isBelumPutusHarga = isBelumPutus;
          record.statusHarga = isBelumPutus ? 'BELUM_PUTUS_HARGA' : 'HARGA_PUTUS';
          if (params.divisi !== undefined) record.divisi = params.divisi.trim();
          if (params.tanggal) record.tanggal = params.tanggal.trim();
          if (params.noNotaLalu !== undefined) record.noNotaLalu = params.noNotaLalu.trim();
          if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

          auditSummary = `Edit Pembelian Hasil Bumi ${cleanId} (${record.namaMitra} - ${record.komoditasNama}): Tonase ${oldKg} Kg -> ${beratBersih} Kg, Total Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${record.totalNominal.toLocaleString('id-ID')} [${rawMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ''}]`;
          auditNominal = record.totalNominal;
          auditRekening = finalRekSumber;
          updatedRecord = record;
        }
      }

      // =====================================================
      // 2. PENJUALAN HASIL BUMI KELUAR GUDANG
      // =====================================================
      else if (jenis === 'PENJUALAN_HASIL_BUMI') {
        const record = (db.penjualanHasilBumi || []).find((j) => j.noPenjualan === cleanId)!;
        const oldKg = Number(record.beratBersih) || 0;
        const oldNominal = Number(record.totalNominal) || 0;
        const alreadyPaidPiutang =
          record.metodePembayaran === 'PIUTANG'
            ? Math.max(0, oldNominal - (Number(record.sisaPiutang) || 0))
            : 0;

        const oldKomoditas = db.stokHasilBumi.find(
          (k) =>
            k.kode === record.komoditasKode ||
            k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
        );

        // 1. Reverse old warehouse deduction & old cash inflow
        if (oldKomoditas) {
          oldKomoditas.stok = Math.round((oldKomoditas.stok + oldKg) * 100) / 100;
        }
        if (
          (record.metodePembayaran === 'TUNAI' || record.metodePembayaran === 'TRANSFER') &&
          record.rekeningTujuan &&
          record.rekeningTujuan !== 'BON01' &&
          record.rekeningTujuan !== 'TIT01'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) {
            if (!this.isAnakPerusahaanRekening(oldRek) && oldRek.saldoSaatIni - oldNominal < 0 && params.metode !== record.metodePembayaran) {
              // Checked again after new inflow if same account
            }
            oldRek.saldoSaatIni -= oldNominal;
          }
        }

        // 2. Validate & apply new values
        const targetKomKode = params.komoditasKode || record.komoditasKode;
        const newKomoditas = db.stokHasilBumi.find((k) => k.kode === targetKomKode);
        if (!newKomoditas) {
          throw new Error(`Komoditas dengan kode ${targetKomKode} tidak ditemukan`);
        }

        const beratKotor = Number(params.beratKotor ?? record.beratKotor);
        const potonganRafaksi = Number(params.potonganRafaksi ?? record.potonganRafaksi ?? 0);
        if (isNaN(beratKotor) || beratKotor <= 0) {
          throw new Error('Berat kotor timbangan jual harus lebih dari 0 Kg');
        }
        if (isNaN(potonganRafaksi) || potonganRafaksi < 0 || potonganRafaksi >= 100) {
          throw new Error('Potongan rafaksi harus antara 0% dan 99.9%');
        }

        const beratBersih =
          params.beratBersihManual !== undefined && Number(params.beratBersihManual) > 0
            ? Math.round(Number(params.beratBersihManual) * 100) / 100
            : Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;

        if (beratBersih <= 0) {
          throw new Error('Berat bersih penjualan harus lebih dari 0 Kg');
        }

        if (newKomoditas.stok < beratBersih) {
          throw new Error(
            `Stok Ready Gudang "${newKomoditas.nama}" tidak mencukupi untuk koreksi tonase jual ini. Tersedia: ${newKomoditas.stok.toLocaleString('id-ID')} Kg, dibutuhkan: ${beratBersih.toLocaleString('id-ID')} Kg.`
          );
        }

        let hargaJualPerKg = Math.max(
          0,
          Number(params.hargaJualPerKg ?? params.hargaPerKg ?? record.hargaJualPerKg)
        );
        let totalNominal = Math.round(beratBersih * hargaJualPerKg);
        if (params.nominal !== undefined && params.hargaJualPerKg === undefined && params.hargaPerKg === undefined) {
          totalNominal = Math.round(Number(params.nominal));
          hargaJualPerKg = beratBersih > 0 ? Math.round(totalNominal / beratBersih) : 0;
        }
        if (hargaJualPerKg <= 0 || totalNominal <= 0) {
          throw new Error('Harga jual per Kg harus lebih dari Rp 0');
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Pembeli / Pabrik Umum');
        const newMetode = (params.metode || record.metodePembayaran) as 'TUNAI' | 'TRANSFER' | 'PIUTANG';

        if (newMetode === 'PIUTANG' && party.id === 'UMUM') {
          throw new Error('Metode PIUTANG wajib memilih Mitra / Pabrik terdaftar');
        }

        let finalRekTujuan = 'KAS01';
        let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' = 'LUNAS';
        let sisaPiutang = 0;

        if (newMetode === 'TUNAI') {
          finalRekTujuan = 'KAS01';
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
          kasAcc.saldoSaatIni += totalNominal;
        } else if (newMetode === 'TRANSFER') {
          const rekKode = params.rekeningTujuan || record.rekeningTujuan;
          if (!rekKode || rekKode === 'KAS01' || rekKode === 'BON01' || rekKode === 'TIT01') {
            throw new Error('Pilih rekening Bank tujuan transfer yang valid');
          }
          const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
          if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
          if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
            throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
          }
          bankAcc.saldoSaatIni += totalNominal;
          finalRekTujuan = bankAcc.kode;
        } else {
          finalRekTujuan = 'BON01';
          sisaPiutang = Math.max(0, totalNominal - alreadyPaidPiutang);
          statusPembayaran = sisaPiutang === 0 ? 'LUNAS' : 'BELUM_BAYAR';
        }

        const stokSebelum = newKomoditas.stok;
        newKomoditas.stok = Math.max(0, Math.round((newKomoditas.stok - beratBersih) * 100) / 100);
        newKomoditas.updateTerakhir = iso;

        const modalRataRataPerKg = computeKomoditasModalPerKg(newKomoditas);
        const totalModalHpp = Math.round(beratBersih * modalRataRataPerKg);
        const labaKotor = totalNominal - totalModalHpp;

        record.idMitra = party.id;
        record.namaMitra = party.nama;
        record.komoditasKode = newKomoditas.kode;
        record.komoditasNama = newKomoditas.nama;
        record.beratKotor = beratKotor;
        record.potonganRafaksi = potonganRafaksi;
        record.beratBersih = beratBersih;
        record.hargaJualPerKg = hargaJualPerKg;
        record.modalRataRataPerKg = modalRataRataPerKg;
        record.totalModalHpp = totalModalHpp;
        record.totalNominal = totalNominal;
        record.labaKotor = labaKotor;
        record.metodePembayaran = newMetode;
        record.rekeningTujuan = finalRekTujuan;
        record.statusPembayaran = statusPembayaran;
        record.sisaPiutang = sisaPiutang;
        record.stokGudangSebelum = stokSebelum;
        record.stokGudangSetelah = newKomoditas.stok;
        if (params.divisi !== undefined) record.divisi = params.divisi.trim();
        if (params.noSuratJalan !== undefined) record.noSuratJalan = params.noSuratJalan.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Penjualan Hasil Bumi ${cleanId} (${record.namaMitra} - ${record.komoditasNama}): Tonase ${oldKg} Kg -> ${beratBersih} Kg, Omzet Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${totalNominal.toLocaleString('id-ID')} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ''}]`;
        auditNominal = totalNominal;
        auditRekening = finalRekTujuan;
        updatedRecord = record;
      }

      // =====================================================
      // 3. PEMBELIAN BARANG DAGANG / KULAKAN SUPPLIER
      // =====================================================
      else if (jenis === 'PEMBELIAN_BARANG') {
        const record = (db.pembelianBarang || []).find((p) => p.noPembelian === cleanId)!;
        const oldNominal = Number(record.totalNominal) || 0;
        const isRekapNota =
          record.items.length === 1 && record.items[0].kodeProduk === 'REKAP-NOTA' && !params.items?.some((i) => i.kodeProduk !== 'REKAP-NOTA');

        const affectedProductCodes = new Set<string>();

        // 1. Reverse old stock additions & old cash outflow
        for (const oldIt of record.items || []) {
          const cleanKode = String(oldIt.kodeProduk || '').trim().toUpperCase();
          if (cleanKode && cleanKode !== 'REKAP-NOTA') {
            affectedProductCodes.add(cleanKode);
            const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
            if (stokItem) {
              stokItem.stok = (Number(stokItem.stok) || 0) - (Number(oldIt.qty) || 0);
            }
          }
        }

        if (record.metodePembayaran === 'TUNAI') {
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (kasAcc) kasAcc.saldoSaatIni += oldNominal;
        } else if (
          record.metodePembayaran === 'TRANSFER' &&
          record.rekeningSumber &&
          record.rekeningSumber !== 'TIT01' &&
          record.rekeningSumber !== 'BON01'
        ) {
          const bankAcc = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (bankAcc) bankAcc.saldoSaatIni += oldNominal;
        }

        // 2. Build new items & total
        let newTotalNominal = 0;
        const newProcessedItems = [];

        if (isRekapNota) {
          const nomRekap = Math.round(
            Number(
              params.nominal ??
                params.items?.[0]?.hargaBeliSatuan ??
                record.totalNominal
            )
          );
          if (isNaN(nomRekap) || nomRekap <= 0) {
            throw new Error('Total nominal rekapan pembelian harus lebih dari Rp 0');
          }
          newTotalNominal = nomRekap;
          newProcessedItems.push({
            kodeProduk: 'REKAP-NOTA',
            namaProduk: params.items?.[0]?.namaProduk || record.items[0]?.namaProduk || 'Rekapan Nota Pembelian',
            satuan: 'Nota',
            qty: 1,
            hargaBeliSatuan: nomRekap,
            subtotal: nomRekap,
            stokSebelum: 0,
            stokSetelah: 0,
          });
        } else {
          const rawItems = params.items && params.items.length > 0 ? params.items : record.items;
          if (!rawItems || rawItems.length === 0) {
            throw new Error('Minimal harus ada 1 item produk pada transaksi pembelian barang');
          }

          for (const it of rawItems) {
            const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
            const qty = Number(it.qty);
            const hargaBeliSatuan = Math.round(Number(it.hargaBeliSatuan ?? (it as any).harga ?? 0));
            if (!cleanKode) throw new Error('Kode produk wajib dipilih');
            if (isNaN(qty) || qty <= 0) throw new Error(`Qty produk ${cleanKode} harus lebih dari 0`);
            if (isNaN(hargaBeliSatuan) || hargaBeliSatuan <= 0) {
              throw new Error(`Harga modal beli satuan ${cleanKode} harus lebih dari Rp 0`);
            }

            affectedProductCodes.add(cleanKode);
            const prod = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
            if (!prod) throw new Error(`Produk ${cleanKode} tidak ditemukan di Master Produk`);

            let stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
            if (!stokItem) {
              stokItem = {
                kode: prod.kode,
                namaProduk: prod.nama,
                satuan: prod.satuan,
                stok: 0,
                minimum: 10,
                updateTerakhir: iso,
              };
              db.stokBarang.push(stokItem);
            }

            const stokSebelum = stokItem.stok;
            stokItem.stok = stokSebelum + qty;
            stokItem.updateTerakhir = iso;

            const subtotal = Math.round(qty * hargaBeliSatuan);
            newTotalNominal += subtotal;

            newProcessedItems.push({
              kodeProduk: prod.kode,
              namaProduk: prod.nama,
              satuan: prod.satuan,
              qty,
              hargaBeliSatuan,
              subtotal,
              stokSebelum: Math.max(0, stokSebelum),
              stokSetelah: stokItem.stok,
            });
          }
        }

        // Validate no affected product ended up with negative stock
        for (const kode of affectedProductCodes) {
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === kode);
          if (stokItem && stokItem.stok < 0) {
            throw new Error(
              `Tidak dapat mengurangi qty kulakan "${stokItem.namaProduk}" karena stok gudang akan menjadi minus (${stokItem.stok} ${stokItem.satuan} — sebagian barang sudah terjual di kasir).`
            );
          }
        }

        // 3. Apply new payment method & account
        const newMetode = (params.metode || record.metodePembayaran) as 'TUNAI' | 'TRANSFER' | 'HUTANG';
        let finalRekSumber = 'TIT01';
        let finalStatus: 'LUNAS' | 'HUTANG_BELUM_LUNAS' = 'LUNAS';

        if (newMetode === 'TUNAI') {
          finalRekSumber = 'KAS01';
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
          if (kasAcc.saldoSaatIni < newTotalNominal) {
            throw new Error(
              `Saldo KAS01 tidak mencukupi (Tersedia: Rp ${kasAcc.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${newTotalNominal.toLocaleString('id-ID')})`
            );
          }
          kasAcc.saldoSaatIni -= newTotalNominal;
        } else if (newMetode === 'TRANSFER') {
          const rekKode = params.rekeningSumber || record.rekeningSumber;
          if (!rekKode || rekKode === 'KAS01' || rekKode === 'TIT01' || rekKode === 'BON01') {
            throw new Error('Pilih rekening Bank sumber dana transfer yang valid');
          }
          const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
          if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
          if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
            throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
          }
          if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < newTotalNominal) {
            throw new Error(
              `Saldo ${bankAcc.nama} tidak mencukupi (Tersedia: Rp ${bankAcc.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${newTotalNominal.toLocaleString('id-ID')})`
            );
          }
          bankAcc.saldoSaatIni -= newTotalNominal;
          finalRekSumber = bankAcc.kode;
        } else {
          finalRekSumber = 'TIT01';
          finalStatus = 'HUTANG_BELUM_LUNAS';
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Distributor / Pemasok');
        record.idMitra = party.id;
        record.namaMitra = party.nama;
        if (record.isDistributorManual && params.namaMitraManual) {
          record.namaDistributorManual = params.namaMitraManual.trim();
        }
        record.items = newProcessedItems;
        record.totalNominal = newTotalNominal;
        record.metodePembayaran = newMetode;
        record.rekeningSumber = finalRekSumber;
        record.status = finalStatus;
        if (params.divisi !== undefined) record.divisi = params.divisi.trim();
        if (params.noFakturSupplier !== undefined) record.noFakturSupplier = params.noFakturSupplier.trim() || '-';
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        // 4. Recalculate real HPP modal for all affected products strictly from purchase history
        for (const kode of affectedProductCodes) {
          recalculateProductHppFromRealPurchases(kode);
        }

        auditSummary = `Edit Pembelian Barang Kulakan ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newTotalNominal.toLocaleString('id-ID')} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ''}]`;
        auditNominal = newTotalNominal;
        auditRekening = finalRekSumber;
        updatedRecord = record;
      }

      // =====================================================
      // 4. PENJUALAN TOKO / KASIR / INTERNAL PT
      // =====================================================
      else if (jenis === 'PENJUALAN') {
        const record = db.penjualan.find((p) => p.noPenjualan === cleanId)!;
        const oldNominal = Number(record.totalNominal) || 0;
        const alreadyPaidBon =
          record.metode === 'KASBON' ? Math.max(0, oldNominal - (Number(record.sisaPiutang) || 0)) : 0;

        // 1. Restore old sold items back to warehouse stock (skip non-stock ALAT) & reverse old cash inflow
        for (const oldIt of record.items || []) {
          const cleanKode = String(oldIt.kodeProduk || '').trim().toUpperCase();
          const oldProd = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (stokItem && !isKategoriAlatNonStok(oldProd?.kategori || stokItem.kategori)) {
            stokItem.stok = (Number(stokItem.stok) || 0) + (Number(oldIt.qty) || 0);
          }
        }

        if (
          (record.metode === 'TUNAI' || record.metode === 'TRANSFER') &&
          record.rekeningTujuan &&
          record.rekeningTujuan !== 'BON01' &&
          record.rekeningTujuan !== 'INTERNAL_PT'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) oldRek.saldoSaatIni -= oldNominal;
        }

        // 2. Apply & validate new items
        const rawItems = params.items && params.items.length > 0 ? params.items : record.items;
        if (!rawItems || rawItems.length === 0) {
          throw new Error('Minimal harus ada 1 item produk pada transaksi penjualan');
        }

        let newTotalNominal = 0;
        let newTotalModalHpp = 0;
        const newProcessedItems = [];

        for (const it of rawItems) {
          const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
          const qty = Number(it.qty);
          const hargaDeal = Math.max(0, Math.round(Number(it.harga ?? (it as any).hargaBeliSatuan ?? 0)));

          if (!cleanKode) throw new Error('Kode produk wajib dipilih');
          if (isNaN(qty) || qty <= 0) throw new Error(`Qty penjualan ${cleanKode} harus lebih dari 0`);

          const prod = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
          if (!prod) throw new Error(`Produk ${cleanKode} tidak ditemukan`);

          const isAlatJasa = isKategoriAlatNonStok(prod.kategori);
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (!isAlatJasa) {
            if (!stokItem || stokItem.stok < qty) {
              throw new Error(
                `Stok gudang "${prod.nama}" tidak mencukupi. Tersedia: ${stokItem?.stok || 0} ${prod.satuan}, dibutuhkan: ${qty} ${prod.satuan}`
              );
            }
            stokItem.stok -= qty;
            stokItem.updateTerakhir = iso;
          } else if (stokItem) {
            stokItem.updateTerakhir = iso;
          }

          const existingOldItem = record.items.find(
            (oi) => String(oi.kodeProduk || '').trim().toUpperCase() === cleanKode
          );
          const hppUnit = prod.hargaBeli > 0 ? prod.hargaBeli : existingOldItem?.hargaBeli || 0;
          const subtotal = Math.round(qty * hargaDeal);
          const modalSub = Math.round(qty * hppUnit);
          const labaKotor = subtotal - modalSub;

          newTotalNominal += subtotal;
          newTotalModalHpp += modalSub;

          newProcessedItems.push({
            kodeProduk: prod.kode,
            namaProduk: prod.nama,
            satuan: prod.satuan,
            qty,
            hargaBeli: hppUnit,
            hargaSugesti: prod.hargaJual || hppUnit,
            harga: hargaDeal,
            subtotal,
            labaKotor,
          });
        }

        // If user edited nominal directly without item array changes (e.g. single-item quick nego)
        if (!params.items && params.nominal !== undefined && newProcessedItems.length === 1) {
          const customTotal = Math.max(0, Math.round(Number(params.nominal)));
          const only = newProcessedItems[0];
          only.subtotal = customTotal;
          only.harga = only.qty > 0 ? Math.round(customTotal / only.qty) : customTotal;
          only.labaKotor = customTotal - Math.round(only.qty * only.hargaBeli);
          newTotalNominal = customTotal;
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Pelanggan Umum');
        let newMetode = (params.metode || record.metode) as 'TUNAI' | 'TRANSFER' | 'KASBON' | 'INTERNAL_PT';
        if (newTotalNominal === 0 && newMetode !== 'INTERNAL_PT') {
          newMetode = 'INTERNAL_PT';
        }

        if (newMetode === 'KASBON' && (party.id === 'UMUM' || !party.id)) {
          throw new Error('Transaksi KASBON wajib memilih Mitra / Pelanggan terdaftar');
        }

        let finalRekTujuan = 'KAS01';
        let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' = 'LUNAS';
        let sisaPiutang = 0;

        if (newMetode === 'INTERNAL_PT') {
          finalRekTujuan = 'INTERNAL_PT';
          statusPembayaran = 'LUNAS';
          sisaPiutang = 0;
        } else if (newMetode === 'TUNAI') {
          finalRekTujuan = 'KAS01';
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
          kasAcc.saldoSaatIni += newTotalNominal;
        } else if (newMetode === 'TRANSFER') {
          const rekKode = params.rekeningTujuan || record.rekeningTujuan;
          if (!rekKode || rekKode === 'KAS01' || rekKode === 'BON01' || rekKode === 'TIT01' || rekKode === 'INTERNAL_PT') {
            throw new Error('Pilih rekening Bank tujuan transfer yang valid');
          }
          const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
          if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
          if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
            throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
          }
          bankAcc.saldoSaatIni += newTotalNominal;
          finalRekTujuan = bankAcc.kode;
        } else if (newMetode === 'KASBON') {
          finalRekTujuan = 'BON01';
          sisaPiutang = Math.max(0, newTotalNominal - alreadyPaidBon);
          statusPembayaran = sisaPiutang === 0 ? 'LUNAS' : 'BELUM_BAYAR';
        }

        record.idMitra = party.id;
        record.namaMitra = party.nama;
        record.items = newProcessedItems;
        record.totalModalHpp = newTotalModalHpp;
        record.totalNominal = newTotalNominal;
        record.totalLabaKotor = newTotalNominal - newTotalModalHpp;
        record.metode = newMetode;
        record.rekeningTujuan = finalRekTujuan;
        record.statusPembayaran = statusPembayaran;
        record.sisaPiutang = sisaPiutang;
        if (params.divisi !== undefined) record.divisi = params.divisi.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Penjualan Toko ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newTotalNominal.toLocaleString('id-ID')} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ''}]`;
        auditNominal = newTotalNominal;
        auditRekening = finalRekTujuan;
        updatedRecord = record;
      }

      // =====================================================
      // 5. KASBON UANG & PIUTANG NOTA LALU
      // =====================================================
      else if (jenis === 'KASBON_UANG') {
        const record = db.kasbonUang.find((k) => k.idTransaksi === cleanId)!;
        const oldNominal = Number(record.nominal) || 0;
        const sudahDibayar = Math.max(0, oldNominal - (Number(record.sisaKasbon) || 0));
        const isNotaLalu = Boolean(record.isNotaLalu || record.rekeningSumber === 'BON01');

        if (!isNotaLalu && record.rekeningSumber && record.rekeningSumber !== 'BON01' && record.rekeningSumber !== 'TIT01') {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }

        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal kasbon harus lebih dari Rp 0');
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, record.namaMitra);
        record.idMitra = party.id;
        record.namaMitra = party.nama;

        if (!isNotaLalu) {
          const newMetode = (params.metode || record.metode) as 'TUNAI' | 'TRANSFER';
          const targetRekKode =
            newMetode === 'TUNAI' ? 'KAS01' : params.rekeningSumber || record.rekeningSumber;
          if (!targetRekKode || targetRekKode === 'BON01' || targetRekKode === 'TIT01') {
            throw new Error('Pilih rekening sumber kas/bank yang valid');
          }
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === 'AKTIF');
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < newNominal) {
            throw new Error(
              `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${newNominal.toLocaleString('id-ID')})`
            );
          }
          newRek.saldoSaatIni -= newNominal;
          record.metode = newMetode;
          record.rekeningSumber = newRek.kode;
        }

        record.nominal = newNominal;
        record.sisaKasbon = Math.max(0, newNominal - sudahDibayar);
        record.status =
          record.sisaKasbon === 0 ? 'LUNAS' : sudahDibayar > 0 ? 'SEBAGIAN' : 'BELUM LUNAS';

        if (params.tanggal) {
          record.tanggal = params.tanggal.trim();
          if (record.isNotaLalu) record.tanggalNotaLalu = params.tanggal.trim();
        }
        if (params.noNotaLalu !== undefined) record.noNotaLalu = params.noNotaLalu.trim();
        if (params.rincianBarangNotaLalu !== undefined) {
          record.rincianBarangNotaLalu = params.rincianBarangNotaLalu.trim();
        }
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Kasbon/Nota Lalu ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')}`;
        auditNominal = newNominal;
        auditRekening = record.rekeningSumber;
        updatedRecord = record;
      }

      // =====================================================
      // 6. BAYAR BON / PELUNASAN PIUTANG MITRA
      // =====================================================
      else if (jenis === 'BAYAR_BON') {
        const record = db.bayarBon.find((b) => b.idTransaksi === cleanId)!;
        const oldNominal = Number(record.nominalBayar) || 0;
        const isNonTunai =
          record.metode === 'SINKRON' ||
          record.metode === 'KOMPENSASI_TITIP' ||
          record.metode === 'POTONG_GAJI' ||
          record.rekeningTujuan === 'SINKRON' ||
          Boolean(record.isKompensasiTitipan) ||
          Boolean(record.isPotongGaji);

        // 1. Reverse old cash inflow
        if (
          !isNonTunai &&
          record.rekeningTujuan &&
          record.rekeningTujuan !== 'BON01' &&
          record.rekeningTujuan !== 'TIT01' &&
          record.rekeningTujuan !== 'SINKRON' &&
          record.rekeningTujuan !== 'KOMPENSASI_TITIP' &&
          record.rekeningTujuan !== 'POTONG_GAJI'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) oldRek.saldoSaatIni -= oldNominal;
        }

        // 2. Restore old allocations back to target bon records so we can re-allocate cleanly
        for (const alok of record.alokasi || []) {
          if (alok.jenis === 'KASBON_BARANG') {
            const pj = db.penjualan.find((p) => p.noPenjualan === alok.refId);
            if (pj) {
              pj.sisaPiutang = (Number(pj.sisaPiutang) || 0) + (Number(alok.nominalDibayar) || 0);
              pj.statusPembayaran = pj.sisaPiutang > 0 ? 'BELUM_BAYAR' : 'LUNAS';
            }
            const jhb = (db.penjualanHasilBumi || []).find((j) => j.noPenjualan === alok.refId);
            if (jhb) {
              jhb.sisaPiutang = (Number(jhb.sisaPiutang) || 0) + (Number(alok.nominalDibayar) || 0);
              jhb.statusPembayaran = jhb.sisaPiutang > 0 ? 'BELUM_BAYAR' : 'LUNAS';
            }
          } else if (alok.jenis === 'KASBON_UANG') {
            const ku = db.kasbonUang.find((k) => k.idTransaksi === alok.refId);
            if (ku) {
              ku.sisaKasbon = (Number(ku.sisaKasbon) || 0) + (Number(alok.nominalDibayar) || 0);
              ku.status =
                ku.sisaKasbon >= ku.nominal
                  ? 'BELUM LUNAS'
                  : ku.sisaKasbon > 0
                  ? 'SEBAGIAN'
                  : 'LUNAS';
            }
          }
        }

        const newNominal = Math.round(Number(params.nominal ?? record.nominalBayar));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal pembayaran bon harus lebih dari Rp 0');
        }

        // Re-allocate across open bon for this mitra
        const openBarang = db.penjualan.filter(
          (p) => p.idMitra === record.idMitra && p.metode === 'KASBON' && p.sisaPiutang > 0
        );
        const openHasilBumi = (db.penjualanHasilBumi || []).filter(
          (j) => j.idMitra === record.idMitra && j.metodePembayaran === 'PIUTANG' && j.sisaPiutang > 0
        );
        const openUang = db.kasbonUang.filter(
          (k) => k.idMitra === record.idMitra && k.sisaKasbon > 0
        );

        const totalBonTersedia =
          openBarang.reduce((s, p) => s + p.sisaPiutang, 0) +
          openHasilBumi.reduce((s, j) => s + j.sisaPiutang, 0) +
          openUang.reduce((s, k) => s + k.sisaKasbon, 0);

        let remainingToAllocate = newNominal;
        const newAlokasi: typeof record.alokasi = [];

        for (const pj of openBarang) {
          if (remainingToAllocate <= 0) break;
          const bayar = Math.min(pj.sisaPiutang, remainingToAllocate);
          const sebelum = pj.sisaPiutang;
          pj.sisaPiutang -= bayar;
          pj.statusPembayaran = pj.sisaPiutang === 0 ? 'LUNAS' : 'BELUM_BAYAR';
          remainingToAllocate -= bayar;
          newAlokasi.push({
            jenis: 'KASBON_BARANG',
            refId: pj.noPenjualan,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: pj.sisaPiutang,
          });
        }

        for (const jhb of openHasilBumi) {
          if (remainingToAllocate <= 0) break;
          const bayar = Math.min(jhb.sisaPiutang, remainingToAllocate);
          const sebelum = jhb.sisaPiutang;
          jhb.sisaPiutang -= bayar;
          jhb.statusPembayaran = jhb.sisaPiutang === 0 ? 'LUNAS' : 'BELUM_BAYAR';
          remainingToAllocate -= bayar;
          newAlokasi.push({
            jenis: 'KASBON_BARANG',
            refId: jhb.noPenjualan,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: jhb.sisaPiutang,
          });
        }

        for (const ku of openUang) {
          if (remainingToAllocate <= 0) break;
          const bayar = Math.min(ku.sisaKasbon, remainingToAllocate);
          const sebelum = ku.sisaKasbon;
          ku.sisaKasbon -= bayar;
          ku.status = ku.sisaKasbon === 0 ? 'LUNAS' : 'SEBAGIAN';
          remainingToAllocate -= bayar;
          newAlokasi.push({
            jenis: 'KASBON_UANG',
            refId: ku.idTransaksi,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: ku.sisaKasbon,
          });
        }

        if (!isNonTunai) {
          const newMetode = (params.metode || record.metode) as 'TUNAI' | 'TRANSFER';
          const targetRekKode =
            newMetode === 'TUNAI' ? 'KAS01' : params.rekeningTujuan || record.rekeningTujuan;
          if (!targetRekKode || targetRekKode === 'BON01' || targetRekKode === 'TIT01' || targetRekKode === 'SINKRON') {
            throw new Error('Pilih rekening penerima pembayaran bon yang valid');
          }
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === 'AKTIF');
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          newRek.saldoSaatIni += newNominal;
          record.metode = newMetode;
          record.rekeningTujuan = newRek.kode;
        } else {
          // Sinkronkan catatan pasangan pemotongan titipan apabila transaksi ini berasal dari SINKRON
          const pairedSinkron = (db.pencairanTitipan || []).find(
            (p) =>
              p.idPencairan === `${cleanId}-SINKRON` ||
              (cleanId.endsWith('-POTBON') && p.idPencairan === cleanId.replace(/-POTBON$/, '-POTTIT'))
          );
          if (pairedSinkron) {
            const diffSinkron = newNominal - (Number(pairedSinkron.nominalPencairan) || 0);
            pairedSinkron.nominalPencairan = newNominal;
            pairedSinkron.nominalPotongBonOtomatis = newNominal;
            pairedSinkron.saldoTitipanSisa = Math.max(0, (pairedSinkron.saldoTitipanSisa || 0) - diffSinkron);
            if (params.tanggal) pairedSinkron.tanggal = params.tanggal.trim();
          }
        }

        record.totalBonSebelum = Math.max(totalBonTersedia, newNominal);
        record.nominalBayar = newNominal;
        if (record.isKompensasiTitipan || record.metode === 'SINKRON') {
          record.nominalPotongTitipanOtomatis = newNominal;
        }
        record.sisaBonSetelah = Math.max(0, totalBonTersedia - newNominal);
        record.alokasi = newAlokasi;
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Pembayaran Bon ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')}`;
        auditNominal = newNominal;
        auditRekening = record.rekeningTujuan;
        updatedRecord = record;
      }

      // =====================================================
      // 7. PENCAIRAN TITIPAN HASIL BUMI
      // =====================================================
      else if (jenis === 'PENCAIRAN_TITIPAN') {
        const record = (db.pencairanTitipan || []).find((p) => p.idPencairan === cleanId)!;
        const oldNominal = Number(record.nominalPencairan) || 0;
        const isKompensasi =
          record.metodePembayaran === 'SINKRON' ||
          record.metodePembayaran === 'KOMPENSASI_BON' ||
          record.rekeningSumber === 'SINKRON' ||
          Boolean(record.isKompensasiBon);

        if (!isKompensasi && record.rekeningSumber && record.rekeningSumber !== 'TIT01' && record.rekeningSumber !== 'BON01' && record.rekeningSumber !== 'SINKRON') {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }

        const newNominal = Math.round(Number(params.nominal ?? record.nominalPencairan));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal pencairan titipan harus lebih dari Rp 0');
        }

        if (!isKompensasi) {
          const newMetode = (params.metode || record.metodePembayaran) as 'TUNAI' | 'TRANSFER';
          const targetRekKode =
            newMetode === 'TUNAI' ? 'KAS01' : params.rekeningSumber || record.rekeningSumber;
          if (!targetRekKode || targetRekKode === 'TIT01' || targetRekKode === 'BON01' || targetRekKode === 'SINKRON') {
            throw new Error('Pilih rekening sumber kas/bank yang valid');
          }
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === 'AKTIF');
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < newNominal) {
            throw new Error(
              `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${newNominal.toLocaleString('id-ID')})`
            );
          }
          newRek.saldoSaatIni -= newNominal;
          record.metodePembayaran = newMetode;
          record.rekeningSumber = newRek.kode;
        }

        const diff = newNominal - oldNominal;
        record.nominalPencairan = newNominal;
        record.saldoTitipanSisa = Math.max(0, (record.saldoTitipanSisa || 0) - diff);
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Pencairan Titipan ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')}`;
        auditNominal = newNominal;
        auditRekening = record.rekeningSumber;
        updatedRecord = record;
      }

      // =====================================================
      // 8. PENGELUARAN & BIAYA OPERASIONAL DIVISI
      // =====================================================
      else if (jenis === 'PENGELUARAN_DIVISI') {
        const record = (db.pengeluaran || []).find((e) => e.idTransaksi === cleanId)!;
        const oldNominal = Number(record.nominal) || 0;

        if (record.rekeningSumber) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }

        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal pengeluaran harus lebih dari Rp 0');
        }

        const targetRekKode = params.rekeningSumber || record.rekeningSumber || 'KAS01';
        if (targetRekKode === 'BON01' || targetRekKode === 'TIT01') {
          throw new Error('Rekening virtual BON01/TIT01 tidak dapat dipakai untuk pengeluaran');
        }
        const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === 'AKTIF');
        if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
        if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < newNominal) {
          throw new Error(
            `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${newNominal.toLocaleString('id-ID')})`
          );
        }
        newRek.saldoSaatIni -= newNominal;

        record.nominal = newNominal;
        record.rekeningSumber = newRek.kode;
        if (params.divisi) record.divisi = params.divisi.trim();
        if (params.kategori) record.kategori = params.kategori.trim();
        if (params.penerima !== undefined) record.penerima = params.penerima.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined && params.keterangan.trim()) {
          record.keterangan = params.keterangan.trim();
        }

        auditSummary = `Edit Pengeluaran Divisi ${cleanId} [${record.divisi}]: Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')} via ${newRek.kode}`;
        auditNominal = newNominal;
        auditRekening = newRek.kode;
        updatedRecord = record;
      }

      // =====================================================
      // 9. TRANSFER ANTAR REKENING & MUTASI AFILIASI
      // =====================================================
      else if (jenis === 'TRANSFER_REKENING') {
        const record = (db.transferRekening || []).find((t) => t.noTransfer === cleanId)!;
        const oldNominal = Number(record.nominal) || 0;

        const oldSumber = db.rekening.find((r) => r.kode === record.rekeningSumber);
        const oldTujuan = db.rekening.find((r) => r.kode === record.rekeningTujuan);
        if (oldSumber) oldSumber.saldoSaatIni += oldNominal;
        if (oldTujuan) oldTujuan.saldoSaatIni -= oldNominal;

        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal transfer harus lebih dari Rp 0');
        }

        const kodeSumber = params.rekeningSumber || record.rekeningSumber;
        const kodeTujuan = params.rekeningTujuan || record.rekeningTujuan;
        if (kodeSumber === kodeTujuan) {
          throw new Error('Rekening sumber dan rekening tujuan tidak boleh sama');
        }
        if (kodeSumber === 'BON01' || kodeSumber === 'TIT01' || kodeTujuan === 'BON01' || kodeTujuan === 'TIT01') {
          throw new Error('Rekening virtual BON01/TIT01 tidak dapat ditransfer manual');
        }

        const newSumber = db.rekening.find((r) => r.kode === kodeSumber && r.status === 'AKTIF');
        const newTujuan = db.rekening.find((r) => r.kode === kodeTujuan && r.status === 'AKTIF');
        if (!newSumber) throw new Error(`Rekening sumber ${kodeSumber} tidak ditemukan`);
        if (!newTujuan) throw new Error(`Rekening tujuan ${kodeTujuan} tidak ditemukan`);

        if (!this.isAnakPerusahaanRekening(newSumber) && newSumber.saldoSaatIni < newNominal) {
          throw new Error(
            `Saldo ${newSumber.nama} tidak mencukupi (Tersedia: Rp ${newSumber.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${newNominal.toLocaleString('id-ID')})`
          );
        }

        newSumber.saldoSaatIni -= newNominal;
        newTujuan.saldoSaatIni += newNominal;

        record.rekeningSumber = newSumber.kode;
        record.rekeningTujuan = newTujuan.kode;
        record.nominal = newNominal;
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Transfer Rekening ${cleanId} (${newSumber.kode} -> ${newTujuan.kode}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')}`;
        auditNominal = newNominal;
        auditRekening = `${newSumber.kode} -> ${newTujuan.kode}`;
        updatedRecord = record;
      }

      // =====================================================
      // 10. CATATAN UPAH KERJA HARIAN KARYAWAN
      // =====================================================
      else if (jenis === 'UPAH_HARIAN') {
        const record = (db.upahHarian || []).find((u) => u.id === cleanId)!;
        const oldTotal = Number(record.totalUpahHarian || record.jumlah || record.upahHarian) || 0;

        const kuantiti =
          params.kuantiti !== undefined ? Math.max(0, Number(params.kuantiti)) : Number(record.kuantiti ?? 1);
        const hargaSatuan =
          params.hargaSatuanUpah !== undefined
            ? Math.max(0, Math.round(Number(params.hargaSatuanUpah)))
            : params.nominal !== undefined && params.kuantiti === undefined
            ? Math.max(0, Math.round(Number(params.nominal)))
            : Math.max(0, Number(record.harga ?? record.upahHarian ?? 0));
        const uangMakanLembur =
          params.uangMakanLembur !== undefined
            ? Math.max(0, Math.round(Number(params.uangMakanLembur)))
            : Math.max(0, Number(record.uangMakanLembur ?? 0));

        const upahPokok =
          params.nominal !== undefined && params.hargaSatuanUpah === undefined && params.kuantiti === undefined
            ? Math.max(0, Math.round(Number(params.nominal)))
            : Math.round(kuantiti * hargaSatuan);
        const totalUpahHarian = upahPokok + uangMakanLembur;

        record.kuantiti = kuantiti;
        record.harga = kuantiti > 0 ? Math.round(upahPokok / kuantiti) : hargaSatuan;
        record.jumlah = upahPokok;
        record.upahHarian = upahPokok;
        record.uangMakanLembur = uangMakanLembur;
        record.totalUpahHarian = totalUpahHarian;
        if (params.divisi) record.divisi = params.divisi as NamaDivisi;
        if (params.itemKerja !== undefined) record.item = params.itemKerja.trim();
        if (params.catatanKerja !== undefined) record.catatan = params.catatanKerja.trim();
        if (params.tanggal) record.tanggalKerja = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Upah Harian ${cleanId} (${record.namaKaryawan}): Rp ${oldTotal.toLocaleString('id-ID')} -> Rp ${totalUpahHarian.toLocaleString('id-ID')}`;
        auditNominal = totalUpahHarian;
        auditRekening = record.rekening || 'HUTANG_UPAH';
        updatedRecord = record;
      }

      // =====================================================
      // 11. SLIP PENGGAJIAN KARYAWAN
      // =====================================================
      else if (jenis === 'PENGGAJIAN') {
        const record = (db.penggajian || []).find((g) => g.id === cleanId)!;
        const oldBersih = Number(record.gajiBersihDibayar) || 0;

        if (record.rekeningSumber && record.rekeningSumber !== 'BON01' && record.rekeningSumber !== 'TIT01') {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldBersih;
        }

        const gajiPokok = Math.max(
          0,
          Math.round(
            Number(
              params.gajiPokok ??
                (params.nominal !== undefined && params.bonus === undefined && params.tunjangan === undefined
                  ? Number(params.nominal) + (record.potonganKasbon || 0) - (record.tunjangan || 0) - (record.bonus || 0)
                  : record.gajiPokok)
            )
          )
        );
        const tunjangan = Math.max(0, Math.round(Number(params.tunjangan ?? record.tunjangan ?? 0)));
        const bonus = Math.max(0, Math.round(Number(params.bonus ?? record.bonus ?? 0)));
        const potonganKasbon = Math.max(
          0,
          Math.round(Number(params.potonganKasbon ?? record.potonganKasbon ?? 0))
        );

        const totalGajiKotor = gajiPokok + tunjangan + bonus;
        if (totalGajiKotor <= 0) {
          throw new Error('Total gaji kotor harus lebih dari Rp 0');
        }
        const gajiBersihDibayar = Math.max(0, totalGajiKotor - potonganKasbon);

        const targetRekKode = params.rekeningSumber || record.rekeningSumber || 'KAS01';
        if (targetRekKode === 'BON01' || targetRekKode === 'TIT01') {
          throw new Error('Rekening virtual BON01/TIT01 tidak dapat dipakai untuk gaji');
        }
        const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === 'AKTIF');
        if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
        if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < gajiBersihDibayar) {
          throw new Error(
            `Saldo ${newRek.nama} tidak mencukupi untuk gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
          );
        }
        newRek.saldoSaatIni -= gajiBersihDibayar;

        record.gajiPokok = gajiPokok;
        record.tunjangan = tunjangan;
        record.bonus = bonus;
        record.totalGajiKotor = totalGajiKotor;
        record.potonganKasbon = potonganKasbon;
        record.gajiBersihDibayar = gajiBersihDibayar;
        record.rekeningSumber = newRek.kode;
        if (params.metode) record.metodePembayaran = params.metode as 'TUNAI' | 'TRANSFER';
        if (params.divisi) record.divisi = params.divisi as NamaDivisi;
        if (params.periodeBulan) record.periodeBulan = params.periodeBulan.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Penggajian ${cleanId} (${record.namaKaryawan}): Gaji Bersih Rp ${oldBersih.toLocaleString('id-ID')} -> Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${newRek.kode}`;
        auditNominal = gajiBersihDibayar;
        auditRekening = newRek.kode;
        updatedRecord = record;
      }

      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'UPDATE',
        cleanId,
        auditSummary || `Perubahan detail transaksi ${cleanId}`,
        auditNominal,
        auditRekening
      );

      return {
        success: true,
        jenis,
        idTransaksi: cleanId,
        message: 'Detail transaksi berhasil diperbarui & seluruh stok, HPP, serta saldo rekening telah disinkronkan otomatis.',
        updatedRecord,
      };
    });
  }

  // ==========================================
  // KOSONGKAN SALDO MITRA, HAPUS MITRA & KOSONGKAN NOMINAL SALDO SISTEM
  // ==========================================
  public static async resetSaldoMitra(idMitra: string) {
    const cleanId = String(idMitra || '').trim();
    if (!cleanId) {
      throw new Error('ID Mitra wajib disertakan');
    }

    return await dbManager.executeTransaction((db) => {
      const mitra = (db.mitra || []).find((m) => m.id === cleanId);
      if (!mitra) {
        throw new Error(`Mitra dengan ID ${cleanId} tidak ditemukan`);
      }

      // 1. Bersihkan kasbon uang, pembayaran bon, & pencairan titipan mitra ini
      db.kasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra !== cleanId);
      db.bayarBon = (db.bayarBon || []).filter((b) => b.idMitra !== cleanId);
      db.pencairanTitipan = (db.pencairanTitipan || []).filter((pt) => pt.idMitra !== cleanId);

      // 2. Kosongkan piutang penjualan barang toko & penjualan hasil bumi mitra ini
      for (const p of db.penjualan || []) {
        if (p.idMitra === cleanId && p.metode === 'KASBON') {
          p.metode = 'TUNAI';
          p.statusPembayaran = 'LUNAS';
          p.sisaPiutang = 0;
        }
      }
      for (const j of db.penjualanHasilBumi || []) {
        if (j.idMitra === cleanId && j.metodePembayaran === 'PIUTANG') {
          j.metodePembayaran = 'TUNAI';
          j.statusPembayaran = 'LUNAS';
          j.sisaPiutang = 0;
        }
      }

      // 3. Kosongkan titipan hasil panen, titipan dana/pinjaman, & hutang kulakan mitra ini
      db.pembelianHasilBumi = (db.pembelianHasilBumi || []).filter((phb) => {
        if (phb.idMitra !== cleanId) return true;
        const isDanaMurni =
          phb.isNotaLalu ||
          phb.komoditasKode === 'TITIP_DANA' ||
          phb.komoditasKode === 'PINJAMAN_DANA';
        if (isDanaMurni) return false;
        if (phb.metodePembayaran === 'TITIP') {
          phb.metodePembayaran = 'TUNAI';
          phb.status = 'LUNAS';
        }
        return true;
      });

      for (const pb of db.pembelianBarang || []) {
        if (pb.idMitra === cleanId && pb.metodePembayaran === 'HUTANG') {
          pb.metodePembayaran = 'TUNAI';
          pb.status = 'LUNAS';
        }
      }

      // 4. Jika terhubung dengan Karyawan, kosongkan upah harian yang belum dibayar (TERCATAT)
      const linkedKry = (db.karyawan || []).find(
        (k) =>
          k.id === mitra.idKaryawanTerkait ||
          k.idMitraTerkait === cleanId ||
          `MTR-${k.id}` === cleanId ||
          (mitra.kode && k.nik === mitra.kode)
      );
      if (linkedKry) {
        db.upahHarian = (db.upahHarian || []).filter(
          (u) => !(u.idKaryawan === linkedKry.id && u.status === 'TERCATAT')
        );
      }

      // 5. Jika Mitra adalah Anak Perusahaan (misal DP Parabot), kosongkan saldo rekening terkait & riwayat transfernya
      const linkedRek = (db.rekening || []).find(
        (r) =>
          (r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN') &&
          (r.kode === mitra.kodeRekeningTerkait || r.idMitraTerkait === cleanId)
      );
      if (linkedRek) {
        linkedRek.saldoAwal = 0;
        linkedRek.saldoSaatIni = 0;
        db.transferRekening = (db.transferRekening || []).filter(
          (t) =>
            t.rekeningSumber !== linkedRek.kode &&
            t.rekeningTujuan !== linkedRek.kode &&
            t.idMitraTerkait !== cleanId
        );
      } else {
        db.transferRekening = (db.transferRekening || []).filter(
          (t) => t.idMitraTerkait !== cleanId
        );
      }

      dbManager.synchronizeVirtualAccounts();
      dbManager.synchronizeDivisiAccounts();

      this.addAuditLog(
        db,
        'UPDATE',
        cleanId,
        `Pengosongan seluruh saldo, piutang, bon, dan titipan Mitra: ${mitra.nama} (${mitra.kode}) menjadi Rp 0`,
        0
      );

      return {
        idMitra: cleanId,
        namaMitra: mitra.nama,
        message: `Seluruh saldo, bon, piutang, dan titipan mitra ${mitra.nama} berhasil dikosongkan ke Rp 0.`,
      };
    });
  }

  public static async deleteMitra(idMitra: string) {
    const cleanId = String(idMitra || '').trim();
    if (!cleanId || cleanId === 'UMUM') {
      throw new Error('ID Mitra tidak valid untuk dihapus');
    }

    return await dbManager.executeTransaction((db) => {
      const mitraIdx = (db.mitra || []).findIndex((m) => m.id === cleanId);
      if (mitraIdx < 0) {
        throw new Error(`Mitra dengan ID ${cleanId} tidak ditemukan`);
      }

      const mitra = db.mitra[mitraIdx];
      const namaMitra = mitra.nama;

      // 1. Hapus kasbon uang, bayar bon, & pencairan titipan milik mitra ini
      db.kasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra !== cleanId);
      db.bayarBon = (db.bayarBon || []).filter((b) => b.idMitra !== cleanId);
      db.pencairanTitipan = (db.pencairanTitipan || []).filter((pt) => pt.idMitra !== cleanId);

      // 2. Lepaskan keterkaitan transaksi barang/panen ke 'UMUM' agar syncTxMitra tidak memulihkan ulang mitra yang sudah dihapus
      for (const p of db.penjualan || []) {
        if (p.idMitra === cleanId) {
          p.idMitra = 'UMUM';
          p.namaMitra = `${namaMitra} (Terhapus)`;
          if (p.metode === 'KASBON') {
            p.metode = 'TUNAI';
            p.statusPembayaran = 'LUNAS';
            p.sisaPiutang = 0;
          }
        }
      }
      for (const j of db.penjualanHasilBumi || []) {
        if (j.idMitra === cleanId) {
          j.idMitra = 'UMUM';
          j.namaMitra = `${namaMitra} (Terhapus)`;
          if (j.metodePembayaran === 'PIUTANG') {
            j.metodePembayaran = 'TUNAI';
            j.statusPembayaran = 'LUNAS';
            j.sisaPiutang = 0;
          }
        }
      }
      db.pembelianHasilBumi = (db.pembelianHasilBumi || []).filter((phb) => {
        if (phb.idMitra !== cleanId) return true;
        const isDanaMurni =
          phb.isNotaLalu ||
          phb.komoditasKode === 'TITIP_DANA' ||
          phb.komoditasKode === 'PINJAMAN_DANA';
        if (isDanaMurni) return false;
        phb.idMitra = 'UMUM';
        phb.namaMitra = `${namaMitra} (Terhapus)`;
        if (phb.metodePembayaran === 'TITIP') {
          phb.metodePembayaran = 'TUNAI';
          phb.status = 'LUNAS';
        }
        return true;
      });
      for (const pb of db.pembelianBarang || []) {
        if (pb.idMitra === cleanId) {
          pb.idMitra = 'UMUM';
          pb.namaMitra = `${namaMitra} (Terhapus)`;
          if (pb.metodePembayaran === 'HUTANG') {
            pb.metodePembayaran = 'TUNAI';
            pb.status = 'LUNAS';
          }
        }
      }

      // 3. Jika terhubung dengan Karyawan, hapus entitas Karyawan terkait agar tidak di-recreate oleh rekonsiliasi 1-to-1
      const linkedKryIds = new Set(
        (db.karyawan || [])
          .filter(
            (k) =>
              k.id === mitra.idKaryawanTerkait ||
              k.idMitraTerkait === cleanId ||
              `MTR-${k.id}` === cleanId ||
              (mitra.kode && k.nik === mitra.kode)
          )
          .map((k) => k.id)
      );
      if (linkedKryIds.size > 0) {
        db.karyawan = (db.karyawan || []).filter((k) => !linkedKryIds.has(k.id));
        db.upahHarian = (db.upahHarian || []).filter((u) => !linkedKryIds.has(u.idKaryawan));
      }

      // 4. Jika Mitra adalah Anak Perusahaan, hapus juga akun Rekening Anak Perusahaan terkait agar tidak di-recreate
      const linkedRekCodes = new Set(
        (db.rekening || [])
          .filter(
            (r) =>
              (r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN') &&
              (r.kode === mitra.kodeRekeningTerkait || r.idMitraTerkait === cleanId)
          )
          .map((r) => r.kode)
      );
      if (linkedRekCodes.size > 0) {
        db.rekening = (db.rekening || []).filter((r) => !linkedRekCodes.has(r.kode));
        db.transferRekening = (db.transferRekening || []).filter(
          (t) =>
            !linkedRekCodes.has(t.rekeningSumber) &&
            !linkedRekCodes.has(t.rekeningTujuan) &&
            t.idMitraTerkait !== cleanId
        );
      } else {
        db.transferRekening = (db.transferRekening || []).filter(
          (t) => t.idMitraTerkait !== cleanId
        );
      }

      // 5. Hapus mitra dari tabel master mitra
      db.mitra.splice(mitraIdx, 1);

      dbManager.synchronizeVirtualAccounts();
      dbManager.synchronizeDivisiAccounts();

      this.addAuditLog(
        db,
        'VOID',
        cleanId,
        `Penghapusan permanen data Mitra: ${namaMitra} (${mitra.kode})`,
        0
      );

      return {
        deletedId: cleanId,
        deletedNama: namaMitra,
        message: `Mitra ${namaMitra} berhasil dihapus secara permanen dari sistem.`,
      };
    });
  }

  public static async resetSemuaSaldoSistem(opsi?: { hanyaMitra?: boolean }) {
    const hanyaMitra = Boolean(opsi?.hanyaMitra);

    return await dbManager.executeTransaction((db) => {
      if (hanyaMitra) {
        // Kosongkan khusus seluruh bon, piutang, dan titipan mitra saja
        db.kasbonUang = [];
        db.bayarBon = [];
        db.pencairanTitipan = [];

        for (const p of db.penjualan || []) {
          if (p.metode === 'KASBON') {
            p.metode = 'TUNAI';
            p.statusPembayaran = 'LUNAS';
            p.sisaPiutang = 0;
          }
        }
        for (const j of db.penjualanHasilBumi || []) {
          if (j.metodePembayaran === 'PIUTANG') {
            j.metodePembayaran = 'TUNAI';
            j.statusPembayaran = 'LUNAS';
            j.sisaPiutang = 0;
          }
        }
        db.pembelianHasilBumi = (db.pembelianHasilBumi || []).filter((phb) => {
          const isDanaMurni =
            phb.isNotaLalu ||
            phb.komoditasKode === 'TITIP_DANA' ||
            phb.komoditasKode === 'PINJAMAN_DANA';
          if (isDanaMurni) return false;
          if (phb.metodePembayaran === 'TITIP') {
            phb.metodePembayaran = 'TUNAI';
            phb.status = 'LUNAS';
          }
          return true;
        });
        for (const pb of db.pembelianBarang || []) {
          if (pb.metodePembayaran === 'HUTANG') {
            pb.metodePembayaran = 'TUNAI';
            pb.status = 'LUNAS';
          }
        }
        db.upahHarian = (db.upahHarian || []).filter((u) => u.status !== 'TERCATAT');

        for (const r of db.rekening || []) {
          if (r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN') {
            r.saldoAwal = 0;
            r.saldoSaatIni = 0;
          }
        }
        const anakCodes = new Set(
          (db.rekening || [])
            .filter((r) => r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN')
            .map((r) => r.kode)
        );
        db.transferRekening = (db.transferRekening || []).filter(
          (t) =>
            !t.idMitraTerkait &&
            !anakCodes.has(t.rekeningSumber) &&
            !anakCodes.has(t.rekeningTujuan)
        );
      } else {
        // Kosongkan seluruh nominal saldo rekening, kas, divisi, piutang, bon, titipan, dan histori transaksi
        // (Master Data Mitra, Karyawan, Produk, Kategori, Rekening, Inventaris & Divisi tetap utuh!)
        for (const r of db.rekening || []) {
          r.saldoAwal = 0;
          r.saldoSaatIni = 0;
        }
        for (const kry of db.karyawan || []) {
          kry.gajiPokok = 0;
          kry.tunjanganTetap = 0;
          if (isExcludedFromDivisi(kry.divisi) || isExcludedFromDivisi(kry.departemen)) {
            kry.divisi = 'PT Wijaya Agro Perkasa';
            kry.departemen = 'PT Wijaya Agro Perkasa';
          }
        }
        for (const sb of db.stokBarang || []) {
          sb.stok = 0;
        }
        for (const shb of db.stokHasilBumi || []) {
          shb.stok = 0;
          shb.stokAwal = 0;
          shb.modalAwalTotal = 0;
          shb.rataRataModalAwal = 0;
        }

        db.penjualan = [];
        db.penjualanHasilBumi = [];
        db.pembelianBarang = [];
        db.pembelianHasilBumi = [];
        db.kasbonUang = [];
        db.bayarBon = [];
        db.pencairanTitipan = [];
        db.pengeluaran = [];
        db.transferRekening = [];
        db.upahHarian = [];
        db.penggajian = [];
        db.cashOpnameLogs = [];
      }

      dbManager.synchronizeVirtualAccounts();
      dbManager.synchronizeDivisiAccounts();

      const msg = hanyaMitra
        ? 'Seluruh saldo bon, piutang, dan titipan mitra telah dikosongkan ke Rp 0.'
        : 'Seluruh nominal saldo rekening, kas, divisi, piutang, bon, dan titipan mitra telah dikosongkan ke Rp 0 (Data Master tetap utuh).';

      this.addAuditLog(db, 'VOID', 'SYS-ZERO-BALANCES', msg, 0);

      return {
        hanyaMitra,
        totalMitra: (db.mitra || []).length,
        totalRekening: (db.rekening || []).length,
        message: msg,
      };
    });
  }
}


