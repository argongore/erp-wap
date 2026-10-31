import * as XLSX from 'xlsx';
import { getRoleMitraLabel } from '../server/types.ts';
import type { RekapMasterMitraSummary } from '../server/types.ts';

export type SpreadsheetCellValue = string | number | boolean | null;

export interface BackupSheetTab {
  sheetName: string;
  description: string;
  headers: string[];
  rows: SpreadsheetCellValue[][];
}

export interface FullBackupBundlePayload {
  db: Record<string, any>;
  rekapMitra?: RekapMasterMitraSummary | null;
  serverTime?: {
    tanggal: string;
    jam: string;
    iso: string;
  };
  source?: 'SERVER_LIVE' | 'CLIENT_STATE' | 'EMERGENCY_CACHE';
}

export interface SavedGoogleSheetTarget {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  lastSyncedAt: string;
  lastTotalRecords: number;
}

export interface GoogleSheetMetadataSummary {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
  }>;
}

export interface EmergencyCacheMetadata {
  savedAtIso: string;
  savedAtLabel: string;
  totalRecords: number;
  companyName: string;
}

const SAVED_GOOGLE_SHEET_TARGET_KEY = 'wap_backup_google_sheet_target_v1';
const SAVED_GOOGLE_SHEET_HISTORY_KEY = 'wap_backup_google_sheet_history_v1';
const EMERGENCY_CACHE_META_KEY = 'wap_emergency_backup_meta_v1';
const EMERGENCY_CACHE_LITE_KEY = 'wap_emergency_backup_lite_v1';

const IDB_NAME = 'wap_emergency_full_backup_db';
const IDB_STORE = 'snapshots';
const IDB_LATEST_KEY = 'latest_full_bundle';

function safeCell(val: unknown): SpreadsheetCellValue {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : 0;
  }
  if (typeof val === 'boolean') {
    return val ? 'YA' : 'TIDAK';
  }
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.startsWith('data:image/')) {
    const kb = Math.max(1, Math.round((str.length * 0.75) / 1024));
    return `[Foto Bukti Tersimpan di Database JSON (${kb} KB)]`;
  }
  // Protect against Excel (32,767 chars) and Google Sheets (50,000 chars) per-cell text limit
  if (str.length > 28000) {
    return `${str.slice(0, 28000)} ... [Dipotong ${str.length - 28000} karakter]`;
  }
  return str;
}

function safeNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function getWibNowFormatted(): { tanggal: string; jam: string; iso: string; fileStamp: string } {
  const now = new Date();
  const dateParts = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(now);
  const dd = dateParts.find((p) => p.type === 'day')?.value.padStart(2, '0') || '01';
  const mm = dateParts.find((p) => p.type === 'month')?.value.padStart(2, '0') || '01';
  const yyyy = dateParts.find((p) => p.type === 'year')?.value || '2026';
  const jam = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(now)
    .replace(/\./g, ':');
  const hhmm = jam.slice(0, 5).replace(':', '');
  return {
    tanggal: `${dd}/${mm}/${yyyy}`,
    jam,
    iso: now.toISOString(),
    fileStamp: `${yyyy}-${mm}-${dd}_${hhmm}`,
  };
}

/**
 * Counts total records across all primary ERP collections in a raw database object.
 */
export function countTotalErpRecords(rawDb: Record<string, any> | null | undefined): number {
  if (!rawDb || typeof rawDb !== 'object') return 0;
  const arrayKeys = [
    'rekening',
    'mitra',
    'karyawan',
    'upahHarian',
    'penggajian',
    'produk',
    'kategoriProduk',
    'stokBarang',
    'stokHasilBumi',
    'inventaris',
    'divisi',
    'penjualan',
    'pembelianBarang',
    'pembelianHasilBumi',
    'penjualanHasilBumi',
    'kasbonUang',
    'bayarBon',
    'pencairanTitipan',
    'pengeluaran',
    'transferRekening',
    'cashOpnameLogs',
    'auditLogs',
  ];
  return arrayKeys.reduce((acc, key) => {
    const arr = rawDb[key];
    return acc + (Array.isArray(arr) ? arr.length : 0);
  }, 0);
}

/**
 * Fallback computation of Mitra recap directly from raw database collections
 * (ensures 100% accuracy even in offline / server-hang emergency mode).
 */
function buildFallbackMitraRecapRows(rawDb: Record<string, any>) {
  const mitraArr: any[] = Array.isArray(rawDb.mitra) ? rawDb.mitra : [];
  const penjualanArr: any[] = Array.isArray(rawDb.penjualan) ? rawDb.penjualan : [];
  const jualHbArr: any[] = Array.isArray(rawDb.penjualanHasilBumi) ? rawDb.penjualanHasilBumi : [];
  const kasbonArr: any[] = Array.isArray(rawDb.kasbonUang) ? rawDb.kasbonUang : [];
  const beliHbArr: any[] = Array.isArray(rawDb.pembelianHasilBumi) ? rawDb.pembelianHasilBumi : [];
  const kulakanArr: any[] = Array.isArray(rawDb.pembelianBarang) ? rawDb.pembelianBarang : [];

  const items = mitraArr.map((m) => {
    const id = String(m.id || '');
    let totalKasbonBarang = 0;
    let totalKasbonUang = 0;
    let totalHutangTitipPanen = 0;
    let nominalNotaKunciTx = 0;

    for (const tx of penjualanArr) {
      const idMitra = tx.idMitra || tx.idPelanggan;
      if (idMitra === id && (tx.metode === 'KASBON' || tx.caraBayar === 'BON' || tx.caraBayar === 'SEBAGIAN')) {
        const sisa = Math.max(0, safeNum(tx.sisaPiutang ?? tx.sisaBon));
        totalKasbonBarang += sisa;
        if (tx.isNotaNgunci || tx.statusNotaNgunci) nominalNotaKunciTx += sisa;
      }
    }

    for (const tx of jualHbArr) {
      const idMitra = tx.idMitra || tx.idPembeli;
      if (idMitra === id && (tx.metodePembayaran === 'PIUTANG' || tx.caraBayar === 'BON' || tx.caraBayar === 'SEBAGIAN')) {
        const sisa = Math.max(0, safeNum(tx.sisaPiutang));
        totalKasbonBarang += sisa;
        if (tx.isNotaNgunci || tx.statusNotaNgunci) nominalNotaKunciTx += sisa;
      }
    }

    for (const kb of kasbonArr) {
      const idMitra = kb.idMitra || kb.idPeminjam;
      if (idMitra === id && kb.status !== 'LUNAS') {
        const sisa = Math.max(0, safeNum(kb.sisaKasbon ?? kb.sisaPinjaman));
        if (kb.tipe === 'HUTANG_PT_NOTA_LALU') {
          totalHutangTitipPanen += sisa;
        } else if (kb.isNotaLalu && kb.rincianBarangNotaLalu) {
          totalKasbonBarang += sisa;
          if (kb.isNotaNgunci || kb.statusNotaNgunci) nominalNotaKunciTx += sisa;
        } else {
          totalKasbonUang += sisa;
          if (kb.isNotaNgunci || kb.statusNotaNgunci) nominalNotaKunciTx += sisa;
        }
      }
    }

    for (const hb of beliHbArr) {
      const idMitra = hb.idMitra || hb.idSupplier;
      if (idMitra === id && (hb.metodePembayaran === 'TITIP' || hb.jenisPembayaran === 'TITIP') && hb.status !== 'LUNAS') {
        const sisa = Math.max(0, safeNum(hb.sisaTitipan ?? hb.totalNominal ?? hb.totalPembelian));
        totalHutangTitipPanen += sisa;
      }
    }

    for (const pb of kulakanArr) {
      const idMitra = pb.idMitra || pb.idSupplier;
      if (idMitra === id && (pb.metodePembayaran === 'HUTANG' || pb.caraBayar === 'HUTANG') && pb.status !== 'LUNAS') {
        const sisa = Math.max(0, safeNum(pb.sisaHutang ?? pb.totalNominal ?? pb.totalPembelian));
        totalHutangTitipPanen += sisa;
      }
    }

    const totalPiutang = totalKasbonBarang + totalKasbonUang;
    const kliring = Math.min(totalPiutang, totalHutangTitipPanen);
    const sisaBonBersih = Math.max(0, totalPiutang - kliring);
    const sisaTitipanBersih = Math.max(0, totalHutangTitipPanen - kliring);
    const isMitraLevelKunci = Boolean(m.isNotaNgunci || m.statusNota === 'NOTA_NGUNCI');
    const nominalNotaNgunci = isMitraLevelKunci
      ? sisaBonBersih
      : Math.min(sisaBonBersih, nominalNotaKunciTx);
    const isNotaNgunci = nominalNotaNgunci > 0 || (isMitraLevelKunci && sisaBonBersih > 0);

    return {
      id,
      kode: String(m.kode || m.id || ''),
      nama: String(m.nama || ''),
      role: m.role,
      isAnakPerusahaan: Boolean(m.isAnakPerusahaan),
      isKaryawan: Boolean(m.isKaryawan),
      telepon: String(m.telepon || '-'),
      alamat: String(m.alamat || '-'),
      status: String(m.status || 'AKTIF'),
      catatanNgunci: String(m.catatanNgunci || m.catatanNotaNgunci || ''),
      tanggalNgunci: String(m.tanggalNgunci || m.tanggalNotaNgunci || ''),
      totalKasbonBarang,
      totalKasbonUang,
      totalBonMitra: totalPiutang,
      totalHutangTitipPanen,
      sisaBonBersih,
      sisaTitipanBersih,
      nominalNotaNgunci,
      isNotaNgunci,
    };
  });

  const totalPiutang = items.reduce((s, x) => s + x.totalBonMitra, 0);
  const totalHutang = items.reduce((s, x) => s + x.totalHutangTitipPanen, 0);
  const totalNgunci = items.reduce((s, x) => s + x.nominalNotaNgunci, 0);
  const jumlahNgunci = items.filter((x) => x.isNotaNgunci && x.nominalNotaNgunci > 0).length;

  return {
    items,
    totalPiutang,
    totalHutang,
    uangKitaDiMitra: totalPiutang - totalHutang,
    totalNominalNotaNgunci: totalNgunci,
    jumlahMitraNotaNgunci: jumlahNgunci,
  };
}

