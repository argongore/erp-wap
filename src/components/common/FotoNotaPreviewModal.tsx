import React from 'react';
import { Image as ImageIcon, X, Download, ExternalLink, Calendar, User, FileText } from 'lucide-react';

interface FotoNotaPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  driveFileUrl?: string;
  driveFolderPath?: string;
  title?: string;
  nomorBukti?: string;
  namaMitra?: string;
  tanggal?: string;
  nominalText?: string;
  keterangan?: string;
}

export const FotoNotaPreviewModal: React.FC<FotoNotaPreviewModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  driveFileUrl,
  driveFolderPath,
  title = 'Foto Bukti Fisik Nota',
  nomorBukti,
  namaMitra,
  tanggal,
  nominalText,
  keterangan,
}) => {
  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `bukti-nota-${nomorBukti || 'transaksi'}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 cursor-zoom-out animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-3xl w-full p-4 sm:p-5 shadow-2xl space-y-3 cursor-default text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
              <div className="flex items-center space-x-2 text-[11px] text-zinc-400">
                {nomorBukti && <span className="font-mono">No. Transaksi: {nomorBukti}</span>}
                {driveFolderPath && (
                  <span className="text-sky-400 font-semibold">• 📁 {driveFolderPath}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {driveFileUrl && (
              <a
                href={driveFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 bg-sky-900/60 hover:bg-sky-800 text-sky-200 border border-sky-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
                title="Buka File Asli di Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
                <span>Google Drive</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Unduh Foto Nota"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Unduh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metadata info strip */}
        {(namaMitra || tanggal || nominalText) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 bg-zinc-800/80 rounded-xl text-[11px] border border-zinc-700">
            {namaMitra && (
              <div className="flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate text-zinc-300">
                  Mitra: <strong className="text-white">{namaMitra}</strong>
                </span>
              </div>
            )}
            {tanggal && (
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="text-zinc-300">
                  Tanggal: <strong className="text-white">{tanggal}</strong>
                </span>
              </div>
            )}
            {nominalText && (
              <div className="col-span-2 sm:col-span-1 text-right sm:text-right">
                <span className="text-amber-400 font-bold font-mono text-xs">{nominalText}</span>
              </div>
            )}
            {keterangan && (
              <div className="col-span-2 sm:col-span-3 text-[10px] text-zinc-400 italic pt-1 border-t border-zinc-700/60 truncate">
                {keterangan}
              </div>
            )}
          </div>
        )}

        {/* Image viewport */}
        <div className="max-h-[68vh] overflow-auto rounded-xl bg-black/60 p-2 flex items-center justify-center border border-zinc-800">
          <img
            src={imageUrl}
            alt="Foto Nota Fisik Penuh"
            className="max-h-[64vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
          <span>Foto nota fisik tersimpan aman di database sistem ERP PT Wijaya Agro.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-semibold text-xs cursor-pointer"
          >
            Tutup Pratinjau
          </button>
        </div>
      </div>
    </div>
  );
};
