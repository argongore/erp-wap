import type {
  DetailHarianKaryawanResponse,
  RekapMitraItem,
  RekeningKoranHistoryItem,
  RekeningKoranMitraSummary,
} from '../server/types.ts';
import type { ReceiptData } from '../components/common/PrintReceiptModal.tsx';
import { formatRupiah } from './format.ts';

function formatNowDmyAndTime(): { tanggal: string; jam: string } {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return { tanggal: `${dd}/${mm}/${yy}`, jam: `${hh}:${mi}` };
}

function formatShortDateDmy(dmy?: string): string {
  if (!dmy) return '-';
  const parts = dmy.split('/');
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  }
  return dmy;
}

function trimText(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(4, maxLen - 1)).trim()}…`;
}

function parseDmyTimeMs(tgl?: string, jam?: string): number {
  const [dd, mm, yyyy] = String(tgl || '').split('/').map(Number);
  const [hh, min, ss] = String(jam || '00:00:00').split(':').map(Number);
  if (yyyy && mm && dd) {
    return new Date(yyyy, mm - 1, dd, hh || 0, min || 0, ss || 0).getTime();
  }
  return 0;
}

function mapHistoryItemToThermalItems(
  h: RekeningKoranHistoryItem
): NonNullable<ReceiptData['items']> {
  const shortDate = formatShortDateDmy(h.tanggal);
  const jenisClean = (h.jenis || 'TRANSAKSI').replace(/_/g, ' ').trim();
  const jenisUpper = jenisClean.toUpperCase();

  const isTitipMasuk =
    h.kategoriMutasiHak === 'TITIP_MASUK' ||
    h.kategoriMutasiHak === 'UPAH_TERCATAT' ||
    (!h.kategoriMutasiHak &&
      ((jenisUpper.includes('TITIP') &&
        !jenisUpper.includes('PENCAIRAN') &&
        !jenisUpper.includes('POTONG TITIPAN')) ||
        jenisUpper.includes('PINJAMAN UANG PT KE MITRA') ||
        jenisUpper.includes('UPAH KERJA')));

  const isTitipKeluar =
    h.kategoriMutasiHak === 'TITIP_CAIR' ||
    h.kategoriMutasiHak === 'SLIP_GAJI' ||
    (!h.kategoriMutasiHak &&
      ((jenisUpper.includes('PENCAIRAN') && jenisUpper.includes('TITIP')) ||
        jenisUpper.includes('POTONG TITIPAN') ||
        jenisUpper.includes('PEMBAYARAN GAJI')));

  const isPiutangRow = h.debet > 0 || (h.piutangBerjalan ?? 0) > 0;
  const isBayarRow = h.kredit > 0 && !isTitipMasuk;

  let tag = '';
  let nominal = 0;
  let subtotalText = '';

  if (h.isBelumPutusHarga && (h.beratTitipBelumPutusKg || 0) > 0) {
    tag = h.isTitipNonFisik ? 'TITIP NON-FISIK' : 'TITIP BLM PUTUS';
    nominal = 0;
    subtotalText = `${Number(h.beratTitipBelumPutusKg).toLocaleString('id-ID')} Kg`;
  } else if (isPiutangRow) {
    tag = h.isNotaNgunci ? 'PIUTANG/NGUNCI' : 'PIUTANG';
    nominal = h.piutangBerjalan ?? h.sisaPiutangNota ?? h.debet;
    subtotalText = `+${formatRupiah(nominal)}`;
  } else if (isTitipMasuk) {
    tag = 'HUTANG PT';
    nominal = h.titipBerjalan ?? h.nominalMutasiHak ?? h.kredit ?? h.nominalTransaksi ?? 0;
    subtotalText = formatRupiah(nominal);
  } else if (isBayarRow) {
    tag = h.isBayarBonSiklusBerjalan ? 'ANGSUR BON' : 'BAYAR BON';
    nominal = h.kredit;
    subtotalText = `-${formatRupiah(nominal)}`;
  } else if (isTitipKeluar) {
    tag = 'CAIR TITIP';
    nominal = h.nominalMutasiHak ?? h.nominalTransaksi ?? h.debet ?? h.kredit ?? 0;
    subtotalText = `-${formatRupiah(nominal)}`;
  } else {
    tag = h.metodePembayaran || 'TRX';
    nominal = h.nominalTransaksi ?? h.debet ?? h.kredit ?? 0;
    subtotalText = formatRupiah(nominal);
  }

  const itemsDetail = Array.isArray(h.itemsDetail) ? h.itemsDetail.filter(Boolean) : [];
  const noteStr = (h.catatanTransaksi || h.keterangan || h.rincianNotaLalu || '').trim();

  // Jika ada beberapa item produk/komoditas pada satu nota, tampilkan rinciannya secara rapi
  if (itemsDetail.length > 1) {
    const out: NonNullable<ReceiptData['items']> = [];
    const headerTitle = `${shortDate} - ${trimText(jenisClean, 28)}`;
    const firstDetailParts = [
      tag,
      h.noNotaLalu ? `Nota ${h.noNotaLalu}` : h.noNotaToko ? `Nota ${h.noNotaToko}` : '',
      `${itemsDetail.length} Item`,
    ].filter(Boolean);

    out.push({
      nama: headerTitle,
      detailLine: firstDetailParts.join(' · '),
      subtotal: nominal,
      subtotalText,
    });

    itemsDetail.forEach((it) => {
      const qtyTxt = `${Number(it.qty || 1).toLocaleString('id-ID')} ${it.satuan || ''}`.trim();
      const hrgTxt = Number(it.harga || 0) > 0 ? `@${Number(it.harga).toLocaleString('id-ID')}` : '';
      out.push({
        nama: `  - ${trimText(it.nama || 'Item', 32)}`,
        detailLine: `    ${[qtyTxt, hrgTxt].filter(Boolean).join(' ')}`,
        subtotal: Number(it.subtotal || 0),
        subtotalText:
          h.isBelumPutusHarga && Number(it.subtotal || 0) === 0
            ? qtyTxt
            : formatRupiah(Number(it.subtotal || 0)),
      });
    });

    return out;
  }

  // Single-line item (atau kasbon uang / bayar bon / 1 produk)
  const singleProduct = itemsDetail.length === 1 ? itemsDetail[0] : null;
  const primaryTitle = singleProduct
    ? `${shortDate} - ${trimText(singleProduct.nama || jenisClean, 30)}`
    : `${shortDate} - ${trimText(
        noteStr && noteStr !== '-' && noteStr.toLowerCase() !== jenisClean.toLowerCase()
          ? `${jenisClean}: ${noteStr}`
          : jenisClean,
        34
      )}`;

  const detailParts: string[] = [tag];
  if (singleProduct) {
    const qtyTxt = `${Number(singleProduct.qty || 1).toLocaleString('id-ID')} ${
      singleProduct.satuan || ''
    }`.trim();
    const hrgNum = Number(singleProduct.harga || 0);
    if (hrgNum > 0) {
      detailParts.push(`${qtyTxt} x ${hrgNum.toLocaleString('id-ID')}`);
    } else if (qtyTxt) {
      detailParts.push(qtyTxt);
    }
  } else if (h.qtyDisplay && h.qtyDisplay !== '-' && h.qtyDisplay !== '1 (Uang)') {
    detailParts.push(trimText(h.qtyDisplay, 16));
  }
  if (h.noNotaLalu) {
    detailParts.push(`Ref:${h.noNotaLalu}`);
  } else if (h.noNotaToko) {
    detailParts.push(`Ref:${h.noNotaToko}`);
  }
  if (singleProduct && noteStr && noteStr !== '-' && !noteStr.toLowerCase().includes((singleProduct.nama || '').toLowerCase())) {
    detailParts.push(trimText(noteStr, 18));
  }

  return [
    {
      nama: primaryTitle,
      detailLine: detailParts.join(' · '),
      subtotal: nominal,
      subtotalText,
    },
  ];
}

/**
 * Membangun struk thermal 80mm / 58mm untuk Rincian Piutang (Bon) & Hutang PT (Titipan)
 * milik satu Mitra tertentu (dari Rekening Koran Mitra, Master Mitra, Bayar Bon, atau Bayar Titipan).
 */
export function buildThermalReceiptPiutangHutangMitra(
  statement: RekeningKoranMitraSummary,
  options?: {
    scope?: 'SALDO_BERJALAN' | 'SEMUA_HISTORY';
    customRows?: RekeningKoranHistoryItem[];
    scopeLabel?: string;
  }
): ReceiptData {
  const now = formatNowDmyAndTime();
  const scope = options?.scope || 'SALDO_BERJALAN';

  const rawRows: RekeningKoranHistoryItem[] =
    options?.customRows !== undefined
      ? options.customRows
      : scope === 'SALDO_BERJALAN'
      ? Array.isArray(statement.historySaldoBerjalan)
        ? statement.historySaldoBerjalan
        : (statement.history || []).filter((h) => h.isSaldoBerjalan !== false)
      : statement.history || [];

  const sortedRows = [...rawRows].sort(
    (a, b) => parseDmyTimeMs(a.tanggal, a.jam) - parseDmyTimeMs(b.tanggal, b.jam)
  );

  const items: NonNullable<ReceiptData['items']> = [];
  for (const row of sortedRows) {
    items.push(...mapHistoryItemToThermalItems(row));
  }

  const totalBonBarang = Number(statement.totalKasbonBarang || 0);
  const totalBonUang = Number(statement.totalKasbonUang || 0);
  const totalPiutangKotor = Number(statement.totalBonKeseluruhan || 0);
  const nominalNgunci = Number(statement.nominalNotaNgunci || 0);
  const totalTitipPanen = Number(statement.totalTitipPanenMurni ?? statement.totalTitip ?? 0);
  const totalUpahBelumCair = Number(statement.totalUpahBelumDibayar || 0);
  const totalHutangPt = Number(statement.totalTitip || 0);
  const totalTitipBelumPutusKg = Number(statement.totalTitipBelumPutusKg || 0);
  const jumlahNotaBelumPutus = Number(statement.jumlahNotaBelumPutusHarga || 0);

  let title = 'RINCIAN PIUTANG & HUTANG';
  if (totalPiutangKotor > 0 && totalHutangPt > 0) {
    title = 'RINCIAN PIUTANG & HUTANG MITRA';
  } else if (totalPiutangKotor > 0) {
    title = 'RINCIAN PIUTANG (KASBON) MITRA';
  } else if (totalHutangPt > 0) {
    title = 'RINCIAN HUTANG PT (TITIPAN)';
  } else if (totalTitipBelumPutusKg > 0) {
    title = 'RINCIAN TITIP PANEN MITRA';
  }

  const detailRows: NonNullable<ReceiptData['detailRows']> = [];

  if (totalBonBarang > 0) {
    detailRows.push({ label: 'Piutang Bon Barang', value: totalBonBarang });
  }
  if (totalBonUang > 0) {
    detailRows.push({ label: 'Piutang Bon Uang', value: totalBonUang });
  }
  if (nominalNgunci > 0) {
    detailRows.push({ label: 'Termasuk Nota Ngunci', value: nominalNgunci });
  }
  if (totalPiutangKotor > 0) {
    detailRows.push({
      label: 'TOTAL PIUTANG MITRA',
      value: totalPiutangKotor,
      highlight: true,
    });
  }

  if (totalTitipPanen > 0 && totalUpahBelumCair > 0) {
    detailRows.push({ label: 'Hutang PT (Titip/HB)', value: totalTitipPanen });
    detailRows.push({ label: 'Hutang PT (Upah Kerja)', value: totalUpahBelumCair });
  }
  if (totalHutangPt > 0) {
    detailRows.push({
      label: 'TOTAL HUTANG PT KE MITRA',
      value: totalHutangPt,
      highlight: true,
    });
  }
  if (totalTitipBelumPutusKg > 0) {
    detailRows.push({
      label: 'Titip Panen Blm Putus',
      value: `${totalTitipBelumPutusKg.toLocaleString('id-ID')} Kg (${jumlahNotaBelumPutus || 1} Nota)`,
      highlight: true,
    });
  }

  const selisihNet = totalPiutangKotor - totalHutangPt;
  let finalTotalAmount = 0;

  if (selisihNet > 0) {
    finalTotalAmount = selisihNet;
    detailRows.push({
      label: 'SISA PIUTANG (MITRA BAYAR)',
      value: selisihNet,
      isTotal: true,
    });
  } else if (selisihNet < 0) {
    finalTotalAmount = Math.abs(selisihNet);
    detailRows.push({
      label: 'SISA HUTANG PT (PT BAYAR)',
      value: Math.abs(selisihNet),
      isTotal: true,
    });
  } else {
    detailRows.push({
      label: 'POSISI NERACA AKHIR',
      value: 'LUNAS / IMPAS (Rp 0)',
      isTotal: true,
    });
  }

  if (statement.telepon && statement.telepon !== '-') {
    detailRows.push({ label: 'Telp / HP Mitra', value: statement.telepon });
  }

  const scopeDesc =
    options?.scopeLabel ||
    (scope === 'SALDO_BERJALAN'
      ? `Saldo Berjalan (${sortedRows.length} Transaksi)`
      : `Semua Riwayat (${sortedRows.length} Transaksi)`);

  return {
    modalHeaderTitle: 'Cetak Thermal Piutang & Hutang Mitra',
    title,
    subtitle: scopeDesc,
    mitraLabel: 'Mitra',
    itemsHeaderLeft: 'TGL / RINCIAN MUTASI',
    itemsHeaderRight: 'NOMINAL',
    signatureRightLabel: 'Mitra / Penerima',
    nomorTransaksi: `RK-${(statement.kodeMitra || statement.idMitra).slice(0, 14)}`,
    tanggal: now.tanggal,
    jam: now.jam,
    mitra: `${statement.namaMitra}${statement.kodeMitra ? ` (${statement.kodeMitra})` : ''}`,
    kasir: 'Bag. Keuangan / Kasir',
    items,
    detailRows,
    total: finalTotalAmount,
    catatan:
      statement.catatanNgunci ||
      'Mohon diperiksa kembali rincian piutang / hutang berjalan ini. Terima kasih.',
  };
}

/**
 * Membangun struk thermal 80mm / 58mm berisi DAFTAR RINGKAS semua mitra
 * yang memiliki Piutang, Hutang PT, atau Nota Ngunci (dari Master Mitra).
 */
export function buildThermalReceiptDaftarPiutangHutang(
  items: RekapMitraItem[],
  options?: {
    mode?: 'PIUTANG' | 'HUTANG' | 'SEMUA' | 'NGUNCI';
    filterLabel?: string;
  }
): ReceiptData {
  const now = formatNowDmyAndTime();
  const mode = options?.mode || 'SEMUA';

  const relevant = items.filter((m) => {
    const pTotal = Number(m.totalBonMitra || 0);
    const nKunci = Number(m.nominalNotaNgunci || 0);
    const pAktif = m.nominalPiutangAktif ?? Math.max(0, pTotal - nKunci);
    const hPt = Number(m.totalHutangTitipPanen || 0);
    if (mode === 'PIUTANG') return pAktif > 0 || pTotal > 0;
    if (mode === 'HUTANG') return hPt > 0;
    if (mode === 'NGUNCI') return Boolean(m.isNotaNgunci || nKunci > 0);
    return pTotal > 0 || hPt > 0 || nKunci > 0;
  });

  const sorted = [...relevant].sort((a, b) => {
    const scoreA =
      mode === 'HUTANG'
        ? Number(a.totalHutangTitipPanen || 0)
        : mode === 'NGUNCI'
        ? Number(a.nominalNotaNgunci || a.totalBonMitra || 0)
        : Math.max(Number(a.totalBonMitra || 0), Number(a.totalHutangTitipPanen || 0));
    const scoreB =
      mode === 'HUTANG'
        ? Number(b.totalHutangTitipPanen || 0)
        : mode === 'NGUNCI'
        ? Number(b.nominalNotaNgunci || b.totalBonMitra || 0)
        : Math.max(Number(b.totalBonMitra || 0), Number(b.totalHutangTitipPanen || 0));
    return scoreB - scoreA;
  });

  let sumPiutangAktif = 0;
  let sumHutangPt = 0;
  let sumNgunci = 0;

  const thermalItems: NonNullable<ReceiptData['items']> = sorted.map((m, idx) => {
    const pTotal = Number(m.totalBonMitra || 0);
    const nKunci = Number(m.nominalNotaNgunci || 0);
    const pAktif = m.nominalPiutangAktif ?? Math.max(0, pTotal - nKunci);
    const hPt = Number(m.totalHutangTitipPanen || 0);

    sumPiutangAktif += pAktif;
    sumHutangPt += hPt;
    sumNgunci += nKunci;

    if (mode === 'PIUTANG') {
      const detailParts: string[] = [];
      if (m.totalKasbonBarang > 0) detailParts.push(`Brg ${m.totalKasbonBarang.toLocaleString('id-ID')}`);
      if (m.totalKasbonUang > 0) detailParts.push(`Uang ${m.totalKasbonUang.toLocaleString('id-ID')}`);
      if (hPt > 0) detailParts.push(`Titip ${hPt.toLocaleString('id-ID')}`);
      return {
        nama: `${idx + 1}. ${trimText(m.nama, 28)}`,
        detailLine: detailParts.length > 0 ? detailParts.join(' · ') : 'Piutang Aktif',
        subtotal: pTotal,
        subtotalText: formatRupiah(pTotal),
      };
    }

    if (mode === 'HUTANG') {
      const detailParts: string[] = [];
      if ((m.totalTitipPanenMurni || 0) > 0) detailParts.push('Titip/HB');
      if ((m.totalUpahBelumDibayar || 0) > 0) detailParts.push('Upah');
      if (pTotal > 0) detailParts.push(`Bon ${pTotal.toLocaleString('id-ID')}`);
      return {
        nama: `${idx + 1}. ${trimText(m.nama, 28)}`,
        detailLine: detailParts.length > 0 ? detailParts.join(' · ') : 'Hutang PT',
        subtotal: hPt,
        subtotalText: formatRupiah(hPt),
      };
    }

    if (mode === 'NGUNCI') {
      return {
        nama: `${idx + 1}. ${trimText(m.nama, 28)}`,
        detailLine: m.catatanNgunci ? trimText(m.catatanNgunci, 24) : 'Nota Ngunci',
        subtotal: nKunci || pTotal,
        subtotalText: formatRupiah(nKunci || pTotal),
      };
    }

    // SEMUA (Piutang & Hutang)
    const net = pAktif - hPt;
    const parts: string[] = [];
    if (pAktif > 0) parts.push(`P:${pAktif.toLocaleString('id-ID')}`);
    if (hPt > 0) parts.push(`H:${hPt.toLocaleString('id-ID')}`);
    if (nKunci > 0) parts.push(`Kunci:${nKunci.toLocaleString('id-ID')}`);
    const netText =
      net > 0
        ? `P ${formatRupiah(net)}`
        : net < 0
        ? `H ${formatRupiah(Math.abs(net))}`
        : nKunci > 0
        ? `K ${formatRupiah(nKunci)}`
        : 'Rp 0';

    return {
      nama: `${idx + 1}. ${trimText(m.nama, 28)}`,
      detailLine: parts.join(' | ') || '-',
      subtotal: Math.abs(net),
      subtotalText: netText,
    };
  });

  const selisihBersih = sumPiutangAktif - sumHutangPt;
  const titleMap = {
    PIUTANG: 'DAFTAR PIUTANG (BON) MITRA',
    HUTANG: 'DAFTAR HUTANG PT KE MITRA',
    NGUNCI: 'DAFTAR NOTA NGUNCI MITRA',
    SEMUA: 'REKAP PIUTANG & HUTANG MITRA',
  } as const;

  const detailRows: NonNullable<ReceiptData['detailRows']> = [
    { label: 'Jumlah Mitra Tercatat', value: `${sorted.length} Mitra` },
  ];

  if (sumPiutangAktif > 0 || mode === 'PIUTANG' || mode === 'SEMUA') {
    detailRows.push({
      label: 'Total Piutang Aktif (P)',
      value: sumPiutangAktif,
      highlight: true,
    });
  }
  if (sumHutangPt > 0 || mode === 'HUTANG' || mode === 'SEMUA') {
    detailRows.push({
      label: 'Total Hutang PT (H)',
      value: sumHutangPt,
      highlight: true,
    });
  }
  if (sumNgunci > 0 || mode === 'NGUNCI') {
    detailRows.push({
      label: 'Total Nota Ngunci (K)',
      value: sumNgunci,
      highlight: mode === 'NGUNCI',
    });
  }

  if (mode === 'PIUTANG') {
    detailRows.push({ label: 'GRAND TOTAL PIUTANG', value: sumPiutangAktif + sumNgunci, isTotal: true });
  } else if (mode === 'HUTANG') {
    detailRows.push({ label: 'GRAND TOTAL HUTANG PT', value: sumHutangPt, isTotal: true });
  } else if (mode === 'NGUNCI') {
    detailRows.push({ label: 'TOTAL NOTA NGUNCI', value: sumNgunci, isTotal: true });
  } else {
    detailRows.push({
      label: selisihBersih >= 0 ? 'NET PIUTANG (P - H)' : 'NET HUTANG PT (H - P)',
      value: Math.abs(selisihBersih),
      isTotal: true,
    });
  }

  return {
    modalHeaderTitle: 'Cetak Thermal Rekap Piutang & Hutang',
    title: titleMap[mode],
    subtitle: options?.filterLabel || `Per Tanggal ${now.tanggal} (${sorted.length} Mitra)`,
    mitraLabel: 'Cakupan',
    itemsHeaderLeft: 'NAMA MITRA / RINCIAN',
    itemsHeaderRight: 'SALDO',
    signatureRightLabel: 'Pimpinan / Mengetahui',
    nomorTransaksi: `RKP-${mode}-${now.tanggal.replace(/\//g, '')}`,
    tanggal: now.tanggal,
    jam: now.jam,
    mitra: `${sorted.length} Mitra Aktif`,
    kasir: 'Bag. Keuangan / Kasir',
    items: thermalItems,
    detailRows,
    catatan: 'Keterangan kode: P = Piutang Mitra, H = Hutang PT (Titip/Upah), K = Nota Ngunci.',
  };
}

