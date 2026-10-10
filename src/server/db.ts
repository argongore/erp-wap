import fs from 'fs';
import path from 'path';
import {
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
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
} from './types.ts';

export interface DatabaseSchema {
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
  kasbonUang: TransaksiKasbonUang[];
  bayarBon: TransaksiBayarBon[];
  transferRekening: TransaksiTransferRekening[];
  auditLogs: AuditLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'wijaya_agro_erp.json');

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
    // REKENING OPERASIONAL DIVISI (BUKU ALOKASI TRACKING PERGERAKAN DANA)
    {
      kode: 'REK-GWA',
      nama: 'Buku Operasional Gudang Wijaya Agro',
      atasNama: 'Divisi Gudang Wijaya Agro',
      nomorRekening: 'DIV-01-GWA',
      saldoAwal: 15000000,
      saldoSaatIni: 15000000,
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
      saldoAwal: 20000000,
      saldoSaatIni: 20000000,
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
      saldoAwal: 25000000,
      saldoSaatIni: 25000000,
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
      saldoAwal: 30000000,
      saldoSaatIni: 30000000,
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
      saldoAwal: 50000000,
      saldoSaatIni: 50000000,
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
      saldoAwal: 15000000,
      saldoSaatIni: 15000000,
      status: 'AKTIF',
      isVirtual: false,
      kategori: 'OPERASIONAL_DIVISI',
      rekeningIndukPenyimpan: 'KAS01',
      keterangan: 'Buku tracking distribusi beras kemasan premium Okussa (Dana fisik di Kas Perusahaan)',
    },
  ];
}

// ==========================================
// PONDASI DATABASE ITEM DARI DOKUMEN MASTER (NO 1 S/D 35)
// No 1 s/d 8: Pembelian Hasil Bumi Dari Petani (Termasuk No 8: Kopi Titip Belum Putus Harga)
// No 9 s/d 35: Barang yang dibeli dari pemasok untuk dijual
// ==========================================

