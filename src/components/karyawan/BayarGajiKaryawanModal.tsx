import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Wallet,
  Building2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  FileSpreadsheet,
  UserCheck,
  ArrowRight,
  BookOpen,
  Wheat,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  CatatanUpahHarian,
  DetailHarianKaryawanResponse,
  NamaDivisi,
  Rekening,
  TransaksiPenggajian,
} from '../../server/types.ts';

interface BayarGajiKaryawanModalProps {
  initialKaryawanId?: string;
  initialBulan?: number;
  initialTahun?: number;
  allKaryawan: KaryawanWithBon[];
  rekeningList: Rekening[];
  onClose: () => void;
  onSuccess: (slip: TransaksiPenggajian) => void;
  onNavigateToRekeningMitra?: (idMitra: string) => void;
}

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const DIVISI_REKENING_MAP: Record<string, string> = {
  'Gudang Wijaya Agro': 'REK-GWA',
  'Wijaya Karya': 'REK-WK',
  'Wijaya Transport': 'REK-WT',
  'CV Wijaya Agro': 'REK-CVA',
  'PT Wijaya Agro Perkasa': 'REK-WAP',
  Okussa: 'REK-OKU',
};

const formatRp = (val: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);

export const BayarGajiKaryawanModal: React.FC<BayarGajiKaryawanModalProps> = ({
  initialKaryawanId,
  initialBulan,
  initialTahun,
  allKaryawan,
  rekeningList,
  onClose,
  onSuccess,
  onNavigateToRekeningMitra,
}) => {
  const now = new Date();
  const activeEmployees = useMemo(
    () => allKaryawan.filter((k) => k.status === 'AKTIF' || k.id === initialKaryawanId),
    [allKaryawan, initialKaryawanId]
  );

  const [selectedKaryawanId, setSelectedKaryawanId] = useState<string>(
    initialKaryawanId ||
      activeEmployees.find((k) => (k.totalUpahBelumDibayar || 0) > 0)?.id ||
      activeEmployees[0]?.id ||
      ''
  );

  const selectedKaryawan = useMemo(
    () => allKaryawan.find((k) => k.id === selectedKaryawanId) || null,
    [allKaryawan, selectedKaryawanId]
  );

  const [detailData, setDetailData] = useState<DetailHarianKaryawanResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [filterScope, setFilterScope] = useState<'BULAN_INI' | 'SEMUA_BELUM_CAIR'>('SEMUA_BELUM_CAIR');
  const [bulan, setBulan] = useState<number>(initialBulan || now.getMonth() + 1);
  const [tahun, setTahun] = useState<number>(initialTahun || now.getFullYear());

  const [selectedUpahIds, setSelectedUpahIds] = useState<string[]>([]);
  const [bonusInput, setBonusInput] = useState<number>(0);

  const [persentasePotong, setPersentasePotong] = useState<number>(0);
  const [nominalPotongKustom, setNominalPotongKustom] = useState<number>(0);

  const [divisi, setDivisi] = useState<NamaDivisi>('Gudang Wijaya Agro');
  const [metodePembayaran, setMetodePembayaran] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('KAS01');
  const [keterangan, setKeterangan] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const realRekenings = useMemo(
    () =>
      rekeningList.filter(
        (r) =>
          !r.isVirtual &&
          r.kategori !== 'VIRTUAL_SISTEM' &&
          r.kode !== 'BON01' &&
          r.kode !== 'TIT01'
      ),
    [rekeningList]
  );

  useEffect(() => {
    if (!selectedKaryawanId) {
      setDetailData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDetail(true);
      setErrorMsg('');
      try {
        const res = await api.getDetailHarianKaryawan(selectedKaryawanId);
        if (cancelled) return;
        setDetailData(res);
        setBonusInput(0);

        const empDiv = (res.karyawan.divisi || res.karyawan.departemen || 'Gudang Wijaya Agro') as NamaDivisi;
        setDivisi(empDiv);

        const defaultRek =
          realRekenings.find((r) => r.kode === 'KAS01')?.kode ||
          realRekenings.find((r) => r.kode === DIVISI_REKENING_MAP[empDiv])?.kode ||
          realRekenings[0]?.kode ||
          'KAS01';
        setRekeningSumber(defaultRek);
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err.message || 'Gagal memuat rincian upah karyawan');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedKaryawanId]);

  const unpaidRowsFiltered = useMemo((): CatatanUpahHarian[] => {
    const allUnpaid = (detailData?.logHarian || []).filter((u) => u.status === 'TERCATAT');
    if (filterScope === 'SEMUA_BELUM_CAIR') return allUnpaid;
    return allUnpaid.filter((u) => {
      const parts = (u.tanggalKerja || '').split('/');
      if (parts.length < 3) return false;
      return Number(parts[1]) === bulan && Number(parts[2]) === tahun;
    });
  }, [detailData, filterScope, bulan, tahun]);

  useEffect(() => {
    setSelectedUpahIds(unpaidRowsFiltered.map((u) => u.id));
  }, [unpaidRowsFiltered]);

  const selectedUnpaidRows = useMemo(
    () => unpaidRowsFiltered.filter((u) => selectedUpahIds.includes(u.id)),
    [unpaidRowsFiltered, selectedUpahIds]
  );

  const totalUpahHarianTerpilih = useMemo(
    () => selectedUnpaidRows.reduce((s, u) => s + (u.totalUpahHarian || 0), 0),
    [selectedUnpaidRows]
  );

  const hariDalamBulanTerpilih = useMemo(() => new Date(tahun, bulan, 0).getDate(), [tahun, bulan]);
  const hariMasukBulanTerpilih = useMemo(() => {
    const logs = (detailData?.logHarian || []).filter((u) => {
      if ((u.totalUpahHarian || 0) <= 0) return false;
      const parts = (u.tanggalKerja || '').split('/');
      if (parts.length < 3) return false;
      return Number(parts[1]) === bulan && Number(parts[2]) === tahun;
    });
    return new Set(logs.map((u) => u.tanggalKerja)).size;
  }, [detailData, bulan, tahun]);
  const hariTidakMasukBulanTerpilih = Math.max(0, hariDalamBulanTerpilih - hariMasukBulanTerpilih);

  const totalGajiKotor = totalUpahHarianTerpilih + Math.max(0, bonusInput);

  const kasbonBarang = detailData?.karyawan.totalKasbonBarang ?? selectedKaryawan?.kasbonBarang ?? 0;
  const kasbonUang = detailData?.karyawan.totalKasbonUang ?? selectedKaryawan?.kasbonUang ?? 0;
  const totalKasbonAktif = kasbonBarang + kasbonUang;

  const saldoTitipPanenMitra =
    detailData?.karyawan.totalTitipHasilPanen ?? selectedKaryawan?.totalTitipHasilPanen ?? 0;
  const idMitraTerkait =
    detailData?.karyawan.idMitraTerkait ||
    selectedKaryawan?.idMitraTerkait ||
    (selectedKaryawan ? `MTR-${selectedKaryawan.id}` : '');

  let nominalPotonganKasbon = 0;
  if (totalKasbonAktif > 0 && totalGajiKotor > 0) {
    if (persentasePotong === -1) {
      nominalPotonganKasbon = Math.min(Math.max(0, nominalPotongKustom), totalKasbonAktif, totalGajiKotor);
    } else if (persentasePotong > 0) {
      const target = Math.round((totalKasbonAktif * persentasePotong) / 100);
      nominalPotonganKasbon = Math.min(target, totalKasbonAktif, totalGajiKotor);
    }
  }

  const gajiBersihDiterima = Math.max(0, totalGajiKotor - nominalPotonganKasbon);
  const sisaKasbonSetelahGaji = Math.max(0, totalKasbonAktif - nominalPotonganKasbon);

  const selectedRekObj = realRekenings.find((r) => r.kode === rekeningSumber);
  const saldoTidakCukup =
    gajiBersihDiterima > 0 && selectedRekObj ? selectedRekObj.saldoSaatIni < gajiBersihDiterima : false;

  const periodeLabel = `${NAMA_BULAN[bulan - 1]} ${tahun}`;

  const toggleRow = (id: string) => {
    setSelectedUpahIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKaryawanId) {
      setErrorMsg('Pilih karyawan terlebih dahulu.');
      return;
    }
    if (totalGajiKotor <= 0) {
      setErrorMsg('Total gaji kotor harus lebih dari Rp 0.');
      return;
    }
    if (saldoTidakCukup && selectedRekObj) {
      setErrorMsg(
        `Saldo ${selectedRekObj.nama} (${formatRp(selectedRekObj.saldoSaatIni)}) tidak mencukupi untuk gaji bersih ${formatRp(gajiBersihDiterima)}.`
      );
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      if (selectedUnpaidRows.length === 0) {
        throw new Error(
          'Belum ada input gaji per hari kerja yang belum dicairkan. Silakan input gaji harian karyawan terlebih dahulu (hari tanpa input gaji dihitung Tidak Masuk).'
        );
      }
      const slip: TransaksiPenggajian = await api.settleHakUpahKaryawan(selectedKaryawanId, {
        divisi,
        tipeGaji: 'HARIAN',
        periodeBulan: filterScope === 'BULAN_INI' ? periodeLabel : `Akumulasi s/d ${periodeLabel}`,
        upahHarianIds: selectedUpahIds,
        gajiPokokTambahan: 0,
        tunjangan: 0,
        bonus: bonusInput > 0 ? bonusInput : 0,
        rekeningSumber,
        metodePembayaran,
        persentasePotongKasbon: persentasePotong === -1 ? 0 : persentasePotong,
        nominalPotongKustom: persentasePotong === -1 ? nominalPotongKustom : undefined,
        keterangan:
          keterangan.trim() ||
          `Pencairan Gaji Hari Kerja (${selectedUnpaidRows.length} hari masuk) - ${periodeLabel}`,
      });

      onSuccess(slip);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pembayaran gaji karyawan.');
    } finally {
      setSubmitting(false);
    }
  };

  const unpaidAllCount = (detailData?.logHarian || []).filter((u) => u.status === 'TERCATAT').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg leading-tight">
                Pencairan Gaji Karyawan (Per Hari Kerja)
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Dihitung murni per hari kerja karyawan · Hari tanpa input gaji terhitung Tidak Masuk
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Pilih Karyawan & Periode Bulan */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="md:col-span-6">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Pilih Karyawan Penerima Gaji
              </label>
              <select
                value={selectedKaryawanId}
                onChange={(e) => setSelectedKaryawanId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-bold border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {activeEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.nama} ({emp.nik})
                    {(emp.totalUpahBelumDibayar || 0) > 0
                      ? ` · Upah Belum Cair: ${formatRp(emp.totalUpahBelumDibayar || 0)}`
                      : ''}
                    {emp.totalKasbonAktif > 0 ? ` · Kasbon: ${formatRp(emp.totalKasbonAktif)}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-600" /> Bulan Gaji
              </label>
              <select
                value={bulan}
                onChange={(e) => setBulan(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {NAMA_BULAN.map((nb, idx) => (
                  <option key={nb} value={idx + 1}>
                    {nb}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Tahun
              </label>
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {[tahun - 1, tahun, tahun + 1].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Info Terpadu Karyawan = Mitra */}
          {selectedKaryawan && (saldoTitipPanenMitra > 0 || (selectedKaryawan.totalGajiSudahDibayar || 0) > 0) && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <Wheat className="w-4 h-4 text-amber-700" />
                  Status Akun Terpadu: Karyawan &amp; Mitra ({selectedKaryawan.nama})
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  {saldoTitipPanenMitra > 0 ? (
                    <>
                      Memiliki <strong>Saldo Titip Hasil Panen</strong> di Rekening Mitra sebesar{' '}
                      <strong className="font-mono tabular-nums">{formatRp(saldoTitipPanenMitra)}</strong>. Pembayaran gaji di menu ini <strong>hanya mencairkan hak gaji/upah kerja</strong> dan tidak memotong uang titip hasil panen mitra.
                    </>
                  ) : (
                    <>
                      Total histori gaji yang sudah pernah dicairkan ke karyawan ini:{' '}
                      <strong className="font-mono tabular-nums">{formatRp(selectedKaryawan.totalGajiSudahDibayar || 0)}</strong>. Semua riwayat gaji tercatat otomatis di Rekening Mitra.
                    </>
                  )}
                </p>
              </div>
              {onNavigateToRekeningMitra && idMitraTerkait && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToRekeningMitra(idMitraTerkait);
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Buka Rekening Mitra
                </button>
              )}
            </div>
          )}

          {/* 2. Ringkasan Kehadiran Periode & Daftar Catatan Upah Kerja */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-slate-800">
                Rekap Kehadiran Periode {periodeLabel}
              </div>
              <p className="text-slate-600 mt-0.5">
                Sistem tidak menggunakan standar gaji bulanan tetap. Tanggal tanpa input gaji karyawan otomatis dihitung <strong>Tidak Masuk</strong>.
              </p>
            </div>
            <div className="flex items-center gap-4 font-mono tabular-nums">
              <div>
                <span className="text-slate-500 font-sans block text-[10px]">Hari Masuk</span>
                <span className="font-bold text-emerald-700 text-sm">{hariMasukBulanTerpilih} Hari</span>
              </div>
              <div>
                <span className="text-slate-500 font-sans block text-[10px]">Tidak Masuk</span>
                <span className="font-bold text-slate-700 text-sm">{hariTidakMasukBulanTerpilih} Hari</span>
              </div>
              <div>
                <span className="text-slate-500 font-sans block text-[10px]">Belum Cair</span>
                <span className="font-bold text-amber-700 text-sm">{unpaidAllCount} Hari</span>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Input Gaji per Hari Kerja Belum Cair
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterScope('SEMUA_BELUM_CAIR')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    filterScope === 'SEMUA_BELUM_CAIR'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Semua Belum Cair
                </button>
                <button
                  type="button"
                  onClick={() => setFilterScope('BULAN_INI')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    filterScope === 'BULAN_INI'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Hanya {periodeLabel}
                </button>
              </div>
            </div>

            {loadingDetail ? (
              <div className="p-6 text-center text-xs text-slate-500">Memuat rincian hari kerja...</div>
            ) : unpaidRowsFiltered.length === 0 ? (
              <div className="p-6 text-center space-y-1.5">
                <p className="text-sm font-semibold text-slate-700">
                  Belum ada input gaji per hari kerja yang belum cair{' '}
                  {filterScope === 'BULAN_INI' ? `pada periode ${periodeLabel}` : 'untuk karyawan ini'}.
                </p>
                <p className="text-xs text-slate-500">
                  Silakan input gaji pada tanggal karyawan masuk bekerja di tab Input Gaji Harian. Hari tanpa input otomatis dihitung Tidak Masuk.
                </p>
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {unpaidRowsFiltered.map((u) => {
                  const checked = selectedUpahIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(u.id)}
                          className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div>
                          <div className="font-bold text-slate-800">
                            {u.tanggalKerja} · {u.item || u.keterangan || 'Kerja Harian'}
                          </div>
                          <div className="text-slate-500">
                            Divisi {u.divisi}
                            {u.uangMakanLembur > 0 ? ` · Termasuk Lembur/Makan ${formatRp(u.uangMakanLembur)}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">
                        {formatRp(u.totalUpahHarian)}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-600">
                Total Upah Hari Kerja Terpilih ({selectedUnpaidRows.length} hari):{' '}
                <strong className="font-mono tabular-nums text-slate-900">{formatRp(totalUpahHarianTerpilih)}</strong>
              </div>
              <div className="w-full sm:w-64">
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Bonus / Lembur Tambahan (Opsional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={bonusInput || ''}
                  onChange={(e) => setBonusInput(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums font-bold border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>
          </div>

          {/* 4. Potong Kasbon Fleksibel */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Potongan Kasbon Karyawan (Uang + Barang Toko)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kasbon Uang: <span className="font-mono tabular-nums font-semibold">{formatRp(kasbonUang)}</span> · Kasbon Barang:{' '}
                  <span className="font-mono tabular-nums font-semibold">{formatRp(kasbonBarang)}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Total Kasbon Aktif</span>
                <span
                  className={`text-sm font-mono tabular-nums font-bold ${
                    totalKasbonAktif > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {totalKasbonAktif > 0 ? formatRp(totalKasbonAktif) : 'Tidak Ada Kasbon'}
                </span>
              </div>
            </div>

            {totalKasbonAktif > 0 && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { label: '0% (Tunda)', val: 0 },
                    { label: 'Potong 25%', val: 25 },
                    { label: 'Potong 50%', val: 50 },
                    { label: '100% Lunas', val: 100 },
                    { label: 'Nominal Lain', val: -1 },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setPersentasePotong(opt.val)}
                      className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-colors ${
                        persentasePotong === opt.val
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {persentasePotong === -1 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Masukkan Nominal Potongan Kasbon (Maks {formatRp(Math.min(totalKasbonAktif, totalGajiKotor))})
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={Math.min(totalKasbonAktif, totalGajiKotor)}
                      step="10000"
                      value={nominalPotongKustom || ''}
                      onChange={(e) => setNominalPotongKustom(Number(e.target.value) || 0)}
                      placeholder="Contoh: 100000"
                      className="w-full px-3.5 py-2 text-sm font-mono tabular-nums font-bold border border-slate-300 rounded-lg"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Divisi Beban & Rekening Sumber Dana */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-500" /> Beban Divisi
              </label>
              <select
                value={divisi}
                onChange={(e) => setDivisi(e.target.value as NamaDivisi)}
                className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white"
              >
                {Object.keys(DIVISI_REKENING_MAP).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Metode Bayar
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['TUNAI', 'TRANSFER'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMetodePembayaran(m)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                      metodePembayaran === m
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Rekening Kas / Bank Keluar
              </label>
              <select
                value={rekeningSumber}
                onChange={(e) => setRekeningSumber(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white"
              >
                {realRekenings.map((r) => (
                  <option key={r.kode} value={r.kode}>
                    {r.nama} ({formatRp(r.saldoSaatIni)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Catatan Slip Gaji (Opsional)
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder={`Contoh: Gaji Bulanan Penuh ${periodeLabel}`}
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl bg-white"
            />
          </div>

          {/* Ringkasan Final */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="text-slate-400">
                Total Gaji Kotor:{' '}
                <span className="text-white font-mono tabular-nums font-bold">{formatRp(totalGajiKotor)}</span>
                {nominalPotonganKasbon > 0 && (
                  <>
                    {' '}
                    · Potong Kasbon:{' '}
                    <span className="text-rose-300 font-mono tabular-nums font-bold">
                      -{formatRp(nominalPotonganKasbon)}
                    </span>{' '}
                    (Sisa Bon: {formatRp(sisaKasbonSetelahGaji)})
                  </>
                )}
              </div>
              <div className="text-base sm:text-lg font-bold flex items-center gap-2">
                <span>Uang Gaji Bersih Keluar Kas:</span>
                <span className="text-emerald-400 font-mono tabular-nums text-xl">
                  {formatRp(gajiBersihDiterima)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || totalGajiKotor <= 0 || saldoTidakCukup}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 flex items-center gap-2 transition-colors shadow-lg"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Memproses...' : 'Bayar Gaji & Cetak Slip'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
