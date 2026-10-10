// Types for ERP Wijaya Agro

export type StatusAktif = 'AKTIF' | 'NONAKTIF';

export type RoleMitra = 'CUSTOMER' | 'SUPPLIER' | 'MITRA_TANI' | 'KARYAWAN' | 'ALL';

export type MetodePembayaran = 'TUNAI' | 'TRANSFER' | 'KASBON' | 'TITIP';

export type KategoriRekening = 'PERUSAHAAN' | 'OPERASIONAL_DIVISI' | 'VIRTUAL_SISTEM';

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
  kategori?: KategoriRekening; // PERUSAHAAN (Penyimpanan Utama) vs OPERASIONAL_DIVISI (Tracking Pergerakan)
  rekeningIndukPenyimpan?: string; // Rekening perusahaan tempat fisik uang disimpan
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

export interface RekapMitraItem {
  id: string;
  kode: string;
  nama: string;
  role: RoleMitra;
  telepon: string;
  alamat: string;
  status: StatusAktif;
  catatan?: string;
  // Hutang kita pada mitra (Titip Hasil Bumi belum diambil uangnya)
  totalHutangTitipPanen: number;
  // Bon mitra (Piutang kita pada mitra)
  totalKasbonBarang: number;
  totalKasbonUang: number;
  totalBonMitra: number;
  // Posisi Bersih: totalHutangTitipPanen - totalBonMitra
  saldoBersih: number;
  posisiStatus: 'KITA_BERHUTANG' | 'MITRA_BERHUTANG' | 'LUNAS_IMPAS';
  totalTransaksiCount: number;
}

export interface RekapMasterMitraSummary {
  totalMitra: number;
  totalHutangPerusahaanKeMitra: number; // Total titipan hasil bumi yang belum diambil uangnya
  totalBonMitra: number;                // Total kasbon barang + uang mitra
  saldoBersihKemitraan: number;         // Total titip - Total bon
  mitraDenganHutangTitipCount: number;  // Jumlah mitra yang punya saldo titip belum cair
  mitraDenganBonCount: number;          // Jumlah mitra yang memiliki kewajiban bon aktif
  items: RekapMitraItem[];
}

export interface RekapKaryawanItem {
  id: string;
  nik: string;
  nama: string;
  jabatan: string;
  departemen: string;
  telepon: string;
  alamat: string;
  status: StatusAktif;
  divisiTerakhir: NamaDivisi;
  standarGajiPokok: number;
  tunjanganTetap: number;
  totalHariKerja: number;
  totalHakUpahHarian: number;      // Akumulasi seluruh upah harian tercatat
  totalUpahBelumDibayar: number;   // Status TERCATAT (hak upah berjalan)
  totalUpahSudahDibayar: number;   // Status SUDAH_DIBAYAR
  totalKasbonBarang: number;       // Kasbon barang toko dari kasir
  totalKasbonUang: number;         // Kasbon uang dari kasir
  totalBonKaryawan: number;        // Kasbon barang + kasbon uang
  saldoBersih: number;             // totalUpahBelumDibayar - totalBonKaryawan
  posisiStatus: 'PERUSAHAAN_BERHUTANG_UPAH' | 'KARYAWAN_BERHUTANG_BON' | 'LUNAS_IMPAS';
  pekerjaanHarianTerakhir?: string;
  tanggalKerjaTerakhir?: string;
  idMitraTerkait: string;
}

export interface RekapMasterKaryawanSummary {
  totalKaryawan: number;
  totalHakUpahBelumDibayar: number;  // Total kewajiban upah perusahaan ke pekerja
  totalBonKaryawan: number;          // Total piutang kasbon karyawan
  saldoBersihPenggajian: number;     // Total upah belum dibayar - Total bon
  karyawanDenganUpahPendingCount: number;
  karyawanDenganBonCount: number;
  items: RekapKaryawanItem[];
}

export interface DetailHarianKaryawanResponse {
  karyawan: RekapKaryawanItem;
  logHarian: CatatanUpahHarian[];
  riwayatGaji: TransaksiPenggajian[];
  riwayatKasbonBarang: any[];
  riwayatKasbonUang: TransaksiKasbonUang[];
  riwayatBayarBon: TransaksiBayarBon[];
}

