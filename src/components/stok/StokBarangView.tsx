import React, { useState } from 'react';
import { Boxes, AlertTriangle, ArrowUpDown, CheckCircle2, AlertCircle } from 'lucide-react';
import { StokBarang } from '../../server/types.ts';
import { formatTanggalIndo, formatJamIndo } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  stokList: StokBarang[];
  onRefresh: () => void;
}

export const StokBarangView: React.FC<Props> = ({ stokList, onRefresh }) => {
  const [selectedItem, setSelectedItem] = useState<StokBarang | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustType, setAdjustType] = useState<'MASUK' | 'KELUAR'>('MASUK');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

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
        alasan: `${adjustType === 'MASUK' ? 'Stok Masuk Fisik' : 'Stok Keluar / Rusak / Susut'} - ${adjustReason || 'Penyesuaian Opname'}`,
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Stok Barang Toko (DB_STOK)</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-teal-100 text-teal-800">
              MODUL 6
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Monitoring posisi fisik gudang, batasan minimum, dan penyesuaian stok berkala
          </p>
        </div>
      </div>

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
                <th className="py-3 px-4 text-right">MINIMUM</th>
                <th className="py-3 px-4 text-center">STATUS STOK</th>
                <th className="py-3 px-4 text-center">UPDATE TERAKHIR</th>
                <th className="py-3 px-4 text-center">PENYESUAIAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {stokList.map((item) => {
                const isLow = item.stok <= item.minimum;
                return (
                  <tr key={item.kode} className={`hover:bg-zinc-50/80 transition-colors ${isLow ? 'bg-amber-50/30' : ''}`}>
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">{item.kode}</td>
                    <td className="py-3 px-4 font-semibold text-zinc-900">{item.namaProduk}</td>
                    <td className="py-3 px-4 text-center text-zinc-600">{item.satuan}</td>
                    <td className="py-3 px-4 text-right font-bold text-sm">
                      <span className={isLow ? 'text-amber-700' : 'text-zinc-900'}>
                        {item.stok.toLocaleString('id-ID')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-500">{item.minimum}</td>
                    <td className="py-3 px-4 text-center">
                      {isLow ? (
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
                    <td className="py-3 px-4 text-center text-[11px] text-zinc-500">
                      {formatTanggalIndo(item.updateTerakhir)} · {formatJamIndo(item.updateTerakhir)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setSelectedItem(item);
                          setErrorMsg('');
                          setSuccessMsg('');
                          setAdjustQty('');
                          setAdjustReason('');
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 transition-colors mx-auto"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        <span>Koreksi Stok</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Adjust Stock */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-teal-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Koreksi / Penyesuaian Stok Gudang</span>
              <button onClick={() => setSelectedItem(null)} className="text-teal-200 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleAdjust} className="p-5 space-y-3.5 text-xs">
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                <div className="font-semibold text-zinc-900">{selectedItem.namaProduk}</div>
                <div className="text-zinc-500 text-[11px] mt-0.5 flex justify-between">
                  <span>Kode: {selectedItem.kode}</span>
                  <span>
                    Stok Saat Ini: <strong>{selectedItem.stok} {selectedItem.satuan}</strong>
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Jenis Penyesuaian</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('MASUK')}
                    className={`py-2 text-center rounded-md font-semibold border ${
                      adjustType === 'MASUK'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300'
                    }`}
                  >
                    + Tambah Stok Masuk
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('KELUAR')}
                    className={`py-2 text-center rounded-md font-semibold border ${
                      adjustType === 'KELUAR'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300'
                    }`}
                  >
                    - Kurang Stok / Rusak
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Jumlah ({selectedItem.satuan}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="Jumlah unit"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-teal-600 font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Alasan Penyesuaian / Catatan</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Stok opname akhir bulan / Barang rusak"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-teal-800 text-white font-semibold rounded-md hover:bg-teal-900 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Simpan Penyesuaian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
