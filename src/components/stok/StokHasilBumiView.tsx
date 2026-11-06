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
  CheckCircle2,
  X,
  FileSpreadsheet,
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
import { ModalInvoiceSuratJalan } from './ModalInvoiceSuratJalan.tsx';
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
  onInputUangMasuk?: (noPenjualan: string) => void;
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

function formatKgBukuMutasi(kg: number): string {
  return (Number(kg) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

function formatAngkaBukuMutasi(num: number): string {
  return Math.round(Number(num) || 0).toLocaleString('en-US');
}

function parseTanggalSortKey(tanggal?: string): number {
  if (!tanggal) return 0;
  const parts = String(tanggal).trim().split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10) || 1;
    const m = parseInt(parts[1], 10) || 1;
    const y = parseInt(parts[2], 10) || 2026;
    return y * 10000 + m * 100 + d;
  }
  const isoParts = String(tanggal).trim().split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const y = parseInt(isoParts[0], 10) || 2026;
    const m = parseInt(isoParts[1], 10) || 1;
    const d = parseInt(isoParts[2], 10) || 1;
    return y * 10000 + m * 100 + d;
  }
  return 0;
}

type BukuMutasiRow =
  | {
      kind: 'PURCHASE';
      key: string;
      nama: string;
      tanggalDisplay: string;
      tanggalAsli: string;
      beratKg: number;
      hargaPerKg: number;
      jumlahRp: number;
      showRpPrefix: boolean;
      isBelumPutus?: boolean;
      isStokAwal?: boolean;
      txPurchase?: TransaksiPembelianHasilBumi;
    }
  | {
      kind: 'SPACER';
      key: string;
    }
  | {
      kind: 'JUMLAH';
      key: string;
      label: string;
      beratKg: number;
      rataHargaPerKg: number;
      jumlahRp: number;
    }
  | {
      kind: 'MUAT';
      key: string;
      label: string;
      tanggalDisplay: string;
      beratKg: number;
      jumlahRp: number;
      txSale: TransaksiPenjualanHasilBumi;
    }
  | {
      kind: 'SISA';
      key: string;
      beratKg: number;
      jumlahRp: number;
    }
  | {
      kind: 'SUSUT';
      key: string;
      beratKg: number;
    };

