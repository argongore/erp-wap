import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  firestoreDb,
  backupGoogleProvider,
  OperationType,
  handleFirestoreError,
} from '../lib/firebase.ts';
import { api } from '../api/client.ts';

export type BackupTriggerMode = 'AUTO_WEEKLY' | 'MANUAL' | 'PRE_RESTORE_SAFETY';

export interface WeeklyBackupRecord {
  id: string;
  ownerId: string;
  ownerEmail: string;
  weekKey: string;
  label: string;
  triggerMode: BackupTriggerMode;
  status: 'UPLOADING' | 'COMPLETED';
  companyName: string;
  totalParts: number;
  totalTransactions: number;
  totalMitra: number;
  totalKaryawan: number;
  totalProduk: number;
  totalRekening: number;
  estimatedBytes: number;
  tanggalWib: string;
  jamWib: string;
  note: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface BackupSettingsRecord {
  ownerId: string;
  ownerEmail: string;
  autoWeeklyEnabled: boolean;
  intervalDays: number;
  preferredDayOfWeek: number;
  retentionWeeks: number;
  lastBackupId: string;
  lastBackupWeekKey: string;
  lastBackupAtIso: string;
  lastBackupLabel: string;
}

export interface BackupProgress {
  phase: 'FETCHING' | 'PREPARING' | 'UPLOADING' | 'FINALIZING' | 'RESTORING' | 'CLEANING';
  completed: number;
  total: number;
  message: string;
}

const BOOTSTRAPPED_ADMIN_EMAIL = 'kasirwap@gmail.com';
const MAX_ITEMS_PER_PART = 100; // strictly <= 200 per blueprint
const MAX_BYTES_PER_PART = 380 * 1024; // well under Firestore 1 MB document limit
const MAX_SINGLE_STRING_BYTES = 280 * 1024; // guard against giant embedded base64 photos

export function isBootstrappedBackupAdmin(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      (user.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
}

export function getWibWeekAndClock(now = new Date()): {
  weekKey: string;
  weekNumber: number;
  tanggalWib: string;
  jamWib: string;
  dayOfWeek: number;
  iso: string;
} {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const year = Number(dateParts.find((p) => p.type === 'year')?.value || now.getFullYear());
  const month = Number(dateParts.find((p) => p.type === 'month')?.value || now.getMonth() + 1);
  const day = Number(dateParts.find((p) => p.type === 'day')?.value || now.getDate());

  const timeStr = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(now)
    .replace(/\./g, ':');

  // ISO Week calculation in WIB calendar date
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = utcDate.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const isoDayNum = dayOfWeek || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDayNum);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekKey = `${isoYear}-W${String(weekNumber).padStart(2, '0')}`;

  return {
    weekKey,
    weekNumber,
    tanggalWib: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
    jamWib: timeStr,
    dayOfWeek,
    iso: now.toISOString(),
  };
}

function estimateByteSize(val: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(val)).length;
  } catch {
    return 1024;
  }
}

/**
 * Recursively converts arbitrary ERP JS objects into Firestore-safe native values:
 * - Removes `undefined` properties
 * - Replaces `NaN`/`Infinity` with `0`
 * - Wraps nested arrays (`Array<Array<...>>`) as `{ __nestedArray: [...] }` (unwrapped on restore)
 * - Trims abnormally massive inline data URIs (>280KB) so a single field never breaks the 1MB Firestore limit
 */
function sanitizeForFirestore(value: unknown, insideArray = false): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_SINGLE_STRING_BYTES && value.startsWith('data:')) {
      return '';
    }
    return value;
  }
  if (Array.isArray(value)) {
    const mapped = value.map((item) => sanitizeForFirestore(item, true));
    if (insideArray) {
      return { __nestedArray: mapped };
    }
    return mapped;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || !k) continue;
      result[k] = sanitizeForFirestore(v, false);
    }
    return result;
  }
  return String(value);
}

function restoreFromFirestoreSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => restoreFromFirestoreSafe(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (
      Object.keys(obj).length === 1 &&
      Array.isArray(obj.__nestedArray)
    ) {
      return obj.__nestedArray.map((item) => restoreFromFirestoreSafe(item));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = restoreFromFirestoreSafe(v);
    }
    return out;
  }
  return value;
}

function countDatabaseMetrics(rawDb: Record<string, any>) {
  const arrLen = (key: string) => (Array.isArray(rawDb[key]) ? rawDb[key].length : 0);
  const totalTransactions =
    arrLen('penjualan') +
    arrLen('pembelianBarang') +
    arrLen('pembelianHasilBumi') +
    arrLen('penjualanHasilBumi') +
    arrLen('kasbonUang') +
    arrLen('bayarBon') +
    arrLen('pencairanTitipan') +
    arrLen('pengeluaran') +
    arrLen('uangMasuk') +
    arrLen('transferRekening') +
    arrLen('brilink') +
    arrLen('penggajian') +
    arrLen('upahHarian') +
    arrLen('suratJalan') +
    arrLen('rekapCtr');

  return {
    totalTransactions,
    totalMitra: arrLen('mitra'),
    totalKaryawan: arrLen('karyawan'),
    totalProduk: arrLen('produk'),
    totalRekening: arrLen('rekening'),
  };
}

interface PreparedPart {
  partId: string;
  sectionKey: string;
  chunkIndex: number;
  totalChunks: number;
  isObjectSection: boolean;
  records: unknown[];
  objectData: Record<string, unknown>;
  itemCount: number;
  estimatedBytes: number;
}

function buildNativeBackupParts(rawDb: Record<string, any>): PreparedPart[] {
  const parts: PreparedPart[] = [];
  const entries = Object.entries(rawDb || {});

  for (const [rawKey, rawVal] of entries) {
    if (rawVal === undefined || rawVal === null) continue;
    const sectionKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 64);
    if (!sectionKey) continue;

    if (Array.isArray(rawVal)) {
      if (rawVal.length === 0) {
        parts.push({
          partId: `${sectionKey}_0`,
          sectionKey,
          chunkIndex: 0,
          totalChunks: 1,
          isObjectSection: false,
          records: [],
          objectData: {},
          itemCount: 0,
          estimatedBytes: 128,
        });
        continue;
      }

      const chunks: { records: unknown[]; bytes: number }[] = [];
      let currentRecords: unknown[] = [];
      let currentBytes = 256;

      for (const item of rawVal) {
        const cleanItem = sanitizeForFirestore(item, true);
        const itemBytes = estimateByteSize(cleanItem);

        if (
          currentRecords.length > 0 &&
          (currentRecords.length >= MAX_ITEMS_PER_PART ||
            currentBytes + itemBytes > MAX_BYTES_PER_PART)
        ) {
          chunks.push({ records: currentRecords, bytes: currentBytes });
          currentRecords = [];
          currentBytes = 256;
        }
        currentRecords.push(cleanItem);
        currentBytes += itemBytes;
      }

      if (currentRecords.length > 0) {
        chunks.push({ records: currentRecords, bytes: currentBytes });
      }

      const totalChunks = chunks.length;
      chunks.forEach((ch, idx) => {
        parts.push({
          partId: `${sectionKey}_${idx}`.slice(0, 128),
          sectionKey,
          chunkIndex: idx,
          totalChunks,
          isObjectSection: false,
          records: ch.records,
          objectData: {},
          itemCount: ch.records.length,
          estimatedBytes: ch.bytes,
        });
      });
    } else if (typeof rawVal === 'object') {
      const cleanObj = sanitizeForFirestore(rawVal, false) as Record<string, unknown>;
      parts.push({
        partId: `${sectionKey}_obj`.slice(0, 128),
        sectionKey,
        chunkIndex: 0,
        totalChunks: 1,
        isObjectSection: true,
        records: [],
        objectData: cleanObj || {},
        itemCount: 1,
        estimatedBytes: estimateByteSize(cleanObj),
      });
    }
  }

  return parts;
}

