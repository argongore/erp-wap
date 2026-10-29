import React, { useState, useEffect } from 'react';
import {
  HandCoins,
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Wallet,
  Landmark,
  ArrowDownRight,
  ShieldCheck,
  FileText,
} from 'lucide-react';
import { Mitra, Rekening } from '../../server/types.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ImageUploadZone } from './ImageUploadZone.tsx';

interface ModalPinjamUangMitraProps {
  isOpen: boolean;
  onClose: () => void;
  mitraList: Mitra[];
  rekeningList?: Rekening[];
  preselectedMitraId?: string;
  onSuccess: (result: any) => void;
}

export const ModalPinjamUangMitra: React.FC<ModalPinjamUangMitraProps> = ({
  isOpen,
  onClose,
  mitraList,
  rekeningList = [],
  preselectedMitraId,
  onSuccess,
}) => {
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');

  const [selectedMitraId, setSelectedMitraId] = useState<string>(
    preselectedMitraId || activeMitras[0]?.id || ''
  );
  const [selectedRekeningKode, setSelectedRekeningKode] = useState<string>('KAS01');
  const [nominalInput, setNominalInput] = useState<string>('5000000');
  const [tanggal, setTanggal] = useState<string>(getWIBTodayString());
  const [noReferensi, setNoReferensi] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoNota, setFotoNota] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [internalRekening, setInternalRekening] = useState<Rekening[]>(rekeningList);

  useEffect(() => {
    if (preselectedMitraId) {
      setSelectedMitraId(preselectedMitraId);
    } else if (!selectedMitraId && activeMitras.length > 0) {
      setSelectedMitraId(activeMitras[0].id);
    }
  }, [preselectedMitraId, activeMitras, selectedMitraId]);

  useEffect(() => {
    if (isOpen) {
      if (!noReferensi) {
        setNoReferensi(`PJM-${Date.now().toString().slice(-4)}`);
      }
      if (rekeningList.length === 0) {
        api.getRekening().then((res) => {
          if (Array.isArray(res)) {
            setInternalRekening(res);
            if (res[0]) setSelectedRekeningKode(res[0].kode);
          }
        }).catch(() => {});
      } else {
        setInternalRekening(rekeningList);
        if (!selectedRekeningKode && rekeningList[0]) {
          setSelectedRekeningKode(rekeningList[0].kode);
        }
      }
    }
  }, [isOpen, rekeningList, noReferensi, selectedRekeningKode]);

  if (!isOpen) return null;

  const nominal = Number(nominalInput) || 0;
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);
  const selectedRekening = internalRekening.find((r) => r.kode === selectedRekeningKode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedMitraId) {
      setErrorMsg('Silakan pilih mitra yang memberikan pinjaman uang.');
      return;
    }

    if (!nominal || nominal <= 0) {
      setErrorMsg('Nominal pinjaman uang harus lebih besar dari Rp 0.');
      return;
    }

    if (!selectedRekeningKode) {
      setErrorMsg('Pilih rekening kasir / bank PT yang menerima dana pinjaman.');
      return;
    }

    setSubmitting(true);
    try {
      const fotos = fotoNota ? fotoNota.split('|||').map((s) => s.trim()).filter(Boolean) : [];
      const result = await api.processPinjamanUangDariMitra({
        idMitra: selectedMitraId,
        nominal,
        rekeningTujuan: selectedRekeningKode,
        tanggal: tanggal || getWIBTodayString(),
        noReferensi: noReferensi.trim() || undefined,
        keterangan: keterangan.trim() || `Pinjaman uang dari PT ke Mitra ${selectedMitra?.nama || ''} (Masuk Saldo Titip Mitra)`,
        fotoNota: fotos[0] || undefined,
        fotoNotaList: fotos.length > 0 ? fotos : undefined,
      });

      onSuccess(result);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mencatat transaksi pinjam uang');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200 my-6 flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 via-teal-900 to-zinc-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300 border border-white/20">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
                Pinjam Uang dari PT ke Mitra
                <span className="text-[10px] bg-emerald-400 text-emerald-950 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Masuk Saldo Titip
                </span>
              </h2>
              <p className="text-xs text-emerald-200/90">
                Penerimaan dana pinjaman dari mitra ke kas/bank PT · Otomatis menambah saldo titip mitra
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs text-zinc-800">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Callout Penjelasan Alur Akuntansi */}
          <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-start space-x-2.5 text-emerald-950">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="font-bold text-emerald-900">Alur Keuangan Otomatis Terpadu:</strong>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                1. Uang pinjaman akan <strong>menambah saldo fisik kasir / rekening bank PT</strong> yang Anda pilih di bawah.<br />
                2. Secara bersamaan, nominal ini otomatis tercatat sebagai <strong>Saldo Titip Mitra</strong> (kewajiban hutang PT kepada mitra) dan terlampir di <strong>Rekening Koran Mitra</strong> lengkap dengan bukti foto nota.<br />
                3. PT dapat melunasi/mengembalikan dana pinjaman kapan saja melalui menu <strong>Pencairan Titipan</strong>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Pilihan Mitra */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5 flex items-center justify-between">
                <span>Mitra Pemberi Pinjaman:</span>
                <span className="text-[10px] font-normal text-zinc-500">Pihak Mitra</span>
              </label>
              <select
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                {activeMitras.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.kode} - {m.nama} ({m.role})
                  </option>
                ))}
              </select>
              {selectedMitra && (
                <div className="mt-1 text-[11px] text-zinc-500 flex items-center justify-between bg-zinc-100/70 px-2.5 py-1 rounded-lg border border-zinc-200">
                  <span>No HP: {selectedMitra.telepon || '-'}</span>
                  <span className="font-semibold text-emerald-700">Role: {selectedMitra.role}</span>
                </div>
              )}
            </div>

            {/* Pilihan Rekening Kas/Bank PT Penerima Dana */}
            <div>
              <label className="block text-xs font-bold text-zinc-700 mb-1.5 flex items-center justify-between">
                <span>Rekening Kas/Bank PT (Uang Masuk):</span>
                <span className="text-[10px] font-normal text-emerald-600 font-semibold">Kas PT Bertambah</span>
              </label>
              <select
                value={selectedRekeningKode}
                onChange={(e) => setSelectedRekeningKode(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                {internalRekening.map((r) => (
                  <option key={r.kode} value={r.kode}>
                    {r.nama} ({r.kode}) · Saldo Saat Ini: {formatRupiah(r.saldoSaatIni)}
                  </option>
                ))}
              </select>
              {selectedRekening && (
                <div className="mt-1 text-[11px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-medium">
                  Dana tunai/transfer akan masuk ke <strong>{selectedRekening.nama}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Nominal Pinjaman */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-700 mb-1.5">
                Nominal Pinjaman Uang (Rp):
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 font-mono text-zinc-400 font-bold text-sm">
                  Rp
                </span>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={nominalInput}
                  onChange={(e) => setNominalInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl pl-11 pr-4 py-2 text-base font-mono font-bold text-zinc-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  required
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">Terbilang:</span>
                <span className="font-mono font-bold text-emerald-700">{formatRupiah(nominal)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[1000000, 2000000, 5000000, 10000000, 25000000, 50000000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setNominalInput(String(amt))}
                    className="px-2 py-0.5 bg-zinc-100 hover:bg-emerald-100 text-zinc-700 hover:text-emerald-800 border border-zinc-200 rounded text-[10px] font-mono transition-colors cursor-pointer"
                  >
                    +{amt / 1000000} Jt
                  </button>
                ))}
              </div>
            </div>

            {/* Tanggal & No Referensi */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Tanggal Pinjaman:</span>
                </label>
                <input
                  type="text"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold text-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1 flex items-center space-x-1">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  <span>No. Bukti / Ref:</span>
                </label>
                <input
                  type="text"
                  value={noReferensi}
                  onChange={(e) => setNoReferensi(e.target.value)}
                  placeholder="PJM-001 / No Kwitansi"
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold text-zinc-900 uppercase"
                />
              </div>
            </div>
          </div>

          {/* Keterangan / Perjanjian */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Keterangan / Tujuan Pinjaman Dana:
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Pinjaman modal panen kopi dari Bapak H. Ahmad / Titipan dana segar operasional pabrik"
              className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
            />
          </div>

          {/* Upload Foto / Capture Nota Fisik / Bukti Transfer */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-800 flex items-center space-x-1.5">
                <Camera className="w-4 h-4 text-emerald-600" />
                <span>Foto Bukti Fisik Nota / Kwitansi Pinjaman / Bukti Transfer:</span>
              </span>
              <span className="text-[10px] text-zinc-500">
                Otomatis ikut tercetak di Rekening Koran
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Ambil foto kwitansi kertas, surat tanda terima pinjaman, atau tangkapan layar bukti transfer agar bukti tersimpan permanen.
            </p>
            <ImageUploadZone
              label="Kamera / Unggah Foto Bukti Pinjaman"
              sublabel="Ambil foto kuitansi fisik atau bukti transfer (tersimpan permanen)"
              value={fotoNota}
              onChange={(val) => setFotoNota(val)}
              multiple={true}
            />
          </div>

          {/* Footer Tombol */}
          <div className="flex items-center justify-end space-x-2.5 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || nominal <= 0}
              className="flex items-center space-x-1.5 px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <HandCoins className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan Pinjaman...' : 'Simpan Pinjaman Uang (Masuk Saldo Titip)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
