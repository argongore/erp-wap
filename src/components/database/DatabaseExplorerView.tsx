import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Database,
  Layers,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  Copy,
  Check,
  Wheat,
  Package,
  Users,
  Briefcase,
  Building2,
  ShoppingCart,
  HandCoins,
  Receipt,
  History,
  Coffee,
  ExternalLink,
  Eye,
  X,
  Boxes,
  ShieldCheck,
  Trash2,
  Upload,
  Zap,
  ArrowDownToLine,
  Tags,
  Truck,
  Wallet,
  ArrowLeftRight,
  CalendarClock,
  FileSpreadsheet,
} from 'lucide-react';
import { DatabaseIntegrityStatus, FullErpModularDataset } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, formatTanggalIndo } from '../../utils/format.ts';
import { SupabaseSyncModal } from './SupabaseSyncModal.tsx';
import { api, requestJson } from '../../api/client.ts';

interface DatabaseExplorerViewProps {
  erpData: FullErpModularDataset;
  onRefreshAll: () => void;
  onNavigateToTab?: (tab: string) => void;
}

type CollectionKey =
  | 'hasilBumi'
  | 'produkDagang'
  | 'kategoriProduk'
  | 'stokBarang'
  | 'mitra'
  | 'karyawan'
  | 'rekening'
  | 'penjualan'
  | 'pembelianBarang'
  | 'pembelianHasilBumi'
  | 'pencairanTitipan'
  | 'kasbonUang'
  | 'bayarBon'
  | 'pengeluaran'
  | 'transferRekening'
  | 'upahHarian'
  | 'penggajian'
  | 'auditLogs';