/**
 * Builds 21 structured Spreadsheet tabs covering 100% of ERP Wijaya Agro data.
 */
export function buildFullErpSpreadsheetSheets(bundle: FullBackupBundlePayload): BackupSheetTab[] {
  const rawDb = bundle.db || {};
  const now = getWibNowFormatted();
  const tanggalBackup = bundle.serverTime?.tanggal || now.tanggal;
  const jamBackup = bundle.serverTime?.jam || now.jam;

  const profil = rawDb.profilPerusahaan || {};
  const rekeningArr: any[] = Array.isArray(rawDb.rekening) ? rawDb.rekening : [];
  const mitraArr: any[] = Array.isArray(rawDb.mitra) ? rawDb.mitra : [];
  const karyawanArr: any[] = Array.isArray(rawDb.karyawan) ? rawDb.karyawan : [];
  const produkArr: any[] = Array.isArray(rawDb.produk) ? rawDb.produk : [];
  const kategoriArr: any[] = Array.isArray(rawDb.kategoriProduk) ? rawDb.kategoriProduk : [];
  const stokBarangArr: any[] = Array.isArray(rawDb.stokBarang) ? rawDb.stokBarang : [];
  const stokHbArr: any[] = Array.isArray(rawDb.stokHasilBumi) ? rawDb.stokHasilBumi : [];
  const inventarisArr: any[] = Array.isArray(rawDb.inventaris) ? rawDb.inventaris : [];
  const divisiArr: any[] = Array.isArray(rawDb.divisi) ? rawDb.divisi : [];
  const penjualanArr: any[] = Array.isArray(rawDb.penjualan) ? rawDb.penjualan : [];
  const kulakanArr: any[] = Array.isArray(rawDb.pembelianBarang) ? rawDb.pembelianBarang : [];
  const beliHbArr: any[] = Array.isArray(rawDb.pembelianHasilBumi) ? rawDb.pembelianHasilBumi : [];
  const jualHbArr: any[] = Array.isArray(rawDb.penjualanHasilBumi) ? rawDb.penjualanHasilBumi : [];
  const kasbonArr: any[] = Array.isArray(rawDb.kasbonUang) ? rawDb.kasbonUang : [];
  const bayarBonArr: any[] = Array.isArray(rawDb.bayarBon) ? rawDb.bayarBon : [];
  const pencairanArr: any[] = Array.isArray(rawDb.pencairanTitipan) ? rawDb.pencairanTitipan : [];
  const pengeluaranArr: any[] = Array.isArray(rawDb.pengeluaran) ? rawDb.pengeluaran : [];
  const transferArr: any[] = Array.isArray(rawDb.transferRekening) ? rawDb.transferRekening : [];
  const cashOpnameArr: any[] = Array.isArray(rawDb.cashOpnameLogs) ? rawDb.cashOpnameLogs : [];
  const upahHarianArr: any[] = Array.isArray(rawDb.upahHarian) ? rawDb.upahHarian : [];
  const penggajianArr: any[] = Array.isArray(rawDb.penggajian) ? rawDb.penggajian : [];
  const auditArr: any[] = Array.isArray(rawDb.auditLogs) ? rawDb.auditLogs : [];

  // Financial summaries
  const kasUtama = rekeningArr
    .filter((r) => r && r.kode === 'KAS01')
    .reduce((s, r) => s + safeNum(r.saldoSaatIni), 0);
  const bankPtTotal = rekeningArr
    .filter(
      (r) =>
        r &&
        (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !String(r.kode || '').startsWith('REK-'))) &&
        r.kode !== 'KAS01' &&
        r.status === 'AKTIF'
    )
    .reduce((s, r) => s + safeNum(r.saldoSaatIni), 0);
  const kasDivisiTotal = rekeningArr
    .filter((r) => r && r.kategori === 'OPERASIONAL_DIVISI' && r.status === 'AKTIF')
    .reduce((s, r) => s + safeNum(r.saldoSaatIni), 0);

  // Mitra recap (prefer exact server calculation, fallback to deterministic local calculation)
  const fallbackRecap = buildFallbackMitraRecapRows(rawDb);
  const rekapItems: any[] = bundle.rekapMitra?.items || fallbackRecap.items;
  const totalPiutangMitra =
    bundle.rekapMitra?.totalSeluruhPiutangMitra ??
    bundle.rekapMitra?.totalBonMitra ??
    fallbackRecap.totalPiutang;
  const totalHutangKeMitra =
    bundle.rekapMitra?.totalNotaSupplierRekeningMitra ??
    bundle.rekapMitra?.totalHutangPerusahaanKeMitra ??
    fallbackRecap.totalHutang;
  const uangKitaDiMitra =
    bundle.rekapMitra?.uangKitaDiMitra ?? totalPiutangMitra - totalHutangKeMitra;
  const totalNominalNotaNgunci =
    bundle.rekapMitra?.totalNominalNotaNgunci ?? fallbackRecap.totalNominalNotaNgunci;
  const jumlahMitraNotaNgunci =
    bundle.rekapMitra?.mitraNotaNgunciCount ?? fallbackRecap.jumlahMitraNotaNgunci;

  const sourceLabel =
    bundle.source === 'EMERGENCY_CACHE'
      ? 'CACHE DARURAT BROWSER (MODE PENYELAMATAN SAAT HANG / MAINTENANCE)'
      : bundle.source === 'CLIENT_STATE'
      ? 'MEMORI AKTIF APLIKASI KASIR'
      : 'SERVER UTAMA & CLOUD SUPABASE (REAL-TIME)';

  // 1. 01_RINGKASAN_BACKUP
  const sheet01: BackupSheetTab = {
    sheetName: '01_RINGKASAN_BACKUP',
    description: 'Ringkasan Eksekutif & Status Backup Keseluruhan Sistem ERP',
    headers: ['KATEGORI', 'PARAMETER / INDIKATOR', 'NILAI / NOMINAL', 'KETERANGAN'],
    rows: [
      ['INFO BACKUP', 'Waktu Pembuatan Backup (WIB)', `${tanggalBackup} ${jamBackup} WIB`, sourceLabel],
      ['INFO BACKUP', 'Nama Perusahaan', safeCell(profil.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'), safeCell(profil.badanHukum || 'PT')],
      ['INFO BACKUP', 'Alamat Kantor', safeCell(profil.alamat || profil.alamatLengkap || '-'), safeCell(profil.telepon || '-')],
      ['INFO BACKUP', 'Total Seluruh Record Tersimpan', countTotalErpRecords(rawDb), 'Mencakup seluruh 21 sheet transaksi, master, stok & log'],
      ['', '', '', ''],
      ['POSISI KAS & BANK PT', 'Saldo Kas Fisik Kasir (KAS01)', kasUtama, 'Uang tunai brankas & laci kasir pusat'],
      ['POSISI KAS & BANK PT', 'Total Saldo Rekening Bank PT', bankPtTotal, 'Akumulasi seluruh rekening bank perusahaan aktif'],
      ['POSISI KAS & BANK PT', 'Total Likuiditas Kas + Bank PT', kasUtama + bankPtTotal, 'Total dana likuid perusahaan saat backup dibuat'],
      ['POSISI KAS & BANK PT', 'Total Saldo Kas Operasional Divisi', kasDivisiTotal, 'Saldo buku kas operasional masing-masing divisi'],
      ['', '', '', ''],
      ['REKAP REKENING MITRA', 'Total Seluruh Piutang Mitra', totalPiutangMitra, 'Seluruh piutang barang, kasbon uang & nota lalu mitra'],
      ['REKAP REKENING MITRA', 'Total Hutang Kita ke Mitra (Titipan / Supplier)', totalHutangKeMitra, 'Saldo titip panen, pinjaman mitra & hak upah belum cair'],
      ['REKAP REKENING MITRA', 'UANG KITA YANG MASIH DI MITRA (Piutang - Hutang)', uangKitaDiMitra, 'Rumus: Total Seluruh Piutang Mitra dikurangi Total Hutang Kita ke Mitra'],
      ['KHUSUS NOTA KUNCI', 'NOMINAL UANG TIDAK BISA KEMBALI (NOTA KUNCI)', totalNominalNotaNgunci, `${jumlahMitraNotaNgunci} Mitra berstatus Nota Kunci (otomatis berkurang jika ada cicilan masuk)`],
      ['', '', '', ''],
      ['JUMLAH DATA PER TABEL', '02. Master Rekening Kas & Bank', rekeningArr.length, 'Rekening perusahaan, divisi, anak perusahaan & sistem'],
      ['JUMLAH DATA PER TABEL', '05. Master Mitra (Supplier/Customer/dll)', mitraArr.length, 'Seluruh mitra terdaftar'],
      ['JUMLAH DATA PER TABEL', '06. Master Karyawan & Riwayat Divisi', karyawanArr.length, 'Data karyawan beserta histori mutasi divisi'],
      ['JUMLAH DATA PER TABEL', '07. Master Produk & Stok Barang Toko', produkArr.length, `${stokBarangArr.length} baris stok gudang toko`],
      ['JUMLAH DATA PER TABEL', '08. Stok Komoditas Hasil Bumi', stokHbArr.length, 'Gudang komoditas hasil bumi'],
      ['JUMLAH DATA PER TABEL', '09. Inventaris Armada/Aset & Divisi', inventarisArr.length + divisiArr.length, `${inventarisArr.length} aset inventaris, ${divisiArr.length} unit divisi`],
      ['JUMLAH DATA PER TABEL', '10. Transaksi Penjualan Toko', penjualanArr.length, 'Nota penjualan barang toko (Lunas/Kasbon)'],
      ['JUMLAH DATA PER TABEL', '11. Pembelian Kulakan Barang Toko', kulakanArr.length, 'Nota belanja stok barang ke pemasok'],
      ['JUMLAH DATA PER TABEL', '12. Pembelian Hasil Bumi & Titipan', beliHbArr.length, 'Nota timbangan hasil panen petani/supplier'],
      ['JUMLAH DATA PER TABEL', '13. Penjualan Hasil Bumi', jualHbArr.length, 'Penjualan partai komoditas hasil bumi'],
      ['JUMLAH DATA PER TABEL', '14. Kasbon Uang & Migrasi Nota Lalu', kasbonArr.length, 'Pinjaman tunai & saldo awal nota lalu mitra'],
      ['JUMLAH DATA PER TABEL', '15. Pelunasan / Setoran Bon Mitra', bayarBonArr.length, 'Cicilan tunai, transfer & potong titipan (SINKRON)'],
      ['JUMLAH DATA PER TABEL', '16. Pencairan Titipan (Bayar ke Mitra)', pencairanArr.length, 'Pembayaran hutang titipan PT ke mitra'],
      ['JUMLAH DATA PER TABEL', '17. Pengeluaran Operasional & Divisi', pengeluaranArr.length, 'Beban operasional harian per divisi'],
      ['JUMLAH DATA PER TABEL', '18. Mutasi Transfer & Cash Opname', transferArr.length + cashOpnameArr.length, 'Pindah buku kas/bank & berita acara hitung kas fisik'],
      ['JUMLAH DATA PER TABEL', '19. Absensi & Input Upah Harian Kerja', upahHarianArr.length, 'Input gaji karyawan per hari kerja masuk'],
      ['JUMLAH DATA PER TABEL', '20. Realisasi Slip Gaji Karyawan', penggajianArr.length, 'Pembayaran slip gaji & potong kasbon karyawan'],
      ['JUMLAH DATA PER TABEL', '21. Audit Log Aktivitas Sistem', auditArr.length, 'Rekam jejak kronologis seluruh aktivitas sistem'],
    ],
  };

  // 2. 02_REKENING_KAS_BANK
  const sheet02: BackupSheetTab = {
    sheetName: '02_REKENING_KAS_BANK',
    description: 'Daftar Lengkap Rekening Kas, Bank PT, Kas Divisi & Anak Perusahaan',
    headers: [
      'KODE REKENING',
      'NAMA REKENING',
      'KATEGORI',
      'NOMOR REKENING',
      'ATAS NAMA',
      'SALDO AWAL (RP)',
      'SALDO SAAT INI (RP)',
      'STATUS',
      'REKENING INDUK',
      'KETERANGAN',
    ],
    rows: [
      ...rekeningArr.map((r) => [
        safeCell(r.kode),
        safeCell(r.nama),
        safeCell(r.isVirtual ? 'VIRTUAL SISTEM' : r.kategori || 'PERUSAHAAN'),
        safeCell(r.nomorRekening),
        safeCell(r.atasNama),
        safeNum(r.saldoAwal),
        safeNum(r.saldoSaatIni),
        safeCell(r.status),
        safeCell(r.rekeningIndukPenyimpan || '-'),
        safeCell(r.keterangan || ''),
      ]),
      ['', '', '', '', '', '', '', '', '', ''],
      [
        'TOTAL LIKUIDITAS PT',
        'Kas Utama (KAS01) + Seluruh Bank PT Aktif',
        'REKAP',
        '-',
        '-',
        0,
        kasUtama + bankPtTotal,
        'AKTIF',
        '-',
        `KAS01: ${kasUtama} | Bank PT: ${bankPtTotal}`,
      ],
    ],
  };

  // 3. 03_REKAP_SALDO_MITRA
  const sheet03: BackupSheetTab = {
    sheetName: '03_REKAP_SALDO_MITRA',
    description: 'Rekapitulasi Piutang, Hutang Titipan, Uang Kita di Mitra & Status Nota Kunci',
    headers: [
      'KODE MITRA',
      'NAMA MITRA',
      'ROLE MITRA',
      'STATUS NOTA',
      'ALAMAT',
      'NO HP / TELEPON',
      'PIUTANG BARANG (RP)',
      'KASBON UANG (RP)',
      'TOTAL PIUTANG MITRA (RP)',
      'NOMINAL NOTA KUNCI / TAK KEMBALI (RP)',
      'TOTAL HUTANG / TITIPAN MITRA (RP)',
      'SISA BERSIH (PIUTANG - HUTANG)',
      'CATATAN NOTA KUNCI',
    ],
    rows: [
      ...rekapItems.map((m) => {
        const piutangBarang = safeNum(m.totalKasbonBarang ?? m.bonBarang);
        const kasbonUang = safeNum(m.totalKasbonUang ?? m.kasbonUang);
        const totalBon = safeNum(m.totalBonMitra ?? piutangBarang + kasbonUang);
        const totalTitip = safeNum(m.totalHutangTitipPanen);
        const nomKunci = safeNum(m.nominalNotaNgunci);
        const isKunci = Boolean(m.isNotaNgunci || nomKunci > 0);
        const roleLbl = getRoleMitraLabel(m.role, {
          isAnakPerusahaan: m.isAnakPerusahaan,
          isKaryawan: m.isKaryawan,
        });
        return [
          safeCell(m.kode),
          safeCell(m.nama),
          safeCell(roleLbl),
          isKunci ? 'NOTA KUNCI' : 'PIUTANG AKTIF / NORMAL',
          safeCell(m.alamat || '-'),
          safeCell(m.telepon || '-'),
          piutangBarang,
          kasbonUang,
          totalBon,
          nomKunci,
          totalTitip,
          totalBon - totalTitip,
          safeCell(m.catatanNgunci || m.catatanNotaNgunci || ''),
        ];
      }),
      ['', '', '', '', '', '', '', '', '', '', '', '', ''],
      [
        'REKAP TOTAL',
        'TOTAL SELURUH REKENING MITRA',
        `${rekapItems.length} Mitra`,
        `${jumlahMitraNotaNgunci} Nota Kunci`,
        '-',
        '-',
        rekapItems.reduce((s, x) => s + safeNum(x.totalKasbonBarang ?? x.bonBarang), 0),
        rekapItems.reduce((s, x) => s + safeNum(x.totalKasbonUang ?? x.kasbonUang), 0),
        totalPiutangMitra,
        totalNominalNotaNgunci,
        totalHutangKeMitra,
        uangKitaDiMitra,
        `UANG TAK BISA KEMBALI (NOTA KUNCI): Rp ${totalNominalNotaNgunci.toLocaleString('id-ID')}`,
      ],
    ],
  };

  // 4. 04_DAFTAR_NOTA_KUNCI (Detailed breakdown of every locked note & locked partner)
  const notaKunciRows: SpreadsheetCellValue[][] = [];
  const mitraMapById = new Map<string, any>();
  for (const m of mitraArr) {
    if (m?.id) mitraMapById.set(String(m.id), m);
  }

  if (Array.isArray(bundle.rekapMitra?.daftarNotaNgunci) && bundle.rekapMitra!.daftarNotaNgunci!.length > 0) {
    for (const nk of bundle.rekapMitra!.daftarNotaNgunci!) {
      const m = mitraMapById.get(String((nk as any).idMitra || ''));
      notaKunciRows.push([
        safeCell((nk as any).tanggal || '-'),
        safeCell((nk as any).idNota || (nk as any).noNota || '-'),
        safeCell((nk as any).jenisNota || 'NOTA KUNCI'),
        safeCell((nk as any).kodeMitra || m?.kode || '-'),
        safeCell((nk as any).namaMitra || m?.nama || '-'),
        safeCell((nk as any).alamat || m?.alamat || '-'),
        safeCell((nk as any).telepon || m?.telepon || '-'),
        safeNum((nk as any).nominalAwal ?? (nk as any).sisaNominal),
        Math.max(0, safeNum((nk as any).nominalAwal) - safeNum((nk as any).sisaNominal ?? (nk as any).nominal)),
        safeNum((nk as any).sisaNominal ?? (nk as any).nominal),
        safeCell((nk as any).catatanNgunci || (nk as any).keterangan || 'Status Nota Kunci'),
      ]);
    }
  } else {
    for (const tx of penjualanArr) {
      const sisa = Math.max(0, safeNum(tx.sisaPiutang ?? tx.sisaBon));
      const m = mitraMapById.get(String(tx.idMitra || tx.idPelanggan || ''));
      if (sisa > 0 && (tx.isNotaNgunci || m?.isNotaNgunci)) {
        notaKunciRows.push([
          safeCell(tx.tanggal),
          safeCell(tx.noPenjualan || tx.id),
          'PENJUALAN TOKO (KASBON)',
          safeCell(m?.kode || tx.idMitra),
          safeCell(tx.namaMitra || m?.nama || '-'),
          safeCell(m?.alamat || '-'),
          safeCell(m?.telepon || '-'),
          safeNum(tx.totalNominal),
          Math.max(0, safeNum(tx.totalNominal) - sisa),
          sisa,
          safeCell(tx.catatanNgunci || m?.catatanNgunci || 'Status Nota Kunci'),
        ]);
      }
    }

    for (const tx of jualHbArr) {
      const sisa = Math.max(0, safeNum(tx.sisaPiutang));
      const m = mitraMapById.get(String(tx.idMitra || ''));
      if (sisa > 0 && (tx.isNotaNgunci || m?.isNotaNgunci)) {
        notaKunciRows.push([
          safeCell(tx.tanggal),
          safeCell(tx.noPenjualan || tx.id),
          'JUAL HASIL BUMI (PIUTANG)',
          safeCell(m?.kode || tx.idMitra),
          safeCell(tx.namaMitra || m?.nama || '-'),
          safeCell(m?.alamat || '-'),
          safeCell(m?.telepon || '-'),
          safeNum(tx.totalNominal),
          Math.max(0, safeNum(tx.totalNominal) - sisa),
          sisa,
          safeCell(tx.catatanNgunci || m?.catatanNgunci || 'Status Nota Kunci'),
        ]);
      }
    }

    for (const kb of kasbonArr) {
      if (kb.status === 'LUNAS') continue;
      const sisa = Math.max(0, safeNum(kb.sisaKasbon ?? kb.sisaPinjaman));
      const m = mitraMapById.get(String(kb.idMitra || ''));
      if (sisa > 0 && (kb.isNotaNgunci || m?.isNotaNgunci)) {
        notaKunciRows.push([
          safeCell(kb.tanggal),
          safeCell(kb.idTransaksi || kb.noNotaLalu || '-'),
          kb.isNotaLalu ? 'NOTA LALU MITRA' : 'KASBON UANG',
          safeCell(m?.kode || kb.idMitra),
          safeCell(kb.namaMitra || m?.nama || '-'),
          safeCell(m?.alamat || '-'),
          safeCell(m?.telepon || '-'),
          safeNum(kb.nominal),
          Math.max(0, safeNum(kb.nominal) - sisa),
          sisa,
          safeCell(kb.catatanNgunci || kb.keterangan || m?.catatanNgunci || 'Status Nota Kunci'),
        ]);
      }
    }
  }

  notaKunciRows.push([
    'TOTAL',
    `${notaKunciRows.length} Nota Kunci`,
    'AKUMULASI UANG TIDAK BISA KEMBALI',
    '-',
    '-',
    '-',
    '-',
    notaKunciRows.reduce((s, r) => s + safeNum(r[7]), 0),
    notaKunciRows.reduce((s, r) => s + safeNum(r[8]), 0),
    totalNominalNotaNgunci,
    'Otomatis berkurang apabila mitra Nota Kunci melakukan cicilan/pembayaran',
  ]);

  const sheet04: BackupSheetTab = {
    sheetName: '04_DAFTAR_NOTA_KUNCI',
    description: 'Rincian Khusus Nota Kunci (Piutang Macet / Uang Tidak Bisa Kembali)',
    headers: [
      'TANGGAL NOTA',
      'NO TRANSAKSI / NOTA',
      'JENIS TRANSAKSI',
      'KODE MITRA',
      'NAMA MITRA',
      'ALAMAT MITRA',
      'NO HP MITRA',
      'NOMINAL AWAL (RP)',
      'SUDAH DIBAYAR (RP)',
      'SISA TAK BISA KEMBALI (RP)',
      'KRONOLOGI / CATATAN NOTA KUNCI',
    ],
    rows: notaKunciRows,
  };

  // 5. 05_MASTER_MITRA
  const sheet05: BackupSheetTab = {
    sheetName: '05_MASTER_MITRA',
    description: 'Database Master Seluruh Mitra (Supplier, Customer, Anak Perusahaan, Karyawan)',
    headers: [
      'ID MITRA',
      'KODE MITRA',
      'NAMA MITRA',
      'ROLE MITRA',
      'TELEPON / WA',
      'ALAMAT LENGKAP',
      'STATUS AKUN',
      'STATUS NOTA KUNCI',
      'TANGGAL NOTA KUNCI',
      'CATATAN NOTA KUNCI',
      'ID KARYAWAN TERKAIT',
      'REKENING ANAK PERUSAHAAN',
      'CATATAN MITRA',
    ],
    rows: mitraArr.map((m) => [
      safeCell(m.id),
      safeCell(m.kode),
      safeCell(m.nama),
      safeCell(
        getRoleMitraLabel(m.role, {
          isAnakPerusahaan: m.isAnakPerusahaan,
          isKaryawan: m.isKaryawan,
        })
      ),
      safeCell(m.telepon || '-'),
      safeCell(m.alamat || '-'),
      safeCell(m.status || 'AKTIF'),
      m.isNotaNgunci ? 'NOTA KUNCI' : 'NORMAL',
      safeCell(m.tanggalNgunci || '-'),
      safeCell(m.catatanNgunci || ''),
      safeCell(m.idKaryawanTerkait || '-'),
      safeCell(m.kodeRekeningTerkait || '-'),
      safeCell(m.catatan || ''),
    ]),
  };

  // 6. 06_MASTER_KARYAWAN
  const sheet06: BackupSheetTab = {
    sheetName: '06_MASTER_KARYAWAN',
    description: 'Database Master Karyawan & Riwayat Upgrade / Perpindahan Divisi',
    headers: [
      'ID KARYAWAN',
      'NIK',
      'NAMA LENGKAP',
      'JABATAN',
      'DIVISI AKTIF SAAT INI',
      'TANGGAL MASUK',
      'TELEPON / HP',
      'ALAMAT',
      'BANK & NO REKENING GAJI',
      'STATUS AKTIF',
      'ID MITRA TERKAIT',
      'FOTO PROFIL',
      'RIWAYAT MUTASI / UPGRADE DIVISI',
    ],
    rows: karyawanArr.map((k) => {
      const riwayatStr = Array.isArray(k.riwayatDivisi)
        ? k.riwayatDivisi
            .map(
              (r: any) =>
                `[${r.periodeMulai || r.tanggalMulai || '-'} s/d ${
                  r.periodeSelesai || r.tanggalSelesai || 'Sekarang'
                }: ${r.divisi}${r.jabatan ? ` (${r.jabatan})` : ''}${r.catatan ? ` - ${r.catatan}` : ''}]`
            )
            .join(' -> ')
        : '-';
      return [
        safeCell(k.id),
        safeCell(k.nik),
        safeCell(k.nama),
        safeCell(k.jabatan),
        safeCell(k.divisi || k.departemen || '-'),
        safeCell(k.tanggalMasuk || '-'),
        safeCell(k.telepon || '-'),
        safeCell(k.alamat || '-'),
        safeCell(k.namaBank ? `${k.namaBank} - ${k.noRekeningBank || ''} a.n ${k.atasNamaRekening || ''}` : '-'),
        safeCell(k.status || 'AKTIF'),
        safeCell(k.idMitraTerkait || `MTR-${k.id}`),
        safeCell(k.fotoUrl || '-'),
        safeCell(riwayatStr),
      ];
    }),
  };

  // 7. 07_PRODUK_DAN_STOK_TOKO
  const stokByKode = new Map<string, any>();
  for (const s of stokBarangArr) {
    const k = String(s?.kode || s?.kodeProduk || '');
    if (k) stokByKode.set(k, s);
  }
  const katDescMap = new Map<string, string>();
  for (const k of kategoriArr) {
    if (k?.nama) katDescMap.set(String(k.nama).toUpperCase(), String(k.deskripsi || ''));
  }

  const sheet07: BackupSheetTab = {
    sheetName: '07_PRODUK_DAN_STOK_TOKO',
    description: 'Master Produk Dagang, Harga Modal, Harga Jual & Posisi Stok Fisik Gudang Toko',
    headers: [
      'KODE PRODUK',
      'NAMA PRODUK / BARANG',
      'KATEGORI',
      'SATUAN',
      'HARGA BELI / MODAL (RP)',
      'HARGA JUAL UMUM (RP)',
      'HARGA KHUSUS REKANAN (RP)',
      'STOK SAAT INI',
      'BATAS STOK MINIMUM',
      'NILAI PERSEDIAAN (RP)',
      'STATUS PRODUK',
      'UPDATE TERAKHIR',
      'DESKRIPSI KATEGORI',
    ],
    rows: produkArr.map((p) => {
      const st = stokByKode.get(String(p.kode || '')) || {};
      const stokAkhir = safeNum(st.stok);
      const hargaBeli = safeNum(p.hargaBeli);
      return [
        safeCell(p.kode),
        safeCell(p.nama),
        safeCell(p.kategori),
        safeCell(p.satuan),
        hargaBeli,
        safeNum(p.hargaJual),
        safeNum(p.hargaKhususRekanan || p.hargaJual),
        stokAkhir,
        safeNum(st.minimum),
        Math.max(0, stokAkhir) * hargaBeli,
        safeCell(p.status || 'AKTIF'),
        safeCell(st.updateTerakhir || '-'),
        safeCell(katDescMap.get(String(p.kategori || '').toUpperCase()) || ''),
      ];
    }),
  };

  // 8. 08_STOK_HASIL_BUMI
  const sheet08: BackupSheetTab = {
    sheetName: '08_STOK_HASIL_BUMI',
    description: 'Posisi Stok Komoditas Hasil Bumi di Gudang PT',
    headers: [
      'KODE KOMODITAS',
      'NAMA KOMODITAS',
      'SATUAN',
      'STOK GUDANG SAAT INI',
      'HARGA BELI STANDAR / MODAL (RP)',
      'ESTIMASI NILAI STOK (RP)',
      'STOK AWAL LAMA',
      'UPDATE TERAKHIR',
      'KETERANGAN',
    ],
    rows: stokHbArr.map((s) => {
      const qty = safeNum(s.stok);
      const hrg = safeNum(s.hargaBeliStandar);
      return [
        safeCell(s.kode),
        safeCell(s.nama),
        safeCell(s.satuan || 'Kg'),
        qty,
        hrg,
        qty * hrg,
        safeNum(s.stokAwal),
        safeCell(s.updateTerakhir || '-'),
        safeCell(s.keterangan || s.keteranganStokAwal || ''),
      ];
    }),
  };

  // 9. 09_INVENTARIS_DAN_DIVISI
  const sheet09: BackupSheetTab = {
    sheetName: '09_INVENTARIS_DAN_DIVISI',
    description: 'Daftar Inventaris Armada/Aset Perusahaan & Master Unit Divisi',
    headers: [
      'TIPE DATA',
      'KODE / ID',
      'NAMA ASET / UNIT DIVISI',
      'KATEGORI / KODE REKENING',
      'DIVISI / DRIVER PJ',
      'NOMOR PLAT / SERI',
      'NILAI PEROLEHAN (RP)',
      'KONDISI / STATUS',
      'JATUH TEMPO PAJAK',
      'CATATAN',
    ],
    rows: [
      ...divisiArr.map((d) => [
        'MASTER DIVISI',
        safeCell(d.id),
        safeCell(d.nama),
        safeCell(d.kodeRekening || '-'),
        safeCell(d.penanggungJawab || '-'),
        '-',
        0,
        'AKTIF',
        '-',
        safeCell(d.deskripsi || ''),
      ]),
      ...inventarisArr.map((inv) => [
        'INVENTARIS ASET',
        safeCell(inv.kode || inv.id),
        safeCell(inv.namaItem || inv.nama),
        safeCell(inv.kategori),
        safeCell(`${inv.divisi || '-'} (PJ: ${inv.driverPenanggungJawab || '-'})`),
        safeCell(inv.nomorPlat || '-'),
        safeNum(inv.nilaiPerolehan),
        safeCell(inv.kondisi),
        safeCell(inv.tanggalPajakTahunan || '-'),
        safeCell(inv.catatan || ''),
      ]),
    ],
  };

  // 10. 10_PENJUALAN_TOKO
  const sheet10: BackupSheetTab = {
    sheetName: '10_PENJUALAN_TOKO',
    description: 'Seluruh Riwayat Transaksi Kasir Penjualan Toko (Tunai, Transfer, Kasbon)',
    headers: [
      'NO PENJUALAN',
      'TANGGAL',
      'JAM',
      'ID MITRA',
      'NAMA MITRA / PELANGGAN',
      'DIVISI',
      'RINCIAN BARANG TERJUAL',
      'TOTAL PENJUALAN (RP)',
      'TOTAL LABA KOTOR (RP)',
      'METODE BAYAR',
      'REKENING TUJUAN',
      'STATUS BAYAR',
      'SISA PIUTANG BON (RP)',
      'STATUS NOTA KUNCI',
      'KETERANGAN',
    ],
    rows: penjualanArr.map((tx) => {
      const itemsText = Array.isArray(tx.items)
        ? tx.items
            .map(
              (it: any) =>
                `${it.namaProduk || it.kodeProduk} (${safeNum(it.qty)} ${it.satuan || ''} x Rp ${safeNum(
                  it.harga
                ).toLocaleString('id-ID')})`
            )
            .join('; ')
        : '';
      return [
        safeCell(tx.noPenjualan || tx.id),
        safeCell(tx.tanggal),
        safeCell(tx.jam || '-'),
        safeCell(tx.idMitra || 'UMUM'),
        safeCell(tx.namaMitra || 'Pelanggan Umum'),
        safeCell(tx.divisi || '-'),
        safeCell(itemsText),
        safeNum(tx.totalNominal),
        safeNum(tx.totalLabaKotor),
        safeCell(tx.metode),
        safeCell(tx.rekeningTujuan || '-'),
        safeCell(tx.statusPembayaran),
        safeNum(tx.sisaPiutang),
        tx.isNotaNgunci ? 'NOTA KUNCI' : 'NORMAL',
        safeCell(tx.catatanNgunci || tx.keterangan || ''),
      ];
    }),
  };

  // 11. 11_KULAKAN_PEMASOK
  const sheet11: BackupSheetTab = {
    sheetName: '11_KULAKAN_PEMASOK',
    description: 'Seluruh Transaksi Pembelian / Kulakan Stok Barang Toko dari Supplier',
    headers: [
      'NO PEMBELIAN',
      'NO FAKTUR SUPPLIER',
      'TANGGAL',
      'JAM',
      'ID SUPPLIER',
      'NAMA SUPPLIER',
      'DIVISI',
      'RINCIAN BARANG DIBELI',
      'TOTAL PEMBELIAN (RP)',
      'METODE BAYAR',
      'REKENING SUMBER',
      'STATUS LUNAS / HUTANG',
      'KETERANGAN',
      'BUKTI NOTA',
    ],
    rows: kulakanArr.map((pb) => {
      const itemsText = Array.isArray(pb.items)
        ? pb.items
            .map(
              (it: any) =>
                `${it.namaProduk || it.kodeProduk} (${safeNum(it.qty)} ${it.satuan || ''} x Rp ${safeNum(
                  it.hargaBeliSatuan
                ).toLocaleString('id-ID')})`
            )
            .join('; ')
        : '';
      return [
        safeCell(pb.noPembelian || pb.id),
        safeCell(pb.noFakturSupplier || '-'),
        safeCell(pb.tanggal),
        safeCell(pb.jam || '-'),
        safeCell(pb.idMitra || '-'),
        safeCell(pb.namaDistributorManual || pb.namaMitra || '-'),
        safeCell(pb.divisi || '-'),
        safeCell(itemsText),
        safeNum(pb.totalNominal),
        safeCell(pb.metodePembayaran),
        safeCell(pb.rekeningSumber || '-'),
        safeCell(pb.status || 'LUNAS'),
        safeCell(pb.keterangan || ''),
        safeCell(pb.fotoNota || ''),
      ];
    }),
  };

  // 12. 12_BELI_HASIL_BUMI
  const sheet12: BackupSheetTab = {
    sheetName: '12_BELI_HASIL_BUMI',
    description: 'Seluruh Transaksi Pembelian Hasil Bumi & Titipan Hasil Panen Mitra',
    headers: [
      'NO PEMBELIAN',
      'TANGGAL',
      'JAM',
      'ID MITRA / PETANI',
      'NAMA MITRA / PETANI',
      'DIVISI',
      'KOMODITAS',
      'BERAT KOTOR (KG)',
      'RAFAKSI (%)',
      'BERAT BERSIH (KG)',
      'HARGA PER KG (RP)',
      'TOTAL NOMINAL (RP)',
      'METODE PEMBAYARAN',
      'REKENING SUMBER',
      'STATUS',
      'KETERANGAN',
      'BUKTI TIMBANGAN / NOTA',
    ],
    rows: beliHbArr.map((hb) => [
      safeCell(hb.noPembelian || hb.id),
      safeCell(hb.tanggal),
      safeCell(hb.jam || '-'),
      safeCell(hb.idMitra),
      safeCell(hb.namaMitra),
      safeCell(hb.divisi || '-'),
      safeCell(hb.komoditasNama || hb.komoditasKode),
      safeNum(hb.beratKotor),
      safeNum(hb.potonganRafaksi),
      safeNum(hb.beratBersih),
      safeNum(hb.hargaPerKg),
      safeNum(hb.totalNominal),
      safeCell(hb.metodePembayaran),
      safeCell(hb.rekeningSumber || '-'),
      safeCell(hb.status || '-'),
      safeCell(hb.keterangan || ''),
      safeCell(hb.fotoNota || hb.driveFileUrl || ''),
    ]),
  };

  // 13. 13_JUAL_HASIL_BUMI
  const sheet13: BackupSheetTab = {
    sheetName: '13_JUAL_HASIL_BUMI',
    description: 'Seluruh Transaksi Penjualan Partai Komoditas Hasil Bumi ke Pabrik / Pembeli',
    headers: [
      'NO PENJUALAN',
      'TANGGAL',
      'JAM',
      'ID MITRA PEMBELI',
      'NAMA PEMBELI',
      'DIVISI',
      'KOMODITAS',
      'BERAT BERSIH (KG)',
      'HARGA JUAL / KG (RP)',
      'MODAL RATA-RATA / KG (RP)',
      'TOTAL OMZET (RP)',
      'LABA KOTOR (RP)',
      'METODE PEMBAYARAN',
      'REKENING TUJUAN',
      'SISA PIUTANG (RP)',
      'STATUS NOTA KUNCI',
      'NO SURAT JALAN',
      'KETERANGAN',
    ],
    rows: jualHbArr.map((jh) => [
      safeCell(jh.noPenjualan || jh.id),
      safeCell(jh.tanggal),
      safeCell(jh.jam || '-'),
      safeCell(jh.idMitra || '-'),
      safeCell(jh.namaMitra || '-'),
      safeCell(jh.divisi || '-'),
      safeCell(jh.komoditasNama || jh.komoditasKode),
      safeNum(jh.beratBersih),
      safeNum(jh.hargaJualPerKg),
      safeNum(jh.modalRataRataPerKg),
      safeNum(jh.totalNominal),
      safeNum(jh.labaKotor),
      safeCell(jh.metodePembayaran),
      safeCell(jh.rekeningTujuan || '-'),
      safeNum(jh.sisaPiutang),
      jh.isNotaNgunci ? 'NOTA KUNCI' : 'NORMAL',
      safeCell(jh.noSuratJalan || '-'),
      safeCell(jh.catatanNgunci || jh.keterangan || ''),
    ]),
  };

  // 14. 14_KASBON_DAN_NOTA_LALU
  const sheet14: BackupSheetTab = {
    sheetName: '14_KASBON_DAN_NOTA_LALU',
    description: 'Seluruh Pinjaman Kasbon Uang & Migrasi Saldo Awal Nota Lalu (Piutang/Nota Kunci)',
    headers: [
      'ID TRANSAKSI',
      'TANGGAL',
      'JAM',
      'JENIS PENCATATAN',
      'NO NOTA LALU MANUAL',
      'ID MITRA',
      'NAMA MITRA',
      'NOMINAL AWAL (RP)',
      'SISA BELUM LUNAS (RP)',
      'STATUS LUNAS',
      'STATUS NOTA KUNCI',
      'METODE / REKENING SUMBER',
      'KETERANGAN / RINCIAN BARANG NOTA LALU',
      'CATATAN NOTA KUNCI',
      'BUKTI NOTA',
    ],
    rows: kasbonArr.map((kb) => [
      safeCell(kb.idTransaksi || kb.id),
      safeCell(kb.tanggal),
      safeCell(kb.jam || '-'),
      kb.isNotaLalu ? 'NOTA LALU MITRA' : safeCell(kb.jenisTransaksi || 'KASBON UANG'),
      safeCell(kb.noNotaLalu || '-'),
      safeCell(kb.idMitra),
      safeCell(kb.namaMitra),
      safeNum(kb.nominal),
      safeNum(kb.sisaKasbon),
      safeCell(kb.status),
      kb.isNotaNgunci ? 'NOTA KUNCI' : 'NORMAL',
      safeCell(`${kb.metode || ''} (${kb.rekeningSumber || '-'})`),
      safeCell(kb.rincianBarangNotaLalu || kb.keterangan || ''),
      safeCell(kb.catatanNgunci || ''),
      safeCell(kb.fotoNota || kb.driveFileUrl || ''),
    ]),
  };

  // 15. 15_PELUNASAN_BON
  const sheet15: BackupSheetTab = {
    sheetName: '15_PELUNASAN_BON',
    description: 'Seluruh Transaksi Pelunasan / Setoran Cicilan Piutang Bon Mitra',
    headers: [
      'ID TRANSAKSI',
      'TANGGAL',
      'JAM',
      'ID MITRA',
      'NAMA MITRA',
      'NOMINAL BAYAR / POTONG BON (RP)',
      'PENGURANG NOTA KUNCI (RP)',
      'METODE BAYAR',
      'REKENING TUJUAN',
      'TOTAL BON SEBELUM (RP)',
      'SISA BON SESUDAH (RP)',
      'KETERANGAN',
      'BUKTI SETORAN',
    ],
    rows: bayarBonArr.map((bb) => [
      safeCell(bb.idTransaksi || bb.id),
      safeCell(bb.tanggal),
      safeCell(bb.jam || '-'),
      safeCell(bb.idMitra),
      safeCell(bb.namaMitra),
      safeNum(bb.nominalBayar),
      safeNum(bb.nominalPengurangNotaNgunci),
      safeCell(bb.metode),
      safeCell(bb.rekeningTujuan || 'KAS01'),
      safeNum(bb.totalBonSebelum),
      safeNum(bb.sisaBonSetelah),
      safeCell(bb.keterangan || ''),
      safeCell(bb.fotoBukti || bb.fotoNota || ''),
    ]),
  };

  // 16. 16_PENCAIRAN_TITIPAN
  const sheet16: BackupSheetTab = {
    sheetName: '16_PENCAIRAN_TITIPAN',
    description: 'Seluruh Pembayaran / Pencairan Saldo Titipan & Hutang PT ke Mitra',
    headers: [
      'ID PENCAIRAN',
      'TANGGAL',
      'JAM',
      'ID MITRA',
      'NAMA MITRA',
      'NOMINAL PENCAIRAN (RP)',
      'POTONG BON OTOMATIS (RP)',
      'SALDO TITIPAN SEBELUM (RP)',
      'SALDO TITIPAN SISA (RP)',
      'METODE PEMBAYARAN',
      'REKENING SUMBER DANA',
      'KETERANGAN',
    ],
    rows: pencairanArr.map((pt) => [
      safeCell(pt.idPencairan || pt.id),
      safeCell(pt.tanggal),
      safeCell(pt.jam || '-'),
      safeCell(pt.idMitra),
      safeCell(pt.namaMitra),
      safeNum(pt.nominalPencairan),
      safeNum(pt.nominalPotongBonOtomatis),
      safeNum(pt.saldoTitipanSebelum),
      safeNum(pt.saldoTitipanSisa),
      safeCell(pt.metodePembayaran),
      safeCell(pt.rekeningSumber || 'KAS01'),
      safeCell(pt.keterangan || ''),
    ]),
  };

  // 17. 17_PENGELUARAN_BIAYA
  const sheet17: BackupSheetTab = {
    sheetName: '17_PENGELUARAN_BIAYA',
    description: 'Seluruh Pengeluaran Operasional, BBM, Perawatan & Biaya Masing-Masing Divisi',
    headers: [
      'ID TRANSAKSI',
      'TANGGAL',
      'JAM',
      'DIVISI BEBAN',
      'KATEGORI BIAYA',
      'KETERANGAN / KEPERLUAN',
      'NOMINAL PENGELUARAN (RP)',
      'REKENING SUMBER',
      'PENERIMA',
      'ID INVENTARIS TERKAIT',
      'BUKTI KUITANSI',
    ],
    rows: pengeluaranArr.map((pg) => [
      safeCell(pg.idTransaksi || pg.id),
      safeCell(pg.tanggal),
      safeCell(pg.jam || '-'),
      safeCell(pg.divisi || 'Umum'),
      safeCell(pg.kategori || 'Operasional'),
      safeCell(pg.keterangan || ''),
      safeNum(pg.nominal),
      safeCell(pg.rekeningSumber || 'KAS01'),
      safeCell(pg.penerima || '-'),
      safeCell(pg.idInventaris || '-'),
      safeCell(pg.fotoKuitansi || ''),
    ]),
  };

  // 18. 18_MUTASI_TRANSFER
  const sheet18: BackupSheetTab = {
    sheetName: '18_MUTASI_TRANSFER',
    description: 'Mutasi Pindah Buku Antar Rekening Kas/Bank & Berita Acara Cash Opname Fisik',
    headers: [
      'JENIS CATATAN',
      'NO TRANSAKSI',
      'TANGGAL',
      'JAM',
      'REKENING SUMBER / PETUGAS',
      'REKENING TUJUAN / STATUS',
      'NOMINAL (RP)',
      'TIPE AFILIASI / SELISIH',
      'KETERANGAN',
    ],
    rows: [
      ...transferArr.map((tr) => [
        'TRANSFER REKENING',
        safeCell(tr.noTransfer || tr.id),
        safeCell(tr.tanggal),
        safeCell(tr.jam || '-'),
        safeCell(tr.rekeningSumber),
        safeCell(tr.rekeningTujuan),
        safeNum(tr.nominal),
        safeCell(tr.tipeMutasiAfiliasi || 'INTERNAL'),
        safeCell(tr.keterangan || ''),
      ]),
      ...cashOpnameArr.map((co) => [
        'CASH OPNAME KASIR',
        safeCell(co.id),
        safeCell(co.tanggal),
        safeCell(co.jam || '-'),
        safeCell(co.petugasKasir),
        safeCell(co.statusSelisih || '-'),
        safeNum(co.totalFisik),
        safeNum(co.selisih),
        safeCell(co.catatan || ''),
      ]),
    ],
  };

  // 19. 19_UPAH_HARIAN_KERJA
  const sheet19: BackupSheetTab = {
    sheetName: '19_UPAH_HARIAN_KERJA',
    description: 'Catatan Kehadiran & Input Gaji Harian Per Hari Kerja Karyawan',
    headers: [
      'ID CATATAN',
      'TANGGAL KERJA',
      'ID KARYAWAN',
      'NIK',
      'NAMA KARYAWAN',
      'DIVISI SAAT KERJA',
      'ITEM / TUGAS PEKERJAAN',
      'UPAH POKOK HARIAN (RP)',
      'UANG MAKAN / LEMBUR (RP)',
      'TOTAL UPAH HARI INI (RP)',
      'STATUS BAYAR',
      'ID SLIP GAJI TERKAIT',
    ],
    rows: upahHarianArr.map((uh) => [
      safeCell(uh.id),
      safeCell(uh.tanggalKerja),
      safeCell(uh.idKaryawan),
      safeCell(uh.nikKaryawan || '-'),
      safeCell(uh.namaKaryawan),
      safeCell(uh.divisi || '-'),
      safeCell(uh.item || uh.keterangan || uh.catatan || '-'),
      safeNum(uh.upahHarian),
      safeNum(uh.uangMakanLembur),
      safeNum(uh.totalUpahHarian ?? uh.jumlah),
      safeCell(uh.status || 'TERCATAT'),
      safeCell(uh.idPayrollSettlement || '-'),
    ]),
  };

  // 20. 20_SLIP_GAJI_KARYAWAN
  const sheet20: BackupSheetTab = {
    sheetName: '20_SLIP_GAJI_KARYAWAN',
    description: 'Realisasi Pembayaran Slip Gaji Karyawan & Pemotongan Kasbon Otomatis',
    headers: [
      'NO SLIP GAJI',
      'TANGGAL BAYAR',
      'PERIODE',
      'ID KARYAWAN',
      'NIK',
      'NAMA KARYAWAN',
      'DIVISI',
      'JUMLAH HARI MASUK',
      'TOTAL GAJI KOTOR (RP)',
      'POTONG KASBON (RP)',
      'GAJI BERSIH DIBAYAR (RP)',
      'METODE & REKENING SUMBER',
      'KETERANGAN',
    ],
    rows: penggajianArr.map((pg) => [
      safeCell(pg.slipNomor || pg.id),
      safeCell(pg.tanggal),
      safeCell(pg.periodeBulan || '-'),
      safeCell(pg.idKaryawan),
      safeCell(pg.nikKaryawan || '-'),
      safeCell(pg.namaKaryawan),
      safeCell(pg.divisi || '-'),
      safeNum(pg.jumlahHariKerja),
      safeNum(pg.totalGajiKotor ?? pg.gajiPokok),
      safeNum(pg.potonganKasbon),
      safeNum(pg.gajiBersihDibayar),
      safeCell(`${pg.metodePembayaran || ''} (${pg.rekeningSumber || 'KAS01'})`),
      safeCell(pg.keterangan || ''),
    ]),
  };

  // 21. 21_AUDIT_LOG_SISTEM
  const sheet21: BackupSheetTab = {
    sheetName: '21_AUDIT_LOG_SISTEM',
    description: 'Jejak Audit Kronologis Seluruh Aktivitas & Perubahan Saldo Sistem',
    headers: [
      'ID LOG',
      'TANGGAL',
      'JAM',
      'USER / PELAKSANA',
      'JENIS AKTIVITAS',
      'ID TRANSAKSI',
      'NOMINAL TERKAIT (RP)',
      'REKENING TERKAIT',
      'RINCIAN AKTIVITAS LENGKAP',
    ],
    rows: auditArr.slice(0, 5000).map((log) => [
      safeCell(log.id),
      safeCell(log.tanggal),
      safeCell(log.jam),
      safeCell(log.user),
      safeCell(log.jenisTransaksi),
      safeCell(log.idTransaksi),
      safeNum(log.nominal),
      safeCell(log.rekeningTerkait),
      safeCell(log.detail),
    ]),
  };

  return [
    sheet01,
    sheet02,
    sheet03,
    sheet04,
    sheet05,
    sheet06,
    sheet07,
    sheet08,
    sheet09,
    sheet10,
    sheet11,
    sheet12,
    sheet13,
    sheet14,
    sheet15,
    sheet16,
    sheet17,
    sheet18,
    sheet19,
    sheet20,
    sheet21,
  ];
}

/**
 * Builds an XLSX WorkBook object with auto-sized column widths from the 21 structured backup tabs.
 */
export function buildFullBackupWorkbook(sheets: BackupSheetTab[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const tab of sheets) {
    const aoa: SpreadsheetCellValue[][] = [tab.headers, ...tab.rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Compute readable column widths
    ws['!cols'] = tab.headers.map((header, colIdx) => {
      let maxLen = String(header || '').length;
      const sampleLimit = Math.min(tab.rows.length, 150);
      for (let i = 0; i < sampleLimit; i++) {
        const val = tab.rows[i]?.[colIdx];
        const len = val === null || val === undefined ? 0 : String(val).length;
        if (len > maxLen) maxLen = len;
      }
      return { wch: Math.min(Math.max(maxLen + 3, 12), 54) };
    });

    const cleanSheetName = tab.sheetName.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);
  }
  return wb;
}

/**
 * Generates a Node.js Buffer for server-side `.xlsx` download (`GET /api/database/backup-xlsx`).
 */
export function generateFullBackupXlsxBuffer(bundle: FullBackupBundlePayload): Buffer {
  const sheets = buildFullErpSpreadsheetSheets(bundle);
  const wb = buildFullBackupWorkbook(sheets);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Triggers instant browser download of the 21-sheet `.xlsx` Spreadsheet file (works offline / during hang!).
 */
export function downloadFullBackupXlsxInBrowser(bundle: FullBackupBundlePayload, customFilename?: string): string {
  const now = getWibNowFormatted();
  const filename = customFilename || `BACKUP_FULL_SPREADSHEET_WIJAYA_AGRO_${now.fileStamp}.xlsx`;
  const sheets = buildFullErpSpreadsheetSheets(bundle);
  const wb = buildFullBackupWorkbook(sheets);
  XLSX.writeFile(wb, filename);
  return filename;
}

/**
 * Triggers instant browser download of the complete raw JSON backup (including base64 photos).
 */
export function downloadFullBackupJsonInBrowser(rawDb: Record<string, any>, customFilename?: string): string {
  const now = getWibNowFormatted();
  const filename = customFilename || `BACKUP_FULL_DATABASE_WIJAYA_AGRO_${now.fileStamp}.json`;
  const jsonText = JSON.stringify(rawDb, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}

// ==========================================
// GOOGLE SHEETS API v4 INTEGRATION (CLIENT-SIDE)
// ==========================================

export function extractGoogleSpreadsheetId(input: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  // If user pasted raw ID directly
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

async function googleSheetsFetch<T = any>(
  url: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...((init?.headers as Record<string, string>) || {}),
    },
  });

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    const apiMsg = parsed?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
      const authErr: any = new Error(
        res.status === 401
          ? 'Sesi login Google Sheets telah berakhir. Silakan klik Sign in with Google kembali.'
          : `Akses ditolak oleh Google Sheets (${apiMsg}). Pastikan akun Google Anda memiliki akses edit ke Spreadsheet tersebut.`
      );
      authErr.status = res.status;
      throw authErr;
    }
    if (res.status === 404) {
      throw new Error(
        'File Google Spreadsheet tidak ditemukan. Periksa kembali Link atau ID Spreadsheet yang Anda masukkan.'
      );
    }
    throw new Error(`Google Sheets API gagal: ${apiMsg}`);
  }

  return parsed as T;
}

