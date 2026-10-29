import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CatatanCashOpname,
  HasilKliringSilangResponse,
  ProfilPerusahaan,
} from '../server/types.ts';
import { formatRupiah } from './format.ts';

export function exportBuktiKliringToPdf(
  kliring: HasilKliringSilangResponse,
  profil?: ProfilPerusahaan | null
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentW = pageWidth - marginX * 2;
  const namaPt = (profil?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA').toUpperCase();

  // Letterhead
  doc.setFillColor(15, 76, 92);
  doc.rect(marginX, 12, 4, 20, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(namaPt, marginX + 7, 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    profil?.alamat || 'Sentra Agrobisnis, Pergudangan Hasil Bumi & Perdagangan Sarana Pertanian',
    marginX + 7,
    22.5
  );
  doc.text(
    `Telp: ${profil?.telepon || '(021) 8892-0192'}  •  Email: ${profil?.email || 'keuangan@wijayaagro.com'}`,
    marginX + 7,
    27
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 76, 92);
  doc.text('BUKTI KLIRING & KOMPENSASI KEMITRAAN', pageWidth - marginX, 17.5, { align: 'right' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`No. Ref: ${kliring.idReferensiKliring}`, pageWidth - marginX, 22.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Waktu: ${kliring.tanggal} ${kliring.jam} WIB`, pageWidth - marginX, 27, { align: 'right' });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(marginX, 34, pageWidth - marginX, 34);

  // Mitra Info
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, 38, contentW, 16, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Nama Mitra / Petani : ${kliring.namaMitra} (${kliring.kodeMitra})`, marginX + 4, 44.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  const tipePenyelesaian =
    kliring.aksiSisa === 'CAIRKAN_SISA_TITIPAN'
      ? `Potong Bon Otomatis + Pencairan Sisa Panen (${kliring.metodeFisik} - ${kliring.rekeningFisik})`
      : kliring.aksiSisa === 'TERIMA_PELUNASAN_SISA_BON'
      ? `Potong Titipan Otomatis + Setoran Pelunasan Sisa Bon (${kliring.metodeFisik} - ${kliring.rekeningFisik})`
      : 'Kliring Silang Non-Tunai (Potong Saldo Titipan Panen ke Kasbon)';
  doc.text(`Skema Penyelesaian : ${tipePenyelesaian}`, marginX + 4, 50);

  // Calculation Summary Table
  const calcRows: Array<[string, string, string]> = [
    ['1. Saldo Titipan Hasil Bumi / Dana Mitra Awal', formatRupiah(kliring.saldoTitipanAwal), 'Hak Mitra Awal'],
    ['2. Total Kewajiban Kasbon Mitra Awal (Barang + Uang)', formatRupiah(kliring.totalKasbonAwal), 'Kewajiban Mitra Awal'],
    [
      '3. Nominal Potong Silang Otomatis (Non-Tunai)',
      `-${formatRupiah(kliring.nominalPotongSilang)}`,
      'Kompensasi Titipan <-> Bon',
    ],
  ];

  if (kliring.nominalPenyelesaianFisik > 0) {
    if (kliring.aksiSisa === 'CAIRKAN_SISA_TITIPAN') {
      calcRows.push([
        `4. Pencairan Sisa Bersih Diterima Mitra (${kliring.metodeFisik} via ${kliring.rekeningFisik})`,
        formatRupiah(kliring.nominalPenyelesaianFisik),
        'Uang Keluar Kas/Bank PT',
      ]);
    } else if (kliring.aksiSisa === 'TERIMA_PELUNASAN_SISA_BON') {
      calcRows.push([
        `4. Setoran Pelunasan Sisa Bon oleh Mitra (${kliring.metodeFisik} ke ${kliring.rekeningFisik})`,
        formatRupiah(kliring.nominalPenyelesaianFisik),
        'Uang Masuk Kas/Bank PT',
      ]);
    }
  }

  calcRows.push(
    ['Sisa Saldo Titipan Mitra Setelah Kliring', formatRupiah(kliring.saldoTitipanAkhir), 'Posisi Akhir Titipan'],
    ['Sisa Kewajiban Kasbon Mitra Setelah Kliring', formatRupiah(kliring.sisaKasbonAkhir), 'Posisi Akhir Kasbon']
  );

  autoTable(doc, {
    startY: 59,
    head: [['Komponen Perhitungan Kliring', 'Nominal (Rp)', 'Keterangan Buku']],
    body: calcRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 42, halign: 'right', font: 'courier', fontStyle: 'bold' },
      2: { cellWidth: 48 },
    },
    margin: { left: marginX, right: marginX },
  });

  let nextY = ((doc as any).lastAutoTable?.finalY || 120) + 7;

  // Allocated Bon Notes Table
  if (kliring.alokasiBonLunas.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('RINCIAN NOTA KASBON YANG TERPOTONG / LUNAS (FIFO):', marginX, nextY);

    autoTable(doc, {
      startY: nextY + 2,
      head: [['No', 'No. Referensi Nota', 'Jenis Kasbon', 'Saldo Nota Awal', 'Terpotong / Lunas', 'Sisa Nota']],
      body: kliring.alokasiBonLunas.map((a, i) => [
        String(i + 1),
        a.refId,
        a.jenis === 'KASBON_BARANG' ? 'Kasbon Barang Toko' : 'Kasbon Pinjaman Uang',
        formatRupiah(a.nominalSebelum),
        formatRupiah(a.nominalDibayar),
        formatRupiah(a.nominalSisa),
      ]),
      theme: 'striped',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 34, font: 'courier', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
        5: { cellWidth: 30, halign: 'right' },
      },
      margin: { left: marginX, right: marginX },
    });

    nextY = ((doc as any).lastAutoTable?.finalY || nextY + 30) + 12;
  } else {
    nextY += 6;
  }

  // Signatures
  if (nextY + 35 > 280) {
    doc.addPage();
    nextY = 20;
  }

  const halfW = contentW / 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Disetujui oleh Mitra / Petani,', marginX + halfW / 2, nextY, { align: 'center' });
  doc.text('Diproses oleh Kasir Keuangan,', marginX + halfW + halfW / 2, nextY, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${kliring.namaMitra} )`, marginX + halfW / 2, nextY + 20, { align: 'center' });
  doc.text('( Kasir PT. Wijaya Agro )', marginX + halfW + halfW / 2, nextY + 20, { align: 'center' });

  const fileName = `Bukti_Kliring_${kliring.kodeMitra}_${kliring.idReferensiKliring}.pdf`;
  doc.save(fileName);
  return fileName;
}

export function exportBeritaAcaraOpnameToPdf(
  opname: CatatanCashOpname,
  profil?: ProfilPerusahaan | null
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentW = pageWidth - marginX * 2;
  const namaPt = (profil?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA').toUpperCase();

  doc.setFillColor(15, 23, 42);
  doc.rect(marginX, 12, 4, 20, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(namaPt, marginX + 7, 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('BERITA ACARA PEMERIKSAAN FISIK KAS (CASH OPNAME LACI KAS01)', marginX + 7, 23);
  doc.text(`No. Berita Acara: ${opname.id}  •  Waktu: ${opname.tanggal} ${opname.jam} WIB`, marginX + 7, 28);

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(marginX, 34, pageWidth - marginX, 34);

  // Summary box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, 38, contentW, 20, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Petugas Kasir      : ${opname.petugasKasir}`, marginX + 4, 44.5);
  doc.text(`Status Rekonsiliasi : ${opname.statusRekonsiliasi.replace('_', ' ')}`, marginX + 4, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Catatan Pemeriksaan: ${opname.catatan || '-'}`, marginX + 4, 55);

  const denoms = [100000, 75000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
  const denomRows = denoms.map((d, i) => {
    const qty = opname.rincianPecahan[String(d)] || 0;
    return [
      String(i + 1),
      `${formatRupiah(d)} (${d >= 1000 ? 'Kertas/Logam' : 'Logam'})`,
      `${qty.toLocaleString('id-ID')} lembar/keping`,
      formatRupiah(d * qty),
    ];
  });

  autoTable(doc, {
    startY: 63,
    head: [['No', 'Pecahan Uang Rupiah', 'Jumlah Fisik Dihitung', 'Subtotal Nilai Fisik']],
    body: denomRows,
    foot: [
      [
        { content: 'TOTAL UANG TUNAI FISIK DI LACI (A)', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatRupiah(opname.totalFisikLaci), styles: { halign: 'right', fontStyle: 'bold' } },
      ],
      [
        { content: 'SALDO BUKU SISTEM REKENING KAS01 (B)', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: formatRupiah(opname.saldoSistemSebelum), styles: { halign: 'right', fontStyle: 'bold' } },
      ],
      [
        {
          content: `SELISIH KAS (A - B) [${opname.statusRekonsiliasi}]`,
          colSpan: 3,
          styles: { halign: 'right', fontStyle: 'bold' },
        },
        {
          content: `${opname.selisih > 0 ? '+' : ''}${formatRupiah(opname.selisih)}`,
          styles: { halign: 'right', fontStyle: 'bold' },
        },
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 45, halign: 'right', font: 'courier' },
      3: { cellWidth: 45, halign: 'right', font: 'courier', fontStyle: 'bold' },
    },
    margin: { left: marginX, right: marginX },
  });

  const signY = ((doc as any).lastAutoTable?.finalY || 195) + 14;
  const halfW = contentW / 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('Dihitung & Diserahkan Oleh,', marginX + halfW / 2, signY, { align: 'center' });
  doc.text('Diperiksa & Disahkan Oleh,', marginX + halfW + halfW / 2, signY, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`( ${opname.petugasKasir} )`, marginX + halfW / 2, signY + 20, { align: 'center' });
  doc.text(
    `( ${profil?.penanggungJawab || 'Kepala Keuangan / Pimpinan'} )`,
    marginX + halfW + halfW / 2,
    signY + 20,
    { align: 'center' }
  );

  const fileName = `Berita_Acara_Cash_Opname_${opname.id}.pdf`;
  doc.save(fileName);
  return fileName;
}
