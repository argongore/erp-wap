import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DAFTAR_DIVISI,
  DAFTAR_24_ITEM_PENGELUARAN,
  DEFAULT_PT_LOGO_URL,
  KATEGORI_ALAT_DEFAULT_DESC,
  getNomorUrutItemPengeluaran,
  isKategoriAlatNonStok,
  isProdukTanpaStok,
  isExcludedFromDivisi,
  isTanpaDivisi,
  normalizeRoleMitra,
  resolveKelompokItemPengeluaran,
} from './types.ts';
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
  TransaksiBrilink,
  TransaksiUangMasuk,
  ItemDivisi,
  ItemKategoriProduk,
  CatatanCashOpname,
  DatabaseIntegrityStatus,
  ItemInventaris,
  MasterItemPengeluaran,
  InvoiceSuratJalanRecord,
} from './types.ts';
import { supabaseSyncEngine } from './supabase.ts';
import { calculateHbMovingAverage } from '../utils/hasilBumiMovingAverage.ts';

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
  brilink?: TransaksiBrilink[];
  uangMasuk?: TransaksiUangMasuk[];
  auditLogs: AuditLog[];
  divisi?: ItemDivisi[];
  kategoriProduk?: ItemKategoriProduk[];
  cashOpnameLogs?: CatatanCashOpname[];
  inventaris?: ItemInventaris[];
  masterItemPengeluaran?: MasterItemPengeluaran[];
  suratJalan?: InvoiceSuratJalanRecord[];
  deletedHasilBumiKodes?: string[];
  deletedMasterPengeluaranNames?: string[];
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
      saldoAwal: 0,
      saldoSaatIni: 0,
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
      saldoAwal: 0,
      saldoSaatIni: 0,
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
      saldoAwal: 0,
      saldoSaatIni: 0,
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
      saldoAwal: 0,
      saldoSaatIni: 0,
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
      saldoAwal: 0,
      saldoSaatIni: 0,
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
      saldoAwal: 0,
      saldoSaatIni: 0,
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
    { kode: 'PRD-11', nama: 'PASIR m2', satuan: 'METER KUBIK', kategori: 'MATERIAL' },
    { kode: 'PRD-12', nama: 'KORAL M2', satuan: 'METER KUBIK', kategori: 'MATERIAL' },
    { kode: 'PRD-13', nama: 'BATU UJM', satuan: 'METER KUBIK', kategori: 'MATERIAL' },
    { kode: 'PRD-14', nama: 'SPLIT', satuan: 'METER KUBIK', kategori: 'MATERIAL' },
    { kode: 'PRD-15', nama: 'BATA', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-16', nama: 'KARUNG', satuan: 'Lembar', kategori: 'LAINNYA' },
    { kode: 'PRD-17', nama: 'PAPAN', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-18', nama: 'KASAU', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-19', nama: 'BALOK 7x14', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-20', nama: 'BALOK 8X12', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-21', nama: 'SPANEL 4M', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-22', nama: 'SPANEL 2M', satuan: 'BIJI/BUAH', kategori: 'MATERIAL' },
    { kode: 'PRD-23', nama: 'UREA', satuan: 'SAK', kategori: 'PUPUK' },
    { kode: 'PRD-24', nama: 'NPK', satuan: 'SAK', kategori: 'PUPUK' },
    { kode: 'PRD-25', nama: 'SOLAR', satuan: 'DRIGENT', kategori: 'BBM' },
    { kode: 'PRD-26', nama: 'DEXLITE', satuan: 'DRIGENT', kategori: 'BBM' },
    { kode: 'PRD-27', nama: 'KOPI ROBUSTA MENTAH', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-28', nama: 'ROBUSTA PREMIUM MENTAH', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-29', nama: 'ROBUSTA LANANG MENTAH', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-30', nama: 'KOPI ROBUSTA ROSTING', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-31', nama: 'ROBUSTA PREMIUM ROSTING', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-32', nama: 'ROBUSTA LANANG ROSTING', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-33', nama: 'KOPI ROBUSTA BUBUK', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-34', nama: 'ROBUSTA PREMIUM BUBUK', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-35', nama: 'ROBUSTA LANANG BUBUK', satuan: 'KEMASAN', kategori: 'OKUSSA' },
    { kode: 'PRD-6838', nama: 'SEWA EXCA 1', satuan: 'JAM', kategori: 'ALAT' },
    { kode: 'PRD-6839', nama: 'SEWA EXCA 2', satuan: 'JAM', kategori: 'ALAT' },
    { kode: 'PRD-6840', nama: 'SEWA TRUCK', satuan: 'TRIP', kategori: 'ALAT' },
    { kode: 'PRD-6841', nama: 'SEWA DUMP', satuan: 'RIT', kategori: 'ALAT' },
    { kode: 'PRD-6842', nama: 'SEWA TOING', satuan: 'TRIP', kategori: 'ALAT' },
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
    brilink: [],
    uangMasuk: [],
    inventaris: [],
    masterItemPengeluaran: [],
    suratJalan: [],
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
          penjualanHasilBumi: Array.isArray(parsed.penjualanHasilBumi) ? parsed.penjualanHasilBumi : [],
          kasbonUang: Array.isArray(parsed.kasbonUang) ? parsed.kasbonUang : [],
          bayarBon: Array.isArray(parsed.bayarBon) ? parsed.bayarBon : [],
          transferRekening: Array.isArray(parsed.transferRekening) ? parsed.transferRekening : [],
          pengeluaran: Array.isArray(parsed.pengeluaran) ? parsed.pengeluaran : [],
          pencairanTitipan: Array.isArray(parsed.pencairanTitipan) ? parsed.pencairanTitipan : [],
          brilink: Array.isArray(parsed.brilink) ? parsed.brilink : [],
          uangMasuk: Array.isArray(parsed.uangMasuk) ? parsed.uangMasuk : [],
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
          divisi: Array.isArray(parsed.divisi) ? parsed.divisi : [],
          kategoriProduk: Array.isArray(parsed.kategoriProduk) ? parsed.kategoriProduk : [],
          cashOpnameLogs: Array.isArray(parsed.cashOpnameLogs) ? parsed.cashOpnameLogs : [],
          inventaris: Array.isArray(parsed.inventaris) ? parsed.inventaris : [],
          masterItemPengeluaran: Array.isArray(parsed.masterItemPengeluaran) ? parsed.masterItemPengeluaran : [],
          suratJalan: Array.isArray(parsed.suratJalan) ? parsed.suratJalan : [],
          deletedHasilBumiKodes: Array.isArray(parsed.deletedHasilBumiKodes) ? parsed.deletedHasilBumiKodes : [],
          deletedMasterPengeluaranNames: Array.isArray(parsed.deletedMasterPengeluaranNames)
            ? parsed.deletedMasterPengeluaranNames
            : [],
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

        // Ensure all 1 to 8 Hasil Bumi items exist as foundational system master unless explicitly deleted by user
        const deletedHbSet = new Set(
          (merged.deletedHasilBumiKodes || []).map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
        );
        for (const defHb of defaultHasilBumi) {
          if (deletedHbSet.has(defHb.kode.toUpperCase()) || deletedHbSet.has(defHb.nama.trim().toUpperCase())) {
            continue;
          }
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

      // Persist to workspace root data/wijaya_agro_erp.json as durable local backup
      try {
        const legacyDir = path.dirname(LEGACY_DB_FILE);
        if (!fs.existsSync(legacyDir)) {
          fs.mkdirSync(legacyDir, { recursive: true });
        }
        fs.writeFileSync(LEGACY_DB_FILE, jsonStr, 'utf-8');
      } catch (legacyWriteErr) {
        // Non-blocking
      }

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

  private mergeListById<T>(
    localList: T[] | undefined,
    incomingList: T[] | undefined,
    getId: (item: T) => string
  ): T[] {
    const local = Array.isArray(localList) ? localList : [];
    const incoming = Array.isArray(incomingList) ? incomingList : [];
    const map = new Map<string, T>();

    const getItemTime = (it: any): number => {
      if (!it) return 0;
      const raw =
        it.updateTerakhir ||
        it.terakhirUpdate ||
        it.updatedAt ||
        it.createdAt ||
        it.timestamp ||
        0;
      return new Date(raw).getTime() || 0;
    };

    // 1. First put incoming items from cloud
    for (const item of incoming) {
      if (item) {
        const id = getId(item);
        if (id) {
          map.set(id, item);
        }
      }
    }

    // 2. Put local items: if an item exists locally but not in incoming, PRESERVE IT!
    // If it exists in both, prefer local if local has newer or equal mutation
    for (const item of local) {
      if (item) {
        const id = getId(item);
        if (id) {
          const existing = map.get(id);
          if (!existing) {
            map.set(id, item);
          } else {
            // CRITICAL INVENTORY GUARD: If local has stokAwal or active stock and incoming is blank, preserve local stock data!
            const localObj = item as any;
            const incObj = existing as any;
            if (localObj.stokAwal && !incObj.stokAwal) {
              incObj.stokAwal = localObj.stokAwal;
              incObj.modalAwalTotal = incObj.modalAwalTotal || localObj.modalAwalTotal;
              incObj.rataRataModalAwal = incObj.rataRataModalAwal || localObj.rataRataModalAwal;
              incObj.keteranganStokAwal = incObj.keteranganStokAwal || localObj.keteranganStokAwal;
              incObj.tanggalInputStokAwal = incObj.tanggalInputStokAwal || localObj.tanggalInputStokAwal;
            }
            if ((localObj.stok || 0) > 0 && (incObj.stok || 0) === 0 && !incObj.stokAwal) {
              incObj.stok = localObj.stok;
            }

            const incomingTime = getItemTime(existing);
            const localTime = getItemTime(item);
            if (localTime >= incomingTime) {
              map.set(id, item);
            }
          }
        }
      }
    }

    return Array.from(map.values());
  }

  private applyIncomingSnapshot(incoming: DatabaseSchema) {
    this.db.profilPerusahaan = incoming.profilPerusahaan || this.db.profilPerusahaan;
    this.db.rekening =
      Array.isArray(incoming.rekening) && incoming.rekening.length > 0 ? incoming.rekening : this.db.rekening;

    this.db.mitra = this.mergeListById(this.db.mitra, incoming.mitra, (m) => m.kode || m.id);
    this.db.karyawan = this.mergeListById(this.db.karyawan, incoming.karyawan, (k) => k.nik || k.id);
    this.db.upahHarian = this.mergeListById(this.db.upahHarian, incoming.upahHarian, (u) => u.id);
    this.db.penggajian = this.mergeListById(this.db.penggajian, incoming.penggajian, (p) => p.id);
    this.db.produk = this.mergeListById(this.db.produk, incoming.produk, (pr) => pr.kode);
    this.db.kategoriProduk = this.mergeListById(
      this.db.kategoriProduk,
      incoming.kategoriProduk,
      (kp) => (kp as any).kode || (kp as any).id || kp.nama
    );
    this.db.stokBarang = this.mergeListById(this.db.stokBarang, incoming.stokBarang, (sb) => sb.kode);
    this.db.stokHasilBumi = this.mergeListById(
      this.db.stokHasilBumi,
      incoming.stokHasilBumi,
      (sh) => sh.kode
    );

    this.db.penjualan = this.mergeListById(this.db.penjualan, incoming.penjualan, (p) => p.noPenjualan || (p as any).id);
    this.db.pembelianBarang = this.mergeListById(
      this.db.pembelianBarang,
      incoming.pembelianBarang,
      (pb) => pb.noPembelian || (pb as any).id
    );
    this.db.pembelianHasilBumi = this.mergeListById(
      this.db.pembelianHasilBumi,
      incoming.pembelianHasilBumi,
      (ph) => ph.noPembelian || (ph as any).id
    );
    this.db.penjualanHasilBumi = this.mergeListById(
      this.db.penjualanHasilBumi,
      incoming.penjualanHasilBumi,
      (pjh) => pjh.noPenjualan || (pjh as any).id
    );
    this.db.kasbonUang = this.mergeListById(this.db.kasbonUang, incoming.kasbonUang, (kb) => kb.idTransaksi || (kb as any).id);
    this.db.bayarBon = this.mergeListById(this.db.bayarBon, incoming.bayarBon, (bb) => bb.idTransaksi || (bb as any).id);
    this.db.transferRekening = this.mergeListById(
      this.db.transferRekening,
      incoming.transferRekening,
      (tr) => tr.noTransfer || (tr as any).id
    );
    this.db.pengeluaran = this.mergeListById(this.db.pengeluaran, incoming.pengeluaran, (pe) => pe.idTransaksi || (pe as any).id);
    this.db.pencairanTitipan = this.mergeListById(
      this.db.pencairanTitipan,
      incoming.pencairanTitipan,
      (pt) => pt.idPencairan || (pt as any).id
    );
    this.db.brilink = this.mergeListById(this.db.brilink, incoming.brilink, (br) => br.idTransaksi || (br as any).id);
    this.db.uangMasuk = this.mergeListById(this.db.uangMasuk, incoming.uangMasuk, (um) => um.idTransaksi || (um as any).id);
    this.db.auditLogs = this.mergeListById(this.db.auditLogs, incoming.auditLogs, (al) => al.id);
    this.db.divisi = this.mergeListById(this.db.divisi, incoming.divisi, (d) => (d as any).kode || d.id || d.nama);
    this.db.cashOpnameLogs = this.mergeListById(this.db.cashOpnameLogs, incoming.cashOpnameLogs, (co) => co.id);
    this.db.inventaris = this.mergeListById(this.db.inventaris, incoming.inventaris, (inv) => inv.id || inv.kode);
    this.db.masterItemPengeluaran = this.mergeListById(
      this.db.masterItemPengeluaran,
      incoming.masterItemPengeluaran,
      (mi) => mi.id || mi.nama
    );

    this.db.suratJalan = this.mergeListById(
      this.db.suratJalan,
      incoming.suratJalan,
      (sj) => sj.noInvoice || sj.id
    ).sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    this.db.deletedHasilBumiKodes = Array.isArray(incoming.deletedHasilBumiKodes)
      ? incoming.deletedHasilBumiKodes
      : (this.db.deletedHasilBumiKodes || []);
    this.db.deletedMasterPengeluaranNames = Array.isArray(incoming.deletedMasterPengeluaranNames)
      ? incoming.deletedMasterPengeluaranNames
      : (this.db.deletedMasterPengeluaranNames || []);
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
      db.brilink = [];
      db.uangMasuk = [];
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
    if (!Array.isArray(this.db.brilink)) this.db.brilink = [];
    if (!Array.isArray(this.db.uangMasuk)) this.db.uangMasuk = [];
    if (!Array.isArray(this.db.auditLogs)) this.db.auditLogs = [];
    if (!Array.isArray(this.db.divisi)) this.db.divisi = [];
    if (!Array.isArray(this.db.cashOpnameLogs)) this.db.cashOpnameLogs = [];
    if (!Array.isArray(this.db.inventaris)) this.db.inventaris = [];
    if (!Array.isArray(this.db.masterItemPengeluaran)) this.db.masterItemPengeluaran = [];

    // Pastikan 24 Item Pengeluaran baku (1-16 Hijau Inventaris & 17-24 Oranye Biasa) selalu tersedia & berurutan rapi
    const legacyUnusedNames = new Set([
      'BBM SOLAR & PELUMAS',
      'SPAREPART & PERBAIKAN ARMADA',
      'KONSUMSI KARYAWAN',
      'OPERASIONAL GUDANG',
      'BONGKAR MUAT & LAPANGAN',
      'LISTRIK, AIR & INTERNET',
      'ATK & KANTOR',
      'LAIN-LAIN',
    ]);
    const usedKategoriUpper = new Set(
      (this.db.pengeluaran || [])
        .map((ex) => String(ex.kategori || '').trim().toUpperCase())
        .filter(Boolean)
    );

    if (!Array.isArray(this.db.deletedMasterPengeluaranNames)) {
      this.db.deletedMasterPengeluaranNames = [];
    }
    const deletedPengeluaranSet = new Set(
      this.db.deletedMasterPengeluaranNames
        .map((n) => String(n || '').replace(/\s+/g, '').toUpperCase())
        .filter(Boolean)
    );

    // Bersihkan item placeholder lama yang belum pernah dipakai transaksi & item yang sengaja dihapus user
    this.db.masterItemPengeluaran = (this.db.masterItemPengeluaran || []).filter((m) => {
      const uName = String(m.nama || '').trim().toUpperCase();
      const uCompact = uName.replace(/\s+/g, '');
      if (!uName) return false;
      if (deletedPengeluaranSet.has(uCompact)) return false;
      if (legacyUnusedNames.has(uName) && !usedKategoriUpper.has(uName)) {
        return false;
      }
      return true;
    });

    // Sinkronkan 24 item baku (No. 1 s/d 24) kecuali yang telah dihapus user
    for (const def of DAFTAR_24_ITEM_PENGELUARAN) {
      const defCompact = def.nama.replace(/\s+/g, '').toUpperCase();
      if (deletedPengeluaranSet.has(defCompact)) {
        continue;
      }
      const existing = this.db.masterItemPengeluaran.find(
        (m) =>
          m.nama.trim().toUpperCase() === def.nama.toUpperCase() ||
          m.nama.replace(/\s+/g, '').toUpperCase() === defCompact
      );
      if (existing) {
        existing.nomorUrut = def.nomorUrut;
        existing.kelompok = def.kelompok;
        existing.isSystemDefault = true;
        if (!existing.satuanDefault && def.satuanDefault) {
          existing.satuanDefault = def.satuanDefault;
        }
        if (!existing.deskripsi) {
          existing.deskripsi = def.deskripsi;
        }
      } else {
        this.db.masterItemPengeluaran.push({
          id: def.kode,
          kode: def.kode,
          nama: def.nama,
          kelompok: def.kelompok,
          nomorUrut: def.nomorUrut,
          satuanDefault: def.satuanDefault,
          deskripsi: def.deskripsi,
          isSystemDefault: true,
          createdAt: nowIso,
        });
      }
    }

    const expItemNameSet = new Set(
      this.db.masterItemPengeluaran.map((m) => m.nama.replace(/\s+/g, '').toUpperCase())
    );
    for (const ex of this.db.pengeluaran) {
      const kName = String(ex.kategori || '').trim();
      const kCompact = kName.replace(/\s+/g, '').toUpperCase();
      if (kName && !expItemNameSet.has(kCompact) && !deletedPengeluaranSet.has(kCompact)) {
        expItemNameSet.add(kCompact);
        const cleanSlug =
          kName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() ||
          Date.now().toString().slice(-4);
        this.db.masterItemPengeluaran.push({
          id: `EXP-${cleanSlug}`,
          kode: `EXP-${cleanSlug}`,
          nama: kName,
          kelompok: resolveKelompokItemPengeluaran(kName, ex.kelompokPengeluaran),
          nomorUrut: getNomorUrutItemPengeluaran(kName),
          deskripsi: 'Item pengeluaran terdaftar otomatis dari riwayat transaksi',
          createdAt: nowIso,
        });
      }
    }

    // Pastikan setiap item memiliki kelompok ('INVENTARIS' / 'BIASA') dan urutkan No. 1..24 terlebih dahulu
    for (const m of this.db.masterItemPengeluaran) {
      m.nomorUrut = getNomorUrutItemPengeluaran(m.nama) ?? m.nomorUrut;
      m.kelompok = resolveKelompokItemPengeluaran(m.nama, m.kelompok);
    }
    this.db.masterItemPengeluaran.sort((a, b) => {
      const ua = a.nomorUrut ?? 999;
      const ub = b.nomorUrut ?? 999;
      if (ua !== ub) return ua - ub;
      if (a.kelompok !== b.kelompok) return a.kelompok === 'INVENTARIS' ? -1 : 1;
      return a.nama.localeCompare(b.nama);
    });

    // Ensure BON01, TIT01, SINKRON, and KAS01 always exist in rekening
    const defaultRekening = getDefaultRekeningList();
    for (const reqCode of ['KAS01', 'BON01', 'TIT01', 'SINKRON']) {
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


    // Pastikan DP Parabot maupun TANPA_DIVISI bukan Divisi dan tidak memiliki akun OPERASIONAL_DIVISI
    this.db.divisi = (this.db.divisi || []).filter(
      (d) =>
        !isExcludedFromDivisi(d.nama) &&
        !isExcludedFromDivisi(d.id) &&
        !isTanpaDivisi(d.nama) &&
        !isTanpaDivisi(d.id)
    );
    this.db.rekening = (this.db.rekening || []).filter(
      (r) =>
        !(
          r.kategori === 'OPERASIONAL_DIVISI' &&
          !r.isAnakPerusahaan &&
          (isExcludedFromDivisi(r.nama) ||
            isExcludedFromDivisi(r.kode) ||
            isTanpaDivisi(r.nama) ||
            isTanpaDivisi(r.kode))
        )
    );
    const normalizeExcludedDivisi = <T extends { divisi?: string }>(list?: T[]) => {
      for (const tx of list || []) {
        if (tx.divisi && isExcludedFromDivisi(tx.divisi)) {
          tx.divisi = 'PT Wijaya Agro Perkasa';
        }
      }
    };
    normalizeExcludedDivisi(this.db.penjualan);
    normalizeExcludedDivisi(this.db.penjualanHasilBumi);
    normalizeExcludedDivisi(this.db.pembelianBarang);
    normalizeExcludedDivisi(this.db.pembelianHasilBumi);
    normalizeExcludedDivisi(this.db.pengeluaran);
    normalizeExcludedDivisi(this.db.brilink);
    normalizeExcludedDivisi(this.db.upahHarian);
    normalizeExcludedDivisi(this.db.penggajian);

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
    for (const br of this.db.brilink || []) {
      if (br.rekeningAdmin) usedRekCodes.add(br.rekeningAdmin);
      if (br.rekeningBank) usedRekCodes.add(br.rekeningBank);
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
          deskripsi: clean === 'ALAT' ? KATEGORI_ALAT_DEFAULT_DESC : '',
          tanpaStok: isKategoriAlatNonStok(clean),
          createdAt: nowIso,
        });
      }
      return clean;
    };

    // Pastikan kategori bawaan ALAT (sewa jasa tanpa stok) selalu tersedia di Master Produk & Kasir
    if (!katSet.has('ALAT')) {
      katSet.add('ALAT');
      this.db.kategoriProduk.push({
        nama: 'ALAT',
        deskripsi: KATEGORI_ALAT_DEFAULT_DESC,
        tanpaStok: true,
        createdAt: nowIso,
      });
    } else {
      const alatKat = this.db.kategoriProduk.find(
        (k) => String(k.nama || '').trim().replace(/\s+/g, ' ').toUpperCase() === 'ALAT'
      );
      if (alatKat) {
        if (!alatKat.deskripsi) alatKat.deskripsi = KATEGORI_ALAT_DEFAULT_DESC;
        if (alatKat.tanpaStok === undefined) alatKat.tanpaStok = true;
      }
    }

    // Normalize product & stock codes to uppercase trimmed canonical form
    for (const p of this.db.produk) {
      p.kode = String(p.kode || '').trim().toUpperCase();
    }
    for (const s of this.db.stokBarang) {
      s.kode = String(s.kode || '').trim().toUpperCase();
    }

    const produkMap = new Map(this.db.produk.map((p) => [p.kode, p]));
    const stokMap = new Map(this.db.stokBarang.map((s) => [s.kode, s]));

    // Recover any sold/purchased product code missing from master produk (skip Nota Silang intermediary items)
    for (const pj of this.db.penjualan) {
      if (pj.isNotaSilang) continue;
      for (const it of pj.items || []) {
        const cleanKode = String(it.kodeProduk || '').trim().toUpperCase();
        if (cleanKode) it.kodeProduk = cleanKode;
        if (cleanKode && cleanKode !== 'NOTA-SILANG' && !produkMap.has(cleanKode)) {
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
      const isNonStok = isProdukTanpaStok(p, this.db.kategoriProduk);
      if (p.tanpaStok === undefined && isNonStok) {
        p.tanpaStok = true;
      }
      const s = stokMap.get(p.kode);
      if (!s) {
        const createdStok: StokBarang = {
          kode: p.kode,
          namaProduk: p.nama,
          satuan: p.satuan,
          kategori: p.kategori,
          tanpaStok: isNonStok,
          stok: 0,
          minimum: isNonStok ? 0 : 10,
          updateTerakhir: nowIso,
        };
        this.db.stokBarang.push(createdStok);
        stokMap.set(p.kode, createdStok);
      } else {
        s.namaProduk = p.nama;
        s.satuan = p.satuan;
        s.kategori = p.kategori;
        s.tanpaStok = isNonStok;
        if (isNonStok) {
          s.minimum = 0;
        }
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

    // Pastikan kategori baku sistem selalu terdaftar rapi di Master Kategori Produk
    const standardCategories: Array<{ nama: string; deskripsi?: string; tanpaStok?: boolean }> = [
      { nama: 'MATERIAL', deskripsi: 'Material konstruksi & bangunan (pasir, koral, batu, split, bata, kayu/balok)' },
      { nama: 'BERAS', deskripsi: 'Katalog beras & sembako pokok' },
      { nama: 'PUPUK', deskripsi: 'Pupuk pertanian (Urea, NPK)' },
      { nama: 'BBM', deskripsi: 'Bahan Bakar Minyak (Solar, Dexlite)' },
      { nama: 'OKUSSA', deskripsi: 'Produk Okussa Coffee & Olahan Kopi' },
      { nama: 'ALAT', deskripsi: KATEGORI_ALAT_DEFAULT_DESC, tanpaStok: true },
      { nama: 'LAINNYA', deskripsi: 'Perlengkapan umum toko & karung' },
    ];
    for (const std of standardCategories) {
      const existing = this.db.kategoriProduk.find(
        (k) => String(k.nama || '').trim().replace(/\s+/g, ' ').toUpperCase() === std.nama
      );
      if (!existing) {
        this.db.kategoriProduk.push({
          nama: std.nama,
          deskripsi: std.deskripsi,
          tanpaStok: std.tanpaStok,
          createdAt: nowIso,
        });
        katSet.add(std.nama);
      } else {
        if (!existing.deskripsi && std.deskripsi) existing.deskripsi = std.deskripsi;
        if (std.tanpaStok && existing.tanpaStok === undefined) existing.tanpaStok = true;
      }
    }

    // 1.A. Pemulihan & Rekonsiliasi Master Produk & Stok Barang Toko
    // Memastikan seluruh produk yang sudah diperbaiki user (SEWA EXCA, SEWA TRUCK, SEWA DUMP, SEWA TOING, KARUNG, PASIR, MATERIAL, BERAS, PUPUK, BBM, OKUSSA)
    // pulih sepenuhnya dan tidak pernah hilang/ter-reset kategori atau stoknya
    const userCustomProducts: Record<
      string,
      {
        nama: string;
        kategori: string;
        satuan: string;
        hargaBeli: number;
        hargaJual: number;
        hargaKhususRekanan: number;
        stok: number;
      }
    > = {
      // 1. MATERIAL
      'PRD-11': {
        nama: 'PASIR m2',
        kategori: 'MATERIAL',
        satuan: 'METER KUBIK',
        hargaBeli: 50000,
        hargaJual: 360000,
        hargaKhususRekanan: 355000,
        stok: 18, // 19 awal + 5 beli di PB2611045219 - 6 terjual
      },
      'PRD-12': {
        nama: 'KORAL M2',
        kategori: 'MATERIAL',
        satuan: 'METER KUBIK',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-13': {
        nama: 'BATU UJM',
        kategori: 'MATERIAL',
        satuan: 'METER KUBIK',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-14': {
        nama: 'SPLIT',
        kategori: 'MATERIAL',
        satuan: 'METER KUBIK',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-15': {
        nama: 'BATA',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-17': {
        nama: 'PAPAN',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-18': {
        nama: 'KASAU',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-19': {
        nama: 'BALOK 7x14',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-20': {
        nama: 'BALOK 8X12',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-21': {
        nama: 'SPANEL 4M',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-22': {
        nama: 'SPANEL 2M',
        kategori: 'MATERIAL',
        satuan: 'BIJI/BUAH',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },

      // 2. BERAS
      'PRD-09': {
        nama: 'BERAS BELITANG',
        kategori: 'BERAS',
        satuan: 'SAK',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-10': {
        nama: 'BERAS JEMPOL',
        kategori: 'BERAS',
        satuan: 'SAK',
        hargaBeli: 0,
        hargaJual: 165000,
        hargaKhususRekanan: 162000,
        stok: 110, // Opname 126 - 16 terjual
      },

      // 3. PUPUK
      'PRD-23': {
        nama: 'UREA',
        kategori: 'PUPUK',
        satuan: 'SAK',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-24': {
        nama: 'NPK',
        kategori: 'PUPUK',
        satuan: 'SAK',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },

      // 4. BBM
      'PRD-25': {
        nama: 'SOLAR',
        kategori: 'BBM',
        satuan: 'DRIGENT',
        hargaBeli: 0,
        hargaJual: 370000,
        hargaKhususRekanan: 370000,
        stok: 0,
      },
      'PRD-26': {
        nama: 'DEXLITE',
        kategori: 'BBM',
        satuan: 'DRIGENT',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },

      // 5. OKUSSA
      'PRD-1260': {
        nama: 'BUBUK OKUSSA COFFEE 250 GRAM',
        kategori: 'OKUSSA',
        satuan: 'Pack',
        hargaBeli: 0,
        hargaJual: 25000,
        hargaKhususRekanan: 25000,
        stok: 6, // 10 - 4 terjual
      },
      'PRD-1663': {
        nama: 'TUKAR BUBUK KOPI',
        kategori: 'OKUSSA',
        satuan: 'Bungkus',
        hargaBeli: 0,
        hargaJual: 10000,
        hargaKhususRekanan: 10000,
        stok: 0,
      },
      'PRD-27': {
        nama: 'KOPI ROBUSTA MENTAH',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-28': {
        nama: 'ROBUSTA PREMIUM MENTAH',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-29': {
        nama: 'ROBUSTA LANANG MENTAH',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 30000,
        hargaKhususRekanan: 25000,
        stok: 0,
      },
      'PRD-30': {
        nama: 'KOPI ROBUSTA ROSTING',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 35000,
        hargaKhususRekanan: 30000,
        stok: 0,
      },
      'PRD-31': {
        nama: 'ROBUSTA PREMIUM ROSTING',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-32': {
        nama: 'ROBUSTA LANANG ROSTING',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-33': {
        nama: 'KOPI ROBUSTA BUBUK',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-34': {
        nama: 'ROBUSTA PREMIUM BUBUK',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },
      'PRD-35': {
        nama: 'ROBUSTA LANANG BUBUK',
        kategori: 'OKUSSA',
        satuan: 'KEMASAN',
        hargaBeli: 0,
        hargaJual: 0,
        hargaKhususRekanan: 0,
        stok: 0,
      },

      // 6. ALAT (Jasa / Sewa Armada & Alat Berat tanpa stok fisik)
      'PRD-6838': {
        nama: 'SEWA EXCA 1',
        kategori: 'ALAT',
        satuan: 'JAM',
        hargaBeli: 0,
        hargaJual: 600000,
        hargaKhususRekanan: 600000,
        stok: 0,
      },
      'PRD-6839': {
        nama: 'SEWA EXCA 2',
        kategori: 'ALAT',
        satuan: 'JAM',
        hargaBeli: 0,
        hargaJual: 600000,
        hargaKhususRekanan: 600000,
        stok: 0,
      },
      'PRD-6840': {
        nama: 'SEWA TRUCK',
        kategori: 'ALAT',
        satuan: 'TRIP',
        hargaBeli: 0,
        hargaJual: 8000000,
        hargaKhususRekanan: 8000000,
        stok: 0,
      },
      'PRD-6841': {
        nama: 'SEWA DUMP',
        kategori: 'ALAT',
        satuan: 'RIT',
        hargaBeli: 0,
        hargaJual: 450000,
        hargaKhususRekanan: 450000,
        stok: 0,
      },
      'PRD-6842': {
        nama: 'SEWA TOING',
        kategori: 'ALAT',
        satuan: 'TRIP',
        hargaBeli: 0,
        hargaJual: 500000,
        hargaKhususRekanan: 500000,
        stok: 0,
      },

      // 7. LAINNYA
      'PRD-16': {
        nama: 'KARUNG',
        kategori: 'LAINNYA',
        satuan: 'Lembar',
        hargaBeli: 0,
        hargaJual: 3000,
        hargaKhususRekanan: 3000,
        stok: 87, // Opname 100 - 13 terjual
      },
    };

    for (const [k, custom] of Object.entries(userCustomProducts)) {
      const isAlat = custom.kategori === 'ALAT';
      let p = produkMap.get(k);
      if (!p) {
        p = {
          kode: k,
          nama: custom.nama,
          kategori: ensureKat(custom.kategori),
          satuan: custom.satuan,
          hargaBeli: custom.hargaBeli,
          hargaJual: custom.hargaJual,
          hargaKhususRekanan: custom.hargaKhususRekanan,
          tanpaStok: isAlat,
          status: 'AKTIF',
        };
        this.db.produk.push(p);
        produkMap.set(k, p);
      } else {
        p.nama = custom.nama;
        p.kategori = ensureKat(custom.kategori);
        p.satuan = custom.satuan;
        if (isAlat) {
          p.tanpaStok = true;
        }
        if (custom.hargaJual > 0) p.hargaJual = custom.hargaJual;
        if (custom.hargaKhususRekanan > 0) p.hargaKhususRekanan = custom.hargaKhususRekanan;
        if (custom.hargaBeli > 0) p.hargaBeli = custom.hargaBeli;
      }

      let s = stokMap.get(k);
      if (!s) {
        s = {
          kode: k,
          namaProduk: custom.nama,
          satuan: custom.satuan,
          kategori: custom.kategori,
          tanpaStok: isAlat,
          stok: isAlat ? 0 : custom.stok,
          minimum: isAlat ? 0 : 10,
          updateTerakhir: nowIso,
        };
        this.db.stokBarang.push(s);
        stokMap.set(k, s);
      } else {
        s.namaProduk = custom.nama;
        s.kategori = custom.kategori;
        s.satuan = custom.satuan;
        s.tanpaStok = isAlat;
        if (isAlat) {
          s.minimum = 0;
          s.stok = 0;
        } else if (custom.stok > 0) {
          s.stok = custom.stok;
        }
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

    // 1.B. Rekonsiliasi & Pemulihan Integritas Stok Hasil Bumi (Stok Awal Gudang + Pembelian - Penjualan)
    // Cegah stok lama hilang akibat restart dev server atau sinkronisasi cloud
    const knownInitialStocks: Record<
      string,
      {
        stokAwal: number;
        modalAwalTotal: number;
        rataRataModalAwal: number;
        keteranganStokAwal: string;
        tanggalInputStokAwal: string;
      }
    > = {
      'HB-01': {
        stokAwal: 6390.5,
        modalAwalTotal: 328925426,
        rataRataModalAwal: 51471,
        keteranganStokAwal: 'Rekap stok manual gudang sebelum aplikasi',
        tanggalInputStokAwal: '03/11/2026',
      },
      'HB-03': {
        stokAwal: 13282.8,
        modalAwalTotal: 231434432,
        rataRataModalAwal: 17423,
        keteranganStokAwal: 'Rekap stok manual gudang sebelum aplikasi',
        tanggalInputStokAwal: '03/11/2026',
      },
      'HB-09': {
        stokAwal: 1264.8,
        modalAwalTotal: 28685664,
        rataRataModalAwal: 22680,
        keteranganStokAwal: 'Rekap stok manual gudang sebelum aplikasi',
        tanggalInputStokAwal: '03/11/2026',
      },
    };

    // Cari juga jika ada catatan audit log terkait stok awal hasil bumi
    const auditAwalMap = new Map<string, { stokAwal: number; modalTotal: number; harga: number }>();
    for (const log of this.db.auditLogs || []) {
      const match = String(log.detail || '').match(/Stok Awal\s+([0-9.]+)\s*Kg\s*@\s*Rp\s*([0-9.]+)/i);
      const code = String(log.idTransaksi || '').trim().toUpperCase();
      if (match && code.startsWith('HB-')) {
        const kg = parseFloat(match[1]);
        const harga = parseFloat(match[2].replace(/\./g, ''));
        if (kg > 0 && !auditAwalMap.has(code)) {
          auditAwalMap.set(code, {
            stokAwal: kg,
            harga,
            modalTotal: Number(log.nominal) || Math.round(kg * harga),
          });
        }
      }
    }

    // Rekonsiliasi setiap komoditas hasil bumi
    for (const hb of this.db.stokHasilBumi || []) {
      const kUp = String(hb.kode || '').trim().toUpperCase();

      // 1. Inisialisasi Stok Awal HANYA jika belum terdefinisi / null / 0
      if (hb.stokAwal === undefined || hb.stokAwal === null) {
        if (knownInitialStocks[kUp]) {
          const init = knownInitialStocks[kUp];
          hb.stokAwal = init.stokAwal;
          hb.modalAwalTotal = init.modalAwalTotal;
          hb.rataRataModalAwal = init.rataRataModalAwal;
          hb.keteranganStokAwal = hb.keteranganStokAwal || init.keteranganStokAwal;
          hb.tanggalInputStokAwal = hb.tanggalInputStokAwal || init.tanggalInputStokAwal;
        } else if (auditAwalMap.has(kUp)) {
          const rec = auditAwalMap.get(kUp)!;
          hb.stokAwal = rec.stokAwal;
          hb.modalAwalTotal = rec.modalTotal;
          hb.rataRataModalAwal = rec.harga;
          hb.keteranganStokAwal = hb.keteranganStokAwal || 'Rekap stok manual gudang sebelum aplikasi';
          hb.tanggalInputStokAwal = hb.tanggalInputStokAwal || '03/11/2026';
        } else {
          // Cari dari catatan penjualan hasil bumi pertama yang memiliki stokGudangSebelum
          const saleWithStokSebelum = (this.db.penjualanHasilBumi || [])
            .filter((j) => (j.komoditasKode === hb.kode || j.komoditasNama === hb.nama) && Number(j.stokGudangSebelum) > 0)
            .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())[0];
          if (saleWithStokSebelum && Number(saleWithStokSebelum.stokGudangSebelum) > 0) {
            const beliSebelum = (this.db.pembelianHasilBumi || [])
              .filter(
                (p) =>
                  (p.komoditasKode === hb.kode || p.komoditasNama === hb.nama) &&
                  new Date(p.createdAt || 0).getTime() < new Date(saleWithStokSebelum.createdAt || 0).getTime()
              )
              .reduce((s, p) => s + (Number(p.beratBersih) || 0), 0);
            const impliedAwal = Math.max(
              0,
              Math.round((Number(saleWithStokSebelum.stokGudangSebelum) - beliSebelum) * 100) / 100
            );
            if (impliedAwal > 0) {
              hb.stokAwal = impliedAwal;
              hb.keteranganStokAwal = 'Rekap stok manual gudang sebelum aplikasi';
              hb.tanggalInputStokAwal = '03/11/2026';
              if (saleWithStokSebelum.modalRataRataPerKg) {
                hb.rataRataModalAwal = Math.round(Number(saleWithStokSebelum.modalRataRataPerKg));
                hb.modalAwalTotal = Math.round(impliedAwal * hb.rataRataModalAwal);
              }
            }
          }
        }
      }

      // Pastikan integritas matematis stok awal & modal awal
      const sAwal = Number(hb.stokAwal) || 0;
      if (sAwal > 0) {
        let rAwal = Number(hb.rataRataModalAwal) || 0;
        let mAwal = Number(hb.modalAwalTotal) || 0;

        // Auto-heal jika rAwal atau mAwal sempat rusak/anjlok drastis akibat bug sebelumnya
        if (knownInitialStocks[kUp] && (rAwal < 5000 || mAwal < sAwal * 5000)) {
          rAwal = knownInitialStocks[kUp].rataRataModalAwal;
          mAwal = Math.round(sAwal * rAwal);
        } else if (rAwal > 0 && (mAwal <= 0 || Math.abs(mAwal - Math.round(sAwal * rAwal)) > sAwal * 100)) {
          mAwal = Math.round(sAwal * rAwal);
        } else if (mAwal > 0 && rAwal <= 0) {
          rAwal = Math.round(mAwal / sAwal);
        }

        hb.rataRataModalAwal = rAwal;
        hb.modalAwalTotal = mAwal;
      }

      // 2. Hitung persis stok ready gudang saat ini & modal rata-rata berjalan (Rolling Moving Average Siklus Muat)
      const movingAvg = calculateHbMovingAverage(
        hb,
        this.db.pembelianHasilBumi,
        this.db.penjualanHasilBumi
      );

      hb.stok = movingAvg.stokReadyKg;
      if (movingAvg.rataRataModalTerkini > 0) {
        hb.hargaBeliStandar = movingAvg.rataRataModalTerkini;
        // PENTING: JANGAN PERNAH menimpa hb.rataRataModalAwal atau hb.modalAwalTotal di sini!
        // rataRataModalAwal dan modalAwalTotal adalah modal masa lalu dari stok awal, bukan sisa stok terkini.
      }
    }

    // Sync canonical product name & unit into transaction line items for consistent reporting
    for (const pj of this.db.penjualan) {
      if (pj.isNotaSilang) continue;
      for (const it of pj.items || []) {
        if (it.kodeProduk === 'NOTA-SILANG') continue;
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
      kry.gajiPokok = 0;
      kry.tunjanganTetap = 0;
      if (!Array.isArray(kry.riwayatDivisi)) {
        kry.riwayatDivisi = [];
      }
      if (isExcludedFromDivisi(kry.divisi) || isExcludedFromDivisi(kry.departemen)) {
        kry.divisi = 'PT Wijaya Agro Perkasa';
        kry.departemen = 'PT Wijaya Agro Perkasa';
      }
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
          fotoUrl: kry.fotoUrl,
          isKaryawan: true,
          idKaryawanTerkait: kry.id,
          catatan: `Karyawan & Mitra: ${kry.jabatan || 'Staff'} (Divisi ${kry.divisi || kry.departemen || 'Gudang Wijaya Agro'})`,
        };
        this.db.mitra.push(mtr);
      } else {
        kry.idMitraTerkait = mtr.id;
        mtr.nama = cleanNama;
        mtr.role = 'KARYAWAN';
        mtr.isKaryawan = true;
        mtr.idKaryawanTerkait = kry.id;
        mtr.status = kry.status || mtr.status || 'AKTIF';
        if (kry.fotoUrl !== undefined) {
          mtr.fotoUrl = kry.fotoUrl || undefined;
        } else if (mtr.fotoUrl && !kry.fotoUrl) {
          kry.fotoUrl = mtr.fotoUrl;
        }
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
    for (const pb of this.db.pembelianHasilBumi) syncTxMitra(pb, 'SUPPLIER_CUSTOMER');
    for (const pbb of this.db.pembelianBarang) syncTxMitra(pbb, 'SUPPLIER');
    for (const k of this.db.kasbonUang) syncTxMitra(k, 'SUPPLIER_CUSTOMER');
    for (const b of this.db.bayarBon) syncTxMitra(b, 'SUPPLIER_CUSTOMER');
    for (const pt of this.db.pencairanTitipan) syncTxMitra(pt, 'SUPPLIER_CUSTOMER');

    // Standarisasi 5 Role Mitra: SUPPLIER, CUSTOMER, SUPPLIER_CUSTOMER, ANAK_PERUSAHAAN, KARYAWAN
    for (const m of this.db.mitra) {
      m.role = normalizeRoleMitra(m.role, {
        isAnakPerusahaan: m.isAnakPerusahaan,
        isKaryawan: m.isKaryawan,
      });
    }

    // Normalisasi format tanggal (DD/MM/YYYY) pada penggajian & upahHarian agar sinkron dengan Arus Kas Harian
    const toDmyIfIso = (val?: string): string | undefined => {
      if (!val) return val;
      const clean = String(val).trim();
      const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (isoMatch) {
        return `${isoMatch[3].padStart(2, '0')}/${isoMatch[2].padStart(2, '0')}/${isoMatch[1]}`;
      }
      const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmyMatch) {
        return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
      }
      return clean;
    };

    for (const g of this.db.penggajian || []) {
      if (g.tanggal) g.tanggal = toDmyIfIso(g.tanggal) || g.tanggal;
    }
    for (const u of this.db.upahHarian || []) {
      if (u.tanggalKerja) u.tanggalKerja = toDmyIfIso(u.tanggalKerja) || u.tanggalKerja;
      if (u.tanggalDibayar) u.tanggalDibayar = toDmyIfIso(u.tanggalDibayar) || u.tanggalDibayar;
    }

    // Auto-heal & pelihara rekonsiliasi Surat Jalan agar tidak pernah hilang / mental
    if (!Array.isArray(this.db.suratJalan)) {
      this.db.suratJalan = [];
    }
    const existingSjInvoices = new Set(this.db.suratJalan.map((s) => s.noInvoice).filter(Boolean));

    // Pulihkan WAP20261106-351 jika belum ada di tabel suratJalan
    if (!existingSjInvoices.has('WAP20261106-351')) {
      const umsBuyer = (this.db.uangMasuk || []).find(
        (u) => u.keterangan?.includes('WAP20261106-351') && u.kategori === 'PENJUALAN_SURAT_JALAN'
      );
      const umsKomisi = (this.db.uangMasuk || []).find(
        (u) => u.keterangan?.includes('WAP20261106-351') && u.kategori === 'KOMISI_SURAT_JALAN'
      );
      const bybBon = (this.db.bayarBon || []).find((b) => b.keterangan?.includes('WAP20261106-351'));
      if (umsBuyer) {
        this.db.suratJalan.push({
          id: 'SJ2611069895',
          noInvoice: 'WAP20261106-351',
          tanggal: umsBuyer.tanggal || '04/11/2026',
          jam: umsBuyer.jam || '21:54:55',
          idMitra: 'MTR-2790',
          namaMitra: 'RONI ANGGARA',
          komoditasNama: 'KOPI',
          kategoriKode: 'SKA',
          platTruk: 'BE 8206 AMN',
          tonaseAwalKg: 1423,
          tonaseAkhirKg: 1416,
          susutKg: 7,
          basisMitra: 61500,
          basisBuyer: 62000,
          rendemen: 90.05,
          hargaPerKgMitra: 55380.75,
          hargaPerKgBuyer: 55831,
          totalPenjualanMitra: 78419142,
          totalPenjualanBuyer: 79056696,
          marginHargaPt: 637554,
          pajakNominal: 196048,
          komisiNominal: 400000,
          kasbonNominal: 950500,
          potongPiutang: true,
          tambahanLabel: '',
          tambahanNominal: 0,
          potonganLainLabel: '',
          potonganLainNominal: 0,
          totalKeuntunganPt: 1037554,
          totalPotongan: 1546548,
          jumlahPembayaranMitra: 76872594,
          rekeningPtKode: 'BNI01',
          statusPembayaranMitra: 'PENDING',
          idUangMasukBuyer: umsBuyer.idTransaksi,
          idUangMasukKomisi: umsKomisi?.idTransaksi,
          idBayarBonMitra: bybBon?.idTransaksi,
          createdAt: umsBuyer.createdAt || '2026-11-06T14:54:55.193Z',
        });
        existingSjInvoices.add('WAP20261106-351');
      }
    }
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

    // Piutang / Talangan Transfer Rekening Anak Perusahaan (misal DP Parabot / REK-DPPARABO)
    let piutangTransferAnak = 0;
    let talanganTransferAnak = 0;
    for (const r of this.db.rekening || []) {
      if (r.kategori === 'ANAK_PERUSAHAAN' || r.kode === 'REK-DPPARABO') {
        const bal = Number(r.saldoSaatIni) || 0;
        if (bal > 0) piutangTransferAnak += bal;
        else if (bal < 0) talanganTransferAnak += Math.abs(bal);
      }
    }

    const totalBon = totalKasbonBarang + totalKasbonUang + piutangTransferAnak;

    // Collect all mitra IDs present in mitra or payable transactions
    const mitraIds = new Set<string>(this.db.mitra.map((m) => m.id));
    for (const p of this.db.pembelianHasilBumi || []) {
      if (p.idMitra && p.metodePembayaran === 'TITIP') mitraIds.add(p.idMitra);
    }
    for (const pb of this.db.pembelianBarang || []) {
      if (pb.idMitra && pb.metodePembayaran === 'HUTANG') mitraIds.add(pb.idMitra);
    }

    let totalTitip = talanganTransferAnak;
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

    const totalSinkronVolume =
      (this.db.bayarBon || [])
        .filter(
          (b) =>
            b.metode === 'SINKRON' ||
            b.metode === 'KOMPENSASI_TITIP' ||
            b.rekeningTujuan === 'SINKRON' ||
            b.rekeningTujuan === 'KOMPENSASI_TITIP' ||
            Boolean(b.isKompensasiTitipan)
        )
        .reduce((sum, b) => sum + Math.max(0, b.nominalBayar || 0), 0) +
      (this.db.penjualan || [])
        .filter((p) => p.metode === 'SINKRON' || p.rekeningTujuan === 'SINKRON')
        .reduce((sum, p) => sum + Math.max(0, p.totalNominal || 0), 0) +
      (this.db.pembelianBarang || [])
        .filter((pb) => pb.metodePembayaran === 'SINKRON' || pb.rekeningSumber === 'SINKRON')
        .reduce((sum, pb) => sum + Math.max(0, pb.totalNominal || 0), 0) +
      (this.db.pembelianHasilBumi || [])
        .filter((phb) => phb.metodePembayaran === 'SINKRON' || phb.rekeningSumber === 'SINKRON')
        .reduce((sum, phb) => sum + Math.max(0, phb.totalNominal || 0), 0) +
      (this.db.penjualanHasilBumi || [])
        .filter((jhb) => jhb.metodePembayaran === 'SINKRON' || jhb.rekeningTujuan === 'SINKRON')
        .reduce((sum, jhb) => sum + Math.max(0, jhb.totalNominal || 0), 0) +
      (this.db.kasbonUang || [])
        .filter((k) => k.metode === 'SINKRON' || k.rekeningSumber === 'SINKRON')
        .reduce((sum, k) => sum + Math.max(0, k.nominal || 0), 0) +
      (this.db.pencairanTitipan || [])
        .filter((pt) => pt.metodePembayaran === 'SINKRON' || pt.rekeningSumber === 'SINKRON')
        .reduce((sum, pt) => sum + Math.max(0, pt.nominalPencairan || 0), 0) +
      (this.db.pengeluaran || [])
        .filter((ex) => ex.rekeningSumber === 'SINKRON')
        .reduce((sum, ex) => sum + Math.abs(ex.nominal || 0), 0) +
      (this.db.uangMasuk || [])
        .filter((um) => um.metode === 'SINKRON' || um.rekeningTujuan === 'SINKRON')
        .reduce((sum, um) => sum + Math.max(0, um.nominal || 0), 0) +
      (this.db.penggajian || [])
        .filter((gj) => gj.metodePembayaran === 'SINKRON' || gj.rekeningSumber === 'SINKRON')
        .reduce((sum, gj) => sum + Math.max(0, gj.gajiBersihDibayar || 0), 0);

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
    if (!trimmed || isExcludedFromDivisi(trimmed) || isTanpaDivisi(trimmed)) return null;

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
   * Synchronize Operational Division Accounts (OPERASIONAL_DIVISI):
   * Membedakan secara tegas antara:
   * - PEMBELIAN (Barang Dagang / Beras / Hasil Bumi) = MODAL DAGANG (uang berubah wujud menjadi stok yang berpotensi kembali & menghasilkan untung saat terjual), sehingga sisa modal stok belum terjual tetap dihitung dalam Nilai/Saldo Berjalan Divisi.
   * - PENGELUARAN (Biaya Operasional & Gaji/Upah Karyawan) = BEBAN PENGURANG MURNI yang pasti langsung mengurangi Saldo & Laba Divisi.
   */
  public synchronizeDivisiAccounts() {
    const norm = (s?: string) => String(s || '').trim().toLowerCase();
    const produkMap = new Map((this.db.produk || []).map((p) => [String(p.kode || '').trim().toUpperCase(), p]));

    // Pastikan divisi standar tambahan seperti Wijaya Karya, Okussa, BRILink, dan seluruh divisi yang dipakai di transaksi terdaftar
    this.ensureDivisiRegisteredInMemory('Wijaya Karya');
    this.ensureDivisiRegisteredInMemory('Okussa');
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
    for (const br of this.db.brilink || []) {
      if (br.divisi) this.ensureDivisiRegisteredInMemory(br.divisi);
    }
    for (const um of this.db.uangMasuk || []) {
      if (um.divisi) this.ensureDivisiRegisteredInMemory(um.divisi);
    }

    const allDivisi = this.getDivisiList();
    const divisiByRekKode = new Map(allDivisi.map((d) => [d.kodeRekening.toUpperCase(), norm(d.nama)]));

    // ATURAN ARUS KAS BARANG TOKO:
    // Seluruh transaksi pembelian maupun penjualan barang toko masuk ke 'Wijaya Karya', KECUALI produk dengan kategori 'OKUSSA' masuk ke 'Okussa'.
    const resolveStoreItemDivNorm = (kodeProduk?: string, fallbackDivisi?: string, metode?: string) => {
      if (isTanpaDivisi(fallbackDivisi)) return '__tanpa_divisi__';
      if (metode === 'INTERNAL_PT') return norm(fallbackDivisi || 'PT Wijaya Agro Perkasa');
      const cleanKode = String(kodeProduk || '').trim().toUpperCase();
      if (cleanKode && cleanKode !== 'REKAP-NOTA' && cleanKode !== 'NOTA-SILANG') {
        const prod = produkMap.get(cleanKode);
        if (String(prod?.kategori || '').trim().toUpperCase() === 'OKUSSA') {
          return norm('Okussa');
        }
        return norm('Wijaya Karya');
      }
      if (norm(fallbackDivisi) === 'okussa') return norm('Okussa');
      return norm('Wijaya Karya');
    };
    const resolveHasilBumiDivNorm = (divisi?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      return norm(divisi || 'Gudang Wijaya Agro');
    };
    const resolveBrilinkDivNorm = (divisi?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      return norm(divisi || 'BRILink');
    };
    const resolveBebanDivNorm = (divisi?: string, rekeningSumber?: string) => {
      if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
      if (divisi && String(divisi).trim()) return norm(divisi);
      if (rekeningSumber) {
        const mapped = divisiByRekKode.get(String(rekeningSumber).toUpperCase());
        if (mapped) return mapped;
      }
      return norm('PT Wijaya Agro Perkasa');
    };

    // Lookup map untuk melacak divisi asal nota & rasio HPP saat pelunasan bon barang secara Tunai/Transfer (mendukung nota campuran Okussa & Wijaya Karya)
    const penjualanNotaSharesMap = new Map<
      string,
      Array<{ divisiNorm: string; ratioNominal: number; totalHppShare: number; totalNominalNota: number }>
    >();
    for (const p of this.db.penjualan || []) {
      if (p.isNotaSilang || p.metode === 'PEMAKAIAN_PENGELUARAN') continue;
      if (p.noPenjualan) {
        const totalNom = Number(p.totalNominal) || 0;
        const perDiv = new Map<string, { nom: number; hpp: number }>();
        if (Array.isArray(p.items) && p.items.length > 0) {
          for (const it of p.items) {
            const dNorm = resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode);
            const prod = produkMap.get(String(it.kodeProduk || '').trim().toUpperCase());
            const hppUnit = it.hargaBeli !== undefined ? Number(it.hargaBeli) : Number(prod?.hargaBeli || 0);
            const subNom = Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0);
            const subHpp = (Number(it.qty) || 0) * hppUnit;
            const prev = perDiv.get(dNorm) || { nom: 0, hpp: 0 };
            prev.nom += subNom;
            prev.hpp += subHpp;
            perDiv.set(dNorm, prev);
          }
        } else {
          const dNorm = resolveStoreItemDivNorm(undefined, p.divisi, p.metode);
          perDiv.set(dNorm, { nom: totalNom, hpp: Number(p.totalModalHpp) || 0 });
        }
        const sumSubNom = Array.from(perDiv.values()).reduce((s, x) => s + x.nom, 0) || totalNom || 1;
        penjualanNotaSharesMap.set(
          p.noPenjualan,
          Array.from(perDiv.entries()).map(([divisiNorm, val]) => ({
            divisiNorm,
            ratioNominal: val.nom / sumSubNom,
            totalHppShare: val.hpp,
            totalNominalNota: totalNom,
          }))
        );
      }
    }
    for (const j of this.db.penjualanHasilBumi || []) {
      if (j.noPenjualan) {
        const notaHpp =
          Number(j.totalModalHpp) || (Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0);
        penjualanNotaSharesMap.set(j.noPenjualan, [
          {
            divisiNorm: resolveHasilBumiDivNorm(j.divisi),
            ratioNominal: 1,
            totalHppShare: notaHpp,
            totalNominalNota: Number(j.totalNominal) || 0,
          },
        ]);
      }
    }

    for (const div of allDivisi) {
      const targetNorm = norm(div.nama);
      const rek = this.db.rekening.find((r) => r.kode === div.kodeRekening);
      if (!rek) continue;

      // 1. ARUS PENJUALAN & DROPPING MASUK DIVISI (+)
      let masukPenjualanToko = 0;
      let hppTerjualKas = 0;
      for (const p of this.db.penjualan || []) {
        if (p.isNotaSilang || p.metode === 'PEMAKAIAN_PENGELUARAN') continue;
        if ((p.metode !== 'TUNAI' && p.metode !== 'TRANSFER') || (Number(p.totalNominal) || 0) <= 0) continue;
        if (Array.isArray(p.items) && p.items.length > 0) {
          for (const it of p.items) {
            if (resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode) === targetNorm) {
              const prod = produkMap.get(String(it.kodeProduk || '').trim().toUpperCase());
              const hppUnit = it.hargaBeli !== undefined ? Number(it.hargaBeli) : Number(prod?.hargaBeli || 0);
              masukPenjualanToko += Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0);
              hppTerjualKas += (Number(it.qty) || 0) * hppUnit;
            }
          }
        } else if (resolveStoreItemDivNorm(undefined, p.divisi, p.metode) === targetNorm) {
          masukPenjualanToko += Number(p.totalNominal) || 0;
          hppTerjualKas += Number(p.totalModalHpp) || 0;
        }
      }

      const penjualanHbTunai = (this.db.penjualanHasilBumi || []).filter(
        (j) =>
          resolveHasilBumiDivNorm(j.divisi) === targetNorm &&
          (j.metodePembayaran === 'TUNAI' || j.metodePembayaran === 'TRANSFER') &&
          (j.totalNominal || 0) > 0
      );
      const masukPenjualanHasilBumi = penjualanHbTunai.reduce(
        (sum, j) => sum + (Number(j.totalNominal) || 0),
        0
      );
      const penjualanHbFisikKeluar = (this.db.penjualanHasilBumi || []).filter(
        (j) =>
          resolveHasilBumiDivNorm(j.divisi) === targetNorm &&
          (j.metodePembayaran === 'TUNAI' ||
            j.metodePembayaran === 'TRANSFER' ||
            j.metodePembayaran === 'BELUM_PUTUS_HARGA')
      );
      hppTerjualKas += penjualanHbFisikKeluar.reduce(
        (sum, j) =>
          sum +
          (Number(j.totalModalHpp) ||
            (Number(j.beratBersih) || 0) * (Number(j.modalRataRataPerKg) || 0)),
        0
      );

      let masukPelunasanPiutangDivisi = 0;
      for (const b of this.db.bayarBon || []) {
        if (b.metode !== 'TUNAI' && b.metode !== 'TRANSFER') continue;
        if (b.isKompensasiTitipan || b.isPotongGaji) continue;
        for (const alok of b.alokasi || []) {
          if (alok.jenis === 'KASBON_BARANG' && (alok.nominalDibayar || 0) > 0) {
            const shares = penjualanNotaSharesMap.get(alok.refId) || [];
            const dibayar = Number(alok.nominalDibayar) || 0;
            for (const sh of shares) {
              if (sh.divisiNorm === targetNorm) {
                const dibayarDiv = Math.round(dibayar * sh.ratioNominal);
                masukPelunasanPiutangDivisi += dibayarDiv;
                if (sh.totalNominalNota > 0 && sh.totalHppShare > 0) {
                  hppTerjualKas += (dibayar / sh.totalNominalNota) * sh.totalHppShare;
                }
              }
            }
          }
        }
      }

      const masukAdminBrilink = (this.db.brilink || [])
        .filter(
          (br) =>
            resolveBrilinkDivNorm(br.divisi) === targetNorm &&
            br.jenisBrilink === 'TARIK_TUNAI' &&
            (Number(br.nominalAdmin) || 0) > 0
        )
        .reduce((sum, br) => sum + (Number(br.nominalAdmin) || 0), 0);

      const masukUangMasukDivisi = (this.db.uangMasuk || [])
        .filter(
          (um) =>
            !isTanpaDivisi(um.divisi) &&
            norm(um.divisi || 'Gudang Wijaya Agro') === targetNorm &&
            (Number(um.nominal) || 0) > 0
        )
        .reduce((sum, um) => sum + (Number(um.nominal) || 0), 0);

      const masukPenjualanKas =
        masukPenjualanToko +
        masukPenjualanHasilBumi +
        masukPelunasanPiutangDivisi +
        masukAdminBrilink +
        masukUangMasukDivisi;

      const masukDropping = (this.db.transferRekening || [])
        .filter((t) => t.status === 'BERHASIL' && t.rekeningTujuan === div.kodeRekening)
        .reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);

      const totalMasukDivisi = masukPenjualanKas + masukDropping;

      // 2. MODAL PEMBELIAN DIVISI (Barang Dagang + Hasil Bumi Putus Harga Tunai/Transfer)
      // Hitungannya MODAL (berpotensi balik uang & untung), bukan beban pengeluaran hangus
      let keluarPembelianBarang = 0;
      for (const pb of this.db.pembelianBarang || []) {
        if ((pb.metodePembayaran !== 'TUNAI' && pb.metodePembayaran !== 'TRANSFER') || (Number(pb.totalNominal) || 0) <= 0) {
          continue;
        }
        if (Array.isArray(pb.items) && pb.items.length > 0) {
          for (const it of pb.items) {
            if (resolveStoreItemDivNorm(it.kodeProduk, pb.divisi) === targetNorm) {
              keluarPembelianBarang += Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.hargaBeliSatuan) || 0);
            }
          }
        } else if (resolveStoreItemDivNorm(undefined, pb.divisi) === targetNorm) {
          keluarPembelianBarang += Number(pb.totalNominal) || 0;
        }
      }

      const keluarPembelianHasilBumi = (this.db.pembelianHasilBumi || [])
        .filter(
          (phb) =>
            resolveHasilBumiDivNorm(phb.divisi) === targetNorm &&
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

      const totalModalPembelianKas = keluarPembelianBarang + keluarPembelianHasilBumi;
      const effectiveModalTerpakaiKas =
        hppTerjualKas > 0
          ? hppTerjualKas
          : masukPenjualanKas > 0 && totalModalPembelianKas > 0
          ? Math.min(totalModalPembelianKas, masukPenjualanKas)
          : 0;

      // Sisa modal pembelian yang masih berwujud stok barang/komoditas siap jual di divisi ini
      const sisaModalStokKas = Math.max(0, totalModalPembelianKas - effectiveModalTerpakaiKas);

      // 3. PENGELUARAN & BEBAN DIVISI (-) — Pasti mengurangi Saldo & Nilai Uang Berjalan Divisi
      const keluarAdminBrilink = (this.db.brilink || [])
        .filter(
          (br) =>
            resolveBrilinkDivNorm(br.divisi) === targetNorm &&
            br.jenisBrilink === 'TUKAR_CASH' &&
            (Number(br.nominalAdmin) || 0) > 0
        )
        .reduce((sum, br) => sum + (Number(br.nominalAdmin) || 0), 0);

      const keluarOperasional =
        (this.db.pengeluaran || [])
          .filter((p) => resolveBebanDivNorm(p.divisi, p.rekeningSumber) === targetNorm)
          .reduce((sum, p) => sum + (Number(p.nominal) || 0), 0) + keluarAdminBrilink;

      const keluarGaji = (this.db.penggajian || [])
        .filter((g) => resolveBebanDivNorm(g.divisi, g.rekeningSumber) === targetNorm)
        .reduce((sum, g) => sum + (Number(g.gajiBersihDibayar) || 0), 0);

      const keluarTransfer = (this.db.transferRekening || [])
        .filter((t) => t.status === 'BERHASIL' && t.rekeningSumber === div.kodeRekening)
        .reduce((sum, t) => sum + (Number(t.nominal) || 0), 0);

      const saldoKasMurniDivisi =
        (Number(rek.saldoAwal) || 0) +
        totalMasukDivisi -
        totalModalPembelianKas -
        keluarOperasional -
        keluarGaji -
        keluarTransfer;

      // Saldo Nilai Berjalan Divisi = Kas Berjalan + Modal Pembelian Berjalan (sehingga Pembelian jadi Modal, Pengeluaran pasti mengurangi Saldo Divisi)
      rek.saldoSaatIni = Math.round(saldoKasMurniDivisi + sisaModalStokKas);
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

    let piutangAnakIntegrity = 0;
    let talanganAnakIntegrity = 0;
    for (const r of this.db.rekening || []) {
      if (r.kategori === 'ANAK_PERUSAHAAN' || r.kode === 'REK-DPPARABO') {
        const bal = Number(r.saldoSaatIni) || 0;
        if (bal > 0) piutangAnakIntegrity += bal;
        else if (bal < 0) talanganAnakIntegrity += Math.abs(bal);
      }
    }

    const calcBon =
      (this.db.penjualan || [])
        .filter((p) => p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((s, p) => s + Math.max(0, p.sisaPiutang || 0), 0) +
      (this.db.penjualanHasilBumi || [])
        .filter((j) => j.metodePembayaran === 'PIUTANG' && j.statusPembayaran === 'BELUM_BAYAR')
        .reduce((s, j) => s + Math.max(0, j.sisaPiutang || 0), 0) +
      (this.db.kasbonUang || [])
        .filter((k) => k.status !== 'LUNAS')
        .reduce((s, k) => s + Math.max(0, k.sisaKasbon || 0), 0) +
      piutangAnakIntegrity;

    const bon01Reconciled = Math.abs(bon01Saldo - calcBon) < 1;

    let calcTitip = talanganAnakIntegrity;
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
      uangMasuk: (this.db.uangMasuk || []).length,
      transferRekening: (this.db.transferRekening || []).length,
      brilink: (this.db.brilink || []).length,
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
      counts.uangMasuk +
      counts.transferRekening +
      counts.brilink +
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
      if (isExcludedFromDivisi(c.nama) || isExcludedFromDivisi(c.id)) return;
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

    return Array.from(map.values()).filter(
      (d) =>
        !isExcludedFromDivisi(d.nama) &&
        !isExcludedFromDivisi(d.id) &&
        !isTanpaDivisi(d.nama) &&
        !isTanpaDivisi(d.id)
    );
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
      if (isExcludedFromDivisi(trimmed)) {
        throw new Error(
          'DP Parabot merupakan entitas Mitra / Anak Perusahaan, sehingga tidak dimasukkan sebagai Divisi Laba Rugi.'
        );
      }
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
      db.brilink = [];
      db.uangMasuk = [];
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
    let result!: T;
    try {
      result = action(this.db);
      this.reconcileRelationalIntegrity();
      this.synchronizeVirtualAccounts();
      this.saveDirect(this.db);
      supabaseSyncEngine.markLocalMutation(this.db);
    } finally {
      this.isWriting = false;
    }
    // Pastikan transaksi LANGSUNG dan PASTI tersimpan ke Cloud Supabase sebelum respon API selesai
    const syncWaitMs = 10000;
    try {
      await supabaseSyncEngine.flushSync(this.db, syncWaitMs);
    } catch (syncErr) {
      console.warn('[DB] Supabase immediate flush warning:', syncErr);
    }
    return result;
  }
}

export const dbManager = new DatabaseManager();
