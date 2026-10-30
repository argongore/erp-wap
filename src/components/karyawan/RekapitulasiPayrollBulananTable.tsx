import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Search,
  Calendar,
  Layers,
  Users,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Receipt,
  Scale,
  PlusCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Warehouse,
  Truck,
  Wrench,
  Store,
  Building2,
  Sparkles,
  ShoppingBag,
  HandCoins,
  ArrowRight,
  Filter,
  Package,
  AlertTriangle,
  Info,
  ExternalLink,
  UserCog,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  DAFTAR_DIVISI,
  ItemRekapPayrollBulanan,
  ItemRincianHarianPayroll,
  ItemBonBarangKaryawan,
  ItemBonUangKaryawan,
  NamaDivisi,
  RekapPayrollBulananSummary,
  Rekening,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import {
  KaryawanAvatar,
  ModalPreviewFotoKaryawan,
  ModalProfilKaryawan,
  ProfilKaryawanEditableData,
} from './ModalProfilKaryawan.tsx';

interface RekapitulasiPayrollBulananTableProps {
  rekeningList: Rekening[];
  onOpenInputPayrollHarian: (idKaryawan?: string, divisiPreset?: NamaDivisi) => void;
  onOpenBayarGaji?: (idKaryawan: string) => void;
  onOpenStatement?: (mitraId: string) => void;
  onOpenKasbonUang?: (karyawanMitraId: string) => void;
  onOpenDetailKaryawan?: (idKaryawan: string) => void;
  onOpenProfilKaryawan?: (item: ItemRekapPayrollBulanan) => void;
  onRefreshAll?: () => void;
  refreshTrigger?: number;
}

