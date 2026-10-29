import React, { useState, useEffect, useMemo } from 'react';
import { X, Truck, Scale, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  Mitra,
  Rekening,
  StokHasilBumi,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
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

export const ModalJualHasilBumi: React.FC<Props> = ({
  isOpen,
  onClose,
  stokList,
  pembelianList,
  mitraList,
  rekeningList,
  initialKomoditasKode,
  onSuccess,
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
  const [potonganRafaksiStr, setPotonganRafaksiStr] = useState<string>('0');
  const [hargaJualDisplay, setHargaJualDisplay] = useState<string>('');
  const [modePembeli, setModePembeli] = useState<'MANUAL' | 'MITRA'>('MANUAL');
  const [idMitra, setIdMitra] = useState<string>('');
  const [namaPembeliManual, setNamaPembeliManual] = useState<string>('');
  const [metodePembayaran, setMetodePembayaran] = useState<'TUNAI' | 'TRANSFER' | 'PIUTANG'>('TRANSFER');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>('');
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
      setPotonganRafaksiStr('0');
      setHargaJualDisplay('');
      setModePembeli('MANUAL');
      setIdMitra(activeMitra[0]?.id || '');
      setNamaPembeliManual('');
      setMetodePembayaran(bankAccounts.length > 0 ? 'TRANSFER' : 'TUNAI');
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

  // Hitung modal rata-rata beli gudang secara riil (tanpa angka karangan)
  const modalRataRataPerKg = useMemo(() => {
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

    const totalUang = modalAwalUang + purchases.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
    const totalKg = stokAwalKg + purchases.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);

    if (totalKg > 0 && totalUang > 0) {
      return Math.round(totalUang / totalKg);
    }
    return Math.max(0, Number(selectedKomoditas.rataRataModalAwal) || 0);
  }, [selectedKomoditas, pembelianList]);

  const readyGudangKg = Math.max(0, Number(selectedKomoditas?.stok) || 0);
  const beratKotor = Math.max(0, parseFloat(beratKotorStr) || 0);
  const potonganRafaksi = Math.min(99.9, Math.max(0, parseFloat(potonganRafaksiStr) || 0));
  const beratBersih = Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;
  const hargaJualPerKg = parseRupiahInput(hargaJualDisplay);

  const melebihiStok = beratBersih > readyGudangKg;
  const sisaGudangSetelah = Math.max(0, Math.round((readyGudangKg - beratBersih) * 100) / 100);
  const totalOmzet = Math.round(beratBersih * hargaJualPerKg);
  const totalModalHpp = Math.round(beratBersih * modalRataRataPerKg);
  const estimasiLaba = totalOmzet - totalModalHpp;

  if (!isOpen) return null;

  const validateForm = (): boolean => {
    setErrorMsg('');
    if (!selectedKomoditas) {
      setErrorMsg('Pilih komoditas hasil bumi terlebih dahulu.');
      return false;
    }
    if (beratBersih <= 0) {
      setErrorMsg('Masukkan berat kotor timbangan lebih dari 0 Kg.');
      return false;
    }
    if (melebihiStok) {
      setErrorMsg(
        `Stok Ready Gudang (${readyGudangKg.toLocaleString('id-ID')} Kg) tidak mencukupi untuk penjualan ${beratBersih.toLocaleString('id-ID')} Kg.`
      );
      return false;
    }
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
      setErrorMsg('Harap centang verifikasi rekening uang riil & divisi terkait terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    try {
      const record = await api.processPenjualanHasilBumi({
        idMitra: modePembeli === 'MITRA' ? idMitra : 'UMUM',
        namaPembeliManual:
          modePembeli === 'MANUAL' ? namaPembeliManual.trim() || 'Pabrik / Pembeli Umum' : undefined,
        komoditasKode: selectedKomoditas.kode,
        beratKotor,
        potonganRafaksi,
        hargaJualPerKg,
        divisi,
        metodePembayaran,
        rekeningTujuan: metodePembayaran === 'TRANSFER' ? rekeningTujuan : undefined,
        noSuratJalan: noSuratJalan.trim() || undefined,
        tanggal: tanggalInput,
        keterangan: keterangan.trim() || undefined,
      });

      const receipt: ReceiptData = {
        title: 'NOTA PENJUALAN HASIL BUMI',
        subtitle: `Pengiriman Stok Keluar Gudang | Divisi: ${record.divisi || divisi}`,
        nomorTransaksi: record.noPenjualan,
        tanggal: record.tanggal,
        jam: record.jam,
        mitra: record.namaMitra,
        rekening: `${record.metodePembayaran} (${record.rekeningTujuan})`,
        kategori: 'PENJUALAN_HASIL_BUMI',
        total: record.totalNominal,
        items: [
          {
            nama: `${record.komoditasNama}${record.noSuratJalan ? ` [DO: ${record.noSuratJalan}]` : ''}`,
            qty: record.beratBersih,
            satuan: 'Kg',
            harga: record.hargaJualPerKg,
            subtotal: record.totalNominal,
          },
        ],
        detailRows: [
          { label: 'Divisi Terkait', value: record.divisi || divisi },
          { label: 'Rekening Uang Riil', value: `${record.metodePembayaran} (${record.rekeningTujuan})` },
          { label: 'Berat Kotor Timbangan', value: `${record.beratKotor.toLocaleString('id-ID')} Kg` },
          { label: 'Potongan Rafaksi', value: `${record.potonganRafaksi}%` },
          { label: 'Berat Bersih Keluar', value: `${record.beratBersih.toLocaleString('id-ID')} Kg`, highlight: true },
          { label: 'Stok Gudang Sebelum', value: `${record.stokGudangSebelum.toLocaleString('id-ID')} Kg` },
          { label: 'Sisa Ready di Gudang', value: `${record.stokGudangSetelah.toLocaleString('id-ID')} Kg` },
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
      <div className="bg-white rounded-2xl border border-zinc-200 w-full max-w-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/70">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-zinc-900 truncate">
                Jual / Kirim Stok Hasil Bumi Keluar Gudang
              </h2>
              <p className="text-[11px] text-zinc-500 truncate">
                Otomatis memotong stok Ready Gudang &amp; menghitung HPP murni dari rata-rata modal beli
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

        <form onSubmit={handleOpenStepVerifikasi} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pilih Komoditas & Tanggal */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Komoditas Hasil Bumi di Gudang
              </label>
              <select
                value={komoditasKode}
                onChange={(e) => setKomoditasKode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-medium focus:outline-none focus:border-emerald-600"
              >
                {activeKomoditas.map((hb) => (
                  <option key={hb.kode} value={hb.kode}>
                    {hb.kode} — {hb.nama} (Ready: {(hb.stok || 0).toLocaleString('id-ID')} {hb.satuan})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Tanggal Pengiriman / Jual
              </label>
              <input
                type="date"
                value={tanggalInput}
                onChange={(e) => setTanggalInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 font-mono tabular-nums focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Info Stok Ready & Modal Murni */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 truncate">
                Ready di Gudang Saat Ini
              </div>
              <div className="mt-1 text-base font-bold font-mono tabular-nums text-zinc-900 truncate whitespace-nowrap">
                {readyGudangKg.toLocaleString('id-ID')} Kg
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                {(readyGudangKg / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ton siap jual
              </div>
            </div>

            <div className="min-w-0 overflow-hidden p-3 rounded-lg bg-zinc-50 border border-zinc-200">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 truncate">
                Modal Rata-rata Gudang
              </div>
              <div
                className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-800 truncate whitespace-nowrap"
                title={`${formatRupiah(modalRataRataPerKg)} / Kg`}
              >
                {modalRataRataPerKg > 0 ? `${formatRupiahSingkat(modalRataRataPerKg)}/Kg` : 'Rp 0/Kg'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate" title={formatRupiah(modalRataRataPerKg)}>
                Acuan asli: {formatRupiah(modalRataRataPerKg)}/Kg
              </div>
            </div>

            <div
              className={`min-w-0 overflow-hidden p-3 rounded-lg border ${
                melebihiStok
                  ? 'bg-rose-50 border-rose-300'
                  : 'bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 truncate">
                Sisa Gudang Setelah Jual
              </div>
              <div
                className={`mt-1 text-base font-bold font-mono tabular-nums truncate whitespace-nowrap ${
                  melebihiStok ? 'text-rose-700' : 'text-emerald-900'
                }`}
              >
                {melebihiStok ? 'Stok Kurang!' : `${sisaGudangSetelah.toLocaleString('id-ID')} Kg`}
              </div>
              <div className="text-[10px] text-zinc-500 truncate">
                Keluar bersih: {beratBersih.toLocaleString('id-ID')} Kg
              </div>
            </div>
          </div>

          {/* Timbangan & Harga Jual */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-zinc-700">Berat Kotor (Kg)</label>
                {readyGudangKg > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBeratKotorStr(String(readyGudangKg));
                      setPotonganRafaksiStr('0');
                    }}
                    className="text-[10px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                  >
                    Jual Semua Ready
                  </button>
                )}
              </div>
              <div className="relative">
                <Scale className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Contoh: 2500"
                  value={beratKotorStr}
                  onChange={(e) => setBeratKotorStr(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-zinc-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Potongan Rafaksi (%)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max="99"
                placeholder="0"
                value={potonganRafaksiStr}
                onChange={(e) => setPotonganRafaksiStr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums text-zinc-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-zinc-700">Harga Jual Deal / Kg</label>
                {modalRataRataPerKg > 0 && (
                  <button
                    type="button"
                    onClick={() => setHargaJualDisplay(modalRataRataPerKg.toLocaleString('id-ID'))}
                    className="text-[10px] font-semibold text-zinc-600 hover:text-zinc-900 hover:underline cursor-pointer"
                  >
                    Isi = Modal
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="text-zinc-400 font-mono text-[11px] absolute left-3 top-2.5">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={
                    modalRataRataPerKg > 0
                      ? `Modal: ${modalRataRataPerKg.toLocaleString('id-ID')}`
                      : 'Contoh: 15.000'
                  }
                  value={hargaJualDisplay}
                  onChange={(e) => {
                    const num = parseRupiahInput(e.target.value);
                    setHargaJualDisplay(num > 0 ? num.toLocaleString('id-ID') : '');
                  }}
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-zinc-300 font-mono tabular-nums font-semibold text-zinc-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Pembeli & Metode Pembayaran */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-zinc-700">Pihak Pembeli / Pabrik</label>
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
                    Input Nama
                  </button>
                  <button
                    type="button"
                    onClick={() => setModePembeli('MITRA')}
                    className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                      modePembeli === 'MITRA' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'
                    }`}
                  >
                    Mitra Terdaftar
                  </button>
                </div>
              </div>

              {modePembeli === 'MANUAL' ? (
                <input
                  type="text"
                  placeholder="Ketik nama Pabrik / Eksportir / Bandar pembeli..."
                  value={namaPembeliManual}
                  onChange={(e) => setNamaPembeliManual(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600"
                />
              ) : (
                <select
                  value={idMitra}
                  onChange={(e) => setIdMitra(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-emerald-600"
                >
                  {activeMitra.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.role})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-zinc-700">
                Metode Penerimaan Pembayaran
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['TUNAI', 'TRANSFER', 'PIUTANG'] as const).map((mtd) => (
                  <button
                    key={mtd}
                    type="button"
                    onClick={() => {
                      setMetodePembayaran(mtd);
                      if (mtd === 'PIUTANG') setModePembeli('MITRA');
                    }}
                    className={`py-2 px-2 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                      metodePembayaran === mtd
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {mtd === 'TUNAI' ? 'Tunai (KAS01)' : mtd === 'TRANSFER' ? 'Transfer Bank' : 'Piutang Mitra'}
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

          {/* Pilih Arus Kas Divisi (Otomatis Tambah Saldo Divisi) */}
          <ArusKasDivisiSelectorCard
            direction="MASUK"
            metode={metodePembayaran}
            nominal={totalOmzet}
            divisi={divisi}
            divisiOptions={divisiOptions}
            onChangeDivisi={(d) => {
              setVerifiedDoubleCheck(false);
              setDivisi(d);
            }}
            rekeningList={rekeningList}
            theme="light"
          />

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
                placeholder="Keterangan kualitas, kadar air, tujuan kirim..."
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-zinc-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Ringkasan Kalkulasi Penjualan & Laba (Compact Rupiah - Anti Overflow) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-zinc-900 text-white">
            <div className="min-w-0 overflow-hidden">
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider truncate">
                Total Omzet Penjualan
              </div>
              <div
                className="text-base font-bold font-mono tabular-nums text-white truncate whitespace-nowrap mt-0.5"
                title={formatRupiah(totalOmzet)}
              >
                {formatRupiahSingkat(totalOmzet)}
              </div>
              <div className="text-[10px] text-zinc-400 font-mono tabular-nums truncate">
                {formatRupiah(totalOmzet)}
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
                {beratBersih.toLocaleString('id-ID')} Kg × {formatRupiahSingkat(modalRataRataPerKg)}
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

          {stepVerifikasi && (
            <DoubleCheckVerifikasiPanel
              direction="MASUK"
              metode={metodePembayaran}
              nominal={totalOmzet}
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
                  <span>{submitting ? 'Memproses...' : 'Ya, Konfirmasi & Simpan Penjualan'}</span>
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
                  disabled={submitting || melebihiStok || beratBersih <= 0}
                  className="px-5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:bg-zinc-300 text-white font-semibold flex items-center space-x-2 cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Lanjut Verifikasi Rekening &amp; Divisi →</span>
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
