import { dbManager, getWIBDateTime } from '../db.ts';
import {
  AlokasiPembayaranBon,
  AuditLog,
  BukuRekeningKaryawanSummary,
  CatatanUpahHarian,
  DAFTAR_DIVISI,
  ItemPenjualan,
  MutasiBukuRekeningKaryawan,
  MutasiKeuanganDivisi,
  NamaDivisi,
  PergerakanKeuanganDivisiSummary,
  RekapGajiKaryawanBulanan,
  RekeningKoranMitraSummary,
  TransaksiBayarBon,
  TransaksiKasbonUang,
  TransaksiPembelianHasilBumi,
  TransaksiPenggajian,
  TransaksiPenjualan,
  TransaksiTransferRekening,
} from '../types.ts';

// Helper to generate unique sequential transaction IDs
function generateId(prefix: string): string {
  const { tanggal } = getWIBDateTime();
  const [d, m, y] = tanggal.split('/');
  const dateCode = `${y.slice(2)}${m}${d}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${dateCode}${randomSuffix}`;
}

export class TransactionService {
  /**
   * Helper: Add an immutable audit log
   */
  private static addAuditLog(
    db: ReturnType<typeof dbManager.get>,
    jenis: AuditLog['jenisTransaksi'],
    idTransaksi: string,
    detail: string,
    nominal: number,
    rekeningTerkait: string = '',
    user: string = 'Kasir Wijaya Agro'
  ) {
    const { tanggal, jam, iso } = getWIBDateTime();
    db.auditLogs.unshift({
      id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: iso,
      tanggal,
      jam,
      user,
      jenisTransaksi: jenis,
      idTransaksi,
      detail,
      nominal,
      rekeningTerkait,
    });
  }

