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
  FileSpreadsheet,
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
import { formatRupiah } from '../../utils/format.ts';
import { RekapitulasiPayrollBulananTable } from './RekapitulasiPayrollBulananTable.tsx';
import { InputPayrollHarianDivisiModal } from './InputPayrollHarianDivisiModal.tsx';
import { DetailHarianKaryawanModal } from './DetailHarianKaryawanModal.tsx';
import { SlipGajiModal } from './SlipGajiModal.tsx';
import { ProsesGajiModal } from './ProsesGajiModal.tsx';
import { BatchGajiHarianModal } from './BatchGajiHarianModal.tsx';
import { ModalContohPatokanExcel } from './ModalContohPatokanExcel.tsx';
import { FullErpModularDataset, buildModularSpreadsheets } from '../../utils/modularSpreadsheets.ts';
import { syncModularFileDirectly, getAccessToken, googleSignIn } from '../../services/googleSheetsService.ts';

interface MasterKaryawanViewProps {
  rekeningList: Rekening[];
  fullErpData?: FullErpModularDataset;
  initialTab?: 'rekap' | 'input-harian' | 'karyawan' | 'riwayat-gaji';
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

  // Spreadsheet direct sync state
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetSyncFeedback, setSheetSyncFeedback] = useState<{
    success: boolean;
    message: string;
    webViewLink?: string;
  } | null>(null);

  const handleSyncToSpreadsheet = async () => {
    setIsSyncingSheet(true);
    setSheetSyncFeedback(null);
    try {
      let token = await getAccessToken();
      if (!token) {
        const signRes = await googleSignIn();
        if (!signRes) throw new Error('Akses Google belum terhubung.');
      }

      const currentErpData: FullErpModularDataset = fullErpData || {
        rekeningList,
        mitraList: [],
        karyawanList: karyawanList as any,
        upahHarianList: logHarianList,
        penggajianList: penggajianHistory,
        produkList: [],
        stokList: [],
        stokHasilBumiList: [],
        pembelianList: [],
        pembelianBarangList: [],
        penjualanList: [],
        kasbonUangList: [],
        bayarBonList: [],
        transferList: [],
        auditLogs: [],
      };

      const modularFiles = buildModularSpreadsheets(currentErpData);
      const fileKaryawan = modularFiles.find((f) => f.id === 'file-karyawan');
      if (!fileKaryawan) throw new Error('Definisi file karyawan tidak ditemukan');

      const res = await syncModularFileDirectly(fileKaryawan);
      setSheetSyncFeedback({
        success: true,
        message: `Database Karyawan berhasil disinkronkan ke Spreadsheet (${karyawanList.length} Karyawan Riil)!`,
        webViewLink: res.webViewLink,
      });
    } catch (err: any) {
      setSheetSyncFeedback({
        success: false,
        message: `Gagal sinkronisasi ke Spreadsheet: ${err.message}`,
      });
    } finally {
      setIsSyncingSheet(false);
    }
  };

  // Active Tab
  const [activeTab, setActiveTab] = useState<'rekap' | 'input-harian' | 'karyawan' | 'riwayat-gaji'>(
    initialTab
  );

  // Filters for employee profile cards
  const [search, setSearch] = useState('');
  const [filterDepartemen, setFilterDepartemen] = useState('ALL');
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
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  // Modal Input Payroll Harian
  const [isInputPayrollModalOpen, setIsInputPayrollModalOpen] = useState(false);
  const [modalKaryawanId, setModalKaryawanId] = useState<string | undefined>(undefined);
  const [modalDivisi, setModalDivisi] = useState<NamaDivisi | undefined>(undefined);

  // Detail Modal
  const [detailKaryawanId, setDetailKaryawanId] = useState<string | null>(null);

  // Modal Contoh Patokan Excel
  const [isContohModalOpen, setIsContohModalOpen] = useState(false);

  // Form add/edit employee state
  const [formNik, setFormNik] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formJabatan, setFormJabatan] = useState('');
  const [formDepartemen, setFormDepartemen] = useState('Operasional Toko');
  const [formGajiPokok, setFormGajiPokok] = useState<number>(135000);
  const [formTunjangan, setFormTunjangan] = useState<number>(500000);
  const [formTelepon, setFormTelepon] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formTanggalMasuk, setFormTanggalMasuk] = useState('');
  const [formCatatan, setFormCatatan] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [kRes, gRes] = await Promise.all([api.getKaryawan(), api.getPenggajian()]);
      setKaryawanList(kRes);
      setPenggajianHistory(gRes);

      if (!inputKryId && kRes.length > 0) {
        const firstActive = kRes.find((k) => k.status === 'AKTIF') || kRes[0];
        setInputKryId(firstActive.id);
        setInputUpahHarian(firstActive.gajiPokok || 135000);
      }
    } catch (err) {
      console.error('Error fetching karyawan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update default wage whenever selected employee changes in Tab 2
  const handleSelectEmployeeForInput = (id: string) => {
    setInputKryId(id);
    const k = karyawanList.find((item) => item.id === id);
    if (k) {
      setInputUpahHarian(k.gajiPokok || 135000);
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
    setFormDepartemen('Operasional Toko');
    setFormGajiPokok(135000);
    setFormTunjangan(500000);
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
    setFormDepartemen(k.departemen);
    setFormGajiPokok(k.gajiPokok);
    setFormTunjangan(k.tunjanganTetap);
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
          departemen: formDepartemen,
          gajiPokok: formGajiPokok,
          tunjanganTetap: formTunjangan,
          telepon: formTelepon,
          alamat: formAlamat,
          catatan: formCatatan,
        });
        setSuccessBanner(`✅ Data karyawan "${namaSaved}" berhasil diperbarui di database!`);
      } else {
        await api.createKaryawan({
          nik: formNik,
          nama: formNama,
          jabatan: formJabatan,
          departemen: formDepartemen,
          gajiPokok: formGajiPokok,
          tunjanganTetap: formTunjangan,
          telepon: formTelepon,
          alamat: formAlamat,
          tanggalMasuk: formTanggalMasuk,
          catatan: formCatatan,
        });
        setSuccessBanner(`✅ Karyawan baru "${namaSaved}" (${nikSaved}) berhasil disimpan permanen ke database!`);
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

  const handleDeletePermanent = async (k: Karyawan) => {
    if (!window.confirm(`Hapus permanen karyawan "${k.nama}" (${k.nik}) dari database?\nTindakan ini akan menghapus data dari master karyawan dan catatan buku kas terkait.`)) {
      return;
    }
    try {
      await api.deleteKaryawanPermanent(k.id);
      setSuccessBanner(`Karyawan "${k.nama}" telah dihapus permanen dari database.`);
      setTimeout(() => setSuccessBanner(''), 6000);
      setRefreshTrigger((prev) => prev + 1);
      await loadData();
      onRefreshAll?.();
    } catch (err: any) {
      alert(`Gagal menghapus karyawan: ${err.message}`);
    }
  };

  // Filtered employees for Tab 3
  const filteredKaryawan = karyawanList.filter((k) => {
    const matchSearch =
      k.nama.toLowerCase().includes(search.toLowerCase()) ||
      k.nik.toLowerCase().includes(search.toLowerCase()) ||
      k.jabatan.toLowerCase().includes(search.toLowerCase()) ||
      k.departemen.toLowerCase().includes(search.toLowerCase());

    const matchDept = filterDepartemen === 'ALL' || k.departemen === filterDepartemen;

    let matchBon = true;
    if (filterKasbon === 'HANYA_BON') {
      matchBon = (k.totalKasbonAktif || 0) > 0;
    } else if (filterKasbon === 'BEBAS_BON') {
      matchBon = (k.totalKasbonAktif || 0) === 0;
    }

    return matchSearch && matchDept && matchBon;
  });

  const uniqueDepartments = Array.from(new Set(karyawanList.map((k) => k.departemen)));

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
          {/* Tombol Sinkronisasi Langsung ke Google Spreadsheet */}
          <button
            type="button"
            onClick={handleSyncToSpreadsheet}
            disabled={isSyncingSheet}
            className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            title="Sinkronkan database karyawan riil ke Google Spreadsheet di Drive"
          >
            <FileSpreadsheet className={`w-4 h-4 ${isSyncingSheet ? 'animate-spin text-indigo-300' : 'text-emerald-300'}`} />
            <span>{isSyncingSheet ? 'Menyinkronkan...' : '⚡ Sinkronkan ke Spreadsheet'}</span>
          </button>

          {/* Button Contoh Format Patokan Excel User */}
          <button
            onClick={() => setIsContohModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Format Patokan Excel</span>
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
            <span>+ Input Gaji Harian</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
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

      {/* Feedback Sinkronisasi Spreadsheet Karyawan */}
      {sheetSyncFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            sheetSyncFeedback.success
              ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/80 border-rose-700 text-rose-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {sheetSyncFeedback.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-semibold">{sheetSyncFeedback.message}</span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {sheetSyncFeedback.webViewLink && (
              <a
                href={sheetSyncFeedback.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                <span>Buka di Google Drive</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              onClick={() => setSheetSyncFeedback(null)}
              className="text-zinc-400 hover:text-zinc-200 cursor-pointer text-xs p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 4 Main Tabs Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-zinc-900/90 p-2 rounded-xl border border-zinc-800">
        <button
          onClick={() => setActiveTab('rekap')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'rekap'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>1. List Nama Karyawan &amp; Rekap Gaji (Input Harian &amp; Detail Bon)</span>
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
          <span>2. Input Gaji Manual Fleksibel</span>
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
          <span>3. Data &amp; Profil Karyawan ({karyawanList.length})</span>
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
          <span>4. Riwayat Slip Penggajian ({penggajianHistory.length})</span>
        </button>
      </div>

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
                    <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                    <span>Format Patokan Catatan Keuangan Gaji Harian</span>
                  </span>
                  <span className="text-[10px] text-amber-300 bg-amber-950 px-2 py-0.5 rounded border border-amber-700">
                    PT Wijaya Agro Perkasa
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
                          if (it === 'JALAN') setInputUpahHarian(800000);
                          else if (it === 'SURJAL') setInputUpahHarian(100000);
                          else if (it === 'JAJAN') setInputUpahHarian(50000);
                          else if (it === 'NGEBAL') setInputUpahHarian(70000);
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
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center space-x-3 pb-3 border-b border-zinc-800">
                    <div className="w-10 h-10 rounded-full bg-amber-950 text-amber-300 border border-amber-800 flex items-center justify-center font-bold text-sm">
                      {activeKry.nama.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-100 text-sm">{activeKry.nama}</h3>
                      <div className="text-[11px] text-zinc-400">
                        {activeKry.nik} • {activeKry.jabatan}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Departemen:</span>
                      <span className="font-semibold text-zinc-200">{activeKry.departemen}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Standar Harian Pokok:</span>
                      <span className="font-mono text-zinc-200">
                        {formatRupiah(activeKry.gajiPokok || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Kasbon Uang Berjalan:</span>
                      <span className="font-mono text-rose-400 font-semibold">
                        {formatRupiah(activeKry.kasbonUang || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Kasbon Barang Toko:</span>
                      <span className="font-mono text-rose-400 font-semibold">
                        {formatRupiah(activeKry.kasbonBarang || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-zinc-800 font-bold">
                      <span className="text-zinc-300">Total Kasbon Aktif:</span>
                      <span className="font-mono text-rose-400">
                        {formatRupiah(activeKry.totalKasbonAktif || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setDetailKaryawanId(activeKry.id)}
                      className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Buka Riwayat Rincian Kerja {activeKry.nama}</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Division Cash Balance Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>Saldo Kas Divisi Terkait ({inputDivisi})</span>
              </h3>
              {(() => {
                const divRekKode = DAFTAR_DIVISI.find((d) => d.nama === inputDivisi)?.kodeRekening;
                const rek = rekeningList.find((r) => r.kode === divRekKode);
                return (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-400">Buku Rekening:</span>
                      <span className="font-mono text-zinc-200">{rek?.nama || divRekKode}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-400">Saldo Operasional:</span>
                      <span className="text-base font-bold text-emerald-400 font-mono">
                        {formatRupiah(rek?.saldoSaatIni || 0)}
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
                value={filterDepartemen}
                onChange={(e) => setFilterDepartemen(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-hidden focus:border-emerald-500"
              >
                <option value="ALL">Semua Departemen</option>
                {uniqueDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
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
                    <th className="py-3 px-4">JABATAN &amp; DEPT</th>
                    <th className="py-3 px-4">STANDAR UPAH HARIAN</th>
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
                                : 'Coba ubah kata kunci pencarian atau reset filter departemen.'}
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

                      return (
                        <tr key={k.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-amber-950 text-amber-300 border border-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                                {k.nama.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-zinc-100">{k.nama}</div>
                                <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                                  {k.nik}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-sans">
                            <div className="font-medium text-zinc-200">{k.jabatan}</div>
                            <div className="text-[11px] text-zinc-400">{k.departemen}</div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="text-zinc-200 font-semibold">{formatRupiah(k.gajiPokok)}</div>
                            <div className="text-[10px] text-zinc-400 font-sans">
                              + Tunjangan: {formatRupiah(k.tunjanganTetap)}
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
                              {/* Quick daily wage input */}
                              <button
                                onClick={() => {
                                  setModalKaryawanId(k.id);
                                  setIsInputPayrollModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold flex items-center space-x-1 transition-colors"
                                title="Input Upah Harian untuk Karyawan Ini"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                                <span>+ Upah</span>
                              </button>

                              {/* Detail logs */}
                              <button
                                onClick={() => setDetailKaryawanId(k.id)}
                                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-sky-400 rounded border border-zinc-700 transition-colors"
                                title="Lihat Rekening Buku & Detail Log Kerja"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
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
                  <label className="block text-zinc-400 mb-1">Jabatan</label>
                  <input
                    type="text"
                    value={formJabatan}
                    onChange={(e) => setFormJabatan(e.target.value)}
                    required
                    placeholder="Contoh: Staff Gudang"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Departemen</label>
                  <select
                    value={formDepartemen}
                    onChange={(e) => setFormDepartemen(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
                  >
                    <option value="Operasional Toko">Operasional Toko</option>
                    <option value="Gudang Hasil Bumi">Gudang Hasil Bumi</option>
                    <option value="Transport &amp; Logistik">Transport &amp; Logistik</option>
                    <option value="Pabrik &amp; Dryer">Pabrik &amp; Dryer</option>
                    <option value="Administrasi &amp; Keuangan">Administrasi &amp; Keuangan</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Standar Upah Harian (Rp)</label>
                  <input
                    type="number"
                    value={formGajiPokok}
                    onChange={(e) => setFormGajiPokok(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">No. Telepon / WA</label>
                  <input
                    type="text"
                    value={formTelepon}
                    onChange={(e) => setFormTelepon(e.target.value)}
                    placeholder="0812..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-zinc-100"
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

      {/* Modal: Slip Gaji */}
      {activeSlip && (
        <SlipGajiModal slip={activeSlip} onClose={() => setActiveSlip(null)} />
      )}

      {/* Modal: Contoh Patokan Excel Penggajian Karyawan */}
      <ModalContohPatokanExcel
        isOpen={isContohModalOpen}
        onClose={() => setIsContohModalOpen(false)}
        onSelectKaryawan={() => {
          setActiveTab('rekap');
        }}
      />
    </div>
  );
};
