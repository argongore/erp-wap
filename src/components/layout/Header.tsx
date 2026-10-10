import React, { useState, useEffect } from 'react';
import { Sprout, Clock, ShieldCheck, Wallet, Landmark, FileSpreadsheet, Tv, ExternalLink } from 'lucide-react';
import { formatRupiah } from '../../utils/format.ts';
import { Rekening } from '../../server/types.ts';

interface HeaderProps {
  rekeningList: Rekening[];
  onRefresh: () => void;
  onOpenSheetsSync?: () => void;
  onOpenBillboard?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  rekeningList,
  onRefresh,
  onOpenSheetsSync,
  onOpenBillboard,
}) => {
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const date = now.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const time = now.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(/\./g, ':');
      setTimeStr(`${date} · ${time} WIB`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');
  const bon01 = rekeningList.find((r) => r.kode === 'BON01');
  const banksTotal = rekeningList
    .filter(
      (r) =>
        (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode.startsWith('REK-'))) &&
        r.kode !== 'KAS01' &&
        r.status === 'AKTIF'
    )
    .reduce((sum, r) => sum + r.saldoSaatIni, 0);

  return (
    <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-30 shadow-xs">
      <div className="flex items-center justify-between px-6 py-2.5">
        {/* Brand identity */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center shadow-xs">
            <Sprout className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base tracking-tight text-white uppercase">ERP WIJAYA AGRO</span>
              <span className="text-[10px] font-semibold bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded tracking-wide">
                OPERASIONAL
              </span>
            </div>
            <p className="text-[11px] text-emerald-300">PT Wijaya Agro Persada · Sistem Keuangan Terpadu</p>
          </div>
        </div>

        {/* Live Saldo Quick Ribbon */}
        <div className="hidden lg:flex items-center space-x-4 bg-emerald-900/60 border border-emerald-800/80 px-4 py-1.5 rounded-lg text-xs">
          <div className="flex items-center space-x-1.5 border-r border-emerald-800 pr-3">
            <Wallet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-300">Kas Kasir (KAS01):</span>
            <span className="font-semibold text-white">{formatRupiah(kas01?.saldoSaatIni || 0)}</span>
          </div>
          <div className="flex items-center space-x-1.5 border-r border-emerald-800 pr-3">
            <Landmark className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-emerald-300">Bank Perusahaan:</span>
            <span className="font-semibold text-white">{formatRupiah(banksTotal)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-amber-300 font-medium">Piutang BON01:</span>
            <span className="font-semibold text-amber-200">{formatRupiah(bon01?.saldoSaatIni || 0)}</span>
          </div>
        </div>

        {/* Time & Cashier Status */}
        <div className="flex items-center space-x-2.5">
          {onOpenBillboard && (
            <button
              onClick={onOpenBillboard}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-900/90 hover:bg-emerald-800 border border-emerald-600/70 text-emerald-200 text-xs font-bold transition-all shadow-xs cursor-pointer group"
              title="Buka Layar Monitor Billboard / TV Display"
            >
              <Tv className="w-3.5 h-3.5 text-emerald-400 group-hover:animate-pulse" />
              <span className="hidden sm:inline">Layar Billboard</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
          )}

          {onOpenSheetsSync && (
            <button
              onClick={onOpenSheetsSync}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-800/80 hover:bg-emerald-800 border border-emerald-700 text-emerald-200 text-xs font-medium transition-colors cursor-pointer"
              title="Buka Pusat Database Multi-Spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span className="hidden md:inline">Database Spreadsheet</span>
            </button>
          )}

          <a
            href="https://ais-dev-ynez6daz23cz4wbfcoqdvf-293331351835.asia-southeast1.run.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Buka Layar Penuh Desktop di Tab Baru Browser"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Layar Penuh Desktop</span>
          </a>

          <div className="text-right hidden sm:block">
            <div className="flex items-center justify-end space-x-1.5 text-xs text-emerald-200">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono">{timeStr}</span>
            </div>
            <div className="flex items-center justify-end space-x-1 text-[11px] text-emerald-400">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Kasir: KasirWap (Aktif)</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
