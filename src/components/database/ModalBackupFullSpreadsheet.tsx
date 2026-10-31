import React, { useState, useEffect, useMemo } from 'react';
import type { User } from 'firebase/auth';
import {
  X,
  FileSpreadsheet,
  Download,
  Upload,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Database,
  LogOut,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Link2,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  initGoogleSheetsAuth,
  googleSheetsSignIn,
  getGoogleSheetsAccessToken,
  clearGoogleSheetsCachedToken,
  getCurrentGoogleUser,
  googleSheetsSignOut,
} from '../../utils/googleSheetsAuth.ts';
import {
  buildFullErpSpreadsheetSheets,
  countTotalErpRecords,
  createNewGoogleSpreadsheetBackup,
  downloadFullBackupJsonInBrowser,
  downloadFullBackupXlsxInBrowser,
  extractGoogleSpreadsheetId,
  fetchGoogleSpreadsheetMetadata,
  getEmergencySnapshotMetadata,
  getSavedGoogleSheetHistory,
  getSavedGoogleSheetTarget,
  loadEmergencyLocalSnapshot,
  overwriteExistingGoogleSpreadsheetBackup,
  saveEmergencyLocalSnapshot,
  type EmergencyCacheMetadata,
  type FullBackupBundlePayload,
  type GoogleSheetMetadataSummary,
  type SavedGoogleSheetTarget,
} from '../../utils/fullBackupSpreadsheet.ts';
import { formatRupiah } from '../../utils/format.ts';

interface ModalBackupFullSpreadsheetProps {
  isOpen: boolean;
  onClose: () => void;
  fallbackClientDb?: Record<string, any> | null;
  companyName?: string;
  allowRestore?: boolean;
  onAfterRestore?: () => void;
}

