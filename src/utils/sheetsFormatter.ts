import {
  AuditLog,
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
} from '../server/types.ts';

export interface FullErpDataset {
  rekeningList: Rekening[];
  mitraList: Mitra[];
  karyawanList: Karyawan[];
  produkList: Produk[];
  stokList: StokBarang[];
  stokHasilBumiList: StokHasilBumi[];
  penjualanList: TransaksiPenjualan[];
  pembelianList: TransaksiPembelianHasilBumi[];
  kasbonUangList: TransaksiKasbonUang[];
  bayarBonList: TransaksiBayarBon[];
  transferList: TransaksiTransferRekening[];
  penggajianList: TransaksiPenggajian[];
  auditLogs: AuditLog[];
}

export const buildSpreadsheetPayload = (data: FullErpDataset): Record<string, (string | number)[][]> => {
  const timestampNow = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // 1. Rekap & Saldo Rekening
  const rekapSheet: (string | number)[][] = [
    ['REKAPITULASI SALDO REKENING - ERP WIJAYA AGRO', `Disinkronkan: ${timestampNow} WIB`],
    ['Kode Rekening', 'Nama Rekening', 'Atas Nama', 'No. Rekening', 'Tipe Akun', 'Saldo Saat Ini (Rp)', 'Status', 'Keterangan'],
    ...data.rekeningList.map((r) => [
      r.kode,
      r.nama,
      r.atasNama,
      r.nomorRekening || '-',
      r.isVirtual ? 'VIRTUAL SYSTEM' : 'REAL KEUANGAN',
      r.saldoSaatIni,
      r.status,
      r.keterangan || '-',
    ]),
  ];

  // 2. Pembelian Hasil Bumi
  const pembelianSheet: (string | number)[][] = [
    ['PEMBELIAN HASIL BUMI DARI PETANI / MITRA', `Disinkronkan: ${timestampNow} WIB`],
    [
      'No. Pembelian',
      'Tanggal',
      'Jam',
      'Nama Mitra / Petani',
      'Komoditas',
      'Berat Kotor (Kg)',
      'Rafaksi (%)',
      'Berat Bersih (Kg)',
      'Harga / Kg (Rp)',
      'Total Nilai (Rp)',
      'Metode Bayar',
      'Rekening Sumber',
      'Keterangan',
    ],
    ...data.pembelianList.map((p) => [
      p.noPembelian,
      p.tanggal,
      p.jam,
      p.namaMitra,
      p.komoditasNama,
      p.beratKotor,
      p.potonganRafaksi,
      p.beratBersih,
      p.hargaPerKg,
      p.totalNominal,
      p.metodePembayaran,
      p.rekeningSumber || '-',
      p.keterangan || '-',
    ]),
  ];

  // 3. Penjualan Toko
  const penjualanSheet: (string | number)[][] = [
    ['PENJUALAN PRODUK TOKO & SARANA PERTANIAN', `Disinkronkan: ${timestampNow} WIB`],
    [
      'No. Penjualan',
      'Tanggal',
      'Jam',
      'Nama Pelanggan / Mitra',
      'Total Nilai (Rp)',
      'Metode Bayar',
      'Rekening Masuk',
      'Daftar Item',
      'Keterangan',
    ],
    ...data.penjualanList.map((t) => {
      const itemsStr = (t.items || []).map((i) => `${i.namaProduk} (${i.qty} x ${i.harga})`).join('; ');
      return [
        t.noPenjualan,
        t.tanggal,
        t.jam,
        t.namaMitra,
        t.totalNominal,
        t.metode,
        t.rekeningTujuan || '-',
        itemsStr,
        t.keterangan || '-',
      ];
    }),
  ];

  // 4. Kasbon & Piutang (Gabungan Kasbon Uang & Pembayaran Bon)
  const kasbonSheet: (string | number)[][] = [
    ['MUTASI KASBON & PEMBAYARAN BON MITRA/KARYAWAN', `Disinkronkan: ${timestampNow} WIB`],
    ['Jenis Mutasi', 'ID Transaksi', 'Tanggal', 'Jam', 'Nama Mitra / Karyawan', 'Nominal (Rp)', 'Metode', 'Rekening Terkait', 'Sisa Bon (Rp)', 'Keterangan'],
    ...data.kasbonUangList.map((k) => [
      'KASBON UANG (PENARIKAN)',
      k.idTransaksi,
      k.tanggal,
      k.jam,
      k.namaMitra,
      k.nominal,
      k.metode,
      k.rekeningSumber,
      k.sisaKasbon,
      k.keterangan || '-',
    ]),
    ...data.bayarBonList.map((b) => [
      'BAYAR BON (PELUNASAN)',
      b.idTransaksi,
      b.tanggal,
      b.jam,
      b.namaMitra,
      b.nominalBayar,
      b.metode,
      b.rekeningTujuan,
      b.sisaBonSetelah,
      b.keterangan || '-',
    ]),
  ];

  // 5. Penggajian Karyawan
  const penggajianSheet: (string | number)[][] = [
    ['PENGGAJIAN KARYAWAN & UPAH HARIAN', `Disinkronkan: ${timestampNow} WIB`],
    [
      'No. Slip Gaji',
      'Tanggal',
      'Nama Karyawan',
      'Divisi / Dept',
      'Tipe Gaji',
      'Gaji Pokok / Harian (Rp)',
      'Bonus / Makan (Rp)',
      'Total Gaji Kotor (Rp)',
      'Potongan Kasbon (Rp)',
      'Gaji Bersih Diterima (Rp)',
      'Metode Bayar',
      'Rekening Sumber',
      'Keterangan',
    ],
    ...data.penggajianList.map((g) => [
      g.slipNomor || g.id,
      g.tanggalKerja || g.tanggal,
      g.namaKaryawan,
      g.divisi || g.departemen || '-',
      g.tipeGaji,
      g.gajiPokok,
      g.bonus,
      g.totalGajiKotor,
      g.potonganKasbon,
      g.gajiBersihDibayar,
      g.metodePembayaran,
      g.rekeningSumber,
      g.periodeBulan || '-',
    ]),
  ];

  // 6. Stok Barang & Komoditas
  const stokSheet: (string | number)[][] = [
    ['STATUS STOK BARANG TOKO & HASIL BUMI', `Disinkronkan: ${timestampNow} WIB`],
    ['Jenis', 'Kode', 'Nama Item', 'Satuan', 'Stok Saat Ini', 'Batas Minimum', 'Update Terakhir'],
    ...data.stokList.map((s) => [
      'BARANG TOKO',
      s.kode,
      s.namaProduk,
      s.satuan,
      s.stok,
      s.minimum,
      s.updateTerakhir,
    ]),
    ...data.stokHasilBumiList.map((hb) => [
      'KOMODITAS HASIL BUMI',
      hb.kode,
      hb.nama,
      hb.satuan,
      hb.stok,
      '-',
      hb.updateTerakhir,
    ]),
  ];

  // 7. Master Mitra & Karyawan
  const mitraKaryawanSheet: (string | number)[][] = [
    ['DATA MITRA, PETANI, & KARYAWAN', `Disinkronkan: ${timestampNow} WIB`],
    ['Kategori', 'Kode / ID', 'Nama', 'Peran / Jabatan', 'Departemen / Wilayah', 'No HP / Telepon', 'Alamat', 'Status'],
    ...data.mitraList.map((m) => [
      'MITRA / PELANGGAN / PETANI',
      m.kode || m.id,
      m.nama,
      m.role,
      '-',
      m.telepon || '-',
      m.alamat || '-',
      m.status,
    ]),
    ...data.karyawanList.map((k) => [
      'KARYAWAN INTERNAL',
      k.nik || k.id,
      k.nama,
      k.jabatan,
      k.departemen,
      k.telepon || '-',
      k.alamat || '-',
      k.status,
    ]),
  ];

  // 8. Log Mutasi Transaksi
  const logSheet: (string | number)[][] = [
    ['AUDIT LOG MUTASI KEUANGAN & STOK', `Disinkronkan: ${timestampNow} WIB`],
    ['Waktu (Timestamp)', 'Tanggal', 'Jam', 'User Kasir', 'Jenis Transaksi', 'ID Transaksi', 'Rekening Terkait', 'Nominal (Rp)', 'Detail Mutasi'],
    ...data.auditLogs.map((l) => [
      l.timestamp,
      l.tanggal,
      l.jam,
      l.user,
      l.jenisTransaksi,
      l.idTransaksi,
      l.rekeningTerkait || '-',
      l.nominal || 0,
      l.detail,
    ]),
  ];

  return {
    'Rekap & Saldo Rekening': rekapSheet,
    'Pembelian Hasil Bumi': pembelianSheet,
    'Penjualan Toko': penjualanSheet,
    'Kasbon & Piutang': kasbonSheet,
    'Penggajian Karyawan': penggajianSheet,
    'Stok Barang & Komoditas': stokSheet,
    'Master Mitra & Karyawan': mitraKaryawanSheet,
    'Log Mutasi Transaksi': logSheet,
  };
};
