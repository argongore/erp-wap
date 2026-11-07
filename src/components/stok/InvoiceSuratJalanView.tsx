import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  Search,
  Clock,
  CheckCircle2,
  Printer,
  Trash2,
  CreditCard,
  TrendingUp,
  ArrowRight,
  Truck,
  Check,
  AlertCircle,
  Wallet,
  X,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  InvoiceSuratJalanRecord,
  Mitra,
  Rekening,
  StokHasilBumi,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { ModalInvoiceSuratJalan } from './ModalInvoiceSuratJalan.tsx';

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
  const [invoices, setInvoices] = useState<InvoiceSuratJalanRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showModalInput, setShowModalInput] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'SEMUA' | 'PENDING' | 'LUNAS'>('SEMUA');

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

    for (const inv of invoices) {
      omzetBuyer += inv.totalPenjualanBuyer || inv.totalPenjualanMitra || 0;
      untungPt += inv.totalKeuntunganPt || 0;
      totalTonaseKg += inv.tonaseAkhirKg || 0;
      totalKomisi += inv.komisiNominal || 0;
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
      pendingCount: invoices.filter((i) => i.statusPembayaranMitra === 'PENDING').length,
    };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter === 'PENDING' && inv.statusPembayaranMitra !== 'PENDING') return false;
      if (statusFilter === 'LUNAS' && inv.statusPembayaranMitra !== 'LUNAS') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        inv.noInvoice.toLowerCase().includes(q) ||
        inv.namaMitra.toLowerCase().includes(q) ||
        (inv.komoditasNama && inv.komoditasNama.toLowerCase().includes(q)) ||
        (inv.platTruk && inv.platTruk.toLowerCase().includes(q)) ||
        inv.tanggal.toLowerCase().includes(q)
      );
    });
  }, [invoices, statusFilter, searchQuery]);

  const handlePrintInvoice = (inv: InvoiceSuratJalanRecord) => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice Surat Jalan ${inv.noInvoice} - ${inv.namaMitra}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          .header { display: flex; justify-content: space-between; background: #0f628b; color: #fff; padding: 16px 20px; }
          .header h1 { margin: 0; font-size: 20px; }
          .header p { margin: 2px 0; font-size: 12px; }
          .sub-header { display: flex; justify-content: space-between; background: #d9e6ee; padding: 12px 20px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
          th, td { border: 1px solid #99b8c9; padding: 6px 10px; }
          th { background: #0f628b; color: #fff; text-align: left; }
          .right { text-align: right; }
          .center { text-align: center; }
          .total-row { background: #0f628b; color: #fff; font-weight: bold; }
          .grand-total { background: #0f628b; color: #fff; font-size: 16px; font-weight: bold; }
          .footer { display: flex; justify-content: space-between; margin-top: 28px; font-size: 13px; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>PT WIJAYA AGRO PERKASA</h1>
            <p>Jl Kalangan Desa Simpang Luas, Kec. Sungai Are, Kab. OKU Selatan</p>
            <p>Sumatera Selatan · 082144999305</p>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:bold;">INVOICE SURAT JALAN</div>
            <div>${inv.noInvoice}</div>
            <div>${inv.tanggal}</div>
            <div style="margin-top:4px;font-weight:bold;font-size:11px;">
              STATUS: ${inv.statusPembayaranMitra === 'PENDING' ? 'PENDING ORDER' : 'LUNAS DITRANSFER'}
            </div>
          </div>
        </div>
        <div class="sub-header">
          <div>
            <div style="font-size:18px;">${inv.kategoriKode || 'SKA'}</div>
            <div>BASIS : Rp ${inv.basisMitra.toLocaleString('id-ID')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;">${inv.namaMitra}</div>
            <div>RENDEMEN : ${inv.rendemen.toFixed(2)}%</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="center" style="width:40px">NO</th>
              <th>DESKRIPSI</th>
              <th>TRUK</th>
              <th class="right">KUANTITI (Kg)</th>
              <th class="right">HARGA (Rp)</th>
              <th class="right">JUMLAH (Rp)</th>
              <th>KET</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="center">1</td>
              <td>${inv.komoditasNama}</td>
              <td>${inv.platTruk || '-'}</td>
              <td class="right">${inv.tonaseAkhirKg.toLocaleString('id-ID')}</td>
              <td class="right">Rp ${inv.hargaPerKgMitra.toLocaleString('id-ID')}</td>
              <td class="right">Rp ${inv.totalPenjualanMitra.toLocaleString('id-ID')}</td>
              <td>${inv.susutKg ? `Susut ${inv.susutKg} Kg` : ''}</td>
            </tr>
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL PENJUALAN :</td>
              <td class="right">Rp ${inv.totalPenjualanMitra.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">1</td>
              <td colspan="4">PAJAK (0,25%)</td>
              <td class="right">Rp ${inv.pajakNominal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">2</td>
              <td colspan="4">KOMISI JASA JUAL PT</td>
              <td class="right">Rp ${inv.komisiNominal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">3</td>
              <td colspan="4"><strong>POTONG KASBON / PIUTANG</strong></td>
              <td class="right"><strong>Rp ${inv.kasbonNominal.toLocaleString('id-ID')}</strong></td>
              <td></td>
            </tr>
            ${
              (inv.potonganLainNominal || 0) > 0
                ? `<tr><td class="center">4</td><td colspan="4">${inv.potonganLainLabel || 'POTONGAN LAIN'}</td><td class="right">Rp ${(inv.potonganLainNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`
                : ''
            }
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL POTONGAN (-) :</td>
              <td class="right">Rp ${inv.totalPotongan.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            ${
              (inv.tambahanNominal || 0) > 0
                ? `<tr><td class="center">1</td><td colspan="4">${inv.tambahanLabel || 'TAMBAHAN'}</td><td class="right">Rp ${(inv.tambahanNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`
                : ''
            }
            <tr class="grand-total">
              <td colspan="5" class="right">Jumlah Pembayaran Hak Supplier :</td>
              <td class="right">Rp ${inv.jumlahPembayaranMitra.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div>
            <strong>Catatan Arus Kas BNI DIRECT :</strong><br/>
            Pembayaran Via Transfer Bank PT WAP<br/>
            ${inv.statusPembayaranMitra === 'PENDING' ? 'Status: Pending Order (Dana Standby di BNI DIRECT)' : 'Status: Telah Ditransfer ke Supplier'}
          </div>
          <div style="text-align:right">
            Hormat Kami<br/>
            PT Wijaya Agro Perkasa<br/><br/><br/>
            <strong>Fahlevi Martawijaya</strong>
          </div>
        </div>
      </body>
      </html>
    `;

    let iframe = document.getElementById('print-invoice-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'print-invoice-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 300);
    }
  };

  const handleCairkanInvoice = async () => {
    if (!cairkanTarget) return;
    setCairkanLoading(true);
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
      alert(err?.message || 'Gagal mencairkan hak mitra surat jalan');
    } finally {
      setCairkanLoading(false);
    }
  };

  const handleDeleteInvoice = async (inv: InvoiceSuratJalanRecord) => {
    if (
      !confirm(
        `Batalkan transaksi Invoice ${inv.noInvoice} (${inv.namaMitra})?\nSaldo rekening & mutasi terkait akan dikembalikan secara akurat.`
      )
    ) {
      return;
    }
    try {
      await api.deleteInvoiceSuratJalan(inv.id);
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onRefreshParent?.();
      loadData();
    } catch (err: any) {
      alert(err?.message || 'Gagal membatalkan transaksi surat jalan');
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
                Jual Barang Mitra ke Buyer · Jembatan Arus Kas BNI DIRECT · Komisi PT WAP &amp; Pending Order
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
            onClick={() => setShowModalInput(true)}
            className="px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Buat Invoice Surat Jalan</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

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
            <div className="font-mono text-lg sm:text-xl font-extrabold text-sky-950">
              {formatRupiah(summary.omzetBuyer)}
            </div>
            <div className="text-[10px] text-sky-700 mt-0.5">
              Total Tonase: {summary.totalTonaseKg.toLocaleString('id-ID')} Kg
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
            <div className="font-mono text-lg sm:text-xl font-extrabold text-indigo-950">
              {formatRupiah(summary.untungPt)}
            </div>
            <div className="text-[10px] text-indigo-700 mt-0.5">
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
            <div className="font-mono text-lg sm:text-xl font-extrabold text-amber-950">
              {formatRupiah(summary.pendingHak)}
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5">
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
            <div className="font-mono text-lg sm:text-xl font-extrabold text-emerald-950">
              {formatRupiah(summary.lunasHak)}
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5">
              Telah Ditransfer Keluar
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
              className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                statusFilter === st
                  ? 'bg-sky-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st === 'SEMUA' ? 'Semua Status' : st === 'PENDING' ? 'Pending Order' : 'Lunas'}
              {st === 'PENDING' && summary.pendingCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
                  {summary.pendingCount}
                </span>
              )}
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
                <th className="px-3.5 py-3">Komoditas &amp; Tonase</th>
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
                    <strong className="text-sky-800">+ Buat Invoice Surat Jalan</strong> untuk
                    memulai.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3.5 py-3">
                      <div className="font-mono font-bold text-sky-900">{inv.noInvoice}</div>
                      <div className="text-[11px] text-slate-500">{inv.tanggal}</div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="font-bold text-slate-900">{inv.namaMitra}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {inv.platTruk || '-'}
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="font-semibold text-slate-800">{inv.komoditasNama}</div>
                      <div className="text-[11px] font-mono text-slate-600">
                        {inv.tonaseAkhirKg.toLocaleString('id-ID')} Kg
                        {inv.susutKg ? ` (Susut ${inv.susutKg} Kg)` : ''}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <div className="text-[11px] text-slate-700">
                        Mitra: {formatRupiah(inv.basisMitra)}
                      </div>
                      <div className="text-[10px] text-indigo-700">
                        Buyer: {formatRupiah(inv.basisBuyer)} · {inv.rendemen.toFixed(2)}%
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-cyan-900">
                      {formatRupiah(inv.totalPenjualanBuyer || inv.totalPenjualanMitra)}
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono text-indigo-900">
                      <div className="font-bold">{formatRupiah(inv.totalKeuntunganPt)}</div>
                      <div className="text-[10px] text-slate-400">
                        Margin {formatRupiah(inv.marginHargaPt)} + Komisi {formatRupiah(inv.komisiNominal)}
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-right font-mono font-bold text-emerald-900">
                      <div>{formatRupiah(inv.jumlahPembayaranMitra)}</div>
                      {inv.kasbonNominal > 0 && (
                        <div className="text-[10px] text-amber-700">
                          Potong Bon: {formatRupiah(inv.kasbonNominal)}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      {inv.statusPembayaranMitra === 'PENDING' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Pending Order</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Lunas Ditransfer</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {inv.statusPembayaranMitra === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => {
                              setCairkanTarget(inv);
                              setCairkanRekening(inv.rekeningPtKode || 'BNI01');
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer flex items-center gap-1 shadow-xs"
                            title="Cairkan Hak Mitra Sekarang"
                          >
                            <span>⚡ Bayar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePrintInvoice(inv)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 cursor-pointer"
                          title="Cetak Invoice"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoice(inv)}
                          className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                          title="Hapus Transaksi"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Input Invoice */}
      <ModalInvoiceSuratJalan
        open={showModalInput}
        onClose={() => setShowModalInput(false)}
        stokHasilBumiList={stokHasilBumiList}
        rekeningList={rekeningList}
        onSuccess={() => {
          loadData();
          onRefreshParent?.();
        }}
      />

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
              <div className="text-emerald-800 font-bold text-sm pt-1 border-t border-slate-200">
                Hak Bersih yang Ditransfer: {formatRupiah(cairkanTarget.jumlahPembayaranMitra)}
              </div>
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
                  Rekening Sumber Transfer PT
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
                        {r.kode} - {r.nama} ({formatRupiah(r.saldoSaatIni)})
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
                {cairkanLoading ? 'Mentransfer...' : 'Konfirmasi Transfer ke Mitra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
