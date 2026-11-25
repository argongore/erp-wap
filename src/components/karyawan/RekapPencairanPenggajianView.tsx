import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Printer,
  Download,
  Receipt,
  FileSpreadsheet,
  Calendar,
  Building2,
  PiggyBank,
  HandCoins,
  Wallet,
  TrendingDown,
  Filter,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  CatatanUpahHarian,
  DAFTAR_DIVISI,
  ProfilPerusahaan,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { PrintReceiptModal, ReceiptData } from '../common/PrintReceiptModal.tsx';
import { buildThermalReceiptFromSlipGaji } from '../../utils/thermalPayrollReceipt.ts';
import { DownloadHistoryGajiButton } from './DownloadHistoryGajiButton.tsx';

interface RekapPencairanPenggajianViewProps {
  penggajianHistory: TransaksiPenggajian[];
  logHarianList: CatatanUpahHarian[];
  onOpenSlip: (slip: TransaksiPenggajian) => void;
  onFeedback?: (msg: string) => void;
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

function parseDmyMonthYear(dmy?: string): { bulan: number; tahun: number } | null {
  if (!dmy) return null;
  const parts = String(dmy).split('/');
  if (parts.length < 3) return null;
  const bulan = Number(parts[1]);
  const tahun = Number(parts[2]);
  if (!bulan || !tahun) return null;
  return { bulan, tahun };
}

export const RekapPencairanPenggajianView: React.FC<RekapPencairanPenggajianViewProps> = ({
  penggajianHistory,
  logHarianList,
  onOpenSlip,
  onFeedback,
}) => {
  const now = new Date();
  const [filterBulan, setFilterBulan] = useState<string>('ALL'); // 'ALL' atau 'MM-YYYY'
  const [filterDivisi, setFilterDivisi] = useState<string>('ALL');
  const [filterKondisi, setFilterKondisi] = useState<
    'ALL' | 'ADA_TITIPAN' | 'ADA_POTONG_BON' | 'CAIR_PENUH'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [thermalReceipt, setThermalReceipt] = useState<ReceiptData | null>(null);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);

  useEffect(() => {
    api
      .getProfilPerusahaan()
      .then((p) => {
        if (p) setProfilPerusahaan(p);
      })
      .catch(() => null);
  }, []);

