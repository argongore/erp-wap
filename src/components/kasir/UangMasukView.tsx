import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  Printer,
  Trash2,
  Search,
  Wheat,
  Wallet,
  Building2,
  Truck,
  Pencil,
} from 'lucide-react';
import {
  Mitra,
  Rekening,
  TransaksiPenjualanHasilBumi,
  TransaksiUangMasuk,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import {
  formatRupiah,
  formatRupiahSingkat,
  parseRupiahInput,
} from '../../utils/format.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import {
  ArusKasDivisiSelectorCard,
  DoubleCheckVerifikasiPanel,
  isRealTransferBankAccount,
  useDivisiOptions,
} from '../common/DoubleCheckVerifikasiPanel.tsx';

interface Props {
  rekeningList: Rekening[];
  mitraList: Mitra[];
  penjualanHasilBumiList: TransaksiPenjualanHasilBumi[];
  uangMasukList: TransaksiUangMasuk[];
  initialNoPenjualanHb?: string;
  onClearInitialNoPenjualanHb?: () => void;
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
  onNavigateToStokHb?: () => void;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayIndoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

function formatKgSpreadsheet(val: number): string {
  return (Number(val) || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

const KATEGORI_UMUM_PRESETS = [
  'Pendapatan Operasional Lainnya',
  'Komisi / Jasa Timbang & Angkut',
  'Pengembalian Dana / Refund Operasional',
  'Tambahan Modal Kas Masuk',
];

export const UangMasukView: React.FC<Props> = ({
  rekeningList,
  mitraList,
  penjualanHasilBumiList,
  uangMasukList,
  initialNoPenjualanHb,
  onClearInitialNoPenjualanHb,
  onSuccess,
  onRefresh,
  onNavigateToStokHb,
}) => {
  const divisiOptions = useDivisiOptions();
  const bankAccounts = useMemo(
    () => rekeningList.filter(isRealTransferBankAccount),
    [rekeningList]
  );
  const activeMitra = useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );

  // Daftar Nota Muat / Jual HB yang relevan untuk Uang Masuk
  const pendingHbSales = useMemo(
    () =>
      penjualanHasilBumiList.filter(
        (j) =>
          (j.isBelumPutusHargaJual ||
            j.metodePembayaran === 'BELUM_PUTUS_HARGA' ||
            j.statusPembayaran === 'MENUNGGU_UANG_MASUK') &&
          j.statusUangMasuk !== 'LUNAS'
      ),
    [penjualanHasilBumiList]
  );

  const [jenisSumber, setJenisSumber] = useState<'PENJUALAN_HASIL_BUMI' | 'UMUM'>(
    'PENJUALAN_HASIL_BUMI'
  );
  const [showAllHbOptions, setShowAllHbOptions] = useState<boolean>(false);
  const [noPenjualanHb, setNoPenjualanHb] = useState<string>('');
  const [tandaiLunasHb, setTandaiLunasHb] = useState<boolean>(true);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  const [tanggal, setTanggal] = useState<string>(getTodayIsoDate());
  const [nominalDisplay, setNominalDisplay] = useState<string>('');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'SINKRON'>(
    bankAccounts.length > 0 ? 'TRANSFER' : 'TUNAI'
  );
  const [rekeningTujuan, setRekeningTujuan] = useState<string>(bankAccounts[0]?.kode || '');
  const [modePengirim, setModePengirim] = useState<'MANUAL' | 'MITRA'>('MANUAL');
  const [idMitra, setIdMitra] = useState<string>(activeMitra[0]?.id || '');
  const [namaPengirim, setNamaPengirim] = useState<string>('');
  const [kategori, setKategori] = useState<string>('Penjualan Hasil Bumi');
  const [divisi, setDivisi] = useState<string>('PT Wijaya Agro Perkasa');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoBukti, setFotoBukti] = useState<string>('');

  const [stepVerifikasi, setStepVerifikasi] = useState<boolean>(false);
  const [verifiedDoubleCheck, setVerifiedDoubleCheck] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string>('');

  // History filter & void state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterSumber, setFilterSumber] = useState<'ALL' | 'PENJUALAN_HASIL_BUMI' | 'UMUM'>('ALL');
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [voidLoading, setVoidLoading] = useState<boolean>(false);

  const selectableHbList = useMemo(() => {
    if (showAllHbOptions) return penjualanHasilBumiList;
    if (pendingHbSales.length > 0) return pendingHbSales;
    return penjualanHasilBumiList.filter(
      (j) => j.isBelumPutusHargaJual || j.metodePembayaran === 'BELUM_PUTUS_HARGA'
    );
  }, [showAllHbOptions, pendingHbSales, penjualanHasilBumiList]);

  // Preselect initial nota HB when navigated from Stok Hasil Bumi
  useEffect(() => {
    if (initialNoPenjualanHb) {
      const found = penjualanHasilBumiList.find((j) => j.noPenjualan === initialNoPenjualanHb);
      if (found) {
        setJenisSumber('PENJUALAN_HASIL_BUMI');
        setNoPenjualanHb(found.noPenjualan);
        if (!pendingHbSales.some((p) => p.noPenjualan === found.noPenjualan)) {
          setShowAllHbOptions(true);
        }
      }
      onClearInitialNoPenjualanHb?.();
    }
  }, [initialNoPenjualanHb, penjualanHasilBumiList, pendingHbSales, onClearInitialNoPenjualanHb]);

  // Default select first pending HB sale when switching to PENJUALAN_HASIL_BUMI
  useEffect(() => {
    if (jenisSumber === 'PENJUALAN_HASIL_BUMI' && !noPenjualanHb && selectableHbList.length > 0) {
      setNoPenjualanHb(selectableHbList[0].noPenjualan);
    }
  }, [jenisSumber, noPenjualanHb, selectableHbList]);

  const selectedHb = useMemo(
    () => penjualanHasilBumiList.find((j) => j.noPenjualan === noPenjualanHb),
    [penjualanHasilBumiList, noPenjualanHb]
  );

  // Sync pengirim & divisi when selectedHb changes
  useEffect(() => {
    if (jenisSumber === 'PENJUALAN_HASIL_BUMI' && selectedHb) {
      setKategori(`Penjualan Hasil Bumi (${selectedHb.komoditasNama})`);
      if (selectedHb.divisi) {
        setDivisi(selectedHb.divisi);
      }
      if (selectedHb.idMitra && selectedHb.idMitra !== 'UMUM') {
        setModePengirim('MITRA');
        setIdMitra(selectedHb.idMitra);
        setNamaPengirim(selectedHb.namaMitra);
      } else {
        setModePengirim('MANUAL');
        setNamaPengirim(selectedHb.namaMitra || '');
      }
    } else if (jenisSumber === 'UMUM') {
      if (kategori.startsWith('Penjualan Hasil Bumi')) {
        setKategori(KATEGORI_UMUM_PRESETS[0]);
      }
    }
  }, [jenisSumber, selectedHb]);

  const nominal = parseRupiahInput(nominalDisplay);

  // Kalkulasi perbandingan terhadap Nota Muat Hasil Bumi
  const hbCalc = useMemo(() => {
    if (!selectedHb) return null;
    const modalPengurangStok =
      Number(selectedHb.nilaiModalPengurangStok) ||
      Math.round((Number(selectedHb.beratBersih) || 0) * (Number(selectedHb.modalRataRataPerKg) || 0));
    const sudahTerkumpul = Number(selectedHb.nominalUangMasukTerkumpul) || 0;
    const totalSetelahInput = sudahTerkumpul + nominal;
    const selisihLabaRiil = totalSetelahInput - modalPengurangStok;
    const hargaRealisasiPerKg =
      selectedHb.beratBersih > 0 ? Math.round(totalSetelahInput / selectedHb.beratBersih) : 0;
    const stokAwalSaatMuat = Number(selectedHb.stokGudangSebelum) || 0;
    const sisaStokSaatMuat =
      (Number(selectedHb.selisihTimbangMuatKg) || 0) > 0
        ? Number(selectedHb.selisihTimbangMuatKg)
        : Number(selectedHb.stokGudangSetelah) || 0;

    return {
      modalPengurangStok,
      sudahTerkumpul,
      totalSetelahInput,
      selisihLabaRiil,
      hargaRealisasiPerKg,
      stokAwalSaatMuat,
      sisaStokSaatMuat,
      isLebihTimbang: (Number(selectedHb.selisihTimbangMuatKg) || 0) > 0,
    };
  }, [selectedHb, nominal]);

  // KPI Ringkasan
  const kpi = useMemo(() => {
    const todayIso = getTodayIsoDate();
    const todayIndo = getTodayIndoDate();
    const hariIniItems = uangMasukList.filter(
      (u) => u.tanggal === todayIndo || u.tanggal === todayIso
    );
    const totalHariIni = hariIniItems.reduce((s, u) => s + (Number(u.nominal) || 0), 0);
    const totalDariHb = uangMasukList
      .filter((u) => Boolean(u.noPenjualanHasilBumi))
      .reduce((s, u) => s + (Number(u.nominal) || 0), 0);
    const nilaiPendingHb = pendingHbSales.reduce(
      (s, j) =>
        s +
        (Number(j.nilaiModalPengurangStok) ||
          Math.round((Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0))),
      0
    );
    return {
      totalHariIni,
      countHariIni: hariIniItems.length,
      totalDariHb,
      pendingCount: pendingHbSales.length,
      nilaiPendingHb,
    };
  }, [uangMasukList, pendingHbSales]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return uangMasukList.filter((item) => {
      const isHb = Boolean(item.noPenjualanHasilBumi);
      if (filterSumber === 'PENJUALAN_HASIL_BUMI' && !isHb) return false;
      if (filterSumber === 'UMUM' && isHb) return false;
      if (!q) return true;
      const pengirimLabel = item.namaPengirim || item.pengirim || '';
      return (
        item.idTransaksi.toLowerCase().includes(q) ||
        pengirimLabel.toLowerCase().includes(q) ||
        (item.kategori || '').toLowerCase().includes(q) ||
        (item.noPenjualanHasilBumi || '').toLowerCase().includes(q) ||
        (item.komoditasNama || '').toLowerCase().includes(q) ||
        (item.keterangan || '').toLowerCase().includes(q)
      );
    });
  }, [uangMasukList, filterSumber, searchQuery]);

