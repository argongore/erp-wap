import React, { useState } from 'react';
import { Package, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { Produk } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  produkList: Produk[];
  onRefresh: () => void;
}

export const MasterProdukView: React.FC<Props> = ({ produkList, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);

  const [formKode, setFormKode] = useState('');
  const [formKategori, setFormKategori] = useState<'PUPUK' | 'PESTISIDA' | 'BENIH' | 'ALAT_PERTANIAN' | 'LAINNYA'>('PUPUK');
  const [formNama, setFormNama] = useState('');
  const [formSatuan, setFormSatuan] = useState('Sak');
  const [formHargaBeli, setFormHargaBeli] = useState('');
  const [formHargaJual, setFormHargaJual] = useState('');
  const [formStokAwal, setFormStokAwal] = useState('50');
  const [formMinimum, setFormMinimum] = useState('10');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.createProduk({
        kode: formKode,
        kategori: formKategori,
        nama: formNama,
        satuan: formSatuan,
        hargaBeli: Number(formHargaBeli) || 0,
        hargaJual: Number(formHargaJual) || 0,
        stokAwal: Number(formStokAwal) || 0,
        minimum: Number(formMinimum) || 5,
      });
      setSuccessMsg(`Produk ${formNama} berhasil didaftarkan`);
      setShowAddModal(false);
      setFormKode('');
      setFormNama('');
      setFormHargaBeli('');
      setFormHargaJual('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mendaftarkan produk');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Master Produk Sarana Pertanian</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              MODUL 3
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Daftar produk pupuk, pestisida, benih, dan alat pertanian yang dijual di kasir
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Produk Baru</span>
        </button>
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
                <th className="py-3 px-4">KATEGORI</th>
                <th className="py-3 px-4">NAMA PRODUK</th>
                <th className="py-3 px-4">SATUAN</th>
                <th className="py-3 px-4 text-right">HARGA BELI (HPP)</th>
                <th className="py-3 px-4 text-right">HARGA JUAL KASIR</th>
                <th className="py-3 px-4 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {produkList.map((p) => (
                <tr key={p.kode} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      {p.kode}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                      {p.kategori}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-zinc-900">{p.nama}</td>
                  <td className="py-3 px-4 font-medium text-zinc-600">{p.satuan}</td>
                  <td className="py-3 px-4 text-right text-zinc-500">{formatRupiah(p.hargaBeli)}</td>
                  <td className="py-3 px-4 text-right font-bold text-emerald-800">{formatRupiah(p.hargaJual)}</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        p.status === 'AKTIF' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Produk */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-emerald-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Tambah Produk Sarana Pertanian Baru</span>
              <button onClick={() => setShowAddModal(false)} className="text-emerald-200 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Kode Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="PRD-NPK..."
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Kategori</label>
                <select
                  value={formKategori}
                  onChange={(e) => setFormKategori(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600"
                >
                  <option value="PUPUK">PUPUK</option>
                  <option value="PESTISIDA">PESTISIDA</option>
                  <option value="BENIH">BENIH</option>
                  <option value="ALAT_PERTANIAN">ALAT PERTANIAN</option>
                  <option value="LAINNYA">LAINNYA</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pupuk NPK 16-16-16 (50kg)"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Satuan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Sak / Botol / Unit"
                    value={formSatuan}
                    onChange={(e) => setFormSatuan(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Stok Awal</label>
                  <input
                    type="number"
                    min="0"
                    value={formStokAwal}
                    onChange={(e) => setFormStokAwal(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Harga Beli (HPP)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={formHargaBeli}
                    onChange={(e) => setFormHargaBeli(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Harga Jual Kasir <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    placeholder="0"
                    value={formHargaJual}
                    onChange={(e) => setFormHargaJual(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Peringatan Stok Minimum</label>
                <input
                  type="number"
                  min="1"
                  value={formMinimum}
                  onChange={(e) => setFormMinimum(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-emerald-600 font-mono"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-700 text-white font-semibold rounded-md hover:bg-emerald-800 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
