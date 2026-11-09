import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_PT_LOGO_URL,
  getRoleMitraLabel,
  ProfilPerusahaan,
  RekeningKoranHistoryItem,
  RekeningKoranMitraSummary,
} from '../server/types.ts';
import { formatRupiah, formatTanggalIndo } from './format.ts';

export interface ExportRekeningKoranPdfOptions {
  printScope?: 'SALDO_BERJALAN' | 'SEMUA_HISTORY';
  includeNotaProofs?: boolean;
}

/**
 * Helper to embed company logo / external image as Data URL in jsPDF
 */
export async function loadLogoDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function formatItemTextForPdf(row: RekeningKoranHistoryItem): {
  itemText: string;
  qtyText: string;
  hargaText: string;
  ketText: string;
} {
  const items = row.itemsDetail || [];
  const isMulti = items.length > 1;
  const single = items.length === 1 ? items[0] : null;
  const ketText = (row.catatanTransaksi || row.catatanNgunci || '').trim() || '-';

  if (isMulti) {
    const headerLabel = row.jenis.replace(/_/g, ' ');
    const itemLines = items.map(
      (it, idx) =>
        `${idx + 1}. ${it.nama} (${it.qty} ${it.satuan} x ${formatRupiah(it.harga)} = ${formatRupiah(it.subtotal)})`
    );
    return {
      itemText: `${headerLabel}\n${itemLines.join('\n')}`,
      qtyText: `${items.length} Item`,
      hargaText: 'Rincian',
      ketText,
    };
  }

  if (single) {
    return {
      itemText: single.nama,
      qtyText: `${single.qty} ${single.satuan}`,
      hargaText: formatRupiah(single.harga),
      ketText,
    };
  }

  return {
    itemText: row.keterangan || row.jenis.replace(/_/g, ' '),
    qtyText: row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1 Trx' : '-'),
    hargaText: row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-'),
    ketText,
  };
}

/**
 * Generates and downloads an authentic .pdf document matching PT Wijaya Agro Perkasa
 * Invoice / Rekening Koran directly to the user's browser.
 */
