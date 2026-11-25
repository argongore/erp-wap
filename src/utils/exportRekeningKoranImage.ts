import {
  DEFAULT_PT_LOGO_URL,
  getRoleMitraLabel,
  ProfilPerusahaan,
  RekeningKoranHistoryItem,
  RekeningKoranMitraSummary,
} from '../server/types.ts';
import { formatRupiah, formatTanggalIndo } from './format.ts';
import { formatItemTextForPdf, loadLogoDataUrl } from './exportRekeningKoranPdf.ts';

export interface ExportRekeningKoranImageOptions {
  format: 'jpg' | 'png';
  printScope?: 'SALDO_BERJALAN' | 'SEMUA_HISTORY';
  includeNotaProofs?: boolean;
  customRows?: RekeningKoranHistoryItem[];
  scopeLabel?: string;
}

export interface ExportRekeningKoranImageResult {
  filenames: string[];
  pageCount: number;
}

const LOGICAL_WIDTH = 1240;
const MARGIN_X = 48;
const CONTENT_WIDTH = LOGICAL_WIDTH - MARGIN_X * 2; // 1144

const SANS_FONT = '"Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Consolas, monospace';

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
  if (url.startsWith('data:image/')) {
    return loadHtmlImage(url);
  }
  const dataUrl = await loadLogoDataUrl(url);
  if (dataUrl) {
    return loadHtmlImage(dataUrl);
  }
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
        // Break overly long unbreakable tokens (like long URLs or IDs)
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

interface PreparedTableRow {
  noText: string;
  tanggal: string;
  txId: string;
  itemLines: string[];
  qtyLines: string[];
  hargaLines: string[];
  piutangText: string;
  piutangSubText?: string;
  titipText: string;
  titipSubText?: string;
  ketLines: string[];
  rowHeight: number;
}

/**
 * Generates & downloads Rekening Koran Mitra / History Transaksi as crisp PNG or JPG image(s)
 * matching the corporate invoice layout of PT Wijaya Agro Perkasa.
 */
