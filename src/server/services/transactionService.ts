import { dbManager, getWIBDateTime } from '../db.ts';
import {
  DAFTAR_DIVISI,
  DAFTAR_24_ITEM_PENGELUARAN,
  TANPA_DIVISI_VALUE,
  getNomorUrutItemPengeluaran,
  isKategoriAlatNonStok,
  isProdukTanpaStok,
  isExcludedFromDivisi,
  isTanpaDivisi,
  normalizeRoleMitra,
  resolveKelompokItemPengeluaran,
} from '../types.ts';
import { normalizeDateToDmy } from '../../utils/format.ts';
import type {
  AlokasiPembayaranBon,
  AuditLog,
  BukuRekeningKaryawanSummary,
  CatatanUpahHarian,
  ItemPenjualan,
  Karyawan,
  Mitra,
  MutasiBukuRekeningKaryawan,
  MutasiKeuanganDivisi,
  NamaDivisi,
  Produk,
  Rekening,
  RiwayatDivisiKaryawan,
  StokBarang,
  StokHasilBumi,
  PergerakanKeuanganDivisiSummary,
  RekapGajiKaryawanBulanan,
  RekeningKoranMitraSummary,
  RekapMasterMitraSummary,
  RekapMitraItem,
  NotaNgunciDetailItem,
  StatusNotaRekapMitra,
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
  MasterItemPengeluaran,
  KelompokItemPengeluaran,
  ItemInventaris,
  NotaSilangItemInput,
  NotaSilangRecordSummary,
  TransaksiPencairanTitipan,
  TransaksiBrilink,
  JenisTransaksiBrilink,
  TransaksiUangMasuk,
  UnifiedTransactionItem,
  RekapSemuaTransaksiResponse,
  KandidatKliringMitra,
  PasanganMitraKembar,
  CatatanCashOpname,
  SmartControlOverviewResponse,
  HasilKliringSilangResponse,
  ItemDetailArusKasBos,
  BarisKomoditasMasukBos,
  KolomKomoditasMasukBos,
  ItemBarangTokoMasukBos,
  RekapHarianBosLengkapResponse,
  InvoiceSuratJalanRecord,
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
    tanggal?: string;
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON' | 'SINKRON' | 'INTERNAL_PT' | 'PEMAKAIAN_PENGELUARAN';
    rekeningTujuan?: string;
    divisi?: string;
    kategoriPengeluaran?: string;
    idInventaris?: string;
    penerimaPengeluaran?: string;
    items: Array<{ kodeProduk: string; qty: number; harga?: number; hargaSugesti?: number }>;
    keterangan?: string;
  }): Promise<TransaksiPenjualan> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);

      const isInternalSale = params.metode === 'INTERNAL_PT' || (params.metode as string) === 'INTERNAL';
      const isPemakaianPengeluaran = params.metode === 'PEMAKAIAN_PENGELUARAN';
      const isSinkronSale = params.metode === 'SINKRON';

      // Resolve Mitra or Manual General Customer
      let finalMitraId = 'UMUM';
      let finalMitraNama =
        params.namaPembeliManual?.trim() ||
        (isPemakaianPengeluaran
          ? params.penerimaPengeluaran?.trim() || 'Pemakaian Inventaris / Pengeluaran PT'
          : isInternalSale
          ? 'Kebutuhan Internal PT'
          : 'Pelanggan Umum');

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

        const isAlatJasa = isProdukTanpaStok(product, db.kategoriProduk);
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
        const defaultSuggested = isPemakaianPengeluaran
          ? modalHppSatuan > 0
            ? modalHppSatuan
            : baseJualUmum
          : tipePembeli === 'REKANAN'
          ? baseJualRekanan
          : baseJualUmum;

        const hargaSugesti = item.hargaSugesti !== undefined ? item.hargaSugesti : defaultSuggested;
        let hargaDeal = item.harga !== undefined && item.harga >= 0 ? item.harga : defaultSuggested;
        if (isPemakaianPengeluaran && hargaDeal === 0 && defaultSuggested > 0) {
          hargaDeal = defaultSuggested;
        }

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

      if (isInternalSale) {
        finalRekeningTujuan = 'INTERNAL_PT';
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (isPemakaianPengeluaran) {
        finalRekeningTujuan = 'PENGELUARAN';
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (isSinkronSale) {
        // SINKRON: Terhitung LUNAS namun TIDAK ada uang fisik masuk ke kas/bank
        finalRekeningTujuan = 'SINKRON';
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
        if (
          params.rekeningTujuan === 'KAS01' ||
          params.rekeningTujuan === 'BON01' ||
          params.rekeningTujuan === 'TIT01' ||
          params.rekeningTujuan === 'SINKRON' ||
          params.rekeningTujuan === 'PENGELUARAN'
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
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (params.metode === 'KASBON') {
        // Barang keluar, customer memiliki piutang, TIDAK ada uang kas masuk
        finalRekeningTujuan = 'BON01';
        statusPembayaran = 'BELUM_BAYAR';
        sisaPiutang = totalNominal;
      }

      // ATURAN DIVISI BARANG TOKO: Semua penjualan barang toko masuk ke 'Wijaya Karya', KECUALI produk berkategori 'OKUSSA' masuk ke 'Okussa'
      const resolveStoreSaleDivisi = (): string => {
        if (isTanpaDivisi(params.divisi)) return TANPA_DIVISI_VALUE;
        if (isInternalSale || isPemakaianPengeluaran) {
          return params.divisi?.trim() || 'Gudang Wijaya Agro';
        }
        const hasOkussa = processedItems.some((it) => {
          const pObj = db.produk.find((x) => String(x.kode || '').trim().toUpperCase() === String(it.kodeProduk || '').trim().toUpperCase());
          return String(pObj?.kategori || '').trim().toUpperCase() === 'OKUSSA';
        });
        const hasNonOkussa = processedItems.some((it) => {
          const pObj = db.produk.find((x) => String(x.kode || '').trim().toUpperCase() === String(it.kodeProduk || '').trim().toUpperCase());
          return String(pObj?.kategori || '').trim().toUpperCase() !== 'OKUSSA';
        });
        if (hasOkussa && !hasNonOkussa) return 'Okussa';
        return 'Wijaya Karya';
      };

      const finalDivisi = resolveStoreSaleDivisi();
      const totalLabaKotor = totalNominal - totalModalHpp;
      const noPenjualan = generateId('PJ');

      // Jika dialirkan ke PENGELUARAN (misal pemakaian SOLAR oleh Inventaris Gudang / Armada),
      // otomatis catat penambahan nominal pengeluaran tanpa mengurangi kas fisik KAS01!
      let idPengeluaranTerkait: string | undefined = undefined;
      let resolvedKategoriPengeluaran: string | undefined = undefined;

      if (isPemakaianPengeluaran) {
        resolvedKategoriPengeluaran =
          params.kategoriPengeluaran?.trim() ||
          processedItems[0]?.namaProduk?.trim() ||
          'SOLAR';

        if (Array.isArray(db.deletedMasterPengeluaranNames) && db.deletedMasterPengeluaranNames.length > 0) {
          const katKey = resolvedKategoriPengeluaran.replace(/\s+/g, '').toUpperCase();
          db.deletedMasterPengeluaranNames = db.deletedMasterPengeluaranNames.filter(
            (n) => String(n || '').replace(/\s+/g, '').toUpperCase() !== katKey
          );
        }

        if (!Array.isArray(db.masterItemPengeluaran)) db.masterItemPengeluaran = [];
        if (
          !db.masterItemPengeluaran.some(
            (m) => m.nama.trim().toUpperCase() === resolvedKategoriPengeluaran!.toUpperCase()
          )
        ) {
          const slug =
            resolvedKategoriPengeluaran
              .replace(/[^a-zA-Z0-9]/g, '')
              .slice(0, 8)
              .toUpperCase() || Date.now().toString().slice(-4);
          db.masterItemPengeluaran.push({
            id: `EXP-${slug}`,
            kode: `EXP-${slug}`,
            nama: resolvedKategoriPengeluaran,
            satuanDefault: processedItems[0]?.satuan,
            deskripsi: 'Item pengeluaran otomatis dari pemakaian stok barang gudang',
            createdAt: iso,
          });
        }

        const nominalPengeluaran = Math.max(0, totalNominal > 0 ? totalNominal : totalModalHpp);
        const rincianStok = processedItems
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan} @ Rp ${it.harga.toLocaleString('id-ID')})`)
          .join(', ');
        const invObj = params.idInventaris
          ? (db.inventaris || []).find((iv) => iv.id === params.idInventaris || iv.kode === params.idInventaris)
          : undefined;
        const invLabel = invObj
          ? ` — Inventaris: ${invObj.namaItem}${invObj.nomorPlat && invObj.nomorPlat !== '-' ? ` (${invObj.nomorPlat})` : ''}`
          : '';

        idPengeluaranTerkait = generateId('EXP');
        const expRecord: TransaksiPengeluaran = {
          idTransaksi: idPengeluaranTerkait,
          tanggal: finalTanggal,
          jam,
          divisi: finalDivisi,
          kategori: resolvedKategoriPengeluaran,
          keterangan:
            params.keterangan?.trim() ||
            `Pemakaian Stok Gudang [${noPenjualan}]: ${rincianStok}${invLabel}`,
          nominal: nominalPengeluaran,
          arahMutasi: 'TAMBAH',
          isNonKas: true,
          idPenjualanStok: noPenjualan,
          rekeningSumber: 'STOK_INTERNAL',
          penerima: params.penerimaPengeluaran?.trim() || invObj?.driverPenanggungJawab || finalMitraNama,
          idInventaris: params.idInventaris || undefined,
          createdAt: iso,
        };
        if (!Array.isArray(db.pengeluaran)) db.pengeluaran = [];
        db.pengeluaran.unshift(expRecord);
      }

      const penjualanRecord: TransaksiPenjualan = {
        noPenjualan,
        tanggal: finalTanggal,
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
        isNotaNgunci: false,
        kategoriPengeluaran: resolvedKategoriPengeluaran,
        idPengeluaranTerkait,
        idInventaris: params.idInventaris || undefined,
        keterangan:
          params.keterangan ||
          (isInternalSale
            ? `Pemakaian Kebutuhan Internal PT Wijaya Agro (Harga Rp 0)`
            : isPemakaianPengeluaran
            ? `Pemakaian Stok Gudang ke Pengeluaran [${resolvedKategoriPengeluaran}]`
            : isSinkronSale
            ? `Penjualan Lunas SINKRON (Tanpa Uang Masuk Kas/Bank)`
            : params.metode === 'KASBON'
            ? `Penjualan Kasbon (${tipePembeli})`
            : `Penjualan Barang Toko (${tipePembeli})`),
        createdAt: iso,
      };

      db.penjualan.unshift(penjualanRecord);

      const logMethodText =
        penjualanRecord.metode === 'INTERNAL_PT'
          ? 'PEMAKAIAN INTERNAL PT (Rp 0)'
          : penjualanRecord.metode === 'PEMAKAIAN_PENGELUARAN'
          ? `PEMAKAIAN STOK -> PENGELUARAN (${resolvedKategoriPengeluaran})`
          : penjualanRecord.metode === 'SINKRON'
          ? 'SINKRON (LUNAS NON-TUNAI)'
          : penjualanRecord.metode;
      this.addAuditLog(
        db,
        'CREATE',
        noPenjualan,
        `Penjualan ${logMethodText} [${tipePembeli} | Divisi: ${finalDivisi} | Rek: ${finalRekeningTujuan}] kepada ${finalMitraNama} (${processedItems.length} item) - Nilai: Rp ${totalNominal.toLocaleString('id-ID')}, Modal HPP: Rp ${totalModalHpp.toLocaleString('id-ID')}`,
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
    tanggal?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'HUTANG' | 'SINKRON';
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
      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);

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
      } else if (params.metodePembayaran === 'SINKRON') {
        finalRekeningSumber = 'SINKRON';
        statusPembayaran = 'LUNAS';
      }

      // ATURAN DIVISI BARANG TOKO: Semua pembelian barang toko masuk ke 'Wijaya Karya', KECUALI produk berkategori 'OKUSSA' masuk ke 'Okussa'
      const resolveStorePurchaseDivisi = (): string => {
        if (isTanpaDivisi(params.divisi)) return TANPA_DIVISI_VALUE;
        if (!isRekapan && processedItems.length > 0) {
          const hasOkussa = processedItems.some((it) => {
            const pObj = db.produk.find((x) => String(x.kode || '').trim().toUpperCase() === String(it.kodeProduk || '').trim().toUpperCase());
            return String(pObj?.kategori || '').trim().toUpperCase() === 'OKUSSA';
          });
          const hasNonOkussa = processedItems.some((it) => {
            const pObj = db.produk.find((x) => String(x.kode || '').trim().toUpperCase() === String(it.kodeProduk || '').trim().toUpperCase());
            return String(pObj?.kategori || '').trim().toUpperCase() !== 'OKUSSA';
          });
          if (hasOkussa && !hasNonOkussa) return 'Okussa';
          return 'Wijaya Karya';
        }
        if (String(params.divisi || '').trim().toLowerCase() === 'okussa') return 'Okussa';
        return 'Wijaya Karya';
      };

      const finalDivisi = resolveStorePurchaseDivisi();
      const noPembelian = generateId('PB');
      const record: TransaksiPembelianBarang = {
        noPembelian,
        tanggal: finalTanggal,
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

    const produkUpperMap = new Map((db.produk || []).map((p) => [String(p.kode || '').trim().toUpperCase(), p]));
    const cleanDiv = (d?: string) => (d && !isExcludedFromDivisi(d) ? d : undefined);
    // ATURAN BARANG TOKO: Semua penjualan & pembelian barang toko masuk ke 'Wijaya Karya', KECUALI produk kategori 'OKUSSA' -> 'Okussa'
    const resolveStoreItemDivNorm = (kodeProduk?: string, fallbackDivisi?: string, metode?: string) => {
      if (isTanpaDivisi(fallbackDivisi)) return '__tanpa_divisi__';
      if (metode === 'INTERNAL_PT') return norm(cleanDiv(fallbackDivisi) || 'PT Wijaya Agro Perkasa');
      const cleanKode = String(kodeProduk || '').trim().toUpperCase();
      if (cleanKode && cleanKode !== 'REKAP-NOTA' && cleanKode !== 'NOTA-SILANG') {
        const prod = produkUpperMap.get(cleanKode);
        if (String(prod?.kategori || '').trim().toUpperCase() === 'OKUSSA') {
          return norm('Okussa');
        }
        return norm('Wijaya Karya');
      }
      if (norm(cleanDiv(fallbackDivisi)) === 'okussa') return norm('Okussa');
      return norm('Wijaya Karya');
    };
    const resolveHasilBumiDivNorm = (divisi?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      return norm(cleanDiv(divisi) || 'Gudang Wijaya Agro');
    };
    const resolveBebanDivNorm = (divisi?: string, rekeningSumber?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      const validDiv = cleanDiv(divisi);
      if (validDiv && String(validDiv).trim()) return norm(validDiv);
      if (rekeningSumber) {
        const mapped = divisiByRekKode.get(String(rekeningSumber).toUpperCase());
        if (mapped) return mapped;
      }
      return norm('PT Wijaya Agro Perkasa');
    };

    const penjualanNotaSharesMap = new Map<string, Array<{ divNorm: string; ratio: number }>>();
    for (const p of db.penjualan || []) {
      if (p.isNotaSilang || p.metode === 'PEMAKAIAN_PENGELUARAN') continue;
      if (p.noPenjualan) {
        const perDiv = new Map<string, number>();
        if (Array.isArray(p.items) && p.items.length > 0) {
          for (const it of p.items) {
            const dn = resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode);
            const sub = Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0);
            perDiv.set(dn, (perDiv.get(dn) || 0) + sub);
          }
        } else {
          const dn = resolveStoreItemDivNorm(undefined, p.divisi, p.metode);
          perDiv.set(dn, Number(p.totalNominal) || 0);
        }
        const sumSub = Array.from(perDiv.values()).reduce((s, v) => s + v, 0) || 1;
        penjualanNotaSharesMap.set(
          p.noPenjualan,
          Array.from(perDiv.entries()).map(([divNorm, val]) => ({ divNorm, ratio: val / sumSub }))
        );
      }
    }
    for (const j of db.penjualanHasilBumi || []) {
      if (j.noPenjualan) {
        penjualanNotaSharesMap.set(j.noPenjualan, [{ divNorm: resolveHasilBumiDivNorm(j.divisi), ratio: 1 }]);
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

      // 1. Pendapatan / Penjualan Divisi (Per-item routing untuk Barang Toko: Wijaya Karya vs Okussa)
      const penjualanTokoDiv: Array<TransaksiPenjualan & { _divSubNominal: number; _divItems: ItemPenjualan[] }> = [];
      for (const p of db.penjualan || []) {
        if (p.metode === 'INTERNAL_PT' || p.metode === 'PEMAKAIAN_PENGELUARAN' || p.isNotaSilang) continue;
        if (Array.isArray(p.items) && p.items.length > 0) {
          const matchingItems = p.items.filter(
            (it) => resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode) === targetNorm
          );
          if (matchingItems.length > 0) {
            const subNom = matchingItems.reduce(
              (s, it) => s + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0)),
              0
            );
            penjualanTokoDiv.push({ ...p, totalNominal: subNom, items: matchingItems, _divSubNominal: subNom, _divItems: matchingItems });
          }
        } else if (resolveStoreItemDivNorm(undefined, p.divisi, p.metode) === targetNorm) {
          const nom = Number(p.totalNominal) || 0;
          penjualanTokoDiv.push({ ...p, _divSubNominal: nom, _divItems: [] });
        }
      }

      const penjualanHbDiv = (db.penjualanHasilBumi || []).filter(
        (j) => resolveHasilBumiDivNorm(j.divisi) === targetNorm
      );

      let omzetPenjualanToko = 0;
      let rawHppToko = 0;
      let piutangToko = 0;
      let kasPenjualanToko = 0;

      for (const p of penjualanTokoDiv) {
        const nom = Number(p.totalNominal) || 0;
        const origTotal = Number((db.penjualan.find((orig) => orig.noPenjualan === p.noPenjualan)?.totalNominal) || nom) || 1;
        const shareRatio = origTotal > 0 ? nom / origTotal : 1;
        omzetPenjualanToko += nom;
        if (p.metode === 'TUNAI' || p.metode === 'TRANSFER') {
          kasPenjualanToko += nom;
        } else if (p.metode === 'KASBON') {
          piutangToko += Math.round((Number(p.sisaPiutang) || 0) * shareRatio);
        }
        const hppNota = (p.items || []).reduce((s, it) => {
          const prod = produkMap.get(it.kodeProduk) || produkUpperMap.get(String(it.kodeProduk || '').trim().toUpperCase());
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
            const shares = penjualanNotaSharesMap.get(alok.refId) || [];
            for (const sh of shares) {
              if (sh.divNorm === targetNorm) {
                const nomAlok = Math.round((Number(alok.nominalDibayar) || 0) * sh.ratio);
                if (nomAlok > 0) {
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
        }
      }

      const brilinkMasukDiv = (db.brilink || []).filter(
        (br) =>
          !isTanpaDivisi(br.divisi) &&
          norm(cleanDiv(br.divisi) || 'BRILink') === targetNorm &&
          br.jenisBrilink === 'TARIK_TUNAI' &&
          (Number(br.nominalAdmin) || 0) > 0
      );
      const brilinkKeluarDiv = (db.brilink || [])
        .filter(
          (br) =>
            !isTanpaDivisi(br.divisi) &&
            norm(cleanDiv(br.divisi) || 'BRILink') === targetNorm &&
            br.jenisBrilink === 'TUKAR_CASH' &&
            (Number(br.nominalAdmin) || 0) > 0
        );
      const adminMasukBrilinkDiv = brilinkMasukDiv.reduce(
        (s, br) => s + (Number(br.nominalAdmin) || 0),
        0
      );
      const adminKeluarBrilinkDiv = brilinkKeluarDiv.reduce(
        (s, br) => s + (Number(br.nominalAdmin) || 0),
        0
      );

      const uangMasukDiv = (db.uangMasuk || []).filter(
        (um) =>
          !isTanpaDivisi(um.divisi) &&
          norm(cleanDiv(um.divisi) || 'PT Wijaya Agro Perkasa') === targetNorm &&
          (Number(um.nominal) || 0) > 0
      );
      const nominalUangMasukDiv = uangMasukDiv.reduce(
        (s, um) => s + (Number(um.nominal) || 0),
        0
      );

      const totalOmzetPenjualan =
        omzetPenjualanToko + omzetPenjualanHasilBumi + adminMasukBrilinkDiv + nominalUangMasukDiv;
      const penjualanKasMasuk =
        kasPenjualanToko +
        kasPenjualanHb +
        pelunasanBonKasDiv +
        adminMasukBrilinkDiv +
        nominalUangMasukDiv;
      const piutangPenjualanAktif = piutangToko + piutangHb;
      const jumlahNotaPenjualan =
        penjualanTokoDiv.length +
        penjualanHbDiv.length +
        brilinkMasukDiv.length +
        uangMasukDiv.length;

      // Pembelian Divisi (Per-item routing untuk Barang Toko: Wijaya Karya vs Okussa)
      const pembelianBarangDiv: TransaksiPembelianBarang[] = [];
      for (const pb of db.pembelianBarang || []) {
        if ((Number(pb.totalNominal) || 0) <= 0) continue;
        if (Array.isArray(pb.items) && pb.items.length > 0) {
          const matchingItems = pb.items.filter(
            (it) => resolveStoreItemDivNorm(it.kodeProduk, pb.divisi) === targetNorm
          );
          if (matchingItems.length > 0) {
            const subNom = matchingItems.reduce(
              (s, it) => s + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.hargaBeliSatuan) || 0)),
              0
            );
            pembelianBarangDiv.push({ ...pb, items: matchingItems, totalNominal: subNom });
          }
        } else if (resolveStoreItemDivNorm(undefined, pb.divisi) === targetNorm) {
          pembelianBarangDiv.push(pb);
        }
      }
      const pembelianHbDiv = (db.pembelianHasilBumi || []).filter(
        (phb) =>
          resolveHasilBumiDivNorm(phb.divisi) === targetNorm &&
          phb.komoditasKode !== 'PINJAMAN_DANA' &&
          phb.komoditasKode !== 'TITIP_DANA' &&
          phb.komoditasKode !== 'NOTA_SILANG' &&
          !phb.isNotaSilang &&
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

      const biayaPengeluaranOperasional =
        pengeluaranDiv.reduce((s, ex) => s + (Number(ex.nominal) || 0), 0) +
        adminKeluarBrilinkDiv;
      const biayaGajiKaryawan = gajiDiv.reduce(
        (s, gj) => s + (Number(gj.gajiBersihDibayar) || 0),
        0
      );
      const totalBebanPengeluaran = Math.round(biayaPengeluaranOperasional + biayaGajiKaryawan);
      const jumlahTransaksiPengeluaran =
        pengeluaranDiv.length + gajiDiv.length + brilinkKeluarDiv.length;

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

      for (const br of brilinkMasukDiv) {
        rawRincian.push({
          id: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam,
          arus: 'MASUK',
          kategori: 'PENJUALAN',
          keterangan: `BRILink Adm Tarik Tunai${br.nominalPokok > 0 ? ` (Pokok Rp ${br.nominalPokok.toLocaleString('id-ID')})` : ''}: ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan,
          metode: br.rekeningAdmin,
          nominal: Number(br.nominalAdmin) || 0,
          _ts: toTimestamp(br.tanggal, br.jam, br.createdAt),
        });
      }

      for (const um of uangMasukDiv) {
        rawRincian.push({
          id: um.idTransaksi,
          tanggal: um.tanggal,
          jam: um.jam,
          arus: 'MASUK',
          kategori: 'PENJUALAN',
          keterangan: `Uang Masuk (${um.kategori})${um.noPenjualanHasilBumi ? ` [${um.noPenjualanHasilBumi}]` : ''}: ${um.keterangan}`,
          pihakTerkait: um.namaPengirim,
          metode: um.metode,
          nominal: Number(um.nominal) || 0,
          _ts: toTimestamp(um.tanggal, um.jam, um.createdAt),
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

      for (const br of brilinkKeluarDiv) {
        rawRincian.push({
          id: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam,
          arus: 'KELUAR',
          kategori: 'BEBAN_PENGELUARAN',
          keterangan: `BRILink Adm Tukar Cash PT${br.nominalPokok > 0 ? ` (Pokok Rp ${br.nominalPokok.toLocaleString('id-ID')})` : ''}: ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan,
          metode: br.rekeningAdmin,
          nominal: Number(br.nominalAdmin) || 0,
          _ts: toTimestamp(br.tanggal, br.jam, br.createdAt),
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
        penjualanTokoKasDiv.length +
        penjualanHbKasDiv.length +
        pelunasanEntriesDiv.length +
        brilinkMasukDiv.length +
        uangMasukDiv.length;
      const jumlahTransaksiKeluar =
        pembelianBarangKasDiv.length +
        pembelianHbKasDiv.length +
        pengeluaranDiv.length +
        gajiDiv.length +
        brilinkKeluarDiv.length;

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
    tanggal?: string;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP' | 'SINKRON';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal || params.tanggalNotaLalu, tanggal);

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

      if (Array.isArray(db.deletedHasilBumiKodes) && db.deletedHasilBumiKodes.length > 0) {
        const activeKeys = new Set([komoditas.kode.toUpperCase(), komoditas.nama.trim().toUpperCase()]);
        db.deletedHasilBumiKodes = db.deletedHasilBumiKodes.filter(
          (k) => !activeKeys.has(String(k || '').trim().toUpperCase())
        );
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
      } else if (params.metodePembayaran === 'SINKRON') {
        finalRekeningSumber = 'SINKRON';
        status = 'LUNAS';
      }

      // Add to Hasil Bumi Stock (stock enters warehouse immediately)
      komoditas.stok += beratBersih;
      komoditas.updateTerakhir = iso;

      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : params.divisi?.trim() || 'Gudang Wijaya Agro';
      const noPembelian = generateId('PHB');
      const pembelianRecord: TransaksiPembelianHasilBumi = {
        noPembelian,
        tanggal: finalTanggal,
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
  // 2A-KERANJANG. PEMBELIAN HASIL BUMI MULTI-KOMODITAS (KERANJANG 1 PETANI)
  // Arus divisi otomatis lari ke Gudang Wijaya Agro semua
  // ==========================================
  public static async processBatchPembelianHasilBumi(params: {
    idMitra?: string;
    namaPetaniManual?: string;
    teleponPetaniManual?: string;
    alamatPetaniManual?: string;
    isNotaLalu?: boolean;
    noNotaLalu?: string;
    tanggalNotaLalu?: string;
    tanggal?: string;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP' | 'SINKRON';
    rekeningSumber?: string;
    fotoNota?: string;
    keterangan?: string;
    items: Array<{
      komoditasKode?: string;
      namaKomoditasBaru?: string;
      beratKotor: number;
      potonganRafaksi: number;
      hargaPerKg: number;
      isBelumPutusHarga?: boolean;
      keteranganItem?: string;
    }>;
  }): Promise<{
    batchId: string;
    records: TransaksiPembelianHasilBumi[];
    totalNominal: number;
    totalNominalDibayarSekarang: number;
    totalBeratBersih: number;
    totalBayarBatch: number;
    totalNettoBatch: number;
    divisi: string;
  }> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal || params.tanggalNotaLalu, tanggal);

      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      if (!Array.isArray(db.mitra)) db.mitra = [];
      if (!Array.isArray(db.pembelianHasilBumi)) db.pembelianHasilBumi = [];

      if (!Array.isArray(params.items) || params.items.length === 0) {
        throw new Error('Keranjang komoditas hasil bumi tidak boleh kosong');
      }

      let finalMitraId = 'UMUM';
      let finalMitraNama = params.namaPetaniManual?.trim() || 'Petani Umum';

      if (params.idMitra && params.idMitra !== 'UMUM') {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) throw new Error('Petani / supplier terdaftar tidak ditemukan');
        if (mitra.status !== 'AKTIF') throw new Error(`Petani / supplier ${mitra.nama} berstatus NONAKTIF`);
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

      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : params.divisi?.trim() || 'Gudang Wijaya Agro';
      const batchId = generateId('BHB');

      type PreparedCartRow = {
        komoditas: StokHasilBumi;
        beratKotor: number;
        potonganRafaksi: number;
        beratBersih: number;
        hargaPerKg: number;
        totalNominal: number;
        isBelumPutus: boolean;
        keteranganItem?: string;
      };

      const preparedRows: PreparedCartRow[] = [];
      let totalNominalAll = 0;
      let totalNominalDibayarSekarang = 0;
      let totalBeratBersih = 0;

      for (let i = 0; i < params.items.length; i++) {
        const it = params.items[i];
        let komoditas = it.komoditasKode
          ? db.stokHasilBumi.find((k) => k.kode === it.komoditasKode)
          : undefined;

        if (it.namaKomoditasBaru && it.namaKomoditasBaru.trim()) {
          const cleanKomNama = it.namaKomoditasBaru.trim();
          komoditas = db.stokHasilBumi.find((k) => k.nama.toLowerCase() === cleanKomNama.toLowerCase());
          if (!komoditas) {
            const cleanKode =
              it.komoditasKode?.trim().toUpperCase() || `HB-${Math.floor(100 + Math.random() * 900)}`;
            komoditas = {
              kode: cleanKode,
              nama: cleanKomNama,
              satuan: 'Kg',
              stok: 0,
              hargaBeliStandar: it.hargaPerKg || 0,
              updateTerakhir: iso,
            };
            db.stokHasilBumi.push(komoditas);
          }
        }

        if (!komoditas) {
          throw new Error(`Item #${i + 1}: Komoditas hasil bumi belum dipilih`);
        }

        if (Array.isArray(db.deletedHasilBumiKodes) && db.deletedHasilBumiKodes.length > 0) {
          const activeKeys = new Set([komoditas.kode.toUpperCase(), komoditas.nama.trim().toUpperCase()]);
          db.deletedHasilBumiKodes = db.deletedHasilBumiKodes.filter(
            (k) => !activeKeys.has(String(k || '').trim().toUpperCase())
          );
        }

        if (!it.beratKotor || it.beratKotor <= 0) {
          throw new Error(`Item ${komoditas.nama}: Berat kotor timbangan harus lebih dari 0 kg`);
        }
        const rafaksi = Number(it.potonganRafaksi) || 0;
        if (rafaksi < 0 || rafaksi >= 100) {
          throw new Error(`Item ${komoditas.nama}: Potongan rafaksi harus antara 0% dan 99.9%`);
        }

        const isBelumPutus = Boolean(
          it.isBelumPutusHarga ||
            it.komoditasKode === 'HB-08' ||
            komoditas.isBelumPutusHarga ||
            komoditas.nama.toLowerCase().includes('titip')
        );

        if (!isBelumPutus && (!it.hargaPerKg || it.hargaPerKg <= 0)) {
          throw new Error(`Item ${komoditas.nama}: Harga beli per kg harus > Rp 0 (atau aktifkan Belum Putus Harga)`);
        }

        const beratBersih = Math.round(it.beratKotor * (1 - rafaksi / 100) * 100) / 100;
        const totalNominal = isBelumPutus ? 0 : Math.round(beratBersih * (it.hargaPerKg || 0));

        totalNominalAll += totalNominal;
        if (!isBelumPutus && params.metodePembayaran !== 'TITIP' && params.metodePembayaran !== 'SINKRON') {
          totalNominalDibayarSekarang += totalNominal;
        }
        totalBeratBersih = Math.round((totalBeratBersih + beratBersih) * 100) / 100;

        preparedRows.push({
          komoditas,
          beratKotor: it.beratKotor,
          potonganRafaksi: rafaksi,
          beratBersih,
          hargaPerKg: isBelumPutus ? 0 : it.hargaPerKg || 0,
          totalNominal,
          isBelumPutus,
          keteranganItem: it.keteranganItem,
        });
      }

      // Validasi & mutasi saldo kas/bank 1x gabungan untuk item yang dibayar TUNAI/TRANSFER
      let paidRekeningKode = 'TIT01';
      if (params.metodePembayaran === 'TUNAI') {
        paidRekeningKode = 'KAS01';
        if (totalNominalDibayarSekarang > 0) {
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
          if (kasAcc.saldoSaatIni < totalNominalDibayarSekarang) {
            throw new Error(
              `Saldo kas tidak mencukupi untuk total keranjang Rp ${totalNominalDibayarSekarang.toLocaleString(
                'id-ID'
              )} (Saldo KAS01: Rp ${kasAcc.saldoSaatIni.toLocaleString('id-ID')})`
            );
          }
          kasAcc.saldoSaatIni -= totalNominalDibayarSekarang;
        }
      } else if (params.metodePembayaran === 'TRANSFER') {
        if (!params.rekeningSumber) {
          throw new Error('Rekening bank sumber transfer wajib dipilih');
        }
        if (
          params.rekeningSumber === 'BON01' ||
          params.rekeningSumber === 'TIT01' ||
          params.rekeningSumber === 'KAS01' ||
          params.rekeningSumber === 'SINKRON'
        ) {
          throw new Error('Pilih rekening bank sumber transfer yang valid (bukan Kas Tunai / Virtual)');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana.`
          );
        }
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        if (
          !this.isAnakPerusahaanRekening(bankAcc) &&
          totalNominalDibayarSekarang > 0 &&
          bankAcc.saldoSaatIni < totalNominalDibayarSekarang
        ) {
          throw new Error(
            `Saldo rekening ${bankAcc.nama} tidak mencukupi untuk total keranjang Rp ${totalNominalDibayarSekarang.toLocaleString(
              'id-ID'
            )} (Saldo: Rp ${bankAcc.saldoSaatIni.toLocaleString('id-ID')})`
          );
        }
        if (totalNominalDibayarSekarang > 0) {
          bankAcc.saldoSaatIni -= totalNominalDibayarSekarang;
        }
        paidRekeningKode = bankAcc.kode;
      } else if (params.metodePembayaran === 'SINKRON') {
        paidRekeningKode = 'SINKRON';
      }

      const createdRecords: TransaksiPembelianHasilBumi[] = [];

      // Simpan setiap komoditas keranjang dengan nomor timbangan berurutan
      for (let idx = 0; idx < preparedRows.length; idx++) {
        const row = preparedRows[idx];
        row.komoditas.stok += row.beratBersih;
        row.komoditas.updateTerakhir = iso;

        const rowMetode: 'TUNAI' | 'TRANSFER' | 'TITIP' | 'SINKRON' = row.isBelumPutus
          ? 'TITIP'
          : params.metodePembayaran;
        const rowRekening =
          row.isBelumPutus || params.metodePembayaran === 'TITIP'
            ? 'TIT01'
            : params.metodePembayaran === 'SINKRON'
            ? 'SINKRON'
            : paidRekeningKode;
        const rowStatus: TransaksiPembelianHasilBumi['status'] = row.isBelumPutus
          ? 'BELUM_PUTUS_HARGA'
          : params.metodePembayaran === 'TITIP'
          ? 'TITIP'
          : 'LUNAS';

        const noPembelian =
          preparedRows.length === 1 ? generateId('PHB') : `${batchId}-${String(idx + 1).padStart(2, '0')}`;

        const rec: TransaksiPembelianHasilBumi = {
          noPembelian,
          batchId,
          tanggal: finalTanggal,
          jam,
          idMitra: finalMitraId,
          namaMitra: finalMitraNama,
          komoditasKode: row.komoditas.kode,
          komoditasNama: row.komoditas.nama,
          beratKotor: row.beratKotor,
          potonganRafaksi: row.potonganRafaksi,
          beratBersih: row.beratBersih,
          hargaPerKg: row.hargaPerKg,
          totalNominal: row.totalNominal,
          divisi: finalDivisi,
          metodePembayaran: rowMetode,
          rekeningSumber: rowRekening,
          status: rowStatus,
          isBelumPutusHarga: row.isBelumPutus,
          statusHarga: row.isBelumPutus ? 'BELUM_PUTUS_HARGA' : 'HARGA_PUTUS',
          fotoNota: params.fotoNota || '',
          keterangan:
            row.keteranganItem?.trim() ||
            params.keterangan?.trim() ||
            (row.isBelumPutus
              ? `Pembelian ${row.komoditas.nama} dari ${finalMitraNama} [Keranjang ${batchId}] - Belum Putus Harga`
              : `Pembelian ${row.komoditas.nama} dari ${finalMitraNama} [Keranjang ${batchId}]`),
          createdAt: iso,
        };

        createdRecords.push(rec);
      }

      // Masukkan ke db.pembelianHasilBumi (terbaru di atas namun urutan item keranjang tetap rapi)
      for (let i = createdRecords.length - 1; i >= 0; i--) {
        db.pembelianHasilBumi.unshift(createdRecords[i]);
      }

      const ringkasanKom = createdRecords
        .map((r) => `${r.komoditasNama} (${r.beratBersih} Kg)`)
        .join(', ');
      this.addAuditLog(
        db,
        'CREATE',
        batchId,
        `Pembelian Keranjang Hasil Bumi (${createdRecords.length} komoditas: ${ringkasanKom}) dari ${finalMitraNama} [Divisi: ${finalDivisi} | Rek: ${paidRekeningKode}] - Total: Rp ${totalNominalAll.toLocaleString('id-ID')}`,
        totalNominalAll,
        paidRekeningKode
      );

      return {
        batchId,
        records: createdRecords,
        totalNominal: totalNominalAll,
        totalNominalDibayarSekarang,
        totalBeratBersih,
        totalBayarBatch: totalNominalAll,
        totalNettoBatch: totalBeratBersih,
        divisi: finalDivisi,
      };
    });
  }

  // ==========================================
  // 2B-HAPUS. HAPUS / BATALKAN TRANSAKSI PEMBELIAN HASIL BUMI & REKONSILIASI SALDO AWAL KASIR = Rp 0
  // ==========================================
  public static computeNetMutasiKasirLedger(
    db: ReturnType<typeof dbManager.get>,
    kodeKasir = 'KAS01',
    includeOpname = true
  ): number {
    let net = 0;

    // 1. Penjualan Toko Tunai
    for (const p of db.penjualan || []) {
      if (
        p.metode === 'KASBON' ||
        p.metode === 'SINKRON' ||
        p.metode === 'INTERNAL_PT' ||
        p.metode === 'PEMAKAIAN_PENGELUARAN' ||
        p.isNotaSilang ||
        p.rekeningTujuan === 'INTERNAL_PT' ||
        p.rekeningTujuan === 'SINKRON' ||
        p.rekeningTujuan === 'PENGELUARAN'
      ) {
        continue;
      }
      const nom = Math.round(Number(p.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = p.rekeningTujuan || (p.metode === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || p.metode === 'TUNAI') net += nom;
    }

    // 2. Penjualan Hasil Bumi Tunai
    for (const j of db.penjualanHasilBumi || []) {
      if (
        j.metodePembayaran === 'PIUTANG' ||
        j.metodePembayaran === 'BELUM_PUTUS_HARGA' ||
        j.metodePembayaran === 'SINKRON' ||
        j.rekeningTujuan === 'SINKRON'
      ) {
        continue;
      }
      const nom = Math.round(Number(j.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = j.rekeningTujuan || (j.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || j.metodePembayaran === 'TUNAI') net += nom;
    }

    // 3. Uang Masuk Tunai
    for (const um of db.uangMasuk || []) {
      if (um.metode === 'SINKRON' || um.rekeningTujuan === 'SINKRON') continue;
      const nom = Math.round(Number(um.nominal) || 0);
      if (nom <= 0) continue;
      const rekKode = um.rekeningTujuan || (um.metode === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || um.metode === 'TUNAI') net += nom;
    }

    // 4. Setoran Bayar Bon Tunai
    for (const b of db.bayarBon || []) {
      if (
        b.metode === 'SINKRON' ||
        b.metode === 'KOMPENSASI_TITIP' ||
        b.metode === 'POTONG_GAJI' ||
        b.isKompensasiTitipan ||
        b.isPotongGaji ||
        b.rekeningTujuan === 'SINKRON' ||
        b.rekeningTujuan === 'KOMPENSASI_TITIP' ||
        b.rekeningTujuan === 'POTONG_GAJI'
      ) {
        continue;
      }
      const nom = Math.round(Number(b.nominalBayar) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningTujuan || (b.metode === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || b.metode === 'TUNAI') net += nom;
    }

    // 5. Pinjaman Dana Masuk dari Mitra ke Kasir
    for (const b of db.pembelianHasilBumi || []) {
      const isPinjamanDana =
        b.komoditasKode === 'PINJAMAN_DANA' || Boolean(b.komoditasNama?.includes('Pinjaman Uang'));
      if (!isPinjamanDana) continue;
      if (!b.rekeningSumber || b.rekeningSumber === 'TIT01') continue;
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom > 0 && b.rekeningSumber === kodeKasir) net += nom;
    }

    // 6. BRILink (Admin & Pokok di Kasir)
    for (const br of db.brilink || []) {
      const nomAdmin = Math.round(Number(br.nominalAdmin) || 0);
      const nomPokok = Math.round(Number(br.nominalPokok) || 0);
      const rekAdm = br.rekeningAdmin || kodeKasir;
      const kasPokokKode = br.rekeningKasTunai || kodeKasir;
      if (br.jenisBrilink === 'TARIK_TUNAI') {
        if (rekAdm === kodeKasir && nomAdmin > 0) net += nomAdmin;
        if (kasPokokKode === kodeKasir && nomPokok > 0) net -= nomPokok;
      } else {
        if (rekAdm === kodeKasir && nomAdmin > 0) net -= nomAdmin;
        if (kasPokokKode === kodeKasir && nomPokok > 0) net += nomPokok;
      }
    }

    // 7. Pembelian Hasil Bumi Tunai
    for (const b of db.pembelianHasilBumi || []) {
      if (
        b.metodePembayaran === 'TITIP' ||
        b.metodePembayaran === 'SINKRON' ||
        b.rekeningSumber === 'SINKRON' ||
        b.komoditasKode === 'PINJAMAN_DANA' ||
        b.komoditasKode === 'TITIP_DANA' ||
        b.komoditasKode === 'NOTA_SILANG' ||
        b.isNotaSilang ||
        b.komoditasNama?.includes('Pinjaman Uang')
      ) {
        continue;
      }
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningSumber || (b.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || b.metodePembayaran === 'TUNAI') net -= nom;
    }

    // 8. Pengeluaran Operasional Kasir
    for (const p of db.pengeluaran || []) {
      if (p.isNonKas || p.rekeningSumber === 'SINKRON' || p.rekeningSumber === 'STOK_INTERNAL') continue;
      const rawNom = Math.round(Number(p.nominal) || 0);
      if (rawNom === 0) continue;
      const rekKode = p.rekeningSumber || kodeKasir;
      if (rekKode === kodeKasir) net -= rawNom;
    }

    // 9. Kasbon Uang Tunai
    for (const k of db.kasbonUang || []) {
      if (k.isNotaLalu || k.rekeningSumber === 'BON01' || k.rekeningSumber === 'SINKRON' || k.metode === 'SINKRON') {
        continue;
      }
      const nom = Math.round(Number(k.nominal) || 0);
      if (nom <= 0) continue;
      const rekKode = k.rekeningSumber || (k.metode === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || k.metode === 'TUNAI') net -= nom;
    }

    // 10. Kulakan Barang Toko Tunai
    for (const b of db.pembelianBarang || []) {
      if (b.metodePembayaran === 'HUTANG' || b.metodePembayaran === 'SINKRON' || b.rekeningSumber === 'SINKRON') {
        continue;
      }
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningSumber || (b.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || b.metodePembayaran === 'TUNAI') net -= nom;
    }

    // 11. Pencairan Titipan Tunai
    for (const pt of db.pencairanTitipan || []) {
      if (
        pt.metodePembayaran === 'SINKRON' ||
        pt.metodePembayaran === 'KOMPENSASI_BON' ||
        pt.rekeningSumber === 'SINKRON' ||
        pt.isKompensasiBon
      ) {
        continue;
      }
      const nom = Math.round(Number(pt.nominalPencairan) || 0);
      if (nom <= 0) continue;
      const rekKode = pt.rekeningSumber || (pt.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      if (rekKode === kodeKasir || pt.metodePembayaran === 'TUNAI') net -= nom;
    }

    // 12. Penggajian Karyawan Tunai Kasir
    for (const g of db.penggajian || []) {
      if (g.metodePembayaran === 'SINKRON' || g.rekeningSumber === 'SINKRON') continue;
      const nom = Math.round(Number(g.gajiBersihDibayar) || 0);
      if (nom <= 0) continue;
      if (this.isKasirPayrollRecord(db, g, kodeKasir)) net -= nom;
    }

    // 13. Transfer Antar Rekening Masuk / Keluar Kasir
    for (const t of db.transferRekening || []) {
      if (t.status && t.status !== 'BERHASIL') continue;
      const nom = Math.round(Number(t.nominal) || 0);
      if (nom <= 0) continue;
      if (t.rekeningTujuan === kodeKasir) net += nom;
      if (t.rekeningSumber === kodeKasir) net -= nom;
    }

    // 14. Cash Opname Adjustments
    if (includeOpname) {
      for (const op of db.cashOpnameLogs || []) {
        if (op.sesuaikanSaldoSistem && op.selisih) {
          net += Math.round(Number(op.selisih) || 0);
        }
      }
    }

    return Math.round(net);
  }

  public static async resetSaldoAwalKasirKeNol(params?: {
    resetOpname?: boolean;
  }): Promise<{
    kodeKasir: string;
    saldoSebelum: number;
    saldoSesudah: number;
    selisihDikoreksi: number;
    saldoAwalKasir: number;
  }> {
    return await dbManager.executeTransaction((db) => {
      const kasirAcc = db.rekening.find((r) => r.kode === 'KAS01');
      if (!kasirAcc) throw new Error('Rekening Kas Utama Kasir (KAS01) tidak ditemukan');

      const resetOpname = params?.resetOpname !== false;
      if (resetOpname && Array.isArray(db.cashOpnameLogs)) {
        for (const op of db.cashOpnameLogs) {
          op.sesuaikanSaldoSistem = false;
        }
      }

      const saldoSebelum = Math.round(Number(kasirAcc.saldoSaatIni) || 0);
      kasirAcc.saldoAwal = 0;
      const saldoSesudah = this.computeNetMutasiKasirLedger(db, 'KAS01', !resetOpname);
      const selisihDikoreksi = saldoSesudah - saldoSebelum;
      kasirAcc.saldoSaatIni = saldoSesudah;

      this.addAuditLog(
        db,
        'UPDATE',
        'SYNC-KAS01-NOL',
        `Sinkronisasi Saldo Awal Kasir (KAS01) = Rp 0: Saldo sistem disesuaikan dari Rp ${saldoSebelum.toLocaleString(
          'id-ID'
        )} menjadi Rp ${saldoSesudah.toLocaleString('id-ID')} (Koreksi selisih awal: Rp ${selisihDikoreksi.toLocaleString(
          'id-ID'
        )})`,
        Math.abs(selisihDikoreksi),
        'KAS01'
      );

      return {
        kodeKasir: 'KAS01',
        saldoSebelum,
        saldoSesudah,
        selisihDikoreksi,
        saldoAwalKasir: 0,
      };
    });
  }

  public static async deletePembelianHasilBumi(
    noPembelian: string
  ): Promise<{ deleted: TransaksiPembelianHasilBumi }> {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      const cleanNo = String(noPembelian || '').trim();
      if (!cleanNo) throw new Error('Nomor transaksi pembelian hasil bumi wajib diisi');

      if (!Array.isArray(db.pembelianHasilBumi)) {
        throw new Error('Data pembelian hasil bumi kosong');
      }

      const idx = db.pembelianHasilBumi.findIndex((p) => p.noPembelian === cleanNo);
      if (idx === -1) {
        throw new Error(`Transaksi Pembelian Hasil Bumi "${cleanNo}" tidak ditemukan`);
      }

      const target = db.pembelianHasilBumi[idx];

      // Jika transaksi ini bagian dari Nota Silang, batalkan pasangan Nota Silang di penjualan agar tetap sinkron
      if ((target.isNotaSilang || target.komoditasKode === 'NOTA_SILANG') && target.idNotaSilangRef) {
        db.penjualan = (db.penjualan || []).filter((p) => p.noPenjualan !== target.idNotaSilangRef);
      }

      // 1. Kembalikan stok gudang hasil bumi jika transaksi menambah berat bersih fisik
      const beratBersih = Number(target.beratBersih) || 0;
      if (
        beratBersih > 0 &&
        target.komoditasKode !== 'PINJAMAN_DANA' &&
        target.komoditasKode !== 'TITIP_DANA' &&
        target.komoditasKode !== 'NOTA_SILANG' &&
        !target.isNotaSilang
      ) {
        const kom = (db.stokHasilBumi || []).find(
          (k) =>
            String(k.kode || '').trim().toUpperCase() === String(target.komoditasKode || '').trim().toUpperCase() ||
            String(k.nama || '').trim().toUpperCase() === String(target.komoditasNama || '').trim().toUpperCase()
        );
        if (kom) {
          kom.stok = Math.max(0, Math.round((Number(kom.stok || 0) - beratBersih) * 100) / 100);
          kom.updateTerakhir = iso;
        }
      }

      // 2. Kembalikan saldo kas/rekening jika transaksi sebelumnya menggerakkan uang riil
      const nom = Math.round(Number(target.totalNominal) || 0);
      const isPinjamanDana =
        target.komoditasKode === 'PINJAMAN_DANA' || Boolean(target.komoditasNama?.includes('Pinjaman Uang'));

      if (isPinjamanDana) {
        if (
          target.rekeningSumber &&
          target.rekeningSumber !== 'TIT01' &&
          target.rekeningSumber !== 'BON01' &&
          target.rekeningSumber !== 'SINKRON'
        ) {
          const rek = db.rekening.find((r) => r.kode === target.rekeningSumber);
          if (rek && !rek.isVirtual) {
            rek.saldoSaatIni -= nom;
          }
        }
      } else if (
        !target.isBelumPutusHarga &&
        nom > 0 &&
        target.metodePembayaran !== 'TITIP' &&
        target.metodePembayaran !== 'SINKRON' &&
        target.rekeningSumber !== 'TIT01' &&
        target.rekeningSumber !== 'BON01' &&
        target.rekeningSumber !== 'SINKRON'
      ) {
        const rekKode = target.rekeningSumber || (target.metodePembayaran === 'TUNAI' ? 'KAS01' : '');
        if (rekKode) {
          const rek = db.rekening.find((r) => r.kode === rekKode);
          if (rek && !rek.isVirtual) {
            rek.saldoSaatIni += nom;
          }
        }
      }

      // 3. Hapus record dari daftar Pembelian Hasil Bumi
      db.pembelianHasilBumi.splice(idx, 1);

      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'VOID',
        cleanNo,
        `Hapus / Pembatalan Pembelian Hasil Bumi ${cleanNo} (${target.komoditasNama} - ${target.namaMitra}, ${beratBersih} Kg, Rp ${nom.toLocaleString(
          'id-ID'
        )}) — Stok gudang & saldo rekening telah dikembalikan`,
        nom,
        target.rekeningSumber || 'KAS01'
      );

      return { deleted: target };
    });
  }

  // ==========================================
  // 2C. PEMBUKUAN NOTA SILANG (MITRA AMBIL BARANG DI ANAK PERUSAHAAN MIS. DP PARABOT)
  // PT hanya sebagai perantara / penanggung jawab:
  // 1) Mitra Pengambil tercatat Piutang / Bon ke PT (+debet pada Rekening Mitra)
  // 2) Anak Perusahaan (DP Parabot) tercatat Hak / JML UANG (+totalTitip pada Rekening DP Parabot, mengurangi piutang PT di DP Parabot)
  // 3) Saat Mitra melunasi bon ke PT, hanya melunaskan hutang Mitra ke PT; buku DP Parabot TIDAK ikut dilunasi!
  // ==========================================
  public static async processNotaSilang(params: {
    idMitra?: string;
    idMitraPengambil?: string;
    idMitraAnakPerusahaan?: string;
    modeNotaSilang?: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA';
    tanggal?: string;
    noNotaToko?: string;
    items: NotaSilangItemInput[];
    keterangan?: string;
    fotoNota?: string;
  }): Promise<
    NotaSilangRecordSummary & {
      penjualanMitra: TransaksiPenjualan;
      bukuAnakPerusahaan: TransaksiPembelianHasilBumi;
      mitraPengambilNama: string;
      anakPerusahaanNama: string;
    }
  > {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: todayDmy, jam, iso } = getWIBDateTime();

      const resolvedIdMitraPengambil = String(params.idMitraPengambil || params.idMitra || '').trim();
      if (!resolvedIdMitraPengambil) {
        throw new Error('Pilih Mitra pengambil barang terlebih dahulu');
      }
      const mitra = db.mitra.find((m) => m.id === resolvedIdMitraPengambil);
      if (!mitra) {
        throw new Error('Data Mitra pengambil barang tidak ditemukan');
      }
      if (mitra.status !== 'AKTIF') {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }

      const modeNotaSilang: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA' =
        params.modeNotaSilang === 'SESAMA_MITRA' ? 'SESAMA_MITRA' : 'ANAK_PERUSAHAAN';

      // Cari Pihak Penyedia Barang / Kredit:
      // - Fokus Utama ('ANAK_PERUSAHAAN'): Anak Perusahaan seperti DP Parabot (default MTR-DPPARABOT)
      // - Opsi ('SESAMA_MITRA'): Mitra rekanan penyedia barang/jasa lainnya
      const anakPerusahaan =
        modeNotaSilang === 'SESAMA_MITRA'
          ? params.idMitraAnakPerusahaan
            ? db.mitra.find((m) => m.id === params.idMitraAnakPerusahaan)
            : undefined
          : params.idMitraAnakPerusahaan
          ? db.mitra.find((m) => m.id === params.idMitraAnakPerusahaan)
          : db.mitra.find(
              (m) =>
                m.id === 'MTR-DPPARABOT' ||
                m.isAnakPerusahaan ||
                m.role === 'ANAK_PERUSAHAAN' ||
                m.nama.toLowerCase().includes('dp parabot') ||
                m.nama.toLowerCase().includes('devi parabot')
            );

      if (!anakPerusahaan) {
        throw new Error(
          modeNotaSilang === 'SESAMA_MITRA'
            ? 'Pilih Mitra Penyedia Barang / Pihak Kredit untuk Nota Silang Sesama Mitra'
            : 'Akun Anak Perusahaan (misal DP Parabot) tidak ditemukan di Master Mitra'
        );
      }
      if (anakPerusahaan.id === mitra.id) {
        throw new Error('Mitra pengambil tidak boleh sama dengan pihak penyedia barang pada Nota Silang');
      }

      if (!Array.isArray(params.items) || params.items.length === 0) {
        throw new Error('Keranjang barang Nota Silang wajib berisi minimal 1 item (Nama Barang, Qty, Harga)');
      }

      const normalizedItems: Array<{
        namaBarang: string;
        qty: number;
        satuan: string;
        harga: number;
        subtotal: number;
      }> = [];
      let totalNominal = 0;

      for (let i = 0; i < params.items.length; i++) {
        const raw = params.items[i];
        const namaBarang = String(raw.namaBarang || '').trim();
        const qty = Number(raw.qty) || 0;
        const harga = Math.round(Number(raw.harga) || 0);
        const satuan = String(raw.satuan || 'PCS').trim().toUpperCase() || 'PCS';

        if (!namaBarang) {
          throw new Error(`Baris #${i + 1}: Nama barang tidak boleh kosong`);
        }
        if (qty <= 0) {
          throw new Error(`Barang "${namaBarang}": Qty harus lebih dari 0`);
        }
        if (harga <= 0) {
          throw new Error(`Barang "${namaBarang}": Harga satuan harus lebih dari Rp 0`);
        }

        const subtotal = Math.round(qty * harga);
        totalNominal += subtotal;
        normalizedItems.push({ namaBarang, qty, satuan, harga, subtotal });
      }

      // Normalisasi tanggal input ke DD/MM/YYYY
      let finalTanggal = todayDmy;
      if (params.tanggal && params.tanggal.trim()) {
        const cleanTgl = params.tanggal.trim();
        const parts = cleanTgl.split(/[-/]/);
        if (parts.length === 3) {
          finalTanggal =
            parts[0].length === 4
              ? `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`
              : `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
      }

      const noNotaSilang = generateId('NSL');
      const noRefAnakPerusahaan = `${noNotaSilang}-${modeNotaSilang === 'SESAMA_MITRA' ? 'MTR' : 'DPP'}`;
      const cleanNoNotaToko = params.noNotaToko?.trim() || '';
      const rincianRingkas = normalizedItems
        .map((it) => `${it.namaBarang}${it.qty > 1 ? ` (${it.qty} ${it.satuan})` : ''}`)
        .join(', ');
      const finalKeterangan = params.keterangan?.trim() || rincianRingkas;

      // 1. BUKU MITRA PENGAMBIL:
      // Dicatat sebagai Piutang / Bon Mitra ke PT (tanpa memotong stok PT & tanpa uang keluar kasir)
      const penjualanItems: ItemPenjualan[] = normalizedItems.map((it) => ({
        kodeProduk: 'NOTA-SILANG',
        namaProduk: it.namaBarang,
        satuan: it.satuan,
        qty: it.qty,
        hargaBeli: it.harga,
        hargaSugesti: it.harga,
        harga: it.harga,
        subtotal: it.subtotal,
        labaKotor: 0,
      }));

      const labelPrefix =
        modeNotaSilang === 'SESAMA_MITRA'
          ? `Nota Silang Sesama Mitra (${anakPerusahaan.nama})`
          : `Nota Silang ${anakPerusahaan.nama}`;

      const tambahanMusiman = Math.max(
        0,
        Math.round(Number((params as any).tambahanHargaMusiman) || 0)
      );
      const totalNominalMitra = totalNominal + tambahanMusiman;

      const mitraBonRecord: TransaksiPenjualan = {
        noPenjualan: noNotaSilang,
        tanggal: finalTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        tipePembeli: 'REKANAN',
        divisi: 'PT Wijaya Agro Perkasa',
        metode: 'KASBON',
        rekeningTujuan: 'BON01',
        items: penjualanItems,
        totalModalHpp: totalNominal,
        totalNominal: totalNominalMitra,
        totalLabaKotor: tambahanMusiman,
        statusPembayaran: 'BELUM_BAYAR',
        sisaPiutang: totalNominalMitra,
        isNotaNgunci: false,
        isNotaSilang: true,
        modeNotaSilang,
        idMitraAnakPerusahaan: anakPerusahaan.id,
        namaAnakPerusahaan: anakPerusahaan.nama,
        noNotaToko: cleanNoNotaToko || undefined,
        fotoNota: params.fotoNota || undefined,
        keterangan: `${labelPrefix}${cleanNoNotaToko ? ` (#${cleanNoNotaToko})` : ''}: ${finalKeterangan}`,
        createdAt: iso,
      };
      db.penjualan.unshift(mitraBonRecord);

      // 2. BUKU ANAK PERUSAHAAN ATAU MITRA PENYEDIA:
      // Dicatat pada sisi JML UANG / Hak atas nama Mitra Pengambil
      const anakPerusahaanCreditRecord: TransaksiPembelianHasilBumi = {
        noPembelian: noRefAnakPerusahaan,
        tanggal: finalTanggal,
        jam,
        idMitra: anakPerusahaan.id,
        namaMitra: anakPerusahaan.nama,
        komoditasKode: 'NOTA_SILANG',
        komoditasNama: mitra.nama.toUpperCase(),
        beratKotor: 0,
        potonganRafaksi: 0,
        beratBersih: 0,
        hargaPerKg: 0,
        totalNominal,
        divisi: 'PT Wijaya Agro Perkasa',
        metodePembayaran: 'TITIP',
        rekeningSumber: 'TIT01',
        status: 'TITIP',
        isBelumPutusHarga: false,
        statusHarga: 'HARGA_PUTUS',
        fotoNota: params.fotoNota || '',
        isNotaSilang: true,
        modeNotaSilang,
        idNotaSilangRef: noNotaSilang,
        idMitraPengambil: mitra.id,
        namaMitraPengambil: mitra.nama,
        noNotaToko: cleanNoNotaToko || undefined,
        itemsNotaSilang: normalizedItems,
        keterangan: `${mitra.nama.toUpperCase()} — ${finalKeterangan}${cleanNoNotaToko ? ` [Nota #${cleanNoNotaToko}]` : ''}`,
        createdAt: iso,
      };
      db.pembelianHasilBumi.unshift(anakPerusahaanCreditRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noNotaSilang,
        `Nota Silang (${modeNotaSilang === 'SESAMA_MITRA' ? 'Sesama Mitra' : 'Anak Perusahaan'}): Mitra "${mitra.nama}" ambil barang dari "${anakPerusahaan.nama}" (${normalizedItems.length} item: ${rincianRingkas}) senilai Rp ${totalNominal.toLocaleString('id-ID')} — Piutang ${mitra.nama} ke PT bertambah & Hak/Jml Uang ${anakPerusahaan.nama} bertambah.`,
        totalNominal,
        'BON01'
      );

      dbManager.synchronizeVirtualAccounts();

      return {
        noNotaSilang,
        noRefAnakPerusahaan,
        modeNotaSilang,
        tanggal: finalTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        idMitraAnakPerusahaan: anakPerusahaan.id,
        namaAnakPerusahaan: anakPerusahaan.nama,
        noNotaToko: cleanNoNotaToko || undefined,
        items: normalizedItems,
        totalNominal,
        sisaPiutangMitra: totalNominal,
        statusPiutangMitra: 'BELUM_BAYAR',
        keterangan: finalKeterangan,
        fotoNota: params.fotoNota,
        createdAt: iso,
        penjualanMitra: mitraBonRecord,
        bukuAnakPerusahaan: anakPerusahaanCreditRecord,
        mitraPengambilNama: mitra.nama,
        anakPerusahaanNama: anakPerusahaan.nama,
      };
    });
  }

  public static getNotaSilangList(): NotaSilangRecordSummary[] {
    const db = dbManager.get();
    const silangSales = (db.penjualan || []).filter((p) => Boolean(p.isNotaSilang));
    return silangSales.map((p) => {
      const paired = (db.pembelianHasilBumi || []).find(
        (b) =>
          b.idNotaSilangRef === p.noPenjualan ||
          b.noPembelian === `${p.noPenjualan}-DPP` ||
          b.noPembelian === `${p.noPenjualan}-MTR`
      );
      const idTujuan = p.idMitraAnakPerusahaan || paired?.idMitra || 'MTR-DPPARABOT';
      const mitraTujuanObj = (db.mitra || []).find((m) => m.id === idTujuan);
      const isAnak =
        idTujuan === 'MTR-DPPARABOT' ||
        Boolean(mitraTujuanObj?.isAnakPerusahaan) ||
        mitraTujuanObj?.role === 'ANAK_PERUSAHAAN' ||
        Boolean(mitraTujuanObj?.nama?.toLowerCase().includes('parabot'));
      const resolvedMode: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA' =
        p.modeNotaSilang || paired?.modeNotaSilang || (isAnak ? 'ANAK_PERUSAHAAN' : 'SESAMA_MITRA');
      return {
        noNotaSilang: p.noPenjualan,
        noRefAnakPerusahaan: paired?.noPembelian || `${p.noPenjualan}-DPP`,
        modeNotaSilang: resolvedMode,
        tanggal: p.tanggal,
        jam: p.jam,
        idMitra: p.idMitra,
        namaMitra: p.namaMitra,
        idMitraAnakPerusahaan: idTujuan,
        namaAnakPerusahaan: p.namaAnakPerusahaan || paired?.namaMitra || mitraTujuanObj?.nama || 'DP Parabot',
        noNotaToko: p.noNotaToko || paired?.noNotaToko,
        items: (p.items || []).map((it) => ({
          namaBarang: it.namaProduk,
          qty: it.qty,
          satuan: it.satuan || 'PCS',
          harga: it.harga,
          subtotal: it.subtotal,
        })),
        totalNominal: p.totalNominal,
        sisaPiutangMitra: p.sisaPiutang || 0,
        statusPiutangMitra: p.statusPembayaran,
        keterangan: p.keterangan,
        fotoNota: p.fotoNota || paired?.fotoNota || undefined,
        createdAt: p.createdAt,
      };
    });
  }

  public static async deleteNotaSilang(noNotaSilang: string): Promise<{ success: boolean; message: string }> {
    return await dbManager.executeTransaction((db) => {
      const baseNo = String(noNotaSilang || '').replace(/-(DPP|MTR)$/i, '').trim();
      const pIdx = (db.penjualan || []).findIndex(
        (p) => (p.noPenjualan === noNotaSilang || p.noPenjualan === baseNo) && Boolean(p.isNotaSilang)
      );
      if (pIdx === -1) {
        throw new Error(`Data Nota Silang ${noNotaSilang} tidak ditemukan`);
      }
      const target = db.penjualan[pIdx];
      const realNo = target.noPenjualan;
      if ((target.sisaPiutang || 0) < target.totalNominal) {
        throw new Error(
          `Nota Silang ${realNo} sudah memiliki riwayat angsuran/pelunasan dari mitra sehingga tidak dapat dihapus langsung.`
        );
      }

      db.penjualan.splice(pIdx, 1);
      db.pembelianHasilBumi = (db.pembelianHasilBumi || []).filter(
        (b) =>
          !(
            b.idNotaSilangRef === realNo ||
            b.noPembelian === `${realNo}-DPP` ||
            b.noPembelian === `${realNo}-MTR`
          )
      );

      this.addAuditLog(
        db,
        'VOID',
        realNo,
        `Pembatalan Nota Silang ${realNo} (${target.namaMitra} <-> ${target.namaAnakPerusahaan || 'DP Parabot'}) senilai Rp ${target.totalNominal.toLocaleString('id-ID')}`,
        target.totalNominal,
        'BON01'
      );

      dbManager.synchronizeVirtualAccounts();
      return { success: true, message: `Nota Silang ${realNo} berhasil dibatalkan` };
    });
  }

  // ==========================================
  // 2B. PUTUS HARGA HASIL BUMI (TITIP PANEN -> HARGA DEAL)
  // Menetapkan harga definitif untuk hasil panen yang sebelumnya Belum Putus Harga
  // ==========================================
  public static async putusHargaHasilBumi(params: {
    noPembelian: string;
    hargaDealPerKg: number;
    tanggal?: string;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP' | 'SINKRON';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);
      const record = db.pembelianHasilBumi.find((p) => p.noPembelian === params.noPembelian);
      if (!record) throw new Error(`Transaksi pembelian ${params.noPembelian} tidak ditemukan`);
      if (params.hargaDealPerKg <= 0) throw new Error('Harga deal per kg harus lebih dari Rp 0');

      const totalNominalBaru = Math.round(record.beratBersih * params.hargaDealPerKg);
      record.hargaPerKg = params.hargaDealPerKg;
      record.totalNominal = totalNominalBaru;
      record.statusHarga = 'HARGA_PUTUS';
      record.isBelumPutusHarga = false;
      record.tanggalPutusHarga = `${finalTanggal} ${jam}`;
      if (params.divisi !== undefined) {
        record.divisi = isTanpaDivisi(params.divisi)
          ? TANPA_DIVISI_VALUE
          : params.divisi.trim() || 'Gudang Wijaya Agro';
      } else if (!record.divisi) {
        record.divisi = 'Gudang Wijaya Agro';
      }
      record.keterangan = params.keterangan
        ? params.keterangan
        : `${record.keterangan} - (Harga diputus pada ${finalTanggal} @ Rp ${params.hargaDealPerKg.toLocaleString('id-ID')}/Kg)`;

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
      } else if (params.metodePembayaran === 'SINKRON') {
        record.metodePembayaran = 'SINKRON';
        record.rekeningSumber = 'SINKRON';
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
   * Helper: Filter hanya transaksi pembelian hasil bumi fisik (bukan Pinjaman Dana / Titip Dana Nota Lalu / Nota Silang 0 Kg)
   */
  public static isPhysicalPembelianHasilBumi(p?: TransaksiPembelianHasilBumi): boolean {
    if (!p) return false;
    if (
      p.komoditasKode === 'PINJAMAN_DANA' ||
      p.komoditasKode === 'TITIP_DANA' ||
      p.komoditasKode === 'NOTA_SILANG' ||
      p.isNotaSilang
    ) {
      return false;
    }
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
    hargaJualPerKg?: number;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'PIUTANG' | 'BELUM_PUTUS_HARGA' | 'SINKRON';
    rekeningTujuan?: string;
    noSuratJalan?: string;
    tanggal?: string;
    keterangan?: string;
    allowOverStockMuat?: boolean;
    isHabisMuatSusut?: boolean;
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

      const isBelumPutusHarga = params.metodePembayaran === 'BELUM_PUTUS_HARGA';
      const beratKotor = Number(params.beratKotor) || 0;
      const potonganRafaksi = Number(params.potonganRafaksi) || 0;
      const rawHargaJualInput = Number(params.hargaJualPerKg) || 0;

      if (beratKotor <= 0) {
        throw new Error('Berat timbangan jual / muat harus lebih dari 0 Kg');
      }
      if (potonganRafaksi < 0 || potonganRafaksi >= 100) {
        throw new Error('Potongan rafaksi harus antara 0% dan 99.9%');
      }
      if (!isBelumPutusHarga && rawHargaJualInput <= 0) {
        throw new Error('Harga jual per Kg harus lebih dari Rp 0');
      }

      const beratBersih = Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;
      if (beratBersih <= 0) {
        throw new Error('Berat bersih hasil timbangan harus lebih dari 0 Kg');
      }

      const stokTersedia = Math.max(0, Number(komoditas.stok) || 0);
      const allowOverStock = isBelumPutusHarga || Boolean(params.allowOverStockMuat);
      if (!allowOverStock && stokTersedia < beratBersih) {
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

      const computedAvgModal =
        totalKgBeli > 0 && totalUangBeli > 0
          ? Math.round(totalUangBeli / totalKgBeli)
          : Math.max(0, Number(komoditas.rataRataModalAwal) || 0);

      const modalRataRataPerKg =
        computedAvgModal > 0 ? computedAvgModal : Math.max(0, Math.round(rawHargaJualInput));

      const hargaJualPerKg = isBelumPutusHarga ? modalRataRataPerKg : rawHargaJualInput;
      const totalModalHpp = Math.round(beratBersih * modalRataRataPerKg);
      const nilaiModalPengurangStok = totalModalHpp;
      const tonaseAkhirParam = Math.max(0, Number((params as any).tonaseAkhir) || 0);
      const beratPenentuHarga =
        tonaseAkhirParam > 0
          ? Math.round(tonaseAkhirParam * (1 - potonganRafaksi / 100) * 100) / 100
          : beratBersih;
      const totalNominal = isBelumPutusHarga
        ? 0
        : Math.round(beratPenentuHarga * hargaJualPerKg);
      const labaKotor = isBelumPutusHarga ? 0 : totalNominal - totalModalHpp;

      // Update Rekening Penerima / Piutang / Menunggu Uang Masuk
      let finalRekeningTujuan = '';
      let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' | 'MENUNGGU_UANG_MASUK' = 'LUNAS';
      let sisaPiutang = 0;

      if (isBelumPutusHarga) {
        finalRekeningTujuan = 'MENUNGGU_UANG_MASUK';
        statusPembayaran = 'MENUNGGU_UANG_MASUK';
        sisaPiutang = 0;
      } else if (params.metodePembayaran === 'TUNAI') {
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
          params.rekeningTujuan === 'SINKRON' ||
          params.rekeningTujuan === 'MENUNGGU_UANG_MASUK'
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
      } else if (params.metodePembayaran === 'SINKRON') {
        finalRekeningTujuan = 'SINKRON';
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      }

      // Kurangi Stok Fisik Ready Gudang (+ opsi Habis Muat / Susut)
      const stokGudangSebelum = stokTersedia;
      const selisihTimbangMuatKg =
        beratBersih > stokTersedia ? Math.round((beratBersih - stokTersedia) * 100) / 100 : 0;
      const isHabisMuatSusutFlag = Boolean(params.isHabisMuatSusut || beratBersih >= stokTersedia);
      const beratSusutKg =
        beratBersih > stokTersedia
          ? selisihTimbangMuatKg
          : params.isHabisMuatSusut && stokTersedia > beratBersih
            ? Math.round((stokTersedia - beratBersih) * 100) / 100
            : 0;
      const stokGudangSetelah = isHabisMuatSusutFlag
        ? 0
        : Math.max(0, Math.round((stokTersedia - beratBersih) * 100) / 100);
      komoditas.stok = stokGudangSetelah;
      komoditas.updateTerakhir = iso;

      const finalTanggal = normalizeDateToDmy(params.tanggal, todayWib);
      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : params.divisi?.trim() || 'PT Wijaya Agro Perkasa';
      const noPenjualan = generateId('JHB');
      const defaultKet = isBelumPutusHarga
        ? `Muat / Jual ${komoditas.nama} (${beratBersih.toLocaleString('id-ID')} Kg @ Rata-Rata Beli Rp ${modalRataRataPerKg.toLocaleString('id-ID')}/Kg) kepada ${finalMitraNama} — Uang Hasil Penjualan Lewat Uang Masuk`
        : `Penjualan Hasil Bumi ${komoditas.nama} (${beratBersih.toLocaleString('id-ID')} Kg) kepada ${finalMitraNama}`;

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
        ...(tonaseAkhirParam > 0
          ? {
              tonaseAkhir: tonaseAkhirParam,
              susutPerjalananKg: Math.round((beratKotor - tonaseAkhirParam) * 100) / 100,
            }
          : {}),
        modalRataRataPerKg,
        totalModalHpp,
        nilaiModalPengurangStok,
        hargaJualPerKg,
        totalNominal,
        labaKotor,
        divisi: finalDivisi,
        metodePembayaran: params.metodePembayaran,
        rekeningTujuan: finalRekeningTujuan,
        statusPembayaran,
        sisaPiutang,
        isNotaNgunci: false,
        isBelumPutusHargaJual: isBelumPutusHarga,
        selisihTimbangMuatKg,
        isHabisMuatSusut: isHabisMuatSusutFlag,
        beratSusutKg,
        nominalUangMasukTerkumpul: isBelumPutusHarga ? 0 : totalNominal,
        statusUangMasuk: isBelumPutusHarga ? 'BELUM_MASUK' : 'LUNAS',
        idUangMasukList: [],
        noSuratJalan: params.noSuratJalan?.trim() || '',
        stokGudangSebelum,
        stokGudangSetelah,
        keterangan: params.keterangan?.trim() || defaultKet,
        createdAt: iso,
      };

      db.penjualanHasilBumi.unshift(record);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'CREATE',
        noPenjualan,
        isBelumPutusHarga
          ? `Muat / Jual Hasil Bumi Belum Putus Harga ${komoditas.nama} [Divisi: ${finalDivisi}]: ${beratBersih.toLocaleString(
              'id-ID'
            )} Kg @ Rata-Rata Beli Rp ${modalRataRataPerKg.toLocaleString('id-ID')}/Kg (Pengurang Stok: Rp ${nilaiModalPengurangStok.toLocaleString(
              'id-ID'
            )}) kepada ${finalMitraNama}. Sisa Ready Gudang: ${stokGudangSetelah.toLocaleString('id-ID')} Kg`
          : `Penjualan Hasil Bumi ${komoditas.nama} [Divisi: ${finalDivisi} | Rek: ${finalRekeningTujuan}]: ${beratBersih.toLocaleString(
              'id-ID'
            )} Kg @ Rp ${hargaJualPerKg.toLocaleString('id-ID')}/Kg kepada ${finalMitraNama} (${
              params.metodePembayaran
            }). Sisa Ready Gudang: ${stokGudangSetelah.toLocaleString('id-ID')} Kg`,
        isBelumPutusHarga ? nilaiModalPengurangStok : totalNominal,
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

      if (
        record.metodePembayaran === 'BELUM_PUTUS_HARGA' &&
        ((Number(record.nominalUangMasukTerkumpul) || 0) > 0 ||
          (Array.isArray(record.idUangMasukList) && record.idUangMasukList.length > 0))
      ) {
        throw new Error(
          `Nota Muat / Jual ${noPenjualan} sudah menerima pencairan di menu Uang Masuk. Batalkan transaksi Uang Masuk terkait terlebih dahulu.`
        );
      }

      // Kembalikan stok fisik yang benar-benar terpotong dari gudang
      const komoditas = (db.stokHasilBumi || []).find(
        (k) =>
          k.kode === record.komoditasKode ||
          k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
      );
      if (komoditas) {
        const stokDikembalikan =
          record.stokGudangSebelum !== undefined && record.stokGudangSetelah !== undefined
            ? Math.max(0, Math.round((record.stokGudangSebelum - record.stokGudangSetelah) * 100) / 100)
            : record.beratBersih;
        komoditas.stok = Math.round(((Number(komoditas.stok) || 0) + stokDikembalikan) * 100) / 100;
        komoditas.updateTerakhir = iso;
      }

      // Kembalikan saldo rekening jika pembayaran langsung tunai/transfer
      if (
        (record.metodePembayaran === 'TUNAI' || record.metodePembayaran === 'TRANSFER') &&
        record.rekeningTujuan &&
        (Number(record.totalNominal) || 0) > 0
      ) {
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
        record.totalNominal || record.nilaiModalPengurangStok || record.totalModalHpp || 0,
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
      const terjualBulanIniOmzet = jualBulanIni.reduce(
        (s, j) =>
          s +
          (j.metodePembayaran === 'BELUM_PUTUS_HARGA'
            ? Number(j.nominalUangMasukTerkumpul) || 0
            : Number(j.totalNominal) || 0),
        0
      );
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
        terjualOmzet += jualBulan.reduce(
          (s, j) =>
            s +
            (j.metodePembayaran === 'BELUM_PUTUS_HARGA'
              ? Number(j.nominalUangMasukTerkumpul) || 0
              : Number(j.totalNominal) || 0),
          0
        );
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
    metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    rekeningSumber?: string;
    nominal: number;
    tanggal?: string;
    keterangan?: string;
    fotoNota?: string;
  }): Promise<TransaksiKasbonUang> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);

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

      const isSinkron = params.metode === 'SINKRON' || params.rekeningSumber === 'SINKRON';
      let rekeningSumberKode = '';
      let rekeningSumberNama = 'Rekening SINKRON (Non-Kas)';

      if (isSinkron) {
        rekeningSumberKode = 'SINKRON';
      } else {
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
        rekeningSumberKode = rekeningSumber.kode;
        rekeningSumberNama = rekeningSumber.nama;
      }

      const idTransaksi = generateId('KBU');
      const kasbonUangRecord: TransaksiKasbonUang = {
        idTransaksi,
        tanggal: finalTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        jenisTransaksi: 'KASBON UANG',
        metode: isSinkron ? 'SINKRON' : params.metode,
        rekeningSumber: rekeningSumberKode,
        nominal: params.nominal,
        sisaKasbon: params.nominal,
        keterangan:
          params.keterangan ||
          (isSinkron
            ? `Pencatatan Kasbon Uang SINKRON (Tanpa Uang Riil Keluar) kepada ${mitra.nama}`
            : `Pemberian Kasbon Uang Operasional Tani kepada ${mitra.nama}`),
        status: 'BELUM LUNAS',
        isNotaNgunci: false,
        fotoNota: params.fotoNota || '',
        createdAt: iso,
      };

      db.kasbonUang.unshift(kasbonUangRecord);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'CREATE',
        idTransaksi,
        `Kasbon Uang diberikan kepada ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString(
          'id-ID'
        )} dari ${rekeningSumberNama} (${rekeningSumberKode}) via ${kasbonUangRecord.metode}`,
        params.nominal,
        rekeningSumberKode
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
    isNotaNgunci?: boolean;
    catatanNgunci?: string;
  }): Promise<{ record: any; tipe: string; mitraNama: string; nominal: number; isNotaNgunci?: boolean }> {
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
        const isNgunci = Boolean(params.isNotaNgunci);
        const cleanCatatanNgunci = isNgunci
          ? (params.catatanNgunci || '').trim() || 'Mitra memiliki piutang namun sudah tidak ada respon & kepastian membayar'
          : undefined;
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
          isNotaNgunci: isNgunci,
          tanggalNgunci: isNgunci ? tanggal : undefined,
          catatanNgunci: cleanCatatanNgunci,
          createdAt: iso,
        };

        db.kasbonUang.unshift(kasbonRecord);

        if (isNgunci) {
          mitra.isNotaNgunci = true;
          mitra.tanggalNgunci = tanggal;
          mitra.catatanNgunci = cleanCatatanNgunci;
        }

        this.addAuditLog(
          db,
          'CREATE',
          idTransaksi,
          `Input Piutang Barang Nota Lalu${isNgunci ? ' [STATUS NOTA NGUNCI]' : ''} untuk ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString('id-ID')} (No Faktur: ${cleanNoNota})`,
          params.nominal,
          'BON01'
        );

        return {
          record: kasbonRecord,
          tipe: 'PIUTANG_BARANG_NOTA_LALU',
          mitraNama: mitra.nama,
          nominal: params.nominal,
          isNotaNgunci: isNgunci,
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

      const isSinkronPinjaman = params.rekeningTujuan === 'SINKRON';
      const rekening = !isSinkronPinjaman
        ? db.rekening.find((r) => r.kode === params.rekeningTujuan)
        : undefined;
      if (!isSinkronPinjaman && !rekening) {
        throw new Error(`Rekening kasir/bank PT "${params.rekeningTujuan}" tidak ditemukan`);
      }

      const cleanTgl = normalizeDateToDmy(params.tanggal, tanggal);
      const noPembelian = generateId('PJM');
      const cleanRef = params.noReferensi ? params.noReferensi.trim() : `PJM-${Date.now().toString().slice(-4)}`;

      // 1. Tambah Saldo Kas / Bank PT hanya jika bukan metode SINKRON
      if (!isSinkronPinjaman && rekening && !rekening.isVirtual) {
        rekening.saldoSaatIni += params.nominal;
      }

      const rekKodeFinal = isSinkronPinjaman ? 'SINKRON' : rekening!.kode;
      const rekNamaFinal = isSinkronPinjaman ? 'Rekening SINKRON (Non-Kas)' : rekening!.nama;

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
        rekeningSumber: rekKodeFinal,
        status: 'TITIP',
        fotoNota: allFotos.join('|||'),
        fotoNotaList: allFotos,
        isNotaLalu: true,
        noNotaLalu: cleanRef,
        tanggalNotaLalu: cleanTgl,
        keterangan: params.keterangan 
          ? params.keterangan.trim() 
          : `Pinjaman uang dari PT ke Mitra ${mitra.nama} (${isSinkronPinjaman ? 'Metode SINKRON Non-Kas' : `Diterima di ${rekNamaFinal}`}, Masuk Saldo Titip Mitra)`,
        createdAt: iso,
      };

      if (!db.pembelianHasilBumi) db.pembelianHasilBumi = [];
      db.pembelianHasilBumi.unshift(pinjamanRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noPembelian,
        `Pinjam uang PT ke Mitra "${mitra.nama}" sebesar Rp ${params.nominal.toLocaleString('id-ID')} via ${rekNamaFinal} (Tercatat di Saldo Titip Mitra - Ref: ${cleanRef})`,
        params.nominal,
        rekKodeFinal
      );

      dbManager.synchronizeVirtualAccounts();

      return {
        record: pinjamanRecord,
        mitraNama: mitra.nama,
        nominal: params.nominal,
        rekeningNama: rekNamaFinal,
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

  private static getMitraNominalNotaNgunci(db: any, mitraId: string): number {
    const mitra = (db.mitra || []).find((m: Mitra) => m.id === mitraId);
    const isNoteNgunci = (flag?: boolean) =>
      flag !== undefined ? Boolean(flag) : Boolean(mitra?.isNotaNgunci);

    const ngunciBarang = (db.penjualan || [])
      .filter(
        (p: TransaksiPenjualan) =>
          p.idMitra === mitraId &&
          p.metode === 'KASBON' &&
          p.statusPembayaran === 'BELUM_BAYAR' &&
          (p.sisaPiutang || 0) > 0 &&
          isNoteNgunci(p.isNotaNgunci)
      )
      .reduce((s: number, p: TransaksiPenjualan) => s + (p.sisaPiutang || 0), 0);

    const ngunciHb = (db.penjualanHasilBumi || [])
      .filter(
        (j: TransaksiPenjualanHasilBumi) =>
          j.idMitra === mitraId &&
          j.metodePembayaran === 'PIUTANG' &&
          j.statusPembayaran === 'BELUM_BAYAR' &&
          (j.sisaPiutang || 0) > 0 &&
          isNoteNgunci(j.isNotaNgunci)
      )
      .reduce((s: number, j: TransaksiPenjualanHasilBumi) => s + (j.sisaPiutang || 0), 0);

    const ngunciUang = (db.kasbonUang || [])
      .filter(
        (k: TransaksiKasbonUang) =>
          k.idMitra === mitraId &&
          k.status !== 'LUNAS' &&
          (k.sisaKasbon || 0) > 0 &&
          isNoteNgunci(k.isNotaNgunci)
      )
      .reduce((s: number, k: TransaksiKasbonUang) => s + (k.sisaKasbon || 0), 0);

    return ngunciBarang + ngunciHb + ngunciUang;
  }

  private static syncMitraNotaNgunciAfterPayment(db: any, mitraId: string): void {
    const mitra = (db.mitra || []).find((m: Mitra) => m.id === mitraId);
    if (!mitra) return;
    const remainingNgunci = this.getMitraNominalNotaNgunci(db, mitraId);
    if (remainingNgunci <= 0 && mitra.isNotaNgunci) {
      mitra.isNotaNgunci = false;
    }
  }

  private static allocateMitraBonFifo(
    db: any,
    mitraId: string,
    amountToAllocate: number,
    options?: { idNotaTarget?: string }
  ): AlokasiPembayaranBon[] {
    if (amountToAllocate <= 0) return [];

    const mitra = (db.mitra || []).find((m: Mitra) => m.id === mitraId);
    const isNoteNgunci = (flag?: boolean) =>
      flag !== undefined ? Boolean(flag) : Boolean(mitra?.isNotaNgunci);
    const cleanTargetId = options?.idNotaTarget ? String(options.idNotaTarget).trim() : '';

    type BonItem = {
      jenis: 'KASBON_BARANG' | 'KASBON_UANG';
      refId: string;
      sisa: number;
      createdAt: string;
      isNgunci: boolean;
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

    // Prioritaskan: (1) Nota spesifik jika dipilih, (2) Nota Kunci (isNgunci=true) agar pembayaran langsung mengurangi nominal uang tidak bisa kembali, (3) FIFO kronologis
    const allBons: BonItem[] = [
      ...outstandingPenjualan.map((p) => ({
        jenis: 'KASBON_BARANG' as const,
        refId: p.noPenjualan,
        sisa: p.sisaPiutang,
        createdAt: p.createdAt,
        isNgunci: isNoteNgunci(p.isNotaNgunci),
        sourceObj: p,
      })),
      ...outstandingPenjualanHb.map((j) => ({
        jenis: 'KASBON_BARANG' as const,
        refId: j.noPenjualan,
        sisa: j.sisaPiutang,
        createdAt: j.createdAt,
        isNgunci: isNoteNgunci(j.isNotaNgunci),
        sourceObj: j,
      })),
      ...outstandingKasbonUang.map((k) => ({
        jenis: 'KASBON_UANG' as const,
        refId: k.idTransaksi,
        sisa: k.sisaKasbon,
        createdAt: k.createdAt,
        isNgunci: isNoteNgunci(k.isNotaNgunci),
        sourceObj: k,
      })),
    ].sort((a, b) => {
      if (cleanTargetId) {
        const aTarget = a.refId === cleanTargetId ? 1 : 0;
        const bTarget = b.refId === cleanTargetId ? 1 : 0;
        if (aTarget !== bTarget) return bTarget - aTarget;
      }
      const aLock = a.isNgunci ? 1 : 0;
      const bLock = b.isNgunci ? 1 : 0;
      if (aLock !== bLock) return bLock - aLock;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

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
        isNotaNgunci: bon.isNgunci,
      });

      remainingPayment -= alokasiNominal;
    }

    this.syncMitraNotaNgunciAfterPayment(db, mitraId);

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
    tanggal?: string;
    keterangan?: string;
    idNotaTarget?: string;
    potongTitipanOtomatis?: boolean;
  }): Promise<TransaksiBayarBon> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);

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
      const sisaNotaNgunciSebelum = this.getMitraNominalNotaNgunci(db, mitra.id);
      const cleanIdNotaTarget = params.idNotaTarget ? String(params.idNotaTarget).trim() : undefined;

      const isSinkronMode =
        params.metode === 'SINKRON' || params.rekeningTujuan === 'SINKRON';

      // =========================================================
      // JALUR 1: METODE SINKRON (PELUNASAN BON TANPA MENGGERAKKAN UANG RIIL KAS/BANK)
      // Jika mitra memiliki Saldo Titipan Hasil Bumi, otomatis memotong saldo titipan tersebut;
      // jika tidak ada titipan, tetap melunasi bon secara SINKRON (Non-Kas).
      // =========================================================
      if (isSinkronMode) {
        if (totalBonKotor <= 0) {
          throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon aktif yang perlu disinkronkan (Rp 0).`);
        }

        if (params.nominalBayar > totalBonKotor) {
          throw new Error(
            `Nominal SINKRON (Rp ${params.nominalBayar.toLocaleString(
              'id-ID'
            )}) melebihi total kewajiban Bon aktif mitra (Rp ${totalBonKotor.toLocaleString('id-ID')}).`
          );
        }

        const nominalPotongDariTitipan =
          saldoTitipanAktif > 0 ? Math.min(params.nominalBayar, saldoTitipanAktif) : 0;

        const idTransaksi = generateId('BYB');

        // 1. Alokasikan pelunasan bon (Prioritas Nota Kunci dulu lalu FIFO) tanpa menyentuh kas/bank fisik sedikit pun
        const alokasiSinkron = this.allocateMitraBonFifo(db, mitra.id, params.nominalBayar, {
          idNotaTarget: cleanIdNotaTarget,
        });
        const sisaBonSetelah = Math.max(0, totalBonKotor - params.nominalBayar);
        const sisaTitipanSetelah = Math.max(0, saldoTitipanAktif - nominalPotongDariTitipan);
        const sisaNotaNgunciSetelah = this.getMitraNominalNotaNgunci(db, mitra.id);
        const nominalPengurangNotaNgunci = Math.max(0, sisaNotaNgunciSebelum - sisaNotaNgunciSetelah);

        const ketSinkron =
          params.keterangan && params.keterangan.trim()
            ? params.keterangan.trim()
            : nominalPotongDariTitipan > 0
            ? `Pelunasan Bon via SINKRON — Potong langsung dari Saldo Titipan / Uang Hasil Bumi Rp ${nominalPotongDariTitipan.toLocaleString('id-ID')} (Sisa Titipan: Rp ${sisaTitipanSetelah.toLocaleString('id-ID')})`
            : `Pelunasan Bon via SINKRON (Tanpa Pergerakan Uang Riil Kas/Bank)`;

        const bayarBonSinkronRecord: TransaksiBayarBon = {
          idTransaksi,
          tanggal: finalTanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: totalBonKotor,
          totalBonAwalKotor: totalBonKotor,
          ...(nominalPotongDariTitipan > 0
            ? { nominalPotongTitipanOtomatis: nominalPotongDariTitipan }
            : {}),
          nominalBayar: params.nominalBayar,
          sisaBonSetelah,
          ...(cleanIdNotaTarget ? { idNotaTarget: cleanIdNotaTarget } : {}),
          ...(sisaNotaNgunciSebelum > 0
            ? {
                sisaNotaNgunciSebelum,
                nominalPengurangNotaNgunci,
                sisaNotaNgunciSetelah,
              }
            : {}),
          metode: 'SINKRON',
          rekeningTujuan: 'SINKRON',
          isKompensasiTitipan: nominalPotongDariTitipan > 0,
          alokasi: alokasiSinkron,
          keterangan: ketSinkron,
          createdAt: iso,
        };

        if (!db.bayarBon) db.bayarBon = [];
        db.bayarBon.unshift(bayarBonSinkronRecord);

        // 2. Jika mitra memiliki Saldo Titipan Hasil Bumi, catat pemotongan pasangan agar saldo titipan berkurang presisi
        if (nominalPotongDariTitipan > 0) {
          if (!db.pencairanTitipan) db.pencairanTitipan = [];
          db.pencairanTitipan.unshift({
            idPencairan: `${idTransaksi}-SINKRON`,
            tanggal: finalTanggal,
            jam,
            idMitra: mitra.id,
            namaMitra: mitra.nama,
            nominalPencairan: nominalPotongDariTitipan,
            rekeningSumber: 'SINKRON',
            saldoTitipanSebelum: saldoTitipanAktif,
            totalTitipanAwalKotor: saldoTitipanAktif,
            nominalPotongBonOtomatis: nominalPotongDariTitipan,
            saldoTitipanSisa: sisaTitipanSetelah,
            metodePembayaran: 'SINKRON',
            isKompensasiBon: true,
            keterangan: `Potong Saldo Titipan / Uang Hasil Bumi via Rekening SINKRON untuk Pelunasan Bon (${idTransaksi})`,
            createdAt: iso,
          });
        }

        dbManager.synchronizeVirtualAccounts();

        this.addAuditLog(
          db,
          'PAYMENT',
          idTransaksi,
          `Pelunasan Bon via SINKRON (${mitra.nama}): Bon Rp ${params.nominalBayar.toLocaleString(
            'id-ID'
          )} diselesaikan tanpa uang keluar/masuk.${
            nominalPotongDariTitipan > 0
              ? ` Dipotong dari Saldo Titipan Rp ${nominalPotongDariTitipan.toLocaleString('id-ID')}.`
              : ''
          }${
            nominalPengurangNotaNgunci > 0
              ? ` [Mengurangi Nominal Nota Kunci Rp ${nominalPengurangNotaNgunci.toLocaleString('id-ID')} -> Sisa Nota Kunci Rp ${sisaNotaNgunciSetelah.toLocaleString('id-ID')}]`
              : ''
          } Sisa Bon: Rp ${sisaBonSetelah.toLocaleString('id-ID')}.`,
          params.nominalBayar,
          'SINKRON'
        );

        return bayarBonSinkronRecord;
      }

      // =========================================================
      // JALUR 2: METODE TUNAI / TRANSFER FISIK (UANG MASUK KE KAS01 / BANK)
      // Default: TIDAK memotong saldo titipan secara paksa kecuali potongTitipanOtomatis === true
      // =========================================================
      const gunakanPotongTitipOtomatis = Boolean(params.potongTitipanOtomatis);
      const nominalPotongTitipEfektif = gunakanPotongTitipOtomatis ? potonganOtomatis : 0;
      const batasMaksBayarBonFisik = gunakanPotongTitipOtomatis ? sisaBonBersih : totalBonKotor;

      if (batasMaksBayarBonFisik <= 0) {
        if (gunakanPotongTitipOtomatis && totalBonKotor > 0 && saldoTitipanAktif >= totalBonKotor) {
          throw new Error(
            `Bon ${mitra.nama} sebesar Rp ${totalBonKotor.toLocaleString(
              'id-ID'
            )} sudah tertutup oleh Saldo Titipan Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
              'id-ID'
            )}. Pilih metode SINKRON / Kliring Silang untuk memotong langsung dari uang titipan tanpa uang fisik!`
          );
        }
        throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon yang harus dibayar saat ini`);
      }

      if (params.nominalBayar > batasMaksBayarBonFisik) {
        throw new Error(
          `Nominal pembayaran tunai/transfer (Rp ${params.nominalBayar.toLocaleString(
            'id-ID'
          )}) melebihi sisa kewajiban piutang mitra (Rp ${batasMaksBayarBonFisik.toLocaleString(
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

      // 1. Hanya potong saldo Titipan jika kasir secara eksplisit meminta potongTitipanOtomatis
      if (nominalPotongTitipEfektif > 0) {
        this.executeAutoCrossOffsetInTx({
          db,
          mitra,
          nominalPotong: nominalPotongTitipEfektif,
          totalBonSebelum: totalBonKotor,
          saldoTitipanSebelum: saldoTitipanAktif,
          tanggal: finalTanggal,
          jam,
          iso,
          refId: idTransaksi,
        });
      }

      // 2. Tambahkan saldo rekening penerima sebesar uang fisik yang disetor
      rekeningTujuan.saldoSaatIni += params.nominalBayar;

      // 3. Alokasi pembayaran fisik terhadap kewajiban bon (Prioritas Nota Kunci dulu lalu FIFO)
      const alokasiList = this.allocateMitraBonFifo(db, mitra.id, params.nominalBayar, {
        idNotaTarget: cleanIdNotaTarget,
      });
      const sisaBonSetelah = Math.max(0, batasMaksBayarBonFisik - params.nominalBayar);
      const sisaNotaNgunciSetelah = this.getMitraNominalNotaNgunci(db, mitra.id);
      const nominalPengurangNotaNgunci = Math.max(0, sisaNotaNgunciSebelum - sisaNotaNgunciSetelah);

      const bayarBonRecord: TransaksiBayarBon = {
        idTransaksi,
        tanggal: finalTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        totalBonSebelum: batasMaksBayarBonFisik,
        ...(nominalPotongTitipEfektif > 0
          ? {
              totalBonAwalKotor: totalBonKotor,
              nominalPotongTitipanOtomatis: nominalPotongTitipEfektif,
            }
          : {}),
        nominalBayar: params.nominalBayar,
        sisaBonSetelah,
        ...(cleanIdNotaTarget ? { idNotaTarget: cleanIdNotaTarget } : {}),
        ...(sisaNotaNgunciSebelum > 0
          ? {
              sisaNotaNgunciSebelum,
              nominalPengurangNotaNgunci,
              sisaNotaNgunciSetelah,
            }
          : {}),
        metode: params.metode,
        rekeningTujuan: rekeningTujuan.kode,
        alokasi: alokasiList,
        keterangan:
          params.keterangan ||
          (nominalPotongTitipEfektif > 0
            ? `Pelunasan Sisa Bon ${mitra.nama} ke ${rekeningTujuan.nama} (setelah Sinkron Titipan Rp ${nominalPotongTitipEfektif.toLocaleString(
                'id-ID'
              )})`
            : `Pembayaran Bon ${mitra.nama} ke ${rekeningTujuan.nama}`),
        createdAt: iso,
      };

      db.bayarBon.unshift(bayarBonRecord);
      dbManager.synchronizeVirtualAccounts();

      const logNgunciInfo =
        nominalPengurangNotaNgunci > 0
          ? ` [Otomatis Mengurangi Nominal Nota Kunci Rp ${nominalPengurangNotaNgunci.toLocaleString(
              'id-ID'
            )} -> Sisa Nota Kunci Rp ${sisaNotaNgunciSetelah.toLocaleString('id-ID')}]`
          : '';

      this.addAuditLog(
        db,
        'PAYMENT',
        idTransaksi,
        nominalPotongTitipEfektif > 0
          ? `Pembayaran Sisa Bon oleh ${mitra.nama}: Bon Awal Rp ${totalBonKotor.toLocaleString(
              'id-ID'
            )} dipotong Sinkron Titipan Hasil Bumi Rp ${nominalPotongTitipEfektif.toLocaleString(
              'id-ID'
            )}, dibayar tunai/transfer Rp ${params.nominalBayar.toLocaleString('id-ID')} masuk ke ${
              rekeningTujuan.nama
            }.${logNgunciInfo} Sisa bon: Rp ${sisaBonSetelah.toLocaleString('id-ID')}`
          : `Pembayaran Bon oleh ${mitra.nama}: Rp ${params.nominalBayar.toLocaleString(
              'id-ID'
            )} masuk ke ${rekeningTujuan.nama}.${logNgunciInfo} Sisa kewajiban bon: Rp ${sisaBonSetelah.toLocaleString('id-ID')}`,
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
    tanggal?: string;
    keterangan: string;
  }): Promise<TransaksiTransferRekening> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);

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
          ? `Transfer Pembayaran / Talangan dari ${sumberAcc.nama} ke Anak Perusahaan ${namaMitraTerkait} (Dicatat sebagai Piutang Anak Perusahaan ke Perusahaan)`
          : tipeMutasiAfiliasi === 'TARIK_DARI_ANAK_PERUSAHAAN'
          ? `Setoran / Pengembalian Dana dari Anak Perusahaan ${namaMitraTerkait} ke ${tujuanAcc.nama} (Mengurangi Piutang / Menambah Titipan Anak Perusahaan)`
          : 'Pemindahan dana operasional internal';

      const noTransfer = generateId('TRF');
      const transferRecord: TransaksiTransferRekening = {
        noTransfer,
        tanggal: finalTanggal,
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

      if (
        sumberAcc.kode === 'KAS01' &&
        (tujuanAcc.kode === 'BRK01' || /\b(berangkas|brankas)\b/i.test(tujuanAcc.nama || ''))
      ) {
        sumberAcc.saldoSaatIni = 0;
      }

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

  /**
   * Resolusi rekening sumber pembayaran gaji/upah agar SELALU menggunakan rekening riil (KAS01 / Bank / Anak Perusahaan)
   * atau SINKRON (Non-Kas), dan TIDAK PERNAH mendebet Buku Tracking Divisi (OPERASIONAL_DIVISI seperti REK-GWA)
   * yang menyebabkan transaksi gagal (saldo Rp 0) atau tidak mengurangi Kasir Utama (KAS01) pada Arus Kas Harian.
   */
  private static resolvePayrollRekeningSumber(
    db: ReturnType<typeof dbManager.get>,
    rawRekening?: string,
    rawMetode?: string
  ): {
    isSinkron: boolean;
    kode: string;
    nama: string;
    metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    rekeningObj: Rekening | null;
  } {
    const rekInput = String(rawRekening || '').trim();
    const metInput = String(rawMetode || '').trim().toUpperCase();

    if (rekInput === 'BON01' || rekInput === 'TIT01') {
      throw new Error('Rekening virtual BON01 / TIT01 tidak dapat digunakan untuk pembayaran gaji!');
    }

    if (metInput === 'SINKRON' || rekInput === 'SINKRON') {
      return {
        isSinkron: true,
        kode: 'SINKRON',
        nama: 'Rekening SINKRON (Non-Kas)',
        metode: 'SINKRON',
        rekeningObj: null,
      };
    }

    const isRealPayableAccount = (r?: Rekening): r is Rekening =>
      Boolean(
        r &&
          r.status === 'AKTIF' &&
          !r.isVirtual &&
          r.kode !== 'BON01' &&
          r.kode !== 'TIT01' &&
          r.kode !== 'SINKRON' &&
          r.kategori !== 'OPERASIONAL_DIVISI' &&
          (!r.kode.startsWith('REK-') || this.isAnakPerusahaanRekening(r))
      );

    if (metInput === 'TUNAI') {
      const kas = db.rekening.find((r) => r.kode === 'KAS01' && r.status === 'AKTIF');
      if (!kas) {
        throw new Error('Rekening Kas Utama Kasir (KAS01) tidak ditemukan atau sedang nonaktif');
      }
      return {
        isSinkron: false,
        kode: 'KAS01',
        nama: kas.nama,
        metode: 'TUNAI',
        rekeningObj: kas,
      };
    }

    if (metInput === 'TRANSFER') {
      const bank = db.rekening.find((r) => r.kode === rekInput);
      if (!isRealPayableAccount(bank) || bank.kode === 'KAS01') {
        throw new Error(
          'Pilih rekening Bank PT yang valid (misal BRI, BCA, BNI, Mandiri) untuk pembayaran gaji via TRANSFER (bukan Buku Tracking Divisi).'
        );
      }
      return {
        isSinkron: false,
        kode: bank.kode,
        nama: bank.nama,
        metode: 'TRANSFER',
        rekeningObj: bank,
      };
    }

    // Jika metode belum ditentukan secara eksplisit, periksa rekInput:
    // bila mengarah ke OPERASIONAL_DIVISI (REK-GWA dsb.) atau kosong, arahkan otomatis ke Kas Utama Kasir (KAS01)
    const candidate = rekInput ? db.rekening.find((r) => r.kode === rekInput) : undefined;
    if (isRealPayableAccount(candidate)) {
      return {
        isSinkron: false,
        kode: candidate.kode,
        nama: candidate.nama,
        metode: candidate.kode === 'KAS01' ? 'TUNAI' : 'TRANSFER',
        rekeningObj: candidate,
      };
    }

    const fallbackKas = db.rekening.find((r) => r.kode === 'KAS01' && r.status === 'AKTIF');
    if (!fallbackKas) {
      throw new Error('Rekening Kas Utama Kasir (KAS01) tidak ditemukan atau sedang nonaktif');
    }
    return {
      isSinkron: false,
      kode: 'KAS01',
      nama: fallbackKas.nama,
      metode: 'TUNAI',
      rekeningObj: fallbackKas,
    };
  }

  private static getEmployeeOutstandingKasbon(
    db: ReturnType<typeof dbManager.get>,
    mitraId: string
  ): { kasbonBarang: number; kasbonUang: number; totalKasbonAwal: number } {
    const kasbonBarang =
      (db.penjualan || [])
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0) +
      (db.penjualanHasilBumi || [])
        .filter((j) => j.idMitra === mitraId && j.metodePembayaran === 'PIUTANG' && j.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, j) => sum + (j.sisaPiutang || 0), 0);

    const kasbonUang = (db.kasbonUang || [])
      .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
      .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

    return {
      kasbonBarang,
      kasbonUang,
      totalKasbonAwal: kasbonBarang + kasbonUang,
    };
  }

  private static isKasirPayrollRecord(
    db: ReturnType<typeof dbManager.get>,
    g: TransaksiPenggajian,
    kodeKasir = 'KAS01'
  ): boolean {
    if (g.metodePembayaran === 'SINKRON' || g.rekeningSumber === 'SINKRON') return false;
    const rekKode = String(g.rekeningSumber || '').trim();
    if (!rekKode) return g.metodePembayaran === 'TUNAI';
    if (rekKode === kodeKasir) return true;
    const rekObj = (db.rekening || []).find((r) => r.kode === rekKode);
    if (rekObj && rekObj.kategori === 'OPERASIONAL_DIVISI') {
      return g.metodePembayaran === 'TUNAI';
    }
    return false;
  }

  public static async processPenggajian(params: {
    idKaryawan: string;
    divisi?: NamaDivisi | string;
    tipeGaji?: 'HARIAN' | 'BULANAN';
    tanggalKerja?: string;
    tanggalBayar?: string;
    periodeBulan?: string;
    gajiNominal?: number;
    tunjanganNominal?: number;
    bonus?: number;
    lunasiUpahHarianPending?: boolean;
    abaikanUpahHarian?: boolean;
    upahHarianIds?: string[];
    persentasePotongKasbon?: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    rekeningSumber?: string;
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

      const divisi: string = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : (params.divisi && String(params.divisi).trim()) ||
          kry.divisi ||
          kry.departemen ||
          'Gudang Wijaya Agro';
      const tipeGaji: 'HARIAN' | 'BULANAN' = params.tipeGaji || 'HARIAN';
      const targetTanggal = normalizeDateToDmy(params.tanggalBayar || params.tanggalKerja, tanggal);

      const resolvedRek = this.resolvePayrollRekeningSumber(
        db,
        params.rekeningSumber,
        params.metodePembayaran
      );

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

      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const { totalKasbonAwal } = this.getEmployeeOutstandingKasbon(db, mitraId);

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
        !resolvedRek.isSinkron &&
        resolvedRek.rekeningObj &&
        gajiBersihDibayar > 0 &&
        !this.isAnakPerusahaanRekening(resolvedRek.rekeningObj) &&
        resolvedRek.rekeningObj.saldoSaatIni < gajiBersihDibayar
      ) {
        throw new Error(
          `Saldo rekening ${resolvedRek.rekeningObj.nama} (Rp ${resolvedRek.rekeningObj.saldoSaatIni.toLocaleString(
            'id-ID'
          )}) tidak mencukupi untuk pembayaran gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
        );
      }

      let idBayarBonTerkait: string | undefined;

      if (potonganKasbon > 0) {
        const ngunciBefore = this.getMitraNominalNotaNgunci(db, mitraId);
        const alokasiList = this.allocateMitraBonFifo(db, mitraId, potonganKasbon);
        const ngunciAfter = this.getMitraNominalNotaNgunci(db, mitraId);
        const pengurangNgunci = Math.max(0, ngunciBefore - ngunciAfter);

        const idBYB = generateId('BYB');
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          ...(ngunciBefore > 0
            ? {
                sisaNotaNgunciSebelum: ngunciBefore,
                nominalPengurangNotaNgunci: pengurangNgunci,
                sisaNotaNgunciSetelah: ngunciAfter,
              }
            : {}),
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

      if (!resolvedRek.isSinkron && resolvedRek.rekeningObj && gajiBersihDibayar > 0) {
        resolvedRek.rekeningObj.saldoSaatIni -= gajiBersihDibayar;
      }

      const finalRekKode = resolvedRek.kode;
      const finalRekNama = resolvedRek.nama;
      const finalMetode = resolvedRek.metode;

      const sisaKasbonAkhir = totalKasbonAwal - potonganKasbon;
      const idPayroll = generateId('GAJI');
      const slipNomor = `SLIP/WA/${targetTanggal.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

      const periodeFormatted =
        params.periodeBulan ||
        (tipeGaji === 'HARIAN' ? `Harian - ${targetTanggal}` : `Bulanan - ${targetTanggal.slice(3)}`);

      let settledDailyLogs: CatatanUpahHarian[] = [];
      if (
        !params.abaikanUpahHarian &&
        (params.lunasiUpahHarianPending || (params.upahHarianIds && params.upahHarianIds.length > 0))
      ) {
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
        metodePembayaran: finalMetode,
        rekeningSumber: finalRekKode,
        ...(settledDailyLogs.length > 0
          ? {
              jumlahHariKerja: settledDailyLogs.length,
              daftarUpahHarianIds: settledDailyLogs.map((u) => u.id),
            }
          : {}),
        keterangan: params.keterangan || `Gaji ${tipeGaji === 'HARIAN' ? 'Harian' : 'Bulanan'} (${periodeFormatted}) Divisi ${divisi} - ${kry.nama}`,
        idBayarBonTerkait,
      };

      db.penggajian.unshift(payrollRecord);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'PAYROLL',
        idPayroll,
        `Penggajian ${tipeGaji} [${periodeFormatted} | Divisi: ${divisi}] Karyawan ${kry.nama} (${kry.nik}): Upah Kotor Rp ${totalGajiKotor.toLocaleString('id-ID')}, Potong Bon Rp ${potonganKasbon.toLocaleString('id-ID')} (Sisa Bon Rp ${sisaKasbonAkhir.toLocaleString('id-ID')}), Gaji Bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${finalRekNama} (${finalRekKode}) pada tanggal ${targetTanggal}`,
        gajiBersihDibayar,
        finalRekKode
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
      divisi: NamaDivisi | string;
      gajiNominal: number;
      bonus?: number;
      persentasePotongKasbon?: number;
      nominalPotongKustom?: number;
      metodePembayaran?: 'TUNAI' | 'TRANSFER' | 'SINKRON';
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
        metodePembayaran: item.metodePembayaran,
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
    tanggalBayar?: string;
    hariTanggal?: string;
    divisi: NamaDivisi | string;
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
    tugasPekerjaan?: string;
    upahHarian?: number;
    uangMakanLembur?: number;
    modeBayar: 'CATAT_HAK_UPAH' | 'LANGSUNG_CAIR';
    rekeningSumber?: string;
    persentasePotongKasbon?: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER' | 'SINKRON';
  }): Promise<{ catatan: CatatanUpahHarian; slipGaji?: TransaksiPenggajian }> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) throw new Error(`Karyawan dengan ID ${params.idKaryawan} tidak ditemukan`);
      if (kry.status !== 'AKTIF') throw new Error(`Karyawan ${kry.nama} berstatus nonaktif`);

      const tglKerja = normalizeDateToDmy(params.tanggalKerja, tanggal);
      const tglBayar = normalizeDateToDmy(params.tanggalBayar || params.tanggalKerja, tglKerja);
      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : String(params.divisi || kry.divisi || 'Gudang Wijaya Agro').trim();
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
        const { totalKasbonAwal } = this.getEmployeeOutstandingKasbon(db, mitraId);

        let potonganKasbon = 0;
        const persentase = Number(params.persentasePotongKasbon) || 0;
        if (params.nominalPotongKustom && params.nominalPotongKustom > 0) {
          potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpah);
        } else if (persentase > 0 && totalKasbonAwal > 0) {
          potonganKasbon = Math.min(Math.round((totalKasbonAwal * persentase) / 100), totalKasbonAwal, totalUpah);
        }

        const gajiBersihDibayar = totalUpah - potonganKasbon;
        const resolvedRek = this.resolvePayrollRekeningSumber(
          db,
          params.rekeningSumber,
          params.metodePembayaran
        );

        if (
          !resolvedRek.isSinkron &&
          resolvedRek.rekeningObj &&
          gajiBersihDibayar > 0 &&
          !this.isAnakPerusahaanRekening(resolvedRek.rekeningObj) &&
          resolvedRek.rekeningObj.saldoSaatIni < gajiBersihDibayar
        ) {
          throw new Error(
            `Saldo rekening ${resolvedRek.rekeningObj.nama} (Rp ${resolvedRek.rekeningObj.saldoSaatIni.toLocaleString(
              'id-ID'
            )}) tidak mencukupi untuk pembayaran upah bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
          );
        }

        let idBayarBonTerkait: string | undefined;
        if (potonganKasbon > 0) {
          const ngunciBefore = this.getMitraNominalNotaNgunci(db, mitraId);
          const alokasiList = this.allocateMitraBonFifo(db, mitraId, potonganKasbon);
          const ngunciAfter = this.getMitraNominalNotaNgunci(db, mitraId);
          const pengurangNgunci = Math.max(0, ngunciBefore - ngunciAfter);
          const idBYB = generateId('BYB');
          idBayarBonTerkait = idBYB;
          db.bayarBon.unshift({
            ...(ngunciBefore > 0
              ? {
                  sisaNotaNgunciSebelum: ngunciBefore,
                  nominalPengurangNotaNgunci: pengurangNgunci,
                  sisaNotaNgunciSetelah: ngunciAfter,
                }
              : {}),
            idTransaksi: idBYB,
            tanggal: tglBayar,
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
            keterangan: `Potong Upah Harian [${finalDivisi}] Karyawan ${kry.nama}`,
            createdAt: iso,
          });
        }

        if (!resolvedRek.isSinkron && resolvedRek.rekeningObj && gajiBersihDibayar > 0) {
          resolvedRek.rekeningObj.saldoSaatIni -= gajiBersihDibayar;
        }
        const finalRekKode = resolvedRek.kode;
        const idPayroll = generateId('GAJI');
        const slipNomor = `SLIP/WA/${tglBayar.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

        slipGaji = {
          id: idPayroll,
          slipNomor,
          tanggal: tglBayar,
          jam,
          idKaryawan: kry.id,
          nikKaryawan: kry.nik,
          namaKaryawan: kry.nama,
          jabatan: kry.jabatan,
          departemen: kry.departemen,
          divisi: finalDivisi,
          tipeGaji: 'HARIAN',
          periodeBulan: tglBayar !== tglKerja ? `Kerja ${tglKerja} (Cair ${tglBayar})` : `Harian - ${tglKerja}`,
          gajiPokok: hitungJumlah,
          tunjangan: 0,
          bonus: uangMakan,
          totalGajiKotor: totalUpah,
          totalKasbonAwal,
          persentasePotongKasbon: persentase,
          potonganKasbon,
          sisaKasbonAkhir: totalKasbonAwal - potonganKasbon,
          gajiBersihDibayar,
          metodePembayaran: resolvedRek.metode,
          rekeningSumber: finalRekKode,
          jumlahHariKerja: 1,
          daftarUpahHarianIds: [idUph],
          keterangan: `Upah Harian [${finalDivisi}]: ${params.tugasPekerjaan || itemNama}${
            tglBayar !== tglKerja ? ` (Tgl Kerja ${tglKerja}, Dicairkan ${tglBayar})` : ''
          }`,
          idBayarBonTerkait,
        };

        db.penggajian.unshift(slipGaji);
        dbManager.synchronizeVirtualAccounts();

        this.addAuditLog(
          db,
          'PAYROLL',
          idPayroll,
          `Pencairan Upah Harian [${finalDivisi}] ${kry.nama} (${kry.nik}) Tugas: "${params.tugasPekerjaan || itemNama}" (Tgl Kerja: ${tglKerja}, Tgl Cair: ${tglBayar}). Total Rp ${totalUpah.toLocaleString(
            'id-ID'
          )}, Potong Bon Rp ${potonganKasbon.toLocaleString('id-ID')}, Bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${finalRekKode}`,
          gajiBersihDibayar,
          finalRekKode
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
        divisi: finalDivisi as NamaDivisi,
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
        tanggalDibayar: isLangsungCair ? tglBayar : undefined,
        createdAt: iso,
      };

      if (!db.upahHarian) db.upahHarian = [];
      db.upahHarian.unshift(catatan);

      if (!isLangsungCair) {
        this.addAuditLog(
          db,
          'CREATE',
          idUph,
          `Pencatatan Pekerjaan Harian [${finalDivisi}] Karyawan ${kry.nama} (${kry.nik}): "${itemNama}". Hak Upah: Rp ${totalUpah.toLocaleString(
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
      const activeDiv = (kry.divisi || kry.departemen || 'Gudang Wijaya Agro') as NamaDivisi;
      const divisiTerakhir = activeDiv || (lastJob ? lastJob.divisi : ('Gudang Wijaya Agro' as NamaDivisi));

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

      const linkedMtr = db.mitra.find(
        (m) => m.id === mitraId || m.idKaryawanTerkait === kry.id || m.kode === kry.nik
      );

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
        fotoUrl: kry.fotoUrl || linkedMtr?.fotoUrl,
        riwayatDivisi: Array.isArray(kry.riwayatDivisi) ? kry.riwayatDivisi : [],
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
    divisi?: NamaDivisi | string;
    tanggalKerja?: string;
    tanggalBayar?: string;
    upahHarianIds?: string[];
    abaikanUpahHarian?: boolean;
    tipeGaji?: 'HARIAN' | 'BULANAN';
    periodeBulan?: string;
    gajiPokokTambahan?: number;
    tunjangan?: number;
    bonus?: number;
    rekeningSumber?: string;
    persentasePotongKasbon?: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    keterangan?: string;
  }): Promise<TransaksiPenggajian> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const targetTanggal = normalizeDateToDmy(params.tanggalBayar || params.tanggalKerja, tanggal);
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) throw new Error('Karyawan tidak ditemukan');

      let pendingList: CatatanUpahHarian[] = [];
      if (params.abaikanUpahHarian || (Array.isArray(params.upahHarianIds) && params.upahHarianIds.length === 0)) {
        // Mode pembayaran gaji bulan sebelumnya / langsung (misal Gaji Oktober dicairkan 1 Nov tanpa menyentuh absensi berjalan Nov)
        pendingList = [];
      } else {
        pendingList = (db.upahHarian || []).filter(
          (u) => u.idKaryawan === kry.id && u.status === 'TERCATAT'
        );
        if (params.upahHarianIds && params.upahHarianIds.length > 0) {
          const idSet = new Set(params.upahHarianIds);
          pendingList = pendingList.filter((u) => idSet.has(u.id));
        }
      }

      const nominalUpahHarian = pendingList.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const tambahanPokok = Math.max(0, Number(params.gajiPokokTambahan) || 0);
      const tunjangan = Math.max(0, Number(params.tunjangan) || 0);
      const bonus = Math.max(0, Number(params.bonus) || 0);
      const totalUpahKotor = nominalUpahHarian + tambahanPokok + tunjangan + bonus;

      if (totalUpahKotor <= 0) {
        throw new Error(
          'Total gaji/upah yang dibayarkan harus lebih dari Rp 0 (pilih akumulasi hari kerja atau isi nominal gaji bulan sebelumnya).'
        );
      }

      const divisi: string = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : (params.divisi && String(params.divisi).trim()) ||
          pendingList[0]?.divisi ||
          kry.divisi ||
          kry.departemen ||
          'Gudang Wijaya Agro';

      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const { totalKasbonAwal } = this.getEmployeeOutstandingKasbon(db, mitraId);

      let potonganKasbon = 0;
      const persentase = Number(params.persentasePotongKasbon) || 0;
      if (params.nominalPotongKustom !== undefined && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpahKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        potonganKasbon = Math.min(Math.round((totalKasbonAwal * persentase) / 100), totalKasbonAwal, totalUpahKotor);
      }

      const gajiBersihDibayar = totalUpahKotor - potonganKasbon;
      const resolvedRek = this.resolvePayrollRekeningSumber(
        db,
        params.rekeningSumber,
        params.metodePembayaran
      );

      if (
        !resolvedRek.isSinkron &&
        resolvedRek.rekeningObj &&
        gajiBersihDibayar > 0 &&
        !this.isAnakPerusahaanRekening(resolvedRek.rekeningObj) &&
        resolvedRek.rekeningObj.saldoSaatIni < gajiBersihDibayar
      ) {
        throw new Error(
          `Saldo rekening ${resolvedRek.rekeningObj.nama} (Rp ${resolvedRek.rekeningObj.saldoSaatIni.toLocaleString(
            'id-ID'
          )}) tidak mencukupi untuk pembayaran gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
        );
      }

      let idBayarBonTerkait: string | undefined;
      if (potonganKasbon > 0) {
        const ngunciBefore = this.getMitraNominalNotaNgunci(db, mitraId);
        const alokasiList = this.allocateMitraBonFifo(db, mitraId, potonganKasbon);
        const ngunciAfter = this.getMitraNominalNotaNgunci(db, mitraId);
        const pengurangNgunci = Math.max(0, ngunciBefore - ngunciAfter);
        const idBYB = generateId('BYB');
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          idTransaksi: idBYB,
          ...(ngunciBefore > 0
            ? {
                sisaNotaNgunciSebelum: ngunciBefore,
                nominalPengurangNotaNgunci: pengurangNgunci,
                sisaNotaNgunciSetelah: ngunciAfter,
              }
            : {}),
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
          keterangan: `Potong Gaji / Upah (${pendingList.length > 0 ? `${pendingList.length} Hari Kerja` : params.periodeBulan || 'Bulanan'}) [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso,
        });
      }

      if (!resolvedRek.isSinkron && resolvedRek.rekeningObj && gajiBersihDibayar > 0) {
        resolvedRek.rekeningObj.saldoSaatIni -= gajiBersihDibayar;
      }
      const finalRekKode = resolvedRek.kode;
      const finalMetode = resolvedRek.metode;

      const idPayroll = generateId('GAJI');
      const slipNomor = `SLIP/WA/${targetTanggal.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

      const resolvedTipeGaji: 'HARIAN' | 'BULANAN' =
        params.tipeGaji || (params.periodeBulan ? 'BULANAN' : 'HARIAN');
      const resolvedPeriode =
        params.periodeBulan ||
        (pendingList.length > 0
          ? `Settlement ${pendingList.length} Hari Kerja - ${targetTanggal}`
          : `Penggajian Bulanan - ${targetTanggal}`);

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
        metodePembayaran: finalMetode,
        rekeningSumber: finalRekKode,
        ...(pendingList.length > 0
          ? {
              jumlahHariKerja: pendingList.length,
              daftarUpahHarianIds: pendingList.map((u) => u.id),
            }
          : {}),
        keterangan:
          params.keterangan ||
          (pendingList.length > 0
            ? `Pembayaran Gaji / Upah (${pendingList.length} Hari Kerja · ${resolvedPeriode}) Karyawan ${kry.nama}`
            : `Pembayaran Gaji (${resolvedPeriode}) Karyawan ${kry.nama}`),
        idBayarBonTerkait,
      };

      db.penggajian.unshift(payrollRecord);

      for (const u of pendingList) {
        u.status = 'SUDAH_DIBAYAR';
        u.ket = 'LUNAS';
        u.idPayrollSettlement = idPayroll;
        u.tanggalDibayar = targetTanggal;
      }

      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'PAYROLL',
        idPayroll,
        `Pembayaran Gaji Karyawan ${kry.nama} (${kry.nik}) [Periode: ${resolvedPeriode} | Tgl Cair: ${targetTanggal}]. Total Gaji Kotor: Rp ${totalUpahKotor.toLocaleString(
          'id-ID'
        )}, Potong Bon: Rp ${potonganKasbon.toLocaleString('id-ID')}, Bersih Dibayar: Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${resolvedRek.nama} (${finalRekKode})`,
        gajiBersihDibayar,
        finalRekKode
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

      // Kasbon Barang & Hasil Bumi + Kasbon Uang (Outstanding)
      const {
        kasbonBarang: sisaKasbonBarang,
        kasbonUang: sisaKasbonUang,
        totalKasbonAwal: sisaBonKaryawan,
      } = this.getEmployeeOutstandingKasbon(db, mitraId);

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

      const activeDivisiProfil = String(
        kry.divisi ||
          (kry.departemen?.includes('Toko')
            ? 'CV Wijaya Agro'
            : kry.departemen?.includes('Transport')
            ? 'Wijaya Transport'
            : kry.departemen?.includes('Pabrik') || kry.departemen?.includes('Teknik')
            ? 'Wijaya Karya'
            : kry.departemen) ||
          'Gudang Wijaya Agro'
      ).trim() as NamaDivisi;

      let divisiUtama: NamaDivisi = activeDivisiProfil;
      let maxCount = -1;
      for (const [div, count] of Object.entries(divisiCounts)) {
        if (count > maxCount) {
          maxCount = count;
          divisiUtama = div as NamaDivisi;
        }
      }

      // Jika ada filterDivisi spesifik: tampilkan karyawan apabila divisi aktifnya sesuai ATAU memiliki catatan kerja/gaji di divisi tersebut bulan ini
      if (
        filterDivisi &&
        activeDivisiProfil !== filterDivisi &&
        allUpahBulanIni.length === 0 &&
        allGajiBulanIni.length === 0
      ) {
        continue;
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

      const saldoBersih = hakPending + saldoTitipHasilPanenMitra - sisaBonKaryawan;
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

      const linkedMtr = db.mitra.find(
        (m) => m.id === mitraId || m.idKaryawanTerkait === kry.id || m.kode === kry.nik
      );

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
        departemen: kry.divisi || kry.departemen,
        divisiAktifSaatIni: activeDivisiProfil,
        fotoUrl: kry.fotoUrl || linkedMtr?.fotoUrl,
        riwayatDivisi: Array.isArray(kry.riwayatDivisi) ? kry.riwayatDivisi : [],
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

    const produkUpperMap = new Map((db.produk || []).map((p) => [String(p.kode || '').trim().toUpperCase(), p]));
    const cleanDiv = (d?: string) => (d && !isExcludedFromDivisi(d) ? d : undefined);
    // ATURAN BARANG TOKO: Semua penjualan & pembelian barang toko masuk ke 'Wijaya Karya', KECUALI produk kategori 'OKUSSA' -> 'Okussa'
    const resolveStoreItemDivNorm = (kodeProduk?: string, fallbackDivisi?: string, metode?: string) => {
      if (isTanpaDivisi(fallbackDivisi)) return '__tanpa_divisi__';
      if (metode === 'INTERNAL_PT') return norm(cleanDiv(fallbackDivisi) || 'PT Wijaya Agro Perkasa');
      const cleanKode = String(kodeProduk || '').trim().toUpperCase();
      if (cleanKode && cleanKode !== 'REKAP-NOTA' && cleanKode !== 'NOTA-SILANG') {
        const prod = produkUpperMap.get(cleanKode);
        if (String(prod?.kategori || '').trim().toUpperCase() === 'OKUSSA') {
          return norm('Okussa');
        }
        return norm('Wijaya Karya');
      }
      if (norm(cleanDiv(fallbackDivisi)) === 'okussa') return norm('Okussa');
      return norm('Wijaya Karya');
    };
    const resolveHasilBumiDivNorm = (divisi?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      return norm(cleanDiv(divisi) || 'Gudang Wijaya Agro');
    };
    const resolveBebanDivNorm = (divisi?: string, rekeningSumber?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      const validDiv = cleanDiv(divisi);
      if (validDiv && String(validDiv).trim()) return norm(validDiv);
      if (rekeningSumber) {
        const mapped = divisiByRekKode.get(String(rekeningSumber).toUpperCase());
        if (mapped) return mapped;
      }
      return norm('PT Wijaya Agro Perkasa');
    };

    // Map nota penjualan -> divisi shares & ringkasan item (mendukung keranjang campuran Wijaya Karya & Okussa)
    const penjualanNotaMap = new Map<string, Array<{ divisiNorm: string; ratio: number; label: string }>>();
    for (const p of db.penjualan || []) {
      if (p.isNotaSilang || p.metode === 'PEMAKAIAN_PENGELUARAN') continue;
      if (p.noPenjualan) {
        const grouped = new Map<string, { sub: number; labels: string[] }>();
        if (Array.isArray(p.items) && p.items.length > 0) {
          for (const it of p.items) {
            const dn = resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode);
            const sub = Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0);
            const cur = grouped.get(dn) || { sub: 0, labels: [] };
            cur.sub += sub;
            cur.labels.push(`${it.namaProduk} (${it.qty} ${it.satuan})`);
            grouped.set(dn, cur);
          }
        } else {
          const dn = resolveStoreItemDivNorm(undefined, p.divisi, p.metode);
          grouped.set(dn, { sub: Number(p.totalNominal) || 0, labels: [p.noPenjualan] });
        }
        const totalSub = Array.from(grouped.values()).reduce((s, x) => s + x.sub, 0) || 1;
        penjualanNotaMap.set(
          p.noPenjualan,
          Array.from(grouped.entries()).map(([divisiNorm, val]) => ({
            divisiNorm,
            ratio: val.sub / totalSub,
            label: val.labels.join(', ') || p.noPenjualan,
          }))
        );
      }
    }
    for (const j of db.penjualanHasilBumi || []) {
      if (j.noPenjualan) {
        penjualanNotaMap.set(j.noPenjualan, [
          {
            divisiNorm: resolveHasilBumiDivNorm(j.divisi),
            ratio: 1,
            label: `${j.komoditasNama} (${j.beratBersih.toLocaleString('id-ID')} Kg)`,
          },
        ]);
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

      // 1. Penjualan Masuk (+) — Kasir Toko (Per-item routing: Wijaya Karya vs Okussa) + Hasil Bumi + Pelunasan Piutang Barang Tunai/Transfer
      const penjualanTokoList: TransaksiPenjualan[] = [];
      for (const p of db.penjualan || []) {
        if (p.isNotaSilang || p.metode === 'PEMAKAIAN_PENGELUARAN') continue;
        if ((p.metode !== 'TUNAI' && p.metode !== 'TRANSFER') || (Number(p.totalNominal) || 0) <= 0) continue;
        if (Array.isArray(p.items) && p.items.length > 0) {
          const matchingItems = p.items.filter(
            (it) => resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode) === targetNorm
          );
          if (matchingItems.length > 0) {
            const subNom = matchingItems.reduce(
              (s, it) => s + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0)),
              0
            );
            penjualanTokoList.push({ ...p, items: matchingItems, totalNominal: subNom });
          }
        } else if (resolveStoreItemDivNorm(undefined, p.divisi, p.metode) === targetNorm) {
          penjualanTokoList.push(p);
        }
      }

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
            const notaShares = penjualanNotaMap.get(alok.refId) || [];
            for (const sh of notaShares) {
              if (sh.divisiNorm === targetNorm) {
                const nom = Math.round((Number(alok.nominalDibayar) || 0) * sh.ratio);
                if (nom > 0) {
                  totalPelunasanBonBarang += nom;
                  pelunasanBonEntries.push({
                    id: `${b.idTransaksi}-${alok.refId}`,
                    tanggal: b.tanggal,
                    jam: b.jam,
                    nominal: nom,
                    keterangan: `Pelunasan Piutang Penjualan (${alok.refId}: ${sh.label})`,
                    refId: b.idTransaksi,
                    pihakTerkait: b.namaMitra,
                    rekeningFisik: b.rekeningTujuan || (b.metode === 'TUNAI' ? 'KAS01' : b.metode),
                    createdAt: b.createdAt,
                  });
                }
              }
            }
          }
        }
      }

      const uangMasukDivList = (db.uangMasuk || []).filter(
        (um) =>
          !isTanpaDivisi(um.divisi) &&
          norm(cleanDiv(um.divisi) || 'PT Wijaya Agro Perkasa') === targetNorm &&
          (Number(um.nominal) || 0) > 0
      );

      const brilinkMasukDivList = (db.brilink || []).filter(
        (br) =>
          !isTanpaDivisi(br.divisi) &&
          norm(cleanDiv(br.divisi) || 'BRILink') === targetNorm &&
          br.jenisBrilink === 'TARIK_TUNAI' &&
          (Number(br.nominalAdmin) || 0) > 0
      );

      const brilinkKeluarDivList = (db.brilink || []).filter(
        (br) =>
          !isTanpaDivisi(br.divisi) &&
          norm(cleanDiv(br.divisi) || 'BRILink') === targetNorm &&
          br.jenisBrilink === 'TUKAR_CASH' &&
          (Number(br.nominalAdmin) || 0) > 0
      );

      const totalPenjualanMasuk =
        penjualanTokoList.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0) +
        penjualanHasilBumiList.reduce((sum, j) => sum + (Number(j.totalNominal) || 0), 0) +
        uangMasukDivList.reduce((sum, um) => sum + (Number(um.nominal) || 0), 0) +
        brilinkMasukDivList.reduce((sum, br) => sum + (Number(br.nominalAdmin) || 0), 0) +
        totalPelunasanBonBarang;

      // 2. Pembelian / Kulakan = MODAL DAGANG (Barang Dagang Per-item Wijaya Karya vs Okussa + Hasil Bumi Tunai/Transfer)
      const pembelianBarangList: TransaksiPembelianBarang[] = [];
      for (const pb of db.pembelianBarang || []) {
        if ((pb.metodePembayaran !== 'TUNAI' && pb.metodePembayaran !== 'TRANSFER') || (Number(pb.totalNominal) || 0) <= 0) {
          continue;
        }
        if (Array.isArray(pb.items) && pb.items.length > 0) {
          const matchingItems = pb.items.filter(
            (it) => resolveStoreItemDivNorm(it.kodeProduk, pb.divisi) === targetNorm
          );
          if (matchingItems.length > 0) {
            const subNom = matchingItems.reduce(
              (s, it) => s + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.hargaBeliSatuan) || 0)),
              0
            );
            pembelianBarangList.push({ ...pb, items: matchingItems, totalNominal: subNom });
          }
        } else if (resolveStoreItemDivNorm(undefined, pb.divisi) === targetNorm) {
          pembelianBarangList.push(pb);
        }
      }

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

      // 5. Gaji karyawan divisi (-) -> Beban Pengurang Saldo Divisi (hanya pencairan Kas/Bank riil, bukan SINKRON)
      const gajiList = (db.penggajian || []).filter(
        (g) =>
          resolveBebanDivNorm(g.divisi, g.rekeningSumber) === targetNorm &&
          g.metodePembayaran !== 'SINKRON' &&
          g.rekeningSumber !== 'SINKRON'
      );
      const totalGajiKeluar = gajiList.reduce((sum, g) => sum + (Number(g.gajiBersihDibayar) || 0), 0);

      // 6. Pengeluaran & Biaya operasional divisi (-) -> Beban Pengurang Saldo Divisi
      const pengeluaranList = (db.pengeluaran || []).filter(
        (p) =>
          resolveBebanDivNorm(p.divisi, p.rekeningSumber) === targetNorm &&
          p.rekeningSumber !== 'SINKRON'
      );
      const totalPengeluaranOperasional =
        pengeluaranList.reduce((sum, p) => sum + (Number(p.nominal) || 0), 0) +
        brilinkKeluarDivList.reduce((sum, br) => sum + (Number(br.nominalAdmin) || 0), 0);

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

      for (const um of uangMasukDivList) {
        rawMutasi.push({
          id: um.idTransaksi,
          tanggal: um.tanggal,
          jam: um.jam,
          jenis: 'PENJUALAN_MASUK',
          keterangan: `Uang Masuk (${um.kategori})${um.noPenjualanHasilBumi ? ` [${um.noPenjualanHasilBumi}]` : ''}: ${um.keterangan}`,
          masuk: Number(um.nominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: um.idTransaksi,
          pihakTerkait: um.namaPengirim,
          rekeningFisik: um.rekeningTujuan,
          _sortIso: um.createdAt,
        });
      }

      for (const br of brilinkMasukDivList) {
        rawMutasi.push({
          id: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam,
          jenis: 'PENJUALAN_MASUK',
          keterangan: `BRILink Adm Tarik Tunai: ${br.keterangan || br.namaPelanggan}`,
          masuk: Number(br.nominalAdmin) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: br.idTransaksi,
          pihakTerkait: br.namaPelanggan,
          rekeningFisik: br.rekeningAdmin,
          _sortIso: br.createdAt,
        });
      }

      for (const br of brilinkKeluarDivList) {
        rawMutasi.push({
          id: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam,
          jenis: 'PENGELUARAN_OPERASIONAL',
          keterangan: `[Pengurang Saldo] BRILink Adm Tukar Cash PT: ${br.keterangan || br.namaPelanggan}`,
          masuk: 0,
          keluar: Number(br.nominalAdmin) || 0,
          saldoSetelah: 0,
          refId: br.idTransaksi,
          pihakTerkait: br.namaPelanggan,
          rekeningFisik: br.rekeningAdmin,
          _sortIso: br.createdAt,
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
          tanggal: normalizeDateToDmy(g.tanggal, g.tanggal),
          jam: g.jam,
          jenis: 'GAJI_KARYAWAN',
          keterangan: `Gaji Karyawan: ${g.namaKaryawan} (${g.periodeBulan || g.tipeGaji || 'Harian'}) - Kotor: Rp ${g.totalGajiKotor.toLocaleString('id-ID')}${g.potonganKasbon > 0 ? `, Potong Bon: Rp ${g.potonganKasbon.toLocaleString('id-ID')}` : ''}`,
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

    // Resolusi Rekening Anak Perusahaan Terkait (misal MTR-DPPARABOT <-> REK-DPPARABO) lebih awal
    const linkedRek =
      (mitra.kodeRekeningTerkait && db.rekening.find((r) => r.kode === mitra.kodeRekeningTerkait)) ||
      db.rekening.find((r) => r.idMitraTerkait === mitra.id && this.isAnakPerusahaanRekening(r));
    const isAnakPerusahaan = Boolean(mitra.isAnakPerusahaan || mitra.role === 'ANAK_PERUSAHAAN' || linkedRek);
    const saldoRekeningAnakLive = isAnakPerusahaan && linkedRek ? Math.round(Number(linkedRek.saldoSaatIni) || 0) : 0;
    const piutangTransferAnakPerusahaan = saldoRekeningAnakLive > 0 ? saldoRekeningAnakLive : 0;
    const talanganTransferAnakPerusahaan = saldoRekeningAnakLive < 0 ? Math.abs(saldoRekeningAnakLive) : 0;

    // Helper ekstraksi keterangan opsional murni dari inputan user (agar kalimat penting seperti "Mama ambil solar 1 drigent yang ngambil supir truck mama" tampil jelas)
    const extractUserCatatan = (raw?: string, autoDefaults: string[] = []): string | undefined => {
      const clean = String(raw || '').trim();
      if (!clean || clean === '-') return undefined;
      for (const def of autoDefaults) {
        if (def && clean.toLowerCase() === def.trim().toLowerCase()) return undefined;
      }
      if (
        /^Penjualan (Barang Toko|Kasbon|Lunas SINKRON) \(/i.test(clean) ||
        /^Pemakaian (Kebutuhan Internal|Stok Gudang)/i.test(clean) ||
        /^Pembelian .+ dari .+$/i.test(clean)
      ) {
        return undefined;
      }
      return clean;
    };

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

    // 3. Titip Hasil Bumi, Pinjaman Uang, & Hutang Kulakan Supplier (Kewajiban PT kepada Mitra + Talangan Anak Perusahaan)
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
    const totalTitipPanenMurni = Math.max(0, titipKotor - totalPencairanMitra) + talanganTransferAnakPerusahaan;

    // 3b. Integrasi Karyawan <-> Mitra
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

    // Total hak mitra keseluruhan yang masih tersimpan di PT = Titip Hasil Panen + Upah Kerja Belum Cair (+ Talangan Anak Perusahaan)
    const totalTitip = totalTitipPanenMurni + totalUpahBelumDibayar;

    // 4. Pembayaran Bon
    const bayarBonList = db.bayarBon.filter((b) => b.idMitra === mitra.id);
    const totalPembayaranBon = bayarBonList.reduce((s, b) => s + b.nominalBayar, 0);

    // Total Piutang termasuk Piutang Transfer Anak Perusahaan ke Perusahaan (misal transfer Bank PT -> REK-DPPARABO)
    const totalBonKeseluruhan = totalKasbonBarang + totalKasbonUang + piutangTransferAnakPerusahaan;
    const sisaBon = totalBonKeseluruhan;

    const isNoteNgunciHelper = (flag?: boolean) =>
      flag !== undefined ? Boolean(flag) : Boolean(mitra.isNotaNgunci);

    const nominalNotaNgunci =
      kasbonBarangList
        .filter((p) => (p.sisaPiutang || 0) > 0 && isNoteNgunciHelper(p.isNotaNgunci))
        .reduce((s, p) => s + (p.sisaPiutang || 0), 0) +
      piutangHasilBumiList
        .filter((j) => (j.sisaPiutang || 0) > 0 && isNoteNgunciHelper(j.isNotaNgunci))
        .reduce((s, j) => s + (j.sisaPiutang || 0), 0) +
      kasbonUangList
        .filter((k) => k.status !== 'LUNAS' && (k.sisaKasbon || 0) > 0 && isNoteNgunciHelper(k.isNotaNgunci))
        .reduce((s, k) => s + (k.sisaKasbon || 0), 0);
    const nominalPiutangAktif = Math.max(0, totalBonKeseluruhan - nominalNotaNgunci);

    // Timeline ledger transactions
    type TimelineRaw = {
      id: string;
      tanggal: string;
      jam: string;
      createdAt: string;
      jenis: string;
      keterangan: string;
      catatanTransaksi?: string;
      qtyDisplay: string;
      hargaSatuanDisplay: string;
      itemsDetail?: Array<{ nama: string; qty: number; satuan: string; harga: number; subtotal: number }>;
      debet: number; // Bon / Piutang bertambah
      kredit: number; // Bon / Piutang berkurang
      nominalMutasiHak?: number;
      kategoriMutasiHak?: 'TITIP_MASUK' | 'TITIP_CAIR' | 'UPAH_TERCATAT' | 'UPAH_SUDAH_CAIR' | 'SLIP_GAJI';
      fotoNota?: string;
      isNotaLalu?: boolean;
      noNotaLalu?: string;
      isNotaNgunci?: boolean;
      catatanNgunci?: string;
      sisaPiutangNota?: number;
      isNotaSilang?: boolean;
      noNotaToko?: string;
      pihakNotaSilang?: string;
      idTransaksiInduk?: string;
      sisaPiutangNotaInduk?: number;
      _isAnakRekMutasi?: boolean;
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
        qtyDisplay = `${totalQty} unit (${p.items.length} item)`;
        hargaSatuanDisplay = `Rp ${p.totalNominal.toLocaleString('id-ID')}`;
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
      const rincianRingkasSilang = p.items
        .map((it) => `${it.namaProduk}${it.qty > 1 ? ` (${it.qty} ${it.satuan})` : ''}`)
        .join(', ');

      if (p.metode === 'KASBON') {
        const isNgunci = (p.sisaPiutang || 0) > 0 && isNoteNgunciHelper(p.isNotaNgunci);
        const isSilang = Boolean(p.isNotaSilang);
        const anakLabel = p.namaAnakPerusahaan || 'DP Parabot';
        const isSesamaMitra = p.modeNotaSilang === 'SESAMA_MITRA';
        const notaTokoSuffix = p.noNotaToko ? ` [Nota #${p.noNotaToko}]` : '';

        let catatanUser: string | undefined;
        if (isSilang && p.keterangan) {
          const idxColon = p.keterangan.indexOf(':');
          const afterColon = idxColon >= 0 ? p.keterangan.slice(idxColon + 1).trim() : p.keterangan.trim();
          if (afterColon && afterColon.toLowerCase() !== rincianRingkasSilang.toLowerCase()) {
            catatanUser = afterColon;
          }
        } else {
          catatanUser = extractUserCatatan(p.keterangan);
        }

        if (isSilang) {
          // Pecah Nota Silang per item (1 baris = 1 barang) sesuai standar buku Rekening Koran perusahaan
          const baseItems =
            p.items.length > 0
              ? p.items.map((it) => ({
                  nama: (it.namaProduk || 'BARANG').trim().toUpperCase(),
                  qty: Number(it.qty) || 1,
                  satuan: (it.satuan || 'PCS').trim().toUpperCase(),
                  harga: Math.round(Number(it.harga) || 0),
                  subtotal: Math.round(Number(it.subtotal) || (Number(it.qty) || 1) * (Number(it.harga) || 0)),
                }))
              : [
                  {
                    nama: (catatanUser || `BELANJA ${anakLabel}`).trim().toUpperCase(),
                    qty: 1,
                    satuan: 'NOTA',
                    harga: Math.round(Number(p.totalNominal) || 0),
                    subtotal: Math.round(Number(p.totalNominal) || 0),
                  },
                ];

          const rawSum = baseItems.reduce((s, x) => s + x.subtotal, 0);
          const diffTotal = Math.round(Number(p.totalNominal) || 0) - rawSum;
          if (diffTotal !== 0 && baseItems.length > 0) {
            const lastIdx = baseItems.length - 1;
            baseItems[lastIdx] = {
              ...baseItems[lastIdx],
              subtotal: Math.max(0, baseItems[lastIdx].subtotal + diffTotal),
              harga:
                baseItems[lastIdx].qty > 0
                  ? Math.round(Math.max(0, baseItems[lastIdx].subtotal + diffTotal) / baseItems[lastIdx].qty)
                  : baseItems[lastIdx].harga,
            };
          }

          const totalNota = Math.round(Number(p.totalNominal) || 0);
          const sisaNotaInduk = Math.max(0, Math.round(Number(p.sisaPiutang) || 0));
          let remainingPaidOnNota = Math.max(0, totalNota - sisaNotaInduk);

          const ketBelanjaParts = [
            isSesamaMitra ? `NOTA SILANG ${anakLabel.toUpperCase()}` : `BELANJA ${anakLabel.toUpperCase()}`,
            catatanUser ? catatanUser.toUpperCase() : '',
            p.noNotaToko ? `#${p.noNotaToko}` : '',
          ].filter(Boolean);
          const ketBelanjaText = ketBelanjaParts.join(' · ');

          baseItems.forEach((it, idx) => {
            const paidHere = Math.min(remainingPaidOnNota, it.subtotal);
            remainingPaidOnNota = Math.max(0, remainingPaidOnNota - paidHere);
            const sisaItem = Math.max(0, it.subtotal - paidHere);
            const rowId = baseItems.length > 1 ? `${p.noPenjualan}-IT${idx + 1}` : p.noPenjualan;

            timeline.push({
              id: rowId,
              idTransaksiInduk: p.noPenjualan,
              tanggal: p.tanggal,
              jam: p.jam,
              createdAt: p.createdAt,
              jenis: isSesamaMitra
                ? `NOTA SILANG MITRA (${anakLabel.toUpperCase()})`
                : `NOTA SILANG (${anakLabel.toUpperCase()})`,
              keterangan: `${it.nama} — ${ketBelanjaText}`,
              catatanTransaksi: ketBelanjaText,
              qtyDisplay: `${it.qty} ${it.satuan}`,
              hargaSatuanDisplay: `Rp ${it.harga.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: it.nama,
                  qty: it.qty,
                  satuan: it.satuan,
                  harga: it.harga,
                  subtotal: it.subtotal,
                },
              ],
              debet: it.subtotal,
              kredit: 0,
              fotoNota: p.fotoNota,
              isNotaNgunci: isNgunci && sisaItem > 0,
              catatanNgunci: isNgunci ? p.catatanNgunci || mitra.catatanNgunci : undefined,
              sisaPiutangNota: sisaItem,
              sisaPiutangNotaInduk: sisaNotaInduk,
              isNotaSilang: true,
              noNotaToko: p.noNotaToko,
              pihakNotaSilang: anakLabel,
            });
          });
        } else {
          timeline.push({
            id: p.noPenjualan,
            tanggal: p.tanggal,
            jam: p.jam,
            createdAt: p.createdAt,
            jenis: 'PENJUALAN KASBON',
            keterangan: `Kasbon Barang${notaTokoSuffix}: ${rincianText}${catatanUser ? ` — Ket: ${catatanUser}` : ''}`,
            catatanTransaksi: catatanUser,
            qtyDisplay,
            hargaSatuanDisplay,
            itemsDetail,
            debet: p.totalNominal,
            kredit: 0,
            fotoNota: p.fotoNota,
            isNotaNgunci: isNgunci,
            catatanNgunci: isNgunci ? p.catatanNgunci || mitra.catatanNgunci : undefined,
            sisaPiutangNota: p.sisaPiutang || 0,
            isNotaSilang: false,
            noNotaToko: p.noNotaToko,
          });
        }
      } else {
        const catatanUser = extractUserCatatan(p.keterangan);
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis:
            p.metode === 'SINKRON'
              ? 'PENJUALAN SINKRON (LUNAS NON-TUNAI)'
              : p.metode === 'PEMAKAIAN_PENGELUARAN'
              ? `PEMAKAIAN KE PENGELUARAN (${p.kategoriPengeluaran || 'OPERASIONAL'})`
              : `PENJUALAN ${p.metode}`,
          keterangan:
            p.metode === 'SINKRON'
              ? `Penjualan Lunas SINKRON (Tanpa Uang Masuk): ${rincianText}`
              : `Penjualan Lunas (${p.metode}) via ${p.rekeningTujuan}: ${rincianText}`,
          catatanTransaksi: catatanUser,
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
      const isNgunci = isPiutang && (jhb.sisaPiutang || 0) > 0 && isNoteNgunciHelper(jhb.isNotaNgunci);
      const catatanUser = extractUserCatatan(jhb.keterangan);
      timeline.push({
        id: jhb.noPenjualan,
        tanggal: jhb.tanggal,
        jam: jhb.jam,
        createdAt: jhb.createdAt,
        jenis: isPiutang ? 'PIUTANG JUAL HASIL BUMI' : `JUAL HASIL BUMI (${jhb.metodePembayaran})`,
        keterangan: isPiutang
          ? `Piutang Penjualan Hasil Bumi ${jhb.komoditasNama} (${jhb.beratBersih} Kg @ Rp ${jhb.hargaJualPerKg.toLocaleString('id-ID')})`
          : `Penjualan Hasil Bumi Lunas (${jhb.metodePembayaran}) via ${jhb.rekeningTujuan}: ${jhb.komoditasNama} (${jhb.beratBersih} Kg)`,
        catatanTransaksi: catatanUser,
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
        isNotaNgunci: isNgunci,
        catatanNgunci: isNgunci ? jhb.catatanNgunci || mitra.catatanNgunci : undefined,
        sisaPiutangNota: isPiutang ? jhb.sisaPiutang || 0 : 0,
      });
    }

    // Kasbon uang to this mitra (Termasuk Nota Lalu Piutang Barang Masa Lalu)
    for (const k of kasbonUangList) {
      const isNotaLalu = k.isNotaLalu || k.keterangan?.includes('Nota Lalu') || k.rekeningSumber === 'BON01';
      const noNotaLabel = k.noNotaLalu ? ` [No. Nota: ${k.noNotaLalu}]` : '';
      const fotoK = (k.fotoNotaList && k.fotoNotaList.length > 0) ? k.fotoNotaList.join('|||') : (k.fotoNota || '');
      const isNgunci = k.status !== 'LUNAS' && (k.sisaKasbon || 0) > 0 && isNoteNgunciHelper(k.isNotaNgunci);
      const catatanUser = extractUserCatatan(k.keterangan, ['Pinjaman / kasbon uang operasional mitra', 'Piutang Nota Barang Masa Lalu']);

      timeline.push({
        id: k.idTransaksi,
        tanggal: k.tanggalNotaLalu || k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        jenis: isNotaLalu ? 'NOTA LALU (PIUTANG BARANG)' : 'KASBON UANG',
        keterangan: isNotaLalu
          ? `${k.keterangan || 'Piutang Nota Barang Masa Lalu'}${noNotaLabel}`
          : `Penerimaan Kasbon Uang via ${k.metode} (${k.rekeningSumber}) - ${k.keterangan}`,
        catatanTransaksi: catatanUser,
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
        isNotaNgunci: isNgunci,
        catatanNgunci: isNgunci ? k.catatanNgunci || mitra.catatanNgunci : undefined,
        sisaPiutangNota: k.sisaKasbon || 0,
      });
    }

    // Payments by this mitra
    for (const b of bayarBonList) {
      const isSinkronBon =
        b.metode === 'SINKRON' ||
        b.metode === 'KOMPENSASI_TITIP' ||
        b.rekeningTujuan === 'SINKRON' ||
        Boolean(b.isKompensasiTitipan);
      const pengurangNgunci =
        b.nominalPengurangNotaNgunci ??
        (b.alokasi || [])
          .filter((a) => a.isNotaNgunci)
          .reduce((s, a) => s + (a.nominalDibayar || 0), 0);
      const infoNgunciSuffix =
        pengurangNgunci > 0
          ? ` [Otomatis Mengurangi Nota Kunci: -Rp ${pengurangNgunci.toLocaleString('id-ID')}]`
          : '';
      timeline.push({
        id: b.idTransaksi,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        jenis: isSinkronBon ? 'PELUNASAN BON (SINKRON POTONG TITIPAN)' : 'PEMBAYARAN BON',
        keterangan: isSinkronBon
          ? `Pelunasan Bon via Rekening SINKRON (Potong Saldo Titipan / Uang Hasil Bumi — Tanpa Uang Fisik) - ${b.keterangan}${infoNgunciSuffix}`
          : `Setoran Bayar Bon via ${b.metode} (${b.rekeningTujuan}) - ${b.keterangan}${infoNgunciSuffix}`,
        catatanTransaksi: extractUserCatatan(b.keterangan),
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
        const isSilang = Boolean(pb.isNotaSilang || pb.komoditasKode === 'NOTA_SILANG');
        const isPinjaman =
          !isSilang && (pb.komoditasKode === 'PINJAMAN_DANA' || pb.komoditasNama?.includes('Pinjaman Uang'));
        const isNotaLalu =
          !isSilang && (pb.isNotaLalu || pb.keterangan?.includes('Nota Lalu') || pb.komoditasKode === 'TITIP_DANA');
        const noNotaLabel = pb.noNotaLalu ? ` [No. Nota: ${pb.noNotaLalu}]` : '';

        if (isSilang) {
          const pengambilNama = (pb.namaMitraPengambil || pb.komoditasNama || 'MITRA').trim();
          const pengambilUpper = pengambilNama.toUpperCase();
          const rawSilangItems = pb.itemsNotaSilang || [];
          const rincianSilangRingkas = rawSilangItems
            .map((it) => `${it.namaBarang}${it.qty > 1 ? ` (${it.qty} ${it.satuan || 'PCS'})` : ''}`)
            .join(', ');
          let catatanSilang: string | undefined;
          if (pb.keterangan) {
            const stripped = pb.keterangan
              .replace(new RegExp(`^${pengambilNama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*—\\s*`, 'i'), '')
              .replace(/\s*\[Nota #[^\]]+\]\s*$/i, '')
              .trim();
            if (stripped && stripped.toLowerCase() !== rincianSilangRingkas.toLowerCase()) {
              catatanSilang = stripped;
            }
          }

          // Standar Rekening Koran Anak Perusahaan / Penyedia (Contoh: DEVI PARABOT):
          // 1 baris per barang:
          // - ITEM / NAMA BARANG = Nama Mitra Pengambil (misal: SD 1 SIMPANG LUAS, MUJAHIDIN)
          // - QTY / BANYAKNYA    = Kuantitas per barang (misal: 2 PCS, 40 PCS, 28 SET)
          // - HARGA              = Harga satuan barang (misal: Rp 115.000, Rp 85.000)
          // - TITIP / JML UANG   = Subtotal per barang (misal: Rp 115.000, Rp 170.000)
          // - KETERANGAN         = Nama Barang yang diambil (misal: PLITUR BOYO 1KG, SEMEN PADANG)
          const expandedSilangItems =
            rawSilangItems.length > 0
              ? rawSilangItems.map((it) => ({
                  namaBarang: (it.namaBarang || 'BARANG').trim().toUpperCase(),
                  qty: Number(it.qty) || 1,
                  satuan: (it.satuan || 'PCS').trim().toUpperCase(),
                  harga: Math.round(Number(it.harga) || 0),
                  subtotal: Math.round(
                    Number(it.subtotal) || (Number(it.qty) || 1) * (Number(it.harga) || 0)
                  ),
                }))
              : [
                  {
                    namaBarang: (catatanSilang || pb.keterangan || 'NOTA SILANG').trim().toUpperCase(),
                    qty: 1,
                    satuan: 'NOTA',
                    harga: Math.round(Number(pb.totalNominal) || 0),
                    subtotal: Math.round(Number(pb.totalNominal) || 0),
                  },
                ];

          const rawSumSilang = expandedSilangItems.reduce((s, x) => s + x.subtotal, 0);
          const diffTotalSilang = Math.round(Number(pb.totalNominal) || 0) - rawSumSilang;
          if (diffTotalSilang !== 0 && expandedSilangItems.length > 0) {
            const lastIdx = expandedSilangItems.length - 1;
            expandedSilangItems[lastIdx] = {
              ...expandedSilangItems[lastIdx],
              subtotal: Math.max(0, expandedSilangItems[lastIdx].subtotal + diffTotalSilang),
              harga:
                expandedSilangItems[lastIdx].qty > 0
                  ? Math.round(
                      Math.max(0, expandedSilangItems[lastIdx].subtotal + diffTotalSilang) /
                        expandedSilangItems[lastIdx].qty
                    )
                  : expandedSilangItems[lastIdx].harga,
            };
          }

          expandedSilangItems.forEach((it, idx) => {
            const rowId =
              expandedSilangItems.length > 1 ? `${pb.noPembelian}-IT${idx + 1}` : pb.noPembelian;
            const ketParts = [
              it.namaBarang,
              rawSilangItems.length > 0 && catatanSilang ? catatanSilang.toUpperCase() : '',
              pb.noNotaToko ? `#${pb.noNotaToko}` : '',
            ].filter(Boolean);
            const ketBarangText = ketParts.join(' · ');

            timeline.push({
              id: rowId,
              idTransaksiInduk: pb.noPembelian,
              tanggal: pb.tanggal,
              jam: pb.jam,
              createdAt: pb.createdAt,
              jenis: `NOTA SILANG (${pengambilUpper})`,
              keterangan: `${pengambilUpper} — ${ketBarangText}`,
              catatanTransaksi: ketBarangText,
              qtyDisplay: `${it.qty} ${it.satuan}`,
              hargaSatuanDisplay: `Rp ${it.harga.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: pengambilUpper,
                  qty: it.qty,
                  satuan: it.satuan,
                  harga: it.harga,
                  subtotal: it.subtotal,
                },
              ],
              debet: 0,
              kredit: 0,
              nominalMutasiHak: it.subtotal,
              kategoriMutasiHak: 'TITIP_MASUK',
              fotoNota: fotoPb,
              noNotaLalu: pb.noNotaToko,
              isNotaSilang: true,
              noNotaToko: pb.noNotaToko,
              pihakNotaSilang: pengambilNama,
            });
          });
        } else {
          const jenisLabel = isPinjaman
            ? 'PINJAMAN UANG PT KE MITRA (SALDO TITIP)'
            : isNotaLalu
            ? 'NOTA LALU (TITIPAN UANG/PANEN)'
            : 'TITIP HASIL BUMI';
          const catatanUser = extractUserCatatan(pb.keterangan);

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
              : `Titip Hasil Panen ${pb.komoditasNama} (${pb.beratBersih} Kg @ Rp ${(pb.hargaPerKg || 0).toLocaleString('id-ID')}/Kg)${catatanUser ? ` — ${catatanUser}` : ''}`,
            catatanTransaksi: catatanUser,
            qtyDisplay: isPinjaman ? 'Dana Tunai' : (pb.beratBersih > 0 ? `${pb.beratBersih.toLocaleString('id-ID')} Kg` : '1 (Dana)'),
            hargaSatuanDisplay: pb.beratBersih > 0 && (pb.hargaPerKg || 0) > 0
              ? `Rp ${(pb.hargaPerKg || 0).toLocaleString('id-ID')}`
              : `Rp ${pb.totalNominal.toLocaleString('id-ID')}`,
            itemsDetail: [
              {
                nama: isPinjaman
                  ? `Pinjaman Uang dari PT ke Mitra (Masuk Saldo Titip)`
                  : isNotaLalu
                  ? `Titipan Uang / Panen Nota Lalu (${pb.noNotaLalu || 'Nota Titip Lama'})`
                  : `Hasil Panen: ${pb.komoditasNama}`,
                qty: pb.beratBersih > 0 ? pb.beratBersih : 1,
                satuan: isPinjaman ? 'Dana' : (pb.beratBersih > 0 ? 'Kg' : 'Titip'),
                harga: pb.beratBersih > 0 && (pb.hargaPerKg || 0) > 0 ? pb.hargaPerKg : pb.totalNominal,
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
        }
      } else {
        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: `BELI HASIL BUMI (${pb.metodePembayaran})`,
          keterangan: `Pembelian Lunas ${pb.komoditasNama} ${pb.beratBersih} kg via ${pb.rekeningSumber}`,
          catatanTransaksi: extractUserCatatan(pb.keterangan),
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
      const isHutang = kpb.metodePembayaran === 'HUTANG' && kpb.status !== 'LUNAS';
      timeline.push({
        id: kpb.noPembelian,
        tanggal: kpb.tanggal,
        jam: kpb.jam,
        createdAt: kpb.createdAt,
        jenis: kpb.metodePembayaran === 'HUTANG' ? 'HUTANG KULAKAN SUPPLIER (SALDO TITIP)' : `KULAKAN SUPPLIER (${kpb.metodePembayaran})`,
        keterangan: kpb.metodePembayaran === 'HUTANG'
          ? `Hutang Pembelian Barang dari Supplier: ${rincianKulakan || kpb.keterangan}`
          : `Kulakan Lunas (${kpb.metodePembayaran}) via ${kpb.rekeningSumber}: ${rincianKulakan || kpb.keterangan}`,
        catatanTransaksi: extractUserCatatan(kpb.keterangan, [`Pembelian barang stok dari distributor ${kpb.namaMitra}`]),
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
        ...(isHutang
          ? {
              nominalMutasiHak: kpb.totalNominal,
              kategoriMutasiHak: 'TITIP_MASUK' as const,
            }
          : {}),
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
        catatanTransaksi: extractUserCatatan(pt.keterangan),
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
          catatanTransaksi: extractUserCatatan(u.catatan || u.keterangan),
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
          catatanTransaksi: extractUserCatatan(g.keterangan),
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
    // Transfer Bank PT -> REK-DPPARABO otomatis menjadi Piutang Anak Perusahaan ke PT (Debet +),
    // sedangkan transfer balik / talangan dari REK-DPPARABO menjadi Kredit (-) pengurang piutang!
    // ====================================================================
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
          jenis: linkedRek.saldoAwal >= 0 ? 'SALDO AWAL PIUTANG ANAK PERUSAHAAN (+)' : 'SALDO AWAL TALANGAN ANAK PERUSAHAAN (-)',
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
          debet: linkedRek.saldoAwal > 0 ? awalAbs : 0,
          kredit: linkedRek.saldoAwal < 0 ? awalAbs : 0,
          _isAnakRekMutasi: true,
        });
      }

      // A. Transfer Rekening masuk / keluar dari Rekening Anak Perusahaan (Payment Barang Toko DP Parabot -> Piutang Anak Perusahaan)
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
              jenis: 'TRANSFER KE ANAK PERUSAHAAN (PIUTANG PT)',
              keterangan: `Transfer Dana PT dari ${dariRek?.nama || trf.rekeningSumber} (${trf.rekeningSumber}) ke ${linkedRek.nama} — ${trf.keterangan || 'Piutang Anak Perusahaan ke Perusahaan'}`,
              catatanTransaksi: extractUserCatatan(trf.keterangan),
              qtyDisplay: '1 Transfer',
              hargaSatuanDisplay: `Rp ${trf.nominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Transfer Payment / Dana dari ${dariRek?.nama || trf.rekeningSumber} ke ${linkedRek.nama}`,
                  qty: 1,
                  satuan: 'Transfer',
                  harga: trf.nominal,
                  subtotal: trf.nominal,
                },
              ],
              debet: trf.nominal,
              kredit: 0,
              _isAnakRekMutasi: true,
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
              jenis: 'SETORAN / TALANGAN DARI ANAK PERUSAHAAN',
              keterangan: `Setoran / Talangan Dana dari ${linkedRek.nama} (${rekKode}) ke ${keRek?.nama || trf.rekeningTujuan} — ${trf.keterangan || '1 Transaksi Terpadu'}`,
              catatanTransaksi: extractUserCatatan(trf.keterangan),
              qtyDisplay: '1 Transfer',
              hargaSatuanDisplay: `Rp ${trf.nominal.toLocaleString('id-ID')}`,
              itemsDetail: [
                {
                  nama: `Setoran / Talangan Dana dari ${linkedRek.nama} ke ${keRek?.nama || trf.rekeningTujuan}`,
                  qty: 1,
                  satuan: 'Transfer',
                  harga: trf.nominal,
                  subtotal: trf.nominal,
                },
              ],
              debet: 0,
              kredit: trf.nominal,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(pj.keterangan),
              qtyDisplay: '1 Nota',
              hargaSatuanDisplay: `Rp ${pj.totalNominal.toLocaleString('id-ID')}`,
              itemsDetail: (pj.items || []).map((i) => ({
                nama: i.namaProduk,
                qty: i.qty,
                satuan: i.satuan,
                harga: i.harga,
                subtotal: i.subtotal,
              })),
              debet: pj.totalNominal,
              kredit: 0,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(bb.keterangan),
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
              debet: bb.nominalBayar,
              kredit: 0,
              fotoNota: bb.fotoBukti || bb.fotoNota,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(pb.keterangan),
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
              debet: isPinjaman ? pb.totalNominal : 0,
              kredit: !isPinjaman && pb.metodePembayaran !== 'TITIP' ? pb.totalNominal : 0,
              fotoNota: pb.fotoNota,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(kpb.keterangan),
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
              kredit: kpb.totalNominal,
              fotoNota: kpb.fotoNota,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(ku.keterangan),
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
              kredit: ku.nominal,
              fotoNota: ku.fotoNota,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(pt.keterangan),
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
              kredit: pt.nominalPencairan,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(exp.keterangan),
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
              kredit: exp.nominal,
              fotoNota: exp.fotoKuitansi,
              _isAnakRekMutasi: true,
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
              catatanTransaksi: extractUserCatatan(g.keterangan),
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
              kredit: g.gajiBersihDibayar,
              _isAnakRekMutasi: true,
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

    // Sort chronologically ascending to calculate running balance & FIFO unsettled status accurately
    timeline.sort(
      (a, b) =>
        parseTimelineSortMs(a.createdAt, a.tanggal, a.jam) -
        parseTimelineSortMs(b.createdAt, b.tanggal, b.jam)
    );

    // FIFO pencairan titipan: menentukan transaksi TITIP_MASUK mana yang sudah cair (masuk History) vs masih berjalan
    let remainingPencairanFifo = totalPencairanMitra;
    // FIFO rekonsiliasi mutasi rekening Anak Perusahaan (misal REK-DPPARABO)
    let remainingAnakKreditOffset = saldoRekeningAnakLive > 0 ? totalPakaiDariAnakPerusahaan : 0;
    let remainingAnakDebetOffset = saldoRekeningAnakLive < 0 ? totalSimpanKeAnakPerusahaan : 0;

    let runningBon = 0;
    const history = timeline.map((item) => {
      runningBon += item.debet - item.kredit;

      let piutangBerjalan = 0;
      let titipBerjalan = 0;
      let isSaldoBerjalan = false;

      if (item._isAnakRekMutasi) {
        if (saldoRekeningAnakLive > 0 && item.debet > 0) {
          const offset = Math.min(remainingAnakKreditOffset, item.debet);
          remainingAnakKreditOffset -= offset;
          piutangBerjalan = Math.max(0, item.debet - offset);
          isSaldoBerjalan = piutangBerjalan > 0;
        } else if (saldoRekeningAnakLive < 0 && item.kredit > 0) {
          const offset = Math.min(remainingAnakDebetOffset, item.kredit);
          remainingAnakDebetOffset -= offset;
          titipBerjalan = Math.max(0, item.kredit - offset);
          isSaldoBerjalan = titipBerjalan > 0;
        }
      } else if (item.sisaPiutangNota !== undefined) {
        piutangBerjalan = Math.max(0, item.sisaPiutangNota || 0);
        isSaldoBerjalan = piutangBerjalan > 0;
      } else if (item.kategoriMutasiHak === 'TITIP_MASUK') {
        const nomHak = Math.max(0, item.nominalMutasiHak || 0);
        const used = Math.min(remainingPencairanFifo, nomHak);
        remainingPencairanFifo -= used;
        titipBerjalan = Math.max(0, nomHak - used);
        isSaldoBerjalan = titipBerjalan > 0;
      } else if (item.kategoriMutasiHak === 'UPAH_TERCATAT') {
        titipBerjalan = Math.max(0, item.nominalMutasiHak || 0);
        isSaldoBerjalan = titipBerjalan > 0;
      }

      return {
        id: item.id,
        tanggal: item.tanggal,
        jam: item.jam,
        jenis: item.jenis,
        keterangan: item.keterangan,
        catatanTransaksi: item.catatanTransaksi,
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
        isNotaNgunci: item.isNotaNgunci,
        catatanNgunci: item.catatanNgunci,
        sisaPiutangNota: item.sisaPiutangNota,
        isSaldoBerjalan,
        piutangBerjalan,
        titipBerjalan,
        isNotaSilang: item.isNotaSilang,
        noNotaToko: item.noNotaToko,
        pihakNotaSilang: item.pihakNotaSilang,
        idTransaksiInduk: item.idTransaksiInduk,
        sisaPiutangNotaInduk: item.sisaPiutangNotaInduk,
      };
    });

    const historySaldoBerjalan = history.filter((h) => Boolean(h.isSaldoBerjalan));
    const historySelesai = history.filter((h) => !h.isSaldoBerjalan);

    // Karena piutangTransferAnakPerusahaan & talanganTransferAnakPerusahaan sudah masuk ke totalBonKeseluruhan / totalTitip,
    // posisiBersihTerpadu cukup dihitung dari totalTitip - totalBonKeseluruhan (tidak dikurangi 2 kali!)
    const posisiBersihTerpadu = totalTitip - totalBonKeseluruhan;

    const rekUtama = db.rekening.find(
      (r) => r.kode === (db.profilPerusahaan?.rekeningUtama || 'KAS01')
    );

    return {
      idMitra: mitra.id,
      kodeMitra: mitra.kode,
      namaMitra: mitra.nama,
      role: normalizeRoleMitra(mitra.role, {
        isAnakPerusahaan,
        isKaryawan: Boolean(linkedKaryawan || mitra.isKaryawan),
      }),
      telepon: mitra.telepon,
      alamat: mitra.alamat,
      status: mitra.status,
      fotoUrl: mitra.fotoUrl || linkedKaryawan?.fotoUrl,
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
            piutangTransferAnakPerusahaan,
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
      isNotaNgunci: nominalNotaNgunci > 0 || Boolean(mitra.isNotaNgunci && totalBonKeseluruhan > 0),
      catatanNgunci: mitra.catatanNgunci,
      nominalNotaNgunci,
      nominalPiutangAktif,
      history,
      historySaldoBerjalan,
      historySelesai,
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
    let totalPiutangAktifGlobal = 0;
    let totalNominalNotaNgunciGlobal = 0;
    let mitraDenganHutangTitipCount = 0;
    let mitraDenganBonCount = 0;
    let mitraNotaNgunciCount = 0;
    const daftarNotaNgunci: NotaNgunciDetailItem[] = [];

    const items: RekapMitraItem[] = db.mitra.map((m) => {
      const isNoteNgunci = (flag?: boolean) =>
        flag !== undefined ? Boolean(flag) : Boolean(m.isNotaNgunci);

      // 1. Kasbon barang & Piutang Hasil Bumi
      const unpaidPenjualanToko = db.penjualan.filter(
        (p) => p.idMitra === m.id && p.metode === 'KASBON' && (p.sisaPiutang || 0) > 0
      );
      const unpaidPenjualanHasilBumi = (db.penjualanHasilBumi || []).filter(
        (j) => j.idMitra === m.id && j.metodePembayaran === 'PIUTANG' && (j.sisaPiutang || 0) > 0
      );
      const kasbonBarang =
        unpaidPenjualanToko.reduce((sum, p) => sum + (p.sisaPiutang || 0), 0) +
        unpaidPenjualanHasilBumi.reduce((sum, j) => sum + (j.sisaPiutang || 0), 0);

      // 2. Kasbon uang (termasuk Nota Lalu Piutang Barang di BON01)
      const unpaidKasbonUang = db.kasbonUang.filter(
        (k) => k.idMitra === m.id && k.status !== 'LUNAS' && (k.sisaKasbon || 0) > 0
      );
      const kasbonUang = unpaidKasbonUang.reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      // Check linked Anak Perusahaan account (e.g. DP Parabot <-> REK-DPPARABO) lebih awal agar Piutang Transfer Anak Perusahaan masuk ke totalBon!
      const linkedRek =
        (m.kodeRekeningTerkait && db.rekening.find((r) => r.kode === m.kodeRekeningTerkait)) ||
        db.rekening.find((r) => r.idMitraTerkait === m.id && this.isAnakPerusahaanRekening(r));
      const isAnakPerusahaan = Boolean(m.isAnakPerusahaan || m.role === 'ANAK_PERUSAHAAN' || linkedRek);
      const saldoRekAnak = isAnakPerusahaan && linkedRek ? Math.round(Number(linkedRek.saldoSaatIni) || 0) : 0;
      const piutangTransferAnak = saldoRekAnak > 0 ? saldoRekAnak : 0;
      const talanganTransferAnak = saldoRekAnak < 0 ? Math.abs(saldoRekAnak) : 0;

      const totalBon = kasbonBarang + kasbonUang + piutangTransferAnak;

      // 3. Titip hasil bumi, pinjaman dana, & hutang kulakan supplier belum dibayar (+ talangan anak perusahaan jika saldo < 0)
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
      const titipPanenMurni = Math.max(0, titipKotor - totalPencairanM) + talanganTransferAnak;

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

      // Total hak mitra keseluruhan yang belum cair di PT = Titip Hasil Panen + Upah Kerja Belum Cair (+ Talangan Anak Perusahaan)
      const totalHakGabungan = titipPanenMurni + upahBelumDibayarKry;

      const canonicalRole = normalizeRoleMitra(m.role, {
        isAnakPerusahaan,
        isKaryawan: Boolean(linkedKry || m.isKaryawan),
      });
      const mitraFoto = m.fotoUrl || linkedKry?.fotoUrl;

      // Hitung rincian Nota Ngunci (Piutang macet — uang tidak bisa kembali) vs Piutang Aktif
      let nominalNotaNgunciMitra = 0;
      let jumlahNotaNgunciMitra = 0;
      let latestCatatanNgunci = m.catatanNgunci;
      let latestTanggalNgunci = m.tanggalNgunci;

      for (const k of unpaidKasbonUang) {
        if (isNoteNgunci(k.isNotaNgunci)) {
          const sisa = k.sisaKasbon || 0;
          nominalNotaNgunciMitra += sisa;
          jumlahNotaNgunciMitra += 1;
          if (k.catatanNgunci) latestCatatanNgunci = k.catatanNgunci;
          if (k.tanggalNgunci) latestTanggalNgunci = k.tanggalNgunci;
          const isNotaLalu =
            Boolean(k.isNotaLalu) ||
            k.rekeningSumber === 'BON01' ||
            Boolean(k.noNotaLalu) ||
            Boolean(k.keterangan?.toLowerCase().includes('nota lalu'));
          const fotoNota =
            k.fotoNotaList && k.fotoNotaList.length > 0
              ? k.fotoNotaList.join('|||')
              : k.fotoNota || '';
          daftarNotaNgunci.push({
            idNota: k.idTransaksi,
            noNota: k.noNotaLalu || k.idTransaksi,
            tanggal: k.tanggalNotaLalu || k.tanggal,
            idMitra: m.id,
            kodeMitra: m.kode,
            namaMitra: m.nama,
            roleMitra: canonicalRole,
            alamat: m.alamat || '-',
            telepon: m.telepon || '-',
            fotoMitra: mitraFoto,
            jenisNota: isNotaLalu ? 'NOTA_LALU_PIUTANG' : 'KASBON_UANG',
            jenisNotaLabel: isNotaLalu ? 'Nota Lalu (Piutang Barang/Bon)' : 'Kasbon Pinjaman Uang',
            rincian: k.rincianBarangNotaLalu || k.keterangan || 'Piutang Nota Lalu',
            catatanNgunci: k.catatanNgunci || m.catatanNgunci,
            tanggalNgunci: k.tanggalNgunci || m.tanggalNgunci,
            fotoNota: fotoNota || undefined,
            nominalAwal: k.nominal || sisa,
            sisaNominalNgunci: sisa,
          });
        }
      }

      for (const p of unpaidPenjualanToko) {
        if (isNoteNgunci(p.isNotaNgunci)) {
          const sisa = p.sisaPiutang || 0;
          nominalNotaNgunciMitra += sisa;
          jumlahNotaNgunciMitra += 1;
          if (p.catatanNgunci) latestCatatanNgunci = p.catatanNgunci;
          if (p.tanggalNgunci) latestTanggalNgunci = p.tanggalNgunci;
          const rincianProduk = (p.items || [])
            .map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`)
            .join(', ');
          daftarNotaNgunci.push({
            idNota: p.noPenjualan,
            noNota: p.noPenjualan,
            tanggal: p.tanggal,
            idMitra: m.id,
            kodeMitra: m.kode,
            namaMitra: m.nama,
            roleMitra: canonicalRole,
            alamat: m.alamat || '-',
            telepon: m.telepon || '-',
            fotoMitra: mitraFoto,
            jenisNota: 'KASBON_BARANG',
            jenisNotaLabel: 'Kasbon Barang Toko',
            rincian: rincianProduk || p.keterangan || 'Kasbon Barang Toko',
            catatanNgunci: p.catatanNgunci || m.catatanNgunci,
            tanggalNgunci: p.tanggalNgunci || m.tanggalNgunci,
            nominalAwal: p.totalNominal || sisa,
            sisaNominalNgunci: sisa,
          });
        }
      }

      for (const j of unpaidPenjualanHasilBumi) {
        if (isNoteNgunci(j.isNotaNgunci)) {
          const sisa = j.sisaPiutang || 0;
          nominalNotaNgunciMitra += sisa;
          jumlahNotaNgunciMitra += 1;
          if (j.catatanNgunci) latestCatatanNgunci = j.catatanNgunci;
          if (j.tanggalNgunci) latestTanggalNgunci = j.tanggalNgunci;
          daftarNotaNgunci.push({
            idNota: j.noPenjualan,
            noNota: j.noSuratJalan || j.noPenjualan,
            tanggal: j.tanggal,
            idMitra: m.id,
            kodeMitra: m.kode,
            namaMitra: m.nama,
            roleMitra: canonicalRole,
            alamat: m.alamat || '-',
            telepon: m.telepon || '-',
            fotoMitra: mitraFoto,
            jenisNota: 'PIUTANG_HASIL_BUMI',
            jenisNotaLabel: 'Piutang Jual Hasil Bumi',
            rincian: `${j.komoditasNama} (${j.beratBersih} Kg @ Rp ${j.hargaJualPerKg.toLocaleString('id-ID')})`,
            catatanNgunci: j.catatanNgunci || m.catatanNgunci,
            tanggalNgunci: j.tanggalNgunci || m.tanggalNgunci,
            nominalAwal: j.totalNominal || sisa,
            sisaNominalNgunci: sisa,
          });
        }
      }

      const nominalPiutangAktifMitra = Math.max(0, totalBon - nominalNotaNgunciMitra);
      const mitraHasNotaNgunci = nominalNotaNgunciMitra > 0 || Boolean(m.isNotaNgunci && totalBon > 0);
      const hasPiutangAktif = nominalPiutangAktifMitra > 0;
      const hasHutangAktif = totalHakGabungan > 0;
      const isNotaAktif = hasPiutangAktif || hasHutangAktif;

      // Penentuan Status Rekening Mitra:
      // - Jika Piutang > Hutang -> PIUTANG
      // - Jika Hutang > Piutang -> HUTANG
      // - Jika ada Piutang & Hutang sama besar (> 0) -> SEIMBANG
      // - Jika hanya ada Nota Ngunci tanpa Piutang Aktif / Hutang berjalan -> NGUNCI
      // - Jika 0 semua -> LUNAS
      const piutangPembanding =
        nominalPiutangAktifMitra > 0
          ? nominalPiutangAktifMitra
          : totalHakGabungan > 0 && totalBon > 0
            ? totalBon
            : 0;
      const bisaKliringSilang = totalBon > 0 && totalHakGabungan > 0;
      const potensiKliringSilang = Math.min(totalBon, totalHakGabungan);

      let statusRekeningMitra: 'PIUTANG' | 'HUTANG' | 'SEIMBANG' | 'NGUNCI' | 'LUNAS' = 'LUNAS';
      let statusNotaLabel: StatusNotaRekapMitra = 'LUNAS_IMPAS';
      if (piutangPembanding > totalHakGabungan) {
        statusRekeningMitra = 'PIUTANG';
        statusNotaLabel = 'PIUTANG';
      } else if (totalHakGabungan > piutangPembanding) {
        statusRekeningMitra = 'HUTANG';
        statusNotaLabel = 'HUTANG';
      } else if (piutangPembanding > 0 && totalHakGabungan > 0 && piutangPembanding === totalHakGabungan) {
        statusRekeningMitra = 'SEIMBANG';
        statusNotaLabel = 'SEIMBANG';
      } else if (mitraHasNotaNgunci) {
        statusRekeningMitra = 'NGUNCI';
        statusNotaLabel = 'NOTA_NGUNCI';
      }

      // Count unique transactions across all linked partner ledgers (+ Karyawan Upah/Slip + Rekening Anak Perusahaan)
      const txIdSet = new Set<string>();
      db.penjualan.filter((p) => p.idMitra === m.id).forEach((p) => txIdSet.add(p.noPenjualan));
      (db.penjualanHasilBumi || []).filter((j) => j.idMitra === m.id).forEach((j) => txIdSet.add(j.noPenjualan));
      mitraHasilBumiList.forEach((pb) => txIdSet.add(pb.noPembelian));
      (db.pembelianBarang || []).filter((pb) => pb.idMitra === m.id).forEach((pb) => txIdSet.add(pb.noPembelian));
      (db.pencairanTitipan || []).filter((pt) => pt.idMitra === m.id).forEach((pt) => txIdSet.add(pt.idPencairan));
      db.kasbonUang.filter((k) => k.idMitra === m.id).forEach((k) => txIdSet.add(k.idTransaksi));
      db.bayarBon.filter((b) => b.idMitra === m.id).forEach((b) => txIdSet.add(b.idTransaksi));
      (db.brilink || []).filter((br) => br.idMitra === m.id).forEach((br) => txIdSet.add(br.idTransaksi));
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

      // Net balance: Total Hak Gabungan - Piutang Aktif (sudah mencakup Piutang/Talangan Rekening Anak Perusahaan sehingga tidak dikurangi 2x)
      const saldoBersih = totalHakGabungan - nominalPiutangAktifMitra;
      const posisiBersihTerpadu = saldoBersih;

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
      totalPiutangAktifGlobal += nominalPiutangAktifMitra;
      totalNominalNotaNgunciGlobal += nominalNotaNgunciMitra;
      if (totalHakGabungan > 0) mitraDenganHutangTitipCount++;
      if (totalBon > 0) mitraDenganBonCount++;
      if (mitraHasNotaNgunci) mitraNotaNgunciCount++;

      // RUMUS INDIVIDU TOTAL REKENING MITRA / NOTA SUPPLIER:
      // Hanya mengurangkan Jumlah Piutang Aktif dengan Jumlah Hutang (TIDAK melibatkan status nota Ngunci)
      const totalRekeningMitraIndividu = nominalPiutangAktifMitra - totalHakGabungan;

      return {
        id: m.id,
        kode: m.kode,
        nama: m.nama,
        role: canonicalRole,
        telepon: m.telepon,
        alamat: m.alamat,
        status: m.status,
        catatan: m.catatan,
        fotoUrl: mitraFoto,
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
        isNotaNgunci: mitraHasNotaNgunci,
        catatanNgunci: latestCatatanNgunci,
        tanggalNgunci: latestTanggalNgunci,
        statusNotaLabel,
        nominalPiutangAktif: nominalPiutangAktifMitra,
        nominalNotaNgunci: nominalNotaNgunciMitra,
        jumlahNotaNgunci: jumlahNotaNgunciMitra,
        hasPiutangAktif,
        hasHutangAktif,
        hasNotaNgunci: mitraHasNotaNgunci,
        isNotaAktif,
        statusRekeningMitra,
        bisaKliringSilang,
        potensiKliringSilang,
        potonganSilangOtomatis: Math.min(totalHakGabungan, nominalPiutangAktifMitra > 0 ? nominalPiutangAktifMitra : totalBon),
        sisaBonBersih: Math.max(0, nominalPiutangAktifMitra - totalHakGabungan),
        sisaTitipanBersih: Math.max(0, totalHakGabungan - nominalPiutangAktifMitra),
        uangKitaDiMitraIndividu: totalRekeningMitraIndividu,
        totalRekeningMitraIndividu,
        saldoBersih,
        posisiStatus,
        totalTransaksiCount: txCount,
      };
    });

    const mitraPiutangAktifCount = items.filter((it) => (it.nominalPiutangAktif || 0) > 0).length;
    const mitraNotaAktifCount = items.filter((it) => Boolean(it.isNotaAktif)).length;
    const mitraSiapKliringSilangCount = items.filter((it) => Boolean(it.bisaKliringSilang)).length;

    // RUMUS RESMI TOTAL REKENING MITRA / NOTA SUPPLIER:
    // Hanya mengurangkan Jumlah Piutang (Aktif) dengan Jumlah Hutang (Uang Titip & HB Titip)
    // TIDAK MELIBATKAN STATUS NOTA YANG NGUNCI!
    // (Status Nota Ngunci hanya berguna/berkurang otomatis jika mitra terkait melakukan pembayaran)
    const totalSeluruhPiutangMitra = totalBonMitra;
    const totalNotaSupplierRekeningMitra = totalHutangPerusahaanKeMitra;
    const totalRekeningMitraNotaSupplier = totalPiutangAktifGlobal - totalNotaSupplierRekeningMitra;
    const uangKitaDiMitra = totalRekeningMitraNotaSupplier;
    const uangKitaDiMitraEfektif = totalRekeningMitraNotaSupplier;

    return {
      totalMitra: db.mitra.length,
      totalHutangPerusahaanKeMitra,
      totalTitipPanenMurni: totalTitipPanenMurniGlobal,
      totalUpahKaryawanBelumDibayar: totalUpahKaryawanBelumDibayarGlobal,
      totalBonMitra,
      saldoBersihKemitraan: totalHutangPerusahaanKeMitra - totalPiutangAktifGlobal,
      mitraDenganHutangTitipCount,
      mitraDenganBonCount,
      mitraPiutangAktifCount,
      mitraNotaAktifCount,
      mitraSiapKliringSilangCount,
      totalSeluruhPiutangMitra,
      totalPiutangAktifMitra: totalPiutangAktifGlobal,
      totalNominalNotaNgunci: totalNominalNotaNgunciGlobal,
      mitraNotaNgunciCount,
      totalLembarNotaNgunci: daftarNotaNgunci.length,
      totalNotaSupplierRekeningMitra,
      totalRekeningMitraNotaSupplier,
      uangKitaDiMitra,
      uangKitaDiMitraEfektif,
      daftarNotaNgunci,
      items,
    };
  }

  // ==========================================
  // 7. DASHBOARD STATS
  // ==========================================
  public static getDashboardStats() {
    const db = dbManager.get();

    // Total omzet penjualan toko & hasil bumi (termasuk realisasi Uang Masuk dari penjualan HB belum putus harga)
    const totalPenjualan = db.penjualan.reduce((s, p) => s + p.totalNominal, 0);
    const totalPenjualanHasilBumi = (db.penjualanHasilBumi || []).reduce(
      (s, j) =>
        s +
        (j.metodePembayaran === 'BELUM_PUTUS_HARGA'
          ? Number(j.nominalUangMasukTerkumpul) || 0
          : Number(j.totalNominal) || 0),
      0
    );
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

    // Nilai persediaan stok barang toko (stok * hargaJual), exclude item tanpa stok (Alat/Jasa)
    const nilaiStokBarang = db.stokBarang.reduce((s, sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      if (isProdukTanpaStok(prd || sb, db.kategoriProduk)) return s;
      return s + sb.stok * (prd ? prd.hargaJual : 0);
    }, 0);

    // Total volume stok hasil bumi ready di gudang
    const totalVolumeHasilBumiKg = db.stokHasilBumi
      .filter((h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN'))
      .reduce((s, hb) => s + (hb.stok || 0), 0);

    // Peringatan stok menipis (kecualikan item Tanpa Stok seperti kategori Alat)
    const stokMenipis = db.stokBarang.filter((sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      if (isProdukTanpaStok(prd || sb, db.kategoriProduk)) return false;
      return sb.stok <= sb.minimum;
    });

    // 10 Transaksi Terakhir (gabungan)
    type RecentTx = {
      id: string;
      tanggal: string;
      jam: string;
      createdAt: string;
      kategori:
        | 'PENJUALAN'
        | 'PEMBELIAN_HASIL_BUMI'
        | 'PEMBELIAN_BARANG'
        | 'KASBON_UANG'
        | 'BAYAR_BON'
        | 'TRANSFER_REKENING'
        | 'PENGGAJIAN'
        | 'BRILINK'
        | 'UANG_MASUK';
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

    if (db.brilink) {
      for (const br of db.brilink.slice(0, 10)) {
        recentTx.push({
          id: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam,
          createdAt: br.createdAt,
          kategori: 'BRILINK',
          label:
            br.jenisBrilink === 'TARIK_TUNAI'
              ? `BRILink Adm Tarik Tunai (+)`
              : `BRILink Adm Tukar Cash (−)`,
          nominal: br.nominalAdmin,
          pihakTerkait: br.namaPelanggan,
          rekening: br.rekeningAdmin,
          status: br.status,
          fotoNota: br.fotoBukti,
        });
      }
    }

    if (db.uangMasuk) {
      for (const um of db.uangMasuk.slice(0, 10)) {
        recentTx.push({
          id: um.idTransaksi,
          tanggal: um.tanggal,
          jam: um.jam,
          createdAt: um.createdAt,
          kategori: 'UANG_MASUK',
          label: `Uang Masuk (+): ${um.kategori}`,
          nominal: um.nominal,
          pihakTerkait: um.namaPengirim,
          rekening: um.rekeningTujuan,
          status: 'BERHASIL',
          fotoNota: um.fotoBukti,
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
      (p) =>
        isSameDate(p.tanggal) &&
        p.metode !== 'KASBON' &&
        p.metode !== 'SINKRON' &&
        p.metode !== 'INTERNAL_PT' &&
        p.metode !== 'PEMAKAIAN_PENGELUARAN' &&
        !p.isNotaSilang &&
        p.rekeningTujuan !== 'INTERNAL_PT' &&
        p.rekeningTujuan !== 'SINKRON' &&
        p.rekeningTujuan !== 'PENGELUARAN'
    );
    const penjualanHasilBumiHariIni = (db.penjualanHasilBumi || []).filter(
      (j) =>
        isSameDate(j.tanggal) &&
        j.metodePembayaran !== 'PIUTANG' &&
        j.metodePembayaran !== 'BELUM_PUTUS_HARGA' &&
        j.metodePembayaran !== 'SINKRON' &&
        j.rekeningTujuan !== 'SINKRON'
    );
    const uangMasukHariIni = (db.uangMasuk || []).filter(
      (um) =>
        isSameDate(um.tanggal) &&
        (um.nominal || 0) > 0 &&
        um.metode !== 'SINKRON' &&
        um.rekeningTujuan !== 'SINKRON'
    );
    const totalUangMasukMenu = uangMasukHariIni.reduce((s, um) => s + (um.nominal || 0), 0);
    const brilinkMasukHariIni = (db.brilink || []).filter(
      (br) => isSameDate(br.tanggal) && br.jenisBrilink === 'TARIK_TUNAI' && (br.nominalAdmin || 0) > 0
    );
    const totalBrilinkAdminMasuk = brilinkMasukHariIni.reduce(
      (s, br) => s + (br.nominalAdmin || 0),
      0
    );
    const totalPenjualanMasuk =
      penjualanHariIni.reduce((s, p) => s + (p.totalNominal || 0), 0) +
      penjualanHasilBumiHariIni.reduce((s, j) => s + (j.totalNominal || 0), 0) +
      totalUangMasukMenu +
      totalBrilinkAdminMasuk;

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
      (t) =>
        isSameDate(t.tanggal) &&
        t.rekeningTujuan === 'KAS01' &&
        (!t.status || t.status === 'BERHASIL')
    );
    const totalTransferMasuk = transferMasukHariIni.reduce((s, t) => s + (t.nominal || 0), 0);

    const totalUangMasuk = totalPenjualanMasuk + totalBayarBon + totalPinjamanDanaMasuk + totalTransferMasuk;

    // 2. UANG KELUAR RIIL (PENGELUARAN KAS & BANK + PENGEMBALIAN KASIR KE BERANGKAS/BANK)
    const pengeluaranHariIni = (db.pengeluaran || []).filter(
      (p) =>
        isSameDate(p.tanggal) &&
        !p.isNonKas &&
        p.rekeningSumber !== 'SINKRON' &&
        p.rekeningSumber !== 'STOK_INTERNAL'
    );
    const brilinkKeluarHariIni = (db.brilink || []).filter(
      (br) => isSameDate(br.tanggal) && br.jenisBrilink === 'TUKAR_CASH' && (br.nominalAdmin || 0) > 0
    );
    const totalBrilinkAdminKeluar = brilinkKeluarHariIni.reduce(
      (s, br) => s + (br.nominalAdmin || 0),
      0
    );
    const totalPengeluaranDivisi =
      pengeluaranHariIni.reduce((s, p) => s + (p.nominal || 0), 0) + totalBrilinkAdminKeluar;

    const beliHasilBumiHariIni = (db.pembelianHasilBumi || []).filter(
      (b) =>
        isSameDate(b.tanggal) &&
        b.metodePembayaran !== 'TITIP' &&
        b.metodePembayaran !== 'SINKRON' &&
        b.rekeningSumber !== 'SINKRON' &&
        b.komoditasKode !== 'PINJAMAN_DANA' &&
        b.komoditasKode !== 'TITIP_DANA' &&
        b.komoditasKode !== 'NOTA_SILANG' &&
        !b.isNotaSilang &&
        !b.komoditasNama?.includes('Pinjaman Uang')
    );
    const totalBeliHasilBumi = beliHasilBumiHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);

    const kasbonUangHariIni = (db.kasbonUang || []).filter(
      (k) =>
        isSameDate(k.tanggal) &&
        !k.isNotaLalu &&
        k.rekeningSumber !== 'BON01' &&
        k.rekeningSumber !== 'SINKRON' &&
        k.metode !== 'SINKRON'
    );
    const totalKasbonUang = kasbonUangHariIni.reduce((s, k) => s + (k.nominal || 0), 0);

    const beliBarangHariIni = (db.pembelianBarang || []).filter(
      (b) =>
        isSameDate(b.tanggal) &&
        b.metodePembayaran !== 'HUTANG' &&
        b.metodePembayaran !== 'SINKRON' &&
        b.rekeningSumber !== 'SINKRON'
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

    const gajiHariIni = (db.penggajian || []).filter(
      (g) => isSameDate(g.tanggal) && g.metodePembayaran !== 'SINKRON' && g.rekeningSumber !== 'SINKRON'
    );
    const totalGaji = gajiHariIni.reduce((s, g) => s + (g.gajiBersihDibayar || 0), 0);

    const transferKeluarKasirHariIni = (db.transferRekening || []).filter(
      (t) =>
        isSameDate(t.tanggal) &&
        t.rekeningSumber === 'KAS01' &&
        (!t.status || t.status === 'BERHASIL')
    );
    const totalSetorKeluarKasir = transferKeluarKasirHariIni.reduce(
      (s, t) => s + (t.nominal || 0),
      0
    );

    const totalUangKeluar =
      totalPengeluaranDivisi +
      totalBeliHasilBumi +
      totalKasbonUang +
      totalBeliBarang +
      totalPencairanTitipan +
      totalGaji +
      totalSetorKeluarKasir;

    const arusKasBersih = totalUangMasuk - totalUangKeluar;

    // Hitung Saldo Akhir / Selisih Kasir (KAS01) murni per hari (Saldo Awal Kasir Pagi = Rp 0, tidak menarik hari lain)
    const kasirInPenjualan = penjualanHariIni
      .filter((p) => p.rekeningTujuan === 'KAS01' || p.metode === 'TUNAI')
      .reduce((s, p) => s + (p.totalNominal || 0), 0);
    const kasirInPenjualanHb = penjualanHasilBumiHariIni
      .filter((j) => j.rekeningTujuan === 'KAS01' || j.metodePembayaran === 'TUNAI')
      .reduce((s, j) => s + (j.totalNominal || 0), 0);
    const kasirInUangMasuk = uangMasukHariIni
      .filter((um) => um.rekeningTujuan === 'KAS01' || um.metode === 'TUNAI')
      .reduce((s, um) => s + (um.nominal || 0), 0);
    const kasirInBayarBon = bayarBonHariIni
      .filter((b) => b.rekeningTujuan === 'KAS01' || b.metode === 'TUNAI')
      .reduce((s, b) => s + (b.nominalBayar || 0), 0);
    const kasirInPinjamanDana = pinjamanDanaMasukHariIni
      .filter((b) => b.rekeningSumber === 'KAS01')
      .reduce((s, b) => s + (b.totalNominal || 0), 0);

    let kasirDeltaBrilink = 0;
    for (const br of (db.brilink || []).filter((x) => isSameDate(x.tanggal))) {
      const nomAdm = Math.round(Number(br.nominalAdmin) || 0);
      const nomPokok = Math.round(Number(br.nominalPokok) || 0);
      const rekAdm = br.rekeningAdmin || 'KAS01';
      const rekPokok = br.rekeningKasTunai || 'KAS01';
      if (br.jenisBrilink === 'TARIK_TUNAI') {
        if (rekAdm === 'KAS01') kasirDeltaBrilink += nomAdm;
        if (rekPokok === 'KAS01') kasirDeltaBrilink -= nomPokok;
      } else {
        if (rekAdm === 'KAS01') kasirDeltaBrilink -= nomAdm;
        if (rekPokok === 'KAS01') kasirDeltaBrilink += nomPokok;
      }
    }

    const kasirOutPengeluaran = pengeluaranHariIni
      .filter((p) => (p.rekeningSumber || 'KAS01') === 'KAS01')
      .reduce((s, p) => s + (p.nominal || 0), 0);
    const kasirOutBeliHb = beliHasilBumiHariIni
      .filter((b) => b.rekeningSumber === 'KAS01' || b.metodePembayaran === 'TUNAI')
      .reduce((s, b) => s + (b.totalNominal || 0), 0);
    const kasirOutKasbon = kasbonUangHariIni
      .filter((k) => k.rekeningSumber === 'KAS01' || k.metode === 'TUNAI')
      .reduce((s, k) => s + (k.nominal || 0), 0);
    const kasirOutBeliBarang = beliBarangHariIni
      .filter((b) => b.rekeningSumber === 'KAS01' || b.metodePembayaran === 'TUNAI')
      .reduce((s, b) => s + (b.totalNominal || 0), 0);
    const kasirOutPencairan = pencairanTitipanHariIni
      .filter((pt) => pt.rekeningSumber === 'KAS01' || pt.metodePembayaran === 'TUNAI')
      .reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const kasirOutGaji = gajiHariIni
      .filter((g) => this.isKasirPayrollRecord(db, g, 'KAS01'))
      .reduce((s, g) => s + (g.gajiBersihDibayar || 0), 0);
    const kasirOpnameHariIni = (db.cashOpnameLogs || [])
      .filter((op) => op.sesuaikanSaldoSistem && isSameDate(op.tanggal))
      .reduce((s, op) => s + (op.selisih || 0), 0);

    const saldoKasFisik =
      0 +
      kasirInPenjualan +
      kasirInPenjualanHb +
      kasirInUangMasuk +
      kasirInBayarBon +
      kasirInPinjamanDana +
      totalTransferMasuk +
      kasirDeltaBrilink -
      kasirOutPengeluaran -
      kasirOutBeliHb -
      kasirOutKasbon -
      kasirOutBeliBarang -
      kasirOutPencairan -
      kasirOutGaji -
      totalSetorKeluarKasir +
      kasirOpnameHariIni;
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
    brilinkKeluarHariIni.forEach((br) => {
      const d = br.divisi || 'BRILink';
      const cur = divMap.get(d) || { total: 0, count: 0 };
      divMap.set(d, { total: cur.total + br.nominalAdmin, count: cur.count + 1 });
    });
    gajiHariIni.forEach((g) => {
      const amt = Number(g.gajiBersihDibayar) || 0;
      if (amt <= 0 || isTanpaDivisi(g.divisi)) return;
      const d = g.divisi || 'Gudang Wijaya Agro';
      const cur = divMap.get(d) || { total: 0, count: 0 };
      divMap.set(d, { total: cur.total + amt, count: cur.count + 1 });
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
          uangMasukHariIni.length +
          brilinkMasukHariIni.length +
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
        setorKeBerangkas: totalSetorKeluarKasir,
        jumlahTransaksi:
          pengeluaranHariIni.length +
          brilinkKeluarHariIni.length +
          beliHasilBumiHariIni.length +
          kasbonUangHariIni.length +
          beliBarangHariIni.length +
          pencairanTitipanHariIni.length +
          gajiHariIni.length +
          transferKeluarKasirHariIni.length,
      },
      arusKasBersih,
      saldoKasFisik,
      saldoTotalBank,
      totalSaldoRil: saldoKasFisik + saldoTotalBank,
      rekapDivisiHariIni,
    };
  }

  // ==========================================
  // 7B. TRANSAKSI AGEN BRILINK (ADM TARIK TUNAI & ADM TUKAR CASH RUPIAH PT)
  // ==========================================
  public static async processBrilink(params: {
    jenisBrilink?: JenisTransaksiBrilink;
    jenisTransaksi?: JenisTransaksiBrilink;
    idMitra?: string;
    namaPelangganManual?: string;
    teleponPelanggan?: string;
    divisi?: string;
    rekeningAdmin: string;
    rekeningBank?: string;
    rekeningPokokBank?: string;
    nominalAdmin: number;
    nominalPokok?: number;
    tanggal?: string;
    keterangan?: string;
    fotoBukti?: string;
  }): Promise<TransaksiBrilink> {
    return dbManager.executeTransaction((db) => {
      const { tanggal: todayWib, jam, iso } = getWIBDateTime();

      const finalTanggal = normalizeDateToDmy(params.tanggal, todayWib);

      const rawJenis = params.jenisBrilink || params.jenisTransaksi;
      const jenisBrilink: JenisTransaksiBrilink =
        rawJenis === 'TUKAR_CASH' ? 'TUKAR_CASH' : 'TARIK_TUNAI';
      const arusAdmin: 'MASUK' | 'KELUAR' = jenisBrilink === 'TARIK_TUNAI' ? 'MASUK' : 'KELUAR';

      const nominalAdmin = Math.round(Number(params.nominalAdmin) || 0);
      const nominalPokok = Math.max(0, Math.round(Number(params.nominalPokok) || 0));

      if (nominalAdmin < 0 || (nominalAdmin === 0 && nominalPokok <= 0)) {
        throw new Error(
          jenisBrilink === 'TARIK_TUNAI'
            ? 'Masukkan Nominal Pokok Tarik Tunai atau Nominal Biaya Admin (> Rp 0)'
            : 'Masukkan Nominal Pokok Tukar Cash atau Nominal Biaya Admin (> Rp 0)'
        );
      }

      // Resolve customer / partner
      let finalMitraId = 'UMUM';
      let finalNamaPelanggan = (params.namaPelangganManual || '').trim() || 'Nasabah Umum BRILink';
      let finalTelepon = (params.teleponPelanggan || '').trim();

      if (params.idMitra && params.idMitra !== 'UMUM') {
        const foundMitra = db.mitra.find((m) => m.id === params.idMitra);
        if (foundMitra) {
          finalMitraId = foundMitra.id;
          finalNamaPelanggan = foundMitra.nama;
          if (!finalTelepon && foundMitra.telepon && foundMitra.telepon !== '-') {
            finalTelepon = foundMitra.telepon;
          }
        }
      }

      // Validate rekeningAdmin
      const adminAcc = db.rekening.find((r) => r.kode === params.rekeningAdmin);
      if (!adminAcc) {
        throw new Error(`Rekening Admin (${params.rekeningAdmin}) tidak ditemukan`);
      }
      if (adminAcc.isVirtual || adminAcc.kategori === 'OPERASIONAL_DIVISI') {
        throw new Error(
          `Pilih rekening Kas Tunai (KAS01) atau Rekening Bank PT aktif untuk pencatatan Admin BRILink`
        );
      }
      if (adminAcc.status !== 'AKTIF') {
        throw new Error(`Rekening ${adminAcc.nama} sedang nonaktif`);
      }

      // Compute atomic net deltas per rekening before mutating
      const deltaByKode = new Map<string, number>();
      const addDelta = (kode: string, delta: number) => {
        if (!delta) return;
        deltaByKode.set(kode, (deltaByKode.get(kode) || 0) + delta);
      };

      let finalRekeningBank: string | undefined = undefined;
      let finalRekeningKasTunai: string | undefined = undefined;

      if (nominalPokok > 0) {
        let bankKode = (params.rekeningBank || params.rekeningPokokBank || '').trim();
        if (!bankKode || bankKode === 'KAS01') {
          const defaultBri =
            db.rekening.find((r) => r.kode === 'BRI01' && r.status === 'AKTIF') ||
            db.rekening.find(
              (r) =>
                !r.isVirtual &&
                r.kategori !== 'OPERASIONAL_DIVISI' &&
                r.kode !== 'KAS01' &&
                r.status === 'AKTIF' &&
                /\bbri\b/i.test(`${r.kode} ${r.nama}`)
            ) ||
            db.rekening.find(
              (r) =>
                !r.isVirtual &&
                r.kategori !== 'OPERASIONAL_DIVISI' &&
                r.kode !== 'KAS01' &&
                r.kode !== 'BRK01' &&
                r.status === 'AKTIF'
            );
          bankKode = defaultBri?.kode || '';
        }
        if (!bankKode || bankKode === 'KAS01') {
          throw new Error(
            'Untuk transaksi dengan Nominal Pokok > Rp 0, pilih Rekening Bank PT operasional (misal BRI, BNI, BCA, Mandiri)'
          );
        }
        const bankAcc = db.rekening.find((r) => r.kode === bankKode);
        if (!bankAcc || bankAcc.isVirtual || bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(`Rekening Bank (${bankKode}) tidak valid`);
        }
        if (bankAcc.status !== 'AKTIF') {
          throw new Error(`Rekening Bank ${bankAcc.nama} tidak aktif`);
        }
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) {
          throw new Error('Rekening Kas Tunai (KAS01) tidak ditemukan');
        }

        finalRekeningBank = bankAcc.kode;
        finalRekeningKasTunai = 'KAS01';

        if (jenisBrilink === 'TARIK_TUNAI') {
          // Nasabah gesek/transfer ke Bank PT (+Pokok), Kasir serahkan uang fisik dari KAS01 (-Pokok)
          addDelta(bankAcc.kode, nominalPokok);
          addDelta('KAS01', -nominalPokok);
        } else {
          // PT tukar cash rupiah: Bank PT keluar (-Pokok), Kas Tunai KAS01 terima uang fisik (+Pokok)
          addDelta(bankAcc.kode, -nominalPokok);
          addDelta('KAS01', nominalPokok);
        }
      }

      // Mutasi Fokus Utama: Uang Masuk (+) Adm Tarik Tunai ATAU Uang Keluar (-) Adm Tukar Cash
      if (jenisBrilink === 'TARIK_TUNAI') {
        addDelta(adminAcc.kode, nominalAdmin);
      } else {
        addDelta(adminAcc.kode, -nominalAdmin);
      }

      // Validate sufficiency on all affected accounts
      for (const [kode, delta] of deltaByKode.entries()) {
        if (delta < 0) {
          const acc = db.rekening.find((r) => r.kode === kode);
          if (!acc) throw new Error(`Rekening ${kode} tidak ditemukan`);
          if (!this.isAnakPerusahaanRekening(acc) && acc.saldoSaatIni + delta < 0) {
            throw new Error(
              `Saldo ${acc.nama} (${acc.kode}) tidak mencukupi. Tersedia: Rp ${acc.saldoSaatIni.toLocaleString(
                'id-ID'
              )}, dibutuhkan pengurangan bersih: Rp ${Math.abs(delta).toLocaleString('id-ID')}`
            );
          }
        }
      }

      // Apply mutations atomically
      for (const [kode, delta] of deltaByKode.entries()) {
        const acc = db.rekening.find((r) => r.kode === kode);
        if (acc) {
          acc.saldoSaatIni += delta;
        }
      }

      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : (params.divisi || '').trim() || 'BRILink';
      if (!isTanpaDivisi(finalDivisi)) {
        dbManager.ensureDivisiRegisteredInMemory(finalDivisi);
      }

      const idTransaksi = generateId('BRI');
      const defaultKet =
        jenisBrilink === 'TARIK_TUNAI'
          ? nominalPokok > 0
            ? `Jasa Tarik Tunai BRILink (${finalNamaPelanggan}) · Pokok Rp ${nominalPokok.toLocaleString('id-ID')} (-KAS01 → +${finalRekeningBank})${nominalAdmin > 0 ? ` · Adm Rp ${nominalAdmin.toLocaleString('id-ID')}` : ''}`
            : `Adm Tarik Tunai BRILink (${finalNamaPelanggan})`
          : `Adm Tukar Cash Rupiah PT (${finalNamaPelanggan})${
              nominalPokok > 0 ? ` · Pokok Rp ${nominalPokok.toLocaleString('id-ID')}` : ''
            }`;

      const record: TransaksiBrilink = {
        idTransaksi,
        tanggal: finalTanggal,
        jam,
        jenisBrilink,
        arusAdmin,
        idMitra: finalMitraId,
        namaPelanggan: finalNamaPelanggan,
        teleponPelanggan: finalTelepon || undefined,
        divisi: finalDivisi,
        rekeningAdmin: adminAcc.kode,
        rekeningBank: finalRekeningBank,
        rekeningKasTunai: finalRekeningKasTunai,
        nominalAdmin,
        nominalPokok,
        keterangan: (params.keterangan || '').trim() || defaultKet,
        fotoBukti: params.fotoBukti || undefined,
        status: 'BERHASIL',
        createdAt: iso,
      };

      if (!Array.isArray(db.brilink)) {
        db.brilink = [];
      }
      db.brilink.unshift(record);

      this.addAuditLog(
        db,
        'CREATE',
        idTransaksi,
        jenisBrilink === 'TARIK_TUNAI'
          ? `BRILink Uang Masuk (+) Adm Tarik Tunai Rp ${nominalAdmin.toLocaleString('id-ID')} -> ${adminAcc.kode}${
              nominalPokok > 0
                ? ` [Mutasi Pokok: +${finalRekeningBank} / -KAS01 Rp ${nominalPokok.toLocaleString('id-ID')}]`
                : ''
            } (${finalNamaPelanggan})`
          : `BRILink Uang Keluar (-) Adm Tukar Cash Rupiah PT Rp ${nominalAdmin.toLocaleString('id-ID')} dari ${adminAcc.kode}${
              nominalPokok > 0
                ? ` [Mutasi Pokok: -${finalRekeningBank} / +KAS01 Rp ${nominalPokok.toLocaleString('id-ID')}]`
                : ''
            } (${finalNamaPelanggan})`,
        nominalAdmin,
        adminAcc.kode
      );

      dbManager.synchronizeVirtualAccounts();
      return record;
    });
  }

  public static getBrilinkList(): TransaksiBrilink[] {
    const db = dbManager.get();
    return Array.isArray(db.brilink) ? db.brilink : [];
  }

  public static async deleteBrilink(idTransaksi: string): Promise<{ deleted: TransaksiBrilink }> {
    return dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.brilink)) {
        throw new Error('Data transaksi BRILink kosong');
      }
      const idx = db.brilink.findIndex((x) => x.idTransaksi === idTransaksi);
      if (idx === -1) {
        throw new Error(`Transaksi BRILink ${idTransaksi} tidak ditemukan`);
      }

      const target = db.brilink[idx];
      const reverseDelta = new Map<string, number>();
      const addRev = (kode: string | undefined, delta: number) => {
        if (!kode || !delta) return;
        reverseDelta.set(kode, (reverseDelta.get(kode) || 0) + delta);
      };

      if (target.nominalPokok > 0 && target.rekeningBank) {
        const kasKode = target.rekeningKasTunai || 'KAS01';
        if (target.jenisBrilink === 'TARIK_TUNAI') {
          addRev(target.rekeningBank, -target.nominalPokok);
          addRev(kasKode, target.nominalPokok);
        } else {
          addRev(target.rekeningBank, target.nominalPokok);
          addRev(kasKode, -target.nominalPokok);
        }
      }

      if (target.jenisBrilink === 'TARIK_TUNAI') {
        addRev(target.rekeningAdmin, -target.nominalAdmin);
      } else {
        addRev(target.rekeningAdmin, target.nominalAdmin);
      }

      for (const [kode, delta] of reverseDelta.entries()) {
        if (delta < 0) {
          const acc = db.rekening.find((r) => r.kode === kode);
          if (acc && !this.isAnakPerusahaanRekening(acc) && acc.saldoSaatIni + delta < 0) {
            throw new Error(
              `Tidak dapat membatalkan ${idTransaksi}: Saldo ${acc.nama} (${acc.kode}) tersisa Rp ${acc.saldoSaatIni.toLocaleString(
                'id-ID'
              )}, dibutuhkan pengembalian Rp ${Math.abs(delta).toLocaleString('id-ID')}`
            );
          }
        }
      }

      for (const [kode, delta] of reverseDelta.entries()) {
        const acc = db.rekening.find((r) => r.kode === kode);
        if (acc) {
          acc.saldoSaatIni += delta;
        }
      }

      db.brilink.splice(idx, 1);

      this.addAuditLog(
        db,
        'VOID',
        idTransaksi,
        `Pembatalan Transaksi BRILink ${idTransaksi} (${target.namaPelanggan}) Adm Rp ${target.nominalAdmin.toLocaleString(
          'id-ID'
        )} - Saldo rekening dikembalikan akurat`,
        target.nominalAdmin,
        target.rekeningAdmin
      );

      dbManager.synchronizeVirtualAccounts();
      return { deleted: target };
    });
  }

  // ==========================================
  // 7C. TRANSAKSI UANG MASUK (+) & REALISASI PENJUALAN HASIL BUMI BELUM PUTUS HARGA
  // ==========================================
  public static getUangMasukList(): TransaksiUangMasuk[] {
    const db = dbManager.get();
    return Array.isArray(db.uangMasuk) ? db.uangMasuk : [];
  }

  public static async processUangMasuk(params: {
    divisi?: string;
    kategori?: string;
    keterangan?: string;
    nominal: number;
    metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    rekeningTujuan?: string;
    idMitra?: string;
    namaPengirimManual?: string;
    noPenjualanHasilBumi?: string;
    tandaiPutusLunas?: boolean;
    tanggal?: string;
    fotoBukti?: string;
  }): Promise<TransaksiUangMasuk> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: todayWib, jam, iso } = getWIBDateTime();
      if (!Array.isArray(db.uangMasuk)) db.uangMasuk = [];
      if (!Array.isArray(db.penjualanHasilBumi)) db.penjualanHasilBumi = [];

      const nominal = Math.round(Number(params.nominal) || 0);
      if (nominal <= 0) {
        throw new Error('Nominal Uang Masuk wajib lebih dari Rp 0');
      }

      const finalTanggal = normalizeDateToDmy(params.tanggal, todayWib);
      const isSinkronMasuk = params.metode === 'SINKRON' || params.rekeningTujuan === 'SINKRON';

      // Validasi rekening penerima
      let finalRekeningTujuan = 'KAS01';
      if (isSinkronMasuk) {
        finalRekeningTujuan = 'SINKRON';
      } else if (params.metode === 'TUNAI') {
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening Kas Tunai (KAS01) tidak ditemukan');
        finalRekeningTujuan = 'KAS01';
        kasAcc.saldoSaatIni += nominal;
      } else {
        const bankKode = (params.rekeningTujuan || '').trim();
        if (
          !bankKode ||
          bankKode === 'KAS01' ||
          bankKode === 'BON01' ||
          bankKode === 'TIT01' ||
          bankKode === 'SINKRON'
        ) {
          throw new Error('Pilih Rekening Bank PT tujuan transfer Uang Masuk yang valid');
        }
        const bankAcc = db.rekening.find((r) => r.kode === bankKode);
        if (!bankAcc) throw new Error(`Rekening ${bankKode} tidak ditemukan`);
        if (bankAcc.isVirtual || bankAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(
            `Rekening "${bankAcc.nama}" bukan rekening bank riil. Pilih rekening bank PT aktif.`
          );
        }
        if (bankAcc.status !== 'AKTIF') {
          throw new Error(`Rekening ${bankAcc.nama} sedang nonaktif`);
        }
        finalRekeningTujuan = bankAcc.kode;
        bankAcc.saldoSaatIni += nominal;
      }

      // Cek apakah terhubung ke Nota Penjualan / Muat Hasil Bumi (JHB-...)
      let linkedJhb: TransaksiPenjualanHasilBumi | undefined = undefined;
      if (params.noPenjualanHasilBumi && params.noPenjualanHasilBumi.trim()) {
        linkedJhb = db.penjualanHasilBumi.find(
          (j) => j.noPenjualan === params.noPenjualanHasilBumi?.trim()
        );
        if (!linkedJhb) {
          throw new Error(`Nota Penjualan Hasil Bumi ${params.noPenjualanHasilBumi} tidak ditemukan`);
        }
      }

      // Resolve Mitra / Pengirim
      let finalMitraId = linkedJhb?.idMitra || 'UMUM';
      let finalNamaPengirim =
        (params.namaPengirimManual || '').trim() ||
        linkedJhb?.namaMitra ||
        'Pembeli / Pengirim Umum';

      if (params.idMitra && params.idMitra !== 'UMUM') {
        const foundMitra = db.mitra.find((m) => m.id === params.idMitra);
        if (foundMitra) {
          finalMitraId = foundMitra.id;
          finalNamaPengirim = foundMitra.nama;
        }
      }

      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : (params.divisi || '').trim() || linkedJhb?.divisi || 'PT Wijaya Agro Perkasa';
      if (!isTanpaDivisi(finalDivisi)) {
        dbManager.ensureDivisiRegisteredInMemory(finalDivisi);
      }

      const finalKategori =
        (params.kategori || '').trim() ||
        (linkedJhb ? 'Penjualan Hasil Bumi' : 'Penerimaan Operasional');

      const idTransaksi = generateId('UMS');

      let hargaRealisasiPerKg: number | undefined = undefined;
      if (linkedJhb) {
        const prevTerkumpul = Number(linkedJhb.nominalUangMasukTerkumpul) || 0;
        const totalTerkumpulBaru = prevTerkumpul + nominal;
        linkedJhb.nominalUangMasukTerkumpul = totalTerkumpulBaru;
        if (!Array.isArray(linkedJhb.idUangMasukList)) {
          linkedJhb.idUangMasukList = [];
        }
        linkedJhb.idUangMasukList.push(idTransaksi);

        const isLunas = params.tandaiPutusLunas !== false;
        linkedJhb.statusUangMasuk = isLunas ? 'LUNAS' : 'SEBAGIAN';
        if (linkedJhb.metodePembayaran === 'BELUM_PUTUS_HARGA') {
          linkedJhb.statusPembayaran = isLunas ? 'LUNAS' : 'MENUNGGU_UANG_MASUK';
          if (linkedJhb.beratBersih > 0) {
            hargaRealisasiPerKg = Math.round(totalTerkumpulBaru / linkedJhb.beratBersih);
            linkedJhb.hargaJualPerKg = hargaRealisasiPerKg;
          }
          const modalPengurang =
            Number(linkedJhb.nilaiModalPengurangStok) || Number(linkedJhb.totalModalHpp) || 0;
          linkedJhb.labaKotor = totalTerkumpulBaru - modalPengurang;
        }
      }

      const defaultKet = linkedJhb
        ? `Pencairan Hasil Penjualan ${linkedJhb.komoditasNama} (${linkedJhb.beratBersih.toLocaleString(
            'id-ID'
          )} Kg · Nota ${linkedJhb.noPenjualan}) dari ${finalNamaPengirim}`
        : `Uang Masuk (${finalKategori}) dari ${finalNamaPengirim}`;

      const record: TransaksiUangMasuk = {
        idTransaksi,
        tanggal: finalTanggal,
        jam,
        divisi: finalDivisi,
        kategori: finalKategori,
        keterangan: (params.keterangan || '').trim() || defaultKet,
        nominal,
        metode: isSinkronMasuk ? 'SINKRON' : params.metode,
        rekeningTujuan: finalRekeningTujuan,
        idMitra: finalMitraId,
        namaPengirim: finalNamaPengirim,
        noPenjualanHasilBumi: linkedJhb?.noPenjualan,
        komoditasNama: linkedJhb?.komoditasNama,
        beratMuatKg: linkedJhb?.beratBersih,
        nilaiModalStok: linkedJhb
          ? Number(linkedJhb.nilaiModalPengurangStok) || Number(linkedJhb.totalModalHpp) || 0
          : undefined,
        hargaRealisasiPerKg,
        fotoBukti: params.fotoBukti || undefined,
        createdAt: iso,
      };

      db.uangMasuk.unshift(record);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'CREATE',
        idTransaksi,
        `Uang Masuk (+) [${finalDivisi} | ${finalKategori}] Rp ${nominal.toLocaleString(
          'id-ID'
        )} -> ${finalRekeningTujuan}${
          linkedJhb ? ` (Realisasi Nota ${linkedJhb.noPenjualan})` : ''
        } dari ${finalNamaPengirim}`,
        nominal,
        finalRekeningTujuan
      );

      return record;
    });
  }

  public static async deleteUangMasuk(idTransaksi: string): Promise<{ deleted: TransaksiUangMasuk }> {
    return await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.uangMasuk)) {
        throw new Error('Data Uang Masuk kosong');
      }
      const idx = db.uangMasuk.findIndex((u) => u.idTransaksi === idTransaksi);
      if (idx === -1) {
        throw new Error(`Transaksi Uang Masuk ${idTransaksi} tidak ditemukan`);
      }

      const target = db.uangMasuk[idx];
      if (target.metode !== 'SINKRON' && target.rekeningTujuan !== 'SINKRON') {
        const acc = db.rekening.find((r) => r.kode === target.rekeningTujuan);
        if (acc) {
          if (!this.isAnakPerusahaanRekening(acc) && acc.saldoSaatIni < target.nominal) {
            throw new Error(
              `Tidak dapat membatalkan ${idTransaksi}: Saldo ${acc.nama} (${acc.kode}) tersisa Rp ${acc.saldoSaatIni.toLocaleString(
                'id-ID'
              )}, lebih kecil dari nominal Uang Masuk Rp ${target.nominal.toLocaleString('id-ID')}`
            );
          }
          acc.saldoSaatIni -= target.nominal;
        }
      }

      if (target.noPenjualanHasilBumi && Array.isArray(db.penjualanHasilBumi)) {
        const linkedJhb = db.penjualanHasilBumi.find(
          (j) => j.noPenjualan === target.noPenjualanHasilBumi
        );
        if (linkedJhb) {
          const sisaTerkumpul = Math.max(
            0,
            (Number(linkedJhb.nominalUangMasukTerkumpul) || 0) - target.nominal
          );
          linkedJhb.nominalUangMasukTerkumpul = sisaTerkumpul;
          if (Array.isArray(linkedJhb.idUangMasukList)) {
            linkedJhb.idUangMasukList = linkedJhb.idUangMasukList.filter((id) => id !== idTransaksi);
          }
          if (linkedJhb.metodePembayaran === 'BELUM_PUTUS_HARGA') {
            if (sisaTerkumpul <= 0) {
              linkedJhb.statusUangMasuk = 'BELUM_MASUK';
              linkedJhb.statusPembayaran = 'MENUNGGU_UANG_MASUK';
              linkedJhb.hargaJualPerKg = linkedJhb.modalRataRataPerKg;
              linkedJhb.labaKotor = 0;
            } else {
              linkedJhb.statusUangMasuk = 'SEBAGIAN';
              linkedJhb.statusPembayaran = 'MENUNGGU_UANG_MASUK';
              if (linkedJhb.beratBersih > 0) {
                linkedJhb.hargaJualPerKg = Math.round(sisaTerkumpul / linkedJhb.beratBersih);
              }
              const modalPengurang =
                Number(linkedJhb.nilaiModalPengurangStok) || Number(linkedJhb.totalModalHpp) || 0;
              linkedJhb.labaKotor = sisaTerkumpul - modalPengurang;
            }
          }
        }
      }

      db.uangMasuk.splice(idx, 1);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'VOID',
        idTransaksi,
        `Pembatalan Uang Masuk ${idTransaksi} (${target.namaPengirim}) Rp ${target.nominal.toLocaleString(
          'id-ID'
        )} dari ${target.rekeningTujuan}`,
        target.nominal,
        target.rekeningTujuan
      );

      return { deleted: target };
    });
  }

  // ==========================================
  // 7. PENGELUARAN, MASTER ITEM PENGELUARAN & PENYESUAIAN (+/-)
  // ==========================================
  public static getMasterItemPengeluaran(): Array<
    MasterItemPengeluaran & {
      kelompok: KelompokItemPengeluaran;
      nomorUrut?: number;
      totalNominalBersih: number;
      totalTambah: number;
      totalKurang: number;
      jumlahTransaksi: number;
    }
  > {
    const db = dbManager.get();
    const masterList = Array.isArray(db.masterItemPengeluaran) ? db.masterItemPengeluaran : [];
    const pengeluaranList = Array.isArray(db.pengeluaran) ? db.pengeluaran : [];

    const mapped = masterList.map((m) => {
      const mCompact = m.nama.replace(/\s+/g, '').toUpperCase();
      let totalNominalBersih = 0;
      let totalTambah = 0;
      let totalKurang = 0;
      let jumlahTransaksi = 0;

      for (const ex of pengeluaranList) {
        if (String(ex.kategori || '').replace(/\s+/g, '').toUpperCase() === mCompact) {
          const nom = Number(ex.nominal) || 0;
          totalNominalBersih += nom;
          if (nom >= 0) totalTambah += nom;
          else totalKurang += Math.abs(nom);
          jumlahTransaksi += 1;
        }
      }

      const nomorUrut = getNomorUrutItemPengeluaran(m.nama) ?? m.nomorUrut;
      const kelompok = resolveKelompokItemPengeluaran(m.nama, m.kelompok);

      return {
        ...m,
        kelompok,
        nomorUrut,
        totalNominalBersih,
        totalTambah,
        totalKurang,
        jumlahTransaksi,
      };
    });

    mapped.sort((a, b) => {
      const ua = a.nomorUrut ?? 999;
      const ub = b.nomorUrut ?? 999;
      if (ua !== ub) return ua - ub;
      if (a.kelompok !== b.kelompok) return a.kelompok === 'INVENTARIS' ? -1 : 1;
      return a.nama.localeCompare(b.nama);
    });

    return mapped;
  }

  public static async createMasterItemPengeluaran(params: {
    nama: string;
    kelompok?: KelompokItemPengeluaran;
    satuanDefault?: string;
    deskripsi?: string;
    divisiDefault?: string;
  }): Promise<MasterItemPengeluaran> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const cleanNama = String(params.nama || '').trim();
      if (!cleanNama) {
        throw new Error('Nama item pengeluaran baru wajib diisi');
      }
      if (!Array.isArray(db.masterItemPengeluaran)) db.masterItemPengeluaran = [];
      const compactKey = cleanNama.replace(/\s+/g, '').toUpperCase();
      if (Array.isArray(db.deletedMasterPengeluaranNames) && db.deletedMasterPengeluaranNames.length > 0) {
        db.deletedMasterPengeluaranNames = db.deletedMasterPengeluaranNames.filter(
          (n) => String(n || '').replace(/\s+/g, '').toUpperCase() !== compactKey
        );
      }
      const exists = db.masterItemPengeluaran.find(
        (m) => m.nama.replace(/\s+/g, '').toUpperCase() === compactKey
      );
      if (exists) {
        throw new Error(`Item pengeluaran "${exists.nama}" sudah terdaftar`);
      }

      const cleanSlug =
        cleanNama.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() ||
        Date.now().toString().slice(-4);
      const kelompok = resolveKelompokItemPengeluaran(cleanNama, params.kelompok);
      const item: MasterItemPengeluaran = {
        id: `EXP-ITM-${Date.now().toString().slice(-6)}`,
        kode: `EXP-${cleanSlug}`,
        nama: cleanNama.toUpperCase(),
        kelompok,
        nomorUrut: getNomorUrutItemPengeluaran(cleanNama),
        satuanDefault: params.satuanDefault?.trim() || undefined,
        deskripsi:
          params.deskripsi?.trim() ||
          (kelompok === 'INVENTARIS'
            ? 'Item pengeluaran inventaris / armada'
            : 'Item pengeluaran biasa / operasional'),
        divisiDefault: params.divisiDefault?.trim() || undefined,
        isSystemDefault: false,
        createdAt: iso,
      };

      db.masterItemPengeluaran.push(item);
      db.auditLogs.unshift({
        id: `LOG-EXPITM-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin Pengeluaran',
        jenisTransaksi: 'CREATE',
        idTransaksi: item.kode,
        detail: `Tambah Item Pengeluaran Baru [${kelompok === 'INVENTARIS' ? 'Hijau Inventaris' : 'Oranye Biasa'}]: ${item.nama}${item.satuanDefault ? ` (${item.satuanDefault})` : ''}`,
        nominal: 0,
      });

      return item;
    });
  }

  public static async deleteMasterItemPengeluaran(idOrNama: string): Promise<{ success: boolean; message: string }> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!Array.isArray(db.masterItemPengeluaran)) db.masterItemPengeluaran = [];
      const cleanQuery = String(idOrNama || '').trim();
      if (!cleanQuery) {
        throw new Error('Pilih item pengeluaran yang akan dihapus');
      }
      const queryCompact = cleanQuery.replace(/\s+/g, '').toUpperCase();
      const idx = db.masterItemPengeluaran.findIndex(
        (m) =>
          m.id === cleanQuery ||
          m.kode === cleanQuery ||
          m.nama.replace(/\s+/g, '').toUpperCase() === queryCompact
      );
      if (idx === -1) throw new Error('Item pengeluaran tidak ditemukan');
      const target = db.masterItemPengeluaran[idx];
      const targetCompact = target.nama.replace(/\s+/g, '').toUpperCase();

      if (!Array.isArray(db.deletedMasterPengeluaranNames)) {
        db.deletedMasterPengeluaranNames = [];
      }
      if (!db.deletedMasterPengeluaranNames.some((n) => String(n || '').replace(/\s+/g, '').toUpperCase() === targetCompact)) {
        db.deletedMasterPengeluaranNames.push(targetCompact);
      }

      db.masterItemPengeluaran.splice(idx, 1);

      db.auditLogs.unshift({
        id: `LOG-EXPITMDEL-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin Pengeluaran',
        jenisTransaksi: 'VOID',
        idTransaksi: target.kode || target.id,
        detail: `Hapus Item Master Pengeluaran: "${target.nama}" (riwayat transaksi lama tetap aman di pembukuan)`,
        nominal: 0,
      });

      return { success: true, message: `Item pengeluaran "${target.nama}" berhasil dihapus dari daftar pilihan` };
    });
  }

  public static async processPengeluaran(params: {
    divisi: string;
    kategori: string;
    kelompokPengeluaran?: KelompokItemPengeluaran;
    qty?: number;
    satuan?: string;
    hargaSatuan?: number;
    keterangan: string;
    nominal: number;
    arahMutasi?: 'TAMBAH' | 'KURANG';
    rekeningSumber: string;
    penerima?: string;
    idInventaris?: string;
    tanggal?: string;
    fotoKuitansi?: string;
  }): Promise<TransaksiPengeluaran> {
    return dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      const parsedQty = params.qty !== undefined && Number(params.qty) > 0 ? Number(params.qty) : undefined;
      const parsedHarga =
        params.hargaSatuan !== undefined && Number(params.hargaSatuan) > 0
          ? Math.round(Number(params.hargaSatuan))
          : undefined;

      const rawNom =
        Number(params.nominal) && Math.abs(Number(params.nominal)) > 0
          ? Number(params.nominal)
          : parsedQty && parsedHarga
          ? Math.round(parsedQty * parsedHarga)
          : 0;

      const absNominal = Math.abs(Math.round(rawNom));
      if (!absNominal || absNominal <= 0) {
        throw new Error('Nominal pengeluaran harus lebih dari Rp 0');
      }

      const arah: 'TAMBAH' | 'KURANG' = params.arahMutasi === 'KURANG' ? 'KURANG' : 'TAMBAH';
      const signedNominal = arah === 'KURANG' ? -absNominal : absNominal;
      const cleanRekSumber = String(params.rekeningSumber || 'KAS01').trim();
      const isNonKas = cleanRekSumber === 'SINKRON' || cleanRekSumber === 'STOK_INTERNAL';

      let rekeningNamaLabel = cleanRekSumber;
      if (!isNonKas) {
        const rekening = db.rekening.find((r) => r.kode === cleanRekSumber);
        if (!rekening) throw new Error('Rekening sumber dana tidak ditemukan');
        rekeningNamaLabel = rekening.nama;

        if (arah === 'TAMBAH') {
          if (!this.isAnakPerusahaanRekening(rekening) && rekening.saldoSaatIni < absNominal) {
            throw new Error(
              `Saldo ${rekening.nama} tidak mencukupi (Tersedia: Rp ${rekening.saldoSaatIni.toLocaleString('id-ID')})`
            );
          }
          rekening.saldoSaatIni -= absNominal;
        } else {
          // KURANG pengeluaran dengan pengembalian ke Kas/Bank -> menambah saldo Kas/Bank kembali
          rekening.saldoSaatIni += absNominal;
        }
      }

      const cleanKategori = String(params.kategori || 'SOLAR').trim() || 'SOLAR';
      const cleanKatCompact = cleanKategori.replace(/\s+/g, '').toUpperCase();
      if (Array.isArray(db.deletedMasterPengeluaranNames) && db.deletedMasterPengeluaranNames.length > 0) {
        db.deletedMasterPengeluaranNames = db.deletedMasterPengeluaranNames.filter(
          (n) => String(n || '').replace(/\s+/g, '').toUpperCase() !== cleanKatCompact
        );
      }
      const kelompokPengeluaran = resolveKelompokItemPengeluaran(cleanKategori, params.kelompokPengeluaran);
      if (!Array.isArray(db.masterItemPengeluaran)) db.masterItemPengeluaran = [];
      if (
        !db.masterItemPengeluaran.some(
          (m) => m.nama.replace(/\s+/g, '').toUpperCase() === cleanKatCompact
        )
      ) {
        const cleanSlug =
          cleanKategori.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() ||
          Date.now().toString().slice(-4);
        db.masterItemPengeluaran.push({
          id: `EXP-${cleanSlug}`,
          kode: `EXP-${cleanSlug}`,
          nama: cleanKategori,
          kelompok: kelompokPengeluaran,
          nomorUrut: getNomorUrutItemPengeluaran(cleanKategori),
          deskripsi:
            kelompokPengeluaran === 'INVENTARIS'
              ? 'Item pengeluaran inventaris / armada'
              : 'Item pengeluaran biasa / operasional',
          createdAt: iso,
        });
      }

      const finalTanggal = normalizeDateToDmy(params.tanggal, tanggal);
      const finalDivisi = isTanpaDivisi(params.divisi)
        ? TANPA_DIVISI_VALUE
        : params.divisi?.trim() || 'Gudang Wijaya Agro';

      const idTransaksi = generateId('EXP');
      const record: TransaksiPengeluaran = {
        idTransaksi,
        tanggal: finalTanggal,
        jam,
        divisi: finalDivisi,
        kategori: cleanKategori,
        kelompokPengeluaran,
        qty: parsedQty,
        satuan: params.satuan?.trim() || undefined,
        hargaSatuan: parsedHarga,
        keterangan:
          params.keterangan ||
          `${arah === 'KURANG' ? 'Pengurangan/Koreksi' : 'Pencatatan'} Pengeluaran ${cleanKategori}`,
        nominal: signedNominal,
        arahMutasi: arah,
        isNonKas,
        rekeningSumber: cleanRekSumber,
        penerima: params.penerima,
        idInventaris: params.idInventaris || undefined,
        fotoKuitansi: params.fotoKuitansi,
        createdAt: iso,
      };

      if (!db.pengeluaran) db.pengeluaran = [];
      db.pengeluaran.unshift(record);

      this.addAuditLog(
        db,
        'PAYMENT',
        idTransaksi,
        `${arah === 'KURANG' ? 'Pengurangan (-)' : 'Penambahan (+)'} Pengeluaran ${kelompokPengeluaran === 'INVENTARIS' ? 'Inventaris' : 'Biasa'} [${record.divisi}] (${cleanKategori}): ${record.keterangan} sebesar Rp ${absNominal.toLocaleString('id-ID')} via ${rekeningNamaLabel}`,
        absNominal,
        cleanRekSumber
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
      const isNonKas =
        Boolean(exp.isNonKas) ||
        exp.rekeningSumber === 'SINKRON' ||
        exp.rekeningSumber === 'STOK_INTERNAL';

      if (!isNonKas) {
        const rek = db.rekening.find((r) => r.kode === exp.rekeningSumber);
        if (rek) {
          rek.saldoSaatIni += exp.nominal; // exp.nominal positif -> kembalikan saldo; negatif -> kurangi kembali
        }
      }

      db.pengeluaran.splice(idx, 1);
      this.addAuditLog(
        db,
        'VOID',
        idTransaksi,
        `Batalkan Pengeluaran [${exp.divisi}]: ${exp.keterangan} (Rp ${Math.abs(exp.nominal).toLocaleString('id-ID')})`,
        Math.abs(exp.nominal),
        exp.rekeningSumber
      );

      return {
        success: true,
        message: isNonKas
          ? 'Catatan pengeluaran non-kas berhasil dibatalkan'
          : 'Pengeluaran berhasil dibatalkan dan saldo dikembalikan',
      };
    });
  }

  // ==========================================
  // 8. PENCAIRAN TITIPAN HASIL BUMI (PEMBAYARAN DARI PT KE MITRA)
  // Mendukung 2 mode saat pembayaran:
  // 1) Ambil Uang Dulu Tanpa Potong Bon (default potongBonOtomatis = false): mitra bebas ambil uang <= saldoTitipanAktif, piutang tetap utuh.
  // 2) Kliring / Potong Bon Saat Pembayaran (potongBonOtomatis = true / nominalPotongBon > 0): potong bon sesuai nominal lalu bayarkan sisanya.
  // ==========================================
  public static async processPencairanTitipan(params: {
    idMitra: string;
    nominal: number;
    rekeningSumber: string;
    metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    keterangan?: string;
    tanggal?: string;
    potongBonOtomatis?: boolean;
    nominalPotongBon?: number;
  }): Promise<TransaksiPencairanTitipan> {
    return dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const targetTanggal = normalizeDateToDmy(params.tanggal, tanggal);
      const nominalFisik = Math.round(Number(params.nominal) || 0);

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Mitra tidak ditemukan');

      const snap = this.getMitraCrossBalanceSnapshot(db, mitra.id);
      const {
        totalBonKotor,
        saldoTitipanAktif,
        potonganOtomatis,
      } = snap;

      if (saldoTitipanAktif <= 0) {
        throw new Error(`Mitra ${mitra.nama} tidak memiliki saldo titipan / hutang PT yang aktif saat ini`);
      }

      const requestedCustomPotong =
        params.nominalPotongBon !== undefined
          ? Math.max(0, Math.round(Number(params.nominalPotongBon) || 0))
          : undefined;

      const isImpasZeroCashRequest =
        nominalFisik === 0 &&
        potonganOtomatis > 0 &&
        (Boolean(params.potongBonOtomatis) ||
          (requestedCustomPotong !== undefined && requestedCustomPotong > 0) ||
          params.metode === 'SINKRON');

      const aktifkanPotongBon =
        Boolean(params.potongBonOtomatis) ||
        (requestedCustomPotong !== undefined && requestedCustomPotong > 0) ||
        isImpasZeroCashRequest;

      const nominalPotongEfektif = aktifkanPotongBon
        ? requestedCustomPotong !== undefined
          ? Math.min(requestedCustomPotong, potonganOtomatis)
          : potonganOtomatis
        : 0;

      if (
        aktifkanPotongBon &&
        requestedCustomPotong !== undefined &&
        requestedCustomPotong > potonganOtomatis
      ) {
        throw new Error(
          `Nominal potong bon (Rp ${requestedCustomPotong.toLocaleString(
            'id-ID'
          )}) melebihi batas maksimal kliring silang (Rp ${potonganOtomatis.toLocaleString('id-ID')})`
        );
      }

      const sisaTitipanSetelahPotong = Math.max(0, saldoTitipanAktif - nominalPotongEfektif);
      const isZeroCashKliringOnly = nominalFisik === 0 && nominalPotongEfektif > 0;

      if (!isZeroCashKliringOnly && nominalFisik <= 0) {
        throw new Error('Nominal pengambilan uang / pembayaran ke mitra harus lebih dari Rp 0');
      }

      if (nominalFisik > sisaTitipanSetelahPotong) {
        if (nominalPotongEfektif > 0) {
          throw new Error(
            `Nominal pembayaran (Rp ${nominalFisik.toLocaleString(
              'id-ID'
            )}) melebihi sisa titipan setelah potong bon Rp ${nominalPotongEfektif.toLocaleString(
              'id-ID'
            )} (Maksimal: Rp ${sisaTitipanSetelahPotong.toLocaleString('id-ID')})`
          );
        }
        throw new Error(
          `Nominal pengambilan uang (Rp ${nominalFisik.toLocaleString(
            'id-ID'
          )}) melebihi total saldo titipan aktif mitra (Rp ${saldoTitipanAktif.toLocaleString('id-ID')})`
        );
      }

      const isSinkronCair =
        params.metode === 'SINKRON' || params.rekeningSumber === 'SINKRON';
      const rekening = !isSinkronCair
        ? db.rekening.find((r) => r.kode === params.rekeningSumber)
        : undefined;
      if (nominalFisik > 0 && !isSinkronCair) {
        if (!rekening) throw new Error('Rekening pembayaran kas/bank tidak ditemukan');
        if (!this.isAnakPerusahaanRekening(rekening) && rekening.saldoSaatIni < nominalFisik) {
          throw new Error(
            `Saldo ${rekening.nama} tidak mencukupi untuk pembayaran (Tersedia: Rp ${rekening.saldoSaatIni.toLocaleString(
              'id-ID'
            )}, dibutuhkan: Rp ${nominalFisik.toLocaleString('id-ID')})`
          );
        }
      }

      const idPencairan = generateId('PCT');

      // 1. Jika kasir memilih Kliring / Potong Bon saat pembayaran, eksekusi kompensasi silang sebesar nominalPotongEfektif
      if (nominalPotongEfektif > 0) {
        this.executeAutoCrossOffsetInTx({
          db,
          mitra,
          nominalPotong: nominalPotongEfektif,
          totalBonSebelum: totalBonKotor,
          saldoTitipanSebelum: saldoTitipanAktif,
          tanggal: targetTanggal,
          jam,
          iso,
          refId: idPencairan,
        });
      }

      // Jika transaksi murni potong bon tanpa uang kas keluar (Rp 0 uang keluar), kembalikan bukti potongnya
      if (isZeroCashKliringOnly) {
        dbManager.synchronizeVirtualAccounts();
        const impasRecord = (db.pencairanTitipan || []).find(
          (pt) => pt.idPencairan === `${idPencairan}-POTTIT`
        );
        this.addAuditLog(
          db,
          'PAYMENT',
          idPencairan,
          `Kliring Potong Bon ${mitra.nama}: Titipan Rp ${nominalPotongEfektif.toLocaleString(
            'id-ID'
          )} memotong Piutang/Bon (Awal Rp ${totalBonKotor.toLocaleString(
            'id-ID'
          )} -> Sisa Rp ${Math.max(0, totalBonKotor - nominalPotongEfektif).toLocaleString(
            'id-ID'
          )}) tanpa uang kas keluar.`,
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
            nominalPencairan: nominalPotongEfektif,
            rekeningSumber: 'SINKRON',
            saldoTitipanSebelum: saldoTitipanAktif,
            totalTitipanAwalKotor: saldoTitipanAktif,
            nominalPotongBonOtomatis: nominalPotongEfektif,
            saldoTitipanSisa: sisaTitipanSetelahPotong,
            metodePembayaran: 'SINKRON',
            isKompensasiBon: true,
            keterangan:
              params.keterangan ||
              `Kliring Silang Titipan ke Piutang Bon Mitra (Rp ${nominalPotongEfektif.toLocaleString('id-ID')})`,
            createdAt: iso,
          }
        );
      }

      // 2. Bayarkan uang titipan dari Kas / Bank PT ke Mitra
      const saldoTitipanSisa = Math.max(0, sisaTitipanSetelahPotong - nominalFisik);

      const finalRekKode = isSinkronCair ? 'SINKRON' : params.rekeningSumber;
      const finalMetode: 'TUNAI' | 'TRANSFER' | 'SINKRON' = isSinkronCair ? 'SINKRON' : params.metode;
      const record: TransaksiPencairanTitipan = {
        idPencairan,
        tanggal: targetTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        nominalPencairan: nominalFisik,
        rekeningSumber: finalRekKode,
        saldoTitipanSebelum: sisaTitipanSetelahPotong,
        ...(nominalPotongEfektif > 0
          ? {
              totalTitipanAwalKotor: saldoTitipanAktif,
              nominalPotongBonOtomatis: nominalPotongEfektif,
            }
          : {}),
        saldoTitipanSisa,
        metodePembayaran: finalMetode,
        keterangan:
          params.keterangan ||
          (isSinkronCair
            ? `Pencairan / Penyelesaian Titipan Hasil Bumi SINKRON (Tanpa Uang Riil Keluar) untuk ${mitra.nama}`
            : nominalPotongEfektif > 0
            ? `Pembayaran PT ke Mitra ${mitra.nama} (Titipan Rp ${saldoTitipanAktif.toLocaleString(
                'id-ID'
              )} - Kliring Potong Bon Rp ${nominalPotongEfektif.toLocaleString('id-ID')})`
            : totalBonKotor > 0
            ? `Ambil Uang Titipan Tanpa Potong Bon — ${mitra.nama} (Piutang Rp ${totalBonKotor.toLocaleString(
                'id-ID'
              )} Tetap)`
            : 'Pembayaran Titipan Pembelian Hasil Bumi / Uang Titip dari PT ke Mitra'),
        createdAt: iso,
      };

      if (!db.pencairanTitipan) db.pencairanTitipan = [];
      db.pencairanTitipan.unshift(record);

      // Potong saldo rekening kas/bank perusahaan hanya sebesar pembayaran fisik
      if (!isSinkronCair && rekening) {
        rekening.saldoSaatIni -= nominalFisik;
      }

      this.addAuditLog(
        db,
        'PAYMENT',
        idPencairan,
        nominalPotongEfektif > 0
          ? `Pembayaran PT ke Mitra ${mitra.nama}: Titipan Awal Rp ${saldoTitipanAktif.toLocaleString(
              'id-ID'
            )} dipotong Bon Mitra Rp ${nominalPotongEfektif.toLocaleString(
              'id-ID'
            )}, dibayar fisik Rp ${nominalFisik.toLocaleString('id-ID')} via ${rekening?.nama || finalRekKode}`
          : `Pengambilan Uang Titipan (Tanpa Potong Bon) ${mitra.nama} sebesar Rp ${nominalFisik.toLocaleString(
              'id-ID'
            )} via ${rekening?.nama || finalRekKode}. Sisa Titipan: Rp ${saldoTitipanSisa.toLocaleString(
              'id-ID'
            )}, Piutang Tetap: Rp ${totalBonKotor.toLocaleString('id-ID')}`,
        nominalFisik,
        finalRekKode
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
      const { nominalBaru, keteranganBaru, tanggalBaru } = params;
      const idTransaksi = String(params.idTransaksi || '').trim().replace(/-IT\d+$/i, '');
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
        if (pb.metodePembayaran !== 'TITIP' && pb.metodePembayaran !== 'SINKRON' && pb.rekeningSumber !== 'SINKRON') {
          const rek = db.rekening.find((r) => r.kode === pb.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        // Sinkronkan pasangan Nota Silang jika diedit
        if (pb.isNotaSilang && pb.idNotaSilangRef) {
          const pairedPj = db.penjualan.find((x) => x.noPenjualan === pb.idNotaSilangRef);
          if (pairedPj) {
            pairedPj.totalNominal = nominalBaru;
            pairedPj.sisaPiutang = Math.max(0, pairedPj.sisaPiutang + diff);
            if (tanggalBaru) pairedPj.tanggal = tanggalBaru;
          }
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
        } else if (
          pj.metode !== 'SINKRON' &&
          pj.metode !== 'INTERNAL_PT' &&
          pj.metode !== 'PEMAKAIAN_PENGELUARAN' &&
          pj.rekeningTujuan !== 'SINKRON' &&
          pj.rekeningTujuan !== 'INTERNAL_PT' &&
          pj.rekeningTujuan !== 'PENGELUARAN'
        ) {
          const rek = db.rekening.find((r) => r.kode === pj.rekeningTujuan);
          if (rek) rek.saldoSaatIni += diff;
        }
        if (pj.isNotaSilang) {
          const pairedPb = db.pembelianHasilBumi.find(
            (x) => x.idNotaSilangRef === pj.noPenjualan || x.noPembelian === `${pj.noPenjualan}-DPP`
          );
          if (pairedPb) {
            pairedPb.totalNominal = nominalBaru;
            if (tanggalBaru) pairedPb.tanggal = tanggalBaru;
          }
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
        if (ku.rekeningSumber !== 'BON01' && ku.rekeningSumber !== 'SINKRON' && ku.metode !== 'SINKRON') {
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
        if (kpb.metodePembayaran !== 'HUTANG' && kpb.metodePembayaran !== 'SINKRON' && kpb.rekeningSumber !== 'SINKRON') {
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
        if (!exp.isNonKas && exp.rekeningSumber !== 'SINKRON' && exp.rekeningSumber !== 'STOK_INTERNAL') {
          const rek = db.rekening.find((r) => r.kode === exp.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
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
    hanyaKasir?: boolean;
  }): RekapSemuaTransaksiResponse {
    const db = dbManager.get();
    const kodeKasir = 'KAS01';
    const kasirAcc = (db.rekening || []).find((r) => r.kode === kodeKasir);
    const namaKasir = kasirAcc?.nama || 'Kas Utama Kasir';

    const normalizeDateStr = (d?: string): string => {
      if (!d) return '';
      const clean = d.trim();
      const parts = clean.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        } else {
          return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
        }
      }
      return clean;
    };

    const dmyToSort = (d?: string): number => {
      const n = normalizeDateStr(d);
      const parts = n.split('/');
      if (parts.length !== 3) return 0;
      return (parseInt(parts[2], 10) || 0) * 10000 + (parseInt(parts[1], 10) || 0) * 100 + (parseInt(parts[0], 10) || 0);
    };

    const todayDmy = normalizeDateStr(getWIBDateTime().tanggal);
    const targetDate = filters?.tanggal && filters.tanggal !== 'ALL' ? normalizeDateStr(filters.tanggal) : null;

    const list: UnifiedTransactionItem[] = [];

    // 1. Penjualan Toko / Nego / Sinkron / Pemakaian Pengeluaran / Nota Silang
    for (const p of db.penjualan || []) {
      const isSilang = Boolean(p.isNotaSilang);
      const isBon = p.metode === 'KASBON';
      const isSinkron = p.metode === 'SINKRON' || p.rekeningTujuan === 'SINKRON';
      const isPemakaianExp = p.metode === 'PEMAKAIAN_PENGELUARAN' || p.rekeningTujuan === 'PENGELUARAN';
      const isInternal = p.metode === 'INTERNAL_PT' || p.rekeningTujuan === 'INTERNAL_PT';
      const isNonTunai = isBon || isSinkron || isPemakaianExp || isInternal || isSilang;
      const rekKode = p.rekeningTujuan || (p.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isNonTunai && (rekKode === kodeKasir || p.metode === 'TUNAI');

      const itemsDesc =
        p.items?.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ') || 'Penjualan Toko';
      list.push({
        id: p.noPenjualan,
        tanggal: normalizeDateStr(p.tanggal),
        jam: p.jam || '08:00',
        timestamp: p.createdAt || p.tanggal,
        jenis: isSilang ? 'NOTA_SILANG' : 'PENJUALAN',
        jenisLabel: isSilang
          ? `Nota Silang (${p.namaAnakPerusahaan || 'DP Parabot'})`
          : isInternal
          ? 'Pemakaian Internal PT'
          : isPemakaianExp
          ? `Pemakaian Stok ke Pengeluaran (${p.kategoriPengeluaran || 'Solar'})`
          : isSinkron
          ? 'Penjualan Lunas SINKRON'
          : 'Penjualan Toko',
        arusUang: isNonTunai ? 'NON_TUNAI' : 'MASUK',
        arusUangLabel: isSilang
          ? 'Nota Silang (Piutang Mitra <-> Anak Perusahaan)'
          : isBon
          ? 'Piutang Bon (Non-Tunai)'
          : isSinkron
          ? 'Lunas Sinkron (Tanpa Uang Masuk)'
          : isPemakaianExp
          ? 'Lari ke Pengeluaran (Non-Kas)'
          : isInternal
          ? 'Pemakaian Internal (Non-Tunai)'
          : 'Uang Masuk (+)',
        deskripsi: isSilang
          ? `${p.namaMitra} ambil di ${p.namaAnakPerusahaan || 'DP Parabot'}: ${itemsDesc}`
          : `${itemsDesc} [${p.metode}]`,
        pihakTerkait: p.namaMitra || 'Pelanggan Umum',
        kategoriPihak: isInternal || isPemakaianExp ? 'INTERNAL' : 'MITRA',
        rekening: rekKode || kodeKasir,
        nominal: p.totalNominal,
        nominalMasuk: isNonTunai ? 0 : p.totalNominal,
        nominalKeluar: 0,
        isArusKasKasir: isKasir && p.totalNominal > 0,
        arahKasir: isKasir && p.totalNominal > 0 ? 'MASUK' : 'NON_KASIR',
        arahKasirLabel: isKasir && p.totalNominal > 0 ? 'Masuk Kasir (+)' : 'Bukan Kasir',
        nominalKasirMasuk: isKasir ? p.totalNominal : 0,
        nominalKasirKeluar: 0,
        metode: p.metode,
        status: p.statusPembayaran,
        fotoBukti: p.fotoNota,
        divisi: p.divisi,
      });
    }

    // 1B. Penjualan Hasil Bumi Keluar Gudang
    for (const jhb of db.penjualanHasilBumi || []) {
      const isPiutang = jhb.metodePembayaran === 'PIUTANG';
      const isBelumPutus = jhb.metodePembayaran === 'BELUM_PUTUS_HARGA';
      const isSinkronJhb = jhb.metodePembayaran === 'SINKRON' || jhb.rekeningTujuan === 'SINKRON';
      const isNonTunai = isPiutang || isBelumPutus || isSinkronJhb;
      const rekKode = jhb.rekeningTujuan || (jhb.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isNonTunai && (rekKode === kodeKasir || jhb.metodePembayaran === 'TUNAI');
      const nilaiPengurangStok =
        Number(jhb.nilaiModalPengurangStok) || Number(jhb.totalModalHpp) || 0;
      list.push({
        id: jhb.noPenjualan,
        tanggal: normalizeDateStr(jhb.tanggal),
        jam: jhb.jam || '09:30',
        timestamp: jhb.createdAt || jhb.tanggal,
        jenis: 'PENJUALAN_HASIL_BUMI',
        jenisLabel: isBelumPutus
          ? 'Muat / Jual Hasil Bumi (Uang via Uang Masuk)'
          : isSinkronJhb
          ? 'Penjualan Hasil Bumi SINKRON'
          : 'Penjualan Hasil Bumi',
        arusUang: isNonTunai ? 'NON_TUNAI' : 'MASUK',
        arusUangLabel: isBelumPutus
          ? 'Keluar Stok Gudang (Uang via Uang Masuk)'
          : isPiutang
          ? 'Piutang Pabrik/Mitra (Non-Tunai)'
          : isSinkronJhb
          ? 'Lunas Sinkron (Tanpa Uang Masuk)'
          : 'Uang Masuk (+)',
        deskripsi: isBelumPutus
          ? `Muat ${jhb.komoditasNama} (${jhb.beratBersih.toLocaleString('id-ID')} kg @ Rata-Rata Beli Rp ${jhb.modalRataRataPerKg.toLocaleString('id-ID')}/kg = Pengurang Stok Rp ${nilaiPengurangStok.toLocaleString('id-ID')})${
              (jhb.nominalUangMasukTerkumpul || 0) > 0
                ? ` · Realisasi Uang Masuk: Rp ${(jhb.nominalUangMasukTerkumpul || 0).toLocaleString('id-ID')}`
                : ' · Menunggu Uang Masuk'
            }`
          : `Jual ${jhb.komoditasNama} (${jhb.beratBersih.toLocaleString('id-ID')} kg @ Rp ${jhb.hargaJualPerKg.toLocaleString('id-ID')}) [${jhb.metodePembayaran}]${jhb.divisi && !isTanpaDivisi(jhb.divisi) ? ` · ${jhb.divisi}` : ''}`,
        pihakTerkait: jhb.namaMitra || 'Pembeli Umum',
        kategoriPihak: 'MITRA',
        rekening: rekKode || kodeKasir,
        nominal: isBelumPutus ? nilaiPengurangStok : jhb.totalNominal,
        nominalMasuk: isNonTunai ? 0 : jhb.totalNominal,
        nominalKeluar: 0,
        isArusKasKasir: isKasir && jhb.totalNominal > 0,
        arahKasir: isKasir && jhb.totalNominal > 0 ? 'MASUK' : 'NON_KASIR',
        arahKasirLabel: isKasir && jhb.totalNominal > 0 ? 'Masuk Kasir (+)' : 'Bukan Kasir',
        nominalKasirMasuk: isKasir ? jhb.totalNominal : 0,
        nominalKasirKeluar: 0,
        metode: jhb.metodePembayaran,
        status: jhb.statusPembayaran,
        divisi: jhb.divisi,
      });
    }

    // 2. Pembelian Hasil Bumi (Komoditas / Pinjaman Dana Mitra; skip pasangan duplikat Nota Silang karena sudah tampil di #1)
    for (const b of db.pembelianHasilBumi || []) {
      if (b.isNotaSilang || b.komoditasKode === 'NOTA_SILANG') continue;

      const isPinjamanDana =
        b.komoditasKode === 'PINJAMAN_DANA' || Boolean(b.komoditasNama?.includes('Pinjaman Uang'));
      const isTitip = b.metodePembayaran === 'TITIP' && !isPinjamanDana;
      const isSinkronPhb = (b.metodePembayaran === 'SINKRON' || b.rekeningSumber === 'SINKRON') && !isPinjamanDana;
      const isNonTunaiPhb = isTitip || isSinkronPhb;

      if (isPinjamanDana) {
        const hasRealCashIn = Boolean(b.rekeningSumber && b.rekeningSumber !== 'TIT01' && b.rekeningSumber !== 'SINKRON');
        const isKasir = hasRealCashIn && b.rekeningSumber === kodeKasir;
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
          rekening: b.rekeningSumber || kodeKasir,
          nominal: b.totalNominal,
          nominalMasuk: hasRealCashIn ? b.totalNominal : 0,
          nominalKeluar: 0,
          isArusKasKasir: isKasir && b.totalNominal > 0,
          arahKasir: isKasir && b.totalNominal > 0 ? 'MASUK' : 'NON_KASIR',
          arahKasirLabel: isKasir && b.totalNominal > 0 ? 'Masuk Kasir (+)' : 'Bukan Kasir',
          nominalKasirMasuk: isKasir ? b.totalNominal : 0,
          nominalKasirKeluar: 0,
          metode: b.metodePembayaran,
          status: b.status,
          fotoBukti: b.fotoNota,
          divisi: b.divisi,
        });
      } else {
        const rekKode = b.rekeningSumber || (b.metodePembayaran === 'TUNAI' ? kodeKasir : '');
        const isKasir = !isNonTunaiPhb && (rekKode === kodeKasir || b.metodePembayaran === 'TUNAI');
        list.push({
          id: b.noPembelian,
          tanggal: normalizeDateStr(b.tanggal),
          jam: b.jam || '09:00',
          timestamp: b.createdAt || b.tanggal,
          jenis: 'PEMBELIAN_HASIL_BUMI',
          jenisLabel: isSinkronPhb ? 'Pembelian Hasil Bumi SINKRON' : 'Pembelian Hasil Bumi',
          arusUang: isNonTunaiPhb ? 'NON_TUNAI' : 'KELUAR',
          arusUangLabel: isTitip
            ? 'Titip Timbang (Hutang)'
            : isSinkronPhb
            ? 'Lunas Sinkron (Non-Kas)'
            : 'Uang Keluar (-)',
          deskripsi: `Beli ${b.komoditasNama} (${b.beratBersih} kg @ Rp ${(b.hargaPerKg || 0).toLocaleString('id-ID')})${b.divisi && !isTanpaDivisi(b.divisi) ? ` · ${b.divisi}` : ''}`,
          pihakTerkait: b.namaMitra,
          kategoriPihak: 'MITRA',
          rekening: rekKode || kodeKasir,
          nominal: b.totalNominal,
          nominalMasuk: 0,
          nominalKeluar: isNonTunaiPhb ? 0 : b.totalNominal,
          isArusKasKasir: isKasir && b.totalNominal > 0,
          arahKasir: isKasir && b.totalNominal > 0 ? 'KELUAR' : 'NON_KASIR',
          arahKasirLabel: isKasir && b.totalNominal > 0 ? 'Keluar Kasir (−)' : 'Bukan Kasir',
          nominalKasirMasuk: 0,
          nominalKasirKeluar: isKasir ? b.totalNominal : 0,
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
      const isSinkronPb = pb.metodePembayaran === 'SINKRON' || pb.rekeningSumber === 'SINKRON';
      const isNonTunaiPb = isHutang || isSinkronPb;
      const rekKode = pb.rekeningSumber || (pb.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isNonTunaiPb && (rekKode === kodeKasir || pb.metodePembayaran === 'TUNAI');
      const itemsDesc =
        pb.items?.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ') || 'Barang Dagangan';
      const supplierName = pb.namaMitra || pb.namaDistributorManual || 'Pemasok / Distributor';
      list.push({
        id: pb.noPembelian,
        tanggal: normalizeDateStr(pb.tanggal),
        jam: pb.jam || '10:00',
        timestamp: pb.createdAt || pb.tanggal,
        jenis: 'PEMBELIAN_BARANG',
        jenisLabel: isSinkronPb ? 'Kulakan Supplier SINKRON' : 'Kulakan Supplier',
        arusUang: isNonTunaiPb ? 'NON_TUNAI' : 'KELUAR',
        arusUangLabel: isHutang
          ? 'Hutang Dagang (Tempo)'
          : isSinkronPb
          ? 'Lunas Sinkron (Non-Kas)'
          : 'Uang Keluar (-)',
        deskripsi: `Kulakan: ${itemsDesc}${pb.divisi && !isTanpaDivisi(pb.divisi) ? ` · ${pb.divisi}` : ''}`,
        pihakTerkait: supplierName,
        kategoriPihak: 'VENDOR',
        rekening: rekKode || kodeKasir,
        nominal: pb.totalNominal,
        nominalMasuk: 0,
        nominalKeluar: isNonTunaiPb ? 0 : pb.totalNominal,
        isArusKasKasir: isKasir && pb.totalNominal > 0,
        arahKasir: isKasir && pb.totalNominal > 0 ? 'KELUAR' : 'NON_KASIR',
        arahKasirLabel: isKasir && pb.totalNominal > 0 ? 'Keluar Kasir (−)' : 'Bukan Kasir',
        nominalKasirMasuk: 0,
        nominalKasirKeluar: isKasir ? pb.totalNominal : 0,
        metode: pb.metodePembayaran,
        status: pb.status,
        fotoBukti: pb.fotoNota,
        divisi: pb.divisi,
      });
    }

    // 4. Kasbon Uang & Nota Lalu
    for (const k of db.kasbonUang || []) {
      const isNotaLalu = Boolean(k.isNotaLalu || k.rekeningSumber === 'BON01');
      const isSinkronKb = k.metode === 'SINKRON' || k.rekeningSumber === 'SINKRON';
      const isNonTunaiKb = isNotaLalu || isSinkronKb;
      const rekKode = k.rekeningSumber || (k.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isNonTunaiKb && (rekKode === kodeKasir || k.metode === 'TUNAI');
      list.push({
        id: k.idTransaksi,
        tanggal: normalizeDateStr(k.tanggal),
        jam: k.jam || '11:00',
        timestamp: k.createdAt || k.tanggal,
        jenis: 'KASBON_UANG',
        jenisLabel: isNotaLalu
          ? 'Piutang Nota Lalu'
          : isSinkronKb
          ? 'Kasbon Uang SINKRON'
          : 'Kasbon Uang & Pinjaman',
        arusUang: isNonTunaiKb ? 'NON_TUNAI' : 'KELUAR',
        arusUangLabel: isNotaLalu
          ? 'Piutang Nota Lalu (Non-Tunai)'
          : isSinkronKb
          ? 'Sinkron (Non-Kas)'
          : 'Uang Keluar (-)',
        deskripsi: isNotaLalu
          ? `Piutang Nota Lalu: ${k.keterangan || k.noNotaLalu || 'Nota Barang Lama'}`
          : `Kasbon (${k.keterangan || 'Pinjaman Uang'}) [${k.metode}]`,
        pihakTerkait: k.namaMitra,
        kategoriPihak: 'MITRA',
        rekening: rekKode || kodeKasir,
        nominal: k.nominal,
        nominalMasuk: 0,
        nominalKeluar: isNonTunaiKb ? 0 : k.nominal,
        isArusKasKasir: isKasir && k.nominal > 0,
        arahKasir: isKasir && k.nominal > 0 ? 'KELUAR' : 'NON_KASIR',
        arahKasirLabel: isKasir && k.nominal > 0 ? 'Keluar Kasir (−)' : 'Bukan Kasir',
        nominalKasirMasuk: 0,
        nominalKasirKeluar: isKasir ? k.nominal : 0,
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
      const rekKode = by.rekeningTujuan || (by.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isNonTunai && (rekKode === kodeKasir || by.metode === 'TUNAI');
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
        rekening: rekKode || kodeKasir,
        nominal: by.nominalBayar,
        nominalMasuk: isNonTunai ? 0 : by.nominalBayar,
        nominalKeluar: 0,
        isArusKasKasir: isKasir && by.nominalBayar > 0,
        arahKasir: isKasir && by.nominalBayar > 0 ? 'MASUK' : 'NON_KASIR',
        arahKasirLabel: isKasir && by.nominalBayar > 0 ? 'Masuk Kasir (+)' : 'Bukan Kasir',
        nominalKasirMasuk: isKasir ? by.nominalBayar : 0,
        nominalKasirKeluar: 0,
        metode: by.metode,
        status: 'LUNAS',
      });
    }

    // 6. Beban Operasional & Item Pengeluaran (+/-)
    for (const exp of db.pengeluaran || []) {
      const rawNom = Number(exp.nominal) || 0;
      const absNom = Math.abs(rawNom);
      const isNonKas =
        Boolean(exp.isNonKas) ||
        exp.rekeningSumber === 'SINKRON' ||
        exp.rekeningSumber === 'STOK_INTERNAL';
      const isKurang = rawNom < 0 || exp.arahMutasi === 'KURANG';
      const rekKode = exp.rekeningSumber || kodeKasir;
      const isKasir = !isNonKas && rekKode === kodeKasir && absNom > 0;

      list.push({
        id: exp.idTransaksi,
        tanggal: normalizeDateStr(exp.tanggal),
        jam: exp.jam || '14:00',
        timestamp: exp.createdAt || exp.tanggal,
        jenis: 'PENGELUARAN_DIVISI',
        jenisLabel: isNonKas
          ? `Pengeluaran Stok/Non-Kas (${exp.kategori})`
          : isKurang
          ? `Pengurangan/Pengembalian Pengeluaran (${exp.kategori})`
          : `Pengeluaran (${exp.kategori})`,
        arusUang: isNonKas ? 'NON_TUNAI' : isKurang ? 'MASUK' : 'KELUAR',
        arusUangLabel: isNonKas
          ? 'Pemakaian Stok / Sinkron (Non-Kas)'
          : isKurang
          ? 'Koreksi Masuk (+)'
          : 'Uang Keluar (-)',
        deskripsi: `[${exp.divisi}] ${exp.kategori}: ${exp.keterangan}`,
        pihakTerkait: exp.penerima || exp.divisi,
        kategoriPihak: 'DIVISI',
        rekening: rekKode,
        nominal: absNom,
        nominalMasuk: !isNonKas && isKurang ? absNom : 0,
        nominalKeluar: !isNonKas && !isKurang ? absNom : 0,
        isArusKasKasir: isKasir,
        arahKasir: !isKasir ? 'NON_KASIR' : isKurang ? 'MASUK' : 'KELUAR',
        arahKasirLabel: !isKasir ? 'Bukan Kasir' : isKurang ? 'Masuk Kasir (+)' : 'Keluar Kasir (−)',
        nominalKasirMasuk: isKasir && isKurang ? absNom : 0,
        nominalKasirKeluar: isKasir && !isKurang ? absNom : 0,
        metode: isNonKas ? cleanNonKasLabel(rekKode) : rekKode === kodeKasir ? 'TUNAI' : 'TRANSFER',
        status: 'SELESAI',
        fotoBukti: exp.fotoKuitansi,
        divisi: exp.divisi,
      });
    }

    function cleanNonKasLabel(rek: string) {
      if (rek === 'STOK_INTERNAL') return 'PEMAKAIAN_STOK';
      if (rek === 'SINKRON') return 'SINKRON';
      return rek;
    }

    // 7. Pencairan Titipan Hasil Bumi
    for (const pt of db.pencairanTitipan || []) {
      const isKompensasi =
        pt.metodePembayaran === 'SINKRON' ||
        pt.metodePembayaran === 'KOMPENSASI_BON' ||
        pt.rekeningSumber === 'SINKRON' ||
        Boolean(pt.isKompensasiBon);
      const rekKode = pt.rekeningSumber || (pt.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isKompensasi && (rekKode === kodeKasir || pt.metodePembayaran === 'TUNAI');
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
        rekening: rekKode || kodeKasir,
        nominal: pt.nominalPencairan,
        nominalMasuk: 0,
        nominalKeluar: isKompensasi ? 0 : pt.nominalPencairan,
        isArusKasKasir: isKasir && pt.nominalPencairan > 0,
        arahKasir: isKasir && pt.nominalPencairan > 0 ? 'KELUAR' : 'NON_KASIR',
        arahKasirLabel: isKasir && pt.nominalPencairan > 0 ? 'Keluar Kasir (−)' : 'Bukan Kasir',
        nominalKasirMasuk: 0,
        nominalKasirKeluar: isKasir ? pt.nominalPencairan : 0,
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
        isArusKasKasir: false,
        arahKasir: 'NON_KASIR',
        arahKasirLabel: 'Akrual Non-Kas',
        nominalKasirMasuk: 0,
        nominalKasirKeluar: 0,
        metode: u.status === 'SUDAH_DIBAYAR' ? 'LUNAS_SLIP' : 'AKRUAL',
        status: u.status || 'TERCATAT',
        divisi: u.divisi,
      });
    }

    // 9. Penggajian Bulanan / Harian Cair
    for (const g of db.penggajian || []) {
      const isSinkronGj = g.metodePembayaran === 'SINKRON' || g.rekeningSumber === 'SINKRON';
      const isKasir = this.isKasirPayrollRecord(db, g, kodeKasir);
      const rekKode = isSinkronGj
        ? 'SINKRON'
        : isKasir
        ? kodeKasir
        : g.rekeningSumber || kodeKasir;
      const normTanggalGaji = normalizeDateStr(g.tanggal);
      list.push({
        id: g.id,
        tanggal: normTanggalGaji,
        jam: g.jam || '10:00',
        timestamp: `${normTanggalGaji} ${g.jam || '10:00'}`,
        jenis: 'PENGGAJIAN',
        jenisLabel: isSinkronGj ? 'Pembayaran Gaji / Upah SINKRON' : 'Pembayaran Gaji / Upah',
        arusUang: isSinkronGj ? 'NON_TUNAI' : 'KELUAR',
        arusUangLabel: isSinkronGj ? 'Sinkron (Non-Kas)' : 'Uang Keluar (-)',
        deskripsi: g.keterangan || `Gaji Karyawan Periode ${g.periodeBulan} [${isTanpaDivisi(g.divisi) ? 'Tanpa Divisi' : g.divisi}]`,
        pihakTerkait: g.namaKaryawan,
        kategoriPihak: 'KARYAWAN',
        rekening: rekKode,
        nominal: g.gajiBersihDibayar,
        nominalMasuk: 0,
        nominalKeluar: isSinkronGj ? 0 : g.gajiBersihDibayar,
        isArusKasKasir: isKasir && g.gajiBersihDibayar > 0,
        arahKasir: isKasir && g.gajiBersihDibayar > 0 ? 'KELUAR' : 'NON_KASIR',
        arahKasirLabel: isKasir && g.gajiBersihDibayar > 0 ? 'Keluar Kasir (−)' : 'Bukan Kasir',
        nominalKasirMasuk: 0,
        nominalKasirKeluar: isKasir ? g.gajiBersihDibayar : 0,
        metode: g.metodePembayaran || 'TUNAI',
        status: 'SELESAI',
        divisi: g.divisi,
      });
    }

    const isRekeningBerangkas = (
      rekObj?: { kode?: string; nama?: string } | null,
      rawKode?: string
    ): boolean => {
      const k = (rekObj?.kode || rawKode || '').trim();
      if (!k || k === kodeKasir) return false;
      return (
        k === 'BRK01' ||
        /berangkas|brankas/i.test(k) ||
        /\b(berangkas|brankas)\b/i.test(rekObj?.nama || '')
      );
    };

    // 10. Transfer Antar Rekening & Mutasi Kasir <-> Berangkas/Bank
    for (const t of db.transferRekening || []) {
      const sRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
      const dRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
      const isAnakTx = Boolean(
        t.idMitraTerkait || this.isAnakPerusahaanRekening(sRek) || this.isAnakPerusahaanRekening(dRek)
      );
      const namaAfiliasi =
        t.namaMitraTerkait ||
        (this.isAnakPerusahaanRekening(dRek) ? dRek?.nama : this.isAnakPerusahaanRekening(sRek) ? sRek?.nama : 'DP Parabot');

      const isTxBerhasil = !t.status || t.status === 'BERHASIL';
      const masukKasir = isTxBerhasil && t.rekeningTujuan === kodeKasir && t.nominal > 0;
      const keluarKasir = isTxBerhasil && t.rekeningSumber === kodeKasir && t.nominal > 0;
      const isSetorKeBerangkas = keluarKasir && isRekeningBerangkas(dRek, t.rekeningTujuan);
      const touchesKasir = masukKasir || keluarKasir;

      list.push({
        id: t.noTransfer,
        tanggal: normalizeDateStr(t.tanggal),
        jam: t.jam || '12:00',
        timestamp: t.createdAt || t.tanggal,
        jenis: 'TRANSFER_REKENING',
        jenisLabel: masukKasir
          ? `Dropping Masuk ke Kasir (dari ${sRek?.nama || t.rekeningSumber})`
          : isSetorKeBerangkas
          ? `Pengembalian Kasir ke Berangkas (${dRek?.nama || t.rekeningTujuan})`
          : keluarKasir
          ? `Setor / Transfer Keluar Kasir (ke ${dRek?.nama || t.rekeningTujuan})`
          : isAnakTx
          ? t.tipeMutasiAfiliasi === 'TARIK_DARI_ANAK_PERUSAHAAN' || this.isAnakPerusahaanRekening(sRek)
            ? 'Tarik / Talangan Anak Perusahaan'
            : 'Simpan Dana ke Anak Perusahaan'
          : 'Transfer Antar Rekening',
        arusUang: 'MUTASI',
        arusUangLabel: masukKasir
          ? 'Dropping Masuk Kasir (+)'
          : isSetorKeBerangkas
          ? 'Pengembalian ke Berangkas (−)'
          : keluarKasir
          ? 'Setor Keluar Kasir (−)'
          : isAnakTx
          ? '1 Transaksi Terpadu (Rekening & Mitra)'
          : 'Mutasi Internal',
        deskripsi: isAnakTx
          ? `[Terpadu Rekening & Mitra ${namaAfiliasi}] ${t.rekeningSumber} -> ${t.rekeningTujuan} (${t.keterangan || '-'})`
          : `Transfer Rekening: ${t.rekeningSumber} -> ${t.rekeningTujuan} (${t.keterangan || '-'})`,
        pihakTerkait: isAnakTx ? `${namaAfiliasi} (Anak Perusahaan & Mitra)` : `${sRek?.nama || t.rekeningSumber} → ${dRek?.nama || t.rekeningTujuan}`,
        kategoriPihak: isAnakTx ? 'MITRA' : 'INTERNAL',
        rekening: `${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        nominalMasuk: 0,
        nominalKeluar: 0,
        isArusKasKasir: touchesKasir,
        arahKasir: masukKasir ? 'MUTASI_MASUK' : keluarKasir ? 'MUTASI_KELUAR' : 'NON_KASIR',
        arahKasirLabel: masukKasir
          ? 'Dropping Masuk Kasir (+)'
          : isSetorKeBerangkas
          ? 'Kembali ke Berangkas (−)'
          : keluarKasir
          ? 'Setor Keluar Kasir (−)'
          : 'Mutasi Antar Bank',
        nominalKasirMasuk: masukKasir ? t.nominal : 0,
        nominalKasirKeluar: keluarKasir ? t.nominal : 0,
        metode: isAnakTx ? '1_TRANSAKSI_TERPADU' : 'MUTASI',
        status: t.status,
      });
    }

    // 11. Transaksi Agen BRILink (Admin + Mutasi Pokok Kasir jika melibatkan KAS01)
    for (const br of db.brilink || []) {
      const isTarikTunai = br.jenisBrilink === 'TARIK_TUNAI';
      const nomAdmin = Math.round(Number(br.nominalAdmin) || 0);
      const nomPokok = Math.round(Number(br.nominalPokok) || 0);
      const rekAdm = br.rekeningAdmin || kodeKasir;
      const kasPokok = br.rekeningKasTunai || kodeKasir;

      let kasirIn = 0;
      let kasirOut = 0;
      if (isTarikTunai) {
        if (rekAdm === kodeKasir && nomAdmin > 0) kasirIn += nomAdmin;
        if (kasPokok === kodeKasir && nomPokok > 0) kasirOut += nomPokok;
      } else {
        if (rekAdm === kodeKasir && nomAdmin > 0) kasirOut += nomAdmin;
        if (kasPokok === kodeKasir && nomPokok > 0) kasirIn += nomPokok;
      }
      const touchesKasir = kasirIn > 0 || kasirOut > 0;

      const pokokInfo =
        nomPokok > 0
          ? ` [Pokok Rp ${nomPokok.toLocaleString('id-ID')}: ${
              isTarikTunai ? `+${br.rekeningBank} / -KAS01` : `-${br.rekeningBank} / +KAS01`
            }]`
          : '';
      list.push({
        id: br.idTransaksi,
        tanggal: normalizeDateStr(br.tanggal),
        jam: br.jam || '11:30',
        timestamp: br.createdAt || br.tanggal,
        jenis: 'BRILINK',
        jenisLabel: isTarikTunai
          ? 'BRILink: Adm Tarik Tunai (+)'
          : 'BRILink: Adm Tukar Cash PT (−)',
        arusUang: isTarikTunai ? 'MASUK' : 'KELUAR',
        arusUangLabel: isTarikTunai ? 'Uang Masuk (+)' : 'Uang Keluar (-)',
        deskripsi: `${br.keterangan || (isTarikTunai ? 'Adm Tarik Tunai' : 'Adm Tukar Cash')}${pokokInfo}`,
        pihakTerkait: br.namaPelanggan || 'Nasabah Umum BRILink',
        kategoriPihak: br.idMitra && br.idMitra !== 'UMUM' ? 'MITRA' : 'INTERNAL',
        rekening: rekAdm,
        nominal: nomAdmin,
        nominalMasuk: isTarikTunai ? nomAdmin : 0,
        nominalKeluar: isTarikTunai ? 0 : nomAdmin,
        isArusKasKasir: touchesKasir,
        arahKasir: !touchesKasir
          ? 'NON_KASIR'
          : kasirIn >= kasirOut
          ? 'MASUK'
          : 'KELUAR',
        arahKasirLabel: !touchesKasir
          ? 'Bukan Kasir'
          : kasirIn > 0 && kasirOut > 0
          ? `Adm +Rp ${kasirIn.toLocaleString('id-ID')} / Pokok -Rp ${kasirOut.toLocaleString('id-ID')}`
          : kasirIn > 0
          ? 'Masuk Kasir (+)'
          : 'Keluar Kasir (−)',
        nominalKasirMasuk: kasirIn,
        nominalKasirKeluar: kasirOut,
        metode: isTarikTunai ? 'ADM_TARIK_TUNAI' : 'ADM_TUKAR_CASH',
        status: br.status || 'BERHASIL',
        fotoBukti: br.fotoBukti,
        divisi: br.divisi || 'BRILink',
      });
    }

    // 12. Transaksi Uang Masuk (+) & Realisasi Penjualan Hasil Bumi
    for (const um of db.uangMasuk || []) {
      const isSinkronUm = um.metode === 'SINKRON' || um.rekeningTujuan === 'SINKRON';
      const rekKode = um.rekeningTujuan || (um.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = !isSinkronUm && (rekKode === kodeKasir || um.metode === 'TUNAI');
      list.push({
        id: um.idTransaksi,
        tanggal: normalizeDateStr(um.tanggal),
        jam: um.jam || '12:00',
        timestamp: um.createdAt || um.tanggal,
        jenis: 'UANG_MASUK',
        jenisLabel: um.noPenjualanHasilBumi
          ? `Uang Masuk Hasil Bumi (${um.noPenjualanHasilBumi})`
          : isSinkronUm
          ? `Uang Masuk SINKRON: ${um.kategori}`
          : `Uang Masuk: ${um.kategori}`,
        arusUang: isSinkronUm ? 'NON_TUNAI' : 'MASUK',
        arusUangLabel: isSinkronUm ? 'Sinkron (Non-Kas)' : 'Uang Masuk (+)',
        deskripsi: `${um.keterangan}${um.divisi && !isTanpaDivisi(um.divisi) ? ` · ${um.divisi}` : ''}`,
        pihakTerkait: um.namaPengirim || 'Pembeli / Pengirim Umum',
        kategoriPihak: um.idMitra && um.idMitra !== 'UMUM' ? 'MITRA' : 'INTERNAL',
        rekening: rekKode || kodeKasir,
        nominal: um.nominal,
        nominalMasuk: isSinkronUm ? 0 : um.nominal,
        nominalKeluar: 0,
        isArusKasKasir: isKasir && um.nominal > 0,
        arahKasir: isKasir && um.nominal > 0 ? 'MASUK' : 'NON_KASIR',
        arahKasirLabel: isKasir && um.nominal > 0 ? 'Masuk Kasir (+)' : 'Bukan Kasir',
        nominalKasirMasuk: isKasir ? um.nominal : 0,
        nominalKasirKeluar: 0,
        metode: um.metode,
        status: 'BERHASIL',
        fotoBukti: um.fotoBukti,
        divisi: um.divisi,
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

    const saldoKasirLiveSaatIni = Math.round(Number(kasirAcc?.saldoSaatIni) || 0);

    // Filter by targetDate if requested
    let filtered = list;
    if (targetDate) {
      filtered = filtered.filter((tx) => tx.tanggal === targetDate);
    }

    // Filter fokus hanya Arus Kas Kasir jika diminta
    if (filters?.hanyaKasir) {
      filtered = filtered.filter((tx) => Boolean(tx.isArusKasKasir));
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

    // Kasir Summary MURNI PER HARI (Saldo Awal Kasir = Rp 0 per hari, tidak menarik transaksi hari-hari selanjutnya)
    const kasirPeriodRows = (targetDate
      ? list.filter((tx) => tx.tanggal === targetDate)
      : list
    ).filter((tx) => Boolean(tx.isArusKasKasir));

    const saldoAwalKasir = 0;
    const uangMasukOperasionalKasir = kasirPeriodRows
      .filter((tx) => tx.jenis !== 'TRANSFER_REKENING')
      .reduce((s, tx) => s + (tx.nominalKasirMasuk || 0), 0);
    const uangKeluarOperasionalKasir = kasirPeriodRows
      .filter((tx) => tx.jenis !== 'TRANSFER_REKENING')
      .reduce((s, tx) => s + (tx.nominalKasirKeluar || 0), 0);
    const mutasiMasukKasir = kasirPeriodRows
      .filter((tx) => tx.jenis === 'TRANSFER_REKENING')
      .reduce((s, tx) => s + (tx.nominalKasirMasuk || 0), 0);
    const mutasiKeluarKasir = kasirPeriodRows
      .filter((tx) => tx.jenis === 'TRANSFER_REKENING')
      .reduce((s, tx) => s + (tx.nominalKasirKeluar || 0), 0);

    const setorKeBerangkasKasir = (db.transferRekening || [])
      .filter((t) => {
        if (t.status && t.status !== 'BERHASIL') return false;
        if (t.rekeningSumber !== kodeKasir || (t.nominal || 0) <= 0) return false;
        if (targetDate && normalizeDateStr(t.tanggal) !== targetDate) return false;
        const dRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
        return isRekeningBerangkas(dRek, t.rekeningTujuan);
      })
      .reduce((s, t) => s + Math.round(Number(t.nominal) || 0), 0);

    const mutasiKeluarNonBerangkasKasir = Math.max(0, mutasiKeluarKasir - setorKeBerangkasKasir);
    const totalMasukKasir = uangMasukOperasionalKasir + mutasiMasukKasir;
    const totalKeluarKasir = uangKeluarOperasionalKasir + mutasiKeluarKasir;
    const arusBersihKasir = totalMasukKasir - totalKeluarKasir;

    const opnameSameDate = targetDate
      ? (db.cashOpnameLogs || [])
          .filter((op) => op.sesuaikanSaldoSistem && normalizeDateStr(op.tanggal) === targetDate)
          .reduce((s, op) => s + (op.selisih || 0), 0)
      : (db.cashOpnameLogs || [])
          .filter((op) => op.sesuaikanSaldoSistem)
          .reduce((s, op) => s + (op.selisih || 0), 0);

    const saldoSebelumSetorBerangkas =
      saldoAwalKasir +
      totalMasukKasir -
      (uangKeluarOperasionalKasir + mutasiKeluarNonBerangkasKasir) +
      opnameSameDate;
    const saldoAkhirKasir = saldoSebelumSetorBerangkas - setorKeBerangkasKasir;
    const selisihKasirHarian = saldoAkhirKasir;

    const kasirFilteredRows = filtered.filter((tx) => Boolean(tx.isArusKasKasir));

    // Calculate General Summary
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
      kasirSummary: {
        kodeKasir,
        namaKasir,
        tanggalAcuan: targetDate || 'Semua Periode',
        isFilteredSingleDate: Boolean(targetDate),
        saldoAwalKasir,
        uangMasukOperasionalKasir,
        uangKeluarOperasionalKasir,
        mutasiMasukKasir,
        mutasiKeluarKasir,
        setorKeBerangkasKasir,
        mutasiKeluarNonBerangkasKasir,
        saldoSebelumSetorBerangkas,
        selisihKasirHarian,
        totalMasukKasir,
        totalKeluarKasir,
        arusBersihKasir,
        saldoAkhirKasir,
        saldoKasirLiveSaatIni,
        totalTransaksiKasir: kasirFilteredRows.length,
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
      .filter(
        (g) =>
          normalizeDateToDmy(g.tanggal, g.tanggal) === tanggal &&
          this.isKasirPayrollRecord(db, g, 'KAS01')
      )
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
    tanggal?: string;
  }): Promise<HasilKliringSilangResponse> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: wibTanggal, jam, iso } = getWIBDateTime();
      const tanggal = normalizeDateToDmy(params.tanggal, wibTanggal);

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

      const titipPanenMurniAwal = Math.max(0, totalTitipKotor - totalPencairanSebelum);
      const linkedKry = (db.karyawan || []).find(
        (k) =>
          k.id === mitra.idKaryawanTerkait ||
          k.idMitraTerkait === mitra.id ||
          (mitra.kode && k.nik === mitra.kode)
      );
      const upahTercatatList = linkedKry
        ? (db.upahHarian || []).filter((u) => u.idKaryawan === linkedKry.id && u.status === 'TERCATAT')
        : [];
      const upahBelumDibayarKryAwal = upahTercatatList.reduce(
        (s, u) => s + (Number(u.totalUpahHarian) || 0),
        0
      );

      const saldoTitipanAwal = titipPanenMurniAwal + upahBelumDibayarKryAwal;
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

      // Helper alokasi bon (Prioritas Nota Kunci dulu agar otomatis mengurangi nominal tidak bisa kembali, lalu FIFO)
      const allocateBonPayment = (amountToAllocate: number): AlokasiPembayaranBon[] => {
        return this.allocateMitraBonFifo(db, mitra.id, amountToAllocate);
      };

      // Helper pelunasan porsi upah harian karyawan (bila mitra berstatus Karyawan & Mitra dan saldo titip menggunakan hak upah)
      const settleEmployeeUpahPortion = (
        amountFromUpah: number,
        potonganKasbonSlip: number,
        gajiBersihSlip: number,
        rekSumberSlip: string,
        metodeSlip: 'TUNAI' | 'TRANSFER',
        ketSlip: string,
        idBayarBonRef?: string
      ) => {
        if (!linkedKry || amountFromUpah <= 0) return;
        if (!db.upahHarian) db.upahHarian = [];
        if (!db.penggajian) db.penggajian = [];

        const slipId = `${idReferensiKliring}-GAJI-${Math.floor(10 + Math.random() * 89)}`;
        let remainingToSettle = amountFromUpah;
        const settledUpahIds: string[] = [];

        const pendingRows = db.upahHarian
          .filter((u) => u.idKaryawan === linkedKry.id && u.status === 'TERCATAT')
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

        for (const u of pendingRows) {
          if (remainingToSettle <= 0) break;
          const rowTotal = Number(u.totalUpahHarian) || 0;
          if (rowTotal <= 0) continue;

          if (rowTotal <= remainingToSettle) {
            u.status = 'SUDAH_DIBAYAR';
            u.ket = 'LUNAS';
            u.idPayrollSettlement = slipId;
            u.tanggalDibayar = tanggal;
            settledUpahIds.push(u.id);
            remainingToSettle -= rowTotal;
          } else {
            // Split partial upah row cleanly so unpaid remainder stays TERCATAT
            const settledCloneId = `${u.id}-KLR-${Math.floor(10 + Math.random() * 89)}`;
            const remainderAmount = rowTotal - remainingToSettle;
            const settledClone = {
              ...u,
              id: settledCloneId,
              upahHarian: remainingToSettle,
              uangMakanLembur: 0,
              totalUpahHarian: remainingToSettle,
              jumlah: remainingToSettle,
              status: 'SUDAH_DIBAYAR' as const,
              ket: 'LUNAS' as const,
              idPayrollSettlement: slipId,
              tanggalDibayar: tanggal,
              keterangan: `${u.keterangan || u.item || 'Upah Harian'} (Kliring Silang Sebagian ${idReferensiKliring})`,
            };
            db.upahHarian.unshift(settledClone);

            u.totalUpahHarian = remainderAmount;
            u.jumlah = remainderAmount;
            u.upahHarian = Math.max(0, remainderAmount - (u.uangMakanLembur || 0));
            if (u.uangMakanLembur > remainderAmount) {
              u.uangMakanLembur = remainderAmount;
              u.upahHarian = 0;
            }
            settledUpahIds.push(settledCloneId);
            remainingToSettle = 0;
          }
        }

        const divisiUtama = (linkedKry.divisi || linkedKry.departemen || 'Gudang Wijaya Agro') as any;
        db.penggajian.unshift({
          id: slipId,
          slipNomor: `SLIP/KLR/${tanggal.replace(/\//g, '')}/${idReferensiKliring.slice(-4)}`,
          tanggal,
          jam,
          idKaryawan: linkedKry.id,
          nikKaryawan: linkedKry.nik,
          namaKaryawan: linkedKry.nama,
          jabatan: linkedKry.jabatan || 'Staff',
          departemen: linkedKry.departemen || 'Operasional',
          divisi: divisiUtama,
          tipeGaji: 'HARIAN',
          periodeBulan: `Kliring Silang - ${tanggal}`,
          gajiPokok: amountFromUpah,
          tunjangan: 0,
          bonus: 0,
          totalGajiKotor: amountFromUpah,
          totalKasbonAwal: totalKasbonAwal,
          persentasePotongKasbon:
            amountFromUpah > 0 ? Math.round((potonganKasbonSlip / amountFromUpah) * 100) : 0,
          potonganKasbon: potonganKasbonSlip,
          sisaKasbonAkhir: Math.max(0, runningKasbon - potonganKasbonSlip),
          gajiBersihDibayar: gajiBersihSlip,
          metodePembayaran: metodeSlip,
          rekeningSumber: rekSumberSlip,
          jumlahHariKerja: settledUpahIds.length,
          daftarUpahHarianIds: settledUpahIds,
          keterangan: ketSlip,
          idBayarBonTerkait: idBayarBonRef,
        });
      };

      let runningTitipan = saldoTitipanAwal;
      let runningTitipMurni = titipPanenMurniAwal;
      let runningKasbon = totalKasbonAwal;

      // 1. Proses Kompensasi Silang Non-Tunai (Titipan/Upah <-> Kasbon)
      if (nominalPotong > 0) {
        const alokasiKompensasi = allocateBonPayment(nominalPotong);
        alokasiBonLunas.push(...alokasiKompensasi);

        const sisaBonSetelahPotong = runningKasbon - nominalPotong;
        const sisaTitipSetelahPotong = runningTitipan - nominalPotong;
        const potongDariTitipMurni = Math.min(runningTitipMurni, nominalPotong);
        const potongDariUpahKry = nominalPotong - potongDariTitipMurni;

        if (!db.bayarBon) db.bayarBon = [];
        const idBayarBonKomp = `${idReferensiKliring}-BON`;
        db.bayarBon.unshift({
          idTransaksi: idBayarBonKomp,
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
            `Kliring Silang Otomatis Piutang vs Hutang Mitra (${idReferensiKliring})`,
          createdAt: iso,
        });

        if (potongDariTitipMurni > 0) {
          if (!db.pencairanTitipan) db.pencairanTitipan = [];
          db.pencairanTitipan.unshift({
            idPencairan: `${idReferensiKliring}-TIT`,
            tanggal,
            jam,
            idMitra: mitra.id,
            namaMitra: mitra.nama,
            nominalPencairan: potongDariTitipMurni,
            rekeningSumber: 'KOMPENSASI_BON',
            saldoTitipanSebelum: runningTitipMurni,
            saldoTitipanSisa: runningTitipMurni - potongDariTitipMurni,
            metodePembayaran: 'KOMPENSASI_BON',
            isKompensasiBon: true,
            keterangan:
              params.keterangan ||
              `Potong Saldo Titipan untuk Kliring Silang Kasbon Mitra (${idReferensiKliring})`,
            createdAt: iso,
          });
          runningTitipMurni -= potongDariTitipMurni;
        }

        if (potongDariUpahKry > 0) {
          settleEmployeeUpahPortion(
            potongDariUpahKry,
            potongDariUpahKry,
            0,
            'KOMPENSASI_BON',
            'TUNAI',
            params.keterangan ||
              `Kliring Silang Hak Upah terhadap Kasbon Mitra (${idReferensiKliring})`,
            idBayarBonKomp
          );
        }

        runningTitipan = sisaTitipSetelahPotong;
        runningKasbon = sisaBonSetelahPotong;
      }

      // 2. Proses Penyelesaian Sisa secara Fisik (Kas/Bank) bila dipilih
      let usedRekeningKode: string | undefined;
      const metodeFisik = params.metodeFisik || 'TUNAI';

      if (params.aksiSisa === 'CAIRKAN_SISA_TITIPAN' && nominalFisik > 0) {
        if (nominalFisik > runningTitipan) {
          throw new Error(
            `Nominal pencairan sisa (Rp ${nominalFisik.toLocaleString('id-ID')}) melebihi sisa hutang/titipan bersih (Rp ${runningTitipan.toLocaleString('id-ID')})`
          );
        }
        const rekKode = metodeFisik === 'TUNAI' ? 'KAS01' : params.rekeningFisik || '';
        if (!rekKode || rekKode === 'BON01' || rekKode === 'TIT01') {
          throw new Error('Pilih rekening Kas/Bank riil untuk pencairan sisa hutang/titipan');
        }
        const rekAcc = db.rekening.find((r) => r.kode === rekKode && r.status === 'AKTIF');
        if (!rekAcc) throw new Error(`Rekening ${rekKode} tidak ditemukan atau tidak aktif`);
        if (!this.isAnakPerusahaanRekening(rekAcc) && rekAcc.saldoSaatIni < nominalFisik) {
          throw new Error(
            `Saldo ${rekAcc.nama} (Rp ${rekAcc.saldoSaatIni.toLocaleString('id-ID')}) tidak cukup untuk mencairkan Rp ${nominalFisik.toLocaleString('id-ID')}`
          );
        }

        rekAcc.saldoSaatIni -= nominalFisik;
        usedRekeningKode = rekAcc.kode;

        const cairDariTitipMurni = Math.min(runningTitipMurni, nominalFisik);
        const cairDariUpahKry = nominalFisik - cairDariTitipMurni;
        const sisaAkhirTitip = runningTitipan - nominalFisik;
        const ketCairFisik =
          params.keterangan ||
          (nominalPotong > 0
            ? `Pencairan Sisa Bersih Titipan setelah Kliring Silang (${idReferensiKliring})`
            : runningKasbon > 0
            ? `Ambil Uang Titipan Tanpa Potong Bon (${idReferensiKliring}) — Piutang Rp ${runningKasbon.toLocaleString('id-ID')} Tetap`
            : `Pengambilan Uang Titipan Mitra (${idReferensiKliring})`);

        if (cairDariTitipMurni > 0) {
          if (!db.pencairanTitipan) db.pencairanTitipan = [];
          db.pencairanTitipan.unshift({
            idPencairan: `${idReferensiKliring}-CAIR`,
            tanggal,
            jam,
            idMitra: mitra.id,
            namaMitra: mitra.nama,
            nominalPencairan: cairDariTitipMurni,
            rekeningSumber: rekAcc.kode,
            saldoTitipanSebelum: runningTitipMurni,
            saldoTitipanSisa: runningTitipMurni - cairDariTitipMurni,
            metodePembayaran: metodeFisik,
            isKompensasiBon: false,
            keterangan: ketCairFisik,
            createdAt: iso,
          });
          runningTitipMurni -= cairDariTitipMurni;
        }

        if (cairDariUpahKry > 0) {
          settleEmployeeUpahPortion(
            cairDariUpahKry,
            0,
            cairDariUpahKry,
            rekAcc.kode,
            metodeFisik,
            ketCairFisik
          );
        }

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
          keterangan: `Setoran Pelunasan Sisa Bon setelah Kliring Silang (${idReferensiKliring})`,
          createdAt: iso,
        });
        runningKasbon = sisaAkhirBon;
      }

      dbManager.synchronizeVirtualAccounts();

      const ketAudit =
        nominalPotong === 0 && params.aksiSisa === 'CAIRKAN_SISA_TITIPAN' && nominalFisik > 0
          ? `Ambil Uang Titipan Tanpa Potong Bon ${mitra.nama} (${idReferensiKliring}): Diambil Rp ${nominalFisik.toLocaleString('id-ID')} via ${usedRekeningKode}. Sisa Titipan: Rp ${runningTitipan.toLocaleString('id-ID')}, Piutang Tetap: Rp ${runningKasbon.toLocaleString('id-ID')}`
          : `Kliring Silang Mitra ${mitra.nama} (${idReferensiKliring}): Potong Silang Non-Tunai Rp ${nominalPotong.toLocaleString('id-ID')}${
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
      | 'NOTA_SILANG'
      | 'PEMBELIAN_BARANG'
      | 'PEMBELIAN_HASIL_BUMI'
      | 'PENJUALAN_HASIL_BUMI'
      | 'KASBON_UANG'
      | 'BAYAR_BON'
      | 'PENCAIRAN_TITIPAN'
      | 'PENGELUARAN_DIVISI'
      | 'UANG_MASUK'
      | 'BRILINK'
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
      karyawanList: Karyawan[];
      masterItemPengeluaranList: MasterItemPengeluaran[];
      inventarisList: ItemInventaris[];
      divisiList: Array<{ id: string; nama: string; kodeRekening: string }>;
    };
  } {
    const db = dbManager.get();
    const cleanId = String(idTransaksi || '').trim().replace(/-IT\d+$/i, '');
    if (!cleanId) {
      throw new Error('ID transaksi wajib diisi');
    }

    const masters = {
      rekeningList: db.rekening || [],
      produkList: db.produk || [],
      stokBarangList: db.stokBarang || [],
      stokHasilBumiList: db.stokHasilBumi || [],
      mitraList: db.mitra || [],
      karyawanList: db.karyawan || [],
      masterItemPengeluaranList: this.getMasterItemPengeluaran(),
      inventarisList: db.inventaris || [],
      divisiList: dbManager.getDivisiList(),
    };

    // Deteksi prioritas NOTA_SILANG terlebih dahulu (baik dari sisi noNotaSilang maupun noRef -DPP / -MTR)
    const baseSilangId = cleanId.replace(/-(DPP|MTR)$/i, '');
    const silangSale = (db.penjualan || []).find(
      (x) => Boolean(x.isNotaSilang) && (x.noPenjualan === cleanId || x.noPenjualan === baseSilangId)
    );
    const silangCredit = (db.pembelianHasilBumi || []).find(
      (x) =>
        Boolean(x.isNotaSilang || x.komoditasKode === 'NOTA_SILANG') &&
        (x.noPembelian === cleanId ||
          x.idNotaSilangRef === cleanId ||
          (silangSale && (x.idNotaSilangRef === silangSale.noPenjualan || x.noPembelian === `${silangSale.noPenjualan}-DPP` || x.noPembelian === `${silangSale.noPenjualan}-MTR`)))
    );

    if (silangSale || silangCredit) {
      const resolvedSale =
        silangSale ||
        (db.penjualan || []).find(
          (x) => Boolean(x.isNotaSilang) && x.noPenjualan === silangCredit?.idNotaSilangRef
        );
      const canonicalId = resolvedSale?.noPenjualan || silangCredit?.idNotaSilangRef || cleanId;
      const idTujuan =
        resolvedSale?.idMitraAnakPerusahaan || silangCredit?.idMitra || 'MTR-DPPARABOT';
      const mitraTujuanObj = (db.mitra || []).find((m) => m.id === idTujuan);
      const isAnak =
        idTujuan === 'MTR-DPPARABOT' ||
        Boolean(mitraTujuanObj?.isAnakPerusahaan) ||
        mitraTujuanObj?.role === 'ANAK_PERUSAHAAN' ||
        Boolean(mitraTujuanObj?.nama?.toLowerCase().includes('parabot'));
      const modeNotaSilang: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA' =
        resolvedSale?.modeNotaSilang ||
        silangCredit?.modeNotaSilang ||
        (isAnak ? 'ANAK_PERUSAHAAN' : 'SESAMA_MITRA');

      const items = resolvedSale?.items?.length
        ? resolvedSale.items.map((it) => ({
            kodeProduk: 'NOTA-SILANG',
            namaProduk: it.namaProduk,
            namaBarang: it.namaProduk,
            satuan: it.satuan || 'PCS',
            qty: it.qty,
            harga: it.harga,
            subtotal: it.subtotal,
          }))
        : (silangCredit?.itemsNotaSilang || []).map((it) => ({
            kodeProduk: 'NOTA-SILANG',
            namaProduk: it.namaBarang,
            namaBarang: it.namaBarang,
            satuan: it.satuan || 'PCS',
            qty: it.qty,
            harga: it.harga,
            subtotal: it.subtotal,
          }));

      return {
        jenis: 'NOTA_SILANG',
        id: canonicalId,
        record: {
          noNotaSilang: canonicalId,
          noRefAnakPerusahaan: silangCredit?.noPembelian || `${canonicalId}-DPP`,
          modeNotaSilang,
          tanggal: resolvedSale?.tanggal || silangCredit?.tanggal || '',
          jam: resolvedSale?.jam || silangCredit?.jam || '',
          idMitra: resolvedSale?.idMitra || silangCredit?.idMitraPengambil || '',
          namaMitra: resolvedSale?.namaMitra || silangCredit?.namaMitraPengambil || '',
          idMitraAnakPerusahaan: idTujuan,
          namaAnakPerusahaan:
            resolvedSale?.namaAnakPerusahaan ||
            silangCredit?.namaMitra ||
            mitraTujuanObj?.nama ||
            'DP Parabot',
          noNotaToko: resolvedSale?.noNotaToko || silangCredit?.noNotaToko || '',
          items,
          totalNominal: resolvedSale?.totalNominal ?? silangCredit?.totalNominal ?? 0,
          sisaPiutangMitra: resolvedSale?.sisaPiutang ?? 0,
          statusPiutangMitra: resolvedSale?.statusPembayaran || 'BELUM_BAYAR',
          keterangan: resolvedSale?.keterangan || silangCredit?.keterangan || '',
          fotoNota: resolvedSale?.fotoNota || silangCredit?.fotoNota || '',
        },
        masters,
      };
    }

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
        | 'UANG_MASUK'
        | 'BRILINK'
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
      { jenis: 'UANG_MASUK', finder: () => (db.uangMasuk || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: 'BRILINK', finder: () => (db.brilink || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: 'TRANSFER_REKENING', finder: () => (db.transferRekening || []).find((x) => x.noTransfer === cleanId) },
      { jenis: 'UPAH_HARIAN', finder: () => (db.upahHarian || []).find((x) => x.id === cleanId) },
      { jenis: 'PENGGAJIAN', finder: () => (db.penggajian || []).find((x) => x.id === cleanId) },
    ];

    if (jenisHint) {
      const normalizedHint =
        jenisHint === 'PENGELUARAN' ? 'PENGELUARAN_DIVISI' : jenisHint;
      const exact = candidates.find((c) => c.jenis === normalizedHint);
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
    idMitraAnakPerusahaan?: string;
    modeNotaSilang?: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA';
    noNotaToko?: string;
    idKaryawan?: string;
    namaKaryawanManual?: string;
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
    // Multi-item (Penjualan Toko, Nota Silang & Pembelian Barang)
    noFakturSupplier?: string;
    items?: Array<{
      kodeProduk: string;
      namaProduk?: string;
      satuan?: string;
      qty: number;
      harga?: number;
      hargaBeliSatuan?: number;
    }>;
    // Kasbon / Pengeluaran / BRILink / Payroll / Upah Harian
    rincianBarangNotaLalu?: string;
    divisi?: string;
    kategori?: string;
    kategoriPengeluaran?: string;
    kelompokPengeluaran?: KelompokItemPengeluaran;
    arahMutasi?: 'TAMBAH' | 'KURANG';
    qtyPengeluaran?: number;
    satuanPengeluaran?: string;
    hargaSatuanPengeluaran?: number;
    idInventaris?: string;
    penerima?: string;
    jenisBrilink?: JenisTransaksiBrilink;
    nominalPokok?: number;
    rekeningAdmin?: string;
    rekeningBank?: string;
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
          return {
            id: m.id,
            nama: params.namaMitraManual?.trim() || m.nama,
          };
        }
        if (params.namaMitraManual !== undefined && params.namaMitraManual.trim()) {
          return { id: currentId, nama: params.namaMitraManual.trim() };
        }
        return { id: currentId, nama: currentNama || defaultFallback };
      };

      const recalculateProductHppFromRealPurchases = (kodeProduk: string) => {
        const cleanKode = String(kodeProduk || '').trim().toUpperCase();
        if (!cleanKode || cleanKode === 'REKAP-NOTA' || cleanKode.startsWith('CUSTOM-')) return;
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
      // 0. NOTA SILANG (MITRA ⇄ ANAK PERUSAHAAN / SESAMA MITRA)
      // =====================================================
      if (jenis === 'NOTA_SILANG') {
        const saleRec = (db.penjualan || []).find(
          (p) => Boolean(p.isNotaSilang) && p.noPenjualan === cleanId
        );
        const creditRec = (db.pembelianHasilBumi || []).find(
          (b) =>
            Boolean(b.isNotaSilang || b.komoditasKode === 'NOTA_SILANG') &&
            (b.idNotaSilangRef === cleanId ||
              b.noPembelian === `${cleanId}-DPP` ||
              b.noPembelian === `${cleanId}-MTR` ||
              b.noPembelian === cleanId)
        );
        if (!saleRec && !creditRec) {
          throw new Error(`Data Nota Silang ${cleanId} tidak ditemukan`);
        }

        const oldNominal = Number(saleRec?.totalNominal ?? creditRec?.totalNominal ?? 0);
        const alreadyPaidBon = saleRec
          ? Math.max(0, oldNominal - (Number(saleRec.sisaPiutang) || 0))
          : 0;

        const targetMitraId =
          params.idMitra || saleRec?.idMitra || creditRec?.idMitraPengambil || '';
        const mitraPengambil = db.mitra.find((m) => m.id === targetMitraId);
        if (!mitraPengambil) {
          throw new Error('Pilih Mitra Pengambil barang yang valid pada Nota Silang');
        }

        const targetTujuanId =
          params.idMitraAnakPerusahaan ||
          saleRec?.idMitraAnakPerusahaan ||
          creditRec?.idMitra ||
          'MTR-DPPARABOT';
        const pihakPenyedia = db.mitra.find((m) => m.id === targetTujuanId);
        if (!pihakPenyedia) {
          throw new Error('Pilih Anak Perusahaan / Mitra Penyedia barang yang valid');
        }
        if (pihakPenyedia.id === mitraPengambil.id) {
          throw new Error('Mitra pengambil tidak boleh sama dengan pihak penyedia pada Nota Silang');
        }

        const isAnak =
          pihakPenyedia.id === 'MTR-DPPARABOT' ||
          Boolean(pihakPenyedia.isAnakPerusahaan) ||
          pihakPenyedia.role === 'ANAK_PERUSAHAAN' ||
          pihakPenyedia.nama.toLowerCase().includes('parabot');
        const resolvedMode: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA' =
          params.modeNotaSilang ||
          saleRec?.modeNotaSilang ||
          creditRec?.modeNotaSilang ||
          (isAnak ? 'ANAK_PERUSAHAAN' : 'SESAMA_MITRA');

        const rawItems =
          params.items && params.items.length > 0
            ? params.items
            : saleRec?.items?.map((i) => ({
                kodeProduk: 'NOTA-SILANG',
                namaProduk: i.namaProduk,
                satuan: i.satuan,
                qty: i.qty,
                harga: i.harga,
              })) ||
              (creditRec?.itemsNotaSilang || []).map((i) => ({
                kodeProduk: 'NOTA-SILANG',
                namaProduk: i.namaBarang,
                satuan: i.satuan || 'PCS',
                qty: i.qty,
                harga: i.harga,
              }));

        if (!rawItems || rawItems.length === 0) {
          throw new Error('Minimal harus ada 1 item barang pada Nota Silang');
        }

        const normalizedItems: Array<{
          namaBarang: string;
          qty: number;
          satuan: string;
          harga: number;
          subtotal: number;
        }> = [];
        let newTotalNominal = 0;

        for (let idx = 0; idx < rawItems.length; idx++) {
          const it = rawItems[idx];
          const namaBarang = String(it.namaProduk || (it as any).namaBarang || '').trim();
          const qty = Number(it.qty) || 0;
          const harga = Math.round(Number(it.harga ?? (it as any).hargaBeliSatuan ?? 0));
          const satuan = String(it.satuan || 'PCS').trim().toUpperCase() || 'PCS';
          if (!namaBarang) throw new Error(`Baris #${idx + 1}: Nama barang Nota Silang wajib diisi`);
          if (qty <= 0) throw new Error(`Qty "${namaBarang}" harus lebih dari 0`);
          if (harga <= 0) throw new Error(`Harga satuan "${namaBarang}" harus lebih dari Rp 0`);
          const subtotal = Math.round(qty * harga);
          newTotalNominal += subtotal;
          normalizedItems.push({ namaBarang, qty, satuan, harga, subtotal });
        }

        // Jika nominal diedit langsung pada nota 1 item tanpa perubahan array
        if (!params.items && params.nominal !== undefined && normalizedItems.length === 1) {
          const customNom = Math.max(1, Math.round(Number(params.nominal)));
          normalizedItems[0].subtotal = customNom;
          normalizedItems[0].harga =
            normalizedItems[0].qty > 0
              ? Math.round(customNom / normalizedItems[0].qty)
              : customNom;
          newTotalNominal = customNom;
        }

        const cleanNoNotaToko =
          params.noNotaToko !== undefined
            ? params.noNotaToko.trim()
            : saleRec?.noNotaToko || creditRec?.noNotaToko || '';
        const rincianRingkas = normalizedItems
          .map((it) => `${it.namaBarang}${it.qty > 1 ? ` (${it.qty} ${it.satuan})` : ''}`)
          .join(', ');
        const cleanKet =
          params.keterangan !== undefined && params.keterangan.trim()
            ? params.keterangan.trim()
            : rincianRingkas;

        if (saleRec) {
          saleRec.idMitra = mitraPengambil.id;
          saleRec.namaMitra = mitraPengambil.nama;
          saleRec.modeNotaSilang = resolvedMode;
          saleRec.idMitraAnakPerusahaan = pihakPenyedia.id;
          saleRec.namaAnakPerusahaan = pihakPenyedia.nama;
          saleRec.noNotaToko = cleanNoNotaToko || undefined;
          saleRec.items = normalizedItems.map((it) => ({
            kodeProduk: 'NOTA-SILANG',
            namaProduk: it.namaBarang,
            satuan: it.satuan,
            qty: it.qty,
            hargaBeli: it.harga,
            hargaSugesti: it.harga,
            harga: it.harga,
            subtotal: it.subtotal,
            labaKotor: 0,
          }));
          saleRec.totalModalHpp = newTotalNominal;
          saleRec.totalNominal = newTotalNominal;
          saleRec.totalLabaKotor = 0;
          saleRec.sisaPiutang = Math.max(0, newTotalNominal - alreadyPaidBon);
          saleRec.statusPembayaran = saleRec.sisaPiutang === 0 ? 'LUNAS' : 'BELUM_BAYAR';
          if (params.tanggal) saleRec.tanggal = params.tanggal.trim();
          saleRec.keterangan = cleanKet;
        }

        if (creditRec) {
          creditRec.idMitra = pihakPenyedia.id;
          creditRec.namaMitra = pihakPenyedia.nama;
          creditRec.modeNotaSilang = resolvedMode;
          creditRec.komoditasNama = mitraPengambil.nama.toUpperCase();
          creditRec.idMitraPengambil = mitraPengambil.id;
          creditRec.namaMitraPengambil = mitraPengambil.nama;
          creditRec.noNotaToko = cleanNoNotaToko || undefined;
          creditRec.itemsNotaSilang = normalizedItems;
          creditRec.totalNominal = newTotalNominal;
          if (params.tanggal) creditRec.tanggal = params.tanggal.trim();
          creditRec.keterangan = `${mitraPengambil.nama.toUpperCase()} — ${cleanKet}${
            cleanNoNotaToko ? ` [Nota #${cleanNoNotaToko}]` : ''
          }`;
        }

        auditSummary = `Edit Nota Silang ${cleanId} (${mitraPengambil.nama} ⇄ ${pihakPenyedia.nama}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newTotalNominal.toLocaleString('id-ID')}`;
        auditNominal = newTotalNominal;
        auditRekening = 'BON01';
        updatedRecord = saleRec || creditRec;
      }

      // =====================================================
      // 1. PEMBELIAN HASIL BUMI (TERMASUK PINJAMAN DANA / TITIP NOTA LALU)
      // =====================================================
      else if (jenis === 'PEMBELIAN_HASIL_BUMI') {
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

          if (
            isPinjamanDana &&
            record.rekeningSumber &&
            record.rekeningSumber !== 'TIT01' &&
            record.rekeningSumber !== 'BON01' &&
            record.rekeningSumber !== 'SINKRON'
          ) {
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
            if (targetRekKode !== 'TIT01' && targetRekKode !== 'BON01' && targetRekKode !== 'SINKRON') {
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

          if (oldKomoditas) {
            oldKomoditas.stok = Math.round((oldKomoditas.stok - oldKg) * 100) / 100;
          }
          if (
            !record.isBelumPutusHarga &&
            (record.metodePembayaran === 'TUNAI' || record.metodePembayaran === 'TRANSFER') &&
            record.rekeningSumber &&
            record.rekeningSumber !== 'TIT01' &&
            record.rekeningSumber !== 'BON01' &&
            record.rekeningSumber !== 'SINKRON'
          ) {
            const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
            if (oldRek) oldRek.saldoSaatIni += oldNominal;
          }

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

        if (oldKomoditas) {
          oldKomoditas.stok = Math.round((oldKomoditas.stok + oldKg) * 100) / 100;
        }
        if (
          (record.metodePembayaran === 'TUNAI' || record.metodePembayaran === 'TRANSFER') &&
          record.rekeningTujuan &&
          record.rekeningTujuan !== 'BON01' &&
          record.rekeningTujuan !== 'TIT01' &&
          record.rekeningTujuan !== 'SINKRON' &&
          record.rekeningTujuan !== 'MENUNGGU_TRANSFER'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) {
            oldRek.saldoSaatIni -= oldNominal;
          }
        }

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

        const newMetode = (params.metode || record.metodePembayaran) as
          | 'TUNAI'
          | 'TRANSFER'
          | 'PIUTANG'
          | 'BELUM_PUTUS_HARGA';
        const isBelumPutusJual = newMetode === 'BELUM_PUTUS_HARGA';

        let hargaJualPerKg = Math.max(
          0,
          Number(params.hargaJualPerKg ?? params.hargaPerKg ?? record.hargaJualPerKg)
        );
        let totalNominal = Math.round(beratBersih * hargaJualPerKg);
        if (params.nominal !== undefined && params.hargaJualPerKg === undefined && params.hargaPerKg === undefined) {
          totalNominal = Math.round(Number(params.nominal));
          hargaJualPerKg = beratBersih > 0 ? Math.round(totalNominal / beratBersih) : 0;
        }
        if (!isBelumPutusJual && (hargaJualPerKg <= 0 || totalNominal <= 0)) {
          throw new Error('Harga jual per Kg harus lebih dari Rp 0');
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Pembeli / Pabrik Umum');
        if (newMetode === 'PIUTANG' && party.id === 'UMUM') {
          throw new Error('Metode PIUTANG wajib memilih Mitra / Pabrik terdaftar');
        }

        let finalRekTujuan = 'KAS01';
        let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' | 'MENUNGGU_UANG_MASUK' = 'LUNAS';
        let sisaPiutang = 0;

        if (newMetode === 'BELUM_PUTUS_HARGA') {
          finalRekTujuan = 'MENUNGGU_TRANSFER';
          statusPembayaran =
            (Number(record.nominalUangMasukTerkumpul) || 0) > 0 && record.statusUangMasuk === 'LUNAS'
              ? 'LUNAS'
              : 'MENUNGGU_UANG_MASUK';
          sisaPiutang = 0;
        } else if (newMetode === 'TUNAI') {
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
          record.items.length === 1 &&
          record.items[0].kodeProduk === 'REKAP-NOTA' &&
          !params.items?.some((i) => i.kodeProduk !== 'REKAP-NOTA');

        const affectedProductCodes = new Set<string>();

        for (const oldIt of record.items || []) {
          const cleanKode = String(oldIt.kodeProduk || '').trim().toUpperCase();
          if (cleanKode && cleanKode !== 'REKAP-NOTA' && !cleanKode.startsWith('CUSTOM-')) {
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
          record.rekeningSumber !== 'BON01' &&
          record.rekeningSumber !== 'SINKRON'
        ) {
          const bankAcc = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (bankAcc) bankAcc.saldoSaatIni += oldNominal;
        }

        let newTotalNominal = 0;
        const newProcessedItems = [];

        if (isRekapNota) {
          const qtyRekap = Math.max(1, Number(params.items?.[0]?.qty ?? record.items[0]?.qty ?? 1));
          const nomRekap = Math.round(
            Number(
              params.nominal ??
                (params.items?.[0]?.hargaBeliSatuan
                  ? qtyRekap * Number(params.items[0].hargaBeliSatuan)
                  : record.totalNominal)
            )
          );
          if (isNaN(nomRekap) || nomRekap <= 0) {
            throw new Error('Total nominal rekapan pembelian harus lebih dari Rp 0');
          }
          newTotalNominal = nomRekap;
          newProcessedItems.push({
            kodeProduk: 'REKAP-NOTA',
            namaProduk:
              params.items?.[0]?.namaProduk?.trim() ||
              record.items[0]?.namaProduk ||
              'Rekapan Nota Pembelian',
            satuan: params.items?.[0]?.satuan?.trim() || record.items[0]?.satuan || 'Nota',
            qty: qtyRekap,
            hargaBeliSatuan: Math.round(nomRekap / qtyRekap),
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

            const prod = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
            if (!prod) {
              // Custom / manual product name support
              const customNama = String(it.namaProduk || cleanKode).trim();
              const customSatuan = String(it.satuan || 'PCS').trim();
              const subtotal = Math.round(qty * hargaBeliSatuan);
              newTotalNominal += subtotal;
              newProcessedItems.push({
                kodeProduk: cleanKode.startsWith('CUSTOM-') ? cleanKode : `CUSTOM-${cleanKode}`,
                namaProduk: customNama,
                satuan: customSatuan,
                qty,
                hargaBeliSatuan,
                subtotal,
                stokSebelum: 0,
                stokSetelah: 0,
              });
              continue;
            }

            affectedProductCodes.add(cleanKode);
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
              namaProduk: it.namaProduk?.trim() || prod.nama,
              satuan: it.satuan?.trim() || prod.satuan,
              qty,
              hargaBeliSatuan,
              subtotal,
              stokSebelum: Math.max(0, stokSebelum),
              stokSetelah: stokItem.stok,
            });
          }
        }

        for (const kode of affectedProductCodes) {
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === kode);
          if (stokItem && stokItem.stok < 0) {
            throw new Error(
              `Tidak dapat mengurangi qty kulakan "${stokItem.namaProduk}" karena stok gudang akan menjadi minus (${stokItem.stok} ${stokItem.satuan} — sebagian barang sudah terjual di kasir).`
            );
          }
        }

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

        for (const kode of affectedProductCodes) {
          recalculateProductHppFromRealPurchases(kode);
        }

        auditSummary = `Edit Pembelian Barang Kulakan ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newTotalNominal.toLocaleString('id-ID')} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ''}]`;
        auditNominal = newTotalNominal;
        auditRekening = finalRekSumber;
        updatedRecord = record;
      }

      // =====================================================
      // 4. PENJUALAN TOKO / KASIR / SINKRON / PEMAKAIAN PENGELUARAN
      // =====================================================
      else if (jenis === 'PENJUALAN') {
        const record = db.penjualan.find((p) => p.noPenjualan === cleanId)!;
        const oldNominal = Number(record.totalNominal) || 0;
        const alreadyPaidBon =
          record.metode === 'KASBON' ? Math.max(0, oldNominal - (Number(record.sisaPiutang) || 0)) : 0;

        for (const oldIt of record.items || []) {
          const cleanKode = String(oldIt.kodeProduk || '').trim().toUpperCase();
          if (!cleanKode || cleanKode.startsWith('CUSTOM-') || cleanKode === 'NOTA-SILANG') continue;
          const oldProd = db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (
            stokItem &&
            !isProdukTanpaStok(oldProd || stokItem, db.kategoriProduk)
          ) {
            stokItem.stok = (Number(stokItem.stok) || 0) + (Number(oldIt.qty) || 0);
          }
        }

        if (
          (record.metode === 'TUNAI' || record.metode === 'TRANSFER') &&
          record.rekeningTujuan &&
          record.rekeningTujuan !== 'BON01' &&
          record.rekeningTujuan !== 'SINKRON' &&
          record.rekeningTujuan !== 'PENGELUARAN' &&
          record.rekeningTujuan !== 'INTERNAL_PT'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) oldRek.saldoSaatIni -= oldNominal;
        }

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

          if (isNaN(qty) || qty <= 0) throw new Error(`Qty penjualan harus lebih dari 0`);

          const prod = cleanKode
            ? db.produk.find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode)
            : undefined;

          if (!prod) {
            const customNama = String(it.namaProduk || cleanKode || 'Item Penjualan').trim();
            const customSatuan = String(it.satuan || 'PCS').trim();
            const existingOld = record.items.find(
              (oi) => String(oi.kodeProduk || '').trim().toUpperCase() === cleanKode
            );
            const hppUnit = existingOld?.hargaBeli || 0;
            const subtotal = Math.round(qty * hargaDeal);
            const modalSub = Math.round(qty * hppUnit);
            newTotalNominal += subtotal;
            newTotalModalHpp += modalSub;
            newProcessedItems.push({
              kodeProduk: cleanKode || 'CUSTOM-ITEM',
              namaProduk: customNama,
              satuan: customSatuan,
              qty,
              hargaBeli: hppUnit,
              hargaSugesti: hargaDeal,
              harga: hargaDeal,
              subtotal,
              labaKotor: subtotal - modalSub,
            });
            continue;
          }

          const isTanpaStok = isProdukTanpaStok(prod, db.kategoriProduk);
          const stokItem = db.stokBarang.find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
          if (!isTanpaStok) {
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
            namaProduk: it.namaProduk?.trim() || prod.nama,
            satuan: it.satuan?.trim() || prod.satuan,
            qty,
            hargaBeli: hppUnit,
            hargaSugesti: prod.hargaJual || hppUnit,
            harga: hargaDeal,
            subtotal,
            labaKotor,
          });
        }

        if (!params.items && params.nominal !== undefined && newProcessedItems.length === 1) {
          const customTotal = Math.max(0, Math.round(Number(params.nominal)));
          const only = newProcessedItems[0];
          only.subtotal = customTotal;
          only.harga = only.qty > 0 ? Math.round(customTotal / only.qty) : customTotal;
          only.labaKotor = customTotal - Math.round(only.qty * only.hargaBeli);
          newTotalNominal = customTotal;
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, 'Pelanggan Umum');
        let newMetode = (params.metode || record.metode) as
          | 'TUNAI'
          | 'TRANSFER'
          | 'KASBON'
          | 'SINKRON'
          | 'INTERNAL_PT'
          | 'PEMAKAIAN_PENGELUARAN';
        if (
          newTotalNominal === 0 &&
          newMetode !== 'INTERNAL_PT' &&
          newMetode !== 'SINKRON' &&
          newMetode !== 'PEMAKAIAN_PENGELUARAN'
        ) {
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
        } else if (newMetode === 'SINKRON') {
          finalRekTujuan = 'SINKRON';
          statusPembayaran = 'LUNAS';
          sisaPiutang = 0;
        } else if (newMetode === 'PEMAKAIAN_PENGELUARAN') {
          finalRekTujuan = 'PENGELUARAN';
          statusPembayaran = 'LUNAS';
          sisaPiutang = 0;
          const katPeng =
            params.kategoriPengeluaran?.trim() ||
            params.kategori?.trim() ||
            record.kategoriPengeluaran ||
            'SOLAR';
          record.kategoriPengeluaran = katPeng;
          const nilaiPengeluaran = newTotalNominal > 0 ? newTotalNominal : newTotalModalHpp;
          if (record.idPengeluaranTerkait) {
            const linkedExp = (db.pengeluaran || []).find(
              (e) => e.idTransaksi === record.idPengeluaranTerkait
            );
            if (linkedExp) {
              linkedExp.kategori = katPeng;
              linkedExp.kelompokPengeluaran = resolveKelompokItemPengeluaran(katPeng);
              linkedExp.nominal = nilaiPengeluaran;
              if (params.divisi) linkedExp.divisi = params.divisi.trim();
              if (params.tanggal) linkedExp.tanggal = params.tanggal.trim();
              if (params.idInventaris !== undefined) {
                linkedExp.idInventaris = params.idInventaris || undefined;
              }
            }
          }
        } else if (newMetode === 'TUNAI') {
          finalRekTujuan = 'KAS01';
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
          kasAcc.saldoSaatIni += newTotalNominal;
        } else if (newMetode === 'TRANSFER') {
          const rekKode = params.rekeningTujuan || record.rekeningTujuan;
          if (
            !rekKode ||
            rekKode === 'KAS01' ||
            rekKode === 'BON01' ||
            rekKode === 'TIT01' ||
            rekKode === 'SINKRON' ||
            rekKode === 'PENGELUARAN' ||
            rekKode === 'INTERNAL_PT'
          ) {
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
        if (params.idInventaris !== undefined) record.idInventaris = params.idInventaris || undefined;
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
        const wasNonTunai =
          record.metode === 'SINKRON' ||
          record.metode === 'KOMPENSASI_TITIP' ||
          record.metode === 'POTONG_GAJI' ||
          record.rekeningTujuan === 'SINKRON' ||
          Boolean(record.isKompensasiTitipan) ||
          Boolean(record.isPotongGaji);

        if (
          !wasNonTunai &&
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

        // Restore old allocations back to target bon records so we can re-allocate cleanly (even if Mitra changed)
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

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, record.namaMitra);
        const mitraChanged = party.id !== record.idMitra;
        record.idMitra = party.id;
        record.namaMitra = party.nama;

        const newNominal = Math.round(Number(params.nominal ?? record.nominalBayar));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal pembayaran bon harus lebih dari Rp 0');
        }

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

        const newAlokasi = this.allocateMitraBonFifo(db, record.idMitra, newNominal, {
          idNotaTarget: mitraChanged ? undefined : record.idNotaTarget,
        });
        record.nominalPengurangNotaNgunci = newAlokasi
          .filter((a) => a.isNotaNgunci)
          .reduce((s, a) => s + (a.nominalDibayar || 0), 0);
        record.sisaNotaNgunciSetelah = this.getMitraNominalNotaNgunci(db, record.idMitra);

        const reqMetode = params.metode || record.metode;
        const isNowNonTunai =
          reqMetode === 'SINKRON' ||
          reqMetode === 'KOMPENSASI_TITIP' ||
          reqMetode === 'POTONG_GAJI';

        if (!isNowNonTunai) {
          const newMetode = (reqMetode === 'TRANSFER' ? 'TRANSFER' : 'TUNAI') as 'TUNAI' | 'TRANSFER';
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
          record.isKompensasiTitipan = false;
        } else {
          if (reqMetode === 'SINKRON') {
            record.metode = 'SINKRON';
            record.rekeningTujuan = 'SINKRON';
          }
          const pairedSinkron = (db.pencairanTitipan || []).find(
            (p) =>
              p.idPencairan === `${cleanId}-SINKRON` ||
              (cleanId.endsWith('-POTBON') && p.idPencairan === cleanId.replace(/-POTBON$/, '-POTTIT'))
          );
          if (pairedSinkron) {
            const diffSinkron = newNominal - (Number(pairedSinkron.nominalPencairan) || 0);
            pairedSinkron.idMitra = record.idMitra;
            pairedSinkron.namaMitra = record.namaMitra;
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
        const wasKompensasi =
          record.metodePembayaran === 'SINKRON' ||
          record.metodePembayaran === 'KOMPENSASI_BON' ||
          record.rekeningSumber === 'SINKRON' ||
          Boolean(record.isKompensasiBon);

        if (
          !wasKompensasi &&
          record.rekeningSumber &&
          record.rekeningSumber !== 'TIT01' &&
          record.rekeningSumber !== 'BON01' &&
          record.rekeningSumber !== 'SINKRON'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }

        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, record.namaMitra);
        record.idMitra = party.id;
        record.namaMitra = party.nama;

        const newNominal = Math.round(Number(params.nominal ?? record.nominalPencairan));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal pencairan titipan harus lebih dari Rp 0');
        }

        const reqMetode = params.metode || record.metodePembayaran;
        const isNowKompensasi = reqMetode === 'SINKRON' || reqMetode === 'KOMPENSASI_BON';

        if (!isNowKompensasi) {
          const newMetode = (reqMetode === 'TRANSFER' ? 'TRANSFER' : 'TUNAI') as 'TUNAI' | 'TRANSFER';
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
        } else if (reqMetode === 'SINKRON') {
          record.metodePembayaran = 'SINKRON';
          record.rekeningSumber = 'SINKRON';
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
      // 8. PENGELUARAN & BIAYA OPERASIONAL (HIJAU INVENTARIS & ORANYE BIASA)
      // =====================================================
      else if (jenis === 'PENGELUARAN_DIVISI') {
        const record = (db.pengeluaran || []).find((e) => e.idTransaksi === cleanId)!;
        const oldSignedNominal = Number(record.nominal) || 0;
        const oldIsNonKas =
          Boolean(record.isNonKas) ||
          record.rekeningSumber === 'SINKRON' ||
          record.rekeningSumber === 'STOK_INTERNAL';

        // Reverse old cash mutation accurately (works for both +TAMBAH and -KURANG!)
        if (!oldIsNonKas && record.rekeningSumber) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) {
            oldRek.saldoSaatIni += oldSignedNominal;
          }
        }

        const parsedQty =
          params.qtyPengeluaran !== undefined
            ? Number(params.qtyPengeluaran) > 0
              ? Number(params.qtyPengeluaran)
              : undefined
            : record.qty;
        const parsedHarga =
          params.hargaSatuanPengeluaran !== undefined
            ? Number(params.hargaSatuanPengeluaran) > 0
              ? Math.round(Number(params.hargaSatuanPengeluaran))
              : undefined
            : record.hargaSatuan;

        const computedFromQty =
          params.qtyPengeluaran !== undefined &&
          params.hargaSatuanPengeluaran !== undefined &&
          parsedQty &&
          parsedHarga
            ? Math.round(parsedQty * parsedHarga)
            : undefined;

        const absNewNominal = Math.abs(
          Math.round(
            Number(
              params.nominal !== undefined && Math.abs(Number(params.nominal)) > 0
                ? params.nominal
                : computedFromQty ?? Math.abs(oldSignedNominal)
            )
          )
        );
        if (isNaN(absNewNominal) || absNewNominal <= 0) {
          throw new Error('Nominal pengeluaran harus lebih dari Rp 0');
        }

        const arah: 'TAMBAH' | 'KURANG' =
          params.arahMutasi ||
          record.arahMutasi ||
          (oldSignedNominal < 0 ? 'KURANG' : 'TAMBAH');
        const newSignedNominal = arah === 'KURANG' ? -absNewNominal : absNewNominal;

        const targetRekKode = (params.rekeningSumber || record.rekeningSumber || 'KAS01').trim();
        if (targetRekKode === 'BON01' || targetRekKode === 'TIT01') {
          throw new Error('Rekening virtual BON01/TIT01 tidak dapat dipakai untuk pengeluaran');
        }
        const isNowNonKas = targetRekKode === 'SINKRON' || targetRekKode === 'STOK_INTERNAL';

        if (!isNowNonKas) {
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === 'AKTIF');
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          if (
            arah === 'TAMBAH' &&
            !this.isAnakPerusahaanRekening(newRek) &&
            newRek.saldoSaatIni < absNewNominal
          ) {
            throw new Error(
              `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString('id-ID')}, dibutuhkan: Rp ${absNewNominal.toLocaleString('id-ID')})`
            );
          }
          newRek.saldoSaatIni -= newSignedNominal;
        }

        const cleanKat = (params.kategori || record.kategori || 'SOLAR').trim();
        record.kategori = cleanKat;
        record.kelompokPengeluaran = resolveKelompokItemPengeluaran(
          cleanKat,
          params.kelompokPengeluaran || record.kelompokPengeluaran
        );
        record.qty = parsedQty;
        if (params.satuanPengeluaran !== undefined) {
          record.satuan = params.satuanPengeluaran.trim() || undefined;
        }
        record.hargaSatuan = parsedHarga;
        record.nominal = newSignedNominal;
        record.arahMutasi = arah;
        record.isNonKas = isNowNonKas;
        record.rekeningSumber = targetRekKode;
        if (params.divisi) record.divisi = params.divisi.trim();
        if (params.idInventaris !== undefined) record.idInventaris = params.idInventaris || undefined;
        if (params.penerima !== undefined) record.penerima = params.penerima.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined && params.keterangan.trim()) {
          record.keterangan = params.keterangan.trim();
        }

        auditSummary = `Edit Pengeluaran ${cleanId} [${record.kategori} · ${record.divisi}]: Rp ${Math.abs(oldSignedNominal).toLocaleString('id-ID')} -> ${arah === 'KURANG' ? '-' : '+'}Rp ${absNewNominal.toLocaleString('id-ID')} via ${targetRekKode}`;
        auditNominal = absNewNominal;
        auditRekening = targetRekKode;
        updatedRecord = record;
      }

      // =====================================================
      // 8B. TRANSAKSI UANG MASUK (+)
      // =====================================================
      else if (jenis === 'UANG_MASUK') {
        const record = (db.uangMasuk || []).find((u) => u.idTransaksi === cleanId)!;
        const oldNominal = Number(record.nominal) || 0;

        if (
          record.rekeningTujuan &&
          record.rekeningTujuan !== 'BON01' &&
          record.rekeningTujuan !== 'TIT01' &&
          record.rekeningTujuan !== 'SINKRON'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) oldRek.saldoSaatIni -= oldNominal;
        }

        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error('Nominal Uang Masuk harus lebih dari Rp 0');
        }

        const newMetode = (params.metode || record.metode || 'TUNAI') as 'TUNAI' | 'TRANSFER';
        let finalRekTujuan = 'KAS01';
        if (newMetode === 'TUNAI') {
          const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
          if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
          if (!this.isAnakPerusahaanRekening(kasAcc) && kasAcc.saldoSaatIni + newNominal < 0) {
            throw new Error('Saldo KAS01 menjadi negatif akibat pengurangan nominal Uang Masuk');
          }
          kasAcc.saldoSaatIni += newNominal;
          finalRekTujuan = 'KAS01';
        } else {
          const bankKode = (params.rekeningTujuan || record.rekeningTujuan || '').trim();
          if (!bankKode || bankKode === 'KAS01' || bankKode === 'BON01' || bankKode === 'TIT01' || bankKode === 'SINKRON') {
            throw new Error('Pilih rekening Bank tujuan Uang Masuk yang valid');
          }
          const bankAcc = db.rekening.find((r) => r.kode === bankKode && r.status === 'AKTIF');
          if (!bankAcc) throw new Error(`Rekening ${bankKode} tidak ditemukan atau nonaktif`);
          if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni + newNominal < 0) {
            throw new Error(`Saldo ${bankAcc.nama} menjadi negatif akibat koreksi ini`);
          }
          bankAcc.saldoSaatIni += newNominal;
          finalRekTujuan = bankAcc.kode;
        }

        // Jika terhubung ke nota Penjualan Hasil Bumi Belum Putus Harga, perbarui nominal terkumpul
        if (record.noPenjualanHasilBumi) {
          const linkedJhb = (db.penjualanHasilBumi || []).find(
            (j) => j.noPenjualan === record.noPenjualanHasilBumi
          );
          if (linkedJhb) {
            const diff = newNominal - oldNominal;
            const totalBaru = Math.max(0, (Number(linkedJhb.nominalUangMasukTerkumpul) || 0) + diff);
            linkedJhb.nominalUangMasukTerkumpul = totalBaru;
            if (linkedJhb.metodePembayaran === 'BELUM_PUTUS_HARGA' && linkedJhb.beratBersih > 0) {
              const hrgKg = Math.round(totalBaru / linkedJhb.beratBersih);
              linkedJhb.hargaJualPerKg = hrgKg;
              record.hargaRealisasiPerKg = hrgKg;
              const modal =
                Number(linkedJhb.nilaiModalPengurangStok) || Number(linkedJhb.totalModalHpp) || 0;
              linkedJhb.labaKotor = totalBaru - modal;
            }
          }
        }

        const party = resolveMitraOrManual(
          record.idMitra || 'UMUM',
          record.namaPengirim,
          'Pengirim Umum'
        );
        record.idMitra = party.id;
        record.namaPengirim = party.nama;
        record.nominal = newNominal;
        record.metode = newMetode;
        record.rekeningTujuan = finalRekTujuan;
        if (params.kategori) record.kategori = params.kategori.trim();
        if (params.divisi) record.divisi = params.divisi.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined && params.keterangan.trim()) {
          record.keterangan = params.keterangan.trim();
        }

        auditSummary = `Edit Uang Masuk ${cleanId} (${record.namaPengirim}): Rp ${oldNominal.toLocaleString('id-ID')} -> Rp ${newNominal.toLocaleString('id-ID')} via ${finalRekTujuan}`;
        auditNominal = newNominal;
        auditRekening = finalRekTujuan;
        updatedRecord = record;
      }

      // =====================================================
      // 8C. TRANSAKSI BRILINK (ADM TARIK TUNAI / TUKAR CASH)
      // =====================================================
      else if (jenis === 'BRILINK') {
        const record = (db.brilink || []).find((b) => b.idTransaksi === cleanId)!;
        const oldAdmin = Number(record.nominalAdmin) || 0;
        const oldPokok = Number(record.nominalPokok) || 0;

        const netDelta = new Map<string, number>();
        const addDelta = (kode: string | undefined, d: number) => {
          if (!kode || !d) return;
          netDelta.set(kode, (netDelta.get(kode) || 0) + d);
        };

        // 1. Reverse old BRILink mutations
        if (oldPokok > 0 && record.rekeningBank) {
          const oldKas = record.rekeningKasTunai || 'KAS01';
          if (record.jenisBrilink === 'TARIK_TUNAI') {
            addDelta(record.rekeningBank, -oldPokok);
            addDelta(oldKas, oldPokok);
          } else {
            addDelta(record.rekeningBank, oldPokok);
            addDelta(oldKas, -oldPokok);
          }
        }
        if (record.jenisBrilink === 'TARIK_TUNAI') {
          addDelta(record.rekeningAdmin, -oldAdmin);
        } else {
          addDelta(record.rekeningAdmin, oldAdmin);
        }

        // 2. Apply new BRILink values
        const newJenis: JenisTransaksiBrilink =
          params.jenisBrilink === 'TUKAR_CASH'
            ? 'TUKAR_CASH'
            : params.jenisBrilink === 'TARIK_TUNAI'
            ? 'TARIK_TUNAI'
            : record.jenisBrilink;
        const newAdmin = Math.round(Number(params.nominal ?? record.nominalAdmin));
        if (isNaN(newAdmin) || newAdmin <= 0) {
          throw new Error('Nominal Biaya Admin BRILink harus lebih dari Rp 0');
        }
        const newPokok = Math.max(
          0,
          Math.round(Number(params.nominalPokok ?? record.nominalPokok ?? 0))
        );

        const targetAdminKode = (
          params.rekeningAdmin ||
          params.rekeningTujuan ||
          params.rekeningSumber ||
          record.rekeningAdmin ||
          'KAS01'
        ).trim();
        const adminAcc = db.rekening.find((r) => r.kode === targetAdminKode && r.status === 'AKTIF');
        if (!adminAcc || adminAcc.isVirtual || adminAcc.kategori === 'OPERASIONAL_DIVISI') {
          throw new Error(`Rekening Biaya Admin (${targetAdminKode}) tidak valid`);
        }

        let finalRekBank: string | undefined = undefined;
        let finalRekKas: string | undefined = undefined;
        if (newPokok > 0) {
          const bankKode = (params.rekeningBank || record.rekeningBank || '').trim();
          if (!bankKode || bankKode === 'KAS01') {
            throw new Error('Pilih Rekening Bank PT untuk mutasi dana pokok BRILink');
          }
          const bankAcc = db.rekening.find((r) => r.kode === bankKode && r.status === 'AKTIF');
          if (!bankAcc || bankAcc.isVirtual || bankAcc.kategori === 'OPERASIONAL_DIVISI') {
            throw new Error(`Rekening Bank (${bankKode}) tidak valid`);
          }
          finalRekBank = bankAcc.kode;
          finalRekKas = 'KAS01';
          if (newJenis === 'TARIK_TUNAI') {
            addDelta(bankAcc.kode, newPokok);
            addDelta('KAS01', -newPokok);
          } else {
            addDelta(bankAcc.kode, -newPokok);
            addDelta('KAS01', newPokok);
          }
        }

        if (newJenis === 'TARIK_TUNAI') {
          addDelta(adminAcc.kode, newAdmin);
        } else {
          addDelta(adminAcc.kode, -newAdmin);
        }

        for (const [kode, delta] of netDelta.entries()) {
          if (delta < 0) {
            const acc = db.rekening.find((r) => r.kode === kode);
            if (acc && !this.isAnakPerusahaanRekening(acc) && acc.saldoSaatIni + delta < 0) {
              throw new Error(
                `Saldo ${acc.nama} (${acc.kode}) tidak mencukupi (Tersedia: Rp ${acc.saldoSaatIni.toLocaleString('id-ID')}, pengurangan: Rp ${Math.abs(delta).toLocaleString('id-ID')})`
              );
            }
          }
        }
        for (const [kode, delta] of netDelta.entries()) {
          const acc = db.rekening.find((r) => r.kode === kode);
          if (acc) acc.saldoSaatIni += delta;
        }

        const party = resolveMitraOrManual(
          record.idMitra || 'UMUM',
          record.namaPelanggan,
          'Nasabah Umum'
        );
        record.jenisBrilink = newJenis;
        record.arusAdmin = newJenis === 'TARIK_TUNAI' ? 'MASUK' : 'KELUAR';
        record.idMitra = party.id;
        record.namaPelanggan = party.nama;
        record.nominalAdmin = newAdmin;
        record.nominalPokok = newPokok;
        record.rekeningAdmin = adminAcc.kode;
        record.rekeningBank = finalRekBank;
        record.rekeningKasTunai = finalRekKas;
        if (params.divisi) record.divisi = params.divisi.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== undefined && params.keterangan.trim()) {
          record.keterangan = params.keterangan.trim();
        }

        auditSummary = `Edit BRILink ${cleanId} (${record.namaPelanggan}): Adm Rp ${oldAdmin.toLocaleString('id-ID')} -> Rp ${newAdmin.toLocaleString('id-ID')} [${newJenis}]`;
        auditNominal = newAdmin;
        auditRekening = adminAcc.kode;
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

        if (params.idKaryawan) {
          const kry = (db.karyawan || []).find((k) => k.id === params.idKaryawan);
          if (kry) {
            record.idKaryawan = kry.id;
            record.namaKaryawan = params.namaKaryawanManual?.trim() || kry.nama;
            record.nikKaryawan = kry.nik;
            record.jabatan = kry.jabatan;
          }
        } else if (params.namaKaryawanManual?.trim()) {
          record.namaKaryawan = params.namaKaryawanManual.trim();
        }

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
        if (params.tanggal) record.tanggalKerja = normalizeDateToDmy(params.tanggal, record.tanggalKerja);
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

        if (
          record.rekeningSumber &&
          record.rekeningSumber !== 'BON01' &&
          record.rekeningSumber !== 'TIT01' &&
          record.rekeningSumber !== 'SINKRON' &&
          record.metodePembayaran !== 'SINKRON'
        ) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek && oldRek.kategori !== 'OPERASIONAL_DIVISI') {
            oldRek.saldoSaatIni += oldBersih;
          }
        }

        if (params.idKaryawan) {
          const kry = (db.karyawan || []).find((k) => k.id === params.idKaryawan);
          if (kry) {
            record.idKaryawan = kry.id;
            record.namaKaryawan = params.namaKaryawanManual?.trim() || kry.nama;
            record.jabatan = kry.jabatan;
          }
        } else if (params.namaKaryawanManual?.trim()) {
          record.namaKaryawan = params.namaKaryawanManual.trim();
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

        const resolvedRek = this.resolvePayrollRekeningSumber(
          db,
          params.rekeningSumber || record.rekeningSumber || 'KAS01',
          params.metode || record.metodePembayaran
        );

        if (
          !resolvedRek.isSinkron &&
          resolvedRek.rekeningObj &&
          gajiBersihDibayar > 0 &&
          !this.isAnakPerusahaanRekening(resolvedRek.rekeningObj) &&
          resolvedRek.rekeningObj.saldoSaatIni < gajiBersihDibayar
        ) {
          throw new Error(
            `Saldo ${resolvedRek.rekeningObj.nama} tidak mencukupi untuk gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
          );
        }
        if (!resolvedRek.isSinkron && resolvedRek.rekeningObj && gajiBersihDibayar > 0) {
          resolvedRek.rekeningObj.saldoSaatIni -= gajiBersihDibayar;
        }

        record.gajiPokok = gajiPokok;
        record.tunjangan = tunjangan;
        record.bonus = bonus;
        record.totalGajiKotor = totalGajiKotor;
        record.potonganKasbon = potonganKasbon;
        record.gajiBersihDibayar = gajiBersihDibayar;
        record.rekeningSumber = resolvedRek.kode;
        record.metodePembayaran = resolvedRek.metode;
        if (params.divisi) record.divisi = params.divisi as NamaDivisi;
        if (params.periodeBulan) record.periodeBulan = params.periodeBulan.trim();
        if (params.tanggal) record.tanggal = normalizeDateToDmy(params.tanggal, record.tanggal);
        if (params.keterangan !== undefined) record.keterangan = params.keterangan.trim();

        auditSummary = `Edit Penggajian ${cleanId} (${record.namaKaryawan}): Gaji Bersih Rp ${oldBersih.toLocaleString('id-ID')} -> Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${resolvedRek.kode}`;
        auditNominal = gajiBersihDibayar;
        auditRekening = resolvedRek.kode;
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
  // HAPUS TRANSAKSI UNIVERSAL (SEMUA 14 JENIS TRANSAKSI DENGAN REVERSAL AKUNTANSI & STOK PENUH)
  // ==========================================
  public static async deleteTransactionUniversal(params: {
    idTransaksi: string;
    jenis?: string;
  }): Promise<{
    success: boolean;
    jenis: string;
    idTransaksi: string;
    message: string;
  }> {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      const lookup = this.getTransactionDetail(params.idTransaksi, params.jenis);
      const { jenis, id: cleanId } = lookup;

      const ensureNoBayarBonAllocation = (refId: string, labelNota: string) => {
        const linkedBayar = (db.bayarBon || []).find((b) =>
          (b.alokasi || []).some((a) => a.refId === refId)
        );
        if (linkedBayar) {
          throw new Error(
            `${labelNota} (${refId}) sudah memiliki riwayat Pembayaran Bon terkait (${linkedBayar.idTransaksi}). Hapus transaksi Pembayaran Bon tersebut terlebih dahulu agar saldo Kas/Bank dan piutang tetap akurat.`
          );
        }
      };

      const reverseBayarBonAllocations = (alokasiList: any[]) => {
        for (const alok of alokasiList || []) {
          if (alok.jenis === 'KASBON_BARANG') {
            const pj = (db.penjualan || []).find((p) => p.noPenjualan === alok.refId);
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
            const ku = (db.kasbonUang || []).find((k) => k.idTransaksi === alok.refId);
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
      };

      const recalculateProductHppFromRealPurchases = (kodeProduk: string) => {
        const cleanKode = String(kodeProduk || '').trim().toUpperCase();
        if (!cleanKode || cleanKode === 'REKAP-NOTA' || cleanKode.startsWith('CUSTOM-')) return;
        const prod = (db.produk || []).find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
        const stokItem = (db.stokBarang || []).find((s) => String(s.kode || '').trim().toUpperCase() === cleanKode);
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
        } else if ((stokItem?.stok || 0) === 0) {
          prod.hargaBeli = 0;
        }
      };

      let auditSummary = '';
      let auditNominal = 0;
      let auditRekening = 'KAS01';

      // 1. NOTA SILANG (MITRA ⇄ ANAK PERUSAHAAN / SESAMA MITRA)
      if (jenis === 'NOTA_SILANG') {
        ensureNoBayarBonAllocation(cleanId, 'Nota Silang');
        const saleRec = (db.penjualan || []).find(
          (p) => Boolean(p.isNotaSilang) && p.noPenjualan === cleanId
        );
        const creditRec = (db.pembelianHasilBumi || []).find(
          (b) =>
            Boolean(b.isNotaSilang || b.komoditasKode === 'NOTA_SILANG') &&
            (b.idNotaSilangRef === cleanId ||
              b.noPembelian === `${cleanId}-DPP` ||
              b.noPembelian === `${cleanId}-MTR` ||
              b.noPembelian === cleanId)
        );
        const nom = Number(saleRec?.totalNominal ?? creditRec?.totalNominal ?? 0);
        const namaPengambil = saleRec?.namaMitra || creditRec?.namaMitraPengambil || 'Mitra';
        const namaPenyedia = saleRec?.namaAnakPerusahaan || creditRec?.namaMitra || 'Penyedia';

        db.penjualan = (db.penjualan || []).filter(
          (p) => !(Boolean(p.isNotaSilang) && p.noPenjualan === cleanId)
        );
        db.pembelianHasilBumi = (db.pembelianHasilBumi || []).filter(
          (b) =>
            !(
              Boolean(b.isNotaSilang || b.komoditasKode === 'NOTA_SILANG') &&
              (b.idNotaSilangRef === cleanId ||
                b.noPembelian === `${cleanId}-DPP` ||
                b.noPembelian === `${cleanId}-MTR` ||
                b.noPembelian === cleanId)
            )
        );

        auditSummary = `Hapus Nota Silang ${cleanId} (${namaPengambil} ⇄ ${namaPenyedia}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = 'BON01';
      }

      // 2. PEMBELIAN HASIL BUMI (FISIK, PINJAMAN DANA PT -> SALDO TITIP, & TITIP NOTA LALU)
      else if (jenis === 'PEMBELIAN_HASIL_BUMI') {
        const idx = (db.pembelianHasilBumi || []).findIndex((p) => p.noPembelian === cleanId);
        if (idx === -1) throw new Error(`Transaksi Pembelian Hasil Bumi ${cleanId} tidak ditemukan`);
        const target = db.pembelianHasilBumi[idx];

        if ((target.isNotaSilang || target.komoditasKode === 'NOTA_SILANG') && target.idNotaSilangRef) {
          ensureNoBayarBonAllocation(target.idNotaSilangRef, 'Nota Silang');
          db.penjualan = (db.penjualan || []).filter((p) => p.noPenjualan !== target.idNotaSilangRef);
        }

        const beratBersih = Number(target.beratBersih) || 0;
        if (
          beratBersih > 0 &&
          target.komoditasKode !== 'PINJAMAN_DANA' &&
          target.komoditasKode !== 'TITIP_DANA' &&
          target.komoditasKode !== 'NOTA_SILANG' &&
          !target.isNotaSilang
        ) {
          const kom = (db.stokHasilBumi || []).find(
            (k) =>
              String(k.kode || '').trim().toUpperCase() === String(target.komoditasKode || '').trim().toUpperCase() ||
              String(k.nama || '').trim().toUpperCase() === String(target.komoditasNama || '').trim().toUpperCase()
          );
          if (kom) {
            kom.stok = Math.max(0, Math.round((Number(kom.stok || 0) - beratBersih) * 100) / 100);
            kom.updateTerakhir = iso;
          }
        }

        const nom = Math.round(Number(target.totalNominal) || 0);
        const isPinjamanDana =
          target.komoditasKode === 'PINJAMAN_DANA' ||
          Boolean(target.komoditasNama?.toLowerCase().includes('pinjaman uang'));

        if (isPinjamanDana) {
          if (
            target.rekeningSumber &&
            target.rekeningSumber !== 'TIT01' &&
            target.rekeningSumber !== 'BON01' &&
            target.rekeningSumber !== 'SINKRON'
          ) {
            const rek = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
            if (rek && !rek.isVirtual) {
              rek.saldoSaatIni -= nom;
            }
          }
        } else if (
          !target.isBelumPutusHarga &&
          nom > 0 &&
          target.metodePembayaran !== 'TITIP' &&
          target.metodePembayaran !== 'SINKRON' &&
          target.rekeningSumber !== 'TIT01' &&
          target.rekeningSumber !== 'BON01' &&
          target.rekeningSumber !== 'SINKRON'
        ) {
          const rekKode = target.rekeningSumber || (target.metodePembayaran === 'TUNAI' ? 'KAS01' : '');
          if (rekKode) {
            const rek = (db.rekening || []).find((r) => r.kode === rekKode);
            if (rek && !rek.isVirtual) {
              rek.saldoSaatIni += nom;
            }
          }
        }

        db.pembelianHasilBumi.splice(idx, 1);
        auditSummary = `Hapus Transaksi ${target.komoditasNama} ${cleanId} (${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = target.rekeningSumber || 'TIT01';
      }

      // 3. PENJUALAN HASIL BUMI KELUAR GUDANG
      else if (jenis === 'PENJUALAN_HASIL_BUMI') {
        const jhbArr = db.penjualanHasilBumi || [];
        const idx = jhbArr.findIndex((j) => j.noPenjualan === cleanId);
        if (idx === -1) throw new Error(`Transaksi Penjualan Hasil Bumi ${cleanId} tidak ditemukan`);
        const target = jhbArr[idx];

        ensureNoBayarBonAllocation(cleanId, 'Penjualan Hasil Bumi');
        const linkedUm = (db.uangMasuk || []).find((u) => u.noPenjualanHasilBumi === cleanId);
        if (linkedUm) {
          throw new Error(
            `Penjualan Hasil Bumi (${cleanId}) sudah memiliki pencatatan Uang Masuk terkait (${linkedUm.idTransaksi}). Hapus transaksi Uang Masuk tersebut terlebih dahulu.`
          );
        }

        const restoreKg = (Number(target.beratBersih) || 0) + (Number(target.beratSusutKg) || 0);
        if (restoreKg > 0) {
          const kom = (db.stokHasilBumi || []).find(
            (k) =>
              String(k.kode || '').trim().toUpperCase() === String(target.komoditasKode || '').trim().toUpperCase() ||
              String(k.nama || '').trim().toUpperCase() === String(target.komoditasNama || '').trim().toUpperCase()
          );
          if (kom) {
            kom.stok = Math.round(((Number(kom.stok) || 0) + restoreKg) * 100) / 100;
            kom.updateTerakhir = iso;
          }
        }

        const nom = Math.round(Number(target.totalNominal) || 0);
        if (
          (target.metodePembayaran === 'TUNAI' || target.metodePembayaran === 'TRANSFER') &&
          target.rekeningTujuan &&
          target.rekeningTujuan !== 'BON01' &&
          target.rekeningTujuan !== 'TIT01' &&
          target.rekeningTujuan !== 'SINKRON' &&
          target.rekeningTujuan !== 'MENUNGGU_TRANSFER' &&
          target.rekeningTujuan !== 'MENUNGGU_UANG_MASUK'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningTujuan);
          if (rek && !rek.isVirtual) {
            rek.saldoSaatIni -= nom;
          }
        }

        jhbArr.splice(idx, 1);
        db.penjualanHasilBumi = jhbArr;
        auditSummary = `Hapus Penjualan Hasil Bumi ${cleanId} (${target.komoditasNama} - ${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = target.rekeningTujuan || 'KAS01';
      }

      // 4. PEMBELIAN BARANG DAGANG / KULAKAN SUPPLIER
      else if (jenis === 'PEMBELIAN_BARANG') {
        const idx = (db.pembelianBarang || []).findIndex((p) => p.noPembelian === cleanId);
        if (idx === -1) throw new Error(`Transaksi Pembelian Barang ${cleanId} tidak ditemukan`);
        const target = db.pembelianBarang[idx];
        const nom = Math.round(Number(target.totalNominal) || 0);
        const affectedCodes = new Set<string>();

        for (const it of target.items || []) {
          const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
          if (cleanKode && cleanKode !== 'REKAP-NOTA' && !cleanKode.startsWith('CUSTOM-')) {
            affectedCodes.add(cleanKode);
            const stokItem = (db.stokBarang || []).find(
              (s) => String(s.kode || '').trim().toUpperCase() === cleanKode
            );
            if (stokItem) {
              stokItem.stok = Math.max(0, (Number(stokItem.stok) || 0) - (Number(it.qty) || 0));
              stokItem.updateTerakhir = iso;
            }
          }
        }

        if (target.metodePembayaran === 'TUNAI') {
          const kasAcc = (db.rekening || []).find((r) => r.kode === 'KAS01');
          if (kasAcc) kasAcc.saldoSaatIni += nom;
        } else if (
          target.metodePembayaran === 'TRANSFER' &&
          target.rekeningSumber &&
          target.rekeningSumber !== 'TIT01' &&
          target.rekeningSumber !== 'BON01' &&
          target.rekeningSumber !== 'SINKRON'
        ) {
          const bankAcc = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
          if (bankAcc && !bankAcc.isVirtual) bankAcc.saldoSaatIni += nom;
        }

        db.pembelianBarang.splice(idx, 1);
        for (const kode of affectedCodes) {
          recalculateProductHppFromRealPurchases(kode);
        }

        auditSummary = `Hapus Pembelian Barang Kulakan ${cleanId} (${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = target.rekeningSumber || 'KAS01';
      }

      // 5. PENJUALAN TOKO / SAPROTAN / KASBON BARANG / PEMAKAIAN PENGELUARAN
      else if (jenis === 'PENJUALAN') {
        const idx = (db.penjualan || []).findIndex((p) => p.noPenjualan === cleanId);
        if (idx === -1) throw new Error(`Transaksi Penjualan ${cleanId} tidak ditemukan`);
        const target = db.penjualan[idx];

        if (target.metode === 'KASBON') {
          ensureNoBayarBonAllocation(cleanId, 'Nota Penjualan Kasbon');
        }

        for (const it of target.items || []) {
          const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
          if (!cleanKode || cleanKode.startsWith('CUSTOM-') || cleanKode === 'NOTA-SILANG') continue;
          const prod = (db.produk || []).find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
          const stokItem = (db.stokBarang || []).find(
            (s) => String(s.kode || '').trim().toUpperCase() === cleanKode
          );
          if (stokItem && !isProdukTanpaStok(prod || stokItem, db.kategoriProduk)) {
            stokItem.stok = (Number(stokItem.stok) || 0) + (Number(it.qty) || 0);
            stokItem.updateTerakhir = iso;
          }
        }

        const nom = Math.round(Number(target.totalNominal) || 0);
        if (
          (target.metode === 'TUNAI' || target.metode === 'TRANSFER') &&
          target.rekeningTujuan &&
          target.rekeningTujuan !== 'BON01' &&
          target.rekeningTujuan !== 'SINKRON' &&
          target.rekeningTujuan !== 'PENGELUARAN' &&
          target.rekeningTujuan !== 'INTERNAL_PT'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningTujuan);
          if (rek && !rek.isVirtual) rek.saldoSaatIni -= nom;
        }

        if (target.idPengeluaranTerkait) {
          db.pengeluaran = (db.pengeluaran || []).filter(
            (e) => e.idTransaksi !== target.idPengeluaranTerkait
          );
        }

        db.penjualan.splice(idx, 1);
        auditSummary = `Hapus Penjualan ${cleanId} (${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = target.rekeningTujuan || 'KAS01';
      }

      // 6. KASBON UANG & PIUTANG NOTA LALU (NTL...)
      else if (jenis === 'KASBON_UANG') {
        const idx = (db.kasbonUang || []).findIndex((k) => k.idTransaksi === cleanId);
        if (idx === -1) throw new Error(`Transaksi Kasbon / Nota Lalu ${cleanId} tidak ditemukan`);
        const target = db.kasbonUang[idx];

        ensureNoBayarBonAllocation(cleanId, 'Kasbon / Nota Lalu');

        const nom = Math.round(Number(target.nominal) || 0);
        const isNotaLalu = Boolean(target.isNotaLalu || target.rekeningSumber === 'BON01');
        if (
          !isNotaLalu &&
          target.rekeningSumber &&
          target.rekeningSumber !== 'BON01' &&
          target.rekeningSumber !== 'TIT01' &&
          target.rekeningSumber !== 'SINKRON'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
          if (rek && !rek.isVirtual) rek.saldoSaatIni += nom;
        }

        db.kasbonUang.splice(idx, 1);
        auditSummary = `Hapus ${isNotaLalu ? 'Nota Lalu Piutang' : 'Kasbon Uang'} ${cleanId} (${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = target.rekeningSumber || 'BON01';
      }

      // 7. BAYAR BON / PELUNASAN PIUTANG / SINKRON / KLIRING SILANG
      else if (jenis === 'BAYAR_BON') {
        const idx = (db.bayarBon || []).findIndex((b) => b.idTransaksi === cleanId);
        if (idx === -1) throw new Error(`Transaksi Pembayaran Bon ${cleanId} tidak ditemukan`);
        const target = db.bayarBon[idx];
        const nom = Math.round(Number(target.nominalBayar) || 0);

        const wasNonTunai =
          target.metode === 'SINKRON' ||
          target.metode === 'KOMPENSASI_TITIP' ||
          target.metode === 'POTONG_GAJI' ||
          target.rekeningTujuan === 'SINKRON' ||
          Boolean(target.isKompensasiTitipan) ||
          Boolean(target.isPotongGaji);

        if (
          !wasNonTunai &&
          target.rekeningTujuan &&
          target.rekeningTujuan !== 'BON01' &&
          target.rekeningTujuan !== 'TIT01' &&
          target.rekeningTujuan !== 'SINKRON' &&
          target.rekeningTujuan !== 'KOMPENSASI_TITIP' &&
          target.rekeningTujuan !== 'POTONG_GAJI'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningTujuan);
          if (rek && !rek.isVirtual) rek.saldoSaatIni -= nom;
        }

        reverseBayarBonAllocations(target.alokasi || []);

        // Jika pasangan Sinkron / Kliring Silang ada di pencairanTitipan, hapus juga pasangannya agar saldo titip kembali utuh
        db.pencairanTitipan = (db.pencairanTitipan || []).filter(
          (p) =>
            p.idPencairan !== `${cleanId}-SINKRON` &&
            !(cleanId.endsWith('-POTBON') && p.idPencairan === cleanId.replace(/-POTBON$/, '-POTTIT')) &&
            !(cleanId.endsWith('-BON') && p.idPencairan === cleanId.replace(/-BON$/, '-TIT'))
        );

        db.bayarBon.splice(idx, 1);
        auditSummary = `Hapus Pembayaran Bon ${cleanId} (${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')}) — Piutang nota kembali terbuka`;
        auditNominal = nom;
        auditRekening = target.rekeningTujuan || 'KAS01';
      }

      // 8. PENCAIRAN TITIPAN HASIL BUMI / SINKRON / KLIRING
      else if (jenis === 'PENCAIRAN_TITIPAN') {
        const idx = (db.pencairanTitipan || []).findIndex((p) => p.idPencairan === cleanId);
        if (idx === -1) throw new Error(`Transaksi Pencairan Titipan ${cleanId} tidak ditemukan`);
        const target = db.pencairanTitipan[idx];
        const nom = Math.round(Number(target.nominalPencairan) || 0);

        const wasKompensasi =
          target.metodePembayaran === 'SINKRON' ||
          target.metodePembayaran === 'KOMPENSASI_BON' ||
          target.rekeningSumber === 'SINKRON' ||
          Boolean(target.isKompensasiBon);

        if (
          !wasKompensasi &&
          target.rekeningSumber &&
          target.rekeningSumber !== 'TIT01' &&
          target.rekeningSumber !== 'BON01' &&
          target.rekeningSumber !== 'SINKRON'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
          if (rek && !rek.isVirtual) rek.saldoSaatIni += nom;
        }

        // Jika pasangan Sinkron / Kliring Silang ada di bayarBon, kembalikan alokasi piutangnya dan hapus pasangan bayarBon-nya
        const pairedBayarIds = new Set<string>();
        if (cleanId.endsWith('-SINKRON')) pairedBayarIds.add(cleanId.replace(/-SINKRON$/, ''));
        if (cleanId.endsWith('-POTTIT')) pairedBayarIds.add(cleanId.replace(/-POTTIT$/, '-POTBON'));
        if (cleanId.endsWith('-TIT')) pairedBayarIds.add(cleanId.replace(/-TIT$/, '-BON'));

        if (pairedBayarIds.size > 0) {
          for (const b of db.bayarBon || []) {
            if (pairedBayarIds.has(b.idTransaksi)) {
              reverseBayarBonAllocations(b.alokasi || []);
            }
          }
          db.bayarBon = (db.bayarBon || []).filter((b) => !pairedBayarIds.has(b.idTransaksi));
        }

        db.pencairanTitipan.splice(idx, 1);
        auditSummary = `Hapus Pencairan Titipan ${cleanId} (${target.namaMitra}, Rp ${nom.toLocaleString('id-ID')}) — Saldo titip mitra telah dipulihkan`;
        auditNominal = nom;
        auditRekening = target.rekeningSumber || 'KAS01';
      }

      // 9. PENGELUARAN & BIAYA OPERASIONAL
      else if (jenis === 'PENGELUARAN_DIVISI') {
        const idx = (db.pengeluaran || []).findIndex((e) => e.idTransaksi === cleanId);
        if (idx === -1) throw new Error(`Transaksi Pengeluaran ${cleanId} tidak ditemukan`);
        const target = db.pengeluaran[idx];
        const signedNominal = Number(target.nominal) || 0;
        const isNonKas =
          Boolean(target.isNonKas) ||
          target.rekeningSumber === 'SINKRON' ||
          target.rekeningSumber === 'STOK_INTERNAL';

        if (!isNonKas && target.rekeningSumber) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
          if (rek && !rek.isVirtual) {
            rek.saldoSaatIni += signedNominal;
          }
        }

        // Jika pengeluaran berasal dari pemakaian stok toko (PEMAKAIAN_PENGELUARAN), kembalikan stok produk terkait
        const linkedSales = (db.penjualan || []).filter((p) => p.idPengeluaranTerkait === cleanId);
        for (const ls of linkedSales) {
          for (const it of ls.items || []) {
            const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
            if (!cleanKode || cleanKode.startsWith('CUSTOM-') || cleanKode === 'NOTA-SILANG') continue;
            const prod = (db.produk || []).find((p) => String(p.kode || '').trim().toUpperCase() === cleanKode);
            const stokItem = (db.stokBarang || []).find(
              (s) => String(s.kode || '').trim().toUpperCase() === cleanKode
            );
            if (stokItem && !isProdukTanpaStok(prod || stokItem, db.kategoriProduk)) {
              stokItem.stok = (Number(stokItem.stok) || 0) + (Number(it.qty) || 0);
              stokItem.updateTerakhir = iso;
            }
          }
        }
        if (linkedSales.length > 0) {
          db.penjualan = (db.penjualan || []).filter((p) => p.idPengeluaranTerkait !== cleanId);
        }

        db.pengeluaran.splice(idx, 1);
        auditSummary = `Hapus Pengeluaran ${cleanId} [${target.kategori} · ${target.divisi}] Rp ${Math.abs(signedNominal).toLocaleString('id-ID')}`;
        auditNominal = Math.abs(signedNominal);
        auditRekening = target.rekeningSumber || 'KAS01';
      }

      // 10. TRANSAKSI UANG MASUK (+)
      else if (jenis === 'UANG_MASUK') {
        const umArr = db.uangMasuk || [];
        const idx = umArr.findIndex((u) => u.idTransaksi === cleanId);
        if (idx === -1) throw new Error(`Transaksi Uang Masuk ${cleanId} tidak ditemukan`);
        const target = umArr[idx];
        const nom = Math.round(Number(target.nominal) || 0);

        if (
          target.rekeningTujuan &&
          target.rekeningTujuan !== 'BON01' &&
          target.rekeningTujuan !== 'TIT01' &&
          target.rekeningTujuan !== 'SINKRON'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningTujuan);
          if (rek && !rek.isVirtual) rek.saldoSaatIni -= nom;
        }

        if (target.noPenjualanHasilBumi) {
          const linkedJhb = (db.penjualanHasilBumi || []).find(
            (j) => j.noPenjualan === target.noPenjualanHasilBumi
          );
          if (linkedJhb) {
            const totalBaru = Math.max(0, (Number(linkedJhb.nominalUangMasukTerkumpul) || 0) - nom);
            linkedJhb.nominalUangMasukTerkumpul = totalBaru;
            if (linkedJhb.metodePembayaran === 'BELUM_PUTUS_HARGA') {
              linkedJhb.statusUangMasuk = totalBaru > 0 ? 'SEBAGIAN' : 'BELUM_MASUK';
              linkedJhb.statusPembayaran = 'MENUNGGU_UANG_MASUK';
              if (linkedJhb.beratBersih > 0) {
                const hrgKg = totalBaru > 0 ? Math.round(totalBaru / linkedJhb.beratBersih) : linkedJhb.modalRataRataPerKg || 0;
                linkedJhb.hargaJualPerKg = hrgKg;
                const modal =
                  Number(linkedJhb.nilaiModalPengurangStok) || Number(linkedJhb.totalModalHpp) || 0;
                linkedJhb.labaKotor = totalBaru > 0 ? totalBaru - modal : 0;
              }
            }
          }
        }

        umArr.splice(idx, 1);
        db.uangMasuk = umArr;
        auditSummary = `Hapus Uang Masuk ${cleanId} (${target.namaPengirim}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = target.rekeningTujuan || 'KAS01';
      }

      // 11. TRANSAKSI BRILINK
      else if (jenis === 'BRILINK') {
        const briArr = db.brilink || [];
        const idx = briArr.findIndex((b) => b.idTransaksi === cleanId);
        if (idx === -1) throw new Error(`Transaksi BRILink ${cleanId} tidak ditemukan`);
        const target = briArr[idx];
        const oldAdmin = Number(target.nominalAdmin) || 0;
        const oldPokok = Number(target.nominalPokok) || 0;

        const applyDelta = (kode: string | undefined, d: number) => {
          if (!kode || !d) return;
          const acc = (db.rekening || []).find((r) => r.kode === kode);
          if (acc && !acc.isVirtual) acc.saldoSaatIni += d;
        };

        if (oldPokok > 0 && target.rekeningBank) {
          const oldKas = target.rekeningKasTunai || 'KAS01';
          if (target.jenisBrilink === 'TARIK_TUNAI') {
            applyDelta(target.rekeningBank, -oldPokok);
            applyDelta(oldKas, oldPokok);
          } else {
            applyDelta(target.rekeningBank, oldPokok);
            applyDelta(oldKas, -oldPokok);
          }
        }
        if (target.jenisBrilink === 'TARIK_TUNAI') {
          applyDelta(target.rekeningAdmin, -oldAdmin);
        } else {
          applyDelta(target.rekeningAdmin, oldAdmin);
        }

        briArr.splice(idx, 1);
        db.brilink = briArr;
        auditSummary = `Hapus Transaksi BRILink ${cleanId} (${target.namaPelanggan}, Adm Rp ${oldAdmin.toLocaleString('id-ID')})`;
        auditNominal = oldAdmin + oldPokok;
        auditRekening = target.rekeningAdmin || 'KAS01';
      }

      // 12. TRANSFER ANTAR REKENING
      else if (jenis === 'TRANSFER_REKENING') {
        const idx = (db.transferRekening || []).findIndex((t) => t.noTransfer === cleanId);
        if (idx === -1) throw new Error(`Transaksi Transfer Rekening ${cleanId} tidak ditemukan`);
        const target = db.transferRekening[idx];
        const nom = Math.round(Number(target.nominal) || 0);

        const oldSumber = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
        const oldTujuan = (db.rekening || []).find((r) => r.kode === target.rekeningTujuan);
        if (oldSumber && !oldSumber.isVirtual) oldSumber.saldoSaatIni += nom;
        if (oldTujuan && !oldTujuan.isVirtual) oldTujuan.saldoSaatIni -= nom;

        db.transferRekening.splice(idx, 1);
        auditSummary = `Hapus Transfer Rekening ${cleanId} (${target.rekeningSumber} -> ${target.rekeningTujuan}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = `${target.rekeningSumber} -> ${target.rekeningTujuan}`;
      }

      // 13. UPAH KERJA HARIAN KARYAWAN
      else if (jenis === 'UPAH_HARIAN') {
        const idx = (db.upahHarian || []).findIndex((u) => u.id === cleanId);
        if (idx === -1) throw new Error(`Catatan Upah Harian ${cleanId} tidak ditemukan`);
        const target = db.upahHarian[idx];

        if (target.status === 'SUDAH_DIBAYAR' && target.idPayrollSettlement) {
          throw new Error(
            `Upah harian ini sudah dicairkan dalam Slip Gaji (${target.idPayrollSettlement}). Hapus Slip Gaji tersebut terlebih dahulu jika ingin membatalkan.`
          );
        }

        const nom = Math.round(Number(target.totalUpahHarian || target.jumlah || target.upahHarian) || 0);
        db.upahHarian.splice(idx, 1);
        auditSummary = `Hapus Upah Harian ${cleanId} (${target.namaKaryawan}, Rp ${nom.toLocaleString('id-ID')})`;
        auditNominal = nom;
        auditRekening = 'HUTANG_UPAH';
      }

      // 14. SLIP PENGGAJIAN KARYAWAN
      else if (jenis === 'PENGGAJIAN') {
        const idx = (db.penggajian || []).findIndex((g) => g.id === cleanId);
        if (idx === -1) throw new Error(`Slip Penggajian ${cleanId} tidak ditemukan`);
        const target = db.penggajian[idx];
        const bersih = Math.round(Number(target.gajiBersihDibayar) || 0);

        if (
          target.rekeningSumber &&
          target.rekeningSumber !== 'BON01' &&
          target.rekeningSumber !== 'TIT01' &&
          target.rekeningSumber !== 'SINKRON' &&
          target.metodePembayaran !== 'SINKRON'
        ) {
          const rek = (db.rekening || []).find((r) => r.kode === target.rekeningSumber);
          if (rek && !rek.isVirtual && rek.kategori !== 'OPERASIONAL_DIVISI') {
            rek.saldoSaatIni += bersih;
          }
        }

        const upahIdSet = new Set<string>(target.daftarUpahHarianIds || []);
        for (const u of db.upahHarian || []) {
          if (u.idPayrollSettlement === cleanId || upahIdSet.has(u.id)) {
            u.status = 'TERCATAT';
            u.ket = 'BON';
            u.idPayrollSettlement = undefined;
            u.tanggalDibayar = undefined;
          }
        }

        if (target.idBayarBonTerkait) {
          const linkedByb = (db.bayarBon || []).find((b) => b.idTransaksi === target.idBayarBonTerkait);
          if (linkedByb) {
            reverseBayarBonAllocations(linkedByb.alokasi || []);
            db.bayarBon = (db.bayarBon || []).filter((b) => b.idTransaksi !== target.idBayarBonTerkait);
          }
        }

        db.penggajian.splice(idx, 1);
        auditSummary = `Hapus Slip Penggajian ${cleanId} (${target.namaKaryawan}, Bersih Rp ${bersih.toLocaleString('id-ID')})`;
        auditNominal = bersih;
        auditRekening = target.rekeningSumber || 'KAS01';
      } else {
        throw new Error(`Jenis transaksi ${jenis} belum didukung untuk penghapusan otomatis`);
      }

      dbManager.synchronizeVirtualAccounts();
      dbManager.synchronizeDivisiAccounts();

      this.addAuditLog(
        db,
        'VOID',
        cleanId,
        auditSummary || `Hapus transaksi ${cleanId}`,
        auditNominal,
        auditRekening
      );

      return {
        success: true,
        jenis,
        idTransaksi: cleanId,
        message: 'Transaksi berhasil dihapus dan seluruh saldo rekening, piutang/titipan mitra, serta stok gudang telah dikembalikan secara otomatis.',
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
      mitra.isNotaNgunci = false;
      mitra.tanggalNgunci = undefined;
      mitra.catatanNgunci = undefined;
      db.kasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra !== cleanId);
      db.bayarBon = (db.bayarBon || []).filter((b) => b.idMitra !== cleanId);
      db.pencairanTitipan = (db.pencairanTitipan || []).filter((pt) => pt.idMitra !== cleanId);

      // 2. Kosongkan piutang penjualan barang toko & penjualan hasil bumi mitra ini
      for (const p of db.penjualan || []) {
        if (p.idMitra === cleanId && p.metode === 'KASBON') {
          p.metode = 'TUNAI';
          p.statusPembayaran = 'LUNAS';
          p.sisaPiutang = 0;
          p.isNotaNgunci = false;
          p.tanggalNgunci = undefined;
          p.catatanNgunci = undefined;
        }
      }
      for (const j of db.penjualanHasilBumi || []) {
        if (j.idMitra === cleanId && j.metodePembayaran === 'PIUTANG') {
          j.metodePembayaran = 'TUNAI';
          j.statusPembayaran = 'LUNAS';
          j.sisaPiutang = 0;
          j.isNotaNgunci = false;
          j.tanggalNgunci = undefined;
          j.catatanNgunci = undefined;
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

      for (const m of db.mitra || []) {
        m.isNotaNgunci = false;
        m.tanggalNgunci = undefined;
        m.catatanNgunci = undefined;
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

  public static async setStatusNotaNgunci(params: {
    idMitra: string;
    idNota?: string;
    isNotaNgunci: boolean;
    catatanNgunci?: string;
  }) {
    const cleanIdMitra = String(params.idMitra || '').trim();
    const cleanIdNota = params.idNota ? String(params.idNota).trim() : '';
    const isNgunci = Boolean(params.isNotaNgunci);

    if (!cleanIdMitra) {
      throw new Error('ID Mitra wajib disertakan');
    }

    return await dbManager.executeTransaction((db) => {
      const { tanggal } = getWIBDateTime();
      const mitra = (db.mitra || []).find((m) => m.id === cleanIdMitra);
      if (!mitra) {
        throw new Error(`Mitra dengan ID ${cleanIdMitra} tidak ditemukan`);
      }

      const cleanCatatan = isNgunci
        ? (params.catatanNgunci || '').trim() ||
          'Mitra memiliki piutang namun sudah tidak ada respon & kepastian membayar'
        : undefined;

      let affectedNominal = 0;
      let affectedCount = 0;

      if (cleanIdNota) {
        // Toggle pada 1 lembar nota piutang spesifik
        const k = (db.kasbonUang || []).find(
          (item) => item.idMitra === cleanIdMitra && item.idTransaksi === cleanIdNota
        );
        if (k) {
          k.isNotaNgunci = isNgunci;
          k.tanggalNgunci = isNgunci ? tanggal : undefined;
          k.catatanNgunci = cleanCatatan;
          affectedNominal += k.sisaKasbon || 0;
          affectedCount++;
        }

        const p = (db.penjualan || []).find(
          (item) => item.idMitra === cleanIdMitra && item.noPenjualan === cleanIdNota
        );
        if (p) {
          p.isNotaNgunci = isNgunci;
          p.tanggalNgunci = isNgunci ? tanggal : undefined;
          p.catatanNgunci = cleanCatatan;
          affectedNominal += p.sisaPiutang || 0;
          affectedCount++;
        }

        const j = (db.penjualanHasilBumi || []).find(
          (item) => item.idMitra === cleanIdMitra && item.noPenjualan === cleanIdNota
        );
        if (j) {
          j.isNotaNgunci = isNgunci;
          j.tanggalNgunci = isNgunci ? tanggal : undefined;
          j.catatanNgunci = cleanCatatan;
          affectedNominal += j.sisaPiutang || 0;
          affectedCount++;
        }

        if (affectedCount === 0) {
          throw new Error(`Nota piutang ${cleanIdNota} untuk mitra ${mitra.nama} tidak ditemukan`);
        }

        // Sinkronkan penanda di level Mitra berdasarkan apakah masih ada nota belum lunas yang ngunci
        const stillHasNgunci =
          (db.kasbonUang || []).some(
            (x) => x.idMitra === cleanIdMitra && x.status !== 'LUNAS' && (x.sisaKasbon || 0) > 0 && Boolean(x.isNotaNgunci)
          ) ||
          (db.penjualan || []).some(
            (x) => x.idMitra === cleanIdMitra && x.metode === 'KASBON' && (x.sisaPiutang || 0) > 0 && Boolean(x.isNotaNgunci)
          ) ||
          (db.penjualanHasilBumi || []).some(
            (x) => x.idMitra === cleanIdMitra && x.metodePembayaran === 'PIUTANG' && (x.sisaPiutang || 0) > 0 && Boolean(x.isNotaNgunci)
          );
        mitra.isNotaNgunci = stillHasNgunci;
        if (isNgunci) {
          mitra.tanggalNgunci = tanggal;
          mitra.catatanNgunci = cleanCatatan;
        } else if (!stillHasNgunci) {
          mitra.tanggalNgunci = undefined;
          mitra.catatanNgunci = undefined;
        }
      } else {
        // Toggle seluruh piutang berjalan milik Mitra ini
        for (const k of db.kasbonUang || []) {
          if (k.idMitra === cleanIdMitra && k.status !== 'LUNAS' && (k.sisaKasbon || 0) > 0) {
            k.isNotaNgunci = isNgunci;
            k.tanggalNgunci = isNgunci ? tanggal : undefined;
            k.catatanNgunci = cleanCatatan;
            affectedNominal += k.sisaKasbon || 0;
            affectedCount++;
          }
        }
        for (const p of db.penjualan || []) {
          if (p.idMitra === cleanIdMitra && p.metode === 'KASBON' && (p.sisaPiutang || 0) > 0) {
            p.isNotaNgunci = isNgunci;
            p.tanggalNgunci = isNgunci ? tanggal : undefined;
            p.catatanNgunci = cleanCatatan;
            affectedNominal += p.sisaPiutang || 0;
            affectedCount++;
          }
        }
        for (const j of db.penjualanHasilBumi || []) {
          if (j.idMitra === cleanIdMitra && j.metodePembayaran === 'PIUTANG' && (j.sisaPiutang || 0) > 0) {
            j.isNotaNgunci = isNgunci;
            j.tanggalNgunci = isNgunci ? tanggal : undefined;
            j.catatanNgunci = cleanCatatan;
            affectedNominal += j.sisaPiutang || 0;
            affectedCount++;
          }
        }

        if (isNgunci && affectedCount === 0) {
          throw new Error(
            `Mitra ${mitra.nama} saat ini tidak memiliki saldo piutang / nota belum lunas. Silakan input Nota Lalu terlebih dahulu.`
          );
        }

        mitra.isNotaNgunci = isNgunci;
        mitra.tanggalNgunci = isNgunci ? tanggal : undefined;
        mitra.catatanNgunci = cleanCatatan;
      }

      const statusLabel = isNgunci ? 'NOTA NGUNCI (Piutang Macet)' : 'NOTA AKTIF (Dipulihkan)';
      this.addAuditLog(
        db,
        'UPDATE',
        cleanIdNota || cleanIdMitra,
        `Perubahan status nota piutang ${mitra.nama}${cleanIdNota ? ` [${cleanIdNota}]` : ''} menjadi ${statusLabel} senilai Rp ${affectedNominal.toLocaleString('id-ID')}`,
        affectedNominal,
        'BON01'
      );

      return {
        idMitra: cleanIdMitra,
        namaMitra: mitra.nama,
        idNota: cleanIdNota || undefined,
        isNotaNgunci: isNgunci,
        affectedCount,
        affectedNominal,
        message: isNgunci
          ? `Status piutang ${mitra.nama} (${affectedCount} nota · Rp ${affectedNominal.toLocaleString('id-ID')}) berhasil ditandai sebagai NOTA NGUNCI.`
          : `Status piutang ${mitra.nama} (${affectedCount} nota · Rp ${affectedNominal.toLocaleString('id-ID')}) berhasil dipulihkan menjadi NOTA AKTIF.`,
      };
    });
  }

  /**
   * 9. REKAPAN TRANSAKSI HARIAN LENGKAP BOS:
   * - Detail Uang Masuk & Uang Keluar per transaksi
   * - Kesimpulan Saldo Akhir Kasir (KAS01) sebelum ditransfer ke BERANGKAS (BRK01)
   * - Rekapan Barang Masuk per Hari & Akumulasi dipisahkan per Komoditas
   */
  public static getRekapHarianBosLengkap(tanggalQuery?: string): RekapHarianBosLengkapResponse {
    const db = dbManager.get();
    const todayDmy = getWIBDateTime().tanggal; // DD/MM/YYYY

    const normalizeDmy = (raw?: string): string => {
      if (!raw) return '';
      const clean = String(raw).trim();
      const parts = clean.split(/[-/]/);
      if (parts.length !== 3) return clean;
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    };

    const dmyToIso = (dmy: string): string => {
      const parts = dmy.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return dmy;
    };

    const dmyToSortNum = (dmy?: string): number => {
      const norm = normalizeDmy(dmy);
      const parts = norm.split('/');
      if (parts.length !== 3) return 0;
      return Number(`${parts[2]}${parts[1]}${parts[0]}`) || 0;
    };

    const targetTanggal = normalizeDmy(tanggalQuery) || todayDmy;
    const targetTanggalIso = dmyToIso(targetTanggal);
    const targetSortNum = dmyToSortNum(targetTanggal);
    const todaySortNum = dmyToSortNum(todayDmy);

    // Identifikasi Rekening Kasir (KAS01) & Berangkas (BRK01 / BERANGKAS — selalu kecualikan KAS01)
    const kasirAcc = (db.rekening || []).find((r) => r.kode === 'KAS01');
    const kodeKasir = kasirAcc?.kode || 'KAS01';
    const namaKasir = kasirAcc?.nama || 'Kas Utama Kasir';
    const isRekeningBerangkasBos = (
      rekObj?: { kode?: string; nama?: string } | null,
      rawKode?: string
    ): boolean => {
      const k = (rekObj?.kode || rawKode || '').trim();
      if (!k || k === kodeKasir) return false;
      return (
        k === 'BRK01' ||
        /berangkas|brankas/i.test(k) ||
        /\b(berangkas|brankas)\b/i.test(rekObj?.nama || '')
      );
    };
    const berangkasAcc = (db.rekening || []).find((r) => isRekeningBerangkasBos(r, r.kode));
    const kodeBerangkas = berangkasAcc?.kode || 'BRK01';
    const namaBerangkas = berangkasAcc?.nama || 'BERANGKAS';

    const rekeningNameMap = new Map<string, string>();
    for (const r of db.rekening || []) {
      rekeningNameMap.set(r.kode, r.nama);
    }
    const getRekName = (kode?: string) => {
      if (!kode) return '-';
      return rekeningNameMap.get(kode) || kode;
    };

    // Kumpulkan semua tanggal aktif di database untuk navigasi cepat Bos
    const tanggalSet = new Set<string>([todayDmy]);
    const collectDate = (d?: string) => {
      const n = normalizeDmy(d);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(n)) tanggalSet.add(n);
    };

    (db.penjualan || []).forEach((x) => collectDate(x.tanggal));
    (db.penjualanHasilBumi || []).forEach((x) => collectDate(x.tanggal));
    (db.uangMasuk || []).forEach((x) => collectDate(x.tanggal));
    (db.bayarBon || []).forEach((x) => collectDate(x.tanggal));
    (db.pembelianHasilBumi || []).forEach((x) => collectDate(x.tanggal));
    (db.pembelianBarang || []).forEach((x) => collectDate(x.tanggal));
    (db.pengeluaran || []).forEach((x) => collectDate(x.tanggal));
    (db.kasbonUang || []).forEach((x) => collectDate(x.tanggal));
    (db.pencairanTitipan || []).forEach((x) => collectDate(x.tanggal));
    (db.penggajian || []).forEach((x) => collectDate(x.tanggal));
    (db.brilink || []).forEach((x) => collectDate(x.tanggal));
    (db.transferRekening || []).forEach((x) => collectDate(x.tanggal));

    const daftarTanggalTersedia = Array.from(tanggalSet).sort(
      (a, b) => dmyToSortNum(b) - dmyToSortNum(a)
    );

    // Saldo Awal Kasir adalah per hari = Rp 0 (tidak menarik mutasi hari-hari selanjutnya)
    const addFutureKasirDelta = (_txDate: string | undefined, _delta: number) => {
      // sengaja diisolasi per hari sesuai aturan pembukuan kasir ke berangkas
    };

    const detailUangMasuk: ItemDetailArusKasBos[] = [];
    const detailUangKeluar: ItemDetailArusKasBos[] = [];
    const detailMutasiKasirBerangkas: ItemDetailArusKasBos[] = [];

    let droppingMasukKasirHariIni = 0;
    let sudahDisetorKeBerangkasHariIni = 0;
    let transferKeluarKeBankLainHariIni = 0;
    let mutasiPokokBrilinkKasirHariIni = 0;
    let opnameDeltaHariIni = 0;

    // 1. PENJUALAN TOKO (LUNAS TUNAI / TRANSFER — EXCLUDE KASBON, SINKRON, INTERNAL, PENGELUARAN & NOTA SILANG)
    for (const p of db.penjualan || []) {
      if (
        p.metode === 'KASBON' ||
        p.metode === 'SINKRON' ||
        p.metode === 'INTERNAL_PT' ||
        p.metode === 'PEMAKAIAN_PENGELUARAN' ||
        p.isNotaSilang ||
        p.rekeningTujuan === 'INTERNAL_PT' ||
        p.rekeningTujuan === 'SINKRON' ||
        p.rekeningTujuan === 'PENGELUARAN'
      ) {
        continue;
      }
      const nom = Math.round(Number(p.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = p.rekeningTujuan || (p.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || p.metode === 'TUNAI';
      if (isKasir) addFutureKasirDelta(p.tanggal, nom);

      if (normalizeDmy(p.tanggal) === targetTanggal) {
        const itemsText = (p.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        detailUangMasuk.push({
          id: p.noPenjualan,
          tanggal: normalizeDmy(p.tanggal),
          jam: p.jam || '00:00:00',
          arah: 'MASUK',
          kategoriKode: 'PENJUALAN_TOKO',
          kategoriLabel: 'Penjualan Toko',
          divisi: p.divisi,
          pihak: p.namaMitra || 'Pelanggan Umum',
          deskripsi: itemsText || p.keterangan || 'Penjualan barang toko',
          metode: p.metode,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
        });
      }
    }

    // 2. PENJUALAN HASIL BUMI LANGSUNG LUNAS (TUNAI / TRANSFER — EXCLUDE SINKRON)
    for (const j of db.penjualanHasilBumi || []) {
      if (
        j.metodePembayaran === 'PIUTANG' ||
        j.metodePembayaran === 'BELUM_PUTUS_HARGA' ||
        j.metodePembayaran === 'SINKRON' ||
        j.rekeningTujuan === 'SINKRON'
      ) {
        continue;
      }
      const nom = Math.round(Number(j.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = j.rekeningTujuan || (j.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || j.metodePembayaran === 'TUNAI';
      if (isKasir) addFutureKasirDelta(j.tanggal, nom);

      if (normalizeDmy(j.tanggal) === targetTanggal) {
        detailUangMasuk.push({
          id: j.noPenjualan,
          tanggal: normalizeDmy(j.tanggal),
          jam: j.jam || '00:00:00',
          arah: 'MASUK',
          kategoriKode: 'JUAL_HASIL_BUMI',
          kategoriLabel: 'Penjualan Hasil Bumi',
          divisi: j.divisi,
          pihak: j.namaMitra || 'Pembeli Hasil Bumi',
          deskripsi: `${j.komoditasNama} (${Number(j.beratBersih || 0).toLocaleString('id-ID')} Kg × Rp ${Number(j.hargaJualPerKg || 0).toLocaleString('id-ID')})`,
          metode: j.metodePembayaran,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
        });
      }
    }

    // 3. MENU UANG MASUK (REALISASI MUAT HASIL BUMI / PENERIMAAN OPERASIONAL)
    for (const um of db.uangMasuk || []) {
      if (um.metode === 'SINKRON' || um.rekeningTujuan === 'SINKRON') continue;
      const nom = Math.round(Number(um.nominal) || 0);
      if (nom <= 0) continue;
      const rekKode = um.rekeningTujuan || (um.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || um.metode === 'TUNAI';
      if (isKasir) addFutureKasirDelta(um.tanggal, nom);

      if (normalizeDmy(um.tanggal) === targetTanggal) {
        detailUangMasuk.push({
          id: um.idTransaksi,
          tanggal: normalizeDmy(um.tanggal),
          jam: um.jam || '00:00:00',
          arah: 'MASUK',
          kategoriKode: 'UANG_MASUK',
          kategoriLabel: um.kategori || 'Uang Masuk / Realisasi HB',
          divisi: um.divisi,
          pihak: um.namaPengirim || um.pengirim || 'Pengirim',
          deskripsi:
            um.keterangan ||
            (um.komoditasNama
              ? `Realisasi ${um.komoditasNama} (${Number(um.beratMuatKg || 0).toLocaleString('id-ID')} Kg)`
              : 'Penerimaan Uang Masuk'),
          metode: um.metode,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
          fotoBukti: um.fotoBukti,
        });
      }
    }

    // 4. SETORAN PELUNASAN BON / PIUTANG MITRA
    for (const b of db.bayarBon || []) {
      if (
        b.metode === 'SINKRON' ||
        b.metode === 'KOMPENSASI_TITIP' ||
        b.metode === 'POTONG_GAJI' ||
        b.isKompensasiTitipan ||
        b.isPotongGaji ||
        b.rekeningTujuan === 'SINKRON' ||
        b.rekeningTujuan === 'KOMPENSASI_TITIP' ||
        b.rekeningTujuan === 'POTONG_GAJI'
      ) {
        continue;
      }
      const nom = Math.round(Number(b.nominalBayar) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningTujuan || (b.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || b.metode === 'TUNAI';
      if (isKasir) addFutureKasirDelta(b.tanggal, nom);

      if (normalizeDmy(b.tanggal) === targetTanggal) {
        detailUangMasuk.push({
          id: b.idTransaksi,
          tanggal: normalizeDmy(b.tanggal),
          jam: b.jam || '00:00:00',
          arah: 'MASUK',
          kategoriKode: 'BAYAR_BON',
          kategoriLabel: 'Pelunasan Bon Mitra',
          pihak: b.namaMitra || 'Mitra',
          deskripsi: b.keterangan || 'Setoran pembayaran piutang/bon mitra',
          metode: b.metode,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
          fotoBukti: b.fotoBukti || b.fotoNota,
        });
      }
    }

    // 5. PINJAMAN DANA MASUK DARI MITRA / ANAK PERUSAHAAN KE PT (PEMBELIAN HB NON-FISIK)
    for (const b of db.pembelianHasilBumi || []) {
      const isPinjamanDana =
        b.komoditasKode === 'PINJAMAN_DANA' || Boolean(b.komoditasNama?.includes('Pinjaman Uang'));
      if (!isPinjamanDana) continue;
      if (!b.rekeningSumber || b.rekeningSumber === 'TIT01') continue;
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningSumber;
      const isKasir = rekKode === kodeKasir;
      if (isKasir) addFutureKasirDelta(b.tanggal, nom);

      if (normalizeDmy(b.tanggal) === targetTanggal) {
        detailUangMasuk.push({
          id: b.noPembelian,
          tanggal: normalizeDmy(b.tanggal),
          jam: b.jam || '00:00:00',
          arah: 'MASUK',
          kategoriKode: 'PINJAMAN_MITRA',
          kategoriLabel: 'Dana Masuk / Titipan Mitra',
          divisi: b.divisi,
          pihak: b.namaMitra || 'Mitra',
          deskripsi: b.keterangan || b.komoditasNama || 'Dana pinjaman mitra masuk ke PT',
          metode: isKasir ? 'TUNAI' : 'TRANSFER',
          rekeningKode: rekKode,
          rekeningNama: getRekName(rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
          fotoBukti: b.fotoNota,
        });
      }
    }

    // 6. TRANSAKSI BRILINK (ADM TARIK TUNAI = MASUK, ADM TUKAR CASH = KELUAR, + MUTASI POKOK KAS01)
    for (const br of db.brilink || []) {
      const nomAdmin = Math.round(Number(br.nominalAdmin) || 0);
      const nomPokok = Math.round(Number(br.nominalPokok) || 0);
      const rekAdm = br.rekeningAdmin || kodeKasir;
      const isAdmKasir = rekAdm === kodeKasir;
      const kasPokokKode = br.rekeningKasTunai || kodeKasir;

      if (br.jenisBrilink === 'TARIK_TUNAI') {
        if (isAdmKasir && nomAdmin > 0) addFutureKasirDelta(br.tanggal, nomAdmin);
        if (kasPokokKode === kodeKasir && nomPokok > 0) addFutureKasirDelta(br.tanggal, -nomPokok);

        if (normalizeDmy(br.tanggal) === targetTanggal) {
          if (nomAdmin > 0) {
            detailUangMasuk.push({
              id: br.idTransaksi,
              tanggal: normalizeDmy(br.tanggal),
              jam: br.jam || '00:00:00',
              arah: 'MASUK',
              kategoriKode: 'BRILINK_MASUK',
              kategoriLabel: 'Adm Tarik Tunai BRILink',
              divisi: br.divisi || 'BRILink',
              pihak: br.namaPelanggan || 'Nasabah BRILink',
              deskripsi:
                br.keterangan ||
                `Pendapatan Admin Tarik Tunai${nomPokok > 0 ? ` (Pokok Rp ${nomPokok.toLocaleString('id-ID')})` : ''}`,
              metode: isAdmKasir ? 'TUNAI' : 'TRANSFER',
              rekeningKode: rekAdm,
              rekeningNama: getRekName(rekAdm),
              nominalTotal: nomAdmin,
              nominalKasirTunai: isAdmKasir ? nomAdmin : 0,
              nominalBank: !isAdmKasir ? nomAdmin : 0,
              fotoBukti: br.fotoBukti,
            });
          }
          if (kasPokokKode === kodeKasir && nomPokok > 0) {
            mutasiPokokBrilinkKasirHariIni -= nomPokok;
            detailMutasiKasirBerangkas.push({
              id: `${br.idTransaksi}-POKOK`,
              tanggal: normalizeDmy(br.tanggal),
              jam: br.jam || '00:00:00',
              arah: 'MUTASI_INTERNAL',
              kategoriKode: 'BRILINK_POKOK_KELUAR_KASIR',
              kategoriLabel: 'Pokok Tarik Tunai BRILink (Tunai Keluar Kasir → Masuk Bank)',
              divisi: br.divisi || 'BRILink',
              pihak: br.namaPelanggan || 'Nasabah BRILink',
              deskripsi: `Penyerahan fisik tunai kasir ke nasabah (Saldo masuk ke ${getRekName(br.rekeningBank)})`,
              metode: 'MUTASI_BRILINK',
              rekeningKode: kodeKasir,
              rekeningNama: `${namaKasir} → ${getRekName(br.rekeningBank)}`,
              nominalTotal: nomPokok,
              nominalKasirTunai: -nomPokok,
              nominalBank: nomPokok,
            });
          }
        }
      } else {
        // TUKAR_CASH
        if (isAdmKasir && nomAdmin > 0) addFutureKasirDelta(br.tanggal, -nomAdmin);
        if (kasPokokKode === kodeKasir && nomPokok > 0) addFutureKasirDelta(br.tanggal, nomPokok);

        if (normalizeDmy(br.tanggal) === targetTanggal) {
          if (nomAdmin > 0) {
            detailUangKeluar.push({
              id: br.idTransaksi,
              tanggal: normalizeDmy(br.tanggal),
              jam: br.jam || '00:00:00',
              arah: 'KELUAR',
              kategoriKode: 'BRILINK_KELUAR',
              kategoriLabel: 'Biaya Adm Tukar Cash BRILink',
              divisi: br.divisi || 'BRILink',
              pihak: br.namaPelanggan || 'Agen Tukar Cash',
              deskripsi:
                br.keterangan ||
                `Biaya Admin Tukar Cash Rupiah PT${nomPokok > 0 ? ` (Pokok Rp ${nomPokok.toLocaleString('id-ID')})` : ''}`,
              metode: isAdmKasir ? 'TUNAI' : 'TRANSFER',
              rekeningKode: rekAdm,
              rekeningNama: getRekName(rekAdm),
              nominalTotal: nomAdmin,
              nominalKasirTunai: isAdmKasir ? nomAdmin : 0,
              nominalBank: !isAdmKasir ? nomAdmin : 0,
              fotoBukti: br.fotoBukti,
            });
          }
          if (kasPokokKode === kodeKasir && nomPokok > 0) {
            mutasiPokokBrilinkKasirHariIni += nomPokok;
            detailMutasiKasirBerangkas.push({
              id: `${br.idTransaksi}-POKOK`,
              tanggal: normalizeDmy(br.tanggal),
              jam: br.jam || '00:00:00',
              arah: 'MUTASI_INTERNAL',
              kategoriKode: 'BRILINK_POKOK_MASUK_KASIR',
              kategoriLabel: 'Pokok Tukar Cash BRILink (Tunai Masuk Kasir ← Bank)',
              divisi: br.divisi || 'BRILink',
              pihak: br.namaPelanggan || 'Agen Tukar Cash',
              deskripsi: `Penerimaan fisik uang tunai kasir dari tukar cash ${getRekName(br.rekeningBank)}`,
              metode: 'MUTASI_BRILINK',
              rekeningKode: kodeKasir,
              rekeningNama: `${getRekName(br.rekeningBank)} → ${namaKasir}`,
              nominalTotal: nomPokok,
              nominalKasirTunai: nomPokok,
              nominalBank: -nomPokok,
            });
          }
        }
      }
    }

    // 7. PEMBELIAN HASIL BUMI PETANI (TUNAI / TRANSFER — UANG KELUAR)
    for (const b of db.pembelianHasilBumi || []) {
      if (
        b.metodePembayaran === 'TITIP' ||
        b.metodePembayaran === 'SINKRON' ||
        b.rekeningSumber === 'SINKRON' ||
        b.komoditasKode === 'PINJAMAN_DANA' ||
        b.komoditasKode === 'TITIP_DANA' ||
        b.komoditasKode === 'NOTA_SILANG' ||
        b.isNotaSilang ||
        b.komoditasNama?.includes('Pinjaman Uang')
      ) {
        continue;
      }
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningSumber || (b.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || b.metodePembayaran === 'TUNAI';
      if (isKasir) addFutureKasirDelta(b.tanggal, -nom);

      if (normalizeDmy(b.tanggal) === targetTanggal) {
        detailUangKeluar.push({
          id: b.noPembelian,
          tanggal: normalizeDmy(b.tanggal),
          jam: b.jam || '00:00:00',
          arah: 'KELUAR',
          kategoriKode: 'BELI_HASIL_BUMI',
          kategoriLabel: 'Pembelian Hasil Bumi',
          divisi: b.divisi,
          pihak: b.namaMitra || 'Petani / Supplier',
          deskripsi: `${b.komoditasNama} — ${Number(b.beratBersih || 0).toLocaleString('id-ID')} Kg × Rp ${Number(b.hargaPerKg || 0).toLocaleString('id-ID')}`,
          metode: b.metodePembayaran,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
          fotoBukti: b.fotoNota,
        });
      }
    }

    // 8. PENGELUARAN OPERASIONAL DIVISI (HANYA YANG MELIBATKAN KAS / BANK FISIK)
    for (const p of db.pengeluaran || []) {
      if (p.isNonKas || p.rekeningSumber === 'SINKRON' || p.rekeningSumber === 'STOK_INTERNAL') {
        continue;
      }
      const rawNom = Math.round(Number(p.nominal) || 0);
      if (rawNom === 0) continue;
      const rekKode = p.rekeningSumber || kodeKasir;
      const isKasir = rekKode === kodeKasir;
      if (isKasir) addFutureKasirDelta(p.tanggal, -rawNom);

      if (normalizeDmy(p.tanggal) === targetTanggal) {
        if (rawNom > 0) {
          detailUangKeluar.push({
            id: p.idTransaksi,
            tanggal: normalizeDmy(p.tanggal),
            jam: p.jam || '00:00:00',
            arah: 'KELUAR',
            kategoriKode: 'PENGELUARAN_DIVISI',
            kategoriLabel: `Pengeluaran (${p.kategori || 'Operasional'})`,
            divisi: p.divisi,
            pihak: p.penerima || p.divisi || 'Operasional',
            deskripsi: p.keterangan || p.kategori || 'Biaya operasional divisi',
            metode: isKasir ? 'TUNAI' : 'TRANSFER',
            rekeningKode: isKasir ? kodeKasir : rekKode,
            rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
            nominalTotal: rawNom,
            nominalKasirTunai: isKasir ? rawNom : 0,
            nominalBank: !isKasir ? rawNom : 0,
            fotoBukti: p.fotoKuitansi,
          });
        } else {
          const absRefund = Math.abs(rawNom);
          detailUangMasuk.push({
            id: p.idTransaksi,
            tanggal: normalizeDmy(p.tanggal),
            jam: p.jam || '00:00:00',
            arah: 'MASUK',
            kategoriKode: 'PENGEMBALIAN_PENGELUARAN',
            kategoriLabel: `Pengurangan/Pengembalian Pengeluaran (${p.kategori || 'Operasional'})`,
            divisi: p.divisi,
            pihak: p.penerima || p.divisi || 'Operasional',
            deskripsi: p.keterangan || 'Koreksi / pengembalian biaya pengeluaran',
            metode: isKasir ? 'TUNAI' : 'TRANSFER',
            rekeningKode: isKasir ? kodeKasir : rekKode,
            rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
            nominalTotal: absRefund,
            nominalKasirTunai: isKasir ? absRefund : 0,
            nominalBank: !isKasir ? absRefund : 0,
            fotoBukti: p.fotoKuitansi,
          });
        }
      }
    }

    // 9. KASBON UANG (PENCAIRAN PINJAMAN TUNAI / TRANSFER KE MITRA)
    for (const k of db.kasbonUang || []) {
      if (k.isNotaLalu || k.rekeningSumber === 'BON01' || k.rekeningSumber === 'SINKRON' || k.metode === 'SINKRON') {
        continue;
      }
      const nom = Math.round(Number(k.nominal) || 0);
      if (nom <= 0) continue;
      const rekKode = k.rekeningSumber || (k.metode === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || k.metode === 'TUNAI';
      if (isKasir) addFutureKasirDelta(k.tanggal, -nom);

      if (normalizeDmy(k.tanggal) === targetTanggal) {
        detailUangKeluar.push({
          id: k.idTransaksi,
          tanggal: normalizeDmy(k.tanggal),
          jam: k.jam || '00:00:00',
          arah: 'KELUAR',
          kategoriKode: 'KASBON_UANG',
          kategoriLabel: 'Kasbon / Pinjaman Uang Mitra',
          pihak: k.namaMitra || 'Mitra',
          deskripsi: k.keterangan || 'Pencairan kasbon uang mitra',
          metode: k.metode,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
          fotoBukti: k.fotoNota,
        });
      }
    }

    // 10. KULAKAN / PEMBELIAN BARANG TOKO LUNAS
    for (const b of db.pembelianBarang || []) {
      if (b.metodePembayaran === 'HUTANG' || b.metodePembayaran === 'SINKRON' || b.rekeningSumber === 'SINKRON') {
        continue;
      }
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom <= 0) continue;
      const rekKode = b.rekeningSumber || (b.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || b.metodePembayaran === 'TUNAI';
      if (isKasir) addFutureKasirDelta(b.tanggal, -nom);

      if (normalizeDmy(b.tanggal) === targetTanggal) {
        const itemsText = (b.items || [])
          .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
          .join(', ');
        detailUangKeluar.push({
          id: b.noPembelian,
          tanggal: normalizeDmy(b.tanggal),
          jam: b.jam || '00:00:00',
          arah: 'KELUAR',
          kategoriKode: 'KULAKAN_BARANG',
          kategoriLabel: 'Kulakan Barang Toko',
          divisi: b.divisi,
          pihak: b.namaMitra || b.namaDistributorManual || 'Supplier Toko',
          deskripsi: itemsText || b.keterangan || 'Pembelian stok barang toko',
          metode: b.metodePembayaran,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
          fotoBukti: b.fotoNota,
        });
      }
    }

    // 11. PENCAIRAN TITIPAN HASIL BUMI MITRA
    for (const pt of db.pencairanTitipan || []) {
      if (
        pt.metodePembayaran === 'SINKRON' ||
        pt.metodePembayaran === 'KOMPENSASI_BON' ||
        pt.rekeningSumber === 'SINKRON' ||
        pt.isKompensasiBon
      ) {
        continue;
      }
      const nom = Math.round(Number(pt.nominalPencairan) || 0);
      if (nom <= 0) continue;
      const rekKode = pt.rekeningSumber || (pt.metodePembayaran === 'TUNAI' ? kodeKasir : '');
      const isKasir = rekKode === kodeKasir || pt.metodePembayaran === 'TUNAI';
      if (isKasir) addFutureKasirDelta(pt.tanggal, -nom);

      if (normalizeDmy(pt.tanggal) === targetTanggal) {
        detailUangKeluar.push({
          id: pt.idPencairan,
          tanggal: normalizeDmy(pt.tanggal),
          jam: pt.jam || '00:00:00',
          arah: 'KELUAR',
          kategoriKode: 'PENCAIRAN_TITIPAN',
          kategoriLabel: 'Pencairan Titipan Panen',
          pihak: pt.namaMitra || 'Mitra',
          deskripsi: pt.keterangan || 'Pencairan dana titipan hasil bumi mitra',
          metode: pt.metodePembayaran,
          rekeningKode: isKasir ? kodeKasir : rekKode,
          rekeningNama: getRekName(isKasir ? kodeKasir : rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
        });
      }
    }

    // 12. PEMBAYARAN GAJI & UPAH KARYAWAN
    for (const g of db.penggajian || []) {
      if (g.metodePembayaran === 'SINKRON' || g.rekeningSumber === 'SINKRON') continue;
      const nom = Math.round(Number(g.gajiBersihDibayar) || 0);
      if (nom <= 0) continue;
      const isKasir = this.isKasirPayrollRecord(db, g, kodeKasir);
      const rekKode = isKasir ? kodeKasir : g.rekeningSumber || kodeKasir;
      if (isKasir) addFutureKasirDelta(g.tanggal, -nom);

      if (normalizeDmy(g.tanggal) === targetTanggal) {
        detailUangKeluar.push({
          id: g.slipNomor,
          tanggal: normalizeDmy(g.tanggal),
          jam: g.jam || '00:00:00',
          arah: 'KELUAR',
          kategoriKode: 'GAJI_UPAH',
          kategoriLabel: 'Pembayaran Gaji / Upah',
          divisi: g.divisi,
          pihak: g.namaKaryawan || 'Karyawan',
          deskripsi: g.keterangan || `Slip Gaji ${g.periodeBulan || ''}`.trim(),
          metode: g.metodePembayaran,
          rekeningKode: rekKode,
          rekeningNama: getRekName(rekKode),
          nominalTotal: nom,
          nominalKasirTunai: isKasir ? nom : 0,
          nominalBank: !isKasir ? nom : 0,
        });
      }
    }

    // 13. TRANSFER ANTAR REKENING (DROPPING BERANGKAS/BANK -> KASIR vs SETOR KASIR -> BERANGKAS)
    for (const t of db.transferRekening || []) {
      if (t.status && t.status !== 'BERHASIL') continue;
      const nom = Math.round(Number(t.nominal) || 0);
      if (nom <= 0) continue;
      const asal = t.rekeningSumber;
      const tujuan = t.rekeningTujuan;

      if (tujuan === kodeKasir) {
        addFutureKasirDelta(t.tanggal, nom);
      }
      if (asal === kodeKasir) {
        addFutureKasirDelta(t.tanggal, -nom);
      }

      if (normalizeDmy(t.tanggal) === targetTanggal) {
        const asalRekObj = (db.rekening || []).find((r) => r.kode === asal);
        const tujuanRekObj = (db.rekening || []).find((r) => r.kode === tujuan);
        const asalIsBerangkas = asal === kodeBerangkas || isRekeningBerangkasBos(asalRekObj, asal);
        const tujuanIsBerangkas =
          tujuan === kodeBerangkas || isRekeningBerangkasBos(tujuanRekObj, tujuan);

        if (tujuan === kodeKasir) {
          droppingMasukKasirHariIni += nom;
          detailMutasiKasirBerangkas.push({
            id: t.noTransfer,
            tanggal: normalizeDmy(t.tanggal),
            jam: t.jam || '00:00:00',
            arah: 'MUTASI_INTERNAL',
            kategoriKode: 'DROPPING_MASUK_KASIR',
            kategoriLabel: asalIsBerangkas
              ? `Dropping Modal dari ${getRekName(asal)} ke Kasir`
              : `Dropping Dana dari ${getRekName(asal)} ke Kasir`,
            pihak: `${getRekName(asal)} → ${namaKasir}`,
            deskripsi: t.keterangan || 'Penambahan modal kas tunai kasir',
            metode: 'PINDAH_BUKU',
            rekeningKode: kodeKasir,
            rekeningNama: `${getRekName(asal)} → ${namaKasir}`,
            nominalTotal: nom,
            nominalKasirTunai: nom,
            nominalBank: !asalIsBerangkas ? -nom : 0,
          });
        } else if (asal === kodeKasir && tujuanIsBerangkas) {
          sudahDisetorKeBerangkasHariIni += nom;
          detailMutasiKasirBerangkas.push({
            id: t.noTransfer,
            tanggal: normalizeDmy(t.tanggal),
            jam: t.jam || '00:00:00',
            arah: 'MUTASI_INTERNAL',
            kategoriKode: 'SETOR_KASIR_KE_BERANGKAS',
            kategoriLabel: `Pengembalian Kasir ke ${getRekName(tujuan)}`,
            pihak: `${namaKasir} → ${getRekName(tujuan)}`,
            deskripsi: t.keterangan || 'Transfer pengembalian saldo akhir kasir ke berangkas',
            metode: 'SETOR_BERANGKAS',
            rekeningKode: tujuan,
            rekeningNama: `${namaKasir} → ${getRekName(tujuan)}`,
            nominalTotal: nom,
            nominalKasirTunai: -nom,
            nominalBank: 0,
          });
        } else if (asal === kodeKasir) {
          transferKeluarKeBankLainHariIni += nom;
          detailMutasiKasirBerangkas.push({
            id: t.noTransfer,
            tanggal: normalizeDmy(t.tanggal),
            jam: t.jam || '00:00:00',
            arah: 'MUTASI_INTERNAL',
            kategoriKode: 'TRANSFER_KELUAR_KASIR',
            kategoriLabel: `Setor Tunai Kasir ke ${getRekName(tujuan)}`,
            pihak: `${namaKasir} → ${getRekName(tujuan)}`,
            deskripsi: t.keterangan || 'Setor kas tunai ke rekening lain',
            metode: 'PINDAH_BUKU',
            rekeningKode: tujuan,
            rekeningNama: `${namaKasir} → ${getRekName(tujuan)}`,
            nominalTotal: nom,
            nominalKasirTunai: -nom,
            nominalBank: nom,
          });
        }
      }
    }

    // 14. CASH OPNAME ADJUSTMENTS (JIKA ADA PENYESUAIAN SALDO SISTEM KAS01)
    for (const op of db.cashOpnameLogs || []) {
      if (!op.sesuaikanSaldoSistem || !op.selisih) continue;
      addFutureKasirDelta(op.tanggal, op.selisih);
      if (normalizeDmy(op.tanggal) === targetTanggal) {
        opnameDeltaHariIni += op.selisih;
      }
    }

    // Urutkan detail transaksi terbaru di atas (atau jam kronologis)
    const sortByJamAsc = (a: ItemDetailArusKasBos, b: ItemDetailArusKasBos) =>
      (a.jam || '').localeCompare(b.jam || '');
    detailUangMasuk.sort(sortByJamAsc);
    detailUangKeluar.sort(sortByJamAsc);
    detailMutasiKasirBerangkas.sort(sortByJamAsc);

    const totalUangMasuk = detailUangMasuk.reduce((s, x) => s + x.nominalTotal, 0);
    const totalUangMasukKasirTunai = detailUangMasuk.reduce((s, x) => s + x.nominalKasirTunai, 0);
    const totalUangMasukBank = detailUangMasuk.reduce((s, x) => s + x.nominalBank, 0);

    const totalUangKeluar = detailUangKeluar.reduce((s, x) => s + x.nominalTotal, 0);
    const totalUangKeluarKasirTunai = detailUangKeluar.reduce((s, x) => s + x.nominalKasirTunai, 0);
    const totalUangKeluarBank = detailUangKeluar.reduce((s, x) => s + x.nominalBank, 0);

    const arusKasBersih = totalUangMasuk - totalUangKeluar;
    const arusKasBersihKasirTunai = totalUangMasukKasirTunai - totalUangKeluarKasirTunai;

    // Grup rincian per kategori masuk & keluar
    const buildKategoriSummary = (items: ItemDetailArusKasBos[]) => {
      const map = new Map<
        string,
        { label: string; total: number; kasirTunai: number; bank: number; count: number }
      >();
      for (const it of items) {
        const cur = map.get(it.kategoriLabel) || {
          label: it.kategoriLabel,
          total: 0,
          kasirTunai: 0,
          bank: 0,
          count: 0,
        };
        cur.total += it.nominalTotal;
        cur.kasirTunai += it.nominalKasirTunai;
        cur.bank += it.nominalBank;
        cur.count += 1;
        map.set(it.kategoriLabel, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.total - a.total);
    };

    const rincianKategoriMasuk = buildKategoriSummary(detailUangMasuk);
    const rincianKategoriKeluar = buildKategoriSummary(detailUangKeluar);

    // Hitung Kesimpulan Saldo Akhir Kasir Sebelum Setor ke Berangkas (MURNI PER HARI: Saldo Awal Kasir = Rp 0)
    const saldoKasirSaatIniLive = Math.round(Number(kasirAcc?.saldoSaatIni) || 0);
    const saldoBerangkasSaatIniLive = Math.round(Number(berangkasAcc?.saldoSaatIni) || 0);

    const saldoAwalKasirPagi = 0;
    const saldoAkhirKasirSebelumSetorBerangkas =
      saldoAwalKasirPagi +
      droppingMasukKasirHariIni +
      totalUangMasukKasirTunai -
      totalUangKeluarKasirTunai +
      mutasiPokokBrilinkKasirHariIni -
      transferKeluarKeBankLainHariIni +
      opnameDeltaHariIni;

    const saldoAkhirKasirPadaTanggal =
      saldoAkhirKasirSebelumSetorBerangkas - sudahDisetorKeBerangkasHariIni;

    const kesimpulanKasirBerangkas = {
      kodeKasir,
      namaKasir,
      kodeBerangkas,
      namaBerangkas,
      isTanggalHariIni: targetTanggal === todayDmy,
      saldoAwalKasirPagi,
      droppingMasukKasirHariIni,
      uangMasukOperasionalKasirHariIni: totalUangMasukKasirTunai,
      uangKeluarOperasionalKasirHariIni: totalUangKeluarKasirTunai,
      mutasiPokokBrilinkKasirHariIni,
      transferKeluarKeBankLainHariIni,
      saldoAkhirKasirSebelumSetorBerangkas,
      sudahDisetorKeBerangkasHariIni,
      saldoAkhirKasirPadaTanggal,
      saldoKasirSaatIniLive,
      saldoBerangkasSaatIniLive,
      estimasiSaldoBerangkasSetelahKosongkanKasir:
        saldoBerangkasSaatIniLive +
        Math.max(0, targetTanggal === todayDmy ? saldoAkhirKasirPadaTanggal : 0),
    };

    // =========================================================
    // REKAPAN BARANG MASUK PER HARI & AKUMULASI PER KOMODITAS
    // =========================================================
    const round1 = (n: number) => Math.round((Number(n) || 0) * 10) / 10;

    // Filter murni fisik hasil bumi masuk
    const physicalPurchases = (db.pembelianHasilBumi || []).filter(
      (b) =>
        b.komoditasKode !== 'TITIP_DANA' &&
        b.komoditasKode !== 'PINJAMAN_DANA' &&
        b.komoditasKode !== 'NOTA_SILANG' &&
        !b.isNotaSilang &&
        !b.komoditasNama?.includes('Pinjaman Uang') &&
        (Number(b.beratBersih) || 0) > 0
    );

    // Susun daftar master komoditas (prioritaskan urutan KULIT KAYU MANIS KA, KB, STIK, KF seperti Excel Bos)
    const deletedSet = new Set(
      (db.deletedHasilBumiKodes || []).map((k) => String(k).trim().toUpperCase())
    );
    const BULAN_PENDEK = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MEI',
      'JUN',
      'JUL',
      'AGU',
      'SEP',
      'OKT',
      'NOV',
      'DES',
    ];
    const formatShortDateLabel = (dmyRaw?: string): string => {
      const norm = normalizeDmy(dmyRaw || '');
      const parts = norm.split('/');
      if (parts.length !== 3) return '-';
      const dd = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      if (!dd || !mm || mm < 1 || mm > 12) return norm;
      return `${dd} ${BULAN_PENDEK[mm - 1]}`;
    };

    const resolveMasterStokLamaLabel = (rawKet?: string): string => {
      const clean = String(rawKet || '').trim();
      if (!clean || /^rekap stok manual/i.test(clean)) {
        return 'STOK LAMA';
      }
      return clean.toUpperCase();
    };

    const komoditasMetaMap = new Map<
      string,
      {
        kode: string;
        nama: string;
        satuan: string;
        stokGudangSaatIniKg: number;
        stokAwalExplicit?: number;
        rataRataModalAwal: number;
        modalAwalTotal: number;
        keteranganStokAwal?: string;
        tanggalInputStokAwal?: string;
      }
    >();

    for (const hb of db.stokHasilBumi || []) {
      const kUp = String(hb.kode || '').trim().toUpperCase();
      const nUp = String(hb.nama || '').trim().toUpperCase();
      if (!kUp || deletedSet.has(kUp) || deletedSet.has(nUp)) continue;
      const rataAwal = Math.round(
        Number(hb.rataRataModalAwal) || Number(hb.hargaBeliStandar) || 0
      );
      komoditasMetaMap.set(kUp, {
        kode: hb.kode,
        nama: hb.nama,
        satuan: hb.satuan || 'Kg',
        stokGudangSaatIniKg: round1(hb.stok || 0),
        stokAwalExplicit: hb.stokAwal !== undefined ? round1(Number(hb.stokAwal) || 0) : undefined,
        rataRataModalAwal: rataAwal,
        modalAwalTotal: Math.round(Number(hb.modalAwalTotal) || 0),
        keteranganStokAwal: hb.keteranganStokAwal,
        tanggalInputStokAwal: hb.tanggalInputStokAwal,
      });
    }

    for (const b of physicalPurchases) {
      const kUp = String(b.komoditasKode || '').trim().toUpperCase();
      if (!kUp || komoditasMetaMap.has(kUp)) continue;
      komoditasMetaMap.set(kUp, {
        kode: b.komoditasKode,
        nama: b.komoditasNama || b.komoditasKode,
        satuan: 'Kg',
        stokGudangSaatIniKg: 0,
        rataRataModalAwal: 0,
        modalAwalTotal: 0,
      });
    }

    const getPriorityRank = (nama: string): number => {
      const u = nama.trim().toUpperCase();
      if (u === 'KULIT KAYU MANIS KA') return 1;
      if (u === 'KULIT KAYU MANIS KB') return 2;
      if (u.startsWith('KULIT KAYU MANIS STIK') || u === 'KULIT KAYU MANIS S') return 3;
      if (u.startsWith('KULIT KAYU MANIS')) return 4;
      if (u === 'KOPI') return 5;
      if (u === 'LADA') return 6;
      return 10;
    };

    const sortedKomoditasMeta = Array.from(komoditasMetaMap.values()).sort((a, b) => {
      const rA = getPriorityRank(a.nama);
      const rB = getPriorityRank(b.nama);
      if (rA !== rB) return rA - rB;
      if ((b.stokGudangSaatIniKg > 0 ? 1 : 0) !== (a.stokGudangSaatIniKg > 0 ? 1 : 0)) {
        return (b.stokGudangSaatIniKg > 0 ? 1 : 0) - (a.stokGudangSaatIniKg > 0 ? 1 : 0);
      }
      return a.nama.localeCompare(b.nama, 'id');
    });

    const sortPurchaseChronological = (
      a: TransaksiPembelianHasilBumi,
      b: TransaksiPembelianHasilBumi
    ) => {
      const dDiff = dmyToSortNum(a.tanggal) - dmyToSortNum(b.tanggal);
      if (dDiff !== 0) return dDiff;
      return (a.jam || '').localeCompare(b.jam || '');
    };

    const komoditasHarianList: KolomKomoditasMasukBos[] = [];
    const komoditasAkumulasiList: KolomKomoditasMasukBos[] = [];

    for (const meta of sortedKomoditasMeta) {
      const kUp = meta.kode.trim().toUpperCase();
      const nUp = meta.nama.trim().toUpperCase();

      const allForKomoditas = physicalPurchases
        .filter(
          (b) =>
            String(b.komoditasKode || '').trim().toUpperCase() === kUp ||
            String(b.komoditasNama || '').trim().toUpperCase() === nUp
        )
        .sort(sortPurchaseChronological);

      const allSalesForKomoditas = (db.penjualanHasilBumi || []).filter(
        (j) =>
          String(j.komoditasKode || '').trim().toUpperCase() === kUp ||
          String(j.komoditasNama || '').trim().toUpperCase() === nUp
      );

      const totalSoldAllKg = allSalesForKomoditas.reduce(
        (s, j) => s + (Number(j.beratBersih) || 0) + (Number(j.beratSusutKg) || 0),
        0
      );
      const sumPurchasedAllKg = allForKomoditas.reduce(
        (s, b) => s + (Number(b.beratBersih) || 0),
        0
      );
      const sumPurchasedAllRp = allForKomoditas.reduce(
        (s, b) => s + Math.round(Number(b.totalNominal) || 0),
        0
      );

      const impliedMigratedKg = round1(
        Math.max(0, meta.stokGudangSaatIniKg + totalSoldAllKg - sumPurchasedAllKg)
      );

      const hasExplicitAwal =
        meta.stokAwalExplicit !== undefined &&
        (meta.stokAwalExplicit > 0 || meta.modalAwalTotal > 0);
      const masterStokAwalKg = hasExplicitAwal ? meta.stokAwalExplicit! : impliedMigratedKg;
      const masterModalAwalRp =
        meta.modalAwalTotal > 0
          ? meta.modalAwalTotal
          : masterStokAwalKg > 0 && meta.rataRataModalAwal > 0
            ? Math.round(masterStokAwalKg * meta.rataRataModalAwal)
            : 0;
      const masterHargaRataAwal =
        masterStokAwalKg > 0 && masterModalAwalRp > 0
          ? Math.round(masterModalAwalRp / masterStokAwalKg)
          : meta.rataRataModalAwal;
      const masterLabel = resolveMasterStokLamaLabel(meta.keteranganStokAwal);

      // Hitung Stok Lama & Harga Rata-Rata Lama pada pagi hari sebelum targetTanggal
      type PriorEvent =
        | { tipe: 'BELI'; sortNum: number; jam: string; kg: number; rp: number }
        | { tipe: 'JUAL'; sortNum: number; jam: string; kg: number; modalRp: number };

      const priorEvents: PriorEvent[] = [];
      for (const b of allForKomoditas) {
        const sNum = dmyToSortNum(b.tanggal);
        if (sNum > 0 && sNum < targetSortNum) {
          priorEvents.push({
            tipe: 'BELI',
            sortNum: sNum,
            jam: b.jam || '00:00:00',
            kg: Number(b.beratBersih) || 0,
            rp: Math.round(Number(b.totalNominal) || 0),
          });
        }
      }
      for (const j of allSalesForKomoditas) {
        const sNum = dmyToSortNum(j.tanggal);
        if (sNum > 0 && sNum < targetSortNum) {
          const keluarKg = (Number(j.beratBersih) || 0) + (Number(j.beratSusutKg) || 0);
          const recordedModal =
            Number(j.nilaiModalPengurangStok) || Number(j.totalModalHpp) || 0;
          priorEvents.push({
            tipe: 'JUAL',
            sortNum: sNum,
            jam: j.jam || '00:00:00',
            kg: keluarKg,
            modalRp: Math.round(recordedModal),
          });
        }
      }
      priorEvents.sort((a, b) => {
        if (a.sortNum !== b.sortNum) return a.sortNum - b.sortNum;
        return a.jam.localeCompare(b.jam);
      });

      let runningKg = masterStokAwalKg;
      let runningModalRp = masterModalAwalRp;
      for (const ev of priorEvents) {
        if (ev.tipe === 'BELI') {
          runningKg += ev.kg;
          runningModalRp += ev.rp;
        } else {
          const avgBefore = runningKg > 0 ? runningModalRp / runningKg : masterHargaRataAwal;
          const modalOut = ev.modalRp > 0 ? ev.modalRp : Math.round(ev.kg * avgBefore);
          runningKg = Math.max(0, runningKg - ev.kg);
          runningModalRp = runningKg <= 0.001 ? 0 : Math.max(0, runningModalRp - modalOut);
        }
      }

      const stokLamaHarianKg = round1(runningKg);
      const modalLamaHarianRp = Math.round(runningModalRp);
      const rataLamaHarian =
        stokLamaHarianKg > 0 && modalLamaHarianRp > 0
          ? Math.round(modalLamaHarianRp / stokLamaHarianKg)
          : masterHargaRataAwal;

      // A. Harian (pada targetTanggal)
      const dailyPurchases = allForKomoditas.filter(
        (b) => normalizeDmy(b.tanggal) === targetTanggal
      );
      const dailyRows: BarisKomoditasMasukBos[] = dailyPurchases.map((b) => ({
        id: b.noPembelian,
        tanggal: normalizeDmy(b.tanggal),
        jam: b.jam || '00:00:00',
        namaMitra: b.namaMitra || 'Petani',
        beratBersihKg: round1(b.beratBersih || 0),
        hargaPerKg: Math.round(Number(b.hargaPerKg) || 0),
        jumlahRp: Math.round(Number(b.totalNominal) || 0),
        metodePembayaran: b.metodePembayaran,
        isBelumPutusHarga: Boolean(b.isBelumPutusHarga),
      }));

      const totalKgHarian = round1(dailyRows.reduce((s, r) => s + r.beratBersihKg, 0));
      const totalRpHarian = Math.round(dailyRows.reduce((s, r) => s + r.jumlahRp, 0));
      const pricedKgHarian = dailyRows.reduce(
        (s, r) => (r.jumlahRp > 0 ? s + r.beratBersihKg : s),
        0
      );
      const rataHarian = pricedKgHarian > 0 ? Math.round(totalRpHarian / pricedKgHarian) : 0;

      const totalStokGabunganHarianKg = round1(stokLamaHarianKg + totalKgHarian);
      const totalModalGabunganHarianRp = Math.round(modalLamaHarianRp + totalRpHarian);
      const rataGabunganHarian =
        totalStokGabunganHarianKg > 0 && totalModalGabunganHarianRp > 0
          ? Math.round(totalModalGabunganHarianRp / totalStokGabunganHarianKg)
          : rataLamaHarian;

      komoditasHarianList.push({
        kode: meta.kode,
        nama: meta.nama,
        satuan: meta.satuan,
        stokGudangSaatIniKg: meta.stokGudangSaatIniKg,
        stokLama: {
          label: priorEvents.length > 0 ? 'STOK LAMA (S/D H-1)' : masterLabel,
          tanggalLabel: formatShortDateLabel(targetTanggal),
          beratKg: stokLamaHarianKg,
          hargaRataPerKg: rataLamaHarian,
          jumlahModalRp: modalLamaHarianRp,
          masterStokAwalKg,
          masterHargaRataAwal,
          masterModalAwalRp,
          masterKeteranganAwal: meta.keteranganStokAwal || '',
        },
        rows: dailyRows,
        totalKgPeriode: totalKgHarian,
        rataHargaPerKgPeriode: rataHarian,
        totalRpPeriode: totalRpHarian,
        totalStokGabunganKg: totalStokGabunganHarianKg,
        rataHargaGabunganPerKg: rataGabunganHarian,
        totalModalGabunganRp: totalModalGabunganHarianRp,
      });

      // B. Akumulasi Semua Hari (Baris paling atas = Master Stok Lama, bawahnya = Seluruh Pembelian)
      const allPurchaseRows: BarisKomoditasMasukBos[] = allForKomoditas.map((b) => ({
        id: b.noPembelian,
        tanggal: normalizeDmy(b.tanggal),
        jam: b.jam || '00:00:00',
        namaMitra: b.namaMitra || 'Petani',
        beratBersihKg: round1(b.beratBersih || 0),
        hargaPerKg: Math.round(Number(b.hargaPerKg) || 0),
        jumlahRp: Math.round(Number(b.totalNominal) || 0),
        metodePembayaran: b.metodePembayaran,
        isBelumPutusHarga: Boolean(b.isBelumPutusHarga),
      }));

      const pricedKgAllPurchases = allPurchaseRows.reduce(
        (s, r) => (r.jumlahRp > 0 ? s + r.beratBersihKg : s),
        0
      );
      const rataAllPurchases =
        pricedKgAllPurchases > 0 ? Math.round(sumPurchasedAllRp / pricedKgAllPurchases) : 0;

      const totalStokGabunganAkumKg = round1(masterStokAwalKg + sumPurchasedAllKg);
      const totalModalGabunganAkumRp = Math.round(masterModalAwalRp + sumPurchasedAllRp);
      const rataGabunganAkum =
        totalStokGabunganAkumKg > 0 && totalModalGabunganAkumRp > 0
          ? Math.round(totalModalGabunganAkumRp / totalStokGabunganAkumKg)
          : masterHargaRataAwal;

      const tglAwalRaw = meta.tanggalInputStokAwal
        ? meta.tanggalInputStokAwal.split(' ')[0]
        : targetTanggal;

      komoditasAkumulasiList.push({
        kode: meta.kode,
        nama: meta.nama,
        satuan: meta.satuan,
        stokGudangSaatIniKg: meta.stokGudangSaatIniKg,
        stokLama: {
          label: masterLabel,
          tanggalLabel: formatShortDateLabel(tglAwalRaw),
          beratKg: masterStokAwalKg,
          hargaRataPerKg: masterHargaRataAwal,
          jumlahModalRp: masterModalAwalRp,
          masterStokAwalKg,
          masterHargaRataAwal,
          masterModalAwalRp,
          masterKeteranganAwal: meta.keteranganStokAwal || '',
        },
        rows: allPurchaseRows,
        totalKgPeriode: round1(sumPurchasedAllKg),
        rataHargaPerKgPeriode: rataAllPurchases,
        totalRpPeriode: sumPurchasedAllRp,
        totalStokGabunganKg: totalStokGabunganAkumKg,
        rataHargaGabunganPerKg: rataGabunganAkum,
        totalModalGabunganRp: totalModalGabunganAkumRp,
      });
    }

    const totalKgStokLamaHariIni = round1(
      komoditasHarianList.reduce((s, k) => s + k.stokLama.beratKg, 0)
    );
    const totalModalStokLamaHariIni = Math.round(
      komoditasHarianList.reduce((s, k) => s + k.stokLama.jumlahModalRp, 0)
    );
    const totalKgHasilBumiHariIni = round1(
      komoditasHarianList.reduce((s, k) => s + k.totalKgPeriode, 0)
    );
    const totalRpHasilBumiHariIni = Math.round(
      komoditasHarianList.reduce((s, k) => s + k.totalRpPeriode, 0)
    );
    const totalKgStokGabunganHariIni = round1(
      komoditasHarianList.reduce((s, k) => s + k.totalStokGabunganKg, 0)
    );
    const totalUangModalHbDikeluarkan = Math.round(
      komoditasHarianList.reduce((s, k) => s + k.totalModalGabunganRp, 0)
    );

    // Barang Dagangan Toko Masuk pada tanggal terpilih (Kulakan)
    const barangTokoMasukHariIni: ItemBarangTokoMasukBos[] = [];
    for (const b of db.pembelianBarang || []) {
      if (normalizeDmy(b.tanggal) !== targetTanggal) continue;
      for (const it of b.items || []) {
        const prd = (db.produk || []).find(
          (p) => p.kode.toUpperCase() === String(it.kodeProduk || '').toUpperCase()
        );
        barangTokoMasukHariIni.push({
          idFaktur: b.noPembelian,
          tanggal: normalizeDmy(b.tanggal),
          jam: b.jam || '00:00:00',
          namaSupplier: b.namaMitra || b.namaDistributorManual || 'Supplier',
          namaProduk: it.namaProduk,
          kategori: prd?.kategori || 'BARANG TOKO',
          qty: Number(it.qty) || 0,
          satuan: it.satuan || prd?.satuan || 'Pcs',
          hargaBeli: Math.round(Number(it.hargaBeliSatuan) || 0),
          subtotal: Math.round(Number(it.subtotal) || 0),
          metodePembayaran: b.metodePembayaran,
          rekeningSumber: b.rekeningSumber || b.metodePembayaran,
        });
      }
    }

    const totalRpBarangTokoHariIni = barangTokoMasukHariIni.reduce(
      (s, x) => s + x.subtotal,
      0
    );

    return {
      tanggal: targetTanggal,
      tanggalIso: targetTanggalIso,
      daftarTanggalTersedia,
      totalUangMasuk,
      totalUangMasukKasirTunai,
      totalUangMasukBank,
      totalUangKeluar,
      totalUangKeluarKasirTunai,
      totalUangKeluarBank,
      arusKasBersih,
      arusKasBersihKasirTunai,
      rincianKategoriMasuk,
      rincianKategoriKeluar,
      detailUangMasuk,
      detailUangKeluar,
      detailMutasiKasirBerangkas,
      kesimpulanKasirBerangkas,
      komoditasHarianList,
      komoditasAkumulasiList,
      totalKgStokLamaHariIni,
      totalModalStokLamaHariIni,
      totalKgHasilBumiHariIni,
      totalRpHasilBumiHariIni,
      totalKgStokGabunganHariIni,
      totalUangModalHbDikeluarkan,
      barangTokoMasukHariIni,
      totalRpBarangTokoHariIni,
    };
  }

  // =========================================================================
  // SURAT JALAN & INVOICE TITIP JUAL MITRA
  // =========================================================================
  public static async getInvoiceSuratJalanList(): Promise<InvoiceSuratJalanRecord[]> {
    const db = dbManager.get();
    return Array.isArray(db.suratJalan) ? db.suratJalan : [];
  }

  public static async createInvoiceSuratJalan(params: {
    noInvoice: string;
    tanggal?: string;
    idMitra: string;
    namaMitra: string;
    komoditasNama: string;
    kategoriKode?: string;
    platTruk?: string;
    tonaseAwalKg: number;
    tonaseAkhirKg: number;
    basisMitra: number;
    basisBuyer: number;
    rendemen: number;
    hargaPerKgMitra?: number;
    hargaPerKgBuyer?: number;
    pajakNominal?: number;
    komisiNominal?: number;
    kasbonNominal?: number;
    potongPiutang?: boolean;
    potonganLainLabel?: string;
    potonganLainNominal?: number;
    tambahanLabel?: string;
    tambahanNominal?: number;
    rekeningPtKode?: string;
    statusPembayaranMitra?: 'PENDING' | 'LUNAS';
  }): Promise<InvoiceSuratJalanRecord> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: todayWib, jam, iso } = getWIBDateTime();
      if (!Array.isArray(db.suratJalan)) db.suratJalan = [];
      if (!Array.isArray(db.uangMasuk)) db.uangMasuk = [];
      if (!Array.isArray(db.pengeluaran)) db.pengeluaran = [];
      if (!Array.isArray(db.bayarBon)) db.bayarBon = [];

      const finalTanggal = normalizeDateToDmy(params.tanggal, todayWib);
      const idRecord = generateId('SJ');
      const noInvoice = (params.noInvoice || '').trim() || idRecord;

      const tonaseAwalKg = Number(params.tonaseAwalKg) || 0;
      const tonaseAkhirKg = Number(params.tonaseAkhirKg) || 0;
      if (tonaseAkhirKg <= 0) {
        throw new Error('Tonase Akhir Invoice (Kg) wajib lebih dari 0');
      }

      const rendemen = Number(params.rendemen) || 0;
      const basisMitra = Number(params.basisMitra) || 0;
      const basisBuyer = Number(params.basisBuyer) || basisMitra;

      const hargaPerKgMitra =
        params.hargaPerKgMitra !== undefined && params.hargaPerKgMitra > 0
          ? Number(params.hargaPerKgMitra)
          : Math.round(basisMitra * (rendemen / 100) * 100) / 100;

      const hargaPerKgBuyer =
        params.hargaPerKgBuyer !== undefined && params.hargaPerKgBuyer > 0
          ? Number(params.hargaPerKgBuyer)
          : Math.round(basisBuyer * (rendemen / 100) * 100) / 100;

      const totalPenjualanMitra = Math.round(tonaseAkhirKg * hargaPerKgMitra);
      const totalPenjualanBuyer = Math.round(tonaseAkhirKg * hargaPerKgBuyer);
      const marginHargaPt = Math.max(0, totalPenjualanBuyer - totalPenjualanMitra);

      const pajakNominal = Math.round(totalPenjualanMitra * 0.0025);
      const komisiNominal = Math.round(Number(params.komisiNominal) || 0);
      const potongPiutang = Boolean(params.potongPiutang);
      const kasbonNominal = potongPiutang ? Math.round(Number(params.kasbonNominal) || 0) : 0;
      const potonganLainNominal = Math.round(Number(params.potonganLainNominal) || 0);
      const tambahanNominal = Math.round(Number(params.tambahanNominal) || 0);

      const totalKeuntunganPt = marginHargaPt + komisiNominal;
      const totalPotongan = pajakNominal + komisiNominal + kasbonNominal + potonganLainNominal;
      const jumlahPembayaranMitra = Math.max(0, totalPenjualanMitra - totalPotongan + tambahanNominal);

      const susutKg =
        tonaseAwalKg > 0 && tonaseAkhirKg > 0
          ? Math.round((tonaseAwalKg - tonaseAkhirKg) * 10) / 10
          : 0;

      // Rekening PT Penampung (default BNI DIRECT)
      const targetRekKode = (params.rekeningPtKode || 'BNI01').trim();
      const bankAcc =
        db.rekening.find((r) => r.kode === targetRekKode) ||
        db.rekening.find((r) => /bni\s*direct/i.test(r.nama || '')) ||
        db.rekening.find((r) => !r.isVirtual && r.status === 'AKTIF');

      if (!bankAcc) {
        throw new Error('Rekening penampung transaksi (BNI DIRECT) tidak ditemukan');
      }

      // 1. Catat UANG MASUK dari BUYER ke BNI DIRECT (sebesar Total Penjualan Buyer)
      const nominalBuyerMasuk = Math.max(totalPenjualanBuyer, totalPenjualanMitra);
      const idUangMasukBuyer = generateId('UMS');
      bankAcc.saldoSaatIni += nominalBuyerMasuk;

      db.uangMasuk.unshift({
        idTransaksi: idUangMasukBuyer,
        tanggal: finalTanggal,
        jam,
        divisi: 'PT Wijaya Agro Perkasa',
        kategori: 'PENJUALAN_SURAT_JALAN',
        keterangan: `Penerimaan Uang Hasil Penjualan Buyer Surat Jalan ${noInvoice} a.n. ${params.namaMitra} (${tonaseAkhirKg} Kg ${params.komoditasNama})`,
        nominal: nominalBuyerMasuk,
        metode: 'TRANSFER',
        rekeningTujuan: bankAcc.kode,
        idMitra: params.idMitra,
        namaPengirim: `Buyer PT (${params.namaMitra})`,
        createdAt: iso,
      });

      // 2. Catat KOMISI PT sebagai Uang Masuk ke Divisi PT WAP (SINKRON agar tidak double kas fisik)
      let idUangMasukKomisi: string | undefined = undefined;
      if (komisiNominal > 0) {
        idUangMasukKomisi = generateId('UMS');
        db.uangMasuk.unshift({
          idTransaksi: idUangMasukKomisi,
          tanggal: finalTanggal,
          jam,
          divisi: 'PT Wijaya Agro Perkasa',
          kategori: 'KOMISI_SURAT_JALAN',
          keterangan: `Komisi Jasa Jual Surat Jalan ${noInvoice} (${params.namaMitra})`,
          nominal: komisiNominal,
          metode: 'SINKRON',
          rekeningTujuan: 'SINKRON',
          idMitra: params.idMitra,
          namaPengirim: params.namaMitra,
          createdAt: iso,
        });
      }

      // 3. Potong Kasbon / Piutang Mitra jika ada
      let idBayarBonMitra: string | undefined = undefined;
      if (potongPiutang && kasbonNominal > 0) {
        idBayarBonMitra = generateId('BYB');
        db.bayarBon.unshift({
          idTransaksi: idBayarBonMitra,
          idMitra: params.idMitra,
          namaMitra: params.namaMitra,
          tanggal: finalTanggal,
          jam,
          totalBonSebelum: kasbonNominal,
          nominalBayar: kasbonNominal,
          sisaBonSetelah: 0,
          alokasi: [],
          metode: 'SINKRON',
          rekeningTujuan: 'SINKRON',
          keterangan: `Potong Piutang dari Invoice Surat Jalan ${noInvoice} (${params.namaMitra})`,
          createdAt: iso,
        });
      }

      // 4. Pembayaran Hak Supplier (Langsung Bayar vs Pending Order)
      const isLunas = params.statusPembayaranMitra === 'LUNAS';
      let idPengeluaranBayarMitra: string | undefined = undefined;

      if (isLunas && jumlahPembayaranMitra > 0) {
        idPengeluaranBayarMitra = generateId('PGL');
        bankAcc.saldoSaatIni -= jumlahPembayaranMitra;

        db.pengeluaran.unshift({
          idTransaksi: idPengeluaranBayarMitra,
          tanggal: finalTanggal,
          jam,
          divisi: 'PT Wijaya Agro Perkasa',
          kategori: 'PEMBAYARAN_SUPPLIER_SJ',
          keterangan: `Pembayaran Hak Supplier Surat Jalan ${noInvoice} a.n. ${params.namaMitra} (${params.komoditasNama} ${tonaseAkhirKg} Kg)`,
          nominal: jumlahPembayaranMitra,
          rekeningSumber: bankAcc.kode,
          penerima: params.namaMitra,
          createdAt: iso,
        });
      }

      const newRecord: InvoiceSuratJalanRecord = {
        id: idRecord,
        noInvoice,
        tanggal: finalTanggal,
        jam,
        idMitra: params.idMitra,
        namaMitra: params.namaMitra,
        komoditasNama: params.komoditasNama || 'KOPI',
        kategoriKode: params.kategoriKode || 'SKA',
        platTruk: params.platTruk || '',
        tonaseAwalKg,
        tonaseAkhirKg,
        susutKg,
        basisMitra,
        basisBuyer,
        rendemen,
        hargaPerKgMitra,
        hargaPerKgBuyer,
        totalPenjualanMitra,
        totalPenjualanBuyer,
        marginHargaPt,
        pajakNominal,
        komisiNominal,
        kasbonNominal,
        potongPiutang,
        potonganLainLabel: params.potonganLainLabel || '',
        potonganLainNominal,
        tambahanLabel: params.tambahanLabel || '',
        tambahanNominal,
        totalKeuntunganPt,
        totalPotongan,
        jumlahPembayaranMitra,
        rekeningPtKode: bankAcc.kode,
        statusPembayaranMitra: isLunas ? 'LUNAS' : 'PENDING',
        tanggalBayarMitra: isLunas ? finalTanggal : undefined,
        idUangMasukBuyer,
        idUangMasukKomisi,
        idPengeluaranBayarMitra,
        idBayarBonMitra,
        createdAt: iso,
      };

      db.suratJalan.unshift(newRecord);
      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'CREATE',
        idRecord,
        `Invoice Surat Jalan ${noInvoice} [${params.namaMitra} · ${tonaseAkhirKg} Kg] Total Inv Rp ${totalPenjualanMitra.toLocaleString(
          'id-ID'
        )} · Status: ${newRecord.statusPembayaranMitra}`,
        totalPenjualanBuyer,
        bankAcc.kode
      );

      return newRecord;
    });
  }

  public static async cairkanInvoiceSuratJalan(
    idInvoice: string,
    params?: { rekeningSumber?: string; tanggal?: string }
  ): Promise<InvoiceSuratJalanRecord> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: todayWib, jam, iso } = getWIBDateTime();
      if (!Array.isArray(db.suratJalan)) db.suratJalan = [];
      if (!Array.isArray(db.pengeluaran)) db.pengeluaran = [];

      const record = db.suratJalan.find((s) => s.id === idInvoice || s.noInvoice === idInvoice);
      if (!record) {
        throw new Error(`Invoice Surat Jalan ${idInvoice} tidak ditemukan`);
      }
      if (record.statusPembayaranMitra === 'LUNAS') {
        throw new Error(`Invoice ${record.noInvoice} sudah lunas dicairkan ke mitra.`);
      }

      const finalTanggal = normalizeDateToDmy(params?.tanggal, todayWib);
      const targetRek = (params?.rekeningSumber || record.rekeningPtKode || 'BNI01').trim();
      const bankAcc =
        db.rekening.find((r) => r.kode === targetRek) ||
        db.rekening.find((r) => r.kode === record.rekeningPtKode) ||
        db.rekening.find((r) => /bni\s*direct/i.test(r.nama || ''));

      if (!bankAcc) {
        throw new Error(`Rekening pembayaran ${targetRek} tidak ditemukan`);
      }

      if (record.jumlahPembayaranMitra > 0) {
        const idPengeluaran = generateId('PGL');
        bankAcc.saldoSaatIni -= record.jumlahPembayaranMitra;

        db.pengeluaran.unshift({
          idTransaksi: idPengeluaran,
          tanggal: finalTanggal,
          jam,
          divisi: 'PT Wijaya Agro Perkasa',
          kategori: 'PEMBAYARAN_SUPPLIER_SJ',
          keterangan: `Pencairan Pending Order Surat Jalan ${record.noInvoice} a.n. ${record.namaMitra} (${record.komoditasNama} ${record.tonaseAkhirKg} Kg)`,
          nominal: record.jumlahPembayaranMitra,
          rekeningSumber: bankAcc.kode,
          penerima: record.namaMitra,
          createdAt: iso,
        });
        record.idPengeluaranBayarMitra = idPengeluaran;
      }

      record.statusPembayaranMitra = 'LUNAS';
      record.tanggalBayarMitra = finalTanggal;

      dbManager.synchronizeVirtualAccounts();

      this.addAuditLog(
        db,
        'UPDATE',
        record.id,
        `Pencairan Hak Supplier Surat Jalan ${record.noInvoice} a.n. ${record.namaMitra} Rp ${record.jumlahPembayaranMitra.toLocaleString(
          'id-ID'
        )} dari ${bankAcc.kode}`,
        record.jumlahPembayaranMitra,
        bankAcc.kode
      );

      return record;
    });
  }

  public static async deleteInvoiceSuratJalan(
    idInvoice: string
  ): Promise<{ deleted: InvoiceSuratJalanRecord }> {
    return await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.suratJalan)) db.suratJalan = [];
      const idx = db.suratJalan.findIndex((s) => s.id === idInvoice || s.noInvoice === idInvoice);
      if (idx === -1) throw new Error(`Invoice Surat Jalan ${idInvoice} tidak ditemukan`);

      const target = db.suratJalan[idx];
      // Revert bank balance & delete related transactions
      if (target.idUangMasukBuyer && Array.isArray(db.uangMasuk)) {
        const uIdx = db.uangMasuk.findIndex((u) => u.idTransaksi === target.idUangMasukBuyer);
        if (uIdx !== -1) {
          const uRecord = db.uangMasuk[uIdx];
          const acc = db.rekening.find((r) => r.kode === uRecord.rekeningTujuan);
          if (acc) acc.saldoSaatIni -= uRecord.nominal;
          db.uangMasuk.splice(uIdx, 1);
        }
      }
      if (target.idUangMasukKomisi && Array.isArray(db.uangMasuk)) {
        const uIdx = db.uangMasuk.findIndex((u) => u.idTransaksi === target.idUangMasukKomisi);
        if (uIdx !== -1) db.uangMasuk.splice(uIdx, 1);
      }
      if (target.idBayarBonMitra && Array.isArray(db.bayarBon)) {
        const bIdx = db.bayarBon.findIndex((b) => b.idTransaksi === target.idBayarBonMitra);
        if (bIdx !== -1) db.bayarBon.splice(bIdx, 1);
      }
      if (target.idPengeluaranBayarMitra && Array.isArray(db.pengeluaran)) {
        const pIdx = db.pengeluaran.findIndex((p) => p.idTransaksi === target.idPengeluaranBayarMitra);
        if (pIdx !== -1) {
          const pRecord = db.pengeluaran[pIdx];
          const acc = db.rekening.find((r) => r.kode === pRecord.rekeningSumber);
          if (acc) acc.saldoSaatIni += pRecord.nominal;
          db.pengeluaran.splice(pIdx, 1);
        }
      }

      db.suratJalan.splice(idx, 1);
      dbManager.synchronizeVirtualAccounts();

      return { deleted: target };
    });
  }
}



