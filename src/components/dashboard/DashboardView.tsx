import React from 'react';
import {
  TrendingUp,
  Wheat,
  Landmark,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  HandCoins,
  Receipt,
  Scale,
  Calculator,
  Users,
  RefreshCw,
  ShoppingCart,
  Wallet,
  PackagePlus,
  FileText,
} from 'lucide-react';
import { DashboardStatsResponse } from '../../api/client.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ActiveTab } from '../layout/Sidebar.tsx';
import { BukuKasHarianBosWidget } from './BukuKasHarianBosWidget.tsx';
import { RingkasanHasilBumiBulananWidget } from './RingkasanHasilBumiBulananWidget.tsx';

interface Props {
  stats: DashboardStatsResponse | null;
  loading: boolean;
  onNavigate: (tab: ActiveTab) => void;
  onOpenKontrolKasir?: (subTab: 'kliring' | 'duplikat' | 'opname', mitraId?: string) => void;
  onOpenPinjamUangModal?: () => void;
  onRefresh: () => void;
}

const isTxInflow = (kategori: string): boolean => {
  return (
    kategori === 'PENJUALAN' ||
    kategori === 'PENJUALAN_HASIL_BUMI' ||
    kategori === 'BAYAR_BON' ||
    kategori === 'PINJAM_UANG_MITRA'
  );
};

const isTxTransfer = (kategori: string): boolean => {
  return kategori === 'TRANSFER_REKENING';
};

