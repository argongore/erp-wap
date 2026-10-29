import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Wheat,
  HandCoins,
  Receipt,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  PackagePlus,
  TrendingUp,
  Users,
  Building2,
  Briefcase,
  Boxes,
  FileText,
  History,
  Tv,
  Database,
  Cloud,
  Scale,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Wallet,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
  Truck,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'billboard-monitor'
  | 'rekap-semua-transaksi'
  | 'pusat-kontrol-kasir'
  | 'kasir-penjualan'
  | 'kasir-pembelian-barang'
  | 'kasir-pembelian'
  | 'kasir-cairkan-titipan'
  | 'kasir-bayar-gaji'
  | 'kasir-kasbon-uang'
  | 'kasir-bayar-bon'
  | 'kasir-pengeluaran'
  | 'kasir-transfer'
  | 'master-produk'
  | 'master-mitra'
  | 'master-rekening'
  | 'master-inventaris'
  | 'master-profil'
  | 'master-karyawan'
  | 'menu-divisi'
  | 'stok-barang'
  | 'stok-hasil-bumi'
  | 'laba-rugi-produk'
  | 'rekening-koran-mitra'
  | 'laporan-transaksi'
  | 'audit-log'
  | 'google-sheets-sync';

export type CashFlowDirection = 'MASUK' | 'KELUAR' | 'MUTASI' | null;

export const ACTIVE_TAB_LABELS: Record<ActiveTab, string> = {
  dashboard: 'Dashboard Operasional',
  'billboard-monitor': 'Layar Monitor TV',
  'rekap-semua-transaksi': 'Rekap Transaksi Harian',
  'pusat-kontrol-kasir': 'Kliring & Cash Opname',
  'kasir-penjualan': 'Kasir Penjualan Toko',
  'kasir-pembelian-barang': 'Pembelian Stok Pemasok',
  'kasir-pembelian': 'Pembelian Hasil Bumi',
  'kasir-cairkan-titipan': 'Pembayaran PT ke Mitra (Titipan)',
  'kasir-bayar-gaji': 'Bayar Gaji Karyawan',
  'kasir-kasbon-uang': 'Kasbon Uang & Nota Lalu',
  'kasir-bayar-bon': 'Pelunasan Bon Mitra',
  'kasir-pengeluaran': 'Pengeluaran & Biaya Divisi',
  'kasir-transfer': 'Transfer Antar Rekening',
  'master-produk': 'Master Produk & Harga',
  'master-mitra': 'Master Mitra & Pelanggan',
  'master-rekening': 'Master Rekening & Kas',
  'master-inventaris': 'Inventaris & Armada PT',
  'master-profil': 'Profil Perusahaan',
  'master-karyawan': 'Rekap Karyawan & Upah',
  'menu-divisi': 'Divisi & Kas Operasional',
  'stok-barang': 'Stok Barang Toko',
  'stok-hasil-bumi': 'Stok & Rekap Hasil Bumi',
  'laba-rugi-produk': 'Laba & Rugi Produk',
  'rekening-koran-mitra': 'Rekening Koran Mitra',
  'laporan-transaksi': 'Rekap Semua Transaksi',
  'audit-log': 'Audit Log Transaksi',
  'google-sheets-sync': 'Studio Database Master',
};

export const ACTIVE_TAB_CASH_FLOW: Record<ActiveTab, CashFlowDirection> = {
  dashboard: null,
  'billboard-monitor': null,
  'rekap-semua-transaksi': null,
  'pusat-kontrol-kasir': null,
  'kasir-penjualan': 'MASUK',
  'kasir-bayar-bon': 'MASUK',
  'kasir-pembelian-barang': 'KELUAR',
  'kasir-pembelian': 'KELUAR',
  'kasir-cairkan-titipan': 'KELUAR',
  'kasir-bayar-gaji': 'KELUAR',
  'kasir-kasbon-uang': 'KELUAR',
  'kasir-pengeluaran': 'KELUAR',
  'kasir-transfer': 'MUTASI',
  'master-produk': null,
  'master-mitra': null,
  'master-rekening': null,
  'master-inventaris': null,
  'master-profil': null,
  'master-karyawan': null,
  'menu-divisi': null,
  'stok-barang': null,
  'stok-hasil-bumi': null,
  'laba-rugi-produk': null,
  'rekening-koran-mitra': null,
  'laporan-transaksi': null,
  'audit-log': null,
  'google-sheets-sync': null,
};

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenProfilModal?: () => void;
  onOpenPinjamUangModal?: () => void;
  onOpenSupabaseSync?: () => void;
  supabaseConfigured?: boolean;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenFullLinkModal?: () => void;
}

