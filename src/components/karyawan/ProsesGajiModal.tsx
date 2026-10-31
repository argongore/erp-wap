import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Building2,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Calculator,
  Percent,
  Receipt,
  UserCheck,
  Calendar,
  Layers,
  Sparkles,
  Warehouse,
  Truck,
  Wrench,
  Store,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import { DAFTAR_DIVISI, NamaDivisi, Rekening, TransaksiPenggajian } from '../../server/types.ts';

interface ProsesGajiModalProps {
  karyawan: KaryawanWithBon | null;
  allKaryawan?: KaryawanWithBon[];
  rekeningList: Rekening[];
  initialDivisi?: NamaDivisi;
  onClose: () => void;
  onSuccess: (slip: TransaksiPenggajian) => void;
}

const DIVISI_OPTIONS: Array<{
  nama: NamaDivisi;
  kodeRekening: string;
  deskripsi: string;
}> = [
  { nama: 'Gudang Wijaya Agro', kodeRekening: 'REK-GWA', deskripsi: 'Sortasi, Gudang, & Stok Hasil Bumi' },
  { nama: 'Wijaya Karya', kodeRekening: 'REK-WK', deskripsi: 'Pabrik Dryer, Mesin Giling, & Teknik' },
  { nama: 'Wijaya Transport', kodeRekening: 'REK-WT', deskripsi: 'Armada Truk, Logistik & Pengiriman' },
  { nama: 'CV Wijaya Agro', kodeRekening: 'REK-CVA', deskripsi: 'Perdagangan Pupuk & Kios Saprotan' },
  { nama: 'PT Wijaya Agro Perkasa', kodeRekening: 'REK-WAP', deskripsi: 'Pabrik Beras Induk & Pengolahan' },
  { nama: 'Okussa', kodeRekening: 'REK-OKU', deskripsi: 'Beras Premium Kemasan & Retail' },
];

