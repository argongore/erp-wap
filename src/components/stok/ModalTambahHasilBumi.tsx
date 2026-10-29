import React, { useState } from 'react';
import { Wheat, X, Plus, AlertTriangle } from 'lucide-react';
import { StokHasilBumi } from '../../server/types.ts';
import { api } from '../../api/client.ts';

interface ModalTambahHasilBumiProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (created: StokHasilBumi) => void;
  existingCount?: number;
}

export const ModalTambahHasilBumi: React.FC<ModalTambahHasilBumiProps> = ({
  isOpen,
  onClose,
  onCreated,
  existingCount = 8,
}) => {
  const [nama, setNama] = useState('');
  const [kode, setKode] = useState('');
  const [satuan, setSatuan] = useState('Kg');
  const [hargaBeliStandar, setHargaBeliStandar] = useState('');
  const [isBelumPutusHarga, setIsBelumPutusHarga] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const suggestedCode = `HB-${String(existingCount + 1).padStart(2, '0')}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!nama.trim()) {
      setErrorMsg('Nama barang hasil bumi wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.createKomoditasHasilBumi({
        nama: nama.trim(),
        kode: kode.trim().toUpperCase() || undefined,
        satuan: satuan.trim() || 'Kg',
        hargaBeliStandar: isBelumPutusHarga ? 0 : Math.max(0, Number(hargaBeliStandar) || 0),
        isBelumPutusHarga,
      });

      setNama('');
      setKode('');
      setSatuan('Kg');
      setHargaBeliStandar('');
      setIsBelumPutusHarga(false);
      onCreated(created);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan barang hasil bumi baru');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Wheat className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Tambah Barang Hasil Bumi Baru
              </h3>
              <p className="text-[11px] text-slate-500">
                Langsung masuk ke pilihan Pembelian &amp; Gudang Stok Hasil Bumi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Nama Barang / Komoditas Hasil Bumi *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Cth: Cengkeh Kering / Pinang / Jagung / Kemiri"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Kode Barang (Otomatis)
              </label>
              <input
                type="text"
                value={kode}
                onChange={(e) => setKode(e.target.value.toUpperCase())}
                placeholder={`Otomatis: ${suggestedCode}`}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Satuan Timbangan
              </label>
              <select
                value={satuan}
                onChange={(e) => setSatuan(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="Kg">Kg (Kilogram)</option>
                <option value="Ton">Ton</option>
                <option value="Karung">Karung / Sak</option>
                <option value="Kuintal">Kuintal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Harga Beli Standar per {satuan} (Rp)
            </label>
            <input
              type="number"
              min="0"
              disabled={isBelumPutusHarga}
              value={isBelumPutusHarga ? '0' : hargaBeliStandar}
              onChange={(e) => setHargaBeliStandar(e.target.value)}
              placeholder="Cth: 25000 (boleh 0 jika harga harian berubah-ubah)"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono disabled:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={isBelumPutusHarga}
              onChange={(e) => setIsBelumPutusHarga(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <div>
              <span className="font-semibold text-slate-800 block">
                Komoditas Sistem Titip Gudang (Belum Putus Harga)
              </span>
              <span className="text-[11px] text-slate-500">
                Centang hanya jika barang ini khusus titipan fisik tanpa putus harga di awal (seperti Kopi Titip).
              </span>
            </div>
          </label>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Barang Baru'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
