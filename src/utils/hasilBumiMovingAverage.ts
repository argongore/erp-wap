import type {
  StokHasilBumi,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
} from '../server/types.ts';

export function parseTanggalSortKey(tanggal?: string): number {
  if (!tanggal) return 0;
  const parts = String(tanggal).trim().split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10) || 1;
    const m = parseInt(parts[1], 10) || 1;
    const y = parseInt(parts[2], 10) || 2026;
    return y * 10000 + m * 100 + d;
  }
  const isoParts = String(tanggal).trim().split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const y = parseInt(isoParts[0], 10) || 2026;
    const m = parseInt(isoParts[1], 10) || 1;
    const d = parseInt(isoParts[2], 10) || 1;
    return y * 10000 + m * 100 + d;
  }
  return 0;
}

export interface HbCycleStep {
  dateKey: number;
  tanggal: string;
  type: 'INITIAL' | 'BUY' | 'SELL';
  nama: string;
  beratKg: number;
  hargaPerKg: number;
  totalRp: number;
  poolKgAfter: number;
  poolValueAfter: number;
  poolUnitRateAfter: number;
  sisaStokKg?: number;
  sisaStokRp?: number;
  sisaUnitRate?: number;
  isHabisMuat?: boolean;
}

export interface RollingStokHbResult {
  komoditasKode: string;
  komoditasNama: string;
  stokReadyKg: number;
  rataRataModalTerkini: number;
  totalNilaiModalTerkini: number;
  adaPenjualanSebelumnya: boolean;
  tanggalMuatTerakhir?: string;
  sisaStokMuatTerakhirKg: number;
  sisaModalMuatTerakhirRp: number;
  rataRataMuatTerakhir: number;
  pembelianBaruSetelahMuatKg: number;
  pembelianBaruSetelahMuatRp: number;
  pembelianBaruSetelahMuatCount: number;
  steps: HbCycleStep[];
}

/**
 * Menghitung Rata-Rata Bergerak / Moving Average Siklus Muat Hasil Bumi (Format Buku Gudang Real):
 * 1. Setiap penjualan/muat menghasilkan SISA STOK fisik & nilai modal dengan HPP rata-rata berjalan saat muat.
 * 2. Sisa stok tersebut otomatis menjadi basis/stok awal siklus berjalan berikutnya.
 * 3. Pembelian-pembelian harian baru setelah tanggal muat sampai muat berikutnya terus terakumulasi ke dalam stok ready dan mengupdate harga rata-rata modal secara riil.
 */
