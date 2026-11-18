import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  PackageCheck,
  RefreshCw,
  Save,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  AuditStokMovementItem,
  AuditStokProdukSummary,
  AuditStokResponse,
  ProfilPerusahaan,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah } from '../../utils/format.ts';
import {
  exportAuditStokRingkasanCsv,
  exportAuditStokRingkasanPdf,
  exportKartuStokProdukPdf,
} from '../../utils/exportAuditStok.ts';

interface AuditStokBarangViewProps {
  profilPerusahaan?: ProfilPerusahaan | null;
  onRefreshParent?: () => void;
  onNavigateToStokBarang?: () => void;
}

type StatusFilter = 'ALL' | 'SELISIH' | 'COCOK' | 'MENIPIS';
type DetailTab = 'KRONOLOGIS' | 'KULAKAN' | 'PENJUALAN' | 'KOREKSI';

function parseDecimalFlexible(raw: string): number {
  const cleaned = String(raw || '').trim().replace(/\s+/g, '').replace(',', '.');
  if (!cleaned) return NaN;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

function fmtQty(val: number): string {
  const rounded = Math.round((Number(val) || 0) * 10000) / 10000;
  return rounded.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function fmtSignedQty(val: number): string {
  const rounded = Math.round((Number(val) || 0) * 10000) / 10000;
  if (rounded > 0) return `+${fmtQty(rounded)}`;
  return fmtQty(rounded);
}

export const AuditStokBarangView: React.FC<AuditStokBarangViewProps> = ({
  profilPerusahaan,
  onRefreshParent,
  onNavigateToStokBarang,
}) => {
  const [auditData, setAuditData] = useState<AuditStokResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKategori, setSelectedKategori] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [tanggalDari, setTanggalDari] = useState('');
  const [tanggalSampai, setTanggalSampai] = useState('');

  // Physical stock inputs keyed by kode produk
  const [fisikInputs, setFisikInputs] = useState<Record<string, string>>({});
  const [petugasAudit, setPetugasAudit] = useState('Kasir / Gudang');
  const [catatanAuditUmum, setCatatanAuditUmum] = useState('');
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Confirm Sync All prompt state (no window.confirm)
  const [confirmSyncAllOpen, setConfirmSyncAllOpen] = useState(false);

  // Inline edit Stok Awal modal/state
  const [editingAwalItem, setEditingAwalItem] = useState<AuditStokProdukSummary | null>(null);
  const [awalInputVal, setAwalInputVal] = useState('');
  const [awalKeterangan, setAwalKeterangan] = useState('');
  const [savingAwal, setSavingAwal] = useState(false);

  // Selected product detail modal (Traceability Kulakan -> Penjualan)
  const [selectedProdukKode, setSelectedProdukKode] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('KRONOLOGIS');
  const [modalFisikInput, setModalFisikInput] = useState('');
  const [modalFisikCatatan, setModalFisikCatatan] = useState('');
  const [modalAwalInput, setModalAwalInput] = useState('');
  const [modalAwalCatatan, setModalAwalCatatan] = useState('');
  const [savingModalAction, setSavingModalAction] = useState(false);

  const loadAuditData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await api.getAuditStokBarang({
        tanggalDari: tanggalDari || undefined,
        tanggalSampai: tanggalSampai || undefined,
      });
      setAuditData(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat data audit stok barang');
    } finally {
      setLoading(false);
    }
  }, [tanggalDari, tanggalSampai]);

  useEffect(() => {
    void loadAuditData();
  }, [loadAuditData]);

  const categories = useMemo(() => {
    if (!auditData) return [];
    const set = new Set<string>();
    for (const it of auditData.items) {
      if (it.kategori) set.add(it.kategori);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id-ID'));
  }, [auditData]);

  const filteredItems = useMemo(() => {
    if (!auditData) return [];
    const q = searchQuery.trim().toLowerCase();
    return auditData.items.filter((it) => {
      if (selectedKategori !== 'ALL' && it.kategori !== selectedKategori) return false;
      if (statusFilter === 'SELISIH' && it.statusAudit === 'COCOK') return false;
      if (statusFilter === 'COCOK' && it.statusAudit !== 'COCOK') return false;
      if (statusFilter === 'MENIPIS' && it.stokSistemSaatIni > it.minimum) return false;
      if (q) {
        const match =
          it.kode.toLowerCase().includes(q) ||
          it.namaProduk.toLowerCase().includes(q) ||
          it.kategori.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [auditData, searchQuery, selectedKategori, statusFilter]);

  const selectedProduk = useMemo(() => {
    if (!selectedProdukKode || !auditData) return null;
    return auditData.items.find((it) => it.kode === selectedProdukKode) || null;
  }, [selectedProdukKode, auditData]);

  useEffect(() => {
    if (selectedProduk) {
      const existingTyped = fisikInputs[selectedProduk.kode];
      setModalFisikInput(
        existingTyped !== undefined && existingTyped !== ''
          ? existingTyped
          : String(selectedProduk.stokHitunganAudit).replace('.', ',')
      );
      setModalFisikCatatan(selectedProduk.catatanAuditTerakhir || '');
      setModalAwalInput(String(selectedProduk.stokAwalMaster).replace('.', ','));
      setModalAwalCatatan(selectedProduk.keteranganStokAwal || '');
    }
  }, [selectedProduk, fisikInputs]);

  const editedFisikEntries = useMemo(() => {
    if (!auditData) return [];
    const list: Array<{ item: AuditStokProdukSummary; fisikVal: number }> = [];
    for (const it of auditData.items) {
      const raw = fisikInputs[it.kode];
      if (raw === undefined || raw.trim() === '') continue;
      const parsed = parseDecimalFlexible(raw);
      if (Number.isNaN(parsed) || parsed < 0) continue;
      list.push({ item: it, fisikVal: parsed });
    }
    return list;
  }, [auditData, fisikInputs]);

  const discrepantItems = useMemo(() => {
    if (!auditData) return [];
    return auditData.items.filter((it) => Math.abs(it.selisihSistemVsAudit) > 0.0001);
  }, [auditData]);

  const handleSaveBatchOpname = async () => {
    if (editedFisikEntries.length === 0) return;
    setSubmittingBatch(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const payloadItems = editedFisikEntries.map(({ item, fisikVal }) => ({
        kode: item.kode,
        stokFisikRiil: fisikVal,
        catatan: catatanAuditUmum.trim() || undefined,
      }));
      const res = await api.applyOpnameAuditStok({
        items: payloadItems,
        mode: 'OPNAME_FISIK',
        petugas: petugasAudit.trim() || 'Kasir / Gudang',
        catatanUmum: catatanAuditUmum.trim() || undefined,
      });
      setSuccessMsg(
        `Berhasil menyimpan hasil opname fisik riil untuk ${res.updatedCount} produk. Stok sistem dan kartu audit kini tersinkron.`
      );
      setFisikInputs({});
      setCatatanAuditUmum('');
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan opname fisik stok');
    } finally {
      setSubmittingBatch(false);
    }
  };

  const handleSaveSingleOpname = async (item: AuditStokProdukSummary, targetQty: number, catatan?: string) => {
    setSavingModalAction(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.applyOpnameAuditStok({
        items: [{ kode: item.kode, stokFisikRiil: targetQty, catatan }],
        mode: 'OPNAME_FISIK',
        petugas: petugasAudit.trim() || 'Kasir / Gudang',
      });
      setFisikInputs((prev) => {
        const next = { ...prev };
        delete next[item.kode];
        return next;
      });
      setSuccessMsg(
        `Stok riil "${item.namaProduk}" ditetapkan menjadi ${fmtQty(targetQty)} ${item.satuan}.`
      );
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memperbarui stok fisik riil');
    } finally {
      setSavingModalAction(false);
    }
  };

  const handleSyncItemToAudit = async (item: AuditStokProdukSummary) => {
    setSavingModalAction(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.applyOpnameAuditStok({
        items: [
          {
            kode: item.kode,
            stokFisikRiil: Math.max(0, item.stokHitunganAudit),
            catatan: `Sinkronisasi stok sistem agar sesuai hitungan audit (${fmtQty(item.stokHitunganAudit)} ${item.satuan})`,
          },
        ],
        mode: 'SINKRON_KE_AUDIT',
        petugas: petugasAudit.trim() || 'Kasir / Gudang',
      });
      setSuccessMsg(
        `Stok sistem "${item.namaProduk}" disinkronkan ke hasil hitungan audit (${fmtQty(Math.max(0, item.stokHitunganAudit))} ${item.satuan}).`
      );
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyinkronkan stok sistem');
    } finally {
      setSavingModalAction(false);
    }
  };

  const handleSyncAllDiscrepantToAudit = async () => {
    if (discrepantItems.length === 0) return;
    setSubmittingBatch(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await api.applyOpnameAuditStok({
        items: discrepantItems.map((it) => ({
          kode: it.kode,
          stokFisikRiil: Math.max(0, it.stokHitunganAudit),
        })),
        mode: 'SINKRON_KE_AUDIT',
        petugas: petugasAudit.trim() || 'Kasir / Gudang',
        catatanUmum: 'Sinkronisasi massal stok sistem ke hasil perhitungan audit (Kulakan - Penjualan)',
      });
      setConfirmSyncAllOpen(false);
      setSuccessMsg(
        `${res.updatedCount} produk berhasil disinkronkan agar Stok Sistem sama persis dengan Hitungan Audit.`
      );
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyinkronkan stok massal');
    } finally {
      setSubmittingBatch(false);
    }
  };

  const handleAnchorStokAwalFromSystem = async (item: AuditStokProdukSummary) => {
    const impliedAwal = Math.max(
      0,
      Math.round(
        (item.stokSistemSaatIni -
          item.totalMasukKulakan +
          item.totalKeluarPenjualan -
          item.totalKoreksiOpname) *
          10000
      ) / 10000
    );
    setSavingAwal(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.updateStokAwalAudit({
        items: [
          {
            kode: item.kode,
            stokAwal: impliedAwal,
            keterangan: 'Penetapan Stok Awal dari selisih historis sebelum transaksi kulakan/penjualan aplikasi',
          },
        ],
        petugas: petugasAudit.trim() || 'Admin / Gudang',
      });
      setSuccessMsg(
        `Stok Awal "${item.namaProduk}" ditetapkan ${fmtQty(impliedAwal)} ${item.satuan} sehingga neraca stok cocok.`
      );
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menetapkan stok awal');
    } finally {
      setSavingAwal(false);
    }
  };

  const handleSaveStokAwalModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAwalItem) return;
    const parsed = parseDecimalFlexible(awalInputVal);
    if (Number.isNaN(parsed) || parsed < 0) {
      setErrorMsg('Stok awal harus angka valid minimal 0');
      return;
    }
    setSavingAwal(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.updateStokAwalAudit({
        items: [
          {
            kode: editingAwalItem.kode,
            stokAwal: parsed,
            keterangan: awalKeterangan.trim() || 'Penyesuaian Stok Awal Audit Gudang',
          },
        ],
        petugas: petugasAudit.trim() || 'Admin / Gudang',
      });
      setSuccessMsg(
        `Stok Awal "${editingAwalItem.namaProduk}" diperbarui menjadi ${fmtQty(parsed)} ${editingAwalItem.satuan}.`
      );
      setEditingAwalItem(null);
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan stok awal');
    } finally {
      setSavingAwal(false);
    }
  };

  const handleSaveDetailModalAwal = async () => {
    if (!selectedProduk) return;
    const parsed = parseDecimalFlexible(modalAwalInput);
    if (Number.isNaN(parsed) || parsed < 0) {
      setErrorMsg('Nilai Stok Awal harus angka valid minimal 0');
      return;
    }
    setSavingModalAction(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await api.updateStokAwalAudit({
        items: [
          {
            kode: selectedProduk.kode,
            stokAwal: parsed,
            keterangan: modalAwalCatatan.trim() || 'Pembaruan Stok Awal dari Detail Audit Produk',
          },
        ],
        petugas: petugasAudit.trim() || 'Admin / Gudang',
      });
      setSuccessMsg(`Stok Awal "${selectedProduk.namaProduk}" disimpan: ${fmtQty(parsed)} ${selectedProduk.satuan}.`);
      await loadAuditData();
      onRefreshParent?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memperbarui stok awal');
    } finally {
      setSavingModalAction(false);
    }
  };

  const modalFilteredMovements: AuditStokMovementItem[] = useMemo(() => {
    if (!selectedProduk) return [];
    if (detailTab === 'KRONOLOGIS') return selectedProduk.movements;
    if (detailTab === 'KULAKAN') return selectedProduk.movements.filter((m) => m.jenis === 'KULAKAN');
    if (detailTab === 'PENJUALAN') {
      return selectedProduk.movements.filter(
        (m) => m.jenis === 'PENJUALAN' || m.jenis === 'PEMAKAIAN' || m.jenis === 'INTERNAL_PT'
      );
    }
    return selectedProduk.movements.filter(
      (m) => m.jenis === 'KOREKSI_OPNAME' || m.jenis === 'SINKRON_SISTEM'
    );
  }, [selectedProduk, detailTab]);

  const summary = auditData?.summary;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Audit Stok Barang &amp; Cek Stok Riil
            </h1>
            {auditData && (
              <span className="text-xs font-medium text-zinc-500">
                · {auditData.periodeLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Lacak keseimbangan barang dari <strong>Stok Awal</strong> + <strong>Kulakan Pemasok</strong> −{' '}
            <strong>Penjualan &amp; Pemakaian</strong> ± <strong>Koreksi Opname</strong> untuk memastikan stok riil gudang.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateToStokBarang && (
            <button
              type="button"
              onClick={onNavigateToStokBarang}
              className="px-3 py-2 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              Lihat Stok Barang Toko
            </button>
          )}
          <button
            type="button"
            disabled={!auditData || filteredItems.length === 0}
            onClick={() =>
              auditData &&
              exportAuditStokRingkasanCsv(filteredItems, fisikInputs, auditData.periodeLabel)
            }
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            disabled={!auditData || filteredItems.length === 0}
            onClick={() =>
              auditData &&
              exportAuditStokRingkasanPdf(auditData, filteredItems, fisikInputs, profilPerusahaan)
            }
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Cetak PDF Audit</span>
          </button>
          <button
            type="button"
            onClick={() => void loadAuditData()}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Audit Ulang</span>
          </button>
        </div>
      </div>

      {/* Feedback banners */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button type="button" onClick={() => setErrorMsg('')} className="text-rose-700 hover:text-rose-900 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Summary Grid */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Produk Fisik Diaudit</span>
              <Layers className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-zinc-900 font-mono tabular-nums">
              {summary.totalProdukFisik}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {summary.totalProdukTanpaStok > 0
                ? `${summary.totalProdukTanpaStok} jasa/alat non-stok dikecualikan`
                : 'Semua item memiliki stok fisik'}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Total Masuk (Kulakan)</span>
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              +{fmtQty(summary.totalQtyMasukKulakan)}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
              Nilai Modal: {formatRupiah(summary.totalNilaiMasukKulakan)}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Total Keluar (Jual &amp; Pakai)</span>
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-700 font-mono tabular-nums">
              −{fmtQty(summary.totalQtyKeluarPenjualan)}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
              Omzet: {formatRupiah(summary.totalNilaiOmzetPenjualan)}
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Rekonsiliasi Audit</span>
              {summary.totalItemSelisih === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
            </div>
            <div
              className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                summary.totalItemSelisih === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {summary.totalItemSelisih === 0
                ? '100% Cocok'
                : `${summary.totalItemSelisih} Perlu Cek`}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {summary.totalItemCocok} cocok · {summary.totalItemStokMenipis} stok menipis
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
              <span>Nilai Aset Stok Audit</span>
              <PackageCheck className="w-4 h-4 text-teal-600" />
            </div>
            <div className="mt-2 text-lg font-bold text-zinc-900 font-mono tabular-nums truncate">
              {formatRupiah(summary.totalNilaiAsetStokAudit)}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 font-mono tabular-nums">
              Nilai Sistem: {formatRupiah(summary.totalNilaiAsetStokSistem)}
            </div>
          </div>
        </div>
      )}

      {/* Filter & Controls Toolbar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Status tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'ALL', label: `Semua (${auditData?.items.length || 0})` },
                { id: 'SELISIH', label: `Ada Selisih (${summary?.totalItemSelisih || 0})` },
                { id: 'COCOK', label: `Cocok (${summary?.totalItemCocok || 0})` },
                { id: 'MENIPIS', label: `Stok Menipis (${summary?.totalItemStokMenipis || 0})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Category */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Cari kode / nama barang..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <select
              value={selectedKategori}
              onChange={(e) => setSelectedKategori(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((kat) => (
                <option key={kat} value={kat}>
                  {kat}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={tanggalDari}
                onChange={(e) => setTanggalDari(e.target.value)}
                title="Audit dari tanggal"
                className="px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white text-zinc-700"
              />
              <span className="text-zinc-400">s/d</span>
              <input
                type="date"
                value={tanggalSampai}
                onChange={(e) => setTanggalSampai(e.target.value)}
                title="Audit sampai tanggal"
                className="px-2 py-1.5 text-xs border border-zinc-200 rounded-lg bg-white text-zinc-700"
              />
              {(tanggalDari || tanggalSampai) && (
                <button
                  type="button"
                  onClick={() => {
                    setTanggalDari('');
                    setTanggalSampai('');
                  }}
                  className="px-2 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 bg-zinc-100 rounded-lg cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Reconciliation / Opname Action Bar */}
        <div className="pt-3 border-t border-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <ClipboardCheck className="w-4 h-4 text-teal-600 shrink-0" />
            <span>Petugas Opname:</span>
            <input
              type="text"
              value={petugasAudit}
              onChange={(e) => setPetugasAudit(e.target.value)}
              placeholder="Nama petugas..."
              className="px-2.5 py-1 text-xs border border-zinc-200 rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <input
              type="text"
              value={catatanAuditUmum}
              onChange={(e) => setCatatanAuditUmum(e.target.value)}
              placeholder="Catatan audit / opname (opsional)..."
              className="px-2.5 py-1 text-xs border border-zinc-200 rounded-lg w-56 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!auditData?.isFilteredPeriod && discrepantItems.length > 0 && (
              <>
                {!confirmSyncAllOpen ? (
                  <button
                    type="button"
                    onClick={() => setConfirmSyncAllOpen(true)}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Sinkronkan {discrepantItems.length} Selisih ke Hitungan Audit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg">
                    <span className="text-[11px] font-semibold text-amber-900">
                      Samakan Stok Sistem = Hitungan Audit untuk {discrepantItems.length} item?
                    </span>
                    <button
                      type="button"
                      disabled={submittingBatch}
                      onClick={() => void handleSyncAllDiscrepantToAudit()}
                      className="px-2 py-1 text-[11px] font-bold bg-amber-700 hover:bg-amber-800 text-white rounded cursor-pointer"
                    >
                      Ya, Terapkan
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSyncAllOpen(false)}
                      className="px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-200 rounded cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              disabled={editedFisikEntries.length === 0 || submittingBatch}
              onClick={() => void handleSaveBatchOpname()}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {submittingBatch
                  ? 'Menyimpan...'
                  : `Terapkan Opname Riil (${editedFisikEntries.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Reconciliation Table */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-3.5">Produk</th>
                <th className="py-3 px-3 text-right">Stok Awal</th>
                <th className="py-3 px-3 text-right">+ Kulakan</th>
                <th className="py-3 px-3 text-right">− Terjual / Pakai</th>
                <th className="py-3 px-3 text-right">± Opname</th>
                <th className="py-3 px-3 text-right">Hitungan Audit</th>
                <th className="py-3 px-3 text-right">Stok Sistem</th>
                <th className="py-3 px-3 text-right">Selisih</th>
                <th className="py-3 px-3 text-center">Cek Fisik Riil</th>
                <th className="py-3 px-3.5 text-center">Jejak &amp; Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-500">
                    Menghitung jejak audit stok dari Kulakan ke Penjualan...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-400">
                    Tidak ada produk fisik yang sesuai dengan filter audit saat ini.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const hasGap = Math.abs(item.selisihSistemVsAudit) > 0.0001;
                  const typedFisik = fisikInputs[item.kode] ?? '';
                  const parsedFisik = parseDecimalFlexible(typedFisik);
                  const hasTypedFisik = !Number.isNaN(parsedFisik) && parsedFisik >= 0;
                  const liveDiffFisik = hasTypedFisik
                    ? Math.round((parsedFisik - item.stokHitunganAudit) * 10000) / 10000
                    : null;

                  return (
                    <tr
                      key={item.kode}
                      className={`hover:bg-zinc-50/90 transition-colors ${
                        item.statusAudit === 'MINUS'
                          ? 'bg-rose-50/35'
                          : hasGap
                          ? 'bg-amber-50/30'
                          : ''
                      }`}
                    >
                      {/* Produk */}
                      <td className="py-3 px-3.5 align-top">
                        <div className="font-semibold text-zinc-900 leading-snug">
                          {item.namaProduk}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                          {item.kode} · {item.kategori} · {item.satuan}
                        </div>
                        {item.tanggalAuditTerakhir && (
                          <div className="text-[10px] text-teal-700 mt-0.5">
                            Opname terakhir: {item.tanggalAuditTerakhir} (Riil: {fmtQty(item.stokFisikTerakhir ?? item.stokSistemSaatIni)})
                          </div>
                        )}
                      </td>

                      {/* Stok Awal */}
                      <td className="py-3 px-3 text-right align-top">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAwalItem(item);
                            setAwalInputVal(String(item.stokAwalMaster).replace('.', ','));
                            setAwalKeterangan(item.keteranganStokAwal || '');
                          }}
                          title="Klik untuk atur Stok Awal"
                          className="inline-flex items-center gap-1 font-mono tabular-nums font-semibold text-zinc-800 hover:text-teal-700 underline decoration-dotted underline-offset-4 cursor-pointer"
                        >
                          <span>{fmtQty(item.stokAwalPeriode)}</span>
                        </button>
                        {!item.isStokAwalTercatat && !auditData?.isFilteredPeriod && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">Belum diset</div>
                        )}
                      </td>

                      {/* + Kulakan */}
                      <td className="py-3 px-3 text-right align-top">
                        <div
                          className={`font-mono tabular-nums font-semibold ${
                            item.totalMasukKulakan > 0 ? 'text-emerald-700' : 'text-zinc-400'
                          }`}
                        >
                          +{fmtQty(item.totalMasukKulakan)}
                        </div>
                        {item.jumlahNotaKulakan > 0 && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {item.jumlahNotaKulakan} nota · {formatRupiah(item.nilaiMasukKulakan)}
                          </div>
                        )}
                      </td>

                      {/* - Terjual */}
                      <td className="py-3 px-3 text-right align-top">
                        <div
                          className={`font-mono tabular-nums font-semibold ${
                            item.totalKeluarPenjualan > 0 ? 'text-rose-700' : 'text-zinc-400'
                          }`}
                        >
                          −{fmtQty(item.totalKeluarPenjualan)}
                        </div>
                        {item.jumlahNotaPenjualan > 0 && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {item.jumlahNotaPenjualan} nota · {formatRupiah(item.nilaiOmzetPenjualan)}
                          </div>
                        )}
                      </td>

                      {/* +/- Koreksi */}
                      <td className="py-3 px-3 text-right align-top font-mono tabular-nums">
                        <span
                          className={
                            item.totalKoreksiOpname > 0
                              ? 'text-sky-700 font-semibold'
                              : item.totalKoreksiOpname < 0
                              ? 'text-amber-700 font-semibold'
                              : 'text-zinc-400'
                          }
                        >
                          {fmtSignedQty(item.totalKoreksiOpname)}
                        </span>
                        {item.jumlahKoreksiOpname > 0 && (
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {item.jumlahKoreksiOpname}x opname
                          </div>
                        )}
                      </td>

                      {/* Hitungan Audit */}
                      <td className="py-3 px-3 text-right align-top">
                        <div className="font-mono tabular-nums font-bold text-sm text-zinc-900">
                          {fmtQty(item.stokHitunganAudit)}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono tabular-nums mt-0.5">
                          {formatRupiah(item.nilaiAsetStokAudit)}
                        </div>
                      </td>

                      {/* Stok Sistem */}
                      <td className="py-3 px-3 text-right align-top">
                        <div className="font-mono tabular-nums font-semibold text-sm text-zinc-700">
                          {fmtQty(item.stokSistemSaatIni)}
                        </div>
                        {item.stokSistemSaatIni <= item.minimum && (
                          <div className="text-[10px] font-semibold text-amber-700 mt-0.5">
                            Min {fmtQty(item.minimum)}
                          </div>
                        )}
                      </td>

                      {/* Selisih & Status */}
                      <td className="py-3 px-3 text-right align-top">
                        {item.statusAudit === 'COCOK' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            COCOK
                          </span>
                        ) : (
                          <div className="space-y-1">
                            <div
                              className={`font-mono tabular-nums font-bold text-xs ${
                                item.selisihSistemVsAudit < 0 ? 'text-rose-700' : 'text-amber-700'
                              }`}
                            >
                              {fmtSignedQty(item.selisihSistemVsAudit)} {item.satuan}
                            </div>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                item.statusAudit === 'MINUS'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : item.statusAudit === 'BELUM_SET_AWAL'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {item.statusAudit === 'BELUM_SET_AWAL'
                                ? 'SET STOK AWAL'
                                : item.statusAudit}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Input Fisik Riil */}
                      <td className="py-3 px-3 align-top">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={typedFisik}
                            onChange={(e) =>
                              setFisikInputs((prev) => ({
                                ...prev,
                                [item.kode]: e.target.value,
                              }))
                            }
                            placeholder={fmtQty(item.stokHitunganAudit)}
                            className="w-24 px-2 py-1 text-right font-mono tabular-nums text-xs border border-zinc-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                          />
                          {hasTypedFisik && liveDiffFisik !== null && (
                            <span
                              className={`text-[10px] font-mono tabular-nums font-semibold ${
                                Math.abs(liveDiffFisik) < 0.0001
                                  ? 'text-emerald-700'
                                  : liveDiffFisik > 0
                                  ? 'text-sky-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              vs Audit: {fmtSignedQty(liveDiffFisik)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-3.5 align-top">
                        <div className="flex flex-col items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProdukKode(item.kode);
                              setDetailTab('KRONOLOGIS');
                            }}
                            className="w-full px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Jejak &amp; Kartu
                          </button>

                          {hasTypedFisik ? (
                            <button
                              type="button"
                              disabled={savingModalAction}
                              onClick={() =>
                                void handleSaveSingleOpname(
                                  item,
                                  parsedFisik,
                                  catatanAuditUmum.trim() || undefined
                                )
                              }
                              className="w-full px-2.5 py-1 text-[11px] font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Simpan Riil
                            </button>
                          ) : item.statusAudit === 'BELUM_SET_AWAL' && !auditData?.isFilteredPeriod ? (
                            <button
                              type="button"
                              disabled={savingAwal}
                              onClick={() => void handleAnchorStokAwalFromSystem(item)}
                              title="Tetapkan Stok Awal agar selaras dengan stok saat ini"
                              className="w-full px-2 py-1 text-[10px] font-semibold text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Jadikan Stok Awal
                            </button>
                          ) : hasGap && !auditData?.isFilteredPeriod ? (
                            <button
                              type="button"
                              disabled={savingModalAction}
                              onClick={() => void handleSyncItemToAudit(item)}
                              className="w-full px-2 py-1 text-[10px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Ikuti Audit ({fmtQty(Math.max(0, item.stokHitunganAudit))})
                            </button>
                          ) : null}
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

      {/* Recent Audit / Opname Logs */}
      {auditData && auditData.recentAuditLogs.length > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-zinc-500" />
              <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                Riwayat Aktivitas Audit &amp; Opname Stok Riil
              </h2>
            </div>
            <span className="text-[11px] text-zinc-500">
              {auditData.recentAuditLogs.length} catatan terakhir
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 text-zinc-500 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-4">Waktu</th>
                  <th className="py-2.5 px-4">Produk</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4 text-right">Sistem Lama</th>
                  <th className="py-2.5 px-4 text-right">Audit Lama</th>
                  <th className="py-2.5 px-4 text-right">Hasil Riil Baru</th>
                  <th className="py-2.5 px-4">Petugas &amp; Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {auditData.recentAuditLogs.slice(0, 12).map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/80">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-zinc-600 whitespace-nowrap">
                      {log.tanggal} · {log.jam}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-zinc-900">
                      {log.namaProduk}{' '}
                      <span className="font-mono text-[11px] font-normal text-zinc-500">
                        ({log.kodeProduk})
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">
                        {log.mode === 'OPNAME_FISIK'
                          ? 'Opname Fisik Riil'
                          : log.mode === 'SINKRON_KE_AUDIT'
                          ? 'Sinkron ke Audit'
                          : 'Set Stok Awal'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-600">
                      {fmtQty(log.stokSistemSebelum)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-zinc-600">
                      {fmtQty(log.stokHitunganSebelum)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-teal-700">
                      {fmtQty(log.stokFisikRiil)} {log.satuan}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-600 text-[11px]">
                      <span className="font-semibold text-zinc-800">{log.petugas}</span> · {log.catatan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Edit Stok Awal Cepat */}
      {editingAwalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/50">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Atur Stok Awal Produk</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {editingAwalItem.namaProduk} ({editingAwalItem.kode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingAwalItem(null)}
                className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveStokAwalModal} className="p-5 space-y-4">
              <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Masuk Kulakan Tercatat:</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    +{fmtQty(editingAwalItem.totalMasukKulakan)} {editingAwalItem.satuan}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Keluar Penjualan Tercatat:</span>
                  <span className="font-mono font-semibold text-rose-700">
                    −{fmtQty(editingAwalItem.totalKeluarPenjualan)} {editingAwalItem.satuan}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Stok Sistem Saat Ini:</span>
                  <span className="font-mono font-bold text-zinc-900">
                    {fmtQty(editingAwalItem.stokSistemSaatIni)} {editingAwalItem.satuan}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Qty Stok Awal ({editingAwalItem.satuan})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={awalInputVal}
                  onChange={(e) => setAwalInputVal(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Catatan Stok Awal
                </label>
                <input
                  type="text"
                  value={awalKeterangan}
                  onChange={(e) => setAwalKeterangan(e.target.value)}
                  placeholder="Misal: Saldo sisa opname awal bulan"
                  className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingAwalItem(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingAwal}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg disabled:opacity-50 cursor-pointer"
                >
                  {savingAwal ? 'Menyimpan...' : 'Simpan Stok Awal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detail Traceability Produk (Kulakan -> Opname -> Penjualan -> Stok Riil) */}
      {selectedProduk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-zinc-900/55">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800">
                    {selectedProduk.kode}
                  </span>
                  <h2 className="text-base font-bold text-zinc-900">
                    {selectedProduk.namaProduk}
                  </h2>
                  <span className="text-xs text-zinc-500">
                    · {selectedProduk.kategori} · {selectedProduk.satuan}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Jejak audit kronologis dari Stok Awal, Kulakan Masuk, Penyesuaian Opname, hingga Penjualan &amp; Pemakaian.
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() =>
                    exportKartuStokProdukPdf(
                      selectedProduk,
                      auditData?.periodeLabel || 'Keseluruhan',
                      profilPerusahaan
                    )
                  }
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Cetak PDF Kartu Stok</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProdukKode(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Equation Proof Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase">Stok Awal</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-zinc-900">
                    {fmtQty(selectedProduk.stokAwalPeriode)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
                  <div className="text-[10px] font-semibold text-emerald-700 uppercase">+ Kulakan</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-emerald-800">
                    +{fmtQty(selectedProduk.totalMasukKulakan)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-200">
                  <div className="text-[10px] font-semibold text-rose-700 uppercase">− Penjualan</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-rose-800">
                    −{fmtQty(selectedProduk.totalKeluarPenjualan)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200">
                  <div className="text-[10px] font-semibold text-sky-700 uppercase">± Opname</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-sky-800">
                    {fmtSignedQty(selectedProduk.totalKoreksiOpname)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-teal-50 border border-teal-200">
                  <div className="text-[10px] font-semibold text-teal-800 uppercase">= Hitungan Audit</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums text-teal-900">
                    {fmtQty(selectedProduk.stokHitunganAudit)} {selectedProduk.satuan}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-zinc-900 text-white">
                  <div className="text-[10px] font-semibold text-zinc-300 uppercase">Stok Sistem</div>
                  <div className="mt-1 text-base font-bold font-mono tabular-nums">
                    {fmtQty(selectedProduk.stokSistemSaatIni)} {selectedProduk.satuan}
                  </div>
                  {Math.abs(selectedProduk.selisihSistemVsAudit) > 0.0001 && (
                    <div className="text-[10px] text-amber-300 font-mono mt-0.5">
                      Selisih: {fmtSignedQty(selectedProduk.selisihSistemVsAudit)}
                    </div>
                  )}
                </div>
              </div>

              {/* Financial & Margin Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="px-3.5 py-2.5 rounded-lg border border-zinc-200 bg-white flex items-center justify-between">
                  <span className="text-zinc-500">Total Nilai Kulakan Masuk</span>
                  <span className="font-mono font-bold text-zinc-900">
                    {formatRupiah(selectedProduk.nilaiMasukKulakan)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 rounded-lg border border-zinc-200 bg-white flex items-center justify-between">
                  <span className="text-zinc-500">Total Omzet Penjualan</span>
                  <span className="font-mono font-bold text-zinc-900">
                    {formatRupiah(selectedProduk.nilaiOmzetPenjualan)}
                  </span>
                </div>
                <div className="px-3.5 py-2.5 rounded-lg border border-zinc-200 bg-white flex items-center justify-between">
                  <span className="text-zinc-500">Total Laba Kotor Terjual</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {formatRupiah(selectedProduk.totalLabaKotorPenjualan)}
                  </span>
                </div>
              </div>

              {/* Action Controls inside Detail Modal */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Set Stok Awal */}
                <div className="p-3.5 rounded-xl border border-zinc-200 bg-zinc-50/70 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-600" />
                      <span>Koreksi Stok Awal Gudang</span>
                    </span>
                    {selectedProduk.statusAudit === 'BELUM_SET_AWAL' && (
                      <button
                        type="button"
                        disabled={savingAwal}
                        onClick={() => void handleAnchorStokAwalFromSystem(selectedProduk)}
                        className="text-[11px] font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                      >
                        Sesuaikan Otomatis dari Sistem
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={modalAwalInput}
                      onChange={(e) => setModalAwalInput(e.target.value)}
                      placeholder="Stok Awal"
                      className="w-24 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-zinc-300 rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      value={modalAwalCatatan}
                      onChange={(e) => setModalAwalCatatan(e.target.value)}
                      placeholder="Keterangan stok awal..."
                      className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      disabled={savingModalAction}
                      onClick={() => void handleSaveDetailModalAwal()}
                      className="px-3 py-1.5 text-xs font-semibold text-zinc-800 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-lg cursor-pointer"
                    >
                      Simpan Awal
                    </button>
                  </div>
                </div>

                {/* Terapkan Opname Fisik Riil */}
                <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <ClipboardCheck className="w-3.5 h-3.5 text-teal-700" />
                      <span>Tetapkan Stok Fisik Riil (Opname)</span>
                    </span>
                    {Math.abs(selectedProduk.selisihSistemVsAudit) > 0.0001 && (
                      <button
                        type="button"
                        disabled={savingModalAction}
                        onClick={() => void handleSyncItemToAudit(selectedProduk)}
                        className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                      >
                        Samakan Sistem = Audit ({fmtQty(Math.max(0, selectedProduk.stokHitunganAudit))})
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={modalFisikInput}
                      onChange={(e) => setModalFisikInput(e.target.value)}
                      placeholder="Qty Fisik Riil"
                      className="w-24 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-teal-300 rounded-lg bg-white"
                    />
                    <input
                      type="text"
                      value={modalFisikCatatan}
                      onChange={(e) => setModalFisikCatatan(e.target.value)}
                      placeholder="Alasan selisih / catatan opname..."
                      className="flex-1 min-w-[140px] px-2.5 py-1.5 text-xs border border-teal-300 rounded-lg bg-white"
                    />
                    <button
                      type="button"
                      disabled={savingModalAction}
                      onClick={() => {
                        const parsed = parseDecimalFlexible(modalFisikInput);
                        if (Number.isNaN(parsed) || parsed < 0) {
                          setErrorMsg('Qty fisik riil harus angka valid minimal 0');
                          return;
                        }
                        void handleSaveSingleOpname(
                          selectedProduk,
                          parsed,
                          modalFisikCatatan.trim() || undefined
                        );
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
                    >
                      Terapkan Riil
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail Ledger Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-200 pb-2">
                {(
                  [
                    { id: 'KRONOLOGIS', label: `Kartu Stok Kronologis (${selectedProduk.movements.length})` },
                    { id: 'KULAKAN', label: `Kulakan Masuk (${selectedProduk.jumlahNotaKulakan})` },
                    { id: 'PENJUALAN', label: `Penjualan & Pemakaian (${selectedProduk.jumlahNotaPenjualan})` },
                    { id: 'KOREKSI', label: `Riwayat Opname (${selectedProduk.jumlahKoreksiOpname})` },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      detailTab === t.id
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:bg-zinc-100'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Movements Ledger Table */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Tanggal &amp; Jam</th>
                        <th className="py-2.5 px-3">Tahap</th>
                        <th className="py-2.5 px-3">No. Nota</th>
                        <th className="py-2.5 px-3">Pihak / Metode</th>
                        <th className="py-2.5 px-3 text-right">Mutasi Qty</th>
                        <th className="py-2.5 px-3 text-right">Harga / Nilai</th>
                        <th className="py-2.5 px-3 text-right">Saldo Berjalan</th>
                        <th className="py-2.5 px-3">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {detailTab === 'KRONOLOGIS' && (
                        <tr className="bg-zinc-50/70">
                          <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-500">Awal</td>
                          <td className="py-2.5 px-3 font-bold text-zinc-700">STOK AWAL</td>
                          <td className="py-2.5 px-3 text-zinc-400">-</td>
                          <td className="py-2.5 px-3 text-zinc-600">Saldo Awal Periode</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-700">
                            {fmtQty(selectedProduk.stokAwalPeriode)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-400">-</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-zinc-900">
                            {fmtQty(selectedProduk.stokAwalPeriode)} {selectedProduk.satuan}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500 text-[11px]">
                            {selectedProduk.keteranganStokAwal || 'Posisi awal sebelum transaksi kulakan/penjualan'}
                          </td>
                        </tr>
                      )}

                      {modalFilteredMovements.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-zinc-400">
                            Belum ada mutasi transaksi pada tahap ini.
                          </td>
                        </tr>
                      ) : (
                        modalFilteredMovements.map((mv) => {
                          const isMasuk = mv.jenis === 'KULAKAN';
                          const isKeluar =
                            mv.jenis === 'PENJUALAN' ||
                            mv.jenis === 'PEMAKAIAN' ||
                            mv.jenis === 'INTERNAL_PT';
                          return (
                            <tr key={mv.id} className="hover:bg-zinc-50/80">
                              <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-600 whitespace-nowrap">
                                {mv.tanggal} · {mv.jam}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    isMasuk
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : isKeluar
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-sky-50 text-sky-700 border-sky-200'
                                  }`}
                                >
                                  {mv.jenis === 'KULAKAN'
                                    ? 'KULAKAN (+)'
                                    : mv.jenis === 'PENJUALAN'
                                    ? 'PENJUALAN (−)'
                                    : mv.jenis === 'PEMAKAIAN'
                                    ? 'PEMAKAIAN (−)'
                                    : mv.jenis === 'INTERNAL_PT'
                                    ? 'INTERNAL (−)'
                                    : mv.jenis === 'SINKRON_SISTEM'
                                    ? 'SINKRON'
                                    : 'OPNAME (±)'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-zinc-800 whitespace-nowrap">
                                {mv.idReferensi}
                                {mv.noFaktur && (
                                  <div className="text-[10px] font-normal text-zinc-500">
                                    Fak: {mv.noFaktur}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-zinc-900">{mv.pihakTerkait}</div>
                                {mv.metode && (
                                  <div className="text-[10px] text-zinc-500">{mv.metode}</div>
                                )}
                              </td>
                              <td
                                className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                                  mv.deltaQty > 0
                                    ? 'text-emerald-700'
                                    : mv.deltaQty < 0
                                    ? 'text-rose-700'
                                    : 'text-zinc-600'
                                }`}
                              >
                                {fmtSignedQty(mv.deltaQty)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                <div className="font-semibold text-zinc-900">
                                  {formatRupiah(mv.subtotal)}
                                </div>
                                {mv.hargaSatuan > 0 && (
                                  <div className="text-[10px] text-zinc-500">
                                    @{formatRupiah(mv.hargaSatuan)}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-zinc-900">
                                {fmtQty(mv.saldoSetelah)} {selectedProduk.satuan}
                              </td>
                              <td className="py-2.5 px-3 text-zinc-600 text-[11px] max-w-[220px]">
                                {mv.keterangan}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