export interface ItemRincianHarianPayroll {
  id: string;
  tanggal: string; // DD/MM/YYYY
  hariTanggal?: string;
  divisi: NamaDivisi;
  divisiKode?: string;
  item?: string;
  kuantiti?: number;
  harga?: number;
  jumlah?: number;
  ket?: 'BON' | 'LUNAS';
  catatan?: string;
  tugas: string;
  upahHarian: number;
  uangMakanLembur: number;
  totalUpah: number;
  status: 'TERCATAT' | 'SUDAH_DIBAYAR';
  refSlipGaji?: string;
  tanggalDibayar?: string;
}

export interface ItemDetailProdukBon {
  kodeProduk: string;
  namaProduk: string;
  qty: number;
  satuan: string;
  harga: number;
  subtotal: number;
}

export interface ItemBonBarangKaryawan {
  noPenjualan: string;
  tanggal: string;
  jam: string;
  totalNominal: number;
  sisaPiutang: number;
  statusPembayaran: 'BELUM_BAYAR' | 'LUNAS';
  keterangan: string;
  items: ItemDetailProdukBon[];
}

export interface ItemBonUangKaryawan {
  idTransaksi: string;
  tanggal: string;
  jam: string;
  nominal: number;
  sisaKasbon: number;
  keterangan: string;
  rekeningSumber: string;
  status: 'BELUM LUNAS' | 'SEBAGIAN' | 'LUNAS';
}

export interface ItemRekapPayrollBulanan {
  idKaryawan: string;
  nik: string;
  nama: string;
  jabatan: string;
  departemen: string;
  divisiUtama: NamaDivisi;
  daftarDivisiBekerja: NamaDivisi[];
  totalHariKerja: number;
  totalUpahPokok: number;
  totalUangMakanLembur: number;
  totalGajiKotor: number;
  totalPotonganBon: number;
  totalGajiBersihDibayar: number;
  totalHakUpahPending: number;
  sisaKasbonBarang: number;
  sisaKasbonUang: number;
  totalSisaBonKaryawan: number;
  saldoBersih: number; // totalHakUpahPending - totalSisaBonKaryawan
  posisiStatus: 'PERUSAHAAN_BERHUTANG_UPAH' | 'KARYAWAN_BERHUTANG_BON' | 'LUNAS_IMPAS';
  rincianHarian: ItemRincianHarianPayroll[];
  rincianBonBarang?: ItemBonBarangKaryawan[];
  rincianBonUang?: ItemBonUangKaryawan[];
}

export interface RekapPayrollBulananSummary {
  periodeBulan: string; // e.g. "September 2026"
  bulan: number;
  tahun: number;
  totalPekerja: number;
  totalHariKerja: number;
  totalGajiKotor: number;
  totalPotonganBon: number;
  totalGajiBersihDibayar: number;
  totalHakUpahPending: number;
  totalSisaBonKaryawan: number;
  items: ItemRekapPayrollBulanan[];
}

export interface Produk {
  kode: string;
  kategori: 'PUPUK' | 'PESTISIDA' | 'BENIH' | 'ALAT_PERTANIAN' | 'BERAS' | 'SEMBAKO' | 'LAINNYA';
  nama: string;
  satuan: string;
  hargaBeli: number; // HPP Modal / Harga Kulakan Terakhir
  hargaJual: number; // Sugesti Harga Jual Umum / Eceran
  hargaKhususRekanan?: number; // Sugesti Harga Khusus Mitra / Rekanan
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
  isBelumPutusHarga?: boolean;
  keterangan?: string;
  // Rekap Stok Lama & Rata-rata Pembelian Sebelum Aplikasi
  stokAwal?: number;              // Saldo fisik gudang rekap manual lalu (Kg)
  modalAwalTotal?: number;        // Akumulasi modal uang keluar lama (Rp)
  rataRataModalAwal?: number;     // Rata-rata modal beli lama (Rp/Kg)
  keteranganStokAwal?: string;    // Catatan histori rekap manual lama
  tanggalInputStokAwal?: string;  // Tanggal pencatatan saldo awal
}

