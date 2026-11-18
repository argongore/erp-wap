import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  CatatanUpahHarian,
  DEFAULT_PT_LOGO_URL,
  DetailHarianKaryawanResponse,
  ItemMutasiUangTitipKaryawan,
  ProfilPerusahaan,
  RingkasanUangTitipKaryawan,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPenggajian,
} from '../server/types.ts';
import {
  formatHariTanggalLabel,
  formatRupiah,
  formatTanggalIndo,
  getWIBTodayString,
  normalizeDateToDmy,
} from './format.ts';
import { loadLogoDataUrl } from './exportRekeningKoranPdf.ts';

export interface ExportHistoryGajiFilter {
  periodeMode: 'SEMUA' | 'BULAN_TAHUN';
  bulan?: number; // 1..12
  tahun?: number;
  statusKerja?: 'SEMUA' | 'BON' | 'LUNAS';
}

export interface PreparedEmployeeHistoryData {
  karyawan: DetailHarianKaryawanResponse['karyawan'];
  logs: CatatanUpahHarian[];
  slips: TransaksiPenggajian[];
  kasbonBarang: any[];
  kasbonUang: TransaksiKasbonUang[];
  bayarBon: TransaksiBayarBon[];
  uangTitipAll: ItemMutasiUangTitipKaryawan[];
  uangTitipDisplay: ItemMutasiUangTitipKaryawan[];
  ringkasanUangTitip: RingkasanUangTitipKaryawan;
  saldoTitipSebelumPeriode: number;
  totalTitipMasukPeriode: number;
  totalTitipKeluarPeriode: number;
  hasPiutangHutangOrTitip: boolean;
  isMonthFiltered: boolean;
  scopeLabel: string;
  periodeFileSlug: string;
  statusFilterLabel: string;
  totalHariKerjaUnik: number;
  totalCatatanKerja: number;
  totalUpahPokok: number;
  totalLemburMakan: number;
  totalUpahTercatat: number;
  totalUpahBelumCair: number;
  totalUpahSudahCair: number;
  totalSlipGajiKotor: number;
  totalSlipPotongBon: number;
  totalSlipBersihDibayar: number;
  totalBonBarangPeriode: number;
  totalBonUangPeriode: number;
  totalBayarBonPeriode: number;
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

const SANS_FONT = '"Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

function sanitizeFilenamePart(val: string): string {
  return (val || 'KARYAWAN')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function getFileDateStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function parseDmyComponents(raw?: string | null): { day: number; month: number; year: number; ms: number } | null {
  const dmy = normalizeDateToDmy(raw, '');
  if (!dmy) return null;
  const parts = dmy.split('/');
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);
  if (!day || !month || !year) return null;
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return null;
  return { day, month, year, ms };
}

function compareByDateAsc(aRaw?: string, bRaw?: string, aCreated?: string, bCreated?: string): number {
  const pa = parseDmyComponents(aRaw);
  const pb = parseDmyComponents(bRaw);
  const ta = pa ? pa.ms : 0;
  const tb = pb ? pb.ms : 0;
  if (ta !== tb) return ta - tb;
  if (aCreated && bCreated) return aCreated.localeCompare(bCreated);
  return 0;
}

function resolveProfilPerusahaan(src?: ProfilPerusahaan | null): ProfilPerusahaan {
  const rawAlamat = src?.alamat?.trim();
  const rawTelepon = src?.telepon?.trim();
  const rawEmail = src?.email?.trim();
  return {
    namaPerusahaan: src?.namaPerusahaan?.trim() || 'PT WIJAYA AGRO PERKASA',
    badanHukum: src?.badanHukum?.trim() || 'PT (Perseroan Terbatas)',
    alamat:
      rawAlamat && rawAlamat !== '-'
        ? rawAlamat
        : 'Jl Kalangan Desa Simpang Luas, Kec. Sungai Are, OKUS SUMSEL',
    telepon:
      rawTelepon && rawTelepon !== '-'
        ? rawTelepon
        : 'TELPON KASIR 0821 44 999 305 · TELPON ADM 0812 2000 3305',
    email: rawEmail && rawEmail !== '-' ? rawEmail : 'wijayaagroperkasa@gmail.com',
    penanggungJawab: src?.penanggungJawab?.trim() || 'KASIR / BAGIAN KEUANGAN',
    rekeningUtama: src?.rekeningUtama?.trim() || 'KAS01',
    catatanHeaderNota: src?.catatanHeaderNota?.trim() || '',
    logoUrl: src?.logoUrl?.trim() || DEFAULT_PT_LOGO_URL,
  };
}

export function getLogQty(log: CatatanUpahHarian): number {
  if (log.kuantiti !== undefined && log.kuantiti !== null) return Number(log.kuantiti);
  return (log.totalUpahHarian || 0) > 0 ? 1 : 0;
}

export function getLogHarga(log: CatatanUpahHarian): number {
  if (log.harga !== undefined && log.harga !== null) return Number(log.harga);
  return Number(log.upahHarian || 0);
}

export function getLogTotal(log: CatatanUpahHarian): number {
  if (log.jumlah !== undefined && log.jumlah !== null) return Number(log.jumlah);
  return Number(log.totalUpahHarian || 0);
}

export function isLogBelumCair(log: CatatanUpahHarian): boolean {
  return log.ket === 'BON' || log.status === 'TERCATAT';
}

export function buildLogJobDisplay(log: CatatanUpahHarian): string {
  const itemPart = (log.item || '').trim();
  const ketPart = (log.keterangan || '').trim();
  return itemPart || ketPart || `Tugas harian di ${log.divisi}`;
}

export function buildLogCatatanDisplay(
  log: CatatanUpahHarian,
  linkedSlip?: TransaksiPenggajian
): string {
  const parts: string[] = [];
  const ketPart = (log.keterangan || '').trim();
  const catPart = (log.catatan || '').trim();

  if (ketPart) {
    parts.push(ketPart);
  }
  if (catPart && !ketPart.toLowerCase().includes(catPart.toLowerCase())) {
    parts.push(catPart);
  }
  if (!ketPart && linkedSlip?.keterangan) {
    const slipKet = linkedSlip.keterangan.trim();
    if (
      slipKet &&
      !/^(Pembayaran Gaji|Gaji (Harian|Bulanan))/i.test(slipKet)
    ) {
      parts.push(slipKet);
    }
  }
  if ((log.uangMakanLembur || 0) > 0) {
    const lemburText = `Lembur/Makan +${formatRupiah(log.uangMakanLembur)}`;
    if (!parts.some((p) => p.toLowerCase().includes('lembur'))) {
      parts.push(lemburText);
    }
  }
  if (!isLogBelumCair(log) && log.tanggalDibayar) {
    parts.push(`Cair: ${log.tanggalDibayar}`);
  }
  return parts.join(' · ') || '-';
}

/**
 * Extracts available Month/Year pairs present in an employee's history.
 */
function getPeriodKeyFromRaw(raw?: string): string | null {
  const comp = parseDmyComponents(raw);
  if (!comp) return null;
  return `${comp.year}-${String(comp.month).padStart(2, '0')}`;
}

export function extractEmployeePeriodsSafe(
  detail: DetailHarianKaryawanResponse
): Array<{ key: string; bulan: number; tahun: number; label: string }> {
  const seen = new Map<string, { bulan: number; tahun: number }>();
  const addDate = (raw?: string) => {
    const comp = parseDmyComponents(raw);
    if (!comp) return;
    const key = `${comp.year}-${String(comp.month).padStart(2, '0')}`;
    if (!seen.has(key)) {
      seen.set(key, { bulan: comp.month, tahun: comp.year });
    }
  };

  (detail.logHarian || []).forEach((l) => addDate(l.tanggalKerja));
  (detail.riwayatGaji || []).forEach((g) => addDate(g.tanggal));
  (detail.riwayatKasbonBarang || []).forEach((b) => addDate(b.tanggal));
  (detail.riwayatKasbonUang || []).forEach((u) => addDate(u.tanggal));
  (detail.riwayatBayarBon || []).forEach((p) => addDate(p.tanggal));
  (detail.riwayatUangTitip || []).forEach((t) => addDate(t.tanggal));

  return Array.from(seen.entries())
    .map(([key, v]) => ({
      key,
      bulan: v.bulan,
      tahun: v.tahun,
      label: `${NAMA_BULAN_ID[v.bulan - 1] || `Bulan ${v.bulan}`} ${v.tahun}`,
    }))
    .sort((a, b) => (b.tahun !== a.tahun ? b.tahun - a.tahun : b.bulan - a.bulan));
}

export function prepareHistoryGajiData(
  detail: DetailHarianKaryawanResponse,
  filter: ExportHistoryGajiFilter = { periodeMode: 'SEMUA', statusKerja: 'SEMUA' }
): PreparedEmployeeHistoryData {
  const isMonthFilter =
    filter.periodeMode === 'BULAN_TAHUN' && Boolean(filter.bulan) && Boolean(filter.tahun);
  const targetKey = isMonthFilter
    ? `${filter.tahun}-${String(filter.bulan).padStart(2, '0')}`
    : '';
  const targetStartMs =
    isMonthFilter && filter.tahun && filter.bulan
      ? Date.UTC(filter.tahun, filter.bulan - 1, 1)
      : 0;

  const matchPeriod = (raw?: string): boolean => {
    if (!isMonthFilter) return true;
    const k = getPeriodKeyFromRaw(raw);
    return k === targetKey;
  };

  const statusFilter = filter.statusKerja || 'SEMUA';

  const logs = [...(detail.logHarian || [])]
    .filter((l) => matchPeriod(l.tanggalKerja))
    .filter((l) => {
      if (statusFilter === 'BON') return isLogBelumCair(l);
      if (statusFilter === 'LUNAS') return !isLogBelumCair(l);
      return true;
    })
    .sort((a, b) => compareByDateAsc(a.tanggalKerja, b.tanggalKerja, a.createdAt, b.createdAt));

  const slips = [...(detail.riwayatGaji || [])]
    .filter((g) => matchPeriod(g.tanggal))
    .sort((a, b) => compareByDateAsc(a.tanggal, b.tanggal, a.jam, b.jam));

  const kasbonBarang = [...(detail.riwayatKasbonBarang || [])]
    .filter((b) => matchPeriod(b.tanggal))
    .sort((a, b) => compareByDateAsc(a.tanggal, b.tanggal, a.createdAt, b.createdAt));

  const kasbonUang = [...(detail.riwayatKasbonUang || [])]
    .filter((u) => matchPeriod(u.tanggal))
    .sort((a, b) => compareByDateAsc(a.tanggal, b.tanggal, a.createdAt, b.createdAt));

  const bayarBon = [...(detail.riwayatBayarBon || [])]
    .filter((p) => matchPeriod(p.tanggal))
    .sort((a, b) => compareByDateAsc(a.tanggal, b.tanggal, a.createdAt, b.createdAt));

  const uangTitipAll = [...(detail.riwayatUangTitip || [])].sort((a, b) =>
    compareByDateAsc(a.tanggal, b.tanggal, a.createdAt, b.createdAt)
  );
  const uangTitipInMonth = isMonthFilter
    ? uangTitipAll.filter((t) => matchPeriod(t.tanggal))
    : uangTitipAll;

  let saldoTitipSebelumPeriode = 0;
  if (isMonthFilter && targetStartMs > 0) {
    let masukBefore = 0;
    let keluarBefore = 0;
    for (const t of uangTitipAll) {
      const comp = parseDmyComponents(t.tanggal);
      if (comp && comp.ms < targetStartMs) {
        masukBefore += Number(t.nominalMasuk || 0);
        keluarBefore += Number(t.nominalKeluar || 0);
      }
    }
    saldoTitipSebelumPeriode = Math.max(0, masukBefore - keluarBefore);
  }

  // Jika bulan berjalan tidak ada mutasi titip baru tapi saldo titip sebelumnya > 0, tetap tampilkan asal muasal titipan
  const uangTitipDisplay =
    isMonthFilter && uangTitipInMonth.length === 0 && uangTitipAll.length > 0
      ? uangTitipAll
      : uangTitipInMonth;

  const totalTitipMasukPeriode = uangTitipDisplay.reduce((s, t) => s + Number(t.nominalMasuk || 0), 0);
  const totalTitipKeluarPeriode = uangTitipDisplay.reduce((s, t) => s + Number(t.nominalKeluar || 0), 0);

  const fallbackTotalMasuk = uangTitipAll.reduce((s, t) => s + Number(t.nominalMasuk || 0), 0);
  const fallbackTotalKeluar = uangTitipAll.reduce((s, t) => s + Number(t.nominalKeluar || 0), 0);
  const fallbackSaldoTitip =
    detail.karyawan.totalTitipHasilPanen ??
    Math.max(0, fallbackTotalMasuk - fallbackTotalKeluar);

  const ringkasanUangTitip: RingkasanUangTitipKaryawan = detail.ringkasanUangTitip || {
    totalTitipMasuk: fallbackTotalMasuk,
    totalTitipDicairkan: fallbackTotalKeluar,
    saldoTitipAktif: fallbackSaldoTitip,
    totalBonAktif: detail.karyawan.totalBonKaryawan || 0,
    selisihTitipVsBon: fallbackSaldoTitip - (detail.karyawan.totalBonKaryawan || 0),
    totalHakUpahBelumCair: detail.karyawan.totalUpahBelumDibayar || 0,
    saldoBersihTerpadu:
      (detail.karyawan.totalUpahBelumDibayar || 0) +
      fallbackSaldoTitip -
      (detail.karyawan.totalBonKaryawan || 0),
  };

  const hasPiutangHutangOrTitip =
    ringkasanUangTitip.totalTitipMasuk > 0 ||
    ringkasanUangTitip.totalTitipDicairkan > 0 ||
    ringkasanUangTitip.saldoTitipAktif > 0 ||
    (detail.karyawan.totalTitipHasilPanen || 0) > 0 ||
    (detail.karyawan.totalBonKaryawan || 0) > 0 ||
    uangTitipAll.length > 0 ||
    (detail.riwayatKasbonBarang?.length || 0) > 0 ||
    (detail.riwayatKasbonUang?.length || 0) > 0 ||
    (detail.riwayatBayarBon?.length || 0) > 0;

  const monthName =
    isMonthFilter && filter.bulan
      ? `${NAMA_BULAN_ID[filter.bulan - 1] || `Bulan ${filter.bulan}`} ${filter.tahun}`
      : 'Semua Periode (Lengkap)';

  const statusFilterLabel =
    statusFilter === 'BON'
      ? 'Hanya Belum Cair (BON)'
      : statusFilter === 'LUNAS'
      ? 'Hanya Sudah Cair (LUNAS)'
      : 'Semua Status Inputan';

  const scopeLabel =
    statusFilter === 'SEMUA'
      ? monthName
      : `${monthName} · ${statusFilterLabel}`;

  const periodeFileSlug = isMonthFilter
    ? sanitizeFilenamePart(`${NAMA_BULAN_ID[(filter.bulan || 1) - 1] || filter.bulan}_${filter.tahun}`)
    : 'Semua_Periode';

  const uniqueDates = new Set(
    logs.filter((l) => getLogTotal(l) > 0).map((l) => normalizeDateToDmy(l.tanggalKerja, l.tanggalKerja))
  );
  const totalHariKerjaUnik = uniqueDates.size > 0 ? uniqueDates.size : logs.length;

  let totalUpahPokok = 0;
  let totalLemburMakan = 0;
  let totalUpahTercatat = 0;
  let totalUpahBelumCair = 0;
  let totalUpahSudahCair = 0;

  for (const log of logs) {
    const total = getLogTotal(log);
    const lembur = Number(log.uangMakanLembur || 0);
    const pokok =
      log.upahHarian !== undefined && log.upahHarian !== null
        ? Number(log.upahHarian)
        : Math.max(0, total - lembur);
    totalUpahPokok += pokok;
    totalLemburMakan += lembur;
    totalUpahTercatat += total;
    if (isLogBelumCair(log)) {
      totalUpahBelumCair += total;
    } else {
      totalUpahSudahCair += total;
    }
  }

  const totalSlipGajiKotor = slips.reduce((s, g) => s + Number(g.totalGajiKotor || 0), 0);
  const totalSlipPotongBon = slips.reduce((s, g) => s + Number(g.potonganKasbon || 0), 0);
  const totalSlipBersihDibayar = slips.reduce((s, g) => s + Number(g.gajiBersihDibayar || 0), 0);

  const totalBonBarangPeriode = kasbonBarang.reduce((s, b) => s + Number(b.totalNominal || 0), 0);
  const totalBonUangPeriode = kasbonUang.reduce((s, u) => s + Number(u.nominal || 0), 0);
  const totalBayarBonPeriode = bayarBon.reduce((s, p) => s + Number(p.nominalBayar || 0), 0);

  return {
    karyawan: detail.karyawan,
    logs,
    slips,
    kasbonBarang,
    kasbonUang,
    bayarBon,
    uangTitipAll,
    uangTitipDisplay,
    ringkasanUangTitip,
    saldoTitipSebelumPeriode,
    totalTitipMasukPeriode,
    totalTitipKeluarPeriode,
    hasPiutangHutangOrTitip,
    isMonthFiltered: isMonthFilter,
    scopeLabel,
    periodeFileSlug,
    statusFilterLabel,
    totalHariKerjaUnik,
    totalCatatanKerja: logs.length,
    totalUpahPokok,
    totalLemburMakan,
    totalUpahTercatat,
    totalUpahBelumCair,
    totalUpahSudahCair,
    totalSlipGajiKotor,
    totalSlipPotongBon,
    totalSlipBersihDibayar,
    totalBonBarangPeriode,
    totalBonUangPeriode,
    totalBayarBonPeriode,
  };
}

/**
 * 1. EXPORT EXCEL (.xlsx) — Multi-Sheet Workbook lengkap sesuai data yang diinputkan
 */
export function exportHistoryGajiKaryawanToXlsx(
  detail: DetailHarianKaryawanResponse,
  profilPerusahaan?: ProfilPerusahaan | null,
  filter?: ExportHistoryGajiFilter
): string {
  const data = prepareHistoryGajiData(detail, filter);
  const profil = resolveProfilPerusahaan(profilPerusahaan);
  const kry = data.karyawan;
  const divAktif = kry.divisi || kry.departemen || kry.divisiTerakhir || '-';
  const nowStr = new Date().toLocaleString('id-ID');

  const wb = XLSX.utils.book_new();

  // Sheet 1: Ringkasan Karyawan & Neraca
  const upgradeHistory =
    kry.riwayatDivisi && kry.riwayatDivisi.length > 0
      ? kry.riwayatDivisi
          .map(
            (r) =>
              `${r.periodeBulan || r.tanggal}: ${r.divisiSebelumnya || '-'} -> ${r.divisiBaru}${
                r.catatan ? ` (${r.catatan})` : ''
              }`
          )
          .join(' | ')
      : '-';

  const posisiSaatIniLabel =
    kry.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
      ? `Sisa Hak Upah Belum Cair: Rp ${Math.abs(kry.saldoBersih).toLocaleString('id-ID')}`
      : kry.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
      ? `Sisa Hutang Bon Karyawan: Rp ${Math.abs(kry.saldoBersih).toLocaleString('id-ID')}`
      : 'IMPAS / LUNAS (Rp 0)';

  const sheet1Rows: (string | number)[][] = [
    [profil.namaPerusahaan.toUpperCase()],
    ['DETAIL HISTORY PENGGAJIAN & RINCIAN KERJA PER KARYAWAN'],
    ['Tanggal Unduh', nowStr, '', 'Cakupan Data', data.scopeLabel],
    [],
    ['BIODATA KARYAWAN'],
    ['NIK / ID Karyawan', kry.nik, '', 'ID Mitra Terkait', kry.idMitraTerkait || '-'],
    ['Nama Lengkap', kry.nama, '', 'Status Karyawan', kry.status],
    ['Jabatan', kry.jabatan, '', 'No. Telepon', kry.telepon || '-'],
    ['Divisi Aktif', divAktif, '', 'Alamat', kry.alamat || '-'],
    ['Riwayat Upgrade Divisi', upgradeHistory],
    [],
    ['REKAPITULASI INPUTAN PERIODE TERPILIH', data.scopeLabel],
    ['Total Catatan Pekerjaan Harian', data.totalCatatanKerja, '', 'Hari Kerja Unik', data.totalHariKerjaUnik],
    ['Total Upah Pokok Tercatat (Rp)', data.totalUpahPokok, '', 'Total Lembur & Makan (Rp)', data.totalLemburMakan],
    ['Total Hak Upah Tercatat (Rp)', data.totalUpahTercatat],
    ['Upah Belum Dicairkan / BON (Rp)', data.totalUpahBelumCair, '', 'Upah Sudah Dicairkan / LUNAS (Rp)', data.totalUpahSudahCair],
    ['Jumlah Slip Gaji Cair', data.slips.length, '', 'Total Gaji Kotor di Slip (Rp)', data.totalSlipGajiKotor],
    ['Total Potongan Bon di Slip (Rp)', data.totalSlipPotongBon, '', 'Total Gaji Bersih Dibayar (Rp)', data.totalSlipBersihDibayar],
    [],
    ['POSISI NERACA KESELURUHAN SAAT INI (REALTIME)'],
    ['Hak Upah Belum Cair Keseluruhan (Rp)', kry.totalUpahBelumDibayar || 0],
    ['Sudah Cair Keseluruhan (Rp)', kry.totalUpahSudahDibayar || 0],
    ['Sisa Bon Uang Aktif (Rp)', kry.totalKasbonUang || 0],
    ['Sisa Bon Barang Toko Aktif (Rp)', kry.totalKasbonBarang || 0],
    ['Total Sisa Bon Aktif (Rp)', kry.totalBonKaryawan || 0],
    ['Total Uang Titip Masuk (Rp)', data.ringkasanUangTitip.totalTitipMasuk || 0],
    ['Total Uang Titip Diambil / Kliring (Rp)', data.ringkasanUangTitip.totalTitipDicairkan || 0],
    ['Sisa Saldo Uang Titip / Hutang PT (Rp)', data.ringkasanUangTitip.saldoTitipAktif || 0],
    ['Saldo Bersih Terpadu (Upah + Titip - Bon) (Rp)', data.ringkasanUangTitip.saldoBersihTerpadu || 0],
    ['Posisi Saldo Bersih Gaji', posisiSaatIniLabel],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Rows);
  ws1['!cols'] = [{ wch: 42 }, { wch: 32 }, { wch: 4 }, { wch: 34 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan Karyawan');

  const slipMap = new Map<string, TransaksiPenggajian>();
  (detail.riwayatGaji || []).forEach((s) => slipMap.set(s.id, s));

  // Sheet 2: Detail Input Kerja Harian (Utama)
  const logHeaders = [
    'No.',
    'Tanggal Kerja',
    'Hari & Tanggal',
    'Divisi',
    'Kode Divisi',
    'Item Pekerjaan',
    'Keterangan (Input Admin)',
    'Qty',
    'Tarif / Harga (Rp)',
    'Lembur / Makan (Rp)',
    'Total Upah (Rp)',
    'Status Ket',
    'Status Pencairan',
    'Tgl Dibayar',
    'No. Ref Slip',
    'Keterangan / Catatan Lengkap',
    'ID Input',
  ];

  const logBody: (string | number)[][] = data.logs.map((log, idx) => {
    const qty = getLogQty(log);
    const harga = getLogHarga(log);
    const total = getLogTotal(log);
    const tglNorm = normalizeDateToDmy(log.tanggalKerja, log.tanggalKerja);
    const hariTgl = log.hariTanggal || formatHariTanggalLabel(tglNorm) || tglNorm;
    const belumCair = isLogBelumCair(log);
    const linkedSlip = log.idPayrollSettlement ? slipMap.get(log.idPayrollSettlement) : undefined;
    return [
      idx + 1,
      tglNorm,
      hariTgl,
      log.divisi,
      log.divisiKode || log.divisi,
      buildLogJobDisplay(log),
      (log.keterangan || '').trim() || '-',
      qty,
      harga,
      Number(log.uangMakanLembur || 0),
      total,
      belumCair ? 'BON' : 'LUNAS',
      belumCair ? 'BELUM CAIR (TERCATAT)' : 'SUDAH CAIR',
      log.tanggalDibayar || '-',
      log.idPayrollSettlement || '-',
      buildLogCatatanDisplay(log, linkedSlip),
      log.id,
    ];
  });

  const logTotalRow: (string | number)[] = [
    '',
    '',
    '',
    '',
    '',
    `TOTAL (${data.logs.length} INPUTAN / ${data.totalHariKerjaUnik} HARI)`,
    '',
    data.logs.reduce((s, l) => s + getLogQty(l), 0),
    '',
    data.totalLemburMakan,
    data.totalUpahTercatat,
    '',
    `Belum Cair: ${formatRupiah(data.totalUpahBelumCair)}`,
    '',
    '',
    '',
    '',
  ];

  const ws2 = XLSX.utils.aoa_to_sheet([
    [`DETAIL INPUT PEKERJAAN & UPAH HARIAN — ${kry.nama.toUpperCase()} (${kry.nik})`],
    [`Cakupan: ${data.scopeLabel}`],
    [],
    logHeaders,
    ...logBody,
    logTotalRow,
  ]);
  ws2['!cols'] = logHeaders.map((h, colIdx) => {
    let maxLen = h.length;
    for (const row of [logHeaders, ...logBody, logTotalRow]) {
      const cell = row[colIdx];
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 46) };
  });
  XLSX.utils.book_append_sheet(wb, ws2, 'Detail Input Kerja');

  // Sheet 3: Riwayat Slip Gaji Cair
  const slipHeaders = [
    'No.',
    'No. Slip Gaji',
    'Tanggal Cair',
    'Jam',
    'Periode',
    'Divisi Pembayar',
    'Tipe Gaji',
    'Jml Hari Kerja',
    'Upah Pokok (Rp)',
    'Tunjangan (Rp)',
    'Bonus / Lembur (Rp)',
    'Total Gaji Kotor (Rp)',
    'Kasbon Awal (Rp)',
    'Potongan Bon (Rp)',
    '% Potong',
    'Gaji Bersih Dibayar (Rp)',
    'Sisa Bon Akhir (Rp)',
    'Rekening Sumber',
    'Metode Bayar',
    'Keterangan',
  ];

  const slipBody: (string | number)[][] = data.slips.map((g, idx) => [
    idx + 1,
    g.slipNomor,
    g.tanggal,
    g.jam || '-',
    g.periodeBulan || '-',
    g.divisi || '-',
    g.tipeGaji || 'HARIAN',
    g.jumlahHariKerja ?? (g.daftarUpahHarianIds?.length || 0),
    g.gajiPokok || 0,
    g.tunjangan || 0,
    g.bonus || 0,
    g.totalGajiKotor || 0,
    g.totalKasbonAwal || 0,
    g.potonganKasbon || 0,
    `${g.persentasePotongKasbon || 0}%`,
    g.gajiBersihDibayar || 0,
    g.sisaKasbonAkhir || 0,
    g.rekeningSumber || '-',
    g.metodePembayaran || '-',
    g.keterangan || '-',
  ]);

  const slipTotalRow: (string | number)[] = [
    '',
    '',
    '',
    '',
    '',
    `TOTAL (${data.slips.length} SLIP GAJI)`,
    '',
    '',
    data.slips.reduce((s, g) => s + Number(g.gajiPokok || 0), 0),
    data.slips.reduce((s, g) => s + Number(g.tunjangan || 0), 0),
    data.slips.reduce((s, g) => s + Number(g.bonus || 0), 0),
    data.totalSlipGajiKotor,
    '',
    data.totalSlipPotongBon,
    '',
    data.totalSlipBersihDibayar,
    '',
    '',
    '',
    '',
  ];

  const ws3 = XLSX.utils.aoa_to_sheet([
    [`RIWAYAT SLIP PENCAIRAN GAJI — ${kry.nama.toUpperCase()} (${kry.nik})`],
    [`Cakupan: ${data.scopeLabel}`],
    [],
    slipHeaders,
    ...slipBody,
    slipTotalRow,
  ]);
  ws3['!cols'] = slipHeaders.map((h, colIdx) => {
    let maxLen = h.length;
    for (const row of [slipHeaders, ...slipBody, slipTotalRow]) {
      const cell = row[colIdx];
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 42) };
  });
  XLSX.utils.book_append_sheet(wb, ws3, 'Riwayat Slip Gaji');

  // Sheet 4: Rincian Uang Titip, Kasbon & Pembayaran Bon
  const bonRows: (string | number)[][] = [
    [`RINCIAN UANG TITIP, KASBON & PELUNASAN BON — ${kry.nama.toUpperCase()} (${kry.nik})`],
    [`Cakupan: ${data.scopeLabel}`],
    [],
    ['A. DETAIL UANG TITIP (TITIPAN SISA GAJI / DANA & PENGAMBILAN / KLIRING)'],
    [
      'Ringkasan Posisi Uang Titip',
      `Titip Masuk: ${formatRupiah(data.ringkasanUangTitip.totalTitipMasuk)}`,
      `Diambil/Kliring: ${formatRupiah(data.ringkasanUangTitip.totalTitipDicairkan)}`,
      `Sisa Saldo Titip: ${formatRupiah(data.ringkasanUangTitip.saldoTitipAktif)}`,
      `Saldo Awal Sebelum Periode: ${formatRupiah(data.saldoTitipSebelumPeriode)}`,
    ],
    [
      'No.',
      'ID Transaksi',
      'Tanggal',
      'Jam',
      'Jenis / Judul & Keterangan',
      'Titip Masuk (+ Rp)',
      'Ambil / Kliring (- Rp)',
      'Saldo Titip Berjalan (Rp)',
      'Metode & Rekening',
    ],
  ];

  if (data.uangTitipDisplay.length === 0) {
    bonRows.push(['-', 'Tidak ada riwayat uang titip pada karyawan ini', '', '', '-', 0, 0, data.ringkasanUangTitip.saldoTitipAktif, '-']);
  } else {
    data.uangTitipDisplay.forEach((t, idx) => {
      bonRows.push([
        idx + 1,
        t.id,
        t.tanggal,
        t.jam || '-',
        `${t.judul}${t.keterangan ? ` — ${t.keterangan}` : ''}${t.noReferensi ? ` [Ref: ${t.noReferensi}]` : ''}`,
        Number(t.nominalMasuk || 0),
        Number(t.nominalKeluar || 0),
        Number(t.saldoTitipSetelah || 0),
        `${t.metode} (${t.rekeningKode})`,
      ]);
    });
  }

  bonRows.push([]);
  bonRows.push(['B. KASBON BARANG TOKO & PIUTANG HASIL BUMI']);
  bonRows.push(['No.', 'No. Nota', 'Tanggal', 'Jam', 'Rincian Produk', 'Total Nota (Rp)', 'Sisa Kasbon (Rp)', 'Status', 'Keterangan']);

  if (data.kasbonBarang.length === 0) {
    bonRows.push(['-', 'Tidak ada transaksi kasbon barang toko pada cakupan ini', '', '', '', 0, 0, '-', '-']);
  } else {
    data.kasbonBarang.forEach((b, idx) => {
      const itemsStr = (b.items || [])
        .map((it: any) => `${it.namaProduk || it.nama} (${it.qty} ${it.satuan} x ${formatRupiah(it.harga || 0)})`)
        .join('; ');
      bonRows.push([
        idx + 1,
        b.noPenjualan,
        b.tanggal,
        b.jam || '-',
        itemsStr || '-',
        Number(b.totalNominal || 0),
        Number(b.sisaPiutang || 0),
        b.statusPembayaran || '-',
        b.keterangan || '-',
      ]);
    });
  }

  bonRows.push([]);
  bonRows.push(['C. KASBON PINJAMAN UANG TUNAI / TRANSFER']);
  bonRows.push(['No.', 'ID Transaksi', 'Tanggal', 'Jam', 'Keperluan / Keterangan', 'Nominal Pinjaman (Rp)', 'Sisa Kasbon (Rp)', 'Status', 'Rekening & Metode']);

  if (data.kasbonUang.length === 0) {
    bonRows.push(['-', 'Tidak ada transaksi kasbon uang pada cakupan ini', '', '', '', 0, 0, '-', '-']);
  } else {
    data.kasbonUang.forEach((u, idx) => {
      bonRows.push([
        idx + 1,
        u.idTransaksi,
        u.tanggal,
        u.jam || '-',
        u.keterangan || '-',
        Number(u.nominal || 0),
        Number(u.sisaKasbon || 0),
        u.status || '-',
        `${u.rekeningSumber} (${u.metode})`,
      ]);
    });
  }

  bonRows.push([]);
  bonRows.push(['D. RIWAYAT PEMBAYARAN / POTONGAN BON']);
  bonRows.push(['No.', 'ID Transaksi', 'Tanggal', 'Jam', 'Keterangan', 'Nominal Bayar / Potong (Rp)', 'Sisa Bon Setelahnya (Rp)', 'Metode', 'Rekening Tujuan']);

  if (data.bayarBon.length === 0) {
    bonRows.push(['-', 'Tidak ada riwayat pembayaran/potongan bon pada cakupan ini', '', '', '', 0, 0, '-', '-']);
  } else {
    data.bayarBon.forEach((p, idx) => {
      bonRows.push([
        idx + 1,
        p.idTransaksi,
        p.tanggal,
        p.jam || '-',
        p.keterangan || '-',
        Number(p.nominalBayar || 0),
        Number(p.sisaBonSetelah || 0),
        p.metode || '-',
        p.rekeningTujuan || '-',
      ]);
    });
  }

  const ws4 = XLSX.utils.aoa_to_sheet(bonRows);
  ws4['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 14 },
    { wch: 10 },
    { wch: 48 },
    { wch: 20 },
    { wch: 20 },
    { wch: 22 },
    { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, ws4, 'Rincian Titip & Bon');

  const safeNama = sanitizeFilenamePart(kry.nama);
  const safeNik = sanitizeFilenamePart(kry.nik);
  const filename = `History_Penggajian_${safeNik}_${safeNama}_${data.periodeFileSlug}_${getFileDateStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

/**
 * 2. EXPORT PDF (.pdf) — Corporate Landscape A4 Laporan History Penggajian Per Karyawan
 */
export async function exportHistoryGajiKaryawanToPdf(
  detail: DetailHarianKaryawanResponse,
  profilPerusahaan?: ProfilPerusahaan | null,
  filter?: ExportHistoryGajiFilter
): Promise<{ fileName: string; totalLogs: number; totalSlips: number }> {
  const data = prepareHistoryGajiData(detail, filter);
  const profil = resolveProfilPerusahaan(profilPerusahaan);
  const kry = data.karyawan;
  const divAktif = kry.divisi || kry.departemen || kry.divisiTerakhir || '-';

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 11;
  const contentW = pageWidth - marginX * 2;
  const tglCetak = getWIBTodayString();
  const jamCetak = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // 1. Kop Surat Perusahaan
  let textStartX = marginX;
  const logoSrc = await loadLogoDataUrl(profil.logoUrl || DEFAULT_PT_LOGO_URL);
  if (logoSrc) {
    try {
      const fmt = logoSrc.includes('png') ? 'PNG' : 'JPEG';
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(marginX, 9.5, 14, 14, 2, 2, 'F');
      doc.addImage(logoSrc, fmt, marginX + 1, 10.5, 12, 12);
      textStartX = marginX + 17;
    } catch {
      textStartX = marginX;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(profil.namaPerusahaan.toUpperCase(), textStartX, 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(profil.alamat, textStartX, 17.8);
  doc.text(`${profil.telepon} · Email: ${profil.email}`, textStartX, 21.6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DETAIL HISTORY PENGGAJIAN KARYAWAN', pageWidth - marginX, 13.5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(5, 150, 105);
  doc.text(`CAKUPAN: ${data.scopeLabel.toUpperCase()}`, pageWidth - marginX, 17.8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Dicetak: ${tglCetak} (${jamCetak} WIB) · ${data.totalCatatanKerja} Inputan Kerja · ${data.slips.length} Slip Cair`,
    pageWidth - marginX,
    21.6,
    { align: 'right' }
  );

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.55);
  doc.line(marginX, 25.2, pageWidth - marginX, 25.2);

