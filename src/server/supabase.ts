import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseSchema } from './db.ts';
import { getWIBDateTime } from './db.ts';

const IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
);
const RUNTIME_CACHE_DIR = path.join(os.tmpdir(), 'wijaya_agro_erp_runtime');
const CONFIG_FILE = path.join(RUNTIME_CACHE_DIR, 'supabase_config.json');
const LEGACY_CONFIG_FILE = path.resolve(process.cwd(), 'data', 'supabase_config.json');

export interface SupabaseConfig {
  url: string;
  key: string;
  autoSync: boolean;
  lastSyncTime?: string;
  lastSyncStatus?: 'SUCCESS' | 'ERROR';
  lastSyncMessage?: string;
}

/**
 * Automatically clean and extract base Supabase Project URL.
 * Handles cases where user enters dashboard URL, project name, or appends /rest/v1/...
 */
export function sanitizeSupabaseUrl(rawUrl: string, key?: string): string {
  let url = (rawUrl || '').trim();

  const dashboardMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9_-]+)/i);
  if (dashboardMatch) {
    return `https://${dashboardMatch[1]}.supabase.co`;
  }

  const coMatch = url.match(/([a-z0-9_-]+)\.supabase\.co/i);
  if (coMatch) {
    return `https://${coMatch[1]}.supabase.co`;
  }

  if (/^[a-z0-9]{15,30}$/i.test(url)) {
    return `https://${url}.supabase.co`;
  }

  if (key && key.includes('.')) {
    try {
      const parts = key.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload.ref) {
          return `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {}
  }

  url = url.replace(/\/rest\/v1.*$/i, '').replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function countAllTransactions(data: Partial<DatabaseSchema> | undefined | null): number {
  if (!data) return 0;
  return (
    (data.penjualan?.length || 0) +
    (data.pembelianBarang?.length || 0) +
    (data.pembelianHasilBumi?.length || 0) +
    (data.penjualanHasilBumi?.length || 0) +
    (data.pencairanTitipan?.length || 0) +
    (data.kasbonUang?.length || 0) +
    (data.bayarBon?.length || 0) +
    (data.pengeluaran?.length || 0) +
    (data.uangMasuk?.length || 0) +
    (data.transferRekening?.length || 0) +
    (data.brilink?.length || 0) +
    (data.penggajian?.length || 0) +
    (data.upahHarian?.length || 0)
  );
}

class SupabaseSyncEngine {
  private client: SupabaseClient | null = null;
  private config: SupabaseConfig = {
    url: '',
    key: '',
    autoSync: true,
  };
  private isSyncing = false;
  private queuedData: DatabaseSchema | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private hydrationPromise: Promise<void> | null = null;
  private storageUnavailableUntil = 0;
  private hasVerifiedCloudState = false;
  private serverlessInitialized = false;
  private lastCloudCheckAt = 0;
  private activeFreshCheckPromise: Promise<void> | null = null;
  private hasUnsyncedLocalChanges = false;
  private lastLocalMutationAt = 0;
  private lastMirrorFingerprint = '';
  private retryTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.loadConfig();
    this.initClient();
  }

  private loadConfig() {
    const isLikelyValidKey = (k?: string | null): boolean => {
      const s = String(k || '').trim();
      return s.length >= 20 && !/^https?:\/\//i.test(s);
    };

    const envKey = [
      process.env.SUPABASE_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.VITE_SUPABASE_ANON_KEY,
    ].find((k) => isLikelyValidKey(k)) || '';
    const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

    const candidateFiles = [CONFIG_FILE, LEGACY_CONFIG_FILE];
    for (const file of candidateFiles) {
      try {
        if (fs.existsSync(file)) {
          const raw = fs.readFileSync(file, 'utf-8');
          const parsed = JSON.parse(raw);
          const candidateKey = isLikelyValidKey(parsed.key) ? String(parsed.key).trim() : '';
          const rawKey =
            (parsed.lastSyncStatus === 'ERROR' && envKey ? envKey : candidateKey) || envKey;
          const rawUrl = parsed.url || envUrl;
          if (rawUrl && rawKey) {
            this.config = {
              url: sanitizeSupabaseUrl(rawUrl, rawKey),
              key: rawKey,
              autoSync: parsed.autoSync !== undefined ? parsed.autoSync : true,
              lastSyncTime: parsed.lastSyncTime,
              lastSyncStatus: parsed.lastSyncStatus,
              lastSyncMessage: parsed.lastSyncMessage,
            };
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to load supabase_config.json:', e);
      }
    }

    this.config = {
      url: sanitizeSupabaseUrl(envUrl, envKey),
      key: envKey,
      autoSync: true,
    };
  }

  private saveConfig() {
    const jsonPayload = JSON.stringify(this.config, null, 2);
    try {
      if (!fs.existsSync(RUNTIME_CACHE_DIR)) {
        fs.mkdirSync(RUNTIME_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, jsonPayload, 'utf-8');
    } catch (e) {
      console.warn('Runtime supabase config cache skipped:', e);
    }

    // Mirror to workspace data/supabase_config.json (gitignored) when writable so dev/preview restarts auto-connect
    if (!IS_SERVERLESS) {
      try {
        const legacyDir = path.dirname(LEGACY_CONFIG_FILE);
        if (!fs.existsSync(legacyDir)) {
          fs.mkdirSync(legacyDir, { recursive: true });
        }
        fs.writeFileSync(LEGACY_CONFIG_FILE, jsonPayload, 'utf-8');
      } catch {
        // Ignore on read-only containers
      }
    }
  }

  public reloadConfigIfMissing(): boolean {
    if (this.client && this.config.url && this.config.key) {
      return true;
    }
    this.loadConfig();
    this.initClient();
    return Boolean(this.client && this.config.url && this.config.key);
  }

  public getReconnectBundle(): string | null {
    if (!this.config.url || !this.config.key) {
      this.reloadConfigIfMissing();
    }
    if (!this.config.url || !this.config.key) {
      return null;
    }
    try {
      return Buffer.from(
        JSON.stringify({
          u: this.config.url,
          k: this.config.key,
          a: this.config.autoSync !== false,
        }),
        'utf-8'
      ).toString('base64');
    } catch {
      return null;
    }
  }

  public parseReconnectBundle(bundle?: string): { url: string; key: string; autoSync: boolean } | null {
    if (!bundle || typeof bundle !== 'string') return null;
    try {
      const decoded = Buffer.from(bundle.trim(), 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded);
      const url = sanitizeSupabaseUrl(String(parsed?.u || parsed?.url || ''), String(parsed?.k || parsed?.key || ''));
      const key = String(parsed?.k || parsed?.key || '').trim();
      if (url && key) {
        return {
          url,
          key,
          autoSync: parsed?.a !== false && parsed?.autoSync !== false,
        };
      }
    } catch {}
    return null;
  }

  private initClient() {
    if (this.config.url && this.config.key) {
      try {
        this.client = createClient(this.config.url, this.config.key, {
          auth: { persistSession: false },
        });
      } catch (err) {
        console.error('Failed to initialize Supabase client:', err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }

  public isConfigured(): boolean {
    if (!this.client || !this.config.url || !this.config.key) {
      this.reloadConfigIfMissing();
    }
    return Boolean(this.client && this.config.url && this.config.key);
  }

  public getStatus() {
    return {
      configured: Boolean(this.config.url && this.config.key),
      url: this.config.url ? this.config.url.replace(/(https?:\/\/)(.{4}).+(.{4}\.supabase\.co)/, '$1$2***$3') : '',
      fullUrl: this.config.url || '',
      hasKey: Boolean(this.config.key),
      keyPreview: this.config.key ? `${this.config.key.slice(0, 6)}...${this.config.key.slice(-4)}` : '',
      autoSync: this.config.autoSync,
      lastSyncTime: this.config.lastSyncTime || null,
      lastSyncStatus: this.config.lastSyncStatus || null,
      lastSyncMessage: this.config.lastSyncMessage || null,
    };
  }

  public updateConfig(newConfig: { url: string; key: string; autoSync?: boolean }) {
    const candidateKey = String(newConfig.key || '').trim();
    const isValidCandidate = candidateKey.length >= 20 && !/^https?:\/\//i.test(candidateKey);
    const rawKey = isValidCandidate ? candidateKey : this.config.key;
    this.config.key = rawKey;
    this.config.url = sanitizeSupabaseUrl(newConfig.url, rawKey);
    if (newConfig.autoSync !== undefined) {
      this.config.autoSync = newConfig.autoSync;
    }
    this.storageUnavailableUntil = 0;
    this.hasVerifiedCloudState = false;
    this.saveConfig();
    this.initClient();
    return this.getStatus();
  }

  /**
   * Ensure initial hydration from Supabase has completed before serving API requests
   */
  public async ensureHydrated(): Promise<void> {
    if (this.hydrationPromise) {
      try {
        await this.hydrationPromise;
      } catch {}
    }
  }

  public markLocalMutation(data: DatabaseSchema) {
    this.hasUnsyncedLocalChanges = true;
    this.lastLocalMutationAt = Date.now();
    this.queuedData = data;
  }

  public hasPendingLocalChanges(): boolean {
    return (
      this.hasUnsyncedLocalChanges ||
      this.isSyncing ||
      this.queuedData !== null ||
      Date.now() - this.lastLocalMutationAt < 15000
    );
  }

  public async ensureInitializedOnce(dbManager: any): Promise<void> {
    await this.ensureHydrated();
    if (!this.isConfigured() || !this.client) return;
    if (!this.serverlessInitialized) {
      await this.initOnServerStart(dbManager);
    }
  }

  /**
   * Compacts JSONB state before upserting to Supabase so wijaya_agro_erp_state never hits Postgres statement_timeout:
   * 1. Caps auditLogs to latest 250 entries.
   * 2. Deduplicates identical base64 strings between fotoNota and fotoNotaList.
   * 3. Offloads heavy inline base64 images (>25KB) to Supabase Storage bucket ('erp-bukti-nota') incrementally.
   */
  private async prepareCompactCloudData(data: DatabaseSchema): Promise<void> {
    if (Array.isArray(data.auditLogs) && data.auditLogs.length > 250) {
      data.auditLogs = data.auditLogs.slice(0, 250);
    }

    let uploadsRemaining = 4;
    const maybeOffloadField = async (obj: any, field: string, prefix: string) => {
      if (!obj || uploadsRemaining <= 0) return;
      const val = obj[field];
      if (typeof val === 'string' && val.startsWith('data:image/') && val.length > 25000) {
        uploadsRemaining--;
        const uploadedUrl = await this.uploadBuktiImage(val, prefix);
        if (uploadedUrl) {
          obj[field] = uploadedUrl;
        }
      }
    };

    const collectionsWithPhotos: Array<{ list?: any[]; field: string; listField?: string; prefix: string }> = [
      { list: data.pembelianHasilBumi, field: 'fotoNota', listField: 'fotoNotaList', prefix: 'phb' },
      { list: data.kasbonUang, field: 'fotoNota', listField: 'fotoNotaList', prefix: 'ksb' },
      { list: data.pembelianBarang, field: 'fotoNota', prefix: 'pbr' },
      { list: data.penjualan, field: 'fotoNota', prefix: 'pnj' },
      { list: data.bayarBon, field: 'fotoNota', prefix: 'byb' },
      { list: data.bayarBon, field: 'fotoBukti', prefix: 'byb' },
      { list: data.pengeluaran, field: 'fotoKuitansi', prefix: 'exp' },
      { list: data.brilink, field: 'fotoBukti', prefix: 'bri' },
      { list: data.uangMasuk, field: 'fotoBukti', prefix: 'ums' },
      { list: data.inventaris, field: 'fotoItem', prefix: 'inv' },
      { list: data.inventaris, field: 'fotoStnk', prefix: 'stnk' },
    ];

    for (const col of collectionsWithPhotos) {
      if (!Array.isArray(col.list)) continue;
      for (const item of col.list) {
        if (!item) continue;
        // Deduplicate identical inline base64 stored in both fotoNota and fotoNotaList[0]
        if (
          col.listField &&
          Array.isArray(item[col.listField]) &&
          item[col.listField].length === 1 &&
          typeof item[col.field] === 'string' &&
          item[col.listField][0] === item[col.field] &&
          item[col.field].startsWith('data:image/')
        ) {
          await maybeOffloadField(item, col.field, col.prefix);
          if (typeof item[col.field] === 'string' && !item[col.field].startsWith('data:image/')) {
            item[col.listField] = [item[col.field]];
          } else {
            // Avoid storing two copies of a large base64 string in the same JSON object
            delete item[col.listField];
          }
          continue;
        }

        if (uploadsRemaining > 0) {
          await maybeOffloadField(item, col.field, col.prefix);
        }
        if (col.listField && Array.isArray(item[col.listField]) && uploadsRemaining > 0) {
          for (let idx = 0; idx < item[col.listField].length; idx++) {
            const v = item[col.listField][idx];
            if (typeof v === 'string' && v.startsWith('data:image/') && v.length > 25000 && uploadsRemaining > 0) {
              uploadsRemaining--;
              const url = await this.uploadBuktiImage(v, `${col.prefix}_${idx}`);
              if (url) {
                item[col.listField][idx] = url;
                if (idx === 0 && (!item[col.field] || item[col.field] === v)) {
                  item[col.field] = url;
                }
              }
            }
          }
        }
      }
    }
  }

  /**
   * Test connection to Supabase
   */
  public async testConnection(): Promise<{ success: boolean; message: string; tableExists?: boolean }> {
    if (!this.client) {
      return {
        success: false,
        message: 'Supabase URL dan API Key belum dikonfigurasi.',
      };
    }

    try {
      const { error } = await this.client
        .from('wijaya_agro_erp_state')
        .select('id, updated_at')
        .limit(1);

      if (error) {
        if (error.code === '42P01' || error.message.includes('does not exist')) {
          return {
            success: true,
            tableExists: false,
            message: 'Terkoneksi ke Supabase! Tabel "wijaya_agro_erp_state" belum dibuat. Buka skrip SQL inisialisasi di bawah pada Supabase SQL Editor.',
          };
        }
        throw error;
      }

      return {
        success: true,
        tableExists: true,
        message: 'Koneksi ke Cloud Supabase aktif & stabil (Single Source of Truth).',
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Gagal terhubung ke Supabase: ${err.message || 'Periksa kembali URL & Key'}`,
      };
    }
  }

  /**
   * Push complete ERP data to Supabase (Upsert canonical state into wijaya_agro_erp_state + relational mirrors)
   */
  public async pushToSupabase(
    data: DatabaseSchema,
    options?: { allowOverwrite?: boolean; awaitMirrors?: boolean }
  ): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: false, message: 'Supabase belum dikonfigurasi' };
    }

    try {
      const now = getWIBDateTime();
      const txCount = countAllTransactions(data);
      const produkCount = data.produk?.length || 0;
      const karyawanCount = data.karyawan?.length || 0;
      const mitraCount = data.mitra?.length || 0;

      // Safety guard for Cloud Run / AI Studio cold-container restarts:
      // Never allow an unverified cold container to overwrite richer Cloud Supabase state
      const latestAuditId = data.auditLogs?.[0]?.idTransaksi || '';
      const isExplicitAdminResetOrRestore =
        options?.allowOverwrite ||
        latestAuditId === 'SYS-RESET' ||
        latestAuditId === 'SYS-CLEAN-DATA' ||
        latestAuditId === 'SYS-RESTORE';

      if (!this.hasVerifiedCloudState && !isExplicitAdminResetOrRestore) {
        const { data: remoteMeta, error: metaErr } = await this.client
          .from('wijaya_agro_erp_state')
          .select('mitra_count, karyawan_count, transaksi_count')
          .eq('id', 'MAIN_DATABASE')
          .maybeSingle();

        if (!metaErr && remoteMeta) {
          const cloudScore =
            (remoteMeta.mitra_count || 0) +
            (remoteMeta.karyawan_count || 0) +
            (remoteMeta.transaksi_count || 0);
          const localScore = mitraCount + karyawanCount + txCount;
          if (cloudScore > localScore) {
            console.warn(
              `[SupabaseSyncEngine] Menahan timpaan dari container baru (Cloud=${cloudScore} > Lokal=${localScore}).`
            );
            return {
              success: false,
              message: 'Proteksi aktif: Mencegah penimpaan data Cloud yang lebih lengkap.',
            };
          }
        }
        this.hasVerifiedCloudState = true;
      }

      await this.prepareCompactCloudData(data);

      const payload = {
        id: 'MAIN_DATABASE',
        data,
        karyawan_count: karyawanCount,
        mitra_count: mitraCount,
        transaksi_count: txCount,
        updated_at: now.iso,
        updated_by: 'KasirWap ERP',
      };

      let stateError: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await this.client
          .from('wijaya_agro_erp_state')
          .upsert(payload, { onConflict: 'id' });
        stateError = res.error;
        if (!stateError) break;
        if (stateError.code === '42P01' || String(stateError.message || '').includes('does not exist')) {
          break;
        }
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 650));
        }
      }

      if (stateError) {
        if (stateError.code === '42P01' || String(stateError.message || '').includes('does not exist')) {
          throw new Error(
            'Tabel "wijaya_agro_erp_state" belum ada di Supabase. Silakan jalankan skrip SQL inisialisasi di Supabase SQL Editor.'
          );
        }
        throw stateError;
      }

      this.hasVerifiedCloudState = true;
      if (this.queuedData === null) {
        this.hasUnsyncedLocalChanges = false;
      }
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }

      // Mirror into optional relational tables ONLY when master counts/fingerprints change (prevents 6,800+ request storm)
      const stokFingerprintSum = (data.stokBarang || []).reduce((acc, s) => acc + (Number(s.stok) || 0), 0);
      const mirrorFp = `${produkCount}:${mitraCount}:${karyawanCount}:${stokFingerprintSum}:${data.produk?.[0]?.hargaBeli || 0}:${data.mitra?.[mitraCount - 1]?.id || ''}:${data.karyawan?.[karyawanCount - 1]?.id || ''}`;
      const shouldMirror = Boolean(options?.awaitMirrors) || mirrorFp !== this.lastMirrorFingerprint;

      if (shouldMirror) {
        this.lastMirrorFingerprint = mirrorFp;
        const clientRef = this.client;
        const runMirrors = async () => {
          const mirrorTasks: Promise<any>[] = [];

          if (data.karyawan && data.karyawan.length > 0) {
            const kRows = data.karyawan.map((k) => ({
              id: k.id,
              nik: k.nik,
              nama: k.nama,
              jabatan: k.jabatan,
              divisi: k.divisi || k.departemen || 'Gudang',
              telepon: k.telepon,
              status: k.status,
              upah_harian_standar: (k as any).upahHarianStandar || k.gajiPokok || 0,
              uang_makan_standar: (k as any).uangMakanStandar || k.tunjanganTetap || 0,
              updated_at: now.iso,
            }));
            mirrorTasks.push(Promise.resolve(clientRef.from('karyawan').upsert(kRows, { onConflict: 'id' })));
          }

          if (data.mitra && data.mitra.length > 0) {
            const mRows = data.mitra.map((m) => ({
              id: m.id,
              kode: m.kode,
              nama: m.nama,
              role: m.role,
              telepon: m.telepon,
              alamat: m.alamat,
              status: m.status,
              updated_at: now.iso,
            }));
            mirrorTasks.push(Promise.resolve(clientRef.from('mitra').upsert(mRows, { onConflict: 'id' })));
          }

          if (data.produk && data.produk.length > 0) {
            const stokMap = new Map((data.stokBarang || []).map((s) => [s.kode, s.stok]));
            const pRows = data.produk.map((p) => ({
              kode: p.kode,
              nama: p.nama,
              kategori: p.kategori,
              satuan: p.satuan,
              harga_beli: p.hargaBeli || 0,
              harga_jual: p.hargaJual || 0,
              harga_khusus_rekanan: p.hargaKhususRekanan || p.hargaJual || 0,
              stok: stokMap.get(p.kode) ?? 0,
              status: p.status || 'AKTIF',
              updated_at: now.iso,
            }));
            mirrorTasks.push(Promise.resolve(clientRef.from('produk').upsert(pRows, { onConflict: 'kode' })));
          }

          if (mirrorTasks.length > 0) {
            await Promise.allSettled(mirrorTasks);
          }
        };

        if (options?.awaitMirrors) {
          await runMirrors();
        } else {
          void runMirrors().catch(() => {});
        }
      }

      this.config.lastSyncTime = now.iso;
      this.config.lastSyncStatus = 'SUCCESS';
      this.config.lastSyncMessage = `Tersinkron ke Supabase (${produkCount} produk, ${mitraCount} mitra, ${karyawanCount} karyawan, ${txCount} transaksi)`;
      this.saveConfig();

      return {
        success: true,
        message: this.config.lastSyncMessage,
      };
    } catch (err: any) {
      this.hasUnsyncedLocalChanges = true;
      if (!this.queuedData) {
        this.queuedData = data;
      }
      if (!this.retryTimer && !IS_SERVERLESS) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.drainQueue();
        }, 4000);
      }
      this.config.lastSyncStatus = 'ERROR';
      this.config.lastSyncMessage = err.message || 'Gagal sinkron ke Supabase';
      this.saveConfig();
      return { success: false, message: this.config.lastSyncMessage || 'Gagal sinkron ke Supabase' };
    }
  }

  /**
   * Pull canonical ERP data from Supabase
   */
  public async pullFromSupabase(): Promise<{
    success: boolean;
    data?: DatabaseSchema;
    updatedAt?: string;
    isEmpty?: boolean;
    message: string;
  }> {
    if (!this.client) {
      return { success: false, message: 'Supabase belum dikonfigurasi' };
    }

    try {
      const { data, error } = await this.client
        .from('wijaya_agro_erp_state')
        .select('*')
        .eq('id', 'MAIN_DATABASE')
        .maybeSingle();

      if (error) throw error;
      if (!data || !data.data) {
        this.hasVerifiedCloudState = true;
        return {
          success: false,
          isEmpty: true,
          message: 'Snapshot MAIN_DATABASE belum ada di tabel wijaya_agro_erp_state',
        };
      }

      this.hasVerifiedCloudState = true;
      const now = getWIBDateTime();
      this.config.lastSyncTime = data.updated_at || now.iso;
      this.config.lastSyncStatus = 'SUCCESS';
      this.config.lastSyncMessage = 'Database aktif terhubung langsung dari Cloud Supabase';
      this.saveConfig();

      return {
        success: true,
        data: data.data as DatabaseSchema,
        updatedAt: data.updated_at,
        message: this.config.lastSyncMessage,
      };
    } catch (err: any) {
      this.config.lastSyncStatus = 'ERROR';
      this.config.lastSyncMessage = err.message || 'Gagal menarik data dari Supabase';
      this.saveConfig();
      return { success: false, message: this.config.lastSyncMessage || 'Gagal menarik data dari Supabase' };
    }
  }

  private async drainQueue(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      while (this.queuedData) {
        const snapshot = this.queuedData;
        this.queuedData = null;
        await this.pushToSupabase(snapshot);
      }
    } catch (e) {
      console.warn('[SupabaseSyncEngine] Auto-sync queue error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Immediate write-through flush to Supabase with bounded wait so mutations persist to Supabase right away
   */
  public async flushSync(data: DatabaseSchema, maxWaitMs = 4500): Promise<void> {
    if (!this.config.autoSync || !this.client) return;
    this.markLocalMutation(data);
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }

    const syncTask = this.drainQueue();
    await Promise.race([
      syncTask,
      new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
    ]);
  }

  /**
   * Non-blocking debounced trigger (for synchronous callers)
   */
  public triggerAutoSync(data: DatabaseSchema) {
    if (!this.config.autoSync || !this.client) return;
    this.markLocalMutation(data);

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.syncTimer = setTimeout(() => {
      void this.drainQueue();
    }, 150);
  }

  /**
   * Safe Cloud-First Reconnection:
   * Always pulls existing cloud data from Supabase FIRST so ephemeral container restarts NEVER overwrite cloud data.
   * Only pushes local data if Supabase has no MAIN_DATABASE row yet, OR if local clearly has richer active data than an empty cloud row.
   */
  public async syncSmartWithCloud(dbManager: any): Promise<{
    direction: 'PULLED_FROM_SUPABASE' | 'PUSHED_TO_SUPABASE' | 'SKIPPED';
    message: string;
  }> {
    if (!this.client || !this.config.url || !this.config.key) {
      return { direction: 'SKIPPED', message: 'Supabase belum dikonfigurasi.' };
    }

    const pullResult = await this.pullFromSupabase();
    if (pullResult.success && pullResult.data) {
      const cloud = pullResult.data;
      const local: DatabaseSchema = dbManager.get();

      const cloudScore =
        (cloud.mitra?.length || 0) +
        (cloud.karyawan?.length || 0) +
        countAllTransactions(cloud);
      const localScore =
        (local.mitra?.length || 0) +
        (local.karyawan?.length || 0) +
        countAllTransactions(local);

      if (cloudScore === 0 && localScore > 0) {
        const pushRes = await this.pushToSupabase(local);
        return {
          direction: 'PUSHED_TO_SUPABASE',
          message: pushRes.message,
        };
      }

      await dbManager.hydrateFromSupabase(cloud);
      return {
        direction: 'PULLED_FROM_SUPABASE',
        message: `Data utama berhasil dimuat dari Cloud Supabase (${cloud.produk?.length || 0} produk, ${cloud.mitra?.length || 0} mitra, ${cloud.karyawan?.length || 0} karyawan, ${countAllTransactions(cloud)} transaksi).`,
      };
    }

    if (pullResult.isEmpty) {
      const pushRes = await this.pushToSupabase(dbManager.get());
      return {
        direction: 'PUSHED_TO_SUPABASE',
        message: pushRes.success
          ? `Inisialisasi database ke Cloud Supabase berhasil (${pushRes.message}).`
          : pushRes.message,
      };
    }

    return {
      direction: 'SKIPPED',
      message: pullResult.message,
    };
  }

  private startBackgroundPolling(dbManager: any) {
    if (IS_SERVERLESS) {
      return;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    this.pollTimer = setInterval(async () => {
      try {
        if (!this.isConfigured() || !this.config.autoSync || !this.client) {
          return;
        }

        // ANTI-ROLLBACK GUARD: Never pull stale cloud snapshot while local mutations are pending/unsynced
        if (this.hasPendingLocalChanges()) {
          if (this.hasUnsyncedLocalChanges && !this.isSyncing && this.queuedData) {
            void this.drainQueue();
          }
          return;
        }

        // Self-heal if initial hydration had not yet verified cloud state (e.g. boot network blip)
        if (!this.hasVerifiedCloudState) {
          const healRes = await this.syncSmartWithCloud(dbManager);
          if (healRes.direction !== 'SKIPPED') {
            console.log(`[SupabaseSyncEngine] Auto-reconnected di background: ${healRes.message}`);
          }
          return;
        }

        const { data, error } = await this.client
          .from('wijaya_agro_erp_state')
          .select('updated_at')
          .eq('id', 'MAIN_DATABASE')
          .maybeSingle();

        if (!error && data && data.updated_at && !this.hasPendingLocalChanges()) {
          const remoteTime = new Date(data.updated_at).getTime();
          const localSyncTime = this.config.lastSyncTime ? new Date(this.config.lastSyncTime).getTime() : 0;
          if (remoteTime > localSyncTime + 2500) {
            console.log('[SupabaseSyncEngine] Pembaruan terdeteksi di Cloud Supabase. Menyinkronkan...');
            const pull = await this.pullFromSupabase();
            if (pull.success && pull.data && !this.hasPendingLocalChanges()) {
              await dbManager.hydrateFromSupabase(pull.data);
              console.log('[SupabaseSyncEngine] Database berhasil diperbarui dari Cloud Supabase.');
            }
          }
        }
      } catch {
        // Silent background check
      }
    }, 25000);
  }

  /**
   * Ensures cold starts hydrate from Cloud Supabase AND warm instances automatically
   * self-heal / pull fresh snapshots whenever Cloud Supabase changes.
   */
  public async ensureFreshCloudState(dbManager: any, maxAgeMs = 30000): Promise<void> {
    await this.ensureHydrated();
    if (!this.isConfigured() || !this.client) {
      return;
    }

    // ANTI-ROLLBACK GUARD: If local mutations exist or were just committed, push them out — NEVER overwrite local memory!
    if (this.hasPendingLocalChanges()) {
      if (this.hasUnsyncedLocalChanges && !this.isSyncing && this.queuedData) {
        void this.drainQueue();
      }
      return;
    }

    const now = Date.now();
    const needsImmediateRecovery = !this.serverlessInitialized || !this.hasVerifiedCloudState;
    if (!needsImmediateRecovery && (now - this.lastCloudCheckAt < maxAgeMs || this.isSyncing || this.queuedData)) {
      return;
    }

    if (this.activeFreshCheckPromise) {
      await this.activeFreshCheckPromise;
      return;
    }

    this.activeFreshCheckPromise = (async () => {
      try {
        if (!this.serverlessInitialized) {
          await this.initOnServerStart(dbManager);
          return;
        }

        this.lastCloudCheckAt = Date.now();

        if (this.hasPendingLocalChanges()) return;

        if (!this.hasVerifiedCloudState) {
          await this.syncSmartWithCloud(dbManager);
          return;
        }

        if (!this.client) return;
        const { data, error } = await this.client
          .from('wijaya_agro_erp_state')
          .select('updated_at')
          .eq('id', 'MAIN_DATABASE')
          .maybeSingle();

        if (!error && data && data.updated_at && !this.hasPendingLocalChanges()) {
          const remoteTime = new Date(data.updated_at).getTime();
          const localSyncTime = this.config.lastSyncTime ? new Date(this.config.lastSyncTime).getTime() : 0;
          if (remoteTime > localSyncTime + 2000) {
            const pull = await this.pullFromSupabase();
            if (pull.success && pull.data && !this.hasPendingLocalChanges()) {
              await dbManager.hydrateFromSupabase(pull.data);
            }
          }
        }
      } catch {
        // Non-fatal check on warm request
      } finally {
        this.activeFreshCheckPromise = null;
      }
    })();

    await this.activeFreshCheckPromise;
  }

  /**
   * Server startup initialization:
   * Hydrates database from Supabase BEFORE serving requests so Supabase is the single source of truth.
   * Always starts background self-healing polling even if initial network check experiences a transient blip.
   */
  public async initOnServerStart(dbManager: any) {
    const runHydration = async () => {
      if (!this.isConfigured() || !this.client) {
        console.log('[SupabaseSyncEngine] Menunggu kredensial Cloud Supabase.');
        return;
      }

      this.serverlessInitialized = true;
      this.startBackgroundPolling(dbManager);

      console.log('[SupabaseSyncEngine] Menghubungkan ke Single Source of Truth Cloud Supabase...');
      try {
        const test = await this.testConnection();
        if (!test.success) {
          console.warn('[SupabaseSyncEngine] Koneksi Supabase belum merespons saat startup (akan auto-retry):', test.message);
          return;
        }

        if (test.tableExists !== false) {
          const syncRes = await this.syncSmartWithCloud(dbManager);
          console.log(`[SupabaseSyncEngine] [${syncRes.direction}] ${syncRes.message}`);
        }

        this.lastCloudCheckAt = Date.now();
      } catch (err) {
        console.warn('[SupabaseSyncEngine] Error saat inisialisasi startup (akan auto-retry):', err);
      }
    };

    this.hydrationPromise = Promise.race([
      runHydration(),
      new Promise<void>((resolve) => setTimeout(resolve, IS_SERVERLESS ? 8500 : 12000)),
    ]);

    await this.hydrationPromise;
    this.hydrationPromise = null;
  }

  /**
   * Generate SQL DDL script for setting up Supabase tables
   */
  public getSqlSchemaScript(): string {
    return `-- ==========================================================
-- SKRIP INISIALISASI DATABASE SUPABASE: PT. WIJAYA AGRO PERKASA
-- Jalankan skrip ini di: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==========================================================

-- 1. Tabel Utama Single Source of Truth ERP (Seluruh Modul Terpadu)
CREATE TABLE IF NOT EXISTS wijaya_agro_erp_state (
  id TEXT PRIMARY KEY DEFAULT 'MAIN_DATABASE',
  data JSONB NOT NULL,
  karyawan_count INT DEFAULT 0,
  mitra_count INT DEFAULT 0,
  transaksi_count INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'KasirWap ERP'
);

CREATE INDEX IF NOT EXISTS idx_erp_state_updated ON wijaya_agro_erp_state (updated_at);

-- 2. Tabel Relasional Produk & Stok Barang
CREATE TABLE IF NOT EXISTS produk (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kategori TEXT DEFAULT 'LAINNYA',
  satuan TEXT DEFAULT 'SAK',
  harga_beli NUMERIC DEFAULT 0,
  harga_jual NUMERIC DEFAULT 0,
  harga_khusus_rekanan NUMERIC DEFAULT 0,
  stok NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'AKTIF',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabel Relasional Karyawan
CREATE TABLE IF NOT EXISTS karyawan (
  id TEXT PRIMARY KEY,
  nik TEXT,
  nama TEXT NOT NULL,
  jabatan TEXT,
  divisi TEXT,
  telepon TEXT,
  status TEXT DEFAULT 'AKTIF',
  upah_harian_standar NUMERIC DEFAULT 0,
  uang_makan_standar NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabel Relasional Mitra (Petani, Supplier, Customer, Karyawan)
CREATE TABLE IF NOT EXISTS mitra (
  id TEXT PRIMARY KEY,
  kode TEXT,
  nama TEXT NOT NULL,
  role TEXT DEFAULT 'MITRA_TANI',
  telepon TEXT,
  alamat TEXT,
  status TEXT DEFAULT 'AKTIF',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable Row Level Security (RLS) & Policy Akses Aplikasi
ALTER TABLE wijaya_agro_erp_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE produk ENABLE ROW LEVEL SECURITY;
ALTER TABLE karyawan ENABLE ROW LEVEL SECURITY;
ALTER TABLE mitra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated/anon" ON wijaya_agro_erp_state;
CREATE POLICY "Allow all for authenticated/anon" ON wijaya_agro_erp_state FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated/anon" ON produk;
CREATE POLICY "Allow all for authenticated/anon" ON produk FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated/anon" ON karyawan;
CREATE POLICY "Allow all for authenticated/anon" ON karyawan FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated/anon" ON mitra;
CREATE POLICY "Allow all for authenticated/anon" ON mitra FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. Bucket Supabase Storage untuk Foto Bukti Nota & Inventaris (Anti-Bloat JSONB)
INSERT INTO storage.buckets (id, name, public)
VALUES ('erp-bukti-nota', 'erp-bukti-nota', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access erp-bukti-nota" ON storage.objects;
CREATE POLICY "Public Access erp-bukti-nota"
ON storage.objects FOR ALL TO anon, authenticated
USING (bucket_id = 'erp-bukti-nota')
WITH CHECK (bucket_id = 'erp-bukti-nota');
`;
  }

  /**
   * Offloads base64 receipt/evidence photos to Supabase Storage bucket ('erp-bukti-nota').
   * Returns lightweight public HTTPS URL (~100 bytes) if successful, or null so caller can safely fall back to compressed inline JPEG.
   */
  public async uploadBuktiImage(dataUrl: string, prefix = 'bukti'): Promise<string | null> {
    if (!this.client || !dataUrl || !dataUrl.startsWith('data:image/')) {
      return null;
    }
    if (Date.now() < this.storageUnavailableUntil) {
      return null;
    }

    try {
      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) return null;

      const contentType = match[1];
      const base64Body = match[2];
      const buffer = Buffer.from(base64Body, 'base64');
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
      const safePrefix = String(prefix || 'bukti').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'bukti';
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const rand = Math.random().toString(36).slice(2, 8);
      const objectPath = `${ym}/${safePrefix}_${Date.now()}_${rand}.${ext}`;
      const bucketName = 'erp-bukti-nota';

      let { error: uploadErr } = await this.client.storage
        .from(bucketName)
        .upload(objectPath, buffer, { contentType, upsert: true });

      if (uploadErr && (uploadErr.message?.toLowerCase().includes('not found') || uploadErr.message?.toLowerCase().includes('bucket'))) {
        try {
          await this.client.storage.createBucket(bucketName, { public: true });
          const retry = await this.client.storage
            .from(bucketName)
            .upload(objectPath, buffer, { contentType, upsert: true });
          uploadErr = retry.error;
        } catch {
          // Ignore bucket creation error; will return null below
        }
      }

      if (uploadErr) {
        this.storageUnavailableUntil = Date.now() + 5 * 60 * 1000;
        return null;
      }

      const { data: pub } = this.client.storage.from(bucketName).getPublicUrl(objectPath);
      return pub?.publicUrl || null;
    } catch {
      this.storageUnavailableUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
  }
}

export const supabaseSyncEngine = new SupabaseSyncEngine();
