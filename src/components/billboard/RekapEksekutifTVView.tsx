import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Camera,
  Landmark,
  Maximize2,
  Minimize2,
  Package,
  Printer,
  Receipt,
  RefreshCw,
  Table2,
  Tv,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { api, type BillboardRekapEksekutifData } from '../../api/client';
import { DivisiLogoAvatar } from '../common/DivisiLogoAvatar';
import { ModalProfilDivisi } from '../karyawan/ModalProfilDivisi';
import {
  ModalAuditMutasiRekening,
  type AuditMutasiTarget,
} from '../common/ModalAuditMutasiRekening';
import type {
  RekapDivisiMatrixCol,
  RekapBarangDivisiGroup,
} from '../../server/services/billboardRekapService';

interface RekapEksekutifTVViewProps {
  onClose?: () => void;
  onSwitchToLiveMonitor: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const AUTO_REFRESH_SECONDS = 30;

function formatAngka(val: number, showDashOnZero = false): string {
  const n = Math.round(Number(val) || 0);
  if (n === 0 && showDashOnZero) return '-';
  if (n < 0) return `(${Math.abs(n).toLocaleString('id-ID')})`;
  return n.toLocaleString('id-ID');
}

function formatRp(val: number, showDashOnZero = false): string {
  const n = Math.round(Number(val) || 0);
  if (n === 0 && showDashOnZero) return '-';
  if (n < 0) return `(Rp ${Math.abs(n).toLocaleString('id-ID')})`;
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function formatQty(val: number): string {
  const n = Number(val) || 0;
  if (n === 0) return '0';
  return Number.isInteger(n)
    ? n.toLocaleString('id-ID')
    : n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function getModernDivisiStyles(themeKey: RekapDivisiMatrixCol['themeKey']) {
  switch (themeKey) {
    case 'WAP':
      return {
        headerBg: 'bg-emerald-800 hover:bg-emerald-900 text-white',
        cellTint: 'bg-emerald-50/45',
        barAccent: 'bg-emerald-700',
      };
    case 'GWA':
      return {
        headerBg: 'bg-lime-700 hover:bg-lime-800 text-white',
        cellTint: 'bg-lime-50/45',
        barAccent: 'bg-lime-600',
      };
    case 'CVWA':
      return {
        headerBg: 'bg-amber-600 hover:bg-amber-700 text-white',
        cellTint: 'bg-amber-50/45',
        barAccent: 'bg-amber-500',
      };
    case 'WT':
      return {
        headerBg: 'bg-slate-700 hover:bg-slate-800 text-white',
        cellTint: 'bg-slate-50/70',
        barAccent: 'bg-slate-600',
      };
    case 'BRILINK':
      return {
        headerBg: 'bg-orange-600 hover:bg-orange-700 text-white',
        cellTint: 'bg-orange-50/45',
        barAccent: 'bg-orange-500',
      };
    case 'OKUSSA':
      return {
        headerBg: 'bg-sky-700 hover:bg-sky-800 text-white',
        cellTint: 'bg-sky-50/45',
        barAccent: 'bg-sky-600',
      };
    case 'WK':
      return {
        headerBg: 'bg-blue-700 hover:bg-blue-800 text-white',
        cellTint: 'bg-blue-50/45',
        barAccent: 'bg-blue-600',
      };
    default:
      return {
        headerBg: 'bg-slate-600 hover:bg-slate-700 text-white',
        cellTint: 'bg-slate-50/50',
        barAccent: 'bg-slate-500',
      };
  }
}

const ModernBarangCard: React.FC<{
  group: RekapBarangDivisiGroup;
  subtitle?: string;
}> = ({ group, subtitle }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-slate-900 tracking-wide truncate">
            {group.judul}
          </h4>
          {subtitle && (
            <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
          )}
        </div>
        <span className="font-mono tabular-nums text-xs font-bold text-slate-900 whitespace-nowrap shrink-0">
          {formatRp(group.totalNilai)}
        </span>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] text-slate-500">
              <th className="py-1.5 px-3.5 text-left font-medium">Item / Komoditas</th>
              <th className="py-1.5 px-2.5 text-right font-medium whitespace-nowrap">Stok</th>
              <th className="py-1.5 px-3.5 text-right font-medium whitespace-nowrap">Nilai Modal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 px-3.5 text-center text-slate-400 italic text-xs">
                  Belum ada item stok tercatat
                </td>
              </tr>
            ) : (
              group.items.map((item) => (
                <tr key={item.kode} className="hover:bg-slate-50/90 transition-colors">
                  <td
                    className="py-1.5 px-3.5 font-medium text-slate-800 max-w-[200px] truncate"
                    title={`${item.nama} (${formatQty(item.qty)} ${item.satuan} @ ${formatRp(item.hargaUnit)})`}
                  >
                    {item.nama}
                  </td>
                  <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {formatQty(item.qty)}
                    <span className="text-[10px] text-slate-400 ml-1">{item.satuan}</span>
                  </td>
                  <td
                    className={`py-1.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap ${
                      item.nilai > 0 ? 'font-semibold text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {formatRp(item.nilai)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-950">
              <td className="py-2 px-3.5 text-[11px] uppercase tracking-wide">Total</td>
              <td className="py-2 px-2.5 text-right font-mono tabular-nums text-[11px] text-slate-700 whitespace-nowrap">
                {group.totalQty > 0 ? formatQty(group.totalQty) : '-'}
              </td>
              <td className="py-2 px-3.5 text-right font-mono tabular-nums text-xs text-slate-950 whitespace-nowrap">
                {formatRp(group.totalNilai)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export const RekapEksekutifTVView: React.FC<RekapEksekutifTVViewProps> = ({
  onClose,
  onSwitchToLiveMonitor,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const [data, setData] = useState<BillboardRekapEksekutifData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBulan, setSelectedBulan] = useState<number | undefined>(undefined);
  const [selectedTahun, setSelectedTahun] = useState<number | undefined>(undefined);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [editingLogoDivisi, setEditingLogoDivisi] = useState<string | null>(null);
  const [auditTarget, setAuditTarget] = useState<AuditMutasiTarget | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const res = await api.getBillboardRekapEksekutif({
          periode: 'BULAN',
          bulan: selectedBulan,
          tahun: selectedTahun,
        });
        setData(res);
        setError(null);
        setCountdown(AUTO_REFRESH_SECONDS);
      } catch (err: any) {
        setError(err.message || 'Gagal memuat data rekap eksekutif');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedBulan, selectedTahun]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          loadData(true);
          return AUTO_REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [loadData]);

  useEffect(() => {
    const handleExternalUpdate = () => loadData(true);
    window.addEventListener('erp:data-updated', handleExternalUpdate);
    return () => window.removeEventListener('erp:data-updated', handleExternalUpdate);
  }, [loadData]);

  const handleSelectMonthChange = (value: string) => {
    const [thnStr, blnStr] = value.split('-');
    const thn = Number(thnStr);
    const bln = Number(blnStr);
    if (thn && bln) {
      setSelectedBulan(bln);
      setSelectedTahun(thn);
    }
  };

  const activeTahun = selectedTahun || data?.selectedTahun || 2026;
  const activeBulan = selectedBulan || data?.selectedBulan || 11;
  const currentSelectValue = `${activeTahun}-${String(activeBulan).padStart(2, '0')}`;

  return (
    <div className="min-h-full w-full bg-slate-100 text-slate-900 flex flex-col">
      {/* Executive Header Toolbar — Hidden on Print */}
      <header className="print:hidden sticky top-0 z-30 bg-slate-900 text-white border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 text-xs font-semibold shrink-0">
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white whitespace-nowrap cursor-pointer"
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Rekap Eksekutif</span>
            </button>
            <button
              type="button"
              onClick={onSwitchToLiveMonitor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-slate-300 hover:text-white hover:bg-slate-700/70 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Monitor Live</span>
            </button>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 truncate">
            <span className="font-semibold text-white">PT Wijaya Agro Perkasa</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>Rekap Keuangan &amp; Operasional Terintegrasi</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Month Filter */}
          <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <select
              aria-label="Filter Periode Rekap"
              value={currentSelectValue}
              onChange={(e) => handleSelectMonthChange(e.target.value)}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer pr-1"
            >
              {(data?.availableMonths || []).map((m) => (
                <option
                  key={`${m.tahun}-${m.bulan}`}
                  value={`${m.tahun}-${String(m.bulan).padStart(2, '0')}`}
                  className="bg-slate-900 text-white"
                >
                  Bulan {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            title="Sinkronkan data sekarang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="font-mono tabular-nums text-[11px]">{countdown}s</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            title="Cetak Rekap Eksekutif"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cetak</span>
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode TV Layar Penuh'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Normal' : 'Layar Penuh TV'}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Tutup Layar Monitor"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Responsive Executive Canvas — Fits 100% Zoom Cleanly Without Clipping */}
      <main className="flex-1 p-3 sm:p-4 lg:p-5 max-w-[1680px] w-full mx-auto space-y-5">
        {loading && !data ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
            <div className="h-5 w-64 bg-slate-200 rounded animate-pulse" />
            <div className="h-44 bg-slate-100 rounded-lg animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="h-56 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-56 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          </div>
        ) : error && !data ? (
          <div className="bg-white border border-rose-200 rounded-xl p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => void loadData(false)}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              Muat Ulang Data
            </button>
          </div>
        ) : data ? (
          <>
            {/* ============================================================== */}
            {/* ZONE 1: MODERN DIVISION PERFORMANCE MATRIX (IN/OUT/BARANG/LR)  */}
            {/* ============================================================== */}
            <section className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Building2 className="w-4 h-4 text-slate-600 shrink-0" />
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                    Rekap Performa Seluruh Divisi — {data.periodeLabel}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">{data.tanggalBanner}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    Update {data.tanggalWIB} {data.jamWIB.slice(0, 5)} WIB
                  </span>
                  <span aria-hidden="true" className="hidden md:inline">·</span>
                  <span className="hidden md:inline">
                    Klik nama divisi untuk audit mutasi · Klik logo untuk ganti logo
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[820px]">
                  <thead>
                    {/* Logo Row */}
                    <tr className="bg-slate-50/70">
                      <th className="w-[104px] py-3 px-3.5 text-left align-bottom border-b border-slate-200">
                        <div className="text-[11px] font-semibold text-slate-500">Periode</div>
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {data.periodeLabel}
                        </div>
                      </th>
                      {data.divisiMatrix.map((col) => (
                        <th
                          key={`logo-${col.idDivisi}`}
                          className="py-3 px-1.5 text-center align-bottom border-b border-slate-200"
                        >
                          <div className="flex justify-center">
                            <button
                              type="button"
                              onClick={() => setEditingLogoDivisi(col.nama)}
                              title={
                                col.logoUrl
                                  ? `Logo ${col.nama} — Klik untuk ganti logo`
                                  : `Belum ada logo ${col.nama} — Klik untuk pasang logo`
                              }
                              className="relative group cursor-pointer rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                              <DivisiLogoAvatar
                                namaDivisi={col.nama}
                                logoUrl={col.logoUrl}
                                size="md"
                                theme="light"
                                className="bg-white border border-slate-200 group-hover:border-emerald-500 shadow-xs transition-colors"
                              />
                              <span className="print:hidden absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow">
                                <Camera className="w-2.5 h-2.5" />
                              </span>
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="py-3 px-3.5 text-right align-bottom border-b border-slate-200 w-[148px]">
                        <div className="text-[11px] font-semibold text-slate-500">Konsolidasi</div>
                        <div className="text-xs font-bold text-slate-900">Semua Divisi</div>
                      </th>
                    </tr>

                    {/* Division Title Header Row */}
                    <tr className="text-xs font-bold tracking-wide">
                      <th className="py-2.5 px-3.5 bg-slate-900 text-white text-left border-r border-slate-800">
                        DIVISI
                      </th>
                      {data.divisiMatrix.map((col) => {
                        const st = getModernDivisiStyles(col.themeKey);
                        return (
                          <th
                            key={`head-${col.idDivisi}`}
                            onClick={() =>
                              setAuditTarget({
                                type: 'DIVISI',
                                kodeOrNama: col.nama,
                                label: col.nama,
                              })
                            }
                            className={`py-2.5 px-2 text-center border-r border-white/15 cursor-pointer transition-colors whitespace-nowrap ${st.headerBg}`}
                            title={`Klik untuk buka Audit Mutasi Divisi ${col.nama}`}
                          >
                            {col.kodeSingkat}
                          </th>
                        );
                      })}
                      <th className="py-2.5 px-3.5 bg-slate-900 text-white text-right whitespace-nowrap">
                        TOTAL
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                    {/* ROW 1: IN */}
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5 bg-slate-50 font-sans font-bold text-slate-700 border-r border-slate-200">
                        IN
                      </td>
                      {data.divisiMatrix.map((col) => {
                        const st = getModernDivisiStyles(col.themeKey);
                        return (
                          <td
                            key={`in-${col.idDivisi}`}
                            className={`py-2.5 px-2.5 text-right font-medium text-slate-900 border-r border-slate-200/80 whitespace-nowrap ${st.cellTint}`}
                          >
                            {formatAngka(col.inNominal)}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3.5 bg-slate-100/80 text-right font-bold text-slate-950 whitespace-nowrap">
                        {formatRp(data.divisiTotal.inNominal)}
                      </td>
                    </tr>

                    {/* ROW 2: OUT */}
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5 bg-slate-50 font-sans font-bold text-slate-700 border-r border-slate-200">
                        OUT
                      </td>
                      {data.divisiMatrix.map((col) => {
                        const st = getModernDivisiStyles(col.themeKey);
                        return (
                          <td
                            key={`out-${col.idDivisi}`}
                            className={`py-2.5 px-2.5 text-right font-medium text-slate-800 border-r border-slate-200/80 whitespace-nowrap ${st.cellTint}`}
                          >
                            {formatAngka(col.outNominal)}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3.5 bg-slate-100/80 text-right font-bold text-slate-950 whitespace-nowrap">
                        {formatRp(data.divisiTotal.outNominal)}
                      </td>
                    </tr>

                    {/* ROW 3: BARANG */}
                    <tr className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5 bg-slate-50 font-sans font-bold text-slate-700 border-r border-slate-200">
                        BARANG
                      </td>
                      {data.divisiMatrix.map((col) => {
                        const st = getModernDivisiStyles(col.themeKey);
                        return (
                          <td
                            key={`brg-${col.idDivisi}`}
                            className={`py-2.5 px-2.5 text-right font-medium text-slate-800 border-r border-slate-200/80 whitespace-nowrap ${st.cellTint}`}
                          >
                            {col.barangNominal > 0 ? (
                              formatAngka(col.barangNominal)
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-3.5 bg-slate-100/80 text-right font-bold text-slate-950 whitespace-nowrap">
                        {formatRp(data.divisiTotal.barangNominal)}
                      </td>
                    </tr>

                    {/* ROW 4: LABA RUGI */}
                    <tr className="border-t-2 border-slate-300">
                      <td className="py-3 px-3.5 bg-slate-100 font-sans font-extrabold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        LABA RUGI
                      </td>
                      {data.divisiMatrix.map((col) => {
                        const isNeg = col.labaRugi < 0;
                        const isPos = col.labaRugi > 0;
                        return (
                          <td
                            key={`lr-${col.idDivisi}`}
                            className={`py-3 px-2.5 text-right font-extrabold border-r border-slate-200/80 whitespace-nowrap ${
                              isNeg
                                ? 'bg-rose-50 text-rose-700'
                                : isPos
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-slate-50 text-slate-600'
                            }`}
                          >
                            {formatAngka(col.labaRugi)}
                          </td>
                        );
                      })}
                      <td
                        className={`py-3 px-3.5 text-right font-extrabold whitespace-nowrap ${
                          data.divisiTotal.labaRugi < 0
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}
                      >
                        {formatRp(data.divisiTotal.labaRugi)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ============================================================== */}
            {/* ZONE 2: POSISI KAS, TOT KELUAR & SALDO REKENING FISIK          */}
            {/* ============================================================== */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* LEFT: RINGKASAN KAS + TOT KELUAR */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex-1 flex flex-col">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-blue-700 shrink-0" />
                      <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                        Ringkasan Posisi Kas
                      </h3>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500">
                      {data.tanggalBanner}
                    </span>
                  </div>

                  <table className="w-full text-xs border-collapse flex-1">
                    <tbody className="divide-y divide-slate-100">
                      <tr className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-700">Nota Suplayer</td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                            data.kasSummary.notaSuplayer < 0 ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {formatRp(data.kasSummary.notaSuplayer)}
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-700">
                          Laba / Rugi ({data.periodeLabel})
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                            data.kasSummary.labaRugi < 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatRp(data.kasSummary.labaRugi)}
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-700">Nilai Stok Barang</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {formatRp(data.kasSummary.barang)}
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-semibold text-slate-700">Total Saldo Rekening</td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                            data.kasSummary.rekening < 0 ? 'text-rose-700' : 'text-slate-900'
                          }`}
                        >
                          {formatRp(data.kasSummary.rekening)}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-900 text-white font-bold">
                        <td className="py-3 px-4 text-xs uppercase tracking-wide">
                          Total Posisi Kas
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-sm whitespace-nowrap">
                          {formatRp(data.kasSummary.total)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* TOT KELUAR CARD (GAJI + PENGELUARAN) */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Total Keluar Operasional
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 font-mono tabular-nums">
                      <span>Gaji {formatRp(data.totalGaji)}</span>
                      <span aria-hidden="true">+</span>
                      <span>Pengeluaran {formatRp(data.totalPengeluaran)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-lg font-extrabold text-slate-950 whitespace-nowrap">
                      {formatRp(data.totalKeluarGabungan)}
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: SALDO REKENING KAS & BANK (CLICKABLE TO AUDIT) */}
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-emerald-700 shrink-0" />
                    <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                      Saldo Rekening Kas &amp; Bank
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Klik rekening untuk buka audit mutasi &amp; rekonsiliasi saldo
                  </span>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] text-slate-500">
                        <th className="py-2 px-4 text-left font-medium">Nama Rekening</th>
                        <th className="py-2 px-3 text-left font-medium w-24">Kode</th>
                        <th className="py-2 px-4 text-right font-medium">Saldo Saat Ini</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.rekeningList.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 px-4 text-center text-slate-400 italic">
                            Belum ada rekening aktif
                          </td>
                        </tr>
                      ) : (
                        data.rekeningList.map((rek) => {
                          const isNeg = rek.saldo < 0;
                          return (
                            <tr
                              key={rek.kode}
                              onClick={() =>
                                setAuditTarget({
                                  type: 'REKENING_KAS',
                                  kodeOrNama: rek.kode,
                                  label: rek.nama,
                                })
                              }
                              className={`cursor-pointer transition-colors group ${
                                isNeg ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-slate-50'
                              }`}
                              title={`Klik untuk buka Audit Mutasi Rekening ${rek.nama} (${rek.kode})`}
                            >
                              <td className="py-2 px-4 font-semibold text-slate-900 flex items-center gap-1.5">
                                <span className="truncate">{rek.nama}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 print:hidden" />
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {rek.kode}
                              </td>
                              <td
                                className={`py-2 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                                  isNeg ? 'text-rose-700' : 'text-slate-950'
                                }`}
                              >
                                {formatRp(rek.saldo)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t border-slate-200 font-bold text-slate-950">
                        <td colSpan={2} className="py-2.5 px-4 text-xs uppercase tracking-wide">
                          Total Saldo Rekening ({data.rekeningList.length} Rekening)
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono tabular-nums text-sm whitespace-nowrap ${
                            data.totalRekening < 0 ? 'text-rose-700' : 'text-slate-950'
                          }`}
                        >
                          {formatRp(data.totalRekening)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>

            {/* ============================================================== */}
            {/* ZONE 3: GAJI KARYAWAN & RINCIAN PENGELUARAN (2-COL BALANCED)   */}
            {/* ============================================================== */}
            <section className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
              {/* LEFT: GAJI KARYAWAN (HARIAN BERJALAN & BULANAN) */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-sky-700 shrink-0" />
                    <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                      Gaji Berjalan Karyawan — {data.periodeLabel}
                    </h3>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                    {formatRp(data.totalGaji)}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-sky-50/70 border-b border-slate-200 text-slate-700 text-[11px]">
                        <th className="py-2 px-3.5 text-left font-bold">Nama Karyawan</th>
                        <th className="py-2 px-3 text-right font-bold whitespace-nowrap w-36">
                          Gaji Berjalan
                        </th>
                        <th className="py-2 px-3.5 text-right font-bold whitespace-nowrap w-32">
                          Bulanan
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.gajiList.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 px-4 text-center text-slate-400 italic">
                            Belum ada data karyawan aktif
                          </td>
                        </tr>
                      ) : (
                        data.gajiList.map((row) => (
                          <tr key={row.id} className="hover:bg-sky-50/40 transition-colors">
                            <td
                              className="py-1.5 px-3.5 font-semibold text-slate-900"
                              title={row.jabatan ? `${row.nama} — ${row.jabatan}` : row.nama}
                            >
                              {row.nama}
                            </td>
                            <td
                              className={`py-1.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                                row.gajiHarian > 0 ? 'font-semibold text-slate-900' : 'text-slate-300'
                              }`}
                            >
                              {formatRp(row.gajiHarian, true)}
                            </td>
                            <td
                              className={`py-1.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap ${
                                row.gajiBulanan > 0 ? 'font-semibold text-slate-900' : 'text-slate-300'
                              }`}
                            >
                              {row.gajiBulanan > 0 ? formatRp(row.gajiBulanan) : '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                        <td className="py-2 px-3.5 text-[11px] uppercase">Sub Total</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatRp(data.subTotGajiHarian)}
                        </td>
                        <td className="py-2 px-3.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {data.subTotGajiBulanan > 0 ? formatRp(data.subTotGajiBulanan) : '-'}
                        </td>
                      </tr>
                      <tr className="bg-slate-100 border-t border-slate-300 font-extrabold text-slate-950">
                        <td className="py-2.5 px-3.5 text-xs uppercase tracking-wide">
                          Total Gaji ({data.gajiList.length} Karyawan)
                        </td>
                        <td
                          colSpan={2}
                          className="py-2.5 px-3.5 text-right font-mono tabular-nums text-sm whitespace-nowrap"
                        >
                          {formatRp(data.totalGaji)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* RIGHT: RINCIAN PENGELUARAN (HIJAU INVENTARIS & ORANYE BIASA) */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
                    <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                      Rincian Pengeluaran — {data.periodeLabel}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
                    <span className="text-emerald-700 font-semibold">
                      Inventaris {formatRp(data.totalPengeluaranInventaris)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-semibold">
                      Biasa {formatRp(data.totalPengeluaranBiasa)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-amber-50/70 border-b border-slate-200 text-slate-700 text-[11px]">
                        <th className="py-2 px-3 text-center font-bold w-11">No</th>
                        <th className="py-2 px-3 text-left font-bold">Item Pengeluaran</th>
                        <th className="py-2 px-2.5 text-right font-bold w-16 whitespace-nowrap">
                          Trx
                        </th>
                        <th className="py-2 px-3.5 text-right font-bold w-36 whitespace-nowrap">
                          Jumlah (Rp)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.pengeluaranList.map((item) => {
                        const isInventaris = item.kelompok === 'INVENTARIS';
                        return (
                          <tr
                            key={`${item.kode}-${item.no}`}
                            className={`transition-colors ${
                              isInventaris
                                ? 'bg-emerald-50/55 hover:bg-emerald-100/60'
                                : 'bg-amber-50/55 hover:bg-amber-100/60'
                            }`}
                          >
                            <td className="py-1.5 px-3 text-center font-mono tabular-nums text-[11px] text-slate-500">
                              {item.no}
                            </td>
                            <td className="py-1.5 px-3 font-semibold text-slate-900">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate">{item.nama}</span>
                                <span
                                  className={`text-[10px] font-medium shrink-0 ${
                                    isInventaris ? 'text-emerald-700' : 'text-amber-700'
                                  }`}
                                >
                                  {isInventaris ? 'Inventaris' : 'Operasional'}
                                </span>
                              </div>
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-[11px] text-slate-600 whitespace-nowrap">
                              {item.jumlahTrx > 0 ? `${item.jumlahTrx}x` : '-'}
                            </td>
                            <td
                              className={`py-1.5 px-3.5 text-right font-mono tabular-nums whitespace-nowrap ${
                                item.nominal > 0 ? 'font-bold text-slate-950' : 'text-slate-400'
                              }`}
                            >
                              {formatAngka(item.nominal, true)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 border-t border-slate-300 font-extrabold text-slate-950">
                        <td colSpan={3} className="py-2.5 px-3.5 text-xs uppercase tracking-wide">
                          Total Pengeluaran ({data.pengeluaranList.length} Pos)
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-sm whitespace-nowrap">
                          {formatRp(data.totalPengeluaran)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </section>

            {/* ============================================================== */}
            {/* ZONE 4: PERSEDIAAN BARANG PER DIVISI (3-COLUMN BALANCED GRID)  */}
            {/* ============================================================== */}
            <section className="space-y-3">
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-700 shrink-0" />
                  <h3 className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                    Nilai Persediaan Barang Per Divisi
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500 font-medium">Total Nilai Barang:</span>
                  <span className="font-mono tabular-nums text-sm font-extrabold text-slate-950">
                    {formatRp(data.barangPerDivisi.totalBarang)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                {/* Col 1: GWA + Wijaya Transport + CV WA */}
                <div className="space-y-4">
                  <ModernBarangCard
                    group={data.barangPerDivisi.gwa}
                    subtitle="Stok Komoditas Hasil Bumi (Modal Moving Average)"
                  />
                  <ModernBarangCard
                    group={data.barangPerDivisi.wt}
                    subtitle="Stok BBM & Operasional Armada"
                  />
                  <ModernBarangCard
                    group={data.barangPerDivisi.cvWa}
                    subtitle="Stok Pupuk & Saprotan"
                  />
                </div>

                {/* Col 2: Okussa */}
                <div>
                  <ModernBarangCard
                    group={data.barangPerDivisi.okussa}
                    subtitle="Stok Kopi Rosting, Bubuk & Kemasan"
                  />
                </div>

                {/* Col 3: Wijaya Karya (WK) */}
                <div>
                  <ModernBarangCard
                    group={data.barangPerDivisi.wk}
                    subtitle="Stok Material Bangunan & Kayu"
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>

      {/* Modal Pasang / Edit Logo Divisi Langsung dari Monitor TV */}
      <ModalProfilDivisi
        isOpen={Boolean(editingLogoDivisi)}
        initialDivisiNama={editingLogoDivisi || undefined}
        onClose={() => setEditingLogoDivisi(null)}
        onSaved={() => {
          loadData(true);
        }}
      />

      {/* Modal Audit Mutasi Rekening / Divisi Langsung dari Monitor TV */}
      <ModalAuditMutasiRekening
        target={auditTarget}
        onClose={() => setAuditTarget(null)}
        onSaldoSynced={() => {
          loadData(true);
        }}
      />
    </div>
  );
};
