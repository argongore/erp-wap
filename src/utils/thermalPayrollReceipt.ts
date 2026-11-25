import type {
  CatatanUpahHarian,
  ItemRincianHarianPayroll,
  TransaksiPenggajian,
} from '../server/types.ts';
import type { ReceiptData } from '../components/common/PrintReceiptModal.tsx';
import { formatRupiah } from './format.ts';

const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export type PayrollDailyLogInput = CatatanUpahHarian | ItemRincianHarianPayroll;

function getLogTanggalDmy(log: PayrollDailyLogInput): string {
  return ('tanggalKerja' in log ? log.tanggalKerja : log.tanggal) || '';
}

function getLogTotalUpah(log: PayrollDailyLogInput): number {
  if ('totalUpahHarian' in log) {
    return Number(log.jumlah !== undefined ? log.jumlah : log.totalUpahHarian) || 0;
  }
  return Number(log.jumlah !== undefined ? log.jumlah : log.totalUpah) || 0;
}

function getLogUpahPokok(log: PayrollDailyLogInput): number {
  return Number(log.upahHarian !== undefined ? log.upahHarian : log.harga) || 0;
}

function getLogUangMakanLembur(log: PayrollDailyLogInput): number {
  return Number(log.uangMakanLembur) || 0;
}

function getLogJobLabel(log: PayrollDailyLogInput): string {
  const itemStr = (log.item || '').trim();
  const pekerjaanStr = String((log as any).pekerjaan || '').trim();
  const tugasStr = ('tugas' in log ? log.tugas || '' : '').trim();
  const ketStr = ('keterangan' in log ? log.keterangan || '' : '').trim();
  if (itemStr) return itemStr;
  if (pekerjaanStr) return pekerjaanStr;
  if (tugasStr) return tugasStr;
  if (ketStr) return ketStr;
  return log.divisiKode || log.divisi || 'Kerja Harian';
}

function getLogNoteLabel(log: PayrollDailyLogInput, primaryJob: string): string {
  const rawNotes: string[] = [];
  if (log.catatan && log.catatan.trim()) rawNotes.push(log.catatan.trim());
  if ('keterangan' in log && log.keterangan && log.keterangan.trim()) {
    rawNotes.push(log.keterangan.trim());
  }
  if ('tugas' in log && log.tugas && log.tugas.trim()) {
    rawNotes.push(log.tugas.trim());
  }

  const jobLower = primaryJob.toLowerCase();
  for (const note of rawNotes) {
    if (note === '-' || note.toLowerCase() === jobLower) continue;
    return note;
  }
  return '';
}

export function parseDmyToTimestamp(dmy?: string): number {
  if (!dmy) return 0;
  const parts = dmy.split('/');
  if (parts.length !== 3) return 0;
  const dd = Number(parts[0]);
  const mm = Number(parts[1]);
  const yy = Number(parts[2]);
  if (!dd || !mm || !yy) return 0;
  const dt = new Date(yy, mm - 1, dd);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

export function sortPayrollLogsChronological<T extends PayrollDailyLogInput>(logs: T[]): T[] {
  return [...logs].sort((a, b) => {
    const ta = parseDmyToTimestamp(getLogTanggalDmy(a));
    const tb = parseDmyToTimestamp(getLogTanggalDmy(b));
    if (ta !== tb) return ta - tb;
    return (a.id || '').localeCompare(b.id || '');
  });
}

function getShortDayName(dmy?: string): string {
  if (!dmy) return '';
  const parts = dmy.split('/');
  if (parts.length !== 3) return '';
  const dt = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  if (Number.isNaN(dt.getTime())) return '';
  return HARI_SINGKAT[dt.getDay()] || '';
}

function formatShortDateDmy(dmy?: string): string {
  if (!dmy) return '-';
  const parts = dmy.split('/');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  }
  return dmy;
}

function formatNowDmyAndTime(): { tanggal: string; jam: string } {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return { tanggal: `${dd}/${mm}/${yy}`, jam: `${hh}:${mi}` };
}

