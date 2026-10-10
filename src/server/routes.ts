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
    const { nama, atasNama, nomorRekening, status, keterangan, saldoSaatIni, saldoAwal, alasanPenyesuaian } = req.body;

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

      // Update Saldo Fleksibel
      if (saldoSaatIni !== undefined && !isNaN(Number(saldoSaatIni))) {
        const oldSaldo = rek.saldoSaatIni;
        const newSaldo = Number(saldoSaatIni);
        rek.saldoSaatIni = newSaldo;

        if (saldoAwal !== undefined && !isNaN(Number(saldoAwal))) {
          rek.saldoAwal = Number(saldoAwal);
        }

        const { iso, tanggal, jam } = getWIBDateTime();
        db.auditLogs.unshift({
          id: `AUDIT-${Date.now().toString().slice(-6)}`,
          timestamp: iso,
          tanggal,
          jam,
          user: 'Admin Keuangan',
          jenisTransaksi: 'UPDATE',
          idTransaksi: rek.kode,
          detail: `Penyesuaian Saldo Rekening ${rek.nama} (${rek.kode}): Rp ${oldSaldo.toLocaleString('id-ID')} -> Rp ${newSaldo.toLocaleString('id-ID')}${alasanPenyesuaian ? ` (${alasanPenyesuaian})` : ''}`,
          nominal: Math.abs(newSaldo - oldSaldo),
          rekeningTerkait: rek.kode,
        });
      }

      return rek;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Update Saldo Fleksibel Rekening Langsung
