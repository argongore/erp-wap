// Types for ERP Wijaya Agro

export type StatusAktif = 'AKTIF' | 'NONAKTIF';

export type RoleMitra = 'CUSTOMER' | 'SUPPLIER' | 'MITRA_TANI' | 'KARYAWAN' | 'ALL';

export type MetodePembayaran = 'TUNAI' | 'TRANSFER' | 'KASBON' | 'TITIP';

export interface Rekening {
  kode: string;          // e.g. "KAS01", "BNI01", "BCA01", "MAN01", "BRI01", "BER01", "BON01", "TIT01"
  nama: string;          // e.g. "Kas Utama Kasir", "Bank BNI Operasional", etc.
  atasNama: string;      // e.g. "PT Wijaya Agro"
  nomorRekening: string; // e.g. "0847291048"
  saldoAwal: number;
  saldoSaatIni: number;
  status: StatusAktif;
  isVirtual?: boolean;   // true for BON01 (Kasbon Customer) and TIT01 (Titip Supplier)
  keterangan?: string;
}

export interface Mitra {
  id: string;
  kode: string;
  nama: string;
  role: RoleMitra;
  telepon: string;
  alamat: string;
  status: StatusAktif;
  catatan?: string;
}

export interface Produk {
  kode: string;
  kategori: 'PUPUK' | 'PESTISIDA' | 'BENIH' | 'ALAT_PERTANIAN' | 'LAINNYA';
  nama: string;
  satuan: string;
  hargaBeli: number;
  hargaJual: number;
  status: StatusAktif;
}

export interface StokBarang {
  kode: string;
  namaProduk: string;
  satuan: string;
  stok: number;
  minimum: number;
  updateTerakhir: string;
}

export interface StokHasilBumi {
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  hargaBeliStandar: number;
  updateTerakhir: string;
}

export interface ItemPenjualan {
  kodeProduk: string;
  namaProduk: string;
  satuan: string;
  qty: number;
  harga: number;
  subtotal: number;
}

export interface TransaksiPenjualan {
  noPenjualan: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  metode: 'TUNAI' | 'TRANSFER' | 'KASBON';
  rekeningTujuan: string; // KAS01 for TUNAI, bank for TRANSFER, BON01 for KASBON
  items: ItemPenjualan[];
  totalNominal: number;
  statusPembayaran: 'LUNAS' | 'BELUM_BAYAR';
  sisaPiutang: number;   // outstanding balance for KASBON
  keterangan: string;
  createdAt: string;
}

export interface TransaksiPembelianHasilBumi {
  noPembelian: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  komoditasKode: string;
  komoditasNama: string;
  beratKotor: number;    // Kg
  potonganRafaksi: number; // %
  beratBersih: number;   // Kg
  hargaPerKg: number;
  totalNominal: number;
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
  rekeningSumber: string; // KAS01 for TUNAI, bank for TRANSFER, TIT01 for TITIP
  status: 'LUNAS' | 'BELUM_DIAMBIL' | 'TITIP';
  keterangan: string;
  createdAt: string;
}

export interface TransaksiKasbonUang {
  idTransaksi: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  jenisTransaksi: 'KASBON UANG';
  metode: 'TUNAI' | 'TRANSFER';
  rekeningSumber: string; // KAS01 or chosen bank (BNI01, BCA01, etc.)
  nominal: number;
  sisaKasbon: number;
  keterangan: string;
  status: 'BELUM LUNAS' | 'SEBAGIAN' | 'LUNAS';
  createdAt: string;
}

export interface AlokasiPembayaranBon {
  jenis: 'KASBON_BARANG' | 'KASBON_UANG';
  refId: string;
  nominalSebelum: number;
  nominalDibayar: number;
  nominalSisa: number;
}

export interface TransaksiBayarBon {
  idTransaksi: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  totalBonSebelum: number;
  nominalBayar: number;
  sisaBonSetelah: number;
  metode: 'TUNAI' | 'TRANSFER';
  rekeningTujuan: string; // KAS01 or chosen bank
  alokasi: AlokasiPembayaranBon[];
  keterangan: string;
  createdAt: string;
}

export interface TransaksiTransferRekening {
  noTransfer: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  rekeningSumber: string;
  rekeningTujuan: string;
  nominal: number;
  keterangan: string;
  status: 'BERHASIL';
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;     // ISO string
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  user: string;
  jenisTransaksi: 'CREATE' | 'UPDATE' | 'PAYMENT' | 'TRANSFER' | 'VOID' | 'PAYROLL';
  idTransaksi: string;
  detail: string;
  nominal: number;
  rekeningTerkait?: string;
}

