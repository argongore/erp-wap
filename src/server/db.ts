import fs from 'fs';
import os from 'os';
import path from 'path';
import { DAFTAR_DIVISI, DEFAULT_PT_LOGO_URL } from './types.ts';
import type {
  AuditLog,
  CatatanUpahHarian,
  Karyawan,
  Mitra,
  Produk,
  Rekening,
  StokBarang,
  StokHasilBumi,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianBarang,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
  ProfilPerusahaan,
  TransaksiPengeluaran,
  TransaksiPencairanTitipan,
  ItemDivisi,
  ItemKategoriProduk,
  CatatanCashOpname,
  DatabaseIntegrityStatus,
  ItemInventaris,
} from './types.ts';
import { supabaseSyncEngine } from './supabase.ts';

export interface DatabaseSchema {
  profilPerusahaan: ProfilPerusahaan;
  rekening: Rekening[];
  mitra: Mitra[];
  karyawan: Karyawan[];
  upahHarian: CatatanUpahHarian[];
  penggajian: TransaksiPenggajian[];
  produk: Produk[];
  stokBarang: StokBarang[];
  stokHasilBumi: StokHasilBumi[];
  penjualan: TransaksiPenjualan[];
  pembelianBarang: TransaksiPembelianBarang[];
  pembelianHasilBumi: TransaksiPembelianHasilBumi[];
  penjualanHasilBumi?: TransaksiPenjualanHasilBumi[];
  kasbonUang: TransaksiKasbonUang[];
  bayarBon: TransaksiBayarBon[];
  transferRekening: TransaksiTransferRekening[];
  pengeluaran: TransaksiPengeluaran[];
  pencairanTitipan: TransaksiPencairanTitipan[];
  auditLogs: AuditLog[];
  divisi?: ItemDivisi[];
  kategoriProduk?: ItemKategoriProduk[];
  cashOpnameLogs?: CatatanCashOpname[];
  inventaris?: ItemInventaris[];
}

const RUNTIME_CACHE_DIR = path.join(os.tmpdir(), 'wijaya_agro_erp_runtime');
const DB_FILE = path.join(RUNTIME_CACHE_DIR, 'wijaya_agro_erp.json');
const LEGACY_DB_FILE = path.resolve(process.cwd(), 'data', 'wijaya_agro_erp.json');
const TEMP_BACKUP_DIR = path.join(os.tmpdir(), 'wijaya_agro_erp_backups');

// Indonesian Timezone formatters
export function getWIBDateTime(): { tanggal: string; jam: string; iso: string } {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const partsDate = dateFormatter.formatToParts(now);
  const day = partsDate.find((p) => p.type === 'day')?.value.padStart(2, '0') || '01';
  const month = partsDate.find((p) => p.type === 'month')?.value.padStart(2, '0') || '01';
  const year = partsDate.find((p) => p.type === 'year')?.value || '2026';
  const tanggal = `${day}/${month}/${year}`;

  const jam = timeFormatter.format(now).replace(/\./g, ':');

  return {
    tanggal,
    jam,
    iso: now.toISOString(),
  };
}

/**
 * Standard Company and Operational Bank Accounts
 */
export function getDefaultRekeningList(): Rekening[] {
  return [
    {
      kode: 'KAS01',
      nama: 'Kas Utama Kasir (Brankas Fisik)',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: 'KAS-01-OPERASIONAL',
      saldoAwal: 25000000,
      saldoSaatIni: 25000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'PERUSAHAAN',
      keterangan: 'Penyimpanan utama uang kas fisik di brankas & laci kasir kantor pusat',
    },
    {
      kode: 'BNI01',
      nama: 'Bank BNI Operasional Pusat',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: '1827401928',
      saldoAwal: 75000000,
      saldoSaatIni: 75000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'PERUSAHAAN',
      keterangan: 'Rekening bank giro utama penyimpanan dana perusahaan',
    },
    {
      kode: 'BCA01',
      nama: 'Bank BCA Bisnis Agro',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: '8201948291',
      saldoAwal: 120000000,
      saldoSaatIni: 120000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'PERUSAHAAN',
      keterangan: 'Rekening bank penampungan utama hasil penjualan toko & komoditas',
    },
    {
      kode: 'MAN01',
      nama: 'Bank Mandiri Agro',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: '137001928374',
      saldoAwal: 50000000,
      saldoSaatIni: 50000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'PERUSAHAAN',
      keterangan: 'Rekening bank transaksi grosir dan mitra tani',
    },
    {
      kode: 'BRI01',
      nama: 'Bank BRI Unit Agro',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: '0192837461829',
      saldoAwal: 35000000,
      saldoSaatIni: 35000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'PERUSAHAAN',
      keterangan: 'Rekening bank transaksi kemitraan petani daerah',
    },
    {
      kode: 'BER01',
      nama: 'Bank BSI Berkah Tani',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: '7182938491',
      saldoAwal: 15000000,
      saldoSaatIni: 15000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'PERUSAHAAN',
      keterangan: 'Rekening bank syariah kemitraan',
    },
    {
      kode: 'BON01',
      nama: 'Rekening Kasbon Customer (Piutang)',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: 'VIRTUAL-BON-PIUTANG',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: true,
      kategori: 'VIRTUAL_SISTEM',
      keterangan: 'Rekening virtual kliring sistem untuk akumulasi kasbon barang & kasbon uang',
    },
    {
      kode: 'TIT01',
      nama: 'Rekening Titip / Hutang Supplier',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: 'VIRTUAL-TITIP-HUTANG',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: true,
      kategori: 'VIRTUAL_SISTEM',
      keterangan: 'Rekening virtual kliring sistem untuk titip hasil bumi belum diambil',
    },
    {
      kode: 'SINKRON',
      nama: 'Rekening Sinkron (Potong Titipan / Uang Hasil Bumi)',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: 'SINKRON-POTONG-TITIPAN',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: true,
      kategori: 'VIRTUAL_SISTEM',
      keterangan: 'Rekening non-tunai untuk pelunasan bon mitra dengan memotong langsung saldo titipan hasil bumi / uang kopi tanpa mengeluarkan uang kas fisik',
    },
    // REKENING OPERASIONAL DIVISI (BUKU ALOKASI TRACKING PERGERAKAN DANA — MURNI MULAI RP 0 TANPA SALDO DUMMY)
    {
      kode: 'REK-GWA',
      nama: 'Buku Operasional Gudang Wijaya Agro',
      atasNama: 'Divisi Gudang Wijaya Agro',
      nomorRekening: 'DIV-01-GWA',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'KAS01',
      keterangan: 'Buku tracking alokasi kas operasional sortir gabah & upah harian (Dana fisik di Kas Perusahaan)',
    },
    {
      kode: 'REK-WK',
      nama: 'Buku Operasional Wijaya Karya',
      atasNama: 'Divisi Wijaya Karya',
      nomorRekening: 'DIV-02-WK',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'BNI01',
      keterangan: 'Buku tracking operasional proyek pabrik & upah teknisi (Dana fisik di Rekening Bank BNI)',
    },
    {
      kode: 'REK-WT',
      nama: 'Buku Operasional Wijaya Transport',
      atasNama: 'Divisi Wijaya Transport',
      nomorRekening: 'DIV-03-WT',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'BNI01',
      keterangan: 'Buku tracking armada truk & upah supir (Dana fisik di Rekening Bank BNI)',
    },
    {
      kode: 'REK-CVA',
      nama: 'Buku Operasional CV Wijaya Agro',
      atasNama: 'CV Wijaya Agro',
      nomorRekening: 'DIV-04-CVA',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'BCA01',
      keterangan: 'Buku tracking perputaran dagang saprotan lokal & staff (Dana fisik di Bank BCA)',
    },
    {
      kode: 'REK-WAP',
      nama: 'Buku Operasional PT Wijaya Agro Perkasa',
      atasNama: 'PT Wijaya Agro Perkasa',
      nomorRekening: 'DIV-05-WAP',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'BNI01',
      keterangan: 'Buku tracking holding pabrik beras & kemitraan nasional (Dana fisik di Bank BNI)',
    },
    {
      kode: 'REK-OKU',
      nama: 'Buku Operasional Okussa',
      atasNama: 'Divisi Bisnis Okussa',
      nomorRekening: 'DIV-06-OKU',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'KAS01',
      keterangan: 'Buku tracking distribusi beras kemasan premium Okussa (Dana fisik di Kas Perusahaan)',
    },
    // REKENING ANAK PERUSAHAAN & MITRA TERAFILIASI (1 TRANSAKSI TERPADU REKENING <-> MITRA)
    {
      kode: 'REK-DPPARABO',
      nama: 'DP Parabot',
      atasNama: 'DP Parabot — Anak Perusahaan PT. Wijaya Agro Perkasa',
      nomorRekening: 'AFILIASI-DP-PARABOT',
      saldoAwal: 0,
      saldoSaatIni: 0,
      status: 'AKTIF',
      isVirtual: false,
      isAnakPerusahaan: true,
      idMitraTerkait: 'MTR-DPPARABOT',
      namaMitraTerkait: 'DP Parabot',
      kategori: 'ANAK_PERUSAHAAN',
      keterangan:
        'Anak Perusahaan PT. Wijaya Agro Perkasa (Bukan Bank) — Terintegrasi otomatis sebagai Mitra dalam 1 transaksi terpadu',
    },
  ];
}

