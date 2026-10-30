import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Package,
  Plus,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Search,
  BookOpen,
  Info,
  ChevronDown,
  ChevronUp,
  Tag,
  X,
  RefreshCw,
  Trash2,
  CheckSquare,
  Square,
  FolderEdit,
} from 'lucide-react';
import {
  Produk,
  StokBarang,
  KATEGORI_ALAT_DEFAULT_DESC,
  isKategoriAlatNonStok,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  produkList: Produk[];
  stokList?: StokBarang[];
  onRefresh: () => void;
}

interface KategoriSummaryItem {
  nama: string;
  deskripsi: string;
  jumlahProduk: number;
  isSaved: boolean;
}

function normalizeKategoriKey(raw: string | undefined | null): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase() || 'LAINNYA';
}

function formatKategoriLabel(raw: string | undefined | null): string {
  const norm = normalizeKategoriKey(raw);
  return norm.replace(/_/g, ' ');
}

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  ALAT: KATEGORI_ALAT_DEFAULT_DESC,
  PUPUK: 'Pupuk kimia, organik, dan nutrisi tanaman',
  PESTISIDA: 'Obat pertanian, insektisida, fungisida, dan herbisida',
  BENIH: 'Bibit dan benih tanaman',
  ALAT_PERTANIAN: 'Peralatan, perlengkapan kerja, dan material',
  'ALAT PERTANIAN': 'Peralatan, perlengkapan kerja, dan material',
  BERAS: 'Beras kemasan dan hasil olahan pangan',
  SEMBAKO: 'Bahan pokok dan kebutuhan operasional',
  LAINNYA: 'Kategori umum lainnya',
};