export function calculateHbMovingAverage(
  komoditas: StokHasilBumi,
  allPurchases: TransaksiPembelianHasilBumi[] = [],
  allSales: TransaksiPenjualanHasilBumi[] = []
): RollingStokHbResult {
  const targetKode = komoditas.kode;
  const targetNamaUpper = String(komoditas.nama || '').trim().toUpperCase();

  const isMatch = (kode?: string, nama?: string) =>
    kode === targetKode || String(nama || '').trim().toUpperCase() === targetNamaUpper;

  const purchases = (allPurchases || []).filter(
    (p) =>
      isMatch(p.komoditasKode, p.komoditasNama) &&
      !p.isBelumPutusHarga &&
      p.status !== 'BELUM_PUTUS_HARGA' &&
      Number(p.beratBersih || 0) > 0
  );

  const sales = (allSales || []).filter(
    (j) => isMatch(j.komoditasKode, j.komoditasNama) && Number(j.beratBersih || 0) > 0
  );

  type RawEvent =
    | {
        type: 'INITIAL';
        dateKey: number;
        createdAt: string;
        tanggal: string;
        kg: number;
        rp: number;
        rate: number;
      }
    | {
        type: 'BUY';
        dateKey: number;
        createdAt: string;
        tanggal: string;
        kg: number;
        rp: number;
        rate: number;
        record: TransaksiPembelianHasilBumi;
      }
    | {
        type: 'SELL';
        dateKey: number;
        createdAt: string;
        tanggal: string;
        kg: number;
        record: TransaksiPenjualanHasilBumi;
      };

  const rawEvents: RawEvent[] = [];

  const stokAwalKg = Number(komoditas.stokAwal) || 0;
  let rataModalAwal = Number(komoditas.rataRataModalAwal) || 0;
  let modalAwalRp = Number(komoditas.modalAwalTotal) || 0;

  if (stokAwalKg > 0) {
    if (rataModalAwal > 0 && (modalAwalRp <= 0 || Math.abs(modalAwalRp - Math.round(stokAwalKg * rataModalAwal)) > stokAwalKg * 100)) {
      modalAwalRp = Math.round(stokAwalKg * rataModalAwal);
    } else if (modalAwalRp > 0 && rataModalAwal <= 0) {
      rataModalAwal = Math.round(modalAwalRp / stokAwalKg);
    } else if (rataModalAwal <= 0 && modalAwalRp <= 0 && Number(komoditas.hargaBeliStandar) > 0) {
      rataModalAwal = Number(komoditas.hargaBeliStandar);
      modalAwalRp = Math.round(stokAwalKg * rataModalAwal);
    }
  }

  if (stokAwalKg > 0 && modalAwalRp > 0) {
    const tglAwal = komoditas.tanggalInputStokAwal || '01/11/2026';
    rawEvents.push({
      type: 'INITIAL',
      dateKey: 0, // Saldo pembuka gudang sebelum mutasi transaksi
      createdAt: '1970-01-01T00:00:00.000Z',
      tanggal: tglAwal,
      kg: stokAwalKg,
      rp: modalAwalRp,
      rate: rataModalAwal > 0 ? rataModalAwal : Math.round(modalAwalRp / stokAwalKg),
    });
  }

  for (const p of purchases) {
    const tgl = p.tanggalNotaLalu || p.tanggal || '01/11/2026';
    rawEvents.push({
      type: 'BUY',
      dateKey: parseTanggalSortKey(tgl),
      createdAt: p.createdAt || '',
      tanggal: tgl,
      kg: Number(p.beratBersih) || 0,
      rp: Number(p.totalNominal) || 0,
      rate: Number(p.hargaPerKg) || 0,
      record: p,
    });
  }

  for (const j of sales) {
    const tgl = j.tanggal || '01/11/2026';
    rawEvents.push({
      type: 'SELL',
      dateKey: parseTanggalSortKey(tgl),
      createdAt: j.createdAt || '',
      tanggal: tgl,
      kg: Number(j.beratBersih) || 0,
      record: j,
    });
  }

  rawEvents.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey - b.dateKey;
    if (a.type !== b.type) {
      const priority = { INITIAL: 0, BUY: 1, SELL: 2 };
      return priority[a.type] - priority[b.type];
    }
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  let poolKg = 0;
  let poolValue = 0;

  let adaPenjualanSebelumnya = false;
  let tanggalMuatTerakhir: string | undefined = undefined;
  let sisaStokMuatTerakhirKg = 0;
  let sisaModalMuatTerakhirRp = 0;
  let rataRataMuatTerakhir = 0;

  let pembelianBaruSetelahMuatKg = 0;
  let pembelianBaruSetelahMuatRp = 0;
  let pembelianBaruSetelahMuatCount = 0;

  const steps: HbCycleStep[] = [];

  for (const ev of rawEvents) {
    if (ev.type === 'INITIAL' || ev.type === 'BUY') {
      poolKg = Math.round((poolKg + ev.kg) * 100) / 100;
      poolValue += ev.rp;
      const rateAfter = poolKg > 0 ? Math.round(poolValue / poolKg) : ev.rate;

      if (adaPenjualanSebelumnya && ev.type === 'BUY') {
        pembelianBaruSetelahMuatKg = Math.round((pembelianBaruSetelahMuatKg + ev.kg) * 100) / 100;
        pembelianBaruSetelahMuatRp += ev.rp;
        pembelianBaruSetelahMuatCount++;
      }

      steps.push({
        dateKey: ev.dateKey,
        tanggal: ev.tanggal,
        type: ev.type,
        nama:
          ev.type === 'INITIAL'
            ? 'STOK AWAL GUDANG'
            : (ev as any).record?.namaMitra || 'Pembelian Petani',
        beratKg: ev.kg,
        hargaPerKg: ev.rate,
        totalRp: ev.rp,
        poolKgAfter: poolKg,
        poolValueAfter: poolValue,
        poolUnitRateAfter: rateAfter,
      });
    } else if (ev.type === 'SELL') {
      const j = ev.record;
      const muatKg = ev.kg;

      const rateAtSale =
        poolKg > 0 && poolValue > 0
          ? Math.round(poolValue / poolKg)
          : Number(j.modalRataRataPerKg) ||
            rataRataMuatTerakhir ||
            Number(komoditas.rataRataModalAwal) ||
            0;

      const isHabisMuat = Boolean(
        j.isHabisMuatSusut ||
          muatKg >= poolKg ||
          (Number(j.stokGudangSetelah) === 0 && poolKg > 0)
      );

      const sisaKg = isHabisMuat ? 0 : Math.max(0, Math.round((poolKg - muatKg) * 100) / 100);
      const sisaRp = isHabisMuat ? 0 : Math.max(0, Math.round(sisaKg * rateAtSale));

      steps.push({
        dateKey: ev.dateKey,
        tanggal: ev.tanggal,
        type: 'SELL',
        nama: j.namaMitra ? `MUAT ${j.namaMitra.toUpperCase()}` : 'MUAT',
        beratKg: muatKg,
        hargaPerKg: rateAtSale,
        totalRp: Math.round(muatKg * rateAtSale),
        poolKgAfter: sisaKg,
        poolValueAfter: sisaRp,
        poolUnitRateAfter: rateAtSale,
        sisaStokKg: sisaKg,
        sisaStokRp: sisaRp,
        sisaUnitRate: rateAtSale,
        isHabisMuat,
      });

      poolKg = sisaKg;
      poolValue = sisaRp;

      adaPenjualanSebelumnya = true;
      tanggalMuatTerakhir = j.tanggal;
      sisaStokMuatTerakhirKg = sisaKg;
      sisaModalMuatTerakhirRp = sisaRp;
      rataRataMuatTerakhir = rateAtSale;

      pembelianBaruSetelahMuatKg = 0;
      pembelianBaruSetelahMuatRp = 0;
      pembelianBaruSetelahMuatCount = 0;
    }
  }

  const stokReadyKg = poolKg;
  const totalNilaiModalTerkini = poolValue;
  const rataRataModalTerkini =
    stokReadyKg > 0 && totalNilaiModalTerkini > 0
      ? Math.round(totalNilaiModalTerkini / stokReadyKg)
      : rataRataMuatTerakhir || Number(komoditas.rataRataModalAwal) || 0;

  return {
    komoditasKode: komoditas.kode,
    komoditasNama: komoditas.nama,
    stokReadyKg,
    rataRataModalTerkini,
    totalNilaiModalTerkini,
    adaPenjualanSebelumnya,
    tanggalMuatTerakhir,
    sisaStokMuatTerakhirKg,
    sisaModalMuatTerakhirRp,
    rataRataMuatTerakhir,
    pembelianBaruSetelahMuatKg,
    pembelianBaruSetelahMuatRp,
    pembelianBaruSetelahMuatCount,
    steps,
  };
}
