import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  Search,
  User,
  Calendar,
  Wrench,
  FileText,
  Pencil,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Phone,
  ShieldCheck,
  Car,
  Cog,
  Hash,
  Building2,
  Eye,
} from 'lucide-react';
import {
  ItemInventaris,
  KategoriInventaris,
  KondisiInventaris,
  Karyawan,
  TransaksiPengeluaran,
  DAFTAR_DIVISI,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

interface Props {
  inventarisList: ItemInventaris[];
  karyawanList: Karyawan[];
  pengeluaranList: TransaksiPengeluaran[];
  onRefresh: () => void;
  onNavigateToPengeluaran?: (item: ItemInventaris) => void;
}

export const KATEGORI_INVENTARIS_LABELS: Record<KategoriInventaris, string> = {
  TRUCK_ANGKUTAN: 'Truck & Dump Angkutan',
  PICKUP_L300: 'Pickup / L300',
  MOBIL_OPERASIONAL: 'Mobil Operasional',
  ALAT_BERAT: 'Alat Berat / Excavator',
  MOTOR: 'Sepeda Motor',
  MESIN_GUDANG: 'Mesin & Alat Gudang',
  LAINNYA: 'Inventaris Lainnya',
};

export const KONDISI_INVENTARIS_LABELS: Record<KondisiInventaris, string> = {
  BAIK: 'Siap Jalan / Baik',
  SERVIS_RINGAN: 'Perlu Servis Ringan',
  PERBAIKAN_BENGKEL: 'Sedang di Bengkel',
  NONAKTIF: 'Nonaktif / Rusak',
};

function parseFlexibleDate(raw?: string): Date | null {
  if (!raw || raw === '-') return null;
  const s = raw.trim();
  if (!s) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(s)) {
    const [d, m, y] = s.split(/[/-]/).map(Number);
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function toInputDateValue(raw?: string): string {
  const dt = parseFlexibleDate(raw);
  if (!dt) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromInputDateToIndo(isoDate: string): string {
  if (!isoDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }
  return isoDate;
}

export function getPajakStatusInfo(tanggalPajak?: string): {
  label: string;
  daysLeft: number | null;
  tone: 'ok' | 'warn' | 'danger' | 'empty';
} {
  const dt = parseFlexibleDate(tanggalPajak);
  if (!dt) {
    return { label: 'Belum diisi', daysLeft: null, tone: 'empty' };
  }
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMidnight = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((targetMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));

  const dStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  if (diffDays < 0) {
    return {
      label: `${dStr} · Lewat ${Math.abs(diffDays)} hari`,
      daysLeft: diffDays,
      tone: 'danger',
    };
  }
  if (diffDays === 0) {
    return {
      label: `${dStr} · Jatuh tempo hari ini`,
      daysLeft: 0,
      tone: 'danger',
    };
  }
  if (diffDays <= 30) {
    return {
      label: `${dStr} · ${diffDays} hari lagi`,
      daysLeft: diffDays,
      tone: 'warn',
    };
  }
  return {
    label: `${dStr} · ${diffDays} hari lagi`,
    daysLeft: diffDays,
    tone: 'ok',
  };
}

export function matchPengeluaranForInventaris(
  exp: TransaksiPengeluaran,
  item: ItemInventaris
): boolean {
  if (exp.idInventaris && exp.idInventaris === item.id) return true;
  const penerimaNorm = (exp.penerima || '').replace(/\s+/g, '').toUpperCase();
  if (!penerimaNorm) return false;
  const platNorm = (item.nomorPlat || '').replace(/\s+/g, '').toUpperCase();
  if (platNorm && platNorm !== '-' && platNorm.length >= 4 && penerimaNorm.includes(platNorm)) {
    return true;
  }
  const namaNorm = (item.namaItem || '').trim().toUpperCase();
  if (namaNorm.length >= 5 && (exp.penerima || '').toUpperCase().includes(namaNorm)) {
    return true;
  }
  return false;
}

export const MasterInventarisView: React.FC<Props> = ({
  inventarisList,
  karyawanList,
  pengeluaranList,
  onRefresh,
  onNavigateToPengeluaran,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKategori, setFilterKategori] = useState<string>('ALL');

  // Detail Profile Drawer/Modal
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Add / Edit Form Modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemInventaris | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [bannerSuccess, setBannerSuccess] = useState('');

  // Delete confirmation state
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ItemInventaris | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Photo preview state
  const [previewPhoto, setPreviewPhoto] = useState<{
    imageUrl: string;
    title: string;
    keterangan?: string;
  } | null>(null);

  // Form fields
  const [kategori, setKategori] = useState<KategoriInventaris>('TRUCK_ANGKUTAN');
  const [namaItem, setNamaItem] = useState('');
  const [nomorPlat, setNomorPlat] = useState('');
  const [merkTipe, setMerkTipe] = useState('');
  const [tahunKeluaran, setTahunKeluaran] = useState('');
  const [warna, setWarna] = useState('');
  const [driverMode, setDriverMode] = useState<'KARYAWAN' | 'MANUAL'>('MANUAL');
  const [idKaryawanDriver, setIdKaryawanDriver] = useState('');
  const [driverPenanggungJawab, setDriverPenanggungJawab] = useState('');
  const [teleponDriver, setTeleponDriver] = useState('');
  const [divisi, setDivisi] = useState<string>('Wijaya Transport');
  const [tanggalPajakTahunanInput, setTanggalPajakTahunanInput] = useState('');
  const [tanggalPajakLimaTahunanInput, setTanggalPajakLimaTahunanInput] = useState('');
  const [tanggalKirInput, setTanggalKirInput] = useState('');
  const [kondisi, setKondisi] = useState<KondisiInventaris>('BAIK');
  const [nomorRangka, setNomorRangka] = useState('');
  const [nomorMesin, setNomorMesin] = useState('');
  const [nilaiPerolehan, setNilaiPerolehan] = useState('');
  const [fotoItem, setFotoItem] = useState('');
  const [fotoStnk, setFotoStnk] = useState('');
  const [catatan, setCatatan] = useState('');

  const activeKaryawan = useMemo(
    () => karyawanList.filter((k) => k.status === 'AKTIF'),
    [karyawanList]
  );

  const selectedProfile = useMemo(
    () => inventarisList.find((i) => i.id === selectedProfileId) || null,
    [inventarisList, selectedProfileId]
  );

  // Compute expense stats per inventaris item
  const expenseMap = useMemo(() => {
    const map = new Map<string, { totalNominal: number; count: number; items: TransaksiPengeluaran[] }>();
    for (const inv of inventarisList) {
      const matched = pengeluaranList.filter((exp) => matchPengeluaranForInventaris(exp, inv));
      const totalNominal = matched.reduce((s, e) => s + (e.nominal || 0), 0);
      map.set(inv.id, { totalNominal, count: matched.length, items: matched });
    }
    return map;
  }, [inventarisList, pengeluaranList]);

  const kpiStats = useMemo(() => {
    const totalUnit = inventarisList.length;
    const siapJalan = inventarisList.filter((i) => i.status === 'AKTIF' && i.kondisi === 'BAIK').length;
    const pajakWarning = inventarisList.filter((i) => {
      const info = getPajakStatusInfo(i.tanggalPajakTahunan);
      return info.tone === 'danger' || info.tone === 'warn';
    }).length;
    let totalBiayaArmada = 0;
    for (const v of expenseMap.values()) {
      totalBiayaArmada += v.totalNominal;
    }
    return { totalUnit, siapJalan, pajakWarning, totalBiayaArmada };
  }, [inventarisList, expenseMap]);

  const filteredList = useMemo(() => {
    return inventarisList.filter((item) => {
      if (filterKategori !== 'ALL' && item.kategori !== filterKategori) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (item.namaItem || '').toLowerCase().includes(q) ||
          (item.nomorPlat || '').toLowerCase().includes(q) ||
          (item.driverPenanggungJawab || '').toLowerCase().includes(q) ||
          (item.merkTipe || '').toLowerCase().includes(q) ||
          (item.tahunKeluaran || '').toLowerCase().includes(q) ||
          (item.kode || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [inventarisList, filterKategori, searchQuery]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormError('');
    setKategori('TRUCK_ANGKUTAN');
    setNamaItem('');
    setNomorPlat('');
    setMerkTipe('');
    setTahunKeluaran(String(new Date().getFullYear()));
    setWarna('');
    setDriverMode(activeKaryawan.length > 0 ? 'KARYAWAN' : 'MANUAL');
    setIdKaryawanDriver('');
    setDriverPenanggungJawab('');
    setTeleponDriver('');
    setDivisi('Wijaya Transport');
    setTanggalPajakTahunanInput('');
    setTanggalPajakLimaTahunanInput('');
    setTanggalKirInput('');
    setKondisi('BAIK');
    setNomorRangka('');
    setNomorMesin('');
    setNilaiPerolehan('');
    setFotoItem('');
    setFotoStnk('');
    setCatatan('');
    setShowFormModal(true);
  };

  const openEditModal = (item: ItemInventaris) => {
    setEditingItem(item);
    setFormError('');
    setKategori(item.kategori || 'TRUCK_ANGKUTAN');
    setNamaItem(item.namaItem || '');
    setNomorPlat(item.nomorPlat && item.nomorPlat !== '-' ? item.nomorPlat : '');
    setMerkTipe(item.merkTipe && item.merkTipe !== '-' ? item.merkTipe : '');
    setTahunKeluaran(item.tahunKeluaran && item.tahunKeluaran !== '-' ? item.tahunKeluaran : '');
    setWarna(item.warna || '');
    if (item.idKaryawanDriver && activeKaryawan.some((k) => k.id === item.idKaryawanDriver)) {
      setDriverMode('KARYAWAN');
      setIdKaryawanDriver(item.idKaryawanDriver);
    } else {
      setDriverMode('MANUAL');
      setIdKaryawanDriver('');
    }
    setDriverPenanggungJawab(
      item.driverPenanggungJawab && item.driverPenanggungJawab !== '-' ? item.driverPenanggungJawab : ''
    );
    setTeleponDriver(item.teleponDriver || '');
    setDivisi(item.divisi || 'Wijaya Transport');
    setTanggalPajakTahunanInput(toInputDateValue(item.tanggalPajakTahunan));
    setTanggalPajakLimaTahunanInput(toInputDateValue(item.tanggalPajakLimaTahunan));
    setTanggalKirInput(toInputDateValue(item.tanggalKir));
    setKondisi(item.kondisi || 'BAIK');
    setNomorRangka(item.nomorRangka || '');
    setNomorMesin(item.nomorMesin || '');
    setNilaiPerolehan(item.nilaiPerolehan ? String(item.nilaiPerolehan) : '');
    setFotoItem(item.fotoItem || '');
    setFotoStnk(item.fotoStnk || '');
    setCatatan(item.catatan || '');
    setShowFormModal(true);
  };

  const handleSelectKaryawanDriver = (kryId: string) => {
    setIdKaryawanDriver(kryId);
    const found = activeKaryawan.find((k) => k.id === kryId);
    if (found) {
      setDriverPenanggungJawab(found.nama);
      setTeleponDriver(found.telepon && found.telepon !== '-' ? found.telepon : '');
    } else {
      setDriverPenanggungJawab('');
      setTeleponDriver('');
    }
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!namaItem.trim()) {
      setFormError('Nama kendaraan / item inventaris wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        namaItem: namaItem.trim(),
        kategori,
        nomorPlat: nomorPlat.trim().toUpperCase() || '-',
        merkTipe: merkTipe.trim() || '-',
        tahunKeluaran: tahunKeluaran.trim() || '-',
        warna: warna.trim(),
        driverPenanggungJawab: driverPenanggungJawab.trim() || '-',
        idKaryawanDriver: driverMode === 'KARYAWAN' && idKaryawanDriver ? idKaryawanDriver : undefined,
        teleponDriver: teleponDriver.trim(),
        divisi: divisi.trim() || 'Wijaya Transport',
        tanggalPajakTahunan: fromInputDateToIndo(tanggalPajakTahunanInput),
        tanggalPajakLimaTahunan: fromInputDateToIndo(tanggalPajakLimaTahunanInput),
        tanggalKir: fromInputDateToIndo(tanggalKirInput),
        kondisi,
        nomorRangka: nomorRangka.trim().toUpperCase(),
        nomorMesin: nomorMesin.trim().toUpperCase(),
        nilaiPerolehan: Number(nilaiPerolehan) || 0,
        fotoItem: fotoItem || undefined,
        fotoStnk: fotoStnk || undefined,
        catatan: catatan.trim(),
      };

      if (editingItem) {
        const updated = await api.updateInventaris(editingItem.id, payload);
        setBannerSuccess(`Profil inventaris "${updated.namaItem}" (${updated.nomorPlat}) berhasil diperbarui.`);
      } else {
        const created = await api.createInventaris(payload);
        setBannerSuccess(`Unit inventaris baru "${created.namaItem}" (${created.nomorPlat}) berhasil ditambahkan.`);
        setSelectedProfileId(created.id);
      }

      setShowFormModal(false);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data inventaris');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmItem) return;
    setDeleting(true);
    try {
      await api.deleteInventaris(deleteConfirmItem.id);
      if (selectedProfileId === deleteConfirmItem.id) {
        setSelectedProfileId(null);
      }
      setBannerSuccess(`Item inventaris "${deleteConfirmItem.namaItem}" telah dihapus.`);
      setDeleteConfirmItem(null);
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menghapus inventaris');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Inventaris &amp; Armada Kendaraan PT
              </h1>
              <p className="text-xs text-slate-500">
                Database kendaraan operasional, nomor plat, penanggung jawab driver, jadwal pajak STNK/KIR, serta riwayat biaya per unit
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Item Inventaris Baru</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{bannerSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerSuccess('')}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
            <span>Total Unit Inventaris</span>
            <Truck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
            {kpiStats.totalUnit} <span className="text-xs font-sans font-normal text-slate-500">Unit</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Tersinkron langsung ke opsi Menu Pengeluaran
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
            <span>Kondisi Siap Jalan</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {kpiStats.siapJalan} <span className="text-xs font-sans font-normal text-slate-500">Unit Aktif</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Kondisi prima &amp; siap operasional lapangan
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
            <span>Pajak Dekat / Lewat Tempo</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums ${
              kpiStats.pajakWarning > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {kpiStats.pajakWarning} <span className="text-xs font-sans font-normal text-slate-500">Unit</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Peringatan otomatis H-30 sebelum jatuh tempo
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5">
            <span>Total Biaya &amp; Perawatan</span>
            <Wrench className="w-4 h-4 text-rose-600" />
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums text-slate-900 truncate"
            title={formatRupiah(kpiStats.totalBiayaArmada)}
          >
            {formatRupiahSingkat(kpiStats.totalBiayaArmada)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Akumulasi dandan, BBM &amp; operasional armada
          </p>
        </div>
      </div>

      {/* Search & Category Filter */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari Nomor Plat (mis. BE 8206 AMN), nama mobil/truck, nama driver, atau tahun..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterKategori}
            onChange={(e) => setFilterKategori(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Semua Kategori ({inventarisList.length})</option>
            {(Object.keys(KATEGORI_INVENTARIS_LABELS) as KategoriInventaris[]).map((kat) => (
              <option key={kat} value={kat}>
                {KATEGORI_INVENTARIS_LABELS[kat]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content: Empty State or Cards Grid */}
      {inventarisList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
            <Truck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              Belum Ada Kendaraan / Item Inventaris PT
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              Tambahkan kendaraan operasional PT (Truck, Dump Dutro, L300, Mobil, Motor, atau Alat Berat) lengkap dengan Nomor Plat, Nama Driver, Tahun Keluaran, dan Tanggal Pajak. Semua item yang ditambahkan otomatis muncul sebagai pilihan di Menu Pengeluaran.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kendaraan / Item Pertama</span>
          </button>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-500">
          Tidak ada unit inventaris yang cocok dengan pencarian &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredList.map((item) => {
            const pajakInfo = getPajakStatusInfo(item.tanggalPajakTahunan);
            const expStat = expenseMap.get(item.id) || { totalNominal: 0, count: 0, items: [] };

            return (
              <div
                key={item.id}
                onClick={() => setSelectedProfileId(item.id)}
                className="bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-sm transition-all p-5 flex flex-col justify-between gap-4 cursor-pointer group"
              >
                <div className="space-y-3.5">
                  {/* Top Row: License Plate + Condition */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-slate-900 text-white font-mono text-xs font-bold tracking-wider">
                        {item.nomorPlat && item.nomorPlat !== '-' ? item.nomorPlat : item.kode}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">{item.kode}</span>
                    </div>

                    <span
                      className={`text-[11px] font-semibold ${
                        item.kondisi === 'BAIK'
                          ? 'text-emerald-700'
                          : item.kondisi === 'SERVIS_RINGAN'
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {KONDISI_INVENTARIS_LABELS[item.kondisi] || item.kondisi}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-slate-700 transition-colors">
                      {item.namaItem}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {KATEGORI_INVENTARIS_LABELS[item.kategori] || item.kategori}
                      {item.merkTipe && item.merkTipe !== '-' ? ` · ${item.merkTipe}` : ''}
                      {item.tahunKeluaran && item.tahunKeluaran !== '-'
                        ? ` · Keluaran Thn ${item.tahunKeluaran}`
                        : ''}
                    </p>
                  </div>

                  {/* Structured Key-Value Profile Preview */}
                  <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>Driver / PJ</span>
                      </span>
                      <span className="font-semibold text-slate-800 truncate">
                        {item.driverPenanggungJawab && item.driverPenanggungJawab !== '-'
                          ? item.driverPenanggungJawab
                          : 'Belum ditentukan'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Pajak STNK</span>
                      </span>
                      <span
                        className={`font-mono text-[11px] font-semibold ${
                          pajakInfo.tone === 'danger'
                            ? 'text-rose-700'
                            : pajakInfo.tone === 'warn'
                            ? 'text-amber-700'
                            : pajakInfo.tone === 'ok'
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {pajakInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Divisi</span>
                      </span>
                      <span className="text-slate-700 font-medium truncate">{item.divisi}</span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Expense Summary + Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-500">
                    Biaya tercatat:{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {formatRupiahSingkat(expStat.totalNominal)}
                    </span>{' '}
                    ({expStat.count}x)
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setSelectedProfileId(item.id)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Profil</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(item)}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer"
                      title="Edit Profil Item"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL PROFIL LENGKAP ITEM INVENTARIS                                  */}
      {/* ===================================================================== */}
      {selectedProfile && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Profile Top Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/70">
              <div className="flex items-start gap-4 min-w-0">
                {selectedProfile.fotoItem ? (
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewPhoto({
                        imageUrl: selectedProfile.fotoItem!,
                        title: `Foto Unit: ${selectedProfile.namaItem} (${selectedProfile.nomorPlat})`,
                      })
                    }
                    className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0 cursor-pointer"
                  >
                    <img
                      src={selectedProfile.fotoItem}
                      alt={selectedProfile.namaItem}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                    <Truck className="w-7 h-7" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold tracking-wider">
                      {selectedProfile.nomorPlat && selectedProfile.nomorPlat !== '-'
                        ? selectedProfile.nomorPlat
                        : selectedProfile.kode}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{selectedProfile.kode}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs font-semibold text-slate-700">
                      {KONDISI_INVENTARIS_LABELS[selectedProfile.kondisi] || selectedProfile.kondisi}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1 truncate">
                    {selectedProfile.namaItem}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {KATEGORI_INVENTARIS_LABELS[selectedProfile.kategori]} · Divisi {selectedProfile.divisi}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedProfileId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Grid Detail Profil Kendaraan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Box 1: Spesifikasi & Tahun Keluaran */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5" />
                    <span>Identitas &amp; Spesifikasi Unit</span>
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Nomor Plat / Polisi</span>
                      <span className="font-mono font-bold text-slate-900">
                        {selectedProfile.nomorPlat || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Merk / Tipe</span>
                      <span className="font-semibold text-slate-800">
                        {selectedProfile.merkTipe || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Tahun Keluaran</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {selectedProfile.tahunKeluaran && selectedProfile.tahunKeluaran !== '-'
                          ? `Tahun ${selectedProfile.tahunKeluaran}`
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Warna</span>
                      <span className="font-medium text-slate-800">{selectedProfile.warna || '-'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">No. Rangka / Mesin</span>
                      <span className="font-mono text-[11px] text-slate-700">
                        {selectedProfile.nomorRangka || '-'} / {selectedProfile.nomorMesin || '-'}
                      </span>
                    </div>
                    {Number(selectedProfile.nilaiPerolehan) > 0 && (
                      <div className="flex justify-between py-1">
                        <span className="text-slate-500">Nilai Perolehan Aset</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatRupiah(selectedProfile.nilaiPerolehan || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Box 2: Driver & Jadwal Pajak */}
                <div className="rounded-xl border border-slate-200 p-4 space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Driver &amp; Jadwal Pajak Kendaraan</span>
                  </h3>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Driver / Sopir PJ</span>
                      <span className="font-bold text-slate-900">
                        {selectedProfile.driverPenanggungJawab || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Kontak Driver</span>
                      <span className="font-mono text-slate-800">
                        {selectedProfile.teleponDriver || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Pajak STNK Tahunan</span>
                      {(() => {
                        const info = getPajakStatusInfo(selectedProfile.tanggalPajakTahunan);
                        return (
                          <span
                            className={`font-mono font-semibold ${
                              info.tone === 'danger'
                                ? 'text-rose-700'
                                : info.tone === 'warn'
                                ? 'text-amber-700'
                                : info.tone === 'ok'
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {info.label}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Pajak 5 Tahunan (Plat)</span>
                      <span className="font-mono text-slate-800">
                        {selectedProfile.tanggalPajakLimaTahunan || '-'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Jadwal Uji KIR</span>
                      <span className="font-mono text-slate-800">
                        {selectedProfile.tanggalKir || '-'}
                      </span>
                    </div>
                  </div>

                  {selectedProfile.fotoStnk && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewPhoto({
                          imageUrl: selectedProfile.fotoStnk!,
                          title: `Foto STNK / Dokumen: ${selectedProfile.namaItem} (${selectedProfile.nomorPlat})`,
                        })
                      }
                      className="mt-2 w-full py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Lihat Foto STNK / Dokumen Pajak</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Catatan Unit */}
              {selectedProfile.catatan && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-700">
                  <span className="font-bold text-slate-900 block mb-0.5">Catatan Kondisi / Riwayat Oli &amp; Ban:</span>
                  {selectedProfile.catatan}
                </div>
              )}

              {/* Riwayat Pengeluaran / Perawatan Unit Ini */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Riwayat Pengeluaran, BBM &amp; Dandan Unit Ini
                    </h3>
                    <p className="text-xs text-slate-500">
                      Otomatis terhubung setiap kali unit ini dipilih pada Menu Pengeluaran
                    </p>
                  </div>
                  {onNavigateToPengeluaran && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedProfile;
                        setSelectedProfileId(null);
                        onNavigateToPengeluaran(target);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span>Catat Pengeluaran Unit Ini</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {(() => {
                  const stat = expenseMap.get(selectedProfile.id) || {
                    totalNominal: 0,
                    count: 0,
                    items: [],
                  };
                  if (stat.items.length === 0) {
                    return (
                      <div className="rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500">
                        Belum ada catatan biaya dandan, BBM, atau operasional untuk unit ini di Menu Pengeluaran.
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-medium">
                          Total {stat.count} transaksi tercatat
                        </span>
                        <span className="font-mono font-bold text-rose-700">
                          Total: {formatRupiah(stat.totalNominal)}
                        </span>
                      </div>
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {stat.items.map((exp) => (
                          <div
                            key={exp.idTransaksi}
                            className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/70"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 truncate">
                                {exp.keterangan}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {exp.tanggal} · {exp.kategori} · Rek {exp.rekeningSumber}
                              </div>
                            </div>
                            <div className="font-mono font-bold text-rose-700 shrink-0 tabular-nums">
                              {formatRupiah(exp.nominal)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Profile Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(selectedProfile)}
                className="px-3 py-2 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Unit</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProfileId(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => openEditModal(selectedProfile)}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Profil Item</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL TAMBAH / EDIT PROFIL ITEM INVENTARIS                            */}
      {/* ===================================================================== */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingItem
                    ? `Edit Profil Inventaris — ${editingItem.namaItem}`
                    : 'Tambah Kendaraan / Item Inventaris Baru'}
                </h2>
                <p className="text-xs text-slate-500">
                  Isi detail profil unit (nomor plat, siapa drivernya, kapan pajaknya, dan keluaran tahun berapa)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 overflow-y-auto space-y-5 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Row 1: Kategori & Nama Unit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kategori Inventaris *
                  </label>
                  <select
                    value={kategori}
                    onChange={(e) => setKategori(e.target.value as KategoriInventaris)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  >
                    {(Object.keys(KATEGORI_INVENTARIS_LABELS) as KategoriInventaris[]).map((kat) => (
                      <option key={kat} value={kat}>
                        {KATEGORI_INVENTARIS_LABELS[kat]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Kendaraan / Item *
                  </label>
                  <input
                    type="text"
                    required
                    value={namaItem}
                    onChange={(e) => setNamaItem(e.target.value)}
                    placeholder="Cth: Dump Truck Hino Dutro / Pickup L300"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              </div>

              {/* Row 2: Nomor Plat, Tahun Keluaran, Merk/Tipe */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor Plat / Polisi
                  </label>
                  <input
                    type="text"
                    value={nomorPlat}
                    onChange={(e) => setNomorPlat(e.target.value.toUpperCase())}
                    placeholder="Cth: BE 8206 AMN"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Keluaran Tahun Berapa
                  </label>
                  <input
                    type="number"
                    min="1980"
                    max="2035"
                    value={tahunKeluaran}
                    onChange={(e) => setTahunKeluaran(e.target.value)}
                    placeholder="Cth: 2021"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Merk / Tipe &amp; Warna
                  </label>
                  <input
                    type="text"
                    value={merkTipe}
                    onChange={(e) => setMerkTipe(e.target.value)}
                    placeholder="Cth: Hino 130 HD Kuning"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </div>
              </div>

              {/* Row 3: Siapa Drivernya / Penanggung Jawab */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-bold text-slate-800 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-600" />
                    <span>Siapa Drivernya / Penanggung Jawab Unit</span>
                  </label>
                  {activeKaryawan.length > 0 && (
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setDriverMode('KARYAWAN')}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          driverMode === 'KARYAWAN'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pilih dari Karyawan
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDriverMode('MANUAL');
                          setIdKaryawanDriver('');
                        }}
                        className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                          driverMode === 'MANUAL'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Ketik Nama Manual
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {driverMode === 'KARYAWAN' && activeKaryawan.length > 0 ? (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Pilih Sopir / Karyawan PT
                      </label>
                      <select
                        value={idKaryawanDriver}
                        onChange={(e) => handleSelectKaryawanDriver(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">-- Pilih Nama Karyawan / Driver --</option>
                        {activeKaryawan.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.nama} ({k.jabatan})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Nama Driver / Penanggung Jawab
                      </label>
                      <input
                        type="text"
                        value={driverPenanggungJawab}
                        onChange={(e) => setDriverPenanggungJawab(e.target.value)}
                        placeholder="Cth: Pak Argon / Fahlevi"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      No. HP / WhatsApp Driver
                    </label>
                    <input
                      type="text"
                      value={teleponDriver}
                      onChange={(e) => setTeleponDriver(e.target.value)}
                      placeholder="Cth: 0812-xxxx-xxxx"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Jadwal Pajak & KIR */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <label className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>Jadwal Jatuh Tempo Pajak STNK &amp; KIR</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Pajak STNK Tahunan
                    </label>
                    <input
                      type="date"
                      value={tanggalPajakTahunanInput}
                      onChange={(e) => setTanggalPajakTahunanInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Pajak 5 Tahunan (Ganti Plat)
                    </label>
                    <input
                      type="date"
                      value={tanggalPajakLimaTahunanInput}
                      onChange={(e) => setTanggalPajakLimaTahunanInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Uji KIR Berkala (Truck/Pickup)
                    </label>
                    <input
                      type="date"
                      value={tanggalKirInput}
                      onChange={(e) => setTanggalKirInput(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Row 5: Divisi, Kondisi, No Rangka/Mesin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Divisi Operasional Penempatan
                  </label>
                  <select
                    value={divisi}
                    onChange={(e) => setDivisi(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    {DAFTAR_DIVISI.map((d) => (
                      <option key={d.id} value={d.nama}>
                        {d.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Kondisi Kendaraan Saat Ini
                  </label>
                  <select
                    value={kondisi}
                    onChange={(e) => setKondisi(e.target.value as KondisiInventaris)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    {(Object.keys(KONDISI_INVENTARIS_LABELS) as KondisiInventaris[]).map((k) => (
                      <option key={k} value={k}>
                        {KONDISI_INVENTARIS_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor Rangka (Opsional)
                  </label>
                  <input
                    type="text"
                    value={nomorRangka}
                    onChange={(e) => setNomorRangka(e.target.value.toUpperCase())}
                    placeholder="MHMFE74..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor Mesin (Opsional)
                  </label>
                  <input
                    type="text"
                    value={nomorMesin}
                    onChange={(e) => setNomorMesin(e.target.value.toUpperCase())}
                    placeholder="W04DTR..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nilai Perolehan / Harga Beli (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={nilaiPerolehan}
                    onChange={(e) => setNilaiPerolehan(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Row 6: Foto Unit & Foto STNK */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ImageUploadZone
                  label="Foto Kendaraan / Unit (Opsional)"
                  sublabel="Foto fisik mobil/truck tampak depan beserta plat"
                  value={fotoItem}
                  onChange={setFotoItem}
                />
                <ImageUploadZone
                  label="Foto STNK / Bukti Pajak (Opsional)"
                  sublabel="Simpan foto STNK untuk kemudahan cek pajak"
                  value={fotoStnk}
                  onChange={setFotoStnk}
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Catatan Tambahan (Jadwal Ganti Oli, Ukuran Ban, Riwayat Servis)
                </label>
                <textarea
                  rows={2}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Cth: Ganti oli setiap 5.000 KM, ban belakang baru diganti bulan lalu..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-semibold cursor-pointer"
                >
                  {submitting
                    ? 'Menyimpan...'
                    : editingItem
                    ? 'Simpan Perubahan Profil'
                    : 'Simpan ke Inventaris PT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Hapus Unit Inventaris?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Anda yakin ingin menghapus <strong>{deleteConfirmItem.namaItem}</strong> (
              <span className="font-mono">{deleteConfirmItem.nomorPlat}</span>) dari daftar inventaris PT? Catatan pengeluaran historis yang sudah tersimpan tetap aman.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Unit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <FotoNotaPreviewModal
          isOpen={true}
          onClose={() => setPreviewPhoto(null)}
          imageUrl={previewPhoto.imageUrl}
          title={previewPhoto.title}
          keterangan={previewPhoto.keterangan}
        />
      )}
    </div>
  );
};
