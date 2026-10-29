import React, { useState, useEffect } from 'react';
import {
  X,
  KeyRound,
  Eye,
  Copy,
  Check,
  Save,
  ShieldCheck,
  Globe,
  HelpCircle,
} from 'lucide-react';
import { api } from '../../api/client.ts';

interface ModalAksesBosDanPinProps {
  isOpen: boolean;
  onClose: () => void;
  onEnterPreviewBos: () => void;
  onEnterPinLockScreen: () => void;
}

export const ModalAksesBosDanPin: React.FC<ModalAksesBosDanPinProps> = ({
  isOpen,
  onClose,
  onEnterPreviewBos,
  onEnterPinLockScreen,
}) => {
  const [tab, setTab] = useState<'pin' | 'vercel' | 'info'>('vercel');
  const [pinBos, setPinBos] = useState('888888');
  const [pinKasir, setPinKasir] = useState('123456');
  const [wajibPinPublik, setWajibPinPublik] = useState(true);
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKeyPreview, setSupabaseKeyPreview] = useState('');
  const [localBrowserKey, setLocalBrowserKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setStatusMsg(null);

    try {
      const savedUrl = localStorage.getItem('wijaya_agro_supabase_url') || '';
      const savedKey = localStorage.getItem('wijaya_agro_supabase_key') || '';
      if (savedUrl) setSupabaseUrl(savedUrl);
      if (savedKey) setLocalBrowserKey(savedKey);
    } catch {}

    api
      .getAccessAdminConfig()
      .then((cfg) => {
        setPinBos(cfg.pinBos || '888888');
        setPinKasir(cfg.pinKasir || '123456');
        setWajibPinPublik(cfg.wajibPinPublik !== false);
        if (cfg.supabaseUrl) setSupabaseUrl(cfg.supabaseUrl);
        setSupabaseKeyPreview(cfg.supabaseKeyPreview || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const copyText = (value: string, key: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2200);
    });
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    try {
      const updated = await api.updateAccessAdminConfig({
        pinBos,
        pinKasir,
        wajibPinPublik,
      });
      setPinBos(updated.pinBos);
      setPinKasir(updated.pinKasir);
      setWajibPinPublik(updated.wajibPinPublik);
      setStatusMsg({
        type: 'ok',
        text: 'Kode PIN Bos & PIN Kasir berhasil disimpan ke Cloud Supabase!',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'err',
        text: err.message || 'Gagal menyimpan pengaturan PIN.',
      });
    } finally {
      setSaving(false);
    }
  };

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://wijaya-agro.vercel.app';
  const bosDirectLink = `${currentOrigin}/?mode=bos`;

  const envBlockForVercel =
    supabaseUrl && localBrowserKey
      ? `SUPABASE_URL=${supabaseUrl}\nSUPABASE_KEY=${localBrowserKey}`
      : supabaseUrl
        ? `SUPABASE_URL=${supabaseUrl}\nSUPABASE_KEY=`
        : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/55 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                Akses Khusus Bos, Kunci PIN &amp; Deploy 100% Gratis (Rp 0)
              </h2>
              <p className="text-xs text-slate-500">
                Pantau 24 jam lewat HP tanpa kartu kredit, tanpa akun Gmail yang sama &amp; tanpa AI Studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab('vercel')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'vercel'
                ? 'bg-emerald-700 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            1. Pasang 100% Gratis (Vercel.com — Rp 0)
          </button>
          <button
            type="button"
            onClick={() => setTab('pin')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'pin'
                ? 'bg-emerald-700 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            2. Atur PIN Bos &amp; Pratinjau
          </button>
          <button
            type="button"
            onClick={() => setTab('info')}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'info'
                ? 'bg-emerald-700 text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            3. Kenapa Railway / Render Minta Kartu?
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 text-xs sm:text-sm space-y-5 max-h-[75vh] overflow-y-auto">
          {tab === 'vercel' && (
            <div className="space-y-5 text-xs leading-relaxed text-slate-700">
              <div className="pb-4 border-b border-slate-100 space-y-1.5">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Vercel.com (Paket Hobby) — Murni Gratis Rp 0 Selamanya &amp; Tanpa Kartu Kredit</span>
                </div>
                <p className="text-slate-600">
                  Kode sistem Anda sekarang sudah dilengkapi mesin <code className="font-mono font-semibold">vercel.json</code> &amp; API Serverless otomatis. Berbeda dengan Railway/Render, <strong>Vercel Hobby 100% gratis tanpa kartu kredit</strong> dan langsung terbuka cepat 24 jam tanpa jeda tidur 30 detik.
                </p>
              </div>

              <ol className="space-y-3.5 list-decimal list-inside font-medium text-slate-800">
                <li>
                  Pastikan perubahan kode terbaru ini sudah ter-<em>sync / push</em> ke <strong>GitHub</strong> Anda.
                </li>
                <li>
                  Buka <strong>vercel.com</strong> → Klik <strong>Sign Up / Log In</strong> → Pilih <strong>Continue with GitHub</strong> (pilih akun <strong>Hobby / Personal — Gratis Rp 0</strong>, tidak perlu kartu kredit sama sekali).
                </li>
                <li>
                  Klik tombol <strong>Add New... → Project</strong> → Klik <strong>Import</strong> pada repositori GitHub proyek PT. Wijaya Agro Perkasa ini.
                </li>
                <li>
                  Sebelum klik Deploy, klik menu lipat <strong>Environment Variables</strong>, lalu tempelkan 2 kunci penghubung Cloud Supabase di bawah ini:
                </li>
              </ol>

              <div className="py-3.5 px-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/80">
                  <span className="font-semibold text-slate-900">
                    Salin Cepat Environment Variables untuk Vercel:
                  </span>
                  {envBlockForVercel && (
                    <button
                      type="button"
                      onClick={() => copyText(envBlockForVercel, 'envAll')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      {copiedField === 'envAll' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedField === 'envAll'
                          ? 'Berhasil Disalin! Tinggal Paste (Ctrl+V) di Vercel'
                          : 'Salin Keduanya Sekaligus (.env)'}
                      </span>
                    </button>
                  )}
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-bold text-slate-900">SUPABASE_URL</span> ={' '}
                      <span className="text-emerald-800">
                        {supabaseUrl || '(Ambil dari menu Cloud Aktif)'}
                      </span>
                    </div>
                    {supabaseUrl && (
                      <button
                        type="button"
                        onClick={() => copyText(supabaseUrl, 'supUrl')}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-sans font-semibold shrink-0 cursor-pointer inline-flex items-center gap-1"
                      >
                        {copiedField === 'supUrl' ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedField === 'supUrl' ? 'Tersalin' : 'Salin URL'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="font-bold text-slate-900">SUPABASE_KEY</span> ={' '}
                      <span className="text-slate-600">
                        {localBrowserKey
                          ? `${localBrowserKey.slice(0, 12)}...${localBrowserKey.slice(-6)} (Siap disalin)`
                          : supabaseKeyPreview
                            ? `${supabaseKeyPreview} (Salin dari Supabase → Project Settings → API)`
                            : '(Salin anon / service_role key dari Supabase → Settings → API)'}
                      </span>
                    </div>
                    {localBrowserKey && (
                      <button
                        type="button"
                        onClick={() => copyText(localBrowserKey, 'supKey')}
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 font-sans font-semibold shrink-0 cursor-pointer inline-flex items-center gap-1"
                      >
                        {copiedField === 'supKey' ? (
                          <Check className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedField === 'supKey' ? 'Tersalin' : 'Salin Key'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="font-bold text-slate-900">
                  5. Klik tombol Deploy — Selesai dalam ~1 Menit!
                </div>
                <p className="text-slate-600">
                  Setelah muncul tulisan <strong>Congratulations</strong>, Vercel memberikan link gratis permanen seperti{' '}
                  <code className="font-mono font-semibold text-slate-900">
                    https://nama-proyek-anda.vercel.app
                  </code>
                  . Kirimkan link tersebut ditambah akhiran <code className="font-mono font-semibold text-emerald-800">/?mode=bos</code> ke WhatsApp Bos beserta <strong>PIN Bos ({pinBos})</strong>.
                </p>
              </div>
            </div>
          )}

          {tab === 'pin' && (
            <form onSubmit={handleSavePin} className="space-y-5">
              {statusMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium ${
                    statusMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-900">
                    Sandi / PIN Pimpinan (Bos) (4–8 Angka)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={loading}
                    value={pinBos}
                    onChange={(e) => setPinBos(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono tabular-nums text-lg font-bold tracking-widest text-emerald-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="888888"
                  />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Saat input <strong>Sandi Bos</strong> pada layar awal, sistem langsung masuk ke <strong>Tampilan Bos (Mode Pantau Aman)</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-900">
                    Sandi / PIN Admin &amp; Kasir (4–8 Angka)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={loading}
                    value={pinKasir}
                    onChange={(e) => setPinKasir(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono tabular-nums text-lg font-bold tracking-widest text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder="123456"
                  />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Saat input <strong>Sandi Admin</strong> pada layar awal, sistem langsung masuk ke <strong>Tampilan Admin</strong> (operasional penuh).
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 leading-relaxed">
                <strong>Aturan Keamanan Aktif:</strong> Login awal selalu meminta sandi terlebih dahulu, dan apabila sesi akses sudah berjalan <strong>lebih dari 1 jam</strong>, sistem otomatis meminta input sandi ulang.
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEnterPreviewBos();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Lihat Tampilan Bos Sekarang</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEnterPinLockScreen();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Tes Layar Kunci PIN</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan PIN'}</span>
                </button>
              </div>
            </form>
          )}

          {tab === 'info' && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-700">
              <div className="pb-3 border-b border-slate-100 space-y-1.5">
                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Perbandingan Jujur: Kenapa Tadi Diminta Bayar vs Solusi Gratis Murni</span>
                </div>
                <p className="text-slate-600">
                  Berikut alasan mengapa Railway &amp; Render meminta kartu pembayaran, serta mengapa <strong>Vercel.com</strong> menjadi solusi gratis terbaik untuk PT. Wijaya Agro Perkasa:
                </p>
              </div>

              <div className="space-y-3">
                <div className="pb-3 border-b border-slate-100">
                  <div className="font-bold text-slate-900">1. Vercel.com (Paket Hobby) — 100% GRATIS SELAMANYA</div>
                  <p className="text-slate-600 mt-0.5">
                    <strong>Rp 0 / bulan, TIDAK meminta kartu kredit/debit sama sekali</strong>, aktif 24 jam tanpa waktu tidur (langsung terbuka instan di HP Bos), dan otomatis update setiap kali kode GitHub diperbarui. Gunakan panduan di <strong>Tab 1</strong>.
                  </p>
                </div>

                <div className="pb-3 border-b border-slate-100">
                  <div className="font-bold text-slate-900">2. Railway.app — Sekarang Wajib Berbayar ($5/bulan)</div>
                  <p className="text-slate-600 mt-0.5">
                    Railway sudah menghapus paket gratis permanen dan mewajibkan paket <em>Hobby $5/bulan</em> dengan kartu kredit/Visa. Anda <strong>tidak perlu memakai Railway</strong> karena Vercel sudah menjalankan fungsi yang sama secara gratis.
                  </p>
                </div>

                <div>
                  <div className="font-bold text-slate-900">3. Render.com — Meminta Kartu Jika Lewat Menu Blueprint</div>
                  <p className="text-slate-600 mt-0.5">
                    Di Render.com, jika Anda menekan menu <em>Blueprint</em>, sistem Render wajib meminta kartu kredit untuk verifikasi. Selain itu versi gratis Render memiliki jeda tidur 30–50 detik saat lama tidak dibuka. Karena itu <strong>Vercel.com jauh lebih cepat &amp; bebas kartu kredit</strong>.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-slate-500">
                <span>Tes link mode Bos pada jendela aktif saat ini:</span>
                <button
                  type="button"
                  onClick={() => copyText(bosDirectLink, 'bosUrl')}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold cursor-pointer"
                >
                  {copiedField === 'bosUrl' ? 'Link Bos Tersalin!' : 'Salin Link ?mode=bos'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
