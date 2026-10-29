import { Router } from 'express';
import { dbManager, getWIBDateTime } from './db.ts';
import { TransactionService } from './services/transactionService.ts';
import { DAFTAR_DIVISI } from './types.ts';
import { supabaseSyncEngine } from './supabase.ts';

export const apiRouter = Router();

function parseNominalInput(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  // Support direct numeric strings ("25000000", "-500000", "25000000.5")
  // as well as Indonesian thousand-dot formatting ("Rp 25.000.000", "-500.000")
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const direct = Number(str);
    return Number.isFinite(direct) ? direct : null;
  }
  const isNegative = str.startsWith('-') || str.includes('-');
  const cleaned = str
    .replace(/[^0-9,]/g, '')
    .replace(/,/g, '.');
  if (!cleaned) return 0;
  const parsed = Number(cleaned) * (isNegative ? -1 : 1);
  return Number.isFinite(parsed) ? parsed : null;
}

// ==========================================
// MASTER REKENING
// ==========================================
apiRouter.get('/rekening', (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.rekening });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/rekening', async (req, res) => {
  try {
    const {
      kode,
      nama,
      atasNama,
      nomorRekening,
      saldoAwal,
      keterangan,
      kategori,
      rekeningIndukPenyimpan,
      idMitraTerkait,
    } = req.body;
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
      const parsedSaldo = parseNominalInput(saldoAwal);
      const saldo = parsedSaldo !== null ? parsedSaldo : 0;
      const finalKategori =
        kategori === 'ANAK_PERUSAHAAN' || kategori === 'OPERASIONAL_DIVISI' || kategori === 'PERUSAHAAN'
          ? kategori
          : 'PERUSAHAAN';
      const isAnak = finalKategori === 'ANAK_PERUSAHAAN';
      const newRek: any = {
        kode: cleanKode,
        nama: String(nama).trim(),
        atasNama: String(atasNama).trim(),
        nomorRekening: String(nomorRekening || '-').trim(),
        saldoAwal: saldo,
        saldoSaatIni: saldo,
        status: 'AKTIF',
        isVirtual: false,
        isAnakPerusahaan: isAnak,
        idMitraTerkait: isAnak ? idMitraTerkait : undefined,
        kategori: finalKategori,
        rekeningIndukPenyimpan: finalKategori === 'OPERASIONAL_DIVISI' ? (rekeningIndukPenyimpan || 'KAS01') : undefined,
        keterangan:
          keterangan ||
          (isAnak
            ? 'Anak Perusahaan PT. Wijaya Agro Perkasa (Bukan Bank) — Terintegrasi otomatis sebagai Mitra dalam 1 transaksi terpadu'
            : ''),
      };
      db.rekening.push(newRek);
      return newRek;
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

async function handleUpdateRekeningRequest(rawKode: string, body: any) {
  const kode = decodeURIComponent(String(rawKode || '')).toUpperCase().trim();
  if (!kode) {
    throw new Error('Kode rekening wajib disertakan');
  }

  const {
    nama,
    atasNama,
    nomorRekening,
    status,
    keterangan,
    kategori,
    rekeningIndukPenyimpan,
    saldoSaatIni,
    saldoAwal,
    alasanPenyesuaian,
  } = body || {};

  return await dbManager.executeTransaction((db) => {
    const rek = db.rekening.find((r) => r.kode.toUpperCase() === kode);
    if (!rek) throw new Error(`Rekening ${kode} tidak ditemukan`);
    if (rek.isVirtual && status && status !== 'AKTIF') {
      throw new Error(`Rekening sistem ${kode} tidak boleh dinonaktifkan`);
    }
    if (nama) rek.nama = String(nama).trim();
    if (atasNama) rek.atasNama = String(atasNama).trim();
    if (nomorRekening !== undefined) rek.nomorRekening = String(nomorRekening).trim();
    if (status) rek.status = status;
    if (keterangan !== undefined) rek.keterangan = keterangan;
    if (!rek.isVirtual && kategori) {
      rek.kategori = kategori;
      rek.isAnakPerusahaan = kategori === 'ANAK_PERUSAHAAN';
      if (kategori === 'OPERASIONAL_DIVISI') {
        rek.rekeningIndukPenyimpan = rekeningIndukPenyimpan || rek.rekeningIndukPenyimpan || 'KAS01';
      } else {
        delete rek.rekeningIndukPenyimpan;
      }
    }

    // Sinkronkan nama ke Mitra terkait apabila rekening adalah Anak Perusahaan
    if (rek.isAnakPerusahaan && rek.idMitraTerkait && nama) {
      const linkedMitra = db.mitra.find((m) => m.id === rek.idMitraTerkait);
      if (linkedMitra) {
        linkedMitra.nama = rek.nama;
        linkedMitra.status = rek.status;
        rek.namaMitraTerkait = linkedMitra.nama;
      }
    }

    // Update Saldo Fleksibel
    const parsedSaldoSaatIni = parseNominalInput(saldoSaatIni);
    const parsedSaldoAwal = parseNominalInput(saldoAwal);

    if (parsedSaldoSaatIni !== null) {
      if (rek.isVirtual || rek.kode === 'BON01' || rek.kode === 'TIT01' || rek.kode === 'SINKRON') {
        throw new Error(
          `Saldo rekening sistem ${rek.kode} dihitung otomatis dari transaksi piutang kasbon, titipan, & sinkronisasi potong bon.`
        );
      }
      const oldSaldo = rek.saldoSaatIni;
      rek.saldoSaatIni = parsedSaldoSaatIni;

      if (parsedSaldoAwal !== null) {
        rek.saldoAwal = parsedSaldoAwal;
      } else if (rek.kategori === 'OPERASIONAL_DIVISI') {
        rek.saldoAwal = Math.round((Number(rek.saldoAwal) || 0) + (parsedSaldoSaatIni - oldSaldo));
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
        detail: `Penyesuaian Saldo Rekening ${rek.nama} (${rek.kode}): Rp ${oldSaldo.toLocaleString('id-ID')} -> Rp ${parsedSaldoSaatIni.toLocaleString('id-ID')}${alasanPenyesuaian ? ` (${alasanPenyesuaian})` : ''}`,
        nominal: Math.abs(parsedSaldoSaatIni - oldSaldo),
        rekeningTerkait: rek.kode,
      });
    } else if (parsedSaldoAwal !== null && !rek.isVirtual) {
      rek.saldoAwal = parsedSaldoAwal;
    }

    return rek;
  });
}

