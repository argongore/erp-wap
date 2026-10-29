import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Calendar,
  RefreshCw,
  Printer,
  Download,
  Image,
  X,
  CreditCard,
  User,
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  ChevronDown,
  CheckCircle2,
  Clock,
  Briefcase,
  Package,
  Wheat,
  HandCoins,
  Receipt,
  Eye,
  Share2,
  FileDown,
  Pencil,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { UnifiedTransactionItem, RekapSemuaTransaksiResponse } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ShareLinkModal } from '../public/ShareLinkModal.tsx';
import { ExportLaporanPdfModal } from './ExportLaporanPdfModal.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import { extractDateParts, NAMA_BULAN_INDO } from '../../utils/exportRekapTransaksiPdf.ts';

function getTodayDmy(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getYesterdayDmy(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function toIsoInputDate(dmy: string): string {
  if (!dmy) return '';
  const parts = dmy.split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return dmy;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return '';
}

function fromIsoInputDate(ymd: string): string {
  if (!ymd) return '';
  const parts = ymd.split('-');
  if (parts.length === 3) {
    return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  return ymd;
}

interface Props {
  onRefreshParent?: () => void;
  readOnly?: boolean;
}

export const RekapSemuaTransaksiHarianView: React.FC<Props> = ({
  onRefreshParent,
  readOnly = false,
}) => {
  const nowInit = new Date();
  const defaultMonth = String(nowInit.getMonth() + 1).padStart(2, '0');
  const defaultYear = String(nowInit.getFullYear());

  // 1. Filter States
  const [selectedDateMode, setSelectedDateMode] = useState<
    'HARI_INI' | 'KEMARIN' | 'PILIH_TANGGAL' | 'BULANAN' | 'SEMUA'
  >('HARI_INI');
  const [customDate, setCustomDate] = useState<string>(getTodayDmy());
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [selectedYear, setSelectedYear] = useState<string>(defaultYear);
  
  // Arus Uang: ALL, MASUK, KELUAR, MUTASI, NON_TUNAI
  const [filterArusUang, setFilterArusUang] = useState<string>('ALL');
  
  // Jenis Transaksi
  const [filterJenis, setFilterJenis] = useState<string>('ALL');
  
  // Pihak Terkait (Nama)
  const [filterNama, setFilterNama] = useState<string>('ALL');
  const [searchQueryNama, setSearchQueryNama] = useState<string>('');
  
  // Search Bar (ID Transaksi, No Nota, Rekening, dll)
  const [searchTransaksi, setSearchTransaksi] = useState<string>('');

  // 2. Data & Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [rekapData, setRekapData] = useState<RekapSemuaTransaksiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 3. Lightbox Preview, Share Modal, Export PDF Modal, Edit Transaksi Modal & Progressive Row Limit
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [pdfModalOpen, setPdfModalOpen] = useState<boolean>(false);
  const [editModalTarget, setEditModalTarget] = useState<{ id: string; jenis?: string } | null>(null);
  const [visibleLimit, setVisibleLimit] = useState<number>(80);

  // Determine active query date for API ('ALL' is fetched for BULANAN & SEMUA)
  const activeTanggalParam = useMemo(() => {
    if (selectedDateMode === 'HARI_INI') return getTodayDmy();
    if (selectedDateMode === 'KEMARIN') return getYesterdayDmy();
    if (selectedDateMode === 'PILIH_TANGGAL') return customDate;
    return 'ALL';
  }, [selectedDateMode, customDate]);

  // Human-readable active period label
  const activePeriodDisplay = useMemo(() => {
    if (selectedDateMode === 'BULANAN') {
      const namaBulan = NAMA_BULAN_INDO[selectedMonth] || selectedMonth;
      return `Bulan ${namaBulan} ${selectedYear}`;
    }
    if (activeTanggalParam === 'ALL') return 'Seluruh Periode';
    return activeTanggalParam;
  }, [selectedDateMode, selectedMonth, selectedYear, activeTanggalParam]);

  // Available years derived from recorded dates + recent years
  const availableYears = useMemo(() => {
    const yearSet = new Set<string>([
      defaultYear,
      String(Number(defaultYear) - 1),
      String(Number(defaultYear) - 2),
    ]);
    rekapData?.daftarTanggalTersedia?.forEach((tgl) => {
      const parts = extractDateParts(tgl);
      if (parts?.year) yearSet.add(parts.year);
    });
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
  }, [rekapData?.daftarTanggalTersedia, defaultYear]);

  // Summary of active sub-filters for PDF audit metadata
  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filterArusUang !== 'ALL') parts.push(`Arus Uang: ${filterArusUang}`);
    if (filterJenis !== 'ALL') parts.push(`Jenis: ${filterJenis}`);
    if (filterNama !== 'ALL') parts.push(`Pihak: ${filterNama}`);
    if (searchQueryNama.trim()) parts.push(`Cari Nama: "${searchQueryNama.trim()}"`);
    if (searchTransaksi.trim()) parts.push(`Kata Kunci: "${searchTransaksi.trim()}"`);
    return parts.length > 0 ? parts.join(' | ') : 'Seluruh Arus Uang, Kategori & Pihak Terkait';
  }, [filterArusUang, filterJenis, filterNama, searchQueryNama, searchTransaksi]);

  // Load Transactions from API
  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setErrorMsg(null);
      const res = await api.getSemuaTransaksi({
        tanggal: activeTanggalParam,
      });
      setRekapData(res);
    } catch (err: any) {
      console.error('Error loading all transactions:', err);
      if (!silent) setErrorMsg(err.message || 'Gagal memuat rekapan transaksi');
    } finally {
      setLoading(false);
    }
  }, [activeTanggalParam]);

  useEffect(() => {
    loadData(Boolean(rekapData));
  }, [loadData]);

  useEffect(() => {
    const onErpUpdated = () => loadData(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [loadData]);

  // Client-side instant refinement filters
  const filteredTransactions = useMemo(() => {
    if (!rekapData?.transactions) return [];
    let list = rekapData.transactions;

    // Filter Bulanan (Month & Year) when mode is BULANAN
    if (selectedDateMode === 'BULANAN') {
      list = list.filter((tx) => {
        const parts = extractDateParts(tx.tanggal);
        if (!parts) return false;
        return parts.month === selectedMonth && parts.year === selectedYear;
      });
    }

    // Filter Arus Uang
    if (filterArusUang !== 'ALL') {
      list = list.filter((tx) => tx.arusUang === filterArusUang);
    }

    // Filter Jenis Transaksi
    if (filterJenis !== 'ALL') {
      list = list.filter((tx) => tx.jenis === filterJenis);
    }

    // Filter Nama (Dropdown selection)
    if (filterNama !== 'ALL') {
      list = list.filter((tx) => tx.pihakTerkait.toLowerCase() === filterNama.toLowerCase());
    }

    // Filter Nama (Search query text)
    if (searchQueryNama.trim()) {
      const q = searchQueryNama.toLowerCase();
      list = list.filter((tx) => tx.pihakTerkait.toLowerCase().includes(q));
    }

    // Filter Transaksi Search (ID Transaksi, No Faktur, Rekening, Deskripsi)
    if (searchTransaksi.trim()) {
      const q = searchTransaksi.toLowerCase();
      list = list.filter(
        (tx) =>
          tx.id.toLowerCase().includes(q) ||
          tx.deskripsi.toLowerCase().includes(q) ||
          tx.rekening.toLowerCase().includes(q) ||
          tx.metode.toLowerCase().includes(q) ||
          tx.jenisLabel.toLowerCase().includes(q)
      );
    }

    return list;
  }, [
    rekapData,
    selectedDateMode,
    selectedMonth,
    selectedYear,
    filterArusUang,
    filterJenis,
    filterNama,
    searchQueryNama,
    searchTransaksi,
  ]);

  useEffect(() => {
    setVisibleLimit(80);
  }, [
    selectedDateMode,
    customDate,
    selectedMonth,
    selectedYear,
    filterArusUang,
    filterJenis,
    filterNama,
    searchQueryNama,
    searchTransaksi,
  ]);

  const displayedTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleLimit),
    [filteredTransactions, visibleLimit]
  );

  // Computed Totals for filtered view
  const computedSummary = useMemo(() => {
    const totalTransaksi = filteredTransactions.length;
    const totalMasuk = filteredTransactions.reduce((s, tx) => s + tx.nominalMasuk, 0);
    const totalKeluar = filteredTransactions.reduce((s, tx) => s + tx.nominalKeluar, 0);
    const netCashflow = totalMasuk - totalKeluar;
    const totalNonTunai = filteredTransactions
      .filter((tx) => tx.arusUang === 'NON_TUNAI')
      .reduce((s, tx) => s + tx.nominal, 0);

    const masukCount = filteredTransactions.filter((tx) => tx.arusUang === 'MASUK').length;
    const keluarCount = filteredTransactions.filter((tx) => tx.arusUang === 'KELUAR').length;
    const mutasiCount = filteredTransactions.filter((tx) => tx.arusUang === 'MUTASI').length;
    const nonTunaiCount = filteredTransactions.filter((tx) => tx.arusUang === 'NON_TUNAI').length;

    return {
      totalTransaksi,
      totalMasuk,
      totalKeluar,
      netCashflow,
      totalNonTunai,
      masukCount,
      keluarCount,
      mutasiCount,
      nonTunaiCount,
    };
  }, [filteredTransactions]);

  // Print Action
  const handlePrint = () => {
    window.print();
  };

  // Export CSV Action
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) return;
    const headers = [
      'No Transaksi',
      'Tanggal',
      'Jam',
      'Jenis Transaksi',
      'Arus Uang',
      'Pihak Terkait (Nama)',
      'Deskripsi / Rincian',
      'Rekening Terkait',
      'Nominal (Rp)',
      'Nominal Masuk (Rp)',
      'Nominal Keluar (Rp)',
      'Metode',
      'Status',
    ];

    const rows = filteredTransactions.map((tx) => [
      `"${tx.id}"`,
      `"${tx.tanggal}"`,
      `"${tx.jam}"`,
      `"${tx.jenisLabel}"`,
      `"${tx.arusUangLabel}"`,
      `"${tx.pihakTerkait.replace(/"/g, '""')}"`,
      `"${tx.deskripsi.replace(/"/g, '""')}"`,
      `"${tx.rekening}"`,
      tx.nominal,
      tx.nominalMasuk,
      tx.nominalKeluar,
      `"${tx.metode}"`,
      `"${tx.status}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Rekap_Transaksi_${activePeriodDisplay.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="no-print p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-600 hover:text-rose-900 font-bold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Printable Letterhead (Visible ONLY during window.print) */}
      <div className="hidden print:block border-b-2 border-zinc-900 pb-3 mb-4 text-zinc-900">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black tracking-tight uppercase">PT. WIJAYA AGRO PERKASA</h1>
            <p className="text-xs text-zinc-700">Sentra Agrobisnis, Pergudangan Hasil Bumi &amp; Perdagangan</p>
            <p className="text-xs font-semibold text-zinc-900 mt-0.5">
              LAPORAN JURNAL REKAPITULASI TRANSAKSI KEUANGAN
            </p>
          </div>
          <div className="text-right text-xs">
            <div className="font-bold">
              Periode: {activePeriodDisplay}
            </div>
            <div className="text-zinc-500 text-[10px]">Dicetak: {new Date().toLocaleString('id-ID')} WIB</div>
            <div className="text-zinc-600 font-mono text-[10px]">
              Total Transaksi: {filteredTransactions.length} Record
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-xs border border-zinc-300 p-2.5 rounded bg-zinc-50">
          <div>
            <div className="text-zinc-500 text-[10px] uppercase font-bold">Total Uang Masuk</div>
            <div className="font-bold text-emerald-700 font-mono">+{formatRupiah(computedSummary.totalMasuk)}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase font-bold">Total Uang Keluar</div>
            <div className="font-bold text-rose-700 font-mono">-{formatRupiah(computedSummary.totalKeluar)}</div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase font-bold">Arus Kas Bersih</div>
            <div className="font-bold text-blue-800 font-mono">
              {computedSummary.netCashflow >= 0 ? '+' : ''}
              {formatRupiah(computedSummary.netCashflow)}
            </div>
          </div>
          <div>
            <div className="text-zinc-500 text-[10px] uppercase font-bold">Total Piutang / Bon</div>
            <div className="font-bold text-purple-800 font-mono">{formatRupiah(computedSummary.totalNonTunai)}</div>
          </div>
        </div>
      </div>

      {/* 1. Header & Actions Bar (Hidden during print) */}
      <div className="no-print flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-zinc-200">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white shadow-md">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                  Rekapan Semua Transaksi Harian
                </h1>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-300">
                  JURNAL TERPADU
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Pusat rekapan lengkap seluruh transaksi kasir, pembelian kulakan supplier, pembelian hasil bumi, kasbon uang, bayar bon, upah &amp; beban operasional divisi
              </p>
            </div>
          </div>
        </div>

        {/* Top Control Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => {
              loadData();
              if (onRefreshParent) onRefreshParent();
            }}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            title="Muat ulang seluruh data transaksi"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-600' : 'text-zinc-500'}`} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredTransactions.length === 0}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Download file CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setPdfModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            title="Unduh Laporan Bulanan / Harian dalam format PDF untuk arsip fisik atau audit eksternal"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Export PDF (Bulanan / Audit)</span>
          </button>

          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            title="Bagikan link laporan ke user lain (Hanya Baca / Read-Only)"
          >
            <Share2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Bagikan Link</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-xs font-bold shadow-sm transition-colors cursor-pointer"
            title="Cetak tampilan rekapan ke printer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Rekap</span>
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards for Active Date */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Transaksi */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 text-zinc-500 text-xs min-w-0">
            <span className="font-semibold truncate">Total Transaksi</span>
            <Receipt className="w-4 h-4 text-zinc-400 shrink-0" />
          </div>
          <div className="mt-2 min-w-0">
            <div className="text-2xl font-black text-zinc-900 font-mono tabular-nums truncate whitespace-nowrap">
              {computedSummary.totalTransaksi}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {activePeriodDisplay}
            </div>
          </div>
        </div>

        {/* Card 2: Uang Masuk */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-gradient-to-b from-white to-emerald-50/30 shadow-2xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1.5 text-emerald-700 text-xs min-w-0">
            <span className="font-semibold flex items-center space-x-1 min-w-0 truncate">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">Uang Masuk (Kas &amp; Bank)</span>
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded shrink-0">
              {computedSummary.masukCount} tx
            </span>
          </div>
          <div className="mt-2 min-w-0">
            <div
              className="text-lg sm:text-xl font-black text-emerald-700 font-mono tabular-nums truncate whitespace-nowrap"
              title={`+${formatRupiah(computedSummary.totalMasuk)}`}
            >
              +{formatRupiahSingkat(computedSummary.totalMasuk)}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
              Penjualan tunai, pelunasan bon
            </div>
          </div>
        </div>

        {/* Card 3: Uang Keluar */}
        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-gradient-to-b from-white to-rose-50/30 shadow-2xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1.5 text-rose-700 text-xs min-w-0">
            <span className="font-semibold flex items-center space-x-1 min-w-0 truncate">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="truncate">Uang Keluar (Belanja &amp; Biaya)</span>
            </span>
            <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.2 rounded shrink-0">
              {computedSummary.keluarCount} tx
            </span>
          </div>
          <div className="mt-2 min-w-0">
            <div
              className="text-lg sm:text-xl font-black text-rose-700 font-mono tabular-nums truncate whitespace-nowrap"
              title={`-${formatRupiah(Math.abs(computedSummary.totalKeluar))}`}
            >
              -{formatRupiahSingkat(Math.abs(computedSummary.totalKeluar))}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
              Beli TBS, kulakan, bon, biaya divisi
            </div>
          </div>
        </div>

        {/* Card 4: Net Cashflow */}
        <div
          className={`bg-white p-4 rounded-xl border shadow-2xs flex flex-col justify-between min-w-0 overflow-hidden ${
            computedSummary.netCashflow >= 0
              ? 'border-blue-200 bg-gradient-to-b from-white to-blue-50/30'
              : 'border-amber-200 bg-gradient-to-b from-white to-amber-50/30'
          }`}
        >
          <div className="flex items-center justify-between gap-1.5 text-zinc-600 text-xs min-w-0">
            <span className="font-semibold flex items-center space-x-1 min-w-0 truncate">
              {computedSummary.netCashflow >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              )}
              <span className="truncate">Arus Kas Bersih (Net)</span>
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                computedSummary.netCashflow >= 0
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {computedSummary.netCashflow >= 0 ? 'SURPLUS' : 'DEFISIT'}
            </span>
          </div>
          <div className="mt-2 min-w-0">
            <div
              className={`text-lg sm:text-xl font-black font-mono tabular-nums truncate whitespace-nowrap ${
                computedSummary.netCashflow >= 0 ? 'text-blue-700' : 'text-amber-700'
              }`}
              title={`${computedSummary.netCashflow >= 0 ? '+' : ''}${formatRupiah(computedSummary.netCashflow)}`}
            >
              {computedSummary.netCashflow >= 0 ? '+' : ''}
              {formatRupiahSingkat(computedSummary.netCashflow)}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
              Selisih masuk dikurangi keluar
            </div>
          </div>
        </div>

        {/* Card 5: Non-Tunai / Bon Piutang */}
        <div className="col-span-2 lg:col-span-1 bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1.5 text-zinc-600 text-xs min-w-0">
            <span className="font-semibold flex items-center space-x-1 min-w-0 truncate">
              <HandCoins className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="truncate">Piutang / Kasbon Baru</span>
            </span>
            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded shrink-0">
              {computedSummary.nonTunaiCount} tx
            </span>
          </div>
          <div className="mt-2 min-w-0">
            <div
              className="text-lg sm:text-xl font-black text-purple-700 font-mono tabular-nums truncate whitespace-nowrap"
              title={formatRupiah(computedSummary.totalNonTunai)}
            >
              {formatRupiahSingkat(computedSummary.totalNonTunai)}
            </div>
            <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
              Bon barang toko &amp; hutang tempo
            </div>
          </div>
        </div>
      </div>

      {/* 3. MULTI-LEVEL FILTER CONTROLS (Hari, Arus Uang, Jenis Transaksi, Nama, Pencarian Transaksi) */}
      <div className="no-print bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
          <div className="flex items-center space-x-2 text-xs font-bold text-zinc-800 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-cyan-600" />
            <span>Panel Filter &amp; Pencarian Terpadu</span>
          </div>
          {(selectedDateMode !== 'HARI_INI' ||
            filterArusUang !== 'ALL' ||
            filterJenis !== 'ALL' ||
            filterNama !== 'ALL' ||
            searchQueryNama !== '' ||
            searchTransaksi !== '') && (
            <button
              type="button"
              onClick={() => {
                setSelectedDateMode('HARI_INI');
                setCustomDate(getTodayDmy());
                setFilterArusUang('ALL');
                setFilterJenis('ALL');
                setFilterNama('ALL');
                setSearchQueryNama('');
                setSearchTransaksi('');
              }}
              className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
            >
              Reset Semua Filter
            </button>
          )}
        </div>

        {/* Row 1: Filter Berdasarkan Hari / Bulan / Tanggal */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-600" />
              <span>1. Filter Berdasarkan Periode (Harian / Bulanan / Arsip):</span>
            </span>
            <span className="text-[11px] font-mono font-bold text-cyan-700">
              Aktif: {activePeriodDisplay}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedDateMode('HARI_INI')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDateMode === 'HARI_INI'
                  ? 'bg-cyan-700 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Hari Ini ({getTodayDmy()})
            </button>

            <button
              type="button"
              onClick={() => setSelectedDateMode('KEMARIN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDateMode === 'KEMARIN'
                  ? 'bg-cyan-700 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Kemarin ({getYesterdayDmy()})
            </button>

            <div className="flex items-center space-x-1.5 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded-lg">
              <label htmlFor="custom-tx-date" className="text-[11px] text-zinc-600 font-medium whitespace-nowrap">
                Pilih Tanggal:
              </label>
              <input
                id="custom-tx-date"
                type="date"
                value={toIsoInputDate(customDate)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setCustomDate(fromIsoInputDate(val));
                    setSelectedDateMode('PILIH_TANGGAL');
                  }
                }}
                className="text-xs font-mono bg-white border border-zinc-300 rounded px-2 py-0.5 text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              />
            </div>

            {/* Filter Laporan Bulanan */}
            <div
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                selectedDateMode === 'BULANAN'
                  ? 'bg-rose-50 border-rose-300 ring-1 ring-rose-500/30'
                  : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedDateMode('BULANAN')}
                className={`text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                  selectedDateMode === 'BULANAN' ? 'text-rose-800' : 'text-zinc-700 hover:text-rose-700'
                }`}
              >
                Laporan Bulanan:
              </button>
              <select
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setSelectedDateMode('BULANAN');
                }}
                aria-label="Pilih Bulan Laporan"
                className="text-xs bg-white border border-zinc-300 rounded px-2 py-0.5 text-zinc-800 font-semibold focus:outline-hidden focus:ring-1 focus:ring-rose-500 cursor-pointer"
              >
                {Object.entries(NAMA_BULAN_INDO).map(([kode, nama]) => (
                  <option key={kode} value={kode}>
                    {nama}
                  </option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setSelectedDateMode('BULANAN');
                }}
                aria-label="Pilih Tahun Laporan"
                className="text-xs font-mono bg-white border border-zinc-300 rounded px-2 py-0.5 text-zinc-800 font-bold focus:outline-hidden focus:ring-1 focus:ring-rose-500 cursor-pointer"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              {selectedDateMode === 'BULANAN' && (
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(true)}
                  className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-700 hover:bg-rose-800 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                  title="Unduh PDF Laporan Bulanan ini"
                >
                  <FileDown className="w-3 h-3" />
                  <span>PDF</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedDateMode('SEMUA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedDateMode === 'SEMUA'
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Semua Hari (Arsip Total)
            </button>

            {/* Quick dropdown for dates recorded in database */}
            {rekapData?.daftarTanggalTersedia && rekapData.daftarTanggalTersedia.length > 0 && (
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-zinc-400">Atau pilih dari riwayat:</span>
                <select
                  value={selectedDateMode === 'PILIH_TANGGAL' ? customDate : 'ALL'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'ALL') {
                      setSelectedDateMode('SEMUA');
                    } else {
                      setCustomDate(val);
                      setSelectedDateMode('PILIH_TANGGAL');
                    }
                  }}
                  className="text-xs border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-800"
                >
                  <option value="ALL">-- Pilih Tanggal Tersedia --</option>
                  {rekapData.daftarTanggalTersedia.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Filter Berdasarkan Arus Uang (Masuk atau Keluar) */}
        <div className="space-y-1.5 pt-2 border-t border-zinc-100">
          <div className="text-xs font-semibold text-zinc-700 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>2. Filter Berdasarkan Arus Uang (Uang Masuk / Keluar / Mutasi):</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterArusUang('ALL')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                filterArusUang === 'ALL'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Semua Arus Uang ({rekapData?.transactions.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setFilterArusUang('MASUK')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
                filterArusUang === 'MASUK'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Uang Masuk / Penerimaan (+)</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterArusUang('KELUAR')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
                filterArusUang === 'KELUAR'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Uang Keluar / Biaya &amp; Belanja (-)</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterArusUang('MUTASI')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
                filterArusUang === 'MUTASI'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Mutasi Antar Rekening</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterArusUang('NON_TUNAI')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
                filterArusUang === 'NON_TUNAI'
                  ? 'bg-purple-700 text-white shadow-xs'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <HandCoins className="w-3.5 h-3.5" />
              <span>Non-Tunai / Bon Piutang</span>
            </button>
          </div>
        </div>

        {/* Row 3: Filter Berdasarkan Jenis Transaksi, Berdasarkan Nama, dan Pencarian Transaksi */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
          {/* 3.1 Jenis Transaksi */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-cyan-600" />
              <span>3. Filter Jenis Transaksi:</span>
            </label>
            <select
              value={filterJenis}
              onChange={(e) => setFilterJenis(e.target.value)}
              className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-800 focus:ring-1 focus:ring-cyan-500"
            >
              <option value="ALL">-- Semua Jenis Transaksi --</option>
              <option value="PENJUALAN">Penjualan Toko / Nego (Toko)</option>
              <option value="PENJUALAN_HASIL_BUMI">Penjualan Hasil Bumi (Keluar Gudang)</option>
              <option value="PEMBELIAN_HASIL_BUMI">Pembelian Hasil Bumi (Sawit/TBS/Kopi)</option>
              <option value="PEMBELIAN_BARANG">Kulakan Supplier / Distributor</option>
              <option value="KASBON_UANG">Kasbon Uang &amp; Pinjaman Tunai</option>
              <option value="BAYAR_BON">Pembayaran Bon (Pelunasan Piutang)</option>
              <option value="PENGELUARAN_DIVISI">Biaya &amp; Beban Operasional Divisi</option>
              <option value="PENCAIRAN_TITIPAN">Pencairan Titipan Hasil Bumi</option>
              <option value="UPAH_HARIAN">Upah Harian Karyawan</option>
              <option value="PENGGAJIAN">Gaji Bulanan Karyawan</option>
              <option value="TRANSFER_REKENING">Transfer Antar Rekening</option>
            </select>
          </div>

          {/* 3.2 Filter Berdasarkan Nama */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>4. Filter Berdasarkan Nama (Mitra/Karyawan/Vendor):</span>
            </label>
            <div className="flex space-x-1.5">
              <select
                value={filterNama}
                onChange={(e) => {
                  setFilterNama(e.target.value);
                  setSearchQueryNama('');
                }}
                className="w-1/2 text-xs border border-zinc-300 rounded-lg px-2.5 py-2 bg-white text-zinc-800 focus:ring-1 focus:ring-cyan-500"
              >
                <option value="ALL">Semua Nama</option>
                {rekapData?.daftarPihakTerkait.map((nama) => (
                  <option key={nama} value={nama}>
                    {nama}
                  </option>
                ))}
              </select>
              <div className="relative w-1/2">
                <input
                  type="text"
                  placeholder="Ketik nama..."
                  value={searchQueryNama}
                  onChange={(e) => {
                    setSearchQueryNama(e.target.value);
                    if (e.target.value) setFilterNama('ALL');
                  }}
                  className="w-full text-xs pl-7 pr-2.5 py-2 border border-zinc-300 rounded-lg text-zinc-800 placeholder-zinc-400 focus:ring-1 focus:ring-cyan-500"
                />
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2.5" />
              </div>
            </div>
          </div>

          {/* 3.3 Pencarian Berdasarkan Transaksi */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-700 flex items-center space-x-1">
              <Search className="w-3.5 h-3.5 text-indigo-600" />
              <span>5. Cari Transaksi (ID, Faktur, Rekening, Rincian):</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Cari ID transaksi, no nota, rekening..."
                value={searchTransaksi}
                onChange={(e) => setSearchTransaksi(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-2 border border-zinc-300 rounded-lg text-zinc-800 placeholder-zinc-400 focus:ring-1 focus:ring-cyan-500"
              />
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              {searchTransaksi && (
                <button
                  type="button"
                  onClick={() => setSearchTransaksi('')}
                  className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. TRANSACTIONS TABLE */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        {/* Table Title Bar */}
        <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-zinc-900 text-sm">
                Daftar Jurnal Transaksi
              </span>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-800">
                {filteredTransactions.length} baris transaksi
              </span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">
              Periode:{' '}
              <span className="font-semibold text-zinc-700">
                {activePeriodDisplay}
              </span>
              {filterArusUang !== 'ALL' && ` · Arus: ${filterArusUang}`}
              {filterJenis !== 'ALL' && ` · Jenis: ${filterJenis}`}
              {filterNama !== 'ALL' && ` · Nama: ${filterNama}`}
            </div>
          </div>

          <div className="text-right text-xs">
            <span className="text-zinc-500">Total Perputaran Uang Terfilter: </span>
            <span className="font-bold text-zinc-900 font-mono text-sm">
              {formatRupiah(computedSummary.totalMasuk + computedSummary.totalKeluar)}
            </span>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-100 text-zinc-700 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200">
              <tr>
                <th className="py-3 px-3.5 whitespace-nowrap">NO &amp; ID TRANSAKSI</th>
                <th className="py-3 px-3.5 whitespace-nowrap">WAKTU (WIB)</th>
                <th className="py-3 px-3.5 whitespace-nowrap">JENIS TRANSAKSI</th>
                <th className="py-3 px-3.5">NAMA / PIHAK TERKAIT</th>
                <th className="py-3 px-3.5 min-w-[200px]">DESKRIPSI &amp; RINCIAN</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">ARUS UANG</th>
                <th className="py-3 px-3.5 whitespace-nowrap">REKENING TERLIBAT</th>
                <th className="py-3 px-3.5 text-right whitespace-nowrap">NOMINAL (RP)</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">BUKTI NOTA</th>
                <th className="py-3 px-3.5 text-center whitespace-nowrap">STATUS</th>
                {!readOnly && (
                  <th className="py-3 px-3.5 text-center whitespace-nowrap">AKSI</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={readOnly ? 10 : 11} className="py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-cyan-600" />
                      <span className="text-xs font-semibold">Memuat jurnal transaksi...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={readOnly ? 10 : 11} className="py-12 text-center text-zinc-400">
                    <div className="flex flex-col items-center justify-center space-y-2 max-w-sm mx-auto">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400">
                        <Search className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-zinc-600">Tidak ada transaksi ditemukan</span>
                      <p className="text-[11px] text-zinc-400">
                        Tidak ada catatan transaksi yang cocok untuk periode {activePeriodDisplay} dan kriteria filter yang dipilih. Coba ganti filter periode atau klik "Semua Hari".
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedTransactions.map((tx, idx) => {
                  return (
                    <tr
                      key={`${tx.id}-${idx}`}
                      className="hover:bg-zinc-50/80 transition-colors"
                    >
                      {/* No & ID */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-mono font-bold text-zinc-900 text-xs">{tx.id}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">#{idx + 1}</div>
                      </td>

                      {/* Tanggal & Jam */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="font-medium text-zinc-800">{tx.tanggal}</div>
                        <div className="text-[10px] text-zinc-500 font-mono flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-zinc-400 inline" />
                          <span>{tx.jam} WIB</span>
                        </div>
                      </td>

                      {/* Jenis Transaksi */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tx.jenis === 'PENJUALAN'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : tx.jenis === 'PENJUALAN_HASIL_BUMI'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-400'
                              : tx.jenis === 'PEMBELIAN_HASIL_BUMI'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : tx.jenis === 'PEMBELIAN_BARANG'
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                              : tx.jenis === 'KASBON_UANG'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : tx.jenis === 'BAYAR_BON'
                              ? 'bg-teal-100 text-teal-800 border border-teal-300'
                              : tx.jenis === 'PENGELUARAN_DIVISI'
                              ? 'bg-rose-100 text-rose-900 border border-rose-300'
                              : tx.jenis === 'PENCAIRAN_TITIPAN'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : tx.jenis === 'UPAH_HARIAN' || tx.jenis === 'PENGGAJIAN'
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : 'bg-sky-100 text-sky-800 border border-sky-300'
                          }`}
                        >
                          <span>{tx.jenisLabel}</span>
                        </span>
                      </td>

                      {/* Pihak Terkait (Nama) */}
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-zinc-900 text-xs flex items-center space-x-1">
                          <User className="w-3 h-3 text-zinc-400 shrink-0" />
                          <span>{tx.pihakTerkait}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 font-semibold uppercase">
                          {tx.kategoriPihak}
                          {tx.divisi && ` · ${tx.divisi}`}
                        </div>
                      </td>

                      {/* Deskripsi */}
                      <td className="py-3 px-3.5 text-zinc-700">
                        <div className="text-xs font-medium leading-relaxed">{tx.deskripsi}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">Metode: {tx.metode}</div>
                      </td>

                      {/* Arus Uang */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center space-x-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                            tx.arusUang === 'MASUK'
                              ? 'bg-emerald-600 text-white shadow-2xs'
                              : tx.arusUang === 'KELUAR'
                              ? 'bg-rose-600 text-white shadow-2xs'
                              : tx.arusUang === 'MUTASI'
                              ? 'bg-sky-600 text-white'
                              : 'bg-purple-600 text-white'
                          }`}
                        >
                          {tx.arusUang === 'MASUK' ? (
                            <>
                              <ArrowDownLeft className="w-3 h-3" />
                              <span>MASUK (+)</span>
                            </>
                          ) : tx.arusUang === 'KELUAR' ? (
                            <>
                              <ArrowUpRight className="w-3 h-3" />
                              <span>KELUAR (-)</span>
                            </>
                          ) : tx.arusUang === 'MUTASI' ? (
                            <>
                              <ArrowLeftRight className="w-3 h-3" />
                              <span>MUTASI</span>
                            </>
                          ) : (
                            <>
                              <HandCoins className="w-3 h-3" />
                              <span>BON / TITIP</span>
                            </>
                          )}
                        </span>
                      </td>

                      {/* Rekening Terlibat */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-zinc-600 text-xs">
                        {tx.rekening}
                      </td>

                      {/* Nominal */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div
                          className={`font-mono font-bold text-xs ${
                            tx.arusUang === 'MASUK'
                              ? 'text-emerald-700'
                              : tx.arusUang === 'KELUAR'
                              ? 'text-rose-700'
                              : 'text-zinc-900'
                          }`}
                        >
                          {tx.arusUang === 'MASUK' ? '+' : tx.arusUang === 'KELUAR' ? '-' : ''}
                          {formatRupiah(tx.nominal)}
                        </div>
                      </td>

                      {/* Bukti Nota */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        {tx.fotoBukti ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                src: tx.fotoBukti!,
                                title: `Bukti Fisik Transaksi ${tx.id} (${tx.pihakTerkait})`,
                              })
                            }
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-md font-bold text-[10px] cursor-pointer transition-colors shadow-2xs"
                            title="Klik untuk membuka foto bukti nota fisik"
                          >
                            <Image className="w-3 h-3 text-purple-600" />
                            <span>Lihat Nota</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-zinc-400 italic">Tidak ada foto</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            tx.status === 'LUNAS' || tx.status === 'BERHASIL' || tx.status === 'SELESAI' || tx.status === 'DIBAYAR'
                              ? 'bg-emerald-100 text-emerald-800'
                              : tx.status === 'SEBAGIAN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>

                      {/* Aksi Edit Detail (Hanya Kasir) */}
                      {!readOnly && (
                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setEditModalTarget({ id: tx.id, jenis: tx.jenis })}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-900 text-zinc-800 hover:text-white border border-zinc-300 hover:border-zinc-900 rounded-md font-semibold text-[11px] transition-colors cursor-pointer"
                            title="Edit detail nominal, tonase, qty, harga, rekening, atau tanggal transaksi"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit Detail</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Table Footer Summary */}
            {filteredTransactions.length > 0 && (
              <tfoot className="bg-zinc-100 border-t-2 border-zinc-300 font-bold text-xs text-zinc-900">
                <tr>
                  <td colSpan={5} className="py-3 px-3.5 text-left">
                    TOTAL KESELURUHAN ({filteredTransactions.length} Transaksi Terfilter)
                  </td>
                  <td className="py-3 px-3.5 text-center">
                    <span className="text-[10px] bg-zinc-200 text-zinc-800 px-2 py-0.5 rounded">
                      Rekap Arus
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-right text-zinc-500 font-normal">
                    Masuk: +{formatRupiah(computedSummary.totalMasuk)} | Keluar: -{formatRupiah(computedSummary.totalKeluar)}
                  </td>
                  <td className="py-3 px-3.5 text-right font-mono text-xs font-black text-blue-900">
                    Net: {computedSummary.netCashflow >= 0 ? '+' : ''}
                    {formatRupiah(computedSummary.netCashflow)}
                  </td>
                  <td colSpan={readOnly ? 2 : 3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {filteredTransactions.length > visibleLimit && (
          <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
            <span>
              Menampilkan <strong>{displayedTransactions.length}</strong> dari{' '}
              <strong>{filteredTransactions.length}</strong> transaksi
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 100)}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-100 border border-zinc-300 font-semibold text-zinc-800 cursor-pointer"
              >
                Tampilkan +100 Baris
              </button>
              <button
                type="button"
                onClick={() => setVisibleLimit(filteredTransactions.length)}
                className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-semibold cursor-pointer"
              >
                Tampilkan Semua
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. LIGHTBOX PREVIEW MODAL FOR FOTO BUKTI NOTA */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-zinc-200 animate-in fade-in zoom-in duration-150">
            <div className="p-3.5 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Image className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-xs truncate max-w-md">{previewImage.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-zinc-400 hover:text-white p-1 rounded-md cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-zinc-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewImage.src}
                alt="Foto Nota Bukti Fisik"
                className="max-h-[70vh] w-auto object-contain rounded-lg border border-zinc-800"
              />
            </div>
            <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
              <span>Bukti fisik nota terverifikasi tersimpan di sistem ERP Wijaya Agro.</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold text-xs cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Bagikan Link Rekap */}
      <ShareLinkModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title="Bagikan Rekapitulasi Transaksi"
        subtitle="Tautan publik resmi khusus penerima (Hanya Baca / Read-Only)"
        shareType="rekap-harian"
        targetDate={activeTanggalParam}
        targetName={`Rekap Transaksi ${activePeriodDisplay}`}
      />

      {/* Modal Ekspor Laporan PDF (Bulanan / Arsip Fisik / Audit Eksternal) */}
      <ExportLaporanPdfModal
        isOpen={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        currentFilteredTransactions={filteredTransactions}
        currentPeriodLabel={activePeriodDisplay}
        currentFilterSummary={activeFilterSummary}
        initialMonth={selectedMonth}
        initialYear={selectedYear}
        availableYears={availableYears}
      />

      {/* Modal Universal Edit Detail Setiap Transaksi (Hanya Kasir) */}
      {!readOnly && (
        <ModalEditTransaksiUniversal
          isOpen={Boolean(editModalTarget)}
          transactionId={editModalTarget?.id || null}
          jenisHint={editModalTarget?.jenis}
          onClose={() => setEditModalTarget(null)}
          onSuccess={() => {
            loadData();
            onRefreshParent?.();
          }}
        />
      )}
    </div>
  );
};