export interface ItemPenjualan {
  kodeProduk: string;
  namaProduk: string;
  satuan: string;
  qty: number;
  hargaBeli: number;      // Modal HPP per satuan saat transaksi
  hargaSugesti?: number;  // Harga yang disugestikan sistem sebelum nego
  harga: number;          // Harga deal / nego per satuan
  subtotal: number;       // qty * harga
  labaKotor?: number;     // (harga - hargaBeli) * qty
}

export interface TransaksiPenjualan {
  noPenjualan: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  tipePembeli?: 'UMUM' | 'REKANAN'; // Pelanggan Umum atau Mitra Rekanan
  metode: 'TUNAI' | 'TRANSFER' | 'KASBON';
  rekeningTujuan: string; // KAS01 for TUNAI, bank for TRANSFER, BON01 for KASBON
  items: ItemPenjualan[];
  totalModalHpp?: number;  // Akumulasi modal HPP
  totalNominal: number;    // Akumulasi harga jual / omzet
  totalLabaKotor?: number; // totalNominal - totalModalHpp
  statusPembayaran: 'LUNAS' | 'BELUM_BAYAR';
  sisaPiutang: number;   // outstanding balance for KASBON
  keterangan: string;
  createdAt: string;
}

export interface ItemPembelianBarang {
  kodeProduk: string;
  namaProduk: string;
  satuan: string;
  qty: number;
  hargaBeliSatuan: number; // Harga beli kulakan baru
  subtotal: number;
  stokSebelum?: number;
  stokSetelah?: number;
}

export interface TransaksiPembelianBarang {
  noPembelian: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;       // Supplier
  namaMitra: string;
  isDistributorManual?: boolean;
  namaDistributorManual?: string;
  noFakturSupplier?: string;
  fotoNota?: string;     // Base64 data URL / image link of invoice or physical receipt
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'HUTANG';
  rekeningSumber: string; // KAS01 for TUNAI, bank for TRANSFER, TIT01 for HUTANG
  items: ItemPembelianBarang[];
  totalNominal: number;
  status: 'LUNAS' | 'HUTANG_BELUM_LUNAS';
  keterangan: string;
  createdAt: string;
}

export interface LabaRugiProdukItem {
  kodeProduk: string;
  namaProduk: string;
  satuan: string;
  kategori: string;
  totalQtyTerjual: number;
  totalOmzet: number;
  totalHppModal: number;
  totalLabaKotor: number;
  persentaseMargin: number;
  stokSaatIni: number;
  hargaBeliSaatIni: number;
  hargaJualSugesti: number;
  hargaKhususRekanan?: number;
}

