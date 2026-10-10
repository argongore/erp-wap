import React, { useState, useEffect } from 'react';
import {
  Wheat,
  CheckCircle2,
  AlertCircle,
  Scale,
  Wallet,
  AlertTriangle,
  UserPlus,
  Coffee,
  Sparkles,
  Layers,
  History,
  Check,
  X,
  Search,
  Phone,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { Mitra, Rekening, StokHasilBumi, TransaksiPembelianHasilBumi } from '../../server/types.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalInputStokAwalHasilBumi } from '../stok/ModalInputStokAwalHasilBumi.tsx';

interface Props {
  stokHasilBumiList: StokHasilBumi[];
  mitraList: Mitra[];
  rekeningList: Rekening[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const PembelianHasilBumiView: React.FC<Props> = ({
  stokHasilBumiList,
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
}) => {
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');
  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );
  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');

  const [selectedMitraId, setSelectedMitraId] = useState<string>(activeMitras[0]?.id || '');
  // Mode Petani: 'UMUM' (Input nama manual untuk umum) vs 'TERDAFTAR' (Mitra terdaftar)
  const [tipePetani, setTipePetani] = useState<'UMUM' | 'TERDAFTAR'>('UMUM');
  const [namaPetaniManual, setNamaPetaniManual] = useState<string>('');
  const [teleponPetaniManual, setTeleponPetaniManual] = useState<string>('');
  const [alamatPetaniManual, setAlamatPetaniManual] = useState<string>('');

  const [selectedKomoditasKode, setSelectedKomoditasKode] = useState<string>(
    stokHasilBumiList[0]?.kode || 'HB-01'
  );

  const [beratKotorInput, setBeratKotorInput] = useState<string>('1000');
  const [rafaksiInput, setRafaksiInput] = useState<string>('3');
  const [hargaPerKgInput, setHargaPerKgInput] = useState<string>(
    stokHasilBumiList[0]?.hargaBeliStandar?.toString() || '42000'
  );

  // Belum Putus Harga state (Auto-active for HB-08 KOPI TITIP)
  const [isBelumPutusHarga, setIsBelumPutusHarga] = useState<boolean>(false);

  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'TITIP'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('BNI01');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoNota, setFotoNota] = useState<string>('');
  const [isNotaLalu, setIsNotaLalu] = useState<boolean>(false);
  const [noNotaLalu, setNoNotaLalu] = useState<string>('');
  const [tanggalNotaLalu, setTanggalNotaLalu] = useState<string>(getWIBTodayString());

  // Quick Add Mitra Modal
  const [showQuickAddMitra, setShowQuickAddMitra] = useState<boolean>(false);
  const [newMitraNama, setNewMitraNama] = useState<string>('');
  const [newMitraTelepon, setNewMitraTelepon] = useState<string>('');
  const [newMitraAlamat, setNewMitraAlamat] = useState<string>('');
  const [newMitraRole, setNewMitraRole] = useState<'MITRA_TANI' | 'CUSTOMER' | 'SUPPLIER'>('MITRA_TANI');
  const [isSavingMitra, setIsSavingMitra] = useState<boolean>(false);

  // Putus Harga Modal State
  const [allTransactions, setAllTransactions] = useState<TransaksiPembelianHasilBumi[]>([]);
  const [loadingTx, setLoadingTx] = useState<boolean>(false);
  const [putusHargaModal, setPutusHargaModal] = useState<{
    open: boolean;
    tx?: TransaksiPembelianHasilBumi;
    hargaDeal: string;
    metode: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekening: string;
  }>({
    open: false,
    hargaDeal: '',
    metode: 'TUNAI',
    rekening: 'BNI01',
  });
  const [isSavingPutusHarga, setIsSavingPutusHarga] = useState<boolean>(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Saldo Awal / Rekap Manual Modal state
  const [showSaldoAwalModal, setShowSaldoAwalModal] = useState<boolean>(false);
  const [selectedSaldoAwalKode, setSelectedSaldoAwalKode] = useState<string | undefined>(undefined);

  // Keep selectedMitraId synced when activeMitras changes
  useEffect(() => {
    if (!selectedMitraId && activeMitras.length > 0) {
      setSelectedMitraId(activeMitras[0].id);
    }
  }, [activeMitras, selectedMitraId]);

  // Load existing transactions to show pending Belum Putus Harga lots
  const loadTransactions = async () => {
    setLoadingTx(true);
    try {
      const data = await api.getPembelianHasilBumi();
      setAllTransactions(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, []);

  const selectedKomoditas = stokHasilBumiList.find((k) => k.kode === selectedKomoditasKode);
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);

  // Smart suggestion for manual farmer name vs registered contacts
  const queryPetani = namaPetaniManual.trim().toLowerCase();
  const matchingMitras = queryPetani.length >= 1
    ? mitraList.filter(
        (m) =>
          m.status === 'AKTIF' &&
          (m.nama.toLowerCase().includes(queryPetani) ||
            m.kode.toLowerCase().includes(queryPetani) ||
            (m.telepon && m.telepon.includes(queryPetani)))
      )
    : [];

  // Ongoing purchases & balance for the selected commodity
  const pembelianBerjalanKomoditas = allTransactions.filter(
    (p) =>
      p.komoditasKode === selectedKomoditasKode ||
      p.komoditasNama.toUpperCase().trim() === selectedKomoditas?.nama?.toUpperCase()?.trim()
  );
  const pembelianBerjalanKomoditasKg = pembelianBerjalanKomoditas.reduce((s, p) => s + (p.beratBersih || 0), 0);
  const pembelianBerjalanKomoditasNominal = pembelianBerjalanKomoditas.reduce((s, p) => s + (p.totalNominal || 0), 0);

  const modalAwalKg = selectedKomoditas?.stokAwal || 0;
  const modalAwalRp = selectedKomoditas?.rataRataModalAwal || 0;
  const modalAwalNominal = selectedKomoditas?.modalAwalTotal || (modalAwalKg * modalAwalRp);

  const totalBalancedKg = modalAwalKg + pembelianBerjalanKomoditasKg;
  const totalBalancedNominal = modalAwalNominal + pembelianBerjalanKomoditasNominal;
  const rataRataModalBalanced =
    totalBalancedKg > 0 && totalBalancedNominal > 0
      ? Math.round(totalBalancedNominal / totalBalancedKg)
      : modalAwalRp || selectedKomoditas?.hargaBeliStandar || 0;

  // Calculations
  const beratKotor = Number(beratKotorInput) || 0;
  const rafaksi = Number(rafaksiInput) || 0;
  const beratBersih = Math.max(0, Math.round(beratKotor * (1 - rafaksi / 100) * 100) / 100);
  const hargaPerKg = Number(hargaPerKgInput) || 0;
  const totalTagihan = Math.round(beratBersih * hargaPerKg);

  const handleKomoditasChange = (kode: string) => {
    setSelectedKomoditasKode(kode);
    const kom = stokHasilBumiList.find((k) => k.kode === kode);
    if (kom) {
      const isKopiTitip = kom.kode === 'HB-08' || kom.isBelumPutusHarga || kom.nama.toUpperCase().includes('TITIP');
      setIsBelumPutusHarga(isKopiTitip);
      if (isKopiTitip) {
        setMetode('TITIP');
        setHargaPerKgInput(kom.hargaBeliStandar ? kom.hargaBeliStandar.toString() : '0');
      } else {
        setHargaPerKgInput(kom.hargaBeliStandar.toString());
      }
    }
  };

  const handleQuickAddMitraSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMitraNama.trim()) return;
    setIsSavingMitra(true);
    try {
      const created = await api.createMitra({
        nama: newMitraNama.trim(),
        role: newMitraRole,
        telepon: newMitraTelepon.trim() || '-',
        alamat: newMitraAlamat.trim() || '-',
        catatan: 'Dibuat saat timbang pembelian hasil bumi',
      });
      setShowQuickAddMitra(false);
      setNewMitraNama('');
      setNewMitraTelepon('');
      setNewMitraAlamat('');
      onRefresh();
      if (created?.id) {
        setSelectedMitraId(created.id);
      }
    } catch (err: any) {
      alert(err.message || 'Gagal menambah mitra');
    } finally {
      setIsSavingMitra(false);
    }
  };

  const handlePutusHargaSubmit = async () => {
    if (!putusHargaModal.tx) return;
    const dealPrice = Number(putusHargaModal.hargaDeal) || 0;
    if (dealPrice <= 0) {
      alert('Masukkan harga deal per Kg yang valid (> 0)');
      return;
    }
    setIsSavingPutusHarga(true);
    try {
      await api.putusHargaHasilBumi({
        noPembelian: putusHargaModal.tx.noPembelian,
        hargaDealPerKg: dealPrice,
        metodePembayaran: putusHargaModal.metode,
        rekeningSumber: putusHargaModal.metode === 'TRANSFER' ? putusHargaModal.rekening : undefined,
      });
      setPutusHargaModal({ open: false, hargaDeal: '', metode: 'TUNAI', rekening: 'BNI01' });
      onRefresh();
      loadTransactions();
    } catch (err: any) {
      alert(err.message || 'Gagal memutus harga');
    } finally {
      setIsSavingPutusHarga(false);
    }
  };

  const handleProcessSubmit = async () => {
    setErrorMsg('');
    if (tipePetani === 'TERDAFTAR' && !selectedMitraId && activeMitras.length === 0) {
      setErrorMsg('Harap tambahkan data Petani / Mitra terlebih dahulu atau gunakan opsi Petani Umum');
      return;
    }
    if (tipePetani === 'TERDAFTAR' && !selectedMitraId) {
      setErrorMsg('Harap pilih Petani / Mitra terdaftar atau gunakan opsi Petani Umum');
      return;
    }
    if (beratKotor <= 0) {
      setErrorMsg('Berat kotor timbangan harus lebih dari 0 kg');
      return;
    }
    if (!isBelumPutusHarga && hargaPerKg <= 0) {
      setErrorMsg('Harga per kg harus lebih dari Rp 0 (atau centang Belum Putus Harga)');
      return;
    }

    setSubmitting(true);
    try {
      const farmerDisplayName =
        tipePetani === 'UMUM'
          ? (namaPetaniManual.trim() || 'Petani Umum')
          : (selectedMitra?.nama || 'Petani');

      const finalKet =
        keterangan ||
        (isBelumPutusHarga
          ? `Pembelian ${selectedKomoditas?.nama || 'Hasil Bumi'} dari ${farmerDisplayName} - Belum Putus Harga (Titip Panen)`
          : isNotaLalu
          ? `Nota Lalu: Titipan ${selectedKomoditas?.nama || 'Hasil Panen'} dari ${farmerDisplayName}`
          : undefined);

      const result: TransaksiPembelianHasilBumi = await api.processPembelianHasilBumi({
        idMitra: tipePetani === 'UMUM' ? 'UMUM' : selectedMitraId,
        namaPetaniManual: tipePetani === 'UMUM' ? (namaPetaniManual.trim() || 'Petani Umum') : undefined,
        teleponPetaniManual: tipePetani === 'UMUM' ? (teleponPetaniManual.trim() || undefined) : undefined,
        alamatPetaniManual: tipePetani === 'UMUM' ? (alamatPetaniManual.trim() || undefined) : undefined,
        komoditasKode: selectedKomoditasKode,
        beratKotor,
        potonganRafaksi: rafaksi,
        hargaPerKg: isBelumPutusHarga ? hargaPerKg : hargaPerKg,
        isBelumPutusHarga,
        fotoNota: fotoNota || undefined,
        isNotaLalu,
        noNotaLalu: isNotaLalu ? noNotaLalu.trim() || undefined : undefined,
        tanggalNotaLalu: isNotaLalu ? tanggalNotaLalu.trim() || undefined : undefined,
        metodePembayaran: isBelumPutusHarga ? 'TITIP' : metode,
        rekeningSumber: metode === 'TRANSFER' ? rekeningSumber : undefined,
        keterangan: finalKet,
      });

      setShowConfirmModal(false);
      setFotoNota('');
      setIsNotaLalu(false);
      setNoNotaLalu('');
      if (tipePetani === 'UMUM') {
        setNamaPetaniManual('');
        setTeleponPetaniManual('');
        setAlamatPetaniManual('');
      }
      onRefresh();
      loadTransactions();

      const receipt: ReceiptData = {
        title: isBelumPutusHarga
          ? 'SLIP TITIP TIMBANG HASIL BUMI (BELUM PUTUS HARGA)'
          : 'SLIP PEMBELIAN HASIL BUMI',
        subtitle: isBelumPutusHarga
          ? 'STATUS: TITIP TIMBANG - HARGA MENGAMBANG'
          : `Metode: ${result.metodePembayaran} (${result.status})`,
        nomorTransaksi: result.noPembelian,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra || farmerDisplayName,
        rekening: result.rekeningSumber,
        kategori: 'PEMBELIAN_HASIL_BUMI',
        fotoNota: result.fotoNota || fotoNota,
        detailRows: [
          { label: 'Komoditas', value: result.komoditasNama },
          { label: 'Berat Timbangan Kotor', value: `${result.beratKotor.toLocaleString('id-ID')} Kg` },
          { label: 'Potongan Rafaksi / Kadar Air', value: `${result.potonganRafaksi}%` },
          { label: 'Berat Bersih Diterima', value: `${result.beratBersih.toLocaleString('id-ID')} Kg`, highlight: true },
          {
            label: 'Harga Satuan / Kg',
            value: isBelumPutusHarga ? 'Belum Putus (Mengambang)' : formatRupiah(result.hargaPerKg),
          },
          { label: 'Status Harga', value: result.statusHarga || (isBelumPutusHarga ? 'BELUM_PUTUS_HARGA' : 'HARGA_PUTUS') },
          { label: 'Lampiran Foto Fisik', value: result.fotoNota || fotoNota ? '✅ Tersimpan' : 'Tidak Ada' },
          { label: 'Metode Pembayaran', value: result.metodePembayaran },
          { label: 'Rekening Pengeluaran / Status', value: `${result.rekeningSumber} (${result.status})` },
          {
            label: isBelumPutusHarga ? 'Total Tagihan Sementara' : 'Total Pembayaran',
            value: isBelumPutusHarga ? 'Rp 0 (Mengambang)' : result.totalNominal,
            isTotal: true,
          },
        ],
        catatan: result.keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pembelian hasil bumi');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingBelumPutus = allTransactions.filter(
    (t) => t.isBelumPutusHarga || t.status === 'BELUM_PUTUS_HARGA' || t.statusHarga === 'BELUM_PUTUS_HARGA'
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Kasir Pembelian Hasil Bumi</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              MODUL 2.B
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Penimbangan, pemotongan rafaksi, dan pembayaran hasil panen petani (Tunai, Transfer, Titip)
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => {
              setSelectedSaldoAwalKode(selectedKomoditasKode);
              setShowSaldoAwalModal(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer shrink-0"
            title="Input stok yang sudah direkap manual sebelum aplikasi & rata-rata pembelian awal"
          >
            <Scale className="w-4 h-4 text-amber-200" />
            <span>Input Rekap Stok Lama &amp; Rata-rata Beli</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Timbangan & Komoditas */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mitra / Supplier Selector with Umum vs Terdaftar Options */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
                1. Identitas Petani / Penjual Hasil Bumi <span className="text-rose-500">*</span>
              </label>

              {/* Toggle Opsi Umum vs Terdaftar */}
              <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTipePetani('UMUM')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    tipePetani === 'UMUM'
                      ? 'bg-amber-700 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  🌾 Petani Umum (Input Nama)
                </button>
                <button
                  type="button"
                  onClick={() => setTipePetani('TERDAFTAR')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    tipePetani === 'TERDAFTAR'
                      ? 'bg-amber-700 text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  👥 Mitra Terdaftar
                </button>
              </div>
            </div>

            {tipePetani === 'UMUM' ? (
              <div className="space-y-2.5 p-3 bg-amber-50/50 rounded-lg border border-amber-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-zinc-700">
                      Nama Petani / Penjual Bebas (Umum) <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-amber-900 font-semibold bg-amber-100 px-2 py-0.5 rounded">
                      TIDAK HARUS MITRA TERDAFTAR
                    </span>
                  </div>
                  <input
                    type="text"
                    value={namaPetaniManual}
                    onChange={(e) => setNamaPetaniManual(e.target.value)}
                    placeholder="Contoh: Bpk. Mulyadi / Petani Desa Sukamaju / Pak Hasan (Kosongkan = Petani Umum)"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium bg-white focus:ring-1 focus:ring-amber-600 focus:border-amber-600"
                  />

                  {/* Smart Autocomplete / Suggestions for Matching Registered Contacts */}
                  {matchingMitras.length > 0 && (
                    <div className="mt-2 p-2.5 bg-amber-100/90 border border-amber-300 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-amber-950 flex items-center space-x-1">
                          <Search className="w-3.5 h-3.5 text-amber-700" />
                          <span>Ditemukan {matchingMitras.length} Rekanan Terdaftar dengan nama serupa:</span>
                        </span>
                        <span className="text-[10px] text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded font-mono">
                          SUGESTI DATABASE
                        </span>
                      </div>

                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {matchingMitras.map((m) => {
                          const roleLabel =
                            m.role === 'MITRA_TANI'
                              ? '🌾 Mitra Tani / Petani'
                              : m.role === 'SUPPLIER'
                              ? '🏢 Supplier Pemasok'
                              : m.role === 'CUSTOMER'
                              ? '🛒 Customer / Pembeli'
                              : '🔄 Rekanan';

                          return (
                            <div
                              key={m.id}
                              className="p-2 bg-white rounded-lg border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold text-xs text-zinc-900">{m.nama}</span>
                                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 bg-zinc-100 text-zinc-600 rounded">
                                    {m.kode}
                                  </span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded">
                                    {roleLabel}
                                  </span>
                                </div>
                                <div className="text-[10px] text-zinc-500 flex items-center space-x-2">
                                  {m.telepon && m.telepon !== '-' && (
                                    <span className="flex items-center space-x-0.5">
                                      <Phone className="w-3 h-3 text-zinc-400" />
                                      <span>{m.telepon}</span>
                                    </span>
                                  )}
                                  {m.alamat && m.alamat !== '-' && (
                                    <span className="flex items-center space-x-0.5">
                                      <MapPin className="w-3 h-3 text-zinc-400" />
                                      <span>{m.alamat}</span>
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center space-x-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTipePetani('TERDAFTAR');
                                    setSelectedMitraId(m.id);
                                  }}
                                  className="px-2 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded text-[11px] font-bold shadow-2xs flex items-center space-x-1 cursor-pointer transition-colors"
                                  title="Gunakan akun mitra terdaftar ini untuk transaksi"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Gunakan Akun Terdaftar Ini</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNamaPetaniManual(m.nama);
                                    if (m.telepon && m.telepon !== '-') setTeleponPetaniManual(m.telepon);
                                    if (m.alamat && m.alamat !== '-') setAlamatPetaniManual(m.alamat);
                                  }}
                                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded text-[11px] font-medium border border-zinc-300 cursor-pointer transition-colors"
                                  title="Pakai nama ini saja tanpa mencatat ke akun mitra"
                                >
                                  <span>Gunakan Nama Saja (Tetap Umum)</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unregistered notification badge */}
                  {queryPetani.length >= 2 && matchingMitras.length === 0 && (
                    <div className="mt-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Nama <strong>"{namaPetaniManual}"</strong> belum terdaftar di database Mitra. Transaksi akan disimpan murni sebagai <strong>Petani Umum (Non-Terdaftar)</strong> tanpa menambah daftar Master Mitra.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewMitraNama(namaPetaniManual);
                          setNewMitraTelepon(teleponPetaniManual);
                          setNewMitraAlamat(alamatPetaniManual);
                          setShowQuickAddMitra(true);
                        }}
                        className="text-[10px] font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded border border-amber-300 shrink-0 cursor-pointer"
                      >
                        + Daftarkan ke Mitra jika Mau
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">No. HP / WhatsApp (Opsional)</label>
                    <input
                      type="text"
                      value={teleponPetaniManual}
                      onChange={(e) => setTeleponPetaniManual(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-zinc-500 mb-0.5">Asal Desa / Lokasi Kebun (Opsional)</label>
                    <input
                      type="text"
                      value={alamatPetaniManual}
                      onChange={(e) => setAlamatPetaniManual(e.target.value)}
                      placeholder="Contoh: Dusun Karangrejo / Pagar Alam"
                      className="w-full px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-amber-900 flex items-center space-x-1.5 pt-1">
                  <span className="font-bold">✓ Rekap Otomatis:</span>
                  <span>
                    Data timbangan ini otomatis masuk ke <strong>Rekapan Pembelian Hasil Bumi</strong> sesuai komoditas ({selectedKomoditas?.nama || 'Kopi/dll'}) atas nama penjual ini.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Pilih dari Database Mitra Terdaftar:</span>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddMitra(true)}
                    className="text-[11px] flex items-center space-x-1 text-emerald-800 font-bold hover:text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Daftarkan Mitra Baru</span>
                  </button>
                </div>

                {activeMitras.length === 0 ? (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-300 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="font-bold">⚠️ Belum Ada Petani / Mitra Terdaftar di Database</span>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Anda dapat langsung gunakan opsi <strong>Petani Umum (Input Nama)</strong> di atas atau input data ke master.
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setTipePetani('UMUM')}
                        className="px-2.5 py-1 bg-amber-700 text-white font-bold rounded-lg hover:bg-amber-800 text-xs shadow-xs shrink-0"
                      >
                        Pakai Opsi Umum
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowQuickAddMitra(true)}
                        className="px-2.5 py-1 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 text-xs shadow-xs shrink-0"
                      >
                        + Tambah Mitra
                      </button>
                    </div>
                  </div>
                ) : (
                  <select
                    value={selectedMitraId}
                    onChange={(e) => setSelectedMitraId(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-600"
                  >
                    {activeMitras.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nama} ({m.kode}) - {m.role} - {m.telepon}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Commodity & Weighing Details */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
                2. Data Penimbangan &amp; Mutu Komoditas
              </label>
              {selectedKomoditasKode === 'HB-08' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center space-x-1">
                  <Coffee className="w-3 h-3 text-amber-700" />
                  <span>NO 8: KOPI TITIP (BELUM PUTUS HARGA)</span>
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Jenis Hasil Bumi (1 s/d 8)</label>
              <select
                value={selectedKomoditasKode}
                onChange={(e) => handleKomoditasChange(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-600"
              >
                {stokHasilBumiList.map((hb, idx) => (
                  <option key={hb.kode} value={hb.kode}>
                    No {idx + 1}. {hb.nama} ({hb.kode}) — Stok: {hb.stok.toLocaleString('id-ID')} {hb.satuan}{' '}
                    {hb.isBelumPutusHarga || hb.kode === 'HB-08' ? '★ BELUM PUTUS HARGA' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Balance & Rekap Lama Status for the Selected Commodity */}
            <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-zinc-900">
                    Status Stok &amp; Modal: {selectedKomoditas?.nama}
                  </span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full font-mono">
                    FISIK GUDANG: {selectedKomoditas?.stok.toLocaleString('id-ID')} Kg
                  </span>
                </div>
                <div className="text-[11px] text-zinc-600 flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
                  <span>
                    • Saldo Rekap Lama: <strong>{modalAwalKg.toLocaleString('id-ID')} Kg</strong>
                    {modalAwalRp > 0 ? ` @ ${formatRupiah(modalAwalRp)}/Kg` : ''}
                  </span>
                  <span>
                    • Beli Berjalan Realtime: <strong>{pembelianBerjalanKomoditasKg.toLocaleString('id-ID')} Kg</strong> ({pembelianBerjalanKomoditas.length} Nota)
                  </span>
                  <span>
                    • Rata-rata Gabungan: <strong className="text-emerald-800 font-mono">{rataRataModalBalanced > 0 ? `${formatRupiah(rataRataModalBalanced)}/Kg` : '-'}</strong>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedSaldoAwalKode(selectedKomoditasKode);
                  setShowSaldoAwalModal(true);
                }}
                className="px-3 py-1.5 bg-amber-800 hover:bg-amber-900 text-white rounded-lg font-bold text-[11px] flex items-center space-x-1.5 shrink-0 cursor-pointer shadow-2xs transition-colors"
                title="Input atau ubah stok lama yang direkap manual sebelum aplikasi dan rata-rata pembelian awal"
              >
                <Scale className="w-3.5 h-3.5 text-amber-200" />
                <span>Input Rekap Stok Lama {selectedKomoditas?.nama}</span>
              </button>
            </div>

            {/* Banner Khusus Kopi Titip / Belum Putus Harga */}
            {isBelumPutusHarga && (
              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-amber-900">
                  <Coffee className="w-4 h-4 text-amber-700" />
                  <span>☕ KOPI TITIP — BELUM PUTUS HARGA (TITIP PANEN PETANI)</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Barang hasil panen kopi masuk gudang &amp; ditimbang akurat. Harga per Kg mengambang / menunggu putus harga dengan petani.
                  Tidak memotong kas hari ini. Nanti jika harga sepakat, dapat diproses lewat tombol <strong>Putus Harga</strong>.
                </p>
              </div>
            )}

            {/* Checkbox toggle manual Belum Putus Harga */}
            <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-200">
              <label className="flex items-center space-x-2 cursor-pointer text-xs font-semibold text-zinc-800">
                <input
                  type="checkbox"
                  checked={isBelumPutusHarga}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsBelumPutusHarga(checked);
                    if (checked) {
                      setMetode('TITIP');
                    }
                  }}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                />
                <span>⚖ Tandai Transaksi Belum Putus Harga (Titip Panen / Harga Mengambang)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Berat Kotor Timbang (Kg) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={beratKotorInput}
                    onChange={(e) => setBeratKotorInput(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                  />
                  <Scale className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Potongan Rafaksi (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={rafaksiInput}
                  onChange={(e) => setRafaksiInput(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Harga Beli / Kg (Rp) {isBelumPutusHarga ? '(Opsional/Rp 0)' : <span className="text-rose-500">*</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  value={hargaPerKgInput}
                  onChange={(e) => setHargaPerKgInput(e.target.value)}
                  placeholder={isBelumPutusHarga ? '0 (Mengambang)' : 'Harga per kg'}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                />
                {isBelumPutusHarga && (
                  <span className="text-[10px] text-amber-700 mt-0.5 block font-medium">
                    *Bisa diisi Rp 0 (harga disepakati nanti)
                  </span>
                )}
              </div>
            </div>

            {/* Calculated Weight Result Card */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between text-xs">
              <div>
                <span className="text-zinc-600">Berat Bersih Dihitung:</span>
                <div className="text-base font-bold text-amber-900 font-mono">
                  {beratBersih.toLocaleString('id-ID')} Kg
                </div>
                <div className="text-[10px] text-zinc-500">
                  Potongan susut/kotor: {((beratKotor * rafaksi) / 100).toFixed(1)} Kg
                </div>
              </div>
              <div className="text-right">
                <span className="text-zinc-600">Total Nominal Pembelian:</span>
                <div className="text-lg font-bold text-zinc-900">
                  {isBelumPutusHarga && totalTagihan === 0 ? 'Rp 0 (Mengambang)' : formatRupiah(totalTagihan)}
                </div>
                {isBelumPutusHarga && (
                  <span className="text-[10px] text-amber-700 font-medium">Status: Belum Putus Harga</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Keterangan / Nomor Kendaraan</label>
              <input
                type="text"
                placeholder="Misal: Truk Colt Diesel Plat AB 1234 CD / Kopi Titip Panen Kebun Barat"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* Right Form: Payment Method & Source Account */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
              3. Metode Pembayaran Hasil Panen
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMetode('TUNAI')}
                className={`py-2 px-2 text-center rounded-lg font-semibold text-xs border transition-all ${
                  metode === 'TUNAI'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                }`}
              >
                Tunai (KAS01)
              </button>

              <button
                type="button"
                onClick={() => setMetode('TRANSFER')}
                className={`py-2 px-2 text-center rounded-lg font-semibold text-xs border transition-all ${
                  metode === 'TRANSFER'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                }`}
              >
                Transfer Bank
              </button>

              <button
                type="button"
                onClick={() => setMetode('TITIP')}
                className={`py-2 px-2 text-center rounded-lg font-semibold text-xs border transition-all ${
                  metode === 'TITIP'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                }`}
              >
                Titip / Hutang
              </button>
            </div>

            {metode === 'TUNAI' && (
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Rekening Sumber Kas:</span>
                  <span className="font-mono font-bold text-zinc-900">KAS01 (Kas Utama Kasir)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Saldo Kas Saat Ini:</span>
                  <span className="font-bold text-emerald-800">{formatRupiah(kas01?.saldoSaatIni || 0)}</span>
                </div>
                {(kas01?.saldoSaatIni || 0) < totalTagihan && (
                  <div className="text-[11px] text-rose-600 font-semibold pt-1 border-t border-zinc-200">
                    ⚠ Saldo KAS01 tidak mencukupi untuk pembayaran tunai ini!
                  </div>
                )}
              </div>
            )}

            {metode === 'TRANSFER' && (
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs space-y-2">
                <label className="block font-semibold text-sky-900">Pilih Rekening Bank Pengeluaran:</label>
                <select
                  value={rekeningSumber}
                  onChange={(e) => setRekeningSumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-sky-300 rounded bg-white text-xs font-medium"
                >
                  {availableBanks.map((b) => (
                    <option key={b.kode} value={b.kode}>
                      {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {metode === 'TITIP' && (
              <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-950 space-y-2.5">
                <div>
                  <div className="font-bold flex items-center justify-between">
                    <span>Konsep Titip / Belum Diambil:</span>
                    <span className="px-1.5 py-0.2 bg-purple-200 text-purple-900 rounded text-[10px] font-mono">
                      TIT01 (Hutang Supplier)
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-900 mt-0.5">
                    Hasil bumi masuk ke persediaan gudang, namun dana belum dibayarkan kepada petani (pembayaran ditangguhkan).
                    Tersinkronisasi ke rekening virtual <strong>TIT01</strong> dan dicatat di Rekening Koran Mitra.
                  </p>
                </div>

                {/* Checkbox Tandai Sebagai Titip Nota Lalu */}
                <div className="pt-2 border-t border-purple-200/80">
                  <label className="flex items-center space-x-2 cursor-pointer font-semibold text-purple-950">
                    <input
                      type="checkbox"
                      checked={isNotaLalu}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIsNotaLalu(checked);
                        if (checked && !noNotaLalu) {
                          setNoNotaLalu(`NL-TTP-${Date.now().toString().slice(-4)}`);
                        }
                      }}
                      className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                    />
                    <span>📑 Tandai Sebagai Titip Uang / Panen Nota Lalu (Catatan Masa Lalu)</span>
                  </label>

                  {isNotaLalu && (
                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 bg-white/80 rounded-lg border border-purple-300">
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-700 mb-0.5">
                          No. Nota / Faktur Fisik Manual:
                        </label>
                        <input
                          type="text"
                          value={noNotaLalu}
                          onChange={(e) => setNoNotaLalu(e.target.value)}
                          placeholder="Misal: NL-PANEN-2023-01"
                          className="w-full px-2 py-1 text-xs border border-zinc-300 rounded font-mono font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-zinc-700 mb-0.5">
                          Tanggal Nota Lalu (Bisa Mundur):
                        </label>
                        <input
                          type="text"
                          value={tanggalNotaLalu}
                          onChange={(e) => setTanggalNotaLalu(e.target.value)}
                          placeholder="DD/MM/YYYY"
                          className="w-full px-2 py-1 text-xs border border-zinc-300 rounded font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Insert Image Nota Timbangan / Slip Panen */}
            <div className="pt-2 border-t border-zinc-200">
              <ImageUploadZone
                label="Sisipkan / Upload Foto Nota Timbangan / Slip Panen Fisik"
                sublabel="Lampirkan foto tiket jembatan timbang, surat jalan, atau nota fisik petani (tersimpan permanen di database)"
                value={fotoNota}
                onChange={setFotoNota}
              />
            </div>

            {/* Total Recap Card */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Komoditas:</span>
                <span className="font-semibold text-zinc-900">{selectedKomoditas?.nama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Berat Bersih:</span>
                <span className="font-bold font-mono text-zinc-900">{beratBersih.toLocaleString('id-ID')} Kg</span>
              </div>
              <div className="flex justify-between text-base font-bold text-zinc-900 pt-2 border-t border-zinc-200">
                <span>Total Biaya Pembelian:</span>
                <span className="text-amber-900">{formatRupiah(totalTagihan)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={beratBersih <= 0 || (!isBelumPutusHarga && totalTagihan <= 0)}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2"
            >
              {isBelumPutusHarga ? (
                <>
                  <Coffee className="w-4 h-4" />
                  <span>Simpan Titip Timbang ({beratBersih.toLocaleString('id-ID')} Kg - Belum Putus Harga)</span>
                </>
              ) : (
                <>
                  <Scale className="w-4 h-4" />
                  <span>Simpan &amp; Proses Timbangan ({formatRupiah(totalTagihan)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Section: Daftar Lot Belum Putus Harga (Kopi Titip / Panen Mengambang) */}
      <div className="bg-white rounded-xl border border-amber-200/80 shadow-2xs overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Coffee className="w-5 h-5 text-amber-700" />
            <div>
              <h2 className="text-sm font-bold text-amber-950">
                Daftar Titip Panen Belum Putus Harga (Kopi Titip / Harga Mengambang)
              </h2>
              <p className="text-[11px] text-amber-800">
                Stok fisik sudah ada di gudang. Lakukan kesepakatan harga dengan petani melalui tombol &quot;Putus Harga&quot;.
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 bg-amber-100 text-amber-900 font-bold rounded-full self-start sm:self-auto border border-amber-300">
            {pendingBelumPutus.length} Lot Menunggu Putus Harga
          </span>
        </div>

        {pendingBelumPutus.length === 0 ? (
          <div className="p-8 text-center text-zinc-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            <span>Semua lot hasil bumi telah putus harga / belum ada titip timbang yang tertunda.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">No. Transaksi</th>
                  <th className="py-2.5 px-3">Tanggal</th>
                  <th className="py-2.5 px-3">Petani / Supplier</th>
                  <th className="py-2.5 px-3">Komoditas</th>
                  <th className="py-2.5 px-3 text-right">Berat Bersih (Kg)</th>
                  <th className="py-2.5 px-3">Status Harga</th>
                  <th className="py-2.5 px-3 text-center">Aksi Finalisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {pendingBelumPutus.map((tx) => (
                  <tr key={tx.noPembelian} className="hover:bg-amber-50/40">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-900">{tx.noPembelian}</td>
                    <td className="py-2.5 px-3 text-zinc-600">{tx.tanggal} {tx.jam}</td>
                    <td className="py-2.5 px-3 font-medium text-zinc-900">{tx.namaMitra}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-zinc-800">{tx.komoditasNama}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900">
                      {tx.beratBersih.toLocaleString('id-ID')} Kg
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        BELUM PUTUS HARGA
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setPutusHargaModal({
                            open: true,
                            tx,
                            hargaDeal: tx.hargaPerKg > 0 ? tx.hargaPerKg.toString() : '42000',
                            metode: 'TUNAI',
                            rekening: 'BNI01',
                          })
                        }
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-2xs transition-colors flex items-center space-x-1 mx-auto"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>⚡ Putus Harga Sekarang</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-amber-800 text-white font-bold text-sm flex justify-between items-center">
              <span>{isBelumPutusHarga ? 'Konfirmasi Titip Timbang (Belum Putus)' : 'Konfirmasi Pembelian Hasil Bumi'}</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-amber-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Petani / Supplier:</span>
                  <span className="font-bold text-zinc-900">
                    {tipePetani === 'UMUM'
                      ? `${namaPetaniManual.trim() || 'Petani Umum'} (UMUM)`
                      : `${selectedMitra?.nama || 'Petani'} (TERDAFTAR)`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Komoditas:</span>
                  <span className="font-semibold text-zinc-900">{selectedKomoditas?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Berat Bersih:</span>
                  <span className="font-bold font-mono">{beratBersih.toLocaleString('id-ID')} Kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Status Harga:</span>
                  <span className="font-bold text-amber-800">
                    {isBelumPutusHarga ? 'BELUM PUTUS HARGA (MENGAMBANG)' : formatRupiah(hargaPerKg) + ' / Kg'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Total Nilai Tagihan:</span>
                  <span className="font-bold text-sm text-zinc-900">
                    {isBelumPutusHarga && totalTagihan === 0 ? 'Rp 0 (Mengambang)' : formatRupiah(totalTagihan)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium"
                >
                  Batal / Cek Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleProcessSubmit}
                  className="px-4 py-1.5 bg-amber-700 text-white font-bold rounded-md hover:bg-amber-800 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi & Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Quick Add Mitra / Petani Baru */}
      {showQuickAddMitra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-emerald-800 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-300" />
                <span>Tambah Petani / Mitra Baru (Real Data)</span>
              </div>
              <button onClick={() => setShowQuickAddMitra(false)} className="text-emerald-200 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddMitraSubmit} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Nama Petani / Mitra <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Bapak Wayan Koster / H. Subandi"
                  value={newMitraNama}
                  onChange={(e) => setNewMitraNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Role / Peran</label>
                  <select
                    value={newMitraRole}
                    onChange={(e: any) => setNewMitraRole(e.target.value)}
                    className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg text-xs"
                  >
                    <option value="MITRA_TANI">Petani (Hasil Bumi)</option>
                    <option value="CUSTOMER">Customer / Mitra Toko</option>
                    <option value="SUPPLIER">Pemasok / Distributor</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Nomor Telepon / WA</label>
                  <input
                    type="text"
                    placeholder="0812xxxx"
                    value={newMitraTelepon}
                    onChange={(e) => setNewMitraTelepon(e.target.value)}
                    className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Alamat / Desa</label>
                <input
                  type="text"
                  placeholder="Misal: Desa Belitang III / Kebun Kopi Sumber Jaya"
                  value={newMitraAlamat}
                  onChange={(e) => setNewMitraAlamat(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowQuickAddMitra(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingMitra || !newMitraNama.trim()}
                  className="px-4 py-1.5 bg-emerald-700 text-white font-bold rounded-md hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSavingMitra ? 'Menyimpan...' : 'Simpan & Pilih Petani'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Putus Harga */}
      {putusHargaModal.open && putusHargaModal.tx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-gradient-to-r from-amber-700 to-amber-900 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Putus Harga Lot #{putusHargaModal.tx.noPembelian}</span>
              </div>
              <button
                onClick={() => setPutusHargaModal({ ...putusHargaModal, open: false })}
                className="text-amber-200 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-zinc-700">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Petani:</span>
                  <span className="font-bold text-zinc-900">{putusHargaModal.tx.namaMitra}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Komoditas:</span>
                  <span className="font-semibold text-zinc-900">{putusHargaModal.tx.komoditasNama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Berat Bersih Lot:</span>
                  <span className="font-bold font-mono text-zinc-900">{putusHargaModal.tx.beratBersih.toLocaleString('id-ID')} Kg</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Harga Deal per Kg yang Disepakati (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={putusHargaModal.hargaDeal}
                  onChange={(e) => setPutusHargaModal({ ...putusHargaModal, hargaDeal: e.target.value })}
                  placeholder="Misal: 43500"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono font-bold focus:ring-1 focus:ring-emerald-600"
                />
                <div className="mt-1 text-right font-bold text-amber-900">
                  Total Nilai: {formatRupiah((Number(putusHargaModal.hargaDeal) || 0) * putusHargaModal.tx.beratBersih)}
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Metode Pembayaran Putus Harga</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPutusHargaModal({ ...putusHargaModal, metode: 'TUNAI' })}
                    className={`py-1.5 px-2 text-center rounded-lg font-semibold text-xs border ${
                      putusHargaModal.metode === 'TUNAI'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-zinc-50 border-zinc-300'
                    }`}
                  >
                    Tunai KAS01
                  </button>
                  <button
                    type="button"
                    onClick={() => setPutusHargaModal({ ...putusHargaModal, metode: 'TRANSFER' })}
                    className={`py-1.5 px-2 text-center rounded-lg font-semibold text-xs border ${
                      putusHargaModal.metode === 'TRANSFER'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-zinc-50 border-zinc-300'
                    }`}
                  >
                    Transfer Bank
                  </button>
                  <button
                    type="button"
                    onClick={() => setPutusHargaModal({ ...putusHargaModal, metode: 'TITIP' })}
                    className={`py-1.5 px-2 text-center rounded-lg font-semibold text-xs border ${
                      putusHargaModal.metode === 'TITIP'
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-zinc-50 border-zinc-300'
                    }`}
                  >
                    Titip Saldo TIT01
                  </button>
                </div>
              </div>

              {putusHargaModal.metode === 'TRANSFER' && (
                <div>
                  <label className="block font-semibold text-zinc-600 mb-1">Pilih Rekening Bank:</label>
                  <select
                    value={putusHargaModal.rekening}
                    onChange={(e) => setPutusHargaModal({ ...putusHargaModal, rekening: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-zinc-300 rounded text-xs"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setPutusHargaModal({ ...putusHargaModal, open: false })}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSavingPutusHarga || (Number(putusHargaModal.hargaDeal) || 0) <= 0}
                  onClick={handlePutusHargaSubmit}
                  className="px-4 py-1.5 bg-emerald-700 text-white font-bold rounded-md hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSavingPutusHarga ? 'Menyimpan...' : 'Konfirmasi & Putus Harga'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Input Stok Awal & Rata-rata Pembelian Lalu (Rekap Manual Gudang) */}
      {showSaldoAwalModal && (
        <ModalInputStokAwalHasilBumi
          isOpen={showSaldoAwalModal}
          onClose={() => setShowSaldoAwalModal(false)}
          stokList={stokHasilBumiList}
          pembelianList={allTransactions}
          onSuccess={() => {
            onRefresh();
            loadTransactions();
          }}
          initialSelectedKode={selectedSaldoAwalKode}
        />
      )}
    </div>
  );
};
