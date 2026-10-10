import React, { useState } from 'react';
import {
  X,
  Calendar,
  Building2,
  DollarSign,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  Warehouse,
  Truck,
  Wrench,
  Store,
  Wallet,
  Receipt,
  Info,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { DAFTAR_DIVISI, NamaDivisi, Rekening, RekapKaryawanItem } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';

interface InputKerjaHarianModalProps {
  karyawanList: RekapKaryawanItem[];
  selectedKaryawan?: RekapKaryawanItem | null;
  rekeningList: Rekening[];
  onClose: () => void;
  onSuccess: () => void;
}

const DIVISI_ICONS: Record<string, any> = {
  'Gudang Wijaya Agro': Warehouse,
  'Wijaya Karya': Wrench,
  'Wijaya Transport': Truck,
  'CV Wijaya Agro': Store,
  'PT Wijaya Agro Perkasa': Building2,
  'Okussa': Sparkles,
};

const QUICK_JOB_PRESETS = [
  'Sortasi & timbang gabah kering panen 15 ton',
  'Perbaikan motor & saringan elevator dryer pabrik',
  'Supir armada logistik pengiriman beras ke gudang distributor',
  'Pelayanan kasir toko saprotan & rekap transaksi',
  'Bongkar muat pupuk urea & NPK 200 sak di gudang',
  'Pengecekan kadar air & pengeringan jagung pipil',
];

export const InputKerjaHarianModal: React.FC<InputKerjaHarianModalProps> = ({
  karyawanList,
  selectedKaryawan: initialSelected,
  rekeningList,
  onClose,
  onSuccess,
}) => {
  const activeKaryawanList = karyawanList.filter((k) => k.status === 'AKTIF');
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedKryId, setSelectedKryId] = useState<string>(
    initialSelected?.id || activeKaryawanList[0]?.id || ''
  );
  const [tanggalKerja, setTanggalKerja] = useState<string>(todayStr);
  const [divisi, setDivisi] = useState<NamaDivisi>(
    initialSelected?.divisiTerakhir || 'Gudang Wijaya Agro'
  );
  const [tugasPekerjaan, setTugasPekerjaan] = useState<string>('');

  // Selected Employee Details
  const activeKry = activeKaryawanList.find((k) => k.id === selectedKryId);

  // Dynamic wage defaults from standard
  const defaultUpah = activeKry?.standarGajiPokok
    ? Math.round(activeKry.standarGajiPokok / 25)
    : 135000;

  const [upahHarianInput, setUpahHarianInput] = useState<string>(String(defaultUpah));
  const [uangMakanInput, setUangMakanInput] = useState<string>('0');

  // Mode payment: Catat Hak Upah Berjalan vs Langsung Cair Hari Ini
  const [modeBayar, setModeBayar] = useState<'CATAT_HAK_UPAH' | 'LANGSUNG_CAIR'>('CATAT_HAK_UPAH');

  // Direct settlement settings
  const chosenDivRek =
    DAFTAR_DIVISI.find((d) => d.nama === divisi)?.kodeRekening || 'REK-GWA';
  const [rekeningSumber, setRekeningSumber] = useState<string>(chosenDivRek);
  const [persentasePotongKasbon, setPersentasePotongKasbon] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Update default wage whenever selected employee changes
  const handleSelectEmployee = (id: string) => {
    setSelectedKryId(id);
    const kry = activeKaryawanList.find((k) => k.id === id);
    if (kry) {
      setDivisi(kry.divisiTerakhir || 'Gudang Wijaya Agro');
      const estHarian = kry.standarGajiPokok ? Math.round(kry.standarGajiPokok / 25) : 135000;
      setUpahHarianInput(String(estHarian));
    }
  };

  const upahHarian = Number(upahHarianInput) || 0;
  const uangMakanLembur = Number(uangMakanInput) || 0;
  const totalUpah = upahHarian + uangMakanLembur;
  const totalBon = activeKry?.totalBonKaryawan || 0;

  const validRekeningList = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.status === 'AKTIF'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedKryId) {
      setErrorMsg('Pilih karyawan yang bertugas.');
      return;
    }

    if (!tugasPekerjaan.trim()) {
      setErrorMsg('Isi uraian tugas: hari ini karyawan sedang bekerja untuk apa.');
      return;
    }

    if (totalUpah <= 0) {
      setErrorMsg('Nominal upah kerja harian harus lebih dari Rp 0.');
      return;
    }

    // Format date YYYY-MM-DD to DD/MM/YYYY
    const [y, m, d] = tanggalKerja.split('-');
    const formattedTanggal = `${d}/${m}/${y}`;

    setSubmitting(true);
    try {
      await api.recordKerjaHarian({
        idKaryawan: selectedKryId,
        tanggalKerja: formattedTanggal,
        divisi,
        tugasPekerjaan: tugasPekerjaan.trim(),
        upahHarian,
        uangMakanLembur,
        modeBayar,
        rekeningSumber: modeBayar === 'LANGSUNG_CAIR' ? rekeningSumber : undefined,
        persentasePotongKasbon: modeBayar === 'LANGSUNG_CAIR' ? persentasePotongKasbon : 0,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan input kerja harian');
    } finally {
      setSubmitting(false);
    }
  };

  const DivIcon = DIVISI_ICONS[divisi] || Layers;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-zinc-200 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[92vh] animate-in fade-in">
        {/* Modal Header */}
        <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-800 rounded-xl">
              <Briefcase className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Input Tugas &amp; Upah Harian Karyawan</h2>
              <p className="text-[11px] text-emerald-100">
                Tentukan divisi penugasan hari ini, rincian pekerjaan, dan nominal upah dinamis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-200 hover:text-white p-1 rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: Karyawan & Tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-bold text-zinc-700 mb-1">
                Pilih Karyawan Yang Bertugas <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedKryId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-600"
                required
              >
                {activeKaryawanList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama} ({k.nik}) - {k.jabatan}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-zinc-700 mb-1">
                Tanggal Kerja <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={tanggalKerja}
                onChange={(e) => setTanggalKerja(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-600"
                required
              />
            </div>
          </div>

          {/* Employee Status Card */}
          {activeKry && (
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-zinc-800">{activeKry.nama}</span>{' '}
                <span className="text-[11px] text-zinc-500">
                  ({activeKry.jabatan} - {activeKry.departemen})
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-[11px] text-zinc-600">
                  Hak Upah Berjalan:{' '}
                  <strong className="text-emerald-700 font-mono">
                    {formatRupiah(activeKry.totalUpahBelumDibayar)}
                  </strong>
                </span>
                <span className="text-[11px] text-zinc-600">
                  Total Bon:{' '}
                  <strong className="text-amber-700 font-mono">
                    {formatRupiah(activeKry.totalBonKaryawan)}
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* Row 2: Divisi Penugasan Hari Ini */}
          <div className="space-y-1.5">
            <label className="block font-bold text-zinc-700">
              Divisi Penugasan Hari Ini <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DAFTAR_DIVISI.map((d) => {
                const isSelected = divisi === d.nama;
                const Icon = DIVISI_ICONS[d.nama] || Layers;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setDivisi(d.nama);
                      setRekeningSumber(d.kodeRekening);
                    }}
                    className={`p-2.5 rounded-xl border text-left flex items-start space-x-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900 shadow-2xs font-bold'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-emerald-700' : 'text-zinc-500'}`} />
                    <div className="truncate">
                      <div className="text-xs truncate">{d.nama}</div>
                      <div className="text-[9px] font-mono opacity-70">{d.kodeRekening}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Deskripsi "Hari ini kerja untuk apa" */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-zinc-700">
                Hari Ini Sedang Bekerja Untuk Apa? <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-zinc-400">Deskripsi pekerjaan spesifik</span>
            </div>
            <textarea
              rows={2}
              required
              placeholder="Contoh: Sortasi 20 ton gabah basah dari Mitra Tani, lembur pengeringan dryer..."
              value={tugasPekerjaan}
              onChange={(e) => setTugasPekerjaan(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-600 font-medium"
            />
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1 text-[10px] pt-0.5">
              <span className="text-zinc-400">Preset Cepat:</span>
              {QUICK_JOB_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setTugasPekerjaan(preset)}
                  className="px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-md transition-colors cursor-pointer truncate max-w-[200px]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Upah Dinamis (Tidak Baku / Fleksibel) */}
          <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-950 flex items-center space-x-1.5">
                <DollarSign className="w-4 h-4 text-emerald-700" />
                <span>Nominal Upah Kerja Harian (Fleksibel / Tidak Baku)</span>
              </span>
              <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                Dapat Diedit Bebas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Upah Harian Pokok (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  required
                  value={upahHarianInput}
                  onChange={(e) => setUpahHarianInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-600"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Standar karyawan: {formatRupiah(defaultUpah)}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Uang Makan / Lembur / Bonus (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={uangMakanInput}
                  onChange={(e) => setUangMakanInput(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-600"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Tambahan insentif harian
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between">
              <span className="font-semibold text-zinc-700 text-xs">Total Hak Upah Hari Ini:</span>
              <span className="font-mono font-black text-emerald-800 text-base">
                {formatRupiah(totalUpah)}
              </span>
            </div>
          </div>

          {/* Row 5: Pilihan Alur Penyelesaian Upah */}
          <div className="space-y-2">
            <label className="block font-bold text-zinc-700">
              Pilih Alur Pembayaran Upah Harian:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModeBayar('CATAT_HAK_UPAH')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modeBayar === 'CATAT_HAK_UPAH'
                    ? 'bg-sky-50 border-sky-600 text-sky-950 font-bold shadow-2xs'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-sky-700" />
                  <span className="text-xs">Catat Hak Upah Berjalan</span>
                </div>
                <p className="text-[10px] text-zinc-500 font-normal mt-1 leading-tight">
                  Akumulasi ke buku rekap karyawan (belum cair). Nanti bisa disinkronkan &amp; dipotong bon.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setModeBayar('LANGSUNG_CAIR')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modeBayar === 'LANGSUNG_CAIR'
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-bold shadow-2xs'
                    : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs">Langsung Cairkan Hari Ini</span>
                </div>
                <p className="text-[10px] text-zinc-500 font-normal mt-1 leading-tight">
                  Potong kas divisi/kasir hari ini juga. Bisa langsung potong bon karyawan jika ada.
                </p>
              </button>
            </div>
          </div>

          {/* Direct Settlement Options */}
          {modeBayar === 'LANGSUNG_CAIR' && (
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
              <span className="font-bold text-amber-950 text-xs block">
                Pengaturan Pencairan Kas &amp; Potong Bon:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Rekening Pembayar Upah
                  </label>
                  <select
                    value={rekeningSumber}
                    onChange={(e) => setRekeningSumber(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-semibold"
                  >
                    {validRekeningList.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({r.kode}) - Saldo: {formatRupiah(r.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Potong Bon Karyawan (Total Bon: {formatRupiah(totalBon)})
                  </label>
                  <select
                    value={persentasePotongKasbon}
                    onChange={(e) => setPersentasePotongKasbon(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-xs font-semibold"
                    disabled={totalBon <= 0}
                  >
                    <option value={0}>0% (Tanpa Potongan)</option>
                    <option value={25}>25% dari Bon</option>
                    <option value={50}>50% dari Bon</option>
                    <option value={100}>100% (Lunas)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Tugas Harian'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
