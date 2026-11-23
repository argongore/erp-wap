import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  CheckCircle2,
  FileText,
  AlertCircle,
  Clock,
  ArrowRight,
  CreditCard,
  Trash2,
  ListOrdered,
  PlusCircle,
  Plus,
  Pencil,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  Mitra,
  Rekening,
  StokHasilBumi,
  InvoiceSuratJalanRecord,
  InvoiceSuratJalanDetailItem,
  RekapCtrContract,
  TransaksiPenjualanHasilBumi,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import {
  downloadInvoiceSuratJalanPdf,
  getSuratJalanDetails,
  printInvoiceSuratJalan,
  PrintableInvoiceSuratJalan,
} from '../../utils/suratJalanPrint.ts';

interface ModalInvoiceSuratJalanProps {
  open: boolean;
  onClose: () => void;
  stokHasilBumiList: StokHasilBumi[];
  rekeningList: Rekening[];
  onSuccess: () => void;
  initialEditInvoice?: InvoiceSuratJalanRecord | null;
}

interface DetailDraftRow {
  id: string;
  deskripsi: string;
  platTruk: string;
  basisMitraStr: string;
  basisBuyerStr: string;
  rendemenStr: string;
  tonaseAwalStr: string;
  tonaseAkhirStr: string;
  hargaMitraManualStr: string;
  hargaBuyerManualStr: string;
  keterangan: string;
}

