import React, { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  X,
  Filter,
  Calendar,
  User,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  FileText,
  Image as ImageIcon,
  Check,
  ShieldAlert,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Mitra } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';
import { FotoNotaPreviewModal } from './FotoNotaPreviewModal.tsx';

interface ModalBersihkanNotaLaluProps {
  isOpen: boolean;
  onClose: () => void;
  mitraList: Mitra[];
  preselectedMitraId?: string;
  onSuccess: (result: {
    countDeleted: number;
    affectedMitraIds: string[];
    affectedMitraNames: string[];
    totalNominalPiutang: number;
    totalNominalTitip: number;
    message: string;
  }) => void;
}

export const ModalBersihkanNotaLalu: React.FC<ModalBersihkanNotaLaluProps> = ({
  isOpen,
  onClose,
  mitraList,
  preselectedMitraId,
  onSuccess,
}) => {
  // Filter states
  const [selectedMitraId, setSelectedMitraId] = useState<string>(preselectedMitraId || 'ALL');
  const [waktuFilter, setWaktuFilter] = useState<'ALL' | 'BEFORE_DATE' | 'RANGE' | 'TODAY' | 'THIS_MONTH'>('ALL');
  const [beforeDate, setBeforeDate] = useState<string>('2026-01-01');
  const [startDate, setStartDate] = useState<string>('2025-01-01');
  const [endDate, setEndDate] = useState<string>('2026-12-31');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hanyaNotaLalu, setHanyaNotaLalu] = useState<boolean>(true);

  // Deletion mode: Hapus Transaksi (default & affects statement balance) or only clear photos
  const [modeHapus, setModeHapus] = useState<'HAPUS_TRANSAKSI' | 'HANYA_HAPUS_FOTO'>('HAPUS_TRANSAKSI');

  // Loading & data states
  const [loading, setLoading] = useState<boolean>(false);
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Execution states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Preview Foto Modal
  const [previewFotoUrl, setPreviewFotoUrl] = useState<string | null>(null);
  const [previewFotoTitle, setPreviewFotoTitle] = useState<string>('');

  // Update selectedMitraId if preselectedMitraId changes
  useEffect(() => {
    if (preselectedMitraId) {
      setSelectedMitraId(preselectedMitraId);
    }
  }, [preselectedMitraId]);

  // Load items matching current filter
  const loadMatchingItems = async () => {
    if (!isOpen) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.getDaftarBuktiNotaLalu({
        idMitra: selectedMitraId !== 'ALL' ? selectedMitraId : undefined,
        waktuFilter,
        beforeDate: waktuFilter === 'BEFORE_DATE' ? beforeDate : undefined,
        startDate: waktuFilter === 'RANGE' ? startDate : undefined,
        endDate: waktuFilter === 'RANGE' ? endDate : undefined,
        search: searchQuery.trim() || undefined,
        hanyaNotaLalu,
      });
      setItems(res.items || []);
      setSummary(res.summary);
      // Default: select all matching items
      setSelectedIds((res.items || []).map((it: any) => it.id));
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat daftar bukti nota lalu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadMatchingItems();
    }
  }, [isOpen, selectedMitraId, waktuFilter, beforeDate, startDate, endDate, hanyaNotaLalu]);

  // Handle Search trigger with debounce
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      loadMatchingItems();
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((it) => it.id));
    }
  };

  // Calculate stats of SELECTED items
  const selectedStats = useMemo(() => {
    const selectedItems = items.filter((it) => selectedIds.includes(it.id));
    let piutang = 0;
    let titip = 0;
    let fotoCount = 0;
    const mitras = new Set<string>();

    for (const it of selectedItems) {
      mitras.add(it.namaMitra);
      if (it.tipe === 'PIUTANG_NOTA_LALU' || it.tabel === 'kasbonUang') {
        piutang += it.nominal;
      } else {
        titip += it.nominal;
      }
      if (it.hasFoto) fotoCount += it.fotoNotaCount || 1;
    }

    return {
      count: selectedItems.length,
      piutang,
      titip,
      fotoCount,
      mitraNames: Array.from(mitras),
    };
  }, [items, selectedIds]);

  // Execute cleaning
  const handleExecuteBersihkan = async () => {
    if (selectedIds.length === 0) {
      setErrorMsg('Pilih minimal 1 bukti nota lalu yang ingin dibersihkan.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.bersihkanBuktiNotaLalu({
        targetIds: selectedIds,
        modeHapus,
        user: 'Admin/Kasir',
      });

      setSuccessMsg(res.message);
      setShowConfirmDialog(false);

      // Trigger success callback to refresh caller (Rekening Koran, Master Mitra, dll.)
      onSuccess({
        countDeleted: res.countDeleted,
        affectedMitraIds: res.affectedMitraIds,
        affectedMitraNames: res.affectedMitraNames,
        totalNominalPiutang: res.totalNominalPiutang,
        totalNominalTitip: res.totalNominalTitip,
        message: res.message,
      });

      // Reload list to show clean state
      setTimeout(() => {
        loadMatchingItems();
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membersihkan bukti nota lalu');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh] animate-in fade-in my-6">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-950 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-rose-900/60 text-rose-300 rounded-xl border border-rose-700">
              <Trash2 className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-zinc-100 tracking-tight">
                  Bersihkan Bukti Nota Lalu
                </h2>
                <span className="text-[10px] bg-rose-900/80 text-rose-200 font-bold px-2 py-0.5 rounded border border-rose-700 uppercase">
                  Sinkronisasi Rekening Mitra
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Hapus bukti nota lalu berdasarkan Nama atau Waktu. Rekening koran &amp; saldo mitra akan ikut otomatis disesuaikan.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Filter Panel: Nama & Waktu */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-bold text-zinc-200 flex items-center space-x-2">
                <Filter className="w-4 h-4 text-amber-400" />
                <span>Pilih Kriteria Pembersihan:</span>
              </span>
              <span className="text-[11px] text-zinc-400">
                Ditemukan: <strong className="text-amber-400 font-mono">{items.length}</strong> bukti nota
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* 1. Filter Berdasarkan Nama Mitra */}
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 space-y-2">
                <label className="block text-zinc-300 font-semibold flex items-center space-x-1.5">
                  <User className="w-3.5 h-3.5 text-sky-400" />
                  <span>1. Hapus Berdasarkan Nama Mitra:</span>
                </label>
                <select
                  value={selectedMitraId}
                  onChange={(e) => setSelectedMitraId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-medium focus:outline-hidden focus:border-amber-500"
                >
                  <option value="ALL">Semua Mitra ({mitraList.length} Terdaftar)</option>
                  {mitraList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.kode}) - {m.role}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-zinc-400">
                  {selectedMitraId === 'ALL'
                    ? 'Pembersihan akan berlaku ke seluruh mitra yang memiliki catatan nota lalu.'
                    : `Hanya membersihkan bukti nota atas nama ${mitraList.find((m) => m.id === selectedMitraId)?.nama || 'mitra terpilih'}.`}
                </div>
              </div>

              {/* 2. Filter Berdasarkan Waktu */}
              <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 space-y-2">
                <label className="block text-zinc-300 font-semibold flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>2. Hapus Berdasarkan Waktu / Tanggal:</span>
                </label>
                <select
                  value={waktuFilter}
                  onChange={(e) => setWaktuFilter(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-medium focus:outline-hidden focus:border-amber-500"
                >
                  <option value="ALL">Semua Waktu (Seluruh Catatan Nota Lalu)</option>
                  <option value="BEFORE_DATE">Sebelum Tanggal Tertentu (Misal: Sebelum 2026)</option>
                  <option value="RANGE">Rentang Tanggal Tertentu (Dari - Sampai)</option>
                  <option value="THIS_MONTH">Bulan Ini Saja</option>
                  <option value="TODAY">Hari Ini Saja</option>
                </select>

                {/* Sub-inputs if BEFORE_DATE */}
                {waktuFilter === 'BEFORE_DATE' && (
                  <div className="pt-1">
                    <label className="block text-[10px] text-zinc-400 mb-1">
                      Hapus semua nota sebelum tanggal:
                    </label>
                    <input
                      type="date"
                      value={beforeDate}
                      onChange={(e) => setBeforeDate(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-100 font-mono focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Sub-inputs if RANGE */}
                {waktuFilter === 'RANGE' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Dari Tanggal:</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 font-mono focus:outline-hidden focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-0.5">Sampai Tanggal:</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-100 font-mono focus:outline-hidden focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick search and mode hapus */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nomor nota, nama mitra, keterangan..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-zinc-400 text-[11px]">Tindakan Pembersihan:</span>
                <select
                  value={modeHapus}
                  onChange={(e) => setModeHapus(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-200 font-semibold focus:outline-hidden focus:border-amber-500"
                >
                  <option value="HAPUS_TRANSAKSI">
                    Hapus Transaksi &amp; Perbarui Rekening Mitra (Rekomendasi)
                  </option>
                  <option value="HANYA_HAPUS_FOTO">
                    Hanya Bersihkan Foto Fisik (Angka Mutasi Tetap)
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* Summary Impact Banner */}
          <div className="bg-gradient-to-r from-amber-950/40 via-zinc-900 to-rose-950/40 border border-amber-900/50 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2 font-bold text-amber-300">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Ringkasan Dampak Perubahan Rekening Mitra:</span>
              </div>
              <div className="text-[11px] text-zinc-300 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Dipilih: <strong className="text-white font-mono">{selectedStats.count}</strong> dari {items.length} nota
                </span>
                <span>
                  Piutang Berkurang: <strong className="text-rose-400 font-mono">{formatRupiah(selectedStats.piutang)}</strong>
                </span>
                <span>
                  Titipan Berkurang: <strong className="text-emerald-400 font-mono">{formatRupiah(selectedStats.titip)}</strong>
                </span>
                <span>
                  Mitra Terdampak: <strong className="text-sky-300 font-mono">{selectedStats.mitraNames.length}</strong> orang
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-semibold cursor-pointer"
              >
                {selectedIds.length === items.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
              </button>

              <button
                type="button"
                onClick={loadMatchingItems}
                disabled={loading}
                className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 cursor-pointer"
                title="Muat Ulang"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Table / List of matching items */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
            <div className="overflow-x-auto max-h-[38vh]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-zinc-900/90 text-zinc-400 font-semibold border-b border-zinc-800 sticky top-0 z-10 text-[11px]">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={handleSelectAll}
                        className="rounded border-zinc-700 text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-2.5">Tanggal</th>
                    <th className="p-2.5">No. Nota</th>
                    <th className="p-2.5">Nama Mitra</th>
                    <th className="p-2.5">Kategori / Tipe</th>
                    <th className="p-2.5 text-right">Nominal</th>
                    <th className="p-2.5">Keterangan / Rincian</th>
                    <th className="p-2.5 text-center">Bukti Foto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-xs">
                  {loading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-400">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-amber-400" />
                        <span>Mencari bukti nota lalu...</span>
                      </td>
                    </tr>
                  )}

                  {!loading && items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-400">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                        <div className="font-semibold text-zinc-300">Tidak Ada Bukti Nota Lalu</div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Semua bukti nota telah bersih atau tidak ada data yang cocok dengan kriteria filter di atas.
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    items.map((item) => {
                      const isSelected = selectedIds.includes(item.id);
                      const isPiutang = item.tipe === 'PIUTANG_NOTA_LALU' || item.tabel === 'kasbonUang';

                      return (
                        <tr
                          key={item.id}
                          onClick={() => handleToggleSelect(item.id)}
                          className={`hover:bg-zinc-900/60 cursor-pointer transition-colors ${
                            isSelected ? 'bg-rose-950/20' : ''
                          }`}
                        >
                          <td
                            className="p-2.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.id)}
                              className="rounded border-zinc-700 text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-2.5 font-mono text-zinc-300 whitespace-nowrap">
                            {formatTanggalIndo(item.tanggal)}
                          </td>
                          <td className="p-2.5 font-mono font-bold text-amber-400 whitespace-nowrap">
                            {item.noNota}
                          </td>
                          <td className="p-2.5 font-semibold text-zinc-100 whitespace-nowrap">
                            {item.namaMitra}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isPiutang
                                  ? 'bg-rose-950 text-rose-300 border-rose-800'
                                  : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              }`}
                            >
                              {item.tipeLabel}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold whitespace-nowrap">
                            <span className={isPiutang ? 'text-rose-400' : 'text-emerald-400'}>
                              {formatRupiah(item.nominal)}
                            </span>
                          </td>
                          <td className="p-2.5 text-zinc-300 max-w-xs truncate" title={item.keterangan}>
                            <div>{item.keterangan}</div>
                            {item.rincianBarang && (
                              <div className="text-[10px] text-zinc-400 italic truncate">
                                {item.rincianBarang}
                              </div>
                            )}
                          </td>
                          <td
                            className="p-2.5 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {item.hasFoto && item.fotoNota ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewFotoUrl(item.fotoNota);
                                  setPreviewFotoTitle(
                                    `Bukti Fisik Nota: ${item.noNota} (${item.namaMitra})`
                                  );
                                }}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 cursor-pointer"
                              >
                                <ImageIcon className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px]">{item.fotoNotaCount} Foto</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-zinc-400 italic">Tanpa Foto</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 bg-zinc-950 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Tindakan ini aman &amp; otomatis memperbarui buku rekening koran mitra tanpa merusak data transaksi lainnya.
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold cursor-pointer transition-colors"
            >
              Tutup
            </button>

            <button
              type="button"
              disabled={selectedIds.length === 0 || isSubmitting}
              onClick={() => setShowConfirmDialog(true)}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold shadow-md cursor-pointer transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Sedang Memproses...'
                  : `Bersihkan ${selectedIds.length} Bukti Nota Terpilih`}
              </span>
            </button>
          </div>
        </div>

        {/* Confirmation Modal Overlay */}
        {showConfirmDialog && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="bg-zinc-900 border border-rose-800 w-full max-w-md rounded-2xl p-5 shadow-2xl text-zinc-100 space-y-4">
              <div className="flex items-center space-x-3 text-rose-400">
                <div className="p-2 bg-rose-950 rounded-xl border border-rose-700">
                  <AlertTriangle className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Konfirmasi Pembersihan Bukti</h3>
                  <p className="text-xs text-rose-300">
                    {modeHapus === 'HAPUS_TRANSAKSI'
                      ? 'Saldo rekening koran mitra akan ikut berubah'
                      : 'Hanya membersihkan foto lampiran'}
                  </p>
                </div>
              </div>

              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 space-y-2 text-xs">
                <div className="text-zinc-300">
                  Anda akan membersihkan <strong className="text-white">{selectedIds.length}</strong> bukti nota lalu:
                </div>
                <div className="pl-3 border-l-2 border-rose-500 space-y-1 font-mono text-[11px]">
                  {selectedStats.piutang > 0 && (
                    <div className="text-rose-400">
                      • Piutang Bon Kasbon Berkurang: {formatRupiah(selectedStats.piutang)}
                    </div>
                  )}
                  {selectedStats.titip > 0 && (
                    <div className="text-emerald-400">
                      • Saldo Titip Mitra Berkurang: {formatRupiah(selectedStats.titip)}
                    </div>
                  )}
                  <div className="text-zinc-400">
                    • Mitra Terdampak: {selectedStats.mitraNames.slice(0, 3).join(', ')}
                    {selectedStats.mitraNames.length > 3 ? ` +${selectedStats.mitraNames.length - 3}` : ''}
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-400">
                Apakah Anda yakin ingin melanjutkan? Seluruh perhitungan kasbon dan titipan pada Rekening Koran mitra terkait akan langsung diperbarui.
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteBersihkan}
                  disabled={isSubmitting}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-bold shadow-md cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Memproses...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Ya, Bersihkan Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Zoom Photo Modal */}
        {previewFotoUrl && (
          <FotoNotaPreviewModal
            isOpen={!!previewFotoUrl}
            onClose={() => setPreviewFotoUrl(null)}
            imageUrl={previewFotoUrl}
            title={previewFotoTitle}
          />
        )}
      </div>
    </div>
  );
};
