import type { ProfilPerusahaan } from '../server/types.ts';
import type { ReceiptData } from '../components/common/PrintReceiptModal.tsx';
import { formatRupiah } from './format.ts';

export interface ThermalReceiptSettings {
  paperWidthMm: 80 | 58;
  fastModeSkipPopup: boolean;
  includeSignatures: boolean;
  autoCutEscPos: boolean;
}

const STORAGE_KEY = 'erp_wap_thermal_settings_v1';

export const DEFAULT_THERMAL_SETTINGS: ThermalReceiptSettings = {
  paperWidthMm: 80,
  fastModeSkipPopup: false,
  includeSignatures: true,
  autoCutEscPos: true,
};

export function getThermalSettings(): ThermalReceiptSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THERMAL_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      paperWidthMm: parsed?.paperWidthMm === 58 ? 58 : 80,
      fastModeSkipPopup: Boolean(parsed?.fastModeSkipPopup),
      includeSignatures: parsed?.includeSignatures !== false,
      autoCutEscPos: parsed?.autoCutEscPos !== false,
    };
  } catch {
    return { ...DEFAULT_THERMAL_SETTINGS };
  }
}

export function saveThermalSettings(
  patch: Partial<ThermalReceiptSettings>
): ThermalReceiptSettings {
  const next: ThermalReceiptSettings = {
    ...getThermalSettings(),
    ...patch,
    paperWidthMm: (patch.paperWidthMm ?? getThermalSettings().paperWidthMm) === 58 ? 58 : 80,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / sandbox restrictions
  }
  return next;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeAsciiText(value: unknown): string {
  return String(value ?? '')
    .replace(/[·•]/g, '-')
    .replace(/[−–—]/g, '-')
    .replace(/[×]/g, 'x')
    .replace(/[^\x20-\x7E\n]/g, '');
}

function resolveCompanyMeta(profilPerusahaan?: ProfilPerusahaan | null) {
  const companyName = (profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA').trim();
  const companyTagline = (
    profilPerusahaan?.catatanHeaderNota ||
    profilPerusahaan?.badanHukum ||
    'Perdagangan Hasil Bumi, Beras & Sarana Pertanian'
  ).trim();
  const alamat = (profilPerusahaan?.alamat || '').trim();
  const telepon = (profilPerusahaan?.telepon || '').trim();
  const companyContact = [
    alamat && alamat !== '-' ? alamat : '',
    telepon && telepon !== '-' ? `Telp: ${telepon}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return { companyName, companyTagline, companyContact };
}

export function buildReceiptTextForWa(
  receipt: ReceiptData,
  profilPerusahaan?: ProfilPerusahaan | null
): string {
  const { companyName } = resolveCompanyMeta(profilPerusahaan);
  const mitraLabel = receipt.mitraLabel || 'Mitra/Pihak';
  const lines = [
    `*${(receipt.title || 'BUKTI TRANSAKSI').toUpperCase()} - ${companyName.toUpperCase()}*`,
    `No: ${receipt.nomorTransaksi || receipt.nomorNota || '-'}`,
    ...(receipt.subtitle ? [`${receipt.subtitle}`] : []),
    `Waktu: ${receipt.tanggal || '-'} ${receipt.jam || ''} WIB`,
    `${mitraLabel}: ${receipt.mitra || receipt.namaMitra || '-'}`,
    `---------------------------------`,
  ];

  const itemsList = Array.isArray(receipt.items) ? receipt.items.filter(Boolean) : [];
  if (itemsList.length > 0) {
    itemsList.forEach((it) => {
      const hrg = Number(it.harga) || 0;
      const subtot = Number(it.subtotal) || 0;
      const subStr =
        it.subtotalText !== undefined
          ? it.subtotalText
          : `Rp ${subtot.toLocaleString('id-ID')}`;
      if (it.detailLine !== undefined) {
        lines.push(
          `• ${it.nama || 'Item'}${it.detailLine ? ` [${it.detailLine}]` : ''} = ${subStr}`
        );
      } else {
        lines.push(
          `• ${it.nama || 'Item'} (${it.qty || 1} ${it.satuan || 'Pcs'} x Rp ${hrg.toLocaleString(
            'id-ID'
          )}) = ${subStr}`
        );
      }
    });
    lines.push(`---------------------------------`);
  }

  const detailRows = Array.isArray(receipt.detailRows) ? receipt.detailRows.filter(Boolean) : [];
  detailRows.forEach((r) => {
    const valStr = typeof r.value === 'number' ? formatRupiah(r.value) : String(r.value ?? '-');
    lines.push(`${r.label || 'Keterangan'}: ${valStr}`);
  });

  if (typeof receipt.total === 'number' && !detailRows.some((r) => r.isTotal)) {
    lines.push(`TOTAL: ${formatRupiah(receipt.total)}`);
  }

  if (receipt.catatan) {
    lines.push(`Keterangan: ${receipt.catatan}`);
  }

  return lines.join('\n');
}

/**
 * Membangun dokumen HTML siap cetak khusus printer thermal 80mm (atau 58mm).
 * Area cetak 72mm (untuk roll 80mm) dengan kontras hitam murni agar tajam di head thermal.
 */
export function buildThermalReceiptHtml(
  receipt: ReceiptData,
  profilPerusahaan?: ProfilPerusahaan | null,
  settingsOverride?: Partial<ThermalReceiptSettings>
): string {
  const settings: ThermalReceiptSettings = {
    ...getThermalSettings(),
    ...settingsOverride,
  };
  const is58 = settings.paperWidthMm === 58;
  const pageWidthMm = is58 ? 58 : 80;
  const contentWidthMm = is58 ? 50 : 72;
  const baseFontPx = is58 ? 10 : 11.5;

  const { companyName, companyTagline, companyContact } = resolveCompanyMeta(profilPerusahaan);
  const itemsList = Array.isArray(receipt.items) ? receipt.items.filter(Boolean) : [];
  const detailRowsList = Array.isArray(receipt.detailRows) ? receipt.detailRows.filter(Boolean) : [];
  const hasExplicitTotalRow = detailRowsList.some((r) => Boolean(r.isTotal));
  const noTx = receipt.nomorTransaksi || receipt.nomorNota || '-';
  const pihak = receipt.mitra || receipt.namaMitra || '';
  const kasir = receipt.kasir || 'Kasir PT Wijaya Agro';

  const mitraLabel = receipt.mitraLabel || 'Mitra/Pihak';
  const itemsHeaderLeft = receipt.itemsHeaderLeft || 'ITEM / RINCIAN';
  const itemsHeaderRight = receipt.itemsHeaderRight || 'SUBTOTAL';
  const signatureRightLabel = receipt.signatureRightLabel || 'Mitra / Penerima';

  const itemsHtml =
    itemsList.length > 0
      ? `
      <div class="divider"></div>
      <div class="section-head">
        <span>${escapeHtml(itemsHeaderLeft)}</span>
        <span>${escapeHtml(itemsHeaderRight)}</span>
      </div>
      <div class="divider-thin"></div>
      ${itemsList
        .map((it) => {
          const qty = it.qty ?? 1;
          const satuan = it.satuan || 'Pcs';
          const hrg = Number(it.harga) || 0;
          const subtot = Number(it.subtotal) || 0;
          const leftDetail =
            it.detailLine !== undefined
              ? it.detailLine
              : `${qty} ${satuan} x ${hrg.toLocaleString('id-ID')}`;
          const subStr =
            it.subtotalText !== undefined
              ? it.subtotalText
              : subtot === 0
              ? 'Rp 0 (PT)'
              : formatRupiah(subtot);
          return `
            <div class="item-block">
              <div class="item-name">${escapeHtml(it.nama || '-')}</div>
              <div class="item-calc">
                <span>${escapeHtml(leftDetail)}</span>
                <span class="bold">${escapeHtml(subStr)}</span>
              </div>
            </div>
          `;
        })
        .join('')}
    `
      : '';

  const detailsHtml =
    detailRowsList.length > 0
      ? `
      <div class="divider"></div>
      ${detailRowsList
        .map((row) => {
          const valStr =
            typeof row.value === 'number' ? formatRupiah(row.value) : String(row.value ?? '-');
          if (row.isTotal) {
            return `
              <div class="divider-double"></div>
              <div class="row total-row">
                <span>${escapeHtml(row.label || 'TOTAL')}</span>
                <span>${escapeHtml(valStr)}</span>
              </div>
              <div class="divider-double"></div>
            `;
          }
          return `
            <div class="row ${row.highlight ? 'bold' : ''}">
              <span class="row-label">${escapeHtml(row.label || '-')}</span>
              <span class="row-val">${escapeHtml(valStr)}</span>
            </div>
          `;
        })
        .join('')}
    `
      : '';

  const fallbackTotalHtml =
    !hasExplicitTotalRow && typeof receipt.total === 'number'
      ? `
      <div class="divider-double"></div>
      <div class="row total-row">
        <span>TOTAL</span>
        <span>${escapeHtml(formatRupiah(receipt.total))}</span>
      </div>
      <div class="divider-double"></div>
    `
      : '';

  const catatanHtml = receipt.catatan
    ? `
      <div class="divider-thin"></div>
      <div class="notes">
        <span class="bold">Ket:</span> ${escapeHtml(receipt.catatan)}
      </div>
    `
    : '';

  const signaturesHtml = settings.includeSignatures
    ? `
      <div class="divider"></div>
      <div class="sig-grid">
        <div class="sig-col">
          <div>Kasir</div>
          <div class="sig-space"></div>
          <div class="bold">(${escapeHtml(kasir)})</div>
        </div>
        <div class="sig-col">
          <div>${escapeHtml(signatureRightLabel)}</div>
          <div class="sig-space"></div>
          <div class="bold">(${escapeHtml(pihak || 'Tanda Tangan')})</div>
        </div>
      </div>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>Struk ${escapeHtml(noTx)}</title>
  <style>
    @page {
      size: ${pageWidthMm}mm auto;
      margin: 0mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      width: ${pageWidthMm}mm;
      font-family: "Courier New", "Liberation Mono", "Consolas", monospace;
      font-size: ${baseFontPx}px;
      line-height: 1.32;
      font-weight: 600;
    }
    .receipt {
      width: ${contentWidthMm}mm;
      margin: 0 auto;
      padding: 3mm 0 6mm 0;
    }
    .center { text-align: center; }
    .bold { font-weight: 800; }
    .company-name {
      font-size: ${is58 ? 12.5 : 14.5}px;
      font-weight: 900;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .company-sub {
      font-size: ${is58 ? 9 : 10}px;
      margin-top: 2px;
      line-height: 1.25;
    }
    .receipt-title {
      font-size: ${is58 ? 11 : 12.5}px;
      font-weight: 900;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .receipt-subtitle {
      font-size: ${is58 ? 9.5 : 10.5}px;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    .divider-thin {
      border-top: 1px dotted #000;
      margin: 4px 0;
    }
    .divider-double {
      border-top: 1.5px solid #000;
      margin: 4px 0;
    }
    .meta-row, .row, .section-head, .item-calc {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
    }
    .meta-row {
      margin: 1.5px 0;
      font-size: ${is58 ? 9.5 : 10.5}px;
    }
    .row {
      margin: 2px 0;
    }
    .row-label {
      flex: 1 1 auto;
      word-break: break-word;
    }
    .row-val {
      flex: 0 0 auto;
      text-align: right;
      white-space: nowrap;
    }
    .section-head {
      font-size: ${is58 ? 9.5 : 10.5}px;
      font-weight: 800;
      letter-spacing: 0.2px;
    }
    .item-block {
      margin: 4px 0;
    }
    .item-name {
      font-weight: 800;
      word-break: break-word;
    }
    .item-calc {
      font-size: ${is58 ? 9.5 : 10.5}px;
      padding-left: 2px;
    }
    .total-row {
      font-size: ${is58 ? 12 : 13.5}px;
      font-weight: 900;
      margin: 3px 0;
    }
    .notes {
      font-size: ${is58 ? 9.5 : 10.5}px;
      word-break: break-word;
      margin: 3px 0;
    }
    .sig-grid {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      text-align: center;
      font-size: ${is58 ? 9 : 10}px;
      margin-top: 4px;
    }
    .sig-col {
      flex: 1 1 50%;
    }
    .sig-space {
      height: 11mm;
    }
    .footer {
      text-align: center;
      font-size: ${is58 ? 8.5 : 9.5}px;
      margin-top: 6px;
      line-height: 1.3;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="company-name">${escapeHtml(companyName)}</div>
      ${companyTagline ? `<div class="company-sub">${escapeHtml(companyTagline)}</div>` : ''}
      ${companyContact ? `<div class="company-sub">${escapeHtml(companyContact)}</div>` : ''}
    </div>

    <div class="divider"></div>
    <div class="center">
      <div class="receipt-title">${escapeHtml(receipt.title || 'BUKTI TRANSAKSI')}</div>
      ${receipt.subtitle ? `<div class="receipt-subtitle">${escapeHtml(receipt.subtitle)}</div>` : ''}
    </div>
    <div class="divider"></div>

    <div class="meta-row">
      <span>No. Trx</span>
      <span class="bold">${escapeHtml(noTx)}</span>
    </div>
    <div class="meta-row">
      <span>Waktu</span>
      <span>${escapeHtml(`${receipt.tanggal || '-'} ${receipt.jam || ''} WIB`.trim())}</span>
    </div>
    ${
      pihak
        ? `<div class="meta-row"><span>${escapeHtml(mitraLabel)}</span><span class="bold">${escapeHtml(pihak)}</span></div>`
        : ''
    }
    <div class="meta-row">
      <span>Kasir</span>
      <span>${escapeHtml(kasir)}</span>
    </div>

    ${itemsHtml}
    ${detailsHtml}
    ${fallbackTotalHtml}
    ${catatanHtml}
    ${signaturesHtml}

    <div class="divider-thin"></div>
    <div class="footer">
      <div>Terima kasih atas transaksi Anda</div>
      <div>Sistem ERP Wijaya Agro · Struk ${pageWidthMm}mm</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Mencetak struk thermal 80mm/58mm menggunakan iframe terisolasi (tanpa window.open,
 * tidak ikut mencetak tampilan belakang aplikasi).
 */
export function printThermalReceiptBrowser(
  receipt: ReceiptData,
  profilPerusahaan?: ProfilPerusahaan | null,
  settingsOverride?: Partial<ThermalReceiptSettings>
): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    try {
      const html = buildThermalReceiptHtml(receipt, profilPerusahaan, settingsOverride);
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        setTimeout(() => {
          try {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          } catch {
            // ignore
          }
        }, 400);
      };

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !iframe.contentWindow) {
        cleanup();
        resolve({
          ok: false,
          message: 'Iframe cetak tidak tersedia di browser ini. Coba gunakan opsi Bluetooth atau Salin WA.',
        });
        return;
      }

      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) {
            cleanup();
            resolve({ ok: false, message: 'Jendela cetak tidak tersedia.' });
            return;
          }
          win.addEventListener('afterprint', cleanup, { once: true });
          win.focus();
          win.print();
          // Fallback cleanup if afterprint doesn't fire in some browsers
          setTimeout(cleanup, 4000);
          resolve({ ok: true });
        } catch (err: any) {
          cleanup();
          resolve({
            ok: false,
            message:
              err?.message ||
              'Dialog cetak diblokir oleh sandbox iframe. Buka Link Full Tampilan atau gunakan Bluetooth ESC/POS.',
          });
        }
      }, 140);
    } catch (err: any) {
      resolve({
        ok: false,
        message: err?.message || 'Gagal menyiapkan cetak struk thermal.',
      });
    }
  });
}

