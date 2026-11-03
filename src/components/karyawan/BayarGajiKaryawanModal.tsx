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
  History,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  CatatanUpahHarian,
  DetailHarianKaryawanResponse,
  NamaDivisi,
  Rekening,
  TransaksiPenggajian,
  TANPA_DIVISI_VALUE,
} from '../../server/types.ts';
import { dmyToIsoInput } from '../../utils/format.ts';

export type ModeBayarGajiModal = 'AKUMULASI_HARIAN' | 'BULAN_SEBELUMNYA_LANGSUNG';

interface BayarGajiKaryawanModalProps {
  initialKaryawanId?: string;
  initialBulan?: number;
  initialTahun?: number;
  initialMode?: ModeBayarGajiModal;
  initialTanggalBayarIso?: string;
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

const DIVISI_LIST: string[] = [
  'Gudang Wijaya Agro',
  'Wijaya Karya',
  'Wijaya Transport',
  'CV Wijaya Agro',
  'PT Wijaya Agro Perkasa',
  'Okussa',
];

const formatRp = (val: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(val || 0);

const formatIsoToDmyDisplay = (iso: string): string => {
  if (!iso) return '-';
  const parts = iso.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return iso;
};

export const isRealPayableRekening = (r: Rekening): boolean =>
  r.status === 'AKTIF' &&
  !r.isVirtual &&
  r.kategori !== 'VIRTUAL_SISTEM' &&
  r.kategori !== 'OPERASIONAL_DIVISI' &&
  r.kode !== 'BON01' &&
  r.kode !== 'TIT01' &&
  r.kode !== 'SINKRON' &&
  (!r.kode.startsWith('REK-') || Boolean(r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN'));

export const BayarGajiKaryawanModal: React.FC<BayarGajiKaryawanModalProps> = ({
  initialKaryawanId,
  initialBulan,
  initialTahun,
  initialMode = 'AKUMULASI_HARIAN',
  initialTanggalBayarIso,
  allKaryawan,
  rekeningList,
  onClose,
  onSuccess,
  onNavigateToRekeningMitra,
}) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const firstOfCurrentMonthIso = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
  const firstOfNovIso = `${currentYear}-11-01`;

  const activeEmployees = useMemo(
    () => allKaryawan.filter((k) => k.status === 'AKTIF' || k.id === initialKaryawanId),
    [allKaryawan, initialKaryawanId]
  );

  const [modePembayaranGaji, setModePembayaranGaji] = useState<ModeBayarGajiModal>(initialMode);

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
  const [bulan, setBulan] = useState<number>(
    initialBulan || (initialMode === 'BULAN_SEBELUMNYA_LANGSUNG' ? prevMonth : currentMonth)
  );
  const [tahun, setTahun] = useState<number>(
    initialTahun || (initialMode === 'BULAN_SEBELUMNYA_LANGSUNG' ? prevMonthYear : currentYear)
  );

  const [selectedUpahIds, setSelectedUpahIds] = useState<string[]>([]);
  const [gajiBulanLaluInput, setGajiBulanLaluInput] = useState<number>(0);
  const [ikutkanUpahBulanLalu, setIkutkanUpahBulanLalu] = useState<boolean>(true);
  const [bonusInput, setBonusInput] = useState<number>(0);

  const [persentasePotong, setPersentasePotong] = useState<number>(0);
  const [nominalPotongKustom, setNominalPotongKustom] = useState<number>(0);

  const [divisi, setDivisi] = useState<NamaDivisi | string>('Gudang Wijaya Agro');
  const [metodePembayaran, setMetodePembayaran] = useState<'TUNAI' | 'TRANSFER' | 'SINKRON'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('KAS01');
  const [tanggalBayar, setTanggalBayar] = useState<string>(
    initialTanggalBayarIso ||
      (initialMode === 'BULAN_SEBELUMNYA_LANGSUNG' ? firstOfCurrentMonthIso : dmyToIsoInput())
  );
  const [keterangan, setKeterangan] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Hanya rekening Kas Tunai & Bank PT riil (TIDAK termasuk Buku Operasional Divisi REK-* yang bersaldo Rp 0 di awal bulan)
  const realRekenings = useMemo(
    () => rekeningList.filter(isRealPayableRekening),
    [rekeningList]
  );

  const bankTransferRekenings = useMemo(
    () => realRekenings.filter((r) => r.kode !== 'KAS01'),
    [realRekenings]
  );

  const kasirUtamaRek = useMemo(
    () => realRekenings.find((r) => r.kode === 'KAS01') || realRekenings[0],
    [realRekenings]
  );

  const handleSwitchMode = (nextMode: ModeBayarGajiModal) => {
    setModePembayaranGaji(nextMode);
    setErrorMsg('');
    if (nextMode === 'BULAN_SEBELUMNYA_LANGSUNG') {
      // Otomatis arahkan ke Bulan Sebelumnya (misal Oktober) & Tanggal Pencairan 1 Bulan Ini (misal 1 Nov)
      setBulan(prevMonth);
      setTahun(prevMonthYear);
      setTanggalBayar(firstOfCurrentMonthIso);
      if (gajiBulanLaluInput <= 0 && selectedKaryawan?.gajiPokok && selectedKaryawan.gajiPokok > 0) {
        setGajiBulanLaluInput(selectedKaryawan.gajiPokok);
      }
    }
  };

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

        if (modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG') {
          const std = res.karyawan.standarGajiPokok || selectedKaryawan?.gajiPokok || 0;
          if (std > 0) setGajiPokokIfZero(std);
        }

        if (metodePembayaran === 'TUNAI') {
          setRekeningSumber(kasirUtamaRek?.kode || 'KAS01');
        } else if (metodePembayaran === 'TRANSFER') {
          setRekeningSumber(bankTransferRekenings[0]?.kode || kasirUtamaRek?.kode || 'KAS01');
        }
      } catch (err: any) {
        if (!cancelled) setErrorMsg(err.message || 'Gagal memuat rincian upah karyawan');
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };
    const setGajiPokokIfZero = (val: number) => {
      setGajiBulanLaluInput((prev) => (prev > 0 ? prev : val));
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedKaryawanId]);

  const unpaidRowsSelectedMonth = useMemo((): CatatanUpahHarian[] => {
    const allUnpaid = (detailData?.logHarian || []).filter((u) => u.status === 'TERCATAT');
    return allUnpaid.filter((u) => {
      const parts = (u.tanggalKerja || '').split('/');
      if (parts.length < 3) return false;
      return Number(parts[1]) === bulan && Number(parts[2]) === tahun;
    });
  }, [detailData, bulan, tahun]);

  const unpaidRowsFiltered = useMemo((): CatatanUpahHarian[] => {
    const allUnpaid = (detailData?.logHarian || []).filter((u) => u.status === 'TERCATAT');
    if (filterScope === 'SEMUA_BELUM_CAIR') return allUnpaid;
    return unpaidRowsSelectedMonth;
  }, [detailData, filterScope, unpaidRowsSelectedMonth]);

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

  const totalUpahBulanDipilihBelumCair = useMemo(
    () => unpaidRowsSelectedMonth.reduce((s, u) => s + (u.totalUpahHarian || 0), 0),
    [unpaidRowsSelectedMonth]
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

  const totalGajiKotor =
    modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
      ? Math.max(0, gajiBulanLaluInput) +
        (ikutkanUpahBulanLalu ? totalUpahBulanDipilihBelumCair : 0) +
        Math.max(0, bonusInput)
      : totalUpahHarianTerpilih + Math.max(0, bonusInput);

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

  const isSinkronMode = metodePembayaran === 'SINKRON' || rekeningSumber === 'SINKRON';
  const effectiveRekeningKode = isSinkronMode
    ? 'SINKRON'
    : metodePembayaran === 'TUNAI'
    ? kasirUtamaRek?.kode || 'KAS01'
    : rekeningSumber;

  const selectedRekObj = isSinkronMode
    ? undefined
    : realRekenings.find((r) => r.kode === effectiveRekeningKode);
  const saldoTidakCukup =
    !isSinkronMode && gajiBersihDiterima > 0 && selectedRekObj
      ? selectedRekObj.saldoSaatIni < gajiBersihDiterima
      : false;

  const periodeLabel = `${NAMA_BULAN[bulan - 1]} ${tahun}`;
  const yearOptions = Array.from(new Set([currentYear - 2, currentYear - 1, currentYear, currentYear + 1])).sort();

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
      setErrorMsg(
        modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
          ? `Masukkan nominal Gaji Bulan ${periodeLabel} terlebih dahulu (harus lebih dari Rp 0).`
          : 'Total gaji kotor harus lebih dari Rp 0.'
      );
      return;
    }
    if (metodePembayaran === 'TRANSFER' && !isSinkronMode && bankTransferRekenings.length === 0) {
      setErrorMsg('Tidak ada rekening Bank aktif untuk metode TRANSFER. Pilih metode TUNAI atau SINKRON.');
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
      const [yy, mm, dd] = (tanggalBayar || '').split('-');
      const formattedTanggalBayar =
        yy && mm && dd ? `${dd}/${mm}/${yy}` : tanggalBayar;

      if (modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG') {
        const idsBulanLalu =
          ikutkanUpahBulanLalu && unpaidRowsSelectedMonth.length > 0
            ? unpaidRowsSelectedMonth.map((u) => u.id)
            : [];

        const slip: TransaksiPenggajian = await api.settleHakUpahKaryawan(selectedKaryawanId, {
          divisi,
          tanggalBayar: formattedTanggalBayar,
          tanggalKerja: formattedTanggalBayar,
          tipeGaji: 'BULANAN',
          periodeBulan: `Gaji Bulan ${periodeLabel}`,
          upahHarianIds: idsBulanLalu,
          abaikanUpahHarian: idsBulanLalu.length === 0,
          gajiPokokTambahan: Math.max(0, gajiBulanLaluInput),
          tunjangan: 0,
          bonus: bonusInput > 0 ? bonusInput : 0,
          rekeningSumber: effectiveRekeningKode,
          metodePembayaran: isSinkronMode ? 'SINKRON' : metodePembayaran,
          persentasePotongKasbon: persentasePotong === -1 ? 0 : persentasePotong,
          nominalPotongKustom: persentasePotong === -1 ? nominalPotongKustom : undefined,
          keterangan:
            keterangan.trim() ||
            `Pembayaran Gaji Bulan Sebelumnya (${periodeLabel}) - Dicairkan tgl ${formattedTanggalBayar}`,
        });

        onSuccess(slip);
        return;
      }

      if (selectedUnpaidRows.length === 0) {
        throw new Error(
          'Belum ada input gaji per hari kerja yang belum dicairkan. Untuk membayar gaji bulan sebelumnya (misal Gaji Oktober dicairkan tgl 1 Nov) tanpa input harian, klik tab "Bayar Gaji Bulan Sebelumnya (Oktober / Langsung)" di atas.'
        );
      }

      const slip: TransaksiPenggajian = await api.settleHakUpahKaryawan(selectedKaryawanId, {
        divisi,
        tanggalBayar: formattedTanggalBayar,
        tanggalKerja: formattedTanggalBayar,
        tipeGaji: 'HARIAN',
        periodeBulan: filterScope === 'BULAN_INI' ? periodeLabel : `Akumulasi s/d ${periodeLabel}`,
        upahHarianIds: selectedUpahIds,
        abaikanUpahHarian: false,
        gajiPokokTambahan: 0,
        tunjangan: 0,
        bonus: bonusInput > 0 ? bonusInput : 0,
        rekeningSumber: effectiveRekeningKode,
        metodePembayaran: isSinkronMode ? 'SINKRON' : metodePembayaran,
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
                {modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
                  ? `Pembayaran Gaji Bulan Sebelumnya (${periodeLabel})`
                  : 'Pencairan Gaji Karyawan (Per Hari Kerja)'}
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                {modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
                  ? `Khusus bayar gaji bulan lalu (misal Oktober) tanpa perlu input absensi harian · Uang keluar tercatat di Arus Kas Harian pada tanggal pencairan`
                  : 'Cairkan akumulasi upah kerja harian karyawan · Otomatis tercatat ke Uang Keluar Arus Kas Harian'}
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

        {/* Mode Switch Tabs */}
        <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchMode('AKUMULASI_HARIAN')}
            className={`px-3.5 py-2.5 rounded-xl text-left border transition-all flex items-center gap-2.5 cursor-pointer ${
              modePembayaranGaji === 'AKUMULASI_HARIAN'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <FileSpreadsheet
              className={`w-4 h-4 shrink-0 ${
                modePembayaranGaji === 'AKUMULASI_HARIAN' ? 'text-emerald-400' : 'text-slate-500'
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">1. Cairkan Akumulasi Hari Kerja</div>
              <div
                className={`text-[10px] truncate ${
                  modePembayaranGaji === 'AKUMULASI_HARIAN' ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                Dari catatan upah harian yang belum cair ({unpaidAllCount} hari)
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMode('BULAN_SEBELUMNYA_LANGSUNG')}
            className={`px-3.5 py-2.5 rounded-xl text-left border transition-all flex items-center gap-2.5 cursor-pointer ${
              modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : 'bg-amber-50/80 text-amber-950 border-amber-300 hover:bg-amber-100/80'
            }`}
          >
            <History
              className={`w-4 h-4 shrink-0 ${
                modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG' ? 'text-amber-100' : 'text-amber-700'
              }`}
            />
            <div className="min-w-0">
              <div className="text-xs font-bold flex items-center gap-1.5 truncate">
                <span>2. Bayar Gaji Bulan Sebelumnya (Oktober)</span>
              </div>
              <div
                className={`text-[10px] truncate ${
                  modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG' ? 'text-amber-100' : 'text-amber-800'
                }`}
              >
                Input nominal langsung tanpa absen harian · Cair di Tgl 1 Nov
              </div>
            </div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Pilih Karyawan & Periode Bulan Gaji */}
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
                <Calendar className="w-3.5 h-3.5 text-slate-600" /> Periode Bulan Gaji
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
                Tahun Periode
              </label>
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {yearOptions.map((yr) => (
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

          {/* 2. MODE KHUSUS: BAYAR GAJI BULAN SEBELUMNYA (OKTOBER) LANGSUNG */}
          {modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG' ? (
            <div className="p-4 sm:p-5 rounded-xl border-2 border-amber-300 bg-amber-50/50 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <History className="w-4 h-4 text-amber-700" />
                    <span>Input Nominal Gaji Bulan Sebelumnya ({periodeLabel})</span>
                  </h4>
                  <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                    Gunakan menu ini untuk membayar gaji periode sebelum pemakaian sistem (misal <strong>Gaji Bulan Oktober</strong>) yang uang kasnya baru diambil/dicairkan pada <strong>1 November</strong>. Catatan absen harian bulan November tidak akan ikut terganggu.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setBulan(10);
                    setTanggalBayar(`${tahun}-11-01`);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  Set Gaji Oktober → Cair 1 Nov
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Nominal Gaji Pokok Bulan {periodeLabel} (Rp) <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={gajiBulanLaluInput || ''}
                    onChange={(e) => setGajiBulanLaluInput(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Contoh: 2500000"
                    className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums font-bold border border-amber-400 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[1500000, 2000000, 2500000, 3000000, 3500000, 4000000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setGajiBulanLaluInput(preset)}
                        className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                          gajiBulanLaluInput === preset
                            ? 'bg-amber-700 text-white border-amber-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-amber-100'
                        }`}
                      >
                        {(preset / 1000000).toLocaleString('id-ID')} Jt
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Tambahan Bonus / Lembur Bulan {periodeLabel} (Opsional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={bonusInput || ''}
                    onChange={(e) => setBonusInput(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums font-bold border border-slate-300 rounded-xl bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-600 mt-1.5">
                    Total Gaji Kotor {periodeLabel}:{' '}
                    <strong className="font-mono text-slate-900">{formatRp(totalGajiKotor)}</strong>
                  </p>
                </div>
              </div>

              {unpaidRowsSelectedMonth.length > 0 && (
                <label className="p-3 rounded-xl bg-white border border-amber-300 flex items-start gap-2.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={ikutkanUpahBulanLalu}
                    onChange={(e) => setIkutkanUpahBulanLalu(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-bold text-slate-800">
                      Sekalian lunasi {unpaidRowsSelectedMonth.length} catatan upah di bulan {periodeLabel} ({formatRp(totalUpahBulanDipilihBelumCair)})
                    </span>
                    <span className="block text-slate-600 mt-0.5">
                      Ditemukan catatan upah tanggal {unpaidRowsSelectedMonth.map((u) => u.tanggalKerja).join(', ')} yang masih berstatus Belum Cair. Centang agar otomatis ditandai LUNAS (isi Rp 0 pada kolom Gaji Pokok di atas jika nominal sudah terwakili catatan tersebut).
                    </span>
                  </div>
                </label>
              )}
            </div>
          ) : (
            /* 2B. MODE REGULER: AKUMULASI HARI KERJA */
            <>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-slate-800">
                    Rekap Kehadiran Periode {periodeLabel}
                  </div>
                  <p className="text-slate-600 mt-0.5">
                    Gaji dihitung per hari kerja karyawan. Untuk bayar gaji bulan lalu tanpa input harian, klik tab <strong>2. Bayar Gaji Bulan Sebelumnya (Oktober)</strong> di atas.
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
                  <div className="p-6 text-center space-y-2.5">
                    <p className="text-sm font-semibold text-slate-700">
                      Belum ada input gaji per hari kerja yang belum cair{' '}
                      {filterScope === 'BULAN_INI' ? `pada periode ${periodeLabel}` : 'untuk karyawan ini'}.
                    </p>
                    <p className="text-xs text-slate-500 max-w-xl mx-auto">
                      Ingin membayar <strong>Gaji Bulan Sebelumnya (misal Oktober)</strong> yang dicairkan tanggal 1 November tanpa input absensi harian?
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('BULAN_SEBELUMNYA_LANGSUNG')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Bayar Gaji Bulan Sebelumnya (Oktober) Langsung →</span>
                    </button>
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
                      step="any"
                      value={bonusInput || ''}
                      onChange={(e) => setBonusInput(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums font-bold border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* 4. Potong Kasbon Fleksibel */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Potongan Kasbon Karyawan (Uang + Barang Toko / Hasil Bumi)
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
                      step="any"
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

          {/* 5. Divisi Beban & Rekening Sumber Dana Riil */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-500" /> Beban Arus Kas Divisi
              </label>
              <select
                value={divisi}
                onChange={(e) => setDivisi(e.target.value)}
                className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white"
              >
                {DIVISI_LIST.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value={TANPA_DIVISI_VALUE}>
                  ⊘ Tanpa Divisi (Hanya Potong Kasir/Bank)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Metode Bayar
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['TUNAI', 'TRANSFER', 'SINKRON'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMetodePembayaran(m);
                      if (m === 'SINKRON') {
                        setRekeningSumber('SINKRON');
                      } else if (m === 'TUNAI') {
                        setRekeningSumber(kasirUtamaRek?.kode || 'KAS01');
                      } else if (m === 'TRANSFER') {
                        setRekeningSumber(bankTransferRekenings[0]?.kode || kasirUtamaRek?.kode || 'KAS01');
                      }
                    }}
                    className={`py-2.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                      metodePembayaran === m
                        ? m === 'SINKRON'
                          ? 'bg-cyan-700 text-white border-cyan-700'
                          : 'bg-emerald-600 text-white border-emerald-600'
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
              {isSinkronMode ? (
                <div className="w-full px-3 py-2.5 text-xs font-mono font-bold border border-cyan-300 rounded-xl bg-cyan-50 text-cyan-900">
                  SINKRON — Non-Kas (Rp 0 Uang Riil)
                </div>
              ) : metodePembayaran === 'TUNAI' ? (
                <div className="w-full px-3 py-2.5 text-xs font-bold border border-emerald-300 rounded-xl bg-emerald-50 text-emerald-950 flex items-center justify-between">
                  <span>{kasirUtamaRek?.nama || 'Kasir Utama'} (KAS01)</span>
                  <span className="font-mono">{formatRp(kasirUtamaRek?.saldoSaatIni || 0)}</span>
                </div>
              ) : (
                <select
                  value={effectiveRekeningKode}
                  onChange={(e) => setRekeningSumber(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-semibold border border-slate-300 rounded-xl bg-white"
                >
                  {(bankTransferRekenings.length > 0 ? bankTransferRekenings : realRekenings).map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.nama} ({formatRp(r.saldoSaatIni)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* 6. Tanggal Uang Keluar di Arus Kas Harian & Catatan */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 bg-emerald-50/50 p-4 rounded-xl border border-emerald-200">
            <div className="sm:col-span-5">
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-emerald-600" /> Tanggal Pencairan (Uang Keluar di Arus Kas Harian)
              </label>
              <input
                type="date"
                value={tanggalBayar}
                onChange={(e) => setTanggalBayar(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono font-bold border border-emerald-400 rounded-xl bg-white text-slate-900"
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[10px] text-slate-500">Pilih Cepat:</span>
                <button
                  type="button"
                  onClick={() => setTanggalBayar(firstOfNovIso)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                    tanggalBayar === firstOfNovIso
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  }`}
                >
                  Tgl 1 Nov
                </button>
                <button
                  type="button"
                  onClick={() => setTanggalBayar(firstOfCurrentMonthIso)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                    tanggalBayar === firstOfCurrentMonthIso
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Tgl 1 Bulan Ini
                </button>
                <button
                  type="button"
                  onClick={() => setTanggalBayar(dmyToIsoInput())}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                    tanggalBayar === dmyToIsoInput()
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Hari Ini
                </button>
              </div>
            </div>

            <div className="sm:col-span-7 flex flex-col justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Catatan Slip Gaji (Opsional)
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder={
                    modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
                      ? `Contoh: Pembayaran Gaji Bulan ${periodeLabel} (cair tgl ${formatIsoToDmyDisplay(tanggalBayar)})`
                      : `Contoh: Gaji Hari Kerja ${periodeLabel}`
                  }
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl bg-white"
                />
              </div>
              <p className="text-[11px] text-emerald-900 mt-2 font-medium">
                {isSinkronMode ? (
                  <>Mode <strong>SINKRON</strong>: tercatat di buku gaji tanpa memotong saldo kas harian.</>
                ) : (
                  <>
                    Uang keluar sebesar <strong className="font-mono">{formatRp(gajiBersihDiterima)}</strong> akan otomatis masuk ke <strong>Uang Keluar pada Arus Kas Harian tanggal {formatIsoToDmyDisplay(tanggalBayar)}</strong> ({selectedRekObj?.nama || effectiveRekeningKode}).
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Ringkasan Final */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="text-slate-400">
                Periode Gaji: <span className="text-amber-300 font-bold">{periodeLabel}</span> · Total Gaji Kotor:{' '}
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
              <div className="text-base sm:text-lg font-bold flex flex-wrap items-center gap-2">
                <span>Uang Gaji Bersih Keluar Kas ({formatIsoToDmyDisplay(tanggalBayar)}):</span>
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
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 flex items-center gap-2 transition-colors shadow-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Memproses...'
                    : modePembayaranGaji === 'BULAN_SEBELUMNYA_LANGSUNG'
                    ? `Bayar Gaji ${NAMA_BULAN[bulan - 1]} & Cetak Slip`
                    : 'Bayar Gaji & Cetak Slip'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
