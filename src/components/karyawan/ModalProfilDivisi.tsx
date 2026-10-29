import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Camera,
  Trash2,
  Save,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserCheck,
  FileText,
  Layers,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { DEFAULT_PT_LOGO_URL, ItemDivisi } from '../../server/types.ts';
import { DivisiLogoAvatar } from '../common/DivisiLogoAvatar.tsx';

export async function compressLogoFileToDataUrl(file: File, maxDimension = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar logo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar logo tidak didukung'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        const keepAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
        if (!keepAlpha) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

interface ModalProfilDivisiProps {
  isOpen: boolean;
  initialDivisiNama?: string;
  onClose: () => void;
  onSaved?: (updated: ItemDivisi) => void;
}

export const ModalProfilDivisi: React.FC<ModalProfilDivisiProps> = ({
  isOpen,
  initialDivisiNama,
  onClose,
  onSaved,
}) => {
  const [divisiList, setDivisiList] = useState<ItemDivisi[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [mode, setMode] = useState<'EDIT' | 'ADD'>('EDIT');

  const [selectedNama, setSelectedNama] = useState<string>('');
  const [namaBaru, setNamaBaru] = useState<string>('');
  const [penanggungJawab, setPenanggungJawab] = useState<string>('');
  const [deskripsi, setDeskripsi] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const applyDivisiSelection = (targetNama: string, list: ItemDivisi[]) => {
    const found =
      list.find((d) => d.nama.toLowerCase() === targetNama.toLowerCase()) || list[0];
    if (!found) return;
    setSelectedNama(found.nama);
    setPenanggungJawab(found.penanggungJawab || '');
    setDeskripsi(found.deskripsi || '');
    setLogoUrl(
      found.logoUrl ||
        (found.nama.toLowerCase() === 'pt wijaya agro perkasa' ? DEFAULT_PT_LOGO_URL : '')
    );
  };

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setSuccessMsg('');
    setMode('EDIT');
    setLoadingList(true);
    api
      .getDivisi()
      .then((list) => {
        setDivisiList(list);
        applyDivisiSelection(initialDivisiNama || list[0]?.nama || '', list);
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Gagal memuat daftar profil divisi');
      })
      .finally(() => setLoadingList(false));
  }, [isOpen, initialDivisiNama]);

  if (!isOpen) return null;

  const handleUploadFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Pilih file gambar (PNG, JPG, atau WebP) untuk logo divisi.');
      return;
    }
    setUploadingLogo(true);
    setErrorMsg('');
    try {
      const compressed = await compressLogoFileToDataUrl(file, 320);
      const uploaded = await api.uploadBuktiImage(compressed, 'logo-divisi');
      setLogoUrl(uploaded.url || compressed);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses gambar logo divisi');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);

    try {
      let savedItem: ItemDivisi;
      if (mode === 'ADD') {
        if (!namaBaru.trim()) {
          setErrorMsg('Nama divisi baru wajib diisi.');
          setSaving(false);
          return;
        }
        savedItem = await api.createDivisi({
          nama: namaBaru.trim(),
          penanggungJawab: penanggungJawab.trim(),
          deskripsi: deskripsi.trim(),
          logoUrl: logoUrl || undefined,
        });
      } else {
        savedItem = await api.updateDivisiProfil({
          idOrNama: selectedNama,
          penanggungJawab: penanggungJawab.trim(),
          deskripsi: deskripsi.trim(),
          logoUrl: logoUrl || '',
        });
      }

      const refreshedList = await api.getDivisi().catch(() => divisiList);
      setDivisiList(refreshedList);
      setMode('EDIT');
      setNamaBaru('');
      setSelectedNama(savedItem.nama);
      setSuccessMsg(
        `Profil & logo "${savedItem.nama}" berhasil disimpan dan langsung tersinkron ke Tampilan Admin & Tampilan Bos!`
      );
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onSaved?.(savedItem);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan profil divisi');
    } finally {
      setSaving(false);
    }
  };

  const activeDisplayName = mode === 'ADD' ? namaBaru || 'Divisi Baru' : selectedNama;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-slate-900 font-sans my-6">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 text-white flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <DivisiLogoAvatar
              namaDivisi={activeDisplayName}
              logoUrl={logoUrl || undefined}
              size="md"
              theme="dark"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold truncate">
                Profil &amp; Logo Masing-Masing Divisi
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Terkoneksi otomatis ke Tampilan Admin, Tampilan Bos &amp; Cloud Supabase
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
            aria-label="Tutup modal profil divisi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs">
          {/* Mode Switcher: Pilih Divisi vs Tambah Divisi Baru */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setMode('EDIT');
                  setErrorMsg('');
                  setSuccessMsg('');
                  if (divisiList.length > 0) {
                    applyDivisiSelection(selectedNama || divisiList[0].nama, divisiList);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  mode === 'EDIT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Edit Profil &amp; Logo ({divisiList.length} Divisi)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('ADD');
                  setErrorMsg('');
                  setSuccessMsg('');
                  setNamaBaru('');
                  setPenanggungJawab('');
                  setDeskripsi('');
                  setLogoUrl('');
                }}
                className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                  mode === 'ADD'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Divisi Baru</span>
              </button>
            </div>
          </div>

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Selector Divisi atau Input Nama Divisi Baru */}
          {mode === 'EDIT' ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Pilih Unit Divisi</span>
              </label>
              <select
                disabled={loadingList}
                value={selectedNama}
                onChange={(e) => {
                  setSuccessMsg('');
                  applyDivisiSelection(e.target.value, divisiList);
                }}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {divisiList.map((d) => (
                  <option key={d.id} value={d.nama}>
                    {d.nama} ({d.kodeRekening}) {d.logoUrl ? '— Sudah Ada Logo' : ''}
                  </option>
                ))}
              </select>

              {/* Quick Division Switcher Strip */}
              {divisiList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {divisiList.map((d) => {
                    const active = d.nama === selectedNama;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setSuccessMsg('');
                          applyDivisiSelection(d.nama, divisiList);
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                          active
                            ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <DivisiLogoAvatar namaDivisi={d.nama} logoUrl={d.logoUrl} size="xs" />
                        <span className="truncate max-w-[130px]">{d.nama}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Nama Divisi Baru <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={namaBaru}
                onChange={(e) => setNamaBaru(e.target.value)}
                placeholder="Contoh: BRILink Wijaya / Divisi Penggilingan"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          )}

          {/* Logo Divisi Upload Area */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={`Logo ${activeDisplayName}`}
                    className="w-16 h-16 rounded-2xl object-contain bg-black border border-slate-300 shrink-0"
                  />
                ) : (
                  <DivisiLogoAvatar namaDivisi={activeDisplayName} size="lg" />
                )}

                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-xs sm:text-sm">
                    Logo Divisi: {activeDisplayName}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Unggah logo khusus divisi ini (PNG / JPG). Logo langsung tampil di kartu Divisi Admin dan Portal Pimpinan (Bos).
                  </p>
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleUploadFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void handleUploadFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold transition-colors cursor-pointer"
              >
                {uploadingLogo ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{uploadingLogo ? 'Mengunggah Logo...' : 'Pilih File Logo'}</span>
              </button>

              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-slate-600" />
                <span>Kamera</span>
              </button>

              <button
                type="button"
                disabled={uploadingLogo}
                onClick={() => setLogoUrl(DEFAULT_PT_LOGO_URL)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold transition-colors cursor-pointer"
              >
                <span>Gunakan Logo PT Induk</span>
              </button>

              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Logo</span>
                </button>
              )}
            </div>
          </div>

          {/* Penanggung Jawab & Deskripsi */}
          <div className="grid grid-cols-1 gap-3.5">
            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                <span>Penanggung Jawab (PJ) Divisi</span>
              </label>
              <input
                type="text"
                value={penanggungJawab}
                onChange={(e) => setPenanggungJawab(e.target.value)}
                placeholder="Nama Koordinator / Kepala Operasional Divisi"
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Deskripsi Profil &amp; Lingkup Kerja Divisi</span>
              </label>
              <textarea
                rows={2}
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                placeholder="Keterangan unit usaha / operasional divisi..."
                className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="submit"
              disabled={saving || uploadingLogo}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>
                {saving
                  ? 'Menyimpan ke Cloud...'
                  : mode === 'ADD'
                  ? 'Tambah & Simpan Divisi'
                  : 'Simpan Profil & Logo Divisi'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
