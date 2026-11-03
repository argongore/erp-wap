import React, { useMemo, useState, useDeferredValue } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
} from 'lucide-react';
import {
  ItemDivisi,
  MutasiKeuanganDivisi,
  PergerakanKeuanganDivisiSummary,
} from '../../server/types.ts';
import {
  dmyToIsoInput,
  formatRupiah,
  formatRupiahSingkat,
  getWIBTodayString,
} from '../../utils/format.ts';
import { DivisiLogoAvatar, resolveDivisiLogoUrl } from '../common/DivisiLogoAvatar.tsx';

type PeriodeFilterDivisi = 'SEMUA' | 'HARI_INI' | 'BULAN_INI' | 'RENTANG';
type ModeArusKasDivisi = 'OPERASIONAL' | 'SEMUA_MUTASI';
type FilterPosisiDivisi = 'ALL' | 'SURPLUS' | 'DEFISIT';
type FilterArahMutasi = 'ALL' | 'MASUK' | 'KELUAR';

interface ArusKasDivisiBosViewProps {
  divisiData: PergerakanKeuanganDivisiSummary[];
  divisiMasterList: ItemDivisi[];
  loading: boolean;
}

function parseDmyToComparable(dmy?: string): string {
  const s = String(dmy || '').trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }
  return '';
}

function getJenisMutasiLabel(jenis: MutasiKeuanganDivisi['jenis']): string {
  switch (jenis) {
    case 'PENJUALAN_MASUK':
      return 'Uang Masuk / Penjualan';
    case 'PEMBELIAN_KELUAR':
      return 'Belanja Modal / Pembelian';
    case 'PENGELUARAN_OPERASIONAL':
      return 'Pengeluaran Operasional';
    case 'GAJI_KARYAWAN':
      return 'Gaji & Upah Karyawan';
    case 'DROPPING_MASUK':
      return 'Dropping Dana Masuk';
    case 'TRANSFER_KELUAR':
      return 'Transfer Dana Keluar';
    default:
      return 'Mutasi Lainnya';
  }
}

