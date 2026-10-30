import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  DollarSign,
  Briefcase,
  Building2,
  Calendar,
  Phone,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  FileText,
  HandCoins,
  Edit,
  History,
  Calculator,
  Printer,
  ChevronRight,
  TrendingDown,
  Layers,
  Sparkles,
  RotateCcw,
  Clock,
  Warehouse,
  Truck,
  Wrench,
  Store,
  Filter,
  Zap,
  ArrowDownToLine,
  ExternalLink,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  CatatanUpahHarian,
  DAFTAR_DIVISI,
  Karyawan,
  NamaDivisi,
  Rekening,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { RekapitulasiPayrollBulananTable } from './RekapitulasiPayrollBulananTable.tsx';
import { InputPayrollHarianDivisiModal } from './InputPayrollHarianDivisiModal.tsx';
import { DetailHarianKaryawanModal } from './DetailHarianKaryawanModal.tsx';
import { SlipGajiModal } from './SlipGajiModal.tsx';
import { ProsesGajiModal } from './ProsesGajiModal.tsx';
import { BatchGajiHarianModal } from './BatchGajiHarianModal.tsx';
import { BayarGajiKaryawanModal } from './BayarGajiKaryawanModal.tsx';
import { FullErpModularDataset } from '../../server/types.ts';

interface MasterKaryawanViewProps {
  rekeningList: Rekening[];
  fullErpData?: FullErpModularDataset;
  initialTab?: 'rekap' | 'bayar-gaji' | 'input-harian' | 'karyawan' | 'riwayat-gaji';
  preselectedKaryawanId?: string;
  onOpenStatement?: (mitraId: string) => void;
  onOpenKasbonUang?: (karyawanMitraId: string) => void;
  onNavigateToDivisi?: () => void;
  onRefreshAll?: () => void;
}

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

