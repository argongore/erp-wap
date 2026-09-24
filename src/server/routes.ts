import { Router } from 'express';
import { dbManager, getWIBDateTime } from './db.ts';
import { TransactionService } from './services/transactionService.ts';
import { DAFTAR_DIVISI } from './types.ts';

export const apiRouter = Router();

// ==========================================
// MASTER REKENING
// ==========================================
apiRouter.get('/rekening', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.rekening });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/rekening', async (req, res) => {
  try {
    const { kode, nama, atasNama, nomorRekening, saldoAwal, keterangan } = req.body;
    if (!kode || !nama || !atasNama) {
      return res.status(400).json({ success: false, message: 'Kode, Nama, dan Atas Nama wajib diisi' });
    }
    const cleanKode = String(kode).toUpperCase().trim();
    if (cleanKode === 'BON01' || cleanKode === 'TIT01') {
      return res.status(400).json({ success: false, message: 'Kode BON01 dan TIT01 adalah reserved kode sistem' });
    }

    const created = await dbManager.executeTransaction((db) => {
      if (db.rekening.some((r) => r.kode === cleanKode)) {
        throw new Error(`Rekening dengan kode ${cleanKode} sudah terdaftar`);
      }
      const saldo = Number(saldoAwal) || 0;
      const newRek: any = {
        kode: cleanKode,
        nama: String(nama).trim(),
        atasNama: String(atasNama).trim(),
        nomorRekening: String(nomorRekening || '-').trim(),
        saldoAwal: saldo,
        saldoSaatIni: saldo,
        status: 'AKTIF',
        isVirtual: false,
        keterangan: keterangan || '',
      };
      db.rekening.push(newRek);
      return newRek;
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/rekening/:kode', async (req, res) => {
  try {
    const kode = req.params.kode.toUpperCase();
    const { nama, atasNama, nomorRekening, status, keterangan } = req.body;

    const updated = await dbManager.executeTransaction((db) => {
      const rek = db.rekening.find((r) => r.kode === kode);
      if (!rek) throw new Error(`Rekening ${kode} tidak ditemukan`);
      if (rek.isVirtual && status && status !== 'AKTIF') {
        throw new Error(`Rekening sistem ${kode} tidak boleh dinonaktifkan`);
      }
      if (nama) rek.nama = nama;
      if (atasNama) rek.atasNama = atasNama;
      if (nomorRekening) rek.nomorRekening = nomorRekening;
      if (status) rek.status = status;
      if (keterangan !== undefined) rek.keterangan = keterangan;
      return rek;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// MASTER MITRA
// ==========================================
apiRouter.get('/mitra', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.mitra });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/mitra', async (req, res) => {
  try {
    const { kode, nama, role, telepon, alamat, catatan } = req.body;
    if (!nama || !role) {
      return res.status(400).json({ success: false, message: 'Nama dan Role mitra wajib diisi' });
    }

    const created = await dbManager.executeTransaction((db) => {
      const cleanKode = kode ? String(kode).toUpperCase().trim() : `MTR${db.mitra.length + 1}`;
      if (db.mitra.some((m) => m.kode === cleanKode)) {
        throw new Error(`Mitra dengan kode ${cleanKode} sudah ada`);
      }
      const newMitra: any = {
        id: `MTR-${Date.now().toString().slice(-4)}`,
        kode: cleanKode,
        nama: String(nama).trim(),
        role,
        telepon: telepon || '-',
        alamat: alamat || '-',
        status: 'AKTIF',
        catatan: catatan || '',
      };
      db.mitra.push(newMitra);
      return newMitra;
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/mitra/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, role, telepon, alamat, status, catatan } = req.body;

    const updated = await dbManager.executeTransaction((db) => {
      const mitra = db.mitra.find((m) => m.id === id);
      if (!mitra) throw new Error(`Mitra dengan ID ${id} tidak ditemukan`);
      if (nama) mitra.nama = nama;
      if (role) mitra.role = role;
      if (telepon) mitra.telepon = telepon;
      if (alamat) mitra.alamat = alamat;
      if (status) mitra.status = status;
      if (catatan !== undefined) mitra.catatan = catatan;
      return mitra;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// MASTER PRODUK & STOK
// ==========================================
apiRouter.get('/produk', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.produk });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/produk', async (req, res) => {
  try {
    const { kode, kategori, nama, satuan, hargaBeli, hargaJual, stokAwal, minimum } = req.body;
    if (!kode || !nama || !satuan || hargaJual === undefined) {
      return res.status(400).json({ success: false, message: 'Kode, nama, satuan, dan harga jual wajib diisi' });
    }

    const { iso } = getWIBDateTime();
    const cleanKode = String(kode).toUpperCase().trim();

    const created = await dbManager.executeTransaction((db) => {
      if (db.produk.some((p) => p.kode === cleanKode)) {
        throw new Error(`Produk dengan kode ${cleanKode} sudah terdaftar`);
      }
      const newProd: any = {
        kode: cleanKode,
        kategori: kategori || 'LAINNYA',
        nama: String(nama).trim(),
        satuan: String(satuan).trim(),
        hargaBeli: Number(hargaBeli) || 0,
        hargaJual: Number(hargaJual) || 0,
        status: 'AKTIF',
      };
      db.produk.push(newProd);

      const newStok: any = {
        kode: cleanKode,
        namaProduk: newProd.nama,
        satuan: newProd.satuan,
        stok: Number(stokAwal) || 0,
        minimum: Number(minimum) || 5,
        updateTerakhir: iso,
      };
      db.stokBarang.push(newStok);

      return { produk: newProd, stok: newStok };
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/stok', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.stokBarang });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/stok/adjust', async (req, res) => {
  try {
    const { kode, penyesuaianQty, alasan } = req.body;
    const { tanggal, jam, iso } = getWIBDateTime();

    const result = await dbManager.executeTransaction((db) => {
      const stokItem = db.stokBarang.find((s) => s.kode === kode);
      if (!stokItem) throw new Error('Item stok tidak ditemukan');
      const qty = Number(penyesuaianQty);
      if (isNaN(qty)) throw new Error('Qty penyesuaian tidak valid');
      if (stokItem.stok + qty < 0) {
        throw new Error(`Stok tidak boleh menjadi negatif. Stok saat ini: ${stokItem.stok}`);
      }
      const stokSebelum = stokItem.stok;
      stokItem.stok += qty;
      stokItem.updateTerakhir = iso;

      db.auditLogs.unshift({
        id: `LOG-STOK-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Gudang Kasir',
        jenisTransaksi: 'UPDATE',
        idTransaksi: `ADJ-${kode}`,
        detail: `Penyesuaian stok ${stokItem.namaProduk}: ${stokSebelum} -> ${stokItem.stok} (${qty > 0 ? '+' : ''}${qty}). Alasan: ${alasan || 'Koreksi fisik'}`,
        nominal: 0,
      });

      return stokItem;
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// STOK HASIL BUMI
// ==========================================
apiRouter.get('/stok-hasil-bumi', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.stokHasilBumi });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// TRANSAKSI KASIR
// ==========================================
apiRouter.post('/transaksi/penjualan', async (req, res) => {
  try {
    const record = await TransactionService.processPenjualan(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/penjualan', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.penjualan });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/pembelian-hasil-bumi', async (req, res) => {
  try {
    const record = await TransactionService.processPembelianHasilBumi(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/pembelian-hasil-bumi', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.pembelianHasilBumi });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/kasbon-uang', async (req, res) => {
  try {
    const record = await TransactionService.processKasbonUang(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/kasbon-uang', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.kasbonUang });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/bayar-bon', async (req, res) => {
  try {
    const record = await TransactionService.processBayarBon(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/bayar-bon', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.bayarBon });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/transfer-rekening', async (req, res) => {
  try {
    const record = await TransactionService.processTransferRekening(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/transfer-rekening', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.transferRekening });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// REKENING KORAN MITRA & DASHBOARD
// ==========================================
apiRouter.get('/rekening-koran-mitra/:id', (req, res) => {
  try {
    const summary = TransactionService.getRekeningKoranMitra(req.params.id);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/dashboard', (req, res) => {
  try {
    const stats = TransactionService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/audit-logs', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.auditLogs });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// MASTER KARYAWAN & PENGGAJIAN
// ==========================================
apiRouter.get('/karyawan', (req, res) => {
  try {
    const db = dbManager.get();
    const list = (db.karyawan || []).map((k) => {
      const mitraId = k.idMitraTerkait || `MTR-${k.id}`;
      const outstandingBarang = db.penjualan
        .filter((p) => p.idMitra === mitraId && p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR')
        .reduce((sum, p) => sum + (p.sisaPiutang || 0), 0);

      const outstandingUang = db.kasbonUang
        .filter((ku) => ku.idMitra === mitraId && ku.status !== 'LUNAS')
        .reduce((sum, ku) => sum + (ku.sisaKasbon || 0), 0);

      return {
        ...k,
        kasbonBarang: outstandingBarang,
        kasbonUang: outstandingUang,
        totalKasbonAktif: outstandingBarang + outstandingUang,
      };
    });
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/karyawan', async (req, res) => {
  try {
    const { nik, nama, jabatan, departemen, gajiPokok, tunjanganTetap, telepon, alamat, tanggalMasuk, catatan } = req.body;
    if (!nama || !jabatan) {
      return res.status(400).json({ success: false, message: 'Nama dan Jabatan karyawan wajib diisi' });
    }

    const created = await dbManager.executeTransaction((db) => {
      if (!db.karyawan) db.karyawan = [];
      const cleanNik = nik ? String(nik).trim().toUpperCase() : `KRY-${String(db.karyawan.length + 1).padStart(3, '0')}`;
      if (db.karyawan.some((k) => k.nik === cleanNik)) {
        throw new Error(`Karyawan dengan NIK ${cleanNik} sudah terdaftar`);
      }

      const id = `KRY-${Date.now().toString().slice(-4)}`;
      const idMitra = `MTR-${id}`;

      const newKaryawan: any = {
        id,
        nik: cleanNik,
        nama: String(nama).trim(),
        jabatan: String(jabatan).trim(),
        departemen: String(departemen || 'Operasional').trim(),
        gajiPokok: Math.max(0, Number(gajiPokok) || 0),
        tunjanganTetap: Math.max(0, Number(tunjanganTetap) || 0),
        telepon: telepon || '-',
        alamat: alamat || '-',
        tanggalMasuk: tanggalMasuk || getWIBDateTime().tanggal,
        status: 'AKTIF',
        idMitraTerkait: idMitra,
        catatan: catatan || '',
      };

      db.karyawan.push(newKaryawan);

      // Otomatis buat entitas Mitra terkait dengan role KARYAWAN
      db.mitra.push({
        id: idMitra,
        kode: cleanNik,
        nama: `${newKaryawan.nama} (Karyawan)`,
        role: 'KARYAWAN',
        telepon: newKaryawan.telepon,
        alamat: newKaryawan.alamat,
        status: 'AKTIF',
        catatan: `Karyawan: ${newKaryawan.jabatan} (${newKaryawan.departemen})`,
      });

      return newKaryawan;
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/karyawan/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, jabatan, departemen, gajiPokok, tunjanganTetap, telepon, alamat, status, catatan } = req.body;

    const updated = await dbManager.executeTransaction((db) => {
      const kry = db.karyawan.find((k) => k.id === id);
      if (!kry) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);

      if (nama) kry.nama = String(nama).trim();
      if (jabatan) kry.jabatan = String(jabatan).trim();
      if (departemen) kry.departemen = String(departemen).trim();
      if (gajiPokok !== undefined) kry.gajiPokok = Math.max(0, Number(gajiPokok) || 0);
      if (tunjanganTetap !== undefined) kry.tunjanganTetap = Math.max(0, Number(tunjanganTetap) || 0);
      if (telepon) kry.telepon = telepon;
      if (alamat) kry.alamat = alamat;
      if (status) kry.status = status;
      if (catatan !== undefined) kry.catatan = catatan;

      // Sync ke entitas Mitra
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const mtr = db.mitra.find((m) => m.id === mitraId || m.kode === kry.nik);
      if (mtr) {
        mtr.nama = `${kry.nama} (Karyawan)`;
        mtr.telepon = kry.telepon;
        mtr.alamat = kry.alamat;
        mtr.status = kry.status;
        mtr.catatan = `Karyawan: ${kry.jabatan} (${kry.departemen})`;
      }

      return kry;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/karyawan/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await dbManager.executeTransaction((db) => {
      const kry = db.karyawan.find((k) => k.id === id);
      if (!kry) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);
      kry.status = kry.status === 'AKTIF' ? 'NONAKTIF' : 'AKTIF';

      // Sync status mitra
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const mtr = db.mitra.find((m) => m.id === mitraId || m.kode === kry.nik);
      if (mtr) {
        mtr.status = kry.status;
      }
      return kry;
    });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/penggajian', async (req, res) => {
  try {
    const record = await TransactionService.processPenggajian(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/penggajian/batch', async (req, res) => {
  try {
    const records = await TransactionService.processBatchPenggajianHarian(req.body);
    res.json({ success: true, data: records });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/penggajian', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.penggajian || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// DIVISI & PERGERAKAN KEUANGAN DIVISI
// ==========================================
apiRouter.get('/divisi', (_req, res) => {
  try {
    res.json({ success: true, data: DAFTAR_DIVISI });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/divisi/keuangan', (_req, res) => {
  try {
    const data = TransactionService.getPergerakanKeuanganDivisi();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
