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
} from 'lucide-react';
import { Rekening, KategoriRekening } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  rekeningList: Rekening[];
  onRefresh: () => void;
}

type TabKategori = 'ALL' | 'PERUSAHAAN' | 'OPERASIONAL_DIVISI' | 'VIRTUAL_SISTEM';

export const MasterRekeningView: React.FC<Props> = ({ rekeningList, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<TabKategori>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRekening, setEditingRekening] = useState<Rekening | null>(null);

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
    if (r.kategori) return r.kategori;
    if (r.kode === 'BON01' || r.kode === 'TIT01') return 'VIRTUAL_SISTEM';
    if (r.kode.startsWith('REK-') || r.kode.startsWith('DIV-')) return 'OPERASIONAL_DIVISI';
    return 'PERUSAHAAN';
  };

  const rekeningPerusahaanList = rekeningList.filter((r) => getKategori(r) === 'PERUSAHAAN');
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

  const totalBukuOperasionalDivisi = rekeningOperasionalList
    .filter((r) => r.status === 'AKTIF')
    .reduce((sum, r) => sum + r.saldoSaatIni, 0);

  const totalPiutangBon = rekeningList.find((r) => r.kode === 'BON01')?.saldoSaatIni || 0;
  const totalTitipanHasilBumi = rekeningList.find((r) => r.kode === 'TIT01')?.saldoSaatIni || 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      await api.createRekening({
        kode: formKode.toUpperCase().trim(),
        nama: formNama.trim(),
        atasNama: formAtasNama.trim(),
        nomorRekening: formNomor.trim(),
        saldoAwal: Number(formSaldoAwal) || 0,
        keterangan: formKeterangan.trim(),
        kategori: formKategori,
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
      const numSaldoSaatIni = Number(formSaldoSaatIni);
      const numSaldoAwal = Number(formSaldoAwal);

      await api.updateRekening(editingRekening.kode, {
        nama: formNama.trim(),
        atasNama: formAtasNama.trim(),
        nomorRekening: formNomor.trim(),
        status: editingRekening.status,
        keterangan: formKeterangan.trim(),
        kategori: formKategori,
        rekeningIndukPenyimpan: formKategori === 'OPERASIONAL_DIVISI' ? formIndukPenyimpan : undefined,
        saldoSaatIni: !isNaN(numSaldoSaatIni) ? numSaldoSaatIni : undefined,
        saldoAwal: !isNaN(numSaldoAwal) ? numSaldoAwal : undefined,
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
    setFormSaldoAwal(String(rek.saldoAwal));
    setFormSaldoSaatIni(String(rek.saldoSaatIni));
    setFormAlasanPenyesuaian('');
    setFormKeterangan(rek.keterangan || '');
    setFormKategori(getKategori(rek));
    setFormIndukPenyimpan(rek.rekeningIndukPenyimpan || 'KAS01');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const openUpdateSaldoModal = (rek?: Rekening) => {
    const target = rek || displayedList[0] || rekeningList[0];
    setSelectedRekeningForSaldo(target);
    setFormSaldoBaru(target ? String(target.saldoSaatIni) : '0');
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
      const numSaldo = Number(formSaldoBaru);
      if (isNaN(numSaldo)) throw new Error('Nominal saldo baru harus berupa angka valid');

      await api.updateSaldoRekening(
        selectedRekeningForSaldo.kode,
        numSaldo,
        formUpdateSaldoAwal,
        formAlasanSaldo.trim() || undefined
      );

      setSuccessMsg(
        `Saldo ${selectedRekeningForSaldo.nama} (${selectedRekeningForSaldo.kode}) berhasil diubah menjadi ${formatRupiah(numSaldo)}`
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
      const res = await fetch('/api/database/reset-clean', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Gagal mengosongkan data');
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {/* Card 1: Rekening Perusahaan */}
        <div className="p-4 bg-white rounded-xl border-2 border-emerald-500/80 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center space-x-1">
              <Landmark className="w-3.5 h-3.5 text-emerald-600" />
              <span>REKENING PERUSAHAAN</span>
            </span>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
              PENYIMPANAN RIIL
            </span>
          </div>
          <p className="text-lg font-black text-emerald-950">
            {formatRupiah(totalDanaFisikPerusahaan)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Total kas fisik di laci/brankas kasir &amp; seluruh rekening bank resmi perusahaan ({rekeningPerusahaanList.length} rekening).
          </p>
        </div>

        {/* Card 2: Rekening Operasional Divisi */}
        <div className="p-4 bg-white rounded-xl border-2 border-indigo-400/80 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider flex items-center space-x-1">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>OPERASIONAL DIVISI</span>
            </span>
            <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded">
              TRACKING PERGERAKAN
            </span>
          </div>
          <p className="text-lg font-black text-indigo-950">
            {formatRupiah(totalBukuOperasionalDivisi)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Akumulasi alokasi pergerakan kas 6 divisi operasional. <em>Uang fisiknya tetap di Rekening Perusahaan.</em>
          </p>
        </div>

        {/* Card 3: Piutang BON01 */}
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              PIUTANG BON01
            </span>
            <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
              VIRTUAL
            </span>
          </div>
          <p className="text-lg font-black text-amber-900">
            {formatRupiah(totalPiutangBon)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Total kasbon barang toko &amp; pinjaman uang mitra/karyawan yang belum lunas.
          </p>
        </div>

        {/* Card 4: Titip TIT01 */}
        <div className="p-4 bg-white rounded-xl border border-zinc-200 shadow-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-800 uppercase tracking-wider">
              TITIPAN TIT01
            </span>
            <span className="text-[9px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded">
              VIRTUAL
            </span>
          </div>
          <p className="text-lg font-black text-purple-900">
            {formatRupiah(totalTitipanHasilBumi)}
          </p>
          <p className="text-[11px] text-zinc-500 leading-tight">
            Hasil panen petani/mitra yang belum dicairkan ke kas/bank.
          </p>
        </div>
      </div>

      {/* Fundamental Business Rule Banner */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-2">
        <div className="flex items-center space-x-2 font-bold text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Aturan Tata Kelola Keuangan ERP Wijaya Agro:</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-emerald-900">
          <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 space-y-1">
            <strong className="text-emerald-950 font-bold">1. Rekening Perusahaan (Penyimpanan Fisik Uang):</strong>
            <p className="text-zinc-600">
              Meliputi <strong>KAS01 (Kas Utama Kasir)</strong> dan rekening bank giro (BNI, BCA, Mandiri, BRI, BSI). Seluruh nominal saldo bersifat fleksibel dan dapat diubah kapan saja agar seimbang dengan catatan manual Anda.
            </p>
          </div>
          <div className="p-2.5 bg-white/80 rounded-lg border border-emerald-200 space-y-1">
            <strong className="text-indigo-950 font-bold">2. Rekening Operasional Divisi (Buku Tracking Alokasi):</strong>
            <p className="text-zinc-600">
              Digunakan <strong>hanya untuk mengetahui pergerakan uang &amp; upah harian</strong> masing-masing unit bisnis (Gudang, Karya, Transport, CV, Perkasa, Okussa). Penyimpanannya tetap menggunakan Rekening Perusahaan induk.
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
                const isVirtual = rek.kode === 'BON01' || rek.kode === 'TIT01';
                const kat = getKategori(rek);
                const isPerusahaan = kat === 'PERUSAHAAN';
                const isDivisi = kat === 'OPERASIONAL_DIVISI';
                const storageParent = rekeningList.find((r) => r.kode === rek.rekeningIndukPenyimpan);

                return (
                  <tr key={rek.kode} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">
                      <span className="px-2 py-0.5 rounded bg-zinc-100 border border-zinc-200">
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
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 inline-block border border-emerald-200">
                          REKENING PERUSAHAAN
                        </span>
                      )}
                      {isDivisi && (
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 inline-block border border-indigo-200">
                            OPERASIONAL DIVISI
                          </span>
                          <div className="text-[10px] text-indigo-700 font-medium">
                            Disimpan di: <strong className="underline">{storageParent ? `${storageParent.kode} - ${storageParent.nama}` : 'KAS01 (Kas Perusahaan)'}</strong>
                          </div>
                        </div>
                      )}
                      {isVirtual && (
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 inline-block border border-amber-200">
                            VIRTUAL SISTEM
                          </span>
                          <div className="text-[10px] text-amber-700 font-medium">
                            Kliring Piutang / Titipan
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-600">{rek.nomorRekening || '-'}</td>
                    <td className="py-3 px-4 text-right text-zinc-500">{formatRupiah(rek.saldoAwal)}</td>
                    <td className="py-3 px-4 text-right font-bold text-zinc-900">
                      <span
                        className={
                          isVirtual
                            ? 'text-amber-800 font-mono'
                            : isPerusahaan
                            ? 'text-emerald-700 font-mono text-sm'
                            : 'text-indigo-800 font-mono text-sm'
                        }
                      >
                        {formatRupiah(rek.saldoSaatIni)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          rek.status === 'AKTIF'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {rek.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        {/* Tombol Perbarui Saldo Fleksibel */}
                        <button
                          type="button"
                          onClick={() => openUpdateSaldoModal(rek)}
                          className="flex items-center space-x-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-bold transition-colors cursor-pointer"
                          title="Perbarui nominal saldo rekening ini (fleksibel)"
                        >
                          <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Ubah Saldo</span>
                        </button>

                        {!isVirtual && (
                          <button
                            type="button"
                            onClick={() => openEdit(rek)}
                            className="p-1.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded transition-colors cursor-pointer"
                            title="Edit Data Rekening"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
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
                    const target = rekeningList.find((r) => r.kode === e.target.value);
                    if (target) {
                      setSelectedRekeningForSaldo(target);
                      setFormSaldoBaru(String(target.saldoSaatIni));
                    }
                  }}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-600 bg-white"
                >
                  {rekeningList.map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.kode} - {r.nama} ({formatRupiah(r.saldoSaatIni)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Nominal Saldo Baru */}
              <div>
                <label className="block font-bold text-zinc-800 mb-1 text-xs">
                  Nominal Saldo Baru (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="1000"
                  required
                  value={formSaldoBaru}
                  onChange={(e) => setFormSaldoBaru(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-emerald-500 rounded-xl font-mono text-base font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-600 bg-emerald-50/20"
                  placeholder="Masukkan nominal saldo riil..."
                />
                <div className="mt-1 text-xs font-bold text-emerald-800 flex items-center justify-between">
                  <span>Pratinjau:</span>
                  <span className="font-mono text-sm">{formatRupiah(Number(formSaldoBaru) || 0)}</span>
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
                <div className="grid grid-cols-2 gap-3">
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
                      Penyimpanan fisik kas tunai &amp; rekening bank resmi.
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
                      Buku tracking alokasi kas unit usaha (uang di kas perusahaan).
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

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Saldo Awal (Rp)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formSaldoAwal}
                  onChange={(e) => setFormSaldoAwal(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono focus:ring-1 focus:ring-purple-600"
                />
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

              {/* Saldo Saat Ini & Saldo Awal (FLEKSIBEL DAPAT DIUBAH) */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                <div>
                  <label className="block font-bold text-emerald-950 mb-1">
                    Saldo Saat Ini (Rp) <span className="text-emerald-700 font-normal">(Fleksibel)</span>
                  </label>
                  <input
                    type="number"
                    step="1000"
                    value={formSaldoSaatIni}
                    onChange={(e) => setFormSaldoSaatIni(e.target.value)}
                    className="w-full px-3 py-2 border border-emerald-400 bg-white rounded-lg font-mono font-bold text-emerald-950 focus:ring-1 focus:ring-emerald-600"
                  />
                  <div className="text-[10px] text-emerald-800 font-semibold mt-1">
                    {formatRupiah(Number(formSaldoSaatIni) || 0)}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-800 mb-1">
                    Saldo Awal Pembukuan (Rp)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    value={formSaldoAwal}
                    onChange={(e) => setFormSaldoAwal(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg font-mono focus:ring-1 focus:ring-purple-600"
                  />
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {formatRupiah(Number(formSaldoAwal) || 0)}
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
    </div>
  );
};
