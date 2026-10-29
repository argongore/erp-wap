import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Search,
  Wheat,
  HandCoins,
  ArrowRightLeft,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Scale,
  RefreshCw,
  FileText,
  Zap,
  Trash2,
  Database,
  Building2,
} from 'lucide-react';
import { Mitra, RoleMitra, RekapMasterMitraSummary, RekapMitraItem, FullErpModularDataset, Rekening } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { InputNotaLaluModal } from '../common/InputNotaLaluModal.tsx';
import { ModalPinjamUangMitra } from '../common/ModalPinjamUangMitra.tsx';
import { ModalBersihkanNotaLalu } from '../common/ModalBersihkanNotaLalu.tsx';
import { ModalTransaksiAnakPerusahaan } from '../common/ModalTransaksiAnakPerusahaan.tsx';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { findSimilarMitra, useFuzzyMitraMatches } from '../../utils/nameSimilarity.ts';
import { FuzzyNameWarningCard } from '../common/FuzzyNameWarningCard.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList?: Rekening[];
  fullErpData?: FullErpModularDataset;
  onRefresh: () => void;
  onOpenStatement: (idMitra: string) => void;
  onOpenDuplicateMerger?: () => void;
  onSuccessReceipt?: (receipt: ReceiptData) => void;
}

type FilterTab = 'ALL' | 'ANAK_PERUSAHAAN' | 'EKSTERNAL' | 'KARYAWAN' | 'MITRA_TANI' | 'CUSTOMER' | 'SUPPLIER' | 'HUTANG_TITIP' | 'BON_AKTIF';

