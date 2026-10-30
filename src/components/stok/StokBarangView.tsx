import React, { useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
  Tag,
  Save,
  TrendingUp,
  Search,
} from 'lucide-react';
import { StokBarang, Produk, isKategoriAlatNonStok } from '../../server/types.ts';
import { formatTanggalIndo, formatJamIndo, formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  stokList: StokBarang[];
  produkList?: Produk[];
  onRefresh: () => void;
}

export const StokBarangView: React.FC<Props> = ({ stokList, produkList = [], onRefresh }) => {
  const [selectedItem, setSelectedItem] = useState<StokBarang | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustType, setAdjustType] = useState<'MASUK' | 'KELUAR'>('MASUK');

  // Flexible Price Edit Modal State
  const [editingPriceItem, setEditingPriceItem] = useState<{
    kode: string;
    nama: string;
    satuan: string;
    hargaJual: number;
    hargaBeli: number;
    minimum: number;
    isAlatJasa?: boolean;
  } | null>(null);
  const [formHargaJual, setFormHargaJual] = useState<string>('');
  const [formHargaBeli, setFormHargaBeli] = useState<string>('');
  const [formMinimum, setFormMinimum] = useState<string>('');
  const [savingPrice, setSavingPrice] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Map product pricing for fast lookup
  const productMap = React.useMemo(() => {
    const map = new Map<string, Produk>();
    for (const p of produkList) {
      map.set(p.kode, p);
    }
    return map;
  }, [produkList]);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    const val = Number(adjustQty);
    if (!val || val <= 0) {
      setErrorMsg('Qty penyesuaian harus lebih dari 0');
      setSubmitting(false);
      return;
    }

    const delta = adjustType === 'MASUK' ? val : -val;

    try {
      await api.adjustStok({
        kode: selectedItem.kode,
        penyesuaianQty: delta,
        alasan: `${adjustType === 'MASUK' ? 'Stok Masuk Fisik' : 'Stok Keluar / Susut'} - ${adjustReason || 'Penyesuaian Opname'}`,
      });
      setSuccessMsg(`Stok ${selectedItem.namaProduk} berhasil disesuaikan (${delta > 0 ? '+' : ''}${delta})`);
      setSelectedItem(null);
      setAdjustQty('');
      setAdjustReason('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyesuaikan stok');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPriceModal = (item: StokBarang) => {
    const prod = productMap.get(item.kode);
    const isAlatJasa = isKategoriAlatNonStok(prod?.kategori || item.kategori);
    const hargaJual = prod?.hargaJual || 0;
    const hargaBeli = prod?.hargaBeli || 0;
    const minimum = isAlatJasa ? 0 : item.minimum || 5;

    setEditingPriceItem({
      kode: item.kode,
      nama: item.namaProduk,
      satuan: item.satuan,
      hargaJual,
      hargaBeli,
      minimum,
      isAlatJasa,
    });
    setFormHargaJual(String(hargaJual));
    setFormHargaBeli(String(hargaBeli));
    setFormMinimum(String(minimum));
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriceItem) return;

    const hj = Number(formHargaJual);
    const hb = Number(formHargaBeli);
    const min = Number(formMinimum);

    if (isNaN(hj) || hj < 0) {
      setErrorMsg('Harga jual kasir harus angka valid (minimal Rp 0).');
      return;
    }

    setSavingPrice(true);
    setErrorMsg('');
    try {
      await api.updateProduk(editingPriceItem.kode, {
        hargaJual: hj,
        hargaBeli: hb >= 0 ? hb : 0,
        minimum: editingPriceItem.isAlatJasa ? 0 : min >= 0 ? min : 5,
      });

      setSuccessMsg(`Harga ${editingPriceItem.nama} berhasil diperbarui menjadi ${formatRupiah(hj)}!`);
      setEditingPriceItem(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui harga produk');
    } finally {
      setSavingPrice(false);
    }
  };

  const filteredStok = React.useMemo(() => {
    if (!searchQuery.trim()) return stokList;
    const q = searchQuery.toLowerCase();
    return stokList.filter(
      (s) => s.namaProduk.toLowerCase().includes(q) || s.kode.toLowerCase().includes(q)
    );
  }, [stokList, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Stok Barang Toko &amp; Harga Fleksibel</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-300">
              HARGA FLEKSIBEL
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Monitoring fisik gudang, batasan minimum, serta penyesuaian harga jual kasir sewaktu-waktu
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Cari barang / kode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:ring-1 focus:ring-teal-500"
          />
        </div>
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">KODE</th>
                <th className="py-3 px-4">NAMA PRODUK</th>
                <th className="py-3 px-4 text-center">SATUAN</th>
                <th className="py-3 px-4 text-right">STOK FISIK</th>
                <th className="py-3 px-4 text-right">HARGA JUAL KASIR</th>
                <th className="py-3 px-4 text-right">HARGA BELI (HPP)</th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th className="py-3 px-4 text-center">UPDATE TERAKHIR</th>
                <th className="py-3 px-4 text-center">AKSI / KONTROL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filteredStok.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-zinc-400">
                    Tidak ada produk ditemukan
                  </td>
                </tr>
              ) : (
                filteredStok.map((item) => {
                  const prod = productMap.get(item.kode);
                  const isAlatJasa = isKategoriAlatNonStok(prod?.kategori || item.kategori);
                  const isLow = !isAlatJasa && item.stok <= item.minimum;
                  const hj = prod?.hargaJual || 0;
                  const hb = prod?.hargaBeli || 0;

                  return (
                    <tr key={item.kode} className={`hover:bg-zinc-50/80 transition-colors ${isLow ? 'bg-amber-50/30' : ''}`}>
                      <td className="py-3 px-4 font-mono font-bold text-zinc-900">{item.kode}</td>
                      <td className="py-3 px-4 font-semibold text-zinc-900">{item.namaProduk}</td>
                      <td className="py-3 px-4 text-center text-zinc-600">{item.satuan}</td>
                      <td className="py-3 px-4 text-right font-bold text-sm">
                        {isAlatJasa ? (
                          <span className="text-xs font-semibold text-sky-700">Tanpa Stok</span>
                        ) : (
                          <span className={isLow ? 'text-amber-700 font-mono tabular-nums' : 'text-zinc-900 font-mono tabular-nums'}>
                            {item.stok.toLocaleString('id-ID')}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800 whitespace-nowrap">
                        {formatRupiah(hj)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-500 whitespace-nowrap">
                        {formatRupiah(hb)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isAlatJasa ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 whitespace-nowrap">
                            SEWA JASA
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            <AlertTriangle className="w-3 h-3" />
                            <span>MENIPIS</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            AMAN
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-[11px] text-zinc-500 whitespace-nowrap">
                        {formatTanggalIndo(item.updateTerakhir)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenPriceModal(item)}
                            className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors cursor-pointer shadow-2xs"
                            title="Ubah harga jual / tarif sewa kasir secara fleksibel"
                          >
                            <Tag className="w-3 h-3 text-emerald-600" />
                            <span>Ubah Harga</span>
                          </button>
                          {!isAlatJasa && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedItem(item);
                                setErrorMsg('');
                                setSuccessMsg('');
                                setAdjustQty('');
                                setAdjustReason('');
                              }}
                              className="flex items-center space-x-1 px-2 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors cursor-pointer shadow-2xs"
                              title="Koreksi jumlah stok fisik"
                            >
                              <ArrowUpDown className="w-3 h-3" />
                              <span>Koreksi</span>
                            </button>
                          )}
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

      {/* Modal Adjust Stock */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-teal-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Koreksi / Penyesuaian Stok Gudang</span>
              <button onClick={() => setSelectedItem(null)} className="text-teal-200 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <form onSubmit={handleAdjust} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                <div className="font-semibold text-zinc-900 text-sm">{selectedItem.namaProduk}</div>
                <div className="text-zinc-500 font-mono text-[11px] mt-0.5">Kode: {selectedItem.kode}</div>
                <div className="text-zinc-700 mt-1">
                  Stok Fisik Saat Ini: <strong className="font-mono text-zinc-900">{selectedItem.stok} {selectedItem.satuan}</strong>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Arah Penyesuaian</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('MASUK')}
                    className={`py-2 text-center rounded-lg font-bold border transition-colors cursor-pointer ${
                      adjustType === 'MASUK'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-zinc-100 text-zinc-700 border-zinc-300'
                    }`}
                  >
                    + STOK MASUK
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('KELUAR')}
                    className={`py-2 text-center rounded-lg font-bold border transition-colors cursor-pointer ${
                      adjustType === 'KELUAR'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-zinc-100 text-zinc-700 border-zinc-300'
                    }`}
                  >
                    - STOK KELUAR / SUSUT
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Jumlah Satuan ({selectedItem.satuan}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-teal-600 font-mono text-sm"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Alasan Penyesuaian</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-teal-600"
                  placeholder="Cth: Opname bulanan, kemasan rusak, barang retur"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-800 text-white font-semibold rounded-lg hover:bg-teal-900 disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Flexible Price Change */}
      {editingPriceItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-emerald-800 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-emerald-300" />
                <span>Ubah Harga Jual &amp; HPP Fleksibel</span>
              </div>
              <button
                onClick={() => setEditingPriceItem(null)}
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePrice} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg space-y-1">
                <div className="font-bold text-emerald-950 text-sm">{editingPriceItem.nama}</div>
                <div className="text-[11px] text-zinc-600 flex justify-between">
                  <span>Kode Produk:</span>
                  <span className="font-mono font-bold text-zinc-900">{editingPriceItem.kode}</span>
                </div>
                <div className="text-[11px] text-zinc-600 flex justify-between">
                  <span>Satuan:</span>
                  <span className="font-semibold">{editingPriceItem.satuan}</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Harga Jual Kasir Baru (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-zinc-400">Rp</span>
                  <input
                    type="number"
                    required
                    min={0}
                    value={formHargaJual}
                    onChange={(e) => setFormHargaJual(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono font-bold text-sm text-zinc-900"
                  />
                </div>
                {Number(formHargaJual) > 0 && (
                  <div className="text-[11px] text-emerald-700 font-medium mt-1">
                    Terbilang: {formatRupiah(Number(formHargaJual))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Harga Beli / HPP Modal (Rp)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 font-bold text-zinc-400">Rp</span>
                  <input
                    type="number"
                    min={0}
                    value={formHargaBeli}
                    onChange={(e) => setFormHargaBeli(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono text-zinc-900"
                  />
                </div>
              </div>

              {Number(formHargaJual) > 0 && Number(formHargaBeli) > 0 && (
                <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between text-[11px]">
                  <span className="text-zinc-600">Estimasi Margin Laba Kotor:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    +{formatRupiah(Number(formHargaJual) - Number(formHargaBeli))} (
                    {(((Number(formHargaJual) - Number(formHargaBeli)) / Number(formHargaJual)) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}

              {!editingPriceItem.isAlatJasa && (
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Batas Minimum Stok Aman</label>
                  <input
                    type="number"
                    min={1}
                    value={formMinimum}
                    onChange={(e) => setFormMinimum(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingPriceItem(null)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingPrice || Number(formHargaJual) < 0}
                  className="px-5 py-2 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingPrice ? 'Menyimpan...' : 'Perbarui Harga Kasir'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