/**
 * Fetches metadata & actual tab names of an existing Google Spreadsheet (never assumes "Sheet1").
 */
export async function fetchGoogleSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<GoogleSheetMetadataSummary> {
  const cleanId = extractGoogleSpreadsheetId(spreadsheetId);
  if (!cleanId) {
    throw new Error('Link atau ID Google Spreadsheet tidak valid.');
  }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    cleanId
  )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,index)`;

  const meta = await googleSheetsFetch<any>(url, accessToken);
  return {
    spreadsheetId: meta.spreadsheetId || cleanId,
    spreadsheetUrl:
      meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
    title: meta.properties?.title || 'Spreadsheet Tanpa Judul',
    sheets: Array.isArray(meta.sheets)
      ? meta.sheets.map((s: any) => ({
          sheetId: Number(s.properties?.sheetId || 0),
          title: String(s.properties?.title || ''),
          index: Number(s.properties?.index || 0),
        }))
      : [],
  };
}

/**
 * Creates a brand-new 21-tab Google Spreadsheet in the user's Google account and populates all ERP data.
 */
export async function createNewGoogleSpreadsheetBackup(
  accessToken: string,
  bundle: FullBackupBundlePayload,
  customTitle?: string,
  onProgress?: (stage: string) => void
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheetCount: number;
  totalRowsWritten: number;
}> {
  const now = getWibNowFormatted();
  const companyName = bundle.db?.profilPerusahaan?.namaPerusahaan || 'PT WIJAYA AGRO PERKASA';
  const title =
    customTitle?.trim() ||
    `BACKUP FULL ${companyName} - ${now.tanggal} ${now.jam.slice(0, 5)} WIB`;

  onProgress?.('Menyiapkan struktur 21 tab Spreadsheet...');
  const tabs = buildFullErpSpreadsheetSheets(bundle);

  const createPayload = {
    properties: {
      title,
      locale: 'id_ID',
      timeZone: 'Asia/Jakarta',
    },
    sheets: tabs.map((tab, idx) => ({
      properties: {
        title: tab.sheetName,
        index: idx,
        gridProperties: {
          rowCount: Math.max(tab.rows.length + 15, 50),
          columnCount: Math.max(tab.headers.length + 2, 12),
          frozenRowCount: 1,
        },
      },
    })),
  };

  onProgress?.('Membuat file Google Spreadsheet baru di akun Google Anda...');
  const created = await googleSheetsFetch<any>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(createPayload),
    }
  );

  const spreadsheetId: string = created.spreadsheetId;
  const spreadsheetUrl: string =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Style frozen header rows cleanly (emerald header bar + bold white text)
  try {
    const createdSheets: any[] = Array.isArray(created.sheets) ? created.sheets : [];
    const formatRequests = createdSheets.map((s) => ({
      repeatCell: {
        range: {
          sheetId: s.properties?.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.04, green: 0.36, blue: 0.26 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 10,
            },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    }));

    if (formatRequests.length > 0) {
      await googleSheetsFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ requests: formatRequests }),
        }
      );
    }
  } catch (styleErr) {
    console.warn('Non-fatal header styling warning:', styleErr);
  }

  // Write values in safe chunks of 7 tabs per batchUpdate request to keep payload crisp and fast
  let totalRowsWritten = 0;
  const chunkSize = 7;
  for (let i = 0; i < tabs.length; i += chunkSize) {
    const slice = tabs.slice(i, i + chunkSize);
    onProgress?.(
      `Mengirim data tabel ${i + 1}–${Math.min(i + chunkSize, tabs.length)} dari ${tabs.length} ke Google Sheets...`
    );

    const dataPayload = slice.map((tab) => {
      const values = [tab.headers, ...tab.rows];
      totalRowsWritten += tab.rows.length;
      return {
        range: `'${tab.sheetName}'!A1`,
        majorDimension: 'ROWS',
        values,
      };
    });

    await googleSheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataPayload,
        }),
      }
    );
  }

  saveLastGoogleSheetTarget({
    spreadsheetId,
    spreadsheetUrl,
    title,
    lastSyncedAt: `${now.tanggal} ${now.jam} WIB`,
    lastTotalRecords: countTotalErpRecords(bundle.db),
  });

  return {
    spreadsheetId,
    spreadsheetUrl,
    title,
    sheetCount: tabs.length,
    totalRowsWritten,
  };
}

/**
 * Updates / synchronizes an existing Google Spreadsheet with all 21 ERP backup tabs.
 * Always inspects real metadata first (never assumes "Sheet1").
 */
export async function overwriteExistingGoogleSpreadsheetBackup(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  bundle: FullBackupBundlePayload,
  onProgress?: (stage: string) => void
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheetCount: number;
  totalRowsWritten: number;
}> {
  const spreadsheetId = extractGoogleSpreadsheetId(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Link atau ID Google Spreadsheet tidak valid.');
  }

  onProgress?.('Memeriksa metadata dan daftar tab Spreadsheet tujuan...');
  const metadata = await fetchGoogleSpreadsheetMetadata(accessToken, spreadsheetId);
  const tabs = buildFullErpSpreadsheetSheets(bundle);

  const existingByTitle = new Map<string, { sheetId: number; title: string }>();
  for (const s of metadata.sheets) {
    existingByTitle.set(s.title, s);
  }

  // Ensure all 21 tabs exist and have sufficient grid dimensions
  const structuralRequests: any[] = [];
  tabs.forEach((tab, idx) => {
    const existing = existingByTitle.get(tab.sheetName);
    const neededRows = Math.max(tab.rows.length + 15, 50);
    const neededCols = Math.max(tab.headers.length + 2, 12);

    if (!existing) {
      structuralRequests.push({
        addSheet: {
          properties: {
            title: tab.sheetName,
            index: idx,
            gridProperties: {
              rowCount: neededRows,
              columnCount: neededCols,
              frozenRowCount: 1,
            },
          },
        },
      });
    } else {
      structuralRequests.push({
        updateSheetProperties: {
          properties: {
            sheetId: existing.sheetId,
            gridProperties: {
              rowCount: neededRows,
              columnCount: neededCols,
              frozenRowCount: 1,
            },
          },
          fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
        },
      });
    }
  });

  if (structuralRequests.length > 0) {
    onProgress?.('Menyesuaikan struktur tab & ukuran baris Google Spreadsheet...');
    await googleSheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({ requests: structuralRequests }),
      }
    );
  }

  // Clear old data in the 21 backup tabs so shrunk tables leave zero stale trailing rows
  onProgress?.('Membersihkan baris lama sebelum menulis snapshot terbaru...');
  await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchClear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        ranges: tabs.map((t) => `'${t.sheetName}'!A1:ZZ50000`),
      }),
    }
  );

  // Write fresh values in batches
  let totalRowsWritten = 0;
  const chunkSize = 7;
  for (let i = 0; i < tabs.length; i += chunkSize) {
    const slice = tabs.slice(i, i + chunkSize);
    onProgress?.(
      `Menyinkronkan data tabel ${i + 1}–${Math.min(i + chunkSize, tabs.length)} dari ${tabs.length}...`
    );

    const dataPayload = slice.map((tab) => {
      const values = [tab.headers, ...tab.rows];
      totalRowsWritten += tab.rows.length;
      return {
        range: `'${tab.sheetName}'!A1`,
        majorDimension: 'ROWS',
        values,
      };
    });

    await googleSheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataPayload,
        }),
      }
    );
  }

  const now = getWibNowFormatted();
  saveLastGoogleSheetTarget({
    spreadsheetId,
    spreadsheetUrl: metadata.spreadsheetUrl,
    title: metadata.title,
    lastSyncedAt: `${now.tanggal} ${now.jam} WIB`,
    lastTotalRecords: countTotalErpRecords(bundle.db),
  });

  return {
    spreadsheetId,
    spreadsheetUrl: metadata.spreadsheetUrl,
    title: metadata.title,
    sheetCount: tabs.length,
    totalRowsWritten,
  };
}

// ==========================================
// TARGET METADATA & EMERGENCY ANTI-HANG CACHE (BROWSER)
// Note: NEVER stores OAuth tokens here — only Spreadsheet URLs & local ERP data snapshot!
// ==========================================

export function getSavedGoogleSheetTarget(): SavedGoogleSheetTarget | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_GOOGLE_SHEET_TARGET_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.spreadsheetId && parsed?.spreadsheetUrl) {
      return parsed as SavedGoogleSheetTarget;
    }
    return null;
  } catch {
    return null;
  }
}

export function getSavedGoogleSheetHistory(): SavedGoogleSheetTarget[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_GOOGLE_SHEET_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLastGoogleSheetTarget(target: SavedGoogleSheetTarget): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SAVED_GOOGLE_SHEET_TARGET_KEY, JSON.stringify(target));
    const prev = getSavedGoogleSheetHistory().filter(
      (item) => item.spreadsheetId !== target.spreadsheetId
    );
    const updated = [target, ...prev].slice(0, 6);
    localStorage.setItem(SAVED_GOOGLE_SHEET_HISTORY_KEY, JSON.stringify(updated));
  } catch {}
}

function stripHeavyPhotosForLiteCache(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('data:image/')) {
      return `[Foto Tersimpan di Server/IDB - ${Math.round((obj.length * 0.75) / 1024)} KB]`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(stripHeavyPhotosForLiteCache);
  }
  if (typeof obj === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = stripHeavyPhotosForLiteCache(v);
    }
    return out;
  }
  return obj;
}

function openEmergencyIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB tidak tersedia'));
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB'));
  });
}

/**
 * Saves an automatic local emergency backup snapshot in IndexedDB + lightweight localStorage fallback
 * so if the server hangs or enters maintenance, 100% of active ERP data can still be exported to Google Sheets / Excel / JSON!
 */
export async function saveEmergencyLocalSnapshot(
  rawDb: Record<string, any>,
  rekapMitra?: RekapMasterMitraSummary | null
): Promise<void> {
  if (typeof window === 'undefined' || !rawDb) return;
  const now = getWibNowFormatted();
  const totalRecords = countTotalErpRecords(rawDb);
  const meta: EmergencyCacheMetadata = {
    savedAtIso: now.iso,
    savedAtLabel: `${now.tanggal} · ${now.jam} WIB`,
    totalRecords,
    companyName: String(rawDb.profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'),
  };

  try {
    localStorage.setItem(EMERGENCY_CACHE_META_KEY, JSON.stringify(meta));
  } catch {}

  // Save lightweight photo-stripped version in localStorage for instant synchronous fallback
  try {
    const liteBundle: FullBackupBundlePayload = {
      db: stripHeavyPhotosForLiteCache(rawDb),
      rekapMitra: rekapMitra || null,
      serverTime: { tanggal: now.tanggal, jam: now.jam, iso: now.iso },
      source: 'EMERGENCY_CACHE',
    };
    localStorage.setItem(EMERGENCY_CACHE_LITE_KEY, JSON.stringify(liteBundle));
  } catch {}

  // Save full fidelity version (including base64 photos) in IndexedDB
  try {
    const idb = await openEmergencyIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(
        {
          bundle: {
            db: rawDb,
            rekapMitra: rekapMitra || null,
            serverTime: { tanggal: now.tanggal, jam: now.jam, iso: now.iso },
            source: 'EMERGENCY_CACHE',
          } satisfies FullBackupBundlePayload,
          meta,
        },
        IDB_LATEST_KEY
      );
      tx.oncomplete = () => {
        idb.close();
        resolve();
      };
      tx.onerror = () => {
        idb.close();
        reject(tx.error);
      };
    });
  } catch {}
}

export function getEmergencySnapshotMetadata(): EmergencyCacheMetadata | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(EMERGENCY_CACHE_META_KEY);
    return raw ? (JSON.parse(raw) as EmergencyCacheMetadata) : null;
  } catch {
    return null;
  }
}

export async function loadEmergencyLocalSnapshot(): Promise<{
  bundle: FullBackupBundlePayload;
  meta: EmergencyCacheMetadata | null;
} | null> {
  if (typeof window === 'undefined') return null;
  const meta = getEmergencySnapshotMetadata();

  // Prefer full IndexedDB snapshot first
  try {
    const idb = await openEmergencyIdb();
    const record = await new Promise<any>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_LATEST_KEY);
      req.onsuccess = () => {
        idb.close();
        resolve(req.result);
      };
      req.onerror = () => {
        idb.close();
        reject(req.error);
      };
    });
    if (record?.bundle?.db) {
      return {
        bundle: { ...record.bundle, source: 'EMERGENCY_CACHE' },
        meta: record.meta || meta,
      };
    }
  } catch {}

  // Fallback to localStorage lite snapshot
  try {
    const rawLite = localStorage.getItem(EMERGENCY_CACHE_LITE_KEY);
    if (rawLite) {
      const parsed = JSON.parse(rawLite) as FullBackupBundlePayload;
      if (parsed?.db) {
        return {
          bundle: { ...parsed, source: 'EMERGENCY_CACHE' },
          meta,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Converts client-side `erp-snapshot` state into a `DatabaseSchema`-compatible object
 * so `App.tsx` can keep the emergency browser snapshot continuously up-to-date!
 */
export function convertErpSnapshotToRawDb(snap: Record<string, any>): Record<string, any> {
  return {
    profilPerusahaan: snap.profilPerusahaan || {},
    rekening: Array.isArray(snap.rekening) ? snap.rekening : [],
    mitra: Array.isArray(snap.mitra) ? snap.mitra : [],
    karyawan: Array.isArray(snap.karyawan) ? snap.karyawan : [],
    upahHarian: Array.isArray(snap.upahHarian) ? snap.upahHarian : [],
    penggajian: Array.isArray(snap.penggajian) ? snap.penggajian : [],
    produk: Array.isArray(snap.produk) ? snap.produk : [],
    kategoriProduk: Array.isArray(snap.kategoriProduk) ? snap.kategoriProduk : [],
    stokBarang: Array.isArray(snap.stokBarang) ? snap.stokBarang : [],
    stokHasilBumi: Array.isArray(snap.stokHasilBumi) ? snap.stokHasilBumi : [],
    inventaris: Array.isArray(snap.inventaris) ? snap.inventaris : [],
    divisi: Array.isArray(snap.divisiList) ? snap.divisiList : [],
    penjualan: Array.isArray(snap.penjualan) ? snap.penjualan : [],
    pembelianBarang: Array.isArray(snap.pembelianBarang) ? snap.pembelianBarang : [],
    pembelianHasilBumi: Array.isArray(snap.pembelianHasilBumi) ? snap.pembelianHasilBumi : [],
    penjualanHasilBumi: Array.isArray(snap.penjualanHasilBumi) ? snap.penjualanHasilBumi : [],
    kasbonUang: Array.isArray(snap.kasbonUang) ? snap.kasbonUang : [],
    bayarBon: Array.isArray(snap.bayarBon) ? snap.bayarBon : [],
    pencairanTitipan: Array.isArray(snap.pencairanTitipan) ? snap.pencairanTitipan : [],
    pengeluaran: Array.isArray(snap.pengeluaran) ? snap.pengeluaran : [],
    transferRekening: Array.isArray(snap.transferRekening) ? snap.transferRekening : [],
    auditLogs: Array.isArray(snap.auditLogs) ? snap.auditLogs : [],
  };
}
