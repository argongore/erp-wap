import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  InvoiceSuratJalanDetailItem,
} from '../server/types.ts';

export type PrintableInvoiceSuratJalan = {
  noInvoice: string;
  namaMitra: string;
  tanggal: string;
  kategoriKode?: string;
  basisMitra: number;
  basisBuyer?: number;
  rendemen: number;
  komoditasNama: string;
  platTruk?: string;
  tonaseAwalKg?: number;
  tonaseAkhirKg: number;
  hargaPerKgMitra: number;
  hargaPerKgBuyer?: number;
  totalPenjualanMitra: number;
  totalPenjualanBuyer?: number;
  susutKg?: number;
  pajakNominal: number;
  komisiNominal: number;
  kasbonNominal: number;
  potonganLainLabel?: string;
  potonganLainNominal?: number;
  totalPotongan: number;
  tambahanLabel?: string;
  tambahanNominal?: number;
  jumlahPembayaranMitra: number;
  statusPembayaranMitra?: string;
  sumberBarang?: 'MITRA' | 'STOK_HB_PT';
  catatan?: string;
  detailItems?: InvoiceSuratJalanDetailItem[];
};

/**
 * Mengembalikan daftar detail/partai pada Invoice Surat Jalan.
 * Jika data lama belum memiliki `detailItems`, otomatis dikonversi dari field ringkasan tunggal.
 */
export function getSuratJalanDetails(inv: {
  detailItems?: InvoiceSuratJalanDetailItem[];
  komoditasNama: string;
  platTruk?: string;
  tonaseAwalKg?: number;
  tonaseAkhirKg: number;
  susutKg?: number;
  basisMitra: number;
  basisBuyer?: number;
  rendemen: number;
  hargaPerKgMitra: number;
  hargaPerKgBuyer?: number;
  totalPenjualanMitra: number;
  totalPenjualanBuyer?: number;
}): InvoiceSuratJalanDetailItem[] {
  if (Array.isArray(inv.detailItems) && inv.detailItems.length > 0) {
    return inv.detailItems;
  }
  const tonaseAwalKg = Number(inv.tonaseAwalKg) || 0;
  const tonaseAkhirKg = Number(inv.tonaseAkhirKg) || 0;
  const susutKg =
    Number(inv.susutKg) ||
    (tonaseAwalKg > 0 && tonaseAkhirKg > 0
      ? Math.round((tonaseAwalKg - tonaseAkhirKg) * 10) / 10
      : 0);

  return [
    {
      id: 'partai-1',
      deskripsi: inv.komoditasNama || 'KOPI',
      platTruk: inv.platTruk || '',
      tonaseAwalKg,
      tonaseAkhirKg,
      susutKg,
      basisMitra: Number(inv.basisMitra) || 0,
      basisBuyer: Number(inv.basisBuyer) || Number(inv.basisMitra) || 0,
      rendemen: Number(inv.rendemen) || 0,
      hargaPerKgMitra: Number(inv.hargaPerKgMitra) || 0,
      hargaPerKgBuyer: Number(inv.hargaPerKgBuyer) || Number(inv.hargaPerKgMitra) || 0,
      subtotalMitra: Number(inv.totalPenjualanMitra) || 0,
      subtotalBuyer: Number(inv.totalPenjualanBuyer) || Number(inv.totalPenjualanMitra) || 0,
      keterangan: susutKg > 0 ? `Susut ${susutKg} Kg` : '',
    },
  ];
}

