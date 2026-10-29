import React, { useState, useEffect } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Copy,
  Check,
  Printer,
  ChevronRight,
  Building2,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Landmark,
  ShieldCheck,
  Scale,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { formatRupiah, formatRupiahSingkat, formatTanggalIndo, getWIBTodayString } from '../../utils/format.ts';
import { ActiveTab } from '../layout/Sidebar.tsx';

interface Props {
  onNavigate?: (tab: ActiveTab) => void;
  onRefreshParent?: () => void;
}

export const BukuKasHarianBosWidget: React.FC<Props> = ({ onNavigate, onRefreshParent }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getWIBTodayString());
  const [data, setData] = useState<{
    tanggal: string;
    totalUangMasuk: number;
    rincianMasuk: {
      penjualanToko: number;
      bayarBon: number;
      droppingMasuk: number;
      jumlahTransaksi: number;
    };
    totalUangKeluar: number;
    rincianKeluar: {
      pengeluaranDivisi: number;
      beliHasilBumi: number;
      kasbonUang: number;
      kulakanBarang: number;
      pencairanTitipan: number;
      upahGaji: number;
      jumlahTransaksi: number;
    };
    arusKasBersih: number;
    saldoKasFisik: number;
    saldoTotalBank: number;
    totalSaldoRil: number;
    rekapDivisiHariIni: Array<{
      divisi: string;
      total: number;
      count: number;
    }>;
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [copiedWA, setCopiedWA] = useState<boolean>(false);

  const loadData = async (tgl: string, silent = false) => {
    if (!silent && !data) setLoading(true);
    try {
      const res = await api.getRekapHarianKas(tgl);
      setData(res);
    } catch (err) {
      console.warn('Gagal memuat rekap arus kas harian bos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedDate, Boolean(data));
  }, [selectedDate]);

  useEffect(() => {
    const onErpUpdated = () => loadData(selectedDate, true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, [selectedDate]);

  const handleCopyWhatsApp = () => {
    if (!data) return;

    const tglTeks = formatTanggalIndo(selectedDate);
    const surplusDefisit = data.arusKasBersih >= 0 ? 'SURPLUS (+)' : 'DEFISIT (-)';

    const divLines =
      data.rekapDivisiHariIni.length > 0
        ? data.rekapDivisiHariIni
            .map((d) => `  • ${d.divisi}: ${formatRupiah(d.total)} (${d.count} trx)`)
            .join('\n')
        : '  • Tidak ada pengeluaran divisi hari ini';

    const msg = `*LAPORAN REKAP HARIAN KAS & ARUS KEUANGAN*
*PT. WIJAYA AGRO PERKASA*
Hari / Tanggal: ${tglTeks}

==============================
🟢 *TOTAL UANG MASUK: ${formatRupiah(data.totalUangMasuk)}*
  • Penjualan Toko: ${formatRupiah(data.rincianMasuk.penjualanToko)}
  • Pelunasan / Bayar Bon: ${formatRupiah(data.rincianMasuk.bayarBon)}
  • Dropping / Kas Lainnya: ${formatRupiah(data.rincianMasuk.droppingMasuk)}
  _Total: ${data.rincianMasuk.jumlahTransaksi} transaksi masuk_

🔴 *TOTAL UANG KELUAR: ${formatRupiah(data.totalUangKeluar)}*
  • Operasional Divisi: ${formatRupiah(data.rincianKeluar.pengeluaranDivisi)}
  • Pembelian Panen Petani: ${formatRupiah(data.rincianKeluar.beliHasilBumi)}
  • Pencairan Kasbon Uang: ${formatRupiah(data.rincianKeluar.kasbonUang)}
  • Kulakan Barang Toko: ${formatRupiah(data.rincianKeluar.kulakanBarang)}
  • Pencairan Titip Panen: ${formatRupiah(data.rincianKeluar.pencairanTitipan)}
  • Beban Upah / Gaji: ${formatRupiah(data.rincianKeluar.upahGaji)}
  _Total: ${data.rincianKeluar.jumlahTransaksi} transaksi keluar_

⚖️ *ARUS KAS BERSIH (${surplusDefisit}): ${formatRupiah(data.arusKasBersih)}*

==============================
📊 *RINCIAN PENGELUARAN DIVISI HARI INI:*
${divLines}

==============================
💰 *POSISI SALDO KEUANGAN:*
  • Kas Fisik (Brankas): ${formatRupiah(data.saldoKasFisik)}
  • Total Rekening Bank: ${formatRupiah(data.saldoTotalBank)}
  • Total Kas & Bank Riil: ${formatRupiah(data.totalSaldoRil)}

_Laporan otomatis terintegrasi dari ERP PT. WIJAYA AGRO PERKASA_`;

    navigator.clipboard.writeText(msg).then(() => {
      setCopiedWA(true);
      setTimeout(() => setCopiedWA(false), 3000);
    });
  };

  const handlePrintSlip = () => {
    window.print();
  };

  const handleSetQuickToday = () => {
    setSelectedDate(getWIBTodayString());
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 sm:p-6 space-y-5">
      {/* Header Widget */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-50 border border-amber-200/70 rounded-xl text-amber-700">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Buku Arus Kas Harian (Rekapan Harian Bos)
              </h2>
              <p className="text-xs text-slate-500">
                Perhitungan otomatis uang masuk &amp; uang keluar harian sesuai pembukuan kasir tanpa input ganda
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-800 text-xs font-semibold focus:outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleSetQuickToday}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Hari Ini
          </button>

          <button
            type="button"
            onClick={handleCopyWhatsApp}
            disabled={!data || loading}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-2xs transition-colors cursor-pointer"
            title="Salin rekap harian ke format teks WhatsApp untuk dilaporkan ke bos"
          >
            {copiedWA ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedWA ? 'Tersalin WA!' : 'Salin Format WA Bos'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintSlip}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Cetak lembar rekap harian"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              loadData(selectedDate);
              onRefreshParent?.();
            }}
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Segarkan data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center py-10 text-xs text-slate-400">
          <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full mr-2" />
          Menghitung pergerakan arus kas harian...
        </div>
      ) : (
        <div className="space-y-4">
          {/* 3 Large KPI Summary Cards: Uang Masuk, Uang Keluar, Arus Kas Bersih */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {/* Card 1: TOTAL UANG MASUK */}
            <div className="min-w-0 overflow-hidden p-4 rounded-xl border border-emerald-200/90 bg-emerald-50/40 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-emerald-800 min-w-0">
                <span className="flex items-center space-x-1.5 min-w-0 truncate">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="truncate">Uang Masuk (Kas In)</span>
                </span>
                <span className="text-[11px] font-mono tabular-nums text-emerald-700 font-semibold shrink-0">
                  {data.rincianMasuk.jumlahTransaksi} Trx
                </span>
              </div>
              <div
                className="text-2xl font-black font-mono tabular-nums text-emerald-950 tracking-tight truncate whitespace-nowrap"
                title={formatRupiah(data.totalUangMasuk)}
              >
                {formatRupiahSingkat(data.totalUangMasuk)}
              </div>
              <div className="text-[11px] text-emerald-800/80 space-y-1 pt-1.5 border-t border-emerald-200/60">
                <div className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">• Penjualan Toko Kasir:</span>
                  <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianMasuk.penjualanToko)}>
                    {formatRupiahSingkat(data.rincianMasuk.penjualanToko)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">• Setoran Pelunasan Bon:</span>
                  <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianMasuk.bayarBon)}>
                    {formatRupiahSingkat(data.rincianMasuk.bayarBon)}
                  </span>
                </div>
                {data.rincianMasuk.droppingMasuk > 0 && (
                  <div className="flex justify-between gap-2 min-w-0">
                    <span className="truncate">• Dropping Masuk:</span>
                    <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianMasuk.droppingMasuk)}>
                      {formatRupiahSingkat(data.rincianMasuk.droppingMasuk)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: TOTAL UANG KELUAR */}
            <div className="min-w-0 overflow-hidden p-4 rounded-xl border border-rose-200 bg-rose-50/50 space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs font-bold text-rose-800 min-w-0">
                <span className="flex items-center space-x-1.5 min-w-0 truncate">
                  <ArrowDownRight className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="truncate">TOTAL UANG KELUAR (KAS OUT)</span>
                </span>
                <span className="text-[10px] bg-rose-200/80 text-rose-900 px-2 py-0.5 rounded-full font-bold shrink-0">
                  {data.rincianKeluar.jumlahTransaksi} Trx
                </span>
              </div>
              <div
                className="text-2xl font-black font-mono tabular-nums text-rose-950 tracking-tight truncate whitespace-nowrap"
                title={formatRupiah(data.totalUangKeluar)}
              >
                {formatRupiahSingkat(data.totalUangKeluar)}
              </div>
              <div className="text-[11px] text-rose-800/80 space-y-1 pt-1.5 border-t border-rose-200/60">
                <div className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">• Operasional Divisi:</span>
                  <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianKeluar.pengeluaranDivisi)}>
                    {formatRupiahSingkat(data.rincianKeluar.pengeluaranDivisi)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">• Pembelian Panen Petani:</span>
                  <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianKeluar.beliHasilBumi)}>
                    {formatRupiahSingkat(data.rincianKeluar.beliHasilBumi)}
                  </span>
                </div>
                <div className="flex justify-between gap-2 min-w-0">
                  <span className="truncate">• Pencairan Kasbon Uang:</span>
                  <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianKeluar.kasbonUang)}>
                    {formatRupiahSingkat(data.rincianKeluar.kasbonUang)}
                  </span>
                </div>
                {data.rincianKeluar.kulakanBarang > 0 && (
                  <div className="flex justify-between gap-2 min-w-0">
                    <span className="truncate">• Kulakan Toko:</span>
                    <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianKeluar.kulakanBarang)}>
                      {formatRupiahSingkat(data.rincianKeluar.kulakanBarang)}
                    </span>
                  </div>
                )}
                {data.rincianKeluar.pencairanTitipan > 0 && (
                  <div className="flex justify-between gap-2 min-w-0">
                    <span className="truncate">• Cairkan Titip Panen:</span>
                    <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianKeluar.pencairanTitipan)}>
                      {formatRupiahSingkat(data.rincianKeluar.pencairanTitipan)}
                    </span>
                  </div>
                )}
                {data.rincianKeluar.upahGaji > 0 && (
                  <div className="flex justify-between gap-2 min-w-0">
                    <span className="truncate">• Beban Upah / Gaji:</span>
                    <span className="font-semibold font-mono tabular-nums whitespace-nowrap shrink-0" title={formatRupiah(data.rincianKeluar.upahGaji)}>
                      {formatRupiahSingkat(data.rincianKeluar.upahGaji)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: ARUS KAS BERSIH (NET) */}
            <div
              className={`min-w-0 overflow-hidden p-4 rounded-xl border space-y-2 ${
                data.arusKasBersih >= 0
                  ? 'border-indigo-200 bg-indigo-50/50'
                  : 'border-amber-300 bg-amber-50/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-bold min-w-0">
                <span className="flex items-center space-x-1.5 text-zinc-800 min-w-0 truncate">
                  <TrendingUp className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="truncate">ARUS KAS BERSIH (NET FLOW)</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    data.arusKasBersih >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {data.arusKasBersih >= 0 ? 'SURPLUS' : 'DEFISIT'}
                </span>
              </div>
              <div
                className={`text-2xl font-black font-mono tabular-nums tracking-tight truncate whitespace-nowrap ${
                  data.arusKasBersih >= 0 ? 'text-indigo-950' : 'text-amber-950'
                }`}
                title={`${data.arusKasBersih >= 0 ? '+' : ''}${formatRupiah(data.arusKasBersih)}`}
              >
                {data.arusKasBersih >= 0 ? '+' : ''}
                {formatRupiahSingkat(data.arusKasBersih)}
              </div>
              <p className="text-[11px] text-zinc-500 pt-1 border-t border-zinc-200">
                Selisih kas masuk dikurangi kas keluar pada {formatTanggalIndo(selectedDate)}.
              </p>
              <div className="pt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-600 font-medium min-w-0">
                <span className="truncate">Saldo Kas Fisik Kasir:</span>
                <span
                  className="font-bold text-zinc-900 font-mono tabular-nums whitespace-nowrap shrink-0"
                  title={formatRupiah(data.saldoKasFisik)}
                >
                  {formatRupiahSingkat(data.saldoKasFisik)}
                </span>
              </div>
            </div>
          </div>

          {/* Breakdown Pengeluaran per Divisi Hari Ini */}
          {data.rekapDivisiHariIni.length > 0 && (
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-800 flex items-center space-x-1.5">
                  <Building2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Rincian Pengeluaran Per Divisi ({data.rekapDivisiHariIni.length} Divisi Bergerak):</span>
                </span>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('kasir-pengeluaran')}
                    className="text-[11px] font-bold text-rose-700 hover:text-rose-900 flex items-center space-x-1 cursor-pointer"
                  >
                    <span>Buka Menu Pengeluaran Divisi</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {data.rekapDivisiHariIni.map((div) => (
                  <div
                    key={div.divisi}
                    className="min-w-0 overflow-hidden p-2.5 rounded-lg bg-white border border-zinc-200 text-xs shadow-2xs"
                  >
                    <div className="font-bold text-zinc-900 truncate text-[11px]">{div.divisi}</div>
                    <div
                      className="font-bold text-rose-700 font-mono tabular-nums text-xs mt-0.5 truncate whitespace-nowrap"
                      title={formatRupiah(div.total)}
                    >
                      {formatRupiahSingkat(div.total)}
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 truncate">{div.count} pengeluaran</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Footnote info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100 gap-2">
            <span className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline" />
              <span>Logic pembukuan harian bos ini aktif secara real-time dan terverifikasi dengan buku kasir.</span>
            </span>
            <span>PT. WIJAYA AGRO PERKASA</span>
          </div>
        </div>
      )}
    </div>
  );
};
