import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_PT_LOGO_URL,
  ItemRekapPayrollBulanan,
  ItemRincianHarianPayroll,
  ProfilPerusahaan,
  RekapPayrollBulananSummary,
} from '../server/types.ts';
import { formatHariTanggalLabel, formatRupiah, getWIBTodayString } from './format.ts';
import { loadLogoDataUrl } from './exportRekeningKoranPdf.ts';

const NAMA_BULAN_ID = [
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

export type RekapGajiScopeFilter =
  | 'WITH_ACTIVITY'
  | 'ONLY_WORK_LOGS'
  | 'ONLY_PENDING_UPAH'
  | 'ALL_EMPLOYEES';

export interface RekapGajiPrintFilter {
  scope: RekapGajiScopeFilter;
  divisi: string; // 'ALL' or specific divisi
  karyawanId: string; // 'ALL' or specific idKaryawan
  onlyPendingPekerjaan: boolean;
  searchTerm: string;
}

export interface ComputedRekapGajiEmployee {
  item: ItemRekapPayrollBulanan;
  pekerjaanList: ItemRincianHarianPayroll[];
  totalHariDitampilkan: number;
  totalUpahPokokDisplayed: number;
  totalLemburDisplayed: number;
  totalGajiKotorDisplayed: number;
  hakUpahBelumCair: number;
  hakUpahSudahCair: number;
  sisaBonUang: number;
  sisaBonBarang: number;
  totalSisaBon: number;
  titipPanen: number;
  patokanBersihAwalBulan: number; // (hakUpahBelumCair + titipPanen) - totalSisaBon
  neracaBulanBerjalan: number; // (totalGajiKotor + titipPanen) - totalSisaBon
}

export function getPatokanBulanBerikutnyaLabel(bulan: number, tahun: number): string {
  const b = Number(bulan) || 1;
  const t = Number(tahun) || new Date().getFullYear();
  const nextBulan = b >= 12 ? 1 : b + 1;
  const nextTahun = b >= 12 ? t + 1 : t;
  const namaNext = NAMA_BULAN_ID[nextBulan - 1] || `Bulan ${nextBulan}`;
  return `Awal ${namaNext} ${nextTahun}`;
}

export function filterAndComputeRekapGajiForPrint(
  rekapData: RekapPayrollBulananSummary,
  filter: RekapGajiPrintFilter
): ComputedRekapGajiEmployee[] {
  const q = (filter.searchTerm || '').trim().toLowerCase();

  return (rekapData.items || [])
    .filter((item) => {
      if (filter.karyawanId !== 'ALL' && item.idKaryawan !== filter.karyawanId) {
        return false;
      }

      if (filter.divisi !== 'ALL') {
        const divAktif = item.divisiAktifSaatIni || item.divisiUtama;
        const hasLogInDiv = (item.rincianHarian || []).some((r) => r.divisi === filter.divisi);
        if (divAktif !== filter.divisi && item.divisiUtama !== filter.divisi && !hasLogInDiv) {
          return false;
        }
      }

      if (q) {
        const matchHeader =
          item.nama.toLowerCase().includes(q) ||
          item.nik.toLowerCase().includes(q) ||
          item.jabatan.toLowerCase().includes(q) ||
          (item.divisiAktifSaatIni || item.divisiUtama).toLowerCase().includes(q);
        const matchJob = (item.rincianHarian || []).some(
          (l) =>
            (l.item || '').toLowerCase().includes(q) ||
            (l.tugas || '').toLowerCase().includes(q) ||
            (l.catatan || '').toLowerCase().includes(q)
        );
        if (!matchHeader && !matchJob) return false;
      }

      if (filter.scope === 'ONLY_WORK_LOGS') {
        return (item.rincianHarian || []).length > 0;
      }
      if (filter.scope === 'ONLY_PENDING_UPAH') {
        return (item.totalHakUpahPending || 0) > 0;
      }
      if (filter.scope === 'WITH_ACTIVITY') {
        const hasActivity =
          (item.rincianHarian || []).length > 0 ||
          (item.totalGajiKotor || 0) > 0 ||
          (item.totalSisaBonKaryawan || 0) > 0 ||
          (item.saldoTitipHasilPanenMitra || 0) > 0;
        return hasActivity;
      }
      return true;
    })
    .map((item) => {
      const baseLogs = (item.rincianHarian || []).filter((l) => {
        if (filter.divisi !== 'ALL' && l.divisi !== filter.divisi) {
          return false;
        }
        if (filter.onlyPendingPekerjaan) {
          return l.status === 'TERCATAT' || l.ket === 'BON';
        }
        return true;
      });

      const totalUpahPokokDisplayed = baseLogs.reduce(
        (s, l) => s + Number(l.jumlah !== undefined ? l.jumlah : l.upahHarian || 0),
        0
      );
      const totalLemburDisplayed = baseLogs.reduce(
        (s, l) => s + Number(l.uangMakanLembur || 0),
        0
      );
      const totalGajiKotorDisplayed =
        baseLogs.length > 0
          ? baseLogs.reduce(
              (s, l) => s + Number(l.totalUpah !== undefined ? l.totalUpah : l.jumlah || 0),
              0
            )
          : Number(item.totalGajiKotor || 0);

      const hakUpahBelumCair = Number(item.totalHakUpahPending || 0);
      const hakUpahSudahCair = Math.max(0, Number(item.totalGajiKotor || 0) - hakUpahBelumCair);
      const sisaBonUang = Number(item.sisaKasbonUang || 0);
      const sisaBonBarang = Number(item.sisaKasbonBarang || 0);
      const totalSisaBon = Number(item.totalSisaBonKaryawan || sisaBonUang + sisaBonBarang);
      const titipPanen = Number(item.saldoTitipHasilPanenMitra || 0);

      const patokanBersihAwalBulan = hakUpahBelumCair + titipPanen - totalSisaBon;
      const neracaBulanBerjalan =
        (baseLogs.length > 0 ? totalGajiKotorDisplayed : Number(item.totalGajiKotor || 0)) +
        titipPanen -
        totalSisaBon;

      const totalHariDitampilkan = new Set(
        baseLogs.filter((l) => (l.totalUpah || l.jumlah || 0) > 0).map((l) => l.tanggal)
      ).size;

      return {
        item,
        pekerjaanList: baseLogs,
        totalHariDitampilkan: totalHariDitampilkan || baseLogs.length,
        totalUpahPokokDisplayed,
        totalLemburDisplayed,
        totalGajiKotorDisplayed,
        hakUpahBelumCair,
        hakUpahSudahCair,
        sisaBonUang,
        sisaBonBarang,
        totalSisaBon,
        titipPanen,
        patokanBersihAwalBulan,
        neracaBulanBerjalan,
      };
    })
    .sort((a, b) => {
      // Prioritize employees with pending wages or work logs, then alphabetically
      const aScore = a.hakUpahBelumCair > 0 ? 2 : a.pekerjaanList.length > 0 ? 1 : 0;
      const bScore = b.hakUpahBelumCair > 0 ? 2 : b.pekerjaanList.length > 0 ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return a.item.nama.localeCompare(b.item.nama, 'id');
    });
}

export function describeRekapGajiFilter(
  rekapData: RekapPayrollBulananSummary,
  filter: RekapGajiPrintFilter
): string {
  const scopeMap: Record<RekapGajiScopeFilter, string> = {
    WITH_ACTIVITY: 'Karyawan Aktif Kerja / Punya Bon',
    ONLY_WORK_LOGS: 'Hanya yg Ada Catatan Pekerjaan',
    ONLY_PENDING_UPAH: 'Hanya yg Ada Upah Belum Cair',
    ALL_EMPLOYEES: 'Semua Karyawan Terdaftar',
  };
  const parts: string[] = [
    `Periode Kerja: ${rekapData.periodeBulan}`,
    `Patokan Bayar: ${getPatokanBulanBerikutnyaLabel(rekapData.bulan, rekapData.tahun)}`,
    scopeMap[filter.scope],
  ];
  if (filter.divisi !== 'ALL') parts.push(`Divisi: ${filter.divisi}`);
  if (filter.onlyPendingPekerjaan) parts.push('Hanya Pekerjaan Belum Cair (BON)');
  if (filter.searchTerm.trim()) parts.push(`Cari: "${filter.searchTerm.trim()}"`);
  return parts.join(' · ');
}

export function buildDetailPekerjaanText(log: ItemRincianHarianPayroll): string {
  const itemPart = (log.item || '').trim();
  const tugasPart = (log.tugas || '').trim();
  if (itemPart && tugasPart && tugasPart.toLowerCase() !== itemPart.toLowerCase()) {
    return `${itemPart} (${tugasPart})`;
  }
  return itemPart || tugasPart || `Tugas harian di ${log.divisi}`;
}

export function buildRekapCatatanText(log: ItemRincianHarianPayroll): string {
  const ketAdmin = (log.tugas || '').trim();
  const catKhusus = (log.catatan || '').trim();
  const parts = [
    ketAdmin,
    catKhusus && !ketAdmin.toLowerCase().includes(catKhusus.toLowerCase()) ? catKhusus : '',
    log.tanggalDibayar ? `Cair ${log.tanggalDibayar}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || '-';
}

export interface ExportRekapGajiPdfOptions {
  rekapData: RekapPayrollBulananSummary;
  filter: RekapGajiPrintFilter;
  orientation?: 'landscape' | 'portrait';
  includeRingkasan?: boolean;
  includeDetailPekerjaan?: boolean;
  includeDetailBon?: boolean;
  includeTandaTangan?: boolean;
  profilPerusahaan?: ProfilPerusahaan | null;
}

export async function exportRekapGajiToPdf(
  rows: ComputedRekapGajiEmployee[],
  options: ExportRekapGajiPdfOptions
): Promise<{ fileName: string; totalEmployees: number; totalWorkLogs: number }> {
  const orientation = options.orientation || 'landscape';
  const includeRingkasan = options.includeRingkasan ?? true;
  const includeDetailPekerjaan = options.includeDetailPekerjaan ?? true;
  const includeDetailBon = options.includeDetailBon ?? true;
  const includeTandaTangan = options.includeTandaTangan ?? true;
  const { rekapData, filter } = options;

  const src = options.profilPerusahaan;
  const rawAlamat = src?.alamat?.trim();
  const rawTelepon = src?.telepon?.trim();
  const rawEmail = src?.email?.trim();
  const activeProfil: ProfilPerusahaan = {
    namaPerusahaan: src?.namaPerusahaan?.trim() || 'PT WIJAYA AGRO PERKASA',
    badanHukum: src?.badanHukum?.trim() || 'PT (Perseroan Terbatas)',
    alamat:
      rawAlamat && rawAlamat !== '-'
        ? rawAlamat
        : 'Jl Kalangan Desa Simpang Luas, Kec. Sungai Are, OKUS SUMSEL',
    telepon:
      rawTelepon && rawTelepon !== '-'
        ? rawTelepon
        : 'TELPON KASIR 0821 44 999 305 · TELPON ADM 0812 2000 3305',
    email: rawEmail && rawEmail !== '-' ? rawEmail : 'wijayaagroperkasa@gmail.com',
    penanggungJawab: src?.penanggungJawab?.trim() || 'KASIR / BAGIAN KEUANGAN',
    rekeningUtama: src?.rekeningUtama?.trim() || 'KAS01',
    catatanHeaderNota: src?.catatanHeaderNota?.trim() || '',
    logoUrl: src?.logoUrl?.trim() || DEFAULT_PT_LOGO_URL,
  };

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 11;
  const contentW = pageWidth - marginX * 2;
  const tglCetak = getWIBTodayString();
  const jamCetak = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const patokanLabel = getPatokanBulanBerikutnyaLabel(rekapData.bulan, rekapData.tahun);
  const totalWorkLogs = rows.reduce((s, r) => s + r.pekerjaanList.length, 0);

  // 1. Kop Surat Perusahaan
  let textStartX = marginX;
  const logoSrc = await loadLogoDataUrl(activeProfil.logoUrl || DEFAULT_PT_LOGO_URL);
  if (logoSrc) {
    try {
      const fmt = logoSrc.includes('png') ? 'PNG' : 'JPEG';
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(marginX, 10, 14, 14, 2, 2, 'F');
      doc.addImage(logoSrc, fmt, marginX + 1, 11, 12, 12);
      textStartX = marginX + 17;
    } catch {
      textStartX = marginX;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(activeProfil.namaPerusahaan.toUpperCase(), textStartX, 14.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(71, 85, 105);
  doc.text(activeProfil.alamat, textStartX, 18.5);
  doc.text(`${activeProfil.telepon} · Email: ${activeProfil.email}`, textStartX, 22.3);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('REKAPITULASI GAJI & DETAIL PEKERJAAN KARYAWAN', pageWidth - marginX, 14.2, {
    align: 'right',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(5, 150, 105);
  doc.text(`PATOKAN PENGGAJIAN: ${patokanLabel.toUpperCase()}`, pageWidth - marginX, 18.5, {
    align: 'right',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Dicetak: ${tglCetak} (${jamCetak} WIB) · ${rows.length} Karyawan · ${totalWorkLogs} Detail Pekerjaan`,
    pageWidth - marginX,
    22.3,
    { align: 'right' }
  );

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.55);
  doc.line(marginX, 26, pageWidth - marginX, 26);

  // Active Filter Box
  const filterDesc = describeRekapGajiFilter(rekapData, filter);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, 28.5, contentW, 7, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(30, 41, 59);
  doc.text(`FILTER REKAP: ${filterDesc}`, marginX + 3, 33, { maxWidth: contentW - 6 });

  // 2. Summary Metric Cards (4 KPIs)
  const sumGajiKotor = rows.reduce((s, r) => s + r.totalGajiKotorDisplayed, 0);
  const sumBelumCair = rows.reduce((s, r) => s + r.hakUpahBelumCair, 0);
  const sumBonAktif = rows.reduce((s, r) => s + r.totalSisaBon, 0);
  const sumBersihSiapCair = rows.reduce(
    (s, r) => s + (r.patokanBersihAwalBulan > 0 ? r.patokanBersihAwalBulan : 0),
    0
  );

  const cardY = 37.5;
  const cardGap = 2.8;
  const cardW = (contentW - cardGap * 3) / 4;
  const cards = [
    {
      label: `TOTAL GAJI KOTOR (${rekapData.periodeBulan.toUpperCase()})`,
      val: formatRupiah(sumGajiKotor),
      sub: `${rows.reduce((s, r) => s + r.totalHariDitampilkan, 0)} Hari Kerja (${totalWorkLogs} Log)`,
      bg: [236, 253, 245] as [number, number, number],
      border: [5, 150, 105] as [number, number, number],
      color: [6, 95, 70] as [number, number, number],
    },
    {
      label: 'UPAH BELUM CAIR (PENDING BON)',
      val: formatRupiah(sumBelumCair),
      sub: `${rows.filter((r) => r.hakUpahBelumCair > 0).length} Karyawan punya hak pending`,
      bg: [255, 251, 235] as [number, number, number],
      border: [217, 119, 6] as [number, number, number],
      color: [146, 64, 14] as [number, number, number],
    },
    {
      label: 'TOTAL SISA BON AKTIF (UANG+BRG)',
      val: formatRupiah(sumBonAktif),
      sub: `${rows.filter((r) => r.totalSisaBon > 0).length} Karyawan punya bon berjalan`,
      bg: [255, 241, 242] as [number, number, number],
      border: [225, 29, 72] as [number, number, number],
      color: [159, 18, 57] as [number, number, number],
    },
    {
      label: `PATOKAN BERSIH CAIR (${patokanLabel.toUpperCase()})`,
      val: formatRupiah(sumBersihSiapCair),
      sub: 'Estimasi setelah potong bon aktif',
      bg: [239, 246, 255] as [number, number, number],
      border: [37, 99, 235] as [number, number, number],
      color: [30, 64, 175] as [number, number, number],
    },
  ];

  cards.forEach((c, idx) => {
    const x = marginX + idx * (cardW + cardGap);
    doc.setFillColor(...c.bg);
    doc.setDrawColor(...c.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, 13.5, 1.3, 1.3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.9);
    doc.setTextColor(...c.color);
    doc.text(c.label, x + 2.3, cardY + 3.9);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(c.val, x + 2.3, cardY + 8.9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, x + cardW - 2.3, cardY + 12, { align: 'right' });
  });

  let cursorY = cardY + 17;
  const isLandscape = orientation === 'landscape';

  // 3. Section 1: Summary Table (Patokan Penggajian Awal Bulan Berikutnya)
  if (includeRingkasan) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `I. RINGKASAN PATOKAN PENGGAJIAN KARYAWAN (${patokanLabel.toUpperCase()})`,
      marginX,
      cursorY
    );
    cursorY += 2.2;

    const headCols = [
      'NO',
      'NAMA KARYAWAN & NIK',
      'DIVISI AKTIF',
      'HARI',
      'GAJI KOTOR BULAN INI',
      'BELUM CAIR (PENDING)',
      'SISA BON AKTIF',
      'TITIP PANEN',
      'PATOKAN BERSIH / STATUS',
    ];

    const bodySummary = rows.map((r, idx) => {
      const divAktif = r.item.divisiAktifSaatIni || r.item.divisiUtama;
      const statusText =
        r.patokanBersihAwalBulan > 0
          ? `CAIR: ${formatRupiah(r.patokanBersihAwalBulan)}`
          : r.patokanBersihAwalBulan < 0
          ? `MIN BON: -${formatRupiah(Math.abs(r.patokanBersihAwalBulan))}`
          : r.hakUpahBelumCair === 0 && r.totalGajiKotorDisplayed > 0
          ? 'SUDAH CAIR (LUNAS)'
          : 'IMPAS Rp 0';

      const bonSub =
        r.totalSisaBon > 0
          ? `${formatRupiah(r.totalSisaBon)}\n(U:${formatRupiah(r.sisaBonUang).replace('Rp ', '')} / B:${formatRupiah(r.sisaBonBarang).replace('Rp ', '')})`
          : '-';

      return [
        String(idx + 1),
        `${r.item.nama}\n${r.item.nik} · ${r.item.jabatan}`,
        divAktif,
        `${r.totalHariDitampilkan} Hr\n(${r.pekerjaanList.length} Log)`,
        formatRupiah(r.totalGajiKotorDisplayed),
        r.hakUpahBelumCair > 0 ? formatRupiah(r.hakUpahBelumCair) : '-',
        bonSub,
        r.titipPanen > 0 ? formatRupiah(r.titipPanen) : '-',
        statusText,
      ];
    });

    const sumTitip = rows.reduce((s, r) => s + r.titipPanen, 0);
    const sumNetAll = sumBelumCair + sumTitip - sumBonAktif;

    const footerSummary = [
      {
        content: `TOTAL (${rows.length} KARYAWAN) :`,
        colSpan: 3,
        styles: { halign: 'right' as const, fontStyle: 'bold' as const },
      },
      {
        content: `${rows.reduce((s, r) => s + r.totalHariDitampilkan, 0)} Hr`,
        styles: { halign: 'center' as const, fontStyle: 'bold' as const },
      },
      {
        content: formatRupiah(sumGajiKotor),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [6, 95, 70] as [number, number, number] },
      },
      {
        content: formatRupiah(sumBelumCair),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [146, 64, 14] as [number, number, number] },
      },
      {
        content: formatRupiah(sumBonAktif),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [159, 18, 57] as [number, number, number] },
      },
      {
        content: formatRupiah(sumTitip),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [107, 33, 168] as [number, number, number] },
      },
      {
        content:
          sumNetAll < 0 ? `-${formatRupiah(Math.abs(sumNetAll))}` : formatRupiah(sumNetAll),
        styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [30, 64, 175] as [number, number, number] },
      },
    ];

    autoTable(doc, {
      startY: cursorY,
      head: [headCols],
      body:
        bodySummary.length > 0
          ? bodySummary
          : [
              [
                {
                  content: 'Tidak ada data karyawan sesuai filter yang dipilih.',
                  colSpan: headCols.length,
                  styles: { halign: 'center', fontStyle: 'italic' },
                },
              ],
            ],
      foot: rows.length > 0 ? [footerSummary] : undefined,
      theme: 'grid',
      styles: {
        fontSize: isLandscape ? 6.9 : 5.9,
        cellPadding: 1.6,
        overflow: 'linebreak',
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: isLandscape ? 6.6 : 5.6,
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        lineColor: [15, 23, 42],
        lineWidth: 0.3,
        fontSize: isLandscape ? 6.9 : 5.9,
      },
      columnStyles: isLandscape
        ? {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 46 },
            2: { cellWidth: 32 },
            3: { cellWidth: 16, halign: 'center', font: 'courier' },
            4: { cellWidth: 32, halign: 'right', font: 'courier', fontStyle: 'bold' },
            5: { cellWidth: 32, halign: 'right', font: 'courier', textColor: [146, 64, 14] },
            6: { cellWidth: 38, halign: 'right', font: 'courier', textColor: [159, 18, 57] },
            7: { cellWidth: 26, halign: 'right', font: 'courier', textColor: [107, 33, 168] },
            8: { cellWidth: 45, halign: 'right', font: 'courier', fontStyle: 'bold' },
          }
        : {
            0: { cellWidth: 6.5, halign: 'center' },
            1: { cellWidth: 33 },
            2: { cellWidth: 21 },
            3: { cellWidth: 12, halign: 'center', font: 'courier' },
            4: { cellWidth: 22, halign: 'right', font: 'courier', fontStyle: 'bold' },
            5: { cellWidth: 22, halign: 'right', font: 'courier', textColor: [146, 64, 14] },
            6: { cellWidth: 26, halign: 'right', font: 'courier', textColor: [159, 18, 57] },
            7: { cellWidth: 18, halign: 'right', font: 'courier', textColor: [107, 33, 168] },
            8: { cellWidth: 27.5, halign: 'right', font: 'courier', fontStyle: 'bold' },
          },
      margin: { left: marginX, right: marginX, bottom: 16 },
    });

    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 7;
  }

  // 4. Section 2: Detail Pekerjaan Harian per Karyawan
  if (includeDetailPekerjaan && rows.length > 0) {
    if (cursorY + 28 > pageHeight - 16) {
      doc.addPage();
      cursorY = 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `${includeRingkasan ? 'II. ' : ''}RINCIAN DETAIL PEKERJAAN HARIAN PER KARYAWAN (${rekapData.periodeBulan.toUpperCase()})`,
      marginX,
      cursorY
    );
    cursorY += 3.5;

    for (let i = 0; i < rows.length; i++) {
      const emp = rows[i];
      if (emp.pekerjaanList.length === 0 && emp.totalSisaBon === 0) continue;

      if (cursorY + 34 > pageHeight - 16) {
        doc.addPage();
        cursorY = 14;
      }

      // Employee Header Banner
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.roundedRect(marginX, cursorY, contentW, 10.5, 1.2, 1.2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${i + 1}. ${emp.item.nama.toUpperCase()} (${emp.item.nik}) — ${emp.item.divisiAktifSaatIni || emp.item.divisiUtama}`,
        marginX + 3,
        cursorY + 4.3
      );

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Jabatan: ${emp.item.jabatan} · Hari Masuk: ${emp.totalHariDitampilkan} Hari (${emp.pekerjaanList.length} Pekerjaan)`,
        marginX + 3,
        cursorY + 8.4
      );

      const patokanEmpText =
        emp.patokanBersihAwalBulan > 0
          ? `Patokan Bersih Cair: ${formatRupiah(emp.patokanBersihAwalBulan)}`
          : emp.patokanBersihAwalBulan < 0
          ? `Sisa Hutang Bon: ${formatRupiah(Math.abs(emp.patokanBersihAwalBulan))}`
          : 'Status: Lunas / Impas';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(
        emp.patokanBersihAwalBulan > 0 ? 5 : emp.patokanBersihAwalBulan < 0 ? 159 : 51,
        emp.patokanBersihAwalBulan > 0 ? 120 : emp.patokanBersihAwalBulan < 0 ? 18 : 65,
        emp.patokanBersihAwalBulan > 0 ? 80 : emp.patokanBersihAwalBulan < 0 ? 57 : 85
      );
      doc.text(patokanEmpText, pageWidth - marginX - 3, cursorY + 4.3, { align: 'right' });

      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text(
        `Total Upah: ${formatRupiah(emp.totalGajiKotorDisplayed)} | Pending: ${formatRupiah(
          emp.hakUpahBelumCair
        )} | Bon: ${formatRupiah(emp.totalSisaBon)}`,
        pageWidth - marginX - 3,
        cursorY + 8.4,
        { align: 'right' }
      );

      cursorY += 12;

      if (emp.pekerjaanList.length > 0) {
        const jobHead = [
          'NO',
          'HARI & TANGGAL',
          'DIVISI',
          'DETAIL PEKERJAAN (ITEM & URAIAN TUGAS)',
          'QTY',
          'TARIF',
          'LEMBUR/MKN',
          'TOTAL UPAH',
          'STATUS',
          'KETERANGAN / CATATAN',
        ];

        const jobBody = emp.pekerjaanList.map((log, lIdx) => {
          const tglLabel = log.hariTanggal || formatHariTanggalLabel(log.tanggal) || log.tanggal;
          const qty = log.kuantiti !== undefined ? log.kuantiti : log.totalUpah > 0 ? 1 : 0;
          const tarif = log.harga !== undefined ? log.harga : log.upahHarian || 0;
          const lembur = log.uangMakanLembur || 0;
          const total = log.totalUpah !== undefined ? log.totalUpah : log.jumlah || 0;
          const statusLabel = log.ket === 'BON' || log.status === 'TERCATAT' ? 'BON (BLM CAIR)' : 'LUNAS (CAIR)';
          const catatanStr = buildRekapCatatanText(log);

          return [
            String(lIdx + 1),
            `${tglLabel}\n(${log.tanggal})`,
            log.divisiKode || log.divisi,
            buildDetailPekerjaanText(log),
            String(qty),
            tarif > 0 ? formatRupiah(tarif) : '-',
            lembur > 0 ? formatRupiah(lembur) : '-',
            formatRupiah(total),
            statusLabel,
            catatanStr,
          ];
        });

        const jobFooter = [
          {
            content: `Subtotal Pekerjaan ${emp.item.nama} (${emp.pekerjaanList.length} Catatan) :`,
            colSpan: 6,
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
          {
            content: emp.totalLemburDisplayed > 0 ? formatRupiah(emp.totalLemburDisplayed) : '-',
            styles: { halign: 'right' as const, fontStyle: 'bold' as const },
          },
          {
            content: formatRupiah(emp.totalGajiKotorDisplayed),
            styles: {
              halign: 'right' as const,
              fontStyle: 'bold' as const,
              textColor: [6, 95, 70] as [number, number, number],
            },
          },
          {
            content: emp.hakUpahBelumCair > 0 ? `Pending: ${formatRupiah(emp.hakUpahBelumCair)}` : 'Lunas',
            colSpan: 2,
            styles: { halign: 'center' as const, fontStyle: 'bold' as const },
          },
        ];

        autoTable(doc, {
          startY: cursorY,
          head: [jobHead],
          body: jobBody,
          foot: [jobFooter],
          theme: 'grid',
          styles: {
            fontSize: isLandscape ? 6.6 : 5.7,
            cellPadding: 1.4,
            overflow: 'linebreak',
            lineColor: [203, 213, 225],
            lineWidth: 0.18,
          },
          headStyles: {
            fillColor: [51, 65, 85],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: isLandscape ? 6.3 : 5.4,
          },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          footStyles: {
            fillColor: [241, 245, 249],
            textColor: [15, 23, 42],
            lineColor: [100, 116, 139],
            lineWidth: 0.25,
            fontSize: isLandscape ? 6.6 : 5.7,
          },
          columnStyles: isLandscape
            ? {
                0: { cellWidth: 7.5, halign: 'center' },
                1: { cellWidth: 26, font: 'courier' },
                2: { cellWidth: 22 },
                3: { cellWidth: 75 },
                4: { cellWidth: 10, halign: 'center', font: 'courier' },
                5: { cellWidth: 24, halign: 'right', font: 'courier' },
                6: { cellWidth: 22, halign: 'right', font: 'courier' },
                7: { cellWidth: 26, halign: 'right', font: 'courier', fontStyle: 'bold' },
                8: { cellWidth: 23, halign: 'center', fontStyle: 'bold' },
                9: { cellWidth: 39.5 },
              }
            : {
                0: { cellWidth: 6, halign: 'center' },
                1: { cellWidth: 20, font: 'courier' },
                2: { cellWidth: 15 },
                3: { cellWidth: 46 },
                4: { cellWidth: 8, halign: 'center', font: 'courier' },
                5: { cellWidth: 18, halign: 'right', font: 'courier' },
                6: { cellWidth: 17, halign: 'right', font: 'courier' },
                7: { cellWidth: 20, halign: 'right', font: 'courier', fontStyle: 'bold' },
                8: { cellWidth: 17, halign: 'center', fontStyle: 'bold' },
                9: { cellWidth: 21 },
              },
          margin: { left: marginX, right: marginX, bottom: 16 },
        });

        cursorY = ((doc as any).lastAutoTable?.finalY || cursorY) + 3;
      }

      // Optional Bon Summary Line for this employee if they have active bon
      const bonBarangList = emp.item.rincianBonBarang || [];
      const bonUangList = emp.item.rincianBonUang || [];
      if (includeDetailBon && (bonBarangList.length > 0 || bonUangList.length > 0)) {
        if (cursorY + 14 > pageHeight - 16) {
          doc.addPage();
          cursorY = 14;
        }
        const bonParts: string[] = [];
        for (const bb of bonBarangList) {
          const itemsStr = (bb.items || [])
            .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
            .join(', ');
          bonParts.push(
            `Bon Brg ${bb.noPenjualan} [${bb.tanggal}]: Sisa ${formatRupiah(bb.sisaPiutang)}${
              itemsStr ? ` (${itemsStr})` : ''
            }`
          );
        }
        for (const bu of bonUangList) {
          bonParts.push(
            `Bon Uang ${bu.idTransaksi} [${bu.tanggal}]: Sisa ${formatRupiah(bu.sisaKasbon)} (${bu.keterangan})`
          );
        }
        const bonLine = `Rincian Bon Aktif: ${bonParts.join('  |  ')}`;
        const wrappedBon = doc.splitTextToSize(bonLine, contentW - 4);
        const boxH = Math.max(6, wrappedBon.length * 3.2 + 2.5);
        doc.setFillColor(255, 241, 242);
        doc.setDrawColor(253, 164, 175);
        doc.setLineWidth(0.2);
        doc.roundedRect(marginX, cursorY, contentW, boxH, 1, 1, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.setTextColor(136, 19, 55);
        doc.text(wrappedBon, marginX + 2, cursorY + 3.6);
        cursorY += boxH + 4;
      } else {
        cursorY += 3.5;
      }
    }
  }

  // 5. Signature Block
  if (includeTandaTangan) {
    if (cursorY + 26 > pageHeight - 12) {
      doc.addPage();
      cursorY = 18;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Disiapkan Oleh,', marginX + 24, cursorY, { align: 'center' });
    doc.text('Mengetahui / Pimpinan,', pageWidth - marginX - 28, cursorY, { align: 'center' });

    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.3);
    doc.line(marginX + 4, cursorY + 15, marginX + 44, cursorY + 15);
    doc.line(pageWidth - marginX - 52, cursorY + 15, pageWidth - marginX - 4, cursorY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('ADMIN / KASIR PAYROLL', marginX + 24, cursorY + 19, { align: 'center' });
    doc.text(activeProfil.penanggungJawab.toUpperCase(), pageWidth - marginX - 28, cursorY + 19, {
      align: 'center',
    });
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${activeProfil.namaPerusahaan} · Rekap Gaji & Detail Pekerjaan (${rekapData.periodeBulan}) · Patokan ${patokanLabel} · Hal ${p} / ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const periodSlug = rekapData.periodeBulan.replace(/\s+/g, '_');
  const fileName = `Rekap_Gaji_Detail_Pekerjaan_${periodSlug}.pdf`;
  doc.save(fileName);

  return { fileName, totalEmployees: rows.length, totalWorkLogs };
}
