// Types for ERP Wijaya Agro

export type StatusAktif = 'AKTIF' | 'NONAKTIF';

export type RoleMitra =
  | 'SUPPLIER'
  | 'CUSTOMER'
  | 'SUPPLIER_CUSTOMER'
  | 'ANAK_PERUSAHAAN'
  | 'KARYAWAN'
  | 'MITRA_TANI'
  | 'ALL';

export type CanonicalRoleMitra =
  | 'SUPPLIER'
  | 'CUSTOMER'
  | 'SUPPLIER_CUSTOMER'
  | 'ANAK_PERUSAHAAN'
  | 'KARYAWAN';

export const DAFTAR_ROLE_MITRA: Array<{
  value: CanonicalRoleMitra;
  label: string;
  deskripsi: string;
}> = [
  {
    value: 'SUPPLIER',
    label: 'Supplier',
    deskripsi: 'Pemasok hasil bumi atau barang dagangan ke PT',
  },
  {
    value: 'CUSTOMER',
    label: 'Customer',
    deskripsi: 'Pelanggan pembeli barang toko atau komoditas',
  },
  {
    value: 'SUPPLIER_CUSTOMER',
    label: 'Supplier dan Customer',
    deskripsi: 'Mitra dua arah (pemasok panen sekaligus pelanggan toko/bon)',
  },
  {
    value: 'ANAK_PERUSAHAAN',
    label: 'Anak Perusahaan',
    deskripsi: 'Unit afiliasi / anak perusahaan terintegrasi (mis. DP Parabot)',
  },
  {
    value: 'KARYAWAN',
    label: 'Karyawan dan Mitra',
    deskripsi: 'Karyawan PT sekaligus akun mitra terpadu (upah, kasbon, & titipan)',
  },
];

export function normalizeRoleMitra(
  role?: string | null,
  opts?: { isAnakPerusahaan?: boolean; isKaryawan?: boolean }
): CanonicalRoleMitra {
  if (opts?.isAnakPerusahaan || role === 'ANAK_PERUSAHAAN') return 'ANAK_PERUSAHAAN';
  if (opts?.isKaryawan || role === 'KARYAWAN' || role === 'KARYAWAN_MITRA') return 'KARYAWAN';
  const r = String(role || '').trim().toUpperCase();
  if (r === 'SUPPLIER') return 'SUPPLIER';
  if (r === 'CUSTOMER') return 'CUSTOMER';
  if (r === 'SUPPLIER_CUSTOMER' || r === 'ALL' || r === 'MITRA_TANI') return 'SUPPLIER_CUSTOMER';
  return 'SUPPLIER_CUSTOMER';
}

export function getRoleMitraLabel(
  role?: string | null,
  opts?: { isAnakPerusahaan?: boolean; isKaryawan?: boolean }
): string {
  const canonical = normalizeRoleMitra(role, opts);
  switch (canonical) {
    case 'SUPPLIER':
      return 'Supplier';
    case 'CUSTOMER':
      return 'Customer';
    case 'SUPPLIER_CUSTOMER':
      return 'Supplier dan Customer';
    case 'ANAK_PERUSAHAAN':
      return 'Anak Perusahaan';
    case 'KARYAWAN':
      return 'Karyawan dan Mitra';
  }
}

export interface RiwayatDivisiKaryawan {
  id: string;
  tanggal: string; // DD/MM/YYYY
  periodeBulan?: string; // e.g. "Oktober 2026"
  divisiSebelumnya?: string;
  divisiBaru: string;
  jabatanSebelumnya?: string;
  jabatanBaru?: string;
  catatan?: string;
}

export type MetodePembayaran = 'TUNAI' | 'TRANSFER' | 'KASBON' | 'TITIP' | 'SINKRON';

export type KategoriRekening = 'PERUSAHAAN' | 'ANAK_PERUSAHAAN' | 'OPERASIONAL_DIVISI' | 'VIRTUAL_SISTEM';

export interface Rekening {
  kode: string;          // e.g. "KAS01", "BNI01", "BCA01", "REK-DPPARABO", "BON01", "TIT01"
  nama: string;          // e.g. "Kas Utama Kasir", "DP Parabot", etc.
  atasNama: string;      // e.g. "PT Wijaya Agro" / "DP Parabot - Anak Perusahaan PT. Wijaya Agro Perkasa"
  nomorRekening: string; // e.g. "0847291048"
  saldoAwal: number;
  saldoSaatIni: number;
  status: StatusAktif;
  isVirtual?: boolean;   // true for BON01 (Kasbon Customer) and TIT01 (Titip Supplier)
  isAnakPerusahaan?: boolean; // true for DP Parabot (Anak Perusahaan PT. Wijaya Agro Perkasa sekaligus Mitra)
  idMitraTerkait?: string;    // Relasi 1-ke-1 ke tabel Mitra (e.g. "MTR-DPPARABOT")
  namaMitraTerkait?: string;  // Nama mitra afiliasi terkait (e.g. "DP Parabot")
  keterangan?: string;
  kategori?: KategoriRekening; // PERUSAHAAN, ANAK_PERUSAHAAN, OPERASIONAL_DIVISI, VIRTUAL_SISTEM
  rekeningIndukPenyimpan?: string; // Rekening perusahaan tempat fisik uang disimpan (untuk OPERASIONAL_DIVISI)
  ledgerStartDate?: string; // Tanggal patokan awal hitung saldo riil KAS01 (DD/MM/YYYY) agar surplus/minus hari lalu tidak mengotori kas hari berjalan
}

export type StatusNotaRekapMitra =
  | 'PIUTANG'
  | 'HUTANG'
  | 'SEIMBANG'
  | 'NOTA_NGUNCI'
  | 'NOTA_AKTIF'
  | 'NOTA_SUPPLIER'
  | 'LUNAS_IMPAS';

export interface NotaNgunciDetailItem {
  idNota: string;
  noNota: string;
  tanggal: string;
  idMitra: string;
  kodeMitra: string;
  namaMitra: string;
  roleMitra: CanonicalRoleMitra;
  alamat: string;
  telepon: string;
  fotoMitra?: string;
  jenisNota: 'NOTA_LALU_PIUTANG' | 'KASBON_UANG' | 'KASBON_BARANG' | 'PIUTANG_HASIL_BUMI';
  jenisNotaLabel: string;
  rincian: string;
  catatanNgunci?: string;
  tanggalNgunci?: string;
  fotoNota?: string;
  attachment_url?: string;
  nominalAwal: number;
  sisaNominalNgunci: number;
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
  fotoUrl?: string;             // Foto profil mitra / karyawan terhubung
  isAnakPerusahaan?: boolean;   // true jika merupakan Anak Perusahaan PT. Wijaya Agro Perkasa (misal DP Parabot)
  kodeRekeningTerkait?: string; // Relasi 1-ke-1 ke Master Rekening (misal "REK-DPPARABO")
  isKaryawan?: boolean;         // true jika Mitra ini juga terdaftar sebagai Karyawan PT
  idKaryawanTerkait?: string;   // Relasi 1-ke-1 ke Master Karyawan (misal "KRY-001")
  isNotaNgunci?: boolean;       // true jika piutang mitra berstatus NOTA NGUNCI (tidak ada respon & kepastian bayar)
  tanggalNgunci?: string;
  catatanNgunci?: string;
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
  fotoUrl?: string;
  isAnakPerusahaan?: boolean;
  kodeRekeningTerkait?: string;
  namaRekeningTerkait?: string;
  // Integrasi Karyawan <-> Mitra (1 Akun Terpadu: Karyawan juga bisa jadi Mitra)
  isKaryawan?: boolean;
  idKaryawanTerkait?: string;
  nikKaryawan?: string;
  jabatanKaryawan?: string;
  divisiKaryawan?: string;
  hasTransaksiMitraPanen?: boolean;
  totalTitipPanenMurni?: number;      // Saldo titip hasil panen / pinjaman dana murni belum cair
  totalUpahBelumDibayar?: number;     // Saldo hak gaji / upah kerja karyawan yang belum cair
  totalGajiSudahDibayar?: number;     // Akumulasi gaji karyawan yang sudah dibayar via Slip Gaji
  totalHakMitraGabungan?: number;     // totalTitipPanenMurni + totalUpahBelumDibayar
  // Saldo simpanan/talangan pada Rekening Anak Perusahaan (+ dana PT disimpan di anak perusahaan, - talangan anak perusahaan ke PT)
  saldoRekeningAnakPerusahaan?: number;
  // Posisi bersih gabungan (Titip/Hutang PT - Bon Mitra - Saldo Simpanan Rekening Anak Perusahaan)
  posisiBersihTerpadu?: number;
  // Hutang kita pada mitra (Titip Hasil Bumi + Hak Upah Belum Cair)
  totalHutangTitipPanen: number;
  // Bon mitra (Piutang kita pada mitra)
  totalKasbonBarang: number;
  totalKasbonUang: number;
  totalBonMitra: number;
  // Status & Rincian Nota Ngunci (Piutang Macet / Uang Tidak Bisa Kembali)
  isNotaNgunci?: boolean;
  catatanNgunci?: string;
  tanggalNgunci?: string;
  statusNotaLabel?: StatusNotaRekapMitra;
  nominalPiutangAktif?: number;       // 1. Piutang aktif berjalan (Mitra berhutang, TIDAK melibatkan Ngunci)
  nominalNotaNgunci?: number;         // 3. Ngunci (hanya berkurang jika mitra terkait melakukan pembayaran)
  jumlahNotaNgunci?: number;          // Banyaknya lembar nota ngunci pada mitra ini
  hasPiutangAktif?: boolean;          // true jika memiliki 1. Piutang aktif (nominalPiutangAktif > 0)
  hasHutangAktif?: boolean;           // true jika memiliki 2. Hutang PT ke mitra (uang titip / HB titip > 0)
  hasNotaNgunci?: boolean;            // true jika memiliki 3. Ngunci (nominalNotaNgunci > 0)
  isNotaAktif?: boolean;              // true jika memiliki nota aktif berjalan baik Hutang maupun Piutang
  statusRekeningMitra?: 'PIUTANG' | 'HUTANG' | 'SEIMBANG' | 'NGUNCI' | 'LUNAS';
  bisaKliringSilang?: boolean;        // true jika satu mitra memiliki Piutang (>0) sekaligus Hutang (>0)
  potensiKliringSilang?: number;      // Math.min(totalBonMitra, totalHutangTitipPanen)
  // Posisi Bersih: totalHutangTitipPanen - totalBonMitra
  potonganSilangOtomatis?: number;
  sisaBonBersih?: number;
  sisaTitipanBersih?: number;
  uangKitaDiMitraIndividu?: number;   // Rumus: nominalPiutangAktif - totalHutangTitipPanen (TIDAK melibatkan Ngunci)
  totalRekeningMitraIndividu?: number; // Alias eksplisit: Piutang Aktif - Hutang PT ke Mitra
  saldoBersih: number;
  posisiStatus: 'KITA_BERHUTANG' | 'MITRA_BERHUTANG' | 'LUNAS_IMPAS';
  totalTransaksiCount: number;
}

