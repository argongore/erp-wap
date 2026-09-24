import React from 'react';
import {
  TrendingUp,
  Wheat,
  Landmark,
  Wallet,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  HandCoins,
  Receipt,
  Package,
} from 'lucide-react';
import { DashboardStatsResponse } from '../../api/client.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';
import { ActiveTab } from '../layout/Sidebar.tsx';

interface Props {
  stats: DashboardStatsResponse | null;
  loading: boolean;
  onNavigate: (tab: ActiveTab) => void;
  onRefresh: () => void;
}

export const DashboardView: React.FC<Props> = ({ stats, loading, onNavigate, onRefresh }) => {
  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mr-3" />
        Memuat data dashboard aktual...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Dashboard Operasional & Keuangan</h1>
          <p className="text-xs text-zinc-500">Ringkasan transaksi kasir, perputaran kasbon, dan posisi stok real-time</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors shadow-2xs"
          >
            Segarkan Data
          </button>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigate('kasir-penjualan')}
          className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-zinc-200 hover:border-emerald-500 hover:shadow-xs transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-900">Kasir Penjualan</div>
            <div className="text-[11px] text-zinc-500">Tunai / Transfer / Kasbon</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('kasir-kasbon-uang')}
          className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-zinc-200 hover:border-rose-500 hover:shadow-xs transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
            <HandCoins className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-900">Kasbon Uang</div>
            <div className="text-[11px] text-zinc-500">Pinjaman kas ke mitra</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('kasir-bayar-bon')}
          className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-zinc-200 hover:border-teal-500 hover:shadow-xs transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center group-hover:bg-teal-600 group-hover:text-white transition-colors">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-900">Bayar Bon</div>
            <div className="text-[11px] text-zinc-500">Pelunasan barang + uang</div>
          </div>
        </button>

        <button
          onClick={() => onNavigate('kasir-transfer')}
          className="flex items-center space-x-3 p-3 bg-white rounded-lg border border-zinc-200 hover:border-sky-500 hover:shadow-xs transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center group-hover:bg-sky-600 group-hover:text-white transition-colors">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-zinc-900">Transfer Rekening</div>
            <div className="text-[11px] text-zinc-500">Mutasi kas internal</div>
          </div>
        </button>
      </div>

      {/* Main KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Uang Perusahaan */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Kas & Bank Ril</span>
            <div className="p-1.5 rounded bg-emerald-50 text-emerald-700">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900">{formatRupiah(stats.totalUangPerusahaan)}</div>
          <div className="mt-2 text-[11px] text-zinc-500 flex justify-between">
            <span>KAS01: {formatRupiah(stats.saldoKas)}</span>
            <span>Bank: {formatRupiah(stats.saldoBank)}</span>
          </div>
        </div>

        {/* Total Piutang BON01 */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Bon Outstanding (BON01)</span>
            <div className="p-1.5 rounded bg-amber-50 text-amber-700">
              <HandCoins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-amber-700">{formatRupiah(stats.totalBonOutstanding)}</div>
          <div className="mt-2 text-[11px] text-zinc-500 flex justify-between">
            <span>Kasbon Uang: {formatRupiah(stats.totalKasbonUangAktif)}</span>
            <span>Kasbon Barang: {formatRupiah(Math.max(0, stats.totalBonOutstanding - stats.totalKasbonUangAktif))}</span>
          </div>
        </div>

        {/* Omzet Penjualan */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Omzet Penjualan Toko</span>
            <div className="p-1.5 rounded bg-blue-50 text-blue-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900">{formatRupiah(stats.totalPenjualan)}</div>
          <div className="mt-2 text-[11px] text-zinc-500">
            Nilai Persediaan Toko: <span className="font-semibold text-zinc-700">{formatRupiah(stats.nilaiStokBarang)}</span>
          </div>
        </div>

        {/* Pembelian Hasil Bumi */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pembelian Hasil Bumi</span>
            <div className="p-1.5 rounded bg-amber-50 text-amber-700">
              <Wheat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-zinc-900">{formatRupiah(stats.totalPembelianHasilBumi)}</div>
          <div className="mt-2 text-[11px] text-zinc-500 flex justify-between">
            <span>Stok Fisik: {(stats.totalVolumeHasilBumiKg / 1000).toFixed(1)} Ton</span>
            <span>Titip: {formatRupiah(stats.totalTitipOutstanding)}</span>
          </div>
        </div>
      </div>

      {/* Saldo Rekening Perusahaan Detail Grid */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-2xs space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Posisi Rekening Perusahaan</h2>
            <p className="text-xs text-zinc-500">Saldo terkini seluruh rekening kas fisik, bank, dan rekening virtual</p>
          </div>
          <button
            onClick={() => onNavigate('master-rekening')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            Kelola Master Rekening &rarr;
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {stats.rekeningList.map((rek) => (
            <div
              key={rek.kode}
              className={`p-3 rounded-lg border text-xs ${
                rek.kode === 'KAS01'
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : rek.isVirtual
                  ? 'bg-amber-50/40 border-amber-200'
                  : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-zinc-800">{rek.kode}</span>
                <span className="text-[10px] text-zinc-500 truncate max-w-[120px]">{rek.atasNama}</span>
              </div>
              <div className="text-zinc-600 text-[11px] truncate mb-1">{rek.nama}</div>
              <div className="text-sm font-bold text-zinc-900">{formatRupiah(rek.saldoSaatIni)}</div>
              {rek.isVirtual && (
                <div className="mt-1 text-[10px] text-amber-700 font-medium">
                  {rek.kode === 'BON01' ? '• Piutang Customer' : '• Hutang Hasil Bumi'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Section: Recent Transactions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900">Aktivitas Transaksi Terbaru</h2>
            <button
              onClick={() => onNavigate('laporan-transaksi')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              Lihat Semua Laporan &rarr;
            </button>
          </div>

          <div className="divide-y divide-zinc-100 overflow-x-auto text-xs">
            {stats.recentTransactions.length === 0 ? (
              <div className="p-6 text-center text-zinc-400">Belum ada transaksi tercatat</div>
            ) : (
              stats.recentTransactions.map((tx) => (
                <div key={tx.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-50/70 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        tx.kategori === 'PENJUALAN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : tx.kategori === 'PEMBELIAN_HASIL_BUMI'
                          ? 'bg-amber-100 text-amber-800'
                          : tx.kategori === 'KASBON_UANG'
                          ? 'bg-rose-100 text-rose-800'
                          : tx.kategori === 'BAYAR_BON'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {tx.kategori === 'PENJUALAN' && <ArrowUpRight className="w-4 h-4" />}
                      {tx.kategori === 'PEMBELIAN_HASIL_BUMI' && <ArrowDownLeft className="w-4 h-4" />}
                      {tx.kategori === 'KASBON_UANG' && <HandCoins className="w-4 h-4" />}
                      {tx.kategori === 'BAYAR_BON' && <Receipt className="w-4 h-4" />}
                      {tx.kategori === 'TRANSFER_REKENING' && <ArrowLeftRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="font-semibold text-zinc-900">{tx.label}</div>
                      <div className="text-[11px] text-zinc-500">
                        {tx.pihakTerkait} · Rek: <span className="font-mono text-zinc-700">{tx.rekening}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-zinc-900">{formatRupiah(tx.nominal)}</div>
                    <div className="text-[10px] text-zinc-500">
                      {tx.tanggal} · {tx.jam}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Low Stock Warning Box (1 col) */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-bold text-zinc-900">Peringatan Stok Menipis</span>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                {stats.stokMenipis.length} Produk
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              {stats.stokMenipis.length === 0 ? (
                <div className="text-center py-6 text-emerald-700 text-xs">
                  Semua stok produk saat ini di atas batas minimum.
                </div>
              ) : (
                stats.stokMenipis.map((item) => (
                  <div key={item.kode} className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/80">
                    <div className="font-semibold text-zinc-900">{item.namaProduk}</div>
                    <div className="flex justify-between text-[11px] text-zinc-600 mt-1">
                      <span>Sisa: <strong className="text-amber-800">{item.stok} {item.satuan}</strong></span>
                      <span>Min: {item.minimum} {item.satuan}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate('stok-barang')}
            className="w-full mt-4 py-2 text-xs font-medium text-center text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
          >
            Buka Manajemen Stok &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