export async function exportRekeningKoranToPdf(
  statement: RekeningKoranMitraSummary,
  profilPerusahaan?: ProfilPerusahaan | null,
  rekeningUtamaDetail?: {
    kode: string;
    nama: string;
    nomorRekening?: string;
    atasNama?: string;
  },
  options: ExportRekeningKoranPdfOptions = {}
): Promise<void> {
  const printScope = options.printScope || 'SALDO_BERJALAN';
  const includeNotaProofs = options.includeNotaProofs ?? true;

  const src = profilPerusahaan || statement.profilPerusahaan;
  const rawAlamat = src?.alamat?.trim();
  const rawTelepon = src?.telepon?.trim();
  const rawEmail = src?.email?.trim();
  const activeProfil: ProfilPerusahaan = {
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
    updateTerakhir: src?.updateTerakhir,
  };

  const runningRows: RekeningKoranHistoryItem[] = Array.isArray(statement.historySaldoBerjalan)
    ? statement.historySaldoBerjalan
    : (statement.history || []).filter((h) => h.isSaldoBerjalan !== false);

  const activeRows: RekeningKoranHistoryItem[] =
    printScope === 'SALDO_BERJALAN' ? runningRows : statement.history || [];

  // Extract uploaded physical nota proofs
  const seenParentIds = new Set<string>();
  const notaAttachments = activeRows
    .filter((h) => {
      if (!h.fotoNota) return false;
      const parentKey = h.idTransaksiInduk || h.id;
      if (seenParentIds.has(parentKey)) return false;
      seenParentIds.add(parentKey);
      return true;
    })
    .flatMap((h) => {
      const parentId = h.idTransaksiInduk || h.id;
      const rawImgs = (h.fotoNota || '')
        .split('|||')
        .map((s) => s.trim())
        .filter(Boolean);
      const siblingRows = activeRows.filter((x) => (x.idTransaksiInduk || x.id) === parentId);
      const resolvedNominal =
        siblingRows.length > 1
          ? siblingRows.reduce(
              (sum, x) =>
                sum +
                ((x.piutangBerjalan ?? 0) > 0
                  ? x.piutangBerjalan!
                  : (x.titipBerjalan ?? 0) > 0
                  ? x.titipBerjalan!
                  : x.debet > 0
                  ? x.debet
                  : x.kredit > 0
                  ? x.kredit
                  : x.nominalMutasiHak || 0),
              0
            )
          : (h.piutangBerjalan ?? 0) > 0
          ? h.piutangBerjalan!
          : (h.titipBerjalan ?? 0) > 0
          ? h.titipBerjalan!
          : h.debet > 0
          ? h.debet
          : h.kredit > 0
          ? h.kredit
          : h.nominalMutasiHak || h.itemsDetail?.[0]?.subtotal || 0;
      const combinedKet =
        siblingRows.length > 1
          ? siblingRows
              .map((x) => (x.catatanTransaksi || '').trim())
              .filter(Boolean)
              .join(', ')
          : (h.catatanTransaksi || h.keterangan || '').trim();
      return rawImgs.map((img, idx) => ({
        txId: parentId,
        noNotaLalu: h.noNotaLalu,
        tanggal: h.tanggal,
        jenis: h.jenis,
        keterangan: combinedKet,
        nominal: resolvedNominal,
        image: img,
        index: idx + 1,
        totalCount: rawImgs.length,
      }));
    });

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const noDokumen = `RK/${statement.kodeMitra}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${activeRows.length}`;

  const sisaBayarBersih =
    statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip);
  const sisaTitipBersih =
    statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan);

  const getRowPiutangVal = (row: RekeningKoranHistoryItem) =>
    printScope === 'SALDO_BERJALAN'
      ? row.piutangBerjalan ?? row.sisaPiutangNota ?? row.debet
      : row.debet;

  const getRowTitipVal = (row: RekeningKoranHistoryItem) =>
    printScope === 'SALDO_BERJALAN'
      ? row.titipBerjalan ?? (row.kredit === 0 ? row.nominalMutasiHak || 0 : 0)
      : row.kredit > 0
      ? row.kredit
      : row.nominalMutasiHak || 0;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logoDataUrl = await loadLogoDataUrl(activeProfil.logoUrl || DEFAULT_PT_LOGO_URL);

  // 1. KOP NOTA MODERN KHAS PT WIJAYA AGRO PERKASA
  let headerTextX = 14;
  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.includes('png') ? 'PNG' : 'JPEG';
      doc.addImage(logoDataUrl, fmt, 14, 11, 18, 18, undefined, 'FAST');
      headerTextX = 35;
    } catch {
      headerTextX = 14;
    }
  } else {
    doc.setFillColor(15, 23, 42);
    doc.rect(14, 11, 4, 18, 'F');
    headerTextX = 21;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(activeProfil.namaPerusahaan.toUpperCase(), headerTextX, 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(55, 65, 81);
  const wrappedAddr = doc.splitTextToSize(activeProfil.alamat, pageWidth - headerTextX - 72);
  doc.text(wrappedAddr.slice(0, 2), headerTextX, 20.5);

  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  doc.text('TELPON KASIR 0821 44 999 305 | TELPON ADM 0812 2000 3305', headerTextX, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(75, 85, 99);
  doc.text(`EMAIL : ${activeProfil.email}`, headerTextX, 29.8);

  // Right Box: INVOICE / REKENING KORAN
  const rightBoxW = 62;
  const rightBoxX = pageWidth - 14 - rightBoxW;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.35);
  doc.roundedRect(rightBoxX, 11, rightBoxW, 20, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('INVOICE / REKENING KORAN', rightBoxX + rightBoxW / 2, 15.5, { align: 'center' });
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(rightBoxX + 3, 17.2, rightBoxX + rightBoxW - 3, 17.2);

  const roleLabelPdf = getRoleMitraLabel(statement.role, {
    isAnakPerusahaan: statement.isAnakPerusahaan,
    isKaryawan: statement.isKaryawan,
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`No. Dok  : ${noDokumen}`, rightBoxX + 3, 21);
  doc.text(`Tanggal  : ${tglCetak} ${jamCetak}`, rightBoxX + 3, 24.5);
  doc.text(
    `Buku     : ${printScope === 'SALDO_BERJALAN' ? 'SALDO BERJALAN' : 'SEMUA + HISTORY'}`,
    rightBoxX + 3,
    28
  );

  // Thick separator
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(14, 33.5, pageWidth - 14, 33.5);

  // 2. SUB-HEADER: KEPADA YTH (Left) & JUMLAH YANG HARUS DI BAYAR (Right)
  const subY = 36.5;
  const leftW = 106;
  const rightW = pageWidth - 28 - leftW - 4;
  const rightX = 14 + leftW + 4;
  const subH = 24;

  // Left box: KEPADA YTH
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, subY, leftW, subH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('KEPADA YTH :', 17, subY + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('NAMA', 17, subY + 9);
  doc.text('ALAMAT', 17, subY + 13);
  doc.text('PHONE', 17, subY + 17);
  doc.text('STATUS', 17, subY + 21);

  doc.setTextColor(15, 23, 42);
  doc.text(`: ${statement.namaMitra.toUpperCase()} (${statement.kodeMitra})`, 33, subY + 9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `: ${doc.splitTextToSize(statement.alamat || '-', leftW - 36)[0] || '-'}`,
    33,
    subY + 13
  );
  doc.text(`: ${statement.telepon || '-'}`, 33, subY + 17);
  doc.setFont('helvetica', 'bold');
  const statusBerjalanLabel =
    sisaBayarBersih > 0
      ? `PIUTANG MITRA (${roleLabelPdf})`
      : sisaTitipBersih > 0
      ? `HUTANG PT KE MITRA (${roleLabelPdf})`
      : `SALDO IMPAS / LUNAS (${roleLabelPdf})`;
  doc.text(`: ${statusBerjalanLabel}`, 33, subY + 21);

  // Right box: YANG HARUS DI BAYAR (PIUTANG / HUTANG)
  doc.setFillColor(254, 252, 232); // Warm amber-50
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.roundedRect(rightX, subY, rightW, subH, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  if (sisaBayarBersih > 0) {
    doc.setTextColor(15, 23, 42);
    doc.text('YANG HARUS DI BAYAR (PIUTANG) :', rightX + 3.5, subY + 5.5);
    doc.setFontSize(11.5);
    doc.setTextColor(159, 18, 57); // Rose 800
    doc.text(`PIUTANG ${formatRupiah(sisaBayarBersih)}`, rightX + 3.5, subY + 13.5);
  } else if (sisaTitipBersih > 0) {
    doc.setTextColor(6, 95, 70);
    doc.text('YANG HARUS DI BAYAR (HUTANG PT) :', rightX + 3.5, subY + 5.5);
    doc.setFontSize(11.5);
    doc.setTextColor(6, 95, 70);
    doc.text(`HUTANG ${formatRupiah(sisaTitipBersih)}`, rightX + 3.5, subY + 13.5);
  } else {
    doc.setTextColor(15, 23, 42);
    doc.text('JUMLAH YANG HARUS DI BAYAR :', rightX + 3.5, subY + 5.5);
    doc.setFontSize(11.5);
    doc.setTextColor(6, 95, 70);
    doc.text('Rp 0 (IMPAS / LUNAS)', rightX + 3.5, subY + 13.5);
  }

  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.2);
  doc.line(rightX + 3.5, subY + 16.5, rightX + rightW - 3.5, subY + 16.5);

  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(55, 65, 81);
  doc.text(
    `Piutang: ${formatRupiah(statement.totalBonKeseluruhan)} | Titip: ${formatRupiah(statement.totalTitip)}`,
    rightX + 3.5,
    subY + 21
  );

  // 3. TABEL REKENING KORAN (NO. | TANGGAL | ITEM | QTY | HARGA | PIUTANG | TITIP | KETERANGAN)
  const tableHead = [
    [
      'NO.',
      'TANGGAL',
      'ITEM',
      'QTY',
      'HARGA',
      printScope === 'SALDO_BERJALAN' ? 'PIUTANG' : 'BON (+)',
      printScope === 'SALDO_BERJALAN' ? 'TITIP' : 'BAYAR/TITIP',
      'KETERANGAN',
    ],
  ];

  const tableBody =
    activeRows.length === 0
      ? [
          [
            '-',
            '-',
            printScope === 'SALDO_BERJALAN'
              ? 'Tidak ada saldo piutang atau titipan yang sedang berjalan'
              : 'Belum ada histori transaksi',
            '-',
            '-',
            '-',
            '-',
            '-',
          ],
        ]
      : activeRows.map((row, idx) => {
          const formatted = formatItemTextForPdf(row);
          const piutangVal = getRowPiutangVal(row);
          const titipVal = getRowTitipVal(row);
          return [
            String(idx + 1),
            row.tanggal,
            formatted.itemText,
            formatted.qtyText,
            formatted.hargaText,
            piutangVal > 0 ? formatRupiah(piutangVal) : '-',
            titipVal > 0 ? formatRupiah(titipVal) : '-',
            formatted.ketText,
          ];
        });

  const netSummaryLabel =
    sisaBayarBersih > 0
      ? `Piutang: ${formatRupiah(sisaBayarBersih)}`
      : sisaTitipBersih > 0
      ? `Hutang: ${formatRupiah(sisaTitipBersih)}`
      : 'IMPAS (Rp 0)';

  autoTable(doc, {
    startY: 64,
    head: tableHead,
    body: tableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42], // Zinc/Slate 900
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'left',
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 6.8,
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
      1: { cellWidth: 18, font: 'courier' },
      2: { cellWidth: 50 },
      3: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 21, halign: 'right', font: 'courier' },
      5: { cellWidth: 22, halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [159, 18, 57] },
      6: { cellWidth: 22, halign: 'right', font: 'courier', fontStyle: 'bold', textColor: [6, 95, 70] },
      7: { cellWidth: 26 },
    },
    foot: [
      [
        {
          content: 'TOTAL SALDO BERJALAN :',
          colSpan: 5,
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5 },
        },
        {
          content: formatRupiah(statement.totalBonKeseluruhan),
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5, textColor: [159, 18, 57] },
        },
        {
          content: formatRupiah(statement.totalTitip),
          styles: { halign: 'right', fontStyle: 'bold', fontSize: 7.5, textColor: [6, 95, 70] },
        },
        {
          content: netSummaryLabel,
          styles: { halign: 'left', fontStyle: 'bold', fontSize: 7, textColor: [15, 23, 42] },
        },
      ],
    ],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineColor: [15, 23, 42],
      lineWidth: 0.3,
    },
    margin: { left: 14, right: 14 },
  });

  // 4. FOOTER KHAS NOTA LAMA: TF REKENING VIA, STEMPEL PT, & TERIMA KASIH / KASIR
  const lastY = (doc as any).lastAutoTable?.finalY || 180;
  let footY = lastY + 8;
  if (footY + 34 > 285) {
    doc.addPage();
    footY = 18;
  }

  // Left box: TF REKENING VIA
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.roundedRect(14, footY, 78, 24, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text('TF REKENING VIA :', 17, footY + 4.8);

  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.text('BNI     : 035 285 1268', 17, footY + 9.3);
  doc.text('BRI     : 8052 0103 2353 539', 17, footY + 13.3);
  doc.text('MANDIRI : 112000 1596 3635', 17, footY + 17.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 41, 59);
  doc.text('AN FAHLEVI MARTA WIJAYA', 17, footY + 21.8);

  // Right: TERIMA KASIH — PT WIJAYA AGRO PERKASA / KASIR
  const signRightX = pageWidth - 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('TERIMA KASIH', signRightX, footY + 5, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(activeProfil.namaPerusahaan.toUpperCase(), signRightX, footY + 9, { align: 'right' });

  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.35);
  doc.line(signRightX - 46, footY + 19, signRightX, footY + 19);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${activeProfil.penanggungJawab.toUpperCase()} )`, signRightX, footY + 23, {
    align: 'right',
  });

  // 5. Appendix: Lampiran Bukti Fisik Nota Lalu jika ada
  if (includeNotaProofs && notaAttachments.length > 0) {
    for (let i = 0; i < notaAttachments.length; i++) {
      const att = notaAttachments[i];
      doc.addPage();

      doc.setFillColor(180, 83, 9);
      doc.rect(14, 12, 5, 18, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(`LAMPIRAN BUKTI FISIK NOTA (${i + 1}/${notaAttachments.length})`, 22, 17);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Mitra: ${statement.namaMitra} (${statement.kodeMitra}) · No: ${att.noNotaLalu || att.txId} · Tgl: ${att.tanggal}`,
        22,
        23
      );
      doc.text(
        `Jenis: ${att.jenis.replace(/_/g, ' ')} · Nilai: ${formatRupiah(att.nominal)} · Ket: ${att.keterangan || '-'}`,
        22,
        28
      );

      doc.setDrawColor(210, 215, 220);
      doc.setLineWidth(0.3);
      doc.line(14, 33, pageWidth - 14, 33);

      try {
        let embedSrc = att.image || '';
        if (embedSrc && /^https?:\/\//i.test(embedSrc)) {
          const fetched = await loadLogoDataUrl(embedSrc);
          if (fetched) embedSrc = fetched;
        }

        if (embedSrc && embedSrc.startsWith('data:image/')) {
          const format = embedSrc.includes('png') ? 'PNG' : 'JPEG';
          const maxW = pageWidth - 28;
          const maxH = 230;
          let imgW = maxW;
          let imgH = 180;
          let imgX = 14;

          try {
            const props = doc.getImageProperties(embedSrc);
            if (props && props.width && props.height) {
              const ratio = props.width / props.height;
              imgW = maxW;
              imgH = imgW / ratio;
              if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH * ratio;
              }
              imgX = 14 + (maxW - imgW) / 2;
            }
          } catch {
            imgW = maxW;
            imgH = 200;
          }

          doc.addImage(embedSrc, format, imgX, 38, imgW, imgH, undefined, 'FAST');
        } else if (att.image) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`Dokumen foto tersimpan secara eksternal: ${att.image}`, 14, 45);
        }
      } catch (imgErr) {
        console.warn('PDF addImage error:', imgErr);
      }
    }
  }

  const safeMitraName = statement.namaMitra.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Rekening_Koran_${statement.kodeMitra}_${safeMitraName}.pdf`;
  doc.save(filename);
}
