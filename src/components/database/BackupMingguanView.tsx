import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  ShieldCheck,
  CalendarClock,
  RefreshCw,
  Download,
  RotateCcw,
  Trash2,
  HardDriveDownload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  LogIn,
  LogOut,
  Save,
  Database,
  X,
} from 'lucide-react';
import { auth } from '../../lib/firebase.ts';
import {
  type WeeklyBackupRecord,
  type BackupSettingsRecord,
  type BackupProgress,
  signInBackupGoogle,
  signOutBackupGoogle,
  getOrCreateBackupSettings,
  saveBackupSettings,
  listWeeklyBackups,
  evaluateWeeklySchedule,
  createWeeklyBackupSnapshot,
  reconstructSnapshotDatabase,
  restoreFromWeeklySnapshot,
  deleteWeeklyBackupSnapshot,
} from '../../services/weeklyBackupService.ts';

interface BackupMingguanViewProps {
  fallbackClientDb: Record<string, any>;
  companyName: string;
  supabaseConfigured: boolean;
  onAfterRestore: () => void;
}

const HARI_OPTIONS = [
  { value: 0, label: 'Minggu' },
  { value: 1, label: 'Senin' },
  { value: 2, label: 'Selasa' },
  { value: 3, label: 'Rabu' },
  { value: 4, label: 'Kamis' },
  { value: 5, label: 'Jumat' },
  { value: 6, label: 'Sabtu' },
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || 'Terjadi kesalahan');
  if (raw.includes('Quota exceeded')) {
    return 'Kuota harian database cadangan tercapai untuk hari ini. Kuota akan otomatis reset besok.';
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) {
      if (String(parsed.error).includes('Quota exceeded')) {
        return 'Kuota harian database cadangan tercapai untuk hari ini. Kuota akan otomatis reset besok.';
      }
      if (String(parsed.error).includes('permission-denied') || String(parsed.error).includes('insufficient permissions')) {
        return 'Akses ditolak oleh aturan keamanan database cadangan. Pastikan akun Google terverifikasi dan muat ulang.';
      }
      return String(parsed.error);
    }
  } catch {
    // Plain error message
  }
  return raw;
}

