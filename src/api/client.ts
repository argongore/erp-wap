import {
  AuditLog,
  CatatanUpahHarian,
  DAFTAR_DIVISI,
  Karyawan,
  Mitra,
  NamaDivisi,
  PergerakanKeuanganDivisiSummary,
  Produk,
  Rekening,
  RekeningKoranMitraSummary,
  RekapMasterMitraSummary,
  RekapMitraItem,
  RekapKaryawanItem,
  RekapMasterKaryawanSummary,
  DetailHarianKaryawanResponse,
  ItemRekapPayrollBulanan,
  RekapPayrollBulananSummary,
  ItemRincianHarianPayroll,
  LabaRugiDivisiSummary,
  LabaRugiSummary,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
  RingkasanStokHasilBumiBulananResponse,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
  ProfilPerusahaan,
  TransaksiPengeluaran,
  TransaksiPencairanTitipan,
  UnifiedTransactionItem,
  RekapSemuaTransaksiResponse,
  SmartControlOverviewResponse,
  HasilKliringSilangResponse,
  CatatanCashOpname,
  DatabaseIntegrityStatus,
  ItemInventaris,
  ItemDivisi,
  KategoriInventaris,
  KondisiInventaris,
} from '../server/types.ts';

export interface KaryawanWithBon extends Karyawan {
  kasbonBarang: number;
  kasbonUang: number;
  totalKasbonAktif: number;
  totalUpahBelumDibayar?: number;
  totalHariBelumDibayar?: number;
  totalGajiSudahDibayar?: number;
  totalTitipHasilPanen?: number;
  saldoBersihTerpaduMitra?: number;
}

export interface DashboardStatsResponse {
  totalPenjualan: number;
  totalPenjualanHasilBumi?: number;
  totalTerjualHasilBumiKg?: number;
  totalPembelianHasilBumi: number;
  totalUangPerusahaan: number;
  saldoKas: number;
  saldoBank: number;
  totalBonOutstanding: number;
  totalTitipOutstanding: number;
  totalKasbonUangAktif: number;
  nilaiStokBarang: number;
  totalVolumeHasilBumiKg: number;
  stokMenipis: StokBarang[];
  recentTransactions: Array<{
    id: string;
    tanggal: string;
    jam: string;
    createdAt: string;
    kategori: string;
    label: string;
    nominal: number;
    pihakTerkait: string;
    rekening: string;
    status: string;
    fotoNota?: string;
  }>;
  rekeningList: Rekening[];
}

const CLOUD_RECONNECT_STORAGE_KEY = 'wap_cloud_reconnect_v1';
let inFlightAutoConnectPromise: Promise<boolean> | null = null;

function waitForBrowserOnline(maxWaitMs = 2200): Promise<void> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || navigator.onLine !== false) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener('online', finish);
      resolve();
    };
    window.addEventListener('online', finish, { once: true });
    setTimeout(finish, maxWaitMs);
  });
}

export function saveCloudReconnectBundle(bundle?: string | null, url?: string, key?: string) {
  if (typeof window === 'undefined') return;
  try {
    if (bundle && typeof bundle === 'string' && bundle.trim()) {
      localStorage.setItem(CLOUD_RECONNECT_STORAGE_KEY, bundle.trim());
    }
    if (url && url.trim()) {
      localStorage.setItem('wijaya_agro_supabase_url', url.trim());
    }
    if (key && key.trim()) {
      localStorage.setItem('wijaya_agro_supabase_key', key.trim());
    }
  } catch {}
}

export function readCloudReconnectPayload(): {
  bundle?: string;
  url?: string;
  key?: string;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const bundle = localStorage.getItem(CLOUD_RECONNECT_STORAGE_KEY) || '';
    const url = localStorage.getItem('wijaya_agro_supabase_url') || '';
    const key = localStorage.getItem('wijaya_agro_supabase_key') || '';
    if (!bundle && !(url && key)) {
      return null;
    }
    return {
      bundle: bundle || undefined,
      url: url || undefined,
      key: key || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resilient JSON HTTP client for ERP API routes.
 * Automatically waits briefly on Android/mobile network wake-up, retries gateway warmup / container wakeup
 * HTML responses (502/503/504 or <!doctype html>), and guarantees clean Indonesian error messages.
 */
export async function requestJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const maxAttempts = 4;
  const retryDelays = [650, 1300, 2200];

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...((init?.headers as Record<string, string>) || {}),
  };

  const isGet = !init?.method || init.method.toUpperCase() === 'GET';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      await waitForBrowserOnline(2000);
      res = await fetch(url, {
        ...init,
        cache: isGet ? 'no-store' : init?.cache,
        headers,
      });
    } catch (netErr: any) {
      if (attempt < maxAttempts - 1) {
        await waitForBrowserOnline(1500);
        await new Promise((r) => setTimeout(r, retryDelays[attempt] || 1500));
        continue;
      }
      throw new Error('Tidak dapat terhubung ke server aplikasi. Periksa koneksi internet Anda lalu coba lagi.');
    }

    const rawText = await res.text();
    const trimmed = rawText.trimStart();
    const looksLikeHtml =
      trimmed.toLowerCase().startsWith('<!doctype') ||
      trimmed.toLowerCase().startsWith('<html') ||
      (res.headers.get('content-type') || '').toLowerCase().includes('text/html');

    if (looksLikeHtml || res.status === 502 || res.status === 503 || res.status === 504) {
      // Do not retry auth/forbidden HTML pages; guide user to refresh session immediately
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          'Sesi otorisasi halaman telah kedaluwarsa. Silakan muat ulang (Refresh) halaman browser Anda lalu coba kembali.'
        );
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, retryDelays[attempt] || 1500));
        continue;
      }

      throw new Error(
        'Server aplikasi baru saja dimuat ulang atau halaman belum sinkron dengan versi terbaru. Silakan muat ulang (Refresh) halaman browser Anda lalu coba kembali.'
      );
    }

    if (!trimmed) {
      if (!res.ok) {
        throw new Error(`Permintaan gagal diproses oleh server (HTTP ${res.status}).`);
      }
      return {} as T;
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new Error(
        res.ok
          ? 'Format respons dari server tidak valid. Silakan muat ulang halaman dan coba lagi.'
          : `Permintaan gagal diproses (HTTP ${res.status}): ${trimmed.slice(0, 120)}`
      );
    }
  }

  throw new Error('Gagal memproses permintaan ke server.');
}

