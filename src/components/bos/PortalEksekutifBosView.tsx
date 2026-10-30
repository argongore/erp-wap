import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  Sprout,
  RefreshCw,
  LogOut,
  Search,
  FileText,
  ArrowUpRight,
  Wallet,
  Landmark,
  Layers,
  Users,
  Briefcase,
  Boxes,
  Truck,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Printer,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  DAFTAR_DIVISI,
  DEFAULT_PT_LOGO_URL,
  isKategoriAlatNonStok,
  ProfilPerusahaan,
  Rekening,
  StokBarang,
  StokHasilBumi,
  ItemInventaris,
  ItemDivisi,
  PergerakanKeuanganDivisiSummary,
  RekapMasterMitraSummary,
  RekeningKoranMitraSummary,
  RekapMasterKaryawanSummary,
  RekapPayrollBulananSummary,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { BukuKasHarianBosWidget } from '../dashboard/BukuKasHarianBosWidget.tsx';
import { RekapSemuaTransaksiHarianView } from '../laporan/RekapSemuaTransaksiHarianView.tsx';
import { LabaRugiProdukView } from '../laporan/LabaRugiProdukView.tsx';
import { CetakRekeningKoranModal } from '../laporan/CetakRekeningKoranModal.tsx';
import { SlipGajiModal } from '../karyawan/SlipGajiModal.tsx';
import { DivisiLogoAvatar, resolveDivisiLogoUrl } from '../common/DivisiLogoAvatar.tsx';
import { PWAInstallButton } from '../common/PWAInstallButton.tsx';

type BosTab = 'kas' | 'divisi' | 'karyawan' | 'mitra' | 'jurnal' | 'stok';
type KaryawanSubView = 'BULANAN' | 'SALDO_TOTAL' | 'SLIP_GAJI';

const BULAN_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

// Isolated clock component so periodic clock updates never re-render tables or tabs
const ExecutiveClock: React.FC = React.memo(() => {
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateClock = () => {
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
    updateClock();
    const timer = setInterval(updateClock, 30000);
    return () => clearInterval(timer);
  }, []);

  return <span>{timeStr || 'Waktu Indonesia Barat'}</span>;
});

interface PortalEksekutifBosViewProps {
  profilPerusahaan: ProfilPerusahaan | null;
  rekeningList: Rekening[];
  stokBarangList: StokBarang[];
  stokHasilBumiList: StokHasilBumi[];
  inventarisList: ItemInventaris[];
  divisiMasterList?: ItemDivisi[];
  onRefreshAll: () => void;
  onLockScreen: () => void;
  canSwitchToKasir?: boolean;
  onSwitchToKasir?: () => void;
}