export const MasterProdukView: React.FC<Props> = ({ produkList, stokList = [], onRefresh }) => {
  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduk, setEditingProduk] = useState<Produk | null>(null);
  const [showManageKategoriModal, setShowManageKategoriModal] = useState(false);

  // Saved Categories from Server
  const [serverKategoriList, setServerKategoriList] = useState<KategoriSummaryItem[]>([]);

  // Guide Banner Collapse/Expand
  const [showGuide, setShowGuide] = useState(false);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKategoriFilter, setSelectedKategoriFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'AKTIF' | 'NONAKTIF'>('ALL');

  // Bulk Selection State
  const [selectedKodes, setSelectedKodes] = useState<string[]>([]);
  const [bulkKategoriInput, setBulkKategoriInput] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  // Form State (Used for both Add & Edit)
  const [formKode, setFormKode] = useState('');
  const [formKategori, setFormKategori] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formSatuan, setFormSatuan] = useState('Sak');
  const [formHargaBeli, setFormHargaBeli] = useState('');
  const [formHargaJual, setFormHargaJual] = useState('');
  const [formHargaRekanan, setFormHargaRekanan] = useState('');
  const [formStatus, setFormStatus] = useState<'AKTIF' | 'NONAKTIF'>('AKTIF');
  const [formStokAwal, setFormStokAwal] = useState('0');
  const [formMinimum, setFormMinimum] = useState('10');

  // Manage Kategori Modal States
  const [newKategoriNama, setNewKategoriNama] = useState('');
  const [newKategoriDeskripsi, setNewKategoriDeskripsi] = useState('');
  const [renamingTarget, setRenamingTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameDescValue, setRenameDescValue] = useState('');
  const [deletingTarget, setDeletingTarget] = useState<KategoriSummaryItem | null>(null);
  const [fallbackKategoriOnDelete, setFallbackKategoriOnDelete] = useState('LAINNYA');
  const [kategoriSubmitting, setKategoriSubmitting] = useState(false);
  const [kategoriModalError, setKategoriModalError] = useState('');
  const [kategoriModalSuccess, setKategoriModalSuccess] = useState('');

  // Feedback State
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Preset Satuan (termasuk satuan sewa jasa alat: Jam, Hari, Rit, Trip, Paket)
  const commonSatuanList = [
    'Sak',
    'Kg',
    'Jam',
    'Hari',
    'Rit',
    'Trip',
    'Paket',
    'Kemasan',
    'Botol',
    'Liter',
    'Meter Kubik',
    'Biji/Buah',
    'Drigent',
    'Dus',
    'Pack',
    'Unit',
  ];

  const loadKategoriProduk = useCallback(async () => {
    try {
      const list = await api.getKategoriProduk();
      setServerKategoriList(list);
    } catch {
      // Fallback gracefully to derived categories from produkList
    }
  }, []);

  useEffect(() => {
    loadKategoriProduk();
  }, [loadKategoriProduk, produkList.length]);

  useEffect(() => {
    const onErpUpdated = () => loadKategoriProduk();
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [loadKategoriProduk]);

  // Dynamically merge server-saved categories + categories currently present in produkList
  const allCategories = useMemo<KategoriSummaryItem[]>(() => {
    const map = new Map<string, KategoriSummaryItem>();

    for (const item of serverKategoriList) {
      const key = normalizeKategoriKey(item.nama);
      map.set(key, {
        nama: key,
        deskripsi: item.deskripsi || DEFAULT_DESCRIPTIONS[key] || '',
        jumlahProduk: 0,
        isSaved: item.isSaved,
      });
    }

    for (const p of produkList) {
      const key = normalizeKategoriKey(p.kategori);
      const existing = map.get(key);
      if (existing) {
        existing.jumlahProduk += 1;
      } else {
        map.set(key, {
          nama: key,
          deskripsi: DEFAULT_DESCRIPTIONS[key] || '',
          jumlahProduk: 1,
          isSaved: false,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.jumlahProduk !== a.jumlahProduk) return b.jumlahProduk - a.jumlahProduk;
      return a.nama.localeCompare(b.nama, 'id');
    });
  }, [serverKategoriList, produkList]);

  // Reset filter if active category no longer exists
  useEffect(() => {
    if (
      selectedKategoriFilter !== 'ALL' &&
      !allCategories.some((c) => c.nama === selectedKategoriFilter)
    ) {
      setSelectedKategoriFilter('ALL');
    }
  }, [allCategories, selectedKategoriFilter]);

  // Open Edit Modal with Pre-filled Product Details
  const handleOpenEdit = (p: Produk) => {
    setEditingProduk(p);
    setFormKode(p.kode);
    setFormKategori(formatKategoriLabel(p.kategori));
    setFormNama(p.nama);
    setFormSatuan(p.satuan || 'Sak');
    setFormHargaBeli(p.hargaBeli ? p.hargaBeli.toString() : '0');
    setFormHargaJual(p.hargaJual ? p.hargaJual.toString() : '0');
    setFormHargaRekanan(
      p.hargaKhususRekanan
        ? p.hargaKhususRekanan.toString()
        : p.hargaJual
        ? p.hargaJual.toString()
        : '0'
    );
    setFormStatus(p.status || 'AKTIF');

    const stokItem = stokList.find((s) => s.kode === p.kode);
    setFormMinimum(stokItem?.minimum !== undefined ? stokItem.minimum.toString() : '10');

    setErrorMsg('');
    setSuccessMsg('');
  };

  // Submit Product Updates (Edit)
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduk) return;

    if (!formNama.trim()) {
      setErrorMsg('Nama produk tidak boleh kosong');
      return;
    }
    if (!formKategori.trim()) {
      setErrorMsg('Kategori produk wajib diisi (ketik kategori sendiri atau pilih dari daftar)');
      return;
    }

    const cleanKategori = normalizeKategoriKey(formKategori);
    const isAlatJasa = isKategoriAlatNonStok(cleanKategori);
    const buyPrice = Math.max(0, Number(formHargaBeli) || 0);
    const sellPrice = Math.max(0, Number(formHargaJual) || 0);
    const rekananPrice = formHargaRekanan ? Math.max(0, Number(formHargaRekanan) || 0) : sellPrice;
    const minThreshold = isAlatJasa ? 0 : Math.max(0, Number(formMinimum) || 0);

    if (sellPrice <= 0) {
      setErrorMsg('Harga jual / tarif sewa kasir harus lebih dari Rp 0');
      return;
    }

    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      await api.updateProduk(editingProduk.kode, {
        nama: formNama.trim(),
        kategori: cleanKategori,
        satuan: formSatuan.trim(),
        hargaBeli: buyPrice,
        hargaJual: sellPrice,
        hargaKhususRekanan: rekananPrice,
        status: formStatus,
        minimum: minThreshold,
      });

      setSuccessMsg(
        `Rincian produk "${formNama.trim()}" (${editingProduk.kode}) dengan kategori "${cleanKategori}" berhasil diperbarui.`
      );
      setEditingProduk(null);
      await loadKategoriProduk();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui rincian produk');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit New Product (Add)
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!formKode.trim()) {
      setErrorMsg('Kode produk wajib diisi');
      return;
    }
    if (!formNama.trim()) {
      setErrorMsg('Nama produk wajib diisi');
      return;
    }
    if (!formKategori.trim()) {
      setErrorMsg('Kategori produk wajib diisi (ketik sendiri sesuai data riil atau pilih yang ada)');
      return;
    }

    const cleanKode = formKode.trim().toUpperCase();
    const cleanKategori = normalizeKategoriKey(formKategori);
    const isAlatJasa = isKategoriAlatNonStok(cleanKategori);
    const buyPrice = Math.max(0, Number(formHargaBeli) || 0);
    const rawSellPrice = Math.max(0, Number(formHargaJual) || 0);
    const sellPrice = rawSellPrice > 0 ? rawSellPrice : buyPrice;
    const rekananPrice = formHargaRekanan ? Math.max(0, Number(formHargaRekanan) || 0) : sellPrice;

    setSubmitting(true);
    try {
      await api.createProduk({
        kode: cleanKode,
        kategori: cleanKategori,
        nama: formNama.trim(),
        satuan: formSatuan.trim(),
        hargaBeli: buyPrice,
        hargaJual: sellPrice,
        hargaKhususRekanan: rekananPrice,
        stokAwal: isAlatJasa ? 0 : Number(formStokAwal) || 0,
        minimum: isAlatJasa ? 0 : Number(formMinimum) || 5,
      });

      setSuccessMsg(
        `Produk baru "${formNama.trim()}" (${cleanKode}) dalam kategori "${cleanKategori}" berhasil didaftarkan.`
      );
      setShowAddModal(false);
      setFormKode('');
      setFormNama('');
      setFormHargaBeli('');
      setFormHargaJual('');
      setFormHargaRekanan('');
      await loadKategoriProduk();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mendaftarkan produk baru');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return produkList.filter((p) => {
      const q = searchTerm.toLowerCase().trim();
      const katNorm = normalizeKategoriKey(p.kategori);
      const matchSearch =
        !q ||
        p.nama.toLowerCase().includes(q) ||
        p.kode.toLowerCase().includes(q) ||
        p.satuan.toLowerCase().includes(q) ||
        katNorm.toLowerCase().includes(q);

      const matchKategori =
        selectedKategoriFilter === 'ALL' || katNorm === selectedKategoriFilter;
      const matchStatus = selectedStatusFilter === 'ALL' || p.status === selectedStatusFilter;

      return matchSearch && matchKategori && matchStatus;
    });
  }, [produkList, searchTerm, selectedKategoriFilter, selectedStatusFilter]);

  // Bulk Selection Helpers
  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedKodes.includes(p.kode));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredProducts.map((p) => p.kode));
      setSelectedKodes((prev) => prev.filter((k) => !filteredSet.has(k)));
    } else {
      const merged = new Set([...selectedKodes, ...filteredProducts.map((p) => p.kode)]);
      setSelectedKodes(Array.from(merged));
    }
  };

  const toggleSelectKode = (kode: string) => {
    setSelectedKodes((prev) =>
      prev.includes(kode) ? prev.filter((k) => k !== kode) : [...prev, kode]
    );
  };

  const handleApplyBulkKategori = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedKodes.length === 0) return;
    if (!bulkKategoriInput.trim()) {
      setErrorMsg('Ketik atau pilih nama kategori tujuan terlebih dahulu');
      return;
    }

    setBulkSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.bulkUpdateKategoriProduk({
        kodeProdukList: selectedKodes,
        kategoriBaru: bulkKategoriInput.trim(),
      });
      setSuccessMsg(
        `Berhasil memindahkan ${res.updatedCount} produk ke kategori "${res.kategoriBaru}".`
      );
      setSelectedKodes([]);
      setBulkKategoriInput('');
      await loadKategoriProduk();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui kategori produk secara massal');
    } finally {
      setBulkSubmitting(false);
    }
  };

  // Manage Kategori Modal Handlers
  const handleAddCustomKategori = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKategoriNama.trim()) {
      setKategoriModalError('Nama kategori baru tidak boleh kosong');
      return;
    }
    setKategoriSubmitting(true);
    setKategoriModalError('');
    setKategoriModalSuccess('');
    try {
      const created = await api.createKategoriProduk({
        nama: newKategoriNama.trim(),
        deskripsi: newKategoriDeskripsi.trim(),
      });
      setNewKategoriNama('');
      setNewKategoriDeskripsi('');
      setKategoriModalSuccess(
        `Kategori "${created?.nama || normalizeKategoriKey(newKategoriNama)}" berhasil ditambahkan dan siap dipakai.`
      );
      await loadKategoriProduk();
      onRefresh();
    } catch (err: any) {
      setKategoriModalError(err.message || 'Gagal menambahkan kategori');
    } finally {
      setKategoriSubmitting(false);
    }
  };

  const handleSaveRenameKategori = async (oldName: string) => {
    if (!renameValue.trim()) {
      setKategoriModalError('Nama kategori baru wajib diisi');
      return;
    }
    setKategoriSubmitting(true);
    setKategoriModalError('');
    setKategoriModalSuccess('');
    try {
      const res = await api.renameKategoriProduk({
        kategoriLama: oldName,
        kategoriBaru: renameValue.trim(),
        deskripsi: renameDescValue.trim(),
      });
      setRenamingTarget(null);
      setRenameValue('');
      setRenameDescValue('');
      setKategoriModalSuccess(
        `Kategori "${res.kategoriLama}" berhasil diubah menjadi "${res.kategoriBaru}" (${res.affectedCount} produk diperbarui).`
      );
      if (selectedKategoriFilter === res.kategoriLama) {
        setSelectedKategoriFilter(res.kategoriBaru);
      }
      await loadKategoriProduk();
      onRefresh();
    } catch (err: any) {
      setKategoriModalError(err.message || 'Gagal mengubah nama kategori');
    } finally {
      setKategoriSubmitting(false);
    }
  };

  const handleConfirmDeleteKategori = async (item: KategoriSummaryItem) => {
    setKategoriSubmitting(true);
    setKategoriModalError('');
    setKategoriModalSuccess('');
    try {
      const res = await api.deleteKategoriProduk({
        nama: item.nama,
        kategoriPengganti:
          item.jumlahProduk > 0 ? fallbackKategoriOnDelete.trim() || 'LAINNYA' : undefined,
      });
      setDeletingTarget(null);
      setKategoriModalSuccess(
        `Kategori "${res.deleted}" dihapus${
          res.movedCount > 0
            ? ` dan ${res.movedCount} produk dipindahkan ke "${normalizeKategoriKey(fallbackKategoriOnDelete)}"`
            : ''
        }.`
      );
      await loadKategoriProduk();
      onRefresh();
    } catch (err: any) {
      setKategoriModalError(err.message || 'Gagal menghapus kategori');
    } finally {
      setKategoriSubmitting(false);
    }
  };

  // Dynamic Statistics
  const totalCount = produkList.length;
  const aktifCount = produkList.filter((p) => p.status === 'AKTIF').length;
  const topKategori1 = allCategories[0];
  const topKategori2 = allCategories[1];

  // Margin calculation helper for edit modal
  const editBuyPrice = Number(formHargaBeli) || 0;
  const editSellPrice = Number(formHargaJual) || 0;
  const editMarginRp = editSellPrice - editBuyPrice;
  const editMarginPersen = editSellPrice > 0 ? (editMarginRp / editSellPrice) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Master Produk &amp; Kategori Barang Toko
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              MODUL 3
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Katalog barang dagangan riil perusahaan dengan kategori fleksibel (bebas ketik sendiri), HPP modal, dan harga jual kasir
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => {
              setKategoriModalError('');
              setKategoriModalSuccess('');
              setRenamingTarget(null);
              setDeletingTarget(null);
              setShowManageKategoriModal(true);
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-50 border border-zinc-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <FolderEdit className="w-4 h-4 text-emerald-700" />
            <span>Kelola Kategori ({allCategories.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setFormKode(`PRD-${Date.now().toString().slice(-4)}`);
              setFormNama('');
              setFormKategori(
                selectedKategoriFilter !== 'ALL'
                  ? formatKategoriLabel(selectedKategoriFilter)
                  : allCategories[0]
                  ? formatKategoriLabel(allCategories[0].nama)
                  : ''
              );
              setFormSatuan('Sak');
              setFormHargaBeli('');
              setFormHargaJual('');
              setFormHargaRekanan('');
              setFormStokAwal('0');
              setFormMinimum('10');
              setShowAddModal(true);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Produk Baru</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-rose-700 hover:text-rose-950 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Panduan Ringkas Kategori Bebas & Edit Produk */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-zinc-900">
                Kategori Produk Fleksibel Sesuai Data Riil Perusahaan
              </h2>
              <p className="text-[11px] text-zinc-600">
                Ketik sendiri nama kategori saat tambah/edit produk, ubah nama kategori lama, atau centang beberapa produk untuk pindah kategori sekaligus.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center space-x-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 bg-white px-2.5 py-1.5 rounded-lg border border-zinc-200 transition-colors cursor-pointer shrink-0"
          >
            <span>{showGuide ? 'Tutup Panduan' : 'Cara Pakai'}</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showGuide && (
          <div className="mt-3.5 pt-3.5 border-t border-zinc-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-zinc-700">
            <div className="bg-white rounded-lg p-3 border border-zinc-200 space-y-1">
              <div className="font-bold text-zinc-900">1. Ketik Kategori Sendiri</div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Saat menambah atau mengedit produk, ketik langsung kategori riil perusahaan Anda (contoh:{' '}
                <strong>MATERIAL BANGUNAN</strong>, <strong>KOPI KEMASAN</strong>, <strong>BBM SOLAR</strong>,{' '}
                <strong>KAYU &amp; PAPAN</strong>) tanpa dibatasi pilihan bawaan.
              </p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-zinc-200 space-y-1">
              <div className="font-bold text-zinc-900">2. Pindah Kategori Massal</div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Centang kotak di sebelah kiri beberapa produk yang sejenis pada tabel, lalu ketik nama kategori baru pada bilah aksi untuk memindahkan semuanya dalam satu klik.
              </p>
            </div>

            <div className="bg-white rounded-lg p-3 border border-zinc-200 space-y-1">
              <div className="font-bold text-zinc-900">3. Kelola &amp; Ganti Nama Kategori</div>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Klik tombol <strong>Kelola Kategori</strong> di kanan atas untuk membuat daftar kategori baru, mengganti nama kategori yang sudah ada, atau menghapus kategori kosong.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-medium uppercase tracking-wider">Total Produk</span>
            <Package className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-1 font-mono tabular-nums">{totalCount}</div>
          <p className="text-[10px] text-zinc-500 mt-0.5">{aktifCount} berstatus aktif</p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-medium uppercase tracking-wider">Jumlah Kategori</span>
            <Tag className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-1 font-mono tabular-nums">
            {allCategories.length}
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Bebas tambah sesuai data riil</p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-medium uppercase tracking-wider truncate">
              {topKategori1 ? formatKategoriLabel(topKategori1.nama) : 'Kategori #1'}
            </span>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-1 font-mono tabular-nums">
            {topKategori1 ? topKategori1.jumlahProduk : 0}
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Produk terdaftar</p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-medium uppercase tracking-wider truncate">
              {topKategori2 ? formatKategoriLabel(topKategori2.nama) : 'Kategori #2'}
            </span>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-1 font-mono tabular-nums">
            {topKategori2 ? topKategori2.jumlahProduk : 0}
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Produk terdaftar</p>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-3.5 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-medium uppercase tracking-wider">Siap Dijual</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-xl font-bold text-emerald-900 mt-1 font-mono tabular-nums">
            {Math.round((aktifCount / Math.max(1, totalCount)) * 100)}%
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5">Tampil di kasir penjualan</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Cari produk berdasarkan nama, kode, kategori, atau satuan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-semibold text-zinc-500">Status:</span>
            <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-50 text-xs">
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('ALL')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  selectedStatusFilter === 'ALL'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('AKTIF')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  selectedStatusFilter === 'AKTIF'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Aktif
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatusFilter('NONAKTIF')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  selectedStatusFilter === 'NONAKTIF'
                    ? 'bg-rose-700 text-white shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Nonaktif
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Kategori Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-semibold text-zinc-500 shrink-0 mr-1">Kategori:</span>
          <button
            type="button"
            onClick={() => setSelectedKategoriFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
              selectedKategoriFilter === 'ALL'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Semua ({produkList.length})
          </button>

          {allCategories.map((kat) => {
            const isSelected = selectedKategoriFilter === kat.nama;
            return (
              <button
                key={kat.nama}
                type="button"
                onClick={() => setSelectedKategoriFilter(kat.nama)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-emerald-700 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {formatKategoriLabel(kat.nama)} ({kat.jumlahProduk})
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setKategoriModalError('');
              setKategoriModalSuccess('');
              setShowManageKategoriModal(true);
            }}
            className="px-2.5 py-1 rounded-lg font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer shrink-0 flex items-center space-x-1"
          >
            <Plus className="w-3 h-3" />
            <span>Kategori Baru</span>
          </button>
        </div>
      </div>

      {/* Bulk Category Reassignment Bar (Shown when >= 1 product selected) */}
      {selectedKodes.length > 0 && (
        <form
          onSubmit={handleApplyBulkKategori}
          className="bg-emerald-950 text-white rounded-xl p-3.5 border border-emerald-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center space-x-2.5">
            <span className="px-2.5 py-1 rounded-md bg-emerald-800 text-emerald-100 font-mono font-bold tabular-nums">
              {selectedKodes.length} produk dipilih
            </span>
            <span className="text-emerald-200">
              Ketik kategori baru atau klik salah satu kategori untuk memindahkan sekaligus:
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 max-w-2xl">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                list="daftar-kategori-produk-datalist"
                placeholder="Ketik kategori riil (misal: MATERIAL BANGUNAN, KOPI OLAHAN, BBM)..."
                value={bulkKategoriInput}
                onChange={(e) => setBulkKategoriInput(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-900 border border-emerald-700 text-white placeholder-zinc-400 focus:outline-hidden focus:border-emerald-400 font-semibold"
              />
              {allCategories.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-emerald-300/80">Pilih cepat:</span>
                  {allCategories.slice(0, 6).map((c) => (
                    <button
                      key={c.nama}
                      type="button"
                      onClick={() => setBulkKategoriInput(formatKategoriLabel(c.nama))}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/80 hover:bg-emerald-800 text-emerald-100 border border-emerald-700/80 cursor-pointer"
                    >
                      {formatKategoriLabel(c.nama)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
              <button
                type="submit"
                disabled={bulkSubmitting || !bulkKategoriInput.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {bulkSubmitting ? 'Memindahkan...' : 'Terapkan Kategori'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedKodes([])}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 text-emerald-200 font-medium cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Native HTML5 datalist for fast autocomplete anywhere */}
      <datalist id="daftar-kategori-produk-datalist">
        {allCategories.map((c) => (
          <option key={c.nama} value={formatKategoriLabel(c.nama)} />
        ))}
      </datalist>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="p-3 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-zinc-700">
            Menampilkan {filteredProducts.length} dari {produkList.length} Produk
          </span>
          <span className="text-[11px] text-zinc-500">
            Centang produk untuk pindah kategori massal, atau klik <strong>Edit Produk</strong> untuk ubah rincian satuan
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 pl-4 pr-2 w-9">
                  <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="text-zinc-500 hover:text-emerald-700 flex items-center justify-center cursor-pointer"
                    title="Pilih semua produk yang ditampilkan"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-700" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-3">KODE</th>
                <th className="py-3 px-3">KATEGORI</th>
                <th className="py-3 px-4">NAMA PRODUK</th>
                <th className="py-3 px-3">SATUAN</th>
                <th className="py-3 px-4 text-right">HARGA BELI (HPP)</th>
                <th className="py-3 px-4 text-right">HARGA JUAL KASIR</th>
                <th className="py-3 px-4 text-right">HARGA REKANAN</th>
                <th className="py-3 px-3 text-center">STOK GUDANG</th>
                <th className="py-3 px-3 text-center">STATUS</th>
                <th className="py-3 px-4 text-center font-bold text-zinc-800">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-zinc-400">
                    <Package className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
                    <p className="font-medium">Tidak ada produk yang cocok dengan pencarian / filter.</p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Coba ganti kata kunci pencarian atau pilih tab Semua kategori.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const katNorm = normalizeKategoriKey(p.kategori);
                  const katMeta = allCategories.find((c) => c.nama === katNorm);
                  const stokItem = stokList.find((s) => s.kode === p.kode);
                  const marginRp = (p.hargaJual || 0) - (p.hargaBeli || 0);
                  const marginPct = p.hargaJual > 0 ? (marginRp / p.hargaJual) * 100 : 0;
                  const isChecked = selectedKodes.includes(p.kode);

                  return (
                    <tr
                      key={p.kode}
                      className={`transition-colors ${
                        isChecked ? 'bg-emerald-50/60' : 'hover:bg-zinc-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 pl-4 pr-2">
                        <button
                          type="button"
                          onClick={() => toggleSelectKode(p.kode)}
                          className="text-zinc-400 hover:text-emerald-700 flex items-center justify-center cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-emerald-700" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Kode */}
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                          {p.kode}
                        </span>
                      </td>

                      {/* Kategori */}
                      <td className="py-3 px-3">
                        <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                          {formatKategoriLabel(katNorm)}
                        </span>
                      </td>

                      {/* Nama Produk */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-900">{p.nama}</div>
                        {katMeta?.deskripsi && (
                          <div className="text-[10px] text-zinc-400 truncate max-w-xs">
                            {katMeta.deskripsi}
                          </div>
                        )}
                      </td>

                      {/* Satuan */}
                      <td className="py-3 px-3 font-medium text-zinc-600">{p.satuan}</td>

                      {/* HPP Modal */}
                      <td className="py-3 px-4 text-right text-zinc-600 font-mono tabular-nums">
                        {formatRupiah(p.hargaBeli)}
                      </td>

                      {/* Harga Jual Kasir */}
                      <td className="py-3 px-4 text-right">
                        <div className="font-bold text-emerald-800 font-mono tabular-nums">
                          {formatRupiah(p.hargaJual)}
                        </div>
                        {marginRp > 0 && (
                          <div className="text-[10px] text-emerald-600 font-medium tabular-nums">
                            +{Math.round(marginPct)}% margin
                          </div>
                        )}
                      </td>

                      {/* Harga Rekanan */}
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-700">
                        {formatRupiah(p.hargaKhususRekanan || p.hargaJual)}
                      </td>

                      {/* Stok Gudang */}
                      <td className="py-3 px-3 text-center">
                        {isKategoriAlatNonStok(p.kategori) ? (
                          <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                            Tanpa Stok (Sewa Jasa)
                          </span>
                        ) : stokItem ? (
                          <span
                            className={`font-mono font-bold px-2 py-0.5 rounded tabular-nums ${
                              stokItem.stok <= stokItem.minimum
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-zinc-100 text-zinc-800'
                            }`}
                          >
                            {stokItem.stok} {p.satuan}
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-mono">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            p.status === 'AKTIF'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>

                      {/* Aksi Edit */}
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors cursor-pointer"
                          title={`Edit rincian & kategori ${p.nama}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit Produk</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL KELOLA KATEGORI KUSTOM                             */}
      {/* ======================================================== */}
      {showManageKategoriModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200 my-6">
            <div className="p-4 sm:p-5 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center">
                  <Tag className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">
                    Kelola Kategori Produk Perusahaan
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Buat kategori baru sesuai data riil, ubah nama kategori yang sudah ada, atau rapikan pengelompokan produk
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowManageKategoriModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs max-h-[82vh] overflow-y-auto">
              {kategoriModalSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">{kategoriModalSuccess}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKategoriModalSuccess('')}
                    className="text-emerald-700 font-bold ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {kategoriModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="font-medium">{kategoriModalError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setKategoriModalError('')}
                    className="text-rose-700 font-bold ml-2 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Form Tambah Kategori Baru */}
              <form
                onSubmit={handleAddCustomKategori}
                className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl space-y-3"
              >
                <div className="font-bold text-zinc-900 flex items-center space-x-1.5">
                  <Plus className="w-4 h-4 text-emerald-700" />
                  <span>Tambah Kategori Baru</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Nama Kategori <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: MATERIAL BANGUNAN / KOPI OLAHAN"
                      value={newKategoriNama}
                      onChange={(e) => setNewKategoriNama(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg font-semibold text-zinc-900 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                      Keterangan Singkat <span className="text-zinc-400 font-normal">(Opsional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Pasir, koral, bata, kayu, spanel..."
                      value={newKategoriDeskripsi}
                      onChange={(e) => setNewKategoriDeskripsi(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-zinc-700 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                  <div className="sm:col-span-2 flex items-end">
                    <button
                      type="submit"
                      disabled={kategoriSubmitting || !newKategoriNama.trim()}
                      className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Simpan
                    </button>
                  </div>
                </div>
              </form>

              {/* Daftar Kategori Saat Ini */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800">
                    Daftar Kategori Saat Ini ({allCategories.length})
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Mengubah nama kategori otomatis memperbarui seluruh produk di dalamnya
                  </span>
                </div>

                <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100 overflow-hidden">
                  {allCategories.map((kat) => {
                    const isRenaming = renamingTarget === kat.nama;
                    const isDeleting = deletingTarget?.nama === kat.nama;

                    return (
                      <div key={kat.nama} className="p-3 bg-white hover:bg-zinc-50/60 transition-colors">
                        {isRenaming ? (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-zinc-500 mb-0.5">
                                  Nama Kategori Baru
                                </label>
                                <input
                                  type="text"
                                  autoFocus
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-emerald-500 rounded-lg font-bold text-zinc-900"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-zinc-500 mb-0.5">
                                  Keterangan
                                </label>
                                <input
                                  type="text"
                                  value={renameDescValue}
                                  onChange={(e) => setRenameDescValue(e.target.value)}
                                  placeholder="Keterangan kategori (opsional)"
                                  className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg text-zinc-700"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-amber-700 font-medium">
                                {kat.jumlahProduk} produk dalam kategori "{formatKategoriLabel(kat.nama)}" akan ikut diperbarui.
                              </span>
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => setRenamingTarget(null)}
                                  className="px-2.5 py-1 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  disabled={kategoriSubmitting || !renameValue.trim()}
                                  onClick={() => handleSaveRenameKategori(kat.nama)}
                                  className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer"
                                >
                                  Simpan Nama Baru
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : isDeleting ? (
                          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2.5">
                            <div className="font-semibold text-rose-900">
                              Hapus kategori "{formatKategoriLabel(kat.nama)}"?
                            </div>
                            {kat.jumlahProduk > 0 ? (
                              <div className="space-y-1.5">
                                <p className="text-[11px] text-rose-800">
                                  Terdapat <strong>{kat.jumlahProduk} produk</strong> pada kategori ini. Ketik atau pilih kategori tujuan untuk memindahkan produk tersebut:
                                </p>
                                <input
                                  type="text"
                                  list="daftar-kategori-produk-datalist"
                                  value={fallbackKategoriOnDelete}
                                  onChange={(e) => setFallbackKategoriOnDelete(e.target.value)}
                                  placeholder="Kategori pengganti (contoh: LAINNYA)"
                                  className="w-full sm:w-72 px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg font-semibold text-zinc-900"
                                />
                              </div>
                            ) : (
                              <p className="text-[11px] text-rose-700">
                                Kategori ini kosong (0 produk) dan dapat dihapus langsung.
                              </p>
                            )}
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                type="button"
                                onClick={() => setDeletingTarget(null)}
                                className="px-2.5 py-1 rounded-lg bg-white border border-zinc-300 text-zinc-700 cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={
                                  kategoriSubmitting ||
                                  (kat.jumlahProduk > 0 && !fallbackKategoriOnDelete.trim())
                                }
                                onClick={() => handleConfirmDeleteKategori(kat)}
                                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                              >
                                {kat.jumlahProduk > 0 ? 'Pindahkan Produk & Hapus' : 'Ya, Hapus'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-zinc-900">
                                  {formatKategoriLabel(kat.nama)}
                                </span>
                                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 tabular-nums">
                                  {kat.jumlahProduk} produk
                                </span>
                              </div>
                              {kat.deskripsi && (
                                <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                                  {kat.deskripsi}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center space-x-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingTarget(null);
                                  setRenamingTarget(kat.nama);
                                  setRenameValue(formatKategoriLabel(kat.nama));
                                  setRenameDescValue(kat.deskripsi || '');
                                }}
                                className="px-2.5 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-medium flex items-center space-x-1 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>Ubah Nama</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingTarget(null);
                                  setDeletingTarget(kat);
                                  const other = allCategories.find((c) => c.nama !== kat.nama);
                                  setFallbackKategoriOnDelete(
                                    other ? formatKategoriLabel(other.nama) : 'LAINNYA'
                                  );
                                }}
                                className="p-1.5 rounded-lg border border-zinc-200 hover:bg-rose-50 hover:border-rose-200 text-zinc-500 hover:text-rose-600 cursor-pointer"
                                title="Hapus kategori"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowManageKategoriModal(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL EDIT RINCIAN PRODUK                                */}
      {/* ======================================================== */}
      {editingProduk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-200 my-6">
            <div className="p-4 sm:p-5 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-400/30">
                  <Pencil className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold tracking-tight">Edit Detail Produk</h2>
                    <span className="font-mono text-[11px] bg-white/10 px-2 py-0.5 rounded border border-white/20 text-amber-200">
                      {editingProduk.kode}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Perbarui nama, kategori kustom, satuan, harga beli/jual, atau status keaktifan barang
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduk(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdate} className="p-5 sm:p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Anda dapat <strong>mengetik langsung kategori baru</strong> sesuai data riil perusahaan atau memilih dari kategori yang sudah ada di bawah kolom input.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2 font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Row 1: Kode (Read-Only) & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Kode Produk <span className="text-zinc-400 font-normal">(Permanen)</span>
                  </label>
                  <input
                    type="text"
                    disabled
                    value={formKode}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg bg-zinc-100 font-mono text-zinc-500 font-bold cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Status Produk <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'AKTIF' | 'NONAKTIF')}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold focus:ring-1 focus:ring-emerald-600 bg-white"
                  >
                    <option value="AKTIF">AKTIF (Tampil di Kasir &amp; Siap Dijual)</option>
                    <option value="NONAKTIF">NONAKTIF (Sembunyikan dari Kasir)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Kategori Produk (Bebas Ketik Sendiri + Pilihan Cepat) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-zinc-700">
                    Kategori Produk <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    Bebas ketik kategori sendiri
                  </span>
                </div>
                <input
                  type="text"
                  required
                  list="daftar-kategori-produk-datalist"
                  placeholder="Ketik kategori riil (contoh: MATERIAL BANGUNAN, KOPI OLAHAN, BBM, PUPUK)..."
                  value={formKategori}
                  onChange={(e) => setFormKategori(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold text-zinc-900 focus:ring-1 focus:ring-emerald-600"
                />
                {allCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[10px] text-zinc-400">Kategori terdaftar:</span>
                    {allCategories.map((kat) => {
                      const label = formatKategoriLabel(kat.nama);
                      const isMatch = normalizeKategoriKey(formKategori) === kat.nama;
                      return (
                        <button
                          key={kat.nama}
                          type="button"
                          onClick={() => setFormKategori(label)}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            isMatch
                              ? 'bg-emerald-700 text-white border-emerald-700 font-bold'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Row 3: Nama Produk */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Produk Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Beras Belitang / Pasir m2 / Kopi Robusta Bubuk"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold text-zinc-900 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              {/* Row 4: Satuan */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Satuan Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ketik satuan (Sak / Kg / Kemasan / Meter Kubik / Biji...)"
                  value={formSatuan}
                  onChange={(e) => setFormSatuan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-medium focus:ring-1 focus:ring-emerald-600"
                />
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span className="text-[10px] text-zinc-400">Pilihan cepat:</span>
                  {commonSatuanList.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormSatuan(st)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                        formSatuan.toLowerCase() === st.toLowerCase()
                          ? 'bg-emerald-700 text-white border-emerald-700 font-bold'
                          : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 5: Harga Beli (HPP) & Harga Jual Kasir */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Harga Beli / HPP Modal <span className="text-zinc-400 font-normal">(Rp)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formHargaBeli}
                    onChange={(e) => setFormHargaBeli(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums text-zinc-800 focus:ring-1 focus:ring-emerald-600"
                  />
                  <span className="text-[10px] text-zinc-500 mt-0.5 block tabular-nums">
                    Preview: {formatRupiah(Number(formHargaBeli) || 0)}
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Harga Jual Kasir (Umum) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="0"
                    value={formHargaJual}
                    onChange={(e) => setFormHargaJual(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-emerald-900 focus:ring-1 focus:ring-emerald-600"
                  />
                  <span className="text-[10px] text-zinc-500 mt-0.5 block tabular-nums">
                    Preview: {formatRupiah(Number(formHargaJual) || 0)}
                  </span>
                </div>
              </div>

              {/* Row 6: Harga Khusus Rekanan & Minimum Stok */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Harga Khusus Rekanan / Mitra <span className="text-zinc-400 font-normal">(Rp)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Kosongkan jika sama dengan harga umum"
                    value={formHargaRekanan}
                    onChange={(e) => setFormHargaRekanan(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums text-zinc-800 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                {isKategoriAlatNonStok(formKategori) ? (
                  <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-[11px] text-sky-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Sewa Jasa (Tanpa Stok Fisik)</span>
                      <span className="text-sky-800">
                        Kategori ALAT tidak menggunakan stok gudang dan selalu siap dipakai di Kasir.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Batas Peringatan Stok Minimum <span className="text-zinc-400 font-normal">({formSatuan})</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formMinimum}
                      onChange={(e) => setFormMinimum(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums text-zinc-800 focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                )}
              </div>

              {/* Live Margin Calculation Card */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-[11px] text-zinc-500 font-medium">Estimasi Margin Keuntungan Kasir:</span>
                  <div className="font-bold text-zinc-900 tabular-nums">
                    {formatRupiah(Math.max(0, editMarginRp))} per {formSatuan || 'unit'}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-zinc-500 font-medium">Persentase Margin:</span>
                  <div
                    className={`font-bold font-mono text-sm tabular-nums ${
                      editMarginRp >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {Math.round(editMarginPersen)}%
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingProduk(null)}
                  className="px-4 py-2 text-zinc-700 hover:bg-zinc-100 rounded-xl font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center space-x-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL TAMBAH PRODUK BARU                                 */}
      {/* ======================================================== */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-200 my-6">
            <div className="p-4 sm:p-5 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center border border-emerald-500/40">
                  <Plus className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">Tambah Produk Baru</h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Daftarkan barang dagangan dengan kategori sesuai data riil perusahaan Anda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 sm:p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2 font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Row 1: Kode Produk & Stok Awal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Kode Produk <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="PRD-036"
                    value={formKode}
                    onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-600 font-mono font-bold"
                  />
                  <span className="text-[10px] text-zinc-400 mt-0.5 block">Kode unik produk / jasa</span>
                </div>

                {isKategoriAlatNonStok(formKategori) ? (
                  <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-[11px] text-sky-900 flex items-start gap-2">
                    <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">Tanpa Stok (Sewa Jasa)</span>
                      <span className="text-sky-800">
                        Contoh: Sewa Exca / Sewa Truck langsung siap ditransaksikan tanpa perlu stok fisik.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Stok Awal di Gudang</label>
                    <input
                      type="number"
                      min="0"
                      value={formStokAwal}
                      onChange={(e) => setFormStokAwal(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-600 font-mono tabular-nums"
                    />
                    <span className="text-[10px] text-zinc-400 mt-0.5 block">Jumlah fisik awal saat didaftarkan</span>
                  </div>
                )}
              </div>

              {/* Row 2: Kategori Produk (Bebas Ketik Sendiri) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-zinc-700">
                    Kategori Produk <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-emerald-700 font-semibold">
                    Pilih ALAT untuk sewa jasa tanpa stok (Exca / Truck)
                  </span>
                </div>
                <input
                  type="text"
                  required
                  list="daftar-kategori-produk-datalist"
                  placeholder="Ketik kategori (contoh: ALAT, MATERIAL BANGUNAN, PUPUK)..."
                  value={formKategori}
                  onChange={(e) => setFormKategori(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-600 font-semibold text-zinc-900"
                />
                {allCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <span className="text-[10px] text-zinc-400">Pilih cepat:</span>
                    {allCategories.map((kat) => {
                      const label = formatKategoriLabel(kat.nama);
                      const isMatch = normalizeKategoriKey(formKategori) === kat.nama;
                      return (
                        <button
                          key={kat.nama}
                          type="button"
                          onClick={() => {
                            setFormKategori(label);
                            if (isKategoriAlatNonStok(label) && formSatuan === 'Sak') {
                              setFormSatuan('Jam');
                            }
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                            isMatch
                              ? 'bg-emerald-700 text-white border-emerald-700 font-bold'
                              : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Row 3: Nama Produk */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Produk / Jasa Sewa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    isKategoriAlatNonStok(formKategori)
                      ? 'Contoh: Sewa Exca / Sewa Truck Angkut'
                      : 'Contoh: Semen Baturaja 50 Kg / Kopi Bubuk Premium 250g'
                  }
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-600 font-semibold"
                />
              </div>

              {/* Row 4: Satuan */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Satuan Transaksi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ketik satuan sendiri (Jam / Hari / Rit / Sak / Kg...)"
                  value={formSatuan}
                  onChange={(e) => setFormSatuan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-emerald-600 font-medium"
                />
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <span className="text-[10px] text-zinc-400">Pilihan cepat:</span>
                  {commonSatuanList.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormSatuan(st)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                        formSatuan.toLowerCase() === st.toLowerCase()
                          ? 'bg-emerald-700 text-white border-emerald-700 font-bold'
                          : 'bg-zinc-100 text-zinc-700 border-zinc-200 hover:bg-zinc-200'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 5: Harga Beli & Harga Jual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {isKategoriAlatNonStok(formKategori)
                      ? 'Modal Operasional Dasar (Opsional, Rp)'
                      : 'Harga Beli / HPP Modal (Rp)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formHargaBeli}
                    onChange={(e) => setFormHargaBeli(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    {isKategoriAlatNonStok(formKategori)
                      ? 'Tarif Sewa Kasir (Umum)'
                      : 'Harga Jual Kasir (Umum)'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="0"
                    value={formHargaJual}
                    onChange={(e) => setFormHargaJual(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-emerald-900 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
              </div>

              {/* Row 6: Harga Rekanan & Minimum Stok */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Harga Khusus Rekanan / Mitra (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Kosongkan jika sama dengan harga umum"
                    value={formHargaRekanan}
                    onChange={(e) => setFormHargaRekanan(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                {!isKategoriAlatNonStok(formKategori) && (
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">Peringatan Minimum Stok ({formSatuan})</label>
                    <input
                      type="number"
                      min="0"
                      value={formMinimum}
                      onChange={(e) => setFormMinimum(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2.5 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl font-medium transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center space-x-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Produk Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