function escapeHtml(raw?: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHargaDesimal(val: number): string {
  return (Number(val) || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQtyKg(val: number): string {
  return (Number(val) || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function printInvoiceSuratJalan(record: PrintableInvoiceSuratJalan): void {
  const details = getSuratJalanDetails(record);

  // Kumpulkan Basis unik (atau per partai jika berbeda)
  const uniqueBasis: number[] = [];
  for (const d of details) {
    const b = Math.round(Number(d.basisMitra) || 0);
    if (b > 0 && !uniqueBasis.includes(b)) uniqueBasis.push(b);
  }
  if (uniqueBasis.length === 0 && record.basisMitra > 0) {
    uniqueBasis.push(Math.round(record.basisMitra));
  }

  const basisHtml =
    uniqueBasis.length <= 1
      ? `<div class="basis-row"><span>BASIS 1 :</span> <strong>Rp ${(uniqueBasis[0] || record.basisMitra || 0).toLocaleString('id-ID')}</strong></div>`
      : uniqueBasis
          .map(
            (b, idx) =>
              `<div class="basis-row"><span>BASIS ${idx + 1} :</span> <strong>Rp ${b.toLocaleString('id-ID')}</strong></div>`
          )
          .join('');

  // RENDEMEN 1, RENDEMEN 2, RENDEMEN 3... sesuai jumlah detail/partai
  const rendemenRowsHtml = details
    .map(
      (d, idx) => `
      <tr>
        <td class="rend-label">RENDEMEN ${idx + 1} :</td>
        <td class="rend-val">${(Number(d.rendemen) || 0).toFixed(2)}%</td>
      </tr>`
    )
    .join('');

  const detailRowsHtml = details
    .map((d, idx) => {
      const ket =
        (d.keterangan || '').trim() ||
        (d.susutKg ? `Susut ${d.susutKg} Kg` : '');
      return `
        <tr>
          <td class="center">${idx + 1}</td>
          <td>${escapeHtml(d.deskripsi || 'KOPI')}</td>
          <td>${escapeHtml(d.platTruk || '-')}</td>
          <td class="right mono">${formatQtyKg(d.tonaseAkhirKg)}</td>
          <td class="right mono">Rp ${formatHargaDesimal(d.hargaPerKgMitra)}</td>
          <td class="right mono">Rp ${Math.round(d.subtotalMitra || 0).toLocaleString('id-ID')}</td>
          <td>${escapeHtml(ket)}</td>
        </tr>`;
    })
    .join('');

  const pajakLabel = record.sumberBarang === 'STOK_HB_PT' ? 'PAJAK' : 'PAJAK (0,25%)';
  const potonganRows: string[] = [
    `<tr><td class="center">1</td><td colspan="4">${pajakLabel}</td><td class="right mono">Rp ${Math.round(record.pajakNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`,
    `<tr><td class="center">2</td><td colspan="4">KOMISI</td><td class="right mono">Rp ${Math.round(record.komisiNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`,
    `<tr><td class="center">3</td><td colspan="4"><strong>KASBON</strong></td><td class="right mono"><strong>Rp ${Math.round(record.kasbonNominal || 0).toLocaleString('id-ID')}</strong></td><td></td></tr>`,
  ];

  if ((record.potonganLainNominal || 0) > 0) {
    potonganRows.push(
      `<tr><td class="center">4</td><td colspan="4">${escapeHtml(record.potonganLainLabel || 'POTONGAN LAIN')}</td><td class="right mono">Rp ${Math.round(record.potonganLainNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`
    );
  }

  const tambahanHtml =
    (record.tambahanNominal || 0) > 0
      ? `<tr><td class="center">+</td><td colspan="4">${escapeHtml(record.tambahanLabel || 'TAMBAHAN')}</td><td class="right mono">Rp ${Math.round(record.tambahanNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`
      : '';

  const catatanText =
    (record.catatan || '').trim() || 'Pembayaran Via Transfer';
  const statusText =
    record.sumberBarang === 'STOK_HB_PT'
      ? 'STOK BARANG HB (PT WAP)'
      : record.statusPembayaranMitra === 'PENDING'
      ? 'PENDING ORDER'
      : 'LUNAS DITRANSFER';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${escapeHtml(record.noInvoice)} - ${escapeHtml(record.namaMitra)}</title>
      <style>
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body { font-family: Arial, Helvetica, sans-serif; margin: 20px; color: #0f172a; font-size: 12px; }
        .doc-wrap { border: 1.5px solid #0b638f; }
        .top-grid { display: flex; justify-content: space-between; border-bottom: 1.5px solid #0b638f; }
        .company-box { flex: 1.4; background: #cbd9e6; padding: 12px 16px; }
        .company-box h1 { margin: 0 0 4px 0; font-size: 15px; font-weight: 800; letter-spacing: 0.3px; }
        .company-box p { margin: 2px 0; font-size: 11px; line-height: 1.35; }
        .invoice-meta { flex: 1; background: #006694; color: #fff; padding: 12px 16px; text-align: right; display: flex; flex-direction: column; justify-content: space-between; }
        .invoice-meta .inv-title { font-size: 14px; font-weight: 700; letter-spacing: 0.5px; }
        .invoice-meta .inv-no { font-size: 13px; font-weight: 700; margin-top: 2px; }
        .invoice-meta .inv-date { font-size: 12px; font-weight: 700; margin-top: 8px; }
        .invoice-meta .inv-status { font-size: 10px; opacity: 0.9; margin-top: 2px; }
        .party-grid { display: flex; border-bottom: 1.5px solid #0b638f; }
        .buyer-basis { flex: 1.4; background: #006694; color: #0f172a; padding: 10px 16px; display: flex; flex-direction: column; justify-content: space-between; }
        .buyer-basis .buyer-kode { font-size: 20px; font-weight: 800; text-align: center; color: #0b1320; letter-spacing: 0.6px; margin-bottom: 10px; }
        .buyer-basis .basis-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #0b1320; padding: 2px 18px; }
        .mitra-rendemen { flex: 1; background: #cbd9e6; border-left: 1.5px solid #0b638f; }
        .mitra-name { background: #ffffff; padding: 6px 12px; text-align: center; font-size: 15px; font-weight: 800; border-bottom: 1px solid #94b3c8; text-transform: uppercase; }
        .rend-table { width: 100%; border-collapse: collapse; margin: 0; }
        .rend-table td { border: none; padding: 3px 12px; font-size: 11px; }
        .rend-table .rend-label { font-weight: 700; text-align: left; }
        .rend-table .rend-val { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
        table.main-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        table.main-table th, table.main-table td { border: 1px solid #9cb8ca; padding: 5px 8px; }
        table.main-table th { background: #006694; color: #fff; font-weight: 700; text-align: center; }
        .right { text-align: right; }
        .center { text-align: center; }
        .mono { font-variant-numeric: tabular-nums; }
        .band-row td { background: #006694; color: #09131c; font-weight: 800; font-size: 12px; padding: 6px 8px; border-color: #006694; }
        .grand-row td { background: #006694; color: #09131c; font-weight: 800; font-size: 14px; padding: 8px 10px; border-color: #006694; }
        .footer-grid { display: flex; justify-content: space-between; padding: 12px 16px 18px; border-top: 1px solid #9cb8ca; }
        .footer-notes strong { display: block; font-size: 12px; margin-bottom: 4px; }
        .footer-sign { text-align: right; font-size: 11.5px; }
        .footer-sign .sign-name { margin-top: 44px; font-weight: 800; }
        .thanks-bar { background: #006694; color: #fff; text-align: center; padding: 6px; font-weight: 800; font-size: 11.5px; letter-spacing: 0.4px; }
        @media print {
          body { margin: 8px; }
          @page { size: auto; margin: 10mm; }
        }
      </style>
    </head>
    <body>
      <div class="doc-wrap">
        <div class="top-grid">
          <div class="company-box">
            <h1>PT WIJAYA AGRO PERKASA</h1>
            <p>Jl Kalangan Desa Simpang Luas</p>
            <p>Kec. Sungai Are, Kab. OKU Selatan</p>
            <p>Sumatera Selatan</p>
            <p>082144999305</p>
          </div>
          <div class="invoice-meta">
            <div>
              <div class="inv-title">INVOICE</div>
              <div class="inv-no">${escapeHtml(record.noInvoice)}</div>
            </div>
            <div>
              <div class="inv-date">${escapeHtml(record.tanggal)}</div>
              <div class="inv-status">STATUS: ${statusText}</div>
            </div>
          </div>
        </div>

        <div class="party-grid">
          <div class="buyer-basis">
            <div class="buyer-kode">${escapeHtml(record.kategoriKode || 'SKA')}</div>
            <div>${basisHtml}</div>
          </div>
          <div class="mitra-rendemen">
            <div class="mitra-name">${escapeHtml(record.namaMitra)}</div>
            <table class="rend-table">
              <tbody>${rendemenRowsHtml}</tbody>
            </table>
          </div>
        </div>

        <table class="main-table">
          <thead>
            <tr>
              <th style="width:38px">NO</th>
              <th style="text-align:left">DESKRIPSI</th>
              <th style="text-align:left">TRUK</th>
              <th style="text-align:right">KUANTITI (Kg)</th>
              <th style="text-align:right">HARGA (Rp)</th>
              <th style="text-align:right">JUMLAH (Rp)</th>
              <th style="text-align:left">KET</th>
            </tr>
          </thead>
          <tbody>
            ${detailRowsHtml}
            <tr class="band-row">
              <td colspan="5" class="right">TOTAL PENJUALAN :</td>
              <td class="right mono">Rp ${Math.round(record.totalPenjualanMitra || 0).toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            ${potonganRows.join('')}
            <tr class="band-row">
              <td colspan="5" class="right">TOTAL POTONGAN(-) :</td>
              <td class="right mono">Rp ${Math.round(record.totalPotongan || 0).toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            ${tambahanHtml}
            <tr class="grand-row">
              <td colspan="5" class="right">Jumlah Pembayaran :</td>
              <td class="right mono">Rp ${Math.round(record.jumlahPembayaranMitra || 0).toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="footer-grid">
          <div class="footer-notes">
            <strong>Catatan :</strong>
            <div>${escapeHtml(catatanText)}</div>
          </div>
          <div class="footer-sign">
            <div>Hormat Kami</div>
            <div>PT Wijaya Agro Perkasa</div>
            <div class="sign-name">Fahlevi Martawijaya, ST</div>
          </div>
        </div>

        <div class="thanks-bar">TERIMA KASIH ATAS KERJA SAMA ANDA</div>
      </div>
    </body>
    </html>
  `;

  let iframe = document.getElementById('print-invoice-frame') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'print-invoice-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }
  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (doc) {
    doc.open();
    doc.write(htmlContent);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 300);
  }
}

export function downloadInvoiceSuratJalanPdf(record: PrintableInvoiceSuratJalan): void {
  const details = getSuratJalanDetails(record);

  const uniqueBasis: number[] = [];
  for (const d of details) {
    const b = Math.round(Number(d.basisMitra) || 0);
    if (b > 0 && !uniqueBasis.includes(b)) uniqueBasis.push(b);
  }
  if (uniqueBasis.length === 0 && record.basisMitra > 0) {
    uniqueBasis.push(Math.round(record.basisMitra));
  }
  const basisLines =
    uniqueBasis.length <= 1
      ? [{ label: 'BASIS 1 :', val: `Rp ${(uniqueBasis[0] || record.basisMitra || 0).toLocaleString('id-ID')}` }]
      : uniqueBasis.map((b, idx) => ({
          label: `BASIS ${idx + 1} :`,
          val: `Rp ${b.toLocaleString('id-ID')}`,
        }));

  const rendemenLines = details.map((d, idx) => ({
    label: `RENDEMEN ${idx + 1} :`,
    val: `${(Number(d.rendemen) || 0).toFixed(2)}%`,
  }));

  const pajakLabel = record.sumberBarang === 'STOK_HB_PT' ? 'PAJAK' : 'PAJAK (0,25%)';
  const catatanText = (record.catatan || '').trim() || 'Pembayaran Via Transfer';
  const statusText =
    record.sumberBarang === 'STOK_HB_PT'
      ? 'STOK BARANG HB (PT WAP)'
      : record.statusPembayaranMitra === 'PENDING'
      ? 'PENDING ORDER'
      : 'LUNAS DITRANSFER';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 12;
  const contentW = 186; // 210 - 24
  const leftColW = 110;
  const rightColW = contentW - leftColW; // 76
  const startY = 12;

  // Colors
  const primaryBlue: [number, number, number] = [0, 102, 148]; // #006694
  const softBlue: [number, number, number] = [203, 217, 230]; // #cbd9e6
  const borderBlue: [number, number, number] = [11, 99, 143]; // #0b638f
  const darkText: [number, number, number] = [15, 23, 42];

  // 1. Top Header Band
  const headerH = 26;
  doc.setFillColor(...softBlue);
  doc.rect(marginX, startY, leftColW, headerH, 'F');
  doc.setFillColor(...primaryBlue);
  doc.rect(marginX + leftColW, startY, rightColW, headerH, 'F');

  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PT WIJAYA AGRO PERKASA', marginX + 4, startY + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Jl Kalangan Desa Simpang Luas', marginX + 4, startY + 11);
  doc.text('Kec. Sungai Are, Kab. OKU Selatan', marginX + 4, startY + 15);
  doc.text('Sumatera Selatan', marginX + 4, startY + 19);
  doc.text('082144999305', marginX + 4, startY + 23);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('INVOICE', marginX + contentW - 4, startY + 6, { align: 'right' });
  doc.setFontSize(9.5);
  doc.text(String(record.noInvoice || '-'), marginX + contentW - 4, startY + 11, {
    align: 'right',
  });
  doc.setFontSize(9);
  doc.text(String(record.tanggal || '-'), marginX + contentW - 4, startY + 19.5, {
    align: 'right',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`STATUS: ${statusText}`, marginX + contentW - 4, startY + 23.5, {
    align: 'right',
  });

  // 2. Party Band (Buyer + Basis | Mitra + Rendemen)
  const partyY = startY + headerH;
  const maxPartyRows = Math.max(basisLines.length, rendemenLines.length, 1);
  const partyH = Math.max(24, 12 + maxPartyRows * 4.5 + 3);

  doc.setFillColor(...primaryBlue);
  doc.rect(marginX, partyY, leftColW, partyH, 'F');
  doc.setFillColor(...softBlue);
  doc.rect(marginX + leftColW, partyY, rightColW, partyH, 'F');

  // Buyer badge title
  doc.setTextColor(11, 19, 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(String(record.kategoriKode || 'SKA').toUpperCase(), marginX + leftColW / 2, partyY + 8, {
    align: 'center',
  });

  // Basis rows
  doc.setFontSize(8.5);
  const basisStartY = partyY + Math.max(14, partyH - basisLines.length * 4.5 - 2);
  basisLines.forEach((b, i) => {
    const ry = basisStartY + i * 4.5;
    doc.text(b.label, marginX + 10, ry);
    doc.text(b.val, marginX + leftColW - 10, ry, { align: 'right' });
  });

  // Mitra white box + rendemen
  doc.setFillColor(255, 255, 255);
  doc.rect(marginX + leftColW, partyY, rightColW, 8.5, 'F');
  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  const mitraLabel = String(record.namaMitra || '-').toUpperCase();
  doc.setFontSize(mitraLabel.length > 26 ? 8.5 : 10);
  doc.text(mitraLabel, marginX + leftColW + rightColW / 2, partyY + 5.8, {
    align: 'center',
    maxWidth: rightColW - 4,
  });

  doc.setFontSize(8);
  rendemenLines.forEach((r, i) => {
    const ry = partyY + 13 + i * 4.5;
    doc.setFont('helvetica', 'bold');
    doc.text(r.label, marginX + leftColW + 4, ry);
    doc.text(r.val, marginX + contentW - 4, ry, { align: 'right' });
  });

  // Border lines for top + party grid
  doc.setDrawColor(...borderBlue);
  doc.setLineWidth(0.4);
  doc.rect(marginX, startY, contentW, headerH + partyH);
  doc.line(marginX, partyY, marginX + contentW, partyY);
  doc.line(marginX + leftColW, partyY, marginX + leftColW, partyY + partyH);
  doc.setDrawColor(148, 179, 200);
  doc.line(marginX + leftColW, partyY + 8.5, marginX + contentW, partyY + 8.5);

  // 3. Main Table Rows
  const bodyRows: any[] = details.map((d, idx) => {
    const ket = (d.keterangan || '').trim() || (d.susutKg ? `Susut ${d.susutKg} Kg` : '');
    return [
      String(idx + 1),
      d.deskripsi || 'KOPI',
      d.platTruk || '-',
      formatQtyKg(d.tonaseAkhirKg),
      `Rp ${formatHargaDesimal(d.hargaPerKgMitra)}`,
      `Rp ${Math.round(d.subtotalMitra || 0).toLocaleString('id-ID')}`,
      ket,
    ];
  });

  // Band row: TOTAL PENJUALAN
  bodyRows.push([
    {
      content: 'TOTAL PENJUALAN :',
      colSpan: 5,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fillColor: primaryBlue,
        textColor: [9, 19, 28],
        fontSize: 8.5,
      },
    },
    {
      content: `Rp ${Math.round(record.totalPenjualanMitra || 0).toLocaleString('id-ID')}`,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fillColor: primaryBlue,
        textColor: [9, 19, 28],
        fontSize: 8.5,
      },
    },
    {
      content: '',
      styles: {
        fillColor: primaryBlue,
      },
    },
  ]);

  // Potongan rows
  bodyRows.push([
    '1',
    { content: pajakLabel, colSpan: 4 },
    `Rp ${Math.round(record.pajakNominal || 0).toLocaleString('id-ID')}`,
    '',
  ]);
  bodyRows.push([
    '2',
    { content: 'KOMISI', colSpan: 4 },
    `Rp ${Math.round(record.komisiNominal || 0).toLocaleString('id-ID')}`,
    '',
  ]);
  bodyRows.push([
    '3',
    { content: 'KASBON', colSpan: 4, styles: { fontStyle: 'bold' } },
    {
      content: `Rp ${Math.round(record.kasbonNominal || 0).toLocaleString('id-ID')}`,
      styles: { fontStyle: 'bold' },
    },
    '',
  ]);
  if ((record.potonganLainNominal || 0) > 0) {
    bodyRows.push([
      '4',
      { content: record.potonganLainLabel || 'POTONGAN LAIN', colSpan: 4 },
      `Rp ${Math.round(record.potonganLainNominal || 0).toLocaleString('id-ID')}`,
      '',
    ]);
  }

  // Band row: TOTAL POTONGAN(-)
  bodyRows.push([
    {
      content: 'TOTAL POTONGAN(-) :',
      colSpan: 5,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fillColor: primaryBlue,
        textColor: [9, 19, 28],
        fontSize: 8.5,
      },
    },
    {
      content: `Rp ${Math.round(record.totalPotongan || 0).toLocaleString('id-ID')}`,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fillColor: primaryBlue,
        textColor: [9, 19, 28],
        fontSize: 8.5,
      },
    },
    {
      content: '',
      styles: {
        fillColor: primaryBlue,
      },
    },
  ]);

  if ((record.tambahanNominal || 0) > 0) {
    bodyRows.push([
      '+',
      { content: record.tambahanLabel || 'TAMBAHAN', colSpan: 4 },
      `Rp ${Math.round(record.tambahanNominal || 0).toLocaleString('id-ID')}`,
      '',
    ]);
  }

  // Grand Total row
  bodyRows.push([
    {
      content: 'Jumlah Pembayaran :',
      colSpan: 5,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fillColor: primaryBlue,
        textColor: [9, 19, 28],
        fontSize: 10,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      },
    },
    {
      content: `Rp ${Math.round(record.jumlahPembayaranMitra || 0).toLocaleString('id-ID')}`,
      styles: {
        halign: 'right',
        fontStyle: 'bold',
        fillColor: primaryBlue,
        textColor: [9, 19, 28],
        fontSize: 10,
        cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      },
    },
    {
      content: '',
      styles: {
        fillColor: primaryBlue,
      },
    },
  ]);

  autoTable(doc, {
    startY: partyY + partyH + 3,
    margin: { left: marginX, right: marginX },
    tableWidth: contentW,
    head: [['NO', 'DESKRIPSI', 'TRUK', 'KUANTITI (Kg)', 'HARGA (Rp)', 'JUMLAH (Rp)', 'KET']],
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      textColor: darkText,
      lineColor: [156, 184, 202],
      lineWidth: 0.25,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: primaryBlue,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 28, halign: 'left' },
      2: { cellWidth: 25, halign: 'left' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 37, halign: 'right' },
      6: { cellWidth: 30, halign: 'left' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const raw = hookData.row.raw as any[];
        const isPotonganRow =
          raw &&
          typeof raw[1] === 'object' &&
          raw[1] !== null &&
          Number(raw[1].colSpan) === 4;
        if (isPotonganRow && hookData.column.index === 5) {
          hookData.cell.styles.halign = 'right';
        }
      }
    },
  });

  // 4. Footer & Sign-off
  let footerY = ((doc as any).lastAutoTable?.finalY || partyY + partyH + 55) + 4;
  if (footerY + 38 > 285) {
    doc.addPage();
    footerY = 16;
  }

  doc.setDrawColor(...borderBlue);
  doc.setLineWidth(0.3);
  doc.rect(marginX, footerY, contentW, 28);

  doc.setTextColor(...darkText);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Catatan :', marginX + 4, footerY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(catatanText, marginX + 4, footerY + 10.5, { maxWidth: 105 });

  doc.setFontSize(8.5);
  doc.text('Hormat Kami', marginX + contentW - 4, footerY + 5.5, { align: 'right' });
  doc.text('PT Wijaya Agro Perkasa', marginX + contentW - 4, footerY + 10, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text('Fahlevi Martawijaya, ST', marginX + contentW - 4, footerY + 24.5, {
    align: 'right',
  });

  // Thanks bar
  const thanksY = footerY + 28;
  doc.setFillColor(...primaryBlue);
  doc.rect(marginX, thanksY, contentW, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('TERIMA KASIH ATAS KERJA SAMA ANDA', marginX + contentW / 2, thanksY + 4.7, {
    align: 'center',
  });

  const safeInv = String(record.noInvoice || 'INVOICE').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeMitra = String(record.namaMitra || 'MITRA')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 32);
  doc.save(`Surat_Jalan_${safeInv}_${safeMitra}.pdf`);
}
