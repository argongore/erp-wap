import React, { useState, useEffect } from 'react';
import {
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  FileDown,
  X,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { ProfilPerusahaan } from '../../server/types.ts';
import {
  ExportHistoryGajiFilter,
  exportHistoryGajiKaryawanToCsv,
  exportHistoryGajiKaryawanToImage,
  exportHistoryGajiKaryawanToPdf,
  exportHistoryGajiKaryawanToXlsx,
} from '../../utils/exportHistoryGajiKaryawan.ts';

interface DownloadHistoryGajiButtonProps {
  idKaryawan: string;
  namaKaryawan: string;
  profilPerusahaan?: ProfilPerusahaan | null;
  defaultFilter?: ExportHistoryGajiFilter;
  defaultPeriodLabel?: string;
  compact?: boolean;
  variant?: 'emerald' | 'sky' | 'amber' | 'zinc';
  label?: string;
  onDownloaded?: (message: string) => void;
  onError?: (message: string) => void;
}

type ExportFmt = 'xlsx' | 'pdf' | 'jpg' | 'png' | 'csv';

export const DownloadHistoryGajiButton: React.FC<DownloadHistoryGajiButtonProps> = ({
  idKaryawan,
  namaKaryawan,
  profilPerusahaan,
  defaultFilter,
  defaultPeriodLabel,
  compact = false,
  variant = 'sky',
  label = 'History Gaji',
  onDownloaded,
  onError,
}) => {
  const [open, setOpen] = useState(false);
  const [busyFmt, setBusyFmt] = useState<ExportFmt | null>(null);
  const [useAllPeriods, setUseAllPeriods] = useState<boolean>(
    !defaultFilter || defaultFilter.periodeMode === 'SEMUA'
  );
  const [statusKerja, setStatusKerja] = useState<'SEMUA' | 'BON' | 'LUNAS'>('SEMUA');

  useEffect(() => {
    setUseAllPeriods(!defaultFilter || defaultFilter.periodeMode === 'SEMUA');
  }, [defaultFilter?.periodeMode, defaultFilter?.bulan, defaultFilter?.tahun]);

  const handleExport = async (fmt: ExportFmt) => {
    setBusyFmt(fmt);
    try {
      const [detail, profil] = await Promise.all([
        api.getDetailHarianKaryawan(idKaryawan),
        profilPerusahaan ? Promise.resolve(profilPerusahaan) : api.getProfilPerusahaan().catch(() => null),
      ]);

      const activeFilter: ExportHistoryGajiFilter =
        useAllPeriods || !defaultFilter || defaultFilter.periodeMode === 'SEMUA'
          ? { periodeMode: 'SEMUA', statusKerja }
          : { ...defaultFilter, statusKerja };

      if (fmt === 'xlsx') {
        const fn = exportHistoryGajiKaryawanToXlsx(detail, profil, activeFilter);
        onDownloaded?.(`Berhasil mengunduh Excel: ${fn}`);
      } else if (fmt === 'pdf') {
        const res = await exportHistoryGajiKaryawanToPdf(detail, profil, activeFilter);
        onDownloaded?.(`Berhasil mengunduh PDF (${res.totalLogs} input kerja): ${res.fileName}`);
      } else if (fmt === 'jpg' || fmt === 'png') {
        const res = await exportHistoryGajiKaryawanToImage(detail, profil, {
          format: fmt,
          filter: activeFilter,
        });
        onDownloaded?.(
          `Berhasil mengunduh gambar ${fmt.toUpperCase()} (${res.pageCount} halaman): ${res.filenames.join(', ')}`
        );
      } else if (fmt === 'csv') {
        const fn = exportHistoryGajiKaryawanToCsv(detail, activeFilter);
        onDownloaded?.(`Berhasil mengunduh CSV: ${fn}`);
      }
      setOpen(false);
    } catch (err: any) {
      onError?.(err?.message || 'Gagal mengunduh history penggajian karyawan');
    } finally {
      setBusyFmt(null);
    }
  };

  const variantClass =
    variant === 'emerald'
      ? 'bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border-emerald-700'
      : variant === 'amber'
      ? 'bg-amber-950/90 hover:bg-amber-900 text-amber-300 border-amber-700'
      : variant === 'zinc'
      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
      : 'bg-sky-950/90 hover:bg-sky-900 text-sky-300 border-sky-700';

  const hasMonthDefault =
    Boolean(defaultFilter) && defaultFilter?.periodeMode === 'BULAN_TAHUN' && Boolean(defaultPeriodLabel);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={Boolean(busyFmt)}
        title={`Unduh Detail History Penggajian ${namaKaryawan} (Excel, PDF, JPG, PNG, CSV)`}
        className={`inline-flex items-center space-x-1 rounded border font-semibold transition-colors cursor-pointer disabled:opacity-60 ${variantClass} ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'
        }`}
      >
        {busyFmt ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        ) : (
          <Download className="w-3.5 h-3.5 shrink-0" />
        )}
        <span>{busyFmt ? 'Memproses...' : label}</span>
        <ChevronDown className="w-3 h-3 opacity-80 shrink-0" />
      </button>

      {open && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (!busyFmt) setOpen(false);
          }}
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 text-left"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden text-zinc-100"
          >
            <div className="px-4 py-3 bg-zinc-950 border-b border-zinc-800 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-100 truncate">
                  Unduh Detail History Penggajian
                </div>
                <div className="text-[11px] text-emerald-400 font-semibold truncate">
                  {namaKaryawan}
                </div>
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  Mencakup seluruh inputan kerja, slip gaji cair &amp; rincian uang titip / kasbon
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(busyFmt)}
                onClick={() => setOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {hasMonthDefault && (
                <div>
                  <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    Cakupan Periode:
                  </span>
                  <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setUseAllPeriods(true)}
                      className={`flex-1 py-1.5 px-2 rounded-md font-semibold cursor-pointer ${
                        useAllPeriods
                          ? 'bg-emerald-700 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Semua Periode
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseAllPeriods(false)}
                      className={`flex-1 py-1.5 px-2 rounded-md font-semibold truncate cursor-pointer ${
                        !useAllPeriods
                          ? 'bg-sky-700 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {defaultPeriodLabel}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  Filter Status Upah Harian:
                </span>
                <select
                  value={statusKerja}
                  onChange={(e) => setStatusKerja(e.target.value as 'SEMUA' | 'BON' | 'LUNAS')}
                  className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="SEMUA">Semua Inputan (BON + LUNAS)</option>
                  <option value="BON">Hanya Belum Cair (BON)</option>
                  <option value="LUNAS">Hanya Sudah Cair (LUNAS)</option>
                </select>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Pilih Format Unduhan:
                </span>

                <button
                  type="button"
                  disabled={Boolean(busyFmt)}
                  onClick={() => handleExport('xlsx')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-800/70 text-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold">Excel (.xlsx)</span>
                  </span>
                  <span className="text-[10px] text-emerald-300/80">
                    {busyFmt === 'xlsx' ? 'Mengunduh...' : '4 Sheet Lengkap'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={Boolean(busyFmt)}
                  onClick={() => handleExport('pdf')}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 border border-rose-800/70 text-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="flex items-center space-x-2">
                    <FileDown className="w-4 h-4 text-rose-400" />
                    <span className="font-bold">PDF (.pdf)</span>
                  </span>
                  <span className="text-[10px] text-rose-300/80">
                    {busyFmt === 'pdf' ? 'Mengunduh...' : 'Dokumen Cetak A4'}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busyFmt)}
                    onClick={() => handleExport('jpg')}
                    className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-950/50 hover:bg-amber-900/70 border border-amber-800/70 text-amber-200 font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>{busyFmt === 'jpg' ? '...' : 'JPG (.jpg)'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={Boolean(busyFmt)}
                    onClick={() => handleExport('png')}
                    className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-sky-950/50 hover:bg-sky-900/70 border border-sky-800/70 text-sky-200 font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                    <span>{busyFmt === 'png' ? '...' : 'PNG (.png)'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={Boolean(busyFmt)}
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span className="flex items-center space-x-2">
                    <FileText className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="font-semibold">CSV (.csv)</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {busyFmt === 'csv' ? 'Mengunduh...' : 'Data Mentah Tabel'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