export const StokHasilBumiView: React.FC<Props> = ({
  stokList,
  pembelianList,
  penjualanHasilBumiList = [],
  mitraList = [],
  rekeningList = [],
  onRefresh,
  onPrintReceipt,
  onInputUangMasuk,
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

  const [showHapusHbModal, setShowHapusHbModal] = useState<boolean>(false);
  const [hapusHbKode, setHapusHbKode] = useState<string>('');
  const [hapusHbLoading, setHapusHbLoading] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string>('');

  const [showJualModal, setShowJualModal] = useState<boolean>(false);
  const [showInvoiceSjModal, setShowInvoiceSjModal] = useState<boolean>(false);
  const [jualInitialKode, setJualInitialKode] = useState<string | undefined>(undefined);

  const [selectedCardKode, setSelectedCardKode] = useState<string>('');
  const [activeHistoryTab, setActiveHistoryTab] = useState<
    'MUTASI_KOMODITAS' | 'PENJUALAN' | 'PEMBELIAN'
  >('MUTASI_KOMODITAS');
  const [confirmVoidNo, setConfirmVoidNo] = useState<string | null>(null);
  const [voidLoading, setVoidLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string>('');
  const [editTxTarget, setEditTxTarget] = useState<{ id: string; jenis: string } | null>(null);

  useEffect(() => {
    if (activeStokList.length === 0) {
      setSelectedCardKode('');
      return;
    }
    if (!selectedCardKode || !activeStokList.some((h) => h.kode === selectedCardKode)) {
      const preferred =
        activeStokList.find((h) =>
          physicalPembelianList.some(
            (p) =>
              p.komoditasKode === h.kode ||
              p.komoditasNama.toUpperCase().trim() === h.nama.toUpperCase().trim()
          )
        ) ||
        activeStokList.find((h) => (h.stok || 0) > 0) ||
        activeStokList[0];
      setSelectedCardKode(preferred.kode);
    }
  }, [activeStokList, selectedCardKode, physicalPembelianList]);

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
    const isBelumPutus =
      j.isBelumPutusHargaJual || j.metodePembayaran === 'BELUM_PUTUS_HARGA';
    const nilaiPengurang =
      Number(j.nilaiModalPengurangStok) ||
      Math.round((Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0));
    const sudahCair = Number(j.nominalUangMasukTerkumpul) || 0;

    onPrintReceipt({
      title: isBelumPutus
        ? 'NOTA MUAT / JUAL HASIL BUMI (BELUM PUTUS HARGA)'
        : 'NOTA PENJUALAN HASIL BUMI',
      subtitle: `Pengiriman Stok Fisik Keluar Gudang${j.divisi ? ` | Divisi: ${j.divisi}` : ''}`,
      nomorTransaksi: j.noPenjualan,
      tanggal: j.tanggal,
      jam: j.jam,
      mitra: j.namaMitra,
      rekening: isBelumPutus
        ? sudahCair > 0
          ? `UANG MASUK (${formatRupiahSingkat(sudahCair)})`
          : 'MENUNGGU UANG MASUK'
        : `${j.metodePembayaran} (${j.rekeningTujuan})`,
      kategori: 'PENJUALAN_HASIL_BUMI',
      total: isBelumPutus ? (sudahCair > 0 ? sudahCair : nilaiPengurang) : j.totalNominal,
      items: [
        {
          nama: `MUAT ${j.namaMitra.toUpperCase()} — ${j.komoditasNama}${
            j.noSuratJalan ? ` [DO: ${j.noSuratJalan}]` : ''
          }`,
          qty: j.beratBersih,
          satuan: 'Kg',
          harga: isBelumPutus ? j.modalRataRataPerKg : j.hargaJualPerKg,
          subtotal: isBelumPutus ? nilaiPengurang : j.totalNominal,
        },
      ],
      detailRows: [
        { label: 'Berat Kotor Timbangan', value: `${j.beratKotor.toLocaleString('id-ID')} Kg` },
        { label: 'Potongan Rafaksi', value: `${j.potonganRafaksi}%` },
        {
          label: 'Berat Bersih Keluar',
          value: `${j.beratBersih.toLocaleString('id-ID')} Kg`,
          highlight: true,
        },
        { label: 'Stok Gudang Sebelum', value: `${j.stokGudangSebelum.toLocaleString('id-ID')} Kg` },
        { label: 'Sisa Ready di Gudang', value: `${j.stokGudangSetelah.toLocaleString('id-ID')} Kg` },
        ...(isBelumPutus
          ? [
              {
                label: 'Nilai Pengurang Stok (Rata2 Beli)',
                value: formatRupiah(nilaiPengurang),
              },
              {
                label: 'Realisasi Uang Masuk',
                value: sudahCair > 0 ? formatRupiah(sudahCair) : 'Rp 0 (Menunggu Uang Masuk)',
                isTotal: true,
              },
            ]
          : [{ label: 'Total Penjualan', value: formatRupiah(j.totalNominal), isTotal: true }]),
      ],
      catatan: j.keterangan,
    });
  };

  const scopedKomoditasRows = useMemo(() => {
    const items = ringkasan?.komoditasItems || [];
    if (kodeKomoditasFilter === 'ALL') return items;
    return items.filter((it) => it.kode === kodeKomoditasFilter);
  }, [ringkasan, kodeKomoditasFilter]);

  const selectedCardHb = useMemo(
    () => activeStokList.find((h) => h.kode === selectedCardKode) || activeStokList[0] || null,
    [activeStokList, selectedCardKode]
  );

  // Buku Mutasi Gudang per Komoditas (Format Gambar 2: Baris Petani -> JUMLAH Hijau -> MUAT Kuning -> SISA Biru -> SUSUT Merah)
  const bukuMutasiSelectedHb = useMemo((): BukuMutasiRow[] => {
    if (!selectedCardHb) return [];
    const targetKode = selectedCardHb.kode;
    const targetNamaUpper = selectedCardHb.nama.toUpperCase().trim();

    const purchases = physicalPembelianList.filter(
      (p) =>
        p.komoditasKode === targetKode ||
        p.komoditasNama.toUpperCase().trim() === targetNamaUpper
    );
    const sales = penjualanHasilBumiList.filter(
      (j) =>
        j.komoditasKode === targetKode ||
        j.komoditasNama.toUpperCase().trim() === targetNamaUpper
    );

    type CombinedEvent =
      | { type: 'BUY'; dateKey: number; createdAt: string; record: TransaksiPembelianHasilBumi }
      | { type: 'SELL'; dateKey: number; createdAt: string; record: TransaksiPenjualanHasilBumi };

    const events: CombinedEvent[] = [
      ...purchases.map((p) => ({
        type: 'BUY' as const,
        dateKey: parseTanggalSortKey(p.tanggal),
        createdAt: p.createdAt || '',
        record: p,
      })),
      ...sales.map((j) => ({
        type: 'SELL' as const,
        dateKey: parseTanggalSortKey(j.tanggal),
        createdAt: j.createdAt || '',
        record: j,
      })),
    ];

    events.sort((a, b) => {
      if (a.dateKey !== b.dateKey) return a.dateKey - b.dateKey;
      // Pada tanggal yang sama, pembelian petani umumnya masuk gudang sebelum truk MUAT berangkat
      if (a.type !== b.type) {
        const createdDayA = (a.createdAt || '').slice(0, 10);
        const createdDayB = (b.createdAt || '').slice(0, 10);
        if (createdDayA && createdDayA === createdDayB) {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return a.type === 'BUY' ? -1 : 1;
      }
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });

    const rows: BukuMutasiRow[] = [];
    let batchKg = 0;
    let batchRp = 0;
    let lastDateShownInBatch = '';
    let hasClosedAtLeastOneBatch = false;

    const stokAwalKg = Number(selectedCardHb.stokAwal) || 0;
    const rataModalAwal = Number(selectedCardHb.rataRataModalAwal) || 0;
    const modalAwalRp =
      Number(selectedCardHb.modalAwalTotal) || Math.round(stokAwalKg * rataModalAwal);

    if (stokAwalKg > 0) {
      rows.push({
        kind: 'PURCHASE',
        key: `STOK-AWAL-${selectedCardHb.kode}`,
        nama: 'STOK AWAL GUDANG',
        tanggalDisplay: formatTanggalIndo(selectedCardHb.updateTerakhir),
        tanggalAsli: formatTanggalIndo(selectedCardHb.updateTerakhir),
        beratKg: stokAwalKg,
        hargaPerKg: rataModalAwal,
        jumlahRp: modalAwalRp,
        showRpPrefix: false,
        isStokAwal: true,
      });
      batchKg = Math.round((batchKg + stokAwalKg) * 100) / 100;
      batchRp += modalAwalRp;
    }

    for (const ev of events) {
      if (ev.type === 'BUY') {
        const p = ev.record;
        const tgl = p.tanggal || '-';
        const tanggalDisplay = tgl === lastDateShownInBatch ? '' : tgl;
        lastDateShownInBatch = tgl;
        const berat = Number(p.beratBersih) || 0;
        const harga = Number(p.hargaPerKg) || 0;
        const jumlah = Number(p.totalNominal) || 0;
        const isBelumPutus = Boolean(p.isBelumPutusHarga || p.status === 'BELUM_PUTUS_HARGA');

        rows.push({
          kind: 'PURCHASE',
          key: `BUY-${p.noPembelian}`,
          nama: p.namaMitra,
          tanggalDisplay,
          tanggalAsli: tgl,
          beratKg: berat,
          hargaPerKg: harga,
          jumlahRp: jumlah,
          showRpPrefix: hasClosedAtLeastOneBatch,
          isBelumPutus,
          txPurchase: p,
        });

        batchKg = Math.round((batchKg + berat) * 100) / 100;
        batchRp += jumlah;
      } else {
        const j = ev.record;
        lastDateShownInBatch = '';

        const jumlahKg =
          batchKg > 0 ? batchKg : Math.max(0, Number(j.stokGudangSebelum) || 0);
        const exactAvgRate =
          jumlahKg > 0 && batchRp > 0
            ? batchRp / jumlahKg
            : Number(j.modalRataRataPerKg) || Number(j.hargaJualPerKg) || 0;
        const rataHargaPerKg = Math.round(exactAvgRate);
        const jumlahRp =
          batchKg > 0 ? Math.round(batchRp) : Math.round(jumlahKg * exactAvgRate);

        const muatKg = Number(j.beratBersih) || 0;
        const muatRp =
          exactAvgRate > 0
            ? Math.round(muatKg * exactAvgRate)
            : Number(j.nilaiModalPengurangStok) || Number(j.totalNominal) || 0;

        const diffKg = Math.round(Math.abs(jumlahKg - muatKg) * 100) / 100;
        const diffRp = Math.abs(jumlahRp - muatRp);

        const isClosedHabis = Boolean(
          j.isHabisMuatSusut ||
            muatKg >= jumlahKg ||
            (Number(j.stokGudangSetelah) === 0 && jumlahKg > 0)
        );
        const susutKg = isClosedHabis
          ? j.beratSusutKg !== undefined && Number(j.beratSusutKg) > 0
            ? Number(j.beratSusutKg)
            : diffKg
          : 0;

        const cleanBuyer = (j.namaMitra || '').trim();
        const cleanDo = (j.noSuratJalan || '').trim();
        const isGenericBuyer =
          !cleanBuyer ||
          cleanBuyer.toUpperCase() === 'PABRIK / PEMBELI UMUM' ||
          cleanBuyer.toUpperCase() === 'PETANI UMUM' ||
          cleanBuyer.toUpperCase() === 'UMUM';
        let muatLabel = 'MUAT';
        if (!isGenericBuyer && cleanDo) {
          muatLabel = cleanBuyer.toUpperCase().startsWith('MUAT')
            ? `${cleanBuyer.toUpperCase()} (${cleanDo.toUpperCase()})`
            : `MUAT ${cleanBuyer.toUpperCase()} (${cleanDo.toUpperCase()})`;
        } else if (cleanDo) {
          muatLabel = cleanDo.toUpperCase().startsWith('MUAT')
            ? cleanDo.toUpperCase()
            : `MUAT ${cleanDo.toUpperCase()}`;
        } else if (cleanBuyer) {
          muatLabel = cleanBuyer.toUpperCase().startsWith('MUAT')
            ? cleanBuyer.toUpperCase()
            : `MUAT ${cleanBuyer.toUpperCase()}`;
        }

        rows.push({ kind: 'SPACER', key: `SPC-${j.noPenjualan}` });
        rows.push({
          kind: 'JUMLAH',
          key: `JML-${j.noPenjualan}`,
          label: 'JUMLAH',
          beratKg: jumlahKg,
          rataHargaPerKg,
          jumlahRp,
        });
        rows.push({
          kind: 'MUAT',
          key: `MUAT-${j.noPenjualan}`,
          label: muatLabel,
          tanggalDisplay: j.tanggal || '-',
          beratKg: muatKg,
          jumlahRp: muatRp,
          txSale: j,
        });
        rows.push({
          kind: 'SISA',
          key: `SISA-${j.noPenjualan}`,
          beratKg: diffKg,
          jumlahRp: diffRp,
        });
        rows.push({
          kind: 'SUSUT',
          key: `SUSUT-${j.noPenjualan}`,
          beratKg: susutKg,
        });

        hasClosedAtLeastOneBatch = true;
        if (isClosedHabis) {
          batchKg = 0;
          batchRp = 0;
        } else {
          batchKg = diffKg;
          batchRp = Math.max(0, jumlahRp - muatRp);
        }
      }
    }

    if (batchKg > 0) {
      const avgOpen = batchKg > 0 && batchRp > 0 ? Math.round(batchRp / batchKg) : 0;
      rows.push({ kind: 'SPACER', key: 'SPC-OPEN-END' });
      rows.push({
        kind: 'JUMLAH',
        key: 'JML-OPEN-END',
        label: 'JUMLAH (STOK READY)',
        beratKg: batchKg,
        rataHargaPerKg: avgOpen,
        jumlahRp: Math.round(batchRp),
      });
    }

    return rows;
  }, [selectedCardHb, physicalPembelianList, penjualanHasilBumiList]);

  const handleSelectCardKomoditas = (kode: string) => {
    setSelectedCardKode(kode);
    setActiveHistoryTab('MUTASI_KOMODITAS');
    const el = document.getElementById('riwayat-mutasi-gudang-hb');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleOpenDeleteHbModal = (kode?: string) => {
    const target = kode || selectedCardKode || activeStokList[0]?.kode || '';
    setHapusHbKode(target);
    setActionError('');
    setShowHapusHbModal(true);
  };

  const handleConfirmDeleteHb = async () => {
    if (!hapusHbKode) return;
    setHapusHbLoading(true);
    setActionError('');
    try {
      const res = await api.deleteKomoditasHasilBumi(hapusHbKode);
      setShowHapusHbModal(false);
      setSuccessBanner(
        `Hasil Bumi "${res.deleted.nama} (${res.deleted.kode})" berhasil dihapus dari daftar aktif.`
      );
      if (kodeKomoditasFilter === hapusHbKode) {
        setKodeKomoditasFilter('ALL');
      }
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onRefresh();
      loadRingkasan();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal menghapus komoditas hasil bumi.');
    } finally {
      setHapusHbLoading(false);
    }
  };

  const handleExportBukuMutasiCsv = () => {
    if (!selectedCardHb) return;
    const csvRows: string[][] = [
      ['NAMA / KETERANGAN', 'TANGGAL', 'BERAT (KG)', 'HARGA / KG', 'JUMLAH (RP)'],
    ];
    for (const r of bukuMutasiSelectedHb) {
      if (r.kind === 'SPACER') {
        csvRows.push(['', '', '', '', '-']);
      } else if (r.kind === 'PURCHASE') {
        csvRows.push([
          r.nama,
          r.tanggalDisplay,
          String(r.beratKg),
          String(r.hargaPerKg),
          String(r.jumlahRp),
        ]);
      } else if (r.kind === 'JUMLAH') {
        csvRows.push([
          r.label,
          '',
          String(r.beratKg),
          String(r.rataHargaPerKg),
          String(r.jumlahRp),
        ]);
      } else if (r.kind === 'MUAT') {
        csvRows.push([r.label, r.tanggalDisplay, String(r.beratKg), '', String(r.jumlahRp)]);
      } else if (r.kind === 'SISA') {
        csvRows.push(['SISA', '', String(r.beratKg), '', String(r.jumlahRp)]);
      } else if (r.kind === 'SUSUT') {
        csvRows.push(['SUSUT', '', String(r.beratKg), '', '']);
      }
    }
    const content = csvRows
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mutasi_Gudang_${selectedCardHb.nama.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

          {activeStokList.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenDeleteHbModal()}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
              title="Hapus komoditas hasil bumi yang sudah tidak berjalan"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Hapus Hasil Bumi</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSelectedModalKode(selectedCardHb?.kode || undefined);
              setShowSaldoAwalModal(true);
            }}
            className="px-3.5 py-2 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-amber-700" />
            <span>Input / Edit Stok Awal Gudang</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInvoiceSjModal(true)}
            className="px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-xs rounded-lg transition-colors flex items-center space-x-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Invoice Surat Jalan</span>
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

      {successBanner && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-emerald-700 font-semibold hover:underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

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
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedModalKode(it.kode);
                            setShowSaldoAwalModal(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-600 text-amber-900 hover:text-white border border-amber-200 transition-colors cursor-pointer"
                          title={`Edit Stok Awal Gudang & Modal Awal untuk ${it.nama}`}
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Stok Awal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectCardKomoditas(it.kode)}
                          className="px-2 py-1 rounded-md text-[11px] font-semibold bg-zinc-100 hover:bg-zinc-900 text-zinc-800 hover:text-white transition-colors cursor-pointer"
                          title="Lihat Buku Mutasi Gudang komoditas ini"
                        >
                          Mutasi
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setJualInitialKode(it.kode);
                            setShowJualModal(true);
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-700 hover:bg-emerald-800 text-white transition-colors cursor-pointer"
                        >
                          Jual / Muat
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteHbModal(it.kode)}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Hapus Hasil Bumi ini jika sudah tidak berjalan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
      {/* KARTU PERSEDIAAN FISIK PER KOMODITAS (KLIK CARD UNTUK BUKA BUKU MUTASI)    */}
      {/* ========================================================================= */}
      <div className="space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="text-xs font-bold text-zinc-800">
            Pilih Salah Satu Card Hasil Bumi untuk Menampilkan Rincian Buku Mutasi Gudang di Bawah:
          </div>
          {selectedCardHb && (
            <div className="text-xs text-emerald-800 font-semibold">
              Aktif Ditampilkan: <strong>{selectedCardHb.nama}</strong> ({selectedCardHb.kode})
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeStokList.map((hb, idx) => {
            const isKopiTitip = hb.kode === 'HB-08' || hb.isBelumPutusHarga;
            const isSelectedCard =
              selectedCardHb?.kode === hb.kode && activeHistoryTab === 'MUTASI_KOMODITAS';

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
                onClick={() => handleSelectCardKomoditas(hb.kode)}
                className={`bg-white rounded-xl border p-4 space-y-2.5 flex flex-col justify-between min-w-0 overflow-hidden cursor-pointer transition-all ${
                  isSelectedCard
                    ? 'border-emerald-700 ring-2 ring-emerald-700/80 shadow-sm'
                    : isKopiTitip
                    ? 'border-amber-300 bg-amber-50/20 hover:border-amber-500'
                    : 'border-zinc-200 hover:border-emerald-500'
                }`}
              >
                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-bold text-zinc-600 truncate">
                      #{idx + 1} · {hb.kode}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isKopiTitip ? (
                        <span className="text-[10px] font-bold text-amber-800">TITIP PANEN</span>
                      ) : (
                        <Wheat className="w-4 h-4 text-amber-600" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDeleteHbModal(hb.kode);
                        }}
                        className="p-1 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title={`Hapus Hasil Bumi ${hb.nama} jika sudah tidak berjalan`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                          rataRataModalPerKg > 0
                            ? `${formatRupiah(rataRataModalPerKg)} / Kg`
                            : undefined
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
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedModalKode(hb.kode);
                      setShowSaldoAwalModal(true);
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-semibold cursor-pointer truncate transition-colors"
                    title={`Edit Stok Awal Gudang (${stokAwalKg.toLocaleString('id-ID')} Kg · ${formatTanggalIndo(hb.updateTerakhir)})`}
                  >
                    <Pencil className="w-3 h-3 shrink-0 text-amber-700" />
                    <span className="truncate">Edit Stok Awal ({stokAwalKg.toLocaleString('id-ID')} Kg)</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setJualInitialKode(hb.kode);
                      setShowJualModal(true);
                    }}
                    className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-semibold shrink-0 cursor-pointer transition-colors"
                  >
                    Jual / Muat
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIWAYAT MUTASI GUDANG HASIL BUMI (FORMAT SPREADSHEET BUKU MUTASI GAMBAR 2) */}
      {/* ========================================================================= */}
      <div
        id="riwayat-mutasi-gudang-hb"
        className="bg-white rounded-xl border border-zinc-200 overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-zinc-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <History className="w-4 h-4 text-zinc-700 shrink-0" />
            <h2 className="text-sm font-bold text-zinc-900">
              Riwayat Mutasi Gudang Hasil Bumi
            </h2>
            {activeHistoryTab === 'MUTASI_KOMODITAS' && activeStokList.length > 0 && (
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedCardHb?.kode || ''}
                  onChange={(e) => setSelectedCardKode(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50/70 text-xs font-bold text-emerald-950 focus:outline-none cursor-pointer"
                >
                  {activeStokList.map((hb) => (
                    <option key={hb.kode} value={hb.kode}>
                      {hb.kode} — {hb.nama} (Ready: {(hb.stok || 0).toLocaleString('id-ID')} {hb.satuan})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedCardHb) {
                      setSelectedModalKode(selectedCardHb.kode);
                      setShowSaldoAwalModal(true);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title="Edit Stok Awal Gudang & Modal Awal komoditas ini"
                >
                  <Pencil className="w-3 h-3 text-amber-700" />
                  <span>Edit Stok Awal</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportBukuMutasiCsv}
                  className="px-2.5 py-1 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                  title="Unduh Buku Mutasi Komoditas ini ke CSV / Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>
              </div>
            )}
          </div>

          <div className="inline-flex flex-wrap rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveHistoryTab('MUTASI_KOMODITAS')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeHistoryTab === 'MUTASI_KOMODITAS'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Buku Mutasi: {selectedCardHb?.nama || 'Pilih Card'}
            </button>
            <button
              type="button"
              onClick={() => setActiveHistoryTab('PENJUALAN')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeHistoryTab === 'PENJUALAN'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Semua Penjualan Keluar ({penjualanHasilBumiList.length})
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
              Semua Pembelian Masuk ({physicalPembelianList.length})
            </button>
          </div>
        </div>

        {activeHistoryTab === 'MUTASI_KOMODITAS' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-100 border-b border-zinc-400 text-zinc-800 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-3 text-left border-r border-zinc-400 min-w-[200px]">
                    Nama / Keterangan
                  </th>
                  <th className="py-2.5 px-3 text-right border-r border-zinc-400 w-32">
                    Tanggal
                  </th>
                  <th className="py-2.5 px-3 text-right border-r border-zinc-400 w-32">
                    Berat (Kg)
                  </th>
                  <th className="py-2.5 px-3 text-right border-r border-zinc-400 w-36">
                    Harga / Kg
                  </th>
                  <th className="py-2.5 px-3 text-right border-r border-zinc-400 w-44">
                    Jumlah (Rp)
                  </th>
                  <th className="py-2.5 px-3 text-center w-36">Aksi</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums text-zinc-950">
                {bukuMutasiSelectedHb.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center font-sans text-zinc-500 border-b border-zinc-200"
                    >
                      Belum ada mutasi pembelian masuk maupun muat keluar untuk{' '}
                      <strong className="text-zinc-800">
                        {selectedCardHb?.nama || 'Hasil Bumi ini'}
                      </strong>
                      .
                    </td>
                  </tr>
                ) : (
                  bukuMutasiSelectedHb.map((row) => {
                    if (row.kind === 'SPACER') {
                      return (
                        <tr key={row.key} className="bg-white border-b border-zinc-400 h-6">
                          <td className="border-r border-zinc-400" />
                          <td className="border-r border-zinc-400" />
                          <td className="border-r border-zinc-400" />
                          <td className="border-r border-zinc-400" />
                          <td className="py-1 px-3 text-right border-r border-zinc-400 text-zinc-500">
                            -
                          </td>
                          <td />
                        </tr>
                      );
                    }

                    if (row.kind === 'PURCHASE') {
                      return (
                        <tr
                          key={row.key}
                          className="bg-white hover:bg-zinc-50 border-b border-zinc-300"
                        >
                          <td
                            className={`py-1.5 px-3 font-sans font-medium text-zinc-950 border-r border-zinc-400 ${
                              row.showRpPrefix ? 'text-center uppercase' : 'text-left'
                            }`}
                          >
                            {row.nama}
                          </td>
                          <td className="py-1.5 px-3 text-right border-r border-zinc-400 text-zinc-900 whitespace-nowrap">
                            {row.tanggalDisplay}
                          </td>
                          <td className="py-1.5 px-3 text-right border-r border-zinc-400 text-zinc-950">
                            {formatKgBukuMutasi(row.beratKg)}
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-400 text-zinc-950 whitespace-nowrap">
                            {row.isBelumPutus && row.hargaPerKg === 0 ? (
                              <span className="block text-right text-amber-800 font-sans text-[11px] font-semibold">
                                Titip
                              </span>
                            ) : row.showRpPrefix ? (
                              <div className="flex items-center justify-between gap-2">
                                <span>Rp</span>
                                <span>{formatAngkaBukuMutasi(row.hargaPerKg)}</span>
                              </div>
                            ) : (
                              <div className="text-right">
                                {formatAngkaBukuMutasi(row.hargaPerKg)}
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-400 text-zinc-950 whitespace-nowrap">
                            {row.isBelumPutus && row.jumlahRp === 0 ? (
                              <span className="block text-right text-amber-800 font-sans text-[11px]">
                                Belum Putus
                              </span>
                            ) : row.showRpPrefix ? (
                              <div className="flex items-center justify-between gap-2">
                                <span>Rp</span>
                                <span>{formatAngkaBukuMutasi(row.jumlahRp)}</span>
                              </div>
                            ) : (
                              <div className="text-right">
                                {formatAngkaBukuMutasi(row.jumlahRp)}
                              </div>
                            )}
                          </td>
                          <td className="py-1 px-2 text-center font-sans whitespace-nowrap">
                            {row.isStokAwal && selectedCardHb ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedModalKode(selectedCardHb.kode);
                                  setShowSaldoAwalModal(true);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-700 text-amber-900 hover:text-white border border-amber-300 text-[10px] font-semibold cursor-pointer transition-colors"
                                title={`Edit Stok Awal Gudang ${selectedCardHb.nama}`}
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>Edit Stok Awal</span>
                              </button>
                            ) : row.txPurchase ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditTxTarget({
                                    id: row.txPurchase!.noPembelian,
                                    jenis: 'PEMBELIAN_HASIL_BUMI',
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer"
                                title={`Edit Nota ${row.txPurchase.noPembelian} (${row.tanggalAsli})`}
                              >
                                <Pencil className="w-2.5 h-2.5" />
                                <span>Edit</span>
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === 'JUMLAH') {
                      return (
                        <tr
                          key={row.key}
                          className="bg-[#6AA84F] text-zinc-950 font-bold border-b border-zinc-700"
                        >
                          <td className="py-1.5 px-3 font-sans font-bold text-center border-r border-zinc-700">
                            {row.label}
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-700" />
                          <td className="py-1.5 px-3 text-right border-r border-zinc-700">
                            {formatKgBukuMutasi(row.beratKg)}
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-700 whitespace-nowrap">
                            <div className="flex items-center justify-between gap-2">
                              <span>Rp</span>
                              <span>{formatAngkaBukuMutasi(row.rataHargaPerKg)}</span>
                            </div>
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-700 whitespace-nowrap">
                            <div className="flex items-center justify-between gap-2">
                              <span>Rp</span>
                              <span>{formatAngkaBukuMutasi(row.jumlahRp)}</span>
                            </div>
                          </td>
                          <td className="bg-white border-b border-zinc-200" />
                        </tr>
                      );
                    }

                    if (row.kind === 'MUAT') {
                      const j = row.txSale;
                      const isBelumPutus =
                        j.isBelumPutusHargaJual || j.metodePembayaran === 'BELUM_PUTUS_HARGA';
                      const sudahLunasUangMasuk = j.statusUangMasuk === 'LUNAS';

                      return (
                        <tr
                          key={row.key}
                          className="bg-[#FFFF00] text-zinc-950 font-bold border-b border-zinc-700"
                        >
                          <td className="py-1.5 px-3 font-sans font-bold text-center border-r border-zinc-700">
                            {row.label}
                          </td>
                          <td className="py-1.5 px-3 text-right border-r border-zinc-700 whitespace-nowrap">
                            {row.tanggalDisplay}
                          </td>
                          <td className="py-1.5 px-3 text-right border-r border-zinc-700">
                            {formatKgBukuMutasi(row.beratKg)}
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-700" />
                          <td className="py-1.5 px-3 border-r border-zinc-700 whitespace-nowrap">
                            <div className="flex items-center justify-between gap-2">
                              <span>Rp</span>
                              <span>{formatAngkaBukuMutasi(row.jumlahRp)}</span>
                            </div>
                          </td>
                          <td className="py-1 px-2 text-center font-sans bg-white border-b border-zinc-200 whitespace-nowrap">
                            {confirmVoidNo === j.noPenjualan ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={voidLoading}
                                  onClick={() => handleVoidPenjualan(j.noPenjualan)}
                                  className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                                >
                                  {voidLoading ? '...' : 'Ya'}
                                </button>
                                <button
                                  type="button"
                                  disabled={voidLoading}
                                  onClick={() => setConfirmVoidNo(null)}
                                  className="px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 text-[10px] font-bold cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                {isBelumPutus && !sudahLunasUangMasuk && onInputUangMasuk && (
                                  <button
                                    type="button"
                                    onClick={() => onInputUangMasuk(j.noPenjualan)}
                                    className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-bold cursor-pointer"
                                    title="Input Uang Masuk hasil penjualan muat ini"
                                  >
                                    + Uang Masuk
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditTxTarget({
                                      id: j.noPenjualan,
                                      jenis: 'PENJUALAN_HASIL_BUMI',
                                    })
                                  }
                                  className="p-1 rounded hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                                  title="Edit Muat / Jual"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                {onPrintReceipt && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReceipt(j)}
                                    className="p-1 rounded hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                                    title="Cetak Nota Muat"
                                  >
                                    <Printer className="w-3 h-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setConfirmVoidNo(j.noPenjualan)}
                                  className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
                                  title="Batalkan Muat"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === 'SISA') {
                      return (
                        <tr
                          key={row.key}
                          className="bg-[#00B0F0] text-zinc-950 font-bold border-b border-zinc-700"
                        >
                          <td className="py-1.5 px-3 font-sans font-bold text-center border-r border-zinc-700">
                            SISA
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-700" />
                          <td className="py-1.5 px-3 text-right border-r border-zinc-700">
                            {formatKgBukuMutasi(row.beratKg)}
                          </td>
                          <td className="py-1.5 px-3 border-r border-zinc-700" />
                          <td className="py-1.5 px-3 border-r border-zinc-700 whitespace-nowrap">
                            <div className="flex items-center justify-between gap-2">
                              <span>Rp</span>
                              <span>{formatAngkaBukuMutasi(row.jumlahRp)}</span>
                            </div>
                          </td>
                          <td className="bg-white border-b border-zinc-200" />
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={row.key}
                        className="bg-[#FF0000] text-zinc-950 font-bold border-b border-zinc-700"
                      >
                        <td className="py-1.5 px-3 font-sans font-bold text-center border-r border-zinc-700">
                          SUSUT
                        </td>
                        <td className="py-1.5 px-3 border-r border-zinc-700" />
                        <td className="py-1.5 px-3 text-right border-r border-zinc-700">
                          {formatKgBukuMutasi(row.beratKg)}
                        </td>
                        <td className="py-1.5 px-3 border-r border-zinc-700" />
                        <td className="py-1.5 px-3 border-r border-zinc-700" />
                        <td className="bg-white border-b border-zinc-200" />
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : activeHistoryTab === 'PENJUALAN' ? (
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
                  penjualanHasilBumiList.slice(0, 60).map((j) => {
                    const isBelumPutus =
                      j.isBelumPutusHargaJual || j.metodePembayaran === 'BELUM_PUTUS_HARGA';
                    const nilaiPengurangStok =
                      Number(j.nilaiModalPengurangStok) ||
                      Math.round((Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0));
                    const uangMasukCair = Number(j.nominalUangMasukTerkumpul) || 0;
                    const sudahLunasUangMasuk = j.statusUangMasuk === 'LUNAS';

                    return (
                      <tr key={j.noPenjualan} className="hover:bg-zinc-50/80">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-zinc-900">{j.noPenjualan}</div>
                          {j.noSuratJalan && (
                            <div className="text-[10px] font-mono text-zinc-500">
                              DO: {j.noSuratJalan}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-600 whitespace-nowrap font-mono tabular-nums">
                          {j.tanggal} <span className="text-[10px] text-zinc-400">{j.jam}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-zinc-800">
                          {isBelumPutus ? `MUAT ${j.namaMitra.toUpperCase()}` : j.namaMitra}
                        </td>
                        <td className="py-3 px-4 font-bold text-zinc-900">{j.komoditasNama}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <div className="font-bold text-sky-800">
                            Awal: -{j.beratBersih.toLocaleString('id-ID')} Kg
                          </div>
                          {Number((j as any).tonaseAkhir) > 0 && (
                            <div className="text-[10px] text-emerald-800 font-semibold">
                              Akhir: {Number((j as any).tonaseAkhir).toLocaleString('id-ID')} Kg
                            </div>
                          )}
                          {Number((j as any).susutPerjalananKg) !== 0 &&
                            !Number.isNaN(Number((j as any).susutPerjalananKg)) && (
                              <div className="text-[10px] text-amber-700 font-semibold">
                                Susut: {Number((j as any).susutPerjalananKg).toLocaleString('id-ID')} Kg
                              </div>
                            )}
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
                          {isBelumPutus && uangMasukCair <= 0 ? (
                            <span className="text-sky-800 font-semibold">
                              Rata2: {formatRupiahSingkat(j.modalRataRataPerKg)}
                            </span>
                          ) : (
                            formatRupiahSingkat(j.hargaJualPerKg)
                          )}
                        </td>
                        <td
                          className="py-3 px-4 text-right font-mono tabular-nums font-bold text-zinc-900"
                          title={
                            isBelumPutus
                              ? `Pengurang Stok: ${formatRupiah(nilaiPengurangStok)} | Uang Masuk: ${formatRupiah(uangMasukCair)}`
                              : formatRupiah(j.totalNominal)
                          }
                        >
                          {isBelumPutus ? (
                            <div>
                              <div className="text-zinc-900">
                                {uangMasukCair > 0
                                  ? formatRupiahSingkat(uangMasukCair)
                                  : 'Rp 0 (Menunggu)'}
                              </div>
                              <div className="text-[10px] font-normal text-zinc-500">
                                Stok: -{formatRupiahSingkat(nilaiPengurangStok)}
                              </div>
                            </div>
                          ) : (
                            formatRupiahSingkat(j.totalNominal)
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono tabular-nums font-semibold ${
                            isBelumPutus && uangMasukCair <= 0
                              ? 'text-zinc-400'
                              : j.labaKotor >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                          title={formatRupiah(j.labaKotor)}
                        >
                          {isBelumPutus && uangMasukCair <= 0 ? (
                            'Belum Putus'
                          ) : (
                            <>
                              {j.labaKotor >= 0 ? '+' : ''}
                              {formatRupiahSingkat(j.labaKotor)}
                            </>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {isBelumPutus ? (
                            <div className="space-y-0.5">
                              <div
                                className={`text-[10px] font-bold ${
                                  sudahLunasUangMasuk ? 'text-emerald-800' : 'text-amber-800'
                                }`}
                              >
                                {sudahLunasUangMasuk
                                  ? 'SUDAH CAIR (UANG MASUK)'
                                  : uangMasukCair > 0
                                  ? 'CAIR SEBAGIAN'
                                  : 'MENUNGGU UANG MASUK'}
                              </div>
                              {j.divisi && (
                                <div className="text-[10px] text-sky-800 font-semibold">
                                  {j.divisi}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <span
                                className={`text-[10px] font-bold ${
                                  j.statusPembayaran === 'LUNAS'
                                    ? 'text-emerald-800'
                                    : 'text-amber-800'
                                }`}
                              >
                                {j.metodePembayaran} ({j.rekeningTujuan})
                              </span>
                              {j.divisi && (
                                <div className="text-[10px] text-sky-800 font-semibold mt-0.5">
                                  {j.divisi}
                                </div>
                              )}
                            </>
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
                              {isBelumPutus && !sudahLunasUangMasuk && onInputUangMasuk && (
                                <button
                                  type="button"
                                  onClick={() => onInputUangMasuk(j.noPenjualan)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-semibold cursor-pointer transition-colors"
                                  title="Input pencairan uang hasil penjualan nota ini di menu Uang Masuk"
                                >
                                  <ArrowDownLeft className="w-3 h-3" />
                                  <span>+ Uang Masuk</span>
                                </button>
                              )}
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
                    );
                  })
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
        onDeleted={() => {
          onRefresh();
          loadRingkasan();
        }}
      />

      {/* Modal Invoice Surat Jalan Penjualan (Titip Jual Supplier) */}
      <ModalInvoiceSuratJalan
        open={showInvoiceSjModal}
        onClose={() => setShowInvoiceSjModal(false)}
        stokHasilBumiList={stokList}
        rekeningList={rekeningList}
        onSuccess={() => {
          setSuccessBanner('Invoice Surat Jalan berhasil disimpan & arus kas diperbarui.');
          onRefresh();
          loadRingkasan();
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

      {/* Modal Hapus Hasil Bumi yang Sudah Tidak Berjalan */}
      {showHapusHbModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full border border-zinc-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-rose-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <h3 className="text-sm font-bold">Hapus Barang Hasil Bumi</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHapusHbModal(false)}
                disabled={hapusHbLoading}
                className="text-rose-200 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-zinc-600 leading-relaxed">
                Pilih komoditas hasil bumi yang sudah tidak berjalan untuk dihapus dari menu Stok &amp; Jual Hasil Bumi. Histori transaksi pembelian/penjualan masa lalu tetap aman di pembukuan.
              </p>

              <div>
                <label className="block font-bold text-zinc-800 mb-1">
                  Pilih Komoditas Hasil Bumi
                </label>
                <select
                  value={hapusHbKode}
                  onChange={(e) => setHapusHbKode(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg bg-white font-semibold text-zinc-900"
                >
                  {activeStokList.map((hb) => (
                    <option key={hb.kode} value={hb.kode}>
                      {hb.kode} — {hb.nama} (Ready: {(hb.stok || 0).toLocaleString('id-ID')} {hb.satuan})
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const targetHb = activeStokList.find((h) => h.kode === hapusHbKode);
                if (!targetHb || (targetHb.stok || 0) <= 0) return null;
                return (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-950">
                    <strong>Perhatian:</strong> Komoditas <strong>{targetHb.nama}</strong> saat ini masih tercatat memiliki stok{' '}
                    <strong className="font-mono">
                      {targetHb.stok.toLocaleString('id-ID')} {targetHb.satuan}
                    </strong>{' '}
                    di gudang. Pastikan stok fisik memang sudah selesai sebelum menghapus master komoditas.
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowHapusHbModal(false)}
                  disabled={hapusHbLoading}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteHb}
                  disabled={hapusHbLoading || !hapusHbKode}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white rounded-lg font-bold cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{hapusHbLoading ? 'Menghapus...' : 'Ya, Hapus Hasil Bumi'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
