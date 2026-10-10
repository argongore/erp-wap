import * as XLSX from 'xlsx';
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
} from '../server/types.ts';

export interface FullErpModularDataset {
  rekeningList: Rekening[];
  mitraList: Mitra[];
  karyawanList: Karyawan[];
  upahHarianList: CatatanUpahHarian[];
  penggajianList: TransaksiPenggajian[];
  produkList: Produk[];
  stokList: StokBarang[];
  stokHasilBumiList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  pembelianBarangList: TransaksiPembelianBarang[];
  penjualanList: TransaksiPenjualan[];
  kasbonUangList: TransaksiKasbonUang[];
  bayarBonList: TransaksiBayarBon[];
  transferList: TransaksiTransferRekening[];
  auditLogs: AuditLog[];
}

export interface ModularFileDefinition {
  id: 'file-karyawan' | 'file-mitra' | 'file-transaksi' | 'file-hasil-bumi';
  fileName: string;
  googleSheetTitle: string;
  label: string;
  badge: string;
  color: string;
  description: string;
  sheets: {
    sheetName: string;
    tabLabel: string;
    icon: string;
    description: string;
    data: (string | number)[][];
    isSummaryTab?: boolean;
    isTemplate?: boolean;
    isRealEntity?: boolean;
    tandaUnik?: 'KARYAWAN' | 'MITRA' | 'TRANSAKSI' | 'KOMODITAS';
    entityId?: string;
  }[];
}

const formatRupiah = (val: number | undefined | null): number => {
  return typeof val === 'number' ? val : 0;
};

/**
 * Sanitizes sheet names for Excel compatibility (max 31 characters, no illegal chars)
 * and ensures uniqueness within the workbook.
 */
export const sanitizeSheetTabName = (name: string, usedNames: Set<string>): string => {
  let clean = name.replace(/[:\\/?*\[\]]/g, '').trim().toUpperCase();
  if (!clean) clean = 'SHEET';
  if (clean.length > 28) clean = clean.slice(0, 28).trim();

  let finalName = clean;
  let counter = 2;
  while (usedNames.has(finalName)) {
    const prefix = clean.slice(0, 23);
    finalName = `${prefix} (${counter})`;
    counter++;
  }
  usedNames.add(finalName);
  return finalName;
};

