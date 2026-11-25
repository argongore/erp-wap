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
  Scale,
} from 'lucide-react';
import {
  Mitra,
  Rekening,
  TransaksiBrilink,
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
  brilinkList?: TransaksiBrilink[];
  initialNoPenjualanHb?: string;
  onClearInitialNoPenjualanHb?: () => void;
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
  onNavigateToStokHb?: () => void;
}

type UnifiedUangMasukItem = TransaksiUangMasuk & {
  isBrilinkAdmin?: boolean;
  nominalPokokBrilink?: number;
};

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
  brilinkList = [],
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
  const [editTxJenisHint, setEditTxJenisHint] = useState<string>('UANG_MASUK');

  const [tanggal, setTanggal] = useState<string>(getTodayIsoDate());
  const [tonaseAkhirStr, setTonaseAkhirStr] = useState<string>('');
  const [hargaPerKgDisplay, setHargaPerKgDisplay] = useState<string>('');
  const [nominalDisplay, setNominalDisplay] = useState<string>('');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'SINKRON' | 'PIUTANG'>(
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
  const [filterSumber, setFilterSumber] = useState<'ALL' | 'PENJUALAN_HASIL_BUMI' | 'UMUM' | 'BRILINK'>('ALL');
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

  // Pastikan noPenjualanHb selalu sinkron dengan daftar opsi yang sedang tampil di dropdown
  useEffect(() => {
    if (initialNoPenjualanHb) return;
    if (jenisSumber !== 'PENJUALAN_HASIL_BUMI') return;
    if (selectableHbList.length === 0) {
      if (noPenjualanHb) setNoPenjualanHb('');
      return;
    }
    const stillInList = selectableHbList.some((j) => j.noPenjualan === noPenjualanHb);
    if (!noPenjualanHb || !stillInList) {
      setNoPenjualanHb(selectableHbList[0].noPenjualan);
    }
  }, [initialNoPenjualanHb, jenisSumber, noPenjualanHb, selectableHbList]);

  const selectedHb = useMemo(() => {
    if (selectableHbList.length === 0) return null;
    return (
      selectableHbList.find((j) => j.noPenjualan === noPenjualanHb) || selectableHbList[0] || null
    );
  }, [selectableHbList, noPenjualanHb]);

  // Sync pengirim, divisi & tonase akhir when selectedHb changes
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
      setTonaseAkhirStr(
        selectedHb.tonaseAkhir && selectedHb.tonaseAkhir > 0
          ? String(selectedHb.tonaseAkhir)
          : ''
      );
      if (
        selectedHb.statusUangMasuk === 'SEBAGIAN' &&
        selectedHb.hargaJualPerKg > 0 &&
        selectedHb.hargaJualPerKg !== selectedHb.modalRataRataPerKg
      ) {
        setHargaPerKgDisplay(Math.round(selectedHb.hargaJualPerKg).toLocaleString('id-ID'));
      } else {
        setHargaPerKgDisplay('');
      }
      setNominalDisplay('');
    } else if (jenisSumber === 'UMUM') {
      if (kategori.startsWith('Penjualan Hasil Bumi')) {
        setKategori(KATEGORI_UMUM_PRESETS[0]);
      }
    }
  }, [jenisSumber, selectedHb?.noPenjualan]);

  const nominal = parseRupiahInput(nominalDisplay);
  const tonaseAkhirKg = Math.max(0, Math.round((parseFloat(tonaseAkhirStr) || 0) * 100) / 100);
  const hargaPerKg = parseRupiahInput(hargaPerKgDisplay);

  const handleTonaseAkhirChange = (rawVal: string) => {
    setTonaseAkhirStr(rawVal);
    setStepVerifikasi(false);
    const kg = Math.max(0, Math.round((parseFloat(rawVal) || 0) * 100) / 100);
    if (kg > 0 && hargaPerKg > 0) {
      const sudah = Number(selectedHb?.nominalUangMasukTerkumpul) || 0;
      const targetNom = Math.max(0, Math.round(kg * hargaPerKg) - sudah);
      setNominalDisplay(targetNom > 0 ? targetNom.toLocaleString('id-ID') : '');
    }
  };

  const handleHargaPerKgChange = (rawVal: string) => {
    const hrg = parseRupiahInput(rawVal);
    setHargaPerKgDisplay(hrg > 0 ? hrg.toLocaleString('id-ID') : '');
    setStepVerifikasi(false);
    const kg = tonaseAkhirKg > 0 ? tonaseAkhirKg : Number(selectedHb?.beratBersih) || 0;
    if (hrg > 0 && kg > 0) {
      const sudah = Number(selectedHb?.nominalUangMasukTerkumpul) || 0;
      const targetNom = Math.max(0, Math.round(kg * hrg) - sudah);
      setNominalDisplay(targetNom > 0 ? targetNom.toLocaleString('id-ID') : '');
    }
  };

  const handleNominalChange = (rawVal: string) => {
    const num = parseRupiahInput(rawVal);
    setNominalDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
    setStepVerifikasi(false);
    if (jenisSumber === 'PENJUALAN_HASIL_BUMI' && selectedHb) {
      const kg = tonaseAkhirKg > 0 ? tonaseAkhirKg : Number(selectedHb.beratBersih) || 0;
      const sudah = Number(selectedHb.nominalUangMasukTerkumpul) || 0;
      if (kg > 0 && num > 0) {
        const hrg = Math.round((sudah + num) / kg);
        setHargaPerKgDisplay(hrg > 0 ? hrg.toLocaleString('id-ID') : '');
      } else if (num === 0) {
        setHargaPerKgDisplay('');
      }
    }
  };

  // Kalkulasi perbandingan terhadap Nota Muat Hasil Bumi (menggunakan Tonase Akhir bila diisi)
  const hbCalc = useMemo(() => {
    if (!selectedHb) return null;
    const beratAwalMuat = Number(selectedHb.beratBersih) || 0;
    const modalPengurangStok =
      Number(selectedHb.nilaiModalPengurangStok) ||
      Math.round(beratAwalMuat * (Number(selectedHb.modalRataRataPerKg) || 0));
    const sudahTerkumpul = Number(selectedHb.nominalUangMasukTerkumpul) || 0;
    const totalSetelahInput = sudahTerkumpul + nominal;
    const selisihLabaRiil = totalSetelahInput - modalPengurangStok;
    const hasTonaseAkhir = tonaseAkhirKg > 0;
    const basisKgRealisasi = hasTonaseAkhir ? tonaseAkhirKg : beratAwalMuat;
    const susutKg =
      hasTonaseAkhir && beratAwalMuat > 0
        ? Math.round((beratAwalMuat - tonaseAkhirKg) * 100) / 100
        : null;
    const susutPersen =
      susutKg !== null && beratAwalMuat > 0
        ? Math.round((susutKg / beratAwalMuat) * 10000) / 100
        : null;
    const hargaRealisasiPerKg =
      basisKgRealisasi > 0 ? Math.round(totalSetelahInput / basisKgRealisasi) : 0;
    const totalNilaiDeal =
      hargaPerKg > 0 && basisKgRealisasi > 0 ? Math.round(basisKgRealisasi * hargaPerKg) : 0;
    const stokAwalSaatMuat = Number(selectedHb.stokGudangSebelum) || 0;
    const sisaStokSaatMuat =
      (Number(selectedHb.selisihTimbangMuatKg) || 0) > 0
        ? Number(selectedHb.selisihTimbangMuatKg)
        : Number(selectedHb.stokGudangSetelah) || 0;

    return {
      beratAwalMuat,
      hasTonaseAkhir,
      basisKgRealisasi,
      susutKg,
      susutPersen,
      totalNilaiDeal,
      modalPengurangStok,
      sudahTerkumpul,
      totalSetelahInput,
      selisihLabaRiil,
      hargaRealisasiPerKg,
      stokAwalSaatMuat,
      sisaStokSaatMuat,
      isLebihTimbang: (Number(selectedHb.selisihTimbangMuatKg) || 0) > 0,
    };
  }, [selectedHb, nominal, tonaseAkhirKg, hargaPerKg]);

  // Gabungkan Uang Masuk murni + Pendapatan Biaya Admin BRILink (Tunai KAS01 maupun Transfer BRI/Bank)
  const combinedUangMasukList = useMemo<UnifiedUangMasukItem[]>(() => {
    const brilinkAdminRows: UnifiedUangMasukItem[] = (brilinkList || [])
      .filter((b) => b.jenisBrilink === 'TARIK_TUNAI' && (Number(b.nominalAdmin) || 0) > 0)
      .map((b) => {
        const isCash = b.rekeningAdmin === 'KAS01';
        const rekTujuan = isCash ? 'KAS01' : b.rekeningAdmin || b.rekeningBank || 'BRI01';
        const pokokInfo =
          (Number(b.nominalPokok) || 0) > 0
            ? `Pokok Tarik Tunai ${formatRupiah(Number(b.nominalPokok) || 0)} · `
            : '';
        return {
          idTransaksi: b.idTransaksi,
          tanggal: b.tanggal,
          jam: b.jam,
          kategori: isCash
            ? 'Admin BRILink (Bayar Cash -> Kasir KAS01)'
            : `Admin BRILink (Ikut Transfer -> ${rekTujuan})`,
          idMitra: b.idMitra,
          namaPengirim: b.namaPelanggan || 'Pelanggan BRILink',
          pengirim: b.namaPelanggan || 'Pelanggan BRILink',
          nominal: Number(b.nominalAdmin) || 0,
          metode: isCash ? 'TUNAI' : 'TRANSFER',
          rekeningTujuan: rekTujuan,
          divisi: b.divisi || 'BRILink',
          keterangan: `${pokokInfo}${b.keterangan || ''}`.trim(),
          fotoBukti: b.fotoBukti,
          status: b.status || 'BERHASIL',
          createdAt: b.createdAt || '',
          isBrilinkAdmin: true,
          nominalPokokBrilink: Number(b.nominalPokok) || 0,
        };
      });

    const merged: UnifiedUangMasukItem[] = [...uangMasukList, ...brilinkAdminRows];
    merged.sort((a, b) => {
      const parseDmy = (d: string) => {
        const parts = (d || '').split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) return `${parts[0]}${parts[1].padStart(2, '0')}${parts[2].padStart(2, '0')}`;
          return `${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`;
        }
        return d || '';
      };
      const da = parseDmy(a.tanggal);
      const db = parseDmy(b.tanggal);
      if (db !== da) return db.localeCompare(da);
      return (b.jam || '').localeCompare(a.jam || '');
    });
    return merged;
  }, [uangMasukList, brilinkList]);

  // KPI Ringkasan (Termasuk Admin BRILink Cash & Transfer, tidak termasuk Piutang BON01 karena uang belum diterima)
  const kpi = useMemo(() => {
    const todayIso = getTodayIsoDate();
    const todayIndo = getTodayIndoDate();
    const isPiutangItem = (u: { metode?: string; rekeningTujuan?: string }) =>
      u.metode === 'PIUTANG' || u.rekeningTujuan === 'BON01';
    const hariIniItems = combinedUangMasukList.filter(
      (u) => !isPiutangItem(u) && (u.tanggal === todayIndo || u.tanggal === todayIso)
    );
    const totalHariIni = hariIniItems.reduce((s, u) => s + (Number(u.nominal) || 0), 0);
    const totalDariHb = uangMasukList
      .filter((u) => Boolean(u.noPenjualanHasilBumi) && !isPiutangItem(u))
      .reduce((s, u) => s + (Number(u.nominal) || 0), 0);
    const totalAdminBrilink = combinedUangMasukList
      .filter((u) => Boolean(u.isBrilinkAdmin))
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
      totalAdminBrilink,
      pendingCount: pendingHbSales.length,
      nilaiPendingHb,
    };
  }, [combinedUangMasukList, uangMasukList, pendingHbSales]);

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return combinedUangMasukList.filter((item) => {
      const isHb = Boolean(item.noPenjualanHasilBumi);
      const isBri = Boolean(item.isBrilinkAdmin);
      if (filterSumber === 'PENJUALAN_HASIL_BUMI' && !isHb) return false;
      if (filterSumber === 'BRILINK' && !isBri) return false;
      if (filterSumber === 'UMUM' && (isHb || isBri)) return false;
      if (!q) return true;
      const pengirimLabel = item.namaPengirim || item.pengirim || '';
      return (
        item.idTransaksi.toLowerCase().includes(q) ||
        pengirimLabel.toLowerCase().includes(q) ||
        (item.kategori || '').toLowerCase().includes(q) ||
        (item.noPenjualanHasilBumi || '').toLowerCase().includes(q) ||
        (item.komoditasNama || '').toLowerCase().includes(q) ||
        (item.keterangan || '').toLowerCase().includes(q) ||
        (item.rekeningTujuan || '').toLowerCase().includes(q)
      );
    });
  }, [combinedUangMasukList, filterSumber, searchQuery]);

  const pengirimFinalLabel = useMemo(() => {
    if (modePengirim === 'MITRA') {
      return activeMitra.find((m) => m.id === idMitra)?.nama || 'Mitra';
    }
    return namaPengirim.trim() || selectedHb?.namaMitra || 'Umum / Pembeli';
  }, [modePengirim, activeMitra, idMitra, namaPengirim, selectedHb]);

  const validateForm = (): boolean => {
    setErrorMsg('');
    if (nominal <= 0) {
      setErrorMsg('Masukkan nominal nilai penjualan / uang masuk lebih dari Rp 0.');
      return false;
    }
    if (jenisSumber === 'PENJUALAN_HASIL_BUMI' && !selectedHb) {
      setErrorMsg(
        'Pilih Nota Muat / Penjualan Hasil Bumi terlebih dahulu, atau ubah ke tab "Uang Masuk Umum".'
      );
      return false;
    }
    if (metode === 'PIUTANG') {
      if (jenisSumber !== 'PENJUALAN_HASIL_BUMI' || !selectedHb) {
        setErrorMsg(
          'Opsi Piutang Buyer / Mitra hanya tersedia untuk Pencairan Nota Muat Hasil Bumi.'
        );
        return false;
      }
      if (modePengirim !== 'MITRA' || !idMitra) {
        setErrorMsg(
          'Untuk dijadikan Piutang Buyer / Mitra, wajib memilih Buyer / Mitra terdaftar (bukan ketik nama manual) agar masuk ke Rekening Koran Mitra & BON01.'
        );
        return false;
      }
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
    const beratMuatKg = Number(rec.beratMuatKg) || 0;
    const tonaseAkhir = Number(rec.tonaseAkhirKg) || 0;
    const effectiveKg = tonaseAkhir > 0 ? tonaseAkhir : beratMuatKg;
    const hargaKg =
      Number(rec.hargaDealPerKg) ||
      Number(rec.hargaRealisasiPerKg) ||
      (effectiveKg > 0 ? Math.round(rec.nominal / effectiveKg) : rec.nominal);
    const isHb = Boolean(rec.noPenjualanHasilBumi);
    const isPiutang = rec.metode === 'PIUTANG' || rec.rekeningTujuan === 'BON01';
    return {
      title: isPiutang
        ? 'BUKTI PUTUS HARGA — PIUTANG BUYER / MITRA'
        : isHb
        ? 'BUKTI UANG MASUK — PENJUALAN HASIL BUMI'
        : 'BUKTI PENERIMAAN UANG MASUK',
      subtitle: isPiutang
        ? `Piutang Usaha / Tempo (BON01) | Divisi: ${rec.divisi}`
        : `Kas Masuk Perusahaan | Divisi: ${rec.divisi}`,
      nomorTransaksi: rec.idTransaksi,
      tanggal: rec.tanggal,
      jam: rec.jam,
      mitra: pengirimStr,
      rekening: isPiutang ? 'PIUTANG MITRA (BON01)' : `${rec.metode} (${rec.rekeningTujuan})`,
      kategori: rec.kategori,
      total: rec.nominal,
      items: [
        {
          nama:
            isHb && rec.noPenjualanHasilBumi
              ? `${isPiutang ? 'Putus Harga → Piutang' : 'Pencairan Nota'} ${
                  rec.noPenjualanHasilBumi
                }${rec.komoditasNama ? ` — ${rec.komoditasNama}` : ''}`
              : rec.kategori,
          qty: effectiveKg > 0 ? effectiveKg : 1,
          satuan: effectiveKg > 0 ? 'Kg' : 'Transaksi',
          harga: hargaKg,
          subtotal: rec.nominal,
        },
      ],
      detailRows: [
        { label: 'Divisi Terkait', value: rec.divisi },
        {
          label: isPiutang ? 'Dialokasikan Ke' : 'Rekening Tujuan',
          value: isPiutang ? 'PIUTANG MITRA (BON01 — Belum Bayar)' : `${rec.metode} (${rec.rekeningTujuan})`,
        },
        { label: 'Pengirim / Buyer', value: pengirimStr },
        ...(rec.noPenjualanHasilBumi
          ? [
              {
                label: 'Ref Nota Muat Hasil Bumi',
                value: `${rec.noPenjualanHasilBumi}${
                  beratMuatKg > 0 ? ` (Muat Awal: ${formatKgSpreadsheet(beratMuatKg)} Kg)` : ''
                }`,
                highlight: true,
              },
              ...(tonaseAkhir > 0
                ? [
                    {
                      label: 'Tonase Akhir (Pabrik / Pembeli)',
                      value: `${formatKgSpreadsheet(tonaseAkhir)} Kg`,
                    },
                  ]
                : []),
              ...(rec.susutKg !== undefined
                ? [
                    {
                      label: rec.susutKg < 0 ? 'Lebih Timbang' : 'Susut Perjalanan',
                      value: `${rec.susutKg < 0 ? '+' : '-'}${formatKgSpreadsheet(
                        Math.abs(rec.susutKg)
                      )} Kg (${Math.abs(Number(rec.susutPersen) || 0)}%)`,
                    },
                  ]
                : []),
              ...(hargaKg > 0
                ? [
                    {
                      label: 'Harga Deal / Realisasi per Kg',
                      value: `${formatRupiah(hargaKg)} / Kg`,
                    },
                  ]
                : []),
            ]
          : []),
        {
          label: isPiutang ? 'Total Dijadikan Piutang Mitra' : 'Total Uang Masuk',
          value: formatRupiah(rec.nominal),
          isTotal: true,
        },
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
          jenisSumber === 'PENJUALAN_HASIL_BUMI' ? selectedHb?.noPenjualan : undefined,
        tonaseAkhirKg:
          jenisSumber === 'PENJUALAN_HASIL_BUMI' && tonaseAkhirKg > 0 ? tonaseAkhirKg : undefined,
        hargaPerKg:
          jenisSumber === 'PENJUALAN_HASIL_BUMI' && hargaPerKg > 0 ? hargaPerKg : undefined,
        tandaiPutusLunas:
          jenisSumber === 'PENJUALAN_HASIL_BUMI'
            ? metode === 'PIUTANG'
              ? true
              : tandaiLunasHb
            : undefined,
        nominal,
        metode,
        rekeningTujuan:
          metode === 'PIUTANG'
            ? 'BON01'
            : metode === 'SINKRON'
            ? 'SINKRON'
            : metode === 'TRANSFER'
            ? rekeningTujuan
            : 'KAS01',
        divisi,
        keterangan: keterangan.trim() || undefined,
        fotoBukti: fotoBukti || undefined,
      });

      const receipt = buildReceiptFromRecord(record);
      setTonaseAkhirStr('');
      setHargaPerKgDisplay('');
      setNominalDisplay('');
      setKeterangan('');
      setFotoBukti('');
      setStepVerifikasi(false);
      setVerifiedDoubleCheck(false);
      setSuccessBanner(
        record.metode === 'PIUTANG'
          ? `Nota ${record.noPenjualanHasilBumi || record.idTransaksi} berhasil dikunci harga & masuk ke Piutang Buyer / Mitra (${record.namaPengirim || pengirimFinalLabel}) sebesar ${formatRupiah(record.nominal)} (BON01).`
          : `Uang Masuk ${record.idTransaksi} sebesar ${formatRupiah(
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

  const handleVoid = async (item: UnifiedUangMasukItem) => {
    setVoidLoading(true);
    setErrorMsg('');
    try {
      if (item.isBrilinkAdmin) {
        await api.deleteBrilink(item.idTransaksi);
      } else {
        await api.deleteUangMasuk(item.idTransaksi);
      }
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
                if (metode === 'PIUTANG') {
                  setMetode(bankAccounts.length > 0 ? 'TRANSFER' : 'TUNAI');
                }
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
                  value={selectedHb?.noPenjualan || ''}
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
                              STOK {selectedHb.komoditasNama.toUpperCase()} (SAAT MUAT)
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

                    {/* Panel Input Tonase Akhir, Harga Deal/Kg & Susut Perjalanan */}
                    <div className="p-3.5 rounded-xl bg-sky-50/80 border border-sky-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-950">
                          <Scale className="w-3.5 h-3.5 text-sky-700" />
                          <span>Input Tonase Akhir Pabrik &amp; Harga Putus / Kg (Hitung Susut &amp; Nominal)</span>
                        </div>
                        <span className="text-[10px] font-mono text-sky-800">
                          Muat Awal Gudang: <strong>{formatKgSpreadsheet(hbCalc.beratAwalMuat)} Kg</strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-sky-950">
                              Tonase Akhir (Kg)
                            </label>
                            <button
                              type="button"
                              onClick={() => handleTonaseAkhirChange(String(hbCalc.beratAwalMuat))}
                              className="text-[10px] font-semibold text-sky-700 hover:underline cursor-pointer"
                            >
                              = Muat Awal
                            </button>
                          </div>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder={`Contoh: ${Math.max(1, Math.round(hbCalc.beratAwalMuat - 30))}`}
                            value={tonaseAkhirStr}
                            onChange={(e) => handleTonaseAkhirChange(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-sky-300 bg-white font-mono tabular-nums font-bold text-sky-950 focus:outline-none focus:border-sky-600"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-bold text-sky-950">
                              Harga Deal / Kg (Rp)
                            </label>
                            {selectedHb.modalRataRataPerKg > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleHargaPerKgChange(
                                    Math.round(selectedHb.modalRataRataPerKg).toLocaleString('id-ID')
                                  )
                                }
                                className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                              >
                                = Modal ({formatRupiahSingkat(selectedHb.modalRataRataPerKg)})
                              </button>
                            )}
                          </div>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-zinc-400 font-mono font-bold">
                              Rp
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="Contoh: 56.000"
                              value={hargaPerKgDisplay}
                              onChange={(e) => handleHargaPerKgChange(e.target.value)}
                              className="w-full pl-8 pr-2.5 py-2 rounded-lg border border-sky-300 bg-white font-mono tabular-nums font-bold text-emerald-900 focus:outline-none focus:border-sky-600"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-sky-950 mb-1">
                            Susut / Selisih Timbangan
                          </label>
                          <div
                            className={`px-3 py-2 rounded-lg border font-mono tabular-nums font-bold text-xs flex items-center justify-between ${
                              hbCalc.susutKg === null
                                ? 'bg-white border-zinc-200 text-zinc-400'
                                : hbCalc.susutKg > 0
                                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                            }`}
                          >
                            {hbCalc.susutKg === null ? (
                              <span className="font-sans font-normal text-[11px]">
                                Isi Tonase Akhir...
                              </span>
                            ) : hbCalc.susutKg === 0 ? (
                              <span>Pas 0,0 Kg (0%)</span>
                            ) : hbCalc.susutKg > 0 ? (
                              <>
                                <span>Susut -{formatKgSpreadsheet(hbCalc.susutKg)} Kg</span>
                                <span className="text-[11px]">({hbCalc.susutPersen}%)</span>
                              </>
                            ) : (
                              <>
                                <span>
                                  Lebih +{formatKgSpreadsheet(Math.abs(hbCalc.susutKg))} Kg
                                </span>
                                <span className="text-[11px]">
                                  (+{Math.abs(hbCalc.susutPersen || 0)}%)
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {hbCalc.totalNilaiDeal > 0 && (
                        <div className="px-3 py-2 rounded-lg bg-white border border-sky-200 text-[11px] text-zinc-700 flex flex-wrap items-center justify-between gap-2 font-mono">
                          <span>
                            {formatKgSpreadsheet(hbCalc.basisKgRealisasi)} Kg{' '}
                            {hbCalc.hasTonaseAkhir ? '(Tonase Akhir)' : '(Muat Awal)'} ×{' '}
                            {formatRupiah(hargaPerKg)}/Kg ={' '}
                            <strong className="text-zinc-950">
                              {formatRupiah(hbCalc.totalNilaiDeal)}
                            </strong>
                          </span>
                          {hbCalc.sudahTerkumpul > 0 && (
                            <span className="text-sky-800">
                              Dikurangi DP {formatRupiah(hbCalc.sudahTerkumpul)} → Sisa:{' '}
                              <strong className="text-emerald-800">
                                {formatRupiah(
                                  Math.max(0, hbCalc.totalNilaiDeal - hbCalc.sudahTerkumpul)
                                )}
                              </strong>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-white p-3 rounded-lg border border-zinc-200">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">
                          Muat Awal → Akhir
                        </span>
                        <span className="font-mono font-bold text-zinc-900">
                          {formatKgSpreadsheet(hbCalc.beratAwalMuat)} →{' '}
                          {hbCalc.hasTonaseAkhir ? (
                            <span className="text-sky-800">
                              {formatKgSpreadsheet(tonaseAkhirKg)} Kg
                            </span>
                          ) : (
                            <span className="text-zinc-400 font-normal">Belum diisi</span>
                          )}
                        </span>
                      </div>
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
                          Harga Realisasi {hbCalc.hasTonaseAkhir ? '(Akhir)' : '(Awal)'}
                        </span>
                        <span className="font-mono font-bold text-zinc-900">
                          {nominal > 0 || hargaPerKg > 0
                            ? `${formatRupiah(hargaPerKg > 0 ? hargaPerKg : hbCalc.hargaRealisasiPerKg)}/Kg`
                            : '-'}
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

                    {metode !== 'PIUTANG' && (
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
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Detail Nominal & Tanggal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-zinc-800">
                {metode === 'PIUTANG'
                  ? 'Nominal Nilai Putus Harga → Piutang (Rp)'
                  : 'Nominal Uang Masuk (Rp)'}
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
                      handleNominalChange(sisaModal.toLocaleString('id-ID'));
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
                placeholder="Otomatis dari Tonase × Harga atau ketik..."
                value={nominalDisplay}
                onChange={(e) => handleNominalChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-sm font-bold text-emerald-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-800 mb-1">
              {metode === 'PIUTANG' ? 'Tanggal Putus Harga / Nota Piutang' : 'Tanggal Penerimaan Uang'}
            </label>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-zinc-900 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Metode Uang Masuk / Status Penyelesaian */}
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-zinc-800">
            Metode Penerimaan / Penyelesaian
          </label>
          <div
            className={`grid gap-2 ${
              jenisSumber === 'PENJUALAN_HASIL_BUMI'
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-3'
            }`}
          >
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
            {jenisSumber === 'PENJUALAN_HASIL_BUMI' && (
              <button
                type="button"
                onClick={() => {
                  setMetode('PIUTANG');
                  setModePengirim('MITRA');
                  if (!idMitra && activeMitra.length > 0) {
                    setIdMitra(activeMitra[0].id);
                  }
                  setStepVerifikasi(false);
                }}
                className={`py-2 px-3 rounded-lg border font-semibold transition-colors cursor-pointer ${
                  metode === 'PIUTANG'
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                Piutang Buyer / Mitra (BON01)
              </button>
            )}
          </div>

          {metode === 'PIUTANG' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] leading-relaxed">
              <strong>Mode Putus Harga → Piutang Buyer / Mitra (Tempo):</strong> Tonase Akhir, Susut, &amp; Harga Kesepakatan/Kg akan dikunci pada Nota Muat{' '}
              <strong>{selectedHb?.noPenjualan || 'JHB'}</strong>, sementara tagihan otomatis dicatat sebagai{' '}
              <strong>Piutang Mitra (BON01)</strong> dan muncul di <strong>Rekening Koran Mitra</strong>. Pembayarannya nanti dilunasi kapan saja lewat menu{' '}
              <strong>Bayar Bon Mitra</strong> atau <strong>Kliring Silang</strong>.
            </div>
          )}
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
                {metode === 'PIUTANG' ? 'Buyer / Mitra Penanggung Piutang *' : 'Pihak Pengirim / Pembayar'}
              </label>
              <div className="inline-flex rounded border border-zinc-200 bg-zinc-100 p-0.5 text-[10px]">
                <button
                  type="button"
                  disabled={metode === 'PIUTANG'}
                  onClick={() => setModePengirim('MANUAL')}
                  className={`px-2 py-0.5 rounded font-semibold ${
                    metode === 'PIUTANG'
                      ? 'text-zinc-400 cursor-not-allowed'
                      : modePengirim === 'MANUAL'
                      ? 'bg-white text-zinc-900 cursor-pointer'
                      : 'text-zinc-600 cursor-pointer'
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
            {modePengirim === 'MANUAL' && metode !== 'PIUTANG' ? (
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
                className={`w-full px-3 py-2 rounded-lg border bg-white text-zinc-900 font-medium focus:outline-none ${
                  metode === 'PIUTANG'
                    ? 'border-amber-400 focus:border-amber-600'
                    : 'border-zinc-300 focus:border-emerald-600'
                }`}
              >
                {activeMitra.length === 0 && (
                  <option value="">-- Belum ada Mitra aktif (buat di Master Mitra) --</option>
                )}
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
                className={`px-5 py-2.5 rounded-lg disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors ${
                  metode === 'PIUTANG'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Menyimpan...'
                    : metode === 'PIUTANG'
                    ? 'Ya, Kunci Harga & Jadikan Piutang Mitra'
                    : 'Ya, Konfirmasi & Simpan Uang Masuk'}
                </span>
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
              Rekapan Transaksi Uang Masuk ({filteredHistory.length})
            </h2>
            <p className="text-[11px] text-zinc-500">
              Pencairan penjualan hasil bumi, biaya admin BRILink (Tunai KAS01 &amp; Transfer BRI), serta kas masuk umum PT
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'PENJUALAN_HASIL_BUMI', label: 'Hasil Bumi' },
                  { id: 'BRILINK', label: 'Admin BRILink' },
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
                        <div className="space-y-0.5 mt-0.5">
                          <div className="text-[11px] font-mono text-sky-800">
                            Ref: {item.noPenjualanHasilBumi}
                            {item.komoditasNama ? ` · ${item.komoditasNama}` : ''}
                            {item.beratMuatKg
                              ? ` · Awal: ${formatKgSpreadsheet(item.beratMuatKg)} Kg`
                              : ''}
                          </div>
                          {(Number(item.tonaseAkhirKg) > 0 ||
                            Number(item.hargaDealPerKg) > 0 ||
                            Number(item.hargaRealisasiPerKg) > 0) && (
                            <div className="text-[11px] font-mono text-zinc-700 flex flex-wrap items-center gap-x-2">
                              {Number(item.tonaseAkhirKg) > 0 && (
                                <span className="font-semibold text-emerald-800">
                                  Akhir: {formatKgSpreadsheet(Number(item.tonaseAkhirKg))} Kg
                                </span>
                              )}
                              {item.susutKg !== undefined && (
                                <span
                                  className={`font-semibold ${
                                    item.susutKg > 0
                                      ? 'text-amber-700'
                                      : item.susutKg < 0
                                        ? 'text-emerald-700'
                                        : 'text-zinc-500'
                                  }`}
                                >
                                  ({item.susutKg > 0 ? 'Susut -' : item.susutKg < 0 ? 'Lebih +' : ''}
                                  {formatKgSpreadsheet(Math.abs(item.susutKg))} Kg /{' '}
                                  {Math.abs(Number(item.susutPersen) || 0)}%)
                                </span>
                              )}
                              {(Number(item.hargaDealPerKg) || Number(item.hargaRealisasiPerKg)) > 0 && (
                                <span className="font-bold text-zinc-900">
                                  @{' '}
                                  {formatRupiah(
                                    Number(item.hargaDealPerKg) || Number(item.hargaRealisasiPerKg)
                                  )}
                                  /Kg
                                </span>
                              )}
                            </div>
                          )}
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
                      {item.metode === 'PIUTANG' || item.rekeningTujuan === 'BON01' ? (
                        <span className="font-bold text-amber-800">PIUTANG · BON01</span>
                      ) : (
                        <>
                          {item.metode} · {item.rekeningTujuan}
                        </>
                      )}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                        item.metode === 'PIUTANG' || item.rekeningTujuan === 'BON01'
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                      title={formatRupiah(item.nominal)}
                    >
                      {item.metode === 'PIUTANG' || item.rekeningTujuan === 'BON01' ? (
                        <div>
                          <div>{formatRupiah(item.nominal)}</div>
                          <div className="text-[10px] font-sans font-semibold text-amber-700">
                            (Piutang BON01)
                          </div>
                        </div>
                      ) : (
                        <>+{formatRupiah(item.nominal)}</>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {confirmVoidId === item.idTransaksi ? (
                        <div className="inline-flex items-center space-x-1">
                          <button
                            type="button"
                            disabled={voidLoading}
                            onClick={() => handleVoid(item)}
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
                            onClick={() => {
                              setEditTxJenisHint(item.isBrilinkAdmin ? 'BRILINK' : 'UANG_MASUK');
                              setEditTxId(item.idTransaksi);
                            }}
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
        jenisHint={editTxJenisHint}
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
        }}
      />
    </div>
  );
};
