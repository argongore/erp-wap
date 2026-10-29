import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Search,
  ShoppingCart,
  PackagePlus,
  RefreshCw,
  Percent,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { LabaRugiSummary, LabaRugiProdukItem } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';

interface Props {
  onNavigateToKasir?: () => void;
  onNavigateToKulakan?: () => void;
}

export const LabaRugiProdukView: React.FC<Props> = ({
  onNavigateToKasir,
  onNavigateToKulakan,
}) => {
  const [data, setData] = useState<LabaRugiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const loadData = async (silentArg?: boolean | React.MouseEvent) => {
    const silent = silentArg === true;
    if (!silent && !data) setLoading(true);
    try {
      const res = await api.getLabaRugiProduk();
      setData(res);
    } catch (err) {
      console.error('Error fetching profit loss:', err);
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

  const items = data?.items || [];

  const filteredItems = items.filter((item) => {
    const matchSearch =
      item.namaProduk.toLowerCase().includes(search.toLowerCase()) ||
      item.kodeProduk.toLowerCase().includes(search.toLowerCase()) ||
      item.kategori.toLowerCase().includes(search.toLowerCase());

    const matchCategory = categoryFilter === 'ALL' || item.kategori === categoryFilter;

    return matchSearch && matchCategory;
  });

  const categories = Array.from(new Set(items.map((i) => i.kategori)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-5 rounded-xl border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-zinc-100">Laporan Laba & Rugi Produk Penjualan</h1>
            <span className="text-xs bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-800">
              PROFIT & LOSS
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Analisis margin keuntungan kotor per produk (Beras, Sembako, Pupuk, dll) berdasarkan harga jual realisasi (hasil nego) dikurangi modal HPP pembelian.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {onNavigateToKulakan && (
            <button
              onClick={onNavigateToKulakan}
              className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <PackagePlus className="w-4 h-4" />
              <span>+ Kulakan Produk</span>
            </button>
          )}

          {onNavigateToKasir && (
            <button
              onClick={onNavigateToKasir}
              className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Buka Kasir Penjualan</span>
            </button>
          )}

          <button
            onClick={loadData}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition-colors"
            title="Segarkan data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Total Omzet Penjualan */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-3 min-w-0 overflow-hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-400 truncate">Total Omzet Penjualan</p>
            <p
              className="text-xl font-bold text-zinc-100 font-mono tabular-nums mt-1 truncate whitespace-nowrap"
              title={formatRupiah(data?.totalOmzet || 0)}
            >
              {formatRupiahSingkat(data?.totalOmzet || 0)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 truncate">
              Dari {data?.totalPenjualanTransaksi || 0} transaksi kasir
            </p>
          </div>
          <div className="p-3 bg-sky-950/80 border border-sky-800/60 rounded-xl text-sky-400 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Total Modal HPP */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-3 min-w-0 overflow-hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-400 truncate">Total Modal (HPP)</p>
            <p
              className="text-xl font-bold text-zinc-300 font-mono tabular-nums mt-1 truncate whitespace-nowrap"
              title={formatRupiah(data?.totalHppModal || 0)}
            >
              {formatRupiahSingkat(data?.totalHppModal || 0)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 truncate">Harga pokok barang terjual</p>
          </div>
          <div className="p-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-400 shrink-0">
            <Package className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Total Laba Kotor */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-3 min-w-0 overflow-hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-400 truncate">Total Laba Kotor (Gross Profit)</p>
            <p
              className="text-xl font-bold text-emerald-400 font-mono tabular-nums mt-1 truncate whitespace-nowrap"
              title={formatRupiah(data?.totalLabaKotor || 0)}
            >
              {formatRupiahSingkat(data?.totalLabaKotor || 0)}
            </p>
            <p className="text-[11px] text-emerald-400 mt-1 font-semibold flex items-center space-x-1 truncate">
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Omzet dikurangi HPP Modal</span>
            </p>
          </div>
          <div className="p-3 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-emerald-400 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Margin Keuntungan % */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-3 min-w-0 overflow-hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-400 truncate">Rata-rata Margin Keuntungan</p>
            <p className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1 truncate whitespace-nowrap">
              {data?.persentaseMarginRataRata || 0}%
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 truncate">
              Produk Terlaris: <span className="text-zinc-300 font-medium">{data?.produkTerlaris}</span>
            </p>
          </div>
          <div className="p-3 bg-amber-950/80 border border-amber-800/60 rounded-xl text-amber-400 shrink-0">
            <Percent className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 flex-1 max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk berdasarkan nama, kode, atau kategori..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-400">Kategori:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500"
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

        {/* Table of Products */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-800/80 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-700">
              <tr>
                <th className="py-2.5 px-3">Kode & Produk</th>
                <th className="py-2.5 px-3">Kategori</th>
                <th className="py-2.5 px-3 text-right">Terjual</th>
                <th className="py-2.5 px-3 text-right">Total Omzet</th>
                <th className="py-2.5 px-3 text-right">Total HPP Modal</th>
                <th className="py-2.5 px-3 text-right">Laba Kotor</th>
                <th className="py-2.5 px-3 text-center">Margin (%)</th>
                <th className="py-2.5 px-3 text-center">Stok Sisa</th>
                <th className="py-2.5 px-3 text-right">HPP Modal vs Jual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-zinc-500 font-sans text-xs">
                    {loading ? 'Memuat data laba rugi...' : 'Tidak ada produk yang cocok.'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((prod) => {
                  const isUntung = prod.totalLabaKotor >= 0;
                  return (
                    <tr key={prod.kodeProduk} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-sans">
                        <div className="font-bold text-zinc-100">{prod.namaProduk}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{prod.kodeProduk}</div>
                      </td>

                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            prod.kategori === 'BERAS'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : prod.kategori === 'SEMBAKO'
                              ? 'bg-teal-950 text-teal-300 border border-teal-800'
                              : prod.kategori === 'PUPUK'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                          }`}
                        >
                          {prod.kategori}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-sans text-zinc-200">
                        {prod.totalQtyTerjual} {prod.satuan}
                      </td>

                      <td className="py-2.5 px-3 text-right text-zinc-200">
                        {formatRupiah(prod.totalOmzet)}
                      </td>

                      <td className="py-2.5 px-3 text-right text-zinc-400">
                        {formatRupiah(prod.totalHppModal)}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold">
                        <span className={isUntung ? 'text-emerald-400' : 'text-rose-400'}>
                          {isUntung ? '+' : ''}
                          {formatRupiah(prod.totalLabaKotor)}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            prod.persentaseMargin >= 15
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : prod.persentaseMargin > 0
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {prod.persentaseMargin}%
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center font-sans">
                        <span
                          className={`font-semibold ${
                            prod.stokSaatIni <= 15 ? 'text-rose-400 font-bold' : 'text-zinc-300'
                          }`}
                        >
                          {prod.stokSaatIni} {prod.satuan}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-sans text-[11px]">
                        <div className="text-zinc-400">
                          HPP: <span className="font-mono text-zinc-300">{formatRupiah(prod.hargaBeliSaatIni)}</span>
                        </div>
                        <div className="text-zinc-300">
                          Jual: <span className="font-mono text-amber-300 font-bold">{formatRupiah(prod.hargaJualSugesti)}</span>
                        </div>
                        {prod.hargaKhususRekanan && (
                          <div className="text-sky-400 text-[10px]">
                            Rekanan: <span className="font-mono">{formatRupiah(prod.hargaKhususRekanan)}</span>
                          </div>
                        )}
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
  );
};