export const MasterMitraView: React.FC<Props> = ({
  mitraList,
  rekeningList = [],
  fullErpData,
  onRefresh,
  onOpenStatement,
  onOpenDuplicateMerger,
  onSuccessReceipt,
}) => {
  const [rekapData, setRekapData] = useState<RekapMasterMitraSummary | null>(null);
  const [loadingRekap, setLoadingRekap] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  // Supabase sync state
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [supabaseFeedback, setSupabaseFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMitra, setEditingMitra] = useState<Mitra | null>(null);
  const [notaLaluModalOpen, setNotaLaluModalOpen] = useState(false);
  const [notaLaluSelectedMitraId, setNotaLaluSelectedMitraId] = useState<string | undefined>(undefined);
  const [bersihkanNotaModalOpen, setBersihkanNotaModalOpen] = useState(false);
  const [pinjamUangModalOpen, setPinjamUangModalOpen] = useState(false);
  const [pinjamUangSelectedMitraId, setPinjamUangSelectedMitraId] = useState<string | undefined>(undefined);
  const [anakPerusahaanRekKode, setAnakPerusahaanRekKode] = useState<string | null>(null);

  // Form State
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formRole, setFormRole] = useState<RoleMitra>('MITRA_TANI');
  const [formTelepon, setFormTelepon] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formCatatan, setFormCatatan] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dismissedAddWarning, setDismissedAddWarning] = useState<string>('');

  // Non-blocking fuzzy name matching & duplicate prevention (lag-free typing)
  const similarMitrasInAdd = useFuzzyMitraMatches(formNama, mitraList);

  const isCurrentAddWarningDismissed =
    dismissedAddWarning.length > 0 &&
    dismissedAddWarning.toLowerCase() === formNama.trim().toLowerCase();

  const handleSyncToSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await api.pushToSupabase();
      setSupabaseFeedback({
        success: true,
        message: `Database Mitra & ERP berhasil disinkronkan ke Cloud Supabase (${res.message || `${mitraList.length} Mitra Riil`})!`,
      });
      handleRefreshAll();
    } catch (err: any) {
      setSupabaseFeedback({
        success: false,
        message: `Gagal sinkronisasi ke Supabase: ${err.message}`,
      });
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const loadRekap = async (silent = false) => {
    if (!silent && !rekapData) setLoadingRekap(true);
    try {
      const data = await api.getRekapMitra();
      setRekapData(data);
    } catch (err: any) {
      console.error('Failed to load rekap mitra:', err);
    } finally {
      setLoadingRekap(false);
    }
  };

  useEffect(() => {
    loadRekap(Boolean(rekapData));
  }, [mitraList]);

  useEffect(() => {
    const onErpUpdated = () => {
      loadRekap(true);
    };
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  const handleRefreshAll = () => {
    onRefresh();
    loadRekap(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // High risk duplicate prevention evaluated synchronously on submit
    const latestMatches = formNama.trim().length >= 2 ? findSimilarMitra(formNama, mitraList) : [];
    const highRiskMatch = latestMatches.find(
      (s) => s.isHighRiskDuplicate || s.matchType === 'PHONETIC' || s.similarity >= 80
    );
    if (highRiskMatch && !isCurrentAddWarningDismissed) {
      setErrorMsg(
        `⚠️ Peringatan Duplikasi Nama: Di database sudah ada Mitra "${highRiskMatch.mitra.nama}" (${highRiskMatch.mitra.kode}). Jika orang ini sama, jangan buat akun baru agar piutang & titipan tidak terpecah! Jika memang orang yang berbeda, klik tombol "Bukan, Orang Berbeda" di kotak peringatan lalu simpan kembali.`
      );
      return;
    }

    setSubmitting(true);
    try {
      await api.createMitra({
        kode: formKode,
        nama: formNama,
        role: formRole,
        telepon: formTelepon,
        alamat: formAlamat,
        catatan: formCatatan,
      });
      setSuccessMsg(`Mitra ${formNama} berhasil ditambahkan`);
      setShowAddModal(false);
      setFormKode('');
      setFormNama('');
      setFormTelepon('');
      setFormAlamat('');
      setFormCatatan('');
      handleRefreshAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMitra) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.updateMitra(editingMitra.id, {
        nama: formNama,
        role: formRole,
        telepon: formTelepon,
        alamat: formAlamat,
        status: editingMitra.status,
        catatan: formCatatan,
      });
      setSuccessMsg(`Data mitra ${formNama} berhasil diperbarui`);
      setEditingMitra(null);
      handleRefreshAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (m: Mitra | RekapMitraItem) => {
    setEditingMitra(m as Mitra);
    setFormNama(m.nama);
    setFormRole(m.role);
    setFormTelepon(m.telepon);
    setFormAlamat(m.alamat);
    setFormCatatan(m.catatan || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  // Merge items
  const items: RekapMitraItem[] = rekapData?.items || mitraList.map((m) => ({
    id: m.id,
    kode: m.kode,
    nama: m.nama,
    role: m.role,
    telepon: m.telepon,
    alamat: m.alamat,
    status: m.status,
    catatan: m.catatan,
    isAnakPerusahaan: m.isAnakPerusahaan || m.role === 'ANAK_PERUSAHAAN',
    kodeRekeningTerkait: m.kodeRekeningTerkait,
    totalHutangTitipPanen: 0,
    totalKasbonBarang: 0,
    totalKasbonUang: 0,
    totalBonMitra: 0,
    saldoBersih: 0,
    posisiStatus: 'LUNAS_IMPAS',
    totalTransaksiCount: 0,
  }));

  // Category Counts
  const countAnakPerusahaan = items.filter((i) => i.isAnakPerusahaan || i.role === 'ANAK_PERUSAHAAN').length;
  const countEksternal = items.filter((i) => i.role !== 'KARYAWAN').length;
  const countKaryawan = items.filter((i) => i.role === 'KARYAWAN').length;
  const countMitraTani = items.filter((i) => i.role === 'MITRA_TANI' || i.role === 'ALL').length;
  const countCustomer = items.filter((i) => i.role === 'CUSTOMER' || i.role === 'ALL').length;
  const countSupplier = items.filter((i) => i.role === 'SUPPLIER' || i.role === 'ALL').length;

  // Filtering
  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      item.nama.toLowerCase().includes(q) ||
      item.kode.toLowerCase().includes(q) ||
      item.telepon.toLowerCase().includes(q) ||
      item.alamat.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (activeFilter === 'ANAK_PERUSAHAAN') {
      return Boolean(item.isAnakPerusahaan || item.role === 'ANAK_PERUSAHAAN');
    }
    if (activeFilter === 'EKSTERNAL') {
      return item.role !== 'KARYAWAN';
    }
    if (activeFilter === 'KARYAWAN') {
      return item.role === 'KARYAWAN';
    }
    if (activeFilter === 'HUTANG_TITIP') {
      return item.totalHutangTitipPanen > 0;
    }
    if (activeFilter === 'BON_AKTIF') {
      return item.totalBonMitra > 0;
    }
    if (activeFilter === 'MITRA_TANI') {
      return item.role === 'MITRA_TANI' || item.role === 'ALL';
    }
    if (activeFilter === 'CUSTOMER') {
      return item.role === 'CUSTOMER' || item.role === 'ALL';
    }
    if (activeFilter === 'SUPPLIER') {
      return item.role === 'SUPPLIER' || item.role === 'ALL';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Master &amp; Rekap Mitra Bisnis</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
              MODUL 4
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Rekap lengkap posisi keuangan: hutang pembelian hasil bumi (titipan belum diambil) dan saldo bon mitra (barang + uang tunai)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            onClick={handleRefreshAll}
            className="p-2 text-zinc-600 bg-white hover:bg-zinc-50 border border-zinc-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Segarkan Rekap Data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingRekap ? 'animate-spin text-sky-600' : ''}`} />
          </button>

          {/* Tombol Sinkronisasi Langsung ke Google Spreadsheet */}
          <button
            type="button"
            onClick={handleSyncToSupabase}
            disabled={isSyncingSupabase}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Sinkronkan database mitra riil ke Cloud Supabase"
          >
            <Zap className={`w-4 h-4 ${isSyncingSupabase ? 'animate-spin text-amber-300' : 'text-amber-300'}`} />
            <span>{isSyncingSupabase ? 'Menyinkronkan...' : '⚡ Sinkronkan ke Supabase'}</span>
          </button>

          {onOpenDuplicateMerger && (
            <button
              type="button"
              onClick={onOpenDuplicateMerger}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Lacak dan satukan akun mitra yang namanya ganda atau salah ejaan (misal Wiwid vs Wiwit)"
            >
              <Scale className="w-4 h-4 text-emerald-700" />
              <span>Audit &amp; Gabung Nama Kembar</span>
            </button>
          )}

          <button
            onClick={() => {
              setNotaLaluSelectedMitraId(undefined);
              setNotaLaluModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>+ Input Nota Lalu (Fisik)</span>
          </button>

          <button
            onClick={() => setBersihkanNotaModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Bersihkan bukti nota lalu berdasarkan nama mitra atau rentang waktu"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Bersihkan Bukti Nota</span>
          </button>

          <button
            onClick={() => {
              setPinjamUangSelectedMitraId(undefined);
              setPinjamUangModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Catat penerimaan pinjaman dana dari mitra ke PT (otomatis masuk ke saldo titip mitra)"
          >
            <HandCoins className="w-4 h-4 text-emerald-200" />
            <span>+ Pinjam Uang PT ke Mitra</span>
          </button>

          <button
            onClick={() => {
              setShowAddModal(true);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Mitra Baru</span>
          </button>
        </div>
      </div>

      {/* Feedback Sinkronisasi Supabase */}
      {supabaseFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            supabaseFeedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {supabaseFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{supabaseFeedback.message}</span>
          </div>

          <button
            type="button"
            onClick={() => setSupabaseFeedback(null)}
            className="text-zinc-400 hover:text-zinc-600 cursor-pointer text-xs p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Info Banner: Penyimpanan Cloud Supabase PostgreSQL */}
      <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center space-x-2 text-emerald-950">
          <Database className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Cloud Database Supabase:</strong> Tabel{' '}
            <code className="bg-white px-2 py-0.5 rounded border border-emerald-300 font-mono text-[11px] text-emerald-900 font-bold">
              wijaya_agro_erp_state (PostgreSQL)
            </code>
          </span>
        </div>
        <div className="text-[11px] text-emerald-800 font-medium">
          Seluruh data 24 mitra riil, bukti nota fisik, dan saldo titip disinkronkan 24/7 ke Cloud.
        </div>
      </div>

      {/* Top Rekap Master Mitra KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Card 1: Hutang Kita pada Mitra (Titip Hasil Bumi) */}
        <div className="p-4 bg-white rounded-xl border-2 border-purple-400 shadow-xs space-y-1.5 relative min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <Wheat className="w-3.5 h-3.5 text-purple-700 shrink-0" />
              <span className="truncate">HUTANG KITA PADA MITRA</span>
            </span>
            <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200 shrink-0">
              TITIP PANEN
            </span>
          </div>
          <p
            className="text-xl font-black text-purple-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(rekapData?.totalHutangPerusahaanKeMitra || 0)}
          >
            {formatRupiahSingkat(rekapData?.totalHutangPerusahaanKeMitra || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Hasil panen petani yang sudah disetor namun <strong>uangnya belum diambil</strong> ({rekapData?.mitraDenganHutangTitipCount || 0} mitra).
          </p>
        </div>

        {/* Card 2: Total Bon Mitra (Piutang Kita ke Mitra) */}
        <div className="p-4 bg-white rounded-xl border-2 border-amber-400 shadow-xs space-y-1.5 relative min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <HandCoins className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="truncate">TOTAL BON MITRA</span>
            </span>
            <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
              PIUTANG KASBON
            </span>
          </div>
          <p
            className="text-xl font-black text-amber-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(rekapData?.totalBonMitra || 0)}
          >
            {formatRupiahSingkat(rekapData?.totalBonMitra || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Kewajiban kasbon barang toko + kasbon pinjaman uang ({rekapData?.mitraDenganBonCount || 0} mitra berhutang bon).
          </p>
        </div>

        {/* Card 3: Saldo Bersih Kemitraan (Net Balance) */}
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <Scale className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              <span className="truncate">POSISI NET KEMITRAAN</span>
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                (rekapData?.saldoBersihKemitraan || 0) >= 0
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {(rekapData?.saldoBersihKemitraan || 0) >= 0 ? 'NET PERUSAHAAN BERHUTANG' : 'NET MITRA BERHUTANG'}
            </span>
          </div>
          <p
            className={`text-xl font-black font-mono tabular-nums truncate whitespace-nowrap ${
              (rekapData?.saldoBersihKemitraan || 0) >= 0 ? 'text-purple-900' : 'text-amber-900'
            }`}
            title={formatRupiah(Math.abs(rekapData?.saldoBersihKemitraan || 0))}
          >
            {formatRupiahSingkat(Math.abs(rekapData?.saldoBersihKemitraan || 0))}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            {(rekapData?.saldoBersihKemitraan || 0) >= 0
              ? 'Saldo simpanan titip hasil bumi petani lebih besar dari total kasbon.'
              : 'Total kasbon mitra melebihi simpanan hasil bumi yang dititipkan.'}
          </p>
        </div>

        {/* Card 4: Total Mitra Aktif */}
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5 min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <Users className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="truncate">JUMLAH MITRA TERDAFTAR</span>
            </span>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded shrink-0">
              SINKRON
            </span>
          </div>
          <p className="text-xl font-black text-zinc-900 font-mono tabular-nums truncate whitespace-nowrap">
            {rekapData?.totalMitra || mitraList.length}{' '}
            <span className="text-xs font-normal text-zinc-500">Mitra</span>
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Petani binaan, kios saprotan, dan supplier komoditas di sistem ERP.
          </p>
        </div>
      </div>

      {/* Explanatory Policy Callout */}
      <div className="p-3.5 bg-gradient-to-r from-sky-50 to-indigo-50/50 border border-sky-200 rounded-xl text-xs text-sky-950 flex items-start space-x-2.5">
        <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <strong className="text-sky-950 font-bold">Sinkronisasi Keuangan &amp; Akun Karyawan Terpadu:</strong>
            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold">Otomatis Terhubung</span>
          </div>
          <p className="text-[11px] text-zinc-600 leading-relaxed">
            Di sistem ERP Wijaya Agro, setiap karyawan yang diinput di <strong>Master Karyawan</strong> otomatis dibuatkan akun di <strong>Database Mitra</strong> (Role: KARYAWAN) agar siap untuk transaksi <em>Kasbon Uang Tunai</em>, <em>Kasbon Barang Toko</em>, dan <em>Potong Gaji</em> di kasir. Anda dapat memfilter tampilan di bawah untuk melihat hanya mitra bisnis luar (<strong>Mitra Eksternal</strong>) atau akun kasbon staf (<strong>Internal Karyawan</strong>).
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Semua ({items.length})
          </button>

          <button
            onClick={() => setActiveFilter('ANAK_PERUSAHAAN')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'ANAK_PERUSAHAAN'
                ? 'bg-teal-700 text-white shadow-2xs'
                : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200'
            }`}
            title="Anak perusahaan PT. Wijaya Agro Perkasa yang menyatu dengan Master Rekening (seperti DP Parabot)"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Anak Perusahaan ({countAnakPerusahaan})</span>
          </button>

          <button
            onClick={() => setActiveFilter('EKSTERNAL')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'EKSTERNAL'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
            title="Hanya mitra bisnis luar (Petani, Customer, Supplier, Anak Perusahaan)"
          >
            <span>Mitra Eksternal ({countEksternal})</span>
          </button>

          <button
            onClick={() => setActiveFilter('KARYAWAN')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'KARYAWAN'
                ? 'bg-indigo-700 text-white shadow-2xs'
                : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100 border border-indigo-200'
            }`}
            title="Akun internal karyawan untuk pencatatan kasbon uang dan barang toko"
          >
            <span>Internal Karyawan ({countKaryawan})</span>
          </button>

          <button
            onClick={() => setActiveFilter('MITRA_TANI')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'MITRA_TANI'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Petani ({countMitraTani})
          </button>

          <button
            onClick={() => setActiveFilter('CUSTOMER')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'CUSTOMER'
                ? 'bg-sky-700 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Customer ({countCustomer})
          </button>

          <button
            onClick={() => setActiveFilter('SUPPLIER')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'SUPPLIER'
                ? 'bg-amber-700 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Supplier ({countSupplier})
          </button>

          <button
            onClick={() => setActiveFilter('HUTANG_TITIP')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'HUTANG_TITIP'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <Wheat className="w-3.5 h-3.5" />
            <span>Titip Panen ({rekapData?.mitraDenganHutangTitipCount || 0})</span>
          </button>

          <button
            onClick={() => setActiveFilter('BON_AKTIF')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'BON_AKTIF'
                ? 'bg-amber-700 text-white shadow-2xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>Bon Aktif ({rekapData?.mitraDenganBonCount || 0})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Cari nama, kode, HP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 text-zinc-800"
          />
        </div>
      </div>

      {/* Main Table: Rekap Master Mitra */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">KODE / IDENTITAS MITRA</th>
                <th className="py-3 px-4">ROLE &amp; KONTAK</th>
                <th className="py-3 px-4 text-right">
                  HUTANG KITA KE MITRA
                  <div className="text-[9px] font-normal text-purple-700 normal-case">
                    (Titip Panen Belum Diambil)
                  </div>
                </th>
                <th className="py-3 px-4 text-right">
                  BON MITRA
                  <div className="text-[9px] font-normal text-amber-700 normal-case">
                    (Kasbon Barang + Uang)
                  </div>
                </th>
                <th className="py-3 px-4 text-center">POSISI BERSIH (NET)</th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th className="py-3 px-4 text-center">AKSI &amp; STATEMENT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 bg-sky-50 text-sky-600 rounded-full flex items-center justify-center mx-auto border border-sky-200">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-zinc-800">
                          {mitraList.length === 0
                            ? 'Database Mitra Masih Bersih (Siap Input Real Data)'
                            : 'Tidak ada mitra yang cocok dengan filter atau pencarian'}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">
                          {mitraList.length === 0
                            ? 'Sesuai instruksi Anda, data mitra telah dikosongkan. Silakan input data asli mitra, petani, customer, atau anak buah Anda sekarang.'
                            : 'Coba ubah kata kunci pencarian atau ganti filter kategori.'}
                        </p>
                      </div>
                      {mitraList.length === 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAddModal(true)}
                          className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>+ Input Data Mitra Sekarang</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((m) => {
                  const hasTitip = m.totalHutangTitipPanen > 0;
                  const hasBon = m.totalBonMitra > 0;
                  const isAnak = Boolean(m.isAnakPerusahaan || m.role === 'ANAK_PERUSAHAAN');
                  const rekKode = m.kodeRekeningTerkait || (isAnak ? 'REK-DPPARABO' : undefined);
                  const saldoRekAnak =
                    m.saldoRekeningAnakPerusahaan ??
                    (rekKode ? rekeningList.find((r) => r.kode === rekKode)?.saldoSaatIni || 0 : 0);
                  const posisiTerpadu =
                    m.posisiBersihTerpadu ?? m.saldoBersih - saldoRekAnak;

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        isAnak ? 'bg-teal-50/30' : ''
                      }`}
                    >
                      {/* Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                            {m.kode}
                          </span>
                          <span className="font-bold text-zinc-900 text-sm">{m.nama}</span>
                        </div>
                        {isAnak && rekKode && (
                          <div className="text-[11px] text-teal-800 font-semibold mt-0.5">
                            Terintegrasi 1 Transaksi dengan Rekening <span className="font-mono">{rekKode}</span>
                          </div>
                        )}
                        {m.alamat && (
                          <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-xs">
                            {m.alamat}
                          </div>
                        )}
                      </td>

                      {/* Role & Telepon */}
                      <td className="py-3 px-4">
                        <div className="text-[11px] font-bold">
                          {isAnak ? (
                            <span className="text-teal-900">
                              ANAK PERUSAHAAN &amp; MITRA
                            </span>
                          ) : (
                            <span
                              className={
                                m.role === 'MITRA_TANI'
                                  ? 'text-emerald-800'
                                  : m.role === 'CUSTOMER'
                                  ? 'text-sky-800'
                                  : m.role === 'SUPPLIER'
                                  ? 'text-amber-800'
                                  : m.role === 'KARYAWAN'
                                  ? 'text-indigo-900'
                                  : 'text-purple-800'
                              }
                            >
                              {m.role === 'KARYAWAN' ? 'KARYAWAN (INTERNAL)' : m.role}
                            </span>
                          )}
                        </div>
                        {isAnak && (
                          <div className="text-[10px] text-teal-700 font-medium mt-0.5">
                            Anak Perusahaan PT. Wijaya Agro Perkasa
                          </div>
                        )}
                        {m.role === 'KARYAWAN' && (
                          <div className="text-[10px] text-indigo-700 font-medium mt-0.5">
                            Akun Kasbon Karyawan
                          </div>
                        )}
                        <div className="text-[10px] font-mono text-zinc-600 mt-1">
                          HP: {m.telepon || '-'}
                        </div>
                      </td>

                      {/* Hutang Kita ke Mitra (Titip Hasil Bumi Belum Diambil) */}
                      <td className="py-3 px-4 text-right">
                        {hasTitip ? (
                          <div>
                            <div className="font-mono font-black text-purple-700 text-sm tabular-nums">
                              +{formatRupiah(m.totalHutangTitipPanen)}
                            </div>
                            <div className="text-[10px] text-purple-700">Simpanan panen aktif</div>
                          </div>
                        ) : isAnak && saldoRekAnak < 0 ? (
                          <div>
                            <div className="font-mono font-black text-rose-700 text-sm tabular-nums">
                              +{formatRupiah(Math.abs(saldoRekAnak))}
                            </div>
                            <div className="text-[10px] text-rose-700">Talangan {m.nama} ke PT</div>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-mono">-</span>
                        )}
                      </td>

                      {/* Bon Mitra (Barang + Uang) / Simpanan PT di Anak Perusahaan */}
                      <td className="py-3 px-4 text-right">
                        {hasBon ? (
                          <div>
                            <div className="font-mono font-black text-amber-700 text-sm tabular-nums">
                              -{formatRupiah(m.totalBonMitra)}
                            </div>
                            <div className="text-[9px] text-zinc-500 mt-0.5 flex justify-end gap-1.5">
                              {m.totalKasbonBarang > 0 && (
                                <span title="Kasbon Barang Saprotan Toko">
                                  Barang: <strong>{formatRupiah(m.totalKasbonBarang)}</strong>
                                </span>
                              )}
                              {m.totalKasbonUang > 0 && (
                                <span title="Kasbon Pinjaman Uang Tunai" className="text-rose-600">
                                  Uang: <strong>{formatRupiah(m.totalKasbonUang)}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        ) : isAnak && saldoRekAnak > 0 ? (
                          <div>
                            <div className="font-mono font-black text-teal-800 text-sm tabular-nums">
                              {formatRupiah(saldoRekAnak)}
                            </div>
                            <div className="text-[10px] text-teal-700">
                              Dana PT tersimpan di {rekKode}
                            </div>
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-medium font-mono">Rp 0 (Lunas)</span>
                        )}
                      </td>

                      {/* Posisi Bersih (Net Saldo) */}
                      <td className="py-3 px-4 text-center">
                        {isAnak ? (
                          <div className="space-y-0.5">
                            <div className="text-[10px] font-bold text-teal-900">
                              Saldo {rekKode}:{' '}
                              <span className="font-mono tabular-nums">{formatRupiah(saldoRekAnak)}</span>
                            </div>
                            <div className="text-[10px] text-zinc-600">
                              {posisiTerpadu > 0
                                ? `PT Berhutang ${formatRupiah(posisiTerpadu)}`
                                : posisiTerpadu < 0
                                ? `Dana PT di ${m.nama} ${formatRupiah(Math.abs(posisiTerpadu))}`
                                : 'Impas Terpadu (Rp 0)'}
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.posisiStatus === 'KITA_BERHUTANG' && (
                              <div className="inline-block p-1.5 rounded-lg bg-purple-50 border border-purple-200 text-center">
                                <span className="text-[9px] font-bold text-purple-900 uppercase block">
                                  KITA BERHUTANG
                                </span>
                                <span className="font-mono font-bold text-purple-800 text-xs tabular-nums">
                                  {formatRupiah(m.saldoBersih)}
                                </span>
                              </div>
                            )}

                            {m.posisiStatus === 'MITRA_BERHUTANG' && (
                              <div className="inline-block p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-center">
                                <span className="text-[9px] font-bold text-amber-900 uppercase block">
                                  MITRA BERHUTANG
                                </span>
                                <span className="font-mono font-bold text-amber-800 text-xs tabular-nums">
                                  {formatRupiah(Math.abs(m.saldoBersih))}
                                </span>
                              </div>
                            )}

                            {m.posisiStatus === 'LUNAS_IMPAS' && (
                              <span className="text-[11px] font-bold text-emerald-800">
                                IMPAS / LUNAS
                              </span>
                            )}
                          </>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-semibold ${
                            m.status === 'AKTIF' ? 'text-emerald-800' : 'text-rose-800'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1.5">
                          {isAnak && rekeningList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setAnakPerusahaanRekKode(rekKode || 'REK-DPPARABO')}
                              className="flex items-center space-x-1 px-2.5 py-1.5 text-[10px] font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors shadow-2xs cursor-pointer"
                              title="Simpan atau tarik dana 1 transaksi terpadu dengan Master Rekening"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>Simpan / Tarik</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setNotaLaluSelectedMitraId(m.id);
                              setNotaLaluModalOpen(true);
                            }}
                            className="flex items-center space-x-1 px-2 py-1.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-300 transition-colors shadow-2xs cursor-pointer"
                            title="Input Nota Lalu (Piutang Bon Barang / Titip Panen Manual)"
                          >
                            <FileText className="w-3 h-3 text-amber-600" />
                            <span>+ Nota Lalu</span>
                          </button>

                          <button
                            onClick={() => {
                              setPinjamUangSelectedMitraId(m.id);
                              setPinjamUangModalOpen(true);
                            }}
                            className="flex items-center space-x-1 px-2 py-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-300 transition-colors shadow-2xs cursor-pointer"
                            title="Pinjam Uang dari PT ke Mitra Ini (Otomatis Masuk Saldo Titip Mitra)"
                          >
                            <HandCoins className="w-3 h-3 text-emerald-600" />
                            <span>+ Pinjam Uang</span>
                          </button>

                          <button
                            onClick={() => onOpenStatement(m.id)}
                            className="flex items-center space-x-1 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                            title="Buka Rekening Koran & Download PDF"
                          >
                            <FileText className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Rekening Koran</span>
                          </button>

                          <button
                            onClick={() => openEdit(m)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                            title="Edit Data Mitra"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Mitra (Scrollable Up/Down & Left/Right) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 p-3 sm:p-4 overflow-y-auto overflow-x-auto flex items-start sm:items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[92vh] flex flex-col border border-zinc-200">
            <div className="p-4 bg-sky-700 text-white font-bold text-sm flex justify-between items-center rounded-t-2xl shrink-0">
              <span>Tambah Mitra Baru</span>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-sky-200 hover:text-white cursor-pointer px-1"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={handleCreate}
              className="p-5 sm:p-6 space-y-3.5 text-xs flex-1 overflow-y-auto overflow-x-auto overscroll-contain"
            >
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium">
                  {errorMsg}
                </div>
              )}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Kode Mitra (Opsional, contoh: BUDI02)
                </label>
                <input
                  type="text"
                  placeholder="Otomatis jika dikosongkan"
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Mitra <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nama lengkap petani atau kios dagang"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600"
                />

                {/* Advanced Fuzzy Name Suggestion & Anti-Duplicate Warning */}
                <FuzzyNameWarningCard
                  inputName={formNama}
                  matches={similarMitrasInAdd}
                  contextLabel="Mitra Terdaftar"
                  theme="light"
                  isDismissed={isCurrentAddWarningDismissed}
                  onDismissDifferentPerson={() => setDismissedAddWarning(formNama.trim())}
                  onSelectRegistered={(m) => {
                    setShowAddModal(false);
                    onOpenStatement(m.id);
                  }}
                  onApplyCorrectedName={(corrected) => {
                    setFormNama(corrected);
                  }}
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Role / Klasifikasi Mitra <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 font-semibold"
                >
                  <option value="MITRA_TANI">MITRA_TANI (Petani Binaan / Pemasok Komoditas)</option>
                  <option value="CUSTOMER">CUSTOMER (Pembeli Sarana Produksi / Saprotan)</option>
                  <option value="SUPPLIER">SUPPLIER (Pemasok Komoditas / Barang)</option>
                  <option value="ANAK_PERUSAHAAN">ANAK_PERUSAHAAN (Anak Perusahaan PT &amp; Rekening Terpadu)</option>
                  <option value="ALL">ALL (Pelanggan Sekaligus Pemasok)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nomor Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="0812xxxxxxxx"
                  value={formTelepon}
                  onChange={(e) => setFormTelepon(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Alamat Domisili / Lahan
                </label>
                <textarea
                  rows={2}
                  placeholder="Desa, Kecamatan, Kabupaten..."
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  placeholder="Luas lahan atau komoditas utama binaan"
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-sky-700 text-white font-semibold rounded-lg hover:bg-sky-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Mitra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Mitra (Scrollable Up/Down & Left/Right) */}
      {editingMitra && (
        <div className="fixed inset-0 z-50 bg-black/60 p-3 sm:p-4 overflow-y-auto overflow-x-auto flex items-start sm:items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-auto max-h-[92vh] flex flex-col border border-zinc-200">
            <div className="p-4 bg-sky-700 text-white font-bold text-sm flex justify-between items-center rounded-t-2xl shrink-0">
              <span className="truncate pr-2">Edit Mitra: {editingMitra.nama}</span>
              <button
                type="button"
                onClick={() => setEditingMitra(null)}
                className="text-sky-200 hover:text-white cursor-pointer px-1 shrink-0"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={handleUpdate}
              className="p-5 sm:p-6 space-y-3.5 text-xs flex-1 overflow-y-auto overflow-x-auto overscroll-contain"
            >
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nama Mitra</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 font-semibold"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Role / Klasifikasi</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600"
                >
                  <option value="MITRA_TANI">MITRA_TANI</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                  <option value="SUPPLIER">SUPPLIER</option>
                  <option value="ANAK_PERUSAHAAN">ANAK_PERUSAHAAN</option>
                  <option value="ALL">ALL</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Status Keaktifan</label>
                <select
                  value={editingMitra.status}
                  onChange={(e) =>
                    setEditingMitra({ ...editingMitra, status: e.target.value as any })
                  }
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 font-semibold"
                >
                  <option value="AKTIF">AKTIF</option>
                  <option value="NONAKTIF">NONAKTIF</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Telepon</label>
                <input
                  type="text"
                  value={formTelepon}
                  onChange={(e) => setFormTelepon(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Alamat</label>
                <textarea
                  rows={2}
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingMitra(null)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-sky-700 text-white font-semibold rounded-lg hover:bg-sky-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Perbarui Mitra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Input Nota Lalu Modal */}
      <InputNotaLaluModal
        isOpen={notaLaluModalOpen}
        onClose={() => {
          setNotaLaluModalOpen(false);
          setNotaLaluSelectedMitraId(undefined);
        }}
        mitraList={mitraList}
        preselectedMitraId={notaLaluSelectedMitraId}
        onSuccess={() => {
          handleRefreshAll();
        }}
      />

      {/* Pinjam Uang dari PT ke Mitra Modal (Masuk Saldo Titip) */}
      <ModalPinjamUangMitra
        isOpen={pinjamUangModalOpen}
        onClose={() => {
          setPinjamUangModalOpen(false);
          setPinjamUangSelectedMitraId(undefined);
        }}
        mitraList={mitraList}
        preselectedMitraId={pinjamUangSelectedMitraId}
        onSuccess={(result) => {
          setSuccessMsg(`✅ Pinjaman uang dari PT ke mitra "${result.mitraNama}" sebesar ${formatRupiah(result.nominal)} berhasil dicatat ke ${result.rekeningNama} dan otomatis masuk Saldo Titip Mitra!`);
          setTimeout(() => setSuccessMsg(''), 8000);
          handleRefreshAll();
        }}
      />

      {/* Bersihkan Bukti Nota Lalu Modal */}
      <ModalBersihkanNotaLalu
        isOpen={bersihkanNotaModalOpen}
        onClose={() => setBersihkanNotaModalOpen(false)}
        mitraList={mitraList}
        onSuccess={(res) => {
          setSuccessMsg(`✅ ${res.message}`);
          setTimeout(() => setSuccessMsg(''), 8000);
          handleRefreshAll();
        }}
      />

      {/* Modal Transaksi Terpadu Anak Perusahaan & Mitra (1 Transaksi) */}
      <ModalTransaksiAnakPerusahaan
        isOpen={Boolean(anakPerusahaanRekKode)}
        onClose={() => setAnakPerusahaanRekKode(null)}
        rekeningList={rekeningList}
        targetRekeningKode={anakPerusahaanRekKode || 'REK-DPPARABO'}
        onSuccess={(receipt) => {
          setSuccessMsg('Transaksi terpadu Anak Perusahaan & Mitra berhasil disimpan sebagai 1 transaksi!');
          setTimeout(() => setSuccessMsg(''), 8000);
          handleRefreshAll();
          if (receipt && onSuccessReceipt) {
            onSuccessReceipt(receipt);
          }
        }}
      />
    </div>
  );
};