const BULAN_LIST = [
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

const TAHUN_LIST = [2025, 2026, 2027];

const DIVISI_BADGES: Record<string, string> = {
  'Gudang Wijaya Agro': 'bg-amber-950/80 text-amber-300 border-amber-800',
  'Wijaya Karya': 'bg-blue-950/80 text-blue-300 border-blue-800',
  'Wijaya Transport': 'bg-indigo-950/80 text-indigo-300 border-indigo-800',
  'CV Wijaya Agro': 'bg-emerald-950/80 text-emerald-300 border-emerald-800',
  'PT Wijaya Agro Perkasa': 'bg-purple-950/80 text-purple-300 border-purple-800',
  'Okussa': 'bg-rose-950/80 text-rose-300 border-rose-800',
};

export const RekapitulasiPayrollBulananTable: React.FC<RekapitulasiPayrollBulananTableProps> = ({
  rekeningList,
  onOpenInputPayrollHarian,
  onOpenBayarGaji,
  onOpenStatement,
  onOpenKasbonUang,
  onOpenDetailKaryawan,
  onOpenProfilKaryawan,
  onRefreshAll,
  refreshTrigger,
}) => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentYear = currentDate.getFullYear(); // 2026

  const [selectedBulan, setSelectedBulan] = useState<number>(currentMonth);
  const [selectedTahun, setSelectedTahun] = useState<number>(currentYear);
  const [selectedDivisi, setSelectedDivisi] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [rekapData, setRekapData] = useState<RekapPayrollBulananSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedKaryawanId, setExpandedKaryawanId] = useState<string | null>(null);

  // Sub-tabs for expanded row: 'HARIAN' (Rekap Gaji Per Hari) | 'BON' (Detail Bon Uang & Produk Barang) | 'NERACA' (Neraca & Settlement)
  const [activeSubTabs, setActiveSubTabs] = useState<Record<string, 'HARIAN' | 'BON' | 'NERACA'>>({});

  // Settlement inline modal
  const [settleKaryawan, setSettleKaryawan] = useState<ItemRekapPayrollBulanan | null>(null);
  const [settleRekening, setSettleRekening] = useState<string>('KAS01');
  const [settleModePotongBon, setSettleModePotongBon] = useState<'TIDAK_POTONG' | 'SEBAGIAN_PERSEN' | 'SEBAGIAN_NOMINAL' | 'LUNASI_PENUH'>('SEBAGIAN_PERSEN');
  const [settlePersenBon, setSettlePersenBon] = useState<number>(50);
  const [settleNominalKustom, setSettleNominalKustom] = useState<number>(0);
  const [settleSubmitting, setSettleSubmitting] = useState<boolean>(false);
  const [settleError, setSettleError] = useState<string>('');

  // Employee Profile & Division Upgrade Modal
  const [internalProfilKry, setInternalProfilKry] = useState<ProfilKaryawanEditableData | null>(null);
  const [previewFoto, setPreviewFoto] = useState<{
    nama: string;
    jabatan?: string;
    divisi?: string;
    fotoUrl: string;
  } | null>(null);

  const handleOpenProfilItem = (item: ItemRekapPayrollBulanan) => {
    if (onOpenProfilKaryawan) {
      onOpenProfilKaryawan(item);
      return;
    }
    setInternalProfilKry({
      id: item.idKaryawan,
      nik: item.nik,
      nama: item.nama,
      jabatan: item.jabatan,
      divisi: item.divisiAktifSaatIni || item.divisiUtama,
      fotoUrl: item.fotoUrl,
      riwayatDivisi: item.riwayatDivisi,
    });
  };

  const loadRekap = async (silent = false) => {
    if (!silent && !rekapData) setLoading(true);
    try {
      const data = await api.getRekapPayrollBulanan({
        bulan: selectedBulan,
        tahun: selectedTahun,
        divisi: selectedDivisi !== 'ALL' ? selectedDivisi : undefined,
      });
      setRekapData(data);
    } catch (err) {
      console.error('Failed to load monthly payroll recap:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRekap(Boolean(rekapData));
  }, [selectedBulan, selectedTahun, selectedDivisi, refreshTrigger]);

  useEffect(() => {
    const onErpUpdated = () => loadRekap(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [selectedBulan, selectedTahun, selectedDivisi]);

  const handleToggleExpand = (idKaryawan: string) => {
    setExpandedKaryawanId((prev) => {
      const next = prev === idKaryawan ? null : idKaryawan;
      if (next && !activeSubTabs[next]) {
        setActiveSubTabs((tabs) => ({ ...tabs, [next]: 'HARIAN' }));
      }
      return next;
    });
  };

  const setSubTab = (idKaryawan: string, tab: 'HARIAN' | 'BON' | 'NERACA') => {
    setActiveSubTabs((prev) => ({ ...prev, [idKaryawan]: tab }));
  };

  const handleProcessSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleKaryawan) return;
    setSettleError('');
    setSettleSubmitting(true);
    try {
      let finalPersen = 0;
      let finalNominal: number | undefined = undefined;

      if (settleModePotongBon === 'TIDAK_POTONG') {
        finalPersen = 0;
        finalNominal = 0;
      } else if (settleModePotongBon === 'LUNASI_PENUH') {
        finalPersen = 100;
      } else if (settleModePotongBon === 'SEBAGIAN_PERSEN') {
        finalPersen = settlePersenBon;
      } else if (settleModePotongBon === 'SEBAGIAN_NOMINAL') {
        finalNominal = Math.max(0, Number(settleNominalKustom) || 0);
      }

      await api.settleHakUpahKaryawan(settleKaryawan.idKaryawan, {
        divisi: settleKaryawan.divisiUtama,
        rekeningSumber: settleRekening,
        persentasePotongKasbon: finalPersen,
        nominalPotongKustom: finalNominal,
      });
      setSettleKaryawan(null);
      await loadRekap();
      onRefreshAll?.();
    } catch (err: any) {
      setSettleError(err.message || 'Gagal memproses pencairan hak upah');
    } finally {
      setSettleSubmitting(false);
    }
  };

  const handleExportCSV = () => {
    if (!rekapData || rekapData.items.length === 0) return;

    const headers = [
      'NIK',
      'Nama Karyawan',
      'Jabatan',
      'Departemen',
      'Divisi Utama',
      'Hari Masuk',
      'Hari Tidak Masuk',
      'Upah Pokok Harian',
      'Lembur & Makan',
      'Total Gaji Kotor',
      'Kasbon Uang',
      'Kasbon Barang',
      'Total Sisa Bon',
      'Potongan Bon Terbayar',
      'Gaji Bersih Dibayar',
      'Hak Upah Belum Cair',
      'Saldo Bersih (Neraca)',
      'Status Neraca',
    ];

    const hariDalamBulanExport = new Date(rekapData.tahun, rekapData.bulan, 0).getDate();
    const rows = rekapData.items.map((item) => [
      item.nik,
      `"${item.nama}"`,
      `"${item.jabatan}"`,
      `"${item.departemen}"`,
      `"${item.divisiUtama}"`,
      item.totalHariKerja,
      item.totalHariTidakMasuk ?? Math.max(0, hariDalamBulanExport - item.totalHariKerja),
      item.totalUpahPokok,
      item.totalUangMakanLembur,
      item.totalGajiKotor,
      item.sisaKasbonUang,
      item.sisaKasbonBarang,
      item.totalSisaBonKaryawan,
      item.totalPotonganBon,
      item.totalGajiBersihDibayar,
      item.totalHakUpahPending,
      item.saldoBersih,
      item.posisiStatus,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Rekap_Gaji_Bon_Karyawan_${rekapData.periodeBulan.replace(/\s+/g, '_')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredItems = (rekapData?.items || []).filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.nama.toLowerCase().includes(q) ||
      item.nik.toLowerCase().includes(q) ||
      item.jabatan.toLowerCase().includes(q) ||
      item.departemen.toLowerCase().includes(q) ||
      item.divisiUtama.toLowerCase().includes(q)
    );
  });

  const validRekeningList = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.status === 'AKTIF'
  );

  return (
    <div className="space-y-4">
      {/* Control & Filter Bar */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-md space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
              <Users className="w-4 h-4 text-amber-400" />
              <span>Daftar Karyawan &amp; Rekapitulasi Gaji per Hari Kerja</span>
              <span className="text-[10px] text-amber-300 font-semibold">
                · Tanpa Input Harian = Tidak Masuk
              </span>
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Gaji dihitung murni per hari kerja karyawan (tanpa standar gaji bulanan tetap). Tanggal tanpa input gaji karyawan otomatis dihitung <strong>Tidak Masuk</strong>. Pemotongan bon bersifat fleksibel saat pencairan gaji.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onOpenInputPayrollHarian()}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>+ Input Upah Harian</span>
            </button>

            <button
              onClick={() => {
                try {
                  window.print();
                } catch (e) {
                  console.error(e);
                }
              }}
              className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              title="Cetak format cetak / PDF"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-300" />
              <span>Cetak Rekap</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              title="Ekspor CSV Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-xs">
          {/* Month Selector */}
          <div>
            <label className="block text-[10px] text-zinc-400 font-semibold mb-1 uppercase tracking-wider">
              Bulan Periode:
            </label>
            <select
              value={selectedBulan}
              onChange={(e) => setSelectedBulan(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-hidden focus:border-amber-500"
            >
              {BULAN_LIST.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div>
            <label className="block text-[10px] text-zinc-400 font-semibold mb-1 uppercase tracking-wider">
              Tahun:
            </label>
            <select
              value={selectedTahun}
              onChange={(e) => setSelectedTahun(Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-hidden focus:border-amber-500"
            >
              {TAHUN_LIST.map((y) => (
                <option key={y} value={y}>
                  Tahun {y}
                </option>
              ))}
            </select>
          </div>

          {/* Division Filter */}
          <div>
            <label className="block text-[10px] text-zinc-400 font-semibold mb-1 uppercase tracking-wider">
              Filter Divisi:
            </label>
            <select
              value={selectedDivisi}
              onChange={(e) => setSelectedDivisi(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-hidden focus:border-amber-500"
            >
              <option value="ALL">Semua Divisi (Konsolidasi 6 Unit)</option>
              {DAFTAR_DIVISI.map((d) => (
                <option key={d.id} value={d.nama}>
                  {d.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[10px] text-zinc-400 font-semibold mb-1 uppercase tracking-wider">
              Cari Nama Karyawan:
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari NIK, Nama, Jabatan..."
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {rekapData && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-xs min-w-0 overflow-hidden">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium truncate">Total Karyawan</span>
            <div className="text-xl font-bold font-mono tabular-nums text-zinc-100 mt-0.5 truncate whitespace-nowrap">
              {filteredItems.length} <span className="text-xs font-normal text-zinc-400">Orang</span>
            </div>
            <span className="text-[10px] text-emerald-400 block truncate">Periode {rekapData.periodeBulan}</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-xs min-w-0 overflow-hidden">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium truncate">Total Hari Kerja</span>
            <div className="text-xl font-bold font-mono tabular-nums text-cyan-400 mt-0.5 truncate whitespace-nowrap">
              {rekapData.totalHariKerja} <span className="text-xs font-normal text-zinc-400">Hari</span>
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">Di-input akumulasi harian</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-xs min-w-0 overflow-hidden">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium truncate">Total Gaji Kotor Bulan Ini</span>
            <div
              className="text-lg font-bold font-mono tabular-nums text-emerald-400 mt-0.5 truncate whitespace-nowrap"
              title={formatRupiah(rekapData.totalGajiKotor)}
            >
              {formatRupiahSingkat(rekapData.totalGajiKotor)}
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">Pokok + Uang Makan/Lembur</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-xs min-w-0 overflow-hidden">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium truncate">Total Sisa Bon Aktif</span>
            <div
              className="text-lg font-bold font-mono tabular-nums text-rose-300 mt-0.5 truncate whitespace-nowrap"
              title={formatRupiah(rekapData.totalSisaBonKaryawan)}
            >
              {formatRupiahSingkat(rekapData.totalSisaBonKaryawan)}
            </div>
            <span className="text-[10px] text-rose-400 block truncate">Bon Uang + Produk Barang</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-xs col-span-2 lg:col-span-1 min-w-0 overflow-hidden">
            <span className="text-[10px] text-zinc-400 block uppercase font-medium truncate">Hak Upah Belum Dicairkan</span>
            <div
              className="text-lg font-bold font-mono tabular-nums text-amber-400 mt-0.5 truncate whitespace-nowrap"
              title={formatRupiah(rekapData.totalHakUpahPending)}
            >
              {formatRupiahSingkat(rekapData.totalHakUpahPending)}
            </div>
            <span className="text-[10px] text-zinc-400 block truncate">Status tercatat berjalan</span>
          </div>
        </div>
      )}

      {/* Main Monthly Recap & Employee List Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-3.5 bg-zinc-800/80 border-b border-zinc-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-zinc-100">
              List Nama-Nama Karyawan: {rekapData?.periodeBulan || 'Bulan Berjalan'}
            </span>
            <span className="text-[10px] bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full font-mono">
              {filteredItems.length} Karyawan Terdaftar
            </span>
          </div>

          <div className="text-[11px] text-amber-300 font-medium flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            <span>Klik baris karyawan untuk melihat rincian gaji harian &amp; detail bon barang/uang</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-950 text-zinc-400 uppercase tracking-wider text-[10px] border-b border-zinc-800">
              <tr>
                <th className="py-2.5 px-3">Nama Karyawan</th>
                <th className="py-2.5 px-3">Divisi Utama</th>
                <th className="py-2.5 px-2 text-center">Kehadiran (Masuk / Tidak Masuk)</th>
                <th className="py-2.5 px-3 text-right">Upah Pokok</th>
                <th className="py-2.5 px-3 text-right">Lembur/Makan</th>
                <th className="py-2.5 px-3 text-right" title="Total akumulasi seluruh input gaji harian bulan ini">
                  Total Gaji Kotor (Harian)
                </th>
                <th className="py-2.5 px-3 text-right">Bon Uang</th>
                <th className="py-2.5 px-3 text-right">Bon Barang</th>
                <th className="py-2.5 px-3 text-right">Total Bon Aktif</th>
                <th className="py-2.5 px-3 text-right" title="Hak Upah Belum Dicairkan (Total Gaji Kotor dikurangi Total Bon - Bersifat Kondisional)">
                  Hak Upah (Gaji - Bon)
                </th>
                <th className="py-2.5 px-3 text-center">Status Neraca</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-sans text-xs">
              {loading ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-zinc-400">
                    <div className="flex items-center justify-center space-x-2">
                      <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></span>
                      <span>Memuat daftar karyawan &amp; rekap bulanan...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-zinc-500 font-sans">
                    Tidak ada catatan upah atau karyawan pada periode {rekapData?.periodeBulan} dengan filter yang dipilih.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isExpanded = expandedKaryawanId === item.idKaryawan;
                  const currentSubTab = activeSubTabs[item.idKaryawan] || 'HARIAN';
                  const badgeClass = DIVISI_BADGES[item.divisiUtama] || 'bg-zinc-800 text-zinc-300 border-zinc-700';

                  const rincianBonBarang = item.rincianBonBarang || [];
                  const rincianBonUang = item.rincianBonUang || [];

                  return (
                    <React.Fragment key={item.idKaryawan}>
                      <tr
                        className={`hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-zinc-800/50' : ''
                        }`}
                        onClick={() => handleToggleExpand(item.idKaryawan)}
                      >
                        {/* 1. Karyawan */}
                        <td className="py-3 px-3">
                          <div className="flex items-center space-x-2.5">
                            <button className="text-zinc-500 hover:text-zinc-300 shrink-0">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-amber-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                            </button>
                            <KaryawanAvatar
                              nama={item.nama}
                              fotoUrl={item.fotoUrl}
                              size="sm"
                              theme="dark"
                              title={item.fotoUrl ? `Klik untuk memperbesar foto ${item.nama}` : `Profil & Foto ${item.nama}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.fotoUrl) {
                                  setPreviewFoto({
                                    nama: item.nama,
                                    jabatan: item.jabatan,
                                    divisi: item.divisiAktifSaatIni || item.divisiUtama,
                                    fotoUrl: item.fotoUrl,
                                  });
                                } else {
                                  handleOpenProfilItem(item);
                                }
                              }}
                            />
                            <div>
                              <div className="font-bold text-zinc-100 flex items-center space-x-1.5">
                                <span>{item.nama}</span>
                                <span className="font-mono text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded border border-zinc-700">
                                  {item.nik}
                                </span>
                              </div>
                              <span className="text-[10px] text-zinc-400 block">
                                {item.jabatan} · {item.divisiAktifSaatIni || item.departemen}
                              </span>
                              {(item.saldoTitipHasilPanenMitra || 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onOpenStatement && item.idMitraTerkait) {
                                      onOpenStatement(item.idMitraTerkait);
                                    }
                                  }}
                                  className="mt-1 text-[10px] font-mono tabular-nums text-amber-300 hover:text-amber-200 underline underline-offset-2 text-left block cursor-pointer"
                                  title="Karyawan ini juga memiliki Saldo Titip Hasil Panen di Rekening Mitra"
                                >
                                  Titip Panen Mitra: {formatRupiah(item.saldoTitipHasilPanenMitra || 0)} →
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 2. Divisi & Riwayat Upgrade */}
                        <td className="py-3 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${badgeClass}`}>
                            {item.divisiUtama}
                          </span>
                          {item.divisiAktifSaatIni && item.divisiAktifSaatIni !== item.divisiUtama && (
                            <span className="text-[10px] text-emerald-300 font-semibold block mt-1">
                              Aktif Kini: {item.divisiAktifSaatIni}
                            </span>
                          )}
                          {item.riwayatDivisi && item.riwayatDivisi.length > 0 && (
                            <span
                              className="text-[9px] text-amber-300/90 block mt-0.5"
                              title={`Riwayat mutasi/upgrade: ${
                                item.riwayatDivisi[item.riwayatDivisi.length - 1].divisiSebelumnya
                              } → ${item.riwayatDivisi[item.riwayatDivisi.length - 1].divisiBaru}`}
                            >
                              Upgrade: {item.riwayatDivisi[item.riwayatDivisi.length - 1].divisiSebelumnya} →{' '}
                              {item.riwayatDivisi[item.riwayatDivisi.length - 1].divisiBaru}
                            </span>
                          )}
                          {item.daftarDivisiBekerja.length > 1 && (
                            <span className="text-[9px] text-zinc-400 block mt-0.5">
                              +{item.daftarDivisiBekerja.length - 1} divisi lain
                            </span>
                          )}
                        </td>

                        {/* 3. Total Hari Kerja & Tidak Masuk */}
                        <td className="py-3 px-2 text-center font-mono tabular-nums">
                          <div className="font-bold text-cyan-300">
                            {item.totalHariKerja} Hari Masuk
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            {item.totalHariTidakMasuk ??
                              Math.max(
                                0,
                                new Date(selectedTahun, selectedBulan, 0).getDate() -
                                  item.totalHariKerja
                              )}{' '}
                            Tidak Masuk
                          </div>
                        </td>

                        {/* 4. Upah Pokok */}
                        <td className="py-3 px-3 text-right font-mono text-zinc-300">
                          {formatRupiah(item.totalUpahPokok)}
                        </td>

                        {/* 5. Lembur & Makan */}
                        <td className="py-3 px-3 text-right font-mono text-zinc-400">
                          {item.totalUangMakanLembur > 0 ? `+${formatRupiah(item.totalUangMakanLembur)}` : '-'}
                        </td>

                        {/* 6. Total Gaji Kotor */}
                        <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                          {formatRupiah(item.totalGajiKotor)}
                        </td>

                        {/* 7. Kasbon Uang */}
                        <td className="py-3 px-3 text-right font-mono">
                          <span className={item.sisaKasbonUang > 0 ? 'text-amber-400 font-semibold' : 'text-zinc-500'}>
                            {item.sisaKasbonUang > 0 ? formatRupiah(item.sisaKasbonUang) : '-'}
                          </span>
                        </td>

                        {/* 8. Kasbon Barang Toko */}
                        <td className="py-3 px-3 text-right font-mono">
                          <span className={item.sisaKasbonBarang > 0 ? 'text-rose-400 font-semibold' : 'text-zinc-500'}>
                            {item.sisaKasbonBarang > 0 ? formatRupiah(item.sisaKasbonBarang) : '-'}
                          </span>
                        </td>

                        {/* 9. Total Sisa Bon Aktif */}
                        <td className="py-3 px-3 text-right font-mono">
                          <span className={`font-bold ${item.totalSisaBonKaryawan > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
                            {formatRupiah(item.totalSisaBonKaryawan)}
                          </span>
                        </td>

                        {/* 10. Estimasi Gaji Bersih */}
                        <td className="py-3 px-3 text-right font-mono font-bold">
                          {item.saldoBersih >= 0 ? (
                            <span className="text-emerald-400">{formatRupiah(item.saldoBersih)}</span>
                          ) : (
                            <span className="text-rose-400">-{formatRupiah(Math.abs(item.saldoBersih))}</span>
                          )}
                        </td>

                        {/* 11. Posisi Neraca */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {item.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH' ? (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                              HAK BERSIH +{formatRupiah(item.saldoBersih)}
                            </span>
                          ) : item.posisiStatus === 'KARYAWAN_BERHUTANG_BON' ? (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800">
                              HUTANG BON {formatRupiah(Math.abs(item.saldoBersih))}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                              LUNAS / IMPAS
                            </span>
                          )}
                        </td>

                        {/* 12. Aksi */}
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenProfilItem(item)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-sky-300 border border-zinc-700 rounded transition-colors cursor-pointer"
                              title="Update Profil, Foto & Upgrade Divisi Karyawan"
                            >
                              <UserCog className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() =>
                                onOpenInputPayrollHarian(
                                  item.idKaryawan,
                                  (item.divisiAktifSaatIni as NamaDivisi) || item.divisiUtama
                                )
                              }
                              className="p-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded transition-colors cursor-pointer"
                              title="Input upah harian baru untuk karyawan ini"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => {
                                if (onOpenBayarGaji) {
                                  onOpenBayarGaji(item.idKaryawan);
                                } else {
                                  setSettleKaryawan(item);
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold transition-colors cursor-pointer shadow-xs whitespace-nowrap"
                              title="Bayar gaji bulanan penuh / cairkan akumulasi upah kerja & potong kasbon"
                            >
                              Bayar Gaji
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded Row: Comprehensive Detail Tabs (Harian, Detail Bon, Neraca) */}
                      {isExpanded && (
                        <tr className="bg-zinc-950 border-y-2 border-amber-500/50">
                          <td colSpan={12} className="p-4 sm:p-5 space-y-4">
                            {/* Sub-tab Navigation Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
                              <div className="flex items-center space-x-3">
                                <KaryawanAvatar
                                  nama={item.nama}
                                  fotoUrl={item.fotoUrl}
                                  size="sm"
                                  theme="dark"
                                  onClick={() => {
                                    if (item.fotoUrl) {
                                      setPreviewFoto({
                                        nama: item.nama,
                                        jabatan: item.jabatan,
                                        divisi: item.divisiAktifSaatIni || item.divisiUtama,
                                        fotoUrl: item.fotoUrl,
                                      });
                                    } else {
                                      handleOpenProfilItem(item);
                                    }
                                  }}
                                />
                                <div>
                                  <h3 className="font-bold text-sm text-zinc-100 flex flex-wrap items-center gap-2">
                                    <span>Rincian Lengkap: {item.nama}</span>
                                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                                      {item.nik}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenProfilItem(item)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sky-300 border border-zinc-700 text-[10px] font-semibold cursor-pointer"
                                    >
                                      <UserCog className="w-3 h-3" />
                                      <span>Profil, Foto &amp; Upgrade Divisi</span>
                                    </button>
                                  </h3>
                                  <p className="text-[11px] text-zinc-400">
                                    {item.jabatan} · Divisi Aktif: <strong>{item.divisiAktifSaatIni || item.divisiUtama}</strong> · Periode: <strong className="text-amber-300">{rekapData?.periodeBulan}</strong>
                                  </p>
                                </div>
                              </div>

                              {/* Sub-tab Toggle Buttons */}
                              <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setSubTab(item.idKaryawan, 'HARIAN')}
                                  className={`px-3 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                    currentSubTab === 'HARIAN'
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>1. Rekap Gaji Per Hari ({item.rincianHarian.length})</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setSubTab(item.idKaryawan, 'BON')}
                                  className={`px-3 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                    currentSubTab === 'BON'
                                      ? 'bg-rose-700 text-white shadow-xs'
                                      : 'text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <Receipt className="w-3.5 h-3.5" />
                                  <span>2. Detail Bon Bulan Berjalan ({rincianBonBarang.length + rincianBonUang.length})</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setSubTab(item.idKaryawan, 'NERACA')}
                                  className={`px-3 py-1.5 rounded-md font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer ${
                                    currentSubTab === 'NERACA'
                                      ? 'bg-emerald-700 text-white shadow-xs'
                                      : 'text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <Scale className="w-3.5 h-3.5" />
                                  <span>3. Neraca &amp; Settlement</span>
                                </button>
                              </div>
                            </div>

                            {/* SUB-TAB 1: REKAP GAJI BULAN YANG DI-INPUT PER HARI */}
                            {currentSubTab === 'HARIAN' && (
                              <div className="space-y-3 animate-in fade-in duration-150">
                                {/* Top Controls & KPI Summary */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                                  <div className="flex flex-wrap items-center gap-4 text-xs">
                                    <div>
                                      <span className="text-zinc-400 block text-[10px]">TOTAL HARI KERJA</span>
                                      <strong className="text-zinc-100 font-mono text-sm">{item.totalHariKerja} Hari</strong>
                                    </div>
                                    <div className="border-l border-zinc-800 pl-4">
                                      <span className="text-zinc-400 block text-[10px]">TOTAL UPAH POKOK</span>
                                      <strong className="text-zinc-100 font-mono text-sm">{formatRupiah(item.totalUpahPokok)}</strong>
                                    </div>
                                    <div className="border-l border-zinc-800 pl-4">
                                      <span className="text-zinc-400 block text-[10px]">LEMBUR &amp; MAKAN</span>
                                      <strong className="text-amber-400 font-mono text-sm">{formatRupiah(item.totalUangMakanLembur)}</strong>
                                    </div>
                                    <div className="border-l border-zinc-800 pl-4">
                                      <span className="text-zinc-400 block text-[10px]">TOTAL JUMLAH GAJI</span>
                                      <strong className="text-emerald-400 font-mono text-sm">{formatRupiah(item.totalGajiKotor)}</strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2 shrink-0">
                                    <button
                                      onClick={() => onOpenInputPayrollHarian(item.idKaryawan, item.divisiUtama)}
                                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
                                    >
                                      <PlusCircle className="w-3.5 h-3.5" />
                                      <span>+ Input Gaji Hari {item.nama.split(' ')[0]}</span>
                                    </button>
                                  </div>
                                </div>

                                {item.rincianHarian.length === 0 ? (
                                  <div className="p-6 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center text-zinc-500 text-xs">
                                    Belum ada catatan hari kerja harian yang di-input untuk {item.nama} pada periode {rekapData?.periodeBulan}.
                                  </div>
) : (
                                  /* STANDARD MODERN APP VIEW */
                                  <div className="border border-zinc-800 rounded-lg overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-zinc-900 text-zinc-400 uppercase text-[9px] border-b border-zinc-800">
                                        <tr>
                                          <th className="py-2.5 px-3">TANGGAL KERJA</th>
                                          <th className="py-2.5 px-3">DIVISI</th>
                                          <th className="py-2.5 px-3">PEKERJAAN (ITEM)</th>
                                          <th className="py-2.5 px-2 text-center">QTY</th>
                                          <th className="py-2.5 px-3 text-right">TARIF / HARGA</th>
                                          <th className="py-2.5 px-3 text-right">TOTAL UPAH</th>
                                          <th className="py-2.5 px-2 text-center">STATUS KET</th>
                                          <th className="py-2.5 px-3">CATATAN</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-800/40 font-mono text-[11px]">
                                        {item.rincianHarian.map((log) => (
                                          <tr key={log.id} className="hover:bg-zinc-900/60 transition-colors">
                                            <td className="py-2.5 px-3 text-zinc-200 font-bold whitespace-nowrap">
                                              {log.hariTanggal || log.tanggal}
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap">
                                              <span className={`text-[9px] px-2 py-0.5 rounded border font-semibold ${DIVISI_BADGES[log.divisi] || 'bg-zinc-800 text-zinc-300'}`}>
                                                {log.divisiKode || log.divisi}
                                              </span>
                                            </td>
                                            <td className="py-2.5 px-3 font-sans text-zinc-200 font-medium">
                                              {log.item || log.tugas}
                                            </td>
                                            <td className="py-2.5 px-2 text-center font-bold">
                                              {log.kuantiti !== undefined ? log.kuantiti : (log.totalUpah > 0 ? 1 : 0)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-zinc-300">
                                              {formatRupiah(log.harga !== undefined ? log.harga : log.upahHarian)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                                              {formatRupiah(log.jumlah !== undefined ? log.jumlah : log.totalUpah)}
                                            </td>
                                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                                              {log.ket === 'BON' || log.status === 'TERCATAT' ? (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500 text-zinc-950">
                                                  BON
                                                </span>
                                              ) : (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-sky-500 text-white">
                                                  LUNAS
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-3 font-sans text-zinc-300 text-xs">
                                              {log.catatan || (log.uangMakanLembur > 0 ? `Lembur +${formatRupiah(log.uangMakanLembur)}` : '-')}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                      <tfoot className="bg-zinc-900 font-bold border-t-2 border-zinc-700 text-xs">
                                        <tr>
                                          <td colSpan={5} className="py-2 px-3 text-right uppercase text-zinc-400 text-[10px]">
                                            Total Akumulasi Gaji Harian {item.rincianHarian.length} Hari Kerja:
                                          </td>
                                          <td className="py-2 px-3 text-right font-mono text-emerald-400 text-sm">
                                            {formatRupiah(item.totalGajiKotor)}
                                          </td>
                                          <td colSpan={2}></td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* SUB-TAB 2: DETAIL BON SELAMA SATU BULAN BERJALAN (UANG & PRODUK BARANG) */}
                            {currentSubTab === 'BON' && (
                              <div className="space-y-4 animate-in fade-in duration-150">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-900 p-3 rounded-lg border border-zinc-800 text-xs min-w-0 overflow-hidden">
                                  <div className="flex items-center space-x-3 min-w-0">
                                    <div className="p-2 bg-rose-950 text-rose-400 rounded-lg border border-rose-800 shrink-0">
                                      <ShoppingBag className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-[10px] text-zinc-400 block uppercase truncate">Bon Produk Barang Toko</span>
                                      <strong
                                        className="text-rose-400 font-mono tabular-nums text-base block truncate whitespace-nowrap"
                                        title={formatRupiah(item.sisaKasbonBarang)}
                                      >
                                        {formatRupiahSingkat(item.sisaKasbonBarang)}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3 border-t md:border-t-0 md:border-l border-zinc-800 pt-2 md:pt-0 md:pl-4 min-w-0">
                                    <div className="p-2 bg-amber-950 text-amber-400 rounded-lg border border-amber-800 shrink-0">
                                      <HandCoins className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-[10px] text-zinc-400 block uppercase truncate">Bon Uang Tunai Kasir</span>
                                      <strong
                                        className="text-amber-400 font-mono tabular-nums text-base block truncate whitespace-nowrap"
                                        title={formatRupiah(item.sisaKasbonUang)}
                                      >
                                        {formatRupiahSingkat(item.sisaKasbonUang)}
                                      </strong>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-3 border-t md:border-t-0 md:border-l border-zinc-800 pt-2 md:pt-0 md:pl-4 min-w-0">
                                    <div className="p-2 bg-red-950 text-red-300 rounded-lg border border-red-800 shrink-0">
                                      <Receipt className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-[10px] text-zinc-400 block uppercase truncate">Total Bon Seluruhnya</span>
                                      <strong
                                        className="text-red-400 font-mono tabular-nums text-base block truncate whitespace-nowrap"
                                        title={formatRupiah(item.totalSisaBonKaryawan)}
                                      >
                                        {formatRupiahSingkat(item.totalSisaBonKaryawan)}
                                      </strong>
                                    </div>
                                  </div>
                                </div>

                                {/* 1. DETAIL BON PRODUK BARANG YANG DIJUAL */}
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-zinc-100 flex items-center space-x-2">
                                      <ShoppingBag className="w-4 h-4 text-emerald-400" />
                                      <span>1. Detail Bon Produk Barang Toko (Saprotan, Pupuk, Obat &amp; Sembako)</span>
                                    </h4>
                                    <span className="text-[10px] text-zinc-400">
                                      {rincianBonBarang.length} Transaksi Nota Kasbon
                                    </span>
                                  </div>

                                  {rincianBonBarang.length === 0 ? (
                                    <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center text-zinc-500 text-xs">
                                      Tidak ada catatan kasbon produk barang toko untuk {item.nama} pada bulan berjalan ini.
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      {rincianBonBarang.map((bonBrg) => (
                                        <div
                                          key={bonBrg.noPenjualan}
                                          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xs"
                                        >
                                          {/* Nota Header */}
                                          <div className="p-3 bg-zinc-850 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <div className="flex items-center space-x-3">
                                              <span className="font-mono font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                                                {bonBrg.noPenjualan}
                                              </span>
                                              <span className="text-zinc-400">
                                                {bonBrg.tanggal} · {bonBrg.jam}
                                              </span>
                                              <span className="text-zinc-300 italic">
                                                {bonBrg.keterangan || '-'}
                                              </span>
                                            </div>

                                            <div className="flex items-center space-x-3 font-mono">
                                              <span className="text-[11px] text-zinc-400">
                                                Total Nota: <strong className="text-zinc-200">{formatRupiah(bonBrg.totalNominal)}</strong>
                                              </span>
                                              <span className="text-[11px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800 font-bold">
                                                Sisa Bon: {formatRupiah(bonBrg.sisaPiutang)}
                                              </span>
                                            </div>
                                          </div>

                                          {/* Products Detail Table */}
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-left text-xs">
                                              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[9px] border-b border-zinc-800">
                                                <tr>
                                                  <th className="py-2 px-3">Kode &amp; Nama Produk Barang</th>
                                                  <th className="py-2 px-3 text-center">Jumlah (Qty)</th>
                                                  <th className="py-2 px-3 text-right">Harga Satuan</th>
                                                  <th className="py-2 px-3 text-right">Subtotal</th>
                                                  <th className="py-2 px-3 text-center">Status</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-zinc-800/40 font-mono text-[11px]">
                                                {bonBrg.items.map((prod, idx) => (
                                                  <tr key={idx} className="hover:bg-zinc-800/40">
                                                    <td className="py-2 px-3 font-sans text-zinc-200 font-medium flex items-center space-x-2">
                                                      <Package className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                                      <span>{prod.namaProduk}</span>
                                                      <span className="text-[9px] font-mono text-zinc-500 bg-zinc-800 px-1 py-0.2 rounded">
                                                        {prod.kodeProduk}
                                                      </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-center font-bold text-zinc-100">
                                                      <span className="bg-zinc-800 px-2 py-0.5 rounded text-amber-300">
                                                        {prod.qty} {prod.satuan}
                                                      </span>
                                                    </td>
                                                    <td className="py-2 px-3 text-right text-zinc-300">
                                                      {formatRupiah(prod.harga)}
                                                    </td>
                                                    <td className="py-2 px-3 text-right font-bold text-rose-300">
                                                      {formatRupiah(prod.subtotal)}
                                                    </td>
                                                    <td className="py-2 px-3 text-center">
                                                      <span className="text-[9px] px-2 py-0.5 rounded font-bold bg-rose-950 text-rose-300 border border-rose-800">
                                                        {bonBrg.statusPembayaran}
                                                      </span>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* 2. DETAIL BON UANG TUNAI */}
                                <div className="space-y-2 pt-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-zinc-100 flex items-center space-x-2">
                                      <HandCoins className="w-4 h-4 text-amber-400" />
                                      <span>2. Detail Bon Pinjaman Uang Tunai dari Kasir</span>
                                    </h4>
                                    <span className="text-[10px] text-zinc-400">
                                      {rincianBonUang.length} Catatan Pinjaman Uang
                                    </span>
                                  </div>

                                  {rincianBonUang.length === 0 ? (
                                    <div className="p-4 bg-zinc-900/60 rounded-lg border border-zinc-800 text-center text-zinc-500 text-xs">
                                      Tidak ada catatan pinjaman kasbon uang tunai untuk {item.nama} pada bulan berjalan ini.
                                    </div>
                                  ) : (
                                    <div className="border border-zinc-800 rounded-lg overflow-hidden shadow-sm">
                                      <table className="w-full text-left text-xs">
                                        <thead className="bg-zinc-900 text-zinc-400 uppercase text-[9px] border-b border-zinc-800">
                                          <tr>
                                            <th className="py-2.5 px-3">NO. TRANSAKSI</th>
                                            <th className="py-2.5 px-3">TANGGAL &amp; JAM</th>
                                            <th className="py-2.5 px-3">KETERANGAN / KEPERLUAN</th>
                                            <th className="py-2.5 px-3">KAS SUMBER</th>
                                            <th className="py-2.5 px-3 text-right">NOMINAL PINJAMAN</th>
                                            <th className="py-2.5 px-3 text-right">SISA KASBON UANG</th>
                                            <th className="py-2.5 px-3 text-center">STATUS</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/40 font-mono text-[11px]">
                                          {rincianBonUang.map((bonU) => (
                                            <tr key={bonU.idTransaksi} className="hover:bg-zinc-900/60">
                                              <td className="py-2.5 px-3 text-amber-300 font-bold whitespace-nowrap">
                                                {bonU.idTransaksi}
                                              </td>
                                              <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                                                {bonU.tanggal} · {bonU.jam}
                                              </td>
                                              <td className="py-2.5 px-3 font-sans text-zinc-200">
                                                {bonU.keterangan}
                                              </td>
                                              <td className="py-2.5 px-3">
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                  {bonU.rekeningSumber}
                                                </span>
                                              </td>
                                              <td className="py-2.5 px-3 text-right text-zinc-300 font-bold">
                                                {formatRupiah(bonU.nominal)}
                                              </td>
                                              <td className="py-2.5 px-3 text-right font-bold text-rose-400">
                                                {formatRupiah(bonU.sisaKasbon)}
                                              </td>
                                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                                                  {bonU.status}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* SUB-TAB 3: NERACA BERSIH & SETTLEMENT GAJI */}
                            {currentSubTab === 'NERACA' && (
                              <div className="space-y-4 animate-in fade-in duration-150">
                                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                                  <h4 className="font-bold text-sm text-zinc-100 flex items-center space-x-2">
                                    <Scale className="w-4 h-4 text-emerald-400" />
                                    <span>Perhitungan Neraca Hak Upah Bersih Karyawan: {item.nama}</span>
                                  </h4>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                    <div className="space-y-2 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                                        KOMPONEN HAK UPAH (PENDAPATAN HARIAN)
                                      </span>
                                      <div className="flex justify-between text-zinc-300">
                                        <span>Total Hari Kerja Di-input:</span>
                                        <span className="font-mono font-bold text-zinc-100">{item.totalHariKerja} Hari</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-300">
                                        <span>Upah Pokok Harian:</span>
                                        <span className="font-mono">{formatRupiah(item.totalUpahPokok)}</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-300">
                                        <span>Uang Makan &amp; Lembur:</span>
                                        <span className="font-mono text-amber-400">{formatRupiah(item.totalUangMakanLembur)}</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-100 font-bold pt-2 border-t border-zinc-800 text-sm">
                                        <span>Total Gaji Kotor Bulan Ini:</span>
                                        <span className="font-mono text-emerald-400">{formatRupiah(item.totalGajiKotor)}</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-400 text-[11px] pt-1">
                                        <span>Hak Upah Pending (Belum Cair):</span>
                                        <span className="font-mono text-amber-300 font-bold">{formatRupiah(item.totalHakUpahPending)}</span>
                                      </div>
                                    </div>

                                    <div className="space-y-2 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                                        KEWAJIBAN BON KARYAWAN (PENGURANG)
                                      </span>
                                      <div className="flex justify-between text-zinc-300">
                                        <span>Kasbon Uang Tunai:</span>
                                        <span className="font-mono text-amber-400">{formatRupiah(item.sisaKasbonUang)}</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-300">
                                        <span>Kasbon Barang Toko (Saprotan/Sembako):</span>
                                        <span className="font-mono text-rose-400">{formatRupiah(item.sisaKasbonBarang)}</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-100 font-bold pt-2 border-t border-zinc-800 text-sm">
                                        <span>Total Sisa Bon Berjalan:</span>
                                        <span className="font-mono text-rose-400">{formatRupiah(item.totalSisaBonKaryawan)}</span>
                                      </div>
                                      <div className="flex justify-between text-zinc-400 text-[11px] pt-1">
                                        <span>Potongan Bon Yang Telah Terbayar:</span>
                                        <span className="font-mono text-zinc-300">{formatRupiah(item.totalPotonganBon)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Result Balance Box */}
                                  <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                                        SALDO BERSIH AKHIR (HAK UPAH PENDING DIKURANGI BON)
                                      </span>
                                      <div className="flex items-center space-x-2 mt-1">
                                        <span className={`text-2xl font-black font-mono ${item.saldoBersih >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                          {formatRupiah(Math.abs(item.saldoBersih))}
                                        </span>
                                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                          item.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                            : item.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                            : 'bg-zinc-800 text-zinc-300'
                                        }`}>
                                          {item.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                                            ? 'HAK BERSIH SIAP DICAIRKAN'
                                            : item.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                                            ? 'KARYAWAN MEMILIKI HUTANG BON'
                                            : 'IMPAS / LUNAS'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      {item.totalHakUpahPending > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setSettleKaryawan(item)}
                                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
                                        >
                                          Cairkan Upah &amp; Potong Bon Sekarang
                                        </button>
                                      )}

                                      {onOpenDetailKaryawan && (
                                        <button
                                          type="button"
                                          onClick={() => onOpenDetailKaryawan(item.idKaryawan)}
                                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition-colors cursor-pointer"
                                        >
                                          Buka Slip &amp; Profil Lengkap
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inline Settlement Modal */}
      {settleKaryawan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 text-zinc-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Scale className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Pencairan Hak Upah &amp; Potong Bon</h3>
              </div>
              <button
                onClick={() => setSettleKaryawan(null)}
                className="text-zinc-500 hover:text-zinc-300 text-xs cursor-pointer font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Karyawan:</span>
                <strong className="text-zinc-100">{settleKaryawan.nama} ({settleKaryawan.nik})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Divisi Penugasan:</span>
                <span className="font-semibold text-amber-300">{settleKaryawan.divisiUtama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Total Hari Kerja:</span>
                <span className="font-mono">{settleKaryawan.totalHariKerja} Hari</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Hak Upah Pending:</span>
                <strong className="font-mono text-emerald-400">{formatRupiah(settleKaryawan.totalHakUpahPending)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Sisa Bon Aktif (Barang + Uang):</span>
                <strong className="font-mono text-rose-400">{formatRupiah(settleKaryawan.totalSisaBonKaryawan)}</strong>
              </div>
            </div>

            {settleError && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs">
                {settleError}
              </div>
            )}

            <form onSubmit={handleProcessSettlement} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Rekening Kas Sumber Pencairan:
                </label>
                <select
                  value={settleRekening}
                  onChange={(e) => setSettleRekening(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono"
                >
                  {validRekeningList.map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.nama} ({r.kode}) — Saldo: {formatRupiah(r.saldoSaatIni)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-zinc-300 font-semibold">
                    Kebijakan Potongan Bon (Kondisional):
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium">
                    Fleksibel / Sesuai Persetujuan Karyawan
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setSettleModePotongBon('TIDAK_POTONG')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      settleModePotongBon === 'TIDAK_POTONG'
                        ? 'bg-emerald-950 border-emerald-500 text-emerald-200 ring-1 ring-emerald-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center space-x-1">
                      <span>🟢 Tidak Potong Bon (0%)</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Gaji dibayar utuh tanpa memotong bon berjalan
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettleModePotongBon('LUNASI_PENUH')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      settleModePotongBon === 'LUNASI_PENUH'
                        ? 'bg-amber-950 border-amber-500 text-amber-200 ring-1 ring-amber-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center space-x-1">
                      <span>⚡ Lunasi Seluruh Bon (100%)</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Potong penuh hingga lunas / batas upah
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettleModePotongBon('SEBAGIAN_PERSEN')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      settleModePotongBon === 'SEBAGIAN_PERSEN'
                        ? 'bg-sky-950 border-sky-500 text-sky-200 ring-1 ring-sky-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center space-x-1">
                      <span>📊 Potong Persentase ({settlePersenBon}%)</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Potong sebagian bon bertahap
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettleModePotongBon('SEBAGIAN_NOMINAL')}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      settleModePotongBon === 'SEBAGIAN_NOMINAL'
                        ? 'bg-purple-950 border-purple-500 text-purple-200 ring-1 ring-purple-500'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center space-x-1">
                      <span>✍️ Nominal Kustom (Rp)</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5">
                      Karyawan tentukan nominal potongan sendiri
                    </div>
                  </button>
                </div>

                {/* Additional controls depending on mode */}
                {settleModePotongBon === 'SEBAGIAN_PERSEN' && (
                  <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 mb-3 space-y-1.5">
                    <span className="text-[11px] text-zinc-400 block">Pilih Persentase Bon yang Dipotong:</span>
                    <div className="grid grid-cols-4 gap-2">
                      {[25, 50, 75, 100].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSettlePersenBon(p)}
                          className={`py-1.5 rounded border font-bold text-xs ${
                            settlePersenBon === p
                              ? 'bg-sky-600 border-sky-500 text-white'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {settleModePotongBon === 'SEBAGIAN_NOMINAL' && (
                  <div className="p-2.5 bg-zinc-950 rounded-lg border border-zinc-800 mb-3 space-y-1.5">
                    <span className="text-[11px] text-zinc-400 block">Masukkan Nominal Bon yang Ingin Dipotong:</span>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-zinc-500 font-mono text-xs">Rp</span>
                      <input
                        type="number"
                        min={0}
                        max={settleKaryawan.totalSisaBonKaryawan}
                        step={10000}
                        value={settleNominalKustom || ''}
                        onChange={(e) => setSettleNominalKustom(Math.max(0, Number(e.target.value) || 0))}
                        placeholder={`Maks ${settleKaryawan.totalSisaBonKaryawan}`}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-100 font-mono"
                      />
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      Maksimal potongan: {formatRupiah(Math.min(settleKaryawan.totalHakUpahPending, settleKaryawan.totalSisaBonKaryawan))}
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time calculation preview */}
              <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2 text-xs">
                {(() => {
                  let potongan = 0;
                  if (settleModePotongBon === 'TIDAK_POTONG') {
                    potongan = 0;
                  } else if (settleModePotongBon === 'LUNASI_PENUH') {
                    potongan = Math.min(settleKaryawan.totalHakUpahPending, settleKaryawan.totalSisaBonKaryawan);
                  } else if (settleModePotongBon === 'SEBAGIAN_PERSEN') {
                    potongan = Math.min(
                      settleKaryawan.totalHakUpahPending,
                      Math.round((settleKaryawan.totalSisaBonKaryawan * settlePersenBon) / 100)
                    );
                  } else if (settleModePotongBon === 'SEBAGIAN_NOMINAL') {
                    potongan = Math.min(
                      settleKaryawan.totalHakUpahPending,
                      settleKaryawan.totalSisaBonKaryawan,
                      Number(settleNominalKustom) || 0
                    );
                  }
                  const gajiBersih = Math.max(0, settleKaryawan.totalHakUpahPending - potongan);
                  const sisaBonSetelahnya = Math.max(0, settleKaryawan.totalSisaBonKaryawan - potongan);

                  return (
                    <>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Total Upah Kotor Berjalan:</span>
                        <span className="font-mono text-zinc-200">{formatRupiah(settleKaryawan.totalHakUpahPending)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Potongan Bon Bulan Ini:</span>
                        <span className="font-mono font-bold text-rose-400">
                          {potongan > 0 ? `-${formatRupiah(potongan)}` : 'Rp 0 (Tidak Dipotong)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Sisa Bon Karyawan Setelahnya:</span>
                        <span className="font-mono text-amber-300">{formatRupiah(sisaBonSetelahnya)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
                        <span className="text-zinc-200 font-bold">Gaji Bersih Siap Bayar:</span>
                        <span className="text-base font-bold font-mono text-emerald-400">
                          {formatRupiah(gajiBersih)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleKaryawan(null)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={settleSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-md disabled:opacity-50"
                >
                  {settleSubmitting ? 'Memproses...' : 'Konfirmasi Cairkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {internalProfilKry && (
        <ModalProfilKaryawan
          karyawan={internalProfilKry}
          defaultPeriodeBulan={rekapData?.periodeBulan}
          onClose={() => setInternalProfilKry(null)}
          onSaved={() => {
            setInternalProfilKry(null);
            loadRekap(true);
            onRefreshAll?.();
          }}
        />
      )}

      {previewFoto && (
        <ModalPreviewFotoKaryawan
          nama={previewFoto.nama}
          jabatan={previewFoto.jabatan}
          divisi={previewFoto.divisi}
          fotoUrl={previewFoto.fotoUrl}
          onClose={() => setPreviewFoto(null)}
        />
      )}
    </div>
  );
};
