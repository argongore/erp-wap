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
    (data.transferRekening?.length || 0) +
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

  constructor() {
    this.loadConfig();
    this.initClient();
  }

  private loadConfig() {
    const candidateFiles = [CONFIG_FILE, LEGACY_CONFIG_FILE];
    for (const file of candidateFiles) {
      try {
        if (fs.existsSync(file)) {
          const raw = fs.readFileSync(file, 'utf-8');
          const parsed = JSON.parse(raw);
          const rawKey =
            parsed.key ||
            process.env.SUPABASE_KEY ||
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY ||
            '';
          const rawUrl =
            parsed.url || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
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

    const envKey =
      process.env.SUPABASE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      '';
    const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    this.config = {
      url: sanitizeSupabaseUrl(envUrl, envKey),
      key: envKey,
      autoSync: true,
    };
  }

  private saveConfig() {
    try {
      if (!fs.existsSync(RUNTIME_CACHE_DIR)) {
        fs.mkdirSync(RUNTIME_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.warn('Runtime supabase config cache skipped:', e);
    }
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
    const rawKey = newConfig.key.trim() || this.config.key;
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

      const payload = {
        id: 'MAIN_DATABASE',
        data,
        karyawan_count: karyawanCount,
        mitra_count: mitraCount,
        transaksi_count: txCount,
        updated_at: now.iso,
        updated_by: 'KasirWap ERP',
      };

      const { error: stateError } = await this.client
        .from('wijaya_agro_erp_state')
        .upsert(payload, { onConflict: 'id' });

      if (stateError) {
        if (stateError.code === '42P01' || stateError.message.includes('does not exist')) {
          throw new Error(
            'Tabel "wijaya_agro_erp_state" belum ada di Supabase. Silakan jalankan skrip SQL inisialisasi di Supabase SQL Editor.'
          );
        }
        throw stateError;
      }

      this.hasVerifiedCloudState = true;

      // Mirror into optional relational tables in parallel in background (or awaited on manual push)
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

      this.config.lastSyncTime = now.iso;
      this.config.lastSyncStatus = 'SUCCESS';
      this.config.lastSyncMessage = `Tersinkron ke Supabase (${produkCount} produk, ${mitraCount} mitra, ${karyawanCount} karyawan, ${txCount} transaksi)`;
      this.saveConfig();

      return {
        success: true,
        message: this.config.lastSyncMessage,
      };
    } catch (err: any) {
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
  public async flushSync(data: DatabaseSchema, maxWaitMs = 2500): Promise<void> {
    if (!this.config.autoSync || !this.client) return;
    this.queuedData = data;
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
    this.queuedData = data;

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
        if (!this.config.autoSync || !this.client || this.isSyncing || this.queuedData) return;
        const { data, error } = await this.client
          .from('wijaya_agro_erp_state')
          .select('updated_at')
          .eq('id', 'MAIN_DATABASE')
          .maybeSingle();

        if (!error && data && data.updated_at) {
          const remoteTime = new Date(data.updated_at).getTime();
          const localSyncTime = this.config.lastSyncTime ? new Date(this.config.lastSyncTime).getTime() : 0;
          if (remoteTime > localSyncTime + 2000) {
            console.log('[SupabaseSyncEngine] Pembaruan terdeteksi di Cloud Supabase. Menyinkronkan...');
            const pull = await this.pullFromSupabase();
            if (pull.success && pull.data) {
              await dbManager.hydrateFromSupabase(pull.data);
              console.log('[SupabaseSyncEngine] Database berhasil diperbarui dari Cloud Supabase.');
            }
          }
        }
      } catch {
        // Silent background check
      }
    }, 15000);
  }

  /**
   * On Serverless platforms (Vercel / Netlify), background setInterval is frozen between requests.
   * This lightweight check ensures cold starts hydrate from Cloud Supabase AND warm instances
   * pull fresh snapshots whenever Kasir updates data in Cloud Supabase.
   */
  public async ensureFreshCloudState(dbManager: any, maxAgeMs = 3500): Promise<void> {
    await this.ensureHydrated();
    if (!this.client || !this.config.url || !this.config.key) {
      return;
    }

    if (!this.serverlessInitialized) {
      await this.initOnServerStart(dbManager);
      this.serverlessInitialized = true;
      this.lastCloudCheckAt = Date.now();
      return;
    }

    const now = Date.now();
    if (now - this.lastCloudCheckAt < maxAgeMs || this.isSyncing || this.queuedData) {
      return;
    }
    this.lastCloudCheckAt = now;

    try {
      const { data, error } = await this.client
        .from('wijaya_agro_erp_state')
        .select('updated_at')
        .eq('id', 'MAIN_DATABASE')
        .maybeSingle();

      if (!error && data && data.updated_at) {
        const remoteTime = new Date(data.updated_at).getTime();
        const localSyncTime = this.config.lastSyncTime ? new Date(this.config.lastSyncTime).getTime() : 0;
        if (!this.hasVerifiedCloudState || remoteTime > localSyncTime + 1000) {
          const pull = await this.pullFromSupabase();
          if (pull.success && pull.data) {
            await dbManager.hydrateFromSupabase(pull.data);
          }
        }
      }
    } catch {
      // Non-fatal check on warm serverless request
    }
  }

  /**
   * Server startup initialization:
   * Hydrates database from Supabase BEFORE serving requests so Supabase is the single source of truth.
   */
  public async initOnServerStart(dbManager: any) {
    const runHydration = async () => {
      if (!this.client || !this.config.url || !this.config.key) {
        console.log('[SupabaseSyncEngine] Menunggu kredensial Cloud Supabase.');
        return;
      }

      console.log('[SupabaseSyncEngine] Menghubungkan ke Single Source of Truth Cloud Supabase...');
      try {
        const test = await this.testConnection();
        if (!test.success) {
          console.warn('[SupabaseSyncEngine] Koneksi Supabase gagal saat startup:', test.message);
          return;
        }

        if (test.tableExists !== false) {
          const syncRes = await this.syncSmartWithCloud(dbManager);
          console.log(`[SupabaseSyncEngine] [${syncRes.direction}] ${syncRes.message}`);
        }

        this.serverlessInitialized = true;
        this.lastCloudCheckAt = Date.now();
        this.startBackgroundPolling(dbManager);
      } catch (err) {
        console.warn('[SupabaseSyncEngine] Error saat inisialisasi startup:', err);
      }
    };

    this.hydrationPromise = Promise.race([
      runHydration(),
      new Promise<void>((resolve) => setTimeout(resolve, IS_SERVERLESS ? 8500 : 15000)),
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
