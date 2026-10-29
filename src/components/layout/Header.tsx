import React, { useState, useEffect } from 'react';
import {
  Sprout,
  Clock,
  Wallet,
  Landmark,
  Tv,
  ExternalLink,
  Building2,
  Cloud,
  Menu,
  Link2,
  Check,
  RefreshCw,
  KeyRound,
  Lock,
} from 'lucide-react';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ProfilPerusahaan, Rekening } from '../../server/types.ts';
import { CashFlowDirection } from './Sidebar.tsx';

const isAiStudioOrLocal =
  typeof window === 'undefined' ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname.startsWith('ais-');

export const ERP_FULL_VIEW_SHARED_URL = isAiStudioOrLocal
  ? 'https://ais-pre-ynez6daz23cz4wbfcoqdvf-293331351835.asia-southeast1.run.app'
  : window.location.origin;
export const ERP_FULL_VIEW_DEV_URL = isAiStudioOrLocal
  ? 'https://ais-dev-ynez6daz23cz4wbfcoqdvf-293331351835.asia-southeast1.run.app'
  : window.location.origin;

interface HeaderProps {
  rekeningList: Rekening[];
  profilPerusahaan?: ProfilPerusahaan | null;
  onRefresh: () => void;
  onOpenSupabaseSync?: () => void;
  supabaseConfigured?: boolean;
  onOpenBillboard?: () => void;
  onOpenProfilPerusahaan?: () => void;
  activePageLabel?: string;
  activeCashFlow?: CashFlowDirection;
  onToggleMobileSidebar?: () => void;
  onOpenFullLinkModal?: () => void;
  onOpenBosAccessModal?: () => void;
  onLockScreen?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  rekeningList,
  profilPerusahaan,
  onRefresh,
  onOpenSupabaseSync,
  supabaseConfigured,
  onOpenBillboard,
  onOpenProfilPerusahaan,
  activePageLabel,
  activeCashFlow,
  onToggleMobileSidebar,
  onOpenFullLinkModal,
  onOpenBosAccessModal,
  onLockScreen,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');
  const [copiedQuick, setCopiedQuick] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const date = now.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const time = now
        .toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        .replace(/\./g, ':');
      setTimeStr(`${date} · ${time} WIB`);
    };

    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

  const safeRekeningList = Array.isArray(rekeningList) ? rekeningList : [];
  const kas01 = safeRekeningList.find((r) => r && r.kode === 'KAS01');
  const bon01 = safeRekeningList.find((r) => r && r.kode === 'BON01');
  const banksTotal = safeRekeningList
    .filter(
      (r) =>
        r &&
        (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode?.startsWith('REK-'))) &&
        r.kode !== 'KAS01' &&
        r.status === 'AKTIF'
    )
    .reduce((sum, r) => sum + (Number(r?.saldoSaatIni) || 0), 0);

  // Pick current host if already on run.app, otherwise default to shared preview URL
  const directFullScreenHref =
    typeof window !== 'undefined' && window.location.origin.includes('.run.app')
      ? window.location.origin
      : ERP_FULL_VIEW_SHARED_URL;

  const handleQuickCopyLink = () => {
    navigator.clipboard.writeText(ERP_FULL_VIEW_SHARED_URL).then(() => {
      setCopiedQuick(true);
      setTimeout(() => setCopiedQuick(false), 2500);
    });
  };

  return (
    <header className="bg-white/95 backdrop-blur-xs text-slate-900 border-b border-slate-200/90 sticky top-0 z-30">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-16">
        {/* Left: Mobile Menu Button + Brand Identity + Active Breadcrumb */}
        <div className="flex items-center space-x-3 min-w-0">
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div
            onClick={onOpenProfilPerusahaan}
            className="flex items-center space-x-2.5 cursor-pointer group min-w-0"
            title={`Klik untuk membuka atau mengedit Profil Perusahaan (${profilPerusahaan?.namaPerusahaan || 'PT. Wijaya Agro Perkasa'})`}
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 group-hover:bg-emerald-700 flex items-center justify-center shadow-2xs transition-colors shrink-0">
              <Sprout className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="font-bold text-sm sm:text-base tracking-tight text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                  {profilPerusahaan?.namaPerusahaan || 'PT. Wijaya Agro Perkasa'}
                </span>
                {activePageLabel && (
                  <>
                    <span className="hidden md:inline text-slate-300">/</span>
                    <span className="hidden md:inline text-xs font-semibold text-slate-700 truncate">
                      {activePageLabel}
                    </span>
                  </>
                )}
                {activeCashFlow === 'MASUK' && (
                  <>
                    <span className="hidden lg:inline text-slate-300">·</span>
                    <span className="hidden lg:inline font-mono text-xs font-bold text-emerald-700 whitespace-nowrap">
                      + Jalan Uang Masuk
                    </span>
                  </>
                )}
                {activeCashFlow === 'KELUAR' && (
                  <>
                    <span className="hidden lg:inline text-slate-300">·</span>
                    <span className="hidden lg:inline font-mono text-xs font-bold text-rose-700 whitespace-nowrap">
                      − Jalan Uang Keluar
                    </span>
                  </>
                )}
                {activeCashFlow === 'MUTASI' && (
                  <>
                    <span className="hidden lg:inline text-slate-300">·</span>
                    <span className="hidden lg:inline font-mono text-xs font-bold text-sky-700 whitespace-nowrap">
                      ⇄ Mutasi Kas Internal
                    </span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-slate-500 truncate hidden sm:block">
                Sistem Operasional Kasir, Stok &amp; Keuangan Terpadu
              </p>
            </div>
          </div>
        </div>

        {/* Center: Calm Financial Quick Strip */}
        <div className="hidden xl:flex items-center divide-x divide-slate-200/90 bg-slate-50/90 border border-slate-200/80 px-3.5 py-1.5 rounded-xl text-xs">
          <div
            className="flex items-center space-x-1.5 pr-3.5 whitespace-nowrap"
            title={`Kas Kasir (KAS01): ${formatRupiah(kas01?.saldoSaatIni || 0)}`}
          >
            <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-slate-500">KAS01:</span>
            <span className="font-bold font-mono tabular-nums text-slate-900">
              {formatRupiahSingkat(kas01?.saldoSaatIni || 0)}
            </span>
          </div>
          <div
            className="flex items-center space-x-1.5 px-3.5 whitespace-nowrap"
            title={`Bank Perusahaan: ${formatRupiah(banksTotal)}`}
          >
            <Landmark className="w-3.5 h-3.5 text-sky-600 shrink-0" />
            <span className="text-slate-500">Bank:</span>
            <span className="font-bold font-mono tabular-nums text-slate-900">
              {formatRupiahSingkat(banksTotal)}
            </span>
          </div>
          <div
            className="flex items-center space-x-1.5 pl-3.5 whitespace-nowrap"
            title={`Piutang BON01: ${formatRupiah(bon01?.saldoSaatIni || 0)}`}
          >
            <span className="text-slate-500">Piutang BON01:</span>
            <span className="font-bold font-mono tabular-nums text-amber-700">
              {formatRupiahSingkat(bon01?.saldoSaatIni || 0)}
            </span>
          </div>
        </div>

        {/* Right: Clean Utility & Full-View Actions */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all cursor-pointer"
            title="Segarkan seluruh data ERP"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {onOpenProfilPerusahaan && (
            <button
              type="button"
              onClick={onOpenProfilPerusahaan}
              className="hidden md:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              title="Edit Profil Perusahaan & Kop Struk"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Profil PT</span>
            </button>
          )}

          {onOpenBillboard && (
            <button
              type="button"
              onClick={onOpenBillboard}
              className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
              title="Buka Layar Monitor TV / Billboard"
            >
              <Tv className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden lg:inline">Layar TV</span>
            </button>
          )}

          {onOpenBosAccessModal && (
            <button
              type="button"
              onClick={onOpenBosAccessModal}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Atur Sandi Bos & Sandi Admin atau Pratinjau Tampilan Bos"
            >
              <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Sandi &amp; Bos</span>
            </button>
          )}

          {onLockScreen && (
            <button
              type="button"
              onClick={onLockScreen}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Kunci tampilan & kembali ke layar input sandi"
            >
              <Lock className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden md:inline">Kunci</span>
            </button>
          )}

          {onOpenSupabaseSync && (
            <button
              type="button"
              onClick={onOpenSupabaseSync}
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                supabaseConfigured
                  ? 'bg-emerald-50/70 hover:bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 hover:bg-amber-100/70 border-amber-200 text-amber-900'
              }`}
              title={
                supabaseConfigured
                  ? 'Cloud Supabase Terhubung'
                  : 'Hubungkan Database ke Cloud Supabase'
              }
            >
              <Cloud
                className={`w-3.5 h-3.5 ${
                  supabaseConfigured ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <span className="hidden md:inline">
                {supabaseConfigured ? 'Cloud Aktif' : 'Cloud Sync'}
              </span>
            </button>
          )}

          {/* Split Full-Screen Link Action: Copy Link / Modal + Direct Open New Tab */}
          <div className="flex items-center rounded-xl shadow-2xs">
            <button
              type="button"
              onClick={onOpenFullLinkModal || handleQuickCopyLink}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-l-xl bg-emerald-50 hover:bg-emerald-100 border border-r-0 border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer"
              title="Lihat & salin link akses Full Tampilan"
            >
              {copiedQuick ? (
                <Check className="w-3.5 h-3.5 text-emerald-700" />
              ) : (
                <Link2 className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span className="hidden sm:inline">{copiedQuick ? 'Tersalin' : 'Salin Link'}</span>
            </button>
            <a
              href={directFullScreenHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-r-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Buka Full Tampilan langsung di Tab Baru Browser"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Tampilan</span>
            </a>
          </div>

          <div className="hidden 2xl:flex items-center space-x-1.5 pl-2 border-l border-slate-200 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono tabular-nums">{timeStr}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
