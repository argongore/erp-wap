import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeftRight,
  RefreshCw,
  Search,
  FileDown,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  Users,
  Scale,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  CatatanCashOpname,
  HasilKliringSilangResponse,
  KandidatKliringMitra,
  Mitra,
  ProfilPerusahaan,
  Rekening,
  SmartControlOverviewResponse,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import {
  exportBeritaAcaraOpnameToPdf,
  exportBuktiKliringToPdf,
} from '../../utils/exportKontrolKasirPdf.ts';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  initialSubTab?: 'kliring' | 'duplikat' | 'opname';
  initialMitraId?: string;
  onRefreshParent: () => void;
  onOpenStatement: (idMitra: string) => void;
}

const PECAHAN_RUPIAH = [
  { nominal: 100000, label: 'Rp 100.000', jenis: 'Kertas' },
  { nominal: 75000, label: 'Rp 75.000', jenis: 'Kertas' },
  { nominal: 50000, label: 'Rp 50.000', jenis: 'Kertas' },
  { nominal: 20000, label: 'Rp 20.000', jenis: 'Kertas' },
  { nominal: 10000, label: 'Rp 10.000', jenis: 'Kertas' },
  { nominal: 5000, label: 'Rp 5.000', jenis: 'Kertas' },
  { nominal: 2000, label: 'Rp 2.000', jenis: 'Kertas' },
  { nominal: 1000, label: 'Rp 1.000', jenis: 'Kertas / Logam' },
  { nominal: 500, label: 'Rp 500', jenis: 'Logam' },
  { nominal: 200, label: 'Rp 200', jenis: 'Logam' },
  { nominal: 100, label: 'Rp 100', jenis: 'Logam' },
];