export interface LabaRugiSummary {
  periode: string;
  totalPenjualanTransaksi: number;
  totalOmzet: number;
  totalHppModal: number;
  totalLabaKotor: number;
  persentaseMarginRataRata: number;
  produkTerlaris: string;
  totalPembelianBarangMasuk: number;
  items: LabaRugiProdukItem[];
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
  status: 'LUNAS' | 'BELUM_DIAMBIL' | 'TITIP' | 'BELUM_PUTUS_HARGA';
  isBelumPutusHarga?: boolean;
  statusHarga?: 'HARGA_PUTUS' | 'BELUM_PUTUS_HARGA';
  tanggalPutusHarga?: string;
  fotoNota?: string;     // Base64 data URL / image link of weighing receipt or physical slip
  driveFileUrl?: string; // Link URL ke Google Drive bukti nota fisik
  driveFileId?: string;  // Google Drive File ID
  driveFolderPath?: string; // e.g. NOTA LALU / HUTANG NOTA LAMA
  isNotaLalu?: boolean;  // Menandai transaksi titipan panen / saldo titip masa lalu
  noNotaLalu?: string;   // Nomor dokumen fisik / faktur nota lalu manual
  tanggalNotaLalu?: string;
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
  fotoNota?: string;     // Capture foto detail fisik nota lalu / slip kasbon manual
  driveFileUrl?: string; // Link URL ke Google Drive bukti nota fisik
  driveFileId?: string;  // Google Drive File ID
  driveFolderPath?: string; // e.g. NOTA LALU / PIUTANG NOTA LAMA
  isNotaLalu?: boolean;  // Menandai piutang barang / bon masa lalu bertahun-tahun
  noNotaLalu?: string;   // Nomor nota manual lama
  tanggalNotaLalu?: string;
  rincianBarangNotaLalu?: string;
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
  hariTanggal?: string;    // e.g. "SELASA 01 SEP", "RABU 2 SEP", "KAMIS 3 SEP"
  idKaryawan: string;
  nikKaryawan: string;
  namaKaryawan: string;
  jabatan: string;
  divisi: NamaDivisi;      // Divisi penugasan hari ini
  divisiKode?: string;     // e.g. "WIJAYA TRANS", "GWA", "CV WA", "PTWAP", "WIJAYA KARYA", "OKUSSA"
  kategori?: string;       // Default "KELUAR"
  rekening?: string;       // Default "HUTANG"
  jenisDana?: string;      // Default "GAJI"
  item?: string;           // e.g. "KERJA GUDANG", "SURJAL", "DRIVER TRUK", "LEMBUR", "BONGKAR BARANG", "BONGKAR PUPUK", "NGEBAL", "JALAN", "JAJAN"
  kuantiti?: number;       // e.g. 1, 2, 0.5, 0
  harga?: number;          // e.g. 140000, 100000, 75000, 50000, 800000
  jumlah?: number;         // kuantiti * harga
  ket?: 'BON' | 'LUNAS';   // Status pengakuan di lembar keuangan: BON (oranye) / LUNAS (biru)
  catatan?: string;        // e.g. "SAKIT", "LIBUR", "CUTI", "ROSTING", "NGIPAS", "PLUS LEMBUR", "NGEPAK BKF", "ARYA MIN", "MBL ARYA"
  noInv?: string;
  alamat?: string;
  noTelp?: string;
  upahHarian: number;      // Nominal upah harian pokok
  uangMakanLembur: number; // Tunjangan makan/lembur/bonus
  totalUpahHarian: number; // upahHarian + uangMakanLembur (sama dengan jumlah)
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

export interface RekeningKoranItemDetail {
  nama: string;
  qty: number;
  satuan: string;
  harga: number;
  subtotal: number;
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
    qtyDisplay: string;         // e.g. "10 Sak", "200 Kg", "1 (Uang)"
    hargaSatuanDisplay: string; // e.g. "Rp 135.000", "Rp 500.000"
    itemsDetail?: RekeningKoranItemDetail[];
    debet: number;   // Menambah hutang mitra / bon
    kredit: number;  // Mengurangi hutang mitra / bon
    saldoAkumulasi: number;
    fotoNota?: string;
    isNotaLalu?: boolean;
    noNotaLalu?: string;
  }>;
}

// ==========================================
// MODULAR SPREADSHEET DATABASE TYPES
// ==========================================
export type SpreadsheetCategory =
  | 'karyawan'
  | 'mitra'
  | 'transaksi'
  | 'hasil_bumi'
  | 'barang_saprotan';

export interface SpreadsheetSheetSummary {
  sheetName: string;
  label: string;
  rowCount: number;
  columnCount: number;
  description: string;
  primaryKey: string;
}

export interface SpreadsheetFileInfo {
  id: SpreadsheetCategory;
  fileName: string;
  namaDatabase: string;
  icon: string;
  warnaTema: string;
  deskripsi: string;
  totalSheets: number;
  totalBaris: number;
  ukuranFileKiraKira: string;
  updateTerakhir: string;
  sheets: SpreadsheetSheetSummary[];
}

export interface SpreadsheetOverviewResponse {
  totalFiles: number;
  totalSheets: number;
  totalRecords: number;
  statusSinkronisasi: 'TERHUBUNG_LENGKAP' | 'PERLU_SYNC';
  updateTerakhir: string;
  files: SpreadsheetFileInfo[];
}

export interface SpreadsheetSheetDataResponse {
  category: SpreadsheetCategory;
  fileName: string;
  sheetName: string;
  sheetLabel: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  totalRows: number;
  footerSummary?: Record<string, any>;
}