function trimText(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(4, maxLen - 1)).trim()}…`;
}

export function mapDailyLogsToThermalItems(
  logs: PayrollDailyLogInput[],
  options?: { includeStatusTag?: boolean }
): NonNullable<ReceiptData['items']> {
  const sorted = sortPayrollLogsChronological(logs);
  const includeStatus = options?.includeStatusTag ?? false;

  return sorted.map((log) => {
    const dmy = getLogTanggalDmy(log);
    const shortDate = formatShortDateDmy(dmy);
    const dayName = getShortDayName(dmy);
    const datePrefix = dayName ? `${shortDate} (${dayName})` : shortDate;
    const jobLabel = trimText(getLogJobLabel(log), 30);
    const total = getLogTotalUpah(log);
    const pokok = getLogUpahPokok(log);
    const tambahan = getLogUangMakanLembur(log);
    const divShort = (log.divisiKode || log.divisi || '').trim();
    const note = getLogNoteLabel(log, jobLabel);

    const detailParts: string[] = [];
    if (divShort && divShort.toLowerCase() !== jobLabel.toLowerCase()) {
      detailParts.push(trimText(divShort, 12));
    }
    if (tambahan > 0) {
      detailParts.push(`Pokok ${pokok.toLocaleString('id-ID')}+Tmb ${tambahan.toLocaleString('id-ID')}`);
    } else if (log.kuantiti !== undefined && log.kuantiti !== 1 && log.kuantiti > 0) {
      detailParts.push(`${log.kuantiti}x${pokok.toLocaleString('id-ID')}`);
    }
    if (note) {
      detailParts.push(trimText(note, 22));
    }
    if (includeStatus) {
      const isBon = log.ket === 'BON' || log.status === 'TERCATAT';
      detailParts.push(isBon ? 'BLM CAIR' : 'LUNAS');
    }

    return {
      nama: `${datePrefix} - ${jobLabel}`,
      detailLine: detailParts.length > 0 ? detailParts.join(' · ') : 'Upah Harian',
      subtotal: total,
      subtotalText: formatRupiah(total),
    };
  });
}

/**
 * Membangun struk thermal 80mm / 58mm dari Slip Gaji yang sudah resmi dicairkan,
 * lengkap dengan rincian per hari kerja (Tanggal, Hari, Pekerjaan, Upah),
 * potongan kasbon, dan Gaji Bersih Diterima.
 */
export function buildThermalReceiptFromSlipGaji(
  slip: TransaksiPenggajian,
  rincianKerja: CatatanUpahHarian[] = []
): ReceiptData {
  const sortedLogs = sortPayrollLogsChronological(rincianKerja);
  const uniqueWorkDays = new Set(
    sortedLogs.filter((u) => getLogTotalUpah(u) > 0).map((u) => u.tanggalKerja)
  ).size;

  const detailRows: NonNullable<ReceiptData['detailRows']> = [
    {
      label: 'Jabatan / Divisi',
      value: `${slip.jabatan || '-'} (${slip.divisi || '-'})`,
    },
  ];

  if (sortedLogs.length > 0) {
    detailRows.push({
      label: 'Total Hari Kerja',
      value: `${uniqueWorkDays || sortedLogs.length} Hari (${sortedLogs.length} Catatan)`,
    });
  }

  detailRows.push({
    label: 'Upah Pokok / Harian',
    value: Number(slip.gajiPokok) || 0,
  });

  if (Number(slip.tunjangan) > 0) {
    detailRows.push({
      label: 'Tunjangan Tetap',
      value: Number(slip.tunjangan),
    });
  }

  if (Number(slip.bonus) > 0) {
    detailRows.push({
      label: 'Bonus / Lembur',
      value: Number(slip.bonus),
    });
  }

  detailRows.push({
    label: 'TOTAL GAJI KOTOR',
    value: Number(slip.totalGajiKotor) || 0,
    highlight: true,
  });

  if (Number(slip.totalKasbonAwal) > 0 || Number(slip.potonganKasbon) > 0) {
    detailRows.push({
      label: 'Kasbon Awal',
      value: Number(slip.totalKasbonAwal) || 0,
    });
    detailRows.push({
      label: `Potong Kasbon${slip.persentasePotongKasbon ? ` (${slip.persentasePotongKasbon}%)` : ''}`,
      value:
        Number(slip.potonganKasbon) > 0
          ? `-${formatRupiah(Number(slip.potonganKasbon))}`
          : 'Rp 0',
      highlight: Number(slip.potonganKasbon) > 0,
    });
    detailRows.push({
      label: 'Sisa Kasbon Akhir',
      value: Number(slip.sisaKasbonAkhir) || 0,
    });
  }

  const nominalDititipkan = Math.max(0, Number(slip.nominalDititipkan) || 0);
  const hakGajiSetelahPotongBon =
    slip.hakGajiSetelahPotongBon !== undefined
      ? Number(slip.hakGajiSetelahPotongBon) || 0
      : Math.max(0, (Number(slip.totalGajiKotor) || 0) - (Number(slip.potonganKasbon) || 0));

  if (nominalDititipkan > 0) {
    detailRows.push({
      label: 'Hak Gaji Setelah Pot. Bon',
      value: hakGajiSetelahPotongBon,
    });
    detailRows.push({
      label: 'Dititipkan ke Saldo Titip',
      value: `-${formatRupiah(nominalDititipkan)}`,
      highlight: true,
    });
  }

  detailRows.push({
    label: nominalDititipkan > 0 ? 'DIAMBIL TUNAI / TRANSFER' : 'GAJI BERSIH DITERIMA',
    value: Number(slip.gajiBersihDibayar) || 0,
    isTotal: true,
  });

  detailRows.push({
    label: 'Metode / Sumber Kas',
    value:
      nominalDititipkan > 0 && Number(slip.gajiBersihDibayar) === 0
        ? 'TITIP 100% (SALDO TITIPAN)'
        : `${slip.metodePembayaran || 'TUNAI'} (${slip.rekeningSumber || 'KAS01'})`,
  });
  detailRows.push({
    label: 'Status Pencairan',
    value:
      nominalDititipkan > 0
        ? Number(slip.gajiBersihDibayar) === 0
          ? 'LUNAS · 100% DITITIPKAN'
          : 'LUNAS · CAIR + TITIP SISA'
        : 'LUNAS & DIBAYAR',
    highlight: true,
  });

  return {
    modalHeaderTitle: 'Cetak Thermal Slip Gaji & Rincian Harian',
    title: 'SLIP GAJI & RINCIAN HARIAN',
    subtitle: `Periode: ${slip.periodeBulan || '-'} · ${slip.tipeGaji || 'HARIAN'}`,
    mitraLabel: 'Karyawan',
    itemsHeaderLeft: 'TGL / RINCIAN KERJA',
    itemsHeaderRight: 'UPAH',
    signatureRightLabel: 'Karyawan Penerima',
    nomorTransaksi: slip.slipNomor || slip.id,
    tanggal: slip.tanggal || formatNowDmyAndTime().tanggal,
    jam: slip.jam || formatNowDmyAndTime().jam,
    mitra: `${slip.namaKaryawan}${slip.nikKaryawan ? ` (${slip.nikKaryawan})` : ''}`,
    kasir: 'Bag. Keuangan / Kasir',
    items: mapDailyLogsToThermalItems(sortedLogs, { includeStatusTag: false }),
    detailRows,
    total: Number(slip.gajiBersihDibayar) || 0,
    catatan: slip.keterangan || undefined,
  };
}

export interface DraftPencairanThermalParams {
  namaKaryawan: string;
  nik?: string;
  jabatan?: string;
  divisi?: string;
  periodeLabel: string;
  tanggalCetakDmy?: string;
  dailyLogs: PayrollDailyLogInput[];
  includeStatusTag?: boolean;
  title?: string;
  subtitle?: string;
  nomorDokumen?: string;
  gajiPokokTambahan?: number;
  bonus?: number;
  totalGajiKotor: number;
  kasbonUang?: number;
  kasbonBarang?: number;
  totalKasbonAwal?: number;
  potonganKasbon?: number;
  persentasePotongKasbon?: number;
  sisaKasbonAkhir?: number;
  saldoTitipPanen?: number;
  hakGajiSetelahPotongBon?: number;
  nominalDititipkan?: number;
  gajiBersihDiterima: number;
  totalLabel?: string;
  metodePembayaran?: string;
  rekeningSumber?: string;
  statusLabel?: string;
  catatan?: string;
}

/**
 * Membangun struk thermal 80mm / 58mm untuk rincian penggajian per hari
 * menjelang / saat proses pencairan gaji akhir bulan (draft pengecekan karyawan
 * maupun rekap harian per periode).
 */
export function buildThermalReceiptDraftPencairan(
  params: DraftPencairanThermalParams
): ReceiptData {
  const now = formatNowDmyAndTime();
  const sortedLogs = sortPayrollLogsChronological(params.dailyLogs || []);
  const uniqueWorkDays = new Set(
    sortedLogs.filter((u) => getLogTotalUpah(u) > 0).map((u) => getLogTanggalDmy(u))
  ).size;
  const totalUpahHarianLogs = sortedLogs.reduce((sum, u) => sum + getLogTotalUpah(u), 0);

  const totalKasbonAwal =
    params.totalKasbonAwal !== undefined
      ? params.totalKasbonAwal
      : (Number(params.kasbonUang) || 0) + (Number(params.kasbonBarang) || 0);
  const potonganKasbon = Number(params.potonganKasbon) || 0;
  const sisaKasbonAkhir =
    params.sisaKasbonAkhir !== undefined
      ? params.sisaKasbonAkhir
      : Math.max(0, totalKasbonAwal - potonganKasbon);

  const detailRows: NonNullable<ReceiptData['detailRows']> = [
    {
      label: 'Jabatan / Divisi',
      value: `${params.jabatan || '-'} (${params.divisi || '-'})`,
    },
  ];

  if (sortedLogs.length > 0) {
    detailRows.push({
      label: 'Total Hari Kerja',
      value: `${uniqueWorkDays} Hari (${sortedLogs.length} Catatan)`,
    });
    detailRows.push({
      label: 'Subtotal Upah Harian',
      value: totalUpahHarianLogs,
    });
  }

  if (Number(params.gajiPokokTambahan) > 0) {
    detailRows.push({
      label: 'Gaji Pokok / Bulanan',
      value: Number(params.gajiPokokTambahan),
    });
  }

  if (Number(params.bonus) > 0) {
    detailRows.push({
      label: 'Bonus / Lembur Tambahan',
      value: Number(params.bonus),
    });
  }

  detailRows.push({
    label: 'TOTAL GAJI KOTOR',
    value: Number(params.totalGajiKotor) || 0,
    highlight: true,
  });

  if (totalKasbonAwal > 0 || potonganKasbon > 0) {
    if (Number(params.kasbonUang) > 0 && Number(params.kasbonBarang) > 0) {
      detailRows.push({
        label: 'Bon Uang / Bon Barang',
        value: `${(Number(params.kasbonUang) || 0).toLocaleString('id-ID')} / ${(
          Number(params.kasbonBarang) || 0
        ).toLocaleString('id-ID')}`,
      });
    }
    detailRows.push({
      label: 'Total Kasbon Aktif',
      value: totalKasbonAwal,
    });
    if (potonganKasbon > 0) {
      detailRows.push({
        label: `Potong Kasbon${
          params.persentasePotongKasbon && params.persentasePotongKasbon > 0
            ? ` (${params.persentasePotongKasbon}%)`
            : ''
        }`,
        value: `-${formatRupiah(potonganKasbon)}`,
        highlight: true,
      });
      detailRows.push({
        label: 'Sisa Kasbon Setelahnya',
        value: sisaKasbonAkhir,
      });
    }
  }

  if (Number(params.saldoTitipPanen) > 0) {
    detailRows.push({
      label: 'Saldo Titipan Sebelumnya',
      value: Number(params.saldoTitipPanen),
    });
  }

  const draftDititipkan = Math.max(0, Number(params.nominalDititipkan) || 0);
  if (draftDititipkan > 0) {
    detailRows.push({
      label: 'Hak Gaji Setelah Pot. Bon',
      value:
        params.hakGajiSetelahPotongBon !== undefined
          ? Number(params.hakGajiSetelahPotongBon) || 0
          : Math.max(0, (Number(params.totalGajiKotor) || 0) - potonganKasbon),
    });
    detailRows.push({
      label: 'Dititipkan ke Saldo Titip',
      value: `-${formatRupiah(draftDititipkan)}`,
      highlight: true,
    });
  }

  detailRows.push({
    label:
      params.totalLabel ||
      (draftDititipkan > 0 ? 'DIAMBIL TUNAI / TRANSFER' : 'GAJI BERSIH DITERIMA'),
    value: Number(params.gajiBersihDiterima) || 0,
    isTotal: true,
  });

  if (params.metodePembayaran || params.rekeningSumber) {
    detailRows.push({
      label: 'Rencana Bayar',
      value: `${params.metodePembayaran || 'TUNAI'}${
        params.rekeningSumber ? ` (${params.rekeningSumber})` : ''
      }`,
    });
  }

  if (params.statusLabel) {
    detailRows.push({
      label: 'Status Dokumen',
      value: params.statusLabel,
      highlight: true,
    });
  }

  return {
    modalHeaderTitle: 'Cetak Thermal Rincian Penggajian Per Hari',
    title: params.title || 'RINCIAN PENGGAJIAN HARIAN',
    subtitle: params.subtitle || `Periode: ${params.periodeLabel}`,
    mitraLabel: 'Karyawan',
    itemsHeaderLeft: 'TGL / RINCIAN KERJA',
    itemsHeaderRight: 'UPAH',
    signatureRightLabel: 'Karyawan Penerima',
    nomorTransaksi:
      params.nomorDokumen ||
      `GAJI-${(params.nik || 'KRY').replace(/\s+/g, '')}-${params.periodeLabel
        .replace(/\s+/g, '')
        .slice(0, 8)
        .toUpperCase()}`,
    tanggal: params.tanggalCetakDmy || now.tanggal,
    jam: now.jam,
    mitra: `${params.namaKaryawan}${params.nik ? ` (${params.nik})` : ''}`,
    kasir: 'Bag. Keuangan / Kasir',
    items: mapDailyLogsToThermalItems(sortedLogs, {
      includeStatusTag: params.includeStatusTag ?? true,
    }),
    detailRows,
    total: Number(params.gajiBersihDiterima) || 0,
    catatan:
      params.catatan ||
      'Mohon diperiksa rincian hari kerja sebelum/saat penerimaan gaji.',
  };
}