function timestampToMs(val: unknown): number {
  if (val instanceof Timestamp) return val.toMillis();
  if (val && typeof val === 'object' && typeof (val as any).toMillis === 'function') {
    return (val as any).toMillis();
  }
  return Date.now();
}

export async function signInBackupGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, backupGoogleProvider);
  if (!result.user.emailVerified) {
    throw new Error('Akun Google belum terverifikasi email. Gunakan akun Google terverifikasi.');
  }
  return result.user;
}

export async function signOutBackupGoogle(): Promise<void> {
  await signOut(auth);
}

export async function getOrCreateBackupSettings(user: User): Promise<BackupSettingsRecord> {
  const path = `backupSettings/${user.uid}`;
  const docRef = doc(firestoreDb, 'backupSettings', user.uid);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const d = snap.data();
      return {
        ownerId: String(d.ownerId || user.uid),
        ownerEmail: String(d.ownerEmail || user.email || ''),
        autoWeeklyEnabled: Boolean(d.autoWeeklyEnabled),
        intervalDays: Number(d.intervalDays) || 7,
        preferredDayOfWeek: Number(d.preferredDayOfWeek ?? 0),
        retentionWeeks: Number(d.retentionWeeks) || 12,
        lastBackupId: String(d.lastBackupId || ''),
        lastBackupWeekKey: String(d.lastBackupWeekKey || ''),
        lastBackupAtIso: String(d.lastBackupAtIso || ''),
        lastBackupLabel: String(d.lastBackupLabel || ''),
      };
    }

    const defaults = {
      ownerId: user.uid,
      ownerEmail: (user.email || '').slice(0, 160),
      autoWeeklyEnabled: true,
      intervalDays: 7,
      preferredDayOfWeek: 0,
      retentionWeeks: 12,
      lastBackupId: '',
      lastBackupWeekKey: '',
      lastBackupAtIso: '',
      lastBackupLabel: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(docRef, defaults);
    return {
      ownerId: defaults.ownerId,
      ownerEmail: defaults.ownerEmail,
      autoWeeklyEnabled: defaults.autoWeeklyEnabled,
      intervalDays: defaults.intervalDays,
      preferredDayOfWeek: defaults.preferredDayOfWeek,
      retentionWeeks: defaults.retentionWeeks,
      lastBackupId: '',
      lastBackupWeekKey: '',
      lastBackupAtIso: '',
      lastBackupLabel: '',
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveBackupSettings(
  user: User,
  updates: {
    autoWeeklyEnabled: boolean;
    intervalDays: number;
    preferredDayOfWeek: number;
    retentionWeeks: number;
  }
): Promise<BackupSettingsRecord> {
  const path = `backupSettings/${user.uid}`;
  const docRef = doc(firestoreDb, 'backupSettings', user.uid);
  const clampedInterval = Math.min(30, Math.max(1, Math.round(updates.intervalDays)));
  const clampedDay = Math.min(6, Math.max(0, Math.round(updates.preferredDayOfWeek)));
  const clampedRetention = Math.min(52, Math.max(2, Math.round(updates.retentionWeeks)));

  try {
    const existing = await getOrCreateBackupSettings(user);
    await updateDoc(docRef, {
      autoWeeklyEnabled: Boolean(updates.autoWeeklyEnabled),
      intervalDays: clampedInterval,
      preferredDayOfWeek: clampedDay,
      retentionWeeks: clampedRetention,
      updatedAt: serverTimestamp(),
    });
    return {
      ...existing,
      autoWeeklyEnabled: Boolean(updates.autoWeeklyEnabled),
      intervalDays: clampedInterval,
      preferredDayOfWeek: clampedDay,
      retentionWeeks: clampedRetention,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function evaluateWeeklySchedule(settings: BackupSettingsRecord): {
  isDue: boolean;
  reason: string;
  daysSinceLast: number | null;
  nextBackupDateLabel: string;
} {
  if (!settings.autoWeeklyEnabled) {
    return {
      isDue: false,
      reason: 'Backup mingguan otomatis sedang dinonaktifkan',
      daysSinceLast: null,
      nextBackupDateLabel: 'Nonaktif (Manual saja)',
    };
  }

  const now = new Date();
  const { weekKey } = getWibWeekAndClock(now);
  const intervalDays = Math.min(30, Math.max(1, Number(settings.intervalDays) || 7));

  if (!settings.lastBackupAtIso) {
    return {
      isDue: true,
      reason: 'Belum ada arsip backup mingguan di database cadangan',
      daysSinceLast: null,
      nextBackupDateLabel: 'Segera (Belum pernah backup)',
    };
  }

  const lastMs = Date.parse(settings.lastBackupAtIso);
  if (Number.isNaN(lastMs)) {
    return {
      isDue: true,
      reason: 'Waktu backup terakhir tidak valid, menjadwalkan ulang',
      daysSinceLast: null,
      nextBackupDateLabel: 'Segera',
    };
  }

  const daysSinceLast = Math.max(0, (now.getTime() - lastMs) / 86400000);
  const nextMs = lastMs + intervalDays * 86400000;
  const nextDateLabel = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(nextMs));

  const isDueByInterval = daysSinceLast >= intervalDays;
  const isNewWeekGrace =
    intervalDays === 7 &&
    settings.lastBackupWeekKey !== weekKey &&
    daysSinceLast >= 5.5 &&
    getWibWeekAndClock(now).dayOfWeek === settings.preferredDayOfWeek;

  if (isDueByInterval || isNewWeekGrace) {
    return {
      isDue: true,
      reason: `Sudah ${Math.floor(daysSinceLast)} hari sejak backup terakhir (jadwal setiap ${intervalDays} hari)`,
      daysSinceLast,
      nextBackupDateLabel: 'Jatuh Tempo Hari Ini',
    };
  }

  return {
    isDue: false,
    reason: `Backup masih baru (${Math.floor(daysSinceLast)} hari lalu)`,
    daysSinceLast,
    nextBackupDateLabel: nextDateLabel,
  };
}

export async function listWeeklyBackups(user: User): Promise<WeeklyBackupRecord[]> {
  const path = 'weeklyBackups';
  try {
    const colRef = collection(firestoreDb, 'weeklyBackups');
    const q = isBootstrappedBackupAdmin(user)
      ? query(colRef)
      : query(colRef, where('ownerId', '==', user.uid));
    const snap = await getDocs(q);
    const items: WeeklyBackupRecord[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: String(d.id || docSnap.id),
        ownerId: String(d.ownerId || ''),
        ownerEmail: String(d.ownerEmail || ''),
        weekKey: String(d.weekKey || ''),
        label: String(d.label || ''),
        triggerMode: (d.triggerMode as BackupTriggerMode) || 'MANUAL',
        status: d.status === 'COMPLETED' ? 'COMPLETED' : 'UPLOADING',
        companyName: String(d.companyName || ''),
        totalParts: Number(d.totalParts) || 0,
        totalTransactions: Number(d.totalTransactions) || 0,
        totalMitra: Number(d.totalMitra) || 0,
        totalKaryawan: Number(d.totalKaryawan) || 0,
        totalProduk: Number(d.totalProduk) || 0,
        totalRekening: Number(d.totalRekening) || 0,
        estimatedBytes: Number(d.estimatedBytes) || 0,
        tanggalWib: String(d.tanggalWib || ''),
        jamWib: String(d.jamWib || ''),
        note: String(d.note || ''),
        createdAtMs: timestampToMs(d.createdAt),
        updatedAtMs: timestampToMs(d.updatedAt),
      };
    });

    items.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createWeeklyBackupSnapshot(
  user: User,
  options: {
    triggerMode: BackupTriggerMode;
    label?: string;
    note?: string;
    fallbackClientDb?: Record<string, any>;
    companyName?: string;
    onProgress?: (progress: BackupProgress) => void;
  }
): Promise<WeeklyBackupRecord> {
  if (!user.emailVerified) {
    throw new Error('Email akun Google belum terverifikasi.');
  }

  options.onProgress?.({
    phase: 'FETCHING',
    completed: 0,
    total: 1,
    message: 'Mengambil salinan utuh database dari server utama (read-only)...',
  });

  let rawDb: Record<string, any> | null = null;
  try {
    const bundle = await api.getFullBackupBundle();
    if (bundle?.db && typeof bundle.db === 'object') {
      rawDb = bundle.db;
    }
  } catch (err) {
    console.warn('Gagal mengambil bundle live dari server, mencoba fallback snapshot lokal:', err);
  }

  if (!rawDb && options.fallbackClientDb) {
    rawDb = options.fallbackClientDb;
  }

  if (!rawDb || typeof rawDb !== 'object') {
    throw new Error('Data database ERP tidak tersedia untuk dibackup saat ini.');
  }

  const clock = getWibWeekAndClock();
  const metrics = countDatabaseMetrics(rawDb);
  const parts = buildNativeBackupParts(rawDb);

  if (parts.length > 500) {
    throw new Error(
      `Jumlah potongan snapshot (${parts.length}) melebihi batas arsip 500 bagian. Hubungi admin untuk arsip per periode.`
    );
  }

  const totalEstimatedBytes = parts.reduce((sum, p) => sum + p.estimatedBytes, 0);
  const backupId = `BKP-${clock.weekKey}-${Date.now()}`.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 128);
  const companyName = String(
    options.companyName || rawDb.profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'
  ).slice(0, 160);

  const defaultLabel =
    options.triggerMode === 'AUTO_WEEKLY'
      ? `Backup Mingguan Otomatis — Minggu ${clock.weekNumber} (${clock.tanggalWib})`
      : options.triggerMode === 'PRE_RESTORE_SAFETY'
      ? `Pengaman Sebelum Restore — ${clock.tanggalWib} ${clock.jamWib.slice(0, 5)} WIB`
      : `Backup Snapshot Manual — Minggu ${clock.weekNumber} (${clock.tanggalWib})`;

  const finalLabel = (options.label?.trim() || defaultLabel).slice(0, 200);
  const finalNote = (options.note?.trim() || '').slice(0, 400);
  const ownerEmail = (user.email || '').slice(0, 160);

  options.onProgress?.({
    phase: 'PREPARING',
    completed: 0,
    total: parts.length,
    message: `Menyiapkan ${parts.length} blok data terenkripsi (${metrics.totalTransactions} transaksi)...`,
  });

  // 1. Create parent backup header doc in UPLOADING state
  const parentPath = `weeklyBackups/${backupId}`;
  const parentRef = doc(firestoreDb, 'weeklyBackups', backupId);
  try {
    await setDoc(parentRef, {
      id: backupId,
      ownerId: user.uid,
      ownerEmail,
      weekKey: clock.weekKey,
      label: finalLabel,
      triggerMode: options.triggerMode,
      status: 'UPLOADING',
      companyName,
      totalParts: parts.length,
      totalTransactions: metrics.totalTransactions,
      totalMitra: metrics.totalMitra,
      totalKaryawan: metrics.totalKaryawan,
      totalProduk: metrics.totalProduk,
      totalRekening: metrics.totalRekening,
      estimatedBytes: totalEstimatedBytes,
      tanggalWib: clock.tanggalWib,
      jamWib: clock.jamWib,
      note: finalNote,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, parentPath);
  }

  // 2. Upload parts subcollection in bounded concurrency batches (4 at a time)
  const CONCURRENCY = 4;
  let uploadedCount = 0;
  for (let i = 0; i < parts.length; i += CONCURRENCY) {
    const batch = parts.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (part) => {
        const partPath = `weeklyBackups/${backupId}/parts/${part.partId}`;
        const partRef = doc(firestoreDb, 'weeklyBackups', backupId, 'parts', part.partId);
        try {
          await setDoc(partRef, {
            partId: part.partId,
            backupId,
            ownerId: user.uid,
            sectionKey: part.sectionKey,
            chunkIndex: part.chunkIndex,
            totalChunks: part.totalChunks,
            isObjectSection: part.isObjectSection,
            records: part.records,
            objectData: part.objectData,
            itemCount: part.itemCount,
            createdAt: serverTimestamp(),
          });
          uploadedCount += 1;
          options.onProgress?.({
            phase: 'UPLOADING',
            completed: uploadedCount,
            total: parts.length,
            message: `Menyimpan blok ${uploadedCount} dari ${parts.length} (${part.sectionKey})...`,
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, partPath);
        }
      })
    );
  }

  // 3. Finalize parent backup document (UPLOADING -> COMPLETED)
  options.onProgress?.({
    phase: 'FINALIZING',
    completed: parts.length,
    total: parts.length,
    message: 'Mengunci integritas snapshot mingguan...',
  });

  try {
    await updateDoc(parentRef, {
      status: 'COMPLETED',
      totalParts: parts.length,
      estimatedBytes: totalEstimatedBytes,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, parentPath);
  }

  // 4. Update backup settings pointer
  const settings = await getOrCreateBackupSettings(user);
  const settingsPath = `backupSettings/${user.uid}`;
  try {
    await updateDoc(doc(firestoreDb, 'backupSettings', user.uid), {
      lastBackupId: backupId,
      lastBackupWeekKey: clock.weekKey,
      lastBackupAtIso: clock.iso,
      lastBackupLabel: finalLabel,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, settingsPath);
  }

  // 5. Retention cleanup (only clean oldest COMPLETED snapshots exceeding retentionWeeks)
  try {
    const allBackups = await listWeeklyBackups(user);
    const completedOwn = allBackups.filter(
      (b) => b.ownerId === user.uid && b.status === 'COMPLETED'
    );
    if (completedOwn.length > settings.retentionWeeks) {
      const toPrune = completedOwn.slice(settings.retentionWeeks);
      options.onProgress?.({
        phase: 'CLEANING',
        completed: 0,
        total: toPrune.length,
        message: `Membersihkan ${toPrune.length} arsip lama sesuai batas retensi ${settings.retentionWeeks} snapshot...`,
      });
      for (const oldBkp of toPrune) {
        await deleteWeeklyBackupSnapshot(user, oldBkp);
      }
    }
  } catch (pruneErr) {
    console.warn('Pembersihan arsip retensi dilewati:', pruneErr);
  }

  const nowMs = Date.now();
  return {
    id: backupId,
    ownerId: user.uid,
    ownerEmail,
    weekKey: clock.weekKey,
    label: finalLabel,
    triggerMode: options.triggerMode,
    status: 'COMPLETED',
    companyName,
    totalParts: parts.length,
    totalTransactions: metrics.totalTransactions,
    totalMitra: metrics.totalMitra,
    totalKaryawan: metrics.totalKaryawan,
    totalProduk: metrics.totalProduk,
    totalRekening: metrics.totalRekening,
    estimatedBytes: totalEstimatedBytes,
    tanggalWib: clock.tanggalWib,
    jamWib: clock.jamWib,
    note: finalNote,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

export async function reconstructSnapshotDatabase(
  user: User,
  backup: WeeklyBackupRecord,
  onProgress?: (progress: BackupProgress) => void
): Promise<Record<string, any>> {
  const path = `weeklyBackups/${backup.id}/parts`;
  onProgress?.({
    phase: 'FETCHING',
    completed: 0,
    total: Math.max(1, backup.totalParts),
    message: `Mengunduh ${backup.totalParts} blok data dari snapshot ${backup.weekKey}...`,
  });

  try {
    const partsCol = collection(firestoreDb, 'weeklyBackups', backup.id, 'parts');
    const q = isBootstrappedBackupAdmin(user)
      ? query(partsCol)
      : query(partsCol, where('ownerId', '==', user.uid));
    const snap = await getDocs(q);

    const groupedArrays = new Map<string, Array<{ chunkIndex: number; records: unknown[] }>>();
    const reconstructed: Record<string, any> = {};

    snap.docs.forEach((docSnap) => {
      const d = docSnap.data();
      const sectionKey = String(d.sectionKey || '');
      if (!sectionKey) return;

      if (d.isObjectSection) {
        reconstructed[sectionKey] = restoreFromFirestoreSafe(d.objectData || {});
      } else {
        const list = groupedArrays.get(sectionKey) || [];
        list.push({
          chunkIndex: Number(d.chunkIndex) || 0,
          records: Array.isArray(d.records) ? d.records : [],
        });
        groupedArrays.set(sectionKey, list);
      }
    });

    for (const [sectionKey, chunks] of groupedArrays.entries()) {
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const merged: unknown[] = [];
      for (const ch of chunks) {
        for (const rec of ch.records) {
          merged.push(restoreFromFirestoreSafe(rec));
        }
      }
      reconstructed[sectionKey] = merged;
    }

    onProgress?.({
      phase: 'FINALIZING',
      completed: snap.docs.length,
      total: Math.max(1, snap.docs.length),
      message: 'Snapshot berhasil dirakit ulang dengan utuh.',
    });

    return reconstructed;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function restoreFromWeeklySnapshot(
  user: User,
  backup: WeeklyBackupRecord,
  options?: {
    fallbackClientDb?: Record<string, any>;
    companyName?: string;
    onProgress?: (progress: BackupProgress) => void;
  }
): Promise<{ message: string; safetyBackupId: string }> {
  // 1. Automatically create a safety snapshot of current live data before restoring!
  options?.onProgress?.({
    phase: 'PREPARING',
    completed: 0,
    total: 3,
    message: 'Membuat snapshot pengaman data berjalan sebelum proses Restore...',
  });

  const safetyBackup = await createWeeklyBackupSnapshot(user, {
    triggerMode: 'PRE_RESTORE_SAFETY',
    note: `Otomatis dibuat sebelum restore snapshot ${backup.id} (${backup.tanggalWib})`,
    fallbackClientDb: options?.fallbackClientDb,
    companyName: options?.companyName,
    onProgress: options?.onProgress,
  });

  // 2. Download & reassemble target snapshot
  const reconstructedDb = await reconstructSnapshotDatabase(user, backup, options?.onProgress);

  // 3. Push restored DB into server & Supabase via existing safe restore endpoint
  options?.onProgress?.({
    phase: 'RESTORING',
    completed: 2,
    total: 3,
    message: 'Memulihkan seluruh transaksi, mitra, karyawan, dan saldo ke database utama...',
  });

  const res = await api.restoreDatabaseJson(reconstructedDb);
  return {
    message: res.message || 'Database berhasil dipulihkan dari arsip backup mingguan.',
    safetyBackupId: safetyBackup.id,
  };
}

export async function deleteWeeklyBackupSnapshot(
  user: User,
  backup: WeeklyBackupRecord
): Promise<void> {
  const partsPath = `weeklyBackups/${backup.id}/parts`;
  try {
    const partsCol = collection(firestoreDb, 'weeklyBackups', backup.id, 'parts');
    const q = isBootstrappedBackupAdmin(user)
      ? query(partsCol)
      : query(partsCol, where('ownerId', '==', user.uid));
    const partsSnap = await getDocs(q);

    const CONCURRENCY = 6;
    const docs = partsSnap.docs;
    for (let i = 0; i < docs.length; i += CONCURRENCY) {
      const batch = docs.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (partDoc) => {
          try {
            await deleteDoc(partDoc.ref);
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `${partsPath}/${partDoc.id}`);
          }
        })
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, partsPath);
  }

  const parentPath = `weeklyBackups/${backup.id}`;
  try {
    await deleteDoc(doc(firestoreDb, 'weeklyBackups', backup.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, parentPath);
  }
}
