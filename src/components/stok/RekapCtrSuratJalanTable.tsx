import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  AlertCircle,
  X,
  PackagePlus,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  InvoiceSuratJalanRecord,
  Mitra,
  RekapCtrContract,
  RekapCtrPartaiRow,
  TransaksiPenjualanHasilBumi,
} from '../../server/types.ts';
import {
  computeCtrDatasetWithTotals,
  exportRekapCtrExcel,
  exportRekapCtrPdf,
} from '../../utils/rekapCtrHelper.ts';

interface RekapCtrSuratJalanTableProps {
  mitraList?: Mitra[];
  onDataSynced?: () => void;
}

function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let cleaned = trimmed.replace(/[Rp%\s]/gi, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  } else {
    // Handle Indonesian thousands dot like "66.000" vs decimal "8598.0"
    const parts = cleaned.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && Number(parts[0]) >= 1)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function fmtIdNumber(val: number | null | undefined, digits = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '';
  return val.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtRp(val: number | null | undefined, dec = 0): string {
  const num = Number(val) || 0;
  return `Rp${num.toLocaleString('id-ID', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

interface SpreadsheetCellProps {
  value: number | null | undefined;
  displayValue: string;
  onCommit: (val: number | null) => void;
  placeholder?: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  allowEmpty?: boolean;
}

const SpreadsheetNumberCell: React.FC<SpreadsheetCellProps> = ({
  value,
  displayValue,
  onCommit,
  placeholder = '',
  align = 'right',
  className = '',
  allowEmpty = true,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const handleFocus = () => {
    setEditing(true);
    setDraft(
      value !== null && value !== undefined && Number.isFinite(Number(value))
        ? String(value).replace('.', ',')
        : ''
    );
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseDecimal(draft);
    if (parsed === null && !allowEmpty) {
      onCommit(0);
    } else if (parsed !== (value ?? null)) {
      onCommit(parsed);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? draft : displayValue}
      placeholder={placeholder}
      onFocus={handleFocus}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          setEditing(false);
        }
      }}
      className={`w-full bg-transparent px-1.5 py-1 text-[11px] tabular-nums focus:outline-none focus:bg-sky-50 focus:ring-1 focus:ring-sky-500 ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    />
  );
};