export const ProsesGajiModal: React.FC<ProsesGajiModalProps> = ({
  karyawan: propKaryawan,
  allKaryawan = [],
  rekeningList,
  initialDivisi,
  onClose,
  onSuccess,
}) => {
  // If propKaryawan is null, pick the first active employee from allKaryawan
  const [selectedKaryawanId, setSelectedKaryawanId] = useState<string>(
    propKaryawan?.id || allKaryawan.find((k) => k.status === 'AKTIF')?.id || ''
  );

  const activeKaryawan =
    (allKaryawan.length > 0
      ? allKaryawan.find((k) => k.id === selectedKaryawanId)
      : propKaryawan) || propKaryawan;

  // Form states (Murni Harian per Hari Kerja — Hari Tanpa Input = Tidak Masuk)
  const todayStr = new Date().toISOString().split('T')[0];
  const [tanggalKerja, setTanggalKerja] = useState<string>(todayStr);
  const tipeGaji = 'HARIAN' as const;
  const [divisi, setDivisi] = useState<NamaDivisi>(initialDivisi || 'Gudang Wijaya Agro');

  // Nominal gaji harian manual
  const [gajiNominal, setGajiNominal] = useState<number>(120000);
  const [bonus, setBonus] = useState<number>(0);

  // Default month name in Indonesian
  const currentMonthYear = new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const [periodeBulan, setPeriodeBulan] = useState(currentMonthYear);
  const [persentasePilihan, setPersentasePilihan] = useState<number>(0); // Default 0 for daily, or user can choose to deduct
  const [nominalKustom, setNominalKustom] = useState<number>(0);
  const [metodePembayaran, setMetodePembayaran] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');

  // Map chosen division to dedicated rekening
  const chosenDivRek = DIVISI_OPTIONS.find((d) => d.nama === divisi)?.kodeRekening || 'REK-GWA';
  const [rekeningSumber, setRekeningSumber] = useState<string>(chosenDivRek);
  const [keterangan, setKeterangan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Whenever divisi changes, automatically suggest the division's dedicated rekening
  useEffect(() => {
    const matched = DIVISI_OPTIONS.find((d) => d.nama === divisi);
    if (matched) {
      setRekeningSumber(matched.kodeRekening);
    }
  }, [divisi]);

  if (!activeKaryawan) return null;

  const validRekening = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.status === 'AKTIF'
  );

  const totalBon = activeKaryawan.totalKasbonAktif || 0;
  const tunjangan = 0;
  const upahPokok = Number(gajiNominal) || 0;
  const lemburBonus = Number(bonus) || 0;
  const gajiKotor = upahPokok + tunjangan + lemburBonus;

  // Calculate actual deduction
  let potonganKasbon = 0;
  if (totalBon > 0) {
    if (persentasePilihan === -1) {
      potonganKasbon = Math.min(Number(nominalKustom) || 0, totalBon, gajiKotor);
    } else if (persentasePilihan > 0) {
      const calc = Math.round((totalBon * persentasePilihan) / 100);
      potonganKasbon = Math.min(calc, totalBon, gajiKotor);
    }
  }

  const sisaKasbonAkhir = Math.max(0, totalBon - potonganKasbon);
  const gajiBersih = Math.max(0, gajiKotor - potonganKasbon);

  const selectedRek = rekeningList.find((r) => r.kode === rekeningSumber);
  const saldoCukup = selectedRek ? selectedRek.saldoSaatIni >= gajiBersih : false;

  const formatRupiah = (val: number) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const handlePilihPersentase = (persen: number) => {
    setPersentasePilihan(persen);
    if (persen === 100) {
      setNominalKustom(Math.min(totalBon, gajiKotor));
    } else if (persen === 50) {
      setNominalKustom(Math.min(Math.round(totalBon * 0.5), gajiKotor));
    } else if (persen === 25) {
      setNominalKustom(Math.min(Math.round(totalBon * 0.25), gajiKotor));
    } else if (persen === 0) {
      setNominalKustom(0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (upahPokok <= 0) {
      setErrorMsg('Nominal upah/gaji harus lebih dari Rp 0');
      return;
    }

    if (!rekeningSumber) {
      setErrorMsg('Pilih rekening sumber pembayaran upah.');
      return;
    }

    if (!selectedRek) {
      setErrorMsg('Rekening pembayaran tidak valid.');
      return;
    }

    if (!saldoCukup) {
      setErrorMsg(
        `Saldo ${selectedRek.nama} (${formatRupiah(
          selectedRek.saldoSaatIni
        )}) tidak mencukupi untuk membayar gaji bersih ${formatRupiah(gajiBersih)}.`
      );
      return;
    }

    // Convert YYYY-MM-DD to DD/MM/YYYY
    const [y, m, d] = tanggalKerja.split('-');
    const formattedTanggalKerja = `${d}/${m}/${y}`;

    setSubmitting(true);
    try {
      const res = await api.processPenggajian({
        idKaryawan: activeKaryawan.id,
        divisi,
        tipeGaji,
        tanggalKerja: formattedTanggalKerja,
        periodeBulan:
          tipeGaji === 'HARIAN'
            ? `Harian - ${formattedTanggalKerja}`
            : periodeBulan || `Bulan ${m}/${y}`,
        gajiNominal: upahPokok,
        bonus: lemburBonus,
        persentasePotongKasbon:
          persentasePilihan === -1
            ? Math.round((potonganKasbon / (totalBon || 1)) * 100)
            : persentasePilihan,
        nominalPotongKustom: persentasePilihan === -1 ? nominalKustom : undefined,
        metodePembayaran,
        rekeningSumber,
        keterangan:
          keterangan ||
          `Upah ${tipeGaji === 'HARIAN' ? 'Harian' : 'Bulanan'} [${divisi}] ${activeKaryawan.nama} (${formattedTanggalKerja})`,
      });

      onSuccess(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses penggajian');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-950 border border-emerald-700 text-emerald-400 rounded-lg">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-zinc-100 flex items-center space-x-2">
                <span>Input Gaji per Hari Kerja Karyawan</span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Gaji dihitung per hari kerja yang di-input. Hari tanpa input gaji otomatis terhitung Tidak Masuk.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-700 text-rose-300 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Karyawan Selector */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-300 mb-1">
              Pilih Karyawan Penerima Upah:
            </label>
            {allKaryawan && allKaryawan.length > 0 ? (
              <select
                value={selectedKaryawanId}
                onChange={(e) => setSelectedKaryawanId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-semibold focus:outline-hidden focus:border-emerald-500"
              >
                {allKaryawan
                  .filter((k) => k.status === 'AKTIF')
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama} ({k.nik}) - {k.jabatan} [{k.departemen}] {k.totalKasbonAktif > 0 ? `• Ada Bon: ${formatRupiah(k.totalKasbonAktif)}` : '• Bebas Bon'}
                    </option>
                  ))}
              </select>
            ) : (
              <div className="bg-zinc-800/80 p-3 rounded-lg border border-zinc-700 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-900/80 text-emerald-200 border border-emerald-600 flex items-center justify-center font-bold text-sm">
                    {activeKaryawan.nama.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-bold text-sm text-zinc-100">{activeKaryawan.nama}</span>
                    <p className="text-[11px] text-zinc-400">
                      {activeKaryawan.nik} • {activeKaryawan.jabatan}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Penugasan Divisi Hari Ini & Tanggal Kerja */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-amber-400 mb-1 flex items-center space-x-1">
                <Building2 className="w-3.5 h-3.5 inline text-amber-400" />
                <span>Divisi Penugasan Hari Ini:</span>
              </label>
              <select
                value={divisi}
                onChange={(e) => setDivisi(e.target.value as NamaDivisi)}
                className="w-full bg-zinc-800 border border-amber-600/70 rounded-lg px-3 py-2 text-amber-200 font-bold focus:outline-hidden focus:border-amber-400"
              >
                {DIVISI_OPTIONS.map((d) => (
                  <option key={d.nama} value={d.nama}>
                    {d.nama} ({d.kodeRekening})
                  </option>
                ))}
              </select>
              <span className="block text-[10px] text-zinc-400 mt-1">
                {DIVISI_OPTIONS.find((d) => d.nama === divisi)?.deskripsi}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 inline text-zinc-400" />
                <span>Tanggal Bekerja:</span>
              </label>
              <input
                type="date"
                value={tanggalKerja}
                onChange={(e) => setTanggalKerja(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500"
                required
              />
              <span className="block text-[10px] text-zinc-500 mt-1">
                Karyawan dapat dipindah ke divisi lain setiap harinya
              </span>
            </div>
          </div>

          {/* Input Nominal Upah Manual & Lembur */}
          <div className="bg-zinc-950/70 p-3.5 rounded-lg border border-zinc-800 space-y-3">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
              1. Rincian Nominal Upah (Input Manual Kasir)
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Nominal {tipeGaji === 'HARIAN' ? 'Upah Harian' : 'Gaji Pokok'} (Rp):
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={gajiNominal || ''}
                  onChange={(e) => setGajiNominal(Math.max(0, Number(e.target.value)))}
                  placeholder="Contoh: 120000"
                  className="w-full bg-zinc-800 border border-emerald-600/70 rounded-md px-3 py-2 text-zinc-100 text-sm font-mono font-bold focus:outline-hidden focus:border-emerald-400"
                  required
                />
                {/* Preset tombol cepat upah harian */}
                {tipeGaji === 'HARIAN' && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[100000, 120000, 135000, 150000, 175000, 200000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setGajiNominal(preset)}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                          gajiNominal === preset
                            ? 'bg-emerald-900 text-emerald-200 border-emerald-500 font-bold'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                        }`}
                      >
                        {formatRupiah(preset)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Bonus / Uang Makan / Lembur (Rp):
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={bonus || ''}
                  onChange={(e) => setBonus(Math.max(0, Number(e.target.value)))}
                  placeholder="0"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 text-sm font-mono focus:outline-hidden focus:border-emerald-500"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {[0, 15000, 25000, 50000, 75000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBonus(preset)}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        bonus === preset
                          ? 'bg-amber-900 text-amber-200 border-amber-500 font-bold'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      {preset === 0 ? 'Tanpa Lembur' : `+${formatRupiah(preset)}`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-2 bg-zinc-900 rounded border border-zinc-800 flex items-center justify-between text-xs">
              <span className="text-zinc-400">Total Upah Kotor Hari Ini:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {formatRupiah(gajiKotor)}
              </span>
            </div>
          </div>

          {/* Section: Status Kasbon & Pilihan Pemotongan */}
          <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                2. Pemotongan Kasbon Karyawan
              </span>
              <span className="text-[11px] font-mono text-zinc-300">
                Total Kasbon: <strong className={totalBon > 0 ? 'text-rose-400' : 'text-emerald-400'}>{formatRupiah(totalBon)}</strong>
              </span>
            </div>

            {totalBon > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-3 text-[10px] text-zinc-400 bg-zinc-900/90 px-2.5 py-1.5 rounded border border-zinc-800">
                  <span>• Kasbon Uang: <strong className="text-zinc-200">{formatRupiah(activeKaryawan.kasbonUang)}</strong></span>
                  <span>• Kasbon Barang: <strong className="text-zinc-200">{formatRupiah(activeKaryawan.kasbonBarang)}</strong></span>
                </div>

                <label className="block text-[11px] font-medium text-zinc-300">
                  Pilih Skema Potong Bon Hari Ini:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePilihPersentase(0)}
                    className={`py-1.5 px-2 rounded-md font-semibold text-center border transition-colors ${
                      persentasePilihan === 0
                        ? 'bg-emerald-900 text-white border-emerald-500 shadow-xs'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    0% (Jangan Potong)
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePilihPersentase(25)}
                    className={`py-1.5 px-2 rounded-md font-semibold text-center border transition-colors ${
                      persentasePilihan === 25
                        ? 'bg-rose-900 text-white border-rose-500 shadow-xs'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    25%
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePilihPersentase(50)}
                    className={`py-1.5 px-2 rounded-md font-semibold text-center border transition-colors ${
                      persentasePilihan === 50
                        ? 'bg-rose-900 text-white border-rose-500 shadow-xs'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    50%
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePilihPersentase(100)}
                    className={`py-1.5 px-2 rounded-md font-semibold text-center border transition-colors ${
                      persentasePilihan === 100
                        ? 'bg-rose-900 text-white border-rose-500 shadow-xs'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    100% (Lunas)
                  </button>
                </div>

                {/* Nominal Input Kustom */}
                <div className="pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-zinc-400">Atau tentukan nominal potong kustom:</span>
                    <button
                      type="button"
                      onClick={() => setPersentasePilihan(-1)}
                      className="text-[10px] text-sky-400 hover:underline font-medium"
                    >
                      Aktifkan Nominal Bebas
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={Math.min(totalBon, gajiKotor)}
                    value={persentasePilihan === -1 ? nominalKustom || '' : potonganKasbon}
                    onChange={(e) => {
                      setPersentasePilihan(-1);
                      setNominalKustom(Math.max(0, Number(e.target.value) || 0));
                    }}
                    placeholder="Nominal potong bon hari ini"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-100 font-mono focus:outline-hidden focus:border-rose-500"
                  />
                </div>

                <div className="p-2 bg-rose-950/30 border border-rose-900/50 rounded flex items-center justify-between text-[11px]">
                  <div>
                    <span className="text-zinc-400">Kasbon yang Dipotong:</span>
                    <span className="font-mono font-bold text-rose-400 ml-1">
                      -{formatRupiah(potonganKasbon)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Sisa Kasbon Setelah Gaji:</span>
                    <span className="font-mono font-bold text-zinc-200 ml-1">
                      {formatRupiah(sisaKasbonAkhir)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-emerald-950/30 border border-emerald-900/50 rounded-lg flex items-center space-x-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Karyawan ini bebas kasbon. Upah dibayarkan 100% tanpa potongan.</span>
              </div>
            )}
          </div>

          {/* Rekening Pembayaran Khusus Divisi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                Rekening Pembayar (Kas Divisi / Kas Pusat):
              </label>
              <select
                value={rekeningSumber}
                onChange={(e) => setRekeningSumber(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 text-xs focus:outline-hidden focus:border-emerald-500"
                required
              >
                {/* Division accounts first */}
                <optgroup label="Rekening Khusus Divisi">
                  {rekeningList
                    .filter((r) => r.kode.startsWith('REK-'))
                    .map((rek) => (
                      <option key={rek.kode} value={rek.kode}>
                        {rek.nama} ({rek.kode}) - Saldo: {formatRupiah(rek.saldoSaatIni)}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Kas Utama & Bank">
                  {rekeningList
                    .filter((r) => !r.isVirtual && !r.kode.startsWith('REK-'))
                    .map((rek) => (
                      <option key={rek.kode} value={rek.kode}>
                        {rek.nama} ({rek.kode}) - Saldo: {formatRupiah(rek.saldoSaatIni)}
                      </option>
                    ))}
                </optgroup>
              </select>
              {selectedRek && (
                <span
                  className={`block text-[10px] mt-1 font-mono ${
                    saldoCukup ? 'text-emerald-400' : 'text-rose-400 font-bold'
                  }`}
                >
                  Saldo kas: {formatRupiah(selectedRek.saldoSaatIni)}{' '}
                  {saldoCukup ? '(Mencukupi)' : '(TIDAK MENCUKUPI - Dropping Kas Dulu)'}
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                Metode Pembayaran:
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setMetodePembayaran('TUNAI')}
                  className={`flex-1 py-2 rounded-md font-semibold text-xs border transition-colors ${
                    metodePembayaran === 'TUNAI'
                      ? 'bg-emerald-800 text-white border-emerald-500'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  Tunai (Kas Lapangan)
                </button>
                <button
                  type="button"
                  onClick={() => setMetodePembayaran('TRANSFER')}
                  className={`flex-1 py-2 rounded-md font-semibold text-xs border transition-colors ${
                    metodePembayaran === 'TRANSFER'
                      ? 'bg-emerald-800 text-white border-emerald-500'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  Transfer Rekening
                </button>
              </div>
            </div>
          </div>

          {/* Catatan / Keterangan */}
          <div>
            <label className="block text-[11px] font-medium text-zinc-300 mb-1">
              Catatan Tugas / Keterangan (Opsional):
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder={`Contoh: Bongkar muat 2 truk jagung di ${divisi}`}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-100 text-xs focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          {/* Grand Summary Banner (Take Home Pay) */}
          <div className="bg-emerald-950 border border-emerald-600/80 p-4 rounded-xl flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-400 block">
                UPAH BERSIH YANG DIBAYARKAN (TAKE HOME PAY)
              </span>
              <p className="text-[11px] text-zinc-300 mt-0.5">
                Upah Kotor {formatRupiah(gajiKotor)}{' '}
                {potonganKasbon > 0 && ` - Potong Kasbon ${formatRupiah(potonganKasbon)}`}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black font-mono text-emerald-300 tracking-tight block">
                {formatRupiah(gajiBersih)}
              </span>
              <span className="text-[10px] text-emerald-400 font-semibold">
                Divisi: {divisi}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium text-xs transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || !saldoCukup}
              className={`px-5 py-2 rounded-lg font-bold text-xs text-white shadow-md transition-colors flex items-center space-x-2 ${
                submitting || !saldoCukup
                  ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>{submitting ? 'Memproses Upah...' : 'Proses & Cetak Slip Upah'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