export const DatabaseExplorerView: React.FC<DatabaseExplorerViewProps> = ({
  erpData,
  onRefreshAll,
  onNavigateToTab,
}) => {
  const [activeCollection, setActiveCollection] = useState<CollectionKey>('produkDagang');

  // Supabase Quick Sync & Integrity States
  const [isPushingSupabase, setIsPushingSupabase] = useState(false);
  const [isPullingSupabase, setIsPullingSupabase] = useState(false);
  const [confirmPull, setConfirmPull] = useState(false);
  const [supabaseFeedback, setSupabaseFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [integrity, setIntegrity] = useState<DatabaseIntegrityStatus | null>(null);

  // Search & Table density
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'relaxed'>('normal');

  // Raw JSON Inspector Modal
  const [jsonInspectModal, setJsonInspectModal] = useState<{
    open: boolean;
    title: string;
    data: any;
  }>({ open: false, title: '', data: null });
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  // Sorting
  const [sortField, setSortField] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Modals
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string>('');
  const [resetErrorMsg, setResetErrorMsg] = useState<string>('');

  const loadIntegrity = useCallback(async () => {
    try {
      const res = await api.getDatabaseIntegrityStatus();
      setIntegrity(res);
    } catch (err) {
      console.warn('Gagal memuat status integritas database:', err);
    }
  }, []);

  useEffect(() => {
    loadIntegrity();
  }, [loadIntegrity, erpData]);

  const handlePushToSupabase = async () => {
    setIsPushingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await api.pushToSupabase();
      setSupabaseFeedback({
        type: 'success',
        message: res.message || 'Seluruh data ERP berhasil disinkronkan & disimpan permanen di Cloud Supabase.',
      });
      onRefreshAll();
      loadIntegrity();
    } catch (err: any) {
      setSupabaseFeedback({
        type: 'error',
        message: err.message || 'Gagal menyinkronkan data ke Supabase',
      });
    } finally {
      setIsPushingSupabase(false);
    }
  };

  const handlePullFromSupabase = async () => {
    setConfirmPull(false);
    setIsPullingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await api.pullFromSupabase();
      setSupabaseFeedback({
        type: 'success',
        message: res.message || 'Berhasil menarik & menyinkronkan data terbaru dari Cloud Supabase.',
      });
      onRefreshAll();
      loadIntegrity();
    } catch (err: any) {
      setSupabaseFeedback({
        type: 'error',
        message: err.message || 'Gagal menarik data dari Supabase',
      });
    } finally {
      setIsPullingSupabase(false);
    }
  };

  const kategoriList = erpData.kategoriProdukList || [];
  const pencairanTitipanList = erpData.pencairanTitipanList || [];
  const pengeluaranList = erpData.pengeluaranList || [];

  const totalRecords =
    erpData.stokHasilBumiList.length +
    erpData.produkList.length +
    kategoriList.length +
    erpData.stokList.length +
    erpData.mitraList.length +
    erpData.karyawanList.length +
    erpData.rekeningList.length +
    erpData.penjualanList.length +
    erpData.pembelianBarangList.length +
    erpData.pembelianList.length +
    pencairanTitipanList.length +
    erpData.kasbonUangList.length +
    erpData.bayarBonList.length +
    pengeluaranList.length +
    erpData.transferList.length +
    erpData.upahHarianList.length +
    erpData.penggajianList.length +
    erpData.auditLogs.length;

  function ScaleIcon(props: any) {
    return <Coffee {...props} />;
  }

  const collectionsMeta: Record<
    CollectionKey,
    {
      id: CollectionKey;
      name: string;
      icon: any;
      count: number;
      description: string;
      navTab?: string;
    }
  > = {
    produkDagang: {
      id: 'produkDagang',
      name: '1. Master Produk Dagang',
      icon: Package,
      count: erpData.produkList.length,
      description: 'Master barang toko, HPP kulakan, harga eceran, dan harga khusus rekanan',
      navTab: 'master-produk',
    },
    kategoriProduk: {
      id: 'kategoriProduk',
      name: '2. Kategori Produk Kustom',
      icon: Tags,
      count: kategoriList.length,
      description: 'Kategori produk riil yang terhubung langsung ke Master Produk & Laba Rugi',
      navTab: 'master-produk',
    },
    stokBarang: {
      id: 'stokBarang',
      name: '3. Stok Gudang Barang',
      icon: Boxes,
      count: erpData.stokList.length,
      description: 'Saldo stok fisik otomatis bertambah saat Kulakan & berkurang saat Penjualan',
      navTab: 'stok-barang',
    },
    hasilBumi: {
      id: 'hasilBumi',
      name: '4. Komoditas Hasil Bumi',
      icon: Wheat,
      count: erpData.stokHasilBumiList.length,
      description: 'Komoditas panen petani (termasuk Kopi Titip Belum Putus Harga)',
      navTab: 'stok-hasil-bumi',
    },
    mitra: {
      id: 'mitra',
      name: '5. Master Mitra & Supplier',
      icon: Users,
      count: erpData.mitraList.length,
      description: 'Petani, pembeli toko, pemasok kulakan, dan akun mitra karyawan terpadu',
      navTab: 'master-mitra',
    },
    karyawan: {
      id: 'karyawan',
      name: '6. Master Karyawan SDM',
      icon: Briefcase,
      count: erpData.karyawanList.length,
      description: 'Data pekerja aktif yang otomatis terhubung ke Akun Mitra & Penggajian',
      navTab: 'master-karyawan',
    },
    rekening: {
      id: 'rekening',
      name: '7. Rekening Kas, Bank & Virtual',
      icon: Building2,
      count: erpData.rekeningList.length,
      description: 'KAS01, Bank Perusahaan, Buku Divisi, serta Akun Virtual BON01 & TIT01',
      navTab: 'master-rekening',
    },
    penjualan: {
      id: 'penjualan',
      name: '8. Penjualan Toko',
      icon: ShoppingCart,
      count: erpData.penjualanList.length,
      description: 'Transaksi penjualan tunai, transfer, maupun kasbon barang (terkait Produk & Mitra)',
      navTab: 'kasir-penjualan',
    },
    pembelianBarang: {
      id: 'pembelianBarang',
      name: '9. Kulakan Barang Supplier',
      icon: Truck,
      count: erpData.pembelianBarangList.length,
      description: 'Pembelian stok dari distributor (Tunai, Transfer, atau Hutang Tempo Supplier)',
      navTab: 'kasir-pembelian-barang',
    },
    pembelianHasilBumi: {
      id: 'pembelianHasilBumi',
      name: '10. Pembelian Hasil Bumi',
      icon: ScaleIcon,
      count: erpData.pembelianList.length,
      description: 'Timbangan hasil panen petani, titip timbang, dan pinjaman dana mitra',
      navTab: 'kasir-pembelian',
    },
    pencairanTitipan: {
      id: 'pencairanTitipan',
      name: '11. Pencairan Titipan & Hutang',
      icon: Wallet,
      count: pencairanTitipanList.length,
      description: 'Pembayaran saldo titipan hasil bumi / pelunasan hutang supplier & kliring silang',
      navTab: 'kasir-cairkan-titipan',
    },
    kasbonUang: {
      id: 'kasbonUang',
      name: '12. Kasbon Uang & Nota Lalu',
      icon: HandCoins,
      count: erpData.kasbonUangList.length,
      description: 'Pinjaman uang tunai mitra/karyawan serta pencatatan piutang nota masa lalu',
      navTab: 'kasir-kasbon-uang',
    },
    bayarBon: {
      id: 'bayarBon',
      name: '13. Pelunasan & Bayar Bon',
      icon: Receipt,
      count: erpData.bayarBonList.length,
      description: 'Setoran pelunasan bon tunai/transfer, kliring titipan, maupun potong gaji',
      navTab: 'kasir-bayar-bon',
    },
    pengeluaran: {
      id: 'pengeluaran',
      name: '14. Beban Operasional Divisi',
      icon: FileSpreadsheet,
      count: pengeluaranList.length,
      description: 'Biaya operasional harian per divisi kerja yang memotong saldo kas/bank riil',
      navTab: 'kasir-pengeluaran',
    },
    transferRekening: {
      id: 'transferRekening',
      name: '15. Mutasi Antar Rekening',
      icon: ArrowLeftRight,
      count: erpData.transferList.length,
      description: 'Dropping kas dan pemindahan saldo internal antar rekening bank & kasir',
      navTab: 'kasir-transfer',
    },
    upahHarian: {
      id: 'upahHarian',
      name: '16. Buku Kerja & Upah Harian',
      icon: CalendarClock,
      count: erpData.upahHarianList.length,
      description: 'Catatan absensi pekerjaan harian karyawan sebelum/sesudah pencairan slip gaji',
      navTab: 'master-karyawan',
    },
    penggajian: {
      id: 'penggajian',
      name: '17. Slip Penggajian & Upah Cair',
      icon: Briefcase,
      count: erpData.penggajianList.length,
      description: 'Realisasi pencairan gaji karyawan lengkap dengan pemotongan kasbon otomatis',
      navTab: 'master-karyawan',
    },
    auditLogs: {
      id: 'auditLogs',
      name: '18. Audit Log Sistem',
      icon: History,
      count: erpData.auditLogs.length,
      description: 'Jejak rekam kronologis seluruh aktivitas transaksi dan perubahan saldo',
      navTab: 'audit-log',
    },
  };

  const rawActiveData = useMemo(() => {
    switch (activeCollection) {
      case 'hasilBumi':
        return erpData.stokHasilBumiList;
      case 'produkDagang':
        return erpData.produkList;
      case 'kategoriProduk':
        return kategoriList;
      case 'stokBarang':
        return erpData.stokList;
      case 'mitra':
        return erpData.mitraList;
      case 'karyawan':
        return erpData.karyawanList;
      case 'rekening':
        return erpData.rekeningList;
      case 'penjualan':
        return erpData.penjualanList;
      case 'pembelianBarang':
        return erpData.pembelianBarangList;
      case 'pembelianHasilBumi':
        return erpData.pembelianList;
      case 'pencairanTitipan':
        return pencairanTitipanList;
      case 'kasbonUang':
        return erpData.kasbonUangList;
      case 'bayarBon':
        return erpData.bayarBonList;
      case 'pengeluaran':
        return pengeluaranList;
      case 'transferRekening':
        return erpData.transferList;
      case 'upahHarian':
        return erpData.upahHarianList;
      case 'penggajian':
        return erpData.penggajianList;
      case 'auditLogs':
        return erpData.auditLogs;
      default:
        return [];
    }
  }, [activeCollection, erpData, kategoriList, pencairanTitipanList, pengeluaranList]);

  const filteredData = useMemo(() => {
    let list = [...rawActiveData];
    const q = (tableSearch || globalSearch).trim().toLowerCase();
    if (q) {
      list = list.filter((item: any) =>
        Object.values(item).some((val) =>
          val !== null &&
          val !== undefined &&
          (typeof val === 'object' ? JSON.stringify(val) : String(val)).toLowerCase().includes(q)
        )
      );
    }
    if (sortField) {
      list.sort((a: any, b: any) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        const strA = String(valA || '').toLowerCase();
        const strB = String(valB || '').toLowerCase();
        return sortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }
    return list;
  }, [rawActiveData, tableSearch, globalSearch, sortField, sortAsc]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Download full JSON database directly from backend single source of truth
  const handleDownloadDatabaseJson = async () => {
    try {
      const res = await fetch('/api/database/backup-json');
      if (!res.ok) throw new Error('Gagal mengunduh cadangan database');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DATABASE_SUPABASE_WIJAYA_AGRO_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setSupabaseFeedback({
        type: 'error',
        message: e.message || 'Gagal mengunduh cadangan JSON',
      });
    }
  };

  const handleRestoreDatabaseJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('File cadangan JSON tidak valid');
      }
      const result = await requestJson('/api/database/restore-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsed }),
      });
      if (!result.success) throw new Error(result.message);
      setResetSuccessMsg('Database berhasil dipulihkan dan disinkronkan ke Cloud Supabase.');
      setTimeout(() => setResetSuccessMsg(''), 6000);
      onRefreshAll();
      loadIntegrity();
    } catch (err: any) {
      setResetErrorMsg('Gagal memulihkan database: ' + (err.message || 'File tidak valid'));
    } finally {
      e.target.value = '';
    }
  };

  const handleExecuteResetClean = async () => {
    setIsResetting(true);
    setResetErrorMsg('');
    try {
      await api.resetCleanDatabase();
      setShowResetModal(false);
      setResetSuccessMsg('Data mitra & karyawan berhasil dibersihkan dan disinkronkan ke Cloud Supabase.');
      setTimeout(() => setResetSuccessMsg(''), 6000);
      onRefreshAll();
      loadIntegrity();
    } catch (err: any) {
      setResetErrorMsg(err.message || 'Gagal mereset database');
    } finally {
      setIsResetting(false);
    }
  };

  const handleCopyJson = () => {
    if (!jsonInspectModal.data) return;
    navigator.clipboard.writeText(JSON.stringify(jsonInspectModal.data, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HERO BANNER: SINGLE SOURCE OF TRUTH SUPABASE */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 mb-2">
              <span className="text-emerald-400 font-semibold">
                {integrity?.supabaseConfigured ? 'Sumber Tunggal: Cloud Supabase PostgreSQL' : 'Menunggu Koneksi Supabase'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-zinc-300">wijaya_agro_erp_state</span>
              <span aria-hidden="true">·</span>
              <span>18 Koleksi Terintegrasi</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-emerald-300">
                {totalRecords.toLocaleString('id-ID')} Total Record
              </span>
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2.5">
              <Database className="w-6 h-6 text-emerald-400 shrink-0" />
              <span>Studio Database Terpadu (Single Source Supabase)</span>
            </h1>
            <p className="text-xs text-zinc-300 mt-1.5 max-w-3xl leading-relaxed">
              Seluruh transaksi antara Produk, Stok Gudang, Penjualan, Pembelian Kulakan, Pembelian Hasil Bumi, Rekap Mitra, hingga Penggajian Karyawan terhubung secara relasional dan mengacu pada satu sumber database terpusat di Cloud Supabase PostgreSQL.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadDatabaseJson}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors flex items-center space-x-2 cursor-pointer"
              title="Unduh cadangan data lengkap seluruh 18 koleksi dari server"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Unduh Cadangan JSON</span>
            </button>

            <label
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors flex items-center space-x-2 cursor-pointer"
              title="Pulihkan database dari file cadangan JSON"
            >
              <Upload className="w-4 h-4 text-sky-400" />
              <span>Pulihkan JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleRestoreDatabaseJson}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={handlePushToSupabase}
              disabled={isPushingSupabase}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg border border-emerald-600 transition-colors flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              title="Kirim dan simpan seluruh data ERP saat ini ke Cloud Supabase"
            >
              <Zap className={`w-4 h-4 text-emerald-200 ${isPushingSupabase ? 'animate-spin' : ''}`} />
              <span>{isPushingSupabase ? 'Menyimpan...' : 'Kirim ke Supabase'}</span>
            </button>

            {confirmPull ? (
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-teal-600/80 rounded-lg px-2.5 py-1.5">
                <span className="text-xs text-teal-200 font-semibold">Tarik data Cloud?</span>
                <button
                  type="button"
                  onClick={handlePullFromSupabase}
                  disabled={isPullingSupabase}
                  className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold cursor-pointer"
                >
                  Ya, Tarik
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmPull(false)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs cursor-pointer"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmPull(true)}
                disabled={isPullingSupabase}
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-teal-300 text-xs font-semibold rounded-lg border border-teal-700/60 transition-colors flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                title="Tarik data terbaru dari Cloud Supabase ke aplikasi"
              >
                <ArrowDownToLine className={`w-4 h-4 text-teal-400 ${isPullingSupabase ? 'animate-bounce' : ''}`} />
                <span>{isPullingSupabase ? 'Menarik...' : 'Tarik dari Supabase'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSupabaseModal(true)}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors flex items-center space-x-2 cursor-pointer"
            >
              <Database className="w-4 h-4 text-emerald-400" />
              <span>Pengaturan Supabase</span>
            </button>

            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 text-xs font-semibold rounded-lg border border-rose-800/80 transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Kosongkan Mitra &amp; Karyawan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onRefreshAll();
                loadIntegrity();
              }}
              className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-700 transition-colors cursor-pointer"
              title="Muat Ulang Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {supabaseFeedback && (
          <div
            className={`mt-4 p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
              supabaseFeedback.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                : 'bg-rose-950/80 border-rose-700 text-rose-200'
            }`}
          >
            <span>{supabaseFeedback.message}</span>
            <button
              type="button"
              onClick={() => setSupabaseFeedback(null)}
              className="text-xs underline ml-3 opacity-80 hover:opacity-100 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {/* Cross-Module Relational Integrity Verification Bar */}
        {integrity && (
          <div className="mt-5 pt-4 border-t border-zinc-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 min-w-0 overflow-hidden">
              <div className="text-zinc-400 text-[11px] truncate">Relasi Produk · Kategori · Stok</div>
              <div className="mt-1 font-semibold text-white flex items-center justify-between gap-2 min-w-0">
                <span className="truncate">
                  {integrity.counts.produk} Produk · {integrity.counts.kategoriProduk} Kategori
                </span>
                <span className={`shrink-0 ${integrity.checks.produkStokMatched ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {integrity.checks.produkStokMatched ? 'Sinkron' : 'Perlu Cek'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 min-w-0 overflow-hidden">
              <div className="text-zinc-400 text-[11px] truncate">Relasi Karyawan · Akun Mitra</div>
              <div className="mt-1 font-semibold text-white flex items-center justify-between gap-2 min-w-0">
                <span className="truncate">
                  {integrity.counts.karyawan} Karyawan · {integrity.counts.mitra} Mitra
                </span>
                <span className={`shrink-0 ${integrity.checks.karyawanMitraMatched ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {integrity.checks.karyawanMitraMatched ? 'Sinkron' : 'Perlu Cek'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 min-w-0 overflow-hidden">
              <div className="text-zinc-400 text-[11px] truncate">Rekonsiliasi Piutang Mitra (BON01)</div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-white flex items-center justify-between gap-2 min-w-0">
                <span
                  className="truncate whitespace-nowrap"
                  title={formatRupiah(integrity.checks.bon01Saldo)}
                >
                  {formatRupiahSingkat(integrity.checks.bon01Saldo)}
                </span>
                <span className={`shrink-0 ${integrity.checks.bon01Reconciled ? 'text-emerald-400 font-sans' : 'text-amber-400 font-sans'}`}>
                  {integrity.checks.bon01Reconciled ? 'Akurat' : 'Selisih'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 min-w-0 overflow-hidden">
              <div className="text-zinc-400 text-[11px] truncate">Rekonsiliasi Titipan &amp; Hutang (TIT01)</div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-white flex items-center justify-between gap-2 min-w-0">
                <span
                  className="truncate whitespace-nowrap"
                  title={formatRupiah(integrity.checks.tit01Saldo)}
                >
                  {formatRupiahSingkat(integrity.checks.tit01Saldo)}
                </span>
                <span className={`shrink-0 ${integrity.checks.tit01Reconciled ? 'text-emerald-400 font-sans' : 'text-amber-400 font-sans'}`}>
                  {integrity.checks.tit01Reconciled ? 'Akurat' : 'Selisih'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Project Cloud:{' '}
              <strong className="font-mono text-zinc-200">
                {integrity?.supabaseUrlMasked || 'Belum dikonfigurasi'}
              </strong>
            </span>
            {integrity?.lastSyncTime && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Sinkron Terakhir:{' '}
                  <strong className="font-mono text-emerald-300">
                    {new Date(integrity.lastSyncTime).toLocaleString('id-ID')}
                  </strong>
                </span>
              </>
            )}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari cepat lintas tabel..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {resetSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{resetSuccessMsg}</span>
        </div>
      )}

      {/* 2. STUDIO DATABASE INTERAKTIF (18 KOLEKSI LENGKAP) */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-800 flex items-center space-x-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <span>Daftar Koleksi Tabel Supabase ({Object.keys(collectionsMeta).length} Tabel)</span>
            </h2>
            <span className="text-xs text-zinc-500">
              Pilih tabel untuk memeriksa isi record dan struktur JSON
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {(Object.keys(collectionsMeta) as CollectionKey[]).map((key) => {
              const meta = collectionsMeta[key];
              const IconComponent = meta.icon;
              const isActive = activeCollection === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveCollection(key);
                    setTableSearch('');
                    setSortField('');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isActive
                      ? 'bg-zinc-900 text-white border-emerald-500 shadow-sm'
                      : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div
                      className={`p-1.5 rounded-lg ${
                        isActive ? 'bg-emerald-950 text-emerald-400' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      <IconComponent className="w-3.5 h-3.5" />
                    </div>
                    <span
                      className={`text-[11px] font-mono tabular-nums font-semibold ${
                        isActive ? 'text-emerald-300' : 'text-zinc-600'
                      }`}
                    >
                      {meta.count} baris
                    </span>
                  </div>

                  <div className="text-xs font-semibold truncate">{meta.name}</div>
                  <div
                    className={`text-[11px] mt-0.5 line-clamp-1 ${
                      isActive ? 'text-zinc-400' : 'text-zinc-500'
                    }`}
                  >
                    {meta.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Collection Table Inspector */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                {React.createElement(collectionsMeta[activeCollection].icon, { className: 'w-4 h-4' })}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-zinc-900">
                    {collectionsMeta[activeCollection].name}
                  </h3>
                  <span className="text-xs text-zinc-500 font-mono tabular-nums">
                    · {filteredData.length} ditampilkan
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {collectionsMeta[activeCollection].description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder={`Cari di ${collectionsMeta[activeCollection].name}...`}
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className="pl-8 pr-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs w-48 sm:w-56 focus:outline-hidden focus:ring-1 focus:ring-emerald-600 bg-white"
                />
              </div>

              <div className="flex items-center space-x-0.5 bg-zinc-200/80 p-0.5 rounded-lg text-[11px] font-medium text-zinc-700">
                <button
                  type="button"
                  onClick={() => setTableDensity('compact')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    tableDensity === 'compact' ? 'bg-white shadow-2xs font-semibold text-zinc-900' : ''
                  }`}
                >
                  Ringkas
                </button>
                <button
                  type="button"
                  onClick={() => setTableDensity('normal')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    tableDensity === 'normal' ? 'bg-white shadow-2xs font-semibold text-zinc-900' : ''
                  }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setTableDensity('relaxed')}
                  className={`px-2 py-1 rounded transition-colors cursor-pointer ${
                    tableDensity === 'relaxed' ? 'bg-white shadow-2xs font-semibold text-zinc-900' : ''
                  }`}
                >
                  Lega
                </button>
              </div>

              {onNavigateToTab && collectionsMeta[activeCollection].navTab && (
                <button
                  type="button"
                  onClick={() => onNavigateToTab(collectionsMeta[activeCollection].navTab!)}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg text-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Modul</span>
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            {filteredData.length === 0 ? (
              <div className="p-10 text-center text-zinc-400 text-xs">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <span>Belum ada record pada koleksi ini atau tidak cocok dengan kata kunci pencarian.</span>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-700 font-semibold text-[11px] select-none">
                  {renderTableHeaders(activeCollection, handleSort, sortField, sortAsc)}
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredData.map((row: any, idx: number) =>
                    renderTableRow(
                      activeCollection,
                      row,
                      idx,
                      tableDensity,
                      (data) => setJsonInspectModal({ open: true, title: `Detail Record #${idx + 1}`, data }),
                      erpData.pembelianList
                    )
                  )}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-zinc-500 gap-2">
            <span>
              Menampilkan <strong className="font-mono tabular-nums">{filteredData.length}</strong> dari{' '}
              <strong className="font-mono tabular-nums">{rawActiveData.length}</strong> record di{' '}
              {collectionsMeta[activeCollection].name}
            </span>
            <div className="flex items-center space-x-3">
              <span>
                Sumber Database: <strong className="font-mono text-zinc-700">Supabase (wijaya_agro_erp_state)</strong>
              </span>
              <span className="text-emerald-700 font-semibold">Sinkron Otomatis</span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL RAW JSON INSPECTOR */}
      {jsonInspectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-zinc-950 text-zinc-100 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-800">
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">{jsonInspectModal.title}</span>
              </div>
              <button
                onClick={() => setJsonInspectModal({ open: false, title: '', data: null })}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              <pre className="text-xs font-mono text-emerald-300 bg-zinc-900/90 p-4 rounded-lg overflow-x-auto border border-zinc-800 leading-relaxed">
                {JSON.stringify(jsonInspectModal.data, null, 2)}
              </pre>
            </div>

            <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex justify-between items-center text-xs">
              <span className="text-zinc-400">
                Tersimpan pada state terpadu Cloud Supabase PT. Wijaya Agro Perkasa
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold rounded-lg border border-zinc-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Disalin' : 'Salin JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJsonInspectModal({ open: false, title: '', data: null })}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RESET MITRA & KARYAWAN */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200">
            <div className="p-4 bg-rose-700 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-4 h-4 text-rose-200" />
                <span>Konfirmasi Pembersihan Data Mitra &amp; Karyawan</span>
              </div>
              <button onClick={() => setShowResetModal(false)} className="text-rose-200 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-950 space-y-1.5">
                <div className="font-bold">Perhatian sebelum melanjutkan:</div>
                <p className="leading-relaxed">
                  Data <strong>Mitra</strong> dan <strong>Karyawan</strong> akan dikosongkan dan langsung disinkronkan ke Cloud Supabase. Master Produk, Kategori, Komoditas Hasil Bumi, serta Akun Rekening Perusahaan tetap terjaga.
                </p>
              </div>

              {resetErrorMsg && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {resetErrorMsg}
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={handleExecuteResetClean}
                  className="px-4 py-1.5 bg-rose-700 text-white font-semibold rounded-md hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
                >
                  {isResetting ? 'Membersihkan...' : 'Ya, Bersihkan Mitra & Karyawan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SupabaseSyncModal
        isOpen={showSupabaseModal}
        onClose={() => setShowSupabaseModal(false)}
        onSuccessRefresh={() => {
          onRefreshAll();
          loadIntegrity();
        }}
      />
    </div>
  );
};

// =========================================================================
// TABLE HEADER RENDERER
// =========================================================================
function renderTableHeaders(
  collection: CollectionKey,
  onSort: (f: string) => void,
  sortField: string,
  sortAsc: boolean
) {
  const th = (label: string, field?: string, alignRight = false) => (
    <th
      className={`py-3 px-3.5 font-semibold ${alignRight ? 'text-right' : 'text-left'} ${
        field ? 'cursor-pointer hover:text-emerald-700' : ''
      }`}
      onClick={() => field && onSort(field)}
    >
      <div className={`flex items-center space-x-1 ${alignRight ? 'justify-end' : ''}`}>
        <span>{label}</span>
        {field && sortField === field && (
          <span className="text-emerald-600">{sortAsc ? '▲' : '▼'}</span>
        )}
      </div>
    </th>
  );

  switch (collection) {
    case 'produkDagang':
      return (
        <tr>
          {th('Kode', 'kode')}
          {th('Nama Produk', 'nama')}
          {th('Kategori', 'kategori')}
          {th('Satuan', 'satuan')}
          {th('HPP Beli', 'hargaBeli', true)}
          {th('Harga Eceran', 'hargaJual', true)}
          {th('Harga Rekanan', 'hargaKhususRekanan', true)}
          {th('Margin', undefined, true)}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'kategoriProduk':
      return (
        <tr>
          {th('Nama Kategori', 'nama')}
          {th('Deskripsi', 'deskripsi')}
          {th('Jumlah Produk Terkait', 'jumlahProduk', true)}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'stokBarang':
      return (
        <tr>
          {th('Kode Produk', 'kode')}
          {th('Nama Barang', 'namaProduk')}
          {th('Satuan', 'satuan')}
          {th('Stok Saat Ini', 'stok', true)}
          {th('Batas Minimum', 'minimum', true)}
          {th('Update Terakhir', 'updateTerakhir')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'hasilBumi':
      return (
        <tr>
          {th('Kode', 'kode')}
          {th('Nama Komoditas', 'nama')}
          {th('Satuan', 'satuan')}
          {th('Stok Gudang', 'stok', true)}
          {th('Rata-rata Modal Beli', 'hargaBeliStandar', true)}
          {th('Sifat Komoditas')}
          {th('Update Terakhir', 'updateTerakhir')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'mitra':
      return (
        <tr>
          {th('ID / Kode', 'kode')}
          {th('Nama Lengkap', 'nama')}
          {th('Peran', 'role')}
          {th('Telepon / WA', 'telepon')}
          {th('Alamat', 'alamat')}
          {th('Status', 'status')}
          {th('Catatan', 'catatan')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'karyawan':
      return (
        <tr>
          {th('NIK / Kode', 'nik')}
          {th('Nama Karyawan', 'nama')}
          {th('Divisi / Departemen', 'divisi')}
          {th('Jabatan', 'jabatan')}
          {th('ID Mitra Terkait', 'idMitraTerkait')}
          {th('Standar Gaji Pokok', 'gajiPokok', true)}
          {th('Status', 'status')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'rekening':
      return (
        <tr>
          {th('Kode', 'kode')}
          {th('Nama Rekening', 'nama')}
          {th('Kategori', 'kategori')}
          {th('Nomor Rekening', 'nomorRekening')}
          {th('Atas Nama', 'atasNama')}
          {th('Saldo Saat Ini', 'saldoSaatIni', true)}
          {th('Jenis')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'penjualan':
      return (
        <tr>
          {th('No. Faktur', 'noPenjualan')}
          {th('Tanggal', 'tanggal')}
          {th('Mitra / Pembeli', 'namaMitra')}
          {th('Metode', 'metode')}
          {th('Rincian Produk')}
          {th('Total Nominal', 'totalNominal', true)}
          {th('Sisa Piutang', 'sisaPiutang', true)}
          {th('Status', 'statusPembayaran')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'pembelianBarang':
      return (
        <tr>
          {th('No. Kulakan', 'noPembelian')}
          {th('Tanggal', 'tanggal')}
          {th('Supplier / Mitra', 'namaMitra')}
          {th('Metode', 'metodePembayaran')}
          {th('Barang Masuk')}
          {th('Total Kulakan', 'totalNominal', true)}
          {th('Status', 'status')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'pembelianHasilBumi':
      return (
        <tr>
          {th('No. Slip', 'noPembelian')}
          {th('Tanggal', 'tanggal')}
          {th('Petani / Mitra', 'namaMitra')}
          {th('Komoditas', 'komoditasNama')}
          {th('Berat Bersih', 'beratBersih', true)}
          {th('Harga / Kg', 'hargaPerKg', true)}
          {th('Total', 'totalNominal', true)}
          {th('Metode & Status')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'pencairanTitipan':
      return (
        <tr>
          {th('ID Pencairan', 'idPencairan')}
          {th('Tanggal', 'tanggal')}
          {th('Nama Mitra', 'namaMitra')}
          {th('Metode', 'metodePembayaran')}
          {th('Rekening Sumber', 'rekeningSumber')}
          {th('Nominal Pencairan', 'nominalPencairan', true)}
          {th('Sisa Titipan', 'saldoTitipanSisa', true)}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'kasbonUang':
      return (
        <tr>
          {th('ID Transaksi', 'idTransaksi')}
          {th('Tanggal', 'tanggal')}
          {th('Nama Mitra', 'namaMitra')}
          {th('Tipe')}
          {th('Nominal Awal', 'nominal', true)}
          {th('Sisa Kasbon', 'sisaKasbon', true)}
          {th('Sumber', 'rekeningSumber')}
          {th('Status', 'status')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'bayarBon':
      return (
        <tr>
          {th('ID Bukti', 'idTransaksi')}
          {th('Tanggal', 'tanggal')}
          {th('Nama Mitra', 'namaMitra')}
          {th('Nominal Bayar', 'nominalBayar', true)}
          {th('Metode', 'metode')}
          {th('Rekening Tujuan', 'rekeningTujuan')}
          {th('Keterangan', 'keterangan')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'pengeluaran':
      return (
        <tr>
          {th('ID Biaya', 'idTransaksi')}
          {th('Tanggal', 'tanggal')}
          {th('Divisi', 'divisi')}
          {th('Kategori', 'kategori')}
          {th('Keterangan', 'keterangan')}
          {th('Rekening', 'rekeningSumber')}
          {th('Nominal', 'nominal', true)}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'transferRekening':
      return (
        <tr>
          {th('No. Mutasi', 'noTransfer')}
          {th('Tanggal', 'tanggal')}
          {th('Dari Rekening', 'rekeningSumber')}
          {th('Ke Rekening', 'rekeningTujuan')}
          {th('Keterangan', 'keterangan')}
          {th('Nominal', 'nominal', true)}
          {th('Status', 'status')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'upahHarian':
      return (
        <tr>
          {th('ID Kerja', 'id')}
          {th('Tanggal Kerja', 'tanggalKerja')}
          {th('Nama Karyawan', 'namaKaryawan')}
          {th('Divisi', 'divisi')}
          {th('Pekerjaan', 'item')}
          {th('Total Hak Upah', 'totalUpahHarian', true)}
          {th('Status', 'status')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'penggajian':
      return (
        <tr>
          {th('No. Slip', 'slipNomor')}
          {th('Tanggal', 'tanggal')}
          {th('Nama Karyawan', 'namaKaryawan')}
          {th('Divisi', 'divisi')}
          {th('Gaji Kotor', 'totalGajiKotor', true)}
          {th('Potong Bon', 'potonganKasbon', true)}
          {th('Bersih Cair', 'gajiBersihDibayar', true)}
          {th('Rekening', 'rekeningSumber')}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    case 'auditLogs':
      return (
        <tr>
          {th('Waktu', 'timestamp')}
          {th('Petugas', 'user')}
          {th('Aksi', 'jenisTransaksi')}
          {th('ID Transaksi', 'idTransaksi')}
          {th('Detail Aktivitas', 'detail')}
          {th('Nominal', 'nominal', true)}
          <th className="py-3 px-3 text-center">JSON</th>
        </tr>
      );

    default:
      return null;
  }
}

// =========================================================================
// TABLE ROW RENDERER
// =========================================================================
function renderTableRow(
  collection: CollectionKey,
  row: any,
  idx: number,
  density: 'compact' | 'normal' | 'relaxed',
  onInspect: (data: any) => void,
  pembelianList?: any[]
) {
  const pyClass = density === 'compact' ? 'py-1.5' : density === 'relaxed' ? 'py-3.5' : 'py-2.5';

  const rawBtn = (
    <td className={`${pyClass} px-3 text-center`}>
      <button
        type="button"
        onClick={() => onInspect(row)}
        className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-mono text-[10px] font-semibold transition-colors inline-flex items-center space-x-1 cursor-pointer"
        title="Lihat Raw JSON"
      >
        <Eye className="w-3 h-3 text-emerald-700" />
        <span>JSON</span>
      </button>
    </td>
  );

  switch (collection) {
    case 'produkDagang': {
      const margin = (row.hargaJual || 0) - (row.hargaBeli || 0);
      const marginPct = row.hargaBeli > 0 ? Math.round((margin / row.hargaBeli) * 100) : 0;
      return (
        <tr key={row.kode || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.kategori}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.satuan}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-600`}>
            {formatRupiah(row.hargaBeli)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-emerald-800`}>
            {formatRupiah(row.hargaJual)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-sky-800`}>
            {formatRupiah(row.hargaKhususRekanan || row.hargaJual)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-emerald-700 font-semibold`}>
            +{formatRupiah(margin)} ({marginPct}%)
          </td>
          {rawBtn}
        </tr>
      );
    }

    case 'kategoriProduk':
      return (
        <tr key={row.nama || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.deskripsi || '-'}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-emerald-800`}>
            {(row.jumlahProduk ?? 0).toLocaleString('id-ID')} produk
          </td>
          {rawBtn}
        </tr>
      );

    case 'stokBarang':
      return (
        <tr key={row.kode || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaProduk}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.satuan}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold ${row.stok <= row.minimum ? 'text-rose-700' : 'text-emerald-800'}`}>
            {(row.stok || 0).toLocaleString('id-ID')} {row.satuan}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-600`}>
            {(row.minimum || 0).toLocaleString('id-ID')}
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{formatTanggalIndo(row.updateTerakhir)}</td>
          {rawBtn}
        </tr>
      );

    case 'hasilBumi': {
      const isKopiTitip = row.kode === 'HB-08' || row.isBelumPutusHarga;
      return (
        <tr
          key={row.kode || idx}
          className={`hover:bg-zinc-50/80 transition-colors ${isKopiTitip ? 'bg-amber-50/40' : ''}`}
        >
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.satuan}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-amber-900`}>
            {row.stok?.toLocaleString('id-ID')} {row.satuan}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-800`}>
            {(() => {
              const purchases = (pembelianList || []).filter(
                (p: any) =>
                  p.komoditasKode === row.kode ||
                  p.komoditasNama?.toUpperCase().trim() === row.nama?.toUpperCase().trim()
              );
              const totalUangKeluar = purchases.reduce((sum: number, p: any) => sum + (p.totalNominal || 0), 0);
              const totalKgBeli = purchases.reduce((sum: number, p: any) => sum + (p.beratBersih || 0), 0);
              const rataRataModal = totalKgBeli > 0 && totalUangKeluar > 0 ? Math.round(totalUangKeluar / totalKgBeli) : 0;
              return rataRataModal > 0
                ? `${formatRupiah(rataRataModal)} / Kg`
                : isKopiTitip
                ? 'Mengambang'
                : 'Rp 0';
            })()}
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>
            {isKopiTitip ? 'Belum Putus Harga (Titip)' : 'Hasil Bumi Reguler'}
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{formatTanggalIndo(row.updateTerakhir)}</td>
          {rawBtn}
        </tr>
      );
    }

    case 'mitra':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.kode || row.id}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 font-medium text-sky-800`}>{row.role}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.telepon || '-'}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.alamat || '-'}</td>
          <td className={`${pyClass} px-3.5 text-emerald-800 font-medium`}>{row.status}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.catatan || '-'}</td>
          {rawBtn}
        </tr>
      );

    case 'karyawan':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.nik || row.id}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>{row.divisi || row.departemen || '-'}</td>
          <td className={`${pyClass} px-3.5 text-zinc-800`}>{row.jabatan}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.idMitraTerkait || `MTR-${row.id}`}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-zinc-900`}>
            {formatRupiah(row.gajiPokok || 0)}
          </td>
          <td className={`${pyClass} px-3.5 text-emerald-800 font-medium`}>{row.status}</td>
          {rawBtn}
        </tr>
      );

    case 'rekening':
      return (
        <tr key={row.kode || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.kategori}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.nomorRekening}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.atasNama}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-emerald-900`}>
            {formatRupiah(row.saldoSaatIni)}
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>
            {row.isVirtual ? 'Akun Virtual Rekonsiliasi' : 'Kas Riil / Bank'}
          </td>
          {rawBtn}
        </tr>
      );

    case 'penjualan':
      return (
        <tr key={row.noPenjualan || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.noPenjualan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-700`}>{row.metode}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>
            {row.items?.map((it: any) => `${it.namaProduk} (${it.qty} ${it.satuan})`).join(', ')}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-zinc-900`}>
            {formatRupiah(row.totalNominal)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-rose-700`}>
            {formatRupiah(row.sisaPiutang || 0)}
          </td>
          <td className={`${pyClass} px-3.5 font-medium ${row.statusPembayaran === 'LUNAS' ? 'text-emerald-800' : 'text-rose-700'}`}>
            {row.statusPembayaran}
          </td>
          {rawBtn}
        </tr>
      );

    case 'pembelianBarang':
      return (
        <tr key={row.noPembelian || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.noPembelian}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-700`}>{row.metodePembayaran}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>
            {row.items?.map((it: any) => `${it.namaProduk} (${it.qty} ${it.satuan})`).join(', ')}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-zinc-900`}>
            {formatRupiah(row.totalNominal)}
          </td>
          <td className={`${pyClass} px-3.5 font-medium ${row.status === 'LUNAS' ? 'text-emerald-800' : 'text-amber-800'}`}>
            {row.status}
          </td>
          {rawBtn}
        </tr>
      );

    case 'pembelianHasilBumi': {
      const isBelumPutus = row.isBelumPutusHarga || row.status === 'BELUM_PUTUS_HARGA';
      return (
        <tr key={row.noPembelian || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.noPembelian}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 text-zinc-800`}>{row.komoditasNama}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-amber-900`}>
            {row.beratBersih?.toLocaleString('id-ID')} Kg
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-700`}>
            {isBelumPutus ? 'Mengambang' : formatRupiah(row.hargaPerKg)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-zinc-900`}>
            {formatRupiah(row.totalNominal)}
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>
            {isBelumPutus ? 'Belum Putus Harga' : `${row.metodePembayaran} · ${row.status}`}
          </td>
          {rawBtn}
        </tr>
      );
    }

    case 'pencairanTitipan':
      return (
        <tr key={row.idPencairan || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.idPencairan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-700`}>{row.metodePembayaran}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.rekeningSumber}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-emerald-800`}>
            {formatRupiah(row.nominalPencairan)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-700`}>
            {formatRupiah(row.saldoTitipanSisa || 0)}
          </td>
          {rawBtn}
        </tr>
      );

    case 'kasbonUang':
      return (
        <tr key={row.idTransaksi || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.idTransaksi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>
            {row.isNotaLalu || row.rekeningSumber === 'BON01' ? 'Nota Lalu' : 'Kasbon Tunai'}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-rose-800`}>
            {formatRupiah(row.nominal)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-rose-900`}>
            {formatRupiah(row.sisaKasbon)}
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.rekeningSumber}</td>
          <td className={`${pyClass} px-3.5 font-medium ${row.status === 'LUNAS' ? 'text-emerald-800' : 'text-rose-700'}`}>
            {row.status}
          </td>
          {rawBtn}
        </tr>
      );

    case 'bayarBon':
      return (
        <tr key={row.idTransaksi || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.idTransaksi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-emerald-800`}>
            {formatRupiah(row.nominalBayar)}
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-700`}>{row.metode}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.rekeningTujuan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.keterangan || '-'}</td>
          {rawBtn}
        </tr>
      );

    case 'pengeluaran':
      return (
        <tr key={row.idTransaksi || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.idTransaksi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.divisi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>{row.kategori}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.keterangan}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.rekeningSumber}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-rose-800`}>
            {formatRupiah(row.nominal)}
          </td>
          {rawBtn}
        </tr>
      );

    case 'transferRekening':
      return (
        <tr key={row.noTransfer || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.noTransfer}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-800`}>{row.rekeningSumber}</td>
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-emerald-800`}>{row.rekeningTujuan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.keterangan || '-'}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-zinc-900`}>
            {formatRupiah(row.nominal)}
          </td>
          <td className={`${pyClass} px-3.5 text-emerald-800 font-medium`}>{row.status}</td>
          {rawBtn}
        </tr>
      );

    case 'upahHarian':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.id}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggalKerja}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaKaryawan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>{row.divisi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.item || row.keterangan || '-'}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-zinc-900`}>
            {formatRupiah(row.totalUpahHarian || 0)}
          </td>
          <td className={`${pyClass} px-3.5 font-medium ${row.status === 'SUDAH_DIBAYAR' ? 'text-emerald-800' : 'text-amber-700'}`}>
            {row.status}
          </td>
          {rawBtn}
        </tr>
      );

    case 'penggajian':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-semibold text-zinc-900`}>{row.slipNomor || row.id}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaKaryawan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>{row.divisi}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-700`}>
            {formatRupiah(row.totalGajiKotor)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-amber-800`}>
            {formatRupiah(row.potonganKasbon || 0)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums font-semibold text-emerald-800`}>
            {formatRupiah(row.gajiBersihDibayar)}
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.rekeningSumber}</td>
          {rawBtn}
        </tr>
      );

    case 'auditLogs':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono text-[11px] text-zinc-500`}>{row.timestamp}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.user}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-700`}>{row.jenisTransaksi}</td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-800`}>{row.idTransaksi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>{row.detail}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono tabular-nums text-zinc-800`}>
            {row.nominal > 0 ? formatRupiah(row.nominal) : '-'}
          </td>
          {rawBtn}
        </tr>
      );

    default:
      return null;
  }
}
