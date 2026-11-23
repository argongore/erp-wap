import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  TrendingUp,
  TrendingDown,
  ArrowDownLeft,
  Clock,
  Scale,
} from 'lucide-react';
import type {
  StokHasilBumi,
  TransaksiPembelianHasilBumi,
  TransaksiPenjualanHasilBumi,
  TransaksiUangMasuk,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import {
  calculateHbMovingAverage,
  parseTanggalSortKey,
} from '../../utils/hasilBumiMovingAverage.ts';

interface Props {
  stokList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  penjualanHasilBumiList: TransaksiPenjualanHasilBumi[];
  uangMasukList: TransaksiUangMasuk[];
  onInputUangMasuk?: (noPenjualan: string) => void;
  onSelectKomoditas?: (kode: string) => void;
}

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

type PeriodeMode = 'SEMUA' | 'BULAN_INI' | 'PILIH_BULAN';
type StatusFilter = 'SEMUA' | 'PROFIT' | 'JUNAM' | 'MENUNGGU_CAIR';
type SortKey = 'PROFIT_DESC' | 'PROFIT_ASC' | 'MODAL_DESC' | 'PENJUALAN_DESC' | 'NAMA_ASC';

function isPhysicalPurchase(p: TransaksiPembelianHasilBumi): boolean {
  if (!p) return false;
  if (p.komoditasKode === 'PINJAMAN_DANA' || p.komoditasKode === 'TITIP_DANA') return false;
  if (p.komoditasNama && p.komoditasNama.toLowerCase().includes('pinjaman uang')) return false;
  return (Number(p.beratBersih) || 0) > 0;
}

function parseMonthYear(tanggal?: string): { month: number; year: number } | null {
  if (!tanggal) return null;
  const trimmed = String(tanggal).trim();
  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    const m = parseInt(slashParts[1], 10);
    const y = parseInt(slashParts[2], 10);
    if (m >= 1 && m <= 12 && y >= 2000) return { month: m, year: y };
  }
  const isoParts = trimmed.split('-');
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const y = parseInt(isoParts[0], 10);
    const m = parseInt(isoParts[1], 10);
    if (m >= 1 && m <= 12 && y >= 2000) return { month: m, year: y };
  }
  return null;
}

function isUangMasukHasilBumi(um: TransaksiUangMasuk): boolean {
  if (!um) return false;
  const kat = String(um.kategori || '').toUpperCase();
  if (kat === 'SETTLEMENT_BUYER_SJ') return false;
  if (um.noPenjualanHasilBumi && um.noPenjualanHasilBumi.trim()) return true;
  if (um.komoditasNama && um.komoditasNama.trim()) return true;
  if (
    kat.includes('HASIL BUMI') ||
    kat.includes('PENJUALAN_HASIL_BUMI') ||
    kat.includes('PENJUALAN KOMODITAS')
  ) {
    return true;
  }
  return false;
}