// ==========================================
// PONDASI DATABASE ITEM DARI DOKUMEN MASTER (NO 1 S/D 35)
// No 1 s/d 8: Pembelian Hasil Bumi Dari Petani (Termasuk No 8: Kopi Titip Belum Putus Harga)
// No 9 s/d 35: Barang yang dibeli dari pemasok untuk dijual
// ==========================================

// Legacy hardcoded dummy seed balances on OPERASIONAL_DIVISI accounts (used strictly to strip untouched template balances)
const LEGACY_DUMMY_DIVISI_BALANCES: Record<string, number> = {
  'REK-GWA': 15000000,
  'REK-WK': 20000000,
  'REK-WT': 25000000,
  'REK-CVA': 30000000,
  'REK-WAP': 50000000,
  'REK-OKU': 15000000,
};

// Legacy hardcoded dummy seed prices from initial template (used strictly to strip unpurchased 0-stock dummy prices)
const LEGACY_DUMMY_HASIL_BUMI_PRICES: Record<string, number> = {
  'HB-01': 42000,
  'HB-02': 52000,
  'HB-03': 38000,
  'HB-04': 30000,
  'HB-05': 68000,
  'HB-06': 115000,
  'HB-07': 35000,
};

const LEGACY_DUMMY_PRODUK_PRICES: Record<string, [number, number, number]> = {
  'PRD-09': [145000, 155000, 150000],
  'PRD-10': [140000, 150000, 145000],
  'PRD-11': [180000, 220000, 200000],
  'PRD-12': [220000, 260000, 240000],
  'PRD-13': [200000, 240000, 220000],
  'PRD-14': [230000, 270000, 250000],
  'PRD-15': [650, 800, 750],
  'PRD-16': [8500, 10000, 9500],
  'PRD-17': [25000, 30000, 28000],
  'PRD-18': [18000, 22000, 20000],
  'PRD-19': [55000, 65000, 60000],
  'PRD-20': [60000, 72000, 66000],
  'PRD-21': [45000, 55000, 50000],
  'PRD-22': [25000, 32000, 28000],
  'PRD-23': [120000, 135000, 130000],
  'PRD-24': [160000, 180000, 170000],
  'PRD-25': [210000, 235000, 225000],
  'PRD-26': [275000, 300000, 290000],
  'PRD-27': [45000, 55000, 50000],
  'PRD-28': [55000, 68000, 62000],
  'PRD-29': [65000, 80000, 72000],
  'PRD-30': [70000, 85000, 78000],
  'PRD-31': [85000, 105000, 95000],
  'PRD-32': [95000, 120000, 110000],
  'PRD-33': [75000, 90000, 82000],
  'PRD-34': [90000, 110000, 100000],
  'PRD-35': [100000, 125000, 115000],
};

