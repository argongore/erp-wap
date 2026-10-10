import React, { useState, useRef } from 'react';
import { Camera, UploadCloud, X, Eye, Image as ImageIcon, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface ImageUploadZoneProps {
  label?: string;
  sublabel?: string;
  value?: string; // base64 or url
  onChange: (base64: string) => void;
  required?: boolean;
}

export const ImageUploadZone: React.FC<ImageUploadZoneProps> = ({
  label = 'Sisipkan Foto Nota / Bukti Fisik',
  sublabel = 'Lampirkan foto nota, surat jalan, atau faktur fisik asli',
  value,
  onChange,
  required = false,
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fast & lightweight image compressor using ObjectURL and Canvas
  const processFile = (file: File) => {
    setUploadError('');

    if (!file.type.startsWith('image/')) {
      setUploadError('File harus berupa gambar (JPG, PNG, WEBP).');
      return;
    }

    setProcessing(true);

    // Timeout safety net (max 4 seconds) to guarantee UI never gets stagnant
    const safetyTimer = setTimeout(() => {
      setProcessing(false);
    }, 4000);

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      clearTimeout(safetyTimer);
      try {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 850;
        const scale = Math.min(1, MAX_WIDTH / img.width);
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.78);
          onChange(compressed);
        } else {
          // Fallback read as data url if canvas unavailable
          const reader = new FileReader();
          reader.onload = (re) => {
            onChange(re.target?.result as string);
          };
          reader.readAsDataURL(file);
        }
      } catch (err: any) {
        console.error('Error compressing image:', err);
        setUploadError('Gagal memproses gambar. Silakan coba file lain.');
      } finally {
        URL.revokeObjectURL(objectUrl);
        setProcessing(false);
      }
    };

    img.onerror = () => {
      clearTimeout(safetyTimer);
      URL.revokeObjectURL(objectUrl);
      setProcessing(false);
      setUploadError('File gambar tidak dapat dibaca atau rusak.');
    };

    img.src = objectUrl;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // reset input so same file can be re-selected if needed
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-zinc-800">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {value && (
          <span className="text-[10px] text-emerald-700 font-bold flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Foto Siap Disimpan</span>
          </span>
        )}
      </div>

      {/* Hidden Inputs: One with camera capture, one standard file picker */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {uploadError && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-center space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {!value ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-3.5 text-center transition-all ${
            isDragging
              ? 'border-amber-500 bg-amber-50/80'
              : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100 hover:border-zinc-400'
          }`}
        >
          {processing ? (
            <div className="py-2.5 text-xs text-amber-800 font-semibold flex items-center justify-center space-x-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
              <span>Memproses &amp; mengompresi gambar bukti...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2 text-zinc-500">
                <Camera className="w-5 h-5 text-amber-600" />
                <UploadCloud className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-zinc-800">
                  Ambil Foto Nota Fisik atau Pilih File Gambar
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{sublabel}</p>
              </div>

              {/* Action buttons to prevent mobile/desktop freeze */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Kamera HP</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Galeri / File</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="relative rounded-xl border border-zinc-200 bg-white p-2.5 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div
              onClick={() => setPreviewOpen(true)}
              className="relative w-14 h-14 rounded-lg overflow-hidden border border-zinc-300 shrink-0 cursor-pointer group bg-zinc-900"
            >
              <img
                src={value}
                alt="Foto Nota"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Eye className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="text-xs min-w-0">
              <div className="font-bold text-zinc-900 flex items-center space-x-1.5 truncate">
                <ImageIcon className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Foto Nota Fisik Terlampir</span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Tersimpan &amp; siap diupload ke Drive (Folder NOTA LALU)
              </p>
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="text-[11px] text-amber-700 hover:text-amber-800 font-bold underline mt-0.5 inline-block cursor-pointer"
              >
                Lihat Foto Penuh
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold border border-zinc-300 cursor-pointer"
              title="Ganti Foto"
            >
              Ganti
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs cursor-pointer"
              title="Hapus Foto"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Preview Modal */}
      {previewOpen && value && (
        <div
          onClick={() => setPreviewOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-2xl w-full p-4 shadow-2xl space-y-3 cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="text-xs font-bold text-zinc-200 flex items-center space-x-2">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <span>Pratinjau Foto Nota / Bukti Fisik</span>
              </span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded cursor-pointer"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="max-h-[75vh] overflow-auto rounded-lg bg-black/50 p-2 flex items-center justify-center">
              <img
                src={value}
                alt="Foto Nota Penuh"
                className="max-h-[70vh] w-auto max-w-full rounded object-contain shadow-lg"
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
              <span>Foto ini tersimpan permanen bersama data transaksi.</span>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded font-semibold text-xs cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
