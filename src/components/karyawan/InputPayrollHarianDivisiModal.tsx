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
  Clock,
  FileSpreadsheet,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import { DAFTAR_DIVISI, NamaDivisi, Rekening, TransaksiPenggajian } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';

interface InputPayrollHarianDivisiModalProps {
  karyawanList: KaryawanWithBon[];
  initialDivisi?: NamaDivisi;
  initialKaryawanId?: string;
  rekeningList: Rekening[];
  onClose: () => void;
  onSuccess: (slip?: TransaksiPenggajian) => void;
}

const DIVISI_ICONS: Record<string, any> = {
  'Gudang Wijaya Agro': Warehouse,
  'Wijaya Karya': Wrench,
  'Wijaya Transport': Truck,
  'CV Wijaya Agro': Store,
  'PT Wijaya Agro Perkasa': Building2,
  'Okussa': Sparkles,
};

const QUICK_JOB_PRESETS: Record<string, string[]> = {
  'Gudang Wijaya Agro': [
    'Sortasi & timbang gabah kering panen 15 ton',
    'Bongkar muat pupuk urea & NPK 200 sak di gudang',
    'Pengecekan kadar air & pengeringan jagung pipil',
    'Pergudangan & penataan sak beras kemasan',
  ],
  'Wijaya Karya': [
    'Perbaikan motor & saringan elevator dryer pabrik',
    'Maintenance berkala mesin blower & pengering gabah',
    'Pengelasan rangka konveyor & bak penampungan',
    'Perawatan genset darurat pabrik beras',
  ],
  'Wijaya Transport': [
    'Supir armada logistik pengiriman gabah ke gudang',
    'Antar pesanan pupuk NPK 100 sak ke kios mitra tani',
    'Ekspedisi beras Okussa ke distributor Surabaya',
    'Angkut muatan jagung pipil ke pabrik pakan Kediri',
  ],
  'CV Wijaya Agro': [
    'Pelayanan kasir toko saprotan & rekap transaksi',
    'Penerimaan stok benih & herbisida dari distributor',
    'Konsultasi obat hama & pupuk untuk kelompok tani',
    'Rekap bon barang & cek fisik stok gudang toko',
  ],
  'PT Wijaya Agro Perkasa': [
    'Administrasi operasional & pembukuan mitra tani',
    'Pengawasan mutu gabah & koordinasi panen raya',
    'Audit stok komoditas pertanian & laporan harian',
  ],
  'Okussa': [
    'Sortir & packaging beras premium Okussa 5kg & 10kg',
    'Quality control keputihan & kebersihan butir beras',
    'Pencatatan packing list & segel distributor',
  ],
};