export const ArusKasDivisiBosView: React.FC<ArusKasDivisiBosViewProps> = ({
  divisiData,
  divisiMasterList,
  loading,
}) => {
  const todayDmy = useMemo(() => getWIBTodayString(), []);
  const todayIso = useMemo(() => dmyToIsoInput(todayDmy), [todayDmy]);
  const currentYearMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);

  const [periode, setPeriode] = useState<PeriodeFilterDivisi>('SEMUA');
  const [startDateIso, setStartDateIso] = useState<string>(() => `${todayIso.slice(0, 7)}-01`);
  const [endDateIso, setEndDateIso] = useState<string>(() => todayIso);
  const [modeArus, setModeArus] = useState<ModeArusKasDivisi>('OPERASIONAL');
  const [posisiFilter, setPosisiFilter] = useState<FilterPosisiDivisi>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(searchQuery);

  const [expandedDivisiId, setExpandedDivisiId] = useState<string | null>(null);
  const [arahMutasiFilter, setArahMutasiFilter] = useState<FilterArahMutasi>('ALL');
  const [mutasiSearch, setMutasiSearch] = useState<string>('');
  const deferredMutasiSearch = useDeferredValue(mutasiSearch);
  const [mutasiLimit, setMutasiLimit] = useState<number>(40);

  const matchesDateFilter = useMemo(() => {
    return (tanggalDmy: string): boolean => {
      if (periode === 'SEMUA') return true;
      const iso = parseDmyToComparable(tanggalDmy);
      if (!iso) return false;
      if (periode === 'HARI_INI') return iso === todayIso;
      if (periode === 'BULAN_INI') return iso.startsWith(currentYearMonth);
      if (periode === 'RENTANG') {
        if (startDateIso && iso < startDateIso) return false;
        if (endDateIso && iso > endDateIso) return false;
        return true;
      }
      return true;
    };
  }, [periode, todayIso, currentYearMonth, startDateIso, endDateIso]);

  const computedDivisiList = useMemo(() => {
    return divisiData.map((d) => {
      const allMutasi = Array.isArray(d.mutasi) ? d.mutasi : [];
      const dateFilteredMutasi =
        periode === 'SEMUA'
          ? allMutasi
          : allMutasi.filter((m) => matchesDateFilter(m.tanggal));

      let penjualanMasuk = 0;
      let droppingMasuk = 0;
      let pembelianKeluar = 0;
      let pengeluaranOps = 0;
      let gajiKeluar = 0;
      let transferKeluar = 0;
      let lainnyaMasuk = 0;
      let lainnyaKeluar = 0;
      let countMasuk = 0;
      let countKeluar = 0;

      if (periode === 'SEMUA' && allMutasi.length === 0) {
        penjualanMasuk = Number(d.totalPenjualanMasuk) || 0;
        droppingMasuk = Number(d.totalDroppingMasuk) || 0;
        pembelianKeluar = Number(d.totalPembelianKeluar) || 0;
        pengeluaranOps = Number(d.totalPengeluaranOperasional) || 0;
        gajiKeluar = Number(d.totalGajiKeluar) || 0;
        transferKeluar = Number(d.totalTransferKeluar) || 0;
      } else {
        for (const m of dateFilteredMutasi) {
          const inAmt = Number(m.masuk) || 0;
          const outAmt = Number(m.keluar) || 0;
          if (m.jenis === 'DROPPING_MASUK') {
            droppingMasuk += inAmt;
            if (modeArus === 'SEMUA_MUTASI' && inAmt > 0) countMasuk += 1;
          } else if (m.jenis === 'TRANSFER_KELUAR') {
            transferKeluar += outAmt;
            if (modeArus === 'SEMUA_MUTASI' && outAmt > 0) countKeluar += 1;
          } else if (m.jenis === 'PENJUALAN_MASUK') {
            penjualanMasuk += inAmt;
            if (inAmt > 0) countMasuk += 1;
            if (outAmt > 0) {
              lainnyaKeluar += outAmt;
              countKeluar += 1;
            }
          } else if (m.jenis === 'PEMBELIAN_KELUAR') {
            pembelianKeluar += outAmt;
            if (outAmt > 0) countKeluar += 1;
            if (inAmt > 0) {
              lainnyaMasuk += inAmt;
              countMasuk += 1;
            }
          } else if (m.jenis === 'PENGELUARAN_OPERASIONAL') {
            pengeluaranOps += outAmt - inAmt;
            if (outAmt > 0 || inAmt > 0) countKeluar += 1;
          } else if (m.jenis === 'GAJI_KARYAWAN') {
            gajiKeluar += outAmt;
            if (outAmt > 0) countKeluar += 1;
          } else {
            lainnyaMasuk += inAmt;
            lainnyaKeluar += outAmt;
            if (inAmt > 0) countMasuk += 1;
            if (outAmt > 0) countKeluar += 1;
          }
        }
      }

      const safePengeluaranOps = Math.max(0, pengeluaranOps);
      const koreksiPengeluaranMasuk = pengeluaranOps < 0 ? Math.abs(pengeluaranOps) : 0;

      const uangMasukOperasional = penjualanMasuk + lainnyaMasuk + koreksiPengeluaranMasuk;
      const uangKeluarOperasional =
        pembelianKeluar + safePengeluaranOps + gajiKeluar + lainnyaKeluar;

      const totalIn =
        modeArus === 'SEMUA_MUTASI'
          ? uangMasukOperasional + droppingMasuk
          : uangMasukOperasional;
      const totalOut =
        modeArus === 'SEMUA_MUTASI'
          ? uangKeluarOperasional + transferKeluar
          : uangKeluarOperasional;
      const netCashFlow = totalIn - totalOut;

      const visibleMutasi =
        modeArus === 'SEMUA_MUTASI'
          ? dateFilteredMutasi
          : dateFilteredMutasi.filter(
              (m) => m.jenis !== 'DROPPING_MASUK' && m.jenis !== 'TRANSFER_KELUAR'
            );

      return {
        raw: d,
        totalIn,
        totalOut,
        netCashFlow,
        penjualanMasuk: uangMasukOperasional,
        droppingMasuk,
        pembelianKeluar,
        pengeluaranOps: safePengeluaranOps,
        gajiKeluar,
        transferKeluar,
        countMasuk,
        countKeluar,
        visibleMutasi,
      };
    });
  }, [divisiData, periode, matchesDateFilter, modeArus]);

  const globalTotals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalPenjualan = 0;
    let totalPembelian = 0;
    let totalPengeluaran = 0;
    let totalGaji = 0;
    let totalSaldoBuku = 0;
    let surplusCount = 0;
    let defisitCount = 0;

    for (const item of computedDivisiList) {
      totalIn += item.totalIn;
      totalOut += item.totalOut;
      totalPenjualan += item.penjualanMasuk;
      totalPembelian += item.pembelianKeluar;
      totalPengeluaran += item.pengeluaranOps;
      totalGaji += item.gajiKeluar;
      totalSaldoBuku += Number(item.raw.saldoSaatIni) || 0;
      if (item.netCashFlow > 0) surplusCount += 1;
      else if (item.netCashFlow < 0) defisitCount += 1;
    }

    return {
      totalIn,
      totalOut,
      netCashFlow: totalIn - totalOut,
      totalPenjualan,
      totalPembelian,
      totalPengeluaran,
      totalGaji,
      totalSaldoBuku,
      surplusCount,
      defisitCount,
    };
  }, [computedDivisiList]);

  const filteredDivisiList = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return computedDivisiList.filter((item) => {
      if (posisiFilter === 'SURPLUS' && item.netCashFlow <= 0) return false;
      if (posisiFilter === 'DEFISIT' && item.netCashFlow >= 0) return false;
      if (!q) return true;
      const d = item.raw;
      const matchHeader =
        d.divisi.toLowerCase().includes(q) ||
        d.kodeRekening.toLowerCase().includes(q) ||
        (d.penanggungJawab || '').toLowerCase().includes(q);
      if (matchHeader) return true;
      return item.visibleMutasi.some(
        (m) =>
          m.keterangan.toLowerCase().includes(q) ||
          (m.pihakTerkait || '').toLowerCase().includes(q) ||
          m.refId.toLowerCase().includes(q)
      );
    });
  }, [computedDivisiList, posisiFilter, deferredSearch]);

  const handleToggleDivisi = (idDivisi: string) => {
    if (expandedDivisiId === idDivisi) {
      setExpandedDivisiId(null);
    } else {
      setExpandedDivisiId(idDivisi);
      setArahMutasiFilter('ALL');
      setMutasiSearch('');
      setMutasiLimit(40);
    }
  };

  return (
    <div className="space-y-5">
      {/* Executive Cash Flow Anchor */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Selisih Arus Kas Bersih Seluruh Divisi (Total Uang Masuk − Total Uang Keluar)
            </p>
            <div
              className={`mt-1 font-mono text-2xl sm:text-4xl font-bold tracking-tight tabular-nums ${
                globalTotals.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {globalTotals.netCashFlow > 0 ? '+' : ''}
              {formatRupiah(globalTotals.netCashFlow)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {computedDivisiList.length} divisi dipantau · {globalTotals.surplusCount} divisi surplus ·{' '}
              {globalTotals.defisitCount} divisi defisit
            </p>
          </div>

          {/* Mode Arus Kas Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
            <button
              type="button"
              onClick={() => setModeArus('OPERASIONAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                modeArus === 'OPERASIONAL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cash Flow Operasional Murni
            </button>
            <button
              type="button"
              onClick={() => setModeArus('SEMUA_MUTASI')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                modeArus === 'SEMUA_MUTASI'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Termasuk Dropping &amp; Transfer
            </button>
          </div>
        </div>

        {/* 4 Primary In / Out / Breakdown Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Total Uang Masuk Divisi (IN)</span>
            </div>
            <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums">
              +{formatRupiah(globalTotals.totalIn)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              Penjualan &amp; Kas Masuk: {formatRupiahSingkat(globalTotals.totalPenjualan)}
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-700 shrink-0" />
              <span>Total Uang Keluar Divisi (OUT)</span>
            </div>
            <div className="font-mono text-xl font-bold text-rose-700 tabular-nums">
              −{formatRupiah(globalTotals.totalOut)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              Modal {formatRupiahSingkat(globalTotals.totalPembelian)} · Ops{' '}
              {formatRupiahSingkat(globalTotals.totalPengeluaran)}
            </div>
          </div>

          <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-xs text-slate-500">Rincian Beban &amp; Gaji Divisi</div>
            <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatRupiah(globalTotals.totalPengeluaran + globalTotals.totalGaji)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              Pengeluaran {formatRupiahSingkat(globalTotals.totalPengeluaran)} · Gaji{' '}
              {formatRupiahSingkat(globalTotals.totalGaji)}
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Total Saldo Buku Divisi Saat Ini</div>
            <div
              className={`font-mono text-xl font-bold tabular-nums ${
                globalTotals.totalSaldoBuku >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {formatRupiah(globalTotals.totalSaldoBuku)}
            </div>
            <div className="text-[11px] text-slate-500">
              Akumulasi saldo buku rekening divisi
            </div>
          </div>
        </div>

        {/* Period, Position & Search Controls */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
              <button
                type="button"
                onClick={() => setPeriode('SEMUA')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  periode === 'SEMUA'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Waktu
              </button>
              <button
                type="button"
                onClick={() => setPeriode('HARI_INI')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  periode === 'HARI_INI'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hari Ini ({todayDmy})
              </button>
              <button
                type="button"
                onClick={() => setPeriode('BULAN_INI')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  periode === 'BULAN_INI'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => setPeriode('RENTANG')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                  periode === 'RENTANG'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Rentang Tanggal</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
              <button
                type="button"
                onClick={() => setPosisiFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  posisiFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Divisi ({computedDivisiList.length})
              </button>
              <button
                type="button"
                onClick={() => setPosisiFilter('SURPLUS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  posisiFilter === 'SURPLUS'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Surplus In &gt; Out ({globalTotals.surplusCount})
              </button>
              <button
                type="button"
                onClick={() => setPosisiFilter('DEFISIT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  posisiFilter === 'DEFISIT'
                    ? 'bg-white text-rose-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Defisit Out &gt; In ({globalTotals.defisitCount})
              </button>
            </div>
          </div>

          {periode === 'RENTANG' && (
            <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="font-semibold text-slate-700">Dari Tanggal:</span>
              <input
                type="date"
                value={startDateIso}
                onChange={(e) => setStartDateIso(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="font-semibold text-slate-700">Sampai:</span>
              <input
                type="date"
                value={endDateIso}
                onChange={(e) => setEndDateIso(e.target.value)}
                className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}

          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama divisi, kode rekening, atau keterangan mutasi..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
        </div>
      </section>

      {/* Per-Division Cash Flow In / Out Table & Expandable Ledger */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Rekapitulasi Arus Kas Masuk (IN) &amp; Keluar (OUT) per Divisi Usaha
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik baris divisi untuk membuka buku mutasi lengkap uang masuk dan uang keluar pada divisi tersebut
            </p>
          </div>
        </div>

        {loading && divisiData.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Memuat arus kas per divisi...
          </div>
        ) : filteredDivisiList.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Tidak ada divisi yang sesuai dengan filter periode atau pencarian saat ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDivisiList.map((item) => {
              const d = item.raw;
              const isOpen = expandedDivisiId === d.idDivisi;
              const divMaster = divisiMasterList.find(
                (m) => m.id === d.idDivisi || m.nama.toLowerCase() === d.divisi.toLowerCase()
              );
              const divLogo = resolveDivisiLogoUrl(
                d.divisi,
                d.logoUrl || divMaster?.logoUrl,
                divisiMasterList
              );
              const pjLabel = d.penanggungJawab || divMaster?.penanggungJawab;

              const detailMutasiFiltered = isOpen
                ? item.visibleMutasi.filter((m) => {
                    if (arahMutasiFilter === 'MASUK' && (Number(m.masuk) || 0) <= 0) return false;
                    if (arahMutasiFilter === 'KELUAR' && (Number(m.keluar) || 0) <= 0) return false;
                    const mq = deferredMutasiSearch.trim().toLowerCase();
                    if (!mq) return true;
                    return (
                      m.keterangan.toLowerCase().includes(mq) ||
                      (m.pihakTerkait || '').toLowerCase().includes(mq) ||
                      m.refId.toLowerCase().includes(mq) ||
                      (m.rekeningFisik || '').toLowerCase().includes(mq)
                    );
                  })
                : [];

              const displayedMutasi = detailMutasiFiltered.slice(0, mutasiLimit);

              return (
                <div key={d.idDivisi}>
                  <button
                    type="button"
                    onClick={() => handleToggleDivisi(d.idDivisi)}
                    className="w-full px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                      <DivisiLogoAvatar
                        namaDivisi={d.divisi}
                        logoUrl={divLogo}
                        size="md"
                        theme="light"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-bold text-sm sm:text-base text-slate-900">
                            {d.divisi}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            · {d.kodeRekening}
                          </span>
                          {pjLabel && (
                            <span className="text-xs text-slate-500">· PJ: {pjLabel}</span>
                          )}
                        </div>

                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono tabular-nums">
                          <span>{item.visibleMutasi.length} mutasi</span>
                          <span>·</span>
                          <span>Belanja Modal {formatRupiahSingkat(item.pembelianKeluar)}</span>
                          <span>·</span>
                          <span>Pengeluaran {formatRupiahSingkat(item.pengeluaranOps)}</span>
                          <span>·</span>
                          <span>Gaji {formatRupiahSingkat(item.gajiKeluar)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Side-by-side Cash Flow Columns: IN | OUT | NET CASH FLOW */}
                    <div className="grid grid-cols-3 sm:flex sm:items-center gap-3 sm:gap-6 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <div className="text-[11px] text-slate-400">Uang Masuk (IN)</div>
                        <div className="font-mono text-xs sm:text-sm font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                          +{formatRupiah(item.totalIn)}
                        </div>
                      </div>

                      <div className="text-left sm:text-right">
                        <div className="text-[11px] text-slate-400">Uang Keluar (OUT)</div>
                        <div className="font-mono text-xs sm:text-sm font-bold text-rose-700 tabular-nums whitespace-nowrap">
                          −{formatRupiah(item.totalOut)}
                        </div>
                      </div>

                      <div className="text-right flex items-center justify-end gap-2">
                        <div>
                          <div className="text-[11px] text-slate-400">Cash Flow Bersih</div>
                          <div
                            className={`font-mono text-xs sm:text-base font-bold tabular-nums whitespace-nowrap ${
                              item.netCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {item.netCashFlow > 0 ? '+' : ''}
                            {formatRupiah(item.netCashFlow)}
                          </div>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 pt-4 bg-slate-50/70 border-t border-slate-100 space-y-4">
                      {/* Breakdown Strip for Selected Division */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs pb-3 border-b border-slate-200/70">
                        <div>
                          <span className="text-slate-500">Penjualan / Kas Masuk</span>
                          <div className="font-mono font-bold text-emerald-700 tabular-nums mt-0.5">
                            +{formatRupiah(item.penjualanMasuk)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Belanja Barang / HB</span>
                          <div className="font-mono font-bold text-rose-700 tabular-nums mt-0.5">
                            −{formatRupiah(item.pembelianKeluar)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Pengeluaran Divisi</span>
                          <div className="font-mono font-bold text-rose-700 tabular-nums mt-0.5">
                            −{formatRupiah(item.pengeluaranOps)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Gaji &amp; Upah Cair</span>
                          <div className="font-mono font-bold text-rose-700 tabular-nums mt-0.5">
                            −{formatRupiah(item.gajiKeluar)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Dropping / Transfer</span>
                          <div className="font-mono font-semibold text-slate-700 tabular-nums mt-0.5">
                            +{formatRupiahSingkat(item.droppingMasuk)} / −
                            {formatRupiahSingkat(item.transferKeluar)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Saldo Buku Divisi</span>
                          <div
                            className={`font-mono font-bold tabular-nums mt-0.5 ${
                              d.saldoSaatIni >= 0 ? 'text-slate-900' : 'text-rose-700'
                            }`}
                          >
                            {formatRupiah(d.saldoSaatIni)}
                          </div>
                        </div>
                      </div>

                      {/* Drilldown Filter Controls */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start">
                          <button
                            type="button"
                            onClick={() => setArahMutasiFilter('ALL')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              arahMutasiFilter === 'ALL'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Semua Mutasi ({item.visibleMutasi.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setArahMutasiFilter('MASUK')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              arahMutasiFilter === 'MASUK'
                                ? 'bg-white text-emerald-800 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Uang Masuk (+)
                          </button>
                          <button
                            type="button"
                            onClick={() => setArahMutasiFilter('KELUAR')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              arahMutasiFilter === 'KELUAR'
                                ? 'bg-white text-rose-800 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Uang Keluar (−)
                          </button>
                        </div>

                        <div className="relative flex-1 max-w-xs">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={mutasiSearch}
                            onChange={(e) => setMutasiSearch(e.target.value)}
                            placeholder="Cari di mutasi divisi ini..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          />
                        </div>
                      </div>

                      {/* Mutation Table */}
                      {detailMutasiFiltered.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 bg-white border border-slate-200 rounded-xl">
                          Tidak ada transaksi arus kas pada filter ini.
                        </div>
                      ) : (
                        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/70">
                                <th className="py-2.5 px-3 font-semibold">Tanggal &amp; Jam</th>
                                <th className="py-2.5 px-3 font-semibold">Kategori Arus Kas</th>
                                <th className="py-2.5 px-3 font-semibold">Rincian Transaksi</th>
                                <th className="py-2.5 px-3 font-semibold hidden md:table-cell">
                                  Rekening
                                </th>
                                <th className="py-2.5 px-3 font-semibold text-right">
                                  Uang Masuk (+)
                                </th>
                                <th className="py-2.5 px-3 font-semibold text-right">
                                  Uang Keluar (−)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {displayedMutasi.map((m) => (
                                <tr key={m.id} className="hover:bg-slate-50/60">
                                  <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                                    <div>{m.tanggal}</div>
                                    <div className="text-[11px] text-slate-400">
                                      {m.jam || '-'} · {m.refId}
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span
                                      className={`font-semibold ${
                                        m.masuk > 0 ? 'text-emerald-800' : 'text-rose-800'
                                      }`}
                                    >
                                      {getJenisMutasiLabel(m.jenis)}
                                    </span>
                                    {m.pihakTerkait && (
                                      <div className="text-[11px] text-slate-500">
                                        {m.pihakTerkait}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-800 max-w-md">
                                    {m.keterangan}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-600 hidden md:table-cell whitespace-nowrap">
                                    {m.rekeningFisik || d.kodeRekening}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                    {m.masuk > 0 ? `+${formatRupiah(m.masuk)}` : '-'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700 tabular-nums whitespace-nowrap">
                                    {m.keluar > 0 ? `−${formatRupiah(m.keluar)}` : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {detailMutasiFiltered.length > mutasiLimit && (
                            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                              <span>
                                Menampilkan {displayedMutasi.length} dari{' '}
                                {detailMutasiFiltered.length} mutasi divisi
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setMutasiLimit((prev) => prev + 50)}
                                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                                >
                                  Tampilkan +50
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMutasiLimit(detailMutasiFiltered.length)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 cursor-pointer"
                                >
                                  Tampilkan Semua
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
