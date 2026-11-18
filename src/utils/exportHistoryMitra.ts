import * as XLSX from 'xlsx';
import {
  ProfilPerusahaan,
  RekeningKoranHistoryItem,
  RekeningKoranMitraSummary,
} from '../server/types.ts';
import { formatRupiah } from './format.ts';

export interface ExportHistoryMitraOptions {
  scopeLabel?: string;
  filterLabel?: string;
  isSaldoBerjalanOnly?: boolean;
}

function sanitizeFilenamePart(val: string): string {
  return (val || 'MITRA')
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

function getRowDisplayFields(
  row: RekeningKoranHistoryItem,
  isSaldoBerjalanOnly: boolean
) {
  const items = row.itemsDetail || [];
  const isMulti = items.length > 1;
  const single = items.length === 1 ? items[0] : null;

  const uraianItem = isMulti
    ? items
        .map(
          (it, idx) =>
            `${idx + 1}. ${it.nama} (${it.qty} ${it.satuan} x ${formatRupiah(it.harga)} = ${formatRupiah(it.subtotal)})`
        )
        .join('; ')
    : single
    ? single.nama
    : row.keterangan || row.jenis.replace(/_/g, ' ');

  const qtyText = isMulti
    ? `${items.length} Item`
    : single
    ? `${single.qty} ${single.satuan}`
    : row.qtyDisplay || '-';

  const hargaNumOrText: number | string = isMulti
    ? 'Rincian'
    : single
    ? single.harga
    : row.hargaSatuanDisplay || '-';

  const piutangVal = isSaldoBerjalanOnly
    ? row.piutangBerjalan ?? row.sisaPiutangNota ?? row.debet
    : row.debet || 0;

  const titipVal = isSaldoBerjalanOnly
    ? row.titipBerjalan ?? (row.kredit === 0 ? row.nominalMutasiHak || 0 : 0)
    : row.kredit > 0
    ? row.kredit
    : row.nominalMutasiHak || (row.debet === 0 ? row.nominalTransaksi || 0 : 0);

  const sisaPiutang = row.debet > 0 ? row.sisaPiutangNota ?? row.piutangBerjalan ?? 0 : 0;
  const sisaTitip =
    row.kategoriMutasiHak === 'TITIP_MASUK' ? row.titipBerjalan ?? 0 : 0;

  const isKliring =
    row.statusTransaksi === 'KLIRING_SILANG' ||
    row.metodePembayaran === 'KLIRING_SILANG' ||
    (row.jenis || '').toUpperCase().includes('KLIRING');
  const isSinkron =
    !isKliring &&
    (row.statusTransaksi === 'SINKRON' ||
      row.metodePembayaran === 'SINKRON' ||
      (row.jenis || '').toUpperCase().includes('SINKRON'));

  let statusLabel = row.statusTransaksi || '-';
  if (isKliring) {
    statusLabel = 'KLIRING SILANG';
  } else if (isSinkron) {
    statusLabel = 'LUNAS SINKRON';
  } else if (row.debet > 0) {
    statusLabel =
      sisaPiutang > 0
        ? row.isNotaNgunci
          ? 'NOTA KUNCI (BELUM LUNAS)'
          : 'BELUM LUNAS'
        : 'LUNAS';
  } else if (row.kategoriMutasiHak === 'TITIP_MASUK') {
    statusLabel = sisaTitip > 0 ? 'TITIP BERJALAN' : 'SUDAH CAIR / KLIRING';
  } else if (!row.isSaldoBerjalan) {
    statusLabel = 'SELESAI / LUNAS';
  }

  const ketParts: string[] = [];
  if (row.catatanTransaksi?.trim()) ketParts.push(row.catatanTransaksi.trim());
  if (row.catatanNgunci?.trim()) ketParts.push(`Kronologi: ${row.catatanNgunci.trim()}`);
  if (
    row.isNotaLalu &&
    row.rincianNotaLalu &&
    !ketParts.join(' ').toLowerCase().includes(row.rincianNotaLalu.toLowerCase())
  ) {
    ketParts.push(`Rincian Nota Lalu: ${row.rincianNotaLalu}`);
  }
  const ketText = ketParts.join(' | ') || row.keterangan || '-';

  return {
    parentTxId: row.idTransaksiInduk || row.id,
    noNotaLalu: row.noNotaLalu || '-',
    jenisLabel: row.jenis.replace(/_/g, ' '),
    uraianItem,
    qtyText,
    hargaNumOrText,
    piutangVal,
    sisaPiutang,
    titipVal,
    sisaTitip,
    metodeLabel: (row.metodePembayaran || '-').replace(/_/g, ' '),
    rekeningLabel: row.rekeningKode || '-',
    statusLabel,
    ketText,
  };
}

/**
 * Download History Transaksi Mitra ke format Excel (.xlsx)
 * Berisi Sheet 1 ("History Transaksi") dan Sheet 2 ("Rincian Item Barang" jika ada detail item).
 */
export function exportHistoryMitraToXlsx(
  statement: RekeningKoranMitraSummary,
  rows: RekeningKoranHistoryItem[],
  profilPerusahaan?: ProfilPerusahaan | null,
  options: ExportHistoryMitraOptions = {}
): string {
  const isSaldoBerjalanOnly = Boolean(options.isSaldoBerjalanOnly);
  const namaPt =
    profilPerusahaan?.namaPerusahaan?.trim() ||
    statement.profilPerusahaan?.namaPerusahaan?.trim() ||
    'PT WIJAYA AGRO PERKASA';
  const nowStr = new Date().toLocaleString('id-ID');

  const sisaBayarBersih =
    statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip);
  const sisaTitipBersih =
    statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan);
  const displayPiutangSummary = isSaldoBerjalanOnly
    ? (statement.totalPiutangBerjalanTampil ?? statement.totalBonKeseluruhan ?? 0)
    : (statement.totalBonKeseluruhan || 0);
  const displayTitipSummary = isSaldoBerjalanOnly
    ? (statement.totalTitipBerjalanTampil ?? statement.totalTitip ?? 0)
    : (statement.totalTitip || 0);

  const infoRows: (string | number)[][] = [
    [namaPt.toUpperCase(), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['HISTORY TRANSAKSI & REKENING KORAN MITRA'],
    ['Mitra', `${statement.namaMitra} (${statement.kodeMitra})`, '', 'Tanggal Unduh', nowStr],
    ['Telepon', statement.telepon || '-', '', 'Cakupan Data', options.scopeLabel || 'Seluruh History Transaksi'],
    ['Alamat', statement.alamat || '-', '', 'Filter Aktif', options.filterLabel || 'Semua Transaksi'],
    [
      isSaldoBerjalanOnly ? 'Total Piutang Siklus Berjalan (Rp)' : 'Total Piutang Aktif (Rp)',
      displayPiutangSummary,
      '',
      isSaldoBerjalanOnly ? 'Total Titip / Bayar Bon Berjalan (Rp)' : 'Total Titipan / Hak Aktif (Rp)',
      displayTitipSummary,
    ],
    [
      'Posisi Saldo Bersih',
      sisaBayarBersih > 0
        ? `Piutang Mitra Rp ${sisaBayarBersih.toLocaleString('id-ID')}`
        : sisaTitipBersih > 0
        ? `Hutang PT Rp ${sisaTitipBersih.toLocaleString('id-ID')}`
        : 'IMPAS (Rp 0)',
      '',
      'Jumlah Baris',
      rows.length,
    ],
    [],
  ];

  const headers = [
    'No.',
    'Tanggal',
    'Jam',
    'No. Transaksi',
    'No. Nota Lalu',
    'Jenis Transaksi',
    'Item / Uraian Barang',
    'Qty',
    'Harga Satuan (Rp)',
    isSaldoBerjalanOnly ? 'Piutang Berjalan (Rp)' : 'Bon / Piutang (Rp)',
    'Sisa Piutang Nota (Rp)',
    isSaldoBerjalanOnly ? 'Titip / Hak Berjalan (Rp)' : 'Bayar / Titip / Hak (Rp)',
    'Sisa Titip Berjalan (Rp)',
    'Metode Pembayaran',
    'Rekening',
    'Status',
    'Keterangan / Catatan',
  ];

  let totalPiutangCol = 0;
  let totalSisaPiutangCol = 0;
  let totalTitipCol = 0;
  let totalSisaTitipCol = 0;

  const dataRows: (string | number)[][] = rows.map((row, idx) => {
    const f = getRowDisplayFields(row, isSaldoBerjalanOnly);
    totalPiutangCol += f.piutangVal;
    totalSisaPiutangCol += f.sisaPiutang;
    totalTitipCol += f.titipVal;
    totalSisaTitipCol += f.sisaTitip;
    return [
      idx + 1,
      row.tanggal || '-',
      row.jam || '-',
      f.parentTxId,
      f.noNotaLalu,
      f.jenisLabel,
      f.uraianItem,
      f.qtyText,
      f.hargaNumOrText,
      f.piutangVal,
      f.sisaPiutang,
      f.titipVal,
      f.sisaTitip,
      f.metodeLabel,
      f.rekeningLabel,
      f.statusLabel,
      f.ketText,
    ];
  });

  const totalRow: (string | number)[] = [
    '',
    '',
    '',
    '',
    '',
    '',
    `TOTAL (${rows.length} TRANSAKSI)`,
    '',
    '',
    totalPiutangCol,
    totalSisaPiutangCol,
    totalTitipCol,
    totalSisaTitipCol,
    '',
    '',
    '',
    '',
  ];

  const aoa1: (string | number)[][] = [...infoRows, headers, ...dataRows, totalRow];
  const ws1 = XLSX.utils.aoa_to_sheet(aoa1);

  ws1['!cols'] = headers.map((h, colIdx) => {
    let maxLen = h.length;
    const allTableRows = [headers, ...dataRows, totalRow];
    for (let i = 0; i < Math.min(allTableRows.length, 300); i++) {
      const cell = allTableRows[i]?.[colIdx];
      const len = cell === null || cell === undefined ? 0 : String(cell).length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 48) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'History Transaksi');

  // Sheet 2: Detail Item Per Transaksi (jika ada rincian item)
  const itemRows: (string | number)[][] = [];
  let itemNo = 1;
  rows.forEach((row) => {
    const items = row.itemsDetail || [];
    items.forEach((it) => {
      itemRows.push([
        itemNo++,
        row.tanggal || '-',
        row.idTransaksiInduk || row.id,
        row.jenis.replace(/_/g, ' '),
        it.nama,
        it.qty,
        it.satuan,
        it.harga,
        it.subtotal,
        row.catatanTransaksi?.trim() || row.keterangan || '-',
      ]);
    });
  });

  if (itemRows.length > 0) {
    const itemHeaders = [
      'No.',
      'Tanggal',
      'No. Transaksi',
      'Jenis Transaksi',
      'Nama Barang / Komoditas',
      'Qty',
      'Satuan',
      'Harga Satuan (Rp)',
      'Subtotal (Rp)',
      'Keterangan',
    ];
    const ws2 = XLSX.utils.aoa_to_sheet([itemHeaders, ...itemRows]);
    ws2['!cols'] = itemHeaders.map((h, colIdx) => {
      let maxLen = h.length;
      for (let i = 0; i < Math.min(itemRows.length, 300); i++) {
        const cell = itemRows[i]?.[colIdx];
        const len = cell === null || cell === undefined ? 0 : String(cell).length;
        if (len > maxLen) maxLen = len;
      }
      return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
    });
    XLSX.utils.book_append_sheet(wb, ws2, 'Rincian Item Barang');
  }

  const safeMitra = sanitizeFilenamePart(statement.namaMitra);
  const prefix = isSaldoBerjalanOnly ? 'Rekening_Koran_Berjalan' : 'History_Transaksi';
  const filename = `${prefix}_${statement.kodeMitra}_${safeMitra}_${getFileDateStamp()}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\r\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Download History Transaksi Mitra ke format CSV (.csv) dengan UTF-8 BOM agar rapi di Excel Indonesia.
 */
export function exportHistoryMitraToCsv(
  statement: RekeningKoranMitraSummary,
  rows: RekeningKoranHistoryItem[],
  options: ExportHistoryMitraOptions = {}
): string {
  const isSaldoBerjalanOnly = Boolean(options.isSaldoBerjalanOnly);
  const headers = [
    'No',
    'Tanggal',
    'Jam',
    'No Transaksi',
    'No Nota Lalu',
    'Jenis Transaksi',
    'Item / Uraian Barang',
    'Qty',
    'Harga Satuan',
    isSaldoBerjalanOnly ? 'Piutang Berjalan (Rp)' : 'Bon / Piutang (Rp)',
    'Sisa Piutang Nota (Rp)',
    isSaldoBerjalanOnly ? 'Titip / Hak Berjalan (Rp)' : 'Bayar / Titip / Hak (Rp)',
    'Sisa Titip Berjalan (Rp)',
    'Metode Pembayaran',
    'Rekening',
    'Status',
    'Keterangan / Catatan',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  rows.forEach((row, idx) => {
    const f = getRowDisplayFields(row, isSaldoBerjalanOnly);
    const cols: (string | number)[] = [
      idx + 1,
      row.tanggal || '-',
      row.jam || '-',
      f.parentTxId,
      f.noNotaLalu,
      f.jenisLabel,
      f.uraianItem,
      f.qtyText,
      f.hargaNumOrText,
      f.piutangVal,
      f.sisaPiutang,
      f.titipVal,
      f.sisaTitip,
      f.metodeLabel,
      f.rekeningLabel,
      f.statusLabel,
      f.ketText,
    ];
    lines.push(cols.map(escapeCsvCell).join(','));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeMitra = sanitizeFilenamePart(statement.namaMitra);
  const prefix = isSaldoBerjalanOnly ? 'Rekening_Koran_Berjalan' : 'History_Transaksi';
  const filename = `${prefix}_${statement.kodeMitra}_${safeMitra}_${getFileDateStamp()}.csv`;
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}