export const InputPayrollHarianDivisiModal: React.FC<InputPayrollHarianDivisiModalProps> = ({
  karyawanList,
  initialDivisi = 'Gudang Wijaya Agro',
  initialKaryawanId,
  rekeningList,
  onClose,
  onSuccess,
}) => {
  const activeKaryawanList = karyawanList.filter((k) => k.status === 'AKTIF');
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedKryId, setSelectedKryId] = useState<string>(
    initialKaryawanId || activeKaryawanList[0]?.id || ''
  );
  const [tanggalKerja, setTanggalKerja] = useState<string>(todayStr);
  const [divisi, setDivisi] = useState<NamaDivisi>(initialDivisi);
  const [tugasPekerjaan, setTugasPekerjaan] = useState<string>('');

  // Spreadsheet specific fields matching user format
  const [itemPekerjaan, setItemPekerjaan] = useState<string>('KERJA GUDANG');
  const [kuantiti, setKuantiti] = useState<number>(1);
  const [ketStatus, setKetStatus] = useState<'BON' | 'LUNAS'>('BON');
  const [catatanKhusus, setCatatanKhusus] = useState<string>('');

  // Selected Employee Details
  const activeKry = activeKaryawanList.find((k) => k.id === selectedKryId);

  // Dynamic wage defaults from standard
  const defaultUpah = activeKry?.gajiPokok
    ? Math.round(activeKry.gajiPokok / 25)
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
  const [nominalPotongKustom, setNominalPotongKustom] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Update default wage whenever selected employee changes
  const handleSelectEmployee = (id: string) => {
    setSelectedKryId(id);
    const kry = activeKaryawanList.find((k) => k.id === id);
    if (kry) {
      const estHarian = kry.gajiPokok ? Math.round(kry.gajiPokok / 25) : 135000;
      setUpahHarianInput(String(estHarian));
    }
  };

  const upahHarian = Number(upahHarianInput) || 0;
  const uangMakanLembur = Number(uangMakanInput) || 0;
  const totalUpah = upahHarian + uangMakanLembur;
  const totalBon = activeKry?.totalKasbonAktif || 0;

  const validRekeningList = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.status === 'AKTIF'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedKryId) {
      setErrorMsg('Pilih karyawan yang bertugas');
      return;
    }

    if (!tugasPekerjaan.trim()) {
      setErrorMsg('Isi uraian tugas: hari ini karyawan sedang bekerja untuk apa');
      return;
    }

    if (kuantiti > 0 && totalUpah <= 0) {
      setErrorMsg('Nominal upah kerja harian harus lebih dari Rp 0 jika kuantiti > 0');
      return;
    }

    // Format date YYYY-MM-DD to DD/MM/YYYY
    const [y, m, d] = tanggalKerja.split('-');
    const formattedTanggal = `${d}/${m}/${y}`;
    const dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
    const namaHari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'][dateObj.getDay()];
    const namaBulanSingkat = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'][Number(m) - 1];
    const hariTanggal = `${namaHari} ${d} ${namaBulanSingkat}`;

    const divObj = DAFTAR_DIVISI.find((item) => item.nama === divisi);
    const divisiKode = divObj ? divObj.kodeRekening.replace('REK-', '') : 'GWA';

    setSubmitting(true);
    try {
      const res = await api.recordKerjaHarian({
        idKaryawan: selectedKryId,
        tanggalKerja: formattedTanggal,
        hariTanggal,
        divisi,
        divisiKode,
        item: itemPekerjaan || tugasPekerjaan.trim(),
        kuantiti,
        harga: upahHarian,
        jumlah: totalUpah,
        ket: ketStatus,
        catatan: catatanKhusus,
        tugasPekerjaan: tugasPekerjaan.trim() || itemPekerjaan,
        upahHarian,
        uangMakanLembur,
        modeBayar,
        rekeningSumber: modeBayar === 'LANGSUNG_CAIR' ? rekeningSumber : undefined,
        persentasePotongKasbon: modeBayar === 'LANGSUNG_CAIR' ? persentasePotongKasbon : 0,
        nominalPotongKustom: modeBayar === 'LANGSUNG_CAIR' && nominalPotongKustom > 0 ? nominalPotongKustom : undefined,
      });

      onSuccess(res.slipGaji);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan input payroll harian');
    } finally {
      setSubmitting(false);
    }
  };

  const DivIcon = DIVISI_ICONS[divisi] || Layers;
  const presetsForDivisi = QUICK_JOB_PRESETS[divisi] || QUICK_JOB_PRESETS['Gudang Wijaya Agro'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh] animate-in fade-in">
        {/* Modal Header */}
        <div className="p-4 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-zinc-100 flex items-center space-x-2">
                <span>Input Payroll &amp; Upah Harian Divisi</span>
                <span className="text-[10px] bg-amber-950 text-amber-300 font-semibold px-2 py-0.5 rounded border border-amber-700">
                  {divisi}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Pencatatan divisi penugasan hari ini, rincian pekerjaan, upah dinamis, dan pemotongan bon
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-700 text-rose-300 rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: Karyawan & Tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-bold text-zinc-300 mb-1">
                Pilih Karyawan Yang Bertugas <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedKryId}
                onChange={(e) => handleSelectEmployee(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-semibold focus:outline-hidden focus:border-amber-500"
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
              <label className="block font-bold text-zinc-300 mb-1">
                Tanggal Kerja Harian <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={tanggalKerja}
                onChange={(e) => setTanggalKerja(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                required
              />
            </div>
          </div>

          {/* Employee Status Card */}
          {activeKry && (
            <div className="p-3 bg-zinc-800/80 border border-zinc-700/80 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-zinc-100">{activeKry.nama}</span>{' '}
                <span className="text-[11px] text-zinc-400">
                  ({activeKry.jabatan} - Divisi: {activeKry.divisi || activeKry.departemen})
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-[11px] text-zinc-300">
                  Total Bon Saat Ini:{' '}
                  <strong className="text-rose-400 font-mono">
                    {formatRupiah(activeKry.totalKasbonAktif || 0)}
                  </strong>
                </span>
                <span className="text-[10px] text-zinc-500">
                  (Barang: {formatRupiah(activeKry.kasbonBarang || 0)} | Uang: {formatRupiah(activeKry.kasbonUang || 0)})
                </span>
              </div>
            </div>
          )}

          {/* Row 2: Divisi Penugasan Hari Ini */}
          <div className="space-y-1.5">
            <label className="block font-bold text-zinc-300">
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
                        ? 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-md font-bold'
                        : 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isSelected ? 'text-amber-400' : 'text-zinc-500'}`} />
                    <div className="truncate">
                      <div className="text-xs truncate">{d.nama}</div>
                      <div className="text-[9px] font-mono opacity-70">{d.kodeRekening}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Format Spreadsheet Patokan Keuangan (Item, Qty, Status Ket, Catatan) */}
          <div className="p-3.5 bg-zinc-800/80 border border-amber-800/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 text-xs flex items-center space-x-1.5">
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Rincian Pekerjaan &amp; Catatan Gaji Harian</span>
              </span>
              <span className="text-[10px] text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                PT Wijaya Agro Perkasa
              </span>
            </div>

            {/* Item selector and quick chips */}
            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                Item / Jenis Pekerjaan:
              </label>
              <input
                type="text"
                value={itemPekerjaan}
                onChange={(e) => {
                  setItemPekerjaan(e.target.value);
                  if (!tugasPekerjaan) setTugasPekerjaan(e.target.value);
                }}
                placeholder="Contoh: KERJA GUDANG, SURJAL, JALAN, DRIVER TRUK, NGEBAL..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-bold focus:outline-hidden focus:border-amber-500 uppercase"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[
                  'KERJA GUDANG',
                  'SURJAL',
                  'JALAN',
                  'DRIVER TRUK',
                  'DRIVER TOING',
                  'JAJAN',
                  'NGEBAL',
                  'BONGKAR BARANG',
                  'BONGKAR PUPUK',
                  'ROSTING',
                  'NGIPAS',
                  'LEMBUR',
                ].map((it) => (
                  <button
                    key={it}
                    type="button"
                    onClick={() => {
                      setItemPekerjaan(it);
                      if (!tugasPekerjaan) setTugasPekerjaan(it);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                      itemPekerjaan === it
                        ? 'bg-amber-600 text-white border-amber-500'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {it}
                  </button>
                ))}
              </div>
            </div>

            {/* Qty, Ket (BON/LUNAS), Catatan */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Kuantiti (Qty):
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={kuantiti}
                    onChange={(e) => setKuantiti(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                  />
                  <span className="text-[10px] text-zinc-400 shrink-0">
                    {kuantiti === 0 ? '(Nihil/Libur)' : 'Hari'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Status Pengakuan (Ket):
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setKetStatus('BON')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border text-center transition-all ${
                      ketStatus === 'BON'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    BON
                  </button>
                  <button
                    type="button"
                    onClick={() => setKetStatus('LUNAS')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold border text-center transition-all ${
                      ketStatus === 'LUNAS'
                        ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    LUNAS
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Catatan Khusus:
                </label>
                <input
                  type="text"
                  value={catatanKhusus}
                  onChange={(e) => setCatatanKhusus(e.target.value)}
                  placeholder="e.g. MBL ARYA, SAKIT, LIBUR..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:outline-hidden focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Deskripsi Uraian Tugas Detail */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-zinc-300">
                Uraian Keterangan Pekerjaan <span className="text-zinc-500 font-normal">(Opsional / Rincian)</span>
              </label>
            </div>
            <textarea
              rows={2}
              placeholder="Contoh: Sortasi 20 ton gabah basah dari Mitra Tani, lembur pengeringan dryer..."
              value={tugasPekerjaan}
              onChange={(e) => setTugasPekerjaan(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-medium"
            />
          </div>

          {/* Row 4: Upah Dinamis (Tidak Baku / Fleksibel) */}
          <div className="p-3.5 bg-zinc-800/80 border border-zinc-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-zinc-200 flex items-center space-x-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>Nominal Upah Kerja Harian (Fleksibel / Dinamis)</span>
              </span>
              <span className="text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800 font-semibold">
                Dapat Diatur Bebas
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Upah Harian Pokok (Rp):
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  required
                  value={upahHarianInput}
                  onChange={(e) => setUpahHarianInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Standar karyawan: {formatRupiah(defaultUpah)}
                </span>
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Uang Makan / Lembur / Bonus (Rp):
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={uangMakanInput}
                  onChange={(e) => setUangMakanInput(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                />
                <span className="text-[10px] text-zinc-500 mt-0.5 block">
                  Tambahan insentif hari ini
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-700 flex items-center justify-between">
              <span className="font-semibold text-zinc-400 text-xs">Total Gaji Harian Hari Ini:</span>
              <span className="font-mono font-black text-emerald-400 text-base">
                {formatRupiah(totalUpah)}
              </span>
            </div>
          </div>

          {/* Row 5: Pilihan Alur Penyelesaian Upah */}
          <div className="space-y-2">
            <label className="block font-bold text-zinc-300">
              Pilihan Alur Pembayaran / Pembukuan:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setModeBayar('CATAT_HAK_UPAH')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modeBayar === 'CATAT_HAK_UPAH'
                    ? 'bg-sky-950/80 border-sky-500 text-sky-200 font-bold shadow-md'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-sky-400" />
                  <span className="text-xs">Catat Hak Upah Berjalan</span>
                </div>
                <p className="text-[10px] text-zinc-400 font-normal mt-1 leading-tight">
                  Akumulasi ke buku rekap bulanan (belum cair hari ini). Nanti disinkronkan &amp; dipotong bon secara berkala.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setModeBayar('LANGSUNG_CAIR')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  modeBayar === 'LANGSUNG_CAIR'
                    ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-bold shadow-md'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span className="text-xs">Langsung Cair Hari Ini</span>
                </div>
                <p className="text-[10px] text-zinc-400 font-normal mt-1 leading-tight">
                  Keluarkan kas dari rekening divisi atau kasir hari ini. Bisa langsung memotong saldo bon karyawan.
                </p>
              </button>
            </div>
          </div>

          {/* Direct Settlement Options */}
          {modeBayar === 'LANGSUNG_CAIR' && (
            <div className="p-3.5 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-3">
              <span className="font-bold text-amber-300 text-xs block">
                Pengaturan Pencairan Kas Divisi &amp; Pemotongan Bon:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Rekening Pembayar Upah
                  </label>
                  <select
                    value={rekeningSumber}
                    onChange={(e) => setRekeningSumber(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-xs font-semibold"
                  >
                    {validRekeningList.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({r.kode}) - Saldo: {formatRupiah(r.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Potong Bon Karyawan (Total Bon: {formatRupiah(totalBon)})
                  </label>
                  <select
                    value={persentasePotongKasbon}
                    onChange={(e) => {
                      setPersentasePotongKasbon(Number(e.target.value));
                      setNominalPotongKustom(0);
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-xs font-semibold"
                    disabled={totalBon <= 0}
                  >
                    <option value={0}>0% (Tanpa Potongan Bon)</option>
                    <option value={25}>25% dari Total Bon</option>
                    <option value={50}>50% dari Total Bon</option>
                    <option value={100}>100% (Lunaskan Bon Sebanyak Gaji)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg disabled:opacity-50 transition-colors shadow-md cursor-pointer flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Payroll Harian'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