apiRouter.post('/rekening/:kode/update-saldo', async (req, res) => {
  try {
    const kode = req.params.kode.toUpperCase();
    const { saldoBaru, updateSaldoAwal, alasan } = req.body;

    if (saldoBaru === undefined || isNaN(Number(saldoBaru))) {
      throw new Error('Nominal saldo baru harus berupa angka valid');
    }

    const updated = await dbManager.executeTransaction((db) => {
      const rek = db.rekening.find((r) => r.kode === kode);
      if (!rek) throw new Error(`Rekening ${kode} tidak ditemukan`);

      const oldSaldo = rek.saldoSaatIni;
      const numSaldo = Number(saldoBaru);
      rek.saldoSaatIni = numSaldo;

      if (updateSaldoAwal) {
        rek.saldoAwal = numSaldo;
      }

      const { iso, tanggal, jam } = getWIBDateTime();
      db.auditLogs.unshift({
        id: `AUDIT-${Date.now().toString().slice(-6)}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin Keuangan',
        jenisTransaksi: 'UPDATE',
        idTransaksi: rek.kode,
        detail: `Pembaruan Nominal Saldo Fleksibel Rekening ${rek.nama} (${rek.kode}): Rp ${oldSaldo.toLocaleString('id-ID')} -> Rp ${numSaldo.toLocaleString('id-ID')}${alasan ? ` (Catatan: ${alasan})` : ''}`,
        nominal: Math.abs(numSaldo - oldSaldo),
        rekeningTerkait: rek.kode,
      });

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
apiRouter.get('/mitra', (_req, res) => {
  try {
    const db = dbManager.get();
    // Auto-heal / synchronize employees to mitra list with role KARYAWAN
    let modified = false;
    for (const kry of db.karyawan || []) {
      const idMitra = kry.idMitraTerkait || `MTR-${kry.id}`;
      const existing = db.mitra.find((m) => m.id === idMitra || m.kode === kry.nik);
      if (!existing) {
        db.mitra.push({
          id: idMitra,
          kode: kry.nik,
          nama: `${kry.nama} (Karyawan)`,
          role: 'KARYAWAN',
          telepon: kry.telepon,
          alamat: kry.alamat,
          status: kry.status,
          catatan: `Karyawan: ${kry.jabatan} (${kry.departemen})`,
        });
        modified = true;
      }
    }
    if (modified) {
      dbManager.save();
    }
    res.json({ success: true, data: db.mitra });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/mitra/rekap', (_req, res) => {
  try {
    const rekap = TransactionService.getRekapMasterMitra();
    res.json({ success: true, data: rekap });
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

apiRouter.post('/stok-hasil-bumi', async (req, res) => {
  try {
    const { kode, nama, satuan, hargaBeliStandar } = req.body;
    if (!nama) {
      return res.status(400).json({ success: false, message: 'Nama komoditas hasil bumi wajib diisi' });
    }
    const { iso } = getWIBDateTime();
    const created = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      const cleanKode = kode ? String(kode).trim().toUpperCase() : `HB-${Date.now().toString().slice(-4)}`;
      if (db.stokHasilBumi.some((h) => h.kode === cleanKode)) {
        throw new Error(`Komoditas dengan kode ${cleanKode} sudah terdaftar`);
      }
      const newKomoditas = {
        kode: cleanKode,
        nama: String(nama).trim(),
        satuan: String(satuan || 'Kg').trim(),
        stok: 0,
        hargaBeliStandar: Math.max(0, Number(hargaBeliStandar) || 0),
        updateTerakhir: iso,
      };
      db.stokHasilBumi.push(newKomoditas);
      return newKomoditas;
    });
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Penyesuaian Saldo Awal & Rekap Manual Pembelian Lalu untuk Hasil Bumi
apiRouter.post('/stok-hasil-bumi/saldo-awal', async (req, res) => {
  try {
    const { kode, stokAwal, rataRataModalAwal, modalAwalTotal, keterangan, items } = req.body;
    const { iso, tanggal, jam } = getWIBDateTime();

    const result = await dbManager.executeTransaction((db) => {
      const listToUpdate: Array<{
        kode: string;
        stokAwal: number;
        rataRataModalAwal: number;
        modalAwalTotal?: number;
        keterangan?: string;
      }> = Array.isArray(items)
        ? items
        : [{ kode, stokAwal, rataRataModalAwal, modalAwalTotal, keterangan }];

      const updatedResults: any[] = [];

      for (const item of listToUpdate) {
        if (!item.kode) continue;
        const hb = db.stokHasilBumi.find((h) => h.kode === item.kode);
        if (!hb) {
          throw new Error(`Komoditas dengan kode ${item.kode} tidak ditemukan`);
        }

        const validStokAwal = Math.max(0, Number(item.stokAwal) || 0);
        const validRataRata = Math.max(0, Number(item.rataRataModalAwal) || 0);
        const validModalTotal =
          Number(item.modalAwalTotal) > 0
            ? Number(item.modalAwalTotal)
            : Math.round(validStokAwal * validRataRata);

        // Hitung total pembelian berjalan menggunakan aplikasi
        const pembelianBerjalanKg = db.pembelianHasilBumi
          .filter((p) => p.komoditasKode === item.kode)
          .reduce((sum, p) => sum + (p.beratBersih || 0), 0);

        // Update saldo awal dan akumulasi modal lama
        hb.stokAwal = validStokAwal;
        hb.rataRataModalAwal = validRataRata;
        hb.modalAwalTotal = validModalTotal;
        hb.keteranganStokAwal = item.keterangan?.trim() || 'Rekap stok manual lama sebelum aplikasi';
        hb.tanggalInputStokAwal = `${tanggal} ${jam}`;

        // Stok fisik gudang = Stok Awal Lama + Pembelian Baru Berjalan
        hb.stok = validStokAwal + pembelianBerjalanKg;
        hb.updateTerakhir = iso;

        db.auditLogs.unshift({
          id: `AUDIT-${Date.now().toString().slice(-6)}`,
          timestamp: iso,
          tanggal,
          jam,
          user: 'Admin Gudang',
          jenisTransaksi: 'UPDATE',
          idTransaksi: hb.kode,
          detail: `Input Rekap Manual Lalu: Stok Awal ${validStokAwal} Kg @ Rp ${validRataRata.toLocaleString('id-ID')}/Kg untuk ${hb.nama}`,
          nominal: validModalTotal,
        });

        updatedResults.push(hb);
      }

      return updatedResults;
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
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

// Pembelian Barang Dagang (Kulakan Beras & Stok Toko)
apiRouter.post('/transaksi/pembelian-barang', async (req, res) => {
  try {
    const record = await TransactionService.processPembelianBarang(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/pembelian-barang', (req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.pembelianBarang || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Laporan Laba Rugi Produk Penjualan
apiRouter.get('/laporan/laba-rugi-produk', (_req, res) => {
  try {
    const summary = TransactionService.getLabaRugiSummary();
    res.json({ success: true, data: summary });
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

apiRouter.post('/transaksi/pembelian-hasil-bumi/putus-harga', async (req, res) => {
  try {
    const record = await TransactionService.putusHargaHasilBumi(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
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

// Input Saldo Awal / Nota Lalu Mitra (Piutang Barang Masa Lalu & Titipan Uang/Panen)
apiRouter.post('/transaksi/nota-lalu', async (req, res) => {
  try {
    const result = await TransactionService.processInputNotaLalu(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
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

apiRouter.get('/karyawan/rekap', (_req, res) => {
  try {
    const rekap = TransactionService.getRekapMasterKaryawan();
    res.json({ success: true, data: rekap });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/karyawan/upah-harian', (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.upahHarian || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/karyawan/kerja-harian', async (req, res) => {
  try {
    const result = await TransactionService.recordKerjaHarian(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/karyawan/kerja-harian/:id', async (req, res) => {
  try {
    const result = await TransactionService.updateKerjaHarian(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/karyawan/kerja-harian/:id', async (req, res) => {
  try {
    const result = await TransactionService.deleteKerjaHarian(req.params.id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/karyawan/kerja-harian/batch', async (req, res) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) throw new Error('Format data batch harus berupa array rows');
    const results = [];
    for (const r of rows) {
      const resRow = await TransactionService.recordKerjaHarian(r);
      results.push(resRow);
    }
    res.json({ success: true, data: results, count: results.length });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/karyawan/:id/detail-harian', (req, res) => {
  try {
    const detail = TransactionService.getDetailHarianKaryawan(req.params.id);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/karyawan/:id/settle-gaji', async (req, res) => {
  try {
    const record = await TransactionService.settleHakUpahKaryawan({
      ...req.body,
      idKaryawan: req.params.id,
    });
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
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

apiRouter.delete('/karyawan/:id/permanent', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.karyawan)) db.karyawan = [];
      const idx = db.karyawan.findIndex((k) => k.id === id);
      if (idx === -1) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);
      const kry = db.karyawan[idx];
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;

      // Hapus dari list karyawan
      db.karyawan.splice(idx, 1);

      // Hapus entitas mitra terkait
      if (Array.isArray(db.mitra)) {
        const mIdx = db.mitra.findIndex((m) => m.id === mitraId || m.kode === kry.nik);
        if (mIdx !== -1) {
          db.mitra.splice(mIdx, 1);
        }
      }

      // Hapus catatan upah harian terkait
      if (Array.isArray(db.upahHarian)) {
        db.upahHarian = db.upahHarian.filter((u) => u.idKaryawan !== id);
      }

      return true;
    });
    res.json({ success: true, data: result });
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

apiRouter.get('/transaksi/upah-harian', (req, res) => {
  try {
    const db = dbManager.get();
    let list = db.upahHarian || [];
    const { idKaryawan, divisi, bulan, tahun } = req.query;
    if (idKaryawan) {
      list = list.filter((u) => u.idKaryawan === idKaryawan);
    }
    if (divisi && divisi !== 'ALL') {
      list = list.filter((u) => u.divisi === divisi);
    }
    if (bulan && tahun) {
      const bNum = Number(bulan);
      const tNum = Number(tahun);
      list = list.filter((u) => {
        const parts = (u.tanggalKerja || '').split('/');
        return parts.length >= 3 && Number(parts[1]) === bNum && Number(parts[2]) === tNum;
      });
    }
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/payroll/rekap-bulanan', (req, res) => {
  try {
    const bulan = req.query.bulan ? Number(req.query.bulan) : undefined;
    const tahun = req.query.tahun ? Number(req.query.tahun) : undefined;
    const divisi = req.query.divisi ? String(req.query.divisi) : undefined;
    const rekap = TransactionService.getRekapBulananPayroll({ bulan, tahun, divisi });
    res.json({ success: true, data: rekap });
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

// ==========================================
// BILLBOARD / LIVE COMMAND CENTER MONITORING
// ==========================================
apiRouter.get('/billboard', (_req, res) => {
  try {
    const db = dbManager.get();
    const { tanggal: todayTanggal } = getWIBDateTime();

    // 1. Calculations for Today's Real Cashflow
    let uangMasukHariIni = 0;
    let uangKeluarHariIni = 0;

    // Penjualan toko hari ini
    const penjualanHariIni = (db.penjualan || []).filter((p) => p.tanggal === todayTanggal);
    for (const p of penjualanHariIni) {
      if (p.metode === 'TUNAI' || p.metode === 'TRANSFER') {
        uangMasukHariIni += p.totalNominal;
      }
    }

    // Pembayaran kasbon (Bayar Bon) hari ini
    const bayarBonHariIni = (db.bayarBon || []).filter((b) => b.tanggal === todayTanggal);
    for (const b of bayarBonHariIni) {
      uangMasukHariIni += b.nominalBayar;
    }

    // Pembelian hasil bumi hari ini (uang keluar ke petani)
    const pembelianHariIni = (db.pembelianHasilBumi || []).filter((pb) => pb.tanggal === todayTanggal);
    for (const pb of pembelianHariIni) {
      if (pb.metodePembayaran === 'TUNAI' || pb.metodePembayaran === 'TRANSFER') {
        uangKeluarHariIni += pb.totalNominal;
      }
    }

    // Kasbon uang hari ini (uang keluar ke mitra)
    const kasbonHariIni = (db.kasbonUang || []).filter((k) => k.tanggal === todayTanggal);
    for (const k of kasbonHariIni) {
      uangKeluarHariIni += k.nominal;
    }

    // Penggajian / Upah cair hari ini (uang keluar)
    const gajiHariIni = (db.penggajian || []).filter(
      (g) => g.tanggal === todayTanggal || g.tanggalKerja === todayTanggal
    );
    for (const g of gajiHariIni) {
      uangKeluarHariIni += g.gajiBersihDibayar || 0;
    }

    // Fallback display if today is morning or early demo: compute active total recent movement
    if (uangMasukHariIni === 0 && uangKeluarHariIni === 0) {
      const recentSales = (db.penjualan || []).slice(0, 5);
      const recentBuys = (db.pembelianHasilBumi || []).slice(0, 5);
      uangMasukHariIni = recentSales.reduce((sum, s) => sum + (s.metode !== 'KASBON' ? s.totalNominal : 0), 0);
      uangKeluarHariIni = recentBuys.reduce((sum, b) => sum + (b.metodePembayaran !== 'TITIP' ? b.totalNominal : 0), 0);
    }

    // Real Company Balances
    const kas01 = db.rekening.find((r) => r.kode === 'KAS01');
    const bankAccounts = db.rekening.filter(
      (r) =>
        (r.kategori === 'PERUSAHAAN' || (!r.isVirtual && !r.kode.startsWith('REK-'))) &&
        r.kode !== 'KAS01' &&
        r.status === 'AKTIF'
    );
    const totalBank = bankAccounts.reduce((sum, r) => sum + r.saldoSaatIni, 0);
    const bon01 = db.rekening.find((r) => r.kode === 'BON01');
    const tit01 = db.rekening.find((r) => r.kode === 'TIT01');

    // 2. Division status
    const divisiKeuangan = TransactionService.getPergerakanKeuanganDivisi();

    // 3. Employee Jobs Today ("karyawan ini sedang bekerja untuk apa")
    const upahList = (db.upahHarian || []).slice(0, 30);
    const karyawanMap = new Map(db.karyawan.map((k) => [k.id, k]));

    const activeJobs = upahList.map((u) => {
      const kry = karyawanMap.get(u.idKaryawan);
      return {
        id: u.id,
        idKaryawan: u.idKaryawan,
        nik: u.nikKaryawan || kry?.nik || u.idKaryawan,
        namaKaryawan: u.namaKaryawan || kry?.nama || 'Karyawan',
        jabatan: u.jabatan || kry?.jabatan || '-',
        divisi: u.divisi,
        tugasPekerjaan: u.keterangan || `Operasional tugas harian di unit ${u.divisi}`,
        tanggalKerja: u.tanggalKerja,
        upahHarian: u.upahHarian,
        uangMakanLembur: u.uangMakanLembur,
        totalUpah: u.totalUpahHarian,
        status: u.status,
      };
    });

    // 4. Live Feed of System Mutations
    const liveFeed = (db.auditLogs || []).slice(0, 25).map((log) => ({
      id: log.id,
      timestamp: log.timestamp,
      tanggal: log.tanggal,
      jam: log.jam,
      user: log.user,
      jenis: log.jenisTransaksi,
      nominal: log.nominal,
      rekeningTerkait: log.rekeningTerkait || '-',
      detail: log.detail,
    }));

    // 5. Commodity Stock Volume
    const stokKomoditas = (db.stokHasilBumi || []).map((hb) => ({
      kode: hb.kode,
      nama: hb.nama,
      totalKg: hb.stok,
      totalTon: (hb.stok / 1000).toFixed(2),
      satuan: hb.satuan,
      hargaStandar: hb.hargaBeliStandar,
    }));

    res.json({
      success: true,
      data: {
        todayDate: todayTanggal,
        cashflow: {
          masuk: uangMasukHariIni,
          keluar: uangKeluarHariIni,
          net: uangMasukHariIni - uangKeluarHariIni,
          kasKasir: kas01?.saldoSaatIni || 0,
          totalBank,
          totalKasDanBank: (kas01?.saldoSaatIni || 0) + totalBank,
          piutangBon: bon01?.saldoSaatIni || 0,
          titipHasilBumi: tit01?.saldoSaatIni || 0,
        },
        divisiList: divisiKeuangan,
        karyawanJobs: activeJobs,
        liveFeed,
        stokKomoditas,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reset / Kosongkan Data (Supplier, Karyawan, Barang Toko, Hasil Bumi)
apiRouter.post('/database/reset-clean', async (_req, res) => {
  try {
    await dbManager.resetCleanData();
    res.json({
      success: true,
      message: 'Database berhasil dikosongkan: Data supplier, karyawan, barang toko, dan hasil bumi telah dibersihkan dan siap untuk input data asli.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

