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
} from 'lucide-react';
import { api, KaryawanWithBon } from '../../api/client.ts';
import {
  DAFTAR_DIVISI,
  NamaDivisi,
  PergerakanKeuanganDivisiSummary,
  Rekening,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { ProsesGajiModal } from './ProsesGajiModal.tsx';
import { SlipGajiModal } from './SlipGajiModal.tsx';

interface DivisiKeuanganViewProps {
  rekeningList: Rekening[];
  karyawanList?: KaryawanWithBon[];
  onOpenGajiModal?: (karyawan: KaryawanWithBon | null, divisiPreset?: NamaDivisi) => void;
  onNavigateToKaryawan?: () => void;
  onRefreshAll?: () => void;
}

export const DivisiKeuanganView: React.FC<DivisiKeuanganViewProps> = ({
  rekeningList,
  karyawanList,
  onOpenGajiModal,
  onNavigateToKaryawan,
  onRefreshAll,
}) => {
  const [divisiData, setDivisiData] = useState<PergerakanKeuanganDivisiSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDivisi, setSelectedDivisi] = useState<PergerakanKeuanganDivisiSummary | null>(null);

  // Karyawan & Gaji internal integration
  const [internalKaryawanList, setInternalKaryawanList] = useState<KaryawanWithBon[]>(karyawanList || []);
  const [isGajiModalOpen, setIsGajiModalOpen] = useState(false);
  const [selectedDivisiForGaji, setSelectedDivisiForGaji] = useState<NamaDivisi | undefined>(undefined);
  const [selectedKaryawanForGaji, setSelectedKaryawanForGaji] = useState<KaryawanWithBon | null>(null);
  const [activeSlip, setActiveSlip] = useState<TransaksiPenggajian | null>(null);

  useEffect(() => {
    if (karyawanList && karyawanList.length > 0) {
      setInternalKaryawanList(karyawanList);
    } else {
      api.getKaryawan().then((list) => setInternalKaryawanList(list)).catch(console.error);
    }
  }, [karyawanList]);

  const handleOpenGaji = (karyawan: KaryawanWithBon | null, divisiPreset?: NamaDivisi) => {
    if (onOpenGajiModal) {
      onOpenGajiModal(karyawan, divisiPreset);
    } else {
      setSelectedKaryawanForGaji(karyawan || internalKaryawanList.find((k) => k.status === 'AKTIF') || null);
      setSelectedDivisiForGaji(divisiPreset);
      setIsGajiModalOpen(true);
    }
  };

  const handlePayrollSuccess = (slip: TransaksiPenggajian) => {
    setIsGajiModalOpen(false);
    setActiveSlip(slip);
    loadData();
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
  const [mutasiFilterJenis, setMutasiFilterJenis] = useState<'ALL' | 'DROPPING_MASUK' | 'GAJI_KARYAWAN' | 'TRANSFER_KELUAR'>('ALL');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.getDivisiKeuangan();
      setDivisiData(data);
      if (selectedDivisi) {
        const updated = data.find((d) => d.divisi === selectedDivisi.divisi);
        if (updated) setSelectedDivisi(updated);
      }
    } catch (err) {
      console.error('Failed to load divisi keuangan:', err);
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

  // Totals across all divisions
  const totalSaldoSemuaDivisi = divisiData.reduce((sum, d) => sum + (d.saldoSaatIni || 0), 0);
  const totalDroppingSemuaDivisi = divisiData.reduce((sum, d) => sum + (d.totalDroppingMasuk || 0), 0);
  const totalGajiSemuaDivisi = divisiData.reduce((sum, d) => sum + (d.totalGajiKeluar || 0), 0);
  const totalTransaksiSemuaDivisi = divisiData.reduce((sum, d) => sum + (d.totalTransaksiGaji || 0), 0);

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
            onClick={() => handleOpenDroppingModal('REK-GWA')}
            className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition-colors"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>+ Dropping Kas Pusat</span>
          </button>

          <button
            onClick={() => handleOpenGaji(null)}
            className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-md transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Input Upah Harian</span>
          </button>

          {onNavigateToKaryawan && (
            <button
              onClick={onNavigateToKaryawan}
              className="flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors"
            >
              <Users className="w-4 h-4 text-sky-400" />
              <span>Ke Master Karyawan →</span>
            </button>
          )}
        </div>
      </div>

      {/* Integration Info Banner */}
      <div className="bg-zinc-900/70 border border-zinc-800 px-4 py-2.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-2 text-zinc-300">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Sistem Terintegrasi:</strong> Pembayaran upah di divisi manapun akan otomatis mengurangi saldo kas rekening divisi ini dan memotong kasbon aktif karyawan terkait.
          </span>
        </div>
        {onNavigateToKaryawan && (
          <button
            onClick={onNavigateToKaryawan}
            className="text-amber-400 hover:underline font-semibold shrink-0 text-xs flex items-center space-x-1 self-start sm:self-auto"
          >
            <span>Buka Karyawan & Payroll</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-zinc-400 block mb-1">Total Saldo Kas 6 Divisi</span>
          <p className="text-xl font-bold font-mono text-emerald-400">
            {formatRupiah(totalSaldoSemuaDivisi)}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 inline" />
            <span>Tersedia di rekening divisi</span>
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-zinc-400 block mb-1">Total Dropping Masuk</span>
          <p className="text-xl font-bold font-mono text-cyan-400">
            {formatRupiah(totalDroppingSemuaDivisi)}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
            <TrendingUp className="w-3.5 h-3.5 text-cyan-500 inline" />
            <span>Suntikan dana dari Kas Pusat</span>
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-zinc-400 block mb-1">Total Biaya Upah/Gaji Divisi</span>
          <p className="text-xl font-bold font-mono text-amber-400">
            {formatRupiah(totalGajiSemuaDivisi)}
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
            <TrendingDown className="w-3.5 h-3.5 text-amber-500 inline" />
            <span>Akumulasi upah terbayarkan</span>
          </span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-zinc-400 block mb-1">Total Transaksi Upah Divisi</span>
          <p className="text-xl font-bold font-mono text-zinc-100">
            {totalTransaksiSemuaDivisi} <span className="text-xs text-zinc-400 font-normal">Slip Upah</span>
          </p>
          <span className="text-[11px] text-zinc-500 mt-1 flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-indigo-400 inline" />
            <span>Penugasan kerja karyawan</span>
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
              className={`bg-zinc-900 border transition-all duration-200 rounded-xl overflow-hidden shadow-md flex flex-col justify-between ${
                isSelected
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-950/20'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {/* Card Header */}
              <div className="p-4 border-b border-zinc-800/80">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-lg bg-zinc-800 border border-zinc-700">
                      {getDivisiIcon(d.divisi)}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-zinc-100">{d.divisi}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border inline-block mt-0.5 ${getDivisiBadgeColor(d.divisi)}`}>
                        {d.kodeRekening}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-mono">
                    AKTIF
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 mt-2.5 line-clamp-2">
                  {info?.deskripsi || 'Unit operasional PT Wijaya Agro'}
                </p>
                <div className="text-[10px] text-zinc-500 mt-1 flex items-center space-x-1">
                  <span className="font-medium text-zinc-400">PJ:</span>
                  <span>{info?.penanggungJawab || '-'}</span>
                </div>
              </div>

              {/* Financial Stats */}
              <div className="p-4 bg-zinc-950/40 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <span className="text-zinc-400">Saldo Kas Rekening:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatRupiah(d.saldoSaatIni)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Dropping Masuk:</span>
                  <span className="font-mono font-medium text-cyan-400">
                    +{formatRupiah(d.totalDroppingMasuk)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Total Biaya Upah:</span>
                  <span className="font-mono font-medium text-rose-400">
                    -{formatRupiah(d.totalGajiKeluar)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-zinc-400">Riwayat Penugasan:</span>
                  <span className="font-semibold text-zinc-300">
                    {d.totalTransaksiGaji} Hari Kerja
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
                  onClick={() => handleOpenGaji(null, d.divisi)}
                  className="flex items-center justify-center space-x-1 py-1.5 px-2 rounded text-[11px] font-medium bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/80 transition-colors"
                  title="Input Upah Harian di Divisi Ini"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Upah</span>
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
              <div className="p-2 bg-emerald-950 border border-emerald-700 rounded-lg text-emerald-400">
                {getDivisiIcon(selectedDivisi.divisi)}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm text-zinc-100">
                    Jurnal Mutasi Keuangan: {selectedDivisi.divisi}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getDivisiBadgeColor(selectedDivisi.divisi)}`}>
                    {selectedDivisi.kodeRekening}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {selectedDivisi.namaRekening} | Saldo Saat Ini:{' '}
                  <span className="font-bold font-mono text-emerald-400">
                    {formatRupiah(selectedDivisi.saldoSaatIni)}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => handleOpenGaji(null, selectedDivisi.divisi)}
                className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-bold shadow-xs transition-colors"
                title="Input upah karyawan di divisi ini"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Input Upah Divisi Ini</span>
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
          <div className="p-3 bg-zinc-900 border-b border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari transaksi, karyawan, nomor ref..."
                value={mutasiSearch}
                onChange={(e) => setMutasiSearch(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded pl-8 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setMutasiFilterJenis('ALL')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  mutasiFilterJenis === 'ALL'
                    ? 'bg-zinc-700 text-white font-semibold'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Semua ({selectedDivisi.mutasi.length})
              </button>
              <button
                onClick={() => setMutasiFilterJenis('DROPPING_MASUK')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  mutasiFilterJenis === 'DROPPING_MASUK'
                    ? 'bg-cyan-900/80 text-cyan-200 font-semibold border border-cyan-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Dropping Kas
              </button>
              <button
                onClick={() => setMutasiFilterJenis('GAJI_KARYAWAN')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  mutasiFilterJenis === 'GAJI_KARYAWAN'
                    ? 'bg-amber-900/80 text-amber-200 font-semibold border border-amber-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Upah Karyawan
              </button>
              <button
                onClick={() => setMutasiFilterJenis('TRANSFER_KELUAR')}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  mutasiFilterJenis === 'TRANSFER_KELUAR'
                    ? 'bg-rose-900/80 text-rose-200 font-semibold border border-rose-700'
                    : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Transfer Keluar
              </button>
            </div>
          </div>

          {/* Table of Mutations */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 border-b border-zinc-800 sticky top-0 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Tanggal & Jam</th>
                  <th className="py-2.5 px-3">Jenis Mutasi</th>
                  <th className="py-2.5 px-3">Keterangan & Referensi</th>
                  <th className="py-2.5 px-3">Pekerja</th>
                  <th className="py-2.5 px-3 text-right">Kas Masuk (Dropping)</th>
                  <th className="py-2.5 px-3 text-right">Kas Keluar (Upah/Trf)</th>
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
                        {m.jenis === 'DROPPING_MASUK' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            Dropping Masuk
                          </span>
                        )}
                        {m.jenis === 'GAJI_KARYAWAN' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                            Upah Karyawan
                          </span>
                        )}
                        {m.jenis === 'TRANSFER_KELUAR' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                            Transfer Keluar
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 max-w-xs font-sans text-zinc-200">
                        <div className="truncate">{m.keterangan}</div>
                        <span className="text-[10px] font-mono text-zinc-500">Ref: {m.refId}</span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-zinc-300 whitespace-nowrap">
                        {m.karyawanTerkait || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-cyan-400 whitespace-nowrap">
                        {m.masuk > 0 ? `+${formatRupiah(m.masuk)}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-rose-400 whitespace-nowrap">
                        {m.keluar > 0 ? `-${formatRupiah(m.keluar)}` : '-'}
                      </td>
                    </tr>
                  ))}

                {selectedDivisi.mutasi.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans">
                      Belum ada mutasi keuangan untuk divisi ini. Klik tombol Dropping Kas atau Input Upah untuk memulai transaksi.
                    </td>
                  </tr>
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
                  Rekening Sumber (Penyedia Dana Kas Pusat / Bank):
                </label>
                <select
                  value={dropSumberRek}
                  onChange={(e) => setDropSumberRek(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-semibold focus:outline-hidden focus:border-emerald-500"
                >
                  {rekeningList
                    .filter((r) => !r.isVirtual && !r.kode.startsWith('REK-'))
                    .map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({r.kode}) - Saldo: {formatRupiah(r.saldoSaatIni)}
                      </option>
                    ))}
                </select>
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
                  step="50000"
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
    </div>
  );
};
