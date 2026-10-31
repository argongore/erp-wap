import React, { useState, useEffect } from 'react';
import {
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  Calendar,
  Search,
  PlusCircle,
  FileSpreadsheet,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  History,
  Users,
  Briefcase,
  ChevronRight,
  ShieldCheck,
  Send,
  Warehouse,
  Truck,
  Wrench,
  Store,
  Layers,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  CatatanUpahHarian,
  DAFTAR_DIVISI,
  NamaDivisi,
  PergerakanKeuanganDivisiSummary,
  Rekening,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ProsesGajiModal } from './ProsesGajiModal.tsx';
import { SlipGajiModal } from './SlipGajiModal.tsx';
import { InputPayrollHarianDivisiModal } from './InputPayrollHarianDivisiModal.tsx';
import { RekapitulasiPayrollBulananTable } from './RekapitulasiPayrollBulananTable.tsx';
import { DivisiLogoAvatar, resolveDivisiLogoUrl } from '../common/DivisiLogoAvatar.tsx';
import { ModalProfilDivisi } from './ModalProfilDivisi.tsx';

interface DivisiKeuanganViewProps {
  rekeningList: Rekening[];
  karyawanList?: KaryawanWithBon[];
  onOpenGajiModal?: (karyawan: KaryawanWithBon | null, divisiPreset?: NamaDivisi) => void;
  onNavigateToKaryawan?: () => void;
  onOpenLabaRugiDivisi?: () => void;
  onRefreshAll?: () => void;
}

