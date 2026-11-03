import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
  Search,
  Calendar,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  DAFTAR_DIVISI,
  ItemDivisi,
  ItemInventaris,
  KelompokItemPengeluaran,
  MasterItemPengeluaran,
  TransaksiPengeluaran,
  isTanpaDivisi,
  resolveKelompokItemPengeluaran,
} from '../../server/types.ts';
import {
  dmyToIsoInput,
  formatRupiah,
  formatRupiahSingkat,
  getWIBTodayString,
} from '../../utils/format.ts';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

type PeriodeFilterPengeluaran = 'SEMUA' | 'HARI_INI' | 'BULAN_INI' | 'RENTANG';
type KelompokFilter = 'ALL' | KelompokItemPengeluaran;

interface PengeluaranBosViewProps {
  divisiMasterList: ItemDivisi[];
  inventarisList: ItemInventaris[];
}

function parseDmyToIso(dmy?: string): string {
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

export const PengeluaranBosView: React.FC<PengeluaranBosViewProps> = ({
  divisiMasterList,
  inventarisList,
}) => {
  const todayDmy = useMemo(() => getWIBTodayString(), []);
  const todayIso = useMemo(() => dmyToIsoInput(todayDmy), [todayDmy]);
  const currentYearMonth = useMemo(() => todayIso.slice(0, 7), [todayIso]);

  const [pengeluaranList, setPengeluaranList] = useState<TransaksiPengeluaran[]>([]);
  const [masterItems, setMasterItems] = useState<MasterItemPengeluaran[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [periode, setPeriode] = useState<PeriodeFilterPengeluaran>('BULAN_INI');
  const [startDateIso, setStartDateIso] = useState<string>(() => `${todayIso.slice(0, 7)}-01`);
  const [endDateIso, setEndDateIso] = useState<string>(() => todayIso);
  const [kelompokFilter, setKelompokFilter] = useState<KelompokFilter>('ALL');
  const [divisiFilter, setDivisiFilter] = useState<string>('ALL');
  const [selectedKategoriItem, setSelectedKategoriItem] = useState<string>('ALL');
  const [onlyWithReceipt, setOnlyWithReceipt] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [visibleLimit, setVisibleLimit] = useState<number>(60);

  const [previewNota, setPreviewNota] = useState<{
    imageUrl: string;
    nomorBukti: string;
    penerima?: string;
    tanggal: string;
    nominalText: string;
    keterangan: string;
  } | null>(null);

  const loadPengeluaranData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [txRes, itemsRes] = await Promise.all([
        api.getPengeluaran().catch(() => [] as TransaksiPengeluaran[]),
        api.getMasterItemPengeluaran().catch(() => [] as MasterItemPengeluaran[]),
      ]);
      setPengeluaranList(Array.isArray(txRes) ? txRes : []);
      setMasterItems(Array.isArray(itemsRes) ? itemsRes : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPengeluaranData(false);
  }, [loadPengeluaranData]);

  useEffect(() => {
    const onUpdated = () => {
      void loadPengeluaranData(true);
    };
    window.addEventListener('erp:data-updated', onUpdated);
    return () => window.removeEventListener('erp:data-updated', onUpdated);
  }, [loadPengeluaranData]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [
    periode,
    startDateIso,
    endDateIso,
    kelompokFilter,
    divisiFilter,
    selectedKategoriItem,
    onlyWithReceipt,
    deferredSearch,
  ]);

  const inventarisMap = useMemo(() => {
    const map = new Map<string, ItemInventaris>();
    for (const inv of inventarisList) {
      map.set(inv.id, inv);
      if (inv.kode) map.set(inv.kode, inv);
    }
    return map;
  }, [inventarisList]);

  const masterKelompokMap = useMemo(() => {
    const map = new Map<string, KelompokItemPengeluaran>();
    for (const it of masterItems) {
      if (it.nama && it.kelompok) {
        map.set(it.nama.trim().toUpperCase(), it.kelompok);
      }
    }
    return map;
  }, [masterItems]);

  const getKelompok = useCallback(
    (tx: TransaksiPengeluaran): KelompokItemPengeluaran => {
      if (tx.kelompokPengeluaran === 'INVENTARIS' || tx.kelompokPengeluaran === 'BIASA') {
        return tx.kelompokPengeluaran;
      }
      const fromMaster = masterKelompokMap.get(String(tx.kategori || '').trim().toUpperCase());
      if (fromMaster) return fromMaster;
      return resolveKelompokItemPengeluaran(tx.kategori);
    },
    [masterKelompokMap]
  );

  // Base list filtered by Period & Divisi (used to build accurate Item summary cards)
  const basePeriodDivisiFiltered = useMemo(() => {
    return pengeluaranList.filter((tx) => {
      if (periode !== 'SEMUA') {
        const iso = parseDmyToIso(tx.tanggal);
        if (!iso) return false;
        if (periode === 'HARI_INI' && iso !== todayIso) return false;
        if (periode === 'BULAN_INI' && !iso.startsWith(currentYearMonth)) return false;
        if (periode === 'RENTANG') {
          if (startDateIso && iso < startDateIso) return false;
          if (endDateIso && iso > endDateIso) return false;
        }
      }

      if (divisiFilter !== 'ALL') {
        if (divisiFilter === 'TANPA_DIVISI') {
          if (!isTanpaDivisi(tx.divisi)) return false;
        } else {
          if (isTanpaDivisi(tx.divisi)) return false;
          if (tx.divisi.trim().toLowerCase() !== divisiFilter.trim().toLowerCase()) return false;
        }
      }

      return true;
    });
  }, [pengeluaranList, periode, todayIso, currentYearMonth, startDateIso, endDateIso, divisiFilter]);

  // Per-Item Recap (sorted by largest expense)
  const itemSummaryList = useMemo(() => {
    const map = new Map<
      string,
      { nama: string; kelompok: KelompokItemPengeluaran; totalNominal: number; count: number }
    >();
    for (const tx of basePeriodDivisiFiltered) {
      const nama = String(tx.kategori || 'Lainnya').trim().toUpperCase();
      const kelompok = getKelompok(tx);
      if (kelompokFilter !== 'ALL' && kelompok !== kelompokFilter) continue;
      const existing = map.get(nama);
      const amt = Number(tx.nominal) || 0;
      if (existing) {
        existing.totalNominal += amt;
        existing.count += 1;
      } else {
        map.set(nama, {
          nama,
          kelompok,
          totalNominal: amt,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalNominal - a.totalNominal);
  }, [basePeriodDivisiFiltered, getKelompok, kelompokFilter]);

  // Final filtered list for table & top KPI
  const filteredTransactions = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return basePeriodDivisiFiltered
      .filter((tx) => {
        const kelompok = getKelompok(tx);
        if (kelompokFilter !== 'ALL' && kelompok !== kelompokFilter) return false;
        if (
          selectedKategoriItem !== 'ALL' &&
          String(tx.kategori || '').trim().toUpperCase() !== selectedKategoriItem
        ) {
          return false;
        }
        if (onlyWithReceipt && !tx.fotoKuitansi) return false;
        if (!q) return true;
        const inv = tx.idInventaris ? inventarisMap.get(tx.idInventaris) : undefined;
        return (
          tx.kategori.toLowerCase().includes(q) ||
          tx.keterangan.toLowerCase().includes(q) ||
          tx.idTransaksi.toLowerCase().includes(q) ||
          (tx.penerima || '').toLowerCase().includes(q) ||
          (tx.divisi || '').toLowerCase().includes(q) ||
          (tx.rekeningSumber || '').toLowerCase().includes(q) ||
          (inv?.namaItem || '').toLowerCase().includes(q) ||
          (inv?.nomorPlat || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const isoA = parseDmyToIso(a.tanggal);
        const isoB = parseDmyToIso(b.tanggal);
        if (isoA !== isoB) return isoB.localeCompare(isoA);
        return String(b.jam || '').localeCompare(String(a.jam || ''));
      });
  }, [
    basePeriodDivisiFiltered,
    getKelompok,
    kelompokFilter,
    selectedKategoriItem,
    onlyWithReceipt,
    deferredSearch,
    inventarisMap,
  ]);

  const kpiStats = useMemo(() => {
    let totalBersih = 0;
    let totalInventaris = 0;
    let countInventaris = 0;
    let totalBiasa = 0;
    let countBiasa = 0;
    let totalNonDivisi = 0;
    let countWithNota = 0;

    for (const tx of filteredTransactions) {
      const amt = Number(tx.nominal) || 0;
      const kel = getKelompok(tx);
      totalBersih += amt;
      if (kel === 'INVENTARIS') {
        totalInventaris += amt;
        countInventaris += 1;
      } else {
        totalBiasa += amt;
        countBiasa += 1;
      }
      if (isTanpaDivisi(tx.divisi)) {
        totalNonDivisi += amt;
      }
      if (tx.fotoKuitansi) {
        countWithNota += 1;
      }
    }

    return {
      totalBersih,
      totalInventaris,
      countInventaris,
      totalBiasa,
      countBiasa,
      totalNonDivisi,
      countWithNota,
    };
  }, [filteredTransactions, getKelompok]);

  const displayedTransactions = useMemo(
    () => filteredTransactions.slice(0, visibleLimit),
    [filteredTransactions, visibleLimit]
  );

  const divisiOptions = useMemo(() => {
    return divisiMasterList.length > 0 ? divisiMasterList : DAFTAR_DIVISI;
  }, [divisiMasterList]);

  return (
    <div className="space-y-5">
      {/* Executive Pengeluaran Anchor & Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Total Pengeluaran Operasional &amp; Inventaris PT (Sesuai Filter Aktif)
            </p>
            <div className="mt-1 font-mono text-2xl sm:text-4xl font-bold tracking-tight text-rose-700 tabular-nums">
              {formatRupiah(kpiStats.totalBersih)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {filteredTransactions.length} transaksi pengeluaran tercatat ·{' '}
              {kpiStats.countWithNota} berlampir foto kuitansi/nota
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
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
        </div>

        {/* 4 Breakdown Columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Pengeluaran Inventaris &amp; Armada</div>
            <div className="font-mono text-xl font-bold text-emerald-800 tabular-nums">
              {formatRupiah(kpiStats.totalInventaris)}
            </div>
            <div className="text-[11px] text-slate-500">
              {kpiStats.countInventaris} transaksi perawatan / BBM armada
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Pengeluaran Operasional Biasa</div>
            <div className="font-mono text-xl font-bold text-amber-800 tabular-nums">
              {formatRupiah(kpiStats.totalBiasa)}
            </div>
            <div className="text-[11px] text-slate-500">
              {kpiStats.countBiasa} transaksi kebutuhan harian &amp; gudang
            </div>
          </div>

          <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-xs text-slate-500">Pengeluaran Non-Divisi</div>
            <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
              {formatRupiah(kpiStats.totalNonDivisi)}
            </div>
            <div className="text-[11px] text-slate-500">
              Tidak dibebankan ke arus kas divisi
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Bukti Nota / Kuitansi Fisik</div>
            <div className="font-mono text-xl font-bold text-slate-900 tabular-nums">
              {kpiStats.countWithNota} Nota
            </div>
            <div className="text-[11px] text-slate-500">
              Klik tombol Lihat Nota pada tabel di bawah
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="pt-4 border-t border-slate-100 space-y-3">
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

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setKelompokFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    kelompokFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Kelompok
                </button>
                <button
                  type="button"
                  onClick={() => setKelompokFilter('INVENTARIS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    kelompokFilter === 'INVENTARIS'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Inventaris / Armada
                </button>
                <button
                  type="button"
                  onClick={() => setKelompokFilter('BIASA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    kelompokFilter === 'BIASA'
                      ? 'bg-amber-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Operasional Biasa
                </button>
              </div>

              <select
                value={divisiFilter}
                onChange={(e) => setDivisiFilter(e.target.value)}
                aria-label="Filter Divisi Pengeluaran"
                className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="ALL">Semua Divisi &amp; Non-Divisi</option>
                {divisiOptions.map((d) => (
                  <option key={d.id} value={d.nama}>
                    {d.nama}
                  </option>
                ))}
                <option value="TANPA_DIVISI">Khusus Non-Divisi (Tanpa Divisi)</option>
              </select>

              <button
                type="button"
                onClick={() => setOnlyWithReceipt((prev) => !prev)}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  onlyWithReceipt
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Ada Bukti Nota ({kpiStats.countWithNota})</span>
              </button>
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari item, rincian, penerima, armada, atau rekening..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Clickable Per-Item Summary Buttons */}
          {itemSummaryList.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Rekap Cepat per Item Pengeluaran (klik item untuk menyaring rincian):
                </span>
                {selectedKategoriItem !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedKategoriItem('ALL')}
                    className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reset Filter Item ({selectedKategoriItem})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedKategoriItem('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selectedKategoriItem === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Semua Item ({itemSummaryList.length})
                </button>
                {itemSummaryList.map((it) => {
                  const isSelected = selectedKategoriItem === it.nama;
                  const isInv = it.kelompok === 'INVENTARIS';
                  return (
                    <button
                      key={it.nama}
                      type="button"
                      onClick={() =>
                        setSelectedKategoriItem(isSelected ? 'ALL' : it.nama)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 font-mono tabular-nums ${
                        isSelected
                          ? isInv
                            ? 'bg-emerald-700 text-white'
                            : 'bg-amber-700 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {it.nama} · {formatRupiahSingkat(it.totalNominal)} ({it.count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Main Pengeluaran Ledger Table */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Buku Rincian Pengeluaran &amp; Bukti Kuitansi ({filteredTransactions.length} Transaksi)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantauan lengkap seluruh pengeluaran inventaris/armada dan biaya operasional harian perusahaan
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Memuat data pengeluaran perusahaan...
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Belum ada transaksi pengeluaran yang sesuai dengan filter periode atau pencarian saat ini.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                    <th className="py-3 px-5 font-semibold">Tanggal &amp; No. Bukti</th>
                    <th className="py-3 px-4 font-semibold">Item &amp; Divisi</th>
                    <th className="py-3 px-4 font-semibold">Rincian Pengeluaran &amp; Penerima</th>
                    <th className="py-3 px-4 font-semibold hidden md:table-cell">Sumber Dana</th>
                    <th className="py-3 px-4 font-semibold text-right">Nominal</th>
                    <th className="py-3 px-5 font-semibold text-right">Kuitansi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedTransactions.map((tx) => {
                    const kelompok = getKelompok(tx);
                    const isInv = kelompok === 'INVENTARIS';
                    const nonDiv = isTanpaDivisi(tx.divisi);
                    const invUnit = tx.idInventaris ? inventarisMap.get(tx.idInventaris) : undefined;
                    const amt = Number(tx.nominal) || 0;

                    return (
                      <tr key={tx.idTransaksi} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-5 whitespace-nowrap font-mono tabular-nums">
                          <div className="font-semibold text-slate-900">{tx.tanggal}</div>
                          <div className="text-xs text-slate-400">
                            {tx.jam || '-'} · {tx.idTransaksi}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div
                            className={`font-bold ${
                              isInv ? 'text-emerald-800' : 'text-amber-800'
                            }`}
                          >
                            {tx.kategori}
                          </div>
                          <div className="text-xs text-slate-500">
                            {isInv ? 'Inventaris / Armada' : 'Operasional Biasa'} ·{' '}
                            <strong className={nonDiv ? 'text-slate-600' : 'text-slate-800'}>
                              {nonDiv ? 'Non-Divisi' : tx.divisi}
                            </strong>
                          </div>
                          {invUnit && (
                            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                              Unit: {invUnit.nomorPlat || invUnit.kode} ({invUnit.namaItem})
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 max-w-md">
                          <div className="text-slate-900 font-medium">{tx.keterangan || '-'}</div>
                          <div className="text-xs text-slate-500 mt-0.5 font-mono tabular-nums">
                            {tx.qty && tx.qty > 0 ? (
                              <span>
                                Qty: {tx.qty} {tx.satuan || ''}{' '}
                                {tx.hargaSatuan
                                  ? `× ${formatRupiah(tx.hargaSatuan)}`
                                  : ''}
                              </span>
                            ) : null}
                            {tx.qty && tx.qty > 0 && tx.penerima ? ' · ' : ''}
                            {tx.penerima ? (
                              <span className="font-sans">Penerima: {tx.penerima}</span>
                            ) : null}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 hidden md:table-cell whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-800">
                            {tx.rekeningSumber}
                          </div>
                          {tx.isNonKas && (
                            <div className="text-[11px] text-slate-500">Pemakaian Non-Kas</div>
                          )}
                        </td>

                        <td
                          className={`py-3.5 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            amt < 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {amt < 0
                            ? `Koreksi −${formatRupiah(Math.abs(amt))}`
                            : formatRupiah(amt)}
                        </td>

                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          {tx.fotoKuitansi ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewNota({
                                  imageUrl: tx.fotoKuitansi!,
                                  nomorBukti: tx.idTransaksi,
                                  penerima: tx.penerima || tx.kategori,
                                  tanggal: `${tx.tanggal} ${tx.jam || ''}`.trim(),
                                  nominalText: formatRupiah(amt),
                                  keterangan: `${tx.kategori} (${
                                    nonDiv ? 'Non-Divisi' : tx.divisi
                                  }) — ${tx.keterangan}`,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-700 text-slate-800 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <ImageIcon className="w-3.5 h-3.5" />
                              <span>Lihat Nota</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Tanpa Foto</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredTransactions.length > visibleLimit && (
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>
                  Menampilkan <strong>{displayedTransactions.length}</strong> dari{' '}
                  <strong>{filteredTransactions.length}</strong> transaksi pengeluaran
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 60)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-800 cursor-pointer"
                  >
                    Tampilkan +60
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(filteredTransactions.length)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                  >
                    Tampilkan Semua
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {previewNota && (
        <FotoNotaPreviewModal
          isOpen={true}
          onClose={() => setPreviewNota(null)}
          imageUrl={previewNota.imageUrl}
          title="Bukti Kuitansi / Nota Pengeluaran"
          nomorBukti={previewNota.nomorBukti}
          namaMitra={previewNota.penerima}
          tanggal={previewNota.tanggal}
          nominalText={previewNota.nominalText}
          keterangan={previewNota.keterangan}
        />
      )}
    </div>
  );
};
