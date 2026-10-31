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
import { ModalBackupFullSpreadsheet } from './components/database/ModalBackupFullSpreadsheet.tsx';
import {
  convertErpSnapshotToRawDb,
  saveEmergencyLocalSnapshot,
} from './utils/fullBackupSpreadsheet.ts';
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
  ItemDivisi,
  DEFAULT_PT_LOGO_URL,
} from './server/types.ts';
import { DivisiLogoAvatar } from './components/common/DivisiLogoAvatar.tsx';
import { ModalProfilDivisi } from './components/karyawan/ModalProfilDivisi.tsx';

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
  const [divisiMasterList, setDivisiMasterList] = useState<ItemDivisi[]>([]);
  const [preselectedInventarisForPengeluaran, setPreselectedInventarisForPengeluaran] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedMitraForStatement, setSelectedMitraForStatement] = useState<string>('');
  const [selectedMitraForBayarTitipan, setSelectedMitraForBayarTitipan] = useState<string>('');
  const [selectedMitraForBayarBon, setSelectedMitraForBayarBon] = useState<string>('');
  const [selectedKaryawanForBayarGaji, setSelectedKaryawanForBayarGaji] = useState<string | undefined>(undefined);
  const [kontrolKasirTarget, setKontrolKasirTarget] = useState<{
    subTab: 'kliring' | 'duplikat' | 'opname';
    mitraId?: string;
  }>({ subTab: 'kliring' });
  const [activeReceipt, setActiveReceipt] = useState<ReceiptData | null>(null);

  const handleNavigateToBayarGaji = useCallback((idKaryawan?: string) => {
    setSelectedKaryawanForBayarGaji(idKaryawan);
    setActiveTab('kasir-bayar-gaji');
  }, []);

  const [showProfilModal, setShowProfilModal] = useState<boolean>(false);
  const [showProfilDivisiModal, setShowProfilDivisiModal] = useState<boolean>(false);
  const [profilDivisiPresetNama, setProfilDivisiPresetNama] = useState<string | undefined>(undefined);
  const [showPinjamUangModal, setShowPinjamUangModal] = useState<boolean>(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [dismissSupabaseNotice, setDismissSupabaseNotice] = useState<boolean>(false);
  const [showFullLinkModal, setShowFullLinkModal] = useState<boolean>(false);
  const [showBosAccessModal, setShowBosAccessModal] = useState<boolean>(false);
  const [showBackupSpreadsheetModal, setShowBackupSpreadsheetModal] = useState<boolean>(false);
  const [copiedLinkType, setCopiedLinkType] = useState<'shared' | 'dev' | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    url?: string;
    lastSyncTime?: string | null;
  } | null>(null);

  const isUrlBosMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const p = new URLSearchParams(window.location.search);
    const m = (p.get('mode') || p.get('portal') || '').toLowerCase();
    return m === 'bos' || m === 'pimpinan';
  }, []);

  // Strict 1-Hour Session Window (3.600.000 ms) — requires re-entering Sandi after > 1 hour
  const SESSION_MAX_AGE_MS = 60 * 60 * 1000;
  const SESSION_STORAGE_KEY = 'wap_auth_session_v2';

  const initialSessionState = useMemo((): {
    role: AuthenticatedRole | null;
    expired: boolean;
  } => {
    if (typeof window === 'undefined') return { role: null, expired: false };
    try {
      // Remove legacy non-expiring / 7-day keys so 1-hour rule is strictly enforced everywhere
      sessionStorage.removeItem('wap_auth_role');
      localStorage.removeItem('wap_auth_device_v1');

      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return { role: null, expired: false };

      const parsed = JSON.parse(raw);
      const now = Date.now();
      const validRole = parsed?.role === 'BOS' || parsed?.role === 'KASIR';
      const validTimestamps =
        typeof parsed?.loginAt === 'number' &&
        typeof parsed?.expiresAt === 'number' &&
        now >= parsed.loginAt - 60000;

      if (
        validRole &&
        validTimestamps &&
        now < parsed.expiresAt &&
        now - parsed.loginAt < SESSION_MAX_AGE_MS
      ) {
        return { role: parsed.role, expired: false };
      }

      localStorage.removeItem(SESSION_STORAGE_KEY);
      return { role: null, expired: true };
    } catch {
      return { role: null, expired: false };
    }
  }, [SESSION_MAX_AGE_MS]);

  const [authRole, setAuthRole] = useState<AuthenticatedRole | null>(initialSessionState.role);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState<boolean>(initialSessionState.expired);
  const [loggedOutNotice, setLoggedOutNotice] = useState<boolean>(false);
  const [forcePinGate, setForcePinGate] = useState<boolean>(false);
  const [previewBosView, setPreviewBosView] = useState<boolean>(initialSessionState.role === 'BOS');

  const checkAndSyncSupabase = useCallback(async (): Promise<boolean> => {
    try {
      const result = await api.autoConnectCloudDatabase();
      if (result.status) {
        setSupabaseStatus(result.status);
      }
      if (result.configured) {
        return true;
      }
      const status = await api.getSupabaseStatus();
      setSupabaseStatus(status);
      return Boolean(status.configured);
    } catch (e) {
      console.warn('Auto-connect database check warning:', e);
      return false;
    }
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
  const retryTimerRef = useRef<number | null>(null);
  const lastInteractionCheckRef = useRef<number>(0);

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
    if (Array.isArray(snap.divisiList)) setDivisiMasterList(snap.divisiList);
    if (snap.supabaseStatus) setSupabaseStatus(snap.supabaseStatus);

    // Continuously keep local browser Anti-Hang / Maintenance emergency snapshot up to date
    void saveEmergencyLocalSnapshot(convertErpSnapshotToRawDb(snap as unknown as Record<string, any>));
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
      console.error('Error loading ERP snapshot (auto-retrying):', err);
      if (retryTimerRef.current === null && typeof window !== 'undefined') {
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void checkAndSyncSupabase().then(() => loadAllData());
        }, 2500);
      }
    } finally {
      refreshInFlightRef.current = false;
      setLoading(false);
    }
  }, [applySnapshot, checkAndSyncSupabase]);

  const loadBosData = useCallback(async (dispatchUpdate = false) => {
    try {
      const snap = await api.getBosSnapshot();
      if (snap.profilPerusahaan) setProfilPerusahaan(snap.profilPerusahaan);
      if (Array.isArray(snap.rekening)) setRekeningList(snap.rekening);
      if (Array.isArray(snap.stokBarang)) setStokList(snap.stokBarang);
      if (Array.isArray(snap.stokHasilBumi)) setStokHasilBumiList(snap.stokHasilBumi);
      if (Array.isArray(snap.inventaris)) setInventarisList(snap.inventaris);
      if (Array.isArray(snap.divisiList)) setDivisiMasterList(snap.divisiList);
      if (snap.supabaseStatus) setSupabaseStatus(snap.supabaseStatus);

      if (snap.supabaseStatus && !snap.supabaseStatus.configured) {
        const reconnected = await checkAndSyncSupabase();
        if (reconnected) {
          const hydrated = await api.getBosSnapshot();
          if (hydrated.profilPerusahaan) setProfilPerusahaan(hydrated.profilPerusahaan);
          if (Array.isArray(hydrated.rekening)) setRekeningList(hydrated.rekening);
          if (Array.isArray(hydrated.stokBarang)) setStokList(hydrated.stokBarang);
          if (Array.isArray(hydrated.stokHasilBumi)) setStokHasilBumiList(hydrated.stokHasilBumi);
          if (Array.isArray(hydrated.inventaris)) setInventarisList(hydrated.inventaris);
          if (Array.isArray(hydrated.divisiList)) setDivisiMasterList(hydrated.divisiList);
          if (hydrated.supabaseStatus) setSupabaseStatus(hydrated.supabaseStatus);
        }
      }

      if (dispatchUpdate) {
        window.dispatchEvent(new CustomEvent('erp:data-updated'));
      }
    } catch (err) {
      console.error('Error loading Bos snapshot (auto-retrying):', err);
      if (retryTimerRef.current === null && typeof window !== 'undefined') {
        retryTimerRef.current = window.setTimeout(() => {
          retryTimerRef.current = null;
          void checkAndSyncSupabase().then(() => loadBosData(true));
        }, 2500);
      }
    } finally {
      setLoading(false);
    }
  }, [checkAndSyncSupabase]);

  const expireSessionNow = useCallback(() => {
    setAuthRole(null);
    setPreviewBosView(false);
    setSessionExpiredNotice(true);
    setForcePinGate(true);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem('wap_auth_role');
      localStorage.removeItem('wap_auth_device_v1');
    } catch {}
  }, []);

  const verifySessionStillActive = useCallback((): boolean => {
    if (authRole === null) return false;
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) {
        expireSessionNow();
        return false;
      }
      const parsed = JSON.parse(raw);
      const now = Date.now();
      if (
        !parsed ||
        (parsed.role !== 'BOS' && parsed.role !== 'KASIR') ||
        typeof parsed.loginAt !== 'number' ||
        typeof parsed.expiresAt !== 'number' ||
        now >= parsed.expiresAt ||
        now - parsed.loginAt >= SESSION_MAX_AGE_MS
      ) {
        expireSessionNow();
        return false;
      }
      return true;
    } catch {
      expireSessionNow();
      return false;
    }
  }, [authRole, expireSessionNow, SESSION_MAX_AGE_MS]);

  const handlePinAuthenticated = useCallback(
    (role: AuthenticatedRole, sessionDurationMs?: number) => {
      const now = Date.now();
      const duration = Math.min(sessionDurationMs || SESSION_MAX_AGE_MS, SESSION_MAX_AGE_MS);
      setAuthRole(role);
      setSessionExpiredNotice(false);
      setLoggedOutNotice(false);
      setForcePinGate(false);
      setPreviewBosView(role === 'BOS');
      try {
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            role,
            loginAt: now,
            expiresAt: now + duration,
          })
        );
        sessionStorage.removeItem('wap_auth_role');
        localStorage.removeItem('wap_auth_device_v1');
      } catch {}
      if (role === 'BOS') {
        void loadBosData(false);
      } else {
        void loadAllData();
      }
    },
    [loadAllData, loadBosData, SESSION_MAX_AGE_MS]
  );

  const handleLockPinScreen = useCallback(() => {
    setAuthRole(null);
    setPreviewBosView(false);
    setSessionExpiredNotice(false);
    setLoggedOutNotice(true);
    setMobileSidebarOpen(false);
    setForcePinGate(true);
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      sessionStorage.removeItem('wap_auth_role');
      localStorage.removeItem('wap_auth_device_v1');
    } catch {}
  }, []);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (authRole === null) {
      setLoading(false);
      return;
    }
    if (!verifySessionStillActive()) {
      return;
    }
    if (authRole === 'BOS') {
      void loadBosData(false);
      return;
    }
    void loadAllData();
  }, [loadAllData, loadBosData, authRole, verifySessionStillActive]);

  // Enforce strict 1-hour session timeout continuously + on first interaction after Android sleep
  useEffect(() => {
    if (authRole === null) return;

    const timer = window.setInterval(() => {
      verifySessionStillActive();
    }, 10000);

    const onUserActivity = () => {
      const now = Date.now();
      if (now - lastInteractionCheckRef.current > 5000) {
        lastInteractionCheckRef.current = now;
        verifySessionStillActive();
      }
    };

    window.addEventListener('pointerdown', onUserActivity, { passive: true });
    window.addEventListener('keydown', onUserActivity, { passive: true });
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', onUserActivity);
      window.removeEventListener('keydown', onUserActivity);
    };
  }, [authRole, verifySessionStillActive]);

  // Resilient Android wake-up, network recovery ('online', 'pageshow', 'visibilitychange', 'focus') & periodic DB auto-connect
  useEffect(() => {
    const syncAndRefreshActiveView = (forceImmediate = false) => {
      if (document.visibilityState === 'hidden') return;
      if (authRole === null) return;
      if (!verifySessionStillActive()) return;

      const now = Date.now();
      const isBosActive = authRole === 'BOS' || previewBosView;
      const cooldownMs = forceImmediate ? 1500 : isBosActive ? 8000 : 6000;
      if (now - lastFocusRefreshRef.current > cooldownMs) {
        lastFocusRefreshRef.current = now;
        void (async () => {
          await checkAndSyncSupabase();
          if (isBosActive) {
            await loadBosData(true);
          } else {
            await loadAllData();
          }
        })();
      }
    };

    const handleOnline = () => syncAndRefreshActiveView(true);
    const handleResume = () => syncAndRefreshActiveView(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('focus', handleResume);
    document.addEventListener('visibilitychange', handleResume);

    // Background keep-alive auto-connect check every 45s while visible on Android/Desktop
    const keepAliveTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden' || authRole === null) return;
      if (!verifySessionStillActive()) return;
      if (!supabaseStatus?.configured) {
        void checkAndSyncSupabase().then((reconnected) => {
          if (reconnected) {
            if (authRole === 'BOS' || previewBosView) {
              void loadBosData(true);
            } else {
              void loadAllData();
            }
          }
        });
      }
    }, 45000);

    return () => {
      clearInterval(keepAliveTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('pageshow', handleResume);
      window.removeEventListener('focus', handleResume);
      document.removeEventListener('visibilitychange', handleResume);
    };
  }, [
    loadAllData,
    loadBosData,
    checkAndSyncSupabase,
    verifySessionStillActive,
    authRole,
    previewBosView,
    supabaseStatus?.configured,
  ]);

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

  const fallbackClientDbForBackup = useMemo(
    () => ({
      profilPerusahaan: profilPerusahaan || {},
      rekening: rekeningList,
      mitra: mitraList,
      karyawan: karyawanList,
      upahHarian: upahHarianList,
      penggajian: penggajianList,
      produk: produkList,
      kategoriProduk: kategoriProdukList,
      stokBarang: stokList,
      stokHasilBumi: stokHasilBumiList,
      inventaris: inventarisList,
      divisi: divisiMasterList,
      penjualan: penjualanList,
      pembelianBarang: pembelianBarangList,
      pembelianHasilBumi: pembelianList,
      penjualanHasilBumi: penjualanHasilBumiList,
      kasbonUang: kasbonUangList,
      bayarBon: bayarBonList,
      pencairanTitipan: pencairanTitipanList,
      pengeluaran: pengeluaranList,
      transferRekening: transferList,
      auditLogs,
    }),
    [
      profilPerusahaan,
      rekeningList,
      mitraList,
      karyawanList,
      upahHarianList,
      penggajianList,
      produkList,
      kategoriProdukList,
      stokList,
      stokHasilBumiList,
      inventarisList,
      divisiMasterList,
      penjualanList,
      pembelianBarangList,
      pembelianList,
      penjualanHasilBumiList,
      kasbonUangList,
      bayarBonList,
      pencairanTitipanList,
      pengeluaranList,
      transferList,
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

  // Always require Sandi login screen initially when no active (< 1 hour) session exists or when locked
  const requiresPinNow = forcePinGate || authRole === null;

  if (requiresPinNow) {
    return (
      <PinAccessGate
        defaultCompanyName={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
        defaultBadanHukum={profilPerusahaan?.badanHukum || 'PT (Perseroan Terbatas)'}
        defaultLogoUrl={profilPerusahaan?.logoUrl || DEFAULT_PT_LOGO_URL}
        preferBosHint={isUrlBosMode}
        sessionExpiredNotice={sessionExpiredNotice}
        loggedOutNotice={loggedOutNotice}
        onAuthenticated={handlePinAuthenticated}
      />
    );
  }

  // Render Dedicated Read-Only Executive Boss View when logged in with Sandi Bos or previewing Tampilan Bos
  if (authRole === 'BOS' || previewBosView) {
    return (
      <PortalEksekutifBosView
        profilPerusahaan={profilPerusahaan}
        rekeningList={rekeningList}
        stokBarangList={stokList}
        stokHasilBumiList={stokHasilBumiList}
        inventarisList={inventarisList}
        divisiMasterList={divisiMasterList}
        onRefreshAll={() => void loadBosData(true)}
        onLockScreen={handleLockPinScreen}
        canSwitchToKasir={authRole !== 'BOS'}
        onSwitchToKasir={() => {
          setPreviewBosView(false);
          void loadAllData();
        }}
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
        onOpenBackupSpreadsheet={() => setShowBackupSpreadsheetModal(true)}
        onLockScreen={handleLockPinScreen}
      />

      {/* Main Workspace: Sidebar (Frozen/Collapsible) + Content Area (Independently Scrollable) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenProfilModal={() => setShowProfilModal(true)}
          onOpenPinjamUangModal={() => setShowPinjamUangModal(true)}
          onOpenSupabaseSync={() => setShowSupabaseModal(true)}
          onOpenBackupSpreadsheet={() => setShowBackupSpreadsheetModal(true)}
          supabaseConfigured={Boolean(supabaseStatus?.configured)}
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          onOpenFullLinkModal={() => setShowFullLinkModal(true)}
          onLogout={handleLockPinScreen}
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
                      {activeTab === 'kasir-pembelian' || activeTab === 'kasir-pembelian-barang' ? (
                        <>
                          Dihitung sebagai <strong>MODAL DAGANG / STOK DIVISI</strong>: kas fisik keluar saat pembelian namun <strong>menjaga nilai berjalan divisi</strong> serta berpotensi kembali menjadi uang &amp; keuntungan saat terjual.
                        </>
                      ) : activeTab === 'kasir-pengeluaran' || activeTab === 'kasir-bayar-gaji' ? (
                        <>
                          Dihitung sebagai <strong>PENGELUARAN MURNI (BEBAN)</strong>: langsung mengurangi saldo Kas/Bank PT sekaligus <strong>memotong saldo &amp; laba bersih divisi terkait</strong>.
                        </>
                      ) : (
                        <>
                          Pembayaran tunai/transfer pada halaman ini <strong>mengurangi saldo Kas Tunai (KAS01) atau Bank PT</strong>.
                        </>
                      )}
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
                  onNavigateToBayarGaji={handleNavigateToBayarGaji}
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
                <div className="space-y-6 max-w-3xl mx-auto my-6">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 sm:p-8 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div className="flex items-center space-x-3.5">
                        <img
                          src={profilPerusahaan?.logoUrl || DEFAULT_PT_LOGO_URL}
                          alt={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
                          className="w-14 h-14 rounded-2xl bg-black object-contain border border-slate-200 shrink-0"
                        />
                        <div>
                          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                            {profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
                          </h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {profilPerusahaan?.badanHukum || 'PT (Perseroan Terbatas)'} · Tersinkron otomatis ke Kop Surat, Tampilan Bos &amp; Pintasan App
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowProfilModal(true)}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-2xs transition-colors shrink-0 self-start sm:self-center"
                      >
                        Edit Profil &amp; Logo PT
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

                  {/* Profil & Logo Masing-Masing Divisi Section */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 sm:p-8 space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900">
                          Profil &amp; Logo Masing-Masing Divisi ({divisiMasterList.length} Unit)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Klik salah satu divisi di bawah untuk memasang atau mengganti logo khusus divisi tersebut (terkoneksi ke Admin &amp; Bos)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setProfilDivisiPresetNama(undefined);
                          setShowProfilDivisiModal(true);
                        }}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 self-start sm:self-center"
                      >
                        Kelola Semua Logo Divisi
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      {divisiMasterList.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setProfilDivisiPresetNama(d.nama);
                            setShowProfilDivisiModal(true);
                          }}
                          className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-300 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <DivisiLogoAvatar namaDivisi={d.nama} logoUrl={d.logoUrl} size="md" />
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">{d.nama}</div>
                              <div className="text-[11px] text-slate-500 truncate">
                                PJ: {d.penanggungJawab || '-'} · {d.kodeRekening}
                              </div>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                            {d.logoUrl ? 'Ubah Logo' : '+ Logo'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(activeTab === 'master-karyawan' || activeTab === 'kasir-bayar-gaji') && (
                <MasterKaryawanView
                  rekeningList={rekeningList}
                  fullErpData={fullErpData}
                  initialTab={activeTab === 'kasir-bayar-gaji' ? 'bayar-gaji' : 'rekap'}
                  preselectedKaryawanId={activeTab === 'kasir-bayar-gaji' ? selectedKaryawanForBayarGaji : undefined}
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
                  onOpenLabaRugiDivisi={() => {
                    setActiveTab('laba-rugi-produk');
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
                  divisiMasterList={divisiMasterList}
                  onNavigateToKasir={() => setActiveTab('kasir-penjualan')}
                  onNavigateToKulakan={() => setActiveTab('kasir-pembelian-barang')}
                  onNavigateToPengeluaran={() => setActiveTab('kasir-pengeluaran')}
                  onNavigateToDivisi={() => setActiveTab('menu-divisi')}
                />
              )}

              {activeTab === 'rekening-koran-mitra' && (
                <RekeningKoranMitraView
                  mitraList={mitraList}
                  rekeningList={rekeningList}
                  profilPerusahaan={profilPerusahaan}
                  onOpenProfilPerusahaan={() => setShowProfilModal(true)}
                  onNavigateToBayarGaji={handleNavigateToBayarGaji}
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
                  onOpenBackupSpreadsheet={() => setShowBackupSpreadsheetModal(true)}
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

      {/* Profil & Logo Masing-Masing Divisi Modal */}
      <ModalProfilDivisi
        isOpen={showProfilDivisiModal}
        initialDivisiNama={profilDivisiPresetNama}
        onClose={() => setShowProfilDivisiModal(false)}
        onSaved={() => {
          void loadAllData();
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

      {/* Pusat Backup Full & Larikan ke Google Spreadsheet (Siaga Hang / Maintenance) */}
      <ModalBackupFullSpreadsheet
        isOpen={showBackupSpreadsheetModal}
        onClose={() => setShowBackupSpreadsheetModal(false)}
        fallbackClientDb={fallbackClientDbForBackup}
        companyName={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
        allowRestore={true}
        onAfterRestore={() => {
          void loadAllData();
          void checkAndSyncSupabase();
        }}
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
