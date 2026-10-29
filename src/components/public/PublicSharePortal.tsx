import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileText,
  Printer,
  Download,
  ShieldCheck,
  Calendar,
  User,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  FileDown,
  Camera,
  ExternalLink,
  ChevronRight,
  Eye,
  X,
  Search,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../../api/client.ts';
import {
  ProfilPerusahaan,
  RekeningKoranMitraSummary,
  UnifiedTransactionItem,
  RekapSemuaTransaksiResponse,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, formatTanggalIndo } from '../../utils/format.ts';

interface PublicSharePortalProps {
  shareType: 'rekening-koran' | 'rekap-harian';
  shareId?: string; // idMitra
  shareDate?: string; // date string
  onExitToErp?: () => void;
}

export const PublicSharePortal: React.FC<PublicSharePortalProps> = ({
  shareType,
  shareId,
  shareDate,
  onExitToErp,
}) => {
  // Statement State
  const [statement, setStatement] = useState<RekeningKoranMitraSummary | null>(null);
  const [rekapData, setRekapData] = useState<RekapSemuaTransaksiResponse | null>(null);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [portalNotice, setPortalNotice] = useState<string>('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  const activeProfil = React.useMemo<ProfilPerusahaan>(() => {
    const src = profilPerusahaan || statement?.profilPerusahaan;
    return {
      namaPerusahaan: src?.namaPerusahaan?.trim() || 'PT. WIJAYA AGRO PERKASA',
      badanHukum: src?.badanHukum?.trim() || 'PT (Perseroan Terbatas)',
      alamat: src?.alamat?.trim() || '-',
      telepon: src?.telepon?.trim() || '-',
      email: src?.email?.trim() || '-',
      penanggungJawab: src?.penanggungJawab?.trim() || 'Bagian Keuangan & Manajemen',
      rekeningUtama: src?.rekeningUtama?.trim() || 'KAS01',
      catatanHeaderNota: src?.catatanHeaderNota?.trim() || '',
      updateTerakhir: src?.updateTerakhir,
    };
  }, [profilPerusahaan, statement?.profilPerusahaan]);

  // Lightbox photo preview
  const [previewPhoto, setPreviewPhoto] = useState<{
    url: string;
    title: string;
    tanggal?: string;
  } | null>(null);

  // Search filter for rekap
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Compute fluctuation of Saldo Titip for visual chart
  const titipChartData = React.useMemo(() => {
    if (!statement || !statement.history) return [];

    const sorted = [...statement.history].sort((a, b) => {
      const [da, ma, ya] = (a.tanggal || '').split('/').map(Number);
      const [db, mb, yb] = (b.tanggal || '').split('/').map(Number);
      const timeA = new Date(ya, (ma || 1) - 1, da || 1).getTime();
      const timeB = new Date(yb, (mb || 1) - 1, db || 1).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return (a.jam || '').localeCompare(b.jam || '');
    });

    let runningTitip = 0;
    return sorted.map((item, idx) => {
      const jenisUpper = (item.jenis || '').toUpperCase();
      const isTitipMasuk =
        (jenisUpper.includes('TITIP') && !jenisUpper.includes('PENCAIRAN')) ||
        jenisUpper.includes('PINJAMAN UANG PT KE MITRA');
      const isTitipKeluar = jenisUpper.includes('PENCAIRAN') && jenisUpper.includes('TITIP');

      const nominalItem = (item.itemsDetail && item.itemsDetail[0]?.subtotal) || item.kredit || item.debet || 0;

      let deltaTitip = 0;
      if (isTitipMasuk) {
        deltaTitip = nominalItem;
        runningTitip += deltaTitip;
      } else if (isTitipKeluar) {
        deltaTitip = -nominalItem;
        runningTitip = Math.max(0, runningTitip - nominalItem);
      }

      return {
        pointIndex: idx + 1,
        id: item.id,
        tanggal: item.tanggal,
        jam: item.jam,
        timeLabel: `${item.tanggal.slice(0, 5)}`,
        jenis: item.jenis.replace(/_/g, ' '),
        deltaTitip,
        saldoTitip: runningTitip,
        saldoBon: item.saldoAkumulasi || 0,
      };
    });
  }, [statement]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorMsg('');

    const fetchData = async () => {
      try {
        const profilPromise = api.getProfilPerusahaan().catch(() => null);
        if (shareType === 'rekening-koran') {
          if (!shareId) {
            throw new Error('ID Mitra tidak ditemukan dalam tautan.');
          }
          const [res, profilRes] = await Promise.all([
            api.getRekeningKoranMitra(shareId),
            profilPromise,
          ]);
          if (isMounted) {
            setStatement(res);
            if (profilRes) setProfilPerusahaan(profilRes);
          }
        } else if (shareType === 'rekap-harian') {
          const [res, profilRes] = await Promise.all([
            api.getSemuaTransaksi({
              tanggal: shareDate,
            }),
            profilPromise,
          ]);
          if (isMounted) {
            setRekapData(res);
            if (profilRes) setProfilPerusahaan(profilRes);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message || 'Gagal memuat dokumen rekap. Tautan mungkin telah kedaluwarsa atau tidak valid.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [shareType, shareId, shareDate]);

  const handlePrint = () => {
    setPortalNotice('');
    try {
      window.print();
    } catch {
      setPortalNotice('Gunakan tombol Download PDF untuk mengunduh dokumen secara langsung.');
    }
  };

  const handleDownloadPdf = () => {
    if (!statement) return;
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const now = new Date();
      const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
      const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const noDokumen = `RK/${statement.kodeMitra}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${statement.history.length}`;

      // Kop Surat (Dinamis dari Profil Perusahaan)
      doc.setFillColor(15, 60, 40);
      doc.rect(14, 12, 6, 23, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 20);
      doc.text(activeProfil.namaPerusahaan, 24, 17.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(activeProfil.badanHukum, 24, 22);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      const contactLine = `${activeProfil.alamat} · Telp: ${activeProfil.telepon}${
        activeProfil.email && activeProfil.email !== '-' ? ` · Email: ${activeProfil.email}` : ''
      }`;
      const wrappedContact = doc.splitTextToSize(contactLine, pageWidth - 95);
      doc.text(wrappedContact.slice(0, 2), 24, 26.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(40, 50, 120);
      doc.text('REKENING KORAN MITRA', pageWidth - 14, 18, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`No. Dokumen: ${noDokumen}`, pageWidth - 14, 23, { align: 'right' });
      doc.text(`Dicetak: ${tglCetak} ${jamCetak} WIB`, pageWidth - 14, 28, { align: 'right' });

      doc.setDrawColor(20, 20, 20);
      doc.setLineWidth(0.6);
      doc.line(14, 35.5, pageWidth - 14, 35.5);

      // Biodata Mitra Box
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

      // Ringkasan Saldo Box
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

      // Tabel Mutasi
      const tableHead = [['Tgl & Jam', 'No. Bukti', 'Jenis & Uraian', 'Qty', 'Harga Satuan', 'Kasbon (+)', 'Bayar (-)', 'Saldo Bon']];
      const tableBody = statement.history.length === 0
        ? [['-', '-', 'Belum ada catatan mutasi', '-', '-', '-', '-', formatRupiah(statement.totalBonKeseluruhan)]]
        : statement.history.map((row) => [
            `${row.tanggal}\n${row.jam}`,
            row.id,
            `${row.jenis.replace(/_/g, ' ')}\n${row.keterangan || '-'}`,
            row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1 Trx' : '-'),
            row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-'),
            row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-',
            row.kredit > 0
              ? `-${formatRupiah(row.kredit)}`
              : row.nominalMutasiHak && row.nominalMutasiHak > 0
              ? formatRupiah(row.nominalMutasiHak)
              : '-',
            formatRupiah(row.saldoAkumulasi),
          ]);

      autoTable(doc, {
        startY: 86,
        head: tableHead,
        body: tableBody,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontSize: 7.5,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [40, 40, 40],
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        foot: [[
          { content: 'TOTAL SISA KEWAJIBAN BON MITRA:', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', fontSize: 8 } },
          { content: formatRupiah(statement.totalBonKeseluruhan), colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 9, textColor: [140, 70, 0] } },
        ]],
        footStyles: {
          fillColor: [254, 243, 199],
          textColor: [20, 20, 20],
        },
        margin: { left: 14, right: 14 },
      });

      const lastY = (doc as any).lastAutoTable?.finalY || 180;
      let signY = lastY + 12;
      if (signY + 35 > 285) {
        doc.addPage();
        signY = 20;
      }

      const colLeftX = 40;
      const colRightX = pageWidth - 60;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text('Penanggung Jawab / Keuangan,', colLeftX, signY, { align: 'center' });
      doc.text(activeProfil.namaPerusahaan, colLeftX, signY + 4, { align: 'center' });
      doc.text('Mitra / Petani Penerima,', colRightX, signY, { align: 'center' });
      doc.text('Konfirmasi Saldo Mutasi', colRightX, signY + 4, { align: 'center' });

      doc.setDrawColor(120, 120, 120);
      doc.setLineWidth(0.4);
      doc.line(colLeftX - 28, signY + 24, colLeftX + 28, signY + 24);
      doc.line(colRightX - 28, signY + 24, colRightX + 28, signY + 24);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.text(`( ${activeProfil.penanggungJawab} )`, colLeftX, signY + 28, { align: 'center' });
      doc.text(`( ${statement.namaMitra} )`, colRightX, signY + 28, { align: 'center' });

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      const footerText = activeProfil.catatanHeaderNota
        ? `${activeProfil.catatanHeaderNota} — Diterbitkan secara elektronik oleh Sistem ERP ${activeProfil.namaPerusahaan}.`
        : `Dokumen rekening koran ini sah dan diterbitkan secara elektronik oleh Sistem ERP ${activeProfil.namaPerusahaan}.`;
      doc.text(doc.splitTextToSize(footerText, pageWidth - 28), pageWidth / 2, signY + 35, { align: 'center' });

      const safeMitraName = statement.namaMitra.replace(/[^a-zA-Z0-9_-]/g, '_');
      doc.save(`Rekening_Koran_${statement.kodeMitra}_${safeMitraName}.pdf`);
    } catch (err: any) {
      console.error('PDF error:', err);
      setPortalNotice('Gagal membuat PDF: ' + (err.message || err));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 flex flex-col font-sans">
      {/* Top Banner (Public Portal Header - Dinamis dari Profil Perusahaan) */}
      <header className="bg-gradient-to-r from-emerald-900 via-teal-950 to-zinc-900 text-white shadow-md border-b border-emerald-800/40">
        <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-3 text-center sm:text-left">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300 border border-white/20 shrink-0 shadow-inner">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center justify-center sm:justify-start space-x-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white">
                  {activeProfil.namaPerusahaan}
                </h1>
                <span className="flex items-center space-x-1 text-emerald-300 text-[10px] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>DOKUMEN RESMI</span>
                </span>
              </div>
              <p className="text-[11px] text-emerald-200/80">
                {activeProfil.alamat} · Telp: {activeProfil.telepon}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {statement && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-700 hover:bg-rose-600 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  title="Unduh dokumen rekening koran dalam bentuk PDF (.pdf)"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
                  title="Cetak langsung ke printer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Printer</span>
                </button>
              </>
            )}

            {onExitToErp && (
              <button
                type="button"
                onClick={onExitToErp}
                className="flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors cursor-pointer border border-white/10"
                title="Kembali ke Sistem ERP Utama"
              >
                <span>Masuk ke ERP</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-6 flex-1 space-y-6">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-zinc-500 font-medium">Memuat data dokumen resmi...</p>
          </div>
        ) : errorMsg ? (
          <div className="p-6 bg-white rounded-2xl border border-rose-200 shadow-sm max-w-lg mx-auto my-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-zinc-900">Tautan Tidak Ditemukan</h2>
            <p className="text-xs text-zinc-600 leading-relaxed">{errorMsg}</p>
            {onExitToErp && (
              <button
                type="button"
                onClick={onExitToErp}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
              >
                Kembali ke Beranda
              </button>
            )}
          </div>
        ) : shareType === 'rekening-koran' && statement ? (
          <div className="space-y-6">
            {portalNotice && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>{portalNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPortalNotice('')}
                  className="text-amber-700 hover:text-amber-950 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Disclaimer & Profil Perusahaan Bar */}
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-emerald-900">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Dokumen salinan resmi mutasi buku besar mitra di <strong>{activeProfil.namaPerusahaan}</strong> ({activeProfil.badanHukum}).
                  </span>
                </div>
                <div className="text-emerald-800/80 pl-6">
                  {activeProfil.alamat} · Telp: {activeProfil.telepon}
                  {activeProfil.email && activeProfil.email !== '-' ? ` · Email: ${activeProfil.email}` : ''}
                </div>
              </div>
              <span className="font-mono text-[10px] text-emerald-700 shrink-0">
                ID Dokumen: RK/{statement.kodeMitra}
              </span>
            </div>

            {/* Biodata Mitra Card */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">
                    IDENTITAS MITRA / PETANI:
                  </span>
                  <h2 className="text-lg font-black text-zinc-900 flex items-center gap-2">
                    {statement.namaMitra}
                    <span className="text-xs font-mono font-bold text-zinc-600">
                      ({statement.kodeMitra})
                    </span>
                  </h2>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{statement.role}</span>
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{statement.telepon || '-'}</span>
                    </span>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-zinc-200 sm:pl-6 space-y-1">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">
                    STATUS MUTASI
                  </span>
                  <div className="text-xs font-bold text-emerald-700 flex items-center justify-end gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>DATA AKTIF SINKRON</span>
                  </div>
                  <div className="text-[11px] text-zinc-500 flex items-center justify-end gap-1">
                    <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{statement.alamat || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 4 Saldo Summary Box */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
                <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 min-w-0 overflow-hidden">
                  <div className="text-[11px] text-zinc-500 font-semibold mb-0.5 truncate">Kasbon Barang Toko</div>
                  <div
                    className="text-base font-bold text-zinc-900 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(statement.totalKasbonBarang)}
                  >
                    {formatRupiahSingkat(statement.totalKasbonBarang)}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 truncate">Pupuk, obat &amp; saprotan</div>
                </div>

                <div className="p-3.5 bg-rose-50/70 rounded-xl border border-rose-200 min-w-0 overflow-hidden">
                  <div className="text-[11px] text-rose-800 font-semibold mb-0.5 truncate">Kasbon Pinjaman Uang</div>
                  <div
                    className="text-base font-bold text-rose-950 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(statement.totalKasbonUang)}
                  >
                    {formatRupiahSingkat(statement.totalKasbonUang)}
                  </div>
                  <div className="text-[10px] text-rose-700/80 mt-1 truncate">Pinjaman tunai kasir</div>
                </div>

                <div className="p-3.5 bg-amber-50 rounded-xl border-2 border-amber-300 shadow-2xs min-w-0 overflow-hidden">
                  <div className="text-[11px] text-amber-900 font-bold mb-0.5 flex items-center justify-between gap-1.5 min-w-0">
                    <span className="truncate">TOTAL SISA BON</span>
                    <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded font-mono font-bold shrink-0">KEWAJIBAN</span>
                  </div>
                  <div
                    className="text-lg font-black text-amber-950 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(statement.totalBonKeseluruhan)}
                  >
                    {formatRupiahSingkat(statement.totalBonKeseluruhan)}
                  </div>
                  <div className="text-[10px] text-amber-800 mt-1 truncate">Total hutang bon saat ini</div>
                </div>

                <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-200 min-w-0 overflow-hidden">
                  <div className="text-[11px] text-purple-900 font-semibold mb-0.5 flex items-center justify-between gap-1.5 min-w-0">
                    <span className="truncate">
                      {statement.isKaryawan ? 'Titip Panen + Hak Upah' : 'Titip Panen / Pinjam PT'}
                    </span>
                    <span className="text-[9px] bg-purple-200 text-purple-900 px-1 rounded font-mono font-bold shrink-0">HAK MITRA</span>
                  </div>
                  <div
                    className="text-base font-bold text-purple-950 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(statement.totalTitip)}
                  >
                    {formatRupiahSingkat(statement.totalTitip)}
                  </div>
                  <div className="text-[10px] text-purple-800 mt-1 truncate">
                    {statement.isKaryawan
                      ? `Panen ${formatRupiahSingkat(statement.totalTitipPanenMurni || 0)} · Gaji Cair ${formatRupiahSingkat(statement.totalGajiSudahDibayar || 0)}`
                      : 'Saldo uang titipan di PT'}
                  </div>
                </div>
              </div>
            </div>

            {/* Recharts: Grafik Fluktuasi Saldo Titipan Mitra */}
            {titipChartData.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-purple-200/80 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-700 text-white flex items-center justify-center shadow-xs shrink-0">
                      <Activity className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-zinc-900">
                        Grafik Fluktuasi Saldo Titipan Mitra dari Waktu ke Waktu
                      </h3>
                      <p className="text-[10px] sm:text-[11px] text-zinc-500">
                        Visualisasi riwayat kenaikan dan pencairan saldo titipan ({statement.namaMitra})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px]">
                    <span className="text-zinc-500">Saldo Saat Ini:</span>
                    <strong
                      className="font-mono tabular-nums text-purple-900 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200 whitespace-nowrap"
                      title={formatRupiah(statement.totalTitip)}
                    >
                      {formatRupiahSingkat(statement.totalTitip)}
                    </strong>
                  </div>
                </div>

                <div className="w-full h-56 sm:h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={titipChartData} margin={{ top: 10, right: 20, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="timeLabel" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                      <YAxis
                        tickFormatter={(val) => {
                          if (val >= 1000000) return `${(val / 1000000).toFixed(1)}jt`;
                          if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                          return `${val}`;
                        }}
                        tick={{ fontSize: 10, fill: '#64748b' }}
                        stroke="#cbd5e1"
                        width={48}
                      />
                      <RechartsTooltip
                        content={({ active, payload }: any) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-zinc-900 text-white text-xs p-2.5 rounded-xl shadow-xl border border-zinc-700 space-y-1">
                                <div className="text-[10px] text-zinc-400 font-mono">
                                  {data.tanggal} {data.jam} · {data.id}
                                </div>
                                <div className="font-semibold text-zinc-100 text-[11px]">
                                  {data.jenis}
                                </div>
                                <div className="text-purple-300 font-mono font-bold text-[11px] pt-1 border-t border-zinc-800">
                                  Saldo Titip: {formatRupiah(data.saldoTitip)}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                      <Line
                        type="monotone"
                        name="Saldo Titipan Mitra (Rp)"
                        dataKey="saldoTitip"
                        stroke="#7e22ce"
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: '#7e22ce', stroke: '#fff', strokeWidth: 1.5 }}
                        activeDot={{ r: 5, fill: '#581c87' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Mutasi Table Card */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Rincian Mutasi Transaksi ({statement.history.length} Catatan)
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400">
                  Urutan Kronologis Waktu
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-100 text-zinc-700 font-bold text-[10px] uppercase tracking-wider border-b border-zinc-200">
                    <tr>
                      <th className="py-2.5 px-3">Tgl &amp; Jam</th>
                      <th className="py-2.5 px-3">No. Bukti</th>
                      <th className="py-2.5 px-3">Jenis &amp; Uraian</th>
                      <th className="py-2.5 px-2 text-center">Qty</th>
                      <th className="py-2.5 px-2 text-right">Harga</th>
                      <th className="py-2.5 px-3 text-right text-rose-700">Kasbon (+)</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Bayar (-)</th>
                      <th className="py-2.5 px-3 text-right">Saldo Bon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-[11px]">
                    {statement.history.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-zinc-400">
                          Belum ada catatan transaksi untuk mitra ini.
                        </td>
                      </tr>
                    ) : (
                      statement.history.map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-50/70">
                          <td className="py-2.5 px-3 text-zinc-500 text-[10px] whitespace-nowrap">
                            <div>{row.tanggal}</div>
                            <div className="text-[9px] text-zinc-400">{row.jam}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 text-[10px]">
                            {row.id}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-zinc-900">{row.jenis.replace(/_/g, ' ')}</div>
                            <div className="text-[10px] text-zinc-500">{row.keterangan || '-'}</div>
                            {row.itemsDetail && row.itemsDetail.length > 1 && (
                              <div className="mt-1 space-y-0.5 text-[9px] text-zinc-600 bg-zinc-50 p-1 rounded border border-zinc-200">
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
                          <td className="py-2.5 px-3 text-right font-mono text-rose-700 font-semibold whitespace-nowrap text-[10px]">
                            {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap text-[10px]">
                            {row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900 whitespace-nowrap text-[10px]">
                            {formatRupiah(row.saldoAkumulasi)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {statement.history.length > 0 && (
                    <tfoot className="bg-zinc-50 border-t-2 border-zinc-300 font-bold text-xs text-zinc-900">
                      <tr>
                        <td colSpan={5} className="py-3 px-3 text-right uppercase text-[10px]">
                          Saldo Akhir Kewajiban Bon:
                        </td>
                        <td colSpan={3} className="py-3 px-3 text-right font-mono text-amber-950 text-sm">
                          {formatRupiah(statement.totalBonKeseluruhan)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Lampiran Foto Bukti Nota Fisik (Jika Ada) */}
            {statement.history.some((h) => !!h.fotoNota) && (
              <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <Camera className="w-5 h-5 text-amber-600" />
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">
                        Lampiran Foto Bukti Nota Fisik &amp; Kuitansi
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        Klik pada gambar untuk melihat dalam ukuran penuh
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                    Otentik &amp; Sah
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {statement.history
                    .filter((h) => !!h.fotoNota)
                    .flatMap((h) => {
                      const imgs = (h.fotoNota || '').split('|||').map((s) => s.trim()).filter(Boolean);
                      return imgs.map((img, idx) => ({
                        id: `${h.id}-${idx}`,
                        txId: h.id,
                        title: `Bukti Nota ${h.id}`,
                        tanggal: h.tanggal,
                        keterangan: h.keterangan,
                        image: img,
                      }));
                    })
                    .map((item) => (
                      <div
                        key={item.id}
                        onClick={() =>
                          setPreviewPhoto({
                            url: item.image,
                            title: `Bukti Nota ${item.txId}`,
                            tanggal: item.tanggal,
                          })
                        }
                        className="group border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50 hover:border-indigo-400 transition-all cursor-pointer shadow-2xs hover:shadow-md"
                      >
                        <div className="h-32 bg-zinc-100 flex items-center justify-center p-1 overflow-hidden relative">
                          <img
                            src={item.image}
                            alt={item.title || 'Bukti Nota'}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold space-x-1">
                            <Eye className="w-4 h-4" />
                            <span>Perbesar</span>
                          </div>
                        </div>
                        <div className="p-2 text-[10px] space-y-0.5 bg-white">
                          <div className="font-mono font-bold text-zinc-900 truncate">{item.txId}</div>
                          <div className="text-zinc-500 truncate">{item.tanggal}</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Official Stamp & Signatures Box */}
            <div className="bg-white rounded-2xl p-6 border border-zinc-200 shadow-sm space-y-4 text-center text-xs text-zinc-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-1">
                  <p className="font-semibold text-zinc-800">Penanggung Jawab &amp; Keuangan</p>
                  <p className="text-[10px] text-zinc-400">{activeProfil.namaPerusahaan}</p>
                  <div className="h-20 flex items-end justify-center">
                    <div className="border-b border-zinc-400 min-w-44 px-2 pb-1 text-[11px] font-bold text-zinc-800">
                      ( {activeProfil.penanggungJawab} )
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="font-semibold text-zinc-800">Mitra / Petani Penerima</p>
                  <p className="text-[10px] text-zinc-400">Konfirmasi Rekapan Mutasi</p>
                  <div className="h-20 flex items-end justify-center">
                    <div className="border-b border-zinc-400 min-w-44 px-2 pb-1 text-[11px] font-bold text-zinc-800">
                      ( {statement.namaMitra} )
                    </div>
                  </div>
                </div>
              </div>

              {activeProfil.catatanHeaderNota && (
                <p className="text-[11px] text-zinc-500 italic border-t border-zinc-100 pt-3">
                  &ldquo;{activeProfil.catatanHeaderNota}&rdquo;
                </p>
              )}
            </div>
          </div>
        ) : shareType === 'rekap-harian' && rekapData ? (
          <div className="space-y-6">
            {/* Rekap Header Card */}
            <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">
                    REKAPITULASI TRANSAKSI HARIAN
                  </span>
                  <h2 className="text-lg font-black text-zinc-900">
                    Tanggal: {rekapData.summary.tanggalQuery || shareDate || 'Hari Ini'}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Total {rekapData.summary.totalTransaksi} transaksi masuk &amp; keluar pada tanggal ini
                  </p>
                </div>
                <div className="sm:text-right min-w-0">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400">
                    SELISIH KAS NETO
                  </span>
                  <div
                    className={`text-lg font-black font-mono tabular-nums truncate whitespace-nowrap ${
                      rekapData.summary.arusKasBersih >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                    title={formatRupiah(rekapData.summary.arusKasBersih)}
                  >
                    {formatRupiahSingkat(rekapData.summary.arusKasBersih)}
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 text-xs text-emerald-800 font-semibold mb-1 min-w-0">
                    <span className="truncate">TOTAL UANG MASUK (PENJUALAN &amp; BAYAR BON)</span>
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0" />
                  </div>
                  <div
                    className="text-xl font-black text-emerald-950 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(rekapData.summary.totalUangMasuk)}
                  >
                    {formatRupiahSingkat(rekapData.summary.totalUangMasuk)}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 text-xs text-rose-800 font-semibold mb-1 min-w-0">
                    <span className="truncate">TOTAL UANG KELUAR (BELI HASIL BUMI, KASBON &amp; BIAYA)</span>
                    <ArrowUpRight className="w-4 h-4 text-rose-600 shrink-0" />
                  </div>
                  <div
                    className="text-xl font-black text-rose-950 font-mono tabular-nums truncate whitespace-nowrap"
                    title={formatRupiah(rekapData.summary.totalUangKeluar)}
                  >
                    {formatRupiahSingkat(rekapData.summary.totalUangKeluar)}
                  </div>
                </div>
              </div>
            </div>

            {/* Transactions List */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-zinc-900 text-white flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Jurnal Rincian Transaksi
                  </span>
                </div>
                <div className="relative w-48">
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Cari transaksi..."
                    className="w-full pl-7 pr-2 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-400 focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2" />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-100 text-zinc-700 font-bold text-[10px] uppercase tracking-wider border-b border-zinc-200">
                    <tr>
                      <th className="py-2.5 px-3">Jam</th>
                      <th className="py-2.5 px-3">No. Transaksi</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3">Pihak Terkait</th>
                      <th className="py-2.5 px-3">Uraian / Keterangan</th>
                      <th className="py-2.5 px-3 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-[11px]">
                    {rekapData.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-zinc-400">
                          Tidak ada transaksi yang tercatat pada tanggal ini.
                        </td>
                      </tr>
                    ) : (
                      rekapData.transactions
                        .filter((it: UnifiedTransactionItem) => {
                          if (!searchFilter.trim()) return true;
                          const q = searchFilter.toLowerCase();
                          return (
                            it.id.toLowerCase().includes(q) ||
                            it.pihakTerkait.toLowerCase().includes(q) ||
                            it.deskripsi.toLowerCase().includes(q) ||
                            it.jenisLabel.toLowerCase().includes(q)
                          );
                        })
                        .map((it: UnifiedTransactionItem) => (
                          <tr key={it.id} className="hover:bg-zinc-50/70">
                            <td className="py-2.5 px-3 font-mono text-zinc-500 text-[10px]">
                              {it.jam}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-zinc-900 text-[10px]">
                              {it.id}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-zinc-800 text-[10px]">
                              {it.jenisLabel}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-zinc-900">
                              {it.pihakTerkait}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-600 text-[10px]">
                              {it.deskripsi}
                            </td>
                            <td
                              className={`py-2.5 px-3 text-right font-mono font-bold text-[11px] ${
                                it.arusUang === 'MASUK'
                                  ? 'text-emerald-700'
                                  : it.arusUang === 'KELUAR'
                                  ? 'text-rose-700'
                                  : 'text-zinc-700'
                              }`}
                            >
                              {it.arusUang === 'MASUK' ? '+' : it.arusUang === 'KELUAR' ? '-' : ''}
                              {formatRupiah(it.nominal)}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Lightbox Photo Preview Modal */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-3 bg-zinc-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold">{previewPhoto.title}</span>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="p-1 hover:bg-white/20 rounded cursor-pointer"
              >
                <X className="w-4 h-4 text-zinc-300 hover:text-white" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex items-center justify-center bg-zinc-100 flex-1">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.title}
                className="max-h-[70vh] w-auto object-contain rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-zinc-200 py-4 text-center text-xs text-zinc-400">
        <p>© {new Date().getFullYear()} {activeProfil.namaPerusahaan} · Portal Rekapitulasi &amp; Laporan Elektronik</p>
      </footer>
    </div>
  );
};
