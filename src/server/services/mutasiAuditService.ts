import { dbManager, getWIBDateTime } from '../db.ts';
import {
  computeSuratJalanKeuntunganPtEntries,
  isExcludedFromDivisi,
  isExcludedUangMasukFromDivisiCashflow,
  isTanpaDivisi,
  parseTransactionDateTimeMs,
} from '../types.ts';

export type AuditMutasiTargetType = 'REKENING_KAS' | 'DIVISI';

export interface AuditMutasiRow {
  id: string;
  refId: string;
  tanggal: string;       // DD/MM/YYYY
  jam: string;           // HH:mm:ss
  timestampMs: number;
  kategori: string;      // e.g. 'UANG_MASUK', 'PEMBELIAN_HB', 'TRANSFER_KELUAR', 'PENCAIRAN_TITIPAN', etc.
  kategoriLabel: string; // Human-readable label
  uraian: string;
  pihakTerkait: string;
  divisi: string;
  rekeningTerkait: string;
  metode: string;
  masuk: number;
  keluar: number;
  saldoBerjalan: number;
}

export interface AuditKategoriBreakdown {
  kategori: string;
  kategoriLabel: string;
  jumlahTrx: number;
  totalMasuk: number;
  totalKeluar: number;
  net: number;
}

export interface AuditMutasiResponse {
  targetType: AuditMutasiTargetType;
  kode: string;
  nama: string;
  nomorRekening?: string;
  atasNama?: string;
  kategoriRekening?: string;
  ledgerStartDate?: string;
  updatedAt: string;

  saldoAwal: number;
  totalMasuk: number;
  totalKeluar: number;
  saldoHitungMutasi: number;
  saldoTercatatSistem: number;
  selisihAudit: number;
  statusRekonsiliasi: 'KLOP' | 'ADA_SELISIH';

  jumlahTransaksi: number;
  ringkasanKategori: AuditKategoriBreakdown[];
  mutasi: AuditMutasiRow[];
}

function toDateKey(tgl?: string): number {
  if (!tgl) return 0;
  const parts = String(tgl).trim().split(/[-/]/);
  if (parts.length !== 3) return 0;
  if (parts[0].length === 4) {
    return Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
  }
  return Number(parts[2]) * 10000 + Number(parts[1]) * 100 + Number(parts[0]);
}

function toTsMs(tanggal?: string, jam?: string, createdAt?: string): number {
  return parseTransactionDateTimeMs({ tanggal, jam, createdAt });
}

function buildFinalAuditResponse(params: {
  targetType: AuditMutasiTargetType;
  kode: string;
  nama: string;
  nomorRekening?: string;
  atasNama?: string;
  kategoriRekening?: string;
  ledgerStartDate?: string;
  saldoAwal: number;
  saldoTercatatSistem: number;
  rawRows: Array<Omit<AuditMutasiRow, 'saldoBerjalan'>>;
}): AuditMutasiResponse {
  const wib = getWIBDateTime();

  // Sort chronologically (oldest first) so running balance is strictly accurate
  const sorted = [...params.rawRows].sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
    return a.id.localeCompare(b.id);
  });

  let running = Math.round(Number(params.saldoAwal) || 0);
  let totalMasuk = 0;
  let totalKeluar = 0;

  const katMap = new Map<string, AuditKategoriBreakdown>();

  const mutasi: AuditMutasiRow[] = sorted.map((r) => {
    const masuk = Math.max(0, Math.round(Number(r.masuk) || 0));
    const keluar = Math.max(0, Math.round(Number(r.keluar) || 0));
    totalMasuk += masuk;
    totalKeluar += keluar;
    running = Math.round(running + masuk - keluar);

    const existingKat = katMap.get(r.kategori) || {
      kategori: r.kategori,
      kategoriLabel: r.kategoriLabel,
      jumlahTrx: 0,
      totalMasuk: 0,
      totalKeluar: 0,
      net: 0,
    };
    existingKat.jumlahTrx += 1;
    existingKat.totalMasuk += masuk;
    existingKat.totalKeluar += keluar;
    existingKat.net = existingKat.totalMasuk - existingKat.totalKeluar;
    katMap.set(r.kategori, existingKat);

    return {
      ...r,
      masuk,
      keluar,
      saldoBerjalan: running,
    };
  });

  const ringkasanKategori = Array.from(katMap.values()).sort(
    (a, b) => Math.max(b.totalKeluar, b.totalMasuk) - Math.max(a.totalKeluar, a.totalMasuk)
  );

  const saldoAwal = Math.round(Number(params.saldoAwal) || 0);
  const saldoHitungMutasi = Math.round(saldoAwal + totalMasuk - totalKeluar);
  const saldoTercatatSistem = Math.round(Number(params.saldoTercatatSistem) || 0);
  const selisihAudit = Math.round(saldoTercatatSistem - saldoHitungMutasi);

  return {
    targetType: params.targetType,
    kode: params.kode,
    nama: params.nama,
    nomorRekening: params.nomorRekening,
    atasNama: params.atasNama,
    kategoriRekening: params.kategoriRekening,
    ledgerStartDate: params.ledgerStartDate,
    updatedAt: wib.iso,
    saldoAwal,
    totalMasuk,
    totalKeluar,
    saldoHitungMutasi,
    saldoTercatatSistem,
    selisihAudit,
    statusRekonsiliasi: selisihAudit === 0 ? 'KLOP' : 'ADA_SELISIH',
    jumlahTransaksi: mutasi.length,
    ringkasanKategori,
    mutasi,
  };
}

/**
 * Audit Mutasi Rekening Kas & Bank Fisik (BNI01 Direct, KAS01, BCA01, BRI01, MAN01, dll.)
 * Menarik 100% seluruh transaksi yang menyentuh rekening ini untuk rekonsiliasi saldo.
 */
