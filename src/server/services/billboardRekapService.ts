import { dbManager, getWIBDateTime } from '../db.ts';
import {
  DAFTAR_24_ITEM_PENGELUARAN,
  DEFAULT_PT_LOGO_URL,
  isProdukTanpaStok,
  resolveKelompokItemPengeluaran,
} from '../types.ts';
import type {
  ItemInventaris,
  KelompokItemPengeluaran,
  TransaksiPenggajian,
} from '../types.ts';
import { TransactionService } from './transactionService.ts';
import { normalizeDateToDmy } from '../../utils/format.ts';

export interface RekapDivisiMatrixCol {
  idDivisi: string;
  kodeSingkat: string;
  nama: string;
  logoUrl?: string;
  themeKey: 'WAP' | 'GWA' | 'CVWA' | 'WT' | 'BRILINK' | 'OKUSSA' | 'WK' | 'OTHER';
  inNominal: number;
  outNominal: number;
  barangNominal: number;
  labaRugi: number;
}

export interface RekapGajiKaryawanRow {
  id: string;
  nama: string;
  jabatan: string;
  gajiHarian: number;
  gajiBulanan: number;
  total: number;
}

export interface RekapPengeluaranItemRow {
  no: number;
  kode: string;
  nama: string;
  kelompok: KelompokItemPengeluaran; // 'INVENTARIS' (Hijau) | 'BIASA' (Oranye)
  nominal: number;
  jumlahTrx: number;
}

export interface RekapRekeningRow {
  kode: string;
  nama: string;
  saldo: number;
}

export interface RekapBarangStokRow {
  kode: string;
  nama: string;
  satuan: string;
  qty: number;
  hargaUnit: number;
  nilai: number;
}

export interface RekapBarangDivisiGroup {
  judul: string;
  items: RekapBarangStokRow[];
  totalNilai: number;
  totalQty: number;
}

export interface RekapAvailableMonth {
  bulan: number;
  tahun: number;
  label: string;
}

export interface BillboardRekapEksekutifData {
  updatedAt: string;
  tanggalWIB: string;
  jamWIB: string;
  periodeMode: 'BULAN' | 'SEMUA';
  selectedBulan: number;
  selectedTahun: number;
  periodeLabel: string;
  tanggalBanner: string;
  availableMonths: RekapAvailableMonth[];

  // 1. Matrix Divisi Atas (PT WAP, GWA, CV WA, WT, BRI LINK, OKUSSA, WK + TOTAL)
  divisiMatrix: RekapDivisiMatrixCol[];
  divisiTotal: {
    inNominal: number;
    outNominal: number;
    barangNominal: number;
    labaRugi: number;
  };

  // 2. Kolom 1: Gaji Karyawan (Harian & Bulanan) + TOT KELUAR
  gajiList: RekapGajiKaryawanRow[];
  subTotGajiHarian: number;
  subTotGajiBulanan: number;
  totalGaji: number;
  totalKeluarGabungan: number; // totalGaji + totalPengeluaran

  // 3. Kolom 2: Pengeluaran 1..24+ (Hijau Inventaris & Oranye Biasa)
  pengeluaranList: RekapPengeluaranItemRow[];
  totalPengeluaranInventaris: number;
  totalPengeluaranBiasa: number;
  totalPengeluaran: number;

  // 4. Kolom 3: Ringkasan KAS + Barang GWA, Wijaya Transport, CV WA, TOT BARANG
  kasSummary: {
    notaSuplayer: number;
    labaRugi: number;
    barang: number;
    rekening: number;
    total: number; // notaSuplayer + barang + rekening
  };

  // 5. Kolom 4: Rekening Fisik Perusahaan + Barang Okussa & Wijaya Karya
  rekeningList: RekapRekeningRow[];
  totalRekening: number;

  barangPerDivisi: {
    gwa: RekapBarangDivisiGroup;
    wt: RekapBarangDivisiGroup;
    cvWa: RekapBarangDivisiGroup;
    okussa: RekapBarangDivisiGroup;
    wk: RekapBarangDivisiGroup;
    totalBarang: number;
  };
}

