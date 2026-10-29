import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProfilPerusahaan, UnifiedTransactionItem } from '../server/types.ts';
import { formatRupiah } from './format.ts';

export const NAMA_BULAN_INDO: Record<string, string> = {
  '01': 'Januari',
  '02': 'Februari',
  '03': 'Maret',
  '04': 'April',
  '05': 'Mei',
  '06': 'Juni',
  '07': 'Juli',
  '08': 'Agustus',
  '09': 'September',
  '10': 'Oktober',
  '11': 'November',
  '12': 'Desember',
};

export interface PdfExportOptions {
  /** Main period label shown in header, e.g. "BULAN OKTOBER 2026" or "TANGGAL 23/10/2026" */
  periodeLabel: string;
  /** Subtitle / purpose label, e.g. "LAPORAN BULANAN ARSIP FISIK & AUDIT EKSTERNAL" */
  jenisDokumenLabel: string;
  /** File slug for downloaded .pdf filename, e.g. "Bulanan_Oktober_2026" */
  fileSlug: string;
  /** Optional description of active filters */
  filterKeterangan?: string;
  /** Paper orientation */
  orientation: 'landscape' | 'portrait';
  /** Sort order for journal rows */
  sortOrder: 'ASC' | 'DESC';
  /** Include category & bank account executive breakdown tables before journal rows */
  includeRekapKategoriRekening: boolean;
  /** Include signature verification block at the end */
  includeTandaTangan: boolean;
  /** Signatory names */
  namaStafKeuangan?: string;
  namaPemeriksaAudit?: string;
  namaPimpinan?: string;
  /** Optional company profile from API */
  profilPerusahaan?: ProfilPerusahaan | null;
}

/**
 * Parses DD/MM/YYYY or YYYY-MM-DD + HH:mm into a comparable sortable string YYYY-MM-DD HH:mm
 */
export function toSortableTimestamp(tanggal: string, jam?: string): string {
  const clean = (tanggal || '').trim();
  let ymd = clean;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('/');
    ymd = `${y}-${m}-${d}`;
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('/');
    ymd = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return `${ymd} ${(jam || '00:00').padStart(5, '0')}`;
}

/**
 * Extracts { day, month, year } (padded 2-digit day/month, 4-digit year) from DD/MM/YYYY or YYYY-MM-DD
 */
export function extractDateParts(tanggal: string): { day: string; month: string; year: string } | null {
  if (!tanggal) return null;
  const clean = tanggal.trim();
  const slashParts = clean.split('/');
  if (slashParts.length === 3) {
    if (slashParts[0].length === 4) {
      return {
        year: slashParts[0],
        month: slashParts[1].padStart(2, '0'),
        day: slashParts[2].padStart(2, '0'),
      };
    }
    return {
      day: slashParts[0].padStart(2, '0'),
      month: slashParts[1].padStart(2, '0'),
      year: slashParts[2],
    };
  }
  const dashParts = clean.split('-');
  if (dashParts.length === 3) {
    if (dashParts[0].length === 4) {
      return {
        year: dashParts[0],
        month: dashParts[1].padStart(2, '0'),
        day: dashParts[2].padStart(2, '0'),
      };
    }
    return {
      day: dashParts[0].padStart(2, '0'),
      month: dashParts[1].padStart(2, '0'),
      year: dashParts[2],
    };
  }
  return null;
}

/**
 * Generates and downloads an audit-ready PDF report for Rekap Semua Transaksi.
 */