async function handleUpdateSaldoRekeningRequest(rawKode: string, body: any) {
  const kode = decodeURIComponent(String(rawKode || '')).toUpperCase().trim();
  if (!kode) {
    throw new Error('Kode rekening wajib dipilih');
  }

  const { saldoBaru, saldoAwalBaru, updateSaldoAwal, alasan } = body || {};
  const numSaldo = parseNominalInput(saldoBaru);
  if (numSaldo === null) {
    throw new Error('Nominal saldo baru harus berupa angka yang valid');
  }

  return await dbManager.executeTransaction((db) => {
    const rek = db.rekening.find((r) => r.kode.toUpperCase() === kode);
    if (!rek) throw new Error(`Rekening ${kode} tidak ditemukan`);
    if (rek.isVirtual || rek.kode === 'BON01' || rek.kode === 'TIT01' || rek.kode === 'SINKRON') {
      throw new Error(
        `Saldo rekening sistem ${rek.kode} dihitung otomatis dari transaksi piutang kasbon, titipan, & sinkronisasi potong bon.`
      );
    }

    const oldSaldo = rek.saldoSaatIni;
    rek.saldoSaatIni = numSaldo;

    const explicitSaldoAwal = parseNominalInput(saldoAwalBaru);
    if (explicitSaldoAwal !== null) {
      rek.saldoAwal = explicitSaldoAwal;
    } else if (rek.kategori === 'OPERASIONAL_DIVISI') {
      rek.saldoAwal = Math.round((Number(rek.saldoAwal) || 0) + (numSaldo - oldSaldo));
    } else if (updateSaldoAwal) {
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
}

// Body-based endpoints (immune to special characters / slashes / proxy URL decoding)
apiRouter.post('/rekening/update-saldo', async (req, res) => {
  try {
    const updated = await handleUpdateSaldoRekeningRequest(req.body?.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/rekening/update', async (req, res) => {
  try {
    const updated = await handleUpdateRekeningRequest(req.body?.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/rekening/update', async (req, res) => {
  try {
    const updated = await handleUpdateRekeningRequest(req.body?.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Path-param endpoints (preserved for backwards compatibility)
apiRouter.put('/rekening/:kode', async (req, res) => {
  try {
    const updated = await handleUpdateRekeningRequest(req.params.kode, req.body);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/rekening/:kode/update-saldo', async (req, res) => {
  try {
    const updated = await handleUpdateSaldoRekeningRequest(req.params.kode, req.body);
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
      const existing = db.mitra.find((m) => m.id === idMitra || m.kode === kry.nik || (m.role === 'KARYAWAN' && m.nama.toLowerCase() === kry.nama.toLowerCase()));
      if (!existing) {
        db.mitra.push({
          id: idMitra,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: 'KARYAWAN',
          telepon: kry.telepon || '-',
          alamat: kry.alamat || '-',
          status: kry.status || 'AKTIF',
          catatan: `Karyawan: ${kry.jabatan || 'Staff'} (Divisi ${kry.divisi || kry.departemen || 'Gudang'})`,
        });
        modified = true;
      } else {
        // Ensure clean matching name and role
        if (existing.nama.endsWith(' (Karyawan)')) {
          existing.nama = kry.nama;
          modified = true;
        }
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
      if (nama) mitra.nama = String(nama).trim();
      if (role) mitra.role = role;
      if (telepon) mitra.telepon = telepon;
      if (alamat) mitra.alamat = alamat;
      if (status) mitra.status = status;
      if (catatan !== undefined) mitra.catatan = catatan;

      // Sinkronkan balik ke Karyawan apabila mitra adalah akun karyawan terkait
      if (mitra.role === 'KARYAWAN') {
        const kry = (db.karyawan || []).find(
          (k) => k.idMitraTerkait === mitra.id || `MTR-${k.id}` === mitra.id || k.nik === mitra.kode
        );
        if (kry) {
          if (nama) kry.nama = mitra.nama;
          if (telepon) kry.telepon = mitra.telepon;
          if (alamat) kry.alamat = mitra.alamat;
          if (status) kry.status = mitra.status;
          kry.idMitraTerkait = mitra.id;
        }
      }

      return mitra;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// MASTER PRODUK, KATEGORI KUSTOM & STOK
// ==========================================
function normalizeKategoriName(raw: unknown): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
  return cleaned || 'LAINNYA';
}

function ensureKategoriRegistered(db: any, namaKategori: string, deskripsi?: string) {
  if (!Array.isArray(db.kategoriProduk)) {
    db.kategoriProduk = [];
  }
  const norm = normalizeKategoriName(namaKategori);
  const existing = db.kategoriProduk.find(
    (k: any) => normalizeKategoriName(k.nama) === norm
  );
  if (!existing) {
    db.kategoriProduk.push({
      nama: norm,
      deskripsi: deskripsi ? String(deskripsi).trim() : '',
      createdAt: getWIBDateTime().iso,
    });
  } else if (deskripsi !== undefined && String(deskripsi).trim()) {
    existing.deskripsi = String(deskripsi).trim();
  }
  return norm;
}

apiRouter.get('/kategori-produk', (_req, res) => {
  try {
    const db = dbManager.get();
    const savedList = Array.isArray(db.kategoriProduk) ? db.kategoriProduk : [];
    const produkList = Array.isArray(db.produk) ? db.produk : [];

    const map = new Map<
      string,
      { nama: string; deskripsi: string; jumlahProduk: number; isSaved: boolean }
    >();

    for (const k of savedList) {
      const norm = normalizeKategoriName(k.nama);
      map.set(norm, {
        nama: norm,
        deskripsi: k.deskripsi || '',
        jumlahProduk: 0,
        isSaved: true,
      });
    }

    for (const p of produkList) {
      const norm = normalizeKategoriName(p.kategori);
      const current = map.get(norm);
      if (current) {
        current.jumlahProduk += 1;
      } else {
        map.set(norm, {
          nama: norm,
          deskripsi: '',
          jumlahProduk: 1,
          isSaved: false,
        });
      }
    }

    const result = Array.from(map.values()).sort((a, b) => {
      if (b.jumlahProduk !== a.jumlahProduk) return b.jumlahProduk - a.jumlahProduk;
      return a.nama.localeCompare(b.nama, 'id');
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/kategori-produk', async (req, res) => {
  try {
    const { nama, deskripsi } = req.body;
    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
    }

    const norm = normalizeKategoriName(nama);
    const { iso, tanggal, jam } = getWIBDateTime();

    const created = await dbManager.executeTransaction((db) => {
      ensureKategoriRegistered(db, norm, deskripsi);
      db.auditLogs.unshift({
        id: `LOG-KAT-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin / Gudang',
        jenisTransaksi: 'CREATE',
        idTransaksi: `KAT-${norm.slice(0, 12)}`,
        detail: `Menambahkan kategori produk kustom baru: "${norm}"`,
        nominal: 0,
      });
      return db.kategoriProduk?.find((k) => normalizeKategoriName(k.nama) === norm);
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/kategori-produk/rename', async (req, res) => {
  try {
    const { kategoriLama, kategoriBaru, deskripsi } = req.body;
    if (!kategoriLama || !kategoriBaru || !String(kategoriBaru).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nama kategori lama dan kategori baru wajib diisi',
      });
    }

    const oldNorm = normalizeKategoriName(kategoriLama);
    const newNorm = normalizeKategoriName(kategoriBaru);
    const { iso, tanggal, jam } = getWIBDateTime();

    const summary = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.kategoriProduk)) db.kategoriProduk = [];

      // Update or merge in kategoriProduk
      const oldIdx = db.kategoriProduk.findIndex(
        (k) => normalizeKategoriName(k.nama) === oldNorm
      );
      const existingNew = db.kategoriProduk.find(
        (k) => normalizeKategoriName(k.nama) === newNorm
      );

      if (oldIdx >= 0) {
        const oldDesc = db.kategoriProduk[oldIdx].deskripsi;
        if (existingNew && oldNorm !== newNorm) {
          if (deskripsi !== undefined) existingNew.deskripsi = String(deskripsi).trim();
          else if (!existingNew.deskripsi && oldDesc) existingNew.deskripsi = oldDesc;
          db.kategoriProduk.splice(oldIdx, 1);
        } else {
          db.kategoriProduk[oldIdx].nama = newNorm;
          if (deskripsi !== undefined) {
            db.kategoriProduk[oldIdx].deskripsi = String(deskripsi).trim();
          }
        }
      } else {
        ensureKategoriRegistered(db, newNorm, deskripsi);
      }

      // Update all matching products
      let affectedCount = 0;
      for (const p of db.produk) {
        if (normalizeKategoriName(p.kategori) === oldNorm) {
          p.kategori = newNorm;
          affectedCount += 1;
        }
      }

      db.auditLogs.unshift({
        id: `LOG-KAT-REN-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin / Gudang',
        jenisTransaksi: 'UPDATE',
        idTransaksi: `KAT-${newNorm.slice(0, 12)}`,
        detail: `Mengubah kategori produk "${oldNorm}" menjadi "${newNorm}" (${affectedCount} produk diperbarui)`,
        nominal: 0,
      });

      return { kategoriLama: oldNorm, kategoriBaru: newNorm, affectedCount };
    });

    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/kategori-produk/delete', async (req, res) => {
  try {
    const { nama, kategoriPengganti } = req.body;
    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });
    }

    const targetNorm = normalizeKategoriName(nama);
    const { iso, tanggal, jam } = getWIBDateTime();

    const summary = await dbManager.executeTransaction((db) => {
      const usedProducts = db.produk.filter(
        (p) => normalizeKategoriName(p.kategori) === targetNorm
      );

      if (usedProducts.length > 0 && !kategoriPengganti) {
        throw new Error(
          `Kategori "${targetNorm}" masih dipakai oleh ${usedProducts.length} produk. Pindahkan produk terlebih dahulu atau gunakan fitur Ubah Nama Kategori.`
        );
      }

      let movedCount = 0;
      if (usedProducts.length > 0 && kategoriPengganti) {
        const fallbackNorm = ensureKategoriRegistered(db, kategoriPengganti);
        for (const p of usedProducts) {
          p.kategori = fallbackNorm;
          movedCount += 1;
        }
      }

      if (Array.isArray(db.kategoriProduk)) {
        db.kategoriProduk = db.kategoriProduk.filter(
          (k) => normalizeKategoriName(k.nama) !== targetNorm
        );
      }

      db.auditLogs.unshift({
        id: `LOG-KAT-DEL-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin / Gudang',
        jenisTransaksi: 'UPDATE',
        idTransaksi: `KAT-DEL-${targetNorm.slice(0, 10)}`,
        detail: `Menghapus kategori "${targetNorm}"${movedCount > 0 ? ` (${movedCount} produk dipindahkan)` : ''}`,
        nominal: 0,
      });

      return { deleted: targetNorm, movedCount };
    });

    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/produk/bulk-kategori', async (req, res) => {
  try {
    const { kodeProdukList, kategoriBaru, deskripsiKategori } = req.body;
    if (!Array.isArray(kodeProdukList) || kodeProdukList.length === 0) {
      return res.status(400).json({ success: false, message: 'Pilih minimal satu produk' });
    }
    if (!kategoriBaru || !String(kategoriBaru).trim()) {
      return res.status(400).json({ success: false, message: 'Nama kategori tujuan wajib diisi' });
    }

    const newNorm = normalizeKategoriName(kategoriBaru);
    const { iso, tanggal, jam } = getWIBDateTime();

    const result = await dbManager.executeTransaction((db) => {
      ensureKategoriRegistered(db, newNorm, deskripsiKategori);
      const targetCodes = new Set(kodeProdukList.map((c: any) => String(c).trim().toUpperCase()));
      let updatedCount = 0;

      for (const p of db.produk) {
        if (targetCodes.has(p.kode.toUpperCase())) {
          p.kategori = newNorm;
          updatedCount += 1;
        }
      }

      db.auditLogs.unshift({
        id: `LOG-PRD-BULK-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin / Gudang',
        jenisTransaksi: 'UPDATE',
        idTransaksi: `BULK-KAT-${Date.now().toString().slice(-4)}`,
        detail: `Memperbarui kategori ${updatedCount} produk secara massal ke "${newNorm}"`,
        nominal: 0,
      });

      return { kategoriBaru: newNorm, updatedCount };
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/produk', (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.produk });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/produk', async (req, res) => {
  try {
    const { kode, kategori, nama, satuan, hargaBeli, hargaJual, hargaKhususRekanan, stokAwal, minimum } = req.body;
    if (!kode || !nama || !satuan || hargaJual === undefined) {
      return res.status(400).json({ success: false, message: 'Kode, nama, satuan, dan harga jual wajib diisi' });
    }

    const { iso } = getWIBDateTime();
    const cleanKode = String(kode).toUpperCase().trim();
    const cleanKategori = normalizeKategoriName(kategori);

    const created = await dbManager.executeTransaction((db) => {
      if (db.produk.some((p) => p.kode === cleanKode)) {
        throw new Error(`Produk dengan kode ${cleanKode} sudah terdaftar`);
      }
      ensureKategoriRegistered(db, cleanKategori);

      const buyVal = Math.max(0, Number(hargaBeli) || 0);
      const rawSell = Math.max(0, Number(hargaJual) || 0);
      const sellVal = rawSell > 0 ? rawSell : buyVal;
      const rekananVal =
        hargaKhususRekanan !== undefined && hargaKhususRekanan !== '' && Number(hargaKhususRekanan) > 0
          ? Math.max(0, Number(hargaKhususRekanan) || 0)
          : sellVal;

      const newProd: any = {
        kode: cleanKode,
        kategori: cleanKategori,
        nama: String(nama).trim(),
        satuan: String(satuan).trim(),
        hargaBeli: buyVal,
        hargaJual: sellVal,
        hargaKhususRekanan: rekananVal,
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

apiRouter.put('/produk/:kode', async (req, res) => {
  try {
    const { kode } = req.params;
    const { nama, kategori, satuan, hargaBeli, hargaJual, hargaKhususRekanan, status, minimum } = req.body;
    const { iso, tanggal, jam } = getWIBDateTime();

    const updated = await dbManager.executeTransaction((db) => {
      const prod = db.produk.find((p) => p.kode === kode);
      if (!prod) throw new Error(`Produk dengan kode ${kode} tidak ditemukan`);

      if (nama) prod.nama = String(nama).trim();
      if (kategori && String(kategori).trim()) {
        const cleanKategori = normalizeKategoriName(kategori);
        prod.kategori = cleanKategori;
        ensureKategoriRegistered(db, cleanKategori);
      }
      if (satuan) prod.satuan = String(satuan).trim();
      if (hargaBeli !== undefined) prod.hargaBeli = Math.max(0, Number(hargaBeli) || 0);
      if (hargaJual !== undefined) prod.hargaJual = Math.max(0, Number(hargaJual) || 0);
      if (hargaKhususRekanan !== undefined) prod.hargaKhususRekanan = Math.max(0, Number(hargaKhususRekanan) || 0);
      if (status) prod.status = status;

      // Sync name, unit & minimum to stokBarang (or create if missing)
      let stok = db.stokBarang.find((s) => s.kode === kode);
      if (stok) {
        stok.namaProduk = prod.nama;
        stok.satuan = prod.satuan;
        if (minimum !== undefined) stok.minimum = Math.max(0, Number(minimum) || 0);
        stok.updateTerakhir = iso;
      } else {
        stok = {
          kode: prod.kode,
          namaProduk: prod.nama,
          satuan: prod.satuan,
          stok: 0,
          minimum: minimum !== undefined ? Math.max(0, Number(minimum) || 0) : 5,
          updateTerakhir: iso,
        };
        db.stokBarang.push(stok);
      }

      db.auditLogs.unshift({
        id: `LOG-PRD-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Kasir & Gudang',
        jenisTransaksi: 'UPDATE',
        idTransaksi: `PRD-${kode}`,
        detail: `Pembaruan data produk ${prod.nama} [${prod.kategori}]: Harga Jual Rp ${(prod.hargaJual || 0).toLocaleString('id-ID')}, HPP Rp ${(prod.hargaBeli || 0).toLocaleString('id-ID')}`,
        nominal: prod.hargaJual || 0,
      });

      return { produk: prod, stok };
    });

    res.json({ success: true, data: updated });
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
    const { kode, nama, satuan, hargaBeliStandar, isBelumPutusHarga } = req.body;
    if (!nama || !String(nama).trim()) {
      return res.status(400).json({ success: false, message: 'Nama barang hasil bumi wajib diisi' });
    }
    const { iso, tanggal, jam } = getWIBDateTime();
    const created = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.stokHasilBumi)) db.stokHasilBumi = [];
      const cleanNama = String(nama).trim();

      if (db.stokHasilBumi.some((h) => h.nama.trim().toUpperCase() === cleanNama.toUpperCase())) {
        throw new Error(`Barang hasil bumi "${cleanNama}" sudah terdaftar di sistem`);
      }

      let cleanKode = kode ? String(kode).trim().toUpperCase() : '';
      if (!cleanKode) {
        let maxNum = 8;
        for (const h of db.stokHasilBumi) {
          const match = /^HB-(\d+)$/i.exec(h.kode || '');
          if (match) {
            const num = parseInt(match[1], 10);
            if (!Number.isNaN(num) && num > maxNum) maxNum = num;
          }
        }
        let nextNum = maxNum + 1;
        cleanKode = `HB-${String(nextNum).padStart(2, '0')}`;
        while (db.stokHasilBumi.some((h) => h.kode.toUpperCase() === cleanKode)) {
          nextNum += 1;
          cleanKode = `HB-${String(nextNum).padStart(2, '0')}`;
        }
      } else if (db.stokHasilBumi.some((h) => h.kode.toUpperCase() === cleanKode)) {
        throw new Error(`Komoditas dengan kode ${cleanKode} sudah terdaftar`);
      }

      const newKomoditas = {
        kode: cleanKode,
        nama: cleanNama,
        satuan: String(satuan || 'Kg').trim(),
        stok: 0,
        hargaBeliStandar: Math.max(0, Number(hargaBeliStandar) || 0),
        isBelumPutusHarga: Boolean(isBelumPutusHarga),
        updateTerakhir: iso,
      };
      db.stokHasilBumi.push(newKomoditas);

      db.auditLogs.unshift({
        id: `LOG-HB-ADD-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Kasir Hasil Bumi',
        jenisTransaksi: 'CREATE',
        idTransaksi: cleanKode,
        detail: `Tambah Barang Hasil Bumi Baru: ${cleanNama} (${cleanKode}) — Satuan ${newKomoditas.satuan}, Harga Standar Rp ${newKomoditas.hargaBeliStandar.toLocaleString('id-ID')}/${newKomoditas.satuan}`,
        nominal: newKomoditas.hargaBeliStandar,
      });

      return newKomoditas;
    });
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/stok-hasil-bumi/:kode/harga', async (req, res) => {
  try {
    const { kode } = req.params;
    const { hargaBeliStandar } = req.body;
    const { iso, tanggal, jam } = getWIBDateTime();

    const updated = await dbManager.executeTransaction((db) => {
      const hb = (db.stokHasilBumi || []).find((h) => h.kode === kode);
      if (!hb) throw new Error(`Komoditas dengan kode ${kode} tidak ditemukan`);
      hb.hargaBeliStandar = Math.max(0, Number(hargaBeliStandar) || 0);
      hb.updateTerakhir = iso;

      db.auditLogs.unshift({
        id: `LOG-HB-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Kasir Hasil Bumi',
        jenisTransaksi: 'UPDATE',
        idTransaksi: `HB-${kode}`,
        detail: `Pembaruan harga standar hasil bumi ${hb.nama} menjadi Rp ${hb.hargaBeliStandar.toLocaleString('id-ID')}/${hb.satuan}`,
        nominal: hb.hargaBeliStandar,
      });

      return hb;
    });

    res.json({ success: true, data: updated });
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

        // Hitung total pembelian fisik & penjualan keluar berjalan di aplikasi
        const pembelianBerjalanKg = db.pembelianHasilBumi
          .filter((p) => p.komoditasKode === item.kode && TransactionService.isPhysicalPembelianHasilBumi(p))
          .reduce((sum, p) => sum + (p.beratBersih || 0), 0);

        const penjualanBerjalanKg = (db.penjualanHasilBumi || [])
          .filter((j) => j.komoditasKode === item.kode)
          .reduce((sum, j) => sum + (j.beratBersih || 0), 0);

        // Update saldo awal dan akumulasi modal lama
        hb.stokAwal = validStokAwal;
        hb.rataRataModalAwal = validRataRata;
        hb.modalAwalTotal = validModalTotal;
        hb.keteranganStokAwal = item.keterangan?.trim() || 'Rekap stok manual lama sebelum aplikasi';
        hb.tanggalInputStokAwal = `${tanggal} ${jam}`;

        // Stok fisik Ready Gudang = Stok Awal Lama + Pembelian Baru - Penjualan Keluar
        hb.stok = Math.max(0, Math.round((validStokAwal + pembelianBerjalanKg - penjualanBerjalanKg) * 100) / 100);
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

apiRouter.delete('/transaksi/pembelian-barang/:noPembelian', async (req, res) => {
  try {
    const { noPembelian } = req.params;
    const result = await TransactionService.deletePembelianBarang(noPembelian);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
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

// Penjualan / Pengiriman Hasil Bumi Keluar Gudang & Ringkasan Bulanan
apiRouter.get('/transaksi/penjualan-hasil-bumi', (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.penjualanHasilBumi || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/penjualan-hasil-bumi', async (req, res) => {
  try {
    const record = await TransactionService.processPenjualanHasilBumi(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/transaksi/penjualan-hasil-bumi/:noPenjualan', async (req, res) => {
  try {
    const result = await TransactionService.deletePenjualanHasilBumi(req.params.noPenjualan);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/laporan/ringkasan-hasil-bumi-bulanan', (req, res) => {
  try {
    const { bulan, tahun, kodeKomoditas } = req.query;
    const summary = TransactionService.getRingkasanStokHasilBumiBulanan({
      bulan: bulan ? Number(bulan) : undefined,
      tahun: tahun ? Number(tahun) : undefined,
      kodeKomoditas: kodeKomoditas ? String(kodeKomoditas) : undefined,
    });
    res.json({ success: true, data: summary });
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

// Input Saldo Awal / Nota Lalu Mitra (Piutang Barang Masa Lalu & Titipan Uang/Panen)
apiRouter.post('/transaksi/nota-lalu', async (req, res) => {
  try {
    const result = await TransactionService.processInputNotaLalu(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Daftar Bukti Nota Lalu (dengan filter nama & waktu)
apiRouter.get('/transaksi/bukti-nota-lalu', (req, res) => {
  try {
    const { idMitra, waktuFilter, beforeDate, startDate, endDate, search, hanyaNotaLalu } = req.query;
    const data = TransactionService.getDaftarBuktiNotaLalu({
      idMitra: idMitra ? String(idMitra) : undefined,
      waktuFilter: waktuFilter ? (String(waktuFilter) as any) : undefined,
      beforeDate: beforeDate ? String(beforeDate) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      search: search ? String(search) : undefined,
      hanyaNotaLalu: hanyaNotaLalu === 'true' || hanyaNotaLalu === '1',
    });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Bersihkan Bukti Nota Lalu & Otomatis Sinkronkan Rekening Mitra
apiRouter.post('/transaksi/bersihkan-bukti-nota-lalu', async (req, res) => {
  try {
    const result = await TransactionService.bersihkanBuktiNotaLalu(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Pinjam Uang dari PT ke Mitra (Masuk Saldo Titip Mitra)
apiRouter.post('/mitra/pinjam-uang', async (req, res) => {
  try {
    const result = await TransactionService.processPinjamanUangDariMitra(req.body);
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
// PENCAIRAN TITIPAN HASIL BUMI
// ==========================================
apiRouter.post('/transaksi/cairkan-titipan', async (req, res) => {
  try {
    const record = await TransactionService.processPencairanTitipan(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/transaksi/cairkan-titipan', (_req, res) => {
  try {
    const list = TransactionService.getPencairanTitipanList();
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PENGELUARAN & BIAYA OPERASIONAL DIVISI
// ==========================================
apiRouter.post('/pengeluaran', async (req, res) => {
  try {
    const record = await TransactionService.processPengeluaran(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.get('/pengeluaran', (_req, res) => {
  try {
    const list = TransactionService.getPengeluaranList();
    res.json({ success: true, data: list });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/pengeluaran/:id', async (req, res) => {
  try {
    const result = await TransactionService.deletePengeluaran(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// MASTER INVENTARIS & ARMADA KENDARAAN PT
// ==========================================
apiRouter.get('/inventaris', (_req, res) => {
  try {
    const db = dbManager.get();
    res.json({ success: true, data: db.inventaris || [] });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/inventaris', async (req, res) => {
  try {
    const {
      kode,
      namaItem,
      kategori,
      nomorPlat,
      merkTipe,
      tahunKeluaran,
      warna,
      nomorRangka,
      nomorMesin,
      driverPenanggungJawab,
      idKaryawanDriver,
      teleponDriver,
      divisi,
      tanggalPajakTahunan,
      tanggalPajakLimaTahunan,
      tanggalKir,
      kondisi,
      nilaiPerolehan,
      tanggalBeli,
      fotoItem,
      fotoStnk,
      catatan,
    } = req.body || {};

    if (!namaItem || !String(namaItem).trim()) {
      return res.status(400).json({ success: false, message: 'Nama item / kendaraan inventaris wajib diisi' });
    }

    const { iso, tanggal, jam } = getWIBDateTime();

    const created = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.inventaris)) db.inventaris = [];

      const cleanPlat = nomorPlat ? String(nomorPlat).trim().toUpperCase() : '';
      if (
        cleanPlat &&
        cleanPlat !== '-' &&
        db.inventaris.some(
          (item) => (item.nomorPlat || '').replace(/\s+/g, '').toUpperCase() === cleanPlat.replace(/\s+/g, '')
        )
      ) {
        throw new Error(`Kendaraan dengan Nomor Plat ${cleanPlat} sudah terdaftar di Inventaris PT`);
      }

      let maxNum = 0;
      for (const inv of db.inventaris) {
        const m = /^INV-(\d+)$/i.exec(inv.kode || '');
        if (m) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > maxNum) maxNum = n;
        }
      }
      const cleanKode = kode
        ? String(kode).trim().toUpperCase()
        : `INV-${String(maxNum + 1).padStart(3, '0')}`;

      const newItem = {
        id: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        kode: cleanKode,
        namaItem: String(namaItem).trim(),
        kategori: kategori || 'TRUCK_ANGKUTAN',
        nomorPlat: cleanPlat || '-',
        merkTipe: String(merkTipe || '-').trim(),
        tahunKeluaran: String(tahunKeluaran || '-').trim(),
        warna: warna ? String(warna).trim() : '',
        nomorRangka: nomorRangka ? String(nomorRangka).trim().toUpperCase() : '',
        nomorMesin: nomorMesin ? String(nomorMesin).trim().toUpperCase() : '',
        driverPenanggungJawab: String(driverPenanggungJawab || '-').trim(),
        idKaryawanDriver: idKaryawanDriver ? String(idKaryawanDriver).trim() : undefined,
        teleponDriver: teleponDriver ? String(teleponDriver).trim() : '',
        divisi: String(divisi || 'Wijaya Transport').trim(),
        tanggalPajakTahunan: String(tanggalPajakTahunan || '').trim(),
        tanggalPajakLimaTahunan: tanggalPajakLimaTahunan ? String(tanggalPajakLimaTahunan).trim() : '',
        tanggalKir: tanggalKir ? String(tanggalKir).trim() : '',
        kondisi: kondisi || 'BAIK',
        nilaiPerolehan: nilaiPerolehan !== undefined ? Math.max(0, Number(nilaiPerolehan) || 0) : 0,
        tanggalBeli: tanggalBeli ? String(tanggalBeli).trim() : '',
        fotoItem: fotoItem || undefined,
        fotoStnk: fotoStnk || undefined,
        catatan: catatan ? String(catatan).trim() : '',
        status: 'AKTIF' as const,
        createdAt: iso,
        updatedAt: iso,
      };

      db.inventaris.unshift(newItem);

      db.auditLogs.unshift({
        id: `LOG-INV-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin Inventaris',
        jenisTransaksi: 'CREATE',
        idTransaksi: newItem.kode,
        detail: `Tambah Inventaris PT: ${newItem.namaItem} (${newItem.nomorPlat !== '-' ? newItem.nomorPlat : newItem.kode}) — Driver: ${newItem.driverPenanggungJawab}, Tahun: ${newItem.tahunKeluaran}`,
        nominal: newItem.nilaiPerolehan || 0,
      });

      return newItem;
    });

    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/inventaris/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { iso, tanggal, jam } = getWIBDateTime();

    const updated = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.inventaris)) db.inventaris = [];
      const item = db.inventaris.find((inv) => inv.id === id || inv.kode === id);
      if (!item) throw new Error('Item inventaris tidak ditemukan');

      if (body.nomorPlat !== undefined) {
        const cleanPlat = String(body.nomorPlat || '').trim().toUpperCase();
        if (
          cleanPlat &&
          cleanPlat !== '-' &&
          db.inventaris.some(
            (other) =>
              other.id !== item.id &&
              (other.nomorPlat || '').replace(/\s+/g, '').toUpperCase() === cleanPlat.replace(/\s+/g, '')
          )
        ) {
          throw new Error(`Nomor Plat ${cleanPlat} sudah digunakan pada unit inventaris lain`);
        }
        item.nomorPlat = cleanPlat || '-';
      }

      if (body.namaItem !== undefined && String(body.namaItem).trim()) {
        item.namaItem = String(body.namaItem).trim();
      }
      if (body.kategori !== undefined) item.kategori = body.kategori;
      if (body.merkTipe !== undefined) item.merkTipe = String(body.merkTipe || '-').trim();
      if (body.tahunKeluaran !== undefined) item.tahunKeluaran = String(body.tahunKeluaran || '-').trim();
      if (body.warna !== undefined) item.warna = String(body.warna || '').trim();
      if (body.nomorRangka !== undefined) item.nomorRangka = String(body.nomorRangka || '').trim().toUpperCase();
      if (body.nomorMesin !== undefined) item.nomorMesin = String(body.nomorMesin || '').trim().toUpperCase();
      if (body.driverPenanggungJawab !== undefined) {
        item.driverPenanggungJawab = String(body.driverPenanggungJawab || '-').trim();
      }
      if (body.idKaryawanDriver !== undefined) {
        item.idKaryawanDriver = body.idKaryawanDriver ? String(body.idKaryawanDriver).trim() : undefined;
      }
      if (body.teleponDriver !== undefined) item.teleponDriver = String(body.teleponDriver || '').trim();
      if (body.divisi !== undefined) item.divisi = String(body.divisi || 'Wijaya Transport').trim();
      if (body.tanggalPajakTahunan !== undefined) {
        item.tanggalPajakTahunan = String(body.tanggalPajakTahunan || '').trim();
      }
      if (body.tanggalPajakLimaTahunan !== undefined) {
        item.tanggalPajakLimaTahunan = String(body.tanggalPajakLimaTahunan || '').trim();
      }
      if (body.tanggalKir !== undefined) item.tanggalKir = String(body.tanggalKir || '').trim();
      if (body.kondisi !== undefined) item.kondisi = body.kondisi;
      if (body.nilaiPerolehan !== undefined) {
        item.nilaiPerolehan = Math.max(0, Number(body.nilaiPerolehan) || 0);
      }
      if (body.tanggalBeli !== undefined) item.tanggalBeli = String(body.tanggalBeli || '').trim();
      if (body.fotoItem !== undefined) item.fotoItem = body.fotoItem || undefined;
      if (body.fotoStnk !== undefined) item.fotoStnk = body.fotoStnk || undefined;
      if (body.catatan !== undefined) item.catatan = String(body.catatan || '').trim();
      if (body.status !== undefined) item.status = body.status;

      item.updatedAt = iso;

      db.auditLogs.unshift({
        id: `LOG-INV-UPD-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin Inventaris',
        jenisTransaksi: 'UPDATE',
        idTransaksi: item.kode,
        detail: `Update Profil Inventaris: ${item.namaItem} (${item.nomorPlat}) — Driver: ${item.driverPenanggungJawab}, Pajak: ${item.tanggalPajakTahunan || '-'}`,
        nominal: item.nilaiPerolehan || 0,
      });

      return item;
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.delete('/inventaris/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { iso, tanggal, jam } = getWIBDateTime();

    const result = await dbManager.executeTransaction((db) => {
      if (!Array.isArray(db.inventaris)) db.inventaris = [];
      const idx = db.inventaris.findIndex((inv) => inv.id === id || inv.kode === id);
      if (idx === -1) throw new Error('Item inventaris tidak ditemukan');
      const removed = db.inventaris[idx];
      db.inventaris.splice(idx, 1);

      db.auditLogs.unshift({
        id: `LOG-INV-DEL-${Date.now()}`,
        timestamp: iso,
        tanggal,
        jam,
        user: 'Admin Inventaris',
        jenisTransaksi: 'VOID',
        idTransaksi: removed.kode,
        detail: `Hapus Item Inventaris PT: ${removed.namaItem} (${removed.nomorPlat})`,
        nominal: 0,
      });

      return { id: removed.id, kode: removed.kode, namaItem: removed.namaItem };
    });

    res.json({ success: true, data: result, message: 'Item inventaris berhasil dihapus' });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// EDIT / NEGO TRANSAKSI DARI REKENING KORAN MITRA
// ==========================================
apiRouter.put('/transaksi/update-statement-entry', async (req, res) => {
  try {
    const result = await TransactionService.updateTransactionFromStatement(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// UNIVERSAL DETAIL & EDIT TRANSAKSI (NOMINAL, TONASE, QTY, HARGA, REKENING, TANGGAL)
// ==========================================
apiRouter.get('/transaksi/detail', (req, res) => {
  try {
    const id = String(req.query.id || '').trim();
    const jenis = req.query.jenis ? String(req.query.jenis).trim() : undefined;
    const data = TransactionService.getTransactionDetail(id, jenis);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/detail', (req, res) => {
  try {
    const id = String(req.body?.id || '').trim();
    const jenis = req.body?.jenis ? String(req.body.jenis).trim() : undefined;
    const data = TransactionService.getTransactionDetail(id, jenis);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/transaksi/edit-detail', async (req, res) => {
  try {
    const result = await TransactionService.editTransactionDetail(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.put('/transaksi/edit-detail', async (req, res) => {
  try {
    const result = await TransactionService.editTransactionDetail(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// PROFIL PERUSAHAAN (PT. WIJAYA AGRO PERKASA)
// ==========================================
apiRouter.get('/profil-perusahaan', (_req, res) => {
  try {
    const profile = TransactionService.getProfilPerusahaan();
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.put('/profil-perusahaan', async (req, res) => {
  try {
    const profile = await TransactionService.updateProfilPerusahaan(req.body);
    res.json({ success: true, data: profile });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
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

apiRouter.get('/laporan/arus-kas-harian', (req, res) => {
  try {
    const tanggal = req.query.tanggal as string | undefined;
    const data = TransactionService.getRekapHarianKas(tanggal);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Rekapan Semua Transaksi Terpadu (Semua Transaksi Hari Ini / Filter Tanggal, Arus Uang, Jenis, Nama)
apiRouter.get('/transaksi/semua', (req, res) => {
  try {
    const { tanggal, arusUang, kategori, pihakTerkait, search } = req.query as {
      tanggal?: string;
      arusUang?: string;
      kategori?: string;
      pihakTerkait?: string;
      search?: string;
    };
    const result = TransactionService.getAllUnifiedTransactions({
      tanggal,
      arusUang,
      kategori,
      pihakTerkait,
      search,
    });
    res.json({ success: true, data: result });
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
    const { nik, nama, jabatan, divisi, departemen, gajiPokok, tunjanganTetap, telepon, alamat, tanggalMasuk, catatan } = req.body;
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
      const selectedDivisi = String(divisi || departemen || 'Gudang Wijaya Agro').trim();

      const newKaryawan: any = {
        id,
        nik: cleanNik,
        nama: String(nama).trim(),
        jabatan: String(jabatan).trim(),
        divisi: selectedDivisi,
        departemen: selectedDivisi,
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

      // Otomatis buat entitas Mitra terkait dengan role KARYAWAN (Auto-sync ke Database Mitra)
      const existingMitraIdx = db.mitra.findIndex((m) => m.id === idMitra || m.kode === cleanNik || (m.role === 'KARYAWAN' && m.nama.toLowerCase() === newKaryawan.nama.toLowerCase()));
      if (existingMitraIdx >= 0) {
        db.mitra[existingMitraIdx].nama = newKaryawan.nama;
        db.mitra[existingMitraIdx].role = 'KARYAWAN';
        db.mitra[existingMitraIdx].telepon = newKaryawan.telepon;
        db.mitra[existingMitraIdx].alamat = newKaryawan.alamat;
        db.mitra[existingMitraIdx].status = 'AKTIF';
        db.mitra[existingMitraIdx].catatan = `Karyawan: ${newKaryawan.jabatan} (Divisi ${newKaryawan.divisi})`;
      } else {
        db.mitra.push({
          id: idMitra,
          kode: cleanNik,
          nama: newKaryawan.nama,
          role: 'KARYAWAN',
          telepon: newKaryawan.telepon,
          alamat: newKaryawan.alamat,
          status: 'AKTIF',
          catatan: `Karyawan: ${newKaryawan.jabatan} (Divisi ${newKaryawan.divisi})`,
        });
      }

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
    const { nama, jabatan, divisi, departemen, gajiPokok, tunjanganTetap, telepon, alamat, status, catatan } = req.body;

    const updated = await dbManager.executeTransaction((db) => {
      const kry = db.karyawan.find((k) => k.id === id);
      if (!kry) throw new Error(`Karyawan dengan ID ${id} tidak ditemukan`);

      if (nama) kry.nama = String(nama).trim();
      if (jabatan) kry.jabatan = String(jabatan).trim();
      if (divisi) {
        kry.divisi = String(divisi).trim();
        kry.departemen = String(divisi).trim();
      } else if (departemen) {
        kry.divisi = String(departemen).trim();
        kry.departemen = String(departemen).trim();
      }
      if (gajiPokok !== undefined) kry.gajiPokok = Math.max(0, Number(gajiPokok) || 0);
      if (tunjanganTetap !== undefined) kry.tunjanganTetap = Math.max(0, Number(tunjanganTetap) || 0);
      if (telepon) kry.telepon = telepon;
      if (alamat) kry.alamat = alamat;
      if (status) kry.status = status;
      if (catatan !== undefined) kry.catatan = catatan;

      // Sync ke entitas Mitra
      const mitraId = kry.idMitraTerkait || `MTR-${kry.id}`;
      const mtr = db.mitra.find((m) => m.id === mitraId || m.kode === kry.nik || (m.role === 'KARYAWAN' && m.nama.toLowerCase() === kry.nama.toLowerCase()));
      if (mtr) {
        mtr.nama = kry.nama;
        mtr.role = 'KARYAWAN';
        mtr.telepon = kry.telepon;
        mtr.alamat = kry.alamat;
        mtr.status = kry.status;
        mtr.catatan = `Karyawan: ${kry.jabatan} (Divisi ${kry.divisi || kry.departemen})`;
      } else {
        db.mitra.push({
          id: mitraId,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: 'KARYAWAN',
          telepon: kry.telepon || '-',
          alamat: kry.alamat || '-',
          status: kry.status || 'AKTIF',
          catatan: `Karyawan: ${kry.jabatan} (Divisi ${kry.divisi || kry.departemen})`,
        });
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
    const data = dbManager.getDivisiList();
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/divisi', async (req, res) => {
  try {
    const { nama, deskripsi, penanggungJawab } = req.body;
    if (!nama || !nama.trim()) {
      return res.status(400).json({ success: false, message: 'Nama divisi wajib diisi' });
    }
    const created = await dbManager.addDivisi(nama, deskripsi, penanggungJawab);
    res.json({ success: true, data: created });
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
// PEMBERSIHAN DATA UNTUK INPUT DATA RIIL (RESET)
// ==========================================
apiRouter.post('/system/reset-data', async (_req, res) => {
  try {
    await dbManager.resetAllData();
    res.json({
      success: true,
      message: 'Seluruh data transaksi, piutang, mutasi, data mitra, dan karyawan berhasil dikosongkan. Sistem siap menerima data riil!',
    });
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

    // 1. Unified Real Cashflow Calculation (Single Source Formula)
    const rekapKasHariIni = TransactionService.getRekapHarianKas(todayTanggal);
    const uangMasukHariIni = rekapKasHariIni.totalUangMasuk;
    const uangKeluarHariIni = rekapKasHariIni.totalUangKeluar;

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

// Download Cadangan JSON Lengkap (Anti Kehilangan Data)
apiRouter.get('/database/backup-json', (_req, res) => {
  try {
    const data = dbManager.get();
    const d = new Date();
    const dateStr = d.toISOString().split('T')[0];
    const filename = `wijaya_agro_erp_backup_${dateStr}_${d.getHours()}h.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Pulihkan Data dari File Cadangan JSON
apiRouter.post('/database/restore-json', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'Format data JSON cadangan tidak valid' });
    }
    const success = await dbManager.restoreDatabase(data);
    res.json({
      success,
      message: 'Database berhasil dipulihkan dari file JSON cadangan! Seluruh data transaksi, mitra, dan karyawan telah disinkronkan kembali.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// SUPABASE AUTO-SYNC & PERSISTENT CLOUD DATABASE
// ==========================================

// Real-time Cross-Module & Supabase Single Source Integrity Status
apiRouter.get('/database/integrity-status', (_req, res) => {
  try {
    const status = dbManager.getIntegrityStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get Supabase status & config
apiRouter.get('/supabase/status', (_req, res) => {
  try {
    const status = supabaseSyncEngine.getStatus();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update Supabase configuration (URL & API Key) - Cloud-First Smart Sync (Never Overwrites Existing Cloud Data!)
apiRouter.post('/supabase/config', async (req, res) => {
  try {
    const { url, key, autoSync } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'Supabase URL wajib diisi' });
    }
    supabaseSyncEngine.updateConfig({ url, key, autoSync });
    const testResult = await supabaseSyncEngine.testConnection();
    let initialSyncMessage = '';
    if (testResult.success) {
      try {
        const smartSync = await supabaseSyncEngine.syncSmartWithCloud(dbManager);
        if (smartSync.message) {
          initialSyncMessage = ` ${smartSync.message}`;
        }
      } catch (e: any) {
        console.warn('Initial smart sync with Supabase warning:', e);
      }
    }
    const latestStatus = supabaseSyncEngine.getStatus();
    res.json({
      success: true,
      data: latestStatus,
      cloudReconnectBundle: supabaseSyncEngine.getReconnectBundle(),
      testResult: {
        ...testResult,
        message: `${testResult.message}${initialSyncMessage}`,
      },
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Automatic silent background reconnection for Android / mobile wake-ups after container cold starts
apiRouter.post('/supabase/auto-connect', async (req, res) => {
  try {
    if (!supabaseSyncEngine.isConfigured()) {
      const { bundle, url, key } = req.body || {};
      const parsed = supabaseSyncEngine.parseReconnectBundle(bundle);
      if (parsed) {
        supabaseSyncEngine.updateConfig({
          url: parsed.url,
          key: parsed.key,
          autoSync: parsed.autoSync,
        });
      } else if (url && key) {
        supabaseSyncEngine.updateConfig({
          url: String(url),
          key: String(key),
          autoSync: true,
        });
      }
    }

    if (supabaseSyncEngine.isConfigured()) {
      await supabaseSyncEngine.ensureFreshCloudState(dbManager, 0);
    }

    const latestStatus = supabaseSyncEngine.getStatus();
    res.json({
      success: true,
      configured: latestStatus.configured,
      data: latestStatus,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Gagal auto-connect database' });
  }
});

// Test connection to Supabase
apiRouter.post('/supabase/test', async (_req, res) => {
  try {
    const result = await supabaseSyncEngine.testConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Push entire ERP database to Supabase
apiRouter.post('/supabase/sync-push', async (_req, res) => {
  try {
    const db = dbManager.get();
    const result = await supabaseSyncEngine.pushToSupabase(db);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Pull ERP database from Supabase & hydrate locally without feedback loop
apiRouter.post('/supabase/sync-pull', async (_req, res) => {
  try {
    const pullResult = await supabaseSyncEngine.pullFromSupabase();
    if (!pullResult.success || !pullResult.data) {
      return res.status(400).json({ success: false, message: pullResult.message });
    }
    await dbManager.hydrateFromSupabase(pullResult.data);
    res.json({
      success: true,
      message: 'Berhasil menarik & menyinkronkan data terbaru dari Cloud Supabase ke seluruh modul aplikasi!',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get SQL DDL Schema for Supabase SQL Editor
apiRouter.get('/supabase/sql-schema', (_req, res) => {
  try {
    const sql = supabaseSyncEngine.getSqlSchemaScript();
    res.json({ success: true, data: sql });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// All data synchronization is now managed 24/7 via Supabase Cloud PostgreSQL.

// ==========================================
// PUSAT KONTROL KASIR: KLIRING SILANG, AUDIT NAMA KEMBAR & CASH OPNAME
// ==========================================
apiRouter.get('/kontrol-kasir/overview', (_req, res) => {
  try {
    const overview = TransactionService.getSmartControlOverview();
    res.json({ success: true, data: overview });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/kontrol-kasir/kliring-silang', async (req, res) => {
  try {
    const result = await TransactionService.processKliringSilangMitra(req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/kontrol-kasir/kliring-massal', async (req, res) => {
  try {
    const { mitraIds } = req.body || {};
    const result = await TransactionService.processBatchKliringOtomatis(
      Array.isArray(mitraIds) ? mitraIds : undefined
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/kontrol-kasir/gabung-mitra', async (req, res) => {
  try {
    const result = await TransactionService.mergeDuplicateMitra(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

apiRouter.post('/kontrol-kasir/cash-opname', async (req, res) => {
  try {
    const record = await TransactionService.recordCashOpname(req.body);
    res.json({ success: true, data: record });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ==========================================
// UNIFIED HIGH-SPEED SNAPSHOT & BUKTI PHOTO OFFLOAD
// ==========================================
apiRouter.get('/erp-snapshot', (_req, res) => {
  try {
    const db = dbManager.get();

    // Ensure karyawan <-> mitra link is healthy without blocking
    let modified = false;
    for (const kry of db.karyawan || []) {
      const idMitra = kry.idMitraTerkait || `MTR-${kry.id}`;
      const existing = db.mitra.find(
        (m) =>
          m.id === idMitra ||
          m.kode === kry.nik ||
          (m.role === 'KARYAWAN' && m.nama.toLowerCase() === kry.nama.toLowerCase())
      );
      if (!existing) {
        db.mitra.push({
          id: idMitra,
          kode: kry.nik || kry.id,
          nama: kry.nama,
          role: 'KARYAWAN',
          telepon: kry.telepon || '-',
          alamat: kry.alamat || '-',
          status: kry.status || 'AKTIF',
          catatan: `Karyawan: ${kry.jabatan || 'Staff'} (Divisi ${kry.divisi || kry.departemen || 'Gudang'})`,
        });
        modified = true;
      } else if (existing.nama.endsWith(' (Karyawan)')) {
        existing.nama = kry.nama;
        modified = true;
      }
    }
    if (modified) {
      dbManager.save();
    }

    // Pre-index outstanding kasbon per mitra in O(N) instead of O(K * N)
    const outstandingBarangByMitra = new Map<string, number>();
    for (const p of db.penjualan || []) {
      if (p.metode === 'KASBON' && p.statusPembayaran === 'BELUM_BAYAR' && p.idMitra) {
        outstandingBarangByMitra.set(
          p.idMitra,
          (outstandingBarangByMitra.get(p.idMitra) || 0) + (p.sisaPiutang || 0)
        );
      }
    }
    const outstandingUangByMitra = new Map<string, number>();
    for (const ku of db.kasbonUang || []) {
      if (ku.status !== 'LUNAS' && ku.idMitra) {
        outstandingUangByMitra.set(
          ku.idMitra,
          (outstandingUangByMitra.get(ku.idMitra) || 0) + (ku.sisaKasbon || 0)
        );
      }
    }

    const karyawanEnriched = (db.karyawan || []).map((k) => {
      const mitraId = k.idMitraTerkait || `MTR-${k.id}`;
      const outstandingBarang = outstandingBarangByMitra.get(mitraId) || 0;
      const outstandingUang = outstandingUangByMitra.get(mitraId) || 0;
      return {
        ...k,
        kasbonBarang: outstandingBarang,
        kasbonUang: outstandingUang,
        totalKasbonAktif: outstandingBarang + outstandingUang,
      };
    });

    // Kategori produk summary
    const savedKat = Array.isArray(db.kategoriProduk) ? db.kategoriProduk : [];
    const produkArr = Array.isArray(db.produk) ? db.produk : [];
    const katMap = new Map<
      string,
      { nama: string; deskripsi: string; jumlahProduk: number; isSaved: boolean }
    >();
    for (const k of savedKat) {
      const norm = normalizeKategoriName(k.nama);
      katMap.set(norm, {
        nama: norm,
        deskripsi: k.deskripsi || '',
        jumlahProduk: 0,
        isSaved: true,
      });
    }
    for (const p of produkArr) {
      const norm = normalizeKategoriName(p.kategori);
      const cur = katMap.get(norm);
      if (cur) {
        cur.jumlahProduk += 1;
      } else {
        katMap.set(norm, {
          nama: norm,
          deskripsi: '',
          jumlahProduk: 1,
          isSaved: false,
        });
      }
    }
    const kategoriProduk = Array.from(katMap.values()).sort((a, b) => {
      if (b.jumlahProduk !== a.jumlahProduk) return b.jumlahProduk - a.jumlahProduk;
      return a.nama.localeCompare(b.nama, 'id');
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      success: true,
      data: {
        dashboard: TransactionService.getDashboardStats(),
        rekening: db.rekening || [],
        mitra: db.mitra || [],
        karyawan: karyawanEnriched,
        upahHarian: db.upahHarian || [],
        produk: db.produk || [],
        kategoriProduk,
        stokBarang: db.stokBarang || [],
        stokHasilBumi: db.stokHasilBumi || [],
        penjualan: db.penjualan || [],
        pembelianHasilBumi: db.pembelianHasilBumi || [],
        penjualanHasilBumi: db.penjualanHasilBumi || [],
        pembelianBarang: db.pembelianBarang || [],
        pencairanTitipan: TransactionService.getPencairanTitipanList(),
        kasbonUang: db.kasbonUang || [],
        bayarBon: db.bayarBon || [],
        pengeluaran: TransactionService.getPengeluaranList(),
        transferRekening: db.transferRekening || [],
        penggajian: db.penggajian || [],
        auditLogs: db.auditLogs || [],
        profilPerusahaan: TransactionService.getProfilPerusahaan(),
        inventaris: db.inventaris || [],
        supabaseStatus: supabaseSyncEngine.getStatus(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/upload-bukti', async (req, res) => {
  try {
    const { dataUrl, prefix } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'Data gambar wajib dikirim' });
    }
    // If already an external URL, return directly
    if (/^https?:\/\//i.test(dataUrl)) {
      return res.json({
        success: true,
        data: { url: dataUrl, storage: 'SUPABASE_STORAGE' },
      });
    }
    const cloudUrl = await supabaseSyncEngine.uploadBuktiImage(dataUrl, prefix || 'nota');
    res.json({
      success: true,
      data: {
        url: cloudUrl || dataUrl,
        storage: cloudUrl ? 'SUPABASE_STORAGE' : 'INLINE_COMPRESSED',
      },
    });
  } catch (err: any) {
    // Graceful fallback so cashier upload never fails
    res.json({
      success: true,
      data: {
        url: req.body?.dataUrl || '',
        storage: 'INLINE_COMPRESSED',
      },
    });
  }
});

// ==========================================
// PORTAL EKSEKUTIF BOS & KUNCI PIN 2-PERAN (BOS vs KASIR)
// ==========================================
apiRouter.get('/bos-snapshot', (_req, res) => {
  try {
    const db = dbManager.get();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      success: true,
      data: {
        profilPerusahaan: TransactionService.getProfilPerusahaan(),
        rekening: db.rekening || [],
        stokBarang: db.stokBarang || [],
        stokHasilBumi: db.stokHasilBumi || [],
        inventaris: db.inventaris || [],
        supabaseStatus: supabaseSyncEngine.getStatus(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/access/status', (_req, res) => {
  try {
    const profil = TransactionService.getProfilPerusahaan();
    const pinBos = (process.env.PIN_BOS || profil?.pinBos || '888888').trim();
    const sup = supabaseSyncEngine.getStatus();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        namaPerusahaan: profil?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA',
        badanHukum: profil?.badanHukum || 'PT (Perseroan Terbatas)',
        wajibPinPublik: profil?.wajibPinPublik !== false,
        pinLengthHint: pinBos.length,
        supabaseConfigured: sup.configured,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/access/verify-pin', async (req, res) => {
  try {
    const inputPin = String(req.body?.pin || '').trim();
    if (!inputPin) {
      return res.status(400).json({ success: false, message: 'Masukkan sandi terlebih dahulu.' });
    }

    // If Android/client provides cached cloud credentials on a cold-started server, auto-connect & hydrate before checking PIN
    if (!supabaseSyncEngine.isConfigured()) {
      const { reconnectBundle, supabaseUrl, supabaseKey } = req.body || {};
      const parsed = supabaseSyncEngine.parseReconnectBundle(reconnectBundle);
      if (parsed) {
        supabaseSyncEngine.updateConfig({
          url: parsed.url,
          key: parsed.key,
          autoSync: parsed.autoSync,
        });
      } else if (supabaseUrl && supabaseKey) {
        supabaseSyncEngine.updateConfig({
          url: String(supabaseUrl),
          key: String(supabaseKey),
          autoSync: true,
        });
      }
    }

    if (supabaseSyncEngine.isConfigured()) {
      await supabaseSyncEngine.ensureFreshCloudState(dbManager, 1500);
    }

    const profil = TransactionService.getProfilPerusahaan();
    const activePinBos = (process.env.PIN_BOS || profil?.pinBos || '888888').trim();
    const activePinKasir = (process.env.PIN_KASIR || profil?.pinKasir || '123456').trim();
    const sessionDurationMs = 60 * 60 * 1000; // 1 Jam (3.600.000 ms)

    if (inputPin === activePinBos) {
      return res.json({
        success: true,
        data: {
          role: 'BOS' as const,
          label: 'Portal Eksekutif Pimpinan (Tampilan Bos)',
          sessionDurationMs,
          cloudReconnectBundle: supabaseSyncEngine.getReconnectBundle(),
        },
      });
    }

    if (inputPin === activePinKasir) {
      return res.json({
        success: true,
        data: {
          role: 'KASIR' as const,
          label: 'Operasional Admin & Kasir (Tampilan Admin)',
          sessionDurationMs,
          cloudReconnectBundle: supabaseSyncEngine.getReconnectBundle(),
        },
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Sandi tidak sesuai. Masukkan Sandi Bos untuk Tampilan Bos atau Sandi Admin untuk Tampilan Admin.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.get('/access/admin-config', (_req, res) => {
  try {
    const profil = TransactionService.getProfilPerusahaan();
    const sup = supabaseSyncEngine.getStatus();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        pinBos: (profil?.pinBos || '888888').trim(),
        pinKasir: (profil?.pinKasir || '123456').trim(),
        wajibPinPublik: profil?.wajibPinPublik !== false,
        supabaseConfigured: sup.configured,
        supabaseUrl: sup.fullUrl || '',
        supabaseKeyPreview: sup.keyPreview || '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

apiRouter.post('/access/admin-config', async (req, res) => {
  try {
    const pinBos = String(req.body?.pinBos || '').replace(/\D/g, '').trim();
    const pinKasir = String(req.body?.pinKasir || '').replace(/\D/g, '').trim();
    const wajibPinPublik = req.body?.wajibPinPublik !== false;

    if (pinBos.length < 4 || pinBos.length > 8) {
      return res.status(400).json({ success: false, message: 'PIN Bos wajib terdiri dari 4 hingga 8 angka.' });
    }
    if (pinKasir.length < 4 || pinKasir.length > 8) {
      return res.status(400).json({ success: false, message: 'PIN Kasir wajib terdiri dari 4 hingga 8 angka.' });
    }
    if (pinBos === pinKasir) {
      return res.status(400).json({
        success: false,
        message: 'PIN Bos dan PIN Kasir harus berbeda agar sistem otomatis mengarahkan tampilan Bos vs Kasir.',
      });
    }

    await TransactionService.updateProfilPerusahaan({
      pinBos,
      pinKasir,
      wajibPinPublik,
    });

    res.json({
      success: true,
      data: {
        pinBos,
        pinKasir,
        wajibPinPublik,
      },
      message: 'PIN Bos & PIN Kasir berhasil diperbarui dan tersinkron ke Cloud Supabase.',
    });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});