export function getDefaultHasilBumiList(): StokHasilBumi[] {
  const now = getWIBDateTime();
  return [
    { kode: 'HB-01', nama: 'KOPI', satuan: 'KG', stok: 0, hargaBeliStandar: 42000, updateTerakhir: now.iso },
    { kode: 'HB-02', nama: 'KULIT KAYU MANIS STIK', satuan: 'KG', stok: 0, hargaBeliStandar: 52000, updateTerakhir: now.iso },
    { kode: 'HB-03', nama: 'KULIT KAYU MANIS KA', satuan: 'KG', stok: 0, hargaBeliStandar: 38000, updateTerakhir: now.iso },
    { kode: 'HB-04', nama: 'KULIT KAYU MANIS KB', satuan: 'KG', stok: 0, hargaBeliStandar: 30000, updateTerakhir: now.iso },
    { kode: 'HB-05', nama: 'LADA', satuan: 'KG', stok: 0, hargaBeliStandar: 68000, updateTerakhir: now.iso },
    { kode: 'HB-06', nama: 'CENGKEH', satuan: 'KG', stok: 0, hargaBeliStandar: 115000, updateTerakhir: now.iso },
    { kode: 'HB-07', nama: 'GG CENGKEH', satuan: 'KG', stok: 0, hargaBeliStandar: 35000, updateTerakhir: now.iso },
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
    hargaBeli: number;
    hargaJual: number;
    hargaKhususRekanan: number;
  }> = [
    { kode: 'PRD-09', nama: 'BERAS BELITANG', satuan: 'SAK', kategori: 'BERAS', hargaBeli: 145000, hargaJual: 155000, hargaKhususRekanan: 150000 },
    { kode: 'PRD-10', nama: 'BERAS JEMPOL', satuan: 'SAK', kategori: 'BERAS', hargaBeli: 140000, hargaJual: 150000, hargaKhususRekanan: 145000 },
    { kode: 'PRD-11', nama: 'PASIR m2', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN', hargaBeli: 180000, hargaJual: 220000, hargaKhususRekanan: 200000 },
    { kode: 'PRD-12', nama: 'KORAL M2', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN', hargaBeli: 220000, hargaJual: 260000, hargaKhususRekanan: 240000 },
    { kode: 'PRD-13', nama: 'BATU UJM', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN', hargaBeli: 200000, hargaJual: 240000, hargaKhususRekanan: 220000 },
    { kode: 'PRD-14', nama: 'SPLIT', satuan: 'METER KUBIK', kategori: 'ALAT_PERTANIAN', hargaBeli: 230000, hargaJual: 270000, hargaKhususRekanan: 250000 },
    { kode: 'PRD-15', nama: 'BATA', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 650, hargaJual: 800, hargaKhususRekanan: 750 },
    { kode: 'PRD-16', nama: 'BATA RINGAN', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 8500, hargaJual: 10000, hargaKhususRekanan: 9500 },
    { kode: 'PRD-17', nama: 'PAPAN', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 25000, hargaJual: 30000, hargaKhususRekanan: 28000 },
    { kode: 'PRD-18', nama: 'KASAU', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 18000, hargaJual: 22000, hargaKhususRekanan: 20000 },
    { kode: 'PRD-19', nama: 'BALOK 7x14', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 55000, hargaJual: 65000, hargaKhususRekanan: 60000 },
    { kode: 'PRD-20', nama: 'BALOK 8X12', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 60000, hargaJual: 72000, hargaKhususRekanan: 66000 },
    { kode: 'PRD-21', nama: 'SPANEL 4M', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 45000, hargaJual: 55000, hargaKhususRekanan: 50000 },
    { kode: 'PRD-22', nama: 'SPANEL 2M', satuan: 'BIJI/BUAH', kategori: 'ALAT_PERTANIAN', hargaBeli: 25000, hargaJual: 32000, hargaKhususRekanan: 28000 },
    { kode: 'PRD-23', nama: 'UREA', satuan: 'SAK', kategori: 'PUPUK', hargaBeli: 120000, hargaJual: 135000, hargaKhususRekanan: 130000 },
    { kode: 'PRD-24', nama: 'NPK', satuan: 'SAK', kategori: 'PUPUK', hargaBeli: 160000, hargaJual: 180000, hargaKhususRekanan: 170000 },
    { kode: 'PRD-25', nama: 'SOLAR', satuan: 'DRIGENT', kategori: 'LAINNYA', hargaBeli: 210000, hargaJual: 235000, hargaKhususRekanan: 225000 },
    { kode: 'PRD-26', nama: 'DEXLITE', satuan: 'DRIGENT', kategori: 'LAINNYA', hargaBeli: 275000, hargaJual: 300000, hargaKhususRekanan: 290000 },
    { kode: 'PRD-27', nama: 'KOPI ROBUSTA MENTAH', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 45000, hargaJual: 55000, hargaKhususRekanan: 50000 },
    { kode: 'PRD-28', nama: 'ROBUSTA PREMIUM MENTAH', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 55000, hargaJual: 68000, hargaKhususRekanan: 62000 },
    { kode: 'PRD-29', nama: 'ROBUSTA LANANG MENTAH', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 65000, hargaJual: 80000, hargaKhususRekanan: 72000 },
    { kode: 'PRD-30', nama: 'KOPI ROBUSTA ROSTING', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 70000, hargaJual: 85000, hargaKhususRekanan: 78000 },
    { kode: 'PRD-31', nama: 'ROBUSTA PREMIUM ROSTING', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 85000, hargaJual: 105000, hargaKhususRekanan: 95000 },
    { kode: 'PRD-32', nama: 'ROBUSTA LANANG ROSTING', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 95000, hargaJual: 120000, hargaKhususRekanan: 110000 },
    { kode: 'PRD-33', nama: 'KOPI ROBUSTA BUBUK', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 75000, hargaJual: 90000, hargaKhususRekanan: 82000 },
    { kode: 'PRD-34', nama: 'ROBUSTA PREMIUM BUBUK', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 90000, hargaJual: 110000, hargaKhususRekanan: 100000 },
    { kode: 'PRD-35', nama: 'ROBUSTA LANANG BUBUK', satuan: 'KEMASAN', kategori: 'BERAS', hargaBeli: 100000, hargaJual: 125000, hargaKhususRekanan: 115000 },
  ];

  const produk: Produk[] = rawItems.map((it) => ({
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    kategori: it.kategori,
    hargaBeli: it.hargaBeli,
    hargaJual: it.hargaJual,
    hargaKhususRekanan: it.hargaKhususRekanan,
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

// Clean Initial Seed Data: Filled with 35 Foundation Items
export function getDefaultDatabase(): DatabaseSchema {
  const now = getWIBDateTime();
  const { produk, stokBarang } = getDefaultProdukDagangList();
  const stokHasilBumi = getDefaultHasilBumiList();

  return {
    rekening: getDefaultRekeningList(),
    mitra: [],
    karyawan: [],
    upahHarian: [],
    penggajian: [],
    produk,
    stokBarang,
    stokHasilBumi,
    penjualan: [],
    pembelianBarang: [],
    pembelianHasilBumi: [],
    kasbonUang: [],
    bayarBon: [],
    transferRekening: [],
    auditLogs: [
      {
        id: 'LOG-INIT',
        timestamp: now.iso,
        tanggal: now.tanggal,
        jam: now.jam,
        user: 'KasirWap',
        jenisTransaksi: 'CREATE',
        idTransaksi: 'SYS-INIT',
        detail: 'Sistem siap: 35 Master Item Pondasi (Hasil Bumi 1-7 & Barang Pemasok 8-35) berhasil diinisialisasi untuk PT Wijaya Agro.',
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
    this.db = this.load();
    this.synchronizeVirtualAccounts();
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const defaultRekening = getDefaultRekeningList();

        const merged: DatabaseSchema = {
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
          auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
        };

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

        // Categorize accounts cleanly
        for (const rek of merged.rekening) {
          const defRek = defaultRekening.find((d) => d.kode === rek.kode);
          if (defRek) {
            rek.kategori = defRek.kategori;
            rek.rekeningIndukPenyimpan = defRek.rekeningIndukPenyimpan;
          } else if (rek.kode === 'BON01' || rek.kode === 'TIT01') {
            rek.kategori = 'VIRTUAL_SISTEM';
            rek.isVirtual = true;
          } else if (rek.kode.startsWith('REK-') || rek.kode.startsWith('DIV-')) {
            rek.kategori = 'OPERASIONAL_DIVISI';
            rek.isVirtual = false;
            rek.rekeningIndukPenyimpan = rek.rekeningIndukPenyimpan || 'KAS01';
          } else {
            rek.kategori = 'PERUSAHAAN';
            rek.isVirtual = false;
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

  private saveDirect(data: DatabaseSchema) {
    this.ensureDirectory();
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  }

  public save() {
    this.synchronizeVirtualAccounts();
    this.saveDirect(this.db);
  }

  public get(): DatabaseSchema {
    return this.db;
  }

  /**
   * Reset all data clean for supplier, karyawan, produk, stok, and hasil bumi
   */
  public resetCleanData() {
    return this.executeTransaction((db) => {
      db.mitra = [];
      db.karyawan = [];
      db.upahHarian = [];
      db.penggajian = [];
      const { produk, stokBarang } = getDefaultProdukDagangList();
      db.produk = produk;
      db.stokBarang = stokBarang;
      db.stokHasilBumi = getDefaultHasilBumiList();
      db.penjualan = [];
      db.pembelianBarang = [];
      db.pembelianHasilBumi = [];
      db.kasbonUang = [];
      db.bayarBon = [];
      db.transferRekening = [];
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
   * Synchronize Virtual Accounts BON01 (Kasbon/Piutang Customer) and TIT01 (Titip Supplier)
   */
  public synchronizeVirtualAccounts() {
    const totalKasbonBarang = (this.db.penjualan || [])
      .filter((p) => p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
      .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

    const totalKasbonUang = (this.db.kasbonUang || [])
      .filter((k) => k.status !== 'LUNAS')
      .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

    const totalBon = totalKasbonBarang + totalKasbonUang;

    const totalTitip = (this.db.pembelianHasilBumi || [])
      .filter((p) => p.metodePembayaran === 'TITIP' && p.status !== 'LUNAS')
      .reduce((sum, p) => sum + (p.totalNominal || 0), 0);

    const bon01 = this.db.rekening.find((r) => r.kode === 'BON01');
    if (bon01) {
      bon01.saldoSaatIni = totalBon;
    }

    const tit01 = this.db.rekening.find((r) => r.kode === 'TIT01');
    if (tit01) {
      tit01.saldoSaatIni = totalTitip;
    }
  }

  /**
   * Transactional lock execution wrapper
   */
  public async executeTransaction<T>(action: (db: DatabaseSchema) => T): Promise<T> {
    while (this.isWriting) {
      await new Promise((res) => setTimeout(res, 10));
    }
    this.isWriting = true;
    try {
      const result = action(this.db);
      this.save();
      return result;
    } finally {
      this.isWriting = false;
    }
  }
}

export const dbManager = new DatabaseManager();
