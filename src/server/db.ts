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
  // Using Intl with Asia/Jakarta
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

// Initial seed data
function getDefaultDatabase(): DatabaseSchema {
  const now = getWIBDateTime();

  const rekening: Rekening[] = [
    {
      kode: 'KAS01',
      nama: 'Kas Utama Kasir',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: 'KAS-01-OPERASIONAL',
      saldoAwal: 25000000,
      saldoSaatIni: 25000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Uang kas fisik di laci kasir kantor pusat',
    },
    {
      kode: 'BNI01',
      nama: 'Bank BNI Operasional',
      atasNama: 'PT Wijaya Agro',
      nomorRekening: '1827401928',
      saldoAwal: 75000000,
      saldoSaatIni: 75000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening giro operasional pembelian & penjualan',
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
      keterangan: 'Rekening utama penampungan hasil dagang',
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
      keterangan: 'Rekening transaksi grosir dan mitra tani',
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
      keterangan: 'Rekening transaksi mitra petani daerah',
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
      keterangan: 'Rekening syariah kemitraan',
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
      keterangan: 'Rekening khusus sistem lama untuk total kasbon barang & kasbon uang mitra',
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
      keterangan: 'Rekening khusus sistem lama untuk titip hasil bumi belum diambil',
    },
    // REKENING KHUSUS DIVISI OPERASIONAL
    {
      kode: 'REK-GWA',
      nama: 'Kas Operasional Gudang Wijaya Agro',
      atasNama: 'Divisi Gudang Wijaya Agro',
      nomorRekening: 'DIV-01-GWA',
      saldoAwal: 15000000,
      saldoSaatIni: 15000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening khusus kas operasional & gaji karyawan harian Gudang Wijaya Agro',
    },
    {
      kode: 'REK-WK',
      nama: 'Kas Operasional Wijaya Karya',
      atasNama: 'Divisi Wijaya Karya',
      nomorRekening: 'DIV-02-WK',
      saldoAwal: 20000000,
      saldoSaatIni: 20000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening khusus kas operasional proyek, bengkel & upah teknisi Wijaya Karya',
    },
    {
      kode: 'REK-WT',
      nama: 'Kas Operasional Wijaya Transport',
      atasNama: 'Divisi Wijaya Transport',
      nomorRekening: 'DIV-03-WT',
      saldoAwal: 25000000,
      saldoSaatIni: 25000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening khusus biaya armada truk, logistik & gaji supir Wijaya Transport',
    },
    {
      kode: 'REK-CVA',
      nama: 'Kas Operasional CV Wijaya Agro',
      atasNama: 'CV Wijaya Agro',
      nomorRekening: 'DIV-04-CVA',
      saldoAwal: 30000000,
      saldoSaatIni: 30000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening khusus perputaran dagang saprotan & gaji staff CV Wijaya Agro',
    },
    {
      kode: 'REK-WAP',
      nama: 'Kas Operasional PT Wijaya Agro Perkasa',
      atasNama: 'PT Wijaya Agro Perkasa',
      nomorRekening: 'DIV-05-WAP',
      saldoAwal: 50000000,
      saldoSaatIni: 50000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening khusus operasional pabrik induk & staff PT Wijaya Agro Perkasa',
    },
    {
      kode: 'REK-OKU',
      nama: 'Kas Operasional Okussa',
      atasNama: 'Divisi Bisnis Okussa',
      nomorRekening: 'DIV-06-OKU',
      saldoAwal: 15000000,
      saldoSaatIni: 15000000,
      status: 'AKTIF',
      isVirtual: false,
      keterangan: 'Rekening khusus unit bisnis beras kemasan premium & gaji harian Okussa',
    },
  ];

  const mitra: Mitra[] = [
    {
      id: 'MTR-001',
      kode: 'BUDI01',
      nama: 'Budi Santoso',
      role: 'ALL',
      telepon: '081234567890',
      alamat: 'Ds. Karanganyar RT 02/RW 03, Kec. Agro Makmur',
      status: 'AKTIF',
      catatan: 'Petani jagung binaan & pembeli sarana produksi',
    },
    {
      id: 'MTR-002',
      kode: 'SUG01',
      nama: 'Sugeng Riyadi',
      role: 'MITRA_TANI',
      telepon: '081398765432',
      alamat: 'Ds. Sukomakmur RT 01/RW 01, Kec. Subur Tani',
      status: 'AKTIF',
      catatan: 'Pemasok gabah & jagung pipil',
    },
    {
      id: 'MTR-003',
      kode: 'JOK01',
      nama: 'Joko Wibowo',
      role: 'CUSTOMER',
      telepon: '082155667788',
      alamat: 'Jl. Raya Agro No. 45, Sentra Hortikultura',
      status: 'AKTIF',
      catatan: 'Konsumen pupuk dan benih horti',
    },
    {
      id: 'MTR-004',
      kode: 'SYAM01',
      nama: 'H. Syamsudin',
      role: 'SUPPLIER',
      telepon: '081922334455',
      alamat: 'Sentra Pertanian Krajan RT 04/RW 02',
      status: 'AKTIF',
      catatan: 'Pemasok hasil bumi sawit & kopi',
    },
    {
      id: 'MTR-005',
      kode: 'CVTS01',
      nama: 'CV Tani Sejahtera',
      role: 'ALL',
      telepon: '085211223344',
      alamat: 'Komplek Pergudangan Agro Blok A-12',
      status: 'AKTIF',
      catatan: 'Mitra korporasi saprotan & komoditas',
    },
    {
      id: 'MTR-KRY-001',
      kode: 'KRY-001',
      nama: 'Agus Supriyadi (Karyawan)',
      role: 'KARYAWAN',
      telepon: '081299881122',
      alamat: 'Jl. Melati No. 12, Wlingi, Blitar',
      status: 'AKTIF',
      catatan: 'Karyawan: Kasir & Admin Toko (Operasional Toko)',
    },
    {
      id: 'MTR-KRY-002',
      kode: 'KRY-002',
      nama: 'Bambang Pamungkas (Karyawan)',
      role: 'KARYAWAN',
      telepon: '081388776655',
      alamat: 'Ds. Talun RT 03/RW 02, Blitar',
      status: 'AKTIF',
      catatan: 'Karyawan: Staff Gudang & Timbang (Gudang Hasil Bumi)',
    },
    {
      id: 'MTR-KRY-003',
      kode: 'KRY-003',
      nama: 'Hadi Sutrisno (Karyawan)',
      role: 'KARYAWAN',
      telepon: '085711223344',
      alamat: 'Jl. Raya Gandusari No. 8, Blitar',
      status: 'AKTIF',
      catatan: 'Karyawan: Supir Logistik & Pengiriman (Transport & Distribusi)',
    },
  ];

  const karyawan: Karyawan[] = [
    {
      id: 'KRY-001',
      nik: 'KRY-001',
      nama: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      departemen: 'Operasional Toko',
      gajiPokok: 135000, // Standar upah harian
      tunjanganTetap: 500000,
      telepon: '081299881122',
      alamat: 'Jl. Melati No. 12, Wlingi, Blitar',
      tanggalMasuk: '15/01/2024',
      status: 'AKTIF',
      idMitraTerkait: 'MTR-KRY-001',
      rekeningGajiKode: 'REK-GAJI-KRY001',
      namaBank: 'BCA',
      noRekeningBank: '8201293812',
      atasNamaRekening: 'Agus Supriyadi',
      catatan: 'Karyawan kasir & admin toko saprotan',
    },
    {
      id: 'KRY-002',
      nik: 'KRY-002',
      nama: 'Bambang Pamungkas',
      jabatan: 'Staff Gudang & Timbang',
      departemen: 'Gudang Hasil Bumi',
      gajiPokok: 125000, // Standar upah harian
      tunjanganTetap: 400000,
      telepon: '081388776655',
      alamat: 'Ds. Talun RT 03/RW 02, Blitar',
      tanggalMasuk: '01/06/2024',
      status: 'AKTIF',
      idMitraTerkait: 'MTR-KRY-002',
      rekeningGajiKode: 'REK-GAJI-KRY002',
      namaBank: 'BRI',
      noRekeningBank: '019283741829',
      atasNamaRekening: 'Bambang Pamungkas',
      catatan: 'Petugas timbang & sortasi hasil bumi',
    },
    {
      id: 'KRY-003',
      nik: 'KRY-003',
      nama: 'Hadi Sutrisno',
      jabatan: 'Supir Logistik & Pengiriman',
      departemen: 'Transport & Distribusi',
      gajiPokok: 140000, // Standar upah harian
      tunjanganTetap: 600000,
      telepon: '085711223344',
      alamat: 'Jl. Raya Gandusari No. 8, Blitar',
      tanggalMasuk: '10/08/2024',
      status: 'AKTIF',
      idMitraTerkait: 'MTR-KRY-003',
      rekeningGajiKode: 'REK-GAJI-KRY003',
      namaBank: 'Mandiri',
      noRekeningBank: '13700982312',
      atasNamaRekening: 'Hadi Sutrisno',
      catatan: 'Supir armada truk pengiriman gabah & pupuk',
    },
  ];

  // Seed Catatan Upah Harian untuk September 2026 (siap diakumulasi dan dibayarkan di tgl 1)
  const upahHarian: CatatanUpahHarian[] = [
    // Agus Supriyadi (Toko / Gudang)
    {
      id: 'UPH-260901-001',
      tanggalKerja: '01/09/2026',
      idKaryawan: 'KRY-001',
      nikKaryawan: 'KRY-001',
      namaKaryawan: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      divisi: 'CV Wijaya Agro',
      upahHarian: 135000,
      uangMakanLembur: 15000,
      totalUpahHarian: 150000,
      keterangan: 'Jaga kasir toko kios mitra & rekap penjualan',
      status: 'TERCATAT',
      createdAt: '2026-09-01T17:00:00.000Z',
    },
    {
      id: 'UPH-260902-001',
      tanggalKerja: '02/09/2026',
      idKaryawan: 'KRY-001',
      nikKaryawan: 'KRY-001',
      namaKaryawan: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      divisi: 'CV Wijaya Agro',
      upahHarian: 135000,
      uangMakanLembur: 15000,
      totalUpahHarian: 150000,
      keterangan: 'Jaga kasir & input transaksi bon mitra',
      status: 'TERCATAT',
      createdAt: '2026-09-02T17:00:00.000Z',
    },
    {
      id: 'UPH-260903-001',
      tanggalKerja: '03/09/2026',
      idKaryawan: 'KRY-001',
      nikKaryawan: 'KRY-001',
      namaKaryawan: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      divisi: 'Gudang Wijaya Agro',
      upahHarian: 135000,
      uangMakanLembur: 25000,
      totalUpahHarian: 160000,
      keterangan: 'Bantu administrasi penerimaan gabah panen gudang',
      status: 'TERCATAT',
      createdAt: '2026-09-03T18:00:00.000Z',
    },
    {
      id: 'UPH-260910-001',
      tanggalKerja: '10/09/2026',
      idKaryawan: 'KRY-001',
      nikKaryawan: 'KRY-001',
      namaKaryawan: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      divisi: 'CV Wijaya Agro',
      upahHarian: 135000,
      uangMakanLembur: 15000,
      totalUpahHarian: 150000,
      keterangan: 'Operasional harian kasir',
      status: 'TERCATAT',
      createdAt: '2026-09-10T17:00:00.000Z',
    },
    {
      id: 'UPH-260915-001',
      tanggalKerja: '15/09/2026',
      idKaryawan: 'KRY-001',
      nikKaryawan: 'KRY-001',
      namaKaryawan: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      divisi: 'Okussa',
      upahHarian: 135000,
      uangMakanLembur: 20000,
      totalUpahHarian: 155000,
      keterangan: 'Pencatatan distribusi beras kemasan Okussa',
      status: 'TERCATAT',
      createdAt: '2026-09-15T17:30:00.000Z',
    },
    {
      id: 'UPH-260920-001',
      tanggalKerja: '20/09/2026',
      idKaryawan: 'KRY-001',
      nikKaryawan: 'KRY-001',
      namaKaryawan: 'Agus Supriyadi',
      jabatan: 'Kasir & Admin Toko',
      divisi: 'CV Wijaya Agro',
      upahHarian: 135000,
      uangMakanLembur: 15000,
      totalUpahHarian: 150000,
      keterangan: 'Rekap kas harian toko',
      status: 'TERCATAT',
      createdAt: '2026-09-20T17:00:00.000Z',
    },

    // Bambang Pamungkas (Gudang Wijaya Agro & Wijaya Karya)
    {
      id: 'UPH-260901-002',
      tanggalKerja: '01/09/2026',
      idKaryawan: 'KRY-002',
      nikKaryawan: 'KRY-002',
      namaKaryawan: 'Bambang Pamungkas',
      jabatan: 'Staff Gudang & Timbang',
      divisi: 'Gudang Wijaya Agro',
      upahHarian: 125000,
      uangMakanLembur: 20000,
      totalUpahHarian: 145000,
      keterangan: 'Sortasi dan timbang gabah masuk 15 ton',
      status: 'TERCATAT',
      createdAt: '2026-09-01T17:00:00.000Z',
    },
    {
      id: 'UPH-260902-002',
      tanggalKerja: '02/09/2026',
      idKaryawan: 'KRY-002',
      nikKaryawan: 'KRY-002',
      namaKaryawan: 'Bambang Pamungkas',
      jabatan: 'Staff Gudang & Timbang',
      divisi: 'Gudang Wijaya Agro',
      upahHarian: 125000,
      uangMakanLembur: 20000,
      totalUpahHarian: 145000,
      keterangan: 'Penimbangan jagung pipil dan muat karung',
      status: 'TERCATAT',
      createdAt: '2026-09-02T17:00:00.000Z',
    },
    {
      id: 'UPH-260905-002',
      tanggalKerja: '05/09/2026',
      idKaryawan: 'KRY-002',
      nikKaryawan: 'KRY-002',
      namaKaryawan: 'Bambang Pamungkas',
      jabatan: 'Staff Gudang & Timbang',
      divisi: 'Wijaya Karya',
      upahHarian: 125000,
      uangMakanLembur: 35000,
      totalUpahHarian: 160000,
      keterangan: 'Perbaikan saringan elevator dryer pabrik',
      status: 'TERCATAT',
      createdAt: '2026-09-05T18:00:00.000Z',
    },
    {
      id: 'UPH-260912-002',
      tanggalKerja: '12/09/2026',
      idKaryawan: 'KRY-002',
      nikKaryawan: 'KRY-002',
      namaKaryawan: 'Bambang Pamungkas',
      jabatan: 'Staff Gudang & Timbang',
      divisi: 'Gudang Wijaya Agro',
      upahHarian: 125000,
      uangMakanLembur: 20000,
      totalUpahHarian: 145000,
      keterangan: 'Pengecekan kadar air dan timbang gabah',
      status: 'TERCATAT',
      createdAt: '2026-09-12T17:00:00.000Z',
    },
    {
      id: 'UPH-260918-002',
      tanggalKerja: '18/09/2026',
      idKaryawan: 'KRY-002',
      nikKaryawan: 'KRY-002',
      namaKaryawan: 'Bambang Pamungkas',
      jabatan: 'Staff Gudang & Timbang',
      divisi: 'PT Wijaya Agro Perkasa',
      upahHarian: 125000,
      uangMakanLembur: 25000,
      totalUpahHarian: 150000,
      keterangan: 'Bongkar muat beras pecah kulit di pabrik holding',
      status: 'TERCATAT',
      createdAt: '2026-09-18T17:30:00.000Z',
    },

    // Hadi Sutrisno (Wijaya Transport)
    {
      id: 'UPH-260901-003',
      tanggalKerja: '01/09/2026',
      idKaryawan: 'KRY-003',
      nikKaryawan: 'KRY-003',
      namaKaryawan: 'Hadi Sutrisno',
      jabatan: 'Supir Logistik & Pengiriman',
      divisi: 'Wijaya Transport',
      upahHarian: 140000,
      uangMakanLembur: 40000,
      totalUpahHarian: 180000,
      keterangan: 'Angkut gabah 8 ton dari petani Karanganyar ke Gudang',
      status: 'TERCATAT',
      createdAt: '2026-09-01T18:00:00.000Z',
    },
    {
      id: 'UPH-260904-003',
      tanggalKerja: '04/09/2026',
      idKaryawan: 'KRY-003',
      nikKaryawan: 'KRY-003',
      namaKaryawan: 'Hadi Sutrisno',
      jabatan: 'Supir Logistik & Pengiriman',
      divisi: 'Wijaya Transport',
      upahHarian: 140000,
      uangMakanLembur: 35000,
      totalUpahHarian: 175000,
      keterangan: 'Kirim pupuk NPK 100 sak ke kios mitra Tani Sejahtera',
      status: 'TERCATAT',
      createdAt: '2026-09-04T17:00:00.000Z',
    },
    {
      id: 'UPH-260911-003',
      tanggalKerja: '11/09/2026',
      idKaryawan: 'KRY-003',
      nikKaryawan: 'KRY-003',
      namaKaryawan: 'Hadi Sutrisno',
      jabatan: 'Supir Logistik & Pengiriman',
      divisi: 'Wijaya Transport',
      upahHarian: 140000,
      uangMakanLembur: 50000,
      totalUpahHarian: 190000,
      keterangan: 'Antar muatan jagung pipil ke pabrik pakan Kediri',
      status: 'TERCATAT',
      createdAt: '2026-09-11T19:30:00.000Z',
    },
    {
      id: 'UPH-260917-003',
      tanggalKerja: '17/09/2026',
      idKaryawan: 'KRY-003',
      nikKaryawan: 'KRY-003',
      namaKaryawan: 'Hadi Sutrisno',
      jabatan: 'Supir Logistik & Pengiriman',
      divisi: 'Wijaya Transport',
      upahHarian: 140000,
      uangMakanLembur: 35000,
      totalUpahHarian: 175000,
      keterangan: 'Ekspedisi beras Okussa ke distributor Surabaya',
      status: 'TERCATAT',
      createdAt: '2026-09-17T18:00:00.000Z',
    },
  ];

  const produk: Produk[] = [
    {
      kode: 'PRD-NPK16',
      kategori: 'PUPUK',
      nama: 'Pupuk NPK Mutiara 16-16-16 (50kg)',
      satuan: 'Sak',
      hargaBeli: 820000,
      hargaJual: 890000,
      status: 'AKTIF',
    },
    {
      kode: 'PRD-UREA',
      kategori: 'PUPUK',
      nama: 'Pupuk Urea Non-Subsidi Daun Buah (50kg)',
      satuan: 'Sak',
      hargaBeli: 450000,
      hargaJual: 510000,
      status: 'AKTIF',
    },
    {
      kode: 'PRD-RND1L',
      kategori: 'PESTISIDA',
      nama: 'Herbisida Roundup 486 SL (1 Liter)',
      satuan: 'Botol',
      hargaBeli: 95000,
      hargaJual: 115000,
      status: 'AKTIF',
    },
    {
      kode: 'PRD-GRAMOX',
      kategori: 'PESTISIDA',
      nama: 'Herbisida Gramoxone 276 SL (1 Liter)',
      satuan: 'Botol',
      hargaBeli: 85000,
      hargaJual: 105000,
      status: 'AKTIF',
    },
    {
      kode: 'PRD-P32',
      kategori: 'BENIH',
      nama: 'Benih Jagung Hibrida Pioneer P32 (5kg)',
      satuan: 'Sak',
      hargaBeli: 490000,
      hargaJual: 540000,
      status: 'AKTIF',
    },
    {
      kode: 'PRD-NK212',
      kategori: 'BENIH',
      nama: 'Benih Jagung Syngenta NK 212 (5kg)',
      satuan: 'Sak',
      hargaBeli: 470000,
      hargaJual: 520000,
      status: 'AKTIF',
    },
    {
      kode: 'PRD-SPR16L',
      kategori: 'ALAT_PERTANIAN',
      nama: 'Tangki Sprayer Elektrik CBA 16 Liter',
      satuan: 'Unit',
      hargaBeli: 380000,
      hargaJual: 440000,
      status: 'AKTIF',
    },
  ];

  const stokBarang: StokBarang[] = [
    {
      kode: 'PRD-NPK16',
      namaProduk: 'Pupuk NPK Mutiara 16-16-16 (50kg)',
      satuan: 'Sak',
      stok: 120,
      minimum: 20,
      updateTerakhir: now.iso,
    },
    {
      kode: 'PRD-UREA',
      namaProduk: 'Pupuk Urea Non-Subsidi Daun Buah (50kg)',
      satuan: 'Sak',
      stok: 150,
      minimum: 25,
      updateTerakhir: now.iso,
    },
    {
      kode: 'PRD-RND1L',
      namaProduk: 'Herbisida Roundup 486 SL (1 Liter)',
      satuan: 'Botol',
      stok: 85,
      minimum: 15,
      updateTerakhir: now.iso,
    },
    {
      kode: 'PRD-GRAMOX',
      namaProduk: 'Herbisida Gramoxone 276 SL (1 Liter)',
      satuan: 'Botol',
      stok: 60,
      minimum: 10,
      updateTerakhir: now.iso,
    },
    {
      kode: 'PRD-P32',
      namaProduk: 'Benih Jagung Hibrida Pioneer P32 (5kg)',
      satuan: 'Sak',
      stok: 75,
      minimum: 15,
      updateTerakhir: now.iso,
    },
    {
      kode: 'PRD-NK212',
      namaProduk: 'Benih Jagung Syngenta NK 212 (5kg)',
      satuan: 'Sak',
      stok: 50,
      minimum: 10,
      updateTerakhir: now.iso,
    },
    {
      kode: 'PRD-SPR16L',
      namaProduk: 'Tangki Sprayer Elektrik CBA 16 Liter',
      satuan: 'Unit',
      stok: 25,
      minimum: 5,
      updateTerakhir: now.iso,
    },
  ];

  const stokHasilBumi: StokHasilBumi[] = [
    {
      kode: 'HB-JAGUNG',
      nama: 'Jagung Pipil Kering (KA 14%)',
      satuan: 'Kg',
      stok: 14500,
      hargaBeliStandar: 4800,
      updateTerakhir: now.iso,
    },
    {
      kode: 'HB-GABAH',
      nama: 'Gabah Kering Panen (GKP)',
      satuan: 'Kg',
      stok: 8200,
      hargaBeliStandar: 6700,
      updateTerakhir: now.iso,
    },
    {
      kode: 'HB-SAWIT',
      nama: 'Kelapa Sawit Segar TBS',
      satuan: 'Kg',
      stok: 22000,
      hargaBeliStandar: 2450,
      updateTerakhir: now.iso,
    },
    {
      kode: 'HB-KOPI',
      nama: 'Kopi Robusta Asalan',
      satuan: 'Kg',
      stok: 3400,
      hargaBeliStandar: 42000,
      updateTerakhir: now.iso,
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'LOG-INIT-001',
      timestamp: now.iso,
      tanggal: now.tanggal,
      jam: now.jam,
      user: 'SISTEM',
      jenisTransaksi: 'CREATE',
      idTransaksi: 'SYS-INIT',
      detail: 'Inisialisasi database master rekening, produk, mitra, dan saldo awal ERP Wijaya Agro',
      nominal: 315000000,
      rekeningTerkait: 'ALL',
    },
  ];

  return {
    rekening,
    mitra,
    karyawan,
    upahHarian,
    penggajian: [],
    produk,
    stokBarang,
    stokHasilBumi,
    penjualan: [],
    pembelianHasilBumi: [],
    kasbonUang: [],
    bayarBon: [],
    transferRekening: [],
    auditLogs,
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
        const defaults = getDefaultDatabase();
        const merged: DatabaseSchema = {
          ...defaults,
          ...parsed,
          karyawan: Array.isArray(parsed.karyawan) && parsed.karyawan.length > 0 ? parsed.karyawan : defaults.karyawan,
          upahHarian: Array.isArray(parsed.upahHarian) && parsed.upahHarian.length > 0 ? parsed.upahHarian : defaults.upahHarian,
          penggajian: Array.isArray(parsed.penggajian) ? parsed.penggajian : [],
        };

        // Backfill bank & rekening gaji karyawan if missing
        for (const kry of merged.karyawan) {
          if (!kry.rekeningGajiKode) {
            kry.rekeningGajiKode = `REK-GAJI-${kry.nik.replace(/[^A-Za-z0-9]/g, '')}`;
          }
          const defKry = defaults.karyawan.find((d) => d.id === kry.id || d.nik === kry.nik);
          if (defKry) {
            if (!kry.namaBank) kry.namaBank = defKry.namaBank;
            if (!kry.noRekeningBank) kry.noRekeningBank = defKry.noRekeningBank;
            if (!kry.atasNamaRekening) kry.atasNamaRekening = defKry.atasNamaRekening;
          }
        }

        // Ensure all division accounts exist in merged.rekening
        for (const defRek of defaults.rekening) {
          if (!merged.rekening.some((r) => r.kode === defRek.kode)) {
            merged.rekening.push({ ...defRek });
          }
        }

        // Ensure every employee has an active matching Mitra with role 'KARYAWAN'
        for (const kry of merged.karyawan) {
          const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
          kry.idMitraTerkait = mitraId;
          const found = merged.mitra.find((m) => m.id === mitraId || m.kode === kry.nik);
          if (!found) {
            merged.mitra.push({
              id: mitraId,
              kode: kry.nik,
              nama: `${kry.nama} (Karyawan)`,
              role: 'KARYAWAN',
              telepon: kry.telepon,
              alamat: kry.alamat,
              status: kry.status,
              catatan: `Karyawan: ${kry.jabatan} (${kry.departemen})`,
            });
          } else {
            found.role = 'KARYAWAN';
            found.status = kry.status;
          }
        }

        return merged;
      }
    } catch (err) {
      console.error('Failed to read db file, creating fresh default:', err);
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
   * Synchronize Virtual Accounts BON01 (Kasbon/Piutang Customer) and TIT01 (Titip Supplier)
   * BON01 = Total Sisa Piutang Penjualan Kasbon + Total Sisa Kasbon Uang
   * TIT01 = Total Sisa Titip Pembelian Hasil Bumi Belum Diambil
   */
  public synchronizeVirtualAccounts() {
    // Calculate total outstanding kasbon barang
    const totalKasbonBarang = this.db.penjualan
      .filter((p) => p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
      .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

    // Calculate total outstanding kasbon uang
    const totalKasbonUang = this.db.kasbonUang
      .filter((k) => k.status !== 'LUNAS')
      .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

    const totalBon = totalKasbonBarang + totalKasbonUang;

    // Calculate total outstanding titip
    const totalTitip = this.db.pembelianHasilBumi
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