function parseIndoNumber(raw: string): number {
  const s = String(raw || '').trim().replace(/\s+/g, '');
  if (!s) return 0;
  // Support both comma and dot decimals smoothly (e.g., "88,36" -> 88.36, "4557,5" -> 4557.5)
  const normalized =
    s.includes(',') && s.includes('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function sanitizeDecimalInput(raw: string): string {
  return raw.replace(/[^0-9.,]/g, '');
}

function createEmptyDetailRow(index: number, seed?: Partial<DetailDraftRow>): DetailDraftRow {
  return {
    id: `partai-${Date.now()}-${index}-${Math.floor(100 + Math.random() * 900)}`,
    deskripsi: seed?.deskripsi ?? 'KOPI',
    platTruk: seed?.platTruk ?? '',
    basisMitraStr: seed?.basisMitraStr ?? '61000',
    basisBuyerStr: seed?.basisBuyerStr ?? '61000',
    rendemenStr: seed?.rendemenStr ?? '',
    tonaseAwalStr: seed?.tonaseAwalStr ?? '',
    tonaseAkhirStr: seed?.tonaseAkhirStr ?? '',
    hargaMitraManualStr: '',
    hargaBuyerManualStr: '',
    keterangan: '',
  };
}

export const ModalInvoiceSuratJalan: React.FC<ModalInvoiceSuratJalanProps> = ({
  open,
  onClose,
  stokHasilBumiList,
  rekeningList,
  onSuccess,
  initialEditInvoice,
}) => {
  const [activeTab, setActiveTab] = useState<'INPUT' | 'RIWAYAT'>('INPUT');
  const [editingInvoice, setEditingInvoice] = useState<InvoiceSuratJalanRecord | null>(null);
  const loadedEditRef = useRef<{ invoiceId: string; mitraId: string } | null>(null);
  const wasOpenRef = useRef<boolean>(false);
  const [sumberBarang, setSumberBarang] = useState<'MITRA' | 'STOK_HB_PT'>('MITRA');
  const [mitraList, setMitraList] = useState<Mitra[]>([]);
  const [selectedMitraId, setSelectedMitraId] = useState<string>('');
  const [penjualanHbList, setPenjualanHbList] = useState<TransaksiPenjualanHasilBumi[]>([]);
  const [noPenjualanHasilBumi, setNoPenjualanHasilBumi] = useState<string>('');
  const [catatArusKas, setCatatArusKas] = useState<boolean>(false);
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
  const [kategoriKode, setKategoriKode] = useState<string>('');
  const [catatan, setCatatan] = useState<string>('Pembayaran Via Transfer');

  // Pilihan Nomor Kontrak CTR (mencegah salah masuk kontrak saat kontrak berdekatan)
  const [rekapCtrList, setRekapCtrList] = useState<RekapCtrContract[]>([]);
  const [selectedCtrId, setSelectedCtrId] = useState<string>('');
  const [showQuickAddCtr, setShowQuickAddCtr] = useState<boolean>(false);
  const [quickCtrNoKontrak, setQuickCtrNoKontrak] = useState<string>('');
  const [quickCtrTgl, setQuickCtrTgl] = useState<string>('');
  const [quickCtrGudang, setQuickCtrGudang] = useState<string>('');
  const [quickCtrQty, setQuickCtrQty] = useState<string>('');
  const [quickCtrSaving, setQuickCtrSaving] = useState<boolean>(false);

  // Dynamic multi-partai detail rows
  const [detailRows, setDetailRows] = useState<DetailDraftRow[]>(() => [
    createEmptyDetailRow(1, { rendemenStr: '90,05' }),
  ]);

  // Potongan (-)
  const [pajakNominal, setPajakNominal] = useState<number>(0);
  const [pajakAuto, setPajakAuto] = useState<boolean>(true);
  const [komisiNominal, setKomisiNominal] = useState<number>(0);
  const [kasbonNominal, setKasbonNominal] = useState<number>(0);
  const [potongPiutang, setPotongPiutang] = useState<boolean>(true);
  const [potonganLainLabel, setPotonganLainLabel] = useState<string>('');
  const [potonganLainNominal, setPotonganLainNominal] = useState<number>(0);

  // Tambahan (+)
  const [tambahanLabel, setTambahanLabel] = useState<string>('');
  const [tambahanNominal, setTambahanNominal] = useState<number>(0);
  const [showExtraAdjustments, setShowExtraAdjustments] = useState<boolean>(false);

  // Status Pembayaran Hak Supplier (Pending Order vs Langsung Bayar)
  const [statusPembayaranMitra, setStatusPembayaranMitra] = useState<'PENDING' | 'LUNAS'>('PENDING');

  // Rekening PT Penampung (default BNI DIRECT)
  const [rekeningPtKode, setRekeningPtKode] = useState<string>('BNI01');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyErrorMsg, setHistoryErrorMsg] = useState<string | null>(null);

  const [piutangMap, setPiutangMap] = useState<Map<string, number>>(new Map());
  const [invoiceHistory, setInvoiceHistory] = useState<InvoiceSuratJalanRecord[]>([]);
  const [filterHistoryStatus, setFilterHistoryStatus] = useState<'SEMUA' | 'PENDING' | 'LUNAS'>('SEMUA');

  // Modal Cairkan Pending & Konfirmasi Hapus
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
  const [deleteTarget, setDeleteTarget] = useState<InvoiceSuratJalanRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const loadData = () => {
    Promise.all([
      api.getMitra().catch(() => [] as Mitra[]),
      api.getRekapMitra().catch(() => null),
      api.getInvoiceSuratJalan().catch(() => [] as InvoiceSuratJalanRecord[]),
      api.getPenjualanHasilBumi().catch(() => [] as TransaksiPenjualanHasilBumi[]),
      api.getRekapCtr().catch(() => [] as RekapCtrContract[]),
    ]).then(([mRes, rekapRes, invRes, jhbRes, ctrRes]) => {
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
      if (Array.isArray(jhbRes)) setPenjualanHbList(jhbRes);
      if (Array.isArray(ctrRes)) setRekapCtrList(ctrRes);
    });
  };

  const resetFormToCreate = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    loadedEditRef.current = null;
    setEditingInvoice(null);
    setActiveTab('INPUT');
    setSumberBarang('MITRA');
    setSelectedMitraId('');
    setNoPenjualanHasilBumi('');
    setCatatArusKas(false);
    setNoInvoice(`WAP${y}${m}${d}-${Math.floor(100 + Math.random() * 900)}`);
    setTanggal(`${d}/${m}/${y}`);
    setKategoriKode('');
    setSelectedCtrId('');
    setShowQuickAddCtr(false);
    setCatatan('Pembayaran Via Transfer');
    setDetailRows([createEmptyDetailRow(1, { rendemenStr: '90,05' })]);
    setPajakAuto(true);
    setPajakNominal(0);
    setKomisiNominal(0);
    setPotongPiutang(true);
    setKasbonNominal(0);
    setPotonganLainLabel('');
    setPotonganLainNominal(0);
    setTambahanLabel('');
    setTambahanNominal(0);
    setShowExtraAdjustments(false);
    setStatusPembayaranMitra('PENDING');
    setErrorMsg(null);
  };

  const populateFormFromInvoice = (inv: InvoiceSuratJalanRecord) => {
    if (inv.statusPembayaranMitra !== 'PENDING') {
      setHistoryErrorMsg(
        `Invoice ${inv.noInvoice} sudah berstatus LUNAS dan tidak dapat diedit.`
      );
      return;
    }
    const mitraIdVal = inv.idMitra === 'STOK_HB_PT' ? '' : inv.idMitra;
    loadedEditRef.current = { invoiceId: inv.id, mitraId: mitraIdVal };
    setEditingInvoice(inv);
    setActiveTab('INPUT');
    setErrorMsg(null);
    setHistoryErrorMsg(null);
    setSumberBarang(inv.sumberBarang || 'MITRA');
    setSelectedMitraId(mitraIdVal);
    setNoPenjualanHasilBumi(inv.noPenjualanHasilBumi || '');
    setCatatArusKas(false);
    setNoInvoice(inv.noInvoice);
    setTanggal(inv.tanggal);
    setKategoriKode(inv.kategoriKode || '');
    setSelectedCtrId(inv.rekapCtrId || '');
    setShowQuickAddCtr(false);
    setCatatan(inv.catatan || 'Pembayaran Via Transfer');

    const srcDetails = getSuratJalanDetails(inv);
    setDetailRows(
      srcDetails.map((d, i) => {
        const autoMitra =
          Math.round((d.basisMitra || 0) * ((d.rendemen || 0) / 100) * 100) / 100;
        const autoBuyer =
          Math.round((d.basisBuyer || d.basisMitra || 0) * ((d.rendemen || 0) / 100) * 100) / 100;
        const hasManualMitra =
          (d.hargaPerKgMitra || 0) > 0 && Math.abs((d.hargaPerKgMitra || 0) - autoMitra) > 0.05;
        const hasManualBuyer =
          (d.hargaPerKgBuyer || 0) > 0 && Math.abs((d.hargaPerKgBuyer || 0) - autoBuyer) > 0.05;
        return {
          id: d.id || `partai-edit-${i + 1}-${Date.now()}`,
          deskripsi: d.deskripsi || 'KOPI',
          platTruk: d.platTruk || '',
          basisMitraStr: d.basisMitra ? String(d.basisMitra).replace('.', ',') : '',
          basisBuyerStr:
            d.basisBuyer || d.basisMitra
              ? String(d.basisBuyer || d.basisMitra).replace('.', ',')
              : '',
          rendemenStr: d.rendemen ? String(d.rendemen).replace('.', ',') : '',
          tonaseAwalStr: d.tonaseAwalKg > 0 ? String(d.tonaseAwalKg).replace('.', ',') : '',
          tonaseAkhirStr: d.tonaseAkhirKg > 0 ? String(d.tonaseAkhirKg).replace('.', ',') : '',
          hargaMitraManualStr: hasManualMitra ? String(d.hargaPerKgMitra).replace('.', ',') : '',
          hargaBuyerManualStr: hasManualBuyer ? String(d.hargaPerKgBuyer).replace('.', ',') : '',
          keterangan: d.keterangan || '',
        };
      })
    );

    const expectedAutoPajak = Math.round((inv.totalPenjualanMitra || 0) * 0.0025);
    const wasAutoPajak =
      (inv.sumberBarang || 'MITRA') !== 'STOK_HB_PT' &&
      Math.abs((inv.pajakNominal || 0) - expectedAutoPajak) <= 1;
    setPajakAuto(wasAutoPajak);
    setPajakNominal(inv.pajakNominal || 0);
    setKomisiNominal(inv.komisiNominal || 0);
    setPotongPiutang(Boolean(inv.potongPiutang && (inv.kasbonNominal || 0) > 0));
    setKasbonNominal(inv.kasbonNominal || 0);
    setPotonganLainLabel(inv.potonganLainLabel || '');
    setPotonganLainNominal(inv.potonganLainNominal || 0);
    setTambahanLabel(inv.tambahanLabel || '');
    setTambahanNominal(inv.tambahanNominal || 0);
    setShowExtraAdjustments(
      Boolean(
        (inv.potonganLainNominal || 0) > 0 ||
          (inv.tambahanNominal || 0) > 0 ||
          inv.potonganLainLabel ||
          inv.tambahanLabel
      )
    );
    setStatusPembayaranMitra(inv.statusPembayaranMitra || 'PENDING');
    setRekeningPtKode(inv.rekeningPtKode || 'BNI01');
  };

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    loadData();
    const bni = rekeningList.find(
      (r) => r.kode === 'BNI01' || /bni\s*direct/i.test(r.nama || '')
    );
    if (bni && !initialEditInvoice) {
      setRekeningPtKode(bni.kode);
      setCairkanRekening(bni.kode);
    }
    if (initialEditInvoice) {
      if (justOpened || loadedEditRef.current?.invoiceId !== initialEditInvoice.id) {
        populateFormFromInvoice(initialEditInvoice);
      }
    } else if (justOpened) {
      resetFormToCreate();
    }
  }, [open, rekeningList, initialEditInvoice]);

  const selectedMitra = useMemo(
    () => mitraList.find((m) => m.id === selectedMitraId) || null,
    [mitraList, selectedMitraId]
  );

  // Otomatis tarik saldo piutang/kasbon aktif milik supplier saat dipilih (hanya mode Mitra, dan tidak menimpa data edit yang sedang dibuka)
  useEffect(() => {
    if (loadedEditRef.current && selectedMitraId === loadedEditRef.current.mitraId) {
      return;
    }
    if (sumberBarang === 'STOK_HB_PT') {
      setPotongPiutang(false);
      setKasbonNominal(0);
      return;
    }
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
  }, [selectedMitra, selectedMitraId, piutangMap, sumberBarang]);

  // Compute each detail row with precise arithmetic
  const computedDetails = useMemo<InvoiceSuratJalanDetailItem[]>(() => {
    return detailRows.map((row) => {
      const basisMitra = parseIndoNumber(row.basisMitraStr);
      const basisBuyer = parseIndoNumber(row.basisBuyerStr) || basisMitra;
      const rendemen = parseIndoNumber(row.rendemenStr);
      const tonaseAwalKg = parseIndoNumber(row.tonaseAwalStr);
      const tonaseAkhirKg = parseIndoNumber(row.tonaseAkhirStr);

      const autoHargaMitra = Math.round(basisMitra * (rendemen / 100) * 100) / 100;
      const autoHargaBuyer = Math.round(basisBuyer * (rendemen / 100) * 100) / 100;

      const manualMitra = parseIndoNumber(row.hargaMitraManualStr);
      const manualBuyer = parseIndoNumber(row.hargaBuyerManualStr);

      const hargaPerKgMitra =
        row.hargaMitraManualStr.trim() !== '' && manualMitra >= 0
          ? manualMitra
          : autoHargaMitra;
      const hargaPerKgBuyer =
        row.hargaBuyerManualStr.trim() !== '' && manualBuyer >= 0
          ? manualBuyer
          : autoHargaBuyer;

      const subtotalMitra = Math.round(tonaseAkhirKg * hargaPerKgMitra);
      const subtotalBuyer = Math.round(tonaseAkhirKg * hargaPerKgBuyer);
      const susutKg =
        tonaseAwalKg > 0 && tonaseAkhirKg > 0
          ? Math.round((tonaseAwalKg - tonaseAkhirKg) * 10) / 10
          : 0;

      return {
        id: row.id,
        deskripsi: (row.deskripsi || 'KOPI').trim(),
        platTruk: row.platTruk.trim().toUpperCase(),
        tonaseAwalKg,
        tonaseAkhirKg,
        susutKg,
        basisMitra,
        basisBuyer,
        rendemen,
        hargaPerKgMitra,
        hargaPerKgBuyer,
        subtotalMitra,
        subtotalBuyer,
        keterangan: row.keterangan.trim(),
      };
    });
  }, [detailRows]);

  const totalTonaseAwalKg = useMemo(
    () => Math.round(computedDetails.reduce((s, d) => s + d.tonaseAwalKg, 0) * 100) / 100,
    [computedDetails]
  );

  const totalTonaseAkhirKg = useMemo(
    () => Math.round(computedDetails.reduce((s, d) => s + d.tonaseAkhirKg, 0) * 100) / 100,
    [computedDetails]
  );

  const totalSusutKg = useMemo(() => {
    if (totalTonaseAwalKg > 0 && totalTonaseAkhirKg > 0) {
      return Math.round((totalTonaseAwalKg - totalTonaseAkhirKg) * 10) / 10;
    }
    return 0;
  }, [totalTonaseAwalKg, totalTonaseAkhirKg]);

  const totalPenjualan = useMemo(
    () => computedDetails.reduce((s, d) => s + d.subtotalMitra, 0),
    [computedDetails]
  );

  const totalPenjualanBuyer = useMemo(
    () => computedDetails.reduce((s, d) => s + d.subtotalBuyer, 0),
    [computedDetails]
  );

  useEffect(() => {
    if (sumberBarang === 'STOK_HB_PT') return;
    if (pajakAuto) {
      setPajakNominal(Math.round(totalPenjualan * 0.0025));
    }
  }, [totalPenjualan, pajakAuto, sumberBarang]);

  const marginHargaPt = useMemo(
    () =>
      sumberBarang === 'STOK_HB_PT'
        ? 0
        : Math.max(0, totalPenjualanBuyer - totalPenjualan),
    [sumberBarang, totalPenjualanBuyer, totalPenjualan]
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

  const pendingCount = useMemo(
    () =>
      invoiceHistory.filter(
        (i) => i.sumberBarang !== 'STOK_HB_PT' && i.statusPembayaranMitra === 'PENDING'
      ).length,
    [invoiceHistory]
  );

  const filteredHistory = useMemo(() => {
    if (filterHistoryStatus === 'PENDING') {
      return invoiceHistory.filter(
        (i) => i.sumberBarang !== 'STOK_HB_PT' && i.statusPembayaranMitra === 'PENDING'
      );
    }
    if (filterHistoryStatus === 'LUNAS') {
      return invoiceHistory.filter(
        (i) => i.sumberBarang === 'STOK_HB_PT' || i.statusPembayaranMitra === 'LUNAS'
      );
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
      if (inv.sumberBarang === 'STOK_HB_PT') continue;
      if (inv.statusPembayaranMitra === 'PENDING') {
        pendingHak += inv.jumlahPembayaranMitra || 0;
      } else {
        lunasHak += inv.jumlahPembayaranMitra || 0;
      }
    }
    return { omzetBuyer, untungPt, pendingHak, lunasHak };
  }, [invoiceHistory]);

  const handleSwitchSumberBarang = (mode: 'MITRA' | 'STOK_HB_PT') => {
    setSumberBarang(mode);
    setErrorMsg(null);
    if (mode === 'STOK_HB_PT') {
      setPajakAuto(false);
      setPajakNominal(0);
      setKomisiNominal(0);
      setPotongPiutang(false);
      setKasbonNominal(0);
      setCatatArusKas(false);
      setStatusPembayaranMitra('LUNAS');
      const firstKopi = stokHasilBumiList.find((s) => /kopi/i.test(s.nama || ''));
      setDetailRows((prev) =>
        prev.map((row, idx) =>
          idx === 0
            ? {
                ...row,
                deskripsi: (firstKopi?.nama || row.deskripsi || 'KOPI').toUpperCase(),
                rendemenStr: row.tonaseAkhirStr ? row.rendemenStr : '100',
              }
            : row
        )
      );
    } else {
      setNoPenjualanHasilBumi('');
      setPajakAuto(true);
      setCatatArusKas(false);
      setStatusPembayaranMitra('PENDING');
    }
  };

  const handleSelectPenjualanHb = (noPenjualan: string) => {
    setNoPenjualanHasilBumi(noPenjualan);
    if (!noPenjualan) return;
    const jhb = penjualanHbList.find((p) => p.noPenjualan === noPenjualan);
    if (!jhb) return;

    if (jhb.tanggal) setTanggal(jhb.tanggal);
    if (jhb.namaMitra && !/pembeli|pabrik umum/i.test(jhb.namaMitra)) {
      setKategoriKode(jhb.namaMitra.trim().toUpperCase());
    }
    setCatatan(
      jhb.noSuratJalan
        ? `Ref. Penjualan Stok HB ${jhb.noPenjualan} · SJ ${jhb.noSuratJalan}`
        : `Ref. Penjualan Stok HB ${jhb.noPenjualan}`
    );

    const hargaKg = Number(jhb.hargaJualPerKg) || 0;
    const tonaseAkhir = Number(jhb.tonaseAkhir || jhb.beratBersih) || 0;
    const tonaseAwal = Number(jhb.beratBersih) || tonaseAkhir;

    setDetailRows([
      {
        id: `partai-${Date.now()}-1`,
        deskripsi: (jhb.komoditasNama || 'KOPI').toUpperCase(),
        platTruk: (jhb.noSuratJalan || '').toUpperCase(),
        basisMitraStr: hargaKg > 0 ? String(hargaKg) : '61000',
        basisBuyerStr: hargaKg > 0 ? String(hargaKg) : '61000',
        rendemenStr: '100',
        tonaseAwalStr: tonaseAwal > 0 ? String(tonaseAwal) : '',
        tonaseAkhirStr: tonaseAkhir > 0 ? String(tonaseAkhir) : '',
        hargaMitraManualStr: hargaKg > 0 ? String(hargaKg) : '',
        hargaBuyerManualStr: hargaKg > 0 ? String(hargaKg) : '',
        keterangan: `Nota ${jhb.noPenjualan}`,
      },
    ]);

    setPajakAuto(false);
    setPajakNominal(0);
    setKomisiNominal(0);
    setPotongPiutang(false);
    setKasbonNominal(0);
    setCatatArusKas(false);
  };

  const updateDetailRow = (id: string, patch: Partial<DetailDraftRow>) => {
    setDetailRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const handleAddDetailRow = () => {
    const last = detailRows[detailRows.length - 1];
    setDetailRows((prev) => [
      ...prev,
      createEmptyDetailRow(prev.length + 1, {
        deskripsi: last?.deskripsi || 'KOPI',
        platTruk: last?.platTruk || '',
        basisMitraStr: last?.basisMitraStr || '61000',
        basisBuyerStr: last?.basisBuyerStr || '61000',
      }),
    ]);
  };

  const handleRemoveDetailRow = (id: string) => {
    if (detailRows.length <= 1) return;
    setDetailRows((prev) => prev.filter((r) => r.id !== id));
  };

  const ctrOptionsWithMetrics = useMemo(() => {
    const editingInvNo = editingInvoice?.noInvoice || '';
    const editingInvId = editingInvoice?.id || '';
    return [...rekapCtrList]
      .sort((a, b) => (b.noUrut || 0) - (a.noUrut || 0))
      .map((ctr) => {
        const rows = Array.isArray(ctr.rows) ? ctr.rows : [];
        const usedKg = rows.reduce((sum, r) => {
          // Saat edit invoice yang sudah ada di kontrak ini, jangan hitung dobel baris lamanya
          if (
            editingInvoice &&
            r.sourceRefId &&
            ((editingInvNo &&
              (r.sourceRefId === editingInvNo || r.sourceRefId.startsWith(`${editingInvNo}-`))) ||
              (editingInvId &&
                (r.sourceRefId === editingInvId || r.sourceRefId.startsWith(`${editingInvId}-`))))
          ) {
            return sum;
          }
          return sum + (Number(r.qtyAkhir) || 0);
        }, 0);
        const targetKg = Number(ctr.qtyCtr) || 0;
        const sisaKg = targetKg > 0 ? Math.round((targetKg - usedKg) * 10) / 10 : null;
        const isSelesai =
          ctr.statusKontrak === 'SELESAI' ||
          (ctr.statusKontrak === undefined && ctr.noUrut <= 26);
        return {
          ctr,
          usedKg: Math.round(usedKg * 10) / 10,
          targetKg,
          sisaKg,
          isSelesai,
        };
      });
  }, [rekapCtrList, editingInvoice]);

  const selectedCtrSummary = useMemo(
    () => ctrOptionsWithMetrics.find((x) => x.ctr.id === selectedCtrId) || null,
    [ctrOptionsWithMetrics, selectedCtrId]
  );

  const handleSelectCtr = (ctrId: string) => {
    setSelectedCtrId(ctrId);
    const found = rekapCtrList.find((c) => c.id === ctrId);
    if (found && found.gudang) {
      setKategoriKode(found.gudang.trim().toUpperCase());
    }
  };

  const handleQuickCreateCtr = async () => {
    const gudangUpper = (quickCtrGudang || kategoriKode || 'SKA').trim().toUpperCase();
    const noKontrakUpper = quickCtrNoKontrak.trim().toUpperCase();
    const qtyNum = parseIndoNumber(quickCtrQty);
    if (!gudangUpper) {
      setErrorMsg('Isi Buyer / Eksportir untuk kontrak baru (mis. LDC atau SKA).');
      return;
    }
    setQuickCtrSaving(true);
    setErrorMsg(null);
    try {
      const currentList = await api.getRekapCtr().catch(() => rekapCtrList);
      const maxNo = (currentList || []).reduce((m, c) => Math.max(m, c.noUrut || 0), 27);
      const nextNo = maxNo + 1;
      const newCtrId = `CTR-${nextNo}-${Date.now()}`;
      const newCtr: RekapCtrContract = {
        id: newCtrId,
        noUrut: nextNo,
        noKontrak: noKontrakUpper || undefined,
        tglCtr: quickCtrTgl.trim() || tanggal || '-',
        gudang: gudangUpper,
        qtyCtr: qtyNum > 0 ? qtyNum : 0,
        statusKontrak: 'AKTIF',
        rows: [
          {
            id: `CTR-${nextNo}-1-${Date.now()}`,
            basisWap: 62000,
            basisSuplayer: 62000,
            namaSuplayer: '',
            qtySuplayer: null,
            tglMasuk: '',
            truck: '',
            qtyAwal: null,
            qtyAkhir: 0,
            rendemen: 0,
            komisiNominal: 0,
            cekList: false,
            sourceType: 'MANUAL',
          },
        ],
      };
      const saved = await api.saveRekapCtr([...(currentList || []), newCtr]);
      setRekapCtrList(Array.isArray(saved) ? saved : [...(currentList || []), newCtr]);
      setSelectedCtrId(newCtrId);
      setKategoriKode(gudangUpper);
      setShowQuickAddCtr(false);
      setQuickCtrNoKontrak('');
      setQuickCtrTgl('');
      setQuickCtrGudang('');
      setQuickCtrQty('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membuat kontrak CTR baru.');
    } finally {
      setQuickCtrSaving(false);
    }
  };

  const buildCurrentPrintableInvoice = (): PrintableInvoiceSuratJalan | null => {
    const resolvedNamaMitra =
      selectedMitra?.nama ||
      (editingInvoice && editingInvoice.idMitra === selectedMitraId ? editingInvoice.namaMitra : '');
    if (sumberBarang === 'MITRA' && !resolvedNamaMitra) {
      setErrorMsg('Pilih Supplier / Mitra terlebih dahulu.');
      return null;
    }
    setErrorMsg(null);
    const primary = computedDetails[0];
    const uniqueKom = Array.from(new Set(computedDetails.map((d) => d.deskripsi).filter(Boolean))).join(', ');
    const uniqueTruk = Array.from(new Set(computedDetails.map((d) => d.platTruk || '').filter(Boolean))).join(', ');

    return {
      noInvoice,
      namaMitra:
        sumberBarang === 'STOK_HB_PT'
          ? 'STOK BARANG HB (PT WAP)'
          : resolvedNamaMitra || '-',
      tanggal,
      kategoriKode,
      basisMitra: primary?.basisMitra || 0,
      basisBuyer: primary?.basisBuyer || 0,
      rendemen: primary?.rendemen || 0,
      komoditasNama: uniqueKom || 'KOPI',
      platTruk: uniqueTruk,
      tonaseAwalKg: totalTonaseAwalKg,
      tonaseAkhirKg: totalTonaseAkhirKg,
      hargaPerKgMitra: primary?.hargaPerKgMitra || 0,
      totalPenjualanMitra: totalPenjualan,
      totalPenjualanBuyer,
      susutKg: totalSusutKg,
      pajakNominal,
      komisiNominal,
      kasbonNominal: sumberBarang === 'STOK_HB_PT' ? 0 : kasbonNominal,
      potonganLainLabel,
      potonganLainNominal,
      totalPotongan,
      tambahanLabel,
      tambahanNominal,
      jumlahPembayaranMitra: jumlahPembayaran,
      statusPembayaranMitra: sumberBarang === 'STOK_HB_PT' ? 'LUNAS' : statusPembayaranMitra,
      sumberBarang,
      catatan,
      detailItems: computedDetails,
    };
  };

  const handlePrintCurrentInvoice = () => {
    const payload = buildCurrentPrintableInvoice();
    if (payload) printInvoiceSuratJalan(payload);
  };

  const handleDownloadCurrentInvoice = () => {
    const payload = buildCurrentPrintableInvoice();
    if (payload) downloadInvoiceSuratJalanPdf(payload);
  };

  const handleSimpanInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedMitraId =
      selectedMitra?.id ||
      (editingInvoice && editingInvoice.idMitra === selectedMitraId ? editingInvoice.idMitra : '');
    const resolvedMitraNama =
      selectedMitra?.nama ||
      (editingInvoice && editingInvoice.idMitra === selectedMitraId ? editingInvoice.namaMitra : '');

    if (sumberBarang === 'MITRA' && (!resolvedMitraId || !resolvedMitraNama)) {
      setErrorMsg('Pilih Supplier / Mitra terlebih dahulu.');
      return;
    }
    if (!kategoriKode.trim()) {
      setErrorMsg('Isi nama Buyer / Pembeli terlebih dahulu (contoh: SKA).');
      return;
    }

    for (let i = 0; i < computedDetails.length; i++) {
      const d = computedDetails[i];
      if (!d.deskripsi.trim()) {
        setErrorMsg(`Deskripsi komoditas pada Partai #${i + 1} belum diisi.`);
        return;
      }
      if (d.tonaseAkhirKg <= 0) {
        setErrorMsg(`Kuantiti / Tonase Akhir (Kg) pada Partai #${i + 1} harus lebih dari 0.`);
        return;
      }
    }

    if (totalTonaseAkhirKg <= 0 || totalPenjualan <= 0) {
      setErrorMsg('Total tonase dan total penjualan harus lebih dari 0.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const primary = computedDetails[0];
      const uniqueKom = Array.from(new Set(computedDetails.map((d) => d.deskripsi).filter(Boolean))).join(', ');
      const uniqueTruk = Array.from(new Set(computedDetails.map((d) => d.platTruk || '').filter(Boolean))).join(', ');
      const isStokHb = sumberBarang === 'STOK_HB_PT';

      const commonPayload = {
        noInvoice,
        tanggal,
        idMitra: isStokHb ? 'STOK_HB_PT' : resolvedMitraId,
        namaMitra: isStokHb ? 'STOK BARANG HB (PT WAP)' : resolvedMitraNama,
        komoditasNama: uniqueKom || 'KOPI',
        kategoriKode,
        platTruk: uniqueTruk,
        tonaseAwalKg: totalTonaseAwalKg,
        tonaseAkhirKg: totalTonaseAkhirKg,
        basisMitra: primary.basisMitra,
        basisBuyer: primary.basisBuyer,
        rendemen: primary.rendemen,
        hargaPerKgMitra: primary.hargaPerKgMitra,
        hargaPerKgBuyer: primary.hargaPerKgBuyer,
        detailItems: computedDetails.map((d) => ({
          id: d.id,
          deskripsi: d.deskripsi,
          platTruk: d.platTruk,
          tonaseAwalKg: d.tonaseAwalKg,
          tonaseAkhirKg: d.tonaseAkhirKg,
          basisMitra: d.basisMitra,
          basisBuyer: d.basisBuyer,
          rendemen: d.rendemen,
          hargaPerKgMitra: d.hargaPerKgMitra,
          hargaPerKgBuyer: d.hargaPerKgBuyer,
          keterangan: d.keterangan,
        })),
        catatan,
        pajakNominal,
        komisiNominal,
        kasbonNominal: isStokHb ? 0 : kasbonNominal,
        potongPiutang: isStokHb ? false : potongPiutang,
        potonganLainLabel,
        potonganLainNominal,
        tambahanLabel,
        tambahanNominal,
        rekeningPtKode,
        statusPembayaranMitra: isStokHb ? ('LUNAS' as const) : statusPembayaranMitra,
        sumberBarang,
        noPenjualanHasilBumi: isStokHb && noPenjualanHasilBumi ? noPenjualanHasilBumi : undefined,
        rekapCtrId: selectedCtrId || undefined,
        rekapCtrNoUrut: selectedCtrSummary?.ctr.noUrut,
        rekapCtrNoKontrak: selectedCtrSummary?.ctr.noKontrak,
      };

      if (editingInvoice) {
        await api.updateInvoiceSuratJalan(editingInvoice.id, commonPayload);
        window.dispatchEvent(new CustomEvent('erp:data-updated'));
        onSuccess();
        loadData();
        const openedDirectlyToEdit = Boolean(initialEditInvoice);
        resetFormToCreate();
        if (openedDirectlyToEdit) {
          onClose();
        } else {
          setActiveTab('RIWAYAT');
        }
      } else {
        await api.createInvoiceSuratJalan({
          ...commonPayload,
          catatArusKas,
        });

        window.dispatchEvent(new CustomEvent('erp:data-updated'));
        onSuccess();
        loadData();
        setActiveTab('RIWAYAT');
        // Reset no invoice & detail rows for next entry
        const now = new Date();
        setNoInvoice(
          `WAP${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
            now.getDate()
          ).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`
        );
        setDetailRows([createEmptyDetailRow(1, { rendemenStr: isStokHb ? '100' : '90,05' })]);
        setKategoriKode('');
        setNoPenjualanHasilBumi('');
        setKomisiNominal(0);
        if (isStokHb) setPajakNominal(0);
        setPotonganLainLabel('');
        setPotonganLainNominal(0);
        setTambahanLabel('');
        setTambahanNominal(0);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan & memproses transaksi surat jalan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCairkanInvoice = async () => {
    if (!cairkanTarget) return;
    setCairkanLoading(true);
    setHistoryErrorMsg(null);
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
      setHistoryErrorMsg(err?.message || 'Gagal mencairkan invoice ke supplier');
    } finally {
      setCairkanLoading(false);
    }
  };

  const handleConfirmDeleteInvoice = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setHistoryErrorMsg(null);
    try {
      await api.deleteInvoiceSuratJalan(deleteTarget.id);
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onSuccess();
      loadData();
      setDeleteTarget(null);
    } catch (err: any) {
      setHistoryErrorMsg(err?.message || 'Gagal menghapus invoice');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-5xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="px-5 py-4 bg-sky-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-sky-200" />
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                Invoice Surat Jalan Penjualan (Multi-Partai)
              </h3>
              <p className="text-[11px] text-sky-200">
                1 Invoice dapat memuat beberapa detail / partai · Jembatan Arus Kas BNI DIRECT · Hak Mitra
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
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 cursor-pointer flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'INPUT'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              {editingInvoice ? (
                <>
                  <Pencil className="w-4 h-4 text-amber-600" />
                  <span>Edit Invoice ({editingInvoice.noInvoice})</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Input Invoice Baru</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('RIWAYAT')}
              className={`pb-2.5 px-3 text-xs font-bold border-b-2 cursor-pointer flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'RIWAYAT'
                  ? 'border-sky-700 text-sky-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <ListOrdered className="w-4 h-4" />
              <span>Daftar &amp; Rekap Surat Jalan</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold tabular-nums">
                  {pendingCount} Pending
                </span>
              )}
            </button>
          </div>
          <div className="text-[11px] font-mono text-zinc-500 pb-2 hidden sm:block">
            Rekening: <span className="font-bold text-sky-900">BNI DIRECT ({rekeningPtKode})</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'INPUT' ? (
            <form onSubmit={handleSimpanInvoice} className="space-y-4">
              {editingInvoice && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-amber-700 shrink-0" />
                    <div>
                      <span className="font-bold">
                        Mode Edit Invoice Pending: {editingInvoice.noInvoice}
                      </span>{' '}
                      <span className="text-amber-800">
                        · Perubahan data juga otomatis memperbarui baris di Rekap CTR.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (initialEditInvoice) {
                        onClose();
                      } else {
                        resetFormToCreate();
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg border border-amber-400 bg-white hover:bg-amber-100 text-amber-900 text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Batal Edit
                  </button>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Mode Sumber Barang: Titip Jual Mitra vs Stok Barang HB Sendiri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSwitchSumberBarang('MITRA')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    sumberBarang === 'MITRA'
                      ? 'bg-sky-50 border-sky-700 ring-1 ring-sky-700'
                      : 'bg-white border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="text-xs font-bold text-sky-950">
                    Titip Jual Barang Mitra / Supplier
                  </div>
                  <div className="text-[11px] text-zinc-600 mt-0.5">
                    Potong pajak 0,25%, komisi PT &amp; kasbon mitra · Hitung hak bersih mitra
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchSumberBarang('STOK_HB_PT')}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    sumberBarang === 'STOK_HB_PT'
                      ? 'bg-emerald-50 border-emerald-700 ring-1 ring-emerald-700'
                      : 'bg-white border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="text-xs font-bold text-emerald-950">
                    Penjualan Stok Barang HB Sendiri (PT WAP)
                  </div>
                  <div className="text-[11px] text-zinc-600 mt-0.5">
                    Kopi / hasil bumi stok PT sendiri · Pajak &amp; Komisi default Rp 0
                  </div>
                </button>
              </div>

              {/* Tarik Data Penjualan Stok Hasil Bumi (Opsional untuk mode STOK_HB_PT) */}
              {sumberBarang === 'STOK_HB_PT' && (
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-emerald-950">
                      Tarik dari Riwayat Penjualan Stok Hasil Bumi (Opsional)
                    </label>
                    <span className="text-[11px] text-emerald-700">
                      Jika sudah diinput di menu Stok HB, pilih notanya agar tidak dobel kas
                    </span>
                  </div>
                  <select
                    value={noPenjualanHasilBumi}
                    onChange={(e) => handleSelectPenjualanHb(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-xs font-semibold text-zinc-800"
                  >
                    <option value="">
                      -- Input Manual Stok Barang HB Sendiri --
                    </option>
                    {penjualanHbList.map((jhb) => (
                      <option key={jhb.noPenjualan} value={jhb.noPenjualan}>
                        {jhb.noPenjualan} · {jhb.tanggal} · {jhb.komoditasNama} ·{' '}
                        {Number(jhb.tonaseAkhir || jhb.beratBersih || 0).toLocaleString('id-ID')} Kg ·{' '}
                        {formatRupiah(jhb.totalNominal || 0)}
                        {jhb.noSuratJalan ? ` · SJ ${jhb.noSuratJalan}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Baris 1: Supplier / Sumber, Buyer / Pembeli, No Invoice, Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    {sumberBarang === 'STOK_HB_PT' ? 'Sumber Barang *' : 'Supplier / Mitra *'}
                  </label>
                  {sumberBarang === 'STOK_HB_PT' ? (
                    <div className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-xs font-bold text-emerald-950">
                      STOK BARANG HB (PT WAP)
                    </div>
                  ) : (
                    <select
                      value={selectedMitraId}
                      onChange={(e) => setSelectedMitraId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-semibold bg-white"
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
                  )}
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-sky-900 mb-1">
                    Buyer / Pembeli *
                  </label>
                  <input
                    type="text"
                    list="sj-buyer-list"
                    value={kategoriKode}
                    onChange={(e) => setKategoriKode(e.target.value.toUpperCase())}
                    placeholder="Ketik Buyer (misal: SKA)"
                    className="w-full px-3 py-2 rounded-lg border border-sky-300 bg-sky-50/40 text-xs font-bold uppercase text-sky-950"
                    required
                  />
                  <datalist id="sj-buyer-list">
                    {Array.from(
                      new Set([
                        'SKA',
                        ...invoiceHistory
                          .map((inv) => (inv.kategoriKode || '').trim().toUpperCase())
                          .filter(Boolean),
                      ])
                    ).map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">No. Invoice</label>
                  <input
                    type="text"
                    value={noInvoice}
                    onChange={(e) => setNoInvoice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
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

              {/* Pilihan Nomor Kontrak CTR (Pembeda Kontrak Berdekatan) */}
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold text-indigo-950">
                      Masuk ke Nomor Kontrak CTR (Rekap CTR)
                    </label>
                    <p className="text-[11px] text-indigo-700">
                      Pilih kontrak tujuan agar pengiriman yang datang berbarengan tidak tertukar antar kontrak.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickAddCtr((v) => !v);
                      if (!showQuickAddCtr) {
                        setQuickCtrGudang((kategoriKode || 'LDC').trim().toUpperCase());
                        setQuickCtrTgl('');
                      }
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showQuickAddCtr ? 'Tutup Form Kontrak' : 'Buat Kontrak Baru'}</span>
                  </button>
                </div>

                <select
                  value={selectedCtrId}
                  onChange={(e) => handleSelectCtr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-indigo-300 bg-white text-xs font-semibold text-slate-900"
                >
                  <option value="">
                    -- Otomatis (Ikuti Buyer &amp; Tanggal Invoice) --
                  </option>
                  {ctrOptionsWithMetrics.some((x) => !x.isSelesai) && (
                    <optgroup label="Kontrak Aktif / Sedang Berjalan">
                      {ctrOptionsWithMetrics
                        .filter((x) => !x.isSelesai)
                        .map(({ ctr, usedKg, targetKg, sisaKg }) => (
                          <option key={ctr.id} value={ctr.id}>
                            CTR #{ctr.noUrut}
                            {ctr.noKontrak ? ` · ${ctr.noKontrak}` : ''} · {ctr.gudang} · {ctr.tglCtr}
                            {targetKg > 0
                              ? ` · Sisa ${(sisaKg ?? 0).toLocaleString('id-ID')} / ${targetKg.toLocaleString('id-ID')} Kg`
                              : usedKg > 0
                              ? ` · Masuk ${usedKg.toLocaleString('id-ID')} Kg`
                              : ' · Kontrak Baru'}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {ctrOptionsWithMetrics.some((x) => x.isSelesai) && (
                    <optgroup label="Kontrak Selesai / Arsip Lama">
                      {ctrOptionsWithMetrics
                        .filter((x) => x.isSelesai)
                        .map(({ ctr, usedKg, targetKg }) => (
                          <option key={ctr.id} value={ctr.id}>
                            [SELESAI] CTR #{ctr.noUrut}
                            {ctr.noKontrak ? ` · ${ctr.noKontrak}` : ''} · {ctr.gudang} · {ctr.tglCtr} (
                            {usedKg.toLocaleString('id-ID')}
                            {targetKg > 0 ? ` / ${targetKg.toLocaleString('id-ID')}` : ''} Kg)
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>

                {/* Inline Quick Add Kontrak Baru */}
                {showQuickAddCtr && (
                  <div className="p-3 rounded-lg bg-white border border-indigo-200 space-y-2.5">
                    <div className="text-[11px] font-bold text-indigo-950">
                      Input Kontrak Baru (Langsung Tersimpan ke Rekap CTR &amp; Terpilih)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          No. / Kode Kontrak *
                        </label>
                        <input
                          type="text"
                          value={quickCtrNoKontrak}
                          onChange={(e) => setQuickCtrNoKontrak(e.target.value.toUpperCase())}
                          placeholder="mis. LDC-08/11"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs uppercase font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Tanggal Kontrak
                        </label>
                        <input
                          type="text"
                          value={quickCtrTgl}
                          onChange={(e) => setQuickCtrTgl(e.target.value)}
                          placeholder="mis. 8 November"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Buyer / Eksportir *
                        </label>
                        <input
                          type="text"
                          value={quickCtrGudang}
                          onChange={(e) => setQuickCtrGudang(e.target.value.toUpperCase())}
                          placeholder="LDC / SKA"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs uppercase font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Target Tonase (Kg)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quickCtrQty}
                          onChange={(e) => setQuickCtrQty(sanitizeDecimalInput(e.target.value))}
                          placeholder="mis. 35000"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowQuickAddCtr(false)}
                        className="px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600 text-[11px] font-semibold cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={quickCtrSaving}
                        onClick={handleQuickCreateCtr}
                        className="px-3 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                      >
                        {quickCtrSaving ? 'Menyimpan...' : 'Simpan & Pilih Kontrak'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Quota Monitor untuk Kontrak Terpilih */}
                {selectedCtrSummary && (() => {
                  const { ctr, usedKg, targetKg } = selectedCtrSummary;
                  const sisaSetelah =
                    targetKg > 0
                      ? Math.round((targetKg - usedKg - totalTonaseAkhirKg) * 10) / 10
                      : null;
                  const isOver = sisaSetelah !== null && sisaSetelah < 0;
                  return (
                    <div
                      className={`p-2.5 rounded-lg border text-[11px] tabular-nums space-y-1 ${
                        isOver
                          ? 'bg-amber-50 border-amber-300 text-amber-950'
                          : 'bg-white border-indigo-200 text-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-indigo-950">
                          CTR #{ctr.noUrut}
                          {ctr.noKontrak ? ` · ${ctr.noKontrak}` : ''} ({ctr.gudang} · {ctr.tglCtr})
                        </span>
                        <div className="flex flex-wrap items-center gap-3 font-mono">
                          {targetKg > 0 && (
                            <span>
                              Target: <strong>{targetKg.toLocaleString('id-ID')} Kg</strong>
                            </span>
                          )}
                          <span>
                            Terkirim: <strong>{usedKg.toLocaleString('id-ID')} Kg</strong>
                          </span>
                          <span className="text-sky-800">
                            Invoice ini: <strong>+{totalTonaseAkhirKg.toLocaleString('id-ID')} Kg</strong>
                          </span>
                          {sisaSetelah !== null && (
                            <span
                              className={
                                isOver
                                  ? 'text-rose-700 font-extrabold'
                                  : 'text-emerald-700 font-extrabold'
                              }
                            >
                              Sisa: {sisaSetelah.toLocaleString('id-ID')} Kg
                            </span>
                          )}
                        </div>
                      </div>
                      {isOver && (
                        <div className="text-[10px] text-amber-800 font-semibold">
                          Perhatian: Total tonase melebihi target kontrak ini sebesar{' '}
                          {Math.abs(sisaSetelah || 0).toLocaleString('id-ID')} Kg. Pastikan truk ini memang untuk kontrak{' '}
                          {ctr.noKontrak || `CTR #${ctr.noUrut}`} atau pindahkan ke kontrak berikutnya.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Detail Barang / Multi-Partai */}
              <div className="border border-sky-200 rounded-xl overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-sky-950">
                      Detail Barang / Partai Penjualan ({detailRows.length} Partai)
                    </div>
                    <div className="text-[11px] text-sky-700">
                      Satu truk bisa memuat beberapa partai dengan rendemen, kuantiti, atau harga berbeda. Desimal mendukung koma (,) maupun titik (.)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddDetailRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Partai / Detail</span>
                  </button>
                </div>

                <div className="divide-y divide-zinc-200">
                  {detailRows.map((row, idx) => {
                    const calc = computedDetails[idx];
                    return (
                      <div key={row.id} className="p-3.5 space-y-2.5 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-sky-900 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-sky-900 text-white text-[11px] font-mono">
                              {idx + 1}
                            </span>
                            <span>Detail Partai #{idx + 1}</span>
                            {calc && calc.rendemen > 0 && (
                              <span className="text-[11px] font-normal text-zinc-500">
                                · Rendemen {idx + 1}: {calc.rendemen.toFixed(2)}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs font-mono font-bold text-sky-950 tabular-nums">
                              Subtotal: {formatRupiah(calc?.subtotalMitra || 0)}
                            </div>
                            {detailRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDetailRow(row.id)}
                                className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title={`Hapus Partai #${idx + 1}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                              Deskripsi / Komoditas *
                            </label>
                            <input
                              type="text"
                              value={row.deskripsi}
                              onChange={(e) =>
                                updateDetailRow(row.id, { deskripsi: e.target.value })
                              }
                              placeholder="KOPI"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs font-semibold"
                              required
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                              Plat Truk
                            </label>
                            <input
                              type="text"
                              value={row.platTruk}
                              onChange={(e) =>
                                updateDetailRow(row.id, { platTruk: e.target.value })
                              }
                              placeholder="BG 8541 VE"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs uppercase font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                              Basis Mitra (Rp)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.basisMitraStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  basisMitraStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder="61000"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-sky-300 text-xs font-mono font-bold text-sky-900 tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-indigo-900 mb-1">
                              Basis Buyer (Rp)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.basisBuyerStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  basisBuyerStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder="61000"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-300 text-xs font-mono font-bold text-indigo-900 tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                              Rendemen {idx + 1} (%)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.rendemenStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  rendemenStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder="88,36"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                              Kuantiti Akhir (Kg) *
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.tonaseAkhirStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  tonaseAkhirStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder="4557"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono font-bold tabular-nums"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                              Tonase Awal (Kg)
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.tonaseAwalStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  tonaseAwalStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder="Opsional"
                              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-mono tabular-nums"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-sky-900 mb-1">
                              Harga Mitra / Kg (Auto:{' '}
                              {(
                                Math.round(
                                  parseIndoNumber(row.basisMitraStr) *
                                    (parseIndoNumber(row.rendemenStr) / 100) *
                                    100
                                ) / 100
                              ).toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              )
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.hargaMitraManualStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  hargaMitraManualStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder={`Auto: ${(
                                Math.round(
                                  parseIndoNumber(row.basisMitraStr) *
                                    (parseIndoNumber(row.rendemenStr) / 100) *
                                    100
                                ) / 100
                              ).toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-sky-200 bg-sky-50/40 text-xs font-mono tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-indigo-900 mb-1">
                              Harga Buyer / Kg
                            </label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={row.hargaBuyerManualStr}
                              onChange={(e) =>
                                updateDetailRow(row.id, {
                                  hargaBuyerManualStr: sanitizeDecimalInput(e.target.value),
                                })
                              }
                              placeholder={`Auto: ${(
                                Math.round(
                                  (parseIndoNumber(row.basisBuyerStr) ||
                                    parseIndoNumber(row.basisMitraStr)) *
                                    (parseIndoNumber(row.rendemenStr) / 100) *
                                    100
                                ) / 100
                              ).toLocaleString('id-ID', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/40 text-xs font-mono tabular-nums"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                              Keterangan Baris (KET)
                            </label>
                            <input
                              type="text"
                              value={row.keterangan}
                              onChange={(e) =>
                                updateDetailRow(row.id, { keterangan: e.target.value })
                              }
                              placeholder={
                                calc && calc.susutKg !== 0
                                  ? `Susut ${calc.susutKg} Kg`
                                  : 'Opsional'
                              }
                              className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Penjualan & Keuntungan PT */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="bg-sky-900 text-white px-3.5 py-2.5 rounded-xl flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-sky-200">
                    TOTAL PENJUALAN ({totalTonaseAkhirKg.toLocaleString('id-ID')} Kg · {detailRows.length} Partai)
                  </div>
                  <div className="font-mono text-base font-extrabold tabular-nums">
                    {formatRupiah(totalPenjualan)}
                  </div>
                  <div className="text-[10px] text-sky-300">
                    {sumberBarang === 'STOK_HB_PT'
                      ? 'Nilai Penjualan Stok Barang HB PT'
                      : 'Nilai Barang dari Mitra'}
                    {totalSusutKg !== 0 ? ` · Susut ${totalSusutKg} Kg` : ''}
                  </div>
                </div>
                <div className="bg-cyan-900 text-white px-3.5 py-2.5 rounded-xl flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-cyan-200">
                    {sumberBarang === 'STOK_HB_PT' && !catatArusKas
                      ? 'REKAP SURAT JALAN (NON-KAS)'
                      : 'UANG MASUK BUYER (BNI DIRECT)'}
                  </div>
                  <div className="font-mono text-base font-extrabold tabular-nums">
                    {formatRupiah(totalPenjualanBuyer)}
                  </div>
                  <div className="text-[10px] text-cyan-300">
                    {sumberBarang === 'STOK_HB_PT' && !catatArusKas
                      ? 'Tidak menambah saldo bank ganda'
                      : `Masuk ke Rekening PT: ${formatRupiah(totalPenjualanBuyer)}`}
                  </div>
                </div>
                <div className="bg-indigo-900 text-white px-3.5 py-2.5 rounded-xl flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-indigo-200">
                    {sumberBarang === 'STOK_HB_PT' ? 'PAJAK & KOMISI JASA' : 'TOTAL KEUNTUNGAN PT WAP'}
                  </div>
                  <div className="font-mono text-base font-extrabold tabular-nums">
                    {formatRupiah(totalKeuntunganPt)}
                  </div>
                  <div className="text-[10px] text-indigo-300">
                    {sumberBarang === 'STOK_HB_PT'
                      ? `Pajak ${formatRupiah(pajakNominal)} · Komisi ${formatRupiah(komisiNominal)}`
                      : `Margin ${formatRupiah(marginHargaPt)} + Komisi ${formatRupiah(komisiNominal)}`}
                  </div>
                </div>
              </div>

              {/* Potongan (-) */}
              <div className="border border-zinc-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-zinc-800">
                    {sumberBarang === 'STOK_HB_PT'
                      ? 'Pajak, Komisi (Default Rp 0) & Catatan'
                      : 'Potongan (-) & Catatan'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowExtraAdjustments((v) => !v)}
                    className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 cursor-pointer"
                  >
                    {showExtraAdjustments
                      ? 'Sembunyikan Potongan Lain / Tambahan'
                      : '+ Potongan Lain / Tambahan (+)'}
                  </button>
                </div>
                <div
                  className={`grid grid-cols-1 gap-3 ${
                    sumberBarang === 'STOK_HB_PT' ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-zinc-600">
                        {sumberBarang === 'STOK_HB_PT'
                          ? '1. Pajak (Rp) · Default 0'
                          : '1. Pajak 0,25% (Rp)'}
                      </label>
                      {sumberBarang === 'MITRA' ? (
                        <button
                          type="button"
                          onClick={() => setPajakAuto((v) => !v)}
                          className="text-[10px] font-semibold text-sky-700 cursor-pointer"
                        >
                          {pajakAuto ? 'Auto 0,25%' : 'Manual (Klik Auto)'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPajakNominal(0)}
                          className="text-[10px] font-semibold text-emerald-700 cursor-pointer"
                        >
                          Set 0
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      value={pajakNominal}
                      readOnly={sumberBarang === 'MITRA' && pajakAuto}
                      onChange={(e) => setPajakNominal(Number(e.target.value) || 0)}
                      className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold tabular-nums ${
                        sumberBarang === 'MITRA' && pajakAuto
                          ? 'border-zinc-200 bg-zinc-100 text-zinc-700 cursor-not-allowed'
                          : 'border-zinc-300 bg-white text-zinc-900'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-emerald-700">
                        {sumberBarang === 'STOK_HB_PT'
                          ? '2. Komisi PT (Rp) · Default 0'
                          : '2. Komisi PT (Rp) → Masuk Catatan PT WAP'}
                      </label>
                      {sumberBarang === 'STOK_HB_PT' && (
                        <button
                          type="button"
                          onClick={() => setKomisiNominal(0)}
                          className="text-[10px] font-semibold text-emerald-700 cursor-pointer"
                        >
                          Set 0
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      value={sumberBarang === 'STOK_HB_PT' ? komisiNominal : komisiNominal || ''}
                      onChange={(e) => setKomisiNominal(Number(e.target.value) || 0)}
                      placeholder={sumberBarang === 'STOK_HB_PT' ? '0' : '800000'}
                      className="w-full px-3 py-1.5 rounded-lg border border-emerald-300 text-xs font-mono font-bold text-emerald-800 tabular-nums"
                    />
                  </div>
                  {sumberBarang === 'MITRA' && (
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
                        className={`w-full px-3 py-1.5 rounded-lg border text-xs font-mono font-bold tabular-nums ${
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
                  )}
                </div>

                {showExtraAdjustments && (
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Label Potongan Lain (-)
                      </label>
                      <input
                        type="text"
                        value={potonganLainLabel}
                        onChange={(e) => setPotonganLainLabel(e.target.value)}
                        placeholder="Biaya Bongkar / Karung"
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Nominal Potongan Lain (Rp)
                      </label>
                      <input
                        type="number"
                        value={potonganLainNominal || ''}
                        onChange={(e) => setPotonganLainNominal(Number(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Label Tambahan (+)
                      </label>
                      <input
                        type="text"
                        value={tambahanLabel}
                        onChange={(e) => setTambahanLabel(e.target.value)}
                        placeholder="Subsidi Ongkir"
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                        Nominal Tambahan (Rp)
                      </label>
                      <input
                        type="number"
                        value={tambahanNominal || ''}
                        onChange={(e) => setTambahanNominal(Number(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-mono tabular-nums"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-600 mb-1">
                    Catatan Invoice
                  </label>
                  <input
                    type="text"
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Pembayaran Via Transfer"
                    className="w-full px-3 py-1.5 rounded-lg border border-zinc-200 text-xs"
                  />
                </div>
              </div>

              {/* Jumlah Pembayaran */}
              <div className="bg-emerald-900 text-white px-4 py-3 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-200 font-bold">
                    {sumberBarang === 'STOK_HB_PT'
                      ? 'Total Nilai Invoice (Penjualan Stok Barang HB PT)'
                      : 'Jumlah Pembayaran Hak Supplier'}
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    Total Penjualan ({formatRupiah(totalPenjualan)}) - Total Potongan ({formatRupiah(totalPotongan)})
                    {totalTambahan > 0 ? ` + Tambahan (${formatRupiah(totalTambahan)})` : ''}
                  </div>
                </div>
                <div className="font-mono text-xl font-extrabold tabular-nums">
                  {formatRupiah(jumlahPembayaran)}
                </div>
              </div>

              {/* Status Pencatatan Non-Kas & Pencairan */}
              {sumberBarang === 'STOK_HB_PT' ? (
                <div className="border border-emerald-300 bg-emerald-50/60 p-4 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-800" />
                      <span className="text-xs font-bold text-emerald-950">
                        Mode Pencatatan Murni Surat Jalan &amp; Rekap CTR (Non-Kas)
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200 tabular-nums">
                      Pajak: {formatRupiah(pajakNominal)} · Komisi: {formatRupiah(komisiNominal)}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    Surat Jalan &amp; Rekap CTR hanya mencatat administrasi pengiriman dan <strong>tidak mengubah saldo tunai maupun saldo rekening</strong>. Seluruh uang masuk dari Buyer tetap diinput melalui satu pintu di <strong>Menu Uang Masuk</strong>.
                  </p>
                </div>
              ) : (
                <div className="border border-sky-300 bg-sky-50/70 p-4 rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-sky-800" />
                      <span className="text-xs font-bold text-sky-950">
                        Pencatatan Rekap CTR &amp; Potong Piutang Rekening Koran Mitra (Non-Kas)
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-sky-800 bg-white px-2 py-0.5 rounded border border-sky-200 tabular-nums">
                      Total Buyer: {formatRupiah(totalPenjualanBuyer)}
                    </span>
                  </div>

                  <div className="text-[11px] text-sky-950 bg-white/90 p-2.5 rounded-lg border border-sky-200 leading-relaxed">
                    <strong>Aturan Arus Kas:</strong> Surat Jalan &amp; Rekap CTR <strong>tidak mengubah saldo kas tunai maupun saldo rekening berjalan</strong>. Seluruh dana masuk dari Buyer diinput terpisah lewat satu pintu di <strong>Menu Uang Masuk</strong>.
                  </div>

                  {/* Pilihan: Pending Order vs Langsung Lunas */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-bold text-sky-950">
                      Status Pencairan Surat Jalan ({formatRupiah(jumlahPembayaran)})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                              <span>Pending Order (BELUM CAIR)</span>
                            </div>
                            <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                              Masuk ke Rekap CTR dengan keterangan <strong>BELUM CAIR</strong>.
                              {potongPiutang && kasbonNominal > 0
                                ? ` Saat tombol Bayar (Cairkan) diklik nanti, Bayar Bon ${formatRupiah(
                                    kasbonNominal
                                  )} otomatis masuk ke Rekening Koran Mitra dengan keterangan Bayar via BNI DIRECT.`
                                : ' Tidak mengubah saldo kas/rekening berjalan.'}
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
                              <span>Sudah Cair (LUNAS)</span>
                            </div>
                            <p className="text-[11px] text-zinc-600 mt-1 leading-snug">
                              Status langsung lunas di Rekap CTR tanpa mengubah saldo kas/rekening berjalan
                              {potongPiutang && kasbonNominal > 0
                                ? `, dan Potong Piutang ${formatRupiah(
                                    kasbonNominal
                                  )} langsung masuk ke Rekening Koran Mitra (Bayar via BNI DIRECT).`
                                : '.'}
                            </p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-zinc-200">
                {editingInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      if (initialEditInvoice) {
                        onClose();
                      } else {
                        resetFormToCreate();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <X className="w-4 h-4" />
                    <span>Batal Edit</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDownloadCurrentInvoice}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-emerald-700 text-emerald-800 hover:bg-emerald-50 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintCurrentInvoice}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-sky-700 text-sky-800 hover:bg-sky-50 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Invoice</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer disabled:opacity-50 shadow-md whitespace-nowrap shrink-0 ${
                    editingInvoice
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : 'bg-sky-800 hover:bg-sky-900'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Menyimpan...'
                      : editingInvoice
                      ? 'Simpan Perubahan Invoice'
                      : sumberBarang === 'STOK_HB_PT'
                      ? 'Simpan Rekap Surat Jalan (Stok HB)'
                      : statusPembayaranMitra === 'PENDING'
                      ? 'Simpan Surat Jalan (Pending / Belum Cair)'
                      : 'Simpan Surat Jalan (Lunas)'}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            /* TAB RIWAYAT & REKAPAN SURAT JALAN */
            <div className="space-y-4">
              {historyErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{historyErrorMsg}</span>
                </div>
              )}

              {/* Ringkasan 4 Kartu */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                  <div className="text-[10px] font-bold text-sky-800">TOTAL OMZET BUYER</div>
                  <div className="font-mono text-sm font-extrabold text-sky-950 mt-0.5 tabular-nums">
                    {formatRupiah(historySummary.omzetBuyer)}
                  </div>
                  <div className="text-[9px] text-sky-600">Masuk Rekening PT</div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                  <div className="text-[10px] font-bold text-indigo-800">KEUNTUNGAN PT WAP</div>
                  <div className="font-mono text-sm font-extrabold text-indigo-950 mt-0.5 tabular-nums">
                    {formatRupiah(historySummary.untungPt)}
                  </div>
                  <div className="text-[9px] text-indigo-600">Margin + Komisi Jasa</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="text-[10px] font-bold text-amber-800">PENDING HAK MITRA</div>
                  <div className="font-mono text-sm font-extrabold text-amber-950 mt-0.5 tabular-nums">
                    {formatRupiah(historySummary.pendingHak)}
                  </div>
                  <div className="text-[9px] text-amber-700">Standby di BNI DIRECT</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <div className="text-[10px] font-bold text-emerald-800">HAK MITRA LUNAS</div>
                  <div className="font-mono text-sm font-extrabold text-emerald-950 mt-0.5 tabular-nums">
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
                      className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 ${
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
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
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
                      <th className="px-3 py-2.5">Partai &amp; Tonase</th>
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
                      filteredHistory.map((inv) => {
                        const details = getSuratJalanDetails(inv);
                        return (
                          <tr key={inv.id} className="hover:bg-zinc-50/70 transition-colors">
                            <td className="px-3 py-2.5">
                              <div className="font-mono font-bold text-sky-900">{inv.noInvoice}</div>
                              <div className="text-[10px] text-zinc-500">
                                {inv.tanggal} · Buyer:{' '}
                                <span className="font-bold text-zinc-700">
                                  {inv.kategoriKode || 'SKA'}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-zinc-800">{inv.namaMitra}</div>
                              <div className="text-[10px] font-mono text-zinc-500">
                                {inv.platTruk || '-'}
                                {inv.sumberBarang === 'STOK_HB_PT' && inv.noPenjualanHasilBumi
                                  ? ` · ${inv.noPenjualanHasilBumi}`
                                  : ''}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-zinc-800">
                                {inv.komoditasNama}
                                {details.length > 1 && (
                                  <span className="text-sky-700 font-normal">
                                    {' '}
                                    · {details.length} Partai
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] font-mono text-zinc-600 tabular-nums">
                                {inv.tonaseAkhirKg.toLocaleString('id-ID')} Kg
                                {inv.susutKg ? ` · Susut ${inv.susutKg} Kg` : ''}
                              </div>
                              {details.length > 1 && (
                                <div className="text-[10px] text-zinc-500 mt-0.5 space-y-0.5">
                                  {details.map((d, idx) => (
                                    <div key={d.id || idx} className="font-mono tabular-nums">
                                      P{idx + 1}: {d.tonaseAkhirKg.toLocaleString('id-ID')} Kg · R{' '}
                                      {d.rendemen.toFixed(2)}%
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-cyan-900 tabular-nums">
                              {formatRupiah(inv.totalPenjualanBuyer || inv.totalPenjualanMitra)}
                              {inv.sumberBarang === 'STOK_HB_PT' && inv.catatArusKas === false && (
                                <div className="text-[9px] font-normal text-zinc-500">Non-Kas</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-indigo-900 tabular-nums">
                              {formatRupiah(inv.totalKeuntunganPt)}
                              <div className="text-[9px] text-zinc-400">
                                Komisi {formatRupiah(inv.komisiNominal)}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-900 tabular-nums">
                              {inv.sumberBarang === 'STOK_HB_PT' ? (
                                <div>
                                  <div className="text-sky-800">Milik PT</div>
                                  <div className="text-[9px] font-normal text-zinc-500">
                                    Stok HB Sendiri
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {formatRupiah(inv.jumlahPembayaranMitra)}
                                  {inv.kasbonNominal > 0 && (
                                    <div className="text-[9px] text-amber-700">
                                      Potong Bon {formatRupiah(inv.kasbonNominal)}
                                    </div>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {inv.sumberBarang === 'STOK_HB_PT' ? (
                                <span className="text-[11px] font-bold text-sky-700">
                                  {inv.catatArusKas === false ? 'Stok HB · Rekap' : 'Stok HB · Kas'}
                                </span>
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
                                    : 'Lunas'}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {inv.sumberBarang !== 'STOK_HB_PT' &&
                                  inv.statusPembayaranMitra === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCairkanTarget(inv);
                                      setCairkanRekening(inv.rekeningPtKode || 'BNI01');
                                    }}
                                    className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                                    title="Cairkan Hak Mitra Sekarang"
                                  >
                                    Bayar
                                  </button>
                                )}
                                {inv.statusPembayaranMitra === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={() => populateFormFromInvoice(inv)}
                                    className="p-1 rounded hover:bg-amber-100 text-amber-700 cursor-pointer"
                                    title="Edit Invoice Surat Jalan (Belum Cair)"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => downloadInvoiceSuratJalanPdf(inv)}
                                  className="p-1 rounded hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                                  title="Download Surat Jalan (PDF)"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => printInvoiceSuratJalan(inv)}
                                  className="p-1 rounded hover:bg-zinc-200 text-zinc-700 cursor-pointer"
                                  title="Cetak Invoice"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(inv)}
                                  className="p-1 rounded hover:bg-rose-100 text-rose-600 cursor-pointer"
                                  title="Hapus Transaksi"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
                <div className="text-emerald-800 font-bold text-sm pt-1 tabular-nums">
                  Hak Bersih yang Ditransfer: {formatRupiah(cairkanTarget.jumlahPembayaranMitra)}
                </div>
                {cairkanTarget.potongPiutang && cairkanTarget.kasbonNominal > 0 && (
                  <div className="mt-1.5 p-2 rounded bg-amber-50 border border-amber-200 text-[11px] text-amber-900 tabular-nums">
                    Potong Piutang{' '}
                    <span className="font-bold">{formatRupiah(cairkanTarget.kasbonNominal)}</span>{' '}
                    otomatis tercatat sebagai <strong>Bayar Bon</strong> di Rekening Koran{' '}
                    {cairkanTarget.namaMitra} dengan keterangan{' '}
                    <strong>Bayar via {cairkanRekening === 'BNI01' ? 'BNI DIRECT' : cairkanRekening}</strong>{' '}
                    (tanpa mengubah saldo kas/rekening berjalan).
                  </div>
                )}
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
                    Rekening Keterangan Pencairan (Non-Kas · Tidak Memotong Saldo)
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
                          {r.kode} - {r.kode === 'BNI01' && !/direct/i.test(r.nama || '') ? 'BNI DIRECT' : r.nama}
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
                  {cairkanLoading ? 'Memproses...' : 'Konfirmasi Pencairan Surat Jalan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Konfirmasi Hapus Transaksi */}
        {deleteTarget && (
          <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full border border-zinc-200 shadow-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-rose-900">Batalkan &amp; Hapus Invoice</h4>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-zinc-600">
                Batalkan transaksi Invoice <strong className="font-mono text-zinc-900">{deleteTarget.noInvoice}</strong>{' '}
                a.n. <strong>{deleteTarget.namaMitra}</strong>? Saldo rekening &amp; mutasi terkait akan
                dikembalikan secara akurat.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-300 text-zinc-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deleteLoading}
                  onClick={handleConfirmDeleteInvoice}
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {deleteLoading ? 'Menghapus...' : 'Ya, Hapus Transaksi'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
