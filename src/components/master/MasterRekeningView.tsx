import React, { useState } from 'react';
import {
  Building2,
  Plus,
  CheckCircle2,
  AlertCircle,
  Info,
  Landmark,
  Edit2,
  Wallet,
  Layers,
  ArrowRightLeft,
  ShieldCheck,
  Building,
  HelpCircle,
  Trash2,
  RefreshCw,
  TrendingUp,
  FileText,
} from 'lucide-react';
import { Rekening, KategoriRekening, Mitra } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ModalTransaksiAnakPerusahaan } from '../common/ModalTransaksiAnakPerusahaan.tsx';

interface Props {
  rekeningList: Rekening[];
  mitraList?: Mitra[];
  onRefresh: () => void;
  onOpenStatement?: (idMitra: string) => void;
  onSuccessReceipt?: (receipt: ReceiptData) => void;
}

type TabKategori = 'ALL' | 'PERUSAHAAN' | 'ANAK_PERUSAHAAN' | 'OPERASIONAL_DIVISI' | 'VIRTUAL_SISTEM';

export const MasterRekeningView: React.FC<Props> = ({
  rekeningList,
  mitraList = [],
  onRefresh,
  onOpenStatement,
  onSuccessReceipt,
}) => {
  const [activeTab, setActiveTab] = useState<TabKategori>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRekening, setEditingRekening] = useState<Rekening | null>(null);
  const [anakPerusahaanModalKode, setAnakPerusahaanModalKode] = useState<string | null>(null);

  // Dedicated Update Saldo Modal
  const [showSaldoModal, setShowSaldoModal] = useState(false);
  const [selectedRekeningForSaldo, setSelectedRekeningForSaldo] = useState<Rekening | null>(null);
  const [formSaldoBaru, setFormSaldoBaru] = useState<string>('');
  const [formUpdateSaldoAwal, setFormUpdateSaldoAwal] = useState<boolean>(true);
  const [formAlasanSaldo, setFormAlasanSaldo] = useState<string>('');

  // Reset Clean Data Modal
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [isResettingClean, setIsResettingClean] = useState(false);

  // Add / Edit Form State
  const [formKode, setFormKode] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formAtasNama, setFormAtasNama] = useState('PT Wijaya Agro');
  const [formNomor, setFormNomor] = useState('');
  const [formSaldoAwal, setFormSaldoAwal] = useState('');
  const [formSaldoSaatIni, setFormSaldoSaatIni] = useState('');
  const [formAlasanPenyesuaian, setFormAlasanPenyesuaian] = useState('');
  const [formKeterangan, setFormKeterangan] = useState('');
  const [formKategori, setFormKategori] = useState<KategoriRekening>('PERUSAHAAN');
  const [formIndukPenyimpan, setFormIndukPenyimpan] = useState('KAS01');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Helper classification
  const getKategori = (r: Rekening): KategoriRekening => {
    if (r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN' || r.kode === 'REK-DPPARABO') {
      return 'ANAK_PERUSAHAAN';
    }
    if (r.kategori) return r.kategori;
    if (r.kode === 'BON01' || r.kode === 'TIT01' || r.kode === 'SINKRON') return 'VIRTUAL_SISTEM';
    if (r.kode.startsWith('REK-') || r.kode.startsWith('DIV-')) return 'OPERASIONAL_DIVISI';
    return 'PERUSAHAAN';
  };

  const rekeningPerusahaanList = rekeningList.filter((r) => getKategori(r) === 'PERUSAHAAN');
  const rekeningAnakPerusahaanList = rekeningList.filter((r) => getKategori(r) === 'ANAK_PERUSAHAAN');
  const rekeningOperasionalList = rekeningList.filter((r) => getKategori(r) === 'OPERASIONAL_DIVISI');
  const rekeningVirtualList = rekeningList.filter((r) => getKategori(r) === 'VIRTUAL_SISTEM');

  // Filtered List based on active tab
  const displayedList = rekeningList.filter((r) => {
    if (activeTab === 'ALL') return true;
    return getKategori(r) === activeTab;
  });

  // Totals
  const totalDanaFisikPerusahaan = rekeningPerusahaanList
    .filter((r) => r.status === 'AKTIF')
    .reduce((sum, r) => sum + r.saldoSaatIni, 0);

  const totalSaldoAnakPerusahaan = rekeningAnakPerusahaanList
    .filter((r) => r.status === 'AKTIF')
    .reduce((sum, r) => sum + r.saldoSaatIni, 0);

  const totalBukuOperasionalDivisi = rekeningOperasionalList
    .filter((r) => r.status === 'AKTIF')
    .reduce((sum, r) => sum + r.saldoSaatIni, 0);

  const totalPiutangBon = rekeningList.find((r) => r.kode === 'BON01')?.saldoSaatIni || 0;
  const totalTitipanHasilBumi = rekeningList.find((r) => r.kode === 'TIT01')?.saldoSaatIni || 0;
  const totalSinkronPotongBon = rekeningList.find((r) => r.kode === 'SINKRON')?.saldoSaatIni || 0;

  const formatInputRibuan = (val: string | number): string => {
    const str = String(val ?? '').trim();
    if (!str) return '';
    if (str === '-') return '-';
    const isNegative = str.startsWith('-');
    const digits = str.replace(/[^0-9]/g, '');
    if (!digits) return isNegative ? '-' : '';
    const num = Number(digits);
    if (!Number.isFinite(num)) return '';
    return (isNegative ? '-' : '') + num.toLocaleString('id-ID');
  };

  const parseInputNominal = (val: string): number => {
    const str = String(val ?? '').trim();
    if (!str || str === '-') return 0;
    const isNegative = str.startsWith('-');
    const digits = str.replace(/[^0-9]/g, '');
    if (!digits) return 0;
    return Number(digits) * (isNegative ? -1 : 1);
  };

  const editableSaldoRekeningList = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.kode !== 'SINKRON'
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const parsedAwal = parseInputNominal(formSaldoAwal);
      await api.createRekening({
        kode: formKode.toUpperCase().trim(),
        nama: formNama.trim(),
        atasNama: formAtasNama.trim(),
        nomorRekening: formNomor.trim(),
        saldoAwal: parsedAwal,
        keterangan: formKeterangan.trim(),
        kategori: formKategori,
        isAnakPerusahaan: formKategori === 'ANAK_PERUSAHAAN',
        rekeningIndukPenyimpan: formKategori === 'OPERASIONAL_DIVISI' ? formIndukPenyimpan : undefined,
      } as any);

      setSuccessMsg(`Rekening ${formKode.toUpperCase()} berhasil ditambahkan`);
      setShowAddModal(false);
      setFormKode('');
      setFormNama('');
      setFormNomor('');
      setFormSaldoAwal('');
      setFormKeterangan('');
      setFormKategori('PERUSAHAAN');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambahkan rekening');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRekening) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const numSaldoSaatIni = parseInputNominal(formSaldoSaatIni);
      const numSaldoAwal = parseInputNominal(formSaldoAwal);

      await api.updateRekening(editingRekening.kode, {
        nama: formNama.trim(),
        atasNama: formAtasNama.trim(),
        nomorRekening: formNomor.trim(),
        status: editingRekening.status,
        keterangan: formKeterangan.trim(),
        kategori: formKategori,
        isAnakPerusahaan: formKategori === 'ANAK_PERUSAHAAN',
        rekeningIndukPenyimpan: formKategori === 'OPERASIONAL_DIVISI' ? formIndukPenyimpan : undefined,
        saldoSaatIni: numSaldoSaatIni,
        saldoAwal: numSaldoAwal,
        alasanPenyesuaian: formAlasanPenyesuaian.trim() || undefined,
      } as any);

      setSuccessMsg(`Rekening ${editingRekening.kode} berhasil diperbarui (Saldo: ${formatRupiah(numSaldoSaatIni)})`);
      setEditingRekening(null);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui rekening');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (rek: Rekening) => {
    setEditingRekening(rek);
    setFormNama(rek.nama);
    setFormAtasNama(rek.atasNama);
    setFormNomor(rek.nomorRekening);
    setFormSaldoAwal(formatInputRibuan(rek.saldoAwal));
    setFormSaldoSaatIni(formatInputRibuan(rek.saldoSaatIni));
    setFormAlasanPenyesuaian('');
    setFormKeterangan(rek.keterangan || '');
    setFormKategori(getKategori(rek));
    setFormIndukPenyimpan(rek.rekeningIndukPenyimpan || 'KAS01');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const openUpdateSaldoModal = (rek?: Rekening) => {
    const fallback =
      displayedList.find((r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01') ||
      editableSaldoRekeningList[0] ||
      rekeningList[0];
    const target = rek && !rek.isVirtual && rek.kode !== 'BON01' && rek.kode !== 'TIT01' ? rek : fallback;
    setSelectedRekeningForSaldo(target);
    setFormSaldoBaru(target ? formatInputRibuan(target.saldoSaatIni) : '0');
    setFormUpdateSaldoAwal(true);
    setFormAlasanSaldo('');
    setErrorMsg('');
    setShowSaldoModal(true);
  };

  const handleUpdateSaldoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRekeningForSaldo) return;
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const numSaldo = parseInputNominal(formSaldoBaru);
      if (isNaN(numSaldo)) throw new Error('Nominal saldo baru harus berupa angka valid');

      await api.updateSaldoRekening(
        selectedRekeningForSaldo.kode,
        numSaldo,
        formUpdateSaldoAwal,
        formAlasanSaldo.trim() || undefined
      );

      setSuccessMsg(
        `Saldo ${selectedRekeningForSaldo.nama} (${selectedRekeningForSaldo.kode}) berhasil diubah menjadi ${formatRupiah(numSaldo)} dan tersinkron ke Cloud Supabase.`
      );
      setShowSaldoModal(false);
      setSelectedRekeningForSaldo(null);
      setFormSaldoBaru('');
      setFormAlasanSaldo('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperbarui saldo rekening');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteReset = async () => {
    setIsResettingClean(true);
    setErrorMsg('');
    try {
      await api.resetCleanDatabase();
      setSuccessMsg(
        'Semua data berhasil dikosongkan! Saldo & data riil siap diinput dari nol sesuai pembukuan asli.'
      );
      setShowResetConfirmModal(false);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengosongkan data');
    } finally {
      setIsResettingClean(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Master Rekening</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
              MODUL 5
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Pemisahan resmi antara Rekening Finansial Perusahaan (Penyimpanan Fisik) dan Rekening Operasional Divisi (Buku Tracking Alokasi)
          </p>
        </div>

        {/* Action Buttons: Add, Update Saldo Fleksibel, Kosongkan Data Riil */}
        <div className="flex flex-wrap items-center gap-2 self-start">
          <button
            type="button"
            onClick={() => openUpdateSaldoModal()}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Ubah nominal saldo rekening secara fleksibel kapan saja"
          >
            <Wallet className="w-4 h-4" />
            <span>Perbarui Nominal Saldo</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAddModal(true);
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Rekening Baru</span>
          </button>

          <button
            type="button"
            onClick={() => setShowResetConfirmModal(true)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Kosongkan semua data untuk mulai input data riil"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Kosongkan Data (Data Riil)</span>
          </button>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 text-xs">
        {/* Card 1: Rekening Perusahaan */}
        <div className="min-w-0 overflow-hidden p-4 bg-white rounded-xl border-2 border-emerald-500/80 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <Landmark className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate">REKENING PERUSAHAAN</span>
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold shrink-0">Penyimpanan Riil</span>
          </div>
          <p
            className="text-lg font-black text-emerald-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(totalDanaFisikPerusahaan)}
          >
            {formatRupiahSingkat(totalDanaFisikPerusahaan)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Total kas fisik di brankas kasir &amp; bank resmi perusahaan ({rekeningPerusahaanList.length} rekening).
          </p>
        </div>

        {/* Card 2: Anak Perusahaan & Mitra (DP Parabot) */}
        <div className="min-w-0 overflow-hidden p-4 bg-white rounded-xl border-2 border-teal-500/80 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-teal-900 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <Building2 className="w-3.5 h-3.5 text-teal-700 shrink-0" />
              <span className="truncate">ANAK PERUSAHAAN &amp; MITRA</span>
            </span>
            <span className="text-[10px] text-teal-700 font-semibold shrink-0">1 Transaksi</span>
          </div>
          <p
            className={`text-lg font-black font-mono tabular-nums truncate whitespace-nowrap ${
              totalSaldoAnakPerusahaan >= 0 ? 'text-teal-950' : 'text-rose-700'
            }`}
            title={formatRupiah(totalSaldoAnakPerusahaan)}
          >
            {formatRupiahSingkat(totalSaldoAnakPerusahaan)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            {totalSaldoAnakPerusahaan > 0
              ? 'Dana PT tersimpan di DP Parabot (otomatis sinkron buku mitra).'
              : totalSaldoAnakPerusahaan < 0
              ? 'Dana talangan DP Parabot ke PT. Wijaya Agro Perkasa.'
              : 'DP Parabot (bukan bank): otomatis menyatu dengan akun Mitra.'}
          </p>
        </div>

        {/* Card 3: Rekening Operasional Divisi */}
        <div className="min-w-0 overflow-hidden p-4 bg-white rounded-xl border-2 border-indigo-400/80 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="truncate">OPERASIONAL DIVISI</span>
            </span>
            <span className="text-[10px] text-indigo-700 font-semibold shrink-0">Tracking Divisi</span>
          </div>
          <p
            className="text-lg font-black text-indigo-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(totalBukuOperasionalDivisi)}
          >
            {formatRupiahSingkat(totalBukuOperasionalDivisi)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Saldo arus kas divisi (otomatis bertambah saat Penjualan &amp; berkurang saat Pembelian/Ops di {rekeningOperasionalList.length} divisi).
          </p>
        </div>

        {/* Card 4: Piutang BON01 */}
        <div className="min-w-0 overflow-hidden p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider truncate">
              PIUTANG BON01
            </span>
            <span className="text-[10px] text-amber-700 font-semibold shrink-0">Virtual</span>
          </div>
          <p
            className="text-lg font-black text-amber-900 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(totalPiutangBon)}
          >
            {formatRupiahSingkat(totalPiutangBon)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Total kasbon barang toko &amp; pinjaman uang mitra/karyawan belum lunas.
          </p>
        </div>

        {/* Card 5: Titip TIT01 */}
        <div className="min-w-0 overflow-hidden p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider truncate">
              TITIPAN TIT01
            </span>
            <span className="text-[10px] text-purple-700 font-semibold shrink-0">Virtual</span>
          </div>
          <p
            className="text-lg font-black text-purple-900 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(totalTitipanHasilBumi)}
          >
            {formatRupiahSingkat(totalTitipanHasilBumi)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Hasil panen petani/mitra yang belum dicairkan ke kas/bank.
          </p>
        </div>

        {/* Card 6: Rekening SINKRON (Potong Titipan / Uang Hasil Bumi Non-Tunai) */}
        <div className="min-w-0 overflow-hidden p-4 bg-white rounded-xl border-2 border-cyan-500/80 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <span className="text-[10px] font-bold text-cyan-900 uppercase tracking-wider flex items-center space-x-1 min-w-0 truncate">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-700 shrink-0" />
              <span className="truncate">REKENING SINKRON</span>
            </span>
            <span className="text-[10px] text-cyan-700 font-semibold shrink-0">Non-Tunai</span>
          </div>
          <p
            className="text-lg font-black text-cyan-950 font-mono tabular-nums truncate whitespace-nowrap"
            title={formatRupiah(totalSinkronPotongBon)}
          >
            {formatRupiahSingkat(totalSinkronPotongBon)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Akumulasi pelunasan bon mitra dengan potong uang hasil bumi/titipan tanpa kas keluar.
          </p>
        </div>
      </div>

      {/* Fundamental Business Rule Banner */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-2">
        <div className="flex items-center space-x-2 font-bold text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Aturan Tata Kelola Keuangan PT. Wijaya Agro Perkasa:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[11px] text-emerald-900">
          <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 space-y-1">
            <strong className="text-emerald-950 font-bold">1. Rekening Perusahaan (Kas &amp; Bank Resmi):</strong>
            <p className="text-zinc-600">
              Meliputi <strong>KAS01 (Kas Utama Kasir)</strong> dan rekening bank giro (BNI, BCA, Mandiri, BRI, BSI). Nominal saldo dapat disesuaikan kapan saja agar selaras dengan fisik pembukuan.
            </p>
          </div>
          <div className="p-2.5 bg-white/80 rounded-lg border border-teal-300 space-y-1">
            <strong className="text-teal-950 font-bold">2. Rekening Anak Perusahaan &amp; Mitra (DP Parabot):</strong>
            <p className="text-zinc-600">
              <strong>DP Parabot</strong> bukan bank, melainkan Anak Perusahaan PT. Wijaya Agro Perkasa yang juga berperan sebagai <strong>Mitra</strong>. Setiap simpan/tarik dana melalui <strong>REK-DPPARABO</strong> tersimpan menjadi <strong>1 Transaksi Terpadu</strong>.
            </p>
          </div>
          <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 space-y-1">
            <strong className="text-indigo-950 font-bold">3. Buku Arus Kas Divisi (Tracking Unit Usaha):</strong>
            <p className="text-zinc-600">
              Melacak arus kas masuk &amp; keluar tiap divisi (Gudang, Karya, Transport, CV, Perkasa, Okussa, BRILink). Otomatis <strong>bertambah saat Penjualan</strong> dan <strong>berkurang saat Pembelian / Biaya Ops / Upah</strong>.
            </p>
          </div>
          <div className="p-2.5 bg-white/80 rounded-lg border border-cyan-300 space-y-1">
            <strong className="text-cyan-950 font-bold">4. Rekening SINKRON (Potong Titipan / Uang Kopi):</strong>
            <p className="text-zinc-600">
              Digunakan pada menu <strong>Pelunasan Bon Mitra</strong> saat mitra memiliki uang hasil bumi/titipan — bon langsung dipotong dari uang titipannya tanpa mengeluarkan atau memasukkan kas fisik.
            </p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-3">
        <button
          onClick={() => setActiveTab('ALL')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'ALL'
              ? 'bg-zinc-900 text-white shadow-2xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          Semua Rekening ({rekeningList.length})
        </button>
        <button
          onClick={() => setActiveTab('PERUSAHAAN')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'PERUSAHAAN'
              ? 'bg-emerald-700 text-white shadow-2xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Landmark className="w-3.5 h-3.5" />
          <span>Rekening Perusahaan ({rekeningPerusahaanList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ANAK_PERUSAHAAN')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'ANAK_PERUSAHAAN'
              ? 'bg-teal-700 text-white shadow-2xs'
              : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Anak Perusahaan &amp; Mitra ({rekeningAnakPerusahaanList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('OPERASIONAL_DIVISI')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'OPERASIONAL_DIVISI'
              ? 'bg-indigo-700 text-white shadow-2xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Operasional Divisi ({rekeningOperasionalList.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('VIRTUAL_SISTEM')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
            activeTab === 'VIRTUAL_SISTEM'
              ? 'bg-amber-700 text-white shadow-2xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Virtual Sistem ({rekeningVirtualList.length})</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Kode</th>
                <th className="py-3 px-4">Nama Rekening &amp; Pemegang</th>
                <th className="py-3 px-4">Kategori Akun</th>
                <th className="py-3 px-4">No. Rekening</th>
                <th className="py-3 px-4 text-right">Saldo Awal</th>
                <th className="py-3 px-4 text-right">Saldo Saat Ini (Fleksibel)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {displayedList.map((rek) => {
                const isSinkronRek = rek.kode === 'SINKRON';
                const isVirtual =
                  Boolean(rek.isVirtual) ||
                  rek.kode === 'BON01' ||
                  rek.kode === 'TIT01' ||
                  isSinkronRek;
                const kat = getKategori(rek);
                const isPerusahaan = kat === 'PERUSAHAAN';
                const isAnakPerusahaan = kat === 'ANAK_PERUSAHAAN';
                const isDivisi = kat === 'OPERASIONAL_DIVISI';
                const storageParent = rekeningList.find((r) => r.kode === rek.rekeningIndukPenyimpan);
                const linkedMitra =
                  mitraList.find((m) => m.id === rek.idMitraTerkait || m.kodeRekeningTerkait === rek.kode) ||
                  (isAnakPerusahaan && rek.kode === 'REK-DPPARABO'
                    ? mitraList.find((m) => m.id === 'MTR-DPPARABOT')
                    : undefined);

                return (
                  <tr
                    key={rek.kode}
                    className={`hover:bg-zinc-50/80 transition-colors ${
                      isAnakPerusahaan ? 'bg-teal-50/30' : isSinkronRek ? 'bg-cyan-50/30' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                      <span
                        className={`px-2 py-0.5 rounded border ${
                          isSinkronRek
                            ? 'bg-cyan-100 border-cyan-300 text-cyan-950'
                            : 'bg-zinc-100 border-zinc-200'
                        }`}
                      >
                        {rek.kode}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-900">{rek.nama}</div>
                      <div className="text-[10px] text-zinc-500">a.n. {rek.atasNama}</div>
                      {rek.keterangan && (
                        <div className="text-[10px] text-zinc-400 italic mt-0.5">{rek.keterangan}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {isPerusahaan && (
                        <div className="text-[11px] font-semibold text-emerald-800">
                          Rekening Perusahaan · Kas/Bank
                        </div>
                      )}
                      {isAnakPerusahaan && (
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-bold text-teal-900">
                            Anak Perusahaan &amp; Mitra · Bukan Bank
                          </div>
                          <div className="text-[10px] text-teal-700 font-medium">
                            Terhubung 1 Transaksi dengan Mitra:{' '}
                            <strong>{linkedMitra?.nama || rek.namaMitraTerkait || rek.nama}</strong>
                          </div>
                        </div>
                      )}
                      {isDivisi && (
                        <div className="space-y-0.5">
                          <div className="text-[11px] font-semibold text-indigo-800">
                            Operasional Divisi
                          </div>
                          <div className="text-[10px] text-indigo-700 font-medium">
                            Disimpan di:{' '}
                            <strong className="underline">
                              {storageParent
                                ? `${storageParent.kode} - ${storageParent.nama}`
                                : 'KAS01 (Kas Perusahaan)'}
                            </strong>
                          </div>
                        </div>
                      )}
                      {isVirtual && (
                        <div className="space-y-0.5">
                          {isSinkronRek ? (
                            <>
                              <div className="text-[11px] font-bold text-cyan-900">
                                Rekening Sinkron · Potong Titipan &amp; Bon Non-Tunai
                              </div>
                              <div className="text-[10px] text-cyan-700 font-medium">
                                Dipilih pada menu Pelunasan Bon Mitra (Tanpa Uang Kas Keluar/Masuk)
                              </div>
                            </>
                          ) : (
                            <div className="text-[11px] font-semibold text-amber-800">
                              Virtual Sistem · Kliring Piutang/Titipan
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-600">{rek.nomorRekening || '-'}</td>
                    <td className="py-3 px-4 text-right text-zinc-500 font-mono tabular-nums">
                      {formatRupiah(rek.saldoAwal)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-zinc-900">
                      <div
                        className={
                          isSinkronRek
                            ? 'text-cyan-800 font-mono text-sm tabular-nums'
                            : isVirtual
                            ? 'text-amber-800 font-mono tabular-nums'
                            : isAnakPerusahaan
                            ? rek.saldoSaatIni < 0
                              ? 'text-rose-700 font-mono text-sm tabular-nums'
                              : 'text-teal-800 font-mono text-sm tabular-nums'
                            : isPerusahaan
                            ? 'text-emerald-700 font-mono text-sm tabular-nums'
                            : 'text-indigo-800 font-mono text-sm tabular-nums'
                        }
                      >
                        {formatRupiah(rek.saldoSaatIni)}
                      </div>
                      {isSinkronRek && (
                        <div className="text-[10px] font-normal text-cyan-700 mt-0.5">
                          Total Volume Potong Bon Non-Tunai
                        </div>
                      )}
                      {isAnakPerusahaan && (
                        <div className="text-[10px] font-normal text-zinc-500 mt-0.5">
                          {rek.saldoSaatIni > 0
                            ? 'Dana PT Tersimpan'
                            : rek.saldoSaatIni < 0
                            ? 'Talangan Anak Perusahaan'
                            : 'Saldo Impas'}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-semibold ${
                          rek.status === 'AKTIF' ? 'text-emerald-800' : 'text-rose-700'
                        }`}
                      >
                        {rek.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        {isAnakPerusahaan && (
                          <>
                            <button
                              type="button"
                              onClick={() => setAnakPerusahaanModalKode(rek.kode)}
                              className="flex items-center space-x-1 px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded text-[11px] font-bold transition-colors cursor-pointer"
                              title="Simpan atau tarik dana terpadu (otomatis 1 transaksi di Rekening & Mitra)"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>Simpan / Tarik</span>
                            </button>
                            {onOpenStatement && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenStatement(
                                    linkedMitra?.id || rek.idMitraTerkait || 'MTR-DPPARABOT'
                                  )
                                }
                                className="flex items-center space-x-1 px-2 py-1 bg-white hover:bg-teal-50 text-teal-800 border border-teal-300 rounded text-[11px] font-bold transition-colors cursor-pointer"
                                title="Buka Rekening Koran Mitra terpadu"
                              >
                                <FileText className="w-3.5 h-3.5 text-teal-700" />
                                <span>Buku Mitra</span>
                              </button>
                            )}
                          </>
                        )}

                        {/* Tombol Perbarui Saldo Fleksibel */}
                        {!isVirtual ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openUpdateSaldoModal(rek)}
                              className="flex items-center space-x-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                              title="Perbarui nominal saldo rekening ini (fleksibel)"
                            >
                              <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Ubah Saldo</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => openEdit(rek)}
                              className="p-1.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded transition-colors cursor-pointer"
                              title="Edit Data Rekening"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <span
                            className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                              isSinkronRek
                                ? 'text-cyan-900 bg-cyan-50 border-cyan-200'
                                : 'text-amber-800 bg-amber-50 border-amber-200'
                            }`}
                          >
                            {isSinkronRek ? 'Otomatis Sinkron Bon' : 'Otomatis dari Nota'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MODAL 1: PERBARUI NOMINAL SALDO FLEKSIBEL (REQUESTED BY USER) */}
      {/* ============================================================ */}
      {showSaldoModal && selectedRekeningForSaldo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-gradient-to-r from-emerald-700 to-teal-800 text-white font-bold text-sm flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Wallet className="w-5 h-5 text-emerald-300" />
                <span>Perbarui Nominal Saldo (Fleksibel)</span>
              </div>
              <button
                onClick={() => setShowSaldoModal(false)}
                className="text-emerald-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSaldoSubmit} className="p-6 space-y-4 text-xs">
              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between font-bold text-emerald-950">
                  <span>Rekening Target:</span>
                  <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300">
                    {selectedRekeningForSaldo.kode}
                  </span>
                </div>
                <div className="text-xs text-emerald-900 font-semibold">
                  {selectedRekeningForSaldo.nama}
                </div>
                <div className="text-[11px] text-zinc-600">
                  Saldo Saat Ini di Sistem: <strong>{formatRupiah(selectedRekeningForSaldo.saldoSaatIni)}</strong>
                </div>
              </div>

              {/* Ganti Rekening jika ingin pilih yang lain */}
              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Pilih Rekening yang Akan Diubah:
                </label>
                <select
                  value={selectedRekeningForSaldo.kode}
                  onChange={(e) => {
                    const target = editableSaldoRekeningList.find((r) => r.kode === e.target.value);
                    if (target) {
                      setSelectedRekeningForSaldo(target);
                      setFormSaldoBaru(formatInputRibuan(target.saldoSaatIni));
                      setErrorMsg('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-600 bg-white"
                >
                  {editableSaldoRekeningList.map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.kode} - {r.nama} ({formatRupiah(r.saldoSaatIni)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Nominal Saldo Baru */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-zinc-800 text-xs">
                    Nominal Saldo Baru (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormSaldoBaru('0')}
                    className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  >
                    Set Rp 0
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-800 select-none">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={formSaldoBaru}
                    onChange={(e) => setFormSaldoBaru(formatInputRibuan(e.target.value))}
                    className="w-full pl-10 pr-3 py-2.5 border-2 border-emerald-500 rounded-xl font-mono text-base font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-emerald-50/20"
                    placeholder="Contoh: 25.000.000"
                  />
                </div>
                <div className="mt-1 text-xs font-bold text-emerald-800 flex items-center justify-between">
                  <span>Pratinjau:</span>
                  <span className="font-mono text-sm">{formatRupiah(parseInputNominal(formSaldoBaru))}</span>
                </div>
              </div>

              {/* Checkbox update Saldo Awal juga */}
              <label className="p-3 border border-zinc-200 rounded-xl bg-zinc-50 flex items-start space-x-2.5 cursor-pointer hover:bg-zinc-100/70 transition-colors">
                <input
                  type="checkbox"
                  checked={formUpdateSaldoAwal}
                  onChange={(e) => setFormUpdateSaldoAwal(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="font-bold text-zinc-900 text-xs">
                    Perbarui juga sebagai Saldo Awal Pembukuan
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Centang opsi ini jika Anda ingin nilai ini dijadikan patokan saldo awal baru dalam laporan keuangan.
                  </div>
                </div>
              </label>

              {/* Alasan / Catatan Penyesuaian */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Catatan / Alasan Penyesuaian (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Misal: Penyesuaian saldo riil fisik brankas toko..."
                  value={formAlasanSaldo}
                  onChange={(e) => setFormAlasanSaldo(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowSaldoModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-700 text-white font-bold rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submitting ? 'Menyimpan...' : 'Simpan Perubahan Saldo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: TAMBAH REKENING BARU                                 */}
      {/* ============================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-purple-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Tambah Rekening Baru</span>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-purple-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-800 mb-1.5 uppercase tracking-wider text-[10px]">
                  Klasifikasi Kategori Rekening:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label
                    className={`p-3 rounded-xl border flex flex-col cursor-pointer transition-all ${
                      formKategori === 'PERUSAHAAN'
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-bold'
                        : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="kategori"
                        value="PERUSAHAAN"
                        checked={formKategori === 'PERUSAHAAN'}
                        onChange={() => setFormKategori('PERUSAHAAN')}
                        className="text-emerald-600"
                      />
                      <span>Rekening Perusahaan</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-normal mt-1">
                      Penyimpanan fisik kas tunai &amp; bank resmi.
                    </span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex flex-col cursor-pointer transition-all ${
                      formKategori === 'ANAK_PERUSAHAAN'
                        ? 'border-teal-600 bg-teal-50/70 text-teal-950 font-bold'
                        : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="kategori"
                        value="ANAK_PERUSAHAAN"
                        checked={formKategori === 'ANAK_PERUSAHAAN'}
                        onChange={() => setFormKategori('ANAK_PERUSAHAAN')}
                        className="text-teal-600"
                      />
                      <span>Anak Perusahaan &amp; Mitra</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-normal mt-1">
                      Bukan bank (seperti DP Parabot), otomatis 1 transaksi dengan Mitra.
                    </span>
                  </label>

                  <label
                    className={`p-3 rounded-xl border flex flex-col cursor-pointer transition-all ${
                      formKategori === 'OPERASIONAL_DIVISI'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 font-bold'
                        : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="kategori"
                        value="OPERASIONAL_DIVISI"
                        checked={formKategori === 'OPERASIONAL_DIVISI'}
                        onChange={() => setFormKategori('OPERASIONAL_DIVISI')}
                        className="text-indigo-600"
                      />
                      <span>Operasional Divisi</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-normal mt-1">
                      Buku tracking alokasi kas unit usaha internal.
                    </span>
                  </label>
                </div>
              </div>

              {formKategori === 'OPERASIONAL_DIVISI' && (
                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1.5">
                  <label className="block font-bold text-indigo-950 text-[11px]">
                    Rekening Induk Perusahaan Penyimpan Uang Fisik:
                  </label>
                  <select
                    value={formIndukPenyimpan}
                    onChange={(e) => setFormIndukPenyimpan(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-600"
                  >
                    {rekeningPerusahaanList.map((p) => (
                      <option key={p.kode} value={p.kode}>
                        {p.kode} - {p.nama}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Kode Rekening</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BCA01 / BRI01"
                    value={formKode}
                    onChange={(e) => setFormKode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono focus:ring-1 focus:ring-purple-600 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Nama Rekening</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bank BCA Operasional"
                    value={formNama}
                    onChange={(e) => setFormNama(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Atas Nama</label>
                  <input
                    type="text"
                    required
                    value={formAtasNama}
                    onChange={(e) => setFormAtasNama(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Nomor Rekening</label>
                  <input
                    type="text"
                    placeholder="Nomor rekening bank..."
                    value={formNomor}
                    onChange={(e) => setFormNomor(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono focus:ring-1 focus:ring-purple-600"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Saldo Awal (Rp)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 10.000.000"
                  value={formSaldoAwal}
                  onChange={(e) => setFormSaldoAwal(formatInputRibuan(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono focus:ring-1 focus:ring-purple-600"
                />
                {formSaldoAwal && (
                  <div className="mt-1 text-[11px] font-mono text-zinc-500">
                    Pratinjau: {formatRupiah(parseInputNominal(formSaldoAwal))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Keterangan / Catatan</label>
                <input
                  type="text"
                  placeholder="e.g. Rekening cadangan belanja saprotan..."
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-700 text-white font-semibold rounded-lg hover:bg-purple-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Rekening'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: EDIT REKENING (DENGAN EDIT SALDO LENGKAP)            */}
      {/* ============================================================ */}
      {editingRekening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-purple-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Edit Rekening: {editingRekening.kode}</span>
              <button
                onClick={() => setEditingRekening(null)}
                className="text-purple-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Nama Rekening</label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Klasifikasi Kategori Akun</label>
                <select
                  value={formKategori}
                  onChange={(e) => setFormKategori(e.target.value as KategoriRekening)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600 font-semibold bg-white"
                >
                  <option value="PERUSAHAAN">PERUSAHAAN (Kas &amp; Bank Resmi)</option>
                  <option value="ANAK_PERUSAHAAN">ANAK PERUSAHAAN &amp; MITRA (1 Transaksi Terpadu)</option>
                  <option value="OPERASIONAL_DIVISI">OPERASIONAL DIVISI (Tracking Unit Usaha)</option>
                </select>
              </div>

              {formKategori === 'OPERASIONAL_DIVISI' && (
                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-1.5">
                  <label className="block font-bold text-indigo-950 text-[11px]">
                    Rekening Perusahaan Tempat Dana Fisik Disimpan:
                  </label>
                  <select
                    value={formIndukPenyimpan}
                    onChange={(e) => setFormIndukPenyimpan(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-indigo-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-600"
                  >
                    {rekeningPerusahaanList.map((p) => (
                      <option key={p.kode} value={p.kode}>
                        {p.kode} - {p.nama}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Atas Nama</label>
                  <input
                    type="text"
                    required
                    value={formAtasNama}
                    onChange={(e) => setFormAtasNama(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Nomor Rekening</label>
                  <input
                    type="text"
                    value={formNomor}
                    onChange={(e) => setFormNomor(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600 font-mono"
                  />
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Saldo Saat Ini & Saldo Awal (FLEKSIBEL DAPAT DIUBAH) */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <div>
                  <label className="block font-bold text-emerald-950 mb-1">
                    Saldo Saat Ini (Rp) <span className="text-emerald-700 font-normal">(Fleksibel)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formSaldoSaatIni}
                    onChange={(e) => setFormSaldoSaatIni(formatInputRibuan(e.target.value))}
                    className="w-full px-3 py-2 border border-emerald-400 bg-white rounded-lg font-mono font-bold text-emerald-950 focus:ring-1 focus:ring-emerald-600"
                  />
                  <div className="text-[10px] text-emerald-800 font-semibold mt-1">
                    {formatRupiah(parseInputNominal(formSaldoSaatIni))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-800 mb-1">
                    Saldo Awal Pembukuan (Rp)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formSaldoAwal}
                    onChange={(e) => setFormSaldoAwal(formatInputRibuan(e.target.value))}
                    className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg font-mono focus:ring-1 focus:ring-purple-600"
                  />
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {formatRupiah(parseInputNominal(formSaldoAwal))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Status Rekening</label>
                  <select
                    value={editingRekening.status}
                    onChange={(e) => setEditingRekening({ ...editingRekening, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600 font-semibold"
                  >
                    <option value="AKTIF">AKTIF</option>
                    <option value="NONAKTIF">NONAKTIF</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Alasan Penyesuaian Saldo</label>
                  <input
                    type="text"
                    placeholder="Alasan perubahan saldo..."
                    value={formAlasanPenyesuaian}
                    onChange={(e) => setFormAlasanPenyesuaian(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Keterangan</label>
                <input
                  type="text"
                  value={formKeterangan}
                  onChange={(e) => setFormKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-purple-600"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingRekening(null)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-purple-700 text-white font-semibold rounded-lg hover:bg-purple-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Perbarui Rekening & Saldo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: KONFIRMASI KOSONGKAN DATA UNTUK INPUT DATA RIIL      */}
      {/* ============================================================ */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-rose-700 text-white font-bold text-sm flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trash2 className="w-5 h-5" />
                <span>Kosongkan Semua Data Transaksi?</span>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="text-rose-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 space-y-2">
                <div className="font-bold flex items-center space-x-1.5 text-rose-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>PERINGATAN PEMBERSIHAN DATA:</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Tindakan ini akan mengosongkan seluruh data transaksi uji coba, supplier, mitra, dan catatan upah untuk disiapkan menerima <strong>input data riil pembukuan PT Wijaya Agro</strong>.
                </p>
                <p className="text-[11px] leading-relaxed">
                  <em>Daftar 35 Master Item (Hasil Bumi &amp; Barang Dagang) serta Master Rekening tetap terjaga aman.</em>
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowResetConfirmModal(false)}
                  disabled={isResettingClean}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteReset}
                  disabled={isResettingClean}
                  className="px-5 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg transition-colors shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  {isResettingClean && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isResettingClean ? 'Mengosongkan...' : 'Ya, Kosongkan Data Sekarang'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Transaksi Terpadu Anak Perusahaan & Mitra (1 Transaksi) */}
      <ModalTransaksiAnakPerusahaan
        isOpen={Boolean(anakPerusahaanModalKode)}
        onClose={() => setAnakPerusahaanModalKode(null)}
        rekeningList={rekeningList}
        targetRekeningKode={anakPerusahaanModalKode || 'REK-DPPARABO'}
        onSuccess={(receipt) => {
          setSuccessMsg(
            'Transaksi terpadu Anak Perusahaan & Mitra berhasil disimpan dalam 1 transaksi!'
          );
          onRefresh();
          if (receipt && onSuccessReceipt) {
            onSuccessReceipt(receipt);
          }
        }}
      />
    </div>
  );
};