  // Kumpulkan daftar bulan-tahun yang ada dari slip penggajian
  const availablePeriods = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sortVal: number }>();
    const curKey = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    map.set(curKey, {
      key: curKey,
      label: `${NAMA_BULAN[now.getMonth()]} ${now.getFullYear()}`,
      sortVal: now.getFullYear() * 100 + (now.getMonth() + 1),
    });
    for (const g of penggajianHistory) {
      const parsed = parseDmyMonthYear(g.tanggal);
      if (!parsed) continue;
      const key = `${String(parsed.bulan).padStart(2, '0')}-${parsed.tahun}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${NAMA_BULAN[parsed.bulan - 1] || parsed.bulan} ${parsed.tahun}`,
          sortVal: parsed.tahun * 100 + parsed.bulan,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sortVal - a.sortVal);
  }, [penggajianHistory]);

  const filteredList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return penggajianHistory.filter((g) => {
      if (filterDivisi !== 'ALL' && g.divisi !== filterDivisi) return false;
      if (filterBulan !== 'ALL') {
        const parsed = parseDmyMonthYear(g.tanggal);
        if (!parsed) return false;
        const key = `${String(parsed.bulan).padStart(2, '0')}-${parsed.tahun}`;
        if (key !== filterBulan) return false;
      }
      const titip = Math.max(0, Number(g.nominalDititipkan) || 0);
      const potBon = Math.max(0, Number(g.potonganKasbon) || 0);
      if (filterKondisi === 'ADA_TITIPAN' && titip <= 0) return false;
      if (filterKondisi === 'ADA_POTONG_BON' && potBon <= 0) return false;
      if (filterKondisi === 'CAIR_PENUH' && (titip > 0 || potBon > 0)) return false;

      if (q) {
        const hay = `${g.slipNomor} ${g.namaKaryawan} ${g.nikKaryawan} ${g.divisi} ${g.periodeBulan} ${g.rekeningSumber} ${g.keterangan || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [penggajianHistory, filterDivisi, filterBulan, filterKondisi, searchQuery]);

  const totals = useMemo(() => {
    let gajiKotor = 0;
    let potongBon = 0;
    let hakBersih = 0;
    let diambilCashTf = 0;
    let dititipkan = 0;
    let countTitip = 0;
    let countPotongBon = 0;

    for (const g of filteredList) {
      const kotor = Number(g.totalGajiKotor) || 0;
      const pot = Number(g.potonganKasbon) || 0;
      const hak =
        g.hakGajiSetelahPotongBon !== undefined
          ? Number(g.hakGajiSetelahPotongBon) || 0
          : Math.max(0, kotor - pot);
      const titip = Math.max(0, Number(g.nominalDititipkan) || 0);
      const cair = Number(g.gajiBersihDibayar) || 0;

      gajiKotor += kotor;
      potongBon += pot;
      hakBersih += hak;
      diambilCashTf += cair;
      dititipkan += titip;
      if (titip > 0) countTitip += 1;
      if (pot > 0) countPotongBon += 1;
    }

    return {
      gajiKotor,
      potongBon,
      hakBersih,
      diambilCashTf,
      dititipkan,
      countTitip,
      countPotongBon,
    };
  }, [filteredList]);

  const handleOpenThermal = (slip: TransaksiPenggajian) => {
    const idSet = new Set(slip.daftarUpahHarianIds || []);
    const matchedLogs = logHarianList.filter(
      (u) => u.idPayrollSettlement === slip.id || idSet.has(u.id)
    );
    setThermalReceipt(buildThermalReceiptFromSlipGaji(slip, matchedLogs));
  };

  const handleExportCsv = () => {
    if (filteredList.length === 0) return;
    const headers = [
      'No. Slip',
      'Tanggal Cair',
      'Jam',
      'NIK',
      'Nama Karyawan',
      'Jabatan',
      'Divisi Pembayar',
      'Tipe Gaji',
      'Periode',
      'Gaji Kotor (Rp)',
      'Piutang/Bon Awal (Rp)',
      'Potong Piutang/Bon (Rp)',
      'Sisa Piutang Akhir (Rp)',
      'Hak Gaji Bersih (Rp)',
      'Diambil Cash/TF (Rp)',
      'Dititipkan ke Saldo Titip (Rp)',
      'Metode Bayar',
      'Rekening Kas/Bank',
      'Keterangan',
    ];

    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows = filteredList.map((g) => {
      const kotor = Number(g.totalGajiKotor) || 0;
      const pot = Number(g.potonganKasbon) || 0;
      const hak =
        g.hakGajiSetelahPotongBon !== undefined
          ? Number(g.hakGajiSetelahPotongBon) || 0
          : Math.max(0, kotor - pot);
      const titip = Math.max(0, Number(g.nominalDititipkan) || 0);
      return [
        g.slipNomor,
        g.tanggal,
        g.jam,
        g.nikKaryawan,
        g.namaKaryawan,
        g.jabatan,
        g.divisi,
        g.tipeGaji,
        g.periodeBulan,
        kotor,
        Number(g.totalKasbonAwal) || 0,
        pot,
        Number(g.sisaKasbonAkhir) || 0,
        hak,
        Number(g.gajiBersihDibayar) || 0,
        titip,
        g.metodePembayaran,
        g.rekeningSumber,
        g.keterangan || '',
      ]
        .map(escapeCsv)
        .join(',');
    });

    rows.push(
      [
        'TOTAL',
        '',
        '',
        '',
        `${filteredList.length} Slip Pencairan`,
        '',
        filterDivisi === 'ALL' ? 'Semua Divisi' : filterDivisi,
        '',
        filterBulan === 'ALL' ? 'Semua Bulan' : filterBulan,
        totals.gajiKotor,
        '',
        totals.potongBon,
        '',
        totals.hakBersih,
        totals.diambilCashTf,
        totals.dititipkan,
        '',
        '',
        '',
      ]
        .map(escapeCsv)
        .join(',')
    );

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekap_Pencairan_Penggajian_${filterBulan === 'ALL' ? 'Semua' : filterBulan}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onFeedback?.(`Rekap Penggajian (${filteredList.length} slip) berhasil diunduh ke CSV.`);
  };

  const handlePrintRekap = () => {
    try {
      window.print();
    } catch {
      handleExportCsv();
    }
  };

  const periodTitle =
    filterBulan === 'ALL'
      ? 'Semua Periode'
      : availablePeriods.find((p) => p.key === filterBulan)?.label || filterBulan;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden space-y-5 p-5">
      {/* Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Rekap Pencairan Penggajian Karyawan</span>
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Rekapan lengkap pencairan gaji: Gaji Kotor, Potongan Piutang/Bon, Pengambilan Cash/Transfer, dan Sisa Gaji yang Dititipkan ke Saldo Titipan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={filteredList.length === 0}
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-emerald-300 border border-zinc-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel / CSV</span>
          </button>
          <button
            type="button"
            disabled={filteredList.length === 0}
            onClick={handlePrintRekap}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Rekap</span>
          </button>
        </div>
      </div>

      {/* 4-Column KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="uppercase tracking-wider font-semibold">Total Gaji Kotor</span>
            <Wallet className="w-3.5 h-3.5 text-zinc-500" />
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-zinc-100">
            {formatRupiah(totals.gajiKotor)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {filteredList.length} slip pencairan · {periodTitle}
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="uppercase tracking-wider font-semibold">Potong Piutang / Bon</span>
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-rose-400">
            {totals.potongBon > 0 ? `-${formatRupiah(totals.potongBon)}` : 'Rp 0'}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            {totals.countPotongBon} slip dengan potongan piutang
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="uppercase tracking-wider font-semibold">Diambil Cash / Transfer</span>
            <HandCoins className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-emerald-400">
            {formatRupiah(totals.diambilCashTf)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500">
            Uang riil keluar dari Kasir / Bank
          </div>
        </div>

        <div className="bg-zinc-950 border border-amber-900/60 rounded-xl p-3.5">
          <div className="flex items-center justify-between text-[11px] text-amber-300">
            <span className="uppercase tracking-wider font-semibold">Dititipkan (Saldo Titip)</span>
            <PiggyBank className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-1.5 text-lg font-bold font-mono tabular-nums text-amber-300">
            {formatRupiah(totals.dititipkan)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {totals.countTitip} slip dengan titipan sisa gaji
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 bg-zinc-950/70 p-3 rounded-xl border border-zinc-800">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama karyawan / no. slip..."
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <select
            value={filterBulan}
            onChange={(e) => setFilterBulan(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="ALL">Semua Bulan Pencairan</option>
            {availablePeriods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <select
            value={filterDivisi}
            onChange={(e) => setFilterDivisi(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="ALL">Semua Divisi</option>
            {DAFTAR_DIVISI.map((d) => (
              <option key={d.id} value={d.nama}>
                {d.nama}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <select
            value={filterKondisi}
            onChange={(e) => setFilterKondisi(e.target.value as any)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
          >
            <option value="ALL">Semua Jenis Pencairan</option>
            <option value="ADA_TITIPAN">Hanya Ada Titipan Sisa Gaji</option>
            <option value="ADA_POTONG_BON">Hanya Ada Potongan Piutang/Bon</option>
            <option value="CAIR_PENUH">Cair Penuh (Tanpa Bon &amp; Titip)</option>
          </select>
        </div>
      </div>

      {/* Main Rekap Ledger Table */}
      <div className="overflow-x-auto border border-zinc-800 rounded-xl">
        <table className="w-full text-left text-xs text-zinc-300 border-collapse">
          <thead className="bg-zinc-950 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-800">
            <tr>
              <th className="py-2.5 px-3">No. Slip &amp; Tgl</th>
              <th className="py-2.5 px-3">Karyawan &amp; Divisi</th>
              <th className="py-2.5 px-3">Periode</th>
              <th className="py-2.5 px-3 text-right">Gaji Kotor</th>
              <th className="py-2.5 px-3 text-right">Potong Piutang</th>
              <th className="py-2.5 px-3 text-right">Hak Bersih</th>
              <th className="py-2.5 px-3 text-right">Diambil Cash/TF</th>
              <th className="py-2.5 px-3 text-right">Dititipkan</th>
              <th className="py-2.5 px-3">Kas / Metode</th>
              <th className="py-2.5 px-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-zinc-500">
                  Belum ada data pencairan penggajian yang sesuai filter.
                </td>
              </tr>
            ) : (
              filteredList.map((g) => {
                const kotor = Number(g.totalGajiKotor) || 0;
                const pot = Number(g.potonganKasbon) || 0;
                const hak =
                  g.hakGajiSetelahPotongBon !== undefined
                    ? Number(g.hakGajiSetelahPotongBon) || 0
                    : Math.max(0, kotor - pot);
                const titip = Math.max(0, Number(g.nominalDititipkan) || 0);
                const cair = Number(g.gajiBersihDibayar) || 0;

                return (
                  <tr key={g.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-mono font-bold text-zinc-200">{g.slipNomor}</div>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {g.tanggal} · {g.jam}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-zinc-100">{g.namaKaryawan}</div>
                      <div className="text-[11px] text-zinc-400">
                        {g.divisi} · <span className="font-mono text-zinc-500">{g.nikKaryawan}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-zinc-200 font-medium">{g.periodeBulan}</div>
                      <div className="text-[10px] text-zinc-500 uppercase">
                        {g.tipeGaji}
                        {g.jumlahHariKerja ? ` · ${g.jumlahHariKerja} hari` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-200">
                      {formatRupiah(kotor)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {pot > 0 ? (
                        <div>
                          <span className="text-rose-400 font-semibold">-{formatRupiah(pot)}</span>
                          <div className="text-[10px] text-zinc-500">
                            Sisa: {formatRupiah(Number(g.sisaKasbonAkhir) || 0)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-200 font-semibold">
                      {formatRupiah(hak)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                      {formatRupiah(cair)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {titip > 0 ? (
                        <div>
                          <span className="font-bold text-amber-300">{formatRupiah(titip)}</span>
                          {g.idTitipanGajiTerkait && (
                            <div className="text-[10px] text-zinc-500">{g.idTitipanGajiTerkait}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="text-zinc-200 font-semibold text-[11px]">
                        {titip > 0 && cair === 0 ? 'TITIP 100%' : g.metodePembayaran}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">{g.rekeningSumber}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenSlip(g)}
                          className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title="Lihat & Cetak Slip Gaji A4"
                        >
                          <Printer className="w-3 h-3 text-emerald-400" />
                          <span>Slip</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenThermal(g)}
                          className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title="Cetak Struk Thermal 80mm / 58mm"
                        >
                          <Receipt className="w-3 h-3" />
                          <span>Thermal</span>
                        </button>
                        <DownloadHistoryGajiButton
                          idKaryawan={g.idKaryawan}
                          namaKaryawan={g.namaKaryawan}
                          compact
                          variant="sky"
                          label="History"
                          onDownloaded={(msg) => onFeedback?.(msg)}
                          onError={(msg) => onFeedback?.(`Gagal mengunduh: ${msg}`)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filteredList.length > 0 && (
            <tfoot className="bg-zinc-950 border-t-2 border-zinc-700 font-mono tabular-nums text-xs font-bold">
              <tr>
                <td colSpan={3} className="py-3 px-3 font-sans text-zinc-200 uppercase tracking-wider">
                  Grand Total ({filteredList.length} Slip)
                </td>
                <td className="py-3 px-3 text-right text-zinc-100">
                  {formatRupiah(totals.gajiKotor)}
                </td>
                <td className="py-3 px-3 text-right text-rose-400">
                  {totals.potongBon > 0 ? `-${formatRupiah(totals.potongBon)}` : 'Rp 0'}
                </td>
                <td className="py-3 px-3 text-right text-zinc-100">
                  {formatRupiah(totals.hakBersih)}
                </td>
                <td className="py-3 px-3 text-right text-emerald-400">
                  {formatRupiah(totals.diambilCashTf)}
                </td>
                <td className="py-3 px-3 text-right text-amber-300">
                  {formatRupiah(totals.dititipkan)}
                </td>
                <td colSpan={2} className="py-3 px-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <PrintReceiptModal
        receipt={thermalReceipt}
        onClose={() => setThermalReceipt(null)}
        profilPerusahaan={profilPerusahaan}
      />
    </div>
  );
};
