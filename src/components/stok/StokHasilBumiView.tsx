import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Wheat,
  History,
  Scale,
  Truck,
  Warehouse,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Download,
  Printer,
  Trash2,
  AlertCircle,
  Pencil,
  Plus,
} from 'lucide-react';
import {
  Mitra,
  Rekening,
  RingkasanStokHasilBumiBulananResponse,
  StokHasilBumi,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import {
  formatRupiah,
  formatRupiahSingkat,
  formatTanggalIndo,
} from '../../utils/format.ts';
import { ModalInputStokAwalHasilBumi } from './ModalInputStokAwalHasilBumi.tsx';
import { ModalJualHasilBumi } from './ModalJualHasilBumi.tsx';
import { ModalTambahHasilBumi } from './ModalTambahHasilBumi.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';

interface Props {
  stokList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  penjualanHasilBumiList?: TransaksiPenjualanHasilBumi[];
  mitraList?: Mitra[];
  rekeningList?: Rekening[];
  onRefresh: () => void;
  onPrintReceipt?: (receipt: ReceiptData) => void;
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

function isPhysicalPurchase(p: TransaksiPembelianHasilBumi): boolean {
  if (!p) return false;
  if (p.komoditasKode === 'PINJAMAN_DANA' || p.komoditasKode === 'TITIP_DANA') return false;
  if (p.komoditasNama && p.komoditasNama.toLowerCase().includes('pinjaman uang')) return false;
  return (Number(p.beratBersih) || 0) > 0;
}

function formatKgSingkat(kg: number): string {
  const val = Number(kg) || 0;
  if (Math.abs(val) >= 1000) {
    return `${(val / 1000).toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} Ton (${val.toLocaleString('id-ID')} Kg)`;
  }
  return `${val.toLocaleString('id-ID', { maximumFractionDigits: 2 })} Kg`;
}

export const StokHasilBumiView: React.FC<Props> = ({
  stokList,
  pembelianList,
  penjualanHasilBumiList = [],
  mitraList = [],
  rekeningList = [],
  onRefresh,
  onPrintReceipt,
}) => {
  const activeStokList = useMemo(
    () =>
      stokList.filter(
        (h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN')
      ),
    [stokList]
  );

  const physicalPembelianList = useMemo(
    () => pembelianList.filter((p) => isPhysicalPurchase(p)),
    [pembelianList]
  );

  const now = new Date();
  const [bulan, setBulan] = useState<number>(now.getMonth() + 1);
  const [tahun, setTahun] = useState<number>(now.getFullYear());
  const [kodeKomoditasFilter, setKodeKomoditasFilter] = useState<string>('ALL');
  const [modeTabelRingkasan, setModeTabelRingkasan] = useState<'PER_KOMODITAS' | 'PER_BULAN'>(
    'PER_KOMODITAS'
  );
  const [ringkasan, setRingkasan] = useState<RingkasanStokHasilBumiBulananResponse | null>(null);
  const [loadingRingkasan, setLoadingRingkasan] = useState<boolean>(true);

  const [showSaldoAwalModal, setShowSaldoAwalModal] = useState<boolean>(false);
  const [selectedModalKode, setSelectedModalKode] = useState<string | undefined>(undefined);
  const [showTambahBarangModal, setShowTambahBarangModal] = useState<boolean>(false);

  const [showJualModal, setShowJualModal] = useState<boolean>(false);
  const [jualInitialKode, setJualInitialKode] = useState<string | undefined>(undefined);

  const [activeHistoryTab, setActiveHistoryTab] = useState<'PENJUALAN' | 'PEMBELIAN'>('PENJUALAN');
  const [confirmVoidNo, setConfirmVoidNo] = useState<string | null>(null);
  const [voidLoading, setVoidLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');
  const [editTxTarget, setEditTxTarget] = useState<{ id: string; jenis: string } | null>(null);

  const loadRingkasan = useCallback(async (silent = false) => {
    if (!silent) {
      setRingkasan((prev) => {
        if (!prev) setLoadingRingkasan(true);
        return prev;
      });
    }
    try {
      const res = await api.getRingkasanHasilBumiBulanan({
        bulan,
        tahun,
        kodeKomoditas: kodeKomoditasFilter,
      });
      setRingkasan(res);
    } catch (err) {
      console.error('Failed loading ringkasan hasil bumi bulanan:', err);
    } finally {
      setLoadingRingkasan(false);
    }
  }, [bulan, tahun, kodeKomoditasFilter]);

  useEffect(() => {
    loadRingkasan(Boolean(ringkasan));
  }, [loadRingkasan, stokList, pembelianList, penjualanHasilBumiList]);

  useEffect(() => {
    const onErpUpdated = () => loadRingkasan(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [loadRingkasan]);

  const totalReadyGudangKg = activeStokList.reduce((s, h) => s + Math.max(0, Number(h.stok) || 0), 0);
  const totalTerjualSemuaKg = penjualanHasilBumiList.reduce(
    (s, j) => s + (Number(j.beratBersih) || 0),
    0
  );

  const handleExportCsv = () => {
    if (!ringkasan) return;
    const rows: string[][] = [];

    if (modeTabelRingkasan === 'PER_KOMODITAS') {
      rows.push([
        'Periode',
        'Kode',
        'Komoditas',
        'Stok Awal Bulan (Kg)',
        'Masuk Beli Bulan Ini (Kg)',
        'Modal Beli Bulan Ini (Rp)',
        'Terjual Bulan Ini (Kg)',
        'Omzet Jual Bulan Ini (Rp)',
        'Laba Bulan Ini (Rp)',
        'Stok Akhir Bulan (Kg)',
        'Ready di Gudang Saat Ini (Kg)',
        'Rata Modal Gudang (Rp/Kg)',
      ]);
      for (const it of ringkasan.komoditasItems) {
        if (kodeKomoditasFilter !== 'ALL' && it.kode !== kodeKomoditasFilter) continue;
        rows.push([
          ringkasan.periodeLabel,
          it.kode,
          it.nama,
          String(it.stokAwalBulanKg),
          String(it.masukBulanIniKg),
          String(it.masukBulanIniNominal),
          String(it.terjualBulanIniKg),
          String(it.terjualBulanIniOmzet),
          String(it.labaBulanIni),
          String(it.stokAkhirBulanKg),
          String(it.readyGudangSaatIniKg),
          String(it.rataRataModalGudangPerKg),
        ]);
      }
    } else {
      rows.push([
        'Bulan',
        'Tahun',
        'Stok Awal Bulan (Kg)',
        'Masuk Gudang (Kg)',
        'Modal Beli (Rp)',
        'Terjual Keluar (Kg)',
        'Omzet Penjualan (Rp)',
        'Laba Kotor (Rp)',
        'Sisa Stok Akhir Bulan (Kg)',
      ]);
      for (const m of ringkasan.rekapPerBulanTahunIni) {
        rows.push([
          m.namaBulan,
          String(m.tahun),
          String(m.stokAwalKg),
          String(m.masukKg),
          String(m.masukNominal),
          String(m.terjualKg),
          String(m.terjualOmzet),
          String(m.terjualLaba),
          String(m.stokAkhirKg),
        ]);
      }
    }

    const csvContent = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ringkasan_Stok_Hasil_Bumi_${NAMA_BULAN[bulan - 1]}_${tahun}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleVoidPenjualan = async (noPenjualan: string) => {
    setVoidLoading(true);
    setActionError('');
    try {
      await api.deletePenjualanHasilBumi(noPenjualan);
      setConfirmVoidNo(null);
      onRefresh();
      loadRingkasan();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal membatalkan transaksi penjualan hasil bumi.');
    } finally {
      setVoidLoading(false);
    }
  };

  const handleOpenReceipt = (j: TransaksiPenjualanHasilBumi) => {
    if (!onPrintReceipt) return;
    onPrintReceipt({
      title: 'NOTA PENJUALAN HASIL BUMI',
      subtitle: `Pengiriman Stok Fisik Keluar Gudang${j.divisi ? ` | Divisi: ${j.divisi}` : ''}`,
      nomorTransaksi: j.noPenjualan,
      tanggal: j.tanggal,
      jam: j.jam,
      mitra: j.namaMitra,
      rekening: `${j.metodePembayaran} (${j.rekeningTujuan})`,
      kategori: 'PENJUALAN_HASIL_BUMI',
      total: j.totalNominal,
      items: [
        {
          nama: `${j.komoditasNama}${j.noSuratJalan ? ` [DO: ${j.noSuratJalan}]` : ''}`,
          qty: j.beratBersih,
          satuan: 'Kg',
          harga: j.hargaJualPerKg,
          subtotal: j.totalNominal,
        },
      ],
      detailRows: [
        { label: 'Berat Kotor Timbangan', value: `${j.beratKotor.toLocaleString('id-ID')} Kg` },
        { label: 'Potongan Rafaksi', value: `${j.potonganRafaksi}%` },
        { label: 'Berat Bersih Keluar', value: `${j.beratBersih.toLocaleString('id-ID')} Kg`, highlight: true },
        { label: 'Stok Gudang Sebelum', value: `${j.stokGudangSebelum.toLocaleString('id-ID')} Kg` },
        { label: 'Sisa Ready di Gudang', value: `${j.stokGudangSetelah.toLocaleString('id-ID')} Kg` },
        { label: 'Total Penjualan', value: formatRupiah(j.totalNominal), isTotal: true },
      ],
      catatan: j.keterangan,
    });
  };

  const scopedKomoditasRows = useMemo(() => {
    const items = ringkasan?.komoditasItems || [];
    if (kodeKomoditasFilter === 'ALL') return items;
    return items.filter((it) => it.kode === kodeKomoditasFilter);
  }, [ringkasan, kodeKomoditasFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Stok Gudang &amp; Ringkasan Bulanan Hasil Bumi
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Rekapitulasi volume komoditas masuk, volume terjual per bulan, dan sisa fisik Ready di gudang secara real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowTambahBarangModal(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Barang Hasil Bumi</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedModalKode(undefined);
              setShowSaldoAwalModal(true);
            }}
            className="px-3.5 py-2 bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-300 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Scale className="w-4 h-4 text-amber-700" />
            <span>Input Stok Lama &amp; Modal Awal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setJualInitialKode(undefined);
              setShowJualModal(true);
            }}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            <span>Jual / Kirim Hasil Bumi</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError('')}
            className="text-rose-700 font-semibold hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PANEL UTAMA: RINGKASAN STOK HASIL BUMI PER BULAN (TERJUAL VS READY GUDANG) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Ringkasan Stok Hasil Bumi Bulanan — {NAMA_BULAN[bulan - 1]} {tahun}
            </h2>
            <p className="text-xs text-zinc-500">
              Laporan berapa Kg hasil bumi yang masuk dari petani, berapa Kg yang dijual keluar, dan berapa Kg yang Ready di gudang
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Bulan & Tahun */}
            <div className="flex items-center space-x-1.5 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              <select
                value={bulan}
                onChange={(e) => setBulan(Number(e.target.value))}
                className="bg-transparent font-semibold text-zinc-800 focus:outline-none cursor-pointer"
              >
                {NAMA_BULAN.map((nama, idx) => (
                  <option key={nama} value={idx + 1}>
                    {nama}
                  </option>
                ))}
              </select>
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className="bg-transparent font-mono font-semibold text-zinc-800 focus:outline-none cursor-pointer"
              >
                {(ringkasan?.daftarTahunTersedia?.length ? ringkasan.daftarTahunTersedia : [tahun]).map(
                  (yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Filter Komoditas */}
            <select
              value={kodeKomoditasFilter}
              onChange={(e) => setKodeKomoditasFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Komoditas ({activeStokList.length})</option>
              {activeStokList.map((hb) => (
                <option key={hb.kode} value={hb.kode}>
                  {hb.kode} — {hb.nama}
                </option>
              ))}
            </select>

            {/* Toggle Mode Tabel */}
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setModeTabelRingkasan('PER_KOMODITAS')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  modeTabelRingkasan === 'PER_KOMODITAS'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Per Komoditas
              </button>
              <button
                type="button"
                onClick={() => setModeTabelRingkasan('PER_BULAN')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                  modeTabelRingkasan === 'PER_BULAN'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Rekap 12 Bulan ({tahun})
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold flex items-center space-x-1 cursor-pointer"
              title="Unduh tabel ringkasan dalam format Excel/CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* 4 Kartu KPI Ringkasan (Rupiah Singkat - Anti Melebihi Card) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Ready di Gudang Saat Ini */}
          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-emerald-50/50 border border-emerald-200">
            <div className="flex items-center justify-between gap-2 text-emerald-900 mb-1.5 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                Ready di Gudang (Saat Ini)
              </span>
              <Warehouse className="w-4 h-4 text-emerald-700 shrink-0" />
            </div>
            <div
              className="text-xl font-bold font-mono tabular-nums text-emerald-900 truncate whitespace-nowrap"
              title={`${(ringkasan?.totalReadyGudangKg ?? totalReadyGudangKg).toLocaleString('id-ID')} Kg`}
            >
              {loadingRingkasan
                ? '...'
                : formatKgSingkat(ringkasan?.totalReadyGudangKg ?? totalReadyGudangKg)}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-emerald-800/80 min-w-0">
              <span
                className="font-mono tabular-nums truncate"
                title={`Nilai Modal Stok Ready: ${formatRupiah(ringkasan?.totalNilaiModalReadyGudang || 0)}`}
              >
                Modal: {formatRupiahSingkat(ringkasan?.totalNilaiModalReadyGudang || 0)}
              </span>
              <span className="shrink-0 font-medium">
                {ringkasan?.jumlahKomoditasReady || 0} Komoditas
              </span>
            </div>
          </div>

          {/* Card 2: Terjual Bulan Ini */}
          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <div className="flex items-center justify-between gap-2 text-zinc-600 mb-1.5 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                Terjual ({NAMA_BULAN[bulan - 1]})
              </span>
              <ArrowUpRight className="w-4 h-4 text-sky-700 shrink-0" />
            </div>
            <div
              className="text-xl font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap"
              title={`${(ringkasan?.terjualBulanIniKg || 0).toLocaleString('id-ID')} Kg`}
            >
              {loadingRingkasan ? '...' : formatKgSingkat(ringkasan?.terjualBulanIniKg || 0)}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500 min-w-0">
              <span
                className="font-mono tabular-nums truncate font-semibold text-zinc-700"
                title={`Omzet Penjualan Bulan Ini: ${formatRupiah(ringkasan?.terjualBulanIniOmzet || 0)}`}
              >
                Omzet: {formatRupiahSingkat(ringkasan?.terjualBulanIniOmzet || 0)}
              </span>
              <span className="shrink-0">{ringkasan?.jumlahNotaJualBulanIni || 0} Nota</span>
            </div>
          </div>

          {/* Card 3: Masuk Pembelian Bulan Ini */}
          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <div className="flex items-center justify-between gap-2 text-zinc-600 mb-1.5 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                Masuk Gudang ({NAMA_BULAN[bulan - 1]})
              </span>
              <ArrowDownLeft className="w-4 h-4 text-amber-700 shrink-0" />
            </div>
            <div
              className="text-xl font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap"
              title={`${(ringkasan?.masukBulanIniKg || 0).toLocaleString('id-ID')} Kg`}
            >
              {loadingRingkasan ? '...' : formatKgSingkat(ringkasan?.masukBulanIniKg || 0)}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500 min-w-0">
              <span
                className="font-mono tabular-nums truncate font-semibold text-zinc-700"
                title={`Modal Pembelian Bulan Ini: ${formatRupiah(ringkasan?.masukBulanIniNominal || 0)}`}
              >
                Modal: {formatRupiahSingkat(ringkasan?.masukBulanIniNominal || 0)}
              </span>
              <span className="shrink-0">{ringkasan?.jumlahNotaBeliBulanIni || 0} Nota</span>
            </div>
          </div>

          {/* Card 4: Laba Bulan Ini & Posisi Akhir Bulan */}
          <div className="min-w-0 overflow-hidden p-4 rounded-xl bg-zinc-50 border border-zinc-200">
            <div className="flex items-center justify-between gap-2 text-zinc-600 mb-1.5 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
                Laba Jual ({NAMA_BULAN[bulan - 1]})
              </span>
              <Wheat className="w-4 h-4 text-emerald-700 shrink-0" />
            </div>
            <div
              className={`text-xl font-bold font-mono tabular-nums truncate whitespace-nowrap ${
                (ringkasan?.terjualBulanIniLaba || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
              title={formatRupiah(ringkasan?.terjualBulanIniLaba || 0)}
            >
              {loadingRingkasan ? '...' : formatRupiahSingkat(ringkasan?.terjualBulanIniLaba || 0)}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-500 min-w-0">
              <span className="font-mono tabular-nums truncate">
                Akhir {NAMA_BULAN[bulan - 1].slice(0, 3)}:{' '}
                {(ringkasan?.stokAkhirBulanKg || 0).toLocaleString('id-ID')} Kg
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                Total Jual: {totalTerjualSemuaKg.toLocaleString('id-ID')} Kg
              </span>
            </div>
          </div>
        </div>

        {/* Tabel Ringkasan Bulanan */}
        {modeTabelRingkasan === 'PER_KOMODITAS' ? (
          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3.5">Komoditas</th>
                  <th className="py-3 px-3 text-right">Awal Bulan</th>
                  <th className="py-3 px-3 text-right">Masuk Beli ({NAMA_BULAN[bulan - 1].slice(0, 3)})</th>
                  <th className="py-3 px-3 text-right">Terjual ({NAMA_BULAN[bulan - 1].slice(0, 3)})</th>
                  <th className="py-3 px-3 text-right">Omzet Jual</th>
                  <th className="py-3 px-3 text-right">Laba Kotor</th>
                  <th className="py-3 px-3 text-right">Akhir Bulan</th>
                  <th className="py-3 px-3.5 text-right bg-emerald-50/60 text-emerald-900">
                    Ready di Gudang
                  </th>
                  <th className="py-3 px-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {scopedKomoditasRows.map((it) => (
                  <tr key={it.kode} className="hover:bg-zinc-50/80">
                    <td className="py-2.5 px-3.5">
                      <div className="font-bold text-zinc-900">{it.nama}</div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        {it.kode} · Modal Gudang:{' '}
                        <span title={formatRupiah(it.rataRataModalGudangPerKg)}>
                          {formatRupiahSingkat(it.rataRataModalGudangPerKg)}/{it.satuan}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-600">
                      {it.stokAwalBulanKg.toLocaleString('id-ID')} {it.satuan}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div className="font-semibold text-amber-800">
                        +{it.masukBulanIniKg.toLocaleString('id-ID')} {it.satuan}
                      </div>
                      {it.masukBulanIniNominal > 0 && (
                        <div
                          className="text-[10px] text-zinc-500"
                          title={formatRupiah(it.masukBulanIniNominal)}
                        >
                          {formatRupiahSingkat(it.masukBulanIniNominal)}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div className="font-bold text-sky-800">
                        {it.terjualBulanIniKg > 0
                          ? `-${it.terjualBulanIniKg.toLocaleString('id-ID')} ${it.satuan}`
                          : `0 ${it.satuan}`}
                      </div>
                      {it.notaJualBulanIniCount > 0 && (
                        <div className="text-[10px] text-zinc-500">
                          {it.notaJualBulanIniCount} pengiriman
                        </div>
                      )}
                    </td>
                    <td
                      className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-zinc-800"
                      title={formatRupiah(it.terjualBulanIniOmzet)}
                    >
                      {formatRupiahSingkat(it.terjualBulanIniOmzet)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                        it.labaBulanIni > 0
                          ? 'text-emerald-700'
                          : it.labaBulanIni < 0
                          ? 'text-rose-700'
                          : 'text-zinc-400'
                      }`}
                      title={formatRupiah(it.labaBulanIni)}
                    >
                      {it.terjualBulanIniKg > 0 ? formatRupiahSingkat(it.labaBulanIni) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-zinc-800">
                      {it.stokAkhirBulanKg.toLocaleString('id-ID')} {it.satuan}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono tabular-nums bg-emerald-50/40">
                      <div className="font-bold text-emerald-900">
                        {it.readyGudangSaatIniKg.toLocaleString('id-ID')} {it.satuan}
                      </div>
                      <div
                        className="text-[10px] text-emerald-700"
                        title={`Nilai Modal Ready: ${formatRupiah(it.nilaiModalReadyGudang)}`}
                      >
                        {formatRupiahSingkat(it.nilaiModalReadyGudang)}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={it.readyGudangSaatIniKg <= 0}
                        onClick={() => {
                          setJualInitialKode(it.kode);
                          setShowJualModal(true);
                        }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white transition-colors cursor-pointer"
                      >
                        Jual
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {ringkasan && (
                <tfoot className="bg-zinc-50 border-t-2 border-zinc-200 font-bold text-zinc-900">
                  <tr>
                    <td className="py-3 px-3.5">TOTAL RINGKASAN</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {ringkasan.stokAwalBulanKg.toLocaleString('id-ID')} Kg
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-800">
                      +{ringkasan.masukBulanIniKg.toLocaleString('id-ID')} Kg
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-800">
                      {ringkasan.terjualBulanIniKg > 0
                        ? `-${ringkasan.terjualBulanIniKg.toLocaleString('id-ID')} Kg`
                        : '0 Kg'}
                    </td>
                    <td
                      className="py-3 px-3 text-right font-mono tabular-nums"
                      title={formatRupiah(ringkasan.terjualBulanIniOmzet)}
                    >
                      {formatRupiahSingkat(ringkasan.terjualBulanIniOmzet)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-mono tabular-nums ${
                        ringkasan.terjualBulanIniLaba >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                      title={formatRupiah(ringkasan.terjualBulanIniLaba)}
                    >
                      {formatRupiahSingkat(ringkasan.terjualBulanIniLaba)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {ringkasan.stokAkhirBulanKg.toLocaleString('id-ID')} Kg
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono tabular-nums bg-emerald-100/60 text-emerald-900">
                      {ringkasan.totalReadyGudangKg.toLocaleString('id-ID')} Kg
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : (
          /* Mode Tabel 2: Rekap 12 Bulan Setahun (Januari - Desember) */
          <div className="overflow-x-auto border border-zinc-200 rounded-lg">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3.5">Bulan ({tahun})</th>
                  <th className="py-3 px-3 text-right">Stok Awal Bulan</th>
                  <th className="py-3 px-3 text-right">Masuk Gudang (Beli)</th>
                  <th className="py-3 px-3 text-right">Modal Pembelian</th>
                  <th className="py-3 px-3 text-right">Terjual Keluar</th>
                  <th className="py-3 px-3 text-right">Omzet Penjualan</th>
                  <th className="py-3 px-3 text-right">Laba Kotor</th>
                  <th className="py-3 px-3.5 text-right bg-emerald-50/60 text-emerald-900">
                    Sisa / Ready Akhir Bulan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {(ringkasan?.rekapPerBulanTahunIni || []).map((m) => {
                  const isSelected = m.bulan === bulan;
                  return (
                    <tr
                      key={m.bulan}
                      onClick={() => setBulan(m.bulan)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/60 font-medium' : 'hover:bg-zinc-50/80'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 font-semibold text-zinc-900 flex items-center space-x-2">
                        <span>{m.namaBulan}</span>
                        {m.isCurrentMonth && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            BULAN INI
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-600">
                        {m.stokAwalKg.toLocaleString('id-ID')} Kg
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800 font-medium">
                        {m.masukKg > 0 ? `+${m.masukKg.toLocaleString('id-ID')} Kg` : '0 Kg'}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-700"
                        title={formatRupiah(m.masukNominal)}
                      >
                        {formatRupiahSingkat(m.masukNominal)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-800 font-semibold">
                        {m.terjualKg > 0 ? `-${m.terjualKg.toLocaleString('id-ID')} Kg` : '0 Kg'}
                      </td>
                      <td
                        className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-zinc-800"
                        title={formatRupiah(m.terjualOmzet)}
                      >
                        {formatRupiahSingkat(m.terjualOmzet)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold ${
                          m.terjualLaba > 0
                            ? 'text-emerald-700'
                            : m.terjualLaba < 0
                            ? 'text-rose-700'
                            : 'text-zinc-400'
                        }`}
                        title={formatRupiah(m.terjualLaba)}
                      >
                        {m.terjualKg > 0 ? formatRupiahSingkat(m.terjualLaba) : '-'}
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums font-bold text-emerald-900 bg-emerald-50/30">
                        {m.stokAkhirKg.toLocaleString('id-ID')} Kg
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* KARTU PERSEDIAAN FISIK PER KOMODITAS (READY GUDANG & MODAL RATA-RATA)     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeStokList.map((hb, idx) => {
          const isKopiTitip = hb.kode === 'HB-08' || hb.isBelumPutusHarga;

          const purchases = physicalPembelianList.filter(
            (p) =>
              p.komoditasKode === hb.kode ||
              p.komoditasNama.toUpperCase().trim() === hb.nama.toUpperCase().trim()
          );

          const sales = penjualanHasilBumiList.filter(
            (j) =>
              j.komoditasKode === hb.kode ||
              j.komoditasNama.toUpperCase().trim() === hb.nama.toUpperCase().trim()
          );

          const totalUangKeluarBaru = purchases.reduce((sum, p) => sum + (p.totalNominal || 0), 0);
          const totalKgBeliBaru = purchases.reduce((sum, p) => sum + (p.beratBersih || 0), 0);
          const totalKgTerjual = sales.reduce((sum, j) => sum + (j.beratBersih || 0), 0);

          const stokAwalKg = hb.stokAwal || 0;
          const modalAwalUang = hb.modalAwalTotal || stokAwalKg * (hb.rataRataModalAwal || 0);

          const totalUangKeluar = modalAwalUang + totalUangKeluarBaru;
          const totalKgBeli = stokAwalKg + totalKgBeliBaru;

          const rataRataModalPerKg =
            totalKgBeli > 0 && totalUangKeluar > 0
              ? Math.round(totalUangKeluar / totalKgBeli)
              : hb.rataRataModalAwal || 0;

          return (
            <div
              key={hb.kode}
              className={`bg-white rounded-xl border p-4 space-y-2.5 flex flex-col justify-between min-w-0 overflow-hidden ${
                isKopiTitip ? 'border-amber-300 bg-amber-50/20' : 'border-zinc-200'
              }`}
            >
              <div className="space-y-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200 truncate">
                    #{idx + 1} · {hb.kode}
                  </span>
                  {isKopiTitip ? (
                    <span className="text-[10px] font-bold text-amber-800 shrink-0">TITIP PANEN</span>
                  ) : (
                    <Wheat className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                </div>

                <div className="font-bold text-zinc-900 text-sm truncate">{hb.nama}</div>

                {/* Ready di Gudang */}
                <div className="min-w-0">
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">
                    Ready di Gudang:
                  </span>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-800 tracking-tight truncate whitespace-nowrap">
                    {hb.stok.toLocaleString('id-ID')}{' '}
                    <span className="text-xs font-medium text-zinc-500">{hb.satuan}</span>
                  </div>
                </div>

                {/* Ringkasan Masuk vs Terjual & Modal Rata-rata */}
                <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5 text-xs min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
                    <span className="text-zinc-600 font-medium shrink-0">Modal Rata-rata:</span>
                    <span
                      className="font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap"
                      title={
                        rataRataModalPerKg > 0 ? `${formatRupiah(rataRataModalPerKg)} / Kg` : undefined
                      }
                    >
                      {rataRataModalPerKg > 0
                        ? `${formatRupiahSingkat(rataRataModalPerKg)}/Kg`
                        : isKopiTitip
                        ? 'Belum Putus'
                        : 'Rp 0'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 pt-1 border-t border-zinc-200/80 min-w-0">
                    <span className="shrink-0">Total Masuk:</span>
                    <span className="font-mono tabular-nums font-semibold text-zinc-800 truncate">
                      {totalKgBeli.toLocaleString('id-ID')} Kg
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 min-w-0">
                    <span className="shrink-0">Total Terjual:</span>
                    <span className="font-mono tabular-nums font-semibold text-sky-800 truncate">
                      {totalKgTerjual.toLocaleString('id-ID')} Kg
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-500 min-w-0">
                    <span className="shrink-0">Total Modal Beli:</span>
                    <span
                      className="font-mono tabular-nums font-semibold text-zinc-800 truncate whitespace-nowrap"
                      title={formatRupiah(totalUangKeluar)}
                    >
                      {formatRupiahSingkat(totalUangKeluar)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModalKode(hb.kode);
                    setShowSaldoAwalModal(true);
                  }}
                  className="text-zinc-600 hover:text-zinc-900 font-medium hover:underline cursor-pointer truncate"
                >
                  Saldo Awal ({formatTanggalIndo(hb.updateTerakhir)})
                </button>
                <button
                  type="button"
                  disabled={hb.stok <= 0}
                  onClick={() => {
                    setJualInitialKode(hb.kode);
                    setShowJualModal(true);
                  }}
                  className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold shrink-0 cursor-pointer transition-colors"
                >
                  Jual Ready
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* RIWAYAT TRANSAKSI KELUAR (PENJUALAN) & MASUK (PEMBELIAN PETANI)           */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-zinc-700" />
            <h2 className="text-sm font-bold text-zinc-900">
              Riwayat Mutasi Gudang Hasil Bumi
            </h2>
          </div>

          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveHistoryTab('PENJUALAN')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeHistoryTab === 'PENJUALAN'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Penjualan Keluar Gudang ({penjualanHasilBumiList.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveHistoryTab('PEMBELIAN')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeHistoryTab === 'PEMBELIAN'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Pembelian Masuk Petani ({physicalPembelianList.length})
            </button>
          </div>
        </div>

        {activeHistoryTab === 'PENJUALAN' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">No Nota / DO</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Pembeli / Pabrik</th>
                  <th className="py-3 px-4">Komoditas</th>
                  <th className="py-3 px-4 text-right">Berat Bersih</th>
                  <th className="py-3 px-4 text-right">Modal / Kg</th>
                  <th className="py-3 px-4 text-right">Harga Jual</th>
                  <th className="py-3 px-4 text-right">Total Omzet</th>
                  <th className="py-3 px-4 text-right">Laba Kotor</th>
                  <th className="py-3 px-4 text-center">Metode</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {penjualanHasilBumiList.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 text-center text-zinc-500">
                      Belum ada transaksi penjualan hasil bumi keluar gudang. Klik tombol{' '}
                      <strong className="text-zinc-800">Jual / Kirim Hasil Bumi</strong> untuk mencatat pengiriman.
                    </td>
                  </tr>
                ) : (
                  penjualanHasilBumiList.slice(0, 60).map((j) => (
                    <tr key={j.noPenjualan} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-zinc-900">{j.noPenjualan}</div>
                        {j.noSuratJalan && (
                          <div className="text-[10px] font-mono text-zinc-500">DO: {j.noSuratJalan}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 whitespace-nowrap font-mono tabular-nums">
                        {j.tanggal} <span className="text-[10px] text-zinc-400">{j.jam}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-zinc-800">{j.namaMitra}</td>
                      <td className="py-3 px-4 font-bold text-zinc-900">{j.komoditasNama}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-sky-800">
                        -{j.beratBersih.toLocaleString('id-ID')} Kg
                      </td>
                      <td
                        className="py-3 px-4 text-right font-mono tabular-nums text-zinc-600"
                        title={formatRupiah(j.modalRataRataPerKg)}
                      >
                        {formatRupiahSingkat(j.modalRataRataPerKg)}
                      </td>
                      <td
                        className="py-3 px-4 text-right font-mono tabular-nums text-zinc-800"
                        title={formatRupiah(j.hargaJualPerKg)}
                      >
                        {formatRupiahSingkat(j.hargaJualPerKg)}
                      </td>
                      <td
                        className="py-3 px-4 text-right font-mono tabular-nums font-bold text-zinc-900"
                        title={formatRupiah(j.totalNominal)}
                      >
                        {formatRupiahSingkat(j.totalNominal)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                          j.labaKotor >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                        title={formatRupiah(j.labaKotor)}
                      >
                        {j.labaKotor >= 0 ? '+' : ''}
                        {formatRupiahSingkat(j.labaKotor)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            j.statusPembayaran === 'LUNAS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {j.metodePembayaran} ({j.rekeningTujuan})
                        </span>
                        {j.divisi && (
                          <div className="text-[10px] text-sky-800 font-semibold mt-0.5">
                            {j.divisi}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {confirmVoidNo === j.noPenjualan ? (
                          <div className="inline-flex items-center space-x-1">
                            <button
                              type="button"
                              disabled={voidLoading}
                              onClick={() => handleVoidPenjualan(j.noPenjualan)}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold cursor-pointer"
                            >
                              {voidLoading ? '...' : 'Ya, Batal'}
                            </button>
                            <button
                              type="button"
                              disabled={voidLoading}
                              onClick={() => setConfirmVoidNo(null)}
                              className="px-2 py-1 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-[10px] font-semibold cursor-pointer"
                            >
                              Tidak
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setEditTxTarget({
                                  id: j.noPenjualan,
                                  jenis: 'PENJUALAN_HASIL_BUMI',
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer transition-colors"
                              title="Edit detail tonase, rafaksi, harga jual, atau rekening"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            {onPrintReceipt && (
                              <button
                                type="button"
                                onClick={() => handleOpenReceipt(j)}
                                className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer"
                                title="Cetak Nota Pengiriman"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setConfirmVoidNo(j.noPenjualan)}
                              className="p-1.5 rounded hover:bg-rose-50 text-zinc-400 hover:text-rose-600 cursor-pointer"
                              title="Batalkan & Kembalikan Stok ke Gudang"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">No Nota</th>
                  <th className="py-3 px-4">Tanggal / Jam</th>
                  <th className="py-3 px-4">Petani / Supplier</th>
                  <th className="py-3 px-4">Komoditas</th>
                  <th className="py-3 px-4 text-right">Berat Kotor</th>
                  <th className="py-3 px-4 text-center">Rafaksi</th>
                  <th className="py-3 px-4 text-right">Berat Bersih</th>
                  <th className="py-3 px-4 text-right">Harga / Kg</th>
                  <th className="py-3 px-4 text-right">Total Beli</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {physicalPembelianList.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-zinc-400">
                      Belum ada riwayat transaksi timbangan pembelian fisik yang dicatat
                    </td>
                  </tr>
                ) : (
                  physicalPembelianList.slice(0, 60).map((p) => {
                    const isBelumPutus = p.isBelumPutusHarga || p.status === 'BELUM_PUTUS_HARGA';
                    return (
                      <tr key={p.noPembelian} className="hover:bg-zinc-50/80">
                        <td className="py-3 px-4 font-mono font-bold text-amber-900">
                          {p.noPembelian}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 whitespace-nowrap font-mono tabular-nums">
                          {p.tanggal} <span className="text-[10px] text-zinc-400">{p.jam}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-800">{p.namaMitra}</td>
                        <td className="py-3 px-4 font-bold text-zinc-900">{p.komoditasNama}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-600">
                          {p.beratKotor.toLocaleString('id-ID')} Kg
                        </td>
                        <td className="py-3 px-4 text-center font-mono tabular-nums text-zinc-500">
                          {p.potonganRafaksi}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-amber-900">
                          +{p.beratBersih.toLocaleString('id-ID')} Kg
                        </td>
                        <td
                          className="py-3 px-4 text-right font-mono tabular-nums text-zinc-700"
                          title={!isBelumPutus ? formatRupiah(p.hargaPerKg) : undefined}
                        >
                          {isBelumPutus ? (
                            <span className="text-amber-800 font-bold">Mengambang (Titip)</span>
                          ) : (
                            formatRupiahSingkat(p.hargaPerKg)
                          )}
                        </td>
                        <td
                          className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-800"
                          title={formatRupiah(p.totalNominal)}
                        >
                          {isBelumPutus && p.totalNominal === 0 ? (
                            <span className="text-amber-800">Rp 0 (Belum Putus)</span>
                          ) : (
                            formatRupiahSingkat(p.totalNominal)
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isBelumPutus
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {p.status} ({p.rekeningSumber})
                          </span>
                          {p.divisi && (
                            <div className="text-[10px] text-sky-800 font-semibold mt-0.5">
                              {p.divisi}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setEditTxTarget({
                                id: p.noPembelian,
                                jenis: 'PEMBELIAN_HASIL_BUMI',
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer transition-colors"
                            title="Edit tonase timbangan, rafaksi, harga beli, atau metode pembayaran"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Input Stok Awal & Modal Rekap Manual */}
      <ModalInputStokAwalHasilBumi
        isOpen={showSaldoAwalModal}
        onClose={() => setShowSaldoAwalModal(false)}
        stokList={stokList}
        pembelianList={physicalPembelianList}
        onSuccess={() => {
          onRefresh();
          loadRingkasan();
        }}
        initialSelectedKode={selectedModalKode}
      />

      {/* Modal Penjualan / Pengiriman Hasil Bumi Keluar Gudang */}
      <ModalJualHasilBumi
        isOpen={showJualModal}
        onClose={() => setShowJualModal(false)}
        stokList={stokList}
        pembelianList={physicalPembelianList}
        mitraList={mitraList}
        rekeningList={rekeningList}
        initialKomoditasKode={jualInitialKode}
        onSuccess={(_record, receipt) => {
          onRefresh();
          loadRingkasan();
          if (onPrintReceipt && receipt) {
            onPrintReceipt(receipt);
          }
        }}
      />

      {/* Modal Tambah Barang Hasil Bumi Baru */}
      <ModalTambahHasilBumi
        isOpen={showTambahBarangModal}
        onClose={() => setShowTambahBarangModal(false)}
        existingCount={activeStokList.length}
        onCreated={() => {
          onRefresh();
          loadRingkasan();
        }}
      />

      {/* Modal Universal Edit Detail Transaksi */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxTarget)}
        transactionId={editTxTarget?.id || null}
        jenisHint={editTxTarget?.jenis}
        onClose={() => setEditTxTarget(null)}
        onSuccess={() => {
          onRefresh();
          loadRingkasan();
        }}
      />
    </div>
  );
};