export const MasterKaryawanView: React.FC<MasterKaryawanViewProps> = ({
  rekeningList,
  fullErpData,
  initialTab = 'rekap',
  preselectedKaryawanId,
  onOpenStatement,
  onOpenKasbonUang,
  onNavigateToDivisi,
  onRefreshAll,
}) => {
  const [karyawanList, setKaryawanList] = useState<KaryawanWithBon[]>([]);
  const [penggajianHistory, setPenggajianHistory] = useState<TransaksiPenggajian[]>([]);
  const [logHarianList, setLogHarianList] = useState<CatatanUpahHarian[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [successBanner, setSuccessBanner] = useState('');

  // Supabase direct sync state
  const [isSyncingSupabase, setIsSyncingSupabase] = useState(false);
  const [supabaseFeedback, setSupabaseFeedback] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleSyncToSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await api.pushToSupabase();
      setSupabaseFeedback({
        success: true,
        message: `Database Karyawan & Payroll berhasil disimpan ke Cloud Supabase (${res.message || `${karyawanList.length} Karyawan`})!`,
      });
      await loadData();
      onRefreshAll?.();
    } catch (err: any) {
      setSupabaseFeedback({
        success: false,
        message: `Gagal sinkronisasi ke Supabase: ${err.message}`,
      });
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handlePullFromSupabase = async () => {
    setIsSyncingSupabase(true);
    setSupabaseFeedback(null);
    try {
      const res = await api.pullFromSupabase();
      await loadData();
      setRefreshTrigger((p) => p + 1);
      onRefreshAll?.();
      setSupabaseFeedback({
        success: true,
        message: `Berhasil menarik data terbaru dari Cloud Supabase! ${res.message || ''}`,
      });
    } catch (err: any) {
      setSupabaseFeedback({
        success: false,
        message: `Gagal menarik data dari Supabase: ${err.message}`,
      });
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  // Active Tab
  const [activeTab, setActiveTab] = useState<'rekap' | 'bayar-gaji' | 'input-harian' | 'karyawan' | 'riwayat-gaji'>(
    initialTab
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Filters for employee profile cards
  const [search, setSearch] = useState('');
  const [filterDivisi, setFilterDivisi] = useState('ALL');
  const [filterKasbon, setFilterKasbon] = useState<'ALL' | 'HANYA_BON' | 'BEBAS_BON'>('ALL');

  // History filters
  const [filterDivisiGaji, setFilterDivisiGaji] = useState<string>('ALL');

  // Interactive Form State in Tab 2: "Input Gaji Manual Fleksibel"
  const todayStr = new Date().toISOString().split('T')[0];
  const [inputKryId, setInputKryId] = useState<string>('');
  const [inputTanggal, setInputTanggal] = useState<string>(todayStr);
  const [inputDivisi, setInputDivisi] = useState<NamaDivisi>('Gudang Wijaya Agro');
  const [inputUpahHarian, setInputUpahHarian] = useState<number>(135000);
  const [inputUangMakan, setInputUangMakan] = useState<number>(0);
  const [inputTugas, setInputTugas] = useState<string>('');
  const [inputItem, setInputItem] = useState<string>('KERJA GUDANG');
  const [inputKuantiti, setInputKuantiti] = useState<number>(1);
  const [inputKet, setInputKet] = useState<'BON' | 'LUNAS'>('BON');
  const [inputCatatanKhusus, setInputCatatanKhusus] = useState<string>('');
  const [inputModeBayar, setInputModeBayar] = useState<'CATAT_HAK_UPAH' | 'LANGSUNG_CAIR'>('CATAT_HAK_UPAH');
  const [inputRekeningSumber, setInputRekeningSumber] = useState<string>('REK-GWA');
  const [inputSubmitting, setInputSubmitting] = useState<boolean>(false);
  const [inputSuccessMsg, setInputSuccessMsg] = useState<string>('');
  const [inputErrorMsg, setInputErrorMsg] = useState<string>('');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKaryawan, setEditingKaryawan] = useState<Karyawan | null>(null);
  const [selectedKaryawanForGaji, setSelectedKaryawanForGaji] = useState<KaryawanWithBon | null>(null);
  const [selectedDivisiPreset, setSelectedDivisiPreset] = useState<NamaDivisi | undefined>(undefined);
  const [isProsesGajiModalOpen, setIsProsesGajiModalOpen] = useState(false);
  const [isBayarGajiModalOpen, setIsBayarGajiModalOpen] = useState(false);
  const [bayarGajiKaryawanId, setBayarGajiKaryawanId] = useState<string | undefined>(preselectedKaryawanId);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  useEffect(() => {
    if (preselectedKaryawanId) {
      setBayarGajiKaryawanId(preselectedKaryawanId);
    }
  }, [preselectedKaryawanId]);

  const handleOpenBayarGaji = (idKry?: string) => {
    setBayarGajiKaryawanId(idKry);
    setIsBayarGajiModalOpen(true);
  };

  // Modal Input Payroll Harian
  const [isInputPayrollModalOpen, setIsInputPayrollModalOpen] = useState(false);
  const [modalKaryawanId, setModalKaryawanId] = useState<string | undefined>(undefined);
  const [modalDivisi, setModalDivisi] = useState<NamaDivisi | undefined>(undefined);

  // In-app Delete Confirmation state
  const [karyawanToDelete, setKaryawanToDelete] = useState<Karyawan | null>(null);
  const [isDeletingKaryawan, setIsDeletingKaryawan] = useState(false);

  // Detail Modal
  const [detailKaryawanId, setDetailKaryawanId] = useState<string | null>(null);

  // List of registered ERP divisions
  const [availableDivisiList, setAvailableDivisiList] = useState<string[]>(() =>
    DAFTAR_DIVISI.map((d) => d.nama)
  );

  // Form add/edit employee state
  const [formNik, setFormNik] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formJabatan, setFormJabatan] = useState('');
  const [formDivisi, setFormDivisi] = useState<string>('Gudang Wijaya Agro');
  const [formGajiPokok, setFormGajiPokok] = useState<number>(0);
  const [formTunjangan, setFormTunjangan] = useState<number>(0);
  const [formTelepon, setFormTelepon] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formTanggalMasuk, setFormTanggalMasuk] = useState('');
  const [formCatatan, setFormCatatan] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = async (silent = false) => {
    if (!silent && karyawanList.length === 0) setLoading(true);
    try {
      const [kRes, gRes, divRes] = await Promise.all([
        api.getKaryawan(),
        api.getPenggajian(),
        api.getDivisi().catch(() => []),
      ]);
      setKaryawanList(kRes);
      setPenggajianHistory(gRes);

      if (Array.isArray(divRes) && divRes.length > 0) {
        setAvailableDivisiList(divRes.map((d: any) => d.nama));
      }

      if (!inputKryId && kRes.length > 0) {
        const firstActive = kRes.find((k) => k.status === 'AKTIF') || kRes[0];
        setInputKryId(firstActive.id);
        setInputUpahHarian(135000);
        if (firstActive.divisi) {
          setInputDivisi(firstActive.divisi as NamaDivisi);
        } else if (firstActive.departemen) {
          setInputDivisi(firstActive.departemen as NamaDivisi);
        }
      }
    } catch (err) {
      console.error('Error fetching karyawan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(karyawanList.length > 0);
  }, [fullErpData, refreshTrigger]);

  useEffect(() => {
    const onErpUpdated = () => loadData(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  // Update default wage & division whenever selected employee changes in Tab 2
  const handleSelectEmployeeForInput = (id: string) => {
    setInputKryId(id);
    const k = karyawanList.find((item) => item.id === id);
    if (k) {
      if (k.divisi) {
        setInputDivisi(k.divisi as NamaDivisi);
      } else if (k.departemen) {
        setInputDivisi(k.departemen as NamaDivisi);
      }
    }
  };

  // Submit flexible daily wage directly from Tab 2 form
  const handleDirectSubmitDailyWage = async (e: React.FormEvent) => {
    e.preventDefault();
    setInputErrorMsg('');
    setInputSuccessMsg('');

    if (!inputKryId) {
      setInputErrorMsg('Pilih karyawan yang bertugas');
      return;
    }
    if (inputKuantiti > 0 && inputUpahHarian <= 0) {
      setInputErrorMsg('Nominal gaji harian harus lebih dari Rp 0 jika kuantiti > 0');
      return;
    }

    const kryObj = karyawanList.find((k) => k.id === inputKryId);
    if (!kryObj) return;

    const [y, m, d] = inputTanggal.split('-');
    const formattedTanggal = `${d}/${m}/${y}`;
    const dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
    const namaHari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'][dateObj.getDay()];
    const namaBulanSingkat = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'][Number(m) - 1];
    const hariTanggal = `${namaHari} ${d} ${namaBulanSingkat}`;

    const divObj = DAFTAR_DIVISI.find((item) => item.nama === inputDivisi);
    const divisiKode = divObj ? divObj.kodeRekening.replace('REK-', '') : 'GWA';

    setInputSubmitting(true);
    try {
      const res = await api.recordKerjaHarian({
        idKaryawan: inputKryId,
        tanggalKerja: formattedTanggal,
        hariTanggal,
        divisi: inputDivisi,
        divisiKode,
        item: inputItem || inputTugas || 'KERJA GUDANG',
        kuantiti: inputKuantiti,
        harga: inputUpahHarian,
        jumlah: inputKuantiti * inputUpahHarian + inputUangMakan,
        ket: inputKet,
        catatan: inputCatatanKhusus,
        tugasPekerjaan: inputTugas || inputItem || `Tugas operasional divisi ${inputDivisi}`,
        upahHarian: inputUpahHarian,
        uangMakanLembur: inputUangMakan,
        modeBayar: inputModeBayar,
        rekeningSumber: inputModeBayar === 'LANGSUNG_CAIR' ? inputRekeningSumber : undefined,
      });

      setInputSuccessMsg(
        `Berhasil mencatat upah harian ${kryObj.nama} (${inputItem}: ${formatRupiah(inputKuantiti * inputUpahHarian + inputUangMakan)}) untuk divisi ${inputDivisi}!`
      );
      setInputTugas('');
      setInputCatatanKhusus('');
      loadData();
      onRefreshAll?.();

      if (res.slipGaji) {
        setActiveSlip(res.slipGaji);
      }
    } catch (err: any) {
      setInputErrorMsg(err.message || 'Gagal menyimpan upah harian karyawan');
    } finally {
      setInputSubmitting(false);
    }
  };

  // KPIs
  const totalKaryawanAktif = karyawanList.filter((k) => k.status === 'AKTIF').length;
  const totalKasbonSemuaKaryawan = karyawanList.reduce((sum, k) => sum + (k.totalKasbonAktif || 0), 0);
  const jumlahKaryawanBon = karyawanList.filter((k) => (k.totalKasbonAktif || 0) > 0).length;

  const handleOpenAdd = () => {
    setEditingKaryawan(null);
    setFormNik(`KRY-${String(karyawanList.length + 1).padStart(3, '0')}`);
    setFormNama('');
    setFormJabatan('');
    setFormDivisi(availableDivisiList[0] || 'Gudang Wijaya Agro');
    setFormGajiPokok(0);
    setFormTunjangan(0);
    setFormTelepon('');
    setFormAlamat('');
    setFormTanggalMasuk(new Date().toLocaleDateString('id-ID'));
    setFormCatatan('');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (k: Karyawan) => {
    setEditingKaryawan(k);
    setFormNik(k.nik);
    setFormNama(k.nama);
    setFormJabatan(k.jabatan);
    setFormDivisi(k.divisi || k.departemen || availableDivisiList[0] || 'Gudang Wijaya Agro');
    setFormGajiPokok(k.gajiPokok || 0);
    setFormTunjangan(k.tunjanganTetap || 0);
    setFormTelepon(k.telepon || '');
    setFormAlamat(k.alamat || '');
    setFormTanggalMasuk(k.tanggalMasuk || '');
    setFormCatatan(k.catatan || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formNama.trim() || !formJabatan.trim()) {
      setFormError('Nama lengkap dan Jabatan wajib diisi.');
      return;
    }

    setFormSubmitting(true);
    try {
      const namaSaved = formNama.trim();
      const nikSaved = formNik.trim();
      if (editingKaryawan) {
        await api.updateKaryawan(editingKaryawan.id, {
          nama: formNama,
          jabatan: formJabatan,
          divisi: formDivisi,
          departemen: formDivisi,
          gajiPokok: formGajiPokok,
          tunjanganTetap: formTunjangan,
          telepon: formTelepon,
          alamat: formAlamat,
          catatan: formCatatan,
        });
        setSuccessBanner(`Data karyawan "${namaSaved}" berhasil diperbarui dan disinkronkan ke Rekening Mitra.`);
      } else {
        await api.createKaryawan({
          nik: formNik,
          nama: formNama,
          jabatan: formJabatan,
          divisi: formDivisi,
          departemen: formDivisi,
          gajiPokok: formGajiPokok,
          tunjanganTetap: formTunjangan,
          telepon: formTelepon,
          alamat: formAlamat,
          tanggalMasuk: formTanggalMasuk,
          catatan: formCatatan,
        });
        setSuccessBanner(`Karyawan baru "${namaSaved}" (${nikSaved}) berhasil disimpan dan terhubung ke Rekening Mitra.`);
      }
      setTimeout(() => setSuccessBanner(''), 7000);
      setIsModalOpen(false);
      setRefreshTrigger((prev) => prev + 1);
      await loadData();
      onRefreshAll?.();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data karyawan');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeletePermanent = (k: Karyawan) => {
    setKaryawanToDelete(k);
  };

  const handleConfirmDelete = async () => {
    if (!karyawanToDelete) return;
    setIsDeletingKaryawan(true);
    try {
      await api.deleteKaryawanPermanent(karyawanToDelete.id);
      setSuccessBanner(`Karyawan "${karyawanToDelete.nama}" telah dihapus permanen dari database.`);
      setTimeout(() => setSuccessBanner(''), 6000);
      setRefreshTrigger((prev) => prev + 1);
      await loadData();
      onRefreshAll?.();
      setKaryawanToDelete(null);
    } catch (err: any) {
      setSuccessBanner(`Gagal menghapus karyawan: ${err.message}`);
    } finally {
      setIsDeletingKaryawan(false);
    }
  };

  // Filtered employees for Tab 3
  const filteredKaryawan = karyawanList.filter((k) => {
    const kDiv = k.divisi || k.departemen || '';
    const matchSearch =
      k.nama.toLowerCase().includes(search.toLowerCase()) ||
      k.nik.toLowerCase().includes(search.toLowerCase()) ||
      k.jabatan.toLowerCase().includes(search.toLowerCase()) ||
      kDiv.toLowerCase().includes(search.toLowerCase());

    const matchDiv = filterDivisi === 'ALL' || kDiv === filterDivisi;

    let matchBon = true;
    if (filterKasbon === 'HANYA_BON') {
      matchBon = (k.totalKasbonAktif || 0) > 0;
    } else if (filterKasbon === 'BEBAS_BON') {
      matchBon = (k.totalKasbonAktif || 0) === 0;
    }

    return matchSearch && matchDiv && matchBon;
  });

  const uniqueDivisions = Array.from(
    new Set([...availableDivisiList, ...karyawanList.map((k) => k.divisi || k.departemen).filter(Boolean)])
  );

  const getDivisiBadgeColor = (nama?: string) => {
    const d = (nama || '').toLowerCase();
    if (d.includes('gudang')) return 'bg-amber-950/60 text-amber-300 border-amber-800';
    if (d.includes('karya')) return 'bg-blue-950/60 text-blue-300 border-blue-800';
    if (d.includes('trans')) return 'bg-indigo-950/60 text-indigo-300 border-indigo-800';
    if (d.includes('cv')) return 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
    if (d.includes('pt')) return 'bg-purple-950/60 text-purple-300 border-purple-800';
    if (d.includes('okussa')) return 'bg-rose-950/60 text-rose-300 border-rose-800';
    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  return (
    <div className="space-y-6">
      {/* Realtime Database Connection Badge & Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs">
        <div className="flex items-center space-x-2 text-emerald-300">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold">Database Terhubung:</span>
          <span className="text-zinc-300 font-mono">wijaya_agro_erp.json (Server Active)</span>
          <span className="text-zinc-500">•</span>
          <span className="text-emerald-400 font-bold">{karyawanList.length} Karyawan Terdaftar Permanen</span>
        </div>
        <div className="text-[11px] text-zinc-400">
          Data tersimpan real-time ke database & sinkron otomatis ke buku kas pergerakan divisi
        </div>
      </div>

      {successBanner && (
        <div className="p-3.5 bg-emerald-900/80 border border-emerald-500 rounded-xl text-xs text-white flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner('')}
            className="text-emerald-300 hover:text-white text-xs px-2 py-0.5 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-5 rounded-xl border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <Briefcase className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-zinc-100">Manajemen Karyawan &amp; Rekap Payroll</h1>
            <span className="text-xs bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
              MODUL SDM
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Fitur khusus penanganan karyawan PT Wijaya Agro: input gaji harian fleksibel manual (karena upah harian tidak sama setiap hari), rekapitulasi akumulasi bulanan, dan integrasi kasbon berjalan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tombol Tarik Data dari Supabase */}
          <button
            type="button"
            onClick={handlePullFromSupabase}
            disabled={isSyncingSupabase}
            className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-teal-300 rounded-lg text-xs font-bold border border-teal-500/40 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Tarik data karyawan dan payroll terbaru dari Cloud Supabase ke aplikasi"
          >
            <ArrowDownToLine className={`w-4 h-4 ${isSyncingSupabase ? 'animate-bounce text-teal-400' : 'text-teal-400'}`} />
            <span>{isSyncingSupabase ? 'Menarik...' : '⬇️ Tarik dari Supabase'}</span>
          </button>

          {/* Tombol Kirim Data ke Supabase */}
          <button
            type="button"
            onClick={handleSyncToSupabase}
            disabled={isSyncingSupabase}
            className="flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Kirim dan simpan data karyawan ke Cloud Supabase"
          >
            <Zap className={`w-4 h-4 ${isSyncingSupabase ? 'animate-spin text-amber-300' : 'text-amber-300'}`} />
            <span>{isSyncingSupabase ? 'Menyimpan...' : '⚡ Kirim ke Supabase'}</span>
          </button>

          {/* Quick Action: Button Input Upah Harian Fleksibel */}
          <button
            onClick={() => {
              setModalKaryawanId(undefined);
              setModalDivisi('Gudang Wijaya Agro');
              setIsInputPayrollModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Calculator className="w-4 h-4" />
            <span>+ Input Upah Harian</span>
          </button>

          <button
            onClick={() => handleOpenBayarGaji()}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg text-xs font-extrabold shadow-xs transition-colors cursor-pointer"
          >
            <HandCoins className="w-4 h-4" />
            <span>Bayar Gaji Karyawan</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>+ Karyawan Baru</span>
          </button>

          {onNavigateToDivisi && (
            <button
              onClick={onNavigateToDivisi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-800/60 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Cek Saldo Kas 6 Divisi →</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Sinkronisasi Supabase Karyawan */}
      {supabaseFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            supabaseFeedback.success
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/80 border-rose-700 text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {supabaseFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">{supabaseFeedback.message}</span>
          </div>

          <button
            type="button"
            onClick={() => setSupabaseFeedback(null)}
            className="text-zinc-400 hover:text-zinc-200 cursor-pointer text-xs p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Tabs Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-zinc-900/90 p-2 rounded-xl border border-zinc-800">
        <button
          onClick={() => setActiveTab('bayar-gaji')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'bayar-gaji'
              ? 'bg-emerald-500 text-zinc-950 shadow-md'
              : 'text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 hover:bg-emerald-900/50'
          }`}
        >
          <HandCoins className="w-4 h-4" />
          <span>Bayar Gaji Karyawan (1 Bulan Penuh)</span>
        </button>

        <button
          onClick={() => setActiveTab('rekap')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'rekap'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Rekap Gaji &amp; Absensi Bulanan</span>
        </button>

        <button
          onClick={() => setActiveTab('input-harian')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'input-harian'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>Input Upah Harian</span>
        </button>

        <button
          onClick={() => setActiveTab('karyawan')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'karyawan'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Data Karyawan &amp; Mitra ({karyawanList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('riwayat-gaji')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'riwayat-gaji'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <History className="w-4 h-4 text-sky-400" />
          <span>Riwayat Slip Gaji ({penggajianHistory.length})</span>
        </button>
      </div>

      {/* Google Sheets-Style Horizontal Tab Strip (Page per Karyawan) */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-1.5 flex items-center overflow-x-auto shadow-inner space-x-1.5 scrollbar-thin">
        <button
          type="button"
          onClick={() => {
            setEditingKaryawan(null);
            setFormNik(`KRY-${String(karyawanList.length + 1).padStart(3, '0')}`);
            setFormNama('');
            setFormJabatan('');
            setFormDivisi(availableDivisiList[0] || 'Gudang Wijaya Agro');
            setFormTelepon('');
            setFormTanggalMasuk(new Date().toLocaleDateString('id-ID'));
            setFormAlamat('');
            setFormCatatan('');
            setIsModalOpen(true);
          }}
          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 transition-colors shrink-0 cursor-pointer"
          title="Tambah Karyawan Baru"
        >
          <UserPlus className="w-4 h-4 text-emerald-400" />
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('rekap');
            setDetailKaryawanId(null);
          }}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
            activeTab === 'rekap' && !detailKaryawanId
              ? 'bg-blue-600/90 text-white border-blue-400 shadow-sm'
              : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800 hover:bg-zinc-800/80'
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-blue-300" />
          <span>REKAP_TOTAL_KARYAWAN</span>
        </button>

        {karyawanList.map((kry) => {
          const isSelected = detailKaryawanId === kry.id;
          return (
            <button
              key={kry.id}
              type="button"
              onClick={() => {
                setDetailKaryawanId(kry.id);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                isSelected
                  ? 'bg-emerald-600/90 text-white border-emerald-400 shadow-sm'
                  : 'bg-zinc-900 text-zinc-300 hover:text-white border-zinc-800 hover:bg-zinc-800/80'
              }`}
              title={`Buka Halaman Buku & Slip Gaji Mandiri ${kry.nama}`}
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>{kry.nama.toUpperCase()}</span>
            </button>
          );
        })}

        {karyawanList.length === 0 && (
          <span className="text-[11px] text-zinc-400 italic px-2.5 py-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Database Bersih (0 Data Dummy). Klik [+ Karyawan Baru] atau [Tarik dari Spreadsheet] di atas.
          </span>
        )}
      </div>

      {/* TAB: BAYAR GAJI KARYAWAN (1 BULAN PENUH / PENCAIRAN AKUMULASI UPAH) */}
      {activeTab === 'bayar-gaji' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <HandCoins className="w-5 h-5 text-emerald-400" />
                <span>Menu Pencairan Gaji Karyawan (Akumulasi Hari Kerja)</span>
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-3xl">
                Pilih karyawan untuk mencairkan akumulasi upah kerja harian sekaligus potong kasbon secara fleksibel. Gaji dihitung murni per hari kerja yang di-input (hari tanpa input gaji karyawan otomatis dihitung <strong>Tidak Masuk</strong>). Setiap karyawan terhubung langsung ke satu <strong>Rekening Mitra</strong> yang sama.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenBayarGaji()}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-extrabold rounded-xl text-xs flex items-center gap-2 shrink-0 cursor-pointer shadow-md"
            >
              <HandCoins className="w-4 h-4" />
              <span>Buka Form Bayar Gaji</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-800/80 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-700">
                <tr>
                  <th className="py-3 px-3">Karyawan / Mitra</th>
                  <th className="py-3 px-3">Divisi &amp; Jabatan</th>
                  <th className="py-3 px-3 text-right">Upah Kerja Belum Cair</th>
                  <th className="py-3 px-3">Kehadiran Kerja</th>
                  <th className="py-3 px-3 text-right">Gaji Sudah Cair</th>
                  <th className="py-3 px-3 text-right">Kasbon Aktif</th>
                  <th className="py-3 px-3 text-right">Saldo Titip Panen (Mitra)</th>
                  <th className="py-3 px-3 text-right">Aksi Penggajian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {karyawanList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500">
                      Belum ada karyawan terdaftar.
                    </td>
                  </tr>
                ) : (
                  karyawanList.map((k) => {
                    const unpaid = k.totalUpahBelumDibayar || 0;
                    const paid = k.totalGajiSudahDibayar || 0;
                    const titipPanen = k.totalTitipHasilPanen || 0;
                    const mitraId = k.idMitraTerkait || `MTR-${k.id}`;
                    return (
                      <tr key={k.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-zinc-100">{k.nama}</div>
                          <div className="text-[11px] text-zinc-400 font-mono">{k.nik}</div>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="text-zinc-200 font-medium">{k.jabatan}</div>
                          <div className="text-[11px] text-zinc-400">{k.divisi || k.departemen}</div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {unpaid > 0 ? (
                            <div>
                              <span className="font-bold text-amber-300">{formatRupiah(unpaid)}</span>
                              <div className="text-[10px] text-zinc-400 font-sans">
                                {k.totalHariBelumDibayar || 0} hari tercatat
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-500">Rp 0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-zinc-300">
                          <div className="font-mono tabular-nums font-semibold text-cyan-300">
                            {k.totalHariBelumDibayar || 0} hari belum cair
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            Tanpa input harian = Tidak Masuk
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {paid > 0 ? (
                            <span className="text-emerald-400 font-semibold">{formatRupiah(paid)}</span>
                          ) : (
                            <span className="text-zinc-500">Rp 0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {k.totalKasbonAktif > 0 ? (
                            <span className="text-rose-400 font-bold">{formatRupiah(k.totalKasbonAktif)}</span>
                          ) : (
                            <span className="text-zinc-500">Rp 0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                          {titipPanen > 0 ? (
                            <span className="text-amber-300 font-bold">{formatRupiah(titipPanen)}</span>
                          ) : (
                            <span className="text-zinc-500">Rp 0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {onOpenStatement && (
                              <button
                                type="button"
                                onClick={() => onOpenStatement(mitraId)}
                                className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                                title="Buka Rekening Koran Terpadu (Gaji + Titip Panen + Kasbon)"
                              >
                                Rekening Mitra
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenBayarGaji(k.id)}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-lg text-xs cursor-pointer flex items-center gap-1"
                            >
                              <HandCoins className="w-3.5 h-3.5" />
                              <span>Bayar Gaji</span>
                            </button>
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
      )}

      {/* TAB 1: REKAPITULASI PAYROLL BULANAN */}
      {activeTab === 'rekap' && (
        <div className="space-y-4">
          <RekapitulasiPayrollBulananTable
            rekeningList={rekeningList}
            refreshTrigger={refreshTrigger}
            onOpenInputPayrollHarian={(idKry, div) => {
              setModalKaryawanId(idKry);
              setModalDivisi(div);
              setIsInputPayrollModalOpen(true);
            }}
            onOpenBayarGaji={(idKry) => handleOpenBayarGaji(idKry)}
            onOpenStatement={onOpenStatement}
            onOpenKasbonUang={onOpenKasbonUang}
            onOpenDetailKaryawan={(id) => setDetailKaryawanId(id)}
            onRefreshAll={() => {
              loadData();
              setRefreshTrigger((p) => p + 1);
              onRefreshAll?.();
            }}
          />
        </div>
      )}

      {/* TAB 2: INPUT GAJI MANUAL FLEKSIBEL (FORMULIR CEPAT) */}
      {activeTab === 'input-harian' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Form Column (7 cols) */}
          <div className="lg:col-span-7 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div>
                <h2 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                  <Calculator className="w-4 h-4 text-amber-400" />
                  <span>Input Upah Harian Manual &amp; Fleksibel</span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Nominal upah dapat diketik manual bebas sesuai beban kerja/lembur hari ini (tidak harus sama setiap hari).
                </p>
              </div>
              <span className="text-[10px] bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
                FLEXIBLE WAGE
              </span>
            </div>

            {inputSuccessMsg && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-lg text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{inputSuccessMsg}</span>
              </div>
            )}

            {inputErrorMsg && (
              <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{inputErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleDirectSubmitDailyWage} className="space-y-4">
              {/* Employee and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Pilih Karyawan <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={inputKryId}
                    onChange={(e) => handleSelectEmployeeForInput(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500 font-medium"
                  >
                    {karyawanList
                      .filter((k) => k.status === 'AKTIF')
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama} ({k.nik}) — {k.jabatan}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                    Tanggal Kerja <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={inputTanggal}
                    onChange={(e) => setInputTanggal(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Division assignment */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Unit Divisi Penugasan Hari Ini <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DAFTAR_DIVISI.map((div) => {
                    const isSelected = inputDivisi === div.nama;
                    return (
                      <button
                        key={div.id}
                        type="button"
                        onClick={() => {
                          setInputDivisi(div.nama);
                          setInputRekeningSumber(div.kodeRekening);
                        }}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                            : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        <div className="font-semibold text-xs text-zinc-100">{div.nama}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{div.kodeRekening}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Wages & Allowance inputs with quick nominal chips */}
              <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200 flex items-center space-x-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Nominal Gaji Pokok Harian Hari Ini (Manual &amp; Fleksibel)</span>
                  </span>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-zinc-400 font-mono">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="5000"
                    value={inputUpahHarian}
                    onChange={(e) => setInputUpahHarian(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-amber-500/80 rounded-lg pl-9 pr-3 py-2 text-sm text-amber-300 font-mono font-bold focus:outline-hidden focus:border-amber-400"
                  />
                </div>

                {/* Quick nominal chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-zinc-500 mr-1">Pilihan Cepat:</span>
                  {[100000, 120000, 125000, 135000, 140000, 150000, 175000, 200000].map((nom) => (
                    <button
                      key={nom}
                      type="button"
                      onClick={() => setInputUpahHarian(nom)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                        inputUpahHarian === nom
                          ? 'bg-amber-600 text-white font-bold'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {nom / 1000}k
                    </button>
                  ))}
                </div>

                {/* Overtime / Meal Allowance */}
                <div className="pt-2 border-t border-zinc-700 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                      Uang Makan / Lembur / Bonus Hari Ini
                    </label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-mono">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="5000"
                        value={inputUangMakan}
                        onChange={(e) => setInputUangMakan(Number(e.target.value))}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <span className="text-[10px] text-zinc-400">Total Upah Harian:</span>
                    <span className="text-base font-bold text-emerald-400 font-mono">
                      {formatRupiah(inputUpahHarian + inputUangMakan)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Item, Qty, Status Ket (BON/LUNAS), Catatan matching user spreadsheet */}
              <div className="bg-zinc-800/80 p-3.5 rounded-xl border border-amber-800/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-amber-400" />
                    <span>Rincian Pekerjaan &amp; Catatan Gaji Harian</span>
                  </span>
                  <span className="text-[10px] text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                    Input Riil Pekerjaan
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Item / Jenis Pekerjaan:
                  </label>
                  <input
                    type="text"
                    value={inputItem}
                    onChange={(e) => {
                      setInputItem(e.target.value);
                      if (!inputTugas) setInputTugas(e.target.value);
                    }}
                    placeholder="Contoh: KERJA GUDANG, SURJAL, JALAN, DRIVER TRUK, NGEBAL..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-bold focus:outline-hidden focus:border-amber-500 uppercase"
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
                          setInputItem(it);
                          if (!inputTugas) setInputTugas(it);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                          inputItem === it
                            ? 'bg-amber-600 text-white border-amber-500'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        {it}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Kuantiti (Qty):
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={inputKuantiti}
                      onChange={(e) => setInputKuantiti(Number(e.target.value))}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Status Ket:
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setInputKet('BON')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border text-center transition-all ${
                          inputKet === 'BON'
                            ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        BON
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputKet('LUNAS')}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border text-center transition-all ${
                          inputKet === 'LUNAS'
                            ? 'bg-sky-600 text-white border-sky-500 shadow-xs'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        LUNAS
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Catatan Khusus:
                    </label>
                    <input
                      type="text"
                      value={inputCatatanKhusus}
                      onChange={(e) => setInputCatatanKhusus(e.target.value)}
                      placeholder="e.g. MBL ARYA, SAKIT, LIBUR..."
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Task description */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Uraian Tugas / Pekerjaan Hari Ini
                </label>
                <input
                  type="text"
                  value={inputTugas}
                  onChange={(e) => setInputTugas(e.target.value)}
                  placeholder="Contoh: Bongkar muatan 15 ton gabah, jaga kasir toko..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />

                {/* Preset quick buttons */}
                {QUICK_JOB_PRESETS[inputDivisi] && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUICK_JOB_PRESETS[inputDivisi].slice(0, 3).map((job, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setInputTugas(job)}
                        className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700 truncate max-w-[240px]"
                      >
                        + {job}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Execution Mode */}
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <label className="block text-xs font-semibold text-zinc-300">
                  Pilihan Cara Pencatatan:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInputModeBayar('CATAT_HAK_UPAH')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      inputModeBayar === 'CATAT_HAK_UPAH'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                        : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <div className="font-bold text-xs text-zinc-100">1. Akumulasi Buku Gaji</div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                      Catat hak upah berjalan, dicairkan akhir bulan / tgl 1 settlement
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInputModeBayar('LANGSUNG_CAIR')}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      inputModeBayar === 'LANGSUNG_CAIR'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200'
                        : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    <div className="font-bold text-xs text-zinc-100">2. Bayar Langsung Hari Ini</div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                      Cairkan tunai hari ini dari kas operasional divisi terkait
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={inputSubmitting}
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {inputSubmitting
                    ? 'Menyimpan...'
                    : `Simpan Upah Harian (${formatRupiah(inputUpahHarian + inputUangMakan)})`}
                </span>
              </button>
            </form>
          </div>

          {/* Right Info Column (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Selected Employee Summary Card */}
            {(() => {
              const activeKry = karyawanList.find((k) => k.id === inputKryId);
              if (!activeKry) return null;
              return (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 min-w-0 overflow-hidden">
                  <div className="flex items-center space-x-3 pb-3 border-b border-zinc-800 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-amber-950 text-amber-300 border border-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                      {activeKry.nama.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-zinc-100 text-sm truncate">{activeKry.nama}</h3>
                      <div className="text-[11px] text-zinc-400 truncate">
                        {activeKry.nik} • {activeKry.jabatan}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs min-w-0">
                    <div className="flex justify-between items-center gap-2 min-w-0">
                      <span className="text-zinc-400 shrink-0">Divisi Unit:</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold truncate ${getDivisiBadgeColor(activeKry.divisi || activeKry.departemen)}`}>
                        {activeKry.divisi || activeKry.departemen}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 min-w-0">
                      <span className="text-zinc-400 shrink-0">Sistem Upah:</span>
                      <span className="text-zinc-200 font-medium truncate whitespace-nowrap">
                        Per Hari Kerja (Tanpa Input = Tidak Masuk)
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 min-w-0">
                      <span className="text-zinc-400 shrink-0">Kasbon Uang Berjalan:</span>
                      <span
                        className="font-mono tabular-nums text-rose-400 font-semibold truncate whitespace-nowrap"
                        title={formatRupiah(activeKry.kasbonUang || 0)}
                      >
                        {formatRupiahSingkat(activeKry.kasbonUang || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 min-w-0">
                      <span className="text-zinc-400 shrink-0">Kasbon Barang Toko:</span>
                      <span
                        className="font-mono tabular-nums text-rose-400 font-semibold truncate whitespace-nowrap"
                        title={formatRupiah(activeKry.kasbonBarang || 0)}
                      >
                        {formatRupiahSingkat(activeKry.kasbonBarang || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 pt-2 border-t border-zinc-800 font-bold min-w-0">
                      <span className="text-zinc-300 shrink-0">Total Kasbon Aktif:</span>
                      <span
                        className="font-mono tabular-nums text-rose-400 truncate whitespace-nowrap"
                        title={formatRupiah(activeKry.totalKasbonAktif || 0)}
                      >
                        {formatRupiahSingkat(activeKry.totalKasbonAktif || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setDetailKaryawanId(activeKry.id)}
                      className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">Buka Riwayat Rincian Kerja {activeKry.nama}</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Division Cash Balance Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3 min-w-0 overflow-hidden">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2 min-w-0">
                <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">Saldo Kas Divisi Terkait ({inputDivisi})</span>
              </h3>
              {(() => {
                const divRekKode = DAFTAR_DIVISI.find((d) => d.nama === inputDivisi)?.kodeRekening;
                const rek = rekeningList.find((r) => r.kode === divRekKode);
                return (
                  <div className="space-y-2 min-w-0">
                    <div className="flex justify-between items-center gap-2 text-xs min-w-0">
                      <span className="text-zinc-400 shrink-0">Buku Rekening:</span>
                      <span className="font-mono text-zinc-200 truncate">{rek?.nama || divRekKode}</span>
                    </div>
                    <div className="flex justify-between items-center gap-2 text-xs min-w-0">
                      <span className="text-zinc-400 shrink-0">Saldo Operasional:</span>
                      <span
                        className="text-base font-bold text-emerald-400 font-mono tabular-nums truncate whitespace-nowrap"
                        title={formatRupiah(rek?.saldoSaatIni || 0)}
                      >
                        {formatRupiahSingkat(rek?.saldoSaatIni || 0)}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DATA & PROFIL KARYAWAN */}
      {activeTab === 'karyawan' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Cari NIK, nama, jabatan, divisi..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <select
                value={filterDivisi}
                onChange={(e) => setFilterDivisi(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-hidden focus:border-emerald-500 font-medium"
              >
                <option value="ALL">Semua Divisi ({uniqueDivisions.length})</option>
                {uniqueDivisions.map((div) => (
                  <option key={div} value={div}>
                    {div}
                  </option>
                ))}
              </select>

              <select
                value={filterKasbon}
                onChange={(e) => setFilterKasbon(e.target.value as any)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-hidden focus:border-emerald-500"
              >
                <option value="ALL">Semua Status Bon</option>
                <option value="HANYA_BON">Hanya Yang Punya Kasbon</option>
                <option value="BEBAS_BON">Bebas Kasbon (Rp 0)</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleOpenAdd}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Karyawan Baru</span>
              </button>
            </div>
          </div>

          {/* Employee Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-800/80 text-zinc-400 border-b border-zinc-700 font-semibold">
                    <th className="py-3 px-4">KARYAWAN</th>
                    <th className="py-3 px-4">JABATAN &amp; DIVISI</th>
                    <th className="py-3 px-4">SISTEM UPAH</th>
                    <th className="py-3 px-4">STATUS KASBON</th>
                    <th className="py-3 px-4">KONTAK &amp; ALAMAT</th>
                    <th className="py-3 px-4 text-center">STATUS</th>
                    <th className="py-3 px-4 text-right">AKSI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 font-mono">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-500 font-sans">
                        Memuat data karyawan...
                      </td>
                    </tr>
                  ) : filteredKaryawan.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-zinc-400 font-sans">
                        <div className="max-w-md mx-auto space-y-3">
                          <div className="w-12 h-12 bg-amber-950/60 text-amber-400 rounded-full flex items-center justify-center mx-auto border border-amber-800">
                            <Briefcase className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-zinc-100">
                              {karyawanList.length === 0
                                ? 'Database Karyawan Bersih (Siap Input Real Data)'
                                : 'Tidak ada data karyawan yang sesuai filter'}
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">
                              {karyawanList.length === 0
                                ? 'Data karyawan telah dikosongkan. Silakan masukkan data tenaga kerja, staf divisi, dan supir armada Anda.'
                                : 'Coba ubah kata kunci pencarian atau reset filter divisi.'}
                            </p>
                          </div>
                          {karyawanList.length === 0 && (
                            <button
                              type="button"
                              onClick={handleOpenAdd}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
                            >
                              <UserPlus className="w-4 h-4" />
                              <span>+ Tambah Karyawan Pertama</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredKaryawan.map((k) => {
                      const hasBon = (k.totalKasbonAktif || 0) > 0;
                      const linkedMitraId = k.idMitraTerkait || `MTR-${k.id}`;
                      const empDivisi = k.divisi || k.departemen || 'Gudang Wijaya Agro';

                      return (
                        <tr key={k.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-amber-950 text-amber-300 border border-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                                {k.nama.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-zinc-100">{k.nama}</div>
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                  <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                                    {k.nik}
                                  </span>
                                  <span
                                    className="text-[9px] text-indigo-300 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-700/60 font-sans"
                                    title="Tersinkron otomatis ke Database Mitra untuk kasbon & transaksi kasir"
                                  >
                                    ⚡ Mitra Kasbon Terhubung
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-sans">
                            <div className="font-medium text-zinc-200">{k.jabatan}</div>
                            <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border mt-1 font-semibold ${getDivisiBadgeColor(empDivisi)}`}>
                              {empDivisi}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 font-sans">
                            <div className="space-y-1 text-xs">
                              {(k.totalUpahBelumDibayar || 0) > 0 && (
                                <div className="text-amber-300 font-mono tabular-nums font-bold">
                                  Upah Belum Cair: {formatRupiah(k.totalUpahBelumDibayar || 0)}
                                </div>
                              )}
                              {(k.totalGajiSudahDibayar || 0) > 0 && (
                                <div className="text-emerald-400 font-mono tabular-nums">
                                  Gaji Cair: {formatRupiah(k.totalGajiSudahDibayar || 0)}
                                </div>
                              )}
                              {(k.totalTitipHasilPanen || 0) > 0 && (
                                <div className="text-amber-200 font-mono tabular-nums">
                                  Titip Panen Mitra: {formatRupiah(k.totalTitipHasilPanen || 0)}
                                </div>
                              )}
                              {(k.totalUpahBelumDibayar || 0) === 0 &&
                                (k.totalGajiSudahDibayar || 0) === 0 &&
                                (k.totalTitipHasilPanen || 0) === 0 && (
                                  <span className="text-zinc-400 text-[11px]">
                                    Input per Hari Kerja (Tanpa Input = Tidak Masuk)
                                  </span>
                                )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-sans">
                            {hasBon ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-950 text-rose-300 font-mono font-bold rounded border border-rose-800 text-[11px]">
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                  <span>{formatRupiah(k.totalKasbonAktif)}</span>
                                </span>
                                <div className="text-[10px] text-zinc-400 font-mono">
                                  Uang: {formatRupiah(k.kasbonUang)} | Brg: {formatRupiah(k.kasbonBarang)}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-950/60 text-emerald-400 rounded border border-emerald-800/60 text-[10px] font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Bebas Kasbon</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-zinc-300 font-sans">
                            <div className="flex items-center space-x-1">
                              <Phone className="w-3 h-3 text-zinc-500" />
                              <span>{k.telepon || '-'}</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate max-w-[180px]">
                              {k.alamat || '-'}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-center font-sans">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                                k.status === 'AKTIF'
                                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              }`}
                            >
                              {k.status}
                            </span>
                          </td>

                          <td className="py-3.5 px-4 text-right font-sans">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Bayar Gaji Bulanan / Cairkan Upah */}
                              <button
                                onClick={() => handleOpenBayarGaji(k.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                                title="Bayar Gaji Karyawan (1 Bulan Penuh / Cairkan Upah)"
                              >
                                <HandCoins className="w-3.5 h-3.5" />
                                <span>Bayar Gaji</span>
                              </button>

                              {/* Quick daily wage input */}
                              <button
                                onClick={() => {
                                  setModalKaryawanId(k.id);
                                  setIsInputPayrollModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                                title="Input Upah Harian untuk Karyawan Ini"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                                <span>+ Upah</span>
                              </button>

                              {/* Detail logs */}
                              <button
                                onClick={() => setDetailKaryawanId(k.id)}
                                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-sky-400 rounded border border-zinc-700 transition-colors cursor-pointer"
                                title="Lihat Rekening Buku & Detail Log Kerja"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit Profile */}
                              <button
                                onClick={() => handleOpenEdit(k)}
                                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                                title="Edit Data Karyawan"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {/* Hapus Permanen */}
                              <button
                                onClick={() => handleDeletePermanent(k)}
                                className="p-1.5 bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 rounded border border-zinc-700 hover:border-rose-800 transition-colors cursor-pointer"
                                title="Hapus Karyawan dari Database"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
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
        </div>
      )}

      {/* TAB 4: RIWAYAT SLIP PENGGAJIAN */}
      {activeTab === 'riwayat-gaji' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden space-y-4 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                <History className="w-4 h-4 text-sky-400" />
                <span>Riwayat Slip Penggajian Resmi &amp; Pencairan</span>
              </h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Daftar pembayaran upah harian &amp; bulanan yang telah dicairkan dari kas operasional divisi.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-zinc-400">Filter Divisi:</span>
              <select
                value={filterDivisiGaji}
                onChange={(e) => setFilterDivisiGaji(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
              >
                <option value="ALL">Semua Divisi</option>
                {DAFTAR_DIVISI.map((d) => (
                  <option key={d.id} value={d.nama}>
                    {d.nama}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-800/80 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-700">
                <tr>
                  <th className="py-2.5 px-3">No. Slip</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Karyawan</th>
                  <th className="py-2.5 px-3">Divisi Pembayar</th>
                  <th className="py-2.5 px-3">Tipe</th>
                  <th className="py-2.5 px-3 text-right">Gaji Kotor</th>
                  <th className="py-2.5 px-3 text-right">Potongan Bon</th>
                  <th className="py-2.5 px-3 text-right">Bersih Diterima</th>
                  <th className="py-2.5 px-3 text-center">Cetak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 font-mono">
                {penggajianHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-zinc-500 font-sans">
                      Belum ada slip penggajian yang dicairkan.
                    </td>
                  </tr>
                ) : (
                  penggajianHistory
                    .filter((g) => filterDivisiGaji === 'ALL' || g.divisi === filterDivisiGaji)
                    .map((g) => (
                      <tr key={g.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-zinc-200">{g.slipNomor}</td>
                        <td className="py-2.5 px-3 font-sans text-zinc-400">
                          {g.tanggal} <span className="text-[10px] text-zinc-500">{g.jam}</span>
                        </td>
                        <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                          {g.namaKaryawan}
                        </td>
                        <td className="py-2.5 px-3 font-sans text-zinc-300">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-zinc-700">
                            {g.divisi}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-sans">
                          <span className="text-[10px] bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded font-bold">
                            {g.tipeGaji}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-zinc-300">
                          {formatRupiah(g.totalGajiKotor)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-rose-400">
                          -{formatRupiah(g.potonganKasbon)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {formatRupiah(g.gajiBersihDibayar)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans">
                          <button
                            onClick={() => setActiveSlip(g)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-medium transition-colors flex items-center justify-center space-x-1 mx-auto"
                          >
                            <Printer className="w-3 h-3 text-emerald-400" />
                            <span>Slip</span>
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Input Payroll Harian Divisi */}
      {isInputPayrollModalOpen && (
        <InputPayrollHarianDivisiModal
          karyawanList={karyawanList}
          initialKaryawanId={modalKaryawanId}
          initialDivisi={modalDivisi || 'Gudang Wijaya Agro'}
          rekeningList={rekeningList}
          onClose={() => setIsInputPayrollModalOpen(false)}
          onSuccess={(slip) => {
            setIsInputPayrollModalOpen(false);
            loadData();
            onRefreshAll?.();
            if (slip) {
              setActiveSlip(slip);
            }
          }}
        />
      )}

      {/* Modal: Detail Log Harian Karyawan */}
      {detailKaryawanId && (
        <DetailHarianKaryawanModal
          idKaryawan={detailKaryawanId}
          rekeningList={rekeningList}
          onClose={() => setDetailKaryawanId(null)}
          onOpenInputKerja={(kId) => {
            setDetailKaryawanId(null);
            setModalKaryawanId(kId);
            setIsInputPayrollModalOpen(true);
          }}
          onRefreshAll={() => {
            loadData();
            onRefreshAll?.();
          }}
        />
      )}

      {/* Modal: Add / Edit Karyawan */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>{editingKaryawan ? 'Edit Data Karyawan' : 'Tambah Karyawan Baru'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">NIK Karyawan</label>
                  <input
                    type="text"
                    value={formNik}
                    onChange={(e) => setFormNik(e.target.value)}
                    required
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    required
                    placeholder="Nama Karyawan"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Jabatan / Posisi Kerja <span className="text-rose-400">*</span></label>
                  <input
                    type="text"
                    value={formJabatan}
                    onChange={(e) => setFormJabatan(e.target.value)}
                    required
                    placeholder="Contoh: Staff Gudang, Supir, Kasir"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Divisi (Unit ERP Wijaya Agro) <span className="text-rose-400">*</span></label>
                  <select
                    value={formDivisi}
                    onChange={(e) => setFormDivisi(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 font-semibold"
                  >
                    {availableDivisiList.map((div) => (
                      <option key={div} value={div}>
                        {div}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">No. Telepon / WhatsApp</label>
                  <input
                    type="text"
                    value={formTelepon}
                    onChange={(e) => setFormTelepon(e.target.value)}
                    placeholder="0812..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Tanggal Mulai Masuk</label>
                  <input
                    type="text"
                    value={formTanggalMasuk}
                    onChange={(e) => setFormTanggalMasuk(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Alamat Tempat Tinggal</label>
                <input
                  type="text"
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  placeholder="Desa / Kecamatan..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
                />
              </div>

              <div className="p-2.5 bg-zinc-800/80 rounded-lg border border-zinc-700 text-[11px] text-zinc-300">
                <strong>Sistem Gaji Harian Murni:</strong> Tidak menggunakan standar gaji bulanan tetap. Gaji karyawan dihitung berdasarkan input gaji per hari kerja; hari tanpa input gaji otomatis terhitung <strong>Tidak Masuk</strong>.
              </div>

              <div className="p-2.5 bg-indigo-950/60 rounded-lg border border-indigo-700/60 text-[11px] text-indigo-200 flex items-start space-x-2">
                <span>
                  <strong>Satu Akun Terpadu (Karyawan = Mitra):</strong> Jika nama karyawan sama dengan Mitra Tani yang sudah ada, sistem otomatis menyatukannya ke satu Rekening Mitra terpadu (merekap Gaji, Kasbon, sekaligus Titip Hasil Panen).
                </span>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 rounded text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded text-xs shadow-xs"
                >
                  {formSubmitting ? 'Menyimpan...' : 'Simpan Karyawan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bayar Gaji Karyawan (1 Bulan Penuh / Akumulasi Upah) */}
      {isBayarGajiModalOpen && (
        <BayarGajiKaryawanModal
          initialKaryawanId={bayarGajiKaryawanId}
          allKaryawan={karyawanList}
          rekeningList={rekeningList}
          onClose={() => setIsBayarGajiModalOpen(false)}
          onNavigateToRekeningMitra={onOpenStatement}
          onSuccess={(slip) => {
            setIsBayarGajiModalOpen(false);
            setSuccessBanner(
              `Pembayaran gaji ${slip.namaKaryawan} sebesar ${formatRupiah(slip.gajiBersihDibayar)} berhasil dicairkan & tercatat di Rekening Mitra.`
            );
            setTimeout(() => setSuccessBanner(''), 7000);
            loadData();
            setRefreshTrigger((p) => p + 1);
            onRefreshAll?.();
            setActiveSlip(slip);
          }}
        />
      )}

      {/* Modal: Slip Gaji */}
      {activeSlip && (
        <SlipGajiModal slip={activeSlip} onClose={() => setActiveSlip(null)} />
      )}

      {/* Confirmation Modal for Permanent Employee Delete */}
      {karyawanToDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-zinc-100">
                Hapus Permanen Karyawan?
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Yakin ingin menghapus <strong className="text-zinc-200">{karyawanToDelete.nama}</strong> ({karyawanToDelete.nik})?
                Tindakan ini akan menghapus data karyawan dari database.
              </p>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setKaryawanToDelete(null)}
                disabled={isDeletingKaryawan}
                className="flex-1 py-2 px-3 rounded-xl border border-zinc-700 text-zinc-300 font-semibold text-xs hover:bg-zinc-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingKaryawan}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                {isDeletingKaryawan ? (
                  <span>Menghapus...</span>
                ) : (
                  <span>Ya, Hapus</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
