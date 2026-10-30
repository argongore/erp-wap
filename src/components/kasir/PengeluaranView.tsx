import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Truck,
  Building,
  Coffee,
  Wrench,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Wallet,
  Camera,
  Layers,
  ArrowUpRight,
  Scale,
  Sparkles,
  X,
  Tag,
  Landmark,
  Pencil,
} from 'lucide-react';
import {
  TransaksiPengeluaran,
  Rekening,
  ItemInventaris,
  Karyawan,
  KategoriInventaris,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import {
  KATEGORI_INVENTARIS_LABELS,
  getPajakStatusInfo,
} from '../master/MasterInventarisView.tsx';
import { resolveDivisiAccount } from '../common/DoubleCheckVerifikasiPanel.tsx';

interface Props {
  rekeningList: Rekening[];
  inventarisList?: ItemInventaris[];
  karyawanList?: Karyawan[];
  preselectedInventarisId?: string | null;
  onClearPreselectedInventaris?: () => void;
  onOpenInventarisMenu?: () => void;
  onRefresh: () => void;
}

const DEFAULT_DIVISI = [
  'Wijaya Transport',
  'Gudang Wijaya Agro',
  'Wijaya Karya',
  'PT Wijaya Agro Perkasa',
  'CV Wijaya Agro',
  'Okussa',
  'BRILink',
];

const PRESET_KATEGORI = [
  'Dandan & Perbaikan Armada (Truck, Dump Dutro, L300, Exca, Towing, Motor)',
  'Uang Jalan & Operasional Sopir (Dump Dutro, Truck)',
  'Konsumsi Karyawan (Nasi/Makan, Gorengan, Gula, Kopi)',
  'Admin Tarik Cash & Biaya Perbankan (BRILink, Bank)',
  'Operasional Timbangan & Gudang (Okussa, Karung, Tali, Lakban)',
  'BBM Solar, Bensin & Pelumas Oli',
  'Bahan Bangunan & Perlengkapan Kerja (Wijaya Karya)',
  'ATK, Cetak & Administrasi Kantor',
  'Pemeliharaan Gedung & Fasilitas',
  'Lain-lain / Kebutuhan Darurat',
];

export const PengeluaranView: React.FC<Props> = ({
  rekeningList,
  inventarisList = [],
  karyawanList = [],
  preselectedInventarisId,
  onClearPreselectedInventaris,
  onOpenInventarisMenu,
  onRefresh,
}) => {
  const [list, setList] = useState<TransaksiPengeluaran[]>([]);
  const [localInventaris, setLocalInventaris] = useState<ItemInventaris[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Custom divisions state with localStorage persistence
  const [customDivisi, setCustomDivisi] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wijaya_agro_custom_divisi');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [showAddDivisiModal, setShowAddDivisiModal] = useState<boolean>(false);
  const [newDivisiName, setNewDivisiName] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; ket: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  // Combined divisions: default + custom + any division that has appeared in transaction records
  const allDivisiList = useMemo(() => {
    const set = new Set<string>(DEFAULT_DIVISI);
    customDivisi.forEach((d) => set.add(d));
    list.forEach((item) => {
      if (item.divisi) set.add(item.divisi);
    });
    return Array.from(set);
  }, [customDivisi, list]);

  // Filter states
  const [filterDivisi, setFilterDivisi] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form states
  const [divisiInput, setDivisiInput] = useState<string>('Wijaya Transport');
  const [kategoriInput, setKategoriInput] = useState<string>(PRESET_KATEGORI[0]);
  const [keteranganInput, setKeteranganInput] = useState<string>('');
  const [nominalInput, setNominalInput] = useState<string>('');
  const [rekeningSumber, setRekeningSumber] = useState<string>('KAS01');
  const [penerimaOptionValue, setPenerimaOptionValue] = useState<string>('');
  const [selectedInventarisId, setSelectedInventarisId] = useState<string>('');
  const [penerimaManualInput, setPenerimaManualInput] = useState<string>('');
  const [tanggalInput, setTanggalInput] = useState<string>(getWIBTodayString());
  const [fotoKuitansi, setFotoKuitansi] = useState<string>('');

  // Quick Add Inventaris Modal inside Pengeluaran
  const [showQuickAddInventaris, setShowQuickAddInventaris] = useState<boolean>(false);
  const [quickInvKategori, setQuickInvKategori] = useState<KategoriInventaris>('TRUCK_ANGKUTAN');
  const [quickInvNama, setQuickInvNama] = useState<string>('');
  const [quickInvPlat, setQuickInvPlat] = useState<string>('');
  const [quickInvDriver, setQuickInvDriver] = useState<string>('');
  const [quickInvTahun, setQuickInvTahun] = useState<string>(String(new Date().getFullYear()));
  const [quickInvPajak, setQuickInvPajak] = useState<string>('');
  const [quickInvMerk, setQuickInvMerk] = useState<string>('');
  const [quickInvSaving, setQuickInvSaving] = useState<boolean>(false);
  const [quickInvError, setQuickInvError] = useState<string>('');

  const mergedInventarisList = useMemo(() => {
    const map = new Map<string, ItemInventaris>();
    inventarisList.forEach((i) => map.set(i.id, i));
    localInventaris.forEach((i) => map.set(i.id, i));
    return Array.from(map.values()).filter((i) => i.status === 'AKTIF');
  }, [inventarisList, localInventaris]);

  const selectedInventarisObj = useMemo(
    () => mergedInventarisList.find((i) => i.id === selectedInventarisId) || null,
    [mergedInventarisList, selectedInventarisId]
  );

  useEffect(() => {
    api
      .getInventaris()
      .then((res) => setLocalInventaris(res || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (preselectedInventarisId) {
      const target = mergedInventarisList.find((i) => i.id === preselectedInventarisId);
      if (target) {
        setPenerimaOptionValue(`INV:${target.id}`);
        setSelectedInventarisId(target.id);
        if (target.divisi) setDivisiInput(target.divisi);
        onClearPreselectedInventaris?.();
      }
    }
  }, [preselectedInventarisId, mergedInventarisList, onClearPreselectedInventaris]);

  const formatInventarisPenerimaLabel = (inv: ItemInventaris): string => {
    const platPart = inv.nomorPlat && inv.nomorPlat !== '-' ? `${inv.nomorPlat} — ` : '';
    const driverPart =
      inv.driverPenanggungJawab && inv.driverPenanggungJawab !== '-'
        ? ` (Driver: ${inv.driverPenanggungJawab})`
        : '';
    return `${platPart}${inv.namaItem}${driverPart}`;
  };

  const resolvedPenerimaValue = useMemo(() => {
    if (penerimaOptionValue.startsWith('INV:')) {
      if (selectedInventarisObj) return formatInventarisPenerimaLabel(selectedInventarisObj);
      return '';
    }
    if (penerimaOptionValue.startsWith('KRY:')) {
      return penerimaOptionValue.slice(4);
    }
    if (penerimaOptionValue === 'MANUAL') {
      return penerimaManualInput.trim();
    }
    return '';
  }, [penerimaOptionValue, selectedInventarisObj, penerimaManualInput]);

  const handlePenerimaSelectChange = (val: string) => {
    setPenerimaOptionValue(val);
    if (val.startsWith('INV:')) {
      const invId = val.slice(4);
      setSelectedInventarisId(invId);
      const found = mergedInventarisList.find((i) => i.id === invId);
      if (found && found.divisi) {
        setDivisiInput(found.divisi);
      }
    } else {
      setSelectedInventarisId('');
    }
  };

  const handleQuickCreateInventaris = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickInvError('');
    if (!quickInvNama.trim()) {
      setQuickInvError('Nama kendaraan / item wajib diisi.');
      return;
    }
    setQuickInvSaving(true);
    try {
      const pajakFormatted =
        quickInvPajak && /^\d{4}-\d{2}-\d{2}$/.test(quickInvPajak)
          ? `${quickInvPajak.slice(8, 10)}/${quickInvPajak.slice(5, 7)}/${quickInvPajak.slice(0, 4)}`
          : quickInvPajak;
      const created = await api.createInventaris({
        namaItem: quickInvNama.trim(),
        kategori: quickInvKategori,
        nomorPlat: quickInvPlat.trim().toUpperCase() || '-',
        merkTipe: quickInvMerk.trim() || '-',
        tahunKeluaran: quickInvTahun.trim() || '-',
        driverPenanggungJawab: quickInvDriver.trim() || '-',
        divisi: divisiInput || 'Wijaya Transport',
        tanggalPajakTahunan: pajakFormatted,
        kondisi: 'BAIK',
      });
      setLocalInventaris((prev) => [created, ...prev]);
      setPenerimaOptionValue(`INV:${created.id}`);
      setSelectedInventarisId(created.id);
      setShowQuickAddInventaris(false);
      setQuickInvNama('');
      setQuickInvPlat('');
      setQuickInvDriver('');
      setQuickInvMerk('');
      setQuickInvPajak('');
      onRefresh();
    } catch (err: any) {
      setQuickInvError(err.message || 'Gagal menambah item inventaris');
    } finally {
      setQuickInvSaving(false);
    }
  };

  // Preview Photo Modal
  const [previewPhoto, setPreviewPhoto] = useState<{
    imageUrl: string;
    title: string;
    nomorBukti?: string;
    namaMitra?: string;
    tanggal?: string;
    nominalText?: string;
    keterangan?: string;
  } | null>(null);

  const loadData = async (silent = false) => {
    if (!silent && list.length === 0) setLoading(true);
    try {
      const [data, divList] = await Promise.all([
        api.getPengeluaran(),
        api.getDivisi().catch(() => []),
      ]);
      setList(data || []);
      if (Array.isArray(divList) && divList.length > 0) {
        const customNames = divList.filter((d: any) => d.isCustom).map((d: any) => d.nama);
        if (customNames.length > 0) {
          setCustomDivisi((prev) => Array.from(new Set([...prev, ...customNames])));
        }
      }
    } catch (err: any) {
      console.warn('Gagal memuat daftar pengeluaran:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const onErpUpdated = () => loadData(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  const selectedRekening = useMemo(() => {
    return rekeningList.find((r) => r.kode === rekeningSumber);
  }, [rekeningList, rekeningSumber]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const nominal = Number(nominalInput);
    if (!nominal || nominal <= 0) {
      setErrorMsg('Nominal pengeluaran harus lebih dari Rp 0.');
      return;
    }

    if (!keteranganInput.trim()) {
      setErrorMsg('Keterangan rincian barang/pengeluaran wajib diisi.');
      return;
    }

    const isRekAnakPerusahaan = Boolean(
      selectedRekening &&
        (selectedRekening.isAnakPerusahaan ||
          selectedRekening.kategori === 'ANAK_PERUSAHAAN' ||
          selectedRekening.kode === 'REK-DPPARABO')
    );

    if (selectedRekening && !isRekAnakPerusahaan && selectedRekening.saldoSaatIni < nominal) {
      setErrorMsg(
        `Saldo rekening ${selectedRekening.nama} tidak mencukupi (Tersedia: ${formatRupiah(
          selectedRekening.saldoSaatIni
        )}).`
      );
      return;
    }

    setSubmitting(true);
    try {
      await api.createPengeluaran({
        divisi: divisiInput,
        kategori: kategoriInput,
        keterangan: keteranganInput.trim(),
        nominal,
        rekeningSumber,
        penerima: resolvedPenerimaValue || undefined,
        idInventaris: selectedInventarisId || undefined,
        tanggal: tanggalInput,
        fotoKuitansi: fotoKuitansi || undefined,
      });

      setSuccessMsg(
        `Pengeluaran untuk ${divisiInput} sebesar ${formatRupiah(nominal)} berhasil dicatat!`
      );
      setKeteranganInput('');
      setNominalInput('');
      setPenerimaOptionValue('');
      setSelectedInventarisId('');
      setPenerimaManualInput('');
      setFotoKuitansi('');
      loadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan pengeluaran');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, ket: string) => {
    setDeleteTarget({ id, ket });
  };

  const executeConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deletePengeluaran(deleteTarget.id);
      setSuccessMsg('Pengeluaran berhasil dibatalkan dan saldo kas dipulihkan.');
      setDeleteTarget(null);
      loadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus pengeluaran');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper for division color, icon & description tag
  const getDivisiTheme = (divisi: string) => {
    const d = divisi.toUpperCase();
    if (d.includes('TRANS')) {
      return {
        icon: Truck,
        bg: 'bg-blue-50/70 border-blue-200 text-blue-900',
        activeBorder: 'border-blue-600 ring-2 ring-blue-500/30 bg-blue-50',
        badge: 'bg-blue-100 text-blue-800',
        tag: 'WIJAYA TRANS',
        desc: 'Perbaikan dump/truck, L300, exca, towing & armada',
      };
    }
    if (d.includes('GUDANG') || d === 'GWA') {
      return {
        icon: Coffee,
        bg: 'bg-amber-50/70 border-amber-200 text-amber-900',
        activeBorder: 'border-amber-600 ring-2 ring-amber-500/30 bg-amber-50',
        badge: 'bg-amber-100 text-amber-800',
        tag: 'GWA',
        desc: 'Konsumsi karyawan (nasi, gorengan, gula) & logistik',
      };
    }
    if (d.includes('KARYA')) {
      return {
        icon: Wrench,
        bg: 'bg-orange-50/70 border-orange-200 text-orange-900',
        activeBorder: 'border-orange-600 ring-2 ring-orange-500/30 bg-orange-50',
        badge: 'bg-orange-100 text-orange-800',
        tag: 'WIJAYA KARYA',
        desc: 'Bahan bangunan, alat proyek & material teknik',
      };
    }
    if (d.includes('BRILINK')) {
      return {
        icon: Wallet,
        bg: 'bg-sky-50/70 border-sky-200 text-sky-900',
        activeBorder: 'border-sky-600 ring-2 ring-sky-500/30 bg-sky-50',
        badge: 'bg-sky-100 text-sky-800',
        tag: 'BRILINK',
        desc: 'Admin tarik tunai/cash & perbankan operasional',
      };
    }
    if (d.includes('OKUSSA')) {
      return {
        icon: Scale,
        bg: 'bg-purple-50/70 border-purple-200 text-purple-900',
        activeBorder: 'border-purple-600 ring-2 ring-purple-500/30 bg-purple-50',
        badge: 'bg-purple-100 text-purple-800',
        tag: 'OKUSSA',
        desc: 'Timbangan & operasional unit timbang',
      };
    }
    if (d.includes('PT') || d === 'PTWAP') {
      return {
        icon: Landmark,
        bg: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
        activeBorder: 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50',
        badge: 'bg-emerald-100 text-emerald-800',
        tag: 'PTWAP',
        desc: 'Kantor pusat, manajemen & legalitas',
      };
    }
    if (d.includes('CV') || d === 'CV WA') {
      return {
        icon: Building,
        bg: 'bg-teal-50/70 border-teal-200 text-teal-900',
        activeBorder: 'border-teal-600 ring-2 ring-teal-500/30 bg-teal-50',
        badge: 'bg-teal-100 text-teal-800',
        tag: 'CV WA',
        desc: 'Unit usaha kemitraan & lapangan',
      };
    }
    return {
      icon: Layers,
      bg: 'bg-zinc-50 border-zinc-200 text-zinc-900',
      activeBorder: 'border-zinc-700 ring-2 ring-zinc-500/30 bg-zinc-100',
      badge: 'bg-zinc-200 text-zinc-800',
      tag: 'DIVISI',
      desc: 'Operasional & kebutuhan unit kerja',
    };
  };

  // Grand total across all transactions
  const totalPengeluaranAll = useMemo(() => {
    return list.reduce((sum, item) => sum + (item.nominal || 0), 0);
  }, [list]);

  // Dynamic statistics per division for ALL divisions
  const divisiStats = useMemo(() => {
    return allDivisiList.map((div) => {
      const subList = list.filter((i) => i.divisi === div);
      const total = subList.reduce((s, i) => s + (i.nominal || 0), 0);
      return {
        divisi: div,
        total,
        count: subList.length,
        meta: getDivisiTheme(div),
      };
    });
  }, [allDivisiList, list]);

  const handleAddNewDivisi = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDivisiName.trim();
    if (!trimmed) return;
    if (allDivisiList.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`Divisi "${trimmed}" sudah terdaftar.`);
      return;
    }
    try {
      await api.createDivisi({
        nama: trimmed,
        deskripsi: `Unit operasional & pengeluaran ${trimmed}`,
      });
    } catch (err: any) {
      console.warn('Simpan divisi via API:', err);
    }
    const updated = [...customDivisi, trimmed];
    setCustomDivisi(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wijaya_agro_custom_divisi', JSON.stringify(updated));
    }
    setDivisiInput(trimmed);
    setNewDivisiName('');
    setShowAddDivisiModal(false);
    setSuccessMsg(`Divisi "${trimmed}" berhasil ditambahkan! Card divisi baru otomatis terbentuk di tampilan dan langsung dipilih.`);
    onRefresh();
  };

  // Filtered List
  const filteredList = useMemo(() => {
    return list.filter((item) => {
      const matchDivisi = filterDivisi === 'ALL' || item.divisi === filterDivisi;
      const matchQuery =
        !searchQuery.trim() ||
        item.keterangan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kategori.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.penerima || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.idTransaksi.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDivisi && matchQuery;
    });
  }, [list, filterDivisi, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Menu Pengeluaran &amp; Biaya Operasional Divisi
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300">
              PT. WIJAYA AGRO PERKASA
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
            Khusus <strong>pengeluaran murni pengurang saldo &amp; laba divisi</strong> (servis armada, BBM, konsumsi, material habis pakai). Untuk pembelian beras/barang yang akan dijual kembali (hitungan Modal Dagang), gunakan menu <strong>Pembelian Stok Pemasok / Hasil Bumi</strong>.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowAddDivisiModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
            title="Tambah divisi / unit kerja baru agar otomatis membentuk card baru"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Tambah Divisi Baru</span>
          </button>

          <button
            onClick={() => {
              loadData();
              onRefresh();
            }}
            className="text-xs font-medium px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-700 shadow-2xs cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      {/* KPI Cards: Dynamic Grid Displaying ALL Divisions + Grand Total + Add Card */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-zinc-600">
          <div className="flex items-center space-x-2">
            <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-800">
              Tampilan Card Semua Divisi ({allDivisiList.length} Divisi Terdaftar)
            </span>
            <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full">
              Real-Time
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            {filterDivisi === 'ALL'
              ? 'Menampilkan semua transaksi divisi · Klik kartu untuk memfilter tabel'
              : `Sedang memfilter: ${filterDivisi} (Klik kartu lagi untuk menampilkan semua)`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: TOTAL KESELURUHAN (ALL) */}
          <div
            onClick={() => setFilterDivisi('ALL')}
            className={`p-4 rounded-xl border transition-all cursor-pointer relative min-w-0 overflow-hidden ${
              filterDivisi === 'ALL'
                ? 'bg-rose-50 border-rose-600 ring-2 ring-rose-500/30 shadow-xs'
                : 'bg-rose-500/10 border-rose-500/20 hover:border-rose-400/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-rose-800 font-bold mb-1 min-w-0">
              <span className="truncate">TOTAL SEMUA DIVISI</span>
              <Receipt className="w-4 h-4 text-rose-600 shrink-0" />
            </div>
            <div
              className="text-xl font-black text-rose-950 font-mono tabular-nums truncate whitespace-nowrap"
              title={formatRupiah(totalPengeluaranAll)}
            >
              {formatRupiahSingkat(totalPengeluaranAll)}
            </div>
            <div className="flex items-center justify-between text-[11px] text-rose-700 mt-2 pt-1 border-t border-rose-200/60">
              <span>{list.length} transaksi total</span>
              {filterDivisi === 'ALL' ? (
                <span className="font-bold text-[10px] bg-rose-200 text-rose-900 px-1.5 py-0.2 rounded">
                  ✓ Tampil Semua
                </span>
              ) : (
                <span className="text-[10px] text-rose-600 underline">Lihat Semua</span>
              )}
            </div>
          </div>

          {/* Cards for EVERY Single Division in allDivisiList */}
          {divisiStats.map((stat) => {
            const Icon = stat.meta.icon;
            const isSelected = filterDivisi === stat.divisi;
            const percentage = totalPengeluaranAll > 0 ? ((stat.total / totalPengeluaranAll) * 100).toFixed(1) : '0';
            return (
              <div
                key={stat.divisi}
                className={`p-4 rounded-xl border transition-all relative flex flex-col justify-between min-w-0 overflow-hidden ${
                  isSelected ? stat.meta.activeBorder : `${stat.meta.bg} hover:shadow-2xs`
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between text-xs font-bold mb-1 gap-1 min-w-0">
                    <span className="truncate text-zinc-900">{stat.divisi}</span>
                    <Icon className="w-4 h-4 shrink-0 opacity-80" />
                  </div>
                  <div
                    className="text-lg font-black font-mono tabular-nums tracking-tight mt-0.5 text-zinc-900 truncate whitespace-nowrap"
                    title={formatRupiah(stat.total)}
                  >
                    {formatRupiahSingkat(stat.total)}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-0.5">
                    <span className="line-clamp-1">{stat.meta.desc}</span>
                    <span className="font-semibold text-zinc-600 shrink-0 ml-1">{percentage}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] mt-2.5 pt-2 border-t border-zinc-200/70">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterDivisi(isSelected ? 'ALL' : stat.divisi);
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white'
                        : 'bg-white text-zinc-700 hover:bg-zinc-100 border border-zinc-200'
                    }`}
                  >
                    {isSelected ? '✓ Difilter' : `${stat.count} Transaksi`}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDivisiInput(stat.divisi);
                    }}
                    className="text-[10px] font-bold text-rose-700 hover:text-rose-900 hover:underline cursor-pointer"
                    title={`Pilih ${stat.divisi} di form input pengeluaran`}
                  >
                    + Catat Biaya
                  </button>
                </div>
              </div>
            );
          })}

          {/* Card "+ Tambah Divisi Baru" */}
          <div
            onClick={() => setShowAddDivisiModal(true)}
            className="p-4 rounded-xl border-2 border-dashed border-rose-300 hover:border-rose-500 bg-rose-50/40 hover:bg-rose-50/80 text-rose-800 transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-1.5 min-h-[110px] shadow-2xs group"
            title="Tambah divisi baru agar otomatis membentuk kartu ringkasan baru"
          >
            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold text-rose-900">+ Tambah Divisi Baru</span>
            <span className="text-[10px] text-rose-700/80">Card otomatis terbentuk seketika</span>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Form (5 Cols) + History (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Input Pengeluaran */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-zinc-200 p-5 shadow-2xs space-y-4">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-rose-600" />
              <span>Input Pengeluaran Baru</span>
            </h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Setiap pengeluaran langsung memotong rekening kas/bank perusahaan
            </p>
          </div>

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {/* Divisi & Kategori */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-zinc-700">
                  Unit / Divisi <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddDivisiModal(true)}
                  className="text-[11px] font-bold text-rose-700 hover:text-rose-900 cursor-pointer flex items-center space-x-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Tambah Divisi</span>
                </button>
              </div>
              <select
                required
                value={divisiInput}
                onChange={(e) => {
                  if (e.target.value === 'TAMBAH_BARU') {
                    setShowAddDivisiModal(true);
                  } else {
                    setDivisiInput(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800 font-semibold"
              >
                {allDivisiList.map((div) => (
                  <option key={div} value={div}>
                    {div}
                  </option>
                ))}
                <option value="TAMBAH_BARU" className="text-rose-700 font-bold">
                  + Tambah Divisi Baru...
                </option>
              </select>

              {(() => {
                const divAcc = resolveDivisiAccount(divisiInput, rekeningList);
                const nom = Math.max(0, Number(nominalInput) || 0);
                const saldoAkhirDivisi = divAcc.saldoSaatIni - nom;
                return (
                  <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 space-y-1.5 text-[11px]">
                    <div className="grid grid-cols-3 gap-2 font-mono tabular-nums">
                      <div className="min-w-0">
                        <div className="text-[10px] font-sans text-zinc-500 truncate">
                          Saldo {divAcc.kode}
                        </div>
                        <div className="font-semibold text-zinc-800 truncate">
                          {formatRupiah(divAcc.saldoSaatIni)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-sans text-zinc-500 truncate">
                          Pengeluaran (−)
                        </div>
                        <div className="font-bold text-rose-700 truncate">
                          −{formatRupiah(nom)}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-sans text-zinc-500 truncate">
                          Saldo Divisi Akhir
                        </div>
                        <div
                          className={`font-bold truncate ${
                            saldoAkhirDivisi < 0 ? 'text-rose-700' : 'text-zinc-900'
                          }`}
                        >
                          {formatRupiah(saldoAkhirDivisi)}
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-600 leading-snug">
                      <strong>Pengeluaran Operasional</strong> pasti mengurangi saldo berjalan &amp; laba bersih divisi <strong>{divisiInput}</strong> (berbeda dengan <em>Pembelian Barang/Beras</em> yang dihitung sebagai modal stok dagang).
                    </p>
                  </div>
                );
              })()}
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Kategori Pengeluaran <span className="text-rose-500">*</span>
              </label>
              <select
                required
                value={kategoriInput}
                onChange={(e) => setKategoriInput(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800"
              >
                {PRESET_KATEGORI.map((kat) => (
                  <option key={kat} value={kat}>
                    {kat}
                  </option>
                ))}
              </select>
            </div>

            {/* Rincian Keterangan */}
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Keterangan &amp; Rincian Barang / Kebutuhan <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={keteranganInput}
                onChange={(e) => setKeteranganInput(e.target.value)}
                placeholder="Cth: Beli kampas rem L300 & oli dump truck, atau Gorengan karyawan & gula, atau Admin tarik tunai"
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800"
              />
            </div>

            {/* Nominal */}
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Nominal Biaya (Rp) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 font-bold text-zinc-400">Rp</span>
                <input
                  type="number"
                  required
                  min={1}
                  value={nominalInput}
                  onChange={(e) => setNominalInput(e.target.value)}
                  placeholder="0"
                  className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 font-mono font-bold text-sm text-zinc-900"
                />
              </div>
              {Number(nominalInput) > 0 && (
                <div className="text-[11px] text-rose-700 font-semibold mt-1">
                  Terbilang: {formatRupiah(Number(nominalInput))}
                </div>
              )}
            </div>

            {/* Sumber Kas & Penerima */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Sumber Kas / Bank</label>
                <select
                  value={rekeningSumber}
                  onChange={(e) => setRekeningSumber(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800"
                >
                  {rekeningList
                    .filter((r) => !r.isVirtual && r.status === 'AKTIF')
                    .map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({formatRupiah(r.saldoSaatIni)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block font-semibold text-zinc-700">
                    No. Polisi / Armada / Penerima
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickInvError('');
                        setShowQuickAddInventaris(true);
                      }}
                      className="text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md cursor-pointer"
                    >
                      + Tambah Unit
                    </button>
                    {onOpenInventarisMenu && (
                      <button
                        type="button"
                        onClick={onOpenInventarisMenu}
                        className="text-[10px] font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
                      >
                        Menu Inventaris
                      </button>
                    )}
                  </div>
                </div>

                <select
                  value={penerimaOptionValue}
                  onChange={(e) => handlePenerimaSelectChange(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800 bg-white"
                >
                  <option value="">-- Pilih Kendaraan Inventaris / Armada / Penerima --</option>
                  {mergedInventarisList.length > 0 && (
                    <optgroup label={`Kendaraan & Inventaris PT (${mergedInventarisList.length} Unit)`}>
                      {mergedInventarisList.map((inv) => {
                        const platLabel =
                          inv.nomorPlat && inv.nomorPlat !== '-' ? `${inv.nomorPlat} — ` : `${inv.kode} — `;
                        const driverLabel =
                          inv.driverPenanggungJawab && inv.driverPenanggungJawab !== '-'
                            ? ` · Driver: ${inv.driverPenanggungJawab}`
                            : '';
                        const tahunLabel =
                          inv.tahunKeluaran && inv.tahunKeluaran !== '-'
                            ? ` · Thn ${inv.tahunKeluaran}`
                            : '';
                        return (
                          <option key={inv.id} value={`INV:${inv.id}`}>
                            {platLabel}
                            {inv.namaItem}
                            {driverLabel}
                            {tahunLabel}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                  {karyawanList.filter((k) => k.status === 'AKTIF').length > 0 && (
                    <optgroup label="Karyawan / Personil PT">
                      {karyawanList
                        .filter((k) => k.status === 'AKTIF')
                        .map((k) => (
                          <option key={k.id} value={`KRY:${k.nama} (${k.jabatan})`}>
                            {k.nama} — {k.jabatan}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <optgroup label="Penerima Umum / Lainnya">
                    <option value="MANUAL">-- Ketik Manual Penerima Lainnya (Bengkel / Toko / BRILink) --</option>
                  </optgroup>
                </select>

                {mergedInventarisList.length === 0 && !penerimaOptionValue && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Belum ada unit kendaraan di Menu Inventaris PT. Klik <strong>+ Tambah Unit</strong> untuk mendaftarkan armada PT.
                  </p>
                )}

                {selectedInventarisObj && (
                  <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-bold text-slate-900">
                        {selectedInventarisObj.nomorPlat && selectedInventarisObj.nomorPlat !== '-'
                          ? `${selectedInventarisObj.nomorPlat} · ${selectedInventarisObj.namaItem}`
                          : selectedInventarisObj.namaItem}
                      </span>
                      {selectedInventarisObj.tahunKeluaran && selectedInventarisObj.tahunKeluaran !== '-' && (
                        <span className="font-mono text-slate-500">
                          Thn {selectedInventarisObj.tahunKeluaran}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>
                        Driver: <strong>{selectedInventarisObj.driverPenanggungJawab || '-'}</strong>
                      </span>
                      <span>
                        Pajak: <strong>{getPajakStatusInfo(selectedInventarisObj.tanggalPajakTahunan).label}</strong>
                      </span>
                    </div>
                  </div>
                )}

                {penerimaOptionValue === 'MANUAL' && (
                  <input
                    type="text"
                    value={penerimaManualInput}
                    onChange={(e) => setPenerimaManualInput(e.target.value)}
                    placeholder="Ketik nama bengkel, toko, BRILink, atau penerima..."
                    className="mt-2 w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800"
                  />
                )}
              </div>
            </div>

            {/* Tanggal */}
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Tanggal Transaksi</label>
              <input
                type="text"
                value={tanggalInput}
                onChange={(e) => setTanggalInput(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 text-zinc-800 font-mono"
                placeholder="DD/MM/YYYY"
              />
            </div>

            {/* Upload Kuitansi Fisik */}
            <div>
              <ImageUploadZone
                label="Foto Nota / Kuitansi Fisik (Opsional)"
                sublabel="Ambil foto kuitansi bengkel, struk belanja, atau nota pembelian fisik"
                value={fotoKuitansi}
                onChange={setFotoKuitansi}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || Number(nominalInput) <= 0 || !keteranganInput.trim()}
              className="w-full py-2.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center space-x-2 cursor-pointer mt-2"
            >
              <Receipt className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Pengeluaran'}</span>
            </button>
          </form>
        </div>

        {/* History Table */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-zinc-200 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-zinc-700" />
                <span>Histori Pengeluaran &amp; Biaya</span>
              </h2>
              <p className="text-[11px] text-zinc-500">
                Semua biaya operasional seluruh divisi perusahaan
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={filterDivisi}
                onChange={(e) => setFilterDivisi(e.target.value)}
                className="px-2.5 py-1.5 text-xs border border-zinc-200 rounded-lg focus:ring-1 focus:ring-rose-500 font-medium"
              >
                <option value="ALL">Semua Divisi ({list.length})</option>
                {allDivisiList.map((d) => {
                  const c = list.filter((i) => i.divisi === d).length;
                  return (
                    <option key={d} value={d}>
                      {d} ({c})
                    </option>
                  );
                })}
              </select>

              <div className="relative w-full sm:w-44">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari biaya..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:ring-1 focus:ring-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">TANGGAL</th>
                  <th className="py-2.5 px-3">DIVISI</th>
                  <th className="py-2.5 px-3">RINCIAN BIAYA</th>
                  <th className="py-2.5 px-3 text-right">NOMINAL</th>
                  <th className="py-2.5 px-3">SUMBER KAS</th>
                  <th className="py-2.5 px-3 text-center">BUKTI</th>
                  <th className="py-2.5 px-3 text-center">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-400">
                      {loading ? 'Memuat data pengeluaran...' : 'Belum ada catatan pengeluaran'}
                    </td>
                  </tr>
                ) : (
                  filteredList.map((item) => {
                    const theme = getDivisiTheme(item.divisi);
                    return (
                      <tr key={item.idTransaksi} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 font-mono">
                          <div>{item.tanggal}</div>
                          <div className="text-[10px] text-zinc-400">{item.jam}</div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${theme.badge}`}>
                            {item.divisi}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-zinc-900">{item.keterangan}</div>
                          <div className="text-[10px] text-zinc-500">
                            {item.kategori} {item.penerima ? `· Oleh/Armada: ${item.penerima}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                          {formatRupiah(item.nominal)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-100 text-zinc-700 font-mono">
                            {item.rekeningSumber}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.fotoKuitansi ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPhoto({
                                  imageUrl: item.fotoKuitansi!,
                                  title: `Kuitansi: ${item.keterangan}`,
                                  nomorBukti: item.idTransaksi,
                                  namaMitra: item.divisi,
                                  tanggal: item.tanggal,
                                  nominalText: formatRupiah(item.nominal),
                                  keterangan: item.keterangan,
                                })
                              }
                              className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="Lihat Foto Kuitansi"
                            >
                              <Camera className="w-3.5 h-3.5 mx-auto" />
                            </button>
                          ) : (
                            <span className="text-zinc-300">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditTxId(item.idTransaksi)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold transition-colors cursor-pointer"
                              title="Edit nominal biaya, divisi, rekening, atau keterangan"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.idTransaksi, item.keterangan)}
                              className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="Batalkan & Hapus Pengeluaran"
                            >
                              <Trash2 className="w-3.5 h-3.5 mx-auto" />
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
      </div>

      {/* Modal Tambah Divisi Baru (Otomatis Membentuk Card Divisi Baru) */}
      {showAddDivisiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-rose-700 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4 text-rose-200" />
                <span>Tambah Divisi / Unit Kerja Baru</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddDivisiModal(false);
                  setNewDivisiName('');
                }}
                className="text-rose-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewDivisi} className="p-5 space-y-4 text-xs">
              <p className="text-zinc-600 text-[11px] leading-relaxed">
                Ketikkan nama divisi baru (misal: <em>Bengkel Las</em>, <em>Logistik Pupuk</em>, atau <em>Armada Truk 02</em>). Card ringkasan akan langsung terbentuk secara otomatis.
              </p>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Divisi Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: Wijaya Logistik, Armada 02..."
                  value={newDivisiName}
                  onChange={(e) => setNewDivisiName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-rose-500 font-semibold text-zinc-900"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDivisiModal(false);
                    setNewDivisiName('');
                  }}
                  className="px-3.5 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-lg font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newDivisiName.trim()}
                  className="px-4 py-1.5 bg-rose-700 text-white font-bold rounded-lg hover:bg-rose-800 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  Simpan &amp; Buat Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Foto Kuitansi Modal */}
      {previewPhoto && (
        <FotoNotaPreviewModal
          isOpen={true}
          onClose={() => setPreviewPhoto(null)}
          imageUrl={previewPhoto.imageUrl}
          title={previewPhoto.title}
          nomorBukti={previewPhoto.nomorBukti}
          namaMitra={previewPhoto.namaMitra}
          tanggal={previewPhoto.tanggal}
          nominalText={previewPhoto.nominalText}
          keterangan={previewPhoto.keterangan}
        />
      )}

      {/* Confirmation Modal for Deleting Pengeluaran */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-zinc-900">
                Batalkan &amp; Hapus Pengeluaran?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Yakin ingin membatalkan pengeluaran <strong className="text-zinc-900">"{deleteTarget.ket}"</strong>?
                Saldo kas akan dipulihkan secara otomatis.
              </p>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl border border-zinc-300 text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                {isDeleting ? (
                  <span>Menghapus...</span>
                ) : (
                  <span>Ya, Hapus</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal Edit Detail Pengeluaran Divisi */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="PENGELUARAN_DIVISI"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          loadData();
          onRefresh();
        }}
      />

      {/* Quick Add Inventaris Modal inside Pengeluaran */}
      {showQuickAddInventaris && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tambah Kendaraan / Item ke Inventaris PT
                </h3>
                <p className="text-[11px] text-slate-500">
                  Otomatis tersimpan ke Menu Inventaris &amp; langsung terpilih di form pengeluaran
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddInventaris(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateInventaris} className="p-5 space-y-3.5 text-xs">
              {quickInvError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {quickInvError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori Unit</label>
                  <select
                    value={quickInvKategori}
                    onChange={(e) => setQuickInvKategori(e.target.value as KategoriInventaris)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
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
                    value={quickInvNama}
                    onChange={(e) => setQuickInvNama(e.target.value)}
                    placeholder="Cth: Dump Dutro / L300"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor Plat / Polisi
                  </label>
                  <input
                    type="text"
                    value={quickInvPlat}
                    onChange={(e) => setQuickInvPlat(e.target.value.toUpperCase())}
                    placeholder="Cth: BE 8206 AMN"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase"
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
                    value={quickInvTahun}
                    onChange={(e) => setQuickInvTahun(e.target.value)}
                    placeholder="2021"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Driver / Penanggung Jawab
                  </label>
                  <input
                    type="text"
                    value={quickInvDriver}
                    onChange={(e) => setQuickInvDriver(e.target.value)}
                    placeholder="Cth: Argon / Fahlevi"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jatuh Tempo Pajak STNK
                  </label>
                  <input
                    type="date"
                    value={quickInvPajak}
                    onChange={(e) => setQuickInvPajak(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Merk / Tipe Kendaraan (Opsional)
                </label>
                <input
                  type="text"
                  value={quickInvMerk}
                  onChange={(e) => setQuickInvMerk(e.target.value)}
                  placeholder="Cth: Hino Dutro 130 HD"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuickAddInventaris(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={quickInvSaving}
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {quickInvSaving ? 'Menyimpan...' : 'Simpan & Pilih Unit Ini'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
