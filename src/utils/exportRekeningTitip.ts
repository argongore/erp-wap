import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {
  AuditMutasiRekeningTitipItem,
  ProfilPerusahaan,
  RekeningTitipAuditSummary,
} from '../server/types.ts';
import { DEFAULT_PT_LOGO_URL } from '../server/types.ts';
import { formatRupiah, formatTanggalIndo } from './format.ts';
import { loadLogoDataUrl } from './exportRekeningKoranPdf.ts';

export type FilterArahRekeningTitip = 'ALL' | 'MASUK' | 'BELANJA' | 'KEMBALI';

export interface ExportRekeningTitipOptions {
  filterArah?: FilterArahRekeningTitip;
}

export interface ExportRekeningTitipImageOptions extends ExportRekeningTitipOptions {
  format: 'jpg' | 'png';
}

export interface ExportRekeningTitipImageResult {
  filenames: string[];
  pageCount: number;
}

function sanitizeFilenamePart(val: string): string {
  return (val || 'REK_TITIP')
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

function getFilterArahLabel(filterArah: FilterArahRekeningTitip): string {
  switch (filterArah) {
    case 'MASUK':
      return 'Hanya Dana Masuk / Dititipkan (+)';
    case 'BELANJA':
      return 'Hanya Belanja / Pengeluaran (-)';
    case 'KEMBALI':
      return 'Hanya Pengembalian ke PT (-)';
    default:
      return 'Semua Mutasi Rekening Titip Uang';
  }
}

function getFilteredMutasi(
  audit: RekeningTitipAuditSummary,
  filterArah: FilterArahRekeningTitip = 'ALL'
): AuditMutasiRekeningTitipItem[] {
  const rows = Array.isArray(audit.mutasi) ? audit.mutasi : [];
  if (filterArah === 'ALL') return rows;
  return rows.filter((m) => m.arah === filterArah);
}

function resolveProfil(profilPerusahaan?: ProfilPerusahaan | null): ProfilPerusahaan {
  const rawAlamat = profilPerusahaan?.alamat?.trim();
  const rawTelepon = profilPerusahaan?.telepon?.trim();
  const rawEmail = profilPerusahaan?.email?.trim();
  return {
    namaPerusahaan: profilPerusahaan?.namaPerusahaan?.trim() || 'PT WIJAYA AGRO PERKASA',
    badanHukum: profilPerusahaan?.badanHukum?.trim() || 'PT (Perseroan Terbatas)',
    alamat:
      rawAlamat && rawAlamat !== '-'
        ? rawAlamat
        : 'Jl Kalangan Desa Simpang Luas, Kec. Sungai Are, OKUS SUMSEL',
    telepon:
      rawTelepon && rawTelepon !== '-'
        ? rawTelepon
        : 'TELPON KASIR 0821 44 999 305 · TELPON ADM 0812 2000 3305',
    email: rawEmail && rawEmail !== '-' ? rawEmail : 'wijayaagroperkasa@gmail.com',
    penanggungJawab: profilPerusahaan?.penanggungJawab?.trim() || 'KASIR / BAGIAN KEUANGAN',
    rekeningUtama: profilPerusahaan?.rekeningUtama?.trim() || 'KAS01',
    catatanHeaderNota: profilPerusahaan?.catatanHeaderNota?.trim() || '',
    logoUrl: profilPerusahaan?.logoUrl?.trim() || DEFAULT_PT_LOGO_URL,
    updateTerakhir: profilPerusahaan?.updateTerakhir,
  };
}

function formatMutasiDescriptionLines(m: AuditMutasiRekeningTitipItem): string[] {
  const lines: string[] = [];
  if (m.pihakAtauRekeningLawan) lines.push(m.pihakAtauRekeningLawan);
  if (m.uraian && m.uraian !== m.pihakAtauRekeningLawan) lines.push(m.uraian);
  if (m.detailItems && m.detailItems.length > 0) {
    m.detailItems.forEach((it) => {
      lines.push(
        `• ${it.nama} (${Number(it.qty).toLocaleString('id-ID')} ${it.satuan || ''} x ${formatRupiah(
          it.harga || 0
        )} = ${formatRupiah(it.subtotal || 0)})`
      );
    });
  }
  if (m.catatan && m.catatan !== m.uraian && m.catatan !== m.pihakAtauRekeningLawan) {
    lines.push(`Ket: ${m.catatan}`);
  }
  if (m.divisi && !lines.join(' ').toLowerCase().includes(m.divisi.toLowerCase())) {
    lines.push(`Divisi: ${m.divisi}`);
  }
  return lines.length > 0 ? lines : ['-'];
}

/**
 * 1. Download Rekening Koran Khusus Rekening Titip Uang (.pdf)
 */
export async function exportRekeningTitipToPdf(
  audit: RekeningTitipAuditSummary,
  profilPerusahaan?: ProfilPerusahaan | null,
  options: ExportRekeningTitipOptions = {}
): Promise<string> {
  const filterArah = options.filterArah || 'ALL';
  const rows = getFilteredMutasi(audit, filterArah);
  const activeProfil = resolveProfil(profilPerusahaan);
  const namaPemegang = audit.namaKaryawanTerkait || audit.namaMitraTerkait || audit.atasNama || '-';

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateStamp = getFileDateStamp();
  const noDokumen = `RK-TITIP/${audit.kodeRekening}/${dateStamp}/${rows.length}`;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logoDataUrl = await loadLogoDataUrl(activeProfil.logoUrl || DEFAULT_PT_LOGO_URL);

  // Header Kop Perusahaan
  let headerTextX = 14;
  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(logoDataUrl, fmt, 14, 10, 17, 17, undefined, 'FAST');
      headerTextX = 34;
    } catch {
      headerTextX = 14;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(12, 74, 110); // sky-900
  doc.text(activeProfil.namaPerusahaan.toUpperCase(), headerTextX, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(activeProfil.alamat, headerTextX, 19.5);
  doc.text(`${activeProfil.telepon} · Email: ${activeProfil.email}`, headerTextX, 23.5);

  // Judul Dokumen Kanan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(3, 105, 161); // sky-700
  doc.text('REKENING KORAN TITIP UANG', pageWidth - 14, 14.5, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`No. Dok: ${noDokumen}`, pageWidth - 14, 19, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak: ${tglCetak} · ${jamCetak} WIB`, pageWidth - 14, 23.5, { align: 'right' });

  doc.setDrawColor(3, 105, 161);
  doc.setLineWidth(0.7);
  doc.line(14, 29, pageWidth - 14, 29);

  // Box Info Pemegang Amanah & Saldo
  const subY = 32;
  const leftW = 104;
  const rightX = 122;
  const rightW = pageWidth - 14 - rightX;
  const boxH = 26;

  doc.setFillColor(240, 249, 255); // sky-50
  doc.setDrawColor(125, 211, 252);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, subY, leftW, boxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(12, 74, 110);
  doc.text('IDENTITAS REKENING TITIP UANG PERUSAHAAN :', 17, subY + 5);

  doc.setFontSize(7.2);
  doc.setTextColor(71, 85, 105);
  doc.text('REKENING', 17, subY + 9.5);
  doc.text('PEMEGANG', 17, subY + 13.5);
  doc.text('NO. REK', 17, subY + 17.5);
  doc.text('CAKUPAN', 17, subY + 21.5);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text(`: ${audit.namaRekening} (${audit.kodeRekening})`, 36, subY + 9.5);
  doc.text(`: ${namaPemegang.toUpperCase()} (Amanah PT)`, 36, subY + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${audit.nomorRekening || '-'} · Status: ${audit.status}`, 36, subY + 17.5);
  doc.text(`: ${getFilterArahLabel(filterArah)}`, 36, subY + 21.5);

  doc.setFillColor(224, 242, 254); // sky-100
  doc.setDrawColor(3, 105, 161);
  doc.setLineWidth(0.45);
  doc.roundedRect(rightX, subY, rightW, boxH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(12, 74, 110);
  doc.text('SISA SALDO DANA AMANAH :', rightX + 3.5, subY + 5);

  doc.setFontSize(12);
  doc.setTextColor(audit.saldoSaatIni >= 0 ? 12 : 159, audit.saldoSaatIni >= 0 ? 74 : 18, audit.saldoSaatIni >= 0 ? 110 : 57);
  doc.text(formatRupiah(audit.saldoSaatIni), rightX + 3.5, subY + 11.5);

  doc.setDrawColor(125, 211, 252);
  doc.setLineWidth(0.2);
  doc.line(rightX + 3.5, subY + 13.8, rightX + rightW - 3.5, subY + 13.8);

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Dititipkan: +${formatRupiah(audit.saldoAwal + audit.totalDititipkanMasuk)}`,
    rightX + 3.5,
    subY + 17.5
  );
  doc.text(
    `Belanja: -${formatRupiah(audit.totalDibelanjakanKeluar)} | Kembali: -${formatRupiah(audit.totalDikembalikanKePt)}`,
    rightX + 3.5,
    subY + 21.5
  );

  // Note line emphasizing scope isolation
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Catatan: Dokumen ini khusus mencatat transaksi Rekening Titip Uang Perusahaan (terpisah dari kasbon pribadi BON01 & hutang panen TIT01).',
    14,
    subY + boxH + 4
  );

  const totalMasukTampil = rows.reduce((s, r) => s + (r.nominalMasuk || 0), 0);
  const totalKeluarTampil = rows.reduce((s, r) => s + (r.nominalKeluar || 0), 0);

  const tableHead = [
    [
      'NO.',
      'TANGGAL / JAM',
      'ID & JENIS MUTASI',
      'SUMBER / PIHAK / RINCIAN BELANJA',
      'DANA MASUK (+)',
      'BELANJA / KELUAR (-)',
      'SISA SALDO',
    ],
  ];

  const tableBody =
    rows.length === 0
      ? [['-', '-', '-', 'Belum ada mutasi transaksi Rekening Titip sesuai filter ini', '-', '-', '-']]
      : rows.map((m, idx) => [
          String(idx + 1),
          `${m.tanggal}\n${m.jam || ''}`.trim(),
          `${m.jenis}\n${m.id}`,
          formatMutasiDescriptionLines(m).join('\n'),
          m.nominalMasuk > 0 ? `+${formatRupiah(m.nominalMasuk)}` : '-',
          m.nominalKeluar > 0 ? `-${formatRupiah(m.nominalKeluar)}` : '-',
          formatRupiah(m.saldoSetelah),
        ]);

  autoTable(doc, {
    startY: subY + boxH + 6.5,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [12, 74, 110],
      textColor: [255, 255, 255],
      fontSize: 6.8,
      fontStyle: 'bold',
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 6.7,
      textColor: [24, 24, 27],
      valign: 'top',
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 20, font: 'courier' },
      2: { cellWidth: 28 },
      3: { cellWidth: 58 },
      4: { cellWidth: 22, halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [6, 95, 70] },
      5: { cellWidth: 23, halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [180, 83, 9] },
      6: { cellWidth: 23, halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [12, 74, 110] },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const srcRow = rows[hookData.row.index];
        if (srcRow?.arah === 'MASUK') {
          hookData.cell.styles.fillColor = [240, 253, 244];
        } else if (srcRow?.arah === 'KEMBALI') {
          hookData.cell.styles.fillColor = [244, 244, 245];
        }
      }
    },
    foot: [
      [
        {
          content: `TOTAL (${rows.length} MUTASI) :`,
          colSpan: 4,
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.2 },
        },
        {
          content: `+${formatRupiah(totalMasukTampil)}`,
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.2, textColor: [6, 95, 70] },
        },
        {
          content: `-${formatRupiah(totalKeluarTampil)}`,
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.2, textColor: [180, 83, 9] },
        },
        {
          content: formatRupiah(audit.saldoSaatIni),
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.2, textColor: [12, 74, 110] },
        },
      ],
    ],
    footStyles: {
      fillColor: [224, 242, 254],
      textColor: [12, 74, 110],
      lineColor: [3, 105, 161],
      lineWidth: 0.3,
    },
    margin: { left: 14, right: 14 },
  });

  // Area Tanda Tangan di bagian akhir
  const finalY = ((doc as any).lastAutoTable?.finalY || 120) + 8;
  const pageHeight = doc.internal.pageSize.getHeight();
  let signY = finalY;
  if (signY + 28 > pageHeight - 10) {
    doc.addPage();
    signY = 20;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Bagian Keuangan / Kasir PT', 44, signY, { align: 'center' });
  doc.text('Karyawan Pemegang Amanah', pageWidth - 44, signY, { align: 'center' });

  doc.line(22, signY + 18, 66, signY + 18);
  doc.line(pageWidth - 66, signY + 18, pageWidth - 22, signY + 18);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(activeProfil.penanggungJawab || 'Admin Keuangan', 44, signY + 22, { align: 'center' });
  doc.text(namaPemegang, pageWidth - 44, signY + 22, { align: 'center' });

  const fileName = `Rekening_Koran_Titip_${sanitizeFilenamePart(audit.kodeRekening)}_${sanitizeFilenamePart(
    namaPemegang
  )}_${dateStamp}.pdf`;
  doc.save(fileName);
  return fileName;
}

/**
 * 2. Download Rekening Koran Khusus Rekening Titip Uang (.xlsx)
 */
export function exportRekeningTitipToXlsx(
  audit: RekeningTitipAuditSummary,
  profilPerusahaan?: ProfilPerusahaan | null,
  options: ExportRekeningTitipOptions = {}
): string {
  const filterArah = options.filterArah || 'ALL';
  const rows = getFilteredMutasi(audit, filterArah);
  const activeProfil = resolveProfil(profilPerusahaan);
  const namaPemegang = audit.namaKaryawanTerkait || audit.namaMitraTerkait || audit.atasNama || '-';
  const nowStr = new Date().toLocaleString('id-ID');

  const infoRows: (string | number)[][] = [
    [activeProfil.namaPerusahaan.toUpperCase()],
    ['REKENING KORAN KHUSUS REKENING TITIP UANG PERUSAHAAN'],
    ['Catatan Penting', 'Khusus mutasi dana amanah Rekening Titip PT (terpisah dari kasbon pribadi BON01 & hutang panen TIT01)'],
    ['Nama Rekening Titip', `${audit.namaRekening} (${audit.kodeRekening})`, '', 'Tanggal Unduh', nowStr],
    ['Nomor Rekening', audit.nomorRekening || '-', '', 'Status Rekening', audit.status],
    ['Karyawan Pemegang Amanah', namaPemegang, '', 'Cakupan Filter', getFilterArahLabel(filterArah)],
    ['Total Dana Dititipkan (+)', audit.saldoAwal + audit.totalDititipkanMasuk, '', 'Sudah Dibelanjakan (-)', audit.totalDibelanjakanKeluar],
    ['Dikembalikan ke PT (-)', audit.totalDikembalikanKePt, '', 'Sisa Saldo Rekening Titip', audit.saldoSaatIni],
    [],
  ];

  const headers = [
    'No.',
    'Tanggal',
    'Jam',
    'ID Transaksi',
    'Arah',
    'Jenis Transaksi',
    'Divisi',
    'Sumber / Pihak Lawan',
    'Uraian & Rincian Belanja',
    'Dana Masuk (+ Rp)',
    'Belanja / Keluar (- Rp)',
    'Sisa Saldo Setelah (Rp)',
    'Catatan',
  ];

  let sumMasuk = 0;
  let sumKeluar = 0;

  const dataRows: (string | number)[][] = rows.map((m, idx) => {
    sumMasuk += m.nominalMasuk || 0;
    sumKeluar += m.nominalKeluar || 0;
    const itemDesc =
      m.detailItems && m.detailItems.length > 0
        ? `${m.uraian || ''} | Rincian: ${m.detailItems
            .map(
              (it) =>
                `${it.nama} (${it.qty} ${it.satuan || ''} x ${formatRupiah(it.harga || 0)} = ${formatRupiah(
                  it.subtotal || 0
                )})`
            )
            .join('; ')}`
        : m.uraian || '-';

    return [
      idx + 1,
      m.tanggal || '-',
      m.jam || '-',
      m.id || '-',
      m.arah,
      m.jenis,
      m.divisi || '-',
      m.pihakAtauRekeningLawan || '-',
      itemDesc,
      m.nominalMasuk || 0,
      m.nominalKeluar || 0,
      m.saldoSetelah || 0,
      m.catatan || '-',
    ];
  });

  const totalRow: (string | number)[] = [
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    `TOTAL (${rows.length} MUTASI)`,
    sumMasuk,
    sumKeluar,
    audit.saldoSaatIni,
    '',
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([...infoRows, headers, ...dataRows, totalRow]);
  ws1['!cols'] = [
    { wch: 5 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
    { wch: 10 },
    { wch: 24 },
    { wch: 18 },
    { wch: 26 },
    { wch: 48 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Rekening Koran Titip');

  // Sheet 2: Rincian Item Belanja (untuk transaksi yang memiliki detailItems)
  const itemRows: (string | number)[][] = [];
  let itemNo = 1;
  for (const m of rows) {
    if (!m.detailItems || m.detailItems.length === 0) continue;
    for (const it of m.detailItems) {
      itemRows.push([
        itemNo++,
        m.tanggal,
        m.id,
        m.jenis,
        m.pihakAtauRekeningLawan || '-',
        it.nama,
        it.qty,
        it.satuan || '-',
        it.harga || 0,
        it.subtotal || 0,
        m.divisi || '-',
      ]);
    }
  }

  if (itemRows.length > 0) {
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['RINCIAN ITEM BELANJA / PENGELUARAN REKENING TITIP UANG'],
      ['Rekening', `${audit.namaRekening} (${audit.kodeRekening})`, 'Pemegang', namaPemegang],
      [],
      ['No.', 'Tanggal', 'ID Transaksi', 'Jenis', 'Pihak Lawan', 'Nama Item / Komoditas', 'Qty', 'Satuan', 'Harga Satuan (Rp)', 'Subtotal (Rp)', 'Divisi'],
      ...itemRows,
    ]);
    ws2['!cols'] = [
      { wch: 5 },
      { wch: 12 },
      { wch: 20 },
      { wch: 22 },
      { wch: 24 },
      { wch: 28 },
      { wch: 10 },
      { wch: 10 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Rincian Item Belanja');
  }

  const fileName = `Rekening_Koran_Titip_${sanitizeFilenamePart(audit.kodeRekening)}_${sanitizeFilenamePart(
    namaPemegang
  )}_${getFileDateStamp()}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
}

/**
 * 3. Download Rekening Koran Khusus Rekening Titip Uang (.csv)
 */
export function exportRekeningTitipToCsv(
  audit: RekeningTitipAuditSummary,
  options: ExportRekeningTitipOptions = {}
): string {
  const filterArah = options.filterArah || 'ALL';
  const rows = getFilteredMutasi(audit, filterArah);
  const namaPemegang = audit.namaKaryawanTerkait || audit.namaMitraTerkait || audit.atasNama || '-';

  const escapeCsv = (val: string | number): string => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const headers = [
    'No',
    'Tanggal',
    'Jam',
    'ID_Transaksi',
    'Arah',
    'Jenis',
    'Pihak_Sumber',
    'Uraian_Rincian',
    'Dana_Masuk_Rp',
    'Belanja_Keluar_Rp',
    'Sisa_Saldo_Rp',
    'Catatan',
  ];

  const csvLines = [headers.join(',')];
  rows.forEach((m, idx) => {
    const uraianFull =
      m.detailItems && m.detailItems.length > 0
        ? `${m.uraian || ''} | ${m.detailItems
            .map((it) => `${it.nama} (${it.qty} ${it.satuan || ''} x ${it.harga} = ${it.subtotal})`)
            .join('; ')}`
        : m.uraian || '-';

    csvLines.push(
      [
        idx + 1,
        m.tanggal || '-',
        m.jam || '-',
        m.id || '-',
        m.arah,
        m.jenis,
        m.pihakAtauRekeningLawan || '-',
        uraianFull,
        m.nominalMasuk || 0,
        m.nominalKeluar || 0,
        m.saldoSetelah || 0,
        m.catatan || '-',
      ]
        .map(escapeCsv)
        .join(',')
    );
  });

  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const fileName = `Rekening_Koran_Titip_${sanitizeFilenamePart(audit.kodeRekening)}_${sanitizeFilenamePart(
    namaPemegang
  )}_${getFileDateStamp()}.csv`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}

const LOGICAL_WIDTH = 1240;
const MARGIN_X = 48;
const CONTENT_WIDTH = LOGICAL_WIDTH - MARGIN_X * 2;
const SANS_FONT = '"Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

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
        current = word;
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

/**
 * 4. Download Rekening Koran Khusus Rekening Titip Uang (.jpg / .png)
 */
export async function exportRekeningTitipToImage(
  audit: RekeningTitipAuditSummary,
  profilPerusahaan?: ProfilPerusahaan | null,
  options: ExportRekeningTitipImageOptions = { format: 'jpg' }
): Promise<ExportRekeningTitipImageResult> {
  const format = options.format || 'jpg';
  const filterArah = options.filterArah || 'ALL';
  const rows = getFilteredMutasi(audit, filterArah);
  const activeProfil = resolveProfil(profilPerusahaan);
  const namaPemegang = audit.namaKaryawanTerkait || audit.namaMitraTerkait || audit.atasNama || '-';

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const dateStamp = getFileDateStamp();
  const noDokumen = `RK-TITIP/${audit.kodeRekening}/${dateStamp}/${rows.length}`;
  const logoImg = await loadSafeCanvasImage(activeProfil.logoUrl || DEFAULT_PT_LOGO_URL);

  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 10;
  measureCanvas.height = 10;
  const mCtx = measureCanvas.getContext('2d')!;

  const cols = [
    { key: 'no', label: 'NO.', width: 46, align: 'center' as const },
    { key: 'tgl', label: 'TANGGAL', width: 118, align: 'left' as const },
    { key: 'jenis', label: 'JENIS TRANSAKSI', width: 185, align: 'left' as const },
    { key: 'uraian', label: 'SUMBER / PIHAK / RINCIAN BELANJA', width: 390, align: 'left' as const },
    { key: 'masuk', label: 'DANA MASUK (+)', width: 135, align: 'right' as const },
    { key: 'keluar', label: 'BELANJA / KELUAR (-)', width: 135, align: 'right' as const },
    { key: 'saldo', label: 'SISA SALDO', width: 135, align: 'right' as const },
  ];

  interface PreparedRow {
    noText: string;
    tanggal: string;
    jam: string;
    jenisLines: string[];
    txId: string;
    uraianLines: string[];
    masukText: string;
    keluarText: string;
    saldoText: string;
    arah: 'MASUK' | 'BELANJA' | 'KEMBALI';
    rowHeight: number;
  }

  const preparedRows: PreparedRow[] = rows.map((m, idx) => {
    const jenisLines = wrapTextLines(mCtx, m.jenis, cols[2].width - 16, `600 12px ${SANS_FONT}`);
    const descFull = formatMutasiDescriptionLines(m).join('\n');
    const uraianLines = wrapTextLines(mCtx, descFull, cols[3].width - 16, `500 12px ${SANS_FONT}`);
    const lineCount = Math.max(jenisLines.length + 1, uraianLines.length, 2);
    const rowHeight = Math.max(46, lineCount * 17 + 16);

    return {
      noText: String(idx + 1),
      tanggal: m.tanggal || '-',
      jam: m.jam || '',
      jenisLines,
      txId: m.id,
      uraianLines,
      masukText: m.nominalMasuk > 0 ? `+${formatRupiah(m.nominalMasuk)}` : '-',
      keluarText: m.nominalKeluar > 0 ? `-${formatRupiah(m.nominalKeluar)}` : '-',
      saldoText: formatRupiah(m.saldoSetelah),
      arah: m.arah,
      rowHeight,
    };
  });

  // Paginate across logical pages
  const FIRST_PAGE_HEADER_H = 315;
  const NEXT_PAGE_HEADER_H = 95;
  const TABLE_HEAD_H = 38;
  const TOTAL_BAR_H = 44;
  const FOOTER_SIG_H = 115;
  const MAX_PAGE_H = 1660;

  interface PageSlice {
    rows: PreparedRow[];
    includeTotalAndFooter: boolean;
  }

  const pages: PageSlice[] = [];
  if (preparedRows.length === 0) {
    pages.push({ rows: [], includeTotalAndFooter: true });
  } else {
    let idx = 0;
    let isFirst = true;
    while (idx < preparedRows.length) {
      const headerH = isFirst ? FIRST_PAGE_HEADER_H : NEXT_PAGE_HEADER_H;
      const maxTableBodyH = MAX_PAGE_H - headerH - TABLE_HEAD_H - TOTAL_BAR_H - FOOTER_SIG_H;
      const chunk: PreparedRow[] = [];
      let usedH = 0;
      while (idx < preparedRows.length) {
        const candidate = preparedRows[idx];
        if (chunk.length > 0 && usedH + candidate.rowHeight > maxTableBodyH) break;
        chunk.push(candidate);
        usedH += candidate.rowHeight;
        idx++;
      }
      pages.push({ rows: chunk, includeTotalAndFooter: idx >= preparedRows.length });
      isFirst = false;
    }
  }

  const scale = 2;
  const filenames: string[] = [];
  const baseName = `Rekening_Koran_Titip_${sanitizeFilenamePart(audit.kodeRekening)}_${sanitizeFilenamePart(
    namaPemegang
  )}_${dateStamp}`;

  const totalMasukTampil = rows.reduce((s, r) => s + (r.nominalMasuk || 0), 0);
  const totalKeluarTampil = rows.reduce((s, r) => s + (r.nominalKeluar || 0), 0);

  for (let pIdx = 0; pIdx < pages.length; pIdx++) {
    const slice = pages[pIdx];
    const isFirstPage = pIdx === 0;
    const headerH = isFirstPage ? FIRST_PAGE_HEADER_H : NEXT_PAGE_HEADER_H;
    const rowsH =
      slice.rows.length > 0
        ? slice.rows.reduce((sum, r) => sum + r.rowHeight, 0)
        : 64;
    const totalH = slice.includeTotalAndFooter ? TOTAL_BAR_H : 0;
    const footerH = slice.includeTotalAndFooter ? FOOTER_SIG_H : 44;
    const logicalHeight = headerH + TABLE_HEAD_H + rowsH + totalH + footerH + 24;

    const canvas = document.createElement('canvas');
    canvas.width = LOGICAL_WIDTH * scale;
    canvas.height = logicalHeight * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, logicalHeight);

    let y = 28;
    if (isFirstPage) {
      let textX = MARGIN_X;
      if (logoImg) {
        drawRoundedRect(ctx, MARGIN_X, y, 60, 60, 10, '#0f172a');
        ctx.drawImage(logoImg, MARGIN_X + 3, y + 3, 54, 54);
        textX = MARGIN_X + 74;
      }
      ctx.fillStyle = '#0c4a6e';
      ctx.font = `800 20px ${SANS_FONT}`;
      ctx.fillText(activeProfil.namaPerusahaan.toUpperCase(), textX, y + 22);

      ctx.fillStyle = '#475569';
      ctx.font = `500 12px ${SANS_FONT}`;
      ctx.fillText(activeProfil.alamat, textX, y + 40);
      ctx.fillText(`${activeProfil.telepon} · ${activeProfil.email}`, textX, y + 57);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#0369a1';
      ctx.font = `800 18px ${SANS_FONT}`;
      ctx.fillText('REKENING KORAN TITIP UANG', LOGICAL_WIDTH - MARGIN_X, y + 22);
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 12px ${MONO_FONT}`;
      ctx.fillText(`No. Dok: ${noDokumen}`, LOGICAL_WIDTH - MARGIN_X, y + 41);
      ctx.fillStyle = '#64748b';
      ctx.font = `500 11px ${SANS_FONT}`;
      ctx.fillText(`Dicetak: ${tglCetak} · ${jamCetak} WIB`, LOGICAL_WIDTH - MARGIN_X, y + 57);
      ctx.textAlign = 'left';

      y += 74;
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, 3);
      y += 14;

      // Info Box + Summary Banner
      drawRoundedRect(ctx, MARGIN_X, y, CONTENT_WIDTH, 92, 10, '#f0f9ff', '#7dd3fc', 1.2);
      ctx.fillStyle = '#0c4a6e';
      ctx.font = `700 11px ${SANS_FONT}`;
      ctx.fillText('IDENTITAS REKENING TITIP UANG PERUSAHAAN (AMANAH KARYAWAN)', MARGIN_X + 16, y + 22);

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 15px ${SANS_FONT}`;
      ctx.fillText(`${audit.namaRekening} (${audit.kodeRekening})`, MARGIN_X + 16, y + 45);
      ctx.fillStyle = '#334155';
      ctx.font = `600 12.5px ${SANS_FONT}`;
      ctx.fillText(`Pemegang Amanah: ${namaPemegang}   ·   No. Rek: ${audit.nomorRekening || '-'}`, MARGIN_X + 16, y + 66);
      ctx.fillStyle = '#0369a1';
      ctx.font = `500 11.5px ${SANS_FONT}`;
      ctx.fillText(`Cakupan: ${getFilterArahLabel(filterArah)} (Terpisah dari Kasbon Pribadi & Hutang Panen)`, MARGIN_X + 16, y + 83);

      y += 104;

      // 4 KPI Cards
      const cardGap = 12;
      const cardW = (CONTENT_WIDTH - cardGap * 3) / 4;
      const kpis = [
        {
          label: 'TOTAL DANA DITITIPKAN (+)',
          value: `+${formatRupiah(audit.saldoAwal + audit.totalDititipkanMasuk)}`,
          sub: `${audit.jumlahTransaksiMasuk} Setoran PT`,
          bg: '#ecfdf5',
          border: '#6ee7b7',
          text: '#065f46',
        },
        {
          label: 'SUDAH DIBELANJAKAN (-)',
          value: `-${formatRupiah(audit.totalDibelanjakanKeluar)}`,
          sub: `${audit.jumlahTransaksiBelanja} Transaksi Belanja`,
          bg: '#fffbeb',
          border: '#fcd34d',
          text: '#92400e',
        },
        {
          label: 'DIKEMBALIKAN KE PT (-)',
          value: `-${formatRupiah(audit.totalDikembalikanKePt)}`,
          sub: `${audit.jumlahTransaksiKembali} Transfer Balik`,
          bg: '#f4f4f5',
          border: '#d4d4d8',
          text: '#27272a',
        },
        {
          label: 'SISA SALDO REK. TITIP',
          value: formatRupiah(audit.saldoSaatIni),
          sub: 'Dana amanah siap pakai',
          bg: '#e0f2fe',
          border: '#38bdf8',
          text: '#0c4a6e',
        },
      ];

      kpis.forEach((k, i) => {
        const cx = MARGIN_X + i * (cardW + cardGap);
        drawRoundedRect(ctx, cx, y, cardW, 74, 8, k.bg, k.border, 1.2);
        ctx.fillStyle = k.text;
        ctx.font = `700 10.5px ${SANS_FONT}`;
        ctx.fillText(k.label, cx + 12, y + 20);
        ctx.font = `800 16px ${MONO_FONT}`;
        ctx.fillText(k.value, cx + 12, y + 45);
        ctx.fillStyle = '#475569';
        ctx.font = `500 11px ${SANS_FONT}`;
        ctx.fillText(k.sub, cx + 12, y + 63);
      });
      y += 88;
    } else {
      ctx.fillStyle = '#0c4a6e';
      ctx.font = `700 15px ${SANS_FONT}`;
      ctx.fillText(
        `LANJUTAN REKENING KORAN TITIP: ${audit.namaRekening} (${audit.kodeRekening}) — Halaman ${pIdx + 1}/${pages.length}`,
        MARGIN_X,
        y + 22
      );
      ctx.fillStyle = '#64748b';
      ctx.font = `500 11.5px ${SANS_FONT}`;
      ctx.fillText(`Pemegang Amanah: ${namaPemegang} · ${noDokumen}`, MARGIN_X, y + 42);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(MARGIN_X, y + 54, CONTENT_WIDTH, 2);
      y += 68;
    }

    // Table Header
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, TABLE_HEAD_H);
    let colX = MARGIN_X;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 11.5px ${SANS_FONT}`;
    cols.forEach((col) => {
      if (col.align === 'right') {
        ctx.textAlign = 'right';
        ctx.fillText(col.label, colX + col.width - 10, y + 23);
      } else if (col.align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(col.label, colX + col.width / 2, y + 23);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(col.label, colX + 10, y + 23);
      }
      colX += col.width;
    });
    ctx.textAlign = 'left';
    y += TABLE_HEAD_H;

    // Table Rows
    if (slice.rows.length === 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, 64);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, 64);
      ctx.fillStyle = '#64748b';
      ctx.font = `500 13px ${SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada mutasi transaksi pada Rekening Titip Uang ini.', MARGIN_X + CONTENT_WIDTH / 2, y + 36);
      ctx.textAlign = 'left';
      y += 64;
    } else {
      slice.rows.forEach((r, rIdx) => {
        const bg =
          r.arah === 'MASUK'
            ? '#f0fdf4'
            : r.arah === 'KEMBALI'
            ? '#f4f4f5'
            : rIdx % 2 === 1
            ? '#f8fafc'
            : '#ffffff';
        ctx.fillStyle = bg;
        ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, r.rowHeight);

        let rx = MARGIN_X;
        // Col 0: No
        ctx.fillStyle = '#334155';
        ctx.font = `700 12px ${SANS_FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(r.noText, rx + cols[0].width / 2, y + 24);
        rx += cols[0].width;

        // Col 1: Tanggal / Jam
        ctx.textAlign = 'left';
        ctx.fillStyle = '#0f172a';
        ctx.font = `700 12px ${MONO_FONT}`;
        ctx.fillText(r.tanggal, rx + 8, y + 22);
        ctx.fillStyle = '#64748b';
        ctx.font = `500 10.5px ${MONO_FONT}`;
        ctx.fillText(r.jam, rx + 8, y + 38);
        rx += cols[1].width;

        // Col 2: Jenis & ID
        ctx.fillStyle = '#0f172a';
        ctx.font = `700 11.5px ${SANS_FONT}`;
        r.jenisLines.forEach((ln, li) => {
          ctx.fillText(ln, rx + 8, y + 22 + li * 16);
        });
        ctx.fillStyle = '#64748b';
        ctx.font = `500 10.5px ${MONO_FONT}`;
        ctx.fillText(r.txId, rx + 8, y + 22 + r.jenisLines.length * 16);
        rx += cols[2].width;

        // Col 3: Uraian
        r.uraianLines.forEach((ln, li) => {
          ctx.fillStyle = li === 0 ? '#0f172a' : '#475569';
          ctx.font = `${li === 0 ? '700' : '500'} 12px ${SANS_FONT}`;
          ctx.fillText(ln, rx + 8, y + 22 + li * 16.5);
        });
        rx += cols[3].width;

        // Col 4: Masuk
        ctx.textAlign = 'right';
        ctx.fillStyle = r.masukText === '-' ? '#94a3b8' : '#047857';
        ctx.font = `700 12.5px ${MONO_FONT}`;
        ctx.fillText(r.masukText, rx + cols[4].width - 10, y + 24);
        rx += cols[4].width;

        // Col 5: Keluar
        ctx.fillStyle = r.keluarText === '-' ? '#94a3b8' : '#b45309';
        ctx.font = `700 12.5px ${MONO_FONT}`;
        ctx.fillText(r.keluarText, rx + cols[5].width - 10, y + 24);
        rx += cols[5].width;

        // Col 6: Sisa Saldo
        ctx.fillStyle = '#0c4a6e';
        ctx.font = `800 12.5px ${MONO_FONT}`;
        ctx.fillText(r.saldoText, rx + cols[6].width - 10, y + 24);
        ctx.textAlign = 'left';

        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN_X, y + r.rowHeight);
        ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y + r.rowHeight);
        ctx.stroke();

        y += r.rowHeight;
      });
    }

    if (slice.includeTotalAndFooter) {
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, TOTAL_BAR_H);
      ctx.strokeStyle = '#0284c7';
      ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, TOTAL_BAR_H);

      const leftColsW = cols[0].width + cols[1].width + cols[2].width + cols[3].width;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0c4a6e';
      ctx.font = `800 13px ${SANS_FONT}`;
      ctx.fillText(`TOTAL (${rows.length} MUTASI) :`, MARGIN_X + leftColsW - 14, y + 27);

      ctx.fillStyle = '#047857';
      ctx.font = `800 13px ${MONO_FONT}`;
      ctx.fillText(`+${formatRupiah(totalMasukTampil)}`, MARGIN_X + leftColsW + cols[4].width - 10, y + 27);

      ctx.fillStyle = '#b45309';
      ctx.fillText(
        `-${formatRupiah(totalKeluarTampil)}`,
        MARGIN_X + leftColsW + cols[4].width + cols[5].width - 10,
        y + 27
      );

      ctx.fillStyle = '#0c4a6e';
      ctx.fillText(formatRupiah(audit.saldoSaatIni), MARGIN_X + CONTENT_WIDTH - 10, y + 27);
      ctx.textAlign = 'left';
      y += TOTAL_BAR_H + 22;

      // Signature footer
      ctx.fillStyle = '#475569';
      ctx.font = `500 12px ${SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Bagian Keuangan / Kasir PT', MARGIN_X + 180, y + 12);
      ctx.fillText('Karyawan Pemegang Amanah', LOGICAL_WIDTH - MARGIN_X - 180, y + 12);

      ctx.strokeStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(MARGIN_X + 80, y + 66);
      ctx.lineTo(MARGIN_X + 280, y + 66);
      ctx.moveTo(LOGICAL_WIDTH - MARGIN_X - 280, y + 66);
      ctx.lineTo(LOGICAL_WIDTH - MARGIN_X - 80, y + 66);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 12.5px ${SANS_FONT}`;
      ctx.fillText(activeProfil.penanggungJawab || 'Admin Keuangan', MARGIN_X + 180, y + 84);
      ctx.fillText(namaPemegang, LOGICAL_WIDTH - MARGIN_X - 180, y + 84);
      ctx.textAlign = 'left';
    }

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'png' ? undefined : 0.94;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas gagal dikonversi ke gambar.'))),
        mime,
        quality
      );
    });

    const pageSuffix = pages.length > 1 ? `_Hal${pIdx + 1}` : '';
    const fileName = `${baseName}${pageSuffix}.${format}`;
    filenames.push(fileName);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { filenames, pageCount: pages.length };
}