// =========================================================================
// ESC/POS 80mm / 58mm DIRECT THERMAL BUILDER (WEB BLUETOOTH & RAWBT ANDROID)
// =========================================================================

function wrapTextLines(text: string, maxCols: number): string[] {
  const clean = normalizeAsciiText(text).trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w.slice(0, maxCols);
    } else if (cur.length + 1 + w.length <= maxCols) {
      cur += ` ${w}`;
    } else {
      out.push(cur);
      cur = w.slice(0, maxCols);
    }
  }
  if (cur) out.push(cur);
  return out;
}

function formatTwoColLine(left: string, right: string, cols: number): string {
  const l = normalizeAsciiText(left).trim();
  const r = normalizeAsciiText(right).trim();
  if (l.length + r.length + 1 <= cols) {
    return l + ' '.repeat(cols - l.length - r.length) + r;
  }
  const maxLeft = Math.max(4, cols - r.length - 1);
  return `${l.slice(0, maxLeft)} ${r}`;
}

export function buildEscPosReceiptBytes(
  receipt: ReceiptData,
  profilPerusahaan?: ProfilPerusahaan | null,
  settingsOverride?: Partial<ThermalReceiptSettings>
): Uint8Array {
  const settings: ThermalReceiptSettings = {
    ...getThermalSettings(),
    ...settingsOverride,
  };
  const cols = settings.paperWidthMm === 58 ? 32 : 48;
  const { companyName, companyTagline, companyContact } = resolveCompanyMeta(profilPerusahaan);
  const itemsList = Array.isArray(receipt.items) ? receipt.items.filter(Boolean) : [];
  const detailRowsList = Array.isArray(receipt.detailRows) ? receipt.detailRows.filter(Boolean) : [];
  const hasExplicitTotalRow = detailRowsList.some((r) => Boolean(r.isTotal));
  const noTx = receipt.nomorTransaksi || receipt.nomorNota || '-';
  const pihak = receipt.mitra || receipt.namaMitra || '';
  const kasir = receipt.kasir || 'Kasir PT Wijaya Agro';

  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushBytes = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));
  const pushLine = (text = '') => chunks.push(encoder.encode(`${normalizeAsciiText(text)}\n`));
  const dashLine = '-'.repeat(cols);
  const eqLine = '='.repeat(cols);

  // ESC @ (Init printer)
  pushBytes(0x1b, 0x40);
  // Center + Bold + Double Height for Company Name
  pushBytes(0x1b, 0x61, 0x01); // Center
  pushBytes(0x1b, 0x45, 0x01); // Bold ON
  pushBytes(0x1d, 0x21, 0x01); // Double Height
  for (const line of wrapTextLines(companyName.toUpperCase(), cols)) {
    pushLine(line);
  }
  pushBytes(0x1d, 0x21, 0x00); // Normal size
  pushBytes(0x1b, 0x45, 0x00); // Bold OFF
  for (const line of wrapTextLines(companyTagline, cols)) {
    pushLine(line);
  }
  for (const line of wrapTextLines(companyContact, cols)) {
    pushLine(line);
  }

  pushLine(dashLine);
  pushBytes(0x1b, 0x45, 0x01);
  pushLine((receipt.title || 'BUKTI TRANSAKSI').toUpperCase());
  pushBytes(0x1b, 0x45, 0x00);
  if (receipt.subtitle) {
    for (const line of wrapTextLines(receipt.subtitle, cols)) {
      pushLine(line);
    }
  }
  pushLine(dashLine);

  const mitraLabel = receipt.mitraLabel || 'Mitra/Pihak';
  const itemsHeaderLeft = receipt.itemsHeaderLeft || 'ITEM / RINCIAN';
  const itemsHeaderRight = receipt.itemsHeaderRight || 'SUBTOTAL';
  const signatureRightLabel = receipt.signatureRightLabel || 'Mitra / Penerima';

  // Left align metadata
  pushBytes(0x1b, 0x61, 0x00);
  pushLine(formatTwoColLine('No. Trx', noTx, cols));
  pushLine(formatTwoColLine('Waktu', `${receipt.tanggal || '-'} ${receipt.jam || ''} WIB`.trim(), cols));
  if (pihak) {
    pushLine(formatTwoColLine(mitraLabel, pihak, cols));
  }
  pushLine(formatTwoColLine('Kasir', kasir, cols));

  if (itemsList.length > 0) {
    pushLine(dashLine);
    pushBytes(0x1b, 0x45, 0x01);
    pushLine(formatTwoColLine(itemsHeaderLeft, itemsHeaderRight, cols));
    pushBytes(0x1b, 0x45, 0x00);
    pushLine(dashLine);
    for (const it of itemsList) {
      const qty = it.qty ?? 1;
      const satuan = it.satuan || 'Pcs';
      const hrg = Number(it.harga) || 0;
      const subtot = Number(it.subtotal) || 0;
      const leftDetail =
        it.detailLine !== undefined
          ? it.detailLine
          : `${qty} ${satuan} x ${hrg.toLocaleString('id-ID')}`;
      const subStr =
        it.subtotalText !== undefined
          ? it.subtotalText
          : subtot === 0
          ? 'Rp 0 (PT)'
          : formatRupiah(subtot);
      pushBytes(0x1b, 0x45, 0x01);
      for (const l of wrapTextLines(it.nama || '-', cols)) {
        pushLine(l);
      }
      pushBytes(0x1b, 0x45, 0x00);
      pushLine(formatTwoColLine(leftDetail, subStr, cols));
    }
  }

  if (detailRowsList.length > 0) {
    pushLine(dashLine);
    for (const row of detailRowsList) {
      const valStr = typeof row.value === 'number' ? formatRupiah(row.value) : String(row.value ?? '-');
      if (row.isTotal) {
        pushLine(eqLine);
        pushBytes(0x1b, 0x45, 0x01);
        pushBytes(0x1d, 0x21, 0x01);
        pushLine(formatTwoColLine(row.label || 'TOTAL', valStr, cols));
        pushBytes(0x1d, 0x21, 0x00);
        pushBytes(0x1b, 0x45, 0x00);
        pushLine(eqLine);
      } else {
        if (row.highlight) pushBytes(0x1b, 0x45, 0x01);
        pushLine(formatTwoColLine(row.label || '-', valStr, cols));
        if (row.highlight) pushBytes(0x1b, 0x45, 0x00);
      }
    }
  }

  if (!hasExplicitTotalRow && typeof receipt.total === 'number') {
    pushLine(eqLine);
    pushBytes(0x1b, 0x45, 0x01);
    pushBytes(0x1d, 0x21, 0x01);
    pushLine(formatTwoColLine('TOTAL', formatRupiah(receipt.total), cols));
    pushBytes(0x1d, 0x21, 0x00);
    pushBytes(0x1b, 0x45, 0x00);
    pushLine(eqLine);
  }

  if (receipt.catatan) {
    pushLine(dashLine);
    for (const l of wrapTextLines(`Ket: ${receipt.catatan}`, cols)) {
      pushLine(l);
    }
  }

  if (settings.includeSignatures) {
    pushLine(dashLine);
    pushLine(formatTwoColLine('Kasir', signatureRightLabel, cols));
    pushLine('');
    pushLine('');
    pushLine(formatTwoColLine(`(${kasir.slice(0, 18)})`, `(${(pihak || 'Tanda Tangan').slice(0, 18)})`, cols));
  }

  pushLine(dashLine);
  pushBytes(0x1b, 0x61, 0x01); // Center
  pushLine('Terima kasih atas transaksi Anda');
  pushLine(`ERP Wijaya Agro - Struk ${settings.paperWidthMm}mm`);
  pushLine('');
  pushLine('');
  pushLine('');

  // Partial Auto-Cut (GS V 66 3)
  if (settings.autoCutEscPos) {
    pushBytes(0x1d, 0x56, 0x42, 0x03);
  }

  const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

