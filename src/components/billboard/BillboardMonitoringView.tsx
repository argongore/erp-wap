import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Maximize2,
  Minimize2,
  RefreshCw,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Landmark,
  Wallet,
  Users,
  Briefcase,
  Building2,
  Warehouse,
  Truck,
  Wrench,
  Store,
  Sparkles,
  Layers,
  Wheat,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Eye,
  Radio,
} from 'lucide-react';
import { api, BillboardData } from '../../api/client.ts';
import { DEFAULT_PT_LOGO_URL } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { DivisiLogoAvatar } from '../common/DivisiLogoAvatar.tsx';

interface BillboardMonitoringViewProps {
  onClose?: () => void;
}

export const BillboardMonitoringView: React.FC<BillboardMonitoringViewProps> = ({ onClose }) => {
  const [data, setData] = useState<BillboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(5);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Digital clock update
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setDateStr(
        now.toLocaleDateString('id-ID', {
          timeZone: 'Asia/Jakarta',
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      );
      setTimeStr(
        now
          .toLocaleTimeString('id-ID', {
            timeZone: 'Asia/Jakarta',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })
          .replace(/\./g, ':') + ' WIB'
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch billboard data
  const fetchData = async () => {
    try {
      const res = await api.getBillboardData();
      setData(res);
    } catch (err) {
      console.error('Failed to load billboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh countdown every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          fetchData();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if ((containerRef.current as any)?.webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const getDivisiIcon = (nama: string) => {
    switch (nama) {
      case 'Gudang Wijaya Agro':
        return <Warehouse className="w-4 h-4 text-amber-400" />;
      case 'Wijaya Karya':
        return <Wrench className="w-4 h-4 text-blue-400" />;
      case 'Wijaya Transport':
        return <Truck className="w-4 h-4 text-indigo-400" />;
      case 'CV Wijaya Agro':
        return <Store className="w-4 h-4 text-emerald-400" />;
      case 'PT Wijaya Agro Perkasa':
        return <Building2 className="w-4 h-4 text-purple-400" />;
      case 'Okussa':
        return <Sparkles className="w-4 h-4 text-rose-400" />;
      default:
        return <Layers className="w-4 h-4 text-zinc-400" />;
    }
  };

  return (
    <div
      ref={containerRef}
      className={`min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-y-auto ${
        isFullscreen ? 'fixed inset-0 z-50 p-4 sm:p-6' : 'rounded-2xl border border-slate-800 p-4 sm:p-6 shadow-2xl'
      }`}
    >
      {/* Top Billboard Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-800/80 gap-4 shrink-0">
        <div className="flex items-center space-x-3.5">
          <img
            src={DEFAULT_PT_LOGO_URL}
            alt="PT. Wijaya Agro Perkasa"
            className="w-11 h-11 rounded-xl bg-black object-contain border border-emerald-500/40 shrink-0"
          />
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="font-black text-lg tracking-wider text-white uppercase font-mono">
                WIJAYA AGRO COMMAND CENTER
              </span>
              <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>LIVE SYSTEM MONITOR</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Layar Billboard Eksekutif · Aliran Kas Harian, 6 Divisi Operasional &amp; Penugasan Pekerja
            </p>
          </div>
        </div>

        {/* Digital Clock & Controls */}
        <div className="flex items-center space-x-4">
          <div className="bg-slate-900/90 border border-slate-800 px-4 py-2 rounded-xl text-right">
            <div className="text-[11px] text-slate-400 font-medium">{dateStr}</div>
            <div className="text-lg font-black font-mono text-emerald-400 tracking-wider">
              {timeStr}
            </div>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
            <button
              onClick={() => {
                setLoading(true);
                fetchData();
              }}
              title="Segarkan Data Sekarang"
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh (TV / Billboard)'}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Tutup
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto-Refresh Status Banner */}
      <div className="flex items-center justify-between py-2 text-[11px] text-slate-400 border-b border-slate-800/40">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span>Status Sinkronisasi: <strong>Tersambung ke Semua Modul ERP</strong></span>
        </div>
        <div className="font-mono text-[10px] text-slate-500">
          Auto-Refresh dalam <span className="text-emerald-400 font-bold">{secondsUntilRefresh}s</span>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="space-y-6 pt-4 flex-1">
        {/* ROW 1: Real-Time Cashflow & Company Vault Matrix ("Hari ini uang bergerak kemana saja") */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center space-x-2">
              <Activity className="w-4 h-4" />
              <span>1. ALIRAN KEUANGAN &amp; SALDO FISIK PERUSAHAAN HARI INI</span>
            </h2>
            <span className="text-[10px] text-slate-400">
              *Penyimpanan Fisik Uang di Rekening Perusahaan (Kasir &amp; Bank Resmi)
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* Uang Masuk Hari Ini */}
            <div className="min-w-0 overflow-hidden bg-slate-900/90 border border-emerald-500/40 rounded-xl p-3.5 shadow-lg relative">
              <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between text-slate-400 mb-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1 min-w-0 truncate">
                  <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">UANG MASUK HARI INI</span>
                </span>
              </div>
              <div
                className="text-base sm:text-lg font-black font-mono tabular-nums text-emerald-300 truncate whitespace-nowrap"
                title={`+${formatRupiah(data?.cashflow.masuk || 0)}`}
              >
                +{formatRupiahSingkat(Math.abs(data?.cashflow.masuk || 0))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 truncate">
                Penjualan toko + Pelunasan bon mitra
              </p>
            </div>

            {/* Uang Keluar Hari Ini */}
            <div className="min-w-0 overflow-hidden bg-slate-900/90 border border-rose-500/40 rounded-xl p-3.5 shadow-lg relative">
              <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/10 rounded-full blur-xl pointer-events-none"></div>
              <div className="flex items-center justify-between text-slate-400 mb-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 flex items-center space-x-1 min-w-0 truncate">
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">UANG KELUAR HARI INI</span>
                </span>
              </div>
              <div
                className="text-base sm:text-lg font-black font-mono tabular-nums text-rose-300 truncate whitespace-nowrap"
                title={`-${formatRupiah(data?.cashflow.keluar || 0)}`}
              >
                -{formatRupiahSingkat(Math.abs(data?.cashflow.keluar || 0))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 truncate">
                Beli panen + Kasbon uang + Upah harian
              </p>
            </div>

            {/* Net Cashflow Hari Ini */}
            <div className="min-w-0 overflow-hidden bg-slate-900/90 border border-slate-700 rounded-xl p-3.5 shadow-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 truncate">
                NET CASHFLOW
              </div>
              <div
                className={`text-base sm:text-lg font-black font-mono tabular-nums truncate whitespace-nowrap ${
                  (data?.cashflow.net || 0) >= 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
                title={`${(data?.cashflow.net || 0) >= 0 ? '+' : ''}${formatRupiah(data?.cashflow.net || 0)}`}
              >
                {(data?.cashflow.net || 0) >= 0 ? '+' : ''}
                {formatRupiahSingkat(data?.cashflow.net || 0)}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 truncate">
                Surplus / Defisit Kas Harian
              </p>
            </div>

            {/* Kas Fisik Kasir KAS01 */}
            <div className="min-w-0 overflow-hidden bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg">
              <div className="flex items-center justify-between text-slate-400 mb-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center space-x-1 min-w-0 truncate">
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">KAS KASIR (KAS01)</span>
                </span>
              </div>
              <div
                className="text-base sm:text-lg font-black font-mono tabular-nums text-white truncate whitespace-nowrap"
                title={formatRupiah(data?.cashflow.kasKasir || 0)}
              >
                {formatRupiahSingkat(data?.cashflow.kasKasir || 0)}
              </div>
              <p className="text-[10px] text-emerald-400/80 mt-1 truncate">
                Fisik Laci Kasir Toko Pusat
              </p>
            </div>

            {/* Total Bank Perusahaan */}
            <div className="min-w-0 overflow-hidden bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg">
              <div className="flex items-center justify-between text-slate-400 mb-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 flex items-center space-x-1 min-w-0 truncate">
                  <Landmark className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">BANK PERUSAHAAN</span>
                </span>
              </div>
              <div
                className="text-base sm:text-lg font-black font-mono tabular-nums text-white truncate whitespace-nowrap"
                title={formatRupiah(data?.cashflow.totalBank || 0)}
              >
                {formatRupiahSingkat(data?.cashflow.totalBank || 0)}
              </div>
              <p className="text-[10px] text-sky-400/80 mt-1 truncate">
                BNI, BCA, Mandiri, BRI, BSI
              </p>
            </div>

            {/* Piutang Bon Aktif (BON01) */}
            <div className="min-w-0 overflow-hidden bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 shadow-lg">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1 truncate">
                PIUTANG BON (BON01)
              </div>
              <div
                className="text-base sm:text-lg font-black font-mono tabular-nums text-amber-300 truncate whitespace-nowrap"
                title={formatRupiah(data?.cashflow.piutangBon || 0)}
              >
                {formatRupiahSingkat(data?.cashflow.piutangBon || 0)}
              </div>
              <p className="text-[10px] text-slate-400 mt-1 truncate">
                Kasbon barang &amp; pinjaman uang aktif
              </p>
            </div>
          </div>
        </div>

        {/* ROW 2: 3-Column Split: Divisi Aktif, Penugasan Karyawan, Live Mutations */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* COLUMN 1 (4 cols): 6 Divisi Operasional ("Divisi apa yang sedang aktif") */}
          <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                <Layers className="w-4 h-4" />
                <span>2. DIVISI BISNIS OPERASIONAL</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                6 UNIT AKTIF
              </span>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[460px] pr-1">
              {(data?.divisiList || []).map((d) => (
                <div
                  key={d.idDivisi}
                  className="min-w-0 overflow-hidden p-3 bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl space-y-1.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <DivisiLogoAvatar
                        namaDivisi={d.divisi}
                        logoUrl={d.logoUrl}
                        size="sm"
                        theme="dark"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-white truncate">{d.divisi}</div>
                        <span className="text-[9px] font-mono text-slate-400 block truncate">
                          {d.kodeRekening}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0 max-w-[48%]">
                      <div className="text-[10px] text-slate-400">Buku Operasional:</div>
                      <div
                        className="font-mono tabular-nums font-bold text-emerald-400 text-xs truncate whitespace-nowrap"
                        title={formatRupiah(d.saldoSaatIni)}
                      >
                        {formatRupiahSingkat(d.saldoSaatIni)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] pt-1.5 border-t border-slate-800/60 text-slate-400">
                    <div className="min-w-0 truncate" title={`Dropping: +${formatRupiah(d.totalDroppingMasuk)}`}>
                      Dropping:{' '}
                      <span className="text-cyan-400 font-semibold font-mono tabular-nums whitespace-nowrap">
                        +{formatRupiahSingkat(Math.abs(d.totalDroppingMasuk))}
                      </span>
                    </div>
                    <div className="min-w-0 text-right truncate" title={`Beban Upah: -${formatRupiah(d.totalGajiKeluar)}`}>
                      Beban Upah:{' '}
                      <span className="text-rose-400 font-semibold font-mono tabular-nums whitespace-nowrap">
                        -{formatRupiahSingkat(Math.abs(d.totalGajiKeluar))}
                      </span>
                    </div>
                  </div>

                  <div className="text-[9px] text-slate-500 flex items-center justify-between pt-0.5 gap-2">
                    <span className="truncate">Penyimpanan Fisik: <strong className="text-slate-400">Rekening Perusahaan</strong></span>
                    <span className="text-emerald-400 font-semibold shrink-0">● Beroperasi</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* COLUMN 2 (4 cols): Karyawan Sedang Bekerja ("Karyawan ini sedang bekerja untuk apa") */}
          <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                <Users className="w-4 h-4" />
                <span>3. PENUGASAN PEKERJA &amp; TUGAS AKTIF</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                REAL-TIME JOBS
              </span>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[460px] pr-1">
              {(data?.karyawanJobs || []).length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Belum ada penugasan pekerja tercatat hari ini
                </div>
              ) : (
                (data?.karyawanJobs || []).map((job) => (
                  <div
                    key={job.id}
                    className="p-3 bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl space-y-2 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-500/30">
                          {job.namaKaryawan.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white">
                            {job.namaKaryawan}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {job.jabatan}
                          </div>
                        </div>
                      </div>

                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                        {job.divisi}
                      </span>
                    </div>

                    {/* Deskripsi Tugas Kerja ("Karyawan ini sedang bekerja untuk apa") */}
                    <div className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 text-[11px] text-amber-200/90 font-medium">
                      <span className="text-slate-400 text-[10px] block">Sedang Bekerja:</span>
                      {job.tugasPekerjaan}
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 pt-0.5 min-w-0">
                      <span className="truncate">Tgl: {job.tanggalKerja}</span>
                      <span
                        className="font-mono tabular-nums text-emerald-400 font-bold whitespace-nowrap shrink-0"
                        title={formatRupiah(job.totalUpah)}
                      >
                        Hak Upah: {formatRupiahSingkat(job.totalUpah)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* COLUMN 3 (4 cols): Live Feed Mutasi Transaksi & Stok Komoditas */}
          <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center space-x-2 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Activity className="w-4 h-4" />
                <span>4. MUTASI SISTEM REAL-TIME</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                FEED TRANSAKSI
              </span>
            </div>

            {/* Commodity Mini Bar */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(data?.stokKomoditas || []).slice(0, 4).map((hb) => (
                <div
                  key={hb.kode}
                  className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-1.5 truncate">
                    <Wheat className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="text-[10px] font-medium text-slate-300 truncate">
                      {hb.nama}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-400 shrink-0">
                    {hb.totalTon} Ton
                  </span>
                </div>
              ))}
            </div>

            {/* Live Feed List */}
            <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1">
              {(data?.liveFeed || []).map((feed) => (
                <div
                  key={feed.id}
                  className="p-2.5 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-1 text-xs hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500">
                      {feed.tanggal} · {feed.jam} WIB
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                        feed.jenis === 'CREATE'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : feed.jenis === 'PAYMENT'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : feed.jenis === 'PAYROLL'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {feed.jenis}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-200 line-clamp-2 leading-snug">
                    {feed.detail}
                  </p>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 pt-0.5 min-w-0">
                    <span className="truncate">Rek: {feed.rekeningTerkait}</span>
                    {feed.nominal > 0 && (
                      <span
                        className="font-mono tabular-nums font-bold text-emerald-400 whitespace-nowrap shrink-0"
                        title={formatRupiah(feed.nominal)}
                      >
                        {formatRupiahSingkat(feed.nominal)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Billboard Bottom Ticker */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500 shrink-0">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>
            Sistem ERP Terpadu PT Wijaya Agro Persada · Layar Billboard Operasional &amp; Keuangan
          </span>
        </div>
        <div className="flex items-center space-x-3 font-mono text-[10px]">
          <span className="text-emerald-400 font-bold">MODE TV DISPLAY AKTIF</span>
          <span>Tekan F11 / Tombol Maximize untuk Fullscreen</span>
        </div>
      </div>
    </div>
  );
};