export const BackupMingguanView: React.FC<BackupMingguanViewProps> = ({
  fallbackClientDb,
  companyName,
  supabaseConfigured,
  onAfterRestore,
}) => {
  const [googleUser, setGoogleUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [signingIn, setSigningIn] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [settings, setSettings] = useState<BackupSettingsRecord | null>(null);
  const [backups, setBackups] = useState<WeeklyBackupRecord[]>([]);

  // Schedule form states
  const [autoWeeklyEnabled, setAutoWeeklyEnabled] = useState<boolean>(true);
  const [intervalDays, setIntervalDays] = useState<number>(7);
  const [preferredDayOfWeek, setPreferredDayOfWeek] = useState<number>(0);
  const [retentionWeeks, setRetentionWeeks] = useState<number>(12);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Manual backup states
  const [manualNote, setManualNote] = useState<string>('');
  const [runningBackup, setRunningBackup] = useState<boolean>(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);

  // Row action states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<WeeklyBackupRecord | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');
  const [restoring, setRestoring] = useState<boolean>(false);

  // Feedback banners
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setGoogleUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const loadBackupVault = useCallback(async (u: User) => {
    setLoading(true);
    setNotice(null);
    try {
      const [cfg, list] = await Promise.all([
        getOrCreateBackupSettings(u),
        listWeeklyBackups(u),
      ]);
      setSettings(cfg);
      setAutoWeeklyEnabled(cfg.autoWeeklyEnabled);
      setIntervalDays(cfg.intervalDays);
      setPreferredDayOfWeek(cfg.preferredDayOfWeek);
      setRetentionWeeks(cfg.retentionWeeks);
      setBackups(list);
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal memuat arsip backup mingguan: ${formatErrorMessage(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authReady && googleUser && googleUser.emailVerified) {
      void loadBackupVault(googleUser);
    } else if (authReady && !googleUser) {
      setSettings(null);
      setBackups([]);
    }
  }, [authReady, googleUser, loadBackupVault]);

  const scheduleInfo = useMemo(() => {
    if (!settings) return null;
    return evaluateWeeklySchedule(settings);
  }, [settings]);

  const completedBackups = useMemo(
    () => backups.filter((b) => b.status === 'COMPLETED'),
    [backups]
  );

  const latestBackup = completedBackups[0] || null;

  const handleSignIn = async () => {
    setSigningIn(true);
    setNotice(null);
    try {
      const user = await signInBackupGoogle();
      setGoogleUser(user);
      setNotice({
        type: 'success',
        text: `Akun Google ${user.email} terhubung ke Database Cadangan Mingguan.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal masuk dengan Google: ${formatErrorMessage(err)}`,
      });
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutBackupGoogle();
    setGoogleUser(null);
    setSettings(null);
    setBackups([]);
    setNotice({
      type: 'info',
      text: 'Sesi akun Google untuk Database Cadangan telah diputus. Operasional Supabase utama tetap berjalan normal.',
    });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleUser) return;
    setSavingSettings(true);
    setNotice(null);
    try {
      const updated = await saveBackupSettings(googleUser, {
        autoWeeklyEnabled,
        intervalDays,
        preferredDayOfWeek,
        retentionWeeks,
      });
      setSettings(updated);
      setNotice({
        type: 'success',
        text: 'Jadwal backup mingguan otomatis dan batas riwayat berhasil disimpan.',
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal menyimpan pengaturan jadwal: ${formatErrorMessage(err)}`,
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRunManualBackup = async () => {
    if (!googleUser || runningBackup) return;
    setRunningBackup(true);
    setNotice(null);
    setProgress({
      phase: 'FETCHING',
      completed: 0,
      total: 1,
      message: 'Memulai snapshot backup ke database cadangan...',
    });
    try {
      const created = await createWeeklyBackupSnapshot(googleUser, {
        triggerMode: 'MANUAL',
        note: manualNote.trim(),
        fallbackClientDb,
        companyName,
        onProgress: (p) => setProgress(p),
      });
      setManualNote('');
      await loadBackupVault(googleUser);
      setNotice({
        type: 'success',
        text: `Snapshot "${created.label}" berhasil tersimpan ke Database Cadangan (${created.totalTransactions.toLocaleString('id-ID')} transaksi, ${formatBytes(created.estimatedBytes)}).`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal membuat snapshot backup: ${formatErrorMessage(err)}`,
      });
    } finally {
      setRunningBackup(false);
      setProgress(null);
    }
  };

  const handleDownloadJson = async (backup: WeeklyBackupRecord) => {
    if (!googleUser || downloadingId) return;
    setDownloadingId(backup.id);
    setNotice(null);
    try {
      const dbObj = await reconstructSnapshotDatabase(googleUser, backup);
      const blob = new Blob([JSON.stringify(dbObj, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeDate = (backup.tanggalWib || backup.weekKey).replace(/\//g, '-');
      a.href = url;
      a.download = `BACKUP_MINGGUAN_${backup.weekKey}_${safeDate}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice({
        type: 'success',
        text: `File JSON arsip "${backup.label}" berhasil diunduh.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal mengunduh arsip JSON: ${formatErrorMessage(err)}`,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteSnapshot = async (backup: WeeklyBackupRecord) => {
    if (!googleUser || deletingId) return;
    setDeletingId(backup.id);
    setNotice(null);
    try {
      await deleteWeeklyBackupSnapshot(googleUser, backup);
      setConfirmDeleteId(null);
      await loadBackupVault(googleUser);
      setNotice({
        type: 'success',
        text: `Arsip snapshot "${backup.label}" berhasil dihapus dari database cadangan.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal menghapus arsip: ${formatErrorMessage(err)}`,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!googleUser || !restoreTarget || restoring) return;
    if (restoreConfirmText.trim().toUpperCase() !== 'PULIHKAN') return;

    setRestoring(true);
    setNotice(null);
    try {
      const res = await restoreFromWeeklySnapshot(googleUser, restoreTarget, {
        fallbackClientDb,
        companyName,
        onProgress: (p) => setProgress(p),
      });
      setRestoreTarget(null);
      setRestoreConfirmText('');
      await loadBackupVault(googleUser);
      onAfterRestore();
      setNotice({
        type: 'success',
        text: `${res.message} Snapshot pengaman kondisi sebelumnya otomatis tersimpan (${res.safetyBackupId}).`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: `Gagal memulihkan database: ${formatErrorMessage(err)}`,
      });
    } finally {
      setRestoring(false);
      setProgress(null);
    }
  };

  const getTriggerBadge = (mode: WeeklyBackupRecord['triggerMode']) => {
    if (mode === 'AUTO_WEEKLY') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Otomatis Mingguan
        </span>
      );
    }
    if (mode === 'PRE_RESTORE_SAFETY') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          Pengaman Pra-Restore
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
        Snapshot Manual
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Backup Mingguan (Database Cadangan)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Arsip snapshot mingguan terpisah dari Supabase utama — seluruh transaksi harian berjalan normal tanpa terpengaruh.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {googleUser ? (
            <>
              <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate max-w-[200px]">{googleUser.email}</span>
              </div>
              <button
                type="button"
                disabled={loading || runningBackup}
                onClick={() => void loadBackupVault(googleUser)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Segarkan</span>
              </button>
              <button
                type="button"
                disabled={runningBackup || restoring}
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-600 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Google</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={signingIn || !authReady}
              onClick={() => void handleSignIn()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{signingIn ? 'Menghubungkan...' : 'Hubungkan Akun Google'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Notice Banner */}
      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : notice.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Clock className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-relaxed font-medium">{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-current opacity-60 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Progress Bar when Running Backup or Restore */}
      {progress && (
        <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 space-y-2.5 shadow-md">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 font-semibold">
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <span>{progress.message}</span>
            </div>
            <span className="font-mono text-emerald-300 font-bold shrink-0">
              {progress.total > 0
                ? `${Math.min(100, Math.round((progress.completed / progress.total) * 100))}%`
                : '...'}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{
                width: `${
                  progress.total > 0
                    ? Math.min(100, Math.max(8, Math.round((progress.completed / progress.total) * 100)))
                    : 20
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Auth Gate when Not Signed In */}
      {!googleUser ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-6 sm:p-8 max-w-3xl mx-auto space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
              <HardDriveDownload className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-slate-900">
                Aktifkan Brankas Backup Mingguan Terpisah
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Masuk dengan akun Google resmi perusahaan untuk mengaktifkan penyimpanan cadangan mingguan terenkripsi. Seluruh operasional harian tetap menggunakan <strong>Supabase Utama</strong> tanpa perubahan.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="font-bold text-slate-900">1. Nol Gangguan Kasir</div>
              <p className="text-slate-600 leading-relaxed">
                Salinan diambil secara read-only di latar belakang sehingga tidak memperlambat atau mengubah data Supabase utama.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="font-bold text-slate-900">2. Jadwal Mingguan Otomatis</div>
              <p className="text-slate-600 leading-relaxed">
                Otomatis menyimpan arsip tiap 7 hari (bisa diatur) dan menyimpan riwayat hingga 12 minggu ke belakang.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <div className="font-bold text-slate-900">3. Restore Aman + Pengaman</div>
              <p className="text-slate-600 leading-relaxed">
                Bisa unduh JSON per minggu atau pulihkan langsung dengan snapshot pengaman otomatis sebelum restore.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Status Database Utama:{' '}
              <strong className={supabaseConfigured ? 'text-emerald-700' : 'text-amber-700'}>
                {supabaseConfigured ? 'Cloud Supabase Aktif' : 'Penyimpanan Server Aktif'}
              </strong>
            </span>
            <button
              type="button"
              disabled={signingIn || !authReady}
              onClick={() => void handleSignIn()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              <span>{signingIn ? 'Membuka Jendela Google...' : 'Masuk dengan Google & Aktifkan'}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Total Arsip Mingguan
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {completedBackups.length}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {settings?.retentionWeeks || 12} maks
                </span>
              </div>
              <div className="text-[11px] text-slate-500">
                Snapshot utuh tersimpan aman
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Backup Terakhir
              </div>
              <div className="text-base font-bold text-slate-900 truncate">
                {latestBackup ? `${latestBackup.tanggalWib} · ${latestBackup.jamWib.slice(0, 5)} WIB` : 'Belum ada'}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium truncate">
                {latestBackup
                  ? `${latestBackup.weekKey} · ${latestBackup.totalTransactions.toLocaleString('id-ID')} transaksi`
                  : 'Klik Backup Sekarang untuk arsip pertama'}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Jadwal Otomatis Berikutnya
              </div>
              <div className="text-base font-bold text-slate-900 truncate">
                {scheduleInfo?.nextBackupDateLabel || 'Memuat...'}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {settings?.autoWeeklyEnabled
                  ? `Setiap ${settings.intervalDays} hari (Target: ${
                      HARI_OPTIONS.find((h) => h.value === settings.preferredDayOfWeek)?.label || 'Minggu'
                    })`
                  : 'Mode manual saja'}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Database Operasional Utama
              </div>
              <div className="text-base font-bold text-emerald-700 flex items-center gap-1.5">
                <Database className="w-4 h-4 shrink-0" />
                <span>{supabaseConfigured ? 'Supabase Aktif' : 'Server Aktif'}</span>
              </div>
              <div className="text-[11px] text-slate-500">
                Transaksi harian terisolasi &amp; aman
              </div>
            </div>
          </div>

          {/* Two-Column Action & Schedule Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Manual Snapshot Card */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                    <HardDriveDownload className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Buat Snapshot Backup Sekarang</h2>
                    <p className="text-[11px] text-slate-500">
                      Salin seluruh data master &amp; transaksi saat ini ke database cadangan.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Snapshot (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={400}
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder="Contoh: Sebelum tutup buku bulan November 2026..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <button
                type="button"
                disabled={runningBackup || restoring}
                onClick={() => void handleRunManualBackup()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
              >
                <HardDriveDownload className="w-4 h-4" />
                <span>{runningBackup ? 'Sedang Menyimpan Snapshot...' : 'Backup Sekarang ke DB Cadangan'}</span>
              </button>
            </div>

            {/* Weekly Schedule Settings Card */}
            <form
              onSubmit={handleSaveSettings}
              className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center shrink-0">
                    <CalendarClock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Pengaturan Jadwal Backup Mingguan</h2>
                    <p className="text-[11px] text-slate-500">
                      Jalan otomatis di latar belakang saat aplikasi dibuka ketika jadwal jatuh tempo.
                    </p>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoWeeklyEnabled}
                    onChange={(e) => setAutoWeeklyEnabled(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    {autoWeeklyEnabled ? 'Otomatis Aktif' : 'Otomatis Nonaktif'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Interval Backup</label>
                  <select
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value={7}>Setiap 7 Hari (Mingguan)</option>
                    <option value={3}>Setiap 3 Hari</option>
                    <option value={14}>Setiap 14 Hari (2 Minggu)</option>
                    <option value={30}>Setiap 30 Hari (Bulanan)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hari Target Mingguan</label>
                  <select
                    value={preferredDayOfWeek}
                    onChange={(e) => setPreferredDayOfWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    {HARI_OPTIONS.map((h) => (
                      <option key={h.value} value={h.value}>
                        Hari {h.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Simpan Riwayat Maks.</label>
                  <select
                    value={retentionWeeks}
                    onChange={(e) => setRetentionWeeks(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold"
                  >
                    <option value={4}>4 Snapshot (~1 Bulan)</option>
                    <option value={8}>8 Snapshot (~2 Bulan)</option>
                    <option value={12}>12 Snapshot (~3 Bulan)</option>
                    <option value={24}>24 Snapshot (~6 Bulan)</option>
                    <option value={52}>52 Snapshot (~1 Tahun)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  {scheduleInfo?.reason || 'Arsip terlama di atas batas simpan akan dibersihkan otomatis.'}
                </span>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingSettings ? 'Menyimpan...' : 'Simpan Jadwal'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Snapshot History Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Riwayat Arsip Snapshot Mingguan ({backups.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Setiap baris menyimpan salinan utuh transaksi, mitra, karyawan, stok, rekening, dan rekap CTR.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                <span>Memuat daftar arsip dari database cadangan...</span>
              </div>
            ) : backups.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <div className="text-sm font-bold text-slate-800">Belum Ada Arsip Backup Mingguan</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Klik tombol <strong>Backup Sekarang ke DB Cadangan</strong> di atas untuk membuat arsip pertama Anda hari ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Waktu &amp; Minggu</th>
                      <th className="py-3 px-4">Label &amp; Catatan</th>
                      <th className="py-3 px-4">Pemicu</th>
                      <th className="py-3 px-4">Ringkasan Isi Data</th>
                      <th className="py-3 px-4 text-right">Ukuran</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {backups.map((b) => {
                      const isIncomplete = b.status !== 'COMPLETED';
                      const isDeletingThis = deletingId === b.id;
                      const isDownloadingThis = downloadingId === b.id;
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-900 font-mono">
                              {b.tanggalWib || '-'}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {b.jamWib ? `${b.jamWib.slice(0, 5)} WIB` : ''} · {b.weekKey}
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-semibold text-slate-900">{b.label}</div>
                            {b.note && (
                              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                                {b.note}
                              </div>
                            )}
                            {isIncomplete && (
                              <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                Upload terhenti (tidak lengkap)
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {getTriggerBadge(b.triggerMode)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 font-mono">
                              <span>
                                <strong className="text-slate-900">{b.totalTransactions.toLocaleString('id-ID')}</strong> Tx
                              </span>
                              <span>
                                <strong className="text-slate-900">{b.totalMitra}</strong> Mitra
                              </span>
                              <span>
                                <strong className="text-slate-900">{b.totalKaryawan}</strong> Kry
                              </span>
                              <span>
                                <strong className="text-slate-900">{b.totalProduk}</strong> Prd
                              </span>
                              <span>
                                <strong className="text-slate-900">{b.totalRekening}</strong> Rek
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-700 whitespace-nowrap">
                            <div>{formatBytes(b.estimatedBytes)}</div>
                            <div className="text-[10px] text-slate-400">{b.totalParts} blok</div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {confirmDeleteId === b.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isDeletingThis}
                                  onClick={() => void handleDeleteSnapshot(b)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                >
                                  {isDeletingThis ? 'Menghapus...' : 'Ya, Hapus'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeletingThis}
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-600 text-[11px] font-semibold cursor-pointer"
                                >
                                  Batal
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                {!isIncomplete && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={Boolean(downloadingId) || runningBackup || restoring}
                                      onClick={() => void handleDownloadJson(b)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                      title="Unduh salinan JSON dari arsip ini"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                      <span>{isDownloadingThis ? '...' : 'JSON'}</span>
                                    </button>
                                    <button
                                      type="button"
                                      disabled={runningBackup || restoring}
                                      onClick={() => {
                                        setRestoreTarget(b);
                                        setRestoreConfirmText('');
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                                      title="Pulihkan database utama ke kondisi arsip minggu ini"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      <span>Pulihkan</span>
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  disabled={runningBackup || restoring}
                                  onClick={() => setConfirmDeleteId(b.id)}
                                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-slate-500 cursor-pointer disabled:opacity-50"
                                  title="Hapus arsip ini"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Restore Confirmation Modal */}
      {restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <h3 className="text-sm font-bold text-amber-950">
                  Konfirmasi Pemulihan (Restore) Database Utama
                </h3>
              </div>
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreTarget(null)}
                className="p-1 text-amber-700 hover:text-amber-950 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-slate-700">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">{restoreTarget.label}</div>
                <div className="font-mono text-[11px] text-slate-600">
                  Tanggal: {restoreTarget.tanggalWib} {restoreTarget.jamWib.slice(0, 5)} WIB · {restoreTarget.weekKey}
                </div>
                <div className="font-mono text-[11px] text-slate-600">
                  Isi: {restoreTarget.totalTransactions.toLocaleString('id-ID')} transaksi, {restoreTarget.totalMitra} mitra, {restoreTarget.totalKaryawan} karyawan, {restoreTarget.totalRekening} rekening
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 leading-relaxed">
                <strong>Pengaman Otomatis Aktif:</strong> Sebelum data utama diganti, sistem akan <strong>otomatis membackup kondisi data berjalan saat ini</strong> terlebih dahulu sebagai <em>Snapshot Pengaman Pra-Restore</em> agar Anda selalu bisa mengembalikannya kapan saja.
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-1.5">
                  Ketik <span className="font-mono font-bold text-rose-700">PULIHKAN</span> untuk melanjutkan:
                </label>
                <input
                  type="text"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="Ketik PULIHKAN"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-sm uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setRestoreTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={restoring || restoreConfirmText.trim().toUpperCase() !== 'PULIHKAN'}
                onClick={() => void handleConfirmRestore()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
                <span>{restoring ? 'Memulihkan Database...' : 'Ya, Pulihkan Sekarang'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
