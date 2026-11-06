import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  CheckCircle2,
  FileText,
  Truck,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingUp,
  CreditCard,
  DollarSign,
  Trash2,
  ListOrdered,
  PlusCircle,
  Check,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  Mitra,
  Rekening,
  StokHasilBumi,
  InvoiceSuratJalanRecord,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';

interface ModalInvoiceSuratJalanProps {
  open: boolean;
  onClose: () => void;
  stokHasilBumiList: StokHasilBumi[];
  rekeningList: Rekening[];
  onSuccess: () => void;
}

export const ModalInvoiceSuratJalan: React.FC<ModalInvoiceSuratJalanProps> = ({
  open,
  onClose,
  rekeningList,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'INPUT' | 'RIWAYAT'>('INPUT');
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [selectedMitraId, setSelectedMitraId] = useState<string>('');
  const [noInvoice, setNoInvoice] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `WAP${y}${m}${d}-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [tanggal, setTanggal] = useState<string>(() => {
    const now = new Date();
    const d = String(now.getDate()).padStart(2, '0');
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const y = now.getFullYear();
    return `${d}/${m}/${y}`;
  });
  const [kategoriKode, setKategoriKode] = useState<string>('SKA');
  const [basis1, setBasis1] = useState<number>(61500); // Basis WAP ke Mitra
  const [basisBuyer, setBasisBuyer] = useState<number>(61500); // Basis WAP ke Buyer
  const [rendemen1, setRendemen1] = useState<number>(90.05);
  const [komoditasNama, setKomoditasNama] = useState<string>('KOPI');
  const [platTruk, setPlatTruk] = useState<string>('');
  const [tonaseAwalKg, setTonaseAwalKg] = useState<number>(0);
  const [tonaseAkhirKg, setTonaseAkhirKg] = useState<number>(0);
  const [hargaPerKgManual, setHargaPerKgManual] = useState<number | null>(null);

  // Potongan (-)
  const [pajakNominal, setPajakNominal] = useState<number>(0);
  const [komisiNominal, setKomisiNominal] = useState<number>(0);
  const [kasbonNominal, setKasbonNominal] = useState<number>(0);
  const [potongPiutang, setPotongPiutang] = useState<boolean>(true);
  const [potonganLainLabel, setPotonganLainLabel] = useState<string>('');
  const [potonganLainNominal, setPotonganLainNominal] = useState<number>(0);

  // Tambahan (+)
  const [tambahanLabel, setTambahanLabel] = useState<string>('');
  const [tambahanNominal, setTambahanNominal] = useState<number>(0);

  // Status Pembayaran Hak Supplier (Pending Order vs Langsung Bayar)
  const [statusPembayaranMitra, setStatusPembayaranMitra] = useState<'PENDING' | 'LUNAS'>('PENDING');

  // Rekening PT Penampung (default BNI DIRECT)
  const [rekeningPtKode, setRekeningPtKode] = useState<string>('BNI01');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [piutangMap, setPiutangMap] = useState<Map<string, number>>(new Map());
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceSuratJalanRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [filterHistoryStatus, setFilterHistoryStatus] = useState<'SEMUA' | 'PENDING' | 'LUNAS'>('SEMUA');

  // Modal Cairkan Pending
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

  const loadData = () => {
    Promise.all([
      api.getMitra().catch(() => [] as Mitra[]),
      api.getRekapMitra().catch(() => null),
      api.getInvoiceSuratJalan().catch(() => [] as InvoiceSuratJalanRecord[]),
    ]).then(([mRes, rekapRes, invRes]) => {
      if (Array.isArray(mRes)) setMitraList(mRes);
      const map = new Map<string, number>();
      for (const it of rekapRes?.items || []) {
        const rawPiutang =
          it.nominalPiutangAktif ??
          it.totalBonMitra ??
          ((Number(it.totalKasbonBarang) || 0) + (Number(it.totalKasbonUang) || 0));
        const piutang = Math.max(0, Math.round(Number(rawPiutang) || 0));
        if (piutang > 0) map.set(it.id, piutang);
      }
      setPiutangMap(map);
      if (Array.isArray(invRes)) setInvoiceHistory(invRes);
    });
  };

  useEffect(() => {
    if (!open) return;
    loadData();
    const bni = rekeningList.find(
      (r) => r.kode === 'BNI01' || /bni\s*direct/i.test(r.nama || '')
    );
    if (bni) {
      setRekeningPtKode(bni.kode);
      setCairkanRekening(bni.kode);
    }
  }, [open, rekeningList]);

  const selectedMitra = useMemo(
    () => mitraList.find((m) => m.id === selectedMitraId) || null,
    [mitraList, selectedMitraId]
  );

  // Otomatis tarik saldo piutang/kasbon aktif milik supplier saat dipilih
  useEffect(() => {
    if (selectedMitra) {
      const bon = piutangMap.get(selectedMitra.id) || 0;
      if (bon > 0) {
        setPotongPiutang(true);
        setKasbonNominal(bon);
      } else {
        setPotongPiutang(false);
        setKasbonNominal(0);
      }
    } else {
      setPotongPiutang(false);
      setKasbonNominal(0);
    }
  }, [selectedMitra, piutangMap]);

  const hargaPerKg = useMemo(() => {
    if (hargaPerKgManual !== null && hargaPerKgManual >= 0) return hargaPerKgManual;
    return Math.round(basis1 * (rendemen1 / 100) * 100) / 100;
  }, [basis1, rendemen1, hargaPerKgManual]);

  const hargaBuyerPerKg = useMemo(
    () => Math.round(basisBuyer * (rendemen1 / 100) * 100) / 100,
    [basisBuyer, rendemen1]
  );

  const totalPenjualan = useMemo(
    () => Math.round(tonaseAkhirKg * hargaPerKg),
    [tonaseAkhirKg, hargaPerKg]
  );

  useEffect(() => {
    setPajakNominal(Math.round(totalPenjualan * 0.0025));
  }, [totalPenjualan]);

  const totalPenjualanBuyer = useMemo(
    () => Math.round(tonaseAkhirKg * hargaBuyerPerKg),
    [tonaseAkhirKg, hargaBuyerPerKg]
  );

  const marginHargaPt = useMemo(
    () => Math.max(0, totalPenjualanBuyer - totalPenjualan),
    [totalPenjualanBuyer, totalPenjualan]
  );

  const totalKeuntunganPt = useMemo(
    () => marginHargaPt + Math.round(Number(komisiNominal) || 0),
    [marginHargaPt, komisiNominal]
  );

  const totalPotongan = useMemo(
    () =>
      Math.round(
        (Number(pajakNominal) || 0) +
          (Number(komisiNominal) || 0) +
          (Number(kasbonNominal) || 0) +
          (Number(potonganLainNominal) || 0)
      ),
    [pajakNominal, komisiNominal, kasbonNominal, potonganLainNominal]
  );

  const totalTambahan = useMemo(
    () => Math.round(Number(tambahanNominal) || 0),
    [tambahanNominal]
  );

  const jumlahPembayaran = useMemo(
    () => Math.max(0, totalPenjualan - totalPotongan + totalTambahan),
    [totalPenjualan, totalPotongan, totalTambahan]
  );

  const susutKg = useMemo(() => {
    if (tonaseAwalKg > 0 && tonaseAkhirKg > 0) {
      return Math.round((tonaseAwalKg - tonaseAkhirKg) * 10) / 10;
    }
    return 0;
  }, [tonaseAwalKg, tonaseAkhirKg]);

  const pendingCount = useMemo(
    () => invoiceHistory.filter((i) => i.statusPembayaranMitra === 'PENDING').length,
    [invoiceHistory]
  );

  const filteredHistory = useMemo(() => {
    if (filterHistoryStatus === 'PENDING') {
      return invoiceHistory.filter((i) => i.statusPembayaranMitra === 'PENDING');
    }
    if (filterHistoryStatus === 'LUNAS') {
      return invoiceHistory.filter((i) => i.statusPembayaranMitra === 'LUNAS');
    }
    return invoiceHistory;
  }, [invoiceHistory, filterHistoryStatus]);

  const historySummary = useMemo(() => {
    let omzetBuyer = 0;
    let untungPt = 0;
    let pendingHak = 0;
    let lunasHak = 0;
    for (const inv of invoiceHistory) {
      omzetBuyer += inv.totalPenjualanBuyer || inv.totalPenjualanMitra || 0;
      untungPt += inv.totalKeuntunganPt || 0;
      if (inv.statusPembayaranMitra === 'PENDING') {
        pendingHak += inv.jumlahPembayaranMitra || 0;
      } else {
        lunasHak += inv.jumlahPembayaranMitra || 0;
      }
    }
    return { omzetBuyer, untungPt, pendingHak, lunasHak };
  }, [invoiceHistory]);

  const handlePrintRecord = (record: {
    noInvoice: string;
    namaMitra: string;
    tanggal: string;
    kategoriKode?: string;
    basisMitra: number;
    rendemen: number;
    komoditasNama: string;
    platTruk?: string;
    tonaseAkhirKg: number;
    hargaPerKgMitra: number;
    totalPenjualanMitra: number;
    susutKg?: number;
    pajakNominal: number;
    komisiNominal: number;
    kasbonNominal: number;
    potonganLainLabel?: string;
    potonganLainNominal?: number;
    totalPotongan: number;
    tambahanLabel?: string;
    tambahanNominal?: number;
    totalTambahan?: number;
    jumlahPembayaranMitra: number;
    statusPembayaranMitra?: string;
  }) => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invoice ${record.noInvoice} - ${record.namaMitra}</title>
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
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
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
            <div>${record.noInvoice}</div>
            <div>${record.tanggal}</div>
            <div style="margin-top:4px;">
              <span class="badge" style="background:#fff;color:#0f628b;">
                STATUS: ${record.statusPembayaranMitra === 'PENDING' ? 'PENDING ORDER' : 'LUNAS'}
              </span>
            </div>
          </div>
        </div>
        <div class="sub-header">
          <div>
            <div style="font-size:18px;">${record.kategoriKode || 'SKA'}</div>
            <div>BASIS : Rp ${record.basisMitra.toLocaleString('id-ID')}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:16px;">${record.namaMitra}</div>
            <div>RENDEMEN : ${record.rendemen.toFixed(2)}%</div>
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
              <td>${record.komoditasNama}</td>
              <td>${record.platTruk || '-'}</td>
              <td class="right">${record.tonaseAkhirKg.toLocaleString('id-ID')}</td>
              <td class="right">Rp ${record.hargaPerKgMitra.toLocaleString('id-ID')}</td>
              <td class="right">Rp ${record.totalPenjualanMitra.toLocaleString('id-ID')}</td>
              <td>${record.susutKg ? `Susut ${record.susutKg} Kg` : ''}</td>
            </tr>
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL PENJUALAN :</td>
              <td class="right">Rp ${record.totalPenjualanMitra.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">1</td>
              <td colspan="4">PAJAK (0,25%)</td>
              <td class="right">Rp ${record.pajakNominal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">2</td>
              <td colspan="4">KOMISI JASA JUAL PT</td>
              <td class="right">Rp ${record.komisiNominal.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            <tr>
              <td class="center">3</td>
              <td colspan="4"><strong>POTONG KASBON / PIUTANG</strong></td>
              <td class="right"><strong>Rp ${record.kasbonNominal.toLocaleString('id-ID')}</strong></td>
              <td></td>
            </tr>
            ${
              (record.potonganLainNominal || 0) > 0
                ? `<tr><td class="center">4</td><td colspan="4">${record.potonganLainLabel || 'POTONGAN LAIN'}</td><td class="right">Rp ${(record.potonganLainNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`
                : ''
            }
            <tr class="total-row">
              <td colspan="5" class="right">TOTAL POTONGAN (-) :</td>
              <td class="right">Rp ${record.totalPotongan.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
            ${
              (record.tambahanNominal || 0) > 0
                ? `<tr><td class="center">1</td><td colspan="4">${record.tambahanLabel || 'TAMBAHAN'}</td><td class="right">Rp ${(record.tambahanNominal || 0).toLocaleString('id-ID')}</td><td></td></tr>`
                : ''
            }
            <tr class="grand-total">
              <td colspan="5" class="right">Jumlah Pembayaran Hak Supplier :</td>
              <td class="right">Rp ${record.jumlahPembayaranMitra.toLocaleString('id-ID')}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div>
            <strong>Catatan Arus Kas BNI DIRECT :</strong><br/>
            Pembayaran Via Transfer Bank PT WAP<br/>
            ${record.statusPembayaranMitra === 'PENDING' ? 'Status: Pending Order (Dana Standby di BNI DIRECT)' : 'Status: Telah Ditransfer ke Supplier'}
          </div>
          <div style="text-align:right">
            Hormat Kami<br/>
            PT Wijaya Agro Perkasa<br/><br/><br/>
            <strong>Fahlevi Martawijaya</strong>
          </div>
        </div>
        <script>window.print();</script>
      </body>
      </html>
    `);
    win.document.close();
  };

  const handlePrintCurrentInvoice = () => {
    if (!selectedMitra) {
      alert('Pilih Supplier / Mitra terlebih dahulu.');
      return;
    }
    handlePrintRecord({
      noInvoice,
      namaMitra: selectedMitra.nama,
      tanggal,
      kategoriKode,
      basisMitra: basis1,
      rendemen: rendemen1,
      komoditasNama,
      platTruk,
      tonaseAkhirKg,
      hargaPerKgMitra: hargaPerKg,
      totalPenjualanMitra: totalPenjualan,
      susutKg,
      pajakNominal,
      komisiNominal,
      kasbonNominal,
      potonganLainLabel,
      potonganLainNominal,
      totalPotongan,
      tambahanLabel,
      tambahanNominal,
      jumlahPembayaranMitra: jumlahPembayaran,
      statusPembayaranMitra,
    });
  };

  const handleSimpanInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMitra) {
      setErrorMsg('Pilih Supplier / Mitra terlebih dahulu.');
      return;
    }
    if (tonaseAkhirKg <= 0 || totalPenjualan <= 0) {
      setErrorMsg('Tonase akhir dan total penjualan harus lebih dari 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.createInvoiceSuratJalan({
        noInvoice,
        tanggal,
        idMitra: selectedMitra.id,
        namaMitra: selectedMitra.nama,
        komoditasNama,
        kategoriKode,
        platTruk,
        tonaseAwalKg,
        tonaseAkhirKg,
        basisMitra: basis1,
        basisBuyer,
        rendemen: rendemen1,
        hargaPerKgMitra: hargaPerKg,
        hargaPerKgBuyer: hargaBuyerPerKg,
        pajakNominal,
        komisiNominal,
        kasbonNominal,
        potongPiutang,
        potonganLainLabel,
        potonganLainNominal,
        tambahanLabel,
        tambahanNominal,
        rekeningPtKode,
        statusPembayaranMitra,
      });

      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onSuccess();
      loadData();
      setActiveTab('RIWAYAT');
      // Reset no invoice
      const now = new Date();
      setNoInvoice(`WAP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan & memproses transaksi surat jalan.');
    } finally {
      setSubmitting(false);
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
      onSuccess();
      loadData();
      setCairkanTarget(null);
    } catch (err: any) {
      alert(err?.message || 'Gagal mencairkan invoice ke supplier');
    } finally {
      setCairkanLoading(false);
    }
  };

  const handleDeleteInvoice = async (inv: InvoiceSuratJalanRecord) => {
    if (
      !confirm(
        `Batalkan & hapus transaksi Invoice ${inv.noInvoice} (a.n. ${inv.namaMitra})?\nSaldo rekening & mutasi terkait akan dikembalikan.`
      )
    ) {
      return;
    }
    try {
      await api.deleteInvoiceSuratJalan(inv.id);
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onSuccess();
      loadData();
    } catch (err: any) {
      alert(err?.message || 'Gagal menghapus invoice');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-4xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-5 py-4 bg-sky-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-sky-200" />
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                Invoice Surat Jalan Penjualan (Jual Barang Mitra ke Buyer)
              </h3>
              <p className="text-[11px] text-sky-200">
                Jembatan Arus Kas BNI DIRECT: Uang Masuk dari Buyer → Potongan &amp; Komisi PT → Pembayaran Hak Mitra (Pending Order / Lunas)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-sky-800 text-sky-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center justify-between px-5 pt-3 border-b border-zinc-200 bg-zinc-50 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('INPUT')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 cursor-pointer flex items-center gap-1.5 transition-colors ${
                activeTab === 'INPUT'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <PlusCircle className="w-4 h-4" />
              <span>Input Invoice Baru</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RIWAYAT')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 cursor-pointer flex items-center gap-1.5 transition-colors ${
                activeTab === 'RIWAYAT'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>Daftar &amp; Rekap Surat Jalan</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-extrabold animate-pulse">
                  {pendingCount} Pending
                </span>
              )}
            </button>
          </div>
          <div className="text-[11px] font-mono text-zinc-500 pb-2">
            Rekening: <span className="font-bold text-sky-900">BNI DIRECT ({rekeningPtKode})</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'INPUT' ? (
            <form onSubmit={handleSimpanInvoice} className="space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Baris 1: Supplier, No Invoice, Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Supplier / Mitra *
                  </label>
                  <select
                    value={selectedMitraId}
                    onChange={(e) => setSelectedMitraId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-semibold"
                    required
                  >
                    <option value="">-- Pilih Supplier --</option>
                    {mitraList.map((m) => {
                      const bon = piutangMap.get(m.id) || 0;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.nama} {bon > 0 ? `(Bon: ${formatRupiah(bon)})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">No. Invoice</label>
                  <input
                    type="text"
                    value={noInvoice}
                    onChange={(e) => setNoInvoice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Tanggal</label>
                  <input
                    type="text"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Baris 2: Komoditas, Truk, Basis Mitra & Basis Buyer */}
              <div className="bg-sky-50/50 p-3.5 rounded-xl border border-sky-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Komoditas</label>
                    <input
                      type="text"
                      value={komoditasNama}
                      onChange={(e) => setKomoditasNama(e.target.value)}
                      placeholder="KOPI"
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Plat Truk</label>
                    <input
                      type="text"
                      value={platTruk}
                      onChange={(e) => setPlatTruk(e.target.value)}
                      placeholder="BE 8206 AMN"
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-sky-900 mb-1">
                      Basis WAP → Mitra (Rp)
                    </label>
                    <input
                      type="number"
                      value={basis1 || ''}
                      onChange={(e) => setBasis1(Number(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg border border-sky-300 text-xs font-mono font-bold text-sky-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-indigo-900 mb-1">
                      Basis WAP → Buyer (Rp)
                    </label>
                    <input
                      type="number"
                      value={basisBuyer || ''}
                      onChange={(e) => setBasisBuyer(Number(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg border border-indigo-300 text-xs font-mono font-bold text-indigo-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      Rendemen 1 (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={rendemen1 || ''}
                      onChange={(e) => setRendemen1(Number(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-sky-900 mb-1">
                      Harga Beli Mitra / Kg
                    </label>
                    <div className="px-3 py-1.5 bg-sky-100 rounded-lg text-xs font-mono font-bold text-sky-900">
                      {formatRupiah(hargaPerKg)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-indigo-900 mb-1">
                      Harga Jual Buyer / Kg
                    </label>
                    <div className="px-3 py-1.5 bg-indigo-100 rounded-lg text-xs font-mono font-bold text-indigo-900">
                      {formatRupiah(hargaBuyerPerKg)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Baris 3: Tonase Awal, Tonase Akhir */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Tonase Awal Berangkat (Kg)
                  </label>
                  <input
                    type="number"
                    value={tonaseAwalKg || ''}
                    onChange={(e) => setTonaseAwalKg(Number(e.target.value) || 0)}
                    placeholder="Acuan Sewa Truk (misal 1423)"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Tonase Akhir Invoice (Kg) *
                  </label>
                  <input
                    type="number"
                    value={tonaseAkhirKg || ''}
                    onChange={(e) => setTonaseAkhirKg(Number(e.target.value) || 0)}
                    placeholder="Tonase Pabrik (misal 1416)"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Harga / Kg (Rp)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={hargaPerKg}
                    onChange={(e) => setHargaPerKgManual(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
                  />
                  {susutKg !== 0 && (
                    <div className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" />
                      <span>Susut perjalanan: {susutKg} Kg</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Penjualan & Keuntungan PT */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="bg-sky-900 text-white px-3.5 py-2.5 rounded-xl flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-sky-200">
                    TOTAL INV MITRA ({tonaseAkhirKg} Kg)
                  </div>
                  <div className="font-mono text-base font-extrabold">{formatRupiah(totalPenjualan)}</div>
                  <div className="text-[10px] text-sky-300">Nilai Barang dari Mitra</div>
                </div>
                <div className="bg-cyan-900 text-white px-3.5 py-2.5 rounded-xl flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-cyan-200">
                    UANG MASUK BUYER (BNI DIRECT)
                  </div>
                  <div className="font-mono text-base font-extrabold">{formatRupiah(totalPenjualanBuyer)}</div>
                  <div className="text-[10px] text-cyan-300">
                    Masuk ke Rekening PT: {formatRupiah(totalPenjualanBuyer)}
                  </div>
                </div>
                <div className="bg-indigo-900 text-white px-3.5 py-2.5 rounded-xl flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-indigo-200">TOTAL KEUNTUNGAN PT WAP</div>
                  <div className="font-mono text-base font-extrabold">{formatRupiah(totalKeuntunganPt)}</div>
                  <div className="text-[10px] text-indigo-300">
                    Margin {formatRupiah(marginHargaPt)} + Komisi {formatRupiah(komisiNominal)}
                  </div>
                </div>
              </div>

              {/* Potongan (-) */}
              <div className="border border-zinc-200 rounded-xl p-3.5 space-y-3">
                <div className="text-xs font-bold text-zinc-800">Potongan (-)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                      1. Pajak 0,25% (Rp) — Otomatis
                    </label>
                    <input
                      type="number"
                      value={pajakNominal}
                      readOnly
                      className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-100 text-zinc-700 text-xs font-mono font-semibold cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                      2. Komisi PT (Rp) → Masuk Catatan PT WAP
                    </label>
                    <input
                      type="number"
                      value={komisiNominal || ''}
                      onChange={(e) => setKomisiNominal(Number(e.target.value) || 0)}
                      placeholder="400000"
                      className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 text-xs font-mono font-bold text-emerald-800"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-amber-800">
                        3. Potong Kasbon (Rp)
                      </label>
                      {selectedMitra && (
                        <span className="text-[10px] font-mono font-bold text-amber-900">
                          Bon: {formatRupiah(piutangMap.get(selectedMitra.id) || 0)}
                        </span>
                      )}
                    </div>
                    {selectedMitra && (piutangMap.get(selectedMitra.id) || 0) > 0 && (
                      <div className="grid grid-cols-2 gap-1 mb-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setPotongPiutang(true);
                            setKasbonNominal(piutangMap.get(selectedMitra.id) || 0);
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                            potongPiutang
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-amber-900 border-amber-300'
                          }`}
                        >
                          Potong Piutang
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPotongPiutang(false);
                            setKasbonNominal(0);
                          }}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer border ${
                            !potongPiutang
                              ? 'bg-zinc-700 text-white border-zinc-700'
                              : 'bg-white text-zinc-700 border-zinc-300'
                          }`}
                        >
                          Tidak Potong Piutang
                        </button>
                      </div>
                    )}
                    <input
                      type="number"
                      value={kasbonNominal || ''}
                      readOnly={!potongPiutang && (piutangMap.get(selectedMitra?.id || '') || 0) > 0}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setKasbonNominal(val);
                        if (val > 0) setPotongPiutang(true);
                      }}
                      className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono font-bold ${
                        !potongPiutang && (piutangMap.get(selectedMitra?.id || '') || 0) > 0
                          ? 'border-zinc-200 bg-zinc-100 text-zinc-500 cursor-not-allowed'
                          : 'border-amber-300 text-amber-900'
                      }`}
                    />
                    {selectedMitra && potongPiutang && (piutangMap.get(selectedMitra.id) || 0) > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        {[100, 50, 25].map((pct) => {
                          const totalBon = piutangMap.get(selectedMitra.id) || 0;
                          const val = Math.round((totalBon * pct) / 100);
                          const isActive = kasbonNominal === val;
                          return (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setKasbonNominal(val)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                isActive
                                  ? 'bg-amber-700 text-white'
                                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                              }`}
                            >
                              {pct === 100 ? '100% Full' : `${pct}%`}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Jumlah Pembayaran ke Supplier */}
              <div className="bg-emerald-900 text-white px-4 py-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-200 font-bold">
                    Jumlah Pembayaran Hak Supplier
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    Total Penjualan - Total Potongan ({formatRupiah(totalPotongan)}) + Tambahan
                  </div>
                </div>
                <div className="font-mono text-xl font-extrabold">{formatRupiah(jumlahPembayaran)}</div>
              </div>

              {/* Jembatan BNI DIRECT & Opsi Status Hak Mitra */}
              <div className="border border-sky-300 bg-sky-50/70 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-sky-800" />
                    <span className="text-xs font-bold text-sky-950">
                      Jembatan Arus Kas BNI DIRECT &amp; Status Hak Supplier
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-sky-800 bg-white px-2 py-0.5 rounded border border-sky-200">
                    Tertinggal di PT: {formatRupiah(marginHargaPt + komisiNominal + pajakNominal + kasbonNominal)}
                  </span>
                </div>

                <div className="text-[11px] text-sky-900 bg-white/80 p-2.5 rounded-lg border border-sky-100 flex items-center gap-2">
                  <span className="font-bold">Alur:</span>
                  <span>Buyer Transfer (+{formatRupiah(totalPenjualanBuyer)}) ke BNI DIRECT</span>
                  <ArrowRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Tertinggal di PT: Margin, Komisi, Pajak &amp; Bon</span>
                  <ArrowRight className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="font-bold text-emerald-800">
                    Hak Mitra: {formatRupiah(jumlahPembayaran)}
                  </span>
                </div>

                {/* Pilihan: Pending Order vs Langsung Bayar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      statusPembayaranMitra === 'PENDING'
                        ? 'bg-amber-500/10 border-amber-500 shadow-sm'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="statusPembayaran"
                        checked={statusPembayaranMitra === 'PENDING'}
                        onChange={() => setStatusPembayaranMitra('PENDING')}
                        className="mt-0.5 text-amber-600"
                      />
                      <div>
                        <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Simpan sebagai Pending Order (Bayar Nanti)</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                          Uang Buyer masuk utuh ke BNI DIRECT. Hak mitra ({formatRupiah(jumlahPembayaran)})
                          standby di BNI DIRECT sebagai pending order. Bisa dicairkan kapan saja ke mitra.
                        </p>
                      </div>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      statusPembayaranMitra === 'LUNAS'
                        ? 'bg-emerald-500/10 border-emerald-600 shadow-sm'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="statusPembayaran"
                        checked={statusPembayaranMitra === 'LUNAS'}
                        onChange={() => setStatusPembayaranMitra('LUNAS')}
                        className="mt-0.5 text-emerald-600"
                      />
                      <div>
                        <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Langsung Bayarkan ke Mitra Sekarang</span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                          Uang Buyer masuk ke BNI DIRECT, lalu hak mitra ({formatRupiah(jumlahPembayaran)})
                          langsung ditransfer ke supplier dari BNI DIRECT sekarang juga (Status: LUNAS).
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={handlePrintCurrentInvoice}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-sky-700 text-sky-800 hover:bg-sky-50 text-xs font-bold cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / PDF Invoice</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold cursor-pointer disabled:opacity-50 shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Menyimpan...'
                      : statusPembayaranMitra === 'PENDING'
                      ? 'Simpan Invoice & Pending Hak Mitra'
                      : 'Simpan & Transfer Hak Mitra Sekarang'}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            /* TAB RIWAYAT & REKAPAN SURAT JALAN */
            <div className="space-y-4">
              {/* Ringkasan 4 Kartu */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                  <div className="text-[10px] font-bold text-sky-800">TOTAL OMZET BUYER</div>
                  <div className="font-mono text-sm font-extrabold text-sky-950 mt-0.5">
                    {formatRupiah(historySummary.omzetBuyer)}
                  </div>
                  <div className="text-[9px] text-sky-600">Masuk Rekening PT</div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-[10px] font-bold text-indigo-800">KEUNTUNGAN PT WAP</div>
                  <div className="font-mono text-sm font-extrabold text-indigo-950 mt-0.5">
                    {formatRupiah(historySummary.untungPt)}
                  </div>
                  <div className="text-[9px] text-indigo-600">Margin + Komisi Jasa</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] font-bold text-amber-800">PENDING HAK MITRA</div>
                  <div className="font-mono text-sm font-extrabold text-amber-950 mt-0.5">
                    {formatRupiah(historySummary.pendingHak)}
                  </div>
                  <div className="text-[9px] text-amber-700">Standby di BNI DIRECT</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-bold text-emerald-800">HAK MITRA LUNAS</div>
                  <div className="font-mono text-sm font-extrabold text-emerald-950 mt-0.5">
                    {formatRupiah(historySummary.lunasHak)}
                  </div>
                  <div className="text-[9px] text-emerald-700">Sudah Ditransfer</div>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(['SEMUA', 'PENDING', 'LUNAS'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFilterHistoryStatus(st)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                        filterHistoryStatus === st
                          ? 'bg-sky-900 text-white'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {st === 'SEMUA' ? 'Semua' : st === 'PENDING' ? 'Pending Order' : 'Lunas'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('INPUT')}
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>+ Buat Invoice</span>
                </button>
              </div>

              {/* Tabel Daftar Surat Jalan */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                    <tr>
                      <th className="px-3 py-2.5">Invoice &amp; Tanggal</th>
                      <th className="px-3 py-2.5">Mitra / Truk</th>
                      <th className="px-3 py-2.5">Komoditas &amp; Tonase</th>
                      <th className="px-3 py-2.5 text-right">Uang Buyer</th>
                      <th className="px-3 py-2.5 text-right">Untung PT</th>
                      <th className="px-3 py-2.5 text-right">Hak Mitra</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 font-sans">
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-zinc-400">
                          Belum ada data invoice surat jalan.
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((inv) => (
                        <tr key={inv.id} className="hover:bg-zinc-50/70 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="font-mono font-bold text-sky-900">{inv.noInvoice}</div>
                            <div className="text-[10px] text-zinc-500">{inv.tanggal}</div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-zinc-800">{inv.namaMitra}</div>
                            <div className="text-[10px] font-mono text-zinc-500">
                              {inv.platTruk || '-'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-zinc-800">{inv.komoditasNama}</div>
                            <div className="text-[10px] font-mono text-zinc-600">
                              {inv.tonaseAkhirKg.toLocaleString('id-ID')} Kg
                              {inv.susutKg ? ` · Susut ${inv.susutKg} Kg` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-cyan-900">
                            {formatRupiah(inv.totalPenjualanBuyer || inv.totalPenjualanMitra)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-indigo-900">
                            {formatRupiah(inv.totalKeuntunganPt)}
                            <div className="text-[9px] text-zinc-400">
                              Komisi {formatRupiah(inv.komisiNominal)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-900">
                            {formatRupiah(inv.jumlahPembayaranMitra)}
                            {inv.kasbonNominal > 0 && (
                              <div className="text-[9px] text-amber-700">
                                Potong Bon {formatRupiah(inv.kasbonNominal)}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {inv.statusPembayaranMitra === 'PENDING' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Pending Order</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span>Lunas Ditransfer</span>
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {inv.statusPembayaranMitra === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCairkanTarget(inv);
                                    setCairkanRekening(inv.rekeningPtKode || 'BNI01');
                                  }}
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer flex items-center gap-1"
                                  title="Cairkan Hak Mitra Sekarang"
                                >
                                  <span>⚡ Bayar</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePrintRecord(inv)}
                                className="p-1 rounded hover:bg-zinc-200 text-zinc-700 cursor-pointer"
                                title="Cetak Invoice"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteInvoice(inv)}
                                className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                                title="Hapus Transaksi"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          )}
        </div>

        {/* Modal Konfirmasi Pencairan Hak Mitra */}
        {cairkanTarget && (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full border border-zinc-200 shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Cairkan Hak Supplier / Mitra</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setCairkanTarget(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 text-xs space-y-1">
                <div>
                  No. Invoice: <span className="font-mono font-bold">{cairkanTarget.noInvoice}</span>
                </div>
                <div>
                  Mitra: <span className="font-bold text-zinc-900">{cairkanTarget.namaMitra}</span>
                </div>
                <div className="text-emerald-800 font-bold text-sm pt-1">
                  Hak Bersih yang Ditransfer: {formatRupiah(cairkanTarget.jumlahPembayaranMitra)}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Tanggal Pencairan
                  </label>
                  <input
                    type="text"
                    value={cairkanTanggal}
                    onChange={(e) => setCairkanTanggal(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Rekening Sumber Transfer PT
                  </label>
                  <select
                    value={cairkanRekening}
                    onChange={(e) => setCairkanRekening(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-semibold"
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

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setCairkanTarget(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={cairkanLoading}
                  onClick={handleCairkanInvoice}
                  className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {cairkanLoading ? 'Memproses...' : 'Konfirmasi Transfer ke Mitra'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
