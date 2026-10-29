// src/server/vercelApp.ts
import express from "express";

// src/server/routes.ts
import { Router } from "express";

// src/server/db.ts
import fs2 from "fs";
import os2 from "os";
import path2 from "path";

// src/server/types.ts
var DAFTAR_DIVISI = [
  {
    id: "DIV-GWA",
    nama: "Gudang Wijaya Agro",
    kodeRekening: "REK-GWA",
    penanggungJawab: "Koordinator Gudang & Sortasi",
    deskripsi: "Unit penampungan, pengeringan, sortasi gabah & pergudangan saprotan."
  },
  {
    id: "DIV-WK",
    nama: "Wijaya Karya",
    kodeRekening: "REK-WK",
    penanggungJawab: "Pelaksana Proyek & Bengkel",
    deskripsi: "Pekerjaan konstruksi, perbaikan infrastruktur pabrik, dryer & mesin."
  },
  {
    id: "DIV-WT",
    nama: "Wijaya Transport",
    kodeRekening: "REK-WT",
    penanggungJawab: "Kepala Operasional Logistik Truk",
    deskripsi: "Armada angkutan truk komoditas hasil bumi & ekspedisi pupuk/benih."
  },
  {
    id: "DIV-CVA",
    nama: "CV Wijaya Agro",
    kodeRekening: "REK-CVA",
    penanggungJawab: "Manajer Operasional CV",
    deskripsi: "Entitas perdagangan lokal saprotan kios mitra & suplai tani daerah."
  },
  {
    id: "DIV-WAP",
    nama: "PT Wijaya Agro Perkasa",
    kodeRekening: "REK-WAP",
    penanggungJawab: "General Manager Holding WAP",
    deskripsi: "Perusahaan induk pengolahan gabah skala besar & kemitraan nasional."
  },
  {
    id: "DIV-OKU",
    nama: "Okussa",
    kodeRekening: "REK-OKU",
    penanggungJawab: "Koordinator Brand & Distribusi Okussa",
    deskripsi: "Unit bisnis komoditas & produk beras kemasan premium Okussa."
  }
];

// src/server/supabase.ts
import fs from "fs";
import os from "os";
import path from "path";
import { createClient } from "@supabase/supabase-js";
var IS_SERVERLESS = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
);
var RUNTIME_CACHE_DIR = path.join(os.tmpdir(), "wijaya_agro_erp_runtime");
var CONFIG_FILE = path.join(RUNTIME_CACHE_DIR, "supabase_config.json");
var LEGACY_CONFIG_FILE = path.resolve(process.cwd(), "data", "supabase_config.json");
function sanitizeSupabaseUrl(rawUrl, key) {
  let url = (rawUrl || "").trim();
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
  if (key && key.includes(".")) {
    try {
      const parts = key.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
        if (payload.ref) {
          return `https://${payload.ref}.supabase.co`;
        }
      }
    } catch {
    }
  }
  url = url.replace(/\/rest\/v1.*$/i, "").replace(/\/+$/, "");
  if (url && !/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}
function countAllTransactions(data) {
  if (!data) return 0;
  return (data.penjualan?.length || 0) + (data.pembelianBarang?.length || 0) + (data.pembelianHasilBumi?.length || 0) + (data.penjualanHasilBumi?.length || 0) + (data.pencairanTitipan?.length || 0) + (data.kasbonUang?.length || 0) + (data.bayarBon?.length || 0) + (data.pengeluaran?.length || 0) + (data.transferRekening?.length || 0) + (data.penggajian?.length || 0) + (data.upahHarian?.length || 0);
}
var SupabaseSyncEngine = class {
  constructor() {
    this.client = null;
    this.config = {
      url: "",
      key: "",
      autoSync: true
    };
    this.isSyncing = false;
    this.queuedData = null;
    this.syncTimer = null;
    this.pollTimer = null;
    this.hydrationPromise = null;
    this.storageUnavailableUntil = 0;
    this.hasVerifiedCloudState = false;
    this.serverlessInitialized = false;
    this.lastCloudCheckAt = 0;
    this.activeFreshCheckPromise = null;
    this.loadConfig();
    this.initClient();
  }
  loadConfig() {
    const candidateFiles = [CONFIG_FILE, LEGACY_CONFIG_FILE];
    for (const file of candidateFiles) {
      try {
        if (fs.existsSync(file)) {
          const raw = fs.readFileSync(file, "utf-8");
          const parsed = JSON.parse(raw);
          const rawKey = parsed.key || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
          const rawUrl = parsed.url || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
          if (rawUrl && rawKey) {
            this.config = {
              url: sanitizeSupabaseUrl(rawUrl, rawKey),
              key: rawKey,
              autoSync: parsed.autoSync !== void 0 ? parsed.autoSync : true,
              lastSyncTime: parsed.lastSyncTime,
              lastSyncStatus: parsed.lastSyncStatus,
              lastSyncMessage: parsed.lastSyncMessage
            };
            return;
          }
        }
      } catch (e) {
        console.warn("Failed to load supabase_config.json:", e);
      }
    }
    const envKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    const envUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
    this.config = {
      url: sanitizeSupabaseUrl(envUrl, envKey),
      key: envKey,
      autoSync: true
    };
  }
  saveConfig() {
    const jsonPayload = JSON.stringify(this.config, null, 2);
    try {
      if (!fs.existsSync(RUNTIME_CACHE_DIR)) {
        fs.mkdirSync(RUNTIME_CACHE_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_FILE, jsonPayload, "utf-8");
    } catch (e) {
      console.warn("Runtime supabase config cache skipped:", e);
    }
    if (!IS_SERVERLESS) {
      try {
        const legacyDir = path.dirname(LEGACY_CONFIG_FILE);
        if (!fs.existsSync(legacyDir)) {
          fs.mkdirSync(legacyDir, { recursive: true });
        }
        fs.writeFileSync(LEGACY_CONFIG_FILE, jsonPayload, "utf-8");
      } catch {
      }
    }
  }
  reloadConfigIfMissing() {
    if (this.client && this.config.url && this.config.key) {
      return true;
    }
    this.loadConfig();
    this.initClient();
    return Boolean(this.client && this.config.url && this.config.key);
  }
  getReconnectBundle() {
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
          a: this.config.autoSync !== false
        }),
        "utf-8"
      ).toString("base64");
    } catch {
      return null;
    }
  }
  parseReconnectBundle(bundle) {
    if (!bundle || typeof bundle !== "string") return null;
    try {
      const decoded = Buffer.from(bundle.trim(), "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      const url = sanitizeSupabaseUrl(String(parsed?.u || parsed?.url || ""), String(parsed?.k || parsed?.key || ""));
      const key = String(parsed?.k || parsed?.key || "").trim();
      if (url && key) {
        return {
          url,
          key,
          autoSync: parsed?.a !== false && parsed?.autoSync !== false
        };
      }
    } catch {
    }
    return null;
  }
  initClient() {
    if (this.config.url && this.config.key) {
      try {
        this.client = createClient(this.config.url, this.config.key, {
          auth: { persistSession: false }
        });
      } catch (err) {
        console.error("Failed to initialize Supabase client:", err);
        this.client = null;
      }
    } else {
      this.client = null;
    }
  }
  isConfigured() {
    if (!this.client || !this.config.url || !this.config.key) {
      this.reloadConfigIfMissing();
    }
    return Boolean(this.client && this.config.url && this.config.key);
  }
  getStatus() {
    return {
      configured: Boolean(this.config.url && this.config.key),
      url: this.config.url ? this.config.url.replace(/(https?:\/\/)(.{4}).+(.{4}\.supabase\.co)/, "$1$2***$3") : "",
      fullUrl: this.config.url || "",
      hasKey: Boolean(this.config.key),
      keyPreview: this.config.key ? `${this.config.key.slice(0, 6)}...${this.config.key.slice(-4)}` : "",
      autoSync: this.config.autoSync,
      lastSyncTime: this.config.lastSyncTime || null,
      lastSyncStatus: this.config.lastSyncStatus || null,
      lastSyncMessage: this.config.lastSyncMessage || null
    };
  }
  updateConfig(newConfig) {
    const rawKey = newConfig.key.trim() || this.config.key;
    this.config.key = rawKey;
    this.config.url = sanitizeSupabaseUrl(newConfig.url, rawKey);
    if (newConfig.autoSync !== void 0) {
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
  async ensureHydrated() {
    if (this.hydrationPromise) {
      try {
        await this.hydrationPromise;
      } catch {
      }
    }
  }
  /**
   * Test connection to Supabase
   */
  async testConnection() {
    if (!this.client) {
      return {
        success: false,
        message: "Supabase URL dan API Key belum dikonfigurasi."
      };
    }
    try {
      const { error } = await this.client.from("wijaya_agro_erp_state").select("id, updated_at").limit(1);
      if (error) {
        if (error.code === "42P01" || error.message.includes("does not exist")) {
          return {
            success: true,
            tableExists: false,
            message: 'Terkoneksi ke Supabase! Tabel "wijaya_agro_erp_state" belum dibuat. Buka skrip SQL inisialisasi di bawah pada Supabase SQL Editor.'
          };
        }
        throw error;
      }
      return {
        success: true,
        tableExists: true,
        message: "Koneksi ke Cloud Supabase aktif & stabil (Single Source of Truth)."
      };
    } catch (err) {
      return {
        success: false,
        message: `Gagal terhubung ke Supabase: ${err.message || "Periksa kembali URL & Key"}`
      };
    }
  }
  /**
   * Push complete ERP data to Supabase (Upsert canonical state into wijaya_agro_erp_state + relational mirrors)
   */
  async pushToSupabase(data, options) {
    if (!this.client) {
      return { success: false, message: "Supabase belum dikonfigurasi" };
    }
    try {
      const now = getWIBDateTime();
      const txCount = countAllTransactions(data);
      const produkCount = data.produk?.length || 0;
      const karyawanCount = data.karyawan?.length || 0;
      const mitraCount = data.mitra?.length || 0;
      const latestAuditId = data.auditLogs?.[0]?.idTransaksi || "";
      const isExplicitAdminResetOrRestore = options?.allowOverwrite || latestAuditId === "SYS-RESET" || latestAuditId === "SYS-CLEAN-DATA" || latestAuditId === "SYS-RESTORE";
      if (!this.hasVerifiedCloudState && !isExplicitAdminResetOrRestore) {
        const { data: remoteMeta, error: metaErr } = await this.client.from("wijaya_agro_erp_state").select("mitra_count, karyawan_count, transaksi_count").eq("id", "MAIN_DATABASE").maybeSingle();
        if (!metaErr && remoteMeta) {
          const cloudScore = (remoteMeta.mitra_count || 0) + (remoteMeta.karyawan_count || 0) + (remoteMeta.transaksi_count || 0);
          const localScore = mitraCount + karyawanCount + txCount;
          if (cloudScore > localScore) {
            console.warn(
              `[SupabaseSyncEngine] Menahan timpaan dari container baru (Cloud=${cloudScore} > Lokal=${localScore}).`
            );
            return {
              success: false,
              message: "Proteksi aktif: Mencegah penimpaan data Cloud yang lebih lengkap."
            };
          }
        }
        this.hasVerifiedCloudState = true;
      }
      const payload = {
        id: "MAIN_DATABASE",
        data,
        karyawan_count: karyawanCount,
        mitra_count: mitraCount,
        transaksi_count: txCount,
        updated_at: now.iso,
        updated_by: "KasirWap ERP"
      };
      const { error: stateError } = await this.client.from("wijaya_agro_erp_state").upsert(payload, { onConflict: "id" });
      if (stateError) {
        if (stateError.code === "42P01" || stateError.message.includes("does not exist")) {
          throw new Error(
            'Tabel "wijaya_agro_erp_state" belum ada di Supabase. Silakan jalankan skrip SQL inisialisasi di Supabase SQL Editor.'
          );
        }
        throw stateError;
      }
      this.hasVerifiedCloudState = true;
      const clientRef = this.client;
      const runMirrors = async () => {
        const mirrorTasks = [];
        if (data.karyawan && data.karyawan.length > 0) {
          const kRows = data.karyawan.map((k) => ({
            id: k.id,
            nik: k.nik,
            nama: k.nama,
            jabatan: k.jabatan,
            divisi: k.divisi || k.departemen || "Gudang",
            telepon: k.telepon,
            status: k.status,
            upah_harian_standar: k.upahHarianStandar || k.gajiPokok || 0,
            uang_makan_standar: k.uangMakanStandar || k.tunjanganTetap || 0,
            updated_at: now.iso
          }));
          mirrorTasks.push(Promise.resolve(clientRef.from("karyawan").upsert(kRows, { onConflict: "id" })));
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
            updated_at: now.iso
          }));
          mirrorTasks.push(Promise.resolve(clientRef.from("mitra").upsert(mRows, { onConflict: "id" })));
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
            status: p.status || "AKTIF",
            updated_at: now.iso
          }));
          mirrorTasks.push(Promise.resolve(clientRef.from("produk").upsert(pRows, { onConflict: "kode" })));
        }
        if (mirrorTasks.length > 0) {
          await Promise.allSettled(mirrorTasks);
        }
      };
      if (options?.awaitMirrors) {
        await runMirrors();
      } else {
        void runMirrors().catch(() => {
        });
      }
      this.config.lastSyncTime = now.iso;
      this.config.lastSyncStatus = "SUCCESS";
      this.config.lastSyncMessage = `Tersinkron ke Supabase (${produkCount} produk, ${mitraCount} mitra, ${karyawanCount} karyawan, ${txCount} transaksi)`;
      this.saveConfig();
      return {
        success: true,
        message: this.config.lastSyncMessage
      };
    } catch (err) {
      this.config.lastSyncStatus = "ERROR";
      this.config.lastSyncMessage = err.message || "Gagal sinkron ke Supabase";
      this.saveConfig();
      return { success: false, message: this.config.lastSyncMessage || "Gagal sinkron ke Supabase" };
    }
  }
  /**
   * Pull canonical ERP data from Supabase
   */
  async pullFromSupabase() {
    if (!this.client) {
      return { success: false, message: "Supabase belum dikonfigurasi" };
    }
    try {
      const { data, error } = await this.client.from("wijaya_agro_erp_state").select("*").eq("id", "MAIN_DATABASE").maybeSingle();
      if (error) throw error;
      if (!data || !data.data) {
        this.hasVerifiedCloudState = true;
        return {
          success: false,
          isEmpty: true,
          message: "Snapshot MAIN_DATABASE belum ada di tabel wijaya_agro_erp_state"
        };
      }
      this.hasVerifiedCloudState = true;
      const now = getWIBDateTime();
      this.config.lastSyncTime = data.updated_at || now.iso;
      this.config.lastSyncStatus = "SUCCESS";
      this.config.lastSyncMessage = "Database aktif terhubung langsung dari Cloud Supabase";
      this.saveConfig();
      return {
        success: true,
        data: data.data,
        updatedAt: data.updated_at,
        message: this.config.lastSyncMessage
      };
    } catch (err) {
      this.config.lastSyncStatus = "ERROR";
      this.config.lastSyncMessage = err.message || "Gagal menarik data dari Supabase";
      this.saveConfig();
      return { success: false, message: this.config.lastSyncMessage || "Gagal menarik data dari Supabase" };
    }
  }
  async drainQueue() {
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      while (this.queuedData) {
        const snapshot = this.queuedData;
        this.queuedData = null;
        await this.pushToSupabase(snapshot);
      }
    } catch (e) {
      console.warn("[SupabaseSyncEngine] Auto-sync queue error:", e);
    } finally {
      this.isSyncing = false;
    }
  }
  /**
   * Immediate write-through flush to Supabase with bounded wait so mutations persist to Supabase right away
   */
  async flushSync(data, maxWaitMs = 2500) {
    if (!this.config.autoSync || !this.client) return;
    this.queuedData = data;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    const syncTask = this.drainQueue();
    await Promise.race([
      syncTask,
      new Promise((resolve) => setTimeout(resolve, maxWaitMs))
    ]);
  }
  /**
   * Non-blocking debounced trigger (for synchronous callers)
   */
  triggerAutoSync(data) {
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
  async syncSmartWithCloud(dbManager2) {
    if (!this.client || !this.config.url || !this.config.key) {
      return { direction: "SKIPPED", message: "Supabase belum dikonfigurasi." };
    }
    const pullResult = await this.pullFromSupabase();
    if (pullResult.success && pullResult.data) {
      const cloud = pullResult.data;
      const local = dbManager2.get();
      const cloudScore = (cloud.mitra?.length || 0) + (cloud.karyawan?.length || 0) + countAllTransactions(cloud);
      const localScore = (local.mitra?.length || 0) + (local.karyawan?.length || 0) + countAllTransactions(local);
      if (cloudScore === 0 && localScore > 0) {
        const pushRes = await this.pushToSupabase(local);
        return {
          direction: "PUSHED_TO_SUPABASE",
          message: pushRes.message
        };
      }
      await dbManager2.hydrateFromSupabase(cloud);
      return {
        direction: "PULLED_FROM_SUPABASE",
        message: `Data utama berhasil dimuat dari Cloud Supabase (${cloud.produk?.length || 0} produk, ${cloud.mitra?.length || 0} mitra, ${cloud.karyawan?.length || 0} karyawan, ${countAllTransactions(cloud)} transaksi).`
      };
    }
    if (pullResult.isEmpty) {
      const pushRes = await this.pushToSupabase(dbManager2.get());
      return {
        direction: "PUSHED_TO_SUPABASE",
        message: pushRes.success ? `Inisialisasi database ke Cloud Supabase berhasil (${pushRes.message}).` : pushRes.message
      };
    }
    return {
      direction: "SKIPPED",
      message: pullResult.message
    };
  }
  startBackgroundPolling(dbManager2) {
    if (IS_SERVERLESS) {
      return;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(async () => {
      try {
        if (!this.isConfigured() || !this.config.autoSync || !this.client || this.isSyncing || this.queuedData) {
          return;
        }
        if (!this.hasVerifiedCloudState) {
          const healRes = await this.syncSmartWithCloud(dbManager2);
          if (healRes.direction !== "SKIPPED") {
            console.log(`[SupabaseSyncEngine] Auto-reconnected di background: ${healRes.message}`);
          }
          return;
        }
        const { data, error } = await this.client.from("wijaya_agro_erp_state").select("updated_at").eq("id", "MAIN_DATABASE").maybeSingle();
        if (!error && data && data.updated_at) {
          const remoteTime = new Date(data.updated_at).getTime();
          const localSyncTime = this.config.lastSyncTime ? new Date(this.config.lastSyncTime).getTime() : 0;
          if (remoteTime > localSyncTime + 2e3) {
            console.log("[SupabaseSyncEngine] Pembaruan terdeteksi di Cloud Supabase. Menyinkronkan...");
            const pull = await this.pullFromSupabase();
            if (pull.success && pull.data) {
              await dbManager2.hydrateFromSupabase(pull.data);
              console.log("[SupabaseSyncEngine] Database berhasil diperbarui dari Cloud Supabase.");
            }
          }
        }
      } catch {
      }
    }, 12e3);
  }
  /**
   * Ensures cold starts hydrate from Cloud Supabase AND warm instances automatically
   * self-heal / pull fresh snapshots whenever Cloud Supabase changes.
   */
  async ensureFreshCloudState(dbManager2, maxAgeMs = 3500) {
    await this.ensureHydrated();
    if (!this.isConfigured() || !this.client) {
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
          await this.initOnServerStart(dbManager2);
          return;
        }
        this.lastCloudCheckAt = Date.now();
        if (!this.hasVerifiedCloudState) {
          await this.syncSmartWithCloud(dbManager2);
          return;
        }
        if (!this.client) return;
        const { data, error } = await this.client.from("wijaya_agro_erp_state").select("updated_at").eq("id", "MAIN_DATABASE").maybeSingle();
        if (!error && data && data.updated_at) {
          const remoteTime = new Date(data.updated_at).getTime();
          const localSyncTime = this.config.lastSyncTime ? new Date(this.config.lastSyncTime).getTime() : 0;
          if (remoteTime > localSyncTime + 1e3) {
            const pull = await this.pullFromSupabase();
            if (pull.success && pull.data) {
              await dbManager2.hydrateFromSupabase(pull.data);
            }
          }
        }
      } catch {
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
  async initOnServerStart(dbManager2) {
    const runHydration = async () => {
      if (!this.isConfigured() || !this.client) {
        console.log("[SupabaseSyncEngine] Menunggu kredensial Cloud Supabase.");
        return;
      }
      this.serverlessInitialized = true;
      this.startBackgroundPolling(dbManager2);
      console.log("[SupabaseSyncEngine] Menghubungkan ke Single Source of Truth Cloud Supabase...");
      try {
        const test = await this.testConnection();
        if (!test.success) {
          console.warn("[SupabaseSyncEngine] Koneksi Supabase belum merespons saat startup (akan auto-retry):", test.message);
          return;
        }
        if (test.tableExists !== false) {
          const syncRes = await this.syncSmartWithCloud(dbManager2);
          console.log(`[SupabaseSyncEngine] [${syncRes.direction}] ${syncRes.message}`);
        }
        this.lastCloudCheckAt = Date.now();
      } catch (err) {
        console.warn("[SupabaseSyncEngine] Error saat inisialisasi startup (akan auto-retry):", err);
      }
    };
    this.hydrationPromise = Promise.race([
      runHydration(),
      new Promise((resolve) => setTimeout(resolve, IS_SERVERLESS ? 8500 : 12e3))
    ]);
    await this.hydrationPromise;
    this.hydrationPromise = null;
  }
  /**
   * Generate SQL DDL script for setting up Supabase tables
   */
  getSqlSchemaScript() {
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
  async uploadBuktiImage(dataUrl, prefix = "bukti") {
    if (!this.client || !dataUrl || !dataUrl.startsWith("data:image/")) {
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
      const buffer = Buffer.from(base64Body, "base64");
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const safePrefix = String(prefix || "bukti").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "bukti";
      const now = /* @__PURE__ */ new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const rand = Math.random().toString(36).slice(2, 8);
      const objectPath = `${ym}/${safePrefix}_${Date.now()}_${rand}.${ext}`;
      const bucketName = "erp-bukti-nota";
      let { error: uploadErr } = await this.client.storage.from(bucketName).upload(objectPath, buffer, { contentType, upsert: true });
      if (uploadErr && (uploadErr.message?.toLowerCase().includes("not found") || uploadErr.message?.toLowerCase().includes("bucket"))) {
        try {
          await this.client.storage.createBucket(bucketName, { public: true });
          const retry = await this.client.storage.from(bucketName).upload(objectPath, buffer, { contentType, upsert: true });
          uploadErr = retry.error;
        } catch {
        }
      }
      if (uploadErr) {
        this.storageUnavailableUntil = Date.now() + 5 * 60 * 1e3;
        return null;
      }
      const { data: pub } = this.client.storage.from(bucketName).getPublicUrl(objectPath);
      return pub?.publicUrl || null;
    } catch {
      this.storageUnavailableUntil = Date.now() + 5 * 60 * 1e3;
      return null;
    }
  }
};
var supabaseSyncEngine = new SupabaseSyncEngine();

// src/server/db.ts
var RUNTIME_CACHE_DIR2 = path2.join(os2.tmpdir(), "wijaya_agro_erp_runtime");
var DB_FILE = path2.join(RUNTIME_CACHE_DIR2, "wijaya_agro_erp.json");
var LEGACY_DB_FILE = path2.resolve(process.cwd(), "data", "wijaya_agro_erp.json");
var TEMP_BACKUP_DIR = path2.join(os2.tmpdir(), "wijaya_agro_erp_backups");
function getWIBDateTime() {
  const now = /* @__PURE__ */ new Date();
  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  const timeFormatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const partsDate = dateFormatter.formatToParts(now);
  const day = partsDate.find((p) => p.type === "day")?.value.padStart(2, "0") || "01";
  const month = partsDate.find((p) => p.type === "month")?.value.padStart(2, "0") || "01";
  const year = partsDate.find((p) => p.type === "year")?.value || "2026";
  const tanggal = `${day}/${month}/${year}`;
  const jam = timeFormatter.format(now).replace(/\./g, ":");
  return {
    tanggal,
    jam,
    iso: now.toISOString()
  };
}
function getDefaultRekeningList() {
  return [
    {
      kode: "KAS01",
      nama: "Kas Utama Kasir (Brankas Fisik)",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "KAS-01-OPERASIONAL",
      saldoAwal: 25e6,
      saldoSaatIni: 25e6,
      status: "AKTIF",
      isVirtual: false,
      kategori: "PERUSAHAAN",
      keterangan: "Penyimpanan utama uang kas fisik di brankas & laci kasir kantor pusat"
    },
    {
      kode: "BNI01",
      nama: "Bank BNI Operasional Pusat",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "1827401928",
      saldoAwal: 75e6,
      saldoSaatIni: 75e6,
      status: "AKTIF",
      isVirtual: false,
      kategori: "PERUSAHAAN",
      keterangan: "Rekening bank giro utama penyimpanan dana perusahaan"
    },
    {
      kode: "BCA01",
      nama: "Bank BCA Bisnis Agro",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "8201948291",
      saldoAwal: 12e7,
      saldoSaatIni: 12e7,
      status: "AKTIF",
      isVirtual: false,
      kategori: "PERUSAHAAN",
      keterangan: "Rekening bank penampungan utama hasil penjualan toko & komoditas"
    },
    {
      kode: "MAN01",
      nama: "Bank Mandiri Agro",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "137001928374",
      saldoAwal: 5e7,
      saldoSaatIni: 5e7,
      status: "AKTIF",
      isVirtual: false,
      kategori: "PERUSAHAAN",
      keterangan: "Rekening bank transaksi grosir dan mitra tani"
    },
    {
      kode: "BRI01",
      nama: "Bank BRI Unit Agro",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "0192837461829",
      saldoAwal: 35e6,
      saldoSaatIni: 35e6,
      status: "AKTIF",
      isVirtual: false,
      kategori: "PERUSAHAAN",
      keterangan: "Rekening bank transaksi kemitraan petani daerah"
    },
    {
      kode: "BER01",
      nama: "Bank BSI Berkah Tani",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "7182938491",
      saldoAwal: 15e6,
      saldoSaatIni: 15e6,
      status: "AKTIF",
      isVirtual: false,
      kategori: "PERUSAHAAN",
      keterangan: "Rekening bank syariah kemitraan"
    },
    {
      kode: "BON01",
      nama: "Rekening Kasbon Customer (Piutang)",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "VIRTUAL-BON-PIUTANG",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: true,
      kategori: "VIRTUAL_SISTEM",
      keterangan: "Rekening virtual kliring sistem untuk akumulasi kasbon barang & kasbon uang"
    },
    {
      kode: "TIT01",
      nama: "Rekening Titip / Hutang Supplier",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "VIRTUAL-TITIP-HUTANG",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: true,
      kategori: "VIRTUAL_SISTEM",
      keterangan: "Rekening virtual kliring sistem untuk titip hasil bumi belum diambil"
    },
    {
      kode: "SINKRON",
      nama: "Rekening Sinkron (Potong Titipan / Uang Hasil Bumi)",
      atasNama: "PT Wijaya Agro",
      nomorRekening: "SINKRON-POTONG-TITIPAN",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: true,
      kategori: "VIRTUAL_SISTEM",
      keterangan: "Rekening non-tunai untuk pelunasan bon mitra dengan memotong langsung saldo titipan hasil bumi / uang kopi tanpa mengeluarkan uang kas fisik"
    },
    // REKENING OPERASIONAL DIVISI (BUKU ALOKASI TRACKING PERGERAKAN DANA — MURNI MULAI RP 0 TANPA SALDO DUMMY)
    {
      kode: "REK-GWA",
      nama: "Buku Operasional Gudang Wijaya Agro",
      atasNama: "Divisi Gudang Wijaya Agro",
      nomorRekening: "DIV-01-GWA",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      kategori: "OPERASIONAL_DIVISI",
      rekeningIndukPenyimpan: "KAS01",
      keterangan: "Buku tracking alokasi kas operasional sortir gabah & upah harian (Dana fisik di Kas Perusahaan)"
    },
    {
      kode: "REK-WK",
      nama: "Buku Operasional Wijaya Karya",
      atasNama: "Divisi Wijaya Karya",
      nomorRekening: "DIV-02-WK",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      kategori: "OPERASIONAL_DIVISI",
      rekeningIndukPenyimpan: "BNI01",
      keterangan: "Buku tracking operasional proyek pabrik & upah teknisi (Dana fisik di Rekening Bank BNI)"
    },
    {
      kode: "REK-WT",
      nama: "Buku Operasional Wijaya Transport",
      atasNama: "Divisi Wijaya Transport",
      nomorRekening: "DIV-03-WT",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      kategori: "OPERASIONAL_DIVISI",
      rekeningIndukPenyimpan: "BNI01",
      keterangan: "Buku tracking armada truk & upah supir (Dana fisik di Rekening Bank BNI)"
    },
    {
      kode: "REK-CVA",
      nama: "Buku Operasional CV Wijaya Agro",
      atasNama: "CV Wijaya Agro",
      nomorRekening: "DIV-04-CVA",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      kategori: "OPERASIONAL_DIVISI",
      rekeningIndukPenyimpan: "BCA01",
      keterangan: "Buku tracking perputaran dagang saprotan lokal & staff (Dana fisik di Bank BCA)"
    },
    {
      kode: "REK-WAP",
      nama: "Buku Operasional PT Wijaya Agro Perkasa",
      atasNama: "PT Wijaya Agro Perkasa",
      nomorRekening: "DIV-05-WAP",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      kategori: "OPERASIONAL_DIVISI",
      rekeningIndukPenyimpan: "BNI01",
      keterangan: "Buku tracking holding pabrik beras & kemitraan nasional (Dana fisik di Bank BNI)"
    },
    {
      kode: "REK-OKU",
      nama: "Buku Operasional Okussa",
      atasNama: "Divisi Bisnis Okussa",
      nomorRekening: "DIV-06-OKU",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      kategori: "OPERASIONAL_DIVISI",
      rekeningIndukPenyimpan: "KAS01",
      keterangan: "Buku tracking distribusi beras kemasan premium Okussa (Dana fisik di Kas Perusahaan)"
    },
    // REKENING ANAK PERUSAHAAN & MITRA TERAFILIASI (1 TRANSAKSI TERPADU REKENING <-> MITRA)
    {
      kode: "REK-DPPARABO",
      nama: "DP Parabot",
      atasNama: "DP Parabot \u2014 Anak Perusahaan PT. Wijaya Agro Perkasa",
      nomorRekening: "AFILIASI-DP-PARABOT",
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: "AKTIF",
      isVirtual: false,
      isAnakPerusahaan: true,
      idMitraTerkait: "MTR-DPPARABOT",
      namaMitraTerkait: "DP Parabot",
      kategori: "ANAK_PERUSAHAAN",
      keterangan: "Anak Perusahaan PT. Wijaya Agro Perkasa (Bukan Bank) \u2014 Terintegrasi otomatis sebagai Mitra dalam 1 transaksi terpadu"
    }
  ];
}
var LEGACY_DUMMY_DIVISI_BALANCES = {
  "REK-GWA": 15e6,
  "REK-WK": 2e7,
  "REK-WT": 25e6,
  "REK-CVA": 3e7,
  "REK-WAP": 5e7,
  "REK-OKU": 15e6
};
var LEGACY_DUMMY_HASIL_BUMI_PRICES = {
  "HB-01": 42e3,
  "HB-02": 52e3,
  "HB-03": 38e3,
  "HB-04": 3e4,
  "HB-05": 68e3,
  "HB-06": 115e3,
  "HB-07": 35e3
};
var LEGACY_DUMMY_PRODUK_PRICES = {
  "PRD-09": [145e3, 155e3, 15e4],
  "PRD-10": [14e4, 15e4, 145e3],
  "PRD-11": [18e4, 22e4, 2e5],
  "PRD-12": [22e4, 26e4, 24e4],
  "PRD-13": [2e5, 24e4, 22e4],
  "PRD-14": [23e4, 27e4, 25e4],
  "PRD-15": [650, 800, 750],
  "PRD-16": [8500, 1e4, 9500],
  "PRD-17": [25e3, 3e4, 28e3],
  "PRD-18": [18e3, 22e3, 2e4],
  "PRD-19": [55e3, 65e3, 6e4],
  "PRD-20": [6e4, 72e3, 66e3],
  "PRD-21": [45e3, 55e3, 5e4],
  "PRD-22": [25e3, 32e3, 28e3],
  "PRD-23": [12e4, 135e3, 13e4],
  "PRD-24": [16e4, 18e4, 17e4],
  "PRD-25": [21e4, 235e3, 225e3],
  "PRD-26": [275e3, 3e5, 29e4],
  "PRD-27": [45e3, 55e3, 5e4],
  "PRD-28": [55e3, 68e3, 62e3],
  "PRD-29": [65e3, 8e4, 72e3],
  "PRD-30": [7e4, 85e3, 78e3],
  "PRD-31": [85e3, 105e3, 95e3],
  "PRD-32": [95e3, 12e4, 11e4],
  "PRD-33": [75e3, 9e4, 82e3],
  "PRD-34": [9e4, 11e4, 1e5],
  "PRD-35": [1e5, 125e3, 115e3]
};
function getDefaultHasilBumiList() {
  const now = getWIBDateTime();
  return [
    { kode: "HB-01", nama: "KOPI", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: "HB-02", nama: "KULIT KAYU MANIS STIK", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: "HB-03", nama: "KULIT KAYU MANIS KA", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: "HB-04", nama: "KULIT KAYU MANIS KB", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: "HB-05", nama: "LADA", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: "HB-06", nama: "CENGKEH", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: "HB-07", nama: "GG CENGKEH", satuan: "KG", stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    {
      kode: "HB-08",
      nama: "KOPI TITIP",
      satuan: "KG",
      stok: 0,
      hargaBeliStandar: 0,
      updateTerakhir: now.iso,
      isBelumPutusHarga: true,
      keterangan: "Pembelian Hasil Bumi dari Petani - Belum Putus Harga (Titip Timbang Panen / Harga Mengambang)"
    }
  ];
}
function getDefaultProdukDagangList() {
  const now = getWIBDateTime();
  const rawItems = [
    { kode: "PRD-09", nama: "BERAS BELITANG", satuan: "SAK", kategori: "BERAS" },
    { kode: "PRD-10", nama: "BERAS JEMPOL", satuan: "SAK", kategori: "BERAS" },
    { kode: "PRD-11", nama: "PASIR m2", satuan: "METER KUBIK", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-12", nama: "KORAL M2", satuan: "METER KUBIK", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-13", nama: "BATU UJM", satuan: "METER KUBIK", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-14", nama: "SPLIT", satuan: "METER KUBIK", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-15", nama: "BATA", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-16", nama: "BATA RINGAN", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-17", nama: "PAPAN", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-18", nama: "KASAU", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-19", nama: "BALOK 7x14", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-20", nama: "BALOK 8X12", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-21", nama: "SPANEL 4M", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-22", nama: "SPANEL 2M", satuan: "BIJI/BUAH", kategori: "ALAT_PERTANIAN" },
    { kode: "PRD-23", nama: "UREA", satuan: "SAK", kategori: "PUPUK" },
    { kode: "PRD-24", nama: "NPK", satuan: "SAK", kategori: "PUPUK" },
    { kode: "PRD-25", nama: "SOLAR", satuan: "DRIGENT", kategori: "LAINNYA" },
    { kode: "PRD-26", nama: "DEXLITE", satuan: "DRIGENT", kategori: "LAINNYA" },
    { kode: "PRD-27", nama: "KOPI ROBUSTA MENTAH", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-28", nama: "ROBUSTA PREMIUM MENTAH", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-29", nama: "ROBUSTA LANANG MENTAH", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-30", nama: "KOPI ROBUSTA ROSTING", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-31", nama: "ROBUSTA PREMIUM ROSTING", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-32", nama: "ROBUSTA LANANG ROSTING", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-33", nama: "KOPI ROBUSTA BUBUK", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-34", nama: "ROBUSTA PREMIUM BUBUK", satuan: "KEMASAN", kategori: "BERAS" },
    { kode: "PRD-35", nama: "ROBUSTA LANANG BUBUK", satuan: "KEMASAN", kategori: "BERAS" }
  ];
  const produk = rawItems.map((it) => ({
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    kategori: it.kategori,
    hargaBeli: 0,
    hargaJual: 0,
    hargaKhususRekanan: 0,
    status: "AKTIF"
  }));
  const stokBarang = rawItems.map((it) => ({
    kode: it.kode,
    namaProduk: it.nama,
    satuan: it.satuan,
    stok: 0,
    minimum: 10,
    updateTerakhir: now.iso
  }));
  return { produk, stokBarang };
}
function getDefaultProfilPerusahaan() {
  return {
    namaPerusahaan: "PT. WIJAYA AGRO PERKASA",
    badanHukum: "Perseroan Terbatas (PT)",
    alamat: "Sentra Agrobisnis & Pergudangan Hasil Bumi, Lampung - Indonesia",
    telepon: "0812-3456-7890",
    email: "kasirwap@gmail.com",
    penanggungJawab: "Pimpinan PT. Wijaya Agro Perkasa",
    rekeningUtama: "BNI01",
    catatanHeaderNota: "Terima kasih atas kerja sama Anda dengan PT. WIJAYA AGRO PERKASA",
    updateTerakhir: getWIBDateTime().iso
  };
}
function getDefaultRealKaryawanList() {
  return [];
}
function getDefaultRealMitraList() {
  return [];
}
function getDefaultDatabase() {
  const now = getWIBDateTime();
  const { produk, stokBarang } = getDefaultProdukDagangList();
  const stokHasilBumi = getDefaultHasilBumiList();
  const defaultKaryawan = [];
  const defaultMitra = [];
  defaultKaryawan.forEach((kry) => {
    defaultMitra.push({
      id: kry.idMitraTerkait || `MTR-${kry.id}`,
      kode: kry.nik || kry.id,
      nama: kry.nama,
      role: "KARYAWAN",
      telepon: kry.telepon || "-",
      alamat: kry.alamat || "-",
      status: "AKTIF"
    });
  });
  return {
    profilPerusahaan: getDefaultProfilPerusahaan(),
    rekening: getDefaultRekeningList(),
    mitra: defaultMitra,
    karyawan: defaultKaryawan,
    upahHarian: [],
    penggajian: [],
    produk,
    stokBarang,
    stokHasilBumi,
    penjualan: [],
    pembelianBarang: [],
    pembelianHasilBumi: [],
    penjualanHasilBumi: [],
    kasbonUang: [],
    bayarBon: [],
    transferRekening: [],
    pengeluaran: [],
    pencairanTitipan: [],
    inventaris: [],
    auditLogs: [
      {
        id: "LOG-INIT",
        timestamp: now.iso,
        tanggal: now.tanggal,
        jam: now.jam,
        user: "KasirWap",
        jenisTransaksi: "CREATE",
        idTransaksi: "SYS-INIT",
        detail: "Sistem siap: 35 Master Item Pondasi & 4 Karyawan Riil (Fahlevi, Lupi, Samlawi, Argon) terdaftar untuk PT Wijaya Agro.",
        nominal: 0
      }
    ]
  };
}
var DatabaseManager = class {
  constructor() {
    this.isWriting = false;
    this.lastBackupTime = 0;
    this.ensureDirectory();
    this.lastBackupTime = Date.now();
    this.db = this.load();
    this.reconcileRelationalIntegrity();
    this.synchronizeVirtualAccounts();
    this.saveDirect(this.db);
  }
  load() {
    try {
      const sourceFile = fs2.existsSync(DB_FILE) ? DB_FILE : fs2.existsSync(LEGACY_DB_FILE) ? LEGACY_DB_FILE : null;
      if (sourceFile) {
        const raw = fs2.readFileSync(sourceFile, "utf-8");
        const parsed = JSON.parse(raw);
        const defaultRekening = getDefaultRekeningList();
        const merged = {
          profilPerusahaan: parsed.profilPerusahaan && parsed.profilPerusahaan.namaPerusahaan ? parsed.profilPerusahaan : getDefaultProfilPerusahaan(),
          rekening: Array.isArray(parsed.rekening) && parsed.rekening.length > 0 ? parsed.rekening : defaultRekening,
          mitra: Array.isArray(parsed.mitra) ? parsed.mitra : [],
          karyawan: Array.isArray(parsed.karyawan) ? parsed.karyawan : [],
          upahHarian: Array.isArray(parsed.upahHarian) ? parsed.upahHarian : [],
          penggajian: Array.isArray(parsed.penggajian) ? parsed.penggajian : [],
          produk: Array.isArray(parsed.produk) ? parsed.produk : [],
          stokBarang: Array.isArray(parsed.stokBarang) ? parsed.stokBarang : [],
          stokHasilBumi: Array.isArray(parsed.stokHasilBumi) ? parsed.stokHasilBumi : [],
          penjualan: Array.isArray(parsed.penjualan) ? parsed.penjualan : [],
          pembelianBarang: Array.isArray(parsed.pembelianBarang) ? parsed.pembelianBarang : [],
          pembelianHasilBumi: Array.isArray(parsed.pembelianHasilBumi) ? parsed.pembelianHasilBumi : [],
          kasbonUang: Array.isArray(parsed.kasbonUang) ? parsed.kasbonUang : [],
          bayarBon: Array.isArray(parsed.bayarBon) ? parsed.bayarBon : [],
          transferRekening: Array.isArray(parsed.transferRekening) ? parsed.transferRekening : [],
          pengeluaran: Array.isArray(parsed.pengeluaran) ? parsed.pengeluaran : [],
          pencairanTitipan: Array.isArray(parsed.pencairanTitipan) ? parsed.pencairanTitipan : [],
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          divisi: Array.isArray(parsed.divisi) ? parsed.divisi : [],
          kategoriProduk: Array.isArray(parsed.kategoriProduk) ? parsed.kategoriProduk : [],
          cashOpnameLogs: Array.isArray(parsed.cashOpnameLogs) ? parsed.cashOpnameLogs : [],
          inventaris: Array.isArray(parsed.inventaris) ? parsed.inventaris : []
        };
        if (!Array.isArray(merged.karyawan)) {
          merged.karyawan = [];
        }
        if (!Array.isArray(merged.mitra)) {
          merged.mitra = [];
        }
        for (const kry of merged.karyawan) {
          const mtrId = kry.idMitraTerkait || `MTR-${kry.id}`;
          const existing = merged.mitra.find((m) => m.id === mtrId || m.kode === kry.nik || m.role === "KARYAWAN" && m.nama.toLowerCase() === kry.nama.toLowerCase());
          if (!existing) {
            merged.mitra.push({
              id: mtrId,
              kode: kry.nik || kry.id,
              nama: kry.nama,
              role: "KARYAWAN",
              telepon: kry.telepon || "-",
              alamat: kry.alamat || "-",
              status: "AKTIF",
              catatan: `Karyawan: ${kry.jabatan || "Staff"} (Divisi ${kry.divisi || kry.departemen || "Gudang"})`
            });
          } else {
            if (existing.nama.endsWith(" (Karyawan)")) {
              existing.nama = kry.nama;
            }
            if (!existing.catatan) {
              existing.catatan = `Karyawan: ${kry.jabatan || "Staff"} (Divisi ${kry.divisi || kry.departemen || "Gudang"})`;
            }
          }
        }
        const defaultProdukData = getDefaultProdukDagangList();
        const defaultHasilBumi = getDefaultHasilBumiList();
        merged.produk = merged.produk.filter((p) => p.kode !== "PRD-08");
        merged.stokBarang = merged.stokBarang.filter((s) => s.kode !== "PRD-08");
        merged.stokHasilBumi = merged.stokHasilBumi.filter((h) => h.kode !== "HB-01B" && !h.nama.toUpperCase().includes("KOPI JALAN"));
        for (const defHb of defaultHasilBumi) {
          if (!merged.stokHasilBumi.some((h) => h.kode === defHb.kode || h.nama.toUpperCase() === defHb.nama.toUpperCase())) {
            merged.stokHasilBumi.push({ ...defHb });
          }
        }
        for (const defPr of defaultProdukData.produk) {
          if (!merged.produk.some((p) => p.kode === defPr.kode || p.nama.toUpperCase() === defPr.nama.toUpperCase())) {
            merged.produk.push({ ...defPr });
          }
        }
        for (const defSt of defaultProdukData.stokBarang) {
          if (!merged.stokBarang.some((s) => s.kode === defSt.kode || s.namaProduk.toUpperCase() === defSt.namaProduk.toUpperCase())) {
            merged.stokBarang.push({ ...defSt });
          }
        }
        for (const defRek of defaultRekening) {
          if (!merged.rekening.some((r) => r.kode === defRek.kode)) {
            merged.rekening.push({ ...defRek });
          }
        }
        for (const rek of merged.rekening) {
          const isDpParabot = rek.kode === "REK-DPPARABO" || rek.kode === "DPPARABOT" || !rek.isVirtual && rek.nama.toLowerCase().includes("dp parabot");
          if (isDpParabot || rek.isAnakPerusahaan || rek.kategori === "ANAK_PERUSAHAAN") {
            rek.kategori = "ANAK_PERUSAHAAN";
            rek.isAnakPerusahaan = true;
            rek.isVirtual = false;
            delete rek.rekeningIndukPenyimpan;
          } else {
            const defRek = defaultRekening.find((d) => d.kode === rek.kode);
            if (defRek) {
              rek.kategori = defRek.kategori;
              rek.rekeningIndukPenyimpan = defRek.rekeningIndukPenyimpan;
            } else if (rek.kode === "BON01" || rek.kode === "TIT01") {
              rek.kategori = "VIRTUAL_SISTEM";
              rek.isVirtual = true;
            } else if (rek.kategori === "OPERASIONAL_DIVISI" || rek.kode.startsWith("REK-") || rek.kode.startsWith("DIV-")) {
              rek.kategori = "OPERASIONAL_DIVISI";
              rek.isVirtual = false;
              rek.rekeningIndukPenyimpan = rek.rekeningIndukPenyimpan || "KAS01";
            } else {
              rek.kategori = "PERUSAHAAN";
              rek.isVirtual = false;
            }
          }
        }
        return merged;
      }
    } catch (err) {
      console.error("Failed to read db file, creating clean default:", err);
    }
    const fresh = getDefaultDatabase();
    this.saveDirect(fresh);
    return fresh;
  }
  ensureDirectory() {
    try {
      if (!fs2.existsSync(RUNTIME_CACHE_DIR2)) {
        fs2.mkdirSync(RUNTIME_CACHE_DIR2, { recursive: true });
      }
      if (!fs2.existsSync(TEMP_BACKUP_DIR)) {
        fs2.mkdirSync(TEMP_BACKUP_DIR, { recursive: true });
      }
    } catch (dirErr) {
      console.warn("Runtime temp directory check skipped:", dirErr);
    }
  }
  saveDirect(data) {
    try {
      this.ensureDirectory();
      const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
      const jsonStr = JSON.stringify(data);
      fs2.writeFileSync(tempFile, jsonStr, "utf-8");
      fs2.renameSync(tempFile, DB_FILE);
      const nowTime = Date.now();
      if (nowTime - this.lastBackupTime > 15 * 60 * 1e3) {
        try {
          const d = /* @__PURE__ */ new Date();
          const dateStr = d.toISOString().split("T")[0];
          const backupFile = path2.join(TEMP_BACKUP_DIR, `backup_${dateStr}_${d.getHours()}h.json`);
          fs2.writeFileSync(backupFile, jsonStr, "utf-8");
          this.lastBackupTime = nowTime;
          const files = fs2.readdirSync(TEMP_BACKUP_DIR).filter((f) => f.endsWith(".json")).sort();
          if (files.length > 5) {
            for (let i = 0; i < files.length - 5; i++) {
              fs2.unlinkSync(path2.join(TEMP_BACKUP_DIR, files[i]));
            }
          }
        } catch (backupErr) {
          console.warn("Auto backup skipped:", backupErr);
        }
      }
    } catch (writeErr) {
      console.warn("Local runtime cache write skipped:", writeErr);
    }
  }
  save() {
    this.reconcileRelationalIntegrity();
    this.synchronizeVirtualAccounts();
    this.saveDirect(this.db);
    try {
      supabaseSyncEngine.triggerAutoSync(this.db);
    } catch {
    }
  }
  get() {
    return this.db;
  }
  applyIncomingSnapshot(incoming) {
    this.db.profilPerusahaan = incoming.profilPerusahaan || this.db.profilPerusahaan;
    this.db.rekening = Array.isArray(incoming.rekening) && incoming.rekening.length > 0 ? incoming.rekening : this.db.rekening;
    this.db.mitra = Array.isArray(incoming.mitra) ? incoming.mitra : [];
    this.db.karyawan = Array.isArray(incoming.karyawan) ? incoming.karyawan : [];
    this.db.upahHarian = Array.isArray(incoming.upahHarian) ? incoming.upahHarian : [];
    this.db.penggajian = Array.isArray(incoming.penggajian) ? incoming.penggajian : [];
    this.db.produk = Array.isArray(incoming.produk) ? incoming.produk : this.db.produk;
    this.db.kategoriProduk = Array.isArray(incoming.kategoriProduk) ? incoming.kategoriProduk : [];
    this.db.stokBarang = Array.isArray(incoming.stokBarang) ? incoming.stokBarang : this.db.stokBarang;
    this.db.stokHasilBumi = Array.isArray(incoming.stokHasilBumi) ? incoming.stokHasilBumi : this.db.stokHasilBumi;
    this.db.penjualan = Array.isArray(incoming.penjualan) ? incoming.penjualan : [];
    this.db.pembelianBarang = Array.isArray(incoming.pembelianBarang) ? incoming.pembelianBarang : [];
    this.db.pembelianHasilBumi = Array.isArray(incoming.pembelianHasilBumi) ? incoming.pembelianHasilBumi : [];
    this.db.kasbonUang = Array.isArray(incoming.kasbonUang) ? incoming.kasbonUang : [];
    this.db.bayarBon = Array.isArray(incoming.bayarBon) ? incoming.bayarBon : [];
    this.db.transferRekening = Array.isArray(incoming.transferRekening) ? incoming.transferRekening : [];
    this.db.pengeluaran = Array.isArray(incoming.pengeluaran) ? incoming.pengeluaran : [];
    this.db.pencairanTitipan = Array.isArray(incoming.pencairanTitipan) ? incoming.pencairanTitipan : [];
    this.db.auditLogs = Array.isArray(incoming.auditLogs) ? incoming.auditLogs : this.db.auditLogs;
    this.db.divisi = Array.isArray(incoming.divisi) ? incoming.divisi : [];
    this.db.cashOpnameLogs = Array.isArray(incoming.cashOpnameLogs) ? incoming.cashOpnameLogs : [];
    this.db.inventaris = Array.isArray(incoming.inventaris) ? incoming.inventaris : this.db.inventaris || [];
  }
  /**
   * Hydrate memory & local mirror directly from Supabase Cloud (Single Source of Truth)
   * without adding synthetic restore audit logs or re-pushing back to Supabase.
   */
  async hydrateFromSupabase(incoming) {
    while (this.isWriting) {
      await new Promise((res) => setTimeout(res, 10));
    }
    this.isWriting = true;
    try {
      this.applyIncomingSnapshot(incoming);
      this.reconcileRelationalIntegrity();
      this.synchronizeVirtualAccounts();
      this.saveDirect(this.db);
      return true;
    } finally {
      this.isWriting = false;
    }
  }
  /**
   * Pulihkan Database dari File JSON Cadangan (dan langsung sinkron ke Supabase)
   */
  async restoreDatabase(incoming) {
    return await this.executeTransaction(() => {
      this.ensureDirectory();
      const emergencyFile = path2.join(TEMP_BACKUP_DIR, `pre_restore_emergency_${Date.now()}.json`);
      fs2.writeFileSync(emergencyFile, JSON.stringify(this.db), "utf-8");
      this.applyIncomingSnapshot(incoming);
      const { tanggal, jam, iso } = getWIBDateTime();
      this.db.auditLogs.unshift({
        id: `LOG-RESTORE-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin/Owner",
        jenisTransaksi: "UPDATE",
        idTransaksi: "SYS-RESTORE",
        detail: "Database dipulihkan dari file JSON cadangan dan disinkronkan ke Cloud Supabase.",
        nominal: 0
      });
      this.reconcileRelationalIntegrity();
      this.synchronizeVirtualAccounts();
      return true;
    });
  }
  /**
   * Reset all data clean for supplier, karyawan, produk, stok, and hasil bumi
   */
  resetCleanData() {
    return this.executeTransaction((db) => {
      db.karyawan = getDefaultRealKaryawanList();
      db.mitra = getDefaultRealMitraList();
      db.karyawan.forEach((kry) => {
        db.mitra.push({
          id: kry.idMitraTerkait || `MTR-${kry.id}`,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: "KARYAWAN",
          telepon: kry.telepon || "-",
          alamat: kry.alamat || "-",
          status: "AKTIF"
        });
      });
      db.upahHarian = [];
      db.penggajian = [];
      const { produk, stokBarang } = getDefaultProdukDagangList();
      db.produk = produk;
      db.stokBarang = stokBarang;
      db.stokHasilBumi = getDefaultHasilBumiList();
      db.penjualan = [];
      db.pembelianBarang = [];
      db.pembelianHasilBumi = [];
      db.penjualanHasilBumi = [];
      db.kasbonUang = [];
      db.bayarBon = [];
      db.transferRekening = [];
      db.pengeluaran = [];
      db.pencairanTitipan = [];
      db.rekening = getDefaultRekeningList();
      const now = getWIBDateTime();
      db.auditLogs.unshift({
        id: `LOG-RESET-${Date.now()}`,
        timestamp: now.iso,
        tanggal: now.tanggal,
        jam: now.jam,
        user: "KasirWap",
        jenisTransaksi: "VOID",
        idTransaksi: "SYS-RESET",
        detail: "Pembersihan database: Data mitra dan karyawan dikosongkan bersih untuk input data riil. 35 Master Item (Hasil Bumi 1-8 termasuk Kopi Titip & Produk Dagang 9-35) siap digunakan.",
        nominal: 0
      });
      this.synchronizeVirtualAccounts();
      return true;
    });
  }
  /**
   * Reconcile Relational Integrity Across All ERP Collections:
   * 1. Produk <-> StokBarang <-> KategoriProduk <-> Penjualan / PembelianBarang items
   * 2. Karyawan <-> Mitra (role: KARYAWAN) <-> UpahHarian / Penggajian
   * 3. Mitra <-> All 6 Transaction Tables (no orphan IDs, canonical names everywhere)
   */
  reconcileRelationalIntegrity() {
    const nowIso = getWIBDateTime().iso;
    if (!Array.isArray(this.db.rekening)) this.db.rekening = getDefaultRekeningList();
    if (!Array.isArray(this.db.mitra)) this.db.mitra = [];
    if (!Array.isArray(this.db.karyawan)) this.db.karyawan = [];
    if (!Array.isArray(this.db.upahHarian)) this.db.upahHarian = [];
    if (!Array.isArray(this.db.penggajian)) this.db.penggajian = [];
    if (!Array.isArray(this.db.produk)) this.db.produk = [];
    if (!Array.isArray(this.db.kategoriProduk)) this.db.kategoriProduk = [];
    if (!Array.isArray(this.db.stokBarang)) this.db.stokBarang = [];
    if (!Array.isArray(this.db.stokHasilBumi)) this.db.stokHasilBumi = [];
    if (!Array.isArray(this.db.penjualan)) this.db.penjualan = [];
    if (!Array.isArray(this.db.pembelianBarang)) this.db.pembelianBarang = [];
    if (!Array.isArray(this.db.pembelianHasilBumi)) this.db.pembelianHasilBumi = [];
    if (!Array.isArray(this.db.penjualanHasilBumi)) this.db.penjualanHasilBumi = [];
    if (!Array.isArray(this.db.kasbonUang)) this.db.kasbonUang = [];
    if (!Array.isArray(this.db.bayarBon)) this.db.bayarBon = [];
    if (!Array.isArray(this.db.transferRekening)) this.db.transferRekening = [];
    if (!Array.isArray(this.db.pengeluaran)) this.db.pengeluaran = [];
    if (!Array.isArray(this.db.pencairanTitipan)) this.db.pencairanTitipan = [];
    if (!Array.isArray(this.db.auditLogs)) this.db.auditLogs = [];
    if (!Array.isArray(this.db.divisi)) this.db.divisi = [];
    if (!Array.isArray(this.db.cashOpnameLogs)) this.db.cashOpnameLogs = [];
    if (!Array.isArray(this.db.inventaris)) this.db.inventaris = [];
    const defaultRekening = getDefaultRekeningList();
    for (const reqCode of ["KAS01", "BON01", "TIT01", "SINKRON", "REK-DPPARABO"]) {
      if (!this.db.rekening.some((r) => r.kode === reqCode)) {
        const def = defaultRekening.find((r) => r.kode === reqCode);
        if (def) this.db.rekening.push({ ...def });
      }
    }
    const sinkronAcc = this.db.rekening.find((r) => r.kode === "SINKRON");
    if (sinkronAcc) {
      sinkronAcc.isVirtual = true;
      sinkronAcc.kategori = "VIRTUAL_SISTEM";
      sinkronAcc.status = "AKTIF";
    }
    const usedRekCodes = /* @__PURE__ */ new Set();
    for (const t of this.db.transferRekening) {
      if (t.rekeningSumber) usedRekCodes.add(t.rekeningSumber);
      if (t.rekeningTujuan) usedRekCodes.add(t.rekeningTujuan);
    }
    for (const e of this.db.pengeluaran) {
      if (e.rekeningSumber) usedRekCodes.add(e.rekeningSumber);
    }
    for (const g of this.db.penggajian) {
      if (g.rekeningSumber) usedRekCodes.add(g.rekeningSumber);
    }
    for (const p of this.db.penjualan) {
      if (p.rekeningTujuan) usedRekCodes.add(p.rekeningTujuan);
    }
    for (const jhb of this.db.penjualanHasilBumi) {
      if (jhb.rekeningTujuan) usedRekCodes.add(jhb.rekeningTujuan);
    }
    for (const pb of this.db.pembelianBarang) {
      if (pb.rekeningSumber) usedRekCodes.add(pb.rekeningSumber);
    }
    for (const phb of this.db.pembelianHasilBumi) {
      if (phb.rekeningSumber) usedRekCodes.add(phb.rekeningSumber);
    }
    for (const k of this.db.kasbonUang) {
      if (k.rekeningSumber) usedRekCodes.add(k.rekeningSumber);
    }
    for (const b of this.db.bayarBon) {
      if (b.rekeningTujuan) usedRekCodes.add(b.rekeningTujuan);
    }
    for (const pt of this.db.pencairanTitipan) {
      if (pt.rekeningSumber) usedRekCodes.add(pt.rekeningSumber);
    }
    for (const log of this.db.auditLogs) {
      if (log.idTransaksi && log.idTransaksi.startsWith("REK-")) {
        usedRekCodes.add(log.idTransaksi);
      }
      if (log.rekeningTerkait && log.rekeningTerkait.startsWith("REK-")) {
        usedRekCodes.add(log.rekeningTerkait);
      }
    }
    for (const rek of this.db.rekening) {
      const legacyDummySaldo = LEGACY_DUMMY_DIVISI_BALANCES[rek.kode];
      if (legacyDummySaldo !== void 0 && rek.kategori === "OPERASIONAL_DIVISI" && !usedRekCodes.has(rek.kode) && rek.saldoAwal === legacyDummySaldo && rek.saldoSaatIni === legacyDummySaldo) {
        rek.saldoAwal = 0;
        rek.saldoSaatIni = 0;
      }
    }
    for (const rek of this.db.rekening) {
      const isDpParabot = rek.kode === "REK-DPPARABO" || rek.kode === "DPPARABOT" || !rek.isVirtual && rek.nama.toLowerCase().includes("dp parabot");
      if (isDpParabot || rek.isAnakPerusahaan || rek.kategori === "ANAK_PERUSAHAAN") {
        rek.kategori = "ANAK_PERUSAHAAN";
        rek.isAnakPerusahaan = true;
        rek.isVirtual = false;
        delete rek.rekeningIndukPenyimpan;
        if (isDpParabot) {
          if (rek.nama === "Buku Operasional DP Parabot") {
            rek.nama = "DP Parabot";
          }
          if (rek.atasNama === "Divisi DP Parabot") {
            rek.atasNama = "DP Parabot \u2014 Anak Perusahaan PT. Wijaya Agro Perkasa";
          }
          if (rek.nomorRekening === "DIV-DPPARABO") {
            rek.nomorRekening = "AFILIASI-DP-PARABOT";
          }
          if (!rek.keterangan || rek.keterangan === "Buku tracking operasional dan biaya divisi DP Parabot") {
            rek.keterangan = "Anak Perusahaan PT. Wijaya Agro Perkasa (Bukan Bank) \u2014 Terintegrasi otomatis sebagai Mitra dalam 1 transaksi terpadu";
          }
        }
        const defaultMitraId = isDpParabot ? "MTR-DPPARABOT" : rek.idMitraTerkait || `MTR-AFIL-${rek.kode}`;
        const defaultMitraKode = isDpParabot ? "DPP-01" : `AFIL-${rek.kode.slice(0, 6)}`;
        const cleanEntityName = isDpParabot ? "DP Parabot" : rek.nama.replace(/^Buku Operasional\s+/i, "").trim() || rek.nama;
        let linkedMitra = this.db.mitra.find(
          (m) => m.role !== "KARYAWAN" && (m.id === rek.idMitraTerkait || m.id === defaultMitraId || m.kodeRekeningTerkait === rek.kode || m.nama.trim().toLowerCase() === cleanEntityName.toLowerCase())
        );
        if (!linkedMitra) {
          linkedMitra = {
            id: defaultMitraId,
            kode: this.db.mitra.some((m) => m.kode === defaultMitraKode) ? `${defaultMitraKode}-${rek.kode.slice(-2)}` : defaultMitraKode,
            nama: cleanEntityName,
            role: "ANAK_PERUSAHAAN",
            telepon: "-",
            alamat: "Anak Perusahaan PT. Wijaya Agro Perkasa",
            status: rek.status || "AKTIF",
            isAnakPerusahaan: true,
            kodeRekeningTerkait: rek.kode,
            catatan: `Anak Perusahaan PT. Wijaya Agro Perkasa \u2014 Terhubung langsung ke Rekening ${rek.kode} (Otomatis 1 Transaksi Terpadu)`
          };
          this.db.mitra.push(linkedMitra);
        } else {
          linkedMitra.isAnakPerusahaan = true;
          linkedMitra.kodeRekeningTerkait = rek.kode;
          if (linkedMitra.role !== "KARYAWAN") {
            linkedMitra.role = "ANAK_PERUSAHAAN";
          }
          linkedMitra.status = rek.status || linkedMitra.status || "AKTIF";
          if (!linkedMitra.catatan) {
            linkedMitra.catatan = `Anak Perusahaan PT. Wijaya Agro Perkasa \u2014 Terhubung langsung ke Rekening ${rek.kode}`;
          }
        }
        rek.idMitraTerkait = linkedMitra.id;
        rek.namaMitraTerkait = linkedMitra.nama;
      }
    }
    const anakRekMap = new Map(
      this.db.rekening.filter((r) => r.isAnakPerusahaan || r.kategori === "ANAK_PERUSAHAAN").map((r) => [r.kode, r])
    );
    for (const trf of this.db.transferRekening) {
      const srcAnak = anakRekMap.get(trf.rekeningSumber);
      const dstAnak = anakRekMap.get(trf.rekeningTujuan);
      if (srcAnak && dstAnak) {
        trf.idMitraTerkait = dstAnak.idMitraTerkait;
        trf.namaMitraTerkait = `${srcAnak.namaMitraTerkait || srcAnak.nama} -> ${dstAnak.namaMitraTerkait || dstAnak.nama}`;
        trf.tipeMutasiAfiliasi = "ANTAR_ANAK_PERUSAHAAN";
      } else if (dstAnak) {
        trf.idMitraTerkait = dstAnak.idMitraTerkait;
        trf.namaMitraTerkait = dstAnak.namaMitraTerkait || dstAnak.nama;
        trf.tipeMutasiAfiliasi = "SIMPAN_KE_ANAK_PERUSAHAAN";
      } else if (srcAnak) {
        trf.idMitraTerkait = srcAnak.idMitraTerkait;
        trf.namaMitraTerkait = srcAnak.namaMitraTerkait || srcAnak.nama;
        trf.tipeMutasiAfiliasi = "TARIK_DARI_ANAK_PERUSAHAAN";
      }
    }
    const katSet = new Set(
      this.db.kategoriProduk.map((k) => String(k.nama || "").trim().replace(/\s+/g, " ").toUpperCase())
    );
    const ensureKat = (rawKat) => {
      const clean = String(rawKat || "").trim().replace(/\s+/g, " ").toUpperCase() || "LAINNYA";
      if (!katSet.has(clean)) {
        katSet.add(clean);
        this.db.kategoriProduk.push({
          nama: clean,
          deskripsi: "",
          createdAt: nowIso
        });
      }
      return clean;
    };
    for (const p of this.db.produk) {
      p.kode = String(p.kode || "").trim().toUpperCase();
    }
    for (const s of this.db.stokBarang) {
      s.kode = String(s.kode || "").trim().toUpperCase();
    }
    const produkMap = new Map(this.db.produk.map((p) => [p.kode, p]));
    const stokMap = new Map(this.db.stokBarang.map((s) => [s.kode, s]));
    for (const pj of this.db.penjualan) {
      for (const it of pj.items || []) {
        const cleanKode = String(it.kodeProduk || "").trim().toUpperCase();
        if (cleanKode) it.kodeProduk = cleanKode;
        if (cleanKode && !produkMap.has(cleanKode)) {
          const recovered = {
            kode: cleanKode,
            kategori: ensureKat("LAINNYA"),
            nama: it.namaProduk || cleanKode,
            satuan: it.satuan || "SAK",
            hargaBeli: it.hargaBeli || 0,
            hargaJual: it.harga || 0,
            hargaKhususRekanan: it.harga || 0,
            status: "AKTIF"
          };
          this.db.produk.push(recovered);
          produkMap.set(recovered.kode, recovered);
        }
      }
    }
    for (const pb of this.db.pembelianBarang) {
      for (const it of pb.items || []) {
        const cleanKode = String(it.kodeProduk || "").trim().toUpperCase();
        if (cleanKode) it.kodeProduk = cleanKode;
        if (cleanKode && cleanKode !== "REKAP-NOTA" && !produkMap.has(cleanKode)) {
          const modalBeli = Math.max(0, Number(it.hargaBeliSatuan) || 0);
          const recovered = {
            kode: cleanKode,
            kategori: ensureKat("LAINNYA"),
            nama: it.namaProduk || cleanKode,
            satuan: it.satuan || "SAK",
            hargaBeli: modalBeli,
            hargaJual: modalBeli,
            hargaKhususRekanan: modalBeli,
            status: "AKTIF"
          };
          this.db.produk.push(recovered);
          produkMap.set(recovered.kode, recovered);
        }
      }
    }
    for (const p of this.db.produk) {
      p.kategori = ensureKat(p.kategori);
      const s = stokMap.get(p.kode);
      if (!s) {
        const createdStok = {
          kode: p.kode,
          namaProduk: p.nama,
          satuan: p.satuan,
          stok: 0,
          minimum: 10,
          updateTerakhir: nowIso
        };
        this.db.stokBarang.push(createdStok);
        stokMap.set(p.kode, createdStok);
      } else {
        s.namaProduk = p.nama;
        s.satuan = p.satuan;
      }
    }
    for (const s of this.db.stokBarang) {
      if (s.kode && !produkMap.has(s.kode)) {
        const createdProd = {
          kode: s.kode,
          kategori: ensureKat("LAINNYA"),
          nama: s.namaProduk || s.kode,
          satuan: s.satuan || "SAK",
          hargaBeli: 0,
          hargaJual: 0,
          hargaKhususRekanan: 0,
          status: "AKTIF"
        };
        this.db.produk.push(createdProd);
        produkMap.set(s.kode, createdProd);
      }
    }
    const purchasedCodes = /* @__PURE__ */ new Set();
    for (const pb of this.db.pembelianBarang) {
      for (const it of pb.items || []) {
        if (it.kodeProduk && it.kodeProduk !== "REKAP-NOTA") {
          purchasedCodes.add(String(it.kodeProduk).trim().toUpperCase());
        }
      }
    }
    const soldCodes = /* @__PURE__ */ new Set();
    for (const pj of this.db.penjualan) {
      for (const it of pj.items || []) {
        if (it.kodeProduk) {
          soldCodes.add(String(it.kodeProduk).trim().toUpperCase());
        }
      }
    }
    const manualEditedCodes = /* @__PURE__ */ new Set();
    for (const log of this.db.auditLogs || []) {
      const txId = String(log.idTransaksi || "").trim().toUpperCase();
      if (txId.startsWith("PRD-")) {
        manualEditedCodes.add(txId.slice(4));
      }
    }
    for (const p of this.db.produk) {
      const st = stokMap.get(p.kode);
      const currentStok = st?.stok || 0;
      const legacyTuple = LEGACY_DUMMY_PRODUK_PRICES[p.kode];
      if (legacyTuple && currentStok === 0 && !purchasedCodes.has(p.kode) && !soldCodes.has(p.kode) && !manualEditedCodes.has(p.kode) && p.hargaBeli === legacyTuple[0] && p.hargaJual === legacyTuple[1] && (p.hargaKhususRekanan || 0) === legacyTuple[2]) {
        p.hargaBeli = 0;
        p.hargaJual = 0;
        p.hargaKhususRekanan = 0;
      }
    }
    const purchasedHbCodes = /* @__PURE__ */ new Set();
    for (const phb of this.db.pembelianHasilBumi || []) {
      if (phb.komoditasKode) {
        purchasedHbCodes.add(String(phb.komoditasKode).trim().toUpperCase());
      }
    }
    for (const hb of this.db.stokHasilBumi || []) {
      const cleanHbKode = String(hb.kode || "").trim().toUpperCase();
      const legacyHbPrice = LEGACY_DUMMY_HASIL_BUMI_PRICES[cleanHbKode];
      if (legacyHbPrice !== void 0 && (hb.stok || 0) === 0 && !purchasedHbCodes.has(cleanHbKode) && hb.hargaBeliStandar === legacyHbPrice) {
        hb.hargaBeliStandar = 0;
      }
    }
    for (const pj of this.db.penjualan) {
      for (const it of pj.items || []) {
        const prod = produkMap.get(it.kodeProduk);
        if (prod) {
          it.namaProduk = prod.nama;
          it.satuan = prod.satuan;
        }
      }
    }
    for (const pb of this.db.pembelianBarang) {
      for (const it of pb.items || []) {
        if (it.kodeProduk !== "REKAP-NOTA") {
          const prod = produkMap.get(it.kodeProduk);
          if (prod) {
            it.namaProduk = prod.nama;
            it.satuan = prod.satuan;
          }
        }
      }
    }
    for (const kry of this.db.karyawan) {
      const expectedMitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      kry.idMitraTerkait = expectedMitraId;
      const cleanNama = kry.nama.replace(/\s*\(Karyawan\)$/i, "").trim();
      kry.nama = cleanNama;
      let mtr = this.db.mitra.find(
        (m) => m.id === expectedMitraId || kry.nik && m.kode === kry.nik || m.role === "KARYAWAN" && m.nama.replace(/\s*\(Karyawan\)$/i, "").trim().toLowerCase() === cleanNama.toLowerCase()
      );
      if (!mtr) {
        mtr = {
          id: expectedMitraId,
          kode: kry.nik || kry.id,
          nama: cleanNama,
          role: "KARYAWAN",
          telepon: kry.telepon || "-",
          alamat: kry.alamat || "-",
          status: kry.status || "AKTIF",
          catatan: `Karyawan: ${kry.jabatan || "Staff"} (Divisi ${kry.divisi || kry.departemen || "Gudang"})`
        };
        this.db.mitra.push(mtr);
      } else {
        kry.idMitraTerkait = mtr.id;
        mtr.nama = cleanNama;
        mtr.role = "KARYAWAN";
        mtr.status = kry.status || mtr.status || "AKTIF";
        if (kry.telepon && kry.telepon !== "-") mtr.telepon = kry.telepon;
        if (kry.alamat && kry.alamat !== "-") mtr.alamat = kry.alamat;
      }
      for (const u of this.db.upahHarian) {
        if (u.idKaryawan === kry.id) {
          u.namaKaryawan = cleanNama;
          u.nikKaryawan = kry.nik;
        }
      }
      for (const g of this.db.penggajian) {
        if (g.idKaryawan === kry.id) {
          g.namaKaryawan = cleanNama;
          g.nikKaryawan = kry.nik;
        }
      }
    }
    const mitraMap = new Map(this.db.mitra.map((m) => [m.id, m]));
    const syncTxMitra = (tx, defaultRole) => {
      if (!tx.idMitra || tx.idMitra === "UMUM") return;
      const existing = mitraMap.get(tx.idMitra);
      if (existing) {
        tx.namaMitra = existing.nama;
      } else {
        const cleanRecoveredName = (tx.namaMitra || tx.idMitra).replace(/\s*\(Karyawan\)$/i, "").trim();
        const recoveredMitra = {
          id: tx.idMitra,
          kode: tx.idMitra.slice(0, 10).toUpperCase(),
          nama: cleanRecoveredName,
          role: defaultRole,
          telepon: "-",
          alamat: "-",
          status: "AKTIF",
          catatan: "Dipulihkan otomatis dari histori transaksi terpadu"
        };
        this.db.mitra.push(recoveredMitra);
        mitraMap.set(recoveredMitra.id, recoveredMitra);
        tx.namaMitra = recoveredMitra.nama;
      }
    };
    for (const p of this.db.penjualan) syncTxMitra(p, "CUSTOMER");
    for (const jhb of this.db.penjualanHasilBumi || []) syncTxMitra(jhb, "CUSTOMER");
    for (const pb of this.db.pembelianHasilBumi) syncTxMitra(pb, "MITRA_TANI");
    for (const pbb of this.db.pembelianBarang) syncTxMitra(pbb, "SUPPLIER");
    for (const k of this.db.kasbonUang) syncTxMitra(k, "MITRA_TANI");
    for (const b of this.db.bayarBon) syncTxMitra(b, "MITRA_TANI");
    for (const pt of this.db.pencairanTitipan) syncTxMitra(pt, "MITRA_TANI");
  }
  /**
   * Synchronize Virtual Accounts BON01 (Kasbon/Piutang Customer) and TIT01 (Titip Panen & Hutang Supplier)
   * Uses the exact per-mitra formula as RekapMasterMitra & RekeningKoranMitra so all modules match 100%.
   */
  synchronizeVirtualAccounts() {
    const totalKasbonBarang = (this.db.penjualan || []).filter((p) => p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + Math.max(0, p.sisaPiutang || 0), 0) + (this.db.penjualanHasilBumi || []).filter((j) => j.metodePembayaran === "PIUTANG" && j.statusPembayaran === "BELUM_BAYAR").reduce((sum, j) => sum + Math.max(0, j.sisaPiutang || 0), 0);
    const totalKasbonUang = (this.db.kasbonUang || []).filter((k) => k.status !== "LUNAS").reduce((sum, k) => sum + Math.max(0, k.sisaKasbon || 0), 0);
    const totalBon = totalKasbonBarang + totalKasbonUang;
    const mitraIds = new Set(this.db.mitra.map((m) => m.id));
    for (const p of this.db.pembelianHasilBumi || []) {
      if (p.idMitra && p.metodePembayaran === "TITIP") mitraIds.add(p.idMitra);
    }
    for (const pb of this.db.pembelianBarang || []) {
      if (pb.idMitra && pb.metodePembayaran === "HUTANG") mitraIds.add(pb.idMitra);
    }
    let totalTitip = 0;
    for (const mId of mitraIds) {
      const titipPanenKotor = (this.db.pembelianHasilBumi || []).filter((p) => p.idMitra === mId && p.metodePembayaran === "TITIP").reduce((sum, p) => sum + (p.totalNominal || 0), 0);
      const hutangKulakanKotor = (this.db.pembelianBarang || []).filter((pb) => pb.idMitra === mId && pb.metodePembayaran === "HUTANG" && pb.status !== "LUNAS").reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const pencairanMitra = (this.db.pencairanTitipan || []).filter((pt) => pt.idMitra === mId).reduce((sum, pt) => sum + (pt.nominalPencairan || 0), 0);
      totalTitip += Math.max(0, titipPanenKotor + hutangKulakanKotor - pencairanMitra);
    }
    const bon01 = this.db.rekening.find((r) => r.kode === "BON01");
    if (bon01) {
      bon01.saldoSaatIni = totalBon;
    }
    const tit01 = this.db.rekening.find((r) => r.kode === "TIT01");
    if (tit01) {
      tit01.saldoSaatIni = totalTitip;
    }
    const totalSinkronVolume = (this.db.bayarBon || []).filter(
      (b) => b.metode === "SINKRON" || b.metode === "KOMPENSASI_TITIP" || b.rekeningTujuan === "SINKRON" || b.rekeningTujuan === "KOMPENSASI_TITIP" || Boolean(b.isKompensasiTitipan)
    ).reduce((sum, b) => sum + Math.max(0, b.nominalBayar || 0), 0);
    const sinkronRek = this.db.rekening.find((r) => r.kode === "SINKRON");
    if (sinkronRek) {
      sinkronRek.saldoSaatIni = totalSinkronVolume;
    }
    this.synchronizeDivisiAccounts();
  }
  /**
   * Pastikan setiap nama divisi memiliki entri di db.divisi dan Rekening OPERASIONAL_DIVISI (saldoAwal = 0)
   */
  ensureDivisiRegisteredInMemory(rawNama) {
    const trimmed = String(rawNama || "").trim();
    if (!trimmed) return null;
    if (!Array.isArray(this.db.divisi)) this.db.divisi = [];
    const existingList = this.getDivisiList();
    let found = existingList.find((d) => d.nama.toLowerCase() === trimmed.toLowerCase());
    if (!found) {
      const cleanCode = trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
      const id = `DIV-${cleanCode || Date.now().toString().slice(-6)}`;
      const kodeRekening = `REK-${cleanCode || Date.now().toString().slice(-6)}`;
      found = {
        id,
        nama: trimmed,
        kodeRekening,
        penanggungJawab: `Koordinator ${trimmed}`,
        deskripsi: `Unit kerja & buku arus kas divisi ${trimmed}`,
        isCustom: true
      };
      this.db.divisi.push(found);
    }
    if (!this.db.rekening.some((r) => r.kode === found.kodeRekening)) {
      this.db.rekening.push({
        kode: found.kodeRekening,
        nama: `Buku Arus Kas ${found.nama}`,
        atasNama: `Divisi ${found.nama}`,
        nomorRekening: found.id,
        saldoAwal: 0,
        saldoSaatIni: 0,
        status: "AKTIF",
        isVirtual: false,
        kategori: "OPERASIONAL_DIVISI",
        rekeningIndukPenyimpan: "KAS01",
        keterangan: `Buku tracking arus kas masuk/keluar operasional divisi ${found.nama}`
      });
    }
    return found;
  }
  /**
   * Synchronize Operational Division Cashflow Accounts (OPERASIONAL_DIVISI):
   * Otomatis menambah saldo divisi saat Penjualan (Tunai/Transfer) & Pelunasan Bon Barang (Tunai/Transfer),
   * serta mengurangi saldo divisi saat Pembelian/Kulakan (Tunai/Transfer), Biaya Operasional, dan Upah Karyawan.
   */
  synchronizeDivisiAccounts() {
    const norm = (s) => String(s || "").trim().toLowerCase();
    this.ensureDivisiRegisteredInMemory("BRILink");
    for (const p of this.db.penjualan || []) {
      if (p.divisi) this.ensureDivisiRegisteredInMemory(p.divisi);
    }
    for (const j of this.db.penjualanHasilBumi || []) {
      if (j.divisi) this.ensureDivisiRegisteredInMemory(j.divisi);
    }
    for (const pb of this.db.pembelianBarang || []) {
      if (pb.divisi) this.ensureDivisiRegisteredInMemory(pb.divisi);
    }
    for (const phb of this.db.pembelianHasilBumi || []) {
      if (phb.divisi) this.ensureDivisiRegisteredInMemory(phb.divisi);
    }
    for (const ex of this.db.pengeluaran || []) {
      if (ex.divisi) this.ensureDivisiRegisteredInMemory(ex.divisi);
    }
    for (const gj of this.db.penggajian || []) {
      if (gj.divisi) this.ensureDivisiRegisteredInMemory(gj.divisi);
    }
    const penjualanDivisiMap = /* @__PURE__ */ new Map();
    for (const p of this.db.penjualan || []) {
      if (p.noPenjualan && p.divisi) {
        penjualanDivisiMap.set(p.noPenjualan, norm(p.divisi));
      }
    }
    for (const j of this.db.penjualanHasilBumi || []) {
      if (j.noPenjualan && j.divisi) {
        penjualanDivisiMap.set(j.noPenjualan, norm(j.divisi));
      }
    }
    const allDivisi = this.getDivisiList();
    for (const div of allDivisi) {
      const targetNorm = norm(div.nama);
      const rek = this.db.rekening.find((r) => r.kode === div.kodeRekening);
      if (!rek) continue;
      const masukPenjualanToko = (this.db.penjualan || []).filter(
        (p) => p.divisi && norm(p.divisi) === targetNorm && (p.metode === "TUNAI" || p.metode === "TRANSFER") && (p.totalNominal || 0) > 0
      ).reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0);
      const masukPenjualanHasilBumi = (this.db.penjualanHasilBumi || []).filter(
        (j) => j.divisi && norm(j.divisi) === targetNorm && (j.metodePembayaran === "TUNAI" || j.metodePembayaran === "TRANSFER") && (j.totalNominal || 0) > 0
      ).reduce((sum, j) => sum + (Number(j.totalNominal) || 0), 0);
      let masukPelunasanPiutangDivisi = 0;
      for (const b of this.db.bayarBon || []) {
        if (b.metode !== "TUNAI" && b.metode !== "TRANSFER") continue;
        if (b.isKompensasiTitipan || b.isPotongGaji) continue;
        for (const alok of b.alokasi || []) {
          if (alok.jenis === "KASBON_BARANG" && (alok.nominalDibayar || 0) > 0) {
            const asalDivisi = penjualanDivisiMap.get(alok.refId);
            if (asalDivisi && asalDivisi === targetNorm) {
              masukPelunasanPiutangDivisi += Number(alok.nominalDibayar) || 0;
            }
          }
        }
      }
      const masukDropping = (this.db.transferRekening || []).filter((t) => t.status === "BERHASIL" && t.rekeningTujuan === div.kodeRekening).reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);
      const totalMasukDivisi = masukPenjualanToko + masukPenjualanHasilBumi + masukPelunasanPiutangDivisi + masukDropping;
      const keluarPembelianBarang = (this.db.pembelianBarang || []).filter(
        (pb) => pb.divisi && norm(pb.divisi) === targetNorm && (pb.metodePembayaran === "TUNAI" || pb.metodePembayaran === "TRANSFER") && (pb.totalNominal || 0) > 0
      ).reduce((sum, pb) => sum + (Number(pb.totalNominal) || 0), 0);
      const keluarPembelianHasilBumi = (this.db.pembelianHasilBumi || []).filter(
        (phb) => phb.divisi && norm(phb.divisi) === targetNorm && phb.komoditasKode !== "PINJAMAN_DANA" && phb.komoditasKode !== "TITIP_DANA" && !String(phb.komoditasNama || "").toLowerCase().includes("pinjaman uang") && !phb.isBelumPutusHarga && (phb.metodePembayaran === "TUNAI" || phb.metodePembayaran === "TRANSFER") && phb.rekeningSumber !== "TIT01" && phb.rekeningSumber !== "BON01" && (phb.totalNominal || 0) > 0
      ).reduce((sum, phb) => sum + (Number(phb.totalNominal) || 0), 0);
      const keluarOperasional = (this.db.pengeluaran || []).filter(
        (p) => p.divisi ? norm(p.divisi) === targetNorm : p.rekeningSumber === div.kodeRekening
      ).reduce((sum, p) => sum + (Number(p.nominal) || 0), 0);
      const keluarGaji = (this.db.penggajian || []).filter(
        (g) => g.divisi ? norm(g.divisi) === targetNorm : g.rekeningSumber === div.kodeRekening
      ).reduce((sum, g) => sum + (Number(g.gajiBersihDibayar) || 0), 0);
      const keluarTransfer = (this.db.transferRekening || []).filter((t) => t.status === "BERHASIL" && t.rekeningSumber === div.kodeRekening).reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);
      const totalKeluarDivisi = keluarPembelianBarang + keluarPembelianHasilBumi + keluarOperasional + keluarGaji + keluarTransfer;
      rek.saldoSaatIni = Math.round(
        (Number(rek.saldoAwal) || 0) + totalMasukDivisi - totalKeluarDivisi
      );
    }
  }
  /**
   * Real-time Database & Cross-Module Integration Status Report
   */
  getIntegrityStatus() {
    const supStatus = supabaseSyncEngine.getStatus();
    const stokCodes = new Set((this.db.stokBarang || []).map((s) => s.kode));
    const produkStokMatched = (this.db.produk || []).every((p) => stokCodes.has(p.kode));
    const mitraIds = new Set((this.db.mitra || []).map((m) => m.id));
    const karyawanMitraMatched = (this.db.karyawan || []).every(
      (k) => k.idMitraTerkait && mitraIds.has(k.idMitraTerkait)
    );
    const bon01Saldo = this.db.rekening.find((r) => r.kode === "BON01")?.saldoSaatIni || 0;
    const tit01Saldo = this.db.rekening.find((r) => r.kode === "TIT01")?.saldoSaatIni || 0;
    const calcBon = (this.db.penjualan || []).filter((p) => p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((s, p) => s + Math.max(0, p.sisaPiutang || 0), 0) + (this.db.penjualanHasilBumi || []).filter((j) => j.metodePembayaran === "PIUTANG" && j.statusPembayaran === "BELUM_BAYAR").reduce((s, j) => s + Math.max(0, j.sisaPiutang || 0), 0) + (this.db.kasbonUang || []).filter((k) => k.status !== "LUNAS").reduce((s, k) => s + Math.max(0, k.sisaKasbon || 0), 0);
    const bon01Reconciled = Math.abs(bon01Saldo - calcBon) < 1;
    let calcTitip = 0;
    for (const m of this.db.mitra || []) {
      const tk = (this.db.pembelianHasilBumi || []).filter((p) => p.idMitra === m.id && p.metodePembayaran === "TITIP").reduce((s, p) => s + (p.totalNominal || 0), 0);
      const hk = (this.db.pembelianBarang || []).filter((pb) => pb.idMitra === m.id && pb.metodePembayaran === "HUTANG" && pb.status !== "LUNAS").reduce((s, pb) => s + (pb.totalNominal || 0), 0);
      const pc = (this.db.pencairanTitipan || []).filter((pt) => pt.idMitra === m.id).reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
      calcTitip += Math.max(0, tk + hk - pc);
    }
    const tit01Reconciled = Math.abs(tit01Saldo - calcTitip) < 1;
    const counts = {
      produk: (this.db.produk || []).length,
      kategoriProduk: (this.db.kategoriProduk || []).length,
      stokBarang: (this.db.stokBarang || []).length,
      stokHasilBumi: (this.db.stokHasilBumi || []).length,
      mitra: (this.db.mitra || []).length,
      karyawan: (this.db.karyawan || []).length,
      rekening: (this.db.rekening || []).length,
      penjualan: (this.db.penjualan || []).length,
      pembelianBarang: (this.db.pembelianBarang || []).length,
      pembelianHasilBumi: (this.db.pembelianHasilBumi || []).length,
      penjualanHasilBumi: (this.db.penjualanHasilBumi || []).length,
      pencairanTitipan: (this.db.pencairanTitipan || []).length,
      kasbonUang: (this.db.kasbonUang || []).length,
      bayarBon: (this.db.bayarBon || []).length,
      pengeluaran: (this.db.pengeluaran || []).length,
      transferRekening: (this.db.transferRekening || []).length,
      upahHarian: (this.db.upahHarian || []).length,
      penggajian: (this.db.penggajian || []).length,
      auditLogs: (this.db.auditLogs || []).length,
      totalRecords: 0
    };
    counts.totalRecords = counts.produk + counts.kategoriProduk + counts.stokBarang + counts.stokHasilBumi + counts.mitra + counts.karyawan + counts.rekening + counts.penjualan + counts.pembelianBarang + counts.pembelianHasilBumi + counts.penjualanHasilBumi + counts.pencairanTitipan + counts.kasbonUang + counts.bayarBon + counts.pengeluaran + counts.transferRekening + counts.upahHarian + counts.penggajian + counts.auditLogs;
    const anakPerusahaanMitraMatched = (this.db.rekening || []).filter((r) => r.isAnakPerusahaan || r.kategori === "ANAK_PERUSAHAAN").every((r) => Boolean(r.idMitraTerkait && mitraIds.has(r.idMitraTerkait)));
    return {
      singleSource: supStatus.configured ? "SUPABASE_CLOUD" : "LOCAL_WAITING_CONFIG",
      supabaseConfigured: supStatus.configured,
      supabaseUrlMasked: supStatus.url,
      lastSyncTime: supStatus.lastSyncTime,
      lastSyncStatus: supStatus.lastSyncStatus,
      lastSyncMessage: supStatus.lastSyncMessage,
      isHealthy: produkStokMatched && karyawanMitraMatched && anakPerusahaanMitraMatched && bon01Reconciled && tit01Reconciled,
      counts,
      checks: {
        produkStokMatched,
        karyawanMitraMatched,
        anakPerusahaanMitraMatched,
        bon01Reconciled,
        tit01Reconciled,
        bon01Saldo,
        tit01Saldo
      }
    };
  }
  /**
   * Get all registered divisions (defaults + custom from database)
   */
  getDivisiList() {
    const custom = this.db.divisi || [];
    const map = /* @__PURE__ */ new Map();
    DAFTAR_DIVISI.forEach((d) => {
      map.set(d.nama.toLowerCase(), {
        id: d.id,
        nama: d.nama,
        kodeRekening: d.kodeRekening,
        penanggungJawab: d.penanggungJawab,
        deskripsi: d.deskripsi,
        isCustom: false
      });
    });
    custom.forEach((c) => {
      map.set(c.nama.toLowerCase(), {
        id: c.id,
        nama: c.nama,
        kodeRekening: c.kodeRekening,
        penanggungJawab: c.penanggungJawab,
        deskripsi: c.deskripsi,
        isCustom: true
      });
    });
    return Array.from(map.values());
  }
  /**
   * Add a new division dynamically and provision its tracking account
   */
  async addDivisi(nama, deskripsi, penanggungJawab) {
    return await this.executeTransaction((db) => {
      if (!db.divisi) db.divisi = [];
      const trimmed = nama.trim();
      const existing = this.getDivisiList().find((d) => d.nama.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        return existing;
      }
      const cleanCode = trimmed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
      const id = `DIV-${cleanCode || Date.now().toString().slice(-6)}`;
      const kodeRekening = `REK-${cleanCode || Date.now().toString().slice(-6)}`;
      const newDivisi = {
        id,
        nama: trimmed,
        kodeRekening,
        penanggungJawab: penanggungJawab || `Koordinator ${trimmed}`,
        deskripsi: deskripsi || `Unit kerja operasional & pengeluaran ${trimmed}`,
        isCustom: true
      };
      db.divisi.push(newDivisi);
      if (!db.rekening.some((r) => r.kode === kodeRekening)) {
        db.rekening.push({
          kode: kodeRekening,
          nama: `Buku Operasional ${trimmed}`,
          atasNama: `Divisi ${trimmed}`,
          nomorRekening: id,
          saldoAwal: 0,
          saldoSaatIni: 0,
          status: "AKTIF",
          isVirtual: false,
          kategori: "OPERASIONAL_DIVISI",
          rekeningIndukPenyimpan: "KAS01",
          keterangan: `Buku tracking operasional dan biaya divisi ${trimmed}`
        });
      }
      return newDivisi;
    });
  }
  /**
   * Reset / Clean slate: empty all transactions, partners, and employees
   * ready to be filled with real company data. Keeps master items & accounts.
   */
  async resetAllData() {
    await this.executeTransaction((db) => {
      const now = getWIBDateTime();
      db.mitra = [];
      db.karyawan = [];
      db.upahHarian = [];
      db.penggajian = [];
      db.penjualan = [];
      db.pembelianBarang = [];
      db.pembelianHasilBumi = [];
      db.penjualanHasilBumi = [];
      db.kasbonUang = [];
      db.bayarBon = [];
      db.transferRekening = [];
      db.pengeluaran = [];
      db.pencairanTitipan = [];
      db.cashOpnameLogs = [];
      db.auditLogs = [
        {
          id: `LOG-RESET-${Date.now()}`,
          timestamp: now.iso,
          tanggal: now.tanggal,
          jam: now.jam,
          user: "Admin/Owner",
          jenisTransaksi: "VOID",
          idTransaksi: "SYS-CLEAN-DATA",
          detail: "Seluruh data transaksi, mitra, dan karyawan telah dikosongkan. Siap diinput dengan data riil PT. WIJAYA AGRO PERKASA.",
          nominal: 0
        }
      ];
    });
  }
  /**
   * Transactional lock execution wrapper with automatic relational reconciliation & non-blocking background sync to Supabase
   */
  async executeTransaction(action) {
    while (this.isWriting) {
      await new Promise((res) => setTimeout(res, 5));
    }
    this.isWriting = true;
    try {
      const result = action(this.db);
      this.reconcileRelationalIntegrity();
      this.synchronizeVirtualAccounts();
      this.saveDirect(this.db);
      const syncWaitMs = process.env.VERCEL || process.env.NETLIFY ? 8e3 : 1800;
      await supabaseSyncEngine.flushSync(this.db, syncWaitMs);
      return result;
    } finally {
      this.isWriting = false;
    }
  }
};
var dbManager = new DatabaseManager();

// src/server/services/transactionService.ts
function generateId(prefix) {
  const { tanggal } = getWIBDateTime();
  const [d, m, y] = tanggal.split("/");
  const dateCode = `${y.slice(2)}${m}${d}`;
  const randomSuffix = Math.floor(1e3 + Math.random() * 9e3);
  return `${prefix}${dateCode}${randomSuffix}`;
}
var TransactionService = class _TransactionService {
  /**
   * Helper: Detect whether a Rekening is an Anak Perusahaan / Subsidiary-Mitra account (e.g. DP Parabot)
   */
  static isAnakPerusahaanRekening(rek) {
    if (!rek) return false;
    return Boolean(
      rek.isAnakPerusahaan || rek.kategori === "ANAK_PERUSAHAAN" || rek.kode === "REK-DPPARABO"
    );
  }
  /**
   * Helper: Add an immutable audit log
   */
  static addAuditLog(db, jenis, idTransaksi, detail, nominal, rekeningTerkait = "", user = "Kasir Wijaya Agro") {
    const { tanggal, jam, iso } = getWIBDateTime();
    db.auditLogs.unshift({
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      timestamp: iso,
      tanggal,
      jam,
      user,
      jenisTransaksi: jenis,
      idTransaksi,
      detail,
      nominal,
      rekeningTerkait
    });
  }
  // ==========================================
  // 1. PENJUALAN TOKO (DENGAN HARGA SUGESTI & PROSES NEGO)
  // ==========================================
  static async processPenjualan(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      let finalMitraId = "UMUM";
      let finalMitraNama = params.namaPembeliManual?.trim() || "Pelanggan Umum";
      if (params.idMitra && params.idMitra !== "UMUM") {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) {
          throw new Error("Mitra tidak ditemukan");
        }
        if (mitra.status !== "AKTIF") {
          throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
        }
        finalMitraId = mitra.id;
        finalMitraNama = mitra.nama;
      } else if (params.namaPembeliManual && params.namaPembeliManual.trim()) {
        finalMitraId = "UMUM";
        finalMitraNama = params.namaPembeliManual.trim();
      }
      if (params.metode === "KASBON" && finalMitraId === "UMUM") {
        throw new Error("Metode KASBON piutang hanya berlaku untuk mitra terdaftar");
      }
      if (!params.items || params.items.length === 0) {
        throw new Error("Item penjualan tidak boleh kosong");
      }
      const tipePembeli = params.tipePembeli || (finalMitraId === "UMUM" ? "UMUM" : "REKANAN");
      const processedItems = [];
      let totalNominal = 0;
      let totalModalHpp = 0;
      for (const item of params.items) {
        if (!item.qty || item.qty <= 0) {
          throw new Error(`Qty untuk produk ${item.kodeProduk} harus lebih dari 0`);
        }
        const cleanKode = String(item.kodeProduk || "").trim().toUpperCase();
        const product = db.produk.find((p) => String(p.kode || "").trim().toUpperCase() === cleanKode);
        if (!product) {
          throw new Error(`Produk dengan kode ${cleanKode} tidak ditemukan`);
        }
        if (product.status !== "AKTIF") {
          throw new Error(`Produk ${product.nama} tidak aktif`);
        }
        const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
        if (!stokItem) {
          throw new Error(`Data stok untuk produk ${product.nama} tidak ditemukan`);
        }
        if (stokItem.stok < item.qty) {
          throw new Error(
            `Stok tidak mencukupi untuk "${product.nama}". Stok tersedia: ${stokItem.stok} ${stokItem.satuan}, diminta: ${item.qty} ${stokItem.satuan}`
          );
        }
        const modalHppSatuan = Math.max(0, Number(product.hargaBeli) || 0);
        const baseJualUmum = product.hargaJual && product.hargaJual > 0 ? product.hargaJual : modalHppSatuan;
        const baseJualRekanan = product.hargaKhususRekanan && product.hargaKhususRekanan > 0 ? product.hargaKhususRekanan : baseJualUmum;
        const defaultSuggested = tipePembeli === "REKANAN" ? baseJualRekanan : baseJualUmum;
        const hargaSugesti = item.hargaSugesti !== void 0 ? item.hargaSugesti : defaultSuggested;
        const hargaDeal = item.harga !== void 0 && item.harga >= 0 ? item.harga : defaultSuggested;
        const subtotal = hargaDeal * item.qty;
        const modalHppItem = modalHppSatuan * item.qty;
        const labaKotorItem = subtotal - modalHppItem;
        totalNominal += subtotal;
        totalModalHpp += modalHppItem;
        processedItems.push({
          kodeProduk: product.kode,
          namaProduk: product.nama,
          satuan: product.satuan,
          qty: item.qty,
          hargaBeli: modalHppSatuan,
          hargaSugesti,
          harga: hargaDeal,
          subtotal,
          labaKotor: labaKotorItem
        });
        stokItem.stok -= item.qty;
        stokItem.updateTerakhir = iso;
      }
      let finalRekeningTujuan = "";
      let statusPembayaran = "LUNAS";
      let sisaPiutang = 0;
      if (params.metode === "INTERNAL_PT" || params.metode === "INTERNAL") {
        finalRekeningTujuan = "INTERNAL_PT";
        statusPembayaran = "LUNAS";
        sisaPiutang = 0;
      } else if (params.metode === "TUNAI") {
        finalRekeningTujuan = "KAS01";
        const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
        if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
        kasAcc.saldoSaatIni += totalNominal;
        statusPembayaran = "LUNAS";
        sisaPiutang = 0;
      } else if (params.metode === "TRANSFER") {
        if (!params.rekeningTujuan) {
          throw new Error("Rekening bank tujuan transfer wajib dipilih");
        }
        if (params.rekeningTujuan === "KAS01" || params.rekeningTujuan === "BON01" || params.rekeningTujuan === "TIT01" || params.rekeningTujuan === "SINKRON") {
          throw new Error("Pilih rekening bank tujuan transfer yang valid (bukan Kas Tunai / Virtual)");
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningTujuan} tidak ditemukan`);
        if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil tempat uang masuk (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (bankAcc.status !== "AKTIF") throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        bankAcc.saldoSaatIni += totalNominal;
        finalRekeningTujuan = bankAcc.kode;
        statusPembayaran = "LUNAS";
        sisaPiutang = 0;
      } else if (params.metode === "KASBON") {
        finalRekeningTujuan = "BON01";
        statusPembayaran = "BELUM_BAYAR";
        sisaPiutang = totalNominal;
      }
      const isInternalSale = params.metode === "INTERNAL_PT" || params.metode === "INTERNAL";
      const finalDivisi = params.divisi?.trim() || (isInternalSale ? "PT Wijaya Agro Perkasa" : "CV Wijaya Agro");
      const totalLabaKotor = totalNominal - totalModalHpp;
      const noPenjualan = generateId("PJ");
      const penjualanRecord = {
        noPenjualan,
        tanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        tipePembeli,
        divisi: finalDivisi,
        metode: isInternalSale ? "INTERNAL_PT" : params.metode,
        rekeningTujuan: finalRekeningTujuan,
        items: processedItems,
        totalModalHpp,
        totalNominal,
        totalLabaKotor,
        statusPembayaran,
        sisaPiutang,
        keterangan: params.keterangan || (isInternalSale ? `Pemakaian Kebutuhan Internal PT Wijaya Agro (Harga Rp 0)` : params.metode === "KASBON" ? `Penjualan Kasbon (${tipePembeli})` : `Penjualan Barang Toko (${tipePembeli})`),
        createdAt: iso
      };
      db.penjualan.unshift(penjualanRecord);
      const logMethodText = penjualanRecord.metode === "INTERNAL_PT" ? "PEMAKAIAN INTERNAL PT (Rp 0)" : penjualanRecord.metode;
      this.addAuditLog(
        db,
        "CREATE",
        noPenjualan,
        `Penjualan ${logMethodText} [${tipePembeli} | Divisi: ${finalDivisi} | Rek: ${finalRekeningTujuan}] kepada ${finalMitraNama} (${processedItems.length} item) - Omzet: Rp ${totalNominal.toLocaleString("id-ID")}, Modal HPP: Rp ${totalModalHpp.toLocaleString("id-ID")}`,
        totalNominal,
        finalRekeningTujuan
      );
      return penjualanRecord;
    });
  }
  // ==========================================
  // 1B. PEMBELIAN BARANG DAGANG (DISTRIBUTOR / PEMASOK)
  // ==========================================
  static async processPembelianBarang(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      let supplier = params.idMitra ? db.mitra.find((m) => m.id === params.idMitra) : void 0;
      const isManual = Boolean(params.namaDistributorManual && params.namaDistributorManual.trim());
      if (isManual) {
        const manualName = params.namaDistributorManual.trim();
        supplier = db.mitra.find((m) => m.nama.toLowerCase() === manualName.toLowerCase());
        if (!supplier) {
          const newMitraId = generateId("MTR");
          const kodeRandom = `DIST${Math.floor(100 + Math.random() * 900)}`;
          supplier = {
            id: newMitraId,
            kode: kodeRandom,
            nama: manualName,
            role: "SUPPLIER",
            telepon: "-",
            alamat: "Distributor / Pemasok Bebas (Non-Tetap)",
            status: "AKTIF",
            catatan: "Pemasok / distributor lepas yang diinput langsung saat penerimaan barang"
          };
          db.mitra.push(supplier);
        }
      }
      if (!supplier) {
        throw new Error("Pilih distributor terdaftar atau ketik nama distributor / pemasok manual");
      }
      if (supplier.status !== "AKTIF") {
        throw new Error(`Distributor / pemasok ${supplier.nama} berstatus NONAKTIF`);
      }
      const hasValidItems = Array.isArray(params.items) && params.items.length > 0;
      const isRekapan = Boolean(
        !hasValidItems && (params.isRekapanGlobal || params.totalNominalRekapan && params.totalNominalRekapan > 0)
      );
      let totalNominal = 0;
      const processedItems = [];
      if (isRekapan) {
        const nominalRekap = Number(params.totalNominalRekapan) || 0;
        if (nominalRekap <= 0) {
          throw new Error("Nominal total rekapan nota pembelian harus lebih dari Rp 0");
        }
        totalNominal = nominalRekap;
        processedItems.push({
          kodeProduk: "REKAP-NOTA",
          namaProduk: params.judulRekapan || `Rekapan Nota Pembelian Supplier (${supplier.nama})`,
          satuan: "Faktur/Nota",
          qty: 1,
          hargaBeliSatuan: nominalRekap,
          subtotal: nominalRekap,
          stokSebelum: 0,
          stokSetelah: 0
        });
      } else {
        if (!params.items || params.items.length === 0) {
          throw new Error("Daftar barang pembelian distributor tidak boleh kosong");
        }
        for (const item of params.items) {
          const cleanKode = String(item.kodeProduk || "").trim().toUpperCase();
          const qtyBeli = Number(item.qty) || 0;
          const modalSatuan = Number(item.hargaBeliSatuan);
          if (!cleanKode) {
            throw new Error("Kode produk pembelian tidak boleh kosong");
          }
          if (qtyBeli <= 0) {
            throw new Error(`Kuantitas untuk produk ${cleanKode} harus lebih dari 0`);
          }
          if (Number.isNaN(modalSatuan) || modalSatuan <= 0) {
            throw new Error(`Harga beli satuan (modal) untuk produk ${cleanKode} harus lebih dari Rp 0`);
          }
          let product = db.produk.find((p) => String(p.kode || "").trim().toUpperCase() === cleanKode);
          if (!product) {
            const itemAny = item;
            const normKat = String(itemAny.kategori || "LAINNYA").trim().replace(/\s+/g, " ").toUpperCase();
            if (!Array.isArray(db.kategoriProduk)) db.kategoriProduk = [];
            if (!db.kategoriProduk.some((k) => k.nama.toUpperCase() === normKat)) {
              db.kategoriProduk.push({ nama: normKat, deskripsi: "", createdAt: iso });
            }
            const jualAwal = item.sesuaikanHargaJual && item.sesuaikanHargaJual > 0 ? Math.round(item.sesuaikanHargaJual) : Math.round(modalSatuan);
            const rekananAwal = item.sesuaikanHargaRekanan && item.sesuaikanHargaRekanan > 0 ? Math.round(item.sesuaikanHargaRekanan) : jualAwal;
            const newProd = {
              kode: cleanKode,
              kategori: normKat,
              nama: String(itemAny.namaProduk || itemAny.nama || cleanKode).trim(),
              satuan: String(itemAny.satuan || "SAK").trim(),
              hargaBeli: Math.round(modalSatuan),
              hargaJual: jualAwal,
              hargaKhususRekanan: rekananAwal,
              status: "AKTIF"
            };
            db.produk.push(newProd);
            product = newProd;
          }
          let stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
          if (!stokItem) {
            stokItem = {
              kode: product.kode,
              namaProduk: product.nama,
              satuan: product.satuan,
              stok: 0,
              minimum: 10,
              updateTerakhir: iso
            };
            db.stokBarang.push(stokItem);
          }
          const stokSebelum = Math.max(0, Number(stokItem.stok) || 0);
          const hppSebelum = Math.max(0, Number(product.hargaBeli) || 0);
          const subtotal = Math.round(qtyBeli * modalSatuan);
          totalNominal += subtotal;
          const hppBaru = stokSebelum > 0 && hppSebelum > 0 ? Math.round((stokSebelum * hppSebelum + qtyBeli * modalSatuan) / (stokSebelum + qtyBeli)) : Math.round(modalSatuan);
          stokItem.stok = stokSebelum + qtyBeli;
          const stokSetelah = stokItem.stok;
          stokItem.updateTerakhir = iso;
          product.hargaBeli = hppBaru;
          if (item.sesuaikanHargaJual !== void 0 && item.sesuaikanHargaJual > 0) {
            product.hargaJual = Math.round(item.sesuaikanHargaJual);
          } else if (!product.hargaJual || product.hargaJual <= 0) {
            product.hargaJual = hppBaru;
          }
          if (item.sesuaikanHargaRekanan !== void 0 && item.sesuaikanHargaRekanan > 0) {
            product.hargaKhususRekanan = Math.round(item.sesuaikanHargaRekanan);
          } else if (!product.hargaKhususRekanan || product.hargaKhususRekanan <= 0) {
            product.hargaKhususRekanan = product.hargaJual || hppBaru;
          }
          processedItems.push({
            kodeProduk: product.kode,
            namaProduk: product.nama,
            satuan: product.satuan,
            qty: qtyBeli,
            hargaBeliSatuan: Math.round(modalSatuan),
            subtotal,
            stokSebelum,
            stokSetelah
          });
        }
      }
      let finalRekeningSumber = "";
      let statusPembayaran = "LUNAS";
      if (params.metodePembayaran === "TUNAI") {
        finalRekeningSumber = "KAS01";
        const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
        if (!kasAcc) throw new Error("Rekening Kas Tunai (KAS01) tidak ditemukan");
        if (kasAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo Kas Tunai tidak mencukupi untuk kulakan. Saldo: Rp ${kasAcc.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${totalNominal.toLocaleString("id-ID")}`
          );
        }
        kasAcc.saldoSaatIni -= totalNominal;
        statusPembayaran = "LUNAS";
      } else if (params.metodePembayaran === "TRANSFER") {
        if (!params.rekeningSumber) {
          throw new Error("Rekening bank sumber dana transfer wajib dipilih");
        }
        if (params.rekeningSumber === "KAS01" || params.rekeningSumber === "BON01" || params.rekeningSumber === "TIT01" || params.rekeningSumber === "SINKRON") {
          throw new Error("Untuk metode Transfer Bank, wajib memilih rekening bank sumber dana (bukan Kas Tunai / Virtual)");
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo rekening ${bankAcc.nama} tidak mencukupi. Saldo: Rp ${bankAcc.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${totalNominal.toLocaleString("id-ID")}`
          );
        }
        bankAcc.saldoSaatIni -= totalNominal;
        finalRekeningSumber = bankAcc.kode;
        statusPembayaran = "LUNAS";
      } else if (params.metodePembayaran === "HUTANG") {
        finalRekeningSumber = "TIT01";
        statusPembayaran = "HUTANG_BELUM_LUNAS";
      }
      const finalDivisi = params.divisi?.trim() || "CV Wijaya Agro";
      const noPembelian = generateId("PB");
      const record = {
        noPembelian,
        tanggal,
        jam,
        idMitra: supplier.id,
        namaMitra: supplier.nama,
        isDistributorManual: isManual,
        namaDistributorManual: isManual ? supplier.nama : void 0,
        noFakturSupplier: params.noFakturSupplier || "-",
        fotoNota: params.fotoNota || "",
        divisi: finalDivisi,
        metodePembayaran: params.metodePembayaran,
        rekeningSumber: finalRekeningSumber,
        items: processedItems,
        totalNominal,
        status: statusPembayaran,
        keterangan: params.keterangan || (isRekapan ? `Rekapan Nota Pembelian Supplier ${supplier.nama}` : `Pembelian barang stok dari distributor ${supplier.nama}`),
        createdAt: iso
      };
      if (!Array.isArray(db.pembelianBarang)) {
        db.pembelianBarang = [];
      }
      db.pembelianBarang.unshift(record);
      this.addAuditLog(
        db,
        "CREATE",
        noPembelian,
        `Pembelian dari Distributor/Pemasok "${supplier.nama}" [Divisi: ${finalDivisi} | Rek: ${finalRekeningSumber}] (${isRekapan ? "Rekapan Nota Global" : `${processedItems.length} produk`}) - Total: Rp ${totalNominal.toLocaleString("id-ID")} via ${params.metodePembayaran}${record.fotoNota ? " (Foto Nota Tersimpan)" : ""}`,
        totalNominal,
        finalRekeningSumber
      );
      return record;
    });
  }
  // Batalkan / Hapus Transaksi Pembelian Barang yang salah input (Kembalikan Saldo Rekening & Koreksi Stok/HPP)
  static async deletePembelianBarang(noPembelian) {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      if (!Array.isArray(db.pembelianBarang)) {
        throw new Error("Data pembelian barang kosong");
      }
      const idx = db.pembelianBarang.findIndex((p) => p.noPembelian === noPembelian);
      if (idx === -1) {
        throw new Error(`Transaksi pembelian ${noPembelian} tidak ditemukan`);
      }
      const target = db.pembelianBarang[idx];
      for (const it of target.items || []) {
        const cleanKode = String(it.kodeProduk || "").trim().toUpperCase();
        if (cleanKode && cleanKode !== "REKAP-NOTA") {
          const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
          if (stokItem && stokItem.stok < it.qty) {
            throw new Error(
              `Tidak dapat membatalkan ${noPembelian}: Stok "${it.namaProduk}" tersisa ${stokItem.stok} ${it.satuan}, sedangkan pembatalan membutuhkan pengurangan ${it.qty} ${it.satuan} (sebagian barang sudah terjual).`
            );
          }
        }
      }
      db.pembelianBarang.splice(idx, 1);
      for (const it of target.items || []) {
        const cleanKode = String(it.kodeProduk || "").trim().toUpperCase();
        if (cleanKode && cleanKode !== "REKAP-NOTA") {
          const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
          if (stokItem) {
            stokItem.stok = Math.max(0, stokItem.stok - it.qty);
            stokItem.updateTerakhir = iso;
          }
          const prod = db.produk.find((p) => String(p.kode || "").trim().toUpperCase() === cleanKode);
          if (prod) {
            let sumQty = 0;
            let sumModal = 0;
            for (const otherPb of db.pembelianBarang) {
              for (const otherIt of otherPb.items || []) {
                if (String(otherIt.kodeProduk || "").trim().toUpperCase() === cleanKode) {
                  sumQty += Number(otherIt.qty) || 0;
                  sumModal += (Number(otherIt.qty) || 0) * (Number(otherIt.hargaBeliSatuan) || 0);
                }
              }
            }
            if (sumQty > 0) {
              prod.hargaBeli = Math.round(sumModal / sumQty);
            } else if ((stokItem?.stok || 0) === 0) {
              prod.hargaBeli = 0;
              prod.hargaJual = 0;
              prod.hargaKhususRekanan = 0;
            }
          }
        }
      }
      if (target.metodePembayaran === "TUNAI") {
        const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
        if (kasAcc) {
          kasAcc.saldoSaatIni += target.totalNominal;
        }
      } else if (target.metodePembayaran === "TRANSFER" && target.rekeningSumber && target.rekeningSumber !== "TIT01" && target.rekeningSumber !== "BON01") {
        const srcAcc = db.rekening.find((r) => r.kode === target.rekeningSumber);
        if (srcAcc) {
          srcAcc.saldoSaatIni += target.totalNominal;
        }
      }
      this.addAuditLog(
        db,
        "VOID",
        noPembelian,
        `Pembatalan Pembelian Barang ${noPembelian} (${target.namaMitra}) senilai Rp ${target.totalNominal.toLocaleString("id-ID")} - Saldo rekening & stok gudang dikembalikan akurat`,
        target.totalNominal,
        target.rekeningSumber
      );
      return { deleted: target };
    });
  }
  // ==========================================
  // 1C. LAPORAN LABA RUGI PRODUK PENJUALAN
  // ==========================================
  static getLabaRugiSummary() {
    const db = dbManager.get();
    const productStatsMap = /* @__PURE__ */ new Map();
    let totalPenjualanTransaksi = 0;
    let totalOmzet = 0;
    let totalHppModal = 0;
    for (const pj of db.penjualan) {
      totalPenjualanTransaksi++;
      for (const item of pj.items) {
        const prod = db.produk.find((p) => p.kode === item.kodeProduk);
        const hppPerUnit = item.hargaBeli !== void 0 ? item.hargaBeli : prod?.hargaBeli || 0;
        const subtotal = item.subtotal || item.harga * item.qty;
        const modalHpp = hppPerUnit * item.qty;
        const labaKotor = subtotal - modalHpp;
        totalOmzet += subtotal;
        totalHppModal += modalHpp;
        const curr = productStatsMap.get(item.kodeProduk) || {
          totalQty: 0,
          totalOmzet: 0,
          totalHppModal: 0,
          totalLabaKotor: 0
        };
        curr.totalQty += item.qty;
        curr.totalOmzet += subtotal;
        curr.totalHppModal += modalHpp;
        curr.totalLabaKotor += labaKotor;
        productStatsMap.set(item.kodeProduk, curr);
      }
    }
    const totalLabaKotor = totalOmzet - totalHppModal;
    const persentaseMarginRataRata = totalOmzet > 0 ? totalLabaKotor / totalOmzet * 100 : 0;
    const items = db.produk.map((prod) => {
      const stats = productStatsMap.get(prod.kode) || {
        totalQty: 0,
        totalOmzet: 0,
        totalHppModal: 0,
        totalLabaKotor: 0
      };
      const stokItem = db.stokBarang.find((s) => s.kode === prod.kode);
      const margin = stats.totalOmzet > 0 ? stats.totalLabaKotor / stats.totalOmzet * 100 : 0;
      return {
        kodeProduk: prod.kode,
        namaProduk: prod.nama,
        satuan: prod.satuan,
        kategori: prod.kategori,
        totalQtyTerjual: stats.totalQty,
        totalOmzet: stats.totalOmzet,
        totalHppModal: stats.totalHppModal,
        totalLabaKotor: stats.totalLabaKotor,
        persentaseMargin: Math.round(margin * 10) / 10,
        stokSaatIni: stokItem?.stok || 0,
        hargaBeliSaatIni: prod.hargaBeli || 0,
        hargaJualSugesti: prod.hargaJual || 0,
        hargaKhususRekanan: prod.hargaKhususRekanan
      };
    });
    items.sort((a, b) => b.totalLabaKotor - a.totalLabaKotor);
    const bestSelling = [...items].filter((it) => it.totalQtyTerjual > 0).sort((a, b) => {
      if (b.totalQtyTerjual !== a.totalQtyTerjual) return b.totalQtyTerjual - a.totalQtyTerjual;
      return b.totalOmzet - a.totalOmzet;
    })[0];
    const produkTerlaris = bestSelling ? bestSelling.namaProduk : "-";
    const totalPembelianBarangMasuk = (db.pembelianBarang || []).reduce(
      (sum, p) => sum + (p.totalNominal || 0),
      0
    );
    return {
      periode: "Akumulasi Berjalan (Realtime)",
      totalPenjualanTransaksi,
      totalOmzet,
      totalHppModal,
      totalLabaKotor,
      persentaseMarginRataRata: Math.round(persentaseMarginRataRata * 10) / 10,
      produkTerlaris,
      totalPembelianBarangMasuk,
      items
    };
  }
  // ==========================================
  // 2. PEMBELIAN HASIL BUMI
  // ==========================================
  static async processPembelianHasilBumi(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      if (!Array.isArray(db.mitra)) db.mitra = [];
      if (!Array.isArray(db.pembelianHasilBumi)) db.pembelianHasilBumi = [];
      let finalMitraId = "UMUM";
      let finalMitraNama = params.namaPetaniManual?.trim() || "Petani Umum";
      if (params.idMitra && params.idMitra !== "UMUM") {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) {
          throw new Error("Petani / supplier terdaftar tidak ditemukan");
        }
        if (mitra.status !== "AKTIF") {
          throw new Error(`Petani / supplier ${mitra.nama} berstatus NONAKTIF`);
        }
        finalMitraId = mitra.id;
        finalMitraNama = mitra.nama;
      } else if (params.namaPetaniManual && params.namaPetaniManual.trim()) {
        finalMitraId = "UMUM";
        finalMitraNama = params.namaPetaniManual.trim();
      } else if (params.idMitra === "UMUM") {
        finalMitraId = "UMUM";
        finalMitraNama = "Petani Umum";
      } else {
        throw new Error("Pilih petani terdaftar atau ketik nama petani umum");
      }
      let komoditas = params.komoditasKode ? db.stokHasilBumi.find((k) => k.kode === params.komoditasKode) : void 0;
      const isKomoditasBaru = Boolean(params.namaKomoditasBaru && params.namaKomoditasBaru.trim());
      if (isKomoditasBaru) {
        const cleanKomNama = params.namaKomoditasBaru.trim();
        komoditas = db.stokHasilBumi.find((k) => k.nama.toLowerCase() === cleanKomNama.toLowerCase());
        if (!komoditas) {
          const cleanKode = params.komoditasKode?.trim().toUpperCase() || `HB-${Math.floor(100 + Math.random() * 900)}`;
          komoditas = {
            kode: cleanKode,
            nama: cleanKomNama,
            satuan: "Kg",
            stok: 0,
            hargaBeliStandar: params.hargaPerKg,
            updateTerakhir: iso
          };
          db.stokHasilBumi.push(komoditas);
        }
      }
      if (!komoditas) {
        throw new Error("Pilih komoditas hasil bumi terdaftar atau masukkan nama komoditas baru");
      }
      if (params.beratKotor <= 0) throw new Error("Berat kotor timbangan harus lebih dari 0 kg");
      if (params.potonganRafaksi < 0 || params.potonganRafaksi >= 100) {
        throw new Error("Potongan rafaksi harus antara 0% dan 99.9%");
      }
      const isBelumPutus = Boolean(
        params.isBelumPutusHarga || params.komoditasKode === "HB-08" || komoditas.isBelumPutusHarga || komoditas.nama.toLowerCase().includes("titip")
      );
      if (!isBelumPutus && params.hargaPerKg <= 0) {
        throw new Error("Harga beli per kg harus lebih dari Rp 0 (atau aktifkan opsi Belum Putus Harga)");
      }
      const beratBersih = Math.round(params.beratKotor * (1 - params.potonganRafaksi / 100) * 100) / 100;
      const totalNominal = Math.round(beratBersih * (params.hargaPerKg || 0));
      let finalRekeningSumber = "";
      let status = "LUNAS";
      if (isBelumPutus) {
        finalRekeningSumber = "TIT01";
        status = "BELUM_PUTUS_HARGA";
      } else if (params.metodePembayaran === "TUNAI") {
        finalRekeningSumber = "KAS01";
        const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
        if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
        if (kasAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo kas tidak mencukupi untuk pembayaran tunai. Saldo KAS01: Rp ${kasAcc.saldoSaatIni.toLocaleString(
              "id-ID"
            )}, Total tagihan: Rp ${totalNominal.toLocaleString("id-ID")}`
          );
        }
        kasAcc.saldoSaatIni -= totalNominal;
        status = "LUNAS";
      } else if (params.metodePembayaran === "TRANSFER") {
        if (!params.rekeningSumber) {
          throw new Error("Rekening bank sumber transfer wajib dipilih");
        }
        if (params.rekeningSumber === "BON01" || params.rekeningSumber === "TIT01" || params.rekeningSumber === "KAS01" || params.rekeningSumber === "SINKRON") {
          throw new Error("Pilih rekening bank sumber transfer yang valid (bukan Kas Tunai / Virtual)");
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (bankAcc.status !== "AKTIF") throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo rekening ${bankAcc.nama} tidak mencukupi. Saldo: Rp ${bankAcc.saldoSaatIni.toLocaleString(
              "id-ID"
            )}, Tagihan: Rp ${totalNominal.toLocaleString("id-ID")}`
          );
        }
        bankAcc.saldoSaatIni -= totalNominal;
        finalRekeningSumber = bankAcc.kode;
        status = "LUNAS";
      } else if (params.metodePembayaran === "TITIP") {
        finalRekeningSumber = "TIT01";
        status = "TITIP";
      }
      komoditas.stok += beratBersih;
      komoditas.updateTerakhir = iso;
      const finalDivisi = params.divisi?.trim() || "Gudang Wijaya Agro";
      const noPembelian = generateId("PHB");
      const pembelianRecord = {
        noPembelian,
        tanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        komoditasKode: komoditas.kode,
        komoditasNama: komoditas.nama,
        beratKotor: params.beratKotor,
        potonganRafaksi: params.potonganRafaksi,
        beratBersih,
        hargaPerKg: params.hargaPerKg || 0,
        totalNominal,
        divisi: finalDivisi,
        metodePembayaran: isBelumPutus ? "TITIP" : params.metodePembayaran,
        rekeningSumber: finalRekeningSumber,
        status,
        isBelumPutusHarga: isBelumPutus,
        statusHarga: isBelumPutus ? "BELUM_PUTUS_HARGA" : "HARGA_PUTUS",
        fotoNota: params.fotoNota || "",
        isNotaLalu: params.isNotaLalu || false,
        noNotaLalu: params.noNotaLalu || "",
        tanggalNotaLalu: params.tanggalNotaLalu || "",
        keterangan: params.keterangan || (isBelumPutus ? `Pembelian ${komoditas.nama} dari ${finalMitraNama} - Titip Timbang (Belum Putus Harga)` : `Pembelian ${komoditas.nama} dari ${finalMitraNama}`),
        createdAt: iso
      };
      db.pembelianHasilBumi.unshift(pembelianRecord);
      this.addAuditLog(
        db,
        "CREATE",
        noPembelian,
        `Pembelian Hasil Bumi ${komoditas.nama} (${beratBersih} kg) dari ${finalMitraNama} [Divisi: ${finalDivisi} | Rek: ${finalRekeningSumber}] - Metode: ${pembelianRecord.metodePembayaran}`,
        totalNominal,
        finalRekeningSumber
      );
      return pembelianRecord;
    });
  }
  // ==========================================
  // 2B. PUTUS HARGA HASIL BUMI (TITIP PANEN -> HARGA DEAL)
  // Menetapkan harga definitif untuk hasil panen yang sebelumnya Belum Putus Harga
  // ==========================================
  static async putusHargaHasilBumi(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam } = getWIBDateTime();
      const record = db.pembelianHasilBumi.find((p) => p.noPembelian === params.noPembelian);
      if (!record) throw new Error(`Transaksi pembelian ${params.noPembelian} tidak ditemukan`);
      if (params.hargaDealPerKg <= 0) throw new Error("Harga deal per kg harus lebih dari Rp 0");
      const totalNominalBaru = Math.round(record.beratBersih * params.hargaDealPerKg);
      record.hargaPerKg = params.hargaDealPerKg;
      record.totalNominal = totalNominalBaru;
      record.statusHarga = "HARGA_PUTUS";
      record.isBelumPutusHarga = false;
      record.tanggalPutusHarga = `${tanggal} ${jam}`;
      record.divisi = params.divisi?.trim() || record.divisi || "Gudang Wijaya Agro";
      record.keterangan = params.keterangan ? params.keterangan : `${record.keterangan} - (Harga diputus pada ${tanggal} @ Rp ${params.hargaDealPerKg.toLocaleString("id-ID")}/Kg)`;
      if (params.metodePembayaran === "TUNAI") {
        const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
        if (!kasAcc) throw new Error("Rekening Kas Tunai KAS01 tidak ditemukan");
        if (kasAcc.saldoSaatIni < totalNominalBaru) {
          throw new Error(`Saldo KAS01 tidak cukup untuk bayar tunai Rp ${totalNominalBaru.toLocaleString("id-ID")}`);
        }
        kasAcc.saldoSaatIni -= totalNominalBaru;
        record.metodePembayaran = "TUNAI";
        record.rekeningSumber = "KAS01";
        record.status = "LUNAS";
      } else if (params.metodePembayaran === "TRANSFER") {
        if (!params.rekeningSumber) throw new Error("Pilih rekening bank sumber transfer");
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc || bankAcc.status !== "AKTIF") throw new Error("Rekening bank tidak aktif");
        if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil sumber dana.`
          );
        }
        if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominalBaru) {
          throw new Error(`Saldo bank ${bankAcc.nama} tidak mencukupi`);
        }
        bankAcc.saldoSaatIni -= totalNominalBaru;
        record.metodePembayaran = "TRANSFER";
        record.rekeningSumber = bankAcc.kode;
        record.status = "LUNAS";
      } else {
        record.metodePembayaran = "TITIP";
        record.rekeningSumber = "TIT01";
        record.status = "TITIP";
      }
      this.addAuditLog(
        db,
        "UPDATE",
        record.noPembelian,
        `Putus Harga Hasil Bumi ${record.komoditasNama} (${record.beratBersih} kg) @ Rp ${params.hargaDealPerKg.toLocaleString("id-ID")} [Divisi: ${record.divisi} | Rek: ${record.rekeningSumber}] - Total: Rp ${totalNominalBaru.toLocaleString("id-ID")} via ${record.metodePembayaran}`,
        totalNominalBaru,
        record.rekeningSumber
      );
      return record;
    });
  }
  /**
   * Helper: Filter hanya transaksi pembelian hasil bumi fisik (bukan Pinjaman Dana / Titip Dana Nota Lalu 0 Kg)
   */
  static isPhysicalPembelianHasilBumi(p) {
    if (!p) return false;
    if (p.komoditasKode === "PINJAMAN_DANA" || p.komoditasKode === "TITIP_DANA") return false;
    if (p.komoditasNama && p.komoditasNama.toLowerCase().includes("pinjaman uang")) return false;
    return (Number(p.beratBersih) || 0) > 0;
  }
  /**
   * Helper: Parse bulan (1..12) dan tahun dari string tanggal DD/MM/YYYY atau YYYY-MM-DD
   */
  static parseMonthYear(dateStr) {
    if (!dateStr) return null;
    const clean = dateStr.trim().split(" ")[0];
    const parts = clean.split(/[-/]/);
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) {
      const tahun = parseInt(parts[0], 10);
      const bulan = parseInt(parts[1], 10);
      if (!isNaN(bulan) && !isNaN(tahun) && bulan >= 1 && bulan <= 12) {
        return { bulan, tahun };
      }
    } else {
      const bulan = parseInt(parts[1], 10);
      const tahun = parseInt(parts[2], 10);
      if (!isNaN(bulan) && !isNaN(tahun) && bulan >= 1 && bulan <= 12) {
        return { bulan, tahun };
      }
    }
    return null;
  }
  // ==========================================
  // 2C. PENJUALAN / PENGIRIMAN HASIL BUMI KELUAR GUDANG
  // Mengurangi stok fisik gudang (Ready Gudang), menghitung HPP murni dari rata-rata modal beli,
  // serta mencatat uang masuk Kas/Bank atau Piutang Pabrik/Bandar
  // ==========================================
  static async processPenjualanHasilBumi(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal: todayWib, jam, iso } = getWIBDateTime();
      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      if (!Array.isArray(db.pembelianHasilBumi)) db.pembelianHasilBumi = [];
      if (!Array.isArray(db.penjualanHasilBumi)) db.penjualanHasilBumi = [];
      const komoditas = db.stokHasilBumi.find((k) => k.kode === params.komoditasKode);
      if (!komoditas) {
        throw new Error(`Komoditas dengan kode ${params.komoditasKode} tidak ditemukan di gudang`);
      }
      const beratKotor = Number(params.beratKotor) || 0;
      const potonganRafaksi = Number(params.potonganRafaksi) || 0;
      const hargaJualPerKg = Number(params.hargaJualPerKg) || 0;
      if (beratKotor <= 0) {
        throw new Error("Berat timbangan jual harus lebih dari 0 Kg");
      }
      if (potonganRafaksi < 0 || potonganRafaksi >= 100) {
        throw new Error("Potongan rafaksi harus antara 0% dan 99.9%");
      }
      if (hargaJualPerKg <= 0) {
        throw new Error("Harga jual per Kg harus lebih dari Rp 0");
      }
      const beratBersih = Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;
      if (beratBersih <= 0) {
        throw new Error("Berat bersih hasil timbangan harus lebih dari 0 Kg");
      }
      const stokTersedia = Math.max(0, Number(komoditas.stok) || 0);
      if (stokTersedia < beratBersih) {
        throw new Error(
          `Stok Ready Gudang tidak mencukupi untuk "${komoditas.nama}". Ready di gudang: ${stokTersedia.toLocaleString(
            "id-ID"
          )} ${komoditas.satuan}, akan dijual: ${beratBersih.toLocaleString("id-ID")} ${komoditas.satuan}`
        );
      }
      let finalMitraId = "UMUM";
      let finalMitraNama = params.namaPembeliManual?.trim() || "Pembeli / Pabrik Umum";
      if (params.idMitra && params.idMitra !== "UMUM") {
        const mitra = db.mitra.find((m) => m.id === params.idMitra);
        if (!mitra) {
          throw new Error("Mitra pembeli terdaftar tidak ditemukan");
        }
        if (mitra.status !== "AKTIF") {
          throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
        }
        finalMitraId = mitra.id;
        finalMitraNama = mitra.nama;
      } else if (params.namaPembeliManual && params.namaPembeliManual.trim()) {
        finalMitraId = "UMUM";
        finalMitraNama = params.namaPembeliManual.trim();
      }
      if (params.metodePembayaran === "PIUTANG" && finalMitraId === "UMUM") {
        throw new Error("Metode PIUTANG (Tempo) hanya berlaku untuk Mitra / Pabrik yang terdaftar di Master Mitra");
      }
      const stokAwalKg = Number(komoditas.stokAwal) || 0;
      const modalAwalUang = Number(komoditas.modalAwalTotal) || stokAwalKg * (Number(komoditas.rataRataModalAwal) || 0);
      const physicalPurchases = db.pembelianHasilBumi.filter(
        (p) => this.isPhysicalPembelianHasilBumi(p) && (p.komoditasKode === komoditas.kode || p.komoditasNama.toUpperCase().trim() === komoditas.nama.toUpperCase().trim())
      );
      const totalUangBeli = modalAwalUang + physicalPurchases.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0);
      const totalKgBeli = stokAwalKg + physicalPurchases.reduce((sum, p) => sum + (Number(p.beratBersih) || 0), 0);
      const modalRataRataPerKg = totalKgBeli > 0 && totalUangBeli > 0 ? Math.round(totalUangBeli / totalKgBeli) : Math.max(0, Number(komoditas.rataRataModalAwal) || 0);
      const totalModalHpp = Math.round(beratBersih * modalRataRataPerKg);
      const totalNominal = Math.round(beratBersih * hargaJualPerKg);
      const labaKotor = totalNominal - totalModalHpp;
      let finalRekeningTujuan = "";
      let statusPembayaran = "LUNAS";
      let sisaPiutang = 0;
      if (params.metodePembayaran === "TUNAI") {
        finalRekeningTujuan = "KAS01";
        const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
        if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
        kasAcc.saldoSaatIni += totalNominal;
      } else if (params.metodePembayaran === "TRANSFER") {
        if (!params.rekeningTujuan) {
          throw new Error("Pilih rekening bank tujuan transfer pembayaran hasil bumi");
        }
        if (params.rekeningTujuan === "KAS01" || params.rekeningTujuan === "BON01" || params.rekeningTujuan === "TIT01" || params.rekeningTujuan === "SINKRON") {
          throw new Error("Pilih rekening bank tujuan transfer yang valid (bukan Kas Tunai / Virtual)");
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningTujuan} tidak ditemukan`);
        if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
          throw new Error(
            `Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik. Pilih rekening riil tempat uang masuk (misal BNI, BCA, BRI, Mandiri).`
          );
        }
        if (bankAcc.status !== "AKTIF") throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        bankAcc.saldoSaatIni += totalNominal;
        finalRekeningTujuan = bankAcc.kode;
      } else if (params.metodePembayaran === "PIUTANG") {
        finalRekeningTujuan = "BON01";
        statusPembayaran = "BELUM_BAYAR";
        sisaPiutang = totalNominal;
      }
      const stokGudangSebelum = stokTersedia;
      const stokGudangSetelah = Math.max(0, Math.round((stokTersedia - beratBersih) * 100) / 100);
      komoditas.stok = stokGudangSetelah;
      komoditas.updateTerakhir = iso;
      let finalTanggal = todayWib;
      if (params.tanggal && params.tanggal.trim()) {
        const rawTgl = params.tanggal.trim();
        const parts = rawTgl.split(/[-/]/);
        if (parts.length === 3) {
          finalTanggal = parts[0].length === 4 ? `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}` : `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`;
        }
      }
      const finalDivisi = params.divisi?.trim() || "PT Wijaya Agro Perkasa";
      const noPenjualan = generateId("JHB");
      const record = {
        noPenjualan,
        tanggal: finalTanggal,
        jam,
        idMitra: finalMitraId,
        namaMitra: finalMitraNama,
        komoditasKode: komoditas.kode,
        komoditasNama: komoditas.nama,
        beratKotor,
        potonganRafaksi,
        beratBersih,
        modalRataRataPerKg,
        totalModalHpp,
        hargaJualPerKg,
        totalNominal,
        labaKotor,
        divisi: finalDivisi,
        metodePembayaran: params.metodePembayaran,
        rekeningTujuan: finalRekeningTujuan,
        statusPembayaran,
        sisaPiutang,
        noSuratJalan: params.noSuratJalan?.trim() || "",
        stokGudangSebelum,
        stokGudangSetelah,
        keterangan: params.keterangan?.trim() || `Penjualan Hasil Bumi ${komoditas.nama} (${beratBersih.toLocaleString("id-ID")} Kg) kepada ${finalMitraNama}`,
        createdAt: iso
      };
      db.penjualanHasilBumi.unshift(record);
      dbManager.synchronizeVirtualAccounts();
      this.addAuditLog(
        db,
        "CREATE",
        noPenjualan,
        `Penjualan Hasil Bumi ${komoditas.nama} [Divisi: ${finalDivisi} | Rek: ${finalRekeningTujuan}]: ${beratBersih.toLocaleString("id-ID")} Kg @ Rp ${hargaJualPerKg.toLocaleString(
          "id-ID"
        )}/Kg kepada ${finalMitraNama} (${params.metodePembayaran}). Sisa Ready Gudang: ${stokGudangSetelah.toLocaleString(
          "id-ID"
        )} Kg`,
        totalNominal,
        finalRekeningTujuan
      );
      return record;
    });
  }
  static async deletePenjualanHasilBumi(noPenjualan) {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      if (!Array.isArray(db.penjualanHasilBumi)) db.penjualanHasilBumi = [];
      const idx = db.penjualanHasilBumi.findIndex((j) => j.noPenjualan === noPenjualan);
      if (idx === -1) {
        throw new Error(`Transaksi penjualan hasil bumi ${noPenjualan} tidak ditemukan`);
      }
      const record = db.penjualanHasilBumi[idx];
      if (record.metodePembayaran === "PIUTANG" && record.sisaPiutang < record.totalNominal) {
        throw new Error(
          `Transaksi piutang ${noPenjualan} sudah menerima pembayaran sebagian/lunas dan tidak dapat dibatalkan langsung.`
        );
      }
      const komoditas = (db.stokHasilBumi || []).find(
        (k) => k.kode === record.komoditasKode || k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
      );
      if (komoditas) {
        komoditas.stok = Math.round(((Number(komoditas.stok) || 0) + record.beratBersih) * 100) / 100;
        komoditas.updateTerakhir = iso;
      }
      if (record.metodePembayaran !== "PIUTANG" && record.rekeningTujuan) {
        const rek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
        if (rek) {
          rek.saldoSaatIni -= record.totalNominal;
        }
      }
      db.penjualanHasilBumi.splice(idx, 1);
      dbManager.synchronizeVirtualAccounts();
      this.addAuditLog(
        db,
        "VOID",
        noPenjualan,
        `Pembatalan Penjualan Hasil Bumi ${record.komoditasNama} (${record.beratBersih.toLocaleString(
          "id-ID"
        )} Kg - ${record.namaMitra}). Stok dikembalikan ke gudang.`,
        record.totalNominal,
        record.rekeningTujuan
      );
      return { deleted: record };
    });
  }
  // ==========================================
  // 2D. RINGKASAN STOK HASIL BUMI BULANAN (TERJUAL VS READY DI GUDANG)
  // ==========================================
  static getRingkasanStokHasilBumiBulanan(params) {
    const db = dbManager.get();
    const { tanggal: todayWib } = getWIBDateTime();
    const parsedToday = this.parseMonthYear(todayWib) || { bulan: 10, tahun: 2026 };
    const targetBulan = params?.bulan && params.bulan >= 1 && params.bulan <= 12 ? Number(params.bulan) : parsedToday.bulan;
    const targetTahun = params?.tahun && params.tahun >= 2020 && params.tahun <= 2100 ? Number(params.tahun) : parsedToday.tahun;
    const kodeKomoditasFilter = params?.kodeKomoditas && params.kodeKomoditas !== "ALL" ? params.kodeKomoditas.trim() : "ALL";
    const NAMA_BULAN = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const NAMA_BULAN_SINGKAT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    const activeKomoditas = (db.stokHasilBumi || []).filter(
      (h) => h.kode !== "HB-01B" && !h.nama.toUpperCase().includes("KOPI JALAN")
    );
    const physicalPembelian = (db.pembelianHasilBumi || []).filter(
      (p) => this.isPhysicalPembelianHasilBumi(p)
    );
    const allPenjualanHb = db.penjualanHasilBumi || [];
    const yearSet = /* @__PURE__ */ new Set([parsedToday.tahun, targetTahun]);
    for (const p of physicalPembelian) {
      const my = this.parseMonthYear(p.tanggalNotaLalu || p.tanggal);
      if (my) yearSet.add(my.tahun);
    }
    for (const j of allPenjualanHb) {
      const my = this.parseMonthYear(j.tanggal);
      if (my) yearSet.add(my.tahun);
    }
    const daftarTahunTersedia = Array.from(yearSet).sort((a, b) => b - a);
    const isBeforeMonth = (my, bulan, tahun) => {
      if (!my) return false;
      return my.tahun < tahun || my.tahun === tahun && my.bulan < bulan;
    };
    const isSameMonth = (my, bulan, tahun) => {
      if (!my) return false;
      return my.tahun === tahun && my.bulan === bulan;
    };
    const matchesKomoditas = (kode, nama, hb) => kode === hb.kode || (nama || "").toUpperCase().trim() === hb.nama.toUpperCase().trim();
    const komoditasItems = activeKomoditas.map((hb) => {
      const hbPurchases = physicalPembelian.filter(
        (p) => matchesKomoditas(p.komoditasKode, p.komoditasNama, hb)
      );
      const hbSales = allPenjualanHb.filter(
        (j) => matchesKomoditas(j.komoditasKode, j.komoditasNama, hb)
      );
      const stokAwalManual = Math.max(0, Number(hb.stokAwal) || 0);
      const modalAwalManual = Number(hb.modalAwalTotal) || stokAwalManual * (Number(hb.rataRataModalAwal) || 0);
      const beliSebelumKg = hbPurchases.filter((p) => isBeforeMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), targetBulan, targetTahun)).reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);
      const jualSebelumKg = hbSales.filter((j) => isBeforeMonth(this.parseMonthYear(j.tanggal), targetBulan, targetTahun)).reduce((s, j) => s + (Number(j.beratBersih) || 0), 0);
      const stokAwalBulanKg2 = Math.max(
        0,
        Math.round((stokAwalManual + beliSebelumKg - jualSebelumKg) * 100) / 100
      );
      const beliBulanIni = hbPurchases.filter(
        (p) => isSameMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), targetBulan, targetTahun)
      );
      const masukBulanIniKg2 = Math.round(beliBulanIni.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0) * 100) / 100;
      const masukBulanIniNominal2 = beliBulanIni.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
      const rataHargaBeliBulanIni = masukBulanIniKg2 > 0 && masukBulanIniNominal2 > 0 ? Math.round(masukBulanIniNominal2 / masukBulanIniKg2) : 0;
      const jualBulanIni = hbSales.filter(
        (j) => isSameMonth(this.parseMonthYear(j.tanggal), targetBulan, targetTahun)
      );
      const terjualBulanIniKg2 = Math.round(jualBulanIni.reduce((s, j) => s + (Number(j.beratBersih) || 0), 0) * 100) / 100;
      const terjualBulanIniOmzet2 = jualBulanIni.reduce((s, j) => s + (Number(j.totalNominal) || 0), 0);
      const rataHargaJualBulanIni = terjualBulanIniKg2 > 0 && terjualBulanIniOmzet2 > 0 ? Math.round(terjualBulanIniOmzet2 / terjualBulanIniKg2) : 0;
      const labaBulanIni = jualBulanIni.reduce((s, j) => s + (Number(j.labaKotor) || 0), 0);
      const stokAkhirBulanKg2 = Math.max(
        0,
        Math.round((stokAwalBulanKg2 + masukBulanIniKg2 - terjualBulanIniKg2) * 100) / 100
      );
      const readyGudangSaatIniKg = Math.max(0, Math.round((Number(hb.stok) || 0) * 100) / 100);
      const totalMasukKumulatifKg2 = Math.round(
        (stokAwalManual + hbPurchases.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0)) * 100
      ) / 100;
      const totalUangBeliKumulatif = modalAwalManual + hbPurchases.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
      const totalTerjualKumulatifKg2 = Math.round(hbSales.reduce((s, j) => s + (Number(j.beratBersih) || 0), 0) * 100) / 100;
      const rataRataModalGudangPerKg = totalMasukKumulatifKg2 > 0 && totalUangBeliKumulatif > 0 ? Math.round(totalUangBeliKumulatif / totalMasukKumulatifKg2) : Math.max(0, Number(hb.rataRataModalAwal) || 0);
      const nilaiModalReadyGudang = Math.round(readyGudangSaatIniKg * rataRataModalGudangPerKg);
      return {
        kode: hb.kode,
        nama: hb.nama,
        satuan: hb.satuan || "Kg",
        isBelumPutusHarga: Boolean(hb.kode === "HB-08" || hb.isBelumPutusHarga),
        stokAwalBulanKg: stokAwalBulanKg2,
        masukBulanIniKg: masukBulanIniKg2,
        masukBulanIniNominal: masukBulanIniNominal2,
        rataHargaBeliBulanIni,
        notaBeliBulanIniCount: beliBulanIni.length,
        terjualBulanIniKg: terjualBulanIniKg2,
        terjualBulanIniOmzet: terjualBulanIniOmzet2,
        rataHargaJualBulanIni,
        labaBulanIni,
        notaJualBulanIniCount: jualBulanIni.length,
        stokAkhirBulanKg: stokAkhirBulanKg2,
        readyGudangSaatIniKg,
        rataRataModalGudangPerKg,
        nilaiModalReadyGudang,
        totalMasukKumulatifKg: totalMasukKumulatifKg2,
        totalTerjualKumulatifKg: totalTerjualKumulatifKg2
      };
    });
    const filteredKomoditasForScope = kodeKomoditasFilter === "ALL" ? activeKomoditas : activeKomoditas.filter((h) => h.kode === kodeKomoditasFilter);
    const rekapPerBulanTahunIni = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      let stokAwalKg = 0;
      let masukKg = 0;
      let masukNominal = 0;
      let notaBeliCount = 0;
      let terjualKg = 0;
      let terjualOmzet = 0;
      let terjualLaba = 0;
      let notaJualCount = 0;
      for (const hb of filteredKomoditasForScope) {
        const hbPurchases = physicalPembelian.filter(
          (p) => matchesKomoditas(p.komoditasKode, p.komoditasNama, hb)
        );
        const hbSales = allPenjualanHb.filter(
          (j) => matchesKomoditas(j.komoditasKode, j.komoditasNama, hb)
        );
        const awalManual = Math.max(0, Number(hb.stokAwal) || 0);
        const beliSebelum = hbPurchases.filter((p) => isBeforeMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), m, targetTahun)).reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);
        const jualSebelum = hbSales.filter((j) => isBeforeMonth(this.parseMonthYear(j.tanggal), m, targetTahun)).reduce((s, j) => s + (Number(j.beratBersih) || 0), 0);
        stokAwalKg += Math.max(0, awalManual + beliSebelum - jualSebelum);
        const beliBulan = hbPurchases.filter(
          (p) => isSameMonth(this.parseMonthYear(p.tanggalNotaLalu || p.tanggal), m, targetTahun)
        );
        masukKg += beliBulan.reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);
        masukNominal += beliBulan.reduce((s, p) => s + (Number(p.totalNominal) || 0), 0);
        notaBeliCount += beliBulan.length;
        const jualBulan = hbSales.filter(
          (j) => isSameMonth(this.parseMonthYear(j.tanggal), m, targetTahun)
        );
        terjualKg += jualBulan.reduce((s, j) => s + (Number(j.beratBersih) || 0), 0);
        terjualOmzet += jualBulan.reduce((s, j) => s + (Number(j.totalNominal) || 0), 0);
        terjualLaba += jualBulan.reduce((s, j) => s + (Number(j.labaKotor) || 0), 0);
        notaJualCount += jualBulan.length;
      }
      stokAwalKg = Math.round(stokAwalKg * 100) / 100;
      masukKg = Math.round(masukKg * 100) / 100;
      terjualKg = Math.round(terjualKg * 100) / 100;
      const stokAkhirKg = Math.max(0, Math.round((stokAwalKg + masukKg - terjualKg) * 100) / 100);
      return {
        bulan: m,
        tahun: targetTahun,
        namaBulan: NAMA_BULAN[idx],
        namaBulanSingkat: NAMA_BULAN_SINGKAT[idx],
        stokAwalKg,
        masukKg,
        masukNominal,
        notaBeliCount,
        terjualKg,
        terjualOmzet,
        terjualLaba,
        notaJualCount,
        stokAkhirKg,
        isCurrentMonth: m === parsedToday.bulan && targetTahun === parsedToday.tahun
      };
    });
    const scopedItems = kodeKomoditasFilter === "ALL" ? komoditasItems : komoditasItems.filter((it) => it.kode === kodeKomoditasFilter);
    const totalReadyGudangKg = Math.round(scopedItems.reduce((s, it) => s + it.readyGudangSaatIniKg, 0) * 100) / 100;
    const totalNilaiModalReadyGudang = scopedItems.reduce((s, it) => s + it.nilaiModalReadyGudang, 0);
    const jumlahKomoditasReady = scopedItems.filter((it) => it.readyGudangSaatIniKg > 0).length;
    const totalMasukKumulatifKg = Math.round(scopedItems.reduce((s, it) => s + it.totalMasukKumulatifKg, 0) * 100) / 100;
    const totalTerjualKumulatifKg = Math.round(scopedItems.reduce((s, it) => s + it.totalTerjualKumulatifKg, 0) * 100) / 100;
    const stokAwalBulanKg = Math.round(scopedItems.reduce((s, it) => s + it.stokAwalBulanKg, 0) * 100) / 100;
    const masukBulanIniKg = Math.round(scopedItems.reduce((s, it) => s + it.masukBulanIniKg, 0) * 100) / 100;
    const masukBulanIniNominal = scopedItems.reduce((s, it) => s + it.masukBulanIniNominal, 0);
    const jumlahNotaBeliBulanIni = scopedItems.reduce((s, it) => s + it.notaBeliBulanIniCount, 0);
    const terjualBulanIniKg = Math.round(scopedItems.reduce((s, it) => s + it.terjualBulanIniKg, 0) * 100) / 100;
    const terjualBulanIniOmzet = scopedItems.reduce((s, it) => s + it.terjualBulanIniOmzet, 0);
    const terjualBulanIniLaba = scopedItems.reduce((s, it) => s + it.labaBulanIni, 0);
    const terjualBulanIniModal = terjualBulanIniOmzet - terjualBulanIniLaba;
    const jumlahNotaJualBulanIni = scopedItems.reduce((s, it) => s + it.notaJualBulanIniCount, 0);
    const stokAkhirBulanKg = Math.round(scopedItems.reduce((s, it) => s + it.stokAkhirBulanKg, 0) * 100) / 100;
    return {
      bulan: targetBulan,
      tahun: targetTahun,
      periodeLabel: `${NAMA_BULAN[targetBulan - 1]} ${targetTahun}`,
      kodeKomoditasFilter,
      daftarTahunTersedia,
      totalReadyGudangKg,
      totalNilaiModalReadyGudang,
      jumlahKomoditasReady,
      totalMasukKumulatifKg,
      totalTerjualKumulatifKg,
      stokAwalBulanKg,
      masukBulanIniKg,
      masukBulanIniNominal,
      jumlahNotaBeliBulanIni,
      terjualBulanIniKg,
      terjualBulanIniOmzet,
      terjualBulanIniModal,
      terjualBulanIniLaba,
      jumlahNotaJualBulanIni,
      stokAkhirBulanKg,
      komoditasItems,
      rekapPerBulanTahunIni
    };
  }
  // ==========================================
  // 3. KASBON UANG (FITUR BARU C)
  // Perusahaan memberikan UANG kepada MITRA
  // ==========================================
  static async processKasbonUang(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!params.nominal || params.nominal <= 0) {
        throw new Error("Nominal kasbon uang harus lebih dari Rp 0");
      }
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) {
        throw new Error("Mitra penerima kasbon tidak ditemukan");
      }
      if (mitra.status !== "AKTIF") {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }
      let rekeningSumberKode = "";
      if (params.metode === "TUNAI") {
        rekeningSumberKode = "KAS01";
      } else if (params.metode === "TRANSFER") {
        if (!params.rekeningSumber) {
          throw new Error("User wajib memilih rekening bank perusahaan untuk transfer kasbon uang");
        }
        rekeningSumberKode = params.rekeningSumber;
      }
      if (rekeningSumberKode === "BON01" || rekeningSumberKode === "TIT01") {
        throw new Error("Rekening virtual BON01 / TIT01 DILARANG digunakan sebagai sumber kasbon uang!");
      }
      const rekeningSumber = db.rekening.find((r) => r.kode === rekeningSumberKode);
      if (!rekeningSumber) {
        throw new Error(`Rekening sumber dengan kode ${rekeningSumberKode} tidak ditemukan`);
      }
      if (rekeningSumber.status !== "AKTIF") {
        throw new Error(`Rekening sumber ${rekeningSumber.nama} tidak aktif`);
      }
      if (!this.isAnakPerusahaanRekening(rekeningSumber) && rekeningSumber.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening ${rekeningSumber.nama} (${rekeningSumber.kode}) tidak mencukupi! Saldo saat ini: Rp ${rekeningSumber.saldoSaatIni.toLocaleString(
            "id-ID"
          )}, kasbon yang diajukan: Rp ${params.nominal.toLocaleString("id-ID")}`
        );
      }
      rekeningSumber.saldoSaatIni -= params.nominal;
      const idTransaksi = generateId("KBU");
      const kasbonUangRecord = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        jenisTransaksi: "KASBON UANG",
        metode: params.metode,
        rekeningSumber: rekeningSumber.kode,
        nominal: params.nominal,
        sisaKasbon: params.nominal,
        keterangan: params.keterangan || `Pemberian Kasbon Uang Operasional Tani kepada ${mitra.nama}`,
        status: "BELUM LUNAS",
        fotoNota: params.fotoNota || "",
        createdAt: iso
      };
      db.kasbonUang.unshift(kasbonUangRecord);
      this.addAuditLog(
        db,
        "CREATE",
        idTransaksi,
        `Kasbon Uang diberikan kepada ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString(
          "id-ID"
        )} dari ${rekeningSumber.nama} (${rekeningSumber.kode}) via ${params.metode}`,
        params.nominal,
        rekeningSumber.kode
      );
      return kasbonUangRecord;
    });
  }
  // ==========================================
  // 3B. INPUT NOTA LALU & SALDO AWAL MITRA
  // Pencatatan piutang bon barang atau titipan hasil panen dari tahun-tahun sebelumnya
  // ==========================================
  static async processInputNotaLalu(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!params.nominal || params.nominal <= 0) {
        throw new Error("Nominal nota lalu harus lebih dari Rp 0");
      }
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) {
        throw new Error("Mitra / customer tidak ditemukan");
      }
      if (mitra.status !== "AKTIF") {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }
      const cleanTglNota = params.tanggalNotaLalu ? params.tanggalNotaLalu.trim() : tanggal;
      const cleanNoNota = params.noNotaLalu ? params.noNotaLalu.trim() : `NL-${Date.now().toString().slice(-4)}`;
      if (params.tipe === "PIUTANG_BARANG_NOTA_LALU") {
        const idTransaksi = generateId("NTL");
        const ketText = params.keterangan ? params.keterangan.trim() : `Nota Lalu (Piutang Barang Masa Lalu): ${params.rincianBarang ? params.rincianBarang.trim() : "Rekapan Bon Barang Bertahun-Tahun Lalu"}`;
        const kasbonRecord = {
          idTransaksi,
          tanggal: cleanTglNota,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          jenisTransaksi: "KASBON UANG",
          metode: "TUNAI",
          rekeningSumber: "BON01",
          nominal: params.nominal,
          sisaKasbon: params.nominal,
          keterangan: ketText,
          status: "BELUM LUNAS",
          fotoNota: params.fotoNota || (params.fotoNotaList?.[0] || ""),
          fotoNotaList: params.fotoNotaList || (params.fotoNota ? [params.fotoNota] : []),
          driveFileUrl: params.driveFileUrl || (params.driveFileList?.[0]?.url || ""),
          driveFileId: params.driveFileId || (params.driveFileList?.[0]?.id || ""),
          driveFolderPath: params.driveFolderPath || "NOTA LALU / PIUTANG NOTA LAMA",
          driveFileList: params.driveFileList || [],
          isNotaLalu: true,
          noNotaLalu: cleanNoNota,
          tanggalNotaLalu: cleanTglNota,
          rincianBarangNotaLalu: params.rincianBarang || "",
          createdAt: iso
        };
        db.kasbonUang.unshift(kasbonRecord);
        this.addAuditLog(
          db,
          "CREATE",
          idTransaksi,
          `Input Piutang Barang Nota Lalu untuk ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString("id-ID")} (No Faktur: ${cleanNoNota})`,
          params.nominal,
          "BON01"
        );
        return {
          record: kasbonRecord,
          tipe: "PIUTANG_BARANG_NOTA_LALU",
          mitraNama: mitra.nama,
          nominal: params.nominal
        };
      } else {
        const noPembelian = generateId("TTL");
        const ketText = params.keterangan ? params.keterangan.trim() : `Nota Lalu (Titipan Uang / Hasil Panen Masa Lalu): ${params.rincianBarang ? params.rincianBarang.trim() : "Saldo Titip Hasil Panen Belum Diambil"}`;
        const titipRecord = {
          noPembelian,
          tanggal: cleanTglNota,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          komoditasKode: "TITIP_DANA",
          komoditasNama: "Titipan Dana / Panen Nota Lalu",
          beratKotor: 0,
          potonganRafaksi: 0,
          beratBersih: 0,
          hargaPerKg: 0,
          totalNominal: params.nominal,
          metodePembayaran: "TITIP",
          rekeningSumber: "TIT01",
          status: "TITIP",
          fotoNota: params.fotoNota || (params.fotoNotaList?.[0] || ""),
          fotoNotaList: params.fotoNotaList || (params.fotoNota ? [params.fotoNota] : []),
          driveFileUrl: params.driveFileUrl || (params.driveFileList?.[0]?.url || ""),
          driveFileId: params.driveFileId || (params.driveFileList?.[0]?.id || ""),
          driveFolderPath: params.driveFolderPath || "NOTA LALU / HUTANG NOTA LAMA",
          driveFileList: params.driveFileList || [],
          isNotaLalu: true,
          noNotaLalu: cleanNoNota,
          tanggalNotaLalu: cleanTglNota,
          keterangan: ketText,
          createdAt: iso
        };
        db.pembelianHasilBumi.unshift(titipRecord);
        this.addAuditLog(
          db,
          "CREATE",
          noPembelian,
          `Input Titipan Uang / Hasil Panen Nota Lalu untuk ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString("id-ID")} (No Faktur: ${cleanNoNota})`,
          params.nominal,
          "TIT01"
        );
        return {
          record: titipRecord,
          tipe: "TITIP_UANG_NOTA_LALU",
          mitraNama: mitra.nama,
          nominal: params.nominal
        };
      }
    });
  }
  // ==========================================
  // PINJAM UANG DARI PT KE MITRA (MASUK SALDO TITIP MITRA)
  // PT menerima pinjaman uang dari Mitra -> Uang masuk ke kas/bank PT, dan otomatis masuk Saldo Titip Mitra
  // ==========================================
  static async processPinjamanUangDariMitra(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!params.nominal || params.nominal <= 0) {
        throw new Error("Nominal pinjaman uang harus lebih dari Rp 0");
      }
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error("Mitra tidak ditemukan");
      if (mitra.status !== "AKTIF") throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      const rekening = db.rekening.find((r) => r.kode === params.rekeningTujuan);
      if (!rekening) throw new Error(`Rekening kasir/bank PT "${params.rekeningTujuan}" tidak ditemukan`);
      const cleanTgl = params.tanggal ? params.tanggal.trim() : tanggal;
      const noPembelian = generateId("PJM");
      const cleanRef = params.noReferensi ? params.noReferensi.trim() : `PJM-${Date.now().toString().slice(-4)}`;
      rekening.saldoSaatIni += params.nominal;
      const allFotos = params.fotoNotaList && params.fotoNotaList.length > 0 ? params.fotoNotaList : params.fotoNota ? [params.fotoNota] : [];
      const pinjamanRecord = {
        noPembelian,
        tanggal: cleanTgl,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        komoditasKode: "PINJAMAN_DANA",
        komoditasNama: "Pinjaman Uang dari PT ke Mitra (Titipan Dana)",
        beratKotor: 0,
        potonganRafaksi: 0,
        beratBersih: 0,
        hargaPerKg: 0,
        totalNominal: params.nominal,
        metodePembayaran: "TITIP",
        rekeningSumber: rekening.kode,
        status: "TITIP",
        fotoNota: allFotos.join("|||"),
        fotoNotaList: allFotos,
        isNotaLalu: true,
        noNotaLalu: cleanRef,
        tanggalNotaLalu: cleanTgl,
        keterangan: params.keterangan ? params.keterangan.trim() : `Pinjaman uang dari PT ke Mitra ${mitra.nama} (Diterima di ${rekening.nama}, Masuk Saldo Titip Mitra)`,
        createdAt: iso
      };
      if (!db.pembelianHasilBumi) db.pembelianHasilBumi = [];
      db.pembelianHasilBumi.unshift(pinjamanRecord);
      this.addAuditLog(
        db,
        "CREATE",
        noPembelian,
        `Pinjam uang PT ke Mitra "${mitra.nama}" sebesar Rp ${params.nominal.toLocaleString("id-ID")} masuk ke ${rekening.nama} (Tercatat di Saldo Titip Mitra - Ref: ${cleanRef})`,
        params.nominal,
        rekening.kode
      );
      dbManager.synchronizeVirtualAccounts();
      return {
        record: pinjamanRecord,
        mitraNama: mitra.nama,
        nominal: params.nominal,
        rekeningNama: rekening.nama
      };
    });
  }
  // ==========================================
  // HELPER: SNAPSHOT SALDO SILANG MITRA & ALOKASI FIFO BON
  // ==========================================
  static getMitraCrossBalanceSnapshot(db, mitraId) {
    const outstandingPenjualan = (db.penjualan || []).filter(
      (p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR" && p.sisaPiutang > 0
    );
    const outstandingPenjualanHb = (db.penjualanHasilBumi || []).filter(
      (j) => j.idMitra === mitraId && j.metodePembayaran === "PIUTANG" && j.statusPembayaran === "BELUM_BAYAR" && j.sisaPiutang > 0
    );
    const outstandingKasbonUang = (db.kasbonUang || []).filter(
      (k) => k.idMitra === mitraId && k.status !== "LUNAS" && k.sisaKasbon > 0
    );
    const totalKasbonBarang = outstandingPenjualan.reduce((s, p) => s + p.sisaPiutang, 0) + outstandingPenjualanHb.reduce((s, j) => s + j.sisaPiutang, 0);
    const totalKasbonUang = outstandingKasbonUang.reduce((s, k) => s + k.sisaKasbon, 0);
    const totalBonKotor = totalKasbonBarang + totalKasbonUang;
    const totalTitipHasilBumi = (db.pembelianHasilBumi || []).filter((p) => p.idMitra === mitraId && p.metodePembayaran === "TITIP").reduce((s, p) => s + p.totalNominal, 0);
    const totalHutangKulakan = (db.pembelianBarang || []).filter(
      (pb) => pb.idMitra === mitraId && pb.metodePembayaran === "HUTANG" && pb.status !== "LUNAS"
    ).reduce((s, pb) => s + (pb.totalNominal || 0), 0);
    const totalTitipKotor = totalTitipHasilBumi + totalHutangKulakan;
    const totalPencairanSebelum = (db.pencairanTitipan || []).filter((pt) => pt.idMitra === mitraId).reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const saldoTitipanAktif = Math.max(0, totalTitipKotor - totalPencairanSebelum);
    const potonganOtomatis = Math.min(totalBonKotor, saldoTitipanAktif);
    const sisaBonBersih = Math.max(0, totalBonKotor - saldoTitipanAktif);
    const sisaTitipanBersih = Math.max(0, saldoTitipanAktif - totalBonKotor);
    return {
      outstandingPenjualan,
      outstandingPenjualanHb,
      outstandingKasbonUang,
      totalKasbonBarang,
      totalKasbonUang,
      totalBonKotor,
      saldoTitipanAktif,
      potonganOtomatis,
      sisaBonBersih,
      sisaTitipanBersih
    };
  }
  static allocateMitraBonFifo(db, mitraId, amountToAllocate) {
    if (amountToAllocate <= 0) return [];
    const outstandingPenjualan = (db.penjualan || []).filter(
      (p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR" && p.sisaPiutang > 0
    );
    const outstandingPenjualanHb = (db.penjualanHasilBumi || []).filter(
      (j) => j.idMitra === mitraId && j.metodePembayaran === "PIUTANG" && j.statusPembayaran === "BELUM_BAYAR" && j.sisaPiutang > 0
    );
    const outstandingKasbonUang = (db.kasbonUang || []).filter(
      (k) => k.idMitra === mitraId && k.status !== "LUNAS" && k.sisaKasbon > 0
    );
    const allBons = [
      ...outstandingPenjualan.map((p) => ({
        jenis: "KASBON_BARANG",
        refId: p.noPenjualan,
        sisa: p.sisaPiutang,
        createdAt: p.createdAt,
        sourceObj: p
      })),
      ...outstandingPenjualanHb.map((j) => ({
        jenis: "KASBON_BARANG",
        refId: j.noPenjualan,
        sisa: j.sisaPiutang,
        createdAt: j.createdAt,
        sourceObj: j
      })),
      ...outstandingKasbonUang.map((k) => ({
        jenis: "KASBON_UANG",
        refId: k.idTransaksi,
        sisa: k.sisaKasbon,
        createdAt: k.createdAt,
        sourceObj: k
      }))
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let remainingPayment = amountToAllocate;
    const alokasiList = [];
    for (const bon of allBons) {
      if (remainingPayment <= 0) break;
      const nominalSebelum = bon.sisa;
      const alokasiNominal = Math.min(remainingPayment, nominalSebelum);
      const nominalSisa = nominalSebelum - alokasiNominal;
      if (bon.jenis === "KASBON_BARANG") {
        const pj = bon.sourceObj;
        pj.sisaPiutang = nominalSisa;
        if (nominalSisa === 0) {
          pj.statusPembayaran = "LUNAS";
        }
      } else {
        const kbu = bon.sourceObj;
        kbu.sisaKasbon = nominalSisa;
        kbu.status = nominalSisa === 0 ? "LUNAS" : "SEBAGIAN";
      }
      alokasiList.push({
        jenis: bon.jenis,
        refId: bon.refId,
        nominalSebelum,
        nominalDibayar: alokasiNominal,
        nominalSisa
      });
      remainingPayment -= alokasiNominal;
    }
    return alokasiList;
  }
  static executeAutoCrossOffsetInTx(params) {
    const {
      db,
      mitra,
      nominalPotong,
      totalBonSebelum,
      saldoTitipanSebelum,
      tanggal,
      jam,
      iso,
      refId
    } = params;
    if (nominalPotong <= 0) return [];
    const alokasiKompensasi = this.allocateMitraBonFifo(db, mitra.id, nominalPotong);
    const sisaBonSetelahPotong = Math.max(0, totalBonSebelum - nominalPotong);
    const sisaTitipSetelahPotong = Math.max(0, saldoTitipanSebelum - nominalPotong);
    if (!db.bayarBon) db.bayarBon = [];
    db.bayarBon.unshift({
      idTransaksi: `${refId}-POTBON`,
      tanggal,
      jam,
      idMitra: mitra.id,
      namaMitra: mitra.nama,
      totalBonSebelum,
      nominalBayar: nominalPotong,
      sisaBonSetelah: sisaBonSetelahPotong,
      metode: "SINKRON",
      rekeningTujuan: "SINKRON",
      isKompensasiTitipan: true,
      alokasi: alokasiKompensasi,
      keterangan: `Sinkron Potong Bon Otomatis dari Titipan Hasil Bumi (${refId})`,
      createdAt: iso
    });
    if (!db.pencairanTitipan) db.pencairanTitipan = [];
    db.pencairanTitipan.unshift({
      idPencairan: `${refId}-POTTIT`,
      tanggal,
      jam,
      idMitra: mitra.id,
      namaMitra: mitra.nama,
      nominalPencairan: nominalPotong,
      rekeningSumber: "SINKRON",
      saldoTitipanSebelum,
      saldoTitipanSisa: sisaTitipSetelahPotong,
      metodePembayaran: "SINKRON",
      isKompensasiBon: true,
      keterangan: `Sinkron Potong Titipan Hasil Bumi untuk Pelunasan Bon Mitra (${refId})`,
      createdAt: iso
    });
    return alokasiKompensasi;
  }
  // ==========================================
  // 4. BAYAR BON (FITUR BARU D + REKENING SINKRON)
  // Pelunasan bon mitra via Tunai, Transfer, atau SINKRON (Potong langsung Titipan Hasil Bumi / Uang Kopi tanpa kas keluar/masuk)
  // ==========================================
  static async processBayarBon(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!params.nominalBayar || params.nominalBayar <= 0) {
        throw new Error("Nominal pembayaran bon harus lebih dari Rp 0");
      }
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error("Mitra tidak ditemukan");
      const snap = this.getMitraCrossBalanceSnapshot(db, mitra.id);
      const {
        totalBonKotor,
        saldoTitipanAktif,
        potonganOtomatis,
        sisaBonBersih
      } = snap;
      const isSinkronMode = params.metode === "SINKRON" || params.rekeningTujuan === "SINKRON";
      if (isSinkronMode) {
        if (totalBonKotor <= 0) {
          throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon aktif yang perlu disinkronkan (Rp 0).`);
        }
        if (saldoTitipanAktif <= 0) {
          throw new Error(
            `Mitra ${mitra.nama} tidak memiliki Saldo Titipan Hasil Bumi / Uang Kopi (Rp 0) untuk dipotong via Rekening SINKRON. Silakan gunakan metode Tunai atau Transfer.`
          );
        }
        const maksPotongSinkron = Math.min(totalBonKotor, saldoTitipanAktif);
        if (params.nominalBayar > maksPotongSinkron) {
          throw new Error(
            `Nominal SINKRON (Rp ${params.nominalBayar.toLocaleString(
              "id-ID"
            )}) melebihi batas maksimal potong silang antara Bon (Rp ${totalBonKotor.toLocaleString(
              "id-ID"
            )}) dan Saldo Titipan Hasil Bumi (Rp ${saldoTitipanAktif.toLocaleString("id-ID")}), yaitu maksimal Rp ${maksPotongSinkron.toLocaleString("id-ID")}.`
          );
        }
        const idTransaksi2 = generateId("BYB");
        const alokasiSinkron = this.allocateMitraBonFifo(db, mitra.id, params.nominalBayar);
        const sisaBonSetelah2 = Math.max(0, totalBonKotor - params.nominalBayar);
        const sisaTitipanSetelah = Math.max(0, saldoTitipanAktif - params.nominalBayar);
        const ketSinkron = params.keterangan && params.keterangan.trim() ? params.keterangan.trim() : `Pelunasan Bon via SINKRON \u2014 Potong langsung dari Saldo Titipan / Uang Hasil Bumi (Sisa Titipan: Rp ${sisaTitipanSetelah.toLocaleString("id-ID")})`;
        const bayarBonSinkronRecord = {
          idTransaksi: idTransaksi2,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: totalBonKotor,
          totalBonAwalKotor: totalBonKotor,
          nominalPotongTitipanOtomatis: params.nominalBayar,
          nominalBayar: params.nominalBayar,
          sisaBonSetelah: sisaBonSetelah2,
          metode: "SINKRON",
          rekeningTujuan: "SINKRON",
          isKompensasiTitipan: true,
          alokasi: alokasiSinkron,
          keterangan: ketSinkron,
          createdAt: iso
        };
        if (!db.bayarBon) db.bayarBon = [];
        db.bayarBon.unshift(bayarBonSinkronRecord);
        if (!db.pencairanTitipan) db.pencairanTitipan = [];
        db.pencairanTitipan.unshift({
          idPencairan: `${idTransaksi2}-SINKRON`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: params.nominalBayar,
          rekeningSumber: "SINKRON",
          saldoTitipanSebelum: saldoTitipanAktif,
          totalTitipanAwalKotor: saldoTitipanAktif,
          nominalPotongBonOtomatis: params.nominalBayar,
          saldoTitipanSisa: sisaTitipanSetelah,
          metodePembayaran: "SINKRON",
          isKompensasiBon: true,
          keterangan: `Potong Saldo Titipan / Uang Hasil Bumi via Rekening SINKRON untuk Pelunasan Bon (${idTransaksi2})`,
          createdAt: iso
        });
        dbManager.synchronizeVirtualAccounts();
        this.addAuditLog(
          db,
          "PAYMENT",
          idTransaksi2,
          `Pelunasan Bon via SINKRON (${mitra.nama}): Bon Rp ${params.nominalBayar.toLocaleString(
            "id-ID"
          )} dipotong langsung dari Saldo Titipan / Uang Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
            "id-ID"
          )} tanpa uang keluar/masuk. Sisa Bon: Rp ${sisaBonSetelah2.toLocaleString(
            "id-ID"
          )}, Sisa Titipan Mitra: Rp ${sisaTitipanSetelah.toLocaleString("id-ID")}.`,
          params.nominalBayar,
          "SINKRON"
        );
        return bayarBonSinkronRecord;
      }
      if (sisaBonBersih <= 0) {
        if (totalBonKotor > 0 && saldoTitipanAktif >= totalBonKotor) {
          throw new Error(
            `Bon ${mitra.nama} sebesar Rp ${totalBonKotor.toLocaleString(
              "id-ID"
            )} sudah tertutup oleh Saldo Titipan Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
              "id-ID"
            )}. Pilih metode SINKRON untuk memotong langsung dari uang titipan tanpa uang fisik!`
          );
        }
        throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon yang harus dibayar saat ini`);
      }
      if (params.nominalBayar > sisaBonBersih) {
        throw new Error(
          `Nominal pembayaran tunai/transfer (Rp ${params.nominalBayar.toLocaleString(
            "id-ID"
          )}) melebihi sisa bon bersih mitra setelah potong titipan hasil bumi (Rp ${sisaBonBersih.toLocaleString(
            "id-ID"
          )})`
        );
      }
      let rekeningTujuanKode = "";
      if (params.metode === "TUNAI") {
        rekeningTujuanKode = "KAS01";
      } else if (params.metode === "TRANSFER") {
        if (!params.rekeningTujuan) {
          throw new Error("User wajib memilih rekening bank perusahaan penampung setoran");
        }
        rekeningTujuanKode = params.rekeningTujuan;
      }
      if (rekeningTujuanKode === "BON01" || rekeningTujuanKode === "TIT01" || rekeningTujuanKode === "SINKRON") {
        throw new Error("Rekening sistem BON01 / TIT01 / SINKRON tidak dapat dijadikan rekening transfer bank fisik!");
      }
      const rekeningTujuan = db.rekening.find((r) => r.kode === rekeningTujuanKode);
      if (!rekeningTujuan) {
        throw new Error(`Rekening ${rekeningTujuanKode} tidak ditemukan`);
      }
      if (rekeningTujuan.status !== "AKTIF") {
        throw new Error(`Rekening ${rekeningTujuan.nama} tidak aktif`);
      }
      const idTransaksi = generateId("BYB");
      if (potonganOtomatis > 0) {
        this.executeAutoCrossOffsetInTx({
          db,
          mitra,
          nominalPotong: potonganOtomatis,
          totalBonSebelum: totalBonKotor,
          saldoTitipanSebelum: saldoTitipanAktif,
          tanggal,
          jam,
          iso,
          refId: idTransaksi
        });
      }
      rekeningTujuan.saldoSaatIni += params.nominalBayar;
      const alokasiList = this.allocateMitraBonFifo(db, mitra.id, params.nominalBayar);
      const sisaBonSetelah = Math.max(0, sisaBonBersih - params.nominalBayar);
      const bayarBonRecord = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        totalBonSebelum: sisaBonBersih,
        ...potonganOtomatis > 0 ? {
          totalBonAwalKotor: totalBonKotor,
          nominalPotongTitipanOtomatis: potonganOtomatis
        } : {},
        nominalBayar: params.nominalBayar,
        sisaBonSetelah,
        metode: params.metode,
        rekeningTujuan: rekeningTujuan.kode,
        alokasi: alokasiList,
        keterangan: params.keterangan || (potonganOtomatis > 0 ? `Pelunasan Sisa Bon ${mitra.nama} ke ${rekeningTujuan.nama} (setelah Sinkron Titipan Rp ${potonganOtomatis.toLocaleString(
          "id-ID"
        )})` : `Pembayaran Bon ${mitra.nama} ke ${rekeningTujuan.nama}`),
        createdAt: iso
      };
      db.bayarBon.unshift(bayarBonRecord);
      dbManager.synchronizeVirtualAccounts();
      this.addAuditLog(
        db,
        "PAYMENT",
        idTransaksi,
        potonganOtomatis > 0 ? `Pembayaran Sisa Bon oleh ${mitra.nama}: Bon Awal Rp ${totalBonKotor.toLocaleString(
          "id-ID"
        )} dipotong Sinkron Titipan Hasil Bumi Rp ${potonganOtomatis.toLocaleString(
          "id-ID"
        )}, dibayar tunai/transfer Rp ${params.nominalBayar.toLocaleString("id-ID")} masuk ke ${rekeningTujuan.nama}. Sisa bon: Rp ${sisaBonSetelah.toLocaleString("id-ID")}` : `Pembayaran Bon oleh ${mitra.nama}: Rp ${params.nominalBayar.toLocaleString(
          "id-ID"
        )} masuk ke ${rekeningTujuan.nama}. Sisa kewajiban bon: Rp ${sisaBonSetelah.toLocaleString("id-ID")}`,
        params.nominalBayar,
        rekeningTujuan.kode
      );
      return bayarBonRecord;
    });
  }
  // ==========================================
  // 5. TRANSFER ANTAR REKENING PERUSAHAAN (FITUR BARU E)
  // Perpindahan dana internal antar rekening perusahaan
  // ==========================================
  static async processTransferRekening(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!params.rekeningSumber || !params.rekeningTujuan) {
        throw new Error("Rekening sumber dan rekening tujuan wajib diisi");
      }
      if (params.rekeningSumber === params.rekeningTujuan) {
        throw new Error("Rekening sumber dan rekening tujuan tidak boleh sama");
      }
      if (params.rekeningSumber === "BON01" || params.rekeningSumber === "TIT01" || params.rekeningTujuan === "BON01" || params.rekeningTujuan === "TIT01") {
        throw new Error("Rekening BON01 dan TIT01 TIDAK BOLEH digunakan untuk transfer antar rekening perusahaan!");
      }
      if (!params.nominal || params.nominal <= 0) {
        throw new Error("Nominal transfer harus lebih dari Rp 0");
      }
      const sumberAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (!sumberAcc) {
        throw new Error(`Rekening sumber ${params.rekeningSumber} tidak ditemukan`);
      }
      if (sumberAcc.status !== "AKTIF") {
        throw new Error(`Rekening sumber ${sumberAcc.nama} tidak aktif`);
      }
      const tujuanAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
      if (!tujuanAcc) {
        throw new Error(`Rekening tujuan ${params.rekeningTujuan} tidak ditemukan`);
      }
      if (tujuanAcc.status !== "AKTIF") {
        throw new Error(`Rekening tujuan ${tujuanAcc.nama} tidak aktif`);
      }
      const isSumberAnak = this.isAnakPerusahaanRekening(sumberAcc);
      const isTujuanAnak = this.isAnakPerusahaanRekening(tujuanAcc);
      if (!isSumberAnak && sumberAcc.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening sumber ${sumberAcc.nama} (${sumberAcc.kode}) tidak mencukupi! Saldo saat ini: Rp ${sumberAcc.saldoSaatIni.toLocaleString(
            "id-ID"
          )}, nominal transfer: Rp ${params.nominal.toLocaleString("id-ID")}`
        );
      }
      sumberAcc.saldoSaatIni -= params.nominal;
      tujuanAcc.saldoSaatIni += params.nominal;
      let idMitraTerkait;
      let namaMitraTerkait;
      let tipeMutasiAfiliasi;
      if (isTujuanAnak && !isSumberAnak) {
        idMitraTerkait = tujuanAcc.idMitraTerkait || "MTR-DPPARABOT";
        namaMitraTerkait = tujuanAcc.namaMitraTerkait || tujuanAcc.nama;
        tipeMutasiAfiliasi = "SIMPAN_KE_ANAK_PERUSAHAAN";
      } else if (isSumberAnak && !isTujuanAnak) {
        idMitraTerkait = sumberAcc.idMitraTerkait || "MTR-DPPARABOT";
        namaMitraTerkait = sumberAcc.namaMitraTerkait || sumberAcc.nama;
        tipeMutasiAfiliasi = "TARIK_DARI_ANAK_PERUSAHAAN";
      } else if (isSumberAnak && isTujuanAnak) {
        idMitraTerkait = tujuanAcc.idMitraTerkait || sumberAcc.idMitraTerkait;
        namaMitraTerkait = tujuanAcc.namaMitraTerkait || tujuanAcc.nama;
        tipeMutasiAfiliasi = "ANTAR_ANAK_PERUSAHAAN";
      }
      const defaultKet = tipeMutasiAfiliasi === "SIMPAN_KE_ANAK_PERUSAHAAN" ? `Simpan / Titip Dana PT ke Anak Perusahaan ${namaMitraTerkait} (1 Transaksi Terpadu Rekening & Mitra)` : tipeMutasiAfiliasi === "TARIK_DARI_ANAK_PERUSAHAAN" ? `Tarik / Talangan Dana dari Anak Perusahaan ${namaMitraTerkait} ke ${tujuanAcc.nama} (1 Transaksi Terpadu Rekening & Mitra)` : "Pemindahan dana operasional internal";
      const noTransfer = generateId("TRF");
      const transferRecord = {
        noTransfer,
        tanggal,
        jam,
        rekeningSumber: sumberAcc.kode,
        rekeningTujuan: tujuanAcc.kode,
        nominal: params.nominal,
        keterangan: params.keterangan?.trim() || defaultKet,
        status: "BERHASIL",
        ...idMitraTerkait ? { idMitraTerkait } : {},
        ...namaMitraTerkait ? { namaMitraTerkait } : {},
        ...tipeMutasiAfiliasi ? { tipeMutasiAfiliasi } : {},
        createdAt: iso
      };
      db.transferRekening.unshift(transferRecord);
      this.addAuditLog(
        db,
        "TRANSFER",
        noTransfer,
        idMitraTerkait ? `1 Transaksi Terpadu (Rekening & Mitra Anak Perusahaan ${namaMitraTerkait}): ${sumberAcc.nama} (${sumberAcc.kode}) -> ${tujuanAcc.nama} (${tujuanAcc.kode}) sebesar Rp ${params.nominal.toLocaleString(
          "id-ID"
        )}. Ket: ${transferRecord.keterangan}` : `Transfer Antar Rekening: ${sumberAcc.nama} (${sumberAcc.kode}) -> ${tujuanAcc.nama} (${tujuanAcc.kode}) sebesar Rp ${params.nominal.toLocaleString(
          "id-ID"
        )}. Ket: ${transferRecord.keterangan}`,
        params.nominal,
        `${sumberAcc.kode} -> ${tujuanAcc.kode}`
      );
      return transferRecord;
    });
  }
  static {
    // ==========================================
    // PENGGAJIAN KARYAWAN & POTONG KASBON (HARIAN & BULANAN DENGAN DIVISI)
    // ==========================================
    this.DIVISI_REKENING_MAP = {
      "Gudang Wijaya Agro": "REK-GWA",
      "Wijaya Karya": "REK-WK",
      "Wijaya Transport": "REK-WT",
      "CV Wijaya Agro": "REK-CVA",
      "PT Wijaya Agro Perkasa": "REK-WAP",
      "Okussa": "REK-OKU"
    };
  }
  static async processPenggajian(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) {
        throw new Error(`Karyawan dengan ID ${params.idKaryawan} tidak ditemukan`);
      }
      if (kry.status !== "AKTIF") {
        throw new Error(`Karyawan ${kry.nama} berstatus nonaktif`);
      }
      const divisi = params.divisi || "Gudang Wijaya Agro";
      const tipeGaji = params.tipeGaji || "HARIAN";
      const targetTanggal = params.tanggalKerja || tanggal;
      let rekKode = params.rekeningSumber;
      if (!rekKode) {
        rekKode = _TransactionService.DIVISI_REKENING_MAP[divisi] || "KAS01";
      }
      if (rekKode === "BON01" || rekKode === "TIT01") {
        throw new Error("Rekening virtual BON01 / TIT01 DILARANG digunakan untuk pembayaran gaji!");
      }
      let rekSumber = db.rekening.find((r) => r.kode === rekKode);
      if (!rekSumber) {
        rekSumber = db.rekening.find((r) => r.kode === "KAS01") || db.rekening[0];
      }
      if (rekSumber.status !== "AKTIF") {
        throw new Error(`Rekening ${rekSumber.nama} tidak aktif`);
      }
      const upahManual = params.gajiNominal !== void 0 && params.gajiNominal !== null ? Math.max(0, Number(params.gajiNominal)) : kry.gajiPokok || 0;
      const tunjangan = tipeGaji === "BULANAN" ? kry.tunjanganTetap || 0 : 0;
      const bonus = Math.max(0, Number(params.bonus) || 0);
      const totalGajiKotor = upahManual + tunjangan + bonus;
      if (totalGajiKotor <= 0) {
        throw new Error("Total gaji/upah harian harus lebih dari Rp 0");
      }
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const outstandingKasbonBarang = db.penjualan.filter((p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const outstandingKasbonUang = db.kasbonUang.filter((k) => k.idMitra === mitraId && k.status !== "LUNAS").reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;
      let potonganKasbon = 0;
      const persentase = Number(params.persentasePotongKasbon) || 0;
      if (params.nominalPotongKustom !== void 0 && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalGajiKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        const calculated = Math.round(totalKasbonAwal * persentase / 100);
        potonganKasbon = Math.min(calculated, totalKasbonAwal, totalGajiKotor);
      }
      const gajiBersihDibayar = totalGajiKotor - potonganKasbon;
      if (!this.isAnakPerusahaanRekening(rekSumber) && rekSumber.kategori !== "OPERASIONAL_DIVISI" && rekSumber.saldoSaatIni < gajiBersihDibayar) {
        throw new Error(
          `Saldo rekening ${rekSumber.nama} (Rp ${rekSumber.saldoSaatIni.toLocaleString(
            "id-ID"
          )}) tidak mencukupi untuk pembayaran gaji bersih Rp ${gajiBersihDibayar.toLocaleString("id-ID")}`
        );
      }
      let idBayarBonTerkait;
      if (potonganKasbon > 0) {
        let remainingToSettle = potonganKasbon;
        const alokasiList = [];
        const unpaidKasbonUang = db.kasbonUang.filter(
          (k) => k.idMitra === mitraId && k.status !== "LUNAS"
        );
        for (const kbu of unpaidKasbonUang) {
          if (remainingToSettle <= 0) break;
          const sisa = kbu.sisaKasbon;
          const settled = Math.min(remainingToSettle, sisa);
          kbu.sisaKasbon = sisa - settled;
          kbu.status = kbu.sisaKasbon === 0 ? "LUNAS" : "SEBAGIAN";
          alokasiList.push({
            jenis: "KASBON_UANG",
            refId: kbu.idTransaksi,
            nominalSebelum: sisa,
            nominalDibayar: settled,
            nominalSisa: kbu.sisaKasbon
          });
          remainingToSettle -= settled;
        }
        if (remainingToSettle > 0) {
          const unpaidPenjualan = db.penjualan.filter(
            (p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR"
          );
          for (const pj of unpaidPenjualan) {
            if (remainingToSettle <= 0) break;
            const sisa = pj.sisaPiutang;
            const settled = Math.min(remainingToSettle, sisa);
            pj.sisaPiutang = sisa - settled;
            if (pj.sisaPiutang === 0) {
              pj.statusPembayaran = "LUNAS";
            }
            alokasiList.push({
              jenis: "KASBON_BARANG",
              refId: pj.noPenjualan,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: pj.sisaPiutang
            });
            remainingToSettle -= settled;
          }
        }
        const idBYB = generateId("BYB");
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          idTransaksi: idBYB,
          tanggal: targetTanggal,
          jam,
          idMitra: mitraId,
          namaMitra: `${kry.nama} (Karyawan)`,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: "POTONG_GAJI",
          rekeningTujuan: "POTONG_GAJI",
          isPotongGaji: true,
          alokasi: alokasiList,
          keterangan: `Potong Gaji ${tipeGaji === "HARIAN" ? "Harian" : "Bulanan"} [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso
        });
      }
      rekSumber.saldoSaatIni -= gajiBersihDibayar;
      const sisaKasbonAkhir = totalKasbonAwal - potonganKasbon;
      const idPayroll = generateId("GAJI");
      const slipNomor = `SLIP/WA/${targetTanggal.replace(/\//g, "")}/${idPayroll.slice(-4)}`;
      const periodeFormatted = params.periodeBulan || (tipeGaji === "HARIAN" ? `Harian - ${targetTanggal}` : `Bulanan - ${targetTanggal.slice(3)}`);
      const payrollRecord = {
        id: idPayroll,
        slipNomor,
        tanggal: targetTanggal,
        jam,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisi,
        tipeGaji,
        periodeBulan: periodeFormatted,
        gajiPokok: upahManual,
        tunjangan,
        bonus,
        totalGajiKotor,
        totalKasbonAwal,
        persentasePotongKasbon: persentase,
        potonganKasbon,
        sisaKasbonAkhir,
        gajiBersihDibayar,
        metodePembayaran: params.metodePembayaran || "TUNAI",
        rekeningSumber: rekSumber.kode,
        keterangan: params.keterangan || `Gaji ${tipeGaji === "HARIAN" ? "Harian" : "Bulanan"} Divisi ${divisi} - ${kry.nama}`,
        idBayarBonTerkait
      };
      db.penggajian.unshift(payrollRecord);
      this.addAuditLog(
        db,
        "PAYROLL",
        idPayroll,
        `Penggajian ${tipeGaji} [Divisi: ${divisi}] Karyawan ${kry.nama} (${kry.nik}): Upah Kotor Rp ${totalGajiKotor.toLocaleString("id-ID")}, Potong Bon Rp ${potonganKasbon.toLocaleString("id-ID")} (Sisa Bon Rp ${sisaKasbonAkhir.toLocaleString("id-ID")}), Gaji Bersih Rp ${gajiBersihDibayar.toLocaleString("id-ID")} via ${rekSumber.nama} (${rekSumber.kode})`,
        gajiBersihDibayar,
        rekSumber.kode
      );
      return payrollRecord;
    });
  }
  /**
   * Process Batch Penggajian Harian (Multi-Karyawan Sekaligus)
   */
  static async processBatchPenggajianHarian(batchData) {
    const results = [];
    for (const item of batchData.items) {
      const res = await this.processPenggajian({
        idKaryawan: item.idKaryawan,
        divisi: item.divisi,
        tipeGaji: "HARIAN",
        tanggalKerja: batchData.tanggalKerja,
        gajiNominal: item.gajiNominal,
        bonus: item.bonus,
        persentasePotongKasbon: item.persentasePotongKasbon || 0,
        nominalPotongKustom: item.nominalPotongKustom,
        rekeningSumber: item.rekeningSumber,
        keterangan: item.keterangan
      });
      results.push(res);
    }
    return results;
  }
  /**
   * Catat / Input Pekerjaan Harian Karyawan
   * Admin bisa memilih divisi, menentukan hari ini kerja untuk apa, dan nominal upah fleksibel/dinamis
   */
  static async recordKerjaHarian(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) throw new Error(`Karyawan dengan ID ${params.idKaryawan} tidak ditemukan`);
      if (kry.status !== "AKTIF") throw new Error(`Karyawan ${kry.nama} berstatus nonaktif`);
      const tglKerja = params.tanggalKerja || tanggal;
      const kuantiti = params.kuantiti !== void 0 ? Number(params.kuantiti) : 1;
      const harga = params.harga !== void 0 ? Number(params.harga) : Number(params.upahHarian) || 0;
      const uangMakan = Math.max(0, Number(params.uangMakanLembur) || 0);
      const hitungJumlah = params.jumlah !== void 0 ? Number(params.jumlah) : kuantiti * harga;
      const totalUpah = hitungJumlah + uangMakan;
      const isLangsungCair = params.modeBayar === "LANGSUNG_CAIR";
      if (isLangsungCair && totalUpah <= 0) {
        throw new Error("Nominal upah kerja harian untuk pencairan langsung harus lebih dari Rp 0");
      }
      const itemNama = params.item || params.tugasPekerjaan || "KERJA GUDANG";
      const idUph = generateId("UPH");
      let slipGaji;
      if (isLangsungCair) {
        const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
        const outstandingKasbonBarang = (db.penjualan || []).filter((p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
        const outstandingKasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra === mitraId && k.status !== "LUNAS").reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
        const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;
        let potonganKasbon = 0;
        const persentase = Number(params.persentasePotongKasbon) || 0;
        if (params.nominalPotongKustom && params.nominalPotongKustom > 0) {
          potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpah);
        } else if (persentase > 0 && totalKasbonAwal > 0) {
          potonganKasbon = Math.min(Math.round(totalKasbonAwal * persentase / 100), totalKasbonAwal, totalUpah);
        }
        const gajiBersihDibayar = totalUpah - potonganKasbon;
        const rekKode = params.rekeningSumber || _TransactionService.DIVISI_REKENING_MAP[params.divisi] || "KAS01";
        let rekSumber = db.rekening.find((r) => r.kode === rekKode) || db.rekening.find((r) => r.kode === "KAS01") || db.rekening[0];
        if (!this.isAnakPerusahaanRekening(rekSumber) && rekSumber.kategori !== "OPERASIONAL_DIVISI" && rekSumber.saldoSaatIni < gajiBersihDibayar) {
          throw new Error(
            `Saldo rekening ${rekSumber.nama} tidak mencukupi untuk pembayaran upah bersih Rp ${gajiBersihDibayar.toLocaleString("id-ID")}`
          );
        }
        let idBayarBonTerkait;
        if (potonganKasbon > 0) {
          let remaining = potonganKasbon;
          const alokasiList = [];
          const unpaidUang = db.kasbonUang.filter((k) => k.idMitra === mitraId && k.status !== "LUNAS");
          for (const kbu of unpaidUang) {
            if (remaining <= 0) break;
            const sisa = kbu.sisaKasbon;
            const settled = Math.min(remaining, sisa);
            kbu.sisaKasbon = sisa - settled;
            kbu.status = kbu.sisaKasbon === 0 ? "LUNAS" : "SEBAGIAN";
            alokasiList.push({
              jenis: "KASBON_UANG",
              refId: kbu.idTransaksi,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: kbu.sisaKasbon
            });
            remaining -= settled;
          }
          if (remaining > 0) {
            const unpaidBarang = db.penjualan.filter(
              (p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR"
            );
            for (const pj of unpaidBarang) {
              if (remaining <= 0) break;
              const sisa = pj.sisaPiutang;
              const settled = Math.min(remaining, sisa);
              pj.sisaPiutang = sisa - settled;
              if (pj.sisaPiutang === 0) pj.statusPembayaran = "LUNAS";
              alokasiList.push({
                jenis: "KASBON_BARANG",
                refId: pj.noPenjualan,
                nominalSebelum: sisa,
                nominalDibayar: settled,
                nominalSisa: pj.sisaPiutang
              });
              remaining -= settled;
            }
          }
          const idBYB = generateId("BYB");
          idBayarBonTerkait = idBYB;
          db.bayarBon.unshift({
            idTransaksi: idBYB,
            tanggal: tglKerja,
            jam,
            idMitra: mitraId,
            namaMitra: `${kry.nama} (Karyawan)`,
            totalBonSebelum: totalKasbonAwal,
            nominalBayar: potonganKasbon,
            sisaBonSetelah: totalKasbonAwal - potonganKasbon,
            metode: "POTONG_GAJI",
            rekeningTujuan: "POTONG_GAJI",
            isPotongGaji: true,
            alokasi: alokasiList,
            keterangan: `Potong Upah Harian [${params.divisi}] Karyawan ${kry.nama}`,
            createdAt: iso
          });
        }
        rekSumber.saldoSaatIni -= gajiBersihDibayar;
        const idPayroll = generateId("GAJI");
        const slipNomor = `SLIP/WA/${tglKerja.replace(/\//g, "")}/${idPayroll.slice(-4)}`;
        slipGaji = {
          id: idPayroll,
          slipNomor,
          tanggal: tglKerja,
          jam,
          idKaryawan: kry.id,
          nikKaryawan: kry.nik,
          namaKaryawan: kry.nama,
          jabatan: kry.jabatan,
          departemen: kry.departemen,
          divisi: params.divisi,
          tipeGaji: "HARIAN",
          periodeBulan: `Harian - ${tglKerja}`,
          gajiPokok: hitungJumlah,
          tunjangan: 0,
          bonus: uangMakan,
          totalGajiKotor: totalUpah,
          totalKasbonAwal,
          persentasePotongKasbon: persentase,
          potonganKasbon,
          sisaKasbonAkhir: totalKasbonAwal - potonganKasbon,
          gajiBersihDibayar,
          metodePembayaran: params.metodePembayaran || "TUNAI",
          rekeningSumber: rekSumber.kode,
          keterangan: `Upah Harian [${params.divisi}]: ${params.tugasPekerjaan}`,
          idBayarBonTerkait
        };
        db.penggajian.unshift(slipGaji);
        this.addAuditLog(
          db,
          "PAYROLL",
          idPayroll,
          `Pencairan Upah Harian [${params.divisi}] ${kry.nama} (${kry.nik}) Tugas: "${params.tugasPekerjaan}". Total Rp ${totalUpah.toLocaleString(
            "id-ID"
          )}, Potong Bon Rp ${potonganKasbon.toLocaleString("id-ID")}, Bersih Rp ${gajiBersihDibayar.toLocaleString("id-ID")}`,
          gajiBersihDibayar,
          rekSumber.kode
        );
      }
      const catatan = {
        id: idUph,
        tanggalKerja: tglKerja,
        hariTanggal: params.hariTanggal,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        divisi: params.divisi,
        divisiKode: params.divisiKode,
        kategori: params.kategori || "KELUAR",
        rekening: params.rekening || "HUTANG",
        jenisDana: params.jenisDana || "GAJI",
        item: itemNama,
        kuantiti,
        harga,
        jumlah: hitungJumlah,
        ket: params.ket || (isLangsungCair ? "LUNAS" : totalUpah === 0 ? "LUNAS" : "BON"),
        catatan: params.catatan || "",
        noInv: params.noInv,
        upahHarian: harga,
        uangMakanLembur: uangMakan,
        totalUpahHarian: totalUpah,
        keterangan: itemNama + (params.catatan ? ` (${params.catatan})` : ""),
        status: isLangsungCair ? "SUDAH_DIBAYAR" : "TERCATAT",
        idPayrollSettlement: slipGaji?.id,
        tanggalDibayar: isLangsungCair ? tglKerja : void 0,
        createdAt: iso
      };
      if (!db.upahHarian) db.upahHarian = [];
      db.upahHarian.unshift(catatan);
      if (!isLangsungCair) {
        this.addAuditLog(
          db,
          "CREATE",
          idUph,
          `Pencatatan Pekerjaan Harian [${params.divisi}] Karyawan ${kry.nama} (${kry.nik}): "${itemNama}". Hak Upah: Rp ${totalUpah.toLocaleString(
            "id-ID"
          )} (Akumulasi Berjalan)`,
          totalUpah
        );
      }
      return { catatan, slipGaji };
    });
  }
  /**
   * Update Catatan Upah Harian (Inline Spreadsheet Edit)
   */
  static async updateKerjaHarian(id, params) {
    return await dbManager.executeTransaction((db) => {
      const index = (db.upahHarian || []).findIndex((u) => u.id === id);
      if (index === -1) throw new Error("Catatan upah harian tidak ditemukan");
      const item = db.upahHarian[index];
      const kuantiti = params.kuantiti !== void 0 ? Number(params.kuantiti) : item.kuantiti ?? 1;
      const harga = params.harga !== void 0 ? Number(params.harga) : item.harga ?? item.upahHarian;
      const hitungJumlah = params.jumlah !== void 0 ? Number(params.jumlah) : kuantiti * harga;
      const updated = {
        ...item,
        ...params,
        kuantiti,
        harga,
        jumlah: hitungJumlah,
        upahHarian: harga,
        totalUpahHarian: hitungJumlah,
        status: params.ket === "LUNAS" ? "SUDAH_DIBAYAR" : hitungJumlah === 0 ? "SUDAH_DIBAYAR" : "TERCATAT"
      };
      db.upahHarian[index] = updated;
      return updated;
    });
  }
  /**
   * Hapus Baris Catatan Upah Harian
   */
  static async deleteKerjaHarian(id) {
    return await dbManager.executeTransaction((db) => {
      const index = (db.upahHarian || []).findIndex((u) => u.id === id);
      if (index === -1) throw new Error("Catatan upah harian tidak ditemukan");
      db.upahHarian.splice(index, 1);
      return true;
    });
  }
  /**
   * Rekap Master Karyawan: Hak Upah Harian Berjalan vs Bon Karyawan (Barang + Uang)
   */
  static getRekapMasterKaryawan() {
    const db = dbManager.get();
    let totalHakUpahBelumDibayar = 0;
    let totalBonKaryawan = 0;
    let karyawanDenganUpahPendingCount = 0;
    let karyawanDenganBonCount = 0;
    const items = (db.karyawan || []).map((kry) => {
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const kasbonBarang = (db.penjualan || []).filter((p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const kasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra === mitraId && k.status !== "LUNAS").reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const totalBon = kasbonBarang + kasbonUang;
      const allUpahKry = (db.upahHarian || []).filter((u) => u.idKaryawan === kry.id);
      const totalHariKerja = allUpahKry.length;
      const totalHakUpahHarian = allUpahKry.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const upahBelumDibayar = allUpahKry.filter((u) => u.status === "TERCATAT").reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const upahSudahDibayar = allUpahKry.filter((u) => u.status === "SUDAH_DIBAYAR").reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const lastJob = allUpahKry[0];
      const divisiTerakhir = lastJob ? lastJob.divisi : "Gudang Wijaya Agro";
      const saldoBersih = upahBelumDibayar - totalBon;
      let posisiStatus = "LUNAS_IMPAS";
      if (saldoBersih > 0) {
        posisiStatus = "PERUSAHAAN_BERHUTANG_UPAH";
      } else if (saldoBersih < 0) {
        posisiStatus = "KARYAWAN_BERHUTANG_BON";
      }
      totalHakUpahBelumDibayar += upahBelumDibayar;
      totalBonKaryawan += totalBon;
      if (upahBelumDibayar > 0) karyawanDenganUpahPendingCount++;
      if (totalBon > 0) karyawanDenganBonCount++;
      return {
        id: kry.id,
        nik: kry.nik,
        nama: kry.nama,
        jabatan: kry.jabatan,
        divisi: kry.divisi || kry.departemen,
        departemen: kry.departemen,
        telepon: kry.telepon,
        alamat: kry.alamat,
        status: kry.status,
        divisiTerakhir,
        standarGajiPokok: kry.gajiPokok || 0,
        tunjanganTetap: kry.tunjanganTetap,
        totalHariKerja,
        totalHakUpahHarian,
        totalUpahBelumDibayar: upahBelumDibayar,
        totalUpahSudahDibayar: upahSudahDibayar,
        totalKasbonBarang: kasbonBarang,
        totalKasbonUang: kasbonUang,
        totalBonKaryawan: totalBon,
        saldoBersih,
        posisiStatus,
        pekerjaanHarianTerakhir: lastJob?.keterangan || `Tugas di ${divisiTerakhir}`,
        tanggalKerjaTerakhir: lastJob?.tanggalKerja || kry.tanggalMasuk,
        idMitraTerkait: mitraId
      };
    });
    return {
      totalKaryawan: (db.karyawan || []).length,
      totalHakUpahBelumDibayar,
      totalBonKaryawan,
      saldoBersihPenggajian: totalHakUpahBelumDibayar - totalBonKaryawan,
      karyawanDenganUpahPendingCount,
      karyawanDenganBonCount,
      items
    };
  }
  /**
   * Detail Pekerjaan Harian Karyawan & Mutasi Bon
   */
  static getDetailHarianKaryawan(idKaryawan) {
    const rekap = this.getRekapMasterKaryawan();
    const item = rekap.items.find((k) => k.id === idKaryawan);
    if (!item) throw new Error(`Karyawan dengan ID ${idKaryawan} tidak ditemukan`);
    const db = dbManager.get();
    const mitraId = item.idMitraTerkait;
    const logHarian = (db.upahHarian || []).filter((u) => u.idKaryawan === idKaryawan);
    const riwayatGaji = (db.penggajian || []).filter((p) => p.idKaryawan === idKaryawan);
    const riwayatKasbonBarang = (db.penjualan || []).filter(
      (p) => p.idMitra === mitraId && p.metode === "KASBON"
    );
    const riwayatKasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra === mitraId);
    const riwayatBayarBon = (db.bayarBon || []).filter((b) => b.idMitra === mitraId);
    return {
      karyawan: item,
      logHarian,
      riwayatGaji,
      riwayatKasbonBarang,
      riwayatKasbonUang,
      riwayatBayarBon
    };
  }
  /**
   * Settlement / Pencairan Hak Upah Karyawan yang Berjalan & Potong Bon
   */
  static async settleHakUpahKaryawan(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) throw new Error("Karyawan tidak ditemukan");
      let pendingList = (db.upahHarian || []).filter(
        (u) => u.idKaryawan === kry.id && u.status === "TERCATAT"
      );
      if (params.upahHarianIds && params.upahHarianIds.length > 0) {
        const idSet = new Set(params.upahHarianIds);
        pendingList = pendingList.filter((u) => idSet.has(u.id));
      }
      if (pendingList.length === 0) {
        throw new Error("Tidak ada hak upah harian berjalan yang belum dibayar");
      }
      const totalUpahKotor = pendingList.reduce((sum, u) => sum + u.totalUpahHarian, 0);
      const divisi = params.divisi || pendingList[0].divisi || "Gudang Wijaya Agro";
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const outstandingKasbonBarang = (db.penjualan || []).filter((p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const outstandingKasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra === mitraId && k.status !== "LUNAS").reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;
      let potonganKasbon = 0;
      const persentase = Number(params.persentasePotongKasbon) || 0;
      if (params.nominalPotongKustom && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalUpahKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        potonganKasbon = Math.min(Math.round(totalKasbonAwal * persentase / 100), totalKasbonAwal, totalUpahKotor);
      }
      const gajiBersihDibayar = totalUpahKotor - potonganKasbon;
      const rekKode = params.rekeningSumber || _TransactionService.DIVISI_REKENING_MAP[divisi] || "KAS01";
      let rekSumber = db.rekening.find((r) => r.kode === rekKode) || db.rekening.find((r) => r.kode === "KAS01") || db.rekening[0];
      if (!this.isAnakPerusahaanRekening(rekSumber) && rekSumber.kategori !== "OPERASIONAL_DIVISI" && rekSumber.saldoSaatIni < gajiBersihDibayar) {
        throw new Error(
          `Saldo rekening ${rekSumber.nama} tidak mencukupi untuk pembayaran upah bersih Rp ${gajiBersihDibayar.toLocaleString("id-ID")}`
        );
      }
      let idBayarBonTerkait;
      if (potonganKasbon > 0) {
        let remaining = potonganKasbon;
        const alokasiList = [];
        const unpaidUang = db.kasbonUang.filter((k) => k.idMitra === mitraId && k.status !== "LUNAS");
        for (const kbu of unpaidUang) {
          if (remaining <= 0) break;
          const sisa = kbu.sisaKasbon;
          const settled = Math.min(remaining, sisa);
          kbu.sisaKasbon = sisa - settled;
          kbu.status = kbu.sisaKasbon === 0 ? "LUNAS" : "SEBAGIAN";
          alokasiList.push({
            jenis: "KASBON_UANG",
            refId: kbu.idTransaksi,
            nominalSebelum: sisa,
            nominalDibayar: settled,
            nominalSisa: kbu.sisaKasbon
          });
          remaining -= settled;
        }
        if (remaining > 0) {
          const unpaidBarang = db.penjualan.filter(
            (p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR"
          );
          for (const pj of unpaidBarang) {
            if (remaining <= 0) break;
            const sisa = pj.sisaPiutang;
            const settled = Math.min(remaining, sisa);
            pj.sisaPiutang = sisa - settled;
            if (pj.sisaPiutang === 0) pj.statusPembayaran = "LUNAS";
            alokasiList.push({
              jenis: "KASBON_BARANG",
              refId: pj.noPenjualan,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: pj.sisaPiutang
            });
            remaining -= settled;
          }
        }
        const idBYB = generateId("BYB");
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          idTransaksi: idBYB,
          tanggal,
          jam,
          idMitra: mitraId,
          namaMitra: `${kry.nama} (Karyawan)`,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: "POTONG_GAJI",
          rekeningTujuan: "POTONG_GAJI",
          isPotongGaji: true,
          alokasi: alokasiList,
          keterangan: `Potong Hak Upah Berjalan (${pendingList.length} Hari Kerja) [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso
        });
      }
      rekSumber.saldoSaatIni -= gajiBersihDibayar;
      const idPayroll = generateId("GAJI");
      const slipNomor = `SLIP/WA/${tanggal.replace(/\//g, "")}/${idPayroll.slice(-4)}`;
      const payrollRecord = {
        id: idPayroll,
        slipNomor,
        tanggal,
        jam,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisi,
        tipeGaji: "HARIAN",
        periodeBulan: `Settlement ${pendingList.length} Hari Kerja - ${tanggal}`,
        gajiPokok: totalUpahKotor,
        tunjangan: 0,
        bonus: 0,
        totalGajiKotor: totalUpahKotor,
        totalKasbonAwal,
        persentasePotongKasbon: persentase,
        potonganKasbon,
        sisaKasbonAkhir: totalKasbonAwal - potonganKasbon,
        gajiBersihDibayar,
        metodePembayaran: params.metodePembayaran || "TUNAI",
        rekeningSumber: rekSumber.kode,
        keterangan: params.keterangan || `Pencairan ${pendingList.length} Hari Kerja Karyawan ${kry.nama}`,
        idBayarBonTerkait
      };
      db.penggajian.unshift(payrollRecord);
      for (const u of pendingList) {
        u.status = "SUDAH_DIBAYAR";
        u.idPayrollSettlement = idPayroll;
        u.tanggalDibayar = tanggal;
      }
      this.addAuditLog(
        db,
        "PAYROLL",
        idPayroll,
        `Settlement Upah Karyawan ${kry.nama} (${kry.nik}) sebanyak ${pendingList.length} hari kerja. Total Upah: Rp ${totalUpahKotor.toLocaleString(
          "id-ID"
        )}, Potong Bon: Rp ${potonganKasbon.toLocaleString("id-ID")}, Bersih Dibayar: Rp ${gajiBersihDibayar.toLocaleString("id-ID")}`,
        gajiBersihDibayar,
        rekSumber.kode
      );
      return payrollRecord;
    });
  }
  /**
   * Rekapitulasi Bulanan Payroll yang Mengakumulasi Upah Harian & Bon Karyawan
   * Mendukung filter bulan, tahun, dan divisi
   */
  static getRekapBulananPayroll(params) {
    const db = dbManager.get();
    const { tanggal } = getWIBDateTime();
    const [, currentMonthStr, currentYearStr] = tanggal.split("/");
    const targetBulan = Number(params?.bulan) || Number(currentMonthStr) || 9;
    const targetTahun = Number(params?.tahun) || Number(currentYearStr) || 2026;
    const filterDivisi = params?.divisi && params.divisi !== "ALL" ? params.divisi : void 0;
    const NAMA_BULAN = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember"
    ];
    const namaBulanStr = NAMA_BULAN[targetBulan - 1] || `Bulan ${targetBulan}`;
    const periodeBulan = `${namaBulanStr} ${targetTahun}`;
    const items = [];
    let totalHariKerja = 0;
    let totalGajiKotor = 0;
    let totalPotonganBon = 0;
    let totalGajiBersihDibayar = 0;
    let totalHakUpahPending = 0;
    let totalSisaBonKaryawan = 0;
    for (const kry of db.karyawan || []) {
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const allUpahBulanIni = (db.upahHarian || []).filter((u) => {
        if (u.idKaryawan !== kry.id) return false;
        const parts = (u.tanggalKerja || "").split("/");
        if (parts.length < 3) return false;
        const m = Number(parts[1]);
        const y = Number(parts[2]);
        if (m !== targetBulan || y !== targetTahun) return false;
        if (filterDivisi && u.divisi !== filterDivisi) return false;
        return true;
      });
      const allGajiBulanIni = (db.penggajian || []).filter((g) => {
        if (g.idKaryawan !== kry.id) return false;
        if (filterDivisi && g.divisi !== filterDivisi) return false;
        const parts = (g.tanggal || "").split("/");
        if (parts.length >= 3) {
          const m = Number(parts[1]);
          const y = Number(parts[2]);
          if (m === targetBulan && y === targetTahun) return true;
        }
        return g.periodeBulan?.toLowerCase().includes(namaBulanStr.toLowerCase());
      });
      const sisaKasbonBarang = (db.penjualan || []).filter((p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const sisaKasbonUang = (db.kasbonUang || []).filter((k) => k.idMitra === mitraId && k.status !== "LUNAS").reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const sisaBonKaryawan = sisaKasbonBarang + sisaKasbonUang;
      const totalUpahPokok = allUpahBulanIni.reduce((sum, u) => sum + (u.upahHarian || 0), 0);
      const totalUangMakanLembur = allUpahBulanIni.reduce((sum, u) => sum + (u.uangMakanLembur || 0), 0);
      const gajiKotor = allUpahBulanIni.reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const hakPending = allUpahBulanIni.filter((u) => u.status === "TERCATAT").reduce((sum, u) => sum + (u.totalUpahHarian || 0), 0);
      const potongBon = allGajiBulanIni.reduce((sum, g) => sum + (g.potonganKasbon || 0), 0);
      const gajiBersihCair = allGajiBulanIni.reduce((sum, g) => sum + (g.gajiBersihDibayar || 0), 0);
      const divisiCounts = {};
      const divisiSet = /* @__PURE__ */ new Set();
      for (const u of allUpahBulanIni) {
        divisiSet.add(u.divisi);
        divisiCounts[u.divisi] = (divisiCounts[u.divisi] || 0) + 1;
      }
      let divisiUtama = "Gudang Wijaya Agro";
      let maxCount = -1;
      for (const [div, count] of Object.entries(divisiCounts)) {
        if (count > maxCount) {
          maxCount = count;
          divisiUtama = div;
        }
      }
      if (divisiSet.size === 0 && kry.departemen) {
        if (kry.departemen.includes("Toko")) divisiUtama = "CV Wijaya Agro";
        else if (kry.departemen.includes("Transport")) divisiUtama = "Wijaya Transport";
        else if (kry.departemen.includes("Pabrik") || kry.departemen.includes("Teknik")) divisiUtama = "Wijaya Karya";
      }
      const rincianHarian = allUpahBulanIni.map((u) => ({
        id: u.id,
        tanggal: u.tanggalKerja,
        hariTanggal: u.hariTanggal,
        divisi: u.divisi,
        divisiKode: u.divisiKode,
        item: u.item || u.keterangan || `Tugas di ${u.divisi}`,
        kuantiti: u.kuantiti !== void 0 ? u.kuantiti : u.totalUpahHarian > 0 ? 1 : 0,
        harga: u.harga !== void 0 ? u.harga : u.upahHarian,
        jumlah: u.jumlah !== void 0 ? u.jumlah : u.totalUpahHarian,
        ket: u.ket || (u.status === "SUDAH_DIBAYAR" ? "LUNAS" : u.totalUpahHarian === 0 ? "LUNAS" : "BON"),
        catatan: u.catatan,
        tugas: u.keterangan || u.item || `Tugas harian di ${u.divisi}`,
        upahHarian: u.upahHarian,
        uangMakanLembur: u.uangMakanLembur,
        totalUpah: u.totalUpahHarian,
        status: u.status,
        refSlipGaji: u.idPayrollSettlement,
        tanggalDibayar: u.tanggalDibayar
      }));
      rincianHarian.sort((a, b) => {
        const [da, ma, ya] = (a.tanggal || "").split("/").map(Number);
        const [db2, mb, yb] = (b.tanggal || "").split("/").map(Number);
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db2).getTime();
      });
      const kasbonBarangBulanIni = (db.penjualan || []).filter((p) => {
        if (p.idMitra !== mitraId || p.metode !== "KASBON") return false;
        const parts = (p.tanggal || "").split("/");
        const matchesMonth = parts.length >= 3 && Number(parts[1]) === targetBulan && Number(parts[2]) === targetTahun;
        return (p.sisaPiutang || 0) > 0 || matchesMonth;
      });
      const rincianBonBarang = kasbonBarangBulanIni.map((p) => ({
        noPenjualan: p.noPenjualan,
        tanggal: p.tanggal,
        jam: p.jam,
        totalNominal: p.totalNominal,
        sisaPiutang: p.sisaPiutang,
        statusPembayaran: p.statusPembayaran,
        keterangan: p.keterangan || "Kasbon barang toko saprotan",
        items: (p.items || []).map((it) => ({
          kodeProduk: it.kodeProduk,
          namaProduk: it.namaProduk,
          qty: it.qty,
          satuan: it.satuan,
          harga: it.harga,
          subtotal: it.subtotal
        }))
      }));
      const kasbonUangBulanIni = (db.kasbonUang || []).filter((k) => {
        if (k.idMitra !== mitraId) return false;
        const parts = (k.tanggal || "").split("/");
        const matchesMonth = parts.length >= 3 && Number(parts[1]) === targetBulan && Number(parts[2]) === targetTahun;
        return (k.sisaKasbon || 0) > 0 || matchesMonth;
      });
      const rincianBonUang = kasbonUangBulanIni.map((k) => ({
        idTransaksi: k.idTransaksi,
        tanggal: k.tanggal,
        jam: k.jam,
        nominal: k.nominal,
        sisaKasbon: k.sisaKasbon,
        keterangan: k.keterangan || "Kasbon pinjaman uang tunai",
        rekeningSumber: k.rekeningSumber,
        status: k.status
      }));
      const saldoBersih = hakPending - sisaBonKaryawan;
      let posisiStatus = "LUNAS_IMPAS";
      if (saldoBersih > 0) {
        posisiStatus = "PERUSAHAAN_BERHUTANG_UPAH";
      } else if (saldoBersih < 0) {
        posisiStatus = "KARYAWAN_BERHUTANG_BON";
      }
      totalHariKerja += allUpahBulanIni.length;
      totalGajiKotor += gajiKotor;
      totalPotonganBon += potongBon;
      totalGajiBersihDibayar += gajiBersihCair;
      totalHakUpahPending += hakPending;
      totalSisaBonKaryawan += sisaBonKaryawan;
      items.push({
        idKaryawan: kry.id,
        nik: kry.nik,
        nama: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisiUtama,
        daftarDivisiBekerja: Array.from(divisiSet),
        totalHariKerja: allUpahBulanIni.length,
        totalUpahPokok,
        totalUangMakanLembur,
        totalGajiKotor: gajiKotor,
        totalPotonganBon: potongBon,
        totalGajiBersihDibayar: gajiBersihCair,
        totalHakUpahPending: hakPending,
        sisaKasbonBarang,
        sisaKasbonUang,
        totalSisaBonKaryawan: sisaBonKaryawan,
        saldoBersih,
        posisiStatus,
        rincianHarian,
        rincianBonBarang,
        rincianBonUang
      });
    }
    return {
      periodeBulan,
      bulan: targetBulan,
      tahun: targetTahun,
      totalPekerja: items.length,
      totalHariKerja,
      totalGajiKotor,
      totalPotonganBon,
      totalGajiBersihDibayar,
      totalHakUpahPending,
      totalSisaBonKaryawan,
      items
    };
  }
  // ==========================================
  // PERGERAKAN ARUS KAS KEUANGAN TIAP DIVISI
  // ==========================================
  static getPergerakanKeuanganDivisi() {
    dbManager.synchronizeDivisiAccounts();
    const db = dbManager.get();
    const allDivisi = dbManager.getDivisiList();
    const norm = (s) => String(s || "").trim().toLowerCase();
    const penjualanNotaMap = /* @__PURE__ */ new Map();
    for (const p of db.penjualan || []) {
      if (p.noPenjualan && p.divisi) {
        const ringkas = (p.items || []).map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`).join(", ");
        penjualanNotaMap.set(p.noPenjualan, {
          divisiNorm: norm(p.divisi),
          label: ringkas || p.noPenjualan
        });
      }
    }
    for (const j of db.penjualanHasilBumi || []) {
      if (j.noPenjualan && j.divisi) {
        penjualanNotaMap.set(j.noPenjualan, {
          divisiNorm: norm(j.divisi),
          label: `${j.komoditasNama} (${j.beratBersih.toLocaleString("id-ID")} Kg)`
        });
      }
    }
    return allDivisi.map((div) => {
      const targetNorm = norm(div.nama);
      const rek = db.rekening.find((r) => r.kode === div.kodeRekening) || {
        kode: div.kodeRekening,
        nama: `Buku Arus Kas ${div.nama}`,
        atasNama: `Divisi ${div.nama}`,
        nomorRekening: div.id,
        saldoAwal: 0,
        saldoSaatIni: 0,
        status: "AKTIF"
      };
      const penjualanTokoList = (db.penjualan || []).filter(
        (p) => p.divisi && norm(p.divisi) === targetNorm && (p.metode === "TUNAI" || p.metode === "TRANSFER") && (p.totalNominal || 0) > 0
      );
      const penjualanHasilBumiList = (db.penjualanHasilBumi || []).filter(
        (j) => j.divisi && norm(j.divisi) === targetNorm && (j.metodePembayaran === "TUNAI" || j.metodePembayaran === "TRANSFER") && (j.totalNominal || 0) > 0
      );
      let totalPelunasanBonBarang = 0;
      const pelunasanBonEntries = [];
      for (const b of db.bayarBon || []) {
        if (b.metode !== "TUNAI" && b.metode !== "TRANSFER") continue;
        if (b.isKompensasiTitipan || b.isPotongGaji) continue;
        for (const alok of b.alokasi || []) {
          if (alok.jenis === "KASBON_BARANG" && (alok.nominalDibayar || 0) > 0) {
            const notaInfo = penjualanNotaMap.get(alok.refId);
            if (notaInfo && notaInfo.divisiNorm === targetNorm) {
              const nom = Number(alok.nominalDibayar) || 0;
              totalPelunasanBonBarang += nom;
              pelunasanBonEntries.push({
                id: `${b.idTransaksi}-${alok.refId}`,
                tanggal: b.tanggal,
                jam: b.jam,
                nominal: nom,
                keterangan: `Pelunasan Piutang Penjualan (${alok.refId}: ${notaInfo.label})`,
                refId: b.idTransaksi,
                pihakTerkait: b.namaMitra,
                rekeningFisik: b.rekeningTujuan || (b.metode === "TUNAI" ? "KAS01" : b.metode),
                createdAt: b.createdAt
              });
            }
          }
        }
      }
      const totalPenjualanMasuk = penjualanTokoList.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0) + penjualanHasilBumiList.reduce((sum, j) => sum + (Number(j.totalNominal) || 0), 0) + totalPelunasanBonBarang;
      const pembelianBarangList = (db.pembelianBarang || []).filter(
        (pb) => pb.divisi && norm(pb.divisi) === targetNorm && (pb.metodePembayaran === "TUNAI" || pb.metodePembayaran === "TRANSFER") && (pb.totalNominal || 0) > 0
      );
      const pembelianHasilBumiList = (db.pembelianHasilBumi || []).filter(
        (phb) => phb.divisi && norm(phb.divisi) === targetNorm && phb.komoditasKode !== "PINJAMAN_DANA" && phb.komoditasKode !== "TITIP_DANA" && !String(phb.komoditasNama || "").toLowerCase().includes("pinjaman uang") && !phb.isBelumPutusHarga && (phb.metodePembayaran === "TUNAI" || phb.metodePembayaran === "TRANSFER") && phb.rekeningSumber !== "TIT01" && phb.rekeningSumber !== "BON01" && (phb.totalNominal || 0) > 0
      );
      const totalPembelianKeluar = pembelianBarangList.reduce((sum, pb) => sum + (Number(pb.totalNominal) || 0), 0) + pembelianHasilBumiList.reduce((sum, phb) => sum + (Number(phb.totalNominal) || 0), 0);
      const transferMasuk = (db.transferRekening || []).filter(
        (t) => t.rekeningTujuan === div.kodeRekening && t.status === "BERHASIL"
      );
      const totalDroppingMasuk = transferMasuk.reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);
      const transferKeluar = (db.transferRekening || []).filter(
        (t) => t.rekeningSumber === div.kodeRekening && t.status === "BERHASIL"
      );
      const totalTransferKeluar = transferKeluar.reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);
      const gajiList = (db.penggajian || []).filter(
        (g) => g.divisi ? norm(g.divisi) === targetNorm : g.rekeningSumber === div.kodeRekening
      );
      const totalGajiKeluar = gajiList.reduce((sum, g) => sum + (Number(g.gajiBersihDibayar) || 0), 0);
      const pengeluaranList = (db.pengeluaran || []).filter(
        (p) => p.divisi ? norm(p.divisi) === targetNorm : p.rekeningSumber === div.kodeRekening
      );
      const totalPengeluaranOperasional = pengeluaranList.reduce(
        (sum, p) => sum + (Number(p.nominal) || 0),
        0
      );
      const rawMutasi = [];
      for (const p of penjualanTokoList) {
        const ringkasItem = (p.items || []).map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`).join(", ");
        rawMutasi.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          jenis: "PENJUALAN_MASUK",
          keterangan: `Penjualan Kasir: ${ringkasItem || "Barang Dagang"}${p.keterangan ? ` \u2014 ${p.keterangan}` : ""}`,
          masuk: Number(p.totalNominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: p.noPenjualan,
          pihakTerkait: p.namaMitra,
          rekeningFisik: p.rekeningTujuan || (p.metode === "TUNAI" ? "KAS01" : p.metode),
          _sortIso: p.createdAt
        });
      }
      for (const j of penjualanHasilBumiList) {
        rawMutasi.push({
          id: j.noPenjualan,
          tanggal: j.tanggal,
          jam: j.jam,
          jenis: "PENJUALAN_MASUK",
          keterangan: `Penjualan Hasil Bumi: ${j.komoditasNama} (${j.beratBersih.toLocaleString("id-ID")} Kg @ Rp ${j.hargaJualPerKg.toLocaleString("id-ID")}/Kg)`,
          masuk: Number(j.totalNominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: j.noPenjualan,
          pihakTerkait: j.namaMitra,
          rekeningFisik: j.rekeningTujuan || (j.metodePembayaran === "TUNAI" ? "KAS01" : j.metodePembayaran),
          _sortIso: j.createdAt
        });
      }
      for (const pbEntry of pelunasanBonEntries) {
        rawMutasi.push({
          id: pbEntry.id,
          tanggal: pbEntry.tanggal,
          jam: pbEntry.jam,
          jenis: "PENJUALAN_MASUK",
          keterangan: pbEntry.keterangan,
          masuk: pbEntry.nominal,
          keluar: 0,
          saldoSetelah: 0,
          refId: pbEntry.refId,
          pihakTerkait: pbEntry.pihakTerkait,
          rekeningFisik: pbEntry.rekeningFisik,
          _sortIso: pbEntry.createdAt
        });
      }
      for (const pb of pembelianBarangList) {
        const ringkasItem = (pb.items || []).map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`).join(", ");
        rawMutasi.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          jenis: "PEMBELIAN_KELUAR",
          keterangan: `Kulakan Barang: ${ringkasItem || "Barang Dagang"}`,
          masuk: 0,
          keluar: Number(pb.totalNominal) || 0,
          saldoSetelah: 0,
          refId: pb.noPembelian,
          pihakTerkait: pb.namaMitra,
          rekeningFisik: pb.rekeningSumber || (pb.metodePembayaran === "TUNAI" ? "KAS01" : pb.metodePembayaran),
          _sortIso: pb.createdAt
        });
      }
      for (const phb of pembelianHasilBumiList) {
        rawMutasi.push({
          id: phb.noPembelian,
          tanggal: phb.tanggal,
          jam: phb.jam,
          jenis: "PEMBELIAN_KELUAR",
          keterangan: `Pembelian Hasil Bumi: ${phb.komoditasNama} (${phb.beratBersih.toLocaleString("id-ID")} Kg @ Rp ${(phb.hargaPerKg || 0).toLocaleString("id-ID")}/Kg)`,
          masuk: 0,
          keluar: Number(phb.totalNominal) || 0,
          saldoSetelah: 0,
          refId: phb.noPembelian,
          pihakTerkait: phb.namaMitra,
          rekeningFisik: phb.rekeningSumber || (phb.metodePembayaran === "TUNAI" ? "KAS01" : phb.metodePembayaran),
          _sortIso: phb.createdAt
        });
      }
      for (const t of transferMasuk) {
        const dariRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
        rawMutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: "DROPPING_MASUK",
          keterangan: `Dropping Kas dari ${dariRek ? dariRek.nama : t.rekeningSumber} (${t.keterangan || "Operasional"})`,
          masuk: Number(t.nominal) || 0,
          keluar: 0,
          saldoSetelah: 0,
          refId: t.noTransfer,
          pihakTerkait: dariRek ? dariRek.nama : t.rekeningSumber,
          rekeningFisik: t.rekeningSumber,
          _sortIso: t.createdAt
        });
      }
      for (const t of transferKeluar) {
        const keRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
        rawMutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: "TRANSFER_KELUAR",
          keterangan: `Transfer Keluar ke ${keRek ? keRek.nama : t.rekeningTujuan} (${t.keterangan || "Internal"})`,
          masuk: 0,
          keluar: Number(t.nominal) || 0,
          saldoSetelah: 0,
          refId: t.noTransfer,
          pihakTerkait: keRek ? keRek.nama : t.rekeningTujuan,
          rekeningFisik: t.rekeningTujuan,
          _sortIso: t.createdAt
        });
      }
      for (const g of gajiList) {
        rawMutasi.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          jenis: "GAJI_KARYAWAN",
          keterangan: `Upah Karyawan: ${g.namaKaryawan} (${g.tipeGaji || "Harian"}) - Kotor: Rp ${g.totalGajiKotor.toLocaleString("id-ID")}${g.potonganKasbon > 0 ? `, Potong Bon: Rp ${g.potonganKasbon.toLocaleString("id-ID")}` : ""}`,
          masuk: 0,
          keluar: Number(g.gajiBersihDibayar) || 0,
          saldoSetelah: 0,
          refId: g.slipNomor,
          karyawanTerkait: g.namaKaryawan,
          pihakTerkait: g.namaKaryawan,
          rekeningFisik: g.rekeningSumber
        });
      }
      for (const p of pengeluaranList) {
        rawMutasi.push({
          id: p.idTransaksi,
          tanggal: p.tanggal,
          jam: p.jam,
          jenis: "PENGELUARAN_OPERASIONAL",
          keterangan: `Biaya Operasional (${p.kategori}): ${p.keterangan}${p.penerima ? ` \u2014 Penerima: ${p.penerima}` : ""}`,
          masuk: 0,
          keluar: Number(p.nominal) || 0,
          saldoSetelah: 0,
          refId: p.idTransaksi,
          pihakTerkait: p.penerima || p.kategori,
          rekeningFisik: p.rekeningSumber,
          _sortIso: p.createdAt
        });
      }
      rawMutasi.sort((a, b) => {
        const [da, ma, ya] = (a.tanggal || "").split("/").map(Number);
        const [dbD, mb, yb] = (b.tanggal || "").split("/").map(Number);
        const dateA = new Date(ya || 2026, (ma || 1) - 1, da || 1).getTime();
        const dateB = new Date(yb || 2026, (mb || 1) - 1, dbD || 1).getTime();
        if (dateA !== dateB) return dateA - dateB;
        const jamCmp = (a.jam || "").localeCompare(b.jam || "");
        if (jamCmp !== 0) return jamCmp;
        return (a._sortIso || "").localeCompare(b._sortIso || "");
      });
      let runningSaldo = Number(rek.saldoAwal) || 0;
      const mutasiWithSaldo = rawMutasi.map((item) => {
        runningSaldo = Math.round(runningSaldo + (item.masuk || 0) - (item.keluar || 0));
        const { _sortIso: _unused, ...clean } = item;
        return {
          ...clean,
          saldoSetelah: runningSaldo
        };
      });
      mutasiWithSaldo.reverse();
      const karyawanSet = /* @__PURE__ */ new Set();
      gajiList.forEach((g) => karyawanSet.add(g.namaKaryawan));
      const totalArusMasuk = totalPenjualanMasuk + totalDroppingMasuk;
      const totalArusKeluar = totalPembelianKeluar + totalPengeluaranOperasional + totalGajiKeluar + totalTransferKeluar;
      return {
        divisi: div.nama,
        idDivisi: div.id,
        kodeRekening: div.kodeRekening,
        namaRekening: rek.nama,
        saldoSaatIni: rek.saldoSaatIni,
        totalPenjualanMasuk,
        totalPembelianKeluar,
        totalPengeluaranOperasional,
        totalDroppingMasuk,
        totalGajiKeluar,
        totalTransferKeluar,
        totalArusMasuk,
        totalArusKeluar,
        totalTransaksiGaji: mutasiWithSaldo.length,
        daftarKaryawanTerakhir: Array.from(karyawanSet).slice(0, 5),
        mutasi: mutasiWithSaldo
      };
    });
  }
  // ==========================================
  // 6. REKENING KORAN MITRA (STATEMENT)
  // ==========================================
  static getRekeningKoranMitra(idMitra) {
    const db = dbManager.get();
    const mitra = db.mitra.find((m) => m.id === idMitra);
    if (!mitra) throw new Error("Mitra tidak ditemukan");
    const kasbonBarangList = db.penjualan.filter((p) => p.idMitra === mitra.id && p.metode === "KASBON");
    const piutangHasilBumiList = (db.penjualanHasilBumi || []).filter(
      (j) => j.idMitra === mitra.id && j.metodePembayaran === "PIUTANG"
    );
    const totalKasbonBarang = kasbonBarangList.reduce((s, p) => s + (p.sisaPiutang || 0), 0) + piutangHasilBumiList.reduce((s, j) => s + (j.sisaPiutang || 0), 0);
    const kasbonUangList = db.kasbonUang.filter((k) => k.idMitra === mitra.id);
    const totalKasbonUang = kasbonUangList.reduce((s, k) => s + (k.sisaKasbon || 0), 0);
    const titipHasilBumiKotor = db.pembelianHasilBumi.filter((p) => p.idMitra === mitra.id && p.metodePembayaran === "TITIP").reduce((s, p) => s + p.totalNominal, 0);
    const hutangKulakanKotor = (db.pembelianBarang || []).filter((pb) => pb.idMitra === mitra.id && pb.metodePembayaran === "HUTANG" && pb.status !== "LUNAS").reduce((s, pb) => s + (pb.totalNominal || 0), 0);
    const titipKotor = titipHasilBumiKotor + hutangKulakanKotor;
    const totalPencairanMitra = (db.pencairanTitipan || []).filter((pt) => pt.idMitra === mitra.id).reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const totalTitip = Math.max(0, titipKotor - totalPencairanMitra);
    const bayarBonList = db.bayarBon.filter((b) => b.idMitra === mitra.id);
    const totalPembayaranBon = bayarBonList.reduce((s, b) => s + b.nominalBayar, 0);
    const totalBonKeseluruhan = totalKasbonBarang + totalKasbonUang;
    const sisaBon = totalBonKeseluruhan;
    const timeline = [];
    for (const p of db.penjualan.filter((item) => item.idMitra === mitra.id)) {
      const totalQty = p.items.reduce((s, i) => s + i.qty, 0);
      let qtyDisplay = "";
      let hargaSatuanDisplay = "";
      if (p.items.length === 1) {
        qtyDisplay = `${p.items[0].qty} ${p.items[0].satuan}`;
        hargaSatuanDisplay = `Rp ${p.items[0].harga.toLocaleString("id-ID")}`;
      } else if (p.items.length > 1) {
        qtyDisplay = `${totalQty} unit (${p.items.length} macam)`;
        hargaSatuanDisplay = `Ragam (@ Rp ${Math.round(p.totalNominal / (totalQty || 1)).toLocaleString("id-ID")})`;
      } else {
        qtyDisplay = "-";
        hargaSatuanDisplay = "-";
      }
      const itemsDetail = p.items.map((i) => ({
        nama: i.namaProduk,
        qty: i.qty,
        satuan: i.satuan,
        harga: i.harga,
        subtotal: i.subtotal
      }));
      const rincianText = p.items.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan} @ Rp ${i.harga.toLocaleString("id-ID")})`).join(", ");
      if (p.metode === "KASBON") {
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis: "PENJUALAN KASBON",
          keterangan: `Kasbon Barang: ${rincianText}`,
          qtyDisplay,
          hargaSatuanDisplay,
          itemsDetail,
          debet: p.totalNominal,
          kredit: 0
        });
      } else {
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis: `PENJUALAN ${p.metode}`,
          keterangan: `Penjualan Lunas (${p.metode}) via ${p.rekeningTujuan}: ${rincianText}`,
          qtyDisplay,
          hargaSatuanDisplay,
          itemsDetail,
          debet: 0,
          kredit: 0
        });
      }
    }
    for (const jhb of (db.penjualanHasilBumi || []).filter((item) => item.idMitra === mitra.id)) {
      const isPiutang = jhb.metodePembayaran === "PIUTANG";
      timeline.push({
        id: jhb.noPenjualan,
        tanggal: jhb.tanggal,
        jam: jhb.jam,
        createdAt: jhb.createdAt,
        jenis: isPiutang ? "PIUTANG JUAL HASIL BUMI" : `JUAL HASIL BUMI (${jhb.metodePembayaran})`,
        keterangan: isPiutang ? `Piutang Penjualan Hasil Bumi ${jhb.komoditasNama} (${jhb.beratBersih} Kg @ Rp ${jhb.hargaJualPerKg.toLocaleString("id-ID")})` : `Penjualan Hasil Bumi Lunas (${jhb.metodePembayaran}) via ${jhb.rekeningTujuan}: ${jhb.komoditasNama} (${jhb.beratBersih} Kg)`,
        qtyDisplay: `${jhb.beratBersih.toLocaleString("id-ID")} Kg`,
        hargaSatuanDisplay: `Rp ${jhb.hargaJualPerKg.toLocaleString("id-ID")}`,
        itemsDetail: [
          {
            nama: `Hasil Bumi: ${jhb.komoditasNama}`,
            qty: jhb.beratBersih,
            satuan: "Kg",
            harga: jhb.hargaJualPerKg,
            subtotal: jhb.totalNominal
          }
        ],
        debet: isPiutang ? jhb.totalNominal : 0,
        kredit: 0
      });
    }
    for (const k of kasbonUangList) {
      const isNotaLalu = k.isNotaLalu || k.keterangan?.includes("Nota Lalu") || k.rekeningSumber === "BON01";
      const noNotaLabel = k.noNotaLalu ? ` [No. Nota: ${k.noNotaLalu}]` : "";
      const fotoK = k.fotoNotaList && k.fotoNotaList.length > 0 ? k.fotoNotaList.join("|||") : k.fotoNota || "";
      timeline.push({
        id: k.idTransaksi,
        tanggal: k.tanggalNotaLalu || k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        jenis: isNotaLalu ? "NOTA LALU (PIUTANG BARANG)" : "KASBON UANG",
        keterangan: isNotaLalu ? `${k.keterangan || "Piutang Nota Barang Masa Lalu"}${noNotaLabel}` : `Penerimaan Kasbon Uang via ${k.metode} (${k.rekeningSumber}) - ${k.keterangan}`,
        qtyDisplay: "1",
        hargaSatuanDisplay: `Rp ${k.nominal.toLocaleString("id-ID")}`,
        itemsDetail: [
          {
            nama: isNotaLalu ? `Piutang Barang Nota Lalu (${k.noNotaLalu || "Nota Lama"})` : `Kasbon Uang Pinjaman (${k.metode})`,
            qty: 1,
            satuan: "Trx",
            harga: k.nominal,
            subtotal: k.nominal
          }
        ],
        debet: k.nominal,
        kredit: 0,
        fotoNota: fotoK,
        isNotaLalu,
        noNotaLalu: k.noNotaLalu
      });
    }
    for (const b of bayarBonList) {
      const isSinkronBon = b.metode === "SINKRON" || b.metode === "KOMPENSASI_TITIP" || b.rekeningTujuan === "SINKRON" || Boolean(b.isKompensasiTitipan);
      timeline.push({
        id: b.idTransaksi,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        jenis: isSinkronBon ? "PELUNASAN BON (SINKRON POTONG TITIPAN)" : "PEMBAYARAN BON",
        keterangan: isSinkronBon ? `Pelunasan Bon via Rekening SINKRON (Potong Saldo Titipan / Uang Hasil Bumi \u2014 Tanpa Uang Fisik) - ${b.keterangan}` : `Setoran Bayar Bon via ${b.metode} (${b.rekeningTujuan}) - ${b.keterangan}`,
        qtyDisplay: "1",
        hargaSatuanDisplay: `Rp ${b.nominalBayar.toLocaleString("id-ID")}`,
        itemsDetail: [
          {
            nama: isSinkronBon ? "Pelunasan Bon via SINKRON (Potong Titipan Hasil Bumi)" : `Setoran Pelunasan Bon (${b.metode})`,
            qty: 1,
            satuan: isSinkronBon ? "Sinkron" : "Setoran",
            harga: b.nominalBayar,
            subtotal: b.nominalBayar
          }
        ],
        debet: 0,
        kredit: b.nominalBayar,
        fotoNota: b.fotoBukti || b.fotoNota
      });
    }
    for (const pb of db.pembelianHasilBumi.filter((item) => item.idMitra === mitra.id)) {
      const fotoPb = pb.fotoNotaList && pb.fotoNotaList.length > 0 ? pb.fotoNotaList.join("|||") : pb.fotoNota || "";
      if (pb.metodePembayaran === "TITIP") {
        const isPinjaman = pb.komoditasKode === "PINJAMAN_DANA" || pb.komoditasNama?.includes("Pinjaman Uang");
        const isNotaLalu = pb.isNotaLalu || pb.keterangan?.includes("Nota Lalu") || pb.komoditasKode === "TITIP_DANA";
        const noNotaLabel = pb.noNotaLalu ? ` [No. Nota: ${pb.noNotaLalu}]` : "";
        const jenisLabel = isPinjaman ? "PINJAMAN UANG PT KE MITRA (SALDO TITIP)" : isNotaLalu ? "NOTA LALU (TITIPAN UANG/PANEN)" : "TITIP HASIL BUMI";
        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggalNotaLalu || pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: jenisLabel,
          keterangan: isPinjaman ? `${pb.keterangan || "Pinjaman Uang dari PT ke Mitra (Masuk Saldo Titip)"}${noNotaLabel}` : isNotaLalu ? `${pb.keterangan || "Titipan Dana / Panen Masa Lalu"}${noNotaLabel}` : `Penjualan Hasil Bumi ${pb.komoditasNama} ${pb.beratBersih} kg (Titip/Hutang Pabrik)`,
          qtyDisplay: isPinjaman ? "Dana Tunai" : pb.beratBersih > 0 ? `${pb.beratBersih.toLocaleString("id-ID")} Kg` : "1 (Dana)",
          hargaSatuanDisplay: `Rp ${pb.totalNominal.toLocaleString("id-ID")}`,
          itemsDetail: [
            {
              nama: isPinjaman ? `Pinjaman Uang dari PT ke Mitra (Masuk Saldo Titip)` : isNotaLalu ? `Titipan Uang / Panen Nota Lalu (${pb.noNotaLalu || "Nota Titip Lama"})` : `Hasil Panen: ${pb.komoditasNama}`,
              qty: 1,
              satuan: isPinjaman ? "Dana" : pb.beratBersih > 0 ? "Kg" : "Titip",
              harga: pb.totalNominal,
              subtotal: pb.totalNominal
            }
          ],
          debet: 0,
          kredit: 0,
          fotoNota: fotoPb,
          isNotaLalu: isPinjaman ? true : isNotaLalu,
          noNotaLalu: pb.noNotaLalu
        });
      } else {
        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: `BELI HASIL BUMI (${pb.metodePembayaran})`,
          keterangan: `Pembelian Lunas ${pb.komoditasNama} ${pb.beratBersih} kg via ${pb.rekeningSumber}`,
          qtyDisplay: `${pb.beratBersih.toLocaleString("id-ID")} Kg`,
          hargaSatuanDisplay: `Rp ${(pb.hargaPerKg || 0).toLocaleString("id-ID")}`,
          itemsDetail: [
            {
              nama: `Hasil Bumi Lunas: ${pb.komoditasNama}`,
              qty: pb.beratBersih,
              satuan: "Kg",
              harga: pb.hargaPerKg || 0,
              subtotal: pb.totalNominal
            }
          ],
          debet: 0,
          kredit: 0,
          fotoNota: fotoPb
        });
      }
    }
    for (const kpb of (db.pembelianBarang || []).filter((item) => item.idMitra === mitra.id)) {
      const totalQty = (kpb.items || []).reduce((s, i) => s + i.qty, 0);
      const rincianKulakan = (kpb.items || []).map((i) => `${i.namaProduk} (${i.qty} ${i.satuan} @ Rp ${i.hargaBeliSatuan.toLocaleString("id-ID")})`).join(", ");
      const isHutang = kpb.metodePembayaran === "HUTANG";
      timeline.push({
        id: kpb.noPembelian,
        tanggal: kpb.tanggal,
        jam: kpb.jam,
        createdAt: kpb.createdAt,
        jenis: isHutang ? "HUTANG KULAKAN SUPPLIER (SALDO TITIP)" : `KULAKAN SUPPLIER (${kpb.metodePembayaran})`,
        keterangan: isHutang ? `Hutang Pembelian Barang dari Supplier: ${rincianKulakan || kpb.keterangan}` : `Kulakan Lunas (${kpb.metodePembayaran}) via ${kpb.rekeningSumber}: ${rincianKulakan || kpb.keterangan}`,
        qtyDisplay: kpb.items?.length === 1 ? `${kpb.items[0].qty} ${kpb.items[0].satuan}` : `${totalQty} unit (${kpb.items?.length || 0} item)`,
        hargaSatuanDisplay: `Rp ${kpb.totalNominal.toLocaleString("id-ID")}`,
        itemsDetail: (kpb.items || []).map((i) => ({
          nama: i.namaProduk,
          qty: i.qty,
          satuan: i.satuan,
          harga: i.hargaBeliSatuan,
          subtotal: i.subtotal
        })),
        debet: 0,
        kredit: 0,
        fotoNota: kpb.fotoNota || ""
      });
    }
    for (const pt of (db.pencairanTitipan || []).filter((item) => item.idMitra === mitra.id)) {
      const isSinkronTitip = pt.metodePembayaran === "SINKRON" || pt.metodePembayaran === "KOMPENSASI_BON" || pt.rekeningSumber === "SINKRON" || Boolean(pt.isKompensasiBon);
      timeline.push({
        id: pt.idPencairan,
        tanggal: pt.tanggal,
        jam: pt.jam,
        createdAt: pt.createdAt,
        jenis: isSinkronTitip ? "POTONG TITIPAN (SINKRON PELUNASAN BON)" : "PENCAIRAN TITIPAN",
        keterangan: isSinkronTitip ? `Pemotongan Saldo Titipan / Uang Hasil Bumi via Rekening SINKRON untuk Pelunasan Bon - ${pt.keterangan}` : `Pencairan Saldo Titip via ${pt.metodePembayaran} (${pt.rekeningSumber}) - ${pt.keterangan}`,
        qtyDisplay: "1",
        hargaSatuanDisplay: `Rp ${pt.nominalPencairan.toLocaleString("id-ID")}`,
        itemsDetail: [
          {
            nama: isSinkronTitip ? "Potong Saldo Titipan / Uang Hasil Bumi (SINKRON Bon)" : "Pencairan / Penarikan Saldo Titip Mitra",
            qty: 1,
            satuan: isSinkronTitip ? "Sinkron" : "Pencairan",
            harga: pt.nominalPencairan,
            subtotal: pt.nominalPencairan
          }
        ],
        debet: 0,
        kredit: 0
      });
    }
    const linkedRek = mitra.kodeRekeningTerkait && db.rekening.find((r) => r.kode === mitra.kodeRekeningTerkait) || db.rekening.find((r) => r.idMitraTerkait === mitra.id && this.isAnakPerusahaanRekening(r));
    const isAnakPerusahaan = Boolean(mitra.isAnakPerusahaan || mitra.role === "ANAK_PERUSAHAAN" || linkedRek);
    let totalSimpanKeAnakPerusahaan = 0;
    let totalPakaiDariAnakPerusahaan = 0;
    if (isAnakPerusahaan && linkedRek) {
      const rekKode = linkedRek.kode;
      const seenIds = new Set(timeline.map((item) => item.id));
      if ((linkedRek.saldoAwal || 0) !== 0) {
        const awalAbs = Math.abs(linkedRek.saldoAwal);
        if (linkedRek.saldoAwal > 0) {
          totalSimpanKeAnakPerusahaan += linkedRek.saldoAwal;
        } else {
          totalPakaiDariAnakPerusahaan += awalAbs;
        }
        timeline.push({
          id: `SALDO-AWAL-${rekKode}`,
          tanggal: "01/01/2026",
          jam: "00:00:00",
          createdAt: "2026-01-01T00:00:00.000Z",
          jenis: linkedRek.saldoAwal >= 0 ? "SALDO AWAL ANAK PERUSAHAAN (+)" : "SALDO AWAL TALANGAN ANAK PERUSAHAAN (-)",
          keterangan: `Saldo awal buku rekening Anak Perusahaan ${linkedRek.nama} (${rekKode})`,
          qtyDisplay: "Saldo Awal",
          hargaSatuanDisplay: `Rp ${awalAbs.toLocaleString("id-ID")}`,
          itemsDetail: [
            {
              nama: `Saldo Awal Rekening ${linkedRek.nama} (${rekKode})`,
              qty: 1,
              satuan: "Buku",
              harga: awalAbs,
              subtotal: awalAbs
            }
          ],
          debet: 0,
          kredit: 0
        });
      }
      for (const trf of db.transferRekening || []) {
        if (trf.status !== "BERHASIL") continue;
        if (trf.rekeningTujuan === rekKode) {
          totalSimpanKeAnakPerusahaan += trf.nominal;
          if (!seenIds.has(trf.noTransfer)) {
            seenIds.add(trf.noTransfer);
            const dariRek = db.rekening.find((r) => r.kode === trf.rekeningSumber);
            timeline.push({
              id: trf.noTransfer,
              tanggal: trf.tanggal,
              jam: trf.jam,
              createdAt: trf.createdAt,
              jenis: "SIMPAN DANA KE ANAK PERUSAHAAN",
              keterangan: `Simpan / Titip Dana PT dari ${dariRek?.nama || trf.rekeningSumber} (${trf.rekeningSumber}) ke ${linkedRek.nama} \u2014 ${trf.keterangan || "1 Transaksi Terpadu"}`,
              qtyDisplay: "1 Mutasi",
              hargaSatuanDisplay: `Rp ${trf.nominal.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `Simpan Dana PT ke ${linkedRek.nama} (Dari ${trf.rekeningSumber})`,
                  qty: 1,
                  satuan: "Mutasi",
                  harga: trf.nominal,
                  subtotal: trf.nominal
                }
              ],
              debet: 0,
              kredit: 0
            });
          }
        } else if (trf.rekeningSumber === rekKode) {
          totalPakaiDariAnakPerusahaan += trf.nominal;
          if (!seenIds.has(trf.noTransfer)) {
            seenIds.add(trf.noTransfer);
            const keRek = db.rekening.find((r) => r.kode === trf.rekeningTujuan);
            timeline.push({
              id: trf.noTransfer,
              tanggal: trf.tanggal,
              jam: trf.jam,
              createdAt: trf.createdAt,
              jenis: "TARIK / TALANGAN DARI ANAK PERUSAHAAN",
              keterangan: `Tarik / Talangan Dana dari ${linkedRek.nama} (${rekKode}) ke ${keRek?.nama || trf.rekeningTujuan} \u2014 ${trf.keterangan || "1 Transaksi Terpadu"}`,
              qtyDisplay: "1 Mutasi",
              hargaSatuanDisplay: `Rp ${trf.nominal.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `Tarik / Talangan Dana dari ${linkedRek.nama} (Ke ${trf.rekeningTujuan})`,
                  qty: 1,
                  satuan: "Mutasi",
                  harga: trf.nominal,
                  subtotal: trf.nominal
                }
              ],
              debet: 0,
              kredit: 0
            });
          }
        }
      }
      for (const pj of db.penjualan || []) {
        if (pj.rekeningTujuan === rekKode && pj.metode !== "KASBON") {
          totalSimpanKeAnakPerusahaan += pj.totalNominal;
          if (!seenIds.has(pj.noPenjualan)) {
            seenIds.add(pj.noPenjualan);
            const rincian = (pj.items || []).map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(", ");
            timeline.push({
              id: pj.noPenjualan,
              tanggal: pj.tanggal,
              jam: pj.jam,
              createdAt: pj.createdAt,
              jenis: "SETORAN PENJUALAN KE ANAK PERUSAHAAN",
              keterangan: `Uang penjualan toko (${pj.namaMitra}) disimpan di ${linkedRek.nama}: ${rincian}`,
              qtyDisplay: "1 Nota",
              hargaSatuanDisplay: `Rp ${pj.totalNominal.toLocaleString("id-ID")}`,
              itemsDetail: (pj.items || []).map((i) => ({
                nama: i.namaProduk,
                qty: i.qty,
                satuan: i.satuan,
                harga: i.harga,
                subtotal: i.subtotal
              })),
              debet: 0,
              kredit: 0
            });
          }
        }
      }
      for (const bb of db.bayarBon || []) {
        if (bb.rekeningTujuan === rekKode) {
          totalSimpanKeAnakPerusahaan += bb.nominalBayar;
          if (!seenIds.has(bb.idTransaksi)) {
            seenIds.add(bb.idTransaksi);
            timeline.push({
              id: bb.idTransaksi,
              tanggal: bb.tanggal,
              jam: bb.jam,
              createdAt: bb.createdAt,
              jenis: "SETORAN BAYAR BON KE ANAK PERUSAHAAN",
              keterangan: `Setoran pelunasan bon ${bb.namaMitra} disimpan di ${linkedRek.nama} \u2014 ${bb.keterangan}`,
              qtyDisplay: "1 Setoran",
              hargaSatuanDisplay: `Rp ${bb.nominalBayar.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `Setoran Bayar Bon ${bb.namaMitra} ke ${linkedRek.nama}`,
                  qty: 1,
                  satuan: "Setoran",
                  harga: bb.nominalBayar,
                  subtotal: bb.nominalBayar
                }
              ],
              debet: 0,
              kredit: 0,
              fotoNota: bb.fotoBukti || bb.fotoNota
            });
          }
        }
      }
      for (const pb of db.pembelianHasilBumi || []) {
        if (pb.rekeningSumber === rekKode) {
          const isPinjaman = pb.komoditasKode === "PINJAMAN_DANA" || pb.komoditasNama?.includes("Pinjaman Uang");
          if (isPinjaman) {
            totalSimpanKeAnakPerusahaan += pb.totalNominal;
          } else if (pb.metodePembayaran !== "TITIP") {
            totalPakaiDariAnakPerusahaan += pb.totalNominal;
          }
          if (!seenIds.has(pb.noPembelian)) {
            seenIds.add(pb.noPembelian);
            timeline.push({
              id: pb.noPembelian,
              tanggal: pb.tanggal,
              jam: pb.jam,
              createdAt: pb.createdAt,
              jenis: isPinjaman ? "TERIMA PINJAMAN DANA DI ANAK PERUSAHAAN" : "BAYAR HASIL BUMI VIA ANAK PERUSAHAAN",
              keterangan: isPinjaman ? `Dana pinjaman dari ${pb.namaMitra} diterima di ${linkedRek.nama}` : `Pembayaran hasil bumi ${pb.komoditasNama} (${pb.beratBersih} kg - ${pb.namaMitra}) via dana ${linkedRek.nama}`,
              qtyDisplay: pb.beratBersih > 0 ? `${pb.beratBersih.toLocaleString("id-ID")} Kg` : "1 Trx",
              hargaSatuanDisplay: `Rp ${pb.totalNominal.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: isPinjaman ? `Pinjaman Dana (${pb.namaMitra})` : `${pb.komoditasNama} (${pb.namaMitra})`,
                  qty: pb.beratBersih > 0 ? pb.beratBersih : 1,
                  satuan: pb.beratBersih > 0 ? "Kg" : "Trx",
                  harga: pb.beratBersih > 0 ? pb.hargaPerKg : pb.totalNominal,
                  subtotal: pb.totalNominal
                }
              ],
              debet: 0,
              kredit: 0,
              fotoNota: pb.fotoNota
            });
          }
        }
      }
      for (const kpb of db.pembelianBarang || []) {
        if (kpb.rekeningSumber === rekKode && kpb.metodePembayaran !== "HUTANG") {
          totalPakaiDariAnakPerusahaan += kpb.totalNominal;
          if (!seenIds.has(kpb.noPembelian)) {
            seenIds.add(kpb.noPembelian);
            const rincian = (kpb.items || []).map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(", ");
            timeline.push({
              id: kpb.noPembelian,
              tanggal: kpb.tanggal,
              jam: kpb.jam,
              createdAt: kpb.createdAt,
              jenis: "BAYAR KULAKAN VIA ANAK PERUSAHAAN",
              keterangan: `Pembayaran kulakan supplier ${kpb.namaMitra} menggunakan dana ${linkedRek.nama}: ${rincian}`,
              qtyDisplay: "1 Faktur",
              hargaSatuanDisplay: `Rp ${kpb.totalNominal.toLocaleString("id-ID")}`,
              itemsDetail: (kpb.items || []).map((i) => ({
                nama: i.namaProduk,
                qty: i.qty,
                satuan: i.satuan,
                harga: i.hargaBeliSatuan,
                subtotal: i.subtotal
              })),
              debet: 0,
              kredit: 0,
              fotoNota: kpb.fotoNota
            });
          }
        }
      }
      for (const ku of db.kasbonUang || []) {
        if (ku.rekeningSumber === rekKode && !ku.isNotaLalu) {
          totalPakaiDariAnakPerusahaan += ku.nominal;
          if (!seenIds.has(ku.idTransaksi)) {
            seenIds.add(ku.idTransaksi);
            timeline.push({
              id: ku.idTransaksi,
              tanggal: ku.tanggal,
              jam: ku.jam,
              createdAt: ku.createdAt,
              jenis: "CAIRKAN KASBON VIA ANAK PERUSAHAAN",
              keterangan: `Pencairan kasbon uang untuk ${ku.namaMitra} dari dana ${linkedRek.nama} \u2014 ${ku.keterangan}`,
              qtyDisplay: "1 Trx",
              hargaSatuanDisplay: `Rp ${ku.nominal.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `Kasbon Uang ${ku.namaMitra} via ${linkedRek.nama}`,
                  qty: 1,
                  satuan: "Trx",
                  harga: ku.nominal,
                  subtotal: ku.nominal
                }
              ],
              debet: 0,
              kredit: 0,
              fotoNota: ku.fotoNota
            });
          }
        }
      }
      for (const pt of db.pencairanTitipan || []) {
        if (pt.rekeningSumber === rekKode && pt.metodePembayaran !== "KOMPENSASI_BON" && !pt.isKompensasiBon) {
          totalPakaiDariAnakPerusahaan += pt.nominalPencairan;
          if (!seenIds.has(pt.idPencairan)) {
            seenIds.add(pt.idPencairan);
            timeline.push({
              id: pt.idPencairan,
              tanggal: pt.tanggal,
              jam: pt.jam,
              createdAt: pt.createdAt,
              jenis: "PENCAIRAN TITIPAN VIA ANAK PERUSAHAAN",
              keterangan: `Pembayaran titipan hasil bumi ${pt.namaMitra} menggunakan dana ${linkedRek.nama} \u2014 ${pt.keterangan}`,
              qtyDisplay: "1 Trx",
              hargaSatuanDisplay: `Rp ${pt.nominalPencairan.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `Pencairan Titipan ${pt.namaMitra} via ${linkedRek.nama}`,
                  qty: 1,
                  satuan: "Trx",
                  harga: pt.nominalPencairan,
                  subtotal: pt.nominalPencairan
                }
              ],
              debet: 0,
              kredit: 0
            });
          }
        }
      }
      for (const exp of db.pengeluaran || []) {
        if (exp.rekeningSumber === rekKode) {
          totalPakaiDariAnakPerusahaan += exp.nominal;
          if (!seenIds.has(exp.idTransaksi)) {
            seenIds.add(exp.idTransaksi);
            timeline.push({
              id: exp.idTransaksi,
              tanggal: exp.tanggal,
              jam: exp.jam,
              createdAt: exp.createdAt,
              jenis: "BIAYA OPERASIONAL VIA ANAK PERUSAHAAN",
              keterangan: `Pengeluaran [${exp.divisi}] ${exp.kategori}: ${exp.keterangan} dibayar via ${linkedRek.nama}`,
              qtyDisplay: "1 Biaya",
              hargaSatuanDisplay: `Rp ${exp.nominal.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `[${exp.divisi}] ${exp.kategori} \u2014 ${exp.keterangan}`,
                  qty: 1,
                  satuan: "Biaya",
                  harga: exp.nominal,
                  subtotal: exp.nominal
                }
              ],
              debet: 0,
              kredit: 0,
              fotoNota: exp.fotoKuitansi
            });
          }
        }
      }
      for (const g of db.penggajian || []) {
        if (g.rekeningSumber === rekKode) {
          totalPakaiDariAnakPerusahaan += g.gajiBersihDibayar;
          if (!seenIds.has(g.id)) {
            seenIds.add(g.id);
            timeline.push({
              id: g.id,
              tanggal: g.tanggal,
              jam: g.jam,
              createdAt: `${g.tanggal} ${g.jam}`,
              jenis: "BAYAR UPAH VIA ANAK PERUSAHAAN",
              keterangan: `Pembayaran gaji/upah ${g.namaKaryawan} (${g.divisi}) via ${linkedRek.nama}`,
              qtyDisplay: "1 Slip",
              hargaSatuanDisplay: `Rp ${g.gajiBersihDibayar.toLocaleString("id-ID")}`,
              itemsDetail: [
                {
                  nama: `Gaji ${g.namaKaryawan} (${g.periodeBulan})`,
                  qty: 1,
                  satuan: "Slip",
                  harga: g.gajiBersihDibayar,
                  subtotal: g.gajiBersihDibayar
                }
              ],
              debet: 0,
              kredit: 0
            });
          }
        }
      }
    }
    timeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let runningBon = 0;
    const history = timeline.map((item) => {
      runningBon += item.debet - item.kredit;
      return {
        id: item.id,
        tanggal: item.tanggal,
        jam: item.jam,
        jenis: item.jenis,
        keterangan: item.keterangan,
        qtyDisplay: item.qtyDisplay,
        hargaSatuanDisplay: item.hargaSatuanDisplay,
        itemsDetail: item.itemsDetail,
        debet: item.debet,
        kredit: item.kredit,
        saldoAkumulasi: runningBon,
        fotoNota: item.fotoNota,
        isNotaLalu: item.isNotaLalu,
        noNotaLalu: item.noNotaLalu
      };
    });
    const posisiBersihTerpadu = isAnakPerusahaan && linkedRek ? totalTitip - totalBonKeseluruhan - (linkedRek.saldoSaatIni || 0) : totalTitip - totalBonKeseluruhan;
    const rekUtama = db.rekening.find(
      (r) => r.kode === (db.profilPerusahaan?.rekeningUtama || "KAS01")
    );
    return {
      idMitra: mitra.id,
      kodeMitra: mitra.kode,
      namaMitra: mitra.nama,
      role: mitra.role,
      telepon: mitra.telepon,
      alamat: mitra.alamat,
      status: mitra.status,
      profilPerusahaan: db.profilPerusahaan,
      ...rekUtama ? {
        rekeningUtamaDetail: {
          kode: rekUtama.kode,
          nama: rekUtama.nama,
          nomorRekening: rekUtama.nomorRekening,
          atasNama: rekUtama.atasNama
        }
      } : {},
      ...isAnakPerusahaan ? {
        isAnakPerusahaan: true,
        kodeRekeningTerkait: linkedRek?.kode || mitra.kodeRekeningTerkait,
        namaRekeningTerkait: linkedRek?.nama || mitra.nama,
        saldoAwalRekeningAnakPerusahaan: linkedRek?.saldoAwal || 0,
        saldoRekeningAnakPerusahaan: linkedRek?.saldoSaatIni || 0,
        totalSimpanKeAnakPerusahaan,
        totalPakaiDariAnakPerusahaan,
        posisiBersihTerpadu
      } : {},
      totalKasbonBarang,
      totalKasbonUang,
      totalTitip,
      totalPembayaranBon,
      totalBonKeseluruhan,
      sisaBon,
      potonganTitipanOtomatis: Math.min(totalBonKeseluruhan, totalTitip),
      sisaBonBersih: Math.max(0, totalBonKeseluruhan - totalTitip),
      sisaTitipanBersih: Math.max(0, totalTitip - totalBonKeseluruhan),
      history
    };
  }
  /**
   * Rekap Master Mitra: Hutang Perusahaan (Titip Panen belum diambil uangnya) & Bon Mitra (Barang + Uang)
   */
  static getRekapMasterMitra() {
    const db = dbManager.get();
    let totalHutangPerusahaanKeMitra = 0;
    let totalBonMitra = 0;
    let mitraDenganHutangTitipCount = 0;
    let mitraDenganBonCount = 0;
    const items = db.mitra.map((m) => {
      const kasbonBarang = db.penjualan.filter((p) => p.idMitra === m.id && p.metode === "KASBON").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0) + (db.penjualanHasilBumi || []).filter((j) => j.idMitra === m.id && j.metodePembayaran === "PIUTANG").reduce((sum, j) => sum + (j.sisaPiutang || 0), 0);
      const kasbonUang = db.kasbonUang.filter((k) => k.idMitra === m.id && k.status !== "LUNAS").reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const totalBon = kasbonBarang + kasbonUang;
      const titipPanenKotor = db.pembelianHasilBumi.filter((pb) => pb.idMitra === m.id && pb.metodePembayaran === "TITIP").reduce((sum, pb) => sum + pb.totalNominal, 0);
      const hutangKulakan = (db.pembelianBarang || []).filter((pb) => pb.idMitra === m.id && pb.metodePembayaran === "HUTANG" && pb.status !== "LUNAS").reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);
      const titipKotor = titipPanenKotor + hutangKulakan;
      const totalPencairanM = (db.pencairanTitipan || []).filter((pt) => pt.idMitra === m.id).reduce((sum, pt) => sum + (pt.nominalPencairan || 0), 0);
      const titipPanen = Math.max(0, titipKotor - totalPencairanM);
      const linkedRek = m.kodeRekeningTerkait && db.rekening.find((r) => r.kode === m.kodeRekeningTerkait) || db.rekening.find((r) => r.idMitraTerkait === m.id && this.isAnakPerusahaanRekening(r));
      const isAnakPerusahaan = Boolean(m.isAnakPerusahaan || m.role === "ANAK_PERUSAHAAN" || linkedRek);
      const txIdSet = /* @__PURE__ */ new Set();
      db.penjualan.filter((p) => p.idMitra === m.id).forEach((p) => txIdSet.add(p.noPenjualan));
      (db.penjualanHasilBumi || []).filter((j) => j.idMitra === m.id).forEach((j) => txIdSet.add(j.noPenjualan));
      db.pembelianHasilBumi.filter((pb) => pb.idMitra === m.id).forEach((pb) => txIdSet.add(pb.noPembelian));
      (db.pembelianBarang || []).filter((pb) => pb.idMitra === m.id).forEach((pb) => txIdSet.add(pb.noPembelian));
      (db.pencairanTitipan || []).filter((pt) => pt.idMitra === m.id).forEach((pt) => txIdSet.add(pt.idPencairan));
      db.kasbonUang.filter((k) => k.idMitra === m.id).forEach((k) => txIdSet.add(k.idTransaksi));
      db.bayarBon.filter((b) => b.idMitra === m.id).forEach((b) => txIdSet.add(b.idTransaksi));
      if (isAnakPerusahaan && linkedRek) {
        const rekKode = linkedRek.kode;
        (db.transferRekening || []).filter((t) => (t.rekeningSumber === rekKode || t.rekeningTujuan === rekKode) && t.status === "BERHASIL").forEach((t) => txIdSet.add(t.noTransfer));
        db.penjualan.filter((p) => p.rekeningTujuan === rekKode).forEach((p) => txIdSet.add(p.noPenjualan));
        db.bayarBon.filter((b) => b.rekeningTujuan === rekKode).forEach((b) => txIdSet.add(b.idTransaksi));
        db.pembelianHasilBumi.filter((pb) => pb.rekeningSumber === rekKode).forEach((pb) => txIdSet.add(pb.noPembelian));
        (db.pembelianBarang || []).filter((pb) => pb.rekeningSumber === rekKode).forEach((pb) => txIdSet.add(pb.noPembelian));
        db.kasbonUang.filter((k) => k.rekeningSumber === rekKode).forEach((k) => txIdSet.add(k.idTransaksi));
        (db.pencairanTitipan || []).filter((pt) => pt.rekeningSumber === rekKode).forEach((pt) => txIdSet.add(pt.idPencairan));
        (db.pengeluaran || []).filter((e) => e.rekeningSumber === rekKode).forEach((e) => txIdSet.add(e.idTransaksi));
        (db.penggajian || []).filter((g) => g.rekeningSumber === rekKode).forEach((g) => txIdSet.add(g.id));
      }
      const txCount = txIdSet.size;
      const saldoBersih = titipPanen - totalBon;
      const posisiBersihTerpadu = isAnakPerusahaan && linkedRek ? titipPanen - totalBon - (linkedRek.saldoSaatIni || 0) : saldoBersih;
      let posisiStatus = "LUNAS_IMPAS";
      const basisPosisi = isAnakPerusahaan ? posisiBersihTerpadu : saldoBersih;
      if (basisPosisi > 0) {
        posisiStatus = "KITA_BERHUTANG";
      } else if (basisPosisi < 0) {
        posisiStatus = "MITRA_BERHUTANG";
      }
      totalHutangPerusahaanKeMitra += titipPanen;
      totalBonMitra += totalBon;
      if (titipPanen > 0) mitraDenganHutangTitipCount++;
      if (totalBon > 0) mitraDenganBonCount++;
      return {
        id: m.id,
        kode: m.kode,
        nama: m.nama,
        role: m.role,
        telepon: m.telepon,
        alamat: m.alamat,
        status: m.status,
        catatan: m.catatan,
        ...isAnakPerusahaan ? {
          isAnakPerusahaan: true,
          kodeRekeningTerkait: linkedRek?.kode || m.kodeRekeningTerkait,
          namaRekeningTerkait: linkedRek?.nama || m.nama,
          saldoRekeningAnakPerusahaan: linkedRek?.saldoSaatIni || 0,
          posisiBersihTerpadu
        } : {},
        totalHutangTitipPanen: titipPanen,
        totalKasbonBarang: kasbonBarang,
        totalKasbonUang: kasbonUang,
        totalBonMitra: totalBon,
        potonganSilangOtomatis: Math.min(titipPanen, totalBon),
        sisaBonBersih: Math.max(0, totalBon - titipPanen),
        sisaTitipanBersih: Math.max(0, titipPanen - totalBon),
        saldoBersih,
        posisiStatus,
        totalTransaksiCount: txCount
      };
    });
    return {
      totalMitra: db.mitra.length,
      totalHutangPerusahaanKeMitra,
      totalBonMitra,
      saldoBersihKemitraan: totalHutangPerusahaanKeMitra - totalBonMitra,
      mitraDenganHutangTitipCount,
      mitraDenganBonCount,
      items
    };
  }
  // ==========================================
  // 7. DASHBOARD STATS
  // ==========================================
  static getDashboardStats() {
    const db = dbManager.get();
    const totalPenjualan = db.penjualan.reduce((s, p) => s + p.totalNominal, 0);
    const totalPenjualanHasilBumi = (db.penjualanHasilBumi || []).reduce((s, j) => s + (j.totalNominal || 0), 0);
    const totalTerjualHasilBumiKg = (db.penjualanHasilBumi || []).reduce((s, j) => s + (j.beratBersih || 0), 0);
    const totalPembelianHasilBumi = db.pembelianHasilBumi.filter((p) => this.isPhysicalPembelianHasilBumi(p)).reduce((s, p) => s + p.totalNominal, 0);
    const realAccounts = db.rekening.filter((r) => !r.isVirtual && r.status === "AKTIF");
    const totalUangPerusahaan = realAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);
    const kasAccount = db.rekening.find((r) => r.kode === "KAS01");
    const saldoKas = kasAccount ? kasAccount.saldoSaatIni : 0;
    const bankAccounts = realAccounts.filter((r) => r.kode !== "KAS01");
    const saldoBank = bankAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);
    const bonAcc = db.rekening.find((r) => r.kode === "BON01");
    const totalBonOutstanding = bonAcc ? bonAcc.saldoSaatIni : 0;
    const titAcc = db.rekening.find((r) => r.kode === "TIT01");
    const totalTitipOutstanding = titAcc ? titAcc.saldoSaatIni : 0;
    const totalKasbonUangAktif = db.kasbonUang.filter((k) => k.status !== "LUNAS").reduce((s, k) => s + (k.sisaKasbon || 0), 0);
    const nilaiStokBarang = db.stokBarang.reduce((s, sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      return s + sb.stok * (prd ? prd.hargaJual : 0);
    }, 0);
    const totalVolumeHasilBumiKg = db.stokHasilBumi.filter((h) => h.kode !== "HB-01B" && !h.nama.toUpperCase().includes("KOPI JALAN")).reduce((s, hb) => s + (hb.stok || 0), 0);
    const stokMenipis = db.stokBarang.filter((sb) => sb.stok <= sb.minimum);
    const recentTx = [];
    if (db.pembelianBarang) {
      for (const pb of db.pembelianBarang.slice(0, 10)) {
        recentTx.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          kategori: "PEMBELIAN_BARANG",
          label: `Kulakan ${pb.items.map((i) => i.namaProduk).slice(0, 2).join(", ")}`,
          nominal: pb.totalNominal,
          pihakTerkait: pb.namaMitra,
          rekening: pb.rekeningSumber,
          status: pb.status,
          fotoNota: pb.fotoNota
        });
      }
    }
    for (const p of db.penjualan.slice(0, 10)) {
      recentTx.push({
        id: p.noPenjualan,
        tanggal: p.tanggal,
        jam: p.jam,
        createdAt: p.createdAt,
        kategori: "PENJUALAN",
        label: `Penjualan ${p.metode}`,
        nominal: p.totalNominal,
        pihakTerkait: p.namaMitra,
        rekening: p.rekeningTujuan,
        status: p.statusPembayaran
      });
    }
    for (const jhb of (db.penjualanHasilBumi || []).slice(0, 10)) {
      recentTx.push({
        id: jhb.noPenjualan,
        tanggal: jhb.tanggal,
        jam: jhb.jam,
        createdAt: jhb.createdAt,
        kategori: "PENJUALAN",
        label: `Jual ${jhb.komoditasNama} (${jhb.beratBersih} kg)`,
        nominal: jhb.totalNominal,
        pihakTerkait: jhb.namaMitra,
        rekening: jhb.rekeningTujuan,
        status: jhb.statusPembayaran
      });
    }
    for (const b of db.pembelianHasilBumi.slice(0, 10)) {
      recentTx.push({
        id: b.noPembelian,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        kategori: "PEMBELIAN_HASIL_BUMI",
        label: `Beli ${b.komoditasNama} (${b.beratBersih} kg)`,
        nominal: b.totalNominal,
        pihakTerkait: b.namaMitra,
        rekening: b.rekeningSumber,
        status: b.status,
        fotoNota: b.fotoNota
      });
    }
    for (const k of db.kasbonUang.slice(0, 10)) {
      recentTx.push({
        id: k.idTransaksi,
        tanggal: k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        kategori: "KASBON_UANG",
        label: `Kasbon Uang (${k.metode})`,
        nominal: k.nominal,
        pihakTerkait: k.namaMitra,
        rekening: k.rekeningSumber,
        status: k.status
      });
    }
    for (const by of db.bayarBon.slice(0, 10)) {
      recentTx.push({
        id: by.idTransaksi,
        tanggal: by.tanggal,
        jam: by.jam,
        createdAt: by.createdAt,
        kategori: "BAYAR_BON",
        label: `Bayar Bon (${by.metode})`,
        nominal: by.nominalBayar,
        pihakTerkait: by.namaMitra,
        rekening: by.rekeningTujuan,
        status: "LUNAS"
      });
    }
    for (const t of db.transferRekening.slice(0, 10)) {
      const sRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
      const dRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
      const isAnakTx = Boolean(
        t.idMitraTerkait || this.isAnakPerusahaanRekening(sRek) || this.isAnakPerusahaanRekening(dRek)
      );
      const namaAfiliasi = t.namaMitraTerkait || (this.isAnakPerusahaanRekening(dRek) ? dRek?.nama : this.isAnakPerusahaanRekening(sRek) ? sRek?.nama : "");
      recentTx.push({
        id: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam,
        createdAt: t.createdAt,
        kategori: "TRANSFER_REKENING",
        label: isAnakTx ? t.tipeMutasiAfiliasi === "TARIK_DARI_ANAK_PERUSAHAAN" || this.isAnakPerusahaanRekening(sRek) ? `Tarik/Talangan ${namaAfiliasi}` : `Simpan Dana ke ${namaAfiliasi}` : `Transfer ${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        pihakTerkait: isAnakTx ? `${namaAfiliasi} (Anak Perusahaan & Mitra)` : "Internal PT Wijaya Agro",
        rekening: `${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        status: t.status
      });
    }
    if (db.penggajian) {
      for (const g of db.penggajian.slice(0, 10)) {
        recentTx.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          createdAt: `${g.tanggal} ${g.jam}`,
          kategori: "PENGGAJIAN",
          label: `Gaji ${g.namaKaryawan} (${g.periodeBulan})`,
          nominal: g.gajiBersihDibayar,
          pihakTerkait: g.namaKaryawan,
          rekening: g.rekeningSumber,
          status: "SELESAI"
        });
      }
    }
    recentTx.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
      totalPenjualan,
      totalPenjualanHasilBumi,
      totalTerjualHasilBumiKg,
      totalPembelianHasilBumi,
      totalUangPerusahaan,
      saldoKas,
      saldoBank,
      totalBonOutstanding,
      totalTitipOutstanding,
      totalKasbonUangAktif,
      nilaiStokBarang,
      totalVolumeHasilBumiKg,
      stokMenipis,
      recentTransactions: recentTx.slice(0, 10),
      rekeningList: db.rekening
    };
  }
  /**
   * 8. LOGIKA PEMBUKUAN ARUS KAS HARIAN BOS (UANG MASUK & UANG KELUAR)
   * Mengadopsi logika jurnal rekapitulasi harian bos PT. WIJAYA AGRO PERKASA
   */
  static getRekapHarianKas(tanggalQuery) {
    const db = dbManager.get();
    const today = getWIBDateTime().tanggal;
    const targetTanggal = tanggalQuery || today;
    const isSameDate = (txDate) => {
      if (!txDate) return false;
      if (txDate === targetTanggal) return true;
      const partsA = txDate.split(/[-/]/);
      const partsB = targetTanggal.split(/[-/]/);
      if (partsA.length === 3 && partsB.length === 3) {
        if (partsA[0].length === 4) {
          const normA = `${partsA[2].padStart(2, "0")}/${partsA[1].padStart(2, "0")}/${partsA[0]}`;
          if (normA === targetTanggal) return true;
        }
        if (partsB[0].length === 4) {
          const normB = `${partsB[2].padStart(2, "0")}/${partsB[1].padStart(2, "0")}/${partsB[0]}`;
          if (txDate === normB) return true;
        }
      }
      return false;
    };
    const penjualanHariIni = (db.penjualan || []).filter(
      (p) => isSameDate(p.tanggal) && p.metode !== "KASBON" && p.metode !== "INTERNAL_PT" && p.rekeningTujuan !== "INTERNAL_PT"
    );
    const penjualanHasilBumiHariIni = (db.penjualanHasilBumi || []).filter(
      (j) => isSameDate(j.tanggal) && j.metodePembayaran !== "PIUTANG"
    );
    const totalPenjualanMasuk = penjualanHariIni.reduce((s, p) => s + (p.totalNominal || 0), 0) + penjualanHasilBumiHariIni.reduce((s, j) => s + (j.totalNominal || 0), 0);
    const bayarBonHariIni = (db.bayarBon || []).filter(
      (b) => isSameDate(b.tanggal) && b.metode !== "SINKRON" && b.metode !== "KOMPENSASI_TITIP" && b.metode !== "POTONG_GAJI" && !b.isKompensasiTitipan && !b.isPotongGaji && b.rekeningTujuan !== "SINKRON" && b.rekeningTujuan !== "KOMPENSASI_TITIP" && b.rekeningTujuan !== "POTONG_GAJI"
    );
    const totalBayarBon = bayarBonHariIni.reduce((s, b) => s + (b.nominalBayar || 0), 0);
    const pinjamanDanaMasukHariIni = (db.pembelianHasilBumi || []).filter(
      (b) => isSameDate(b.tanggal) && (b.komoditasKode === "PINJAMAN_DANA" || b.komoditasNama?.includes("Pinjaman Uang")) && b.rekeningSumber && b.rekeningSumber !== "TIT01"
    );
    const totalPinjamanDanaMasuk = pinjamanDanaMasukHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);
    const transferMasukHariIni = (db.transferRekening || []).filter(
      (t) => isSameDate(t.tanggal) && t.rekeningTujuan === "KAS01" && t.status === "BERHASIL"
    );
    const totalTransferMasuk = transferMasukHariIni.reduce((s, t) => s + (t.nominal || 0), 0);
    const totalUangMasuk = totalPenjualanMasuk + totalBayarBon + totalPinjamanDanaMasuk + totalTransferMasuk;
    const pengeluaranHariIni = (db.pengeluaran || []).filter((p) => isSameDate(p.tanggal));
    const totalPengeluaranDivisi = pengeluaranHariIni.reduce((s, p) => s + (p.nominal || 0), 0);
    const beliHasilBumiHariIni = (db.pembelianHasilBumi || []).filter(
      (b) => isSameDate(b.tanggal) && b.metodePembayaran !== "TITIP" && b.komoditasKode !== "PINJAMAN_DANA" && !b.komoditasNama?.includes("Pinjaman Uang")
    );
    const totalBeliHasilBumi = beliHasilBumiHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);
    const kasbonUangHariIni = (db.kasbonUang || []).filter(
      (k) => isSameDate(k.tanggal) && !k.isNotaLalu && k.rekeningSumber !== "BON01"
    );
    const totalKasbonUang = kasbonUangHariIni.reduce((s, k) => s + (k.nominal || 0), 0);
    const beliBarangHariIni = (db.pembelianBarang || []).filter(
      (b) => isSameDate(b.tanggal) && b.metodePembayaran !== "HUTANG"
    );
    const totalBeliBarang = beliBarangHariIni.reduce((s, b) => s + (b.totalNominal || 0), 0);
    const pencairanTitipanHariIni = (db.pencairanTitipan || []).filter(
      (pt) => isSameDate(pt.tanggal) && pt.metodePembayaran !== "SINKRON" && pt.metodePembayaran !== "KOMPENSASI_BON" && pt.rekeningSumber !== "SINKRON" && !pt.isKompensasiBon
    );
    const totalPencairanTitipan = pencairanTitipanHariIni.reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const gajiHariIni = (db.penggajian || []).filter((g) => isSameDate(g.tanggal));
    const totalGaji = gajiHariIni.reduce((s, g) => s + (g.gajiBersihDibayar || 0), 0);
    const totalUangKeluar = totalPengeluaranDivisi + totalBeliHasilBumi + totalKasbonUang + totalBeliBarang + totalPencairanTitipan + totalGaji;
    const arusKasBersih = totalUangMasuk - totalUangKeluar;
    const kasAccount = db.rekening.find((r) => r.kode === "KAS01");
    const saldoKasFisik = kasAccount ? kasAccount.saldoSaatIni : 0;
    const realBankAccounts = db.rekening.filter(
      (r) => !r.isVirtual && r.kode !== "KAS01" && !r.kode.startsWith("REK-") && !this.isAnakPerusahaanRekening(r) && r.status === "AKTIF"
    );
    const saldoTotalBank = realBankAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);
    const divMap = /* @__PURE__ */ new Map();
    pengeluaranHariIni.forEach((p) => {
      const d = p.divisi || "Lain-lain";
      const cur = divMap.get(d) || { total: 0, count: 0 };
      divMap.set(d, { total: cur.total + p.nominal, count: cur.count + 1 });
    });
    const rekapDivisiHariIni = Array.from(divMap.entries()).map(([divisi, data]) => ({
      divisi,
      total: data.total,
      count: data.count
    }));
    return {
      tanggal: targetTanggal,
      totalUangMasuk,
      rincianMasuk: {
        penjualanToko: totalPenjualanMasuk,
        bayarBon: totalBayarBon,
        droppingMasuk: totalTransferMasuk + totalPinjamanDanaMasuk,
        jumlahTransaksi: penjualanHariIni.length + penjualanHasilBumiHariIni.length + bayarBonHariIni.length + pinjamanDanaMasukHariIni.length + transferMasukHariIni.length
      },
      totalUangKeluar,
      rincianKeluar: {
        pengeluaranDivisi: totalPengeluaranDivisi,
        beliHasilBumi: totalBeliHasilBumi,
        kasbonUang: totalKasbonUang,
        kulakanBarang: totalBeliBarang,
        pencairanTitipan: totalPencairanTitipan,
        upahGaji: totalGaji,
        jumlahTransaksi: pengeluaranHariIni.length + beliHasilBumiHariIni.length + kasbonUangHariIni.length + beliBarangHariIni.length + pencairanTitipanHariIni.length + gajiHariIni.length
      },
      arusKasBersih,
      saldoKasFisik,
      saldoTotalBank,
      totalSaldoRil: saldoKasFisik + saldoTotalBank,
      rekapDivisiHariIni
    };
  }
  // ==========================================
  // 7. PENGELUARAN & BEBAN OPERASIONAL PER DIVISI
  // ==========================================
  static async processPengeluaran(params) {
    return dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      if (!params.nominal || params.nominal <= 0) {
        throw new Error("Nominal pengeluaran harus lebih dari Rp 0");
      }
      const rekening = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (!rekening) throw new Error("Rekening sumber dana tidak ditemukan");
      if (!this.isAnakPerusahaanRekening(rekening) && rekening.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo ${rekening.nama} tidak mencukupi (Tersedia: Rp ${rekening.saldoSaatIni.toLocaleString("id-ID")})`
        );
      }
      const idTransaksi = generateId("EXP");
      const record = {
        idTransaksi,
        tanggal: params.tanggal || tanggal,
        jam,
        divisi: params.divisi,
        kategori: params.kategori,
        keterangan: params.keterangan,
        nominal: params.nominal,
        rekeningSumber: params.rekeningSumber,
        penerima: params.penerima,
        idInventaris: params.idInventaris || void 0,
        fotoKuitansi: params.fotoKuitansi,
        createdAt: iso
      };
      if (!db.pengeluaran) db.pengeluaran = [];
      db.pengeluaran.unshift(record);
      rekening.saldoSaatIni -= params.nominal;
      this.addAuditLog(
        db,
        "PAYMENT",
        idTransaksi,
        `Pengeluaran Divisi [${params.divisi}] (${params.kategori}): ${params.keterangan} sebesar Rp ${params.nominal.toLocaleString("id-ID")} via ${rekening.nama}`,
        params.nominal,
        params.rekeningSumber
      );
      return record;
    });
  }
  static getPengeluaranList() {
    const db = dbManager.get();
    return db.pengeluaran || [];
  }
  static async deletePengeluaran(idTransaksi) {
    return dbManager.executeTransaction((db) => {
      const idx = (db.pengeluaran || []).findIndex((p) => p.idTransaksi === idTransaksi);
      if (idx === -1) throw new Error("Catatan pengeluaran tidak ditemukan");
      const exp = db.pengeluaran[idx];
      const rek = db.rekening.find((r) => r.kode === exp.rekeningSumber);
      if (rek) {
        rek.saldoSaatIni += exp.nominal;
      }
      db.pengeluaran.splice(idx, 1);
      this.addAuditLog(
        db,
        "VOID",
        idTransaksi,
        `Batalkan Pengeluaran [${exp.divisi}]: ${exp.keterangan} (Rp ${exp.nominal.toLocaleString("id-ID")})`,
        exp.nominal,
        exp.rekeningSumber
      );
      return { success: true, message: "Pengeluaran berhasil dibatalkan dan saldo dikembalikan" };
    });
  }
  // ==========================================
  // 8. PENCAIRAN TITIPAN HASIL BUMI (PEMBAYARAN DARI PT KE MITRA)
  // Otomatis memotong Bon Mitra terlebih dahulu sehingga PT hanya membayar sisa bersih ke Mitra
  // ==========================================
  static async processPencairanTitipan(params) {
    return dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const targetTanggal = params.tanggal || tanggal;
      const nominalFisik = Math.round(Number(params.nominal) || 0);
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error("Mitra tidak ditemukan");
      const snap = this.getMitraCrossBalanceSnapshot(db, mitra.id);
      const {
        totalBonKotor,
        saldoTitipanAktif,
        potonganOtomatis,
        sisaBonBersih,
        sisaTitipanBersih
      } = snap;
      const isImpasZeroCash = nominalFisik === 0 && potonganOtomatis > 0 && sisaTitipanBersih === 0;
      if (!isImpasZeroCash && nominalFisik <= 0) {
        throw new Error("Nominal pembayaran dari PT ke mitra harus lebih dari Rp 0");
      }
      if (sisaTitipanBersih <= 0 && !isImpasZeroCash) {
        if (saldoTitipanAktif > 0 && totalBonKotor > saldoTitipanAktif) {
          throw new Error(
            `Titipan Hasil Bumi ${mitra.nama} (Rp ${saldoTitipanAktif.toLocaleString(
              "id-ID"
            )}) sudah habis terpotong untuk mengurangi Bon Mitra (Rp ${totalBonKotor.toLocaleString(
              "id-ID"
            )}). Tidak ada uang yang dibayar PT ke Mitra \u2014 justru sisa Bon Mitra Rp ${sisaBonBersih.toLocaleString(
              "id-ID"
            )}.`
          );
        }
        throw new Error(`Mitra ${mitra.nama} tidak memiliki sisa titipan bersih yang harus dibayar PT`);
      }
      if (nominalFisik > sisaTitipanBersih) {
        throw new Error(
          `Nominal pembayaran (Rp ${nominalFisik.toLocaleString(
            "id-ID"
          )}) melebihi sisa bersih wajib bayar PT ke Mitra (Rp ${sisaTitipanBersih.toLocaleString(
            "id-ID"
          )} setelah potong bon otomatis Rp ${potonganOtomatis.toLocaleString("id-ID")})`
        );
      }
      let rekening = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (nominalFisik > 0) {
        if (!rekening) throw new Error("Rekening pembayaran kas/bank tidak ditemukan");
        if (!this.isAnakPerusahaanRekening(rekening) && rekening.saldoSaatIni < nominalFisik) {
          throw new Error(
            `Saldo ${rekening.nama} tidak mencukupi untuk pembayaran bersih (Tersedia: Rp ${rekening.saldoSaatIni.toLocaleString(
              "id-ID"
            )}, dibutuhkan: Rp ${nominalFisik.toLocaleString("id-ID")})`
          );
        }
      }
      const idPencairan = generateId("PCT");
      if (potonganOtomatis > 0) {
        this.executeAutoCrossOffsetInTx({
          db,
          mitra,
          nominalPotong: potonganOtomatis,
          totalBonSebelum: totalBonKotor,
          saldoTitipanSebelum: saldoTitipanAktif,
          tanggal: targetTanggal,
          jam,
          iso,
          refId: idPencairan
        });
      }
      if (isImpasZeroCash) {
        dbManager.synchronizeVirtualAccounts();
        const impasRecord = (db.pencairanTitipan || []).find(
          (pt) => pt.idPencairan === `${idPencairan}-POTTIT`
        );
        this.addAuditLog(
          db,
          "PAYMENT",
          idPencairan,
          `Tutup Buku Lunas Impas ${mitra.nama}: Titipan Hasil Bumi Rp ${saldoTitipanAktif.toLocaleString(
            "id-ID"
          )} langsung menutup Bon Rp ${totalBonKotor.toLocaleString("id-ID")} via SINKRON (Rp 0 uang keluar).`,
          0,
          "SINKRON"
        );
        return impasRecord || {
          idPencairan: `${idPencairan}-POTTIT`,
          tanggal: targetTanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: potonganOtomatis,
          rekeningSumber: "SINKRON",
          saldoTitipanSebelum: saldoTitipanAktif,
          totalTitipanAwalKotor: saldoTitipanAktif,
          nominalPotongBonOtomatis: potonganOtomatis,
          saldoTitipanSisa: 0,
          metodePembayaran: "SINKRON",
          isKompensasiBon: true,
          keterangan: params.keterangan || "Tutup Buku Impas Otomatis Titipan Hasil Bumi & Bon Mitra (SINKRON)",
          createdAt: iso
        };
      }
      const saldoTitipanSisa = Math.max(0, sisaTitipanBersih - nominalFisik);
      const record = {
        idPencairan,
        tanggal: targetTanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        nominalPencairan: nominalFisik,
        rekeningSumber: params.rekeningSumber,
        saldoTitipanSebelum: sisaTitipanBersih,
        ...potonganOtomatis > 0 ? {
          totalTitipanAwalKotor: saldoTitipanAktif,
          nominalPotongBonOtomatis: potonganOtomatis
        } : {},
        saldoTitipanSisa,
        metodePembayaran: params.metode,
        keterangan: params.keterangan || (potonganOtomatis > 0 ? `Pembayaran PT ke Mitra ${mitra.nama} (Titipan Rp ${saldoTitipanAktif.toLocaleString(
          "id-ID"
        )} - Potong Bon Otomatis Rp ${potonganOtomatis.toLocaleString("id-ID")})` : "Pembayaran Titipan Pembelian Hasil Bumi dari PT ke Mitra"),
        createdAt: iso
      };
      if (!db.pencairanTitipan) db.pencairanTitipan = [];
      db.pencairanTitipan.unshift(record);
      if (rekening) {
        rekening.saldoSaatIni -= nominalFisik;
      }
      this.addAuditLog(
        db,
        "PAYMENT",
        idPencairan,
        potonganOtomatis > 0 ? `Pembayaran PT ke Mitra ${mitra.nama}: Titipan Awal Rp ${saldoTitipanAktif.toLocaleString(
          "id-ID"
        )} dipotong otomatis Bon Mitra Rp ${potonganOtomatis.toLocaleString(
          "id-ID"
        )} (Bon Lunas), dibayar bersih Rp ${nominalFisik.toLocaleString("id-ID")} via ${rekening?.nama || params.rekeningSumber}` : `Pembayaran Titipan Hasil Bumi dari PT ke Mitra ${mitra.nama} sebesar Rp ${nominalFisik.toLocaleString(
          "id-ID"
        )} via ${rekening?.nama || params.rekeningSumber}`,
        nominalFisik,
        params.rekeningSumber
      );
      dbManager.synchronizeVirtualAccounts();
      return record;
    });
  }
  static getPencairanTitipanList() {
    const db = dbManager.get();
    return db.pencairanTitipan || [];
  }
  // ==========================================
  // 9. SINKRONISASI & EDIT DARI REKENING KORAN MITRA
  // ==========================================
  static async updateTransactionFromStatement(params) {
    return dbManager.executeTransaction((db) => {
      const { idTransaksi, nominalBaru, keteranganBaru, tanggalBaru } = params;
      let updatedRecord = null;
      const pb = db.pembelianHasilBumi.find((p) => p.noPembelian === idTransaksi);
      if (pb) {
        const diff = nominalBaru - pb.totalNominal;
        pb.totalNominal = nominalBaru;
        if (pb.beratBersih > 0) {
          pb.hargaPerKg = Math.round(nominalBaru / pb.beratBersih);
        }
        if (keteranganBaru) pb.keterangan = keteranganBaru;
        if (tanggalBaru) pb.tanggal = tanggalBaru;
        if (pb.metodePembayaran !== "TITIP") {
          const rek = db.rekening.find((r) => r.kode === pb.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = pb;
      }
      const pj = db.penjualan.find((p) => p.noPenjualan === idTransaksi);
      if (pj) {
        const diff = nominalBaru - pj.totalNominal;
        pj.totalNominal = nominalBaru;
        if (pj.metode === "KASBON") {
          pj.sisaPiutang = Math.max(0, pj.sisaPiutang + diff);
        } else {
          const rek = db.rekening.find((r) => r.kode === pj.rekeningTujuan);
          if (rek) rek.saldoSaatIni += diff;
        }
        if (keteranganBaru) pj.keterangan = keteranganBaru;
        if (tanggalBaru) pj.tanggal = tanggalBaru;
        updatedRecord = pj;
      }
      const ku = db.kasbonUang.find((k) => k.idTransaksi === idTransaksi);
      if (ku) {
        const diff = nominalBaru - ku.nominal;
        ku.nominal = nominalBaru;
        ku.sisaKasbon = Math.max(0, ku.sisaKasbon + diff);
        if (keteranganBaru) ku.keterangan = keteranganBaru;
        if (tanggalBaru) ku.tanggal = tanggalBaru;
        if (ku.rekeningSumber !== "BON01") {
          const rek = db.rekening.find((r) => r.kode === ku.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = ku;
      }
      const bb = db.bayarBon.find((b) => b.idTransaksi === idTransaksi);
      if (bb) {
        const diff = nominalBaru - bb.nominalBayar;
        bb.nominalBayar = nominalBaru;
        if (keteranganBaru) bb.keterangan = keteranganBaru;
        if (tanggalBaru) bb.tanggal = tanggalBaru;
        const isNonCashBon = bb.metode === "SINKRON" || bb.metode === "KOMPENSASI_TITIP" || bb.metode === "POTONG_GAJI" || bb.rekeningTujuan === "SINKRON" || Boolean(bb.isKompensasiTitipan) || Boolean(bb.isPotongGaji);
        if (!isNonCashBon) {
          const rek = db.rekening.find((r) => r.kode === bb.rekeningTujuan);
          if (rek) rek.saldoSaatIni += diff;
        }
        updatedRecord = bb;
      }
      const pt = (db.pencairanTitipan || []).find((p) => p.idPencairan === idTransaksi);
      if (pt) {
        const diff = nominalBaru - pt.nominalPencairan;
        pt.nominalPencairan = nominalBaru;
        if (keteranganBaru) pt.keterangan = keteranganBaru;
        if (tanggalBaru) pt.tanggal = tanggalBaru;
        if (pt.metodePembayaran !== "SINKRON" && pt.metodePembayaran !== "KOMPENSASI_BON" && pt.rekeningSumber !== "SINKRON" && !pt.isKompensasiBon) {
          const rek = db.rekening.find((r) => r.kode === pt.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = pt;
      }
      const kpb = (db.pembelianBarang || []).find((p) => p.noPembelian === idTransaksi);
      if (kpb) {
        const diff = nominalBaru - kpb.totalNominal;
        kpb.totalNominal = nominalBaru;
        if (keteranganBaru) kpb.keterangan = keteranganBaru;
        if (tanggalBaru) kpb.tanggal = tanggalBaru;
        if (kpb.metodePembayaran !== "HUTANG") {
          const rek = db.rekening.find((r) => r.kode === kpb.rekeningSumber);
          if (rek) rek.saldoSaatIni -= diff;
        }
        updatedRecord = kpb;
      }
      const trf = (db.transferRekening || []).find((t) => t.noTransfer === idTransaksi);
      if (trf) {
        const diff = nominalBaru - trf.nominal;
        trf.nominal = nominalBaru;
        if (keteranganBaru) trf.keterangan = keteranganBaru;
        if (tanggalBaru) trf.tanggal = tanggalBaru;
        const sumber = db.rekening.find((r) => r.kode === trf.rekeningSumber);
        const tujuan = db.rekening.find((r) => r.kode === trf.rekeningTujuan);
        if (sumber) sumber.saldoSaatIni -= diff;
        if (tujuan) tujuan.saldoSaatIni += diff;
        updatedRecord = trf;
      }
      const exp = (db.pengeluaran || []).find((e) => e.idTransaksi === idTransaksi);
      if (exp) {
        const diff = nominalBaru - exp.nominal;
        exp.nominal = nominalBaru;
        if (keteranganBaru) exp.keterangan = keteranganBaru;
        if (tanggalBaru) exp.tanggal = tanggalBaru;
        const rek = db.rekening.find((r) => r.kode === exp.rekeningSumber);
        if (rek) rek.saldoSaatIni -= diff;
        updatedRecord = exp;
      }
      if (!updatedRecord) {
        throw new Error(`Transaksi ${idTransaksi} tidak ditemukan`);
      }
      this.addAuditLog(
        db,
        "UPDATE",
        idTransaksi,
        `Penyesuaian nilai transaksi/nego di Rekening Koran Mitra: Menjadi Rp ${nominalBaru.toLocaleString("id-ID")} (${keteranganBaru || "-"})`,
        nominalBaru
      );
      dbManager.synchronizeVirtualAccounts();
      return { success: true, message: "Transaksi berhasil disinkronkan & diperbarui", updatedRecord };
    });
  }
  // ==========================================
  // 10. PROFIL PERUSAHAAN
  // ==========================================
  static getProfilPerusahaan() {
    const db = dbManager.get();
    return db.profilPerusahaan;
  }
  static async updateProfilPerusahaan(data) {
    return dbManager.executeTransaction((db) => {
      const now = getWIBDateTime();
      db.profilPerusahaan = {
        ...db.profilPerusahaan,
        ...data,
        updateTerakhir: now.iso
      };
      this.addAuditLog(
        db,
        "UPDATE",
        "PROFIL-PT",
        `Pembaruan data profil perusahaan: ${db.profilPerusahaan.namaPerusahaan}`,
        0
      );
      return db.profilPerusahaan;
    });
  }
  // ==========================================
  // 11. REKAPAN LENGKAP SEMUA TRANSAKSI (JURNAL HARIAN TERPADU)
  // Menampilkan seluruh transaksi kasir, pembelian kulakan,
  // pembelian hasil bumi, kasbon, bayar bon, biaya divisi, upah, transfer
  // ==========================================
  static getAllUnifiedTransactions(filters) {
    const db = dbManager.get();
    const normalizeDateStr = (d) => {
      if (!d) return "";
      const clean = d.trim();
      const parts = clean.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
        } else {
          return `${parts[0].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[2]}`;
        }
      }
      return clean;
    };
    const targetDate = filters?.tanggal && filters.tanggal !== "ALL" ? normalizeDateStr(filters.tanggal) : null;
    const list = [];
    for (const p of db.penjualan || []) {
      const isBon = p.metode === "KASBON";
      const isInternal = p.metode === "INTERNAL_PT" || p.rekeningTujuan === "INTERNAL_PT";
      const isNonTunai = isBon || isInternal;
      const itemsDesc = p.items?.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(", ") || "Penjualan Toko";
      list.push({
        id: p.noPenjualan,
        tanggal: normalizeDateStr(p.tanggal),
        jam: p.jam || "08:00",
        timestamp: p.createdAt || p.tanggal,
        jenis: "PENJUALAN",
        jenisLabel: isInternal ? "Pemakaian Internal PT" : "Penjualan Toko",
        arusUang: isNonTunai ? "NON_TUNAI" : "MASUK",
        arusUangLabel: isBon ? "Piutang Bon (Non-Tunai)" : isInternal ? "Pemakaian Internal (Non-Tunai)" : "Uang Masuk (+)",
        deskripsi: `${itemsDesc} [${p.metode}]`,
        pihakTerkait: p.namaMitra || "Pelanggan Umum",
        kategoriPihak: isInternal ? "INTERNAL" : "MITRA",
        rekening: p.rekeningTujuan || "KAS01",
        nominal: p.totalNominal,
        nominalMasuk: isNonTunai ? 0 : p.totalNominal,
        nominalKeluar: 0,
        metode: p.metode,
        status: p.statusPembayaran,
        divisi: p.divisi
      });
    }
    for (const jhb of db.penjualanHasilBumi || []) {
      const isPiutang = jhb.metodePembayaran === "PIUTANG";
      list.push({
        id: jhb.noPenjualan,
        tanggal: normalizeDateStr(jhb.tanggal),
        jam: jhb.jam || "09:30",
        timestamp: jhb.createdAt || jhb.tanggal,
        jenis: "PENJUALAN_HASIL_BUMI",
        jenisLabel: "Penjualan Hasil Bumi",
        arusUang: isPiutang ? "NON_TUNAI" : "MASUK",
        arusUangLabel: isPiutang ? "Piutang Pabrik/Mitra (Non-Tunai)" : "Uang Masuk (+)",
        deskripsi: `Jual ${jhb.komoditasNama} (${jhb.beratBersih.toLocaleString("id-ID")} kg @ Rp ${jhb.hargaJualPerKg.toLocaleString("id-ID")}) [${jhb.metodePembayaran}]${jhb.divisi ? ` \xB7 ${jhb.divisi}` : ""}`,
        pihakTerkait: jhb.namaMitra || "Pembeli Umum",
        kategoriPihak: "MITRA",
        rekening: jhb.rekeningTujuan || "KAS01",
        nominal: jhb.totalNominal,
        nominalMasuk: isPiutang ? 0 : jhb.totalNominal,
        nominalKeluar: 0,
        metode: jhb.metodePembayaran,
        status: jhb.statusPembayaran,
        divisi: jhb.divisi
      });
    }
    for (const b of db.pembelianHasilBumi || []) {
      const isPinjamanDana = b.komoditasKode === "PINJAMAN_DANA" || Boolean(b.komoditasNama?.includes("Pinjaman Uang"));
      const isTitip = b.metodePembayaran === "TITIP" && !isPinjamanDana;
      if (isPinjamanDana) {
        const hasRealCashIn = Boolean(b.rekeningSumber && b.rekeningSumber !== "TIT01");
        list.push({
          id: b.noPembelian,
          tanggal: normalizeDateStr(b.tanggal),
          jam: b.jam || "09:00",
          timestamp: b.createdAt || b.tanggal,
          jenis: "PEMBELIAN_HASIL_BUMI",
          jenisLabel: "Pinjaman Dana dari Mitra",
          arusUang: hasRealCashIn ? "MASUK" : "NON_TUNAI",
          arusUangLabel: hasRealCashIn ? "Uang Masuk (+)" : "Saldo Titip (Non-Tunai)",
          deskripsi: b.keterangan || `Pinjaman Uang PT dari Mitra ${b.namaMitra} (Masuk Saldo Titip)`,
          pihakTerkait: b.namaMitra,
          kategoriPihak: "MITRA",
          rekening: b.rekeningSumber || "KAS01",
          nominal: b.totalNominal,
          nominalMasuk: hasRealCashIn ? b.totalNominal : 0,
          nominalKeluar: 0,
          metode: b.metodePembayaran,
          status: b.status,
          fotoBukti: b.fotoNota,
          divisi: b.divisi
        });
      } else {
        list.push({
          id: b.noPembelian,
          tanggal: normalizeDateStr(b.tanggal),
          jam: b.jam || "09:00",
          timestamp: b.createdAt || b.tanggal,
          jenis: "PEMBELIAN_HASIL_BUMI",
          jenisLabel: "Pembelian Hasil Bumi",
          arusUang: isTitip ? "NON_TUNAI" : "KELUAR",
          arusUangLabel: isTitip ? "Titip Timbang (Hutang)" : "Uang Keluar (-)",
          deskripsi: `Beli ${b.komoditasNama} (${b.beratBersih} kg @ Rp ${(b.hargaPerKg || 0).toLocaleString("id-ID")})${b.divisi ? ` \xB7 ${b.divisi}` : ""}`,
          pihakTerkait: b.namaMitra,
          kategoriPihak: "MITRA",
          rekening: b.rekeningSumber || "KAS01",
          nominal: b.totalNominal,
          nominalMasuk: 0,
          nominalKeluar: isTitip ? 0 : b.totalNominal,
          metode: b.metodePembayaran,
          status: b.status,
          fotoBukti: b.fotoNota,
          divisi: b.divisi
        });
      }
    }
    for (const pb of db.pembelianBarang || []) {
      const isHutang = pb.metodePembayaran === "HUTANG";
      const itemsDesc = pb.items?.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(", ") || "Barang Dagangan";
      const supplierName = pb.namaMitra || pb.namaDistributorManual || "Pemasok / Distributor";
      list.push({
        id: pb.noPembelian,
        tanggal: normalizeDateStr(pb.tanggal),
        jam: pb.jam || "10:00",
        timestamp: pb.createdAt || pb.tanggal,
        jenis: "PEMBELIAN_BARANG",
        jenisLabel: "Kulakan Supplier",
        arusUang: isHutang ? "NON_TUNAI" : "KELUAR",
        arusUangLabel: isHutang ? "Hutang Dagang (Tempo)" : "Uang Keluar (-)",
        deskripsi: `Kulakan: ${itemsDesc}${pb.divisi ? ` \xB7 ${pb.divisi}` : ""}`,
        pihakTerkait: supplierName,
        kategoriPihak: "VENDOR",
        rekening: pb.rekeningSumber || "KAS01",
        nominal: pb.totalNominal,
        nominalMasuk: 0,
        nominalKeluar: isHutang ? 0 : pb.totalNominal,
        metode: pb.metodePembayaran,
        status: pb.status,
        fotoBukti: pb.fotoNota,
        divisi: pb.divisi
      });
    }
    for (const k of db.kasbonUang || []) {
      const isNotaLalu = Boolean(k.isNotaLalu || k.rekeningSumber === "BON01");
      list.push({
        id: k.idTransaksi,
        tanggal: normalizeDateStr(k.tanggal),
        jam: k.jam || "11:00",
        timestamp: k.createdAt || k.tanggal,
        jenis: "KASBON_UANG",
        jenisLabel: isNotaLalu ? "Piutang Nota Lalu" : "Kasbon Uang & Pinjaman",
        arusUang: isNotaLalu ? "NON_TUNAI" : "KELUAR",
        arusUangLabel: isNotaLalu ? "Piutang Nota Lalu (Non-Tunai)" : "Uang Keluar (-)",
        deskripsi: isNotaLalu ? `Piutang Nota Lalu: ${k.keterangan || k.noNotaLalu || "Nota Barang Lama"}` : `Kasbon Tunai (${k.keterangan || "Pinjaman Uang"}) [${k.metode}]`,
        pihakTerkait: k.namaMitra,
        kategoriPihak: "MITRA",
        rekening: k.rekeningSumber || "KAS01",
        nominal: k.nominal,
        nominalMasuk: 0,
        nominalKeluar: isNotaLalu ? 0 : k.nominal,
        metode: k.metode,
        status: k.status,
        fotoBukti: k.fotoNota
      });
    }
    for (const by of db.bayarBon || []) {
      const isKompensasi = by.metode === "SINKRON" || by.metode === "KOMPENSASI_TITIP" || by.rekeningTujuan === "SINKRON" || Boolean(by.isKompensasiTitipan);
      const isPotongGaji = by.metode === "POTONG_GAJI" || Boolean(by.isPotongGaji) || by.rekeningTujuan === "POTONG_GAJI" || Boolean(by.keterangan?.startsWith("Potong Gaji") || by.keterangan?.startsWith("Potong Upah") || by.keterangan?.startsWith("Potong Hak Upah"));
      const isNonTunai = isKompensasi || isPotongGaji;
      list.push({
        id: by.idTransaksi,
        tanggal: normalizeDateStr(by.tanggal),
        jam: by.jam || "13:00",
        timestamp: by.createdAt || by.tanggal,
        jenis: "BAYAR_BON",
        jenisLabel: isKompensasi ? "Pelunasan Bon (SINKRON Potong Titipan)" : isPotongGaji ? "Pelunasan Bon (Potong Gaji)" : "Bayar Bon / Pelunasan",
        arusUang: isNonTunai ? "NON_TUNAI" : "MASUK",
        arusUangLabel: isKompensasi ? "Sinkron Titipan (Non-Tunai)" : isPotongGaji ? "Potong Gaji/Upah (Non-Tunai)" : "Uang Masuk (+)",
        deskripsi: `Pelunasan Bon: ${by.keterangan || by.metode}`,
        pihakTerkait: by.namaMitra,
        kategoriPihak: "MITRA",
        rekening: by.rekeningTujuan || "KAS01",
        nominal: by.nominalBayar,
        nominalMasuk: isNonTunai ? 0 : by.nominalBayar,
        nominalKeluar: 0,
        metode: by.metode,
        status: "LUNAS"
      });
    }
    for (const exp of db.pengeluaran || []) {
      list.push({
        id: exp.idTransaksi,
        tanggal: normalizeDateStr(exp.tanggal),
        jam: exp.jam || "14:00",
        timestamp: exp.createdAt || exp.tanggal,
        jenis: "PENGELUARAN_DIVISI",
        jenisLabel: "Beban Operasional Divisi",
        arusUang: "KELUAR",
        arusUangLabel: "Uang Keluar (-)",
        deskripsi: `[${exp.divisi}] ${exp.kategori}: ${exp.keterangan}`,
        pihakTerkait: exp.penerima || exp.divisi,
        kategoriPihak: "DIVISI",
        rekening: exp.rekeningSumber || "KAS01",
        nominal: exp.nominal,
        nominalMasuk: 0,
        nominalKeluar: exp.nominal,
        metode: "TUNAI/TRANSFER",
        status: "SELESAI",
        fotoBukti: exp.fotoKuitansi,
        divisi: exp.divisi
      });
    }
    for (const pt of db.pencairanTitipan || []) {
      const isKompensasi = pt.metodePembayaran === "SINKRON" || pt.metodePembayaran === "KOMPENSASI_BON" || pt.rekeningSumber === "SINKRON" || Boolean(pt.isKompensasiBon);
      list.push({
        id: pt.idPencairan,
        tanggal: normalizeDateStr(pt.tanggal),
        jam: pt.jam || "15:00",
        timestamp: pt.createdAt || pt.tanggal,
        jenis: "PENCAIRAN_TITIPAN",
        jenisLabel: isKompensasi ? "Sinkron Potong Titipan ke Bon" : "Pencairan Titipan Hasil Bumi",
        arusUang: isKompensasi ? "NON_TUNAI" : "KELUAR",
        arusUangLabel: isKompensasi ? "Sinkron Titipan (Non-Tunai)" : "Uang Keluar (-)",
        deskripsi: `Pencairan Titipan: ${pt.keterangan || pt.metodePembayaran}`,
        pihakTerkait: pt.namaMitra,
        kategoriPihak: "MITRA",
        rekening: pt.rekeningSumber || "KAS01",
        nominal: pt.nominalPencairan,
        nominalMasuk: 0,
        nominalKeluar: isKompensasi ? 0 : pt.nominalPencairan,
        metode: pt.metodePembayaran,
        status: "LUNAS"
      });
    }
    for (const u of db.upahHarian || []) {
      const upahNominal = u.totalUpahHarian || u.jumlah || u.upahHarian || 0;
      list.push({
        id: u.id,
        tanggal: normalizeDateStr(u.tanggalKerja),
        jam: "16:30",
        timestamp: u.createdAt || u.tanggalKerja,
        jenis: "UPAH_HARIAN",
        jenisLabel: "Hak Upah Kerja Harian",
        arusUang: "NON_TUNAI",
        arusUangLabel: u.status === "SUDAH_DIBAYAR" ? "Tercair via Slip Gaji" : "Hak Upah Berjalan (Akrual)",
        deskripsi: `Kerja Harian [${u.divisi}]: ${u.item || "Kerja Harian"}${u.catatan ? ` (${u.catatan})` : ""}`,
        pihakTerkait: u.namaKaryawan,
        kategoriPihak: "KARYAWAN",
        rekening: u.rekening || "HUTANG_UPAH",
        nominal: upahNominal,
        nominalMasuk: 0,
        nominalKeluar: 0,
        metode: u.status === "SUDAH_DIBAYAR" ? "LUNAS_SLIP" : "AKRUAL",
        status: u.status || "TERCATAT",
        divisi: u.divisi
      });
    }
    for (const g of db.penggajian || []) {
      list.push({
        id: g.id,
        tanggal: normalizeDateStr(g.tanggal),
        jam: g.jam || "10:00",
        timestamp: `${g.tanggal} ${g.jam || "10:00"}`,
        jenis: "PENGGAJIAN",
        jenisLabel: "Gaji Bulanan Karyawan",
        arusUang: "KELUAR",
        arusUangLabel: "Uang Keluar (-)",
        deskripsi: `Gaji Karyawan Periode ${g.periodeBulan} [${g.divisi}]`,
        pihakTerkait: g.namaKaryawan,
        kategoriPihak: "KARYAWAN",
        rekening: g.rekeningSumber || "KAS01",
        nominal: g.gajiBersihDibayar,
        nominalMasuk: 0,
        nominalKeluar: g.gajiBersihDibayar,
        metode: "TRANSFER",
        status: "SELESAI",
        divisi: g.divisi
      });
    }
    for (const t of db.transferRekening || []) {
      const sRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
      const dRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
      const isAnakTx = Boolean(
        t.idMitraTerkait || this.isAnakPerusahaanRekening(sRek) || this.isAnakPerusahaanRekening(dRek)
      );
      const namaAfiliasi = t.namaMitraTerkait || (this.isAnakPerusahaanRekening(dRek) ? dRek?.nama : this.isAnakPerusahaanRekening(sRek) ? sRek?.nama : "DP Parabot");
      list.push({
        id: t.noTransfer,
        tanggal: normalizeDateStr(t.tanggal),
        jam: t.jam || "12:00",
        timestamp: t.createdAt || t.tanggal,
        jenis: "TRANSFER_REKENING",
        jenisLabel: isAnakTx ? t.tipeMutasiAfiliasi === "TARIK_DARI_ANAK_PERUSAHAAN" || this.isAnakPerusahaanRekening(sRek) ? "Tarik / Talangan Anak Perusahaan" : "Simpan Dana ke Anak Perusahaan" : "Transfer Antar Rekening",
        arusUang: "MUTASI",
        arusUangLabel: isAnakTx ? "1 Transaksi Terpadu (Rekening & Mitra)" : "Mutasi Internal",
        deskripsi: isAnakTx ? `[Terpadu Rekening & Mitra ${namaAfiliasi}] ${t.rekeningSumber} -> ${t.rekeningTujuan} (${t.keterangan || "-"})` : `Transfer Rekening: ${t.rekeningSumber} -> ${t.rekeningTujuan} (${t.keterangan || "-"})`,
        pihakTerkait: isAnakTx ? `${namaAfiliasi} (Anak Perusahaan & Mitra)` : "Internal PT Wijaya Agro",
        kategoriPihak: isAnakTx ? "MITRA" : "INTERNAL",
        rekening: `${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        nominalMasuk: 0,
        nominalKeluar: 0,
        metode: isAnakTx ? "1_TRANSAKSI_TERPADU" : "MUTASI",
        status: t.status
      });
    }
    list.sort((a, b) => {
      const da = a.tanggal.split("/").reverse().join("-");
      const dbDate = b.tanggal.split("/").reverse().join("-");
      if (da !== dbDate) return dbDate.localeCompare(da);
      return (b.jam || "").localeCompare(a.jam || "");
    });
    const dateSet = /* @__PURE__ */ new Set();
    const partySet = /* @__PURE__ */ new Set();
    list.forEach((tx) => {
      if (tx.tanggal) dateSet.add(tx.tanggal);
      if (tx.pihakTerkait) partySet.add(tx.pihakTerkait);
    });
    const daftarTanggalTersedia = Array.from(dateSet).sort((a, b) => {
      const da = a.split("/").reverse().join("-");
      const dbDate = b.split("/").reverse().join("-");
      return dbDate.localeCompare(da);
    });
    const daftarPihakTerkait = Array.from(partySet).sort((a, b) => a.localeCompare(b));
    let filtered = list;
    if (targetDate) {
      filtered = filtered.filter((tx) => tx.tanggal === targetDate);
    }
    if (filters?.arusUang && filters.arusUang !== "ALL") {
      filtered = filtered.filter((tx) => tx.arusUang === filters.arusUang);
    }
    if (filters?.kategori && filters.kategori !== "ALL") {
      filtered = filtered.filter((tx) => tx.jenis === filters.kategori);
    }
    if (filters?.pihakTerkait && filters.pihakTerkait !== "ALL") {
      filtered = filtered.filter(
        (tx) => tx.pihakTerkait.toLowerCase().includes(filters.pihakTerkait.toLowerCase())
      );
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(
        (tx) => tx.id.toLowerCase().includes(q) || tx.deskripsi.toLowerCase().includes(q) || tx.pihakTerkait.toLowerCase().includes(q) || tx.rekening.toLowerCase().includes(q) || tx.jenisLabel.toLowerCase().includes(q) || tx.metode.toLowerCase().includes(q) || Boolean(tx.divisi && tx.divisi.toLowerCase().includes(q))
      );
    }
    const totalUangMasuk = filtered.reduce((s, tx) => s + tx.nominalMasuk, 0);
    const totalUangKeluar = filtered.reduce((s, tx) => s + tx.nominalKeluar, 0);
    const arusKasBersih = totalUangMasuk - totalUangKeluar;
    const totalNonTunai = filtered.filter((tx) => tx.arusUang === "NON_TUNAI").reduce((s, tx) => s + tx.nominal, 0);
    const masukCount = filtered.filter((tx) => tx.arusUang === "MASUK").length;
    const keluarCount = filtered.filter((tx) => tx.arusUang === "KELUAR").length;
    const mutasiCount = filtered.filter((tx) => tx.arusUang === "MUTASI").length;
    const nonTunaiCount = filtered.filter((tx) => tx.arusUang === "NON_TUNAI").length;
    return {
      summary: {
        tanggalQuery: targetDate || "Semua Tanggal",
        totalTransaksi: filtered.length,
        totalUangMasuk,
        totalUangKeluar,
        arusKasBersih,
        totalNonTunai,
        rincianArus: {
          masukCount,
          keluarCount,
          mutasiCount,
          nonTunaiCount
        }
      },
      transactions: filtered,
      daftarPihakTerkait,
      daftarTanggalTersedia
    };
  }
  // ==========================================
  // FITUR: PEMBERSIHAN BUKTI NOTA LALU & SINKRONISASI REKENING MITRA
  // ==========================================
  static getDaftarBuktiNotaLalu(filters) {
    const db = dbManager.get();
    const parseToTime = (str) => {
      if (!str) return 0;
      const clean = str.trim();
      const dmParts = clean.split("/");
      if (dmParts.length === 3) {
        return new Date(parseInt(dmParts[2], 10), parseInt(dmParts[1], 10) - 1, parseInt(dmParts[0], 10)).getTime();
      }
      const ymParts = clean.split("-");
      if (ymParts.length === 3 && ymParts[0].length === 4) {
        return new Date(parseInt(ymParts[0], 10), parseInt(ymParts[1], 10) - 1, parseInt(ymParts[2], 10)).getTime();
      }
      const d = new Date(clean).getTime();
      return isNaN(d) ? 0 : d;
    };
    const allItems = [];
    for (const k of db.kasbonUang || []) {
      const isNotaLalu = k.isNotaLalu === true || k.rekeningSumber === "BON01" || k.keterangan && k.keterangan.toLowerCase().includes("nota lalu") || k.idTransaksi && k.idTransaksi.startsWith("NTL-") || !!k.noNotaLalu;
      const fotoCount = k.fotoNotaList && k.fotoNotaList.length > 0 ? k.fotoNotaList.length : k.fotoNota ? k.fotoNota.split("|||").filter(Boolean).length : 0;
      const hasFoto = fotoCount > 0;
      if (filters?.hanyaNotaLalu && !isNotaLalu) continue;
      if (!isNotaLalu && !hasFoto) continue;
      const displayTgl = k.tanggalNotaLalu || k.tanggal;
      const primaryFoto = k.fotoNotaList?.[0] || (k.fotoNota ? k.fotoNota.split("|||")[0] : "");
      allItems.push({
        id: k.idTransaksi,
        tabel: "kasbonUang",
        tipe: isNotaLalu ? "PIUTANG_NOTA_LALU" : "KASBON_FOTO",
        tipeLabel: isNotaLalu ? "Piutang Bon Barang (Nota Lalu)" : "Kasbon Uang Tunai",
        idMitra: k.idMitra,
        namaMitra: k.namaMitra,
        tanggal: displayTgl,
        jam: k.jam,
        noNota: k.noNotaLalu || k.idTransaksi,
        nominal: k.nominal,
        keterangan: k.keterangan || "-",
        rincianBarang: k.rincianBarangNotaLalu,
        hasFoto,
        fotoNota: primaryFoto,
        fotoNotaCount: fotoCount,
        driveFileUrl: k.driveFileUrl,
        isNotaLalu,
        createdAt: k.createdAt
      });
    }
    for (const pb of db.pembelianHasilBumi || []) {
      const isNotaLalu = pb.isNotaLalu === true || pb.rekeningSumber === "TIT01" || pb.komoditasKode === "TITIP_DANA" || pb.keterangan && pb.keterangan.toLowerCase().includes("nota lalu") || pb.noPembelian && pb.noPembelian.startsWith("TTL-") || !!pb.noNotaLalu;
      const fotoCount = pb.fotoNotaList && pb.fotoNotaList.length > 0 ? pb.fotoNotaList.length : pb.fotoNota ? pb.fotoNota.split("|||").filter(Boolean).length : 0;
      const hasFoto = fotoCount > 0;
      if (filters?.hanyaNotaLalu && !isNotaLalu) continue;
      if (!isNotaLalu && !(pb.metodePembayaran === "TITIP" && hasFoto)) continue;
      const displayTgl = pb.tanggalNotaLalu || pb.tanggal;
      const primaryFoto = pb.fotoNotaList?.[0] || (pb.fotoNota ? pb.fotoNota.split("|||")[0] : "");
      allItems.push({
        id: pb.noPembelian,
        tabel: "pembelianHasilBumi",
        tipe: isNotaLalu ? "TITIP_NOTA_LALU" : "TITIP_FOTO",
        tipeLabel: isNotaLalu ? "Titipan Uang / Panen (Nota Lalu)" : "Titip Hasil Bumi",
        idMitra: pb.idMitra,
        namaMitra: pb.namaMitra,
        tanggal: displayTgl,
        jam: pb.jam,
        noNota: pb.noNotaLalu || pb.noPembelian,
        nominal: pb.totalNominal,
        keterangan: pb.keterangan || (pb.komoditasNama ? `Titip ${pb.komoditasNama}` : "-"),
        hasFoto,
        fotoNota: primaryFoto,
        fotoNotaCount: fotoCount,
        driveFileUrl: pb.driveFileUrl,
        isNotaLalu,
        createdAt: pb.createdAt
      });
    }
    allItems.sort((a, b) => parseToTime(b.tanggal) - parseToTime(a.tanggal));
    let filtered = allItems;
    if (filters?.idMitra && filters.idMitra !== "ALL") {
      filtered = filtered.filter((it) => it.idMitra === filters.idMitra);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      filtered = filtered.filter(
        (it) => it.namaMitra.toLowerCase().includes(q) || it.noNota.toLowerCase().includes(q) || it.keterangan.toLowerCase().includes(q) || it.rincianBarang && it.rincianBarang.toLowerCase().includes(q)
      );
    }
    if (filters?.waktuFilter && filters.waktuFilter !== "ALL") {
      const now = /* @__PURE__ */ new Date();
      const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (filters.waktuFilter === "TODAY") {
        filtered = filtered.filter((it) => {
          const t = parseToTime(it.tanggal);
          return t >= todayTimestamp && t < todayTimestamp + 864e5;
        });
      } else if (filters.waktuFilter === "THIS_MONTH") {
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).getTime();
        filtered = filtered.filter((it) => {
          const t = parseToTime(it.tanggal);
          return t >= startMonth && t <= endMonth;
        });
      } else if (filters.waktuFilter === "BEFORE_DATE" && filters.beforeDate) {
        const threshold = parseToTime(filters.beforeDate) + 86399999;
        filtered = filtered.filter((it) => parseToTime(it.tanggal) <= threshold);
      } else if (filters.waktuFilter === "RANGE") {
        const start = filters.startDate ? parseToTime(filters.startDate) : 0;
        const end = filters.endDate ? parseToTime(filters.endDate) + 86399999 : Infinity;
        filtered = filtered.filter((it) => {
          const t = parseToTime(it.tanggal);
          return t >= start && t <= end;
        });
      }
    }
    let totalPiutangNotaLalu = 0;
    let totalTitipNotaLalu = 0;
    let totalFotoBukti = 0;
    const mitraCountMap = /* @__PURE__ */ new Map();
    for (const it of filtered) {
      if (it.tipe === "PIUTANG_NOTA_LALU" || it.tabel === "kasbonUang") {
        totalPiutangNotaLalu += it.nominal;
      } else {
        totalTitipNotaLalu += it.nominal;
      }
      if (it.hasFoto) totalFotoBukti += it.fotoNotaCount;
      if (!mitraCountMap.has(it.idMitra)) {
        mitraCountMap.set(it.idMitra, { id: it.idMitra, nama: it.namaMitra, count: 0 });
      }
      mitraCountMap.get(it.idMitra).count++;
    }
    return {
      items: filtered,
      summary: {
        totalItems: filtered.length,
        totalPiutangNotaLalu,
        totalTitipNotaLalu,
        totalFotoBukti,
        daftarMitraTerkait: Array.from(mitraCountMap.values()).sort((a, b) => b.count - a.count)
      }
    };
  }
  /**
   * Eksekusi Bersihkan Bukti Nota Lalu & Sinkronkan Rekening Mitra
   */
  static async bersihkanBuktiNotaLalu(params) {
    return await dbManager.executeTransaction((db) => {
      const listData = this.getDaftarBuktiNotaLalu({
        idMitra: params.idMitra,
        waktuFilter: params.waktuFilter,
        beforeDate: params.beforeDate,
        startDate: params.startDate,
        endDate: params.endDate,
        search: params.search,
        hanyaNotaLalu: params.hanyaNotaLalu
      });
      const targetItems = params.targetIds && params.targetIds.length > 0 ? listData.items.filter((it) => params.targetIds.includes(it.id)) : listData.items;
      if (targetItems.length === 0) {
        return {
          success: true,
          countDeleted: 0,
          affectedMitraIds: [],
          affectedMitraNames: [],
          totalNominalPiutang: 0,
          totalNominalTitip: 0,
          message: "Tidak ada bukti nota lalu yang sesuai dengan kriteria yang dipilih."
        };
      }
      const affectedMitraIdSet = /* @__PURE__ */ new Set();
      const affectedMitraNameSet = /* @__PURE__ */ new Set();
      let totalNominalPiutang = 0;
      let totalNominalTitip = 0;
      let count = 0;
      const mode = params.modeHapus || "HAPUS_TRANSAKSI";
      for (const item of targetItems) {
        affectedMitraIdSet.add(item.idMitra);
        affectedMitraNameSet.add(item.namaMitra);
        if (item.tabel === "kasbonUang") {
          const idx = (db.kasbonUang || []).findIndex((k) => k.idTransaksi === item.id);
          if (idx !== -1) {
            if (mode === "HAPUS_TRANSAKSI") {
              totalNominalPiutang += db.kasbonUang[idx].nominal;
              db.kasbonUang.splice(idx, 1);
              count++;
            } else {
              db.kasbonUang[idx].fotoNota = "";
              db.kasbonUang[idx].fotoNotaList = [];
              count++;
            }
          }
        } else if (item.tabel === "pembelianHasilBumi") {
          const idx = (db.pembelianHasilBumi || []).findIndex((pb) => pb.noPembelian === item.id);
          if (idx !== -1) {
            if (mode === "HAPUS_TRANSAKSI") {
              totalNominalTitip += db.pembelianHasilBumi[idx].totalNominal;
              db.pembelianHasilBumi.splice(idx, 1);
              count++;
            } else {
              db.pembelianHasilBumi[idx].fotoNota = "";
              db.pembelianHasilBumi[idx].fotoNotaList = [];
              count++;
            }
          }
        }
      }
      dbManager.synchronizeVirtualAccounts();
      const affectedMitraIds = Array.from(affectedMitraIdSet);
      const affectedMitraNames = Array.from(affectedMitraNameSet);
      const { tanggal, jam } = getWIBDateTime();
      const auditMsg = mode === "HAPUS_TRANSAKSI" ? `Membersihkan ${count} bukti transaksi nota lalu untuk mitra [${affectedMitraNames.slice(0, 4).join(", ")}${affectedMitraNames.length > 4 ? ` +${affectedMitraNames.length - 4}` : ""}] (Total Piutang Berkurang: Rp ${totalNominalPiutang.toLocaleString("id-ID")}, Total Titip Berkurang: Rp ${totalNominalTitip.toLocaleString("id-ID")})` : `Membersihkan foto bukti fisik pada ${count} transaksi untuk mitra [${affectedMitraNames.slice(0, 4).join(", ")}]`;
      this.addAuditLog(
        db,
        "VOID",
        `VOID-NOTALALU-${Date.now()}`,
        auditMsg,
        totalNominalPiutang + totalNominalTitip,
        "BON01/TIT01"
      );
      const msgAction = mode === "HAPUS_TRANSAKSI" ? `Berhasil menghapus ${count} bukti nota lalu. Rekening koran ${affectedMitraNames.length} mitra telah otomatis disesuaikan.` : `Berhasil membersihkan foto lampiran pada ${count} transaksi nota.`;
      return {
        success: true,
        countDeleted: count,
        affectedMitraIds,
        affectedMitraNames,
        totalNominalPiutang,
        totalNominalTitip,
        message: msgAction
      };
    });
  }
  // ==========================================
  // 10. PUSAT KONTROL KASIR: KLIRING SILANG, DETEKSI NAMA KEMBAR & CASH OPNAME
  // ==========================================
  static normalizeIndonesianName(rawName) {
    const lower = (rawName || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
    const honorificRegex = /^(bapak|bpk|pak|ibu|bu|haji|hj|h|mas|mbak|kang|bang|cak|om|tante|sdr|toko|ud|cv|pt)\s+/i;
    let stripped = lower;
    while (honorificRegex.test(stripped)) {
      stripped = stripped.replace(honorificRegex, "").trim();
    }
    const phoneticTokens = stripped.split(" ").map((word) => {
      return word.replace(/oe/g, "u").replace(/dj/g, "j").replace(/tj/g, "c").replace(/sy/g, "s").replace(/sh/g, "s").replace(/kh/g, "k").replace(/ch/g, "k").replace(/ph/g, "p").replace(/f/g, "p").replace(/v/g, "p").replace(/y/g, "i").replace(/d$/g, "t").replace(/b$/g, "p").replace(/g$/g, "k").replace(/(.)\1+/g, "$1");
    });
    return {
      rawClean: stripped,
      phoneticKey: phoneticTokens.join(" ")
    };
  }
  static levenshteinSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    const maxLen = Math.max(m, n);
    return maxLen === 0 ? 1 : (maxLen - dp[m][n]) / maxLen;
  }
  static getSmartControlOverview() {
    const db = dbManager.get();
    const { tanggal } = getWIBDateTime();
    const rekapMitra = this.getRekapMasterMitra();
    const semuaMitraSaldo = rekapMitra.items.filter((m) => m.status === "AKTIF" && (m.totalHutangTitipPanen > 0 || m.totalBonMitra > 0)).map((m) => {
      const unpaidBarangCount = (db.penjualan || []).filter(
        (p) => p.idMitra === m.id && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR" && p.sisaPiutang > 0
      ).length;
      const unpaidUangCount = (db.kasbonUang || []).filter(
        (k) => k.idMitra === m.id && k.status !== "LUNAS" && k.sisaKasbon > 0
      ).length;
      const saldoTitipan = m.totalHutangTitipPanen;
      const totalKasbon = m.totalBonMitra;
      const potensiPotongSilang = Math.min(saldoTitipan, totalKasbon);
      return {
        idMitra: m.id,
        kodeMitra: m.kode,
        namaMitra: m.nama,
        role: m.role,
        telepon: m.telepon,
        saldoTitipan,
        kasbonBarang: m.totalKasbonBarang,
        kasbonUang: m.totalKasbonUang,
        totalKasbon,
        potensiPotongSilang,
        hakBersihMitra: Math.max(0, saldoTitipan - totalKasbon),
        sisaKurangBon: Math.max(0, totalKasbon - saldoTitipan),
        jumlahNotaBonAktif: unpaidBarangCount + unpaidUangCount
      };
    }).sort((a, b) => {
      if (b.potensiPotongSilang !== a.potensiPotongSilang) {
        return b.potensiPotongSilang - a.potensiPotongSilang;
      }
      return b.saldoTitipan + b.totalKasbon - (a.saldoTitipan + a.totalKasbon);
    });
    const kandidatKliring = semuaMitraSaldo.filter((k) => k.potensiPotongSilang > 0);
    const pasanganKembar = [];
    const activeItems = rekapMitra.items;
    for (let i = 0; i < activeItems.length; i++) {
      for (let j = i + 1; j < activeItems.length; j++) {
        const mA = activeItems[i];
        const mB = activeItems[j];
        const normA = this.normalizeIndonesianName(mA.nama);
        const normB = this.normalizeIndonesianName(mB.nama);
        if (!normA.rawClean || !normB.rawClean) continue;
        const phoneA = (mA.telepon || "").replace(/[^0-9]/g, "");
        const phoneB = (mB.telepon || "").replace(/[^0-9]/g, "");
        const samePhone = phoneA.length >= 8 && phoneA === phoneB;
        const exactPhonetic = normA.phoneticKey.length >= 3 && normA.phoneticKey === normB.phoneticKey;
        const rawSim = this.levenshteinSimilarity(normA.rawClean, normB.rawClean);
        const phoneticSim = this.levenshteinSimilarity(normA.phoneticKey, normB.phoneticKey);
        let score = 0;
        let alasan = "";
        if (normA.rawClean === normB.rawClean) {
          score = 99;
          alasan = "Nama pokok identik persis (hanya beda gelar/sapaan atau spasi)";
        } else if (exactPhonetic) {
          score = 96;
          alasan = `Ejaan fonetik identik ("${mA.nama}" vs "${mB.nama}", rawan salah input huruf akhir/vokal)`;
        } else if (samePhone) {
          score = Math.max(92, Math.round(phoneticSim * 100));
          alasan = `Nomor telepon/WA sama persis (${mA.telepon})`;
        } else if (phoneticSim >= 0.84 && normA.phoneticKey.length >= 4 && normB.phoneticKey.length >= 4) {
          score = Math.round(phoneticSim * 100);
          alasan = `Kemiripan ejaan nama sangat tinggi (${score}%)`;
        } else if (rawSim >= 0.84 && normA.rawClean.length >= 4 && normB.rawClean.length >= 4) {
          score = Math.round(rawSim * 100);
          alasan = `Kemiripan penulisan nama sangat tinggi (${score}%)`;
        }
        if (score >= 84) {
          const risikoSilang = mA.totalHutangTitipPanen > 0 && mB.totalBonMitra > 0 || mB.totalHutangTitipPanen > 0 && mA.totalBonMitra > 0;
          pasanganKembar.push({
            pairKey: `${mA.id}_${mB.id}`,
            mitraA: mA,
            mitraB: mB,
            similarityScore: score,
            alasanKemiripan: alasan,
            risikoSilang
          });
        }
      }
    }
    pasanganKembar.sort((a, b) => {
      if (a.risikoSilang !== b.risikoSilang) return a.risikoSilang ? -1 : 1;
      return b.similarityScore - a.similarityScore;
    });
    const kas01 = db.rekening.find((r) => r.kode === "KAS01");
    const saldoKas01SaatIni = kas01 ? kas01.saldoSaatIni : 0;
    const masukPenjualanKas01 = (db.penjualan || []).filter((p) => p.tanggal === tanggal && p.metode === "TUNAI" && p.rekeningTujuan === "KAS01").reduce((s, p) => s + (p.totalNominal || 0), 0) + (db.penjualanHasilBumi || []).filter((j) => j.tanggal === tanggal && j.metodePembayaran === "TUNAI" && j.rekeningTujuan === "KAS01").reduce((s, j) => s + (j.totalNominal || 0), 0);
    const masukBayarBonKas01 = (db.bayarBon || []).filter(
      (b) => b.tanggal === tanggal && b.rekeningTujuan === "KAS01" && b.metode !== "KOMPENSASI_TITIP" && b.metode !== "POTONG_GAJI" && !b.isKompensasiTitipan && !b.isPotongGaji
    ).reduce((s, b) => s + (b.nominalBayar || 0), 0);
    const masukPinjamanDanaKas01 = (db.pembelianHasilBumi || []).filter(
      (b) => b.tanggal === tanggal && (b.komoditasKode === "PINJAMAN_DANA" || b.komoditasNama?.includes("Pinjaman Uang")) && b.rekeningSumber === "KAS01"
    ).reduce((s, b) => s + (b.totalNominal || 0), 0);
    const masukTransferKas01 = (db.transferRekening || []).filter((t) => t.tanggal === tanggal && t.rekeningTujuan === "KAS01").reduce((s, t) => s + (t.nominal || 0), 0);
    const keluarBeliPanenKas01 = (db.pembelianHasilBumi || []).filter(
      (b) => b.tanggal === tanggal && b.metodePembayaran === "TUNAI" && b.rekeningSumber === "KAS01" && b.komoditasKode !== "PINJAMAN_DANA" && !b.komoditasNama?.includes("Pinjaman Uang")
    ).reduce((s, b) => s + (b.totalNominal || 0), 0);
    const keluarKulakanKas01 = (db.pembelianBarang || []).filter((b) => b.tanggal === tanggal && b.metodePembayaran === "TUNAI" && b.rekeningSumber === "KAS01").reduce((s, b) => s + (b.totalNominal || 0), 0);
    const keluarKasbonKas01 = (db.kasbonUang || []).filter((k) => k.tanggal === tanggal && k.rekeningSumber === "KAS01" && !k.isNotaLalu).reduce((s, k) => s + (k.nominal || 0), 0);
    const keluarBiayaKas01 = (db.pengeluaran || []).filter((e) => e.tanggal === tanggal && e.rekeningSumber === "KAS01").reduce((s, e) => s + (e.nominal || 0), 0);
    const keluarTitipanKas01 = (db.pencairanTitipan || []).filter(
      (pt) => pt.tanggal === tanggal && pt.rekeningSumber === "KAS01" && pt.metodePembayaran !== "KOMPENSASI_BON" && !pt.isKompensasiBon
    ).reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
    const keluarGajiKas01 = (db.penggajian || []).filter((g) => g.tanggal === tanggal && g.rekeningSumber === "KAS01").reduce((s, g) => s + (g.gajiBersihDibayar || 0), 0);
    const keluarTransferKas01 = (db.transferRekening || []).filter((t) => t.tanggal === tanggal && t.rekeningSumber === "KAS01").reduce((s, t) => s + (t.nominal || 0), 0);
    const kompensasiNonTunaiHariIni = (db.bayarBon || []).filter(
      (b) => b.tanggal === tanggal && (b.metode === "KOMPENSASI_TITIP" || b.metode === "POTONG_GAJI" || b.isKompensasiTitipan || b.isPotongGaji)
    ).reduce((s, b) => s + (b.nominalBayar || 0), 0);
    return {
      kandidatKliring,
      semuaMitraSaldo,
      pasanganKembar,
      cashOpnameLogs: db.cashOpnameLogs || [],
      saldoKas01SaatIni,
      ringkasanKasHariIni: {
        tanggal,
        masukTunaiKas01: masukPenjualanKas01 + masukBayarBonKas01 + masukPinjamanDanaKas01 + masukTransferKas01,
        keluarTunaiKas01: keluarBeliPanenKas01 + keluarKulakanKas01 + keluarKasbonKas01 + keluarBiayaKas01 + keluarTitipanKas01 + keluarGajiKas01 + keluarTransferKas01,
        kompensasiNonTunaiHariIni
      }
    };
  }
  /**
   * Eksekusi Kliring Silang (Potong Bon dari Saldo Titipan Hasil Bumi) + Penyelesaian Sisa Kas/Bank Opsional
   */
  static async processKliringSilangMitra(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error("Data mitra tidak ditemukan");
      if (mitra.status !== "AKTIF") throw new Error(`Mitra ${mitra.nama} berstatus nonaktif`);
      const outstandingPenjualan = (db.penjualan || []).filter(
        (p) => p.idMitra === mitra.id && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR" && p.sisaPiutang > 0
      );
      const outstandingPenjualanHb = (db.penjualanHasilBumi || []).filter(
        (j) => j.idMitra === mitra.id && j.metodePembayaran === "PIUTANG" && j.statusPembayaran === "BELUM_BAYAR" && j.sisaPiutang > 0
      );
      const totalKasbonBarang = outstandingPenjualan.reduce((s, p) => s + p.sisaPiutang, 0) + outstandingPenjualanHb.reduce((s, j) => s + j.sisaPiutang, 0);
      const outstandingKasbonUang = (db.kasbonUang || []).filter(
        (k) => k.idMitra === mitra.id && k.status !== "LUNAS" && k.sisaKasbon > 0
      );
      const totalKasbonUang = outstandingKasbonUang.reduce((s, k) => s + k.sisaKasbon, 0);
      const totalKasbonAwal = totalKasbonBarang + totalKasbonUang;
      const totalTitipHasilBumi = (db.pembelianHasilBumi || []).filter((p) => p.idMitra === mitra.id && p.metodePembayaran === "TITIP").reduce((s, p) => s + p.totalNominal, 0);
      const totalHutangKulakan = (db.pembelianBarang || []).filter((pb) => pb.idMitra === mitra.id && pb.metodePembayaran === "HUTANG" && pb.status !== "LUNAS").reduce((s, pb) => s + (pb.totalNominal || 0), 0);
      const totalTitipKotor = totalTitipHasilBumi + totalHutangKulakan;
      const totalPencairanSebelum = (db.pencairanTitipan || []).filter((pt) => pt.idMitra === mitra.id).reduce((s, pt) => s + pt.nominalPencairan, 0);
      const saldoTitipanAwal = Math.max(0, totalTitipKotor - totalPencairanSebelum);
      const maxPotongSilang = Math.min(saldoTitipanAwal, totalKasbonAwal);
      const nominalPotong = Math.round(Number(params.nominalPotongSilang) || 0);
      const nominalFisik = Math.round(Number(params.nominalPenyelesaianFisik) || 0);
      if (nominalPotong < 0) throw new Error("Nominal potong silang tidak boleh negatif");
      if (nominalPotong > maxPotongSilang) {
        throw new Error(
          `Nominal potong silang (${nominalPotong.toLocaleString("id-ID")}) melebihi batas maksimal silang (${maxPotongSilang.toLocaleString("id-ID")})`
        );
      }
      if (nominalPotong === 0 && nominalFisik <= 0) {
        throw new Error("Tidak ada nominal kliring silang maupun penyelesaian fisik yang diproses");
      }
      const idReferensiKliring = generateId("KLR");
      const alokasiBonLunas = [];
      const allocateBonPayment = (amountToAllocate) => {
        if (amountToAllocate <= 0) return [];
        const localAlokasi = [];
        const allBons = [
          ...outstandingPenjualan.filter((p) => p.sisaPiutang > 0).map((p) => ({
            jenis: "KASBON_BARANG",
            refId: p.noPenjualan,
            sisa: p.sisaPiutang,
            createdAt: p.createdAt,
            sourceObj: p
          })),
          ...outstandingPenjualanHb.filter((j) => j.sisaPiutang > 0).map((j) => ({
            jenis: "KASBON_BARANG",
            refId: j.noPenjualan,
            sisa: j.sisaPiutang,
            createdAt: j.createdAt,
            sourceObj: j
          })),
          ...outstandingKasbonUang.filter((k) => k.sisaKasbon > 0).map((k) => ({
            jenis: "KASBON_UANG",
            refId: k.idTransaksi,
            sisa: k.sisaKasbon,
            createdAt: k.createdAt,
            sourceObj: k
          }))
        ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        let rem = amountToAllocate;
        for (const bon of allBons) {
          if (rem <= 0) break;
          const sebelum = bon.sisa;
          const bayar = Math.min(rem, sebelum);
          const sisaBaru = sebelum - bayar;
          if (bon.jenis === "KASBON_BARANG") {
            const pj = bon.sourceObj;
            pj.sisaPiutang = sisaBaru;
            if (sisaBaru === 0) pj.statusPembayaran = "LUNAS";
          } else {
            const kbu = bon.sourceObj;
            kbu.sisaKasbon = sisaBaru;
            kbu.status = sisaBaru === 0 ? "LUNAS" : "SEBAGIAN";
          }
          localAlokasi.push({
            jenis: bon.jenis,
            refId: bon.refId,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: sisaBaru
          });
          rem -= bayar;
        }
        return localAlokasi;
      };
      let runningTitipan = saldoTitipanAwal;
      let runningKasbon = totalKasbonAwal;
      if (nominalPotong > 0) {
        const alokasiKompensasi = allocateBonPayment(nominalPotong);
        alokasiBonLunas.push(...alokasiKompensasi);
        const sisaBonSetelahPotong = runningKasbon - nominalPotong;
        const sisaTitipSetelahPotong = runningTitipan - nominalPotong;
        if (!db.bayarBon) db.bayarBon = [];
        db.bayarBon.unshift({
          idTransaksi: `${idReferensiKliring}-BON`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: runningKasbon,
          nominalBayar: nominalPotong,
          sisaBonSetelah: sisaBonSetelahPotong,
          metode: "KOMPENSASI_TITIP",
          rekeningTujuan: "KOMPENSASI_TITIP",
          isKompensasiTitipan: true,
          alokasi: alokasiKompensasi,
          keterangan: params.keterangan || `Kliring Potong Bon Otomatis dari Saldo Titipan Hasil Bumi (${idReferensiKliring})`,
          createdAt: iso
        });
        if (!db.pencairanTitipan) db.pencairanTitipan = [];
        db.pencairanTitipan.unshift({
          idPencairan: `${idReferensiKliring}-TIT`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: nominalPotong,
          rekeningSumber: "KOMPENSASI_BON",
          saldoTitipanSebelum: runningTitipan,
          saldoTitipanSisa: sisaTitipSetelahPotong,
          metodePembayaran: "KOMPENSASI_BON",
          isKompensasiBon: true,
          keterangan: params.keterangan || `Potong Saldo Titipan untuk Pelunasan Kasbon Mitra (${idReferensiKliring})`,
          createdAt: iso
        });
        runningTitipan = sisaTitipSetelahPotong;
        runningKasbon = sisaBonSetelahPotong;
      }
      let usedRekeningKode;
      const metodeFisik = params.metodeFisik || "TUNAI";
      if (params.aksiSisa === "CAIRKAN_SISA_TITIPAN" && nominalFisik > 0) {
        if (nominalFisik > runningTitipan) {
          throw new Error(
            `Nominal pencairan sisa (Rp ${nominalFisik.toLocaleString("id-ID")}) melebihi sisa titipan bersih (Rp ${runningTitipan.toLocaleString("id-ID")})`
          );
        }
        const rekKode = metodeFisik === "TUNAI" ? "KAS01" : params.rekeningFisik || "";
        if (!rekKode || rekKode === "BON01" || rekKode === "TIT01") {
          throw new Error("Pilih rekening Kas/Bank riil untuk pencairan sisa titipan");
        }
        const rekAcc = db.rekening.find((r) => r.kode === rekKode && r.status === "AKTIF");
        if (!rekAcc) throw new Error(`Rekening ${rekKode} tidak ditemukan atau tidak aktif`);
        if (rekAcc.saldoSaatIni < nominalFisik) {
          throw new Error(
            `Saldo ${rekAcc.nama} (Rp ${rekAcc.saldoSaatIni.toLocaleString("id-ID")}) tidak cukup untuk mencairkan sisa panen Rp ${nominalFisik.toLocaleString("id-ID")}`
          );
        }
        rekAcc.saldoSaatIni -= nominalFisik;
        usedRekeningKode = rekAcc.kode;
        const sisaAkhirTitip = runningTitipan - nominalFisik;
        db.pencairanTitipan.unshift({
          idPencairan: `${idReferensiKliring}-CAIR`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          nominalPencairan: nominalFisik,
          rekeningSumber: rekAcc.kode,
          saldoTitipanSebelum: runningTitipan,
          saldoTitipanSisa: sisaAkhirTitip,
          metodePembayaran: metodeFisik,
          isKompensasiBon: false,
          keterangan: `Pencairan Sisa Bersih Hasil Bumi setelah Potong Bon (${idReferensiKliring})`,
          createdAt: iso
        });
        runningTitipan = sisaAkhirTitip;
      } else if (params.aksiSisa === "TERIMA_PELUNASAN_SISA_BON" && nominalFisik > 0) {
        if (nominalFisik > runningKasbon) {
          throw new Error(
            `Nominal setoran pelunasan (Rp ${nominalFisik.toLocaleString("id-ID")}) melebihi sisa bon mitra (Rp ${runningKasbon.toLocaleString("id-ID")})`
          );
        }
        const rekKode = metodeFisik === "TUNAI" ? "KAS01" : params.rekeningFisik || "";
        if (!rekKode || rekKode === "BON01" || rekKode === "TIT01") {
          throw new Error("Pilih rekening Kas/Bank riil penerima pelunasan sisa bon");
        }
        const rekAcc = db.rekening.find((r) => r.kode === rekKode && r.status === "AKTIF");
        if (!rekAcc) throw new Error(`Rekening ${rekKode} tidak ditemukan atau tidak aktif`);
        rekAcc.saldoSaatIni += nominalFisik;
        usedRekeningKode = rekAcc.kode;
        const alokasiSisa = allocateBonPayment(nominalFisik);
        alokasiBonLunas.push(...alokasiSisa);
        const sisaAkhirBon = runningKasbon - nominalFisik;
        db.bayarBon.unshift({
          idTransaksi: `${idReferensiKliring}-LUNAS`,
          tanggal,
          jam,
          idMitra: mitra.id,
          namaMitra: mitra.nama,
          totalBonSebelum: runningKasbon,
          nominalBayar: nominalFisik,
          sisaBonSetelah: sisaAkhirBon,
          metode: metodeFisik,
          rekeningTujuan: rekAcc.kode,
          isKompensasiTitipan: false,
          alokasi: alokasiSisa,
          keterangan: `Setoran Pelunasan Sisa Bon setelah Potong Titipan (${idReferensiKliring})`,
          createdAt: iso
        });
        runningKasbon = sisaAkhirBon;
      }
      dbManager.synchronizeVirtualAccounts();
      const ketAudit = `Kliring Silang Mitra ${mitra.nama} (${idReferensiKliring}): Potong Silang Non-Tunai Rp ${nominalPotong.toLocaleString("id-ID")}${nominalFisik > 0 ? `, Penyelesaian Fisik (${params.aksiSisa}) Rp ${nominalFisik.toLocaleString("id-ID")} via ${usedRekeningKode}` : ""}. Sisa Titipan: Rp ${runningTitipan.toLocaleString("id-ID")}, Sisa Bon: Rp ${runningKasbon.toLocaleString("id-ID")}`;
      this.addAuditLog(
        db,
        "PAYMENT",
        idReferensiKliring,
        ketAudit,
        nominalPotong + nominalFisik,
        usedRekeningKode || "BON01/TIT01"
      );
      return {
        idReferensiKliring,
        tanggal,
        jam,
        idMitra: mitra.id,
        kodeMitra: mitra.kode,
        namaMitra: mitra.nama,
        saldoTitipanAwal,
        totalKasbonAwal,
        nominalPotongSilang: nominalPotong,
        aksiSisa: params.aksiSisa,
        nominalPenyelesaianFisik: nominalFisik,
        metodeFisik: nominalFisik > 0 ? metodeFisik : void 0,
        rekeningFisik: usedRekeningKode,
        saldoTitipanAkhir: runningTitipan,
        sisaKasbonAkhir: runningKasbon,
        alokasiBonLunas,
        keterangan: params.keterangan || ketAudit
      };
    });
  }
  /**
   * Batch Kliring Otomatis Non-Tunai untuk seluruh Mitra terpilih yang memiliki Saldo Ganda (Titipan & Bon)
   */
  static async processBatchKliringOtomatis(mitraIds) {
    const overview = this.getSmartControlOverview();
    const targets = overview.kandidatKliring.filter(
      (k) => k.potensiPotongSilang > 0 && (!mitraIds || mitraIds.length === 0 || mitraIds.includes(k.idMitra))
    );
    const items = [];
    let totalKompensasi = 0;
    for (const t of targets) {
      const res = await this.processKliringSilangMitra({
        idMitra: t.idMitra,
        nominalPotongSilang: t.potensiPotongSilang,
        aksiSisa: "HANYA_POTONG_SILANG",
        keterangan: "Kliring Silang Massal Otomatis (Kompensasi Titipan Panen vs Kasbon)"
      });
      items.push(res);
      totalKompensasi += res.nominalPotongSilang;
    }
    return {
      processedCount: items.length,
      totalKompensasi,
      items
    };
  }
  /**
   * Konsolidasi / Gabungkan Dua Akun Mitra Kembar secara Atomik di Seluruh Tabel Transaksi
   */
  static async mergeDuplicateMitra(params) {
    return await dbManager.executeTransaction((db) => {
      if (!params.primaryMitraId || !params.duplicateMitraId) {
        throw new Error("Pilih akun mitra utama dan akun mitra duplikat yang akan digabungkan");
      }
      if (params.primaryMitraId === params.duplicateMitraId) {
        throw new Error("Akun mitra utama dan akun duplikat tidak boleh sama");
      }
      const primary = db.mitra.find((m) => m.id === params.primaryMitraId);
      const duplicateIdx = db.mitra.findIndex((m) => m.id === params.duplicateMitraId);
      if (!primary) throw new Error("Akun mitra utama tidak ditemukan");
      if (duplicateIdx === -1) throw new Error("Akun mitra duplikat tidak ditemukan");
      const duplicate = db.mitra[duplicateIdx];
      const counts = {
        penjualan: 0,
        penjualanHasilBumi: 0,
        pembelianHasilBumi: 0,
        pembelianBarang: 0,
        kasbonUang: 0,
        bayarBon: 0,
        pencairanTitipan: 0,
        karyawanLink: 0
      };
      for (const p of db.penjualan || []) {
        if (p.idMitra === duplicate.id) {
          p.idMitra = primary.id;
          p.namaMitra = primary.nama;
          counts.penjualan++;
        }
      }
      for (const jhb of db.penjualanHasilBumi || []) {
        if (jhb.idMitra === duplicate.id) {
          jhb.idMitra = primary.id;
          jhb.namaMitra = primary.nama;
          counts.penjualanHasilBumi++;
        }
      }
      for (const pb of db.pembelianHasilBumi || []) {
        if (pb.idMitra === duplicate.id) {
          pb.idMitra = primary.id;
          pb.namaMitra = primary.nama;
          counts.pembelianHasilBumi++;
        }
      }
      for (const pbb of db.pembelianBarang || []) {
        if (pbb.idMitra === duplicate.id) {
          pbb.idMitra = primary.id;
          pbb.namaMitra = primary.nama;
          counts.pembelianBarang++;
        }
      }
      for (const k of db.kasbonUang || []) {
        if (k.idMitra === duplicate.id) {
          k.idMitra = primary.id;
          k.namaMitra = primary.nama;
          counts.kasbonUang++;
        }
      }
      for (const b of db.bayarBon || []) {
        if (b.idMitra === duplicate.id) {
          b.idMitra = primary.id;
          b.namaMitra = primary.nama;
          counts.bayarBon++;
        }
      }
      for (const pt of db.pencairanTitipan || []) {
        if (pt.idMitra === duplicate.id) {
          pt.idMitra = primary.id;
          pt.namaMitra = primary.nama;
          counts.pencairanTitipan++;
        }
      }
      for (const kry of db.karyawan || []) {
        if (kry.idMitraTerkait === duplicate.id) {
          kry.idMitraTerkait = primary.id;
          counts.karyawanLink++;
        }
      }
      if ((!primary.telepon || primary.telepon === "-") && duplicate.telepon && duplicate.telepon !== "-") {
        primary.telepon = duplicate.telepon;
      }
      if ((!primary.alamat || primary.alamat === "-") && duplicate.alamat && duplicate.alamat !== "-") {
        primary.alamat = duplicate.alamat;
      }
      primary.catatan = [
        primary.catatan,
        `Digabung dari akun duplikat "${duplicate.nama}" (${duplicate.kode})`
      ].filter(Boolean).join(" | ");
      db.mitra.splice(duplicateIdx, 1);
      dbManager.synchronizeVirtualAccounts();
      const totalMigrated = Object.values(counts).reduce((a, b) => a + b, 0);
      this.addAuditLog(
        db,
        "UPDATE",
        `MERGE-${primary.kode}`,
        `Penggabungan Akun Mitra Kembar: "${duplicate.nama}" (${duplicate.kode}) digabung ke "${primary.nama}" (${primary.kode}). Total ${totalMigrated} riwayat transaksi disatukan.${params.alasan ? ` Catatan: ${params.alasan}` : ""}`,
        0,
        "BON01/TIT01"
      );
      return {
        success: true,
        message: `Akun "${duplicate.nama}" berhasil digabungkan ke "${primary.nama}" (${totalMigrated} transaksi dipindahkan).`,
        migratedCounts: counts,
        primaryMitraNama: primary.nama,
        mergedDuplicateNama: duplicate.nama
      };
    });
  }
  /**
   * Simpan Berita Acara Cash Opname Fisik Laci Kasir (KAS01)
   */
  static async recordCashOpname(params) {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();
      const kas01 = db.rekening.find((r) => r.kode === "KAS01");
      if (!kas01) throw new Error("Rekening Kas Utama KAS01 tidak ditemukan");
      let totalFisikLaci = 0;
      const cleanPecahan = {};
      for (const [denomStr, lembar] of Object.entries(params.rincianPecahan || {})) {
        const denom = Number(denomStr);
        const qty = Math.max(0, Math.floor(Number(lembar) || 0));
        if (!isNaN(denom) && denom > 0) {
          cleanPecahan[denomStr] = qty;
          totalFisikLaci += denom * qty;
        }
      }
      const saldoSistemSebelum = kas01.saldoSaatIni;
      const selisih = totalFisikLaci - saldoSistemSebelum;
      const statusRekonsiliasi = selisih === 0 ? "COCOK" : selisih > 0 ? "SELISIH_LEBIH" : "SELISIH_KURANG";
      const id = generateId("OPN");
      const record = {
        id,
        tanggal,
        jam,
        petugasKasir: (params.petugasKasir || "Staf Kasir Utama").trim(),
        saldoSistemSebelum,
        totalFisikLaci,
        selisih,
        statusRekonsiliasi,
        rincianPecahan: cleanPecahan,
        sesuaikanSaldoSistem: Boolean(params.sesuaikanSaldoSistem && selisih !== 0),
        catatan: (params.catatan || "").trim(),
        createdAt: iso
      };
      if (!db.cashOpnameLogs) db.cashOpnameLogs = [];
      db.cashOpnameLogs.unshift(record);
      if (params.sesuaikanSaldoSistem && selisih !== 0) {
        kas01.saldoSaatIni = totalFisikLaci;
      }
      this.addAuditLog(
        db,
        "UPDATE",
        id,
        `Berita Acara Cash Opname Laci KAS01 oleh ${record.petugasKasir}: Saldo Sistem Rp ${saldoSistemSebelum.toLocaleString("id-ID")}, Fisik Laci Rp ${totalFisikLaci.toLocaleString("id-ID")}, Selisih Rp ${selisih.toLocaleString("id-ID")} (${statusRekonsiliasi})${record.sesuaikanSaldoSistem ? " [Saldo KAS01 Disesuaikan]" : ""}`,
        Math.abs(selisih),
        "KAS01",
        record.petugasKasir
      );
      return record;
    });
  }
  // ==========================================
  // 12. UNIVERSAL DETAIL LOOKUP & ATOMIC TRANSACTION EDITOR
  // Memungkinkan koreksi/edit detail setiap transaksi (Nominal, Tonase, Rafaksi, Qty, Harga, Rekening, Tanggal, Keterangan)
  // dengan sinkronisasi otomatis ke Stok Gudang, HPP Modal Riil, Saldo Kas/Bank, Piutang/Titipan, & Audit Log
  // ==========================================
  static getTransactionDetail(idTransaksi, jenisHint) {
    const db = dbManager.get();
    const cleanId = String(idTransaksi || "").trim();
    if (!cleanId) {
      throw new Error("ID transaksi wajib diisi");
    }
    const masters = {
      rekeningList: db.rekening || [],
      produkList: db.produk || [],
      stokBarangList: db.stokBarang || [],
      stokHasilBumiList: db.stokHasilBumi || [],
      mitraList: db.mitra || [],
      divisiList: dbManager.getDivisiList()
    };
    const candidates = [
      { jenis: "PEMBELIAN_HASIL_BUMI", finder: () => (db.pembelianHasilBumi || []).find((x) => x.noPembelian === cleanId) },
      { jenis: "PENJUALAN_HASIL_BUMI", finder: () => (db.penjualanHasilBumi || []).find((x) => x.noPenjualan === cleanId) },
      { jenis: "PEMBELIAN_BARANG", finder: () => (db.pembelianBarang || []).find((x) => x.noPembelian === cleanId) },
      { jenis: "PENJUALAN", finder: () => (db.penjualan || []).find((x) => x.noPenjualan === cleanId) },
      { jenis: "KASBON_UANG", finder: () => (db.kasbonUang || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: "BAYAR_BON", finder: () => (db.bayarBon || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: "PENCAIRAN_TITIPAN", finder: () => (db.pencairanTitipan || []).find((x) => x.idPencairan === cleanId) },
      { jenis: "PENGELUARAN_DIVISI", finder: () => (db.pengeluaran || []).find((x) => x.idTransaksi === cleanId) },
      { jenis: "TRANSFER_REKENING", finder: () => (db.transferRekening || []).find((x) => x.noTransfer === cleanId) },
      { jenis: "UPAH_HARIAN", finder: () => (db.upahHarian || []).find((x) => x.id === cleanId) },
      { jenis: "PENGGAJIAN", finder: () => (db.penggajian || []).find((x) => x.id === cleanId) }
    ];
    if (jenisHint) {
      const exact = candidates.find((c) => c.jenis === jenisHint);
      if (exact) {
        const found = exact.finder();
        if (found) {
          return { jenis: exact.jenis, id: cleanId, record: found, masters };
        }
      }
    }
    for (const c of candidates) {
      const found = c.finder();
      if (found) {
        return { jenis: c.jenis, id: cleanId, record: found, masters };
      }
    }
    throw new Error(`Transaksi dengan ID ${cleanId} tidak ditemukan di database`);
  }
  static async editTransactionDetail(params) {
    return await dbManager.executeTransaction((db) => {
      const { iso } = getWIBDateTime();
      const lookup = this.getTransactionDetail(params.idTransaksi, params.jenis);
      const { jenis, id: cleanId } = lookup;
      const resolveMitraOrManual = (currentId, currentNama, defaultFallback) => {
        if (params.idMitra !== void 0) {
          if (params.idMitra === "UMUM" || params.idMitra === "MANUAL" || params.idMitra === "") {
            return {
              id: params.idMitra === "MANUAL" ? "MANUAL-DIST" : "UMUM",
              nama: params.namaMitraManual?.trim() || currentNama || defaultFallback
            };
          }
          const m = db.mitra.find((mt) => mt.id === params.idMitra);
          if (!m) throw new Error("Mitra terdaftar yang dipilih tidak ditemukan");
          return { id: m.id, nama: m.nama };
        }
        if (params.namaMitraManual !== void 0 && params.namaMitraManual.trim()) {
          return { id: currentId, nama: params.namaMitraManual.trim() };
        }
        return { id: currentId, nama: currentNama || defaultFallback };
      };
      const recalculateProductHppFromRealPurchases = (kodeProduk) => {
        const cleanKode = String(kodeProduk || "").trim().toUpperCase();
        if (!cleanKode || cleanKode === "REKAP-NOTA") return;
        const prod = db.produk.find((p) => String(p.kode || "").trim().toUpperCase() === cleanKode);
        const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
        if (!prod) return;
        let sumQty = 0;
        let sumModal = 0;
        for (const pb of db.pembelianBarang || []) {
          for (const it of pb.items || []) {
            if (String(it.kodeProduk || "").trim().toUpperCase() === cleanKode) {
              const q = Math.max(0, Number(it.qty) || 0);
              const h = Math.max(0, Number(it.hargaBeliSatuan) || 0);
              sumQty += q;
              sumModal += q * h;
            }
          }
        }
        if (sumQty > 0) {
          prod.hargaBeli = Math.round(sumModal / sumQty);
          if (!prod.hargaJual || prod.hargaJual <= 0) {
            prod.hargaJual = prod.hargaBeli;
          }
          if (!prod.hargaKhususRekanan || prod.hargaKhususRekanan <= 0) {
            prod.hargaKhususRekanan = prod.hargaJual || prod.hargaBeli;
          }
        } else if ((stokItem?.stok || 0) === 0) {
          prod.hargaBeli = 0;
        }
      };
      const computeKomoditasModalPerKg = (komoditas) => {
        const stokAwalKg = Number(komoditas.stokAwal) || 0;
        const modalAwalUang = Number(komoditas.modalAwalTotal) || stokAwalKg * (Number(komoditas.rataRataModalAwal) || 0);
        const physicalPurchases = (db.pembelianHasilBumi || []).filter(
          (p) => this.isPhysicalPembelianHasilBumi(p) && (p.komoditasKode === komoditas.kode || p.komoditasNama.toUpperCase().trim() === komoditas.nama.toUpperCase().trim())
        );
        const totalUangBeli = modalAwalUang + physicalPurchases.reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0);
        const totalKgBeli = stokAwalKg + physicalPurchases.reduce((sum, p) => sum + (Number(p.beratBersih) || 0), 0);
        return totalKgBeli > 0 && totalUangBeli > 0 ? Math.round(totalUangBeli / totalKgBeli) : Math.max(0, Number(komoditas.rataRataModalAwal) || 0);
      };
      let auditSummary = "";
      let auditNominal = 0;
      let auditRekening = "";
      let updatedRecord = null;
      if (jenis === "PEMBELIAN_HASIL_BUMI") {
        const record = db.pembelianHasilBumi.find((p) => p.noPembelian === cleanId);
        const isNonPhysical = record.komoditasKode === "PINJAMAN_DANA" || record.komoditasKode === "TITIP_DANA" || Boolean(record.komoditasNama?.toLowerCase().includes("pinjaman uang")) || record.beratBersih === 0 && record.beratKotor === 0 && params.beratKotor === void 0;
        if (isNonPhysical) {
          const oldNominal = record.totalNominal;
          const isPinjamanDana = record.komoditasKode === "PINJAMAN_DANA" || Boolean(record.komoditasNama?.toLowerCase().includes("pinjaman uang"));
          if (isPinjamanDana && record.rekeningSumber && record.rekeningSumber !== "TIT01" && record.rekeningSumber !== "BON01") {
            const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
            if (oldRek) oldRek.saldoSaatIni -= oldNominal;
          }
          const newNominal = Math.round(Number(params.nominal ?? record.totalNominal));
          if (isNaN(newNominal) || newNominal <= 0) {
            throw new Error("Nominal transaksi harus lebih dari Rp 0");
          }
          const party = resolveMitraOrManual(record.idMitra, record.namaMitra, "Mitra");
          record.idMitra = party.id;
          record.namaMitra = party.nama;
          record.totalNominal = newNominal;
          if (params.tanggal) {
            record.tanggal = params.tanggal.trim();
            if (record.isNotaLalu) record.tanggalNotaLalu = params.tanggal.trim();
          }
          if (params.noNotaLalu !== void 0) record.noNotaLalu = params.noNotaLalu.trim();
          if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
          if (isPinjamanDana) {
            const targetRekKode = params.rekeningSumber || record.rekeningSumber || "KAS01";
            if (targetRekKode !== "TIT01" && targetRekKode !== "BON01") {
              const newRek = db.rekening.find((r) => r.kode === targetRekKode);
              if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan`);
              if (newRek.saldoSaatIni + newNominal < 0 && !this.isAnakPerusahaanRekening(newRek)) {
                throw new Error(`Saldo rekening ${newRek.nama} menjadi negatif akibat koreksi nominal ini`);
              }
              newRek.saldoSaatIni += newNominal;
              record.rekeningSumber = newRek.kode;
            }
          }
          auditSummary = `Edit Detail ${record.komoditasNama} (${cleanId} - ${record.namaMitra}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newNominal.toLocaleString("id-ID")}`;
          auditNominal = newNominal;
          auditRekening = record.rekeningSumber;
          updatedRecord = record;
        } else {
          const oldKg = Number(record.beratBersih) || 0;
          const oldNominal = Number(record.totalNominal) || 0;
          const oldKomoditas = db.stokHasilBumi.find(
            (k) => k.kode === record.komoditasKode || k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
          );
          if (oldKomoditas) {
            oldKomoditas.stok = Math.round((oldKomoditas.stok - oldKg) * 100) / 100;
          }
          if (!record.isBelumPutusHarga && (record.metodePembayaran === "TUNAI" || record.metodePembayaran === "TRANSFER") && record.rekeningSumber && record.rekeningSumber !== "TIT01" && record.rekeningSumber !== "BON01") {
            const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
            if (oldRek) oldRek.saldoSaatIni += oldNominal;
          }
          const targetKomKode = params.komoditasKode || record.komoditasKode;
          const newKomoditas = db.stokHasilBumi.find((k) => k.kode === targetKomKode);
          if (!newKomoditas) {
            throw new Error(`Komoditas dengan kode ${targetKomKode} tidak ditemukan`);
          }
          const beratKotor = Number(params.beratKotor ?? record.beratKotor);
          const potonganRafaksi = Number(params.potonganRafaksi ?? record.potonganRafaksi ?? 0);
          if (isNaN(beratKotor) || beratKotor <= 0) {
            throw new Error("Berat kotor timbangan harus lebih dari 0 Kg");
          }
          if (isNaN(potonganRafaksi) || potonganRafaksi < 0 || potonganRafaksi >= 100) {
            throw new Error("Potongan rafaksi harus antara 0% dan 99.9%");
          }
          const beratBersih = params.beratBersihManual !== void 0 && Number(params.beratBersihManual) > 0 ? Math.round(Number(params.beratBersihManual) * 100) / 100 : Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;
          if (beratBersih <= 0) {
            throw new Error("Berat bersih hasil timbangan harus lebih dari 0 Kg");
          }
          const isBelumPutus = params.isBelumPutusHarga !== void 0 ? Boolean(params.isBelumPutusHarga) : Boolean(record.isBelumPutusHarga);
          let hargaPerKg = Math.max(0, Number(params.hargaPerKg ?? record.hargaPerKg ?? 0));
          let totalNominal = Math.round(beratBersih * hargaPerKg);
          if (params.nominal !== void 0 && params.hargaPerKg === void 0 && Number(params.nominal) >= 0) {
            totalNominal = Math.round(Number(params.nominal));
            hargaPerKg = beratBersih > 0 ? Math.round(totalNominal / beratBersih) : 0;
          }
          if (!isBelumPutus && hargaPerKg <= 0) {
            throw new Error("Harga beli per Kg harus lebih dari Rp 0 (atau centang Belum Putus Harga)");
          }
          newKomoditas.stok = Math.round((newKomoditas.stok + beratBersih) * 100) / 100;
          newKomoditas.updateTerakhir = iso;
          if (oldKomoditas && oldKomoditas.stok < 0) {
            throw new Error(
              `Tidak dapat mengurangi tonase pembelian menjadi ${beratBersih} Kg karena stok "${oldKomoditas.nama}" di gudang menjadi minus (${oldKomoditas.stok} Kg \u2014 sebagian barang sudah terjual keluar gudang).`
            );
          }
          if (newKomoditas.stok < 0) {
            throw new Error(`Stok komoditas "${newKomoditas.nama}" tidak boleh negatif`);
          }
          const rawMetode = isBelumPutus ? "TITIP" : params.metode || record.metodePembayaran || "TUNAI";
          let finalRekSumber = "TIT01";
          let finalStatus = "LUNAS";
          if (isBelumPutus) {
            finalRekSumber = "TIT01";
            finalStatus = "BELUM_PUTUS_HARGA";
          } else if (rawMetode === "TUNAI") {
            finalRekSumber = "KAS01";
            const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
            if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
            if (kasAcc.saldoSaatIni < totalNominal) {
              throw new Error(
                `Saldo KAS01 tidak mencukupi (Tersedia: Rp ${kasAcc.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${totalNominal.toLocaleString("id-ID")})`
              );
            }
            kasAcc.saldoSaatIni -= totalNominal;
            finalStatus = "LUNAS";
          } else if (rawMetode === "TRANSFER") {
            const rekKode = params.rekeningSumber || record.rekeningSumber;
            if (!rekKode || rekKode === "KAS01" || rekKode === "TIT01" || rekKode === "BON01") {
              throw new Error("Pilih rekening Bank sumber transfer yang valid");
            }
            const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === "AKTIF");
            if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
            if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
              throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
            }
            if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < totalNominal) {
              throw new Error(
                `Saldo ${bankAcc.nama} tidak mencukupi (Tersedia: Rp ${bankAcc.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${totalNominal.toLocaleString("id-ID")})`
              );
            }
            bankAcc.saldoSaatIni -= totalNominal;
            finalRekSumber = bankAcc.kode;
            finalStatus = "LUNAS";
          } else {
            finalRekSumber = "TIT01";
            finalStatus = "TITIP";
          }
          const party = resolveMitraOrManual(record.idMitra, record.namaMitra, "Petani Umum");
          record.idMitra = party.id;
          record.namaMitra = party.nama;
          record.komoditasKode = newKomoditas.kode;
          record.komoditasNama = newKomoditas.nama;
          record.beratKotor = beratKotor;
          record.potonganRafaksi = potonganRafaksi;
          record.beratBersih = beratBersih;
          record.hargaPerKg = isBelumPutus && hargaPerKg === 0 ? 0 : hargaPerKg;
          record.totalNominal = isBelumPutus && hargaPerKg === 0 ? 0 : totalNominal;
          record.metodePembayaran = rawMetode;
          record.rekeningSumber = finalRekSumber;
          record.status = finalStatus;
          record.isBelumPutusHarga = isBelumPutus;
          record.statusHarga = isBelumPutus ? "BELUM_PUTUS_HARGA" : "HARGA_PUTUS";
          if (params.divisi !== void 0) record.divisi = params.divisi.trim();
          if (params.tanggal) record.tanggal = params.tanggal.trim();
          if (params.noNotaLalu !== void 0) record.noNotaLalu = params.noNotaLalu.trim();
          if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
          auditSummary = `Edit Pembelian Hasil Bumi ${cleanId} (${record.namaMitra} - ${record.komoditasNama}): Tonase ${oldKg} Kg -> ${beratBersih} Kg, Total Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${record.totalNominal.toLocaleString("id-ID")} [${rawMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ""}]`;
          auditNominal = record.totalNominal;
          auditRekening = finalRekSumber;
          updatedRecord = record;
        }
      } else if (jenis === "PENJUALAN_HASIL_BUMI") {
        const record = (db.penjualanHasilBumi || []).find((j) => j.noPenjualan === cleanId);
        const oldKg = Number(record.beratBersih) || 0;
        const oldNominal = Number(record.totalNominal) || 0;
        const alreadyPaidPiutang = record.metodePembayaran === "PIUTANG" ? Math.max(0, oldNominal - (Number(record.sisaPiutang) || 0)) : 0;
        const oldKomoditas = db.stokHasilBumi.find(
          (k) => k.kode === record.komoditasKode || k.nama.toUpperCase().trim() === record.komoditasNama.toUpperCase().trim()
        );
        if (oldKomoditas) {
          oldKomoditas.stok = Math.round((oldKomoditas.stok + oldKg) * 100) / 100;
        }
        if ((record.metodePembayaran === "TUNAI" || record.metodePembayaran === "TRANSFER") && record.rekeningTujuan && record.rekeningTujuan !== "BON01" && record.rekeningTujuan !== "TIT01") {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) {
            if (!this.isAnakPerusahaanRekening(oldRek) && oldRek.saldoSaatIni - oldNominal < 0 && params.metode !== record.metodePembayaran) {
            }
            oldRek.saldoSaatIni -= oldNominal;
          }
        }
        const targetKomKode = params.komoditasKode || record.komoditasKode;
        const newKomoditas = db.stokHasilBumi.find((k) => k.kode === targetKomKode);
        if (!newKomoditas) {
          throw new Error(`Komoditas dengan kode ${targetKomKode} tidak ditemukan`);
        }
        const beratKotor = Number(params.beratKotor ?? record.beratKotor);
        const potonganRafaksi = Number(params.potonganRafaksi ?? record.potonganRafaksi ?? 0);
        if (isNaN(beratKotor) || beratKotor <= 0) {
          throw new Error("Berat kotor timbangan jual harus lebih dari 0 Kg");
        }
        if (isNaN(potonganRafaksi) || potonganRafaksi < 0 || potonganRafaksi >= 100) {
          throw new Error("Potongan rafaksi harus antara 0% dan 99.9%");
        }
        const beratBersih = params.beratBersihManual !== void 0 && Number(params.beratBersihManual) > 0 ? Math.round(Number(params.beratBersihManual) * 100) / 100 : Math.round(beratKotor * (1 - potonganRafaksi / 100) * 100) / 100;
        if (beratBersih <= 0) {
          throw new Error("Berat bersih penjualan harus lebih dari 0 Kg");
        }
        if (newKomoditas.stok < beratBersih) {
          throw new Error(
            `Stok Ready Gudang "${newKomoditas.nama}" tidak mencukupi untuk koreksi tonase jual ini. Tersedia: ${newKomoditas.stok.toLocaleString("id-ID")} Kg, dibutuhkan: ${beratBersih.toLocaleString("id-ID")} Kg.`
          );
        }
        let hargaJualPerKg = Math.max(
          0,
          Number(params.hargaJualPerKg ?? params.hargaPerKg ?? record.hargaJualPerKg)
        );
        let totalNominal = Math.round(beratBersih * hargaJualPerKg);
        if (params.nominal !== void 0 && params.hargaJualPerKg === void 0 && params.hargaPerKg === void 0) {
          totalNominal = Math.round(Number(params.nominal));
          hargaJualPerKg = beratBersih > 0 ? Math.round(totalNominal / beratBersih) : 0;
        }
        if (hargaJualPerKg <= 0 || totalNominal <= 0) {
          throw new Error("Harga jual per Kg harus lebih dari Rp 0");
        }
        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, "Pembeli / Pabrik Umum");
        const newMetode = params.metode || record.metodePembayaran;
        if (newMetode === "PIUTANG" && party.id === "UMUM") {
          throw new Error("Metode PIUTANG wajib memilih Mitra / Pabrik terdaftar");
        }
        let finalRekTujuan = "KAS01";
        let statusPembayaran = "LUNAS";
        let sisaPiutang = 0;
        if (newMetode === "TUNAI") {
          finalRekTujuan = "KAS01";
          const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
          if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
          kasAcc.saldoSaatIni += totalNominal;
        } else if (newMetode === "TRANSFER") {
          const rekKode = params.rekeningTujuan || record.rekeningTujuan;
          if (!rekKode || rekKode === "KAS01" || rekKode === "BON01" || rekKode === "TIT01") {
            throw new Error("Pilih rekening Bank tujuan transfer yang valid");
          }
          const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === "AKTIF");
          if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
          if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
            throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
          }
          bankAcc.saldoSaatIni += totalNominal;
          finalRekTujuan = bankAcc.kode;
        } else {
          finalRekTujuan = "BON01";
          sisaPiutang = Math.max(0, totalNominal - alreadyPaidPiutang);
          statusPembayaran = sisaPiutang === 0 ? "LUNAS" : "BELUM_BAYAR";
        }
        const stokSebelum = newKomoditas.stok;
        newKomoditas.stok = Math.max(0, Math.round((newKomoditas.stok - beratBersih) * 100) / 100);
        newKomoditas.updateTerakhir = iso;
        const modalRataRataPerKg = computeKomoditasModalPerKg(newKomoditas);
        const totalModalHpp = Math.round(beratBersih * modalRataRataPerKg);
        const labaKotor = totalNominal - totalModalHpp;
        record.idMitra = party.id;
        record.namaMitra = party.nama;
        record.komoditasKode = newKomoditas.kode;
        record.komoditasNama = newKomoditas.nama;
        record.beratKotor = beratKotor;
        record.potonganRafaksi = potonganRafaksi;
        record.beratBersih = beratBersih;
        record.hargaJualPerKg = hargaJualPerKg;
        record.modalRataRataPerKg = modalRataRataPerKg;
        record.totalModalHpp = totalModalHpp;
        record.totalNominal = totalNominal;
        record.labaKotor = labaKotor;
        record.metodePembayaran = newMetode;
        record.rekeningTujuan = finalRekTujuan;
        record.statusPembayaran = statusPembayaran;
        record.sisaPiutang = sisaPiutang;
        record.stokGudangSebelum = stokSebelum;
        record.stokGudangSetelah = newKomoditas.stok;
        if (params.divisi !== void 0) record.divisi = params.divisi.trim();
        if (params.noSuratJalan !== void 0) record.noSuratJalan = params.noSuratJalan.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Penjualan Hasil Bumi ${cleanId} (${record.namaMitra} - ${record.komoditasNama}): Tonase ${oldKg} Kg -> ${beratBersih} Kg, Omzet Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${totalNominal.toLocaleString("id-ID")} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ""}]`;
        auditNominal = totalNominal;
        auditRekening = finalRekTujuan;
        updatedRecord = record;
      } else if (jenis === "PEMBELIAN_BARANG") {
        const record = (db.pembelianBarang || []).find((p) => p.noPembelian === cleanId);
        const oldNominal = Number(record.totalNominal) || 0;
        const isRekapNota = record.items.length === 1 && record.items[0].kodeProduk === "REKAP-NOTA" && !params.items?.some((i) => i.kodeProduk !== "REKAP-NOTA");
        const affectedProductCodes = /* @__PURE__ */ new Set();
        for (const oldIt of record.items || []) {
          const cleanKode = String(oldIt.kodeProduk || "").trim().toUpperCase();
          if (cleanKode && cleanKode !== "REKAP-NOTA") {
            affectedProductCodes.add(cleanKode);
            const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
            if (stokItem) {
              stokItem.stok = (Number(stokItem.stok) || 0) - (Number(oldIt.qty) || 0);
            }
          }
        }
        if (record.metodePembayaran === "TUNAI") {
          const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
          if (kasAcc) kasAcc.saldoSaatIni += oldNominal;
        } else if (record.metodePembayaran === "TRANSFER" && record.rekeningSumber && record.rekeningSumber !== "TIT01" && record.rekeningSumber !== "BON01") {
          const bankAcc = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (bankAcc) bankAcc.saldoSaatIni += oldNominal;
        }
        let newTotalNominal = 0;
        const newProcessedItems = [];
        if (isRekapNota) {
          const nomRekap = Math.round(
            Number(
              params.nominal ?? params.items?.[0]?.hargaBeliSatuan ?? record.totalNominal
            )
          );
          if (isNaN(nomRekap) || nomRekap <= 0) {
            throw new Error("Total nominal rekapan pembelian harus lebih dari Rp 0");
          }
          newTotalNominal = nomRekap;
          newProcessedItems.push({
            kodeProduk: "REKAP-NOTA",
            namaProduk: params.items?.[0]?.namaProduk || record.items[0]?.namaProduk || "Rekapan Nota Pembelian",
            satuan: "Nota",
            qty: 1,
            hargaBeliSatuan: nomRekap,
            subtotal: nomRekap,
            stokSebelum: 0,
            stokSetelah: 0
          });
        } else {
          const rawItems = params.items && params.items.length > 0 ? params.items : record.items;
          if (!rawItems || rawItems.length === 0) {
            throw new Error("Minimal harus ada 1 item produk pada transaksi pembelian barang");
          }
          for (const it of rawItems) {
            const cleanKode = String(it.kodeProduk || "").trim().toUpperCase();
            const qty = Number(it.qty);
            const hargaBeliSatuan = Math.round(Number(it.hargaBeliSatuan ?? it.harga ?? 0));
            if (!cleanKode) throw new Error("Kode produk wajib dipilih");
            if (isNaN(qty) || qty <= 0) throw new Error(`Qty produk ${cleanKode} harus lebih dari 0`);
            if (isNaN(hargaBeliSatuan) || hargaBeliSatuan <= 0) {
              throw new Error(`Harga modal beli satuan ${cleanKode} harus lebih dari Rp 0`);
            }
            affectedProductCodes.add(cleanKode);
            const prod = db.produk.find((p) => String(p.kode || "").trim().toUpperCase() === cleanKode);
            if (!prod) throw new Error(`Produk ${cleanKode} tidak ditemukan di Master Produk`);
            let stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
            if (!stokItem) {
              stokItem = {
                kode: prod.kode,
                namaProduk: prod.nama,
                satuan: prod.satuan,
                stok: 0,
                minimum: 10,
                updateTerakhir: iso
              };
              db.stokBarang.push(stokItem);
            }
            const stokSebelum = stokItem.stok;
            stokItem.stok = stokSebelum + qty;
            stokItem.updateTerakhir = iso;
            const subtotal = Math.round(qty * hargaBeliSatuan);
            newTotalNominal += subtotal;
            newProcessedItems.push({
              kodeProduk: prod.kode,
              namaProduk: prod.nama,
              satuan: prod.satuan,
              qty,
              hargaBeliSatuan,
              subtotal,
              stokSebelum: Math.max(0, stokSebelum),
              stokSetelah: stokItem.stok
            });
          }
        }
        for (const kode of affectedProductCodes) {
          const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === kode);
          if (stokItem && stokItem.stok < 0) {
            throw new Error(
              `Tidak dapat mengurangi qty kulakan "${stokItem.namaProduk}" karena stok gudang akan menjadi minus (${stokItem.stok} ${stokItem.satuan} \u2014 sebagian barang sudah terjual di kasir).`
            );
          }
        }
        const newMetode = params.metode || record.metodePembayaran;
        let finalRekSumber = "TIT01";
        let finalStatus = "LUNAS";
        if (newMetode === "TUNAI") {
          finalRekSumber = "KAS01";
          const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
          if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
          if (kasAcc.saldoSaatIni < newTotalNominal) {
            throw new Error(
              `Saldo KAS01 tidak mencukupi (Tersedia: Rp ${kasAcc.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${newTotalNominal.toLocaleString("id-ID")})`
            );
          }
          kasAcc.saldoSaatIni -= newTotalNominal;
        } else if (newMetode === "TRANSFER") {
          const rekKode = params.rekeningSumber || record.rekeningSumber;
          if (!rekKode || rekKode === "KAS01" || rekKode === "TIT01" || rekKode === "BON01") {
            throw new Error("Pilih rekening Bank sumber dana transfer yang valid");
          }
          const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === "AKTIF");
          if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
          if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
            throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
          }
          if (!this.isAnakPerusahaanRekening(bankAcc) && bankAcc.saldoSaatIni < newTotalNominal) {
            throw new Error(
              `Saldo ${bankAcc.nama} tidak mencukupi (Tersedia: Rp ${bankAcc.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${newTotalNominal.toLocaleString("id-ID")})`
            );
          }
          bankAcc.saldoSaatIni -= newTotalNominal;
          finalRekSumber = bankAcc.kode;
        } else {
          finalRekSumber = "TIT01";
          finalStatus = "HUTANG_BELUM_LUNAS";
        }
        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, "Distributor / Pemasok");
        record.idMitra = party.id;
        record.namaMitra = party.nama;
        if (record.isDistributorManual && params.namaMitraManual) {
          record.namaDistributorManual = params.namaMitraManual.trim();
        }
        record.items = newProcessedItems;
        record.totalNominal = newTotalNominal;
        record.metodePembayaran = newMetode;
        record.rekeningSumber = finalRekSumber;
        record.status = finalStatus;
        if (params.divisi !== void 0) record.divisi = params.divisi.trim();
        if (params.noFakturSupplier !== void 0) record.noFakturSupplier = params.noFakturSupplier.trim() || "-";
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        for (const kode of affectedProductCodes) {
          recalculateProductHppFromRealPurchases(kode);
        }
        auditSummary = `Edit Pembelian Barang Kulakan ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newTotalNominal.toLocaleString("id-ID")} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ""}]`;
        auditNominal = newTotalNominal;
        auditRekening = finalRekSumber;
        updatedRecord = record;
      } else if (jenis === "PENJUALAN") {
        const record = db.penjualan.find((p) => p.noPenjualan === cleanId);
        const oldNominal = Number(record.totalNominal) || 0;
        const alreadyPaidBon = record.metode === "KASBON" ? Math.max(0, oldNominal - (Number(record.sisaPiutang) || 0)) : 0;
        for (const oldIt of record.items || []) {
          const cleanKode = String(oldIt.kodeProduk || "").trim().toUpperCase();
          const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
          if (stokItem) {
            stokItem.stok = (Number(stokItem.stok) || 0) + (Number(oldIt.qty) || 0);
          }
        }
        if ((record.metode === "TUNAI" || record.metode === "TRANSFER") && record.rekeningTujuan && record.rekeningTujuan !== "BON01" && record.rekeningTujuan !== "INTERNAL_PT") {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) oldRek.saldoSaatIni -= oldNominal;
        }
        const rawItems = params.items && params.items.length > 0 ? params.items : record.items;
        if (!rawItems || rawItems.length === 0) {
          throw new Error("Minimal harus ada 1 item produk pada transaksi penjualan");
        }
        let newTotalNominal = 0;
        let newTotalModalHpp = 0;
        const newProcessedItems = [];
        for (const it of rawItems) {
          const cleanKode = String(it.kodeProduk || "").trim().toUpperCase();
          const qty = Number(it.qty);
          const hargaDeal = Math.max(0, Math.round(Number(it.harga ?? it.hargaBeliSatuan ?? 0)));
          if (!cleanKode) throw new Error("Kode produk wajib dipilih");
          if (isNaN(qty) || qty <= 0) throw new Error(`Qty penjualan ${cleanKode} harus lebih dari 0`);
          const prod = db.produk.find((p) => String(p.kode || "").trim().toUpperCase() === cleanKode);
          if (!prod) throw new Error(`Produk ${cleanKode} tidak ditemukan`);
          const stokItem = db.stokBarang.find((s) => String(s.kode || "").trim().toUpperCase() === cleanKode);
          if (!stokItem || stokItem.stok < qty) {
            throw new Error(
              `Stok gudang "${prod.nama}" tidak mencukupi. Tersedia: ${stokItem?.stok || 0} ${prod.satuan}, dibutuhkan: ${qty} ${prod.satuan}`
            );
          }
          stokItem.stok -= qty;
          stokItem.updateTerakhir = iso;
          const existingOldItem = record.items.find(
            (oi) => String(oi.kodeProduk || "").trim().toUpperCase() === cleanKode
          );
          const hppUnit = prod.hargaBeli > 0 ? prod.hargaBeli : existingOldItem?.hargaBeli || 0;
          const subtotal = Math.round(qty * hargaDeal);
          const modalSub = Math.round(qty * hppUnit);
          const labaKotor = subtotal - modalSub;
          newTotalNominal += subtotal;
          newTotalModalHpp += modalSub;
          newProcessedItems.push({
            kodeProduk: prod.kode,
            namaProduk: prod.nama,
            satuan: prod.satuan,
            qty,
            hargaBeli: hppUnit,
            hargaSugesti: prod.hargaJual || hppUnit,
            harga: hargaDeal,
            subtotal,
            labaKotor
          });
        }
        if (!params.items && params.nominal !== void 0 && newProcessedItems.length === 1) {
          const customTotal = Math.max(0, Math.round(Number(params.nominal)));
          const only = newProcessedItems[0];
          only.subtotal = customTotal;
          only.harga = only.qty > 0 ? Math.round(customTotal / only.qty) : customTotal;
          only.labaKotor = customTotal - Math.round(only.qty * only.hargaBeli);
          newTotalNominal = customTotal;
        }
        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, "Pelanggan Umum");
        let newMetode = params.metode || record.metode;
        if (newTotalNominal === 0 && newMetode !== "INTERNAL_PT") {
          newMetode = "INTERNAL_PT";
        }
        if (newMetode === "KASBON" && (party.id === "UMUM" || !party.id)) {
          throw new Error("Transaksi KASBON wajib memilih Mitra / Pelanggan terdaftar");
        }
        let finalRekTujuan = "KAS01";
        let statusPembayaran = "LUNAS";
        let sisaPiutang = 0;
        if (newMetode === "INTERNAL_PT") {
          finalRekTujuan = "INTERNAL_PT";
          statusPembayaran = "LUNAS";
          sisaPiutang = 0;
        } else if (newMetode === "TUNAI") {
          finalRekTujuan = "KAS01";
          const kasAcc = db.rekening.find((r) => r.kode === "KAS01");
          if (!kasAcc) throw new Error("Rekening KAS01 tidak ditemukan");
          kasAcc.saldoSaatIni += newTotalNominal;
        } else if (newMetode === "TRANSFER") {
          const rekKode = params.rekeningTujuan || record.rekeningTujuan;
          if (!rekKode || rekKode === "KAS01" || rekKode === "BON01" || rekKode === "TIT01" || rekKode === "INTERNAL_PT") {
            throw new Error("Pilih rekening Bank tujuan transfer yang valid");
          }
          const bankAcc = db.rekening.find((r) => r.kode === rekKode && r.status === "AKTIF");
          if (!bankAcc) throw new Error(`Rekening bank ${rekKode} tidak ditemukan atau nonaktif`);
          if (bankAcc.kategori === "OPERASIONAL_DIVISI") {
            throw new Error(`Buku "${bankAcc.nama}" adalah buku tracking divisi, bukan rekening bank fisik`);
          }
          bankAcc.saldoSaatIni += newTotalNominal;
          finalRekTujuan = bankAcc.kode;
        } else if (newMetode === "KASBON") {
          finalRekTujuan = "BON01";
          sisaPiutang = Math.max(0, newTotalNominal - alreadyPaidBon);
          statusPembayaran = sisaPiutang === 0 ? "LUNAS" : "BELUM_BAYAR";
        }
        record.idMitra = party.id;
        record.namaMitra = party.nama;
        record.items = newProcessedItems;
        record.totalModalHpp = newTotalModalHpp;
        record.totalNominal = newTotalNominal;
        record.totalLabaKotor = newTotalNominal - newTotalModalHpp;
        record.metode = newMetode;
        record.rekeningTujuan = finalRekTujuan;
        record.statusPembayaran = statusPembayaran;
        record.sisaPiutang = sisaPiutang;
        if (params.divisi !== void 0) record.divisi = params.divisi.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Penjualan Toko ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newTotalNominal.toLocaleString("id-ID")} [${newMetode}${record.divisi ? ` | Divisi: ${record.divisi}` : ""}]`;
        auditNominal = newTotalNominal;
        auditRekening = finalRekTujuan;
        updatedRecord = record;
      } else if (jenis === "KASBON_UANG") {
        const record = db.kasbonUang.find((k) => k.idTransaksi === cleanId);
        const oldNominal = Number(record.nominal) || 0;
        const sudahDibayar = Math.max(0, oldNominal - (Number(record.sisaKasbon) || 0));
        const isNotaLalu = Boolean(record.isNotaLalu || record.rekeningSumber === "BON01");
        if (!isNotaLalu && record.rekeningSumber && record.rekeningSumber !== "BON01" && record.rekeningSumber !== "TIT01") {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }
        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error("Nominal kasbon harus lebih dari Rp 0");
        }
        const party = resolveMitraOrManual(record.idMitra, record.namaMitra, record.namaMitra);
        record.idMitra = party.id;
        record.namaMitra = party.nama;
        if (!isNotaLalu) {
          const newMetode = params.metode || record.metode;
          const targetRekKode = newMetode === "TUNAI" ? "KAS01" : params.rekeningSumber || record.rekeningSumber;
          if (!targetRekKode || targetRekKode === "BON01" || targetRekKode === "TIT01") {
            throw new Error("Pilih rekening sumber kas/bank yang valid");
          }
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === "AKTIF");
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < newNominal) {
            throw new Error(
              `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${newNominal.toLocaleString("id-ID")})`
            );
          }
          newRek.saldoSaatIni -= newNominal;
          record.metode = newMetode;
          record.rekeningSumber = newRek.kode;
        }
        record.nominal = newNominal;
        record.sisaKasbon = Math.max(0, newNominal - sudahDibayar);
        record.status = record.sisaKasbon === 0 ? "LUNAS" : sudahDibayar > 0 ? "SEBAGIAN" : "BELUM LUNAS";
        if (params.tanggal) {
          record.tanggal = params.tanggal.trim();
          if (record.isNotaLalu) record.tanggalNotaLalu = params.tanggal.trim();
        }
        if (params.noNotaLalu !== void 0) record.noNotaLalu = params.noNotaLalu.trim();
        if (params.rincianBarangNotaLalu !== void 0) {
          record.rincianBarangNotaLalu = params.rincianBarangNotaLalu.trim();
        }
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Kasbon/Nota Lalu ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newNominal.toLocaleString("id-ID")}`;
        auditNominal = newNominal;
        auditRekening = record.rekeningSumber;
        updatedRecord = record;
      } else if (jenis === "BAYAR_BON") {
        const record = db.bayarBon.find((b) => b.idTransaksi === cleanId);
        const oldNominal = Number(record.nominalBayar) || 0;
        const isNonTunai = record.metode === "SINKRON" || record.metode === "KOMPENSASI_TITIP" || record.metode === "POTONG_GAJI" || record.rekeningTujuan === "SINKRON" || Boolean(record.isKompensasiTitipan) || Boolean(record.isPotongGaji);
        if (!isNonTunai && record.rekeningTujuan && record.rekeningTujuan !== "BON01" && record.rekeningTujuan !== "TIT01" && record.rekeningTujuan !== "SINKRON" && record.rekeningTujuan !== "KOMPENSASI_TITIP" && record.rekeningTujuan !== "POTONG_GAJI") {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningTujuan);
          if (oldRek) oldRek.saldoSaatIni -= oldNominal;
        }
        for (const alok of record.alokasi || []) {
          if (alok.jenis === "KASBON_BARANG") {
            const pj = db.penjualan.find((p) => p.noPenjualan === alok.refId);
            if (pj) {
              pj.sisaPiutang = (Number(pj.sisaPiutang) || 0) + (Number(alok.nominalDibayar) || 0);
              pj.statusPembayaran = pj.sisaPiutang > 0 ? "BELUM_BAYAR" : "LUNAS";
            }
            const jhb = (db.penjualanHasilBumi || []).find((j) => j.noPenjualan === alok.refId);
            if (jhb) {
              jhb.sisaPiutang = (Number(jhb.sisaPiutang) || 0) + (Number(alok.nominalDibayar) || 0);
              jhb.statusPembayaran = jhb.sisaPiutang > 0 ? "BELUM_BAYAR" : "LUNAS";
            }
          } else if (alok.jenis === "KASBON_UANG") {
            const ku = db.kasbonUang.find((k) => k.idTransaksi === alok.refId);
            if (ku) {
              ku.sisaKasbon = (Number(ku.sisaKasbon) || 0) + (Number(alok.nominalDibayar) || 0);
              ku.status = ku.sisaKasbon >= ku.nominal ? "BELUM LUNAS" : ku.sisaKasbon > 0 ? "SEBAGIAN" : "LUNAS";
            }
          }
        }
        const newNominal = Math.round(Number(params.nominal ?? record.nominalBayar));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error("Nominal pembayaran bon harus lebih dari Rp 0");
        }
        const openBarang = db.penjualan.filter(
          (p) => p.idMitra === record.idMitra && p.metode === "KASBON" && p.sisaPiutang > 0
        );
        const openHasilBumi = (db.penjualanHasilBumi || []).filter(
          (j) => j.idMitra === record.idMitra && j.metodePembayaran === "PIUTANG" && j.sisaPiutang > 0
        );
        const openUang = db.kasbonUang.filter(
          (k) => k.idMitra === record.idMitra && k.sisaKasbon > 0
        );
        const totalBonTersedia = openBarang.reduce((s, p) => s + p.sisaPiutang, 0) + openHasilBumi.reduce((s, j) => s + j.sisaPiutang, 0) + openUang.reduce((s, k) => s + k.sisaKasbon, 0);
        let remainingToAllocate = newNominal;
        const newAlokasi = [];
        for (const pj of openBarang) {
          if (remainingToAllocate <= 0) break;
          const bayar = Math.min(pj.sisaPiutang, remainingToAllocate);
          const sebelum = pj.sisaPiutang;
          pj.sisaPiutang -= bayar;
          pj.statusPembayaran = pj.sisaPiutang === 0 ? "LUNAS" : "BELUM_BAYAR";
          remainingToAllocate -= bayar;
          newAlokasi.push({
            jenis: "KASBON_BARANG",
            refId: pj.noPenjualan,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: pj.sisaPiutang
          });
        }
        for (const jhb of openHasilBumi) {
          if (remainingToAllocate <= 0) break;
          const bayar = Math.min(jhb.sisaPiutang, remainingToAllocate);
          const sebelum = jhb.sisaPiutang;
          jhb.sisaPiutang -= bayar;
          jhb.statusPembayaran = jhb.sisaPiutang === 0 ? "LUNAS" : "BELUM_BAYAR";
          remainingToAllocate -= bayar;
          newAlokasi.push({
            jenis: "KASBON_BARANG",
            refId: jhb.noPenjualan,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: jhb.sisaPiutang
          });
        }
        for (const ku of openUang) {
          if (remainingToAllocate <= 0) break;
          const bayar = Math.min(ku.sisaKasbon, remainingToAllocate);
          const sebelum = ku.sisaKasbon;
          ku.sisaKasbon -= bayar;
          ku.status = ku.sisaKasbon === 0 ? "LUNAS" : "SEBAGIAN";
          remainingToAllocate -= bayar;
          newAlokasi.push({
            jenis: "KASBON_UANG",
            refId: ku.idTransaksi,
            nominalSebelum: sebelum,
            nominalDibayar: bayar,
            nominalSisa: ku.sisaKasbon
          });
        }
        if (!isNonTunai) {
          const newMetode = params.metode || record.metode;
          const targetRekKode = newMetode === "TUNAI" ? "KAS01" : params.rekeningTujuan || record.rekeningTujuan;
          if (!targetRekKode || targetRekKode === "BON01" || targetRekKode === "TIT01" || targetRekKode === "SINKRON") {
            throw new Error("Pilih rekening penerima pembayaran bon yang valid");
          }
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === "AKTIF");
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          newRek.saldoSaatIni += newNominal;
          record.metode = newMetode;
          record.rekeningTujuan = newRek.kode;
        } else {
          const pairedSinkron = (db.pencairanTitipan || []).find(
            (p) => p.idPencairan === `${cleanId}-SINKRON` || cleanId.endsWith("-POTBON") && p.idPencairan === cleanId.replace(/-POTBON$/, "-POTTIT")
          );
          if (pairedSinkron) {
            const diffSinkron = newNominal - (Number(pairedSinkron.nominalPencairan) || 0);
            pairedSinkron.nominalPencairan = newNominal;
            pairedSinkron.nominalPotongBonOtomatis = newNominal;
            pairedSinkron.saldoTitipanSisa = Math.max(0, (pairedSinkron.saldoTitipanSisa || 0) - diffSinkron);
            if (params.tanggal) pairedSinkron.tanggal = params.tanggal.trim();
          }
        }
        record.totalBonSebelum = Math.max(totalBonTersedia, newNominal);
        record.nominalBayar = newNominal;
        if (record.isKompensasiTitipan || record.metode === "SINKRON") {
          record.nominalPotongTitipanOtomatis = newNominal;
        }
        record.sisaBonSetelah = Math.max(0, totalBonTersedia - newNominal);
        record.alokasi = newAlokasi;
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Pembayaran Bon ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newNominal.toLocaleString("id-ID")}`;
        auditNominal = newNominal;
        auditRekening = record.rekeningTujuan;
        updatedRecord = record;
      } else if (jenis === "PENCAIRAN_TITIPAN") {
        const record = (db.pencairanTitipan || []).find((p) => p.idPencairan === cleanId);
        const oldNominal = Number(record.nominalPencairan) || 0;
        const isKompensasi = record.metodePembayaran === "SINKRON" || record.metodePembayaran === "KOMPENSASI_BON" || record.rekeningSumber === "SINKRON" || Boolean(record.isKompensasiBon);
        if (!isKompensasi && record.rekeningSumber && record.rekeningSumber !== "TIT01" && record.rekeningSumber !== "BON01" && record.rekeningSumber !== "SINKRON") {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }
        const newNominal = Math.round(Number(params.nominal ?? record.nominalPencairan));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error("Nominal pencairan titipan harus lebih dari Rp 0");
        }
        if (!isKompensasi) {
          const newMetode = params.metode || record.metodePembayaran;
          const targetRekKode = newMetode === "TUNAI" ? "KAS01" : params.rekeningSumber || record.rekeningSumber;
          if (!targetRekKode || targetRekKode === "TIT01" || targetRekKode === "BON01" || targetRekKode === "SINKRON") {
            throw new Error("Pilih rekening sumber kas/bank yang valid");
          }
          const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === "AKTIF");
          if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
          if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < newNominal) {
            throw new Error(
              `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${newNominal.toLocaleString("id-ID")})`
            );
          }
          newRek.saldoSaatIni -= newNominal;
          record.metodePembayaran = newMetode;
          record.rekeningSumber = newRek.kode;
        }
        const diff = newNominal - oldNominal;
        record.nominalPencairan = newNominal;
        record.saldoTitipanSisa = Math.max(0, (record.saldoTitipanSisa || 0) - diff);
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Pencairan Titipan ${cleanId} (${record.namaMitra}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newNominal.toLocaleString("id-ID")}`;
        auditNominal = newNominal;
        auditRekening = record.rekeningSumber;
        updatedRecord = record;
      } else if (jenis === "PENGELUARAN_DIVISI") {
        const record = (db.pengeluaran || []).find((e) => e.idTransaksi === cleanId);
        const oldNominal = Number(record.nominal) || 0;
        if (record.rekeningSumber) {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldNominal;
        }
        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error("Nominal pengeluaran harus lebih dari Rp 0");
        }
        const targetRekKode = params.rekeningSumber || record.rekeningSumber || "KAS01";
        if (targetRekKode === "BON01" || targetRekKode === "TIT01") {
          throw new Error("Rekening virtual BON01/TIT01 tidak dapat dipakai untuk pengeluaran");
        }
        const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === "AKTIF");
        if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
        if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < newNominal) {
          throw new Error(
            `Saldo ${newRek.nama} tidak mencukupi (Tersedia: Rp ${newRek.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${newNominal.toLocaleString("id-ID")})`
          );
        }
        newRek.saldoSaatIni -= newNominal;
        record.nominal = newNominal;
        record.rekeningSumber = newRek.kode;
        if (params.divisi) record.divisi = params.divisi.trim();
        if (params.kategori) record.kategori = params.kategori.trim();
        if (params.penerima !== void 0) record.penerima = params.penerima.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0 && params.keterangan.trim()) {
          record.keterangan = params.keterangan.trim();
        }
        auditSummary = `Edit Pengeluaran Divisi ${cleanId} [${record.divisi}]: Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newNominal.toLocaleString("id-ID")} via ${newRek.kode}`;
        auditNominal = newNominal;
        auditRekening = newRek.kode;
        updatedRecord = record;
      } else if (jenis === "TRANSFER_REKENING") {
        const record = (db.transferRekening || []).find((t) => t.noTransfer === cleanId);
        const oldNominal = Number(record.nominal) || 0;
        const oldSumber = db.rekening.find((r) => r.kode === record.rekeningSumber);
        const oldTujuan = db.rekening.find((r) => r.kode === record.rekeningTujuan);
        if (oldSumber) oldSumber.saldoSaatIni += oldNominal;
        if (oldTujuan) oldTujuan.saldoSaatIni -= oldNominal;
        const newNominal = Math.round(Number(params.nominal ?? record.nominal));
        if (isNaN(newNominal) || newNominal <= 0) {
          throw new Error("Nominal transfer harus lebih dari Rp 0");
        }
        const kodeSumber = params.rekeningSumber || record.rekeningSumber;
        const kodeTujuan = params.rekeningTujuan || record.rekeningTujuan;
        if (kodeSumber === kodeTujuan) {
          throw new Error("Rekening sumber dan rekening tujuan tidak boleh sama");
        }
        if (kodeSumber === "BON01" || kodeSumber === "TIT01" || kodeTujuan === "BON01" || kodeTujuan === "TIT01") {
          throw new Error("Rekening virtual BON01/TIT01 tidak dapat ditransfer manual");
        }
        const newSumber = db.rekening.find((r) => r.kode === kodeSumber && r.status === "AKTIF");
        const newTujuan = db.rekening.find((r) => r.kode === kodeTujuan && r.status === "AKTIF");
        if (!newSumber) throw new Error(`Rekening sumber ${kodeSumber} tidak ditemukan`);
        if (!newTujuan) throw new Error(`Rekening tujuan ${kodeTujuan} tidak ditemukan`);
        if (!this.isAnakPerusahaanRekening(newSumber) && newSumber.saldoSaatIni < newNominal) {
          throw new Error(
            `Saldo ${newSumber.nama} tidak mencukupi (Tersedia: Rp ${newSumber.saldoSaatIni.toLocaleString("id-ID")}, dibutuhkan: Rp ${newNominal.toLocaleString("id-ID")})`
          );
        }
        newSumber.saldoSaatIni -= newNominal;
        newTujuan.saldoSaatIni += newNominal;
        record.rekeningSumber = newSumber.kode;
        record.rekeningTujuan = newTujuan.kode;
        record.nominal = newNominal;
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Transfer Rekening ${cleanId} (${newSumber.kode} -> ${newTujuan.kode}): Rp ${oldNominal.toLocaleString("id-ID")} -> Rp ${newNominal.toLocaleString("id-ID")}`;
        auditNominal = newNominal;
        auditRekening = `${newSumber.kode} -> ${newTujuan.kode}`;
        updatedRecord = record;
      } else if (jenis === "UPAH_HARIAN") {
        const record = (db.upahHarian || []).find((u) => u.id === cleanId);
        const oldTotal = Number(record.totalUpahHarian || record.jumlah || record.upahHarian) || 0;
        const kuantiti = params.kuantiti !== void 0 ? Math.max(0, Number(params.kuantiti)) : Number(record.kuantiti ?? 1);
        const hargaSatuan = params.hargaSatuanUpah !== void 0 ? Math.max(0, Math.round(Number(params.hargaSatuanUpah))) : params.nominal !== void 0 && params.kuantiti === void 0 ? Math.max(0, Math.round(Number(params.nominal))) : Math.max(0, Number(record.harga ?? record.upahHarian ?? 0));
        const uangMakanLembur = params.uangMakanLembur !== void 0 ? Math.max(0, Math.round(Number(params.uangMakanLembur))) : Math.max(0, Number(record.uangMakanLembur ?? 0));
        const upahPokok = params.nominal !== void 0 && params.hargaSatuanUpah === void 0 && params.kuantiti === void 0 ? Math.max(0, Math.round(Number(params.nominal))) : Math.round(kuantiti * hargaSatuan);
        const totalUpahHarian = upahPokok + uangMakanLembur;
        record.kuantiti = kuantiti;
        record.harga = kuantiti > 0 ? Math.round(upahPokok / kuantiti) : hargaSatuan;
        record.jumlah = upahPokok;
        record.upahHarian = upahPokok;
        record.uangMakanLembur = uangMakanLembur;
        record.totalUpahHarian = totalUpahHarian;
        if (params.divisi) record.divisi = params.divisi;
        if (params.itemKerja !== void 0) record.item = params.itemKerja.trim();
        if (params.catatanKerja !== void 0) record.catatan = params.catatanKerja.trim();
        if (params.tanggal) record.tanggalKerja = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Upah Harian ${cleanId} (${record.namaKaryawan}): Rp ${oldTotal.toLocaleString("id-ID")} -> Rp ${totalUpahHarian.toLocaleString("id-ID")}`;
        auditNominal = totalUpahHarian;
        auditRekening = record.rekening || "HUTANG_UPAH";
        updatedRecord = record;
      } else if (jenis === "PENGGAJIAN") {
        const record = (db.penggajian || []).find((g) => g.id === cleanId);
        const oldBersih = Number(record.gajiBersihDibayar) || 0;
        if (record.rekeningSumber && record.rekeningSumber !== "BON01" && record.rekeningSumber !== "TIT01") {
          const oldRek = db.rekening.find((r) => r.kode === record.rekeningSumber);
          if (oldRek) oldRek.saldoSaatIni += oldBersih;
        }
        const gajiPokok = Math.max(
          0,
          Math.round(
            Number(
              params.gajiPokok ?? (params.nominal !== void 0 && params.bonus === void 0 && params.tunjangan === void 0 ? Number(params.nominal) + (record.potonganKasbon || 0) - (record.tunjangan || 0) - (record.bonus || 0) : record.gajiPokok)
            )
          )
        );
        const tunjangan = Math.max(0, Math.round(Number(params.tunjangan ?? record.tunjangan ?? 0)));
        const bonus = Math.max(0, Math.round(Number(params.bonus ?? record.bonus ?? 0)));
        const potonganKasbon = Math.max(
          0,
          Math.round(Number(params.potonganKasbon ?? record.potonganKasbon ?? 0))
        );
        const totalGajiKotor = gajiPokok + tunjangan + bonus;
        if (totalGajiKotor <= 0) {
          throw new Error("Total gaji kotor harus lebih dari Rp 0");
        }
        const gajiBersihDibayar = Math.max(0, totalGajiKotor - potonganKasbon);
        const targetRekKode = params.rekeningSumber || record.rekeningSumber || "KAS01";
        if (targetRekKode === "BON01" || targetRekKode === "TIT01") {
          throw new Error("Rekening virtual BON01/TIT01 tidak dapat dipakai untuk gaji");
        }
        const newRek = db.rekening.find((r) => r.kode === targetRekKode && r.status === "AKTIF");
        if (!newRek) throw new Error(`Rekening ${targetRekKode} tidak ditemukan atau nonaktif`);
        if (!this.isAnakPerusahaanRekening(newRek) && newRek.saldoSaatIni < gajiBersihDibayar) {
          throw new Error(
            `Saldo ${newRek.nama} tidak mencukupi untuk gaji bersih Rp ${gajiBersihDibayar.toLocaleString("id-ID")}`
          );
        }
        newRek.saldoSaatIni -= gajiBersihDibayar;
        record.gajiPokok = gajiPokok;
        record.tunjangan = tunjangan;
        record.bonus = bonus;
        record.totalGajiKotor = totalGajiKotor;
        record.potonganKasbon = potonganKasbon;
        record.gajiBersihDibayar = gajiBersihDibayar;
        record.rekeningSumber = newRek.kode;
        if (params.metode) record.metodePembayaran = params.metode;
        if (params.divisi) record.divisi = params.divisi;
        if (params.periodeBulan) record.periodeBulan = params.periodeBulan.trim();
        if (params.tanggal) record.tanggal = params.tanggal.trim();
        if (params.keterangan !== void 0) record.keterangan = params.keterangan.trim();
        auditSummary = `Edit Penggajian ${cleanId} (${record.namaKaryawan}): Gaji Bersih Rp ${oldBersih.toLocaleString("id-ID")} -> Rp ${gajiBersihDibayar.toLocaleString("id-ID")} via ${newRek.kode}`;
        auditNominal = gajiBersihDibayar;
        auditRekening = newRek.kode;
        updatedRecord = record;
      }
      dbManager.synchronizeVirtualAccounts();
      this.addAuditLog(
        db,
        "UPDATE",
        cleanId,
        auditSummary || `Perubahan detail transaksi ${cleanId}`,
        auditNominal,
        auditRekening
      );
      return {
        success: true,
        jenis,
        idTransaksi: cleanId,
        message: "Detail transaksi berhasil diperbarui & seluruh stok, HPP, serta saldo rekening telah disinkronkan otomatis.",
        updatedRecord
      };
    });
  }
};

// src/server/routes.ts
var apiRouter = Router();
function parseNominalInput(raw) {
  if (raw === void 0 || raw === null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const direct = Number(str);
    return Number.isFinite(direct) ? direct : null;
  }
  const isNegative = str.startsWith("-") || str.includes("-");
  const cleaned = str.replace(/[^0-9,]/g, "").replace(/,/g, ".");
  if (!cleaned) return 0;
  const parsed = Number(cleaned) * (isNegative ? -1 : 1);
  return Number.isFinite(parsed) ? parsed : null;
}
apiRouter.get("/rekening", (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.rekening });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/rekening", async (req, res) => {
  try {
    const {
      kode,
      nama,
      atasNama,
      nomorRekening,
      saldoAwal,
      keterangan,
      kategori,
      rekeningIndukPenyimpan,
      idMitraTerkait
    } = req.body;
    if (!kode || !nama || !atasNama) {
      return res.status(400).json({ success: false, message: "Kode, Nama, dan Atas Nama wajib diisi" });
    }
    const cleanKode = String(kode).toUpperCase().trim();
    if (cleanKode === "BON01" || cleanKode === "TIT01") {
      return res.status(400).json({ success: false, message: "Kode BON01 dan TIT01 adalah reserved kode sistem" });
    }
    const created = await dbManager.executeTransaction((db) => {
      if (db.rekening.some((r) => r.kode === cleanKode)) {
        throw new Error(`Rekening dengan kode ${cleanKode} sudah terdaftar`);
      }
      const parsedSaldo = parseNominalInput(saldoAwal);
      const saldo = parsedSaldo !== null ? parsedSaldo : 0;
      const finalKategori = kategori === "ANAK_PERUSAHAAN" || kategori === "OPERASIONAL_DIVISI" || kategori === "PERUSAHAAN" ? kategori : "PERUSAHAAN";
      const isAnak = finalKategori === "ANAK_PERUSAHAAN";
      const newRek = {
        kode: cleanKode,
        nama: String(nama).trim(),
        atasNama: String(atasNama).trim(),
        nomorRekening: String(nomorRekening || "-").trim(),
        saldoAwal: saldo,
        saldoSaatIni: saldo,
        status: "AKTIF",
        isVirtual: false,
        isAnakPerusahaan: isAnak,
        idMitraTerkait: isAnak ? idMitraTerkait : void 0,
        kategori: finalKategori,
        rekeningIndukPenyimpan: finalKategori === "OPERASIONAL_DIVISI" ? rekeningIndukPenyimpan || "KAS01" : void 0,
        keterangan: keterangan || (isAnak ? "Anak Perusahaan PT. Wijaya Agro Perkasa (Bukan Bank) \u2014 Terintegrasi otomatis sebagai Mitra dalam 1 transaksi terpadu" : "")
      };
      db.rekening.push(newRek);
      return newRek;
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
async function handleUpdateRekeningRequest(rawKode, body) {
  const kode = decodeURIComponent(String(rawKode || "")).toUpperCase().trim();
  if (!kode) {
    throw new Error("Kode rekening wajib disertakan");
  }
  const {
    nama,
    atasNama,
    nomorRekening,
    status,
    keterangan,
    kategori,
    rekeningIndukPenyimpan,
    saldoSaatIni,
    saldoAwal,
    alasanPenyesuaian
  } = body || {};
  return await dbManager.executeTransaction((db) => {
    const rek = db.rekening.find((r) => r.kode.toUpperCase() === kode);
    if (!rek) throw new Error(`Rekening ${kode} tidak ditemukan`);
    if (rek.isVirtual && status && status !== "AKTIF") {
      throw new Error(`Rekening sistem ${kode} tidak boleh dinonaktifkan`);
    }
    if (nama) rek.nama = String(nama).trim();
    if (atasNama) rek.atasNama = String(atasNama).trim();
    if (nomorRekening !== void 0) rek.nomorRekening = String(nomorRekening).trim();
    if (status) rek.status = status;
    if (keterangan !== void 0) rek.keterangan = keterangan;
    if (!rek.isVirtual && kategori) {
      rek.kategori = kategori;
      rek.isAnakPerusahaan = kategori === "ANAK_PERUSAHAAN";
      if (kategori === "OPERASIONAL_DIVISI") {
        rek.rekeningIndukPenyimpan = rekeningIndukPenyimpan || rek.rekeningIndukPenyimpan || "KAS01";
      } else {
        delete rek.rekeningIndukPenyimpan;
      }
    }
    if (rek.isAnakPerusahaan && rek.idMitraTerkait && nama) {
      const linkedMitra = db.mitra.find((m) => m.id === rek.idMitraTerkait);
      if (linkedMitra) {
        linkedMitra.nama = rek.nama;
        linkedMitra.status = rek.status;
        rek.namaMitraTerkait = linkedMitra.nama;
      }
    }
    const parsedSaldoSaatIni = parseNominalInput(saldoSaatIni);
    const parsedSaldoAwal = parseNominalInput(saldoAwal);
    if (parsedSaldoSaatIni !== null) {
      if (rek.isVirtual || rek.kode === "BON01" || rek.kode === "TIT01" || rek.kode === "SINKRON") {
        throw new Error(
          `Saldo rekening sistem ${rek.kode} dihitung otomatis dari transaksi piutang kasbon, titipan, & sinkronisasi potong bon.`
        );
      }
      const oldSaldo = rek.saldoSaatIni;
      rek.saldoSaatIni = parsedSaldoSaatIni;
      if (parsedSaldoAwal !== null) {
        rek.saldoAwal = parsedSaldoAwal;
      } else if (rek.kategori === "OPERASIONAL_DIVISI") {
        rek.saldoAwal = Math.round((Number(rek.saldoAwal) || 0) + (parsedSaldoSaatIni - oldSaldo));
      }
      const { iso, tanggal, jam } = getWIBDateTime();
      db.auditLogs.unshift({
        id: `AUDIT-${Date.now().toString().slice(-6)}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin Keuangan",
        jenisTransaksi: "UPDATE",
        idTransaksi: rek.kode,
        detail: `Penyesuaian Saldo Rekening ${rek.nama} (${rek.kode}): Rp ${oldSaldo.toLocaleString("id-ID")} -> Rp ${parsedSaldoSaatIni.toLocaleString("id-ID")}${alasanPenyesuaian ? ` (${alasanPenyesuaian})` : ""}`,
        nominal: Math.abs(parsedSaldoSaatIni - oldSaldo),
        rekeningTerkait: rek.kode
      });
    } else if (parsedSaldoAwal !== null && !rek.isVirtual) {
      rek.saldoAwal = parsedSaldoAwal;
    }
    return rek;
  });
}
async function handleUpdateSaldoRekeningRequest(rawKode, body) {
  const kode = decodeURIComponent(String(rawKode || "")).toUpperCase().trim();
  if (!kode) {
    throw new Error("Kode rekening wajib dipilih");
  }
  const { saldoBaru, saldoAwalBaru, updateSaldoAwal, alasan } = body || {};
  const numSaldo = parseNominalInput(saldoBaru);
  if (numSaldo === null) {
    throw new Error("Nominal saldo baru harus berupa angka yang valid");
  }
  return await dbManager.executeTransaction((db) => {
    const rek = db.rekening.find((r) => r.kode.toUpperCase() === kode);
    if (!rek) throw new Error(`Rekening ${kode} tidak ditemukan`);
    if (rek.isVirtual || rek.kode === "BON01" || rek.kode === "TIT01" || rek.kode === "SINKRON") {
      throw new Error(
        `Saldo rekening sistem ${rek.kode} dihitung otomatis dari transaksi piutang kasbon, titipan, & sinkronisasi potong bon.`
      );
    }
    const oldSaldo = rek.saldoSaatIni;
    rek.saldoSaatIni = numSaldo;
    const explicitSaldoAwal = parseNominalInput(saldoAwalBaru);
    if (explicitSaldoAwal !== null) {
      rek.saldoAwal = explicitSaldoAwal;
    } else if (rek.kategori === "OPERASIONAL_DIVISI") {
      rek.saldoAwal = Math.round((Number(rek.saldoAwal) || 0) + (numSaldo - oldSaldo));
    } else if (updateSaldoAwal) {
      rek.saldoAwal = numSaldo;
    }
    const { iso, tanggal, jam } = getWIBDateTime();
    db.auditLogs.unshift({
      id: `AUDIT-${Date.now().toString().slice(-6)}`,
      timestamp: iso,
      tanggal,
      jam,
      user: "Admin Keuangan",
      jenisTransaksi: "UPDATE",
      idTransaksi: rek.kode,
      detail: `Pembaruan Nominal Saldo Fleksibel Rekening ${rek.nama} (${rek.kode}): Rp ${oldSaldo.toLocaleString("id-ID")} -> Rp ${numSaldo.toLocaleString("id-ID")}${alasan ? ` (Catatan: ${alasan})` : ""}`,
      nominal: Math.abs(numSaldo - oldSaldo),
      rekeningTerkait: rek.kode
    });
    return rek;
  });
}
apiRouter.post("/rekening/update-saldo", async (req, res) => {
  try {
    const updated = await handleUpdateSaldoRekeningRequest(req.body?.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/rekening/update", async (req, res) => {
  try {
    const updated = await handleUpdateRekeningRequest(req.body?.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/rekening/update", async (req, res) => {
  try {
    const updated = await handleUpdateRekeningRequest(req.body?.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/rekening/:kode", async (req, res) => {
  try {
    const updated = await handleUpdateRekeningRequest(req.params.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/rekening/:kode/update-saldo", async (req, res) => {
  try {
    const updated = await handleUpdateSaldoRekeningRequest(req.params.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/mitra", (_req, res) => {
  try {
    const db = dbManager.get();
    let modified = false;
    for (const kry of db.karyawan || []) {
      const idMitra = kry.idMitraTerkait || `MTR-${kry.id}`;
      const existing = db.mitra.find((m) => m.id === idMitra || m.kode === kry.nik || m.role === "KARYAWAN" && m.nama.toLowerCase() === kry.nama.toLowerCase());
      if (!existing) {
        db.mitra.push({
          id: idMitra,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: "KARYAWAN",
          telepon: kry.telepon || "-",
          alamat: kry.alamat || "-",
          status: kry.status || "AKTIF",
          catatan: `Karyawan: ${kry.jabatan || "Staff"} (Divisi ${kry.divisi || kry.departemen || "Gudang"})`
        });
        modified = true;
      } else {
        if (existing.nama.endsWith(" (Karyawan)")) {
          existing.nama = kry.nama;
          modified = true;
        }
      }
    }
    if (modified) {
      dbManager.save();
    }
    res.json({ success: true, data: db.mitra });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/mitra/rekap", (_req, res) => {
  try {
    const rekap = TransactionService.getRekapMasterMitra();
    res.json({ success: true, data: rekap });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/mitra", async (req, res) => {
  try {
    const { kode, nama, role, telepon, alamat, catatan } = req.body;
    if (!nama || !role) {
      return res.status(400).json({ success: false, message: "Nama dan Role mitra wajib diisi" });
    }
    const created = await dbManager.executeTransaction((db) => {
      const cleanKode = kode ? String(kode).toUpperCase().trim() : `MTR${db.mitra.length + 1}`;
      if (db.mitra.some((m) => m.kode === cleanKode)) {
        throw new Error(`Mitra dengan kode ${cleanKode} sudah ada`);
      }
      const newMitra = {
        id: `MTR-${Date.now().toString().slice(-4)}`,
        kode: cleanKode,
        nama: String(nama).trim(),
        role,
        telepon: telepon || "-",
        alamat: alamat || "-",
        status: "AKTIF",
        catatan: catatan || ""
      };
      db.mitra.push(newMitra);
      return newMitra;
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/mitra/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, role, telepon, alamat, status, catatan } = req.body;
    const updated = await dbManager.executeTransaction((db) => {
      const mitra = db.mitra.find((m) => m.id === id);
      if (!mitra) throw new Error(`Mitra dengan ID ${id} tidak ditemukan`);
      if (nama) mitra.nama = String(nama).trim();
      if (role) mitra.role = role;
      if (telepon) mitra.telepon = telepon;
      if (alamat) mitra.alamat = alamat;
      if (status) mitra.status = status;
      if (catatan !== void 0) mitra.catatan = catatan;
      if (mitra.role === "KARYAWAN") {
        const kry = (db.karyawan || []).find(
          (k) => k.idMitraTerkait === mitra.id || `MTR-${k.id}` === mitra.id || k.nik === mitra.kode
        );
        if (kry) {
          if (nama) kry.nama = mitra.nama;
          if (telepon) kry.telepon = mitra.telepon;
          if (alamat) kry.alamat = mitra.alamat;
          if (status) kry.status = mitra.status;
          kry.idMitraTerkait = mitra.id;
        }
      }
      return mitra;
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
function normalizeKategoriName(raw) {
  const cleaned = String(raw || "").trim().replace(/\s+/g, " ").toUpperCase();
  return cleaned || "LAINNYA";
}
function ensureKategoriRegistered(db, namaKategori, deskripsi) {
  if (!Array.isArray(db.kategoriProduk)) {
    db.kategoriProduk = [];
  }
  const norm = normalizeKategoriName(namaKategori);
  const existing = db.kategoriProduk.find(
    (k) => normalizeKategoriName(k.nama) === norm
  );
  if (!existing) {
    db.kategoriProduk.push({
      nama: norm,
      deskripsi: deskripsi ? String(deskripsi).trim() : "",
      createdAt: getWIBDateTime().iso
    });
  } else if (deskripsi !== void 0 && String(deskripsi).trim()) {
    existing.deskripsi = String(deskripsi).trim();
  }
  return norm;
}
apiRouter.get("/kategori-produk", (_req, res) => {
  try {
    const db = dbManager.get();
    const savedList = Array.isArray(db.kategoriProduk) ? db.kategoriProduk : [];
    const produkList = Array.isArray(db.produk) ? db.produk : [];
    const map = /* @__PURE__ */ new Map();
    for (const k of savedList) {
      const norm = normalizeKategoriName(k.nama);
      map.set(norm, {
        nama: norm,
        deskripsi: k.deskripsi || "",
        jumlahProduk: 0,
        isSaved: true
      });
    }
    for (const p of produkList) {
      const norm = normalizeKategoriName(p.kategori);
      const current = map.get(norm);
      if (current) {
        current.jumlahProduk += 1;
      } else {
        map.set(norm, {
          nama: norm,
          deskripsi: "",
          jumlahProduk: 1,
          isSaved: false
        });
      }
    }
    const result = Array.from(map.values()).sort((a, b) => {
      if (b.jumlahProduk !== a.jumlahProduk) return b.jumlahProduk - a.jumlahProduk;
      return a.nama.localeCompare(b.nama, "id");
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/kategori-produk", async (req, res) => {
  try {
    const { nama, deskripsi } = req.body;
    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: "Nama kategori wajib diisi" });
    }
    const norm = normalizeKategoriName(nama);
    const { iso, tanggal, jam } = getWIBDateTime();
    const created = await dbManager.executeTransaction((db) => {
      ensureKategoriRegistered(db, norm, deskripsi);
      db.auditLogs.unshift({
        id: `LOG-KAT-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin / Gudang",
        jenisTransaksi: "CREATE",
        idTransaksi: `KAT-${norm.slice(0, 12)}`,
        detail: `Menambahkan kategori produk kustom baru: "${norm}"`,
        nominal: 0
      });
      return db.kategoriProduk?.find((k) => normalizeKategoriName(k.nama) === norm);
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/kategori-produk/rename", async (req, res) => {
  try {
    const { kategoriLama, kategoriBaru, deskripsi } = req.body;
    if (!kategoriLama || !kategoriBaru || !String(kategoriBaru).trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori lama dan kategori baru wajib diisi"
      });
    }
    const oldNorm = normalizeKategoriName(kategoriLama);
    const newNorm = normalizeKategoriName(kategoriBaru);
    const { iso, tanggal, jam } = getWIBDateTime();
    const summary = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.kategoriProduk)) db.kategoriProduk = [];
      const oldIdx = db.kategoriProduk.findIndex(
        (k) => normalizeKategoriName(k.nama) === oldNorm
      );
      const existingNew = db.kategoriProduk.find(
        (k) => normalizeKategoriName(k.nama) === newNorm
      );
      if (oldIdx >= 0) {
        const oldDesc = db.kategoriProduk[oldIdx].deskripsi;
        if (existingNew && oldNorm !== newNorm) {
          if (deskripsi !== void 0) existingNew.deskripsi = String(deskripsi).trim();
          else if (!existingNew.deskripsi && oldDesc) existingNew.deskripsi = oldDesc;
          db.kategoriProduk.splice(oldIdx, 1);
        } else {
          db.kategoriProduk[oldIdx].nama = newNorm;
          if (deskripsi !== void 0) {
            db.kategoriProduk[oldIdx].deskripsi = String(deskripsi).trim();
          }
        }
      } else {
        ensureKategoriRegistered(db, newNorm, deskripsi);
      }
      let affectedCount = 0;
      for (const p of db.produk) {
        if (normalizeKategoriName(p.kategori) === oldNorm) {
          p.kategori = newNorm;
          affectedCount += 1;
        }
      }
      db.auditLogs.unshift({
        id: `LOG-KAT-REN-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin / Gudang",
        jenisTransaksi: "UPDATE",
        idTransaksi: `KAT-${newNorm.slice(0, 12)}`,
        detail: `Mengubah kategori produk "${oldNorm}" menjadi "${newNorm}" (${affectedCount} produk diperbarui)`,
        nominal: 0
      });
      return { kategoriLama: oldNorm, kategoriBaru: newNorm, affectedCount };
    });
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/kategori-produk/delete", async (req, res) => {
  try {
    const { nama, kategoriPengganti } = req.body;
    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: "Nama kategori wajib diisi" });
    }
    const targetNorm = normalizeKategoriName(nama);
    const { iso, tanggal, jam } = getWIBDateTime();
    const summary = await dbManager.executeTransaction((db) => {
      const usedProducts = db.produk.filter(
        (p) => normalizeKategoriName(p.kategori) === targetNorm
      );
      if (usedProducts.length > 0 && !kategoriPengganti) {
        throw new Error(
          `Kategori "${targetNorm}" masih dipakai oleh ${usedProducts.length} produk. Pindahkan produk terlebih dahulu atau gunakan fitur Ubah Nama Kategori.`
        );
      }
      let movedCount = 0;
      if (usedProducts.length > 0 && kategoriPengganti) {
        const fallbackNorm = ensureKategoriRegistered(db, kategoriPengganti);
        for (const p of usedProducts) {
          p.kategori = fallbackNorm;
          movedCount += 1;
        }
      }
      if (Array.isArray(db.kategoriProduk)) {
        db.kategoriProduk = db.kategoriProduk.filter(
          (k) => normalizeKategoriName(k.nama) !== targetNorm
        );
      }
      db.auditLogs.unshift({
        id: `LOG-KAT-DEL-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin / Gudang",
        jenisTransaksi: "UPDATE",
        idTransaksi: `KAT-DEL-${targetNorm.slice(0, 10)}`,
        detail: `Menghapus kategori "${targetNorm}"${movedCount > 0 ? ` (${movedCount} produk dipindahkan)` : ""}`,
        nominal: 0
      });
      return { deleted: targetNorm, movedCount };
    });
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/produk/bulk-kategori", async (req, res) => {
  try {
    const { kodeProdukList, kategoriBaru, deskripsiKategori } = req.body;
    if (!Array.isArray(kodeProdukList) || kodeProdukList.length === 0) {
      return res.status(400).json({ success: false, message: "Pilih minimal satu produk" });
    }
    if (!kategoriBaru || !String(kategoriBaru).trim()) {
      return res.status(400).json({ success: false, message: "Nama kategori tujuan wajib diisi" });
    }
    const newNorm = normalizeKategoriName(kategoriBaru);
    const { iso, tanggal, jam } = getWIBDateTime();
    const result = await dbManager.executeTransaction((db) => {
      ensureKategoriRegistered(db, newNorm, deskripsiKategori);
      const targetCodes = new Set(kodeProdukList.map((c) => String(c).trim().toUpperCase()));
      let updatedCount = 0;
      for (const p of db.produk) {
        if (targetCodes.has(p.kode.toUpperCase())) {
          p.kategori = newNorm;
          updatedCount += 1;
        }
      }
      db.auditLogs.unshift({
        id: `LOG-PRD-BULK-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin / Gudang",
        jenisTransaksi: "UPDATE",
        idTransaksi: `BULK-KAT-${Date.now().toString().slice(-4)}`,
        detail: `Memperbarui kategori ${updatedCount} produk secara massal ke "${newNorm}"`,
        nominal: 0
      });
      return { kategoriBaru: newNorm, updatedCount };
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/produk", (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.produk });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/produk", async (req, res) => {
  try {
    const { kode, kategori, nama, satuan, hargaBeli, hargaJual, hargaKhususRekanan, stokAwal, minimum } = req.body;
    if (!kode || !nama || !satuan || hargaJual === void 0) {
      return res.status(400).json({ success: false, message: "Kode, nama, satuan, dan harga jual wajib diisi" });
    }
    const { iso } = getWIBDateTime();
    const cleanKode = String(kode).toUpperCase().trim();
    const cleanKategori = normalizeKategoriName(kategori);
    const created = await dbManager.executeTransaction((db) => {
      if (db.produk.some((p) => p.kode === cleanKode)) {
        throw new Error(`Produk dengan kode ${cleanKode} sudah terdaftar`);
      }
      ensureKategoriRegistered(db, cleanKategori);
      const buyVal = Math.max(0, Number(hargaBeli) || 0);
      const rawSell = Math.max(0, Number(hargaJual) || 0);
      const sellVal = rawSell > 0 ? rawSell : buyVal;
      const rekananVal = hargaKhususRekanan !== void 0 && hargaKhususRekanan !== "" && Number(hargaKhususRekanan) > 0 ? Math.max(0, Number(hargaKhususRekanan) || 0) : sellVal;
      const newProd = {
        kode: cleanKode,
        kategori: cleanKategori,
        nama: String(nama).trim(),
        satuan: String(satuan).trim(),
        hargaBeli: buyVal,
        hargaJual: sellVal,
        hargaKhususRekanan: rekananVal,
        status: "AKTIF"
      };
      db.produk.push(newProd);
      const newStok = {
        kode: cleanKode,
        namaProduk: newProd.nama,
        satuan: newProd.satuan,
        stok: Number(stokAwal) || 0,
        minimum: Number(minimum) || 5,
        updateTerakhir: iso
      };
      db.stokBarang.push(newStok);
      return { produk: newProd, stok: newStok };
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/produk/:kode", async (req, res) => {
  try {
    const { kode } = req.params;
    const { nama, kategori, satuan, hargaBeli, hargaJual, hargaKhususRekanan, status, minimum } = req.body;
    const { iso, tanggal, jam } = getWIBDateTime();
    const updated = await dbManager.executeTransaction((db) => {
      const prod = db.produk.find((p) => p.kode === kode);
      if (!prod) throw new Error(`Produk dengan kode ${kode} tidak ditemukan`);
      if (nama) prod.nama = String(nama).trim();
      if (kategori && String(kategori).trim()) {
        const cleanKategori = normalizeKategoriName(kategori);
        prod.kategori = cleanKategori;
        ensureKategoriRegistered(db, cleanKategori);
      }
      if (satuan) prod.satuan = String(satuan).trim();
      if (hargaBeli !== void 0) prod.hargaBeli = Math.max(0, Number(hargaBeli) || 0);
      if (hargaJual !== void 0) prod.hargaJual = Math.max(0, Number(hargaJual) || 0);
      if (hargaKhususRekanan !== void 0) prod.hargaKhususRekanan = Math.max(0, Number(hargaKhususRekanan) || 0);
      if (status) prod.status = status;
      let stok = db.stokBarang.find((s) => s.kode === kode);
      if (stok) {
        stok.namaProduk = prod.nama;
        stok.satuan = prod.satuan;
        if (minimum !== void 0) stok.minimum = Math.max(0, Number(minimum) || 0);
        stok.updateTerakhir = iso;
      } else {
        stok = {
          kode: prod.kode,
          namaProduk: prod.nama,
          satuan: prod.satuan,
          stok: 0,
          minimum: minimum !== void 0 ? Math.max(0, Number(minimum) || 0) : 5,
          updateTerakhir: iso
        };
        db.stokBarang.push(stok);
      }
      db.auditLogs.unshift({
        id: `LOG-PRD-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Kasir & Gudang",
        jenisTransaksi: "UPDATE",
        idTransaksi: `PRD-${kode}`,
        detail: `Pembaruan data produk ${prod.nama} [${prod.kategori}]: Harga Jual Rp ${(prod.hargaJual || 0).toLocaleString("id-ID")}, HPP Rp ${(prod.hargaBeli || 0).toLocaleString("id-ID")}`,
        nominal: prod.hargaJual || 0
      });
      return { produk: prod, stok };
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/stok", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.stokBarang });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/stok/adjust", async (req, res) => {
  try {
    const { kode, penyesuaianQty, alasan } = req.body;
    const { tanggal, jam, iso } = getWIBDateTime();
    const result = await dbManager.executeTransaction((db) => {
      const stokItem = db.stokBarang.find((s) => s.kode === kode);
      if (!stokItem) throw new Error("Item stok tidak ditemukan");
      const qty = Number(penyesuaianQty);
      if (isNaN(qty)) throw new Error("Qty penyesuaian tidak valid");
      if (stokItem.stok + qty < 0) {
        throw new Error(`Stok tidak boleh menjadi negatif. Stok saat ini: ${stokItem.stok}`);
      }
      const stokSebelum = stokItem.stok;
      stokItem.stok += qty;
      stokItem.updateTerakhir = iso;
      db.auditLogs.unshift({
        id: `LOG-STOK-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Gudang Kasir",
        jenisTransaksi: "UPDATE",
        idTransaksi: `ADJ-${kode}`,
        detail: `Penyesuaian stok ${stokItem.namaProduk}: ${stokSebelum} -> ${stokItem.stok} (${qty > 0 ? "+" : ""}${qty}). Alasan: ${alasan || "Koreksi fisik"}`,
        nominal: 0
      });
      return stokItem;
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/stok-hasil-bumi", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.stokHasilBumi });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/stok-hasil-bumi", async (req, res) => {
  try {
    const { kode, nama, satuan, hargaBeliStandar, isBelumPutusHarga } = req.body;
    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: "Nama barang hasil bumi wajib diisi" });
    }
    const { iso, tanggal, jam } = getWIBDateTime();
    const created = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      const cleanNama = String(nama).trim();
      if (db.stokHasilBumi.some((h) => h.nama.trim().toUpperCase() === cleanNama.toUpperCase())) {
        throw new Error(`Barang hasil bumi "${cleanNama}" sudah terdaftar di sistem`);
      }
      let cleanKode = kode ? String(kode).trim().toUpperCase() : "";
      if (!cleanKode) {
        let maxNum = 8;
        for (const h of db.stokHasilBumi) {
          const match = /^HB-(\d+)$/i.exec(h.kode || "");
          if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > maxNum) maxNum = num;
          }
        }
        let nextNum = maxNum + 1;
        cleanKode = `HB-${String(nextNum).padStart(2, "0")}`;
        while (db.stokHasilBumi.some((h) => h.kode.toUpperCase() === cleanKode)) {
          nextNum += 1;
          cleanKode = `HB-${String(nextNum).padStart(2, "0")}`;
        }
      } else if (db.stokHasilBumi.some((h) => h.kode.toUpperCase() === cleanKode)) {
        throw new Error(`Komoditas dengan kode ${cleanKode} sudah terdaftar`);
      }
      const newKomoditas = {
        kode: cleanKode,
        nama: cleanNama,
        satuan: String(satuan || "Kg").trim(),
        stok: 0,
        hargaBeliStandar: Math.max(0, Number(hargaBeliStandar) || 0),
        isBelumPutusHarga: Boolean(isBelumPutusHarga),
        updateTerakhir: iso
      };
      db.stokHasilBumi.push(newKomoditas);
      db.auditLogs.unshift({
        id: `LOG-HB-ADD-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Kasir Hasil Bumi",
        jenisTransaksi: "CREATE",
        idTransaksi: cleanKode,
        detail: `Tambah Barang Hasil Bumi Baru: ${cleanNama} (${cleanKode}) \u2014 Satuan ${newKomoditas.satuan}, Harga Standar Rp ${newKomoditas.hargaBeliStandar.toLocaleString("id-ID")}/${newKomoditas.satuan}`,
        nominal: newKomoditas.hargaBeliStandar
      });
      return newKomoditas;
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/stok-hasil-bumi/:kode/harga", async (req, res) => {
  try {
    const { kode } = req.params;
    const { hargaBeliStandar } = req.body;
    const { iso, tanggal, jam } = getWIBDateTime();
    const updated = await dbManager.executeTransaction((db) => {
      const hb = (db.stokHasilBumi || []).find((h) => h.kode === kode);
      if (!hb) throw new Error(`Komoditas dengan kode ${kode} tidak ditemukan`);
      hb.hargaBeliStandar = Math.max(0, Number(hargaBeliStandar) || 0);
      hb.updateTerakhir = iso;
      db.auditLogs.unshift({
        id: `LOG-HB-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Kasir Hasil Bumi",
        jenisTransaksi: "UPDATE",
        idTransaksi: `HB-${kode}`,
        detail: `Pembaruan harga standar hasil bumi ${hb.nama} menjadi Rp ${hb.hargaBeliStandar.toLocaleString("id-ID")}/${hb.satuan}`,
        nominal: hb.hargaBeliStandar
      });
      return hb;
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/stok-hasil-bumi/saldo-awal", async (req, res) => {
  try {
    const { kode, stokAwal, rataRataModalAwal, modalAwalTotal, keterangan, items } = req.body;
    const { iso, tanggal, jam } = getWIBDateTime();
    const result = await dbManager.executeTransaction((db) => {
      const listToUpdate = Array.isArray(items) ? items : [{ kode, stokAwal, rataRataModalAwal, modalAwalTotal, keterangan }];
      const updatedResults = [];
      for (const item of listToUpdate) {
        if (!item.kode) continue;
        const hb = db.stokHasilBumi.find((h) => h.kode === item.kode);
        if (!hb) {
          throw new Error(`Komoditas dengan kode ${item.kode} tidak ditemukan`);
        }
        const validStokAwal = Math.max(0, Number(item.stokAwal) || 0);
        const validRataRata = Math.max(0, Number(item.rataRataModalAwal) || 0);
        const validModalTotal = Number(item.modalAwalTotal) > 0 ? Number(item.modalAwalTotal) : Math.round(validStokAwal * validRataRata);
        const pembelianBerjalanKg = db.pembelianHasilBumi.filter((p) => p.komoditasKode === item.kode && TransactionService.isPhysicalPembelianHasilBumi(p)).reduce((sum, p) => sum + (p.beratBersih || 0), 0);
        const penjualanBerjalanKg = (db.penjualanHasilBumi || []).filter((j) => j.komoditasKode === item.kode).reduce((sum, j) => sum + (j.beratBersih || 0), 0);
        hb.stokAwal = validStokAwal;
        hb.rataRataModalAwal = validRataRata;
        hb.modalAwalTotal = validModalTotal;
        hb.keteranganStokAwal = item.keterangan?.trim() || "Rekap stok manual lama sebelum aplikasi";
        hb.tanggalInputStokAwal = `${tanggal} ${jam}`;
        hb.stok = Math.max(0, Math.round((validStokAwal + pembelianBerjalanKg - penjualanBerjalanKg) * 100) / 100);
        hb.updateTerakhir = iso;
        db.auditLogs.unshift({
          id: `AUDIT-${Date.now().toString().slice(-6)}`,
          timestamp: iso,
          tanggal,
          jam,
          user: "Admin Gudang",
          jenisTransaksi: "UPDATE",
          idTransaksi: hb.kode,
          detail: `Input Rekap Manual Lalu: Stok Awal ${validStokAwal} Kg @ Rp ${validRataRata.toLocaleString("id-ID")}/Kg untuk ${hb.nama}`,
          nominal: validModalTotal
        });
        updatedResults.push(hb);
      }
      return updatedResults;
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/penjualan", async (req, res) => {
  try {
    const record = await TransactionService.processPenjualan(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/penjualan", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.penjualan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/pembelian-barang", async (req, res) => {
  try {
    const record = await TransactionService.processPembelianBarang(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/pembelian-barang", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.pembelianBarang || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/transaksi/pembelian-barang/:noPembelian", async (req, res) => {
  try {
    const { noPembelian } = req.params;
    const result = await TransactionService.deletePembelianBarang(noPembelian);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/laporan/laba-rugi-produk", (_req, res) => {
  try {
    const summary = TransactionService.getLabaRugiSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/pembelian-hasil-bumi", async (req, res) => {
  try {
    const record = await TransactionService.processPembelianHasilBumi(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/pembelian-hasil-bumi", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.pembelianHasilBumi });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/pembelian-hasil-bumi/putus-harga", async (req, res) => {
  try {
    const record = await TransactionService.putusHargaHasilBumi(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/penjualan-hasil-bumi", (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.penjualanHasilBumi || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/penjualan-hasil-bumi", async (req, res) => {
  try {
    const record = await TransactionService.processPenjualanHasilBumi(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/transaksi/penjualan-hasil-bumi/:noPenjualan", async (req, res) => {
  try {
    const result = await TransactionService.deletePenjualanHasilBumi(req.params.noPenjualan);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/laporan/ringkasan-hasil-bumi-bulanan", (req, res) => {
  try {
    const { bulan, tahun, kodeKomoditas } = req.query;
    const summary = TransactionService.getRingkasanStokHasilBumiBulanan({
      bulan: bulan ? Number(bulan) : void 0,
      tahun: tahun ? Number(tahun) : void 0,
      kodeKomoditas: kodeKomoditas ? String(kodeKomoditas) : void 0
    });
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/kasbon-uang", async (req, res) => {
  try {
    const record = await TransactionService.processKasbonUang(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/kasbon-uang", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.kasbonUang });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/nota-lalu", async (req, res) => {
  try {
    const result = await TransactionService.processInputNotaLalu(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/bukti-nota-lalu", (req, res) => {
  try {
    const { idMitra, waktuFilter, beforeDate, startDate, endDate, search, hanyaNotaLalu } = req.query;
    const data = TransactionService.getDaftarBuktiNotaLalu({
      idMitra: idMitra ? String(idMitra) : void 0,
      waktuFilter: waktuFilter ? String(waktuFilter) : void 0,
      beforeDate: beforeDate ? String(beforeDate) : void 0,
      startDate: startDate ? String(startDate) : void 0,
      endDate: endDate ? String(endDate) : void 0,
      search: search ? String(search) : void 0,
      hanyaNotaLalu: hanyaNotaLalu === "true" || hanyaNotaLalu === "1"
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/bersihkan-bukti-nota-lalu", async (req, res) => {
  try {
    const result = await TransactionService.bersihkanBuktiNotaLalu(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/mitra/pinjam-uang", async (req, res) => {
  try {
    const result = await TransactionService.processPinjamanUangDariMitra(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/bayar-bon", async (req, res) => {
  try {
    const record = await TransactionService.processBayarBon(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/bayar-bon", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.bayarBon });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/transfer-rekening", async (req, res) => {
  try {
    const record = await TransactionService.processTransferRekening(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/transfer-rekening", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.transferRekening });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/cairkan-titipan", async (req, res) => {
  try {
    const record = await TransactionService.processPencairanTitipan(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/cairkan-titipan", (_req, res) => {
  try {
    const list = TransactionService.getPencairanTitipanList();
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/pengeluaran", async (req, res) => {
  try {
    const record = await TransactionService.processPengeluaran(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/pengeluaran", (_req, res) => {
  try {
    const list = TransactionService.getPengeluaranList();
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/pengeluaran/:id", async (req, res) => {
  try {
    const result = await TransactionService.deletePengeluaran(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/inventaris", (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.inventaris || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/inventaris", async (req, res) => {
  try {
    const {
      kode,
      namaItem,
      kategori,
      nomorPlat,
      merkTipe,
      tahunKeluaran,
      warna,
      nomorRangka,
      nomorMesin,
      driverPenanggungJawab,
      idKaryawanDriver,
      teleponDriver,
      divisi,
      tanggalPajakTahunan,
      tanggalPajakLimaTahunan,
      tanggalKir,
      kondisi,
      nilaiPerolehan,
      tanggalBeli,
      fotoItem,
      fotoStnk,
      catatan
    } = req.body || {};
    if (!namaItem || !String(namaItem).trim()) {
      return res.status(400).json({ success: false, message: "Nama item / kendaraan inventaris wajib diisi" });
    }
    const { iso, tanggal, jam } = getWIBDateTime();
    const created = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.inventaris)) db.inventaris = [];
      const cleanPlat = nomorPlat ? String(nomorPlat).trim().toUpperCase() : "";
      if (cleanPlat && cleanPlat !== "-" && db.inventaris.some(
        (item) => (item.nomorPlat || "").replace(/\s+/g, "").toUpperCase() === cleanPlat.replace(/\s+/g, "")
      )) {
        throw new Error(`Kendaraan dengan Nomor Plat ${cleanPlat} sudah terdaftar di Inventaris PT`);
      }
      let maxNum = 0;
      for (const inv of db.inventaris) {
        const m = /^INV-(\d+)$/i.exec(inv.kode || "");
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > maxNum) maxNum = n;
        }
      }
      const cleanKode = kode ? String(kode).trim().toUpperCase() : `INV-${String(maxNum + 1).padStart(3, "0")}`;
      const newItem = {
        id: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        kode: cleanKode,
        namaItem: String(namaItem).trim(),
        kategori: kategori || "TRUCK_ANGKUTAN",
        nomorPlat: cleanPlat || "-",
        merkTipe: String(merkTipe || "-").trim(),
        tahunKeluaran: String(tahunKeluaran || "-").trim(),
        warna: warna ? String(warna).trim() : "",
        nomorRangka: nomorRangka ? String(nomorRangka).trim().toUpperCase() : "",
        nomorMesin: nomorMesin ? String(nomorMesin).trim().toUpperCase() : "",
        driverPenanggungJawab: String(driverPenanggungJawab || "-").trim(),
        idKaryawanDriver: idKaryawanDriver ? String(idKaryawanDriver).trim() : void 0,
        teleponDriver: teleponDriver ? String(teleponDriver).trim() : "",
        divisi: String(divisi || "Wijaya Transport").trim(),
        tanggalPajakTahunan: String(tanggalPajakTahunan || "").trim(),
        tanggalPajakLimaTahunan: tanggalPajakLimaTahunan ? String(tanggalPajakLimaTahunan).trim() : "",
        tanggalKir: tanggalKir ? String(tanggalKir).trim() : "",
        kondisi: kondisi || "BAIK",
        nilaiPerolehan: nilaiPerolehan !== void 0 ? Math.max(0, Number(nilaiPerolehan) || 0) : 0,
        tanggalBeli: tanggalBeli ? String(tanggalBeli).trim() : "",
        fotoItem: fotoItem || void 0,
        fotoStnk: fotoStnk || void 0,
        catatan: catatan ? String(catatan).trim() : "",
        status: "AKTIF",
        createdAt: iso,
        updatedAt: iso
      };
      db.inventaris.unshift(newItem);
      db.auditLogs.unshift({
        id: `LOG-INV-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin Inventaris",
        jenisTransaksi: "CREATE",
        idTransaksi: newItem.kode,
        detail: `Tambah Inventaris PT: ${newItem.namaItem} (${newItem.nomorPlat !== "-" ? newItem.nomorPlat : newItem.kode}) \u2014 Driver: ${newItem.driverPenanggungJawab}, Tahun: ${newItem.tahunKeluaran}`,
        nominal: newItem.nilaiPerolehan || 0
      });
      return newItem;
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/inventaris/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { iso, tanggal, jam } = getWIBDateTime();
    const updated = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.inventaris)) db.inventaris = [];
      const item = db.inventaris.find((inv) => inv.id === id || inv.kode === id);
      if (!item) throw new Error("Item inventaris tidak ditemukan");
      if (body.nomorPlat !== void 0) {
        const cleanPlat = String(body.nomorPlat || "").trim().toUpperCase();
        if (cleanPlat && cleanPlat !== "-" && db.inventaris.some(
          (other) => other.id !== item.id && (other.nomorPlat || "").replace(/\s+/g, "").toUpperCase() === cleanPlat.replace(/\s+/g, "")
        )) {
          throw new Error(`Nomor Plat ${cleanPlat} sudah digunakan pada unit inventaris lain`);
        }
        item.nomorPlat = cleanPlat || "-";
      }
      if (body.namaItem !== void 0 && String(body.namaItem).trim()) {
        item.namaItem = String(body.namaItem).trim();
      }
      if (body.kategori !== void 0) item.kategori = body.kategori;
      if (body.merkTipe !== void 0) item.merkTipe = String(body.merkTipe || "-").trim();
      if (body.tahunKeluaran !== void 0) item.tahunKeluaran = String(body.tahunKeluaran || "-").trim();
      if (body.warna !== void 0) item.warna = String(body.warna || "").trim();
      if (body.nomorRangka !== void 0) item.nomorRangka = String(body.nomorRangka || "").trim().toUpperCase();
      if (body.nomorMesin !== void 0) item.nomorMesin = String(body.nomorMesin || "").trim().toUpperCase();
      if (body.driverPenanggungJawab !== void 0) {
        item.driverPenanggungJawab = String(body.driverPenanggungJawab || "-").trim();
      }
      if (body.idKaryawanDriver !== void 0) {
        item.idKaryawanDriver = body.idKaryawanDriver ? String(body.idKaryawanDriver).trim() : void 0;
      }
      if (body.teleponDriver !== void 0) item.teleponDriver = String(body.teleponDriver || "").trim();
      if (body.divisi !== void 0) item.divisi = String(body.divisi || "Wijaya Transport").trim();
      if (body.tanggalPajakTahunan !== void 0) {
        item.tanggalPajakTahunan = String(body.tanggalPajakTahunan || "").trim();
      }
      if (body.tanggalPajakLimaTahunan !== void 0) {
        item.tanggalPajakLimaTahunan = String(body.tanggalPajakLimaTahunan || "").trim();
      }
      if (body.tanggalKir !== void 0) item.tanggalKir = String(body.tanggalKir || "").trim();
      if (body.kondisi !== void 0) item.kondisi = body.kondisi;
      if (body.nilaiPerolehan !== void 0) {
        item.nilaiPerolehan = Math.max(0, Number(body.nilaiPerolehan) || 0);
      }
      if (body.tanggalBeli !== void 0) item.tanggalBeli = String(body.tanggalBeli || "").trim();
      if (body.fotoItem !== void 0) item.fotoItem = body.fotoItem || void 0;
      if (body.fotoStnk !== void 0) item.fotoStnk = body.fotoStnk || void 0;
      if (body.catatan !== void 0) item.catatan = String(body.catatan || "").trim();
      if (body.status !== void 0) item.status = body.status;
      item.updatedAt = iso;
      db.auditLogs.unshift({
        id: `LOG-INV-UPD-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin Inventaris",
        jenisTransaksi: "UPDATE",
        idTransaksi: item.kode,
        detail: `Update Profil Inventaris: ${item.namaItem} (${item.nomorPlat}) \u2014 Driver: ${item.driverPenanggungJawab}, Pajak: ${item.tanggalPajakTahunan || "-"}`,
        nominal: item.nilaiPerolehan || 0
      });
      return item;
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/inventaris/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { iso, tanggal, jam } = getWIBDateTime();
    const result = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.inventaris)) db.inventaris = [];
      const idx = db.inventaris.findIndex((inv) => inv.id === id || inv.kode === id);
      if (idx === -1) throw new Error("Item inventaris tidak ditemukan");
      const removed = db.inventaris[idx];
      db.inventaris.splice(idx, 1);
      db.auditLogs.unshift({
        id: `LOG-INV-DEL-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: "Admin Inventaris",
        jenisTransaksi: "VOID",
        idTransaksi: removed.kode,
        detail: `Hapus Item Inventaris PT: ${removed.namaItem} (${removed.nomorPlat})`,
        nominal: 0
      });
      return { id: removed.id, kode: removed.kode, namaItem: removed.namaItem };
    });
    res.json({ success: true, data: result, message: "Item inventaris berhasil dihapus" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/transaksi/update-statement-entry", async (req, res) => {
  try {
    const result = await TransactionService.updateTransactionFromStatement(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/detail", (req, res) => {
  try {
    const id = String(req.query.id || "").trim();
    const jenis = req.query.jenis ? String(req.query.jenis).trim() : void 0;
    const data = TransactionService.getTransactionDetail(id, jenis);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/detail", (req, res) => {
  try {
    const id = String(req.body?.id || "").trim();
    const jenis = req.body?.jenis ? String(req.body.jenis).trim() : void 0;
    const data = TransactionService.getTransactionDetail(id, jenis);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/edit-detail", async (req, res) => {
  try {
    const result = await TransactionService.editTransactionDetail(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/transaksi/edit-detail", async (req, res) => {
  try {
    const result = await TransactionService.editTransactionDetail(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/profil-perusahaan", (_req, res) => {
  try {
    const profile = TransactionService.getProfilPerusahaan();
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.put("/profil-perusahaan", async (req, res) => {
  try {
    const profile = await TransactionService.updateProfilPerusahaan(req.body);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/rekening-koran-mitra/:id", (req, res) => {
  try {
    const summary = TransactionService.getRekeningKoranMitra(req.params.id);
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/dashboard", (req, res) => {
  try {
    const stats = TransactionService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/laporan/arus-kas-harian", (req, res) => {
  try {
    const tanggal = req.query.tanggal;
    const data = TransactionService.getRekapHarianKas(tanggal);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/semua", (req, res) => {
  try {
    const { tanggal, arusUang, kategori, pihakTerkait, search } = req.query;
    const result = TransactionService.getAllUnifiedTransactions({
      tanggal,
      arusUang,
      kategori,
      pihakTerkait,
      search
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/audit-logs", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.auditLogs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/karyawan", (req, res) => {
  try {
    const db = dbManager.get();
    const list = (db.karyawan || []).map((k) => {
      const mitraId = k.idMitraTerkait || `MTR-${k.id}`;
      const outstandingBarang = db.penjualan.filter((p) => p.idMitra === mitraId && p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR").reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const outstandingUang = db.kasbonUang.filter((ku) => ku.idMitra === mitraId && ku.status !== "LUNAS").reduce((sum, ku) => sum + (ku.sisaKasbon || 0), 0);
      return {
        ...k,
        kasbonBarang: outstandingBarang,
        kasbonUang: outstandingUang,
        totalKasbonAktif: outstandingBarang + outstandingUang
      };
    });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/karyawan/rekap", (_req, res) => {
  try {
    const rekap = TransactionService.getRekapMasterKaryawan();
    res.json({ success: true, data: rekap });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/karyawan/upah-harian", (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.upahHarian || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/karyawan/kerja-harian", async (req, res) => {
  try {
    const result = await TransactionService.recordKerjaHarian(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/karyawan/kerja-harian/:id", async (req, res) => {
  try {
    const result = await TransactionService.updateKerjaHarian(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/karyawan/kerja-harian/:id", async (req, res) => {
  try {
    const result = await TransactionService.deleteKerjaHarian(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/karyawan/kerja-harian/batch", async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) throw new Error("Format data batch harus berupa array rows");
    const results = [];
    for (const r of rows) {
      const resRow = await TransactionService.recordKerjaHarian(r);
      results.push(resRow);
    }
    res.json({ success: true, data: results, count: results.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/karyawan/:id/detail-harian", (req, res) => {
  try {
    const detail = TransactionService.getDetailHarianKaryawan(req.params.id);
    res.json({ success: true, data: detail });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/karyawan/:id/settle-gaji", async (req, res) => {
  try {
    const record = await TransactionService.settleHakUpahKaryawan({
      ...req.body,
      idKaryawan: req.params.id
    });
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/karyawan", async (req, res) => {
  try {
    const { nik, nama, jabatan, divisi, departemen, gajiPokok, tunjanganTetap, telepon, alamat, tanggalMasuk, catatan } = req.body;
    if (!nama || !jabatan) {
      return res.status(400).json({ success: false, message: "Nama dan Jabatan karyawan wajib diisi" });
    }
    const created = await dbManager.executeTransaction((db) => {
      if (!db.karyawan) db.karyawan = [];
      const cleanNik = nik ? String(nik).trim().toUpperCase() : `KRY-${String(db.karyawan.length + 1).padStart(3, "0")}`;
      if (db.karyawan.some((k) => k.nik === cleanNik)) {
        throw new Error(`Karyawan dengan NIK ${cleanNik} sudah terdaftar`);
      }
      const id = `KRY-${Date.now().toString().slice(-4)}`;
      const idMitra = `MTR-${id}`;
      const selectedDivisi = String(divisi || departemen || "Gudang Wijaya Agro").trim();
      const newKaryawan = {
        id,
        nik: cleanNik,
        nama: String(nama).trim(),
        jabatan: String(jabatan).trim(),
        divisi: selectedDivisi,
        departemen: selectedDivisi,
        gajiPokok: Math.max(0, Number(gajiPokok) || 0),
        tunjanganTetap: Math.max(0, Number(tunjanganTetap) || 0),
        telepon: telepon || "-",
        alamat: alamat || "-",
        tanggalMasuk: tanggalMasuk || getWIBDateTime().tanggal,
        status: "AKTIF",
        idMitraTerkait: idMitra,
        catatan: catatan || ""
      };
      db.karyawan.push(newKaryawan);
      const existingMitraIdx = db.mitra.findIndex((m) => m.id === idMitra || m.kode === cleanNik || m.role === "KARYAWAN" && m.nama.toLowerCase() === newKaryawan.nama.toLowerCase());
      if (existingMitraIdx >= 0) {
        db.mitra[existingMitraIdx].nama = newKaryawan.nama;
        db.mitra[existingMitraIdx].role = "KARYAWAN";
        db.mitra[existingMitraIdx].telepon = newKaryawan.telepon;
        db.mitra[existingMitraIdx].alamat = newKaryawan.alamat;
        db.mitra[existingMitraIdx].status = "AKTIF";
        db.mitra[existingMitraIdx].catatan = `Karyawan: ${newKaryawan.jabatan} (Divisi ${newKaryawan.divisi})`;
      } else {
        db.mitra.push({
          id: idMitra,
          kode: cleanNik,
          nama: newKaryawan.nama,
          role: "KARYAWAN",
          telepon: newKaryawan.telepon,
          alamat: newKaryawan.alamat,
          status: "AKTIF",
          catatan: `Karyawan: ${newKaryawan.jabatan} (Divisi ${newKaryawan.divisi})`
        });
      }
      return newKaryawan;
    });
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.put("/karyawan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, jabatan, divisi, departemen, gajiPokok, tunjanganTetap, telepon, alamat, status, catatan } = req.body;
    const updated = await dbManager.executeTransaction((db) => {
      const kry = db.karyawan.find((k) => k.id === id);
      if (!kry) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);
      if (nama) kry.nama = String(nama).trim();
      if (jabatan) kry.jabatan = String(jabatan).trim();
      if (divisi) {
        kry.divisi = String(divisi).trim();
        kry.departemen = String(divisi).trim();
      } else if (departemen) {
        kry.divisi = String(departemen).trim();
        kry.departemen = String(departemen).trim();
      }
      if (gajiPokok !== void 0) kry.gajiPokok = Math.max(0, Number(gajiPokok) || 0);
      if (tunjanganTetap !== void 0) kry.tunjanganTetap = Math.max(0, Number(tunjanganTetap) || 0);
      if (telepon) kry.telepon = telepon;
      if (alamat) kry.alamat = alamat;
      if (status) kry.status = status;
      if (catatan !== void 0) kry.catatan = catatan;
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const mtr = db.mitra.find((m) => m.id === mitraId || m.kode === kry.nik || m.role === "KARYAWAN" && m.nama.toLowerCase() === kry.nama.toLowerCase());
      if (mtr) {
        mtr.nama = kry.nama;
        mtr.role = "KARYAWAN";
        mtr.telepon = kry.telepon;
        mtr.alamat = kry.alamat;
        mtr.status = kry.status;
        mtr.catatan = `Karyawan: ${kry.jabatan} (Divisi ${kry.divisi || kry.departemen})`;
      } else {
        db.mitra.push({
          id: mitraId,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: "KARYAWAN",
          telepon: kry.telepon || "-",
          alamat: kry.alamat || "-",
          status: kry.status || "AKTIF",
          catatan: `Karyawan: ${kry.jabatan} (Divisi ${kry.divisi || kry.departemen})`
        });
      }
      return kry;
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/karyawan/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await dbManager.executeTransaction((db) => {
      const kry = db.karyawan.find((k) => k.id === id);
      if (!kry) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);
      kry.status = kry.status === "AKTIF" ? "NONAKTIF" : "AKTIF";
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const mtr = db.mitra.find((m) => m.id === mitraId || m.kode === kry.nik);
      if (mtr) {
        mtr.status = kry.status;
      }
      return kry;
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.delete("/karyawan/:id/permanent", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.karyawan)) db.karyawan = [];
      const idx = db.karyawan.findIndex((k) => k.id === id);
      if (idx === -1) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);
      const kry = db.karyawan[idx];
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      db.karyawan.splice(idx, 1);
      if (Array.isArray(db.mitra)) {
        const mIdx = db.mitra.findIndex((m) => m.id === mitraId || m.kode === kry.nik);
        if (mIdx !== -1) {
          db.mitra.splice(mIdx, 1);
        }
      }
      if (Array.isArray(db.upahHarian)) {
        db.upahHarian = db.upahHarian.filter((u) => u.idKaryawan !== id);
      }
      return true;
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/penggajian", async (req, res) => {
  try {
    const record = await TransactionService.processPenggajian(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/transaksi/penggajian/batch", async (req, res) => {
  try {
    const records = await TransactionService.processBatchPenggajianHarian(req.body);
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/penggajian", (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.penggajian || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/transaksi/upah-harian", (req, res) => {
  try {
    const db = dbManager.get();
    let list = db.upahHarian || [];
    const { idKaryawan, divisi, bulan, tahun } = req.query;
    if (idKaryawan) {
      list = list.filter((u) => u.idKaryawan === idKaryawan);
    }
    if (divisi && divisi !== "ALL") {
      list = list.filter((u) => u.divisi === divisi);
    }
    if (bulan && tahun) {
      const bNum = Number(bulan);
      const tNum = Number(tahun);
      list = list.filter((u) => {
        const parts = (u.tanggalKerja || "").split("/");
        return parts.length >= 3 && Number(parts[1]) === bNum && Number(parts[2]) === tNum;
      });
    }
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/payroll/rekap-bulanan", (req, res) => {
  try {
    const bulan = req.query.bulan ? Number(req.query.bulan) : void 0;
    const tahun = req.query.tahun ? Number(req.query.tahun) : void 0;
    const divisi = req.query.divisi ? String(req.query.divisi) : void 0;
    const rekap = TransactionService.getRekapBulananPayroll({ bulan, tahun, divisi });
    res.json({ success: true, data: rekap });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/divisi", (_req, res) => {
  try {
    const data = dbManager.getDivisiList();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/divisi", async (req, res) => {
  try {
    const { nama, deskripsi, penanggungJawab } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: "Nama divisi wajib diisi" });
    }
    const created = await dbManager.addDivisi(nama, deskripsi, penanggungJawab);
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/divisi/keuangan", (_req, res) => {
  try {
    const data = TransactionService.getPergerakanKeuanganDivisi();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/system/reset-data", async (_req, res) => {
  try {
    await dbManager.resetAllData();
    res.json({
      success: true,
      message: "Seluruh data transaksi, piutang, mutasi, data mitra, dan karyawan berhasil dikosongkan. Sistem siap menerima data riil!"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/billboard", (_req, res) => {
  try {
    const db = dbManager.get();
    const { tanggal: todayTanggal } = getWIBDateTime();
    const rekapKasHariIni = TransactionService.getRekapHarianKas(todayTanggal);
    const uangMasukHariIni = rekapKasHariIni.totalUangMasuk;
    const uangKeluarHariIni = rekapKasHariIni.totalUangKeluar;
    const kas01 = db.rekening.find((r) => r.kode === "KAS01");
    const bankAccounts = db.rekening.filter(
      (r) => (r.kategori === "PERUSAHAAN" || !r.isVirtual && !r.kode.startsWith("REK-")) && r.kode !== "KAS01" && r.status === "AKTIF"
    );
    const totalBank = bankAccounts.reduce((sum, r) => sum + r.saldoSaatIni, 0);
    const bon01 = db.rekening.find((r) => r.kode === "BON01");
    const tit01 = db.rekening.find((r) => r.kode === "TIT01");
    const divisiKeuangan = TransactionService.getPergerakanKeuanganDivisi();
    const upahList = (db.upahHarian || []).slice(0, 30);
    const karyawanMap = new Map(db.karyawan.map((k) => [k.id, k]));
    const activeJobs = upahList.map((u) => {
      const kry = karyawanMap.get(u.idKaryawan);
      return {
        id: u.id,
        idKaryawan: u.idKaryawan,
        nik: u.nikKaryawan || kry?.nik || u.idKaryawan,
        namaKaryawan: u.namaKaryawan || kry?.nama || "Karyawan",
        jabatan: u.jabatan || kry?.jabatan || "-",
        divisi: u.divisi,
        tugasPekerjaan: u.keterangan || `Operasional tugas harian di unit ${u.divisi}`,
        tanggalKerja: u.tanggalKerja,
        upahHarian: u.upahHarian,
        uangMakanLembur: u.uangMakanLembur,
        totalUpah: u.totalUpahHarian,
        status: u.status
      };
    });
    const liveFeed = (db.auditLogs || []).slice(0, 25).map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      tanggal: log.tanggal,
      jam: log.jam,
      user: log.user,
      jenis: log.jenisTransaksi,
      nominal: log.nominal,
      rekeningTerkait: log.rekeningTerkait || "-",
      detail: log.detail
    }));
    const stokKomoditas = (db.stokHasilBumi || []).map((hb) => ({
      kode: hb.kode,
      nama: hb.nama,
      totalKg: hb.stok,
      totalTon: (hb.stok / 1e3).toFixed(2),
      satuan: hb.satuan,
      hargaStandar: hb.hargaBeliStandar
    }));
    res.json({
      success: true,
      data: {
        todayDate: todayTanggal,
        cashflow: {
          masuk: uangMasukHariIni,
          keluar: uangKeluarHariIni,
          net: uangMasukHariIni - uangKeluarHariIni,
          kasKasir: kas01?.saldoSaatIni || 0,
          totalBank,
          totalKasDanBank: (kas01?.saldoSaatIni || 0) + totalBank,
          piutangBon: bon01?.saldoSaatIni || 0,
          titipHasilBumi: tit01?.saldoSaatIni || 0
        },
        divisiList: divisiKeuangan,
        karyawanJobs: activeJobs,
        liveFeed,
        stokKomoditas
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/database/reset-clean", async (_req, res) => {
  try {
    await dbManager.resetCleanData();
    res.json({
      success: true,
      message: "Database berhasil dikosongkan: Data supplier, karyawan, barang toko, dan hasil bumi telah dibersihkan dan siap untuk input data asli."
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/database/backup-json", (_req, res) => {
  try {
    const data = dbManager.get();
    const d = /* @__PURE__ */ new Date();
    const dateStr = d.toISOString().split("T")[0];
    const filename = `wijaya_agro_erp_backup_${dateStr}_${d.getHours()}h.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/json");
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/database/restore-json", async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== "object") {
      return res.status(400).json({ success: false, message: "Format data JSON cadangan tidak valid" });
    }
    const success = await dbManager.restoreDatabase(data);
    res.json({
      success,
      message: "Database berhasil dipulihkan dari file JSON cadangan! Seluruh data transaksi, mitra, dan karyawan telah disinkronkan kembali."
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/database/integrity-status", (_req, res) => {
  try {
    const status = dbManager.getIntegrityStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/supabase/status", (_req, res) => {
  try {
    const status = supabaseSyncEngine.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/supabase/config", async (req, res) => {
  try {
    const { url, key, autoSync } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: "Supabase URL wajib diisi" });
    }
    supabaseSyncEngine.updateConfig({ url, key, autoSync });
    const testResult = await supabaseSyncEngine.testConnection();
    let initialSyncMessage = "";
    if (testResult.success) {
      try {
        const smartSync = await supabaseSyncEngine.syncSmartWithCloud(dbManager);
        if (smartSync.message) {
          initialSyncMessage = ` ${smartSync.message}`;
        }
      } catch (e) {
        console.warn("Initial smart sync with Supabase warning:", e);
      }
    }
    const latestStatus = supabaseSyncEngine.getStatus();
    res.json({
      success: true,
      data: latestStatus,
      cloudReconnectBundle: supabaseSyncEngine.getReconnectBundle(),
      testResult: {
        ...testResult,
        message: `${testResult.message}${initialSyncMessage}`
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/supabase/auto-connect", async (req, res) => {
  try {
    if (!supabaseSyncEngine.isConfigured()) {
      const { bundle, url, key } = req.body || {};
      const parsed = supabaseSyncEngine.parseReconnectBundle(bundle);
      if (parsed) {
        supabaseSyncEngine.updateConfig({
          url: parsed.url,
          key: parsed.key,
          autoSync: parsed.autoSync
        });
      } else if (url && key) {
        supabaseSyncEngine.updateConfig({
          url: String(url),
          key: String(key),
          autoSync: true
        });
      }
    }
    if (supabaseSyncEngine.isConfigured()) {
      await supabaseSyncEngine.ensureFreshCloudState(dbManager, 0);
    }
    const latestStatus = supabaseSyncEngine.getStatus();
    res.json({
      success: true,
      configured: latestStatus.configured,
      data: latestStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || "Gagal auto-connect database" });
  }
});
apiRouter.post("/supabase/test", async (_req, res) => {
  try {
    const result = await supabaseSyncEngine.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/supabase/sync-push", async (_req, res) => {
  try {
    const db = dbManager.get();
    const result = await supabaseSyncEngine.pushToSupabase(db);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/supabase/sync-pull", async (_req, res) => {
  try {
    const pullResult = await supabaseSyncEngine.pullFromSupabase();
    if (!pullResult.success || !pullResult.data) {
      return res.status(400).json({ success: false, message: pullResult.message });
    }
    await dbManager.hydrateFromSupabase(pullResult.data);
    res.json({
      success: true,
      message: "Berhasil menarik & menyinkronkan data terbaru dari Cloud Supabase ke seluruh modul aplikasi!"
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/supabase/sql-schema", (_req, res) => {
  try {
    const sql = supabaseSyncEngine.getSqlSchemaScript();
    res.json({ success: true, data: sql });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/kontrol-kasir/overview", (_req, res) => {
  try {
    const overview = TransactionService.getSmartControlOverview();
    res.json({ success: true, data: overview });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/kontrol-kasir/kliring-silang", async (req, res) => {
  try {
    const result = await TransactionService.processKliringSilangMitra(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/kontrol-kasir/kliring-massal", async (req, res) => {
  try {
    const { mitraIds } = req.body || {};
    const result = await TransactionService.processBatchKliringOtomatis(
      Array.isArray(mitraIds) ? mitraIds : void 0
    );
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/kontrol-kasir/gabung-mitra", async (req, res) => {
  try {
    const result = await TransactionService.mergeDuplicateMitra(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.post("/kontrol-kasir/cash-opname", async (req, res) => {
  try {
    const record = await TransactionService.recordCashOpname(req.body);
    res.json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});
apiRouter.get("/erp-snapshot", (_req, res) => {
  try {
    const db = dbManager.get();
    let modified = false;
    for (const kry of db.karyawan || []) {
      const idMitra = kry.idMitraTerkait || `MTR-${kry.id}`;
      const existing = db.mitra.find(
        (m) => m.id === idMitra || m.kode === kry.nik || m.role === "KARYAWAN" && m.nama.toLowerCase() === kry.nama.toLowerCase()
      );
      if (!existing) {
        db.mitra.push({
          id: idMitra,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: "KARYAWAN",
          telepon: kry.telepon || "-",
          alamat: kry.alamat || "-",
          status: kry.status || "AKTIF",
          catatan: `Karyawan: ${kry.jabatan || "Staff"} (Divisi ${kry.divisi || kry.departemen || "Gudang"})`
        });
        modified = true;
      } else if (existing.nama.endsWith(" (Karyawan)")) {
        existing.nama = kry.nama;
        modified = true;
      }
    }
    if (modified) {
      dbManager.save();
    }
    const outstandingBarangByMitra = /* @__PURE__ */ new Map();
    for (const p of db.penjualan || []) {
      if (p.metode === "KASBON" && p.statusPembayaran === "BELUM_BAYAR" && p.idMitra) {
        outstandingBarangByMitra.set(
          p.idMitra,
          (outstandingBarangByMitra.get(p.idMitra) || 0) + (p.sisaPiutang || 0)
        );
      }
    }
    const outstandingUangByMitra = /* @__PURE__ */ new Map();
    for (const ku of db.kasbonUang || []) {
      if (ku.status !== "LUNAS" && ku.idMitra) {
        outstandingUangByMitra.set(
          ku.idMitra,
          (outstandingUangByMitra.get(ku.idMitra) || 0) + (ku.sisaKasbon || 0)
        );
      }
    }
    const karyawanEnriched = (db.karyawan || []).map((k) => {
      const mitraId = k.idMitraTerkait || `MTR-${k.id}`;
      const outstandingBarang = outstandingBarangByMitra.get(mitraId) || 0;
      const outstandingUang = outstandingUangByMitra.get(mitraId) || 0;
      return {
        ...k,
        kasbonBarang: outstandingBarang,
        kasbonUang: outstandingUang,
        totalKasbonAktif: outstandingBarang + outstandingUang
      };
    });
    const savedKat = Array.isArray(db.kategoriProduk) ? db.kategoriProduk : [];
    const produkArr = Array.isArray(db.produk) ? db.produk : [];
    const katMap = /* @__PURE__ */ new Map();
    for (const k of savedKat) {
      const norm = normalizeKategoriName(k.nama);
      katMap.set(norm, {
        nama: norm,
        deskripsi: k.deskripsi || "",
        jumlahProduk: 0,
        isSaved: true
      });
    }
    for (const p of produkArr) {
      const norm = normalizeKategoriName(p.kategori);
      const cur = katMap.get(norm);
      if (cur) {
        cur.jumlahProduk += 1;
      } else {
        katMap.set(norm, {
          nama: norm,
          deskripsi: "",
          jumlahProduk: 1,
          isSaved: false
        });
      }
    }
    const kategoriProduk = Array.from(katMap.values()).sort((a, b) => {
      if (b.jumlahProduk !== a.jumlahProduk) return b.jumlahProduk - a.jumlahProduk;
      return a.nama.localeCompare(b.nama, "id");
    });
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      success: true,
      data: {
        dashboard: TransactionService.getDashboardStats(),
        rekening: db.rekening || [],
        mitra: db.mitra || [],
        karyawan: karyawanEnriched,
        upahHarian: db.upahHarian || [],
        produk: db.produk || [],
        kategoriProduk,
        stokBarang: db.stokBarang || [],
        stokHasilBumi: db.stokHasilBumi || [],
        penjualan: db.penjualan || [],
        pembelianHasilBumi: db.pembelianHasilBumi || [],
        penjualanHasilBumi: db.penjualanHasilBumi || [],
        pembelianBarang: db.pembelianBarang || [],
        pencairanTitipan: TransactionService.getPencairanTitipanList(),
        kasbonUang: db.kasbonUang || [],
        bayarBon: db.bayarBon || [],
        pengeluaran: TransactionService.getPengeluaranList(),
        transferRekening: db.transferRekening || [],
        penggajian: db.penggajian || [],
        auditLogs: db.auditLogs || [],
        profilPerusahaan: TransactionService.getProfilPerusahaan(),
        inventaris: db.inventaris || [],
        supabaseStatus: supabaseSyncEngine.getStatus()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/upload-bukti", async (req, res) => {
  try {
    const { dataUrl, prefix } = req.body || {};
    if (!dataUrl || typeof dataUrl !== "string") {
      return res.status(400).json({ success: false, message: "Data gambar wajib dikirim" });
    }
    if (/^https?:\/\//i.test(dataUrl)) {
      return res.json({
        success: true,
        data: { url: dataUrl, storage: "SUPABASE_STORAGE" }
      });
    }
    const cloudUrl = await supabaseSyncEngine.uploadBuktiImage(dataUrl, prefix || "nota");
    res.json({
      success: true,
      data: {
        url: cloudUrl || dataUrl,
        storage: cloudUrl ? "SUPABASE_STORAGE" : "INLINE_COMPRESSED"
      }
    });
  } catch (err) {
    res.json({
      success: true,
      data: {
        url: req.body?.dataUrl || "",
        storage: "INLINE_COMPRESSED"
      }
    });
  }
});
apiRouter.get("/bos-snapshot", (_req, res) => {
  try {
    const db = dbManager.get();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.json({
      success: true,
      data: {
        profilPerusahaan: TransactionService.getProfilPerusahaan(),
        rekening: db.rekening || [],
        stokBarang: db.stokBarang || [],
        stokHasilBumi: db.stokHasilBumi || [],
        inventaris: db.inventaris || [],
        supabaseStatus: supabaseSyncEngine.getStatus()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/access/status", (_req, res) => {
  try {
    const profil = TransactionService.getProfilPerusahaan();
    const pinBos = (process.env.PIN_BOS || profil?.pinBos || "888888").trim();
    const sup = supabaseSyncEngine.getStatus();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      data: {
        namaPerusahaan: profil?.namaPerusahaan || "PT. WIJAYA AGRO PERKASA",
        badanHukum: profil?.badanHukum || "PT (Perseroan Terbatas)",
        wajibPinPublik: profil?.wajibPinPublik !== false,
        pinLengthHint: pinBos.length,
        supabaseConfigured: sup.configured
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/access/verify-pin", async (req, res) => {
  try {
    const inputPin = String(req.body?.pin || "").trim();
    if (!inputPin) {
      return res.status(400).json({ success: false, message: "Masukkan sandi terlebih dahulu." });
    }
    if (!supabaseSyncEngine.isConfigured()) {
      const { reconnectBundle, supabaseUrl, supabaseKey } = req.body || {};
      const parsed = supabaseSyncEngine.parseReconnectBundle(reconnectBundle);
      if (parsed) {
        supabaseSyncEngine.updateConfig({
          url: parsed.url,
          key: parsed.key,
          autoSync: parsed.autoSync
        });
      } else if (supabaseUrl && supabaseKey) {
        supabaseSyncEngine.updateConfig({
          url: String(supabaseUrl),
          key: String(supabaseKey),
          autoSync: true
        });
      }
    }
    if (supabaseSyncEngine.isConfigured()) {
      await supabaseSyncEngine.ensureFreshCloudState(dbManager, 1500);
    }
    const profil = TransactionService.getProfilPerusahaan();
    const activePinBos = (process.env.PIN_BOS || profil?.pinBos || "888888").trim();
    const activePinKasir = (process.env.PIN_KASIR || profil?.pinKasir || "123456").trim();
    const sessionDurationMs = 60 * 60 * 1e3;
    if (inputPin === activePinBos) {
      return res.json({
        success: true,
        data: {
          role: "BOS",
          label: "Portal Eksekutif Pimpinan (Tampilan Bos)",
          sessionDurationMs,
          cloudReconnectBundle: supabaseSyncEngine.getReconnectBundle()
        }
      });
    }
    if (inputPin === activePinKasir) {
      return res.json({
        success: true,
        data: {
          role: "KASIR",
          label: "Operasional Admin & Kasir (Tampilan Admin)",
          sessionDurationMs,
          cloudReconnectBundle: supabaseSyncEngine.getReconnectBundle()
        }
      });
    }
    return res.status(401).json({
      success: false,
      message: "Sandi tidak sesuai. Masukkan Sandi Bos untuk Tampilan Bos atau Sandi Admin untuk Tampilan Admin."
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.get("/access/admin-config", (_req, res) => {
  try {
    const profil = TransactionService.getProfilPerusahaan();
    const sup = supabaseSyncEngine.getStatus();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      data: {
        pinBos: (profil?.pinBos || "888888").trim(),
        pinKasir: (profil?.pinKasir || "123456").trim(),
        wajibPinPublik: profil?.wajibPinPublik !== false,
        supabaseConfigured: sup.configured,
        supabaseUrl: sup.fullUrl || "",
        supabaseKeyPreview: sup.keyPreview || ""
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
apiRouter.post("/access/admin-config", async (req, res) => {
  try {
    const pinBos = String(req.body?.pinBos || "").replace(/\D/g, "").trim();
    const pinKasir = String(req.body?.pinKasir || "").replace(/\D/g, "").trim();
    const wajibPinPublik = req.body?.wajibPinPublik !== false;
    if (pinBos.length < 4 || pinBos.length > 8) {
      return res.status(400).json({ success: false, message: "PIN Bos wajib terdiri dari 4 hingga 8 angka." });
    }
    if (pinKasir.length < 4 || pinKasir.length > 8) {
      return res.status(400).json({ success: false, message: "PIN Kasir wajib terdiri dari 4 hingga 8 angka." });
    }
    if (pinBos === pinKasir) {
      return res.status(400).json({
        success: false,
        message: "PIN Bos dan PIN Kasir harus berbeda agar sistem otomatis mengarahkan tampilan Bos vs Kasir."
      });
    }
    await TransactionService.updateProfilPerusahaan({
      pinBos,
      pinKasir,
      wajibPinPublik
    });
    res.json({
      success: true,
      data: {
        pinBos,
        pinKasir,
        wajibPinPublik
      },
      message: "PIN Bos & PIN Kasir berhasil diperbarui dan tersinkron ke Cloud Supabase."
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// src/server/vercelApp.ts
var app = express();
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));
var sendHealth = (_req, res) => {
  res.json({
    status: "ok",
    app: "ERP Wijaya Agro",
    mode: "vercel-serverless",
    singleSource: supabaseSyncEngine.isConfigured() ? "SUPABASE_CLOUD" : "LOCAL_READY",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
};
app.get("/api/health", sendHealth);
app.get("/health", sendHealth);
app.use(async (_req, _res, next) => {
  try {
    await supabaseSyncEngine.ensureFreshCloudState(dbManager, 3500);
    next();
  } catch (err) {
    next(err);
  }
});
app.use("/api", apiRouter);
app.use("/", apiRouter);
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`
  });
});
app.use((err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const status = typeof err?.status === "number" ? err.status : 500;
  res.status(status).json({
    success: false,
    message: err?.message || "Terjadi kesalahan internal pada server API"
  });
});
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