export const RekapCtrSuratJalanTable: React.FC<RekapCtrSuratJalanTableProps> = ({
  onDataSynced,
}) => {
  const [contracts, setContracts] = useState<RekapCtrContract[]>([]);
  const [suratJalanList, setSuratJalanList] = useState<InvoiceSuratJalanRecord[]>([]);
  const [penjualanHbList, setPenjualanHbList] = useState<TransaksiPenjualanHasilBumi[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Modal tambah CTR baru
  const [showAddCtrModal, setShowAddCtrModal] = useState(false);
  const [newCtrNo, setNewCtrNo] = useState('');
  const [newCtrTgl, setNewCtrTgl] = useState('');
  const [newCtrGudang, setNewCtrGudang] = useState('SKA');
  const [newCtrQty, setNewCtrQty] = useState('');

  // Modal import transaksi ke CTR tertentu
  const [importTargetCtrId, setImportTargetCtrId] = useState<string | null>(null);
  const [importTab, setImportTab] = useState<'PENJUALAN_HB' | 'SURAT_JALAN'>('PENJUALAN_HB');

  // Konfirmasi hapus baris / CTR
  const [deletePrompt, setDeletePrompt] = useState<
    | { kind: 'ROW'; ctrId: string; rowId: string; label: string }
    | { kind: 'CTR'; ctrId: string; label: string }
    | null
  >(null);

  const autoSaveTimerRef = useRef<number | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ctrData, sjData, jhbData] = await Promise.all([
        api.getRekapCtr(),
        api.getInvoiceSuratJalan().catch(() => []),
        api.getPenjualanHasilBumi().catch(() => []),
      ]);
      setContracts(Array.isArray(ctrData) ? ctrData : []);
      setSuratJalanList(Array.isArray(sjData) ? sjData : []);
      setPenjualanHbList(Array.isArray(jhbData) ? jhbData : []);
      setIsDirty(false);
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Gagal memuat Rekap CTR WAP' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  const persistContracts = async (nextContracts: RekapCtrContract[], notify = false) => {
    setSaving(true);
    try {
      const saved = await api.saveRekapCtr(nextContracts);
      setContracts(saved);
      setIsDirty(false);
      if (notify) {
        setStatusMessage({ type: 'ok', text: 'Perubahan Rekap CTR tersimpan.' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Gagal menyimpan Rekap CTR' });
    } finally {
      setSaving(false);
    }
  };

  const scheduleUpdate = (nextContracts: RekapCtrContract[], immediate = false) => {
    setContracts(nextContracts);
    setIsDirty(true);
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    if (immediate) {
      persistContracts(nextContracts, false);
    } else {
      autoSaveTimerRef.current = window.setTimeout(() => {
        persistContracts(nextContracts, false);
      }, 900);
    }
  };

  const handleSyncErp = async () => {
    setSyncing(true);
    setStatusMessage(null);
    try {
      const res = await api.syncRekapCtr();
      setContracts(res.contracts);
      setIsDirty(false);
      onDataSynced?.();
      setStatusMessage({
        type: 'ok',
        text:
          res.addedCount > 0
            ? `Sinkronisasi berhasil: ${res.addedCount} transaksi baru ditambahkan ke Rekap CTR.`
            : 'Data Rekap CTR sudah sinkron dengan Surat Jalan & Penjualan Hasil Bumi.',
      });
    } catch (err: any) {
      setStatusMessage({ type: 'err', text: err?.message || 'Gagal menyinkronkan Rekap CTR' });
    } finally {
      setSyncing(false);
    }
  };

  const dataset = useMemo(() => computeCtrDatasetWithTotals(contracts), [contracts]);

  const aggregateStats = useMemo(() => {
    let totalDanaMasuk = 0;
    let totalPajak = 0;
    let totalKomisi = 0;
    let totalTonaseKg = 0;
    for (const item of dataset.items) {
      totalDanaMasuk += item.totalDanaMasuk;
      totalPajak += item.totalPajak;
      totalKomisi += item.totalKomisi;
      totalTonaseKg += item.totalQtyAkhir;
    }
    return {
      totalContracts: dataset.items.length,
      totalDanaMasuk,
      totalPajakDanKomisi: totalPajak + totalKomisi,
      totalTonaseKg,
      grandCumulativeLr: dataset.grandCumulativeLr,
    };
  }, [dataset]);

  const updateContractField = (
    ctrId: string,
    patch: Partial<Pick<RekapCtrContract, 'noUrut' | 'tglCtr' | 'gudang' | 'qtyCtr'>>
  ) => {
    const next = contracts.map((c) => (c.id === ctrId ? { ...c, ...patch } : c));
    scheduleUpdate(next);
  };

  const updateRowField = (
    ctrId: string,
    rowId: string,
    patch: Partial<RekapCtrPartaiRow>,
    immediate = false
  ) => {
    const next = contracts.map((c) => {
      if (c.id !== ctrId) return c;
      return {
        ...c,
        rows: c.rows.map((r) => {
          if (r.id !== rowId) return r;
          const updated = { ...r, ...patch };
          if (patch.namaSuplayer !== undefined) {
            const isStok = /stok\s*hb/i.test(patch.namaSuplayer);
            updated.isStokHbPt = isStok;
            if (isStok) {
              updated.pajakNominal = 0;
              updated.komisiNominal = 0;
            }
          }
          return updated;
        }),
      };
    });
    scheduleUpdate(next, immediate);
  };

  const handleAddEmptyRow = (ctrId: string) => {
    const next = contracts.map((c) => {
      if (c.id !== ctrId) return c;
      const lastRow = c.rows[c.rows.length - 1];
      const newRow: RekapCtrPartaiRow = {
        id: `CTR-${c.noUrut}-${Date.now()}`,
        basisWap: lastRow?.basisWap || 62000,
        basisSuplayer: lastRow?.basisSuplayer || lastRow?.basisWap || 62000,
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
      };
      return { ...c, rows: [...c.rows, newRow] };
    });
    scheduleUpdate(next, true);
  };

  const handleCreateCtr = () => {
    const maxNo = contracts.reduce((m, c) => Math.max(m, c.noUrut), 27);
    const parsedNo = Number(newCtrNo) || maxNo + 1;
    const qty = parseDecimal(newCtrQty) || 0;
    const newCtr: RekapCtrContract = {
      id: `CTR-${parsedNo}-${Date.now()}`,
      noUrut: parsedNo,
      tglCtr: newCtrTgl.trim() || '-',
      gudang: (newCtrGudang || 'SKA').trim().toUpperCase(),
      qtyCtr: qty,
      rows: [
        {
          id: `CTR-${parsedNo}-1-${Date.now()}`,
          basisWap: 62000,
          basisSuplayer: 62000,
          namaSuplayer: '',
          qtySuplayer: null,
          tglMasuk: '',
          truck: 'BE8206AMN',
          qtyAwal: null,
          qtyAkhir: 0,
          rendemen: 0,
          komisiNominal: 0,
          cekList: false,
          sourceType: 'MANUAL',
        },
      ],
    };
    const next = [...contracts, newCtr].sort((a, b) => a.noUrut - b.noUrut);
    scheduleUpdate(next, true);
    setShowAddCtrModal(false);
    setNewCtrNo('');
    setNewCtrTgl('');
    setNewCtrQty('');
  };

  const handleImportPenjualanHb = (jhb: TransaksiPenjualanHasilBumi) => {
    if (!importTargetCtrId) return;
    const qtyAkhir = Number(jhb.tonaseAkhir || jhb.beratBersih) || 0;
    const qtyAwal = Number(jhb.beratBersih) || qtyAkhir;
    const hargaPerKg =
      Number(jhb.hargaJualPerKg) ||
      (qtyAkhir > 0 && Number(jhb.totalNominal) > 0
        ? Math.round((Number(jhb.totalNominal) / qtyAkhir) * 100) / 100
        : 0);
    const plat = (jhb.noSuratJalan || 'BE8206AMN')
      .replace(/BR\s*8206/i, 'BE 8206')
      .replace(/\s+/g, '')
      .toUpperCase();

    const newRow: RekapCtrPartaiRow = {
      id: `CTR-HB-${jhb.noPenjualan}-${Date.now()}`,
      basisWap: hargaPerKg,
      basisSuplayer: hargaPerKg,
      namaSuplayer: 'STOK HB (PT WAP)',
      idMitra: 'STOK_HB_PT',
      qtySuplayer: qtyAkhir,
      tglMasuk: jhb.tanggal,
      truck: plat,
      qtyAwal,
      qtyAkhir,
      rendemen: 100,
      pajakNominal: 0,
      komisiNominal: 0,
      cekList: false,
      statusPencairan: 'LUNAS',
      sourceType: 'PENJUALAN_HB',
      sourceRefId: jhb.noPenjualan,
      isStokHbPt: true,
      keterangan: '',
    };

    const next = contracts.map((c) =>
      c.id === importTargetCtrId ? { ...c, rows: [...c.rows, newRow] } : c
    );
    scheduleUpdate(next, true);
    setImportTargetCtrId(null);
    setStatusMessage({
      type: 'ok',
      text: `Penjualan Stok HB ${jhb.noPenjualan} berhasil dimasukkan ke CTR.`,
    });
  };

  const handleImportSuratJalan = (sj: InvoiceSuratJalanRecord) => {
    if (!importTargetCtrId) return;
    const details = Array.isArray(sj.detailItems) && sj.detailItems.length > 0 ? sj.detailItems : null;
    const isStokHb = sj.sumberBarang === 'STOK_HB_PT';
    const rowStatus: 'PENDING' | 'LUNAS' = isStokHb
      ? 'LUNAS'
      : sj.statusPembayaranMitra === 'PENDING'
      ? 'PENDING'
      : 'LUNAS';
    const ketLabel = rowStatus === 'PENDING' ? 'BELUM CAIR' : '';
    const newRows: RekapCtrPartaiRow[] = details
      ? details.map((d, idx) => ({
          id: `CTR-SJ-${sj.id}-${idx + 1}-${Date.now()}`,
          basisWap: d.basisBuyer || d.basisMitra || 0,
          basisSuplayer: d.basisMitra || d.basisBuyer || 0,
          namaSuplayer: isStokHb ? 'STOK HB (PT WAP)' : sj.namaMitra.toUpperCase(),
          idMitra: sj.idMitra,
          qtySuplayer: d.tonaseAkhirKg,
          tglMasuk: sj.tanggal,
          truck: (d.platTruk || sj.platTruk || '').replace(/\s+/g, '').toUpperCase(),
          qtyAwal: d.tonaseAwalKg || d.tonaseAkhirKg,
          qtyAkhir: d.tonaseAkhirKg,
          rendemen: d.rendemen || 100,
          pajakNominal: isStokHb
            ? 0
            : details.length === 1
            ? sj.pajakNominal
            : sj.pajakNominal === 0
            ? 0
            : null,
          komisiNominal: isStokHb ? 0 : idx === 0 ? sj.komisiNominal : 0,
          cekList: false,
          statusPencairan: rowStatus,
          sourceType: 'SURAT_JALAN',
          sourceRefId: idx === 0 ? sj.noInvoice : `${sj.noInvoice}-${idx + 1}`,
          isStokHbPt: isStokHb,
          keterangan: ketLabel,
        }))
      : [
          {
            id: `CTR-SJ-${sj.id}-${Date.now()}`,
            basisWap: sj.basisBuyer || sj.basisMitra || 0,
            basisSuplayer: sj.basisMitra || sj.basisBuyer || 0,
            namaSuplayer: isStokHb ? 'STOK HB (PT WAP)' : sj.namaMitra.toUpperCase(),
            idMitra: sj.idMitra,
            qtySuplayer: sj.tonaseAkhirKg,
            tglMasuk: sj.tanggal,
            truck: (sj.platTruk || '').replace(/\s+/g, '').toUpperCase(),
            qtyAwal: sj.tonaseAwalKg || sj.tonaseAkhirKg,
            qtyAkhir: sj.tonaseAkhirKg,
            rendemen: sj.rendemen || 100,
            pajakNominal: isStokHb ? 0 : sj.pajakNominal,
            komisiNominal: isStokHb ? 0 : sj.komisiNominal || 0,
            cekList: false,
            statusPencairan: rowStatus,
            sourceType: 'SURAT_JALAN',
            sourceRefId: sj.noInvoice,
            isStokHbPt: isStokHb,
            keterangan: ketLabel,
          },
        ];

    const next = contracts.map((c) =>
      c.id === importTargetCtrId ? { ...c, rows: [...c.rows, ...newRows] } : c
    );
    scheduleUpdate(next, true);
    setImportTargetCtrId(null);
    setStatusMessage({
      type: 'ok',
      text: `Surat Jalan ${sj.noInvoice} (${sj.namaMitra}) berhasil ditambahkan ke CTR.`,
    });
  };

  const handleConfirmDelete = () => {
    if (!deletePrompt) return;
    if (deletePrompt.kind === 'ROW') {
      const next = contracts.map((c) => {
        if (c.id !== deletePrompt.ctrId) return c;
        return { ...c, rows: c.rows.filter((r) => r.id !== deletePrompt.rowId) };
      });
      scheduleUpdate(next, true);
    } else {
      const next = contracts.filter((c) => c.id !== deletePrompt.ctrId);
      scheduleUpdate(next, true);
    }
    setDeletePrompt(null);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar Rekap CTR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              REKAP CTR WAP — Rekap Data CTR Surat Jalan
            </h2>
            {saving && (
              <span className="text-[11px] font-semibold text-sky-700 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Menyimpan...
              </span>
            )}
            {!saving && isDirty && (
              <span className="text-[11px] font-semibold text-amber-700">
                · Belum tersimpan
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
            <span>
              Total Kontrak: <strong className="text-slate-800">{aggregateStats.totalContracts}</strong>
            </span>
            <span>
              Tonase Akhir:{' '}
              <strong className="text-slate-800">
                {fmtIdNumber(aggregateStats.totalTonaseKg, 1)} Kg
              </strong>
            </span>
            <span>
              Dana Masuk Buyer:{' '}
              <strong className="text-sky-800 font-mono">
                {fmtRp(aggregateStats.totalDanaMasuk)}
              </strong>
            </span>
            <span>
              Akumulasi TOT L/R:{' '}
              <strong className="text-emerald-700 font-mono">
                {fmtRp(aggregateStats.grandCumulativeLr)}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSyncErp}
            disabled={syncing || loading}
            className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sinkronkan SJ &amp; Penjualan HB</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const maxNo = contracts.reduce((m, c) => Math.max(m, c.noUrut), 27);
              setNewCtrNo(String(maxNo + 1));
              setNewCtrTgl('');
              setNewCtrGudang('SKA');
              setNewCtrQty('');
              setShowAddCtrModal(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah CTR</span>
          </button>

          <button
            type="button"
            onClick={() => exportRekapCtrExcel(contracts)}
            className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={() => exportRekapCtrPdf(contracts)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          {isDirty && (
            <button
              type="button"
              onClick={() => persistContracts(contracts, true)}
              disabled={saving}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            statusMessage.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Spreadsheet Container */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="text-center py-2.5 border-b border-slate-300 bg-slate-50 font-extrabold text-sm tracking-wide text-slate-900">
          REKAP CTR WAP
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px] text-slate-900 min-w-[1620px]">
            <thead>
              <tr className="bg-[#dbe5f1] text-slate-900 font-bold border-b border-slate-400">
                <th rowSpan={2} className="border border-slate-400 px-1.5 py-1.5 text-center w-9">
                  NO
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[78px]">
                  TGL CTR S-D
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[72px]">
                  GUDANG
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[68px]">
                  QTY
                </th>
                <th colSpan={2} className="border border-slate-400 px-2 py-1 text-center">
                  BASIS
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[116px]">
                  NAMA SUPLAYER
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[66px]">
                  QTY SUPLAYER
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[78px]">
                  TGL MASUK
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[94px]">
                  TRUCK
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[68px]">
                  QTY AWAL
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[68px]">
                  QTY AKHIR
                </th>
                <th rowSpan={2} className="border border-slate-400 px-1.5 py-1.5 text-center min-w-[50px]">
                  SUSUT
                </th>
                <th rowSpan={2} className="border border-slate-400 px-1.5 py-1.5 text-center min-w-[66px]">
                  RENDEMEN
                </th>
                <th rowSpan={2} className="border border-slate-400 px-1.5 py-1.5 text-center min-w-[58px]">
                  SISA CTR
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[72px]">
                  HARGA LDC
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[76px]">
                  HARGA SUPLAYER
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[96px]">
                  DANA MASUK
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[104px]">
                  DANA DI TF
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[78px]">
                  SELISIH DANA
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[82px]">
                  PAJAK
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[78px]">
                  KOMISI
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[88px]">
                  TOT L/R
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[88px]">
                  CEK LIST
                </th>
                <th rowSpan={2} className="border border-slate-400 px-2 py-1.5 text-center min-w-[96px]">
                  KETERANGAN
                </th>
                <th rowSpan={2} className="border border-slate-400 px-1.5 py-1.5 text-center w-12">
                  AKSI
                </th>
              </tr>
              <tr className="bg-[#dbe5f1] text-slate-900 font-bold border-b border-slate-400">
                <th className="border border-slate-400 px-2 py-1 text-center min-w-[74px]">WAP</th>
                <th className="border border-slate-400 px-2 py-1 text-center min-w-[74px]">SUPLAYER</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={26} className="text-center py-10 text-slate-400">
                    Memuat data Rekap CTR WAP...
                  </td>
                </tr>
              ) : (
                <>
                  {/* Baris Saldo Pembuka Biru di atas No 21 */}
                  <tr className="bg-[#1d70d8] text-white font-bold tabular-nums">
                    <td colSpan={15} className="border border-blue-700 px-2 py-1 text-right text-[10px]">
                      SALDO L/R SEBELUMNYA
                    </td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">Rp0</td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">Rp0</td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">Rp0</td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">Rp0,00</td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">Rp0</td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">Rp0</td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right"></td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right">
                      {fmtRp(dataset.openingCumulativeLr)}
                    </td>
                    <td className="border border-blue-700 px-1.5 py-1 text-right"></td>
                    <td className="border border-blue-700 px-1.5 py-1"></td>
                    <td className="border border-blue-700 px-1 py-1"></td>
                  </tr>

                  {dataset.items.map((item) => {
                    const { contract, rowsWithMetrics } = item;
                    const displayRows =
                      rowsWithMetrics.length > 0
                        ? rowsWithMetrics
                        : [];

                    return (
                      <React.Fragment key={contract.id}>
                        {displayRows.map(({ row, metrics }, idx) => {
                          const isFirst = idx === 0;
                          const tglYellow = Boolean(row.highlightTglYellow && !row.tglMasuk);
                          const qtyAwalYellow = Boolean(row.highlightQtyAwalYellow);
                          const isStokPt = Boolean(row.isStokHbPt || /stok\s*hb/i.test(row.namaSuplayer));

                          return (
                            <tr
                              key={row.id}
                              className={`hover:bg-slate-50 transition-colors ${
                                isStokPt ? 'bg-emerald-50/40' : 'bg-white'
                              }`}
                            >
                              {/* NO */}
                              <td className="border border-slate-300 px-1 py-0.5 text-center font-bold">
                                {isFirst ? (
                                  <SpreadsheetNumberCell
                                    value={contract.noUrut}
                                    displayValue={String(contract.noUrut)}
                                    align="center"
                                    allowEmpty={false}
                                    className="font-bold"
                                    onCommit={(val) =>
                                      updateContractField(contract.id, {
                                        noUrut: val ? Math.round(val) : contract.noUrut,
                                      })
                                    }
                                  />
                                ) : (
                                  ''
                                )}
                              </td>

                              {/* TGL CTR S-D */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                {isFirst ? (
                                  <input
                                    type="text"
                                    value={contract.tglCtr || ''}
                                    onChange={(e) =>
                                      updateContractField(contract.id, { tglCtr: e.target.value })
                                    }
                                    placeholder="4 Oktober"
                                    className="w-full bg-transparent px-1 py-0.5 text-[11px] focus:outline-none focus:bg-sky-50"
                                  />
                                ) : (
                                  ''
                                )}
                              </td>

                              {/* GUDANG */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                {isFirst ? (
                                  <input
                                    type="text"
                                    value={contract.gudang || ''}
                                    onChange={(e) =>
                                      updateContractField(contract.id, {
                                        gudang: e.target.value.toUpperCase(),
                                      })
                                    }
                                    placeholder="SKA / LDC"
                                    className="w-full bg-transparent px-1 py-0.5 text-[11px] font-semibold uppercase focus:outline-none focus:bg-sky-50"
                                  />
                                ) : (
                                  ''
                                )}
                              </td>

                              {/* QTY CTR */}
                              <td className="border border-slate-300 px-0.5 py-0.5 text-right tabular-nums">
                                {isFirst ? (
                                  <SpreadsheetNumberCell
                                    value={contract.qtyCtr || null}
                                    displayValue={
                                      contract.qtyCtr > 0 ? fmtIdNumber(contract.qtyCtr, 1) : ''
                                    }
                                    onCommit={(val) =>
                                      updateContractField(contract.id, { qtyCtr: val || 0 })
                                    }
                                  />
                                ) : (
                                  ''
                                )}
                              </td>

                              {/* BASIS WAP */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={row.basisWap}
                                  displayValue={row.basisWap ? fmtRp(row.basisWap) : 'Rp0'}
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { basisWap: val || 0 })
                                  }
                                />
                              </td>

                              {/* BASIS SUPLAYER */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={row.basisSuplayer}
                                  displayValue={row.basisSuplayer ? fmtRp(row.basisSuplayer) : 'Rp0'}
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { basisSuplayer: val || 0 })
                                  }
                                />
                              </td>

                              {/* NAMA SUPLAYER */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <input
                                  type="text"
                                  value={row.namaSuplayer || ''}
                                  onChange={(e) =>
                                    updateRowField(contract.id, row.id, {
                                      namaSuplayer: e.target.value.toUpperCase(),
                                    })
                                  }
                                  placeholder="Nama Suplayer"
                                  className={`w-full bg-transparent px-1 py-0.5 text-[11px] font-bold uppercase focus:outline-none focus:bg-sky-50 focus:ring-1 focus:ring-sky-500 ${
                                    isStokPt ? 'text-emerald-800' : 'text-slate-900'
                                  }`}
                                />
                              </td>

                              {/* QTY SUPLAYER */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={row.qtySuplayer ?? null}
                                  displayValue={
                                    row.qtySuplayer !== null && row.qtySuplayer !== undefined
                                      ? fmtIdNumber(row.qtySuplayer, 1)
                                      : ''
                                  }
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { qtySuplayer: val })
                                  }
                                />
                              </td>

                              {/* TGL MASUK */}
                              <td
                                className={`border border-slate-300 px-0.5 py-0.5 ${
                                  tglYellow ? 'bg-yellow-200' : ''
                                }`}
                              >
                                <input
                                  type="text"
                                  value={row.tglMasuk || ''}
                                  onChange={(e) =>
                                    updateRowField(contract.id, row.id, { tglMasuk: e.target.value })
                                  }
                                  placeholder="dd/mm/yyyy"
                                  className="w-full bg-transparent px-1 py-0.5 text-[11px] text-center focus:outline-none focus:bg-sky-50"
                                />
                              </td>

                              {/* TRUCK */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <input
                                  type="text"
                                  value={row.truck || ''}
                                  onChange={(e) =>
                                    updateRowField(contract.id, row.id, {
                                      truck: e.target.value.toUpperCase(),
                                    })
                                  }
                                  placeholder="Plat Truk"
                                  className="w-full bg-transparent px-1 py-0.5 text-[11px] font-mono uppercase focus:outline-none focus:bg-sky-50 focus:ring-1 focus:ring-sky-500"
                                />
                              </td>

                              {/* QTY AWAL */}
                              <td
                                className={`border border-slate-300 px-0.5 py-0.5 ${
                                  qtyAwalYellow ? 'bg-yellow-200' : ''
                                }`}
                              >
                                <SpreadsheetNumberCell
                                  value={row.qtyAwal ?? null}
                                  displayValue={
                                    row.qtyAwal !== null && row.qtyAwal !== undefined
                                      ? fmtIdNumber(row.qtyAwal, 1)
                                      : ''
                                  }
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { qtyAwal: val })
                                  }
                                />
                              </td>

                              {/* QTY AKHIR */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={row.qtyAkhir}
                                  displayValue={row.qtyAkhir ? fmtIdNumber(row.qtyAkhir, 1) : ''}
                                  allowEmpty={false}
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { qtyAkhir: val || 0 })
                                  }
                                />
                              </td>

                              {/* SUSUT */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums text-slate-700">
                                {metrics.susut !== null ? fmtIdNumber(metrics.susut, 1) : ''}
                              </td>

                              {/* RENDEMEN */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={row.rendemen}
                                  displayValue={
                                    row.rendemen
                                      ? `${row.rendemen.toFixed(2).replace('.', ',')}%`
                                      : ''
                                  }
                                  allowEmpty={false}
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { rendemen: val || 0 })
                                  }
                                />
                              </td>

                              {/* SISA CTR */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums text-slate-700">
                                {isFirst && contract.qtyCtr > 0 && item.sisaCtr !== 0
                                  ? fmtIdNumber(item.sisaCtr, 1)
                                  : ''}
                              </td>

                              {/* HARGA LDC */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums">
                                {fmtRp(metrics.hargaLdcRounded)}
                              </td>

                              {/* HARGA SUPLAYER */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums">
                                {fmtRp(metrics.hargaSuplayerRounded)}
                              </td>

                              {/* DANA MASUK */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums">
                                {fmtRp(metrics.danaMasukRounded)}
                              </td>

                              {/* DANA DI TF */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums">
                                {fmtRp(metrics.danaDiTfRaw, 2)}
                              </td>

                              {/* SELISIH DANA */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono tabular-nums">
                                {fmtRp(metrics.selisihDanaRounded)}
                              </td>

                              {/* PAJAK */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={
                                    row.pajakNominal !== undefined && row.pajakNominal !== null
                                      ? row.pajakNominal
                                      : metrics.pajakRounded
                                  }
                                  displayValue={fmtRp(metrics.pajakRounded)}
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, { pajakNominal: val })
                                  }
                                />
                              </td>

                              {/* KOMISI */}
                              <td className="border border-slate-300 px-0.5 py-0.5">
                                <SpreadsheetNumberCell
                                  value={row.komisiNominal}
                                  displayValue={
                                    metrics.komisiNominal > 0 || isStokPt
                                      ? fmtRp(metrics.komisiNominal)
                                      : ''
                                  }
                                  onCommit={(val) =>
                                    updateRowField(contract.id, row.id, {
                                      komisiNominal: val || 0,
                                    })
                                  }
                                />
                              </td>

                              {/* TOT L/R */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-right font-mono font-semibold tabular-nums">
                                {fmtRp(metrics.totLrRounded)}
                              </td>

                              {/* CEK LIST */}
                              <td className="border border-slate-300 px-1.5 py-0.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={Boolean(row.cekList)}
                                  onChange={(e) =>
                                    updateRowField(
                                      contract.id,
                                      row.id,
                                      { cekList: e.target.checked },
                                      true
                                    )
                                  }
                                  className="w-3.5 h-3.5 accent-sky-700 cursor-pointer align-middle"
                                />
                              </td>

                              {/* KETERANGAN */}
                              {(() => {
                                const isBelumCair = row.statusPencairan === 'PENDING';
                                const displayKet = isBelumCair
                                  ? row.keterangan || 'BELUM CAIR'
                                  : row.keterangan === 'BELUM CAIR'
                                  ? ''
                                  : row.keterangan || '';
                                return (
                                  <td
                                    className={`border border-slate-300 px-0.5 py-0.5 ${
                                      isBelumCair ? 'bg-amber-100' : ''
                                    }`}
                                  >
                                    <input
                                      type="text"
                                      value={displayKet}
                                      onChange={(e) =>
                                        updateRowField(contract.id, row.id, {
                                          keterangan: e.target.value,
                                        })
                                      }
                                      placeholder=""
                                      className={`w-full bg-transparent px-1.5 py-0.5 text-[11px] focus:outline-none focus:bg-sky-50 focus:ring-1 focus:ring-sky-500 ${
                                        isBelumCair
                                          ? 'text-center font-extrabold text-amber-900 uppercase'
                                          : 'text-left text-slate-700'
                                      }`}
                                    />
                                  </td>
                                );
                              })()}

                              {/* AKSI BARIS */}
                              <td className="border border-slate-300 px-1 py-0.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeletePrompt({
                                      kind: 'ROW',
                                      ctrId: contract.id,
                                      rowId: row.id,
                                      label: `${row.namaSuplayer || 'Baris Kosong'} (${fmtIdNumber(
                                        row.qtyAkhir,
                                        1
                                      )} Kg)`,
                                    })
                                  }
                                  className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                                  title="Hapus Baris"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Baris Biru Summary Kontrak + Akumulasi Running Total */}
                        <tr className="bg-[#1d70d8] text-white font-bold tabular-nums">
                          <td colSpan={22} className="border border-blue-700 px-2 py-1 text-left">
                            <div className="flex items-center justify-between gap-2 text-[10px]">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold">
                                  CTR #{contract.noUrut} ({contract.tglCtr || '-'} · {contract.gudang || '-'})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddEmptyRow(contract.id)}
                                  className="px-1.5 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Baris</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setImportTargetCtrId(contract.id);
                                    setImportTab('PENJUALAN_HB');
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-white/15 hover:bg-white/25 text-white font-semibold flex items-center gap-1 cursor-pointer"
                                >
                                  <PackagePlus className="w-3 h-3" />
                                  <span>Ambil SJ / Penjualan HB</span>
                                </button>
                                {contract.noUrut > 27 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeletePrompt({
                                        kind: 'CTR',
                                        ctrId: contract.id,
                                        label: `CTR #${contract.noUrut} (${contract.tglCtr})`,
                                      })
                                    }
                                    className="px-1.5 py-0.5 rounded bg-rose-500/80 hover:bg-rose-600 text-white font-semibold cursor-pointer"
                                  >
                                    Hapus CTR
                                  </button>
                                )}
                              </div>
                              <div className="hidden sm:flex items-center gap-4 text-blue-100 font-mono">
                                <span>Akhir: {fmtIdNumber(item.totalQtyAkhir, 1)} Kg</span>
                                <span>Dana Msk: {fmtRp(item.totalDanaMasuk)}</span>
                                <span>Pajak: {fmtRp(item.totalPajak)}</span>
                                <span>Komisi: {fmtRp(item.totalKomisi)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="border border-blue-700 px-1.5 py-1 text-right font-mono">
                            {fmtRp(item.totalLr)}
                          </td>
                          <td className="border border-blue-700 px-1.5 py-1 text-right font-mono">
                            {fmtRp(item.cumulativeLr)}
                          </td>
                          <td className="border border-blue-700 px-1.5 py-1"></td>
                          <td className="border border-blue-700 px-1 py-1"></td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah CTR Baru */}
      {showAddCtrModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Tambah Kontrak CTR Baru</h4>
              <button
                type="button"
                onClick={() => setShowAddCtrModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nomor CTR</label>
                <input
                  type="number"
                  value={newCtrNo}
                  onChange={(e) => setNewCtrNo(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tanggal CTR</label>
                <input
                  type="text"
                  value={newCtrTgl}
                  onChange={(e) => setNewCtrTgl(e.target.value)}
                  placeholder="mis. 5 November"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Gudang / Buyer</label>
                <input
                  type="text"
                  value={newCtrGudang}
                  onChange={(e) => setNewCtrGudang(e.target.value.toUpperCase())}
                  placeholder="SKA / LDC / OLAM"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 uppercase font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Qty CTR (Kg)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={newCtrQty}
                  onChange={(e) => setNewCtrQty(e.target.value)}
                  placeholder="mis. 8500"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAddCtrModal(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleCreateCtr}
                className="px-4 py-2 rounded-xl bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold cursor-pointer"
              >
                Buat CTR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Partai dari Penjualan HB atau Surat Jalan */}
      {importTargetCtrId && (
        <div className="fixed inset-0 z-60 bg-black/55 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-900">
                Ambil Data Transaksi ke CTR
              </div>
              <button
                type="button"
                onClick={() => setImportTargetCtrId(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 pt-3 flex gap-2 border-b border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setImportTab('PENJUALAN_HB')}
                className={`px-3 py-2 text-xs font-bold border-b-2 cursor-pointer ${
                  importTab === 'PENJUALAN_HB'
                    ? 'border-sky-800 text-sky-900'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Penjualan Stok HB ({penjualanHbList.length})
              </button>
              <button
                type="button"
                onClick={() => setImportTab('SURAT_JALAN')}
                className={`px-3 py-2 text-xs font-bold border-b-2 cursor-pointer ${
                  importTab === 'SURAT_JALAN'
                    ? 'border-sky-800 text-sky-900'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Invoice Surat Jalan ({suratJalanList.length})
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 text-xs">
              {importTab === 'PENJUALAN_HB' ? (
                penjualanHbList.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    Belum ada transaksi penjualan hasil bumi.
                  </div>
                ) : (
                  penjualanHbList.map((jhb) => (
                    <div
                      key={jhb.noPenjualan}
                      className="p-3 rounded-xl border border-slate-200 hover:border-sky-400 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          {jhb.noPenjualan} · {jhb.tanggal} · {jhb.komoditasNama}
                        </div>
                        <div className="text-slate-600 tabular-nums mt-0.5">
                          Buyer: {jhb.namaMitra} · Truk: {jhb.noSuratJalan || '-'} ·{' '}
                          {fmtIdNumber(jhb.tonaseAkhir || jhb.beratBersih, 1)} Kg ·{' '}
                          {fmtRp(jhb.totalNominal)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleImportPenjualanHb(jhb)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold shrink-0 cursor-pointer"
                      >
                        Tambahkan
                      </button>
                    </div>
                  ))
                )
              ) : suratJalanList.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  Belum ada invoice surat jalan.
                </div>
              ) : (
                suratJalanList.map((sj) => (
                  <div
                    key={sj.id}
                    className="p-3 rounded-xl border border-slate-200 hover:border-sky-400 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-bold text-slate-900">
                        {sj.noInvoice} · {sj.tanggal} · {sj.namaMitra}
                      </div>
                      <div className="text-slate-600 tabular-nums mt-0.5">
                        Buyer: {sj.kategoriKode || 'SKA'} · Truk: {sj.platTruk || '-'} ·{' '}
                        {fmtIdNumber(sj.tonaseAkhirKg, 1)} Kg · {fmtRp(sj.totalPenjualanBuyer || sj.totalPenjualanMitra)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleImportSuratJalan(sj)}
                      className="px-3 py-1.5 rounded-lg bg-sky-800 hover:bg-sky-900 text-white font-bold shrink-0 cursor-pointer"
                    >
                      Tambahkan
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus */}
      {deletePrompt && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <h4 className="text-sm font-bold text-rose-900">
              {deletePrompt.kind === 'CTR' ? 'Hapus Kontrak CTR' : 'Hapus Baris Partai'}
            </h4>
            <p className="text-xs text-slate-600">
              Yakin ingin menghapus <strong>{deletePrompt.label}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeletePrompt(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