  // 2. Biodata Karyawan Banner
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.28);
  doc.roundedRect(marginX, 27.5, contentW, 13.5, 1.3, 1.3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`${kry.nama.toUpperCase()}  (${kry.nik})`, marginX + 3, 32);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Jabatan: ${kry.jabatan}  ·  Divisi Aktif: ${divAktif}  ·  Status: ${kry.status}  ·  Telp: ${kry.telepon || '-'}`,
    marginX + 3,
    36.3
  );
  doc.text(`Alamat: ${kry.alamat || '-'}`, marginX + 3, 39.8);

  const posisiLabel =
    kry.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
      ? `SISA HAK UPAH BERSIH: ${formatRupiah(Math.abs(kry.saldoBersih))}`
      : kry.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
      ? `SISA HUTANG BON: ${formatRupiah(Math.abs(kry.saldoBersih))}`
      : 'POSISI SAAT INI: IMPAS / LUNAS (Rp 0)';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(
    kry.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH' ? 5 : kry.posisiStatus === 'KARYAWAN_BERHUTANG_BON' ? 159 : 51,
    kry.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH' ? 120 : kry.posisiStatus === 'KARYAWAN_BERHUTANG_BON' ? 18 : 65,
    kry.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH' ? 80 : kry.posisiStatus === 'KARYAWAN_BERHUTANG_BON' ? 57 : 85
  );
  doc.text(posisiLabel, pageWidth - marginX - 3, 32, { align: 'right' });

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Realtime — Blm Cair: ${formatRupiah(kry.totalUpahBelumDibayar || 0)} | Uang Titip: ${formatRupiah(
      data.ringkasanUangTitip.saldoTitipAktif
    )} | Bon Aktif: ${formatRupiah(kry.totalBonKaryawan || 0)}`,
    pageWidth - marginX - 3,
    37.5,
    { align: 'right' }
  );

  // 3. Summary KPI Cards (4 cards or 5 cards when employee has Uang Titip / Hutang-Piutang)
  const cardY = 43.2;
  const cardGap = 2.6;
  const showTitipCard = data.hasPiutangHutangOrTitip;
  const cards = [
    {
      label: 'TOTAL UPAH TERCATAT (INPUTAN)',
      val: formatRupiah(data.totalUpahTercatat),
      sub: `${data.totalHariKerjaUnik} Hari Kerja (${data.totalCatatanKerja} Catatan)`,
      bg: [236, 253, 245] as [number, number, number],
      border: [5, 150, 105] as [number, number, number],
      color: [6, 95, 70] as [number, number, number],
    },
    {
      label: 'BELUM CAIR (PENDING BON)',
      val: formatRupiah(data.totalUpahBelumCair),
      sub: `${data.logs.filter(isLogBelumCair).length} Catatan Belum Dicairkan`,
      bg: [255, 251, 235] as [number, number, number],
      border: [217, 119, 6] as [number, number, number],
      color: [146, 64, 14] as [number, number, number],
    },
    {
      label: 'TOTAL GAJI CAIR BERSIH (SLIP)',
      val: formatRupiah(data.totalSlipBersihDibayar),
      sub: `${data.slips.length} Slip · Potong Bon ${formatRupiah(data.totalSlipPotongBon)}`,
      bg: [239, 246, 255] as [number, number, number],
      border: [37, 99, 235] as [number, number, number],
      color: [30, 64, 175] as [number, number, number],
    },
    ...(showTitipCard
      ? [
          {
            label: 'SISA UANG TITIP (HUTANG PT)',
            val: formatRupiah(data.ringkasanUangTitip.saldoTitipAktif),
            sub: `Masuk: ${formatRupiah(data.ringkasanUangTitip.totalTitipMasuk)} · Ambil: ${formatRupiah(
              data.ringkasanUangTitip.totalTitipDicairkan
            )}`,
            bg: [245, 243, 255] as [number, number, number],
            border: [124, 58, 237] as [number, number, number],
            color: [91, 33, 182] as [number, number, number],
          },
        ]
      : []),
    {
      label: 'SISA BON / PIUTANG AKTIF',
      val: formatRupiah(kry.totalBonKaryawan || 0),
      sub: `Uang: ${formatRupiah(kry.totalKasbonUang || 0)} · Brg: ${formatRupiah(kry.totalKasbonBarang || 0)}`,
      bg: [255, 241, 242] as [number, number, number],
      border: [225, 29, 72] as [number, number, number],
      color: [159, 18, 57] as [number, number, number],
    },
  ];
  const cardW = (contentW - cardGap * (cards.length - 1)) / cards.length;

  cards.forEach((c, idx) => {
    const x = marginX + idx * (cardW + cardGap);
    doc.setFillColor(...c.bg);
    doc.setDrawColor(...c.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, 13, 1.3, 1.3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(cards.length > 4 ? 5.3 : 5.9);
    doc.setTextColor(...c.color);
    doc.text(c.label, x + 2, cardY + 3.8);

    doc.setFont('courier', 'bold');
    doc.setFontSize(cards.length > 4 ? 7.8 : 8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(c.val, x + 2, cardY + 8.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(cards.length > 4 ? 5.1 : 5.7);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, x + cardW - 2, cardY + 11.6, { align: 'right' });
  });

  let cursorY = cardY + 17;

  const slipMap = new Map<string, TransaksiPenggajian>();
  (detail.riwayatGaji || []).forEach((s) => slipMap.set(s.id, s));

  // 4. Section I (UTAMA): Detail Input Pekerjaan & Upah Harian
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`I. DETAIL INPUT PEKERJAAN & UPAH HARIAN (${data.logs.length} CATATAN)`, marginX, cursorY);
  cursorY += 2.2;

  const jobHead = [
    'NO',
    'HARI & TANGGAL',
    'DIVISI',
    'ITEM PEKERJAAN',
    'QTY',
    'HARGA / TARIF',
    'LEMBUR / MKN',
    'TOTAL UPAH',
    'KET / STATUS',
    'KETERANGAN / CATATAN (ADMIN)',
  ];

  const jobBody =
    data.logs.length === 0
      ? [
          [
            {
              content: 'Tidak ada data input pekerjaan & upah harian pada cakupan filter yang dipilih.',
              colSpan: jobHead.length,
              styles: { halign: 'center' as const, fontStyle: 'italic' as const },
            },
          ],
        ]
      : data.logs.map((log, idx) => {
          const tglNorm = normalizeDateToDmy(log.tanggalKerja, log.tanggalKerja);
          const hariTgl = log.hariTanggal || formatHariTanggalLabel(tglNorm) || tglNorm;
          const qty = getLogQty(log);
          const harga = getLogHarga(log);
          const lembur = Number(log.uangMakanLembur || 0);
          const total = getLogTotal(log);
          const belumCair = isLogBelumCair(log);
          const linkedSlip = log.idPayrollSettlement ? slipMap.get(log.idPayrollSettlement) : undefined;
          return [
            String(idx + 1),
            `${hariTgl}\n(${tglNorm})`,
            log.divisiKode || log.divisi,
            buildLogJobDisplay(log),
            String(qty),
            harga > 0 ? formatRupiah(harga) : '-',
            lembur > 0 ? formatRupiah(lembur) : '-',
            total > 0 ? formatRupiah(total) : 'Rp 0',
            belumCair ? 'BON\n(BLM CAIR)' : 'LUNAS\n(CAIR)',
            buildLogCatatanDisplay(log, linkedSlip),
          ];
        });

  const jobFoot = [
    {
      content: `TOTAL UPAH HARIAN (${data.totalCatatanKerja} Catatan · ${data.totalHariKerjaUnik} Hari Kerja) :`,
      colSpan: 6,
      styles: { halign: 'right' as const, fontStyle: 'bold' as const },
    },
    {
      content: data.totalLemburMakan > 0 ? formatRupiah(data.totalLemburMakan) : '-',
      styles: { halign: 'right' as const, fontStyle: 'bold' as const },
    },
    {
      content: formatRupiah(data.totalUpahTercatat),
      styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [6, 95, 70] as [number, number, number] },
    },
    {
      content: `Blm Cair: ${formatRupiah(data.totalUpahBelumCair)}`,
      colSpan: 2,
      styles: { halign: 'center' as const, fontStyle: 'bold' as const },
    },
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [jobHead],
    body: jobBody as any,
    foot: data.logs.length > 0 ? [jobFoot] : undefined,
    theme: 'grid',
    styles: {
      fontSize: 6.6,
      cellPadding: 1.5,
      overflow: 'linebreak',
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.3,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineColor: [15, 23, 42],
      lineWidth: 0.28,
      fontSize: 6.6,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 26, font: 'courier' },
      2: { cellWidth: 22 },
      3: { cellWidth: 52 },
      4: { cellWidth: 10, halign: 'center', font: 'courier' },
      5: { cellWidth: 22, halign: 'right', font: 'courier' },
      6: { cellWidth: 20, halign: 'right', font: 'courier' },
      7: { cellWidth: 25, halign: 'right', font: 'courier', fontStyle: 'bold' },
      8: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      9: { cellWidth: 70 },
    },
    margin: { left: marginX, right: marginX, bottom: 16 },
  });

  cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 7;

  // 5. Section II: Riwayat Slip Pencairan Gaji
  if (cursorY + 26 > pageHeight - 16) {
    doc.addPage();
    cursorY = 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`II. RIWAYAT SLIP PENCAIRAN GAJI (${data.slips.length} SLIP)`, marginX, cursorY);
  cursorY += 2.2;

  const slipHead = [
    'NO',
    'NO. SLIP GAJI',
    'TGL CAIR',
    'PERIODE',
    'DIVISI PEMBAYAR',
    'GAJI KOTOR',
    'POTONGAN BON',
    'BERSIH DIBAYAR',
    'REKENING & METODE',
    'KETERANGAN',
  ];

  const slipBody =
    data.slips.length === 0
      ? [
          [
            {
              content: 'Belum ada slip gaji yang dicairkan pada cakupan filter ini.',
              colSpan: slipHead.length,
              styles: { halign: 'center' as const, fontStyle: 'italic' as const },
            },
          ],
        ]
      : data.slips.map((g, idx) => [
          String(idx + 1),
          g.slipNomor,
          `${g.tanggal}\n${g.jam || ''}`.trim(),
          g.periodeBulan || '-',
          `${g.divisi}\n[${g.tipeGaji || 'HARIAN'}]`,
          formatRupiah(g.totalGajiKotor || 0),
          g.potonganKasbon > 0 ? `-${formatRupiah(g.potonganKasbon)} (${g.persentasePotongKasbon}%)` : 'Rp 0',
          formatRupiah(g.gajiBersihDibayar || 0),
          `${g.rekeningSumber} (${g.metodePembayaran})`,
          g.keterangan || '-',
        ]);

  const slipFoot = [
    {
      content: `TOTAL PENCAIRAN SLIP GAJI (${data.slips.length} SLIP) :`,
      colSpan: 5,
      styles: { halign: 'right' as const, fontStyle: 'bold' as const },
    },
    {
      content: formatRupiah(data.totalSlipGajiKotor),
      styles: { halign: 'right' as const, fontStyle: 'bold' as const },
    },
    {
      content: `-${formatRupiah(data.totalSlipPotongBon)}`,
      styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [159, 18, 57] as [number, number, number] },
    },
    {
      content: formatRupiah(data.totalSlipBersihDibayar),
      styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [6, 95, 70] as [number, number, number] },
    },
    {
      content: '',
      colSpan: 2,
    },
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [slipHead],
    body: slipBody as any,
    foot: data.slips.length > 0 ? [slipFoot] : undefined,
    theme: 'grid',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.5,
      overflow: 'linebreak',
      lineColor: [203, 213, 225],
      lineWidth: 0.18,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.2,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineColor: [30, 41, 59],
      lineWidth: 0.25,
      fontSize: 6.5,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 32, font: 'courier', fontStyle: 'bold' },
      2: { cellWidth: 22, font: 'courier' },
      3: { cellWidth: 27 },
      4: { cellWidth: 31 },
      5: { cellWidth: 25, halign: 'right', font: 'courier' },
      6: { cellWidth: 28, halign: 'right', font: 'courier', textColor: [159, 18, 57] },
      7: { cellWidth: 28, halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [6, 95, 70] },
      8: { cellWidth: 28 },
      9: { cellWidth: 46 },
    },
    margin: { left: marginX, right: marginX, bottom: 16 },
  });

  cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 7;

  // 6. Section III: Detail Uang Titip (Hutang PT / Titipan Sisa Gaji & Pengambilan) when employee has titip, hutang, or piutang
  if (data.hasPiutangHutangOrTitip) {
    if (cursorY + 32 > pageHeight - 16) {
      doc.addPage();
      cursorY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(91, 33, 182);
    doc.text(
      `III. DETAIL UANG TITIP (HUTANG PT / TITIPAN SISA GAJI) & PENGAMBILAN (${data.uangTitipDisplay.length} MUTASI)`,
      marginX,
      cursorY
    );
    cursorY += 2.4;

    // Summary strip for Uang Titip vs Piutang/Bon
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(167, 139, 250);
    doc.setLineWidth(0.28);
    doc.roundedRect(marginX, cursorY, contentW, 8.5, 1.1, 1.1, 'FD');

    doc.setFont('courier', 'bold');
    doc.setFontSize(6.7);
    doc.setTextColor(76, 29, 149);
    const titipSummaryLine = [
      `Titip Masuk: ${formatRupiah(data.ringkasanUangTitip.totalTitipMasuk)}`,
      `Diambil/Kliring: ${formatRupiah(data.ringkasanUangTitip.totalTitipDicairkan)}`,
      `Sisa Saldo Titip: ${formatRupiah(data.ringkasanUangTitip.saldoTitipAktif)}`,
      `Bon/Piutang Aktif: ${formatRupiah(data.ringkasanUangTitip.totalBonAktif)}`,
      `Net Terpadu (Upah+Titip-Bon): ${
        data.ringkasanUangTitip.saldoBersihTerpadu < 0 ? '-' : '+'
      }${formatRupiah(Math.abs(data.ringkasanUangTitip.saldoBersihTerpadu))}`,
    ].join('  |  ');
    doc.text(titipSummaryLine, marginX + 2.8, cursorY + 5.4);
    cursorY += 10.5;

    const titipHead = [
      'NO',
      'TANGGAL',
      'ID REF',
      'KATEGORI / JENIS',
      'URAIAN & KETERANGAN UANG TITIP',
      'METODE / REK',
      'TITIP MASUK (+)',
      'AMBIL / KLIRING (-)',
      'SALDO TITIP',
    ];

    const titipBody =
      data.uangTitipDisplay.length === 0
        ? [
            [
              {
                content:
                  'Saldo Uang Titip = Rp 0 (Belum ada setoran/titipan sisa gaji, tercatat hutang/piutang kasbon aktif).',
                colSpan: titipHead.length,
                styles: { halign: 'center' as const, fontStyle: 'italic' as const },
              },
            ],
          ]
        : data.uangTitipDisplay.map((t, idx) => [
            String(idx + 1),
            `${t.tanggal}\n${t.jam || ''}`.trim(),
            t.id,
            t.judul,
            `${t.keterangan}${t.noReferensi ? ` [Ref: ${t.noReferensi}]` : ''}`,
            `${t.metode}\n(${t.rekeningKode})`,
            t.nominalMasuk > 0 ? `+${formatRupiah(t.nominalMasuk)}` : '-',
            t.nominalKeluar > 0 ? `-${formatRupiah(t.nominalKeluar)}` : '-',
            formatRupiah(t.saldoTitipSetelah),
          ]);

    autoTable(doc, {
      startY: cursorY,
      head: [titipHead],
      body: titipBody as any,
      theme: 'grid',
      styles: {
        fontSize: 6.4,
        cellPadding: 1.4,
        overflow: 'linebreak',
        lineColor: [221, 214, 254],
        lineWidth: 0.18,
      },
      headStyles: {
        fillColor: [91, 33, 182],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.1,
      },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 21, font: 'courier' },
        2: { cellWidth: 26, font: 'courier' },
        3: { cellWidth: 42, fontStyle: 'bold' },
        4: { cellWidth: 77 },
        5: { cellWidth: 24, halign: 'center' },
        6: { cellWidth: 25, halign: 'right', font: 'courier', textColor: [6, 95, 70], fontStyle: 'bold' },
        7: { cellWidth: 26, halign: 'right', font: 'courier', textColor: [180, 83, 9], fontStyle: 'bold' },
        8: { cellWidth: 26, halign: 'right', font: 'courier', fontStyle: 'bold' },
      },
      margin: { left: marginX, right: marginX, bottom: 16 },
    });

    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 7;
  }

  // 7. Section IV: Rincian Bon (Barang + Uang) & Pelunasan Bon if any
  const hasAnyBonHistory =
    data.kasbonBarang.length > 0 || data.kasbonUang.length > 0 || data.bayarBon.length > 0;
  if (hasAnyBonHistory) {
    if (cursorY + 26 > pageHeight - 16) {
      doc.addPage();
      cursorY = 14;
    }

    const bonSectionRoman = data.hasPiutangHutangOrTitip ? 'IV' : 'III';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`${bonSectionRoman}. RINCIAN KASBON & PEMBAYARAN / POTONGAN BON`, marginX, cursorY);
    cursorY += 2.2;

    const bonHead = ['NO', 'TANGGAL', 'JENIS', 'NO. NOTA / REF', 'URAIAN ITEM / KETERANGAN', 'NOMINAL', 'SISA BON', 'STATUS'];
    const bonBody: string[][] = [];

    data.kasbonBarang.forEach((b) => {
      const itemsStr = (b.items || [])
        .map((it: any) => `${it.namaProduk || it.nama} (${it.qty} ${it.satuan})`)
        .join(', ');
      bonBody.push([
        String(bonBody.length + 1),
        b.tanggal || '-',
        'BON BARANG',
        b.noPenjualan,
        itemsStr || b.keterangan || '-',
        formatRupiah(b.totalNominal || 0),
        formatRupiah(b.sisaPiutang || 0),
        b.statusPembayaran || '-',
      ]);
    });

    data.kasbonUang.forEach((u) => {
      bonBody.push([
        String(bonBody.length + 1),
        u.tanggal || '-',
        'BON UANG',
        u.idTransaksi,
        `${u.keterangan || '-'} (${u.rekeningSumber} · ${u.metode})`,
        formatRupiah(u.nominal || 0),
        formatRupiah(u.sisaKasbon || 0),
        u.status || '-',
      ]);
    });

    data.bayarBon.forEach((p) => {
      bonBody.push([
        String(bonBody.length + 1),
        p.tanggal || '-',
        'BAYAR/POTONG BON',
        p.idTransaksi,
        `${p.keterangan || '-'} (${p.metode} -> ${p.rekeningTujuan})`,
        `-${formatRupiah(p.nominalBayar || 0)}`,
        formatRupiah(p.sisaBonSetelah || 0),
        'TERPOTONG/LUNAS',
      ]);
    });

    autoTable(doc, {
      startY: cursorY,
      head: [bonHead],
      body: bonBody,
      theme: 'grid',
      styles: {
        fontSize: 6.4,
        cellPadding: 1.4,
        overflow: 'linebreak',
        lineColor: [203, 213, 225],
        lineWidth: 0.18,
      },
      headStyles: {
        fillColor: [136, 19, 55],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 6.1,
      },
      alternateRowStyles: { fillColor: [255, 241, 242] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 21, font: 'courier' },
        2: { cellWidth: 25, fontStyle: 'bold' },
        3: { cellWidth: 28, font: 'courier' },
        4: { cellWidth: 112 },
        5: { cellWidth: 28, halign: 'right', font: 'courier', fontStyle: 'bold' },
        6: { cellWidth: 28, halign: 'right', font: 'courier' },
        7: { cellWidth: 25, halign: 'center' },
      },
      margin: { left: marginX, right: marginX, bottom: 16 },
    });

    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 7;
  }

  // 7. Signature Block
  if (cursorY + 26 > pageHeight - 12) {
    doc.addPage();
    cursorY = 18;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Disiapkan Oleh (Kasir / Payroll),', marginX + 30, cursorY, { align: 'center' });
  doc.text('Diterima / Disetujui Oleh (Karyawan),', pageWidth - marginX - 34, cursorY, { align: 'center' });

  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.3);
  doc.line(marginX + 6, cursorY + 15, marginX + 54, cursorY + 15);
  doc.line(pageWidth - marginX - 58, cursorY + 15, pageWidth - marginX - 10, cursorY + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(profil.penanggungJawab.toUpperCase(), marginX + 30, cursorY + 19, { align: 'center' });
  doc.text(kry.nama.toUpperCase(), pageWidth - marginX - 34, cursorY + 19, { align: 'center' });

  // Page footer numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${profil.namaPerusahaan} · History Penggajian ${kry.nama} (${kry.nik}) · ${data.scopeLabel} · Hal ${p} / ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const safeNama = sanitizeFilenamePart(kry.nama);
  const safeNik = sanitizeFilenamePart(kry.nik);
  const fileName = `History_Penggajian_${safeNik}_${safeNama}_${data.periodeFileSlug}_${getFileDateStamp()}.pdf`;
  doc.save(fileName);

  return { fileName, totalLogs: data.logs.length, totalSlips: data.slips.length };
}

