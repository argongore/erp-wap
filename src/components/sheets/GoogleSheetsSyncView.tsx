import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  LogOut,
  FolderSync,
  PlusCircle,
  Database,
  Table,
  ShieldCheck,
  Download,
  Info,
  Layers,
  Search,
  Users,
  Calendar,
  Receipt,
  HandCoins,
  Wheat,
  ShoppingCart,
  History,
  Building2,
  PackagePlus,
  ArrowLeftRight,
  Coffee,
  Boxes,
  Package,
  Sparkles,
  ArrowDownToLine,
  Check,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  listErpSpreadsheets,
  createModularGoogleSpreadsheet,
  syncAllDataToGoogleSheets,
  GoogleSpreadsheetItem,
} from '../../services/googleSheetsService.ts';
import {
  FullErpModularDataset,
  buildModularSpreadsheets,
  downloadModularSpreadsheetAsExcel,
  downloadAllModularSpreadsheets,
  ModularFileDefinition,
} from '../../utils/modularSpreadsheets.ts';

interface GoogleSheetsSyncViewProps {
  erpData: FullErpModularDataset;
  onRefreshAll: () => void;
}

export const GoogleSheetsSyncView: React.FC<GoogleSheetsSyncViewProps> = ({
  erpData,
  onRefreshAll,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Generate the 4 Modular Files using our specialized multi-sheet transformer
  const modularFiles = useMemo(() => {
    return buildModularSpreadsheets(erpData);
  }, [erpData]);

  // Selected file and selected sheet inside that file
  const [selectedFileId, setSelectedFileId] = useState<string>('file-karyawan');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');

  // Active file definition
  const currentFile = useMemo(() => {
    return modularFiles.find((f) => f.id === selectedFileId) || modularFiles[0];
  }, [modularFiles, selectedFileId]);

  // Active sheet definition inside active file
  const currentSheet = useMemo(() => {
    if (!currentFile || currentFile.sheets.length === 0) return null;
    const found = currentFile.sheets.find((s) => s.sheetName === selectedSheetName);
    return found || currentFile.sheets[0];
  }, [currentFile, selectedSheetName]);

  // Ensure selectedSheetName stays valid when switching files
  useEffect(() => {
    if (currentFile && currentFile.sheets.length > 0) {
      if (!currentFile.sheets.some((s) => s.sheetName === selectedSheetName)) {
        setSelectedSheetName(currentFile.sheets[0].sheetName);
      }
    }
  }, [currentFile, selectedSheetName]);

  // Local storage mapping for Google Sheet ID of each modular file
  const [googleSheetIds, setGoogleSheetIds] = useState<Record<string, string>>(() => {
    return {
      'file-karyawan': localStorage.getItem('wijaya_agro_sheet_karyawan_id') || '',
      'file-mitra': localStorage.getItem('wijaya_agro_sheet_mitra_id') || '',
      'file-transaksi': localStorage.getItem('wijaya_agro_sheet_transaksi_id') || '',
      'file-hasil-bumi': localStorage.getItem('wijaya_agro_sheet_hasilbumi_id') || '',
    };
  });

  // Spreadsheets in user's Drive
  const [driveSpreadsheets, setDriveSpreadsheets] = useState<GoogleSpreadsheetItem[]>([]);
  const [loadingDriveList, setLoadingDriveList] = useState<boolean>(false);

  // Syncing states
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    fileId: string;
    success: boolean;
    message: string;
    timestamp: string;
  } | null>(null);

  // Table search & filter query
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Sheet tab filter for navigating 100+ pages
  const [sheetTabFilter, setSheetTabFilter] = useState<string>('');
  const [sheetCategoryFilter, setSheetCategoryFilter] = useState<'all' | 'summary' | 'real' | 'template'>('all');
  
  // Interactive Spreadsheet States (Formula Bar, Active Cell, Density)
  const [activeCell, setActiveCell] = useState<{ row: number; col: number; val: any; colName?: string } | null>(null);
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'relaxed'>('normal');
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);

  const displayedSheets = useMemo(() => {
    let list = currentFile.sheets;
    if (sheetCategoryFilter === 'summary') {
      list = list.filter((s) => s.isSummaryTab);
    } else if (sheetCategoryFilter === 'real') {
      list = list.filter((s) => s.isRealEntity);
    } else if (sheetCategoryFilter === 'template') {
      list = list.filter((s) => s.isTemplate);
    }
    if (!sheetTabFilter.trim()) return list;
    const q = sheetTabFilter.toLowerCase();
    return list.filter(
      (s) => s.tabLabel.toLowerCase().includes(q) || s.sheetName.toLowerCase().includes(q)
    );
  }, [currentFile.sheets, sheetCategoryFilter, sheetTabFilter]);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    mode: 'single' | 'all';
    targetFile?: ModularFileDefinition;
  }>({ open: false, mode: 'single' });

  // Creation loading
  const [isCreatingGoogleSheet, setIsCreatingGoogleSheet] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setAuthError(null);
        fetchDriveSpreadsheets();
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchDriveSpreadsheets = async () => {
    setLoadingDriveList(true);
    try {
      const list = await listErpSpreadsheets();
      setDriveSpreadsheets(list);
    } catch (err: any) {
      console.warn('Gagal memuat list spreadsheet Drive:', err.message);
    } finally {
      setLoadingDriveList(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        await fetchDriveSpreadsheets();
      }
    } catch (err: any) {
      console.error('Google Sign-in error:', err);
      setAuthError(err.message || 'Gagal masuk dengan akun Google.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutGoogle();
    setUser(null);
    setToken(null);
  };

  const handleCopyTableTSV = () => {
    if (!currentSheet || currentSheet.data.length === 0) return;
    try {
      const tsvContent = currentSheet.data
        .map((row) => row.map((c) => String(c ?? '').replace(/\t/g, ' ')).join('\t'))
        .join('\n');
      navigator.clipboard.writeText(tsvContent);
      setCopiedFeedback(true);
      setTimeout(() => setCopiedFeedback(false), 2200);
    } catch (e) {
      console.error('Failed to copy table to clipboard:', e);
    }
  };

  const handleSetGoogleSheetId = (fileId: string, sheetId: string) => {
    const updated = { ...googleSheetIds, [fileId]: sheetId };
    setGoogleSheetIds(updated);

    const storageKey =
      fileId === 'file-karyawan'
        ? 'wijaya_agro_sheet_karyawan_id'
        : fileId === 'file-mitra'
        ? 'wijaya_agro_sheet_mitra_id'
        : fileId === 'file-transaksi'
        ? 'wijaya_agro_sheet_transaksi_id'
        : 'wijaya_agro_sheet_hasilbumi_id';

    if (sheetId) {
      localStorage.setItem(storageKey, sheetId);
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  const handleCreateGoogleSheetForFile = async (fileDef: ModularFileDefinition) => {
    if (!token) {
      alert('Harap login ke Akun Google terlebih dahulu!');
      return;
    }
    setIsCreatingGoogleSheet(true);
    try {
      const sheetTitles = fileDef.sheets.map((s) => s.sheetName);
      const res = await createModularGoogleSpreadsheet(fileDef.googleSheetTitle, sheetTitles);
      handleSetGoogleSheetId(fileDef.id, res.id);

      // Perform initial push
      const tablePayload: Record<string, (string | number)[][]> = {};
      fileDef.sheets.forEach((s) => {
        tablePayload[s.sheetName] = s.data;
      });
      await syncAllDataToGoogleSheets(res.id, tablePayload);

      setSyncFeedback({
        fileId: fileDef.id,
        success: true,
        message: `Berhasil membuat spreadsheet baru "${fileDef.googleSheetTitle}" di Google Drive dan menyinkronkan data!`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });

      await fetchDriveSpreadsheets();
    } catch (err: any) {
      setSyncFeedback({
        fileId: fileDef.id,
        success: false,
        message: `Gagal membuat spreadsheet: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } finally {
      setIsCreatingGoogleSheet(false);
    }
  };

  const executeSyncFile = async (fileDef: ModularFileDefinition) => {
    const sheetId = googleSheetIds[fileDef.id];
    if (!sheetId) {
      // If no ID set, automatically create it
      await handleCreateGoogleSheetForFile(fileDef);
      return;
    }

    setIsSyncing(true);
    try {
      const tablePayload: Record<string, (string | number)[][]> = {};
      fileDef.sheets.forEach((s) => {
        tablePayload[s.sheetName] = s.data;
      });

      await syncAllDataToGoogleSheets(sheetId, tablePayload);

      setSyncFeedback({
        fileId: fileDef.id,
        success: true,
        message: `Data ${fileDef.label} (${fileDef.sheets.length} sheets) berhasil disinkronkan ke Google Sheets!`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } catch (err: any) {
      setSyncFeedback({
        fileId: fileDef.id,
        success: false,
        message: `Gagal menyinkronkan ${fileDef.label}: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const executeSyncAllFiles = async () => {
    setIsSyncing(true);
    let successCount = 0;
    try {
      for (const fileDef of modularFiles) {
        let sheetId = googleSheetIds[fileDef.id];
        if (!sheetId) {
          const sheetTitles = fileDef.sheets.map((s) => s.sheetName);
          const res = await createModularGoogleSpreadsheet(fileDef.googleSheetTitle, sheetTitles);
          sheetId = res.id;
          handleSetGoogleSheetId(fileDef.id, res.id);
        }

        const tablePayload: Record<string, (string | number)[][]> = {};
        fileDef.sheets.forEach((s) => {
          tablePayload[s.sheetName] = s.data;
        });

        await syncAllDataToGoogleSheets(sheetId, tablePayload);
        successCount++;
      }

      setSyncFeedback({
        fileId: 'all',
        success: true,
        message: `Seluruh 4 file spreadsheet database (${successCount} dokumen terpisah) berhasil disinkronkan ke Google Drive!`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } catch (err: any) {
      setSyncFeedback({
        fileId: 'all',
        success: false,
        message: `Sinkronisasi terhenti: ${err.message}`,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      });
    } finally {
      setIsSyncing(false);
      setConfirmModal({ open: false, mode: 'single' });
    }
  };

  // Filtered rows for currently active sheet
  const rawRows = currentSheet ? currentSheet.data : [];
  const headerRows = rawRows.slice(0, 2); // Title and Column Header rows
  const dataRows = rawRows.slice(2);

  const filteredDataRows = useMemo(() => {
    if (!searchQuery.trim()) return dataRows;
    const q = searchQuery.toLowerCase();
    return dataRows.filter((row) =>
      row.some((cell) => String(cell).toLowerCase().includes(q))
    );
  }, [dataRows, searchQuery]);

  // Dynamic sum for last column or numeric columns
  const numericTotals = useMemo(() => {
    if (!currentSheet || dataRows.length === 0) return null;
    let totalNominal = 0;
    let totalKg = 0;

    dataRows.forEach((row) => {
      row.forEach((cell) => {
        if (typeof cell === 'number') {
          if (cell > 1000) totalNominal += cell;
          else if (cell > 0 && cell < 100000) totalKg += cell;
        }
      });
    });

    return { totalNominal, totalKg };
  }, [currentSheet, dataRows]);

  const renderTabIcon = (iconName: string) => {
    switch (iconName) {
      case 'Users':
        return <Users className="w-4 h-4 text-emerald-500" />;
      case 'Calendar':
        return <Calendar className="w-4 h-4 text-amber-500" />;
      case 'Receipt':
        return <Receipt className="w-4 h-4 text-rose-500" />;
      case 'HandCoins':
        return <HandCoins className="w-4 h-4 text-purple-500" />;
      case 'Wheat':
        return <Wheat className="w-4 h-4 text-amber-500" />;
      case 'ShoppingCart':
        return <ShoppingCart className="w-4 h-4 text-emerald-500" />;
      case 'PackagePlus':
        return <PackagePlus className="w-4 h-4 text-orange-500" />;
      case 'Building2':
        return <Building2 className="w-4 h-4 text-blue-500" />;
      case 'ArrowLeftRight':
        return <ArrowLeftRight className="w-4 h-4 text-sky-500" />;
      case 'Coffee':
        return <Coffee className="w-4 h-4 text-amber-700" />;
      case 'Layers':
        return <Layers className="w-4 h-4 text-yellow-600" />;
      case 'Boxes':
        return <Boxes className="w-4 h-4 text-amber-600" />;
      case 'Package':
        return <Package className="w-4 h-4 text-teal-600" />;
      case 'Sparkles':
        return <Sparkles className="w-4 h-4 text-indigo-500" />;
      default:
        return <Table className="w-4 h-4 text-zinc-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Multi-File Architecture Indicator */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-emerald-950 border border-emerald-900/60 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-2.5 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>ARSITEKTUR MULTI-SPREADSHEET TERHUBUNG</span>
              </span>
              <span className="text-xs text-zinc-400">4 Dokumen Modular Terpisah</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center space-x-2">
              <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
              <span>Pusat Database Multi-Spreadsheet Terhubung</span>
            </h1>
            <p className="text-xs text-zinc-300 mt-1 max-w-3xl leading-relaxed">
              Database terstruktur rapi ke dalam 4 file spreadsheet mandiri: <strong>File Karyawan</strong>,{' '}
              <strong>File Mitra</strong>, <strong>File Transaksi</strong>, dan <strong>File Hasil Bumi &amp; Barang</strong>{' '}
              dengan sheet terpisah untuk setiap komoditas (<em>Lada, Kopi, Kulit KA, Stik, KB, KF</em>). Tidak menumpuk rusak di satu file!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={onRefreshAll}
              className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 flex items-center space-x-2 transition-colors shadow-sm"
              title="Perbarui seluruh data dari database sistem"
            >
              <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
              <span>Refresh Data</span>
            </button>

            <button
              onClick={() => downloadModularSpreadsheetAsExcel(currentFile)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-950/40 flex items-center space-x-2 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Download File Ini (.xlsx)</span>
            </button>

            <button
              onClick={() => downloadAllModularSpreadsheets(modularFiles)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-bold shadow-md shadow-amber-950/40 flex items-center space-x-2 transition-all"
            >
              <ArrowDownToLine className="w-4 h-4" />
              <span>Download Semua 4 File (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* 4 Connected Files Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-zinc-800/80">
          {modularFiles.map((file) => {
            const isSelected = file.id === selectedFileId;
            const totalRows = file.sheets.reduce((acc, s) => acc + Math.max(0, s.data.length - 2), 0);
            const hasGoogleId = !!googleSheetIds[file.id];

            return (
              <div
                key={file.id}
                onClick={() => {
                  setSelectedFileId(file.id);
                  if (file.sheets.length > 0) {
                    setSelectedSheetName(file.sheets[0].sheetName);
                  }
                }}
                className={`p-3.5 rounded-xl cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-emerald-950/60 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                    : 'bg-zinc-800/60 border-zinc-700/60 hover:bg-zinc-800 hover:border-zinc-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-zinc-900 text-emerald-400 border border-emerald-900/80">
                    {file.badge}
                  </span>
                  <span className="flex items-center space-x-1 text-[10px] text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    <span>TERHUBUNG</span>
                  </span>
                </div>
                <div className="font-bold text-sm text-white mt-2 truncate">{file.label.replace(/^\d+\.\s*/, '')}</div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-2 pt-2 border-t border-zinc-700/40">
                  <span>{file.sheets.length} Sheets / Tabs</span>
                  <span className="font-mono text-emerald-300 font-semibold">{totalRows} Baris</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Google Sheets Cloud Account & Sync Bar */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <FolderSync className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm text-zinc-900">Sinkronisasi Google Sheets (Google Drive)</h3>
                {user ? (
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    <span>Terhubung: {user.email}</span>
                  </span>
                ) : (
                  <span className="text-[10px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-medium">
                    Belum Terkoneksi Google
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Sinkronkan ke 4 file Google Spreadsheet terpisah di akun Google Drive Anda. Setiap komoditas (Lada, Kopi, Kulit KA, Stik, KB, KF) memiliki sheet sendiri.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {user ? (
              <>
                <button
                  onClick={() => executeSyncFile(currentFile)}
                  disabled={isSyncing || isCreatingGoogleSheet}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sinkronkan File Ini ({currentFile.badge})</span>
                </button>

                <button
                  onClick={() => setConfirmModal({ open: true, mode: 'all' })}
                  disabled={isSyncing || isCreatingGoogleSheet}
                  className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                >
                  <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sinkronkan Semua 4 File</span>
                </button>

                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl border border-zinc-300 text-zinc-600 hover:bg-zinc-100 transition-colors"
                  title="Keluar dari Google"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center space-x-2 transition-colors shadow-xs"
              >
                {isLoggingIn ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                <span>Koneksikan Akun Google</span>
              </button>
            )}
          </div>
        </div>

        {/* Sync Feedback Alert */}
        {syncFeedback && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center justify-between border ${
              syncFeedback.success
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {syncFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{syncFeedback.message}</span>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">{syncFeedback.timestamp} WIB</span>
          </div>
        )}

        {/* Google Sheet ID per File Quick Links */}
        {user && (
          <div className="mt-4 pt-3.5 border-t border-zinc-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {modularFiles.map((file) => {
              const sheetId = googleSheetIds[file.id];
              return (
                <div key={file.id} className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-200/80 flex items-center justify-between text-xs">
                  <div className="truncate pr-2">
                    <div className="font-semibold text-zinc-800 truncate">{file.label.replace(/^\d+\.\s*/, '')}</div>
                    <div className="text-[10px] text-zinc-500 font-mono truncate">
                      {sheetId ? `ID: ${sheetId.slice(0, 10)}...` : 'Belum dibuat di Drive'}
                    </div>
                  </div>
                  {sheetId ? (
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center space-x-1 shrink-0 transition-colors"
                    >
                      <span>Buka</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <button
                      onClick={() => handleCreateGoogleSheetForFile(file)}
                      disabled={isCreatingGoogleSheet}
                      className="px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold shrink-0 transition-colors"
                    >
                      + Buat File
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* File & Sheet Explorer Workspace */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
        {/* Level 1: Primary File Selector Tabs */}
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 pt-3 flex flex-wrap gap-2">
          {modularFiles.map((file) => {
            const isSelected = file.id === selectedFileId;
            return (
              <button
                key={file.id}
                onClick={() => {
                  setSelectedFileId(file.id);
                  if (file.sheets.length > 0) {
                    setSelectedSheetName(file.sheets[0].sheetName);
                  }
                }}
                className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all flex items-center space-x-2 border-t border-x ${
                  isSelected
                    ? 'bg-white text-zinc-900 border-zinc-200 shadow-xs'
                    : 'bg-zinc-800/80 text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-600' : 'text-zinc-500'}`} />
                <span>{file.label}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-normal ${
                    isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-700 text-zinc-300'
                  }`}
                >
                  {file.sheets.length} sheets
                </span>
              </button>
            );
          })}
        </div>

        {/* Level 2: Sub-Sheet Control & Filter Bar */}
        <div className="bg-zinc-50 border-b border-zinc-200 px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider shrink-0 flex items-center space-x-1">
              <span>Halaman Sheet:</span>
              <span className="font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded text-[10px]">
                {currentFile.sheets.length} Page
              </span>
            </span>

            {/* Category Filter Pills (All / Summary / Real / Template) */}
            <div className="flex items-center space-x-1 bg-zinc-200/70 p-0.5 rounded-lg text-[10px] font-bold">
              <button
                onClick={() => setSheetCategoryFilter('all')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  sheetCategoryFilter === 'all'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Semua ({currentFile.sheets.length})
              </button>
              <button
                onClick={() => setSheetCategoryFilter('summary')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  sheetCategoryFilter === 'summary'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                📑 Rekap Total
              </button>
              {currentFile.sheets.some((s) => s.isRealEntity) && (
                <button
                  onClick={() => setSheetCategoryFilter('real')}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    sheetCategoryFilter === 'real'
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  👤 Data Riil ({currentFile.sheets.filter((s) => s.isRealEntity).length})
                </button>
              )}
              {currentFile.sheets.some((s) => s.isTemplate) && (
                <button
                  onClick={() => setSheetCategoryFilter('template')}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    sheetCategoryFilter === 'template'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  ✨ 3 Contoh Template
                </button>
              )}
            </div>

            {/* Quick jump select dropdown if multiple pages */}
            <select
              value={currentSheet?.sheetName}
              onChange={(e) => setSelectedSheetName(e.target.value)}
              className="text-xs font-semibold bg-white border border-zinc-300 rounded-lg px-2.5 py-1 text-zinc-800 focus:ring-1 focus:ring-emerald-500 shrink-0 max-w-[210px]"
            >
              {displayedSheets.map((sheet) => (
                <option key={sheet.sheetName} value={sheet.sheetName}>
                  {sheet.tabLabel}
                </option>
              ))}
            </select>

            {/* Sub-sheet filter input */}
            {currentFile.sheets.length > 4 && (
              <div className="relative shrink-0 w-36">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari sheet..."
                  value={sheetTabFilter}
                  onChange={(e) => setSheetTabFilter(e.target.value)}
                  className="w-full pl-6 pr-2 py-1 bg-white border border-zinc-300 rounded-md text-[11px] text-zinc-800"
                />
              </div>
            )}
          </div>

          {/* Quick Search inside sheet rows */}
          <div className="relative shrink-0 w-full sm:w-60">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Cari baris di ${currentSheet?.tabLabel || 'sheet'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-zinc-300 rounded-lg text-xs text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Level 2.5: Bottom Tabs Strip (Mirrors Google Sheets / Excel bottom tabs from user's screenshot) */}
        <div className="bg-zinc-200/90 border-b border-zinc-300 px-3 py-1.5 flex items-center space-x-1.5 overflow-x-auto select-none shadow-inner">
          {displayedSheets.map((sheet) => {
            const isSelected = sheet.sheetName === currentSheet?.sheetName;
            const rowCount = Math.max(0, sheet.data.length - 2);

            return (
              <button
                key={sheet.sheetName}
                onClick={() => setSelectedSheetName(sheet.sheetName)}
                className={`px-3 py-1.5 rounded-t-md text-xs transition-all flex items-center space-x-1.5 shrink-0 border-t-2 font-mono whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-white text-emerald-900 border-emerald-600 font-bold shadow-xs'
                    : 'bg-zinc-100/90 text-zinc-700 border-transparent hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                <span>{sheet.tabLabel}</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded font-sans font-bold ${
                    isSelected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-zinc-200 text-zinc-600'
                  }`}
                >
                  {rowCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Level 3: Professional Google Sheets / Excel Formula Bar & Toolset */}
        <div className="bg-zinc-100 border-b border-zinc-300 p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
          {/* Left: Cell Coordinate & Formula Bar */}
          <div className="flex items-center space-x-2 flex-1 min-w-0">
            {/* Cell Coordinate Box (e.g., A1, C14) */}
            <div className="flex items-center bg-white border border-zinc-300 rounded px-2.5 py-1 font-mono font-bold text-zinc-800 text-[11px] shadow-2xs shrink-0 w-20 justify-center">
              {activeCell !== null
                ? `${String.fromCharCode(65 + (activeCell.col % 26))}${activeCell.row + 3}`
                : 'A1'}
            </div>

            {/* Formula fx symbol */}
            <span className="font-serif italic font-bold text-zinc-400 select-none text-xs shrink-0">
              fx
            </span>

            {/* Cell Inspector / Formula text display */}
            <div className="flex-1 min-w-0 bg-white border border-zinc-300 rounded px-3 py-1 text-xs text-zinc-900 font-mono truncate shadow-2xs">
              {activeCell !== null ? (
                <span>
                  {activeCell.colName && <strong className="text-zinc-500 font-sans mr-2">[{activeCell.colName}]:</strong>}
                  <span className="text-zinc-900">{String(activeCell.val ?? '')}</span>
                </span>
              ) : (
                <span className="text-zinc-400 italic">Klik pada sel manapun untuk melihat nilai penuh atau rumus...</span>
              )}
            </div>
          </div>

          {/* Right: Quick Action Controls (Density, Copy, Summary) */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Density Selector */}
            <div className="flex items-center space-x-0.5 bg-zinc-200/80 p-0.5 rounded text-[10px] font-semibold">
              <button
                type="button"
                onClick={() => setTableDensity('compact')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  tableDensity === 'compact' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
                title="Tampilan Rapat (Data Padat)"
              >
                Kompak
              </button>
              <button
                type="button"
                onClick={() => setTableDensity('normal')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  tableDensity === 'normal' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
                title="Tampilan Standar"
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setTableDensity('relaxed')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  tableDensity === 'relaxed' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
                title="Tampilan Lapang"
              >
                Lapang
              </button>
            </div>

            {/* Copy Table as TSV/Excel to Clipboard */}
            <button
              type="button"
              onClick={handleCopyTableTSV}
              className={`px-2.5 py-1 rounded border text-[11px] font-semibold flex items-center space-x-1 transition-colors cursor-pointer ${
                copiedFeedback
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50'
              }`}
              title="Salin isi sheet ini ke clipboard untuk di-paste langsung ke Excel / Google Sheets"
            >
              {copiedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Tersalin!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-zinc-500" />
                  <span>Salin Sheet</span>
                </>
              )}
            </button>

            {/* Quick aggregate chips */}
            {numericTotals && numericTotals.totalNominal > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold text-emerald-800 font-mono shrink-0">
                Σ Rp {numericTotals.totalNominal.toLocaleString('id-ID')}
              </div>
            )}
          </div>
        </div>

        {/* Level 3.5: Sheet Information & Dynamic Aggregate Summary */}
        <div className="px-4 py-2 bg-zinc-50 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-bold text-zinc-900">{currentSheet?.tabLabel}</span>
            {currentSheet?.tandaUnik === 'KARYAWAN' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                🏷️ Tanda: [KARYAWAN INTERNAL]
              </span>
            )}
            {currentSheet?.tandaUnik === 'MITRA' && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                🏷️ Tanda: [MITRA EKSTERNAL]
              </span>
            )}
            {currentSheet?.isTemplate && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                ✨ 1 DARI 3 CONTOH TEMPLATE
              </span>
            )}
            <span className="text-zinc-400 font-normal">|</span>
            <span className="text-zinc-500 font-normal">{currentSheet?.description}</span>
          </div>

          <div className="flex items-center space-x-3 text-[11px]">
            <span className="text-zinc-600">
              Total Baris Data: <strong className="text-zinc-900 font-mono">{filteredDataRows.length}</strong> baris
            </span>
            {numericTotals && numericTotals.totalKg > 0 && (
              <span className="text-zinc-600">
                Total Berat: <strong className="text-amber-700 font-mono">{numericTotals.totalKg.toLocaleString('id-ID')} Kg</strong>
              </span>
            )}
          </div>
        </div>

        {/* Level 4: Excel Spreadsheet Grid View */}
        <div className="overflow-x-auto max-h-[580px] overscroll-contain">
          <table className="w-full text-xs text-left border-collapse select-text">
            {/* Spreadsheet Column Letter Header (A, B, C, D...) */}
            {headerRows.length > 1 && (
              <thead className="bg-zinc-200/90 sticky top-0 z-20 text-[10px] text-zinc-600 border-b border-zinc-300 select-none">
                <tr>
                  <th className="w-12 px-2 py-1 text-center font-mono bg-zinc-300 border-r border-zinc-300">
                    #
                  </th>
                  {headerRows[1].map((_, colIdx) => {
                    const isColActive = activeCell?.col === colIdx;
                    return (
                      <th
                        key={colIdx}
                        className={`px-3 py-1 font-mono font-medium text-center border-r border-zinc-300 transition-colors ${
                          isColActive ? 'bg-emerald-600 text-white font-bold' : 'bg-zinc-200/90 text-zinc-700'
                        }`}
                      >
                        {String.fromCharCode(65 + (colIdx % 26))}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}

            {/* Title / Description Banner in Sheet (Row 1) */}
            {headerRows.length > 0 && (
              <tbody className="bg-emerald-50/70 border-b border-emerald-200 font-semibold text-emerald-950 select-none">
                <tr>
                  <td className="px-2 py-2 text-center font-mono text-[10px] text-zinc-400 bg-zinc-100 border-r border-zinc-200">
                    1
                  </td>
                  <td colSpan={headerRows[1]?.length || 10} className="px-4 py-2 font-bold text-xs tracking-wide">
                    {headerRows[0][0]} — <span className="text-emerald-700 font-normal">{headerRows[0][1]}</span>
                  </td>
                </tr>
              </tbody>
            )}

            {/* Column Label Headers (Row 2) */}
            {headerRows.length > 1 && (
              <thead className="bg-zinc-800 text-white sticky top-6 z-10 text-xs shadow-xs select-none">
                <tr>
                  <th className="w-12 px-2 py-2 text-center font-mono text-zinc-400 bg-zinc-900 border-r border-zinc-700">
                    2
                  </th>
                  {headerRows[1].map((colTitle, idx) => {
                    const isColActive = activeCell?.col === idx;
                    return (
                      <th
                        key={idx}
                        className={`px-3 py-2 font-bold tracking-wider uppercase border-r border-zinc-700 whitespace-nowrap transition-colors ${
                          isColActive ? 'bg-zinc-700 text-emerald-300' : ''
                        }`}
                      >
                        {String(colTitle)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            )}

            {/* Data Rows (Row 3+) */}
            <tbody className="divide-y divide-zinc-200 bg-white">
              {filteredDataRows.length > 0 ? (
                filteredDataRows.map((row, rowIdx) => {
                  const isRowActive = activeCell?.row === rowIdx;
                  const rowPaddingClass =
                    tableDensity === 'compact' ? 'px-2.5 py-1 text-[11px]' : tableDensity === 'relaxed' ? 'px-4 py-2.5 text-xs' : 'px-3 py-1.5 text-xs';

                  return (
                    <tr
                      key={rowIdx}
                      className={`transition-colors ${
                        isRowActive
                          ? 'bg-emerald-50/40'
                          : rowIdx % 2 === 0
                          ? 'bg-white hover:bg-amber-50/40'
                          : 'bg-zinc-50/70 hover:bg-amber-50/40'
                      }`}
                    >
                      {/* Row Index Number */}
                      <td
                        className={`w-12 px-2 py-1 text-center font-mono text-[10px] border-r border-zinc-200 select-none transition-colors ${
                          isRowActive ? 'bg-emerald-600 text-white font-bold' : 'text-zinc-400 bg-zinc-100/70'
                        }`}
                      >
                        {rowIdx + 3}
                      </td>

                      {row.map((cell, cellIdx) => {
                        const isNumber = typeof cell === 'number';
                        const cellStr = String(cell ?? '');
                        const isStatusBon = cellStr === 'BON' || cellStr.includes('BERHUTANG BON');
                        const isStatusLunas = cellStr === 'LUNAS' || cellStr.includes('LUNAS / BERSIH') || cellStr === 'SUDAH_DIBAYAR';
                        const isStatusAktif = cellStr === 'AKTIF';
                        const isFotoNota = cellStr.includes('FOTO NOTA') || cellStr.includes('ADA FOTO');
                        const isSelectedCell = activeCell?.row === rowIdx && activeCell?.col === cellIdx;

                        return (
                          <td
                            key={cellIdx}
                            onClick={() =>
                              setActiveCell({
                                row: rowIdx,
                                col: cellIdx,
                                val: cell,
                                colName: headerRows[1]?.[cellIdx] !== undefined ? String(headerRows[1][cellIdx]) : undefined,
                              })
                            }
                            className={`${rowPaddingClass} border-r border-zinc-200/80 whitespace-nowrap cursor-pointer transition-all ${
                              isSelectedCell
                                ? 'ring-2 ring-emerald-500 bg-emerald-100/60 font-medium'
                                : ''
                            } ${
                              isNumber ? 'font-mono text-right font-medium text-zinc-900' : 'text-zinc-800'
                            }`}
                          >
                            {isFotoNota ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300 inline-flex items-center space-x-1">
                                <span>📷</span>
                                <span>{cellStr}</span>
                              </span>
                            ) : isStatusBon ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                {cellStr}
                              </span>
                            ) : isStatusLunas ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                                {cellStr}
                              </span>
                            ) : isStatusAktif ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300">
                                {cellStr}
                              </span>
                            ) : cellStr === '[KARYAWAN INTERNAL]' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                {cellStr}
                              </span>
                            ) : cellStr === '[MITRA EKSTERNAL]' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300">
                                {cellStr}
                              </span>
                            ) : isNumber && Math.abs(cell) >= 1000 ? (
                              cell < 0 ? (
                                <span className="text-rose-600 font-bold font-mono">
                                  -{Math.abs(cell).toLocaleString('id-ID')}
                                </span>
                              ) : (
                                cell.toLocaleString('id-ID')
                              )
                            ) : (
                              cellStr
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={(headerRows[1]?.length || 10) + 1}
                    className="p-8 text-center text-zinc-400 bg-zinc-50"
                  >
                    Tidak ada baris data yang cocok dengan pencarian "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary & Instruction Note */}
        <div className="p-3.5 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-600">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>Garansi Terpadu:</strong> Seluruh 4 file spreadsheet ini saling terhubung secara otomatis ke sistem ERP Wijaya Agro. Data selalu sinkron dan tidak pernah tumpang tindih.
            </span>
          </div>
          <button
            onClick={() => downloadModularSpreadsheetAsExcel(currentFile)}
            className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center space-x-1 shrink-0 self-end sm:self-auto"
          >
            <span>Download {currentFile.fileName}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Google Sync All */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <FolderSync className="w-6 h-6" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-lg font-bold text-zinc-900">
                Konfirmasi Sinkronisasi Semua 4 File
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Sistem akan memperbarui seluruh 4 file spreadsheet terpisah di Google Drive Anda:
              </p>
              <div className="space-y-1.5 text-left p-3 bg-zinc-50 rounded-xl text-xs text-zinc-700 border border-zinc-200">
                <div className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>1. Database Karyawan &amp; Payroll</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Database Mitra &amp; Supplier</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>3. Database Transaksi &amp; Kas</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>4. Database Hasil Bumi &amp; Barang (Per Sheet Komoditas)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal({ open: false, mode: 'single' })}
                className="flex-1 py-2.5 px-4 rounded-xl border border-zinc-300 text-zinc-700 font-semibold text-xs hover:bg-zinc-50 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeSyncAllFiles}
                disabled={isSyncing}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyinkronkan...</span>
                  </>
                ) : (
                  <span>Mulai Sinkronisasi</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