export function getDefaultHasilBumiList(): StokHasilBumi[] {
  const now = getWIBDateTime();
  return [
    { kode: 'HB-01', nama: 'KOPI', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: 'HB-02', nama: 'KULIT KAYU MANIS STIK', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: 'HB-03', nama: 'KULIT KAYU MANIS KA', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: 'HB-04', nama: 'KULIT KAYU MANIS KB', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: 'HB-05', nama: 'LADA', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: 'HB-06', nama: 'CENGKEH', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    { kode: 'HB-07', nama: 'GG CENGKEH', satuan: 'KG', stok: 0, hargaBeliStandar: 0, updateTerakhir: now.iso },
    {
      kode: 'HB-08',
      nama: 'KOPI TITIP',
      satuan: 'KG',
      stok: 0,
      hargaBeliStandar: 0,
      updateTerakhir: now.iso,
      isBelumPutusHarga: true,
      keterangan: 'Pembelian Hasil Bumi dari Petani - Belum Putus Harga (Titip Timbang Panen / Harga Mengambang)',
    },
  ];
}

export function getDefaultProdukDagangList(): { produk: Produk[]; stokBarang: StokBarang[] } {
  const now = getWIBDateTime();
  const rawItems: Array<{
    kode: string;
    nama: string;
    satuan: string;
    kategori: Produk['kategori'];
  }> = [
    { kode: 'PRD-09', nama: 'BERAS BELITANG', satuan: 'SAK', kategori: 'BERAS' },
    { kode: 'PRD-10', nama: 'BERAS JEMPOL', satuan: 'SAK', kategori: 'BERAS' },
    { kode: 'PRD-11', nama: 'PASIR m2', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-12', nama: 'KORAL M2', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-13', nama: 'BATU UJM', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-14', nama: 'SPLIT', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-15', nama: 'BATA', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-16', nama: 'BATA RINGAN', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-17', nama: 'PAPAN', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-18', nama: 'KASAU', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-19', nama: 'BALOK 7x14', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-20', nama: 'BALOK 8X12', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-21', nama: 'SPANEL 4M', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-22', nama: 'SPANEL 2M', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN' },
    { kode: 'PRD-23', nama: 'UREA', satuan: 'SAK', kategori: 'PUPUK' },
    { kode: 'PRD-24', nama: 'NPK', satuan: 'SAK', kategori: 'PUPUK' },
    { kode: 'PRD-25', nama: 'SOLAR', satuan: 'DRIGENT', kategori: 'LAINNYA' },
    { kode: 'PRD-26', nama: 'DEXLITE', satuan: 'DRIGENT', kategori: 'LAINNYA' },
    { kode: 'PRD-27', nama: 'KOPI ROBUSTA MENTAH', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-28', nama: 'ROBUSTA PREMIUM MENTAH', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-29', nama: 'ROBUSTA LANANG MENTAH', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-30', nama: 'KOPI ROBUSTA ROSTING', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-31', nama: 'ROBUSTA PREMIUM ROSTING', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-32', nama: 'ROBUSTA LANANG ROSTING', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-33', nama: 'KOPI ROBUSTA BUBUK', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-34', nama: 'ROBUSTA PREMIUM BUBUK', satuan: 'KEMASAN', kategori: 'BERAS' },
    { kode: 'PRD-35', nama: 'ROBUSTA LANANG BUBUK', satuan: 'KEMASAN', kategori: 'BERAS' },
  ];

  // HPP & harga jual default adalah Rp 0 sampai ada transaksi pembelian modal riil (tidak ada angka karangan)
  const produk: Produk[] = rawItems.map((it) => ({
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    kategori: it.kategori,
    hargaBeli: 0,
    hargaJual: 0,
    hargaKhususRekanan: 0,
    status: 'AKTIF',
  }));

  const stokBarang: StokBarang[] = rawItems.map((it) => ({
    kode: it.kode,
    namaProduk: it.nama,
    satuan: it.satuan,
    stok: 0,
    minimum: 10,
    updateTerakhir: now.iso,
  }));

  return { produk, stokBarang };
}

export function getDefaultProfilPerusahaan(): ProfilPerusahaan {
  return {
    namaPerusahaan: 'PT. WIJAYA AGRO PERKASA',
    badanHukum: 'Perseroan Terbatas (PT)',
    alamat: 'Sentra Agrobisnis & Pergudangan Hasil Bumi, Lampung - Indonesia',
    telepon: '0812-3456-7890',
    email: 'kasirwap@gmail.com',
    penanggungJawab: 'Pimpinan PT. Wijaya Agro Perkasa',
    rekeningUtama: 'BNI01',
    catatanHeaderNota: 'Terima kasih atas kerja sama Anda dengan PT. WIJAYA AGRO PERKASA',
    logoUrl: DEFAULT_PT_LOGO_URL,
    updateTerakhir: getWIBDateTime().iso,
  };
}

export function getDefaultRealKaryawanList(): Karyawan[] {
  return [];
}

export function getDefaultRealMitraList(): Mitra[] {
  return [];
}

// Initial Database: 35 Foundation Items (1-8 Hasil Bumi & 9-35 Produk Toko), 11 Rekening, Clean Karyawan & Mitra ready for real data
export function getDefaultDatabase(): DatabaseSchema {
  const now = getWIBDateTime();
  const { produk, stokBarang } = getDefaultProdukDagangList();
  const stokHasilBumi = getDefaultHasilBumiList();
  const defaultKaryawan: Karyawan[] = [];
  const defaultMitra: Mitra[] = [];

  // Create Mitra accounts for employees
  defaultKaryawan.forEach((kry) => {
    defaultMitra.push({
      id: kry.idMitraTerkait || `MTR-${kry.id}`,
      kode: kry.nik || kry.id,
      nama: kry.nama,
      role: 'KARYAWAN',
      telepon: kry.telepon || '-',
      alamat: kry.alamat || '-',
      status: 'AKTIF',
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
        id: 'LOG-INIT',
        timestamp: now.iso,
        tanggal: now.tanggal,
        jam: now.jam,
        user: 'KasirWap',
        jenisTransaksi: 'CREATE',
        idTransaksi: 'SYS-INIT',
        detail: 'Sistem siap: 35 Master Item Pondasi & 4 Karyawan Riil (Fahlevi, Lupi, Samlawi, Argon) terdaftar untuk PT Wijaya Agro.',
        nominal: 0,
      },
    ],
  };
}

class DatabaseManager {
  private db: DatabaseSchema;
  private isWriting = false;

  constructor() {
    this.ensureDirectory();
    this.lastBackupTime = Date.now();
    this.db = this.load();
    this.reconcileRelationalIntegrity();
    this.synchronizeVirtualAccounts();
    this.saveDirect(this.db);
  }

  private load(): DatabaseSchema {
    try {
      const sourceFile = fs.existsSync(DB_FILE)
        ? DB_FILE
        : fs.existsSync(LEGACY_DB_FILE)
          ? LEGACY_DB_FILE
          : null;
      if (sourceFile) {
        const raw = fs.readFileSync(sourceFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const defaultRekening = getDefaultRekeningList();

        const merged: DatabaseSchema = {
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
          inventaris: Array.isArray(parsed.inventaris) ? parsed.inventaris : [],
        };

        if (!Array.isArray(merged.karyawan)) {
          merged.karyawan = [];
        }

        if (!Array.isArray(merged.mitra)) {
          merged.mitra = [];
        }

        // Ensure every employee has a single unified account in Mitra (Karyawan juga bisa jadi Mitra)
        for (const kry of merged.karyawan) {
          const mtrId = kry.idMitraTerkait || `MTR-${kry.id}`;
          const cleanKryName = String(kry.nama || '').replace(/\s*\(Karyawan\)$/i, '').trim();
          const existing = merged.mitra.find(
            (m) =>
              m.id === mtrId ||
              m.idKaryawanTerkait === kry.id ||
              (kry.nik && m.kode === kry.nik) ||
              (!m.isAnakPerusahaan &&
                m.role !== 'ANAK_PERUSAHAAN' &&
                String(m.nama || '').replace(/\s*\(Karyawan\)$/i, '').trim().toLowerCase() ===
                  cleanKryName.toLowerCase())
          );
          if (!existing) {
            merged.mitra.push({
              id: mtrId,
              kode: kry.nik || kry.id,
              nama: cleanKryName,
              role: 'KARYAWAN',
              telepon: kry.telepon || '-',
              alamat: kry.alamat || '-',
              status: 'AKTIF',
              isKaryawan: true,
              idKaryawanTerkait: kry.id,
              catatan: `Karyawan: ${kry.jabatan || 'Staff'} (Divisi ${kry.divisi || kry.departemen || 'Gudang'})`,
            });
          } else {
            kry.idMitraTerkait = existing.id;
            existing.isKaryawan = true;
            existing.idKaryawanTerkait = kry.id;
            if (existing.nama.endsWith(' (Karyawan)')) {
              existing.nama = cleanKryName;
            }
            if (!existing.catatan) {
              existing.catatan = `Karyawan: ${kry.jabatan || 'Staff'} (Divisi ${kry.divisi || kry.departemen || 'Gudang'})`;
            }
          }
        }

        const defaultProdukData = getDefaultProdukDagangList();
        const defaultHasilBumi = getDefaultHasilBumiList();

        // Clean out old PRD-08 (Kopi TTP) from product lists if present
        merged.produk = merged.produk.filter((p) => p.kode !== 'PRD-08');
        merged.stokBarang = merged.stokBarang.filter((s) => s.kode !== 'PRD-08');
        // Clean out KOPI JALAN from stokHasilBumi
        merged.stokHasilBumi = merged.stokHasilBumi.filter((h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN'));

        // Ensure all 1 to 8 Hasil Bumi items exist as foundational system master (including No 8 Kopi Titip)
        for (const defHb of defaultHasilBumi) {
          if (!merged.stokHasilBumi.some((h) => h.kode === defHb.kode || h.nama.toUpperCase() === defHb.nama.toUpperCase())) {
            merged.stokHasilBumi.push({ ...defHb });
          }
        }

        // Ensure all 9 to 35 Produk Dagang exist as foundational system master
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

        // Ensure all default company accounts exist in merged.rekening
        for (const defRek of defaultRekening) {
          if (!merged.rekening.some((r) => r.kode === defRek.kode)) {
            merged.rekening.push({ ...defRek });
          }
        }

        // Categorize accounts cleanly (including Anak Perusahaan such as DP Parabot)
        for (const rek of merged.rekening) {
          const isDpParabot =
            rek.kode === 'REK-DPPARABO' ||
            rek.kode === 'DPPARABOT' ||
            (!rek.isVirtual && rek.nama.toLowerCase().includes('dp parabot'));

          if (isDpParabot || rek.isAnakPerusahaan || rek.kategori === 'ANAK_PERUSAHAAN') {
            rek.kategori = 'ANAK_PERUSAHAAN';
            rek.isAnakPerusahaan = true;
            rek.isVirtual = false;
            delete rek.rekeningIndukPenyimpan;
          } else {
            const defRek = defaultRekening.find((d) => d.kode === rek.kode);
            if (defRek) {
              rek.kategori = defRek.kategori;
              rek.rekeningIndukPenyimpan = defRek.rekeningIndukPenyimpan;
            } else if (rek.kode === 'BON01' || rek.kode === 'TIT01') {
              rek.kategori = 'VIRTUAL_SISTEM';
              rek.isVirtual = true;
            } else if (rek.kategori === 'OPERASIONAL_DIVISI' || rek.kode.startsWith('REK-') || rek.kode.startsWith('DIV-')) {
              rek.kategori = 'OPERASIONAL_DIVISI';
              rek.isVirtual = false;
              rek.rekeningIndukPenyimpan = rek.rekeningIndukPenyimpan || 'KAS01';
            } else {
              rek.kategori = 'PERUSAHAAN';
              rek.isVirtual = false;
            }
          }
        }

        return merged;
      }
    } catch (err) {
      console.error('Failed to read db file, creating clean default:', err);
    }
    const fresh = getDefaultDatabase();
    this.saveDirect(fresh);
    return fresh;
  }

  private ensureDirectory() {
    try {
      if (!fs.existsSync(RUNTIME_CACHE_DIR)) {
        fs.mkdirSync(RUNTIME_CACHE_DIR, { recursive: true });
      }
      if (!fs.existsSync(TEMP_BACKUP_DIR)) {
        fs.mkdirSync(TEMP_BACKUP_DIR, { recursive: true });
      }
    } catch (dirErr) {
      console.warn('Runtime temp directory check skipped:', dirErr);
    }
  }

  private lastBackupTime = 0;

  private saveDirect(data: DatabaseSchema) {
    try {
      this.ensureDirectory();
      const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
      const jsonStr = JSON.stringify(data);
      fs.writeFileSync(tempFile, jsonStr, 'utf-8');
      fs.renameSync(tempFile, DB_FILE);

      // Automatic rolling backup in OS temp directory (outside workspace bundle, max 5 files)
      const nowTime = Date.now();
      if (nowTime - this.lastBackupTime > 15 * 60 * 1000) {
        try {
          const d = new Date();
          const dateStr = d.toISOString().split('T')[0];
          const backupFile = path.join(TEMP_BACKUP_DIR, `backup_${dateStr}_${d.getHours()}h.json`);
          fs.writeFileSync(backupFile, jsonStr, 'utf-8');
          this.lastBackupTime = nowTime;

          const files = fs.readdirSync(TEMP_BACKUP_DIR).filter((f) => f.endsWith('.json')).sort();
          if (files.length > 5) {
            for (let i = 0; i < files.length - 5; i++) {
              fs.unlinkSync(path.join(TEMP_BACKUP_DIR, files[i]));
            }
          }
        } catch (backupErr) {
          console.warn('Auto backup skipped:', backupErr);
        }
      }
    } catch (writeErr) {
      console.warn('Local runtime cache write skipped:', writeErr);
    }
  }

  public save() {
    this.reconcileRelationalIntegrity();
    this.synchronizeVirtualAccounts();
    this.saveDirect(this.db);
    try {
      supabaseSyncEngine.triggerAutoSync(this.db);
    } catch {
      // Non-blocking background sync
    }
  }

  public get(): DatabaseSchema {
    return this.db;
  }

  private applyIncomingSnapshot(incoming: DatabaseSchema) {
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
    this.db.inventaris = Array.isArray(incoming.inventaris) ? incoming.inventaris : (this.db.inventaris || []);
  }

  /**
   * Hydrate memory & local mirror directly from Supabase Cloud (Single Source of Truth)
   * without adding synthetic restore audit logs or re-pushing back to Supabase.
   */
  public async hydrateFromSupabase(incoming: DatabaseSchema): Promise<boolean> {
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
  public async restoreDatabase(incoming: DatabaseSchema): Promise<boolean> {
    return await this.executeTransaction(() => {
      this.ensureDirectory();
      const emergencyFile = path.join(TEMP_BACKUP_DIR, `pre_restore_emergency_${Date.now()}.json`);
      fs.writeFileSync(emergencyFile, JSON.stringify(this.db), 'utf-8');

      this.applyIncomingSnapshot(incoming);

      const { tanggal, jam, iso } = getWIBDateTime();
      this.db.auditLogs.unshift({
        id: `LOG-RESTORE-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin/Owner',
        jenisTransaksi: 'UPDATE',
        idTransaksi: 'SYS-RESTORE',
        detail: 'Database dipulihkan dari file JSON cadangan dan disinkronkan ke Cloud Supabase.',
        nominal: 0,
      });

      this.reconcileRelationalIntegrity();
      this.synchronizeVirtualAccounts();
      return true;
    });
  }

  /**
   * Reset all data clean for supplier, karyawan, produk, stok, and hasil bumi
   */
  public resetCleanData() {
    return this.executeTransaction((db) => {
      db.karyawan = getDefaultRealKaryawanList();
      db.mitra = getDefaultRealMitraList();
      // Ensure mitra accounts for employees
      db.karyawan.forEach((kry) => {
        db.mitra.push({
          id: kry.idMitraTerkait || `MTR-${kry.id}`,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: 'KARYAWAN',
          telepon: kry.telepon || '-',
          alamat: kry.alamat || '-',
          status: 'AKTIF',
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
        user: 'KasirWap',
        jenisTransaksi: 'VOID',
        idTransaksi: 'SYS-RESET',
        detail: 'Pembersihan database: Data mitra dan karyawan dikosongkan bersih untuk input data riil. 35 Master Item (Hasil Bumi 1-8 termasuk Kopi Titip & Produk Dagang 9-35) siap digunakan.',
        nominal: 0,
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
  public reconcileRelationalIntegrity() {
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

    // Ensure BON01, TIT01, SINKRON, KAS01, and REK-DPPARABO (DP Parabot Anak Perusahaan) always exist in rekening
    const defaultRekening = getDefaultRekeningList();
    for (const reqCode of ['KAS01', 'BON01', 'TIT01', 'SINKRON', 'REK-DPPARABO']) {
      if (!this.db.rekening.some((r) => r.kode === reqCode)) {
        const def = defaultRekening.find((r) => r.kode === reqCode);
        if (def) this.db.rekening.push({ ...def });
      }
    }
    const sinkronAcc = this.db.rekening.find((r) => r.kode === 'SINKRON');
    if (sinkronAcc) {
      sinkronAcc.isVirtual = true;
      sinkronAcc.kategori = 'VIRTUAL_SISTEM';
      sinkronAcc.status = 'AKTIF';
    }

    // Strip untouched legacy dummy seed balances (Rp 15jt - Rp 50jt) on OPERASIONAL_DIVISI tracking books
    const usedRekCodes = new Set<string>();
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
      if (log.idTransaksi && log.idTransaksi.startsWith('REK-')) {
        usedRekCodes.add(log.idTransaksi);
      }
      if (log.rekeningTerkait && log.rekeningTerkait.startsWith('REK-')) {
        usedRekCodes.add(log.rekeningTerkait);
      }
    }

    for (const rek of this.db.rekening) {
      const legacyDummySaldo = LEGACY_DUMMY_DIVISI_BALANCES[rek.kode];
      if (
        legacyDummySaldo !== undefined &&
        rek.kategori === 'OPERASIONAL_DIVISI' &&
        !usedRekCodes.has(rek.kode) &&
        rek.saldoAwal === legacyDummySaldo &&
        rek.saldoSaatIni === legacyDummySaldo
      ) {
        rek.saldoAwal = 0;
        rek.saldoSaatIni = 0;
      }
    }

    // 0. Rekening Anak Perusahaan (DP Parabot, dll.) <-> Mitra Terafiliasi (1-to-1 Unified Entity)
    for (const rek of this.db.rekening) {
      const isDpParabot =
        rek.kode === 'REK-DPPARABO' ||
        rek.kode === 'DPPARABOT' ||
        (!rek.isVirtual && rek.nama.toLowerCase().includes('dp parabot'));

      if (isDpParabot || rek.isAnakPerusahaan || rek.kategori === 'ANAK_PERUSAHAAN') {
        rek.kategori = 'ANAK_PERUSAHAAN';
        rek.isAnakPerusahaan = true;
        rek.isVirtual = false;
        delete rek.rekeningIndukPenyimpan;

        // Clean legacy auto-division labels on DP Parabot while preserving user's real balances
        if (isDpParabot) {
          if (rek.nama === 'Buku Operasional DP Parabot') {
            rek.nama = 'DP Parabot';
          }
          if (rek.atasNama === 'Divisi DP Parabot') {
            rek.atasNama = 'DP Parabot — Anak Perusahaan PT. Wijaya Agro Perkasa';
          }
          if (rek.nomorRekening === 'DIV-DPPARABO') {
            rek.nomorRekening = 'AFILIASI-DP-PARABOT';
          }
          if (
            !rek.keterangan ||
            rek.keterangan === 'Buku tracking operasional dan biaya divisi DP Parabot'
          ) {
            rek.keterangan =
              'Anak Perusahaan PT. Wijaya Agro Perkasa (Bukan Bank) — Terintegrasi otomatis sebagai Mitra dalam 1 transaksi terpadu';
          }
        }

        const defaultMitraId = isDpParabot ? 'MTR-DPPARABOT' : (rek.idMitraTerkait || `MTR-AFIL-${rek.kode}`);
        const defaultMitraKode = isDpParabot ? 'DPP-01' : `AFIL-${rek.kode.slice(0, 6)}`;
        const cleanEntityName = isDpParabot
          ? 'DP Parabot'
          : rek.nama.replace(/^Buku Operasional\s+/i, '').trim() || rek.nama;

        let linkedMitra = this.db.mitra.find(
          (m) =>
            m.role !== 'KARYAWAN' &&
            (m.id === rek.idMitraTerkait ||
              m.id === defaultMitraId ||
              m.kodeRekeningTerkait === rek.kode ||
              m.nama.trim().toLowerCase() === cleanEntityName.toLowerCase())
        );

        if (!linkedMitra) {
          linkedMitra = {
            id: defaultMitraId,
            kode: this.db.mitra.some((m) => m.kode === defaultMitraKode)
              ? `${defaultMitraKode}-${rek.kode.slice(-2)}`
              : defaultMitraKode,
            nama: cleanEntityName,
            role: 'ANAK_PERUSAHAAN',
            telepon: '-',
            alamat: 'Anak Perusahaan PT. Wijaya Agro Perkasa',
            status: rek.status || 'AKTIF',
            isAnakPerusahaan: true,
            kodeRekeningTerkait: rek.kode,
            catatan: `Anak Perusahaan PT. Wijaya Agro Perkasa — Terhubung langsung ke Rekening ${rek.kode} (Otomatis 1 Transaksi Terpadu)`,
          };
          this.db.mitra.push(linkedMitra);
        } else {
          linkedMitra.isAnakPerusahaan = true;
          linkedMitra.kodeRekeningTerkait = rek.kode;
          if (linkedMitra.role !== 'KARYAWAN') {
            linkedMitra.role = 'ANAK_PERUSAHAAN';
          }
          linkedMitra.status = rek.status || linkedMitra.status || 'AKTIF';
          if (!linkedMitra.catatan) {
            linkedMitra.catatan = `Anak Perusahaan PT. Wijaya Agro Perkasa — Terhubung langsung ke Rekening ${rek.kode}`;
          }
        }

        rek.idMitraTerkait = linkedMitra.id;
        rek.namaMitraTerkait = linkedMitra.nama;
      }
    }

    // Enrich any transferRekening touching an Anak Perusahaan account with unified Mitra metadata
    const anakRekMap = new Map(
      this.db.rekening
        .filter((r) => r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN')
        .map((r) => [r.kode, r])
    );
    for (const trf of this.db.transferRekening) {
      const srcAnak = anakRekMap.get(trf.rekeningSumber);
      const dstAnak = anakRekMap.get(trf.rekeningTujuan);
      if (srcAnak && dstAnak) {
        trf.idMitraTerkait = dstAnak.idMitraTerkait;
        trf.namaMitraTerkait = `${srcAnak.namaMitraTerkait || srcAnak.nama} -> ${dstAnak.namaMitraTerkait || dstAnak.nama}`;
        trf.tipeMutasiAfiliasi = 'ANTAR_ANAK_PERUSAHAAN';
      } else if (dstAnak) {
        trf.idMitraTerkait = dstAnak.idMitraTerkait;
        trf.namaMitraTerkait = dstAnak.namaMitraTerkait || dstAnak.nama;
        trf.tipeMutasiAfiliasi = 'SIMPAN_KE_ANAK_PERUSAHAAN';
      } else if (srcAnak) {
        trf.idMitraTerkait = srcAnak.idMitraTerkait;
        trf.namaMitraTerkait = srcAnak.namaMitraTerkait || srcAnak.nama;
        trf.tipeMutasiAfiliasi = 'TARIK_DARI_ANAK_PERUSAHAAN';
      }
    }

    // 1. Produk <-> KategoriProduk <-> StokBarang
    const katSet = new Set(
      this.db.kategoriProduk.map((k) => String(k.nama || '').trim().replace(/\s+/g, ' ').toUpperCase())
    );
    const ensureKat = (rawKat: string) => {
      const clean = String(rawKat || '').trim().replace(/\s+/g, ' ').toUpperCase() || 'LAINNYA';
      if (!katSet.has(clean)) {
        katSet.add(clean);
        this.db.kategoriProduk!.push({
          nama: clean,
          deskripsi: '',
          createdAt: nowIso,
        });
      }
      return clean;
    };

    // Normalize product & stock codes to uppercase trimmed canonical form
    for (const p of this.db.produk) {
      p.kode = String(p.kode || '').trim().toUpperCase();
    }
    for (const s of this.db.stokBarang) {
      s.kode = String(s.kode || '').trim().toUpperCase();
    }

    const produkMap = new Map(this.db.produk.map((p) => [p.kode, p]));
    const stokMap = new Map(this.db.stokBarang.map((s) => [s.kode, s]));

    // Recover any sold/purchased product code missing from master produk
    for (const pj of this.db.penjualan) {
      for (const it of pj.items || []) {
        const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
        if (cleanKode) it.kodeProduk = cleanKode;
        if (cleanKode && !produkMap.has(cleanKode)) {
          const recovered = {
            kode: cleanKode,
            kategori: ensureKat('LAINNYA'),
            nama: it.namaProduk || cleanKode,
            satuan: it.satuan || 'SAK',
            hargaBeli: it.hargaBeli || 0,
            hargaJual: it.harga || 0,
            hargaKhususRekanan: it.harga || 0,
            status: 'AKTIF' as const,
          };
          this.db.produk.push(recovered);
          produkMap.set(recovered.kode, recovered);
        }
      }
    }

    for (const pb of this.db.pembelianBarang) {
      for (const it of pb.items || []) {
        const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
        if (cleanKode) it.kodeProduk = cleanKode;
        if (cleanKode && cleanKode !== 'REKAP-NOTA' && !produkMap.has(cleanKode)) {
          const modalBeli = Math.max(0, Number(it.hargaBeliSatuan) || 0);
          const recovered = {
            kode: cleanKode,
            kategori: ensureKat('LAINNYA'),
            nama: it.namaProduk || cleanKode,
            satuan: it.satuan || 'SAK',
            hargaBeli: modalBeli,
            hargaJual: modalBeli,
            hargaKhususRekanan: modalBeli,
            status: 'AKTIF' as const,
          };
          this.db.produk.push(recovered);
          produkMap.set(recovered.kode, recovered);
        }
      }
    }

    // Sync every Produk -> KategoriProduk & StokBarang
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
          updateTerakhir: nowIso,
        };
        this.db.stokBarang.push(createdStok);
        stokMap.set(p.kode, createdStok);
      } else {
        s.namaProduk = p.nama;
        s.satuan = p.satuan;
      }
    }

    // If StokBarang has an orphan item not in Produk, ensure Produk master exists
    for (const s of this.db.stokBarang) {
      if (s.kode && !produkMap.has(s.kode)) {
        const createdProd = {
          kode: s.kode,
          kategori: ensureKat('LAINNYA'),
          nama: s.namaProduk || s.kode,
          satuan: s.satuan || 'SAK',
          hargaBeli: 0,
          hargaJual: 0,
          hargaKhususRekanan: 0,
          status: 'AKTIF' as const,
        };
        this.db.produk.push(createdProd);
        produkMap.set(s.kode, createdProd);
      }
    }

    // Strip legacy hardcoded dummy prices on 0-stock items that have never been purchased, sold, or manually edited
    const purchasedCodes = new Set<string>();
    for (const pb of this.db.pembelianBarang) {
      for (const it of pb.items || []) {
        if (it.kodeProduk && it.kodeProduk !== 'REKAP-NOTA') {
          purchasedCodes.add(String(it.kodeProduk).trim().toUpperCase());
        }
      }
    }
    const soldCodes = new Set<string>();
    for (const pj of this.db.penjualan) {
      for (const it of pj.items || []) {
        if (it.kodeProduk) {
          soldCodes.add(String(it.kodeProduk).trim().toUpperCase());
        }
      }
    }
    const manualEditedCodes = new Set<string>();
    for (const log of this.db.auditLogs || []) {
      const txId = String(log.idTransaksi || '').trim().toUpperCase();
      if (txId.startsWith('PRD-')) {
        manualEditedCodes.add(txId.slice(4));
      }
    }

    for (const p of this.db.produk) {
      const st = stokMap.get(p.kode);
      const currentStok = st?.stok || 0;
      const legacyTuple = LEGACY_DUMMY_PRODUK_PRICES[p.kode];
      if (
        legacyTuple &&
        currentStok === 0 &&
        !purchasedCodes.has(p.kode) &&
        !soldCodes.has(p.kode) &&
        !manualEditedCodes.has(p.kode) &&
        p.hargaBeli === legacyTuple[0] &&
        p.hargaJual === legacyTuple[1] &&
        (p.hargaKhususRekanan || 0) === legacyTuple[2]
      ) {
        p.hargaBeli = 0;
        p.hargaJual = 0;
        p.hargaKhususRekanan = 0;
      }
    }

    const purchasedHbCodes = new Set<string>();
    for (const phb of this.db.pembelianHasilBumi || []) {
      if (phb.komoditasKode) {
        purchasedHbCodes.add(String(phb.komoditasKode).trim().toUpperCase());
      }
    }
    for (const hb of this.db.stokHasilBumi || []) {
      const cleanHbKode = String(hb.kode || '').trim().toUpperCase();
      const legacyHbPrice = LEGACY_DUMMY_HASIL_BUMI_PRICES[cleanHbKode];
      if (
        legacyHbPrice !== undefined &&
        (hb.stok || 0) === 0 &&
        !purchasedHbCodes.has(cleanHbKode) &&
        hb.hargaBeliStandar === legacyHbPrice
      ) {
        hb.hargaBeliStandar = 0;
      }
    }

    // Sync canonical product name & unit into transaction line items for consistent reporting
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
        if (it.kodeProduk !== 'REKAP-NOTA') {
          const prod = produkMap.get(it.kodeProduk);
          if (prod) {
            it.namaProduk = prod.nama;
            it.satuan = prod.satuan;
          }
        }
      }
    }

    // 2. Karyawan <-> Mitra (1 Akun Terpadu: Karyawan juga bisa jadi Mitra) <-> UpahHarian & Penggajian
    const normIdentity = (val?: string) =>
      String(val || '')
        .replace(/\s*\((karyawan|mitra)\)\s*/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    for (const kry of this.db.karyawan) {
      const expectedMitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const cleanNama = String(kry.nama || '').replace(/\s*\(Karyawan\)$/i, '').trim();
      kry.nama = cleanNama;
      const targetNorm = normIdentity(cleanNama);

      // Cari seluruh kandidat Mitra yang merujuk ke orang yang sama (baik yang dibuat sbg KARYAWAN maupun MITRA_TANI/CUSTOMER/ALL)
      const matchingMitras = this.db.mitra.filter((m) => {
        if (m.isAnakPerusahaan || m.role === 'ANAK_PERUSAHAAN') return false;
        if (m.id === expectedMitraId) return true;
        if (m.idKaryawanTerkait && m.idKaryawanTerkait === kry.id) return true;
        if (kry.nik && m.kode === kry.nik) return true;
        if (targetNorm && normIdentity(m.nama) === targetNorm) return true;
        return false;
      });

      let mtr = matchingMitras[0];

      // Jika pernah terbuat lebih dari 1 akun Mitra untuk karyawan yang sama (misal 1 sbg Petani & 1 sbg Karyawan), satukan otomatis!
      if (matchingMitras.length > 1) {
        // Prioritaskan Mitra yang sudah punya transaksi panen/bon atau yang ditunjuk idMitraTerkait
        const hasTx = (mid: string) =>
          (this.db.pembelianHasilBumi || []).some((x) => x.idMitra === mid) ||
          (this.db.penjualan || []).some((x) => x.idMitra === mid) ||
          (this.db.kasbonUang || []).some((x) => x.idMitra === mid) ||
          (this.db.bayarBon || []).some((x) => x.idMitra === mid) ||
          (this.db.pencairanTitipan || []).some((x) => x.idMitra === mid);

        matchingMitras.sort((a, b) => {
          const scoreA = (hasTx(a.id) ? 10 : 0) + (a.id === expectedMitraId ? 5 : 0);
          const scoreB = (hasTx(b.id) ? 10 : 0) + (b.id === expectedMitraId ? 5 : 0);
          return scoreB - scoreA;
        });

        mtr = matchingMitras[0];
        const duplicateIds = new Set(matchingMitras.slice(1).map((d) => d.id));

        if (duplicateIds.size > 0) {
          const relinkList = (arr?: Array<{ idMitra?: string; namaMitra?: string }>) => {
            for (const tx of arr || []) {
              if (tx.idMitra && duplicateIds.has(tx.idMitra)) {
                tx.idMitra = mtr!.id;
                tx.namaMitra = cleanNama;
              }
            }
          };
          relinkList(this.db.penjualan);
          relinkList(this.db.penjualanHasilBumi);
          relinkList(this.db.pembelianHasilBumi);
          relinkList(this.db.pembelianBarang);
          relinkList(this.db.kasbonUang);
          relinkList(this.db.bayarBon);
          relinkList(this.db.pencairanTitipan);
          for (const trf of this.db.transferRekening || []) {
            if (trf.idMitraTerkait && duplicateIds.has(trf.idMitraTerkait)) {
              trf.idMitraTerkait = mtr.id;
              trf.namaMitraTerkait = cleanNama;
            }
          }
          this.db.mitra = this.db.mitra.filter((m) => !duplicateIds.has(m.id));
        }
      }

      if (!mtr) {
        mtr = {
          id: expectedMitraId,
          kode: kry.nik || kry.id,
          nama: cleanNama,
          role: 'KARYAWAN',
          telepon: kry.telepon || '-',
          alamat: kry.alamat || '-',
          status: kry.status || 'AKTIF',
          isKaryawan: true,
          idKaryawanTerkait: kry.id,
          catatan: `Karyawan: ${kry.jabatan || 'Staff'} (Divisi ${kry.divisi || kry.departemen || 'Gudang'})`,
        };
        this.db.mitra.push(mtr);
      } else {
        kry.idMitraTerkait = mtr.id;
        mtr.nama = cleanNama;
        mtr.role = 'KARYAWAN';
        mtr.isKaryawan = true;
        mtr.idKaryawanTerkait = kry.id;
        mtr.status = kry.status || mtr.status || 'AKTIF';
        if (kry.telepon && kry.telepon !== '-' && kry.telepon !== 'KARYAWAN') mtr.telepon = kry.telepon;
        if (kry.alamat && kry.alamat !== '-') mtr.alamat = kry.alamat;
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

    // 3. Mitra <-> All 6 Transaction Tables (recover orphan IDs & unify namaMitra)
    const mitraMap = new Map(this.db.mitra.map((m) => [m.id, m]));

    const syncTxMitra = (
      tx: { idMitra?: string; namaMitra?: string },
      defaultRole: Mitra['role']
    ) => {
      if (!tx.idMitra || tx.idMitra === 'UMUM') return;
      const existing = mitraMap.get(tx.idMitra);
      if (existing) {
        tx.namaMitra = existing.nama;
      } else {
        const cleanRecoveredName = (tx.namaMitra || tx.idMitra).replace(/\s*\(Karyawan\)$/i, '').trim();
        const recoveredMitra: Mitra = {
          id: tx.idMitra,
          kode: tx.idMitra.slice(0, 10).toUpperCase(),
          nama: cleanRecoveredName,
          role: defaultRole,
          telepon: '-',
          alamat: '-',
          status: 'AKTIF',
          catatan: 'Dipulihkan otomatis dari histori transaksi terpadu',
        };
        this.db.mitra.push(recoveredMitra);
        mitraMap.set(recoveredMitra.id, recoveredMitra);
        tx.namaMitra = recoveredMitra.nama;
      }
    };

    for (const p of this.db.penjualan) syncTxMitra(p, 'CUSTOMER');
    for (const jhb of this.db.penjualanHasilBumi || []) syncTxMitra(jhb, 'CUSTOMER');
    for (const pb of this.db.pembelianHasilBumi) syncTxMitra(pb, 'MITRA_TANI');
    for (const pbb of this.db.pembelianBarang) syncTxMitra(pbb, 'SUPPLIER');
    for (const k of this.db.kasbonUang) syncTxMitra(k, 'MITRA_TANI');
    for (const b of this.db.bayarBon) syncTxMitra(b, 'MITRA_TANI');
    for (const pt of this.db.pencairanTitipan) syncTxMitra(pt, 'MITRA_TANI');
  }

  /**
   * Synchronize Virtual Accounts BON01 (Kasbon/Piutang Customer) and TIT01 (Titip Panen & Hutang Supplier)
   * Uses the exact per-mitra formula as RekapMasterMitra & RekeningKoranMitra so all modules match 100%.
   */
  public synchronizeVirtualAccounts() {
    const totalKasbonBarang =
      (this.db.penjualan || [])
        .filter((p) => p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + Math.max(0, p.sisaPiutang || 0), 0) +
      (this.db.penjualanHasilBumi || [])
        .filter((j) => j.metodePembayaran === 'PIUTANG' && j.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, j) => sum + Math.max(0, j.sisaPiutang || 0), 0);

    const totalKasbonUang = (this.db.kasbonUang || [])
      .filter((k) => k.status !== 'LUNAS')
      .reduce((sum, k) => sum + Math.max(0, k.sisaKasbon || 0), 0);

    const totalBon = totalKasbonBarang + totalKasbonUang;

    // Collect all mitra IDs present in mitra or payable transactions
    const mitraIds = new Set<string>(this.db.mitra.map((m) => m.id));
    for (const p of this.db.pembelianHasilBumi || []) {
      if (p.idMitra && p.metodePembayaran === 'TITIP') mitraIds.add(p.idMitra);
    }
    for (const pb of this.db.pembelianBarang || []) {
      if (pb.idMitra && pb.metodePembayaran === 'HUTANG') mitraIds.add(pb.idMitra);
    }

    let totalTitip = 0;
    for (const mId of mitraIds) {
      const titipPanenKotor = (this.db.pembelianHasilBumi || [])
        .filter((p) => p.idMitra === mId && p.metodePembayaran === 'TITIP')
        .reduce((sum, p) => sum + (p.totalNominal || 0), 0);

      const hutangKulakanKotor = (this.db.pembelianBarang || [])
        .filter((pb) => pb.idMitra === mId && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
        .reduce((sum, pb) => sum + (pb.totalNominal || 0), 0);

      const pencairanMitra = (this.db.pencairanTitipan || [])
        .filter((pt) => pt.idMitra === mId)
        .reduce((sum, pt) => sum + (pt.nominalPencairan || 0), 0);

      totalTitip += Math.max(0, titipPanenKotor + hutangKulakanKotor - pencairanMitra);
    }

    const bon01 = this.db.rekening.find((r) => r.kode === 'BON01');
    if (bon01) {
      bon01.saldoSaatIni = totalBon;
    }

    const tit01 = this.db.rekening.find((r) => r.kode === 'TIT01');
    if (tit01) {
      tit01.saldoSaatIni = totalTitip;
    }

    const totalSinkronVolume = (this.db.bayarBon || [])
      .filter(
        (b) =>
          b.metode === 'SINKRON' ||
          b.metode === 'KOMPENSASI_TITIP' ||
          b.rekeningTujuan === 'SINKRON' ||
          b.rekeningTujuan === 'KOMPENSASI_TITIP' ||
          Boolean(b.isKompensasiTitipan)
      )
      .reduce((sum, b) => sum + Math.max(0, b.nominalBayar || 0), 0);

    const sinkronRek = this.db.rekening.find((r) => r.kode === 'SINKRON');
    if (sinkronRek) {
      sinkronRek.saldoSaatIni = totalSinkronVolume;
    }

    // Sinkronkan seluruh Buku Arus Kas Operasional Divisi (REK-GWA, REK-CVA, REK-WAP, REK-OKU, REK-WK, REK-WT, REK-BRILINK, dll.)
    this.synchronizeDivisiAccounts();
  }

  /**
   * Pastikan setiap nama divisi memiliki entri di db.divisi dan Rekening OPERASIONAL_DIVISI (saldoAwal = 0)
   */
  public ensureDivisiRegisteredInMemory(rawNama?: string): ItemDivisi | null {
    const trimmed = String(rawNama || '').trim();
    if (!trimmed) return null;

    if (!Array.isArray(this.db.divisi)) this.db.divisi = [];

    const existingList = this.getDivisiList();
    let found = existingList.find((d) => d.nama.toLowerCase() === trimmed.toLowerCase());

    if (!found) {
      const cleanCode = trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      const id = `DIV-${cleanCode || Date.now().toString().slice(-6)}`;
      const kodeRekening = `REK-${cleanCode || Date.now().toString().slice(-6)}`;
      found = {
        id,
        nama: trimmed,
        kodeRekening,
        penanggungJawab: `Koordinator ${trimmed}`,
        deskripsi: `Unit kerja & buku arus kas divisi ${trimmed}`,
        isCustom: true,
      };
      this.db.divisi.push(found);
    }

    if (!this.db.rekening.some((r) => r.kode === found!.kodeRekening)) {
      this.db.rekening.push({
        kode: found.kodeRekening,
        nama: `Buku Arus Kas ${found.nama}`,
        atasNama: `Divisi ${found.nama}`,
        nomorRekening: found.id,
        saldoAwal: 0,
        saldoSaatIni: 0,
        status: 'AKTIF',
        isVirtual: false,
        kategori: 'OPERASIONAL_DIVISI',
        rekeningIndukPenyimpan: 'KAS01',
        keterangan: `Buku tracking arus kas masuk/keluar operasional divisi ${found.nama}`,
      });
    }

    return found;
  }

  /**
   * Synchronize Operational Division Cashflow Accounts (OPERASIONAL_DIVISI):
   * Otomatis menambah saldo divisi saat Penjualan (Tunai/Transfer) & Pelunasan Bon Barang (Tunai/Transfer),
   * serta mengurangi saldo divisi saat Pembelian/Kulakan (Tunai/Transfer), Biaya Operasional, dan Upah Karyawan.
   */
  public synchronizeDivisiAccounts() {
    const norm = (s?: string) => String(s || '').trim().toLowerCase();

    // Pastikan divisi standar tambahan seperti BRILink dan seluruh divisi yang dipakai di transaksi terdaftar
    this.ensureDivisiRegisteredInMemory('BRILink');
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

    // Lookup map untuk melacak divisi asal nota saat pelunasan bon barang secara Tunai/Transfer
    const penjualanDivisiMap = new Map<string, string>();
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

      // 1. ARUS MASUK DIVISI (+)
      // a) Penjualan Kasir / Toko (misal: Beras, Pupuk, Sembako) via TUNAI atau TRANSFER
      const masukPenjualanToko = (this.db.penjualan || [])
        .filter(
          (p) =>
            p.divisi &&
            norm(p.divisi) === targetNorm &&
            (p.metode === 'TUNAI' || p.metode === 'TRANSFER') &&
            (p.totalNominal || 0) > 0
        )
        .reduce((sum, p) => sum + (Number(p.totalNominal) || 0), 0);

      // b) Penjualan Hasil Bumi ke Pabrik / Pembeli via TUNAI atau TRANSFER
      const masukPenjualanHasilBumi = (this.db.penjualanHasilBumi || [])
        .filter(
          (j) =>
            j.divisi &&
            norm(j.divisi) === targetNorm &&
            (j.metodePembayaran === 'TUNAI' || j.metodePembayaran === 'TRANSFER') &&
            (j.totalNominal || 0) > 0
        )
        .reduce((sum, j) => sum + (Number(j.totalNominal) || 0), 0);

      // c) Pelunasan Bon / Piutang Barang via TUNAI atau TRANSFER atas nota milik divisi ini
      let masukPelunasanPiutangDivisi = 0;
      for (const b of this.db.bayarBon || []) {
        if (b.metode !== 'TUNAI' && b.metode !== 'TRANSFER') continue;
        if (b.isKompensasiTitipan || b.isPotongGaji) continue;
        for (const alok of b.alokasi || []) {
          if (alok.jenis === 'KASBON_BARANG' && (alok.nominalDibayar || 0) > 0) {
            const asalDivisi = penjualanDivisiMap.get(alok.refId);
            if (asalDivisi && asalDivisi === targetNorm) {
              masukPelunasanPiutangDivisi += Number(alok.nominalDibayar) || 0;
            }
          }
        }
      }

      // d) Dropping Kas / Transfer Masuk ke Rekening Divisi
      const masukDropping = (this.db.transferRekening || [])
        .filter((t) => t.status === 'BERHASIL' && t.rekeningTujuan === div.kodeRekening)
        .reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);

      const totalMasukDivisi =
        masukPenjualanToko +
        masukPenjualanHasilBumi +
        masukPelunasanPiutangDivisi +
        masukDropping;

      // 2. ARUS KELUAR DIVISI (-)
      // a) Pembelian / Kulakan Barang Dagang via TUNAI atau TRANSFER
      const keluarPembelianBarang = (this.db.pembelianBarang || [])
        .filter(
          (pb) =>
            pb.divisi &&
            norm(pb.divisi) === targetNorm &&
            (pb.metodePembayaran === 'TUNAI' || pb.metodePembayaran === 'TRANSFER') &&
            (pb.totalNominal || 0) > 0
        )
        .reduce((sum, pb) => sum + (Number(pb.totalNominal) || 0), 0);

      // b) Pembelian Hasil Bumi dari Petani (sudah putus harga & dibayar TUNAI / TRANSFER)
      const keluarPembelianHasilBumi = (this.db.pembelianHasilBumi || [])
        .filter(
          (phb) =>
            phb.divisi &&
            norm(phb.divisi) === targetNorm &&
            phb.komoditasKode !== 'PINJAMAN_DANA' &&
            phb.komoditasKode !== 'TITIP_DANA' &&
            !String(phb.komoditasNama || '').toLowerCase().includes('pinjaman uang') &&
            !phb.isBelumPutusHarga &&
            (phb.metodePembayaran === 'TUNAI' || phb.metodePembayaran === 'TRANSFER') &&
            phb.rekeningSumber !== 'TIT01' &&
            phb.rekeningSumber !== 'BON01' &&
            (phb.totalNominal || 0) > 0
        )
        .reduce((sum, phb) => sum + (Number(phb.totalNominal) || 0), 0);

      // c) Biaya Operasional Divisi
      const keluarOperasional = (this.db.pengeluaran || [])
        .filter((p) =>
          p.divisi ? norm(p.divisi) === targetNorm : p.rekeningSumber === div.kodeRekening
        )
        .reduce((sum, p) => sum + (Number(p.nominal) || 0), 0);

      // d) Pembayaran Gaji / Upah Karyawan Divisi
      const keluarGaji = (this.db.penggajian || [])
        .filter((g) =>
          g.divisi ? norm(g.divisi) === targetNorm : g.rekeningSumber === div.kodeRekening
        )
        .reduce((sum, g) => sum + (Number(g.gajiBersihDibayar) || 0), 0);

      // e) Transfer Keluar dari Rekening Divisi
      const keluarTransfer = (this.db.transferRekening || [])
        .filter((t) => t.status === 'BERHASIL' && t.rekeningSumber === div.kodeRekening)
        .reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);

      const totalKeluarDivisi =
        keluarPembelianBarang +
        keluarPembelianHasilBumi +
        keluarOperasional +
        keluarGaji +
        keluarTransfer;

      rek.saldoSaatIni = Math.round(
        (Number(rek.saldoAwal) || 0) + totalMasukDivisi - totalKeluarDivisi
      );
    }
  }

  /**
   * Real-time Database & Cross-Module Integration Status Report
   */
  public getIntegrityStatus(): DatabaseIntegrityStatus {
    const supStatus = supabaseSyncEngine.getStatus();
    const stokCodes = new Set((this.db.stokBarang || []).map((s) => s.kode));
    const produkStokMatched = (this.db.produk || []).every((p) => stokCodes.has(p.kode));

    const mitraIds = new Set((this.db.mitra || []).map((m) => m.id));
    const karyawanMitraMatched = (this.db.karyawan || []).every(
      (k) => k.idMitraTerkait && mitraIds.has(k.idMitraTerkait)
    );

    const bon01Saldo = this.db.rekening.find((r) => r.kode === 'BON01')?.saldoSaatIni || 0;
    const tit01Saldo = this.db.rekening.find((r) => r.kode === 'TIT01')?.saldoSaatIni || 0;

    const calcBon =
      (this.db.penjualan || [])
        .filter((p) => p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((s, p) => s + Math.max(0, p.sisaPiutang || 0), 0) +
      (this.db.penjualanHasilBumi || [])
        .filter((j) => j.metodePembayaran === 'PIUTANG' && j.statusPembayaran === 'BELUM_BAYAR')
        .reduce((s, j) => s + Math.max(0, j.sisaPiutang || 0), 0) +
      (this.db.kasbonUang || [])
        .filter((k) => k.status !== 'LUNAS')
        .reduce((s, k) => s + Math.max(0, k.sisaKasbon || 0), 0);

    const bon01Reconciled = Math.abs(bon01Saldo - calcBon) < 1;

    let calcTitip = 0;
    for (const m of this.db.mitra || []) {
      const tk = (this.db.pembelianHasilBumi || [])
        .filter((p) => p.idMitra === m.id && p.metodePembayaran === 'TITIP')
        .reduce((s, p) => s + (p.totalNominal || 0), 0);
      const hk = (this.db.pembelianBarang || [])
        .filter((pb) => pb.idMitra === m.id && pb.metodePembayaran === 'HUTANG' && pb.status !== 'LUNAS')
        .reduce((s, pb) => s + (pb.totalNominal || 0), 0);
      const pc = (this.db.pencairanTitipan || [])
        .filter((pt) => pt.idMitra === m.id)
        .reduce((s, pt) => s + (pt.nominalPencairan || 0), 0);
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
      totalRecords: 0,
    };
    counts.totalRecords =
      counts.produk +
      counts.kategoriProduk +
      counts.stokBarang +
      counts.stokHasilBumi +
      counts.mitra +
      counts.karyawan +
      counts.rekening +
      counts.penjualan +
      counts.pembelianBarang +
      counts.pembelianHasilBumi +
      counts.penjualanHasilBumi +
      counts.pencairanTitipan +
      counts.kasbonUang +
      counts.bayarBon +
      counts.pengeluaran +
      counts.transferRekening +
      counts.upahHarian +
      counts.penggajian +
      counts.auditLogs;

    const anakPerusahaanMitraMatched = (this.db.rekening || [])
      .filter((r) => r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN')
      .every((r) => Boolean(r.idMitraTerkait && mitraIds.has(r.idMitraTerkait)));

    return {
      singleSource: supStatus.configured ? 'SUPABASE_CLOUD' : 'LOCAL_WAITING_CONFIG',
      supabaseConfigured: supStatus.configured,
      supabaseUrlMasked: supStatus.url,
      lastSyncTime: supStatus.lastSyncTime,
      lastSyncStatus: supStatus.lastSyncStatus,
      lastSyncMessage: supStatus.lastSyncMessage,
      isHealthy:
        produkStokMatched &&
        karyawanMitraMatched &&
        anakPerusahaanMitraMatched &&
        bon01Reconciled &&
        tit01Reconciled,
      counts,
      checks: {
        produkStokMatched,
        karyawanMitraMatched,
        anakPerusahaanMitraMatched,
        bon01Reconciled,
        tit01Reconciled,
        bon01Saldo,
        tit01Saldo,
      },
    };
  }

  /**
   * Get all registered divisions (defaults + custom from database)
   */
  public getDivisiList(): ItemDivisi[] {
    const custom = this.db.divisi || [];
    const map = new Map<string, ItemDivisi>();

    // 1. Initial defaults
    DAFTAR_DIVISI.forEach((d) => {
      map.set(d.nama.toLowerCase(), {
        id: d.id,
        nama: d.nama,
        kodeRekening: d.kodeRekening,
        penanggungJawab: d.penanggungJawab,
        deskripsi: d.deskripsi,
        logoUrl: d.logoUrl,
        isCustom: false,
      });
    });

    // 2. Saved profile overrides & custom divisions
    custom.forEach((c) => {
      const existingDefault = Array.from(map.values()).find(
        (d) => d.id === c.id || d.nama.toLowerCase() === c.nama.toLowerCase()
      );
      if (existingDefault) {
        map.set(existingDefault.nama.toLowerCase(), {
          ...existingDefault,
          penanggungJawab:
            c.penanggungJawab !== undefined ? c.penanggungJawab : existingDefault.penanggungJawab,
          deskripsi: c.deskripsi !== undefined ? c.deskripsi : existingDefault.deskripsi,
          logoUrl: c.logoUrl !== undefined ? c.logoUrl : existingDefault.logoUrl,
          isCustom: false,
        });
      } else {
        map.set(c.nama.toLowerCase(), {
          id: c.id,
          nama: c.nama,
          kodeRekening: c.kodeRekening,
          penanggungJawab: c.penanggungJawab,
          deskripsi: c.deskripsi,
          logoUrl: c.logoUrl,
          isCustom: true,
        });
      }
    });

    return Array.from(map.values());
  }

  /**
   * Add a new division dynamically and provision its tracking account
   */
  public async addDivisi(
    nama: string,
    deskripsi?: string,
    penanggungJawab?: string,
    logoUrl?: string
  ): Promise<ItemDivisi> {
    return await this.executeTransaction((db) => {
      if (!db.divisi) db.divisi = [];
      const trimmed = nama.trim();
      const existing = this.getDivisiList().find(
        (d) => d.nama.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) {
        return existing;
      }

      const cleanCode = trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
      const id = `DIV-${cleanCode || Date.now().toString().slice(-6)}`;
      const kodeRekening = `REK-${cleanCode || Date.now().toString().slice(-6)}`;

      const newDivisi: ItemDivisi = {
        id,
        nama: trimmed,
        kodeRekening,
        penanggungJawab: penanggungJawab || `Koordinator ${trimmed}`,
        deskripsi: deskripsi || `Unit kerja operasional & pengeluaran ${trimmed}`,
        logoUrl: logoUrl || undefined,
        isCustom: true,
      };

      db.divisi.push(newDivisi);

      // Create matching operational tracking account if not exists
      if (!db.rekening.some((r) => r.kode === kodeRekening)) {
        db.rekening.push({
          kode: kodeRekening,
          nama: `Buku Operasional ${trimmed}`,
          atasNama: `Divisi ${trimmed}`,
          nomorRekening: id,
          saldoAwal: 0,
          saldoSaatIni: 0,
          status: 'AKTIF',
          isVirtual: false,
          kategori: 'OPERASIONAL_DIVISI',
          rekeningIndukPenyimpan: 'KAS01',
          keterangan: `Buku tracking operasional dan biaya divisi ${trimmed}`,
        });
      }

      return newDivisi;
    });
  }

  /**
   * Update profile & logo for any core or custom division (synced automatically to Cloud Supabase)
   */
  public async updateDivisiProfil(params: {
    idOrNama: string;
    penanggungJawab?: string;
    deskripsi?: string;
    logoUrl?: string;
  }): Promise<ItemDivisi> {
    return await this.executeTransaction((db) => {
      if (!db.divisi) db.divisi = [];
      const key = params.idOrNama.trim().toLowerCase();
      const currentList = this.getDivisiList();
      const target = currentList.find(
        (d) => d.id.toLowerCase() === key || d.nama.toLowerCase() === key
      );
      if (!target) {
        throw new Error(`Divisi "${params.idOrNama}" tidak ditemukan.`);
      }

      const existingIdx = db.divisi.findIndex(
        (c) => c.id === target.id || c.nama.toLowerCase() === target.nama.toLowerCase()
      );

      const updatedItem: ItemDivisi = {
        id: target.id,
        nama: target.nama,
        kodeRekening: target.kodeRekening,
        penanggungJawab:
          params.penanggungJawab !== undefined
            ? params.penanggungJawab.trim()
            : target.penanggungJawab,
        deskripsi:
          params.deskripsi !== undefined ? params.deskripsi.trim() : target.deskripsi,
        logoUrl: params.logoUrl !== undefined ? params.logoUrl : target.logoUrl,
        isCustom: Boolean(target.isCustom),
      };

      if (existingIdx >= 0) {
        db.divisi[existingIdx] = updatedItem;
      } else {
        db.divisi.push(updatedItem);
      }

      const now = getWIBDateTime();
      if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
      db.auditLogs.unshift({
        id: `AUD-${Date.now()}`,
        timestamp: now.iso,
        tanggal: now.tanggal,
        jam: now.jam,
        user: 'Admin / Kasir',
        jenisTransaksi: 'UPDATE',
        idTransaksi: target.id,
        rekeningTerkait: target.kodeRekening,
        nominal: 0,
        detail: `Pembaruan profil & logo Divisi: ${target.nama}`,
      });

      return updatedItem;
    });
  }

  /**
   * Reset / Clean slate: empty all transactions, partners, and employees
   * ready to be filled with real company data. Keeps master items & accounts.
   */
  public async resetAllData(): Promise<void> {
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
          user: 'Admin/Owner',
          jenisTransaksi: 'VOID',
          idTransaksi: 'SYS-CLEAN-DATA',
          detail: 'Seluruh data transaksi, mitra, dan karyawan telah dikosongkan. Siap diinput dengan data riil PT. WIJAYA AGRO PERKASA.',
          nominal: 0,
        },
      ];
    });
  }

  /**
   * Transactional lock execution wrapper with automatic relational reconciliation & non-blocking background sync to Supabase
   */
  public async executeTransaction<T>(action: (db: DatabaseSchema) => T): Promise<T> {
    while (this.isWriting) {
      await new Promise((res) => setTimeout(res, 5));
    }
    this.isWriting = true;
    try {
      const result = action(this.db);
      this.reconcileRelationalIntegrity();
      this.synchronizeVirtualAccounts();
      this.saveDirect(this.db);
      const syncWaitMs = process.env.VERCEL || process.env.NETLIFY ? 8000 : 1800;
      await supabaseSyncEngine.flushSync(this.db, syncWaitMs);
      return result;
    } finally {
      this.isWriting = false;
    }
  }
}

export const dbManager = new DatabaseManager();