export interface Karyawan {
  id: string;              // e.g. "KRY-001"
  nik: string;             // e.g. "KRY-001"
  nama: string;
  jabatan: string;         // e.g. "Kasir Toko", "Staff Gudang", "Supir Logistik", "Admin Keuangan", "Tenaga Lapangan"
  departemen: string;      // e.g. "Toko Saprotan", "Gudang Hasil Bumi", "Logistik", "Administrasi"
  gajiPokok: number;       // Standar gaji harian/bulanan
  tunjanganTetap: number;  // Tunjangan tetap bulanan
  telepon: string;
  alamat: string;
  tanggalMasuk: string;    // DD/MM/YYYY
  status: StatusAktif;
  idMitraTerkait: string;  // ID mitra di tabel Mitra (role: KARYAWAN) agar otomatis bisa transaksi kasbon
  rekeningGajiKode?: string; // e.g. "REK-GAJI-KRY001" (Buku rekening gaji karyawan)
  namaBank?: string;       // e.g. "BCA", "BRI", "Mandiri", "BNI"
  noRekeningBank?: string; // No rekening karyawan untuk transfer
  atasNamaRekening?: string; // Nama pemilik rekening bank
  catatan?: string;
}

export interface CatatanUpahHarian {
  id: string;              // e.g. "UPH-260924-001"
  tanggalKerja: string;    // DD/MM/YYYY
  idKaryawan: string;
  nikKaryawan: string;
  namaKaryawan: string;
  jabatan: string;
  divisi: NamaDivisi;      // Divisi penugasan hari ini
  upahHarian: number;      // Nominal upah harian pokok
  uangMakanLembur: number; // Tunjangan makan/lembur/bonus
  totalUpahHarian: number; // upahHarian + uangMakanLembur
  keterangan?: string;
  status: 'TERCATAT' | 'SUDAH_DIBAYAR'; // TERCATAT = akumulasi berjalan di rekening karyawan, SUDAH_DIBAYAR = sudah di-settle di tgl 1
  idPayrollSettlement?: string; // ID transaksi penggajian bulanan saat dicairkan
  tanggalDibayar?: string;
  createdAt: string;
}

export type NamaDivisi =
  | 'Gudang Wijaya Agro'
  | 'Wijaya Karya'
  | 'Wijaya Transport'
  | 'CV Wijaya Agro'
  | 'PT Wijaya Agro Perkasa'
  | 'Okussa';

export const DAFTAR_DIVISI: Array<{
  id: string;
  nama: NamaDivisi;
  kodeRekening: string;
  penanggungJawab: string;
  deskripsi: string;
}> = [
  {
    id: 'DIV-GWA',
    nama: 'Gudang Wijaya Agro',
    kodeRekening: 'REK-GWA',
    penanggungJawab: 'Koordinator Gudang & Sortasi',
    deskripsi: 'Unit penampungan, pengeringan, sortasi gabah & pergudangan saprotan.',
  },
  {
    id: 'DIV-WK',
    nama: 'Wijaya Karya',
    kodeRekening: 'REK-WK',
    penanggungJawab: 'Pelaksana Proyek & Bengkel',
    deskripsi: 'Pekerjaan konstruksi, perbaikan infrastruktur pabrik, dryer & mesin.',
  },
  {
    id: 'DIV-WT',
    nama: 'Wijaya Transport',
    kodeRekening: 'REK-WT',
    penanggungJawab: 'Kepala Operasional Logistik Truk',
    deskripsi: 'Armada angkutan truk komoditas hasil bumi & ekspedisi pupuk/benih.',
  },
  {
    id: 'DIV-CVA',
    nama: 'CV Wijaya Agro',
    kodeRekening: 'REK-CVA',
    penanggungJawab: 'Manajer Operasional CV',
    deskripsi: 'Entitas perdagangan lokal saprotan kios mitra & suplai tani daerah.',
  },
  {
    id: 'DIV-WAP',
    nama: 'PT Wijaya Agro Perkasa',
    kodeRekening: 'REK-WAP',
    penanggungJawab: 'General Manager Holding WAP',
    deskripsi: 'Perusahaan induk pengolahan gabah skala besar & kemitraan nasional.',
  },
  {
    id: 'DIV-OKU',
    nama: 'Okussa',
    kodeRekening: 'REK-OKU',
    penanggungJawab: 'Koordinator Brand & Distribusi Okussa',
    deskripsi: 'Unit bisnis komoditas & produk beras kemasan premium Okussa.',
  },
];

export interface TransaksiPenggajian {
  id: string;              // e.g. "GAJI-260923-001"
  slipNomor: string;       // e.g. "SLIP/WA/2026/09/001"
  tanggal: string;         // DD/MM/YYYY
  jam: string;             // HH:mm:ss
  tanggalKerja?: string;   // DD/MM/YYYY
  idKaryawan: string;
  nikKaryawan: string;
  namaKaryawan: string;
  jabatan: string;
  departemen: string;
  divisi: NamaDivisi;      // Divisi utama / penugasan
  tipeGaji: 'HARIAN' | 'BULANAN';
  periodeBulan: string;    // e.g. "Harian - 24/09/2026" atau "September 2026"
  gajiPokok: number;       // Nominal upah harian / akumulasi pokok
  tunjangan: number;
  bonus: number;           // Uang makan / lembur / bonus
  totalGajiKotor: number;
  totalKasbonAwal: number;
  persentasePotongKasbon: number; // e.g. 100, 50, 25, 0 atau persentase kustom
  potonganKasbon: number;
  sisaKasbonAkhir: number;
  gajiBersihDibayar: number; // totalGajiKotor - potonganKasbon
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'SPLIT';
  rekeningSumber: string;  // Rekening kas/bank utama pembayaran (KAS01, REK-GWA, etc.)
  // Split payment fields (jika sebagian cash dan sebagian transfer)
  nominalTunai?: number;
  rekeningSumberTunai?: string;
  nominalTransfer?: number;
  rekeningSumberTransfer?: string;
  detailBankKaryawan?: string;
  // Detail akumulasi hari kerja
  jumlahHariKerja?: number;
  daftarUpahHarianIds?: string[];
  rincianDivisi?: Array<{ divisi: NamaDivisi; hari: number; total: number }>;
  keterangan?: string;
  idBayarBonTerkait?: string;
}

