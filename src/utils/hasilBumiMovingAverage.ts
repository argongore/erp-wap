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
  sisaFisikAktualKg?: number;
  biarkanStokMinus?: boolean;
  susutKurangKg?: number;
  selisihLebihMuatKg?: number;
}

export interface RollingStokHbResult {
  komoditasKode: string;
  komoditasNama: string;
  stokReadyKg: number;
  stokTitipNonFisikKg?: number;
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
  totalSusutKurangKg: number;
  totalLebihMuatKg: number;
  netSelisihStokKg: number;
  steps: HbCycleStep[];
}

/**
 * Menghitung Rata-Rata Bergerak / Moving Average Siklus Muat Hasil Bumi (Format Buku Gudang Real):
 * 1. Setiap penjualan/muat menghasilkan SISA STOK fisik & nilai modal dengan HPP rata-rata berjalan saat muat.
 * 2. Mendukung 3 mode sisa gudang: Normal/Biarkan Minus Buku, Sisa Fisik Aktual (input Kg sisa riil di gudang), dan Habis Muat (0 Kg + Susut).
 * 3. Memisahkan pencatatan SUSUT (kurang muat, -Kg) dan LEBIH MUAT / MINUS BUKU (surplus fisik, +Kg) untuk rekonsiliasi selisih antar komoditas/grade.
 */