/**
 * 3. EXPORT IMAGE (.jpg / .png) — High-DPI HTML5 Canvas Document for WhatsApp & Archive
 */
function loadHtmlImage(src: string, timeoutMs = 4500): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);
    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    };
    img.src = src;
  });
}

async function loadSafeCanvasImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return loadHtmlImage(url);
  const dataUrl = await loadLogoDataUrl(url);
  if (dataUrl) return loadHtmlImage(dataUrl);
  return null;
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  font: string
): string[] {
  ctx.font = font;
  const paragraphs = String(text || '-').split(/\r?\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (ctx.measureText(word).width > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width <= maxWidth) {
              chunk += ch;
            } else {
              if (chunk) lines.push(chunk);
              chunk = ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : ['-'];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle?: string,
  strokeStyle?: string,
  lineWidth = 1
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  if (fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fill();
  }
  if (strokeStyle) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

async function canvasToBlobAndDownload(
  canvas: HTMLCanvasElement,
  format: 'jpg' | 'png',
  filename: string
): Promise<void> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality = format === 'png' ? undefined : 0.94;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Canvas gagal dikonversi menjadi gambar.'));
      },
      mime,
      quality
    );
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface PreparedCanvasLogRow {
  noText: string;
  hariTanggal: string;
  tglIso: string;
  divisi: string;
  itemLines: string[];
  qtyText: string;
  hargaText: string;
  lemburText: string;
  totalText: string;
  statusText: string;
  isBon: boolean;
  catatanLines: string[];
  rowHeight: number;
}

export async function exportHistoryGajiKaryawanToImage(
  detail: DetailHarianKaryawanResponse,
  profilPerusahaan?: ProfilPerusahaan | null,
  options: { format: 'jpg' | 'png'; filter?: ExportHistoryGajiFilter } = { format: 'jpg' }
): Promise<{ filenames: string[]; pageCount: number }> {
  const format = options.format || 'jpg';
  const data = prepareHistoryGajiData(detail, options.filter);
  const profil = resolveProfilPerusahaan(profilPerusahaan);
  const kry = data.karyawan;
  const divAktif = kry.divisi || kry.departemen || kry.divisiTerakhir || '-';

  const LOGICAL_WIDTH = 1280;
  const MARGIN_X = 48;
  const CONTENT_WIDTH = LOGICAL_WIDTH - MARGIN_X * 2; // 1184

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const noDokumen = `HG/${kry.nik}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}/${data.logs.length}`;

  const cols = [
    { key: 'no', label: 'NO', width: 42, align: 'center' as const },
    { key: 'tanggal', label: 'HARI & TANGGAL', width: 146, align: 'left' as const },
    { key: 'divisi', label: 'DIVISI', width: 116, align: 'left' as const },
    { key: 'item', label: 'ITEM PEKERJAAN', width: 220, align: 'left' as const },
    { key: 'qty', label: 'QTY', width: 54, align: 'center' as const },
    { key: 'harga', label: 'TARIF', width: 108, align: 'right' as const },
    { key: 'total', label: 'TOTAL UPAH', width: 124, align: 'right' as const },
    { key: 'status', label: 'KET', width: 78, align: 'center' as const },
    { key: 'catatan', label: 'KETERANGAN / CATATAN', width: 296, align: 'left' as const },
  ];

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 10;
  measureCanvas.height = 10;
  const mCtx = measureCanvas.getContext('2d')!;

  const slipMap = new Map<string, TransaksiPenggajian>();
  (detail.riwayatGaji || []).forEach((s) => slipMap.set(s.id, s));

  const ITEM_FONT = `600 13px ${SANS_FONT}`;
  const CATATAN_FONT = `500 12px ${SANS_FONT}`;
  const LINE_H = 18;
  const CELL_PAD_Y = 11;

  const preparedLogRows: PreparedCanvasLogRow[] =
    data.logs.length === 0
      ? [
          {
            noText: '-',
            hariTanggal: '-',
            tglIso: '',
            divisi: '-',
            itemLines: ['Tidak ada catatan pekerjaan harian pada cakupan filter ini'],
            qtyText: '-',
            hargaText: '-',
            lemburText: '',
            totalText: '-',
            statusText: '-',
            isBon: false,
            catatanLines: ['-'],
            rowHeight: 50,
          },
        ]
      : data.logs.map((log, idx) => {
          const tglNorm = normalizeDateToDmy(log.tanggalKerja, log.tanggalKerja);
          const hariTgl = log.hariTanggal || formatHariTanggalLabel(tglNorm) || tglNorm;
          const linkedSlip = log.idPayrollSettlement ? slipMap.get(log.idPayrollSettlement) : undefined;
          const itemLines = wrapTextLines(mCtx, buildLogJobDisplay(log), cols[3].width - 18, ITEM_FONT);
          const catatanLines = wrapTextLines(
            mCtx,
            buildLogCatatanDisplay(log, linkedSlip),
            cols[8].width - 16,
            CATATAN_FONT
          );
          const qty = getLogQty(log);
          const harga = getLogHarga(log);
          const lembur = Number(log.uangMakanLembur || 0);
          const total = getLogTotal(log);
          const isBon = isLogBelumCair(log);
          const lineCount = Math.max(itemLines.length, catatanLines.length, 2);
          const rowHeight = Math.max(44, lineCount * LINE_H + CELL_PAD_Y * 2);

          return {
            noText: String(idx + 1),
            hariTanggal: hariTgl,
            tglIso: tglNorm,
            divisi: log.divisiKode || log.divisi,
            itemLines,
            qtyText: String(qty),
            hargaText: harga > 0 ? formatRupiah(harga) : '-',
            lemburText: lembur > 0 ? `+${formatRupiah(lembur)}` : '',
            totalText: total > 0 ? formatRupiah(total) : 'Rp 0',
            statusText: isBon ? 'BON' : 'LUNAS',
            isBon,
            catatanLines,
            rowHeight,
          };
        });

  const preparedTitipCanvasRows = data.uangTitipDisplay.map((t, idx) => {
    const uraianText = `${t.judul}${t.keterangan ? ` — ${t.keterangan}` : ''}${
      t.noReferensi ? ` [Ref: ${t.noReferensi}]` : ''
    }`;
    const uraianLines = wrapTextLines(mCtx, uraianText, 412, `500 11.5px ${SANS_FONT}`);
    const rowHeight = Math.max(40, uraianLines.length * 17 + 16);
    return {
      noText: String(idx + 1),
      tanggal: t.tanggal,
      jam: t.jam || '',
      refId: t.id,
      uraianLines,
      metodeRek: `${t.metode} (${t.rekeningKode})`,
      masukText: t.nominalMasuk > 0 ? `+${formatRupiah(t.nominalMasuk)}` : '-',
      keluarText: t.nominalKeluar > 0 ? `-${formatRupiah(t.nominalKeluar)}` : '-',
      saldoText: formatRupiah(t.saldoTitipSetelah),
      rowHeight,
    };
  });

  const logoImg = await loadSafeCanvasImage(profil.logoUrl || DEFAULT_PT_LOGO_URL);

  // Split logs across logical pages (~6400 max content height per image)
  const HEADER_BLOCK_H = 335;
  const TABLE_HEAD_H = 40;
  const TABLE_FOOT_H = 44;
  const SLIPS_SECTION_H = data.slips.length > 0 ? 78 + data.slips.length * 38 + 44 : 74;
  const TITIP_SECTION_H = data.hasPiutangHutangOrTitip
    ? 96 +
      (preparedTitipCanvasRows.length > 0
        ? 36 + preparedTitipCanvasRows.reduce((s, r) => s + r.rowHeight, 0) + 24
        : 58)
    : 0;
  const BON_SECTION_H =
    data.kasbonBarang.length + data.kasbonUang.length + data.bayarBon.length > 0 ? 110 : 0;
  const FOOTER_SIGN_H = 148;
  const MAX_PAGE_H = 6500;

  const pageChunks: PreparedCanvasLogRow[][] = [];
  let curr: PreparedCanvasLogRow[] = [];
  let acc = HEADER_BLOCK_H + TABLE_HEAD_H + TABLE_FOOT_H;

  for (const row of preparedLogRows) {
    if (curr.length > 0 && acc + row.rowHeight > MAX_PAGE_H) {
      pageChunks.push(curr);
      curr = [row];
      acc = 110 + TABLE_HEAD_H + row.rowHeight;
    } else {
      curr.push(row);
      acc += row.rowHeight;
    }
  }
  if (curr.length > 0 || pageChunks.length === 0) {
    pageChunks.push(curr);
  }

  const totalPages = pageChunks.length;
  const safeNama = sanitizeFilenamePart(kry.nama);
  const safeNik = sanitizeFilenamePart(kry.nik);
  const ext = format === 'png' ? 'png' : 'jpg';
  const downloadedFilenames: string[] = [];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const chunk = pageChunks[pIdx];
    const isFirstPage = pIdx === 0;
    const isLastPage = pIdx === totalPages - 1;

    const topH = isFirstPage ? HEADER_BLOCK_H : 112;
    const rowsH = chunk.reduce((s, r) => s + r.rowHeight, 0);
    const footH = isLastPage ? TABLE_FOOT_H : 0;
    const extraSectionsH = isLastPage
      ? SLIPS_SECTION_H + TITIP_SECTION_H + BON_SECTION_H + FOOTER_SIGN_H
      : 60;
    const totalLogicalH = topH + TABLE_HEAD_H + rowsH + footH + extraSectionsH + 40;

    const scale = totalLogicalH * 2 <= 15500 ? 2 : totalLogicalH * 1.5 <= 15500 ? 1.5 : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(LOGICAL_WIDTH * scale);
    canvas.height = Math.round(totalLogicalH * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, totalLogicalH);
    drawRoundedRect(ctx, 18, 18, LOGICAL_WIDTH - 36, totalLogicalH - 36, 10, '#ffffff', '#18181b', 2);

    let y = 42;

    if (isFirstPage) {
      // Kop Surat PT
      let textX = MARGIN_X;
      if (logoImg) {
        try {
          ctx.save();
          drawRoundedRect(ctx, MARGIN_X, y, 74, 74, 8, '#ffffff', '#cbd5e1', 1);
          ctx.clip();
          ctx.drawImage(logoImg, MARGIN_X, y, 74, 74);
          ctx.restore();
          textX = MARGIN_X + 90;
        } catch {
          textX = MARGIN_X;
        }
      } else {
        drawRoundedRect(ctx, MARGIN_X, y, 8, 74, 3, '#0f172a');
        textX = MARGIN_X + 20;
      }

      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 22px ${SANS_FONT}`;
      ctx.fillText(profil.namaPerusahaan.toUpperCase(), textX, y);

      ctx.fillStyle = '#374151';
      ctx.font = `600 12.5px ${SANS_FONT}`;
      const addrLines = wrapTextLines(ctx, profil.alamat, 640, `600 12.5px ${SANS_FONT}`);
      addrLines.slice(0, 2).forEach((ln, idx) => {
        ctx.fillText(ln, textX, y + 29 + idx * 16);
      });

      ctx.fillStyle = '#1e293b';
      ctx.font = `700 11.5px ${MONO_FONT}`;
      ctx.fillText(profil.telepon, textX, y + 61);

      // Right Document Box
      const rightBoxW = 340;
      const rightBoxX = MARGIN_X + CONTENT_WIDTH - rightBoxW;
      drawRoundedRect(ctx, rightBoxX, y, rightBoxW, 92, 8, '#f8fafc', '#18181b', 1.5);

      ctx.fillStyle = '#0f172a';
      ctx.font = `900 12.5px ${SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('DETAIL HISTORY PENGGAJIAN', rightBoxX + rightBoxW / 2, y + 10);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rightBoxX + 12, y + 29);
      ctx.lineTo(rightBoxX + rightBoxW - 12, y + 29);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = `600 11px ${MONO_FONT}`;
      ctx.fillStyle = '#475569';
      ctx.fillText('No. Dok :', rightBoxX + 14, y + 37);
      ctx.fillText('Dicetak :', rightBoxX + 14, y + 54);
      ctx.fillText('Cakupan :', rightBoxX + 14, y + 71);

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 11px ${MONO_FONT}`;
      ctx.fillText(noDokumen, rightBoxX + 86, y + 37);
      ctx.fillText(`${tglCetak} · ${jamCetak}`, rightBoxX + 86, y + 54);
      ctx.fillStyle = '#065f46';
      const truncScope = data.scopeLabel.length > 29 ? `${data.scopeLabel.slice(0, 28)}…` : data.scopeLabel;
      ctx.fillText(truncScope, rightBoxX + 86, y + 71);

      y += 106;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y);
      ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y);
      ctx.stroke();
      y += 16;

      // Biodata & Neraca Summary Boxes
      const leftW = 660;
      const rightW = CONTENT_WIDTH - leftW - 18;
      const rightX = MARGIN_X + leftW + 18;
      const subH = 128;

      drawRoundedRect(ctx, MARGIN_X, y, leftW, subH, 8, '#ffffff', '#94a3b8', 1.2);
      ctx.fillStyle = '#64748b';
      ctx.font = `800 11px ${SANS_FONT}`;
      ctx.fillText('IDENTITAS & PENUGASAN KARYAWAN :', MARGIN_X + 16, y + 12);

      const bioPairs: [string, string, boolean?][] = [
        ['NAMA / NIK', `: ${kry.nama.toUpperCase()} (${kry.nik})`, true],
        ['JABATAN', `: ${kry.jabatan} · Status: ${kry.status}`, false],
        ['DIVISI AKTIF', `: ${divAktif}`, true],
        ['ALAMAT / HP', `: ${kry.alamat || '-'} · Telp: ${kry.telepon || '-'}`, false],
      ];
      bioPairs.forEach(([lbl, val, isBold], idx) => {
        const lineY = y + 34 + idx * 22;
        ctx.fillStyle = '#475569';
        ctx.font = `700 11.5px ${SANS_FONT}`;
        ctx.fillText(lbl, MARGIN_X + 16, lineY);
        ctx.fillStyle = idx === 2 ? '#065f46' : '#0f172a';
        ctx.font = isBold ? `800 12.5px ${SANS_FONT}` : `500 12px ${SANS_FONT}`;
        const wrapped = wrapTextLines(ctx, val, leftW - 135, ctx.font);
        ctx.fillText(wrapped[0], MARGIN_X + 118, lineY);
      });

      drawRoundedRect(ctx, rightX, y, rightW, subH, 8, '#ecfdf5', '#065f46', 2);
      ctx.fillStyle = '#065f46';
      ctx.font = `900 11.5px ${SANS_FONT}`;
      ctx.fillText('RINGKASAN HAK UPAH & NERACA BERSIH :', rightX + 16, y + 12);

      ctx.fillStyle = '#0f172a';
      ctx.font = `900 22px ${MONO_FONT}`;
      ctx.fillText(formatRupiah(data.totalUpahTercatat), rightX + 16, y + 36);
      ctx.fillStyle = '#374151';
      ctx.font = `600 11px ${SANS_FONT}`;
      ctx.fillText(
        `Total Upah Inputan (${data.totalCatatanKerja} Catatan / ${data.totalHariKerjaUnik} Hari Kerja)`,
        rightX + 16,
        y + 65
      );

      ctx.strokeStyle = '#a7f3d0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rightX + 16, y + 86);
      ctx.lineTo(rightX + rightW - 16, y + 86);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 11px ${MONO_FONT}`;
      ctx.fillText(
        data.hasPiutangHutangOrTitip
          ? `Blm Cair: ${formatRupiah(data.totalUpahBelumCair)} | Titip: ${formatRupiah(
              data.ringkasanUangTitip.saldoTitipAktif
            )} | Bon: ${formatRupiah(kry.totalBonKaryawan || 0)}`
          : `Blm Cair: ${formatRupiah(data.totalUpahBelumCair)} | Bon Aktif: ${formatRupiah(
              kry.totalBonKaryawan || 0
            )}`,
        rightX + 16,
        y + 96
      );

      y += subH + 22;

      ctx.fillStyle = '#0f172a';
      ctx.font = `900 13px ${SANS_FONT}`;
      ctx.fillText(`I. DETAIL INPUT PEKERJAAN & UPAH HARIAN (${data.logs.length} CATATAN)`, MARGIN_X, y);
      y += 22;
    } else {
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 16px ${SANS_FONT}`;
      ctx.fillText(
        `${profil.namaPerusahaan.toUpperCase()} — LANJUTAN HISTORY PENGGAJIAN (Hal ${pIdx + 1}/${totalPages})`,
        MARGIN_X,
        y
      );
      ctx.fillStyle = '#475569';
      ctx.font = `600 12.5px ${SANS_FONT}`;
      ctx.fillText(`Karyawan: ${kry.nama} (${kry.nik}) · ${data.scopeLabel}`, MARGIN_X, y + 24);
      y += 52;
    }

    // Table Header
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, TABLE_HEAD_H, 6, '#0f172a');
    let colX = MARGIN_X;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 11.5px ${SANS_FONT}`;
    ctx.textBaseline = 'middle';
    cols.forEach((col) => {
      ctx.textAlign = col.align;
      const drawX =
        col.align === 'center'
          ? colX + col.width / 2
          : col.align === 'right'
          ? colX + col.width - 10
          : colX + 10;
      ctx.fillText(col.label, drawX, y + TABLE_HEAD_H / 2);
      colX += col.width;
    });
    y += TABLE_HEAD_H;
    ctx.textBaseline = 'top';

    // Table Rows
    chunk.forEach((row, rIdx) => {
      ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, row.rowHeight);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y + row.rowHeight);
      ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y + row.rowHeight);
      ctx.stroke();

      let cx = MARGIN_X;
      cols.forEach((col, cIdx) => {
        if (cIdx > 0) {
          ctx.strokeStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.lineTo(cx, y + row.rowHeight);
          ctx.stroke();
        }

        const cellTop = y + CELL_PAD_Y;

        if (col.key === 'no') {
          ctx.fillStyle = '#334155';
          ctx.font = `700 12px ${MONO_FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(row.noText, cx + col.width / 2, cellTop);
        } else if (col.key === 'tanggal') {
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 12px ${MONO_FONT}`;
          ctx.textAlign = 'left';
          ctx.fillText(row.hariTanggal, cx + 10, cellTop);
          if (row.tglIso) {
            ctx.fillStyle = '#64748b';
            ctx.font = `500 10.5px ${MONO_FONT}`;
            ctx.fillText(row.tglIso, cx + 10, cellTop + 17);
          }
        } else if (col.key === 'divisi') {
          ctx.fillStyle = '#1e293b';
          ctx.font = `700 11.5px ${SANS_FONT}`;
          ctx.textAlign = 'left';
          const divLines = wrapTextLines(ctx, row.divisi, col.width - 16, ctx.font);
          divLines.slice(0, 2).forEach((ln, lIdx) => {
            ctx.fillText(ln, cx + 8, cellTop + lIdx * 16);
          });
        } else if (col.key === 'item') {
          ctx.fillStyle = '#0f172a';
          ctx.font = ITEM_FONT;
          ctx.textAlign = 'left';
          row.itemLines.forEach((ln, lIdx) => {
            ctx.fillText(ln, cx + 10, cellTop + lIdx * LINE_H);
          });
        } else if (col.key === 'qty') {
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 12.5px ${MONO_FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(row.qtyText, cx + col.width / 2, cellTop);
        } else if (col.key === 'harga') {
          ctx.fillStyle = '#334155';
          ctx.font = `600 12px ${MONO_FONT}`;
          ctx.textAlign = 'right';
          ctx.fillText(row.hargaText, cx + col.width - 10, cellTop);
          if (row.lemburText) {
            ctx.fillStyle = '#b45309';
            ctx.font = `600 10.5px ${MONO_FONT}`;
            ctx.fillText(row.lemburText, cx + col.width - 10, cellTop + 17);
          }
        } else if (col.key === 'total') {
          ctx.fillStyle = '#065f46';
          ctx.font = `800 12.5px ${MONO_FONT}`;
          ctx.textAlign = 'right';
          ctx.fillText(row.totalText, cx + col.width - 10, cellTop);
        } else if (col.key === 'status') {
          ctx.textAlign = 'center';
          if (row.statusText === '-') {
            ctx.fillStyle = '#94a3b8';
            ctx.font = `600 12px ${SANS_FONT}`;
            ctx.fillText('-', cx + col.width / 2, cellTop);
          } else {
            const pillBg = row.isBon ? '#fef3c7' : '#e0f2fe';
            const pillBorder = row.isBon ? '#f59e0b' : '#0284c7';
            const pillText = row.isBon ? '#92400e' : '#0369a1';
            drawRoundedRect(ctx, cx + 11, cellTop - 2, col.width - 22, 22, 4, pillBg, pillBorder, 1);
            ctx.fillStyle = pillText;
            ctx.font = `800 10.5px ${SANS_FONT}`;
            ctx.fillText(row.statusText, cx + col.width / 2, cellTop + 3);
          }
        } else if (col.key === 'catatan') {
          ctx.fillStyle = '#334155';
          ctx.font = CATATAN_FONT;
          ctx.textAlign = 'left';
          row.catatanLines.forEach((ln, lIdx) => {
            ctx.fillText(ln, cx + 8, cellTop + lIdx * LINE_H);
          });
        }

        cx += col.width;
      });

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y);
      ctx.lineTo(MARGIN_X, y + row.rowHeight);
      ctx.moveTo(MARGIN_X + CONTENT_WIDTH, y);
      ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y + row.rowHeight);
      ctx.stroke();

      y += row.rowHeight;
    });

    if (isLastPage) {
      // Table Footer Totals
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, TABLE_FOOT_H);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, TABLE_FOOT_H);

      const firstSixWidth = cols.slice(0, 6).reduce((s, c) => s + c.width, 0);
      const totalColEnd = MARGIN_X + firstSixWidth + cols[6].width;

      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12px ${SANS_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(
        `TOTAL UPAH INPUTAN (${data.totalCatatanKerja} Catatan) :`,
        MARGIN_X + firstSixWidth - 14,
        y + TABLE_FOOT_H / 2
      );

      ctx.fillStyle = '#065f46';
      ctx.font = `900 13.5px ${MONO_FONT}`;
      ctx.fillText(formatRupiah(data.totalUpahTercatat), totalColEnd - 10, y + TABLE_FOOT_H / 2);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#92400e';
      ctx.font = `800 11.5px ${MONO_FONT}`;
      ctx.fillText(
        `Blm Cair: ${formatRupiah(data.totalUpahBelumCair)}`,
        totalColEnd + 12,
        y + TABLE_FOOT_H / 2
      );

      y += TABLE_FOOT_H + 22;

      // Section II: Slip Gaji Cair Summary Table on canvas
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 13px ${SANS_FONT}`;
      ctx.fillText(`II. RIWAYAT SLIP PENCAIRAN GAJI (${data.slips.length} SLIP)`, MARGIN_X, y);
      y += 22;

      if (data.slips.length === 0) {
        drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 42, 6, '#f8fafc', '#cbd5e1', 1);
        ctx.fillStyle = '#64748b';
        ctx.font = `600 12px ${SANS_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText('Belum ada slip gaji yang dicairkan pada cakupan filter ini.', MARGIN_X + CONTENT_WIDTH / 2, y + 14);
        y += 58;
      } else {
        const slipCols = [
          { label: 'NO. SLIP', width: 210, align: 'left' as const },
          { label: 'TANGGAL CAIR', width: 120, align: 'left' as const },
          { label: 'PERIODE & DIVISI', width: 270, align: 'left' as const },
          { label: 'GAJI KOTOR', width: 145, align: 'right' as const },
          { label: 'POTONG BON', width: 145, align: 'right' as const },
          { label: 'BERSIH DIBAYAR', width: 160, align: 'right' as const },
          { label: 'REKENING', width: 134, align: 'center' as const },
        ];

        drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 34, 5, '#1e293b');
        let sx = MARGIN_X;
        ctx.fillStyle = '#ffffff';
        ctx.font = `800 11px ${SANS_FONT}`;
        ctx.textBaseline = 'middle';
        slipCols.forEach((sc) => {
          ctx.textAlign = sc.align;
          const dx =
            sc.align === 'center' ? sx + sc.width / 2 : sc.align === 'right' ? sx + sc.width - 10 : sx + 10;
          ctx.fillText(sc.label, dx, y + 17);
          sx += sc.width;
        });
        y += 34;

        ctx.textBaseline = 'middle';
        data.slips.forEach((g, idx) => {
          const rowH = 38;
          ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, rowH);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1;
          ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, rowH);

          let x = MARGIN_X;
          const midY = y + rowH / 2;

          ctx.textAlign = 'left';
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 11.5px ${MONO_FONT}`;
          ctx.fillText(g.slipNomor, x + 10, midY);
          x += slipCols[0].width;

          ctx.font = `600 11.5px ${MONO_FONT}`;
          ctx.fillText(g.tanggal, x + 10, midY);
          x += slipCols[1].width;

          ctx.font = `600 11.5px ${SANS_FONT}`;
          const perDiv = `${g.periodeBulan || '-'} · ${g.divisi}`;
          ctx.fillText(perDiv.length > 34 ? `${perDiv.slice(0, 33)}…` : perDiv, x + 10, midY);
          x += slipCols[2].width;

          ctx.textAlign = 'right';
          ctx.font = `600 12px ${MONO_FONT}`;
          ctx.fillStyle = '#334155';
          ctx.fillText(formatRupiah(g.totalGajiKotor || 0), x + slipCols[3].width - 10, midY);
          x += slipCols[3].width;

          ctx.fillStyle = '#9f1239';
          ctx.fillText(g.potonganKasbon > 0 ? `-${formatRupiah(g.potonganKasbon)}` : 'Rp 0', x + slipCols[4].width - 10, midY);
          x += slipCols[4].width;

          ctx.fillStyle = '#065f46';
          ctx.font = `800 12px ${MONO_FONT}`;
          ctx.fillText(formatRupiah(g.gajiBersihDibayar || 0), x + slipCols[5].width - 10, midY);
          x += slipCols[5].width;

          ctx.textAlign = 'center';
          ctx.fillStyle = '#1e293b';
          ctx.font = `700 11px ${MONO_FONT}`;
          ctx.fillText(`${g.rekeningSumber}`, x + slipCols[6].width / 2, midY);

          y += rowH;
        });

        // Slip totals bar
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, 38);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, 38);
        const midY = y + 19;
        const leftSlipSpan = slipCols[0].width + slipCols[1].width + slipCols[2].width;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#0f172a';
        ctx.font = `800 11.5px ${SANS_FONT}`;
        ctx.fillText('TOTAL SLIP GAJI CAIR :', MARGIN_X + leftSlipSpan - 12, midY);

        ctx.font = `800 12px ${MONO_FONT}`;
        ctx.fillText(formatRupiah(data.totalSlipGajiKotor), MARGIN_X + leftSlipSpan + slipCols[3].width - 10, midY);
        ctx.fillStyle = '#9f1239';
        ctx.fillText(
          `-${formatRupiah(data.totalSlipPotongBon)}`,
          MARGIN_X + leftSlipSpan + slipCols[3].width + slipCols[4].width - 10,
          midY
        );
        ctx.fillStyle = '#065f46';
        ctx.fillText(
          formatRupiah(data.totalSlipBersihDibayar),
          MARGIN_X + leftSlipSpan + slipCols[3].width + slipCols[4].width + slipCols[5].width - 10,
          midY
        );

        y += 56;
      }

      // Section III: Detail Uang Titip & Pengambilan / Mutasi Hutang-Piutang (when relevant)
      if (TITIP_SECTION_H > 0) {
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5b21b6';
        ctx.font = `900 13px ${SANS_FONT}`;
        ctx.fillText(
          `III. DETAIL UANG TITIP (HUTANG PT / TITIPAN SISA GAJI) & PENGAMBILAN (${preparedTitipCanvasRows.length} MUTASI)`,
          MARGIN_X,
          y
        );
        y += 22;

        drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 54, 7, '#f5f3ff', '#c4b5fd', 1.2);
        ctx.fillStyle = '#4c1d95';
        ctx.font = `700 11.5px ${MONO_FONT}`;
        ctx.fillText(
          `Total Titip Masuk: ${formatRupiah(data.ringkasanUangTitip.totalTitipMasuk)}   |   Diambil / Kliring: ${formatRupiah(
            data.ringkasanUangTitip.totalTitipDicairkan
          )}   |   Sisa Uang Titip: ${formatRupiah(data.ringkasanUangTitip.saldoTitipAktif)}`,
          MARGIN_X + 14,
          y + 10
        );
        ctx.fillStyle = '#1e293b';
        ctx.font = `600 11px ${MONO_FONT}`;
        const terpaduPrefix = data.ringkasanUangTitip.saldoBersihTerpadu < 0 ? '-' : '+';
        ctx.fillText(
          `Bon / Piutang Aktif: ${formatRupiah(data.ringkasanUangTitip.totalBonAktif)}   |   Saldo Terpadu (Upah + Titip - Bon): ${terpaduPrefix}${formatRupiah(
            Math.abs(data.ringkasanUangTitip.saldoBersihTerpadu)
          )}`,
          MARGIN_X + 14,
          y + 31
        );
        y += 64;

        if (preparedTitipCanvasRows.length === 0) {
          drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 42, 6, '#faf5ff', '#d8b4fe', 1);
          ctx.fillStyle = '#6b21a8';
          ctx.font = `600 11.5px ${SANS_FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(
            'Saldo Uang Titip = Rp 0 (Tidak ada setoran uang titip; karyawan memiliki posisi bon/piutang aktif).',
            MARGIN_X + CONTENT_WIDTH / 2,
            y + 14
          );
          y += 58;
        } else {
          const titipCols = [
            { label: 'NO', width: 42, align: 'center' as const },
            { label: 'TANGGAL', width: 112, align: 'left' as const },
            { label: 'ID REF', width: 146, align: 'left' as const },
            { label: 'URAIAN & KETERANGAN UANG TITIP', width: 430, align: 'left' as const },
            { label: 'METODE', width: 110, align: 'center' as const },
            { label: 'TITIP MASUK (+)', width: 115, align: 'right' as const },
            { label: 'AMBIL / KLIRING (-)', width: 115, align: 'right' as const },
            { label: 'SALDO TITIP', width: 114, align: 'right' as const },
          ];

          drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 34, 5, '#5b21b6');
          let tx = MARGIN_X;
          ctx.fillStyle = '#ffffff';
          ctx.font = `800 10.5px ${SANS_FONT}`;
          ctx.textBaseline = 'middle';
          titipCols.forEach((tc) => {
            ctx.textAlign = tc.align;
            const dx =
              tc.align === 'center' ? tx + tc.width / 2 : tc.align === 'right' ? tx + tc.width - 10 : tx + 10;
            ctx.fillText(tc.label, dx, y + 17);
            tx += tc.width;
          });
          y += 34;
          ctx.textBaseline = 'top';

          preparedTitipCanvasRows.forEach((tr, rIdx) => {
            ctx.fillStyle = rIdx % 2 === 0 ? '#ffffff' : '#faf5ff';
            ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, tr.rowHeight);
            ctx.strokeStyle = '#ddd6fe';
            ctx.lineWidth = 1;
            ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, tr.rowHeight);

            let x = MARGIN_X;
            const cy = y + 9;

            ctx.textAlign = 'center';
            ctx.fillStyle = '#475569';
            ctx.font = `700 11px ${MONO_FONT}`;
            ctx.fillText(tr.noText, x + titipCols[0].width / 2, cy);
            x += titipCols[0].width;

            ctx.textAlign = 'left';
            ctx.fillStyle = '#0f172a';
            ctx.font = `700 11px ${MONO_FONT}`;
            ctx.fillText(tr.tanggal, x + 10, cy);
            x += titipCols[1].width;

            ctx.fillStyle = '#5b21b6';
            ctx.font = `700 10.5px ${MONO_FONT}`;
            ctx.fillText(tr.refId.length > 17 ? `${tr.refId.slice(0, 16)}…` : tr.refId, x + 8, cy);
            x += titipCols[2].width;

            ctx.fillStyle = '#1e293b';
            ctx.font = `500 11.5px ${SANS_FONT}`;
            tr.uraianLines.forEach((ln, lIdx) => {
              ctx.fillText(ln, x + 10, cy + lIdx * 17);
            });
            x += titipCols[3].width;

            ctx.textAlign = 'center';
            ctx.fillStyle = '#334155';
            ctx.font = `600 10px ${MONO_FONT}`;
            ctx.fillText(tr.metodeRek.length > 14 ? `${tr.metodeRek.slice(0, 13)}…` : tr.metodeRek, x + titipCols[4].width / 2, cy);
            x += titipCols[4].width;

            ctx.textAlign = 'right';
            ctx.fillStyle = tr.masukText !== '-' ? '#065f46' : '#94a3b8';
            ctx.font = `700 11px ${MONO_FONT}`;
            ctx.fillText(tr.masukText, x + titipCols[5].width - 10, cy);
            x += titipCols[5].width;

            ctx.fillStyle = tr.keluarText !== '-' ? '#b45309' : '#94a3b8';
            ctx.fillText(tr.keluarText, x + titipCols[6].width - 10, cy);
            x += titipCols[6].width;

            ctx.fillStyle = '#4c1d95';
            ctx.font = `800 11px ${MONO_FONT}`;
            ctx.fillText(tr.saldoText, x + titipCols[7].width - 10, cy);

            y += tr.rowHeight;
          });
          y += 22;
        }
      }

      // Optional Bon summary box
      if (BON_SECTION_H > 0) {
        const bonRoman = TITIP_SECTION_H > 0 ? 'IV' : 'III';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 88, 8, '#fff1f2', '#fda4af', 1.2);
        ctx.fillStyle = '#881337';
        ctx.font = `800 12px ${SANS_FONT}`;
        ctx.fillText(`${bonRoman}. RINGKASAN KASBON & POTONGAN BON`, MARGIN_X + 16, y + 12);

        ctx.fillStyle = '#1e293b';
        ctx.font = `600 12px ${MONO_FONT}`;
        ctx.fillText(
          `Bon Barang (${data.kasbonBarang.length} Nota): ${formatRupiah(data.totalBonBarangPeriode)}   |   Bon Uang (${
            data.kasbonUang.length
          } Trx): ${formatRupiah(data.totalBonUangPeriode)}   |   Bayar/Potong Bon (${data.bayarBon.length} Trx): ${formatRupiah(
            data.totalBayarBonPeriode
          )}`,
          MARGIN_X + 16,
          y + 36
        );
        ctx.fillStyle = '#9f1239';
        ctx.font = `700 12px ${MONO_FONT}`;
        ctx.fillText(
          `Sisa Bon Aktif Realtime Saat Ini: ${formatRupiah(kry.totalBonKaryawan || 0)} (Uang: ${formatRupiah(
            kry.totalKasbonUang || 0
          )} + Barang: ${formatRupiah(kry.totalKasbonBarang || 0)})`,
          MARGIN_X + 16,
          y + 60
        );
        y += 108;
      }

      // Signature Footer
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#475569';
      ctx.font = `600 11.5px ${SANS_FONT}`;
      ctx.fillText('Disiapkan Oleh (Kasir / Bagian Keuangan),', MARGIN_X + 24, y + 8);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X + 24, y + 78);
      ctx.lineTo(MARGIN_X + 270, y + 78);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12px ${SANS_FONT}`;
      ctx.fillText(profil.penanggungJawab.toUpperCase(), MARGIN_X + 24, y + 86);

      const signRightX = MARGIN_X + CONTENT_WIDTH - 24;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#475569';
      ctx.font = `600 11.5px ${SANS_FONT}`;
      ctx.fillText('Diterima / Mengetahui (Karyawan),', signRightX, y + 8);
      ctx.beginPath();
      ctx.moveTo(signRightX - 246, y + 78);
      ctx.lineTo(signRightX, y + 78);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12px ${SANS_FONT}`;
      ctx.fillText(kry.nama.toUpperCase(), signRightX, y + 86);
    } else {
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748b';
      ctx.font = `600 12px ${SANS_FONT}`;
      ctx.fillText(`Bersambung ke Halaman ${pIdx + 2} dari ${totalPages}...`, MARGIN_X + CONTENT_WIDTH, y + 18);
    }

    const pageSuffix = totalPages > 1 ? `_Hal${pIdx + 1}` : '';
    const filename = `History_Penggajian_${safeNik}_${safeNama}_${data.periodeFileSlug}${pageSuffix}.${ext}`;
    await canvasToBlobAndDownload(canvas, format, filename);
    downloadedFilenames.push(filename);
  }

  return { filenames: downloadedFilenames, pageCount: totalPages };
}