export const PusatKontrolKasirView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  initialSubTab = 'kliring',
  initialMitraId = '',
  onRefreshParent,
  onOpenStatement,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'kliring' | 'duplikat' | 'opname'>(initialSubTab);
  const [overview, setOverview] = useState<SmartControlOverviewResponse | null>(null);
  const [profil, setProfil] = useState<ProfilPerusahaan | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // --- TAB 1: KLIRING SILANG STATES ---
  const [showAllMitraSaldo, setShowAllMitraSaldo] = useState<boolean>(false);
  const [searchKliring, setSearchKliring] = useState<string>('');
  const [selectedKliringMitraId, setSelectedKliringMitraId] = useState<string>(initialMitraId);
  const [nominalPotongInput, setNominalPotongInput] = useState<string>('');
  const [aksiSisa, setAksiSisa] = useState<
    'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON'
  >('HANYA_POTONG_SILANG');
  const [nominalFisikInput, setNominalFisikInput] = useState<string>('');
  const [metodeFisik, setMetodeFisik] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningFisik, setRekeningFisik] = useState<string>('BNI01');
  const [keteranganKliring, setKeteranganKliring] = useState<string>('');
  const [submittingKliring, setSubmittingKliring] = useState<boolean>(false);
  const [lastKliringResult, setLastKliringResult] = useState<HasilKliringSilangResponse | null>(null);

  // --- TAB 2: DETEKTOR & MERGER NAMA KEMBAR STATES ---
  const [primaryMitraId, setPrimaryMitraId] = useState<string>('');
  const [duplicateMitraId, setDuplicateMitraId] = useState<string>('');
  const [alasanMerge, setAlasanMerge] = useState<string>('');
  const [confirmMergeChecked, setConfirmMergeChecked] = useState<boolean>(false);
  const [submittingMerge, setSubmittingMerge] = useState<boolean>(false);

  // --- TAB 3: CASH OPNAME LACI KAS01 STATES ---
  const [petugasKasir, setPetugasKasir] = useState<string>('Kasir Utama Wijaya Agro');
  const [pecahanCounts, setPecahanCounts] = useState<Record<string, string>>({});
  const [sesuaikanSaldoSistem, setSesuaikanSaldoSistem] = useState<boolean>(false);
  const [catatanOpname, setCatatanOpname] = useState<string>('');
  const [submittingOpname, setSubmittingOpname] = useState<boolean>(false);
  const [lastOpnameResult, setLastOpnameResult] = useState<CatatanCashOpname | null>(null);

  const realBankAccounts = useMemo(
    () =>
      rekeningList.filter(
        (r) => !r.isVirtual && r.status === 'AKTIF' && r.kode !== 'KAS01' && !r.kode.startsWith('REK-')
      ),
    [rekeningList]
  );

  const loadOverview = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setOverview((prev) => {
          if (!prev) setLoading(true);
          return prev;
        });
      }
      setErrorMsg(null);
      const [ovRes, profRes] = await Promise.all([
        api.getSmartControlOverview(),
        api.getProfilPerusahaan().catch(() => null),
      ]);
      setOverview(ovRes);
      if (profRes) setProfil(profRes);
    } catch (err: any) {
      if (!silent) setErrorMsg(err.message || 'Gagal memuat pusat kontrol & rekonsiliasi kasir');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview(false);
    const onErpUpdated = () => loadOverview(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [loadOverview]);

  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  // Select default mitra for Kliring when overview arrives
  useEffect(() => {
    if (!overview) return;
    if (initialMitraId) {
      setSelectedKliringMitraId(initialMitraId);
      setShowAllMitraSaldo(true);
      return;
    }
    if (!selectedKliringMitraId && overview.kandidatKliring.length > 0) {
      setSelectedKliringMitraId(overview.kandidatKliring[0].idMitra);
    }
  }, [overview, initialMitraId, selectedKliringMitraId]);

  const displayedKliringList = useMemo(() => {
    if (!overview) return [];
    const base = showAllMitraSaldo ? overview.semuaMitraSaldo : overview.kandidatKliring;
    if (!searchKliring.trim()) return base;
    const q = searchKliring.toLowerCase();
    return base.filter(
      (item) =>
        item.namaMitra.toLowerCase().includes(q) ||
        item.kodeMitra.toLowerCase().includes(q) ||
        (item.telepon || '').toLowerCase().includes(q)
    );
  }, [overview, showAllMitraSaldo, searchKliring]);

  const activeKliringCandidate: KandidatKliringMitra | null = useMemo(() => {
    if (!overview || !selectedKliringMitraId) return null;
    return overview.semuaMitraSaldo.find((m) => m.idMitra === selectedKliringMitraId) || null;
  }, [overview, selectedKliringMitraId]);

  // Sync default potong silang & penyelesaian fisik when selecting a Mitra
  useEffect(() => {
    if (!activeKliringCandidate) {
      setNominalPotongInput('');
      setNominalFisikInput('');
      setAksiSisa('HANYA_POTONG_SILANG');
      return;
    }
    const maxPotong = activeKliringCandidate.potensiPotongSilang;
    setNominalPotongInput(String(maxPotong));
    setAksiSisa('HANYA_POTONG_SILANG');
    setNominalFisikInput('0');
  }, [activeKliringCandidate?.idMitra]);

  const parsedPotongSilang = Math.max(0, Math.round(Number(nominalPotongInput) || 0));
  const parsedNominalFisik = Math.max(0, Math.round(Number(nominalFisikInput) || 0));

  const postPotongPreview = useMemo(() => {
    if (!activeKliringCandidate) {
      return { sisaTitipSetelahPotong: 0, sisaBonSetelahPotong: 0, sisaTitipAkhir: 0, sisaBonAkhir: 0 };
    }
    const validPotong = Math.min(parsedPotongSilang, activeKliringCandidate.potensiPotongSilang);
    const sisaTitipSetelahPotong = Math.max(0, activeKliringCandidate.saldoTitipan - validPotong);
    const sisaBonSetelahPotong = Math.max(0, activeKliringCandidate.totalKasbon - validPotong);

    let sisaTitipAkhir = sisaTitipSetelahPotong;
    let sisaBonAkhir = sisaBonSetelahPotong;

    if (aksiSisa === 'CAIRKAN_SISA_TITIPAN') {
      sisaTitipAkhir = Math.max(0, sisaTitipSetelahPotong - parsedNominalFisik);
    } else if (aksiSisa === 'TERIMA_PELUNASAN_SISA_BON') {
      sisaBonAkhir = Math.max(0, sisaBonSetelahPotong - parsedNominalFisik);
    }

    return {
      sisaTitipSetelahPotong,
      sisaBonSetelahPotong,
      sisaTitipAkhir,
      sisaBonAkhir,
    };
  }, [activeKliringCandidate, parsedPotongSilang, parsedNominalFisik, aksiSisa]);

  // Execute single Mitra Kliring Silang
  const handleSubmitKliring = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeKliringCandidate) return;

    try {
      setSubmittingKliring(true);
      setErrorMsg(null);
      setFeedbackMsg(null);

      const res = await api.processKliringSilang({
        idMitra: activeKliringCandidate.idMitra,
        nominalPotongSilang: parsedPotongSilang,
        aksiSisa,
        nominalPenyelesaianFisik: aksiSisa === 'HANYA_POTONG_SILANG' ? 0 : parsedNominalFisik,
        metodeFisik,
        rekeningFisik: metodeFisik === 'TUNAI' ? 'KAS01' : rekeningFisik,
        keterangan: keteranganKliring.trim() || undefined,
      });

      setLastKliringResult(res);
      setKeteranganKliring('');
      setFeedbackMsg(
        `Kliring kemitraan ${res.namaMitra} berhasil diproses (Potong Silang: ${formatRupiah(res.nominalPotongSilang)}).`
      );
      await loadOverview();
      onRefreshParent();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses kliring silang');
    } finally {
      setSubmittingKliring(false);
    }
  };

  // Execute Batch Auto-Netting for all cross-balance partners
  const handleBatchKliring = async () => {
    if (!overview || overview.kandidatKliring.length === 0) return;
    try {
      setSubmittingKliring(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const res = await api.processBatchKliring();
      setFeedbackMsg(
        `Kliring massal selesai: ${res.processedCount} mitra berhasil dipotong silang senilai total ${formatRupiah(
          res.totalKompensasi
        )} tanpa mengganggu kas fisik.`
      );
      await loadOverview();
      onRefreshParent();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menjalankan kliring massal');
    } finally {
      setSubmittingKliring(false);
    }
  };

  // Execute Duplicate Mitra Merge
  const handleSubmitMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!primaryMitraId || !duplicateMitraId) {
      setErrorMsg('Pilih akun utama yang dipertahankan dan akun duplikat yang akan digabungkan.');
      return;
    }
    if (!confirmMergeChecked) {
      setErrorMsg('Centang konfirmasi penggabungan permanen terlebih dahulu.');
      return;
    }

    try {
      setSubmittingMerge(true);
      setErrorMsg(null);
      setFeedbackMsg(null);
      const res = await api.mergeDuplicateMitra({
        primaryMitraId,
        duplicateMitraId,
        alasan: alasanMerge.trim() || undefined,
      });
      setFeedbackMsg(res.message);
      setDuplicateMitraId('');
      setAlasanMerge('');
      setConfirmMergeChecked(false);
      await loadOverview();
      onRefreshParent();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menggabungkan akun mitra');
    } finally {
      setSubmittingMerge(false);
    }
  };

  // Compute physical cash total in Cash Opname
  const totalFisikHitung = useMemo(() => {
    return PECAHAN_RUPIAH.reduce((sum, p) => {
      const qty = Math.max(0, Math.floor(Number(pecahanCounts[String(p.nominal)]) || 0));
      return sum + p.nominal * qty;
    }, 0);
  }, [pecahanCounts]);

  const saldoSistemKas01 = overview?.saldoKas01SaatIni || 0;
  const selisihOpname = totalFisikHitung - saldoSistemKas01;

  const handleSubmitCashOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmittingOpname(true);
      setErrorMsg(null);
      setFeedbackMsg(null);

      const numericMap: Record<string, number> = {};
      PECAHAN_RUPIAH.forEach((p) => {
        const qty = Math.max(0, Math.floor(Number(pecahanCounts[String(p.nominal)]) || 0));
        if (qty > 0) numericMap[String(p.nominal)] = qty;
      });

      const saved = await api.recordCashOpname({
        petugasKasir: petugasKasir.trim() || 'Staf Kasir Utama',
        rincianPecahan: numericMap,
        sesuaikanSaldoSistem,
        catatan: catatanOpname.trim() || undefined,
      });

      setLastOpnameResult(saved);
      setCatatanOpname('');
      setSesuaikanSaldoSistem(false);
      setFeedbackMsg(
        `Berita Acara Cash Opname (${saved.id}) berhasil disimpan. Status: ${saved.statusRekonsiliasi.replace(
          '_',
          ' '
        )}.`
      );
      await loadOverview();
      onRefreshParent();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan cash opname');
    } finally {
      setSubmittingOpname(false);
    }
  };

  const totalPotensiKliring = useMemo(
    () => (overview?.kandidatKliring || []).reduce((s, k) => s + k.potensiPotongSilang, 0),
    [overview]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 tracking-tight">
            Pusat Kliring Silang, Audit Mitra &amp; Cash Opname
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Penyelesaian potong bon otomatis dari hasil panen petani · Deteksi nama mitra kembar · Rekonsiliasi uang fisik laci kasir sore
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              loadOverview();
              onRefreshParent();
            }}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-900' : 'text-zinc-500'}`} />
            <span>Segarkan Data</span>
          </button>
        </div>
      </div>

      {/* Top Executive Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-zinc-200 min-w-0 overflow-hidden">
          <div className="text-xs font-medium text-zinc-500 truncate">Potensi Potong Bon Silang</div>
          <div
            className="text-xl font-bold font-mono tabular-nums text-zinc-900 mt-1 truncate whitespace-nowrap"
            title={formatRupiah(totalPotensiKliring)}
          >
            {formatRupiahSingkat(totalPotensiKliring)}
          </div>
          <div className="text-xs text-zinc-500 mt-1 truncate">
            {overview?.kandidatKliring.length || 0} mitra punya titipan sekaligus bon
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-zinc-200 min-w-0 overflow-hidden">
          <div className="text-xs font-medium text-zinc-500 truncate">Deteksi Indikasi Nama Kembar</div>
          <div className="text-xl font-bold font-mono tabular-nums text-zinc-900 mt-1 truncate whitespace-nowrap">
            {overview?.pasanganKembar.length || 0} Pasang
          </div>
          <div className="text-xs text-zinc-500 mt-1 truncate">
            {overview?.pasanganKembar.filter((p) => p.risikoSilang).length || 0} pasang berisiko saldo terpecah
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-zinc-200 min-w-0 overflow-hidden">
          <div className="text-xs font-medium text-zinc-500 truncate">Saldo Buku Laci KAS01</div>
          <div
            className="text-xl font-bold font-mono tabular-nums text-emerald-700 mt-1 truncate whitespace-nowrap"
            title={formatRupiah(saldoSistemKas01)}
          >
            {formatRupiahSingkat(saldoSistemKas01)}
          </div>
          <div
            className="text-xs text-zinc-500 mt-1 font-mono tabular-nums truncate whitespace-nowrap"
            title={`Masuk hari ini: +${formatRupiah(overview?.ringkasanKasHariIni.masukTunaiKas01 || 0)}`}
          >
            Masuk hari ini: +{formatRupiahSingkat(overview?.ringkasanKasHariIni.masukTunaiKas01 || 0)}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-zinc-200 min-w-0 overflow-hidden">
          <div className="text-xs font-medium text-zinc-500 truncate">Kliring Non-Tunai Hari Ini</div>
          <div
            className="text-xl font-bold font-mono tabular-nums text-zinc-900 mt-1 truncate whitespace-nowrap"
            title={formatRupiah(overview?.ringkasanKasHariIni.kompensasiNonTunaiHariIni || 0)}
          >
            {formatRupiahSingkat(overview?.ringkasanKasHariIni.kompensasiNonTunaiHariIni || 0)}
          </div>
          <div className="text-xs text-zinc-500 mt-1 truncate">
            Riwayat opname: {overview?.cashOpnameLogs.length || 0} berita acara
          </div>
        </div>
      </div>

      {/* Feedback & Error Messages */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs font-semibold text-rose-700 hover:text-rose-900 cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Segmented Interactive Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-200/70 rounded-xl w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('kliring')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'kliring'
              ? 'bg-white text-zinc-900 shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          <span>01. Kliring &amp; Potong Bon Panen ({overview?.kandidatKliring.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('duplikat')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'duplikat'
              ? 'bg-white text-zinc-900 shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>02. Deteksi &amp; Gabung Nama Kembar ({overview?.pasanganKembar.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('opname')}
          className={`inline-flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeSubTab === 'opname'
              ? 'bg-white text-zinc-900 shadow-2xs'
              : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>03. Cash Opname &amp; Tutup Kasir Sore</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: KLIRING & POTONG BON SILANG MITRA (PANEN VS KASBON)            */}
      {/* ===================================================================== */}
      {activeSubTab === 'kliring' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Candidate Table */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-900">
                  Daftar Mitra dengan Saldo Silang (Titipan &amp; Kasbon)
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Klik nama mitra untuk memotong kasbon langsung dari saldo titipan hasil bumi tanpa memutar kas semu
                </p>
              </div>

              {overview && overview.kandidatKliring.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchKliring}
                  disabled={submittingKliring}
                  className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  Kliring Massal Otomatis ({overview.kandidatKliring.length})
                </button>
              )}
            </div>

            <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchKliring}
                  onChange={(e) => setSearchKliring(e.target.value)}
                  placeholder="Cari nama mitra atau kode..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <label className="inline-flex items-center space-x-2 text-xs text-zinc-700 cursor-pointer select-none whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={showAllMitraSaldo}
                  onChange={(e) => setShowAllMitraSaldo(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span>Tampilkan semua mitra bersaldo</span>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
                  <tr>
                    <th className="py-2.5 px-3.5 font-semibold">Mitra / Petani</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Titipan Panen</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Total Kasbon</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Bisa Dipotong</th>
                    <th className="py-2.5 px-3.5 text-right font-semibold">Posisi Bersih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-zinc-500">
                        Memuat analisis saldo kemitraan...
                      </td>
                    </tr>
                  ) : displayedKliringList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 px-4 text-center text-zinc-500">
                        <div className="font-semibold text-zinc-700">
                          Tidak ada mitra dengan saldo silang aktif
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Seluruh mitra yang memiliki saldo titipan hasil bumi saat ini bersih dari tunggakan kasbon, atau centang &ldquo;Tampilkan semua mitra bersaldo&rdquo;.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedKliringList.map((item) => {
                      const isSelected = item.idMitra === selectedKliringMitraId;
                      const net = item.saldoTitipan - item.totalKasbon;
                      return (
                        <tr
                          key={item.idMitra}
                          onClick={() => setSelectedKliringMitraId(item.idMitra)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/70' : 'hover:bg-zinc-50'
                          }`}
                        >
                          <td className="py-3 px-3.5">
                            <div className="font-semibold text-zinc-900">{item.namaMitra}</div>
                            <div className="text-[11px] text-zinc-500">
                              <span className="font-mono">{item.kodeMitra}</span>
                              <span> · </span>
                              <span>{item.role}</span>
                              {item.jumlahNotaBonAktif > 0 && (
                                <>
                                  <span> · </span>
                                  <span>{item.jumlahNotaBonAktif} nota bon</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono tabular-nums text-amber-800 font-medium">
                            {formatRupiah(item.saldoTitipan)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono tabular-nums text-rose-700 font-medium">
                            {formatRupiah(item.totalKasbon)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-emerald-700">
                            {formatRupiah(item.potensiPotongSilang)}
                          </td>
                          <td className="py-3 px-3.5 text-right font-mono tabular-nums">
                            <span className={net >= 0 ? 'text-emerald-800 font-semibold' : 'text-rose-800 font-semibold'}>
                              {net >= 0 ? '+' : '-'}
                              {formatRupiah(Math.abs(net))}
                            </span>
                            <div className="text-[10px] text-zinc-500">
                              {net > 0 ? 'Hak Mitra' : net < 0 ? 'Sisa Bon' : 'Impas'}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Interactive Settlement Workbench */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h2 className="text-sm font-bold text-zinc-900">Kalkulator &amp; Eksekusi Kliring</h2>
                <p className="text-xs text-zinc-500">Penyelesaian satu pintu Titipan Panen vs Kasbon</p>
              </div>
              {activeKliringCandidate && (
                <button
                  type="button"
                  onClick={() => onOpenStatement(activeKliringCandidate.idMitra)}
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-cyan-700 hover:text-cyan-900 cursor-pointer"
                >
                  <span>Rekening Koran</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {!activeKliringCandidate ? (
              <div className="py-10 text-center text-xs text-zinc-500">
                Pilih salah satu mitra dari tabel di sebelah kiri untuk mulai menghitung kliring &amp; penyelesaian saldo.
              </div>
            ) : (
              <form onSubmit={handleSubmitKliring} className="space-y-4">
                <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-2 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-xs font-bold text-zinc-900 truncate">
                      {activeKliringCandidate.namaMitra}
                    </span>
                    <span className="text-xs font-mono text-zinc-500 shrink-0">
                      {activeKliringCandidate.kodeMitra} · {activeKliringCandidate.telepon}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-200 text-xs">
                    <div className="min-w-0">
                      <div className="text-zinc-500 truncate">Saldo Titipan Panen</div>
                      <div
                        className="font-mono tabular-nums font-bold text-amber-800 text-sm mt-0.5 truncate whitespace-nowrap"
                        title={formatRupiah(activeKliringCandidate.saldoTitipan)}
                      >
                        {formatRupiahSingkat(activeKliringCandidate.saldoTitipan)}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-zinc-500 truncate">Total Kewajiban Bon</div>
                      <div
                        className="font-mono tabular-nums font-bold text-rose-700 text-sm mt-0.5 truncate whitespace-nowrap"
                        title={formatRupiah(activeKliringCandidate.totalKasbon)}
                      >
                        {formatRupiahSingkat(activeKliringCandidate.totalKasbon)}
                      </div>
                      <div
                        className="text-[11px] text-zinc-500 font-mono tabular-nums truncate whitespace-nowrap"
                        title={`Toko: ${formatRupiah(activeKliringCandidate.kasbonBarang)} · Uang: ${formatRupiah(activeKliringCandidate.kasbonUang)}`}
                      >
                        Toko: {formatRupiahSingkat(activeKliringCandidate.kasbonBarang)} · Uang: {formatRupiahSingkat(activeKliringCandidate.kasbonUang)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 1: Nominal Potong Silang */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-zinc-800">
                      1. Nominal Potong Bon Silang (Non-Tunai)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setNominalPotongInput(String(activeKliringCandidate.potensiPotongSilang))
                      }
                      className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Maks: {formatRupiah(activeKliringCandidate.potensiPotongSilang)}
                    </button>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={activeKliringCandidate.potensiPotongSilang}
                    value={nominalPotongInput}
                    onChange={(e) => setNominalPotongInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums font-bold border border-zinc-300 rounded-lg text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
                  />
                </div>

                {/* Step 2: Penyelesaian Sisa */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-zinc-800">
                    2. Tindakan atas Sisa Saldo Setelah Dipotong
                  </label>
                  <select
                    value={aksiSisa}
                    onChange={(e) => {
                      const nextMode = e.target.value as
                        | 'HANYA_POTONG_SILANG'
                        | 'CAIRKAN_SISA_TITIPAN'
                        | 'TERIMA_PELUNASAN_SISA_BON';
                      setAksiSisa(nextMode);
                      if (nextMode === 'CAIRKAN_SISA_TITIPAN') {
                        setNominalFisikInput(String(postPotongPreview.sisaTitipSetelahPotong));
                      } else if (nextMode === 'TERIMA_PELUNASAN_SISA_BON') {
                        setNominalFisikInput(String(postPotongPreview.sisaBonSetelahPotong));
                      } else {
                        setNominalFisikInput('0');
                      }
                    }}
                    className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 font-medium focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
                  >
                    <option value="HANYA_POTONG_SILANG">
                      Hanya Potong Silang Non-Tunai (Tanpa Uang Keluar/Masuk Kas)
                    </option>
                    {postPotongPreview.sisaTitipSetelahPotong > 0 && (
                      <option value="CAIRKAN_SISA_TITIPAN">
                        Sekalian Cairkan Sisa Hasil Panen ke Mitra ({formatRupiah(postPotongPreview.sisaTitipSetelahPotong)})
                      </option>
                    )}
                    {postPotongPreview.sisaBonSetelahPotong > 0 && (
                      <option value="TERIMA_PELUNASAN_SISA_BON">
                        Sekalian Terima Setoran Pelunasan Sisa Bon ({formatRupiah(postPotongPreview.sisaBonSetelahPotong)})
                      </option>
                    )}
                  </select>

                  {aksiSisa !== 'HANYA_POTONG_SILANG' && (
                    <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                          {aksiSisa === 'CAIRKAN_SISA_TITIPAN'
                            ? 'Nominal Uang Panen Bersih Diserahkan ke Mitra (Rp)'
                            : 'Nominal Uang Setoran Pelunasan Sisa Bon dari Mitra (Rp)'}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={
                            aksiSisa === 'CAIRKAN_SISA_TITIPAN'
                              ? postPotongPreview.sisaTitipSetelahPotong
                              : postPotongPreview.sisaBonSetelahPotong
                          }
                          value={nominalFisikInput}
                          onChange={(e) => setNominalFisikInput(e.target.value)}
                          className="w-full px-3 py-1.5 text-sm font-mono tabular-nums font-bold bg-white border border-zinc-300 rounded-lg text-zinc-900"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                            Metode Kas/Bank
                          </label>
                          <select
                            value={metodeFisik}
                            onChange={(e) => setMetodeFisik(e.target.value as 'TUNAI' | 'TRANSFER')}
                            className="w-full text-xs bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-zinc-900"
                          >
                            <option value="TUNAI">TUNAI (Laci KAS01)</option>
                            <option value="TRANSFER">TRANSFER BANK</option>
                          </select>
                        </div>

                        {metodeFisik === 'TRANSFER' && (
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                              Pilih Rekening Bank
                            </label>
                            <select
                              value={rekeningFisik}
                              onChange={(e) => setRekeningFisik(e.target.value)}
                              className="w-full text-xs bg-white border border-zinc-300 rounded-lg px-2.5 py-1.5 text-zinc-900 font-mono"
                            >
                              {realBankAccounts.map((rek) => (
                                <option key={rek.kode} value={rek.kode}>
                                  {rek.kode} ({formatRupiah(rek.saldoSaatIni)})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/*Catatan*/}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Catatan Bukti Kliring (Opsional)
                  </label>
                  <input
                    type="text"
                    value={keteranganKliring}
                    onChange={(e) => setKeteranganKliring(e.target.value)}
                    placeholder="Contoh: Potong bon pupuk dari timbangan sawit..."
                    className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg text-zinc-800"
                  />
                </div>

                {/* Pratinjau Saldo Akhir */}
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-2 text-xs min-w-0 overflow-hidden">
                  <div className="min-w-0 flex-1">
                    <div className="text-zinc-500 truncate">Sisa Titipan Akhir</div>
                    <div
                      className="font-mono tabular-nums font-bold text-zinc-900 mt-0.5 truncate whitespace-nowrap"
                      title={formatRupiah(postPotongPreview.sisaTitipAkhir)}
                    >
                      {formatRupiahSingkat(postPotongPreview.sisaTitipAkhir)}
                    </div>
                  </div>
                  <ArrowLeftRight className="w-4 h-4 text-zinc-400 shrink-0" />
                  <div className="text-right min-w-0 flex-1">
                    <div className="text-zinc-500 truncate">Sisa Kasbon Akhir</div>
                    <div
                      className="font-mono tabular-nums font-bold text-zinc-900 mt-0.5 truncate whitespace-nowrap"
                      title={formatRupiah(postPotongPreview.sisaBonAkhir)}
                    >
                      {formatRupiahSingkat(postPotongPreview.sisaBonAkhir)}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={
                    submittingKliring ||
                    (parsedPotongSilang <= 0 &&
                      (aksiSisa === 'HANYA_POTONG_SILANG' || parsedNominalFisik <= 0))
                  }
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingKliring ? 'Memproses Kliring...' : 'Proses Kliring & Simpan Buku Besar'}
                </button>
              </form>
            )}

            {/* Last Kliring PDF Download Card */}
            {lastKliringResult && (
              <div className="pt-3 border-t border-zinc-200 flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-700">
                  <div className="font-bold text-zinc-900">
                    Bukti #{lastKliringResult.idReferensiKliring} ({lastKliringResult.namaMitra})
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {lastKliringResult.alokasiBonLunas.length} nota kasbon otomatis diperbarui
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => exportBuktiKliringToPdf(lastKliringResult, profil)}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Unduh Bukti PDF</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DETEKTOR & PENGGABUNG AKUN MITRA KEMBAR                        */}
      {/* ===================================================================== */}
      {activeSubTab === 'duplikat' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Auto-detected phonetically similar accounts */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-4 border-b border-zinc-200">
              <h2 className="text-sm font-bold text-zinc-900">
                Hasil Pemindaian Otomatis Kemiripan Nama &amp; Nomor Telepon Mitra
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Mendeteksi ejaan fonetik rawan ganda (seperti &ldquo;Wiwid&rdquo; vs &ldquo;Wiwit&rdquo;, &ldquo;Pak Slamet&rdquo; vs &ldquo;Slamed&rdquo;) agar piutang bon dan titipan panen tidak terpisah di dua akun berbeda
              </p>
            </div>

            <div className="divide-y divide-zinc-200">
              {!overview || overview.pasanganKembar.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <div className="text-xs font-semibold text-zinc-800">
                    Database Mitra Bersih — Tidak Ditemukan Indikasi Nama Kembar
                  </div>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                    Seluruh nama dan nomor telepon pada Master Mitra saat ini unik. Jika Anda ingin menggabungkan dua akun secara manual, gunakan panel konsolidasi di sebelah kanan.
                  </p>
                </div>
              ) : (
                overview.pasanganKembar.map((pair) => (
                  <div key={pair.pairKey} className="p-4 space-y-3 hover:bg-zinc-50/70 transition-colors">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="text-zinc-600">
                        <span className="font-mono font-bold text-zinc-900">
                          Kemiripan {pair.similarityScore}%
                        </span>
                        <span> · </span>
                        <span>{pair.alasanKemiripan}</span>
                      </div>
                      {pair.risikoSilang && (
                        <span className="text-xs font-bold text-rose-700">
                          Risiko Tinggi: Saldo Titipan &amp; Bon Terpecah
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg border border-zinc-200 bg-white space-y-1 min-w-0 overflow-hidden">
                        <div className="text-xs font-bold text-zinc-900 truncate">
                          {pair.mitraA.nama}{' '}
                          <span className="font-mono font-normal text-zinc-500">({pair.mitraA.kode})</span>
                        </div>
                        <div
                          className="text-[11px] text-zinc-500 font-mono tabular-nums truncate whitespace-nowrap"
                          title={`Titip: ${formatRupiah(pair.mitraA.totalHutangTitipPanen)} · Bon: ${formatRupiah(pair.mitraA.totalBonMitra)}`}
                        >
                          Titip: {formatRupiahSingkat(pair.mitraA.totalHutangTitipPanen)} · Bon:{' '}
                          {formatRupiahSingkat(pair.mitraA.totalBonMitra)}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPrimaryMitraId(pair.mitraA.id);
                            setDuplicateMitraId(pair.mitraB.id);
                            setAlasanMerge(pair.alasanKemiripan);
                          }}
                          className="mt-1.5 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                        >
                          Jadikan Akun Utama &rarr;
                        </button>
                      </div>

                      <div className="p-3 rounded-lg border border-zinc-200 bg-white space-y-1 min-w-0 overflow-hidden">
                        <div className="text-xs font-bold text-zinc-900 truncate">
                          {pair.mitraB.nama}{' '}
                          <span className="font-mono font-normal text-zinc-500">({pair.mitraB.kode})</span>
                        </div>
                        <div
                          className="text-[11px] text-zinc-500 font-mono tabular-nums truncate whitespace-nowrap"
                          title={`Titip: ${formatRupiah(pair.mitraB.totalHutangTitipPanen)} · Bon: ${formatRupiah(pair.mitraB.totalBonMitra)}`}
                        >
                          Titip: {formatRupiahSingkat(pair.mitraB.totalHutangTitipPanen)} · Bon:{' '}
                          {formatRupiahSingkat(pair.mitraB.totalBonMitra)}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPrimaryMitraId(pair.mitraB.id);
                            setDuplicateMitraId(pair.mitraA.id);
                            setAlasanMerge(pair.alasanKemiripan);
                          }}
                          className="mt-1.5 text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
                        >
                          Jadikan Akun Utama &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Manual / Confirmed Consolidation Form */}
          <div className="lg:col-span-5 bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
            <div className="border-b border-zinc-200 pb-3">
              <h2 className="text-sm font-bold text-zinc-900">Konsolidasi &amp; Penggabungan Akun Mitra</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Menyatukan seluruh riwayat penjualan, kasbon, bayar bon, dan titipan panen ke satu akun resmi
              </p>
            </div>

            <form onSubmit={handleSubmitMerge} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-800 mb-1">
                  1. Akun Mitra Utama (Dipertahankan)
                </label>
                <select
                  value={primaryMitraId}
                  onChange={(e) => setPrimaryMitraId(e.target.value)}
                  className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900"
                >
                  <option value="">-- Pilih Akun Mitra Resmi --</option>
                  {mitraList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.kode} · {m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-800 mb-1">
                  2. Akun Mitra Duplikat (Akan Digabung &amp; Dihapus)
                </label>
                <select
                  value={duplicateMitraId}
                  onChange={(e) => setDuplicateMitraId(e.target.value)}
                  className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900"
                >
                  <option value="">-- Pilih Akun Duplikat --</option>
                  {mitraList
                    .filter((m) => m.id !== primaryMitraId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nama} ({m.kode} · {m.role})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Catatan Audit Penggabungan
                </label>
                <input
                  type="text"
                  value={alasanMerge}
                  onChange={(e) => setAlasanMerge(e.target.value)}
                  placeholder="Contoh: Orang yang sama salah ketik huruf akhir..."
                  className="w-full text-xs border border-zinc-300 rounded-lg px-3 py-2 text-zinc-800"
                />
              </div>

              <label className="flex items-start space-x-2 text-xs text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmMergeChecked}
                  onChange={(e) => setConfirmMergeChecked(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <span>
                  Saya telah memastikan kedua akun adalah orang/pihak yang sama dan menyetujui pemindahan seluruh riwayat transaksi ke akun utama.
                </span>
              </label>

              <button
                type="submit"
                disabled={submittingMerge || !primaryMitraId || !duplicateMitraId || !confirmMergeChecked}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {submittingMerge ? 'Menggabungkan Data...' : 'Gabungkan Kedua Akun Mitra'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: CASH OPNAME & TUTUP BUKU KASIR SORE (PECAHAN RUPIAH)           */}
      {/* ===================================================================== */}
      {activeSubTab === 'opname' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Denomination Counter */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">
                    Kalkulator Hitung Pecahan Uang Tunai Laci (KAS01)
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Masukkan jumlah lembar kertas &amp; keping logam aktual saat penutupan kasir sore
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPecahanCounts({})}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  Kosongkan Hitungan
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Pecahan Rupiah</th>
                      <th className="py-2.5 px-4 font-semibold">Jenis</th>
                      <th className="py-2.5 px-4 font-semibold w-40">Jumlah Lembar / Keping</th>
                      <th className="py-2.5 px-4 text-right font-semibold">Subtotal Fisik</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {PECAHAN_RUPIAH.map((p) => {
                      const rawVal = pecahanCounts[String(p.nominal)] ?? '';
                      const qty = Math.max(0, Math.floor(Number(rawVal) || 0));
                      const sub = p.nominal * qty;
                      return (
                        <tr key={p.nominal} className="hover:bg-zinc-50/70">
                          <td className="py-2 px-4 font-mono tabular-nums font-bold text-zinc-900">
                            {p.label}
                          </td>
                          <td className="py-2 px-4 text-zinc-500">{p.jenis}</td>
                          <td className="py-2 px-4">
                            <input
                              type="number"
                              min={0}
                              placeholder="0"
                              value={rawVal}
                              onChange={(e) =>
                                setPecahanCounts((prev) => ({
                                  ...prev,
                                  [String(p.nominal)]: e.target.value,
                                }))
                              }
                              className="w-full px-2.5 py-1 text-right font-mono tabular-nums font-semibold bg-white border border-zinc-300 rounded-md text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
                            />
                          </td>
                          <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-zinc-900">
                            {formatRupiah(sub)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-zinc-50 border-t border-zinc-200">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 font-bold text-zinc-900">
                        TOTAL UANG FISIK DIHITUNG DI LACI
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-sm font-bold text-emerald-700">
                        {formatRupiah(totalFisikHitung)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Right: Reconciliation Verification & Save */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
              <div className="border-b border-zinc-200 pb-3">
                <h2 className="text-sm font-bold text-zinc-900">Rekonsiliasi Fisik vs Buku Sistem</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Bandingkan hasil hitung fisik brankas/laci dengan saldo tercatat rekening KAS01
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Saldo Buku Sistem (KAS01)</span>
                  <span className="font-mono tabular-nums font-bold text-zinc-900">
                    {formatRupiah(saldoSistemKas01)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Total Uang Tunai Fisik Dihitung</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-700">
                    {formatRupiah(totalFisikHitung)}
                  </span>
                </div>
                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between">
                  <span className="font-bold text-zinc-900">Selisih Rekonsiliasi</span>
                  <span
                    className={`font-mono tabular-nums text-sm font-bold ${
                      selisihOpname === 0
                        ? 'text-emerald-700'
                        : selisihOpname > 0
                        ? 'text-blue-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {selisihOpname === 0
                      ? 'Rp 0 (KLOP / COCOK)'
                      : `${selisihOpname > 0 ? '+' : '-'}${formatRupiah(Math.abs(selisihOpname))} (${
                          selisihOpname > 0 ? 'LEBIH' : 'KURANG'
                        })`}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmitCashOpname} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800 mb-1">
                    Nama Petugas Kasir Pemeriksa
                  </label>
                  <input
                    type="text"
                    required
                    value={petugasKasir}
                    onChange={(e) => setPetugasKasir(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg text-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-800 mb-1">
                    Catatan Penutupan Kasir / Penjelasan Selisih
                  </label>
                  <input
                    type="text"
                    value={catatanOpname}
                    onChange={(e) => setCatatanOpname(e.target.value)}
                    placeholder="Contoh: Kasir shift sore klop sesuai mutasi harian..."
                    className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg text-zinc-900"
                  />
                </div>

                {selisihOpname !== 0 && (
                  <label className="flex items-start space-x-2 text-xs text-zinc-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sesuaikanSaldoSistem}
                      onChange={(e) => setSesuaikanSaldoSistem(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                    />
                    <span>
                      Sesuaikan langsung saldo sistem <span className="font-mono font-bold">KAS01</span> menjadi{' '}
                      <span className="font-mono font-bold">{formatRupiah(totalFisikHitung)}</span> (tercatat di Audit Log)
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={submittingOpname}
                  className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingOpname ? 'Menyimpan Berita Acara...' : 'Simpan Berita Acara Cash Opname'}
                </button>
              </form>

              {lastOpnameResult && (
                <div className="pt-3 border-t border-zinc-200 flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="font-bold text-zinc-900">Berita Acara #{lastOpnameResult.id}</div>
                    <div className="text-zinc-500">
                      {lastOpnameResult.tanggal} {lastOpnameResult.jam} WIB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => exportBeritaAcaraOpnameToPdf(lastOpnameResult, profil)}
                    className="inline-flex items-center space-x-1.5 px-3 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Unduh Berita Acara PDF</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Historical Cash Opname Table */}
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="p-4 border-b border-zinc-200">
              <h3 className="text-sm font-bold text-zinc-900">Riwayat Berita Acara Cash Opname</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-zinc-50 text-zinc-600 border-b border-zinc-200">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">No. Berita Acara</th>
                    <th className="py-2.5 px-4 font-semibold">Waktu (WIB)</th>
                    <th className="py-2.5 px-4 font-semibold">Petugas</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Saldo Sistem</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Fisik Laci</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Selisih</th>
                    <th className="py-2.5 px-4 text-right font-semibold">Dokumen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {!overview || overview.cashOpnameLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500">
                        Belum ada riwayat berita acara cash opname yang tersimpan.
                      </td>
                    </tr>
                  ) : (
                    overview.cashOpnameLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50">
                        <td className="py-2.5 px-4 font-mono font-bold text-zinc-900">{log.id}</td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-zinc-600">
                          {log.tanggal} · {log.jam}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-zinc-800">{log.petugasKasir}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-700">
                          {formatRupiah(log.saldoSistemSebelum)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-zinc-900">
                          {formatRupiah(log.totalFisikLaci)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                          <span
                            className={
                              log.selisih === 0
                                ? 'text-emerald-700'
                                : log.selisih > 0
                                ? 'text-blue-700'
                                : 'text-rose-700'
                            }
                          >
                            {log.selisih === 0
                              ? 'COCOK (Rp 0)'
                              : `${log.selisih > 0 ? '+' : '-'}${formatRupiah(Math.abs(log.selisih))}`}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => exportBeritaAcaraOpnameToPdf(log, profil)}
                            className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
