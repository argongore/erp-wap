import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App safely (reuse if already initialized)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Provider with required Google Workspace scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory token cache (NEVER stored in localStorage per security requirements)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Wait or trigger failure if token not yet acquired
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google OAuth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// ==========================================
// GOOGLE SHEETS & DRIVE API OPERATIONS
// ==========================================

export interface GoogleSpreadsheetItem {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
}

/**
 * List existing ERP spreadsheets in user's Google Drive created with this app
 */
export const listErpSpreadsheets = async (): Promise<GoogleSpreadsheetItem[]> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,createdTime,modifiedTime)&orderBy=modifiedTime desc&pageSize=20`,
    {
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Gagal mengambil daftar file Google Sheets.');
  }

  const data = await response.json();
  return (data.files || []).map((file: any) => ({
    id: file.id,
    name: file.name,
    webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`,
    createdTime: file.createdTime,
    modifiedTime: file.modifiedTime,
  }));
};

/**
 * Creates a brand new Google Spreadsheet with specific sheet titles
 */
export const createModularGoogleSpreadsheet = async (
  title: string,
  sheetTitles: string[]
): Promise<{ id: string; url: string }> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  const payload = {
    properties: {
      title,
    },
    sheets: sheetTitles.map((st) => ({
      properties: { title: st, gridProperties: { frozenRowCount: 1 } },
    })),
  };

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Gagal membuat Google Spreadsheet baru.');
  }

  const data = await response.json();
  return {
    id: data.spreadsheetId,
    url: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
  };
};

/**
 * Creates a brand new Google Spreadsheet formatted for Wijaya Agro ERP
 */
export const createErpSpreadsheet = async (title: string): Promise<{ id: string; url: string }> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  const payload = {
    properties: {
      title: title || `ERP Wijaya Agro Database - ${new Date().toLocaleDateString('id-ID')}`,
    },
    sheets: [
      { properties: { title: 'Rekap & Saldo Rekening', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Pembelian Hasil Bumi', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Penjualan Toko', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Kasbon & Piutang', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Penggajian Karyawan', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Stok Barang & Komoditas', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Master Mitra & Karyawan', gridProperties: { frozenRowCount: 1 } } },
      { properties: { title: 'Log Mutasi Transaksi', gridProperties: { frozenRowCount: 1 } } },
    ],
  };

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cachedAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Gagal membuat Google Spreadsheet baru.');
  }

  const data = await response.json();
  return {
    id: data.spreadsheetId,
    url: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}`,
  };
};

/**
 * Checks and ensures all required sheets exist in the spreadsheet
 */
export const ensureSheetsExist = async (
  spreadsheetId: string,
  requiredTitles: string[]
): Promise<void> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  // Get current metadata
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(sheetId,title))`,
    {
      headers: { Authorization: `Bearer ${cachedAccessToken}` },
    }
  );

  if (!metaRes.ok) throw new Error('Gagal memeriksa struktur spreadsheet.');

  const metaData = await metaRes.json();
  const existingTitles = new Set(
    (metaData.sheets || []).map((s: any) => s.properties?.title)
  );

  const missingTitles = requiredTitles.filter((title) => !existingTitles.has(title));

  if (missingTitles.length > 0) {
    const requests = missingTitles.map((title) => ({
      addSheet: {
        properties: {
          title,
          gridProperties: { frozenRowCount: 1 },
        },
      },
    }));

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  }
};

/**
 * Writes or overwrites entire data for all sheets in batch
 */
export const syncAllDataToGoogleSheets = async (
  spreadsheetId: string,
  tables: Record<string, (string | number)[][]>
): Promise<{ success: boolean; updatedSheetsCount: number }> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  const sheetTitles = Object.keys(tables);
  await ensureSheetsExist(spreadsheetId, sheetTitles);

  // Clear existing cells in these sheets so no leftover ghost data remains
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cachedAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ranges: sheetTitles.map((title) => `'${title.replace(/'/g, "''")}'!A:ZZ`),
        }),
      }
    );
  } catch (clearErr) {
    console.warn('Batch clear warning (proceeding with write):', clearErr);
  }

  const valueData = sheetTitles.map((title) => ({
    range: `'${title.replace(/'/g, "''")}'!A1`,
    values: tables[title],
  }));

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueData,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Gagal sinkronisasi data ke Google Sheets.');
  }

  return { success: true, updatedSheetsCount: sheetTitles.length };
};

/**
 * Appends a single row to a specific sheet tab in real-time
 */
export const appendRowToGoogleSheet = async (
  spreadsheetId: string,
  sheetTitle: string,
  rowValues: (string | number)[]
): Promise<boolean> => {
  if (!cachedAccessToken) return false;

  try {
    const range = `'${sheetTitle}'!A1`;
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cachedAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowValues],
        }),
      }
    );

    return response.ok;
  } catch (err) {
    console.warn('Gagal append row ke Google Sheets:', err);
    return false;
  }
};

