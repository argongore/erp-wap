import {
  AuditLog,
  DAFTAR_DIVISI,
  Karyawan,
  Mitra,
  NamaDivisi,
  PergerakanKeuanganDivisiSummary,
  Produk,
  Rekening,
  RekeningKoranMitraSummary,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianHasilBumi,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
} from '../server/types.ts';

export interface KaryawanWithBon extends Karyawan {
  kasbonBarang: number;
  kasbonUang: number;
  totalKasbonAktif: number;
}

export interface DashboardStatsResponse {
  totalPenjualan: number;
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
  }>;
  rekeningList: Rekening[];
}

export const api = {
  // Master Rekening
  getRekening: async (): Promise<Rekening[]> => {
    const res = await fetch('/api/rekening');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekening');
    return data.data;
  },

  createRekening: async (payload: Partial<Rekening>): Promise<Rekening> => {
    const res = await fetch('/api/rekening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal membuat rekening');
    return data.data;
  },

  updateRekening: async (kode: string, payload: Partial<Rekening>): Promise<Rekening> => {
    const res = await fetch(`/api/rekening/${kode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui rekening');
    return data.data;
  },

  // Master Mitra
  getMitra: async (): Promise<Mitra[]> => {
    const res = await fetch('/api/mitra');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat mitra');
    return data.data;
  },

  createMitra: async (payload: Partial<Mitra>): Promise<Mitra> => {
    const res = await fetch('/api/mitra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menambah mitra');
    return data.data;
  },

  updateMitra: async (id: string, payload: Partial<Mitra>): Promise<Mitra> => {
    const res = await fetch(`/api/mitra/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui mitra');
    return data.data;
  },

  // Master Produk & Stok
  getProduk: async (): Promise<Produk[]> => {
    const res = await fetch('/api/produk');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat produk');
    return data.data;
  },

  createProduk: async (payload: any): Promise<any> => {
    const res = await fetch('/api/produk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menambah produk');
    return data.data;
  },

  getStok: async (): Promise<StokBarang[]> => {
    const res = await fetch('/api/stok');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat stok');
    return data.data;
  },

  adjustStok: async (payload: { kode: string; penyesuaianQty: number; alasan: string }): Promise<StokBarang> => {
    const res = await fetch('/api/stok/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menyesuaikan stok');
    return data.data;
  },

  getStokHasilBumi: async (): Promise<StokHasilBumi[]> => {
    const res = await fetch('/api/stok-hasil-bumi');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat stok hasil bumi');
    return data.data;
  },

  // Transaksi Kasir
  processPenjualan: async (payload: {
    idMitra: string;
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON';
    rekeningTujuan?: string;
    items: Array<{ kodeProduk: string; qty: number; harga?: number }>;
    keterangan?: string;
  }): Promise<TransaksiPenjualan> => {
    const res = await fetch('/api/transaksi/penjualan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses transaksi penjualan');
    return data.data;
  },

  getPenjualan: async (): Promise<TransaksiPenjualan[]> => {
    const res = await fetch('/api/transaksi/penjualan');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  processPembelianHasilBumi: async (payload: {
    idMitra: string;
    komoditasKode: string;
    beratKotor: number;
    potonganRafaksi: number;
    hargaPerKg: number;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> => {
    const res = await fetch('/api/transaksi/pembelian-hasil-bumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses pembelian hasil bumi');
    return data.data;
  },

  getPembelianHasilBumi: async (): Promise<TransaksiPembelianHasilBumi[]> => {
    const res = await fetch('/api/transaksi/pembelian-hasil-bumi');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Kasbon Uang (Fitur C)
  processKasbonUang: async (payload: {
    idMitra: string;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string;
    nominal: number;
    keterangan?: string;
  }): Promise<TransaksiKasbonUang> => {
    const res = await fetch('/api/transaksi/kasbon-uang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses kasbon uang');
    return data.data;
  },

  getKasbonUang: async (): Promise<TransaksiKasbonUang[]> => {
    const res = await fetch('/api/transaksi/kasbon-uang');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Bayar Bon (Fitur D)
  processBayarBon: async (payload: {
    idMitra: string;
    nominalBayar: number;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningTujuan?: string;
    keterangan?: string;
  }): Promise<TransaksiBayarBon> => {
    const res = await fetch('/api/transaksi/bayar-bon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses pembayaran bon');
    return data.data;
  },

  getBayarBon: async (): Promise<TransaksiBayarBon[]> => {
    const res = await fetch('/api/transaksi/bayar-bon');
    const data = await res.json();
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
    const res = await fetch('/api/transaksi/transfer-rekening', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses transfer antar rekening');
    return data.data;
  },

  getTransferRekening: async (): Promise<TransaksiTransferRekening[]> => {
    const res = await fetch('/api/transaksi/transfer-rekening');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Rekening Koran Mitra & Dashboard
  getRekeningKoranMitra: async (idMitra: string): Promise<RekeningKoranMitraSummary> => {
    const res = await fetch(`/api/rekening-koran-mitra/${idMitra}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekening koran mitra');
    return data.data;
  },

  getDashboard: async (): Promise<DashboardStatsResponse> => {
    const res = await fetch('/api/dashboard');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat dashboard');
    return data.data;
  },

  getAuditLogs: async (): Promise<AuditLog[]> => {
    const res = await fetch('/api/audit-logs');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat audit log');
    return data.data;
  },

  // Master Karyawan
  getKaryawan: async (): Promise<KaryawanWithBon[]> => {
    const res = await fetch('/api/karyawan');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat data karyawan');
    return data.data;
  },

  createKaryawan: async (payload: Partial<Karyawan>): Promise<Karyawan> => {
    const res = await fetch('/api/karyawan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menambah karyawan');
    return data.data;
  },

  updateKaryawan: async (id: string, payload: Partial<Karyawan>): Promise<Karyawan> => {
    const res = await fetch(`/api/karyawan/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui karyawan');
    return data.data;
  },

  toggleKaryawanStatus: async (id: string): Promise<Karyawan> => {
    const res = await fetch(`/api/karyawan/${id}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal mengubah status karyawan');
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
    bonus?: number;
    persentasePotongKasbon: number;
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPenggajian> => {
    const res = await fetch('/api/transaksi/penggajian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
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
    const res = await fetch('/api/transaksi/penggajian/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses batch penggajian');
    return data.data;
  },

  getPenggajian: async (): Promise<TransaksiPenggajian[]> => {
    const res = await fetch('/api/transaksi/penggajian');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat riwayat penggajian');
    return data.data;
  },

  // Divisi & Keuangan
  getDivisi: async (): Promise<typeof DAFTAR_DIVISI> => {
    const res = await fetch('/api/divisi');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat daftar divisi');
    return data.data;
  },

  getDivisiKeuangan: async (): Promise<PergerakanKeuanganDivisiSummary[]> => {
    const res = await fetch('/api/divisi/keuangan');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat pergerakan keuangan divisi');
    return data.data;
  },
};