export function exportRekapTransaksiToPdf(
  rawTransactions: UnifiedTransactionItem[],
  options: PdfExportOptions
): { fileName: string; totalRows: number } {
  const doc = new jsPDF({
    orientation: options.orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  // Sort transactions according to requested audit order
  const transactions = [...rawTransactions].sort((a, b) => {
    const ka = toSortableTimestamp(a.tanggal, a.jam);
    const kb = toSortableTimestamp(b.tanggal, b.jam);
    return options.sortOrder === 'ASC' ? ka.localeCompare(kb) : kb.localeCompare(ka);
  });

  // Compute financial totals
  const totalTransaksi = transactions.length;
  const totalMasuk = transactions.reduce((sum, tx) => sum + (tx.nominalMasuk || 0), 0);
  const totalKeluar = transactions.reduce((sum, tx) => sum + (tx.nominalKeluar || 0), 0);
  const netCashflow = totalMasuk - totalKeluar;
  const totalNonTunai = transactions
    .filter((tx) => tx.arusUang === 'NON_TUNAI')
    .reduce((sum, tx) => sum + (tx.nominal || 0), 0);
  const totalMutasi = transactions
    .filter((tx) => tx.arusUang === 'MUTASI')
    .reduce((sum, tx) => sum + (tx.nominal || 0), 0);

  const masukCount = transactions.filter((tx) => tx.arusUang === 'MASUK').length;
  const keluarCount = transactions.filter((tx) => tx.arusUang === 'KELUAR').length;
  const nonTunaiCount = transactions.filter((tx) => tx.arusUang === 'NON_TUNAI').length;
  const mutasiCount = transactions.filter((tx) => tx.arusUang === 'MUTASI').length;

  // Metadata & Timestamps
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const jamCetak = now
    .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .replace(/\./g, ':');
  const waktuCetakWib = `${dd}/${mm}/${yyyy} ${jamCetak} WIB`;
  const noDokumen = `AUD-FIN/${yyyy}${mm}${dd}/${String(totalTransaksi).padStart(4, '0')}`;

  const namaPerusahaan = (options.profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA').toUpperCase();
  const subPerusahaan =
    options.profilPerusahaan?.catatanHeaderNota ||
    'PERDAGANGAN SARANA PERTANIAN, PERGUDANGAN & PEMBELIAN HASIL BUMI';
  const alamatPerusahaan =
    options.profilPerusahaan?.alamat || 'Jl. Raya Agro Industri No. 88, Sentra Agrobisnis Terpadu';
  const kontakPerusahaan = `Telp: ${options.profilPerusahaan?.telepon || '(021) 8892-0192'}  |  Email: ${
    options.profilPerusahaan?.email || 'keuangan@wijayaagro.com'
  }`;

  // =========================================================================
  // 1. KOP SURAT RESMI (CORPORATE AUDIT LETTERHEAD)
  // =========================================================================
  doc.setFillColor(15, 76, 92); // Deep slate-cyan accent bar
  doc.rect(marginX, 10, 4.5, 21, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(namaPerusahaan, marginX + 7.5, 15.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(subPerusahaan.toUpperCase(), marginX + 7.5, 20.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${alamatPerusahaan}  •  ${kontakPerusahaan}`, marginX + 7.5, 25);

  // Right-aligned Document Audit Stamp Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 76, 92);
  doc.text('LAPORAN REKAPITULASI TRANSAKSI KEUANGAN', pageWidth - marginX, 15, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(options.jenisDokumenLabel.toUpperCase(), pageWidth - marginX, 19.8, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`No. Dokumen: ${noDokumen}`, pageWidth - marginX, 24.3, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak: ${waktuCetakWib}`, pageWidth - marginX, 28.5, { align: 'right' });

  // Double horizontal rule under letterhead
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(marginX, 32.5, pageWidth - marginX, 32.5);
  doc.setLineWidth(0.2);
  doc.line(marginX, 33.5, pageWidth - marginX, 33.5);

  // =========================================================================
  // 2. INFORMASI PERIODE & FILTER AUDIT BANNER
  // =========================================================================
  let cursorY = 36.5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, cursorY, contentWidth, 12, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`PERIODE LAPORAN : ${options.periodeLabel.toUpperCase()}`, marginX + 3.5, cursorY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const filterDesc = options.filterKeterangan || 'Seluruh Arus Uang, Seluruh Kategori & Seluruh Pihak Terkait (Standar Audit Lengkap)';
  doc.text(`Cakupan Filter : ${filterDesc}`, marginX + 3.5, cursorY + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Urutan Jurnal: ${options.sortOrder === 'ASC' ? 'Kronologis (Awal - Akhir)' : 'Terbaru - Terlama'}`,
    pageWidth - marginX - 3.5,
    cursorY + 5,
    { align: 'right' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Jumlah Baris Jurnal: ${totalTransaksi} Transaksi`, pageWidth - marginX - 3.5, cursorY + 9.5, {
    align: 'right',
  });

  cursorY += 15;

  // =========================================================================
  // 3. IKHTISAR EKSEKUTIF ARUS KAS (5 SUMMARY BOXES)
  // =========================================================================
  const gap = 2.5;
  const boxCount = 5;
  const boxW = (contentWidth - gap * (boxCount - 1)) / boxCount;
  const boxH = 16.5;

  const kpiBoxes: Array<{
    title: string;
    value: string;
    sub: string;
    bg: [number, number, number];
    border: [number, number, number];
    textColor: [number, number, number];
  }> = [
    {
      title: 'TOTAL VOLUME JURNAL',
      value: `${totalTransaksi} Transaksi`,
      sub: `Mutasi Internal: ${mutasiCount} tx (${formatRupiah(totalMutasi)})`,
      bg: [248, 250, 252],
      border: [203, 213, 225],
      textColor: [15, 23, 42],
    },
    {
      title: 'TOTAL UANG MASUK (DEBET)',
      value: `+${formatRupiah(totalMasuk)}`,
      sub: `${masukCount} transaksi penerimaan kas/bank`,
      bg: [240, 253, 244],
      border: [134, 239, 172],
      textColor: [21, 128, 61],
    },
    {
      title: 'TOTAL UANG KELUAR (KREDIT)',
      value: `-${formatRupiah(totalKeluar)}`,
      sub: `${keluarCount} transaksi belanja/biaya/upah`,
      bg: [255, 241, 242],
      border: [253, 164, 175],
      textColor: [190, 18, 60],
    },
    {
      title: 'ARUS KAS BERSIH (NET)',
      value: `${netCashflow >= 0 ? '+' : '-'}${formatRupiah(Math.abs(netCashflow))}`,
      sub: netCashflow >= 0 ? 'Status Kas: SURPLUS BERSIH' : 'Status Kas: DEFISIT BERSIH',
      bg: netCashflow >= 0 ? [239, 246, 255] : [255, 251, 235],
      border: netCashflow >= 0 ? [147, 197, 253] : [252, 211, 77],
      textColor: netCashflow >= 0 ? [29, 78, 216] : [180, 83, 9],
    },
    {
      title: 'TRANSAKSI NON-TUNAI / BON',
      value: formatRupiah(totalNonTunai),
      sub: `${nonTunaiCount} tx piutang bon / titip timbang`,
      bg: [250, 245, 255],
      border: [216, 180, 254],
      textColor: [107, 33, 168],
    },
  ];

  kpiBoxes.forEach((box, idx) => {
    const bx = marginX + idx * (boxW + gap);
    doc.setFillColor(box.bg[0], box.bg[1], box.bg[2]);
    doc.setDrawColor(box.border[0], box.border[1], box.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(bx, cursorY, boxW, boxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(box.title, bx + 2.5, cursorY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(options.orientation === 'landscape' ? 8.8 : 7.5);
    doc.setTextColor(box.textColor[0], box.textColor[1], box.textColor[2]);
    doc.text(box.value, bx + 2.5, cursorY + 10.3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(box.sub, bx + 2.5, cursorY + 14.5, { maxWidth: boxW - 4 });
  });

  cursorY += boxH + 5;

  // =========================================================================
  // 4. REKAPITULASI PER KATEGORI TRANSAKSI & REKENING (AUDIT BREAKDOWN)
  // =========================================================================
  if (options.includeRekapKategoriRekening && transactions.length > 0) {
    // Group by Jenis Transaksi
    const kategoriMap = new Map<
      string,
      {
        label: string;
        count: number;
        masuk: number;
        keluar: number;
        nonTunaiMutasi: number;
      }
    >();

    // Group by Rekening
    const rekeningMap = new Map<
      string,
      {
        rekening: string;
        count: number;
        masuk: number;
        keluar: number;
        nonTunaiMutasi: number;
      }
    >();

    for (const tx of transactions) {
      const katItem = kategoriMap.get(tx.jenis) || {
        label: tx.jenisLabel,
        count: 0,
        masuk: 0,
        keluar: 0,
        nonTunaiMutasi: 0,
      };
      katItem.count += 1;
      katItem.masuk += tx.nominalMasuk || 0;
      katItem.keluar += tx.nominalKeluar || 0;
      if (tx.arusUang === 'NON_TUNAI' || tx.arusUang === 'MUTASI') {
        katItem.nonTunaiMutasi += tx.nominal || 0;
      }
      kategoriMap.set(tx.jenis, katItem);

      const rekKey = tx.rekening || 'KAS01';
      const rekItem = rekeningMap.get(rekKey) || {
        rekening: rekKey,
        count: 0,
        masuk: 0,
        keluar: 0,
        nonTunaiMutasi: 0,
      };
      rekItem.count += 1;
      rekItem.masuk += tx.nominalMasuk || 0;
      rekItem.keluar += tx.nominalKeluar || 0;
      if (tx.arusUang === 'NON_TUNAI' || tx.arusUang === 'MUTASI') {
        rekItem.nonTunaiMutasi += tx.nominal || 0;
      }
      rekeningMap.set(rekKey, rekItem);
    }

    const kategoriRows = Array.from(kategoriMap.values())
      .sort((a, b) => b.masuk + b.keluar + b.nonTunaiMutasi - (a.masuk + a.keluar + a.nonTunaiMutasi))
      .map((k, i) => [
        String(i + 1),
        k.label,
        `${k.count} tx`,
        k.masuk > 0 ? `+${formatRupiah(k.masuk)}` : '-',
        k.keluar > 0 ? `-${formatRupiah(k.keluar)}` : '-',
        k.nonTunaiMutasi > 0 ? formatRupiah(k.nonTunaiMutasi) : '-',
      ]);

    const rekeningRows = Array.from(rekeningMap.values())
      .sort((a, b) => b.masuk + b.keluar - (a.masuk + a.keluar))
      .map((r, i) => {
        const net = r.masuk - r.keluar;
        return [
          String(i + 1),
          r.rekening,
          `${r.count} tx`,
          r.masuk > 0 ? `+${formatRupiah(r.masuk)}` : '-',
          r.keluar > 0 ? `-${formatRupiah(r.keluar)}` : '-',
          `${net >= 0 ? '+' : '-'}${formatRupiah(Math.abs(net))}`,
        ];
      });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('A. RINGKASAN EKSEKUTIF PER KATEGORI TRANSAKSI', marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 1.8,
      head: [['No', 'Kategori Transaksi', 'Volume', 'Uang Masuk (+)', 'Uang Keluar (-)', 'Non-Tunai / Mutasi']],
      body: kategoriRows,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: 1.6,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 34, halign: 'right', textColor: [21, 128, 61] },
        4: { cellWidth: 34, halign: 'right', textColor: [190, 18, 60] },
        5: { cellWidth: 34, halign: 'right', textColor: [107, 33, 168] },
      },
      margin: { left: marginX, right: marginX },
    });

    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 20) + 4.5;

    // Check space for Table B
    if (cursorY + 25 > pageHeight - 18) {
      doc.addPage();
      cursorY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('B. RINGKASAN MUTASI PER REKENING KAS & BANK', marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 1.8,
      head: [['No', 'Kode Rekening Terlibat', 'Volume', 'Total Masuk (+)', 'Total Keluar (-)', 'Arus Bersih Rekening']],
      body: rekeningRows,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: 1.6,
        textColor: [30, 41, 59],
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [15, 76, 92],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 'auto', font: 'courier', fontStyle: 'bold' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 34, halign: 'right', textColor: [21, 128, 61] },
        4: { cellWidth: 34, halign: 'right', textColor: [190, 18, 60] },
        5: { cellWidth: 34, halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] },
      },
      margin: { left: marginX, right: marginX },
    });

    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 20) + 5.5;
  }

  // =========================================================================
  // 5. TABEL RINCIAN JURNAL TRANSAKSI LENGKAP (ITEMIZED AUDIT LEDGER)
  // =========================================================================
  if (cursorY + 24 > pageHeight - 18) {
    doc.addPage();
    cursorY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  const ledgerSectionPrefix = options.includeRekapKategoriRekening && transactions.length > 0 ? 'C. ' : '';
  doc.text(
    `${ledgerSectionPrefix}DAFTAR RINCIAN JURNAL TRANSAKSI (${transactions.length} RECORD)`,
    marginX,
    cursorY
  );

  const isLandscape = options.orientation === 'landscape';

  const journalHead = isLandscape
    ? [
        [
          'No',
          'Tanggal & Jam',
          'ID / No. Bukti',
          'Kategori',
          'Pihak Terkait',
          'Deskripsi / Rincian Transaksi',
          'Rekening',
          'Uang Masuk (+)',
          'Uang Keluar (-)',
          'Non-Tunai/Mutasi',
          'Status',
        ],
      ]
    : [
        [
          'No',
          'Waktu',
          'ID Bukti & Kategori',
          'Pihak & Rincian Transaksi',
          'Rekening',
          'Masuk (+)',
          'Keluar (-)',
          'Non-Tunai',
        ],
      ];

  const journalBody =
    transactions.length === 0
      ? [
          isLandscape
            ? ['-', '-', '-', '-', '-', 'NIHIL — Tidak ada transaksi tercatat pada periode/kriteria ini', '-', 'Rp 0', 'Rp 0', 'Rp 0', '-']
            : ['-', '-', '-', 'NIHIL — Tidak ada transaksi tercatat pada periode ini', '-', 'Rp 0', 'Rp 0', 'Rp 0'],
        ]
      : transactions.map((tx, idx) => {
          const nonTunaiOrMutasi =
            tx.arusUang === 'NON_TUNAI' || tx.arusUang === 'MUTASI'
              ? `${tx.arusUang === 'MUTASI' ? '[Mutasi] ' : ''}${formatRupiah(tx.nominal)}`
              : '-';

          if (isLandscape) {
            return [
              String(idx + 1),
              `${tx.tanggal}\n${tx.jam} WIB`,
              tx.id,
              tx.jenisLabel,
              `${tx.pihakTerkait}${tx.divisi ? `\n[${tx.divisi}]` : ''}`,
              `${tx.deskripsi}${tx.fotoBukti ? ' [Nota Terlampir]' : ''}`,
              `${tx.rekening}\n(${tx.metode})`,
              tx.nominalMasuk > 0 ? `+${formatRupiah(tx.nominalMasuk)}` : '-',
              tx.nominalKeluar > 0 ? `-${formatRupiah(tx.nominalKeluar)}` : '-',
              nonTunaiOrMutasi,
              tx.status,
            ];
          }

          return [
            String(idx + 1),
            `${tx.tanggal}\n${tx.jam}`,
            `${tx.id}\n${tx.jenisLabel}`,
            `${tx.pihakTerkait}\n${tx.deskripsi}`,
            tx.rekening,
            tx.nominalMasuk > 0 ? `+${formatRupiah(tx.nominalMasuk)}` : '-',
            tx.nominalKeluar > 0 ? `-${formatRupiah(tx.nominalKeluar)}` : '-',
            nonTunaiOrMutasi,
          ];
        });

  const journalFoot = isLandscape
    ? [
        [
          {
            content: `GRAND TOTAL PERIODE (${totalTransaksi} TRANSAKSI)  |  ARUS KAS BERSIH: ${
              netCashflow >= 0 ? '+' : '-'
            }${formatRupiah(Math.abs(netCashflow))}`,
            colSpan: 7,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
          {
            content: `+${formatRupiah(totalMasuk)}`,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [21, 128, 61] as [number, number, number] },
          },
          {
            content: `-${formatRupiah(totalKeluar)}`,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [190, 18, 60] as [number, number, number] },
          },
          {
            content: formatRupiah(totalNonTunai + totalMutasi),
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [107, 33, 168] as [number, number, number] },
          },
          {
            content: netCashflow >= 0 ? 'SURPLUS' : 'DEFISIT',
            styles: { halign: 'center' as const, fontStyle: 'bold' as const },
          },
        ],
      ]
    : [
        [
          {
            content: `TOTAL (${totalTransaksi} TX) | NET: ${netCashflow >= 0 ? '+' : '-'}${formatRupiah(Math.abs(netCashflow))}`,
            colSpan: 5,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
          {
            content: `+${formatRupiah(totalMasuk)}`,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [21, 128, 61] as [number, number, number] },
          },
          {
            content: `-${formatRupiah(totalKeluar)}`,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [190, 18, 60] as [number, number, number] },
          },
          {
            content: formatRupiah(totalNonTunai + totalMutasi),
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
        ],
      ];

  autoTable(doc, {
    startY: cursorY + 1.8,
    head: journalHead,
    body: journalBody,
    foot: journalFoot,
    showHead: 'everyPage',
    showFoot: 'lastPage',
    theme: 'striped',
    styles: {
      fontSize: isLandscape ? 6.6 : 6.2,
      cellPadding: 1.7,
      textColor: [30, 41, 59],
      valign: 'top',
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: isLandscape ? 6.8 : 6.3,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: isLandscape ? 7 : 6.4,
      lineColor: [148, 163, 184],
      lineWidth: 0.25,
    },
    columnStyles: isLandscape
      ? {
          0: { cellWidth: 8, halign: 'center' },
          1: { cellWidth: 20 },
          2: { cellWidth: 24, font: 'courier', fontStyle: 'bold' },
          3: { cellWidth: 26 },
          4: { cellWidth: 30, fontStyle: 'bold' },
          5: { cellWidth: 'auto' },
          6: { cellWidth: 21, font: 'courier' },
          7: { cellWidth: 26, halign: 'right', textColor: [21, 128, 61], fontStyle: 'bold' },
          8: { cellWidth: 26, halign: 'right', textColor: [190, 18, 60], fontStyle: 'bold' },
          9: { cellWidth: 24, halign: 'right', textColor: [107, 33, 168] },
          10: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        }
      : {
          0: { cellWidth: 7, halign: 'center' },
          1: { cellWidth: 17 },
          2: { cellWidth: 25, font: 'courier' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 16, font: 'courier' },
          5: { cellWidth: 23, halign: 'right', textColor: [21, 128, 61], fontStyle: 'bold' },
          6: { cellWidth: 23, halign: 'right', textColor: [190, 18, 60], fontStyle: 'bold' },
          7: { cellWidth: 21, halign: 'right', textColor: [107, 33, 168] },
        },
    margin: { left: marginX, right: marginX, bottom: 16 },
  });

  // =========================================================================
  // 6. KOLOM PENGESAHAN & VERIFIKASI AUDIT (SIGNATURE BLOCK)
  // =========================================================================
  if (options.includeTandaTangan) {
    let signY = ((doc as any).lastAutoTable?.finalY || cursorY + 30) + 8;

    // Ensure the 38mm signature block fits cleanly above page footer
    if (signY + 38 > pageHeight - 14) {
      doc.addPage();
      signY = 20;
    }

    // Audit Declaration Note
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginX, signY, contentWidth, 8, 1, 1, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      'Pernyataan Verifikasi: Dokumen laporan ini dihasilkan secara otomatis dari buku besar terpadu ERP PT. Wijaya Agro Perkasa dan sah digunakan sebagai arsip fisik pembukuan maupun bahan pemeriksaan audit eksternal.',
      marginX + 3,
      signY + 5,
      { maxWidth: contentWidth - 6 }
    );

    const colY = signY + 13;
    const colW = contentWidth / 3;

    const signatories = [
      {
        roleTitle: 'Dibuat & Disusun Oleh,',
        subRole: 'Staf Keuangan / Kasir Utama',
        personName: options.namaStafKeuangan?.trim() || '( ........................................ )',
      },
      {
        roleTitle: 'Diperiksa & Diverifikasi Oleh,',
        subRole: 'Kepala Keuangan / Auditor',
        personName: options.namaPemeriksaAudit?.trim() || '( ........................................ )',
      },
      {
        roleTitle: 'Disetujui & Disahkan Oleh,',
        subRole: 'Direktur / Pimpinan Perusahaan',
        personName:
          options.namaPimpinan?.trim() ||
          options.profilPerusahaan?.penanggungJawab?.trim() ||
          '( ........................................ )',
      },
    ];

    signatories.forEach((sig, i) => {
      const centerX = marginX + colW * i + colW / 2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(sig.roleTitle, centerX, colY, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(sig.subRole, centerX, colY + 4, { align: 'center' });

      // Signature space (16mm)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(sig.personName, centerX, colY + 21, { align: 'center' });

      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.25);
      doc.line(centerX - 26, colY + 22.5, centerX + 26, colY + 22.5);
    });
  }

  // =========================================================================
  // 7. RUNNING FOOTER & PAGE NUMBERING ON EVERY PAGE
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 10, pageWidth - marginX, pageHeight - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${namaPerusahaan} • Arsip Keuangan & Audit Eksternal • No. Dok: ${noDokumen} • Periode: ${options.periodeLabel}`,
      marginX,
      pageHeight - 6.2
    );
    doc.setFont('helvetica', 'bold');
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 6.2, { align: 'right' });
  }

  const safeSlug = options.fileSlug.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Laporan_Rekap_Transaksi_${safeSlug}.pdf`;
  doc.save(fileName);

  return { fileName, totalRows: totalTransaksi };
}