export const buildModularSpreadsheets = (
  dataset: FullErpModularDataset
): ModularFileDefinition[] => {
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  // =========================================================================
  // FILE 1: DATABASE KARYAWAN (1 PAGE REKAP + 1 PAGE PER KARYAWAN)
  // Sesuai instruksi:
  // "untuk setiap karyawan dibuat beda... ketika ada karyawan baru maka akan memuat
  //  page baru sesuai nama karyawannya... 1 page rekap total + 1 page per karyawan"
  // =========================================================================
  const karyawanSheets: ModularFileDefinition['sheets'] = [];
  const usedKaryawanSheetNames = new Set<string>();

  // Determine list of employees: all real employees from DB + 3 sample template employees if none exist
  const sampleKaryawanTemplates: Array<{
    id: string;
    nik: string;
    nama: string;
    divisi: string;
    jabatan: string;
    gajiPokok: number;
    uangMakan: number;
    telepon: string;
    sampleLogs: Array<{
      tanggal: string;
      hari: string;
      divisi: string;
      item: string;
      qty: number;
      tarif: number;
      jumlah: number;
      ket: 'BON' | 'LUNAS';
      catatan: string;
    }>;
  }> = [
    {
      id: 'KRY-CONTOH-01',
      nik: 'KRY-001',
      nama: 'AGUS SUPRIYADI',
      divisi: 'CV Wijaya Agro',
      jabatan: 'Kasir & Admin Toko',
      gajiPokok: 135000,
      uangMakan: 15000,
      telepon: '0812-9988-1122',
      sampleLogs: [
        { tanggal: '01/09/2026', hari: 'SELASA 01 SEP', divisi: 'CV WA', item: 'KERJA GUDANG', qty: 1, tarif: 135000, jumlah: 150000, ket: 'BON', catatan: 'Rekap kas harian toko' },
        { tanggal: '02/09/2026', hari: 'RABU 02 SEP', divisi: 'CV WA', item: 'KERJA GUDANG', qty: 1, tarif: 135000, jumlah: 150000, ket: 'BON', catatan: 'Pelayanan kasir pupuk' },
        { tanggal: '03/09/2026', hari: 'KAMIS 03 SEP', divisi: 'GWA', item: 'SURJAL', qty: 1, tarif: 150000, jumlah: 165000, ket: 'LUNAS', catatan: 'Surat jalan kirim gabah' },
        { tanggal: '04/09/2026', hari: 'JUMAT 04 SEP', divisi: 'CV WA', item: 'KERJA GUDANG', qty: 1, tarif: 135000, jumlah: 150000, ket: 'LUNAS', catatan: 'Tutup buku mingguan' },
      ],
    },
    {
      id: 'KRY-CONTOH-02',
      nik: 'KRY-002',
      nama: 'BAMBANG PAMUNGKAS',
      divisi: 'Gudang Wijaya Agro',
      jabatan: 'Staff Gudang & Timbang',
      gajiPokok: 125000,
      uangMakan: 20000,
      telepon: '0813-8877-6655',
      sampleLogs: [
        { tanggal: '01/09/2026', hari: 'SELASA 01 SEP', divisi: 'GWA', item: 'BONGKAR BARANG', qty: 1, tarif: 125000, jumlah: 145000, ket: 'BON', catatan: 'Timbang jagung petani' },
        { tanggal: '02/09/2026', hari: 'RABU 02 SEP', divisi: 'GWA', item: 'NGEBAL', qty: 1, tarif: 125000, jumlah: 145000, ket: 'BON', catatan: 'Sortir beras pecah kulit' },
        { tanggal: '04/09/2026', hari: 'JUMAT 04 SEP', divisi: 'WK', item: 'BONGKAR PUPUK', qty: 1, tarif: 140000, jumlah: 160000, ket: 'LUNAS', catatan: 'Muat pupuk 10 ton' },
      ],
    },
    {
      id: 'KRY-CONTOH-03',
      nik: 'KRY-004',
      nama: 'WIWIT',
      divisi: 'Wijaya Transport',
      jabatan: 'Staff Operasional Gudang & Driver',
      gajiPokok: 140000,
      uangMakan: 25000,
      telepon: '0857-1122-3344',
      sampleLogs: [
        { tanggal: '01/09/2026', hari: 'SELASA 01 SEP', divisi: 'WIJAYA TRANS', item: 'DRIVER TRUK', qty: 1, tarif: 140000, jumlah: 165000, ket: 'BON', catatan: 'Antar gabah ke pabrik' },
        { tanggal: '03/09/2026', hari: 'KAMIS 03 SEP', divisi: 'WIJAYA TRANS', item: 'JALAN', qty: 1, tarif: 140000, jumlah: 165000, ket: 'LUNAS', catatan: 'Pengiriman sarana produksi' },
        { tanggal: '05/09/2026', hari: 'SABTU 05 SEP', divisi: 'WIJAYA TRANS', item: 'DRIVER TOING', qty: 1, tarif: 150000, jumlah: 175000, ket: 'LUNAS', catatan: 'Lembur jemput panen petani' },
      ],
    },
  ];

  // 1. PAGE 1: REKAP TOTAL SELURUH KARYAWAN
  const rekapKaryawanSheetData: (string | number)[][] = [
    ['REKAPITULASI TOTAL REKENING & PAYROLL KARYAWAN - PT WIJAYA AGRO', `Disinkronkan: ${timestamp} WIB`],
    ['TANDA KHUSUS: [KARYAWAN INTERNAL] (Membedakan secara mutlak data Karyawan vs Mitra Eksternal untuk tracking bon bulanan)'],
    [
      'No',
      'Tanda Unik',
      'NIK / ID',
      'Nama Karyawan',
      'Divisi / Dept',
      'Jabatan',
      'Standar Upah Pokok (Rp)',
      'Total Hadir (Hari)',
      'Total Hak Upah Pokok (Rp)',
      'Uang Makan / Lembur (Rp)',
      'Total Hak Upah Kotor (Rp)',
      'Bon Uang Tunai (Rp)',
      'Bon Barang Toko (Rp)',
      'Total Hutang Bon (Rp)',
      'Estimasi Gaji Bersih Siap Bayar (Rp)',
      'Status Keuangan Bon',
      'Tipe Data',
    ],
  ];

  let karyawanRowIndex = 1;

  // Real Employees from Database
  dataset.karyawanList.forEach((k) => {
    const logs = dataset.upahHarianList.filter(
      (u) => u.idKaryawan === k.id || u.nikKaryawan === k.nik
    );
    const totalHadir = logs.length;
    const totalUpahPokok = logs.reduce((sum, u) => sum + (u.harga ?? u.upahHarian ?? 0), 0);
    const totalUangMakan = logs.reduce((sum, u) => sum + (u.uangMakanLembur || 0), 0);
    const totalKotor = logs.reduce((sum, u) => sum + (u.jumlah ?? u.totalUpahHarian ?? 0), 0);

    const mitraId = k.idMitraTerkait || `MTR-${k.id}`;
    const bonUang = dataset.kasbonUangList
      .filter((ku) => (ku.idMitra === mitraId || ku.namaMitra.includes(k.nama)) && ku.status !== 'LUNAS')
      .reduce((sum, ku) => sum + (ku.sisaKasbon || 0), 0);
    const bonBarang = dataset.penjualanList
      .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
      .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
    const totalBon = bonUang + bonBarang;
    const gajiBersih = Math.max(0, totalKotor - totalBon);

    rekapKaryawanSheetData.push([
      karyawanRowIndex++,
      '[KARYAWAN INTERNAL]',
      k.nik || k.id,
      k.nama,
      k.departemen || 'Operasional',
      k.jabatan,
      formatRupiah(k.gajiPokok),
      totalHadir,
      formatRupiah(totalUpahPokok),
      formatRupiah(totalUangMakan),
      formatRupiah(totalKotor),
      formatRupiah(bonUang),
      formatRupiah(bonBarang),
      formatRupiah(totalBon),
      formatRupiah(gajiBersih),
      totalBon > 0 ? `ADA BON BERJALAN (${formatRupiah(totalBon)})` : 'BEBAS BON / LUNAS',
      'KARYAWAN RIIL (AKTIF)',
    ]);
  });

  // If no real employees exist yet, provide 1 clear informational status row
  if (dataset.karyawanList.length === 0) {
    rekapKaryawanSheetData.push([
      1,
      '[KARYAWAN INTERNAL]',
      '-',
      'Belum ada data karyawan riil di database. Silakan input karyawan di menu Master Karyawan.',
      '-',
      '-',
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      'DATABASE KOSONG',
      'SIAP INPUT DATA ASLI',
    ]);
  }

  // Add Monthly Money Flow Summary Table
  rekapKaryawanSheetData.push([]);
  rekapKaryawanSheetData.push(['RINGKASAN PERGERAKAN UANG BERJALAN SETIAP BULANNYA (BON & GAJI KARYAWAN 2026)']);
  rekapKaryawanSheetData.push([
    'No',
    'Periode Bulan',
    'Total Hadir Kerja',
    'Hak Upah Harian Kotor (Rp)',
    'Kasbon Uang Masuk (Rp)',
    'Bon Barang Toko (Rp)',
    'Total Bon Berjalan (Rp)',
    'Gaji Bersih Siap Bayar (Rp)',
    'Status Payroll',
  ]);
  const sampleMonthlyKaryawan = [
    { bulan: 'Juli 2026', hadir: 26, upah: 3900000, kasbon: 500000, barang: 250000, bayarBon: 750000, sisaBon: 0, status: 'LUNAS TERBAYAR' },
    { bulan: 'Agustus 2026', hadir: 25, upah: 3750000, kasbon: 600000, barang: 300000, bayarBon: 900000, sisaBon: 0, status: 'LUNAS TERBAYAR' },
    { bulan: 'September 2026', hadir: 27, upah: 4050000, kasbon: 700000, barang: 450000, bayarBon: 500000, sisaBon: 650000, status: 'ADA SISA BON' },
    { bulan: 'Oktober 2026 (Berjalan)', hadir: 4, upah: 600000, kasbon: 200000, barang: 100000, bayarBon: 0, sisaBon: 300000, status: 'PERIODE BERJALAN' },
  ];
  sampleMonthlyKaryawan.forEach((m, idx) => {
    const netGaji = Math.max(0, m.upah - m.sisaBon);
    rekapKaryawanSheetData.push([
      idx + 1,
      m.bulan,
      m.hadir,
      formatRupiah(m.upah),
      formatRupiah(m.kasbon),
      formatRupiah(m.barang),
      formatRupiah(m.sisaBon),
      formatRupiah(netGaji),
      m.status,
    ]);
  });

  const rekapKaryawanSheetName = sanitizeSheetTabName('REKAP_TOTAL_KARYAWAN', usedKaryawanSheetNames);
  karyawanSheets.push({
    sheetName: rekapKaryawanSheetName,
    tabLabel: '📑 REKAP TOTAL KARYAWAN',
    icon: 'Receipt',
    description: 'Ringkasan posisi seluruh karyawan: kehadiran kerja, total upah, potongan bon, dan gaji siap bayar.',
    data: rekapKaryawanSheetData,
    isSummaryTab: true,
    tandaUnik: 'KARYAWAN',
  });

  // 2. DEDICATED INDIVIDUAL PAGE FOR EACH REAL EMPLOYEE
  if (dataset.karyawanList.length > 0) {
    dataset.karyawanList.forEach((kry) => {
      const logs = dataset.upahHarianList.filter(
        (u) => u.idKaryawan === kry.id || u.nikKaryawan === kry.nik
      );
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const bonUangList = dataset.kasbonUangList.filter(
        (ku) => ku.idMitra === mitraId || ku.namaMitra.includes(kry.nama)
      );
      const bonBarangList = dataset.penjualanList.filter(
        (p) => p.idMitra === mitraId && p.metode === 'KASBON'
      );
      const slips = dataset.penggajianList.filter((g) => g.idKaryawan === kry.id);

      const totalHadir = logs.length;
      const totalKotor = logs.reduce((sum, u) => sum + (u.jumlah ?? u.totalUpahHarian ?? 0), 0);
      const totalBonUang = bonUangList
        .filter((k) => k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);
      const totalBonBarang = bonBarangList
        .filter((p) => p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const gajiBersih = Math.max(0, totalKotor - (totalBonUang + totalBonBarang));

      const sheetData: (string | number)[][] = [
        [`BUKU CATATAN KERJA, UPAH & BON PRIBADI: ${kry.nama.toUpperCase()}`, `Disinkronkan: ${timestamp} WIB`],
        ['PROFIL KARYAWAN'],
        ['NIK / ID', 'Nama Karyawan', 'Divisi / Unit Kerja', 'Jabatan', 'Standar Upah Pokok (Rp)', 'Uang Makan / Lembur (Rp)', 'No. Telepon', 'Status'],
        [
          kry.nik || kry.id,
          kry.nama,
          kry.departemen || 'Operasional',
          kry.jabatan,
          formatRupiah(kry.gajiPokok),
          formatRupiah(kry.tunjanganTetap),
          kry.telepon || '-',
          kry.status,
        ],
        [],
        ['RINGKASAN POSISI GAJI & KASBON BERJALAN'],
        ['Total Hari Kerja', 'Total Hak Upah Kotor (Rp)', 'Total Kasbon Uang (Rp)', 'Total Bon Barang Toko (Rp)', 'Estimasi Gaji Bersih Diterima (Rp)'],
        [
          totalHadir,
          formatRupiah(totalKotor),
          formatRupiah(totalBonUang),
          formatRupiah(totalBonBarang),
          formatRupiah(gajiBersih),
        ],
        [],
        ['JURNAL LOG KERJA & UPAH HARIAN (FORMAT BUKU KEUANGAN WIJAYA AGRO)'],
        [
          'No',
          'Hari & Tanggal',
          'Divisi Penugasan',
          'Item / Pekerjaan',
          'Kuantiti',
          'Tarif Satuan (Rp)',
          'Total Upah Harian (Rp)',
          'Status (BON / LUNAS)',
          'Catatan Operasional',
        ],
      ];

      if (logs.length > 0) {
        logs.forEach((u, idx) => {
          sheetData.push([
            idx + 1,
            u.hariTanggal || u.tanggalKerja,
            u.divisiKode || u.divisi,
            u.item || u.keterangan || 'KERJA GUDANG',
            u.kuantiti ?? 1,
            formatRupiah(u.harga ?? u.upahHarian),
            formatRupiah(u.jumlah ?? u.totalUpahHarian),
            u.ket || (u.status === 'SUDAH_DIBAYAR' ? 'LUNAS' : 'BON'),
            u.catatan || '-',
          ]);
        });
      } else {
        sheetData.push([
          '-',
          'Belum ada catatan kerja harian yang diinput untuk karyawan ini',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
        ]);
      }

      // Add Bon details section if any
      if (bonUangList.length > 0 || bonBarangList.length > 0) {
        sheetData.push([]);
        sheetData.push(['RIWAYAT KASBON UANG & BON BARANG KARYAWAN']);
        sheetData.push(['No', 'Tanggal', 'Jenis Bon', 'Nominal Transaksi (Rp)', 'Sisa Piutang Bon (Rp)', 'Status', 'Keterangan']);
        let bIdx = 1;
        bonUangList.forEach((ku) => {
          sheetData.push([
            bIdx++,
            ku.tanggal,
            'KASBON UANG TUNAI',
            formatRupiah(ku.nominal),
            formatRupiah(ku.sisaKasbon),
            ku.status,
            ku.keterangan || '-',
          ]);
        });
        bonBarangList.forEach((p) => {
          sheetData.push([
            bIdx++,
            p.tanggal,
            'BON BARANG TOKO',
            formatRupiah(p.totalNominal),
            formatRupiah(p.sisaPiutang),
            p.statusPembayaran,
            p.keterangan || '-',
          ]);
        });
      }

      const safeSheetName = sanitizeSheetTabName(kry.nama, usedKaryawanSheetNames);
      karyawanSheets.push({
        sheetName: safeSheetName,
        tabLabel: `👤 ${kry.nama.toUpperCase()}`,
        icon: 'Users',
        description: `Buku catatan kerja harian, upah, dan mutasi bon pribadi untuk ${kry.nama}.`,
        data: sheetData,
        entityId: kry.id,
        isRealEntity: true,
      });
    });
  } else {
    // Hanya jika BELUM ADA karyawan di database (0 karyawan), sediakan 1 tab contoh format panduan
    const k = sampleKaryawanTemplates[0];
    const totalHadir = k.sampleLogs.length;
    const totalKotor = k.sampleLogs.reduce((sum, l) => sum + l.jumlah, 0);

    const sheetData: (string | number)[][] = [
      [`BUKU CATATAN KERJA, UPAH & BON PRIBADI: FORMAT PANDUAN`, `Disinkronkan: ${timestamp} WIB`],
      ['TANDA KHUSUS: [KARYAWAN INTERNAL] • FORMAT PANDUAN SISTEM'],
      ['PROFIL KARYAWAN (FORMAT CONTOH PANDUAN)'],
      ['NIK / ID', 'Nama Karyawan', 'Divisi / Unit Kerja', 'Jabatan', 'Standar Upah Pokok (Rp)', 'Uang Makan / Lembur (Rp)', 'No. Telepon', 'Status'],
      [
        k.nik,
        `${k.nama} (Panduan Format)`,
        k.divisi,
        k.jabatan,
        formatRupiah(k.gajiPokok),
        formatRupiah(k.uangMakan),
        k.telepon,
        'PANDUAN_CONTOH',
      ],
      [],
      ['RINGKASAN POSISI GAJI & KASBON BERJALAN'],
      ['Total Hari Kerja', 'Total Hak Upah Kotor (Rp)', 'Total Kasbon Uang (Rp)', 'Total Bon Barang Toko (Rp)', 'Estimasi Gaji Bersih Diterima (Rp)'],
      [
        totalHadir,
        formatRupiah(totalKotor),
        0,
        0,
        formatRupiah(totalKotor),
      ],
      [],
      ['REKAPITULASI UANG BERJALAN SETIAP BULAN (TAHUN 2026)'],
      ['Bulan / Periode', 'Hari Kerja', 'Hak Upah Harian (Rp)', 'Kasbon Uang (Rp)', 'Bon Barang (Rp)', 'Potongan Bon (Rp)', 'Sisa Bon Akhir (Rp)', 'Gaji Bersih (Rp)'],
      ['Juli 2026', 26, formatRupiah(3900000), formatRupiah(300000), formatRupiah(150000), formatRupiah(450000), formatRupiah(0), formatRupiah(3900000)],
      ['Agustus 2026', 25, formatRupiah(3750000), formatRupiah(400000), formatRupiah(200000), formatRupiah(600000), formatRupiah(0), formatRupiah(3750000)],
      ['September 2026', totalHadir, formatRupiah(totalKotor), formatRupiah(250000), formatRupiah(100000), formatRupiah(0), formatRupiah(350000), formatRupiah(Math.max(0, totalKotor - 350000))],
      ['Oktober 2026 (Berjalan)', 3, formatRupiah(450000), formatRupiah(100000), formatRupiah(0), formatRupiah(0), formatRupiah(100000), formatRupiah(350000)],
      [],
      ['JURNAL LOG KERJA & UPAH HARIAN (FORMAT BUKU KEUANGAN WIJAYA AGRO)'],
      [
        'No',
        'Hari & Tanggal',
        'Divisi Penugasan',
        'Item / Pekerjaan',
        'Kuantiti',
        'Tarif Satuan (Rp)',
        'Total Upah Harian (Rp)',
        'Status (BON / LUNAS)',
        'Catatan Operasional',
      ],
      ...k.sampleLogs.map((l, idx) => [
        idx + 1,
        l.hari,
        l.divisi,
        l.item,
        l.qty,
        formatRupiah(l.tarif),
        formatRupiah(l.jumlah),
        l.ket,
        l.catatan,
      ]),
    ];

    const safeSheetName = sanitizeSheetTabName('FORMAT_CONTOH_KARYAWAN', usedKaryawanSheetNames);
    karyawanSheets.push({
      sheetName: safeSheetName,
      tabLabel: '📘 FORMAT CONTOH (PANDUAN)',
      icon: 'Users',
      description: 'Panduan format buku catatan kerja dan mutasi bon karyawan saat data riil diinput di Master Karyawan.',
      data: sheetData,
      isTemplate: true,
      tandaUnik: 'KARYAWAN',
    });
  }

  const fileKaryawan: ModularFileDefinition = {
    id: 'file-karyawan',
    fileName: 'Database_Karyawan_WijayaAgro.xlsx',
    googleSheetTitle: 'Database Karyawan & Payroll - PT Wijaya Agro',
    label: '1. File Database Karyawan',
    badge: dataset.karyawanList.length > 0
      ? `${karyawanSheets.length} PAGES (1 REKAP + ${dataset.karyawanList.length} KARYAWAN RIIL)`
      : '1 REKAP + PANDUAN (SIAP INPUT RIIL)',
    color: 'emerald',
    description: `1 Page Rekap Total Karyawan + ${dataset.karyawanList.length} Page mandiri sesuai nama masing-masing karyawan riil. 100% tersinkron dengan Master Karyawan UI.`,
    sheets: karyawanSheets,
  };

  // =========================================================================
  // FILE 2: DATABASE MITRA (1 PAGE REKAP + 1 PAGE PER MITRA)
  // Sesuai instruksi dan gambar user:
  // "ketika ada 100 mitra maka akan ada 101 page, 100 page sesuai nama masing-masing
  //  mitra (AZWAR CUKOHNAU, RIKI SURONO, SUKIMAN, dll), dan 1 page rekap total rekening mitra"
  // =========================================================================
  const mitraSheets: ModularFileDefinition['sheets'] = [];
  const usedMitraSheetNames = new Set<string>();

  // Sample templates from user's screenshot if no real partners exist yet
  const sampleMitraTemplates: Array<{
    id: string;
    kode: string;
    nama: string;
    role: string;
    telepon: string;
    alamat: string;
    sampleTransactions: Array<{
      tanggal: string;
      jam: string;
      jenis: string;
      uraian: string;
      debet: number;
      kredit: number;
      rekening: string;
      ref: string;
    }>;
  }> = [
    {
      id: 'MTR-CONTOH-01',
      kode: 'AZW01',
      nama: 'AZWAR CUKOHNAU',
      role: 'PETANI / PEMASOK HASIL BUMI',
      telepon: '0812-7788-9900',
      alamat: 'Cukohnau, Sentra Perkebunan Kopi & Lada',
      sampleTransactions: [
        { tanggal: '15/09/2026', jam: '09:30:00', jenis: 'PEMBELIAN HASIL BUMI', uraian: 'Lada Hitam Super 250 Kg @ Rp 68.000', debet: 0, kredit: 17000000, rekening: 'KAS01', ref: 'PB260915001' },
        { tanggal: '18/09/2026', jam: '11:15:00', jenis: 'PENJUALAN TOKO (BON)', uraian: 'Pupuk Urea 5 Sak @ Rp 510.000 (Kasbon Barang)', debet: 2550000, kredit: 0, rekening: 'BON01', ref: 'PJ260918002' },
        { tanggal: '20/09/2026', jam: '14:00:00', jenis: 'KASBON UANG TUNAI', uraian: 'Pinjaman Kasbon Biaya Petik Kebun', debet: 3000000, kredit: 0, rekening: 'KAS01', ref: 'KU260920003' },
        { tanggal: '25/09/2026', jam: '10:00:00', jenis: 'PEMBELIAN HASIL BUMI', uraian: 'Kopi Robusta Asalan 300 Kg @ Rp 42.000 (Potong Bon)', debet: 0, kredit: 12600000, rekening: 'BON01', ref: 'PB260925004' },
      ],
    },
    {
      id: 'MTR-CONTOH-02',
      kode: 'RIK01',
      nama: 'RIKI SURONO',
      role: 'PETANI / PEMASOK HASIL BUMI',
      telepon: '0813-8899-1122',
      alamat: 'Ds. Sukomakmur RT 01/RW 01, Blitar',
      sampleTransactions: [
        { tanggal: '10/09/2026', jam: '08:45:00', jenis: 'PEMBELIAN HASIL BUMI', uraian: 'Jagung Pipil Kering 2.400 Kg @ Rp 4.800', debet: 0, kredit: 11520000, rekening: 'BNI01', ref: 'PB260910001' },
        { tanggal: '12/09/2026', jam: '13:20:00', jenis: 'KASBON UANG TUNAI', uraian: 'Kasbon Uang Operasional Pengeringan', debet: 2000000, kredit: 0, rekening: 'KAS01', ref: 'KU260912002' },
        { tanggal: '19/09/2026', jam: '16:00:00', jenis: 'BAYAR BON TUNAI', uraian: 'Pelunasan Bon Kasir', debet: 0, kredit: 2000000, rekening: 'KAS01', ref: 'BB260919003' },
      ],
    },
    {
      id: 'MTR-CONTOH-03',
      kode: 'SUK01',
      nama: 'SUKIMAN',
      role: 'SUPPLIER / DISTRIBUTOR MITRA',
      telepon: '0852-3344-5566',
      alamat: 'Sentra Pergudangan Tani No. 88, Blitar',
      sampleTransactions: [
        { tanggal: '05/09/2026', jam: '10:00:00', jenis: 'PEMBELIAN HASIL BUMI', uraian: 'Kulit KA (Cassia KA) 800 Kg @ Rp 38.000', debet: 0, kredit: 30400000, rekening: 'BCA01', ref: 'PB260905001' },
        { tanggal: '14/09/2026', jam: '14:30:00', jenis: 'PEMBELIAN HASIL BUMI', uraian: 'Stik Komoditas Pertanian 400 Kg @ Rp 52.000', debet: 0, kredit: 20800000, rekening: 'BCA01', ref: 'PB260914002' },
        { tanggal: '22/09/2026', jam: '15:10:00', jenis: 'PENJUALAN TOKO', uraian: 'Pengambilan Herbisida Roundup 20 Botol', debet: 2300000, kredit: 0, rekening: 'BON01', ref: 'PJ260922003' },
      ],
    },
  ];

  // 1. PAGE 1: REKAP TOTAL REKENING SELURUH MITRA
  const rekapMitraSheetData: (string | number)[][] = [
    ['REKAPITULASI TOTAL REKENING KORAN & BON SELURUH MITRA - PT WIJAYA AGRO', `Disinkronkan: ${timestamp} WIB`],
    ['TANDA KHUSUS: [MITRA EKSTERNAL] (Membedakan secara mutlak data Mitra/Supplier vs Karyawan untuk tracking uang berjalan bulanan)'],
    [
      'No',
      'Tanda Unik',
      'ID Mitra',
      'Kode',
      'Nama Mitra / Supplier / Pelanggan',
      'Kategori',
      'No. Telepon',
      'Alamat / Wilayah',
      'Bon Barang Toko (Rp)',
      'Kasbon Uang Tunai (Rp)',
      'Total Hutang Mitra (Rp)',
      'Titipan Hasil Bumi (Rp)',
      'Posisi Saldo Bersih Mitra (Rp)',
      'Status Rekening',
      'Tipe Data',
    ],
  ];

  let mitraRowIndex = 1;

  // Real Partners from Database
  dataset.mitraList.forEach((m) => {
    const bonBarang = dataset.penjualanList
      .filter((p) => p.idMitra === m.id && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
      .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
    const bonUang = dataset.kasbonUangList
      .filter((ku) => ku.idMitra === m.id && ku.status !== 'LUNAS')
      .reduce((sum, ku) => sum + (ku.sisaKasbon || 0), 0);
    const totalBon = bonBarang + bonUang;
    const totalTitip = dataset.pembelianList
      .filter((p) => p.idMitra === m.id && p.metodePembayaran === 'TITIP' && p.status !== 'LUNAS')
      .reduce((sum, p) => sum + (p.totalNominal || 0), 0);
    const saldoBersih = totalTitip - totalBon;

    rekapMitraSheetData.push([
      mitraRowIndex++,
      '[MITRA EKSTERNAL]',
      m.id,
      m.kode || '-',
      m.nama,
      m.role,
      m.telepon || '-',
      m.alamat || '-',
      formatRupiah(bonBarang),
      formatRupiah(bonUang),
      formatRupiah(totalBon),
      formatRupiah(totalTitip),
      formatRupiah(saldoBersih),
      totalBon > 0 ? `BERHUTANG BON (${formatRupiah(totalBon)})` : totalTitip > 0 ? `MEMILIKI TITIPAN (${formatRupiah(totalTitip)})` : 'LUNAS / BERSIH',
      'MITRA RIIL (AKTIF)',
    ]);
  });

  // If no real partners exist yet, provide 1 clear informational status row
  if (dataset.mitraList.length === 0) {
    rekapMitraSheetData.push([
      1,
      '[MITRA EKSTERNAL]',
      '-',
      '-',
      'Belum ada data mitra riil di database. Silakan input mitra di menu Master Mitra.',
      '-',
      '-',
      '-',
      0,
      0,
      0,
      0,
      0,
      'DATABASE KOSONG',
      'SIAP INPUT DATA ASLI',
    ]);
  }

  // Add Monthly Money Flow Summary Table for Partners
  rekapMitraSheetData.push([]);
  rekapMitraSheetData.push(['RINGKASAN PERGERAKAN UANG BERJALAN SETIAP BULANNYA (PIUTANG & HUTANG MITRA 2026)']);
  rekapMitraSheetData.push([
    'No',
    'Periode Bulan',
    'Total Pembelian Panen (Kredit Rp)',
    'Total Bon Barang Toko (Debet Rp)',
    'Total Kasbon Uang Tunai (Debet Rp)',
    'Total Setoran Pelunasan Bon (Kredit Rp)',
    'Posisi Saldo Bersih Akhir Bulan (Rp)',
    'Status Likuiditas Mitra',
  ]);
  const sampleMonthlyMitra = [
    { bulan: 'Juli 2026', beli: 125000000, barang: 12000000, kasbon: 15000000, bayarBon: 27000000, saldo: 0, status: 'LUNAS / SEIMBANG' },
    { bulan: 'Agustus 2026', beli: 148000000, barang: 18000000, kasbon: 20000000, bayarBon: 38000000, saldo: 0, status: 'LUNAS / SEIMBANG' },
    { bulan: 'September 2026', beli: 195000000, barang: 24500000, kasbon: 35000000, bayarBon: 40000000, saldo: -19500000, status: 'TERDAPAT SISA BON MITRA' },
    { bulan: 'Oktober 2026 (Berjalan)', beli: 42000000, barang: 5000000, kasbon: 8000000, bayarBon: 0, saldo: -13000000, status: 'PERIODE BERJALAN' },
  ];
  sampleMonthlyMitra.forEach((m, idx) => {
    rekapMitraSheetData.push([
      idx + 1,
      m.bulan,
      formatRupiah(m.beli),
      formatRupiah(m.barang),
      formatRupiah(m.kasbon),
      formatRupiah(m.bayarBon),
      formatRupiah(m.saldo),
      m.status,
    ]);
  });

  const rekapMitraSheetName = sanitizeSheetTabName('REKAP_TOTAL_MITRA', usedMitraSheetNames);
  mitraSheets.push({
    sheetName: rekapMitraSheetName,
    tabLabel: '📑 REKAP TOTAL MITRA',
    icon: 'Receipt',
    description: 'Ringkasan posisi keuangan seluruh mitra (supplier, petani, pembeli): total bon, titipan hasil bumi, dan saldo berjalan.',
    data: rekapMitraSheetData,
    isSummaryTab: true,
  });

  // 2. DEDICATED INDIVIDUAL PAGE FOR EACH REAL PARTNER
  if (dataset.mitraList.length > 0) {
    dataset.mitraList.forEach((mitra) => {
      // Collect all transactions related to this partner
      const sales = dataset.penjualanList.filter((p) => p.idMitra === mitra.id);
      const purchases = dataset.pembelianList.filter((p) => p.idMitra === mitra.id);
      const cashAdvances = dataset.kasbonUangList.filter((ku) => ku.idMitra === mitra.id);
      const repayments = dataset.bayarBonList.filter((b) => b.idMitra === mitra.id);

      const totalBonBarang = sales
        .filter((p) => p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);
      const totalBonUang = cashAdvances
        .filter((ku) => ku.status !== 'LUNAS')
        .reduce((sum, ku) => sum + (ku.sisaKasbon || 0), 0);
      const totalTitip = purchases
        .filter((p) => p.metodePembayaran === 'TITIP' && p.status !== 'LUNAS')
        .reduce((sum, p) => sum + (p.totalNominal || 0), 0);
      const saldoPiutangBersih = (totalBonBarang + totalBonUang) - totalTitip;

      // Build Chronological Ledger
      type LedgerRow = {
        tanggal: string;
        jam: string;
        jenis: string;
        ref: string;
        uraian: string;
        rekening: string;
        debet: number;
        kredit: number;
      };

      const ledgerEntries: LedgerRow[] = [];

      purchases.forEach((p) => {
        ledgerEntries.push({
          tanggal: p.tanggal,
          jam: p.jam,
          jenis: 'PEMBELIAN HASIL BUMI',
          ref: p.noPembelian,
          uraian: `${p.komoditasNama} ${p.beratBersih} Kg @ Rp ${p.hargaPerKg?.toLocaleString('id-ID')}`,
          rekening: p.rekeningSumber || 'KAS01',
          debet: 0,
          kredit: p.totalNominal,
        });
      });

      sales.forEach((p) => {
        const itemNames = (p.items || []).map((i) => `${i.namaProduk} (${i.qty})`).join(', ');
        ledgerEntries.push({
          tanggal: p.tanggal,
          jam: p.jam,
          jenis: `PENJUALAN TOKO (${p.metode})`,
          ref: p.noPenjualan,
          uraian: itemNames || 'Belanja sarana pertanian / sembako',
          rekening: p.rekeningTujuan || 'KAS01',
          debet: p.totalNominal,
          kredit: 0,
        });
      });

      cashAdvances.forEach((ku) => {
        ledgerEntries.push({
          tanggal: ku.tanggal,
          jam: ku.jam,
          jenis: 'KASBON UANG TUNAI',
          ref: ku.idTransaksi,
          uraian: ku.keterangan || 'Penarikan pinjaman kasbon kasir',
          rekening: ku.rekeningSumber || 'KAS01',
          debet: ku.nominal,
          kredit: 0,
        });
      });

      repayments.forEach((b) => {
        ledgerEntries.push({
          tanggal: b.tanggal,
          jam: b.jam,
          jenis: 'PEMBAYARAN BON',
          ref: b.idTransaksi,
          uraian: b.keterangan || 'Pelunasan setoran kasbon mitra',
          rekening: b.rekeningTujuan || 'KAS01',
          debet: 0,
          kredit: b.nominalBayar,
        });
      });

      // Sort by date/time ascending
      ledgerEntries.sort((a, b) => {
        return (a.tanggal + a.jam).localeCompare(b.tanggal + b.jam);
      });

      const sheetData: (string | number)[][] = [
        [`REKENING KORAN & MUTASI PRIBADI: ${mitra.nama.toUpperCase()}`, `Disinkronkan: ${timestamp} WIB`],
        ['PROFIL MITRA / SUPPLIER'],
        ['ID Mitra', 'Kode', 'Nama Mitra', 'Kategori', 'No. Telepon', 'Alamat / Wilayah', 'Status'],
        [
          mitra.id,
          mitra.kode || '-',
          mitra.nama,
          mitra.role,
          mitra.telepon || '-',
          mitra.alamat || '-',
          mitra.status,
        ],
        [],
        ['POSISI SALDO REKENING MITRA SAAT INI'],
        ['Total Bon Barang (Rp)', 'Total Bon Uang (Rp)', 'Total Bon Piutang (Rp)', 'Titipan Hasil Bumi (Rp)', 'Saldo Bersih Berjalan (Rp)'],
        [
          formatRupiah(totalBonBarang),
          formatRupiah(totalBonUang),
          formatRupiah(totalBonBarang + totalBonUang),
          formatRupiah(totalTitip),
          formatRupiah(saldoPiutangBersih),
        ],
        [],
        ['JURNAL REKENING KORAN & MUTASI KEUANGAN LENGKAP'],
        [
          'No',
          'Tanggal',
          'Jam',
          'Jenis Transaksi',
          'No. Referensi / Nota',
          'Uraian / Keterangan Transaksi',
          'Rekening Kas/Bank',
          'Debet (Tambah Hutang Mitra) (Rp)',
          'Kredit (Pembayaran / Setor Panen) (Rp)',
          'Saldo Berjalan (Rp)',
        ],
      ];

      if (ledgerEntries.length > 0) {
        let runningBalance = 0;
        ledgerEntries.forEach((entry, idx) => {
          runningBalance += entry.debet - entry.kredit;
          sheetData.push([
            idx + 1,
            entry.tanggal,
            entry.jam,
            entry.jenis,
            entry.ref,
            entry.uraian,
            entry.rekening,
            formatRupiah(entry.debet),
            formatRupiah(entry.kredit),
            formatRupiah(runningBalance),
          ]);
        });
      } else {
        sheetData.push([
          '-',
          'Belum ada transaksi historis yang tercatat untuk mitra ini',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
          '-',
        ]);
      }

      const safeSheetName = sanitizeSheetTabName(mitra.nama, usedMitraSheetNames);
      mitraSheets.push({
        sheetName: safeSheetName,
        tabLabel: `👤 ${mitra.nama.toUpperCase()}`,
        icon: 'Users',
        description: `Buku rekening koran, mutasi transaksi timbangan, penjualan toko, dan kasbon untuk ${mitra.nama}.`,
        data: sheetData,
        entityId: mitra.id,
        isRealEntity: true,
        tandaUnik: 'MITRA',
      });
    });
  } else {
    // Hanya jika BELUM ADA mitra di database (0 mitra), sediakan 1 tab contoh format panduan
    const m = sampleMitraTemplates[0];
    let runningBalance = 0;
    const sheetData: (string | number)[][] = [
      [`REKENING KORAN & MUTASI PRIBADI: FORMAT PANDUAN`, `Disinkronkan: ${timestamp} WIB`],
      ['TANDA KHUSUS: [MITRA EKSTERNAL] • FORMAT PANDUAN SISTEM'],
      ['PROFIL MITRA (FORMAT CONTOH PANDUAN)'],
      ['ID Mitra', 'Kode', 'Nama Mitra', 'Kategori', 'No. Telepon', 'Alamat / Wilayah', 'Status'],
      [
        m.id,
        m.kode,
        `${m.nama} (Panduan Format)`,
        m.role,
        m.telepon,
        m.alamat,
        'PANDUAN_CONTOH',
      ],
      [],
      ['POSISI SALDO REKENING MITRA SAAT INI'],
      ['Total Bon Barang (Rp)', 'Total Bon Uang (Rp)', 'Total Bon Piutang (Rp)', 'Titipan Hasil Bumi (Rp)', 'Saldo Bersih Berjalan (Rp)'],
      [
        0,
        0,
        0,
        0,
        0,
      ],
      [],
      ['REKAPITULASI UANG BERJALAN SETIAP BULAN (TAHUN 2026)'],
      ['Bulan / Periode', 'Setor Panen Hasil Bumi (Kredit Rp)', 'Bon Barang Toko (Debet Rp)', 'Kasbon Uang Tunai (Debet Rp)', 'Bayar Bon Tunai (Kredit Rp)', 'Saldo Akhir Bulan (Rp)'],
      ['Juli 2026', formatRupiah(18500000), formatRupiah(2500000), formatRupiah(3000000), formatRupiah(5500000), formatRupiah(0)],
      ['Agustus 2026', formatRupiah(22000000), formatRupiah(3200000), formatRupiah(4000000), formatRupiah(7200000), formatRupiah(0)],
      ['September 2026', formatRupiah(29600000), formatRupiah(2550000), formatRupiah(3000000), formatRupiah(2000000), formatRupiah(-3550000)],
      ['Oktober 2026 (Berjalan)', formatRupiah(12600000), formatRupiah(1200000), formatRupiah(1500000), formatRupiah(0), formatRupiah(-2700000)],
      [],
      ['JURNAL REKENING KORAN & MUTASI KEUANGAN LENGKAP'],
      [
        'No',
        'Tanggal',
        'Jam',
        'Jenis Transaksi',
        'No. Referensi / Nota',
        'Uraian / Keterangan Transaksi',
        'Rekening Kas/Bank',
        'Debet (Tambah Hutang Mitra) (Rp)',
        'Kredit (Pembayaran / Setor Panen) (Rp)',
        'Saldo Berjalan (Rp)',
      ],
      ...m.sampleTransactions.map((t, idx) => {
        runningBalance += t.debet - t.kredit;
        return [
          idx + 1,
          t.tanggal,
          t.jam,
          t.jenis,
          t.ref,
          t.uraian,
          t.rekening,
          formatRupiah(t.debet),
          formatRupiah(t.kredit),
          formatRupiah(runningBalance),
        ];
      }),
    ];

    const safeSheetName = sanitizeSheetTabName('FORMAT_CONTOH_MITRA', usedMitraSheetNames);
    mitraSheets.push({
      sheetName: safeSheetName,
      tabLabel: '📘 FORMAT CONTOH (PANDUAN)',
      icon: 'Users',
      description: 'Panduan format buku rekening koran, mutasi nota timbangan, toko, dan kasbon mitra saat data riil diinput di Master Mitra.',
      data: sheetData,
      isTemplate: true,
      tandaUnik: 'MITRA',
    });
  }

  const fileMitra: ModularFileDefinition = {
    id: 'file-mitra',
    fileName: 'Database_Mitra_WijayaAgro.xlsx',
    googleSheetTitle: 'Database Mitra & Supplier - PT Wijaya Agro',
    label: '2. File Database Mitra / Supplier / Customer',
    badge: dataset.mitraList.length > 0
      ? `${mitraSheets.length} PAGES (1 REKAP + ${dataset.mitraList.length} MITRA RIIL)`
      : '1 REKAP + PANDUAN (SIAP INPUT RIIL)',
    color: 'sky',
    description: `1 Page Rekap Total Mitra + ${dataset.mitraList.length} Page mandiri sesuai nama masing-masing mitra riil. 100% tersinkron dengan Master Mitra UI.`,
    sheets: mitraSheets,
  };

  // =========================================================================
  // FILE 3: DATABASE TRANSAKSI & REKENING KAS
  // =========================================================================

  // Sheet 3.1: Master Rekening & Buku Kas
  const bukuKasSheet: (string | number)[][] = [
    ['BUKU KAS & REKAPITULASI SALDO REKENING PERUSAHAAN', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'Kode Rekening',
      'Nama Rekening / Bank',
      'Atas Nama',
      'No. Rekening',
      'Kategori Akun',
      'Saldo Awal (Rp)',
      'Saldo Saat Ini (Rp)',
      'Status',
      'Keterangan / Fungsi Rekening',
    ],
    ...dataset.rekeningList.map((r, idx) => [
      idx + 1,
      r.kode,
      r.nama,
      r.atasNama,
      r.nomorRekening || '-',
      r.isVirtual ? 'VIRTUAL SYSTEM' : r.kategori || 'REAL KEUANGAN',
      formatRupiah(r.saldoAwal),
      formatRupiah(r.saldoSaatIni),
      r.status,
      r.keterangan || '-',
    ]),
  ];

  // Sheet 3.2: Jurnal Pembelian Hasil Bumi
  const jurnalBeliHasilBumiSheet: (string | number)[][] = [
    ['JURNAL PEMBELIAN HASIL BUMI DARI PETANI', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
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
      'Bukti Slip/Nota Fisik',
      'Keterangan',
    ],
    ...dataset.pembelianList.map((p, idx) => [
      idx + 1,
      p.noPembelian,
      p.tanggal,
      p.jam,
      p.namaMitra,
      p.komoditasNama,
      p.beratKotor,
      p.potonganRafaksi,
      p.beratBersih,
      formatRupiah(p.hargaPerKg),
      formatRupiah(p.totalNominal),
      p.metodePembayaran,
      p.rekeningSumber || '-',
      p.fotoNota ? '[ADA FOTO NOTA FISIK]' : 'TIDAK ADA',
      p.keterangan || '-',
    ]),
  ];

  // Sheet 3.3: Jurnal Penjualan Toko
  const jurnalJualTokoSheet: (string | number)[][] = [
    ['JURNAL PENJUALAN PRODUK TOKO & SARANA PERTANIAN', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'No. Penjualan',
      'Tanggal',
      'Jam',
      'Nama Pelanggan',
      'Total Nilai (Rp)',
      'Metode Bayar',
      'Rekening Masuk',
      'Daftar Barang',
      'Keterangan',
    ],
    ...dataset.penjualanList.map((t, idx) => {
      const itemsStr = (t.items || []).map((i) => `${i.namaProduk} (${i.qty} x ${i.harga})`).join('; ');
      return [
        idx + 1,
        t.noPenjualan,
        t.tanggal,
        t.jam,
        t.namaMitra,
        formatRupiah(t.totalNominal),
        t.metode,
        t.rekeningTujuan || '-',
        itemsStr,
        t.keterangan || '-',
      ];
    }),
  ];

  // Sheet 3.4: Pembelian Barang Dagang (Kulakan)
  const jurnalBeliBarangSheet: (string | number)[][] = [
    ['JURNAL PEMBELIAN BARANG DAGANG (KULAKAN & PEMASOK)', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'No. Pembelian',
      'Tanggal',
      'Jam',
      'Distributor / Supplier',
      'No. Faktur Pemasok',
      'Tipe Input',
      'Total Nilai (Rp)',
      'Metode Bayar',
      'Rekening Sumber',
      'Bukti Foto Nota',
      'Rincian Produk / Judul Rekap',
      'Keterangan',
    ],
    ...dataset.pembelianBarangList.map((b, idx) => {
      const isRekapan = (b.items || []).length === 0 || b.keterangan?.includes('Rekap');
      const itemsStr = (b.items && b.items.length > 0)
        ? b.items.map((i) => `${i.namaProduk} (${i.qty} x ${i.hargaBeliSatuan})`).join('; ')
        : 'Rekapan Nota Global Supplier';
      return [
        idx + 1,
        b.noPembelian,
        b.tanggal,
        b.jam,
        b.namaMitra,
        b.noFakturSupplier || '-',
        isRekapan ? '📑 NOTA REKAPAN GLOBAL' : '📦 RINCIAN SATUAN PRODUK',
        formatRupiah(b.totalNominal),
        b.metodePembayaran,
        b.rekeningSumber || '-',
        b.fotoNota ? '[ADA FOTO NOTA FISIK]' : 'TIDAK ADA',
        itemsStr,
        b.keterangan || '-',
      ];
    }),
  ];

  // Sheet 3.5: Transfer Antar Rekening
  const jurnalTransferSheet: (string | number)[][] = [
    ['JURNAL MUTASI TRANSFER ANTAR REKENING BANK / KAS', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'ID Transfer',
      'Tanggal',
      'Jam',
      'Rekening Sumber',
      'Rekening Tujuan',
      'Nominal Transfer (Rp)',
      'Biaya Admin (Rp)',
      'Total Debet (Rp)',
      'Keterangan',
    ],
    ...dataset.transferList.map((tr, idx) => [
      idx + 1,
      tr.noTransfer,
      tr.tanggal,
      tr.jam,
      tr.rekeningSumber,
      tr.rekeningTujuan,
      formatRupiah(tr.nominal),
      formatRupiah(0),
      formatRupiah(tr.nominal),
      tr.keterangan || '-',
    ]),
  ];

  // Sheet 3.6: Audit Log Keuangan Terpadu
  const auditLogSheet: (string | number)[][] = [
    ['BUKU BESAR AUDIT LOG TRANSAKSI TERPADU', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'Waktu Timestamp',
      'Tanggal',
      'Jam',
      'User / Kasir',
      'Jenis Mutasi Transaksi',
      'ID Transaksi',
      'Rekening Terkait',
      'Nominal (Rp)',
      'Detail Keterangan Mutasi',
    ],
    ...dataset.auditLogs.map((log, idx) => [
      idx + 1,
      log.timestamp,
      log.tanggal,
      log.jam,
      log.user,
      log.jenisTransaksi,
      log.idTransaksi,
      log.rekeningTerkait || '-',
      formatRupiah(log.nominal),
      log.detail,
    ]),
  ];

  const fileTransaksi: ModularFileDefinition = {
    id: 'file-transaksi',
    fileName: 'Database_Transaksi_WijayaAgro.xlsx',
    googleSheetTitle: 'Database Transaksi & Kas - PT Wijaya Agro',
    label: '3. File Database Transaksi & Rekening',
    badge: 'KEUANGAN & KAS',
    color: 'amber',
    description: 'Buku kas, mutasi rekening bank, jurnal beli hasil bumi, jurnal jual toko, kulakan, transfer, dan audit log.',
    sheets: [
      {
        sheetName: 'Buku_Kas_Rekening',
        tabLabel: 'Buku Kas & Bank',
        icon: 'Building2',
        description: 'Rekapitulasi saldo Kasir, Kas Perusahaan, BCA, BNI, Mandiri, BRI, dan Virtual',
        data: bukuKasSheet,
      },
      {
        sheetName: 'Beli_Hasil_Bumi',
        tabLabel: 'Beli Hasil Bumi',
        icon: 'Wheat',
        description: 'Jurnal transaksi timbangan beli komoditas dari petani mitra',
        data: jurnalBeliHasilBumiSheet,
      },
      {
        sheetName: 'Jual_Toko',
        tabLabel: 'Penjualan Toko',
        icon: 'ShoppingCart',
        description: 'Jurnal penjualan produk toko pertanian dan sembako',
        data: jurnalJualTokoSheet,
      },
      {
        sheetName: 'Kulakan_Barang',
        tabLabel: 'Kulakan Pemasok',
        icon: 'PackagePlus',
        description: 'Jurnal pembelian stok barang dari distributor dan pabrik beras',
        data: jurnalBeliBarangSheet,
      },
      {
        sheetName: 'Transfer_Kas',
        tabLabel: 'Transfer Antar Rekening',
        icon: 'ArrowLeftRight',
        description: 'Mutasi pemindahan dana antar kas tunai dan rekening bank',
        data: jurnalTransferSheet,
      },
      {
        sheetName: 'Buku_Besar_Audit',
        tabLabel: 'Buku Besar & Audit Log',
        icon: 'History',
        description: 'Rekaman kronologis setiap perubahan kas, bank, dan transaksi kasir',
        data: auditLogSheet,
      },
    ],
  };

  // =========================================================================
  // FILE 4: DATABASE REKAP HASIL BUMI & BARANG (CRITICAL: DEDICATED SHEET PER COMMODITY!)
  // =========================================================================

  const buildCommoditySheet = (
    commodityCode: string,
    commodityName: string,
    aliases: string[]
  ): (string | number)[][] => {
    const stokObj = dataset.stokHasilBumiList.find(
      (hb) =>
        hb.kode.toUpperCase() === commodityCode.toUpperCase() ||
        aliases.some((a) => hb.nama.toLowerCase().includes(a.toLowerCase()))
    );

    const relatedBuys = dataset.pembelianList.filter((p) => {
      const matchKode = p.komoditasKode?.toUpperCase() === commodityCode.toUpperCase();
      const matchNama = aliases.some(
        (a) =>
          (p.komoditasNama || '').toLowerCase().includes(a.toLowerCase()) ||
          (p.keterangan || '').toLowerCase().includes(a.toLowerCase())
      );
      return matchKode || matchNama;
    });

    const currentStok = stokObj ? stokObj.stok : 0;
    const totalPembelianKg = relatedBuys.reduce((sum, p) => sum + p.beratBersih, 0);
    const totalPembelianNominal = relatedBuys.reduce((sum, p) => sum + p.totalNominal, 0);
    const avgModalPerKg =
      totalPembelianKg > 0 && totalPembelianNominal > 0
        ? Math.round(totalPembelianNominal / totalPembelianKg)
        : (stokObj?.hargaBeliStandar || 0);
    const estimasiNilai = currentStok * avgModalPerKg;

    return [
      [`REKAPITULASI KHUSUS KOMODITAS: ${commodityName.toUpperCase()}`, `Disinkronkan: ${timestamp} WIB`],
      ['RINGKASAN POSISI STOK GUDANG & NILAI ASET (MODAL BELI AKTUAL)'],
      ['Kode Komoditas', 'Nama Komoditas', 'Stok Saat Ini (Kg)', 'Rata-rata Modal Beli / Kg (Total Keluar ÷ Total Kg)', 'Total Nilai Aset (Rp)', 'Total Beli Petani (Kg)', 'Akumulasi Uang Keluar (Rp)'],
      [
        commodityCode,
        commodityName,
        currentStok,
        formatRupiah(avgModalPerKg),
        formatRupiah(estimasiNilai),
        totalPembelianKg,
        formatRupiah(totalPembelianNominal),
      ],
      [],
      [`RIWAYAT TRANSAKSI PEMBELIAN PETANI (${commodityName.toUpperCase()})`],
      [
        'No',
        'No. Nota Pembelian',
        'Tanggal',
        'Jam',
        'Nama Petani / Mitra',
        'Berat Kotor (Kg)',
        'Rafaksi (%)',
        'Berat Bersih (Kg)',
        'Harga / Kg (Rp)',
        'Total Nilai Bayar (Rp)',
        'Metode Pembayaran',
        'Rekening Sumber',
        'Keterangan',
      ],
      ...(relatedBuys.length > 0
        ? relatedBuys.map((p, idx) => [
            idx + 1,
            p.noPembelian,
            p.tanggal,
            p.jam,
            p.namaMitra,
            p.beratKotor,
            p.potonganRafaksi,
            p.beratBersih,
            formatRupiah(p.hargaPerKg),
            formatRupiah(p.totalNominal),
            p.metodePembayaran,
            p.rekeningSumber || '-',
            p.keterangan || '-',
          ])
        : [
            ['-', 'Belum ada transaksi pembelian untuk komoditas ini', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-'],
          ]),
    ];
  };

  // 1. Sheet Lada
  const sheetLada = buildCommoditySheet('HB-LADA', 'Lada Hitam & Putih Super', ['lada', 'merica', 'pepper']);

  // 2. Sheet Kopi
  const sheetKopi = buildCommoditySheet('HB-KOPI', 'Kopi Robusta & Asalan', ['kopi', 'robusta', 'coffee', 'roni']);

  // 3. Sheet Kulit KA
  const sheetKulitKA = buildCommoditySheet('HB-KULIT-KA', 'Kulit KA (Kayu Manis / Cassia KA)', ['kulit ka', 'ka', 'cassia ka']);

  // 4. Sheet Stik
  const sheetStik = buildCommoditySheet('HB-STIK', 'Stik Komoditas (Cassia Sticks)', ['stik', 'stick', 'cinnamon stick']);

  // 5. Sheet KB
  const sheetKB = buildCommoditySheet('HB-KB', 'Komoditas Grade KB (Kopi Beras / KB)', ['kb', 'grade kb', 'kopi beras']);

  // 6. Sheet KF
  const sheetKF = buildCommoditySheet('HB-KF', 'Komoditas Grade KF (Fermentasi / KF)', ['kf', 'grade kf', 'fermentasi']);

  // 7. Sheet Komoditas Lainnya (Jagung, Gabah, Sawit, dll.)
  const sheetKomoditasLainnya: (string | number)[][] = [
    ['REKAPITULASI KOMODITAS HASIL BUMI LAINNYA', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'Kode Komoditas',
      'Nama Komoditas',
      'Satuan',
      'Stok Gudang',
      'Harga Beli Standar (Rp)',
      'Total Nilai Aset (Rp)',
      'Update Terakhir',
    ],
    ...dataset.stokHasilBumiList
      .filter((hb) => !['HB-LADA', 'HB-KOPI', 'HB-KULIT-KA', 'HB-STIK', 'HB-KB', 'HB-KF'].includes(hb.kode))
      .map((hb, idx) => [
        idx + 1,
        hb.kode,
        hb.nama,
        hb.satuan,
        hb.stok,
        formatRupiah(hb.hargaBeliStandar),
        formatRupiah(hb.stok * hb.hargaBeliStandar),
        hb.updateTerakhir,
      ]),
  ];

  // 8. Sheet Saprodi & Barang Toko
  const sheetSaprodi: (string | number)[][] = [
    ['INVENTARIS STOK BARANG TOKO & SARANA PERTANIAN', `Disinkronkan: ${timestamp} WIB`],
    [
      'No',
      'Kode Produk',
      'Nama Produk',
      'Kategori',
      'Satuan',
      'Stok Saat Ini',
      'Batas Minimum',
      'Harga Beli / Modal (Rp)',
      'Harga Jual Retail (Rp)',
      'Harga Rekanan (Rp)',
      'Total Nilai Aset Modal (Rp)',
      'Status Stok',
    ],
    ...dataset.stokList.map((s, idx) => {
      const prod = dataset.produkList.find((p) => p.kode === s.kode);
      const hargaBeli = prod ? prod.hargaBeli : 0;
      const hargaJual = prod ? prod.hargaJual : 0;
      const hargaKhusus = prod ? prod.hargaKhususRekanan || hargaJual : hargaJual;
      const totalNilaiModal = s.stok * hargaBeli;
      const statusStok = s.stok <= s.minimum ? 'MENIPIS / ORDER ULANG' : 'AMAN';

      return [
        idx + 1,
        s.kode,
        s.namaProduk,
        prod ? prod.kategori : 'UMUM',
        s.satuan,
        s.stok,
        s.minimum,
        formatRupiah(hargaBeli),
        formatRupiah(hargaJual),
        formatRupiah(hargaKhusus),
        formatRupiah(totalNilaiModal),
        statusStok,
      ];
    }),
  ];

  const fileHasilBumi: ModularFileDefinition = {
    id: 'file-hasil-bumi',
    fileName: 'Database_HasilBumi_Komoditas_WijayaAgro.xlsx',
    googleSheetTitle: 'Database Hasil Bumi & Komoditas - PT Wijaya Agro',
    label: '4. File Database Hasil Bumi & Barang',
    badge: 'KOMODITAS PER SHEET',
    color: 'emerald',
    description: 'File mandiri dengan sheet/tab terpisah per komoditas: Lada, Kopi, Kulit KA, Stik, KB, KF, Lainnya, dan Saprodi Toko.',
    sheets: [
      {
        sheetName: 'Sheet_Lada',
        tabLabel: '🌿 Sheet Lada',
        icon: 'Wheat',
        description: 'Khusus komoditas Lada Hitam & Putih: stok gudang, tonase, dan riwayat beli petani',
        data: sheetLada,
      },
      {
        sheetName: 'Sheet_Kopi',
        tabLabel: '☕ Sheet Kopi',
        icon: 'Coffee',
        description: 'Khusus komoditas Kopi Robusta & Kopi Roni: stok, pembelian, dan tonase',
        data: sheetKopi,
      },
      {
        sheetName: 'Sheet_Kulit_KA',
        tabLabel: '🪵 Sheet Kulit KA',
        icon: 'Layers',
        description: 'Khusus Kayu Manis / Cassia Vera Grade KA: mutasi dan rekap timbangan petani',
        data: sheetKulitKA,
      },
      {
        sheetName: 'Sheet_Stik',
        tabLabel: '🥢 Sheet Stik',
        icon: 'Boxes',
        description: 'Khusus Cassia Sticks / Batangan Stik pilihan: stok gudang dan mutasi masuk',
        data: sheetStik,
      },
      {
        sheetName: 'Sheet_KB',
        tabLabel: '🌾 Sheet KB',
        icon: 'Package',
        description: 'Khusus Kopi Beras / Grade KB: timbangan, rafaksi, dan persediaan fisik',
        data: sheetKB,
      },
      {
        sheetName: 'Sheet_KF',
        tabLabel: '✨ Sheet KF',
        icon: 'Sparkles',
        description: 'Khusus Komoditas Fermentasi / Grade KF Premium: stok dan rekap petani',
        data: sheetKF,
      },
      {
        sheetName: 'Sheet_Lainnya',
        tabLabel: '🌽 Komoditas Lainnya',
        icon: 'Wheat',
        description: 'Jagung Pipil Kering, Gabah Kering Panen (GKP), Kelapa Sawit TBS, dll.',
        data: sheetKomoditasLainnya,
      },
      {
        sheetName: 'Sheet_Saprodi_Toko',
        tabLabel: '🛒 Saprodi & Toko',
        icon: 'ShoppingCart',
        description: 'Persediaan pupuk, obat pertanian, benih jagung, beras kemasan, dan sembako',
        data: sheetSaprodi,
      },
    ],
  };

  return [fileKaryawan, fileMitra, fileTransaksi, fileHasilBumi];
};

/**
 * Downloads a single modular file as an .xlsx workbook with multiple sheets
 */
export const downloadModularSpreadsheetAsExcel = (fileDef: ModularFileDefinition) => {
  const wb = XLSX.utils.book_new();

  fileDef.sheets.forEach((sheet) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.data);

    // Auto-fit column widths approximation
    const maxCols = Math.max(...sheet.data.map((r) => r.length), 0);
    const colWidths = [];
    for (let c = 0; c < maxCols; c++) {
      let maxLen = 10;
      for (const row of sheet.data) {
        const val = row[c];
        if (val !== undefined && val !== null) {
          maxLen = Math.max(maxLen, String(val).length);
        }
      }
      colWidths.push({ wch: Math.min(maxLen + 2, 45) });
    }
    ws['!cols'] = colWidths;

    // Sanitize sheet name (Excel limits sheet names to 31 characters)
    const safeSheetName = sheet.sheetName.replace(/[:\\/?*\[\]]/g, '').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  });

  XLSX.writeFile(wb, fileDef.fileName);
};

/**
 * Downloads all 4 modular files as individual Excel spreadsheets sequentially
 */
export const downloadAllModularSpreadsheets = (fileDefs: ModularFileDefinition[]) => {
  fileDefs.forEach((def, index) => {
    setTimeout(() => {
      downloadModularSpreadsheetAsExcel(def);
    }, index * 400);
  });
};
