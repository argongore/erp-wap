import React, { useState, useEffect, useMemo } from 'react';
import {
  FileDown,
  X,
  Calendar,
  CheckCircle2,
  RefreshCw,
  FileText,
  SlidersHorizontal,
  UserCheck,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { ProfilPerusahaan, UnifiedTransactionItem } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import {
  exportRekapTransaksiToPdf,
  extractDateParts,
  NAMA_BULAN_INDO,
} from '../../utils/exportRekapTransaksiPdf.ts';

interface ExportLaporanPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Currently filtered transactions shown on the main table */
  currentFilteredTransactions: UnifiedTransactionItem[];
  /** Human-readable description of the current view's period */
  currentPeriodLabel: string;
  /** Human-readable description of current active sub-filters */
  currentFilterSummary: string;
  /** Default month ('01'..'12') from main view */
  initialMonth: string;
  /** Default year ('2026', etc.) from main view */
  initialYear: string;
  /** Available years derived from recorded transactions */
  availableYears: string[];
}

type ExportScopeMode = 'BULANAN_AUDIT' | 'SESUAI_FILTER_SAAT_INI' | 'RENTANG_TANGGAL';

function getTodayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getFirstDayOfMonthIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function formatIsoToDmy(iso: string): string {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return iso;
}

export const ExportLaporanPdfModal: React.FC<ExportLaporanPdfModalProps> = ({
  isOpen,
  onClose,
  currentFilteredTransactions,
  currentPeriodLabel,
  currentFilterSummary,
  initialMonth,
  initialYear,
  availableYears,
}) => {
  const [scopeMode, setScopeMode] = useState<ExportScopeMode>('BULANAN_AUDIT');
  const [bulan, setBulan] = useState<string>(initialMonth);
  const [tahun, setTahun] = useState<string>(initialYear);
  const [startDateIso, setStartDateIso] = useState<string>(getFirstDayOfMonthIso());
  const [endDateIso, setEndDateIso] = useState<string>(getTodayIso());

  // Document layout & audit options
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [includeRekapKategoriRekening, setIncludeRekapKategoriRekening] = useState<boolean>(true);
  const [includeTandaTangan, setIncludeTandaTangan] = useState<boolean>(true);

  // Signatories
  const [namaStafKeuangan, setNamaStafKeuangan] = useState<string>('');
  const [namaPemeriksaAudit, setNamaPemeriksaAudit] = useState<string>('');
  const [namaPimpinan, setNamaPimpinan] = useState<string>('');

  // Full archive cache for Monthly & Custom Date Range modes
  const [allTransactions, setAllTransactions] = useState<UnifiedTransactionItem[]>([]);
  const [loadingArchive, setLoadingArchive] = useState<boolean>(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastExportResult, setLastExportResult] = useState<{ fileName: string; totalRows: number } | null>(null);

  // Sync initial month/year when modal opens
  useEffect(() => {
    if (isOpen) {
      setBulan(initialMonth);
      setTahun(initialYear);
      setLastExportResult(null);
      setArchiveError(null);
    }
  }, [isOpen, initialMonth, initialYear]);

  // Fetch complete transaction dataset & company profile when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const fetchMasterData = async () => {
      try {
        setLoadingArchive(true);
        setArchiveError(null);
        const [allRes, profilRes] = await Promise.all([
          api.getSemuaTransaksi({ tanggal: 'ALL' }),
          api.getProfilPerusahaan().catch(() => null),
        ]);
        if (!cancelled) {
          setAllTransactions(allRes.transactions || []);
          if (profilRes) {
            setProfilPerusahaan(profilRes);
            setNamaPimpinan((prev) => prev || profilRes.penanggungJawab || '');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setArchiveError(err.message || 'Gagal memuat arsip transaksi lengkap dari server.');
        }
      } finally {
        if (!cancelled) {
          setLoadingArchive(false);
        }
      }
    };

    fetchMasterData();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Combine available years from props + fetched archive + standard audit years
  const yearOptions = useMemo(() => {
    const set = new Set<string>(availableYears);
    const currentY = String(new Date().getFullYear());
    set.add(currentY);
    set.add(String(Number(currentY) - 1));
    set.add(String(Number(currentY) - 2));
    allTransactions.forEach((tx) => {
      const parts = extractDateParts(tx.tanggal);
      if (parts?.year) set.add(parts.year);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableYears, allTransactions]);

  // Compute target transactions based on selected scopeMode
  const targetTransactions = useMemo(() => {
    if (scopeMode === 'SESUAI_FILTER_SAAT_INI') {
      return currentFilteredTransactions;
    }

    if (scopeMode === 'BULANAN_AUDIT') {
      return allTransactions.filter((tx) => {
        const parts = extractDateParts(tx.tanggal);
        if (!parts) return false;
        return parts.month === bulan && parts.year === tahun;
      });
    }

    // RENTANG_TANGGAL
    return allTransactions.filter((tx) => {
      const parts = extractDateParts(tx.tanggal);
      if (!parts) return false;
      const txIso = `${parts.year}-${parts.month}-${parts.day}`;
      if (startDateIso && txIso < startDateIso) return false;
      if (endDateIso && txIso > endDateIso) return false;
      return true;
    });
  }, [
    scopeMode,
    currentFilteredTransactions,
    allTransactions,
    bulan,
    tahun,
    startDateIso,
    endDateIso,
  ]);

  // Live preview metrics for selected export scope
  const previewMetrics = useMemo(() => {
    const masuk = targetTransactions.reduce((s, t) => s + (t.nominalMasuk || 0), 0);
    const keluar = targetTransactions.reduce((s, t) => s + (t.nominalKeluar || 0), 0);
    const nonTunai = targetTransactions
      .filter((t) => t.arusUang === 'NON_TUNAI')
      .reduce((s, t) => s + (t.nominal || 0), 0);
    return {
      count: targetTransactions.length,
      masuk,
      keluar,
      net: masuk - keluar,
      nonTunai,
    };
  }, [targetTransactions]);

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    setIsExporting(true);
    setLastExportResult(null);

    try {
      const namaBulan = NAMA_BULAN_INDO[bulan] || bulan;
      let periodeLabel = currentPeriodLabel;
      let jenisDokumenLabel = 'JURNAL REKAPITULASI TRANSAKSI KEUANGAN';
      let fileSlug = currentPeriodLabel.replace(/\s+/g, '_');
      let filterKeterangan = currentFilterSummary;

      if (scopeMode === 'BULANAN_AUDIT') {
        const lastDay = new Date(Number(tahun), Number(bulan), 0).getDate();
        periodeLabel = `BULAN ${namaBulan.toUpperCase()} ${tahun} (01/${bulan}/${tahun} s/d ${String(lastDay).padStart(2, '0')}/${bulan}/${tahun})`;
        jenisDokumenLabel = 'LAPORAN BULANAN — ARSIP FISIK & AUDIT EKSTERNAL';
        fileSlug = `Bulanan_${namaBulan}_${tahun}`;
        filterKeterangan = 'Seluruh Transaksi Bulanan Terpadu (Kasir, Pembelian Hasil Bumi, Kulakan, Kasbon, Gaji & Beban Divisi)';
      } else if (scopeMode === 'RENTANG_TANGGAL') {
        const dStart = formatIsoToDmy(startDateIso);
        const dEnd = formatIsoToDmy(endDateIso);
        periodeLabel = `PERIODE ${dStart} s/d ${dEnd}`;
        jenisDokumenLabel = 'LAPORAN PERIODE KHUSUS — ARSIP & AUDIT KEUANGAN';
        fileSlug = `Periode_${startDateIso}_sd_${endDateIso}`;
        filterKeterangan = `Seluruh Transaksi Tercatat dari ${dStart} sampai ${dEnd}`;
      }

      const result = exportRekapTransaksiToPdf(targetTransactions, {
        periodeLabel,
        jenisDokumenLabel,
        fileSlug,
        filterKeterangan,
        orientation,
        sortOrder,
        includeRekapKategoriRekening,
        includeTandaTangan,
        namaStafKeuangan,
        namaPemeriksaAudit,
        namaPimpinan,
        profilPerusahaan,
      });

      setLastExportResult(result);
    } catch (err: any) {
      console.error('PDF export error:', err);
      setArchiveError(err.message || 'Terjadi kesalahan saat membuat dokumen PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-rose-600 text-white">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                Ekspor Laporan PDF — Arsip Fisik &amp; Audit Eksternal
              </h2>
              <p className="text-xs text-zinc-400">
                Unduh dokumen PDF resmi lengkap dengan kop surat, ikhtisar arus kas, rekap kategori &amp; lembar pengesahan
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 max-h-[78vh] overflow-y-auto">
          {archiveError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{archiveError}</span>
            </div>
          )}

          {/* 1. Pilih Cakupan Periode Laporan */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-cyan-700" />
              <span>1. Pilih Jenis &amp; Periode Laporan PDF</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setScopeMode('BULANAN_AUDIT');
                  setSortOrder('ASC');
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scopeMode === 'BULANAN_AUDIT'
                    ? 'border-cyan-700 bg-cyan-50/70 ring-1 ring-cyan-700'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="text-xs font-bold text-zinc-900">Laporan Bulanan</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Standar arsip fisik bulanan &amp; pemeriksaan audit eksternal
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScopeMode('SESUAI_FILTER_SAAT_INI')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scopeMode === 'SESUAI_FILTER_SAAT_INI'
                    ? 'border-cyan-700 bg-cyan-50/70 ring-1 ring-cyan-700'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="text-xs font-bold text-zinc-900">Sesuai Tabel Saat Ini</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Ekspor persis {currentFilteredTransactions.length} baris yang sedang difilter di layar
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScopeMode('RENTANG_TANGGAL');
                  setSortOrder('ASC');
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  scopeMode === 'RENTANG_TANGGAL'
                    ? 'border-cyan-700 bg-cyan-50/70 ring-1 ring-cyan-700'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50'
                }`}
              >
                <div className="text-xs font-bold text-zinc-900">Rentang Tanggal</div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Pilih tanggal awal s/d akhir untuk audit mingguan atau kuartalan
                </div>
              </button>
            </div>

            {/* Sub-selector for BULANAN_AUDIT */}
            {scopeMode === 'BULANAN_AUDIT' && (
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Bulan Laporan Audit
                  </label>
                  <select
                    value={bulan}
                    onChange={(e) => setBulan(e.target.value)}
                    className="w-full text-xs font-semibold border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  >
                    {Object.entries(NAMA_BULAN_INDO).map(([kode, nama]) => (
                      <option key={kode} value={kode}>
                        {kode} — {nama}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Tahun Buku
                  </label>
                  <select
                    value={tahun}
                    onChange={(e) => setTahun(e.target.value)}
                    className="w-full text-xs font-mono font-bold border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        Tahun {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Sub-selector for RENTANG_TANGGAL */}
            {scopeMode === 'RENTANG_TANGGAL' && (
              <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Dari Tanggal
                  </label>
                  <input
                    type="date"
                    value={startDateIso}
                    onChange={(e) => setStartDateIso(e.target.value)}
                    className="w-full text-xs font-mono border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Sampai Tanggal
                  </label>
                  <input
                    type="date"
                    value={endDateIso}
                    onChange={(e) => setEndDateIso(e.target.value)}
                    className="w-full text-xs font-mono border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  />
                </div>
              </div>
            )}

            {/* Info for SESUAI_FILTER_SAAT_INI */}
            {scopeMode === 'SESUAI_FILTER_SAAT_INI' && (
              <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs text-zinc-700 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-zinc-900">Periode Aktif:</span> {currentPeriodLabel}
                  <span className="text-zinc-400 mx-1.5">•</span>
                  <span className="text-zinc-600">{currentFilterSummary}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Pratinjau Ringkasan Data yang Akan Diekspor */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-800 flex items-center space-x-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-700" />
                <span>Pratinjau Ikhtisar Data Dokumen PDF</span>
              </span>
              {loadingArchive && scopeMode !== 'SESUAI_FILTER_SAAT_INI' && (
                <span className="inline-flex items-center space-x-1 text-[11px] text-cyan-700 font-semibold">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Memuat arsip...</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-white p-2.5 rounded-lg border border-zinc-200">
                <div className="text-[10px] font-semibold text-zinc-500 uppercase">Baris Jurnal</div>
                <div className="text-sm font-black font-mono tabular-nums text-zinc-900 mt-0.5">
                  {previewMetrics.count} Transaksi
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                <div className="text-[10px] font-semibold text-emerald-700 uppercase flex items-center space-x-1">
                  <ArrowDownLeft className="w-3 h-3" />
                  <span>Uang Masuk</span>
                </div>
                <div className="text-sm font-black font-mono tabular-nums text-emerald-700 mt-0.5">
                  +{formatRupiah(previewMetrics.masuk)}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-rose-200">
                <div className="text-[10px] font-semibold text-rose-700 uppercase flex items-center space-x-1">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>Uang Keluar</span>
                </div>
                <div className="text-sm font-black font-mono tabular-nums text-rose-700 mt-0.5">
                  -{formatRupiah(previewMetrics.keluar)}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-blue-200">
                <div className="text-[10px] font-semibold text-blue-700 uppercase">Arus Kas Bersih</div>
                <div className="text-sm font-black font-mono tabular-nums text-blue-800 mt-0.5">
                  {previewMetrics.net >= 0 ? '+' : '-'}
                  {formatRupiah(Math.abs(previewMetrics.net))}
                </div>
              </div>
            </div>

            {previewMetrics.count === 0 && !loadingArchive && (
              <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Belum ada transaksi tercatat pada periode ini. Anda tetap dapat mengunduh PDF sebagai{' '}
                <span className="font-bold">Laporan Nihil</span> resmi untuk kelengkapan arsip bulanan.
              </div>
            )}
          </div>

          {/* 3. Pengaturan Tata Letak & Struktur Audit */}
          <div className="space-y-3 pt-1 border-t border-zinc-200">
            <div className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center space-x-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-700" />
              <span>2. Format Kertas &amp; Kelengkapan Audit</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Orientasi Kertas A4
                </label>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                >
                  <option value="landscape">A4 Landscape / Mendatar (Rekomendasi Tabel Audit Lengkap)</option>
                  <option value="portrait">A4 Portrait / Tegak (Ringkas untuk Map Binder)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Urutan Kronologi Jurnal
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'ASC' | 'DESC')}
                  className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                >
                  <option value="ASC">Kronologis Tanggal Awal s/d Akhir (Standar Pembukuan &amp; Audit)</option>
                  <option value="DESC">Transaksi Terbaru ke Terlama</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <label className="inline-flex items-center space-x-2 text-xs text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeRekapKategoriRekening}
                  onChange={(e) => setIncludeRekapKategoriRekening(e.target.checked)}
                  className="rounded border-zinc-300 text-cyan-700 focus:ring-cyan-600"
                />
                <span>Sertakan Tabel Ringkasan Kategori &amp; Mutasi Rekening</span>
              </label>

              <label className="inline-flex items-center space-x-2 text-xs text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTandaTangan}
                  onChange={(e) => setIncludeTandaTangan(e.target.checked)}
                  className="rounded border-zinc-300 text-cyan-700 focus:ring-cyan-600"
                />
                <span>Sertakan Kolom Tanda Tangan Pengesahan &amp; Auditor</span>
              </label>
            </div>
          </div>

          {/* 4. Pejabat Penandatangan (Opsional) */}
          {includeTandaTangan && (
            <div className="space-y-2.5 pt-2 border-t border-zinc-200">
              <div className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center space-x-1.5">
                <UserCheck className="w-3.5 h-3.5 text-cyan-700" />
                <span>3. Nama Pejabat Pengesahan (Opsional untuk Arsip Cetak)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                    Staf Keuangan / Kasir
                  </label>
                  <input
                    type="text"
                    value={namaStafKeuangan}
                    onChange={(e) => setNamaStafKeuangan(e.target.value)}
                    placeholder="Kosongkan untuk garis ttd..."
                    className="w-full text-xs border border-zinc-300 rounded-lg px-2.5 py-1.5 text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                    Pemeriksa / Auditor
                  </label>
                  <input
                    type="text"
                    value={namaPemeriksaAudit}
                    onChange={(e) => setNamaPemeriksaAudit(e.target.value)}
                    placeholder="Kosongkan untuk garis ttd..."
                    className="w-full text-xs border border-zinc-300 rounded-lg px-2.5 py-1.5 text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-600 mb-1">
                    Direktur / Pimpinan
                  </label>
                  <input
                    type="text"
                    value={namaPimpinan}
                    onChange={(e) => setNamaPimpinan(e.target.value)}
                    placeholder="Nama Direktur..."
                    className="w-full text-xs border border-zinc-300 rounded-lg px-2.5 py-1.5 text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-cyan-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Confirmation Banner after Download */}
          {lastExportResult && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Dokumen <span className="font-mono font-bold">{lastExportResult.fileName}</span> (
                  {lastExportResult.totalRows} baris jurnal) berhasil diunduh.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isExporting || (loadingArchive && scopeMode !== 'SESUAI_FILTER_SAAT_INI')}
            className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Menyusun Dokumen PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                <span>Unduh Laporan PDF (.pdf)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
