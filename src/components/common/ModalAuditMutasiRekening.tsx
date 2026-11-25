import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Download,
  Filter,
  Landmark,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  api,
  type AuditKategoriBreakdown,
  type AuditMutasiResponse,
  type AuditMutasiTargetType,
} from '../../api/client.ts';
import { formatRupiah } from '../../utils/format.ts';

export interface AuditMutasiTarget {
  type: AuditMutasiTargetType;
  kodeOrNama: string;
  label?: string;
}

interface ModalAuditMutasiRekeningProps {
  target: AuditMutasiTarget | null;
  onClose: () => void;
  onSaldoSynced?: () => void;
}

type SortMode = 'TERBARU' | 'TERLAMA' | 'NOMINAL_TERBESAR';
type ArahFilter = 'ALL' | 'MASUK' | 'KELUAR';

function toDateKeyDmy(tgl?: string): number {
  if (!tgl) return 0;
  const parts = String(tgl).trim().split(/[-/]/);
  if (parts.length !== 3) return 0;
  if (parts[0].length === 4) {
    return Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
  }
  return Number(parts[2]) * 10000 + Number(parts[1]) * 100 + Number(parts[0]);
}

function toDateKeyYmd(ymd?: string): number {
  if (!ymd) return 0;
  const parts = ymd.split('-');
  if (parts.length !== 3) return 0;
  return Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const ModalAuditMutasiRekening: React.FC<ModalAuditMutasiRekeningProps> = ({
  target,
  onClose,
  onSaldoSynced,
}) => {
  const [data, setData] = useState<AuditMutasiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [confirmSync, setConfirmSync] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [arahFilter, setArahFilter] = useState<ArahFilter>('ALL');
  const [kategoriFilter, setKategoriFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('TERBARU');
  const [showBreakdown, setShowBreakdown] = useState(true);

  const loadAudit = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError('');
    setConfirmSync(false);
    try {
      const res =
        target.type === 'DIVISI'
          ? await api.getAuditMutasiDivisi(target.kodeOrNama)
          : await api.getAuditMutasiRekening(target.kodeOrNama);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat data mutasi audit.');
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (!target) {
      setData(null);
      setSyncMessage('');
      setConfirmSync(false);
      return;
    }
    setSearchQuery('');
    setArahFilter('ALL');
    setKategoriFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSortMode('TERBARU');
    setSyncMessage('');
    void loadAudit();
  }, [target, loadAudit]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    arahFilter !== 'ALL' ||
    kategoriFilter !== 'ALL' ||
    startDate !== '' ||
    endDate !== '';

  const resetFilters = () => {
    setSearchQuery('');
    setArahFilter('ALL');
    setKategoriFilter('ALL');
    setStartDate('');
    setEndDate('');
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    const minKey = toDateKeyYmd(startDate);
    const maxKey = toDateKeyYmd(endDate);

    const list = data.mutasi.filter((row) => {
      if (arahFilter === 'MASUK' && row.masuk <= 0) return false;
      if (arahFilter === 'KELUAR' && row.keluar <= 0) return false;
      if (kategoriFilter !== 'ALL' && row.kategori !== kategoriFilter) return false;

      if (minKey > 0 || maxKey > 0) {
        const rk = toDateKeyDmy(row.tanggal);
        if (minKey > 0 && rk < minKey) return false;
        if (maxKey > 0 && rk > maxKey) return false;
      }

      if (q) {
        const nominalStr = String(row.masuk > 0 ? row.masuk : row.keluar);
        const hay = [
          row.refId,
          row.tanggal,
          row.kategoriLabel,
          row.uraian,
          row.pihakTerkait,
          row.divisi,
          row.rekeningTerkait,
          row.metode,
          nominalStr,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortMode === 'TERLAMA') {
      return list; // data.mutasi is already chronological ascending
    }
    if (sortMode === 'NOMINAL_TERBESAR') {
      return [...list].sort((a, b) => {
        const magA = Math.max(a.masuk, a.keluar);
        const magB = Math.max(b.masuk, b.keluar);
        if (magB !== magA) return magB - magA;
        return b.timestampMs - a.timestampMs;
      });
    }
    // TERBARU (reverse chronological)
    return [...list].reverse();
  }, [data, searchQuery, arahFilter, kategoriFilter, startDate, endDate, sortMode]);

  const filteredTotals = useMemo(() => {
    let masuk = 0;
    let keluar = 0;
    for (const r of filteredRows) {
      masuk += r.masuk;
      keluar += r.keluar;
    }
    return { masuk, keluar, net: masuk - keluar };
  }, [filteredRows]);

  const topOutflowCategories = useMemo<AuditKategoriBreakdown[]>(() => {
    if (!data) return [];
    return [...data.ringkasanKategori]
      .filter((k) => k.totalKeluar > 0)
      .sort((a, b) => b.totalKeluar - a.totalKeluar)
      .slice(0, 3);
  }, [data]);

  const handleSinkronSaldo = async () => {
    if (!data || data.targetType !== 'REKENING_KAS') return;
    setSyncing(true);
    setError('');
    try {
      const res = await api.sinkronSaldoRekeningKeMutasi(data.kode);
      setSyncMessage(
        res.message ||
          `Saldo ${res.nama} (${res.kode}) disinkronkan ke ${formatRupiah(res.saldoSesudah)}.`
      );
      setConfirmSync(false);
      await loadAudit();
      onSaldoSynced?.();
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
    } catch (err: any) {
      setError(err?.message || 'Gagal menyinkronkan saldo sistem.');
    } finally {
      setSyncing(false);
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'No',
      'Tanggal',
      'Jam',
      'No Ref',
      'Kategori',
      'Uraian',
      'Pihak Terkait',
      'Divisi',
      'Rekening Terkait',
      'Metode',
      'Masuk (Rp)',
      'Keluar (Rp)',
      'Saldo Berjalan (Rp)',
    ];
    const rows: Array<Array<string | number>> = [
      [
        0,
        data.ledgerStartDate || '-',
        '-',
        'SALDO-AWAL',
        'Saldo Awal',
        `Saldo awal ${data.nama} (${data.kode})`,
        '-',
        '-',
        data.kode,
        '-',
        data.saldoAwal >= 0 ? data.saldoAwal : 0,
        data.saldoAwal < 0 ? Math.abs(data.saldoAwal) : 0,
        data.saldoAwal,
      ],
      ...filteredRows.map((r, idx) => [
        idx + 1,
        r.tanggal,
        r.jam,
        r.refId,
        r.kategoriLabel,
        r.uraian,
        r.pihakTerkait,
        r.divisi,
        r.rekeningTerkait,
        r.metode,
        r.masuk,
        r.keluar,
        r.saldoBerjalan,
      ]),
    ];

    const csvLines = [headers, ...rows].map((line) => line.map(escapeCsvCell).join(','));
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = `${data.targetType}_${data.kode}`.replace(/[^a-zA-Z0-9_-]+/g, '_');
    link.href = url;
    link.download = `MUTASI_AUDIT_${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!target) return null;

  const isDivisi = (data?.targetType || target.type) === 'DIVISI';
  const showSelisihBanner =
    data && data.targetType === 'REKENING_KAS' && Math.abs(data.selisihAudit) > 0;
  const showMinusDiagnostic = data && data.saldoHitungMutasi < 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-[1px] flex items-center justify-center p-2 sm:p-4 print:static print:bg-white print:p-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white text-slate-900 border border-slate-300 rounded-xl shadow-2xl w-full max-w-[1380px] max-h-[94vh] flex flex-col overflow-hidden print:max-h-none print:max-w-none print:shadow-none print:border-0 print:rounded-none">
        {/* Header Bar */}
        <header className="px-5 py-3.5 bg-slate-900 text-white border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 print:bg-white print:text-slate-950 print:border-slate-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 print:hidden">
              {isDivisi ? (
                <Building2 className="w-4.5 h-4.5 text-amber-400" />
              ) : (
                <Landmark className="w-4.5 h-4.5 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-tight truncate">
                {data?.nama || target.label || target.kodeOrNama}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300 print:text-slate-600">
                <span>{isDivisi ? 'Audit Mutasi Divisi' : 'Audit Mutasi Rekening Kas & Bank'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{data?.kode || target.kodeOrNama}</span>
                {data?.nomorRekening && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">No. Rek {data.nomorRekening}</span>
                  </>
                )}
                {data?.atasNama && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>a.n. {data.atasNama}</span>
                  </>
                )}
                {data?.ledgerStartDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Cut-off mulai {data.ledgerStartDate}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!data || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              title="Unduh mutasi sebagai file CSV / Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={!data || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              title="Cetak laporan mutasi audit"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>

            <button
              type="button"
              onClick={() => void loadAudit()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
              title="Muat ulang data mutasi"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Tutup Audit Mutasi (Esc)"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/70 print:bg-white print:p-2 print:overflow-visible">
          {loading && !data ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-3">
              <div className="h-4 w-56 bg-slate-200 rounded animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="h-16 bg-slate-100 rounded border border-slate-200 animate-pulse" />
                ))}
              </div>
              <div className="h-48 bg-slate-100 rounded border border-slate-200 animate-pulse" />
            </div>
          ) : error && !data ? (
            <div className="bg-white border border-rose-200 rounded-lg p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-rose-700">{error}</p>
              <button
                type="button"
                onClick={() => void loadAudit()}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Coba Muat Ulang
              </button>
            </div>
          ) : data ? (
            <>
              {/* Success / Error Inline Feedback */}
              {syncMessage && (
                <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between gap-3 text-xs text-emerald-900">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{syncMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSyncMessage('')}
                    className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              )}

              {error && (
                <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-800 font-medium">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 5-Column Reconciliation Strip */}
              <section className="grid grid-cols-2 lg:grid-cols-5 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200 overflow-hidden">
                <div className="p-3.5">
                  <div className="text-xs text-slate-500 font-medium">Saldo Awal</div>
                  <div className="mt-1 font-mono tabular-nums text-base font-bold text-slate-900">
                    {formatRupiah(data.saldoAwal)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {data.ledgerStartDate ? `Mulai ${data.ledgerStartDate}` : 'Saldo pembukaan'}
                  </div>
                </div>

                <div className="p-3.5">
                  <div className="text-xs text-slate-500 font-medium">Total Masuk (+)</div>
                  <div className="mt-1 font-mono tabular-nums text-base font-bold text-emerald-700">
                    +{formatRupiah(data.totalMasuk)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {data.mutasi.filter((m) => m.masuk > 0).length} transaksi masuk
                  </div>
                </div>

                <div className="p-3.5">
                  <div className="text-xs text-slate-500 font-medium">Total Keluar (−)</div>
                  <div className="mt-1 font-mono tabular-nums text-base font-bold text-rose-700">
                    −{formatRupiah(data.totalKeluar)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {data.mutasi.filter((m) => m.keluar > 0).length} transaksi keluar
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50/70">
                  <div className="text-xs text-slate-600 font-semibold">
                    {isDivisi ? 'Saldo Hitung Divisi' : 'Saldo Hitung Mutasi'}
                  </div>
                  <div
                    className={`mt-1 font-mono tabular-nums text-base font-extrabold ${
                      data.saldoHitungMutasi < 0 ? 'text-rose-700' : 'text-slate-950'
                    }`}
                  >
                    {formatRupiah(data.saldoHitungMutasi)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    Saldo Awal + Masuk − Keluar
                  </div>
                </div>

                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium">
                    <span className="text-slate-500">Saldo Sistem Saat Ini</span>
                    <span
                      className={`font-semibold ${
                        data.statusRekonsiliasi === 'KLOP' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {data.statusRekonsiliasi === 'KLOP' ? 'Klop' : 'Ada Selisih'}
                    </span>
                  </div>
                  <div
                    className={`mt-1 font-mono tabular-nums text-base font-extrabold ${
                      data.saldoTercatatSistem < 0 ? 'text-rose-700' : 'text-slate-950'
                    }`}
                  >
                    {formatRupiah(data.saldoTercatatSistem)}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono tabular-nums text-slate-500">
                    {data.selisihAudit === 0
                      ? 'Selisih: Rp 0 (Sinkron)'
                      : `Selisih: ${data.selisihAudit > 0 ? '+' : ''}${formatRupiah(data.selisihAudit)}`}
                  </div>
                </div>
              </section>

              {/* Reconciliation Alert Banner (when physical cash/bank system balance drifts from ledger) */}
              {showSelisihBanner && (
                <section className="bg-amber-50 border border-amber-300 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-950 space-y-1">
                      <div className="font-bold text-sm">
                        Terdeteksi Selisih Antara Saldo Sistem dan Mutasi Riil sebesar{' '}
                        <span className="font-mono tabular-nums underline">
                          {data.selisihAudit > 0 ? '+' : ''}
                          {formatRupiah(data.selisihAudit)}
                        </span>
                      </div>
                      <p className="text-amber-900 leading-relaxed">
                        Saldo tercatat di Master Rekening adalah{' '}
                        <strong className="font-mono">{formatRupiah(data.saldoTercatatSistem)}</strong>,
                        sedangkan perhitungan ulang seluruh riwayat mutasi (Saldo Awal + Masuk − Keluar)
                        menghasilkan{' '}
                        <strong className="font-mono">{formatRupiah(data.saldoHitungMutasi)}</strong>.
                        Selisih ini biasanya muncul akibat transaksi lama yang pernah dihapus/diedit atau
                        penyesuaian manual sebelumnya.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 print:hidden">
                    {!confirmSync ? (
                      <button
                        type="button"
                        onClick={() => setConfirmSync(true)}
                        className="px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Sinkronkan Saldo ke Hasil Mutasi
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-1.5">
                        <span className="text-xs font-semibold text-amber-950">
                          Ubah ke {formatRupiah(data.saldoHitungMutasi)}?
                        </span>
                        <button
                          type="button"
                          onClick={handleSinkronSaldo}
                          disabled={syncing}
                          className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          {syncing ? 'Menyimpan...' : 'Ya, Sinkronkan'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmSync(false)}
                          disabled={syncing}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Minus Balance Diagnostic Banner */}
              {showMinusDiagnostic && (
                <section className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-rose-900 font-bold text-xs sm:text-sm">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        Analisa Penyebab Saldo Minus ({formatRupiah(data.saldoHitungMutasi)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setArahFilter('KELUAR');
                        setSortMode('NOMINAL_TERBESAR');
                      }}
                      className="text-xs font-semibold text-rose-800 hover:text-rose-950 underline cursor-pointer print:hidden"
                    >
                      Urutkan Pengeluaran Terbesar
                    </button>
                  </div>

                  <p className="text-xs text-rose-900 leading-relaxed">
                    Saldo mutasi menjadi minus karena total uang keluar (
                    <strong className="font-mono">{formatRupiah(data.totalKeluar)}</strong>) lebih besar
                    dari saldo awal + uang masuk (
                    <strong className="font-mono">{formatRupiah(data.saldoAwal + data.totalMasuk)}</strong>).
                    Periksa apakah <strong>Saldo Awal rekening</strong> atau{' '}
                    <strong>Uang Masuk / Pelunasan Buyer</strong> belum diinput, atau cek pos pengeluaran
                    terbesar berikut:
                  </p>

                  {topOutflowCategories.length > 0 && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-xs text-rose-950">
                      {topOutflowCategories.map((cat, idx) => (
                        <button
                          key={cat.kategori}
                          type="button"
                          onClick={() => {
                            setKategoriFilter(
                              kategoriFilter === cat.kategori ? 'ALL' : cat.kategori
                            );
                            setArahFilter('KELUAR');
                            setSortMode('NOMINAL_TERBESAR');
                          }}
                          className="text-left hover:underline cursor-pointer"
                        >
                          <span className="font-semibold">
                            {idx + 1}. {cat.kategoriLabel}:
                          </span>{' '}
                          <span className="font-mono tabular-nums font-bold">
                            −{formatRupiah(cat.totalKeluar)}
                          </span>{' '}
                          <span className="text-rose-700">({cat.jumlahTrx} trx)</span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Category Breakdown Table (Interactive Audit Summary) */}
              {data.ringkasanKategori.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                      <span>Ringkasan Mutasi Per Kategori Transaksi</span>
                      <span className="text-slate-400 font-normal">
                        · Klik baris kategori untuk langsung memfilter daftar mutasi
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBreakdown((v) => !v)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer print:hidden"
                    >
                      {showBreakdown ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>

                  {showBreakdown && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                            <th className="py-2 px-4 text-left font-semibold">Kategori Transaksi</th>
                            <th className="py-2 px-3 text-right font-semibold w-24">Jumlah</th>
                            <th className="py-2 px-3 text-right font-semibold w-40">Total Masuk (+)</th>
                            <th className="py-2 px-3 text-right font-semibold w-40">Total Keluar (−)</th>
                            <th className="py-2 px-4 text-right font-semibold w-44">Dampak Bersih</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.ringkasanKategori.map((kat) => {
                            const active = kategoriFilter === kat.kategori;
                            return (
                              <tr
                                key={kat.kategori}
                                onClick={() =>
                                  setKategoriFilter(active ? 'ALL' : kat.kategori)
                                }
                                className={`cursor-pointer transition-colors ${
                                  active
                                    ? 'bg-emerald-50 font-semibold'
                                    : 'hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2 px-4 text-slate-900">
                                  <span>{kat.kategoriLabel}</span>
                                  {active && (
                                    <span className="ml-2 text-[11px] text-emerald-700 font-semibold">
                                      (Filter aktif)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600">
                                  {kat.jumlahTrx} trx
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-700">
                                  {kat.totalMasuk > 0 ? `+${formatRupiah(kat.totalMasuk)}` : '-'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-rose-700">
                                  {kat.totalKeluar > 0 ? `−${formatRupiah(kat.totalKeluar)}` : '-'}
                                </td>
                                <td
                                  className={`py-2 px-4 text-right font-mono tabular-nums font-bold ${
                                    kat.net > 0
                                      ? 'text-emerald-700'
                                      : kat.net < 0
                                      ? 'text-rose-700'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {kat.net > 0 ? '+' : ''}
                                  {formatRupiah(kat.net)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}

              {/* Filter & Sort Controls */}
              <section className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari no. ref, uraian, mitra, divisi, atau nominal..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-500"
                    />
                  </div>

                  {/* Arah Segmented Control */}
                  <div className="flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg text-xs">
                    {(
                      [
                        { key: 'ALL', label: 'Semua' },
                        { key: 'MASUK', label: 'Masuk (+)' },
                        { key: 'KELUAR', label: 'Keluar (−)' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setArahFilter(opt.key)}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          arahFilter === opt.key
                            ? 'bg-white text-slate-950 shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Category Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      aria-label="Filter Kategori"
                      value={kategoriFilter}
                      onChange={(e) => setKategoriFilter(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none focus:border-slate-500 cursor-pointer"
                    >
                      <option value="ALL">Semua Kategori ({data.ringkasanKategori.length})</option>
                      {data.ringkasanKategori.map((k) => (
                        <option key={k.kategori} value={k.kategori}>
                          {k.kategoriLabel} ({k.jumlahTrx})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <input
                      type="date"
                      aria-label="Dari Tanggal"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-slate-500"
                    />
                    <span className="text-slate-400">s/d</span>
                    <input
                      type="date"
                      aria-label="Sampai Tanggal"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-slate-500"
                    />
                  </div>

                  {/* Sort Mode */}
                  <select
                    aria-label="Urutkan Mutasi"
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-slate-500 cursor-pointer"
                  >
                    <option value="TERBARU">Urutan: Terbaru di Atas</option>
                    <option value="TERLAMA">Urutan: Kronologis (Saldo Berjalan)</option>
                    <option value="NOMINAL_TERBESAR">Urutan: Nominal Terbesar</option>
                  </select>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                {/* Filtered Summary Line */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div>
                    Menampilkan <strong className="text-slate-900 font-mono">{filteredRows.length}</strong>{' '}
                    dari <strong className="text-slate-900 font-mono">{data.jumlahTransaksi}</strong>{' '}
                    mutasi tercatat
                    {sortMode !== 'TERLAMA' && (
                      <span className="text-slate-400">
                        {' '}
                        · Kolom Saldo Berjalan selalu menunjukkan posisi saldo tepat setelah transaksi tsb
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 font-mono tabular-nums">
                    <span className="text-emerald-700 font-semibold">
                      Masuk: +{formatRupiah(filteredTotals.masuk)}
                    </span>
                    <span className="text-rose-700 font-semibold">
                      Keluar: −{formatRupiah(filteredTotals.keluar)}
                    </span>
                    <span
                      className={`font-bold ${
                        filteredTotals.net < 0 ? 'text-rose-700' : 'text-slate-900'
                      }`}
                    >
                      Net: {filteredTotals.net >= 0 ? '+' : ''}
                      {formatRupiah(filteredTotals.net)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Main Chronological Ledger Table */}
              <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[11px]">
                        <th className="py-2.5 px-3 text-center font-bold w-10">No</th>
                        <th className="py-2.5 px-3 text-left font-bold whitespace-nowrap w-28">
                          Tanggal &amp; Jam
                        </th>
                        <th className="py-2.5 px-3 text-left font-bold whitespace-nowrap w-32">
                          No. Ref
                        </th>
                        <th className="py-2.5 px-3 text-left font-bold whitespace-nowrap w-40">
                          Kategori
                        </th>
                        <th className="py-2.5 px-3 text-left font-bold">
                          Uraian &amp; Pihak Terkait
                        </th>
                        <th className="py-2.5 px-3 text-left font-bold whitespace-nowrap w-36">
                          {isDivisi ? 'Rekening' : 'Divisi'}
                        </th>
                        <th className="py-2.5 px-3 text-right font-bold whitespace-nowrap w-36">
                          Masuk (+)
                        </th>
                        <th className="py-2.5 px-3 text-right font-bold whitespace-nowrap w-36">
                          Keluar (−)
                        </th>
                        <th className="py-2.5 px-3 text-right font-bold whitespace-nowrap w-40">
                          Saldo Berjalan
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">
                      {/* Anchor Row: Saldo Awal (shown at top in chronological mode) */}
                      {!hasActiveFilters && sortMode === 'TERLAMA' && (
                        <tr className="bg-slate-50 font-semibold">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">0</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                            {data.ledgerStartDate || 'Awal'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">SALDO-AWAL</td>
                          <td className="py-2.5 px-3 text-slate-700">Saldo Awal</td>
                          <td className="py-2.5 px-3 text-slate-800">
                            Saldo pembukaan {data.nama} ({data.kode})
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">-</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                            {formatRupiah(data.saldoAwal)}
                          </td>
                        </tr>
                      )}

                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-10 px-4 text-center text-slate-500">
                            {data.jumlahTransaksi === 0
                              ? `Belum ada riwayat mutasi transaksi yang tercatat pada ${data.nama}.`
                              : 'Tidak ada mutasi yang cocok dengan filter pencarian saat ini.'}
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row, index) => {
                          const isMasuk = row.masuk > 0;
                          const isBig = Math.max(row.masuk, row.keluar) >= 50_000_000;
                          return (
                            <tr
                              key={row.id}
                              className={`transition-colors ${
                                isBig ? 'bg-amber-50/40 hover:bg-amber-50/80' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-400">
                                {index + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                <div className="font-semibold text-slate-900">{row.tanggal}</div>
                                <div className="text-[11px] text-slate-400">
                                  {row.jam ? row.jam.slice(0, 8) : '-'}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                                {row.refId}
                              </td>
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="flex items-center gap-1.5 text-slate-800 font-medium">
                                  {isMasuk ? (
                                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : (
                                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  )}
                                  <span>{row.kategoriLabel}</span>
                                </div>
                                <div className="text-[11px] text-slate-400 pl-5">{row.metode}</div>
                              </td>
                              <td className="py-2.5 px-3 max-w-[360px]">
                                <div className="text-slate-900 font-medium leading-snug">
                                  {row.uraian}
                                </div>
                                {row.pihakTerkait && row.pihakTerkait !== '-' && (
                                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                                    Pihak: {row.pihakTerkait}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 max-w-[160px] truncate">
                                {isDivisi ? row.rekeningTerkait || '-' : row.divisi || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {row.masuk > 0 ? (
                                  <span className="font-semibold text-emerald-700">
                                    +{formatRupiah(row.masuk)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                {row.keluar > 0 ? (
                                  <span className="font-semibold text-rose-700">
                                    −{formatRupiah(row.keluar)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                                  row.saldoBerjalan < 0 ? 'text-rose-700 bg-rose-50/50' : 'text-slate-950'
                                }`}
                              >
                                {formatRupiah(row.saldoBerjalan)}
                              </td>
                            </tr>
                          );
                        })
                      )}

                      {/* Anchor Row: Saldo Awal (shown at bottom in newest-first mode) */}
                      {!hasActiveFilters && sortMode === 'TERBARU' && (
                        <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">0</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                            {data.ledgerStartDate || 'Awal'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">SALDO-AWAL</td>
                          <td className="py-2.5 px-3 text-slate-700">Saldo Awal</td>
                          <td className="py-2.5 px-3 text-slate-800">
                            Saldo pembukaan {data.nama} ({data.kode})
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">-</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                            -
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-950">
                            {formatRupiah(data.saldoAwal)}
                          </td>
                        </tr>
                      )}
                    </tbody>

                    <tfoot>
                      <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-950">
                        <td colSpan={6} className="py-2.5 px-3 text-right">
                          {hasActiveFilters
                            ? `Total Filter (${filteredRows.length} transaksi)`
                            : `Total Mutasi Keseluruhan (${data.jumlahTransaksi} transaksi)`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-800 whitespace-nowrap">
                          +{formatRupiah(hasActiveFilters ? filteredTotals.masuk : data.totalMasuk)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-800 whitespace-nowrap">
                          −{formatRupiah(hasActiveFilters ? filteredTotals.keluar : data.totalKeluar)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                            data.saldoHitungMutasi < 0 ? 'text-rose-800' : 'text-slate-950'
                          }`}
                        >
                          {formatRupiah(data.saldoHitungMutasi)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
