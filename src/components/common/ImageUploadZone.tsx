import React, { useState, useRef } from 'react';
import {
  Camera,
  UploadCloud,
  X,
  Eye,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { api } from '../../api/client';

interface ImageUploadZoneProps {
  label?: string;
  sublabel?: string;
  value?: string; // base64 or URL or joined with '|||'
  values?: string[]; // array of base64/URL images
  onChange?: (base64: string) => void;
  onValuesChange?: (images: string[]) => void;
  multiple?: boolean;
  required?: boolean;
}

export const ImageUploadZone: React.FC<ImageUploadZoneProps> = ({
  label = 'Sisipkan Foto Nota / Bukti Fisik',
  sublabel = 'Lampirkan foto nota, surat jalan, atau faktur fisik asli',
  value,
  values,
  onChange,
  onValuesChange,
  multiple = false,
  required = false,
}) => {
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string>('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute current list of images
  const currentImages: string[] = React.useMemo(() => {
    if (values && values.length > 0) return values;
    if (value) {
      return value.split('|||').map((s) => s.trim()).filter(Boolean);
    }
    return [];
  }, [value, values]);

  // Fast & lightweight image compressor using Canvas (~55-75 KB crisp JPEG)
  const compressFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      const safetyTimer = setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Waktu kompresi gambar habis (timeout)'));
      }, 4500);

      img.onload = () => {
        clearTimeout(safetyTimer);
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIMENSION = 840;
          const maxSide = Math.max(img.width || 1, img.height || 1);
          const scale = Math.min(1, MAX_DIMENSION / maxSide);
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));

          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressed = canvas.toDataURL('image/jpeg', 0.68);
            URL.revokeObjectURL(objectUrl);
            resolve(compressed);
          } else {
            const reader = new FileReader();
            reader.onload = (re) => {
              URL.revokeObjectURL(objectUrl);
              resolve(re.target?.result as string);
            };
            reader.readAsDataURL(file);
          }
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };

      img.onerror = () => {
        clearTimeout(safetyTimer);
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Gagal memuat file gambar'));
      };

      img.src = objectUrl;
    });
  };

  const offloadToCloudOrFallback = async (compressedDataUrl: string): Promise<string> => {
    try {
      const res = await Promise.race([
        api.uploadBuktiImage(compressedDataUrl, 'nota'),
        new Promise<{ url: string }>((resolve) =>
          setTimeout(() => resolve({ url: compressedDataUrl }), 3500)
        ),
      ]);
      return res?.url || compressedDataUrl;
    } catch {
      return compressedDataUrl;
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    setUploadError('');
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/')) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      setUploadError('Pilih file gambar valid (JPG, PNG, WEBP).');
      return;
    }

    setProcessing(true);
    try {
      const finalResults: string[] = [];
      for (const file of validFiles) {
        try {
          const compressed = await compressFile(file);
          const stored = await offloadToCloudOrFallback(compressed);
          finalResults.push(stored);
        } catch (err: any) {
          console.warn('Compress error on file:', file.name, err);
        }
      }

      if (finalResults.length === 0) {
        throw new Error('Semua gambar gagal diproses.');
      }

      if (multiple) {
        const nextList = [...currentImages, ...finalResults];
        if (onValuesChange) onValuesChange(nextList);
        if (onChange) onChange(nextList.join('|||'));
      } else {
        const single = finalResults[0];
        if (onChange) onChange(single);
        if (onValuesChange) onValuesChange([single]);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Gagal memproses gambar');
    } finally {
      setProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveSingle = (indexToRemove: number) => {
    const updated = currentImages.filter((_, idx) => idx !== indexToRemove);
    if (onValuesChange) onValuesChange(updated);
    if (onChange) onChange(updated.join('|||'));
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChange) onChange('');
    if (onValuesChange) onValuesChange([]);
    setUploadError('');
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-zinc-800">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {currentImages.length > 0 && (
          <span className="text-[10px] text-emerald-700 font-bold flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>
              {currentImages.length} Foto Siap {multiple ? 'Disimpan' : ''}
            </span>
          </span>
        )}
      </div>

      {/* Hidden Inputs */}
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
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />

      {uploadError && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-[11px] flex items-center space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Dropzone when empty */}
      {currentImages.length === 0 ? (
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
                  Ambil Foto Nota Fisik {multiple ? '(Bisa Lebih Dari 1)' : ''}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{sublabel}</p>
              </div>

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
        /* Attached Images View (Multi or Single) */
        <div className="space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {currentImages.map((img, idx) => (
              <div
                key={idx}
                className="relative rounded-xl border border-zinc-200 bg-white p-1.5 shadow-2xs group flex flex-col items-center"
              >
                <div
                  onClick={() => setPreviewModalImg(img)}
                  className="relative w-full h-20 rounded-lg overflow-hidden border border-zinc-200 cursor-pointer bg-zinc-950"
                >
                  <img src={img} alt={`Nota ${idx + 1}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Eye className="w-4 h-4 text-white" />
                  </div>
                  <span className="absolute top-1 left-1 bg-black/70 text-[9px] font-bold text-white px-1.5 py-0.2 rounded">
                    #{idx + 1}
                  </span>
                </div>

                <div className="w-full flex items-center justify-between pt-1 px-1 text-[10px] text-zinc-500">
                  <span className="truncate">Lembar {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveSingle(idx)}
                    className="text-zinc-400 hover:text-rose-600 p-0.5 rounded cursor-pointer"
                    title="Hapus foto ini"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add More Button if multiple */}
            {multiple && (
              <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 flex flex-col items-center justify-center p-3 text-center gap-1.5 transition-colors">
                <span className="text-[10px] font-bold text-zinc-600">+ Tambah Foto</span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="p-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-md cursor-pointer"
                    title="Kamera HP"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-700 rounded-md cursor-pointer"
                    title="Pilih File"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center text-[10px] text-zinc-500 px-0.5">
            <span>
              {currentImages.length} bukti nota terlampir.{' '}
              {multiple ? 'Klik thumbnail untuk pratinjau penuh.' : ''}
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
            >
              Hapus Semua Foto
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewModalImg && (
        <div
          onClick={() => setPreviewModalImg(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl max-h-[85vh] bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 p-2 shadow-2xl"
          >
            <button
              onClick={() => setPreviewModalImg(null)}
              className="absolute top-3 right-3 text-white bg-black/60 rounded-full p-1.5 hover:bg-black/90 cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={previewModalImg}
              alt="Pratinjau Penuh"
              className="max-h-[80vh] w-auto max-w-full rounded object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