/**
 * 4. EXPORT CSV (.csv) — UTF-8 BOM Detail Kerja Harian & Slip Gaji
 */
function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\r\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportHistoryGajiKaryawanToCsv(
  detail: DetailHarianKaryawanResponse,
  filter?: ExportHistoryGajiFilter
): string {
  const data = prepareHistoryGajiData(detail, filter);
  const kry = data.karyawan;

  const headers = [
    'Jenis Catatan',
    'NIK',
    'Nama Karyawan',
    'Tanggal / Hari',
    'Divisi',
    'No. Ref / Slip / Item Pekerjaan',
    'Uraian / Keterangan',
    'Qty',
    'Tarif / Harga (Rp)',
    'Lembur / Makan (Rp)',
    'Potongan Bon (Rp)',
    'Total Upah / Bersih Dibayar (Rp)',
    'Status Ket',
    'Tanggal Cair / Rekening',
    'Catatan',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  const slipMap = new Map<string, TransaksiPenggajian>();
  (detail.riwayatGaji || []).forEach((s) => slipMap.set(s.id, s));

  data.logs.forEach((log) => {
    const tglNorm = normalizeDateToDmy(log.tanggalKerja, log.tanggalKerja);
    const hariTgl = log.hariTanggal || formatHariTanggalLabel(tglNorm) || tglNorm;
    const belumCair = isLogBelumCair(log);
    const linkedSlip = log.idPayrollSettlement ? slipMap.get(log.idPayrollSettlement) : undefined;
    lines.push(
      [
        'INPUT_UPAH_HARIAN',
        kry.nik,
        kry.nama,
        `${hariTgl} (${tglNorm})`,
        log.divisi,
        buildLogJobDisplay(log),
        (log.keterangan || '').trim() || '-',
        getLogQty(log),
        getLogHarga(log),
        Number(log.uangMakanLembur || 0),
        0,
        getLogTotal(log),
        belumCair ? 'BON (BELUM CAIR)' : 'LUNAS (SUDAH CAIR)',
        log.tanggalDibayar || '-',
        buildLogCatatanDisplay(log, linkedSlip),
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });

  data.slips.forEach((g) => {
    lines.push(
      [
        'SLIP_GAJI_CAIR',
        kry.nik,
        kry.nama,
        `${g.tanggal} ${g.jam || ''}`.trim(),
        g.divisi,
        g.slipNomor,
        `Slip ${g.tipeGaji} (${g.periodeBulan})`,
        g.jumlahHariKerja ?? (g.daftarUpahHarianIds?.length || 1),
        g.totalGajiKotor || 0,
        g.bonus || 0,
        g.potonganKasbon || 0,
        g.gajiBersihDibayar || 0,
        'CAIR / LUNAS',
        `${g.rekeningSumber} (${g.metodePembayaran})`,
        g.keterangan || '-',
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  });

  if (data.hasPiutangHutangOrTitip) {
    data.uangTitipDisplay.forEach((t) => {
      lines.push(
        [
          t.arah === 'TITIP_MASUK' ? 'UANG_TITIP_MASUK' : 'UANG_TITIP_AMBIL',
          kry.nik,
          kry.nama,
          `${t.tanggal} ${t.jam || ''}`.trim(),
          t.kategori,
          t.id,
          `${t.judul} — ${t.keterangan}`,
          1,
          t.nominalMasuk,
          0,
          t.nominalKeluar,
          t.saldoTitipSetelah,
          t.arah === 'TITIP_MASUK' ? 'TITIPAN (HUTANG PT)' : 'AMBIL / KLIRING',
          `${t.metode} (${t.rekeningKode})`,
          t.noReferensi ? `Ref: ${t.noReferensi}` : '-',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    });
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeNama = sanitizeFilenamePart(kry.nama);
  const safeNik = sanitizeFilenamePart(kry.nik);
  const filename = `History_Penggajian_${safeNik}_${safeNama}_${data.periodeFileSlug}_${getFileDateStamp()}.csv`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}
