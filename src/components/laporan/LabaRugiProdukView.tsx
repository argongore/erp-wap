import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Package,
  Search,
  ShoppingCart,
  PackagePlus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  Building2,
  Receipt,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  LabaRugiSummary,
  LabaRugiDivisiSummary,
  LabaRugiDivisiItem,
  ItemDivisi,
  isKategoriAlatNonStok,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { DivisiLogoAvatar, resolveDivisiLogoUrl } from '../common/DivisiLogoAvatar.tsx';

interface Props {
  readOnly?: boolean;
  divisiMasterList?: ItemDivisi[];
  onNavigateToKasir?: () => void;
  onNavigateToKulakan?: () => void;
  onNavigateToPengeluaran?: () => void;
  onNavigateToDivisi?: () => void;
}

type ReportViewMode = 'DIVISI' | 'PRODUK';
type DivisiFilterStatus = 'ALL' | 'UNTUNG' | 'RUGI' | 'AKTIF';
type RincianArusFilter = 'ALL' | 'MASUK' | 'KELUAR';

export const LabaRugiProdukView: React.FC<Props> = ({
  readOnly = false,
  divisiMasterList = [],
  onNavigateToKasir,
  onNavigateToKulakan,
  onNavigateToPengeluaran,
  onNavigateToDivisi,
}) => {
  const [data, setData] = useState<LabaRugiSummary | null>(null);
  const [divisiSummaryFallback, setDivisiSummaryFallback] = useState<LabaRugiDivisiSummary | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ReportViewMode>('DIVISI');

  // Division filters & drilldown state
  const [divisiSearch, setDivisiSearch] = useState('');
  const [divisiStatusFilter, setDivisiStatusFilter] = useState<DivisiFilterStatus>('ALL');
  const [expandedDivisiId, setExpandedDivisiId] = useState<string | null>(null);
  const [rincianArusFilter, setRincianArusFilter] = useState<RincianArusFilter>('ALL');

  // Product margin reference filters
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const loadData = async (silentArg?: boolean | React.MouseEvent) => {
    const silent = silentArg === true;
    if (!silent && !data) setLoading(true);
    try {
      const [prodRes, divRes] = await Promise.all([
        api.getLabaRugiProduk(),
        api.getLabaRugiDivisi().catch(() => null),
      ]);
      setData(prodRes);
      if (divRes) {
        setDivisiSummaryFallback(divRes);
      } else if (prodRes?.perDivisi) {
        setDivisiSummaryFallback(prodRes.perDivisi);
      }
    } catch (err) {
      console.error('Error fetching profit loss:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData(false);
    const onErpUpdated = () => {
      void loadData(true);
    };
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  const perDivisi: LabaRugiDivisiSummary | null = useMemo(
    () => divisiSummaryFallback || data?.perDivisi || null,
    [divisiSummaryFallback, data]
  );

  const divisiItems: LabaRugiDivisiItem[] = useMemo(
    () => perDivisi?.items || [],
    [perDivisi]
  );

  const filteredDivisiItems = useMemo(() => {
    const q = divisiSearch.trim().toLowerCase();
    return divisiItems.filter((d) => {
      const masuk = d.uangMasuk ?? d.penjualanKasMasuk ?? 0;
      const keluar =
        d.uangKeluar ??
        (d.pembelianKasKeluar || 0) +
          (d.biayaPengeluaranOperasional || 0) +
          (d.biayaGajiKaryawan || 0);
      const selisih = masuk - keluar;

      if (divisiStatusFilter === 'UNTUNG' && selisih <= 0) return false;
      if (divisiStatusFilter === 'RUGI' && selisih >= 0) return false;
      if (divisiStatusFilter === 'AKTIF' && masuk === 0 && keluar === 0) {
        return false;
      }
      if (!q) return true;
      return (
        d.divisi.toLowerCase().includes(q) ||
        d.kodeRekening.toLowerCase().includes(q) ||
        (d.penanggungJawab || '').toLowerCase().includes(q) ||
        (d.deskripsi || '').toLowerCase().includes(q)
      );
    });
  }, [divisiItems, divisiSearch, divisiStatusFilter]);

  const productItems = useMemo(() => data?.items || [], [data]);

  const filteredProductItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return productItems.filter((item) => {
      const matchSearch =
        !q ||
        item.namaProduk.toLowerCase().includes(q) ||
        item.kodeProduk.toLowerCase().includes(q) ||
        item.kategori.toLowerCase().includes(q);
      const matchCategory = categoryFilter === 'ALL' || item.kategori === categoryFilter;
      return matchSearch && matchCategory;
    });
  }, [productItems, productSearch, categoryFilter]);

  const categories = useMemo(
    () => Array.from(new Set(productItems.map((i) => i.kategori))),
    [productItems]
  );

  const totalMasukAll =
    perDivisi?.totalUangMasukSemuaDivisi ??
    divisiItems.reduce((s, d) => s + (d.uangMasuk ?? d.penjualanKasMasuk ?? 0), 0);
  const totalKeluarAll =
    perDivisi?.totalUangKeluarSemuaDivisi ??
    divisiItems.reduce(
      (s, d) =>
        s +
        (d.uangKeluar ??
          (d.pembelianKasKeluar || 0) +
            (d.biayaPengeluaranOperasional || 0) +
            (d.biayaGajiKaryawan || 0)),
      0
    );
  const netAllDivisi = totalMasukAll - totalKeluarAll;
  const isNetAllPositive = netAllDivisi >= 0;

  return (
    <div className="space-y-5 text-slate-900">
      {/* Top Header & Quick Actions */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-700 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Laporan Laba &amp; Rugi Per Divisi Usaha
            </h2>
            <span className="text-xs font-mono font-semibold text-slate-500">
              · {perDivisi?.periode || data?.periode || 'Akumulasi Berjalan'}
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
            Perhitungan laba &amp; rugi dihitung sederhana dari{' '}
            <strong className="text-emerald-800">Uang Masuk (+)</strong> dikurangi{' '}
            <strong className="text-rose-800">Uang Keluar (−)</strong> pada masing-masing divisi operasional.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!readOnly && onNavigateToKasir && (
            <button
              type="button"
              onClick={onNavigateToKasir}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Kasir Penjualan / Sewa</span>
            </button>
          )}

          {!readOnly && onNavigateToKulakan && (
            <button
              type="button"
              onClick={onNavigateToKulakan}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <PackagePlus className="w-3.5 h-3.5 text-slate-500" />
              <span>Pembelian</span>
            </button>
          )}

          {!readOnly && onNavigateToPengeluaran && (
            <button
              type="button"
              onClick={onNavigateToPengeluaran}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Receipt className="w-3.5 h-3.5 text-slate-500" />
              <span>Pengeluaran</span>
            </button>
          )}

          {!readOnly && onNavigateToDivisi && (
            <button
              type="button"
              onClick={onNavigateToDivisi}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Buku Kas Divisi</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void loadData(false)}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl text-xs transition-colors cursor-pointer"
            title="Segarkan laporan laba & rugi"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
          </button>
        </div>
      </div>

      {/* Segmented Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setViewMode('DIVISI')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              viewMode === 'DIVISI'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Utama: Laba &amp; Rugi Per Divisi ({divisiItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('PRODUK')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              viewMode === 'PRODUK'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-slate-500" />
            <span>Referensi Margin Item Produk ({productItems.length})</span>
          </button>
        </div>

        {viewMode === 'DIVISI' && perDivisi?.divisiTeruntung && perDivisi.divisiTeruntung !== '-' && (
          <div className="text-xs text-slate-600">
            Divisi Laba Tertinggi:{' '}
            <strong className="text-emerald-800">{perDivisi.divisiTeruntung}</strong>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* VIEW 1 (PRIMARY): LAPORAN LABA & RUGI PER DIVISI (MASUK vs KELUAR)   */}
      {/* ==================================================================== */}
      {viewMode === 'DIVISI' && (
        <div className="space-y-5">
          {/* Clean 3-Metric Executive Summary: Uang Masuk, Uang Keluar, Laba/Rugi */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
              {/* 1. Total Uang Masuk */}
              <div className="pt-2 sm:pt-0 sm:pr-5 first:pt-0">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Total Uang Masuk (+)</span>
                  <ArrowDownLeft className="w-4 h-4 text-emerald-700 shrink-0" />
                </div>
                <div
                  className="font-mono text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums mt-1.5 truncate"
                  title={formatRupiah(totalMasukAll)}
                >
                  +{formatRupiah(totalMasukAll)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Seluruh uang masuk penjualan, sewa jasa &amp; pelunasan divisi
                </div>
              </div>

              {/* 2. Total Uang Keluar */}
              <div className="pt-4 sm:pt-0 sm:px-5">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Total Uang Keluar (−)</span>
                  <ArrowUpRight className="w-4 h-4 text-rose-700 shrink-0" />
                </div>
                <div
                  className="font-mono text-xl sm:text-2xl font-bold text-rose-700 tabular-nums mt-1.5 truncate"
                  title={formatRupiah(totalKeluarAll)}
                >
                  −{formatRupiah(totalKeluarAll)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Seluruh uang keluar pembelian, operasional &amp; gaji divisi
                </div>
              </div>

              {/* 3. Laba / Rugi Divisi */}
              <div className="pt-4 sm:pt-0 sm:pl-5">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Laba / Rugi Seluruh Divisi</span>
                  {isNetAllPositive ? (
                    <TrendingUp className="w-4 h-4 text-emerald-700 shrink-0" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-rose-700 shrink-0" />
                  )}
                </div>
                <div
                  className={`font-mono text-xl sm:text-2xl font-bold tabular-nums mt-1.5 truncate ${
                    isNetAllPositive ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                  title={formatRupiah(netAllDivisi)}
                >
                  {isNetAllPositive ? '+' : ''}
                  {formatRupiah(netAllDivisi)}
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-1">
                  Selisih Uang Masuk − Uang Keluar ({perDivisi?.marginBersihRataRata ?? 0}%)
                </div>
              </div>
            </div>
          </div>

          {/* Division Table Container */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Search & Status Filter Bar */}
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={divisiSearch}
                  onChange={(e) => setDivisiSearch(e.target.value)}
                  placeholder="Cari nama divisi, kode rekening, atau penanggung jawab..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start md:self-auto">
                {(
                  [
                    { id: 'ALL', label: `Semua (${divisiItems.length})` },
                    { id: 'AKTIF', label: 'Ada Transaksi' },
                    { id: 'UNTUNG', label: 'Untung' },
                    { id: 'RUGI', label: 'Rugi' },
                  ] as Array<{ id: DivisiFilterStatus; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDivisiStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      divisiStatusFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clean 3-Metric Division Profit & Loss Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-3 px-4">Divisi Usaha</th>
                    <th className="py-3 px-4 text-right">Uang Masuk (+)</th>
                    <th className="py-3 px-4 text-right">Uang Keluar (−)</th>
                    <th className="py-3 px-4 text-right">Laba / Rugi</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Rincian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && filteredDivisiItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        Memuat perhitungan laba &amp; rugi seluruh divisi...
                      </td>
                    </tr>
                  ) : filteredDivisiItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500">
                        Tidak ada divisi yang cocok dengan pencarian atau filter saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredDivisiItems.map((div) => {
                      const isExpanded = expandedDivisiId === div.idDivisi;
                      const uangMasuk = div.uangMasuk ?? div.penjualanKasMasuk ?? 0;
                      const uangKeluar =
                        div.uangKeluar ??
                        (div.pembelianKasKeluar || 0) +
                          (div.biayaPengeluaranOperasional || 0) +
                          (div.biayaGajiKaryawan || 0);
                      const labaRugi = Math.round(uangMasuk - uangKeluar);
                      const hasActivity = uangMasuk > 0 || uangKeluar > 0;
                      const isUntung = labaRugi > 0;
                      const isImpas = labaRugi === 0;

                      const logoResolved = resolveDivisiLogoUrl(
                        div.divisi,
                        div.logoUrl,
                        divisiMasterList
                      );

                      const filteredTx = (div.rincianTransaksi || []).filter((tx) => {
                        const txArus =
                          tx.arus ||
                          (tx.kategori === 'PENJUALAN' || tx.kategori === 'PELUNASAN_PIUTANG'
                            ? 'MASUK'
                            : 'KELUAR');
                        if (rincianArusFilter === 'ALL') return true;
                        return txArus === rincianArusFilter;
                      });

                      return (
                        <React.Fragment key={div.idDivisi}>
                          <tr
                            onClick={() => {
                              setExpandedDivisiId(isExpanded ? null : div.idDivisi);
                              setRincianArusFilter('ALL');
                            }}
                            className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                              isExpanded ? 'bg-emerald-50/30' : ''
                            }`}
                          >
                            {/* Divisi Identity */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3 min-w-[180px]">
                                <DivisiLogoAvatar
                                  namaDivisi={div.divisi}
                                  logoUrl={logoResolved}
                                  size="sm"
                                  theme="light"
                                />
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 truncate">
                                    {div.divisi}
                                  </div>
                                  <div className="text-[11px] text-slate-500 font-mono truncate">
                                    {div.kodeRekening}
                                    {div.penanggungJawab ? ` · ${div.penanggungJawab}` : ''}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Uang Masuk (+) */}
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="font-bold text-emerald-700 text-sm">
                                {uangMasuk > 0 ? `+${formatRupiah(uangMasuk)}` : 'Rp 0'}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {div.jumlahTransaksiMasuk ?? div.jumlahNotaPenjualan ?? 0} transaksi masuk
                              </div>
                            </td>

                            {/* Uang Keluar (-) */}
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="font-bold text-rose-700 text-sm">
                                {uangKeluar > 0 ? `−${formatRupiah(uangKeluar)}` : 'Rp 0'}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {div.jumlahTransaksiKeluar ??
                                  (div.jumlahNotaPembelian || 0) +
                                    (div.jumlahTransaksiPengeluaran || 0)}{' '}
                                transaksi keluar
                              </div>
                            </td>

                            {/* Laba / Rugi */}
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                              <div
                                className={`font-bold text-sm ${
                                  labaRugi > 0
                                    ? 'text-emerald-700'
                                    : labaRugi < 0
                                    ? 'text-rose-700'
                                    : 'text-slate-600'
                                }`}
                              >
                                {labaRugi > 0 ? '+' : ''}
                                {formatRupiah(labaRugi)}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Uang Masuk − Uang Keluar
                              </div>
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 text-center whitespace-nowrap">
                              {!hasActivity ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500">
                                  BELUM ADA ARUS
                                </span>
                              ) : isImpas ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700">
                                  IMPAS
                                </span>
                              ) : isUntung ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  UNTUNG ({div.marginBersihPersen}%)
                                </span>
                              ) : (
                                <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                  RUGI
                                </span>
                              )}
                            </td>

                            {/* Expand Toggle */}
                            <td className="py-3.5 px-3 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 text-slate-600">
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </span>
                            </td>
                          </tr>

                          {/* Expanded Per-Division Drill-Down: Strictly Uang Masuk vs Uang Keluar */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={6} className="bg-slate-50/80 px-4 sm:px-6 py-4 border-b border-slate-200">
                                <div className="space-y-4">
                                  {/* 3-Box Formula Summary */}
                                  <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                    <div>
                                      <div className="text-slate-500 font-medium">
                                        Uang Masuk — {div.divisi}
                                      </div>
                                      <div className="font-mono text-base font-bold text-emerald-700 tabular-nums mt-0.5">
                                        +{formatRupiah(uangMasuk)}
                                      </div>
                                      <div className="text-[11px] text-slate-400 mt-0.5">
                                        {div.jumlahTransaksiMasuk ?? 0} transaksi uang masuk
                                      </div>
                                    </div>

                                    <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                                      <div className="text-slate-500 font-medium">
                                        Uang Keluar — {div.divisi}
                                      </div>
                                      <div className="font-mono text-base font-bold text-rose-700 tabular-nums mt-0.5">
                                        −{formatRupiah(uangKeluar)}
                                      </div>
                                      <div className="text-[11px] text-slate-400 mt-0.5">
                                        {div.jumlahTransaksiKeluar ?? 0} transaksi uang keluar
                                      </div>
                                    </div>

                                    <div className="sm:border-l sm:border-slate-100 sm:pl-4">
                                      <div className="text-slate-600 font-semibold">
                                        Laba / Rugi ({div.kodeRekening})
                                      </div>
                                      <div
                                        className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                                          labaRugi >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                        }`}
                                      >
                                        {labaRugi > 0 ? '+' : ''}
                                        {formatRupiah(labaRugi)}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                                        Uang Masuk − Uang Keluar
                                      </div>
                                    </div>
                                  </div>

                                  {/* Filterable Cash-In / Cash-Out Ledger for This Division */}
                                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                      <div className="font-bold text-xs text-slate-900">
                                        Rincian Uang Masuk &amp; Uang Keluar — {div.divisi}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-1">
                                        {(
                                          [
                                            { id: 'ALL', label: 'Semua Arus' },
                                            { id: 'MASUK', label: 'Uang Masuk (+)' },
                                            { id: 'KELUAR', label: 'Uang Keluar (−)' },
                                          ] as Array<{ id: RincianArusFilter; label: string }>
                                        ).map((f) => (
                                          <button
                                            key={f.id}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setRincianArusFilter(f.id);
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                                              rincianArusFilter === f.id
                                                ? 'bg-slate-900 text-white'
                                                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                                            }`}
                                          >
                                            {f.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {filteredTx.length === 0 ? (
                                      <div className="p-6 text-center text-xs text-slate-500">
                                        Belum ada rincian transaksi uang masuk / keluar pada filter ini untuk divisi{' '}
                                        <strong>{div.divisi}</strong>.
                                      </div>
                                    ) : (
                                      <div className="overflow-x-auto max-h-80">
                                        <table className="w-full text-left border-collapse text-xs">
                                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-100 text-[11px] text-slate-500">
                                            <tr>
                                              <th className="py-2 px-3 font-semibold">Tanggal</th>
                                              <th className="py-2 px-3 font-semibold">Arus Uang</th>
                                              <th className="py-2 px-3 font-semibold">Keterangan</th>
                                              <th className="py-2 px-3 font-semibold">Pihak Terkait</th>
                                              <th className="py-2 px-3 font-semibold text-right">Uang Masuk (+)</th>
                                              <th className="py-2 px-3 font-semibold text-right">Uang Keluar (−)</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {filteredTx.map((tx) => {
                                              const isMasuk =
                                                (tx.arus ||
                                                  (tx.kategori === 'PENJUALAN' ||
                                                  tx.kategori === 'PELUNASAN_PIUTANG'
                                                    ? 'MASUK'
                                                    : 'KELUAR')) === 'MASUK';
                                              return (
                                                <tr key={`${tx.kategori}-${tx.id}`} className="hover:bg-slate-50/70">
                                                  <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                                                    {tx.tanggal}{' '}
                                                    <span className="text-[10px] text-slate-400">{tx.jam}</span>
                                                  </td>
                                                  <td className="py-2 px-3 whitespace-nowrap">
                                                    {isMasuk ? (
                                                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                        UANG MASUK
                                                      </span>
                                                    ) : (
                                                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                                        UANG KELUAR
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td
                                                    className="py-2 px-3 text-slate-800 max-w-xs truncate"
                                                    title={tx.keterangan}
                                                  >
                                                    {tx.keterangan}
                                                  </td>
                                                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                                                    {tx.pihakTerkait || '-'}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                                                    {isMasuk ? `+${formatRupiah(tx.nominal)}` : '-'}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold tabular-nums text-rose-700 whitespace-nowrap">
                                                    {!isMasuk ? `−${formatRupiah(tx.nominal)}` : '-'}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </div>
                                </div>
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
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW 2 (SECONDARY): REFERENSI MARGIN KOTOR PER ITEM PRODUK           */}
      {/* ==================================================================== */}
      {viewMode === 'PRODUK' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Referensi Margin Katalog Produk &amp; Jasa Sewa
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tabel bantu untuk mengecek harga jual vs HPP katalog (perhitungan resmi Laba &amp; Rugi tetap mengacu pada tab <strong>Per Divisi</strong>).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setViewMode('DIVISI')}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer shrink-0"
            >
              <span>Kembali ke Laba &amp; Rugi Per Divisi</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Cari produk atau sewa alat berdasarkan nama, kode, atau kategori..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs text-slate-500">Kategori:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:border-emerald-600"
              >
                <option value="ALL">Semua Kategori</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Kode &amp; Produk</th>
                  <th className="py-3 px-3">Kategori</th>
                  <th className="py-3 px-3 text-right">Terjual</th>
                  <th className="py-3 px-3 text-right">Omzet Produk</th>
                  <th className="py-3 px-3 text-right">HPP Modal</th>
                  <th className="py-3 px-3 text-right">Selisih Margin</th>
                  <th className="py-3 px-3 text-right">Margin (%)</th>
                  <th className="py-3 px-4 text-right">Stok Sisa &amp; Harga</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProductItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      {loading ? 'Memuat referensi produk...' : 'Tidak ada produk yang cocok.'}
                    </td>
                  </tr>
                ) : (
                  filteredProductItems.map((prod) => {
                    const isUntung = prod.totalLabaKotor >= 0;
                    const isAlatNonStok = isKategoriAlatNonStok(prod.kategori);
                    return (
                      <tr key={prod.kodeProduk} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{prod.namaProduk}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{prod.kodeProduk}</div>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">{prod.kategori}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                          {prod.totalQtyTerjual} {prod.satuan}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {formatRupiah(prod.totalOmzet)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatRupiah(prod.totalHppModal)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                          <span className={isUntung ? 'text-emerald-700' : 'text-rose-700'}>
                            {isUntung ? '+' : ''}
                            {formatRupiah(prod.totalLabaKotor)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-slate-700">
                          {prod.persentaseMargin}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[11px] whitespace-nowrap">
                          {isAlatNonStok ? (
                            <div className="font-semibold text-sky-700">Tanpa Stok (Sewa Jasa)</div>
                          ) : (
                            <div className="font-semibold text-slate-800">
                              Stok: {prod.stokSaatIni} {prod.satuan}
                            </div>
                          )}
                          <div className="text-slate-500">
                            HPP {formatRupiahSingkat(prod.hargaBeliSaatIni)} · Jual{' '}
                            {formatRupiahSingkat(prod.hargaJualSugesti)}
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
      )}
    </div>
  );
};