export function getMutasiRekeningKas(kodeInput: string): AuditMutasiResponse {
  dbManager.synchronizeVirtualAccounts();
  const db = dbManager.get();
  const cleanKode = String(kodeInput || '').trim();
  const rek = (db.rekening || []).find(
    (r) => r.kode.toUpperCase() === cleanKode.toUpperCase()
  );

  if (!rek) {
    throw new Error(`Rekening "${cleanKode}" tidak ditemukan.`);
  }

  // Jika rekening operasional divisi (REK-GWA, REK-WAP, dll.), arahkan ke mutasi divisi
  if (
    rek.kategori === 'OPERASIONAL_DIVISI' ||
    (rek.kode.toUpperCase().startsWith('REK-') &&
      !rek.isAnakPerusahaan &&
      rek.kategori !== 'ANAK_PERUSAHAAN' &&
      !rek.isRekeningTitip &&
      rek.kategori !== 'REKENING_TITIP')
  ) {
    return getMutasiDivisi(rek.kode);
  }

  const targetKode = rek.kode;
  const targetUp = targetKode.toUpperCase();
  const isKas01 = targetUp === 'KAS01';
  const cutoff = rek.ledgerStartDate ? toDateKey(rek.ledgerStartDate) : 0;
  const inRange = (tgl?: string) => !cutoff || toDateKey(tgl) >= cutoff;

  const rekNameMap = new Map(
    (db.rekening || []).map((r) => [r.kode.toUpperCase(), `${r.nama} (${r.kode})`])
  );
  const fmtRek = (k?: string) => (k ? rekNameMap.get(k.toUpperCase()) || k : '-');

  const rawRows: Array<Omit<AuditMutasiRow, 'saldoBerjalan'>> = [];

  const bayarBonIdSet = new Set((db.bayarBon || []).map((b) => b.idTransaksi));

  // 1. PENJUALAN BARANG TOKO (Tunai / Transfer + DP Kasbon jika belum masuk db.bayarBon) & NOTA SILANG BAYAR LUNAS MASUK KAS PT
  for (const p of db.penjualan || []) {
    if (!inRange(p.tanggal)) continue;
    const isNotaSilangLunasKasPt = Boolean(
      p.isNotaSilang && p.modeNotaSilang === 'BAYAR_LUNAS_KAS_PT' && (p.metode === 'TUNAI' || p.metode === 'TRANSFER')
    );
    if (
      p.metode === 'SINKRON' ||
      p.metode === 'INTERNAL_PT' ||
      p.metode === 'PEMAKAIAN_PENGELUARAN' ||
      (p.isNotaSilang && !isNotaSilangLunasKasPt)
    ) {
      continue;
    }

    if (p.metode === 'KASBON') {
      const dpNom = Math.round(Number(p.dpNominal) || 0);
      const alreadyInBayarBon = Boolean(p.idBayarBonDp && bayarBonIdSet.has(p.idBayarBonDp));
      if (dpNom > 0 && !alreadyInBayarBon) {
        const dpRek = String(p.dpRekeningTujuan || (p.dpMetode === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
        if (dpRek === targetUp) {
          const ringkas = (p.items || []).map((i) => `${i.namaProduk} (${i.qty})`).slice(0, 3).join(', ');
          rawRows.push({
            id: `PJ-DP-${p.noPenjualan}`,
            refId: p.noPenjualan,
            tanggal: p.tanggal,
            jam: p.jam || '00:00:00',
            timestampMs: toTsMs(p.tanggal, p.jam, p.createdAt),
            kategori: 'PENJUALAN_DP',
            kategoriLabel: 'DP Penjualan Kasbon',
            uraian: `DP Kasbon ${p.noPenjualan}${ringkas ? ` · ${ringkas}` : ''}`,
            pihakTerkait: p.namaMitra || 'Umum',
            divisi: p.divisi || 'Wijaya Karya',
            rekeningTerkait: targetKode,
            metode: p.dpMetode || 'TUNAI',
            masuk: dpNom,
            keluar: 0,
          });
        }
      }
      continue;
    }

    const rekTujuan = String(p.rekeningTujuan || (p.metode === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekTujuan === targetUp || (isKas01 && !p.rekeningTujuan && p.metode === 'TUNAI')) {
      const nom = Math.round(Number(p.totalNominal) || 0);
      if (nom > 0) {
        const ringkas = (p.items || []).map((i) => `${i.namaProduk} (${i.qty})`).slice(0, 3).join(', ');
        rawRows.push({
          id: isNotaSilangLunasKasPt ? `NSL-KAS-${p.noPenjualan}` : `PJ-${p.noPenjualan}`,
          refId: p.noPenjualan,
          tanggal: p.tanggal,
          jam: p.jam || '00:00:00',
          timestampMs: toTsMs(p.tanggal, p.jam, p.createdAt),
          kategori: isNotaSilangLunasKasPt ? 'NOTA_SILANG_LUNAS_MASUK' : 'PENJUALAN_TOKO',
          kategoriLabel: isNotaSilangLunasKasPt
            ? `Titipan Lunas ${p.namaAnakPerusahaan || 'DP Parabot'} (Hutang PT)`
            : 'Penjualan Barang Toko',
          uraian: isNotaSilangLunasKasPt
            ? `Terima lunas (${p.metode}) belanja ${p.namaAnakPerusahaan || 'DP Parabot'} a.n. ${p.namaMitra || 'Customer Umum'} → Hutang PT ke ${p.namaAnakPerusahaan || 'DP Parabot'}${ringkas ? `: ${ringkas}` : ''}`
            : `Penjualan ${p.metode}${ringkas ? `: ${ringkas}` : ''}`,
          pihakTerkait: isNotaSilangLunasKasPt
            ? `${p.namaMitra || 'Customer Umum'} → ${p.namaAnakPerusahaan || 'DP Parabot'}`
            : p.namaMitra || 'Umum',
          divisi: p.divisi || (isNotaSilangLunasKasPt ? 'PT Wijaya Agro Perkasa' : 'Wijaya Karya'),
          rekeningTerkait: targetKode,
          metode: p.metode,
          masuk: nom,
          keluar: 0,
        });
      }
    }
  }

  // 2. PENJUALAN HASIL BUMI (Tunai / Transfer)
  for (const j of db.penjualanHasilBumi || []) {
    if (!inRange(j.tanggal)) continue;
    if (j.metodePembayaran === 'PIUTANG' || j.metodePembayaran === 'BELUM_PUTUS_HARGA' || j.metodePembayaran === 'SINKRON') {
      continue;
    }
    const rekTujuan = String(j.rekeningTujuan || (j.metodePembayaran === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekTujuan === targetUp || (isKas01 && !j.rekeningTujuan && j.metodePembayaran === 'TUNAI')) {
      const nom = Math.round(Number(j.totalNominal) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `JHB-${j.noPenjualan}`,
          refId: j.noPenjualan,
          tanggal: j.tanggal,
          jam: j.jam || '00:00:00',
          timestampMs: toTsMs(j.tanggal, j.jam, j.createdAt),
          kategori: 'PENJUALAN_HB',
          kategoriLabel: 'Penjualan Hasil Bumi',
          uraian: `Jual ${j.komoditasNama} (${Number(j.beratBersih || 0).toLocaleString('id-ID')} Kg)${j.keterangan ? ` · ${j.keterangan}` : ''}`,
          pihakTerkait: j.namaMitra || '-',
          divisi: j.divisi || 'Gudang Wijaya Agro',
          rekeningTerkait: targetKode,
          metode: j.metodePembayaran,
          masuk: nom,
          keluar: 0,
        });
      }
    }
  }

  // 3. UANG MASUK (termasuk Settlement Buyer Surat Jalan, Penjualan HB Belum Putus, Setoran Modal, dll.)
  for (const um of db.uangMasuk || []) {
    if (!inRange(um.tanggal)) continue;
    if (um.metode === 'SINKRON' || String(um.rekeningTujuan || '').toUpperCase() === 'SINKRON') continue;
    const rekTujuan = String(um.rekeningTujuan || (um.metode === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekTujuan === targetUp || (isKas01 && !um.rekeningTujuan && um.metode === 'TUNAI')) {
      const nom = Math.round(Number(um.nominal) || 0);
      if (nom > 0) {
        const isSjBuyer = um.kategori === 'SETTLEMENT_BUYER_SJ';
        rawRows.push({
          id: `UM-${um.idTransaksi}`,
          refId: um.idTransaksi,
          tanggal: um.tanggal,
          jam: um.jam || '00:00:00',
          timestampMs: toTsMs(um.tanggal, um.jam, um.createdAt),
          kategori: isSjBuyer ? 'UANG_MASUK_SJ' : 'UANG_MASUK',
          kategoriLabel: isSjBuyer ? 'Uang Masuk Buyer (Surat Jalan)' : `Uang Masuk (${um.kategori || 'Umum'})`,
          uraian: um.keterangan || `Uang Masuk (${um.kategori})`,
          pihakTerkait: um.namaPengirim || um.pengirim || '-',
          divisi: um.divisi || 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: um.metode,
          masuk: nom,
          keluar: 0,
        });
      }
    }
  }

  // 4. BAYAR BON / PELUNASAN PIUTANG (Kas / Transfer fisik)
  for (const b of db.bayarBon || []) {
    if (!inRange(b.tanggal)) continue;
    if (
      b.metode === 'SINKRON' ||
      b.metode === 'KOMPENSASI_TITIP' ||
      b.metode === 'POTONG_GAJI' ||
      b.isKompensasiTitipan ||
      b.isPotongGaji ||
      b.isSuratJalanPotongBon
    ) {
      continue;
    }
    const rekTujuan = String(b.rekeningTujuan || (b.metode === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekTujuan === targetUp || (isKas01 && !b.rekeningTujuan && b.metode === 'TUNAI')) {
      const nom = Math.round(Number(b.nominalBayar) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `BYB-${b.idTransaksi}`,
          refId: b.idTransaksi,
          tanggal: b.tanggal,
          jam: b.jam || '00:00:00',
          timestampMs: toTsMs(b.tanggal, b.jam, b.createdAt),
          kategori: 'BAYAR_BON',
          kategoriLabel: 'Pelunasan Piutang / Bayar Bon',
          uraian: b.keterangan || `Pelunasan Kasbon / Piutang dari ${b.namaMitra}`,
          pihakTerkait: b.namaMitra || '-',
          divisi: 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: b.metode,
          masuk: nom,
          keluar: 0,
        });
      }
    }
  }

  // 5. PEMBELIAN HASIL BUMI (Kas / Transfer KELUAR, dan Pinjaman Dana MASUK)
  for (const b of db.pembelianHasilBumi || []) {
    if (!inRange(b.tanggal)) continue;
    const isPinjamanDana =
      b.komoditasKode === 'PINJAMAN_DANA' || Boolean(b.komoditasNama?.includes('Pinjaman Uang'));

    if (isPinjamanDana) {
      if (String(b.rekeningSumber || '').toUpperCase() === targetUp) {
        const nom = Math.round(Number(b.totalNominal) || 0);
        if (nom > 0) {
          rawRows.push({
            id: `PINJ-${b.noPembelian}`,
            refId: b.noPembelian,
            tanggal: b.tanggal,
            jam: b.jam || '00:00:00',
            timestampMs: toTsMs(b.tanggal, b.jam, b.createdAt),
            kategori: 'PINJAMAN_DANA_MITRA',
            kategoriLabel: 'Pinjaman / Titip Dana Mitra (Masuk)',
            uraian: b.keterangan || `Pinjaman / Titip Dana dari ${b.namaMitra}`,
            pihakTerkait: b.namaMitra || '-',
            divisi: b.divisi || 'PT Wijaya Agro Perkasa',
            rekeningTerkait: targetKode,
            metode: b.metodePembayaran,
            masuk: nom,
            keluar: 0,
          });
        }
      }
      continue;
    }

    if (
      b.metodePembayaran === 'TITIP' ||
      b.metodePembayaran === 'SINKRON' ||
      b.isNotaSilang ||
      b.komoditasKode === 'NOTA_SILANG'
    ) {
      continue;
    }

    const rekSumber = String(b.rekeningSumber || (b.metodePembayaran === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekSumber === targetUp || (isKas01 && !b.rekeningSumber && b.metodePembayaran === 'TUNAI')) {
      const nom = Math.round(Number(b.totalNominal) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `BHB-${b.noPembelian}`,
          refId: b.noPembelian,
          tanggal: b.tanggal,
          jam: b.jam || '00:00:00',
          timestampMs: toTsMs(b.tanggal, b.jam, b.createdAt),
          kategori: 'PEMBELIAN_HB',
          kategoriLabel: 'Pembelian Hasil Bumi',
          uraian: `Beli ${b.komoditasNama} (${Number(b.beratBersih || 0).toLocaleString('id-ID')} Kg)${b.keterangan ? ` · ${b.keterangan}` : ''}`,
          pihakTerkait: b.namaMitra || '-',
          divisi: b.divisi || 'Gudang Wijaya Agro',
          rekeningTerkait: targetKode,
          metode: b.metodePembayaran,
          masuk: 0,
          keluar: nom,
        });
      }
    }
  }

  // 6. PEMBELIAN BARANG TOKO (Kulakan Tunai / Transfer)
  for (const pb of db.pembelianBarang || []) {
    if (!inRange(pb.tanggal)) continue;
    if (pb.metodePembayaran === 'HUTANG' || pb.metodePembayaran === 'SINKRON') continue;
    const rekSumber = String(pb.rekeningSumber || (pb.metodePembayaran === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekSumber === targetUp || (isKas01 && !pb.rekeningSumber && pb.metodePembayaran === 'TUNAI')) {
      const nom = Math.round(Number(pb.totalNominal) || 0);
      if (nom > 0) {
        const ringkas = (pb.items || []).map((i) => `${i.namaProduk} (${i.qty})`).slice(0, 3).join(', ');
        rawRows.push({
          id: `PB-${pb.noPembelian}`,
          refId: pb.noPembelian,
          tanggal: pb.tanggal,
          jam: pb.jam || '00:00:00',
          timestampMs: toTsMs(pb.tanggal, pb.jam, pb.createdAt),
          kategori: 'PEMBELIAN_BARANG',
          kategoriLabel: 'Pembelian / Kulakan Barang',
          uraian: `Kulakan${ringkas ? `: ${ringkas}` : ''}${pb.keterangan ? ` · ${pb.keterangan}` : ''}`,
          pihakTerkait: pb.namaMitra || '-',
          divisi: pb.divisi || 'Wijaya Karya',
          rekeningTerkait: targetKode,
          metode: pb.metodePembayaran,
          masuk: 0,
          keluar: nom,
        });
      }
    }
  }

  // 7. PENGELUARAN (termasuk Bayar Supplier Surat Jalan / Biaya Operasional)
  for (const ex of db.pengeluaran || []) {
    if (!inRange(ex.tanggal)) continue;
    if (
      ex.isNonKas ||
      String(ex.rekeningSumber || '').toUpperCase() === 'SINKRON' ||
      String(ex.rekeningSumber || '').toUpperCase() === 'STOK_INTERNAL'
    ) {
      continue;
    }
    const rekSumber = String(ex.rekeningSumber || 'KAS01').toUpperCase();
    if (rekSumber === targetUp) {
      const nom = Math.round(Number(ex.nominal) || 0);
      if (nom !== 0) {
        const isBayarSj = String(ex.kategori || '').toUpperCase() === 'PEMBAYARAN_SUPPLIER_SJ';
        rawRows.push({
          id: `EXP-${ex.idTransaksi}`,
          refId: ex.idTransaksi,
          tanggal: ex.tanggal,
          jam: ex.jam || '00:00:00',
          timestampMs: toTsMs(ex.tanggal, ex.jam, ex.createdAt),
          kategori: isBayarSj ? 'BAYAR_SUPPLIER_SJ' : 'PENGELUARAN',
          kategoriLabel: isBayarSj ? 'Pembayaran Supplier (Surat Jalan)' : 'Pengeluaran Operasional',
          uraian: `[${ex.kategori}] ${ex.keterangan || '-'}`,
          pihakTerkait: ex.penerima || ex.kategori || '-',
          divisi: ex.divisi || 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: targetUp === 'KAS01' ? 'TUNAI' : 'TRANSFER',
          masuk: nom < 0 ? Math.abs(nom) : 0,
          keluar: nom > 0 ? nom : 0,
        });
      }
    }
  }

  // 8. KASBON UANG (Pinjaman Uang Keluar ke Mitra / Karyawan)
  for (const k of db.kasbonUang || []) {
    if (!inRange(k.tanggal)) continue;
    if (
      k.isNotaLalu ||
      String(k.rekeningSumber || '').toUpperCase() === 'BON01' ||
      String(k.rekeningSumber || '').toUpperCase() === 'SINKRON' ||
      k.metode === 'SINKRON'
    ) {
      continue;
    }
    const rekSumber = String(k.rekeningSumber || (k.metode === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekSumber === targetUp || (isKas01 && !k.rekeningSumber && k.metode === 'TUNAI')) {
      const nom = Math.round(Number(k.nominal) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `KBU-${k.idTransaksi}`,
          refId: k.idTransaksi,
          tanggal: k.tanggal,
          jam: k.jam || '00:00:00',
          timestampMs: toTsMs(k.tanggal, k.jam, k.createdAt),
          kategori: 'KASBON_UANG',
          kategoriLabel: 'Kasbon Uang Pinjaman',
          uraian: k.keterangan || `Kasbon Uang kepada ${k.namaMitra}`,
          pihakTerkait: k.namaMitra || '-',
          divisi: 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: k.metode,
          masuk: 0,
          keluar: nom,
        });
      }
    }
  }

  // 9. PENCAIRAN TITIPAN HASIL BUMI / BAYAR HUTANG MITRA
  for (const pt of db.pencairanTitipan || []) {
    if (!inRange(pt.tanggal)) continue;
    if (
      pt.metodePembayaran === 'SINKRON' ||
      pt.metodePembayaran === 'KOMPENSASI_BON' ||
      pt.isKompensasiBon
    ) {
      continue;
    }
    const rekSumber = String(pt.rekeningSumber || (pt.metodePembayaran === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekSumber === targetUp || (isKas01 && !pt.rekeningSumber && pt.metodePembayaran === 'TUNAI')) {
      const nom = Math.round(Number(pt.nominalPencairan) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `PT-${pt.idPencairan}`,
          refId: pt.idPencairan,
          tanggal: pt.tanggal,
          jam: pt.jam || '00:00:00',
          timestampMs: toTsMs(pt.tanggal, pt.jam, pt.createdAt),
          kategori: 'PENCAIRAN_TITIPAN',
          kategoriLabel: 'Pencairan Titipan / Bayar Hutang Mitra',
          uraian: pt.keterangan || `Pencairan Titipan Hasil Bumi — ${pt.namaMitra}`,
          pihakTerkait: pt.namaMitra || '-',
          divisi: 'Gudang Wijaya Agro',
          rekeningTerkait: targetKode,
          metode: pt.metodePembayaran,
          masuk: 0,
          keluar: nom,
        });
      }
    }
  }

  // 10. PENGGAJIAN KARYAWAN (Normal & SPLIT Tunai+Transfer)
  for (const g of db.penggajian || []) {
    if (!inRange(g.tanggal)) continue;
    if (g.metodePembayaran === 'SINKRON') continue;

    if (g.metodePembayaran === 'SPLIT') {
      const rekTunai = String(g.rekeningSumberTunai || 'KAS01').toUpperCase();
      const rekTrf = String(g.rekeningSumberTransfer || '').toUpperCase();
      if (rekTunai === targetUp && (Number(g.nominalTunai) || 0) > 0) {
        rawRows.push({
          id: `GJ-TUNAI-${g.id}`,
          refId: g.slipNomor || g.id,
          tanggal: g.tanggal,
          jam: g.jam || '00:00:00',
          timestampMs: toTsMs(g.tanggal, g.jam),
          kategori: 'PENGGAJIAN',
          kategoriLabel: 'Pembayaran Gaji Karyawan',
          uraian: `Gaji (Bagian Tunai) ${g.namaKaryawan} — ${g.periodeBulan}`,
          pihakTerkait: g.namaKaryawan,
          divisi: g.divisi || 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: 'SPLIT (TUNAI)',
          masuk: 0,
          keluar: Math.round(Number(g.nominalTunai) || 0),
        });
      }
      if (rekTrf === targetUp && (Number(g.nominalTransfer) || 0) > 0) {
        rawRows.push({
          id: `GJ-TRF-${g.id}`,
          refId: g.slipNomor || g.id,
          tanggal: g.tanggal,
          jam: g.jam || '00:00:00',
          timestampMs: toTsMs(g.tanggal, g.jam),
          kategori: 'PENGGAJIAN',
          kategoriLabel: 'Pembayaran Gaji Karyawan',
          uraian: `Gaji (Bagian Transfer) ${g.namaKaryawan} — ${g.periodeBulan}`,
          pihakTerkait: g.namaKaryawan,
          divisi: g.divisi || 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: 'SPLIT (TRANSFER)',
          masuk: 0,
          keluar: Math.round(Number(g.nominalTransfer) || 0),
        });
      }
      continue;
    }

    const rekSumber = String(g.rekeningSumber || (g.metodePembayaran === 'TUNAI' ? 'KAS01' : '')).toUpperCase();
    if (rekSumber === targetUp || (isKas01 && !g.rekeningSumber && g.metodePembayaran === 'TUNAI')) {
      const nom = Math.round(Number(g.gajiBersihDibayar) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `GJ-${g.id}`,
          refId: g.slipNomor || g.id,
          tanggal: g.tanggal,
          jam: g.jam || '00:00:00',
          timestampMs: toTsMs(g.tanggal, g.jam),
          kategori: 'PENGGAJIAN',
          kategoriLabel: 'Pembayaran Gaji Karyawan',
          uraian: g.keterangan || `Gaji ${g.namaKaryawan} (${g.periodeBulan})`,
          pihakTerkait: g.namaKaryawan,
          divisi: g.divisi || 'PT Wijaya Agro Perkasa',
          rekeningTerkait: targetKode,
          metode: g.metodePembayaran,
          masuk: 0,
          keluar: nom,
        });
      }
    }
  }

  // 11. TRANSFER ANTAR REKENING (Pindah Buku / Dropping / Tarik Tunai / Setor Bank / Rekening Titip)
  for (const t of db.transferRekening || []) {
    if (!inRange(t.tanggal)) continue;
    if (t.status && t.status !== 'BERHASIL') continue;
    const nom = Math.round(Number(t.nominal) || 0);
    if (nom <= 0) continue;

    if (String(t.rekeningTujuan || '').toUpperCase() === targetUp) {
      rawRows.push({
        id: `TRF-IN-${t.noTransfer}`,
        refId: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam || '00:00:00',
        timestampMs: toTsMs(t.tanggal, t.jam, t.createdAt),
        kategori: 'TRANSFER_MASUK',
        kategoriLabel: 'Transfer Masuk (Pindah Buku)',
        uraian: `Dari ${fmtRek(t.rekeningSumber)}${t.keterangan ? ` · ${t.keterangan}` : ''}`,
        pihakTerkait: fmtRek(t.rekeningSumber),
        divisi: 'Internal PT',
        rekeningTerkait: t.rekeningSumber,
        metode: 'TRANSFER',
        masuk: nom,
        keluar: 0,
      });
    }

    if (String(t.rekeningSumber || '').toUpperCase() === targetUp) {
      rawRows.push({
        id: `TRF-OUT-${t.noTransfer}`,
        refId: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam || '00:00:00',
        timestampMs: toTsMs(t.tanggal, t.jam, t.createdAt),
        kategori: 'TRANSFER_KELUAR',
        kategoriLabel: 'Transfer Keluar (Pindah Buku)',
        uraian: `Ke ${fmtRek(t.rekeningTujuan)}${t.keterangan ? ` · ${t.keterangan}` : ''}`,
        pihakTerkait: fmtRek(t.rekeningTujuan),
        divisi: 'Internal PT',
        rekeningTerkait: t.rekeningTujuan,
        metode: 'TRANSFER',
        masuk: 0,
        keluar: nom,
      });
    }
  }

  // 12. BRILINK (Admin & Mutasi Pokok Bank <-> Kas Tunai)
  for (const br of db.brilink || []) {
    if (!inRange(br.tanggal)) continue;
    const nomAdmin = Math.round(Number(br.nominalAdmin) || 0);
    const nomPokok = Math.round(Number(br.nominalPokok) || 0);
    const rekAdm = String(br.rekeningAdmin || 'KAS01').toUpperCase();
    const rekKas = String(br.rekeningKasTunai || 'KAS01').toUpperCase();
    const rekBank = String(br.rekeningBank || '').toUpperCase();

    if (br.jenisBrilink === 'TARIK_TUNAI') {
      // Nasabah transfer pokok ke Bank PT (+pokok di rekBank), PT serahkan cash (-pokok di rekKas), PT terima adm (+adm di rekAdm)
      if (nomAdmin > 0 && rekAdm === targetUp) {
        rawRows.push({
          id: `BRI-ADM-${br.idTransaksi}`,
          refId: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam || '00:00:00',
          timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
          kategori: 'BRILINK',
          kategoriLabel: 'BRILink (Admin / Pokok)',
          uraian: `BRILink Adm Tarik Tunai: ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan || 'Nasabah BRILink',
          divisi: br.divisi || 'BRILink',
          rekeningTerkait: targetKode,
          metode: 'BRILINK',
          masuk: nomAdmin,
          keluar: 0,
        });
      }
      if (nomPokok > 0 && rekBank && rekBank === targetUp) {
        rawRows.push({
          id: `BRI-POK-IN-${br.idTransaksi}`,
          refId: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam || '00:00:00',
          timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
          kategori: 'BRILINK',
          kategoriLabel: 'BRILink (Admin / Pokok)',
          uraian: `BRILink Pokok Masuk (Tarik Tunai Nasabah): ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan || 'Nasabah BRILink',
          divisi: br.divisi || 'BRILink',
          rekeningTerkait: targetKode,
          metode: 'BRILINK',
          masuk: nomPokok,
          keluar: 0,
        });
      }
      if (nomPokok > 0 && rekKas === targetUp) {
        rawRows.push({
          id: `BRI-POK-OUT-${br.idTransaksi}`,
          refId: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam || '00:00:00',
          timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
          kategori: 'BRILINK',
          kategoriLabel: 'BRILink (Admin / Pokok)',
          uraian: `BRILink Kas Keluar (Tarik Tunai Nasabah): ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan || 'Nasabah BRILink',
          divisi: br.divisi || 'BRILink',
          rekeningTerkait: targetKode,
          metode: 'BRILINK',
          masuk: 0,
          keluar: nomPokok,
        });
      }
    } else {
      // TUKAR_CASH: PT transfer pokok dari Bank PT (-pokok di rekBank) + adm (-adm di rekAdm), PT terima cash (+pokok di rekKas)
      if (nomAdmin > 0 && rekAdm === targetUp) {
        rawRows.push({
          id: `BRI-ADM-${br.idTransaksi}`,
          refId: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam || '00:00:00',
          timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
          kategori: 'BRILINK',
          kategoriLabel: 'BRILink (Admin / Pokok)',
          uraian: `BRILink Adm Tukar Cash PT: ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan || 'Agen BRILink',
          divisi: br.divisi || 'BRILink',
          rekeningTerkait: targetKode,
          metode: 'BRILINK',
          masuk: 0,
          keluar: nomAdmin,
        });
      }
      if (nomPokok > 0 && rekBank && rekBank === targetUp) {
        rawRows.push({
          id: `BRI-POK-OUT-${br.idTransaksi}`,
          refId: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam || '00:00:00',
          timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
          kategori: 'BRILINK',
          kategoriLabel: 'BRILink (Admin / Pokok)',
          uraian: `BRILink Transfer Pokok (Tukar Cash PT): ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan || 'Agen BRILink',
          divisi: br.divisi || 'BRILink',
          rekeningTerkait: targetKode,
          metode: 'BRILINK',
          masuk: 0,
          keluar: nomPokok,
        });
      }
      if (nomPokok > 0 && rekKas === targetUp) {
        rawRows.push({
          id: `BRI-POK-IN-${br.idTransaksi}`,
          refId: br.idTransaksi,
          tanggal: br.tanggal,
          jam: br.jam || '00:00:00',
          timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
          kategori: 'BRILINK',
          kategoriLabel: 'BRILink (Admin / Pokok)',
          uraian: `BRILink Cash Masuk (Tukar Cash PT): ${br.keterangan || br.namaPelanggan}`,
          pihakTerkait: br.namaPelanggan || 'Agen BRILink',
          divisi: br.divisi || 'BRILink',
          rekeningTerkait: targetKode,
          metode: 'BRILINK',
          masuk: nomPokok,
          keluar: 0,
        });
      }
    }
  }

  // 13. CASH OPNAME ADJUSTMENTS (Khusus KAS01)
  if (isKas01) {
    for (const op of db.cashOpnameLogs || []) {
      if (!inRange(op.tanggal)) continue;
      if (op.sesuaikanSaldoSistem && op.selisih) {
        const diff = Math.round(Number(op.selisih) || 0);
        if (diff !== 0) {
          rawRows.push({
            id: `OPN-${op.id}`,
            refId: op.id,
            tanggal: op.tanggal,
            jam: op.jam || '00:00:00',
            timestampMs: toTsMs(op.tanggal, op.jam, op.createdAt),
            kategori: 'CASH_OPNAME',
            kategoriLabel: 'Penyesuaian Cash Opname',
            uraian: op.catatan || 'Penyesuaian selisih fisik laci kasir',
            pihakTerkait: op.petugasKasir || 'Kasir',
            divisi: 'Internal PT',
            rekeningTerkait: 'KAS01',
            metode: 'OPNAME',
            masuk: diff > 0 ? diff : 0,
            keluar: diff < 0 ? Math.abs(diff) : 0,
          });
        }
      }
    }
  }

  return buildFinalAuditResponse({
    targetType: 'REKENING_KAS',
    kode: rek.kode,
    nama: rek.nama,
    nomorRekening: rek.nomorRekening,
    atasNama: rek.atasNama,
    kategoriRekening: rek.kategori || 'PERUSAHAAN',
    ledgerStartDate: rek.ledgerStartDate,
    saldoAwal: rek.saldoAwal || 0,
    saldoTercatatSistem: rek.saldoSaatIni || 0,
    rawRows,
  });
}

/**
 * Audit Mutasi Keuangan Lengkap Per Divisi (PT WAP, GWA, CV WA, WT, BRILink, Okussa, WK)
 * Menggunakan aturan routing 100% identik dengan Laba Rugi Divisi + Dropping Kas Divisi.
 */
export function getMutasiDivisi(namaOrKodeInput: string): AuditMutasiResponse {
  dbManager.synchronizeDivisiAccounts();
  const db = dbManager.get();
  const cleanKey = String(namaOrKodeInput || '').trim().toLowerCase();
  const allDivisi = dbManager
    .getDivisiList()
    .filter((d) => !isExcludedFromDivisi(d.nama) && !isExcludedFromDivisi(d.id));

  const targetDiv = allDivisi.find(
    (d) =>
      d.nama.toLowerCase() === cleanKey ||
      d.kodeRekening.toLowerCase() === cleanKey ||
      d.id.toLowerCase() === cleanKey
  );

  if (!targetDiv) {
    throw new Error(`Divisi "${namaOrKodeInput}" tidak ditemukan.`);
  }

  const norm = (s?: string) => String(s || '').trim().toLowerCase();
  const targetNorm = norm(targetDiv.nama);
  const rekDiv = (db.rekening || []).find((r) => r.kode === targetDiv.kodeRekening);
  const divisiByRekKode = new Map(allDivisi.map((d) => [d.kodeRekening.toUpperCase(), norm(d.nama)]));
  const produkUpperMap = new Map((db.produk || []).map((p) => [String(p.kode || '').trim().toUpperCase(), p]));
  const cleanDiv = (d?: string) => (d && !isExcludedFromDivisi(d) ? d : undefined);

  const resolveStoreItemDivNorm = (kodeProduk?: string, fallbackDivisi?: string, metode?: string) => {
    if (isTanpaDivisi(fallbackDivisi)) return '__tanpa_divisi__';
    if (metode === 'INTERNAL_PT') return norm(cleanDiv(fallbackDivisi) || 'PT Wijaya Agro Perkasa');
    const cleanKode = String(kodeProduk || '').trim().toUpperCase();
    if (cleanKode && cleanKode !== 'REKAP-NOTA' && cleanKode !== 'NOTA-SILANG') {
      const prod = produkUpperMap.get(cleanKode);
      if (String(prod?.kategori || '').trim().toUpperCase() === 'OKUSSA') {
        return norm('Okussa');
      }
      return norm('Wijaya Karya');
    }
    if (norm(cleanDiv(fallbackDivisi)) === 'okussa') return norm('Okussa');
    return norm('Wijaya Karya');
  };

  const resolveHasilBumiDivNorm = (divisi?: string) => {
    if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
    return norm(cleanDiv(divisi) || 'Gudang Wijaya Agro');
  };

  const resolveBebanDivNorm = (divisi?: string, rekeningSumber?: string) => {
    if (isTanpaDivisi(divisi)) return '__tanpa_divisi__';
    const validDiv = cleanDiv(divisi);
    if (validDiv && String(validDiv).trim()) return norm(validDiv);
    if (rekeningSumber) {
      const mapped = divisiByRekKode.get(String(rekeningSumber).toUpperCase());
      if (mapped) return mapped;
    }
    return norm('PT Wijaya Agro Perkasa');
  };

  // Build nota division shares for bayarBon allocation
  const penjualanNotaSharesMap = new Map<string, Array<{ divNorm: string; ratio: number }>>();
  for (const p of db.penjualan || []) {
    if (p.isNotaSilang || p.metode === 'PEMAKAIAN_PENGELUARAN') continue;
    if (p.noPenjualan) {
      const perDiv = new Map<string, number>();
      if (Array.isArray(p.items) && p.items.length > 0) {
        for (const it of p.items) {
          const dn = resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode);
          const sub = Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0);
          perDiv.set(dn, (perDiv.get(dn) || 0) + sub);
        }
      } else {
        const dn = resolveStoreItemDivNorm(undefined, p.divisi, p.metode);
        perDiv.set(dn, Number(p.totalNominal) || 0);
      }
      const sumSub = Array.from(perDiv.values()).reduce((s, v) => s + v, 0) || 1;
      penjualanNotaSharesMap.set(
        p.noPenjualan,
        Array.from(perDiv.entries()).map(([divNorm, val]) => ({ divNorm, ratio: val / sumSub }))
      );
    }
  }
  for (const j of db.penjualanHasilBumi || []) {
    if (j.noPenjualan) {
      penjualanNotaSharesMap.set(j.noPenjualan, [{ divNorm: resolveHasilBumiDivNorm(j.divisi), ratio: 1 }]);
    }
  }

  const rawRows: Array<Omit<AuditMutasiRow, 'saldoBerjalan'>> = [];

  // 1. Penjualan Barang Toko (Kas/Transfer)
  for (const p of db.penjualan || []) {
    if (p.metode !== 'TUNAI' && p.metode !== 'TRANSFER') continue;
    if (p.isNotaSilang) continue;

    let matchingSub = 0;
    let ringkas = '';
    if (Array.isArray(p.items) && p.items.length > 0) {
      const matched = p.items.filter((it) => resolveStoreItemDivNorm(it.kodeProduk, p.divisi, p.metode) === targetNorm);
      if (matched.length === 0) continue;
      matchingSub = matched.reduce((s, it) => s + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.harga) || 0)), 0);
      ringkas = matched.map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`).slice(0, 3).join(', ');
    } else if (resolveStoreItemDivNorm(undefined, p.divisi, p.metode) === targetNorm) {
      matchingSub = Number(p.totalNominal) || 0;
    }

    if (matchingSub > 0) {
      rawRows.push({
        id: `DIV-PJ-${p.noPenjualan}`,
        refId: p.noPenjualan,
        tanggal: p.tanggal,
        jam: p.jam || '00:00:00',
        timestampMs: toTsMs(p.tanggal, p.jam, p.createdAt),
        kategori: 'PENJUALAN_TOKO',
        kategoriLabel: 'Penjualan Barang / Jasa',
        uraian: `Penjualan ${p.metode}${ringkas ? `: ${ringkas}` : ''}`,
        pihakTerkait: p.namaMitra || 'Umum',
        divisi: targetDiv.nama,
        rekeningTerkait: p.rekeningTujuan || (p.metode === 'TUNAI' ? 'KAS01' : '-'),
        metode: p.metode,
        masuk: Math.round(matchingSub),
        keluar: 0,
      });
    }
  }

  // 2. Penjualan Hasil Bumi (Kas/Transfer)
  for (const j of db.penjualanHasilBumi || []) {
    if (resolveHasilBumiDivNorm(j.divisi) !== targetNorm) continue;
    if (j.metodePembayaran !== 'TUNAI' && j.metodePembayaran !== 'TRANSFER') continue;
    const nom = Math.round(Number(j.totalNominal) || 0);
    if (nom > 0) {
      rawRows.push({
        id: `DIV-JHB-${j.noPenjualan}`,
        refId: j.noPenjualan,
        tanggal: j.tanggal,
        jam: j.jam || '00:00:00',
        timestampMs: toTsMs(j.tanggal, j.jam, j.createdAt),
        kategori: 'PENJUALAN_HB',
        kategoriLabel: 'Penjualan Hasil Bumi',
        uraian: `Jual ${j.komoditasNama} (${Number(j.beratBersih || 0).toLocaleString('id-ID')} Kg)`,
        pihakTerkait: j.namaMitra || '-',
        divisi: targetDiv.nama,
        rekeningTerkait: j.rekeningTujuan || '-',
        metode: j.metodePembayaran,
        masuk: nom,
        keluar: 0,
      });
    }
  }

  // 3. Pelunasan Piutang Nota (Bayar Bon Kas/Transfer)
  for (const b of db.bayarBon || []) {
    if (b.metode !== 'TUNAI' && b.metode !== 'TRANSFER') continue;
    if (b.isKompensasiTitipan || b.isPotongGaji) continue;
    for (const alok of b.alokasi || []) {
      if (alok.jenis === 'KASBON_BARANG' && (alok.nominalDibayar || 0) > 0) {
        const shares = penjualanNotaSharesMap.get(alok.refId) || [];
        for (const sh of shares) {
          if (sh.divNorm === targetNorm) {
            const nomAlok = Math.round((Number(alok.nominalDibayar) || 0) * sh.ratio);
            if (nomAlok > 0) {
              rawRows.push({
                id: `DIV-BYB-${b.idTransaksi}-${alok.refId}`,
                refId: b.idTransaksi,
                tanggal: b.tanggal,
                jam: b.jam || '00:00:00',
                timestampMs: toTsMs(b.tanggal, b.jam, b.createdAt),
                kategori: 'PELUNASAN_PIUTANG',
                kategoriLabel: 'Pelunasan Piutang Nota',
                uraian: `Pelunasan Nota ${alok.refId}${b.keterangan ? ` (${b.keterangan})` : ''}`,
                pihakTerkait: b.namaMitra || '-',
                divisi: targetDiv.nama,
                rekeningTerkait: b.rekeningTujuan || '-',
                metode: b.metode,
                masuk: nomAlok,
                keluar: 0,
              });
            }
          }
        }
      }
    }
  }

  // 4. Uang Masuk Divisi
  for (const um of db.uangMasuk || []) {
    if (isTanpaDivisi(um.divisi)) continue;
    if (norm(cleanDiv(um.divisi) || 'PT Wijaya Agro Perkasa') !== targetNorm) continue;
    if (isExcludedUangMasukFromDivisiCashflow(um)) continue;
    const nom = Math.round(Number(um.nominal) || 0);
    if (nom > 0) {
      rawRows.push({
        id: `DIV-UM-${um.idTransaksi}`,
        refId: um.idTransaksi,
        tanggal: um.tanggal,
        jam: um.jam || '00:00:00',
        timestampMs: toTsMs(um.tanggal, um.jam, um.createdAt),
        kategori: 'UANG_MASUK',
        kategoriLabel: 'Uang Masuk Divisi',
        uraian: `[${um.kategori}] ${um.keterangan || '-'}`,
        pihakTerkait: um.namaPengirim || um.pengirim || '-',
        divisi: targetDiv.nama,
        rekeningTerkait: um.rekeningTujuan || '-',
        metode: um.metode,
        masuk: nom,
        keluar: 0,
      });
    }
  }

  // 5. Keuntungan Surat Jalan PT (Khusus PT WAP)
  if (targetNorm === norm('PT Wijaya Agro Perkasa')) {
    const sjPtEntries = computeSuratJalanKeuntunganPtEntries(db.suratJalan, db.uangMasuk);
    for (const e of sjPtEntries) {
      if (e.nominal > 0) {
        rawRows.push({
          id: `DIV-SJPT-${e.id}`,
          refId: e.id,
          tanggal: e.tanggal,
          jam: e.jam || '00:00:00',
          timestampMs: toTsMs(e.tanggal, e.jam, e.createdAt),
          kategori: 'KEUNTUNGAN_SJ',
          kategoriLabel: 'Komisi / Keuntungan Surat Jalan',
          uraian: e.keterangan,
          pihakTerkait: e.buyerKode ? `${e.namaMitra} (${e.buyerKode})` : e.namaMitra,
          divisi: targetDiv.nama,
          rekeningTerkait: e.rekeningFisik || 'BNI01',
          metode: 'SURAT_JALAN',
          masuk: Math.round(e.nominal),
          keluar: 0,
        });
      }
    }
  }

  // 6. BRILink Admin Masuk / Keluar
  for (const br of db.brilink || []) {
    if (isTanpaDivisi(br.divisi)) continue;
    if (norm(cleanDiv(br.divisi) || 'BRILink') !== targetNorm) continue;
    const adm = Math.round(Number(br.nominalAdmin) || 0);
    if (adm <= 0) continue;
    if (br.jenisBrilink === 'TARIK_TUNAI') {
      rawRows.push({
        id: `DIV-BRI-IN-${br.idTransaksi}`,
        refId: br.idTransaksi,
        tanggal: br.tanggal,
        jam: br.jam || '00:00:00',
        timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
        kategori: 'BRILINK_ADMIN',
        kategoriLabel: 'Admin BRILink (Tarik Tunai)',
        uraian: br.keterangan || `Adm Tarik Tunai — ${br.namaPelanggan}`,
        pihakTerkait: br.namaPelanggan || 'Nasabah',
        divisi: targetDiv.nama,
        rekeningTerkait: br.rekeningAdmin || 'KAS01',
        metode: 'BRILINK',
        masuk: adm,
        keluar: 0,
      });
    } else if (br.jenisBrilink === 'TUKAR_CASH') {
      rawRows.push({
        id: `DIV-BRI-OUT-${br.idTransaksi}`,
        refId: br.idTransaksi,
        tanggal: br.tanggal,
        jam: br.jam || '00:00:00',
        timestampMs: toTsMs(br.tanggal, br.jam, br.createdAt),
        kategori: 'BRILINK_ADMIN',
        kategoriLabel: 'Admin BRILink (Tukar Cash)',
        uraian: br.keterangan || `Adm Tukar Cash — ${br.namaPelanggan}`,
        pihakTerkait: br.namaPelanggan || 'Agen BRILink',
        divisi: targetDiv.nama,
        rekeningTerkait: br.rekeningAdmin || 'KAS01',
        metode: 'BRILINK',
        masuk: 0,
        keluar: adm,
      });
    }
  }

  // 7. Pembelian Barang (Kas/Transfer)
  for (const pb of db.pembelianBarang || []) {
    if (pb.metodePembayaran !== 'TUNAI' && pb.metodePembayaran !== 'TRANSFER') continue;
    let subNom = 0;
    let ringkas = '';
    if (Array.isArray(pb.items) && pb.items.length > 0) {
      const matched = pb.items.filter((it) => resolveStoreItemDivNorm(it.kodeProduk, pb.divisi) === targetNorm);
      if (matched.length === 0) continue;
      subNom = matched.reduce((s, it) => s + (Number(it.subtotal) || (Number(it.qty) || 0) * (Number(it.hargaBeliSatuan) || 0)), 0);
      ringkas = matched.map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`).slice(0, 3).join(', ');
    } else if (resolveStoreItemDivNorm(undefined, pb.divisi) === targetNorm) {
      subNom = Number(pb.totalNominal) || 0;
    }
    if (subNom > 0) {
      rawRows.push({
        id: `DIV-PB-${pb.noPembelian}`,
        refId: pb.noPembelian,
        tanggal: pb.tanggal,
        jam: pb.jam || '00:00:00',
        timestampMs: toTsMs(pb.tanggal, pb.jam, pb.createdAt),
        kategori: 'PEMBELIAN_BARANG',
        kategoriLabel: 'Pembelian Barang (Kas/Transfer)',
        uraian: `Kulakan${ringkas ? `: ${ringkas}` : ''}`,
        pihakTerkait: pb.namaMitra || '-',
        divisi: targetDiv.nama,
        rekeningTerkait: pb.rekeningSumber || '-',
        metode: pb.metodePembayaran,
        masuk: 0,
        keluar: Math.round(subNom),
      });
    }
  }

  // 8. Pembelian Hasil Bumi (Kas/Transfer)
  for (const phb of db.pembelianHasilBumi || []) {
    if (resolveHasilBumiDivNorm(phb.divisi) !== targetNorm) continue;
    if (
      phb.komoditasKode === 'PINJAMAN_DANA' ||
      phb.komoditasKode === 'TITIP_DANA' ||
      phb.komoditasKode === 'NOTA_SILANG' ||
      phb.isNotaSilang ||
      phb.isBelumPutusHarga ||
      String(phb.komoditasNama || '').toLowerCase().includes('pinjaman uang')
    ) {
      continue;
    }
    if (
      (phb.metodePembayaran === 'TUNAI' || phb.metodePembayaran === 'TRANSFER') &&
      phb.rekeningSumber !== 'TIT01' &&
      phb.rekeningSumber !== 'BON01'
    ) {
      const nom = Math.round(Number(phb.totalNominal) || 0);
      if (nom > 0) {
        rawRows.push({
          id: `DIV-BHB-${phb.noPembelian}`,
          refId: phb.noPembelian,
          tanggal: phb.tanggal,
          jam: phb.jam || '00:00:00',
          timestampMs: toTsMs(phb.tanggal, phb.jam, phb.createdAt),
          kategori: 'PEMBELIAN_HB',
          kategoriLabel: 'Pembelian Hasil Bumi (Kas/Transfer)',
          uraian: `Beli ${phb.komoditasNama} (${Number(phb.beratBersih || 0).toLocaleString('id-ID')} Kg)`,
          pihakTerkait: phb.namaMitra || '-',
          divisi: targetDiv.nama,
          rekeningTerkait: phb.rekeningSumber || '-',
          metode: phb.metodePembayaran,
          masuk: 0,
          keluar: nom,
        });
      }
    }
  }

  // 9. Pengeluaran Divisi
  for (const ex of db.pengeluaran || []) {
    if (resolveBebanDivNorm(ex.divisi, ex.rekeningSumber) !== targetNorm) continue;
    const nom = Math.round(Number(ex.nominal) || 0);
    if (nom !== 0) {
      rawRows.push({
        id: `DIV-EXP-${ex.idTransaksi}`,
        refId: ex.idTransaksi,
        tanggal: ex.tanggal,
        jam: ex.jam || '00:00:00',
        timestampMs: toTsMs(ex.tanggal, ex.jam, ex.createdAt),
        kategori: 'PENGELUARAN',
        kategoriLabel: 'Beban & Pengeluaran Operasional',
        uraian: `[${ex.kategori}] ${ex.keterangan || '-'}`,
        pihakTerkait: ex.penerima || ex.kategori || '-',
        divisi: targetDiv.nama,
        rekeningTerkait: ex.rekeningSumber || '-',
        metode: ex.rekeningSumber || '-',
        masuk: nom < 0 ? Math.abs(nom) : 0,
        keluar: nom > 0 ? nom : 0,
      });
    }
  }

  // 10. Penggajian Divisi
  for (const gj of db.penggajian || []) {
    if (resolveBebanDivNorm(gj.divisi, gj.rekeningSumber) !== targetNorm) continue;
    const nom = Math.round(Number(gj.gajiBersihDibayar) || 0);
    if (nom > 0) {
      rawRows.push({
        id: `DIV-GJ-${gj.id}`,
        refId: gj.slipNomor || gj.id,
        tanggal: gj.tanggal,
        jam: gj.jam || '00:00:00',
        timestampMs: toTsMs(gj.tanggal, gj.jam),
        kategori: 'PENGGAJIAN',
        kategoriLabel: 'Gaji & Upah Karyawan',
        uraian: `Gaji ${gj.namaKaryawan} (${gj.periodeBulan})`,
        pihakTerkait: gj.namaKaryawan,
        divisi: targetDiv.nama,
        rekeningTerkait: gj.rekeningSumber || '-',
        metode: gj.metodePembayaran,
        masuk: 0,
        keluar: nom,
      });
    }
  }

  // 11. Dropping / Transfer Antar Rekening Divisi
  for (const t of db.transferRekening || []) {
    if (t.status && t.status !== 'BERHASIL') continue;
    const nom = Math.round(Number(t.nominal) || 0);
    if (nom <= 0) continue;
    if (t.rekeningTujuan === targetDiv.kodeRekening) {
      rawRows.push({
        id: `DIV-DROP-IN-${t.noTransfer}`,
        refId: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam || '00:00:00',
        timestampMs: toTsMs(t.tanggal, t.jam, t.createdAt),
        kategori: 'DROPPING_MASUK',
        kategoriLabel: 'Dropping Kas Masuk Divisi',
        uraian: `Dropping dari ${t.rekeningSumber}${t.keterangan ? ` · ${t.keterangan}` : ''}`,
        pihakTerkait: t.rekeningSumber,
        divisi: targetDiv.nama,
        rekeningTerkait: t.rekeningSumber,
        metode: 'DROPPING',
        masuk: nom,
        keluar: 0,
      });
    }
    if (t.rekeningSumber === targetDiv.kodeRekening) {
      rawRows.push({
        id: `DIV-DROP-OUT-${t.noTransfer}`,
        refId: t.noTransfer,
        tanggal: t.tanggal,
        jam: t.jam || '00:00:00',
        timestampMs: toTsMs(t.tanggal, t.jam, t.createdAt),
        kategori: 'DROPPING_KELUAR',
        kategoriLabel: 'Transfer Keluar Divisi',
        uraian: `Transfer ke ${t.rekeningTujuan}${t.keterangan ? ` · ${t.keterangan}` : ''}`,
        pihakTerkait: t.rekeningTujuan,
        divisi: targetDiv.nama,
        rekeningTerkait: t.rekeningTujuan,
        metode: 'TRANSFER',
        masuk: 0,
        keluar: nom,
      });
    }
  }

  return buildFinalAuditResponse({
    targetType: 'DIVISI',
    kode: targetDiv.kodeRekening,
    nama: targetDiv.nama,
    atasNama: targetDiv.penanggungJawab || `Divisi ${targetDiv.nama}`,
    kategoriRekening: 'OPERASIONAL_DIVISI',
    saldoAwal: rekDiv?.saldoAwal || 0,
    saldoTercatatSistem: rekDiv?.saldoSaatIni || 0,
    rawRows,
  });
}

/**
 * Rekonsiliasi 1-Klik: Menyesuaikan saldoSaatIni rekening fisik agar 100% klop
 * dengan hasil mutasi (Saldo Awal + Total Masuk - Total Keluar) dan mencatat Audit Log.
 */
export async function sinkronkanSaldoRekeningKeMutasi(kodeRekening: string): Promise<{
  kode: string;
  nama: string;
  saldoSebelumnya: number;
  saldoSesudah: number;
  selisihDiperbaiki: number;
}> {
  const auditBefore = getMutasiRekeningKas(kodeRekening);
  if (auditBefore.targetType !== 'REKENING_KAS') {
    throw new Error('Sinkronisasi saldo langsung hanya berlaku untuk rekening kas/bank fisik.');
  }

  const wib = getWIBDateTime();
  return await dbManager.executeTransaction((db) => {
    const rek = (db.rekening || []).find(
      (r) => r.kode.toUpperCase() === auditBefore.kode.toUpperCase()
    );
    if (!rek) throw new Error(`Rekening ${kodeRekening} tidak ditemukan.`);

    const saldoSebelumnya = Math.round(Number(rek.saldoSaatIni) || 0);
    const saldoSesudah = auditBefore.saldoHitungMutasi;
    const selisihDiperbaiki = saldoSesudah - saldoSebelumnya;

    rek.saldoSaatIni = saldoSesudah;

    if (!Array.isArray(db.auditLogs)) db.auditLogs = [];
    db.auditLogs.unshift({
      id: `AUD-RECON-${Date.now()}`,
      timestamp: wib.iso,
      tanggal: wib.tanggal,
      jam: wib.jam,
      user: 'Admin / Audit Rekening',
      jenisTransaksi: 'UPDATE',
      idTransaksi: rek.kode,
      detail: `Rekonsiliasi Mutasi Rekening ${rek.nama} (${rek.kode}): Saldo Sistem Rp ${saldoSebelumnya.toLocaleString('id-ID')} → Disinkronkan ke Hasil Mutasi Riil Rp ${saldoSesudah.toLocaleString('id-ID')} (Koreksi Selisih: ${selisihDiperbaiki >= 0 ? '+' : ''}Rp ${selisihDiperbaiki.toLocaleString('id-ID')})`,
      nominal: Math.abs(selisihDiperbaiki),
      rekeningTerkait: rek.kode,
    });

    return {
      kode: rek.kode,
      nama: rek.nama,
      saldoSebelumnya,
      saldoSesudah,
      selisihDiperbaiki,
    };
  });
}
