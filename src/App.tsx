import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Header, ERP_FULL_VIEW_SHARED_URL, ERP_FULL_VIEW_DEV_URL } from './components/layout/Header.tsx';
import {
  Sidebar,
  ActiveTab,
  ACTIVE_TAB_LABELS,
  ACTIVE_TAB_CASH_FLOW,
} from './components/layout/Sidebar.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { PenjualanView } from './components/kasir/PenjualanView.tsx';
import { PembelianBarangView } from './components/kasir/PembelianBarangView.tsx';
import { PembelianHasilBumiView } from './components/kasir/PembelianHasilBumiView.tsx';
import { KasbonUangView } from './components/kasir/KasbonUangView.tsx';
import { BayarBonView } from './components/kasir/BayarBonView.tsx';
import { TransferRekeningView } from './components/kasir/TransferRekeningView.tsx';
import { MasterRekeningView } from './components/master/MasterRekeningView.tsx';
import { MasterMitraView } from './components/master/MasterMitraView.tsx';
import { MasterProdukView } from './components/master/MasterProdukView.tsx';
import { MasterInventarisView } from './components/master/MasterInventarisView.tsx';
import { MasterKaryawanView } from './components/karyawan/MasterKaryawanView.tsx';
import { DivisiKeuanganView } from './components/karyawan/DivisiKeuanganView.tsx';
import { StokBarangView } from './components/stok/StokBarangView.tsx';
import { StokHasilBumiView } from './components/stok/StokHasilBumiView.tsx';
import { LabaRugiProdukView } from './components/laporan/LabaRugiProdukView.tsx';
import { RekeningKoranMitraView } from './components/laporan/RekeningKoranMitraView.tsx';
import { RekapTransaksiView } from './components/laporan/RekapTransaksiView.tsx';
import { RekapSemuaTransaksiHarianView } from './components/laporan/RekapSemuaTransaksiHarianView.tsx';
import { AuditLogView } from './components/laporan/AuditLogView.tsx';
import { DatabaseExplorerView } from './components/database/DatabaseExplorerView.tsx';
import { SupabaseSyncModal } from './components/database/SupabaseSyncModal.tsx';
import {
  Cloud,
  ExternalLink,
  Copy,
  Check,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Building2,
} from 'lucide-react';
import { BillboardMonitoringView } from './components/billboard/BillboardMonitoringView.tsx';
import { PrintReceiptModal, ReceiptData } from './components/common/PrintReceiptModal.tsx';
import { api, DashboardStatsResponse } from './api/client.ts';
import { BayarTitipanHasilBumiView } from './components/kasir/BayarTitipanHasilBumiView.tsx';
import { PengeluaranView } from './components/kasir/PengeluaranView.tsx';
import { ProfilPerusahaanModal } from './components/master/ProfilPerusahaanModal.tsx';
import { ModalPinjamUangMitra } from './components/common/ModalPinjamUangMitra.tsx';
import { PublicSharePortal } from './components/public/PublicSharePortal.tsx';
import { PusatKontrolKasirView } from './components/kontrol/PusatKontrolKasirView.tsx';
import { PinAccessGate, AuthenticatedRole } from './components/bos/PinAccessGate.tsx';
import { PortalEksekutifBosView } from './components/bos/PortalEksekutifBosView.tsx';
import { ModalAksesBosDanPin } from './components/bos/ModalAksesBosDanPin.tsx';
import {
  AuditLog,
  CatatanUpahHarian,
  Karyawan,
  Mitra,
  Produk,
  Rekening,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
  TransaksiPencairanTitipan,
  TransaksiPengeluaran,
  FullErpModularDataset,
  ProfilPerusahaan,
  ItemInventaris,
} from './server/types.ts';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string; onRecover?: () => void },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string; onRecover?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('Unhandled error in ERP view caught by ErrorBoundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-white rounded-2xl border border-rose-200 shadow-sm space-y-4 max-w-lg mx-auto my-12">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <h2 className="text-base font-bold text-zinc-900">Tampilan Sedang Disinkronkan</h2>
          <p className="text-xs text-zinc-600 leading-relaxed">
            Terjadi kendala sesaat ketika memuat tampilan ({this.state.error?.message || 'Sinkronisasi UI'}). Seluruh data transaksi Anda tetap 100% aman di database.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRecover?.();
            }}
            className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
          >
            Segarkan Tampilan Sekarang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Master & Transaction States
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [rekeningList, setRekeningList] = useState<Rekening[]>([]);
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [karyawanList, setKaryawanList] = useState<Karyawan[]>([]);
  const [upahHarianList, setUpahHarianList] = useState<CatatanUpahHarian[]>([]);
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [kategoriProdukList, setKategoriProdukList] = useState<
    Array<{ nama: string; deskripsi: string; jumlahProduk: number; isSaved: boolean }>
  >([]);
  const [stokList, setStokList] = useState<StokBarang[]>([]);
  const [stokHasilBumiList, setStokHasilBumiList] = useState<StokHasilBumi[]>([]);
  const [penjualanList, setPenjualanList] = useState<TransaksiPenjualan[]>([]);
  const [pembelianList, setPembelianList] = useState<TransaksiPembelianHasilBumi[]>([]);
  const [penjualanHasilBumiList, setPenjualanHasilBumiList] = useState<TransaksiPenjualanHasilBumi[]>([]);
  const [pembelianBarangList, setPembelianBarangList] = useState<TransaksiPembelianBarang[]>([]);
  const [pencairanTitipanList, setPencairanTitipanList] = useState<TransaksiPencairanTitipan[]>([]);
  const [kasbonUangList, setKasbonUangList] = useState<TransaksiKasbonUang[]>([]);
  const [bayarBonList, setBayarBonList] = useState<TransaksiBayarBon[]>([]);
  const [pengeluaranList, setPengeluaranList] = useState<TransaksiPengeluaran[]>([]);
  const [transferList, setTransferList] = useState<TransaksiTransferRekening[]>([]);
  const [penggajianList, setPenggajianList] = useState<TransaksiPenggajian[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);
  const [inventarisList, setInventarisList] = useState<ItemInventaris[]>([]);
  const [preselectedInventarisForPengeluaran, setPreselectedInventarisForPengeluaran] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMitraForStatement, setSelectedMitraForStatement] = useState<string>('');
  const [selectedMitraForBayarTitipan, setSelectedMitraForBayarTitipan] = useState<string>('');
  const [selectedMitraForBayarBon, setSelectedMitraForBayarBon] = useState<string>('');
  const [kontrolKasirTarget, setKontrolKasirTarget] = useState<{
    subTab: 'kliring' | 'duplikat' | 'opname';
    mitraId?: string;
  }>({ subTab: 'kliring' });
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  const [showProfilModal, setShowProfilModal] = useState<boolean>(false);
  const [showPinjamUangModal, setShowPinjamUangModal] = useState<boolean>(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [dismissSupabaseNotice, setDismissSupabaseNotice] = useState<boolean>(false);
  const [showFullLinkModal, setShowFullLinkModal] = useState<boolean>(false);
  const [showBosAccessModal, setShowBosAccessModal] = useState<boolean>(false);
  const [copiedLinkType, setCopiedLinkType] = useState<'shared' | 'dev' | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    url?: string;
    lastSyncTime?: string | null;
  } | null>(null);

  // Detect custom production domain (Railway / Render / VPS) or ?mode=bos URL parameter
  const isPublicCustomDomain = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname;
    return h !== 'localhost' && h !== '127.0.0.1' && !h.startsWith('ais-');
  }, []);

  const isUrlBosMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    const m = (p.get('mode') || p.get('portal') || '').toLowerCase();
    return m === 'bos' || m === 'pimpinan';
  }, []);

  const [authRole, setAuthRole] = useState<AuthenticatedRole | null>(() => {
    try {
      const sessionRole = sessionStorage.getItem('wap_auth_role');
      if (sessionRole === 'BOS' || sessionRole === 'KASIR') {
        return sessionRole;
      }
      const savedRaw = localStorage.getItem('wap_auth_device_v1');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (
          parsed &&
          (parsed.role === 'BOS' || parsed.role === 'KASIR') &&
          typeof parsed.expiresAt === 'number' &&
          parsed.expiresAt > Date.now()
        ) {
          return parsed.role;
        }
        localStorage.removeItem('wap_auth_device_v1');
      }
    } catch {}
    return null;
  });

  const [forcePinGate, setForcePinGate] = useState<boolean>(false);
  const [previewBosView, setPreviewBosView] = useState<boolean>(false);

  const checkAndSyncSupabase = useCallback(async (): Promise<boolean> => {
    try {
      const status = await api.getSupabaseStatus();
      setSupabaseStatus(status);
      // Auto reconnect from browser localStorage if backend restarted (Cloud-first smart sync)
      if (!status.configured) {
        const localUrl = localStorage.getItem('wijaya_agro_supabase_url');
        const localKey = localStorage.getItem('wijaya_agro_supabase_key');
        if (localUrl && localKey) {
          const res = await api.updateSupabaseConfig({ url: localUrl, key: localKey, autoSync: true });
          if (res.data) {
            setSupabaseStatus(res.data);
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('Supabase status check failed:', e);
    }
    return false;
  }, []);

  // Check if current URL is a public share link (e.g. ?share=rekening-koran&id=MTR-001)
  const [publicShareConfig, setPublicShareConfig] = useState<{
    shareType: 'rekening-koran' | 'rekap-harian';
    shareId?: string;
    shareDate?: string;
  } | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const share = params.get('share');
      if (share === 'rekening-koran' || share === 'rekap-harian') {
        return {
          shareType: share,
          shareId: params.get('id') || params.get('mitraId') || undefined,
          shareDate: params.get('tgl') || params.get('tanggal') || undefined,
        };
      }
    } catch {}
    return null;
  });

  const refreshInFlightRef = useRef<boolean>(false);
  const refreshQueuedRef = useRef<boolean>(false);
  const lastFocusRefreshRef = useRef<number>(0);

  const applySnapshot = useCallback((snap: Awaited<ReturnType<typeof api.getErpSnapshot>>) => {
    if (snap.dashboard) setStats(snap.dashboard);
    if (Array.isArray(snap.rekening)) setRekeningList(snap.rekening);
    if (Array.isArray(snap.mitra)) {
      setMitraList(snap.mitra);
      if (snap.mitra.length > 0) {
        setSelectedMitraForStatement((prev) => prev || snap.mitra[0].id);
      }
    }
    if (Array.isArray(snap.karyawan)) setKaryawanList(snap.karyawan);
    if (Array.isArray(snap.upahHarian)) setUpahHarianList(snap.upahHarian);
    if (Array.isArray(snap.produk)) setProdukList(snap.produk);
    if (Array.isArray(snap.kategoriProduk)) setKategoriProdukList(snap.kategoriProduk);
    if (Array.isArray(snap.stokBarang)) setStokList(snap.stokBarang);
    if (Array.isArray(snap.stokHasilBumi)) setStokHasilBumiList(snap.stokHasilBumi);
    if (Array.isArray(snap.penjualan)) setPenjualanList(snap.penjualan);
    if (Array.isArray(snap.pembelianHasilBumi)) setPembelianList(snap.pembelianHasilBumi);
    if (Array.isArray(snap.penjualanHasilBumi)) setPenjualanHasilBumiList(snap.penjualanHasilBumi);
    if (Array.isArray(snap.pembelianBarang)) setPembelianBarangList(snap.pembelianBarang);
    if (Array.isArray(snap.pencairanTitipan)) setPencairanTitipanList(snap.pencairanTitipan);
    if (Array.isArray(snap.kasbonUang)) setKasbonUangList(snap.kasbonUang);
    if (Array.isArray(snap.bayarBon)) setBayarBonList(snap.bayarBon);
    if (Array.isArray(snap.pengeluaran)) setPengeluaranList(snap.pengeluaran);
    if (Array.isArray(snap.transferRekening)) setTransferList(snap.transferRekening);
    if (Array.isArray(snap.penggajian)) setPenggajianList(snap.penggajian);
    if (Array.isArray(snap.auditLogs)) setAuditLogs(snap.auditLogs);
    if (snap.profilPerusahaan) setProfilPerusahaan(snap.profilPerusahaan);
    if (Array.isArray(snap.inventaris)) setInventarisList(snap.inventaris);
    if (snap.supabaseStatus) setSupabaseStatus(snap.supabaseStatus);
  }, []);

  const loadAllData = useCallback(async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      do {
        refreshQueuedRef.current = false;
        const snap = await api.getErpSnapshot();
        applySnapshot(snap);

        // Auto-reconnect Supabase from browser localStorage only if backend reports unconfigured
        if (snap.supabaseStatus && !snap.supabaseStatus.configured) {
          const reconnected = await checkAndSyncSupabase();
          if (reconnected) {
            const hydratedSnap = await api.getErpSnapshot();
            applySnapshot(hydratedSnap);
          }
        }

        // Notify all mounted sub-views/widgets so local tables & summaries auto-refresh without blanking
        window.dispatchEvent(new CustomEvent('erp:data-updated'));
      } while (refreshQueuedRef.current);
    } catch (err) {
      console.error('Error loading ERP snapshot:', err);
    } finally {
      refreshInFlightRef.current = false;
      setLoading(false);
    }
  }, [applySnapshot, checkAndSyncSupabase]);

  const handlePinAuthenticated = useCallback(
    (role: AuthenticatedRole, rememberDevice: boolean) => {
      setAuthRole(role);
      setForcePinGate(false);
      setPreviewBosView(role === 'BOS');
      try {
        sessionStorage.setItem('wap_auth_role', role);
        if (rememberDevice) {
          localStorage.setItem(
            'wap_auth_device_v1',
            JSON.stringify({
              role,
              expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
            })
          );
        } else {
          localStorage.removeItem('wap_auth_device_v1');
        }
      } catch {}
      void loadAllData();
    },
    [loadAllData]
  );

  const handleLockPinScreen = useCallback(() => {
    setAuthRole(null);
    setPreviewBosView(false);
    setForcePinGate(true);
    try {
      sessionStorage.removeItem('wap_auth_role');
      localStorage.removeItem('wap_auth_device_v1');
    } catch {}
  }, []);

  useEffect(() => {
    if ((isPublicCustomDomain || isUrlBosMode) && authRole === null) {
      setLoading(false);
      return;
    }
    void loadAllData();
  }, [loadAllData, isPublicCustomDomain, isUrlBosMode, authRole]);

  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if ((isPublicCustomDomain || isUrlBosMode) && authRole === null) return;
      const now = Date.now();
      if (now - lastFocusRefreshRef.current > 15000) {
        lastFocusRefreshRef.current = now;
        void loadAllData();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [loadAllData, isPublicCustomDomain, isUrlBosMode, authRole]);

  const handleOpenMitraStatement = (idMitra: string) => {
    setSelectedMitraForStatement(idMitra);
    setActiveTab('rekening-koran-mitra');
  };

  const handleNavigateToBayarTitipan = (idMitra: string) => {
    setSelectedMitraForBayarTitipan(idMitra);
    setActiveTab('kasir-cairkan-titipan');
  };

  const handleNavigateToBayarBon = (idMitra: string) => {
    setSelectedMitraForBayarBon(idMitra);
    setActiveTab('kasir-bayar-bon');
  };

  const handleOpenKontrolKasir = (
    subTab: 'kliring' | 'duplikat' | 'opname' = 'kliring',
    mitraId?: string
  ) => {
    setKontrolKasirTarget({ subTab, mitraId });
    setActiveTab('pusat-kontrol-kasir');
  };

  const handleTransactionSuccess = (receipt: ReceiptData) => {
    try {
      if (receipt && typeof receipt === 'object') {
        setActiveReceipt(receipt);
      }
    } catch (e) {
      console.warn('Error activating receipt modal:', e);
    }
    // Auto-refresh all ERP state immediately across dashboard, accounts, and reports
    loadAllData();
  };

  const fullErpData: FullErpModularDataset = useMemo(
    () => ({
      rekeningList,
      mitraList,
      karyawanList,
      upahHarianList,
      produkList,
      kategoriProdukList,
      stokList,
      stokHasilBumiList,
      penjualanList,
      pembelianList,
      penjualanHasilBumiList,
      pembelianBarangList,
      pencairanTitipanList,
      kasbonUangList,
      bayarBonList,
      pengeluaranList,
      transferList,
      penggajianList,
      auditLogs,
    }),
    [
      rekeningList,
      mitraList,
      karyawanList,
      upahHarianList,
      produkList,
      kategoriProdukList,
      stokList,
      stokHasilBumiList,
      penjualanList,
      pembelianList,
      penjualanHasilBumiList,
      pembelianBarangList,
      pencairanTitipanList,
      kasbonUangList,
      bayarBonList,
      pengeluaranList,
      transferList,
      penggajianList,
      auditLogs,
    ]
  );

  // If URL has public share parameters, render the secure Read-Only Public Portal
  if (publicShareConfig) {
    return (
      <PublicSharePortal
        shareType={publicShareConfig.shareType}
        shareId={publicShareConfig.shareId}
        shareDate={publicShareConfig.shareDate}
        onExitToErp={() => {
          // Clear query params and return to regular ERP
          window.history.pushState({}, '', window.location.pathname);
          setPublicShareConfig(null);
        }}
      />
    );
  }

  // Require PIN Gate automatically on Railway / Render / custom domains, on ?mode=bos, or when manually locked
  const requiresPinNow =
    forcePinGate ||
    ((isPublicCustomDomain || isUrlBosMode) &&
      profilPerusahaan?.wajibPinPublik !== false &&
      authRole === null);

  if (requiresPinNow) {
    return (
      <PinAccessGate
        defaultCompanyName={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
        defaultBadanHukum={profilPerusahaan?.badanHukum || 'PT (Perseroan Terbatas)'}
        preferBosHint={isUrlBosMode}
        onAuthenticated={handlePinAuthenticated}
      />
    );
  }

  // Render Dedicated Read-Only Executive Boss View when logged in with PIN Bos or previewing Tampilan Bos
  if (authRole === 'BOS' || previewBosView) {
    return (
      <PortalEksekutifBosView
        profilPerusahaan={profilPerusahaan}
        rekeningList={rekeningList}
        stokBarangList={stokList}
        stokHasilBumiList={stokHasilBumiList}
        inventarisList={inventarisList}
        onRefreshAll={loadAllData}
        onLockScreen={handleLockPinScreen}
        canSwitchToKasir={authRole !== 'BOS'}
        onSwitchToKasir={() => setPreviewBosView(false)}
      />
    );
  }

  const handleCopyFullUrl = (url: string, type: 'shared' | 'dev') => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLinkType(type);
      setTimeout(() => setCopiedLinkType(null), 2500);
    });
  };

  const activeCashFlow = ACTIVE_TAB_CASH_FLOW[activeTab];

  return (
    <div className="h-screen w-full bg-slate-50/90 flex flex-col font-sans antialiased text-slate-900 overflow-hidden">
      {/* Top App Header (Fixed at top) */}
      <Header
        rekeningList={rekeningList}
        profilPerusahaan={profilPerusahaan}
        onRefresh={loadAllData}
        onOpenSupabaseSync={() => setShowSupabaseModal(true)}
        supabaseConfigured={Boolean(supabaseStatus?.configured)}
        onOpenBillboard={() => setActiveTab('billboard-monitor')}
        onOpenProfilPerusahaan={() => setShowProfilModal(true)}
        activePageLabel={ACTIVE_TAB_LABELS[activeTab]}
        activeCashFlow={activeCashFlow}
        onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
        onOpenFullLinkModal={() => setShowFullLinkModal(true)}
        onOpenBosAccessModal={() => setShowBosAccessModal(true)}
      />

      {/* Main Workspace: Sidebar (Frozen/Collapsible) + Content Area (Independently Scrollable) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenProfilModal={() => setShowProfilModal(true)}
          onOpenPinjamUangModal={() => setShowPinjamUangModal(true)}
          onOpenSupabaseSync={() => setShowSupabaseModal(true)}
          supabaseConfigured={Boolean(supabaseStatus?.configured)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onOpenFullLinkModal={() => setShowFullLinkModal(true)}
        />

        <main
          className={`flex-1 overflow-y-auto overflow-x-auto min-h-0 min-w-0 ${
            activeTab === 'billboard-monitor' ? 'p-2 sm:p-4 bg-slate-950' : 'p-4 sm:p-6 lg:p-7'
          }`}
        >
          <div className={activeTab === 'billboard-monitor' ? 'w-full h-full' : 'max-w-7xl mx-auto'}>
            {/* Clean, Subtle & Dismissible Cloud Supabase Notice */}
            {!supabaseStatus?.configured && !dismissSupabaseNotice && activeTab !== 'billboard-monitor' && (
              <div className="mb-4 bg-white border border-amber-200/90 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start sm:items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/70 flex items-center justify-center shrink-0">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-slate-900">
                      Database masih berjalan di penyimpanan lokal server
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate sm:whitespace-normal">
                      Hubungkan ke proyek Cloud Supabase Anda agar seluruh data kasir, mitra, dan stok tersinkron otomatis ke PostgreSQL Cloud.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => setShowSupabaseModal(true)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Hubungkan Cloud
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissSupabaseNotice(true)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                    title="Sembunyikan pemberitahuan sementara"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Unmistakable Active Cash-Flow Signifier Bar for Cashier Menus */}
            {activeCashFlow === 'MASUK' && (
              <div className="mb-5 bg-emerald-50/90 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono text-xs font-extrabold text-emerald-800 tracking-tight">
                        + JALAN UANG MASUK
                      </span>
                      <span className="text-emerald-300 hidden sm:inline">·</span>
                      <span className="text-xs font-semibold text-emerald-950">
                        {ACTIVE_TAB_LABELS[activeTab]}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-emerald-800/90 mt-0.5">
                      Transaksi lunas/setoran pada halaman ini <strong>menambah saldo Kas Tunai (KAS01) atau Bank PT</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white/80 hover:bg-white border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors shrink-0 self-start sm:self-center cursor-pointer"
                >
                  Lihat Semua Jalur Kas
                </button>
              </div>
            )}

            {activeCashFlow === 'KELUAR' && (
              <div className="mb-5 bg-rose-50/90 border border-rose-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono text-xs font-extrabold text-rose-800 tracking-tight">
                        − JALAN UANG KELUAR
                      </span>
                      <span className="text-rose-300 hidden sm:inline">·</span>
                      <span className="text-xs font-semibold text-rose-950">
                        {ACTIVE_TAB_LABELS[activeTab]}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-rose-800/90 mt-0.5">
                      Pembayaran tunai/transfer pada halaman ini <strong>mengurangi saldo Kas Tunai (KAS01) atau Bank PT</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="text-xs font-semibold text-rose-800 hover:text-rose-950 bg-white/80 hover:bg-white border border-rose-200 px-3 py-1.5 rounded-xl transition-colors shrink-0 self-start sm:self-center cursor-pointer"
                >
                  Lihat Semua Jalur Kas
                </button>
              </div>
            )}

            {activeCashFlow === 'MUTASI' && (
              <div className="mb-5 bg-sky-50/90 border border-sky-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <ArrowLeftRight className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono text-xs font-extrabold text-sky-800 tracking-tight">
                        ⇄ MUTASI INTERNAL (PINDAH BUKU)
                      </span>
                      <span className="text-sky-300 hidden sm:inline">·</span>
                      <span className="text-xs font-semibold text-sky-950">
                        {ACTIVE_TAB_LABELS[activeTab]}
                      </span>
                    </div>
                    <p className="text-[11px] sm:text-xs text-sky-800/90 mt-0.5">
                      Memindahkan dana antar Kas Tunai (KAS01) &amp; Bank PT <strong>tanpa mengubah total uang perusahaan</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="text-xs font-semibold text-sky-800 hover:text-sky-950 bg-white/80 hover:bg-white border border-sky-200 px-3 py-1.5 rounded-xl transition-colors shrink-0 self-start sm:self-center cursor-pointer"
                >
                  Lihat Semua Jalur Kas
                </button>
              </div>
            )}

            <ErrorBoundary resetKey={activeTab} onRecover={loadAllData}>
              {activeTab === 'dashboard' && (
                <DashboardView
                  stats={stats}
                  loading={loading}
                  onNavigate={setActiveTab}
                  onOpenKontrolKasir={handleOpenKontrolKasir}
                  onOpenPinjamUangModal={() => setShowPinjamUangModal(true)}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'pusat-kontrol-kasir' && (
                <PusatKontrolKasirView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  initialSubTab={kontrolKasirTarget.subTab}
                  initialMitraId={kontrolKasirTarget.mitraId}
                  onRefreshParent={loadAllData}
                  onOpenStatement={handleOpenMitraStatement}
                />
              )}

              {activeTab === 'billboard-monitor' && (
                <BillboardMonitoringView onClose={() => setActiveTab('dashboard')} />
              )}

              {activeTab === 'kasir-penjualan' && (
                <PenjualanView
                  produkList={produkList}
                  stokList={stokList}
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  penjualanList={penjualanList}
                  onSuccess={handleTransactionSuccess}
                  onRefresh={loadAllData}
                  onOpenLabaRugi={() => setActiveTab('laba-rugi-produk')}
                  onNavigateToKulakan={() => setActiveTab('kasir-pembelian-barang')}
                />
              )}

              {activeTab === 'kasir-pembelian-barang' && (
                <PembelianBarangView
                  produkList={produkList}
                  stokList={stokList}
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  onSuccess={handleTransactionSuccess}
                  onRefresh={loadAllData}
                  onOpenLabaRugi={() => setActiveTab('laba-rugi-produk')}
                  onNavigateToPenjualan={() => setActiveTab('kasir-penjualan')}
                />
              )}

              {activeTab === 'kasir-pembelian' && (
                <PembelianHasilBumiView
                  stokHasilBumiList={stokHasilBumiList}
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  onSuccess={handleTransactionSuccess}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'kasir-cairkan-titipan' && (
                <BayarTitipanHasilBumiView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  pembelianList={pembelianList}
                  pembelianBarangList={pembelianBarangList}
                  penjualanList={penjualanList}
                  penjualanHasilBumiList={penjualanHasilBumiList}
                  kasbonUangList={kasbonUangList}
                  initialSelectedMitraId={selectedMitraForBayarTitipan}
                  onNavigateToBayarBon={handleNavigateToBayarBon}
                  onRefresh={loadAllData}
                  onPrintReceipt={handleTransactionSuccess}
                  onOpenKliringSilang={(idMitra) => handleOpenKontrolKasir('kliring', idMitra)}
                />
              )}

              {activeTab === 'kasir-kasbon-uang' && (
                <KasbonUangView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  kasbonUangList={kasbonUangList}
                  onSuccess={handleTransactionSuccess}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'kasir-bayar-bon' && (
                <BayarBonView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  bayarBonList={bayarBonList}
                  initialSelectedMitraId={selectedMitraForBayarBon}
                  onNavigateToBayarTitipan={handleNavigateToBayarTitipan}
                  onSuccess={handleTransactionSuccess}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'kasir-pengeluaran' && (
                <PengeluaranView
                  rekeningList={rekeningList}
                  inventarisList={inventarisList}
                  karyawanList={karyawanList}
                  preselectedInventarisId={preselectedInventarisForPengeluaran}
                  onClearPreselectedInventaris={() => setPreselectedInventarisForPengeluaran(null)}
                  onOpenInventarisMenu={() => setActiveTab('master-inventaris')}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'kasir-transfer' && (
                <TransferRekeningView
                  rekeningList={rekeningList}
                  transferList={transferList}
                  onSuccess={handleTransactionSuccess}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'master-produk' && (
                <MasterProdukView
                  produkList={produkList}
                  stokList={stokList}
                  onRefresh={loadAllData}
                />
              )}

              {activeTab === 'master-mitra' && (
                <MasterMitraView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  fullErpData={fullErpData}
                  onRefresh={loadAllData}
                  onOpenStatement={handleOpenMitraStatement}
                  onOpenDuplicateMerger={() => handleOpenKontrolKasir('duplikat')}
                  onSuccessReceipt={handleTransactionSuccess}
                />
              )}

              {activeTab === 'master-rekening' && (
                <MasterRekeningView
                  rekeningList={rekeningList}
                  mitraList={mitraList}
                  onRefresh={loadAllData}
                  onOpenStatement={handleOpenMitraStatement}
                  onSuccessReceipt={handleTransactionSuccess}
                />
              )}

              {activeTab === 'master-inventaris' && (
                <MasterInventarisView
                  inventarisList={inventarisList}
                  karyawanList={karyawanList}
                  pengeluaranList={pengeluaranList}
                  onRefresh={loadAllData}
                  onNavigateToPengeluaran={(item) => {
                    setPreselectedInventarisForPengeluaran(item.id);
                    setActiveTab('kasir-pengeluaran');
                  }}
                />
              )}

              {activeTab === 'master-profil' && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 sm:p-8 max-w-2xl mx-auto my-6 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                          {profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {profilPerusahaan?.badanHukum || 'PT (Perseroan Terbatas)'} · Tersinkron otomatis ke Kop Surat Rekening Koran Mitra &amp; PDF
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProfilModal(true)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-2xs transition-colors shrink-0 self-start sm:self-center"
                    >
                      Edit Profil Perusahaan
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-slate-500">Alamat Kantor &amp; Gudang Operasional</span>
                      <div className="font-medium text-slate-900">{profilPerusahaan?.alamat || '-'}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500">No. Telepon / WhatsApp</span>
                      <div className="font-mono font-semibold text-slate-900">{profilPerusahaan?.telepon || '-'}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500">Email Resmi</span>
                      <div className="font-medium text-slate-900">{profilPerusahaan?.email || '-'}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500">Penanggung Jawab / Pimpinan</span>
                      <div className="font-semibold text-slate-900">{profilPerusahaan?.penanggungJawab || '-'}</div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                      <span className="text-[11px] font-semibold text-slate-500">Rekening Kas / Bank Utama</span>
                      <div className="font-mono font-semibold text-slate-900">
                        {(() => {
                          const kode = profilPerusahaan?.rekeningUtama || 'KAS01';
                          const rek = rekeningList.find((r) => r.kode === kode);
                          return rek ? `${rek.kode} — ${rek.nama}` : kode;
                        })()}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 sm:col-span-2">
                      <span className="text-[11px] font-semibold text-slate-500">Catatan Bawah / Kop Nota &amp; Rekening Koran</span>
                      <div className="text-slate-700 italic">{profilPerusahaan?.catatanHeaderNota || '-'}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <span>
                      Setiap perubahan profil langsung menyesuaikan Kop Surat, Tanda Tangan, PDF, &amp; Link Rekening Koran Mitra.
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('rekening-koran-mitra')}
                      className="text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer underline underline-offset-4"
                    >
                      Lihat di Rekening Koran Mitra →
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'master-karyawan' && (
                <MasterKaryawanView
                  rekeningList={rekeningList}
                  fullErpData={fullErpData}
                  initialTab="rekap"
                  onOpenStatement={(mitraId) => {
                    setSelectedMitraForStatement(mitraId);
                    setActiveTab('rekening-koran-mitra');
                  }}
                  onOpenKasbonUang={() => {
                    setActiveTab('kasir-kasbon-uang');
                  }}
                  onNavigateToDivisi={() => {
                    setActiveTab('menu-divisi');
                  }}
                  onRefreshAll={loadAllData}
                />
              )}

              {activeTab === 'menu-divisi' && (
                <DivisiKeuanganView
                  rekeningList={rekeningList}
                  onNavigateToKaryawan={() => {
                    setActiveTab('master-karyawan');
                  }}
                  onRefreshAll={loadAllData}
                />
              )}

              {activeTab === 'stok-barang' && (
                <StokBarangView stokList={stokList} produkList={produkList} onRefresh={loadAllData} />
              )}

              {activeTab === 'stok-hasil-bumi' && (
                <StokHasilBumiView
                  stokList={stokHasilBumiList}
                  pembelianList={pembelianList}
                  penjualanHasilBumiList={penjualanHasilBumiList}
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  onRefresh={loadAllData}
                  onPrintReceipt={handleTransactionSuccess}
                />
              )}

              {activeTab === 'laba-rugi-produk' && (
                <LabaRugiProdukView
                  onNavigateToKasir={() => setActiveTab('kasir-penjualan')}
                  onNavigateToKulakan={() => setActiveTab('kasir-pembelian-barang')}
                />
              )}

              {activeTab === 'rekening-koran-mitra' && (
                <RekeningKoranMitraView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  profilPerusahaan={profilPerusahaan}
                  onOpenProfilPerusahaan={() => setShowProfilModal(true)}
                  selectedMitraId={selectedMitraForStatement}
                  onSelectMitra={setSelectedMitraForStatement}
                  onRefreshParent={loadAllData}
                  onSuccessReceipt={handleTransactionSuccess}
                />
              )}

              {(activeTab === 'rekap-semua-transaksi' || activeTab === 'laporan-transaksi') && (
                <RekapSemuaTransaksiHarianView onRefreshParent={loadAllData} />
              )}

              {activeTab === 'audit-log' && (
                <AuditLogView logs={auditLogs} onRefresh={loadAllData} />
              )}

              {activeTab === 'google-sheets-sync' && (
                <DatabaseExplorerView
                  erpData={fullErpData}
                  onRefreshAll={loadAllData}
                  onNavigateToTab={(t) => setActiveTab(t as ActiveTab)}
                />
              )}
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Profil Perusahaan Modal */}
      <ProfilPerusahaanModal
        isOpen={showProfilModal}
        onClose={() => setShowProfilModal(false)}
        rekeningList={rekeningList}
        onSaved={(updated) => {
          setProfilPerusahaan(updated);
          loadAllData();
        }}
      />

      {/* Modal Pinjam Uang dari PT ke Mitra (Masuk Saldo Titip) */}
      <ModalPinjamUangMitra
        isOpen={showPinjamUangModal}
        onClose={() => setShowPinjamUangModal(false)}
        mitraList={mitraList}
        rekeningList={rekeningList}
        onSuccess={() => {
          loadAllData();
        }}
      />

      {/* Printable Receipt Modal (Wrapped in ErrorBoundary) */}
      <ErrorBoundary resetKey={activeReceipt?.nomorTransaksi || 'receipt'} onRecover={() => setActiveReceipt(null)}>
        <PrintReceiptModal
          receipt={activeReceipt}
          onClose={() => setActiveReceipt(null)}
          onRefresh={loadAllData}
          profilPerusahaan={profilPerusahaan}
        />
      </ErrorBoundary>

      {/* Cloud Supabase Sync Modal */}
      <SupabaseSyncModal
        isOpen={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
        onSuccessRefresh={() => {
          loadAllData();
          checkAndSyncSupabase();
        }}
      />

      {/* Modal Akses Bos, PIN & Panduan Deploy Railway / Render */}
      <ModalAksesBosDanPin
        isOpen={showBosAccessModal}
        onClose={() => setShowBosAccessModal(false)}
        onEnterPreviewBos={() => setPreviewBosView(true)}
        onEnterPinLockScreen={handleLockPinScreen}
      />

      {/* Full Tampilan Direct Link Modal */}
      {showFullLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Link Akses Full Tampilan Browser
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Buka aplikasi di tab browser penuh (Desktop / Laptop / Tablet / HP)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullLinkModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Primary Shared Preview URL */}
              <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/90 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950">
                    Link Utama Full Tampilan (Direkomendasikan)
                  </span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white border border-emerald-200 font-mono text-xs text-slate-800 break-all select-all">
                  {ERP_FULL_VIEW_SHARED_URL}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <a
                    href={ERP_FULL_VIEW_SHARED_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka di Tab Baru</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopyFullUrl(ERP_FULL_VIEW_SHARED_URL, 'shared')}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {copiedLinkType === 'shared' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{copiedLinkType === 'shared' ? 'Link Tersalin!' : 'Salin Link'}</span>
                  </button>
                </div>
              </div>

              {/* Dev Environment URL */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Link Alternatif (Mode Pengembangan / Dev)
                  </span>
                </div>
                <div className="px-3 py-2 rounded-lg bg-white border border-slate-200 font-mono text-xs text-slate-600 break-all select-all">
                  {ERP_FULL_VIEW_DEV_URL}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <a
                    href={ERP_FULL_VIEW_DEV_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Link Dev</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopyFullUrl(ERP_FULL_VIEW_DEV_URL, 'dev')}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {copiedLinkType === 'dev' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>{copiedLinkType === 'dev' ? 'Tersalin!' : 'Salin Link Dev'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