  // ==========================================
  // 1. PENJUALAN
  // ==========================================
  public static async processPenjualan(params: {
    idMitra: string;
    metode: 'TUNAI' | 'TRANSFER' | 'KASBON';
    rekeningTujuan?: string;
    items: Array<{ kodeProduk: string; qty: number; harga?: number }>;
    keterangan?: string;
  }): Promise<TransaksiPenjualan> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Validate Mitra
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) {
        throw new Error('Mitra tidak ditemukan');
      }
      if (mitra.status !== 'AKTIF') {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }

      if (!params.items || params.items.length === 0) {
        throw new Error('Item penjualan tidak boleh kosong');
      }

      // Validate & deduct stock real-time
      const processedItems: ItemPenjualan[] = [];
      let totalNominal = 0;

      for (const item of params.items) {
        if (!item.qty || item.qty <= 0) {
          throw new Error(`Qty untuk produk ${item.kodeProduk} harus lebih dari 0`);
        }

        const product = db.produk.find((p) => p.kode === item.kodeProduk);
        if (!product) {
          throw new Error(`Produk dengan kode ${item.kodeProduk} tidak ditemukan`);
        }
        if (product.status !== 'AKTIF') {
          throw new Error(`Produk ${product.nama} tidak aktif`);
        }

        const stokItem = db.stokBarang.find((s) => s.kode === item.kodeProduk);
        if (!stokItem) {
          throw new Error(`Data stok untuk produk ${product.nama} tidak ditemukan`);
        }

        if (stokItem.stok < item.qty) {
          throw new Error(
            `Stok tidak mencukupi untuk "${product.nama}". Stok tersedia: ${stokItem.stok} ${stokItem.satuan}, diminta: ${item.qty} ${stokItem.satuan}`
          );
        }

        const hargaSatuan = item.harga !== undefined && item.harga >= 0 ? item.harga : product.hargaJual;
        const subtotal = hargaSatuan * item.qty;
        totalNominal += subtotal;

        processedItems.push({
          kodeProduk: product.kode,
          namaProduk: product.nama,
          satuan: product.satuan,
          qty: item.qty,
          harga: hargaSatuan,
          subtotal,
        });

        // Deduct stock in DB_STOK
        stokItem.stok -= item.qty;
        stokItem.updateTerakhir = iso;
      }

      // Handle Destination Account & Balance update based on method
      let finalRekeningTujuan = '';
      let statusPembayaran: 'LUNAS' | 'BELUM_BAYAR' = 'LUNAS';
      let sisaPiutang = 0;

      if (params.metode === 'TUNAI') {
        finalRekeningTujuan = 'KAS01';
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
        kasAcc.saldoSaatIni += totalNominal;
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (params.metode === 'TRANSFER') {
        if (!params.rekeningTujuan) {
          throw new Error('Rekening bank tujuan transfer wajib dipilih');
        }
        if (params.rekeningTujuan === 'BON01' || params.rekeningTujuan === 'TIT01') {
          throw new Error('Rekening BON01 / TIT01 tidak dapat digunakan untuk pembayaran transfer');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningTujuan} tidak ditemukan`);
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        bankAcc.saldoSaatIni += totalNominal;
        finalRekeningTujuan = bankAcc.kode;
        statusPembayaran = 'LUNAS';
        sisaPiutang = 0;
      } else if (params.metode === 'KASBON') {
        // Barang keluar, customer memiliki piutang, TIDAK ada uang kas masuk
        finalRekeningTujuan = 'BON01';
        statusPembayaran = 'BELUM_BAYAR';
        sisaPiutang = totalNominal;
      }

      const noPenjualan = generateId('PJ');
      const penjualanRecord: TransaksiPenjualan = {
        noPenjualan,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        metode: params.metode,
        rekeningTujuan: finalRekeningTujuan,
        items: processedItems,
        totalNominal,
        statusPembayaran,
        sisaPiutang,
        keterangan: params.keterangan || (params.metode === 'KASBON' ? 'Penjualan Kasbon Barang' : 'Penjualan Barang Toko'),
        createdAt: iso,
      };

      db.penjualan.unshift(penjualanRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noPenjualan,
        `Penjualan ${params.metode} kepada ${mitra.nama} (${processedItems.length} item) - Status: ${statusPembayaran}`,
        totalNominal,
        finalRekeningTujuan
      );

      return penjualanRecord;
    });
  }

  // ==========================================
  // 2. PEMBELIAN HASIL BUMI
  // ==========================================
  public static async processPembelianHasilBumi(params: {
    idMitra: string;
    komoditasKode: string;
    beratKotor: number;
    potonganRafaksi: number;
    hargaPerKg: number;
    metodePembayaran: 'TUNAI' | 'TRANSFER' | 'TITIP';
    rekeningSumber?: string;
    keterangan?: string;
  }): Promise<TransaksiPembelianHasilBumi> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Mitra supplier tidak ditemukan');
      if (mitra.status !== 'AKTIF') throw new Error(`Mitra ${mitra.nama} tidak aktif`);

      const komoditas = db.stokHasilBumi.find((k) => k.kode === params.komoditasKode);
      if (!komoditas) throw new Error(`Komoditas dengan kode ${params.komoditasKode} tidak ditemukan`);

      if (params.beratKotor <= 0) throw new Error('Berat kotor harus lebih dari 0 kg');
      if (params.potonganRafaksi < 0 || params.potonganRafaksi >= 100) {
        throw new Error('Potongan rafaksi harus antara 0% dan 99.9%');
      }
      if (params.hargaPerKg <= 0) throw new Error('Harga per kg harus lebih dari 0');

      const beratBersih = Math.round(params.beratKotor * (1 - params.potonganRafaksi / 100) * 100) / 100;
      const totalNominal = Math.round(beratBersih * params.hargaPerKg);

      let finalRekeningSumber = '';
      let status: 'LUNAS' | 'BELUM_DIAMBIL' | 'TITIP' = 'LUNAS';

      if (params.metodePembayaran === 'TUNAI') {
        finalRekeningSumber = 'KAS01';
        const kasAcc = db.rekening.find((r) => r.kode === 'KAS01');
        if (!kasAcc) throw new Error('Rekening KAS01 tidak ditemukan');
        if (kasAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo kas tidak mencukupi untuk pembayaran tunai. Saldo KAS01: Rp ${kasAcc.saldoSaatIni.toLocaleString(
              'id-ID'
            )}, Total tagihan: Rp ${totalNominal.toLocaleString('id-ID')}`
          );
        }
        kasAcc.saldoSaatIni -= totalNominal;
        status = 'LUNAS';
      } else if (params.metodePembayaran === 'TRANSFER') {
        if (!params.rekeningSumber) {
          throw new Error('Rekening bank sumber transfer wajib dipilih');
        }
        if (params.rekeningSumber === 'BON01' || params.rekeningSumber === 'TIT01') {
          throw new Error('Rekening BON01 / TIT01 tidak dapat digunakan sebagai sumber transfer');
        }
        const bankAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
        if (!bankAcc) throw new Error(`Rekening ${params.rekeningSumber} tidak ditemukan`);
        if (bankAcc.status !== 'AKTIF') throw new Error(`Rekening ${bankAcc.nama} tidak aktif`);
        if (bankAcc.saldoSaatIni < totalNominal) {
          throw new Error(
            `Saldo rekening ${bankAcc.nama} tidak mencukupi. Saldo: Rp ${bankAcc.saldoSaatIni.toLocaleString(
              'id-ID'
            )}, Tagihan: Rp ${totalNominal.toLocaleString('id-ID')}`
          );
        }
        bankAcc.saldoSaatIni -= totalNominal;
        finalRekeningSumber = bankAcc.kode;
        status = 'LUNAS';
      } else if (params.metodePembayaran === 'TITIP') {
        finalRekeningSumber = 'TIT01';
        status = 'TITIP';
      }

      // Add to Hasil Bumi Stock
      komoditas.stok += beratBersih;
      komoditas.updateTerakhir = iso;

      const noPembelian = generateId('PHB');
      const pembelianRecord: TransaksiPembelianHasilBumi = {
        noPembelian,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        komoditasKode: komoditas.kode,
        komoditasNama: komoditas.nama,
        beratKotor: params.beratKotor,
        potonganRafaksi: params.potonganRafaksi,
        beratBersih,
        hargaPerKg: params.hargaPerKg,
        totalNominal,
        metodePembayaran: params.metodePembayaran,
        rekeningSumber: finalRekeningSumber,
        status,
        keterangan: params.keterangan || `Pembelian ${komoditas.nama} dari ${mitra.nama}`,
        createdAt: iso,
      };

      db.pembelianHasilBumi.unshift(pembelianRecord);

      this.addAuditLog(
        db,
        'CREATE',
        noPembelian,
        `Pembelian Hasil Bumi ${komoditas.nama} (${beratBersih} kg) dari ${mitra.nama} - Metode: ${params.metodePembayaran}`,
        totalNominal,
        finalRekeningSumber
      );

      return pembelianRecord;
    });
  }

  // ==========================================
  // 3. KASBON UANG (FITUR BARU C)
  // Perusahaan memberikan UANG kepada MITRA
  // ==========================================
  public static async processKasbonUang(params: {
    idMitra: string;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string;
    nominal: number;
    keterangan?: string;
  }): Promise<TransaksiKasbonUang> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Validasi nominal
      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal kasbon uang harus lebih dari Rp 0');
      }

      // Validasi Mitra
      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) {
        throw new Error('Mitra penerima kasbon tidak ditemukan');
      }
      if (mitra.status !== 'AKTIF') {
        throw new Error(`Mitra ${mitra.nama} berstatus NONAKTIF`);
      }

      let rekeningSumberKode = '';
      if (params.metode === 'TUNAI') {
        rekeningSumberKode = 'KAS01';
      } else if (params.metode === 'TRANSFER') {
        if (!params.rekeningSumber) {
          throw new Error('User wajib memilih rekening bank perusahaan untuk transfer kasbon uang');
        }
        rekeningSumberKode = params.rekeningSumber;
      }

      // Dilarang keras menggunakan BON01 atau TIT01
      if (rekeningSumberKode === 'BON01' || rekeningSumberKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 DILARANG digunakan sebagai sumber kasbon uang!');
      }

      // Validasi rekening sumber dan saldo aktual di database
      const rekeningSumber = db.rekening.find((r) => r.kode === rekeningSumberKode);
      if (!rekeningSumber) {
        throw new Error(`Rekening sumber dengan kode ${rekeningSumberKode} tidak ditemukan`);
      }
      if (rekeningSumber.status !== 'AKTIF') {
        throw new Error(`Rekening sumber ${rekeningSumber.nama} tidak aktif`);
      }
      if (rekeningSumber.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening ${rekeningSumber.nama} (${rekeningSumber.kode}) tidak mencukupi! Saldo saat ini: Rp ${rekeningSumber.saldoSaatIni.toLocaleString(
            'id-ID'
          )}, kasbon yang diajukan: Rp ${params.nominal.toLocaleString('id-ID')}`
        );
      }

      // Potong saldo rekening sumber aktual
      rekeningSumber.saldoSaatIni -= params.nominal;

      const idTransaksi = generateId('KBU');
      const kasbonUangRecord: TransaksiKasbonUang = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        jenisTransaksi: 'KASBON UANG',
        metode: params.metode,
        rekeningSumber: rekeningSumber.kode,
        nominal: params.nominal,
        sisaKasbon: params.nominal,
        keterangan: params.keterangan || `Pemberian Kasbon Uang Operasional Tani kepada ${mitra.nama}`,
        status: 'BELUM LUNAS',
        createdAt: iso,
      };

      db.kasbonUang.unshift(kasbonUangRecord);

      this.addAuditLog(
        db,
        'CREATE',
        idTransaksi,
        `Kasbon Uang diberikan kepada ${mitra.nama} sebesar Rp ${params.nominal.toLocaleString(
          'id-ID'
        )} dari ${rekeningSumber.nama} (${rekeningSumber.kode}) via ${params.metode}`,
        params.nominal,
        rekeningSumber.kode
      );

      return kasbonUangRecord;
    });
  }

  // ==========================================
  // 4. BAYAR BON (FITUR BARU D)
  // Pelunasan seluruh atau sebagian bon mitra (Kasbon Barang + Kasbon Uang)
  // ==========================================
  public static async processBayarBon(params: {
    idMitra: string;
    nominalBayar: number;
    metode: 'TUNAI' | 'TRANSFER';
    rekeningTujuan?: string;
    keterangan?: string;
  }): Promise<TransaksiBayarBon> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      if (!params.nominalBayar || params.nominalBayar <= 0) {
        throw new Error('Nominal pembayaran bon harus lebih dari Rp 0');
      }

      const mitra = db.mitra.find((m) => m.id === params.idMitra);
      if (!mitra) throw new Error('Mitra tidak ditemukan');

      // Ambil seluruh kewajiban bon mitra yang outstanding
      // 1. Kasbon Barang
      const outstandingPenjualan = db.penjualan.filter(
        (p) => p.idMitra === mitra.id && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR' && p.sisaPiutang > 0
      );
      const totalKasbonBarang = outstandingPenjualan.reduce((s, p) => s + p.sisaPiutang, 0);

      // 2. Kasbon Uang
      const outstandingKasbonUang = db.kasbonUang.filter(
        (k) => k.idMitra === mitra.id && k.status !== 'LUNAS' && k.sisaKasbon > 0
      );
      const totalKasbonUang = outstandingKasbonUang.reduce((s, k) => s + k.sisaKasbon, 0);

      const totalBonSebelum = totalKasbonBarang + totalKasbonUang;

      if (totalBonSebelum <= 0) {
        throw new Error(`Mitra ${mitra.nama} tidak memiliki kewajiban bon yang harus dibayar saat ini`);
      }

      if (params.nominalBayar > totalBonSebelum) {
        throw new Error(
          `Nominal pembayaran (Rp ${params.nominalBayar.toLocaleString(
            'id-ID'
          )}) melebihi total bon keseluruhan mitra (Rp ${totalBonSebelum.toLocaleString('id-ID')})`
        );
      }

      // Validasi Rekening Tujuan Uang Masuk
      let rekeningTujuanKode = '';
      if (params.metode === 'TUNAI') {
        rekeningTujuanKode = 'KAS01';
      } else if (params.metode === 'TRANSFER') {
        if (!params.rekeningTujuan) {
          throw new Error('User wajib memilih rekening bank perusahaan penampung setoran');
        }
        rekeningTujuanKode = params.rekeningTujuan;
      }

      if (rekeningTujuanKode === 'BON01' || rekeningTujuanKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 tidak dapat dijadikan rekening tujuan pembayaran!');
      }

      const rekeningTujuan = db.rekening.find((r) => r.kode === rekeningTujuanKode);
      if (!rekeningTujuan) {
        throw new Error(`Rekening ${rekeningTujuanKode} tidak ditemukan`);
      }
      if (rekeningTujuan.status !== 'AKTIF') {
        throw new Error(`Rekening ${rekeningTujuan.nama} tidak aktif`);
      }

      // Tambahkan saldo rekening penerima
      rekeningTujuan.saldoSaatIni += params.nominalBayar;

      // Alokasi pembayaran konsisten (FIFO: urutan transaksi lama ke baru)
      // Gabungkan semua bon outstanding dengan tanggal createdAt
      type BonItem = {
        jenis: 'KASBON_BARANG' | 'KASBON_UANG';
        refId: string;
        sisa: number;
        createdAt: string;
        sourceObj: TransaksiPenjualan | TransaksiKasbonUang;
      };

      const allBons: BonItem[] = [
        ...outstandingPenjualan.map((p) => ({
          jenis: 'KASBON_BARANG' as const,
          refId: p.noPenjualan,
          sisa: p.sisaPiutang,
          createdAt: p.createdAt,
          sourceObj: p,
        })),
        ...outstandingKasbonUang.map((k) => ({
          jenis: 'KASBON_UANG' as const,
          refId: k.idTransaksi,
          sisa: k.sisaKasbon,
          createdAt: k.createdAt,
          sourceObj: k,
        })),
      ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let remainingPayment = params.nominalBayar;
      const alokasiList: AlokasiPembayaranBon[] = [];

      for (const bon of allBons) {
        if (remainingPayment <= 0) break;

        const nominalSebelum = bon.sisa;
        const alokasiNominal = Math.min(remainingPayment, nominalSebelum);
        const nominalSisa = nominalSebelum - alokasiNominal;

        if (bon.jenis === 'KASBON_BARANG') {
          const pj = bon.sourceObj as TransaksiPenjualan;
          pj.sisaPiutang = nominalSisa;
          if (nominalSisa === 0) {
            pj.statusPembayaran = 'LUNAS';
          }
        } else {
          const kbu = bon.sourceObj as TransaksiKasbonUang;
          kbu.sisaKasbon = nominalSisa;
          if (nominalSisa === 0) {
            kbu.status = 'LUNAS';
          } else {
            kbu.status = 'SEBAGIAN';
          }
        }

        alokasiList.push({
          jenis: bon.jenis,
          refId: bon.refId,
          nominalSebelum,
          nominalDibayar: alokasiNominal,
          nominalSisa,
        });

        remainingPayment -= alokasiNominal;
      }

      const sisaBonSetelah = totalBonSebelum - params.nominalBayar;
      const idTransaksi = generateId('BYB');

      const bayarBonRecord: TransaksiBayarBon = {
        idTransaksi,
        tanggal,
        jam,
        idMitra: mitra.id,
        namaMitra: mitra.nama,
        totalBonSebelum,
        nominalBayar: params.nominalBayar,
        sisaBonSetelah,
        metode: params.metode,
        rekeningTujuan: rekeningTujuan.kode,
        alokasi: alokasiList,
        keterangan: params.keterangan || `Pembayaran Bon ${mitra.nama} ke ${rekeningTujuan.nama}`,
        createdAt: iso,
      };

      db.bayarBon.unshift(bayarBonRecord);

      this.addAuditLog(
        db,
        'PAYMENT',
        idTransaksi,
        `Pembayaran Bon oleh ${mitra.nama}: Rp ${params.nominalBayar.toLocaleString(
          'id-ID'
        )} masuk ke ${rekeningTujuan.nama}. Sisa kewajiban bon: Rp ${sisaBonSetelah.toLocaleString('id-ID')}`,
        params.nominalBayar,
        rekeningTujuan.kode
      );

      return bayarBonRecord;
    });
  }

  // ==========================================
  // 5. TRANSFER ANTAR REKENING PERUSAHAAN (FITUR BARU E)
  // Perpindahan dana internal antar rekening perusahaan
  // ==========================================
  public static async processTransferRekening(params: {
    rekeningSumber: string;
    rekeningTujuan: string;
    nominal: number;
    keterangan: string;
  }): Promise<TransaksiTransferRekening> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      // Validasi rekening sumber & tujuan
      if (!params.rekeningSumber || !params.rekeningTujuan) {
        throw new Error('Rekening sumber dan rekening tujuan wajib diisi');
      }

      if (params.rekeningSumber === params.rekeningTujuan) {
        throw new Error('Rekening sumber dan rekening tujuan tidak boleh sama');
      }

      // Validasi BON01 dan TIT01 tidak boleh digunakan
      if (
        params.rekeningSumber === 'BON01' ||
        params.rekeningSumber === 'TIT01' ||
        params.rekeningTujuan === 'BON01' ||
        params.rekeningTujuan === 'TIT01'
      ) {
        throw new Error('Rekening BON01 dan TIT01 TIDAK BOLEH digunakan untuk transfer antar rekening perusahaan!');
      }

      if (!params.nominal || params.nominal <= 0) {
        throw new Error('Nominal transfer harus lebih dari Rp 0');
      }

      const sumberAcc = db.rekening.find((r) => r.kode === params.rekeningSumber);
      if (!sumberAcc) {
        throw new Error(`Rekening sumber ${params.rekeningSumber} tidak ditemukan`);
      }
      if (sumberAcc.status !== 'AKTIF') {
        throw new Error(`Rekening sumber ${sumberAcc.nama} tidak aktif`);
      }

      const tujuanAcc = db.rekening.find((r) => r.kode === params.rekeningTujuan);
      if (!tujuanAcc) {
        throw new Error(`Rekening tujuan ${params.rekeningTujuan} tidak ditemukan`);
      }
      if (tujuanAcc.status !== 'AKTIF') {
        throw new Error(`Rekening tujuan ${tujuanAcc.nama} tidak aktif`);
      }

      // Validasi saldo sumber mencukupi
      if (sumberAcc.saldoSaatIni < params.nominal) {
        throw new Error(
          `Saldo rekening sumber ${sumberAcc.nama} (${sumberAcc.kode}) tidak mencukupi! Saldo saat ini: Rp ${sumberAcc.saldoSaatIni.toLocaleString(
            'id-ID'
          )}, nominal transfer: Rp ${params.nominal.toLocaleString('id-ID')}`
        );
      }

      // Pindahkan saldo: sumber - nominal, tujuan + nominal
      sumberAcc.saldoSaatIni -= params.nominal;
      tujuanAcc.saldoSaatIni += params.nominal;

      const noTransfer = generateId('TRF');
      const transferRecord: TransaksiTransferRekening = {
        noTransfer,
        tanggal,
        jam,
        rekeningSumber: sumberAcc.kode,
        rekeningTujuan: tujuanAcc.kode,
        nominal: params.nominal,
        keterangan: params.keterangan || 'Pemindahan dana operasional internal',
        status: 'BERHASIL',
        createdAt: iso,
      };

      db.transferRekening.unshift(transferRecord);

      this.addAuditLog(
        db,
        'TRANSFER',
        noTransfer,
        `Transfer Antar Rekening: ${sumberAcc.nama} (${sumberAcc.kode}) -> ${tujuanAcc.nama} (${tujuanAcc.kode}) sebesar Rp ${params.nominal.toLocaleString(
          'id-ID'
        )}. Ket: ${transferRecord.keterangan}`,
        params.nominal,
        `${sumberAcc.kode} -> ${tujuanAcc.kode}`
      );

      return transferRecord;
    });
  }

  // ==========================================
  // PENGGAJIAN KARYAWAN & POTONG KASBON (HARIAN & BULANAN DENGAN DIVISI)
  // ==========================================
  private static readonly DIVISI_REKENING_MAP: Record<string, string> = {
    'Gudang Wijaya Agro': 'REK-GWA',
    'Wijaya Karya': 'REK-WK',
    'Wijaya Transport': 'REK-WT',
    'CV Wijaya Agro': 'REK-CVA',
    'PT Wijaya Agro Perkasa': 'REK-WAP',
    'Okussa': 'REK-OKU',
  };

  public static async processPenggajian(params: {
    idKaryawan: string;
    divisi?: NamaDivisi;
    tipeGaji?: 'HARIAN' | 'BULANAN';
    tanggalKerja?: string;
    periodeBulan?: string;
    gajiNominal?: number; // Manual input nominal upah harian / gaji pokok
    bonus?: number;       // Lembur, insentif, uang makan
    persentasePotongKasbon?: number; // e.g. 100, 50, 25, 0 atau custom
    nominalPotongKustom?: number;
    metodePembayaran?: 'TUNAI' | 'TRANSFER';
    rekeningSumber?: string; // e.g. Rekening Divisi atau Kas Utama
    keterangan?: string;
  }): Promise<TransaksiPenggajian> {
    return await dbManager.executeTransaction((db) => {
      const { tanggal, jam, iso } = getWIBDateTime();

      const kry = db.karyawan.find((k) => k.id === params.idKaryawan);
      if (!kry) {
        throw new Error(`Karyawan dengan ID ${params.idKaryawan} tidak ditemukan`);
      }
      if (kry.status !== 'AKTIF') {
        throw new Error(`Karyawan ${kry.nama} berstatus nonaktif`);
      }

      // Validasi Divisi yang ditugaskan hari ini
      const divisi: NamaDivisi = params.divisi || 'Gudang Wijaya Agro';
      const tipeGaji: 'HARIAN' | 'BULANAN' = params.tipeGaji || 'HARIAN';
      const targetTanggal = params.tanggalKerja || tanggal;

      // Tentukan rekening sumber default (utamakan rekening khusus divisi jika tidak dipilih)
      let rekKode = params.rekeningSumber;
      if (!rekKode) {
        rekKode = TransactionService.DIVISI_REKENING_MAP[divisi] || 'KAS01';
      }

      if (rekKode === 'BON01' || rekKode === 'TIT01') {
        throw new Error('Rekening virtual BON01 / TIT01 DILARANG digunakan untuk pembayaran gaji!');
      }

      let rekSumber = db.rekening.find((r) => r.kode === rekKode);
      if (!rekSumber) {
        // Fallback to KAS01 jika rekening divisi belum ada
        rekSumber = db.rekening.find((r) => r.kode === 'KAS01') || db.rekening[0];
      }
      if (rekSumber.status !== 'AKTIF') {
        throw new Error(`Rekening ${rekSumber.nama} tidak aktif`);
      }

      // Upah manual yang diinput kasir
      const upahManual =
        params.gajiNominal !== undefined && params.gajiNominal !== null
          ? Math.max(0, Number(params.gajiNominal))
          : (kry.gajiPokok || 0);

      const tunjangan = tipeGaji === 'BULANAN' ? (kry.tunjanganTetap || 0) : 0;
      const bonus = Math.max(0, Number(params.bonus) || 0);
      const totalGajiKotor = upahManual + tunjangan + bonus;

      if (totalGajiKotor <= 0) {
        throw new Error('Total gaji/upah harian harus lebih dari Rp 0');
      }

      // Find linked mitra to calculate current total outstanding bon
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const outstandingKasbonBarang = db.penjualan
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

      const outstandingKasbonUang = db.kasbonUang
        .filter((k) => k.idMitra === mitraId && k.status !== 'LUNAS')
        .reduce((sum, k) => sum + (k.sisaKasbon || 0), 0);

      const totalKasbonAwal = outstandingKasbonBarang + outstandingKasbonUang;

      // Calculate potongan kasbon
      let potonganKasbon = 0;
      const persentase = Number(params.persentasePotongKasbon) || 0;
      if (params.nominalPotongKustom !== undefined && params.nominalPotongKustom > 0) {
        potonganKasbon = Math.min(params.nominalPotongKustom, totalKasbonAwal, totalGajiKotor);
      } else if (persentase > 0 && totalKasbonAwal > 0) {
        const calculated = Math.round((totalKasbonAwal * persentase) / 100);
        potonganKasbon = Math.min(calculated, totalKasbonAwal, totalGajiKotor);
      }

      const gajiBersihDibayar = totalGajiKotor - potonganKasbon;

      if (rekSumber.saldoSaatIni < gajiBersihDibayar) {
        throw new Error(
          `Saldo rekening ${rekSumber.nama} (Rp ${rekSumber.saldoSaatIni.toLocaleString(
            'id-ID'
          )}) tidak mencukupi untuk pembayaran gaji bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')}`
        );
      }

      let idBayarBonTerkait: string | undefined;

      // Settle kasbon if deduction > 0
      if (potonganKasbon > 0) {
        let remainingToSettle = potonganKasbon;
        const alokasiList: AlokasiPembayaranBon[] = [];

        // 1. Settle Kasbon Uang first
        const unpaidKasbonUang = db.kasbonUang.filter(
          (k) => k.idMitra === mitraId && k.status !== 'LUNAS'
        );
        for (const kbu of unpaidKasbonUang) {
          if (remainingToSettle <= 0) break;
          const sisa = kbu.sisaKasbon;
          const settled = Math.min(remainingToSettle, sisa);
          kbu.sisaKasbon = sisa - settled;
          kbu.status = kbu.sisaKasbon === 0 ? 'LUNAS' : 'SEBAGIAN';

          alokasiList.push({
            jenis: 'KASBON_UANG',
            refId: kbu.idTransaksi,
            nominalSebelum: sisa,
            nominalDibayar: settled,
            nominalSisa: kbu.sisaKasbon,
          });
          remainingToSettle -= settled;
        }

        // 2. Settle Kasbon Barang
        if (remainingToSettle > 0) {
          const unpaidPenjualan = db.penjualan.filter(
            (p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR'
          );
          for (const pj of unpaidPenjualan) {
            if (remainingToSettle <= 0) break;
            const sisa = pj.sisaPiutang;
            const settled = Math.min(remainingToSettle, sisa);
            pj.sisaPiutang = sisa - settled;
            if (pj.sisaPiutang === 0) {
              pj.statusPembayaran = 'LUNAS';
            }
            alokasiList.push({
              jenis: 'KASBON_BARANG',
              refId: pj.noPenjualan,
              nominalSebelum: sisa,
              nominalDibayar: settled,
              nominalSisa: pj.sisaPiutang,
            });
            remainingToSettle -= settled;
          }
        }

        const idBYB = generateId('BYB');
        idBayarBonTerkait = idBYB;
        db.bayarBon.unshift({
          idTransaksi: idBYB,
          tanggal: targetTanggal,
          jam,
          idMitra: mitraId,
          namaMitra: `${kry.nama} (Karyawan)`,
          totalBonSebelum: totalKasbonAwal,
          nominalBayar: potonganKasbon,
          sisaBonSetelah: totalKasbonAwal - potonganKasbon,
          metode: 'TUNAI',
          rekeningTujuan: rekSumber.kode,
          alokasi: alokasiList,
          keterangan: `Potong Gaji ${tipeGaji === 'HARIAN' ? 'Harian' : 'Bulanan'} [${divisi}] Karyawan ${kry.nama}`,
          createdAt: iso,
        });
      }

      // Potong saldo rekening sumber
      rekSumber.saldoSaatIni -= gajiBersihDibayar;

      const sisaKasbonAkhir = totalKasbonAwal - potonganKasbon;
      const idPayroll = generateId('GAJI');
      const slipNomor = `SLIP/WA/${targetTanggal.replace(/\//g, '')}/${idPayroll.slice(-4)}`;

      const periodeFormatted =
        params.periodeBulan ||
        (tipeGaji === 'HARIAN' ? `Harian - ${targetTanggal}` : `Bulanan - ${targetTanggal.slice(3)}`);

      const payrollRecord: TransaksiPenggajian = {
        id: idPayroll,
        slipNomor,
        tanggal: targetTanggal,
        jam,
        idKaryawan: kry.id,
        nikKaryawan: kry.nik,
        namaKaryawan: kry.nama,
        jabatan: kry.jabatan,
        departemen: kry.departemen,
        divisi,
        tipeGaji,
        periodeBulan: periodeFormatted,
        gajiPokok: upahManual,
        tunjangan,
        bonus,
        totalGajiKotor,
        totalKasbonAwal,
        persentasePotongKasbon: persentase,
        potonganKasbon,
        sisaKasbonAkhir,
        gajiBersihDibayar,
        metodePembayaran: params.metodePembayaran || 'TUNAI',
        rekeningSumber: rekSumber.kode,
        keterangan: params.keterangan || `Gaji ${tipeGaji === 'HARIAN' ? 'Harian' : 'Bulanan'} Divisi ${divisi} - ${kry.nama}`,
        idBayarBonTerkait,
      };

      db.penggajian.unshift(payrollRecord);

      this.addAuditLog(
        db,
        'PAYROLL',
        idPayroll,
        `Penggajian ${tipeGaji} [Divisi: ${divisi}] Karyawan ${kry.nama} (${kry.nik}): Upah Kotor Rp ${totalGajiKotor.toLocaleString('id-ID')}, Potong Bon Rp ${potonganKasbon.toLocaleString('id-ID')} (Sisa Bon Rp ${sisaKasbonAkhir.toLocaleString('id-ID')}), Gaji Bersih Rp ${gajiBersihDibayar.toLocaleString('id-ID')} via ${rekSumber.nama} (${rekSumber.kode})`,
        gajiBersihDibayar,
        rekSumber.kode
      );

      return payrollRecord;
    });
  }

  /**
   * Process Batch Penggajian Harian (Multi-Karyawan Sekaligus)
   */
  public static async processBatchPenggajianHarian(batchData: {
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
  }): Promise<TransaksiPenggajian[]> {
    const results: TransaksiPenggajian[] = [];
    for (const item of batchData.items) {
      const res = await this.processPenggajian({
        idKaryawan: item.idKaryawan,
        divisi: item.divisi,
        tipeGaji: 'HARIAN',
        tanggalKerja: batchData.tanggalKerja,
        gajiNominal: item.gajiNominal,
        bonus: item.bonus,
        persentasePotongKasbon: item.persentasePotongKasbon || 0,
        nominalPotongKustom: item.nominalPotongKustom,
        rekeningSumber: item.rekeningSumber,
        keterangan: item.keterangan,
      });
      results.push(res);
    }
    return results;
  }

  // ==========================================
  // PERGERAKAN KEUANGAN TIAP DIVISI
  // ==========================================
  public static getPergerakanKeuanganDivisi(): PergerakanKeuanganDivisiSummary[] {
    const db = dbManager.get();

    return DAFTAR_DIVISI.map((div) => {
      const rek = db.rekening.find((r) => r.kode === div.kodeRekening) || {
        kode: div.kodeRekening,
        nama: `Kas Operasional ${div.nama}`,
        atasNama: `Divisi ${div.nama}`,
        nomorRekening: div.id,
        saldoAwal: 0,
        saldoSaatIni: 0,
        status: 'AKTIF' as const,
      };

      // 1. Dropping dana masuk / transfer ke rekening divisi
      const transferMasuk = (db.transferRekening || []).filter(
        (t) => t.rekeningTujuan === div.kodeRekening && t.status === 'BERHASIL'
      );
      const totalDroppingMasuk = transferMasuk.reduce((sum, t) => sum + (t.nominal || 0), 0);

      // 2. Transfer dana keluar dari rekening divisi
      const transferKeluar = (db.transferRekening || []).filter(
        (t) => t.rekeningSumber === div.kodeRekening && t.status === 'BERHASIL'
      );
      const totalTransferKeluar = transferKeluar.reduce((sum, t) => sum + (t.nominal || 0), 0);

      // 3. Gaji karyawan yang bertugas di divisi ini ATAU dibayar dari rekening divisi ini
      const gajiList = (db.penggajian || []).filter(
        (p) => p.divisi === div.nama || p.rekeningSumber === div.kodeRekening
      );
      const totalGajiKeluar = gajiList.reduce((sum, p) => sum + (p.gajiBersihDibayar || 0), 0);

      // Build timeline mutasi gabungan
      const mutasi: MutasiKeuanganDivisi[] = [];

      for (const t of transferMasuk) {
        const dariRek = db.rekening.find((r) => r.kode === t.rekeningSumber);
        mutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: 'DROPPING_MASUK',
          keterangan: `Dropping Kas dari ${dariRek ? dariRek.nama : t.rekeningSumber} (${t.keterangan || 'Operasional'})`,
          masuk: t.nominal,
          keluar: 0,
          saldoSetelah: 0,
          refId: t.noTransfer,
        });
      }

      for (const t of transferKeluar) {
        const keRek = db.rekening.find((r) => r.kode === t.rekeningTujuan);
        mutasi.push({
          id: t.noTransfer,
          tanggal: t.tanggal,
          jam: t.jam,
          jenis: 'TRANSFER_KELUAR',
          keterangan: `Transfer Keluar ke ${keRek ? keRek.nama : t.rekeningTujuan} (${t.keterangan || 'Internal'})`,
          masuk: 0,
          keluar: t.nominal,
          saldoSetelah: 0,
          refId: t.noTransfer,
        });
      }

      for (const g of gajiList) {
        mutasi.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          jenis: 'GAJI_KARYAWAN',
          keterangan: `Upah Karyawan: ${g.namaKaryawan} (${g.tipeGaji || 'Harian'}) - Kotor: Rp ${g.totalGajiKotor.toLocaleString('id-ID')}${g.potonganKasbon > 0 ? `, Potong Bon: Rp ${g.potonganKasbon.toLocaleString('id-ID')}` : ''}`,
          masuk: 0,
          keluar: g.gajiBersihDibayar,
          saldoSetelah: 0,
          refId: g.slipNomor,
          karyawanTerkait: g.namaKaryawan,
        });
      }

      // Sort chronological descending
      mutasi.sort((a, b) => {
        const [da, ma, ya] = (a.tanggal || '').split('/').map(Number);
        const [db, mb, yb] = (b.tanggal || '').split('/').map(Number);
        const dateA = new Date(ya || 2026, (ma || 1) - 1, da || 1).getTime();
        const dateB = new Date(yb || 2026, (mb || 1) - 1, db || 1).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return (b.jam || '').localeCompare(a.jam || '');
      });

      const karyawanSet = new Set<string>();
      gajiList.forEach((g) => karyawanSet.add(g.namaKaryawan));

      return {
        divisi: div.nama,
        idDivisi: div.id,
        kodeRekening: div.kodeRekening,
        namaRekening: rek.nama,
        saldoSaatIni: rek.saldoSaatIni,
        totalDroppingMasuk,
        totalGajiKeluar,
        totalTransferKeluar,
        totalTransaksiGaji: gajiList.length,
        daftarKaryawanTerakhir: Array.from(karyawanSet).slice(0, 5),
        mutasi,
      };
    });
  }

  // ==========================================
  // 6. REKENING KORAN MITRA (STATEMENT)
  // ==========================================
  public static getRekeningKoranMitra(idMitra: string): RekeningKoranMitraSummary {
    const db = dbManager.get();
    const mitra = db.mitra.find((m) => m.id === idMitra);
    if (!mitra) throw new Error('Mitra tidak ditemukan');

    // 1. Kasbon Barang
    const kasbonBarangList = db.penjualan.filter((p) => p.idMitra === mitra.id && p.metode === 'KASBON');
    const totalKasbonBarang = kasbonBarangList.reduce((s, p) => s + (p.sisaPiutang || 0), 0);

    // 2. Kasbon Uang
    const kasbonUangList = db.kasbonUang.filter((k) => k.idMitra === mitra.id);
    const totalKasbonUang = kasbonUangList.reduce((s, k) => s + (k.sisaKasbon || 0), 0);

    // 3. Titip Hasil Bumi
    const titipList = db.pembelianHasilBumi.filter(
      (p) => p.idMitra === mitra.id && p.metodePembayaran === 'TITIP' && p.status !== 'LUNAS'
    );
    const totalTitip = titipList.reduce((s, p) => s + p.totalNominal, 0);

    // 4. Pembayaran Bon
    const bayarBonList = db.bayarBon.filter((b) => b.idMitra === mitra.id);
    const totalPembayaranBon = bayarBonList.reduce((s, b) => s + b.nominalBayar, 0);

    const totalBonKeseluruhan = totalKasbonBarang + totalKasbonUang;
    const sisaBon = totalBonKeseluruhan;

    // Timeline ledger transactions
    type TimelineRaw = {
      id: string;
      tanggal: string;
      jam: string;
      createdAt: string;
      jenis: string;
      keterangan: string;
      debet: number; // Bon bertambah
      kredit: number; // Bon berkurang
    };

    const timeline: TimelineRaw[] = [];

    // All sales to this mitra
    for (const p of db.penjualan.filter((item) => item.idMitra === mitra.id)) {
      if (p.metode === 'KASBON') {
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis: 'PENJUALAN KASBON',
          keterangan: `Penjualan Kasbon (${p.items.length} item: ${p.items.map((i) => `${i.namaProduk} x${i.qty}`).join(', ')})`,
          debet: p.totalNominal,
          kredit: 0,
        });
      } else {
        timeline.push({
          id: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam,
          createdAt: p.createdAt,
          jenis: `PENJUALAN ${p.metode}`,
          keterangan: `Penjualan Lunas ${p.metode} via ${p.rekeningTujuan}`,
          debet: 0,
          kredit: 0,
        });
      }
    }

    // Kasbon uang to this mitra
    for (const k of kasbonUangList) {
      timeline.push({
        id: k.idTransaksi,
        tanggal: k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        jenis: 'KASBON UANG',
        keterangan: `Penerimaan Kasbon Uang via ${k.metode} (${k.rekeningSumber}) - ${k.keterangan}`,
        debet: k.nominal,
        kredit: 0,
      });
    }

    // Payments by this mitra
    for (const b of bayarBonList) {
      timeline.push({
        id: b.idTransaksi,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        jenis: 'PEMBAYARAN BON',
        keterangan: `Setoran Bayar Bon via ${b.metode} (${b.rekeningTujuan}) - ${b.keterangan}`,
        debet: 0,
        kredit: b.nominalBayar,
      });
    }

    // Titip pembelian hasil bumi
    for (const pb of db.pembelianHasilBumi.filter((item) => item.idMitra === mitra.id)) {
      if (pb.metodePembayaran === 'TITIP') {
        timeline.push({
          id: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam,
          createdAt: pb.createdAt,
          jenis: 'TITIP HASIL BUMI',
          keterangan: `Penjualan Hasil Bumi ${pb.komoditasNama} ${pb.beratBersih} kg (Titip/Hutang Pabrik)`,
          debet: 0,
          kredit: 0,
        });
      }
    }

    // Sort by createdAt ascending to calculate running balance
    timeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningBon = 0;
    const history = timeline.map((item) => {
      runningBon += item.debet - item.kredit;
      return {
        id: item.id,
        tanggal: item.tanggal,
        jam: item.jam,
        jenis: item.jenis,
        keterangan: item.keterangan,
        debet: item.debet,
        kredit: item.kredit,
        saldoAkumulasi: runningBon,
      };
    });

    return {
      idMitra: mitra.id,
      kodeMitra: mitra.kode,
      namaMitra: mitra.nama,
      role: mitra.role,
      telepon: mitra.telepon,
      alamat: mitra.alamat,
      status: mitra.status,
      totalKasbonBarang,
      totalKasbonUang,
      totalTitip,
      totalPembayaranBon,
      totalBonKeseluruhan,
      sisaBon,
      history,
    };
  }

  // ==========================================
  // 7. DASHBOARD STATS
  // ==========================================
  public static getDashboardStats() {
    const db = dbManager.get();

    // Total omzet penjualan
    const totalPenjualan = db.penjualan.reduce((s, p) => s + p.totalNominal, 0);

    // Total pembelian hasil bumi
    const totalPembelianHasilBumi = db.pembelianHasilBumi.reduce((s, p) => s + p.totalNominal, 0);

    // Saldo kas & bank ril (tidak termasuk virtual BON01 dan TIT01)
    const realAccounts = db.rekening.filter((r) => !r.isVirtual && r.status === 'AKTIF');
    const totalUangPerusahaan = realAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);

    const kasAccount = db.rekening.find((r) => r.kode === 'KAS01');
    const saldoKas = kasAccount ? kasAccount.saldoSaatIni : 0;

    const bankAccounts = realAccounts.filter((r) => r.kode !== 'KAS01');
    const saldoBank = bankAccounts.reduce((s, r) => s + r.saldoSaatIni, 0);

    // Virtual account values
    const bonAcc = db.rekening.find((r) => r.kode === 'BON01');
    const totalBonOutstanding = bonAcc ? bonAcc.saldoSaatIni : 0;

    const titAcc = db.rekening.find((r) => r.kode === 'TIT01');
    const totalTitipOutstanding = titAcc ? titAcc.saldoSaatIni : 0;

    // Kasbon uang aktif
    const totalKasbonUangAktif = db.kasbonUang
      .filter((k) => k.status !== 'LUNAS')
      .reduce((s, k) => s + (k.sisaKasbon || 0), 0);

    // Nilai persediaan stok barang toko (stok * hargaJual)
    const nilaiStokBarang = db.stokBarang.reduce((s, sb) => {
      const prd = db.produk.find((p) => p.kode === sb.kode);
      return s + sb.stok * (prd ? prd.hargaJual : 0);
    }, 0);

    // Total volume stok hasil bumi
    const totalVolumeHasilBumiKg = db.stokHasilBumi.reduce((s, hb) => s + hb.stok, 0);

    // Peringatan stok menipis
    const stokMenipis = db.stokBarang.filter((sb) => sb.stok <= sb.minimum);

    // 10 Transaksi Terakhir (gabungan)
    type RecentTx = {
      id: string;
      tanggal: string;
      jam: string;
      createdAt: string;
      kategori: 'PENJUALAN' | 'PEMBELIAN_HASIL_BUMI' | 'KASBON_UANG' | 'BAYAR_BON' | 'TRANSFER_REKENING' | 'PENGGAJIAN';
      label: string;
      nominal: number;
      pihakTerkait: string;
      rekening: string;
      status: string;
    };

    const recentTx: RecentTx[] = [];

    for (const p of db.penjualan.slice(0, 10)) {
      recentTx.push({
        id: p.noPenjualan,
        tanggal: p.tanggal,
        jam: p.jam,
        createdAt: p.createdAt,
        kategori: 'PENJUALAN',
        label: `Penjualan ${p.metode}`,
        nominal: p.totalNominal,
        pihakTerkait: p.namaMitra,
        rekening: p.rekeningTujuan,
        status: p.statusPembayaran,
      });
    }

    for (const b of db.pembelianHasilBumi.slice(0, 10)) {
      recentTx.push({
        id: b.noPembelian,
        tanggal: b.tanggal,
        jam: b.jam,
        createdAt: b.createdAt,
        kategori: 'PEMBELIAN_HASIL_BUMI',
        label: `Beli ${b.komoditasNama} (${b.beratBersih} kg)`,
        nominal: b.totalNominal,
        pihakTerkait: b.namaMitra,
        rekening: b.rekeningSumber,
        status: b.status,
      });
    }

    for (const k of db.kasbonUang.slice(0, 10)) {
      recentTx.push({
        id: k.idTransaksi,
        tanggal: k.tanggal,
        jam: k.jam,
        createdAt: k.createdAt,
        kategori: 'KASBON_UANG',
        label: `Kasbon Uang (${k.metode})`,
        nominal: k.nominal,
        pihakTerkait: k.namaMitra,
        rekening: k.rekeningSumber,
        status: k.status,
      });
    }

    for (const by of db.bayarBon.slice(0, 10)) {
      recentTx.push({
        id: by.idTransaksi,
        tanggal: by.tanggal,
        jam: by.jam,
        createdAt: by.createdAt,
        kategori: 'BAYAR_BON',
        label: `Bayar Bon (${by.metode})`,
        nominal: by.nominalBayar,
        pihakTerkait: by.namaMitra,
        rekening: by.rekeningTujuan,
        status: 'LUNAS',
      });
    }

    for (const t of db.transferRekening.slice(0, 10)) {
      recentTx.push({
        id: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam,
        createdAt: t.createdAt,
        kategori: 'TRANSFER_REKENING',
        label: `Transfer ${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        nominal: t.nominal,
        pihakTerkait: 'Internal PT Wijaya Agro',
        rekening: `${t.rekeningSumber} -> ${t.rekeningTujuan}`,
        status: t.status,
      });
    }

    if (db.penggajian) {
      for (const g of db.penggajian.slice(0, 10)) {
        recentTx.push({
          id: g.id,
          tanggal: g.tanggal,
          jam: g.jam,
          createdAt: `${g.tanggal} ${g.jam}`,
          kategori: 'PENGGAJIAN',
          label: `Gaji ${g.namaKaryawan} (${g.periodeBulan})`,
          nominal: g.gajiBersihDibayar,
          pihakTerkait: g.namaKaryawan,
          rekening: g.rekeningSumber,
          status: 'SELESAI',
        });
      }
    }

    recentTx.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      totalPenjualan,
      totalPembelianHasilBumi,
      totalUangPerusahaan,
      saldoKas,
      saldoBank,
      totalBonOutstanding,
      totalTitipOutstanding,
      totalKasbonUangAktif,
      nilaiStokBarang,
      totalVolumeHasilBumiKg,
      stokMenipis,
      recentTransactions: recentTx.slice(0, 10),
      rekeningList: db.rekening,
    };
  }
}