export async function exportRekeningKoranToImage(
  statement: RekeningKoranMitraSummary,
  profilPerusahaan?: ProfilPerusahaan | null,
  rekeningUtamaDetail?: {
    kode: string;
    nama: string;
    nomorRekening?: string;
    atasNama?: string;
  },
  options: ExportRekeningKoranImageOptions = { format: 'jpg' }
): Promise<ExportRekeningKoranImageResult> {
  const format = options.format || 'jpg';
  const printScope = options.printScope || 'SALDO_BERJALAN';
  const includeNotaProofs = options.includeNotaProofs ?? false;

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

  const activeRekeningUtama = rekeningUtamaDetail || statement.rekeningUtamaDetail;
  const runningRows: RekeningKoranHistoryItem[] = Array.isArray(statement.historySaldoBerjalan)
    ? statement.historySaldoBerjalan
    : (statement.history || []).filter((h) => h.isSaldoBerjalan !== false);

  const activeRows: RekeningKoranHistoryItem[] = Array.isArray(options.customRows)
    ? options.customRows
    : printScope === 'SALDO_BERJALAN'
    ? runningRows
    : statement.history || [];

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const noDokumen = `RK/${statement.kodeMitra}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${activeRows.length}`;
  const bookLabel =
    options.scopeLabel ||
    (printScope === 'SALDO_BERJALAN' ? 'SALDO BERJALAN' : 'SEMUA + HISTORY');

  const sisaBayarBersih =
    statement.sisaBonBersih ?? Math.max(0, statement.totalBonKeseluruhan - statement.totalTitip);
  const sisaTitipBersih =
    statement.sisaTitipanBersih ?? Math.max(0, statement.totalTitip - statement.totalBonKeseluruhan);
  const displayPiutangTotal =
    printScope === 'SALDO_BERJALAN'
      ? (statement.totalPiutangBerjalanTampil ?? statement.totalBonKeseluruhan)
      : statement.totalBonKeseluruhan;
  const displayTitipTotal =
    printScope === 'SALDO_BERJALAN'
      ? (statement.totalTitipBerjalanTampil ?? statement.totalTitip)
      : statement.totalTitip;

  const getRowPiutangVal = (row: RekeningKoranHistoryItem) =>
    printScope === 'SALDO_BERJALAN'
      ? row.piutangBerjalan ?? row.sisaPiutangNota ?? row.debet
      : row.debet;

  const getRowTitipVal = (row: RekeningKoranHistoryItem) =>
    printScope === 'SALDO_BERJALAN'
      ? row.titipBerjalan ?? (row.kredit === 0 ? row.nominalMutasiHak || 0 : 0)
      : row.kredit > 0
      ? row.kredit
      : row.nominalMutasiHak || (row.debet === 0 ? row.nominalTransaksi || 0 : 0);

  // Column widths summing to CONTENT_WIDTH (1144px)
  const cols = [
    { key: 'no', label: 'NO.', width: 48, align: 'center' as const },
    { key: 'tanggal', label: 'TANGGAL', width: 120, align: 'left' as const },
    { key: 'item', label: 'ITEM / URAIAN', width: 320, align: 'left' as const },
    { key: 'qty', label: 'QTY', width: 88, align: 'center' as const },
    { key: 'harga', label: 'HARGA', width: 124, align: 'right' as const },
    {
      key: 'piutang',
      label: printScope === 'SALDO_BERJALAN' ? 'PIUTANG' : 'BON (+)',
      width: 132,
      align: 'right' as const,
    },
    {
      key: 'titip',
      label: printScope === 'SALDO_BERJALAN' ? 'TITIP' : 'BAYAR / TITIP',
      width: 132,
      align: 'right' as const,
    },
    { key: 'ket', label: 'KETERANGAN', width: 180, align: 'left' as const },
  ];

  // Prepare measurement context
  const measureCanvas = document.createElement('canvas');
  measureCanvas.width = 10;
  measureCanvas.height = 10;
  const mCtx = measureCanvas.getContext('2d')!;

  const ITEM_FONT = `600 13px ${SANS_FONT}`;
  const KET_FONT = `500 12.5px ${SANS_FONT}`;
  const QTY_FONT = `700 12.5px ${MONO_FONT}`;
  const HARGA_FONT = `600 12.5px ${MONO_FONT}`;
  const LINE_H = 18;
  const CELL_PAD_Y = 12;

  const preparedRows: PreparedTableRow[] =
    activeRows.length === 0
      ? [
          {
            noText: '-',
            tanggal: '-',
            txId: '',
            itemLines: [
              printScope === 'SALDO_BERJALAN'
                ? 'Tidak ada saldo piutang atau titipan yang sedang berjalan'
                : 'Belum ada histori transaksi untuk mitra ini',
            ],
            qtyLines: ['-'],
            hargaLines: ['-'],
            piutangText: '-',
            titipText: '-',
            ketLines: ['-'],
            rowHeight: 54,
          },
        ]
      : activeRows.map((row, idx) => {
          const formatted = formatItemTextForPdf(row);
          const piutangVal = getRowPiutangVal(row);
          const titipVal = getRowTitipVal(row);
          const displayTxId = row.idTransaksiInduk || row.id;

          const itemLines = wrapTextLines(mCtx, formatted.itemText, cols[2].width - 18, ITEM_FONT);
          const qtyLines = wrapTextLines(mCtx, formatted.qtyText, cols[3].width - 14, QTY_FONT);
          const hargaLines = wrapTextLines(mCtx, formatted.hargaText, cols[4].width - 14, HARGA_FONT);
          const ketLines = wrapTextLines(mCtx, formatted.ketText, cols[7].width - 18, KET_FONT);

          const piutangSubText =
            printScope === 'SALDO_BERJALAN' &&
            row.debet > 0 &&
            piutangVal > 0 &&
            piutangVal < row.debet
              ? `Awal: ${formatRupiah(row.debet)}`
              : undefined;

          const titipSubText =
            printScope === 'SALDO_BERJALAN' &&
            (row.nominalMutasiHak || 0) > 0 &&
            titipVal > 0 &&
            titipVal < (row.nominalMutasiHak || 0)
              ? `Awal: ${formatRupiah(row.nominalMutasiHak || 0)}`
              : undefined;

          const maxLineCount = Math.max(
            itemLines.length,
            qtyLines.length,
            hargaLines.length,
            ketLines.length,
            displayTxId ? 2 : 1,
            piutangSubText || titipSubText ? 2 : 1
          );
          const rowHeight = Math.max(42, maxLineCount * LINE_H + CELL_PAD_Y * 2);

          const isBelumPutus = Boolean(row.isBelumPutusHarga || row.statusTransaksi === 'BELUM_PUTUS_HARGA');
          return {
            noText: String(idx + 1),
            tanggal: row.tanggal || '-',
            txId: displayTxId,
            itemLines,
            qtyLines,
            hargaLines,
            piutangText: piutangVal > 0 ? formatRupiah(piutangVal) : '-',
            piutangSubText,
            titipText: titipVal > 0 ? formatRupiah(titipVal) : isBelumPutus ? 'Belum Putus' : '-',
            titipSubText,
            ketLines,
            rowHeight,
          };
        });

  // Preload Logo & optional nota proofs
  const logoImg = await loadSafeCanvasImage(activeProfil.logoUrl || DEFAULT_PT_LOGO_URL);

  interface LoadedProofItem {
    title: string;
    subtitle: string;
    nominal: string;
    img: HTMLImageElement;
  }
  const loadedProofs: LoadedProofItem[] = [];
  if (includeNotaProofs) {
    const seenParentIds = new Set<string>();
    const rawProofs = activeRows.filter((h) => {
      if (!h.isNotaLalu) return false;
      if (!h.attachment_url && !h.fotoNota) return false;
      const pk = h.idTransaksiInduk || h.id;
      if (seenParentIds.has(pk)) return false;
      seenParentIds.add(pk);
      return true;
    });

    for (const h of rawProofs.slice(0, 8)) {
      const parentId = h.idTransaksiInduk || h.id;
      const imgs = (h.attachment_url || h.fotoNota || '')
        .split('|||')
        .map((s) => s.trim())
        .filter(Boolean);
      for (let i = 0; i < imgs.length && loadedProofs.length < 8; i++) {
        const loaded = await loadSafeCanvasImage(imgs[i]);
        if (loaded) {
          loadedProofs.push({
            title: h.noNotaLalu ? `No. Nota: ${h.noNotaLalu}` : `ID: ${parentId}`,
            subtitle: `${h.tanggal} · ${h.jenis.replace(/_/g, ' ')}`,
            nominal: formatRupiah(
              h.piutangBerjalan ?? h.debet ?? h.titipBerjalan ?? h.nominalMutasiHak ?? 0
            ),
            img: loaded,
          });
        }
      }
    }
  }

  // Split preparedRows into logical page chunks if total height would exceed ~6800 logical px
  // (ensures browser canvas stays fast, sharp at 2x Retina DPI, and never hits canvas max-size limits)
  const HEADER_BLOCK_H = 318;
  const TABLE_HEAD_H = 40;
  const TABLE_FOOT_H = 44;
  const FOOTER_BLOCK_H = 165;
  const MAX_PAGE_CONTENT_H = 6600;

  const pageChunks: PreparedTableRow[][] = [];
  let currentChunk: PreparedTableRow[] = [];
  let accHeight = HEADER_BLOCK_H + TABLE_HEAD_H + TABLE_FOOT_H + FOOTER_BLOCK_H;

  for (const row of preparedRows) {
    if (currentChunk.length > 0 && accHeight + row.rowHeight > MAX_PAGE_CONTENT_H) {
      pageChunks.push(currentChunk);
      currentChunk = [row];
      accHeight = 140 + TABLE_HEAD_H + TABLE_FOOT_H + FOOTER_BLOCK_H + row.rowHeight;
    } else {
      currentChunk.push(row);
      accHeight += row.rowHeight;
    }
  }
  if (currentChunk.length > 0 || pageChunks.length === 0) {
    pageChunks.push(currentChunk);
  }

  const totalPages = pageChunks.length;
  const safeMitraName = statement.namaMitra.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePrefix =
    printScope === 'SEMUA_HISTORY' ? 'History_Transaksi' : 'Rekening_Koran';
  const ext = format === 'png' ? 'png' : 'jpg';
  const downloadedFilenames: string[] = [];

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    const chunkRows = pageChunks[pIdx];
    const isFirstPage = pIdx === 0;
    const isLastPage = pIdx === totalPages - 1;

    const topSectionH = isFirstPage ? HEADER_BLOCK_H : 120;
    const rowsHeight = chunkRows.reduce((s, r) => s + r.rowHeight, 0);
    const footTableH = isLastPage ? TABLE_FOOT_H : 0;
    const bottomFooterH = isLastPage ? FOOTER_BLOCK_H : 54;

    // Optional proofs grid only on last page
    let proofsBlockH = 0;
    const proofCardW = (CONTENT_WIDTH - 24) / 2;
    const proofCardH = 420;
    if (isLastPage && loadedProofs.length > 0) {
      const gridRows = Math.ceil(loadedProofs.length / 2);
      proofsBlockH = 64 + gridRows * (proofCardH + 18);
    }

    const totalLogicalH = topSectionH + TABLE_HEAD_H + rowsHeight + footTableH + bottomFooterH + proofsBlockH + 36;
    const scale = totalLogicalH * 2 <= 15500 ? 2 : totalLogicalH * 1.5 <= 15500 ? 1.5 : 1;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(LOGICAL_WIDTH * scale);
    canvas.height = Math.round(totalLogicalH * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);

    // Pure white corporate page background (essential for JPG)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, totalLogicalH);

    // Subtle outer border
    drawRoundedRect(ctx, 18, 18, LOGICAL_WIDTH - 36, totalLogicalH - 36, 10, '#ffffff', '#18181b', 2);

    let y = 44;

    if (isFirstPage) {
      // 1. KOP NOTA MODERN PT WIJAYA AGRO PERKASA
      let textX = MARGIN_X;
      if (logoImg) {
        try {
          ctx.save();
          drawRoundedRect(ctx, MARGIN_X, y, 76, 76, 8, '#ffffff', '#cbd5e1', 1);
          ctx.clip();
          ctx.drawImage(logoImg, MARGIN_X, y, 76, 76);
          ctx.restore();
          textX = MARGIN_X + 92;
        } catch {
          textX = MARGIN_X;
        }
      } else {
        drawRoundedRect(ctx, MARGIN_X, y, 8, 76, 3, '#0f172a');
        textX = MARGIN_X + 20;
      }

      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 22px ${SANS_FONT}`;
      ctx.fillText(activeProfil.namaPerusahaan.toUpperCase(), textX, y);

      ctx.fillStyle = '#374151';
      ctx.font = `600 12.5px ${SANS_FONT}`;
      const addrLines = wrapTextLines(ctx, activeProfil.alamat, 620, `600 12.5px ${SANS_FONT}`);
      addrLines.slice(0, 2).forEach((line, idx) => {
        ctx.fillText(line, textX, y + 29 + idx * 16);
      });

      ctx.fillStyle = '#1e293b';
      ctx.font = `700 11.5px ${MONO_FONT}`;
      ctx.fillText('TELPON KASIR 0821 44 999 305 · TELPON ADM 0812 2000 3305', textX, y + 63);

      ctx.fillStyle = '#4b5563';
      ctx.font = `500 11.5px ${SANS_FONT}`;
      ctx.fillText(`EMAIL : ${activeProfil.email}`, textX, y + 81);

      // Right Invoice Header Box
      const rightBoxW = 310;
      const rightBoxX = MARGIN_X + CONTENT_WIDTH - rightBoxW;
      drawRoundedRect(ctx, rightBoxX, y, rightBoxW, 96, 8, '#f8fafc', '#18181b', 1.5);

      ctx.fillStyle = '#0f172a';
      ctx.font = `900 13px ${SANS_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('INVOICE / REKENING KORAN', rightBoxX + rightBoxW / 2, y + 11);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rightBoxX + 12, y + 31);
      ctx.lineTo(rightBoxX + rightBoxW - 12, y + 31);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.font = `600 11.5px ${MONO_FONT}`;
      ctx.fillStyle = '#475569';
      ctx.fillText('No. Dok :', rightBoxX + 14, y + 39);
      ctx.fillText('Tanggal :', rightBoxX + 14, y + 57);
      ctx.fillText('Buku    :', rightBoxX + 14, y + 75);

      ctx.fillStyle = '#0f172a';
      ctx.font = `700 11.5px ${MONO_FONT}`;
      ctx.fillText(noDokumen, rightBoxX + 86, y + 39);
      ctx.fillText(`${tglCetak} · ${jamCetak}`, rightBoxX + 86, y + 57);
      ctx.fillStyle = '#92400e';
      const truncBook = bookLabel.length > 26 ? `${bookLabel.slice(0, 25)}…` : bookLabel;
      ctx.fillText(truncBook, rightBoxX + 86, y + 75);

      // Thick Divider
      y += 110;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y);
      ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y);
      ctx.stroke();

      y += 16;

      // 2. SUB-HEADER KEPADA YTH (Left) & YANG HARUS DIBAYAR (Right)
      const leftW = 650;
      const rightW = CONTENT_WIDTH - leftW - 18;
      const rightX = MARGIN_X + leftW + 18;
      const subH = 122;

      drawRoundedRect(ctx, MARGIN_X, y, leftW, subH, 8, '#ffffff', '#94a3b8', 1.2);
      ctx.fillStyle = '#64748b';
      ctx.font = `800 11px ${SANS_FONT}`;
      ctx.fillText('KEPADA YTH :', MARGIN_X + 16, y + 12);

      const roleLabelImg = getRoleMitraLabel(statement.role, {
        isAnakPerusahaan: statement.isAnakPerusahaan,
        isKaryawan: statement.isKaryawan,
      });
      const statusText =
        sisaBayarBersih > 0
          ? `PIUTANG MITRA (${roleLabelImg})`
          : sisaTitipBersih > 0
          ? `HUTANG PT KE MITRA (${roleLabelImg})`
          : `SALDO IMPAS / LUNAS (${roleLabelImg})`;

      const infoPairs: [string, string, boolean?][] = [
        ['NAMA', `: ${statement.namaMitra.toUpperCase()} (${statement.kodeMitra})`, true],
        ['ALAMAT', `: ${statement.alamat || '-'}`, false],
        ['PHONE', `: ${statement.telepon || '-'}`, false],
        ['STATUS', `: ${statusText}`, true],
      ];

      infoPairs.forEach(([lbl, val, isBold], idx) => {
        const lineY = y + 32 + idx * 21;
        ctx.fillStyle = '#475569';
        ctx.font = `700 12px ${SANS_FONT}`;
        ctx.fillText(lbl, MARGIN_X + 16, lineY);
        ctx.fillStyle = idx === 3 ? '#92400e' : '#0f172a';
        ctx.font = isBold ? `800 12.5px ${SANS_FONT}` : `500 12.5px ${SANS_FONT}`;
        const maxValLines = wrapTextLines(ctx, val, leftW - 108, ctx.font);
        ctx.fillText(maxValLines[0], MARGIN_X + 86, lineY);
      });

      // Right Box: YANG HARUS DI BAYAR
      drawRoundedRect(ctx, rightX, y, rightW, subH, 8, '#fefce8', '#0f172a', 2);
      if (sisaBayarBersih > 0) {
        ctx.fillStyle = '#0f172a';
        ctx.font = `900 11.5px ${SANS_FONT}`;
        ctx.fillText('YANG HARUS DI BAYAR (PIUTANG) :', rightX + 16, y + 14);
        ctx.fillStyle = '#9f1239';
        ctx.font = `900 24px ${MONO_FONT}`;
        ctx.fillText(`PIUTANG ${formatRupiah(sisaBayarBersih)}`, rightX + 16, y + 42);
      } else if (sisaTitipBersih > 0) {
        ctx.fillStyle = '#065f46';
        ctx.font = `900 11.5px ${SANS_FONT}`;
        ctx.fillText('YANG HARUS DI BAYAR (HUTANG PT) :', rightX + 16, y + 14);
        ctx.font = `900 24px ${MONO_FONT}`;
        ctx.fillText(`HUTANG ${formatRupiah(sisaTitipBersih)}`, rightX + 16, y + 42);
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.font = `900 11.5px ${SANS_FONT}`;
        ctx.fillText('JUMLAH YANG HARUS DI BAYAR :', rightX + 16, y + 14);
        ctx.fillStyle = '#065f46';
        ctx.font = `900 24px ${MONO_FONT}`;
        ctx.fillText('Rp 0 (IMPAS / LUNAS)', rightX + 16, y + 42);
      }

      ctx.strokeStyle = '#fcd34d';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rightX + 16, y + 86);
      ctx.lineTo(rightX + rightW - 16, y + 86);
      ctx.stroke();

      ctx.fillStyle = '#374151';
      ctx.font = `700 11.5px ${MONO_FONT}`;
      ctx.fillText(
        `Piutang: ${formatRupiah(displayPiutangTotal)}  |  Titip: ${formatRupiah(displayTitipTotal)}`,
        rightX + 16,
        y + 96
      );

      y += subH + 22;
    } else {
      // Continuation page compact header
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 16px ${SANS_FONT}`;
      ctx.fillText(
        `${activeProfil.namaPerusahaan.toUpperCase()} — LANJUTAN REKENING KORAN (Hal ${pIdx + 1}/${totalPages})`,
        MARGIN_X,
        y
      );
      ctx.fillStyle = '#475569';
      ctx.font = `600 12.5px ${SANS_FONT}`;
      ctx.fillText(
        `Mitra: ${statement.namaMitra} (${statement.kodeMitra}) · ${bookLabel} · No. Dok: ${noDokumen}`,
        MARGIN_X,
        y + 24
      );
      y += 56;
    }

    // 3. TABEL REKENING KORAN
    // Table Header
    ctx.fillStyle = '#0f172a';
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
    chunkRows.forEach((row, rIdx) => {
      const isTitipOnlyRow =
        printScope === 'SALDO_BERJALAN' && row.piutangText === '-' && row.titipText !== '-';
      const bgColor = isTitipOnlyRow ? '#f0fdf4' : rIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      ctx.fillStyle = bgColor;
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, row.rowHeight);

      // Horizontal border
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y + row.rowHeight);
      ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y + row.rowHeight);
      ctx.stroke();

      // Vertical borders & cell contents
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
          ctx.font = `700 12.5px ${MONO_FONT}`;
          ctx.textAlign = 'center';
          ctx.fillText(row.noText, cx + col.width / 2, cellTop);
        } else if (col.key === 'tanggal') {
          ctx.fillStyle = '#0f172a';
          ctx.font = `700 12.5px ${MONO_FONT}`;
          ctx.textAlign = 'left';
          ctx.fillText(row.tanggal, cx + 10, cellTop);
          if (row.txId) {
            ctx.fillStyle = '#64748b';
            ctx.font = `500 10.5px ${MONO_FONT}`;
            const shortId = row.txId.length > 16 ? `${row.txId.slice(0, 15)}…` : row.txId;
            ctx.fillText(shortId, cx + 10, cellTop + 17);
          }
        } else if (col.key === 'item') {
          ctx.fillStyle = '#0f172a';
          ctx.font = ITEM_FONT;
          ctx.textAlign = 'left';
          row.itemLines.forEach((line, lIdx) => {
            ctx.fillText(line, cx + 10, cellTop + lIdx * LINE_H);
          });
        } else if (col.key === 'qty') {
          ctx.fillStyle = '#0f172a';
          ctx.font = QTY_FONT;
          ctx.textAlign = 'center';
          row.qtyLines.forEach((line, lIdx) => {
            ctx.fillText(line, cx + col.width / 2, cellTop + lIdx * LINE_H);
          });
        } else if (col.key === 'harga') {
          ctx.fillStyle = '#334155';
          ctx.font = HARGA_FONT;
          ctx.textAlign = 'right';
          row.hargaLines.forEach((line, lIdx) => {
            ctx.fillText(line, cx + col.width - 10, cellTop + lIdx * LINE_H);
          });
        } else if (col.key === 'piutang') {
          ctx.fillStyle = row.piutangText === '-' ? '#94a3b8' : '#9f1239';
          ctx.font = `700 12.5px ${MONO_FONT}`;
          ctx.textAlign = 'right';
          ctx.fillText(row.piutangText, cx + col.width - 10, cellTop);
          if (row.piutangSubText) {
            ctx.fillStyle = '#64748b';
            ctx.font = `500 10.5px ${MONO_FONT}`;
            ctx.fillText(row.piutangSubText, cx + col.width - 10, cellTop + 17);
          }
        } else if (col.key === 'titip') {
          ctx.fillStyle = row.titipText === '-' ? '#94a3b8' : '#065f46';
          ctx.font = `700 12.5px ${MONO_FONT}`;
          ctx.textAlign = 'right';
          ctx.fillText(row.titipText, cx + col.width - 10, cellTop);
          if (row.titipSubText) {
            ctx.fillStyle = '#64748b';
            ctx.font = `500 10.5px ${MONO_FONT}`;
            ctx.fillText(row.titipSubText, cx + col.width - 10, cellTop + 17);
          }
        } else if (col.key === 'ket') {
          ctx.fillStyle = '#18181b';
          ctx.font = KET_FONT;
          ctx.textAlign = 'left';
          row.ketLines.forEach((line, lIdx) => {
            ctx.fillText(line, cx + 10, cellTop + lIdx * LINE_H);
          });
        }

        cx += col.width;
      });

      // Outer table side borders for this row
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

    // Table Footer Summary (only on last page)
    if (isLastPage) {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(MARGIN_X, y, CONTENT_WIDTH, TABLE_FOOT_H);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(MARGIN_X, y, CONTENT_WIDTH, TABLE_FOOT_H);

      const firstFiveWidth = cols.slice(0, 5).reduce((s, c) => s + c.width, 0);
      const piutangXEnd = MARGIN_X + firstFiveWidth + cols[5].width;
      const titipXEnd = piutangXEnd + cols[6].width;

      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12.5px ${SANS_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('TOTAL SALDO BERJALAN :', MARGIN_X + firstFiveWidth - 14, y + TABLE_FOOT_H / 2);

      ctx.fillStyle = '#9f1239';
      ctx.font = `800 13px ${MONO_FONT}`;
      ctx.fillText(
        formatRupiah(displayPiutangTotal),
        piutangXEnd - 10,
        y + TABLE_FOOT_H / 2
      );

      ctx.fillStyle = '#065f46';
      ctx.fillText(formatRupiah(displayTitipTotal), titipXEnd - 10, y + TABLE_FOOT_H / 2);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 11.5px ${MONO_FONT}`;
      const netSummaryLabel =
        sisaBayarBersih > 0
          ? `Piutang: ${formatRupiah(sisaBayarBersih)}`
          : sisaTitipBersih > 0
          ? `Hutang: ${formatRupiah(sisaTitipBersih)}`
          : 'IMPAS (Rp 0)';
      ctx.fillText(netSummaryLabel, titipXEnd + 10, y + TABLE_FOOT_H / 2);

      y += TABLE_FOOT_H + 22;

      // 4. FOOTER TF REKENING VIA & TANDA TANGAN
      ctx.textBaseline = 'top';
      drawRoundedRect(ctx, MARGIN_X, y, 420, 118, 8, '#f8fafc', '#94a3b8', 1.2);
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12px ${SANS_FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('TF REKENING VIA :', MARGIN_X + 16, y + 12);

      ctx.font = `700 12.5px ${MONO_FONT}`;
      ctx.fillText('BNI     : 035 285 1268', MARGIN_X + 16, y + 34);
      ctx.fillText('BRI     : 8052 0103 2353 539', MARGIN_X + 16, y + 54);
      ctx.fillText('MANDIRI : 112000 1596 3635', MARGIN_X + 16, y + 74);

      ctx.font = `800 11.5px ${SANS_FONT}`;
      ctx.fillStyle = '#1e293b';
      ctx.fillText('AN FAHLEVI MARTA WIJAYA', MARGIN_X + 16, y + 96);

      // Right Signature Block
      const signRightX = MARGIN_X + CONTENT_WIDTH;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = `900 14px ${SANS_FONT}`;
      ctx.fillText('TERIMA KASIH', signRightX, y + 8);

      ctx.fillStyle = '#475569';
      ctx.font = `700 12px ${SANS_FONT}`;
      ctx.fillText(activeProfil.namaPerusahaan.toUpperCase(), signRightX, y + 28);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(signRightX - 240, y + 86);
      ctx.lineTo(signRightX, y + 86);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.font = `800 12px ${SANS_FONT}`;
      ctx.fillText(`( ${activeProfil.penanggungJawab.toUpperCase()} )`, signRightX, y + 95);

      if (activeRekeningUtama && activeRekeningUtama.nomorRekening) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748b';
        ctx.font = `500 10.5px ${SANS_FONT}`;
        ctx.fillText(
          `Rekening Utama: ${activeRekeningUtama.nama} (${activeRekeningUtama.nomorRekening})`,
          MARGIN_X,
          y + 126
        );
      }

      y += 144;

      // Optional physical nota proofs section
      if (loadedProofs.length > 0) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#92400e';
        ctx.font = `800 14px ${SANS_FONT}`;
        ctx.fillText(`LAMPIRAN BUKTI FISIK NOTA (${loadedProofs.length} Dokumen)`, MARGIN_X, y + 10);

        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(MARGIN_X, y + 34);
        ctx.lineTo(MARGIN_X + CONTENT_WIDTH, y + 34);
        ctx.stroke();

        y += 48;

        for (let idx = 0; idx < loadedProofs.length; idx++) {
          const att = loadedProofs[idx];
          const colIdx = idx % 2;
          const rowIdx = Math.floor(idx / 2);
          const cardX = MARGIN_X + colIdx * (proofCardW + 24);
          const cardY = y + rowIdx * (proofCardH + 18);

          drawRoundedRect(ctx, cardX, cardY, proofCardW, proofCardH, 8, '#f8fafc', '#cbd5e1', 1.2);
          ctx.fillStyle = '#0f172a';
          ctx.font = `800 12px ${MONO_FONT}`;
          ctx.textAlign = 'left';
          ctx.fillText(att.title, cardX + 14, cardY + 14);

          ctx.textAlign = 'right';
          ctx.fillStyle = '#92400e';
          ctx.fillText(att.nominal, cardX + proofCardW - 14, cardY + 14);

          ctx.textAlign = 'left';
          ctx.fillStyle = '#475569';
          ctx.font = `600 11px ${SANS_FONT}`;
          ctx.fillText(att.subtitle, cardX + 14, cardY + 34);

          const imgBoxX = cardX + 14;
          const imgBoxY = cardY + 56;
          const imgBoxW = proofCardW - 28;
          const imgBoxH = proofCardH - 70;
          drawRoundedRect(ctx, imgBoxX, imgBoxY, imgBoxW, imgBoxH, 6, '#ffffff', '#e2e8f0', 1);

          const ratio = att.img.width / (att.img.height || 1);
          let drawW = imgBoxW - 16;
          let drawH = drawW / ratio;
          if (drawH > imgBoxH - 16) {
            drawH = imgBoxH - 16;
            drawW = drawH * ratio;
          }
          const drawX = imgBoxX + (imgBoxW - drawW) / 2;
          const drawY = imgBoxY + (imgBoxH - drawH) / 2;
          ctx.drawImage(att.img, drawX, drawY, drawW, drawH);
        }
      }
    } else {
      ctx.textBaseline = 'top';
      ctx.textAlign = 'right';
      ctx.fillStyle = '#64748b';
      ctx.font = `600 12px ${SANS_FONT}`;
      ctx.fillText(
        `Bersambung ke Halaman ${pIdx + 2} dari ${totalPages}...`,
        MARGIN_X + CONTENT_WIDTH,
        y + 18
      );
    }

    const pageSuffix = totalPages > 1 ? `_Hal${pIdx + 1}` : '';
    const filename = `${filePrefix}_${statement.kodeMitra}_${safeMitraName}${pageSuffix}.${ext}`;
    await canvasToBlobAndDownload(canvas, format, filename);
    downloadedFilenames.push(filename);
  }

  return {
    filenames: downloadedFilenames,
    pageCount: totalPages,
  };
}
