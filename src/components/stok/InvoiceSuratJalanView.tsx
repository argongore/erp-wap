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
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  InvoiceSuratJalanRecord,
  Mitra,
  Rekening,
  StokHasilBumi,
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
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showModalInput, setShowModalInput] = useState<boolean>(false);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceSuratJalanRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | 'PENDING' | 'LUNAS'>('SEMUA');

  // Preview Detail Modal
  const [previewTarget, setPreviewTarget] = useState<InvoiceSuratJalanRecord | null>(null);

  // Modal Pencairan
  const [cairkanTarget, setCairkanTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [cairkanTanggal, setCairkanTanggal] = useState<string>(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  });
  const [cairkanRekening, setCairkanRekening] = useState<string>('BNI01');
  const [cairkanLoading, setCairkanLoading] = useState<boolean>(false);

  // Modal Konfirmasi Hapus
  const [deleteTarget, setDeleteTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getInvoiceSuratJalan();
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat rekapitulasi invoice surat jalan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const bni = rekeningList.find(
      (r) => r.kode === 'BNI01' || /bni\s*direct/i.test(r.nama || '')
    );
    if (bni) setCairkanRekening(bni.kode);
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

    for (const inv of invoices) {
      const valBuyer = inv.totalPenjualanBuyer || inv.totalPenjualanMitra || 0;
      omzetBuyer += valBuyer;
      untungPt += inv.totalKeuntunganPt || 0;
      totalTonaseKg += inv.tonaseAkhirKg || 0;
      totalKomisi += inv.komisiNominal || 0;
      if (inv.sumberBarang === 'STOK_HB_PT') {
        stokHbCount += 1;
        stokHbOmzet += valBuyer;
        continue;
      }
      if (inv.statusPembayaranMitra === 'PENDING') {
        pendingHak += inv.jumlahPembayaranMitra || 0;
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
      pendingCount: invoices.filter(
        (i) => i.sumberBarang !== 'STOK_HB_PT' && i.statusPembayaranMitra === 'PENDING'
      ).length,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const isStokHb = inv.sumberBarang === 'STOK_HB_PT';
      if (statusFilter === 'PENDING' && (isStokHb || inv.statusPembayaranMitra !== 'PENDING')) {
        return false;
      }
      if (statusFilter === 'LUNAS' && !isStokHb && inv.statusPembayaranMitra !== 'LUNAS') {
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

      return (
        inv.noInvoice.toLowerCase().includes(q) ||
        inv.namaMitra.toLowerCase().includes(q) ||
        (inv.kategoriKode && inv.kategoriKode.toLowerCase().includes(q)) ||
        (inv.komoditasNama && inv.komoditasNama.toLowerCase().includes(q)) ||
        (inv.platTruk && inv.platTruk.toLowerCase().includes(q)) ||
        (inv.noPenjualanHasilBumi && inv.noPenjualanHasilBumi.toLowerCase().includes(q)) ||
        inv.tanggal.toLowerCase().includes(q) ||
        matchDetail
      );
    });
  }, [invoices, statusFilter, searchQuery]);

  const handleCairkanInvoice = async () => {
    if (!cairkanTarget) return;
    setCairkanLoading(true);
    setErrorMsg(null);
    try {
      await api.cairkanInvoiceSuratJalan({
        idInvoice: cairkanTarget.id,
        rekeningSumber: cairkanRekening,
        tanggal: cairkanTanggal,
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
              Komisi Jasa: {formatRupiah(summary.totalKomisi)}
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
              {summary.pendingCount} Nota Pending di BNI DIRECT
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
        <div className="flex items-center gap-1.5">
          {(['SEMUA', 'PENDING', 'LUNAS'] as const).map((st) => (
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
                : 'Lunas'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari Invoice, Mitra, Truk..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-sky-600"
          />
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
                      </td>
                      <td className="px-3.5 py-3 align-top">
                        <div className="font-bold text-slate-900">{inv.namaMitra}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {inv.platTruk || '-'}
                          {inv.sumberBarang === 'STOK_HB_PT' && inv.noPenjualanHasilBumi
                            ? ` · ${inv.noPenjualanHasilBumi}`
                            : ''}
                        </div>
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
                        {inv.sumberBarang === 'STOK_HB_PT' && inv.catatArusKas === false && (
                          <div className="text-[10px] font-sans font-normal text-slate-500">
                            Rekap SJ · Non-Kas
                          </div>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-indigo-900 align-top tabular-nums">
                        <div className="font-bold">{formatRupiah(inv.totalKeuntunganPt)}</div>
                        <div className="text-[10px] text-slate-400">
                          {inv.sumberBarang === 'STOK_HB_PT'
                            ? `Pajak ${formatRupiah(inv.pajakNominal)} · Komisi ${formatRupiah(inv.komisiNominal)}`
                            : `Margin ${formatRupiah(inv.marginHargaPt)} + Komisi ${formatRupiah(inv.komisiNominal)}`}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-900 align-top tabular-nums">
                        {inv.sumberBarang === 'STOK_HB_PT' ? (
                          <div>
                            <div className="text-sky-800 font-sans">Milik PT</div>
                            <div className="text-[10px] font-sans font-normal text-slate-500">
                              Stok HB Sendiri
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
                        {inv.sumberBarang === 'STOK_HB_PT' ? (
                          <div className="text-[11px] font-bold text-sky-700">
                            <div>Stok HB PT</div>
                            <div className="text-[10px] font-normal text-slate-500">
                              {inv.catatArusKas === false ? 'Rekap SJ' : 'Masuk BNI'}
                            </div>
                          </div>
                        ) : (
                          <span
                            className={`text-[11px] font-bold ${
                              inv.statusPembayaranMitra === 'PENDING'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {inv.statusPembayaranMitra === 'PENDING'
                              ? 'Pending Order'
                              : 'Lunas Ditransfer'}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-center align-top">
                        <div className="flex items-center justify-center gap-1">
                          {inv.sumberBarang !== 'STOK_HB_PT' &&
                            inv.statusPembayaranMitra === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => {
                                setCairkanTarget(inv);
                                setCairkanRekening(inv.rekeningPtKode || 'BNI01');
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                              title="Cairkan Hak Mitra Sekarang"
                            >
                              Bayar
                            </button>
                          )}
                          {inv.statusPembayaranMitra === 'PENDING' && (
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

      {/* Modal Konfirmasi Pencairan Pending */}
      {cairkanTarget && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Cairkan Hak Supplier / Mitra</span>
              </h4>
              <button
                type="button"
                onClick={() => setCairkanTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div>
                No. Invoice: <span className="font-mono font-bold text-sky-900">{cairkanTarget.noInvoice}</span>
              </div>
              <div>
                Mitra: <span className="font-bold text-slate-900">{cairkanTarget.namaMitra}</span>
              </div>
              <div>
                Komoditas: {cairkanTarget.komoditasNama} ({cairkanTarget.tonaseAkhirKg.toLocaleString('id-ID')} Kg)
              </div>
              <div className="text-emerald-800 font-bold text-sm pt-1 border-t border-slate-200 tabular-nums">
                Hak Bersih yang Ditransfer: {formatRupiah(cairkanTarget.jumlahPembayaranMitra)}
              </div>
              {cairkanTarget.potongPiutang && cairkanTarget.kasbonNominal > 0 && (
                <div className="mt-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 tabular-nums">
                  Potong Piutang{' '}
                  <span className="font-bold">{formatRupiah(cairkanTarget.kasbonNominal)}</span>{' '}
                  otomatis dicatat sebagai <strong>Bayar Bon</strong> di Rekening Koran{' '}
                  {cairkanTarget.namaMitra} dengan keterangan{' '}
                  <strong>Bayar via {cairkanRekening === 'BNI01' ? 'BNI DIRECT' : cairkanRekening}</strong>{' '}
                  (tanpa mengubah saldo kas/rekening berjalan).
                </div>
              )}
            </div>

            <div className="space-y-3">
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
                  Rekening Keterangan Pencairan (Non-Kas · Tidak Memotong Saldo)
                </label>
                <select
                  value={cairkanRekening}
                  onChange={(e) => setCairkanRekening(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                >
                  {rekeningList
                    .filter((r) => !r.isVirtual && r.status === 'AKTIF')
                    .map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.kode} - {r.kode === 'BNI01' && !/direct/i.test(r.nama || '') ? 'BNI DIRECT' : r.nama}
                      </option>
                    ))}
                </select>
              </div>
            </div>

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
                {cairkanLoading ? 'Memproses...' : 'Konfirmasi Pencairan Surat Jalan'}
              </button>
            </div>
          </div>
        </div>
      )}

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
