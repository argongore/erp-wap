import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import {
  Search,
  Calendar,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  RingkasanStokHasilBumiBulananResponse,
  StokBarang,
  StokHasilBumi,
  TransaksiPembelianHasilBumi,
  isKategoriAlatNonStok,
} from '../../server/types.ts';
import {
  dmyToIsoInput,
  formatRupiah,
  formatRupiahSingkat,
  getWIBTodayString,
} from '../../utils/format.ts';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

type SubViewStokBos = 'SEMUA' | 'PEMBELIAN_HB' | 'STOK_HB' | 'STOK_TOKO';
type PeriodeBeliHb = 'SEMUA' | 'HARI_INI' | 'BULAN_PILIHAN' | 'RENTANG';

const BULAN_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

interface StokDanPembelianHbBosViewProps {
  stokHasilBumiList: StokHasilBumi[];
  stokBarangList: StokBarang[];
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

function isNonPhysicalPinjamanHb(tx: TransaksiPembelianHasilBumi): boolean {
  const kode = String(tx.komoditasKode || '').trim().toUpperCase();
  const nama = String(tx.komoditasNama || '').trim().toUpperCase();
  if (kode === 'PINJAMAN_DANA' || kode === 'TITIP_DANA' || kode === 'NOTA_SILANG') return true;
  if (nama.includes('PINJAMAN UANG') || nama.includes('TITIP DANA')) return true;
  if (tx.isNotaSilang) return true;
  return false;
}

export const StokDanPembelianHbBosView: React.FC<StokDanPembelianHbBosViewProps> = ({
  stokHasilBumiList,
  stokBarangList,
}) => {
  const nowInit = useMemo(() => new Date(), []);
  const todayDmy = useMemo(() => getWIBTodayString(), []);
  const todayIso = useMemo(() => dmyToIsoInput(todayDmy), [todayDmy]);

  const [subView, setSubView] = useState<SubViewStokBos>('SEMUA');
  const [selectedBulan, setSelectedBulan] = useState<number>(nowInit.getMonth() + 1);
  const [selectedTahun, setSelectedTahun] = useState<number>(nowInit.getFullYear());
  const [periodeBeli, setPeriodeBeli] = useState<PeriodeBeliHb>('BULAN_PILIHAN');
  const [startDateIso, setStartDateIso] = useState<string>(() => `${todayIso.slice(0, 7)}-01`);
  const [endDateIso, setEndDateIso] = useState<string>(() => todayIso);

  const [komoditasFilter, setKomoditasFilter] = useState<string>('ALL');
  const [metodeBeliFilter, setMetodeBeliFilter] = useState<string>('ALL');
  const [searchHb, setSearchHb] = useState<string>('');
  const deferredSearchHb = useDeferredValue(searchHb);
  const [hbLimit, setHbLimit] = useState<number>(50);

  const [searchToko, setSearchToko] = useState<string>('');
  const deferredSearchToko = useDeferredValue(searchToko);
  const [tokoFilter, setTokoFilter] = useState<'ALL' | 'MENIPIS' | 'TERSEDIA'>('ALL');
  const [showAllStokToko, setShowAllStokToko] = useState<boolean>(false);

  const [pembelianHbList, setPembelianHbList] = useState<TransaksiPembelianHasilBumi[]>([]);
  const [ringkasanHb, setRingkasanHb] = useState<RingkasanStokHasilBumiBulananResponse | null>(null);
  const [loadingHb, setLoadingHb] = useState<boolean>(true);

  const [previewNotaHb, setPreviewNotaHb] = useState<{
    imageUrl: string;
    driveFileUrl?: string;
    driveFolderPath?: string;
    nomorBukti: string;
    namaMitra: string;
    tanggal: string;
    nominalText: string;
    keterangan: string;
  } | null>(null);

  const loadHbData = useCallback(
    async (silent = false) => {
      if (!silent) setLoadingHb(true);
      try {
        const [beliRes, ringkasanRes] = await Promise.all([
          api.getPembelianHasilBumi().catch(() => [] as TransaksiPembelianHasilBumi[]),
          api
            .getRingkasanHasilBumiBulanan({
              bulan: selectedBulan,
              tahun: selectedTahun,
            })
            .catch(() => null),
        ]);
        setPembelianHbList(Array.isArray(beliRes) ? beliRes : []);
        if (ringkasanRes) setRingkasanHb(ringkasanRes);
      } finally {
        setLoadingHb(false);
      }
    },
    [selectedBulan, selectedTahun]
  );

  useEffect(() => {
    void loadHbData(false);
  }, [loadHbData]);

  useEffect(() => {
    const onUpdated = () => {
      void loadHbData(true);
    };
    window.addEventListener('erp:data-updated', onUpdated);
    return () => window.removeEventListener('erp:data-updated', onUpdated);
  }, [loadHbData]);

  useEffect(() => {
    setHbLimit(50);
  }, [
    periodeBeli,
    selectedBulan,
    selectedTahun,
    startDateIso,
    endDateIso,
    komoditasFilter,
    metodeBeliFilter,
    deferredSearchHb,
  ]);

  const availableYears = useMemo(() => {
    if (ringkasanHb?.daftarTahunTersedia && ringkasanHb.daftarTahunTersedia.length > 0) {
      return ringkasanHb.daftarTahunTersedia;
    }
    const cy = nowInit.getFullYear();
    return [cy - 1, cy, cy + 1];
  }, [ringkasanHb, nowInit]);

  // Physical Hasil Bumi Purchases Only
  const physicalPembelianHb = useMemo(
    () => pembelianHbList.filter((tx) => !isNonPhysicalPinjamanHb(tx)),
    [pembelianHbList]
  );

  // Filtered Pembelian Hasil Bumi
  const filteredPembelianHb = useMemo(() => {
    const targetPrefix = `${selectedTahun}-${String(selectedBulan).padStart(2, '0')}`;
    const q = deferredSearchHb.trim().toLowerCase();

    return physicalPembelianHb
      .filter((tx) => {
        if (periodeBeli !== 'SEMUA') {
          const iso = parseDmyToIso(tx.tanggal);
          if (!iso) return false;
          if (periodeBeli === 'HARI_INI' && iso !== todayIso) return false;
          if (periodeBeli === 'BULAN_PILIHAN' && !iso.startsWith(targetPrefix)) return false;
          if (periodeBeli === 'RENTANG') {
            if (startDateIso && iso < startDateIso) return false;
            if (endDateIso && iso > endDateIso) return false;
          }
        }

        if (komoditasFilter !== 'ALL') {
          const matchKode = tx.komoditasKode === komoditasFilter;
          const matchNama = tx.komoditasNama.toUpperCase() === komoditasFilter.toUpperCase();
          if (!matchKode && !matchNama) return false;
        }

        if (metodeBeliFilter !== 'ALL') {
          if (metodeBeliFilter === 'BELUM_PUTUS_HARGA') {
            if (!(tx.isBelumPutusHarga || tx.status === 'BELUM_PUTUS_HARGA')) return false;
          } else if (tx.metodePembayaran !== metodeBeliFilter) {
            return false;
          }
        }

        if (!q) return true;
        return (
          tx.namaMitra.toLowerCase().includes(q) ||
          tx.komoditasNama.toLowerCase().includes(q) ||
          tx.noPembelian.toLowerCase().includes(q) ||
          (tx.keterangan || '').toLowerCase().includes(q) ||
          (tx.rekeningSumber || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const isoA = parseDmyToIso(a.tanggal);
        const isoB = parseDmyToIso(b.tanggal);
        if (isoA !== isoB) return isoB.localeCompare(isoA);
        return String(b.jam || '').localeCompare(String(a.jam || ''));
      });
  }, [
    physicalPembelianHb,
    periodeBeli,
    selectedTahun,
    selectedBulan,
    todayIso,
    startDateIso,
    endDateIso,
    komoditasFilter,
    metodeBeliFilter,
    deferredSearchHb,
  ]);

  const pembelianSummary = useMemo(() => {
    let totalBeratBersihKg = 0;
    let totalBeratKotorKg = 0;
    let totalNominalRp = 0;
    let totalTunaiRp = 0;
    let totalTransferRp = 0;
    let totalTitipRp = 0;

    for (const tx of filteredPembelianHb) {
      const bersih = Number(tx.beratBersih) || 0;
      const kotor = Number(tx.beratKotor) || 0;
      const nom = Number(tx.totalNominal) || 0;
      totalBeratBersihKg += bersih;
      totalBeratKotorKg += kotor;
      totalNominalRp += nom;
      if (tx.metodePembayaran === 'TUNAI') totalTunaiRp += nom;
      else if (tx.metodePembayaran === 'TRANSFER') totalTransferRp += nom;
      else if (tx.metodePembayaran === 'TITIP') totalTitipRp += nom;
    }

    const rataHargaPerKg =
      totalBeratBersihKg > 0 ? Math.round(totalNominalRp / totalBeratBersihKg) : 0;

    return {
      count: filteredPembelianHb.length,
      totalBeratBersihKg,
      totalBeratKotorKg,
      totalNominalRp,
      rataHargaPerKg,
      totalTunaiRp,
      totalTransferRp,
      totalTitipRp,
    };
  }, [filteredPembelianHb]);

  // Stok Gudang Hasil Bumi Table Rows (enriched with monthly ringkasan if loaded)
  const enrichedStokHb = useMemo(() => {
    const ringkasanMap = new Map(
      (ringkasanHb?.komoditasItems || []).map((k) => [k.kode, k])
    );

    const activeHb = stokHasilBumiList.filter(
      (hb) =>
        hb.kode !== 'HB-01B' &&
        hb.nama.trim().toUpperCase() !== 'KOPI JALAN'
    );

    return activeHb.map((hb) => {
      const rk = ringkasanMap.get(hb.kode);
      const readyKg = rk ? Number(rk.readyGudangSaatIniKg) : Number(hb.stok || 0);
      const rataModal =
        rk && rk.rataRataModalGudangPerKg > 0
          ? rk.rataRataModalGudangPerKg
          : Number(hb.hargaBeliStandar || hb.rataRataModalAwal || 0);
      const nilaiModal =
        rk && rk.nilaiModalReadyGudang > 0
          ? rk.nilaiModalReadyGudang
          : Math.max(0, readyKg) * rataModal;

      return {
        kode: hb.kode,
        nama: hb.nama,
        satuan: hb.satuan || 'Kg',
        isBelumPutusHarga: hb.isBelumPutusHarga || rk?.isBelumPutusHarga,
        readyKg,
        rataModal,
        nilaiModal,
        masukBulanIniKg: rk?.masukBulanIniKg ?? 0,
        masukBulanIniNominal: rk?.masukBulanIniNominal ?? 0,
        notaBeliBulanIniCount: rk?.notaBeliBulanIniCount ?? 0,
        terjualBulanIniKg: rk?.terjualBulanIniKg ?? 0,
      };
    });
  }, [stokHasilBumiList, ringkasanHb]);

  const gudangHbTotals = useMemo(() => {
    let totalReadyKg = 0;
    let totalNilaiModal = 0;
    for (const item of enrichedStokHb) {
      totalReadyKg += Number(item.readyKg) || 0;
      totalNilaiModal += Number(item.nilaiModal) || 0;
    }
    return {
      totalReadyKg,
      totalNilaiModal:
        ringkasanHb && ringkasanHb.totalNilaiModalReadyGudang > 0
          ? ringkasanHb.totalNilaiModalReadyGudang
          : totalNilaiModal,
    };
  }, [enrichedStokHb, ringkasanHb]);

  // Stok Barang Toko
  const tokoStats = useMemo(() => {
    let lowCount = 0;
    let fisikCount = 0;
    for (const sb of stokBarangList) {
      const nonStok = sb.tanpaStok === true || isKategoriAlatNonStok(sb.kategori);
      if (!nonStok) {
        fisikCount += 1;
        if ((sb.stok || 0) <= (sb.minimum || 5)) {
          lowCount += 1;
        }
      }
    }
    return { lowCount, fisikCount, totalItems: stokBarangList.length };
  }, [stokBarangList]);

  const filteredStokToko = useMemo(() => {
    const q = deferredSearchToko.trim().toLowerCase();
    return [...stokBarangList]
      .filter((sb) => {
        const nonStok = sb.tanpaStok === true || isKategoriAlatNonStok(sb.kategori);
        const isLow = !nonStok && (sb.stok || 0) <= (sb.minimum || 5);
        if (tokoFilter === 'MENIPIS' && !isLow) return false;
        if (tokoFilter === 'TERSEDIA' && (nonStok || (sb.stok || 0) <= 0)) return false;
        if (!q) return true;
        return (
          sb.namaProduk.toLowerCase().includes(q) ||
          sb.kode.toLowerCase().includes(q) ||
          (sb.kategori || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const alatA = a.tanpaStok === true || isKategoriAlatNonStok(a.kategori) ? 1 : 0;
        const alatB = b.tanpaStok === true || isKategoriAlatNonStok(b.kategori) ? 1 : 0;
        if (alatA !== alatB) return alatA - alatB;
        return (a.stok || 0) - (b.stok || 0);
      });
  }, [stokBarangList, deferredSearchToko, tokoFilter]);

  const displayedStokToko = useMemo(
    () => (showAllStokToko ? filteredStokToko : filteredStokToko.slice(0, 35)),
    [filteredStokToko, showAllStokToko]
  );

  const displayedPembelianHb = useMemo(
    () => filteredPembelianHb.slice(0, hbLimit),
    [filteredPembelianHb, hbLimit]
  );

  return (
    <div className="space-y-6">
      {/* Top Executive KPI Summary */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-5 border-b border-slate-100">
          <div className="space-y-1">
            <div className="text-xs text-slate-500">Total Stok Gudang Hasil Bumi</div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {gudangHbTotals.totalReadyKg.toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })}{' '}
              Kg
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              Setara {(gudangHbTotals.totalReadyKg / 1000).toFixed(2)} Ton di gudang saat ini
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Estimasi Nilai Modal Stok HB</div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">
              {formatRupiah(gudangHbTotals.totalNilaiModal)}
            </div>
            <div className="text-[11px] text-slate-500">
              Nilai persediaan komoditas ready gudang
            </div>
          </div>

          <div className="space-y-1 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-xs text-slate-500">Total Pembelian Hasil Bumi (Filter)</div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-amber-800 tabular-nums">
              {formatRupiah(pembelianSummary.totalNominalRp)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              {pembelianSummary.totalBeratBersihKg.toLocaleString('id-ID', {
                maximumFractionDigits: 1,
              })}{' '}
              Kg · {pembelianSummary.count} nota pembelian
            </div>
          </div>

          <div className="space-y-1 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="text-xs text-slate-500">Stok Barang Dagangan Toko</div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
              {tokoStats.totalItems} Item
            </div>
            <div className="text-[11px] text-slate-500">
              {tokoStats.lowCount > 0 ? (
                <span className="text-rose-700 font-semibold">
                  {tokoStats.lowCount} barang stok menipis
                </span>
              ) : (
                <span>Seluruh stok barang mencukupi</span>
              )}
            </div>
          </div>
        </div>

        {/* Sub-View Switcher + Month/Year Selector */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
            <button
              type="button"
              onClick={() => setSubView('SEMUA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subView === 'SEMUA'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tampilkan Semua
            </button>
            <button
              type="button"
              onClick={() => setSubView('PEMBELIAN_HB')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subView === 'PEMBELIAN_HB'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pembelian Hasil Bumi ({pembelianSummary.count})
            </button>
            <button
              type="button"
              onClick={() => setSubView('STOK_HB')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subView === 'STOK_HB'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stok Gudang HB ({enrichedStokHb.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('STOK_TOKO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subView === 'STOK_TOKO'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stok Barang Toko ({stokBarangList.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Periode Bulan HB:</span>
            <select
              value={selectedBulan}
              onChange={(e) => {
                setSelectedBulan(Number(e.target.value));
                if (periodeBeli !== 'BULAN_PILIHAN') setPeriodeBeli('BULAN_PILIHAN');
              }}
              aria-label="Pilih Bulan Hasil Bumi"
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {BULAN_OPTIONS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>

            <select
              value={selectedTahun}
              onChange={(e) => {
                setSelectedTahun(Number(e.target.value));
                if (periodeBeli !== 'BULAN_PILIHAN') setPeriodeBeli('BULAN_PILIHAN');
              }}
              aria-label="Pilih Tahun Hasil Bumi"
              className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-800 font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* SECTION 1: STOK GUDANG HASIL BUMI & MUTASI KOMODITAS */}
      {(subView === 'SEMUA' || subView === 'STOK_HB') && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Posisi Stok Gudang Hasil Bumi &amp; Akumulasi Pembelian per Komoditas
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Klik baris komoditas untuk menyaring rincian nota Pembelian Hasil Bumi di bawah
              </p>
            </div>
            {komoditasFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setKomoditasFilter('ALL')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900 cursor-pointer self-start sm:self-auto"
              >
                <X className="w-3.5 h-3.5" />
                <span>Tampilkan Semua Komoditas</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                  <th className="py-3 px-5 font-semibold">Komoditas</th>
                  <th className="py-3 px-4 font-semibold text-right">
                    Pembelian ({BULAN_OPTIONS[selectedBulan - 1]?.label})
                  </th>
                  <th className="py-3 px-4 font-semibold text-right hidden md:table-cell">
                    Muat / Keluar
                  </th>
                  <th className="py-3 px-4 font-semibold text-right">Stok Ready Gudang</th>
                  <th className="py-3 px-4 font-semibold text-right hidden sm:table-cell">
                    Rata2 Modal / Kg
                  </th>
                  <th className="py-3 px-5 font-semibold text-right">Nilai Modal Ready</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrichedStokHb.map((hb) => {
                  const isSelected = komoditasFilter === hb.kode;
                  return (
                    <tr
                      key={hb.kode}
                      onClick={() => setKomoditasFilter(isSelected ? 'ALL' : hb.kode)}
                      className={`transition-colors cursor-pointer ${
                        isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900">{hb.nama}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {hb.kode}
                          {hb.isBelumPutusHarga ? ' · Khusus Belum Putus Harga' : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-amber-800">
                          +{hb.masukBulanIniKg.toLocaleString('id-ID', { maximumFractionDigits: 1 })}{' '}
                          {hb.satuan}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatRupiahSingkat(hb.masukBulanIniNominal)} ({hb.notaBeliBulanIniCount}{' '}
                          nota)
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-600 tabular-nums hidden md:table-cell whitespace-nowrap">
                        {hb.terjualBulanIniKg > 0
                          ? `−${hb.terjualBulanIniKg.toLocaleString('id-ID', {
                              maximumFractionDigits: 1,
                            })} ${hb.satuan}`
                          : '-'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {hb.readyKg.toLocaleString('id-ID', { maximumFractionDigits: 1 })}{' '}
                          {hb.satuan}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {(hb.readyKg / 1000).toFixed(2)} Ton
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums hidden sm:table-cell whitespace-nowrap">
                        {hb.rataModal > 0 ? formatRupiah(hb.rataModal) : '-'}
                      </td>

                      <td className="py-3.5 px-5 text-right font-mono font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                        {hb.nilaiModal > 0 ? formatRupiah(hb.nilaiModal) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION 2: RIWAYAT & REKAP PEMBELIAN HASIL BUMI */}
      {(subView === 'SEMUA' || subView === 'PEMBELIAN_HB') && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Rekap &amp; Buku Pembelian Hasil Bumi dari Petani / Mitra ({pembelianSummary.count}{' '}
                  Nota)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pantauan timbangan masuk, harga beli per Kg, metode bayar (Tunai/Transfer/Titip), dan bukti nota timbang
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-auto">
                <button
                  type="button"
                  onClick={() => setPeriodeBeli('SEMUA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    periodeBeli === 'SEMUA'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Waktu
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeBeli('HARI_INI')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    periodeBeli === 'HARI_INI'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hari Ini ({todayDmy})
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeBeli('BULAN_PILIHAN')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    periodeBeli === 'BULAN_PILIHAN'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {BULAN_OPTIONS[selectedBulan - 1]?.label} {selectedTahun}
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodeBeli('RENTANG')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                    periodeBeli === 'RENTANG'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Rentang</span>
                </button>
              </div>
            </div>

            {periodeBeli === 'RENTANG' && (
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

            {/* Summary Strip of Filtered Pembelian HB */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 px-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
              <div>
                <span className="text-slate-500">Total Tonase Bersih Masuk</span>
                <div className="font-mono font-bold text-slate-900 text-sm tabular-nums mt-0.5">
                  {pembelianSummary.totalBeratBersihKg.toLocaleString('id-ID', {
                    maximumFractionDigits: 1,
                  })}{' '}
                  Kg ({(pembelianSummary.totalBeratBersihKg / 1000).toFixed(2)} Ton)
                </div>
              </div>
              <div>
                <span className="text-slate-500">Rata-rata Harga Beli</span>
                <div className="font-mono font-bold text-slate-900 text-sm tabular-nums mt-0.5">
                  {pembelianSummary.rataHargaPerKg > 0
                    ? `${formatRupiah(pembelianSummary.rataHargaPerKg)} / Kg`
                    : '-'}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Bayar Tunai &amp; Transfer</span>
                <div className="font-mono font-bold text-emerald-700 text-sm tabular-nums mt-0.5">
                  {formatRupiah(pembelianSummary.totalTunaiRp + pembelianSummary.totalTransferRp)}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Masuk Saldo Titip Mitra</span>
                <div className="font-mono font-bold text-purple-800 text-sm tabular-nums mt-0.5">
                  {formatRupiah(pembelianSummary.totalTitipRp)}
                </div>
              </div>
            </div>

            {/* Filter Controls for Pembelian HB */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={komoditasFilter}
                  onChange={(e) => setKomoditasFilter(e.target.value)}
                  aria-label="Filter Komoditas"
                  className="px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="ALL">Semua Komoditas</option>
                  {enrichedStokHb.map((k) => (
                    <option key={k.kode} value={k.kode}>
                      {k.nama}
                    </option>
                  ))}
                </select>

                <select
                  value={metodeBeliFilter}
                  onChange={(e) => setMetodeBeliFilter(e.target.value)}
                  aria-label="Filter Metode Pembayaran"
                  className="px-3 py-2 border border-slate-200 rounded-xl bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="ALL">Semua Metode Bayar</option>
                  <option value="TUNAI">Tunai (Kasir)</option>
                  <option value="TRANSFER">Transfer Bank</option>
                  <option value="TITIP">Titip Saldo Mitra</option>
                  <option value="BELUM_PUTUS_HARGA">Belum Putus Harga</option>
                </select>
              </div>

              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchHb}
                  onChange={(e) => setSearchHb(e.target.value)}
                  placeholder="Cari nama petani/mitra, komoditas, atau no. nota..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>
          </div>

          {loadingHb && pembelianHbList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Memuat riwayat pembelian hasil bumi...
            </div>
          ) : filteredPembelianHb.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Tidak ada transaksi pembelian hasil bumi pada filter periode atau pencarian ini.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                      <th className="py-3 px-5 font-semibold">Tanggal &amp; No. Nota</th>
                      <th className="py-3 px-4 font-semibold">Petani / Mitra &amp; Komoditas</th>
                      <th className="py-3 px-4 font-semibold text-right">Timbangan Bersih</th>
                      <th className="py-3 px-4 font-semibold text-right">Harga / Kg</th>
                      <th className="py-3 px-4 font-semibold text-right">Total Nominal</th>
                      <th className="py-3 px-4 font-semibold hidden md:table-cell">Metode</th>
                      <th className="py-3 px-5 font-semibold text-right">Bukti Nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedPembelianHb.map((tx) => {
                      const combinedImages =
                        tx.fotoNotaList && tx.fotoNotaList.length > 0
                          ? tx.fotoNotaList.join('|||')
                          : tx.fotoNota || '';
                      const isBelumPutus =
                        tx.isBelumPutusHarga || tx.status === 'BELUM_PUTUS_HARGA';

                      return (
                        <tr key={tx.noPembelian} className="hover:bg-slate-50/70">
                          <td className="py-3.5 px-5 font-mono tabular-nums whitespace-nowrap">
                            <div className="font-semibold text-slate-900">{tx.tanggal}</div>
                            <div className="text-xs text-slate-400">
                              {tx.jam || '-'} · {tx.noPembelian}
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{tx.namaMitra}</div>
                            <div className="text-xs text-slate-500">
                              <strong className="text-emerald-800">{tx.komoditasNama}</strong>
                              {tx.divisi ? ` · ${tx.divisi}` : ''}
                              {tx.keterangan ? ` · ${tx.keterangan}` : ''}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="font-bold text-slate-900">
                              {Number(tx.beratBersih || 0).toLocaleString('id-ID', {
                                maximumFractionDigits: 1,
                              })}{' '}
                              Kg
                            </div>
                            {tx.potonganRafaksi > 0 && (
                              <div className="text-[11px] text-slate-400">
                                Kotor {Number(tx.beratKotor || 0).toLocaleString('id-ID')} Kg (−
                                {tx.potonganRafaksi}%)
                              </div>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                            {isBelumPutus ? (
                              <span className="text-amber-700 font-semibold">Belum Putus</span>
                            ) : (
                              <span className="text-slate-800">
                                {formatRupiah(tx.hargaPerKg)}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {isBelumPutus && tx.totalNominal === 0 ? (
                              <span className="text-amber-700">Menunggu Harga</span>
                            ) : (
                              formatRupiah(tx.totalNominal)
                            )}
                          </td>

                          <td className="py-3.5 px-4 hidden md:table-cell whitespace-nowrap text-xs">
                            <div
                              className={`font-semibold ${
                                tx.metodePembayaran === 'TITIP'
                                  ? 'text-purple-800'
                                  : tx.metodePembayaran === 'TRANSFER'
                                  ? 'text-sky-800'
                                  : 'text-emerald-800'
                              }`}
                            >
                              {tx.metodePembayaran}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {tx.rekeningSumber}
                            </div>
                          </td>

                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            {combinedImages ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewNotaHb({
                                    imageUrl: combinedImages,
                                    driveFileUrl: tx.driveFileUrl,
                                    driveFolderPath: tx.driveFolderPath,
                                    nomorBukti: tx.noPembelian,
                                    namaMitra: tx.namaMitra,
                                    tanggal: `${tx.tanggal} ${tx.jam || ''}`.trim(),
                                    nominalText: `${Number(tx.beratBersih || 0).toLocaleString(
                                      'id-ID'
                                    )} Kg · ${formatRupiah(tx.totalNominal)}`,
                                    keterangan: `${tx.komoditasNama} — ${tx.keterangan || ''}`,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-emerald-700 text-slate-800 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <ImageIcon className="w-3.5 h-3.5" />
                                <span>Lihat Nota</span>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredPembelianHb.length > hbLimit && (
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Menampilkan <strong>{displayedPembelianHb.length}</strong> dari{' '}
                    <strong>{filteredPembelianHb.length}</strong> nota pembelian hasil bumi
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setHbLimit((prev) => prev + 50)}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 font-semibold text-slate-800 cursor-pointer"
                    >
                      Tampilkan +50 Nota
                    </button>
                    <button
                      type="button"
                      onClick={() => setHbLimit(filteredPembelianHb.length)}
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
      )}

      {/* SECTION 3: STOK BARANG DAGANGAN TOKO */}
      {(subView === 'SEMUA' || subView === 'STOK_TOKO') && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  Stok Barang Dagangan Toko &amp; Saprotan ({filteredStokToko.length} Item)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Diurutkan dari stok yang paling memerlukan perhatian kulakan
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTokoFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    tokoFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua ({stokBarangList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTokoFilter('MENIPIS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    tokoFilter === 'MENIPIS'
                      ? 'bg-white text-rose-700 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Stok Menipis ({tokoStats.lowCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTokoFilter('TERSEDIA')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    tokoFilter === 'TERSEDIA'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Stok Ready
                </button>
              </div>
            </div>

            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchToko}
                onChange={(e) => setSearchToko(e.target.value)}
                placeholder="Cari nama produk, kode barang, atau kategori..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {filteredStokToko.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Tidak ada barang toko yang sesuai dengan filter.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-slate-500 text-xs">
                      <th className="py-3 px-5 font-semibold">Kode</th>
                      <th className="py-3 px-4 font-semibold">Nama Barang &amp; Kategori</th>
                      <th className="py-3 px-4 font-semibold text-right hidden sm:table-cell">
                        Batas Minimum
                      </th>
                      <th className="py-3 px-5 font-semibold text-right">Sisa Stok</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedStokToko.map((sb) => {
                      const isAlatJasa =
                        sb.tanpaStok === true || isKategoriAlatNonStok(sb.kategori);
                      const isLow = !isAlatJasa && (sb.stok || 0) <= (sb.minimum || 5);
                      return (
                        <tr key={sb.kode} className="hover:bg-slate-50/70">
                          <td className="py-3 px-5 font-mono text-xs font-semibold text-slate-600 whitespace-nowrap">
                            {sb.kode}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{sb.namaProduk}</div>
                            <div className="text-xs text-slate-500">
                              {sb.kategori || 'Umum'}
                              {isAlatJasa ? (
                                <span className="text-sky-700"> · Jasa / Tanpa Stok Fisik</span>
                              ) : isLow ? (
                                <span className="text-rose-700 font-semibold">
                                  {' '}
                                  · Perlu Kulakan
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 tabular-nums hidden sm:table-cell whitespace-nowrap">
                            {isAlatJasa ? '-' : `${sb.minimum || 5} ${sb.satuan}`}
                          </td>
                          <td
                            className={`py-3 px-5 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                              isAlatJasa
                                ? 'text-sky-700'
                                : isLow
                                ? 'text-rose-700'
                                : 'text-slate-900'
                            }`}
                          >
                            {isAlatJasa
                              ? 'Tanpa Stok'
                              : `${Number(sb.stok || 0).toLocaleString('id-ID')} ${sb.satuan}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filteredStokToko.length > 35 && (
                <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Menampilkan {displayedStokToko.length} dari {filteredStokToko.length} item barang
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllStokToko((prev) => !prev)}
                    className="font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    {showAllStokToko ? 'Ringkas Tampilan' : 'Tampilkan Semua Barang'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {previewNotaHb && (
        <FotoNotaPreviewModal
          isOpen={true}
          onClose={() => setPreviewNotaHb(null)}
          imageUrl={previewNotaHb.imageUrl}
          driveFileUrl={previewNotaHb.driveFileUrl}
          driveFolderPath={previewNotaHb.driveFolderPath}
          title="Bukti Fisik Nota Pembelian Hasil Bumi"
          nomorBukti={previewNotaHb.nomorBukti}
          namaMitra={previewNotaHb.namaMitra}
          tanggal={previewNotaHb.tanggal}
          nominalText={previewNotaHb.nominalText}
          keterangan={previewNotaHb.keterangan}
        />
      )}
    </div>
  );
};
