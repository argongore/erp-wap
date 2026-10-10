import React, { useState, useMemo } from 'react';
import {
  Database,
  Table,
  Layers,
  Search,
  Download,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
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
  Sparkles,
  ExternalLink,
  Eye,
  X,
  Filter,
  ArrowUpDown,
  Boxes,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  FullErpModularDataset,
  buildModularSpreadsheets,
  downloadAllModularSpreadsheets,
} from '../../utils/modularSpreadsheets.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';
import { GoogleSheetsSyncView } from '../sheets/GoogleSheetsSyncView.tsx';
import { api } from '../../api/client.ts';

interface DatabaseExplorerViewProps {
  erpData: FullErpModularDataset;
  onRefreshAll: () => void;
  onNavigateToTab?: (tab: string) => void;
}

type CollectionKey =
  | 'hasilBumi'
  | 'produkDagang'
  | 'mitra'
  | 'karyawan'
  | 'rekening'
  | 'penjualan'
  | 'pembelianHasilBumi'
  | 'kasbonUang'
  | 'bayarBon'
  | 'auditLogs';

export const DatabaseExplorerView: React.FC<DatabaseExplorerViewProps> = ({
  erpData,
  onRefreshAll,
  onNavigateToTab,
}) => {
  // Main view mode: Studio Database Explorer OR Multi-Spreadsheet Live Sync
  const [mainViewMode, setMainViewMode] = useState<'STUDIO_DATABASE' | 'MULTI_SPREADSHEET'>('STUDIO_DATABASE');

  // Active collection in Studio Database
  const [activeCollection, setActiveCollection] = useState<CollectionKey>('hasilBumi');

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

  // Reset Clean Confirmation Modal
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string>('');

  // Total record statistics
  const totalRecords =
    erpData.stokHasilBumiList.length +
    erpData.produkList.length +
    erpData.mitraList.length +
    erpData.karyawanList.length +
    erpData.rekeningList.length +
    erpData.penjualanList.length +
    erpData.pembelianList.length +
    erpData.kasbonUangList.length +
    erpData.bayarBonList.length +
    erpData.auditLogs.length;

  // Collection metadata definition
  const collectionsMeta: Record<
    CollectionKey,
    {
      id: CollectionKey;
      name: string;
      badge: string;
      badgeColor: string;
      icon: any;
      count: number;
      description: string;
      isFoundation?: boolean;
    }
  > = {
    hasilBumi: {
      id: 'hasilBumi',
      name: '1. Hasil Bumi (1 s/d 8)',
      badge: 'PONDASI ITEM 1-8',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: Wheat,
      count: erpData.stokHasilBumiList.length,
      description: '8 Komoditas panen petani (Termasuk No 8: KOPI TITIP Belum Putus Harga)',
      isFoundation: true,
    },
    produkDagang: {
      id: 'produkDagang',
      name: '2. Produk Dagang Toko (9 s/d 35)',
      badge: 'PONDASI ITEM 9-35',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: Package,
      count: erpData.produkList.length,
      description: '27 Barang yang dibeli dari pemasok untuk dijual (Beras, Pasir, Pupuk, BBM, Kopi Olahan)',
      isFoundation: true,
    },
    mitra: {
      id: 'mitra',
      name: '3. Mitra & Pasukan (Customer / Anak Buah)',
      badge: erpData.mitraList.length === 0 ? 'BERSIH / SIAP REAL' : `${erpData.mitraList.length} MITRA`,
      badgeColor: erpData.mitraList.length === 0 ? 'bg-zinc-100 text-zinc-700 border-zinc-300' : 'bg-sky-100 text-sky-900 border-sky-300',
      icon: Users,
      count: erpData.mitraList.length,
      description: 'Data mitra tani, customer bon, pemasok, dan pasukan lapangan (Input Real Data)',
    },
    karyawan: {
      id: 'karyawan',
      name: '4. Karyawan & Pekerja SDM',
      badge: erpData.karyawanList.length === 0 ? 'BERSIH / SIAP REAL' : `${erpData.karyawanList.length} STAFF`,
      badgeColor: erpData.karyawanList.length === 0 ? 'bg-zinc-100 text-zinc-700 border-zinc-300' : 'bg-purple-100 text-purple-900 border-purple-300',
      icon: Briefcase,
      count: erpData.karyawanList.length,
      description: 'Tenaga kerja, staff divisi, buruh sortir gabah, dan supir armada',
    },
    rekening: {
      id: 'rekening',
      name: '5. Buku Kas & Rekening Perusahaan',
      badge: '11 REKENING',
      badgeColor: 'bg-indigo-100 text-indigo-900 border-indigo-300',
      icon: Building2,
      count: erpData.rekeningList.length,
      description: 'KAS01, Bank BNI, BCA, Virtual BON01 & TIT01, dan 6 Buku Divisi Operasional',
    },
    penjualan: {
      id: 'penjualan',
      name: '6. Transaksi Penjualan Toko',
      badge: 'KASIR PENJUALAN',
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      icon: ShoppingCart,
      count: erpData.penjualanList.length,
      description: 'Penjualan retail, grosir rekanan, dan bon piutang barang toko',
    },
    pembelianHasilBumi: {
      id: 'pembelianHasilBumi',
      name: '7. Pembelian Hasil Bumi & Kopi Titip',
      badge: 'TIMBANGAN PANEN',
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
      icon: ScaleIcon,
      count: erpData.pembelianList.length,
      description: 'Timbangan panen petani, pemotongan rafaksi, dan titip timbang belum putus harga',
    },
    kasbonUang: {
      id: 'kasbonUang',
      name: '8. Kasbon Uang & Saldo Nota Lalu',
      badge: 'PIUTANG & TITIP',
      badgeColor: 'bg-rose-100 text-rose-900 border-rose-300',
      icon: HandCoins,
      count: erpData.kasbonUangList.length,
      description: 'Kasbon kasir berjalan, akumulasi bon barang nota lalu, dan titip uang masa lalu',
    },
    bayarBon: {
      id: 'bayarBon',
      name: '9. Pelunasan & Bayar Bon',
      badge: 'CICILAN / LUNAS',
      badgeColor: 'bg-teal-100 text-teal-900 border-teal-300',
      icon: Receipt,
      count: erpData.bayarBonList.length,
      description: 'Penerimaan pembayaran cicilan atau pelunasan bon piutang mitra',
    },
    auditLogs: {
      id: 'auditLogs',
      name: '10. Audit Log Transaksi Sistem',
      badge: 'KEAMANAN & LOG',
      badgeColor: 'bg-zinc-200 text-zinc-900 border-zinc-400',
      icon: History,
      count: erpData.auditLogs.length,
      description: 'Audit jejak rekam transaksi kasir, mutasi saldo, dan perubahan status',
    },
  };

  // Helper scale icon
  function ScaleIcon(props: any) {
    return <Coffee {...props} />;
  }

  // Active collection items
  const rawActiveData = useMemo(() => {
    switch (activeCollection) {
      case 'hasilBumi':
        return erpData.stokHasilBumiList;
      case 'produkDagang':
        return erpData.produkList;
      case 'mitra':
        return erpData.mitraList;
      case 'karyawan':
        return erpData.karyawanList;
      case 'rekening':
        return erpData.rekeningList;
      case 'penjualan':
        return erpData.penjualanList;
      case 'pembelianHasilBumi':
        return erpData.pembelianList;
      case 'kasbonUang':
        return erpData.kasbonUangList;
      case 'bayarBon':
        return erpData.bayarBonList;
      case 'auditLogs':
        return erpData.auditLogs;
      default:
        return [];
    }
  }, [activeCollection, erpData]);

  // Filtered and sorted collection items
  const filteredData = useMemo(() => {
    let list = [...rawActiveData];
    const q = (tableSearch || globalSearch).trim().toLowerCase();
    if (q) {
      list = list.filter((item: any) =>
        Object.values(item).some((val) =>
          val !== null && val !== undefined && String(val).toLowerCase().includes(q)
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

  // Download full JSON database to local computer
  const handleDownloadDatabaseJson = () => {
    try {
      const fullDb = {
        meta: {
          sistem: 'ERP PT WIJAYA AGRO PERKASA',
          versi: 'v2.4 Production',
          tanggalExport: new Date().toISOString(),
          totalRecords,
        },
        rekening: erpData.rekeningList,
        mitra: erpData.mitraList,
        karyawan: erpData.karyawanList,
        produk: erpData.produkList,
        stokBarang: erpData.stokList,
        stokHasilBumi: erpData.stokHasilBumiList,
        penjualan: erpData.penjualanList,
        pembelianBarang: erpData.pembelianBarangList,
        pembelianHasilBumi: erpData.pembelianList,
        kasbonUang: erpData.kasbonUangList,
        bayarBon: erpData.bayarBonList,
        transferRekening: erpData.transferList,
        auditLogs: erpData.auditLogs,
      };

      const jsonStr = JSON.stringify(fullDb, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DATABASE_BACKUP_WIJAYA_AGRO_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Gagal mendownload database JSON');
    }
  };

  // Execute clean reset
  const handleExecuteResetClean = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/database/reset-clean', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Gagal mereset database');
      setShowResetModal(false);
      setResetSuccessMsg(
        'Database mitra & karyawan berhasil dibersihkan! 35 Master Item Pondasi tetap terjaga sempurna.'
      );
      setTimeout(() => setResetSuccessMsg(''), 6000);
      onRefreshAll();
    } catch (err: any) {
      alert(err.message || 'Gagal mereset');
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
      {/* ============================================================ */}
      {/* 1. TOP HERO BANNER: VISUAL DATABASE STUDIO                   */}
      {/* ============================================================ */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-emerald-950 border border-emerald-900/60 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>DATABASE ENGINE ACTIVE &amp; TERHUBUNG</span>
              </span>
              <span className="text-xs text-zinc-400 font-mono">data/wijaya_agro_erp.json</span>
              <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                10 Tabel Koleksi
              </span>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-bold">
                {totalRecords.toLocaleString('id-ID')} Total Baris Record
              </span>
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center space-x-2.5">
              <Database className="w-7 h-7 text-emerald-400" />
              <span>Studio Database Master &amp; Penjelajah Sistem</span>
            </h1>
            <p className="text-xs text-zinc-300 mt-1.5 max-w-3xl leading-relaxed">
              Arsitektur database mandiri dengan <strong>35 Master Item Pondasi</strong> (No 1 s/d 8 Hasil Bumi termasuk{' '}
              <strong className="text-amber-300">No 8: KOPI TITIP Belum Putus Harga</strong> &amp; No 9 s/d 35 Produk Pemasok).
              Data mitra dan karyawan fleksibel siap diisi data riil. Terintegrasi penuh ke Google Sheets dan Excel!
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Download JSON Backup */}
            <button
              type="button"
              onClick={handleDownloadDatabaseJson}
              className="px-3.5 py-2 bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-lg border border-zinc-700 shadow-xs transition-all flex items-center space-x-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export JSON (.json)</span>
            </button>

            {/* Download All Excel */}
            <button
              type="button"
              onClick={() => downloadAllModularSpreadsheets(buildModularSpreadsheets(erpData))}
              className="px-3.5 py-2 bg-emerald-800/90 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg border border-emerald-600 shadow-xs transition-all flex items-center space-x-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span>Export Excel (.xlsx)</span>
            </button>

            {/* Reset / Bersihkan Mitra & Karyawan Confirmation */}
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold rounded-lg border border-rose-800/80 shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Kosongkan Mitra &amp; Karyawan</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={onRefreshAll}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top Mode Switcher: Studio Explorer vs Multi-Spreadsheet */}
        <div className="mt-6 pt-4 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-1 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setMainViewMode('STUDIO_DATABASE')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mainViewMode === 'STUDIO_DATABASE'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>🗄️ Studio Database Interaktif &amp; Penjelajah Tabel</span>
            </button>

            <button
              type="button"
              onClick={() => setMainViewMode('MULTI_SPREADSHEET')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mainViewMode === 'MULTI_SPREADSHEET'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>📑 Multi-Spreadsheet Terhubung (4 File Live &amp; Drive Sync)</span>
            </button>
          </div>

          {/* Global Quick Search */}
          {mainViewMode === 'STUDIO_DATABASE' && (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Pencarian cepat di database..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500 font-medium"
              />
            </div>
          )}
        </div>
      </div>

      {resetSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center space-x-2 shadow-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">{resetSuccessMsg}</span>
        </div>
      )}

      {/* ============================================================ */}
      {/* 2. MODE SWITCH: MULTI-SPREADSHEET VIEW                       */}
      {/* ============================================================ */}
      {mainViewMode === 'MULTI_SPREADSHEET' ? (
        <GoogleSheetsSyncView erpData={erpData} onRefreshAll={onRefreshAll} />
      ) : (
        /* ============================================================ */
        /* 3. MODE: STUDIO DATABASE INTERAKTIF                          */
        /* ============================================================ */
        <div className="space-y-6">
          {/* Collection Selector Cards Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-600 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>Pilih Tabel Koleksi Database ({Object.keys(collectionsMeta).length} Koleksi)</span>
              </h2>
              <span className="text-[11px] text-zinc-500">
                Klik kartu tabel di bawah untuk membuka data grid dan schema inspector
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
                    className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                      isActive
                        ? 'bg-zinc-900 text-white border-emerald-500 ring-2 ring-emerald-500/40 shadow-lg'
                        : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isActive ? 'bg-emerald-950 text-emerald-400' : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          isActive ? 'bg-zinc-800 text-emerald-300 border-zinc-700' : meta.badgeColor
                        }`}
                      >
                        {meta.count} Baris
                      </span>
                    </div>

                    <div className="text-xs font-bold truncate">{meta.name}</div>
                    <div
                      className={`text-[10px] mt-0.5 line-clamp-1 ${
                        isActive ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {meta.description}
                    </div>

                    {meta.isFoundation && (
                      <span className="absolute bottom-1 right-2 text-[8px] font-mono text-amber-500 font-bold">
                        ★ PONDASI
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Collection Table Inspector */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            {/* Table Toolbar Header */}
            <div className="p-4 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  {React.createElement(collectionsMeta[activeCollection].icon, { className: 'w-4 h-4' })}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-extrabold text-zinc-900">
                      {collectionsMeta[activeCollection].name}
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${collectionsMeta[activeCollection].badgeColor}`}
                    >
                      {filteredData.length} Data Ditampilkan
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {collectionsMeta[activeCollection].description}
                  </p>
                </div>
              </div>

              {/* Filters & Actions in Table Header */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search in active table */}
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

                {/* Density Switcher */}
                <div className="flex items-center space-x-0.5 bg-zinc-200/80 p-0.5 rounded-lg text-[10px] font-semibold text-zinc-700">
                  <button
                    type="button"
                    onClick={() => setTableDensity('compact')}
                    className={`px-2 py-1 rounded transition-colors ${
                      tableDensity === 'compact' ? 'bg-white shadow-2xs font-bold text-zinc-900' : ''
                    }`}
                  >
                    Ringkas
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableDensity('normal')}
                    className={`px-2 py-1 rounded transition-colors ${
                      tableDensity === 'normal' ? 'bg-white shadow-2xs font-bold text-zinc-900' : ''
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableDensity('relaxed')}
                    className={`px-2 py-1 rounded transition-colors ${
                      tableDensity === 'relaxed' ? 'bg-white shadow-2xs font-bold text-zinc-900' : ''
                    }`}
                  >
                    Lega
                  </button>
                </div>

                {/* Quick Add action to go to specific module */}
                {onNavigateToTab && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCollection === 'hasilBumi') onNavigateToTab('kasir-pembelian');
                      else if (activeCollection === 'produkDagang') onNavigateToTab('master-produk');
                      else if (activeCollection === 'mitra') onNavigateToTab('master-mitra');
                      else if (activeCollection === 'karyawan') onNavigateToTab('master-karyawan');
                      else if (activeCollection === 'penjualan') onNavigateToTab('kasir-penjualan');
                      else if (activeCollection === 'pembelianHasilBumi') onNavigateToTab('kasir-pembelian');
                      else if (activeCollection === 'kasbonUang') onNavigateToTab('kasir-kasbon-uang');
                      else onNavigateToTab('dashboard');
                    }}
                    className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Buka Menu Modul</span>
                  </button>
                )}
              </div>
            </div>

            {/* Custom Table Rendering per Collection */}
            <div className="overflow-x-auto">
              {filteredData.length === 0 ? (
                <div className="p-10 text-center text-zinc-400 text-xs">
                  <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <span>
                    {activeCollection === 'mitra' || activeCollection === 'karyawan'
                      ? 'Belum ada data terdaftar (Koleksi bersih siap untuk input data asli).'
                      : 'Tidak ada data yang cocok dengan kriteria pencarian.'}
                  </span>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-700 font-bold uppercase text-[10px] tracking-wider select-none">
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

            {/* Table Footer Summary */}
            <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-zinc-500 gap-2">
              <span>
                Menampilkan <strong>{filteredData.length}</strong> dari{' '}
                <strong>{rawActiveData.length}</strong> data di tabel {collectionsMeta[activeCollection].name}
              </span>
              <div className="flex items-center space-x-4">
                <span>Database File: <strong className="font-mono text-zinc-700">wijaya_agro_erp.json</strong></span>
                <span className="text-emerald-700 font-semibold">● Terverifikasi Sinkron</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 4. MODAL RAW JSON INSPECTOR                                  */}
      {/* ============================================================ */}
      {jsonInspectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-zinc-950 text-zinc-100 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-800 animate-in fade-in">
            <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-sm text-white">{jsonInspectModal.title}</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-800">
                  RAW JSON
                </span>
              </div>
              <button
                onClick={() => setJsonInspectModal({ open: false, title: '', data: null })}
                className="text-zinc-400 hover:text-white"
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
              <span className="text-zinc-400 text-[11px]">
                Struktur tersimpan permanen di database internal ERP Wijaya Agro
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold rounded-lg border border-zinc-700 transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedJson ? 'Disalin!' : 'Salin JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setJsonInspectModal({ open: false, title: '', data: null })}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. MODAL RESET MITRA & KARYAWAN                              */}
      {/* ============================================================ */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-rose-700 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-4 h-4 text-rose-200" />
                <span>Konfirmasi Pembersihan Data Mitra &amp; Karyawan</span>
              </div>
              <button onClick={() => setShowResetModal(false)} className="text-rose-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 text-amber-950 space-y-1">
                <span className="font-bold flex items-center space-x-1">
                  <span>⚠️ Sesuai Instruksi Anda:</span>
                </span>
                <p className="text-[11px] leading-relaxed">
                  Data <strong>Mitra</strong> dan <strong>Karyawan</strong> akan dikosongkan bersih agar Anda dapat memasukkan data asli lapangan.
                </p>
                <p className="text-[11px] text-emerald-900 font-semibold pt-1 border-t border-amber-200">
                  ✓ 35 Master Item Pondasi (Hasil Bumi 1-8 termasuk Kopi Titip &amp; Produk Dagang 9-35) serta Akun Rekening Perusahaan tetap aman dan utuh!
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isResetting}
                  onClick={handleExecuteResetClean}
                  className="px-4 py-1.5 bg-rose-700 text-white font-bold rounded-md hover:bg-rose-800 disabled:opacity-50"
                >
                  {isResetting ? 'Membersihkan...' : 'Ya, Bersihkan Mitra & Karyawan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
      className={`py-3 px-3.5 font-bold ${alignRight ? 'text-right' : 'text-left'} ${
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
    case 'hasilBumi':
      return (
        <tr>
          {th('No / Kode', 'kode')}
          {th('Nama Komoditas', 'nama')}
          {th('Satuan', 'satuan')}
          {th('Stok Fisik Gudang', 'stok', true)}
          {th('Rata-rata Modal Beli (Keluar ÷ Kg)', 'hargaBeliStandar', true)}
          {th('Status Harga & Sifat')}
          {th('Update Terakhir', 'updateTerakhir')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'produkDagang':
      return (
        <tr>
          {th('No / Kode', 'kode')}
          {th('Nama Produk Pemasok', 'nama')}
          {th('Kategori', 'kategori')}
          {th('Satuan', 'satuan')}
          {th('HPP Kulakan Modal', 'hargaBeli', true)}
          {th('Harga Jual Eceran', 'hargaJual', true)}
          {th('Harga Khusus Rekanan', 'hargaKhususRekanan', true)}
          {th('Margin Keuntungan', undefined, true)}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'mitra':
      return (
        <tr>
          {th('Kode Mitra', 'kode')}
          {th('Nama Lengkap', 'nama')}
          {th('Peran / Role', 'role')}
          {th('No. WhatsApp / Telp', 'telepon')}
          {th('Alamat / Desa', 'alamat')}
          {th('Status', 'status')}
          {th('Catatan Lapangan', 'catatan')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'karyawan':
      return (
        <tr>
          {th('Kode Staff', 'kode')}
          {th('Nama Karyawan', 'nama')}
          {th('Departemen / Divisi', 'departemen')}
          {th('Jabatan', 'jabatan')}
          {th('Sistem Pengupahan', 'sistemGaji')}
          {th('Upah / Gaji Pokok', 'upahHarianStandar', true)}
          {th('Status', 'status')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'rekening':
      return (
        <tr>
          {th('Kode', 'kode')}
          {th('Nama Buku Rekening', 'nama')}
          {th('Kategori', 'kategori')}
          {th('Nomor Rekening', 'nomorRekening')}
          {th('Atas Nama', 'atasNama')}
          {th('Saldo Saat Ini (Rp)', 'saldoSaatIni', true)}
          {th('Sifat Rekening')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'penjualan':
      return (
        <tr>
          {th('No. Faktur', 'noPenjualan')}
          {th('Tanggal/Jam', 'tanggal')}
          {th('Mitra / Pembeli', 'namaMitra')}
          {th('Metode Bayar', 'metode')}
          {th('Item Terjual')}
          {th('Total Omzet (Rp)', 'totalNominal', true)}
          {th('Status Bayar', 'statusPembayaran')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'pembelianHasilBumi':
      return (
        <tr>
          {th('No. Slip', 'noPembelian')}
          {th('Tanggal/Jam', 'tanggal')}
          {th('Petani / Supplier', 'namaMitra')}
          {th('Komoditas', 'komoditasNama')}
          {th('Berat Bersih', 'beratBersih', true)}
          {th('Harga Deal / Kg', 'hargaPerKg', true)}
          {th('Total (Rp)', 'totalNominal', true)}
          {th('Status Transaksi')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'kasbonUang':
      return (
        <tr>
          {th('ID Transaksi', 'idTransaksi')}
          {th('Tanggal/Jam', 'tanggal')}
          {th('Nama Mitra / Anak Buah', 'namaMitra')}
          {th('Jenis Transaksi', 'jenisTransaksi')}
          {th('Nominal Diberikan', 'nominal', true)}
          {th('Sisa Kasbon', 'sisaKasbon', true)}
          {th('Sumber Kas / Virtual', 'rekeningSumber')}
          {th('Status')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'bayarBon':
      return (
        <tr>
          {th('No. Bukti', 'noBayarBon')}
          {th('Tanggal/Jam', 'tanggal')}
          {th('Mitra Pembayar', 'namaMitra')}
          {th('Nominal Bayar (Rp)', 'nominalBayar', true)}
          {th('Metode', 'metode')}
          {th('Rekening Penerima', 'rekeningTujuan')}
          {th('Keterangan', 'keterangan')}
          <th className="py-3 px-3 text-center">Raw Data</th>
        </tr>
      );

    case 'auditLogs':
      return (
        <tr>
          {th('Waktu', 'timestamp')}
          {th('User Kasir', 'user')}
          {th('Aksi', 'jenisTransaksi')}
          {th('ID Transaksi', 'idTransaksi')}
          {th('Detail Audit Log', 'detail')}
          {th('Nominal Terkait', 'nominal', true)}
          <th className="py-3 px-3 text-center">Raw Data</th>
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
        className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-mono text-[10px] font-bold transition-colors inline-flex items-center space-x-1 cursor-pointer"
        title="Lihat Raw JSON"
      >
        <Eye className="w-3 h-3 text-emerald-600" />
        <span>JSON</span>
      </button>
    </td>
  );

  switch (collection) {
    case 'hasilBumi': {
      const isKopiTitip = row.kode === 'HB-08' || row.isBelumPutusHarga;
      return (
        <tr
          key={row.kode || idx}
          className={`hover:bg-zinc-50/80 transition-colors ${
            isKopiTitip ? 'bg-amber-50/40 border-l-4 border-amber-500' : ''
          }`}
        >
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>
            No {idx + 1}. {row.kode}
          </td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900 flex items-center space-x-1.5`}>
            {isKopiTitip && <Coffee className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
            <span>{row.nama}</span>
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.satuan}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-amber-900`}>
            {row.stok?.toLocaleString('id-ID')} {row.satuan}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-zinc-800`}>
            {(() => {
              const purchases = (pembelianList || []).filter(
                (p: any) =>
                  p.komoditasKode === row.kode ||
                  p.komoditasNama?.toUpperCase().trim() === row.nama?.toUpperCase().trim()
              );
              const totalUangKeluar = purchases.reduce((sum: number, p: any) => sum + (p.totalNominal || 0), 0);
              const totalKgBeli = purchases.reduce((sum: number, p: any) => sum + (p.beratBersih || 0), 0);
              const rataRataModal = totalKgBeli > 0 && totalUangKeluar > 0 ? Math.round(totalUangKeluar / totalKgBeli) : 0;
              return (
                <div>
                  <div className="font-bold text-emerald-800">
                    {rataRataModal > 0
                      ? `${formatRupiah(rataRataModal)} / Kg`
                      : isKopiTitip
                      ? 'Mengambang'
                      : 'Rp 0 (Belum ada beli)'}
                  </div>
                  {totalKgBeli > 0 && (
                    <div className="text-[10px] text-zinc-400">
                      {formatRupiah(totalUangKeluar)} ÷ {totalKgBeli.toLocaleString('id-ID')} Kg
                    </div>
                  )}
                </div>
              );
            })()}
          </td>
          <td className={`${pyClass} px-3.5`}>
            {isKopiTitip ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                ☕ BELUM PUTUS HARGA (TITIP)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                ✓ HASIL BUMI REGULER
              </span>
            )}
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-500 text-[11px]`}>
            {formatTanggalIndo(row.updateTerakhir)}
          </td>
          {rawBtn}
        </tr>
      );
    }

    case 'produkDagang': {
      const margin = (row.hargaJual || 0) - (row.hargaBeli || 0);
      const marginPct = row.hargaBeli > 0 ? Math.round((margin / row.hargaBeli) * 100) : 0;
      return (
        <tr key={row.kode || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>
            No {idx + 9}. {row.kode}
          </td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5`}>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-zinc-100 text-zinc-700">
              {row.kategori}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.satuan}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-zinc-600`}>
            {formatRupiah(row.hargaBeli)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-emerald-800`}>
            {formatRupiah(row.hargaJual)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-sky-800 font-semibold`}>
            {formatRupiah(row.hargaKhususRekanan || row.hargaJual)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-emerald-700 font-bold`}>
            +{formatRupiah(margin)} ({marginPct}%)
          </td>
          {rawBtn}
        </tr>
      );
    }

    case 'mitra':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5`}>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">
              {row.role}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.telepon || '-'}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.alamat || '-'}</td>
          <td className={`${pyClass} px-3.5`}>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              {row.status}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-500 text-[11px]`}>{row.catatan || '-'}</td>
          {rawBtn}
        </tr>
      );

    case 'karyawan':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>{row.departemen}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-800`}>{row.jabatan}</td>
          <td className={`${pyClass} px-3.5 font-mono text-[10px]`}>{row.sistemGaji}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-zinc-900`}>
            {formatRupiah(row.upahHarianStandar || row.gajiPokokBulanan)}
          </td>
          <td className={`${pyClass} px-3.5`}>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              {row.status}
            </span>
          </td>
          {rawBtn}
        </tr>
      );

    case 'rekening':
      return (
        <tr key={row.kode || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.kode}</td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900`}>{row.nama}</td>
          <td className={`${pyClass} px-3.5`}>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                row.kategori === 'VIRTUAL_SISTEM'
                  ? 'bg-purple-100 text-purple-900'
                  : row.kategori === 'OPERASIONAL_DIVISI'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-zinc-100 text-zinc-800'
              }`}
            >
              {row.kategori}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.nomorRekening}</td>
          <td className={`${pyClass} px-3.5 text-zinc-600`}>{row.atasNama}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-emerald-900`}>
            {formatRupiah(row.saldoSaatIni)}
          </td>
          <td className={`${pyClass} px-3.5`}>
            {row.isVirtual ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                Virtual Kliring
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Kas Riil / Bank
              </span>
            )}
          </td>
          {rawBtn}
        </tr>
      );

    case 'penjualan':
      return (
        <tr key={row.noPenjualan || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.noPenjualan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5`}>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                row.metode === 'KASBON' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {row.metode}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 text-zinc-600 text-[11px]`}>
            {row.items?.map((it: any) => `${it.namaProduk} (${it.qty} ${it.satuan})`).join(', ')}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-zinc-900`}>
            {formatRupiah(row.totalNominal)}
          </td>
          <td className={`${pyClass} px-3.5`}>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                row.statusPembayaran === 'LUNAS'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {row.statusPembayaran}
            </span>
          </td>
          {rawBtn}
        </tr>
      );

    case 'pembelianHasilBumi': {
      const isBelumPutus = row.isBelumPutusHarga || row.status === 'BELUM_PUTUS_HARGA';
      return (
        <tr
          key={row.noPembelian || idx}
          className={`hover:bg-zinc-50/80 transition-colors ${
            isBelumPutus ? 'bg-amber-50/40' : ''
          }`}
        >
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.noPembelian}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-800`}>{row.komoditasNama}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-amber-900`}>
            {row.beratBersih?.toLocaleString('id-ID')} Kg
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-zinc-700`}>
            {isBelumPutus ? 'Mengambang' : formatRupiah(row.hargaPerKg)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-zinc-900`}>
            {isBelumPutus && row.totalNominal === 0 ? 'Rp 0' : formatRupiah(row.totalNominal)}
          </td>
          <td className={`${pyClass} px-3.5`}>
            {isBelumPutus ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                BELUM PUTUS HARGA
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                {row.metodePembayaran} ({row.status})
              </span>
            )}
          </td>
          {rawBtn}
        </tr>
      );
    }

    case 'kasbonUang':
      return (
        <tr key={row.idTransaksi || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.idTransaksi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700`}>
            {row.isNotaLalu ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                NOTA LALU (MANUAL)
              </span>
            ) : (
              <span className="text-zinc-800 font-semibold">KASBON BERJALAN</span>
            )}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-rose-800`}>
            {formatRupiah(row.nominal)}
          </td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-rose-900 font-bold`}>
            {formatRupiah(row.sisaKasbon)}
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-600`}>{row.rekeningSumber}</td>
          <td className={`${pyClass} px-3.5`}>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                row.status === 'LUNAS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {row.status}
            </span>
          </td>
          {rawBtn}
        </tr>
      );

    case 'bayarBon':
      return (
        <tr key={row.noBayarBon || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono font-bold text-zinc-900`}>{row.noBayarBon}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500`}>{row.tanggal} {row.jam}</td>
          <td className={`${pyClass} px-3.5 font-bold text-zinc-900`}>{row.namaMitra}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono font-bold text-emerald-800`}>
            {formatRupiah(row.nominalBayar)}
          </td>
          <td className={`${pyClass} px-3.5`}>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-800">
              {row.metode}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-700`}>{row.rekeningTujuan}</td>
          <td className={`${pyClass} px-3.5 text-zinc-500 text-[11px]`}>{row.keterangan || '-'}</td>
          {rawBtn}
        </tr>
      );

    case 'auditLogs':
      return (
        <tr key={row.id || idx} className="hover:bg-zinc-50/80 transition-colors">
          <td className={`${pyClass} px-3.5 font-mono text-[10px] text-zinc-500`}>{row.timestamp}</td>
          <td className={`${pyClass} px-3.5 font-semibold text-zinc-900`}>{row.user}</td>
          <td className={`${pyClass} px-3.5`}>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                row.jenisTransaksi === 'CREATE'
                  ? 'bg-emerald-100 text-emerald-800'
                  : row.jenisTransaksi === 'UPDATE'
                  ? 'bg-sky-100 text-sky-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {row.jenisTransaksi}
            </span>
          </td>
          <td className={`${pyClass} px-3.5 font-mono text-zinc-800`}>{row.idTransaksi}</td>
          <td className={`${pyClass} px-3.5 text-zinc-700 text-[11px]`}>{row.detail}</td>
          <td className={`${pyClass} px-3.5 text-right font-mono text-zinc-800`}>
            {row.nominal > 0 ? formatRupiah(row.nominal) : '-'}
          </td>
          {rawBtn}
        </tr>
      );

    default:
      return null;
  }
}
