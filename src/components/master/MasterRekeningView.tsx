import React, { useState } from 'react';
import { Building2, Plus, CheckCircle2, AlertCircle, Info, Landmark, Edit2 } from 'lucide-react';
import { Rekening } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  rekeningList: Rekening[];
  onRefresh: () => void;
}

export const MasterRekeningView: React.FC<Props> = ({ rekeningList, onRefresh }) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRekening, setEditingRekening] = useState<Rekening | null>(null);

  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formAtasNama, setFormAtasNama] = useState('PT Wijaya Agro');
  const [formNomor, setFormNomor] = useState('');
  const [formSaldoAwal, setFormSaldoAwal] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.createRekening({
        kode: formKode,
        nama: formNama,
        atasNama: formAtasNama,
        nomorRekening: formNomor,
        saldoAwal: Number(formSaldoAwal) || 0,
        keterangan: formKeterangan,
      });
      setSuccessMsg(`Rekening ${formKode.toUpperCase()} berhasil ditambahkan`);
      setShowAddModal(false);
      setFormKode('');
      setFormNama('');
      setFormNomor('');
      setFormSaldoAwal('');
      setFormKeterangan('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan rekening');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRekening) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.updateRekening(editingRekening.kode, {
        nama: formNama,
        atasNama: formAtasNama,
        nomorRekening: formNomor,
        status: editingRekening.status,
        keterangan: formKeterangan,
      });
      setSuccessMsg(`Rekening ${editingRekening.kode} berhasil diperbarui`);
      setEditingRekening(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui rekening');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (rek: Rekening) => {
    setEditingRekening(rek);
    setFormNama(rek.nama);
    setFormAtasNama(rek.atasNama);
    setFormNomor(rek.nomorRekening);
    setFormKeterangan(rek.keterangan || '');
    setErrorMsg('');
    setSuccessMsg('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Master Rekening Perusahaan</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
              MODUL 5
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Daftar seluruh rekening kas, bank operasional, serta rekening virtual BON01 & TIT01
          </p>
        </div>

        <button
          onClick={() => {
            setShowAddModal(true);
            setErrorMsg('');
            setSuccessMsg('');
          }}
          className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Rekening Baru</span>
        </button>
      </div>

      {/* Info Rules Box */}
      <div className="p-4 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-900 space-y-1.5">
        <div className="flex items-center space-x-2 font-bold text-purple-950">
          <Info className="w-4 h-4 text-purple-700" />
          <span>Aturan Penting Master Rekening PT Wijaya Agro:</span>
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-purple-900 pl-1 text-[11px]">
          <li>
            <strong>BON01</strong> (Rekening Bon / Piutang Customer) &amp; <strong>TIT01</strong> (Rekening Titip /
            Hutang Supplier) adalah rekening virtual khusus sistem lama.
          </li>
          <li>
            <strong>DILARANG</strong> menggunakan BON01 / TIT01 sebagai rekening sumber untuk Kasbon Uang atau Transfer
            Antar Rekening.
          </li>
          <li>
            Saldo BON01 dan TIT01 otomatis tersinkronisasi 100% dari transaksi kasbon barang, kasbon uang, dan titip hasil
            bumi secara real-time.
          </li>
        </ul>
      </div>

      {/* Notifications */}
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
                <th className="py-3 px-4">NAMA REKENING</th>
                <th className="py-3 px-4">ATAS NAMA</th>
                <th className="py-3 px-4">NOMOR REKENING</th>
                <th className="py-3 px-4 text-right">SALDO AWAL</th>
                <th className="py-3 px-4 text-right">SALDO SAAT INI</th>
                <th className="py-3 px-4 text-center">TIPE / STATUS</th>
                <th className="py-3 px-4 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {rekeningList.map((rek) => (
                <tr key={rek.kode} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <span className="font-mono font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      {rek.kode}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-medium">
                    <div className="flex items-center space-x-2">
                      <Landmark className="w-4 h-4 text-zinc-400" />
                      <span>{rek.nama}</span>
                    </div>
                    {rek.keterangan && <div className="text-[10px] text-zinc-500 pl-6">{rek.keterangan}</div>}
                  </td>
                  <td className="py-3 px-4 text-zinc-600">{rek.atasNama}</td>
                  <td className="py-3 px-4 font-mono text-zinc-600">{rek.nomorRekening}</td>
                  <td className="py-3 px-4 text-right text-zinc-500">{formatRupiah(rek.saldoAwal)}</td>
                  <td className="py-3 px-4 text-right font-bold text-zinc-900">
                    <span className={rek.isVirtual ? 'text-amber-700' : 'text-emerald-700'}>
                      {formatRupiah(rek.saldoSaatIni)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center space-x-1.5">
                      {rek.isVirtual ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                          VIRTUAL SISTEM
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          KAS / BANK RIL
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          rek.status === 'AKTIF' ? 'bg-zinc-100 text-zinc-700' : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {rek.status}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {!rek.isVirtual ? (
                      <button
                        onClick={() => openEdit(rek)}
                        className="p-1 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded transition-colors"
                        title="Edit Rekening"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 italic">Terkunci</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Rekening */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-purple-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Tambah Rekening Bank / Kas Baru</span>
              <button onClick={() => setShowAddModal(false)} className="text-purple-200 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Kode Rekening (Contoh: BSI02, KAS02) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="KODE"
                  value={formKode}
                  onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Rekening <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Bank Mandiri Cabang..."
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Atas Nama <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formAtasNama}
                  onChange={(e) => setFormAtasNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nomor Rekening</label>
                <input
                  type="text"
                  placeholder="Nomor rekening bank atau kode kas"
                  value={formNomor}
                  onChange={(e) => setFormNomor(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Saldo Awal (Rp)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formSaldoAwal}
                  onChange={(e) => setFormSaldoAwal(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Keterangan / Fungsi</label>
                <input
                  type="text"
                  placeholder="Misal: Operasional kasir toko cabang"
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
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
                  className="px-4 py-1.5 bg-purple-700 text-white font-semibold rounded-md hover:bg-purple-800 disabled:opacity-50"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Rekening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Rekening */}
      {editingRekening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-purple-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Edit Rekening: {editingRekening.kode}</span>
              <button onClick={() => setEditingRekening(null)} className="text-purple-200 hover:text-white">
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nama Rekening</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Atas Nama</label>
                <input
                  type="text"
                  required
                  value={formAtasNama}
                  onChange={(e) => setFormAtasNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nomor Rekening</label>
                <input
                  type="text"
                  value={formNomor}
                  onChange={(e) => setFormNomor(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Status Rekening</label>
                <select
                  value={editingRekening.status}
                  onChange={(e) => setEditingRekening({ ...editingRekening, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
                >
                  <option value="AKTIF">AKTIF</option>
                  <option value="NONAKTIF">NONAKTIF</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingRekening(null)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-purple-700 text-white font-semibold rounded-md hover:bg-purple-800 disabled:opacity-50"
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