/**
 * Membangun struk thermal 80mm / 58mm untuk Rincian Piutang (Bon Barang & Bon Uang)
 * serta Hutang PT (Uang Titip & Hak Upah) milik satu Karyawan.
 */
export function buildThermalReceiptBonTitipKaryawan(
  detail: DetailHarianKaryawanResponse,
  options?: {
    scopeLabel?: string;
    saldoTitipAktif?: number;
  }
): ReceiptData {
  const now = formatNowDmyAndTime();
  const { karyawan, riwayatKasbonBarang = [], riwayatKasbonUang = [] } = detail;

  const items: NonNullable<ReceiptData['items']> = [];

  // Kasbon Barang belum lunas dulu, atau semua jika sedikit
  const bonBarangAktif = riwayatKasbonBarang.filter((b) => (b.sisaPiutang || 0) > 0);
  const bonUangAktif = riwayatKasbonUang.filter((b) => (b.sisaKasbon || 0) > 0);

  bonBarangAktif.forEach((b) => {
    const itemsLabel = Array.isArray((b as any).items) && (b as any).items.length > 0
      ? (b as any).items.map((x: any) => `${x.namaProduk} (${x.qty})`).join(', ')
      : b.keterangan || b.noPenjualan || 'Bon Barang Toko';
    items.push({
      nama: `${formatShortDateDmy(b.tanggal)} - BON BRG: ${trimText(itemsLabel, 24)}`,
      detailLine: `PIUTANG · ${b.noPenjualan || 'Toko'}`,
      subtotal: b.sisaPiutang,
      subtotalText: `+${formatRupiah(b.sisaPiutang)}`,
    });
  });

  bonUangAktif.forEach((u) => {
    items.push({
      nama: `${formatShortDateDmy(u.tanggal)} - BON UANG: ${trimText(u.keterangan || 'Kasbon Uang', 24)}`,
      detailLine: `PIUTANG · ${u.idTransaksi || 'Kasbon'}`,
      subtotal: u.sisaKasbon,
      subtotalText: `+${formatRupiah(u.sisaKasbon)}`,
    });
  });

  const totalBonBarang = Number(karyawan.totalKasbonBarang || 0);
  const totalBonUang = Number(karyawan.totalKasbonUang || 0);
  const totalBon = totalBonBarang + totalBonUang;
  const totalUpahBelumCair = Number(karyawan.totalUpahBelumDibayar || 0);
  const saldoTitip = Number(options?.saldoTitipAktif ?? karyawan.totalTitipHasilPanen ?? 0);
  const totalHakKaryawan = totalUpahBelumCair + saldoTitip;
  const saldoNet = totalHakKaryawan - totalBon;

  const detailRows: NonNullable<ReceiptData['detailRows']> = [
    { label: 'Jabatan / Divisi', value: `${karyawan.jabatan} (${karyawan.divisi || karyawan.divisiTerakhir})` },
  ];

  if (totalBonBarang > 0) detailRows.push({ label: 'Bon Barang Toko', value: totalBonBarang });
  if (totalBonUang > 0) detailRows.push({ label: 'Bon Pinjaman Uang', value: totalBonUang });
  detailRows.push({
    label: 'TOTAL PIUTANG (BON)',
    value: totalBon,
    highlight: totalBon > 0,
  });

  if (totalUpahBelumCair > 0) {
    detailRows.push({ label: 'Hak Upah Belum Cair', value: totalUpahBelumCair });
  }
  if (saldoTitip > 0) {
    detailRows.push({ label: 'Uang Titip (Hutang PT)', value: saldoTitip });
  }

  if (saldoNet > 0) {
    detailRows.push({ label: 'SISA HUTANG PT (KE KRY)', value: saldoNet, isTotal: true });
  } else if (saldoNet < 0) {
    detailRows.push({ label: 'SISA PIUTANG (BON KRY)', value: Math.abs(saldoNet), isTotal: true });
  } else {
    detailRows.push({ label: 'POSISI NERACA', value: 'LUNAS / IMPAS (Rp 0)', isTotal: true });
  }

  return {
    modalHeaderTitle: 'Cetak Thermal Piutang Bon & Hutang Titip Karyawan',
    title: 'RINCIAN BON & TITIP KARYAWAN',
    subtitle: options?.scopeLabel || `Posisi Per ${now.tanggal}`,
    mitraLabel: 'Karyawan',
    itemsHeaderLeft: 'TGL / RINCIAN BON AKTIF',
    itemsHeaderRight: 'SISA BON',
    signatureRightLabel: 'Karyawan Penerima',
    nomorTransaksi: `BON-${(karyawan.nik || karyawan.id).slice(0, 12)}`,
    tanggal: now.tanggal,
    jam: now.jam,
    mitra: `${karyawan.nama} (${karyawan.nik})`,
    kasir: 'Bag. Keuangan / Kasir',
    items,
    detailRows,
    total: Math.abs(saldoNet),
    catatan: 'Rincian bon/piutang aktif & saldo hak/titipan karyawan berjalan.',
  };
}