export function calculateHbMovingAverage(
  komoditas: StokHasilBumi,
  allPurchases: TransaksiPembelianHasilBumi[] = [],
  allSales: TransaksiPenjualanHasilBumi[] = [],
  options?: { maxDateKey?: number }
): RollingStokHbResult {
  const targetKode = komoditas.kode;
  const targetNamaUpper = String(komoditas.nama || '').trim().toUpperCase();
  const maxDateKey =
    options?.maxDateKey && Number(options.maxDateKey) > 0 ? Number(options.maxDateKey) : undefined;

  const isMatch = (kode?: string, nama?: string) =>
    kode === targetKode || String(nama || '').trim().toUpperCase() === targetNamaUpper;

  const purchases = (allPurchases || []).filter(
    (p) =>
      isMatch(p.komoditasKode, p.komoditasNama) &&
      !p.isNotaSilang &&
      !p.isTitipNonFisik &&
      p.komoditasKode !== 'PINJAMAN_DANA' &&
      p.komoditasKode !== 'TITIP_DANA' &&
      p.komoditasKode !== 'NOTA_SILANG' &&
      Number(p.beratBersih || 0) > 0
  );

  const stokTitipNonFisikKg =
    Math.round(
      (allPurchases || [])
        .filter(
          (p) =>
            isMatch(p.komoditasKode, p.komoditasNama) &&
            Boolean(p.isTitipNonFisik) &&
            Boolean(p.isBelumPutusHarga || p.status === 'BELUM_PUTUS_HARGA') &&
            !p.isNotaSilang &&
            Number(p.beratBersih || 0) > 0
        )
        .reduce((s, p) => s + (Number(p.beratBersih) || 0), 0) * 100
    ) / 100;

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
        isBelumPutus: boolean;
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

  if (stokAwalKg > 0) {
    const tglAwal = komoditas.tanggalInputStokAwal || '01/11/2026';
    rawEvents.push({
      type: 'INITIAL',
      dateKey: 0, // Saldo pembuka gudang sebelum mutasi transaksi
      createdAt: '1970-01-01T00:00:00.000Z',
      tanggal: tglAwal,
      kg: stokAwalKg,
      rp: modalAwalRp > 0 ? modalAwalRp : 0,
      rate: modalAwalRp > 0 ? (rataModalAwal > 0 ? rataModalAwal : Math.round(modalAwalRp / stokAwalKg)) : 0,
    });
  }

  for (const p of purchases) {
    const tgl = p.tanggalNotaLalu || p.tanggal || '01/11/2026';
    const dKey = parseTanggalSortKey(tgl);
    if (maxDateKey !== undefined && dKey > maxDateKey) continue;
    const isBelumPutus = Boolean(p.isBelumPutusHarga || p.status === 'BELUM_PUTUS_HARGA');
    rawEvents.push({
      type: 'BUY',
      dateKey: dKey,
      createdAt: p.createdAt || '',
      tanggal: tgl,
      kg: Number(p.beratBersih) || 0,
      rp: isBelumPutus ? 0 : Number(p.totalNominal) || 0,
      rate: isBelumPutus ? 0 : Number(p.hargaPerKg) || 0,
      isBelumPutus,
      record: p,
    });
  }

  for (const j of sales) {
    const tgl = j.tanggal || '01/11/2026';
    const dKey = parseTanggalSortKey(tgl);
    if (maxDateKey !== undefined && dKey > maxDateKey) continue;
    rawEvents.push({
      type: 'SELL',
      dateKey: dKey,
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
  let pricedPoolKg = 0;
  let poolValue = 0;

  let adaPenjualanSebelumnya = false;
  let tanggalMuatTerakhir: string | undefined = undefined;
  let sisaStokMuatTerakhirKg = 0;
  let sisaModalMuatTerakhirRp = 0;
  let rataRataMuatTerakhir = 0;

  let pembelianBaruSetelahMuatKg = 0;
  let pembelianBaruSetelahMuatRp = 0;
  let pembelianBaruSetelahMuatCount = 0;

  let totalSusutKurangKg = 0;
  let totalLebihMuatKg = 0;

  const steps: HbCycleStep[] = [];

  for (const ev of rawEvents) {
    if (ev.type === 'INITIAL' || ev.type === 'BUY') {
      poolKg = Math.round((poolKg + ev.kg) * 100) / 100;
      const isPricedLot =
        ev.type === 'INITIAL' ? ev.rp > 0 : !ev.isBelumPutus && ev.rp > 0;
      if (isPricedLot) {
        pricedPoolKg = Math.round((pricedPoolKg + ev.kg) * 100) / 100;
        poolValue += ev.rp;
      }
      const rateAfter =
        pricedPoolKg > 0 && poolValue > 0 ? Math.round(poolValue / pricedPoolKg) : ev.rate;
      const displayValueAfter =
        poolKg <= 0
          ? 0
          : pricedPoolKg > poolKg && rateAfter > 0
          ? Math.round(poolKg * rateAfter)
          : poolValue;

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
        poolValueAfter: displayValueAfter,
        poolUnitRateAfter: rateAfter,
      });
    } else if (ev.type === 'SELL') {
      const j = ev.record;
      const muatKg = ev.kg;
      const poolBeforeKg = poolKg;

      const rateAtSale =
        pricedPoolKg > 0 && poolValue > 0
          ? Math.round(poolValue / pricedPoolKg)
          : Number(j.modalRataRataPerKg) ||
            rataRataMuatTerakhir ||
            Number(komoditas.rataRataModalAwal) ||
            0;

      const hasSisaFisikAktual =
        j.sisaFisikAktualKg !== undefined &&
        j.sisaFisikAktualKg !== null &&
        Number.isFinite(Number(j.sisaFisikAktualKg)) &&
        Number(j.sisaFisikAktualKg) >= 0;
      const keepMinus = Boolean(j.biarkanStokMinus);

      let isHabisMuat = false;
      let sisaKg = 0;
      let sisaPricedKg = 0;
      let sisaRp = 0;
      let susutKurangKg = 0;
      let selisihLebihMuatKg = 0;

      if (hasSisaFisikAktual) {
        sisaKg = Math.round(Number(j.sisaFisikAktualKg) * 100) / 100;
        const expectedSisaBuku = Math.round((poolBeforeKg - muatKg) * 100) / 100;
        const varianceKg = Math.round((sisaKg - expectedSisaBuku) * 100) / 100;
        if (varianceKg > 0) {
          selisihLebihMuatKg = varianceKg;
        } else if (varianceKg < 0) {
          susutKurangKg = Math.abs(varianceKg);
        }
        isHabisMuat = sisaKg === 0;
        sisaPricedKg = sisaKg;
        sisaRp = Math.max(0, Math.round(sisaPricedKg * rateAtSale));
      } else if (keepMinus) {
        sisaKg = Math.round((poolBeforeKg - muatKg) * 100) / 100;
        isHabisMuat = false;
        if (muatKg > poolBeforeKg) {
          selisihLebihMuatKg = Math.round((muatKg - poolBeforeKg) * 100) / 100;
        }
        sisaPricedKg =
          sisaKg <= 0
            ? 0
            : pricedPoolKg >= poolBeforeKg
            ? sisaKg
            : Math.max(0, Math.min(sisaKg, Math.round((pricedPoolKg - muatKg) * 100) / 100));
        sisaRp = Math.max(0, Math.round(sisaPricedKg * rateAtSale));
      } else {
        isHabisMuat = Boolean(
          j.isHabisMuatSusut ||
            muatKg >= poolBeforeKg ||
            (Number(j.stokGudangSetelah) === 0 && poolBeforeKg > 0)
        );
        sisaKg = isHabisMuat ? 0 : Math.max(0, Math.round((poolBeforeKg - muatKg) * 100) / 100);
        sisaPricedKg = isHabisMuat
          ? 0
          : pricedPoolKg >= poolBeforeKg
          ? sisaKg
          : Math.max(0, Math.min(sisaKg, Math.round((pricedPoolKg - muatKg) * 100) / 100));
        sisaRp = isHabisMuat ? 0 : Math.max(0, Math.round(sisaPricedKg * rateAtSale));

        if (muatKg > poolBeforeKg) {
          selisihLebihMuatKg = Math.round((muatKg - poolBeforeKg) * 100) / 100;
        } else if (isHabisMuat && poolBeforeKg > muatKg) {
          susutKurangKg = Math.round((poolBeforeKg - muatKg) * 100) / 100;
        }
      }

      totalSusutKurangKg = Math.round((totalSusutKurangKg + susutKurangKg) * 100) / 100;
      totalLebihMuatKg = Math.round((totalLebihMuatKg + selisihLebihMuatKg) * 100) / 100;

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
        ...(hasSisaFisikAktual ? { sisaFisikAktualKg: sisaKg } : {}),
        ...(keepMinus ? { biarkanStokMinus: true } : {}),
        susutKurangKg,
        selisihLebihMuatKg,
      });

      poolKg = sisaKg;
      pricedPoolKg = sisaPricedKg;
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
  const rataRataModalTerkini =
    pricedPoolKg > 0 && poolValue > 0
      ? Math.round(poolValue / pricedPoolKg)
      : rataRataMuatTerakhir || Number(komoditas.rataRataModalAwal) || 0;
  const totalNilaiModalTerkini =
    stokReadyKg <= 0
      ? 0
      : pricedPoolKg > stokReadyKg && rataRataModalTerkini > 0
      ? Math.round(stokReadyKg * rataRataModalTerkini)
      : poolValue;
  const netSelisihStokKg = Math.round((totalLebihMuatKg - totalSusutKurangKg) * 100) / 100;

  return {
    komoditasKode: komoditas.kode,
    komoditasNama: komoditas.nama,
    stokReadyKg,
    stokTitipNonFisikKg,
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
    totalSusutKurangKg,
    totalLebihMuatKg,
    netSelisihStokKg,
    steps,
  };
}