// Session cache for paired BLE thermal printer so subsequent prints are 1-click instant
let cachedBtDevice: any = null;
let cachedBtChar: any = null;

const COMMON_THERMAL_BLE_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as any).bluetooth);
}

export function getConnectedBluetoothPrinterName(): string | null {
  if (cachedBtDevice?.gatt?.connected && cachedBtChar) {
    return cachedBtDevice.name || 'Printer Thermal Bluetooth';
  }
  return null;
}

export function disconnectBluetoothPrinter(): void {
  try {
    if (cachedBtDevice?.gatt?.connected) {
      cachedBtDevice.gatt.disconnect();
    }
  } catch {
    // ignore
  }
  cachedBtDevice = null;
  cachedBtChar = null;
}

export async function printThermalViaBluetooth(
  receipt: ReceiptData,
  profilPerusahaan?: ProfilPerusahaan | null,
  settingsOverride?: Partial<ThermalReceiptSettings>
): Promise<{ ok: boolean; printerName?: string; message?: string }> {
  const navAny = navigator as any;
  if (!navAny?.bluetooth) {
    return {
      ok: false,
      message:
        'Browser ini tidak mendukung Web Bluetooth. Gunakan tombol "Cetak Thermal 80mm" (USB/Driver) atau "RawBT Android".',
    };
  }

  try {
    let characteristic = cachedBtChar;
    let device = cachedBtDevice;

    if (!device || !device.gatt?.connected || !characteristic) {
      device = await navAny.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: COMMON_THERMAL_BLE_SERVICES,
      });

      const server = await device.gatt.connect();
      let foundChar: any = null;

      for (const svcUuid of COMMON_THERMAL_BLE_SERVICES) {
        try {
          const service = await server.getPrimaryService(svcUuid);
          const chars = await service.getCharacteristics();
          const writable = chars.find(
            (c: any) => c.properties?.write || c.properties?.writeWithoutResponse
          );
          if (writable) {
            foundChar = writable;
            break;
          }
        } catch {
          // Try next service UUID
        }
      }

      if (!foundChar) {
        const allServices = await server.getPrimaryServices();
        for (const service of allServices) {
          const chars = await service.getCharacteristics();
          const writable = chars.find(
            (c: any) => c.properties?.write || c.properties?.writeWithoutResponse
          );
          if (writable) {
            foundChar = writable;
            break;
          }
        }
      }

      if (!foundChar) {
        return {
          ok: false,
          message:
            'Printer Bluetooth tersambung, tetapi layanan cetak BLE ESC/POS tidak ditemukan. Jika printer memakai Bluetooth Classic, gunakan tombol "Cetak Thermal 80mm" atau "RawBT Android".',
        };
      }

      cachedBtDevice = device;
      cachedBtChar = foundChar;
      characteristic = foundChar;
    }

    const bytes = buildEscPosReceiptBytes(receipt, profilPerusahaan, settingsOverride);
    const CHUNK_SIZE = 180;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const slice = bytes.slice(i, i + CHUNK_SIZE);
      if (characteristic.properties?.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
        await characteristic.writeValueWithoutResponse(slice);
      } else {
        await characteristic.writeValue(slice);
      }
      await new Promise((r) => setTimeout(r, 25));
    }

    return {
      ok: true,
      printerName: device?.name || 'Printer Thermal Bluetooth',
    };
  } catch (err: any) {
    if (err?.name === 'NotFoundError') {
      return { ok: false, message: 'Pemilihan printer Bluetooth dibatalkan.' };
    }
    return {
      ok: false,
      message: err?.message || 'Gagal mencetak via Bluetooth ESC/POS.',
    };
  }
}

/**
 * Mengirim perintah ESC/POS 80mm/58mm dalam format Base64 ke aplikasi RawBT (Android).
 */
export function printThermalViaRawBt(
  receipt: ReceiptData,
  profilPerusahaan?: ProfilPerusahaan | null,
  settingsOverride?: Partial<ThermalReceiptSettings>
): { ok: boolean; message?: string } {
  try {
    const bytes = buildEscPosReceiptBytes(receipt, profilPerusahaan, settingsOverride);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const a = document.createElement('a');
    a.href = `rawbt:base64,${base64}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
      } catch {
        // ignore
      }
    }, 300);
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Gagal mengirim perintah cetak ke aplikasi RawBT.',
    };
  }
}
