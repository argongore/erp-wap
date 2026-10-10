import React, { useState } from 'react';
import {
  HandCoins,
  CheckCircle2,
  AlertCircle,
  Info,
  Landmark,
  History,
  FileText,
  ShoppingBag,
  Wheat,
  Camera,
  Eye,
  Printer,
  Sparkles,
  Search,
} from 'lucide-react';
import { Mitra, Rekening, TransaksiKasbonUang } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  kasbonUangList: TransaksiKasbonUang[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const KasbonUangView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  kasbonUangList,
  onSuccess,
  onRefresh,
}) => {
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');
  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );
  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');

  // Main UI Mode Switcher
  const [activeFormMode, setActiveFormMode] = useState<'KASBON_BARU' | 'NOTA_LALU'>('KASBON_BARU');

  // Common Mitra selection
  const [selectedMitraId, setSelectedMitraId] = useState<string>(activeMitras[0]?.id || '');
  const [mitraCategoryFilter, setMitraCategoryFilter] = useState<'ALL' | 'MITRA' | 'KARYAWAN'>('ALL');

  // State: Kasbon Uang Baru
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('BNI01');
  const [nominalInput, setNominalInput] = useState<string>('2000000');
  const [keterangan, setKeterangan] = useState<string>('Kasbon uang operasional tanam');
  const [fotoKasbonBaru, setFotoKasbonBaru] = useState<string>('');

  // State: Input Saldo Nota Lalu (Piutang Barang / Titip Uang Manual)
  const [subTipeNotaLalu, setSubTipeNotaLalu] = useState<'PIUTANG_BARANG_NOTA_LALU' | 'TITIP_UANG_NOTA_LALU'>(
    'PIUTANG_BARANG_NOTA_LALU'
  );
  const [nominalNotaLaluInput, setNominalNotaLaluInput] = useState<string>('1500000');
  const [noNotaLalu, setNoNotaLalu] = useState<string>('');
  const [tanggalNotaLalu, setTanggalNotaLalu] = useState<string>(getWIBTodayString());
  const [rincianBarangNotaLalu, setRincianBarangNotaLalu] = useState<string>('');
  const [keteranganNotaLalu, setKeteranganNotaLalu] = useState<string>('');
  const [fotoNotaLalu, setFotoNotaLalu] = useState<string>('');

  // History Tab Filter
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'NOTA_LALU' | 'KASBON_BARU'>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Photo Lightbox Modal
  const [previewPhoto, setPreviewPhoto] = useState<{
    imageUrl: string;
    title: string;
    nomorBukti?: string;
    namaMitra?: string;
    tanggal?: string;
    nominalText?: string;
    keterangan?: string;
  } | null>(null);

  const nominal = Number(nominalInput) || 0;
  const nominalNotaLalu = Number(nominalNotaLaluInput) || 0;
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);

  // Check live balance of chosen source account for Kasbon Baru
  const activeSourceAccount =
    metode === 'TUNAI' ? kas01 : availableBanks.find((b) => b.kode === rekeningSumber);
  const isBalanceSufficient = activeSourceAccount ? activeSourceAccount.saldoSaatIni >= nominal : false;

  // Process standard Kasbon Uang Baru
  const handleProcessSubmitKasbonBaru = async () => {
    setErrorMsg('');
    if (nominal <= 0) {
      setErrorMsg('Nominal kasbon uang harus lebih dari Rp 0');
      return;
    }

    if (!activeSourceAccount) {
      setErrorMsg('Rekening sumber pengeluaran tidak valid');
      return;
    }

    if (activeSourceAccount.saldoSaatIni < nominal) {
      setErrorMsg(
        `Saldo ${activeSourceAccount.nama} (${activeSourceAccount.kode}) tidak mencukupi! Saldo: ${formatRupiah(
          activeSourceAccount.saldoSaatIni
        )}, Nominal: ${formatRupiah(nominal)}`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result: TransaksiKasbonUang = await api.processKasbonUang({
        idMitra: selectedMitraId,
        metode,
        rekeningSumber: metode === 'TRANSFER' ? rekeningSumber : undefined,
        nominal,
        keterangan,
        fotoNota: fotoKasbonBaru || undefined,
      });

      setShowConfirmModal(false);
      onRefresh();

      const receipt: ReceiptData = {
        title: 'BUKTI PENGELUARAN KASBON UANG',
        subtitle: 'Pemberian Pinjaman Dana Tunai / Kasbon ke Mitra',
        nomorTransaksi: result.idTransaksi,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra,
        rekening: result.rekeningSumber,
        kategori: 'KASBON_UANG',
        fotoNota: result.fotoNota || fotoKasbonBaru,
        detailRows: [
          { label: 'Penerima Kasbon', value: result.namaMitra },
          { label: 'Jenis Transaksi', value: 'KASBON UANG' },
          { label: 'Metode Pengeluaran', value: result.metode },
          { label: 'Rekening Sumber Dana', value: `${result.rekeningSumber} (${activeSourceAccount?.nama})` },
          { label: 'Status Pinjaman', value: result.status, highlight: true },
          { label: 'Lampiran Foto Nota', value: result.fotoNota ? '✅ Tersimpan' : 'Tidak Ada' },
          { label: 'Nominal Kasbon Uang', value: result.nominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      setFotoKasbonBaru('');
      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses kasbon uang');
    } finally {
      setSubmitting(false);
    }
  };

  // Process Input Nota Lalu (Piutang Barang / Titip Uang Manual)
  const handleProcessSubmitNotaLalu = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedMitraId) {
      setErrorMsg('Pilih mitra / customer / anak buah terlebih dahulu');
      return;
    }

    if (nominalNotaLalu <= 0) {
      setErrorMsg('Nominal nota lalu harus lebih dari Rp 0');
      return;
    }

    setSubmitting(true);
    try {
      const cleanNoNota = noNotaLalu.trim() || `NL-${Date.now().toString().slice(-4)}`;
      const defaultKet =
        subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
          ? `Nota Lalu (Piutang Bon Barang): ${rincianBarangNotaLalu ? rincianBarangNotaLalu.trim() : 'Bon Barang Bertahun-Tahun Lalu'}`
          : `Nota Lalu (Titipan Uang / Hasil Panen): ${rincianBarangNotaLalu ? rincianBarangNotaLalu.trim() : 'Saldo Titip Panen Belum Diambil'}`;

      const res = await api.processInputNotaLalu({
        idMitra: selectedMitraId,
        tipe: subTipeNotaLalu,
        nominal: nominalNotaLalu,
        tanggalNotaLalu: tanggalNotaLalu || getWIBTodayString(),
        noNotaLalu: cleanNoNota,
        rincianBarang: rincianBarangNotaLalu.trim() || undefined,
        fotoNota: fotoNotaLalu || undefined,
        keterangan: keteranganNotaLalu.trim() || defaultKet,
      });

      onRefresh();

      const receipt: ReceiptData = {
        title:
          subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
            ? 'BUKTI KONVERSI NOTA LALU (PIUTANG BARANG)'
            : 'BUKTI PENCATATAN NOTA LALU (TITIP UANG / PANEN)',
        subtitle: 'Pencatatan Dokumen Fisik Manual Masa Lalu Sebagai Saldo Awal Sistem',
        nomorTransaksi: res.record.idTransaksi || res.record.noPembelian,
        tanggal: res.record.tanggalNotaLalu || res.record.tanggal,
        jam: res.record.jam,
        mitra: res.mitraNama,
        rekening: subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU' ? 'BON01 (Virtual Piutang)' : 'TIT01 (Virtual Titip)',
        kategori: subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU' ? 'KASBON_UANG' : 'PEMBELIAN_HASIL_BUMI',
        fotoNota: fotoNotaLalu || undefined,
        detailRows: [
          { label: 'Pihak Mitra / Anak Buah', value: res.mitraNama },
          { label: 'No. Dokumen / Nota Manual', value: cleanNoNota },
          { label: 'Tanggal Nota Fisik', value: tanggalNotaLalu },
          {
            label: 'Tipe Konversi',
            value:
              subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
                ? 'Piutang Bon Barang Masuk ke Kasbon Uang'
                : 'Titip Uang Masuk ke Kewajiban Titipan PT',
            highlight: true,
          },
          {
            label: 'Rincian Barang / Komoditas',
            value: rincianBarangNotaLalu || 'Rekapan Bon Barang Bertahun-Tahun Lalu',
          },
          { label: 'Dasar Penguat Foto Fisik', value: fotoNotaLalu ? '✅ Foto Nota Manual Tersimpan' : 'Tidak Dilampirkan' },
          { label: 'Total Nominal Nota Lalu', value: nominalNotaLalu, isTotal: true },
        ],
        catatan: keteranganNotaLalu || defaultKet,
        kasir: 'Kasir Wijaya Agro',
      };

      // Reset fields
      setNoNotaLalu('');
      setRincianBarangNotaLalu('');
      setKeteranganNotaLalu('');
      setFotoNotaLalu('');

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses input nota lalu');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered history list
  const filteredHistory = kasbonUangList.filter((item) => {
    if (historyFilter === 'NOTA_LALU' && !item.isNotaLalu) return false;
    if (historyFilter === 'KASBON_BARU' && item.isNotaLalu) return false;
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      const matchName = item.namaMitra.toLowerCase().includes(q);
      const matchId = item.idTransaksi.toLowerCase().includes(q);
      const matchKet = (item.keterangan || '').toLowerCase().includes(q);
      const matchNoNota = (item.noNotaLalu || '').toLowerCase().includes(q);
      if (!matchName && !matchId && !matchKet && !matchNoNota) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Title Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Kasir Kasbon Uang &amp; Saldo Nota Lalu</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
              MODUL KEUANGAN
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pengeluaran kasbon operasional berjalan dan pencatatan bon barang manual masa lalu (Nota Lalu) dengan bukti capture foto fisik
          </p>
        </div>

        {/* Form Mode Tabs Switcher */}
        <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200">
          <button
            type="button"
            onClick={() => {
              setActiveFormMode('KASBON_BARU');
              setErrorMsg('');
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFormMode === 'KASBON_BARU'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <HandCoins className="w-4 h-4" />
            <span>Kasbon Uang Baru</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveFormMode('NOTA_LALU');
              setErrorMsg('');
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeFormMode === 'NOTA_LALU'
                ? 'bg-amber-700 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Input Saldo Nota Lalu</span>
            <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-amber-950 rounded text-[10px]">
              Fisik Manual
            </span>
          </button>
        </div>
      </div>

      {/* Info Rules Box */}
      {activeFormMode === 'KASBON_BARU' ? (
        <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1">
          <div className="flex items-center space-x-2 font-bold text-rose-900">
            <Info className="w-4 h-4 text-rose-600" />
            <span>Prinsip Keuangan Kasbon Uang Berjalan:</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Kasbon Uang berjalan keluar langsung dari <strong>kasir brankas (KAS01)</strong> atau transfer rekening bank perusahaan.{' '}
            <strong>Saldo kas aktual langsung berkurang</strong> dan piutang kasbon mitra bertambah. Rekening virtual BON01
            otomatis bertambah sinkron.
          </p>
        </div>
      ) : (
        <div className="p-4 bg-amber-50/70 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1">
          <div className="flex items-center space-x-2 font-bold text-amber-900">
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Pondasi Nota Lalu (Mitra Sekalian Customer / Anak Buah):</span>
          </div>
          <p className="text-[11px] leading-relaxed">
            Untuk nota-nota fisik yang telah terbentuk bertahun-tahun ke belakang: bon barang lama yang belum lunas dimasukkan ke{' '}
            <strong>Kasbon Uang dengan nama NOTA LALU</strong> dengan nominal sesuai total bon barang fisik. Menggunakan rekening
            virtual kliring <strong>BON01</strong>, sehingga <strong>TIDAK memotong brankas fisik kasir 2026</strong>. Sedangkan
            yang titip uang masuk ke rekening <strong>TIT01</strong>. Dilengkapi capture foto nota manual sebagai dasar penguat!
          </p>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Left Form, Right History */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form according to mode */}
        <div className="lg:col-span-6 space-y-4">
          {activeFormMode === 'KASBON_BARU' ? (
            /* ============================================================ */
            /* MODE 1: KASBON UANG BARU (OPERASIONAL BERJALAN)               */
            /* ============================================================ */
            <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center space-x-2">
                  <HandCoins className="w-4 h-4 text-rose-600" />
                  <span>Formulir Pengeluaran Kasbon Uang Baru</span>
                </h2>
                <span className="text-[10px] font-semibold text-zinc-500">Operasional Berjalan</span>
              </div>

              {/* Select Mitra */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                  <label className="block text-[11px] font-semibold text-zinc-700">
                    Pilih Mitra / Anak Buah / Karyawan <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center space-x-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setMitraCategoryFilter('ALL')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        mitraCategoryFilter === 'ALL'
                          ? 'bg-zinc-800 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Semua ({activeMitras.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMitraCategoryFilter('MITRA')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        mitraCategoryFilter === 'MITRA'
                          ? 'bg-rose-700 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Mitra Tani ({activeMitras.filter((m) => m.role !== 'KARYAWAN').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMitraCategoryFilter('KARYAWAN')}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                        mitraCategoryFilter === 'KARYAWAN'
                          ? 'bg-amber-600 text-white'
                          : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      Karyawan ({activeMitras.filter((m) => m.role === 'KARYAWAN').length})
                    </button>
                  </div>
                </div>

                <select
                  value={selectedMitraId}
                  onChange={(e) => setSelectedMitraId(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-600 bg-white"
                >
                  {activeMitras
                    .filter((m) => {
                      if (mitraCategoryFilter === 'MITRA') return m.role !== 'KARYAWAN';
                      if (mitraCategoryFilter === 'KARYAWAN') return m.role === 'KARYAWAN';
                      return true;
                    })
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.role === 'KARYAWAN' ? `[KARYAWAN] ${m.nama}` : m.nama} ({m.kode}) - {m.role} - Telp: {m.telepon || '-'}
                      </option>
                    ))}
                </select>
              </div>

              {/* Nominal */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Nominal Uang Diberikan (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={nominalInput}
                  onChange={(e) => setNominalInput(e.target.value)}
                  className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono font-bold focus:ring-1 focus:ring-rose-600"
                />
                <div className="text-xs font-semibold text-rose-700 mt-1">{formatRupiah(nominal)}</div>
              </div>

              {/* Metode */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Metode Penyerahan Uang <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMetode('TUNAI')}
                    className={`py-2 px-3 text-center rounded-lg font-semibold text-xs border transition-all cursor-pointer ${
                      metode === 'TUNAI'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    Tunai (Auto KAS01)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetode('TRANSFER')}
                    className={`py-2 px-3 text-center rounded-lg font-semibold text-xs border transition-all cursor-pointer ${
                      metode === 'TRANSFER'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    Transfer Bank Perusahaan
                  </button>
                </div>
              </div>

              {/* Account Details based on Method */}
              {metode === 'TUNAI' ? (
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Rekening Sumber Otomatis:</span>
                    <span className="font-mono font-bold text-zinc-900">
                      {kas01?.nama} ({kas01?.kode})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Saldo Kas Tunai Saat Ini:</span>
                    <span className={`font-mono font-bold ${isBalanceSufficient ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatRupiah(kas01?.saldoSaatIni || 0)}
                    </span>
                  </div>
                  {!isBalanceSufficient && (
                    <div className="text-[11px] text-rose-600 font-semibold pt-1">
                      ⚠️ Saldo Kas Tunai tidak mencukupi untuk nominal kasbon ini!
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-zinc-700">
                    Pilih Rekening Bank Pengirim <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={rekeningSumber}
                    onChange={(e) => setRekeningSumber(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-rose-600 bg-white"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) - Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Keterangan */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Keterangan Kasbon Uang
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Misal: Kasbon uang operasional tanam kopi"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-rose-600"
                />
              </div>

              {/* Capture Foto Kuitansi / Bukti Serah Terima Kasbon */}
              <div className="pt-2 border-t border-zinc-200">
                <ImageUploadZone
                  label="Sisipkan / Foto Kuitansi Tanda Terima Kasbon"
                  sublabel="Lampirkan foto kuitansi bermaterai, slip penarikan, atau slip serah terima fisik uang kasbon"
                  value={fotoKasbonBaru}
                  onChange={setFotoKasbonBaru}
                />
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={nominal <= 0 || !isBalanceSufficient}
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-2.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Proses &amp; Konfirmasi Kasbon Uang ({formatRupiah(nominal)})
              </button>
            </div>
          ) : (
            /* ============================================================ */
            /* MODE 2: INPUT SALDO NOTA LALU (MANUAL FISIK BERTAHUN-TAHUN)  */
            /* ============================================================ */
            <div className="bg-white rounded-xl border border-amber-200 shadow-2xs p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-amber-100">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                    Formulir Input Saldo Nota Lalu (Manual)
                  </h2>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  Saldo Awal Mitra
                </span>
              </div>

              {/* Sub-Type Toggle */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
                  Kategori Nota Lalu: <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubTipeNotaLalu('PIUTANG_BARANG_NOTA_LALU')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
                        ? 'border-rose-500 bg-rose-50 text-rose-950 ring-1 ring-rose-500 shadow-xs'
                        : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <ShoppingBag className="w-4 h-4 text-rose-600 shrink-0" />
                      <div>
                        <div className="font-bold text-xs">Piutang Bon Barang</div>
                        <div className="text-[10px] text-zinc-500">Masuk Kasbon (BON01)</div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubTipeNotaLalu('TITIP_UANG_NOTA_LALU')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      subTipeNotaLalu === 'TITIP_UANG_NOTA_LALU'
                        ? 'border-purple-500 bg-purple-50 text-purple-950 ring-1 ring-purple-500 shadow-xs'
                        : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Wheat className="w-4 h-4 text-purple-600 shrink-0" />
                      <div>
                        <div className="font-bold text-xs">Titip Uang / Panen</div>
                        <div className="text-[10px] text-zinc-500">Masuk Titipan (TIT01)</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Mitra Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Mitra / Customer / Pasukan / Anak Buah <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedMitraId}
                  onChange={(e) => setSelectedMitraId(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-600 bg-white"
                >
                  {activeMitras.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.kode}) - {m.role} - Telp: {m.telepon || '-'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Nominal, Tanggal, No Nota */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Nominal Nota (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    required
                    value={nominalNotaLaluInput}
                    onChange={(e) => setNominalNotaLaluInput(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                  />
                  <div className="text-[11px] font-bold text-amber-800 mt-1">{formatRupiah(nominalNotaLalu)}</div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    No. Faktur / Nota Manual
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: NL-2023-018"
                    value={noNotaLalu}
                    onChange={(e) => setNoNotaLalu(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-semibold focus:ring-1 focus:ring-amber-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Tanggal Nota (Bisa Mundur)
                  </label>
                  <input
                    type="text"
                    placeholder="DD/MM/YYYY misal 10/05/2023"
                    value={tanggalNotaLalu}
                    onChange={(e) => setTanggalNotaLalu(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-amber-600"
                  />
                </div>
              </div>

              {/* Rincian Barang yang Di-bon */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  {subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
                    ? 'Rincian Bon Barang di Nota Fisik'
                    : 'Rincian Komoditas / Titipan Panen di Slip'}
                </label>
                <textarea
                  rows={2}
                  placeholder={
                    subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
                      ? 'Contoh: Beras Belitang 5 Sak, Pupuk NPK 3 Sak, Solar 1 Drigent'
                      : 'Contoh: Titipan hasil panen kopi 500 Kg tempo hari'
                  }
                  value={rincianBarangNotaLalu}
                  onChange={(e) => setRincianBarangNotaLalu(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-600"
                />
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Keterangan Transaksi
                </label>
                <input
                  type="text"
                  placeholder="Keterangan pengingat atau asal nota manual..."
                  value={keteranganNotaLalu}
                  onChange={(e) => setKeteranganNotaLalu(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-600"
                />
              </div>

              {/* Dasar Penguat: Capture Foto Fisik Nota Manual */}
              <div className="pt-2 border-t border-zinc-200">
                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200 space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-950">
                    <Camera className="w-4 h-4 text-amber-600" />
                    <span>Dasar Penguat: Capture Foto Detail Nota Lalu (Fisik Manual)</span>
                  </div>
                  <p className="text-[11px] text-zinc-600">
                    Ambil foto langsung nota manual fisik kertas melalui kamera atau upload file gambar sebagai bukti dasar penguat yang sah.
                  </p>
                  <ImageUploadZone
                    label="Foto Nota Kertas Manual"
                    sublabel="Lampirkan foto fisik nota manual atau slip lama"
                    value={fotoNotaLalu}
                    onChange={setFotoNotaLalu}
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                disabled={nominalNotaLalu <= 0 || submitting}
                onClick={handleProcessSubmitNotaLalu}
                className={`w-full py-2.5 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer ${
                  subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
                    ? 'bg-rose-700 hover:bg-rose-800'
                    : 'bg-purple-700 hover:bg-purple-800'
                } disabled:opacity-50`}
              >
                {submitting
                  ? 'Menyimpan Transaksi...'
                  : `Simpan ${
                      subTipeNotaLalu === 'PIUTANG_BARANG_NOTA_LALU'
                        ? 'Piutang Bon Barang Nota Lalu'
                        : 'Titip Uang Nota Lalu'
                    } (${formatRupiah(nominalNotaLalu)})`}
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Transaction History */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-zinc-100">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-zinc-500" />
                <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Riwayat Kasbon Uang &amp; Nota Lalu ({filteredHistory.length})
                </h2>
              </div>

              {/* Sub-filter tabs */}
              <div className="flex items-center space-x-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setHistoryFilter('ALL')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                    historyFilter === 'ALL'
                      ? 'bg-zinc-800 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Semua ({kasbonUangList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('NOTA_LALU')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                    historyFilter === 'NOTA_LALU'
                      ? 'bg-amber-700 text-white'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  Nota Lalu ({kasbonUangList.filter((k) => k.isNotaLalu).length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('KASBON_BARU')}
                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                    historyFilter === 'KASBON_BARU'
                      ? 'bg-rose-700 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Kasbon Baru ({kasbonUangList.filter((k) => !k.isNotaLalu).length})
                </button>
              </div>
            </div>

            {/* Search filter */}
            <div className="relative">
              <input
                type="text"
                placeholder="Cari nama mitra, nomor bukti, nota lalu..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-zinc-200 rounded-lg text-xs focus:ring-1 focus:ring-rose-600"
              />
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
            </div>

            {/* List */}
            <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
              {filteredHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-zinc-400 border border-dashed rounded-xl">
                  Belum ada transaksi kasbon yang sesuai filter
                </div>
              ) : (
                filteredHistory.map((k) => (
                  <div
                    key={k.idTransaksi}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 transition-all ${
                      k.isNotaLalu
                        ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
                        : 'bg-zinc-50/60 border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-zinc-900 text-[11px]">{k.idTransaksi}</span>
                        {k.isNotaLalu ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-200 text-amber-900 border border-amber-300">
                            📑 NOTA LALU {k.noNotaLalu ? `(${k.noNotaLalu})` : ''}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-zinc-200 text-zinc-800">
                            {k.metode}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 text-[9px] font-semibold rounded ${
                            k.status === 'LUNAS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : k.status === 'SEBAGIAN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {k.status}
                        </span>
                      </div>
                      <span className="font-bold text-rose-700 font-mono">{formatRupiah(k.nominal)}</span>
                    </div>

                    <div className="flex justify-between text-[11px] text-zinc-600">
                      <span>
                        Penerima: <strong>{k.namaMitra}</strong>
                      </span>
                      <span>
                        Rekening: <strong className="font-mono">{k.rekeningSumber}</strong>
                      </span>
                    </div>

                    <div className="text-[11px] text-zinc-600">
                      {k.keterangan || (k.isNotaLalu ? 'Piutang Bon Barang Nota Lalu' : '-')}
                    </div>

                    {k.rincianBarangNotaLalu && (
                      <div className="p-2 bg-white/80 rounded border border-amber-200 text-[10px] text-zinc-700 font-mono">
                        <span className="font-bold text-amber-900">Rincian Barang: </span>
                        {k.rincianBarangNotaLalu}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-200/60">
                      <span>
                        {k.tanggalNotaLalu ? `Tgl Nota: ${k.tanggalNotaLalu}` : `${k.tanggal} · ${k.jam}`}
                      </span>

                      <div className="flex items-center space-x-1.5">
                        {k.fotoNota && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                imageUrl: k.fotoNota!,
                                title: `Foto Fisik Nota Lalu - ${k.namaMitra}`,
                                nomorBukti: k.idTransaksi,
                                namaMitra: k.namaMitra,
                                tanggal: k.tanggalNotaLalu || k.tanggal,
                                nominalText: formatRupiah(k.nominal),
                                keterangan: k.keterangan,
                              })
                            }
                            className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded text-[10px] flex items-center space-x-1 transition-colors cursor-pointer"
                          >
                            <Camera className="w-3 h-3 text-amber-700" />
                            <span>Lihat Foto Fisik</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            const receipt: ReceiptData = {
                              title: k.isNotaLalu
                                ? 'BUKTI KONVERSI NOTA LALU'
                                : 'BUKTI PENGELUARAN KASBON UANG',
                              subtitle: k.isNotaLalu
                                ? 'Dokumen Pencatatan Piutang Masa Lalu'
                                : 'Pemberian Kasbon Operasional ke Mitra',
                              nomorTransaksi: k.idTransaksi,
                              tanggal: k.tanggal,
                              jam: k.jam,
                              mitra: k.namaMitra,
                              rekening: k.rekeningSumber,
                              kategori: 'KASBON_UANG',
                              fotoNota: k.fotoNota,
                              detailRows: [
                                { label: 'Penerima Kasbon', value: k.namaMitra },
                                { label: 'Jenis Transaksi', value: k.isNotaLalu ? 'Nota Lalu (Piutang Barang)' : 'Kasbon Uang' },
                                { label: 'Metode / Rekening', value: `${k.metode} via ${k.rekeningSumber}` },
                                { label: 'Status Pinjaman', value: k.status, highlight: true },
                                { label: 'Dasar Foto Fisik', value: k.fotoNota ? '✅ Tersimpan' : 'Tidak Ada' },
                                { label: 'Nominal Kasbon', value: k.nominal, isTotal: true },
                              ],
                              catatan: k.keterangan,
                              kasir: 'Kasir Wijaya Agro',
                            };
                            onSuccess(receipt);
                          }}
                          className="px-2 py-0.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold rounded text-[10px] flex items-center space-x-1 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Cetak Slip</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Standard Kasbon Baru */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-rose-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Pengeluaran Kasbon Uang Baru</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-rose-200 hover:text-white cursor-pointer">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Mitra Penerima:</span>
                  <span className="font-bold text-zinc-900">{selectedMitra?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Rekening Sumber Kas:</span>
                  <span className="font-mono font-bold text-zinc-900">
                    {activeSourceAccount?.nama} ({activeSourceAccount?.kode})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Saldo Sumber Saat Ini:</span>
                  <span className="font-semibold text-zinc-700">
                    {formatRupiah(activeSourceAccount?.saldoSaatIni || 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Nominal Kasbon:</span>
                  <span className="font-bold text-sm text-rose-700">{formatRupiah(nominal)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>Estimasi Saldo Sumber Setelahnya:</span>
                  <span className="font-mono font-semibold">
                    {formatRupiah((activeSourceAccount?.saldoSaatIni || 0) - nominal)}
                  </span>
                </div>
                {fotoKasbonBaru && (
                  <div className="text-[11px] text-emerald-700 font-semibold pt-1 border-t border-zinc-200">
                    ✅ Lampiran foto fisik kuitansi kasbon siap disimpan
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium cursor-pointer"
                >
                  Batal / Cek Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleProcessSubmitKasbonBaru}
                  className="px-4 py-1.5 bg-rose-700 text-white font-bold rounded-md hover:bg-rose-800 disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi & Berikan Uang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {previewPhoto && (
        <FotoNotaPreviewModal
          isOpen={Boolean(previewPhoto)}
          onClose={() => setPreviewPhoto(null)}
          imageUrl={previewPhoto.imageUrl}
          title={previewPhoto.title}
          nomorBukti={previewPhoto.nomorBukti}
          namaMitra={previewPhoto.namaMitra}
          tanggal={previewPhoto.tanggal}
          nominalText={previewPhoto.nominalText}
          keterangan={previewPhoto.keterangan}
        />
      )}
    </div>
  );
};
