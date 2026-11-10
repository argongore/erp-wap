import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
  RefreshCw,
  LogOut,
  Search,
  Receipt,
  ArrowUpRight,
  Wallet,
  Landmark,
  Layers,
  Users,
  Briefcase,
  Boxes,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Printer,
  UserCog,
  Plus,
  ArrowRight,
  FileSpreadsheet,
  Calendar,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  CanonicalRoleMitra,
  DAFTAR_DIVISI,
  DAFTAR_ROLE_MITRA,
  DEFAULT_PT_LOGO_URL,
  getRoleMitraLabel,
  NamaDivisi,
  normalizeRoleMitra,
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
  isKategoriAlatNonStok,
  Produk,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { CetakRekeningKoranModal } from '../laporan/CetakRekeningKoranModal.tsx';
import { SlipGajiModal } from '../karyawan/SlipGajiModal.tsx';
import { InputPayrollHarianDivisiModal } from '../karyawan/InputPayrollHarianDivisiModal.tsx';
import {
  KaryawanAvatar,
  ModalPreviewFotoKaryawan,
  ModalProfilKaryawan,
  ProfilKaryawanEditableData,
} from '../karyawan/ModalProfilKaryawan.tsx';
import { PWAInstallButton } from '../common/PWAInstallButton.tsx';
import { ModalBackupFullSpreadsheet } from '../database/ModalBackupFullSpreadsheet.tsx';
import { RekapHarianDanKomoditasBosView } from './RekapHarianDanKomoditasBosView.tsx';
import { ArusKasDivisiBosView } from './ArusKasDivisiBosView.tsx';
import { PengeluaranBosView } from './PengeluaranBosView.tsx';
import { StokDanPembelianHbBosView } from './StokDanPembelianHbBosView.tsx';