export const api = {
  // Master Rekening
  getRekening: async (): Promise<Rekening[]> => {
    const data = await requestJson('/api/rekening');
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekening');
    return data.data;
  },

  createRekening: async (payload: Partial<Rekening>): Promise<Rekening> => {
    const data = await requestJson('/api/rekening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal membuat rekening');
    return data.data;
  },

  updateRekening: async (
    kode: string,
    payload: Partial<Rekening> & { saldoSaatIni?: number; saldoAwal?: number; alasanPenyesuaian?: string }
  ): Promise<Rekening> => {
    const data = await requestJson('/api/rekening/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, kode }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui rekening');
    return data.data;
  },

  updateSaldoRekening: async (
    kode: string,
    saldoBaru: number,
    updateSaldoAwal: boolean = false,
    alasan?: string,
    saldoAwalBaru?: number
  ): Promise<Rekening> => {
    const data = await requestJson('/api/rekening/update-saldo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kode, saldoBaru, updateSaldoAwal, alasan, saldoAwalBaru }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui saldo rekening');
    return data.data;
  },

  // Master Mitra
  getMitra: async (): Promise<Mitra[]> => {
    const data = await requestJson('/api/mitra');
    if (!data.success) throw new Error(data.message || 'Gagal memuat mitra');
    return data.data;
  },

  getRekapMitra: async (): Promise<RekapMasterMitraSummary> => {
    const data = await requestJson('/api/mitra/rekap');
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekap saldo mitra');
    return data.data;
  },

  createMitra: async (payload: Partial<Mitra>): Promise<Mitra> => {
    const data = await requestJson('/api/mitra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambah mitra');
    return data.data;
  },

  updateMitra: async (id: string, payload: Partial<Mitra>): Promise<Mitra> => {
    const data = await requestJson(`/api/mitra/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui mitra');
    return data.data;
  },

  resetSaldoMitra: async (
    idMitra: string
  ): Promise<{ idMitra: string; namaMitra: string; message: string }> => {
    const data = await requestJson('/api/mitra/reset-saldo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idMitra }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal mengosongkan saldo mitra');
    return data.data;
  },

  deleteMitra: async (
    idMitra: string
  ): Promise<{ deletedId: string; deletedNama: string; message: string }> => {
    const data = await requestJson('/api/mitra/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idMitra }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menghapus data mitra');
    return data.data;
  },

  resetSemuaSaldoSistem: async (
    hanyaMitra: boolean = false
  ): Promise<{ hanyaMitra: boolean; totalMitra: number; totalRekening: number; message: string }> => {
    const data = await requestJson('/api/mitra/reset-semua-saldo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hanyaMitra }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal mengosongkan nominal saldo sistem');
    return data.data;
  },

  setStatusNotaNgunci: async (payload: {
    idMitra: string;
    idNota?: string;
    isNotaNgunci: boolean;
    catatanNgunci?: string;
  }): Promise<{
    idMitra: string;
    namaMitra: string;
    idNota?: string;
    isNotaNgunci: boolean;
    affectedCount: number;
    affectedNominal: number;
    message: string;
  }> => {
    const data = await requestJson('/api/mitra/status-nota-ngunci', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui status Nota Ngunci');
    return data.data;
  },

  // Master Produk, Kategori Kustom & Stok
  getKategoriProduk: async (): Promise<
    Array<{ nama: string; deskripsi: string; jumlahProduk: number; isSaved: boolean }>
  > => {
    const data = await requestJson('/api/kategori-produk');
    if (!data.success) throw new Error(data.message || 'Gagal memuat daftar kategori produk');
    return data.data;
  },

  createKategoriProduk: async (payload: { nama: string; deskripsi?: string }): Promise<any> => {
    const data = await requestJson('/api/kategori-produk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambahkan kategori baru');
    return data.data;
  },

  renameKategoriProduk: async (payload: {
    kategoriLama: string;
    kategoriBaru: string;
    deskripsi?: string;
  }): Promise<{ kategoriLama: string; kategoriBaru: string; affectedCount: number }> => {
    const data = await requestJson('/api/kategori-produk/rename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal mengubah nama kategori');
    return data.data;
  },

  deleteKategoriProduk: async (payload: {
    nama: string;
    kategoriPengganti?: string;
  }): Promise<{ deleted: string; movedCount: number }> => {
    const data = await requestJson('/api/kategori-produk/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menghapus kategori');
    return data.data;
  },

  bulkUpdateKategoriProduk: async (payload: {
    kodeProdukList: string[];
    kategoriBaru: string;
    deskripsiKategori?: string;
  }): Promise<{ kategoriBaru: string; updatedCount: number }> => {
    const data = await requestJson('/api/produk/bulk-kategori', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui kategori produk secara massal');
    return data.data;
  },

  getProduk: async (): Promise<Produk[]> => {
    const data = await requestJson('/api/produk');
    if (!data.success) throw new Error(data.message || 'Gagal memuat produk');
    return data.data;
  },

  createProduk: async (payload: any): Promise<any> => {
    const data = await requestJson('/api/produk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambah produk');
    return data.data;
  },

  updateProduk: async (kode: string, payload: Partial<Produk> & { minimum?: number }): Promise<any> => {
    const data = await requestJson(`/api/produk/${encodeURIComponent(kode)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui produk & harga');
    return data.data;
  },

  getStok: async (): Promise<StokBarang[]> => {
    const data = await requestJson('/api/stok');
    if (!data.success) throw new Error(data.message || 'Gagal memuat stok');
    return data.data;
  },

  adjustStok: async (payload: { kode: string; penyesuaianQty: number; alasan: string }): Promise<StokBarang> => {
    const data = await requestJson('/api/stok/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyesuaikan stok');
    return data.data;
  },

  getStokHasilBumi: async (): Promise<StokHasilBumi[]> => {
    const data = await requestJson('/api/stok-hasil-bumi');
    if (!data.success) throw new Error(data.message || 'Gagal memuat stok hasil bumi');
    return data.data;
  },

  createKomoditasHasilBumi: async (payload: {
    kode?: string;
    nama: string;
    satuan?: string;
    hargaBeliStandar?: number;
    isBelumPutusHarga?: boolean;
  }): Promise<StokHasilBumi> => {
    const data = await requestJson('/api/stok-hasil-bumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambah komoditas hasil bumi');
    return data.data;
  },

  updateHargaHasilBumi: async (kode: string, hargaBeliStandar: number): Promise<StokHasilBumi> => {
    const data = await requestJson(`/api/stok-hasil-bumi/${encodeURIComponent(kode)}/harga`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hargaBeliStandar }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui harga standar hasil bumi');
    return data.data;
  },

  updateSaldoAwalHasilBumi: async (payload: {
    kode?: string;
    stokAwal?: number;
    rataRataModalAwal?: number;
    modalAwalTotal?: number;
    keterangan?: string;
    items?: Array<{
      kode: string;
      stokAwal: number;
      rataRataModalAwal: number;
      modalAwalTotal?: number;
      keterangan?: string;
    }>;
  }): Promise<StokHasilBumi[]> => {
    const data = await requestJson('/api/stok-hasil-bumi/saldo-awal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan saldo awal hasil bumi');
    return data.data;
  },

  // Transaksi Kasir
  processPenjualan: async (payload: {
    idMitra?: string;
    namaPembeliManual?: string;
    tipePembeli?: 'UMUM' | 'REKANAN';
    divisi?: string;
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON' | 'INTERNAL_PT';
    rekeningTujuan?: string;
    items: Array<{ kodeProduk: string; qty: number; harga?: number; hargaSugesti?: number }>;
    keterangan?: string;
  }): Promise<TransaksiPenjualan> => {
    const data = await requestJson('/api/transaksi/penjualan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses transaksi penjualan');
    return data.data;
  },

  getPenjualan: async (): Promise<TransaksiPenjualan[]> => {
    const data = await requestJson('/api/transaksi/penjualan');
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Pembelian Barang Dagang (Distributor & Pemasok)
  processPembelianBarang: async (payload: {
    idMitra?: string;
    namaDistributorManual?: string;
    noFakturSupplier?: string;
    fotoNota?: string;
    isRekapanGlobal?: boolean;
    judulRekapan?: string;
    totalNominalRekapan?: number;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'HUTANG';
    rekeningSumber?: string;
    items?: Array<{
      kodeProduk: string;
      qty: number;
      hargaBeliSatuan: number;
      sesuaikanHargaJual?: number;
      sesuaikanHargaRekanan?: number;
    }>;
    keterangan?: string;
  }): Promise<TransaksiPembelianBarang> => {
    const data = await requestJson('/api/transaksi/pembelian-barang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses pembelian barang');
    return data.data;
  },

  getPembelianBarang: async (): Promise<TransaksiPembelianBarang[]> => {
    const data = await requestJson('/api/transaksi/pembelian-barang');
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  deletePembelianBarang: async (noPembelian: string): Promise<{ deleted: TransaksiPembelianBarang }> => {
    const data = await requestJson(`/api/transaksi/pembelian-barang/${encodeURIComponent(noPembelian)}`, {
      method: 'DELETE',
    });
    if (!data.success) throw new Error(data.message || 'Gagal membatalkan transaksi pembelian');
    return data.data;
  },

  // Laba Rugi Per Divisi & Produk
  getLabaRugiDivisi: async (): Promise<LabaRugiDivisiSummary> => {
    const data = await requestJson('/api/laporan/laba-rugi-divisi');
    if (!data.success) throw new Error(data.message || 'Gagal memuat laporan laba rugi divisi');
    return data.data;
  },

  getLabaRugiProduk: async (): Promise<LabaRugiSummary> => {
    const data = await requestJson('/api/laporan/laba-rugi-produk');
    if (!data.success) throw new Error(data.message || 'Gagal memuat laporan laba rugi');
    return data.data;
  },

  processPembelianHasilBumi: async (payload: {
    idMitra?: string;
    namaPetaniManual?: string;
    teleponPetaniManual?: string;
    alamatPetaniManual?: string;
    komoditasKode?: string;
    namaKomoditasBaru?: string;
    beratKotor: number;
    potonganRafaksi: number;
    hargaPerKg: number;
    isBelumPutusHarga?: boolean;
    fotoNota?: string;
    isNotaLalu?: boolean;
    noNotaLalu?: string;
    tanggalNotaLalu?: string;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> => {
    const data = await requestJson('/api/transaksi/pembelian-hasil-bumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses pembelian hasil bumi');
    return data.data;
  },

  getPembelianHasilBumi: async (): Promise<TransaksiPembelianHasilBumi[]> => {
    const data = await requestJson('/api/transaksi/pembelian-hasil-bumi');
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  putusHargaHasilBumi: async (payload: {
    noPembelian: string;
    hargaDealPerKg: number;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> => {
    const data = await requestJson('/api/transaksi/pembelian-hasil-bumi/putus-harga', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses putus harga');
    return data.data;
  },

  // Penjualan / Pengiriman Hasil Bumi Keluar Gudang & Ringkasan Bulanan
  getPenjualanHasilBumi: async (): Promise<TransaksiPenjualanHasilBumi[]> => {
    const data = await requestJson('/api/transaksi/penjualan-hasil-bumi');
    if (!data.success) throw new Error(data.message || 'Gagal memuat riwayat penjualan hasil bumi');
    return data.data;
  },

  processPenjualanHasilBumi: async (payload: {
    idMitra?: string;
    namaPembeliManual?: string;
    komoditasKode: string;
    beratKotor: number;
    potonganRafaksi?: number;
    hargaJualPerKg: number;
    divisi?: string;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'PIUTANG';
    rekeningTujuan?: string;
    noSuratJalan?: string;
    tanggal?: string;
    keterangan?: string;
  }): Promise<TransaksiPenjualanHasilBumi> => {
    const data = await requestJson('/api/transaksi/penjualan-hasil-bumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal mencatat penjualan hasil bumi');
    return data.data;
  },

  deletePenjualanHasilBumi: async (
    noPenjualan: string
  ): Promise<{ deleted: TransaksiPenjualanHasilBumi }> => {
    const data = await requestJson(
      `/api/transaksi/penjualan-hasil-bumi/${encodeURIComponent(noPenjualan)}`,
      { method: 'DELETE' }
    );
    if (!data.success) throw new Error(data.message || 'Gagal membatalkan penjualan hasil bumi');
    return data.data;
  },

  getRingkasanHasilBumiBulanan: async (params?: {
    bulan?: number;
    tahun?: number;
    kodeKomoditas?: string;
  }): Promise<RingkasanStokHasilBumiBulananResponse> => {
    const qs = new URLSearchParams();
    if (params?.bulan) qs.set('bulan', String(params.bulan));
    if (params?.tahun) qs.set('tahun', String(params.tahun));
    if (params?.kodeKomoditas) qs.set('kodeKomoditas', params.kodeKomoditas);
    const queryStr = qs.toString() ? `?${qs.toString()}` : '';
    const data = await requestJson(`/api/laporan/ringkasan-hasil-bumi-bulanan${queryStr}`);
    if (!data.success) throw new Error(data.message || 'Gagal memuat ringkasan bulanan stok hasil bumi');
    return data.data;
  },

  resetCleanDatabase: async (): Promise<{ message: string }> => {
    const data = await requestJson('/api/database/reset-clean', {
      method: 'POST',
    });
    if (!data.success) throw new Error(data.message || 'Gagal mereset database');
    return data;
  },

  // Kasbon Uang (Fitur C)
  processKasbonUang: async (payload: {
    idMitra: string;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string;
    nominal: number;
    keterangan?: string;
    fotoNota?: string;
  }): Promise<TransaksiKasbonUang> => {
    const data = await requestJson('/api/transaksi/kasbon-uang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses kasbon uang');
    return data.data;
  },

  // Input Saldo Awal / Nota Lalu Mitra (Piutang Barang Masa Lalu & Titipan Uang)
  processInputNotaLalu: async (payload: {
    idMitra: string;
    tipe: 'PIUTANG_BARANG_NOTA_LALU' | 'TITIP_UANG_NOTA_LALU';
    nominal: number;
    tanggalNotaLalu: string;
    noNotaLalu?: string;
    rincianBarang?: string;
    fotoNota?: string;
    driveFileUrl?: string;
    driveFileId?: string;
    driveFolderPath?: string;
    keterangan?: string;
    isNotaNgunci?: boolean;
    catatanNgunci?: string;
  }): Promise<{ record: any; tipe: string; mitraNama: string; nominal: number; isNotaNgunci?: boolean }> => {
    const data = await requestJson('/api/transaksi/nota-lalu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses input nota lalu');
    return data.data;
  },

  // Pinjam Uang dari PT ke Mitra (Masuk Saldo Titip Mitra)
  processPinjamanUangDariMitra: async (payload: {
    idMitra: string;
    nominal: number;
    rekeningTujuan: string;
    tanggal?: string;
    noReferensi?: string;
    keterangan?: string;
    fotoNota?: string;
    fotoNotaList?: string[];
  }): Promise<{ record: any; mitraNama: string; nominal: number; rekeningNama: string }> => {
    const data = await requestJson('/api/mitra/pinjam-uang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses pinjaman uang');
    return data.data;
  },

  // Daftar Bukti Nota Lalu (dengan opsi filter nama & waktu)
  getDaftarBuktiNotaLalu: async (params?: {
    idMitra?: string;
    waktuFilter?: string;
    beforeDate?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    hanyaNotaLalu?: boolean;
  }): Promise<{
    items: Array<{
      id: string;
      tabel: 'kasbonUang' | 'pembelianHasilBumi';
      tipe: 'PIUTANG_NOTA_LALU' | 'TITIP_NOTA_LALU' | 'KASBON_FOTO' | 'TITIP_FOTO';
      tipeLabel: string;
      idMitra: string;
      namaMitra: string;
      tanggal: string;
      jam?: string;
      noNota: string;
      nominal: number;
      keterangan: string;
      rincianBarang?: string;
      hasFoto: boolean;
      fotoNota: string;
      fotoNotaCount: number;
      driveFileUrl?: string;
      isNotaLalu: boolean;
      createdAt?: string;
    }>;
    summary: {
      totalItems: number;
      totalPiutangNotaLalu: number;
      totalTitipNotaLalu: number;
      totalFotoBukti: number;
      daftarMitraTerkait: Array<{ id: string; nama: string; count: number }>;
    };
  }> => {
    const q = new URLSearchParams();
    if (params?.idMitra) q.set('idMitra', params.idMitra);
    if (params?.waktuFilter) q.set('waktuFilter', params.waktuFilter);
    if (params?.beforeDate) q.set('beforeDate', params.beforeDate);
    if (params?.startDate) q.set('startDate', params.startDate);
    if (params?.endDate) q.set('endDate', params.endDate);
    if (params?.search) q.set('search', params.search);
    if (params?.hanyaNotaLalu !== undefined) q.set('hanyaNotaLalu', String(params.hanyaNotaLalu));

    const data = await requestJson(`/api/transaksi/bukti-nota-lalu?${q.toString()}`);
    if (!data.success) throw new Error(data.message || 'Gagal mengambil daftar bukti nota');
    return data.data;
  },

  // Bersihkan Bukti Nota Lalu (Hapus Transaksi & Update Rekening Koran Mitra)
  bersihkanBuktiNotaLalu: async (payload: {
    targetIds?: string[];
    idMitra?: string;
    waktuFilter?: 'ALL' | 'BEFORE_DATE' | 'RANGE' | 'TODAY' | 'THIS_MONTH';
    beforeDate?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    hanyaNotaLalu?: boolean;
    modeHapus?: 'HAPUS_TRANSAKSI' | 'HANYA_HAPUS_FOTO';
    user?: string;
  }): Promise<{
    success: boolean;
    countDeleted: number;
    affectedMitraIds: string[];
    affectedMitraNames: string[];
    totalNominalPiutang: number;
    totalNominalTitip: number;
    message: string;
  }> => {
    const data = await requestJson('/api/transaksi/bersihkan-bukti-nota-lalu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal membersihkan bukti nota lalu');
    return data;
  },

  // Supabase Auto-Sync & Cloud Storage
  getSupabaseStatus: async (): Promise<{
    configured: boolean;
    url: string;
    fullUrl: string;
    hasKey: boolean;
    keyPreview: string;
    autoSync: boolean;
    lastSyncTime: string | null;
    lastSyncStatus: 'SUCCESS' | 'ERROR' | null;
    lastSyncMessage: string | null;
  }> => {
    const data = await requestJson('/api/supabase/status');
    if (!data.success) throw new Error(data.message || 'Gagal mengambil status Supabase');
    return data.data;
  },

  updateSupabaseConfig: async (payload: { url: string; key: string; autoSync?: boolean }) => {
    const data = await requestJson('/api/supabase/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan konfigurasi Supabase');
    saveCloudReconnectBundle(data.cloudReconnectBundle, payload.url, payload.key);
    return data;
  },

  autoConnectCloudDatabase: async (): Promise<{
    reconnected: boolean;
    configured: boolean;
    status?: {
      configured: boolean;
      url?: string;
      lastSyncTime?: string | null;
    };
  }> => {
    if (inFlightAutoConnectPromise) {
      const ok = await inFlightAutoConnectPromise;
      return { reconnected: ok, configured: ok };
    }

    let latestStatus: any = undefined;
    inFlightAutoConnectPromise = (async () => {
      try {
        const cached = readCloudReconnectPayload();
        const res = await requestJson('/api/supabase/auto-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cached || {}),
        });
        latestStatus = res?.data;
        return Boolean(res?.configured || res?.data?.configured);
      } catch {
        return false;
      } finally {
        inFlightAutoConnectPromise = null;
      }
    })();

    const configured = await inFlightAutoConnectPromise;
    return {
      reconnected: configured,
      configured,
      status: latestStatus,
    };
  },

  testSupabaseConnection: async () => {
    const data = await requestJson('/api/supabase/test', { method: 'POST' });
    return data;
  },

  pushToSupabase: async () => {
    const data = await requestJson('/api/supabase/sync-push', { method: 'POST' });
    if (!data.success) throw new Error(data.message || 'Gagal sinkron data ke Supabase');
    return data;
  },

  pullFromSupabase: async () => {
    const data = await requestJson('/api/supabase/sync-pull', { method: 'POST' });
    if (!data.success) throw new Error(data.message || 'Gagal menarik data dari Supabase');
    return data;
  },

  getSupabaseSqlSchema: async (): Promise<string> => {
    const data = await requestJson('/api/supabase/sql-schema');
    if (!data.success) throw new Error(data.message || 'Gagal mengambil skrip SQL Supabase');
    return data.data;
  },

  getDatabaseIntegrityStatus: async (): Promise<DatabaseIntegrityStatus> => {
    const data = await requestJson('/api/database/integrity-status');
    if (!data.success) throw new Error(data.message || 'Gagal memeriksa status integrasi database');
    return data.data;
  },

  getKasbonUang: async (): Promise<TransaksiKasbonUang[]> => {
    const data = await requestJson('/api/transaksi/kasbon-uang');
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Bayar Bon (Fitur D)
  processBayarBon: async (payload: {
    idMitra: string;
    nominalBayar: number;
    metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
    rekeningTujuan?: string;
    keterangan?: string;
    idNotaTarget?: string;
  }): Promise<TransaksiBayarBon> => {
    const data = await requestJson('/api/transaksi/bayar-bon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses pembayaran bon');
    return data.data;
  },

  getBayarBon: async (): Promise<TransaksiBayarBon[]> => {
    const data = await requestJson('/api/transaksi/bayar-bon');
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Transfer Antar Rekening (Fitur E)
  processTransferRekening: async (payload: {
    rekeningSumber: string;
    rekeningTujuan: string;
    nominal: number;
    keterangan: string;
  }): Promise<TransaksiTransferRekening> => {
    const data = await requestJson('/api/transaksi/transfer-rekening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses transfer antar rekening');
    return data.data;
  },

  getTransferRekening: async (): Promise<TransaksiTransferRekening[]> => {
    const data = await requestJson('/api/transaksi/transfer-rekening');
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Rekening Koran Mitra & Dashboard
  getRekeningKoranMitra: async (idMitra: string): Promise<RekeningKoranMitraSummary> => {
    const data = await requestJson(`/api/rekening-koran-mitra/${encodeURIComponent(idMitra)}`);
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekening koran mitra');
    return data.data;
  },

  getDashboard: async (): Promise<DashboardStatsResponse> => {
    const data = await requestJson('/api/dashboard');
    if (!data.success) throw new Error(data.message || 'Gagal memuat dashboard');
    return data.data;
  },

  getRekapHarianKas: async (tanggal?: string): Promise<{
    tanggal: string;
    totalUangMasuk: number;
    rincianMasuk: {
      penjualanToko: number;
      bayarBon: number;
      droppingMasuk: number;
      jumlahTransaksi: number;
    };
    totalUangKeluar: number;
    rincianKeluar: {
      pengeluaranDivisi: number;
      beliHasilBumi: number;
      kasbonUang: number;
      kulakanBarang: number;
      pencairanTitipan: number;
      upahGaji: number;
      jumlahTransaksi: number;
    };
    arusKasBersih: number;
    saldoKasFisik: number;
    saldoTotalBank: number;
    totalSaldoRil: number;
    rekapDivisiHariIni: Array<{
      divisi: string;
      total: number;
      count: number;
    }>;
  }> => {
    const url = tanggal
      ? `/api/laporan/arus-kas-harian?tanggal=${encodeURIComponent(tanggal)}`
      : '/api/laporan/arus-kas-harian';
    const data = await requestJson(url);
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekap arus kas harian');
    return data.data;
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    const data = await requestJson('/api/audit-logs');
    if (!data.success) throw new Error(data.message || 'Gagal memuat audit log');
    return data.data;
  },

  // Master Karyawan
  getKaryawan: async (): Promise<KaryawanWithBon[]> => {
    const data = await requestJson('/api/karyawan');
    if (!data.success) throw new Error(data.message || 'Gagal memuat data karyawan');
    return data.data;
  },

  getRekapKaryawan: async (): Promise<RekapMasterKaryawanSummary> => {
    const data = await requestJson('/api/karyawan/rekap');
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekap saldo karyawan');
    return data.data;
  },

  getUpahHarianList: async (): Promise<CatatanUpahHarian[]> => {
    const data = await requestJson('/api/karyawan/upah-harian');
    if (!data.success) throw new Error(data.message || 'Gagal memuat riwayat upah harian');
    return data.data;
  },

  recordKerjaHarian: async (payload: {
    idKaryawan: string;
    tanggalKerja?: string;
    hariTanggal?: string;
    divisi: NamaDivisi;
    divisiKode?: string;
    item?: string;
    kuantiti?: number;
    harga?: number;
    jumlah?: number;
    ket?: 'BON' | 'LUNAS';
    catatan?: string;
    tugasPekerjaan: string;
    upahHarian: number;
    uangMakanLembur?: number;
    modeBayar: 'CATAT_HAK_UPAH' | 'LANGSUNG_CAIR';
    rekeningSumber?: string;
    persentasePotongKasbon?: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
  }): Promise<{ catatan: CatatanUpahHarian; slipGaji?: TransaksiPenggajian }> => {
    const data = await requestJson('/api/karyawan/kerja-harian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan input kerja harian');
    return data.data;
  },

  getDetailHarianKaryawan: async (id: string): Promise<DetailHarianKaryawanResponse> => {
    const data = await requestJson(`/api/karyawan/${encodeURIComponent(id)}/detail-harian`);
    if (!data.success) throw new Error(data.message || 'Gagal memuat detail harian karyawan');
    return data.data;
  },

  settleHakUpahKaryawan: async (
    id: string,
    payload: {
      divisi?: NamaDivisi;
      tipeGaji?: 'HARIAN' | 'BULANAN';
      periodeBulan?: string;
      upahHarianIds?: string[];
      gajiPokokTambahan?: number;
      tunjangan?: number;
      bonus?: number;
      rekeningSumber?: string;
      persentasePotongKasbon?: number;
      nominalPotongKustom?: number;
      metodePembayaran?: 'TUNAI' | 'TRANSFER';
      keterangan?: string;
    }
  ): Promise<TransaksiPenggajian> => {
    const data = await requestJson(`/api/karyawan/${encodeURIComponent(id)}/settle-gaji`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal mencairkan hak upah karyawan');
    return data.data;
  },

  createKaryawan: async (payload: Partial<Karyawan>): Promise<Karyawan> => {
    const data = await requestJson('/api/karyawan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambah karyawan');
    return data.data;
  },

  updateKaryawan: async (
    id: string,
    payload: Partial<Karyawan> & {
      catatanMutasiDivisi?: string;
      tanggalEfektifMutasi?: string;
      periodeBulanMutasi?: string;
    }
  ): Promise<Karyawan> => {
    const data = await requestJson('/api/karyawan/update-profil', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, id }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui profil karyawan');
    return data.data;
  },

  toggleKaryawanStatus: async (id: string): Promise<Karyawan> => {
    const data = await requestJson(`/api/karyawan/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!data.success) throw new Error(data.message || 'Gagal mengubah status karyawan');
    return data.data;
  },

  deleteKaryawanPermanent: async (id: string): Promise<boolean> => {
    const data = await requestJson(`/api/karyawan/${encodeURIComponent(id)}/permanent`, {
      method: 'DELETE',
    });
    if (!data.success) throw new Error(data.message || 'Gagal menghapus data karyawan');
    return data.data;
  },

  // Penggajian & Potong Bon
  processPenggajian: async (payload: {
    idKaryawan: string;
    divisi?: NamaDivisi;
    tipeGaji?: 'HARIAN' | 'BULANAN';
    tanggalKerja?: string;
    periodeBulan?: string;
    gajiNominal?: number;
    tunjanganNominal?: number;
    bonus?: number;
    lunasiUpahHarianPending?: boolean;
    upahHarianIds?: string[];
    persentasePotongKasbon: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPenggajian> => {
    const data = await requestJson('/api/transaksi/penggajian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses penggajian');
    return data.data;
  },

  processBatchPenggajianHarian: async (payload: {
    tanggalKerja: string;
    items: Array<{
      idKaryawan: string;
      divisi: NamaDivisi;
      gajiNominal: number;
      bonus?: number;
      persentasePotongKasbon?: number;
      nominalPotongKustom?: number;
      rekeningSumber?: string;
      keterangan?: string;
    }>;
  }): Promise<TransaksiPenggajian[]> => {
    const data = await requestJson('/api/transaksi/penggajian/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses batch penggajian');
    return data.data;
  },

  getPenggajian: async (): Promise<TransaksiPenggajian[]> => {
    const data = await requestJson('/api/transaksi/penggajian');
    if (!data.success) throw new Error(data.message || 'Gagal memuat riwayat penggajian');
    return data.data;
  },

  getUpahHarian: async (params?: {
    idKaryawan?: string;
    divisi?: string;
    bulan?: number;
    tahun?: number;
  }): Promise<CatatanUpahHarian[]> => {
    const searchParams = new URLSearchParams();
    if (params?.idKaryawan) searchParams.append('idKaryawan', params.idKaryawan);
    if (params?.divisi) searchParams.append('divisi', params.divisi);
    if (params?.bulan) searchParams.append('bulan', String(params.bulan));
    if (params?.tahun) searchParams.append('tahun', String(params.tahun));
    const url = `/api/transaksi/upah-harian${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const data = await requestJson(url);
    if (!data.success) throw new Error(data.message || 'Gagal memuat catatan upah harian');
    return data.data;
  },

  getRekapPayrollBulanan: async (params?: {
    bulan?: number;
    tahun?: number;
    divisi?: string;
  }): Promise<RekapPayrollBulananSummary> => {
    const searchParams = new URLSearchParams();
    if (params?.bulan) searchParams.append('bulan', String(params.bulan));
    if (params?.tahun) searchParams.append('tahun', String(params.tahun));
    if (params?.divisi) searchParams.append('divisi', params.divisi);
    const url = `/api/payroll/rekap-bulanan${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const data = await requestJson(url);
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekapitulasi payroll bulanan');
    return data.data;
  },

  // Divisi & Keuangan
  getDivisi: async (): Promise<ItemDivisi[]> => {
    const data = await requestJson('/api/divisi');
    if (!data.success) throw new Error(data.message || 'Gagal memuat daftar divisi');
    return data.data;
  },

  createDivisi: async (payload: {
    nama: string;
    deskripsi?: string;
    penanggungJawab?: string;
    logoUrl?: string;
  }): Promise<ItemDivisi> => {
    const data = await requestJson('/api/divisi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambahkan divisi baru');
    return data.data;
  },

  updateDivisiProfil: async (payload: {
    idOrNama: string;
    penanggungJawab?: string;
    deskripsi?: string;
    logoUrl?: string;
  }): Promise<ItemDivisi> => {
    const data = await requestJson('/api/divisi/profil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui profil & logo divisi');
    return data.data;
  },

  resetSystemData: async (): Promise<{ success: boolean; message: string }> => {
    const data = await requestJson('/api/system/reset-data', { method: 'POST' });
    if (!data.success) throw new Error(data.message || 'Gagal mengosongkan data sistem');
    return data;
  },

  getDivisiKeuangan: async (): Promise<PergerakanKeuanganDivisiSummary[]> => {
    const data = await requestJson('/api/divisi/keuangan');
    if (!data.success) throw new Error(data.message || 'Gagal memuat pergerakan keuangan divisi');
    return data.data;
  },

  // Billboard & Big-Screen Command Center
  getBillboardData: async (): Promise<BillboardData> => {
    const data = await requestJson('/api/billboard');
    if (!data.success) throw new Error(data.message || 'Gagal memuat data billboard command center');
    return data.data;
  },

  // Profil Perusahaan
  getProfilPerusahaan: async (): Promise<ProfilPerusahaan> => {
    const data = await requestJson('/api/profil-perusahaan');
    if (!data.success) throw new Error(data.message || 'Gagal memuat profil perusahaan');
    return data.data;
  },

  updateProfilPerusahaan: async (payload: Partial<ProfilPerusahaan>): Promise<ProfilPerusahaan> => {
    const data = await requestJson('/api/profil-perusahaan', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui profil perusahaan');
    return data.data;
  },

  // Pengeluaran & Biaya Operasional Divisi
  getPengeluaran: async (): Promise<TransaksiPengeluaran[]> => {
    const data = await requestJson('/api/pengeluaran');
    if (!data.success) throw new Error(data.message || 'Gagal memuat catatan pengeluaran');
    return data.data;
  },

  createPengeluaran: async (payload: {
    divisi: string;
    kategori: string;
    keterangan: string;
    nominal: number;
    rekeningSumber: string;
    penerima?: string;
    idInventaris?: string;
    tanggal?: string;
    fotoKuitansi?: string;
  }): Promise<TransaksiPengeluaran> => {
    const data = await requestJson('/api/pengeluaran', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan pengeluaran');
    return data.data;
  },

  deletePengeluaran: async (id: string): Promise<void> => {
    const data = await requestJson(`/api/pengeluaran/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!data.success) throw new Error(data.message || 'Gagal membatalkan pengeluaran');
  },

  // Master Inventaris & Armada PT
  getInventaris: async (): Promise<ItemInventaris[]> => {
    const data = await requestJson('/api/inventaris');
    if (!data.success) throw new Error(data.message || 'Gagal memuat daftar inventaris PT');
    return data.data;
  },

  createInventaris: async (payload: {
    kode?: string;
    namaItem: string;
    kategori?: KategoriInventaris;
    nomorPlat?: string;
    merkTipe?: string;
    tahunKeluaran?: string;
    warna?: string;
    nomorRangka?: string;
    nomorMesin?: string;
    driverPenanggungJawab?: string;
    idKaryawanDriver?: string;
    teleponDriver?: string;
    divisi?: string;
    tanggalPajakTahunan?: string;
    tanggalPajakLimaTahunan?: string;
    tanggalKir?: string;
    kondisi?: KondisiInventaris;
    nilaiPerolehan?: number;
    tanggalBeli?: string;
    fotoItem?: string;
    fotoStnk?: string;
    catatan?: string;
  }): Promise<ItemInventaris> => {
    const data = await requestJson('/api/inventaris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menambah item inventaris');
    return data.data;
  },

  updateInventaris: async (
    id: string,
    payload: Partial<ItemInventaris>
  ): Promise<ItemInventaris> => {
    const data = await requestJson(`/api/inventaris/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui profil inventaris');
    return data.data;
  },

  deleteInventaris: async (id: string): Promise<void> => {
    const data = await requestJson(`/api/inventaris/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!data.success) throw new Error(data.message || 'Gagal menghapus item inventaris');
  },

  // Pencairan Titipan Hasil Bumi
  getPencairanTitipan: async (): Promise<TransaksiPencairanTitipan[]> => {
    const data = await requestJson('/api/transaksi/cairkan-titipan');
    if (!data.success) throw new Error(data.message || 'Gagal memuat pencairan titipan');
    return data.data;
  },

  cairkanTitipan: async (payload: {
    idMitra: string;
    nominal: number;
    rekeningSumber: string;
    metode: 'TUNAI' | 'TRANSFER';
    keterangan?: string;
    tanggal?: string;
  }): Promise<TransaksiPencairanTitipan> => {
    const data = await requestJson('/api/transaksi/cairkan-titipan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses pencairan titipan');
    return data.data;
  },

  // Update Transaksi Langsung dari Rekening Koran Mitra
  updateStatementEntry: async (payload: {
    idTransaksi: string;
    nominalBaru: number;
    keteranganBaru?: string;
    tanggalBaru?: string;
  }): Promise<{ success: boolean; message: string; updatedRecord: any }> => {
    const data = await requestJson('/api/transaksi/update-statement-entry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui transaksi');
    return data;
  },

  // Universal Lookup & Edit Detail Setiap Transaksi (Nominal, Tonase, Rafaksi, Qty, Harga, Rekening, Tanggal)
  getTransactionDetail: async (
    id: string,
    jenis?: string
  ): Promise<{
    jenis:
      | 'PENJUALAN'
      | 'PEMBELIAN_BARANG'
      | 'PEMBELIAN_HASIL_BUMI'
      | 'PENJUALAN_HASIL_BUMI'
      | 'KASBON_UANG'
      | 'BAYAR_BON'
      | 'PENCAIRAN_TITIPAN'
      | 'PENGELUARAN_DIVISI'
      | 'TRANSFER_REKENING'
      | 'UPAH_HARIAN'
      | 'PENGGAJIAN';
    id: string;
    record: any;
    masters: {
      rekeningList: Rekening[];
      produkList: Produk[];
      stokBarangList: StokBarang[];
      stokHasilBumiList: StokHasilBumi[];
      mitraList: Mitra[];
      divisiList: Array<{ id: string; nama: string; kodeRekening: string }>;
    };
  }> => {
    const data = await requestJson('/api/transaksi/detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, jenis }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal mengambil detail transaksi');
    return data.data;
  },

  editTransactionDetail: async (payload: {
    idTransaksi: string;
    jenis?: string;
    tanggal?: string;
    keterangan?: string;
    idMitra?: string;
    namaMitraManual?: string;
    nominal?: number;
    metode?: string;
    rekeningSumber?: string;
    rekeningTujuan?: string;
    komoditasKode?: string;
    beratKotor?: number;
    potonganRafaksi?: number;
    beratBersihManual?: number;
    hargaPerKg?: number;
    hargaJualPerKg?: number;
    isBelumPutusHarga?: boolean;
    noSuratJalan?: string;
    noNotaLalu?: string;
    noFakturSupplier?: string;
    items?: Array<{
      kodeProduk: string;
      namaProduk?: string;
      satuan?: string;
      qty: number;
      harga?: number;
      hargaBeliSatuan?: number;
    }>;
    rincianBarangNotaLalu?: string;
    divisi?: string;
    kategori?: string;
    penerima?: string;
    itemKerja?: string;
    kuantiti?: number;
    hargaSatuanUpah?: number;
    uangMakanLembur?: number;
    catatanKerja?: string;
    gajiPokok?: number;
    tunjangan?: number;
    bonus?: number;
    potonganKasbon?: number;
    periodeBulan?: string;
  }): Promise<{
    success: boolean;
    jenis: string;
    idTransaksi: string;
    message: string;
    updatedRecord: any;
  }> => {
    const data = await requestJson('/api/transaksi/edit-detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan perubahan detail transaksi');
    return data;
  },

  // Rekapan Semua Transaksi Terpadu (Semua Transaksi Hari Tersebut)
  getSemuaTransaksi: async (params?: {
    tanggal?: string;
    arusUang?: string;
    kategori?: string;
    pihakTerkait?: string;
    search?: string;
  }): Promise<RekapSemuaTransaksiResponse> => {
    const query = new URLSearchParams();
    if (params?.tanggal) query.append('tanggal', params.tanggal);
    if (params?.arusUang) query.append('arusUang', params.arusUang);
    if (params?.kategori) query.append('kategori', params.kategori);
    if (params?.pihakTerkait) query.append('pihakTerkait', params.pihakTerkait);
    if (params?.search) query.append('search', params.search);

    const queryString = query.toString();
    const url = `/api/transaksi/semua${queryString ? `?${queryString}` : ''}`;
    const data = await requestJson(url);
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekap semua transaksi');
    return data.data;
  },

  // Pusat Kontrol Kasir: Kliring Silang Panen vs Bon, Deteksi Nama Kembar & Cash Opname
  getSmartControlOverview: async (): Promise<SmartControlOverviewResponse> => {
    const data = await requestJson('/api/kontrol-kasir/overview');
    if (!data.success) throw new Error(data.message || 'Gagal memuat data pusat kontrol kasir');
    return data.data;
  },

  processKliringSilang: async (payload: {
    idMitra: string;
    nominalPotongSilang: number;
    aksiSisa: 'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON';
    nominalPenyelesaianFisik?: number;
    metodeFisik?: 'TUNAI' | 'TRANSFER';
    rekeningFisik?: string;
    keterangan?: string;
  }): Promise<HasilKliringSilangResponse> => {
    const data = await requestJson('/api/kontrol-kasir/kliring-silang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses kliring silang kemitraan');
    return data.data;
  },

  processBatchKliring: async (mitraIds?: string[]): Promise<{
    processedCount: number;
    totalKompensasi: number;
    items: HasilKliringSilangResponse[];
  }> => {
    const data = await requestJson('/api/kontrol-kasir/kliring-massal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mitraIds }),
    });
    if (!data.success) throw new Error(data.message || 'Gagal memproses kliring massal otomatis');
    return data.data;
  },

  mergeDuplicateMitra: async (payload: {
    primaryMitraId: string;
    duplicateMitraId: string;
    alasan?: string;
  }): Promise<{
    success: boolean;
    message: string;
    migratedCounts: Record<string, number>;
    primaryMitraNama: string;
    mergedDuplicateNama: string;
  }> => {
    const data = await requestJson('/api/kontrol-kasir/gabung-mitra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menggabungkan akun mitra duplikat');
    return data;
  },

  recordCashOpname: async (payload: {
    petugasKasir: string;
    rincianPecahan: Record<string, number>;
    sesuaikanSaldoSistem: boolean;
    catatan?: string;
  }): Promise<CatatanCashOpname> => {
    const data = await requestJson('/api/kontrol-kasir/cash-opname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan berita acara cash opname');
    return data.data;
  },

  // Unified Instant ERP Snapshot (Single HTTP Request)
  getErpSnapshot: async (): Promise<{
    dashboard: DashboardStatsResponse;
    rekening: Rekening[];
    mitra: Mitra[];
    karyawan: KaryawanWithBon[];
    upahHarian: CatatanUpahHarian[];
    produk: Produk[];
    kategoriProduk: Array<{ nama: string; deskripsi: string; jumlahProduk: number; isSaved: boolean }>;
    stokBarang: StokBarang[];
    stokHasilBumi: StokHasilBumi[];
    penjualan: TransaksiPenjualan[];
    pembelianHasilBumi: TransaksiPembelianHasilBumi[];
    penjualanHasilBumi: TransaksiPenjualanHasilBumi[];
    pembelianBarang: TransaksiPembelianBarang[];
    pencairanTitipan: TransaksiPencairanTitipan[];
    kasbonUang: TransaksiKasbonUang[];
    bayarBon: TransaksiBayarBon[];
    pengeluaran: TransaksiPengeluaran[];
    transferRekening: TransaksiTransferRekening[];
    penggajian: TransaksiPenggajian[];
    auditLogs: AuditLog[];
    profilPerusahaan: ProfilPerusahaan;
    inventaris: ItemInventaris[];
    divisiList?: ItemDivisi[];
    supabaseStatus: {
      configured: boolean;
      url?: string;
      autoSync?: boolean;
      lastSyncTime?: string | null;
      lastSyncStatus?: 'SUCCESS' | 'ERROR';
      lastSyncMessage?: string;
    };
  }> => {
    const data = await requestJson('/api/erp-snapshot');
    if (!data.success) throw new Error(data.message || 'Gagal memuat snapshot ERP');
    return data.data;
  },

  uploadBuktiImage: async (
    dataUrl: string,
    prefix = 'nota'
  ): Promise<{ url: string; storage: 'SUPABASE_STORAGE' | 'INLINE_COMPRESSED' }> => {
    const data = await requestJson('/api/upload-bukti', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, prefix }),
    });
    if (!data.success) {
      return { url: dataUrl, storage: 'INLINE_COMPRESSED' };
    }
    return data.data;
  },

  // Akses PIN Bos & Kasir + Lightweight Snapshot Bos
  getBosSnapshot: async (): Promise<{
    profilPerusahaan: ProfilPerusahaan;
    rekening: Rekening[];
    stokBarang: StokBarang[];
    stokHasilBumi: StokHasilBumi[];
    inventaris: ItemInventaris[];
    divisiList?: ItemDivisi[];
    supabaseStatus: {
      configured: boolean;
      url?: string;
      autoSync?: boolean;
      lastSyncTime?: string | null;
      lastSyncStatus?: 'SUCCESS' | 'ERROR';
      lastSyncMessage?: string;
    };
  }> => {
    const data = await requestJson('/api/bos-snapshot');
    if (!data.success) throw new Error(data.message || 'Gagal memuat ringkasan data pimpinan');
    return data.data;
  },

  getAccessStatus: async (): Promise<{
    namaPerusahaan: string;
    badanHukum: string;
    logoUrl?: string;
    wajibPinPublik: boolean;
    pinLengthHint: number;
    supabaseConfigured?: boolean;
  }> => {
    const data = await requestJson('/api/access/status');
    if (!data.success) throw new Error(data.message || 'Gagal memuat status keamanan');
    return data.data;
  },

  verifyAccessPin: async (
    pin: string
  ): Promise<{ role: 'BOS' | 'KASIR'; label: string; sessionDurationMs?: number }> => {
    const cached = readCloudReconnectPayload();
    const data = await requestJson('/api/access/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin,
        reconnectBundle: cached?.bundle,
        supabaseUrl: cached?.url,
        supabaseKey: cached?.key,
      }),
    });
    if (!data.success) throw new Error(data.message || 'Sandi tidak valid');
    if (data.data?.cloudReconnectBundle) {
      saveCloudReconnectBundle(data.data.cloudReconnectBundle);
    }
    return data.data;
  },

  getAccessAdminConfig: async (): Promise<{
    pinBos: string;
    pinKasir: string;
    wajibPinPublik: boolean;
    supabaseConfigured: boolean;
    supabaseUrl: string;
    supabaseKeyPreview: string;
  }> => {
    const data = await requestJson('/api/access/admin-config');
    if (!data.success) throw new Error(data.message || 'Gagal memuat konfigurasi PIN');
    return data.data;
  },

  updateAccessAdminConfig: async (payload: {
    pinBos: string;
    pinKasir: string;
    wajibPinPublik: boolean;
  }): Promise<{ pinBos: string; pinKasir: string; wajibPinPublik: boolean }> => {
    const data = await requestJson('/api/access/admin-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan konfigurasi PIN');
    return data.data;
  },
};

export interface BillboardData {
  todayDate: string;
  cashflow: {
    masuk: number;
    keluar: number;
    net: number;
    kasKasir: number;
    totalBank: number;
    totalKasDanBank: number;
    piutangBon: number;
    titipHasilBumi: number;
  };
  divisiList: PergerakanKeuanganDivisiSummary[];
  karyawanJobs: Array<{
    id: string;
    idKaryawan: string;
    nik: string;
    namaKaryawan: string;
    jabatan: string;
    divisi: NamaDivisi;
    tugasPekerjaan: string;
    tanggalKerja: string;
    upahHarian: number;
    uangMakanLembur: number;
    totalUpah: number;
    status: string;
  }>;
  liveFeed: Array<{
    id: string;
    timestamp: string;
    tanggal: string;
    jam: string;
    user: string;
    jenis: string;
    nominal: number;
    rekeningTerkait: string;
    detail: string;
  }>;
  stokKomoditas: Array<{
    kode: string;
    nama: string;
    totalKg: number;
    totalTon: string;
    satuan: string;
    hargaStandar: number;
  }>;
}
