import React, { useState, useEffect } from 'react';
import {
  Database,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  ArrowDownToLine,
  Copy,
  Check,
  Code2,
  HelpCircle,
  CheckCheck,
} from 'lucide-react';
import { api } from '../../api/client.ts';

interface SupabaseSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessRefresh?: () => void;
}

export const SupabaseSyncModal: React.FC<SupabaseSyncModalProps> = ({
  isOpen,
  onClose,
  onSuccessRefresh,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [syncingPush, setSyncingPush] = useState<boolean>(false);
  const [syncingPull, setSyncingPull] = useState<boolean>(false);
  const [confirmPull, setConfirmPull] = useState<boolean>(false);

  const [status, setStatus] = useState<{
    configured: boolean;
    url: string;
    fullUrl: string;
    hasKey: boolean;
    keyPreview: string;
    autoSync: boolean;
    lastSyncTime: string | null;
    lastSyncStatus: 'SUCCESS' | 'ERROR' | null;
    lastSyncMessage: string | null;
  } | null>(null);

  const [inputUrl, setInputUrl] = useState<string>('');
  const [inputKey, setInputKey] = useState<string>('');
  const [inputAutoSync, setInputAutoSync] = useState<boolean>(true);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [showSqlSchema, setShowSqlSchema] = useState<boolean>(false);
  const [sqlSchema, setSqlSchema] = useState<string>('');
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getSupabaseStatus();
      setStatus(data);
      const localUrl = localStorage.getItem('wijaya_agro_supabase_url') || '';
      const localKey = localStorage.getItem('wijaya_agro_supabase_key') || '';

      if (data.fullUrl) {
        setInputUrl(data.fullUrl);
      } else if (localUrl) {
        setInputUrl(localUrl);
      }

      if (!data.hasKey && localKey) {
        setInputKey(localKey);
      }

      setInputAutoSync(data.autoSync);
    } catch (err: any) {
      console.warn('Gagal memuat status Supabase:', err);
      const localUrl = localStorage.getItem('wijaya_agro_supabase_url') || '';
      const localKey = localStorage.getItem('wijaya_agro_supabase_key') || '';
      if (localUrl) setInputUrl(localUrl);
      if (localKey) setInputKey(localKey);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

function cleanSupabaseClientUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (dashboardMatch) return `https://${dashboardMatch[1]}.supabase.co`;
  const coMatch = url.match(/([a-z0-9_-]+)\.supabase\.co/i);
  if (coMatch) return `https://${coMatch[1]}.supabase.co`;
  if (/^[a-z0-9]{15,30}$/i.test(url)) return `https://${url}.supabase.co`;
  url = url.replace(/\/rest\/v1.*$/i, '').replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackMsg(null);
    setTestResult(null);

    const cleanUrl = cleanSupabaseClientUrl(inputUrl);
    const cleanKey = inputKey.trim() || localStorage.getItem('wijaya_agro_supabase_key') || '';

    if (!cleanUrl) {
      setFeedbackMsg({ type: 'error', message: 'Project URL Supabase wajib diisi' });
      return;
    }
    if (!cleanKey && !status?.hasKey) {
      setFeedbackMsg({ type: 'error', message: 'API Key Supabase (anon public atau service_role) wajib diisi' });
      return;
    }

    // Auto-update input with cleaned base URL
    setInputUrl(cleanUrl);

    setSubmitting(true);
    try {
      const res = await api.updateSupabaseConfig({
        url: cleanUrl,
        key: cleanKey || (status?.hasKey ? '' : cleanKey),
        autoSync: inputAutoSync,
      });

      // Persist in browser localStorage for resiliency across container restarts
      localStorage.setItem('wijaya_agro_supabase_url', cleanUrl);
      if (cleanKey) {
        localStorage.setItem('wijaya_agro_supabase_key', cleanKey);
      }

      setStatus(res.data);
      setTestResult(res.testResult);

      if (res.testResult?.success) {
        setFeedbackMsg({
          type: 'success',
          message: res.testResult.message || 'Konfigurasi Supabase berhasil disimpan! Database otomatis tersinkron.',
        });
        onSuccessRefresh?.();
      } else {
        setFeedbackMsg({
          type: 'error',
          message: res.testResult?.message || 'Gagal terhubung ke Supabase. Periksa kembali URL dan API Key.',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        message: err.message || 'Gagal menyimpan konfigurasi Supabase',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestConnection = async () => {
    setSubmitting(true);
    setTestResult(null);
    try {
      const res = await api.testSupabaseConnection();
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Koneksi gagal' });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePushData = async () => {
    setSyncingPush(true);
    setFeedbackMsg(null);
    try {
      const res = await api.pushToSupabase();
      setFeedbackMsg({
        type: 'success',
        message: `✅ ${res.message || 'Data ERP berhasil diunggah & disimpan permanen di Supabase!'}`,
      });
      loadStatus();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        message: err.message || 'Gagal mengunggah data ke Supabase',
      });
    } finally {
      setSyncingPush(false);
    }
  };

  const handlePullData = async () => {
    setConfirmPull(false);
    setSyncingPull(true);
    setFeedbackMsg(null);
    try {
      const res = await api.pullFromSupabase();
      setFeedbackMsg({
        type: 'success',
        message: `${res.message || 'Berhasil menarik data terbaru dari Cloud Supabase!'}`,
      });
      loadStatus();
      onSuccessRefresh?.();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        message: err.message || 'Gagal menarik data dari Supabase',
      });
    } finally {
      setSyncingPull(false);
    }
  };

  const handleLoadSqlSchema = async () => {
    try {
      const sql = await api.getSupabaseSqlSchema();
      setSqlSchema(sql);
      setShowSqlSchema(true);
    } catch (err) {
      console.warn('Gagal memuat SQL schema:', err);
    }
  };

  const handleCopySql = () => {
    if (!sqlSchema) return;
    navigator.clipboard.writeText(sqlSchema).then(() => {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2500);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-emerald-800/80 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh] animate-in fade-in my-6">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950 via-zinc-900 to-teal-950 border-b border-emerald-800/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-900/60 text-emerald-300 rounded-xl border border-emerald-700">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                  <span>Integrasi &amp; Auto-Sinkron Supabase</span>
                  <span className="text-[10px] bg-emerald-900/90 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-700 uppercase">
                    Cloud PostgreSQL
                  </span>
                </h2>
              </div>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                Simpan database ERP secara permanen di cloud Supabase dengan auto-sync otomatis 24/7
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
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {feedbackMsg && (
            <div
              className={`p-3.5 rounded-xl border flex items-center space-x-2.5 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                  : 'bg-rose-950/80 border-rose-700 text-rose-200'
              }`}
            >
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span className="font-medium">{feedbackMsg.message}</span>
            </div>
          )}

          {/* Connection Status Card */}
          <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-zinc-400 font-semibold">Status Supabase:</span>
                {status?.configured ? (
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px] font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Auto-Connect Aktif ke Cloud Supabase</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-800 text-[11px] font-bold">
                    <span>Belum Dikonfigurasi</span>
                  </span>
                )}
              </div>
              {status?.url && (
                <div className="text-[11px] text-zinc-400 font-mono">
                  Project: <span className="text-zinc-200">{status.url}</span>
                </div>
              )}
              {status?.lastSyncTime && (
                <div className="text-[10px] text-zinc-400">
                  Sinkronisasi Terakhir: <span className="text-emerald-300 font-mono">{new Date(status.lastSyncTime).toLocaleString('id-ID')}</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {status?.configured && (
                <>
                  <button
                    type="button"
                    onClick={handlePushData}
                    disabled={syncingPush}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold cursor-pointer transition-colors shadow-xs"
                    title="Kirim seluruh data lokal (karyawan, mitra, transaksi) ke Supabase"
                  >
                    <ArrowUpRight className={`w-3.5 h-3.5 ${syncingPush ? 'animate-spin' : ''}`} />
                    <span>{syncingPush ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}</span>
                  </button>

                  {confirmPull ? (
                    <div className="flex items-center gap-1.5 bg-zinc-900 border border-teal-600/70 rounded-lg px-2 py-1">
                      <span className="text-[11px] text-teal-200 font-semibold">Tarik dari Cloud?</span>
                      <button
                        type="button"
                        onClick={handlePullData}
                        disabled={syncingPull}
                        className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold cursor-pointer"
                      >
                        Ya, Tarik
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPull(false)}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] cursor-pointer"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmPull(true)}
                      disabled={syncingPull}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold border border-zinc-700 cursor-pointer transition-colors"
                      title="Tarik data terbaru dari Supabase ke seluruh modul aplikasi"
                    >
                      <ArrowDownToLine className={`w-3.5 h-3.5 ${syncingPull ? 'animate-spin text-emerald-400' : ''}`} />
                      <span>{syncingPull ? 'Menarik...' : 'Tarik dari Supabase'}</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={submitting || !status?.configured}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 border border-zinc-700 font-semibold cursor-pointer"
              >
                Test Koneksi
              </button>
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center space-x-2 ${
                testResult.success
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Form Konfigurasi Kredensial Supabase */}
          <form onSubmit={handleSaveConfig} className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-800 space-y-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-bold text-zinc-200 flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Kredensial Project Supabase Anda:</span>
              </span>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-emerald-400 hover:underline flex items-center space-x-1"
              >
                <span>Buka Dashboard Supabase</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                Project URL Supabase: <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="Contoh: https://abcdefghijklm.supabase.co"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
                required
              />
              <span className="text-[10px] text-zinc-400 mt-0.5 block">
                Salin Project URL dasar dari: Dashboard Supabase → Project Settings → API → Project URL (Contoh: <code className="text-emerald-300">https://xxxx.supabase.co</code>). Sistem otomatis membersihkan jika terdapat akhiran <code className="text-amber-300">/rest/v1</code>.
              </span>
            </div>

            <div>
              <label className="block text-zinc-300 font-semibold mb-1">
                API Key (anon public atau service_role): <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder={status?.hasKey ? `(Tersimpan: ${status.keyPreview}) Ketik ulang jika ingin mengganti` : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 font-mono text-xs focus:outline-hidden focus:border-emerald-500"
              />
              <span className="text-[10px] text-zinc-400 mt-0.5 block">
                Dapat dilihat di: Dashboard Supabase → Project Settings → API → Project API Keys (anon public)
              </span>
            </div>

            <div className="pt-1">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inputAutoSync}
                  onChange={(e) => setInputAutoSync(e.target.checked)}
                  className="rounded border-zinc-700 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-zinc-200 font-semibold">
                  ⚡ Auto-Sync Realtime Aktif
                </span>
              </label>
              <p className="text-[11px] text-zinc-400 ml-6 mt-0.5">
                Setiap kali Anda menambah karyawan, mencatat gaji, atau kasir melakukan transaksi, data otomatis tersimpan langsung ke Supabase tanpa perlu klik manual.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={handleLoadSqlSchema}
                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center space-x-1.5 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>Lihat Skrip SQL Tabel Supabase</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Menghubungkan...' : 'Simpan & Hubungkan Supabase'}
              </button>
            </div>
          </form>

          {/* Quick Guide */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="font-bold text-zinc-200 flex items-center space-x-1.5">
              <HelpCircle className="w-4 h-4 text-sky-400" />
              <span>Panduan Cepat Menghubungkan Akun Supabase (30 Detik):</span>
            </span>
            <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-400 leading-relaxed">
              <li>
                Buka <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline">supabase.com</a> dan login dengan Akun Google Anda.
              </li>
              <li>
                Klik <strong>New Project</strong> (beri nama misal <em>wijaya-agro-erp</em>, pilih region <em>Singapore</em>).
              </li>
              <li>
                Setelah project siap, klik menu <strong>Project Settings (ikon gir)</strong> di pojok kiri bawah → klik <strong>API</strong>.
              </li>
              <li>
                Salin <strong>Project URL</strong> dan <strong>anon public key</strong>, lalu tempel ke form di atas dan klik <em>Simpan &amp; Hubungkan</em>.
              </li>
              <li>
                Sistem akan otomatis mengunggah seluruh data (23 Karyawan, Mitra, Rekening, Kasir) dan menjaga sinkronisasi real-time secara permanen!
              </li>
            </ol>
          </div>

          {/* SQL Editor Schema Drawer */}
          {showSqlSchema && (
            <div className="p-4 bg-zinc-950 rounded-xl border border-emerald-900/80 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-300 flex items-center space-x-1.5">
                  <Code2 className="w-4 h-4 text-emerald-400" />
                  <span>Skrip SQL Tabel Supabase (Opsional):</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] font-semibold border border-zinc-700 cursor-pointer"
                  >
                    {copiedSql ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                    <span>{copiedSql ? 'Tersalin!' : 'Salin SQL'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSqlSchema(false)}
                    className="text-zinc-400 hover:text-white text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-zinc-400">
                Salin dan jalankan skrip di bawah pada <strong>Supabase Dashboard → SQL Editor → New Query → Run</strong> untuk membuat tabel terstruktur.
              </p>
              <pre className="p-3 bg-zinc-900 rounded-lg text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-48 border border-zinc-800">
                {sqlSchema}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Data terlindungi dengan PostgreSQL ACID Compliance &amp; enkripsi Supabase</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
