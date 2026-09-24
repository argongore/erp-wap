import React, { useState } from 'react';
import { Users, Plus, Edit2, FileSpreadsheet, CheckCircle2, AlertCircle } from 'lucide-react';
import { Mitra, RoleMitra } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { ActiveTab } from '../layout/Sidebar.tsx';

interface Props {
  mitraList: Mitra[];
  onRefresh: () => void;
  onOpenStatement: (idMitra: string) => void;
}

export const MasterMitraView: React.FC<Props> = ({ mitraList, onRefresh, onOpenStatement }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMitra, setEditingMitra] = useState<Mitra | null>(null);

  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formRole, setFormRole] = useState<RoleMitra>('MITRA_TANI');
  const [formTelepon, setFormTelepon] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formCatatan, setFormCatatan] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.createMitra({
        kode: formKode,
        nama: formNama,
        role: formRole,
        telepon: formTelepon,
        alamat: formAlamat,
        catatan: formCatatan,
      });
      setSuccessMsg(`Mitra ${formNama} berhasil ditambahkan`);
      setShowAddModal(false);
      setFormKode('');
      setFormNama('');
      setFormTelepon('');
      setFormAlamat('');
      setFormCatatan('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMitra) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.updateMitra(editingMitra.id, {
        nama: formNama,
        role: formRole,
        telepon: formTelepon,
        alamat: formAlamat,
        status: editingMitra.status,
        catatan: formCatatan,
      });
      setSuccessMsg(`Data mitra ${formNama} berhasil diperbarui`);
      setEditingMitra(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui mitra');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (m: Mitra) => {
    setEditingMitra(m);
    setFormNama(m.nama);
    setFormRole(m.role);
    setFormTelepon(m.telepon);
    setFormAlamat(m.alamat);
    setFormCatatan(m.catatan || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Master Mitra Bisnis</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
              MODUL 4
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Daftar petani binaan, pelanggan toko saprotan, dan pemasok hasil bumi PT Wijaya Agro
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-lg shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Mitra Baru</span>
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
                <th className="py-3 px-4">KODE / ID</th>
                <th className="py-3 px-4">NAMA MITRA</th>
                <th className="py-3 px-4">ROLE</th>
                <th className="py-3 px-4">TELEPON</th>
                <th className="py-3 px-4">ALAMAT</th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th className="py-3 px-4 text-center">AKSI / STATEMENT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {mitraList.map((m) => (
                <tr key={m.id} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      {m.kode}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-semibold text-zinc-900">
                    <div>{m.nama}</div>
                    {m.catatan && <div className="text-[10px] text-zinc-400 font-normal">{m.catatan}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        m.role === 'MITRA_TANI'
                          ? 'bg-emerald-100 text-emerald-800'
                          : m.role === 'CUSTOMER'
                          ? 'bg-sky-100 text-sky-800'
                          : m.role === 'SUPPLIER'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-600">{m.telepon}</td>
                  <td className="py-3 px-4 text-zinc-600 max-w-xs truncate">{m.alamat}</td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        m.status === 'AKTIF' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => onOpenStatement(m.id)}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors"
                        title="Buka Rekening Koran"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Rekening Koran</span>
                      </button>
                      <button
                        onClick={() => openEdit(m)}
                        className="p-1 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded"
                        title="Edit Mitra"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Mitra */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-sky-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Tambah Mitra Baru</span>
              <button onClick={() => setShowAddModal(false)} className="text-sky-200 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Kode Mitra (Opsional, contoh: BUDI02)</label>
                <input
                  type="text"
                  placeholder="Otomatis jika dikosongkan"
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Mitra <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nama lengkap petani atau toko"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Role / Klasifikasi <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                >
                  <option value="MITRA_TANI">MITRA_TANI (Petani Binaan / Pemasok Komoditas)</option>
                  <option value="CUSTOMER">CUSTOMER (Pembeli Sarana Produksi / Saprotan)</option>
                  <option value="SUPPLIER">SUPPLIER (Pemasok Komoditas / Barang)</option>
                  <option value="ALL">ALL (Pelanggan Sekaligus Pemasok)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nomor Telepon / WhatsApp</label>
                <input
                  type="text"
                  placeholder="0812xxxxxxxx"
                  value={formTelepon}
                  onChange={(e) => setFormTelepon(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Alamat Domisili / Lahan</label>
                <textarea
                  rows={2}
                  placeholder="Desa, Kecamatan, Kabupaten..."
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Catatan Tambahan</label>
                <input
                  type="text"
                  placeholder="Luas lahan atau komoditas utama"
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
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
                  className="px-4 py-1.5 bg-sky-700 text-white font-semibold rounded-md hover:bg-sky-800 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Mitra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Mitra */}
      {editingMitra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-sky-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Edit Mitra: {editingMitra.nama}</span>
              <button onClick={() => setEditingMitra(null)} className="text-sky-200 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nama Mitra</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Role / Klasifikasi</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                >
                  <option value="MITRA_TANI">MITRA_TANI</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                  <option value="SUPPLIER">SUPPLIER</option>
                  <option value="ALL">ALL</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Status Keaktifan</label>
                <select
                  value={editingMitra.status}
                  onChange={(e) => setEditingMitra({ ...editingMitra, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                >
                  <option value="AKTIF">AKTIF</option>
                  <option value="NONAKTIF">NONAKTIF</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Telepon</label>
                <input
                  type="text"
                  value={formTelepon}
                  onChange={(e) => setFormTelepon(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Alamat</label>
                <textarea
                  rows={2}
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-sky-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingMitra(null)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-sky-700 text-white font-semibold rounded-md hover:bg-sky-800 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Perbarui'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
