import React, { useState, useMemo } from 'react';
import {
  Printer,
  X,
  Copy,
  Check,
  FileText,
  AlertCircle,
  FileDown,
  Camera,
  Share2,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_PT_LOGO_URL,
  getRoleMitraLabel,
  ProfilPerusahaan,
  RekeningKoranHistoryItem,
  RekeningKoranMitraSummary,
} from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';
import { ShareLinkModal } from '../public/ShareLinkModal.tsx';
import { exportRekeningKoranToPdf } from '../../utils/exportRekeningKoranPdf.ts';

interface Props {
  statement: RekeningKoranMitraSummary | null;
  profilPerusahaan?: ProfilPerusahaan | null;
  rekeningUtamaDetail?: {
    kode: string;
    nama: string;
    nomorRekening?: string;
    atasNama?: string;
  };
  onClose: () => void;
}

export const CetakRekeningKoranModal: React.FC<Props> = ({
  statement,
  profilPerusahaan,
  rekeningUtamaDetail,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [printWarning, setPrintWarning] = useState('');
  const [includeNotaProofs, setIncludeNotaProofs] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [printScope, setPrintScope] = useState<'SALDO_BERJALAN' | 'SEMUA_HISTORY'>('SALDO_BERJALAN');

  const activeProfil = useMemo<ProfilPerusahaan>(() => {
    const src = profilPerusahaan || statement?.profilPerusahaan;
    const rawAlamat = src?.alamat?.trim();
    const rawTelepon = src?.telepon?.trim();
    const rawEmail = src?.email?.trim();
    return {
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
  }, [profilPerusahaan, statement?.profilPerusahaan]);

  const activeRekeningUtama = rekeningUtamaDetail || statement?.rekeningUtamaDetail;

  const runningRows = useMemo<RekeningKoranHistoryItem[]>(() => {
    if (!statement) return [];
    if (Array.isArray(statement.historySaldoBerjalan)) {
      return statement.historySaldoBerjalan;
    }
    return statement.history.filter((h) => h.isSaldoBerjalan !== false);
  }, [statement]);

  const activeRows = useMemo<RekeningKoranHistoryItem[]>(() => {
    if (!statement) return [];
    return printScope === 'SALDO_BERJALAN' ? runningRows : statement.history;
  }, [statement, printScope, runningRows]);

  // Extract uploaded physical nota proofs for the currently selected scope (deduplicated per parent Nota ID)
  const notaAttachments = useMemo(() => {
    const seenParentIds = new Set<string>();
    return activeRows
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
  }, [activeRows]);

  if (!statement) return null;

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

  const formatItemTextForPdfOrWa = (row: RekeningKoranHistoryItem): {
    itemText: string;
    qtyText: string;
    hargaText: string;
    ketText: string;
  } => {
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
  };

  const handlePrint = () => {
    setPrintWarning('');
    try {
      window.print();
    } catch (err: unknown) {
      console.warn('Window print error:', err);
      setPrintWarning(
        'Dialog cetak browser dibatasi oleh iframe. Silakan gunakan tombol "Download PDF (.pdf)" untuk mengunduh dokumen secara langsung.'
      );
    }
  };

  /**
   * Helper to embed company logo as Data URL in jsPDF if reachable
   */
  const loadLogoDataUrl = async (url: string): Promise<string | null> => {
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
  };

  /**
   * Generates and downloads an authentic .pdf document matching PT Wijaya Agro Perkasa Invoice / Rekening Koran
   */
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPrintWarning('');
    try {
      await exportRekeningKoranToPdf(statement, activeProfil, activeRekeningUtama, {
        printScope,
        includeNotaProofs,
      });
    } catch (err: any) {
      console.error('PDF generation error:', err);
      setPrintWarning(`Gagal membuat file PDF: ${err.message || err}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const generateTextSummary = () => {
    const divider = '==================================================';
    const lines = [
      `*INVOICE / REKENING KORAN MITRA*`,
      `*${activeProfil.namaPerusahaan.toUpperCase()}*`,
      `${activeProfil.alamat}`,
      `TELPON KASIR 0821 44 999 305 | ADM 0812 2000 3305`,
      `EMAIL : ${activeProfil.email}`,
      `Tanggal Cetak: ${tglCetak} (${jamCetak} WIB)`,
      `Jenis Buku: ${printScope === 'SALDO_BERJALAN' ? 'SALDO SEDANG BERJALAN' : 'SEMUA + HISTORY SELESAI'}`,
      divider,
      `*KEPADA YTH:*`,
      `NAMA   : ${statement.namaMitra} (${statement.kodeMitra})`,
      `ALAMAT : ${statement.alamat || '-'}`,
      `PHONE  : ${statement.telepon || '-'}`,
      divider,
      sisaBayarBersih > 0
        ? `*YANG HARUS DI BAYAR : PIUTANG ${formatRupiah(sisaBayarBersih)}*`
        : sisaTitipBersih > 0
        ? `*YANG HARUS DI BAYAR : HUTANG ${formatRupiah(sisaTitipBersih)}*`
        : `*STATUS SALDO : Rp 0 (IMPAS / LUNAS)*`,
      `• Total Piutang Berjalan : ${formatRupiah(statement.totalBonKeseluruhan)}`,
      `• Total Titip / Hak Mitra: ${formatRupiah(statement.totalTitip)}`,
      divider,
      `*RINCIAN TRANSAKSI (${activeRows.length} Baris):*`,
    ];

    if (activeRows.length === 0) {
      lines.push('Tidak ada saldo piutang atau titipan yang sedang berjalan.');
    } else {
      activeRows.forEach((h, idx) => {
        const formatted = formatItemTextForPdfOrWa(h);
        const piutangVal = getRowPiutangVal(h);
        const titipVal = getRowTitipVal(h);
        const nilaiInfo = [
          piutangVal > 0 ? `Piutang: ${formatRupiah(piutangVal)}` : '',
          titipVal > 0 ? `Titip: ${formatRupiah(titipVal)}` : '',
        ]
          .filter(Boolean)
          .join(' | ');

        lines.push(
          `${idx + 1}. [${h.tanggal}] ${formatted.itemText.replace(/\n/g, '\n   ')}\n   Qty: ${formatted.qtyText} | Harga: ${formatted.hargaText}${nilaiInfo ? ` | ${nilaiInfo}` : ''}${formatted.ketText !== '-' ? `\n   Keterangan: ${formatted.ketText}` : ''}`
        );
      });
    }

    lines.push(divider);
    lines.push(`*TF REKENING VIA :*`);
    lines.push(`BNI : 035 285 1268`);
    lines.push(`BRI : 8052 0103 2353 539`);
    lines.push(`MANDIRI : 112000 1596 3635`);
    lines.push(`*AN FAHLEVI MARTA WIJAYA*`);
    if (activeRekeningUtama && activeRekeningUtama.nomorRekening) {
      lines.push(
        `Rekening Tambahan: ${activeRekeningUtama.nama} (${activeRekeningUtama.nomorRekening})`
      );
    }
    lines.push(`TERIMA KASIH — ${activeProfil.namaPerusahaan.toUpperCase()}`);

    return lines.join('\n');
  };

  const handleCopyWhatsApp = () => {
    const text = generateTextSummary();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <>
      {/* Print Specific CSS to prevent cut-off and fit cleanly to A4 */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          html, body {
            overflow: visible !important;
            height: auto !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #printable-modal-overlay,
          #printable-modal-container,
          #printable-rekening-koran,
          #printable-rekening-koran * {
            visibility: visible !important;
          }
          #printable-modal-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          #printable-modal-container {
            position: static !important;
            display: block !important;
            max-height: none !important;
            max-width: none !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #printable-rekening-koran {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 3mm 5mm !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
          }
          #printable-rekening-koran table {
            width: 100% !important;
          }
          #printable-rekening-koran tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .print-page-break {
            page-break-before: always !important;
            break-before: page !important;
            display: block !important;
          }
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          img {
            max-width: 100% !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 9mm;
          }
        }
      `}</style>

      <div
        id="printable-modal-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto print:static print:inset-auto print:block print:overflow-visible print:p-0 print:bg-white"
      >
        <div
          id="printable-modal-container"
          className="bg-white text-zinc-900 w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh] print:max-h-none print:w-full print:max-w-none print:overflow-visible print:border-none print:shadow-none print:rounded-none"
        >
          {/* Modal Top Header (Interactive Actions - Hidden on Print) */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between px-5 py-3.5 bg-zinc-900 text-white gap-3 shrink-0 print:hidden">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  Pratinjau &amp; Cetak Rekening Koran Resmi
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {statement.kodeMitra}
                  </span>
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Format Nota Modern {activeProfil.namaPerusahaan} (Kolom Piutang, Titip &amp; Keterangan)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Scope Selector: Default Hanya Saldo Berjalan */}
              <div className="inline-flex rounded-lg bg-zinc-800 p-0.5 border border-zinc-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPrintScope('SALDO_BERJALAN')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                    printScope === 'SALDO_BERJALAN'
                      ? 'bg-amber-500 text-zinc-950'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Hanya tampilkan transaksi yang sedang berjalan (belum lunas / belum cair)"
                >
                  Saldo Berjalan ({runningRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPrintScope('SEMUA_HISTORY')}
                  className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                    printScope === 'SEMUA_HISTORY'
                      ? 'bg-zinc-600 text-white'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Tampilkan seluruh riwayat termasuk yang sudah lunas/cair"
                >
                  + History ({statement.history.length})
                </button>
              </div>

              {notaAttachments.length > 0 && (
                <label className="flex items-center space-x-1.5 bg-amber-500/20 border border-amber-500/40 px-2.5 py-1 rounded-lg text-[11px] text-amber-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeNotaProofs}
                    onChange={(e) => setIncludeNotaProofs(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-0"
                  />
                  <span>Lampiran Foto ({notaAttachments.length})</span>
                </label>
              )}

              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-800/90 hover:bg-indigo-700 text-indigo-100 border border-indigo-500/40 transition-colors cursor-pointer"
                title="Bagikan tautan khusus ini agar mitra dapat melihat secara online (Read-Only)"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Bagikan Link</span>
              </button>

              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-emerald-100 transition-colors cursor-pointer"
                title="Salin rekap rekening koran dalam format pesan WhatsApp"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin WA'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-700 hover:bg-rose-600 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                title="Download dokumen langsung dalam format PDF (.pdf)"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download PDF (.pdf)'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-xs transition-colors cursor-pointer"
                title="Cetak langsung ke printer (A4)"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Printer</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors ml-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {printWarning && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center space-x-2 shrink-0 print:hidden">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{printWarning}</span>
            </div>
          )}

          {/* Scrollable Printable Document Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-zinc-100 print:bg-white print:p-0 print:overflow-visible">
            <div
              id="printable-rekening-koran"
              className="bg-white rounded-xl shadow-md border-2 border-zinc-800 p-6 sm:p-8 space-y-5 max-w-4xl mx-auto text-zinc-900 print:border-none print:shadow-none print:p-0 print:max-w-none"
            >
              {/* 1. KOP NOTA MODERN KHAS PT WIJAYA AGRO PERKASA */}
              <div className="border-b-2 border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <img
                    src={activeProfil.logoUrl || DEFAULT_PT_LOGO_URL}
                    alt="Logo PT Wijaya Agro Perkasa"
                    className="w-16 h-16 rounded-lg object-cover border border-zinc-300 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <h3 className="text-xl font-black text-zinc-900 tracking-tight uppercase">
                      {activeProfil.namaPerusahaan}
                    </h3>
                    <p className="text-[11px] font-semibold text-zinc-700">
                      {activeProfil.alamat}
                    </p>
                    <p className="text-[10px] font-mono font-bold text-zinc-800">
                      TELPON KASIR 0821 44 999 305 · TELPON ADM 0812 2000 3305
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      EMAIL : {activeProfil.email}
                    </p>
                  </div>
                </div>

                <div className="sm:text-right border border-zinc-800 rounded-lg p-2.5 bg-zinc-50 min-w-[235px]">
                  <div className="text-xs font-black uppercase tracking-wider text-zinc-900 border-b border-zinc-300 pb-1 mb-1">
                    INVOICE / REKENING KORAN
                  </div>
                  <div className="text-[10px] space-y-0.5 font-mono tabular-nums">
                    <div className="flex justify-between gap-3">
                      <span className="text-zinc-500 font-sans">No. Dokumen:</span>
                      <strong className="text-zinc-900">{noDokumen}</strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-zinc-500 font-sans">Tanggal Cetak:</span>
                      <strong className="text-zinc-900">
                        {tglCetak} · {jamCetak}
                      </strong>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-zinc-500 font-sans">Tampilan Buku:</span>
                      <strong className="text-amber-900">
                        {printScope === 'SALDO_BERJALAN' ? 'SALDO BERJALAN' : 'SEMUA + HISTORY'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. SUB-HEADER KEPADA YTH & JUMLAH YANG HARUS DI BAYAR */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
                <div className="sm:col-span-7 border border-zinc-400 rounded-lg p-3.5 text-xs space-y-1 bg-white">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                    KEPADA YTH :
                  </div>
                  <div className="grid grid-cols-[75px_1fr] gap-y-0.5 text-[11px]">
                    <span className="font-semibold text-zinc-600">NAMA</span>
                    <span className="font-black text-zinc-900 uppercase">
                      : {statement.namaMitra} ({statement.kodeMitra})
                    </span>
                    <span className="font-semibold text-zinc-600">ALAMAT</span>
                    <span className="font-medium text-zinc-800">: {statement.alamat || '-'}</span>
                    <span className="font-semibold text-zinc-600">PHONE</span>
                    <span className="font-mono font-semibold text-zinc-800">
                      : {statement.telepon || '-'}
                    </span>
                    <span className="font-semibold text-zinc-600">STATUS</span>
                    <span className="font-bold text-amber-900">
                      :{' '}
                      {getRoleMitraLabel(statement.role, {
                        isAnakPerusahaan: statement.isAnakPerusahaan,
                        isKaryawan: statement.isKaryawan,
                      })}{' '}
                      —{' '}
                      {sisaBayarBersih > 0
                        ? 'PIUTANG MITRA BERJALAN'
                        : sisaTitipBersih > 0
                        ? 'HUTANG PT KE MITRA (TITIPAN)'
                        : 'SALDO IMPAS / LUNAS'}
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-5 border-2 border-zinc-900 rounded-lg p-3.5 bg-amber-50/70 flex flex-col justify-between">
                  {sisaBayarBersih > 0 ? (
                    <>
                      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-800">
                        YANG HARUS DI BAYAR (PIUTANG) :
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-rose-900 my-1">
                        PIUTANG {formatRupiah(sisaBayarBersih)}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-zinc-700 border-t border-amber-300 pt-1 flex justify-between gap-2">
                        <span>Piutang: {formatRupiah(statement.totalBonKeseluruhan)}</span>
                        <span>Titip: {formatRupiah(statement.totalTitip)}</span>
                      </div>
                    </>
                  ) : sisaTitipBersih > 0 ? (
                    <>
                      <div className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                        YANG HARUS DI BAYAR (HUTANG PT) :
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-emerald-900 my-1">
                        HUTANG {formatRupiah(sisaTitipBersih)}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-zinc-700 border-t border-amber-300 pt-1 flex justify-between gap-2">
                        <span>Titip: {formatRupiah(statement.totalTitip)}</span>
                        <span>Piutang: {formatRupiah(statement.totalBonKeseluruhan)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-[10px] font-black uppercase tracking-wider text-zinc-800">
                        JUMLAH YANG HARUS DI BAYAR :
                      </div>
                      <div className="text-xl font-black font-mono tabular-nums text-emerald-800 my-1">
                        Rp 0 (IMPAS)
                      </div>
                      <div className="text-[10px] text-zinc-600">
                        Tidak ada selisih piutang maupun hutang berjalan
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 3. TABEL REKENING KORAN RESMI (NO. | TANGGAL | ITEM | QTY | HARGA | PIUTANG | TITIP | KETERANGAN) */}
              <div className="border-2 border-zinc-900 rounded-lg overflow-x-auto print:overflow-visible">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-zinc-900 text-white font-bold uppercase text-[9px]">
                    <tr>
                      <th className="py-2.5 px-2 w-9 text-center">NO.</th>
                      <th className="py-2.5 px-2 w-20">TANGGAL</th>
                      <th className="py-2.5 px-2.5">ITEM</th>
                      <th className="py-2.5 px-2 text-center w-16">QTY</th>
                      <th className="py-2.5 px-2 text-right w-24">HARGA</th>
                      <th className="py-2.5 px-2 text-right w-26">
                        {printScope === 'SALDO_BERJALAN' ? 'PIUTANG' : 'BON (+)'}
                      </th>
                      <th className="py-2.5 px-2 text-right w-26">
                        {printScope === 'SALDO_BERJALAN' ? 'TITIP' : 'BAYAR / TITIP'}
                      </th>
                      <th className="py-2.5 px-2.5 w-44">KETERANGAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-300 text-zinc-900 text-[10px]">
                    {activeRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-zinc-400">
                          {printScope === 'SALDO_BERJALAN'
                            ? 'Tidak ada saldo piutang atau titipan yang sedang berjalan (Transaksi lunas/cair tersimpan di History)'
                            : 'Belum ada histori transaksi untuk mitra ini'}
                        </td>
                      </tr>
                    ) : (
                      activeRows.map((row, rIdx) => {
                        const items = row.itemsDetail || [];
                        const isMulti = items.length > 1;
                        const single = items.length === 1 ? items[0] : null;
                        const piutangVal = getRowPiutangVal(row);
                        const titipVal = getRowTitipVal(row);
                        const ketNote = (row.catatanTransaksi || row.catatanNgunci || '').trim();
                        const displayTxId = row.idTransaksiInduk || row.id;

                        return (
                          <tr key={row.id} className="align-top hover:bg-zinc-50/60">
                            <td className="py-2 px-2 text-center font-mono tabular-nums font-bold">
                              {rIdx + 1}
                            </td>
                            <td className="py-2 px-2 font-mono tabular-nums whitespace-nowrap">
                              <div className="font-bold text-zinc-900">{row.tanggal}</div>
                              <div className="text-[8px] text-zinc-500">{displayTxId}</div>
                            </td>
                            <td className="py-2 px-2.5">
                              {isMulti ? (
                                <div className="space-y-0.5">
                                  <div className="font-bold text-[9px] uppercase text-indigo-950">
                                    {row.jenis.replace(/_/g, ' ')}
                                  </div>
                                  {items.map((it, idx) => (
                                    <div
                                      key={idx}
                                      className="flex justify-between gap-2 text-[10px] border-b border-dotted border-zinc-200 last:border-none py-0.5"
                                    >
                                      <span className="font-semibold">
                                        {idx + 1}. {it.nama}
                                      </span>
                                      <span className="font-mono tabular-nums text-zinc-700 whitespace-nowrap">
                                        {it.qty} {it.satuan} × {formatRupiah(it.harga)} ={' '}
                                        <strong>{formatRupiah(it.subtotal)}</strong>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : single ? (
                                <div className="font-bold text-zinc-900">{single.nama}</div>
                              ) : (
                                <div className="font-semibold text-zinc-900">
                                  {row.keterangan || row.jenis.replace(/_/g, ' ')}
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center font-mono tabular-nums font-bold whitespace-nowrap">
                              {isMulti
                                ? `${items.length} Item`
                                : single
                                ? `${single.qty} ${single.satuan}`
                                : row.qtyDisplay || '-'}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                              {isMulti
                                ? 'Rincian'
                                : single
                                ? formatRupiah(single.harga)
                                : row.hargaSatuanDisplay || '-'}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-rose-800 whitespace-nowrap">
                              {piutangVal > 0 ? formatRupiah(piutangVal) : '-'}
                              {printScope === 'SALDO_BERJALAN' &&
                                row.debet > 0 &&
                                piutangVal > 0 &&
                                piutangVal < row.debet && (
                                  <div className="text-[8px] font-normal text-zinc-500">
                                    Awal: {formatRupiah(row.debet)}
                                  </div>
                                )}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-emerald-800 whitespace-nowrap">
                              {titipVal > 0 ? formatRupiah(titipVal) : '-'}
                            </td>
                            <td className="py-2 px-2.5 text-zinc-900 font-semibold break-words">
                              {ketNote || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-zinc-100 font-bold border-t-2 border-zinc-900 text-[10px]">
                    <tr>
                      <td colSpan={5} className="py-2.5 px-3 text-right uppercase">
                        TOTAL SALDO BERJALAN :
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-rose-900">
                        {formatRupiah(statement.totalBonKeseluruhan)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-900">
                        {formatRupiah(statement.totalTitip)}
                      </td>
                      <td className="py-2.5 px-2.5 font-mono tabular-nums text-zinc-900">
                        {sisaBayarBersih > 0
                          ? `Piutang: ${formatRupiah(sisaBayarBersih)}`
                          : sisaTitipBersih > 0
                          ? `Hutang: ${formatRupiah(sisaTitipBersih)}`
                          : 'IMPAS (Rp 0)'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* 4. FOOTER KHAS NOTA LAMA: TF REKENING VIA, STEMPEL PT, & TERIMA KASIH / KASIR */}
              <div className="pt-3 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center text-xs print-avoid-break">
                <div className="sm:col-span-5 border border-zinc-400 rounded-lg p-3 bg-zinc-50 space-y-0.5">
                  <div className="text-[10px] font-black uppercase text-zinc-800">
                    TF REKENING VIA :
                  </div>
                  <div className="font-mono tabular-nums font-bold text-[11px] text-zinc-900 space-y-0.5">
                    <div>BNI : 035 285 1268</div>
                    <div>BRI : 8052 0103 2353 539</div>
                    <div>MANDIRI : 112000 1596 3635</div>
                  </div>
                  <div className="text-[10px] font-extrabold text-zinc-800 pt-0.5">
                    AN FAHLEVI MARTA WIJAYA
                  </div>
                  {activeRekeningUtama && activeRekeningUtama.nomorRekening && (
                    <div className="text-[9px] text-zinc-600 pt-0.5">
                      {activeRekeningUtama.nama}: {activeRekeningUtama.nomorRekening}
                    </div>
                  )}
                </div>

                <div className="sm:col-span-3 hidden sm:block" />

                <div className="sm:col-span-4 text-center sm:text-right space-y-6">
                  <div>
                    <div className="text-xs font-black uppercase text-zinc-900">TERIMA KASIH</div>
                    <div className="text-[10px] font-bold text-zinc-600 uppercase">
                      {activeProfil.namaPerusahaan}
                    </div>
                  </div>
                  <div className="pt-2">
                    <div className="w-40 border-b border-zinc-800 sm:ml-auto mx-auto" />
                    <div className="text-[10px] font-bold text-zinc-900 mt-1 uppercase">
                      ( {activeProfil.penanggungJawab} )
                    </div>
                  </div>
                </div>
              </div>

              {activeProfil.catatanHeaderNota && (
                <div className="text-center text-[10px] text-zinc-500 border-t border-zinc-200 pt-2">
                  <span className="italic">&ldquo;{activeProfil.catatanHeaderNota}&rdquo;</span>
                </div>
              )}

              {/* 5. LAMPIRAN BUKTI FISIK NOTA LALU & FAKTUR (DICETAK DI HALAMAN BERIKUTNYA) */}
              {includeNotaProofs && notaAttachments.length > 0 && (
                <div className="pt-8 border-t-2 border-dashed border-zinc-300 space-y-4 print-page-break print:break-before-page">
                  <div className="flex items-center justify-between border-b-2 border-amber-600 pb-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 flex items-center gap-2">
                        <Camera className="w-4 h-4 text-amber-600" />
                        <span>LAMPIRAN BUKTI FISIK NOTA &amp; DOKUMEN PENDUKUNG</span>
                        <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md font-bold">
                          {notaAttachments.length} Lembar Dokumen
                        </span>
                      </h3>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Bukti otentik lembaran nota fisik yang terlampir pada rekening koran mitra.
                      </p>
                    </div>
                    <span className="text-[9px] text-zinc-400 font-mono">
                      Lampiran Resmi ERP {activeProfil.namaPerusahaan}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {notaAttachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="border border-zinc-300 rounded-xl p-3 bg-zinc-50/60 space-y-2 shadow-2xs print-avoid-break break-inside-avoid print:break-inside-avoid print:bg-white print:border-zinc-400"
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono font-bold text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200 shadow-2xs">
                            {att.noNotaLalu ? `No. Nota: ${att.noNotaLalu}` : `ID: ${att.txId}`}
                            {att.totalCount > 1 ? ` (Foto ${att.index}/${att.totalCount})` : ''}
                          </span>
                          <span className="text-zinc-600 font-medium">{att.tanggal}</span>
                        </div>
                        <div className="text-[11px] text-zinc-800 font-semibold flex items-center justify-between">
                          <span>{att.jenis.replace(/_/g, ' ')}</span>
                          <span className="text-amber-900 font-mono tabular-nums font-bold">
                            {formatRupiah(att.nominal)}
                          </span>
                        </div>
                        {att.keterangan && (
                          <div className="text-[10px] text-zinc-700 font-medium bg-white/80 p-1.5 rounded border border-zinc-200">
                            Ket: {att.keterangan}
                          </div>
                        )}
                        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden flex items-center justify-center p-2 min-h-[180px] print:border-zinc-400 print:p-2">
                          <img
                            src={att.image}
                            alt={`Bukti Nota ${att.txId}`}
                            className="max-h-80 w-auto object-contain rounded print:max-h-[380px] print:w-auto"
                            loading="eager"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Bottom Footer (Hidden on print) */}
          <div className="px-6 py-3.5 bg-white border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 print:hidden">
            <span className="text-xs text-zinc-600 font-mono tabular-nums">
              {sisaBayarBersih > 0 ? (
                <>
                  Jumlah Harus Dibayar:{' '}
                  <strong className="text-rose-800 font-black">{formatRupiah(sisaBayarBersih)}</strong>
                </>
              ) : sisaTitipBersih > 0 ? (
                <>
                  Sisa Hak Titipan Mitra:{' '}
                  <strong className="text-emerald-800 font-black">{formatRupiah(sisaTitipBersih)}</strong>
                </>
              ) : (
                <strong className="text-emerald-800 font-black">Saldo Lunas / Impas (Rp 0)</strong>
              )}
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                Tutup Pratinjau
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download Dokumen PDF (.pdf)'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Printer</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Share Link Modal */}
      <ShareLinkModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title={`Bagikan Rekening Koran ${statement.namaMitra}`}
        subtitle="Tautan publik resmi khusus penerima (Hanya Baca / Read-Only)"
        shareType="rekening-koran"
        targetId={statement.idMitra}
        targetName={statement.namaMitra}
        companyName={activeProfil.namaPerusahaan}
      />
    </>
  );
};
