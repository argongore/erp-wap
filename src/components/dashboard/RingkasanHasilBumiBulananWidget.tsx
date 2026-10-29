import React, { useState, useEffect, useCallback } from 'react';
import { Wheat, ArrowUpRight, ArrowDownLeft, Warehouse, Calendar } from 'lucide-react';
import { api } from '../../api/client.ts';
import { RingkasanStokHasilBumiBulananResponse } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ActiveTab } from '../layout/Sidebar.tsx';

interface Props {
  onNavigate: (tab: ActiveTab) => void;
  refreshTrigger?: unknown;
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

function formatKgCompact(kg: number): string {
  const val = Number(kg) || 0;
  if (Math.abs(val) >= 1000) {
    return `${(val / 1000).toLocaleString('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} Ton`;
  }
  return `${val.toLocaleString('id-ID', { maximumFractionDigits: 1 })} Kg`;
}

export const RingkasanHasilBumiBulananWidget: React.FC<Props> = ({
  onNavigate,
  refreshTrigger,
}) => {
  const now = new Date();
  const [bulan, setBulan] = useState<number>(now.getMonth() + 1);
  const [tahun, setTahun] = useState<number>(now.getFullYear());
  const [data, setData] = useState<RingkasanStokHasilBumiBulananResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchSummary = useCallback(async (silent = false) => {
    if (!silent) {
      setData((prev) => {
        if (!prev) setLoading(true);
        return prev;
      });
    }
    try {
      const res = await api.getRingkasanHasilBumiBulanan({ bulan, tahun });
      setData(res);
    } catch (e) {
      console.error('Failed loading monthly hasil bumi summary:', e);
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun]);

  useEffect(() => {
    fetchSummary(false);
    const onErpUpdated = () => fetchSummary(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [fetchSummary, refreshTrigger]);

  const activeItems = (data?.komoditasItems || []).filter(
    (item) =>
      item.readyGudangSaatIniKg > 0 ||
      item.masukBulanIniKg > 0 ||
      item.terjualBulanIniKg > 0 ||
      item.stokAwalBulanKg > 0
  );

  const displayItems = activeItems.length > 0 ? activeItems : (data?.komoditasItems || []).slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
      {/* Header & Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 flex items-center space-x-2">
            <Wheat className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Ringkasan Stok Hasil Bumi Bulanan (Terjual vs Ready di Gudang)</span>
          </h2>
          <p className="text-xs text-zinc-500">
            Pantau volume hasil panen masuk, volume terjual keluar gudang per bulan, dan sisa fisik Ready di gudang
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1 text-xs">
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
              {(data?.daftarTahunTersedia?.length ? data.daftarTahunTersedia : [tahun]).map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('stok-hasil-bumi')}
            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Kelola &amp; Jual Hasil Bumi &rarr;
          </button>
        </div>
      </div>

      {/* 4 Compact Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="min-w-0 overflow-hidden p-3.5 rounded-lg bg-zinc-50 border border-zinc-200">
          <div className="flex items-center justify-between gap-2 text-zinc-500 mb-1 min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-wider truncate">
              Ready di Gudang
            </span>
            <Warehouse className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          </div>
          <div
            className="text-lg font-bold font-mono tabular-nums text-emerald-800 truncate whitespace-nowrap"
            title={`${(data?.totalReadyGudangKg || 0).toLocaleString('id-ID')} Kg`}
          >
            {loading ? '...' : formatKgCompact(data?.totalReadyGudangKg || 0)}
          </div>
          <div
            className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums truncate"
            title={`Nilai Modal Ready: ${formatRupiah(data?.totalNilaiModalReadyGudang || 0)}`}
          >
            Modal: {formatRupiahSingkat(data?.totalNilaiModalReadyGudang || 0)}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden p-3.5 rounded-lg bg-zinc-50 border border-zinc-200">
          <div className="flex items-center justify-between gap-2 text-zinc-500 mb-1 min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-wider truncate">
              Terjual ({NAMA_BULAN[bulan - 1].slice(0, 3)})
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-sky-700 shrink-0" />
          </div>
          <div
            className="text-lg font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap"
            title={`${(data?.terjualBulanIniKg || 0).toLocaleString('id-ID')} Kg`}
          >
            {loading ? '...' : formatKgCompact(data?.terjualBulanIniKg || 0)}
          </div>
          <div
            className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums truncate"
            title={`Omzet Penjualan Bulan Ini: ${formatRupiah(data?.terjualBulanIniOmzet || 0)}`}
          >
            Omzet: {formatRupiahSingkat(data?.terjualBulanIniOmzet || 0)}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden p-3.5 rounded-lg bg-zinc-50 border border-zinc-200">
          <div className="flex items-center justify-between gap-2 text-zinc-500 mb-1 min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-wider truncate">
              Masuk Beli ({NAMA_BULAN[bulan - 1].slice(0, 3)})
            </span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-amber-700 shrink-0" />
          </div>
          <div
            className="text-lg font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap"
            title={`${(data?.masukBulanIniKg || 0).toLocaleString('id-ID')} Kg`}
          >
            {loading ? '...' : formatKgCompact(data?.masukBulanIniKg || 0)}
          </div>
          <div
            className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums truncate"
            title={`Modal Pembelian Bulan Ini: ${formatRupiah(data?.masukBulanIniNominal || 0)}`}
          >
            Beli: {formatRupiahSingkat(data?.masukBulanIniNominal || 0)}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden p-3.5 rounded-lg bg-zinc-50 border border-zinc-200">
          <div className="flex items-center justify-between gap-2 text-zinc-500 mb-1 min-w-0">
            <span className="text-[11px] font-medium uppercase tracking-wider truncate">
              Laba Jual ({NAMA_BULAN[bulan - 1].slice(0, 3)})
            </span>
            <Wheat className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          </div>
          <div
            className={`text-lg font-bold font-mono tabular-nums truncate whitespace-nowrap ${
              (data?.terjualBulanIniLaba || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
            title={formatRupiah(data?.terjualBulanIniLaba || 0)}
          >
            {loading ? '...' : formatRupiahSingkat(data?.terjualBulanIniLaba || 0)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums truncate">
            {data?.jumlahNotaJualBulanIni || 0} Nota Jual · {data?.jumlahNotaBeliBulanIni || 0} Nota Beli
          </div>
        </div>
      </div>

      {/* Compact Per-Commodity Table */}
      <div className="overflow-x-auto border border-zinc-200 rounded-lg">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Komoditas</th>
              <th className="py-2.5 px-3 text-right">Awal Bulan</th>
              <th className="py-2.5 px-3 text-right">Masuk Beli</th>
              <th className="py-2.5 px-3 text-right">Terjual</th>
              <th className="py-2.5 px-3 text-right">Omzet Jual</th>
              <th className="py-2.5 px-3 text-right">Ready di Gudang</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {displayItems.map((it) => (
              <tr key={it.kode} className="hover:bg-zinc-50/80">
                <td className="py-2.5 px-3 font-semibold text-zinc-900">
                  <span className="font-mono text-[10px] text-zinc-500 mr-1.5">{it.kode}</span>
                  {it.nama}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-600">
                  {it.stokAwalBulanKg.toLocaleString('id-ID')} Kg
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800 font-medium">
                  +{it.masukBulanIniKg.toLocaleString('id-ID')} Kg
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-800 font-semibold">
                  {it.terjualBulanIniKg > 0 ? `-${it.terjualBulanIniKg.toLocaleString('id-ID')} Kg` : '0 Kg'}
                </td>
                <td
                  className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-800"
                  title={formatRupiah(it.terjualBulanIniOmzet)}
                >
                  {formatRupiahSingkat(it.terjualBulanIniOmzet)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-800">
                  {it.readyGudangSaatIniKg.toLocaleString('id-ID')} Kg
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