export const DashboardView: React.FC<Props> = ({
  stats,
  loading,
  onNavigate,
  onOpenKontrolKasir,
  onOpenPinjamUangModal,
  onRefresh,
}) => {
  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mr-3" />
        Memuat data dashboard aktual...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Ringkasan Operasional &amp; Keuangan
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Pantau posisi kas riil, perputaran bon mitra, serta jalur uang masuk dan keluar secara langsung
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('kasir-transfer')}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100/80 border border-sky-200/90 rounded-xl transition-colors cursor-pointer"
            title="Pindah buku antar Kas Tunai (KAS01) dan Bank Perusahaan"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600" />
            <span>⇄ Mutasi Antar Rekening</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('rekap-semua-transaksi')}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200/80 rounded-xl transition-colors cursor-pointer"
          >
            Jurnal &amp; Edit Transaksi
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* Dual-Lane Cash-Flow Gateway: JALAN UANG MASUK (+) vs JALAN UANG KELUAR (−) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Lane 1: JALAN UANG MASUK (+ KAS BERTAMBAH) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-emerald-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-emerald-100">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-emerald-950 truncate">
                  Jalan Uang Masuk
                </h2>
                <p className="text-[11px] text-emerald-700/90 truncate">
                  Penerimaan dana masuk (+ Kas / Bank PT)
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-extrabold text-emerald-700 shrink-0">
              + KAS IN
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('kasir-penjualan')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-200/70 hover:border-emerald-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Penjualan Toko</div>
                  <div className="text-[10px] text-slate-500 truncate">Jual barang &amp; rekanan</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0">+</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('kasir-bayar-bon')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-200/70 hover:border-emerald-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Receipt className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Pelunasan Bon</div>
                  <div className="text-[10px] text-slate-500 truncate">Setoran cicilan mitra</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0">+</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenPinjamUangModal ? onOpenPinjamUangModal() : onNavigate('master-mitra')
              }
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-200/70 hover:border-emerald-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Wallet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Pinjaman Mitra</div>
                  <div className="text-[10px] text-slate-500 truncate">Masuk kas PT (+Titip)</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0">+</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('stok-hasil-bumi')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/40 hover:bg-emerald-50 border border-emerald-200/70 hover:border-emerald-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Wheat className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Jual Hasil Bumi</div>
                  <div className="text-[10px] text-slate-500 truncate">Kirim &amp; jual stok gudang</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0">+</span>
            </button>
          </div>
        </div>

        {/* Lane 2: JALAN UANG KELUAR (− KAS BERKURANG) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-rose-200/90 p-4 sm:p-5 shadow-2xs flex flex-col justify-between space-y-3.5">
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-rose-100">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <ArrowUpRight className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-rose-950 truncate">
                  Jalan Uang Keluar
                </h2>
                <p className="text-[11px] text-rose-700/90 truncate">
                  Pengeluaran pembayaran, kasbon &amp; kulakan (− Kas / Bank PT)
                </p>
              </div>
            </div>
            <span className="font-mono text-xs font-extrabold text-rose-700 shrink-0">
              − KAS OUT
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('kasir-pembelian')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-50/35 hover:bg-rose-50 border border-rose-200/70 hover:border-rose-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <Wheat className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Beli Hasil Bumi</div>
                  <div className="text-[10px] text-slate-500 truncate">Timbangan panen mitra</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0">−</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('kasir-cairkan-titipan')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-50/35 hover:bg-rose-50 border border-rose-200/70 hover:border-rose-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <HandCoins className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Bayar Titipan</div>
                  <div className="text-[10px] text-slate-500 truncate">Cairkan saldo titip</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0">−</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('kasir-kasbon-uang')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-50/35 hover:bg-rose-50 border border-rose-200/70 hover:border-rose-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <HandCoins className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Kasbon Uang</div>
                  <div className="text-[10px] text-slate-500 truncate">Pinjaman tunai mitra</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0">−</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('kasir-pembelian-barang')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-50/35 hover:bg-rose-50 border border-rose-200/70 hover:border-rose-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <PackagePlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Beli Stok Toko</div>
                  <div className="text-[10px] text-slate-500 truncate">Kulakan distributor</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0">−</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('kasir-pengeluaran')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-50/35 hover:bg-rose-50 border border-rose-200/70 hover:border-rose-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Biaya &amp; Divisi</div>
                  <div className="text-[10px] text-slate-500 truncate">Pengeluaran harian</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0">−</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('master-karyawan')}
              className="flex items-center justify-between gap-2 p-3 rounded-xl bg-rose-50/35 hover:bg-rose-50 border border-rose-200/70 hover:border-rose-400 transition-all text-left group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-rose-100/80 text-rose-700 flex items-center justify-center shrink-0 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">Upah &amp; Gaji SDM</div>
                  <div className="text-[10px] text-slate-500 truncate">Pencairan gaji pekerja</div>
                </div>
              </div>
              <span className="font-mono text-[10px] font-bold text-rose-700 shrink-0">−</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Uang Perusahaan */}
        <div className="min-w-0 overflow-hidden bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-2.5 min-w-0">
            <span className="text-xs font-semibold tracking-tight truncate">Total Kas &amp; Bank Riil</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums text-slate-900 truncate whitespace-nowrap"
            title={formatRupiah(stats.totalUangPerusahaan)}
          >
            {formatRupiahSingkat(stats.totalUangPerusahaan)}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between gap-2 min-w-0">
            <span className="truncate font-mono tabular-nums" title={`KAS01: ${formatRupiah(stats.saldoKas)}`}>
              KAS01: <strong className="text-slate-700 font-semibold">{formatRupiahSingkat(stats.saldoKas)}</strong>
            </span>
            <span className="truncate font-mono tabular-nums text-right" title={`Bank: ${formatRupiah(stats.saldoBank)}`}>
              Bank: <strong className="text-slate-700 font-semibold">{formatRupiahSingkat(stats.saldoBank)}</strong>
            </span>
          </div>
        </div>

        {/* Total Piutang BON01 */}
        <div className="min-w-0 overflow-hidden bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-2.5 min-w-0">
            <span className="text-xs font-semibold tracking-tight truncate">Piutang Aktif (BON01)</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 shrink-0">
              <HandCoins className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums text-amber-700 truncate whitespace-nowrap"
            title={formatRupiah(stats.totalBonOutstanding)}
          >
            {formatRupiahSingkat(stats.totalBonOutstanding)}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between gap-2 min-w-0">
            <span className="truncate font-mono tabular-nums" title={`Kasbon Uang: ${formatRupiah(stats.totalKasbonUangAktif)}`}>
              Uang: <strong className="text-slate-700 font-semibold">{formatRupiahSingkat(stats.totalKasbonUangAktif)}</strong>
            </span>
            <span
              className="truncate font-mono tabular-nums text-right"
              title={`Kasbon Barang: ${formatRupiah(Math.max(0, stats.totalBonOutstanding - stats.totalKasbonUangAktif))}`}
            >
              Barang: <strong className="text-slate-700 font-semibold">{formatRupiahSingkat(Math.max(0, stats.totalBonOutstanding - stats.totalKasbonUangAktif))}</strong>
            </span>
          </div>
        </div>

        {/* Omzet Penjualan */}
        <div className="min-w-0 overflow-hidden bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-2.5 min-w-0">
            <span className="text-xs font-semibold tracking-tight truncate">Omzet Penjualan Toko</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums text-slate-900 truncate whitespace-nowrap"
            title={formatRupiah(stats.totalPenjualan)}
          >
            {formatRupiahSingkat(stats.totalPenjualan)}
          </div>
          <div
            className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 truncate"
            title={`Nilai Persediaan Toko: ${formatRupiah(stats.nilaiStokBarang)}`}
          >
            Nilai Persediaan:{' '}
            <span className="font-semibold font-mono tabular-nums text-slate-700">
              {formatRupiahSingkat(stats.nilaiStokBarang)}
            </span>
          </div>
        </div>

        {/* Pembelian Hasil Bumi */}
        <div className="min-w-0 overflow-hidden bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-2.5 min-w-0">
            <span className="text-xs font-semibold tracking-tight truncate">Pembelian Hasil Bumi</span>
            <div className="p-2 rounded-xl bg-rose-50 text-rose-700 shrink-0">
              <Wheat className="w-4 h-4" />
            </div>
          </div>
          <div
            className="text-2xl font-bold font-mono tabular-nums text-slate-900 truncate whitespace-nowrap"
            title={formatRupiah(stats.totalPembelianHasilBumi)}
          >
            {formatRupiahSingkat(stats.totalPembelianHasilBumi)}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between gap-2 min-w-0">
            <span className="truncate font-mono tabular-nums">
              Ready: <strong className="text-emerald-700 font-semibold">{((Number(stats.totalVolumeHasilBumiKg) || 0) / 1000).toFixed(1)} Ton</strong>
            </span>
            <span
              className="truncate font-mono tabular-nums text-right"
              title={`Terjual: ${(Number(stats.totalTerjualHasilBumiKg) || 0).toLocaleString('id-ID')} Kg · Titip: ${formatRupiah(stats.totalTitipOutstanding)}`}
            >
              Terjual: <strong className="text-slate-700 font-semibold">{((Number(stats.totalTerjualHasilBumiKg) || 0) / 1000).toFixed(1)} Ton</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Pusat Kontrol & Rekonsiliasi Kasir Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3.5 mb-3.5 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Pusat Kliring Silang, Audit Mitra &amp; Cash Opname</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kompensasi otomatis titipan panen vs kasbon mitra, penggabungan akun kembar, dan hitung fisik laci sore
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenKontrolKasir ? onOpenKontrolKasir('kliring') : onNavigate('pusat-kontrol-kasir')
            }
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 self-start sm:self-auto cursor-pointer"
          >
            Buka Pusat Kontrol &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() =>
              onOpenKontrolKasir ? onOpenKontrolKasir('kliring') : onNavigate('pusat-kontrol-kasir')
            }
            className="min-w-0 overflow-hidden flex items-start space-x-3 p-3.5 rounded-xl border border-slate-200/80 hover:border-emerald-400 bg-slate-50/50 hover:bg-white transition-all text-left cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Scale className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900">Potong Bon Silang Panen</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Kompensasi saldo titipan hasil bumi dengan kasbon mitra secara akurat
              </div>
              <div
                className="mt-1.5 text-[11px] text-slate-600 font-mono tabular-nums truncate"
                title={`Titip ${formatRupiah(stats.totalTitipOutstanding)} · Bon ${formatRupiah(stats.totalBonOutstanding)}`}
              >
                Titip {formatRupiahSingkat(stats.totalTitipOutstanding)} · Bon {formatRupiahSingkat(stats.totalBonOutstanding)}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenKontrolKasir ? onOpenKontrolKasir('duplikat') : onNavigate('pusat-kontrol-kasir')
            }
            className="min-w-0 overflow-hidden flex items-start space-x-3 p-3.5 rounded-xl border border-slate-200/80 hover:border-amber-400 bg-slate-50/50 hover:bg-white transition-all text-left cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900">Detektor &amp; Merger Akun Kembar</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Lacak ejaan nama mirip dan satukan riwayat seluruh nota ke satu akun utama
              </div>
              <div className="mt-1.5 text-[11px] text-amber-700 font-medium truncate">
                Audit kemiripan nama &amp; nomor HP
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenKontrolKasir ? onOpenKontrolKasir('opname') : onNavigate('pusat-kontrol-kasir')
            }
            className="min-w-0 overflow-hidden flex items-start space-x-3 p-3.5 rounded-xl border border-slate-200/80 hover:border-slate-400 bg-slate-50/50 hover:bg-white transition-all text-left cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 group-hover:bg-slate-800 group-hover:text-white transition-colors">
              <Calculator className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900">Cash Opname Laci Kasir (KAS01)</div>
              <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Kalkulator lembar uang kertas &amp; logam sore hari beserta Berita Acara cetak
              </div>
              <div
                className="mt-1.5 text-[11px] text-slate-700 font-mono tabular-nums truncate"
                title={`Buku KAS01: ${formatRupiah(stats.saldoKas)}`}
              >
                Buku KAS01: {formatRupiahSingkat(stats.saldoKas)}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Ringkasan Stok Hasil Bumi Bulanan (Terjual vs Ready di Gudang) */}
      <RingkasanHasilBumiBulananWidget
        onNavigate={onNavigate}
        refreshTrigger={stats}
      />

      {/* Widget Buku Kas & Arus Kas Harian (Logic Rekapan Harian Bos) */}
      <BukuKasHarianBosWidget
        onNavigate={onNavigate}
        onRefreshParent={onRefresh}
      />

      {/* Saldo Rekening Perusahaan Detail Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3.5 gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Landmark className="w-4 h-4 text-emerald-700" />
              <span>Posisi Saldo Rekening Perusahaan</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Kas brankas fisik kasir dan seluruh rekening bank resmi perusahaan
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('master-rekening')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 self-start sm:self-auto cursor-pointer"
          >
            Buka Master Rekening &rarr;
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.rekeningList
            .filter((r) => r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode.startsWith('REK-')))
            .map((rek) => (
              <div
                key={rek.kode}
                className={`min-w-0 overflow-hidden p-3.5 rounded-xl border text-xs transition-colors ${
                  rek.kode === 'KAS01'
                    ? 'bg-emerald-50/50 border-emerald-200/90'
                    : 'bg-slate-50/70 border-slate-200/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-1 min-w-0">
                  <span className="font-mono font-bold text-slate-700 truncate">{rek.kode}</span>
                  <span className="text-[10px] text-slate-400 font-medium shrink-0">
                    {rek.kode === 'KAS01' ? 'Kas Tunai' : 'Bank PT'}
                  </span>
                </div>
                <div className="text-slate-500 text-[11px] truncate mb-1.5">{rek.nama}</div>
                <div
                  className="text-sm font-bold text-slate-900 font-mono tabular-nums truncate whitespace-nowrap"
                  title={formatRupiah(rek.saldoSaatIni)}
                >
                  {formatRupiahSingkat(rek.saldoSaatIni)}
                </div>
              </div>
            ))}
        </div>

        {/* Division Operational Accounts Note & Mini Ribbon */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold text-slate-800">Alokasi Operasional 6 Divisi:</span>
            <span className="text-slate-500 text-[11px]">
              Pencatatan upah harian &amp; dropping unit bisnis tetap mengacu pada kas fisik perusahaan.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('menu-divisi')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer shrink-0"
          >
            Lihat Keuangan Divisi &rarr;
          </button>
        </div>
      </div>

      {/* Bottom Section: Recent Transactions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-4 sm:px-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Aktivitas Transaksi Terbaru</h2>
            <button
              type="button"
              onClick={() => onNavigate('laporan-transaksi')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              Lihat Semua Laporan &rarr;
            </button>
          </div>

          <div className="divide-y divide-slate-100 overflow-x-auto text-xs">
            {!stats.recentTransactions || stats.recentTransactions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Belum ada transaksi tercatat</div>
            ) : (
              (stats.recentTransactions || []).map((tx) => {
                const inflow = isTxInflow(tx.kategori);
                const transfer = isTxTransfer(tx.kategori);

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 sm:px-5 flex items-center justify-between hover:bg-slate-50/70 transition-colors gap-3"
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          inflow
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80'
                            : transfer
                            ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/80'
                            : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80'
                        }`}
                      >
                        {inflow && <ArrowDownLeft className="w-4 h-4" />}
                        {transfer && <ArrowLeftRight className="w-4 h-4" />}
                        {!inflow && !transfer && <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{tx.label}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {tx.pihakTerkait} · Rek: <span className="font-mono text-slate-700">{tx.rekening}</span>
                          {' · '}
                          <span
                            className={`font-mono font-semibold ${
                              inflow
                                ? 'text-emerald-700'
                                : transfer
                                ? 'text-sky-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {inflow ? 'Uang Masuk' : transfer ? 'Mutasi' : 'Uang Keluar'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`font-bold font-mono tabular-nums ${
                          inflow
                            ? 'text-emerald-700'
                            : transfer
                            ? 'text-sky-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {inflow ? '+ ' : transfer ? '⇄ ' : '− '}
                        {formatRupiah(tx.nominal)}
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-slate-400">
                        {tx.tanggal} · {tx.jam}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Low Stock Warning Box (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center space-x-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-bold text-slate-900">Stok Perlu Restok</span>
              </div>
              <span className="text-xs font-mono tabular-nums font-semibold text-slate-500">
                {(stats.stokMenipis || []).length} item
              </span>
            </div>

            <div className="mt-3.5 space-y-2 text-xs">
              {!stats.stokMenipis || stats.stokMenipis.length === 0 ? (
                <div className="text-center py-8 text-emerald-700 text-xs">
                  Seluruh stok produk saat ini berada di atas batas minimum.
                </div>
              ) : (
                (stats.stokMenipis || []).map((item) => (
                  <div
                    key={item.kode}
                    className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/70"
                  >
                    <div className="font-semibold text-slate-900">{item.namaProduk}</div>
                    <div className="flex justify-between text-[11px] text-slate-600 mt-1 font-mono tabular-nums">
                      <span>
                        Sisa: <strong className="text-amber-800">{item.stok} {item.satuan}</strong>
                      </span>
                      <span>Min: {item.minimum} {item.satuan}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('stok-barang')}
            className="w-full mt-4 py-2.5 text-xs font-semibold text-center text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
          >
            Buka Manajemen Stok &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
