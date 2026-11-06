import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Truck,
  Scale,
  AlertCircle,
  CheckCircle2,
  ArrowDownLeft,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  Mitra,
  Rekening,
  StokHasilBumi,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
  isTanpaDivisi,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, formatRupiahSingkat, parseRupiahInput } from '../../utils/format.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import {
  ArusKasDivisiSelectorCard,
  DoubleCheckVerifikasiPanel,
  isRealTransferBankAccount,
  useDivisiOptions,
} from '../common/DoubleCheckVerifikasiPanel.tsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stokList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  mitraList: Mitra[];
  rekeningList: Rekening[];
  initialKomoditasKode?: string;
  onSuccess: (record: TransaksiPenjualanHasilBumi, receipt: ReceiptData) => void;
  onDeleted?: () => void;
}

function isPhysicalPurchase(p: TransaksiPembelianHasilBumi): boolean {
  if (!p) return false;
  if (p.komoditasKode === 'PINJAMAN_DANA' || p.komoditasKode === 'TITIP_DANA') return false;
  if (p.komoditasNama && p.komoditasNama.toLowerCase().includes('pinjaman uang')) return false;
  return (Number(p.beratBersih) || 0) > 0;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatKgSpreadsheet(val: number): string {
  return (Number(val) || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export const ModalJualHasilBumi: React.FC<Props> = ({
  isOpen,
  onClose,
  stokList,
  pembelianList,
  mitraList,
  rekeningList,
  initialKomoditasKode,
  onSuccess,
  onDeleted,
}) => {
  const activeKomoditas = useMemo(
    () =>
      stokList.filter(
        (h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN')
      ),
    [stokList]
  );

  const activeMitra = useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );

  const bankAccounts = useMemo(
    () => rekeningList.filter(isRealTransferBankAccount),
    [rekeningList]
  );
  const divisiOptions = useDivisiOptions();

  const [komoditasKode, setKomoditasKode] = useState<string>('');
  const [beratKotorStr, setBeratKotorStr] = useState<string>('');
  const [tonaseAkhirStr, setTonaseAkhirStr] = useState<string>('');
  const [potonganRafaksiStr, setPotonganRafaksiStr] = useState<string>('0');
  const [hargaJualDisplay, setHargaJualDisplay] = useState<string>('');
  const [hargaRataManualDisplay, setHargaRataManualDisplay] = useState<string>('');
  const [modePembeli, setModePembeli] = useState<'MANUAL' | 'MITRA'>('MANUAL');
  const [idMitra, setIdMitra] = useState<string>('');
  const [namaPembeliManual, setNamaPembeliManual] = useState<string>('');
  const [metodePembayaran, setMetodePembayaran] = useState<
    'BELUM_PUTUS_HARGA' | 'TUNAI' | 'TRANSFER' | 'PIUTANG' | 'SINKRON'
  >('BELUM_PUTUS_HARGA');
  const [allowOverStockPutus, setAllowOverStockPutus] = useState<boolean>(false);
  const [isHabisMuatSusut, setIsHabisMuatSusut] = useState<boolean>(false);
  const [confirmDeleteHb, setConfirmDeleteHb] = useState<boolean>(false);
  const [deletingHb, setDeletingHb] = useState<boolean>(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string>('');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>('');
  const [pakaiPtKomisi, setPakaiPtKomisi] = useState<boolean>(false);
  const [komisiPtNominal, setKomisiPtNominal] = useState<number>(0);
  const [rekeningKomisiPt, setRekeningKomisiPt] = useState<string>('BNI01');
  const [divisi, setDivisi] = useState<string>('PT Wijaya Agro Perkasa');
  const [noSuratJalan, setNoSuratJalan] = useState<string>('');
  const [tanggalInput, setTanggalInput] = useState<string>(getTodayIsoDate());
  const [keterangan, setKeterangan] = useState<string>('');
  const [stepVerifikasi, setStepVerifikasi] = useState<boolean>(false);
  const [verifiedDoubleCheck, setVerifiedDoubleCheck] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const defaultKom =
        (initialKomoditasKode &&
          activeKomoditas.find((k) => k.kode === initialKomoditasKode)?.kode) ||
        activeKomoditas.find((k) => k.stok > 0)?.kode ||
        activeKomoditas[0]?.kode ||
        '';
      setKomoditasKode(defaultKom);
      setBeratKotorStr('');
      setTonaseAkhirStr('');
      setPotonganRafaksiStr('0');
      setHargaJualDisplay('');
      setHargaRataManualDisplay('');
      setModePembeli('MANUAL');
      setIdMitra(activeMitra[0]?.id || '');
      setNamaPembeliManual('');
      setMetodePembayaran('BELUM_PUTUS_HARGA');
      setAllowOverStockPutus(false);
      setIsHabisMuatSusut(false);
      setConfirmDeleteHb(false);
      setDeleteSuccessMsg('');
      setRekeningTujuan(bankAccounts[0]?.kode || '');
      setDivisi('PT Wijaya Agro Perkasa');
      setNoSuratJalan('');
      setTanggalInput(getTodayIsoDate());
      setKeterangan('');
      setStepVerifikasi(false);
      setVerifiedDoubleCheck(false);
      setErrorMsg('');
    }
  }, [isOpen, initialKomoditasKode, activeKomoditas, activeMitra, bankAccounts]);

  const selectedKomoditas = useMemo(
    () => activeKomoditas.find((k) => k.kode === komoditasKode),
    [activeKomoditas, komoditasKode]
  );

  // Hitung modal rata-rata pembelian gudang secara riil
  const modalRataRataHitungOtomatis = useMemo(() => {
    if (!selectedKomoditas) return 0;
    const stokAwalKg = Number(selectedKomoditas.stokAwal) || 0;
    const modalAwalUang =
      Number(selectedKomoditas.modalAwalTotal) ||
      stokAwalKg * (Number(selectedKomoditas.rataRataModalAwal) || 0);

    const purchases = pembelianList.filter(
      (p) =>
        isPhysicalPurchase(p) &&
        (p.komoditasKode === selectedKomoditas.kode ||
          p.komoditasNama.toUpperCase().trim() === selectedKomoditas.nama.toUpperCase().trim())
    );

    const totalUang =
      modalAwalUang + purchases.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
    const totalKg =
      stokAwalKg + purchases.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);

    if (totalKg > 0 && totalUang > 0) {
      return Math.round(totalUang / totalKg);
    }
    return Math.max(0, Number(selectedKomoditas.rataRataModalAwal) || 0);
  }, [selectedKomoditas, pembelianList]);

  // Sinkronkan acuan harga rata-rata beli saat komoditas berganti
  useEffect(() => {
    if (modalRataRataHitungOtomatis > 0) {
      setHargaRataManualDisplay(modalRataRataHitungOtomatis.toLocaleString('id-ID'));
    } else {
      setHargaRataManualDisplay('');
    }
  }, [komoditasKode, modalRataRataHitungOtomatis]);

  const isBelumPutusHarga = metodePembayaran === 'BELUM_PUTUS_HARGA';
  const hargaRataPengurangStokPerKg =
    parseRupiahInput(hargaRataManualDisplay) || modalRataRataHitungOtomatis;

  const readyGudangKg = Math.max(0, Number(selectedKomoditas?.stok) || 0);
  const beratKotor = Math.max(0, parseFloat(beratKotorStr) || 0);
  const tonaseAkhir = Math.max(0, parseFloat(tonaseAkhirStr) || 0);
  const susutPerjalananKg =
    tonaseAkhir > 0 && beratKotor > 0
      ? Math.round((beratKotor - tonaseAkhir) * 100) / 100
      : 0;
  const potonganRafaksi = Math.min(99.9, Math.max(0, parseFloat(potonganRafaksiStr) || 0));
  const basisTonase = tonaseAkhir > 0 ? tonaseAkhir : beratKotor;
  const beratBersih = Math.round(basisTonase * (1 - potonganRafaksi / 100) * 100) / 100;
  const hargaJualPerKg = isBelumPutusHarga
    ? hargaRataPengurangStokPerKg
    : parseRupiahInput(hargaJualDisplay);

  const melebihiStok = beratBersih > readyGudangKg;
  const selisihTimbangKg = Math.round((beratBersih - readyGudangKg) * 100) / 100;
  const sisaGudangSetelah = Math.max(0, Math.round((readyGudangKg - beratBersih) * 100) / 100);
  const angkaBarisSisaKg = melebihiStok
    ? Math.abs(selisihTimbangKg)
    : sisaGudangSetelah;
  const angkaBarisSusutKg =
    beratBersih > 0 && (melebihiStok || isHabisMuatSusut) ? angkaBarisSisaKg : 0;

  // Kalkulasi Tabel Spreadsheet 4 Baris (JUMLAH / MUAT / SISA / SUSUT)
  const nilaiStokReadyRp = Math.round(readyGudangKg * hargaRataPengurangStokPerKg);
  const nilaiPengurangStokMuatRp = Math.round(beratBersih * hargaRataPengurangStokPerKg);
  const nilaiBarisSisaRp = Math.abs(nilaiStokReadyRp - nilaiPengurangStokMuatRp);

  const totalOmzetPutus = isBelumPutusHarga ? 0 : Math.round(beratBersih * hargaJualPerKg);
  const totalModalHpp = nilaiPengurangStokMuatRp;
  const estimasiLaba = isBelumPutusHarga ? 0 : totalOmzetPutus - totalModalHpp;

  const buyerLabel = useMemo(() => {
    if (modePembeli === 'MITRA') {
      const found = activeMitra.find((m) => m.id === idMitra);
      return found?.nama || 'MITRA';
    }
    return namaPembeliManual.trim() || noSuratJalan.trim() || 'PEMBELI';
  }, [modePembeli, activeMitra, idMitra, namaPembeliManual, noSuratJalan]);

  if (!isOpen) return null;

  const handleDeleteSelectedKomoditas = async () => {
    if (!selectedKomoditas) return;
    setDeletingHb(true);
    setErrorMsg('');
    try {
      const res = await api.deleteKomoditasHasilBumi(selectedKomoditas.kode);
      const remaining = activeKomoditas.filter((k) => k.kode !== selectedKomoditas.kode);
      setConfirmDeleteHb(false);
      setDeleteSuccessMsg(
        `Hasil Bumi "${res.deleted.nama} (${res.deleted.kode})" berhasil dihapus dari daftar aktif.`
      );
      setKomoditasKode(remaining[0]?.kode || '');
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      if (onDeleted) onDeleted();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menghapus komoditas hasil bumi.');
    } finally {
      setDeletingHb(false);
    }
  };

  const blokirKarenaStok = !isBelumPutusHarga && melebihiStok && !allowOverStockPutus;

  const validateForm = (): boolean => {
    setErrorMsg('');
    if (!selectedKomoditas) {
      setErrorMsg('Pilih komoditas hasil bumi terlebih dahulu.');
      return false;
    }
    if (beratBersih <= 0) {
      setErrorMsg('Masukkan berat kotor timbangan muat lebih dari 0 Kg.');
      return false;
    }
    if (blokirKarenaStok) {
      setErrorMsg(
        `Stok Ready Gudang (${readyGudangKg.toLocaleString('id-ID')} Kg) lebih kecil dari berat muat (${beratBersih.toLocaleString('id-ID')} Kg). Centang opsi "Izinkan Muat Lebih Timbang" jika terdapat selisih timbangan.`
      );
      return false;
    }
    if (isBelumPutusHarga) {
      if (hargaRataPengurangStokPerKg <= 0) {
        setErrorMsg(
          'Masukkan Harga Rata-Rata Pembelian / Kg (> Rp 0) sebagai dasar pengurang nilai stok gudang.'
        );
        return false;
      }
    } else {
      if (hargaJualPerKg <= 0) {
        setErrorMsg('Masukkan harga jual deal per Kg lebih dari Rp 0.');
        return false;
      }
      if (metodePembayaran === 'PIUTANG' && (modePembeli !== 'MITRA' || !idMitra)) {
        setErrorMsg('Penjualan tempo/piutang wajib memilih Mitra / Pabrik terdaftar.');
        return false;
      }
      if (metodePembayaran === 'TRANSFER' && !rekeningTujuan) {
        setErrorMsg('Pilih rekening bank penampung pembayaran transfer.');
        return false;
      }
    }
    return true;
  };

  const handleOpenStepVerifikasi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setVerifiedDoubleCheck(false);
    setStepVerifikasi(true);
  };

  const handleFinalSubmit = async () => {
    if (!validateForm() || !selectedKomoditas) return;
    if (!verifiedDoubleCheck) {
      setErrorMsg('Harap centang konfirmasi verifikasi data pengiriman terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    try {
      const record = await api.processPenjualanHasilBumi({
        idMitra: modePembeli === 'MITRA' ? idMitra : 'UMUM',
        namaPembeliManual:
          modePembeli === 'MANUAL'
            ? namaPembeliManual.trim() || 'Pabrik / Pembeli Umum'
            : undefined,
        komoditasKode: selectedKomoditas.kode,
        beratKotor: basisTonase,
        potonganRafaksi,
        hargaJualPerKg: isBelumPutusHarga ? hargaRataPengurangStokPerKg : hargaJualPerKg,
        divisi,
        metodePembayaran,
        rekeningTujuan: metodePembayaran === 'TRANSFER' ? rekeningTujuan : undefined,
        noSuratJalan: noSuratJalan.trim() || undefined,
        tanggal: tanggalInput,
        keterangan:
          [
            keterangan.trim(),
            susutPerjalananKg !== 0
              ? `Muat Awal: ${beratKotor} Kg, Tonase Akhir: ${tonaseAkhir} Kg, Susut: ${susutPerjalananKg} Kg`
              : '',
          ]
            .filter(Boolean)
            .join(' | ') || undefined,
        allowOverStockMuat: isBelumPutusHarga || allowOverStockPutus,
        isHabisMuatSusut: isHabisMuatSusut || melebihiStok,
      });

      if (pakaiPtKomisi && komisiPtNominal > 0) {
        await api.processUangMasuk({
          tanggal: tanggalInput,
          divisi: 'PT Wijaya Agro Perkasa',
          kategori: 'JASA_PENJUALAN_PT',
          metode: 'TRANSFER',
          nominal: komisiPtNominal,
          rekeningTujuan: rekeningKomisiPt,
          namaPengirimManual:
            modePembeli === 'MITRA'
              ? activeMitra.find((m) => m.id === idMitra)?.nama || 'Eksportir'
              : namaPembeliManual.trim() || 'Eksportir',
          keterangan: `Komisi Jasa Penjualan PT (${selectedKomoditas.nama} · ${record.noPenjualan})`,
        });
      }

      const isRecordBelumPutus =
        record.isBelumPutusHargaJual || record.metodePembayaran === 'BELUM_PUTUS_HARGA';
      const nilaiModalPengurang =
        Number(record.nilaiModalPengurangStok) ||
        Math.round(record.beratBersih * record.modalRataRataPerKg);

      const receipt: ReceiptData = {
        title: isRecordBelumPutus
          ? 'NOTA MUAT / JUAL HASIL BUMI (BELUM PUTUS HARGA)'
          : 'NOTA PENJUALAN HASIL BUMI',
        subtitle: isRecordBelumPutus
          ? `Muat Keluar Gudang · Menunggu Uang Masuk | Divisi: ${isTanpaDivisi(record.divisi || divisi) ? 'Tanpa Divisi' : record.divisi || divisi}`
          : `Pengiriman Stok Keluar Gudang | Divisi: ${isTanpaDivisi(record.divisi || divisi) ? 'Tanpa Divisi' : record.divisi || divisi}`,
        nomorTransaksi: record.noPenjualan,
        tanggal: record.tanggal,
        jam: record.jam,
        mitra: record.namaMitra,
        rekening: isRecordBelumPutus
          ? 'MENUNGGU UANG MASUK (Stok Dipotong Rata-Rata Beli)'
          : `${record.metodePembayaran} (${record.rekeningTujuan})`,
        kategori: 'PENJUALAN_HASIL_BUMI',
        total: isRecordBelumPutus ? nilaiModalPengurang : record.totalNominal,
        items: [
          {
            nama: `MUAT ${record.namaMitra.toUpperCase()} — ${record.komoditasNama}${
              record.noSuratJalan ? ` [DO: ${record.noSuratJalan}]` : ''
            }`,
            qty: record.beratBersih,
            satuan: 'Kg',
            harga: isRecordBelumPutus ? record.modalRataRataPerKg : record.hargaJualPerKg,
            subtotal: isRecordBelumPutus ? nilaiModalPengurang : record.totalNominal,
          },
        ],
        detailRows: isRecordBelumPutus
          ? [
              { label: 'Divisi Terkait', value: record.divisi || divisi },
              {
                label: 'STOK Gudang Sebelum Muat',
                value: `${record.stokGudangSebelum.toLocaleString('id-ID')} Kg × ${formatRupiah(record.modalRataRataPerKg)}`,
              },
              {
                label: `MUAT ${record.namaMitra.toUpperCase()} (JUAL)`,
                value: `${record.beratBersih.toLocaleString('id-ID')} Kg`,
                highlight: true,
              },
              {
                label: 'Harga Rata-Rata Beli (Pengurang Stok)',
                value: `${formatRupiah(record.modalRataRataPerKg)} / Kg`,
              },
              {
                label: 'Nilai Pengurang Stok Gudang',
                value: formatRupiah(nilaiModalPengurang),
                isTotal: true,
              },
              {
                label:
                  (record.selisihTimbangMuatKg || 0) > 0
                    ? 'Selisih Lebih Timbang Muat'
                    : 'SISA STOK di Gudang',
                value:
                  (record.selisihTimbangMuatKg || 0) > 0
                    ? `+${Number(record.selisihTimbangMuatKg).toLocaleString('id-ID')} Kg (Stok Gudang Jadi 0 Kg)`
                    : `${record.stokGudangSetelah.toLocaleString('id-ID')} Kg`,
              },
              {
                label: 'Status Pencairan Uang',
                value: 'Rp 0 (Input Nanti Lewat Menu Uang Masuk)',
              },
            ]
          : [
              { label: 'Divisi Terkait', value: record.divisi || divisi },
              {
                label: 'Rekening Uang Riil',
                value: `${record.metodePembayaran} (${record.rekeningTujuan})`,
              },
              {
                label: 'Berat Kotor Timbangan',
                value: `${record.beratKotor.toLocaleString('id-ID')} Kg`,
              },
              { label: 'Potongan Rafaksi', value: `${record.potonganRafaksi}%` },
              {
                label: 'Berat Bersih Keluar',
                value: `${record.beratBersih.toLocaleString('id-ID')} Kg`,
                highlight: true,
              },
              {
                label: 'Stok Gudang Sebelum',
                value: `${record.stokGudangSebelum.toLocaleString('id-ID')} Kg`,
              },
              {
                label: 'Sisa Ready di Gudang',
                value: `${record.stokGudangSetelah.toLocaleString('id-ID')} Kg`,
              },
              { label: 'Total Penjualan', value: formatRupiah(record.totalNominal), isTotal: true },
            ],
        catatan: record.keterangan,
      };

      onClose();
      onSuccess(record, receipt);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan transaksi penjualan hasil bumi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 w-full max-w-3xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-zinc-900 truncate">
                Muat / Jual Stok Hasil Bumi Keluar Gudang
              </h2>
              <p className="text-[11px] text-zinc-500 truncate">
                Mendukung Muat Belum Putus Harga (pengurang stok pakai rata-rata beli, uang lewat Uang Masuk) maupun Langsung Putus Harga
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleOpenStepVerifikasi}
          className="p-5 space-y-4 max-h-[84vh] overflow-y-auto text-xs"
        >
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mode Skema Penjualan: Belum Putus Harga vs Langsung Putus Harga */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-zinc-800">
              Pilih Skema Penjualan / Muat Hasil Bumi
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setMetodePembayaran('BELUM_PUTUS_HARGA');
                  setStepVerifikasi(false);
                  setVerifiedDoubleCheck(false);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isBelumPutusHarga
                    ? 'bg-sky-50 border-sky-600 ring-1 ring-sky-600'
                    : 'bg-white border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-900 text-xs">
                    1. Belum Putus Harga (Muat Keluar)
                  </span>
                  <span className="font-mono text-[10px] font-bold text-sky-800">
                    UANG LEWAT UANG MASUK
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                  Stok langsung dikurangi memakai <strong>Harga Rata-Rata Pembelian</strong>. Saat uang cair dari pembeli/pabrik, input lewat menu <strong>Uang Masuk (+)</strong>.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isBelumPutusHarga) {
                    setMetodePembayaran(bankAccounts.length > 0 ? 'TRANSFER' : 'TUNAI');
                  }
                  setStepVerifikasi(false);
                  setVerifiedDoubleCheck(false);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  !isBelumPutusHarga
                    ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600'
                    : 'bg-white border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-zinc-900 text-xs">
                    2. Sudah Putus Harga (Langsung Deal)
                  </span>
                  <span className="font-mono text-[10px] font-bold text-emerald-800">
                    TUNAI / BANK / BON / SINKRON
                  </span>
                </div>
                <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                  Harga jual per Kg sudah deal sekarang. Otomatis menambah Kas/Bank PT atau mencatat Piutang Mitra.
                </p>
              </button>
            </div>
          </div>

          {deleteSuccessMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{deleteSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setDeleteSuccessMsg('')}
                className="text-emerald-700 hover:underline font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Pilih Komoditas (+ Opsi Hapus Hasil Bumi Tidak Berjalan), Tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="block text-[11px] font-semibold text-zinc-700">
                  Komoditas Hasil Bumi di Gudang
                </label>
                {selectedKomoditas && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteHb((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 cursor-pointer"
                    title="Hapus komoditas hasil bumi ini jika sudah tidak berjalan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Hasil Bumi</span>
                  </button>
                )}
              </div>
              <select
                value={komoditasKode}
                onChange={(e) => {
                  setKomoditasKode(e.target.value);
                  setConfirmDeleteHb(false);
                  setStepVerifikasi(false);
                }}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-medium focus:outline-none focus:border-emerald-600"
              >
                {activeKomoditas.map((hb) => (
                  <option key={hb.kode} value={hb.kode}>
                    {hb.kode} — {hb.nama} (Ready: {(hb.stok || 0).toLocaleString('id-ID')} {hb.satuan})
                  </option>
                ))}
              </select>

              {confirmDeleteHb && selectedKomoditas && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 space-y-2 text-rose-950">
                  <div className="font-bold text-xs">
                    Hapus Hasil Bumi &ldquo;{selectedKomoditas.nama} ({selectedKomoditas.kode})&rdquo;?
                  </div>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    Gunakan opsi ini jika komoditas hasil bumi sudah tidak berjalan. Histori nota pembelian/penjualan lama tetap tersimpan aman di pembukuan.
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={deletingHb}
                      onClick={() => setConfirmDeleteHb(false)}
                      className="px-3 py-1.5 rounded-md bg-white border border-zinc-300 text-zinc-700 font-semibold cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={deletingHb}
                      onClick={handleDeleteSelectedKomoditas}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-rose-700 hover:bg-rose-800 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deletingHb ? 'Menghapus...' : 'Ya, Hapus Hasil Bumi'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Tanggal Muat / Jual
              </label>
              <input
                type="date"
                value={tanggalInput}
                onChange={(e) => setTanggalInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-mono tabular-nums focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Pihak Pembeli / Tujuan Muat & Timbangan */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-700">
                  Nama Muat / Pembeli (Contoh: ARYA)
                </label>
                <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setModePembeli('MANUAL');
                      if (metodePembayaran === 'PIUTANG') setMetodePembayaran('TRANSFER');
                    }}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      modePembeli === 'MANUAL' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
                    }`}
                  >
                    Ketik Nama
                  </button>
                  <button
                    type="button"
                    onClick={() => setModePembeli('MITRA')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      modePembeli === 'MITRA' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
                    }`}
                  >
                    Mitra
                  </button>
                </div>
              </div>

              {modePembeli === 'MANUAL' ? (
                <input
                  type="text"
                  placeholder="Contoh: ARYA / Pabrik / Bandar..."
                  value={namaPembeliManual}
                  onChange={(e) => setNamaPembeliManual(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 font-semibold focus:outline-none focus:border-emerald-600"
                />
              ) : (
                <select
                  value={idMitra}
                  onChange={(e) => setIdMitra(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-semibold focus:outline-none focus:border-emerald-600"
                >
                  {activeMitra.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.role})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-zinc-700">Tonase Awal (Kg)</label>
                {readyGudangKg > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBeratKotorStr(String(readyGudangKg));
                      setPotonganRafaksiStr('0');
                    }}
                    className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    = Stok
                  </button>
                )}
              </div>
              <div className="relative">
                <Scale className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="3094"
                  value={beratKotorStr}
                  onChange={(e) => {
                    setBeratKotorStr(e.target.value);
                    setStepVerifikasi(false);
                  }}
                  className="w-full pl-8 pr-2 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums font-bold text-zinc-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Tonase Akhir (Kg)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Opsional"
                value={tonaseAkhirStr}
                onChange={(e) => {
                  setTonaseAkhirStr(e.target.value);
                  setStepVerifikasi(false);
                }}
                className="w-full px-2.5 py-2 rounded-lg border border-sky-300 bg-sky-50/40 font-mono tabular-nums font-bold text-sky-900 focus:outline-none focus:border-sky-600"
              />
              {susutPerjalananKg !== 0 && (
                <div className="text-[10px] font-semibold text-amber-700 mt-0.5">
                  Susut: {susutPerjalananKg} Kg
                </div>
              )}
            </div>

            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Rafaksi (%)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max="99"
                placeholder="0"
                value={potonganRafaksiStr}
                onChange={(e) => {
                  setPotonganRafaksiStr(e.target.value);
                  setStepVerifikasi(false);
                }}
                className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-zinc-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="sm:col-span-2">
              {isBelumPutusHarga ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-sky-900 truncate" title="Harga Rata-Rata Pembelian Pengurang Stok">
                      Rata2 Beli/Kg
                    </label>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="52.542"
                    value={hargaRataManualDisplay}
                    onChange={(e) => {
                      const num = parseRupiahInput(e.target.value);
                      setHargaRataManualDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                      setStepVerifikasi(false);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-sky-400 bg-sky-50/50 font-mono tabular-nums font-bold text-zinc-900 focus:outline-none focus:border-sky-600"
                    title="Otomatis dari rata-rata pembelian komoditas untuk mengurangi nilai stok"
                  />
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-zinc-700 truncate">
                      Harga Deal/Kg
                    </label>
                    {modalRataRataHitungOtomatis > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setHargaJualDisplay(modalRataRataHitungOtomatis.toLocaleString('id-ID'))
                        }
                        className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        =Modal
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="55.000"
                    value={hargaJualDisplay}
                    onChange={(e) => {
                      const num = parseRupiahInput(e.target.value);
                      setHargaJualDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                      setStepVerifikasi(false);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums font-bold text-zinc-900 focus:outline-none focus:border-emerald-600"
                  />
                </>
              )}
            </div>
          </div>

          {/* Opsi Gudang Dikuras Habis (Sisa Masuk ke Baris SUSUT) */}
          {beratBersih > 0 && beratBersih < readyGudangKg && (
            <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-zinc-50 border border-zinc-300 text-zinc-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isHabisMuatSusut}
                onChange={(e) => {
                  setIsHabisMuatSusut(e.target.checked);
                  setStepVerifikasi(false);
                }}
                className="rounded border-zinc-400 text-rose-600 focus:ring-rose-600"
              />
              <span className="text-[11px] font-semibold">
                Gudang Dikuras Habis Saat Muat Ini (Selisih{' '}
                <strong className="font-mono">{formatKgSpreadsheet(sisaGudangSetelah)} Kg</strong>{' '}
                dicatat sebagai <strong>SUSUT</strong> &amp; stok gudang menjadi 0 Kg)
              </span>
            </label>
          )}

          {/* ===================================================================== */}
          {/* TABEL SIMULASI SPREADSHEET 4 BARIS: JUMLAH (HIJAU) / MUAT (KUNING) / SISA (BIRU) / SUSUT (MERAH) */}
          {/* ===================================================================== */}
          <div className="rounded-xl border border-zinc-400 overflow-hidden">
            <div className="px-3.5 py-2 bg-zinc-900 text-white flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-wide">
                SIMULASI MUTASI GUDANG HASIL BUMI (FORMAT BUKU MUTASI)
              </span>
              <span className="text-[10px] font-mono text-zinc-300">
                {selectedKomoditas?.nama || '-'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-zinc-100 border-b border-zinc-400 text-[10px] font-bold uppercase text-zinc-700">
                    <th className="py-2 px-3 text-left border-r border-zinc-400">
                      Nama / Keterangan
                    </th>
                    <th className="py-2 px-3 text-center border-r border-zinc-400">Tanggal</th>
                    <th className="py-2 px-3 text-right border-r border-zinc-400">Berat (Kg)</th>
                    <th className="py-2 px-3 text-right border-r border-zinc-400">Harga / Kg</th>
                    <th className="py-2 px-3 text-right">Jumlah (Rp)</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums text-zinc-950">
                  {/* Baris 1: JUMLAH (Hijau #6AA84F) */}
                  <tr className="bg-[#6AA84F] border-b border-zinc-700 font-bold">
                    <td className="py-2 px-3 font-sans font-bold text-center border-r border-zinc-700">
                      JUMLAH
                    </td>
                    <td className="py-2 px-3 text-center border-r border-zinc-700" />
                    <td className="py-2 px-3 text-right border-r border-zinc-700">
                      {formatKgSpreadsheet(readyGudangKg)}
                    </td>
                    <td className="py-2 px-3 text-right border-r border-zinc-700">
                      {formatRupiah(hargaRataPengurangStokPerKg)}
                    </td>
                    <td className="py-2 px-3 text-right font-extrabold">
                      {formatRupiah(nilaiStokReadyRp)}
                    </td>
                  </tr>

                  {/* Baris 2: MUAT [PEMBELI / PLAT] (Kuning #FFFF00) */}
                  <tr className="bg-[#FFFF00] border-b border-zinc-700 font-bold">
                    <td className="py-2 px-3 font-sans font-extrabold text-center border-r border-zinc-700 truncate max-w-[220px]">
                      {buyerLabel.toUpperCase().startsWith('MUAT')
                        ? buyerLabel.toUpperCase()
                        : `MUAT ${buyerLabel.toUpperCase()}`}
                    </td>
                    <td className="py-2 px-3 text-center border-r border-zinc-700">
                      {tanggalInput
                        ? tanggalInput.split('-').reverse().join('/')
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-right border-r border-zinc-700">
                      {formatKgSpreadsheet(beratBersih)}
                    </td>
                    <td className="py-2 px-3 text-right border-r border-zinc-700">
                      {!isBelumPutusHarga && hargaJualPerKg > 0
                        ? formatRupiah(hargaJualPerKg)
                        : ''}
                    </td>
                    <td className="py-2 px-3 text-right font-extrabold">
                      {formatRupiah(
                        isBelumPutusHarga ? nilaiPengurangStokMuatRp : totalOmzetPutus
                      )}
                    </td>
                  </tr>

                  {/* Baris 3: SISA (Biru #00B0F0) */}
                  <tr className="bg-[#00B0F0] border-b border-zinc-700 font-bold">
                    <td className="py-2 px-3 font-sans font-bold text-center border-r border-zinc-700">
                      SISA
                    </td>
                    <td className="py-2 px-3 text-center border-r border-zinc-700" />
                    <td className="py-2 px-3 text-right border-r border-zinc-700">
                      {formatKgSpreadsheet(angkaBarisSisaKg)}
                    </td>
                    <td className="py-2 px-3 text-right border-r border-zinc-700" />
                    <td className="py-2 px-3 text-right font-extrabold">
                      {formatRupiah(nilaiBarisSisaRp)}
                    </td>
                  </tr>

                  {/* Baris 4: SUSUT (Merah #FF0000) */}
                  <tr className="bg-[#FF0000] text-zinc-950 font-bold">
                    <td className="py-2 px-3 font-sans font-bold text-center border-r border-zinc-700">
                      SUSUT
                    </td>
                    <td className="py-2 px-3 text-center border-r border-zinc-700" />
                    <td className="py-2 px-3 text-right border-r border-zinc-700">
                      {angkaBarisSusutKg > 0 ? formatKgSpreadsheet(angkaBarisSusutKg) : '0,0'}
                    </td>
                    <td className="py-2 px-3 text-right border-r border-zinc-700" />
                    <td className="py-2 px-3 text-right" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Info Tambahan Sesuai Mode */}
          {isBelumPutusHarga ? (
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-start space-x-2.5 text-sky-950">
              <ArrowDownLeft className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5 leading-relaxed">
                <div className="font-bold text-xs">
                  Alur Pencairan Uang Hasil Penjualan Lewat Menu &ldquo;Uang Masuk&rdquo;
                </div>
                <p className="text-[11px] text-sky-900/90">
                  Saat disimpan sekarang, stok gudang berkurang <strong>{formatKgSpreadsheet(beratBersih)} Kg</strong> dengan nilai pengurang stok rata-rata beli <strong>{formatRupiah(nilaiPengurangStokMuatRp)}</strong> dan kas masuk tercatat <strong>Rp 0</strong>. Ketika harga sudah putus / uang diterima dari <strong>{buyerLabel}</strong>, pilih nota ini di menu <strong>Uang Masuk (+)</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {melebihiStok && (
                <label className="flex items-center space-x-2 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowOverStockPutus}
                    onChange={(e) => setAllowOverStockPutus(e.target.checked)}
                    className="rounded border-amber-400 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="text-[11px] font-semibold">
                    Izinkan Muat Lebih Timbang (+{formatKgSpreadsheet(angkaBarisSisaKg)} Kg di atas stok tercatat; sisa stok gudang menjadi 0 Kg)
                  </span>
                </label>
              )}

              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-zinc-700">
                  Metode Penerimaan Pembayaran (Putus Harga)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['TUNAI', 'TRANSFER', 'PIUTANG', 'SINKRON'] as const).map((mtd) => (
                    <button
                      key={mtd}
                      type="button"
                      onClick={() => {
                        setMetodePembayaran(mtd);
                        setVerifiedDoubleCheck(false);
                        if (mtd === 'PIUTANG') setModePembeli('MITRA');
                      }}
                      className={`py-2 px-2.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                        metodePembayaran === mtd
                          ? mtd === 'SINKRON'
                            ? 'bg-indigo-700 text-white border-indigo-700'
                            : 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      {mtd === 'TUNAI'
                        ? 'Tunai (KAS01)'
                        : mtd === 'TRANSFER'
                        ? 'Transfer Bank'
                        : mtd === 'PIUTANG'
                        ? 'Piutang Mitra'
                        : '🔄 Sinkron (Non-Riil)'}
                    </button>
                  ))}
                </div>

                {metodePembayaran === 'TRANSFER' && (
                  <select
                    value={rekeningTujuan}
                    onChange={(e) => setRekeningTujuan(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-emerald-600"
                  >
                    {bankAccounts.map((rek) => (
                      <option key={rek.kode} value={rek.kode}>
                        {rek.kode} — {rek.nama} ({formatRupiahSingkat(rek.saldoSaatIni)})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Pilih Arus Kas Divisi */}
          <ArusKasDivisiSelectorCard
            direction="MASUK"
            metode={isBelumPutusHarga ? 'INTERNAL_PT' : metodePembayaran}
            nominal={isBelumPutusHarga ? 0 : totalOmzetPutus}
            isBelumPutusHarga={isBelumPutusHarga}
            divisi={divisi}
            divisiOptions={divisiOptions}
            onChangeDivisi={(d) => {
              setVerifiedDoubleCheck(false);
              setDivisi(d);
            }}
            rekeningList={rekeningList}
            theme="light"
          />

          {/* Opsi Penjualan Menggunakan PT (Komisi Jasa Penjualan) */}
          <div className="p-3 rounded-xl border border-sky-200 bg-sky-50/60 space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-sky-900 cursor-pointer">
              <input
                type="checkbox"
                checked={pakaiPtKomisi}
                onChange={(e) => setPakaiPtKomisi(e.target.checked)}
                className="rounded border-sky-400"
              />
              <span>Penjualan Menggunakan PT (Ada Komisi Jasa Penjualan PT)</span>
            </label>
            <p className="text-[11px] text-sky-800">
              Jika dicentang, <strong>Komisi PT</strong> masuk ke arus kas <strong>PT Wijaya Agro Perkasa</strong>, sedangkan hasil penjualan tetap masuk arus kas <strong>GWA</strong>. Jika tidak dicentang, seluruh arus kas fokus di <strong>GWA</strong>.
            </p>
            {pakaiPtKomisi && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                    Nominal Komisi PT (Rp)
                  </label>
                  <input
                    type="number"
                    value={komisiPtNominal || ''}
                    onChange={(e) => setKomisiPtNominal(Number(e.target.value) || 0)}
                    placeholder="Contoh: 400000"
                    className="w-full px-3 py-1.5 rounded-lg border border-sky-300 text-xs font-mono font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                    Rekening Tujuan Komisi PT
                  </label>
                  <select
                    value={rekeningKomisiPt}
                    onChange={(e) => setRekeningKomisiPt(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-sky-300 text-xs font-semibold bg-white"
                  >
                    {bankAccounts.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.kode} - {r.nama}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* No Surat Jalan & Catatan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                No. DO / Surat Jalan / Plat Truk (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: DO-014 / BE 8812 XX"
                value={noSuratJalan}
                onChange={(e) => setNoSuratJalan(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Catatan Transaksi (Opsional)
              </label>
              <input
                type="text"
                placeholder="Keterangan muat, kadar air, tujuan kirim..."
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Ringkasan Kalkulasi */}
          {!isBelumPutusHarga && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-zinc-900 text-white">
              <div className="min-w-0 overflow-hidden">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider truncate">
                  Total Omzet Penjualan
                </div>
                <div
                  className="text-base font-bold font-mono tabular-nums text-white truncate whitespace-nowrap mt-0.5"
                  title={formatRupiah(totalOmzetPutus)}
                >
                  {formatRupiahSingkat(totalOmzetPutus)}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono tabular-nums truncate">
                  {formatRupiah(totalOmzetPutus)}
                </div>
              </div>

              <div className="min-w-0 overflow-hidden sm:border-l sm:border-zinc-800 sm:pl-3">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider truncate">
                  Total HPP Modal Gudang
                </div>
                <div
                  className="text-base font-bold font-mono tabular-nums text-zinc-200 truncate whitespace-nowrap mt-0.5"
                  title={formatRupiah(totalModalHpp)}
                >
                  {formatRupiahSingkat(totalModalHpp)}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono tabular-nums truncate">
                  {beratBersih.toLocaleString('id-ID')} Kg ×{' '}
                  {formatRupiahSingkat(hargaRataPengurangStokPerKg)}
                </div>
              </div>

              <div className="min-w-0 overflow-hidden sm:border-l sm:border-zinc-800 sm:pl-3">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider truncate">
                  Estimasi Selisih / Laba
                </div>
                <div
                  className={`text-base font-bold font-mono tabular-nums truncate whitespace-nowrap mt-0.5 ${
                    estimasiLaba >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                  title={formatRupiah(estimasiLaba)}
                >
                  {estimasiLaba >= 0 ? '+' : ''}
                  {formatRupiahSingkat(estimasiLaba)}
                </div>
                <div className="text-[10px] text-zinc-400 font-mono tabular-nums truncate">
                  {formatRupiah(estimasiLaba)}
                </div>
              </div>
            </div>
          )}

          {/* Panel Konfirmasi Verifikasi */}
          {stepVerifikasi &&
            (isBelumPutusHarga ? (
              <div className="rounded-xl border border-sky-300 bg-sky-50/70 p-4 space-y-3">
                <div className="flex items-center space-x-2 text-sky-950 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>VERIFIKASI MUAT HASIL BUMI (BELUM PUTUS HARGA)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] bg-white p-3 rounded-lg border border-sky-200">
                  <div>
                    <span className="text-zinc-500 block">Tujuan Muat / Pembeli:</span>
                    <span className="font-bold text-zinc-900">MUAT {buyerLabel.toUpperCase()}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Divisi Pencatat:</span>
                    <span className="font-bold text-zinc-900">
                      {isTanpaDivisi(divisi) ? 'Tanpa Divisi (Non-Divisi)' : divisi}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Tonase Pengurang Stok:</span>
                    <span className="font-mono font-bold text-sky-800">
                      {formatKgSpreadsheet(beratBersih)} Kg ({selectedKomoditas?.nama})
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Nilai Pengurang Stok (Rata2 Beli):</span>
                    <span className="font-mono font-bold text-zinc-900">
                      {formatRupiah(nilaiPengurangStokMuatRp)} ({formatRupiah(hargaRataPengurangStokPerKg)}/Kg)
                    </span>
                  </div>
                </div>
                <label className="flex items-start space-x-2.5 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={verifiedDoubleCheck}
                    onChange={(e) => setVerifiedDoubleCheck(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-sky-400 text-sky-700 focus:ring-sky-600"
                  />
                  <span className="text-xs font-semibold text-zinc-900 leading-snug">
                    Saya sudah memeriksa tonase muat <strong>{formatKgSpreadsheet(beratBersih)} Kg</strong> &amp; harga rata-rata beli pengurang stok <strong>{formatRupiah(hargaRataPengurangStokPerKg)}/Kg</strong>. Uang hasil penjualan akan diinput menyusul lewat menu <strong>Uang Masuk (+)</strong>.
                  </span>
                </label>
              </div>
            ) : (
              <DoubleCheckVerifikasiPanel
                direction="MASUK"
                metode={metodePembayaran}
                nominal={totalOmzetPutus}
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
            ))}

          {/* Actions */}
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
                  className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 cursor-pointer"
                >
                  Cek Ulang Input
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={submitting || !verifiedDoubleCheck}
                  className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-300 disabled:cursor-not-allowed text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Memproses...'
                      : isBelumPutusHarga
                      ? 'Ya, Simpan Muat & Kurangi Stok'
                      : 'Ya, Konfirmasi & Simpan Penjualan'}
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg border border-zinc-300 text-zinc-700 font-semibold hover:bg-zinc-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || blokirKarenaStok || beratBersih <= 0}
                  className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isBelumPutusHarga
                      ? 'Lanjut Verifikasi Muat Keluar →'
                      : 'Lanjut Verifikasi Rekening & Divisi →'}
                  </span>
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