export const DivisiKeuanganView: React.FC<DivisiKeuanganViewProps> = ({
  rekeningList,
  karyawanList,
  onOpenGajiModal,
  onNavigateToKaryawan,
  onOpenLabaRugiDivisi,
  onRefreshAll,
}) => {
  const [divisiData, setDivisiData] = useState<PergerakanKeuanganDivisiSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDivisi, setSelectedDivisi] = useState<PergerakanKeuanganDivisiSummary | null>(null);
  const [profilDivisiModalOpen, setProfilDivisiModalOpen] = useState(false);
  const [profilDivisiInitialNama, setProfilDivisiInitialNama] = useState<string | undefined>(undefined);

  // Sub-navigation inside DivisiKeuanganView
  const [activeMainTab, setActiveMainTab] = useState<'IKHTISAR_DIVISI' | 'REKAP_BULANAN' | 'LOG_HARIAN'>('IKHTISAR_DIVISI');

  // Input Payroll Harian Modal State
  const [isPayrollHarianModalOpen, setIsPayrollHarianModalOpen] = useState(false);
  const [payrollDivisiPreset, setPayrollDivisiPreset] = useState<NamaDivisi | undefined>(undefined);
  const [payrollKaryawanIdPreset, setPayrollKaryawanIdPreset] = useState<string | undefined>(undefined);

  // Karyawan & Gaji internal integration
  const [internalKaryawanList, setInternalKaryawanList] = useState<KaryawanWithBon[]>(karyawanList || []);
  const [isGajiModalOpen, setIsGajiModalOpen] = useState(false);
  const [selectedDivisiForGaji, setSelectedDivisiForGaji] = useState<NamaDivisi | undefined>(undefined);
  const [selectedKaryawanForGaji, setSelectedKaryawanForGaji] = useState<KaryawanWithBon | null>(null);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  // Upah Harian Log State
  const [allUpahHarian, setAllUpahHarian] = useState<CatatanUpahHarian[]>([]);
  const [loadingUpahHarian, setLoadingUpahHarian] = useState(false);
  const [logHarianSearch, setLogHarianSearch] = useState('');
  const [logHarianFilterDivisi, setLogHarianFilterDivisi] = useState('ALL');

  useEffect(() => {
    if (karyawanList && karyawanList.length > 0) {
      setInternalKaryawanList(karyawanList);
    } else {
      api.getKaryawan().then((list) => setInternalKaryawanList(list)).catch(console.error);
    }
  }, [karyawanList]);

  const loadUpahHarian = async (silent = false) => {
    if (!silent && allUpahHarian.length === 0) setLoadingUpahHarian(true);
    try {
      const list = await api.getUpahHarian();
      setAllUpahHarian(list);
    } catch (err) {
      console.error('Failed to load upah harian:', err);
    } finally {
      setLoadingUpahHarian(false);
    }
  };

  const handleOpenInputPayrollHarian = (idKaryawan?: string, divisiPreset?: string) => {
    setPayrollKaryawanIdPreset(idKaryawan);
    setPayrollDivisiPreset(divisiPreset as NamaDivisi | undefined);
    setIsPayrollHarianModalOpen(true);
  };

  const handlePayrollHarianSuccess = (slip?: TransaksiPenggajian) => {
    setIsPayrollHarianModalOpen(false);
    if (slip) {
      setActiveSlip(slip);
    }
    loadData();
    loadUpahHarian();
    onRefreshAll?.();
  };

  const handleOpenGaji = (karyawan: KaryawanWithBon | null, divisiPreset?: NamaDivisi) => {
    handleOpenInputPayrollHarian(karyawan?.id, divisiPreset);
  };

  const handlePayrollSuccess = (slip: TransaksiPenggajian) => {
    setIsGajiModalOpen(false);
    setActiveSlip(slip);
    loadData();
    loadUpahHarian();
    onRefreshAll?.();
  };

  // Dropping modal state
  const [isDropModalOpen, setIsDropModalOpen] = useState(false);
  const [dropTujuanRek, setDropTujuanRek] = useState<string>('REK-GWA');
  const [dropSumberRek, setDropSumberRek] = useState<string>('KAS01');
  const [dropNominal, setDropNominal] = useState<number>(5000000);
  const [dropKeterangan, setDropKeterangan] = useState<string>('Dropping operasional kas divisi & upah harian');
  const [dropSubmitting, setDropSubmitting] = useState(false);
  const [dropError, setDropError] = useState('');
  const [dropSuccess, setDropSuccess] = useState('');

  // Mutasi filter
  const [mutasiSearch, setMutasiSearch] = useState('');
  const [mutasiFilterJenis, setMutasiFilterJenis] = useState<
    | 'ALL'
    | 'PENJUALAN_MASUK'
    | 'PEMBELIAN_KELUAR'
    | 'PENGELUARAN_OPERASIONAL'
    | 'DROPPING_MASUK'
    | 'GAJI_KARYAWAN'
    | 'TRANSFER_KELUAR'
  >('ALL');

  const loadData = async (silent = false) => {
    if (!silent && divisiData.length === 0) setLoading(true);
    try {
      const data = await api.getDivisiKeuangan();
      setDivisiData(data);
      setSelectedDivisi((prev) => {
        if (!prev) return prev;
        return data.find((d) => d.divisi === prev.divisi) || prev;
      });
    } catch (err) {
      console.error('Failed to load divisi keuangan:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
    loadUpahHarian(false);
    const onErpUpdated = () => {
      loadData(true);
      loadUpahHarian(true);
    };
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  const getDivisiIcon = (nama: string) => {
    switch (nama) {
      case 'Gudang Wijaya Agro':
        return <Warehouse className="w-5 h-5 text-amber-400" />;
      case 'Wijaya Karya':
        return <Wrench className="w-5 h-5 text-blue-400" />;
      case 'Wijaya Transport':
        return <Truck className="w-5 h-5 text-indigo-400" />;
      case 'CV Wijaya Agro':
        return <Store className="w-5 h-5 text-emerald-400" />;
      case 'PT Wijaya Agro Perkasa':
        return <Building2 className="w-5 h-5 text-purple-400" />;
      case 'Okussa':
        return <Sparkles className="w-5 h-5 text-rose-400" />;
      default:
        return <Layers className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getDivisiBadgeColor = (nama: string) => {
    switch (nama) {
      case 'Gudang Wijaya Agro':
        return 'bg-amber-950/60 text-amber-300 border-amber-800';
      case 'Wijaya Karya':
        return 'bg-blue-950/60 text-blue-300 border-blue-800';
      case 'Wijaya Transport':
        return 'bg-indigo-950/60 text-indigo-300 border-indigo-800';
      case 'CV Wijaya Agro':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
      case 'PT Wijaya Agro Perkasa':
        return 'bg-purple-950/60 text-purple-300 border-purple-800';
      case 'Okussa':
        return 'bg-rose-950/60 text-rose-300 border-rose-800';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  // Totals across all divisions (Memisahkan Pembelian = Modal Stok vs Pengeluaran = Pengurang Saldo)
  const totalSaldoSemuaDivisi = divisiData.reduce((sum, d) => sum + (d.saldoSaatIni || 0), 0);
  const totalKasTunaiSemuaDivisi = divisiData.reduce(
    (sum, d) => sum + (d.saldoKasTunaiDivisi ?? d.saldoSaatIni ?? 0),
    0
  );
  const totalOmzetSemuaDivisi = divisiData.reduce(
    (sum, d) => sum + (d.totalOmzetPenjualan ?? d.totalPenjualanMasuk ?? 0),
    0
  );
  const totalModalPembelianSemuaDivisi = divisiData.reduce(
    (sum, d) => sum + (d.totalModalPembelian ?? d.totalPembelianKeluar ?? 0),
    0
  );
  const totalSisaModalStokSemuaDivisi = divisiData.reduce(
    (sum, d) => sum + (d.sisaModalStokBerjalan || 0),
    0
  );
  const totalDroppingSemuaDivisi = divisiData.reduce((sum, d) => sum + (d.totalDroppingMasuk || 0), 0);
  const totalBebanPengeluaranSemuaDivisi = divisiData.reduce(
    (sum, d) =>
      sum +
      (d.totalBebanPengeluaran ??
        (d.totalGajiKeluar || 0) + (d.totalPengeluaranOperasional || 0)),
    0
  );
  const totalLabaRugiBersihSemuaDivisi = divisiData.reduce(
    (sum, d) => sum + (d.labaRugiBersih || 0),
    0
  );

  const handleOpenDroppingModal = (targetRekKode: string) => {
    setDropTujuanRek(targetRekKode);
    setDropSumberRek('KAS01');
    setDropNominal(5000000);
    setDropError('');
    setDropSuccess('');
    setIsDropModalOpen(true);
  };

  const handleExecuteDropping = async (e: React.FormEvent) => {
    e.preventDefault();
    setDropError('');
    setDropSuccess('');

    if (dropSumberRek === dropTujuanRek) {
      setDropError('Rekening sumber dan tujuan dropping tidak boleh sama!');
      return;
    }

    if (!dropNominal || dropNominal <= 0) {
      setDropError('Nominal dropping harus lebih dari Rp 0');
      return;
    }

    const sumberRek = rekeningList.find((r) => r.kode === dropSumberRek);
    if (!sumberRek || sumberRek.saldoSaatIni < dropNominal) {
      setDropError(
        `Saldo rekening sumber ${sumberRek ? sumberRek.nama : dropSumberRek} (${formatRupiah(
          sumberRek?.saldoSaatIni || 0
        )}) tidak mencukupi untuk dropping ${formatRupiah(dropNominal)}!`
      );
      return;
    }

    setDropSubmitting(true);
    try {
      await api.processTransferRekening({
        rekeningSumber: dropSumberRek,
        rekeningTujuan: dropTujuanRek,
        nominal: dropNominal,
        keterangan: dropKeterangan || 'Dropping kas operasional divisi',
      });

      setDropSuccess('Dropping kas ke rekening divisi berhasil dicatat!');
      await loadData();
      onRefreshAll?.();
      setTimeout(() => {
        setIsDropModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setDropError(err.message || 'Gagal memproses transfer dropping');
    } finally {
      setDropSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-zinc-900/90 border border-zinc-800 p-5 rounded-xl shadow-lg">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-100 flex items-center space-x-2">
                <span>Divisi Bisnis & Kas Operasional</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-700">
                  6 Unit Bisnis
                </span>
              </h1>
              <p className="text-xs text-zinc-400">
                Pencatatan rekening khusus per divisi, dropping kas masuk, mutasi real-time, dan beban upah harian karyawan
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => {
              setProfilDivisiInitialNama(undefined);
              setProfilDivisiModalOpen(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-emerald-700/70 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span>Logo &amp; Profil Divisi</span>
          </button>

          <button
            onClick={() => handleOpenDroppingModal('REK-GWA')}
            className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>+ Dropping Kas Pusat</span>
          </button>

          <button
            onClick={() => handleOpenInputPayrollHarian()}
            className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Input Payroll Harian</span>
          </button>

          {onOpenLabaRugiDivisi && (
            <button
              type="button"
              onClick={onOpenLabaRugiDivisi}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Laba &amp; Rugi Divisi</span>
            </button>
          )}

          {onNavigateToKaryawan && (
            <button
              onClick={onNavigateToKaryawan}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span>Ke Master Karyawan →</span>
            </button>
          )}
        </div>
      </div>

      {/* Integration Info Banner: Pembelian (Modal) vs Pengeluaran (Pengurang Saldo) */}
      <div className="bg-zinc-900/90 border border-emerald-900/80 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start space-x-2.5 text-zinc-300">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong className="text-white">Pemisahan Pembelian (Modal) vs Pengeluaran (Pengurang Saldo) di Semua Divisi:</strong>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
              <strong className="text-sky-300">Pembelian</strong> barang/beras/hasil bumi dihitung sebagai <strong>Modal Stok Berjalan</strong> (nilai divisi tetap utuh &amp; berpotensi kembali jadi uang + untung saat terjual), sedangkan{' '}
              <strong className="text-rose-300">Pengeluaran &amp; Gaji</strong> murni memotong langsung saldo berjalan dan laba bersih masing-masing divisi.
            </p>
          </div>
        </div>
        {onOpenLabaRugiDivisi ? (
          <button
            type="button"
            onClick={onOpenLabaRugiDivisi}
            className="text-emerald-400 hover:underline font-semibold shrink-0 text-xs flex items-center space-x-1 self-start sm:self-auto cursor-pointer"
          >
            <span>Lihat Laba &amp; Rugi Per Divisi</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : onNavigateToKaryawan ? (
          <button
            onClick={onNavigateToKaryawan}
            className="text-amber-400 hover:underline font-semibold shrink-0 text-xs flex items-center space-x-1 self-start sm:self-auto cursor-pointer"
          >
            <span>Buka Karyawan &amp; Payroll</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => setActiveMainTab('IKHTISAR_DIVISI')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeMainTab === 'IKHTISAR_DIVISI'
              ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/50 shadow-md ring-1 ring-emerald-500/20'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>6 Unit Divisi &amp; Kas Operasional</span>
        </button>

        <button
          onClick={() => setActiveMainTab('REKAP_BULANAN')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeMainTab === 'REKAP_BULANAN'
              ? 'bg-zinc-800 text-amber-400 border border-amber-500/50 shadow-md ring-1 ring-amber-500/20'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-amber-400" />
          <span>Tabel Rekapitulasi Bulanan (Gaji &amp; Bon)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('LOG_HARIAN')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeMainTab === 'LOG_HARIAN'
              ? 'bg-zinc-800 text-sky-400 border border-sky-500/50 shadow-md ring-1 ring-sky-500/20'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <History className="w-4 h-4 text-sky-400" />
          <span>Jurnal Log Payroll Harian ({allUpahHarian.length})</span>
        </button>
      </div>

      {activeMainTab === 'IKHTISAR_DIVISI' && (
        <>
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs min-w-0 overflow-hidden">
          <span className="text-xs text-zinc-400 block mb-1 truncate">
            Nilai &amp; Saldo Berjalan ({divisiData.length} Divisi)
          </span>
          <p
            className={`text-xl font-bold font-mono tabular-nums truncate whitespace-nowrap ${
              totalSaldoSemuaDivisi < 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
            title={formatRupiah(totalSaldoSemuaDivisi)}
          >
            {formatRupiahSingkat(totalSaldoSemuaDivisi)}
          </p>
          <span className="text-[11px] text-zinc-400 mt-1 font-mono tabular-nums block truncate">
            Kas Tunai: {formatRupiahSingkat(totalKasTunaiSemuaDivisi)} · Stok:{' '}
            {formatRupiahSingkat(totalSisaModalStokSemuaDivisi)}
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs min-w-0 overflow-hidden">
          <span className="text-xs text-zinc-400 block mb-1 truncate">
            Omzet Penjualan &amp; Dropping (+)
          </span>
          <p
            className="text-xl font-bold font-mono tabular-nums text-emerald-400 truncate whitespace-nowrap"
            title={formatRupiah(totalOmzetSemuaDivisi + totalDroppingSemuaDivisi)}
          >
            +{formatRupiahSingkat(totalOmzetSemuaDivisi + totalDroppingSemuaDivisi)}
          </p>
          <span className="text-[11px] text-zinc-400 mt-1 font-mono tabular-nums block truncate">
            Omzet: +{formatRupiahSingkat(totalOmzetSemuaDivisi)} · Drop: +{formatRupiahSingkat(totalDroppingSemuaDivisi)}
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs min-w-0 overflow-hidden">
          <span className="text-xs text-zinc-400 block mb-1 truncate">
            Modal Pembelian (Stok Dagang)
          </span>
          <p
            className="text-xl font-bold font-mono tabular-nums text-sky-400 truncate whitespace-nowrap"
            title={formatRupiah(totalModalPembelianSemuaDivisi)}
          >
            {formatRupiahSingkat(totalModalPembelianSemuaDivisi)}
          </p>
          <span className="text-[11px] text-sky-300/90 mt-1 block truncate">
            Modal berputar (berpotensi balik &amp; untung)
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs min-w-0 overflow-hidden">
          <span className="text-xs text-zinc-400 block mb-1 truncate">
            Pengeluaran &amp; Gaji (Pengurang −)
          </span>
          <p
            className="text-xl font-bold font-mono tabular-nums text-rose-400 truncate whitespace-nowrap"
            title={formatRupiah(totalBebanPengeluaranSemuaDivisi)}
          >
            -{formatRupiahSingkat(totalBebanPengeluaranSemuaDivisi)}
          </p>
          <span className="text-[11px] text-zinc-400 mt-1 font-mono tabular-nums block truncate">
            Laba/Rugi Bersih:{' '}
            <strong className={totalLabaRugiBersihSemuaDivisi >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {totalLabaRugiBersihSemuaDivisi >= 0 ? '+' : ''}
              {formatRupiahSingkat(totalLabaRugiBersihSemuaDivisi)}
            </strong>
          </span>
        </div>
      </div>

      {/* Grid of 6 Divisions Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {divisiData.map((d) => {
          const info = DAFTAR_DIVISI.find((item) => item.nama === d.divisi);
          const isSelected = selectedDivisi?.divisi === d.divisi;

          return (
            <div
              key={d.idDivisi}
              className={`bg-zinc-900 border transition-all duration-200 rounded-xl min-w-0 overflow-hidden shadow-md flex flex-col justify-between ${
                isSelected
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-950/20'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Card Header */}
              <div className="p-4 border-b border-zinc-800/80 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="flex items-center space-x-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setProfilDivisiInitialNama(d.divisi);
                        setProfilDivisiModalOpen(true);
                      }}
                      title={`Pasang atau ubah logo & profil divisi ${d.divisi}`}
                      className="relative group/logo shrink-0 cursor-pointer"
                    >
                      <DivisiLogoAvatar
                        namaDivisi={d.divisi}
                        logoUrl={d.logoUrl}
                        size="md"
                        theme="dark"
                      />
                    </button>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-zinc-100 truncate">{d.divisi}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border inline-block mt-0.5 ${getDivisiBadgeColor(d.divisi)}`}>
                        {d.kodeRekening}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfilDivisiInitialNama(d.divisi);
                      setProfilDivisiModalOpen(true);
                    }}
                    className="text-[10px] bg-zinc-800 hover:bg-emerald-950 text-zinc-200 hover:text-emerald-300 px-2 py-1 rounded-lg border border-zinc-700 hover:border-emerald-700 font-semibold flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    title={`Pasang / ubah logo & profil ${d.divisi}`}
                  >
                    <ImageIcon className="w-3 h-3 text-emerald-400" />
                    <span>{d.logoUrl ? 'Ubah Logo' : '+ Logo'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400 mt-2.5 line-clamp-2">
                  {d.deskripsi || info?.deskripsi || 'Unit operasional PT Wijaya Agro'}
                </p>
                <div className="text-[10px] text-zinc-500 mt-1 flex items-center space-x-1 truncate">
                  <span className="font-medium text-zinc-400 shrink-0">PJ:</span>
                  <span className="truncate">{d.penanggungJawab || info?.penanggungJawab || '-'}</span>
                </div>
              </div>

              {/* Financial Stats */}
              <div className="p-4 bg-zinc-950/40 space-y-2 text-xs min-w-0">
                <div className="pb-2 border-b border-zinc-800/60 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="text-zinc-300 font-medium shrink-0">Nilai &amp; Saldo Divisi:</span>
                    <span
                      className={`font-mono tabular-nums font-bold text-sm truncate whitespace-nowrap ${
                        d.saldoSaatIni < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                      title={formatRupiah(d.saldoSaatIni)}
                    >
                      {formatRupiahSingkat(d.saldoSaatIni)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 font-mono tabular-nums mt-0.5">
                    <span>Kas Tunai: {formatRupiahSingkat(d.saldoKasTunaiDivisi ?? d.saldoSaatIni)}</span>
                    <span>Stok Aktif: {formatRupiahSingkat(d.sisaModalStokBerjalan || 0)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                  <span className="text-zinc-400 shrink-0">Uang Masuk (+):</span>
                  <span
                    className="font-mono tabular-nums font-bold text-emerald-400 truncate whitespace-nowrap"
                    title={`+${formatRupiah(d.totalPenjualanMasuk ?? 0)}`}
                  >
                    +{formatRupiahSingkat(d.totalPenjualanMasuk ?? 0)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                  <span className="text-rose-300/90 shrink-0">Uang Keluar (−):</span>
                  <span
                    className="font-mono tabular-nums font-semibold text-rose-400 truncate whitespace-nowrap"
                    title={`-${formatRupiah(
                      (d.totalPembelianKeluar || 0) +
                        (d.totalPengeluaranOperasional || 0) +
                        (d.totalGajiKeluar || 0)
                    )}`}
                  >
                    -
                    {formatRupiahSingkat(
                      (d.totalPembelianKeluar || 0) +
                        (d.totalPengeluaranOperasional || 0) +
                        (d.totalGajiKeluar || 0)
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                  <span className="text-zinc-400 shrink-0">Dropping Kas Masuk (+):</span>
                  <span
                    className="font-mono tabular-nums font-medium text-cyan-400 truncate whitespace-nowrap"
                    title={`+${formatRupiah(d.totalDroppingMasuk)}`}
                  >
                    +{formatRupiahSingkat(d.totalDroppingMasuk)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px] pt-1.5 border-t border-zinc-800/60">
                  <span className="text-zinc-300 font-medium">Laba / Rugi Divisi:</span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      (d.labaRugiBersih ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                    title={`Uang Masuk − Uang Keluar = ${formatRupiah(d.labaRugiBersih || 0)}`}
                  >
                    {(d.labaRugiBersih ?? 0) >= 0 ? '+' : ''}
                    {formatRupiahSingkat(d.labaRugiBersih || 0)}
                  </span>
                </div>

                {d.daftarKaryawanTerakhir && d.daftarKaryawanTerakhir.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800/60">
                    <span className="text-[10px] text-zinc-500 block mb-1">Pekerja Baru-baru Ini:</span>
                    <div className="flex flex-wrap gap-1">
                      {d.daftarKaryawanTerakhir.map((nama, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700 truncate max-w-[120px]"
                        >
                          {nama}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-3 bg-zinc-900 border-t border-zinc-800 grid grid-cols-3 gap-2">
                <button
                  onClick={() => setSelectedDivisi(d)}
                  className={`flex items-center justify-center space-x-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors ${
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                  title="Lihat Mutasi Kas Divisi"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Mutasi</span>
                </button>

                <button
                  onClick={() => handleOpenInputPayrollHarian(undefined, d.divisi)}
                  className="flex items-center justify-center space-x-1 py-1.5 px-2 rounded text-[11px] font-bold bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 transition-colors cursor-pointer"
                  title="Input Payroll Harian di Divisi Ini"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Payroll</span>
                </button>

                <button
                  onClick={() => handleOpenDroppingModal(d.kodeRekening)}
                  className="flex items-center justify-center space-x-1 py-1.5 px-2 rounded text-[11px] font-medium bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 transition-colors"
                  title="Dropping Kas ke Rekening Divisi Ini"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  <span>+ Drop</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Pergerakan Keuangan Divisi Terpilih */}
      {selectedDivisi && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl animate-in fade-in duration-200">
          <div className="p-4 bg-zinc-800/90 border-b border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <DivisiLogoAvatar
                namaDivisi={selectedDivisi.divisi}
                logoUrl={selectedDivisi.logoUrl}
                size="md"
                theme="dark"
              />
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm text-zinc-100">
                    Jurnal Mutasi Keuangan: {selectedDivisi.divisi}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getDivisiBadgeColor(selectedDivisi.divisi)}`}>
                    {selectedDivisi.kodeRekening}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 font-mono tabular-nums">
                  {selectedDivisi.namaRekening} | Nilai Saldo:{' '}
                  <span className="font-bold text-emerald-400">
                    {formatRupiah(selectedDivisi.saldoSaatIni)}
                  </span>{' '}
                  · Kas Tunai:{' '}
                  <span className="text-zinc-200">
                    {formatRupiah(selectedDivisi.saldoKasTunaiDivisi ?? selectedDivisi.saldoSaatIni)}
                  </span>{' '}
                  · Laba/Rugi:{' '}
                  <span
                    className={`font-bold ${
                      (selectedDivisi.labaRugiBersih ?? 0) >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {(selectedDivisi.labaRugiBersih ?? 0) >= 0 ? '+' : ''}
                    {formatRupiah(selectedDivisi.labaRugiBersih || 0)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => handleOpenInputPayrollHarian(undefined, selectedDivisi.divisi)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold shadow-xs transition-colors cursor-pointer"
                title="Input payroll harian karyawan di divisi ini"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Input Payroll Divisi Ini</span>
              </button>

              <button
                onClick={() => {
                  try {
                    window.print();
                  } catch (e) {
                    console.error(e);
                  }
                }}
                className="flex items-center space-x-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Rekap</span>
              </button>

              <button
                onClick={() => setSelectedDivisi(null)}
                className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari item beras/komoditas, mitra, nota..."
                value={mutasiSearch}
                onChange={(e) => setMutasiSearch(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setMutasiFilterJenis('ALL')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  mutasiFilterJenis === 'ALL'
                    ? 'bg-zinc-700 text-white font-semibold'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Semua ({selectedDivisi.mutasi.length})
              </button>
              <button
                onClick={() => setMutasiFilterJenis('PENJUALAN_MASUK')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  mutasiFilterJenis === 'PENJUALAN_MASUK'
                    ? 'bg-emerald-900/80 text-emerald-200 font-semibold border border-emerald-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Penjualan (+)
              </button>
              <button
                onClick={() => setMutasiFilterJenis('PEMBELIAN_KELUAR')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  mutasiFilterJenis === 'PEMBELIAN_KELUAR'
                    ? 'bg-sky-900/80 text-sky-200 font-semibold border border-sky-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Modal Pembelian (Stok)
              </button>
              <button
                onClick={() => setMutasiFilterJenis('DROPPING_MASUK')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  mutasiFilterJenis === 'DROPPING_MASUK'
                    ? 'bg-cyan-900/80 text-cyan-200 font-semibold border border-cyan-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Dropping (+)
              </button>
              <button
                onClick={() => setMutasiFilterJenis('PENGELUARAN_OPERASIONAL')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  mutasiFilterJenis === 'PENGELUARAN_OPERASIONAL'
                    ? 'bg-rose-900/80 text-rose-200 font-semibold border border-rose-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Pengeluaran (−Saldo)
              </button>
              <button
                onClick={() => setMutasiFilterJenis('GAJI_KARYAWAN')}
                className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                  mutasiFilterJenis === 'GAJI_KARYAWAN'
                    ? 'bg-amber-900/80 text-amber-200 font-semibold border border-amber-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Upah (−Saldo)
              </button>
            </div>
          </div>

          {/* Table of Mutations */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 sticky top-0 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Tanggal &amp; Jam</th>
                  <th className="py-2.5 px-3">Jenis Arus Kas</th>
                  <th className="py-2.5 px-3">Keterangan &amp; Nota</th>
                  <th className="py-2.5 px-3">Mitra / Pekerja</th>
                  <th className="py-2.5 px-3">Rek Fisik</th>
                  <th className="py-2.5 px-3 text-right">Arus Masuk (+)</th>
                  <th className="py-2.5 px-3 text-right">Arus Keluar (-)</th>
                  <th className="py-2.5 px-3 text-right">Saldo Divisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                {selectedDivisi.mutasi
                  .filter((m) => {
                    if (mutasiFilterJenis !== 'ALL' && m.jenis !== mutasiFilterJenis) return false;
                    if (mutasiSearch) {
                      const q = mutasiSearch.toLowerCase();
                      return (
                        m.keterangan.toLowerCase().includes(q) ||
                        m.refId.toLowerCase().includes(q) ||
                        (m.pihakTerkait && m.pihakTerkait.toLowerCase().includes(q)) ||
                        (m.karyawanTerkait && m.karyawanTerkait.toLowerCase().includes(q))
                      );
                    }
                    return true;
                  })
                  .map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/40">
                      <td className="py-2.5 px-3 text-zinc-400 whitespace-nowrap">
                        {m.tanggal} <span className="text-[10px] text-zinc-500">pk {m.jam}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {m.jenis === 'PENJUALAN_MASUK' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-semibold">
                            Penjualan Masuk
                          </span>
                        )}
                        {m.jenis === 'PEMBELIAN_KELUAR' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-semibold">
                            Modal Pembelian (Stok)
                          </span>
                        )}
                        {m.jenis === 'PENGELUARAN_OPERASIONAL' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-semibold">
                            Pengeluaran (−Saldo)
                          </span>
                        )}
                        {m.jenis === 'DROPPING_MASUK' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            Dropping Masuk
                          </span>
                        )}
                        {m.jenis === 'GAJI_KARYAWAN' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            Upah Karyawan (−Saldo)
                          </span>
                        )}
                        {m.jenis === 'TRANSFER_KELUAR' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                            Transfer Keluar
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs font-sans text-zinc-200">
                        <div className="truncate" title={m.keterangan}>
                          {m.keterangan}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500">Ref: {m.refId}</span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-zinc-300 whitespace-nowrap">
                        {m.pihakTerkait || m.karyawanTerkait || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-300 whitespace-nowrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                          {m.rekeningFisik || '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                        {m.masuk > 0 ? `+${formatRupiah(m.masuk)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-400 whitespace-nowrap">
                        {m.keluar > 0 ? `-${formatRupiah(m.keluar)}` : '-'}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                          m.saldoSetelah < 0 ? 'text-rose-400' : 'text-amber-300'
                        }`}
                      >
                        {formatRupiah(m.saldoSetelah)}
                      </td>
                    </tr>
                  ))}

                {selectedDivisi.mutasi.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans">
                      Belum ada mutasi arus kas untuk divisi ini. Lakukan Penjualan / Pembelian dengan memilih divisi ini, atau klik Dropping Kas / Input Payroll.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      {/* TAB 2: REKAPITULASI PAYROLL & BON BULANAN */}
      {activeMainTab === 'REKAP_BULANAN' && (
        <RekapitulasiPayrollBulananTable
          rekeningList={rekeningList}
          onOpenInputPayrollHarian={handleOpenInputPayrollHarian}
          onRefreshAll={() => {
            loadData();
            loadUpahHarian();
            onRefreshAll?.();
          }}
        />
      )}

      {/* TAB 3: JURNAL LOG PAYROLL HARIAN */}
      {activeMainTab === 'LOG_HARIAN' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl space-y-3 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
            <div>
              <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                <History className="w-4 h-4 text-sky-400" />
                <span>Jurnal Log Payroll &amp; Tugas Harian Karyawan</span>
              </h3>
              <p className="text-[11px] text-zinc-400">
                Daftar seluruh input harian penugasan per divisi, uraian pekerjaan, nominal upah, dan status pencairan
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleOpenInputPayrollHarian()}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Input Payroll Baru</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5 text-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Cari karyawan, uraian tugas, atau divisi..."
                value={logHarianSearch}
                onChange={(e) => setLogHarianSearch(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-sky-500 text-xs"
              />
            </div>

            <select
              value={logHarianFilterDivisi}
              onChange={(e) => setLogHarianFilterDivisi(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 text-xs font-semibold focus:outline-hidden focus:border-sky-500 w-full sm:w-auto"
            >
              <option value="ALL">Semua Divisi</option>
              {DAFTAR_DIVISI.map((d) => (
                <option key={d.id} value={d.nama}>
                  {d.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-950 text-zinc-400 uppercase text-[10px] border-b border-zinc-800 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Karyawan</th>
                  <th className="py-2.5 px-3">Divisi Penugasan</th>
                  <th className="py-2.5 px-3">Hari Ini Kerja Untuk Apa</th>
                  <th className="py-2.5 px-3 text-right">Upah Pokok</th>
                  <th className="py-2.5 px-3 text-right">Lembur/Makan</th>
                  <th className="py-2.5 px-3 text-right">Total Upah</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans text-xs">
                {loadingUpahHarian ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-zinc-400">
                      Memuat jurnal upah harian...
                    </td>
                  </tr>
                ) : allUpahHarian.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-zinc-500 font-sans">
                      Belum ada catatan upah harian. Klik "+ Input Payroll Baru" untuk memulai.
                    </td>
                  </tr>
                ) : (
                  allUpahHarian
                    .filter((u) => {
                      if (logHarianFilterDivisi !== 'ALL' && u.divisi !== logHarianFilterDivisi) return false;
                      if (logHarianSearch) {
                        const q = logHarianSearch.toLowerCase();
                        return (
                          u.namaKaryawan.toLowerCase().includes(q) ||
                          u.nikKaryawan.toLowerCase().includes(q) ||
                          u.divisi.toLowerCase().includes(q) ||
                          (u.keterangan && u.keterangan.toLowerCase().includes(q))
                        );
                      }
                      return true;
                    })
                    .map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-zinc-300 whitespace-nowrap">
                          {log.tanggalKerja}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-zinc-100">{log.namaKaryawan}</div>
                          <span className="text-[10px] text-zinc-400">{log.jabatan}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <DivisiLogoAvatar
                              namaDivisi={log.divisi}
                              logoUrl={resolveDivisiLogoUrl(log.divisi, undefined, divisiData)}
                              size="xs"
                              theme="dark"
                            />
                            <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getDivisiBadgeColor(log.divisi)}`}>
                              {log.divisi}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-200">
                          {log.keterangan || `Tugas di ${log.divisi}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-400">
                          {formatRupiah(log.upahHarian)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-zinc-500">
                          {log.uangMakanLembur > 0 ? `+${formatRupiah(log.uangMakanLembur)}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                          {formatRupiah(log.totalUpahHarian)}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {log.status === 'SUDAH_DIBAYAR' ? (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                              SUDAH CAIR
                            </span>
                          ) : (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                              TERCATAT (PENDING)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dropping Modal */}
      {isDropModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col">
            <div className="p-4 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
                <h2 className="font-bold text-sm text-zinc-100">
                  Dropping Kas Operasional ke Rekening Divisi
                </h2>
              </div>
              <button
                onClick={() => setIsDropModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteDropping} className="p-5 space-y-4 text-xs">
              {dropError && (
                <div className="p-3 bg-rose-950/80 border border-rose-700 text-rose-300 rounded-lg flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{dropError}</span>
                </div>
              )}

              {dropSuccess && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded-lg flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{dropSuccess}</span>
                </div>
              )}

              {/* Rekening Sumber */}
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Rekening Sumber Riil (Rekening Perusahaan):
                </label>
                <select
                  value={dropSumberRek}
                  onChange={(e) => setDropSumberRek(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-semibold focus:outline-hidden focus:border-emerald-500"
                >
                  {rekeningList
                    .filter((r) => r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode.startsWith('REK-')))
                    .map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({r.kode}) - Saldo Fisik: {formatRupiah(r.saldoSaatIni)}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-zinc-500 mt-1">
                  *Dana riil ditarik dari Rekening Perusahaan ini untuk dialokasikan ke buku pergerakan operasional divisi.
                </p>
              </div>

              {/* Rekening Tujuan Divisi */}
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Rekening Tujuan (Kas Khusus Divisi):
                </label>
                <select
                  value={dropTujuanRek}
                  onChange={(e) => setDropTujuanRek(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-emerald-300 font-semibold focus:outline-hidden focus:border-emerald-500"
                >
                  {DAFTAR_DIVISI.map((d) => {
                    const rek = rekeningList.find((r) => r.kode === d.kodeRekening);
                    return (
                      <option key={d.id} value={d.kodeRekening}>
                        {d.nama} [{d.kodeRekening}] - Saldo Saat Ini: {formatRupiah(rek?.saldoSaatIni || 0)}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Nominal Dropping */}
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Nominal Dropping Dana (Rp):
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={dropNominal || ''}
                  onChange={(e) => setDropNominal(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 text-base font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                  placeholder="Contoh: 5000000"
                  required
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[2000000, 5000000, 10000000, 20000000].map((nom) => (
                    <button
                      key={nom}
                      type="button"
                      onClick={() => setDropNominal(nom)}
                      className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                        dropNominal === nom
                          ? 'bg-emerald-900 text-emerald-200 border-emerald-600 font-bold'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      +{formatRupiah(nom)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-zinc-400 font-medium mb-1">
                  Keterangan / Catatan Dropping:
                </label>
                <input
                  type="text"
                  value={dropKeterangan}
                  onChange={(e) => setDropKeterangan(e.target.value)}
                  placeholder="e.g. Dropping operasional gudang gabah & upah harian sortasi"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-zinc-800 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsDropModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={dropSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-md transition-colors flex items-center space-x-1.5"
                >
                  {dropSubmitting ? (
                    <span>Memproses...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Kirim Dropping Kas</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Input Payroll Harian Divisi Modal */}
      {isPayrollHarianModalOpen && (
        <InputPayrollHarianDivisiModal
          karyawanList={internalKaryawanList}
          initialDivisi={payrollDivisiPreset}
          initialKaryawanId={payrollKaryawanIdPreset}
          rekeningList={rekeningList}
          onClose={() => setIsPayrollHarianModalOpen(false)}
          onSuccess={handlePayrollHarianSuccess}
        />
      )}

      {/* Internal Gaji Modal */}
      {isGajiModalOpen && (
        <ProsesGajiModal
          karyawan={selectedKaryawanForGaji}
          allKaryawan={internalKaryawanList}
          rekeningList={rekeningList}
          initialDivisi={selectedDivisiForGaji}
          onClose={() => setIsGajiModalOpen(false)}
          onSuccess={handlePayrollSuccess}
        />
      )}

      {/* Slip Gaji Modal */}
      {activeSlip && (
        <SlipGajiModal slip={activeSlip} onClose={() => setActiveSlip(null)} />
      )}

      {/* Modal Profil & Logo Masing-Masing Divisi */}
      <ModalProfilDivisi
        isOpen={profilDivisiModalOpen}
        initialDivisiNama={profilDivisiInitialNama}
        onClose={() => setProfilDivisiModalOpen(false)}
        onSaved={() => {
          void loadData(true);
          onRefreshAll?.();
        }}
      />
    </div>
  );
};