export const ModalBackupFullSpreadsheet: React.FC<ModalBackupFullSpreadsheetProps> = ({
  isOpen,
  onClose,
  fallbackClientDb,
  companyName = 'PT. WIJAYA AGRO PERKASA',
  allowRestore = true,
  onAfterRestore,
}) => {
  // Bundle & emergency state
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [activeBundle, setActiveBundle] = useState<FullBackupBundlePayload | null>(null);
  const [emergencyMeta, setEmergencyMeta] = useState<EmergencyCacheMetadata | null>(null);
  const [serverErrorNote, setServerErrorNote] = useState<string>('');
  const [showTabBreakdown, setShowTabBreakdown] = useState(false);

  // Google Auth state (in-memory token managed by googleSheetsAuth.ts)
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  // Google Sheets export state
  const [sheetMode, setSheetMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [customSheetTitle, setCustomSheetTitle] = useState('');
  const [targetSpreadsheetInput, setTargetSpreadsheetInput] = useState('');
  const [savedTarget, setSavedTarget] = useState<SavedGoogleSheetTarget | null>(null);
  const [savedHistory, setSavedHistory] = useState<SavedGoogleSheetTarget[]>([]);

  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const [exportProgressText, setExportProgressText] = useState('');
  const [sheetsResult, setSheetsResult] = useState<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    title: string;
    sheetCount: number;
    totalRowsWritten: number;
    mode: 'NEW' | 'EXISTING';
  } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Mandatory Confirmation Dialog before overwriting an existing Google Sheet
  const [pendingOverwriteConfirm, setPendingOverwriteConfirm] = useState<{
    metadata: GoogleSheetMetadataSummary;
    sheetCount: number;
    totalRecords: number;
  } | null>(null);
  const [isCheckingMetadata, setIsCheckingMetadata] = useState(false);

  // Feedback banners
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [successBanner, setSuccessBanner] = useState<string>('');

  // JSON Restore confirmation state
  const [pendingRestoreFile, setPendingRestoreFile] = useState<{
    fileName: string;
    parsedData: Record<string, any>;
    totalRecords: number;
  } | null>(null);
  const [isRestoringJson, setIsRestoringJson] = useState(false);

  // Initialize Firebase Google Auth listener
  useEffect(() => {
    const unsub = initGoogleSheetsAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsAuth(false);
      },
      () => {
        setGoogleUser(getCurrentGoogleUser());
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const loadBestAvailableBackupBundle = async () => {
    setLoadingBundle(true);
    setErrorBanner('');
    setServerErrorNote('');

    const target = getSavedGoogleSheetTarget();
    setSavedTarget(target);
    setSavedHistory(getSavedGoogleSheetHistory());
    if (target && !targetSpreadsheetInput) {
      setTargetSpreadsheetInput(target.spreadsheetUrl);
    }
    setEmergencyMeta(getEmergencySnapshotMetadata());

    try {
      // 1. Primary path: Live full bundle from backend
      const live = await api.getFullBackupBundle();
      setActiveBundle(live);
      await saveEmergencyLocalSnapshot(live.db, live.rekapMitra);
      setEmergencyMeta(getEmergencySnapshotMetadata());
    } catch (liveErr: any) {
      // 2. Anti-Hang / Maintenance fallback: Browser IndexedDB / LocalStorage emergency cache or active React state
      const cached = await loadEmergencyLocalSnapshot();
      if (cached?.bundle?.db && countTotalErpRecords(cached.bundle.db) > 0) {
        setActiveBundle(cached.bundle);
        setEmergencyMeta(cached.meta);
        setServerErrorNote(
          'Server sedang sibuk / hang / maintenance. Sistem otomatis mengaktifkan Mode Penyelamatan Darurat dari Cache Lokal Browser agar Anda tetap bisa melarikan seluruh data ke Spreadsheet atau mengunduh Excel/JSON.'
        );
      } else if (fallbackClientDb && countTotalErpRecords(fallbackClientDb) > 0) {
        setActiveBundle({
          db: fallbackClientDb,
          rekapMitra: null,
          source: 'CLIENT_STATE',
        });
        setServerErrorNote(
          'Menggunakan data memori aktif aplikasi karena koneksi ke server sedang terganggu. Seluruh data di layar siap di-backup ke Spreadsheet.'
        );
      } else {
        setErrorBanner(
          liveErr?.message ||
            'Belum dapat memuat data backup dari server maupun cache lokal. Periksa jaringan lalu coba lagi.'
        );
      }
    } finally {
      setLoadingBundle(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const nowStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(new Date())
      .replace(/\./g, ':');
    setCustomSheetTitle(`BACKUP FULL ${companyName.toUpperCase()} - ${nowStr} WIB`);
    setSheetsResult(null);
    setPendingOverwriteConfirm(null);
    setPendingRestoreFile(null);
    setSuccessBanner('');
    setErrorBanner('');
    void loadBestAvailableBackupBundle();
  }, [isOpen, companyName]);

  const preparedTabs = useMemo(() => {
    if (!activeBundle) return [];
    return buildFullErpSpreadsheetSheets(activeBundle);
  }, [activeBundle]);

  const totalRecords = useMemo(
    () => (activeBundle ? countTotalErpRecords(activeBundle.db) : 0),
    [activeBundle]
  );

  const summaryMetrics = useMemo(() => {
    if (!activeBundle?.db) {
      return {
        likuiditasKasBank: 0,
        uangKitaDiMitra: 0,
        nominalNotaKunci: 0,
      };
    }
    const rekArr: any[] = Array.isArray(activeBundle.db.rekening) ? activeBundle.db.rekening : [];
    const kas01 = rekArr
      .filter((r) => r && r.kode === 'KAS01')
      .reduce((s, r) => s + (Number(r.saldoSaatIni) || 0), 0);
    const bankPt = rekArr
      .filter(
        (r) =>
          r &&
          (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !String(r.kode || '').startsWith('REK-'))) &&
          r.kode !== 'KAS01' &&
          r.status === 'AKTIF'
      )
      .reduce((s, r) => s + (Number(r.saldoSaatIni) || 0), 0);

    const uangKita =
      activeBundle.rekapMitra?.uangKitaDiMitra ??
      (Number(
        activeBundle.rekapMitra?.totalSeluruhPiutangMitra ??
          activeBundle.rekapMitra?.totalBonMitra ??
          0
      ) -
        Number(
          activeBundle.rekapMitra?.totalNotaSupplierRekeningMitra ??
            activeBundle.rekapMitra?.totalHutangPerusahaanKeMitra ??
            0
        ));
    const notaKunci = Number(activeBundle.rekapMitra?.totalNominalNotaNgunci || 0);

    return {
      likuiditasKasBank: kas01 + bankPt,
      uangKitaDiMitra: uangKita,
      nominalNotaKunci: notaKunci,
    };
  }, [activeBundle]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setErrorBanner('');
    setIsSigningInGoogle(true);
    try {
      const res = await googleSheetsSignIn();
      if (res) {
        setGoogleUser(res.user);
        setNeedsAuth(false);
        setSuccessBanner(`Terhubung ke Google Sheets sebagai ${res.user.email || res.user.displayName || 'Pengguna Google'}.`);
      }
    } catch (err: any) {
      setErrorBanner(
        err?.message || 'Gagal masuk ke akun Google. Pastikan jendela pop-up login Google tidak diblokir browser.'
      );
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleLogout = async () => {
    await googleSheetsSignOut();
    setGoogleUser(null);
    setNeedsAuth(true);
    setPendingOverwriteConfirm(null);
  };

  const handleCreateNewGoogleSheet = async () => {
    if (!activeBundle) return;
    setErrorBanner('');
    setSuccessBanner('');
    setSheetsResult(null);

    const token = await getGoogleSheetsAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setErrorBanner('Silakan klik tombol "Sign in with Google" terlebih dahulu untuk mengirim backup ke Google Sheets.');
      return;
    }

    setIsExportingSheets(true);
    setExportProgressText('Menghubungi Google Sheets API...');
    try {
      const created = await createNewGoogleSpreadsheetBackup(
        token,
        activeBundle,
        customSheetTitle,
        (msg) => setExportProgressText(msg)
      );
      setSheetsResult({
        ...created,
        mode: 'NEW',
      });
      setSavedTarget(getSavedGoogleSheetTarget());
      setSavedHistory(getSavedGoogleSheetHistory());
      setTargetSpreadsheetInput(created.spreadsheetUrl);
      setSuccessBanner(
        `Berhasil membuat Google Spreadsheet baru (${created.sheetCount} Tab, ${created.totalRowsWritten.toLocaleString(
          'id-ID'
        )} baris data)!`
      );
    } catch (err: any) {
      if (err?.status === 401) {
        clearGoogleSheetsCachedToken();
        setNeedsAuth(true);
      }
      setErrorBanner(err?.message || 'Gagal membuat Google Spreadsheet baru.');
    } finally {
      setIsExportingSheets(false);
      setExportProgressText('');
    }
  };

  const handlePrepareOverwriteExistingSheet = async () => {
    if (!activeBundle) return;
    setErrorBanner('');
    setSuccessBanner('');

    const cleanId = extractGoogleSpreadsheetId(targetSpreadsheetInput);
    if (!cleanId) {
      setErrorBanner(
        'Masukkan Link URL Google Spreadsheet (contoh: https://docs.google.com/spreadsheets/d/...) atau ID Spreadsheet yang valid.'
      );
      return;
    }

    const token = await getGoogleSheetsAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setErrorBanner('Silakan klik tombol "Sign in with Google" terlebih dahulu.');
      return;
    }

    setIsCheckingMetadata(true);
    try {
      const metadata = await fetchGoogleSpreadsheetMetadata(token, cleanId);
      setPendingOverwriteConfirm({
        metadata,
        sheetCount: preparedTabs.length,
        totalRecords,
      });
    } catch (err: any) {
      if (err?.status === 401) {
        clearGoogleSheetsCachedToken();
        setNeedsAuth(true);
      }
      setErrorBanner(err?.message || 'Gagal memeriksa Google Spreadsheet tujuan.');
    } finally {
      setIsCheckingMetadata(false);
    }
  };

  const handleConfirmExecuteOverwriteSheet = async () => {
    if (!activeBundle || !pendingOverwriteConfirm) return;
    const targetId = pendingOverwriteConfirm.metadata.spreadsheetId;
    setPendingOverwriteConfirm(null);
    setErrorBanner('');
    setSuccessBanner('');
    setSheetsResult(null);

    const token = await getGoogleSheetsAccessToken();
    if (!token) {
      setNeedsAuth(true);
      setErrorBanner('Sesi Google berakhir. Silakan Sign in with Google kembali.');
      return;
    }

    setIsExportingSheets(true);
    setExportProgressText('Memulai pembaruan Google Spreadsheet...');
    try {
      const updated = await overwriteExistingGoogleSpreadsheetBackup(
        token,
        targetId,
        activeBundle,
        (msg) => setExportProgressText(msg)
      );
      setSheetsResult({
        ...updated,
        mode: 'EXISTING',
      });
      setSavedTarget(getSavedGoogleSheetTarget());
      setSavedHistory(getSavedGoogleSheetHistory());
      setSuccessBanner(
        `Berhasil memperbarui Google Spreadsheet "${updated.title}" (${updated.sheetCount} Tab, ${updated.totalRowsWritten.toLocaleString(
          'id-ID'
        )} baris)!`
      );
    } catch (err: any) {
      if (err?.status === 401) {
        clearGoogleSheetsCachedToken();
        setNeedsAuth(true);
      }
      setErrorBanner(err?.message || 'Gagal memperbarui Google Spreadsheet.');
    } finally {
      setIsExportingSheets(false);
      setExportProgressText('');
    }
  };

  const handleDownloadXlsx = () => {
    if (!activeBundle) return;
    setErrorBanner('');
    try {
      const fname = downloadFullBackupXlsxInBrowser(activeBundle);
      setSuccessBanner(
        `File Spreadsheet Excel 21-Sheet (${fname}) berhasil diunduh ke perangkat Anda. File ini dapat langsung dibuka di Microsoft Excel maupun diunggah ke Google Sheets.`
      );
    } catch (err: any) {
      setErrorBanner(err?.message || 'Gagal membuat file Excel (.xlsx).');
    }
  };

  const handleDownloadJson = () => {
    if (!activeBundle?.db) return;
    setErrorBanner('');
    try {
      const fname = downloadFullBackupJsonInBrowser(activeBundle.db);
      setSuccessBanner(
        `File Cadangan Penuh Database JSON (${fname}) termasuk bukti foto nota berhasil diunduh.`
      );
    } catch (err: any) {
      setErrorBanner(err?.message || 'Gagal mengunduh file JSON.');
    }
  };

  const handleSelectRestoreJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorBanner('');
    setSuccessBanner('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.rekening) && !Array.isArray(parsed.mitra))) {
        throw new Error('Format file JSON tidak dikenali sebagai cadangan ERP Wijaya Agro.');
      }
      setPendingRestoreFile({
        fileName: file.name,
        parsedData: parsed,
        totalRecords: countTotalErpRecords(parsed),
      });
    } catch (err: any) {
      setErrorBanner(err?.message || 'File JSON tidak valid.');
    }
  };

  const handleConfirmExecuteRestoreJson = async () => {
    if (!pendingRestoreFile) return;
    setIsRestoringJson(true);
    setErrorBanner('');
    try {
      const res = await api.restoreDatabaseJson(pendingRestoreFile.parsedData);
      setPendingRestoreFile(null);
      setSuccessBanner(res.message || 'Seluruh data berhasil dipulihkan dari file cadangan JSON!');
      await loadBestAvailableBackupBundle();
      onAfterRestore?.();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Gagal memulihkan database dari JSON.');
    } finally {
      setIsRestoringJson(false);
    }
  };

  const handleCopySheetUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    });
  };

  const isEmergencyMode =
    activeBundle?.source === 'EMERGENCY_CACHE' || activeBundle?.source === 'CLIENT_STATE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Top Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-zinc-950 text-white border-b border-zinc-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white truncate">
                Pusat Backup Full &amp; Larikan ke Google Spreadsheet
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Proteksi menyeluruh 21 tabel ERP terhadap kondisi server hang, gangguan jaringan, atau maintenance
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadBestAvailableBackupBundle()}
              disabled={loadingBundle || isExportingSheets}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              title="Muat ulang snapshot data terbaru"
            >
              <RefreshCw className={`w-4 h-4 ${loadingBundle ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Tutup modal backup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 bg-slate-50/70">
          {/* Status Kesiapan Data & Cache Darurat Anti-Hang */}
          <div
            className={`rounded-2xl border p-4 ${
              isEmergencyMode
                ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isEmergencyMode
                      ? 'bg-amber-100 border-amber-300 text-amber-800'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  }`}
                >
                  {isEmergencyMode ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className="text-xs sm:text-sm font-bold flex flex-wrap items-center gap-x-2">
                    <span>
                      {loadingBundle
                        ? 'Menyiapkan seluruh paket data ERP...'
                        : isEmergencyMode
                        ? 'Mode Penyelamatan Darurat Aktif (Anti-Hang / Maintenance)'
                        : 'Snapshot Data Real-Time Siap Di-Backup'}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono tabular-nums text-emerald-700">
                      {totalRecords.toLocaleString('id-ID')} Total Record
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="font-mono tabular-nums text-slate-600">
                      {preparedTabs.length || 21} Sheet Lengkap
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {serverErrorNote ||
                      (emergencyMeta
                        ? `Cache Darurat Otomatis di perangkat ini tersimpan pada ${emergencyMeta.savedAtLabel}. Jika sewaktu-waktu terjadi hang atau maintenance, Anda tetap dapat mengunduh Excel / melarikan data ke Google Spreadsheet dari perangkat ini.`
                        : 'Sistem otomatis menyimpan salinan cadangan darurat di browser setiap kali data dimuat.')}
                  </p>
                </div>
              </div>
            </div>

            {/* Key Financial Verification Strip inside Backup */}
            {activeBundle && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3.5 pt-3.5 border-t border-slate-200/80 text-xs">
                <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500">Total Kas &amp; Bank PT</div>
                  <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                    {formatRupiah(summaryMetrics.likuiditasKasBank)}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500">Uang Kita di Mitra (Piutang − Hutang)</div>
                  <div className="font-mono tabular-nums font-bold text-emerald-800 mt-0.5">
                    {formatRupiah(summaryMetrics.uangKitaDiMitra)}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
                  <div className="text-[11px] text-slate-500">Nominal Nota Kunci (Tak Kembali)</div>
                  <div className="font-mono tabular-nums font-bold text-rose-700 mt-0.5">
                    {formatRupiah(summaryMetrics.nominalNotaKunci)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback Banners */}
          {errorBanner && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-900 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorBanner('')}
                className="text-rose-500 hover:text-rose-800 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successBanner && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-950 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-semibold leading-relaxed">{successBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessBanner('')}
                className="text-emerald-600 hover:text-emerald-900 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ===================================================================== */}
          {/* OPSI UTAMA 1: LARIKAN LANGSUNG KE GOOGLE SHEETS (CLOUD SPREADSHEET)   */}
          {/* ===================================================================== */}
          <div className="bg-white rounded-2xl border border-emerald-200/90 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 bg-emerald-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-300">
                  Jalur Utama 1 · Cloud Google Workspace
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                  Larikan Langsung ke Google Sheets (21 Tab Otomatis)
                </h3>
              </div>

              {/* Google Account Connection State / Official Sign in with Google Button */}
              {needsAuth ? (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSigningInGoogle}
                  className="inline-flex items-center gap-3 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs text-xs sm:text-sm font-medium transition-colors cursor-pointer disabled:opacity-60 self-start sm:self-center"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-4 h-4 shrink-0 block"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                  <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-emerald-900/80 border border-emerald-700/80 rounded-xl px-3 py-1.5 text-xs">
                  <span className="text-emerald-200 truncate max-w-[200px]">
                    {googleUser?.email || googleUser?.displayName || 'Akun Google Aktif'}
                  </span>
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="p-1 rounded-lg hover:bg-emerald-800 text-emerald-300 hover:text-white transition-colors cursor-pointer"
                    title="Keluar / Ganti Akun Google"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="p-5 space-y-4">
              {needsAuth && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs text-slate-700 leading-relaxed">
                    Hubungkan akun Google Anda terlebih dahulu agar sistem dapat membuat atau memperbarui file{' '}
                    <strong>Google Spreadsheet</strong> langsung di akun Google Anda (dengan izin pengguna).
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={isSigningInGoogle}
                    className="inline-flex items-center justify-center gap-2.5 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-2xs text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      className="w-4 h-4 shrink-0 block"
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                  </button>
                </div>
              )}

              {/* Mode Switcher: Buat File Baru vs Update Link Spreadsheet Tetap */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSheetMode('NEW');
                    setPendingOverwriteConfirm(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left sm:text-center ${
                    sheetMode === 'NEW'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  1. Buat File Google Spreadsheet Baru
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetMode('EXISTING');
                    setPendingOverwriteConfirm(null);
                  }}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer text-left sm:text-center ${
                    sheetMode === 'EXISTING'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2. Update ke Link Spreadsheet Tetap
                </button>
              </div>

              {sheetMode === 'NEW' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Judul File Google Spreadsheet Baru
                    </label>
                    <input
                      type="text"
                      value={customSheetTitle}
                      onChange={(e) => setCustomSheetTitle(e.target.value)}
                      placeholder="BACKUP FULL PT WIJAYA AGRO PERKASA..."
                      className="w-full px-3.5 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Membuat file baru di Google Sheets Anda berisi 21 tab rapi (Rekening, Saldo Mitra, Nota Kunci, Stok, Kasir, Gaji, Audit).
                    </p>
                    <button
                      type="button"
                      onClick={handleCreateNewGoogleSheet}
                      disabled={isExportingSheets || loadingBundle || !activeBundle}
                      className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {isExportingSheets ? 'Mengirim ke Google Sheets...' : 'Buat & Larikan ke Google Sheets'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Link URL atau ID Google Spreadsheet Tujuan
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={targetSpreadsheetInput}
                        onChange={(e) => {
                          setTargetSpreadsheetInput(e.target.value);
                          setPendingOverwriteConfirm(null);
                        }}
                        placeholder="Tempel link https://docs.google.com/spreadsheets/d/... di sini"
                        className="flex-1 px-3.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                      <button
                        type="button"
                        onClick={handlePrepareOverwriteExistingSheet}
                        disabled={
                          isCheckingMetadata ||
                          isExportingSheets ||
                          loadingBundle ||
                          !activeBundle ||
                          !targetSpreadsheetInput.trim()
                        }
                        className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        <Link2 className="w-4 h-4 text-emerald-400" />
                        <span>
                          {isCheckingMetadata
                            ? 'Memeriksa File...'
                            : 'Periksa & Update Spreadsheet Ini'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {savedHistory.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500">
                        Riwayat Spreadsheet Backup Terakhir di Perangkat Ini:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {savedHistory.map((item) => (
                          <button
                            key={item.spreadsheetId}
                            type="button"
                            onClick={() => {
                              setTargetSpreadsheetInput(item.spreadsheetUrl);
                              setPendingOverwriteConfirm(null);
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer truncate max-w-xs ${
                              extractGoogleSpreadsheetId(targetSpreadsheetInput) === item.spreadsheetId
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                            title={`${item.title} — Sinkron terakhir: ${item.lastSyncedAt}`}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Explicit Confirmation Dialog BEFORE Overwriting Existing Google Sheet */}
                  {pendingOverwriteConfirm && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                        <div className="space-y-1 text-xs text-amber-950">
                          <div className="font-bold text-sm">
                            Konfirmasi Perbarui &amp; Timpa Isi Google Spreadsheet?
                          </div>
                          <p className="leading-relaxed">
                            Anda akan menimpa dan memperbarui <strong>{pendingOverwriteConfirm.sheetCount} tab backup ERP</strong>{' '}
                            ({pendingOverwriteConfirm.totalRecords.toLocaleString('id-ID')} total record data terbaru) ke dalam file Google Spreadsheet berikut:
                          </p>
                          <div className="p-2.5 rounded-lg bg-white border border-amber-200 font-mono text-xs text-slate-800 space-y-0.5">
                            <div>
                              <strong>Judul File:</strong> {pendingOverwriteConfirm.metadata.title}
                            </div>
                            <div className="truncate">
                              <strong>ID File:</strong> {pendingOverwriteConfirm.metadata.spreadsheetId}
                            </div>
                            <div>
                              <strong>Tab Saat Ini di File:</strong> {pendingOverwriteConfirm.metadata.sheets.length} sheet
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setPendingOverwriteConfirm(null)}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmExecuteOverwriteSheet}
                          className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                        >
                          Ya, Konfirmasi &amp; Perbarui Spreadsheet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Live Progress Indicator */}
              {isExportingSheets && exportProgressText && (
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center gap-3 text-xs text-emerald-950">
                  <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin shrink-0" />
                  <span className="font-semibold">{exportProgressText}</span>
                </div>
              )}

              {/* Result Link Card (Created or Updated Google Sheet) */}
              {(sheetsResult || savedTarget) && (
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-emerald-950">
                        {sheetsResult
                          ? 'Google Spreadsheet Berhasil Tersinkron!'
                          : `Spreadsheet Backup Terakhir (${savedTarget?.lastSyncedAt})`}
                      </div>
                      <div className="text-xs text-slate-700 font-medium truncate">
                        {sheetsResult?.title || savedTarget?.title}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={sheetsResult?.spreadsheetUrl || savedTarget?.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka Google Spreadsheet</span>
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopySheetUrl(
                            (sheetsResult?.spreadsheetUrl || savedTarget?.spreadsheetUrl) ?? ''
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        {copiedUrl ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span>{copiedUrl ? 'Link Tersalin' : 'Salin Link'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ===================================================================== */}
          {/* OPSI 2 & 3: EXCEL (.XLSX) OFFLINE INSTAN & FULL DATABASE JSON         */}
          {/* ===================================================================== */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* OPSI 2: Unduh File Spreadsheet Excel (.xlsx) 21-Sheet */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-700 font-semibold">
                  Jalur 2 · Tanpa Internet / Anti-Hang
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Unduh Full Spreadsheet Excel (.xlsx)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Menghasilkan file <strong>.xlsx 21 Sheet lengkap</strong> langsung dari browser Anda. Tetap berfungsi penuh meskipun server sedang hang atau maintenance, dan siap dibuka di Microsoft Excel / Google Drive.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadXlsx}
                  disabled={loadingBundle || !activeBundle}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Unduh Spreadsheet (.xlsx)</span>
                </button>
                {!isEmergencyMode && (
                  <a
                    href="/api/database/backup-xlsx"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    title="Unduh langsung dari endpoint server"
                  >
                    <span>Link Server</span>
                  </a>
                )}
              </div>
            </div>

            {/* OPSI 3: Full JSON Backup & Restore (Termasuk Bukti Foto Nota) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-sky-700 font-semibold">
                  Jalur 3 · Arsip Sistem Utuh 100% + Foto
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Cadangan &amp; Pemulihan Database (.json)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Menyimpan seluruh struktur asli sistem beserta <strong>foto bukti nota &amp; foto karyawan</strong> untuk pemulihan instan 1-klik ke server kapan saja setelah selesai maintenance.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  disabled={loadingBundle || !activeBundle}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Database className="w-4 h-4 text-sky-600" />
                  <span>Unduh Full JSON</span>
                </button>
                {allowRestore && (
                  <label className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-semibold transition-colors cursor-pointer">
                    <Upload className="w-4 h-4 text-sky-700" />
                    <span>Pulihkan JSON</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleSelectRestoreJsonFile}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Explicit Confirmation Dialog BEFORE Restoring JSON Database */}
          {pendingRestoreFile && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-rose-950">
                  <div className="font-bold text-sm">
                    Konfirmasi Pemulihan Penuh Database Sistem dari File JSON?
                  </div>
                  <p className="leading-relaxed">
                    Anda memilih file <strong>{pendingRestoreFile.fileName}</strong> yang berisi{' '}
                    <strong className="font-mono">
                      {pendingRestoreFile.totalRecords.toLocaleString('id-ID')} record
                    </strong>
                    . Tindakan ini akan menggantikan data aktif di server dan menyinkronkannya ke Cloud Supabase.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingRestoreFile(null)}
                  disabled={isRestoringJson}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExecuteRestoreJson}
                  disabled={isRestoringJson}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isRestoringJson ? 'Memulihkan Database...' : 'Ya, Pulihkan Seluruh Data'}
                </button>
              </div>
            </div>
          )}

          {/* Daftar Rincian 21 Tab Spreadsheet yang Dibackup */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTabBreakdown((prev) => !prev)}
              className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <div>
                <div className="text-xs font-bold text-slate-900">
                  Rincian {preparedTabs.length || 21} Sheet di Dalam Backup Spreadsheet
                </div>
                <div className="text-[11px] text-slate-500">
                  Klik untuk melihat daftar lengkap tab dan jumlah baris tiap modul yang dilarikan ke Spreadsheet
                </div>
              </div>
              {showTabBreakdown ? (
                <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              )}
            </button>

            {showTabBreakdown && (
              <div className="border-t border-slate-100 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                {preparedTabs.map((tab) => (
                  <div
                    key={tab.sheetName}
                    className="px-5 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-bold text-slate-900 truncate">
                        {tab.sheetName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{tab.description}</div>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-emerald-800 shrink-0">
                      {tab.rows.length.toLocaleString('id-ID')} baris
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
