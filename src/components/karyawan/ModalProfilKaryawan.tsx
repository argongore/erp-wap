import React, { useState, useRef } from 'react';
import {
  X,
  Camera,
  Trash2,
  ArrowRight,
  Building2,
  User,
  CheckCircle2,
  AlertCircle,
  History,
  ZoomIn,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  DAFTAR_DIVISI,
  isExcludedFromDivisi,
  Karyawan,
  RiwayatDivisiKaryawan,
  StatusAktif,
} from '../../server/types.ts';

/**
 * Compress an uploaded image client-side into a crisp square-friendly JPEG (~25-60KB)
 * so employee profile photos load fast and sync cleanly to Cloud Supabase.
 */
export async function compressFotoProfilImage(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format foto tidak didukung'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

interface KaryawanAvatarProps {
  nama: string;
  fotoUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  theme?: 'light' | 'dark';
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}

export const KaryawanAvatar: React.FC<KaryawanAvatarProps> = ({
  nama,
  fotoUrl,
  size = 'sm',
  theme = 'light',
  onClick,
  title,
}) => {
  const initials = String(nama || 'KR')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const sizeClass =
    size === 'xs'
      ? 'w-7 h-7 text-[10px]'
      : size === 'sm'
      ? 'w-9 h-9 text-xs'
      : size === 'md'
      ? 'w-12 h-12 text-sm'
      : 'w-20 h-20 text-lg';

  const fallbackClass =
    theme === 'dark'
      ? 'bg-amber-950 text-amber-300 border-amber-800'
      : 'bg-emerald-50 text-emerald-800 border-emerald-200';

  if (fotoUrl) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title || `Foto ${nama}`}
        className={`${sizeClass} rounded-xl overflow-hidden border border-slate-200 shrink-0 relative group ${
          onClick ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <img src={fotoUrl} alt={nama} className="w-full h-full object-cover" />
        {onClick && (
          <span className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
            <ZoomIn className="w-3.5 h-3.5" />
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || nama}
      className={`${sizeClass} rounded-xl border font-bold flex items-center justify-center shrink-0 select-none ${fallbackClass} ${
        onClick ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
      }`}
    >
      {initials || 'KR'}
    </button>
  );
};

export const ModalPreviewFotoKaryawan: React.FC<{
  nama: string;
  jabatan?: string;
  divisi?: string;
  fotoUrl: string;
  onClose: () => void;
}> = ({ nama, jabatan, divisi, fotoUrl, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 p-4 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="min-w-0 pr-2">
            <div className="text-sm font-bold truncate">{nama}</div>
            {(jabatan || divisi) && (
              <div className="text-[11px] text-slate-300 truncate">
                {[jabatan, divisi].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-slate-950 flex items-center justify-center max-h-[75vh]">
          <img src={fotoUrl} alt={nama} className="max-h-[72vh] w-auto object-contain" />
        </div>
      </div>
    </div>
  );
};

export interface ProfilKaryawanEditableData {
  id: string;
  nik: string;
  nama: string;
  jabatan: string;
  divisi: string;
  telepon?: string;
  alamat?: string;
  tanggalMasuk?: string;
  status?: StatusAktif;
  fotoUrl?: string;
  catatan?: string;
  riwayatDivisi?: RiwayatDivisiKaryawan[];
}

interface ModalProfilKaryawanProps {
  karyawan: ProfilKaryawanEditableData;
  availableDivisiList?: string[];
  defaultPeriodeBulan?: string;
  onClose: () => void;
  onSaved: (updated: Karyawan) => void;
}

const BULAN_INDO = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const ModalProfilKaryawan: React.FC<ModalProfilKaryawanProps> = ({
  karyawan,
  availableDivisiList,
  defaultPeriodeBulan,
  onClose,
  onSaved,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const divisiOptions = React.useMemo(() => {
    const base =
      availableDivisiList && availableDivisiList.length > 0
        ? availableDivisiList.filter((d) => !isExcludedFromDivisi(d))
        : DAFTAR_DIVISI.map((d) => d.nama);
    const set = new Set<string>(base);
    // Pastikan unit inti upgrade selalu tersedia
    set.add('Gudang Wijaya Agro');
    set.add('CV Wijaya Agro');
    set.add('PT Wijaya Agro Perkasa');
    set.add('Wijaya Karya');
    set.add('Wijaya Transport');
    set.add('Okussa');
    if (karyawan.divisi && !isExcludedFromDivisi(karyawan.divisi)) {
      set.add(karyawan.divisi);
    }
    return Array.from(set);
  }, [availableDivisiList, karyawan.divisi]);

  const now = new Date();
  const currentMonthLabel =
    defaultPeriodeBulan || `${BULAN_INDO[now.getMonth()]} ${now.getFullYear()}`;

  const [nik, setNik] = useState(karyawan.nik || '');
  const [nama, setNama] = useState(karyawan.nama || '');
  const [jabatan, setJabatan] = useState(karyawan.jabatan || '');
  const [divisi, setDivisi] = useState(karyawan.divisi || 'Gudang Wijaya Agro');
  const [telepon, setTelepon] = useState(karyawan.telepon && karyawan.telepon !== '-' ? karyawan.telepon : '');
  const [alamat, setAlamat] = useState(karyawan.alamat && karyawan.alamat !== '-' ? karyawan.alamat : '');
  const [status, setStatus] = useState<StatusAktif>(karyawan.status || 'AKTIF');
  const [fotoUrl, setFotoUrl] = useState<string>(karyawan.fotoUrl || '');
  const [catatan, setCatatan] = useState(karyawan.catatan || '');

  // Division upgrade / mutation fields
  const [periodeBulanMutasi, setPeriodeBulanMutasi] = useState(currentMonthLabel);
  const [catatanMutasiDivisi, setCatatanMutasiDivisi] = useState('');

  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [previewFullPhoto, setPreviewFullPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const divisiAsal = karyawan.divisi || 'Gudang Wijaya Agro';
  const isUpgradingDivisi = divisi.trim() !== divisiAsal.trim();
  const isChangingJabatan = jabatan.trim() !== (karyawan.jabatan || '').trim();
  const riwayatList = Array.isArray(karyawan.riwayatDivisi) ? karyawan.riwayatDivisi : [];

  const handleSelectFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setUploadingFoto(true);
    try {
      const compressed = await compressFotoProfilImage(file, 480, 0.82);
      setFotoUrl(compressed);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses foto karyawan');
    } finally {
      setUploadingFoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!nama.trim() || !jabatan.trim()) {
      setErrorMsg('Nama lengkap dan jabatan karyawan wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await api.updateKaryawan(karyawan.id, {
        nik: nik.trim(),
        nama: nama.trim(),
        jabatan: jabatan.trim(),
        divisi: divisi.trim(),
        departemen: divisi.trim(),
        telepon: telepon.trim() || '-',
        alamat: alamat.trim() || '-',
        status,
        fotoUrl: fotoUrl || '',
        catatan: catatan.trim(),
        periodeBulanMutasi: isUpgradingDivisi || isChangingJabatan ? periodeBulanMutasi : undefined,
        catatanMutasiDivisi:
          catatanMutasiDivisi.trim() ||
          (isUpgradingDivisi
            ? `Upgrade / pindah unit dari ${divisiAsal} ke ${divisi.trim()} (${periodeBulanMutasi})`
            : undefined),
      });
      setSuccessMsg('Profil, foto & divisi karyawan berhasil disinkronkan.');
      window.dispatchEvent(new CustomEvent('erp:data-updated'));
      onSaved(updated);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan pembaruan profil karyawan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/70 p-3 sm:p-4 overflow-y-auto flex items-start sm:items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto max-h-[92vh] flex flex-col border border-slate-200 text-slate-900">
          {/* Header */}
          <div className="px-5 py-4 bg-slate-900 text-white rounded-t-2xl flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold tracking-tight truncate">
                  Profil, Foto &amp; Upgrade Divisi Karyawan
                </h2>
                <p className="text-[11px] text-slate-300 truncate">
                  Sinkron otomatis ke Input Gaji Harian, Tampilan Bos, dan Akun Karyawan dan Mitra
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Section 1: Foto Profil Karyawan + Identitas Utama */}
            <div className="flex flex-col sm:flex-row items-start gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <KaryawanAvatar
                  nama={nama || karyawan.nama}
                  fotoUrl={fotoUrl || undefined}
                  size="lg"
                  onClick={fotoUrl ? () => setPreviewFullPhoto(true) : undefined}
                  title={fotoUrl ? 'Klik untuk perbesar foto karyawan' : 'Belum ada foto karyawan'}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleSelectFoto}
                  className="hidden"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={uploadingFoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    <Camera className="w-3 h-3" />
                    <span>{uploadingFoto ? 'Memproses...' : fotoUrl ? 'Ganti Foto' : 'Upload Foto'}</span>
                  </button>
                  {fotoUrl && (
                    <button
                      type="button"
                      onClick={() => setFotoUrl('')}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                      title="Hapus foto karyawan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 w-full">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Lengkap Karyawan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode / NIK Karyawan</label>
                  <input
                    type="text"
                    required
                    value={nik}
                    onChange={(e) => setNik(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jabatan / Posisi Saat Ini <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={jabatan}
                    onChange={(e) => setJabatan(e.target.value)}
                    placeholder="Contoh: Kepala Gudang, Admin CV, Staff PT..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Karyawan</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as StatusAktif)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="AKTIF">AKTIF</option>
                    <option value="NONAKTIF">NONAKTIF</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Section 2: Upgrade / Penempatan Unit Divisi Aktif */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                  <Building2 className="w-4 h-4 text-emerald-700" />
                  <span>Penempatan &amp; Upgrade Unit Divisi Karyawan</span>
                </div>
                <span className="text-[11px] text-slate-600">
                  Divisi terdaftar sebelumnya: <strong className="text-slate-900">{divisiAsal}</strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {divisiOptions.map((d) => {
                  const isSelected = divisi === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDivisi(d)}
                      className={`px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-700 border-emerald-700 text-white font-bold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="truncate">{d}</div>
                      {d === divisiAsal && (
                        <div
                          className={`text-[10px] mt-0.5 ${
                            isSelected ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          Divisi saat ini
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {(isUpgradingDivisi || isChangingJabatan) && (
                <div className="p-3 rounded-xl bg-white border border-emerald-300 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-emerald-900">
                    <span>Perubahan Terdeteksi:</span>
                    <span className="text-slate-700">{divisiAsal}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">{divisi}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Mulai Berlaku Bulan / Periode
                      </label>
                      <input
                        type="text"
                        value={periodeBulanMutasi}
                        onChange={(e) => setPeriodeBulanMutasi(e.target.value)}
                        placeholder="Contoh: November 2026"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Catatan Upgrade / Mutasi Divisi
                      </label>
                      <input
                        type="text"
                        value={catatanMutasiDivisi}
                        onChange={(e) => setCatatanMutasiDivisi(e.target.value)}
                        placeholder={`Contoh: Upgrade dari ${divisiAsal} ke ${divisi}`}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 3: Kontak & Alamat */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">No. HP / WhatsApp</label>
                <input
                  type="text"
                  value={telepon}
                  onChange={(e) => setTelepon(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Alamat Domisili</label>
                <input
                  type="text"
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  placeholder="Desa, Kecamatan, Kabupaten..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 mb-1">Catatan Profil Karyawan</label>
                <input
                  type="text"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Keahlian khusus, nomor rekening pribadi karyawan, atau keterangan tambahan..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800"
                />
              </div>
            </div>

            {/* Section 4: Riwayat Penempatan & Upgrade Divisi Lintas Bulan */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>Riwayat Penempatan &amp; Upgrade Divisi ({riwayatList.length})</span>
              </div>
              {riwayatList.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-[11px]">
                  Belum ada riwayat perpindahan/upgrade divisi tercatat. Saat Anda memindahkan divisi (misal dari Gudang Wijaya Agro ke CV Wijaya Agro atau PT Wijaya Agro Perkasa), jejak bulannya otomatis tersimpan di sini.
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200 max-h-40 overflow-y-auto">
                  {[...riwayatList].reverse().map((rw) => (
                    <div key={rw.id} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <div>
                        <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                          {rw.divisiSebelumnya && rw.divisiSebelumnya !== rw.divisiBaru ? (
                            <>
                              <span className="text-slate-600">{rw.divisiSebelumnya}</span>
                              <ArrowRight className="w-3 h-3 text-emerald-600" />
                              <span className="text-emerald-800">{rw.divisiBaru}</span>
                            </>
                          ) : (
                            <span className="text-slate-900">{rw.divisiBaru}</span>
                          )}
                          {rw.jabatanBaru && (
                            <span className="text-slate-500 font-normal">· {rw.jabatanBaru}</span>
                          )}
                        </div>
                        {rw.catatan && <div className="text-[11px] text-slate-500">{rw.catatan}</div>}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 shrink-0">
                        {rw.periodeBulan ? `${rw.periodeBulan} · ` : ''}
                        {rw.tanggal}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting || uploadingFoto}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-xs cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Profil & Divisi'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {previewFullPhoto && fotoUrl && (
        <ModalPreviewFotoKaryawan
          nama={nama || karyawan.nama}
          jabatan={jabatan}
          divisi={divisi}
          fotoUrl={fotoUrl}
          onClose={() => setPreviewFullPhoto(false)}
        />
      )}
    </>
  );
};