export interface RekapMasterMitraSummary {
  totalMitra: number;
  totalHutangPerusahaanKeMitra: number; // 2. Hutang (PT berhutang): Uang Titip + HB Titip + Hutang Supplier + Hak Upah
  totalTitipPanenMurni?: number;        // Khusus saldo titip panen/pinjaman murni (sinkron ke TIT01)
  totalUpahKaryawanBelumDibayar?: number; // Khusus saldo hak gaji/upah karyawan belum cair
  totalBonMitra: number;                // Total seluruh piutang mitra (Aktif + Nota Ngunci)
  saldoBersihKemitraan: number;         // Total hak mitra - Total bon
  mitraDenganHutangTitipCount: number;  // Jumlah mitra dengan 2. Hutang (PT berhutang)
  mitraDenganBonCount: number;          // Jumlah mitra dengan kewajiban bon keseluruhan
  mitraPiutangAktifCount?: number;      // Jumlah mitra dengan 1. Piutang aktif (di luar Ngunci)
  mitraNotaAktifCount?: number;         // Jumlah mitra dengan Nota Aktif berjalan (baik Piutang maupun Hutang)
  mitraSiapKliringSilangCount?: number; // Jumlah mitra yang punya Piutang & Hutang sekaligus (siap Kliring Silang)
  // Rekap Khusus Total Rekening Mitra / Nota Supplier & Status Nota Ngunci
  totalSeluruhPiutangMitra?: number;       // Total seluruh piutang mitra (Piutang Aktif + Nota Ngunci)
  totalPiutangAktifMitra?: number;         // 1. Piutang (Mitra berhutang) aktif di luar Ngunci
  totalPiutangAktifGlobal?: number;        // Alias kompatibel untuk totalPiutangAktifMitra
  totalNominalNotaNgunci?: number;         // 3. Ngunci (Hanya berguna/berkurang jika mitra terkait melakukan pembayaran)
  mitraNotaNgunciCount?: number;           // Jumlah mitra berstatus 3. Ngunci
  totalLembarNotaNgunci?: number;          // Jumlah lembar nota berstatus Ngunci
  totalNotaSupplierRekeningMitra?: number; // Jumlah Hutang PT ke Mitra (Uang Titip & HB Titip)
  totalRekeningMitraNotaSupplier?: number; // RUMUS UTAMA: Jumlah Piutang Aktif - Jumlah Hutang (TIDAK melibatkan Ngunci)
  uangKitaDiMitra?: number;                // Diselaraskan ke rumus: Jumlah Piutang Aktif - Jumlah Hutang (tanpa Ngunci)
  uangKitaDiMitraEfektif?: number;         // Sama dengan totalRekeningMitraNotaSupplier (Piutang Aktif - Hutang)
  daftarNotaNgunci?: NotaNgunciDetailItem[];
  items: RekapMitraItem[];
}