  const pengirimFinalLabel = useMemo(() => {
    if (modePengirim === 'MITRA') {
      return activeMitra.find((m) => m.id === idMitra)?.nama || 'Mitra';
    }
    return namaPengirim.trim() || selectedHb?.namaMitra || 'Umum / Pembeli';
  }, [modePengirim, activeMitra, idMitra, namaPengirim, selectedHb]);

  const validateForm = (): boolean => {
    setErrorMsg('');
    if (nominal <= 0) {
      setErrorMsg('Masukkan nominal Uang Masuk lebih dari Rp 0.');
      return false;
    }
    if (jenisSumber === 'PENJUALAN_HASIL_BUMI' && !selectedHb) {
      setErrorMsg(
        'Pilih Nota Muat / Penjualan Hasil Bumi terlebih dahulu, atau ubah ke tab "Uang Masuk Umum".'
      );
      return false;
    }
    if (metode === 'TRANSFER' && !rekeningTujuan) {
      setErrorMsg('Pilih rekening bank tujuan penerimaan transfer.');
      return false;
    }
    return true;
  };

  const handleOpenVerifikasi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setVerifiedDoubleCheck(false);
    setStepVerifikasi(true);
  };

  const buildReceiptFromRecord = (rec: TransaksiUangMasuk): ReceiptData => {
    const pengirimStr = rec.namaPengirim || rec.pengirim || 'Umum';
    const beratKg = Number(rec.beratMuatKg) || 0;
    const isHb = Boolean(rec.noPenjualanHasilBumi);
    return {
      title: isHb
        ? 'BUKTI UANG MASUK — PENJUALAN HASIL BUMI'
        : 'BUKTI PENERIMAAN UANG MASUK',
      subtitle: `Kas Masuk Perusahaan | Divisi: ${rec.divisi}`,
      nomorTransaksi: rec.idTransaksi,
      tanggal: rec.tanggal,
      jam: rec.jam,
      mitra: pengirimStr,
      rekening: `${rec.metode} (${rec.rekeningTujuan})`,
      kategori: rec.kategori,
      total: rec.nominal,
      items: [
        {
          nama:
            isHb && rec.noPenjualanHasilBumi
              ? `Pencairan Nota ${rec.noPenjualanHasilBumi}${
                  rec.komoditasNama ? ` — ${rec.komoditasNama}` : ''
                }`
              : rec.kategori,
          qty: beratKg > 0 ? beratKg : 1,
          satuan: beratKg > 0 ? 'Kg' : 'Transaksi',
          harga: beratKg > 0 ? Math.round(rec.nominal / beratKg) : rec.nominal,
          subtotal: rec.nominal,
        },
      ],
      detailRows: [
        { label: 'Divisi Terkait', value: rec.divisi },
        { label: 'Rekening Tujuan', value: `${rec.metode} (${rec.rekeningTujuan})` },
        { label: 'Pengirim / Pembayar', value: pengirimStr },
        ...(rec.noPenjualanHasilBumi
          ? [
              {
                label: 'Ref Nota Muat Hasil Bumi',
                value: `${rec.noPenjualanHasilBumi}${
                  beratKg > 0 ? ` (${beratKg.toLocaleString('id-ID')} Kg)` : ''
                }`,
                highlight: true,
              },
            ]
          : []),
        { label: 'Total Uang Masuk', value: formatRupiah(rec.nominal), isTotal: true },
      ],
      catatan: rec.keterangan,
    };
  };

  const handleFinalSubmit = async () => {
    if (!validateForm()) return;
    if (!verifiedDoubleCheck) {
      setErrorMsg('Harap centang konfirmasi verifikasi rekening & divisi terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const record = await api.processUangMasuk({
        tanggal,
        kategori: kategori.trim() || 'Uang Masuk',
        idMitra: modePengirim === 'MITRA' ? idMitra : undefined,
        namaPengirimManual: pengirimFinalLabel,
        noPenjualanHasilBumi:
          jenisSumber === 'PENJUALAN_HASIL_BUMI' ? noPenjualanHb : undefined,
        tandaiPutusLunas:
          jenisSumber === 'PENJUALAN_HASIL_BUMI' ? tandaiLunasHb : undefined,
        nominal,
        metode,
        rekeningTujuan:
          metode === 'SINKRON'
            ? 'SINKRON'
            : metode === 'TRANSFER'
            ? rekeningTujuan
            : 'KAS01',
        divisi,
        keterangan: keterangan.trim() || undefined,
        fotoBukti: fotoBukti || undefined,
      });

      const receipt = buildReceiptFromRecord(record);
      setNominalDisplay('');
      setKeterangan('');
      setFotoBukti('');
      setStepVerifikasi(false);
      setVerifiedDoubleCheck(false);
      setSuccessBanner(
        `Uang Masuk ${record.idTransaksi} sebesar ${formatRupiah(
          record.nominal
        )} berhasil disimpan ke ${record.rekeningTujuan}.`
      );
      onRefresh();
      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan transaksi uang masuk.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (idTransaksi: string) => {
    setVoidLoading(true);
    setErrorMsg('');
    try {
      await api.deleteUangMasuk(idTransaksi);
      setConfirmVoidId(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membatalkan transaksi uang masuk.');
    } finally {
      setVoidLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Kasir Uang Masuk (+) &amp; Pencairan Hasil Bumi
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Catat penerimaan uang hasil penjualan komoditas yang sebelumnya muat belum putus harga maupun kas masuk umum PT
          </p>
        </div>
        {onNavigateToStokHb && (
          <button
            type="button"
            onClick={onNavigateToStokHb}
            className="px-3.5 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold flex items-center space-x-1.5 cursor-pointer self-start sm:self-center"
          >
            <Truck className="w-4 h-4 text-emerald-700" />
            <span>Lihat Stok &amp; Nota Muat Hasil Bumi</span>
          </button>
        )}
      </div>

      {/* 3 Kartu KPI Ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Uang Masuk Hari Ini</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
          </div>
          <div
            className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-800 truncate"
            title={formatRupiah(kpi.totalHariIni)}
          >
            +{formatRupiahSingkat(kpi.totalHariIni)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
            {formatRupiah(kpi.totalHariIni)} · {kpi.countHariIni} transaksi
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Total Cair Penjualan HB</span>
            <Wheat className="w-4 h-4 text-sky-700" />
          </div>
          <div
            className="mt-1.5 text-xl font-bold font-mono tabular-nums text-zinc-900 truncate"
            title={formatRupiah(kpi.totalDariHb)}
          >
            {formatRupiahSingkat(kpi.totalDariHb)}
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
            Akumulasi realisasi nota muat HB
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <div className="flex items-center justify-between text-zinc-500 text-[11px] font-semibold uppercase tracking-wider">
            <span>Nota Muat Menunggu Cair</span>
            <Wallet className="w-4 h-4 text-amber-700" />
          </div>
          <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-amber-900 truncate">
            {kpi.pendingCount} Nota Muat
          </div>
          <div
            className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums truncate"
            title={formatRupiah(kpi.nilaiPendingHb)}
          >
            Nilai pengurang stok: {formatRupiahSingkat(kpi.nilaiPendingHb)}
          </div>
        </div>
      </div>

      {successBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-medium">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner('')}
            className="text-emerald-800 font-semibold hover:underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-rose-800 font-semibold hover:underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Form Input Uang Masuk */}
      <form
        onSubmit={handleOpenVerifikasi}
        className="bg-white rounded-2xl border border-zinc-200 p-5 sm:p-6 space-y-5 text-xs"
      >
        {/* Pilih Sumber Uang Masuk */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-zinc-800 uppercase tracking-wider">
            1. Pilih Sumber Penerimaan Uang Masuk
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setJenisSumber('PENJUALAN_HASIL_BUMI');
                setStepVerifikasi(false);
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                jenisSumber === 'PENJUALAN_HASIL_BUMI'
                  ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-600'
                  : 'bg-white border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-zinc-900 text-xs">
                  Pencairan Penjualan Hasil Bumi (Nota Muat / Jual)
                </span>
                <span className="font-mono text-[10px] font-bold text-emerald-800">
                  {pendingHbSales.length} MENUNGGU
                </span>
              </div>
              <p className="text-[11px] text-zinc-600 mt-1">
                Untuk hasil bumi yang sudah dimuat keluar gudang memakai harga rata-rata beli dan uang penjualannya baru cair sekarang.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setJenisSumber('UMUM');
                setStepVerifikasi(false);
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                jenisSumber === 'UMUM'
                  ? 'bg-emerald-50/80 border-emerald-600 ring-1 ring-emerald-600'
                  : 'bg-white border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-zinc-900 text-xs">
                  Uang Masuk Umum / Pendapatan Lainnya
                </span>
                <Building2 className="w-4 h-4 text-zinc-500" />
              </div>
              <p className="text-[11px] text-zinc-600 mt-1">
                Untuk kas masuk operasional di luar penjualan toko &amp; hasil bumi (jasa angkut, komisi, pengembalian dana, dll).
              </p>
            </button>
          </div>
        </div>

        {/* Panel Khusus Pencairan Nota Muat Hasil Bumi */}
        {jenisSumber === 'PENJUALAN_HASIL_BUMI' && (
          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-zinc-800">
                Pilih Nota Muat / Penjualan Hasil Bumi (JHB-...)
              </label>
              <label className="inline-flex items-center space-x-1.5 text-[11px] text-zinc-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllHbOptions}
                  onChange={(e) => setShowAllHbOptions(e.target.checked)}
                  className="rounded border-zinc-300 text-emerald-700"
                />
                <span>Tampilkan juga nota yang sudah lunas</span>
              </label>
            </div>

            {selectableHbList.length === 0 ? (
              <div className="p-4 rounded-lg bg-white border border-zinc-200 text-zinc-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span>
                  Belum ada Nota Muat Hasil Bumi berstatus <strong>Belum Putus Harga</strong>. Silakan buat nota muat terlebih dahulu di menu Stok Hasil Bumi atau pilih tab <strong>Uang Masuk Umum</strong>.
                </span>
                {onNavigateToStokHb && (
                  <button
                    type="button"
                    onClick={onNavigateToStokHb}
                    className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold shrink-0 cursor-pointer"
                  >
                    Buka Stok Hasil Bumi →
                  </button>
                )}
              </div>
            ) : (
              <>
                <select
                  value={noPenjualanHb}
                  onChange={(e) => {
                    setNoPenjualanHb(e.target.value);
                    setStepVerifikasi(false);
                  }}
                  className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-semibold focus:outline-none focus:border-emerald-600"
                >
                  {selectableHbList.map((j) => {
                    const modalStok =
                      Number(j.nilaiModalPengurangStok) ||
                      Math.round((Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0));
                    return (
                      <option key={j.noPenjualan} value={j.noPenjualan}>
                        {j.noPenjualan} · {j.tanggal} · MUAT {j.namaMitra.toUpperCase()} ·{' '}
                        {j.komoditasNama} ({j.beratBersih.toLocaleString('id-ID')} Kg · Modal:{' '}
                        {formatRupiah(modalStok)})
                      </option>
                    );
                  })}
                </select>

                {/* Tabel 3 Baris Referensi Nota Muat (STOK / MUAT / SISA STOK) + Simulasi Realisasi */}
                {selectedHb && hbCalc && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-zinc-300 overflow-hidden">
                      <table className="w-full text-xs border-collapse font-mono tabular-nums text-zinc-950">
                        <tbody>
                          <tr className="bg-[#92D050] border-b border-zinc-700/30 font-semibold">
                            <td className="py-1.5 px-3 font-sans font-bold border-r border-zinc-700/30">
                              STOK (SAAT MUAT)
                            </td>
                            <td className="py-1.5 px-3 text-right border-r border-zinc-700/30">
                              {formatKgSpreadsheet(hbCalc.stokAwalSaatMuat)}
                            </td>
                            <td className="py-1.5 px-3 text-right border-r border-zinc-700/30">
                              {formatRupiah(selectedHb.modalRataRataPerKg)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-bold border-r border-zinc-700/30">
                              {formatRupiah(
                                Math.round(hbCalc.stokAwalSaatMuat * selectedHb.modalRataRataPerKg)
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-center text-[10px] font-bold">
                              AWAL
                            </td>
                          </tr>
                          <tr className="bg-[#00B0F0] border-b border-zinc-700/30 font-bold">
                            <td className="py-1.5 px-3 font-sans font-extrabold border-r border-zinc-700/30">
                              MUAT {selectedHb.namaMitra.toUpperCase()}
                            </td>
                            <td className="py-1.5 px-3 text-right border-r border-zinc-700/30">
                              {formatKgSpreadsheet(selectedHb.beratBersih)}
                            </td>
                            <td className="py-1.5 px-3 text-right border-r border-zinc-700/30">
                              {formatRupiah(selectedHb.modalRataRataPerKg)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-extrabold border-r border-zinc-700/30">
                              {formatRupiah(hbCalc.modalPengurangStok)}
                            </td>
                            <td className="py-1.5 px-2.5 text-center font-extrabold bg-white">
                              JUAL
                            </td>
                          </tr>
                          <tr className="bg-[#FFFF00] font-bold">
                            <td className="py-1.5 px-3 font-sans font-bold border-r border-zinc-700/30">
                              SISA STOK {hbCalc.isLebihTimbang ? '(Lebih Timbang)' : ''}
                            </td>
                            <td className="py-1.5 px-3 text-right border-r border-zinc-700/30">
                              {formatKgSpreadsheet(hbCalc.sisaStokSaatMuat)}
                            </td>
                            <td className="py-1.5 px-3 text-right border-r border-zinc-700/30">
                              {formatRupiah(selectedHb.modalRataRataPerKg)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-extrabold border-r border-zinc-700/30">
                              {formatRupiah(
                                Math.round(hbCalc.sisaStokSaatMuat * selectedHb.modalRataRataPerKg)
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-center text-[10px] font-bold">
                              {hbCalc.isLebihTimbang ? 'SELISIH +' : 'SISA'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-lg border border-zinc-200">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">
                          Nilai Pengurang Stok
                        </span>
                        <span className="font-mono font-bold text-zinc-900">
                          {formatRupiah(hbCalc.modalPengurangStok)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">
                          Sudah Masuk Sebelumnya
                        </span>
                        <span className="font-mono font-bold text-sky-800">
                          {formatRupiah(hbCalc.sudahTerkumpul)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">
                          Harga Realisasi Setara / Kg
                        </span>
                        <span className="font-mono font-bold text-zinc-900">
                          {nominal > 0 ? `${formatRupiah(hbCalc.hargaRealisasiPerKg)}/Kg` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">
                          Selisih Laba / Rugi Riil
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            hbCalc.selisihLabaRiil >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {nominal > 0 || hbCalc.sudahTerkumpul > 0
                            ? `${hbCalc.selisihLabaRiil >= 0 ? '+' : ''}${formatRupiah(
                                hbCalc.selisihLabaRiil
                              )}`
                            : '-'}
                        </span>
                      </div>
                    </div>

                    <label className="inline-flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tandaiLunasHb}
                        onChange={(e) => setTandaiLunasHb(e.target.checked)}
                        className="rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                      />
                      <span className="text-xs font-semibold text-zinc-800">
                        Tandai Nota Muat {selectedHb.noPenjualan} ini sudah{' '}
                        <strong>LUNAS / Selesai Putus Harga</strong> (matikan centang jika baru menerima DP / cicilan)
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Detail Nominal, Tanggal & Rekening Penerimaan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-zinc-800">
                Nominal Uang Masuk (Rp)
              </label>
              {hbCalc && hbCalc.modalPengurangStok > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const sisaModal = Math.max(
                      0,
                      hbCalc.modalPengurangStok - hbCalc.sudahTerkumpul
                    );
                    if (sisaModal > 0) {
                      setNominalDisplay(sisaModal.toLocaleString('id-ID'));
                    }
                  }}
                  className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                >
                  Isi = Nilai Modal
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-zinc-400 font-mono font-bold">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Contoh: 168.500.000"
                value={nominalDisplay}
                onChange={(e) => {
                  const num = parseRupiahInput(e.target.value);
                  setNominalDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                  setStepVerifikasi(false);
                }}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-sm font-bold text-emerald-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1">
              Tanggal Penerimaan Uang
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-zinc-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1">
              Metode Uang Masuk
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMetode('TUNAI');
                  setStepVerifikasi(false);
                }}
                className={`py-2 px-3 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  metode === 'TUNAI'
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                Tunai (KAS01)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetode('TRANSFER');
                  setStepVerifikasi(false);
                }}
                className={`py-2 px-3 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  metode === 'TRANSFER'
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                }`}
              >
                Transfer Bank
              </button>
              <button
                type="button"
                onClick={() => {
                  setMetode('SINKRON');
                  setStepVerifikasi(false);
                }}
                className={`py-2 px-3 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  metode === 'SINKRON'
                    ? 'bg-cyan-700 text-white border-cyan-700'
                    : 'bg-cyan-50 text-cyan-900 border-cyan-300 hover:bg-cyan-100'
                }`}
              >
                Sinkron (Non-Kas)
              </button>
            </div>
          </div>
        </div>

        {metode === 'TRANSFER' && (
          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1">
              Pilih Rekening Bank PT Penerima Dana
            </label>
            <select
              value={rekeningTujuan}
              onChange={(e) => {
                setRekeningTujuan(e.target.value);
                setStepVerifikasi(false);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-semibold focus:outline-none focus:border-emerald-600"
            >
              {bankAccounts.map((rek) => (
                <option key={rek.kode} value={rek.kode}>
                  {rek.kode} — {rek.nama} (Saldo: {formatRupiahSingkat(rek.saldoSaatIni)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Pengirim, Kategori & Keterangan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-zinc-800">
                Pihak Pengirim / Pembayar
              </label>
              <div className="inline-flex rounded border border-zinc-200 bg-zinc-100 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => setModePengirim('MANUAL')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                    modePengirim === 'MANUAL' ? 'bg-white text-zinc-900' : 'text-zinc-600'
                  }`}
                >
                  Ketik Nama
                </button>
                <button
                  type="button"
                  onClick={() => setModePengirim('MITRA')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                    modePengirim === 'MITRA' ? 'bg-white text-zinc-900' : 'text-zinc-600'
                  }`}
                >
                  Mitra
                </button>
              </div>
            </div>
            {modePengirim === 'MANUAL' ? (
              <input
                type="text"
                placeholder="Contoh: ARYA / PT Pabrik Kopi..."
                value={namaPengirim}
                onChange={(e) => setNamaPengirim(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-medium focus:outline-none focus:border-emerald-600"
              />
            ) : (
              <select
                value={idMitra}
                onChange={(e) => setIdMitra(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-medium focus:outline-none focus:border-emerald-600"
              >
                {activeMitra.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.role})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1">
              Kategori Uang Masuk
            </label>
            <input
              type="text"
              list="kategori-uang-masuk-list"
              placeholder="Ketik / pilih kategori..."
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-medium focus:outline-none focus:border-emerald-600"
            />
            <datalist id="kategori-uang-masuk-list">
              <option value="Penjualan Hasil Bumi" />
              {KATEGORI_UMUM_PRESETS.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1">
              Catatan / Rincian Harga Putus (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Putus harga @ Rp 54.500/Kg bersih pabrik..."
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Divisi Selector */}
        <ArusKasDivisiSelectorCard
          direction="MASUK"
          metode={metode}
          nominal={nominal}
          divisi={divisi}
          divisiOptions={divisiOptions}
          onChangeDivisi={(d) => {
            setVerifiedDoubleCheck(false);
            setDivisi(d);
          }}
          rekeningList={rekeningList}
          theme="light"
        />

        {/* Upload Foto Bukti Transfer / Nota */}
        <ImageUploadZone
          label="Foto Bukti Transfer / Nota Putus Harga Pabrik (Opsional)"
          sublabel="Lampirkan foto bukti transfer bank atau slip timbangan pabrik"
          value={fotoBukti}
          onChange={setFotoBukti}
        />

        {/* Step Verifikasi */}
        {stepVerifikasi && (
          <DoubleCheckVerifikasiPanel
            direction="MASUK"
            metode={metode}
            nominal={nominal}
            rekeningList={rekeningList}
            selectedTransferKode={rekeningTujuan}
            onChangeTransferKode={setRekeningTujuan}
            divisi={divisi}
            divisiOptions={divisiOptions}
            onChangeDivisi={setDivisi}
            verified={verifiedDoubleCheck}
            onToggleVerified={setVerifiedDoubleCheck}
            theme="light"
          />
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-200">
          {stepVerifikasi ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStepVerifikasi(false);
                  setVerifiedDoubleCheck(false);
                }}
                disabled={submitting}
                className="px-4 py-2.5 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 cursor-pointer"
              >
                Cek Ulang Input
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting || !verifiedDoubleCheck}
                className="px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Menyimpan...' : 'Ya, Konfirmasi & Simpan Uang Masuk'}</span>
              </button>
            </>
          ) : (
            <button
              type="submit"
              disabled={submitting || nominal <= 0}
              className="px-5 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Lanjut Verifikasi Rekening &amp; Divisi →</span>
            </button>
          )}
        </div>
      </form>

      {/* Tabel Riwayat Uang Masuk */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Riwayat Transaksi Uang Masuk ({filteredHistory.length})
            </h2>
            <p className="text-[11px] text-zinc-500">
              Daftar seluruh pencairan penjualan hasil bumi dan uang masuk umum PT
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'PENJUALAN_HASIL_BUMI', label: 'Hasil Bumi' },
                  { id: 'UMUM', label: 'Umum' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterSumber(tab.id)}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    filterSumber === tab.id
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
              <input
                type="text"
                placeholder="Cari nota, pengirim..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">No Transaksi</th>
                <th className="py-3 px-4">Tanggal</th>
                <th className="py-3 px-4">Sumber &amp; Ref Nota HB</th>
                <th className="py-3 px-4">Pengirim / Pembayar</th>
                <th className="py-3 px-4">Divisi</th>
                <th className="py-3 px-4">Rekening Masuk</th>
                <th className="py-3 px-4 text-right">Nominal Masuk</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-400">
                    Belum ada catatan transaksi uang masuk pada filter ini.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => (
                  <tr key={item.idTransaksi} className="hover:bg-zinc-50/80">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                      {item.idTransaksi}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                      {item.tanggal} <span className="text-[10px] text-zinc-400">{item.jam}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900">{item.kategori}</div>
                      {item.noPenjualanHasilBumi && (
                        <div className="text-[11px] font-mono text-sky-800">
                          Ref: {item.noPenjualanHasilBumi}
                          {item.komoditasNama ? ` · ${item.komoditasNama}` : ''}
                          {item.beratMuatKg
                            ? ` (${item.beratMuatKg.toLocaleString('id-ID')} Kg)`
                            : ''}
                        </div>
                      )}
                      {item.keterangan && (
                        <div className="text-[11px] text-zinc-500 truncate max-w-xs">
                          {item.keterangan}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-semibold text-zinc-800">
                      {item.namaPengirim || item.pengirim || 'Umum'}
                    </td>
                    <td className="py-3 px-4 text-zinc-700">{item.divisi}</td>
                    <td className="py-3 px-4 font-mono text-zinc-700">
                      {item.metode} · {item.rekeningTujuan}
                    </td>
                    <td
                      className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-700 whitespace-nowrap"
                      title={formatRupiah(item.nominal)}
                    >
                      +{formatRupiah(item.nominal)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {confirmVoidId === item.idTransaksi ? (
                        <div className="inline-flex items-center space-x-1">
                          <button
                            type="button"
                            disabled={voidLoading}
                            onClick={() => handleVoid(item.idTransaksi)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-semibold cursor-pointer"
                          >
                            {voidLoading ? '...' : 'Ya, Batal'}
                          </button>
                          <button
                            type="button"
                            disabled={voidLoading}
                            onClick={() => setConfirmVoidId(null)}
                            className="px-2 py-1 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-[10px] font-semibold cursor-pointer"
                          >
                            Tidak
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center space-x-1.5">
                          <button
                            type="button"
                            onClick={() => setEditTxId(item.idTransaksi)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer transition-colors"
                            title="Edit nama pengirim, kategori, nominal, rekening, atau tanggal"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSuccess(buildReceiptFromRecord(item))}
                            className="p-1.5 rounded hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 cursor-pointer"
                            title="Cetak Bukti Uang Masuk"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVoidId(item.idTransaksi)}
                            className="p-1.5 rounded hover:bg-rose-50 text-zinc-400 hover:text-rose-600 cursor-pointer"
                            title="Batalkan Transaksi & Kembalikan Saldo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="UANG_MASUK"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
        }}
      />
    </div>
  );
};