const PortalEksekutifBosViewInner: React.FC<PortalEksekutifBosViewProps> = ({
  profilPerusahaan,
  rekeningList,
  stokBarangList,
  stokHasilBumiList,
  inventarisList,
  divisiMasterList = [],
  onRefreshAll,
  onLockScreen,
  canSwitchToKasir = false,
  onSwitchToKasir,
}) => {
  const [activeTab, setActiveTab] = useState<BosTab>('kas');
  const [refreshing, setRefreshing] = useState(false);

  // Lazy load tracking per tab to eliminate initial mount API storms
  const loadedTabsRef = useRef<{ divisi: boolean; karyawan: boolean; mitra: boolean }>({
    divisi: false,
    karyawan: false,
    mitra: false,
  });

  // Division financial state
  const [divisiData, setDivisiData] = useState<PergerakanKeuanganDivisiSummary[]>([]);
  const [loadingDivisi, setLoadingDivisi] = useState(false);
  const [expandedDivisi, setExpandedDivisi] = useState<string | null>(null);

  // Employee recap state (Read-Only)
  const nowInit = useMemo(() => new Date(), []);
  const [karyawanSubView, setKaryawanSubView] = useState<KaryawanSubView>('BULANAN');
  const [selectedBulan, setSelectedBulan] = useState<number>(nowInit.getMonth() + 1);
  const [selectedTahun, setSelectedTahun] = useState<number>(nowInit.getFullYear());
  const [selectedDivisiKaryawan, setSelectedDivisiKaryawan] = useState<string>('ALL');
  const [karyawanSearch, setKaryawanSearch] = useState('');
  const deferredKaryawanSearch = useDeferredValue(karyawanSearch);

  const [rekapKaryawan, setRekapKaryawan] = useState<RekapMasterKaryawanSummary | null>(null);
  const [rekapPayroll, setRekapPayroll] = useState<RekapPayrollBulananSummary | null>(null);
  const [penggajianList, setPenggajianList] = useState<TransaksiPenggajian[]>([]);
  const [loadingKaryawan, setLoadingKaryawan] = useState(false);
  const [expandedKaryawanId, setExpandedKaryawanId] = useState<string | null>(null);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  // Mitra summary & read-only statement modal
  const [rekapMitra, setRekapMitra] = useState<RekapMasterMitraSummary | null>(null);
  const [loadingMitra, setLoadingMitra] = useState(false);
  const [mitraSearch, setMitraSearch] = useState('');
  const deferredMitraSearch = useDeferredValue(mitraSearch);
  const [mitraFilter, setMitraFilter] = useState<'ALL' | 'BON' | 'TITIP'>('ALL');
  const [mitraVisibleLimit, setMitraVisibleLimit] = useState<number>(60);
  const [selectedStatement, setSelectedStatement] = useState<RekeningKoranMitraSummary | null>(null);
  const [loadingStatementId, setLoadingStatementId] = useState<string | null>(null);

  // Stok barang progressive display (avoids nested scroll traps on mobile)
  const [showAllStokBarang, setShowAllStokBarang] = useState(false);

  const availableYears = useMemo(() => {
    const cy = nowInit.getFullYear();
    return [cy - 1, cy, cy + 1];
  }, [nowInit]);

  const loadDivisiTab = useCallback(async (silent = false) => {
    if (!silent) setLoadingDivisi(true);
    try {
      const divRes = await api.getDivisiKeuangan().catch(() => [] as PergerakanKeuanganDivisiSummary[]);
      setDivisiData(Array.isArray(divRes) ? divRes : []);
      loadedTabsRef.current.divisi = true;
    } finally {
      setLoadingDivisi(false);
    }
  }, []);

  const loadKaryawanTab = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingKaryawan(true);
      try {
        const [rekapMasterRes, payrollRes, slipRes] = await Promise.all([
          api.getRekapKaryawan().catch(() => null),
          api
            .getRekapPayrollBulanan({
              bulan: selectedBulan,
              tahun: selectedTahun,
              divisi: selectedDivisiKaryawan !== 'ALL' ? selectedDivisiKaryawan : undefined,
            })
            .catch(() => null),
          api.getPenggajian().catch(() => [] as TransaksiPenggajian[]),
        ]);
        if (rekapMasterRes) setRekapKaryawan(rekapMasterRes);
        if (payrollRes) setRekapPayroll(payrollRes);
        setPenggajianList(Array.isArray(slipRes) ? slipRes : []);
        loadedTabsRef.current.karyawan = true;
      } finally {
        setLoadingKaryawan(false);
      }
    },
    [selectedBulan, selectedTahun, selectedDivisiKaryawan]
  );

  const loadMitraTab = useCallback(async (silent = false) => {
    if (!silent) setLoadingMitra(true);
    try {
      const mitraRes = await api.getRekapMitra().catch(() => null);
      if (mitraRes) setRekapMitra(mitraRes);
      loadedTabsRef.current.mitra = true;
    } finally {
      setLoadingMitra(false);
    }
  }, []);

  // Lazy-fetch tab data only when the user actually opens that tab
  useEffect(() => {
    if (activeTab === 'divisi' && !loadedTabsRef.current.divisi) {
      void loadDivisiTab(false);
    } else if (activeTab === 'mitra' && !loadedTabsRef.current.mitra) {
      void loadMitraTab(false);
    }
  }, [activeTab, loadDivisiTab, loadMitraTab]);

  // Load or reload employee payroll recap whenever Karyawan tab is active or period/divisi filter changes
  useEffect(() => {
    if (activeTab === 'karyawan') {
      void loadKaryawanTab(loadedTabsRef.current.karyawan);
    }
  }, [activeTab, loadKaryawanTab]);

  // Listen to background refresh events without flooding inactive tabs
  useEffect(() => {
    const onUpdated = () => {
      loadedTabsRef.current = { divisi: false, karyawan: false, mitra: false };
      if (activeTab === 'divisi') {
        void loadDivisiTab(true);
      } else if (activeTab === 'karyawan') {
        void loadKaryawanTab(true);
      } else if (activeTab === 'mitra') {
        void loadMitraTab(true);
      }
    };
    window.addEventListener('erp:data-updated', onUpdated);
    return () => window.removeEventListener('erp:data-updated', onUpdated);
  }, [activeTab, loadDivisiTab, loadKaryawanTab, loadMitraTab]);

  useEffect(() => {
    setMitraVisibleLimit(60);
  }, [deferredMitraSearch, mitraFilter]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    loadedTabsRef.current = { divisi: false, karyawan: false, mitra: false };
    onRefreshAll();
    if (activeTab === 'divisi') {
      await loadDivisiTab(true);
    } else if (activeTab === 'karyawan') {
      await loadKaryawanTab(true);
    } else if (activeTab === 'mitra') {
      await loadMitraTab(true);
    }
    setTimeout(() => setRefreshing(false), 300);
  };

  const handleOpenStatement = async (idMitra: string) => {
    if (!idMitra) return;
    setLoadingStatementId(idMitra);
    try {
      const stmt = await api.getRekeningKoranMitra(idMitra);
      setSelectedStatement(stmt);
    } catch (err) {
      console.warn('Gagal membuka rekening koran:', err);
    } finally {
      setLoadingStatementId(null);
    }
  };

  // Financial aggregations
  const safeRekening = Array.isArray(rekeningList) ? rekeningList : [];
  const kas01 = safeRekening.find((r) => r.kode === 'KAS01');
  const bon01 = safeRekening.find((r) => r.kode === 'BON01');
  const tit01 = safeRekening.find((r) => r.kode === 'TIT01');

  const bankPerusahaanList = useMemo(
    () =>
      safeRekening.filter(
        (r) =>
          (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode.startsWith('REK-'))) &&
          r.kode !== 'KAS01' &&
          r.status === 'AKTIF'
      ),
    [safeRekening]
  );

  const anakPerusahaanList = useMemo(
    () => safeRekening.filter((r) => r.kategori === 'ANAK_PERUSAHAAN' || r.isAnakPerusahaan),
    [safeRekening]
  );

  const totalKasTunai = Number(kas01?.saldoSaatIni) || 0;
  const totalBankPerusahaan = bankPerusahaanList.reduce(
    (sum, r) => sum + (Number(r.saldoSaatIni) || 0),
    0
  );
  const totalLikuiditasRiil = totalKasTunai + totalBankPerusahaan;
  const totalPiutangBon = Number(bon01?.saldoSaatIni) || 0;
  const totalTitipanMitra = Number(tit01?.saldoSaatIni) || 0;

  // Map idKaryawan -> idMitraTerkait so Boss can open Rekening Koran Bon for any employee
  const karyawanMitraMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of rekapKaryawan?.items || []) {
      if (k.idMitraTerkait) {
        map.set(k.id, k.idMitraTerkait);
      }
    }
    return map;
  }, [rekapKaryawan]);

  const filteredPayrollItems = useMemo(() => {
    const items = rekapPayroll?.items || [];
    const q = deferredKaryawanSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.nama.toLowerCase().includes(q) ||
        item.nik.toLowerCase().includes(q) ||
        item.jabatan.toLowerCase().includes(q) ||
        item.divisiUtama.toLowerCase().includes(q)
    );
  }, [rekapPayroll, deferredKaryawanSearch]);

  const filteredSaldoKaryawanItems = useMemo(() => {
    const items = rekapKaryawan?.items || [];
    const q = deferredKaryawanSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedDivisiKaryawan !== 'ALL') {
        const div = item.divisi || item.divisiTerakhir || item.departemen || '';
        if (div !== selectedDivisiKaryawan) return false;
      }
      if (!q) return true;
      return (
        item.nama.toLowerCase().includes(q) ||
        item.nik.toLowerCase().includes(q) ||
        item.jabatan.toLowerCase().includes(q) ||
        (item.divisi || '').toLowerCase().includes(q)
      );
    });
  }, [rekapKaryawan, selectedDivisiKaryawan, deferredKaryawanSearch]);

  const filteredSlipGajiItems = useMemo(() => {
    const q = deferredKaryawanSearch.trim().toLowerCase();
    return penggajianList.filter((slip) => {
      if (selectedDivisiKaryawan !== 'ALL' && slip.divisi !== selectedDivisiKaryawan) {
        return false;
      }
      if (!q) return true;
      return (
        slip.namaKaryawan.toLowerCase().includes(q) ||
        slip.nikKaryawan.toLowerCase().includes(q) ||
        slip.slipNomor.toLowerCase().includes(q) ||
        (slip.periodeBulan || '').toLowerCase().includes(q)
      );
    });
  }, [penggajianList, selectedDivisiKaryawan, deferredKaryawanSearch]);

  const filteredMitraItems = useMemo(() => {
    const items = rekapMitra?.items || [];
    const q = deferredMitraSearch.trim().toLowerCase();
    return items.filter((m) => {
      if (mitraFilter === 'BON' && (m.sisaBonBersih ?? m.totalBonMitra) <= 0) return false;
      if (mitraFilter === 'TITIP' && (m.sisaTitipanBersih ?? m.totalHutangTitipPanen) <= 0) return false;
      if (!q) return true;
      return (
        m.nama.toLowerCase().includes(q) ||
        m.kode.toLowerCase().includes(q) ||
        (m.alamat || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q)
      );
    });
  }, [rekapMitra, deferredMitraSearch, mitraFilter]);

  const displayedMitraItems = useMemo(
    () => filteredMitraItems.slice(0, mitraVisibleLimit),
    [filteredMitraItems, mitraVisibleLimit]
  );

  const sortedStokBarang = useMemo(
    () =>
      [...stokBarangList].sort((a, b) => {
        const alatA = isKategoriAlatNonStok(a.kategori) ? 1 : 0;
        const alatB = isKategoriAlatNonStok(b.kategori) ? 1 : 0;
        if (alatA !== alatB) return alatA - alatB;
        return (a.stok || 0) - (b.stok || 0);
      }),
    [stokBarangList]
  );

  const displayedStokBarang = useMemo(
    () => (showAllStokBarang ? sortedStokBarang : sortedStokBarang.slice(0, 30)),
    [sortedStokBarang, showAllStokBarang]
  );

  const rekeningUtamaDetail = useMemo(() => {
    const kode = profilPerusahaan?.rekeningUtama || 'KAS01';
    const found = safeRekening.find((r) => r.kode === kode);
    if (!found) return undefined;
    return {
      kode: found.kode,
      nama: found.nama,
      nomorRekening: found.nomorRekening,
      atasNama: found.atasNama,
    };
  }, [profilPerusahaan, safeRekening]);

  const navTabs: Array<{ id: BosTab; label: string; icon: React.ComponentType<{ className?: string }> }> = useMemo(
    () => [
      { id: 'kas', label: 'Kas & Saldo PT', icon: Wallet },
      { id: 'divisi', label: 'Divisi & Armada', icon: Layers },
      { id: 'karyawan', label: 'Rekap Karyawan', icon: Briefcase },
      { id: 'mitra', label: 'Rekening Mitra', icon: Users },
      { id: 'jurnal', label: 'Jurnal & Bukti Nota', icon: FileText },
      { id: 'stok', label: 'Stok & Laba Rugi Divisi', icon: Boxes },
    ],
    []
  );

  return (
    <div className="bos-scroll-root h-dvh w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Sticky Executive Top Header (Solid crisp surface for 60fps scrolling) */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src={profilPerusahaan?.logoUrl || DEFAULT_PT_LOGO_URL}
              alt={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
              className="w-9 h-9 rounded-xl bg-black object-contain border border-slate-200 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="font-bold text-sm sm:text-base tracking-tight text-slate-900 truncate">
                  {profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
                </h1>
                <span className="hidden md:inline text-slate-300">·</span>
                <span className="hidden md:inline text-xs font-medium text-emerald-800 whitespace-nowrap">
                  Portal Pantauan Pimpinan (Mode Baca Aman)
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                <ExecutiveClock /> · Data tersinkron otomatis dari kasir
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton
              variant="bos"
              companyName={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
              logoUrl={profilPerusahaan?.logoUrl || DEFAULT_PT_LOGO_URL}
            />

            {canSwitchToKasir && onSwitchToKasir && (
              <button
                type="button"
                onClick={onSwitchToKasir}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                title="Kembali ke tampilan operasional kasir"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Menu Kasir</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Segarkan data terbaru"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-emerald-700' : ''}`} />
              <span className="hidden sm:inline">Segarkan</span>
            </button>

            <button
              type="button"
              onClick={onLockScreen}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 text-rose-700 hover:text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Keluar dari aplikasi dan kembali ke layar sandi PIN"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Clean Segmented Navigation Bar (Scrollable horizontally on mobile) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 border-t border-slate-100 overflow-x-auto">
          <nav className="flex items-center gap-1 py-2 min-w-max" aria-label="Menu Pantauan Pimpinan">
            {navTabs.map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content (Unconstrained vertical flow inside bos-scroll-root) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-6">
        {/* TAB 1: KAS & SALDO PT */}
        {activeTab === 'kas' && (
          <div className="space-y-6">
            {/* Primary Financial Anchor */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Total Uang Riil Perusahaan Saat Ini (Kas Fisik + Seluruh Bank PT)
                  </p>
                  <div className="mt-1 font-mono text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {formatRupiah(totalLikuiditasRiil)}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Diperbarui otomatis setiap kasir menyimpan transaksi
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">Brankas &amp; Kasir Tunai (KAS01)</div>
                  <div className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                    {formatRupiah(totalKasTunai)}
                  </div>
                  <div className="text-[11px] text-slate-400">Uang tunai fisik di kantor</div>
                </div>

                <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">Total Rekening Bank PT</div>
                  <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                    {formatRupiah(totalBankPerusahaan)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Akumulasi {bankPerusahaanList.length} rekening bank aktif
                  </div>
                </div>

                <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">Total Piutang Bon Mitra (BON01)</div>
                  <div className="font-mono text-lg font-bold text-amber-700 tabular-nums">
                    {formatRupiah(totalPiutangBon)}
                  </div>
                  <div className="text-[11px] text-slate-400">Uang PT di luar (belum ditagih)</div>
                </div>

                <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">Titipan Hasil Bumi Mitra (TIT01)</div>
                  <div className="font-mono text-lg font-bold text-rose-700 tabular-nums">
                    {formatRupiah(totalTitipanMitra)}
                  </div>
                  <div className="text-[11px] text-slate-400">Kewajiban panen belum dicairkan</div>
                </div>
              </div>
            </section>

            {/* Detailed Bank & Cash Account Table */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Rincian Posisi Saldo Tiap Rekening Kas &amp; Bank
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Saldo riil masing-masing rekening perusahaan dan afiliasi
                  </p>
                </div>
                <Landmark className="w-4 h-4 text-slate-400" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                      <th className="py-3 px-5 font-semibold">Kode</th>
                      <th className="py-3 px-4 font-semibold">Nama Rekening</th>
                      <th className="py-3 px-4 font-semibold hidden md:table-cell">Atas Nama / No. Rek</th>
                      <th className="py-3 px-5 font-semibold text-right">Saldo Saat Ini</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kas01 && (
                      <tr className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-5 font-mono font-bold text-emerald-800">{kas01.kode}</td>
                        <td className="py-3.5 px-4 font-semibold text-slate-900">{kas01.nama}</td>
                        <td className="py-3.5 px-4 text-slate-500 hidden md:table-cell">
                          {kas01.atasNama} · {kas01.nomorRekening}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-emerald-700 tabular-nums">
                          {formatRupiah(kas01.saldoSaatIni)}
                        </td>
                      </tr>
                    )}
                    {bankPerusahaanList.map((rek) => (
                      <tr key={rek.kode} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-5 font-mono font-semibold text-slate-700">{rek.kode}</td>
                        <td className="py-3.5 px-4 font-medium text-slate-900">{rek.nama}</td>
                        <td className="py-3.5 px-4 text-slate-500 hidden md:table-cell">
                          {rek.atasNama} · {rek.nomorRekening}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatRupiah(rek.saldoSaatIni)}
                        </td>
                      </tr>
                    ))}
                    {anakPerusahaanList.map((rek) => (
                      <tr key={rek.kode} className="bg-slate-50/40 hover:bg-slate-50">
                        <td className="py-3.5 px-5 font-mono font-semibold text-sky-800">{rek.kode}</td>
                        <td className="py-3.5 px-4 font-medium text-slate-900">
                          {rek.nama} <span className="text-xs text-slate-500">· Anak Perusahaan</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 hidden md:table-cell">
                          {rek.atasNama}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-sky-800 tabular-nums">
                          {formatRupiah(rek.saldoSaatIni)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Buku Kas Harian Bos Widget */}
            <BukuKasHarianBosWidget
              onNavigate={() => setActiveTab('jurnal')}
              onRefreshParent={onRefreshAll}
            />
          </div>
        )}

        {/* TAB 2: ARUS KAS DIVISI & ARMADA */}
        {activeTab === 'divisi' && (
          <div className="space-y-6">
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Pergerakan Arus Kas &amp; Saldo Buku per Divisi Usaha
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Klik baris divisi untuk melihat rincian mutasi transaksi terakhir pada divisi tersebut
                  </p>
                </div>
              </div>

              {loadingDivisi ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat rekap keuangan divisi...
                </div>
              ) : divisiData.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada data pergerakan divisi.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {divisiData.map((d) => {
                    const isOpen = expandedDivisi === d.idDivisi;
                    const divMaster = divisiMasterList.find(
                      (m) => m.id === d.idDivisi || m.nama.toLowerCase() === d.divisi.toLowerCase()
                    );
                    const divLogo = resolveDivisiLogoUrl(
                      d.divisi,
                      d.logoUrl || divMaster?.logoUrl,
                      divisiMasterList
                    );
                    const pjLabel = d.penanggungJawab || divMaster?.penanggungJawab;
                    const descLabel = d.deskripsi || divMaster?.deskripsi;
                    return (
                      <div key={d.idDivisi}>
                        <button
                          type="button"
                          onClick={() => setExpandedDivisi(isOpen ? null : d.idDivisi)}
                          className="w-full px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors text-left cursor-pointer"
                        >
                          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                            <DivisiLogoAvatar
                              namaDivisi={d.divisi}
                              logoUrl={divLogo}
                              size="md"
                              theme="light"
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className="font-bold text-sm text-slate-900">{d.divisi}</span>
                                {pjLabel && (
                                  <span className="text-xs text-slate-500">· PJ: {pjLabel}</span>
                                )}
                              </div>
                              {descLabel && (
                                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{descLabel}</p>
                              )}
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
                                <span>Kode {d.kodeRekening}</span>
                                <span>·</span>
                                <span className="text-emerald-700">
                                  Uang Masuk +{formatRupiahSingkat(d.totalPenjualanMasuk || 0)}
                                </span>
                                <span>·</span>
                                <span className="text-rose-700">
                                  Uang Keluar −
                                  {formatRupiahSingkat(
                                    (d.totalPembelianKeluar || 0) +
                                      (d.totalPengeluaranOperasional || 0) +
                                      (d.totalGajiKeluar || 0)
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                            <div className="text-left sm:text-right">
                              <div className="text-[11px] text-slate-400">Laba / Rugi Divisi</div>
                              <div
                                className={`font-mono text-xs sm:text-sm font-bold tabular-nums ${
                                  (d.labaRugiBersih ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {(d.labaRugiBersih ?? 0) >= 0 ? '+' : ''}
                                {formatRupiah(d.labaRugiBersih ?? 0)}
                              </div>
                            </div>
                            <div className="text-left sm:text-right">
                              <div className="text-[11px] text-slate-400">Nilai &amp; Saldo Divisi</div>
                              <div
                                className={`font-mono text-sm sm:text-base font-bold tabular-nums ${
                                  d.saldoSaatIni >= 0 ? 'text-slate-900' : 'text-rose-700'
                                }`}
                              >
                                {formatRupiah(d.saldoSaatIni)}
                              </div>
                            </div>
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-5 pb-5 pt-3 bg-slate-50/60 border-t border-slate-100 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                              <div>
                                <span className="text-slate-500">Uang Masuk (+)</span>
                                <div className="font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
                                  +{formatRupiah(d.totalPenjualanMasuk || 0)}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Uang Keluar (−)</span>
                                <div className="font-mono font-bold text-rose-700 tabular-nums mt-0.5">
                                  −
                                  {formatRupiah(
                                    (d.totalPembelianKeluar || 0) +
                                      (d.totalPengeluaranOperasional || 0) +
                                      (d.totalGajiKeluar || 0)
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Laba / Rugi Divisi</span>
                                <div
                                  className={`font-mono font-bold tabular-nums mt-0.5 ${
                                    (d.labaRugiBersih ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {(d.labaRugiBersih ?? 0) >= 0 ? '+' : ''}
                                  {formatRupiah(d.labaRugiBersih ?? 0)}
                                </div>
                              </div>
                            </div>

                            {d.mutasi && d.mutasi.length > 0 && (
                              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/60">
                                      <th className="py-2 px-3 font-semibold">Tanggal</th>
                                      <th className="py-2 px-3 font-semibold">Keterangan</th>
                                      <th className="py-2 px-3 font-semibold text-right">Masuk</th>
                                      <th className="py-2 px-3 font-semibold text-right">Keluar</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {d.mutasi.slice(0, 10).map((m) => (
                                      <tr key={m.id}>
                                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                                          {m.tanggal}
                                        </td>
                                        <td className="py-2 px-3 text-slate-800">{m.keterangan}</td>
                                        <td className="py-2 px-3 text-right font-mono text-emerald-700 tabular-nums whitespace-nowrap">
                                          {m.masuk > 0 ? `+${formatRupiah(m.masuk)}` : '-'}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-rose-700 tabular-nums whitespace-nowrap">
                                          {m.keluar > 0 ? `-${formatRupiah(m.keluar)}` : '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Inventaris & Armada Kendaraan PT */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Daftar Inventaris Kendaraan &amp; Armada PT ({inventarisList.length} Unit)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pantauan sopir penanggung jawab, kondisi unit, dan jadwal pajak STNK
                  </p>
                </div>
                <Truck className="w-4 h-4 text-slate-400" />
              </div>

              {inventarisList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Belum ada unit kendaraan di menu Inventaris.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                        <th className="py-3 px-5 font-semibold">No. Polisi / Kode</th>
                        <th className="py-3 px-4 font-semibold">Nama Armada / Kendaraan</th>
                        <th className="py-3 px-4 font-semibold">Driver / Penanggung Jawab</th>
                        <th className="py-3 px-4 font-semibold">Pajak STNK</th>
                        <th className="py-3 px-5 font-semibold">Kondisi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventarisList.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-5 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {inv.nomorPlat || inv.kode}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{inv.namaItem}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>{inv.tahunKeluaran ? `Tahun ${inv.tahunKeluaran}` : inv.kategori}</span>
                              {inv.divisi && (
                                <>
                                  <span>·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <DivisiLogoAvatar
                                      namaDivisi={inv.divisi}
                                      logoUrl={resolveDivisiLogoUrl(
                                        inv.divisi,
                                        undefined,
                                        divisiData.length > 0 ? divisiData : divisiMasterList
                                      )}
                                      size="xs"
                                    />
                                    <span>{inv.divisi}</span>
                                  </span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            <div>{inv.driverPenanggungJawab || '-'}</div>
                            {inv.teleponDriver && (
                              <div className="font-mono text-xs text-slate-400">{inv.teleponDriver}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                            {inv.tanggalPajakTahunan || '-'}
                          </td>
                          <td className="py-3 px-5 text-xs font-semibold text-slate-700">
                            {inv.kondisi.replace(/_/g, ' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 3: REKAP KARYAWAN, ABSENSI HARIAN, KASBON & SLIP GAJI (READ-ONLY) */}
        {activeTab === 'karyawan' && (
          <div className="space-y-5">
            {/* Executive KPI Summary + Filters */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Total Karyawan Terdaftar</div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {rekapKaryawan?.totalKaryawan ?? rekapPayroll?.totalPekerja ?? 0} Orang
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Seluruh divisi operasional PT
                  </div>
                </div>

                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">Hak Upah Harian Belum Cair</div>
                  <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatRupiah(rekapKaryawan?.totalHakUpahBelumDibayar ?? rekapPayroll?.totalHakUpahPending ?? 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {rekapKaryawan?.karyawanDenganUpahPendingCount || 0} karyawan punya saldo upah berjalan
                  </div>
                </div>

                <div className="lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">Total Kasbon Karyawan Aktif</div>
                  <div className="font-mono text-xl font-bold text-amber-700 tabular-nums mt-0.5">
                    {formatRupiah(rekapKaryawan?.totalBonKaryawan ?? rekapPayroll?.totalSisaBonKaryawan ?? 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {rekapKaryawan?.karyawanDenganBonCount || 0} karyawan punya bon uang/barang
                  </div>
                </div>

                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">
                    Gaji Bersih Dibayar ({rekapPayroll?.periodeBulan || 'Bulan Ini'})
                  </div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(rekapPayroll?.totalGajiBersihDibayar || 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {rekapPayroll?.totalHariKerja || 0} hari kerja tercatat periode ini
                  </div>
                </div>
              </div>

              {/* Sub-view Segmented Control + Period & Search Filters */}
              <div className="pt-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start overflow-x-auto max-w-full">
                    <button
                      type="button"
                      onClick={() => setKaryawanSubView('BULANAN')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        karyawanSubView === 'BULANAN'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Rekap Bulanan &amp; Absensi
                    </button>
                    <button
                      type="button"
                      onClick={() => setKaryawanSubView('SALDO_TOTAL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        karyawanSubView === 'SALDO_TOTAL'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Saldo Kumulatif ({rekapKaryawan?.items.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setKaryawanSubView('SLIP_GAJI')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                        karyawanSubView === 'SLIP_GAJI'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Riwayat Slip Gaji ({penggajianList.length})
                    </button>
                  </div>

                  {/* Period & Division Selectors */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {karyawanSubView === 'BULANAN' && (
                      <>
                        <select
                          value={selectedBulan}
                          onChange={(e) => setSelectedBulan(Number(e.target.value))}
                          aria-label="Pilih Bulan"
                          className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        >
                          {BULAN_OPTIONS.map((b) => (
                            <option key={b.value} value={b.value}>
                              {b.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={selectedTahun}
                          onChange={(e) => setSelectedTahun(Number(e.target.value))}
                          aria-label="Pilih Tahun"
                          className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        >
                          {availableYears.map((yr) => (
                            <option key={yr} value={yr}>
                              {yr}
                            </option>
                          ))}
                        </select>
                      </>
                    )}

                    <select
                      value={selectedDivisiKaryawan}
                      onChange={(e) => setSelectedDivisiKaryawan(e.target.value)}
                      aria-label="Filter Divisi"
                      className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    >
                      <option value="ALL">Semua Divisi</option>
                      {(divisiMasterList.length > 0 ? divisiMasterList : DAFTAR_DIVISI).map((d) => (
                        <option key={d.id} value={d.nama}>
                          {d.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={karyawanSearch}
                    onChange={(e) => setKaryawanSearch(e.target.value)}
                    placeholder="Cari nama karyawan, NIK, jabatan, atau divisi..."
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
            </section>

            {/* SUB-VIEW 1: REKAP BULANAN & RINCIAN KERJA HARIAN */}
            {karyawanSubView === 'BULANAN' && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      Rekapitulasi Upah Harian &amp; Kasbon Karyawan —{' '}
                      {rekapPayroll?.periodeBulan || `${BULAN_OPTIONS[selectedBulan - 1]?.label} ${selectedTahun}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Klik nama karyawan untuk membuka rincian absensi kerja harian serta detail bon uang &amp; barang
                    </p>
                  </div>
                </div>

                {loadingKaryawan && !rekapPayroll ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Memuat rekapitulasi karyawan...
                  </div>
                ) : filteredPayrollItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tidak ada data karyawan yang sesuai untuk periode atau pencarian ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                          <th className="py-3 px-5 font-semibold">Nama Karyawan &amp; Divisi</th>
                          <th className="py-3 px-3 font-semibold text-right">Hari Kerja</th>
                          <th className="py-3 px-4 font-semibold text-right">Total Upah Kotor</th>
                          <th className="py-3 px-4 font-semibold text-right">Sisa Bon Aktif</th>
                          <th className="py-3 px-4 font-semibold text-right">Sudah Dibayar</th>
                          <th className="py-3 px-5 font-semibold text-right">Upah Belum Cair</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPayrollItems.map((item) => {
                          const isExpanded = expandedKaryawanId === item.idKaryawan;
                          const mitraId = karyawanMitraMap.get(item.idKaryawan);
                          const isOpeningStmt = mitraId ? loadingStatementId === mitraId : false;

                          return (
                            <React.Fragment key={item.idKaryawan}>
                              <tr
                                onClick={() =>
                                  setExpandedKaryawanId(isExpanded ? null : item.idKaryawan)
                                }
                                className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                              >
                                <td className="py-3.5 px-5">
                                  <div className="flex items-center gap-2.5">
                                    <DivisiLogoAvatar
                                      namaDivisi={item.divisiUtama}
                                      logoUrl={resolveDivisiLogoUrl(
                                        item.divisiUtama,
                                        undefined,
                                        divisiData.length > 0 ? divisiData : divisiMasterList
                                      )}
                                      size="sm"
                                    />
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">{item.nama}</span>
                                        {isExpanded ? (
                                          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {item.nik} · {item.jabatan} · {item.divisiUtama}
                                        {(item.saldoTitipHasilPanenMitra || 0) > 0 && (
                                          <span className="text-amber-700 font-semibold font-mono tabular-nums">
                                            {' '}· Titip Panen: {formatRupiah(item.saldoTitipHasilPanenMitra || 0)}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-800 tabular-nums whitespace-nowrap">
                                  {item.totalHariKerja} Hari
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                                  {item.totalGajiKotor > 0 ? formatRupiah(item.totalGajiKotor) : '-'}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-700 tabular-nums whitespace-nowrap">
                                  {item.totalSisaBonKaryawan > 0
                                    ? formatRupiah(item.totalSisaBonKaryawan)
                                    : '-'}
                                </td>
                                <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                                  {item.totalGajiBersihDibayar > 0
                                    ? formatRupiah(item.totalGajiBersihDibayar)
                                    : '-'}
                                </td>
                                <td className="py-3.5 px-5 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                  {item.totalHakUpahPending > 0
                                    ? formatRupiah(item.totalHakUpahPending)
                                    : '-'}
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={6} className="px-5 py-4 space-y-4">
                                    {/* Breakdown Summary Strip */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3.5 text-xs">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
                                        <div>
                                          <span className="text-slate-500">Upah Pokok</span>
                                          <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                                            {formatRupiah(item.totalUpahPokok)}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-slate-500">Makan &amp; Lembur</span>
                                          <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                                            {formatRupiah(item.totalUangMakanLembur)}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-slate-500">Bon Uang / Barang</span>
                                          <div className="font-mono font-bold text-amber-700 tabular-nums mt-0.5">
                                            {formatRupiah(item.sisaKasbonUang)} / {formatRupiah(item.sisaKasbonBarang)}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-slate-500">Selisih Bersih (Upah − Bon)</span>
                                          <div
                                            className={`font-mono font-bold tabular-nums mt-0.5 ${
                                              item.saldoBersih >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                            }`}
                                          >
                                            {formatRupiah(item.saldoBersih)}
                                          </div>
                                        </div>
                                      </div>

                                      {mitraId && (
                                        <button
                                          type="button"
                                          disabled={isOpeningStmt}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleOpenStatement(mitraId);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 self-start sm:self-center"
                                        >
                                          <span>
                                            {isOpeningStmt ? 'Memuat...' : 'Rekening Koran Bon & PDF'}
                                          </span>
                                          <ArrowUpRight className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>

                                    {/* Rincian Hari Kerja & Tugas Harian */}
                                    <div className="space-y-1.5">
                                      <div className="text-xs font-bold text-slate-800">
                                        Catatan Kerja &amp; Upah Harian ({item.rincianHarian.length} Catatan)
                                      </div>
                                      {item.rincianHarian.length === 0 ? (
                                        <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-3">
                                          Belum ada catatan kerja harian pada periode bulan ini.
                                        </div>
                                      ) : (
                                        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                                                <th className="py-2 px-3 font-semibold">Tanggal</th>
                                                <th className="py-2 px-3 font-semibold">Divisi</th>
                                                <th className="py-2 px-3 font-semibold">Item / Tugas Pekerjaan</th>
                                                <th className="py-2 px-3 font-semibold text-right">Upah Pokok</th>
                                                <th className="py-2 px-3 font-semibold text-right">Lembur/Makan</th>
                                                <th className="py-2 px-3 font-semibold text-right">Total</th>
                                                <th className="py-2 px-3 font-semibold text-right">Status</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {item.rincianHarian.map((rh) => (
                                                <tr key={rh.id}>
                                                  <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">
                                                    {rh.hariTanggal || rh.tanggal}
                                                  </td>
                                                  <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                                                    {rh.divisi}
                                                  </td>
                                                  <td className="py-2 px-3 text-slate-800">
                                                    {rh.item ? `${rh.item} — ` : ''}
                                                    {rh.tugas}
                                                    {rh.catatan ? ` (${rh.catatan})` : ''}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                                    {formatRupiah(rh.upahHarian)}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                                    {rh.uangMakanLembur > 0
                                                      ? formatRupiah(rh.uangMakanLembur)
                                                      : '-'}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                                                    {formatRupiah(rh.totalUpah)}
                                                  </td>
                                                  <td
                                                    className={`py-2 px-3 text-right font-semibold whitespace-nowrap ${
                                                      rh.status === 'SUDAH_DIBAYAR'
                                                        ? 'text-slate-500'
                                                        : 'text-emerald-700'
                                                    }`}
                                                  >
                                                    {rh.status === 'SUDAH_DIBAYAR' ? 'Sudah Cair' : 'Belum Cair'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>

                                    {/* Rincian Bon Aktif (Jika Ada) */}
                                    {((item.rincianBonUang && item.rincianBonUang.length > 0) ||
                                      (item.rincianBonBarang && item.rincianBonBarang.length > 0)) && (
                                      <div className="space-y-1.5">
                                        <div className="text-xs font-bold text-slate-800">
                                          Rincian Pinjaman / Kasbon Aktif Karyawan
                                        </div>
                                        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                                                <th className="py-2 px-3 font-semibold">Tanggal</th>
                                                <th className="py-2 px-3 font-semibold">Jenis Bon</th>
                                                <th className="py-2 px-3 font-semibold">Keterangan</th>
                                                <th className="py-2 px-3 font-semibold text-right">Sisa Kewajiban</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {(item.rincianBonUang || []).map((bu) => (
                                                <tr key={bu.idTransaksi}>
                                                  <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                                                    {bu.tanggal}
                                                  </td>
                                                  <td className="py-2 px-3 font-semibold text-amber-800 whitespace-nowrap">
                                                    Kasbon Uang ({bu.rekeningSumber})
                                                  </td>
                                                  <td className="py-2 px-3 text-slate-700">
                                                    {bu.keterangan || bu.idTransaksi}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold text-amber-700 tabular-nums whitespace-nowrap">
                                                    {formatRupiah(bu.sisaKasbon)}
                                                  </td>
                                                </tr>
                                              ))}
                                              {(item.rincianBonBarang || []).map((bb) => (
                                                <tr key={bb.noPenjualan}>
                                                  <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">
                                                    {bb.tanggal}
                                                  </td>
                                                  <td className="py-2 px-3 font-semibold text-slate-800 whitespace-nowrap">
                                                    Kasbon Barang Toko
                                                  </td>
                                                  <td className="py-2 px-3 text-slate-700">
                                                    {bb.items
                                                      ?.map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
                                                      .join(', ') || bb.keterangan}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold text-amber-700 tabular-nums whitespace-nowrap">
                                                    {formatRupiah(bb.sisaPiutang)}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* SUB-VIEW 2: SALDO KUMULATIF KARYAWAN (LINTAS BULAN) */}
            {karyawanSubView === 'SALDO_TOTAL' && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Posisi Saldo Kumulatif Seluruh Karyawan (Lintas Periode)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menampilkan akumulasi hak upah belum dibayar dan sisa bon aktif setiap karyawan hingga hari ini
                  </p>
                </div>

                {loadingKaryawan && !rekapKaryawan ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Memuat saldo kumulatif karyawan...
                  </div>
                ) : filteredSaldoKaryawanItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tidak ada karyawan yang sesuai dengan filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                          <th className="py-3 px-5 font-semibold">Nama Karyawan</th>
                          <th className="py-3 px-3 font-semibold text-right">Total Kerja</th>
                          <th className="py-3 px-4 font-semibold text-right">Upah Belum Cair</th>
                          <th className="py-3 px-4 font-semibold text-right">Total Bon Aktif</th>
                          <th className="py-3 px-4 font-semibold text-right">Posisi Bersih</th>
                          <th className="py-3 px-5 font-semibold text-right">Rekening Koran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSaldoKaryawanItems.map((k) => {
                          const isLoadingStmt = loadingStatementId === k.idMitraTerkait;
                          return (
                            <tr key={k.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-5">
                                <div className="font-semibold text-slate-900">{k.nama}</div>
                                <div className="text-xs text-slate-500">
                                  {k.nik} · {k.jabatan} · {k.divisi || k.divisiTerakhir}
                                </div>
                                {((k.totalTitipHasilPanen || 0) > 0 || (k.totalGajiSudahDibayar || 0) > 0) && (
                                  <div className="text-[11px] text-slate-600 font-mono tabular-nums mt-0.5">
                                    {(k.totalGajiSudahDibayar || 0) > 0 ? `Gaji Cair: ${formatRupiah(k.totalGajiSudahDibayar || 0)}` : ''}
                                    {(k.totalGajiSudahDibayar || 0) > 0 && (k.totalTitipHasilPanen || 0) > 0 ? ' · ' : ''}
                                    {(k.totalTitipHasilPanen || 0) > 0 ? `Titip Panen Mitra: ${formatRupiah(k.totalTitipHasilPanen || 0)}` : ''}
                                  </div>
                                )}
                                {k.tanggalKerjaTerakhir && (
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    Terakhir kerja: {k.tanggalKerjaTerakhir}
                                    {k.pekerjaanHarianTerakhir ? ` — ${k.pekerjaanHarianTerakhir}` : ''}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                                {k.totalHariKerja} Hari
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                {k.totalUpahBelumDibayar > 0 ? formatRupiah(k.totalUpahBelumDibayar) : '-'}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-700 tabular-nums whitespace-nowrap">
                                {k.totalBonKaryawan > 0 ? formatRupiah(k.totalBonKaryawan) : '-'}
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div
                                  className={`font-mono font-bold tabular-nums ${
                                    k.saldoBersih > 0
                                      ? 'text-emerald-700'
                                      : k.saldoBersih < 0
                                      ? 'text-amber-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {k.saldoBersih === 0 ? 'Impas' : formatRupiah(Math.abs(k.saldoBersih))}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  {k.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                                    ? 'Hak Karyawan'
                                    : k.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                                    ? 'Sisa Bon ke PT'
                                    : 'Lunas'}
                                </div>
                              </td>
                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                {k.idMitraTerkait ? (
                                  <button
                                    type="button"
                                    disabled={isLoadingStmt}
                                    onClick={() => void handleOpenStatement(k.idMitraTerkait)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-700 hover:text-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                                  >
                                    <span>{isLoadingStmt ? 'Memuat...' : 'Buku Bon & PDF'}</span>
                                    <ArrowUpRight className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
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

            {/* SUB-VIEW 3: RIWAYAT SLIP GAJI & PENCAIRAN UPAH */}
            {karyawanSubView === 'SLIP_GAJI' && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Riwayat Pembayaran Gaji &amp; Bukti Potong Kasbon ({filteredSlipGajiItems.length} Slip)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Daftar pencairan upah/gaji karyawan yang telah dibayarkan oleh kasir beserta rincian pemotongan bon
                  </p>
                </div>

                {loadingKaryawan && penggajianList.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Memuat riwayat pembayaran gaji...
                  </div>
                ) : filteredSlipGajiItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Belum ada riwayat slip gaji yang sesuai filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                          <th className="py-3 px-5 font-semibold">Tanggal &amp; No. Slip</th>
                          <th className="py-3 px-4 font-semibold">Karyawan &amp; Periode</th>
                          <th className="py-3 px-4 font-semibold text-right">Gaji Kotor</th>
                          <th className="py-3 px-4 font-semibold text-right">Potong Bon</th>
                          <th className="py-3 px-4 font-semibold text-right">Dibayar Bersih</th>
                          <th className="py-3 px-5 font-semibold text-right">Slip Resmi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSlipGajiItems.slice(0, 100).map((slip) => (
                          <tr key={slip.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-5 whitespace-nowrap">
                              <div className="font-mono font-semibold text-slate-900">{slip.tanggal}</div>
                              <div className="font-mono text-xs text-slate-400">
                                {slip.slipNomor} · {slip.rekeningSumber}
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-900">{slip.namaKaryawan}</div>
                              <div className="text-xs text-slate-500">
                                {slip.divisi} · {slip.periodeBulan}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                              {formatRupiah(slip.totalGajiKotor)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono text-rose-700 tabular-nums whitespace-nowrap">
                              {slip.potonganKasbon > 0 ? `−${formatRupiah(slip.potonganKasbon)}` : '-'}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                              {formatRupiah(slip.gajiBersihDibayar)}
                            </td>
                            <td className="py-3.5 px-5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setActiveSlip(slip)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-700 hover:text-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Lihat Slip</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* TAB 4: REKENING KORAN MITRA (READ-ONLY + DOWNLOAD PDF) */}
        {activeTab === 'mitra' && (
          <div className="space-y-5">
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">Total Piutang Bon Mitra ke PT</div>
                  <div className="font-mono text-xl font-bold text-amber-700 tabular-nums mt-0.5">
                    {formatRupiah(rekapMitra?.totalBonMitra || totalPiutangBon)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {rekapMitra?.mitraDenganBonCount || 0} mitra memiliki bon aktif
                  </div>
                </div>
                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">Total Kewajiban Titipan Panen Mitra</div>
                  <div className="font-mono text-xl font-bold text-rose-700 tabular-nums mt-0.5">
                    {formatRupiah(rekapMitra?.totalHutangPerusahaanKeMitra || totalTitipanMitra)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {rekapMitra?.mitraDenganHutangTitipCount || 0} mitra memiliki saldo titip
                  </div>
                </div>
                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">Total Mitra Terdaftar</div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {rekapMitra?.totalMitra || 0} Mitra
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Klik tombol Buka &amp; PDF untuk melihat Rekening Koran &amp; Bukti Nota
                  </div>
                </div>
              </div>

              {/* Search & Segmented Filter */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={mitraSearch}
                    onChange={(e) => setMitraSearch(e.target.value)}
                    placeholder="Cari nama mitra, petani, supplier, atau karyawan..."
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setMitraFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      mitraFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({rekapMitra?.items.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMitraFilter('BON')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      mitraFilter === 'BON'
                        ? 'bg-white text-amber-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Punya Bon ({rekapMitra?.mitraDenganBonCount || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setMitraFilter('TITIP')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      mitraFilter === 'TITIP'
                        ? 'bg-white text-rose-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Punya Titipan ({rekapMitra?.mitraDenganHutangTitipCount || 0})
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {loadingMitra && !rekapMitra ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Memuat buku besar mitra...
                </div>
              ) : filteredMitraItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Tidak ada mitra yang sesuai dengan pencarian.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                          <th className="py-3 px-5 font-semibold">Nama Mitra</th>
                          <th className="py-3 px-4 font-semibold text-right">Sisa Bon ke PT</th>
                          <th className="py-3 px-4 font-semibold text-right">Saldo Titip di PT</th>
                          <th className="py-3 px-5 font-semibold text-right">Rekening Koran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedMitraItems.map((m) => {
                          const bonBersih = m.sisaBonBersih ?? m.totalBonMitra;
                          const titipBersih = m.sisaTitipanBersih ?? m.totalHutangTitipPanen;
                          const isLoadingThis = loadingStatementId === m.id;
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-5">
                                <div className="font-semibold text-slate-900">{m.nama}</div>
                                <div className="text-xs text-slate-500">
                                  {m.kode} ·{' '}
                                  {(m.isKaryawan || m.role === 'KARYAWAN') &&
                                  (m.hasTransaksiMitraPanen || (m.totalTitipPanenMurni || 0) > 0)
                                    ? 'KARYAWAN & MITRA PANEN'
                                    : m.role.replace(/_/g, ' ')}
                                  {m.alamat && m.alamat !== '-' ? ` · ${m.alamat}` : ''}
                                </div>
                                {((m.totalGajiSudahDibayar || 0) > 0 || (m.totalUpahBelumDibayar || 0) > 0) && (
                                  <div className="text-[11px] text-emerald-700 font-mono tabular-nums mt-0.5">
                                    {(m.totalUpahBelumDibayar || 0) > 0
                                      ? `Upah Belum Cair: ${formatRupiah(m.totalUpahBelumDibayar || 0)}`
                                      : ''}
                                    {(m.totalUpahBelumDibayar || 0) > 0 && (m.totalGajiSudahDibayar || 0) > 0
                                      ? ' · '
                                      : ''}
                                    {(m.totalGajiSudahDibayar || 0) > 0
                                      ? `Gaji Cair: ${formatRupiah(m.totalGajiSudahDibayar || 0)}`
                                      : ''}
                                  </div>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-amber-700 whitespace-nowrap">
                                {bonBersih > 0 ? formatRupiah(bonBersih) : '-'}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-rose-700 whitespace-nowrap">
                                {titipBersih > 0 ? (
                                  <div>
                                    <div>{formatRupiah(titipBersih)}</div>
                                    {(m.totalTitipPanenMurni || 0) > 0 && (m.totalUpahBelumDibayar || 0) > 0 && (
                                      <div className="text-[10px] font-normal text-slate-500">
                                        Panen {formatRupiah(m.totalTitipPanenMurni || 0)} + Upah {formatRupiah(m.totalUpahBelumDibayar || 0)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  disabled={isLoadingThis}
                                  onClick={() => void handleOpenStatement(m.id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-700 hover:text-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  <span>{isLoadingThis ? 'Memuat...' : 'Buka & PDF'}</span>
                                  <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {filteredMitraItems.length > mitraVisibleLimit && (
                    <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>
                        Menampilkan <strong>{displayedMitraItems.length}</strong> dari{' '}
                        <strong>{filteredMitraItems.length}</strong> mitra
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMitraVisibleLimit((prev) => prev + 60)}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-800 cursor-pointer"
                        >
                          Tampilkan +60 Mitra
                        </button>
                        <button
                          type="button"
                          onClick={() => setMitraVisibleLimit(filteredMitraItems.length)}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                        >
                          Tampilkan Semua
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {/* TAB 5: JURNAL SEMUA TRANSAKSI HARIAN & BUKTI NOTA (STRICT READ-ONLY) */}
        {activeTab === 'jurnal' && (
          <RekapSemuaTransaksiHarianView readOnly onRefreshParent={onRefreshAll} />
        )}

        {/* TAB 6: STOK GUDANG & LABA RUGI */}
        {activeTab === 'stok' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Stok Hasil Bumi */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Stok Gudang Hasil Bumi
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Volume komoditas hasil bumi tersedia saat ini
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                        <th className="py-2.5 px-4 font-semibold">Komoditas</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Stok (Kg)</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Tonase</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stokHasilBumiList.map((hb) => (
                        <tr key={hb.kode}>
                          <td className="py-3 px-4 font-medium text-slate-900">{hb.nama}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {Number(hb.stok || 0).toLocaleString('id-ID')} {hb.satuan}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums">
                            {(Number(hb.stok || 0) / 1000).toFixed(2)} Ton
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Stok Barang Toko (No nested scroll trap — smooth page scrolling) */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Stok Barang Dagangan Toko ({stokBarangList.length} Item)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Diurutkan dari stok yang paling memerlukan perhatian kulakan
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead className="bg-slate-50/70">
                      <tr className="border-b border-slate-100 text-slate-500 text-xs">
                        <th className="py-2.5 px-4 font-semibold">Nama Barang</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Sisa Stok</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedStokBarang.map((sb) => {
                        const isAlatJasa = isKategoriAlatNonStok(sb.kategori);
                        const isLow = !isAlatJasa && (sb.stok || 0) <= (sb.minimum || 5);
                        return (
                          <tr key={sb.kode}>
                            <td className="py-2.5 px-4">
                              <div className="font-medium text-slate-900">{sb.namaProduk}</div>
                              {isAlatJasa ? (
                                <div className="text-[11px] text-sky-700">
                                  Sewa jasa ({sb.satuan}) — tanpa stok fisik
                                </div>
                              ) : (
                                isLow && (
                                  <div className="text-[11px] text-rose-700">
                                    Stok menipis (min. {sb.minimum || 5} {sb.satuan})
                                  </div>
                                )
                              )}
                            </td>
                            <td
                              className={`py-2.5 px-4 text-right font-mono font-bold tabular-nums ${
                                isAlatJasa
                                  ? 'text-sky-700'
                                  : isLow
                                  ? 'text-rose-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {isAlatJasa
                                ? 'Tanpa Stok'
                                : `${Number(sb.stok || 0).toLocaleString('id-ID')} ${sb.satuan}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {sortedStokBarang.length > 30 && (
                  <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      Menampilkan {displayedStokBarang.length} dari {sortedStokBarang.length} item barang
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllStokBarang((prev) => !prev)}
                      className="font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                    >
                      {showAllStokBarang ? 'Ringkas Tampilan' : 'Tampilkan Semua Barang'}
                    </button>
                  </div>
                )}
              </section>
            </div>

            {/* Laba & Rugi Per Divisi */}
            <LabaRugiProdukView readOnly divisiMasterList={divisiMasterList} />
          </div>
        )}
      </main>

      {/* Read-Only Rekening Koran + Bukti Nota Lalu + PDF Export Modal */}
      {selectedStatement && (
        <CetakRekeningKoranModal
          statement={selectedStatement}
          profilPerusahaan={profilPerusahaan}
          rekeningUtamaDetail={rekeningUtamaDetail}
          onClose={() => setSelectedStatement(null)}
        />
      )}

      {/* Read-Only Slip Gaji Karyawan Modal */}
      {activeSlip && <SlipGajiModal slip={activeSlip} onClose={() => setActiveSlip(null)} />}
    </div>
  );
};

export const PortalEksekutifBosView = React.memo(PortalEksekutifBosViewInner);
