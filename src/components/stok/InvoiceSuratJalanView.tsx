import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  Printer,
  Download,
  Trash2,
  CreditCard,
  TrendingUp,
  Eye,
  AlertCircle,
  X,
  Pencil,
  ArrowDownLeft,
  RotateCcw,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  InvoiceSuratJalanRecord,
  Mitra,
  RekapCtrContract,
  Rekening,
  StokHasilBumi,
  isInternalMilikSendiriSuratJalan,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import {
  downloadInvoiceSuratJalanPdf,
  getSuratJalanDetails,
  printInvoiceSuratJalan,
} from '../../utils/suratJalanPrint.ts';
import { ModalInvoiceSuratJalan } from './ModalInvoiceSuratJalan.tsx';
import { RekapCtrSuratJalanTable } from './RekapCtrSuratJalanTable.tsx';

interface InvoiceSuratJalanViewProps {
  rekeningList: Rekening[];
  mitraList: Mitra[];
  stokHasilBumiList: StokHasilBumi[];
  onRefreshParent?: () => void;
}

export const InvoiceSuratJalanView: React.FC<InvoiceSuratJalanViewProps> = ({
  rekeningList,
  mitraList,
  stokHasilBumiList,
  onRefreshParent,
}) => {
  const [activeSubView, setActiveSubView] = useState<'INVOICE' | 'REKAP_CTR'>('INVOICE');
  const [invoices, setInvoices] = useState<InvoiceSuratJalanRecord[]>([]);
  const [rekapCtrList, setRekapCtrList] = useState<RekapCtrContract[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showModalInput, setShowModalInput] = useState<boolean>(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceSuratJalanRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | 'PENDING' | 'SIAP_BAYAR' | 'LUNAS'>('SEMUA');
  const [ctrFilter, setCtrFilter] = useState<string>('SEMUA');

  const getTodayDmy = () => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  };

  // Preview Detail Modal
  const [previewTarget, setPreviewTarget] = useState<InvoiceSuratJalanRecord | null>(null);

  // Modal Tahap 1: Terima Uang Masuk Buyer
  const [terimaBuyerTarget, setTerimaBuyerTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [terimaBuyerTanggal, setTerimaBuyerTanggal] = useState<string>(getTodayDmy);
  const [terimaBuyerRekening, setTerimaBuyerRekening] = useState<string>('BNI01');
  const [terimaBuyerNominal, setTerimaBuyerNominal] = useState<string>('');
  const [terimaBuyerCatatan, setTerimaBuyerCatatan] = useState<string>('');
  const [terimaBuyerLoading, setTerimaBuyerLoading] = useState<boolean>(false);

  // Modal Konfirmasi Batalkan Tahap 1
  const [batalBuyerTarget, setBatalBuyerTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [batalBuyerLoading, setBatalBuyerLoading] = useState<boolean>(false);

  // Modal Tahap 2: Pencairan / Bayar Hak Mitra
  const [cairkanTarget, setCairkanTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [cairkanTanggal, setCairkanTanggal] = useState<string>(getTodayDmy);
  const [cairkanRekening, setCairkanRekening] = useState<string>('BNI01');
  const [cairkanCatatKas, setCairkanCatatKas] = useState<boolean>(true);
  const [cairkanLoading, setCairkanLoading] = useState<boolean>(false);

  // Modal Konfirmasi Hapus
  const [deleteTarget, setDeleteTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const activeRealRekeningList = useMemo(
    () => rekeningList.filter((r) => !r.isVirtual && r.status === 'AKTIF'),
    [rekeningList]
  );

  const getRekDisplayLabel = (r: Rekening) =>
    r.kode === 'BNI01' && !/direct/i.test(r.nama || '') ? 'BNI DIRECT' : r.nama;

  const getDefaultBniKode = () => {
    const bni = activeRealRekeningList.find(
      (r) => r.kode === 'BNI01' || /bni\s*direct/i.test(r.nama || '')
    );
    return bni?.kode || activeRealRekeningList[0]?.kode || 'BNI01';
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [data, ctrData] = await Promise.all([
        api.getInvoiceSuratJalan(),
        api.getRekapCtr().catch(() => [] as RekapCtrContract[]),
      ]);
      setInvoices(Array.isArray(data) ? data : []);
      setRekapCtrList(Array.isArray(ctrData) ? ctrData : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat rekapitulasi invoice surat jalan');
    } finally {
      setLoading(false);
    }
  };

  const ctrByIdMap = useMemo(() => {
    const map = new Map<string, RekapCtrContract>();
    for (const c of rekapCtrList) {
      map.set(c.id, c);
    }
    return map;
  }, [rekapCtrList]);

  useEffect(() => {
    loadData();
    const defKode = getDefaultBniKode();
    setCairkanRekening(defKode);
    setTerimaBuyerRekening(defKode);
  }, [rekeningList]);

  const summary = useMemo(() => {
    let omzetBuyer = 0;
    let untungPt = 0;
    let pendingHak = 0;
    let lunasHak = 0;
    let totalTonaseKg = 0;
    let totalKomisi = 0;
    let stokHbCount = 0;
    let stokHbOmzet = 0;
    let siapBayarCount = 0;
    let danaBuyerMenungguTransfer = 0;
    let hakSiapBayar = 0;

    for (const inv of invoices) {
      const valBuyer = inv.totalPenjualanBuyer || inv.totalPenjualanMitra || 0;
      omzetBuyer += valBuyer;
      untungPt += inv.totalKeuntunganPt || 0;
      totalTonaseKg += inv.tonaseAkhirKg || 0;
      totalKomisi += inv.komisiNominal || 0;
      if (isInternalMilikSendiriSuratJalan(inv)) {
        stokHbCount += 1;
        stokHbOmzet += valBuyer;
        continue;
      }
      if (inv.statusPembayaranMitra === 'PENDING') {
        pendingHak += inv.jumlahPembayaranMitra || 0;
        if (inv.statusUangBuyer === 'DITERIMA') {
          siapBayarCount += 1;
          danaBuyerMenungguTransfer += inv.nominalUangBuyerMasuk || valBuyer;
          hakSiapBayar += inv.jumlahPembayaranMitra || 0;
        }
      } else {
        lunasHak += inv.jumlahPembayaranMitra || 0;
      }
    }

    return {
      omzetBuyer,
      untungPt,
      pendingHak,
      lunasHak,
      totalTonaseKg,
      totalKomisi,
      stokHbCount,
      stokHbOmzet,
      siapBayarCount,
      danaBuyerMenungguTransfer,
      hakSiapBayar,
      pendingCount: invoices.filter(
        (i) => !isInternalMilikSendiriSuratJalan(i) && i.statusPembayaranMitra === 'PENDING'
      ).length,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const isOwnSale = isInternalMilikSendiriSuratJalan(inv);
      const isOwnSettled =
        isOwnSale && (inv.statusUangBuyer === 'DITERIMA' || inv.statusPembayaranMitra === 'LUNAS');
      if (statusFilter === 'PENDING') {
        if (isOwnSale ? isOwnSettled : inv.statusPembayaranMitra !== 'PENDING') {
          return false;
        }
      }
      if (
        statusFilter === 'SIAP_BAYAR' &&
        (isOwnSale || inv.statusPembayaranMitra !== 'PENDING' || inv.statusUangBuyer !== 'DITERIMA')
      ) {
        return false;
      }
      if (statusFilter === 'LUNAS') {
        if (isOwnSale ? !isOwnSettled : inv.statusPembayaranMitra !== 'LUNAS') {
          return false;
        }
      }
      if (ctrFilter !== 'SEMUA' && inv.rekapCtrId !== ctrFilter) {
        return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const details = getSuratJalanDetails(inv);
      const matchDetail = details.some(
        (d) =>
          (d.deskripsi && d.deskripsi.toLowerCase().includes(q)) ||
          (d.platTruk && d.platTruk.toLowerCase().includes(q)) ||
          (d.keterangan && d.keterangan.toLowerCase().includes(q))
      );
      const linkedCtr = inv.rekapCtrId ? ctrByIdMap.get(inv.rekapCtrId) : undefined;
      const ctrSearchText = [
        linkedCtr ? `ctr #${linkedCtr.noUrut}` : inv.rekapCtrNoUrut ? `ctr #${inv.rekapCtrNoUrut}` : '',
        linkedCtr?.noKontrak || inv.rekapCtrNoKontrak || '',
        linkedCtr?.tglCtr || '',
      ]
        .join(' ')
        .toLowerCase();

      return (
        inv.noInvoice.toLowerCase().includes(q) ||
        inv.namaMitra.toLowerCase().includes(q) ||
        (inv.kategoriKode && inv.kategoriKode.toLowerCase().includes(q)) ||
        (inv.komoditasNama && inv.komoditasNama.toLowerCase().includes(q)) ||
        (inv.platTruk && inv.platTruk.toLowerCase().includes(q)) ||
        (inv.noPenjualanHasilBumi && inv.noPenjualanHasilBumi.toLowerCase().includes(q)) ||
        inv.tanggal.toLowerCase().includes(q) ||
        ctrSearchText.includes(q) ||
        matchDetail
      );
    });
  }, [invoices, statusFilter, ctrFilter, searchQuery, ctrByIdMap]);

  const openTerimaBuyerModal = (inv: InvoiceSuratJalanRecord) => {
    const defaultNom = Math.round(Number(inv.totalPenjualanBuyer || inv.totalPenjualanMitra) || 0);
    setTerimaBuyerTarget(inv);
    setTerimaBuyerTanggal(getTodayDmy());
    setTerimaBuyerRekening(inv.rekeningPtKode || getDefaultBniKode());
    setTerimaBuyerNominal(String(defaultNom));
    setTerimaBuyerCatatan('');
  };

  const handleTerimaBuyer = async () => {
    if (!terimaBuyerTarget) return;
    const parsedNominal = Math.round(Number(terimaBuyerNominal.replace(/[^\d]/g, '')) || 0);
    if (parsedNominal <= 0) {
      setErrorMsg('Nominal uang masuk buyer harus lebih dari Rp 0');
      return;
    }
    setTerimaBuyerLoading(true);
    setErrorMsg(null);
    try {
      await api.terimaUangBuyerSuratJalan({
        idInvoice: terimaBuyerTarget.id,
        rekeningTujuan: terimaBuyerRekening,
        tanggal: terimaBuyerTanggal,
        nominalMasuk: parsedNominal,
        catatan: terimaBuyerCatatan.trim() || undefined,
      });
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onRefreshParent?.();
      loadData();
      setTerimaBuyerTarget(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mencatat uang masuk buyer');
    } finally {
      setTerimaBuyerLoading(false);
    }
  };

  const handleBatalTerimaBuyer = async () => {
    if (!batalBuyerTarget) return;
    setBatalBuyerLoading(true);
    setErrorMsg(null);
    try {
      await api.batalTerimaUangBuyerSuratJalan(batalBuyerTarget.id);
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onRefreshParent?.();
      loadData();
      setBatalBuyerTarget(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membatalkan penerimaan uang buyer');
    } finally {
      setBatalBuyerLoading(false);
    }
  };

  const openCairkanModal = (inv: InvoiceSuratJalanRecord) => {
    setCairkanTarget(inv);
    setCairkanTanggal(getTodayDmy());
    setCairkanRekening(inv.rekeningTerimaBuyerKode || inv.rekeningPtKode || getDefaultBniKode());
    // Default Kas Riil jika Tahap 1 sudah masuk ke rekening PT, agar saldo bank otomatis klop
    setCairkanCatatKas(inv.statusUangBuyer === 'DITERIMA');
  };

  const handleCairkanInvoice = async () => {
    if (!cairkanTarget) return;
    setCairkanLoading(true);
    setErrorMsg(null);
    try {
      await api.cairkanInvoiceSuratJalan({
        idInvoice: cairkanTarget.id,
        rekeningSumber: cairkanRekening,
        tanggal: cairkanTanggal,
        catatArusKas: cairkanCatatKas,
      });
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onRefreshParent?.();
      loadData();
      setCairkanTarget(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal mencairkan hak mitra surat jalan');
    } finally {
      setCairkanLoading(false);
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setErrorMsg(null);
    try {
      await api.deleteInvoiceSuratJalan(deleteTarget.id);
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onRefreshParent?.();
      loadData();
      setDeleteTarget(null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membatalkan transaksi surat jalan');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-sky-900 text-white rounded-xl shadow-xs">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Rekap Invoice Surat Jalan Penjualan
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-Partai per Invoice · Jembatan Arus Kas BNI DIRECT · Komisi PT WAP &amp; Pending Order
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-center">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Segarkan Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingInvoice(null);
              setShowModalInput(true);
            }}
            className="px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Buat Invoice Surat Jalan</span>
          </button>
        </div>
      </div>

      {/* Sub-View Switcher Tabs */}
      <div className="bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs inline-flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveSubView('INVOICE')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeSubView === 'INVOICE'
              ? 'bg-sky-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Daftar Invoice Surat Jalan
        </button>
        <button
          type="button"
          onClick={() => setActiveSubView('REKAP_CTR')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
            activeSubView === 'REKAP_CTR'
              ? 'bg-sky-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Rekap Data CTR (REKAP CTR WAP)
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="p-1 text-rose-600 hover:text-rose-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeSubView === 'REKAP_CTR' ? (
        <RekapCtrSuratJalanTable
          mitraList={mitraList}
          onDataSynced={() => {
            loadData();
            onRefreshParent?.();
          }}
        />
      ) : (
        <>

      {/* 4 Kartu Ringkasan Eksekutif */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl bg-white border border-sky-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-sky-800 uppercase tracking-wider">
              Omzet Buyer (BNI DIRECT)
            </span>
            <div className="p-1.5 bg-sky-100 text-sky-800 rounded-lg">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="font-mono text-lg sm:text-xl font-extrabold text-sky-950 tabular-nums">
              {formatRupiah(summary.omzetBuyer)}
            </div>
            <div className="text-[10px] text-sky-700 mt-0.5 tabular-nums">
              Total Tonase: {summary.totalTonaseKg.toLocaleString('id-ID')} Kg
              {summary.stokHbCount > 0 ? ` · ${summary.stokHbCount} Stok HB PT` : ''}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider">
              Keuntungan PT WAP
            </span>
            <div className="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="font-mono text-lg sm:text-xl font-extrabold text-indigo-950 tabular-nums">
              {formatRupiah(summary.untungPt)}
            </div>
            <div className="text-[10px] text-indigo-700 mt-0.5 tabular-nums">
              Komisi Jasa: {formatRupiah(summary.totalKomisi)} · Otomatis masuk Arus Kas PT WAP (REK-WAP)
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              Pending Hak Mitra
            </span>
            <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="font-mono text-lg sm:text-xl font-extrabold text-amber-950 tabular-nums">
              {formatRupiah(summary.pendingHak)}
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5 tabular-nums">
              {summary.siapBayarCount > 0
                ? `${summary.siapBayarCount} siap bayar (${formatRupiah(summary.hakSiapBayar)}) · ${summary.pendingCount} total pending`
                : `${summary.pendingCount} Nota Pending Order`}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Hak Mitra Lunas
            </span>
            <div className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="font-mono text-lg sm:text-xl font-extrabold text-emerald-950 tabular-nums">
              {formatRupiah(summary.lunasHak)}
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5">
              {summary.stokHbCount > 0
                ? `Stok HB Sendiri: ${formatRupiah(summary.stokHbOmzet)}`
                : 'Telah Ditransfer Keluar'}
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['SEMUA', 'PENDING', 'SIAP_BAYAR', 'LUNAS'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-sky-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st === 'SEMUA'
                ? 'Semua Status'
                : st === 'PENDING'
                ? `Pending Order${summary.pendingCount > 0 ? ` (${summary.pendingCount})` : ''}`
                : st === 'SIAP_BAYAR'
                ? `Buyer Masuk · Siap Bayar${summary.siapBayarCount > 0 ? ` (${summary.siapBayarCount})` : ''}`
                : 'Lunas'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {rekapCtrList.length > 0 && (
            <select
              value={ctrFilter}
              onChange={(e) => setCtrFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 max-w-[240px]"
              title="Filter berdasarkan Nomor Kontrak CTR"
            >
              <option value="SEMUA">Semua Kontrak CTR</option>
              {[...rekapCtrList]
                .sort((a, b) => (b.noUrut || 0) - (a.noUrut || 0))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    CTR #{c.noUrut}
                    {c.noKontrak ? ` · ${c.noKontrak}` : ''} ({c.gudang} · {c.tglCtr})
                  </option>
                ))}
            </select>
          )}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari Invoice, Kontrak, Mitra, Truk..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-sky-600"
            />
          </div>
        </div>
      </div>

      {/* Tabel Data Rekapitulasi */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3">No. Invoice &amp; Tanggal</th>
                <th className="px-3.5 py-3">Mitra &amp; Truk</th>
                <th className="px-3.5 py-3">Komoditas &amp; Partai</th>
                <th className="px-3.5 py-3 text-right">Basis &amp; Rendemen</th>
                <th className="px-3.5 py-3 text-right">Uang Buyer (BNI)</th>
                <th className="px-3.5 py-3 text-right">Keuntungan PT</th>
                <th className="px-3.5 py-3 text-right">Hak Bersih Mitra</th>
                <th className="px-3.5 py-3 text-center">Status</th>
                <th className="px-3.5 py-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Memuat data invoice surat jalan...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    Belum ada data invoice surat jalan. Klik{' '}
                    <strong className="text-sky-800">Buat Invoice Surat Jalan</strong> untuk
                    memulai.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const details = getSuratJalanDetails(inv);
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-3 align-top">
                        <div className="font-mono font-bold text-sky-900">{inv.noInvoice}</div>
                        <div className="text-[11px] text-slate-500">
                          {inv.tanggal} · Buyer:{' '}
                          <span className="font-bold text-slate-700">
                            {inv.kategoriKode || 'SKA'}
                          </span>
                        </div>
                        {(() => {
                          const linkedCtr = inv.rekapCtrId ? ctrByIdMap.get(inv.rekapCtrId) : undefined;
                          const ctrNo = linkedCtr?.noUrut ?? inv.rekapCtrNoUrut;
                          const ctrCode = linkedCtr?.noKontrak || inv.rekapCtrNoKontrak;
                          if (!ctrNo && !ctrCode) return null;
                          return (
                            <div className="text-[10px] font-mono font-bold text-indigo-700 mt-0.5">
                              {ctrNo ? `CTR #${ctrNo}` : 'CTR'}
                              {ctrCode ? ` · ${ctrCode}` : ''}
                              {linkedCtr?.tglCtr ? ` (${linkedCtr.tglCtr})` : ''}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3.5 py-3 align-top">
                        <div className="font-bold text-slate-900">{inv.namaMitra}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {inv.platTruk || '-'}
                          {inv.sumberBarang === 'STOK_HB_PT' && inv.noPenjualanHasilBumi
                            ? ` · ${inv.noPenjualanHasilBumi}`
                            : ''}
                        </div>
                        {isInternalMilikSendiriSuratJalan(inv) && (
                          <div className="text-[10px] font-semibold text-sky-700 mt-0.5">
                            Penjualan Milik Sendiri
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 align-top">
                        <div className="font-semibold text-slate-800">
                          {inv.komoditasNama}
                          {details.length > 1 && (
                            <span className="text-sky-700 font-bold">
                              {' '}
                              · {details.length} Partai
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-600 tabular-nums">
                          Total {inv.tonaseAkhirKg.toLocaleString('id-ID')} Kg
                          {inv.susutKg ? ` (Susut ${inv.susutKg} Kg)` : ''}
                        </div>
                        {details.length > 1 && (
                          <div className="mt-1 space-y-0.5 text-[10px] text-slate-500 font-mono tabular-nums">
                            {details.map((d, idx) => (
                              <div key={d.id || idx}>
                                P{idx + 1}: {d.tonaseAkhirKg.toLocaleString('id-ID')} Kg · Rp{' '}
                                {d.hargaPerKgMitra.toLocaleString('id-ID', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right align-top tabular-nums">
                        <div className="text-[11px] text-slate-700">
                          Basis: {formatRupiah(inv.basisMitra)}
                        </div>
                        {details.length === 1 ? (
                          <div className="text-[10px] text-indigo-700">
                            Buyer: {formatRupiah(inv.basisBuyer)} · {inv.rendemen.toFixed(2)}%
                          </div>
                        ) : (
                          <div className="text-[10px] text-indigo-700 space-y-0.5 mt-0.5">
                            {details.map((d, idx) => (
                              <div key={d.id || idx}>
                                R{idx + 1}: {d.rendemen.toFixed(2)}%
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-cyan-900 align-top tabular-nums">
                        <div>{formatRupiah(inv.totalPenjualanBuyer || inv.totalPenjualanMitra)}</div>
                        {inv.statusUangBuyer === 'DITERIMA' ? (
                          <div className="text-[10px] font-sans font-semibold text-sky-700 mt-0.5">
                            Masuk {inv.rekeningTerimaBuyerKode || inv.rekeningPtKode} ·{' '}
                            {inv.tanggalUangBuyerMasuk || inv.tanggal}
                            {inv.nominalUangBuyerMasuk &&
                              Math.round(inv.nominalUangBuyerMasuk) !==
                                Math.round(inv.totalPenjualanBuyer || inv.totalPenjualanMitra) && (
                                <div className="font-mono text-slate-500">
                                  Aktual: {formatRupiah(inv.nominalUangBuyerMasuk)}
                                </div>
                              )}
                          </div>
                        ) : (
                          inv.sumberBarang === 'STOK_HB_PT' &&
                          inv.catatArusKas === false && (
                            <div className="text-[10px] font-sans font-normal text-slate-500">
                              Rekap SJ · Non-Kas
                            </div>
                          )
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-indigo-900 align-top tabular-nums">
                        <div className="font-bold">{formatRupiah(inv.totalKeuntunganPt)}</div>
                        <div className="text-[10px] text-slate-400">
                          {isInternalMilikSendiriSuratJalan(inv)
                            ? `Pajak ${formatRupiah(inv.pajakNominal)} · Komisi ${formatRupiah(inv.komisiNominal)}`
                            : `Margin ${formatRupiah(inv.marginHargaPt)} + Komisi ${formatRupiah(inv.komisiNominal)}`}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-900 align-top tabular-nums">
                        {isInternalMilikSendiriSuratJalan(inv) ? (
                          <div>
                            <div className="text-sky-800 font-sans">Milik Sendiri</div>
                            <div className="text-[10px] font-sans font-normal text-slate-500">
                              Tanpa bayar mitra
                            </div>
                          </div>
                        ) : (
                          <>
                            <div>{formatRupiah(inv.jumlahPembayaranMitra)}</div>
                            {inv.kasbonNominal > 0 && (
                              <div className="text-[10px] text-amber-700">
                                Potong Bon: {formatRupiah(inv.kasbonNominal)}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-center align-top">
                        {isInternalMilikSendiriSuratJalan(inv) ? (
                          inv.statusUangBuyer === 'DITERIMA' ? (
                            <div className="text-[11px]">
                              <div className="font-bold text-emerald-700">Dana Masuk (Lunas)</div>
                              <div className="text-[10px] text-slate-500">
                                Milik Sendiri · {inv.rekeningTerimaBuyerKode || inv.rekeningPtKode}
                              </div>
                            </div>
                          ) : inv.sumberBarang === 'STOK_HB_PT' &&
                            inv.statusPembayaranMitra === 'LUNAS' ? (
                            <div className="text-[11px] font-bold text-sky-700">
                              <div>Stok HB PT</div>
                              <div className="text-[10px] font-normal text-slate-500">
                                {inv.catatArusKas === false ? 'Rekap SJ' : 'Masuk BNI'}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px]">
                              <div className="font-bold text-amber-700">Menunggu Buyer</div>
                              <div className="text-[10px] text-slate-400">Penjualan Sendiri</div>
                            </div>
                          )
                        ) : inv.statusPembayaranMitra === 'LUNAS' ? (
                          <div className="text-[11px]">
                            <div className="font-bold text-emerald-700">Lunas Ditransfer</div>
                            <div className="text-[10px] text-slate-500 tabular-nums">
                              {inv.catatArusKasBayarMitra
                                ? `Kas Riil · ${inv.rekeningBayarMitraKode || inv.rekeningPtKode}`
                                : `Non-Kas · ${inv.rekeningPtKode || 'BNI01'}`}
                            </div>
                            {inv.statusUangBuyer === 'DITERIMA' && (
                              <div className="text-[10px] font-mono text-indigo-700 tabular-nums">
                                Sisa PT:{' '}
                                {formatRupiah(
                                  Math.round(
                                    (inv.nominalUangBuyerMasuk ||
                                      inv.totalPenjualanBuyer ||
                                      inv.totalPenjualanMitra ||
                                      0) -
                                      (inv.nominalBayarMitraAktual ?? inv.jumlahPembayaranMitra ?? 0)
                                  )
                                )}
                              </div>
                            )}
                          </div>
                        ) : inv.statusUangBuyer === 'DITERIMA' ? (
                          <div className="text-[11px]">
                            <div className="font-bold text-sky-700">Siap Bayar Mitra</div>
                            <div className="text-[10px] text-slate-500">
                              Dana di {inv.rekeningTerimaBuyerKode || inv.rekeningPtKode}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px]">
                            <div className="font-bold text-amber-700">Menunggu Buyer</div>
                            <div className="text-[10px] text-slate-400">Pending Order</div>
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-center align-top">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {isInternalMilikSendiriSuratJalan(inv) ? (
                            <>
                              {inv.statusUangBuyer !== 'DITERIMA' &&
                                inv.statusPembayaranMitra === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => openTerimaBuyerModal(inv)}
                                    className="px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[10px] font-bold cursor-pointer shadow-xs whitespace-nowrap shrink-0 flex items-center gap-1"
                                    title="Catat Uang Masuk dari Buyer (Langsung Selesai — Milik Sendiri)"
                                  >
                                    <ArrowDownLeft className="w-3 h-3" />
                                    <span>Terima Dana Buyer</span>
                                  </button>
                                )}
                              {inv.statusUangBuyer === 'DITERIMA' && (
                                <button
                                  type="button"
                                  onClick={() => setBatalBuyerTarget(inv)}
                                  className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-700 cursor-pointer"
                                  title="Batalkan Penerimaan Dana Buyer (jika salah bank/tanggal atau perlu edit)"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {inv.statusPembayaranMitra === 'PENDING' &&
                                inv.statusUangBuyer !== 'DITERIMA' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openTerimaBuyerModal(inv)}
                                      className="px-2 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[10px] font-bold cursor-pointer shadow-xs whitespace-nowrap shrink-0 flex items-center gap-1"
                                      title="Tahap 1: Catat Uang Masuk dari Buyer ke Rekening PT"
                                    >
                                      <ArrowDownLeft className="w-3 h-3" />
                                      <span>1. Terima Buyer</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openCairkanModal(inv)}
                                      className="px-2 py-1 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 rounded-lg text-[10px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                                      title="Bayar Hak Mitra Langsung (Kas Riil / Non-Kas)"
                                    >
                                      Bayar
                                    </button>
                                  </>
                                )}
                              {inv.statusPembayaranMitra === 'PENDING' &&
                                inv.statusUangBuyer === 'DITERIMA' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openCairkanModal(inv)}
                                      className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[10px] font-bold cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                                      title="Tahap 2: Transfer Hak Bersih ke Mitra (Potong Saldo Rekening)"
                                    >
                                      2. Bayar Mitra
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setBatalBuyerTarget(inv)}
                                      className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-700 cursor-pointer"
                                      title="Batalkan Tahap 1 (Terima Uang Buyer) jika salah bank/tanggal atau perlu edit invoice"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                            </>
                          )}
                          {inv.statusPembayaranMitra === 'PENDING' &&
                            inv.statusUangBuyer !== 'DITERIMA' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingInvoice(inv);
                                  setShowModalInput(true);
                                }}
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-700 cursor-pointer"
                                title="Edit Invoice Surat Jalan (Belum Cair)"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                          <button
                            type="button"
                            onClick={() => setPreviewTarget(inv)}
                            className="p-1.5 rounded-lg hover:bg-sky-50 text-sky-700 cursor-pointer"
                            title="Lihat Detail Invoice"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadInvoiceSuratJalanPdf(inv)}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-700 cursor-pointer"
                            title="Download Surat Jalan (PDF)"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => printInvoiceSuratJalan(inv)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 cursor-pointer"
                            title="Cetak Invoice"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(inv)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                            title="Hapus Transaksi"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* Modal Input / Edit Invoice */}
      <ModalInvoiceSuratJalan
        open={showModalInput}
        initialEditInvoice={editingInvoice}
        onClose={() => {
          setShowModalInput(false);
          setEditingInvoice(null);
        }}
        stokHasilBumiList={stokHasilBumiList}
        rekeningList={rekeningList}
        onSuccess={() => {
          loadData();
          onRefreshParent?.();
        }}
      />

      {/* Modal Preview Detail Invoice (Multi-Partai) */}
      {previewTarget && (() => {
        const details = getSuratJalanDetails(previewTarget);
        const uniqueBasis: number[] = [];
        for (const d of details) {
          const b = Math.round(Number(d.basisMitra) || 0);
          if (b > 0 && !uniqueBasis.includes(b)) uniqueBasis.push(b);
        }
        if (uniqueBasis.length === 0 && previewTarget.basisMitra > 0) {
          uniqueBasis.push(Math.round(previewTarget.basisMitra));
        }

        return (
          <div className="fixed inset-0 z-60 bg-black/55 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="text-sm font-bold text-slate-900">
                  Preview Invoice Surat Jalan ·{' '}
                  <span className="font-mono text-sky-900">{previewTarget.noInvoice}</span>
                </div>
                <div className="flex items-center gap-2">
                  {previewTarget.statusPembayaranMitra === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = previewTarget;
                        setPreviewTarget(null);
                        setEditingInvoice(target);
                        setShowModalInput(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Invoice</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadInvoiceSuratJalanPdf(previewTarget)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => printInvoiceSuratJalan(previewTarget)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTarget(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto max-h-[80vh]">
                <div className="border border-sky-800 text-xs text-slate-900">
                  {/* Top Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 border-b border-sky-800">
                    <div className="sm:col-span-7 bg-[#cbd9e6] p-3.5">
                      <div className="text-sm font-extrabold">PT WIJAYA AGRO PERKASA</div>
                      <div className="text-[11px] leading-snug mt-0.5">
                        Jl Kalangan Desa Simpang Luas
                        <br />
                        Kec. Sungai Are, Kab. OKU Selatan
                        <br />
                        Sumatera Selatan · 082144999305
                      </div>
                    </div>
                    <div className="sm:col-span-5 bg-[#006694] text-white p-3.5 text-right flex flex-col justify-between">
                      <div>
                        <div className="text-xs font-bold">INVOICE</div>
                        <div className="text-sm font-mono font-bold">{previewTarget.noInvoice}</div>
                      </div>
                      <div className="text-xs font-bold mt-2">{previewTarget.tanggal}</div>
                    </div>
                  </div>

                  {/* Party Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 border-b border-sky-800">
                    <div className="sm:col-span-7 bg-[#006694] text-slate-950 p-3 flex flex-col justify-between">
                      <div className="text-lg font-extrabold text-center tracking-wide">
                        {previewTarget.kategoriKode || 'SKA'}
                      </div>
                      <div className="space-y-0.5 mt-2 px-4">
                        {uniqueBasis.map((b, i) => (
                          <div key={i} className="flex justify-between font-bold tabular-nums">
                            <span>BASIS {i + 1} :</span>
                            <span>{formatRupiah(b)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-5 bg-[#cbd9e6] border-t sm:border-t-0 sm:border-l border-sky-800">
                      <div className="bg-white py-1.5 px-3 text-center font-extrabold text-sm uppercase border-b border-sky-700/40">
                        {previewTarget.namaMitra}
                      </div>
                      <div className="p-2.5 space-y-1">
                        {details.map((d, idx) => (
                          <div key={d.id || idx} className="flex justify-between font-bold text-[11px] tabular-nums">
                            <span>RENDEMEN {idx + 1} :</span>
                            <span>{d.rendemen.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-[#006694] text-white">
                          <th className="border border-sky-200 px-2 py-1.5 text-center w-9">NO</th>
                          <th className="border border-sky-200 px-2 py-1.5 text-left">DESKRIPSI</th>
                          <th className="border border-sky-200 px-2 py-1.5 text-left">TRUK</th>
                          <th className="border border-sky-200 px-2 py-1.5 text-right">KUANTITI (Kg)</th>
                          <th className="border border-sky-200 px-2 py-1.5 text-right">HARGA (Rp)</th>
                          <th className="border border-sky-200 px-2 py-1.5 text-right">JUMLAH (Rp)</th>
                          <th className="border border-sky-200 px-2 py-1.5 text-left">KET</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.map((d, idx) => (
                          <tr key={d.id || idx}>
                            <td className="border border-slate-300 px-2 py-1 text-center">{idx + 1}</td>
                            <td className="border border-slate-300 px-2 py-1 font-semibold">{d.deskripsi}</td>
                            <td className="border border-slate-300 px-2 py-1 font-mono">{d.platTruk || '-'}</td>
                            <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                              {d.tonaseAkhirKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                              Rp{' '}
                              {d.hargaPerKgMitra.toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                              {formatRupiah(d.subtotalMitra)}
                            </td>
                            <td className="border border-slate-300 px-2 py-1">
                              {d.keterangan || (d.susutKg ? `Susut ${d.susutKg} Kg` : '')}
                            </td>
                          </tr>
                        ))}

                        <tr className="bg-[#006694] text-slate-950 font-extrabold">
                          <td colSpan={5} className="px-2 py-1.5 text-right">
                            TOTAL PENJUALAN :
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {formatRupiah(previewTarget.totalPenjualanMitra)}
                          </td>
                          <td></td>
                        </tr>

                        <tr>
                          <td className="border border-slate-300 px-2 py-1 text-center">1</td>
                          <td colSpan={4} className="border border-slate-300 px-2 py-1">
                            {previewTarget.sumberBarang === 'STOK_HB_PT' ? 'PAJAK' : 'PAJAK (0,25%)'}
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                            {formatRupiah(previewTarget.pajakNominal)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1"></td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 px-2 py-1 text-center">2</td>
                          <td colSpan={4} className="border border-slate-300 px-2 py-1">
                            KOMISI
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                            {formatRupiah(previewTarget.komisiNominal)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1"></td>
                        </tr>
                        <tr>
                          <td className="border border-slate-300 px-2 py-1 text-center">3</td>
                          <td colSpan={4} className="border border-slate-300 px-2 py-1 font-bold">
                            KASBON
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums">
                            {formatRupiah(previewTarget.kasbonNominal)}
                          </td>
                          <td className="border border-slate-300 px-2 py-1"></td>
                        </tr>
                        {(previewTarget.potonganLainNominal || 0) > 0 && (
                          <tr>
                            <td className="border border-slate-300 px-2 py-1 text-center">4</td>
                            <td colSpan={4} className="border border-slate-300 px-2 py-1">
                              {previewTarget.potonganLainLabel || 'POTONGAN LAIN'}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                              {formatRupiah(previewTarget.potonganLainNominal || 0)}
                            </td>
                            <td className="border border-slate-300 px-2 py-1"></td>
                          </tr>
                        )}

                        <tr className="bg-[#006694] text-slate-950 font-extrabold">
                          <td colSpan={5} className="px-2 py-1.5 text-right">
                            TOTAL POTONGAN(-) :
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {formatRupiah(previewTarget.totalPotongan)}
                          </td>
                          <td></td>
                        </tr>

                        {(previewTarget.tambahanNominal || 0) > 0 && (
                          <tr>
                            <td className="border border-slate-300 px-2 py-1 text-center">+</td>
                            <td colSpan={4} className="border border-slate-300 px-2 py-1">
                              {previewTarget.tambahanLabel || 'TAMBAHAN'}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums">
                              {formatRupiah(previewTarget.tambahanNominal || 0)}
                            </td>
                            <td className="border border-slate-300 px-2 py-1"></td>
                          </tr>
                        )}

                        <tr className="bg-[#006694] text-slate-950 font-extrabold text-sm">
                          <td colSpan={5} className="px-2 py-2 text-right">
                            Jumlah Pembayaran :
                          </td>
                          <td className="px-2 py-2 text-right font-mono tabular-nums">
                            {formatRupiah(previewTarget.jumlahPembayaranMitra)}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Footer */}
                  <div className="p-3.5 flex justify-between items-start border-t border-slate-300">
                    <div>
                      <div className="font-bold">Catatan :</div>
                      <div>{previewTarget.catatan || 'Pembayaran Via Transfer'}</div>
                    </div>
                    <div className="text-right">
                      <div>Hormat Kami</div>
                      <div>PT Wijaya Agro Perkasa</div>
                      <div className="mt-8 font-bold">Fahlevi Martawijaya, ST</div>
                    </div>
                  </div>
                  <div className="bg-[#006694] text-white text-center py-1.5 font-bold text-[11px]">
                    TERIMA KASIH ATAS KERJA SAMA ANDA
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Tahap 1: Terima Uang Masuk Buyer ke Rekening PT */}
      {terimaBuyerTarget && (() => {
        const nominalParsed = Math.round(Number(terimaBuyerNominal.replace(/[^\d]/g, '')) || 0);
        const hakMitra = Math.round(Number(terimaBuyerTarget.jumlahPembayaranMitra) || 0);
        const estimasiSisaPt = nominalParsed - hakMitra;
        const isOwnSaleModal = isInternalMilikSendiriSuratJalan(terimaBuyerTarget);
        const selectedAcc = activeRealRekeningList.find((r) => r.kode === terimaBuyerRekening);
        const saldoSebelum = Math.round(Number(selectedAcc?.saldoSaatIni) || 0);
        const saldoSesudah = saldoSebelum + nominalParsed;
        return (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ArrowDownLeft className="w-4 h-4 text-sky-700" />
                  <span>
                    {isOwnSaleModal
                      ? 'Terima Dana Buyer · Penjualan Milik Sendiri'
                      : 'Tahap 1 · Terima Uang Masuk Buyer'}
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => setTerimaBuyerTarget(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">No. Invoice</span>
                  <span className="font-mono font-bold text-sky-900">{terimaBuyerTarget.noInvoice}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Buyer / Eksportir</span>
                  <span className="font-bold text-slate-900">{terimaBuyerTarget.kategoriKode || 'BUYER'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Pemilik Barang (Mitra)</span>
                  <span className="font-bold text-slate-900">{terimaBuyerTarget.namaMitra}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Komoditas &amp; Tonase</span>
                  <span className="font-mono text-slate-800 tabular-nums">
                    {terimaBuyerTarget.komoditasNama} · {terimaBuyerTarget.tonaseAkhirKg.toLocaleString('id-ID')} Kg
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tanggal Uang Masuk
                    </label>
                    <input
                      type="text"
                      value={terimaBuyerTanggal}
                      onChange={(e) => setTerimaBuyerTanggal(e.target.value)}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nominal Masuk dari Buyer (Rp)
                    </label>
                    <input
                      type="text"
                      value={terimaBuyerNominal}
                      onChange={(e) => setTerimaBuyerNominal(e.target.value.replace(/[^\d]/g, ''))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-sky-950 tabular-nums"
                    />
                    <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
                      Tagihan Invoice Buyer: {formatRupiah(terimaBuyerTarget.totalPenjualanBuyer || terimaBuyerTarget.totalPenjualanMitra)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Masuk ke Rekening PT / Bank Penerima
                  </label>
                  <select
                    value={terimaBuyerRekening}
                    onChange={(e) => setTerimaBuyerRekening(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                  >
                    {activeRealRekeningList.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.kode} - {getRekDisplayLabel(r)} (Saldo: {formatRupiah(r.saldoSaatIni)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan / Ref Transfer Buyer (Opsional)
                  </label>
                  <input
                    type="text"
                    value={terimaBuyerCatatan}
                    onChange={(e) => setTerimaBuyerCatatan(e.target.value)}
                    placeholder="Contoh: Transfer masuk LDC via BNI Direct"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                  />
                </div>
              </div>

              {/* Simulasi Arus Kas 2 Tahap */}
              <div className="bg-sky-50/70 border border-sky-200 rounded-xl p-3.5 text-xs space-y-1.5 tabular-nums">
                <div className="font-bold text-sky-900">Ringkasan Dampak Saldo Bank &amp; Settlement</div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>Saldo {selectedAcc ? getRekDisplayLabel(selectedAcc) : terimaBuyerRekening} Saat Ini</span>
                  <span className="font-mono">{formatRupiah(saldoSebelum)}</span>
                </div>
                <div className="flex items-center justify-between text-sky-800 font-semibold">
                  <span>
                    + Uang Masuk Buyer {isOwnSaleModal ? '(Milik Sendiri)' : '(Tahap 1)'}
                  </span>
                  <span className="font-mono">+{formatRupiah(nominalParsed)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-900 font-bold border-t border-sky-200 pt-1">
                  <span>Saldo Bank Setelah Masuk</span>
                  <span className="font-mono">{formatRupiah(saldoSesudah)}</span>
                </div>
                {isOwnSaleModal ? (
                  <div className="pt-1.5 border-t border-dashed border-sky-200 text-emerald-800 font-semibold">
                    Penjualan milik sendiri ({terimaBuyerTarget.namaMitra}): 100% dana langsung masuk milik perusahaan &amp; status otomatis LUNAS tanpa tahap Bayar ke Mitra.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-dashed border-sky-200">
                      <span>Hak Bersih {terimaBuyerTarget.namaMitra} (Tahap 2 nanti)</span>
                      <span className="font-mono">−{formatRupiah(hakMitra)}</span>
                    </div>
                    <div className="flex items-center justify-between text-indigo-900 font-bold">
                      <span>Estimasi Sisa Bersih di PT (Spread + Fee + Bon)</span>
                      <span className="font-mono">{formatRupiah(estimasiSisaPt)}</span>
                    </div>
                  </>
                )}
                <p className="text-[10px] text-slate-500 pt-1 leading-relaxed">
                  Dicatat agar saldo rekening klop dengan mutasi bank riil, tanpa mengotori Laba Rugi operasional maupun analisa profit stok gudang.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setTerimaBuyerTarget(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={terimaBuyerLoading || nominalParsed <= 0}
                  onClick={handleTerimaBuyer}
                  className="px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {terimaBuyerLoading ? 'Menyimpan...' : 'Simpan Uang Masuk Buyer'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Konfirmasi Batalkan Tahap 1 */}
      {batalBuyerTarget && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-amber-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-700" />
                <span>Batalkan Penerimaan Uang Buyer</span>
              </h4>
              <button
                type="button"
                onClick={() => setBatalBuyerTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed tabular-nums">
              Batalkan catatan Tahap 1 untuk Invoice{' '}
              <strong className="font-mono text-slate-900">{batalBuyerTarget.noInvoice}</strong> (
              <strong>{batalBuyerTarget.namaMitra}</strong>)? Saldo rekening{' '}
              <strong className="font-mono text-slate-900">
                {batalBuyerTarget.rekeningTerimaBuyerKode || batalBuyerTarget.rekeningPtKode}
              </strong>{' '}
              akan dikurangi kembali sebesar{' '}
              <strong className="font-mono text-slate-900">
                {formatRupiah(
                  batalBuyerTarget.nominalUangBuyerMasuk ||
                    batalBuyerTarget.totalPenjualanBuyer ||
                    batalBuyerTarget.totalPenjualanMitra
                )}
              </strong>{' '}
              dan invoice kembali bisa diedit.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setBatalBuyerTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={batalBuyerLoading}
                onClick={handleBatalTerimaBuyer}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {batalBuyerLoading ? 'Membatalkan...' : 'Ya, Batalkan Terima Buyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tahap 2: Pencairan / Bayar Hak Mitra */}
      {cairkanTarget && (() => {
        const selectedAcc = activeRealRekeningList.find((r) => r.kode === cairkanRekening);
        const saldoSebelum = Math.round(Number(selectedAcc?.saldoSaatIni) || 0);
        const hakMitra = Math.round(Number(cairkanTarget.jumlahPembayaranMitra) || 0);
        const saldoSesudah = cairkanCatatKas ? saldoSebelum - hakMitra : saldoSebelum;
        const uangBuyerMasuk = Math.round(
          Number(
            cairkanTarget.nominalUangBuyerMasuk ||
              cairkanTarget.totalPenjualanBuyer ||
              cairkanTarget.totalPenjualanMitra
          ) || 0
        );
        const sisaDiPt = uangBuyerMasuk - hakMitra;
        const rekDisplay = selectedAcc ? getRekDisplayLabel(selectedAcc) : cairkanRekening;

        return (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-700" />
                  <span>Tahap 2 · Bayar / Cairkan Hak Mitra</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setCairkanTarget(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Tahap 1 */}
              {cairkanTarget.statusUangBuyer === 'DITERIMA' ? (
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-xs space-y-1 tabular-nums">
                  <div className="font-bold text-sky-900">
                    Tahap 1 Selesai · Uang Buyer Sudah Masuk Rekening
                  </div>
                  <div className="text-sky-800">
                    Masuk <strong className="font-mono">{formatRupiah(uangBuyerMasuk)}</strong> ke{' '}
                    <strong className="font-mono">
                      {cairkanTarget.rekeningTerimaBuyerKode || cairkanTarget.rekeningPtKode}
                    </strong>{' '}
                    pada {cairkanTarget.tanggalUangBuyerMasuk || cairkanTarget.tanggal}.
                  </div>
                  <div className="text-indigo-900 font-semibold">
                    Sisa Bersih Tertinggal di PT setelah bayar mitra:{' '}
                    <span className="font-mono font-bold">{formatRupiah(sisaDiPt)}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed">
                  Uang masuk dari buyer (Tahap 1) belum dicatat pada invoice ini. Jika uang buyer sudah masuk ke rekening PT, sebaiknya klik{' '}
                  <strong>1. Terima Buyer</strong> dulu agar mutasi masuk &amp; keluar bank 100% klop.
                </div>
              )}

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">No. Invoice</span>
                  <span className="font-mono font-bold text-sky-900">{cairkanTarget.noInvoice}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Mitra Penerima</span>
                  <span className="font-bold text-slate-900">{cairkanTarget.namaMitra}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Komoditas</span>
                  <span className="font-mono text-slate-800 tabular-nums">
                    {cairkanTarget.komoditasNama} ({cairkanTarget.tonaseAkhirKg.toLocaleString('id-ID')} Kg)
                  </span>
                </div>
                <div className="flex items-center justify-between text-emerald-800 font-bold text-sm pt-1.5 border-t border-slate-200 tabular-nums">
                  <span>Hak Bersih Ditransfer</span>
                  <span className="font-mono">{formatRupiah(hakMitra)}</span>
                </div>
                {cairkanTarget.potongPiutang && cairkanTarget.kasbonNominal > 0 && (
                  <div className="mt-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 tabular-nums">
                    Potong Piutang{' '}
                    <span className="font-bold">{formatRupiah(cairkanTarget.kasbonNominal)}</span>{' '}
                    otomatis dicatat sebagai <strong>Bayar Bon</strong> di Rekening Koran{' '}
                    {cairkanTarget.namaMitra} (Bayar via <strong>{rekDisplay}</strong>).
                  </div>
                )}
              </div>

              {/* Pilihan Mode Pencatatan Kas */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Mode Pencatatan Saldo Bank
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCairkanCatatKas(true)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      cairkanCatatKas
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold">Potong Saldo Rekening (Kas Riil)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Rekomendasi · Mengurangi saldo bank sumber &amp; tercatat di mutasi bank tanpa mengotori Beban Operasional.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCairkanCatatKas(false)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      !cairkanCatatKas
                        ? 'border-slate-700 bg-slate-100 text-slate-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-xs font-bold">Non-Kas / Administrasi Saja</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Tandai LUNAS saja tanpa mengubah saldo rekening bank berjalan.
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Pencairan
                  </label>
                  <input
                    type="text"
                    value={cairkanTanggal}
                    onChange={(e) => setCairkanTanggal(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {cairkanCatatKas ? 'Rekening Sumber Pembayaran' : 'Rekening Keterangan (Non-Kas)'}
                  </label>
                  <select
                    value={cairkanRekening}
                    onChange={(e) => setCairkanRekening(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                  >
                    {activeRealRekeningList.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.kode} - {getRekDisplayLabel(r)} ({formatRupiah(r.saldoSaatIni)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {cairkanCatatKas && (
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3 text-xs space-y-1 tabular-nums">
                  <div className="flex items-center justify-between text-slate-700">
                    <span>Saldo {rekDisplay} Saat Ini</span>
                    <span className="font-mono">{formatRupiah(saldoSebelum)}</span>
                  </div>
                  <div className="flex items-center justify-between text-rose-700 font-semibold">
                    <span>− Transfer Hak {cairkanTarget.namaMitra}</span>
                    <span className="font-mono">−{formatRupiah(hakMitra)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-900 font-bold border-t border-emerald-200 pt-1">
                    <span>Saldo {rekDisplay} Setelah Transfer</span>
                    <span className="font-mono">{formatRupiah(saldoSesudah)}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCairkanTarget(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={cairkanLoading}
                  onClick={handleCairkanInvoice}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {cairkanLoading
                    ? 'Memproses...'
                    : cairkanCatatKas
                    ? 'Bayar Mitra & Potong Saldo Bank'
                    : 'Konfirmasi Lunas (Non-Kas)'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Konfirmasi Hapus Transaksi */}
      {deleteTarget && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-rose-900">Batalkan Transaksi Invoice</h4>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Batalkan transaksi Invoice <strong className="font-mono text-slate-900">{deleteTarget.noInvoice}</strong>{' '}
              (<strong>{deleteTarget.namaMitra}</strong>)? Saldo rekening &amp; mutasi terkait akan
              dikembalikan secara akurat.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleConfirmDeleteInvoice}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {deleteLoading ? 'Membatalkan...' : 'Ya, Batalkan Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
