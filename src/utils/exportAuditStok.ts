import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AuditStokProdukSummary,
  AuditStokResponse,
  ProfilPerusahaan,
} from '../server/types.ts';
import { formatRupiah } from './format.ts';

function formatQtyNum(val: number): string {
  const rounded = Math.round((Number(val) || 0) * 10000) / 10000;
  return rounded.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function safeFileSlug(str: string): string {
  return String(str || 'audit')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function getTodayCompact(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function exportAuditStokRingkasanCsv(
  items: AuditStokProdukSummary[],
  fisikInputs: Record<string, string>,
  periodeLabel: string
): void {
  const headers = [
    'Kode',
    'Nama Produk',
    'Kategori',
    'Satuan',
    'Stok Awal',
    'Masuk Kulakan',
    'Keluar Penjualan',
    'Koreksi Opname',
    'Stok Hitungan Audit',
    'Stok Sistem',
    'Selisih Sistem vs Audit',
    'Stok Fisik Riil (Opname)',
    'Harga Modal (HPP)',
    'Nilai Aset Stok Audit (Rp)',
    'Status Audit',
    'Terakhir Opname',
  ];

  const escapeCsv = (v: unknown) => {
    const s = String(v ?? '');
    if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const rows = items.map((it) => {
    const fisikRaw = fisikInputs[it.kode];
    const hasFisik = fisikRaw !== undefined && fisikRaw !== '' && !Number.isNaN(Number(fisikRaw.replace(',', '.')));
    const fisikVal = hasFisik
      ? Number(fisikRaw.replace(',', '.'))
      : it.stokFisikTerakhir ?? '';
    return [
      it.kode,
      it.namaProduk,
      it.kategori,
      it.satuan,
      it.stokAwalPeriode,
      it.totalMasukKulakan,
      it.totalKeluarPenjualan,
      it.totalKoreksiOpname,
      it.stokHitunganAudit,
      it.stokSistemSaatIni,
      it.selisihSistemVsAudit,
      fisikVal,
      it.hargaBeli,
      it.nilaiAsetStokAudit,
      it.statusAudit,
      it.tanggalAuditTerakhir || '-',
    ];
  });

  const csvLines = [
    [`"LAPORAN AUDIT STOK BARANG TOKO — ${periodeLabel}"`].join(','),
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvLines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Audit_Stok_Barang_${getTodayCompact()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAuditStokRingkasanPdf(
  auditData: AuditStokResponse,
  items: AuditStokProdukSummary[],
  fisikInputs: Record<string, string>,
  profil?: ProfilPerusahaan | null
): string {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const namaPt = (profil?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA').toUpperCase();

  doc.setFillColor(15, 118, 110);
  doc.rect(marginX, 10, 3.5, 17, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(namaPt, marginX + 6, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    profil?.alamat || 'Sentra Agrobisnis, Pergudangan Hasil Bumi & Perdagangan Sarana Pertanian',
    marginX + 6,
    20
  );
  doc.text(
    `Telp: ${profil?.telepon || '-'}  ·  Email: ${profil?.email || '-'}`,
    marginX + 6,
    24.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 118, 110);
  doc.text('BERITA ACARA & LAPORAN AUDIT STOK BARANG', pageWidth - marginX, 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Periode Audit: ${auditData.periodeLabel}`, pageWidth - marginX, 20, { align: 'right' });
  doc.text(
    `Dicetak: ${new Date().toLocaleString('id-ID')} WIB  ·  Produk Diaudit: ${items.length} item`,
    pageWidth - marginX,
    24.5,
    { align: 'right' }
  );

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginX, 30, pageWidth - marginX, 30);

  // Summary ribbon
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  const s = auditData.summary;
  doc.text(
    `Cocok: ${s.totalItemCocok}   |   Selisih / Perlu Cek: ${s.totalItemSelisih}   |   Masuk Kulakan: +${formatQtyNum(s.totalQtyMasukKulakan)} (${formatRupiah(s.totalNilaiMasukKulakan)})   |   Keluar Penjualan: -${formatQtyNum(s.totalQtyKeluarPenjualan)} (${formatRupiah(s.totalNilaiOmzetPenjualan)})   |   Nilai Aset Audit: ${formatRupiah(s.totalNilaiAsetStokAudit)}`,
    marginX,
    35.5
  );

  const tableRows = items.map((it, index) => {
    const rawFisik = fisikInputs[it.kode];
    const parsedFisik =
      rawFisik !== undefined && rawFisik !== '' ? Number(rawFisik.replace(',', '.')) : NaN;
    const fisikRiil = !Number.isNaN(parsedFisik)
      ? formatQtyNum(parsedFisik)
      : it.stokFisikTerakhir !== undefined
      ? formatQtyNum(it.stokFisikTerakhir)
      : '____';

    return [
      String(index + 1),
      `${it.kode}\n${it.namaProduk}`,
      it.satuan,
      formatQtyNum(it.stokAwalPeriode),
      `+${formatQtyNum(it.totalMasukKulakan)}`,
      `-${formatQtyNum(it.totalKeluarPenjualan)}`,
      `${it.totalKoreksiOpname > 0 ? '+' : ''}${formatQtyNum(it.totalKoreksiOpname)}`,
      formatQtyNum(it.stokHitunganAudit),
      formatQtyNum(it.stokSistemSaatIni),
      `${it.selisihSistemVsAudit > 0 ? '+' : ''}${formatQtyNum(it.selisihSistemVsAudit)}`,
      fisikRiil,
      formatRupiah(it.nilaiAsetStokAudit),
      it.statusAudit === 'COCOK'
        ? 'COCOK'
        : it.statusAudit === 'BELUM_SET_AWAL'
        ? 'SET AWAL'
        : it.statusAudit,
    ];
  });

  autoTable(doc, {
    startY: 39,
    margin: { left: marginX, right: marginX },
    head: [
      [
        'No',
        'Kode / Nama Produk',
        'Satuan',
        'Awal',
        '+ Kulakan',
        '- Terjual',
        'Koreksi',
        'Stok Audit',
        'Stok Sistem',
        'Selisih',
        'Fisik Riil',
        'Nilai Aset',
        'Status',
      ],
    ],
    body: tableRows,
    styles: {
      fontSize: 7.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 56 },
      2: { halign: 'center', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'right', cellWidth: 18 },
      6: { halign: 'right', cellWidth: 16 },
      7: { halign: 'right', cellWidth: 19, fontStyle: 'bold' },
      8: { halign: 'right', cellWidth: 19 },
      9: { halign: 'right', cellWidth: 18 },
      10: { halign: 'right', cellWidth: 19, fontStyle: 'bold' },
      11: { halign: 'right', cellWidth: 28 },
      12: { halign: 'center', cellWidth: 19 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 12) {
        const val = String(data.cell.raw || '');
        if (val === 'COCOK') {
          data.cell.styles.textColor = [5, 150, 105];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  const fileName = `Audit_Stok_Barang_${getTodayCompact()}.pdf`;
  doc.save(fileName);
  return fileName;
}

export function exportKartuStokProdukPdf(
  item: AuditStokProdukSummary,
  periodeLabel: string,
  profil?: ProfilPerusahaan | null
): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const namaPt = (profil?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA').toUpperCase();

  doc.setFillColor(15, 118, 110);
  doc.rect(marginX, 11, 3.5, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(namaPt, marginX + 6, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('KARTU AUDIT JEJAK STOK PRODUK (KULAKAN -> OPNAME -> PENJUALAN)', marginX + 6, 21);
  doc.text(`Periode: ${periodeLabel}`, marginX + 6, 25.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 118, 110);
  doc.text(`${item.kode} — ${item.namaProduk}`, pageWidth - marginX, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Kategori: ${item.kategori} · Satuan: ${item.satuan}`, pageWidth - marginX, 21, { align: 'right' });
  doc.text(`HPP: ${formatRupiah(item.hargaBeli)} · Jual: ${formatRupiah(item.hargaJual)}`, pageWidth - marginX, 25.5, {
    align: 'right',
  });

  doc.setDrawColor(203, 213, 225);
  doc.line(marginX, 30, pageWidth - marginX, 30);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Awal: ${formatQtyNum(item.stokAwalPeriode)} | +Kulakan: ${formatQtyNum(item.totalMasukKulakan)} | -Terjual: ${formatQtyNum(item.totalKeluarPenjualan)} | Koreksi: ${item.totalKoreksiOpname > 0 ? '+' : ''}${formatQtyNum(item.totalKoreksiOpname)} | Stok Audit: ${formatQtyNum(item.stokHitunganAudit)} | Stok Sistem: ${formatQtyNum(item.stokSistemSaatIni)}`,
    marginX,
    36
  );

  const bodyRows: string[][] = [
    [
      '-',
      'SALDO AWAL',
      '-',
      'Saldo Awal Periode Audit',
      '-',
      '-',
      formatQtyNum(item.stokAwalPeriode),
      item.keteranganStokAwal || 'Posisi awal sebelum mutasi periode',
    ],
    ...item.movements.map((mv) => [
      `${mv.tanggal}\n${mv.jam}`,
      mv.jenis === 'KULAKAN'
        ? 'KULAKAN (+)'
        : mv.jenis === 'PENJUALAN'
        ? 'PENJUALAN (-)'
        : mv.jenis === 'PEMAKAIAN'
        ? 'PEMAKAIAN (-)'
        : mv.jenis === 'INTERNAL_PT'
        ? 'INTERNAL (-)'
        : mv.jenis === 'SINKRON_SISTEM'
        ? 'SINKRON'
        : 'OPNAME (±)',
      mv.idReferensi + (mv.noFaktur ? `\nFak: ${mv.noFaktur}` : ''),
      `${mv.pihakTerkait}${mv.metode ? ` (${mv.metode})` : ''}`,
      mv.deltaQty > 0 ? `+${formatQtyNum(mv.deltaQty)}` : mv.deltaQty < 0 ? formatQtyNum(mv.deltaQty) : '0',
      formatRupiah(mv.subtotal),
      formatQtyNum(mv.saldoSetelah),
      mv.keterangan,
    ]),
  ];

  autoTable(doc, {
    startY: 40,
    margin: { left: marginX, right: marginX },
    head: [['Waktu', 'Jenis', 'No. Nota', 'Supplier / Pembeli', 'Mutasi Qty', 'Nilai (Rp)', 'Saldo', 'Keterangan']],
    body: bodyRows,
    styles: {
      fontSize: 7.2,
      cellPadding: 2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'top',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 22, fontStyle: 'bold' },
      2: { cellWidth: 24 },
      3: { cellWidth: 32 },
      4: { halign: 'right', cellWidth: 17, fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 16, fontStyle: 'bold' },
      7: { cellWidth: 29 },
    },
  });

  const fileName = `Kartu_Audit_Stok_${safeFileSlug(item.kode)}_${safeFileSlug(item.namaProduk)}_${getTodayCompact()}.pdf`;
  doc.save(fileName);
  return fileName;
}