interface NavItemConfig {
  id: string;
  label: string;
  sublabel?: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  flow?: CashFlowDirection;
  tab?: ActiveTab;
  matchTabs?: ActiveTab[];
  action?: () => void;
}

interface NavGroupConfig {
  id: string;
  title: string;
  groupTone?: 'masuk' | 'keluar' | 'mutasi' | 'neutral';
  items: NavItemConfig[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenProfilModal,
  onOpenPinjamUangModal,
  onOpenSupabaseSync,
  supabaseConfigured,
  mobileOpen = false,
  onCloseMobile,
  collapsed = false,
  onToggleCollapse,
  onOpenFullLinkModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [flowFilter, setFlowFilter] = useState<'ALL' | 'MASUK' | 'KELUAR'>('ALL');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    onCloseMobile?.();
  };

  const navGroups: NavGroupConfig[] = useMemo(
    () => [
      {
        id: 'utama',
        title: 'Utama & Kontrol',
        groupTone: 'neutral',
        items: [
          {
            id: 'dashboard',
            label: 'Dashboard Utama',
            sublabel: 'Ringkasan kas, bon & stok',
            keywords: 'dashboard beranda ringkasan kasir utama',
            icon: LayoutDashboard,
            tab: 'dashboard',
          },
          {
            id: 'rekap-harian',
            label: 'Rekap Transaksi Harian',
            sublabel: 'Jurnal kas masuk & keluar',
            keywords: 'rekap harian semua transaksi jurnal laporan edit',
            icon: Receipt,
            tab: 'rekap-semua-transaksi',
            matchTabs: ['rekap-semua-transaksi', 'laporan-transaksi'],
          },
          {
            id: 'kontrol-kasir',
            label: 'Kliring & Opname Kas',
            sublabel: 'Potong bon, merger & laci',
            keywords: 'kliring silang cash opname laci duplikat kembar',
            icon: Scale,
            tab: 'pusat-kontrol-kasir',
          },
          {
            id: 'billboard',
            label: 'Layar Monitor TV',
            sublabel: 'Tampilan ruang pantau',
            keywords: 'billboard tv monitor layar penuh',
            icon: Tv,
            tab: 'billboard-monitor',
          },
        ],
      },
      {
        id: 'kasir-masuk',
        title: 'Jalan Uang Masuk (+)',
        groupTone: 'masuk',
        items: [
          {
            id: 'kasir-penjualan',
            label: 'Penjualan Toko',
            sublabel: 'Uang masuk jual barang',
            keywords: 'kasir penjualan toko barang eceran nego struk uang masuk kas in',
            icon: ShoppingCart,
            flow: 'MASUK',
            tab: 'kasir-penjualan',
          },
          {
            id: 'kasir-bayar-bon',
            label: 'Pelunasan Bon Mitra',
            sublabel: 'Setor sisa bon bersih mitra',
            keywords: 'bayar bon cicilan pelunasan hutang piutang mitra uang masuk kas in',
            icon: Receipt,
            flow: 'MASUK',
            tab: 'kasir-bayar-bon',
          },
          {
            id: 'pinjam-uang-pt',
            label: 'Terima Pinjaman Mitra',
            sublabel: 'Dana masuk kas PT (+Titip)',
            keywords: 'pinjam uang pt mitra tambah saldo titip modal uang masuk kas in',
            icon: Wallet,
            flow: 'MASUK',
            action: () => {
              if (onOpenPinjamUangModal) {
                onOpenPinjamUangModal();
              } else {
                setActiveTab('master-mitra');
              }
              onCloseMobile?.();
            },
          },
        ],
      },
      {
        id: 'kasir-keluar',
        title: 'Jalan Uang Keluar (−)',
        groupTone: 'keluar',
        items: [
          {
            id: 'kasir-pembelian',
            label: 'Pembelian Hasil Bumi',
            sublabel: 'Bayar timbangan panen',
            keywords: 'beli pembelian hasil bumi panen jagung kopi lada timbangan uang keluar kas out',
            icon: Wheat,
            flow: 'KELUAR',
            tab: 'kasir-pembelian',
          },
          {
            id: 'kasir-cairkan-titipan',
            label: 'Pembayaran PT ke Mitra',
            sublabel: 'Bayar bersih titipan panen',
            keywords: 'pembayaran pt ke mitra bayar cairkan titipan hasil bumi saldo titip petani potong bon uang keluar kas out',
            icon: HandCoins,
            flow: 'KELUAR',
            tab: 'kasir-cairkan-titipan',
          },
          {
            id: 'kasir-bayar-gaji',
            label: 'Bayar Gaji Karyawan',
            sublabel: 'Gaji bulanan, upah & potong bon',
            keywords: 'bayar gaji karyawan bulanan harian slip upah potong kasbon sdm uang keluar kas out',
            icon: Briefcase,
            flow: 'KELUAR',
            tab: 'kasir-bayar-gaji',
          },
          {
            id: 'kasir-kasbon-uang',
            label: 'Kasbon & Nota Lalu',
            sublabel: 'Pinjaman tunai ke mitra',
            keywords: 'kasbon uang pinjaman bon piutang nota lalu uang keluar kas out',
            icon: HandCoins,
            flow: 'KELUAR',
            tab: 'kasir-kasbon-uang',
          },
          {
            id: 'kasir-pembelian-barang',
            label: 'Pembelian Stok Pemasok',
            sublabel: 'Bayar kulakan distributor',
            keywords: 'kulakan distributor pemasok beli stok barang hpp uang keluar kas out',
            icon: PackagePlus,
            flow: 'KELUAR',
            tab: 'kasir-pembelian-barang',
          },
          {
            id: 'kasir-pengeluaran',
            label: 'Pengeluaran & Biaya',
            sublabel: 'Biaya operasional & divisi',
            keywords: 'pengeluaran biaya operasional bensin makan listrik divisi uang keluar kas out',
            icon: FileText,
            flow: 'KELUAR',
            tab: 'kasir-pengeluaran',
          },
        ],
      },
      {
        id: 'kasir-mutasi',
        title: 'Mutasi Kas Internal (⇄)',
        groupTone: 'mutasi',
        items: [
          {
            id: 'kasir-transfer',
            label: 'Transfer Antar Rekening',
            sublabel: 'Pindah buku kas & bank PT',
            keywords: 'transfer mutasi pindah buku rekening bank kas internal',
            icon: ArrowLeftRight,
            flow: 'MUTASI',
            tab: 'kasir-transfer',
          },
        ],
      },
      {
        id: 'stok',
        title: 'Gudang & Persediaan',
        groupTone: 'neutral',
        items: [
          {
            id: 'stok-barang',
            label: 'Stok Barang Toko',
            sublabel: 'Kartu stok & penyesuaian',
            keywords: 'stok barang toko gudang pupuk obat pakan',
            icon: Boxes,
            tab: 'stok-barang',
          },
          {
            id: 'stok-hasil-bumi',
            label: 'Stok & Jual Hasil Bumi',
            sublabel: 'Rekap bulanan & jual gudang',
            keywords: 'stok hasil bumi gudang bulanan terjual ready tonase uang masuk',
            icon: Wheat,
            tab: 'stok-hasil-bumi',
          },
        ],
      },
      {
        id: 'sdm',
        title: 'SDM & Divisi Bisnis',
        groupTone: 'neutral',
        items: [
          {
            id: 'master-karyawan',
            label: 'Karyawan & Upah',
            sublabel: 'Absensi, bayar gaji & bon',
            keywords: 'karyawan sdm gaji upah bulanan harian bon pekerja mitra',
            icon: Briefcase,
            tab: 'master-karyawan',
          },
          {
            id: 'menu-divisi',
            label: 'Divisi & Kas Unit',
            sublabel: 'Alokasi 6 unit operasional',
            keywords: 'divisi unit bisnis operasional dropping anggaran',
            icon: Building2,
            tab: 'menu-divisi',
          },
        ],
      },
      {
        id: 'master',
        title: 'Master Data',
        groupTone: 'neutral',
        items: [
          {
            id: 'master-produk',
            label: 'Master Produk & Harga',
            keywords: 'master produk katalog harga jual beli kategori',
            icon: Package,
            tab: 'master-produk',
          },
          {
            id: 'master-mitra',
            label: 'Master Mitra & Pelanggan',
            keywords: 'master mitra petani pelanggan pemasok supplier',
            icon: Users,
            tab: 'master-mitra',
          },
          {
            id: 'master-rekening',
            label: 'Master Rekening & Kas',
            keywords: 'master rekening bank kas brankas saldo awal',
            icon: Building2,
            tab: 'master-rekening',
          },
          {
            id: 'master-inventaris',
            label: 'Inventaris & Armada PT',
            keywords: 'inventaris armada mobil truck l300 plat polisi driver pajak stnk tahun',
            icon: Truck,
            tab: 'master-inventaris',
          },
          {
            id: 'master-profil',
            label: 'Profil Perusahaan',
            keywords: 'profil perusahaan pt wijaya agro alamat struk kop',
            icon: Building2,
            tab: 'master-profil',
            action: () => {
              if (onOpenProfilModal) onOpenProfilModal();
              else setActiveTab('master-profil');
              onCloseMobile?.();
            },
          },
        ],
      },
      {
        id: 'laporan',
        title: 'Laporan & Cloud',
        groupTone: 'neutral',
        items: [
          {
            id: 'laba-rugi-produk',
            label: 'Laba & Rugi Produk',
            keywords: 'laba rugi margin profit keuntungan produk',
            icon: TrendingUp,
            tab: 'laba-rugi-produk',
          },
          {
            id: 'rekening-koran-mitra',
            label: 'Rekening Koran Mitra',
            keywords: 'rekening koran mutasi riwayat mitra buku bon titip',
            icon: FileText,
            tab: 'rekening-koran-mitra',
          },
          {
            id: 'audit-log',
            label: 'Audit Log Transaksi',
            keywords: 'audit log riwayat perubahan sistem keamanan',
            icon: History,
            tab: 'audit-log',
          },
          {
            id: 'google-sheets-sync',
            label: 'Studio Database Master',
            keywords: 'database tabel ekspor impor backup excel json',
            icon: Database,
            tab: 'google-sheets-sync',
          },
          ...(onOpenSupabaseSync
            ? [
                {
                  id: 'supabase-sync',
                  label: supabaseConfigured ? 'Cloud Supabase (Aktif)' : 'Hubungkan Cloud Supabase',
                  keywords: 'supabase cloud sinkronisasi backup online database',
                  icon: Cloud,
                  action: () => {
                    onOpenSupabaseSync();
                    onCloseMobile?.();
                  },
                },
              ]
            : []),
        ],
      },
    ],
    [onOpenPinjamUangModal, onOpenProfilModal, onOpenSupabaseSync, supabaseConfigured, setActiveTab, onCloseMobile]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (flowFilter !== 'ALL' && item.flow !== flowFilter) {
            return false;
          }
          if (!normalizedSearch) return true;
          return (
            item.label.toLowerCase().includes(normalizedSearch) ||
            (item.sublabel && item.sublabel.toLowerCase().includes(normalizedSearch)) ||
            item.keywords.toLowerCase().includes(normalizedSearch)
          );
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, normalizedSearch, flowFilter]);

  const isItemActive = (item: NavItemConfig) => {
    if (item.matchTabs) return item.matchTabs.includes(activeTab);
    if (item.tab) return activeTab === item.tab;
    return false;
  };

  const renderSidebarContent = (isMobileDrawer: boolean) => {
    const isNarrow = !isMobileDrawer && collapsed;

    return (
      <div className="flex flex-col h-full bg-white text-slate-700 select-none">
        {/* Top Search & Cash-Flow Quick Filter */}
        <div className="p-3 border-b border-slate-100 space-y-2.5 shrink-0">
          {isMobileDrawer ? (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-900 tracking-tight">Navigasi Menu ERP</span>
              <button
                type="button"
                onClick={onCloseMobile}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : null}

          {!isNarrow ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari menu kasir / laporan..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200/90 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      title="Bersihkan pencarian"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {!isMobileDrawer && onToggleCollapse && (
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    title="Kecilkan sidebar untuk memperluas area kerja"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Interactive Cash-Flow Segmented Filter */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100/90 rounded-lg">
                <button
                  type="button"
                  onClick={() => setFlowFilter('ALL')}
                  className={`py-1 px-1.5 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    flowFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setFlowFilter(flowFilter === 'MASUK' ? 'ALL' : 'MASUK')}
                  className={`flex items-center justify-center space-x-1 py-1 px-1.5 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    flowFilter === 'MASUK'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                  title="Tampilkan khusus menu Jalan Uang Masuk"
                >
                  <ArrowDownLeft className="w-3 h-3 shrink-0" />
                  <span>Masuk</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlowFilter(flowFilter === 'KELUAR' ? 'ALL' : 'KELUAR')}
                  className={`flex items-center justify-center space-x-1 py-1 px-1.5 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                    flowFilter === 'KELUAR'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                  title="Tampilkan khusus menu Jalan Uang Keluar"
                >
                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                  <span>Keluar</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onToggleCollapse}
                className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Perluas menu sidebar"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 overscroll-contain">
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              Menu tidak ditemukan.
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isGroupCollapsed =
                !normalizedSearch && flowFilter === 'ALL' && Boolean(collapsedGroups[group.id]);

              const headerColorClass =
                group.groupTone === 'masuk'
                  ? 'text-emerald-700 hover:text-emerald-800'
                  : group.groupTone === 'keluar'
                  ? 'text-rose-700 hover:text-rose-800'
                  : group.groupTone === 'mutasi'
                  ? 'text-sky-700 hover:text-sky-800'
                  : 'text-slate-400 hover:text-slate-600';

              return (
                <div key={group.id} className="space-y-1">
                  {!isNarrow && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase transition-colors cursor-pointer ${headerColorClass}`}
                    >
                      <span className="flex items-center space-x-1.5">
                        {group.groupTone === 'masuk' && <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                        {group.groupTone === 'keluar' && <ArrowUpRight className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                        {group.groupTone === 'mutasi' && <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                        <span>{group.title}</span>
                      </span>
                      {isGroupCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                      )}
                    </button>
                  )}

                  {(!isGroupCollapsed || isNarrow) && (
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const active = isItemActive(item);

                        // Distinct visual treatment per cash-flow direction
                        const activeItemStyle =
                          item.flow === 'MASUK'
                            ? 'bg-emerald-50 text-emerald-950 font-semibold ring-1 ring-emerald-300/90 shadow-2xs'
                            : item.flow === 'KELUAR'
                            ? 'bg-rose-50 text-rose-950 font-semibold ring-1 ring-rose-300/90 shadow-2xs'
                            : item.flow === 'MUTASI'
                            ? 'bg-sky-50 text-sky-950 font-semibold ring-1 ring-sky-300/90 shadow-2xs'
                            : 'bg-emerald-50/90 text-emerald-950 font-semibold ring-1 ring-emerald-200/80 shadow-2xs';

                        const idleItemStyle =
                          item.flow === 'MASUK'
                            ? 'text-slate-700 hover:bg-emerald-50/50 hover:text-emerald-950 font-medium'
                            : item.flow === 'KELUAR'
                            ? 'text-slate-700 hover:bg-rose-50/50 hover:text-rose-950 font-medium'
                            : item.flow === 'MUTASI'
                            ? 'text-slate-700 hover:bg-sky-50/50 hover:text-sky-950 font-medium'
                            : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 font-medium';

                        const iconBoxStyle = active
                          ? item.flow === 'KELUAR'
                            ? 'bg-rose-600 text-white shadow-2xs'
                            : item.flow === 'MUTASI'
                            ? 'bg-sky-600 text-white shadow-2xs'
                            : 'bg-emerald-600 text-white shadow-2xs'
                          : item.flow === 'MASUK'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 group-hover:bg-emerald-600 group-hover:text-white'
                          : item.flow === 'KELUAR'
                          ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 group-hover:bg-rose-600 group-hover:text-white'
                          : item.flow === 'MUTASI'
                          ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/80 group-hover:bg-sky-600 group-hover:text-white'
                          : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-emerald-700';

                        const flowPrefixTooltip =
                          item.flow === 'MASUK'
                            ? '[+ UANG MASUK] '
                            : item.flow === 'KELUAR'
                            ? '[− UANG KELUAR] '
                            : item.flow === 'MUTASI'
                            ? '[⇄ MUTASI KAS] '
                            : '';

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.action) {
                                item.action();
                              } else if (item.tab) {
                                handleSelectTab(item.tab);
                              }
                            }}
                            title={
                              isNarrow
                                ? `${flowPrefixTooltip}${item.label}${item.sublabel ? ` — ${item.sublabel}` : ''}`
                                : undefined
                            }
                            className={`w-full flex items-center ${
                              isNarrow ? 'justify-center px-2 py-2.5' : 'space-x-2.5 px-2.5 py-2'
                            } rounded-xl text-left transition-all cursor-pointer group ${
                              active ? activeItemStyle : idleItemStyle
                            }`}
                          >
                            <div
                              className={`relative w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${iconBoxStyle}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            {!isNarrow && (
                              <div className="min-w-0 flex-1 flex items-center justify-between gap-1.5">
                                <div className="min-w-0">
                                  <div className="text-xs leading-snug truncate">{item.label}</div>
                                  {item.sublabel && (
                                    <div
                                      className={`text-[10px] leading-tight truncate mt-0.5 ${
                                        active
                                          ? item.flow === 'KELUAR'
                                            ? 'text-rose-800/80 font-normal'
                                            : item.flow === 'MUTASI'
                                            ? 'text-sky-800/80 font-normal'
                                            : 'text-emerald-800/80 font-normal'
                                          : 'text-slate-400 font-normal'
                                      }`}
                                    >
                                      {item.sublabel}
                                    </div>
                                  )}
                                </div>

                                {/* Unmistakable Cash-Flow Directional Signifier */}
                                {item.flow === 'MASUK' && (
                                  <span className="shrink-0 font-mono text-[10px] font-bold text-emerald-700 tracking-tight">
                                    +MASUK
                                  </span>
                                )}
                                {item.flow === 'KELUAR' && (
                                  <span className="shrink-0 font-mono text-[10px] font-bold text-rose-700 tracking-tight">
                                    −KELUAR
                                  </span>
                                )}
                                {item.flow === 'MUTASI' && (
                                  <span className="shrink-0 font-mono text-[10px] font-bold text-sky-700 tracking-tight">
                                    ⇄MUTASI
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </nav>

        {/* Bottom Quick Full-Screen Link Helper */}
        {!isNarrow && onOpenFullLinkModal && (
          <div className="p-2.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
            <button
              type="button"
              onClick={() => {
                onOpenFullLinkModal();
                onCloseMobile?.();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-white hover:bg-emerald-50/60 border border-slate-200/90 hover:border-emerald-300 text-xs font-semibold text-slate-700 hover:text-emerald-900 transition-all shadow-2xs cursor-pointer"
            >
              <span className="flex items-center space-x-2 truncate">
                <ExternalLink className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">Link Akses Full Tampilan</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col h-full shrink-0 border-r border-slate-200/90 bg-white transition-all duration-200 overflow-hidden ${
          collapsed ? 'w-16' : 'w-68'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile & Tablet Slide-Over Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="relative w-72 max-w-[85vw] h-full bg-white shadow-xl border-r border-slate-200 z-10 overflow-hidden">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}
    </>
  );
};
