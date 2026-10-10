import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Edit2,
  FileSpreadsheet,
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
} from 'lucide-react';
import { Mitra, RoleMitra, RekapMasterMitraSummary, RekapMitraItem } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah } from '../../utils/format.ts';
import { InputNotaLaluModal } from '../common/InputNotaLaluModal.tsx';
import { FullErpModularDataset, buildModularSpreadsheets } from '../../utils/modularSpreadsheets.ts';
import { syncModularFileDirectly, getAccessToken, googleSignIn } from '../../services/googleSheetsService.ts';
import { HardDrive, ExternalLink } from 'lucide-react';

interface Props {
  mitraList: Mitra[];
  fullErpData?: FullErpModularDataset;
  onRefresh: () => void;
  onOpenStatement: (idMitra: string) => void;
}

type FilterTab = 'ALL' | 'HUTANG_TITIP' | 'BON_AKTIF' | 'MITRA_TANI' | 'CUSTOMER' | 'SUPPLIER';

export const MasterMitraView: React.FC<Props> = ({
  mitraList,
  fullErpData,
  onRefresh,
  onOpenStatement,
}) => {
  const [rekapData, setRekapData] = useState<RekapMasterMitraSummary | null>(null);
  const [loadingRekap, setLoadingRekap] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');

  // Spreadsheet direct sync state
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetSyncFeedback, setSheetSyncFeedback] = useState<{
    success: boolean;
    message: string;
    webViewLink?: string;
  } | null>(null);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMitra, setEditingMitra] = useState<Mitra | null>(null);
  const [notaLaluModalOpen, setNotaLaluModalOpen] = useState(false);
  const [notaLaluSelectedMitraId, setNotaLaluSelectedMitraId] = useState<string | undefined>(undefined);

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

  const handleSyncToSpreadsheet = async () => {
    setIsSyncingSheet(true);
    setSheetSyncFeedback(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signRes = await googleSignIn();
        if (!signRes) throw new Error('Akses Google belum terhubung.');
      }

      const currentErpData: FullErpModularDataset = fullErpData || {
        rekeningList: [],
        mitraList,
        karyawanList: [],
        upahHarianList: [],
        penggajianList: [],
        produkList: [],
        stokList: [],
        stokHasilBumiList: [],
        pembelianList: [],
        pembelianBarangList: [],
        penjualanList: [],
        kasbonUangList: [],
        bayarBonList: [],
        transferList: [],
        auditLogs: [],
      };

      const modularFiles = buildModularSpreadsheets(currentErpData);
      const fileMitra = modularFiles.find((f) => f.id === 'file-mitra');
      if (!fileMitra) throw new Error('Definisi file mitra tidak ditemukan');

      const res = await syncModularFileDirectly(fileMitra);
      setSheetSyncFeedback({
        success: true,
        message: `Database Mitra berhasil disinkronkan ke Spreadsheet (${mitraList.length} Mitra Riil)!`,
        webViewLink: res.webViewLink,
      });
    } catch (err: any) {
      setSheetSyncFeedback({
        success: false,
        message: `Gagal sinkronisasi ke Spreadsheet: ${err.message}`,
      });
    } finally {
      setIsSyncingSheet(false);
    }
  };

  const loadRekap = async () => {
    setLoadingRekap(true);
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
    loadRekap();
  }, [mitraList]);

  const handleRefreshAll = () => {
    onRefresh();
    loadRekap();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
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
    totalHutangTitipPanen: 0,
    totalKasbonBarang: 0,
    totalKasbonUang: 0,
    totalBonMitra: 0,
    saldoBersih: 0,
    posisiStatus: 'LUNAS_IMPAS',
    totalTransaksiCount: 0,
  }));

  // Filtering
  const filteredItems = items.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      item.nama.toLowerCase().includes(q) ||
      item.kode.toLowerCase().includes(q) ||
      item.telepon.toLowerCase().includes(q) ||
      item.alamat.toLowerCase().includes(q);

    if (!matchesSearch) return false;

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
            onClick={handleSyncToSpreadsheet}
            disabled={isSyncingSheet}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Sinkronkan database mitra riil ke Google Spreadsheet di Drive"
          >
            <FileSpreadsheet className={`w-4 h-4 ${isSyncingSheet ? 'animate-spin text-indigo-300' : 'text-emerald-300'}`} />
            <span>{isSyncingSheet ? 'Menyinkronkan...' : '⚡ Sinkronkan ke Spreadsheet'}</span>
          </button>

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

      {/* Feedback Sinkronisasi Spreadsheet */}
      {sheetSyncFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            sheetSyncFeedback.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center space-x-2">
            {sheetSyncFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{sheetSyncFeedback.message}</span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {sheetSyncFeedback.webViewLink && (
              <a
                href={sheetSyncFeedback.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                <span>Buka di Google Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setSheetSyncFeedback(null)}
              className="text-zinc-400 hover:text-zinc-600 cursor-pointer text-xs p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Info Banner: Penyimpanan Bukti Nota Fisik di Google Drive */}
      <div className="p-3 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center space-x-2 text-sky-950">
          <HardDrive className="w-4 h-4 text-sky-600 shrink-0" />
          <span>
            <strong>Penyimpanan Bukti Nota Fisik:</strong> Folder Drive{' '}
            <code className="bg-white px-2 py-0.5 rounded border border-sky-300 font-mono text-[11px] text-sky-900 font-bold">
              NOTA LALU - PT WIJAYA AGRO / PIUTANG NOTA LAMA &amp; HUTANG NOTA LAMA
            </code>
          </span>
        </div>
        <div className="text-[11px] text-sky-700 font-medium">
          Setiap capture nota lama otomatis tersusun rapi per kategori tanpa membuat aplikasi stagnan.
        </div>
      </div>

      {/* Top Rekap Master Mitra KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Card 1: Hutang Kita pada Mitra (Titip Hasil Bumi) */}
        <div className="p-4 bg-white rounded-xl border-2 border-purple-400 shadow-xs space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider flex items-center space-x-1">
              <Wheat className="w-3.5 h-3.5 text-purple-700" />
              <span>HUTANG KITA PADA MITRA</span>
            </span>
            <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200">
              TITIP PANEN
            </span>
          </div>
          <p className="text-xl font-black text-purple-950 font-mono">
            {formatRupiah(rekapData?.totalHutangPerusahaanKeMitra || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Hasil panen petani yang sudah disetor namun <strong>uangnya belum diambil</strong> ({rekapData?.mitraDenganHutangTitipCount || 0} mitra).
          </p>
        </div>

        {/* Card 2: Total Bon Mitra (Piutang Kita ke Mitra) */}
        <div className="p-4 bg-white rounded-xl border-2 border-amber-400 shadow-xs space-y-1.5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center space-x-1">
              <HandCoins className="w-3.5 h-3.5 text-amber-700" />
              <span>TOTAL BON MITRA</span>
            </span>
            <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200">
              PIUTANG KASBON
            </span>
          </div>
          <p className="text-xl font-black text-amber-950 font-mono">
            {formatRupiah(rekapData?.totalBonMitra || 0)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Kewajiban kasbon barang toko + kasbon pinjaman uang ({rekapData?.mitraDenganBonCount || 0} mitra berhutang bon).
          </p>
        </div>

        {/* Card 3: Saldo Bersih Kemitraan (Net Balance) */}
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider flex items-center space-x-1">
              <Scale className="w-3.5 h-3.5 text-zinc-600" />
              <span>POSISI NET KEMITRAAN</span>
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                (rekapData?.saldoBersihKemitraan || 0) >= 0
                  ? 'bg-purple-100 text-purple-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {(rekapData?.saldoBersihKemitraan || 0) >= 0 ? 'NET PERUSAHAAN BERHUTANG' : 'NET MITRA BERHUTANG'}
            </span>
          </div>
          <p
            className={`text-xl font-black font-mono ${
              (rekapData?.saldoBersihKemitraan || 0) >= 0 ? 'text-purple-900' : 'text-amber-900'
            }`}
          >
            {formatRupiah(Math.abs(rekapData?.saldoBersihKemitraan || 0))}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            {(rekapData?.saldoBersihKemitraan || 0) >= 0
              ? 'Saldo simpanan titip hasil bumi petani lebih besar dari total kasbon.'
              : 'Total kasbon mitra melebihi simpanan hasil bumi yang dititipkan.'}
          </p>
        </div>

        {/* Card 4: Total Mitra Aktif */}
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-wider flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-sky-600" />
              <span>JUMLAH MITRA TERDAFTAR</span>
            </span>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
              SINKRON
            </span>
          </div>
          <p className="text-xl font-black text-zinc-900 font-mono">
            {rekapData?.totalMitra || mitraList.length}{' '}
            <span className="text-xs font-normal text-zinc-500">Mitra</span>
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Petani binaan, kios saprotan, dan supplier komoditas di sistem ERP.
          </p>
        </div>
      </div>

      {/* Explanatory Policy Callout */}
      <div className="p-3.5 bg-sky-50/70 border border-sky-200 rounded-xl text-xs text-sky-950 flex items-start space-x-2.5">
        <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <strong className="text-sky-950 font-bold">Sinkronisasi Keuangan Mitra Terpadu:</strong>
          <p className="text-[11px] text-zinc-600">
            Kolom <strong>Hutang Kita pada Mitra</strong> mencatat hasil panen (gabah, jagung, dll) yang diserahkan mitra dengan metode <em>TITIP</em> namun uangnya belum diambil/dicairkan. Sedangkan kolom <strong>Bon Mitra</strong> adalah total kasbon barang saprotan toko dan kasbon pinjaman uang tunai. Saldo selalu terhubung langsung dengan rekening koran masing-masing mitra.
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
            onClick={() => setActiveFilter('HUTANG_TITIP')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'HUTANG_TITIP'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
            }`}
          >
            <Wheat className="w-3.5 h-3.5" />
            <span>Punya Titip Panen / Kita Berhutang ({rekapData?.mitraDenganHutangTitipCount || 0})</span>
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
            <span>Punya Bon Aktif ({rekapData?.mitraDenganBonCount || 0})</span>
          </button>

          <button
            onClick={() => setActiveFilter('MITRA_TANI')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'MITRA_TANI'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Mitra Tani
          </button>

          <button
            onClick={() => setActiveFilter('CUSTOMER')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeFilter === 'CUSTOMER'
                ? 'bg-sky-700 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Customer
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

                  return (
                    <tr key={m.id} className="hover:bg-zinc-50/80 transition-colors">
                      {/* Identity */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                            {m.kode}
                          </span>
                          <span className="font-bold text-zinc-900 text-sm">{m.nama}</span>
                        </div>
                        {m.alamat && (
                          <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-xs">
                            {m.alamat}
                          </div>
                        )}
                      </td>

                      {/* Role & Telepon */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                              m.role === 'MITRA_TANI'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.role === 'CUSTOMER'
                                ? 'bg-sky-100 text-sky-800'
                                : m.role === 'SUPPLIER'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {m.role}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-600 mt-1">
                          HP: {m.telepon || '-'}
                        </div>
                      </td>

                      {/* Hutang Kita ke Mitra (Titip Hasil Bumi Belum Diambil) */}
                      <td className="py-3 px-4 text-right">
                        {hasTitip ? (
                          <div>
                            <div className="font-mono font-black text-purple-700 text-sm">
                              +{formatRupiah(m.totalHutangTitipPanen)}
                            </div>
                            <span className="text-[9px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                              Simpanan panen aktif
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-400 font-mono">-</span>
                        )}
                      </td>

                      {/* Bon Mitra (Barang + Uang) */}
                      <td className="py-3 px-4 text-right">
                        {hasBon ? (
                          <div>
                            <div className="font-mono font-black text-amber-700 text-sm">
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
                        ) : (
                          <span className="text-emerald-700 font-medium font-mono">Rp 0 (Lunas)</span>
                        )}
                      </td>

                      {/* Posisi Bersih (Net Saldo) */}
                      <td className="py-3 px-4 text-center">
                        {m.posisiStatus === 'KITA_BERHUTANG' && (
                          <div className="inline-block p-1.5 rounded-lg bg-purple-50 border border-purple-200 text-center">
                            <span className="text-[9px] font-bold text-purple-900 uppercase block">
                              KITA BERHUTANG
                            </span>
                            <span className="font-mono font-bold text-purple-800 text-xs">
                              {formatRupiah(m.saldoBersih)}
                            </span>
                          </div>
                        )}

                        {m.posisiStatus === 'MITRA_BERHUTANG' && (
                          <div className="inline-block p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-center">
                            <span className="text-[9px] font-bold text-amber-900 uppercase block">
                              MITRA BERHUTANG
                            </span>
                            <span className="font-mono font-bold text-amber-800 text-xs">
                              {formatRupiah(Math.abs(m.saldoBersih))}
                            </span>
                          </div>
                        )}

                        {m.posisiStatus === 'LUNAS_IMPAS' && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                            IMPAS / LUNAS
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            m.status === 'AKTIF'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {m.status}
                        </span>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
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
                            onClick={() => onOpenStatement(m.id)}
                            className="flex items-center space-x-1 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                            title="Buka Rekening Koran & Download PDF"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
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

      {/* Modal Add Mitra */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-sky-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Tambah Mitra Baru</span>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-sky-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-3.5 text-xs">
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

      {/* Modal Edit Mitra */}
      {editingMitra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-sky-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Edit Mitra: {editingMitra.nama}</span>
              <button
                onClick={() => setEditingMitra(null)}
                className="text-sky-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-3.5 text-xs">
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
    </div>
  );
};
