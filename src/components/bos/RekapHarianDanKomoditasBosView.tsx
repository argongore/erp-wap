import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Vault,
  Wallet,
  Building2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Printer,
  Download,
  RefreshCw,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Sprout,
  Package,
  Filter,
  SlidersHorizontal,
  X,
  Save,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  RekapHarianBosLengkapResponse,
  ItemDetailArusKasBos,
  KolomKomoditasMasukBos,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

interface RekapHarianDanKomoditasBosViewProps {
  onRefreshParent?: () => void;
}

interface DraftStokLamaItem {
  kode: string;
  nama: string;
  satuan: string;
  keterangan: string;
  stokAwal: string;
  rataRataModalAwal: string;
  modalAwalTotal: string;
}

function getTodayIsoWib(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

function ddmmyyyyToIso(ddmmyyyy: string): string {
  const parts = String(ddmmyyyy || '').split('/');
  if (parts.length !== 3) return getTodayIsoWib();
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function shiftIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return getTodayIsoWib();
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatNumberId(val: number, maxDecimals = 1): string {
  const num = Number(val) || 0;
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  }).format(num);
}

function formatTanggalPanjang(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getCommodityHeaderStyle(nama: string, index: number): { bg: string; text: string } {
  const upper = String(nama || '').toUpperCase().trim();
  if (upper.includes('KAYU MANIS KA') || upper.endsWith(' KA')) {
    return { bg: 'bg-[#00FF00]', text: 'text-black' };
  }
  if (upper.includes('KAYU MANIS KB') || upper.endsWith(' KB')) {
    return { bg: 'bg-[#00FFFF]', text: 'text-black' };
  }
  if (upper.includes('KAYU MANIS STIK') || upper.includes('STIK')) {
    return { bg: 'bg-[#FFFF00]', text: 'text-black' };
  }
  if (upper.includes('KAYU MANIS KF') || upper.endsWith(' KF')) {
    return { bg: 'bg-[#FF9900]', text: 'text-black' };
  }
  if (upper === 'KOPI' || upper.startsWith('KOPI ')) {
    return { bg: 'bg-[#6FA8DC]', text: 'text-black' };
  }
  if (upper.includes('LADA')) {
    return { bg: 'bg-[#F9CB9C]', text: 'text-black' };
  }
  if (upper.includes('CENGKEH')) {
    return { bg: 'bg-[#B4A7D6]', text: 'text-black' };
  }
  const palette = [
    { bg: 'bg-[#00FF00]', text: 'text-black' },
    { bg: 'bg-[#00FFFF]', text: 'text-black' },
    { bg: 'bg-[#FFFF00]', text: 'text-black' },
    { bg: 'bg-[#FF9900]', text: 'text-black' },
    { bg: 'bg-[#6FA8DC]', text: 'text-black' },
    { bg: 'bg-[#F9CB9C]', text: 'text-black' },
    { bg: 'bg-[#B4A7D6]', text: 'text-black' },
    { bg: 'bg-[#EA9999]', text: 'text-black' },
  ];
  return palette[index % palette.length];
}

function getCommoditySortPriority(nama: string): number {
  const upper = String(nama || '').toUpperCase().trim();
  if (upper.includes('KAYU MANIS KA')) return 1;
  if (upper.includes('KAYU MANIS KB')) return 2;
  if (upper.includes('KAYU MANIS STIK')) return 3;
  if (upper.includes('KAYU MANIS KF')) return 4;
  if (upper === 'KOPI') return 5;
  if (upper.includes('LADA')) return 6;
  if (upper.includes('CENGKEH')) return 7;
  if (upper.includes('TITIP')) return 90;
  return 20;
}

export const RekapHarianDanKomoditasBosView: React.FC<RekapHarianDanKomoditasBosViewProps> = ({
  onRefreshParent,
}) => {
  const [selectedIsoDate, setSelectedIsoDate] = useState<string>(() => getTodayIsoWib());
  const [data, setData] = useState<RekapHarianBosLengkapResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Scope filter for cash flow detail: ALL (Kasir + Bank) vs KAS01_ONLY (Khusus Laci Kasir)
  const [scopeArusKas, setScopeArusKas] = useState<'SEMUA_REKENING' | 'KHUSUS_KASIR'>('SEMUA_REKENING');

  // Commodity table mode: HARIAN (sesuai tanggal terpilih) vs AKUMULASI (seluruh buku stok komoditas)
  const [modeKomoditas, setModeKomoditas] = useState<'HARIAN' | 'AKUMULASI'>('HARIAN');
  const [sembunyikanKomoditasKosong, setSembunyikanKomoditasKosong] = useState<boolean>(false);

  // Modal Input / Edit Stok Lama & Harga Rata-Rata Lama
  const [showStokLamaModal, setShowStokLamaModal] = useState<boolean>(false);
  const [draftStokLamaList, setDraftStokLamaList] = useState<DraftStokLamaItem[]>([]);
  const [savingStokLama, setSavingStokLama] = useState<boolean>(false);
  const [stokLamaSaveMsg, setStokLamaSaveMsg] = useState<string | null>(null);

  // Copy WA state
  const [copiedWa, setCopiedWa] = useState<boolean>(false);

  // Photo preview modal state
  const [previewItem, setPreviewItem] = useState<ItemDetailArusKasBos | null>(null);
  const [showResetKasirModal, setShowResetKasirModal] = useState<boolean>(false);
  const [resettingKasir, setResettingKasir] = useState<boolean>(false);
  const [kasirResetMsg, setKasirResetMsg] = useState<string>('');

  const fetchRekap = useCallback(async (isoDate: string, silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getRekapHarianBosLengkap(isoDate);
      setData(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat rekapan harian Bos.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRekap(selectedIsoDate, false);
  }, [selectedIsoDate, fetchRekap]);

  useEffect(() => {
    const onUpdated = () => {
      void fetchRekap(selectedIsoDate, true);
    };
    window.addEventListener('erp:data-updated', onUpdated);
    return () => window.removeEventListener('erp:data-updated', onUpdated);
  }, [selectedIsoDate, fetchRekap]);

  const handleManualRefresh = async () => {
    await fetchRekap(selectedIsoDate, false);
    if (onRefreshParent) onRefreshParent();
  };

  const handleConfirmResetKasir = async () => {
    setResettingKasir(true);
    setErrorMsg(null);
    try {
      const res = await api.resetSaldoAwalKasir(true);
      setShowResetKasirModal(false);
      setKasirResetMsg(res.message || 'Saldo Awal Kasir (KAS01) berhasil diset ke Rp 0 & disinkronkan.');
      setTimeout(() => setKasirResetMsg(''), 6000);
      await fetchRekap(selectedIsoDate, false);
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mereset Saldo Awal Kasir ke Rp 0');
    } finally {
      setResettingKasir(false);
    }
  };

  // Open modal to input/edit Stok Lama & Harga Rata-Rata Lama
  const handleOpenStokLamaModal = () => {
    const list = [...(data?.komoditasHarianList || [])].sort((a, b) => {
      const pa = getCommoditySortPriority(a.nama);
      const pb = getCommoditySortPriority(b.nama);
      if (pa !== pb) return pa - pb;
      return a.nama.localeCompare(b.nama, 'id');
    });
    setDraftStokLamaList(
      list.map((col) => ({
        kode: col.kode,
        nama: col.nama,
        satuan: col.satuan,
        keterangan:
          col.stokLama.masterKeteranganAwal &&
          !/^rekap stok manual/i.test(col.stokLama.masterKeteranganAwal)
            ? col.stokLama.masterKeteranganAwal
            : col.stokLama.label || 'STOK LAMA',
        stokAwal: String(col.stokLama.masterStokAwalKg || 0),
        rataRataModalAwal: String(col.stokLama.masterHargaRataAwal || 0),
        modalAwalTotal: String(col.stokLama.masterModalAwalRp || 0),
      }))
    );
    setStokLamaSaveMsg(null);
    setShowStokLamaModal(true);
  };

  const handleUpdateDraftRow = (
    kode: string,
    field: 'keterangan' | 'stokAwal' | 'rataRataModalAwal' | 'modalAwalTotal',
    rawVal: string
  ) => {
    setDraftStokLamaList((prev) =>
      prev.map((row) => {
        if (row.kode !== kode) return row;
        const next = { ...row, [field]: rawVal };
        if (field === 'stokAwal' || field === 'rataRataModalAwal') {
          const kg = Math.max(0, Number(next.stokAwal) || 0);
          const rata = Math.max(0, Number(next.rataRataModalAwal) || 0);
          next.modalAwalTotal = String(Math.round(kg * rata));
        } else if (field === 'modalAwalTotal') {
          const kg = Math.max(0, Number(next.stokAwal) || 0);
          const modal = Math.max(0, Number(next.modalAwalTotal) || 0);
          if (kg > 0) {
            next.rataRataModalAwal = String(Math.round(modal / kg));
          }
        }
        return next;
      })
    );
  };

  const handleSaveStokLama = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStokLama(true);
    setStokLamaSaveMsg(null);
    try {
      const items = draftStokLamaList.map((d) => ({
        kode: d.kode,
        stokAwal: Math.max(0, Number(d.stokAwal) || 0),
        rataRataModalAwal: Math.max(0, Number(d.rataRataModalAwal) || 0),
        modalAwalTotal: Math.max(0, Math.round(Number(d.modalAwalTotal) || 0)),
        keterangan: d.keterangan.trim() || 'STOK LAMA',
      }));
      await api.updateSaldoAwalHasilBumi({ items });
      await fetchRekap(selectedIsoDate, true);
      window.dispatchEvent(new Event('erp:data-updated'));
      if (onRefreshParent) onRefreshParent();
      setShowStokLamaModal(false);
    } catch (err: any) {
      setStokLamaSaveMsg(err?.message || 'Gagal menyimpan data Stok Lama & Harga Rata-Rata.');
    } finally {
      setSavingStokLama(false);
    }
  };

  // Filtered Uang Masuk & Uang Keluar based on scopeArusKas
  const filteredUangMasuk = useMemo(() => {
    const list = data?.detailUangMasuk || [];
    if (scopeArusKas === 'KHUSUS_KASIR') {
      return list.filter((it) => it.nominalKasirTunai > 0 || it.rekeningKode === 'KAS01');
    }
    return list;
  }, [data, scopeArusKas]);

  const filteredUangKeluar = useMemo(() => {
    const list = data?.detailUangKeluar || [];
    if (scopeArusKas === 'KHUSUS_KASIR') {
      return list.filter((it) => it.nominalKasirTunai > 0 || it.rekeningKode === 'KAS01');
    }
    return list;
  }, [data, scopeArusKas]);

  const displayedTotalMasuk =
    scopeArusKas === 'KHUSUS_KASIR'
      ? data?.totalUangMasukKasirTunai || 0
      : data?.totalUangMasuk || 0;

  const displayedTotalKeluar =
    scopeArusKas === 'KHUSUS_KASIR'
      ? data?.totalUangKeluarKasirTunai || 0
      : data?.totalUangKeluar || 0;

  const displayedArusBersih =
    scopeArusKas === 'KHUSUS_KASIR'
      ? data?.arusKasBersihKasirTunai || 0
      : data?.arusKasBersih || 0;

  // Ordered commodity blocks matching attached Excel reference
  const activeKomoditasBlocks: KolomKomoditasMasukBos[] = useMemo(() => {
    const raw =
      modeKomoditas === 'HARIAN'
        ? data?.komoditasHarianList || []
        : data?.komoditasAkumulasiList || [];

    const sorted = [...raw].sort((a, b) => {
      const pa = getCommoditySortPriority(a.nama);
      const pb = getCommoditySortPriority(b.nama);
      if (pa !== pb) return pa - pb;
      return a.nama.localeCompare(b.nama, 'id');
    });

    if (sembunyikanKomoditasKosong) {
      const nonEmpty = sorted.filter(
        (k) =>
          k.stokLama.beratKg > 0 ||
          k.rows.length > 0 ||
          k.totalStokGabunganKg > 0
      );
      return nonEmpty.length > 0 ? nonEmpty : sorted;
    }
    return sorted;
  }, [data, modeKomoditas, sembunyikanKomoditasKosong]);

  // Pad detail rows across all visible commodity blocks so bottom TOTAL row aligns horizontally like Excel
  const paddedRowCount = useMemo(() => {
    const maxLen = activeKomoditasBlocks.reduce((mx, col) => Math.max(mx, col.rows.length), 0);
    return Math.max(modeKomoditas === 'HARIAN' ? 6 : 10, maxLen);
  }, [activeKomoditasBlocks, modeKomoditas]);

  const handleCopyLaporanWa = async () => {
    if (!data) return;
    const k = data.kesimpulanKasirBerangkas;
    const lines: string[] = [
      `*LAPORAN HARIAN BOS — PT. WIJAYA AGRO PERKASA*`,
      `Tanggal: *${data.tanggal}* (${formatTanggalPanjang(data.tanggalIso)})`,
      `----------------------------------------`,
      `*1. ARUS KAS HARIAN (SEMUA REKENING)*`,
      `• Total Uang Masuk : *${formatRupiah(data.totalUangMasuk)}* (${data.detailUangMasuk.length} trx)`,
      `  - Tunai Kasir (KAS01): ${formatRupiah(data.totalUangMasukKasirTunai)}`,
      `  - Bank PT: ${formatRupiah(data.totalUangMasukBank)}`,
      `• Total Uang Keluar: *${formatRupiah(data.totalUangKeluar)}* (${data.detailUangKeluar.length} trx)`,
      `  - Tunai Kasir (KAS01): ${formatRupiah(data.totalUangKeluarKasirTunai)}`,
      `  - Bank PT: ${formatRupiah(data.totalUangKeluarBank)}`,
      `• Selisih Arus Kas : *${data.arusKasBersih >= 0 ? '+' : ''}${formatRupiah(data.arusKasBersih)}*`,
      ``,
      `*2. REKONSILIASI TUTUP KASIR KE BERANGKAS (${data.tanggal})*`,
      `• Saldo Awal Kasir Pagi (Per Hari) : ${formatRupiah(k.saldoAwalKasirPagi)} (Mandiri per hari)`,
      ...(k.droppingMasukKasirHariIni > 0
        ? [`• + Dropping Masuk ke Kasir        : ${formatRupiah(k.droppingMasukKasirHariIni)}`]
        : []),
      `• + Uang Masuk Tunai Kasir         : ${formatRupiah(k.uangMasukOperasionalKasirHariIni)}`,
      `• - Uang Keluar Tunai Kasir        : ${formatRupiah(k.uangKeluarOperasionalKasirHariIni)}`,
      ...(k.mutasiPokokBrilinkKasirHariIni !== 0
        ? [
            `• Mutasi Pokok Tunai BRILink       : ${k.mutasiPokokBrilinkKasirHariIni >= 0 ? '+' : ''}${formatRupiah(k.mutasiPokokBrilinkKasirHariIni)}`,
          ]
        : []),
      ...(k.transferKeluarKeBankLainHariIni > 0
        ? [`• - Setor Tunai ke Bank Lain       : ${formatRupiah(k.transferKeluarKeBankLainHariIni)}`]
        : []),
      `• *= SEBELUM KEMBALI KE BERANGKAS  : ${formatRupiah(k.saldoAkhirKasirSebelumSetorBerangkas)}*`,
      `• - Sudah Dikembalikan ke Berangkas: ${formatRupiah(k.sudahDisetorKeBerangkasHariIni)}`,
      `• *= SALDO AKHIR / SELISIH KASIR   : ${k.saldoAkhirKasirPadaTanggal > 0 ? '+' : ''}${formatRupiah(k.saldoAkhirKasirPadaTanggal)}* (${
        k.saldoAkhirKasirPadaTanggal === 0
          ? 'TUTUP BUKU PAS RP 0'
          : k.saldoAkhirKasirPadaTanggal > 0
          ? 'BELUM KEMBALI KE BERANGKAS'
          : 'SELISIH LEBIH SETOR / KURANG CATAT MASUK'
      })`,
      `• Saldo BERANGKAS Saat Ini         : *${formatRupiah(k.saldoBerangkasSaatIniLive)}*`,
      ``,
      `*3. REKAP STOK & MODAL PEMBELIAN HASIL BUMI*`,
    ];

    const komoditasAktif = data.komoditasHarianList.filter((c) => c.totalStokGabunganKg > 0);
    for (const c of komoditasAktif) {
      lines.push(
        `• *${c.nama}*: Stok Lama ${formatNumberId(c.stokLama.beratKg)} Kg (${formatRupiah(c.stokLama.hargaRataPerKg)}/Kg) + Masuk Hari Ini ${formatNumberId(c.totalKgPeriode)} Kg = *${formatNumberId(c.totalStokGabunganKg)} Kg* | Rata2 *${formatRupiah(c.rataHargaGabunganPerKg)}* | Modal HB: *${formatRupiah(c.totalModalGabunganRp)}*`
      );
    }
    lines.push(
      `• *TOTAL UANG MODAL PEMBELIAN HB*: *${formatRupiah(data.totalUangModalHbDikeluarkan)}* (${formatNumberId(data.totalKgStokGabunganHariIni)} Kg)`
    );

    if (data.barangTokoMasukHariIni.length > 0) {
      lines.push(
        `• Barang Toko Masuk: ${data.barangTokoMasukHariIni.length} item (${formatRupiah(data.totalRpBarangTokoHariIni)})`
      );
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 2500);
    } catch {
      // ignore clipboard error
    }
  };

  const handleDownloadCsvKomoditas = () => {
    if (!data) return;
    const csvRows: string[] = [];
    const judulPeriode =
      modeKomoditas === 'HARIAN' ? `HARIAN_${data.tanggal.replace(/\//g, '-')}` : 'AKUMULASI_SEMUA_TANGGAL';

    // Header row 1: Commodity names (5 columns + 1 spacer per block)
    const headerRow1: string[] = [];
    const headerRow2: string[] = [];
    const stokLamaRowCsv: string[] = [];

    activeKomoditasBlocks.forEach((col, idx) => {
      headerRow1.push(`"${col.nama}"`, '""', '""', '""', '""');
      headerRow2.push('"NAME"', '"DATE"', '"BUY (kg)"', '"PRICE (Rp)"', '"JUMLAH (Rp)"');
      stokLamaRowCsv.push(
        `"${String(col.stokLama.label || 'STOK LAMA').replace(/"/g, '""')}"`,
        `"${col.stokLama.tanggalLabel || ''}"`,
        String(col.stokLama.beratKg || 0),
        String(col.stokLama.hargaRataPerKg || 0),
        String(col.stokLama.jumlahModalRp || 0)
      );
      if (idx < activeKomoditasBlocks.length - 1) {
        headerRow1.push('""');
        headerRow2.push('""');
        stokLamaRowCsv.push('""');
      }
    });
    csvRows.push(headerRow1.join(','));
    csvRows.push(headerRow2.join(','));
    csvRows.push(stokLamaRowCsv.join(','));

    for (let r = 0; r < paddedRowCount; r++) {
      const line: string[] = [];
      activeKomoditasBlocks.forEach((col, idx) => {
        const item = col.rows[r];
        if (item) {
          const prevItem = r > 0 ? col.rows[r - 1] : null;
          const tglCell = !prevItem || prevItem.tanggal !== item.tanggal ? item.tanggal : '';
          line.push(
            `"${String(item.namaMitra || '').replace(/"/g, '""')}"`,
            `"${tglCell}"`,
            String(item.beratBersihKg || 0),
            String(item.hargaPerKg || 0),
            String(item.jumlahRp || 0)
          );
        } else {
          line.push('""', '""', '""', '""', '"-"');
        }
        if (idx < activeKomoditasBlocks.length - 1) {
          line.push('""');
        }
      });
      csvRows.push(line.join(','));
    }

    const totalLine: string[] = [];
    activeKomoditasBlocks.forEach((col, idx) => {
      totalLine.push(
        '"TOTAL STOK & MODAL"',
        '""',
        String(col.totalStokGabunganKg || 0),
        String(col.rataHargaGabunganPerKg || 0),
        String(col.totalModalGabunganRp || 0)
      );
      if (idx < activeKomoditasBlocks.length - 1) {
        totalLine.push('""');
      }
    });
    csvRows.push(totalLine.join(','));

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Barang_Masuk_Komoditas_${judulPeriode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const todayIso = getTodayIsoWib();
  const kesimpulan = data?.kesimpulanKasirBerangkas;
  const selisihKasirPadaTanggal = kesimpulan?.saldoAkhirKasirPadaTanggal || 0;
  const nominalSiapSetorKeBerangkas = Math.max(0, selisihKasirPadaTanggal);

  return (
    <div className="space-y-6">
      {/* HEADER FILTER TANGGAL & AKSI CEPAT */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800">
                <Calendar className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Rekapan Transaksi Harian, Tutup Kasir ke Berangkas &amp; Barang Masuk Komoditas
                </h2>
                <p className="text-xs text-slate-500">
                  Menampilkan arus uang masuk/keluar beserta rinciannya, saldo akhir kasir sebelum dikosongkan ke Berangkas, serta rekap stok &amp; modal pembelian hasil bumi
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Navigasi Tanggal Mundur / Kalender / Maju */}
            <div className="inline-flex items-center rounded-xl border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setSelectedIsoDate((prev) => shiftIsoDate(prev, -1))}
                className="p-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer"
                title="Hari sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                value={selectedIsoDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedIsoDate(e.target.value);
                }}
                className="px-2.5 py-1 bg-transparent text-xs sm:text-sm font-bold text-slate-900 focus:outline-none cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setSelectedIsoDate((prev) => shiftIsoDate(prev, 1))}
                className="p-1.5 rounded-lg hover:bg-white text-slate-700 transition-colors cursor-pointer"
                title="Hari berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedIsoDate(todayIso)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                selectedIsoDate === todayIso
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              Hari Ini
            </button>

            <button
              type="button"
              onClick={() => void handleCopyLaporanWa()}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              {copiedWa ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedWa ? 'Tersalin ke WA' : 'Salin WA Bos'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cetak</span>
            </button>

            <button
              type="button"
              onClick={() => void handleManualRefresh()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              title="Muat ulang rekapan"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-700' : ''}`} />
            </button>
          </div>
        </div>

        {/* Pintasan Tanggal yang Memiliki Transaksi */}
        {data && data.daftarTanggalTersedia.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[11px] font-semibold text-slate-500 shrink-0">
              Pintasan Tanggal Transaksi:
            </span>
            {data.daftarTanggalTersedia.slice(0, 10).map((tgl) => {
              const iso = ddmmyyyyToIso(tgl);
              const active = iso === selectedIsoDate;
              return (
                <button
                  key={tgl}
                  type="button"
                  onClick={() => setSelectedIsoDate(iso)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-colors shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {tgl}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-4 text-xs sm:text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* BAGIAN 1: KESIMPULAN SALDO AKHIR KASIR SEBELUM DITRANSFER KE BERANGKAS */}
      {kesimpulan && (
        <section className="bg-white border-2 border-emerald-600/30 rounded-2xl overflow-hidden shadow-2xs">
          <div className="bg-slate-900 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Vault className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h3 className="text-sm sm:text-base font-bold">
                  Rekonsiliasi Harian Kasir &amp; Pengembalian ke {kesimpulan.namaBerangkas} ({data?.tanggal})
                </h3>
                <p className="text-[11px] text-slate-300">
                  Saldo awal kasir dimulai dari Rp 0 setiap hari (tidak menarik transaksi hari lain). Setelah dikembalikan ke {kesimpulan.namaBerangkas}, saldo kasir kembali mengejar Rp 0.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 text-xs font-mono font-semibold text-amber-300 self-start sm:self-auto">
              {formatTanggalPanjang(selectedIsoDate)}
            </span>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Kolom Kiri (7 kolom): Rumus Perhitungan Saldo Akhir Kasir */}
            <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 pb-1 border-b border-slate-200">
                Perhitungan Pergerakan Uang Tunai Kasir Harian ({kesimpulan.kodeKasir} — Tanggal {data?.tanggal})
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm py-1 gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-700 font-semibold">
                      1. Saldo Kasir Berjalan Pada Hari Itu ({kesimpulan.kodeKasir})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowResetKasirModal(true)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer transition-colors"
                      title="Sinkronkan ulang saldo berjalan master KAS01 dari Rp 0"
                    >
                      <RotateCcw className="w-2.5 h-2.5 text-emerald-400" />
                      <span>Sinkronkan Master KAS01</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Update otomatis pergerakan uang kasir utama pada tanggal {data?.tanggal}
                    {kesimpulan.isTanggalHariIni ? ` · Live Master KAS01: ${formatRupiah(kesimpulan.saldoKasirSaatIniLive)}` : ''}
                  </div>
                </div>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatRupiah(kesimpulan.saldoAkhirKasirPadaTanggal)}
                </span>
              </div>
              {kasirResetMsg && (
                <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-semibold">
                  {kasirResetMsg}
                </div>
              )}

              {kesimpulan.droppingMasukKasirHariIni > 0 && (
                <div className="flex items-center justify-between text-xs sm:text-sm py-1">
                  <span className="text-sky-700 font-medium">
                    + Tambahan Modal / Dropping Masuk ke Kasir ({data?.tanggal})
                  </span>
                  <span className="font-mono font-bold text-sky-700 tabular-nums">
                    +{formatRupiah(kesimpulan.droppingMasukKasirHariIni)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs sm:text-sm py-1">
                <span className="text-emerald-700 font-medium">
                  + Total Uang Masuk Tunai Operasional Kasir ({data?.tanggal})
                </span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums">
                  +{formatRupiah(kesimpulan.uangMasukOperasionalKasirHariIni)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs sm:text-sm py-1">
                <span className="text-rose-700 font-medium">
                  − Total Uang Keluar Tunai Operasional Kasir ({data?.tanggal})
                </span>
                <span className="font-mono font-bold text-rose-700 tabular-nums">
                  −{formatRupiah(kesimpulan.uangKeluarOperasionalKasirHariIni)}
                </span>
              </div>

              {kesimpulan.mutasiPokokBrilinkKasirHariIni !== 0 && (
                <div className="flex items-center justify-between text-xs sm:text-sm py-1">
                  <span className="text-indigo-700 font-medium">
                    ± Mutasi Pokok Tunai BRILink di Kasir
                  </span>
                  <span className="font-mono font-bold text-indigo-700 tabular-nums">
                    {kesimpulan.mutasiPokokBrilinkKasirHariIni >= 0 ? '+' : ''}
                    {formatRupiah(kesimpulan.mutasiPokokBrilinkKasirHariIni)}
                  </span>
                </div>
              )}

              {kesimpulan.transferKeluarKeBankLainHariIni > 0 && (
                <div className="flex items-center justify-between text-xs sm:text-sm py-1">
                  <span className="text-amber-700 font-medium">
                    − Setor Tunai Kasir ke Rekening Bank Lain
                  </span>
                  <span className="font-mono font-bold text-amber-700 tabular-nums">
                    −{formatRupiah(kesimpulan.transferKeluarKeBankLainHariIni)}
                  </span>
                </div>
              )}
            </div>

            {/* Kolom Kanan (5 kolom): Status Pengembalian ke BERANGKAS & Selisih Harian (Target Rp 0) */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-950">
                    Tutup Buku ke {kesimpulan.namaBerangkas} ({data?.tanggal})
                  </span>
                  {selisihKasirPadaTanggal === 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-800 text-[11px] font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Tutup Buku Pas (Rp 0)</span>
                    </span>
                  ) : selisihKasirPadaTanggal > 0 ? (
                    <span className="text-amber-900 text-[11px] font-bold">
                      Belum Kembali ke Berangkas
                    </span>
                  ) : (
                    <span className="text-rose-800 text-[11px] font-bold">
                      Ada Selisih Lebih Setor
                    </span>
                  )}
                </div>

                <div className="bg-white border border-amber-200 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">
                      Uang Kasir Sebelum ke {kesimpulan.namaBerangkas}:
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatRupiah(kesimpulan.saldoAkhirKasirSebelumSetorBerangkas)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">
                      − Sudah Dikembalikan ke {kesimpulan.namaBerangkas} ({data?.tanggal}):
                    </span>
                    <span className="font-mono font-bold text-emerald-800 tabular-nums">
                      −{formatRupiah(kesimpulan.sudahDisetorKeBerangkasHariIni)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <div>
                      <div className="font-bold text-slate-900">
                        = Saldo Akhir / Selisih Kasir ({data?.tanggal})
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {selisihKasirPadaTanggal === 0
                          ? 'Sudah kembali ke Berangkas dengan pas (Rp 0)'
                          : selisihKasirPadaTanggal > 0
                          ? `Kurang dikembalikan ${formatRupiah(nominalSiapSetorKeBerangkas)} agar Rp 0`
                          : `Lebih dikembalikan / kurang catat uang masuk ${formatRupiah(Math.abs(selisihKasirPadaTanggal))}`}
                      </div>
                    </div>
                    <span
                      className={`font-mono text-base font-extrabold tabular-nums ${
                        selisihKasirPadaTanggal === 0
                          ? 'text-emerald-700'
                          : selisihKasirPadaTanggal > 0
                          ? 'text-amber-800'
                          : 'text-rose-700'
                      }`}
                    >
                      {selisihKasirPadaTanggal > 0 ? '+' : ''}
                      {formatRupiah(selisihKasirPadaTanggal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 text-white rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">
                    Saldo {kesimpulan.namaBerangkas} Saat Ini (Live):
                  </span>
                  <span className="font-mono font-bold text-white tabular-nums">
                    {formatRupiah(kesimpulan.saldoBerangkasSaatIniLive)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">
                    Saldo Master {kesimpulan.kodeKasir} Saat Ini (Live):
                  </span>
                  <span className="font-mono font-bold text-amber-300 tabular-nums">
                    {formatRupiah(kesimpulan.saldoKasirSaatIniLive)}
                  </span>
                </div>
                {kesimpulan.isTanggalHariIni && nominalSiapSetorKeBerangkas > 0 && (
                  <div className="pt-2 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300">
                      Estimasi {kesimpulan.namaBerangkas} Setelah Tutup Kasir:
                    </span>
                    <span className="font-mono text-base font-extrabold text-emerald-400 tabular-nums">
                      {formatRupiah(kesimpulan.estimasiSaldoBerangkasSetelahKosongkanKasir)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* BAGIAN 2: ARUS KAS HARIAN — UANG MASUK & UANG KELUAR BESERTA DETAILNYA */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              Arus Kas Harian: Rincian Uang Masuk &amp; Uang Keluar ({data?.tanggal || '-'})
            </h3>
            <p className="text-xs text-slate-500">
              Daftar lengkap setiap transaksi uang masuk dan uang keluar pada tanggal terpilih
            </p>
          </div>

          {/* Filter Cakupan Rekening */}
          <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setScopeArusKas('SEMUA_REKENING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                scopeArusKas === 'SEMUA_REKENING'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Rekening (Kasir + Bank)
            </button>
            <button
              type="button"
              onClick={() => setScopeArusKas('KHUSUS_KASIR')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                scopeArusKas === 'KHUSUS_KASIR'
                  ? 'bg-emerald-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Khusus Kasir Tunai (KAS01)
            </button>
          </div>
        </div>

        {/* 3 Ringkasan Angka Arus Kas Harian */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 bg-slate-50/70 border-b border-slate-200">
          <div className="bg-white border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-800 uppercase">
                Total Uang Masuk ({filteredUangMasuk.length} Trx)
              </span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-1.5 font-mono text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums">
              +{formatRupiah(displayedTotalMasuk)}
            </div>
            {scopeArusKas === 'SEMUA_REKENING' && data && (
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>Kasir: {formatRupiah(data.totalUangMasukKasirTunai)}</span>
                <span>·</span>
                <span>Bank: {formatRupiah(data.totalUangMasukBank)}</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-rose-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-800 uppercase">
                Total Uang Keluar ({filteredUangKeluar.length} Trx)
              </span>
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-1.5 font-mono text-xl sm:text-2xl font-extrabold text-rose-700 tabular-nums">
              −{formatRupiah(displayedTotalKeluar)}
            </div>
            {scopeArusKas === 'SEMUA_REKENING' && data && (
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                <span>Kasir: {formatRupiah(data.totalUangKeluarKasirTunai)}</span>
                <span>·</span>
                <span>Bank: {formatRupiah(data.totalUangKeluarBank)}</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase">
                Selisih Bersih Harian (Masuk − Keluar)
              </span>
              <Wallet className="w-4 h-4 text-slate-500" />
            </div>
            <div
              className={`mt-1.5 font-mono text-xl sm:text-2xl font-extrabold tabular-nums ${
                displayedArusBersih >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {displayedArusBersih >= 0 ? '+' : ''}
              {formatRupiah(displayedArusBersih)}
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500">
              {scopeArusKas === 'KHUSUS_KASIR'
                ? 'Khusus pergerakan uang tunai KAS01'
                : 'Gabungan Kas Utama Kasir + Rekening Bank PT'}
            </div>
          </div>
        </div>

        {/* Dua Tabel Detail: Uang Masuk & Uang Keluar */}
        <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-200">
          {/* TABEL DETAIL UANG MASUK */}
          <div className="flex flex-col">
            <div className="px-5 py-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <h4 className="text-xs sm:text-sm font-extrabold text-emerald-950 uppercase tracking-wide">
                  Detail Uang Masuk Hari Ini
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-800">
                {filteredUangMasuk.length} Transaksi
              </span>
            </div>

            {data && data.rincianKategoriMasuk.length > 0 && (
              <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex flex-wrap gap-1.5">
                {data.rincianKategoriMasuk.map((kat) => (
                  <span
                    key={kat.label}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-[11px] font-medium text-emerald-900"
                  >
                    <span>{kat.label}:</span>
                    <strong className="font-mono">
                      {formatRupiah(scopeArusKas === 'KHUSUS_KASIR' ? kat.kasirTunai : kat.total)}
                    </strong>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-bold">Jam / Ref</th>
                    <th className="py-2.5 px-3 font-bold">Pihak &amp; Detail Uang Masuk</th>
                    <th className="py-2.5 px-3 font-bold">Rekening</th>
                    <th className="py-2.5 px-4 font-bold text-right">Nominal Masuk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUangMasuk.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 px-4 text-center text-slate-400">
                        Belum ada transaksi uang masuk pada tanggal {data?.tanggal || 'ini'}.
                      </td>
                    </tr>
                  ) : (
                    filteredUangMasuk.map((item) => {
                      const nominalTampil =
                        scopeArusKas === 'KHUSUS_KASIR' ? item.nominalKasirTunai : item.nominalTotal;
                      return (
                        <tr key={`in-${item.id}`} className="hover:bg-emerald-50/30 align-top">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-800">{item.jam || '-'}</div>
                            <div className="font-mono text-[10px] text-slate-400">{item.id}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                {item.kategoriLabel}
                              </span>
                              {item.divisi && (
                                <span className="text-[10px] font-semibold text-slate-500">
                                  · {item.divisi}
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-slate-900">{item.pihak}</div>
                            <div className="text-slate-600 mt-0.5 leading-snug">{item.deskripsi}</div>
                            {item.fotoBukti && (
                              <button
                                type="button"
                                onClick={() => setPreviewItem(item)}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                              >
                                <ImageIcon className="w-3 h-3" />
                                <span>Lihat Foto Bukti</span>
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                                item.rekeningKode === 'KAS01'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {item.rekeningKode === 'KAS01' ? (
                                <Wallet className="w-3 h-3" />
                              ) : (
                                <Building2 className="w-3 h-3" />
                              )}
                              {item.rekeningKode}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5 max-w-[110px] truncate">
                              {item.rekeningNama}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-700 whitespace-nowrap tabular-nums">
                            +{formatRupiah(nominalTampil)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredUangMasuk.length > 0 && (
                  <tfoot>
                    <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-bold">
                      <td colSpan={3} className="py-2.5 px-4 text-emerald-950 uppercase">
                        Total Uang Masuk ({data?.tanggal})
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm font-extrabold text-emerald-800 tabular-nums">
                        +{formatRupiah(displayedTotalMasuk)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* TABEL DETAIL UANG KELUAR */}
          <div className="flex flex-col">
            <div className="px-5 py-3 bg-rose-50/70 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600" />
                <h4 className="text-xs sm:text-sm font-extrabold text-rose-950 uppercase tracking-wide">
                  Detail Uang Keluar Hari Ini
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-rose-800">
                {filteredUangKeluar.length} Transaksi
              </span>
            </div>

            {data && data.rincianKategoriKeluar.length > 0 && (
              <div className="px-5 py-2.5 bg-slate-50/60 border-b border-slate-100 flex flex-wrap gap-1.5">
                {data.rincianKategoriKeluar.map((kat) => (
                  <span
                    key={kat.label}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11px] font-medium text-rose-900"
                  >
                    <span>{kat.label}:</span>
                    <strong className="font-mono">
                      {formatRupiah(scopeArusKas === 'KHUSUS_KASIR' ? kat.kasirTunai : kat.total)}
                    </strong>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="py-2.5 px-4 font-bold">Jam / Ref</th>
                    <th className="py-2.5 px-3 font-bold">Pihak &amp; Detail Uang Keluar</th>
                    <th className="py-2.5 px-3 font-bold">Rekening</th>
                    <th className="py-2.5 px-4 font-bold text-right">Nominal Keluar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUangKeluar.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 px-4 text-center text-slate-400">
                        Belum ada transaksi uang keluar pada tanggal {data?.tanggal || 'ini'}.
                      </td>
                    </tr>
                  ) : (
                    filteredUangKeluar.map((item) => {
                      const nominalTampil =
                        scopeArusKas === 'KHUSUS_KASIR' ? item.nominalKasirTunai : item.nominalTotal;
                      return (
                        <tr key={`out-${item.id}`} className="hover:bg-rose-50/30 align-top">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-800">{item.jam || '-'}</div>
                            <div className="font-mono text-[10px] text-slate-400">{item.id}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                                {item.kategoriLabel}
                              </span>
                              {item.divisi && (
                                <span className="text-[10px] font-semibold text-slate-500">
                                  · {item.divisi}
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-slate-900">{item.pihak}</div>
                            <div className="text-slate-600 mt-0.5 leading-snug">{item.deskripsi}</div>
                            {item.fotoBukti && (
                              <button
                                type="button"
                                onClick={() => setPreviewItem(item)}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 hover:underline cursor-pointer"
                              >
                                <ImageIcon className="w-3 h-3" />
                                <span>Lihat Foto Nota</span>
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold ${
                                item.rekeningKode === 'KAS01'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {item.rekeningKode === 'KAS01' ? (
                                <Wallet className="w-3 h-3" />
                              ) : (
                                <Building2 className="w-3 h-3" />
                              )}
                              {item.rekeningKode}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5 max-w-[110px] truncate">
                              {item.rekeningNama}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-extrabold text-rose-700 whitespace-nowrap tabular-nums">
                            −{formatRupiah(nominalTampil)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredUangKeluar.length > 0 && (
                  <tfoot>
                    <tr className="bg-rose-50 border-t-2 border-rose-200 font-bold">
                      <td colSpan={3} className="py-2.5 px-4 text-rose-950 uppercase">
                        Total Uang Keluar ({data?.tanggal})
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-sm font-extrabold text-rose-800 tabular-nums">
                        −{formatRupiah(displayedTotalKeluar)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* Mutasi Internal Pindah Buku (Kasir <-> Berangkas / Bank) jika ada */}
        {data && data.detailMutasiKasirBerangkas.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="flex items-center gap-2 mb-2.5">
              <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Riwayat Pindah Buku / Setor Berangkas &amp; Mutasi Pokok ({data.tanggal})
              </h4>
            </div>
            <div className="space-y-1.5">
              {data.detailMutasiKasirBerangkas.map((m) => (
                <div
                  key={`mut-${m.id}`}
                  className="bg-white border border-slate-200 rounded-lg px-3.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-600">{m.jam}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold text-[10px]">
                      {m.kategoriLabel}
                    </span>
                    <span className="text-slate-700 font-medium">{m.deskripsi}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-500">{m.rekeningNama}</span>
                    <span className="font-bold text-indigo-800 tabular-nums">
                      {formatRupiah(m.nominalTotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* BAGIAN 3: REKAPAN BARANG MASUK PER HARINYA — DIPISAHKAN BERDASARKAN KOMODITAS + STOK LAMA & MODAL HB */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-lime-100 text-lime-800 shrink-0 mt-0.5">
              <Sprout className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Rekapan Barang Masuk &amp; Modal Pembelian Hasil Bumi — Per Komoditas
              </h3>
              <p className="text-xs text-slate-500">
                Baris paling atas menampilkan <strong>Stok Lama &amp; Harga Rata-Rata Lama</strong>, diikuti pembelian masuk dari mitra dan <strong>Total Uang Modal Pembelian HB</strong> di bagian bawah
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Switch Per Hari vs Akumulasi */}
            <div className="inline-flex items-center rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setModeKomoditas('HARIAN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  modeKomoditas === 'HARIAN'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Per Hari ({data?.tanggal || 'Hari Ini'})
              </button>
              <button
                type="button"
                onClick={() => setModeKomoditas('AKUMULASI')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  modeKomoditas === 'AKUMULASI'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Tanggal (Buku Stok)
              </button>
            </div>

            <button
              type="button"
              onClick={handleOpenStokLamaModal}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              title="Input atau sesuaikan Stok Lama, Harga Rata-Rata Lama, dan Modal Awal per Komoditas"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Input / Edit Stok Lama &amp; Rata-Rata</span>
            </button>

            <button
              type="button"
              onClick={() => setSembunyikanKomoditasKosong((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                sembunyikanKomoditasKosong
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              <span>{sembunyikanKomoditasKosong ? 'Hanya Komoditas Aktif' : 'Semua Kolom'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCsvKomoditas}
              disabled={!data}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh Excel/CSV</span>
            </button>
          </div>
        </div>

        {/* Ringkasan Uang Modal yang Sudah Dikeluarkan untuk Membeli Hasil Bumi */}
        {data && (
          <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                1. Modal Stok Lama (Sebelum {data.tanggal})
              </div>
              <div className="mt-1 font-mono text-lg sm:text-xl font-extrabold text-slate-900 tabular-nums">
                {formatRupiah(data.totalModalStokLamaHariIni)}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Total Tonase Lama: <strong>{formatNumberId(data.totalKgStokLamaHariIni, 1)} Kg</strong>
              </div>
            </div>

            <div className="bg-white border border-emerald-200 rounded-xl px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                2. Modal Beli HB Masuk ({data.tanggal})
              </div>
              <div className="mt-1 font-mono text-lg sm:text-xl font-extrabold text-emerald-700 tabular-nums">
                +{formatRupiah(data.totalRpHasilBumiHariIni)}
              </div>
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                Tonase Masuk Hari Ini: <strong>{formatNumberId(data.totalKgHasilBumiHariIni, 1)} Kg</strong>
              </div>
            </div>

            <div className="bg-[#70AD47]/15 border-2 border-[#70AD47] rounded-xl px-4 py-3">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-950">
                3. Jumlah Uang Modal Pembelian HB (Stok Lama + Masuk)
              </div>
              <div className="mt-1 font-mono text-lg sm:text-xl font-extrabold text-emerald-950 tabular-nums">
                {formatRupiah(data.totalUangModalHbDikeluarkan)}
              </div>
              <div className="text-[11px] text-emerald-900 font-mono mt-0.5">
                Total Stok Terkumpul: <strong>{formatNumberId(data.totalKgStokGabunganHariIni, 1)} Kg</strong>
              </div>
            </div>
          </div>
        )}

        {/* SPREADSHEET MULTI-KOMODITAS BERDAMPINGAN (PERSIS CONTOH GAMBAR EXCEL BOS) */}
        <div className="p-4 overflow-x-auto bg-white">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Baris paling atas tiap komoditas = <strong>Stok Lama, Harga Rata-Rata Lama &amp; Jumlah Modal Lama</strong>. Baris hijau bawah = <strong>Total Stok, Harga Rata-Rata &amp; Total Uang Modal HB</strong>.
            </span>
            <span className="hidden sm:inline font-medium">Geser tabel ke kanan →</span>
          </div>

          {activeKomoditasBlocks.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Belum ada master komoditas hasil bumi yang terdaftar.
            </div>
          ) : (
            <table className="border-collapse text-[11px] font-mono select-text min-w-max">
              <thead>
                {/* Baris 1: Judul Warna per Blok Komoditas */}
                <tr>
                  {activeKomoditasBlocks.map((col, idx) => {
                    const color = getCommodityHeaderStyle(col.nama, idx);
                    return (
                      <React.Fragment key={`hdr1-${col.kode}`}>
                        <th
                          colSpan={5}
                          className={`${color.bg} ${color.text} border border-slate-700 py-2 px-3 text-center text-xs sm:text-sm font-extrabold uppercase tracking-wide`}
                        >
                          {col.nama}
                        </th>
                        {idx < activeKomoditasBlocks.length - 1 && (
                          <th className="w-4 min-w-[16px] bg-white border-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>

                {/* Baris 2: Sub-header Kolom (NAME | DATE | BUY (kg) | PRICE (Rp) | JUMLAH (Rp)) seperti gambar acuan */}
                <tr>
                  {activeKomoditasBlocks.map((col, idx) => (
                    <React.Fragment key={`hdr2-${col.kode}`}>
                      <th className="bg-[#E2EFDA] text-black border border-slate-600 py-1.5 px-2.5 text-center font-sans font-extrabold min-w-[155px]">
                        NAME
                      </th>
                      <th className="bg-[#E2EFDA] text-black border border-slate-600 py-1.5 px-2 text-center font-sans font-extrabold min-w-[82px]">
                        DATE
                      </th>
                      <th className="bg-[#E2EFDA] text-black border border-slate-600 py-1.5 px-2 text-right font-sans font-semibold min-w-[74px]">
                        BUY (kg)
                      </th>
                      <th className="bg-[#E2EFDA] text-black border border-slate-600 py-1.5 px-2 text-center font-sans font-extrabold min-w-[96px]">
                        PRICE (Rp)
                      </th>
                      <th className="bg-[#E2EFDA] text-black border border-slate-600 py-1.5 px-2.5 text-center font-sans font-extrabold min-w-[132px]">
                        JUMLAH (Rp)
                      </th>
                      {idx < activeKomoditasBlocks.length - 1 && (
                        <th className="w-4 min-w-[16px] bg-white border-0" />
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* BARIS PALING ATAS SENDIRI: STOK LAMA + HARGA RATA-RATA LAMA + MODAL LAMA (Sesuai Gambar 1: SISA SEPTEMBER | 1 OKT | 3,633.4 | Rp 50,846 | Rp 184,742,900) */}
                <tr>
                  {activeKomoditasBlocks.map((col, colIdx) => {
                    const sl = col.stokLama;
                    return (
                      <React.Fragment key={`stoklama-${col.kode}`}>
                        <td className="bg-white border border-slate-600 py-1.5 px-2.5 text-center font-serif font-extrabold text-black uppercase whitespace-nowrap">
                          {sl.label}
                        </td>
                        <td className="bg-white border border-slate-600 py-1.5 px-2 text-center font-serif font-extrabold text-black uppercase whitespace-nowrap">
                          {sl.tanggalLabel}
                        </td>
                        <td className="bg-white border border-slate-600 py-1.5 px-2 text-right font-semibold text-black whitespace-nowrap tabular-nums">
                          {formatNumberId(sl.beratKg, 1)}
                        </td>
                        <td className="bg-white border border-slate-600 py-1.5 px-2 text-black whitespace-nowrap tabular-nums">
                          {sl.hargaRataPerKg > 0 ? (
                            <div className="flex items-center justify-between gap-1.5 font-extrabold">
                              <span>Rp</span>
                              <span>{formatNumberId(sl.hargaRataPerKg, 0)}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-1.5 text-slate-400">
                              <span>Rp</span>
                              <span>-</span>
                            </div>
                          )}
                        </td>
                        <td className="bg-white border border-slate-600 py-1.5 px-2.5 text-black whitespace-nowrap tabular-nums">
                          {sl.jumlahModalRp > 0 ? (
                            <div className="flex items-center justify-between gap-2 font-extrabold">
                              <span>Rp</span>
                              <span>{formatNumberId(sl.jumlahModalRp, 0)}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 text-slate-400">
                              <span>Rp</span>
                              <span>-</span>
                            </div>
                          )}
                        </td>
                        {colIdx < activeKomoditasBlocks.length - 1 && (
                          <td className="w-4 min-w-[16px] bg-white border-0" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>

                {/* BARIS-BARIS PEMBELIAN BARANG MASUK DARI MITRA */}
                {Array.from({ length: paddedRowCount }).map((_, rowIdx) => (
                  <tr key={`row-${rowIdx}`} className="hover:bg-slate-50/70">
                    {activeKomoditasBlocks.map((col, colIdx) => {
                      const item = col.rows[rowIdx];
                      const prevItem = rowIdx > 0 ? col.rows[rowIdx - 1] : null;
                      const showDate =
                        item && (!prevItem || prevItem.tanggal !== item.tanggal)
                          ? item.tanggal
                          : '';

                      return (
                        <React.Fragment key={`cell-${col.kode}-${rowIdx}`}>
                          <td
                            className={`border border-slate-400 py-1 px-2.5 text-left font-sans font-semibold text-black uppercase whitespace-nowrap ${
                              item ? 'bg-[#999999]/45' : 'bg-white'
                            }`}
                          >
                            {item ? item.namaMitra : ''}
                          </td>
                          <td className="border border-slate-400 py-1 px-2 text-right text-slate-800 whitespace-nowrap">
                            {showDate}
                          </td>
                          <td className="border border-slate-400 py-1 px-2 text-right text-black whitespace-nowrap tabular-nums">
                            {item ? formatNumberId(item.beratBersihKg, 1) : ''}
                          </td>
                          <td className="border border-slate-400 py-1 px-2 text-right text-black whitespace-nowrap tabular-nums">
                            {item
                              ? item.isBelumPutusHarga && item.hargaPerKg <= 0
                                ? 'BELUM PUTUS'
                                : formatNumberId(item.hargaPerKg, 0)
                              : ''}
                          </td>
                          <td className="border border-slate-400 py-1 px-2.5 text-black whitespace-nowrap tabular-nums">
                            {item && item.jumlahRp > 0 ? (
                              <div className="flex items-center justify-between gap-2 font-bold">
                                <span>Rp</span>
                                <span>{formatNumberId(item.jumlahRp, 0)}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2 text-slate-600 font-bold">
                                <span>Rp</span>
                                <span>-</span>
                              </div>
                            )}
                          </td>
                          {colIdx < activeKomoditasBlocks.length - 1 && (
                            <td className="w-4 min-w-[16px] bg-white border-0" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot>
                {/* Pada Mode Per Hari, tampilkan baris ringkas Penambahan Masuk Hari Ini sebelum baris Hijau Total Stok & Modal */}
                {modeKomoditas === 'HARIAN' && (
                  <tr>
                    {activeKomoditasBlocks.map((col, colIdx) => (
                      <React.Fragment key={`sub-harian-${col.kode}`}>
                        <td
                          colSpan={2}
                          className="bg-[#EAF4E6] text-slate-800 border border-slate-500 py-1.5 px-2.5 text-center font-sans text-[10px] font-bold uppercase"
                        >
                          MASUK HARI INI ({data?.tanggal || '-'})
                        </td>
                        <td className="bg-[#EAF4E6] text-slate-900 border border-slate-500 py-1.5 px-2 text-right font-bold whitespace-nowrap tabular-nums">
                          {formatNumberId(col.totalKgPeriode, 1)}
                        </td>
                        <td className="bg-[#EAF4E6] text-slate-900 border border-slate-500 py-1.5 px-2 text-right font-bold whitespace-nowrap tabular-nums">
                          {col.rataHargaPerKgPeriode > 0 ? (
                            <div className="flex items-center justify-between gap-1">
                              <span>Rp</span>
                              <span>{formatNumberId(col.rataHargaPerKgPeriode, 0)}</span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="bg-[#EAF4E6] text-slate-900 border border-slate-500 py-1.5 px-2.5 font-bold whitespace-nowrap tabular-nums">
                          <div className="flex items-center justify-between gap-2">
                            <span>Rp</span>
                            <span>
                              {col.totalRpPeriode > 0 ? formatNumberId(col.totalRpPeriode, 0) : '-'}
                            </span>
                          </div>
                        </td>
                        {colIdx < activeKomoditasBlocks.length - 1 && (
                          <td className="w-4 min-w-[16px] bg-white border-0" />
                        )}
                      </React.Fragment>
                    ))}
                  </tr>
                )}

                {/* BARIS HIJAU UTAMA BAWAH (Sesuai Gambar 2: 6,190.5 | Rp 51,471 | Rp 318,631,066): TOTAL STOK + RATA-RATA HARGA + JUMLAH UANG MODAL PEMBELIAN HB */}
                <tr>
                  {activeKomoditasBlocks.map((col, colIdx) => (
                    <React.Fragment key={`ftr-main-${col.kode}`}>
                      <td
                        colSpan={2}
                        className="bg-[#70AD47] text-black border border-slate-700 py-2 px-2.5 text-center font-sans font-extrabold uppercase"
                      >
                        TOTAL STOK &amp; MODAL HB
                      </td>
                      <td className="bg-[#70AD47] text-black border border-slate-700 py-2 px-2 text-right font-serif text-xs font-extrabold whitespace-nowrap tabular-nums">
                        {formatNumberId(col.totalStokGabunganKg, 1)}
                      </td>
                      <td className="bg-[#70AD47] text-black border border-slate-700 py-2 px-2 font-serif text-xs font-extrabold whitespace-nowrap tabular-nums">
                        {col.rataHargaGabunganPerKg > 0 ? (
                          <div className="flex items-center justify-between gap-1.5">
                            <span>Rp</span>
                            <span>{formatNumberId(col.rataHargaGabunganPerKg, 0)}</span>
                          </div>
                        ) : (
                          <div className="text-right">-</div>
                        )}
                      </td>
                      <td className="bg-[#70AD47] text-black border border-slate-700 py-2 px-2.5 font-serif text-xs font-extrabold whitespace-nowrap tabular-nums">
                        <div className="flex items-center justify-between gap-2">
                          <span>Rp</span>
                          <span>
                            {col.totalModalGabunganRp > 0
                              ? formatNumberId(col.totalModalGabunganRp, 0)
                              : '-'}
                          </span>
                        </div>
                      </td>
                      {colIdx < activeKomoditasBlocks.length - 1 && (
                        <td className="w-4 min-w-[16px] bg-white border-0" />
                      )}
                    </React.Fragment>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Rincian Barang Toko / Saprotan Masuk Hari Ini (jika ada kulakan pada tanggal tersebut) */}
        {data && data.barangTokoMasukHariIni.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-4 bg-slate-50/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-sky-700" />
                <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                  Barang Dagang Toko / Saprotan Masuk ({data.tanggal})
                </h4>
              </div>
              <span className="text-xs font-mono font-bold text-sky-800">
                Total: {formatRupiah(data.totalRpBarangTokoHariIni)}
              </span>
            </div>
            <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3 font-bold">No. Faktur</th>
                    <th className="py-2 px-3 font-bold">Supplier</th>
                    <th className="py-2 px-3 font-bold">Nama Barang</th>
                    <th className="py-2 px-3 font-bold text-right">Qty Masuk</th>
                    <th className="py-2 px-3 font-bold text-right">Harga Beli</th>
                    <th className="py-2 px-3 font-bold text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.barangTokoMasukHariIni.map((b, i) => (
                    <tr key={`${b.idFaktur}-${i}`} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-mono text-slate-600">{b.idFaktur}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{b.namaSupplier}</td>
                      <td className="py-2 px-3 font-bold text-slate-900">{b.namaProduk}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {formatNumberId(b.qty)} {b.satuan}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{formatRupiah(b.hargaBeli)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {formatRupiah(b.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* MODAL INPUT / EDIT STOK LAMA & HARGA RATA-RATA LAMA PER KOMODITAS */}
      {showStokLamaModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-4xl w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold">
                  Input / Sesuaikan Stok Lama, Harga Rata-Rata Lama &amp; Modal Awal Hasil Bumi
                </h3>
                <p className="text-[11px] text-slate-300">
                  Data ini tampil di baris paling atas setiap blok komoditas (seperti SISA BULAN LALU) dan menjadi dasar perhitungan rata-rata modal pembelian HB
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStokLamaModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStokLama} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto space-y-3 flex-1">
                {stokLamaSaveMsg && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                    {stokLamaSaveMsg}
                  </div>
                )}

                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                        <th className="py-2.5 px-3 font-bold">Komoditas</th>
                        <th className="py-2.5 px-3 font-bold">Label Baris Atas (Contoh: SISA OKTOBER)</th>
                        <th className="py-2.5 px-3 font-bold text-right">Stok Lama (Kg)</th>
                        <th className="py-2.5 px-3 font-bold text-right">Harga Rata-Rata Lama (Rp/Kg)</th>
                        <th className="py-2.5 px-3 font-bold text-right">Jumlah Uang Modal Lama (Rp)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draftStokLamaList.map((row) => (
                        <tr key={row.kode} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{row.nama}</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {row.kode} · {row.satuan}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={row.keterangan}
                              onChange={(e) =>
                                handleUpdateDraftRow(row.kode, 'keterangan', e.target.value)
                              }
                              placeholder="Contoh: SISA OKTOBER"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold uppercase text-slate-900 focus:outline-none focus:border-emerald-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={row.stokAwal}
                              onChange={(e) =>
                                handleUpdateDraftRow(row.kode, 'stokAwal', e.target.value)
                              }
                              className="w-28 px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={row.rataRataModalAwal}
                              onChange={(e) =>
                                handleUpdateDraftRow(row.kode, 'rataRataModalAwal', e.target.value)
                              }
                              className="w-32 px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={row.modalAwalTotal}
                              onChange={(e) =>
                                handleUpdateDraftRow(row.kode, 'modalAwalTotal', e.target.value)
                              }
                              className="w-40 px-2.5 py-1.5 rounded-lg border border-slate-300 text-right font-mono font-bold text-emerald-800 bg-emerald-50/40 focus:outline-none focus:border-emerald-600"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowStokLamaModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingStokLama}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingStokLama ? 'Menyimpan...' : 'Simpan Stok Lama & Harga Rata-Rata'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Preview Foto Bukti Nota / Struk */}
      <FotoNotaPreviewModal
        isOpen={Boolean(previewItem?.fotoBukti)}
        onClose={() => setPreviewItem(null)}
        imageUrl={previewItem?.fotoBukti}
        title={`Bukti Transaksi — ${previewItem?.kategoriLabel || ''}`}
        nomorBukti={previewItem?.id}
        namaMitra={previewItem?.pihak}
        tanggal={previewItem ? `${previewItem.tanggal} ${previewItem.jam}` : undefined}
        nominalText={previewItem ? formatRupiah(previewItem.nominalTotal) : undefined}
        keterangan={previewItem?.deskripsi}
      />

      {showResetKasirModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden border border-slate-200 shadow-2xl text-xs">
            <div className="p-4 bg-slate-900 text-white font-bold text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <span>Set Saldo Awal Kasir (KAS01) = Rp 0</span>
              </div>
              <button
                type="button"
                disabled={resettingKasir}
                onClick={() => setShowResetKasirModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-5 space-y-3.5 text-slate-700">
              <p className="leading-relaxed">
                Mengatur <strong>Saldo Awal Kasir (KAS01) menjadi Rp 0</strong> dan menyinkronkan ulang saldo kasir berdasarkan seluruh mutasi kasir riil agar tidak ada selisih saldo awal.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={resettingKasir}
                  onClick={() => setShowResetKasirModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={resettingKasir}
                  onClick={handleConfirmResetKasir}
                  className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold cursor-pointer"
                >
                  {resettingKasir ? 'Menyinkronkan...' : 'Ya, Set Saldo Awal = Rp 0'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