export interface RekapGajiKaryawanBulanan {
  idKaryawan: string;
  nikKaryawan: string;
  namaKaryawan: string;
  jabatan: string;
  departemen: string;
  rekeningGajiKode: string;
  namaBank?: string;
  noRekeningBank?: string;
  atasNamaRekening?: string;
  periodeBulan: string;    // e.g. "September 2026"
  jumlahHariKerja: number;
  totalUpahHarianPokok: number;
  totalUangMakanLembur: number;
  totalGajiKotor: number;
  daftarHariKerja: CatatanUpahHarian[];
  rincianDivisi: Array<{ divisi: NamaDivisi; hari: number; total: number }>;
  // Kasbon sebulan berjalan
  kasbonUangBerjalan: number;
  kasbonBarangBerjalan: number;
  totalKasbonAktif: number;
  // Perhitungan settlement siap bayar
  estimasiPotongKasbon: number;
  estimasiGajiBersih: number;
  statusPembayaran: 'BELUM_DIBAYAR' | 'SUDAH_LUNAS';
  terakhirDibayar?: TransaksiPenggajian;
}

export interface MutasiBukuRekeningKaryawan {
  id: string;
  tanggal: string;
  jam: string;
  jenis: 'UPAH_HARIAN' | 'KASBON_UANG' | 'KASBON_BARANG' | 'BAYAR_GAJI';
  keterangan: string;
  divisi?: NamaDivisi;
  kredit: number; // Menambah saldo hak gaji karyawan (upah harian)
  debet: number;  // Mengurangi saldo / kasbon diambil / gaji telah dibayarkan
  saldoBerjalan: number; // Saldo akumulasi gaji yang belum dibayarkan
  refId: string;
}

export interface BukuRekeningKaryawanSummary {
  karyawan: Karyawan;
  rekeningGajiKode: string;
  periodeAktif: string;
  totalHariKerjaBulanIni: number;
  saldoGajiBerjalan: number; // Hak upah harian yang belum dibayar
  totalKasbonAktif: number;  // Kasbon yang belum lunas
  estimasiGajiBersihSiapBayar: number; // Saldo gaji berjalan - Kasbon
  mutasi: MutasiBukuRekeningKaryawan[];
}

export interface MutasiKeuanganDivisi {
  id: string;
  tanggal: string;
  jam: string;
  jenis: 'DROPPING_MASUK' | 'TRANSFER_KELUAR' | 'GAJI_KARYAWAN' | 'LAINNYA';
  keterangan: string;
  masuk: number;
  keluar: number;
  saldoSetelah: number;
  refId: string;
  karyawanTerkait?: string;
}

export interface PergerakanKeuanganDivisiSummary {
  divisi: NamaDivisi;
  idDivisi: string;
  kodeRekening: string;
  namaRekening: string;
  saldoSaatIni: number;
  totalDroppingMasuk: number;
  totalGajiKeluar: number;
  totalTransferKeluar: number;
  totalTransaksiGaji: number;
  daftarKaryawanTerakhir: string[];
  mutasi: MutasiKeuanganDivisi[];
}

export interface RekeningKoranMitraSummary {
  idMitra: string;
  kodeMitra: string;
  namaMitra: string;
  role: RoleMitra;
  telepon: string;
  alamat: string;
  status: StatusAktif;
  totalKasbonBarang: number;     // Total outstanding bon dari penjualan barang
  totalKasbonUang: number;       // Total outstanding kasbon uang
  totalTitip: number;            // Total hutang perusahaan ke mitra (hasil bumi titip)
  totalPembayaranBon: number;    // Total uang pembayaran bon yang sudah disetor mitra
  totalBonKeseluruhan: number;   // totalKasbonBarang + totalKasbonUang
  sisaBon: number;               // Sama dengan totalBonKeseluruhan saat ini
  history: Array<{
    id: string;
    tanggal: string;
    jam: string;
    jenis: string;
    keterangan: string;
    debet: number;   // Menambah hutang mitra / bon
    kredit: number;  // Mengurangi hutang mitra / bon
    saldoAkumulasi: number;
  }>;
}