function formatKg(val: number): string {
  return (Number(val) || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function normalizeName(s?: string): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

interface SaleDetailLine {
  id: string;
  source: 'NOTA_MUAT' | 'UANG_MASUK_LANGSUNG';
  tanggal: string;
  dateKey: number;
  pembeli: string;
  beratMuatKg: number;
  tonaseAkhirKg: number;
  modalHppRp: number;
  realisasiPenjualanRp: number;
  uangMasukCashRp: number;
  piutangRp: number;
  profitRp: number;
  isMenungguCair: boolean;
  metodeLabel: string;
  uangMasukCount: number;
  uangMasukIds: string[];
  noSuratJalan?: string;
}

interface CommodityProfitRow {
  kode: string;
  nama: string;
  satuan: string;
  // Modal Pembelian
  stokAwalKg: number;
  modalStokAwalRp: number;
  beliPutusKg: number;
  beliPutusRp: number;
  beliBelumPutusKg: number;
  beliBelumPutusCount: number;
  totalModalDipakaiRp: number;
  rataHargaBeliPerKg: number;
  // Modal Sedang Berjalan (Stok Gudang Ready + Muat Menunggu Cair)
  stokReadyKg: number;
  modalStokGudangRp: number;
  rataModalGudangPerKg: number;
  muatMenungguCairKg: number;
  modalMuatMenungguCairRp: number;
  totalModalBerjalanRp: number;
  // Modal Sudah Terjual & Realisasi Penjualan / Uang Masuk
  terjualRealisasiKg: number;
  tonaseAkhirRealisasiKg: number;
  modalTerjualRealisasiRp: number;
  totalPenjualanLangsungRp: number;
  totalUangMasukLinkedRp: number;
  totalUangMasukStandaloneRp: number;
  totalRealisasiPenjualanRp: number;
  totalPiutangBuyerRp: number;
  rataHargaJualPerKg: number;
  uangMasukTxCount: number;
  notaMuatCount: number;
  notaMenungguCairCount: number;
  // Profit / Junam
  profitRealisasiRp: number;
  marginRealisasiPct: number;
  selisihKasNetRp: number; // (Penjualan Realisasi + Aset Modal Berjalan) - Total Modal Dipakai
  verdict: 'PROFIT' | 'JUNAM' | 'IMPAS' | 'MENUNGGU_CAIR' | 'BELUM_AKTIF';
  saleDetails: SaleDetailLine[];
}

export const AnalisaProfitHasilBumiPanel: React.FC<Props> = ({
  stokList,
  pembelianList,
  penjualanHasilBumiList,
  uangMasukList,
  onInputUangMasuk,
  onSelectKomoditas,
}) => {
  const now = new Date();
  const [periodeMode, setPeriodeMode] = useState<PeriodeMode>('SEMUA');
  const [filterBulan, setFilterBulan] = useState<number>(now.getMonth() + 1);
  const [filterTahun, setFilterTahun] = useState<number>(now.getFullYear());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('SEMUA');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('PROFIT_DESC');
  const [expandedKode, setExpandedKode] = useState<string | null>(null);
  const [showUnmatchedUm, setShowUnmatchedUm] = useState<boolean>(false);

  const activeStokList = useMemo(
    () =>
      stokList.filter(
        (h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN')
      ),
    [stokList]
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear()]);
    for (const p of pembelianList) {
      const my = parseMonthYear(p.tanggalNotaLalu || p.tanggal);
      if (my) years.add(my.year);
    }
    for (const j of penjualanHasilBumiList) {
      const my = parseMonthYear(j.tanggal);
      if (my) years.add(my.year);
    }
    for (const u of uangMasukList) {
      const my = parseMonthYear(u.tanggal);
      if (my) years.add(my.year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [pembelianList, penjualanHasilBumiList, uangMasukList, now]);

  const matchesPeriode = (tanggal?: string): boolean => {
    if (periodeMode === 'SEMUA') return true;
    const my = parseMonthYear(tanggal);
    if (!my) return false;
    if (periodeMode === 'BULAN_INI') {
      return my.month === now.getMonth() + 1 && my.year === now.getFullYear();
    }
    return my.month === filterBulan && my.year === filterTahun;
  };

  const { rows, unmatchedUangMasuk } = useMemo(() => {
    const physicalPurchasesAll = (pembelianList || []).filter(isPhysicalPurchase);
    const allSales = penjualanHasilBumiList || [];
    const allUangMasuk = uangMasukList || [];

    // Indeks Uang Masuk berdasarkan noPenjualanHasilBumi (supaya tidak pernah double-count)
    const umByNoPenjualan = new Map<string, TransaksiUangMasuk[]>();
    const standaloneHbUangMasuk: TransaksiUangMasuk[] = [];

    for (const um of allUangMasuk) {
      if (!um) continue;
      const linkedNo = String(um.noPenjualanHasilBumi || '').trim();
      if (linkedNo) {
        const list = umByNoPenjualan.get(linkedNo) || [];
        list.push(um);
        umByNoPenjualan.set(linkedNo, list);
      } else if (isUangMasukHasilBumi(um) && matchesPeriode(um.tanggal)) {
        standaloneHbUangMasuk.push(um);
      }
    }

    const matchedStandaloneUmIds = new Set<string>();

    const computedRows: CommodityProfitRow[] = activeStokList.map((hb) => {
      const kodeUpper = normalizeName(hb.kode);
      const namaUpper = normalizeName(hb.nama);

      const isSameCommodity = (kode?: string, nama?: string) => {
        const k = normalizeName(kode);
        const n = normalizeName(nama);
        return (k && k === kodeUpper) || (n && n === namaUpper);
      };

      // 1. Hitung Moving Average & Modal Stok Ready Berjalan di Gudang (selalu full history agar saldo stok & HPP akurat)
      const movingAvg = calculateHbMovingAverage(hb, physicalPurchasesAll, allSales);

      // 2. Hitung Stok Awal Gudang
      const stokAwalKg = periodeMode === 'SEMUA' ? Math.max(0, Number(hb.stokAwal) || 0) : 0;
      let rataModalAwal = Number(hb.rataRataModalAwal) || 0;
      let modalStokAwalRp = periodeMode === 'SEMUA' ? Number(hb.modalAwalTotal) || 0 : 0;
      if (stokAwalKg > 0) {
        if (
          rataModalAwal > 0 &&
          (modalStokAwalRp <= 0 ||
            Math.abs(modalStokAwalRp - Math.round(stokAwalKg * rataModalAwal)) > stokAwalKg * 100)
        ) {
          modalStokAwalRp = Math.round(stokAwalKg * rataModalAwal);
        } else if (modalStokAwalRp > 0 && rataModalAwal <= 0) {
          rataModalAwal = Math.round(modalStokAwalRp / stokAwalKg);
        } else if (
          rataModalAwal <= 0 &&
          modalStokAwalRp <= 0 &&
          Number(hb.hargaBeliStandar) > 0
        ) {
          rataModalAwal = Number(hb.hargaBeliStandar);
          modalStokAwalRp = Math.round(stokAwalKg * rataModalAwal);
        }
      }

      // 3. Pembelian fisik untuk komoditas ini (sesuai filter periode)
      const purchasesForHb = physicalPurchasesAll.filter(
        (p) =>
          isSameCommodity(p.komoditasKode, p.komoditasNama) &&
          matchesPeriode(p.tanggalNotaLalu || p.tanggal)
      );

      let beliPutusKg = 0;
      let beliPutusRp = 0;
      let beliBelumPutusKg = 0;
      let beliBelumPutusCount = 0;

      for (const p of purchasesForHb) {
        const kg = Number(p.beratBersih) || 0;
        if (p.isBelumPutusHarga || p.status === 'BELUM_PUTUS_HARGA') {
          beliBelumPutusKg += kg;
          beliBelumPutusCount += 1;
        } else {
          beliPutusKg += kg;
          beliPutusRp += Math.round(Number(p.totalNominal) || 0);
        }
      }

      const totalModalDipakaiRp = modalStokAwalRp + beliPutusRp;
      const totalKgDibeliDenganHarga = stokAwalKg + beliPutusKg;
      const rataHargaBeliPerKg =
        totalKgDibeliDenganHarga > 0
          ? Math.round(totalModalDipakaiRp / totalKgDibeliDenganHarga)
          : movingAvg.rataRataModalTerkini;

      // 4. Penjualan Keluar & Uang Masuk terkait Nota Muat
      const salesForHb = allSales.filter(
        (j) =>
          isSameCommodity(j.komoditasKode, j.komoditasNama) && matchesPeriode(j.tanggal)
      );

      let terjualRealisasiKg = 0;
      let tonaseAkhirRealisasiKg = 0;
      let modalTerjualRealisasiRp = 0;
      let muatMenungguCairKg = 0;
      let modalMuatMenungguCairRp = 0;

      let totalPenjualanLangsungRp = 0;
      let totalUangMasukLinkedRp = 0;
      let totalPiutangBuyerRp = 0;
      let uangMasukTxCount = 0;
      let notaMenungguCairCount = 0;

      const saleDetails: SaleDetailLine[] = [];

      for (const j of salesForHb) {
        const beratMuat = Number(j.beratBersih) || 0;
        const tonaseAkhir = Number(j.tonaseAkhir) > 0 ? Number(j.tonaseAkhir) : beratMuat;
        const modalHpp =
          Number(j.nilaiModalPengurangStok) ||
          Number(j.totalModalHpp) ||
          Math.round(
            beratMuat * (Number(j.modalRataRataPerKg) || movingAvg.rataRataModalTerkini || 0)
          );

        const linkedUms = umByNoPenjualan.get(j.noPenjualan) || [];
        const linkedUmCash = linkedUms
          .filter((u) => u.metode !== 'PIUTANG')
          .reduce((acc, u) => acc + (Math.round(Number(u.nominal) || 0)), 0);
        const linkedUmPiutang = linkedUms
          .filter((u) => u.metode === 'PIUTANG')
          .reduce((acc, u) => acc + (Math.round(Number(u.nominal) || 0)), 0);
        const linkedUmTotal = linkedUmCash + linkedUmPiutang;

        const isBelumPutus =
          Boolean(j.isBelumPutusHargaJual) || j.metodePembayaran === 'BELUM_PUTUS_HARGA';
        const nominalTerkumpulField = Math.round(Number(j.nominalUangMasukTerkumpul) || 0);
        const totalNominalField = Math.round(Number(j.totalNominal) || 0);

        let realisasiRp = 0;
        let cashMasukRp = 0;
        let piutangRp = 0;
        let metodeLabel: string = j.metodePembayaran;

        if (linkedUms.length > 0) {
          // Realisasi berasal dari menu Uang Masuk yang ter-link ke nota muat ini
          uangMasukTxCount += linkedUms.length;
          realisasiRp = Math.max(linkedUmTotal, nominalTerkumpulField, totalNominalField);
          cashMasukRp = Math.max(linkedUmCash, nominalTerkumpulField);
          piutangRp = Math.max(linkedUmPiutang, Math.round(Number(j.sisaPiutang) || 0));
          totalUangMasukLinkedRp += cashMasukRp;
          totalPiutangBuyerRp += piutangRp;
          metodeLabel =
            j.statusUangMasuk === 'LUNAS'
              ? 'Uang Masuk (Lunas)'
              : piutangRp > 0 && cashMasukRp === 0
                ? 'Putus Harga → Piutang'
                : 'Uang Masuk (Bertahap)';
        } else if (isBelumPutus) {
          // Belum putus harga; cek apakah ada nominalUangMasukTerkumpul tanpa record UM terpisah
          realisasiRp = nominalTerkumpulField;
          cashMasukRp = nominalTerkumpulField;
          if (cashMasukRp > 0) {
            totalUangMasukLinkedRp += cashMasukRp;
            metodeLabel = 'Uang Masuk';
          } else {
            metodeLabel = 'Menunggu Uang Masuk';
          }
        } else {
          // Penjualan Langsung Putus Harga (TUNAI / TRANSFER / PIUTANG / SINKRON)
          realisasiRp = Math.max(totalNominalField, nominalTerkumpulField);
          if (j.metodePembayaran === 'PIUTANG') {
            piutangRp = Math.round(Number(j.sisaPiutang) || 0);
            cashMasukRp = Math.max(0, realisasiRp - piutangRp);
            totalPiutangBuyerRp += piutangRp;
          } else {
            cashMasukRp = realisasiRp;
          }
          totalPenjualanLangsungRp += realisasiRp;
          metodeLabel =
            j.metodePembayaran === 'TUNAI'
              ? 'Tunai Langsung'
              : j.metodePembayaran === 'TRANSFER'
                ? 'Transfer Langsung'
                : j.metodePembayaran === 'PIUTANG'
                  ? 'Piutang Buyer'
                  : 'Sinkron';
        }

        const isMenungguCair = realisasiRp <= 0;

        if (isMenungguCair) {
          muatMenungguCairKg += beratMuat;
          modalMuatMenungguCairRp += modalHpp;
          notaMenungguCairCount += 1;
        } else {
          terjualRealisasiKg += beratMuat;
          tonaseAkhirRealisasiKg += tonaseAkhir;
          modalTerjualRealisasiRp += modalHpp;
        }

        saleDetails.push({
          id: j.noPenjualan,
          source: 'NOTA_MUAT',
          tanggal: j.tanggal,
          dateKey: parseTanggalSortKey(j.tanggal),
          pembeli: j.namaMitra || 'Pembeli',
          beratMuatKg: beratMuat,
          tonaseAkhirKg: tonaseAkhir,
          modalHppRp: modalHpp,
          realisasiPenjualanRp: realisasiRp,
          uangMasukCashRp: cashMasukRp,
          piutangRp,
          profitRp: isMenungguCair ? 0 : realisasiRp - modalHpp,
          isMenungguCair,
          metodeLabel,
          uangMasukCount: linkedUms.length,
          uangMasukIds: linkedUms.map((u) => u.idTransaksi),
          noSuratJalan: j.noSuratJalan,
        });
      }

      // 5. Uang Masuk Penjualan Hasil Bumi standalone (yang tidak memilih No Nota Muat tapi menyebut komoditas ini)
      let totalUangMasukStandaloneRp = 0;
      for (const um of standaloneHbUangMasuk) {
        if (matchedStandaloneUmIds.has(um.idTransaksi)) continue;
        const umKom = normalizeName(um.komoditasNama);
        const umKet = normalizeName(`${um.kategori} ${um.keterangan}`);
        const exactKomMatch = umKom && (umKom === namaUpper || umKom === kodeUpper);
        const ketContainsKom = namaUpper.length >= 3 && umKet.includes(namaUpper);

        if (exactKomMatch || ketContainsKom) {
          matchedStandaloneUmIds.add(um.idTransaksi);
          const nom = Math.round(Number(um.nominal) || 0);
          totalUangMasukStandaloneRp += nom;
          uangMasukTxCount += 1;
          const tonase = Number(um.tonaseAkhirKg) || Number(um.beratMuatKg) || 0;
          if (tonase > 0) {
            tonaseAkhirRealisasiKg += tonase;
          }
          saleDetails.push({
            id: um.idTransaksi,
            source: 'UANG_MASUK_LANGSUNG',
            tanggal: um.tanggal,
            dateKey: parseTanggalSortKey(um.tanggal),
            pembeli: um.namaPengirim || um.pengirim || 'Pembeli',
            beratMuatKg: Number(um.beratMuatKg) || 0,
            tonaseAkhirKg: tonase,
            modalHppRp: Math.round(Number(um.nilaiModalStok) || Number(um.totalModalStok) || 0),
            realisasiPenjualanRp: nom,
            uangMasukCashRp: um.metode === 'PIUTANG' ? 0 : nom,
            piutangRp: um.metode === 'PIUTANG' ? nom : 0,
            profitRp: nom - Math.round(Number(um.nilaiModalStok) || Number(um.totalModalStok) || 0),
            isMenungguCair: false,
            metodeLabel: `Uang Masuk (${um.metode})`,
            uangMasukCount: 1,
            uangMasukIds: [um.idTransaksi],
          });
        }
      }

      // Total realisasi penjualan = jumlah seluruh penjualan & uang masuk yang sudah realisasi (tanpa double-counting!)
      const totalRealisasiPenjualanRp = saleDetails
        .filter((d) => !d.isMenungguCair)
        .reduce((acc, d) => acc + d.realisasiPenjualanRp, 0);

      // Stok Ready & Modal Berjalan Gudang saat ini
      const stokReadyKg = movingAvg.stokReadyKg;
      const modalStokGudangRp = Math.round(movingAvg.totalNilaiModalTerkini);
      const rataModalGudangPerKg = movingAvg.rataRataModalTerkini;
      const totalModalBerjalanRp = modalStokGudangRp + modalMuatMenungguCairRp;

      // Profit / Junam Realisasi (Apple-to-Apple: Penjualan/Uang Masuk Realisasi vs Modal HPP Barang Terjual)
      const profitRealisasiRp = totalRealisasiPenjualanRp - modalTerjualRealisasiRp;
      const marginRealisasiPct =
        modalTerjualRealisasiRp > 0
          ? Math.round((profitRealisasiRp / modalTerjualRealisasiRp) * 1000) / 10
          : totalRealisasiPenjualanRp > 0
            ? 100
            : 0;

      const basisKgJual =
        tonaseAkhirRealisasiKg > 0 ? tonaseAkhirRealisasiKg : terjualRealisasiKg;
      const rataHargaJualPerKg =
        basisKgJual > 0 ? Math.round(totalRealisasiPenjualanRp / basisKgJual) : 0;

      // Posisi Kas + Nilai Stok Berjalan vs Total Modal Dipakai
      const selisihKasNetRp =
        totalRealisasiPenjualanRp + totalModalBerjalanRp - totalModalDipakaiRp;

      let verdict: CommodityProfitRow['verdict'] = 'BELUM_AKTIF';
      if (totalRealisasiPenjualanRp > 0 || modalTerjualRealisasiRp > 0) {
        if (profitRealisasiRp > 0) verdict = 'PROFIT';
        else if (profitRealisasiRp < 0) verdict = 'JUNAM';
        else verdict = 'IMPAS';
      } else if (totalModalBerjalanRp > 0 || beliPutusKg > 0 || beliBelumPutusKg > 0) {
        verdict = 'MENUNGGU_CAIR';
      }

      saleDetails.sort((a, b) => b.dateKey - a.dateKey);

      return {
        kode: hb.kode,
        nama: hb.nama,
        satuan: hb.satuan || 'Kg',
        stokAwalKg,
        modalStokAwalRp,
        beliPutusKg: Math.round(beliPutusKg * 100) / 100,
        beliPutusRp,
        beliBelumPutusKg: Math.round(beliBelumPutusKg * 100) / 100,
        beliBelumPutusCount,
        totalModalDipakaiRp,
        rataHargaBeliPerKg,
        stokReadyKg,
        modalStokGudangRp,
        rataModalGudangPerKg,
        muatMenungguCairKg: Math.round(muatMenungguCairKg * 100) / 100,
        modalMuatMenungguCairRp,
        totalModalBerjalanRp,
        terjualRealisasiKg: Math.round(terjualRealisasiKg * 100) / 100,
        tonaseAkhirRealisasiKg: Math.round(tonaseAkhirRealisasiKg * 100) / 100,
        modalTerjualRealisasiRp,
        totalPenjualanLangsungRp,
        totalUangMasukLinkedRp,
        totalUangMasukStandaloneRp,
        totalRealisasiPenjualanRp,
        totalPiutangBuyerRp,
        rataHargaJualPerKg,
        uangMasukTxCount,
        notaMuatCount: salesForHb.length,
        notaMenungguCairCount,
        profitRealisasiRp,
        marginRealisasiPct,
        selisihKasNetRp,
        verdict,
        saleDetails,
      };
    });

    const unmatched = standaloneHbUangMasuk.filter(
      (um) => !matchedStandaloneUmIds.has(um.idTransaksi)
    );

    return { rows: computedRows, unmatchedUangMasuk: unmatched };
  }, [
    activeStokList,
    pembelianList,
    penjualanHasilBumiList,
    uangMasukList,
    periodeMode,
    filterBulan,
    filterTahun,
  ]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !r.nama.toLowerCase().includes(q) && !r.kode.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'PROFIT') return r.verdict === 'PROFIT';
      if (statusFilter === 'JUNAM') return r.verdict === 'JUNAM';
      if (statusFilter === 'MENUNGGU_CAIR') {
        return r.verdict === 'MENUNGGU_CAIR' || r.notaMenungguCairCount > 0;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'PROFIT_DESC') return b.profitRealisasiRp - a.profitRealisasiRp;
      if (sortBy === 'PROFIT_ASC') return a.profitRealisasiRp - b.profitRealisasiRp;
      if (sortBy === 'MODAL_DESC') return b.totalModalDipakaiRp - a.totalModalDipakaiRp;
      if (sortBy === 'PENJUALAN_DESC')
        return b.totalRealisasiPenjualanRp - a.totalRealisasiPenjualanRp;
      return a.nama.localeCompare(b.nama);
    });
  }, [rows, searchQuery, statusFilter, sortBy]);

  const summary = useMemo(() => {
    const totalModalDipakai = rows.reduce((s, r) => s + r.totalModalDipakaiRp, 0);
    const totalModalTerjual = rows.reduce((s, r) => s + r.modalTerjualRealisasiRp, 0);
    const totalModalGudang = rows.reduce((s, r) => s + r.modalStokGudangRp, 0);
    const totalModalMuatPending = rows.reduce((s, r) => s + r.modalMuatMenungguCairRp, 0);
    const totalModalBerjalan = totalModalGudang + totalModalMuatPending;
    const totalStokReadyKg = rows.reduce((s, r) => s + r.stokReadyKg, 0);
    const totalMuatPendingKg = rows.reduce((s, r) => s + r.muatMenungguCairKg, 0);
    const totalRealisasiPenjualan = rows.reduce((s, r) => s + r.totalRealisasiPenjualanRp, 0);
    const totalUnmatchedUmRp = unmatchedUangMasuk.reduce(
      (s, u) => s + Math.round(Number(u.nominal) || 0),
      0
    );
    const totalUangMasukLinked = rows.reduce(
      (s, r) => s + r.totalUangMasukLinkedRp + r.totalUangMasukStandaloneRp,
      0
    );
    const totalPiutangBuyer = rows.reduce((s, r) => s + r.totalPiutangBuyerRp, 0);
    const totalProfitRealisasi = totalRealisasiPenjualan - totalModalTerjual;
    const totalMarginPct =
      totalModalTerjual > 0
        ? Math.round((totalProfitRealisasi / totalModalTerjual) * 1000) / 10
        : 0;
    const profitCount = rows.filter((r) => r.verdict === 'PROFIT').length;
    const junamCount = rows.filter((r) => r.verdict === 'JUNAM').length;
    const pendingCount = rows.filter(
      (r) => r.verdict === 'MENUNGGU_CAIR' || r.notaMenungguCairCount > 0
    ).length;

    return {
      totalModalDipakai,
      totalModalTerjual,
      totalModalGudang,
      totalModalMuatPending,
      totalModalBerjalan,
      totalStokReadyKg,
      totalMuatPendingKg,
      totalRealisasiPenjualan,
      totalUnmatchedUmRp,
      totalUangMasukLinked,
      totalPiutangBuyer,
      totalProfitRealisasi,
      totalMarginPct,
      profitCount,
      junamCount,
      pendingCount,
    };
  }, [rows, unmatchedUangMasuk]);

  const maxBarRp = useMemo(() => {
    let maxVal = 1;
    for (const r of filteredRows) {
      maxVal = Math.max(
        maxVal,
        r.modalTerjualRealisasiRp,
        r.totalRealisasiPenjualanRp,
        r.totalModalBerjalanRp
      );
    }
    return maxVal;
  }, [filteredRows]);

  const handleExportCsv = () => {
    const header = [
      'Kode',
      'Komoditas',
      'Status',
      'Modal Stok Awal (Rp)',
      'Modal Beli Putus (Rp)',
      'Total Modal Dipakai (Rp)',
      'Modal Terjual / HPP (Rp)',
      'Modal Berjalan Gudang (Rp)',
      'Stok Ready Gudang (Kg)',
      'Modal Muat Belum Cair (Rp)',
      'Muat Belum Cair (Kg)',
      'Realisasi Penjualan & Uang Masuk (Rp)',
      'Rata Beli (Rp/Kg)',
      'Rata Jual (Rp/Kg)',
      'Profit / Junam Realisasi (Rp)',
      'Margin (%)',
    ];
    const csvRows = [
      header.join(','),
      ...filteredRows.map((r) =>
        [
          r.kode,
          `"${r.nama.replace(/"/g, '""')}"`,
          r.verdict,
          r.modalStokAwalRp,
          r.beliPutusRp,
          r.totalModalDipakaiRp,
          r.modalTerjualRealisasiRp,
          r.modalStokGudangRp,
          r.stokReadyKg,
          r.modalMuatMenungguCairRp,
          r.muatMenungguCairKg,
          r.totalRealisasiPenjualanRp,
          r.rataHargaBeliPerKg,
          r.rataHargaJualPerKg,
          r.profitRealisasiRp,
          r.marginRealisasiPct,
        ].join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const periodeLabel =
      periodeMode === 'SEMUA'
        ? 'semua_periode'
        : periodeMode === 'BULAN_INI'
          ? `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`
          : `${filterTahun}_${String(filterBulan).padStart(2, '0')}`;
    a.download = `analisa_profit_hasil_bumi_${periodeLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const periodeDescription =
    periodeMode === 'SEMUA'
      ? 'Akumulasi seluruh periode berjalan'
      : periodeMode === 'BULAN_INI'
        ? `Periode ${NAMA_BULAN[now.getMonth()]} ${now.getFullYear()}`
        : `Periode ${NAMA_BULAN[filterBulan - 1]} ${filterTahun}`;

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-zinc-200">
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-500">
              Komparasi Modal Beli · Penjualan Keluar · Uang Masuk Penjualan · {periodeDescription}
            </div>
            <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
              Analisa Modal &amp; Profitabilitas Hasil Bumi per Komoditas
            </h2>
            <p className="text-xs text-zinc-600 max-w-3xl leading-relaxed">
              Membandingkan modal pembelian yang sudah terjual (HPP) terhadap realisasi penjualan &amp; pencairan{' '}
              <strong className="text-zinc-900">Uang Masuk</strong> untuk mendeteksi komoditas yang{' '}
              <strong className="text-emerald-700">Profit</strong> atau{' '}
              <strong className="text-rose-700">Junam (Rugi)</strong>, sambil memisahkan modal yang masih berjalan di gudang dan muatan yang belum cair.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center p-0.5 bg-zinc-100 rounded-lg border border-zinc-200 text-xs">
              <button
                type="button"
                onClick={() => setPeriodeMode('SEMUA')}
                className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  periodeMode === 'SEMUA'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Semua Periode
              </button>
              <button
                type="button"
                onClick={() => setPeriodeMode('BULAN_INI')}
                className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  periodeMode === 'BULAN_INI'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={() => setPeriodeMode('PILIH_BULAN')}
                className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  periodeMode === 'PILIH_BULAN'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Pilih Bulan
              </button>
            </div>

            {periodeMode === 'PILIH_BULAN' && (
              <div className="flex items-center gap-1.5 bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs">
                <select
                  value={filterBulan}
                  onChange={(e) => setFilterBulan(Number(e.target.value))}
                  className="bg-transparent font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                >
                  {NAMA_BULAN.map((nama, idx) => (
                    <option key={nama} value={idx + 1}>
                      {nama}
                    </option>
                  ))}
                </select>
                <select
                  value={filterTahun}
                  onChange={(e) => setFilterTahun(Number(e.target.value))}
                  className="bg-transparent font-mono font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-zinc-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {/* 4-Column Executive KPI Strip (Single-Elevation Hairline Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 border border-zinc-200 rounded-xl bg-zinc-50/50">
          {/* KPI 1: Total Modal Dipakai */}
          <div className="p-4 space-y-1.5">
            <div className="text-xs font-semibold text-zinc-500">
              Total Modal Beli Dipakai
            </div>
            <div
              className="text-xl font-bold font-mono tabular-nums text-zinc-900"
              title={formatRupiah(summary.totalModalDipakai)}
            >
              {formatRupiah(summary.totalModalDipakai)}
            </div>
            <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
              Terjual: {formatRupiahSingkat(summary.totalModalTerjual)} · Berjalan:{' '}
              {formatRupiahSingkat(summary.totalModalBerjalan)}
            </div>
          </div>

          {/* KPI 2: Realisasi Penjualan & Uang Masuk */}
          <div className="p-4 space-y-1.5">
            <div className="text-xs font-semibold text-zinc-500">
              Realisasi Penjualan &amp; Uang Masuk
            </div>
            <div
              className="text-xl font-bold font-mono tabular-nums text-sky-900"
              title={formatRupiah(summary.totalRealisasiPenjualan)}
            >
              {formatRupiah(summary.totalRealisasiPenjualan)}
            </div>
            <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
              Via Uang Masuk: {formatRupiahSingkat(summary.totalUangMasukLinked)}
              {summary.totalPiutangBuyer > 0
                ? ` · Piutang: ${formatRupiahSingkat(summary.totalPiutangBuyer)}`
                : ''}
            </div>
          </div>

          {/* KPI 3: Laba / Rugi Realisasi */}
          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-500">
                Profit / Junam Realisasi
              </span>
              <span
                className={`text-[11px] font-bold font-mono tabular-nums ${
                  summary.totalProfitRealisasi > 0
                    ? 'text-emerald-700'
                    : summary.totalProfitRealisasi < 0
                      ? 'text-rose-700'
                      : 'text-zinc-500'
                }`}
              >
                {summary.totalProfitRealisasi > 0
                  ? `PROFIT +${summary.totalMarginPct}%`
                  : summary.totalProfitRealisasi < 0
                    ? `JUNAM ${summary.totalMarginPct}%`
                    : 'IMPAS 0%'}
              </span>
            </div>
            <div
              className={`text-xl font-bold font-mono tabular-nums ${
                summary.totalProfitRealisasi > 0
                  ? 'text-emerald-700'
                  : summary.totalProfitRealisasi < 0
                    ? 'text-rose-700'
                    : 'text-zinc-900'
              }`}
              title={formatRupiah(summary.totalProfitRealisasi)}
            >
              {summary.totalProfitRealisasi > 0 ? '+' : ''}
              {formatRupiah(summary.totalProfitRealisasi)}
            </div>
            <div className="text-[11px] text-zinc-600">
              {summary.profitCount} komoditas profit · {summary.junamCount} junam ·{' '}
              {summary.pendingCount} menunggu cair
            </div>
          </div>

          {/* KPI 4: Modal Sedang Berjalan */}
          <div className="p-4 space-y-1.5">
            <div className="text-xs font-semibold text-zinc-500">
              Modal Sedang Berjalan (Stok + Muat)
            </div>
            <div
              className="text-xl font-bold font-mono tabular-nums text-amber-800"
              title={formatRupiah(summary.totalModalBerjalan)}
            >
              {formatRupiah(summary.totalModalBerjalan)}
            </div>
            <div className="text-[11px] text-zinc-600 font-mono tabular-nums">
              Gudang: {formatKg(summary.totalStokReadyKg)} Kg (
              {formatRupiahSingkat(summary.totalModalGudang)})
              {summary.totalModalMuatPending > 0
                ? ` · Muat Belum Cair: ${formatKg(summary.totalMuatPendingKg)} Kg`
                : ''}
            </div>
          </div>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 bg-zinc-100 rounded-lg border border-zinc-200 text-xs">
              {(
                [
                  { id: 'SEMUA', label: `Semua (${rows.length})` },
                  { id: 'PROFIT', label: `Profit (${summary.profitCount})` },
                  { id: 'JUNAM', label: `Junam / Rugi (${summary.junamCount})` },
                  { id: 'MENUNGGU_CAIR', label: `Belum Cair (${summary.pendingCount})` },
                ] as Array<{ id: StatusFilter; label: string }>
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari komoditas..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-300 bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 w-48"
              />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-zinc-800 focus:outline-none focus:border-zinc-900 cursor-pointer"
            >
              <option value="PROFIT_DESC">Urutkan: Profit Tertinggi</option>
              <option value="PROFIT_ASC">Urutkan: Junam / Terendah Dulu</option>
              <option value="MODAL_DESC">Urutkan: Modal Terbesar</option>
              <option value="PENJUALAN_DESC">Urutkan: Penjualan Terbesar</option>
              <option value="NAMA_ASC">Urutkan: Nama A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabel Utama Komparasi Profitabilitas per Komoditas */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-zinc-50/70">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">
              Komparasi Modal vs Penjualan &amp; Uang Masuk per Komoditas
            </h3>
            <p className="text-xs text-zinc-500">
              Klik baris komoditas untuk membuka rincian per kloter muat, uang masuk, dan modal stok gudang
            </p>
          </div>
          <div className="text-xs text-zinc-500 font-mono tabular-nums">
            Menampilkan {filteredRows.length} dari {rows.length} komoditas
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold text-[11px]">
                <th className="py-3 px-4 min-w-[210px]">Komoditas &amp; Rata Harga</th>
                <th className="py-3 px-4 text-right min-w-[140px]">Total Modal Dipakai</th>
                <th className="py-3 px-4 text-right min-w-[145px]">Modal Terjual (HPP)</th>
                <th className="py-3 px-4 text-right min-w-[155px]">Modal Sedang Berjalan</th>
                <th className="py-3 px-4 text-right min-w-[160px]">Penjualan &amp; Uang Masuk</th>
                <th className="py-3 px-4 text-right min-w-[165px]">Status Profit / Junam</th>
                <th className="py-3 px-3 text-center w-12">Rinci</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    Tidak ada komoditas yang sesuai filter pencarian atau status saat ini.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isExpanded = expandedKode === row.kode;
                  const modalBarPct = Math.min(
                    100,
                    Math.round((row.modalTerjualRealisasiRp / maxBarRp) * 100)
                  );
                  const jualBarPct = Math.min(
                    100,
                    Math.round((row.totalRealisasiPenjualanRp / maxBarRp) * 100)
                  );

                  return (
                    <React.Fragment key={row.kode}>
                      <tr
                        onClick={() => setExpandedKode(isExpanded ? null : row.kode)}
                        className={`transition-colors cursor-pointer ${
                          isExpanded ? 'bg-zinc-50' : 'hover:bg-zinc-50/70'
                        }`}
                      >
                        {/* Kolom 1: Komoditas + Rata-rata Beli vs Jual + Mini Visual Bar */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-zinc-400 shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-zinc-700" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="font-bold text-zinc-900 text-xs truncate">
                                {row.nama}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono tabular-nums">
                                {row.kode} · Beli {formatRupiahSingkat(row.rataHargaBeliPerKg)}/Kg
                                {row.rataHargaJualPerKg > 0
                                  ? ` · Jual ${formatRupiahSingkat(row.rataHargaJualPerKg)}/Kg`
                                  : ''}
                              </div>
                              {/* Visual perbandingan HPP vs Penjualan */}
                              {(row.modalTerjualRealisasiRp > 0 ||
                                row.totalRealisasiPenjualanRp > 0) && (
                                <div className="space-y-1 pt-1 max-w-[200px]">
                                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-zinc-400 rounded-full"
                                      style={{ width: `${Math.max(4, modalBarPct)}%` }}
                                      title={`Modal HPP Terjual: ${formatRupiah(row.modalTerjualRealisasiRp)}`}
                                    />
                                  </div>
                                  <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        row.profitRealisasiRp >= 0
                                          ? 'bg-emerald-600'
                                          : 'bg-rose-600'
                                      }`}
                                      style={{ width: `${Math.max(4, jualBarPct)}%` }}
                                      title={`Realisasi Penjualan: ${formatRupiah(row.totalRealisasiPenjualanRp)}`}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Kolom 2: Total Modal Dipakai */}
                        <td className="py-3.5 px-4 text-right align-top font-mono tabular-nums">
                          <div
                            className="font-bold text-zinc-900"
                            title={formatRupiah(row.totalModalDipakaiRp)}
                          >
                            {formatRupiah(row.totalModalDipakaiRp)}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {formatKg(row.stokAwalKg + row.beliPutusKg)} Kg masuk
                          </div>
                          {row.beliBelumPutusKg > 0 && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              +{formatKg(row.beliBelumPutusKg)} Kg belum putus beli
                            </div>
                          )}
                        </td>

                        {/* Kolom 3: Modal Terjual (HPP) */}
                        <td className="py-3.5 px-4 text-right align-top font-mono tabular-nums">
                          <div
                            className="font-semibold text-zinc-800"
                            title={formatRupiah(row.modalTerjualRealisasiRp)}
                          >
                            {formatRupiah(row.modalTerjualRealisasiRp)}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {formatKg(row.terjualRealisasiKg)} Kg cair/deal
                          </div>
                          {row.tonaseAkhirRealisasiKg > 0 &&
                            Math.abs(row.tonaseAkhirRealisasiKg - row.terjualRealisasiKg) >= 0.1 && (
                              <div className="text-[10px] text-zinc-500 mt-0.5">
                                Akhir: {formatKg(row.tonaseAkhirRealisasiKg)} Kg
                              </div>
                            )}
                        </td>

                        {/* Kolom 4: Modal Sedang Berjalan */}
                        <td className="py-3.5 px-4 text-right align-top font-mono tabular-nums">
                          <div
                            className="font-semibold text-amber-900"
                            title={formatRupiah(row.totalModalBerjalanRp)}
                          >
                            {formatRupiah(row.totalModalBerjalanRp)}
                          </div>
                          <div className="text-[11px] text-zinc-600 mt-0.5">
                            Gudang: {formatKg(row.stokReadyKg)} Kg
                          </div>
                          {row.modalMuatMenungguCairRp > 0 && (
                            <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                              Muat belum cair: {formatRupiahSingkat(row.modalMuatMenungguCairRp)} (
                              {formatKg(row.muatMenungguCairKg)} Kg)
                            </div>
                          )}
                        </td>

                        {/* Kolom 5: Penjualan & Uang Masuk */}
                        <td className="py-3.5 px-4 text-right align-top font-mono tabular-nums">
                          <div
                            className="font-bold text-sky-900"
                            title={formatRupiah(row.totalRealisasiPenjualanRp)}
                          >
                            {formatRupiah(row.totalRealisasiPenjualanRp)}
                          </div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {row.notaMuatCount} muat · {row.uangMasukTxCount} uang masuk
                          </div>
                          {row.totalPiutangBuyerRp > 0 && (
                            <div className="text-[10px] text-amber-700 mt-0.5">
                              Sisa piutang: {formatRupiahSingkat(row.totalPiutangBuyerRp)}
                            </div>
                          )}
                        </td>

                        {/* Kolom 6: Profit / Junam */}
                        <td className="py-3.5 px-4 text-right align-top font-mono tabular-nums">
                          {row.verdict === 'PROFIT' ? (
                            <div>
                              <div className="font-bold text-emerald-700 inline-flex items-center justify-end gap-1">
                                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                                <span>+{formatRupiah(row.profitRealisasiRp)}</span>
                              </div>
                              <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                                PROFIT · +{row.marginRealisasiPct}%
                              </div>
                            </div>
                          ) : row.verdict === 'JUNAM' ? (
                            <div>
                              <div className="font-bold text-rose-700 inline-flex items-center justify-end gap-1">
                                <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                                <span>{formatRupiah(row.profitRealisasiRp)}</span>
                              </div>
                              <div className="text-[11px] font-semibold text-rose-700 mt-0.5">
                                JUNAM / RUGI · {row.marginRealisasiPct}%
                              </div>
                            </div>
                          ) : row.verdict === 'IMPAS' ? (
                            <div>
                              <div className="font-semibold text-zinc-700">Rp 0</div>
                              <div className="text-[11px] text-zinc-500 mt-0.5">IMPAS · 0%</div>
                            </div>
                          ) : row.verdict === 'MENUNGGU_CAIR' ? (
                            <div>
                              <div className="font-semibold text-sky-800 inline-flex items-center justify-end gap-1">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                <span>Belum Cair</span>
                              </div>
                              <div className="text-[11px] text-zinc-500 mt-0.5">
                                {row.notaMenungguCairCount > 0
                                  ? `${row.notaMenungguCairCount} muat tunggu uang masuk`
                                  : 'Stok masih di gudang'}
                              </div>
                            </div>
                          ) : (
                            <div className="text-zinc-400">Belum ada transaksi</div>
                          )}
                        </td>

                        {/* Kolom 7: Expand button */}
                        <td className="py-3.5 px-3 text-center align-top">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedKode(isExpanded ? null : row.kode);
                            }}
                            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 transition-colors cursor-pointer"
                            title="Lihat rincian per nota muat & uang masuk"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Detail Expanded Row */}
                      {isExpanded && (
                        <tr className="bg-zinc-50/80">
                          <td colSpan={7} className="p-4 sm:p-5 border-t border-zinc-200">
                            <div className="space-y-4">
                              {/* Ringkasan Formula Modal vs Penjualan untuk Komoditas Ini */}
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs font-mono tabular-nums text-zinc-700">
                                  <span>
                                    Stok Awal:{' '}
                                    <strong className="text-zinc-900">
                                      {formatKg(row.stokAwalKg)} Kg ({formatRupiah(row.modalStokAwalRp)})
                                    </strong>
                                  </span>
                                  <span>
                                    Beli Petani:{' '}
                                    <strong className="text-zinc-900">
                                      {formatKg(row.beliPutusKg)} Kg ({formatRupiah(row.beliPutusRp)})
                                    </strong>
                                  </span>
                                  <span>
                                    Gudang Ready:{' '}
                                    <strong className="text-amber-900">
                                      {formatKg(row.stokReadyKg)} Kg @{' '}
                                      {formatRupiah(row.rataModalGudangPerKg)}/Kg ={' '}
                                      {formatRupiah(row.modalStokGudangRp)}
                                    </strong>
                                  </span>
                                </div>
                                {onSelectKomoditas && (
                                  <button
                                    type="button"
                                    onClick={() => onSelectKomoditas(row.kode)}
                                    className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <Scale className="w-3.5 h-3.5" />
                                    <span>Buka Buku Mutasi {row.nama}</span>
                                  </button>
                                )}
                              </div>

                              {/* Daftar Rincian Kloter Muat & Uang Masuk */}
                              {row.saleDetails.length === 0 ? (
                                <div className="py-5 text-center text-xs text-zinc-500 bg-white rounded-lg border border-zinc-200">
                                  Belum ada nota muat keluar atau pencairan uang masuk untuk{' '}
                                  <strong className="text-zinc-800">{row.nama}</strong> pada periode ini.
                                </div>
                              ) : (
                                <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left border-collapse">
                                      <thead>
                                        <tr className="bg-zinc-100/80 border-b border-zinc-200 text-zinc-600 font-semibold text-[11px]">
                                          <th className="py-2.5 px-3">No Nota / Sumber</th>
                                          <th className="py-2.5 px-3">Tanggal</th>
                                          <th className="py-2.5 px-3">Pembeli / Eksportir</th>
                                          <th className="py-2.5 px-3 text-right">Berat Muat / Akhir</th>
                                          <th className="py-2.5 px-3 text-right">Modal HPP</th>
                                          <th className="py-2.5 px-3 text-right">Realisasi Jual / UM</th>
                                          <th className="py-2.5 px-3 text-right">Profit / Junam</th>
                                          <th className="py-2.5 px-3 text-right">Status / Aksi</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-200 font-mono tabular-nums">
                                        {row.saleDetails.map((d) => (
                                          <tr key={`${d.source}-${d.id}`} className="hover:bg-zinc-50/70">
                                            <td className="py-2.5 px-3">
                                              <div className="font-bold text-zinc-900">{d.id}</div>
                                              <div className="text-[10px] font-sans text-zinc-500">
                                                {d.metodeLabel}
                                                {d.noSuratJalan ? ` · DO: ${d.noSuratJalan}` : ''}
                                              </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-zinc-700 whitespace-nowrap">
                                              {d.tanggal}
                                            </td>
                                            <td className="py-2.5 px-3 font-sans font-semibold text-zinc-800">
                                              {d.pembeli}
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-zinc-800">
                                              <div>{formatKg(d.beratMuatKg)} Kg</div>
                                              {d.tonaseAkhirKg > 0 &&
                                                d.tonaseAkhirKg !== d.beratMuatKg && (
                                                  <div className="text-[10px] text-emerald-700">
                                                    Akhir: {formatKg(d.tonaseAkhirKg)} Kg
                                                  </div>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-right text-zinc-700">
                                              {formatRupiah(d.modalHppRp)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-semibold text-sky-900">
                                              {d.isMenungguCair
                                                ? 'Rp 0'
                                                : formatRupiah(d.realisasiPenjualanRp)}
                                              {d.uangMasukIds.length > 0 && (
                                                <div className="text-[10px] font-sans font-normal text-zinc-500">
                                                  {d.uangMasukIds.join(', ')}
                                                </div>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-bold">
                                              {d.isMenungguCair ? (
                                                <span className="text-zinc-400 font-sans font-medium">
                                                  Menunggu cair
                                                </span>
                                              ) : (
                                                <span
                                                  className={
                                                    d.profitRp > 0
                                                      ? 'text-emerald-700'
                                                      : d.profitRp < 0
                                                        ? 'text-rose-700'
                                                        : 'text-zinc-600'
                                                  }
                                                >
                                                  {d.profitRp > 0 ? '+' : ''}
                                                  {formatRupiah(d.profitRp)}
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2.5 px-3 text-right font-sans">
                                              {d.isMenungguCair &&
                                              d.source === 'NOTA_MUAT' &&
                                              onInputUangMasuk ? (
                                                <button
                                                  type="button"
                                                  onClick={() => onInputUangMasuk(d.id)}
                                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-700 hover:bg-sky-800 text-white text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors"
                                                >
                                                  <ArrowDownLeft className="w-3 h-3" />
                                                  <span>Input Uang Masuk</span>
                                                </button>
                                              ) : (
                                                <span className="text-[11px] text-zinc-500">
                                                  {d.piutangRp > 0
                                                    ? `Piutang ${formatRupiahSingkat(d.piutangRp)}`
                                                    : 'Tercatat'}
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot>
                <tr className="bg-zinc-900 text-white font-mono tabular-nums text-xs">
                  <td className="py-3.5 px-4 font-sans font-bold">
                    TOTAL KESELURUHAN ({filteredRows.length} Komoditas)
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold">
                    {formatRupiah(
                      filteredRows.reduce((s, r) => s + r.totalModalDipakaiRp, 0)
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold">
                    {formatRupiah(
                      filteredRows.reduce((s, r) => s + r.modalTerjualRealisasiRp, 0)
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-amber-300">
                    {formatRupiah(
                      filteredRows.reduce((s, r) => s + r.totalModalBerjalanRp, 0)
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-sky-300">
                    {formatRupiah(
                      filteredRows.reduce((s, r) => s + r.totalRealisasiPenjualanRp, 0)
                    )}
                  </td>
                  <td
                    className={`py-3.5 px-4 text-right font-bold ${
                      filteredRows.reduce((s, r) => s + r.profitRealisasiRp, 0) >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {filteredRows.reduce((s, r) => s + r.profitRealisasiRp, 0) > 0 ? '+' : ''}
                    {formatRupiah(
                      filteredRows.reduce((s, r) => s + r.profitRealisasiRp, 0)
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Catatan Uang Masuk Penjualan Hasil Bumi yang Belum Terhubung ke Komoditas Tertentu */}
      {unmatchedUangMasuk.length > 0 && (
        <div className="bg-white rounded-xl border border-amber-300 overflow-hidden">
          <div className="px-5 py-3.5 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-amber-950">
                Uang Masuk Penjualan Hasil Bumi Belum Terhubung ke Komoditas Spesifik (
                {unmatchedUangMasuk.length} transaksi · Total{' '}
                <span className="font-mono tabular-nums">
                  {formatRupiah(summary.totalUnmatchedUmRp)}
                </span>
                )
              </div>
              <p className="text-[11px] text-amber-900">
                Transaksi Uang Masuk ini berkategori Penjualan Hasil Bumi tetapi belum memilih Nota Muat atau nama komoditas, sehingga belum masuk hitungan per komoditas di atas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUnmatchedUm((prev) => !prev)}
              className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-amber-950 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {showUnmatchedUm ? 'Sembunyikan Daftar' : 'Lihat Daftar'}
            </button>
          </div>
          {showUnmatchedUm && (
            <div className="overflow-x-auto border-t border-amber-200">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold text-[11px]">
                    <th className="py-2.5 px-4">ID Transaksi</th>
                    <th className="py-2.5 px-4">Tanggal</th>
                    <th className="py-2.5 px-4">Pengirim / Buyer</th>
                    <th className="py-2.5 px-4">Kategori &amp; Keterangan</th>
                    <th className="py-2.5 px-4 text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {unmatchedUangMasuk.map((um) => (
                    <tr key={um.idTransaksi} className="hover:bg-zinc-50">
                      <td className="py-2.5 px-4 font-mono font-semibold text-zinc-900">
                        {um.idTransaksi}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                        {um.tanggal}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-zinc-800">
                        {um.namaPengirim || um.pengirim || '-'}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-600">
                        <span className="font-semibold text-zinc-800">{um.kategori}</span> ·{' '}
                        {um.keterangan}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatRupiah(um.nominal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