type BosTab = 'kas' | 'harian' | 'divisi' | 'pengeluaran' | 'stok' | 'karyawan' | 'mitra';
type KaryawanSubView = 'BULANAN' | 'SALDO_TOTAL' | 'SLIP_GAJI';
type KaryawanQuickFilter = 'ALL' | 'ADA_GAJI' | 'ADA_PIUTANG';

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
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Lazy load tracking per tab to eliminate initial mount API storms
  const loadedTabsRef = useRef<{ divisi: boolean; karyawan: boolean; mitra: boolean }>({
    divisi: false,
    karyawan: false,
    mitra: false,
  });

  // Division financial state
  const [divisiData, setDivisiData] = useState<PergerakanKeuanganDivisiSummary[]>([]);
  const [loadingDivisi, setLoadingDivisi] = useState(false);

  // Employee recap state
  const nowInit = useMemo(() => new Date(), []);
  const [karyawanSubView, setKaryawanSubView] = useState<KaryawanSubView>('BULANAN');
  const [karyawanQuickFilter, setKaryawanQuickFilter] = useState<KaryawanQuickFilter>('ALL');
  const [selectedBulan, setSelectedBulan] = useState<number>(nowInit.getMonth() + 1);
  const [selectedTahun, setSelectedTahun] = useState<number>(nowInit.getFullYear());
  const [selectedDivisiKaryawan, setSelectedDivisiKaryawan] = useState<string>('ALL');
  const [karyawanSearch, setKaryawanSearch] = useState('');
  const deferredKaryawanSearch = useDeferredValue(karyawanSearch);

  const [rekapKaryawan, setRekapKaryawan] = useState<RekapMasterKaryawanSummary | null>(null);
  const [rekapPayroll, setRekapPayroll] = useState<RekapPayrollBulananSummary | null>(null);
  const [penggajianList, setPenggajianList] = useState<TransaksiPenggajian[]>([]);
  const [karyawanMasterList, setKaryawanMasterList] = useState<KaryawanWithBon[]>([]);
  const [loadingKaryawan, setLoadingKaryawan] = useState(false);
  const [expandedKaryawanId, setExpandedKaryawanId] = useState<string | null>(null);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  // Employee Profile / Division Upgrade & Daily Wage Input Modals (Synchronized with Kasir)
  const [editingProfilKaryawan, setEditingProfilKaryawan] = useState<ProfilKaryawanEditableData | null>(null);
  const [previewFotoKry, setPreviewFotoKry] = useState<{
    nama: string;
    jabatan?: string;
    divisi?: string;
    fotoUrl: string;
  } | null>(null);
  const [inputUpahModalConfig, setInputUpahModalConfig] = useState<{
    open: boolean;
    idKaryawan?: string;
    divisi?: NamaDivisi;
  }>({ open: false });

  // Mitra summary & read-only statement modal
  const [rekapMitra, setRekapMitra] = useState<RekapMasterMitraSummary | null>(null);
  const [loadingMitra, setLoadingMitra] = useState(false);
  const [mitraSearch, setMitraSearch] = useState('');
  const deferredMitraSearch = useDeferredValue(mitraSearch);
  const [mitraFilter, setMitraFilter] = useState<'ALL' | 'BON' | 'TITIP' | 'NGUNCI'>('ALL');
  const [mitraRoleFilter, setMitraRoleFilter] = useState<'ALL' | CanonicalRoleMitra>('ALL');
  const [mitraVisibleLimit, setMitraVisibleLimit] = useState<number>(60);
  const [selectedStatement, setSelectedStatement] = useState<RekeningKoranMitraSummary | null>(null);
  const [loadingStatementId, setLoadingStatementId] = useState<string | null>(null);

  // Valuasi stok barang penjualan & modal hasil bumi untuk Kas & Saldo PT
  const [produkList, setProdukList] = useState<Produk[]>([]);
  const [ringkasanHbKas, setRingkasanHbKas] = useState<Awaited<
    ReturnType<typeof api.getRingkasanHasilBumiBulanan>
  > | null>(null);


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
        const [rekapMasterRes, payrollRes, slipRes, kryListRes] = await Promise.all([
          api.getRekapKaryawan().catch(() => null),
          api
            .getRekapPayrollBulanan({
              bulan: selectedBulan,
              tahun: selectedTahun,
              divisi: selectedDivisiKaryawan !== 'ALL' ? selectedDivisiKaryawan : undefined,
            })
            .catch(() => null),
          api.getPenggajian().catch(() => [] as TransaksiPenggajian[]),
          api.getKaryawan().catch(() => [] as KaryawanWithBon[]),
        ]);
        if (rekapMasterRes) setRekapKaryawan(rekapMasterRes);
        if (payrollRes) setRekapPayroll(payrollRes);
        setPenggajianList(Array.isArray(slipRes) ? slipRes : []);
        setKaryawanMasterList(Array.isArray(kryListRes) ? kryListRes : []);
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

  const loadKasValuasi = useCallback(async () => {
    const [prodRes, hbRes] = await Promise.all([
      api.getProduk().catch(() => [] as Produk[]),
      api.getRingkasanHasilBumiBulanan().catch(() => null),
    ]);
    setProdukList(Array.isArray(prodRes) ? prodRes : []);
    if (hbRes) setRingkasanHbKas(hbRes);
  }, []);

  // Lazy-fetch tab data only when the user actually opens that tab
  useEffect(() => {
    if (activeTab === 'kas') {
      void loadKasValuasi();
    } else if (activeTab === 'divisi' && !loadedTabsRef.current.divisi) {
      void loadDivisiTab(false);
    } else if (activeTab === 'mitra' && !loadedTabsRef.current.mitra) {
      void loadMitraTab(false);
    }
  }, [activeTab, loadKasValuasi, loadDivisiTab, loadMitraTab]);

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
      if (activeTab === 'kas') {
        void loadKasValuasi();
      } else if (activeTab === 'divisi') {
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
  }, [deferredMitraSearch, mitraFilter, mitraRoleFilter]);

  const openProfilKaryawanModalById = useCallback(
    (idKry: string) => {
      const fullKry = karyawanMasterList.find((k) => k.id === idKry);
      const rekapItem = rekapKaryawan?.items.find((k) => k.id === idKry);
      const payrollItem = rekapPayroll?.items.find((k) => k.idKaryawan === idKry);

      if (!fullKry && !rekapItem && !payrollItem) return;

      setEditingProfilKaryawan({
        id: idKry,
        nik: fullKry?.nik || rekapItem?.nik || payrollItem?.nik || '',
        nama: fullKry?.nama || rekapItem?.nama || payrollItem?.nama || '',
        jabatan: fullKry?.jabatan || rekapItem?.jabatan || payrollItem?.jabatan || '',
        divisi:
          fullKry?.divisi ||
          payrollItem?.divisiAktifSaatIni ||
          rekapItem?.divisi ||
          payrollItem?.divisiUtama ||
          'Gudang Wijaya Agro',
        telepon: fullKry?.telepon || rekapItem?.telepon || '-',
        alamat: fullKry?.alamat || rekapItem?.alamat || '-',
        tanggalMasuk: fullKry?.tanggalMasuk,
        status: fullKry?.status || rekapItem?.status || 'AKTIF',
        fotoUrl: fullKry?.fotoUrl || payrollItem?.fotoUrl || rekapItem?.fotoUrl,
        catatan: fullKry?.catatan,
        riwayatDivisi:
          fullKry?.riwayatDivisi || payrollItem?.riwayatDivisi || rekapItem?.riwayatDivisi || [],
      });
    },
    [karyawanMasterList, rekapKaryawan, rekapPayroll]
  );

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
  const berangkasRek = safeRekening.find(
    (r) => r.kode === 'BRK01' || /\b(berangkas|brankas)\b/i.test(r.nama || '')
  );
  const bon01 = safeRekening.find((r) => r.kode === 'BON01');
  const tit01 = safeRekening.find((r) => r.kode === 'TIT01');

  const bankPerusahaanList = useMemo(
    () =>
      safeRekening.filter(
        (r) =>
          (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode.startsWith('REK-'))) &&
          r.kode !== 'KAS01' &&
          r.kode !== berangkasRek?.kode &&
          r.status === 'AKTIF'
      ),
    [safeRekening, berangkasRek]
  );

  const anakPerusahaanList = useMemo(
    () => safeRekening.filter((r) => r.kategori === 'ANAK_PERUSAHAAN' || r.isAnakPerusahaan),
    [safeRekening]
  );

  const totalKasTunai = Number(kas01?.saldoSaatIni) || 0;
  const totalBerangkas = Number(berangkasRek?.saldoSaatIni) || 0;
  const totalBankPerusahaan = bankPerusahaanList.reduce(
    (sum, r) => sum + (Number(r.saldoSaatIni) || 0),
    0
  );
  const totalPiutangBon = Number(bon01?.saldoSaatIni) || 0;
  const totalTitipanMitra = Number(tit01?.saldoSaatIni) || 0;

  // Akumulasi nilai stok barang penjualan (stok ready * harga beli/modal)
  const totalNilaiStokBarang = useMemo(() => {
    const produkMap = new Map<string, Produk>();
    for (const p of produkList) {
      produkMap.set(p.kode, p);
    }
    let total = 0;
    for (const sb of stokBarangList || []) {
      const nonStok = sb.tanpaStok === true || isKategoriAlatNonStok(sb.kategori);
      const qty = Number(sb.stok) || 0;
      if (!nonStok && qty > 0) {
        const hargaModal = Number(produkMap.get(sb.kode)?.hargaBeli) || 0;
        total += Math.round(qty * hargaModal);
      }
    }
    return total;
  }, [stokBarangList, produkList]);

  // Akumulasi nilai modal pembelian hasil bumi (seluruh komoditas ready)
  const totalNilaiModalHb = useMemo(() => {
    if (ringkasanHbKas && Number(ringkasanHbKas.totalNilaiModalReadyGudang) > 0) {
      return Math.round(Number(ringkasanHbKas.totalNilaiModalReadyGudang));
    }
    let total = 0;
    for (const hb of stokHasilBumiList || []) {
      if (hb.kode === 'HB-01B' || hb.nama?.trim().toUpperCase() === 'KOPI JALAN') continue;
      const readyKg = Math.max(0, Number(hb.stok) || 0);
      const rataModal = Number(hb.hargaBeliStandar || hb.rataRataModalAwal || 0);
      total += Math.round(readyKg * rataModal);
    }
    return total;
  }, [stokHasilBumiList, ringkasanHbKas]);

  // Rumus Kas & Saldo PT:
  // Kas Utama Kasir + Saldo Berangkas + Total Rekening Bank PT + Piutang Bon Mitra + Nilai Stok Barang Penjualan + Nilai Modal Hasil Bumi - Hutang/Titipan Hasil Bumi
  const totalKasDanSaldoPt =
    totalKasTunai +
    totalBerangkas +
    totalBankPerusahaan +
    totalPiutangBon +
    totalNilaiStokBarang +
    totalNilaiModalHb -
    totalTitipanMitra;

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

  // Lookup cumulative employee salary/receivable stats by employee ID
  const rekapKaryawanByIdMap = useMemo(() => {
    const map = new Map<string, NonNullable<RekapMasterKaryawanSummary['items']>[number]>();
    for (const k of rekapKaryawan?.items || []) {
      map.set(k.id, k);
    }
    return map;
  }, [rekapKaryawan]);

  const karyawanGlobalGajiPiutangStats = useMemo(() => {
    let totalAkumulasiGajiDibayar = 0;
    let totalAkumulasiUpahBelumCair = 0;
    let totalPiutangKasbonUang = 0;
    let totalPiutangKasbonBarang = 0;
    let adaGajiCount = 0;
    let adaPiutangCount = 0;

    for (const k of rekapKaryawan?.items || []) {
      const cair = Number(k.totalGajiSudahDibayar || k.totalUpahSudahDibayar || 0);
      const belum = Number(k.totalUpahBelumDibayar || 0);
      const bonUang = Number(k.totalKasbonUang || 0);
      const bonBrg = Number(k.totalKasbonBarang || 0);
      const bonTotal = Number(k.totalBonKaryawan || 0);

      totalAkumulasiGajiDibayar += cair;
      totalAkumulasiUpahBelumCair += belum;
      totalPiutangKasbonUang += bonUang;
      totalPiutangKasbonBarang += bonBrg;
      if (cair > 0 || belum > 0 || (k.totalHakUpahHarian || 0) > 0) adaGajiCount += 1;
      if (bonTotal > 0) adaPiutangCount += 1;
    }

    const totalPiutang =
      rekapKaryawan?.totalBonKaryawan ??
      rekapPayroll?.totalSisaBonKaryawan ??
      totalPiutangKasbonUang + totalPiutangKasbonBarang;

    const totalBelumCair =
      rekapKaryawan?.totalHakUpahBelumDibayar ??
      rekapPayroll?.totalHakUpahPending ??
      totalAkumulasiUpahBelumCair;

    return {
      totalAkumulasiGajiDibayar,
      totalBelumCair,
      totalPiutang,
      totalPiutangKasbonUang,
      totalPiutangKasbonBarang,
      selisihBersih: totalBelumCair - totalPiutang,
      adaGajiCount,
      adaPiutangCount,
    };
  }, [rekapKaryawan, rekapPayroll]);

  const filteredPayrollItems = useMemo(() => {
    const items = rekapPayroll?.items || [];
    const q = deferredKaryawanSearch.trim().toLowerCase();
    return items.filter((item) => {
      const masterRekap = rekapKaryawanByIdMap.get(item.idKaryawan);
      const nominalGaji =
        (item.totalGajiKotor || 0) +
        (item.totalUpahBelumDibayarSemuaPeriode || 0) +
        (masterRekap?.totalGajiSudahDibayar || 0);
      const nominalPiutang = item.totalSisaBonKaryawan || masterRekap?.totalBonKaryawan || 0;

      if (karyawanQuickFilter === 'ADA_GAJI' && nominalGaji <= 0) return false;
      if (karyawanQuickFilter === 'ADA_PIUTANG' && nominalPiutang <= 0) return false;

      if (!q) return true;
      return (
        item.nama.toLowerCase().includes(q) ||
        item.nik.toLowerCase().includes(q) ||
        item.jabatan.toLowerCase().includes(q) ||
        item.divisiUtama.toLowerCase().includes(q)
      );
    });
  }, [rekapPayroll, deferredKaryawanSearch, karyawanQuickFilter, rekapKaryawanByIdMap]);

  const filteredSaldoKaryawanItems = useMemo(() => {
    const items = rekapKaryawan?.items || [];
    const q = deferredKaryawanSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedDivisiKaryawan !== 'ALL') {
        const div = item.divisi || item.divisiTerakhir || item.departemen || '';
        if (div !== selectedDivisiKaryawan) return false;
      }
      const totalGajiKumulatif =
        (item.totalGajiSudahDibayar || item.totalUpahSudahDibayar || 0) +
        (item.totalUpahBelumDibayar || 0);
      if (karyawanQuickFilter === 'ADA_GAJI' && totalGajiKumulatif <= 0) return false;
      if (karyawanQuickFilter === 'ADA_PIUTANG' && (item.totalBonKaryawan || 0) <= 0) return false;

      if (!q) return true;
      return (
        item.nama.toLowerCase().includes(q) ||
        item.nik.toLowerCase().includes(q) ||
        item.jabatan.toLowerCase().includes(q) ||
        (item.divisi || '').toLowerCase().includes(q)
      );
    });
  }, [rekapKaryawan, selectedDivisiKaryawan, deferredKaryawanSearch, karyawanQuickFilter]);

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
      const canonicalRole = normalizeRoleMitra(m.role, {
        isAnakPerusahaan: m.isAnakPerusahaan,
        isKaryawan: m.isKaryawan,
      });
      if (mitraRoleFilter !== 'ALL' && canonicalRole !== mitraRoleFilter) return false;
      if (mitraFilter === 'BON' && (m.sisaBonBersih ?? m.totalBonMitra) <= 0) return false;
      if (mitraFilter === 'TITIP' && (m.sisaTitipanBersih ?? m.totalHutangTitipPanen) <= 0) return false;
      if (mitraFilter === 'NGUNCI' && !(m.isNotaNgunci || (m.nominalNotaNgunci || 0) > 0)) return false;
      if (!q) return true;
      return (
        m.nama.toLowerCase().includes(q) ||
        m.kode.toLowerCase().includes(q) ||
        (m.telepon || '').toLowerCase().includes(q) ||
        (m.alamat || '').toLowerCase().includes(q)
      );
    });
  }, [rekapMitra, deferredMitraSearch, mitraFilter, mitraRoleFilter]);

  const mitraRoleCounts = useMemo(() => {
    const counts: Record<CanonicalRoleMitra, number> = {
      SUPPLIER: 0,
      CUSTOMER: 0,
      SUPPLIER_CUSTOMER: 0,
      ANAK_PERUSAHAAN: 0,
      KARYAWAN: 0,
    };
    for (const m of rekapMitra?.items || []) {
      const c = normalizeRoleMitra(m.role, {
        isAnakPerusahaan: m.isAnakPerusahaan,
        isKaryawan: m.isKaryawan,
      });
      counts[c] = (counts[c] || 0) + 1;
    }
    return counts;
  }, [rekapMitra]);

  const displayedMitraItems = useMemo(
    () => filteredMitraItems.slice(0, mitraVisibleLimit),
    [filteredMitraItems, mitraVisibleLimit]
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
      { id: 'harian', label: 'Rekap Harian & Komoditas', icon: Calendar },
      { id: 'divisi', label: 'Arus Kas Divisi', icon: Layers },
      { id: 'pengeluaran', label: 'Pengeluaran', icon: Receipt },
      { id: 'stok', label: 'Stok & Pembelian HB', icon: Boxes },
      { id: 'karyawan', label: 'Rekap Karyawan', icon: Briefcase },
      { id: 'mitra', label: 'Rekening Mitra', icon: Users },
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
              onClick={() => setShowBackupModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors cursor-pointer"
              title="Backup Full Keseluruhan Data & Larikan ke Google Spreadsheet / Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="hidden sm:inline">Backup Spreadsheet</span>
            </button>

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
                    Total Kas &amp; Saldo PT (Kasir + Berangkas + Bank PT + Piutang Bon + Stok Barang + Modal HB - Titipan HB)
                  </p>
                  <div className="mt-1 font-mono text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                    {formatRupiah(totalKasDanSaldoPt)}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  Diperbarui otomatis setiap kasir menyimpan transaksi
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 pt-5">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">+ Kas Utama Kasir (KAS01)</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-emerald-700 tabular-nums">
                    {formatRupiah(totalKasTunai)}
                  </div>
                  <div className="text-[11px] text-slate-400">Uang tunai berjalan di kasir</div>
                </div>

                <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">
                    + Saldo {berangkasRek?.nama || 'BERANGKAS'} ({berangkasRek?.kode || 'BRK01'})
                  </div>
                  <div className="font-mono text-base sm:text-lg font-bold text-amber-800 tabular-nums">
                    {formatRupiah(totalBerangkas)}
                  </div>
                  <div className="text-[11px] text-slate-400">Simpanan tunai berangkas</div>
                </div>

                <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">+ Total Rekening Bank PT</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-slate-900 tabular-nums">
                    {formatRupiah(totalBankPerusahaan)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {bankPerusahaanList.length} rekening bank aktif
                  </div>
                </div>

                <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">+ Piutang Bon Mitra (BON01)</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-amber-700 tabular-nums">
                    {formatRupiah(totalPiutangBon)}
                  </div>
                  <div className="text-[11px] text-slate-400">Uang PT di luar</div>
                </div>

                <div className="space-y-1 xl:border-l xl:border-slate-100 xl:pl-4">
                  <div className="text-xs text-slate-500">+ Nilai Stok Barang Penjualan</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-sky-700 tabular-nums">
                    {formatRupiah(totalNilaiStokBarang)}
                  </div>
                  <div className="text-[11px] text-slate-400">Modal stok barang ready</div>
                </div>

                <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">+ Nilai Modal Hasil Bumi</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-indigo-700 tabular-nums">
                    {formatRupiah(totalNilaiModalHb)}
                  </div>
                  <div className="text-[11px] text-slate-400">Modal pembelian HB ready</div>
                </div>

                <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">- Hutang / Titipan HB (TIT01)</div>
                  <div className="font-mono text-base sm:text-lg font-bold text-rose-700 tabular-nums">
                    {formatRupiah(totalTitipanMitra)}
                  </div>
                  <div className="text-[11px] text-slate-400">Kewajiban belum dicairkan</div>
                </div>
              </div>
            </section>

            {/* Detailed Bank & Cash Account Table */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Rincian Posisi Saldo Tiap Rekening Kas, Berangkas &amp; Bank
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
                    {berangkasRek && (
                      <tr className="bg-amber-50/40 hover:bg-amber-50/70">
                        <td className="py-3.5 px-5 font-mono font-bold text-amber-900">{berangkasRek.kode}</td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {berangkasRek.nama}{' '}
                          <span className="text-xs font-medium text-amber-800">· Tempat Setor Kasir</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 hidden md:table-cell">
                          {berangkasRek.atasNama} · {berangkasRek.nomorRekening}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-amber-800 tabular-nums">
                          {formatRupiah(berangkasRek.saldoSaatIni)}
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

            {/* Rekapan Transaksi Harian Bos, Tutup Kasir -> Berangkas & Barang Masuk per Komoditas */}
            <RekapHarianDanKomoditasBosView onRefreshParent={onRefreshAll} />
          </div>
        )}

        {/* TAB KHUSUS: REKAP HARIAN & KOMODITAS */}
        {activeTab === 'harian' && (
          <RekapHarianDanKomoditasBosView onRefreshParent={onRefreshAll} />
        )}

        {/* TAB 2: ARUS KAS DIVISI (FOKUS CASH FLOW IN / OUT UANG PER DIVISI) */}
        {activeTab === 'divisi' && (
          <ArusKasDivisiBosView
            divisiData={divisiData}
            divisiMasterList={divisiMasterList}
            loading={loadingDivisi}
          />
        )}

        {/* TAB: REKAP KARYAWAN (LANGSUNG MELIHAT NOMINAL GAJI DAN PIUTANG / KASBON) */}
        {activeTab === 'karyawan' && (
          <div className="space-y-5">
            {/* Executive KPI Summary: Nominal Gaji & Piutang Karyawan */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">
                    Nominal Gaji ({rekapPayroll?.periodeBulan || 'Bulan Ini'})
                  </div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(rekapPayroll?.totalGajiKotor || 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {rekapPayroll?.totalHariKerja || 0} hari kerja ·{' '}
                    {rekapKaryawan?.totalKaryawan ?? rekapPayroll?.totalPekerja ?? 0} karyawan
                  </div>
                </div>

                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">Gaji Sudah Dibayar (Cair)</div>
                  <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatRupiah(
                      karyawanSubView === 'SALDO_TOTAL'
                        ? karyawanGlobalGajiPiutangStats.totalAkumulasiGajiDibayar
                        : rekapPayroll?.totalGajiBersihDibayar || 0
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    Total slip cair semua waktu:{' '}
                    {formatRupiahSingkat(karyawanGlobalGajiPiutangStats.totalAkumulasiGajiDibayar)}
                  </div>
                </div>

                <div className="lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">Gaji / Upah Belum Cair</div>
                  <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
                    {formatRupiah(karyawanGlobalGajiPiutangStats.totalBelumCair)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {rekapKaryawan?.karyawanDenganUpahPendingCount || 0} karyawan punya hak gaji berjalan
                  </div>
                </div>

                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs font-semibold text-amber-800">
                    Total Piutang / Kasbon Karyawan
                  </div>
                  <div className="font-mono text-xl font-bold text-amber-700 tabular-nums mt-0.5">
                    {formatRupiah(karyawanGlobalGajiPiutangStats.totalPiutang)}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                    {rekapKaryawan?.karyawanDenganBonCount || 0} orang · Uang{' '}
                    {formatRupiahSingkat(karyawanGlobalGajiPiutangStats.totalPiutangKasbonUang)} · Brg{' '}
                    {formatRupiahSingkat(karyawanGlobalGajiPiutangStats.totalPiutangKasbonBarang)}
                  </div>
                </div>

                <div className="lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">Selisih (Gaji Belum Cair − Piutang)</div>
                  <div
                    className={`font-mono text-xl font-bold tabular-nums mt-0.5 ${
                      karyawanGlobalGajiPiutangStats.selisihBersih >= 0
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    {karyawanGlobalGajiPiutangStats.selisihBersih < 0
                      ? `−${formatRupiah(Math.abs(karyawanGlobalGajiPiutangStats.selisihBersih))}`
                      : formatRupiah(karyawanGlobalGajiPiutangStats.selisihBersih)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {karyawanGlobalGajiPiutangStats.selisihBersih >= 0
                      ? 'Posisi bersih hak karyawan'
                      : 'Posisi bersih piutang karyawan ke PT'}
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        karyawanSubView === 'BULANAN'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Gaji &amp; Piutang Bulanan
                    </button>
                    <button
                      type="button"
                      onClick={() => setKaryawanSubView('SALDO_TOTAL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        karyawanSubView === 'SALDO_TOTAL'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Saldo Gaji &amp; Piutang Kumulatif ({rekapKaryawan?.items.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setKaryawanSubView('SLIP_GAJI')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
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

                {/* Quick Filter Gaji / Piutang + Search Input + Direct Input Gaji Action */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    {karyawanSubView !== 'SLIP_GAJI' && (
                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setKaryawanQuickFilter('ALL')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            karyawanQuickFilter === 'ALL'
                              ? 'bg-white text-slate-900 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Semua
                        </button>
                        <button
                          type="button"
                          onClick={() => setKaryawanQuickFilter('ADA_GAJI')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            karyawanQuickFilter === 'ADA_GAJI'
                              ? 'bg-white text-emerald-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Ada Nominal Gaji ({karyawanGlobalGajiPiutangStats.adaGajiCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setKaryawanQuickFilter('ADA_PIUTANG')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            karyawanQuickFilter === 'ADA_PIUTANG'
                              ? 'bg-white text-amber-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Ada Piutang / Kasbon ({karyawanGlobalGajiPiutangStats.adaPiutangCount})
                        </button>
                      </div>
                    )}

                    <div className="relative flex-1 min-w-[220px] max-w-md">
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

                  <button
                    type="button"
                    onClick={() =>
                      setInputUpahModalConfig({
                        open: true,
                        divisi:
                          selectedDivisiKaryawan !== 'ALL'
                            ? (selectedDivisiKaryawan as NamaDivisi)
                            : 'Gudang Wijaya Agro',
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer self-start lg:self-auto whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Input Gaji Harian Karyawan</span>
                  </button>
                </div>
              </div>
            </section>

            {/* SUB-VIEW 1: REKAP BULANAN NOMINAL GAJI & PIUTANG KARYAWAN */}
            {karyawanSubView === 'BULANAN' && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      Rekapitulasi Nominal Gaji &amp; Piutang (Kasbon) Karyawan —{' '}
                      {rekapPayroll?.periodeBulan ||
                        `${BULAN_OPTIONS[selectedBulan - 1]?.label} ${selectedTahun}`}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Menampilkan langsung nominal gaji periode ini, hak gaji belum cair, dan nominal piutang kasbon setiap karyawan
                    </p>
                  </div>
                </div>

                {loadingKaryawan && !rekapPayroll ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Memuat rekapitulasi gaji &amp; piutang karyawan...
                  </div>
                ) : filteredPayrollItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tidak ada data karyawan yang sesuai untuk periode atau filter ini.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                          <th className="py-3 px-5 font-semibold">Profil Karyawan &amp; Divisi</th>
                          <th className="py-3 px-3 font-semibold text-right">Kehadiran</th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Nominal Gaji (Periode)
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Gaji Belum Cair
                          </th>
                          <th className="py-3 px-4 font-bold text-right text-amber-800 bg-amber-50/40">
                            Nominal Piutang (Kasbon)
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Selisih Bersih
                          </th>
                          <th className="py-3 px-5 font-semibold text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredPayrollItems.map((item) => {
                          const isExpanded = expandedKaryawanId === item.idKaryawan;
                          const mitraId =
                            item.idMitraTerkait || karyawanMitraMap.get(item.idKaryawan);
                          const isOpeningStmt = mitraId ? loadingStatementId === mitraId : false;
                          const divisiAktif =
                            item.divisiAktifSaatIni || item.departemen || item.divisiUtama;
                          const hasUpgradedDivisi = divisiAktif !== item.divisiUtama;
                          const riwayatDivisi = item.riwayatDivisi || [];
                          const latestUpgrade =
                            riwayatDivisi.length > 0
                              ? riwayatDivisi[riwayatDivisi.length - 1]
                              : undefined;
                          const masterRekap = rekapKaryawanByIdMap.get(item.idKaryawan);
                          const upahBelumCairTotal =
                            item.totalUpahBelumDibayarSemuaPeriode ??
                            masterRekap?.totalUpahBelumDibayar ??
                            item.totalHakUpahPending;
                          const piutangTotal =
                            item.totalSisaBonKaryawan || masterRekap?.totalBonKaryawan || 0;
                          const bonUang =
                            item.sisaKasbonUang || masterRekap?.totalKasbonUang || 0;
                          const bonBrg =
                            item.sisaKasbonBarang || masterRekap?.totalKasbonBarang || 0;
                          const selisih = upahBelumCairTotal - piutangTotal;

                          return (
                            <React.Fragment key={item.idKaryawan}>
                              <tr
                                onClick={() =>
                                  setExpandedKaryawanId(isExpanded ? null : item.idKaryawan)
                                }
                                className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                              >
                                <td className="py-3.5 px-5">
                                  <div className="flex items-center gap-3">
                                    <KaryawanAvatar
                                      nama={item.nama}
                                      fotoUrl={item.fotoUrl}
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (item.fotoUrl) {
                                          setPreviewFotoKry({
                                            nama: item.nama,
                                            jabatan: item.jabatan,
                                            divisi: divisiAktif,
                                            fotoUrl: item.fotoUrl,
                                          });
                                        } else {
                                          openProfilKaryawanModalById(item.idKaryawan);
                                        }
                                      }}
                                      title={
                                        item.fotoUrl
                                          ? `Lihat foto ${item.nama}`
                                          : `Upload foto & update profil ${item.nama}`
                                      }
                                    />
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-900">
                                          {item.nama}
                                        </span>
                                        {isExpanded ? (
                                          <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-500">
                                        {item.nik} · {item.jabatan} ·{' '}
                                        <strong className="font-semibold text-slate-700">
                                          {item.divisiUtama}
                                        </strong>
                                        {(item.saldoTitipHasilPanenMitra || 0) > 0 && (
                                          <span className="text-purple-800 font-semibold font-mono tabular-nums">
                                            {' '}
                                            · Titip Panen:{' '}
                                            {formatRupiah(item.saldoTitipHasilPanenMitra || 0)}
                                          </span>
                                        )}
                                      </div>
                                      {hasUpgradedDivisi ? (
                                        <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                          Unit aktif saat ini: <strong>{divisiAktif}</strong>
                                        </div>
                                      ) : latestUpgrade?.divisiSebelumnya &&
                                        latestUpgrade.divisiSebelumnya !==
                                          latestUpgrade.divisiBaru ? (
                                        <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                          Upgrade divisi: {latestUpgrade.divisiSebelumnya} →{' '}
                                          <strong>{latestUpgrade.divisiBaru}</strong>
                                          {latestUpgrade.periodeBulan
                                            ? ` (${latestUpgrade.periodeBulan})`
                                            : ''}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </td>

                                <td className="py-3.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                  <div className="font-semibold text-slate-800">
                                    {item.totalHariKerja} Hari
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {item.totalHariTidakMasuk ??
                                      Math.max(
                                        0,
                                        new Date(selectedTahun, selectedBulan, 0).getDate() -
                                          item.totalHariKerja
                                      )}{' '}
                                    Off
                                  </div>
                                </td>

                                {/* Nominal Gaji Periode Ini */}
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                  {item.totalGajiKotor > 0 ? (
                                    <>
                                      <div className="font-bold text-slate-900">
                                        {formatRupiah(item.totalGajiKotor)}
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        {item.totalGajiBersihDibayar > 0
                                          ? `Sudah cair ${formatRupiahSingkat(
                                              item.totalGajiBersihDibayar
                                            )}`
                                          : 'Belum dicairkan'}
                                      </div>
                                    </>
                                  ) : (masterRekap?.totalGajiSudahDibayar || 0) > 0 ? (
                                    <>
                                      <div className="font-semibold text-slate-600">Rp 0</div>
                                      <div className="text-[11px] text-slate-400">
                                        Total cair lalu{' '}
                                        {formatRupiahSingkat(
                                          masterRekap?.totalGajiSudahDibayar || 0
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-slate-400">Rp 0</span>
                                  )}
                                </td>

                                {/* Gaji Belum Cair */}
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                  {upahBelumCairTotal > 0 ? (
                                    <>
                                      <div className="font-bold text-emerald-700">
                                        {formatRupiah(upahBelumCairTotal)}
                                      </div>
                                      {item.totalHakUpahPending !== upahBelumCairTotal && (
                                        <div className="text-[11px] text-slate-500">
                                          Bulan ini: {formatRupiahSingkat(item.totalHakUpahPending)}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-slate-400">Rp 0</span>
                                  )}
                                </td>

                                {/* Nominal Piutang / Kasbon */}
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap bg-amber-50/30">
                                  {piutangTotal > 0 ? (
                                    <>
                                      <div className="font-bold text-amber-800">
                                        {formatRupiah(piutangTotal)}
                                      </div>
                                      <div className="text-[11px] text-amber-700/80">
                                        {bonUang > 0 ? `Uang ${formatRupiahSingkat(bonUang)}` : ''}
                                        {bonUang > 0 && bonBrg > 0 ? ' · ' : ''}
                                        {bonBrg > 0 ? `Brg ${formatRupiahSingkat(bonBrg)}` : ''}
                                      </div>
                                    </>
                                  ) : (
                                    <span className="text-slate-400">Rp 0</span>
                                  )}
                                </td>

                                {/* Selisih Bersih */}
                                <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                  {selisih === 0 ? (
                                    <span className="text-slate-400">Impas</span>
                                  ) : (
                                    <>
                                      <div
                                        className={`font-bold ${
                                          selisih > 0 ? 'text-emerald-700' : 'text-rose-700'
                                        }`}
                                      >
                                        {selisih > 0
                                          ? `+${formatRupiah(selisih)}`
                                          : `−${formatRupiah(Math.abs(selisih))}`}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-sans">
                                        {selisih > 0 ? 'Hak Gaji' : 'Sisa Piutang'}
                                      </div>
                                    </>
                                  )}
                                </td>

                                <td
                                  className="py-3.5 px-5 text-right whitespace-nowrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setInputUpahModalConfig({
                                          open: true,
                                          idKaryawan: item.idKaryawan,
                                          divisi: divisiAktif as NamaDivisi,
                                        })
                                      }
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-700 text-emerald-800 hover:text-white border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
                                      title="Input Gaji Harian Karyawan Ini"
                                    >
                                      + Gaji
                                    </button>
                                    {mitraId && piutangTotal > 0 && (
                                      <button
                                        type="button"
                                        disabled={isOpeningStmt}
                                        onClick={() => void handleOpenStatement(mitraId)}
                                        className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-700 text-amber-900 hover:text-white border border-amber-200 text-xs font-semibold transition-colors cursor-pointer"
                                        title="Buka Rekening Koran Piutang / Kasbon Karyawan"
                                      >
                                        {isOpeningStmt ? '...' : 'Buku Bon'}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => openProfilKaryawanModalById(item.idKaryawan)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 text-slate-800 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                                      title="Update Profil, Foto & Upgrade Unit Divisi Karyawan"
                                    >
                                      <UserCog className="w-3.5 h-3.5" />
                                      <span>Profil</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="bg-slate-50/70">
                                  <td colSpan={7} className="px-5 py-4 space-y-4">
                                    {/* Breakdown Summary Strip + Profile Card */}
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3.5 text-xs">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <KaryawanAvatar
                                          nama={item.nama}
                                          fotoUrl={item.fotoUrl}
                                          size="md"
                                          onClick={() => {
                                            if (item.fotoUrl) {
                                              setPreviewFotoKry({
                                                nama: item.nama,
                                                jabatan: item.jabatan,
                                                divisi: divisiAktif,
                                                fotoUrl: item.fotoUrl,
                                              });
                                            } else {
                                              openProfilKaryawanModalById(item.idKaryawan);
                                            }
                                          }}
                                        />
                                        <div className="min-w-0">
                                          <div className="font-bold text-slate-900 text-sm">
                                            {item.nama}
                                          </div>
                                          <div className="text-slate-600">
                                            {item.nik} · {item.jabatan} · Unit Aktif:{' '}
                                            <strong className="text-emerald-800">
                                              {divisiAktif}
                                            </strong>
                                          </div>
                                        </div>
                                      </div>

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
                                          <span className="text-slate-500">
                                            Piutang Uang / Barang
                                          </span>
                                          <div className="font-mono font-bold text-amber-700 tabular-nums mt-0.5">
                                            {formatRupiah(bonUang)} / {formatRupiah(bonBrg)}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="text-slate-500">
                                            Selisih Bersih (Gaji − Piutang)
                                          </span>
                                          <div
                                            className={`font-mono font-bold tabular-nums mt-0.5 ${
                                              selisih >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                            }`}
                                          >
                                            {formatRupiah(selisih)}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openProfilKaryawanModalById(item.idKaryawan);
                                          }}
                                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                                        >
                                          <UserCog className="w-3.5 h-3.5" />
                                          <span>Update Profil &amp; Divisi</span>
                                        </button>

                                        {mitraId && (
                                          <button
                                            type="button"
                                            disabled={isOpeningStmt}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              void handleOpenStatement(mitraId);
                                            }}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                                          >
                                            <span>
                                              {isOpeningStmt
                                                ? 'Memuat...'
                                                : 'Rekening Koran Piutang & PDF'}
                                            </span>
                                            <ArrowUpRight className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Riwayat Upgrade / Mutasi Divisi Karyawan */}
                                    {riwayatDivisi.length > 0 && (
                                      <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                                        <div className="font-bold text-slate-800">
                                          Riwayat Penempatan &amp; Upgrade Divisi Lintas Bulan
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                          {[...riwayatDivisi].reverse().map((rw) => (
                                            <div
                                              key={rw.id}
                                              className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                                            >
                                              <div className="flex flex-wrap items-center gap-1.5 text-slate-800 font-medium">
                                                {rw.divisiSebelumnya &&
                                                rw.divisiSebelumnya !== rw.divisiBaru ? (
                                                  <>
                                                    <span className="text-slate-500">
                                                      {rw.divisiSebelumnya}
                                                    </span>
                                                    <ArrowRight className="w-3 h-3 text-emerald-600" />
                                                    <span className="font-bold text-emerald-800">
                                                      {rw.divisiBaru}
                                                    </span>
                                                  </>
                                                ) : (
                                                  <span className="font-semibold text-slate-900">
                                                    {rw.divisiBaru}
                                                  </span>
                                                )}
                                                {rw.jabatanBaru && (
                                                  <span className="text-slate-500">
                                                    · {rw.jabatanBaru}
                                                  </span>
                                                )}
                                                {rw.catatan && (
                                                  <span className="text-slate-500">
                                                    ({rw.catatan})
                                                  </span>
                                                )}
                                              </div>
                                              <div className="font-mono text-[11px] text-slate-500">
                                                {rw.periodeBulan ? `${rw.periodeBulan} · ` : ''}
                                                {rw.tanggal}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Rincian Hari Kerja & Tugas Harian */}
                                    <div className="space-y-1.5">
                                      <div className="text-xs font-bold text-slate-800">
                                        Catatan Kerja &amp; Upah Harian ({item.rincianHarian.length}{' '}
                                        Catatan)
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
                                                <th className="py-2 px-3 font-semibold">
                                                  Item / Tugas Pekerjaan
                                                </th>
                                                <th className="py-2 px-3 font-semibold text-right">
                                                  Upah Pokok
                                                </th>
                                                <th className="py-2 px-3 font-semibold text-right">
                                                  Lembur/Makan
                                                </th>
                                                <th className="py-2 px-3 font-semibold text-right">
                                                  Total Gaji
                                                </th>
                                                <th className="py-2 px-3 font-semibold text-right">
                                                  Status
                                                </th>
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
                                                    {rh.status === 'SUDAH_DIBAYAR'
                                                      ? 'Sudah Cair'
                                                      : 'Belum Cair'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>

                                    {/* Rincian Piutang / Kasbon Aktif (Jika Ada) */}
                                    {((item.rincianBonUang && item.rincianBonUang.length > 0) ||
                                      (item.rincianBonBarang &&
                                        item.rincianBonBarang.length > 0)) && (
                                      <div className="space-y-1.5">
                                        <div className="text-xs font-bold text-slate-800">
                                          Rincian Piutang / Kasbon Aktif Karyawan
                                        </div>
                                        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                                          <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                              <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500">
                                                <th className="py-2 px-3 font-semibold">Tanggal</th>
                                                <th className="py-2 px-3 font-semibold">
                                                  Jenis Piutang / Bon
                                                </th>
                                                <th className="py-2 px-3 font-semibold">
                                                  Keterangan
                                                </th>
                                                <th className="py-2 px-3 font-semibold text-right">
                                                  Sisa Piutang
                                                </th>
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
                                                      ?.map(
                                                        (it) =>
                                                          `${it.namaProduk} (${it.qty} ${it.satuan})`
                                                      )
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

            {/* SUB-VIEW 2: SALDO KUMULATIF GAJI & PIUTANG SELURUH KARYAWAN (LINTAS BULAN) */}
            {karyawanSubView === 'SALDO_TOTAL' && (
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Posisi Kumulatif Nominal Gaji &amp; Piutang Seluruh Karyawan (Lintas Periode)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menampilkan akumulasi gaji yang sudah dibayar, gaji belum cair, dan total piutang kasbon aktif setiap karyawan
                  </p>
                </div>

                {loadingKaryawan && !rekapKaryawan ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Memuat saldo kumulatif gaji &amp; piutang karyawan...
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
                          <th className="py-3 px-5 font-semibold">Profil Karyawan</th>
                          <th className="py-3 px-3 font-semibold text-right">Total Kerja</th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Total Gaji (Akumulasi)
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">
                            Gaji Belum Cair
                          </th>
                          <th className="py-3 px-4 font-bold text-right text-amber-800 bg-amber-50/40">
                            Nominal Piutang (Kasbon)
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">Posisi Bersih</th>
                          <th className="py-3 px-5 font-semibold text-right">
                            Profil &amp; Buku Piutang
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSaldoKaryawanItems.map((k) => {
                          const isLoadingStmt = loadingStatementId === k.idMitraTerkait;
                          const rw = k.riwayatDivisi || [];
                          const latestRw = rw.length > 0 ? rw[rw.length - 1] : undefined;
                          const gajiCair = k.totalGajiSudahDibayar || k.totalUpahSudahDibayar || 0;
                          const totalGajiKumulatif =
                            k.totalHakUpahHarian > 0
                              ? k.totalHakUpahHarian
                              : gajiCair + (k.totalUpahBelumDibayar || 0);

                          return (
                            <tr key={k.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3">
                                  <KaryawanAvatar
                                    nama={k.nama}
                                    fotoUrl={k.fotoUrl}
                                    size="sm"
                                    onClick={() => {
                                      if (k.fotoUrl) {
                                        setPreviewFotoKry({
                                          nama: k.nama,
                                          jabatan: k.jabatan,
                                          divisi: k.divisi || k.divisiTerakhir,
                                          fotoUrl: k.fotoUrl,
                                        });
                                      } else {
                                        openProfilKaryawanModalById(k.id);
                                      }
                                    }}
                                  />
                                  <div>
                                    <div className="font-semibold text-slate-900">{k.nama}</div>
                                    <div className="text-xs text-slate-500">
                                      {k.nik} · {k.jabatan} ·{' '}
                                      <strong className="font-semibold text-slate-700">
                                        {k.divisi || k.divisiTerakhir}
                                      </strong>
                                    </div>
                                    {latestRw?.divisiSebelumnya &&
                                      latestRw.divisiSebelumnya !== latestRw.divisiBaru && (
                                        <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
                                          Upgrade divisi: {latestRw.divisiSebelumnya} →{' '}
                                          <strong>{latestRw.divisiBaru}</strong>
                                        </div>
                                      )}
                                    {(k.totalTitipHasilPanen || 0) > 0 && (
                                      <div className="text-[11px] text-purple-800 font-mono tabular-nums mt-0.5">
                                        Titip Panen Mitra: {formatRupiah(k.totalTitipHasilPanen || 0)}
                                      </div>
                                    )}
                                    {k.tanggalKerjaTerakhir && (
                                      <div className="text-[11px] text-slate-400 mt-0.5">
                                        Terakhir kerja: {k.tanggalKerjaTerakhir}
                                        {k.pekerjaanHarianTerakhir
                                          ? ` — ${k.pekerjaanHarianTerakhir}`
                                          : ''}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                                {k.totalHariKerja} Hari
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                                {totalGajiKumulatif > 0 ? (
                                  <>
                                    <div className="font-bold text-slate-900">
                                      {formatRupiah(totalGajiKumulatif)}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      Sudah cair: {formatRupiahSingkat(gajiCair)}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-400">Rp 0</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                {k.totalUpahBelumDibayar > 0
                                  ? formatRupiah(k.totalUpahBelumDibayar)
                                  : 'Rp 0'}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap bg-amber-50/30">
                                {k.totalBonKaryawan > 0 ? (
                                  <>
                                    <div className="font-bold text-amber-800">
                                      {formatRupiah(k.totalBonKaryawan)}
                                    </div>
                                    <div className="text-[11px] text-amber-700/80">
                                      {k.totalKasbonUang > 0
                                        ? `Uang ${formatRupiahSingkat(k.totalKasbonUang)}`
                                        : ''}
                                      {k.totalKasbonUang > 0 && k.totalKasbonBarang > 0
                                        ? ' · '
                                        : ''}
                                      {k.totalKasbonBarang > 0
                                        ? `Brg ${formatRupiahSingkat(k.totalKasbonBarang)}`
                                        : ''}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-slate-400">Rp 0</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div
                                  className={`font-mono font-bold tabular-nums ${
                                    k.saldoBersih > 0
                                      ? 'text-emerald-700'
                                      : k.saldoBersih < 0
                                      ? 'text-amber-700'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {k.saldoBersih === 0
                                    ? 'Impas'
                                    : formatRupiah(Math.abs(k.saldoBersih))}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {k.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                                    ? 'Hak Gaji Karyawan'
                                    : k.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                                    ? 'Piutang ke PT'
                                    : 'Lunas'}
                                </div>
                              </td>
                              <td className="py-3.5 px-5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openProfilKaryawanModalById(k.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                                  >
                                    <UserCog className="w-3.5 h-3.5" />
                                    <span>Profil</span>
                                  </button>
                                  {k.idMitraTerkait ? (
                                    <button
                                      type="button"
                                      disabled={isLoadingStmt}
                                      onClick={() => void handleOpenStatement(k.idMitraTerkait)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-700 hover:text-white text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                                    >
                                      <span>{isLoadingStmt ? 'Memuat...' : 'Buku Piutang'}</span>
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                  ) : null}
                                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-5 border-b border-slate-100">
                <div>
                  <div className="text-xs text-slate-500">1. Piutang (Mitra Berhutang)</div>
                  <div className="font-mono text-xl font-bold text-amber-700 tabular-nums mt-0.5">
                    {formatRupiah(
                      rekapMitra?.totalPiutangAktifGlobal ??
                        rekapMitra?.totalPiutangAktifMitra ??
                        Math.max(
                          0,
                          (rekapMitra?.totalBonMitra || totalPiutangBon) -
                            (rekapMitra?.totalNominalNotaNgunci || 0)
                        )
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    1. Piutang aktif berjalan ({rekapMitra?.mitraPiutangAktifCount ?? rekapMitra?.mitraDenganBonCount ?? 0} mitra)
                  </div>
                </div>
                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-slate-500">2. Hutang (PT Berhutang)</div>
                  <div className="font-mono text-xl font-bold text-purple-800 tabular-nums mt-0.5">
                    {formatRupiah(
                      rekapMitra?.totalNotaSupplierRekeningMitra ??
                        rekapMitra?.totalHutangPerusahaanKeMitra ??
                        totalTitipanMitra
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Termasuk Uang Titip &amp; HB Titip ({rekapMitra?.mitraDenganHutangTitipCount || 0} mitra)
                  </div>
                </div>
                <div className="lg:border-l lg:border-slate-100 lg:pl-4">
                  <div className="text-xs text-slate-500">Total Rekening Mitra / Nota Supplier</div>
                  {(() => {
                    const totalPiutangAktif =
                      rekapMitra?.totalPiutangAktifGlobal ??
                      rekapMitra?.totalPiutangAktifMitra ??
                      Math.max(
                        0,
                        (rekapMitra?.totalBonMitra || totalPiutangBon) -
                          (rekapMitra?.totalNominalNotaNgunci || 0)
                      );
                    const totalHutangKita =
                      rekapMitra?.totalNotaSupplierRekeningMitra ??
                      rekapMitra?.totalHutangPerusahaanKeMitra ??
                      totalTitipanMitra;
                    const totalRekeningMitra =
                      rekapMitra?.totalRekeningMitraNotaSupplier ??
                      (totalPiutangAktif - totalHutangKita);
                    return (
                      <>
                        <div
                          className={`font-mono text-xl font-bold tabular-nums mt-0.5 ${
                            totalRekeningMitra >= 0 ? 'text-emerald-700' : 'text-purple-800'
                          }`}
                        >
                          {totalRekeningMitra < 0
                            ? `-${formatRupiah(Math.abs(totalRekeningMitra))}`
                            : formatRupiah(totalRekeningMitra)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Rumus: Piutang − Hutang (Tanpa Ngunci)
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                  <div className="text-xs text-rose-700 font-semibold">
                    3. Ngunci (Uang Tak Kembali)
                  </div>
                  <div className="font-mono text-xl font-bold text-rose-700 tabular-nums mt-0.5">
                    {formatRupiah(rekapMitra?.totalNominalNotaNgunci || 0)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {rekapMitra?.mitraNotaNgunciCount || 0} mitra ·{' '}
                    {rekapMitra?.totalLembarNotaNgunci || 0} nota (berkurang jika dibayar)
                  </div>
                </div>
              </div>

              {/* Search, 5 Role Mitra Filter & Balance Filter */}
              <div className="pt-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={mitraSearch}
                      onChange={(e) => setMitraSearch(e.target.value)}
                      placeholder="Cari nama mitra, role, nomor HP, kode, atau alamat..."
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
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
                      1. Piutang ({rekapMitra?.mitraPiutangAktifCount ?? rekapMitra?.mitraDenganBonCount ?? 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMitraFilter('TITIP')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        mitraFilter === 'TITIP'
                          ? 'bg-white text-purple-800 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      2. Hutang / Titip ({rekapMitra?.mitraDenganHutangTitipCount || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMitraFilter('NGUNCI')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        mitraFilter === 'NGUNCI'
                          ? 'bg-rose-700 text-white shadow-2xs'
                          : 'text-rose-700 hover:text-rose-900'
                      }`}
                    >
                      3. Ngunci ({rekapMitra?.mitraNotaNgunciCount || 0})
                    </button>
                  </div>
                </div>

                {/* Ringkasan Cepat Piutang Aktif vs Nominal Nota Ngunci vs Saldo Titip */}
                {rekapMitra && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold text-amber-800">
                          Sisa Bon Aktif ke PT
                        </div>
                        <div className="text-[10px] text-amber-700/80">
                          {rekapMitra.mitraPiutangAktifCount ?? rekapMitra.mitraDenganBonCount ?? 0} mitra piutang aktif
                        </div>
                      </div>
                      <div className="font-mono font-bold text-sm text-amber-900 tabular-nums">
                        {formatRupiah(rekapMitra.totalPiutangAktifMitra ?? rekapMitra.totalBonMitra ?? 0)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-rose-800">
                          Total Nominal Nota Ngunci
                        </div>
                        <div className="text-[10px] text-rose-700/80">
                          {rekapMitra.mitraNotaNgunciCount || 0} mitra dengan nota ngunci
                        </div>
                      </div>
                      <div className="font-mono font-bold text-sm text-rose-800 tabular-nums">
                        {formatRupiah(rekapMitra.totalNominalNotaNgunci || 0)}
                      </div>
                    </div>

                    <div className="rounded-xl border border-purple-200 bg-purple-50/70 px-3.5 py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-semibold text-purple-800">
                          Total Saldo Titip di PT
                        </div>
                        <div className="text-[10px] text-purple-700/80">
                          {rekapMitra.mitraDenganHutangTitipCount || 0} mitra titip/hutang PT
                        </div>
                      </div>
                      <div className="font-mono font-bold text-sm text-purple-900 tabular-nums">
                        {formatRupiah(rekapMitra.totalHutangPerusahaanKeMitra || 0)}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5 Canonical Mitra Role Filters */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setMitraRoleFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      mitraRoleFilter === 'ALL'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Semua Role ({rekapMitra?.items.length || 0})
                  </button>
                  {DAFTAR_ROLE_MITRA.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setMitraRoleFilter(r.value)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                        mitraRoleFilter === r.value
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {r.label} ({mitraRoleCounts[r.value] || 0})
                    </button>
                  ))}
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
                  Tidak ada mitra yang sesuai dengan pencarian atau filter role.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                          <th className="py-3 px-5 font-semibold">Nama &amp; Role Mitra</th>
                          <th className="py-3 px-4 font-semibold text-right">Sisa Bon ke PT</th>
                          <th className="py-3 px-4 font-bold text-right text-rose-700 bg-rose-50/50">
                            Nominal Nota Ngunci
                          </th>
                          <th className="py-3 px-4 font-semibold text-right">Saldo Titip di PT</th>
                          <th className="py-3 px-5 font-semibold text-right">Rekening Koran</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedMitraItems.map((m) => {
                          const bonBersih = m.sisaBonBersih ?? m.totalBonMitra;
                          const titipBersih = m.sisaTitipanBersih ?? m.totalHutangTitipPanen;
                          const isLoadingThis = loadingStatementId === m.id;
                          const roleLabel = getRoleMitraLabel(m.role, {
                            isAnakPerusahaan: m.isAnakPerusahaan,
                            isKaryawan: m.isKaryawan,
                          });
                          return (
                            <tr key={m.id} className="hover:bg-slate-50/70">
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3">
                                  <KaryawanAvatar
                                    nama={m.nama}
                                    fotoUrl={m.fotoUrl}
                                    size="sm"
                                    onClick={
                                      m.fotoUrl
                                        ? () =>
                                            setPreviewFotoKry({
                                              nama: m.nama,
                                              jabatan: roleLabel,
                                              divisi: m.divisiKaryawan,
                                              fotoUrl: m.fotoUrl!,
                                            })
                                        : undefined
                                    }
                                  />
                                  <div>
                                    <div className="flex items-center flex-wrap gap-1.5">
                                      <span className="font-semibold text-slate-900">{m.nama}</span>
                                      {(m.isNotaNgunci || (m.nominalNotaNgunci || 0) > 0) && (
                                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                                          NOTA NGUNCI
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {m.kode} ·{' '}
                                      <strong className="font-semibold text-slate-700">{roleLabel}</strong>
                                      {m.divisiKaryawan ? ` · ${m.divisiKaryawan}` : ''}
                                      {m.telepon && m.telepon !== '-' ? ` · HP: ${m.telepon}` : ''}
                                      {m.alamat && m.alamat !== '-' ? ` · ${m.alamat}` : ''}
                                    </div>
                                    {m.catatanNgunci && (m.isNotaNgunci || (m.nominalNotaNgunci || 0) > 0) && (
                                      <div className="text-[11px] text-rose-700 mt-0.5">
                                        Kronologi Ngunci: {m.catatanNgunci}
                                      </div>
                                    )}
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
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-amber-700 whitespace-nowrap">
                                {bonBersih > 0 ? (
                                  <div className="text-amber-700">{formatRupiah(bonBersih)}</div>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap bg-rose-50/30">
                                {(m.nominalNotaNgunci || 0) > 0 ? (
                                  <div>
                                    <div className="text-rose-700">
                                      {formatRupiah(m.nominalNotaNgunci || 0)}
                                    </div>
                                    <div className="text-[10px] font-semibold text-rose-600">
                                      {m.jumlahNotaNgunci || 1} nota ngunci
                                    </div>
                                  </div>
                                ) : m.isNotaNgunci ? (
                                  <span className="text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                                    Status Ngunci
                                  </span>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-purple-800 whitespace-nowrap">
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

        {/* TAB: PENGELUARAN (MENGGANTIKAN JURNAL & BUKTI NOTA) */}
        {activeTab === 'pengeluaran' && (
          <PengeluaranBosView
            divisiMasterList={divisiMasterList}
            inventarisList={inventarisList}
          />
        )}

        {/* TAB: STOK BARANG & PEMBELIAN HASIL BUMI */}
        {activeTab === 'stok' && (
          <StokDanPembelianHbBosView
            stokHasilBumiList={stokHasilBumiList}
            stokBarangList={stokBarangList}
          />
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

      {/* Modal Update Profil, Foto & Upgrade Divisi Karyawan */}
      {editingProfilKaryawan && (
        <ModalProfilKaryawan
          karyawan={editingProfilKaryawan}
          availableDivisiList={(divisiMasterList.length > 0 ? divisiMasterList : DAFTAR_DIVISI).map(
            (d) => d.nama
          )}
          defaultPeriodeBulan={`${BULAN_OPTIONS[selectedBulan - 1]?.label || ''} ${selectedTahun}`}
          onClose={() => setEditingProfilKaryawan(null)}
          onSaved={() => {
            setEditingProfilKaryawan(null);
            void loadKaryawanTab(true);
            void loadMitraTab(true);
            onRefreshAll();
          }}
        />
      )}

      {/* Modal Input Gaji Harian Karyawan langsung dari Tampilan Bos */}
      {inputUpahModalConfig.open && karyawanMasterList.length > 0 && (
        <InputPayrollHarianDivisiModal
          karyawanList={karyawanMasterList}
          initialKaryawanId={inputUpahModalConfig.idKaryawan}
          initialDivisi={inputUpahModalConfig.divisi || 'Gudang Wijaya Agro'}
          rekeningList={safeRekening}
          onClose={() => setInputUpahModalConfig({ open: false })}
          onSuccess={(slip) => {
            setInputUpahModalConfig({ open: false });
            void loadKaryawanTab(true);
            void loadMitraTab(true);
            onRefreshAll();
            if (slip) setActiveSlip(slip);
          }}
        />
      )}

      {/* Preview Foto Karyawan / Mitra */}
      {previewFotoKry && (
        <ModalPreviewFotoKaryawan
          nama={previewFotoKry.nama}
          jabatan={previewFotoKry.jabatan}
          divisi={previewFotoKry.divisi}
          fotoUrl={previewFotoKry.fotoUrl}
          onClose={() => setPreviewFotoKry(null)}
        />
      )}

      {/* Pusat Backup Full & Larikan ke Google Spreadsheet */}
      <ModalBackupFullSpreadsheet
        isOpen={showBackupModal}
        onClose={() => setShowBackupModal(false)}
        companyName={profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
        allowRestore={false}
      />
    </div>
  );
};

export const PortalEksekutifBosView = React.memo(PortalEksekutifBosViewInner);