export interface RekapKaryawanItem {
  id: string;
  nik: string;
  nama: string;
  jabatan: string;
  divisi?: string;
  departemen: string;
  telepon: string;
  alamat: string;
  status: StatusAktif;
  fotoUrl?: string;
  riwayatDivisi?: RiwayatDivisiKaryawan[];
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
  totalTitipHasilPanen?: number;   // Saldo titip hasil panen sebagai Mitra
  totalGajiSudahDibayar?: number;  // Total slip gaji yang telah dibayar
  totalHakGabunganMitraKaryawan?: number; // totalUpahBelumDibayar + totalTitipHasilPanen
  saldoBersih: number;             // totalUpahBelumDibayar - totalBonKaryawan
  saldoBersihTerpaduMitra?: number; // (totalUpahBelumDibayar + totalTitipHasilPanen) - totalBonKaryawan
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
  divisiAktifSaatIni?: string;
  fotoUrl?: string;
  riwayatDivisi?: RiwayatDivisiKaryawan[];
  divisiUtama: NamaDivisi;
  daftarDivisiBekerja: NamaDivisi[];
  totalHariKerja: number;
  totalHariDalamBulan?: number;
  totalHariTidakMasuk?: number;
  totalUpahPokok: number;
  totalUangMakanLembur: number;
  totalGajiKotor: number;
  totalPotonganBon: number;
  totalGajiBersihDibayar: number;
  totalHakUpahPending: number;
  standarGajiPokok?: number;
  tunjanganTetap?: number;
  totalUpahBelumDibayarSemuaPeriode?: number;
  totalHariBelumDibayarSemuaPeriode?: number;
  saldoTitipHasilPanenMitra?: number;
  idMitraTerkait?: string;
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

export interface ItemKategoriProduk {
  nama: string;
  deskripsi?: string;
  tanpaStok?: boolean; // true jika kategori produk tanpa stok fisik (seperti kategori Alat)
  createdAt?: string;
}

export const KATEGORI_ALAT_DEFAULT_DESC =
  'Sewa alat & jasa operasional tanpa stok fisik (contoh: Sewa Exca, Sewa Truck)';

export function isKategoriAlatNonStok(kategori?: string | null): boolean {
  const norm = String(kategori || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (!norm) return false;
  // ALAT PERTANIAN pada katalog merujuk ke material/barang fisik yang memiliki stok gudang
  if (norm === 'ALAT PERTANIAN') return false;
  return (
    norm === 'ALAT' ||
    norm === 'SEWA ALAT' ||
    norm === 'ALAT SEWA' ||
    norm === 'ALAT BERAT' ||
    norm === 'SEWA ALAT BERAT' ||
    norm === 'JASA SEWA' ||
    norm === 'SEWA JASA' ||
    norm === 'JASA'
  );
}

/**
 * Mengecek apakah suatu produk didefinisikan TANPA STOK (seperti Kategori Alat):
 * - Jika `item.tanpaStok` bernilai boolean eksplisit (`true` / `false`), ikuti nilai tersebut.
 * - Jika belum diset pada produk, cek apakah kategorinya bertanda `tanpaStok: true` di `kategoriList`
 *   atau termasuk kategori Alat/Jasa non-stok bawaan.
 */
export function isProdukTanpaStok(
  item?: { kategori?: string | null; tanpaStok?: boolean } | null,
  kategoriList?: Array<{ nama: string; tanpaStok?: boolean }> | null
): boolean {
  if (!item) return false;
  if (typeof item.tanpaStok === 'boolean') {
    return item.tanpaStok;
  }
  const katNorm = String(item.kategori || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  if (kategoriList && katNorm) {
    const matchedKat = kategoriList.find(
      (k) => String(k.nama || '').trim().replace(/\s+/g, ' ').toUpperCase() === katNorm
    );
    if (matchedKat && typeof matchedKat.tanpaStok === 'boolean') {
      return matchedKat.tanpaStok;
    }
  }
  return isKategoriAlatNonStok(item.kategori);
}

export const TANPA_DIVISI_VALUE = 'TANPA_DIVISI';

export function isTanpaDivisi(rawNama?: string | null): boolean {
  const norm = String(rawNama || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!norm) return false;
  const compact = norm.replace(/[^a-z0-9]/g, '');
  return (
    norm === '-' ||
    norm === 'tanpa_divisi' ||
    norm === 'tanpa divisi' ||
    norm === 'non_divisi' ||
    norm === 'non divisi' ||
    norm === 'tidak masuk divisi' ||
    norm === 'tidak masuk arus kas divisi' ||
    compact === 'tanpadivisi' ||
    compact === 'nondivisi' ||
    compact === 'tidakmasukdivisi' ||
    compact === 'rektanpadiv' ||
    compact === 'divtanpadiv'
  );
}

export function isExcludedFromDivisi(rawNama?: string | null): boolean {
  const norm = String(rawNama || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!norm) return false;
  const compact = norm.replace(/[^a-z0-9]/g, '');
  return (
    norm.includes('dp parabot') ||
    compact === 'dpparabot' ||
    compact === 'divdpparabo' ||
    compact === 'divdpparabot' ||
    compact === 'rekdpparabo' ||
    compact === 'rekdpparabot' ||
    compact === 'afiliasidpparabot'
  );
}

export interface Produk {
  kode: string;
  kategori: string;
  nama: string;
  satuan: string;
  hargaBeli: number; // HPP Modal / Harga Kulakan Terakhir
  hargaJual: number; // Sugesti Harga Jual Umum / Eceran
  hargaKhususRekanan?: number; // Sugesti Harga Khusus Mitra / Rekanan
  tanpaStok?: boolean; // true = Tanpa Stok (seperti Kategori Alat), false = Memerlukan Stok Gudang
  status: StatusAktif;
}

export interface StokBarang {
  kode: string;
  namaProduk: string;
  satuan: string;
  kategori?: string;
  tanpaStok?: boolean;
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
  divisi?: string;       // Divisi usaha terkait saat transaksi
  metode: 'TUNAI' | 'TRANSFER' | 'KASBON' | 'SINKRON' | 'INTERNAL_PT' | 'PEMAKAIAN_PENGELUARAN';
  rekeningTujuan: string; // KAS01, bank, BON01, SINKRON, INTERNAL_PT, PENGELUARAN
  items: ItemPenjualan[];
  totalModalHpp?: number;  // Akumulasi modal HPP
  totalNominal: number;    // Akumulasi harga jual / omzet
  totalLabaKotor?: number; // totalNominal - totalModalHpp
  statusPembayaran: 'LUNAS' | 'BELUM_BAYAR';
  sisaPiutang: number;   // outstanding balance for KASBON
  isNotaNgunci?: boolean;
  tanggalNgunci?: string;
  catatanNgunci?: string;
  // Aliran pemakaian stok gudang ke pencatatan Pengeluaran (mis. Solar)
  kategoriPengeluaran?: string;
  idPengeluaranTerkait?: string;
  idInventaris?: string;
  // Pembukuan Nota Silang (Utama: Mitra ⇄ Anak Perusahaan seperti DP Parabot | Opsi: Sesama Mitra)
  isNotaSilang?: boolean;
  modeNotaSilang?: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA';
  idMitraAnakPerusahaan?: string;
  namaAnakPerusahaan?: string;
  noNotaToko?: string;
  fotoNota?: string;
  attachment_url?: string;
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
  attachment_url?: string;
  divisi?: string;       // Divisi usaha terkait saat kulakan
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'HUTANG' | 'SINKRON';
  rekeningSumber: string; // KAS01 for TUNAI, bank for TRANSFER, TIT01 for HUTANG, SINKRON for non-cash sync
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

export interface LabaRugiDivisiTransaksiRingkas {
  id: string;
  tanggal: string;
  jam: string;
  arus?: 'MASUK' | 'KELUAR';
  kategori:
    | 'PENJUALAN'
    | 'PELUNASAN_PIUTANG'
    | 'MODAL_PEMBELIAN'
    | 'BEBAN_PENGELUARAN'
    | 'GAJI_UPAH';
  keterangan: string;
  pihakTerkait?: string;
  metode?: string;
  nominal: number;
  hppModal?: number;
  labaKotor?: number;
}

export interface LabaRugiDivisiItem {
  idDivisi: string;
  divisi: string;
  kodeRekening: string;
  namaRekening: string;
  penanggungJawab?: string;
  deskripsi?: string;
  logoUrl?: string;
  // Ringkasan Utama Laba Rugi Divisi: Uang Masuk (+), Uang Keluar (-), Laba / Rugi
  uangMasuk: number;
  uangKeluar: number;
  jumlahTransaksiMasuk: number;
  jumlahTransaksiKeluar: number;
  // Detail Pendukung (tetap disediakan untuk kompatibilitas)
  omzetPenjualanToko: number;
  omzetPenjualanHasilBumi: number;
  totalOmzetPenjualan: number;
  penjualanKasMasuk: number;
  piutangPenjualanAktif: number;
  jumlahNotaPenjualan: number;
  modalPembelianBarang: number;
  modalPembelianHasilBumi: number;
  totalModalPembelian: number;
  pembelianKasKeluar: number;
  modalTerpakaiHpp: number;
  sisaModalStokBerjalan: number;
  jumlahNotaPembelian: number;
  labaKotorDagang: number;
  marginKotorPersen: number;
  biayaPengeluaranOperasional: number;
  biayaGajiKaryawan: number;
  totalBebanPengeluaran: number;
  jumlahTransaksiPengeluaran: number;
  labaRugiBersih: number;
  marginBersihPersen: number;
  saldoNilaiBerjalanDivisi: number;
  saldoKasTunaiDivisi: number;
  rincianTransaksi: LabaRugiDivisiTransaksiRingkas[];
}

export interface LabaRugiDivisiSummary {
  periode: string;
  totalDivisi: number;
  totalUangMasukSemuaDivisi: number;
  totalUangKeluarSemuaDivisi: number;
  totalOmzetSemuaDivisi: number;
  totalModalPembelianSemuaDivisi: number;
  totalModalTerpakaiHppSemuaDivisi: number;
  totalSisaModalStokBerjalanSemuaDivisi: number;
  totalLabaKotorSemuaDivisi: number;
  totalPengeluaranOperasionalSemuaDivisi: number;
  totalGajiSemuaDivisi: number;
  totalBebanPengeluaranSemuaDivisi: number;
  totalLabaRugiBersihSemuaDivisi: number;
  marginBersihRataRata: number;
  divisiTeruntung: string;
  items: LabaRugiDivisiItem[];
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
  perDivisi?: LabaRugiDivisiSummary;
}

export interface TransaksiPembelianHasilBumi {
  noPembelian: string;
  batchId?: string;      // ID gabungan keranjang multi-komoditas 1 petani
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
  divisi?: string;       // Divisi usaha terkait saat pembelian hasil bumi (otomatis Gudang Wijaya Agro)
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP' | 'SINKRON';
  rekeningSumber: string; // KAS01 for TUNAI, bank for TRANSFER, TIT01 for TITIP, SINKRON for non-cash sync
  status: 'LUNAS' | 'BELUM_DIAMBIL' | 'TITIP' | 'BELUM_PUTUS_HARGA';
  isBelumPutusHarga?: boolean;
  statusHarga?: 'HARGA_PUTUS' | 'BELUM_PUTUS_HARGA';
  tanggalPutusHarga?: string;
  fotoNota?: string;     // Base64 data URL / image link of weighing receipt or physical slip
  fotoNotaList?: string[]; // Multiple photos of physical slips / notes
  attachment_url?: string;
  driveFileUrl?: string; // Link URL ke Google Drive bukti nota fisik
  driveFileId?: string;  // Google Drive File ID
  driveFolderPath?: string; // e.g. NOTA LALU / HUTANG NOTA LAMA
  driveFileList?: Array<{ url: string; id: string; folderPath: string }>; // Multiple Drive files
  isNotaLalu?: boolean;  // Menandai transaksi titipan panen / saldo titip masa lalu
  noNotaLalu?: string;   // Nomor dokumen fisik / faktur nota lalu manual
  tanggalNotaLalu?: string;
  // Metadata Nota Silang pada sisi Anak Perusahaan (mis. DP Parabot) atau Sesama Mitra Penyedia
  isNotaSilang?: boolean;
  modeNotaSilang?: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA';
  idNotaSilangRef?: string;
  idMitraPengambil?: string;
  namaMitraPengambil?: string;
  noNotaToko?: string;
  itemsNotaSilang?: Array<{ namaBarang: string; qty: number; satuan?: string; harga: number; subtotal: number }>;
  keterangan: string;
  createdAt: string;
}

export interface NotaSilangItemInput {
  namaBarang: string;
  qty: number;
  satuan?: string;
  harga: number;
  markup?: number;
}

export interface NotaSilangRecordSummary {
  noNotaSilang: string;
  noRefAnakPerusahaan: string;
  modeNotaSilang?: 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA';
  tanggal: string;
  jam: string;
  idMitra: string;
  namaMitra: string;
  idMitraAnakPerusahaan: string;
  namaAnakPerusahaan: string;
  noNotaToko?: string;
  items: Array<{ namaBarang: string; qty: number; satuan: string; harga: number; subtotal: number }>;
  totalNominal: number;
  sisaPiutangMitra: number;
  statusPiutangMitra: 'LUNAS' | 'BELUM_BAYAR';
  keterangan: string;
  fotoNota?: string;
  createdAt: string;
}

export interface TransaksiPenjualanHasilBumi {
  noPenjualan: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;       // 'UMUM' atau ID Mitra (Pabrik / Eksportir / Bandar)
  namaMitra: string;
  komoditasKode: string;
  komoditasNama: string;
  beratKotor: number;    // Kg
  potonganRafaksi: number; // %
  beratBersih: number;   // Kg keluar dari gudang
  modalRataRataPerKg: number; // HPP modal rata-rata beli gudang saat transaksi (Rp/Kg)
  totalModalHpp: number; // beratBersih * modalRataRataPerKg
  nilaiModalPengurangStok?: number; // Nilai pengurang stok menggunakan harga rata-rata pembelian
  hargaJualPerKg: number; // Harga jual deal per Kg (atau acuan modal rata-rata saat belum putus harga)
  totalNominal: number;  // Omzet penjualan langsung (0 jika BELUM_PUTUS_HARGA karena uang masuk dicatat lewat menu Uang Masuk)
  labaKotor: number;     // Realisasi selisih terhadap modal HPP
  divisi?: string;       // Divisi usaha terkait saat penjualan hasil bumi
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'PIUTANG' | 'BELUM_PUTUS_HARGA' | 'SINKRON';
  rekeningTujuan: string; // KAS01, bank, BON01, SINKRON, atau MENUNGGU_UANG_MASUK
  statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' | 'MENUNGGU_UANG_MASUK';
  sisaPiutang: number;
  isBelumPutusHargaJual?: boolean;
  selisihTimbangMuatKg?: number; // Jika berat muat melebihi stok buku gudang (contoh: Stok 3.064,1 Kg -> Muat 3.094,0 Kg -> Selisih 29,9 Kg)
  isHabisMuatSusut?: boolean;    // true jika gudang dikuras habis saat muat & sisa selisih masuk ke SUSUT
  beratSusutKg?: number;         // Tonase susut saat kloter muat ditutup habis
  nominalUangMasukTerkumpul?: number; // Akumulasi uang hasil penjualan yang sudah masuk lewat menu Uang Masuk
  statusUangMasuk?: 'BELUM_MASUK' | 'SEBAGIAN' | 'LUNAS';
  idUangMasukList?: string[];
  isNotaNgunci?: boolean;
  tanggalNgunci?: string;
  catatanNgunci?: string;
  noSuratJalan?: string; // Nomor DO / Surat Jalan / Plat Truk
  stokGudangSebelum: number;
  stokGudangSetelah: number;
  keterangan: string;
  fotoNota?: string;
  attachment_url?: string;
  createdAt: string;
}

export interface RingkasanKomoditasBulananItem {
  kode: string;
  nama: string;
  satuan: string;
  isBelumPutusHarga?: boolean;
  // Posisi pada Bulan & Tahun Terpilih
  stokAwalBulanKg: number;
  masukBulanIniKg: number;
  masukBulanIniNominal: number;
  rataHargaBeliBulanIni: number;
  notaBeliBulanIniCount: number;
  terjualBulanIniKg: number;
  terjualBulanIniOmzet: number;
  rataHargaJualBulanIni: number;
  labaBulanIni: number;
  notaJualBulanIniCount: number;
  stokAkhirBulanKg: number;
  // Posisi Realtime di Gudang Saat Ini
  readyGudangSaatIniKg: number;
  rataRataModalGudangPerKg: number;
  nilaiModalReadyGudang: number;
  // Akumulasi Keseluruhan
  totalMasukKumulatifKg: number;
  totalTerjualKumulatifKg: number;
}

export interface RingkasanBulanHasilBumiItem {
  bulan: number; // 1..12
  tahun: number;
  namaBulan: string;
  namaBulanSingkat: string;
  stokAwalKg: number;
  masukKg: number;
  masukNominal: number;
  notaBeliCount: number;
  terjualKg: number;
  terjualOmzet: number;
  terjualLaba: number;
  notaJualCount: number;
  stokAkhirKg: number;
  isCurrentMonth: boolean;
}

export interface RingkasanStokHasilBumiBulananResponse {
  bulan: number;
  tahun: number;
  periodeLabel: string;
  kodeKomoditasFilter: string; // 'ALL' atau kode komoditas
  daftarTahunTersedia: number[];
  // Posisi Ready Gudang Aktual Saat Ini
  totalReadyGudangKg: number;
  totalNilaiModalReadyGudang: number;
  jumlahKomoditasReady: number;
  totalMasukKumulatifKg: number;
  totalTerjualKumulatifKg: number;
  // Ringkasan Periode Bulan Terpilih
  stokAwalBulanKg: number;
  masukBulanIniKg: number;
  masukBulanIniNominal: number;
  jumlahNotaBeliBulanIni: number;
  terjualBulanIniKg: number;
  terjualBulanIniOmzet: number;
  terjualBulanIniModal: number;
  terjualBulanIniLaba: number;
  jumlahNotaJualBulanIni: number;
  stokAkhirBulanKg: number;
  // Rincian
  komoditasItems: RingkasanKomoditasBulananItem[];
  rekapPerBulanTahunIni: RingkasanBulanHasilBumiItem[];
}

export interface TransaksiKasbonUang {
  idTransaksi: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  jenisTransaksi: 'KASBON UANG';
  metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
  rekeningSumber: string; // KAS01, chosen bank, or SINKRON
  nominal: number;
  sisaKasbon: number;
  keterangan: string;
  status: 'BELUM LUNAS' | 'SEBAGIAN' | 'LUNAS';
  fotoNota?: string;     // Capture foto detail fisik nota lalu / slip kasbon manual
  fotoNotaList?: string[]; // Multiple photos of physical slips / notes
  attachment_url?: string;
  driveFileUrl?: string; // Link URL ke Google Drive bukti nota fisik
  driveFileId?: string;  // Google Drive File ID
  driveFolderPath?: string; // e.g. NOTA LALU / PIUTANG NOTA LAMA
  driveFileList?: Array<{ url: string; id: string; folderPath: string }>; // Multiple Drive files
  isNotaLalu?: boolean;  // Menandai piutang barang / bon masa lalu bertahun-tahun
  noNotaLalu?: string;   // Nomor nota manual lama
  tanggalNotaLalu?: string;
  rincianBarangNotaLalu?: string;
  isNotaNgunci?: boolean; // Status NOTA NGUNCI (piutang macet / tidak ada respon & kepastian bayar)
  tanggalNgunci?: string;
  catatanNgunci?: string;
  createdAt: string;
}

export interface AlokasiPembayaranBon {
  jenis: 'KASBON_BARANG' | 'KASBON_UANG';
  refId: string;
  nominalSebelum: number;
  nominalDibayar: number;
  nominalSisa: number;
  isNotaNgunci?: boolean;
}

export interface TransaksiBayarBon {
  idTransaksi: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  totalBonSebelum: number;
  totalBonAwalKotor?: number;
  nominalPotongTitipanOtomatis?: number;
  nominalBayar: number;
  sisaBonSetelah: number;
  idNotaTarget?: string;
  sisaNotaNgunciSebelum?: number;
  nominalPengurangNotaNgunci?: number;
  sisaNotaNgunciSetelah?: number;
  metode: 'TUNAI' | 'TRANSFER' | 'SINKRON' | 'KOMPENSASI_TITIP' | 'POTONG_GAJI';
  rekeningTujuan: string; // KAS01, chosen bank, SINKRON, KOMPENSASI_TITIP, or POTONG_GAJI
  isKompensasiTitipan?: boolean;
  isPotongGaji?: boolean;
  alokasi: AlokasiPembayaranBon[];
  keterangan: string;
  fotoBukti?: string;
  fotoNota?: string;
  attachment_url?: string;
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
  idMitraTerkait?: string;
  namaMitraTerkait?: string;
  tipeMutasiAfiliasi?: 'SIMPAN_KE_ANAK_PERUSAHAAN' | 'TARIK_DARI_ANAK_PERUSAHAAN' | 'ANTAR_ANAK_PERUSAHAAN';
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
  jabatan: string;         // e.g. "Staff Gudang", "Supir", "Kasir Toko"
  divisi?: string;         // Divisi ERP Wijaya Agro
  departemen: string;      // Divisi / Departemen operasional
  gajiPokok?: number;      // Standar gaji (opsional/fleksibel per penugasan harian)
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
  fotoUrl?: string;        // Foto profil karyawan (Data URL terkompresi / URL)
  riwayatDivisi?: RiwayatDivisiKaryawan[]; // Riwayat mutasi / upgrade divisi & jabatan lintas bulan
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

export const DEFAULT_PT_LOGO_URL = '/assets/aistudio/unnamed_cbf747dc.jpg';

export interface ItemDivisi {
  id: string;
  nama: string;
  kodeRekening: string;
  penanggungJawab?: string;
  deskripsi?: string;
  logoUrl?: string;
  isCustom?: boolean;
}

export const DAFTAR_DIVISI: Array<{
  id: string;
  nama: NamaDivisi;
  kodeRekening: string;
  penanggungJawab: string;
  deskripsi: string;
  logoUrl?: string;
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
    logoUrl: DEFAULT_PT_LOGO_URL,
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
  divisi: string;          // Divisi utama / penugasan (atau TANPA_DIVISI)
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
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'SPLIT' | 'SINKRON';
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
  jenis:
    | 'PENJUALAN_MASUK'
    | 'PEMBELIAN_KELUAR'
    | 'PENGELUARAN_OPERASIONAL'
    | 'DROPPING_MASUK'
    | 'TRANSFER_KELUAR'
    | 'GAJI_KARYAWAN'
    | 'LAINNYA';
  keterangan: string;
  masuk: number;
  keluar: number;
  saldoSetelah: number;
  refId: string;
  karyawanTerkait?: string;
  pihakTerkait?: string;
  rekeningFisik?: string;
}

export interface PergerakanKeuanganDivisiSummary {
  divisi: string;
  idDivisi: string;
  kodeRekening: string;
  namaRekening: string;
  penanggungJawab?: string;
  deskripsi?: string;
  logoUrl?: string;
  saldoSaatIni: number;
  saldoKasTunaiDivisi?: number;
  totalPenjualanMasuk: number;
  totalOmzetPenjualan?: number;
  totalPembelianKeluar: number;
  totalModalPembelian?: number;
  modalTerpakaiHpp?: number;
  sisaModalStokBerjalan?: number;
  labaKotorDagang?: number;
  totalPengeluaranOperasional: number;
  totalDroppingMasuk: number;
  totalGajiKeluar: number;
  totalBebanPengeluaran?: number;
  labaRugiBersih?: number;
  totalTransferKeluar: number;
  totalArusMasuk: number;
  totalArusKeluar: number;
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

export interface RekeningKoranHistoryItem {
  id: string;
  tanggal: string;
  jam: string;
  jenis: string;
  keterangan: string;
  catatanTransaksi?: string;  // Keterangan opsional murni dari inputan kasir/user (misal: "Mama ambil solar 1 drigent yang ngambil supir truck mama")
  qtyDisplay: string;         // e.g. "10 Sak", "200 Kg", "1 (Uang)"
  hargaSatuanDisplay: string; // e.g. "Rp 135.000", "Rp 500.000"
  itemsDetail?: RekeningKoranItemDetail[];
  debet: number;   // Menambah hutang mitra / bon
  kredit: number;  // Mengurangi hutang mitra / bon
  saldoAkumulasi: number;
  nominalMutasiHak?: number;  // Nominal titipan hasil panen / upah kerja / pencairan gaji
  kategoriMutasiHak?: 'TITIP_MASUK' | 'TITIP_CAIR' | 'UPAH_TERCATAT' | 'UPAH_SUDAH_CAIR' | 'SLIP_GAJI';
  fotoNota?: string;
  attachment_url?: string;
  isNotaLalu?: boolean;
  noNotaLalu?: string;
  isNotaNgunci?: boolean;
  catatanNgunci?: string;
  sisaPiutangNota?: number;
  isSaldoBerjalan?: boolean;  // true = masih berjalan (piutang belum lunas / titipan & upah belum cair), false = sudah lunas/cair (masuk history)
  piutangBerjalan?: number;   // Sisa nominal piutang berjalan pada baris ini
  titipBerjalan?: number;     // Sisa nominal titip/hak mitra berjalan pada baris ini
  isNotaSilang?: boolean;
  noNotaToko?: string;
  pihakNotaSilang?: string;
  idTransaksiInduk?: string;      // ID nota induk asli (misal NSL-... atau NSL-...-DPP) saat Nota Silang dipecah per item
  sisaPiutangNotaInduk?: number;  // Sisa piutang keseluruhan pada nota induk asli untuk aksi Bayar / Kunci
  metodePembayaran?: string;      // TUNAI, TRANSFER, SINKRON, KLIRING_SILANG, KASBON, TITIP, NOTA_LALU, dll
  rekeningKode?: string;          // KAS01, BNI01, SINKRON, KOMPENSASI_TITIP, BON01, TIT01, dll
  statusTransaksi?: string;       // LUNAS, BELUM_LUNAS, SEBAGIAN, TITIP, CAIR, KLIRING_SILANG, NGUNCI, PENDING
  nominalTransaksi?: number;      // Nilai pokok transaksi (terutama untuk Tunai/Transfer/Sinkron Lunas yang debet=0 & kredit=0)
  rincianNotaLalu?: string;       // Rincian barang/item asli Nota Lalu
}

export interface RekeningKoranMitraSummary {
  idMitra: string;
  kodeMitra: string;
  namaMitra: string;
  role: RoleMitra;
  telepon: string;
  alamat: string;
  status: StatusAktif;
  fotoUrl?: string;
  isKaryawan?: boolean;
  idKaryawanTerkait?: string;
  nikKaryawan?: string;
  jabatanKaryawan?: string;
  divisiKaryawan?: string;
  totalTitipPanenMurni?: number;      // Khusus saldo titip hasil bumi / pinjaman PT belum cair
  totalUpahBelumDibayar?: number;     // Khusus saldo hak gaji / upah kerja karyawan belum cair
  totalGajiSudahDibayar?: number;     // Total slip pembayaran gaji yang sudah dicairkan
  totalHakMitraGabungan?: number;     // totalTitipPanenMurni + totalUpahBelumDibayar
  isAnakPerusahaan?: boolean;
  kodeRekeningTerkait?: string;
  namaRekeningTerkait?: string;
  saldoAwalRekeningAnakPerusahaan?: number;
  saldoRekeningAnakPerusahaan?: number;
  piutangTransferAnakPerusahaan?: number;
  totalSimpanKeAnakPerusahaan?: number;
  totalPakaiDariAnakPerusahaan?: number;
  posisiBersihTerpadu?: number;
  profilPerusahaan?: ProfilPerusahaan;
  rekeningUtamaDetail?: {
    kode: string;
    nama: string;
    nomorRekening?: string;
    atasNama?: string;
  };
  totalKasbonBarang: number;     // Total outstanding bon dari penjualan barang
  totalKasbonUang: number;       // Total outstanding kasbon uang
  totalTitip: number;            // Total hak belum cair ke mitra (Titip Hasil Bumi + Upah Kerja Belum Cair)
  totalPembayaranBon: number;    // Total uang pembayaran bon yang sudah disetor mitra
  totalBonKeseluruhan: number;   // totalKasbonBarang + totalKasbonUang (+ piutang transfer anak perusahaan)
  sisaBon: number;               // Sama dengan totalBonKeseluruhan saat ini
  potonganTitipanOtomatis?: number; // min(totalBonKeseluruhan, totalTitip)
  sisaBonBersih?: number;           // max(0, totalBonKeseluruhan - totalTitip) -> bon bersih wajib dibayar mitra
  sisaTitipanBersih?: number;       // max(0, totalTitip - totalBonKeseluruhan) -> sisa bersih wajib dibayar PT ke mitra
  isNotaNgunci?: boolean;
  catatanNgunci?: string;
  nominalNotaNgunci?: number;
  nominalPiutangAktif?: number;
  history: RekeningKoranHistoryItem[];
  historySaldoBerjalan?: RekeningKoranHistoryItem[];
  historySelesai?: RekeningKoranHistoryItem[];
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

// ==========================================
// PROFIL PERUSAHAAN
// ==========================================
export interface ProfilPerusahaan {
  namaPerusahaan: string;
  badanHukum: string;
  alamat: string;
  telepon: string;
  email: string;
  penanggungJawab: string;
  rekeningUtama: string;
  catatanHeaderNota: string;
  logoUrl?: string;
  pinBos?: string;
  pinKasir?: string;
  wajibPinPublik?: boolean;
  updateTerakhir?: string;
}

// ==========================================
// PENGELUARAN & BEBAN OPERASIONAL PER DIVISI (24 ITEM: HIJAU INVENTARIS & ORANYE BIASA)
// ==========================================
export type KelompokItemPengeluaran = 'INVENTARIS' | 'BIASA';

export interface DefinisiItemPengeluaran24 {
  nomorUrut: number;
  kode: string;
  nama: string;
  kelompok: KelompokItemPengeluaran;
  satuanDefault?: string;
  deskripsi: string;
}

export const DAFTAR_24_ITEM_PENGELUARAN: readonly DefinisiItemPengeluaran24[] = [
  // WARNA HIJAU (1 - 16): PENGELUARAN UNTUK INVENTARIS / ARMADA
  { nomorUrut: 1, kode: 'EXP-01-L300', nama: 'L300', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit inventaris Pickup L300' },
  { nomorUrut: 2, kode: 'EXP-02-TRAGA', nama: 'TRAGA', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit inventaris Isuzu Traga' },
  { nomorUrut: 3, kode: 'EXP-03-DUMPDUTRO', nama: 'DUMP DUTRO', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit inventaris Dump Truck Dutro' },
  { nomorUrut: 4, kode: 'EXP-04-DUMPGIGA', nama: 'DUMP GIGA', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit inventaris Dump Truck Giga' },
  { nomorUrut: 5, kode: 'EXP-05-EXC02', nama: 'EXC 02', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran alat berat Excavator 02' },
  { nomorUrut: 6, kode: 'EXP-06-EXC01', nama: 'EXC 01', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran alat berat Excavator 01' },
  { nomorUrut: 7, kode: 'EXP-07-B9241UVZ', nama: 'B9241UVZ', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran armada plat B 9241 UVZ' },
  { nomorUrut: 8, kode: 'EXP-08-BE8206AMN', nama: 'BE8206AMN', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran armada plat BE 8206 AMN' },
  { nomorUrut: 9, kode: 'EXP-09-BG8038MY', nama: 'BG8038MY', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran armada plat BG 8038 MY' },
  { nomorUrut: 10, kode: 'EXP-10-PAJERO', nama: 'PAJERO', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran mobil operasional Pajero' },
  { nomorUrut: 11, kode: 'EXP-11-RAIZE', nama: 'RAIZE', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran mobil operasional Raize' },
  { nomorUrut: 12, kode: 'EXP-12-VESPA', nama: 'VESPA', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit motor Vespa' },
  { nomorUrut: 13, kode: 'EXP-13-AEROX', nama: 'AEROX', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit motor Aerox' },
  { nomorUrut: 14, kode: 'EXP-14-SCOPY', nama: 'SCOPY', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit motor Scoopy' },
  { nomorUrut: 15, kode: 'EXP-15-MIO', nama: 'MIO', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit motor Mio' },
  { nomorUrut: 16, kode: 'EXP-16-KING', nama: 'KING', kelompok: 'INVENTARIS', deskripsi: 'Pengeluaran unit motor RX King' },
  // WARNA ORANYE (17 - 24): PENGELUARAN BIASA / OPERASIONAL HARIAN
  { nomorUrut: 17, kode: 'EXP-17-RUMAH', nama: 'RUMAH', kelompok: 'BIASA', deskripsi: 'Pengeluaran kebutuhan rumah tangga / mess kantor' },
  { nomorUrut: 18, kode: 'EXP-18-SOLAR', nama: 'SOLAR', kelompok: 'BIASA', satuanDefault: 'DRIGENT', deskripsi: 'Pengeluaran BBM Solar operasional & pemakaian gudang' },
  { nomorUrut: 19, kode: 'EXP-19-ROKOK', nama: 'ROKOK', kelompok: 'BIASA', satuanDefault: 'BKS', deskripsi: 'Pengeluaran rokok operasional lapangan / pekerja' },
  { nomorUrut: 20, kode: 'EXP-20-AKUA', nama: 'AKUA', kelompok: 'BIASA', satuanDefault: 'DUS', deskripsi: 'Pengeluaran air minum kemasan (Aqua / galon)' },
  { nomorUrut: 21, kode: 'EXP-21-NASI', nama: 'NASI', kelompok: 'BIASA', satuanDefault: 'BKS', deskripsi: 'Pengeluaran konsumsi nasi pekerja & tamu' },
  { nomorUrut: 22, kode: 'EXP-22-TOKEN', nama: 'TOKEN', kelompok: 'BIASA', deskripsi: 'Pengeluaran token listrik PLN kantor & gudang' },
  { nomorUrut: 23, kode: 'EXP-23-SEDEKAH', nama: 'SEDEKAH', kelompok: 'BIASA', deskripsi: 'Pengeluaran sedekah, sumbangan & sosial' },
  { nomorUrut: 24, kode: 'EXP-24-GORENGAN', nama: 'GORENGAN', kelompok: 'BIASA', deskripsi: 'Pengeluaran snack / gorengan konsumsi harian' },
];

export function getNomorUrutItemPengeluaran(nama: string): number | undefined {
  const norm = String(nama || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const compact = norm.replace(/\s+/g, '');
  const found = DAFTAR_24_ITEM_PENGELUARAN.find(
    (d) => d.nama.toUpperCase() === norm || d.nama.replace(/\s+/g, '').toUpperCase() === compact
  );
  return found?.nomorUrut;
}

export function resolveKelompokItemPengeluaran(
  nama: string,
  explicit?: KelompokItemPengeluaran
): KelompokItemPengeluaran {
  if (explicit === 'INVENTARIS' || explicit === 'BIASA') return explicit;
  const norm = String(nama || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const compact = norm.replace(/\s+/g, '');
  const found = DAFTAR_24_ITEM_PENGELUARAN.find(
    (d) => d.nama.toUpperCase() === norm || d.nama.replace(/\s+/g, '').toUpperCase() === compact
  );
  if (found) return found.kelompok;
  if (
    /\b(L300|TRAGA|DUMP|DUTRO|GIGA|EXC|PAJERO|RAIZE|VESPA|AEROX|SCOPY|SCOOPY|MIO|KING|TRUCK|ARMADA|MOBIL|MOTOR|SPAREPART)\b/.test(
      norm
    )
  ) {
    return 'INVENTARIS';
  }
  return 'BIASA';
}

export interface MasterItemPengeluaran {
  id: string;
  kode: string;
  nama: string;          // e.g. "L300", "SOLAR", "RUMAH"
  kelompok?: KelompokItemPengeluaran; // 'INVENTARIS' (Hijau) | 'BIASA' (Oranye)
  nomorUrut?: number;    // 1..24 untuk item baku
  satuanDefault?: string;
  deskripsi?: string;
  divisiDefault?: string;
  isSystemDefault?: boolean;
  createdAt: string;
}

export interface TransaksiPengeluaran {
  idTransaksi: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  divisi: string;        // e.g. "Wijaya Transport", "Gudang Wijaya Agro"
  kategori: string;      // Item pengeluaran, e.g. "L300", "TRAGA", "SOLAR", "RUMAH"
  kelompokPengeluaran?: KelompokItemPengeluaran; // 'INVENTARIS' (Hijau) | 'BIASA' (Oranye)
  qty?: number;
  satuan?: string;
  hargaSatuan?: number;
  keterangan: string;    // e.g. "Pemakaian Solar Gudang 2 Drigent", "Ganti oli dump truck"
  nominal: number;       // Positif untuk TAMBAH pengeluaran, Negatif untuk KURANG/koreksi pengeluaran
  arahMutasi?: 'TAMBAH' | 'KURANG';
  isNonKas?: boolean;    // true jika berasal dari pemakaian stok internal (STOK_INTERNAL) atau SINKRON non-kas
  idPenjualanStok?: string; // No penjualan terkait jika berasal dari pemakaian stok barang (mis. Solar)
  rekeningSumber: string; // KAS01, BNI01, SINKRON, STOK_INTERNAL, etc.
  penerima?: string;
  idInventaris?: string;
  fotoKuitansi?: string;
  attachment_url?: string;
  createdAt: string;
}

// ==========================================
// MASTER INVENTARIS KENDARAAN, ARMADA & ASET PT
// ==========================================
export type KategoriInventaris =
  | 'TRUCK_ANGKUTAN'
  | 'PICKUP_L300'
  | 'MOBIL_OPERASIONAL'
  | 'ALAT_BERAT'
  | 'MOTOR'
  | 'MESIN_GUDANG'
  | 'LAINNYA';

export type KondisiInventaris = 'BAIK' | 'SERVIS_RINGAN' | 'PERBAIKAN_BENGKEL' | 'NONAKTIF';

export interface ItemInventaris {
  id: string;                   // e.g. "INV-001"
  kode: string;                 // e.g. "INV-001"
  namaItem: string;             // e.g. "Dump Truck Hino Dutro 130 HD"
  kategori: KategoriInventaris;
  nomorPlat: string;            // e.g. "BE 8206 AMN" (atau nomor seri aset)
  merkTipe?: string;            // e.g. "Hino Dutro 130 HD / Mitsubishi L300"
  tahunKeluaran?: string;       // e.g. "2021"
  warna?: string;               // e.g. "Hijau / Kuning / Hitam"
  driverPenanggungJawab: string;// Nama sopir / operator / penanggung jawab
  idKaryawanDriver?: string;    // ID karyawan PT jika dipilih dari master karyawan
  teleponDriver?: string;       // No. HP / WA driver
  tanggalPajakTahunan?: string; // DD/MM/YYYY atau YYYY-MM-DD (Jatuh tempo pajak STNK tahunan)
  tanggalPajakLimaTahunan?: string; // Ganti plat / STNK 5 tahunan
  tanggalKir?: string;          // Jatuh tempo Uji KIR angkutan
  nomorRangka?: string;
  nomorMesin?: string;
  divisi?: string;              // e.g. "Wijaya Transport", "Gudang Wijaya Agro"
  kondisi: KondisiInventaris;
  nilaiPerolehan?: number;      // Nilai beli aset (opsional)
  tanggalBeli?: string;         // Tanggal beli aset (opsional)
  fotoItem?: string;            // Foto kendaraan (base64 / URL)
  fotoStnk?: string;            // Foto STNK / dokumen pajak (base64 / URL)
  catatan?: string;             // Catatan perawatan, ukuran ban, oli, dll.
  status: StatusAktif;
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// PENCAIRAN TITIPAN HASIL BUMI DARI PETANI
// ==========================================
export interface TransaksiPencairanTitipan {
  idPencairan: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  idMitra: string;
  namaMitra: string;
  nominalPencairan: number;
  rekeningSumber: string; // Kas, Bank, SINKRON, atau KOMPENSASI_BON
  saldoTitipanSebelum: number;
  totalTitipanAwalKotor?: number;
  nominalPotongBonOtomatis?: number;
  saldoTitipanSisa: number;
  metodePembayaran: 'TUNAI' | 'TRANSFER' | 'SINKRON' | 'KOMPENSASI_BON';
  isKompensasiBon?: boolean;
  keterangan: string;
  fotoNota?: string;
  fotoBukti?: string;
  attachment_url?: string;
  createdAt: string;
}
// ==========================================
// TRANSAKSI AGEN BRILINK (ADM TARIK TUNAI & ADM TUKAR CASH RUPIAH PT)
// ==========================================
export type JenisTransaksiBrilink = 'TARIK_TUNAI' | 'TUKAR_CASH';

export interface TransaksiBrilink {
  idTransaksi: string;           // e.g. "BRI-261031-001"
  tanggal: string;               // DD/MM/YYYY
  jam: string;                   // HH:mm:ss
  jenisBrilink: JenisTransaksiBrilink;
  arusAdmin: 'MASUK' | 'KELUAR'; // MASUK = Adm Tarik Tunai (+), KELUAR = Adm Tukar Cash PT (-)
  idMitra: string;               // 'UMUM' atau ID Mitra terdaftar
  namaPelanggan: string;         // Nama nasabah / agen tempat tukar cash
  teleponPelanggan?: string;
  divisi: string;                // Default "BRILink"
  rekeningAdmin: string;         // Rekening tempat uang masuk/keluar Admin (KAS01 atau Bank PT)
  rekeningBank?: string;         // Rekening Bank PT jika melibatkan mutasi pokok Bank <-> Kas Tunai
  rekeningKasTunai?: string;     // Default "KAS01" jika melibatkan mutasi pokok
  nominalAdmin: number;          // Fokus utama: Uang Masuk Adm Tarik Tunai (+) atau Uang Keluar Adm Tukar Cash (-)
  nominalPokok: number;          // Opsional (0 jika hanya catat admin; >0 jika mutasi pokok Bank <-> KAS01 sekaligus)
  keterangan: string;
  fotoBukti?: string;            // Foto struk EDC / bukti transfer BRILink
  attachment_url?: string;
  status: 'BERHASIL';
  createdAt: string;
}

// ==========================================
// TRANSAKSI UANG MASUK (HASIL PENJUALAN HASIL BUMI & PENERIMAAN DIVISI)
// ==========================================
export interface TransaksiUangMasuk {
  idTransaksi: string;           // e.g. "UMS-261101-001"
  tanggal: string;               // DD/MM/YYYY
  jam: string;                   // HH:mm:ss
  divisi: string;                // Divisi penerima arus kas masuk
  kategori: string;              // e.g. "Penjualan Hasil Bumi", "Penerimaan Operasional", dll.
  namaPengirim: string;          // Nama pembeli / pabrik / bandar / penyetor
  pengirim?: string;             // Alias kompatibel
  idMitra?: string;              // 'UMUM' atau ID Mitra terdaftar
  metode: 'TUNAI' | 'TRANSFER' | 'SINKRON';
  rekeningTujuan: string;        // KAS01, Rekening Bank PT, atau SINKRON
  nominal: number;               // Nominal uang riil masuk (+)
  noPenjualanHasilBumi?: string; // Opsional link ke nota muat/jual hasil bumi (JHB-...)
  komoditasNama?: string;
  beratMuatKg?: number;
  modalRataRataPerKg?: number;
  nilaiModalStok?: number;
  totalModalStok?: number;
  hargaRealisasiPerKg?: number;
  tandaiPutusLunas?: boolean;
  keterangan: string;
  fotoBukti?: string;
  attachment_url?: string;
  status?: 'BERHASIL';
  createdAt: string;
}

// ==========================================
// UNIFIED TRANSACTION JURNAL REKAPITULASI
// ==========================================
export type ArusUangType = 'MASUK' | 'KELUAR' | 'MUTASI' | 'NON_TUNAI';

export interface UnifiedTransactionItem {
  id: string;
  tanggal: string;
  jam: string;
  timestamp: string;
  jenis:
    | 'PENJUALAN'
    | 'PENJUALAN_HASIL_BUMI'
    | 'PEMBELIAN_HASIL_BUMI'
    | 'PEMBELIAN_BARANG'
    | 'KASBON_UANG'
    | 'BAYAR_BON'
    | 'PENGELUARAN_DIVISI'
    | 'UANG_MASUK'
    | 'PENCAIRAN_TITIPAN'
    | 'UPAH_HARIAN'
    | 'PENGGAJIAN'
    | 'TRANSFER_REKENING'
    | 'BRILINK'
    | 'NOTA_SILANG';
  jenisLabel: string;
  arusUang: ArusUangType;
  arusUangLabel: string;
  deskripsi: string;
  pihakTerkait: string;
  kategoriPihak: 'MITRA' | 'KARYAWAN' | 'VENDOR' | 'DIVISI' | 'INTERNAL';
  rekening: string;
  nominal: number;
  nominalMasuk: number;
  nominalKeluar: number;
  // Fokus Arus Kas Kasir (KAS01)
  isArusKasKasir?: boolean;
  arahKasir?: 'MASUK' | 'KELUAR' | 'MUTASI_MASUK' | 'MUTASI_KELUAR' | 'NON_KASIR';
  arahKasirLabel?: string;
  nominalKasirMasuk?: number;
  nominalKasirKeluar?: number;
  metode: string;
  status: string;
  fotoBukti?: string;
  fotoNota?: string;
  attachment_url?: string;
  divisi?: string;
}

export interface RekapSemuaTransaksiResponse {
  summary: {
    tanggalQuery?: string;
    totalTransaksi: number;
    totalUangMasuk: number;
    totalUangKeluar: number;
    arusKasBersih: number;
    totalNonTunai: number;
    rincianArus: {
      masukCount: number;
      keluarCount: number;
      mutasiCount: number;
      nonTunaiCount: number;
    };
  };
  kasirSummary?: {
    kodeKasir: string;
    namaKasir: string;
    tanggalAcuan: string;
    isFilteredSingleDate: boolean;
    saldoAwalKasir: number;
    uangMasukOperasionalKasir: number;
    uangKeluarOperasionalKasir: number;
    mutasiMasukKasir: number;
    mutasiKeluarKasir: number;
    setorKeBerangkasKasir?: number;
    mutasiKeluarNonBerangkasKasir?: number;
    saldoSebelumSetorBerangkas?: number;
    selisihKasirHarian?: number;
    totalMasukKasir: number;
    totalKeluarKasir: number;
    arusBersihKasir: number;
    saldoAkhirKasir: number;
    saldoKasirLiveSaatIni: number;
    totalTransaksiKasir: number;
  };
  transactions: UnifiedTransactionItem[];
  daftarPihakTerkait: string[];
  daftarTanggalTersedia: string[];
}

export interface FullErpDataset {
  rekeningList: Rekening[];
  mitraList: Mitra[];
  karyawanList: Karyawan[];
  upahHarianList: CatatanUpahHarian[];
  penggajianList: TransaksiPenggajian[];
  produkList: Produk[];
  kategoriProdukList?: Array<{
    nama: string;
    deskripsi: string;
    tanpaStok?: boolean;
    jumlahProduk: number;
    isSaved: boolean;
  }>;
  stokList: StokBarang[];
  stokHasilBumiList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  penjualanHasilBumiList?: TransaksiPenjualanHasilBumi[];
  pembelianBarangList: TransaksiPembelianBarang[];
  pencairanTitipanList?: TransaksiPencairanTitipan[];
  penjualanList: TransaksiPenjualan[];
  kasbonUangList: TransaksiKasbonUang[];
  bayarBonList: TransaksiBayarBon[];
  pengeluaranList?: TransaksiPengeluaran[];
  inventarisList?: ItemInventaris[];
  transferList: TransaksiTransferRekening[];
  brilinkList?: TransaksiBrilink[];
  uangMasukList?: TransaksiUangMasuk[];
  auditLogs: AuditLog[];
}

export type FullErpModularDataset = FullErpDataset;

export interface DatabaseIntegrityStatus {
  singleSource: 'SUPABASE_CLOUD' | 'LOCAL_WAITING_CONFIG';
  supabaseConfigured: boolean;
  supabaseUrlMasked: string;
  lastSyncTime: string | null;
  lastSyncStatus: 'SUCCESS' | 'ERROR' | null;
  lastSyncMessage: string | null;
  isHealthy: boolean;
  counts: {
    produk: number;
    kategoriProduk: number;
    stokBarang: number;
    stokHasilBumi: number;
    mitra: number;
    karyawan: number;
    rekening: number;
    penjualan: number;
    pembelianBarang: number;
    pembelianHasilBumi: number;
    penjualanHasilBumi?: number;
    pencairanTitipan: number;
    kasbonUang: number;
    bayarBon: number;
    pengeluaran: number;
    uangMasuk?: number;
    transferRekening: number;
    brilink?: number;
    upahHarian: number;
    penggajian: number;
    auditLogs: number;
    totalRecords: number;
  };
  checks: {
    produkStokMatched: boolean;
    karyawanMitraMatched: boolean;
    anakPerusahaanMitraMatched?: boolean;
    bon01Reconciled: boolean;
    tit01Reconciled: boolean;
    bon01Saldo: number;
    tit01Saldo: number;
  };
}

// ==========================================
// PUSAT KLIRING SILANG, AUDIT DUPLIKAT & CASH OPNAME KASIR
// ==========================================
export interface KandidatKliringMitra {
  idMitra: string;
  kodeMitra: string;
  namaMitra: string;
  role: RoleMitra;
  telepon: string;
  saldoTitipan: number;
  kasbonBarang: number;
  kasbonUang: number;
  totalKasbon: number;
  potensiPotongSilang: number;
  hakBersihMitra: number;
  sisaKurangBon: number;
  jumlahNotaBonAktif: number;
}

export interface PasanganMitraKembar {
  pairKey: string;
  mitraA: RekapMitraItem;
  mitraB: RekapMitraItem;
  similarityScore: number; // 0..100
  alasanKemiripan: string;
  risikoSilang: boolean; // true jika satu punya titipan dan satunya punya kasbon
}

export interface CatatanCashOpname {
  id: string;
  tanggal: string;
  jam: string;
  petugasKasir: string;
  saldoSistemSebelum: number;
  totalFisikLaci: number;
  selisih: number; // totalFisikLaci - saldoSistemSebelum
  statusRekonsiliasi: 'COCOK' | 'SELISIH_LEBIH' | 'SELISIH_KURANG';
  rincianPecahan: Record<string, number>;
  sesuaikanSaldoSistem: boolean;
  catatan: string;
  createdAt: string;
}

export interface SmartControlOverviewResponse {
  kandidatKliring: KandidatKliringMitra[];
  semuaMitraSaldo: KandidatKliringMitra[];
  pasanganKembar: PasanganMitraKembar[];
  cashOpnameLogs: CatatanCashOpname[];
  saldoKas01SaatIni: number;
  ringkasanKasHariIni: {
    tanggal: string;
    masukTunaiKas01: number;
    keluarTunaiKas01: number;
    kompensasiNonTunaiHariIni: number;
  };
}

export interface HasilKliringSilangResponse {
  idReferensiKliring: string;
  tanggal: string;
  jam: string;
  idMitra: string;
  kodeMitra: string;
  namaMitra: string;
  saldoTitipanAwal: number;
  totalKasbonAwal: number;
  nominalPotongSilang: number;
  aksiSisa: 'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON';
  nominalPenyelesaianFisik: number;
  metodeFisik?: 'TUNAI' | 'TRANSFER';
  rekeningFisik?: string;
  saldoTitipanAkhir: number;
  sisaKasbonAkhir: number;
  alokasiBonLunas: AlokasiPembayaranBon[];
  keterangan: string;
}

// ==========================================
// REKAPAN TRANSAKSI HARIAN BOS, TUTUP KASIR -> BERANGKAS & BARANG MASUK PER KOMODITAS
// ==========================================
export interface ItemDetailArusKasBos {
  id: string;
  tanggal: string;
  jam: string;
  arah: 'MASUK' | 'KELUAR' | 'MUTASI_INTERNAL';
  kategoriKode: string;
  kategoriLabel: string;
  divisi?: string;
  pihak: string;
  deskripsi: string;
  metode: string;
  rekeningKode: string;
  rekeningNama: string;
  nominalTotal: number;
  nominalKasirTunai: number; // Pengaruh ke KAS01 (Kas Utama Kasir)
  nominalBank: number;       // Pengaruh ke Bank PT
  fotoBukti?: string;
}

export interface KesimpulanKasirBerangkasBos {
  kodeKasir: string;
  namaKasir: string;
  kodeBerangkas: string;
  namaBerangkas: string;
  isTanggalHariIni: boolean;
  saldoAwalKasirPagi: number;
  droppingMasukKasirHariIni: number; // Transfer dari Berangkas / Bank ke KAS01
  uangMasukOperasionalKasirHariIni: number;
  uangKeluarOperasionalKasirHariIni: number;
  mutasiPokokBrilinkKasirHariIni: number; // + jika Tukar Cash, - jika Tarik Tunai nasabah
  transferKeluarKeBankLainHariIni: number;
  saldoAkhirKasirSebelumSetorBerangkas: number; // Kesimpulan uang kasir sebelum dikosongkan ke Berangkas
  sudahDisetorKeBerangkasHariIni: number;       // Transfer KAS01 -> BRK01 pada tanggal terpilih
  saldoAkhirKasirPadaTanggal: number;           // Posisi akhir KAS01 setelah dikurangi setoran Berangkas
  saldoKasirSaatIniLive: number;
  saldoBerangkasSaatIniLive: number;
  estimasiSaldoBerangkasSetelahKosongkanKasir: number;
}

export interface BarisKomoditasMasukBos {
  id: string;
  tanggal: string; // DD/MM/YYYY
  jam: string;
  namaMitra: string;
  beratBersihKg: number;
  hargaPerKg: number;
  jumlahRp: number;
  metodePembayaran: string;
  isBelumPutusHarga?: boolean;
  isSaldoAwalMigrasi?: boolean;
}

export interface StokLamaKomoditasBos {
  label: string;          // e.g. "SISA OKTOBER" / "STOK AKHIR OKTOBER" / "STOK LAMA"
  tanggalLabel: string;   // e.g. "1 NOV"
  beratKg: number;        // Stok lama sebelum transaksi periode/hari ini
  hargaRataPerKg: number; // Harga rata-rata lama (Rp/Kg)
  jumlahModalRp: number;  // Jumlah uang modal lama (Rp)
  // Nilai master saldo awal (untuk form input/edit stok lama)
  masterStokAwalKg: number;
  masterHargaRataAwal: number;
  masterModalAwalRp: number;
  masterKeteranganAwal: string;
}

export interface KolomKomoditasMasukBos {
  kode: string;
  nama: string;
  satuan: string;
  stokGudangSaatIniKg: number;
  stokLama: StokLamaKomoditasBos;
  rows: BarisKomoditasMasukBos[];
  // Khusus penambahan barang masuk pada periode / tanggal terpilih
  totalKgPeriode: number;
  rataHargaPerKgPeriode: number;
  totalRpPeriode: number;
  // Total gabungan (Stok Lama + Barang Masuk) seperti baris hijau Excel Bos
  totalStokGabunganKg: number;
  rataHargaGabunganPerKg: number;
  totalModalGabunganRp: number;
}

export interface ItemBarangTokoMasukBos {
  idFaktur: string;
  tanggal: string;
  jam: string;
  namaSupplier: string;
  namaProduk: string;
  kategori: string;
  qty: number;
  satuan: string;
  hargaBeli: number;
  subtotal: number;
  metodePembayaran: string;
  rekeningSumber: string;
}

export interface RekapHarianBosLengkapResponse {
  tanggal: string; // DD/MM/YYYY
  tanggalIso: string; // YYYY-MM-DD
  daftarTanggalTersedia: string[]; // DD/MM/YYYY sorted newest first
  // Ringkasan Arus Kas Operasional (Kasir + Bank PT)
  totalUangMasuk: number;
  totalUangMasukKasirTunai: number;
  totalUangMasukBank: number;
  totalUangKeluar: number;
  totalUangKeluarKasirTunai: number;
  totalUangKeluarBank: number;
  arusKasBersih: number;
  arusKasBersihKasirTunai: number;
  rincianKategoriMasuk: Array<{ label: string; total: number; kasirTunai: number; bank: number; count: number }>;
  rincianKategoriKeluar: Array<{ label: string; total: number; kasirTunai: number; bank: number; count: number }>;
  detailUangMasuk: ItemDetailArusKasBos[];
  detailUangKeluar: ItemDetailArusKasBos[];
  detailMutasiKasirBerangkas: ItemDetailArusKasBos[];
  kesimpulanKasirBerangkas: KesimpulanKasirBerangkasBos;
  // Rekapan Barang Masuk per Hari & Akumulasi per Komoditas
  komoditasHarianList: KolomKomoditasMasukBos[];
  komoditasAkumulasiList: KolomKomoditasMasukBos[];
  totalKgStokLamaHariIni: number;
  totalModalStokLamaHariIni: number;
  totalKgHasilBumiHariIni: number;
  totalRpHasilBumiHariIni: number;
  totalKgStokGabunganHariIni: number;
  totalUangModalHbDikeluarkan: number;
  barangTokoMasukHariIni: ItemBarangTokoMasukBos[];
  totalRpBarangTokoHariIni: number;
}
export interface InvoiceSuratJalanRecord {
  id: string;
  noInvoice: string;
  tanggal: string; // DD/MM/YYYY
  jam?: string;
  idMitra: string;
  namaMitra: string;
  komoditasNama: string;
  kategoriKode?: string;
  platTruk?: string;
  tonaseAwalKg: number;
  tonaseAkhirKg: number;
  susutKg: number;
  basisMitra: number;
  basisBuyer: number;
  rendemen: number;
  hargaPerKgMitra: number;
  hargaPerKgBuyer: number;
  totalPenjualanMitra: number; // Tonase Akhir * hargaPerKgMitra
  totalPenjualanBuyer: number; // Tonase Akhir * hargaPerKgBuyer
  marginHargaPt: number; // totalPenjualanBuyer - totalPenjualanMitra
  pajakNominal: number; // 0.25% * totalPenjualanMitra
  komisiNominal: number; // Komisi jasa jual PT WAP
  kasbonNominal: number; // Potongan kasbon / piutang mitra
  potongPiutang: boolean;
  potonganLainLabel?: string;
  potonganLainNominal?: number;
  tambahanLabel?: string;
  tambahanNominal?: number;
  totalKeuntunganPt: number; // marginHargaPt + komisiNominal
  totalPotongan: number;
  jumlahPembayaranMitra: number; // Hak bersih mitra
  rekeningPtKode: string; // e.g. BNI01
  statusPembayaranMitra: 'PENDING' | 'LUNAS'; // Pending Order vs Langsung Bayar
  tanggalBayarMitra?: string;
  idUangMasukBuyer?: string;
  idUangMasukKomisi?: string;
  idPengeluaranBayarMitra?: string;
  idBayarBonMitra?: string;
  createdAt: string;
}
