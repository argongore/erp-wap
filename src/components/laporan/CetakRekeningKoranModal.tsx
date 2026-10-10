import React, { useState } from 'react';
import {
  Printer,
  X,
  Copy,
  Download,
  Check,
  FileText,
  AlertCircle,
  Building2,
  Calendar,
  User,
  Phone,
  MapPin,
  FileDown,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RekeningKoranMitraSummary } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';

interface Props {
  statement: RekeningKoranMitraSummary | null;
  onClose: () => void;
}

export const CetakRekeningKoranModal: React.FC<Props> = ({ statement, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [printWarning, setPrintWarning] = useState('');

  if (!statement) return null;

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const noDokumen = `RK/${statement.kodeMitra}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${statement.history.length}`;

  const handlePrint = () => {
    setPrintWarning('');
    try {
      window.print();
    } catch (err: unknown) {
      console.warn('Window print error:', err);
      setPrintWarning(
        'Dialog cetak browser dibatasi oleh iframe. Silakan gunakan tombol "Download Dokumen PDF (.pdf)" untuk mengunduh dokumen secara langsung.'
      );
    }
  };

  /**
   * Generates and downloads an authentic .pdf document using jsPDF & autoTable
   */
  const handleDownloadPdf = () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Margin & dimensions (A4 is 210mm x 297mm)
      const pageWidth = doc.internal.pageSize.getWidth();

      // 1. Kop Surat
      doc.setFillColor(15, 60, 40); // Emerald dark
      doc.rect(14, 12, 6, 22, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(20, 20, 20);
      doc.text('PT WIJAYA AGRO', 24, 18);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text('PERDAGANGAN SARANA PERTANIAN & PEMBELIAN HASIL BUMI', 24, 23);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text('Jl. Raya Agro Industri No. 88, Wlingi, Blitar · Telp: (021) 8892-0192 · Email: admin@wijayaagro.com', 24, 28);

      // Document title block (right side)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40, 50, 120);
      doc.text('REKENING KORAN MITRA', pageWidth - 14, 18, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`No. Dokumen: ${noDokumen}`, pageWidth - 14, 23, { align: 'right' });
      doc.text(`Dicetak: ${tglCetak} ${jamCetak} WIB`, pageWidth - 14, 28, { align: 'right' });

      // Horizontal separator line
      doc.setDrawColor(20, 20, 20);
      doc.setLineWidth(0.6);
      doc.line(14, 34, pageWidth - 14, 34);

      // 2. Biodata Mitra Box
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(220, 225, 230);
      doc.setLineWidth(0.3);
      doc.roundedRect(14, 38, pageWidth - 28, 24, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('IDENTITAS MITRA / PETANI:', 18, 44);
      doc.text('KONTAK & ALAMAT:', pageWidth / 2 + 5, 44);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(`${statement.namaMitra} (${statement.kodeMitra})`, 18, 49);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(60, 60, 60);
      doc.text(`Peran: ${statement.role}  |  Status: ${statement.status}`, 18, 54);
      doc.text(`No. HP / WA : ${statement.telepon || '-'}`, pageWidth / 2 + 5, 49);
      doc.text(`Alamat           : ${statement.alamat || '-'}`, pageWidth / 2 + 5, 54);

      // 3. Ringkasan Saldo Box (4 Kolom)
      const boxY = 66;
      const boxW = (pageWidth - 28 - 9) / 4;
      const boxH = 16;

      const summaryData = [
        { label: 'Kasbon Barang Toko', val: formatRupiah(statement.totalKasbonBarang), bg: [245, 247, 250], border: [210, 215, 220], color: [40, 40, 40] },
        { label: 'Kasbon Pinjaman Uang', val: formatRupiah(statement.totalKasbonUang), bg: [255, 245, 245], border: [255, 200, 200], color: [180, 40, 40] },
        { label: 'TOTAL SISA BON', val: formatRupiah(statement.totalBonKeseluruhan), bg: [254, 249, 235], border: [245, 190, 80], color: [140, 70, 0], isBold: true },
        { label: 'Titip Hasil Bumi', val: formatRupiah(statement.totalTitip), bg: [250, 245, 255], border: [220, 200, 240], color: [90, 40, 130] },
      ];

      summaryData.forEach((item, i) => {
        const x = 14 + i * (boxW + 3);
        doc.setFillColor(item.bg[0], item.bg[1], item.bg[2]);
        doc.setDrawColor(item.border[0], item.border[1], item.border[2]);
        doc.setLineWidth(item.isBold ? 0.5 : 0.2);
        doc.roundedRect(x, boxY, boxW, boxH, 1.5, 1.5, 'FD');

        doc.setFont('helvetica', item.isBold ? 'bold' : 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(item.label, x + 3, boxY + 5);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(item.color[0], item.color[1], item.color[2]);
        doc.text(item.val, x + 3, boxY + 12);
      });

      // 4. Tabel Rincian Mutasi (AutoTable)
      const tableHead = [['Tgl & Jam', 'No. Bukti', 'Jenis & Uraian', 'Qty', 'Harga Satuan', 'Kasbon (+)', 'Bayar (-)', 'Saldo Bon']];
      const tableBody = statement.history.length === 0
        ? [['-', '-', 'Belum ada transaksi', '-', '-', '-', '-', formatRupiah(statement.totalBonKeseluruhan)]]
        : statement.history.map((row) => [
            `${row.tanggal}\n${row.jam}`,
            row.id,
            `${row.jenis.replace(/_/g, ' ')}\n${row.keterangan || '-'}`,
            row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1 Trx' : '-'),
            row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-'),
            row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-',
            row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-',
            formatRupiah(row.saldoAkumulasi),
          ]);

      autoTable(doc, {
        startY: 86,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 41, 59], // Slate 800
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold',
          halign: 'left',
          valign: 'middle',
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [40, 40, 40],
          valign: 'top',
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 25, font: 'courier' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right', textColor: [180, 30, 30] },
          6: { cellWidth: 22, halign: 'right', textColor: [20, 120, 60] },
          7: { cellWidth: 24, halign: 'right', fontStyle: 'bold', textColor: [20, 20, 20] },
        },
        foot: [[
          { content: 'TOTAL SISA KEWAJIBAN BON MITRA:', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fontSize: 8 } },
          { content: formatRupiah(statement.totalBonKeseluruhan), colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9, textColor: [140, 70, 0] } },
        ]],
        footStyles: {
          fillColor: [254, 243, 199], // Amber 100
          textColor: [20, 20, 20],
        },
        margin: { left: 14, right: 14 },
      });

      // Get last Y position after table
      const lastY = (doc as any).lastAutoTable?.finalY || 180;
      let signY = lastY + 12;

      // Check if signature fits on current page
      if (signY + 35 > 285) {
        doc.addPage();
        signY = 20;
      }

      // 5. Tanda Tangan Block
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);

      const colLeftX = 40;
      const colRightX = pageWidth - 60;

      doc.text('Bagian Keuangan / Kasir,', colLeftX, signY, { align: 'center' });
      doc.text('PT Wijaya Agro', colLeftX, signY + 4, { align: 'center' });

      doc.text('Mitra / Petani Penerima,', colRightX, signY, { align: 'center' });
      doc.text('Konfirmasi Saldo Mutasi', colRightX, signY + 4, { align: 'center' });

      // Signature line
      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.4);
      doc.line(colLeftX - 25, signY + 24, colLeftX + 25, signY + 24);
      doc.line(colRightX - 25, signY + 24, colRightX + 25, signY + 24);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.text('( Kasir & Keuangan )', colLeftX, signY + 28, { align: 'center' });
      doc.text(`( ${statement.namaMitra} )`, colRightX, signY + 28, { align: 'center' });

      // Footer note
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text('Dokumen rekening koran ini sah dan diterbitkan secara elektronik oleh Sistem ERP PT Wijaya Agro.', pageWidth / 2, signY + 35, { align: 'center' });

      // Save file with .pdf extension
      const safeMitraName = statement.namaMitra.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Rekening_Koran_${statement.kodeMitra}_${safeMitraName}.pdf`;
      doc.save(filename);
    } catch (err: any) {
      console.error('PDF generation error:', err);
      alert(`Gagal membuat file PDF: ${err.message || err}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const generateTextSummary = () => {
    const divider = '==================================================';
    const lines = [
      `*REKENING KORAN & BUKU BESAR MITRA*`,
      `*PT WIJAYA AGRO - Blitar, Jawa Timur*`,
      `Tanggal Cetak: ${tglCetak} jam ${jamCetak} WIB`,
      `No. Dokumen: ${noDokumen}`,
      divider,
      `*IDENTITAS MITRA:*`,
      `Nama: ${statement.namaMitra} (${statement.kodeMitra})`,
      `Kategori: ${statement.role} | Status: ${statement.status}`,
      `Telepon: ${statement.telepon || '-'}`,
      `Alamat: ${statement.alamat || '-'}`,
      divider,
      `*RINGKASAN SALDO:*`,
      `• Kasbon Barang Toko : ${formatRupiah(statement.totalKasbonBarang)}`,
      `• Kasbon Uang Tunai  : ${formatRupiah(statement.totalKasbonUang)}`,
      `• *TOTAL SISA BON*   : *${formatRupiah(statement.totalBonKeseluruhan)}*`,
      `• Titip Hasil Panen  : ${formatRupiah(statement.totalTitip)}`,
      divider,
      `*HISTORI MUTASI:*`,
    ];

    if (statement.history.length === 0) {
      lines.push('Belum ada catatan mutasi.');
    } else {
      statement.history.forEach((h, idx) => {
        const mutasiStr =
          h.debet > 0
            ? `+Bon: ${formatRupiah(h.debet)}`
            : h.kredit > 0
            ? `-Bayar: ${formatRupiah(h.kredit)}`
            : 'Rp 0';
        lines.push(
          `${idx + 1}. [${h.tanggal} ${h.jam}] ${h.jenis}\n   Ket: ${h.keterangan || '-'}\n   Mutasi: ${mutasiStr} | Saldo: ${formatRupiah(h.saldoAkumulasi)}`
        );
      });
    }

    lines.push(divider);
    lines.push(`Total Sisa Hutang Bon: ${formatRupiah(statement.totalBonKeseluruhan)}`);
    lines.push(`Harap konfirmasi apabila terdapat ketidaksesuaian.`);
    lines.push(`_Dicetak resmi via ERP Wijaya Agro_`);

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
      {/* Print Specific CSS to prevent cut-off and fit perfectly to A4 */}
      <style>{`
        @media print {
          /* Hide all application layout elements and modal wrapper during printing */
          body * {
            visibility: hidden !important;
          }
          /* Make only the document container visible */
          #printable-rekening-koran, #printable-rekening-koran * {
            visibility: visible !important;
          }
          #printable-rekening-koran {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
          }
          #printable-rekening-koran table {
            width: 100% !important;
            table-layout: fixed !important;
          }
          #printable-rekening-koran tr {
            page-break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto print:p-0 print:bg-white">
        <div className="bg-white text-zinc-900 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:rounded-none">
          {/* Modal Top Header (Interactive Actions - Hidden on Print) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-zinc-900 text-white gap-3 shrink-0 print:hidden">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-400">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                  Pratinjau &amp; Cetak Rekening Koran
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                    {statement.kodeMitra}
                  </span>
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Dokumen resmi buku besar mutasi kasbon &amp; hasil bumi mitra
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleCopyWhatsApp}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-emerald-100 transition-colors cursor-pointer"
                title="Salin rekap mutasi dalam format pesan WhatsApp"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin!' : 'Salin WA'}</span>
              </button>

              {/* Direct PDF Download Button */}
              <button
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-rose-700 hover:bg-rose-600 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                title="Download dokumen langsung dalam format PDF (.pdf)"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download PDF (.pdf)'}</span>
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
                title="Cetak langsung ke printer (A4)"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Printer</span>
              </button>

              <button
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
              className="bg-white rounded-xl shadow-xs border border-zinc-200 p-6 sm:p-8 space-y-6 max-w-3xl mx-auto text-zinc-900 print:border-none print:shadow-none print:p-0 print:max-w-none"
            >
              {/* Kop Surat Resmi */}
              <div className="border-b-2 border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-6 h-6 text-emerald-800" />
                    <span className="text-xl font-black text-zinc-900 tracking-tight">PT WIJAYA AGRO</span>
                  </div>
                  <p className="text-xs font-semibold text-zinc-700 mt-0.5">
                    PERDAGANGAN SARANA PERTANIAN &amp; PEMBELIAN HASIL BUMI
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Jl. Raya Agro Industri No. 88, Wlingi, Blitar · Telp: (021) 8892-0192 · Email: admin@wijayaagro.com
                  </p>
                </div>

                <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200">
                    REKENING KORAN MITRA
                  </span>
                  <p className="text-[10px] font-mono text-zinc-500 mt-2">No. Dokumen: {noDokumen}</p>
                  <p className="text-[10px] text-zinc-500">
                    Dicetak: {tglCetak} · {jamCetak} WIB
                  </p>
                </div>
              </div>

              {/* Biodata Mitra */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs">
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-2 text-zinc-500 text-[11px]">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span>IDENTITAS MITRA / PETANI:</span>
                  </div>
                  <div className="text-sm font-bold text-zinc-900">
                    {statement.namaMitra}{' '}
                    <span className="text-xs font-normal text-zinc-500">({statement.kodeMitra})</span>
                  </div>
                  <div className="text-zinc-600">
                    Peran / Kategori: <strong className="text-zinc-900">{statement.role}</strong>
                  </div>
                  <div>
                    Status Akun:{' '}
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {statement.status}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 sm:border-l sm:border-zinc-200 sm:pl-4">
                  <div className="flex items-center space-x-2 text-zinc-500 text-[11px]">
                    <Phone className="w-3.5 h-3.5 text-zinc-400" />
                    <span>KONTAK &amp; ALAMAT:</span>
                  </div>
                  <div className="text-zinc-700">
                    Kontak Telp / WA: <span className="font-mono font-semibold">{statement.telepon || '-'}</span>
                  </div>
                  <div className="flex items-start space-x-1.5 text-zinc-600">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                    <span>{statement.alamat || 'Tidak ada alamat tercatat'}</span>
                  </div>
                </div>
              </div>

              {/* Saldo Summary Cards (Print Friendly) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">Kasbon Barang</span>
                  <p className="text-sm font-bold text-zinc-900 mt-0.5">
                    {formatRupiah(statement.totalKasbonBarang)}
                  </p>
                  <span className="text-[9px] text-zinc-500">Pupuk &amp; obat saprotan</span>
                </div>

                <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200">
                  <span className="text-[10px] font-bold text-rose-700 uppercase">Kasbon Uang</span>
                  <p className="text-sm font-bold text-rose-800 mt-0.5">
                    {formatRupiah(statement.totalKasbonUang)}
                  </p>
                  <span className="text-[9px] text-rose-600">Pinjaman tunai aktif</span>
                </div>

                <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-300">
                  <span className="text-[10px] font-bold text-amber-900 uppercase">TOTAL SISA BON</span>
                  <p className="text-base font-black text-amber-950 mt-0.5">
                    {formatRupiah(statement.totalBonKeseluruhan)}
                  </p>
                  <span className="text-[9px] font-semibold text-amber-800">Total piutang mitra</span>
                </div>

                <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200">
                  <span className="text-[10px] font-bold text-purple-900 uppercase">Titip Hasil Bumi</span>
                  <p className="text-sm font-bold text-purple-950 mt-0.5">
                    {formatRupiah(statement.totalTitip)}
                  </p>
                  <span className="text-[9px] text-purple-700">Hasil panen belum cair</span>
                </div>
              </div>

              {/* Tabel Rincian Mutasi Kronologis */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
                    Rincian Mutasi Transaksi ({statement.history.length} Catatan)
                  </span>
                  <span className="text-zinc-500 text-[10px]">Mata Uang: IDR (Rupiah)</span>
                </div>

                <div className="border border-zinc-200 rounded-lg overflow-x-auto print:overflow-visible">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-zinc-100 text-zinc-700 font-bold uppercase text-[9px] border-b border-zinc-200">
                      <tr>
                        <th className="py-2.5 px-2 w-20">TGL &amp; JAM</th>
                        <th className="py-2.5 px-2 w-24">NO. BUKTI</th>
                        <th className="py-2.5 px-2 w-24">JENIS</th>
                        <th className="py-2.5 px-2">URAIAN / KETERANGAN</th>
                        <th className="py-2.5 px-2 text-center w-16">QTY</th>
                        <th className="py-2.5 px-2 text-right w-24">HRG SATUAN</th>
                        <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">KASBON (+)</th>
                        <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">BAYAR (-)</th>
                        <th className="py-2.5 px-2.5 text-right w-26 whitespace-nowrap">SALDO BON</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 text-zinc-800 text-[11px]">
                      {statement.history.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-6 text-center text-zinc-400">
                            Belum ada histori transaksi untuk mitra ini
                          </td>
                        </tr>
                      ) : (
                        statement.history.map((row) => (
                          <tr key={row.id} className="hover:bg-zinc-50/50">
                            <td className="py-2.5 px-2 text-zinc-500 text-[10px] whitespace-nowrap">
                              <div>{row.tanggal}</div>
                              <div className="text-[9px] text-zinc-400">{row.jam}</div>
                            </td>
                            <td className="py-2.5 px-2 font-mono font-medium text-zinc-900 text-[10px] break-all">
                              {row.id}
                            </td>
                            <td className="py-2.5 px-2 font-semibold text-[10px]">
                              {row.jenis.replace(/_/g, ' ')}
                            </td>
                            <td className="py-2.5 px-2 text-zinc-600 break-words text-[10px]">
                              <div>{row.keterangan || '-'}</div>
                              {row.itemsDetail && row.itemsDetail.length > 1 && (
                                <div className="mt-1 space-y-0.5 text-[9px] text-zinc-500 bg-zinc-50 p-1 rounded border border-zinc-200">
                                  {row.itemsDetail.map((it, idx) => (
                                    <div key={idx} className="flex justify-between">
                                      <span>• {it.nama}</span>
                                      <span className="font-mono">{it.qty} {it.satuan} @ {formatRupiah(it.harga)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-zinc-800 text-[10px] whitespace-nowrap">
                              {row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1' : '-')}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-zinc-700 text-[10px] whitespace-nowrap">
                              {row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-')}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-rose-700 whitespace-nowrap text-[10px]">
                              {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-emerald-700 whitespace-nowrap text-[10px]">
                              {row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-'}
                            </td>
                            <td className="py-2.5 px-2.5 text-right font-mono font-bold text-zinc-900 whitespace-nowrap text-[10px]">
                              {formatRupiah(row.saldoAkumulasi)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {statement.history.length > 0 && (
                      <tfoot className="bg-zinc-50 border-t-2 border-zinc-300 font-bold text-xs text-zinc-900">
                        <tr>
                          <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-[10px]">
                            Saldo Akhir Bon Mitra:
                          </td>
                          <td colSpan={3} className="py-2.5 px-3 text-right font-mono text-amber-900 text-sm">
                            {formatRupiah(statement.totalBonKeseluruhan)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Kolom Tanda Tangan Resmi */}
              <div className="pt-6 border-t border-dashed border-zinc-300 grid grid-cols-2 text-center text-xs text-zinc-600 gap-8">
                <div>
                  <p className="font-semibold text-zinc-800">Bagian Keuangan / Kasir</p>
                  <p className="text-[10px] text-zinc-500">PT Wijaya Agro</p>
                  <div className="h-16 flex items-end justify-center">
                    <div className="border-b border-zinc-400 w-40 text-center text-[10px] text-zinc-400 pb-0.5">
                      ( Tanda Tangan &amp; Cap )
                    </div>
                  </div>
                </div>

                <div>
                  <p className="font-semibold text-zinc-800">Mitra / Petani Penerima</p>
                  <p className="text-[10px] text-zinc-500">Konfirmasi Saldo Mutasi</p>
                  <div className="h-16 flex items-end justify-center">
                    <div className="border-b border-zinc-400 w-40 text-center font-semibold text-zinc-800 pb-0.5">
                      ( {statement.namaMitra} )
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center text-[10px] text-zinc-400 border-t border-zinc-100 pt-3">
                Catatan: Dokumen mutasi ini sah dan diterbitkan secara elektronik oleh Sistem ERP PT Wijaya Agro.
              </div>
            </div>
          </div>

          {/* Modal Bottom Footer (Hidden on print) */}
          <div className="px-6 py-3.5 bg-white border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 print:hidden">
            <span className="text-xs text-zinc-500">
              Total Kewajiban Bon: <strong className="text-amber-900 font-bold">{formatRupiah(statement.totalBonKeseluruhan)}</strong>
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
              >
                Tutup Pratinjau
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download Dokumen PDF (.pdf)'}</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Printer</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
