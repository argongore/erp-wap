import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Wheat,
  HandCoins,
  Receipt,
  ArrowLeftRight,
  Package,
  PackagePlus,
  TrendingUp,
  Users,
  Building2,
  Briefcase,
  Boxes,
  FileSpreadsheet,
  FileText,
  History,
  ChevronDown,
  Tv,
  Database,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'billboard-monitor'
  | 'kasir-penjualan'
  | 'kasir-pembelian-barang'
  | 'kasir-pembelian'
  | 'kasir-kasbon-uang'
  | 'kasir-bayar-bon'
  | 'kasir-transfer'
  | 'master-produk'
  | 'master-mitra'
  | 'master-rekening'
  | 'master-karyawan'
  | 'menu-divisi'
  | 'stok-barang'
  | 'stok-hasil-bumi'
  | 'laba-rugi-produk'
  | 'rekening-koran-mitra'
  | 'laporan-transaksi'
  | 'audit-log'
  | 'google-sheets-sync';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const isKasirActive = activeTab.startsWith('kasir-');

  return (
    <aside className="w-64 h-full bg-zinc-900 text-zinc-300 flex flex-col shrink-0 border-r border-zinc-800 select-none overflow-hidden">
      <div className="p-3 overflow-y-auto space-y-6 flex-1 text-xs overscroll-contain">
        {/* Section 1: Dashboard & Billboard */}
        <div className="space-y-1.5">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span className="text-sm">1. DASHBOARD</span>
          </button>

          {/* Billboard / Command Center Button */}
          <button
            onClick={() => setActiveTab('billboard-monitor')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-bold transition-all ${
              activeTab === 'billboard-monitor'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                : 'bg-zinc-800/90 text-emerald-400 hover:bg-zinc-800 hover:text-emerald-300 border border-emerald-900/60'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Tv className="w-4 h-4 text-emerald-400" />
              <span className="text-xs">LAYAR BILLBOARD</span>
            </div>
            <span className="flex items-center space-x-1 text-[9px] bg-emerald-950 text-emerald-300 font-mono px-1.5 py-0.2 rounded border border-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE TV</span>
            </span>
          </button>
        </div>

        {/* Section 2: Kasir Submenus */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 py-1 text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
            <span>2. KASIR TRANSAKSI</span>
          </div>

          <div className="space-y-0.5 pl-2">
            <button
              onClick={() => setActiveTab('kasir-penjualan')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'kasir-penjualan'
                  ? 'bg-emerald-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
              <span>Penjualan Toko (Nego)</span>
            </button>

            {/* Pembelian Barang Dagang / Distributor & Pemasok */}
            <button
              onClick={() => setActiveTab('kasir-pembelian-barang')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                activeTab === 'kasir-pembelian-barang'
                  ? 'bg-amber-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <PackagePlus className="w-4 h-4 text-amber-400" />
                <span>Distributor &amp; Pemasok (Beli)</span>
              </div>
              <span className="text-[9px] bg-amber-950 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-800">
                PASOK
              </span>
            </button>

            <button
              onClick={() => setActiveTab('kasir-pembelian')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'kasir-pembelian'
                  ? 'bg-emerald-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <Wheat className="w-4 h-4 text-amber-400" />
              <span>Pembelian Hasil Bumi</span>
            </button>

            {/* Kasbon Uang & Nota Lalu */}
            <button
              onClick={() => setActiveTab('kasir-kasbon-uang')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                activeTab === 'kasir-kasbon-uang'
                  ? 'bg-emerald-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <HandCoins className="w-4 h-4 text-rose-400" />
                <span>Kasbon &amp; Nota Lalu</span>
              </div>
              <span className="text-[9px] bg-rose-950 text-rose-300 font-bold px-1.5 py-0.5 rounded border border-rose-800">
                BON
              </span>
            </button>

            {/* Bayar Bon */}
            <button
              onClick={() => setActiveTab('kasir-bayar-bon')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'kasir-bayar-bon'
                  ? 'bg-emerald-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>Bayar Bon</span>
            </button>

            {/* Transfer Antar Rekening */}
            <button
              onClick={() => setActiveTab('kasir-transfer')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'kasir-transfer'
                  ? 'bg-emerald-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4 text-sky-400" />
              <span>Transfer Antar Rekening</span>
            </button>
          </div>
        </div>

        {/* Section 3: Master Data */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-zinc-400 tracking-wider uppercase">
            MASTER DATA
          </div>
          <div className="space-y-0.5 pl-2">
            <button
              onClick={() => setActiveTab('master-produk')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'master-produk'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Package className="w-4 h-4 text-emerald-400" />
              <span>3. Master Produk</span>
            </button>

            <button
              onClick={() => setActiveTab('master-mitra')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'master-mitra'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span>4. Master Mitra</span>
            </button>

            <button
              onClick={() => setActiveTab('master-rekening')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'master-rekening'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>5. Master Rekening</span>
            </button>
          </div>
        </div>

        {/* Section: SDM & Divisi Bisnis (Sub-menu Terpisah tapi Terintegrasi) */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-amber-400 tracking-wider uppercase flex items-center justify-between">
            <span>SDM & DIVISI BISNIS</span>
            <span className="text-[9px] bg-amber-950/80 text-amber-300 font-mono px-1.5 py-0.2 rounded border border-amber-800">
              INTEGRATED
            </span>
          </div>
          <div className="space-y-1 pl-2">
            {/* Submenu 1: Karyawan */}
            <button
              onClick={() => setActiveTab('master-karyawan')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${
                activeTab === 'master-karyawan'
                  ? 'bg-amber-600 text-white font-bold shadow-md'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white bg-zinc-800/40 border border-amber-800/40'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-md ${activeTab === 'master-karyawan' ? 'bg-amber-800 text-amber-200' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}>
                  <Briefcase className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold">Rekap Karyawan &amp; Upah</div>
                  <div className="text-[10px] text-zinc-400">Tabel Rekap, Gaji Harian, Bon</div>
                </div>
              </div>
              <span className="text-[9px] bg-amber-950 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-800">
                SDM REKAP
              </span>
            </button>

            {/* Submenu 2: Divisi */}
            <button
              onClick={() => setActiveTab('menu-divisi')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                activeTab === 'menu-divisi'
                  ? 'bg-zinc-800 text-white font-semibold border-l-2 border-emerald-400 shadow-xs'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <div className={`p-1.5 rounded-md ${activeTab === 'menu-divisi' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-zinc-800/80 text-zinc-400'}`}>
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold">Divisi & Kas Operasional</div>
                  <div className="text-[10px] text-zinc-400">6 Unit, Saldo & Dropping</div>
                </div>
              </div>
              <span className="text-[9px] bg-emerald-950 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-800">
                6 DIVISI
              </span>
            </button>
          </div>
        </div>

        {/* Section 4: Stok */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-zinc-400 tracking-wider uppercase">
            MANAJEMEN STOK
          </div>
          <div className="space-y-0.5 pl-2">
            <button
              onClick={() => setActiveTab('stok-barang')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'stok-barang'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Boxes className="w-4 h-4 text-teal-400" />
              <span>6. Stok Barang Toko</span>
            </button>

            <button
              onClick={() => setActiveTab('stok-hasil-bumi')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'stok-hasil-bumi'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <Wheat className="w-4 h-4 text-amber-500" />
              <span>7. Stok Hasil Bumi</span>
            </button>
          </div>
        </div>

        {/* Section 5: Laporan & Audit */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-zinc-400 tracking-wider uppercase">
            LAPORAN & AUDIT
          </div>
          <div className="space-y-0.5 pl-2">
            {/* Laba Rugi Produk */}
            <button
              onClick={() => setActiveTab('laba-rugi-produk')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                activeTab === 'laba-rugi-produk'
                  ? 'bg-emerald-700/80 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>8. Laba &amp; Rugi Produk</span>
              </div>
              <span className="text-[9px] bg-emerald-950 text-emerald-300 font-bold px-1.5 py-0.2 rounded border border-emerald-800">
                PROFIT
              </span>
            </button>

            <button
              onClick={() => setActiveTab('rekening-koran-mitra')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'rekening-koran-mitra'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
              <span>9. Rekening Koran Mitra</span>
            </button>

            <button
              onClick={() => setActiveTab('laporan-transaksi')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'laporan-transaksi'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>10. Laporan Transaksi</span>
            </button>

            <button
              onClick={() => setActiveTab('audit-log')}
              className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md transition-colors ${
                activeTab === 'audit-log'
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <History className="w-4 h-4 text-yellow-400" />
              <span>11. Audit / Log Transaksi</span>
            </button>
          </div>
        </div>

        {/* Section 6: Studio Database Master & Multi-Spreadsheet */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-bold text-emerald-400 tracking-wider uppercase flex items-center justify-between">
            <span>DATABASE MASTER &amp; SHEETS</span>
            <span className="text-[9px] bg-emerald-950 text-emerald-300 font-bold px-1.5 py-0.2 rounded border border-emerald-800">
              10 TABEL
            </span>
          </div>
          <div className="space-y-0.5 pl-2">
            <button
              onClick={() => setActiveTab('google-sheets-sync')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                activeTab === 'google-sheets-sync'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-bold shadow-md'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>11. Studio Database Master</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-zinc-950 border-t border-zinc-800 text-[11px] text-zinc-500 flex justify-between items-center">
        <span>ERP Wijaya Agro v2.4</span>
        <span className="text-emerald-500 font-mono">ONLINE</span>
      </div>
    </aside>
  );
};
