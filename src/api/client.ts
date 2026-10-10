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
  LabaRugiSummary,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
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
    fotoNota?: string;
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

  updateRekening: async (
    kode: string,
    payload: Partial<Rekening> & { saldoSaatIni?: number; saldoAwal?: number; alasanPenyesuaian?: string }
  ): Promise<Rekening> => {
    const res = await fetch(`/api/rekening/${kode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui rekening');
    return data.data;
  },

  updateSaldoRekening: async (
    kode: string,
    saldoBaru: number,
    updateSaldoAwal: boolean = false,
    alasan?: string
  ): Promise<Rekening> => {
    const res = await fetch(`/api/rekening/${kode}/update-saldo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saldoBaru, updateSaldoAwal, alasan }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memperbarui saldo rekening');
    return data.data;
  },

  // Master Mitra
  getMitra: async (): Promise<Mitra[]> => {
    const res = await fetch('/api/mitra');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat mitra');
    return data.data;
  },

  getRekapMitra: async (): Promise<RekapMasterMitraSummary> => {
    const res = await fetch('/api/mitra/rekap');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekap saldo mitra');
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

  createKomoditasHasilBumi: async (payload: {
    kode?: string;
    nama: string;
    satuan?: string;
    hargaBeliStandar?: number;
  }): Promise<StokHasilBumi> => {
    const res = await fetch('/api/stok-hasil-bumi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menambah komoditas hasil bumi');
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
    const res = await fetch('/api/stok-hasil-bumi/saldo-awal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan saldo awal hasil bumi');
    return data.data;
  },

  // Transaksi Kasir
  processPenjualan: async (payload: {
    idMitra?: string;
    namaPembeliManual?: string;
    tipePembeli?: 'UMUM' | 'REKANAN';
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON';
    rekeningTujuan?: string;
    items: Array<{ kodeProduk: string; qty: number; harga?: number; hargaSugesti?: number }>;
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

  // Pembelian Barang Dagang (Distributor & Pemasok)
  processPembelianBarang: async (payload: {
    idMitra?: string;
    namaDistributorManual?: string;
    noFakturSupplier?: string;
    fotoNota?: string;
    isRekapanGlobal?: boolean;
    judulRekapan?: string;
    totalNominalRekapan?: number;
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
    const res = await fetch('/api/transaksi/pembelian-barang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses pembelian barang');
    return data.data;
  },

  getPembelianBarang: async (): Promise<TransaksiPembelianBarang[]> => {
    const res = await fetch('/api/transaksi/pembelian-barang');
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    return data.data;
  },

  // Laba Rugi Produk
  getLabaRugiProduk: async (): Promise<LabaRugiSummary> => {
    const res = await fetch('/api/laporan/laba-rugi-produk');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat laporan laba rugi produk');
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

  putusHargaHasilBumi: async (payload: {
    noPembelian: string;
    hargaDealPerKg: number;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> => {
    const res = await fetch('/api/transaksi/pembelian-hasil-bumi/putus-harga', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses putus harga');
    return data.data;
  },

  resetCleanDatabase: async (): Promise<{ message: string }> => {
    const res = await fetch('/api/database/reset-clean', {
      method: 'POST',
    });
    const data = await res.json();
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
    const res = await fetch('/api/transaksi/kasbon-uang', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
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
  }): Promise<{ record: any; tipe: string; mitraNama: string; nominal: number }> => {
    const res = await fetch('/api/transaksi/nota-lalu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = 'Gagal memproses input nota lalu';
      try {
        const parsed = JSON.parse(text);
        msg = parsed.message || msg;
      } catch {
        msg = text || `HTTP ${res.status}`;
      }
      throw new Error(msg);
    }
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memproses input nota lalu');
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

  getRekapKaryawan: async (): Promise<RekapMasterKaryawanSummary> => {
    const res = await fetch('/api/karyawan/rekap');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekap saldo karyawan');
    return data.data;
  },

  getUpahHarianList: async (): Promise<CatatanUpahHarian[]> => {
    const res = await fetch('/api/karyawan/upah-harian');
    const data = await res.json();
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
    const res = await fetch('/api/karyawan/kerja-harian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal menyimpan input kerja harian');
    return data.data;
  },

  getDetailHarianKaryawan: async (id: string): Promise<DetailHarianKaryawanResponse> => {
    const res = await fetch(`/api/karyawan/${id}/detail-harian`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat detail harian karyawan');
    return data.data;
  },

  settleHakUpahKaryawan: async (
    id: string,
    payload: {
      divisi?: NamaDivisi;
      upahHarianIds?: string[];
      rekeningSumber?: string;
      persentasePotongKasbon?: number;
      nominalPotongKustom?: number;
      metodePembayaran?: 'TUNAI' | 'TRANSFER';
      keterangan?: string;
    }
  ): Promise<TransaksiPenggajian> => {
    const res = await fetch(`/api/karyawan/${id}/settle-gaji`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal mencairkan hak upah karyawan');
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

  deleteKaryawanPermanent: async (id: string): Promise<boolean> => {
    const res = await fetch(`/api/karyawan/${id}/permanent`, {
      method: 'DELETE',
    });
    const data = await res.json();
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
    const res = await fetch(url);
    const data = await res.json();
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
    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat rekapitulasi payroll bulanan');
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

  // Billboard & Big-Screen Command Center
  getBillboardData: async (): Promise<BillboardData> => {
    const res = await fetch('/api/billboard');
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Gagal memuat data billboard command center');
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