const NAMA_BULAN_ID = [
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

function parseDateDDMMYYYY(tanggal?: string): { hari: number; bulan: number; tahun: number } | null {
  const norm = normalizeDateToDmy(tanggal, tanggal);
  const parts = String(norm || '').trim().split('/');
  if (parts.length !== 3) return null;
  const hari = Number(parts[0]);
  const bulan = Number(parts[1]);
  const tahun = Number(parts[2]);
  if (!hari || !bulan || !tahun || bulan < 1 || bulan > 12 || tahun < 2000) return null;
  return { hari, bulan, tahun };
}

function normalizeText(s?: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function compactText(s?: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function getInventarisDisplayLabel(unit: ItemInventaris): string {
  const rawNama = String(unit.namaItem || '').trim().toUpperCase();
  const rawPlat = String(unit.nomorPlat || '').trim().toUpperCase();
  if (rawPlat && rawPlat !== '-' && !rawNama.includes(rawPlat)) {
    return `${rawNama} (${rawPlat})`;
  }
  return rawNama || rawPlat || unit.kode;
}

function isPreviousMonthSettlementSlip(sl: TransaksiPenggajian): boolean {
  const ket = normalizeText(sl.keterangan);
  const per = normalizeText(sl.periodeBulan);
  if (ket.includes('BULAN SEBELUMNYA')) return true;
  if (ket.includes('POTONG BON')) return true;
  if (/^GAJI\s+(BULAN\s+)?(JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)/.test(per)) {
    return true;
  }
  if (/GAJI\s+(BULAN\s+)?(JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER)/.test(ket)) {
    return true;
  }
  return false;
}

function shortCommodityName(nama: string): string {
  const up = normalizeText(nama);
  if (up.includes('KOPI JALAN') || up === 'JALAN') return 'JALAN';
  if (up === 'KOPI' || up.includes('KOPI ROBUSTA') || up.includes('KOPI BIJI') || up.startsWith('KOPI')) return 'KOPI';
  if (up.includes('LADA')) return 'LADA';
  if (up.includes('KULIT KAYU MANIS KA') || /\bKA\b/.test(up)) return 'KA';
  if (up.includes('KULIT KAYU MANIS KB') || /\bKB\b/.test(up)) return 'KB';
  if (up.includes('KULIT KAYU MANIS KF') || /\bKF\b/.test(up)) return 'KF';
  if (up.includes('STIK')) return 'STIK';
  return up;
}

function resolveDivisiMeta(nama: string): {
  order: number;
  kodeSingkat: string;
  themeKey: RekapDivisiMatrixCol['themeKey'];
} {
  const n = normalizeText(nama);
  if (n.includes('PT WIJAYA AGRO') || n === 'PT WAP' || n === 'WAP') {
    return { order: 1, kodeSingkat: 'PT WAP', themeKey: 'WAP' };
  }
  if (n.includes('GUDANG WIJAYA AGRO') || n === 'GWA') {
    return { order: 2, kodeSingkat: 'GWA', themeKey: 'GWA' };
  }
  if (n.includes('CV WIJAYA AGRO') || n === 'CV WA') {
    return { order: 3, kodeSingkat: 'CV WA', themeKey: 'CVWA' };
  }
  if (n.includes('WIJAYA TRANSPORT') || n === 'WT' || n.includes('WIJAYA TRANS')) {
    return { order: 4, kodeSingkat: 'W T', themeKey: 'WT' };
  }
  if (n.includes('BRILINK') || n.includes('BRI LINK')) {
    return { order: 5, kodeSingkat: 'BRI LINK', themeKey: 'BRILINK' };
  }
  if (n.includes('OKUSSA')) {
    return { order: 6, kodeSingkat: 'OKUSSA', themeKey: 'OKUSSA' };
  }
  if (n.includes('WIJAYA KARYA') || n === 'WK') {
    return { order: 7, kodeSingkat: 'WK', themeKey: 'WK' };
  }
  return { order: 99, kodeSingkat: nama.toUpperCase().slice(0, 10), themeKey: 'OTHER' };
}

function classifyProductDivision(
  kategori?: string,
  nama?: string,
  kode?: string
): 'OKUSSA' | 'CVWA' | 'WT' | 'WK' {
  const kat = normalizeText(kategori);
  const nm = normalizeText(nama);
  const kd = normalizeText(kode);

  if (
    kat === 'OKUSSA' ||
    kat.includes('OKUSSA') ||
    nm.includes('OKUSSA') ||
    nm.includes('ROSTING') ||
    nm.includes('ROASTING') ||
    nm.includes('BUBUK KOPI') ||
    nm.includes('LANANG') ||
    nm.includes('ROBUSTA') ||
    kd.startsWith('OKU')
  ) {
    return 'OKUSSA';
  }

  if (
    kat === 'SOLAR' ||
    kat === 'BBM' ||
    kat.includes('TRANSPORT') ||
    kat.includes('SPAREPART') ||
    /\bSOLAR\b/.test(nm)
  ) {
    return 'WT';
  }

  if (
    kat === 'SAPROTAN' ||
    kat === 'PUPUK' ||
    kat.includes('CV WA') ||
    kat.includes('CV WIJAYA') ||
    kat.includes('PESTISIDA') ||
    kat.includes('HERBISIDA') ||
    /\b(UREA|NPK|PHONSKA|TSP|SP36|KCL|PUPUK|ROUNDUP|GRAMOXONE)\b/.test(nm)
  ) {
    return 'CVWA';
  }

  return 'WK';
}

export function getBillboardRekapEksekutif(params?: {
  periode?: 'BULAN' | 'SEMUA';
  bulan?: number;
  tahun?: number;
}): BillboardRekapEksekutifData {
  dbManager.synchronizeDivisiAccounts();
  const db = dbManager.get();
  const wib = getWIBDateTime();
  const todayParsed = parseDateDDMMYYYY(wib.tanggal) || { hari: 1, bulan: 11, tahun: 2026 };

  // Collect all available months from ERP transactions
  const monthSet = new Map<string, { bulan: number; tahun: number }>();
  const registerDate = (tgl?: string) => {
    const p = parseDateDDMMYYYY(tgl);
    if (!p) return;
    const key = `${p.tahun}-${String(p.bulan).padStart(2, '0')}`;
    if (!monthSet.has(key)) monthSet.set(key, { bulan: p.bulan, tahun: p.tahun });
  };

  registerDate(wib.tanggal);
  for (const x of db.penjualan || []) registerDate(x.tanggal);
  for (const x of db.penjualanHasilBumi || []) registerDate(x.tanggal);
  for (const x of db.pembelianHasilBumi || []) registerDate(x.tanggal);
  for (const x of db.pembelianBarang || []) registerDate(x.tanggal);
  for (const x of db.pengeluaran || []) registerDate(x.tanggal);
  for (const x of db.upahHarian || []) registerDate(x.tanggalKerja);
  for (const x of db.penggajian || []) registerDate(x.tanggal);
  for (const x of db.uangMasuk || []) registerDate(x.tanggal);
  for (const x of db.brilink || []) registerDate(x.tanggal);

  const availableMonths: RekapAvailableMonth[] = Array.from(monthSet.values())
    .sort((a, b) => (b.tahun !== a.tahun ? b.tahun - a.tahun : b.bulan - a.bulan))
    .map((m) => ({
      bulan: m.bulan,
      tahun: m.tahun,
      label: `${NAMA_BULAN_ID[m.bulan - 1] || m.bulan} ${m.tahun}`,
    }));

  const requestedBulan = Number(params?.bulan) || todayParsed.bulan;
  const requestedTahun = Number(params?.tahun) || todayParsed.tahun;
  // Wajib sinkron per bulan yang dipilih di header (tidak menggabungkan seluruh bulan jadi satu)
  const periodeMode: 'BULAN' | 'SEMUA' = 'BULAN';

  const matchesPeriod = (tgl?: string): boolean => {
    const p = parseDateDDMMYYYY(tgl);
    if (!p) return false;
    return p.bulan === requestedBulan && p.tahun === requestedTahun;
  };

  // ------------------------------------------------------------------
  // 1. STOK BARANG PER DIVISI (LIVE CURRENT INVENTORY VALUATION)
  // ------------------------------------------------------------------
  // 1A. GUDANG WIJAYA AGRO (GWA) — pakai metode moving average resmi ERP
  const ringkasanHb = TransactionService.getRingkasanStokHasilBumiBulanan({
    bulan: requestedBulan,
    tahun: requestedTahun,
  });

  const gwaOrderPriority = (shortName: string): number => {
    const orderMap: Record<string, number> = {
      KOPI: 1,
      LADA: 2,
      KA: 3,
      KB: 4,
      KF: 5,
      STIK: 6,
      JALAN: 7,
    };
    return orderMap[shortName] ?? 50;
  };

  const gwaItems: RekapBarangStokRow[] = (ringkasanHb.komoditasItems || [])
    .map((k) => {
      const qty = Math.round((Number(k.readyGudangSaatIniKg) || 0) * 100) / 100;
      const hargaUnit = Math.round(Number(k.rataRataModalGudangPerKg) || 0);
      const nilai = Math.round(Number(k.nilaiModalReadyGudang) || 0);
      return {
        kode: k.kode,
        nama: shortCommodityName(k.nama),
        satuan: k.satuan || 'Kg',
        qty,
        hargaUnit,
        nilai,
      };
    })
    .sort((a, b) => {
      const pa = gwaOrderPriority(a.nama);
      const pb = gwaOrderPriority(b.nama);
      if (pa !== pb) return pa - pb;
      return a.nama.localeCompare(b.nama);
    });

  // Also check if there is a Kopi Jalan record in db.stokHasilBumi that was filtered out of ringkasanHb
  const kopiJalanHb = (db.stokHasilBumi || []).find(
    (h) => h.kode === 'HB-01B' || normalizeText(h.nama).includes('KOPI JALAN')
  );
  if (kopiJalanHb && !gwaItems.some((g) => g.nama === 'JALAN')) {
    const qty = Math.round((Number(kopiJalanHb.stok) || 0) * 100) / 100;
    const hargaUnit = Math.round(Number(kopiJalanHb.hargaBeliStandar) || 0);
    gwaItems.push({
      kode: kopiJalanHb.kode,
      nama: 'JALAN',
      satuan: kopiJalanHb.satuan || 'Kg',
      qty,
      hargaUnit,
      nilai: Math.round(qty * hargaUnit),
    });
  }

  const gwaTotalNilai = gwaItems.reduce((s, it) => s + it.nilai, 0);
  const gwaTotalQty = Math.round(gwaItems.reduce((s, it) => s + it.qty, 0) * 100) / 100;

  // 1B. Produk Fisik Toko/Operasional -> WT, CV WA, OKUSSA, WK
  const wtItems: RekapBarangStokRow[] = [];
  const cvWaItems: RekapBarangStokRow[] = [];
  const okussaItems: RekapBarangStokRow[] = [];
  const wkItems: RekapBarangStokRow[] = [];

  const produkByKode = new Map((db.produk || []).map((p) => [String(p.kode || '').toUpperCase(), p]));
  const seenProductKodes = new Set<string>();

  for (const sb of db.stokBarang || []) {
    const key = String(sb.kode || '').toUpperCase();
    const prd = produkByKode.get(key);
    if (isProdukTanpaStok(prd || sb, db.kategoriProduk)) continue;
    seenProductKodes.add(key);

    const qty = Math.round((Number(sb.stok) || 0) * 100) / 100;
    const hargaUnit = Math.round(Number(prd?.hargaBeli) || Number(prd?.hargaJual) || 0);
    const nilai = Math.round(Math.max(0, qty) * hargaUnit);
    const row: RekapBarangStokRow = {
      kode: sb.kode,
      nama: (prd?.nama || sb.namaProduk || sb.kode).toUpperCase(),
      satuan: prd?.satuan || sb.satuan || 'Unit',
      qty,
      hargaUnit,
      nilai,
    };

    const bucket = classifyProductDivision(prd?.kategori || sb.kategori, row.nama, row.kode);
    if (bucket === 'OKUSSA') okussaItems.push(row);
    else if (bucket === 'WT') wtItems.push(row);
    else if (bucket === 'CVWA') cvWaItems.push(row);
    else wkItems.push(row);
  }

  // Include active physical products in db.produk that may not yet have a stokBarang row
  for (const prd of db.produk || []) {
    const key = String(prd.kode || '').toUpperCase();
    if (seenProductKodes.has(key)) continue;
    if (isProdukTanpaStok(prd, db.kategoriProduk)) continue;
    const row: RekapBarangStokRow = {
      kode: prd.kode,
      nama: (prd.nama || prd.kode).toUpperCase(),
      satuan: prd.satuan || 'Unit',
      qty: 0,
      hargaUnit: Math.round(Number(prd.hargaBeli) || Number(prd.hargaJual) || 0),
      nilai: 0,
    };
    const bucket = classifyProductDivision(prd.kategori, row.nama, row.kode);
    if (bucket === 'OKUSSA') okussaItems.push(row);
    else if (bucket === 'WT') wtItems.push(row);
    else if (bucket === 'CVWA') cvWaItems.push(row);
    else wkItems.push(row);
  }

  const sortBarangRows = (list: RekapBarangStokRow[]) =>
    list.sort((a, b) => {
      if (b.nilai !== a.nilai) return b.nilai - a.nilai;
      return a.nama.localeCompare(b.nama);
    });

  sortBarangRows(wtItems);
  sortBarangRows(cvWaItems);
  sortBarangRows(okussaItems);
  sortBarangRows(wkItems);

  const wtTotal = wtItems.reduce((s, it) => s + it.nilai, 0);
  const cvWaTotal = cvWaItems.reduce((s, it) => s + it.nilai, 0);
  const okussaTotal = okussaItems.reduce((s, it) => s + it.nilai, 0);
  const wkTotal = wkItems.reduce((s, it) => s + it.nilai, 0);
  const totalBarang = gwaTotalNilai + wtTotal + cvWaTotal + okussaTotal + wkTotal;

  const barangByTheme: Record<string, number> = {
    WAP: 0,
    GWA: gwaTotalNilai,
    CVWA: cvWaTotal,
    WT: wtTotal,
    BRILINK: 0,
    OKUSSA: okussaTotal,
    WK: wkTotal,
  };

  // ------------------------------------------------------------------
  // 2. MATRIX REKAP SEMUA DIVISI (ATAS) — TARIK LOGO LANGSUNG DARI MASTER DIVISI
  // ------------------------------------------------------------------
  const allMasterDivisi = dbManager.getDivisiList();
  const resolveMasterLogo = (idDivisi: string, namaDivisi: string, fallbackLogo?: string): string | undefined => {
    const found = allMasterDivisi.find(
      (md) =>
        md.id.toLowerCase() === idDivisi.toLowerCase() ||
        normalizeText(md.nama) === normalizeText(namaDivisi)
    );
    if (found?.logoUrl && found.logoUrl.trim()) return found.logoUrl.trim();
    if (normalizeText(namaDivisi).includes('PT WIJAYA AGRO')) {
      return db.profilPerusahaan?.logoUrl?.trim() || DEFAULT_PT_LOGO_URL;
    }
    return fallbackLogo && fallbackLogo.trim() ? fallbackLogo.trim() : undefined;
  };

  const lrDivisi = TransactionService.getLabaRugiDivisiSummary(
    periodeMode === 'BULAN' ? { bulan: requestedBulan, tahun: requestedTahun } : undefined
  );

  // Ensure all 7 standard columns always appear in the classic order
  const canonicalDivisions: Array<{
    idDivisi: string;
    nama: string;
    logoUrl?: string;
    themeKey: RekapDivisiMatrixCol['themeKey'];
    kodeSingkat: string;
    order: number;
  }> = [
    { idDivisi: 'DIV-WAP', nama: 'PT Wijaya Agro Perkasa', logoUrl: resolveMasterLogo('DIV-WAP', 'PT Wijaya Agro Perkasa', DEFAULT_PT_LOGO_URL), themeKey: 'WAP', kodeSingkat: 'PT WAP', order: 1 },
    { idDivisi: 'DIV-GWA', nama: 'Gudang Wijaya Agro', logoUrl: resolveMasterLogo('DIV-GWA', 'Gudang Wijaya Agro'), themeKey: 'GWA', kodeSingkat: 'GWA', order: 2 },
    { idDivisi: 'DIV-CVA', nama: 'CV Wijaya Agro', logoUrl: resolveMasterLogo('DIV-CVA', 'CV Wijaya Agro'), themeKey: 'CVWA', kodeSingkat: 'CV WA', order: 3 },
    { idDivisi: 'DIV-WT', nama: 'Wijaya Transport', logoUrl: resolveMasterLogo('DIV-WT', 'Wijaya Transport'), themeKey: 'WT', kodeSingkat: 'W T', order: 4 },
    { idDivisi: 'DIV-BRILINK', nama: 'BRILink', logoUrl: resolveMasterLogo('DIV-BRILINK', 'BRILink'), themeKey: 'BRILINK', kodeSingkat: 'BRI LINK', order: 5 },
    { idDivisi: 'DIV-OKU', nama: 'Okussa', logoUrl: resolveMasterLogo('DIV-OKU', 'Okussa'), themeKey: 'OKUSSA', kodeSingkat: 'OKUSSA', order: 6 },
    { idDivisi: 'DIV-WK', nama: 'Wijaya Karya', logoUrl: resolveMasterLogo('DIV-WK', 'Wijaya Karya'), themeKey: 'WK', kodeSingkat: 'WK', order: 7 },
  ];

  const divisiMapByTheme = new Map<string, RekapDivisiMatrixCol>();
  for (const c of canonicalDivisions) {
    divisiMapByTheme.set(c.themeKey, {
      idDivisi: c.idDivisi,
      kodeSingkat: c.kodeSingkat,
      nama: c.nama,
      logoUrl: c.logoUrl,
      themeKey: c.themeKey,
      inNominal: 0,
      outNominal: 0,
      barangNominal: barangByTheme[c.themeKey] || 0,
      labaRugi: 0,
    });
  }

  const extraDivisions: RekapDivisiMatrixCol[] = [];
  for (const d of lrDivisi.items || []) {
    const meta = resolveDivisiMeta(d.divisi);
    if (meta.themeKey !== 'OTHER' && divisiMapByTheme.has(meta.themeKey)) {
      const existing = divisiMapByTheme.get(meta.themeKey)!;
      existing.idDivisi = d.idDivisi || existing.idDivisi;
      existing.nama = d.divisi || existing.nama;
      const masterLogo = resolveMasterLogo(existing.idDivisi, existing.nama, d.logoUrl || existing.logoUrl);
      if (masterLogo) existing.logoUrl = masterLogo;
      existing.inNominal += Math.round(Number(d.uangMasuk) || 0);
      existing.outNominal += Math.round(Number(d.uangKeluar) || 0);
      existing.labaRugi = Math.round(existing.inNominal - existing.outNominal);
    } else {
      const inNom = Math.round(Number(d.uangMasuk) || 0);
      const outNom = Math.round(Number(d.uangKeluar) || 0);
      if (inNom > 0 || outNom > 0) {
        extraDivisions.push({
          idDivisi: d.idDivisi,
          kodeSingkat: meta.kodeSingkat,
          nama: d.divisi,
          logoUrl: resolveMasterLogo(d.idDivisi, d.divisi, d.logoUrl),
          themeKey: 'OTHER',
          inNominal: inNom,
          outNominal: outNom,
          barangNominal: 0,
          labaRugi: Math.round(inNom - outNom),
        });
      }
    }
  }

  const divisiMatrix: RekapDivisiMatrixCol[] = [
    ...canonicalDivisions.map((c) => divisiMapByTheme.get(c.themeKey)!),
    ...extraDivisions,
  ];

  const divisiTotal = {
    inNominal: divisiMatrix.reduce((s, d) => s + d.inNominal, 0),
    outNominal: divisiMatrix.reduce((s, d) => s + d.outNominal, 0),
    barangNominal: totalBarang,
    labaRugi: divisiMatrix.reduce((s, d) => s + d.labaRugi, 0),
  };

  // ------------------------------------------------------------------
  // 3. TABEL GAJI KARYAWAN — 100% SINKRON DENGAN HAK UPAH (GAJI BERJALAN)
  //    DARI getRekapBulananPayroll UNTUK BULAN YANG DIPILIH DI HEADER
  // ------------------------------------------------------------------
  const payrollBulanan = TransactionService.getRekapBulananPayroll({
    bulan: requestedBulan,
    tahun: requestedTahun,
  });
  const payrollByKryId = new Map(
    (payrollBulanan.items || []).map((item) => [item.idKaryawan, item])
  );

  const activeEmployees = (db.karyawan || []).filter((k) => k.status !== 'NONAKTIF');
  const gajiList: RekapGajiKaryawanRow[] = activeEmployees.map((kry) => {
    const pItem = payrollByKryId.get(kry.id);
    let gajiHarian = 0;
    let gajiBulanan = 0;

    if (pItem && Array.isArray(pItem.rincianHarian) && pItem.rincianHarian.length > 0) {
      // Sama persis dengan rumus Hak Upah (Gaji Berjalan) di RekapitulasiPayrollBulananTable
      for (const row of pItem.rincianHarian) {
        const nom = Math.round(Number(row.totalUpah ?? row.jumlah) || 0);
        const itemNorm = normalizeText(row.item);
        if (itemNorm.includes('GAJI BULANAN') || itemNorm === 'BULANAN') {
          gajiBulanan += nom;
        } else {
          gajiHarian += nom;
        }
      }
    } else {
      // Fallback hanya untuk slip gaji murni bulan berjalan (bukan pencairan/settlement bulan sebelumnya)
      const slipsInPeriod = (db.penggajian || []).filter(
        (g) => g.idKaryawan === kry.id && matchesPeriod(g.tanggalKerja || g.tanggal)
      );
      for (const sl of slipsInPeriod) {
        const hasLinkedDaily =
          Array.isArray(sl.daftarUpahHarianIds) && sl.daftarUpahHarianIds.length > 0;
        if (hasLinkedDaily) continue;
        if (isPreviousMonthSettlementSlip(sl)) continue;

        const kotor = Math.round(Number(sl.totalGajiKotor) || Number(sl.gajiBersihDibayar) || 0);
        if (sl.tipeGaji === 'BULANAN') {
          gajiBulanan += kotor;
        } else {
          gajiHarian += kotor;
        }
      }
    }

    return {
      id: kry.id,
      nama: kry.nama.toUpperCase(),
      jabatan: kry.jabatan || '',
      gajiHarian,
      gajiBulanan,
      total: gajiHarian + gajiBulanan,
    };
  });

  const subTotGajiHarian = gajiList.reduce((s, r) => s + r.gajiHarian, 0);
  const subTotGajiBulanan = gajiList.reduce((s, r) => s + r.gajiBulanan, 0);
  const totalGaji = subTotGajiHarian + subTotGajiBulanan;

  // ------------------------------------------------------------------
  // 4. TABEL PENGELUARAN — 100% SINKRON DENGAN MENU PENGELUARAN (PENGELUARANVIEW)
  //    HIJAU = Unit Aktif Data Inventaris + Custom Hijau
  //    ORANYE = Master Item Biasa Aktif
  // ------------------------------------------------------------------
  const activeInventaris = (db.inventaris || []).filter((u) => u.status !== 'NONAKTIF');
  const masterItems = TransactionService.getMasterItemPengeluaran();

  interface PengeluaranBuildRow extends RekapPengeluaranItemRow {
    linkedInventarisId?: string;
    nomorPlat?: string;
    namaUnitRaw?: string;
  }

  const buildRows: PengeluaranBuildRow[] = [];
  let runningNo = 1;
  const usedInventarisCompact = new Set<string>();

  // 4A. HIJAU: Unit aktif dari Data Inventaris (sama persis urutan & nama di Menu Pengeluaran)
  for (const unit of activeInventaris) {
    const label = getInventarisDisplayLabel(unit);
    const cLabel = compactText(label);
    if (cLabel) usedInventarisCompact.add(cLabel);
    if (unit.namaItem) usedInventarisCompact.add(compactText(unit.namaItem));
    if (unit.nomorPlat && unit.nomorPlat !== '-') {
      usedInventarisCompact.add(compactText(unit.nomorPlat));
    }
    buildRows.push({
      no: runningNo++,
      kode: unit.kode || unit.id,
      nama: label,
      kelompok: 'INVENTARIS',
      nominal: 0,
      jumlahTrx: 0,
      linkedInventarisId: unit.id,
      nomorPlat: unit.nomorPlat,
      namaUnitRaw: unit.namaItem,
    });
  }

  // Tambahan item custom HIJAU dari masterItems (bukan 16 item default lama jika Data Inventaris sudah terisi)
  const customGreenMasters = masterItems.filter((m) => {
    const namaUp = normalizeText(m.nama);
    if (namaUp === 'PEMBAYARAN_SUPPLIER_SJ') return false;
    const kel = resolveKelompokItemPengeluaran(namaUp, m.kelompok);
    if (kel !== 'INVENTARIS') return false;
    if (activeInventaris.length > 0 && m.isSystemDefault) return false;
    const c = compactText(namaUp);
    return c.length > 0 && !usedInventarisCompact.has(c);
  });

  for (const m of customGreenMasters) {
    const namaUp = normalizeText(m.nama);
    const c = compactText(namaUp);
    usedInventarisCompact.add(c);
    buildRows.push({
      no: runningNo++,
      kode: m.kode || `EXP-INV-${runningNo}`,
      nama: namaUp,
      kelompok: 'INVENTARIS',
      nominal: 0,
      jumlahTrx: 0,
    });
  }

  // 4B. ORANYE: Item Pengeluaran Biasa aktif dari masterItems
  const activeOrangeMasters =
    masterItems.length > 0
      ? masterItems.filter((m) => {
          const namaUp = normalizeText(m.nama);
          if (namaUp === 'PEMBAYARAN_SUPPLIER_SJ') return false;
          return resolveKelompokItemPengeluaran(namaUp, m.kelompok) === 'BIASA';
        })
      : DAFTAR_24_ITEM_PENGELUARAN.filter((d) => d.kelompok === 'BIASA').map((d) => ({
          id: d.kode,
          kode: d.kode,
          nama: d.nama,
          kelompok: 'BIASA' as KelompokItemPengeluaran,
        }));

  const seenOrange = new Set<string>();
  for (const m of activeOrangeMasters) {
    const namaUp = normalizeText(m.nama);
    const c = compactText(namaUp);
    if (!c || seenOrange.has(c)) continue;
    seenOrange.add(c);
    buildRows.push({
      no: runningNo++,
      kode: m.kode || `EXP-BIA-${runningNo}`,
      nama: namaUp,
      kelompok: 'BIASA',
      nominal: 0,
      jumlahTrx: 0,
    });
  }

  // 4C. Akumulasi transaksi db.pengeluaran ke baris yang cocok (persis seperti PengeluaranView)
  for (const ex of db.pengeluaran || []) {
    if (!matchesPeriod(ex.tanggal)) continue;
    const katNorm = normalizeText(ex.kategori || 'LAIN-LAIN');
    if (katNorm === 'PEMBAYARAN_SUPPLIER_SJ') continue;
    const katCompact = compactText(katNorm);
    const nom = Math.round(Number(ex.nominal) || 0);

    let matchedRow = ex.idInventaris
      ? buildRows.find((r) => r.linkedInventarisId && r.linkedInventarisId === ex.idInventaris)
      : undefined;

    if (!matchedRow && katCompact) {
      matchedRow = buildRows.find((r) => {
        if (compactText(r.nama) === katCompact) return true;
        if (r.nomorPlat && compactText(r.nomorPlat) === katCompact) return true;
        if (r.namaUnitRaw && compactText(r.namaUnitRaw) === katCompact) return true;
        return false;
      });
    }

    if (matchedRow) {
      matchedRow.nominal += nom;
      matchedRow.jumlahTrx += 1;
    } else if (nom !== 0) {
      // Fallback: jika ada kategori transaksi historis yang sudah dihapus dari master
      const kel = resolveKelompokItemPengeluaran(katNorm, ex.kelompokPengeluaran);
      buildRows.push({
        no: runningNo++,
        kode: `EXP-EXTRA-${runningNo}`,
        nama: katNorm,
        kelompok: kel,
        nominal: nom,
        jumlahTrx: 1,
      });
    }
  }

  const pengeluaranList: RekapPengeluaranItemRow[] = buildRows.map(
    ({ linkedInventarisId: _l, nomorPlat: _p, namaUnitRaw: _n, ...clean }, idx) => ({
      ...clean,
      no: idx + 1,
    })
  );

  const totalPengeluaranInventaris = pengeluaranList
    .filter((p) => p.kelompok === 'INVENTARIS')
    .reduce((s, p) => s + p.nominal, 0);
  const totalPengeluaranBiasa = pengeluaranList
    .filter((p) => p.kelompok === 'BIASA')
    .reduce((s, p) => s + p.nominal, 0);
  const totalPengeluaran = totalPengeluaranInventaris + totalPengeluaranBiasa;
  const totalKeluarGabungan = totalGaji + totalPengeluaran;

  // ------------------------------------------------------------------
  // 5. TABEL REKENING FISIK PERUSAHAAN (LIVE SALDO KAS & BANK)
  // ------------------------------------------------------------------
  const physicalAccounts = (db.rekening || []).filter(
    (r) =>
      r.status === 'AKTIF' &&
      !r.isVirtual &&
      !r.isRekeningTitip &&
      !r.isAnakPerusahaan &&
      !String(r.kode || '').toUpperCase().startsWith('REK-')
  );

  const rekeningOrderPriority = (kode: string, nama: string): number => {
    const s = `${kode} ${nama}`.toUpperCase();
    if (s.includes('KAS01') || s.includes('KASIR') || s.includes('KAS UTAMA')) return 1;
    if (s.includes('GUDANG')) return 2;
    if (s.includes('BERANGKAS') || s.includes('BRANKAS')) return 3;
    if (s.includes('BNI DIRECT')) return 4;
    if (s.includes('BNI')) return 5;
    if (s.includes('BRI')) return 6;
    if (s.includes('BCA')) return 7;
    if (s.includes('MANDIRI')) return 8;
    if (s.includes('SUMSEL')) return 9;
    return 50;
  };

  const rekeningList: RekapRekeningRow[] = physicalAccounts
    .map((r) => ({
      kode: r.kode,
      nama: r.nama.toUpperCase(),
      saldo: Math.round(Number(r.saldoSaatIni) || 0),
    }))
    .sort((a, b) => {
      const pa = rekeningOrderPriority(a.kode, a.nama);
      const pb = rekeningOrderPriority(b.kode, b.nama);
      if (pa !== pb) return pa - pb;
      return a.nama.localeCompare(b.nama);
    });

  const totalRekening = rekeningList.reduce((s, r) => s + r.saldo, 0);

  // ------------------------------------------------------------------
  // 6. BLOK RINGKASAN KAS (NOTA SUPLAYER, LABA/RUGI, BARANG, REKENING, TOT)
  // ------------------------------------------------------------------
  const rekapMitra = TransactionService.getRekapMasterMitra();
  const notaSuplayer = Math.round(Number(rekapMitra.totalRekeningMitraNotaSupplier) || 0);
  const kasTotal = notaSuplayer + totalBarang + totalRekening;

  const periodeLabel = `${(NAMA_BULAN_ID[requestedBulan - 1] || '').toUpperCase()} ${requestedTahun}`;

  const tanggalBanner =
    requestedBulan === todayParsed.bulan && requestedTahun === todayParsed.tahun
      ? `TGL ${todayParsed.hari}-${todayParsed.bulan}-${todayParsed.tahun}`
      : `PERIODE ${String(requestedBulan).padStart(2, '0')}-${requestedTahun}`;

  return {
    updatedAt: wib.iso,
    tanggalWIB: wib.tanggal,
    jamWIB: wib.jam,
    periodeMode,
    selectedBulan: requestedBulan,
    selectedTahun: requestedTahun,
    periodeLabel,
    tanggalBanner,
    availableMonths,
    divisiMatrix,
    divisiTotal,
    gajiList,
    subTotGajiHarian,
    subTotGajiBulanan,
    totalGaji,
    totalKeluarGabungan,
    pengeluaranList,
    totalPengeluaranInventaris,
    totalPengeluaranBiasa,
    totalPengeluaran,
    kasSummary: {
      notaSuplayer,
      labaRugi: divisiTotal.labaRugi,
      barang: totalBarang,
      rekening: totalRekening,
      total: kasTotal,
    },
    rekeningList,
    totalRekening,
    barangPerDivisi: {
      gwa: {
        judul: 'GUDANG WIJAYA AGRO (GWA)',
        items: gwaItems,
        totalNilai: gwaTotalNilai,
        totalQty: gwaTotalQty,
      },
      wt: {
        judul: 'WIJAYA TRANSPORT',
        items: wtItems,
        totalNilai: wtTotal,
        totalQty: Math.round(wtItems.reduce((s, i) => s + i.qty, 0) * 100) / 100,
      },
      cvWa: {
        judul: 'CV WA',
        items: cvWaItems,
        totalNilai: cvWaTotal,
        totalQty: Math.round(cvWaItems.reduce((s, i) => s + i.qty, 0) * 100) / 100,
      },
      okussa: {
        judul: 'OKUSSA',
        items: okussaItems,
        totalNilai: okussaTotal,
        totalQty: Math.round(okussaItems.reduce((s, i) => s + i.qty, 0) * 100) / 100,
      },
      wk: {
        judul: 'WIJAYA KARYA (WK)',
        items: wkItems,
        totalNilai: wkTotal,
        totalQty: Math.round(wkItems.reduce((s, i) => s + i.qty, 0) * 100) / 100,
      },
      totalBarang,
    },
  };
}
