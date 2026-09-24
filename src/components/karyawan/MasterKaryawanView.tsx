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
  MapPin,
  CheckCircle2,
  XCircle,
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
  Info,
  Layers,
  ArrowRightLeft,
  Sparkles,
  PlusCircle,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  DAFTAR_DIVISI,
  Karyawan,
  NamaDivisi,
  Rekening,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { ProsesGajiModal } from './ProsesGajiModal.tsx';
import { SlipGajiModal } from './SlipGajiModal.tsx';
import { BatchGajiHarianModal } from './BatchGajiHarianModal.tsx';

interface MasterKaryawanViewProps {
  rekeningList: Rekening[];
  initialTab?: 'karyawan' | 'riwayat-gaji';
  onOpenStatement?: (mitraId: string) => void;
  onOpenKasbonUang?: (karyawanMitraId: string) => void;
  onNavigateToDivisi?: () => void;
  onRefreshAll?: () => void;
}

export const MasterKaryawanView: React.FC<MasterKaryawanViewProps> = ({
  rekeningList,
  initialTab = 'karyawan',
  onOpenStatement,
  onOpenKasbonUang,
  onNavigateToDivisi,
  onRefreshAll,
}) => {
  const [karyawanList, setKaryawanList] = useState<KaryawanWithBon[]>([]);
  const [penggajianHistory, setPenggajianHistory] = useState<TransaksiPenggajian[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDepartemen, setFilterDepartemen] = useState('ALL');
  const [filterKasbon, setFilterKasbon] = useState<'ALL' | 'HANYA_BON' | 'BEBAS_BON'>('ALL');
  const [activeTab, setActiveTab] = useState<'karyawan' | 'riwayat-gaji'>(initialTab);

  // History filters
  const [filterDivisiGaji, setFilterDivisiGaji] = useState<string>('ALL');
  const [filterTipeGaji, setFilterTipeGaji] = useState<string>('ALL');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKaryawan, setEditingKaryawan] = useState<Karyawan | null>(null);
  const [selectedKaryawanForGaji, setSelectedKaryawanForGaji] = useState<KaryawanWithBon | null>(null);
  const [selectedDivisiPreset, setSelectedDivisiPreset] = useState<NamaDivisi | undefined>(undefined);
  const [isProsesGajiModalOpen, setIsProsesGajiModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Form state
  const [formNik, setFormNik] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formJabatan, setFormJabatan] = useState('');
  const [formDepartemen, setFormDepartemen] = useState('Operasional Toko');
  const [formGajiPokok, setFormGajiPokok] = useState<number>(3500000);
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
    } catch (err) {
      console.error('Error fetching karyawan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatRupiah = (val: number) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  // KPIs
  const totalKaryawanAktif = karyawanList.filter((k) => k.status === 'AKTIF').length;
  const totalBebanGajiPokok = karyawanList
    .filter((k) => k.status === 'AKTIF')
    .reduce((sum, k) => sum + (k.gajiPokok || 0) + (k.tunjanganTetap || 0), 0);
  const totalKasbonSemuaKaryawan = karyawanList.reduce((sum, k) => sum + (k.totalKasbonAktif || 0), 0);
  const jumlahKaryawanBon = karyawanList.filter((k) => (k.totalKasbonAktif || 0) > 0).length;

  // Filtered List
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

  const handleOpenAdd = () => {
    setEditingKaryawan(null);
    setFormNik(`KRY-${String(karyawanList.length + 1).padStart(3, '0')}`);
    setFormNama('');
    setFormJabatan('');
    setFormDepartemen('Operasional Toko');
    setFormGajiPokok(3500000);
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

  const handleToggleStatus = async (k: Karyawan) => {
    const nextStatus = k.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';
    if (!confirm(`Ubah status karyawan ${k.nama} (${k.nik}) menjadi ${nextStatus}?`)) {
      return;
    }
    try {
      await api.toggleKaryawanStatus(k.id);
      loadData();
      onRefreshAll?.();
    } catch (err: any) {
      alert(err.message || 'Gagal mengubah status');
    }
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
      }
      setIsModalOpen(false);
      loadData();
      onRefreshAll?.();
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan data karyawan');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePayrollSuccess = (slip: TransaksiPenggajian) => {
    setSelectedKaryawanForGaji(null);
    setActiveSlip(slip);
    loadData();
    onRefreshAll?.();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-5 rounded-xl border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <Briefcase className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-zinc-100">Master Karyawan & Payroll Potong Bon</h1>
            <span className="text-xs bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-800">
              MODUL HR & KASBON
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Kelola data staf & karyawan PT Wijaya Agro, otomatis terintegrasi sebagai mitra untuk kasbon belanja & kasbon tunai, serta penggajian berkala dengan fitur potong bon otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tabs: Clean 2 Tabs */}
          <div className="flex items-center bg-zinc-800 p-1 rounded-lg border border-zinc-700">
            <button
              onClick={() => setActiveTab('karyawan')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'karyawan'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Daftar Karyawan</span>
            </button>

            <button
              onClick={() => setActiveTab('riwayat-gaji')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'riwayat-gaji'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5 text-sky-400" />
              <span>Riwayat Penggajian & Slip</span>
            </button>
          </div>

          {/* Action Buttons */}
          <button
            onClick={() => {
              const firstActive = karyawanList.find((k) => k.status === 'AKTIF') || null;
              setSelectedKaryawanForGaji(firstActive);
              setSelectedDivisiPreset(undefined);
              setIsProsesGajiModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            title="Input upah harian individual per karyawan"
          >
            <Calculator className="w-4 h-4" />
            <span>+ Upah Harian</span>
          </button>

          <button
            onClick={() => setIsBatchModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-700/60 rounded-lg text-xs font-bold transition-colors"
            title="Input cepat upah harian banyak karyawan sekaligus"
          >
            <Layers className="w-4 h-4 text-amber-400" />
            <span>+ Upah Kolektif</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Karyawan Baru</span>
          </button>

          {onNavigateToDivisi && (
            <button
              onClick={onNavigateToDivisi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-800/60 rounded-lg text-xs font-semibold transition-colors"
              title="Buka Menu Divisi & Kas Operasional"
            >
              <Building2 className="w-4 h-4 text-emerald-400" />
              <span>Menu Divisi & Kas →</span>
            </button>
          )}
        </div>
      </div>

      {/* Integration Info Banner */}
      <div className="bg-zinc-900/70 border border-zinc-800 px-4 py-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 text-zinc-300">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Sistem Terintegrasi:</strong> Input upah harian karyawan otomatis memotong kasbon aktif dan dibayarkan langsung dari kas divisi penugasan hari kerja tersebut.
          </span>
        </div>
        {onNavigateToDivisi && (
          <button
            onClick={onNavigateToDivisi}
            className="text-emerald-400 hover:underline font-semibold shrink-0 text-xs flex items-center space-x-1 self-start sm:self-auto"
          >
            <span>Cek Saldo Kas 6 Divisi</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Karyawan Aktif */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Total Karyawan Aktif</p>
            <p className="text-2xl font-bold text-zinc-100 mt-1">{totalKaryawanAktif} Orang</p>
            <p className="text-[11px] text-zinc-500 mt-1">Total {karyawanList.length} terdaftar di sistem</p>
          </div>
          <div className="p-3 bg-emerald-950/80 border border-emerald-800/60 rounded-xl text-emerald-400">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 2: Beban Gaji Standar Bulanan */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Beban Gaji Bulanan</p>
            <p className="text-lg font-bold text-emerald-400 font-mono mt-1">
              {formatRupiah(totalBebanGajiPokok)}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">Gaji pokok + tunjangan tetap</p>
          </div>
          <div className="p-3 bg-blue-950/80 border border-blue-800/60 rounded-xl text-blue-400">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 3: Total Kasbon Aktif Karyawan */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Kasbon Karyawan Aktif</p>
            <p className="text-lg font-bold text-rose-400 font-mono mt-1">
              {formatRupiah(totalKasbonSemuaKaryawan)}
            </p>
            <p className="text-[11px] text-rose-300 mt-1">{jumlahKaryawanBon} orang memiliki pinjaman</p>
          </div>
          <div className="p-3 bg-rose-950/80 border border-rose-800/60 rounded-xl text-rose-400">
            <HandCoins className="w-6 h-6" />
          </div>
        </div>

        {/* KPI 4: Info Karyawan Sebagai Mitra */}
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400">Integrasi Mitra Kasir</p>
            <p className="text-sm font-bold text-sky-400 mt-1">100% Terhubung</p>
            <p className="text-[11px] text-zinc-500 mt-1">Bisa kasbon barang & pinjam tunai</p>
          </div>
          <div className="p-3 bg-sky-950/80 border border-sky-800/60 rounded-xl text-sky-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {activeTab === 'karyawan' ? (
        /* MAIN TABLE: KARYAWAN LIST */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          {/* Filter Bar */}
          <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
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

            <div className="text-xs text-zinc-400">
              Menampilkan <span className="font-bold text-zinc-200">{filteredKaryawan.length}</span> karyawan
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-800/80 text-zinc-400 border-b border-zinc-700 font-semibold">
                  <th className="py-3 px-4">KARYAWAN</th>
                  <th className="py-3 px-4">JABATAN & DEPT</th>
                  <th className="py-3 px-4">STANDAR GAJI</th>
                  <th className="py-3 px-4">STATUS KASBON</th>
                  <th className="py-3 px-4">KONTAK & ALAMAT</th>
                  <th className="py-3 px-4 text-center">STATUS</th>
                  <th className="py-3 px-4 text-right">AKSI CEPAT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      Memuat data karyawan...
                    </td>
                  </tr>
                ) : filteredKaryawan.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      Tidak ada karyawan yang sesuai filter
                    </td>
                  </tr>
                ) : (
                  filteredKaryawan.map((k) => {
                    const hasBon = (k.totalKasbonAktif || 0) > 0;
                    const linkedMitraId = k.idMitraTerkait || `MTR-${k.id}`;

                    return (
                      <tr key={k.id} className="hover:bg-zinc-800/40 transition-colors">
                        {/* Karyawan Name & NIK */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
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

                        {/* Jabatan & Departemen */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-zinc-200">{k.jabatan}</div>
                          <div className="text-[11px] text-zinc-400">{k.departemen}</div>
                        </td>

                        {/* Standar Gaji */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="text-zinc-200 font-semibold">{formatRupiah(k.gajiPokok)}</div>
                          <div className="text-[10px] text-zinc-400">
                            + Tunjangan: {formatRupiah(k.tunjanganTetap)}
                          </div>
                        </td>

                        {/* Status Kasbon Saat Ini */}
                        <td className="py-3.5 px-4">
                          {hasBon ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-950 text-rose-300 font-mono font-bold rounded border border-rose-800 text-[11px]">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>{formatRupiah(k.totalKasbonAktif)}</span>
                              </span>
                              <div className="text-[10px] text-zinc-400">
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

                        {/* Kontak & Alamat */}
                        <td className="py-3.5 px-4 text-zinc-300">
                          <div className="flex items-center space-x-1">
                            <Phone className="w-3 h-3 text-zinc-500" />
                            <span>{k.telepon || '-'}</span>
                          </div>
                          <div className="text-[10px] text-zinc-400 truncate max-w-[180px]">
                            {k.alamat || '-'}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
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

                        {/* Aksi Cepat */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Tombol Proses Gaji / Potong Bon */}
                            <button
                              onClick={() => setSelectedKaryawanForGaji(k)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center space-x-1 shadow-xs transition-colors"
                              title="Proses penggajian bulanan & potong sisa kasbon"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              <span>Gaji & Bon</span>
                            </button>

                            {/* Tombol Buku Kasbon / Rekening Koran */}
                            <button
                              onClick={() => onOpenStatement?.(linkedMitraId)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-sky-400 rounded border border-zinc-700 transition-colors"
                              title="Lihat Mutasi Kasbon & Rekening Koran Karyawan"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </button>

                            {/* Tombol Kasbon Uang Cepat */}
                            <button
                              onClick={() => onOpenKasbonUang?.(linkedMitraId)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-rose-400 rounded border border-zinc-700 transition-colors"
                              title="Kasbon Uang Baru untuk Karyawan ini"
                            >
                              <HandCoins className="w-3.5 h-3.5" />
                            </button>

                            {/* Tombol Edit */}
                            <button
                              onClick={() => handleOpenEdit(k)}
                              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                              title="Edit Profil Karyawan"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            {/* Tombol Toggle Status */}
                            <button
                              onClick={() => handleToggleStatus(k)}
                              className={`p-1.5 rounded border transition-colors ${
                                k.status === 'AKTIF'
                                  ? 'bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-400 border-zinc-700 hover:border-rose-800'
                                  : 'bg-zinc-800 hover:bg-emerald-950 text-zinc-400 hover:text-emerald-400 border-zinc-700 hover:border-emerald-800'
                              }`}
                              title={k.status === 'AKTIF' ? 'Nonaktifkan Karyawan' : 'Aktifkan Kembali Karyawan'}
                            >
                              {k.status === 'AKTIF' ? (
                                <XCircle className="w-3.5 h-3.5" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              )}
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
      ) : (
        /* TAB 2: RIWAYAT PENGGAJIAN & CETAK SLIP */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-zinc-100 flex items-center space-x-2">
                <span>Riwayat Pembayaran Upah & Gaji Karyawan</span>
                <span className="text-xs bg-zinc-800 text-zinc-400 font-mono px-2 py-0.5 rounded border border-zinc-700">
                  {penggajianHistory.length} Transaksi
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Catatan payroll harian & bulanan, pemotongan bon mitra, slip upah, dan rekening penanggung jawab
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div>
                <select
                  value={filterDivisiGaji}
                  onChange={(e) => setFilterDivisiGaji(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-hidden"
                >
                  <option value="ALL">Semua Divisi Penugasan</option>
                  {DAFTAR_DIVISI.map((d) => (
                    <option key={d.id} value={d.nama}>
                      {d.nama}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={filterTipeGaji}
                  onChange={(e) => setFilterTipeGaji(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-md px-2.5 py-1.5 text-zinc-200 text-xs focus:outline-hidden"
                >
                  <option value="ALL">Semua Tipe Upah</option>
                  <option value="HARIAN">Hanya Upah Harian</option>
                  <option value="BULANAN">Hanya Gaji Bulanan</option>
                </select>
              </div>

              <button
                onClick={() => setActiveTab('karyawan')}
                className="text-xs text-emerald-400 hover:underline font-semibold ml-auto"
              >
                Ke Master Karyawan
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-800/80 text-zinc-400 border-b border-zinc-700 font-semibold">
                  <th className="py-3 px-4">NO. SLIP / ID</th>
                  <th className="py-3 px-4">TANGGAL & TIPE</th>
                  <th className="py-3 px-4">PENUGASAN DIVISI</th>
                  <th className="py-3 px-4">KARYAWAN</th>
                  <th className="py-3 px-4">UPAH KOTOR</th>
                  <th className="py-3 px-4">POTONGAN BON</th>
                  <th className="py-3 px-4">TAKE HOME PAY</th>
                  <th className="py-3 px-4">REKENING DIVISI</th>
                  <th className="py-3 px-4 text-right">SLIP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(() => {
                  const filtered = penggajianHistory.filter((g) => {
                    const matchDivisi =
                      filterDivisiGaji === 'ALL' ||
                      g.divisi === filterDivisiGaji ||
                      (!g.divisi && filterDivisiGaji === 'ALL');

                    const isHarian =
                      g.tipeGaji === 'HARIAN' ||
                      g.periodeBulan?.toLowerCase().includes('harian') ||
                      g.slipNomor?.startsWith('UPH-');

                    const matchTipe =
                      filterTipeGaji === 'ALL' ||
                      (filterTipeGaji === 'HARIAN' && isHarian) ||
                      (filterTipeGaji === 'BULANAN' && !isHarian);

                    return matchDivisi && matchTipe;
                  });

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-zinc-500">
                          Tidak ada transaksi penggajian yang sesuai dengan filter.
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((g) => {
                    const isHarian =
                      g.tipeGaji === 'HARIAN' ||
                      g.periodeBulan?.toLowerCase().includes('harian') ||
                      g.slipNomor?.startsWith('UPH-');

                    return (
                      <tr key={g.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-zinc-200">
                          {g.slipNomor}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-zinc-200 flex items-center space-x-1.5">
                            <span>{g.tanggalKerja || g.tanggal}</span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                                isHarian
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {isHarian ? 'HARIAN' : 'BULANAN'}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {g.periodeBulan}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-zinc-800 text-amber-300 border border-amber-800/50">
                            {g.divisi || 'Gudang Wijaya Agro'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-zinc-100">{g.namaKaryawan}</div>
                          <div className="text-[10px] text-zinc-400">
                            {g.nikKaryawan} • {g.jabatan}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-zinc-300">
                          {formatRupiah(g.totalGajiKotor)}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {g.potonganKasbon > 0 ? (
                            <span className="text-rose-400 font-semibold">
                              -{formatRupiah(g.potonganKasbon)} ({g.persentasePotongKasbon}%)
                            </span>
                          ) : (
                            <span className="text-zinc-500">Rp 0</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-400 text-sm">
                          {formatRupiah(g.gajiBersihDibayar)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 font-mono text-[10px] rounded border border-zinc-700">
                            {g.rekeningSumber} ({g.metodePembayaran})
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => setActiveSlip(g)}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded text-xs font-semibold border border-zinc-700 flex items-center space-x-1 ml-auto transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Cetak Slip</span>
                          </button>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL FORM: TAMBAH / EDIT KARYAWAN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-xl rounded-xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[90vh]">
            <div className="p-4 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-emerald-400" />
                <h2 className="font-bold text-sm text-zinc-100">
                  {editingKaryawan ? 'Edit Profil Karyawan' : 'Tambah Karyawan Baru'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-700 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-950/80 border border-rose-700 text-rose-300 rounded-lg flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    NIK / Kode Karyawan:
                  </label>
                  <input
                    type="text"
                    value={formNik}
                    onChange={(e) => setFormNik(e.target.value.toUpperCase())}
                    disabled={!!editingKaryawan}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 font-mono disabled:opacity-60 focus:outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Nama Lengkap:
                  </label>
                  <input
                    type="text"
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    placeholder="Nama staf/karyawan"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Jabatan / Posisi:
                  </label>
                  <input
                    type="text"
                    value={formJabatan}
                    onChange={(e) => setFormJabatan(e.target.value)}
                    placeholder="Contoh: Kasir Toko, Staff Gudang..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Departemen / Divisi:
                  </label>
                  <select
                    value={formDepartemen}
                    onChange={(e) => setFormDepartemen(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                  >
                    <option value="Operasional Toko">Operasional Toko (Saprotan)</option>
                    <option value="Gudang Hasil Bumi">Gudang Hasil Bumi (Timbang & Sortasi)</option>
                    <option value="Transport & Distribusi">Transport & Distribusi (Logistik Truk)</option>
                    <option value="Administrasi & Keuangan">Administrasi & Keuangan</option>
                    <option value="Teknisi & Lapangan">Teknisi & Lapangan (Agronomis)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Gaji Pokok Bulanan (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formGajiPokok || ''}
                    onChange={(e) => setFormGajiPokok(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Tunjangan Tetap (Rp):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formTunjangan || ''}
                    onChange={(e) => setFormTunjangan(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 font-mono focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    No. Telepon / WhatsApp:
                  </label>
                  <input
                    type="text"
                    value={formTelepon}
                    onChange={(e) => setFormTelepon(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                    Tanggal Masuk Kerja:
                  </label>
                  <input
                    type="text"
                    value={formTanggalMasuk}
                    onChange={(e) => setFormTanggalMasuk(e.target.value)}
                    placeholder="Contoh: 15/01/2024"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Alamat Tempat Tinggal:
                </label>
                <textarea
                  rows={2}
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  placeholder="Alamat domisili karyawan..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-zinc-100 text-xs focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-300 mb-1">
                  Catatan Khusus (Opsional):
                </label>
                <input
                  type="text"
                  value={formCatatan}
                  onChange={(e) => setFormCatatan(e.target.value)}
                  placeholder="Catatan tambahan..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-zinc-100 text-xs focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-lg flex items-start space-x-2 text-[11px] text-sky-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
                <span>
                  Sistem otomatis mendaftarkan profil karyawan ke Master Mitra dengan Role <strong>KARYAWAN</strong>. Kasir dapat langsung memilih nama karyawan saat kasbon barang atau kasbon uang tunai.
                </span>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={formSubmitting}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium text-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-xs transition-colors"
                >
                  {formSubmitting ? 'Menyimpan...' : editingKaryawan ? 'Perbarui Data' : 'Simpan Karyawan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROSES GAJI MODAL (INDIVIDUAL / HARIAN / BULANAN) */}
      {(selectedKaryawanForGaji || isProsesGajiModalOpen) && (
        <ProsesGajiModal
          karyawan={selectedKaryawanForGaji}
          allKaryawan={karyawanList}
          rekeningList={rekeningList}
          initialDivisi={selectedDivisiPreset}
          onClose={() => {
            setSelectedKaryawanForGaji(null);
            setIsProsesGajiModalOpen(false);
          }}
          onSuccess={handlePayrollSuccess}
        />
      )}

      {/* BATCH INPUT UPAH HARIAN KOLEKTIF */}
      {isBatchModalOpen && (
        <BatchGajiHarianModal
          karyawanList={karyawanList}
          rekeningList={rekeningList}
          onClose={() => setIsBatchModalOpen(false)}
          onSuccess={(slips) => {
            setIsBatchModalOpen(false);
            loadData();
            onRefreshAll?.();
            if (slips && slips.length > 0) {
              setActiveSlip(slips[0]);
            }
          }}
        />
      )}

      {/* SLIP GAJI MODAL (PRINT & WA READY) */}
      {activeSlip && (
        <SlipGajiModal slip={activeSlip} onClose={() => setActiveSlip(null)} />
      )}
    </div>
  );
};