// ==========================================
// GOOGLE DRIVE: STRUKTUR FOLDER NOTA LALU
// Folder Utama: NOTA LALU - PT WIJAYA AGRO
//   ├── PIUTANG NOTA LAMA
//   └── HUTANG NOTA LAMA
// ==========================================

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = 7000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
};

export const getOrCreateDriveFolder = async (
  folderName: string,
  parentId?: string
): Promise<DriveFolderInfo> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  let q = `mimeType='application/vnd.google-apps.folder' and name='${folderName.replace(/'/g, "\\'")}' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }

  try {
    const searchRes = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)&pageSize=1`,
      {
        headers: { Authorization: `Bearer ${cachedAccessToken}` },
      },
      6000
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0];
      }
    }
  } catch (e) {
    console.warn(`Pencarian folder Drive "${folderName}" timeout atau gagal, membuat folder baru:`, e);
  }

  // Create new folder
  const meta: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    meta.parents = [parentId];
  }

  const createRes = await fetchWithTimeout(
    'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(meta),
    },
    7000
  );

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gagal membuat folder Drive "${folderName}".`);
  }

  return await createRes.json();
};

export const ensureNotaLaluDriveFolders = async (): Promise<{
  rootFolder: DriveFolderInfo;
  piutangFolder: DriveFolderInfo;
  hutangFolder: DriveFolderInfo;
}> => {
  const rootFolder = await getOrCreateDriveFolder('NOTA LALU - PT WIJAYA AGRO');
  const piutangFolder = await getOrCreateDriveFolder('PIUTANG NOTA LAMA', rootFolder.id);
  const hutangFolder = await getOrCreateDriveFolder('HUTANG NOTA LAMA', rootFolder.id);

  return { rootFolder, piutangFolder, hutangFolder };
};

export const uploadNotaProofToDrive = async (params: {
  imageBase64: string;
  fileName: string;
  folderType: 'PIUTANG_NOTA_LAMA' | 'HUTANG_NOTA_LAMA';
}): Promise<{ fileId: string; webViewLink: string; folderPath: string }> => {
  if (!cachedAccessToken) throw new Error('Akses Google belum terautentikasi.');

  const folders = await ensureNotaLaluDriveFolders();
  const targetFolder = params.folderType === 'PIUTANG_NOTA_LAMA' ? folders.piutangFolder : folders.hutangFolder;
  const folderPath = `NOTA LALU / ${params.folderType === 'PIUTANG_NOTA_LAMA' ? 'PIUTANG NOTA LAMA' : 'HUTANG NOTA LAMA'}`;

  // Parse base64
  let mimeType = 'image/jpeg';
  let base64Data = params.imageBase64;
  if (params.imageBase64.includes(';base64,')) {
    const parts = params.imageBase64.split(';base64,');
    mimeType = parts[0].replace('data:', '') || 'image/jpeg';
    base64Data = parts[1];
  }

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Multipart upload
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = {
    name: params.fileName,
    mimeType,
    parents: [targetFolder.id],
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Data +
    closeDelimiter;

  const res = await fetchWithTimeout(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cachedAccessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    },
    9000
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal mengupload bukti nota fisik ke Google Drive');
  }

  const fileData = await res.json();
  return {
    fileId: fileData.id,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileData.id}/view`,
    folderPath,
  };
};

/**
 * Directly sync a modular file definition (Mitra, Karyawan, etc.) to Google Sheets
 */
export const syncModularFileDirectly = async (
  fileDef: {
    id: string;
    googleSheetTitle: string;
    label: string;
    sheets: Array<{ sheetName: string; data: (string | number)[][] }>;
  }
): Promise<{ success: boolean; sheetId: string; message: string; webViewLink: string }> => {
  if (!cachedAccessToken) {
    throw new Error('Akses Google belum terautentikasi. Silakan masuk dengan akun Google terlebih dahulu.');
  }

  const storageKey =
    fileDef.id === 'file-karyawan'
      ? 'wijaya_agro_sheet_karyawan_id'
      : fileDef.id === 'file-mitra'
      ? 'wijaya_agro_sheet_mitra_id'
      : fileDef.id === 'file-transaksi'
      ? 'wijaya_agro_sheet_transaksi_id'
      : 'wijaya_agro_sheet_hasilbumi_id';

  let sheetId = localStorage.getItem(storageKey) || '';

  if (!sheetId) {
    const sheetTitles = fileDef.sheets.map((s) => s.sheetName);
    const res = await createModularGoogleSpreadsheet(fileDef.googleSheetTitle, sheetTitles);
    sheetId = res.id;
    localStorage.setItem(storageKey, res.id);
  }

  const tablePayload: Record<string, (string | number)[][]> = {};
  fileDef.sheets.forEach((s) => {
    tablePayload[s.sheetName] = s.data;
  });

  await syncAllDataToGoogleSheets(sheetId, tablePayload);
  const webViewLink = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

  return {
    success: true,
    sheetId,
    webViewLink,
    message: `Data ${fileDef.label} (${fileDef.sheets.length} sheets) berhasil disinkronkan ke Google Spreadsheet!`,
  };
};

