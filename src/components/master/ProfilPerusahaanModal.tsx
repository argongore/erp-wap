import React, { useState, useEffect } from 'react';
import { Building2, Save, X, Phone, Mail, MapPin, UserCheck, CreditCard, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { ProfilPerusahaan, Rekening } from '../../server/types.ts';
import { api } from '../../api/client.ts';

interface ProfilPerusahaanModalProps {
  isOpen: boolean;
  onClose: () => void;
  rekeningList?: Rekening[];
  onSaved?: (updated: ProfilPerusahaan) => void;
}

export const ProfilPerusahaanModal: React.FC<ProfilPerusahaanModalProps> = ({
  isOpen,
  onClose,
  rekeningList = [],
  onSaved,
}) => {
  const [profile, setProfile] = useState<ProfilPerusahaan>({
    namaPerusahaan: 'PT. WIJAYA AGRO PERKASA',
    badanHukum: 'PT (Perseroan Terbatas)',
    alamat: 'Jl. Raya Agro No. 88, Sentra Agribisnis',
    telepon: '0812-3456-7890',
    email: 'info@wijayaagro.co.id',
    penanggungJawab: 'Pimpinan & Manajemen PT. Wijaya Agro Perkasa',
    rekeningUtama: 'KAS01',
    catatanHeaderNota: 'Terima Kasih Atas Kerjasama Anda - Sukses Bersama Wijaya Agro',
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await api.getProfilPerusahaan();
      if (data) {
        setProfile(data);
      }
    } catch (err: any) {
      console.warn('Gagal memuat profil perusahaan:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);

    try {
      const updated = await api.updateProfilPerusahaan({
        namaPerusahaan: profile.namaPerusahaan.trim() || 'PT. WIJAYA AGRO PERKASA',
        badanHukum: profile.badanHukum.trim(),
        alamat: profile.alamat.trim(),
        telepon: profile.telepon.trim(),
        email: profile.email.trim(),
        penanggungJawab: profile.penanggungJawab.trim(),
        rekeningUtama: profile.rekeningUtama,
        catatanHeaderNota: profile.catatanHeaderNota.trim(),
      });

      setSuccessMsg(
        `Profil ${updated.namaPerusahaan} berhasil diperbarui & otomatis tersinkron ke Rekening Koran Mitra!`
      );
      if (onSaved) onSaved(updated);
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan profil perusahaan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-200 animate-in fade-in my-8">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Building2 className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Profil Perusahaan &amp; Identitas Usaha
              </h2>
              <p className="text-xs text-emerald-200">
                Otomatis menyesuaikan Kop Surat &amp; Identitas di Rekening Koran Mitra, PDF, dan Nota
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Nama Perusahaan <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={profile.namaPerusahaan}
                onChange={(e) => setProfile({ ...profile, namaPerusahaan: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold text-zinc-900"
                placeholder="PT. WIJAYA AGRO PERKASA"
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Bentuk Badan Usaha
              </label>
              <input
                type="text"
                value={profile.badanHukum}
                onChange={(e) => setProfile({ ...profile, badanHukum: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
                placeholder="PT / CV / Firma"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-zinc-500" />
              <span>Alamat Kantor &amp; Gudang Operasional</span>
            </label>
            <textarea
              rows={2}
              value={profile.alamat}
              onChange={(e) => setProfile({ ...profile, alamat: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
              placeholder="Alamat lengkap lokasi kantor / gudang"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-zinc-500" />
                <span>No. Telepon / WhatsApp</span>
              </label>
              <input
                type="text"
                value={profile.telepon}
                onChange={(e) => setProfile({ ...profile, telepon: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
                placeholder="0812-XXXX-XXXX"
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-zinc-500" />
                <span>Email Perusahaan</span>
              </label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
                placeholder="kontak@wijayaagro.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-zinc-500" />
                <span>Penanggung Jawab / Pimpinan</span>
              </label>
              <input
                type="text"
                value={profile.penanggungJawab}
                onChange={(e) => setProfile({ ...profile, penanggungJawab: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
                placeholder="Nama Pimpinan"
              />
            </div>

            <div>
              <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                <span>Rekening Kas / Bank Utama</span>
              </label>
              <select
                value={profile.rekeningUtama}
                onChange={(e) => setProfile({ ...profile, rekeningUtama: e.target.value })}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
              >
                {rekeningList.length > 0 ? (
                  rekeningList
                    .filter((r) => !r.isVirtual)
                    .map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.kode} - {r.nama}
                      </option>
                    ))
                ) : (
                  <option value="KAS01">KAS01 - Kas Kasir Utama</option>
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <span>Catatan Bawah / Kop Surat pada Nota &amp; Struk</span>
            </label>
            <input
              type="text"
              value={profile.catatanHeaderNota}
              onChange={(e) => setProfile({ ...profile, catatanHeaderNota: e.target.value })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 text-zinc-800"
              placeholder="Pesan penutup nota atau instruksi pembayaran"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-5 py-2 bg-emerald-700 text-white font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Profil Perusahaan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
