import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CanonicalRoleMitra,
  DEFAULT_PT_LOGO_URL,
  getRoleMitraLabel,
  normalizeRoleMitra,
  ProfilPerusahaan,
  RekapMitraItem,
} from '../server/types.ts';
import { formatRupiah, getWIBTodayString } from './format.ts';
import { loadLogoDataUrl } from './exportRekeningKoranPdf.ts';

export type ListMitraSortOption =
  | 'PIUTANG_DESC'
  | 'HUTANG_DESC'
  | 'NGUNCI_DESC'
  | 'NET_DESC'
  | 'NAMA_ASC'
  | 'KODE_ASC';

export interface ListMitraPrintFilter {
  includePiutang: boolean;
  includeHutang: boolean;
  includeNgunci: boolean;
  includeLunas: boolean;
  onlySiapKliring?: boolean;
  roleFilter: 'ALL' | CanonicalRoleMitra;
  searchTerm: string;
  sortBy: ListMitraSortOption;
}

export interface ComputedMitraPrintRow {
  item: RekapMitraItem;
  canonRole: CanonicalRoleMitra;
  roleLabel: string;
  piutangAktif: number;
  hutangPt: number;
  nominalNgunci: number;
  netRekening: number;
  hasPiutang: boolean;
  hasHutang: boolean;
  hasNgunci: boolean;
  isLunas: boolean;
  adaDuaSisi: boolean;
  statusLabel: 'PIUTANG' | 'HUTANG' | 'SEIMBANG' | 'NGUNCI' | 'LUNAS';
  statusSubInfo: string;
}

export function computeMitraPrintRow(m: RekapMitraItem): ComputedMitraPrintRow {
  const canonRole = normalizeRoleMitra(m.role, {
    isAnakPerusahaan: m.isAnakPerusahaan,
    isKaryawan: m.isKaryawan || Boolean(m.idKaryawanTerkait),
  });
  const roleLabel = getRoleMitraLabel(canonRole);

  const piutangTotal = m.totalBonMitra || 0;
  const nominalNgunci = m.nominalNotaNgunci || 0;
  const piutangAktif = m.nominalPiutangAktif ?? Math.max(0, piutangTotal - nominalNgunci);
  const hutangPt = m.totalHutangTitipPanen || 0;
  const isNgunci = Boolean(m.isNotaNgunci || nominalNgunci > 0);
  const netRekening = piutangAktif - hutangPt;

  const hasPiutang = piutangAktif > 0;
  const hasHutang = hutangPt > 0;
  const hasNgunci = isNgunci;
  const isLunas = piutangAktif === 0 && hutangPt === 0 && !isNgunci;
  const adaDuaSisi = piutangTotal > 0 && hutangPt > 0;

  const pBanding =
    piutangAktif > 0 ? piutangAktif : hutangPt > 0 && piutangTotal > 0 ? piutangTotal : 0;

  let statusLabel: ComputedMitraPrintRow['statusLabel'] = 'LUNAS';
  let statusSubInfo = 'Saldo Impas';

  if (pBanding > hutangPt) {
    statusLabel = 'PIUTANG';
    statusSubInfo = adaDuaSisi ? 'Piutang > Hutang' : 'Mitra Berhutang';
  } else if (hutangPt > pBanding) {
    statusLabel = 'HUTANG';
    statusSubInfo = adaDuaSisi ? 'Hutang > Piutang' : 'PT Berhutang';
  } else if (pBanding > 0 && hutangPt > 0 && pBanding === hutangPt) {
    statusLabel = 'SEIMBANG';
    statusSubInfo = 'Piutang = Hutang';
  } else if (isNgunci) {
    statusLabel = 'NGUNCI';
    statusSubInfo = `${m.jumlahNotaNgunci || 1} Nota Macet`;
  }

  return {
    item: m,
    canonRole,
    roleLabel,
    piutangAktif,
    hutangPt,
    nominalNgunci,
    netRekening,
    hasPiutang,
    hasHutang,
    hasNgunci,
    isLunas,
    adaDuaSisi,
    statusLabel,
    statusSubInfo,
  };
}

export function filterAndSortMitraForPrint(
  items: RekapMitraItem[],
  filter: ListMitraPrintFilter
): ComputedMitraPrintRow[] {
  const q = (filter.searchTerm || '').trim().toLowerCase();

  const filtered = items
    .map(computeMitraPrintRow)
    .filter((row) => {
      const m = row.item;
      if (q) {
        const hit =
          m.nama.toLowerCase().includes(q) ||
          m.kode.toLowerCase().includes(q) ||
          (m.telepon || '').toLowerCase().includes(q) ||
          (m.alamat || '').toLowerCase().includes(q);
        if (!hit) return false;
      }

      if (filter.roleFilter !== 'ALL' && row.canonRole !== filter.roleFilter) {
        return false;
      }

      if (filter.onlySiapKliring) {
        return (m.totalBonMitra || 0) > 0 && row.hutangPt > 0;
      }

      const matchStatus =
        (filter.includePiutang && row.hasPiutang) ||
        (filter.includeHutang && row.hasHutang) ||
        (filter.includeNgunci && row.hasNgunci) ||
        (filter.includeLunas && row.isLunas);

      return matchStatus;
    });

  return filtered.sort((a, b) => {
    switch (filter.sortBy) {
      case 'PIUTANG_DESC':
        return b.piutangAktif - a.piutangAktif || a.item.nama.localeCompare(b.item.nama, 'id');
      case 'HUTANG_DESC':
        return b.hutangPt - a.hutangPt || a.item.nama.localeCompare(b.item.nama, 'id');
      case 'NGUNCI_DESC':
        return b.nominalNgunci - a.nominalNgunci || a.item.nama.localeCompare(b.item.nama, 'id');
      case 'NET_DESC':
        return (
          Math.abs(b.netRekening) - Math.abs(a.netRekening) ||
          a.item.nama.localeCompare(b.item.nama, 'id')
        );
      case 'KODE_ASC':
        return a.item.kode.localeCompare(b.item.kode, 'id');
      case 'NAMA_ASC':
      default:
        return a.item.nama.localeCompare(b.item.nama, 'id');
    }
  });
}

export function describeListMitraFilter(filter: ListMitraPrintFilter): string {
  const parts: string[] = [];
  if (filter.onlySiapKliring) {
    parts.push('Siap Kliring Silang (Punya Hutang & Piutang)');
  } else {
    const statusList: string[] = [];
    if (filter.includePiutang) statusList.push('Piutang');
    if (filter.includeHutang) statusList.push('Hutang');
    if (filter.includeNgunci) statusList.push('Ngunci');
    if (filter.includeLunas) statusList.push('Lunas (Rp 0)');
    parts.push(
      statusList.length > 0 ? `Kategori: ${statusList.join(', ')}` : 'Tidak ada kategori dipilih'
    );
  }
  if (filter.roleFilter !== 'ALL') {
    parts.push(`Role: ${getRoleMitraLabel(filter.roleFilter)}`);
  }
  if (filter.searchTerm.trim()) {
    parts.push(`Cari: "${filter.searchTerm.trim()}"`);
  }
  return parts.join(' · ');
}

export interface ExportListMitraPdfOptions {
  filter: ListMitraPrintFilter;
  orientation?: 'landscape' | 'portrait';
  includeKontakAlamat?: boolean;
  includeTandaTangan?: boolean;
  namaPenanggungJawab?: string;
  profilPerusahaan?: ProfilPerusahaan | null;
}

export async function exportListMitraToPdf(
  rows: ComputedMitraPrintRow[],
  options: ExportListMitraPdfOptions
): Promise<{ fileName: string; totalRows: number }> {
  const orientation = options.orientation || 'landscape';
  const includeKontakAlamat = options.includeKontakAlamat ?? true;
  const includeTandaTangan = options.includeTandaTangan ?? true;

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
    penanggungJawab:
      options.namaPenanggungJawab?.trim() ||
      src?.penanggungJawab?.trim() ||
      'KASIR / BAGIAN KEUANGAN',
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
  const marginX = 12;
  const contentW = pageWidth - marginX * 2;
  const tglCetak = getWIBTodayString();
  const jamCetak = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  // 1. Kop Surat Perusahaan
  let textStartX = marginX;
  const logoSrc = await loadLogoDataUrl(activeProfil.logoUrl || DEFAULT_PT_LOGO_URL);
  if (logoSrc) {
    try {
      const fmt = logoSrc.includes('png') ? 'PNG' : 'JPEG';
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(marginX, 10, 15, 15, 2, 2, 'F');
      doc.addImage(logoSrc, fmt, marginX + 1, 11, 13, 13);
      textStartX = marginX + 18;
    } catch {
      textStartX = marginX;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(activeProfil.namaPerusahaan.toUpperCase(), textStartX, 14.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(activeProfil.alamat, textStartX, 19);
  doc.text(`${activeProfil.telepon} · Email: ${activeProfil.email}`, textStartX, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('DAFTAR & REKAP POSISI MITRA', pageWidth - marginX, 14.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Dicetak: ${tglCetak} (${jamCetak} WIB)`, pageWidth - marginX, 19, { align: 'right' });
  doc.text(`Jumlah Baris: ${rows.length} Mitra`, pageWidth - marginX, 23, { align: 'right' });

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  // Active Filter Line
  const filterDesc = describeListMitraFilter(options.filter);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, 29.5, contentW, 7.5, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`FILTER AKTIF: ${filterDesc}`, marginX + 3, 34.4, {
    maxWidth: contentW - 6,
  });

  // 2. Summary Cards (4 metrics)
  const totalPiutang = rows.reduce((s, r) => s + r.piutangAktif, 0);
  const totalHutang = rows.reduce((s, r) => s + r.hutangPt, 0);
  const totalNgunci = rows.reduce((s, r) => s + r.nominalNgunci, 0);
  const totalNet = totalPiutang - totalHutang;

  const cardY = 39.5;
  const cardGap = 3;
  const cardW = (contentW - cardGap * 3) / 4;
  const cards = [
    {
      label: '1. PIUTANG (MITRA BERHUTANG)',
      val: formatRupiah(totalPiutang),
      sub: `${rows.filter((r) => r.hasPiutang).length} mitra`,
      bg: [255, 251, 235] as [number, number, number],
      border: [217, 119, 6] as [number, number, number],
      color: [146, 64, 14] as [number, number, number],
    },
    {
      label: '2. HUTANG (PT BERHUTANG)',
      val: formatRupiah(totalHutang),
      sub: `${rows.filter((r) => r.hasHutang).length} mitra`,
      bg: [250, 245, 255] as [number, number, number],
      border: [147, 51, 234] as [number, number, number],
      color: [107, 33, 168] as [number, number, number],
    },
    {
      label: 'SELISIH (PIUTANG - HUTANG)',
      val: totalNet < 0 ? `-${formatRupiah(Math.abs(totalNet))}` : formatRupiah(totalNet),
      sub: 'Tanpa Ngunci',
      bg: [236, 253, 245] as [number, number, number],
      border: [5, 150, 105] as [number, number, number],
      color: [6, 95, 70] as [number, number, number],
    },
    {
      label: '3. NGUNCI (TAK KEMBALI)',
      val: formatRupiah(totalNgunci),
      sub: `${rows.filter((r) => r.hasNgunci).length} mitra`,
      bg: [255, 241, 242] as [number, number, number],
      border: [225, 29, 72] as [number, number, number],
      color: [159, 18, 57] as [number, number, number],
    },
  ];

  cards.forEach((c, idx) => {
    const x = marginX + idx * (cardW + cardGap);
    doc.setFillColor(...c.bg);
    doc.setDrawColor(...c.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, 13.5, 1.3, 1.3, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(...c.color);
    doc.text(c.label, x + 2.5, cardY + 4);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(c.val, x + 2.5, cardY + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(c.sub, x + cardW - 2.5, cardY + 12, { align: 'right' });
  });

  // 3. Table
  const headColumns = includeKontakAlamat
    ? [
        'NO',
        'KODE',
        'NAMA MITRA & ROLE',
        'NO. HP / ALAMAT',
        'STATUS',
        '1. PIUTANG',
        '2. HUTANG PT',
        '3. NGUNCI',
        'NET (PIU−HUT)',
      ]
    : [
        'NO',
        'KODE',
        'NAMA MITRA & ROLE',
        'STATUS',
        '1. PIUTANG',
        '2. HUTANG PT',
        '3. NGUNCI',
        'NET (PIU−HUT)',
      ];

  const bodyRows = rows.map((r, idx) => {
    const m = r.item;
    const namaBlock =
      r.hasNgunci && m.catatanNgunci
        ? `${m.nama}\n${r.roleLabel}\nKet Ngunci: ${m.catatanNgunci}`
        : `${m.nama}\n${r.roleLabel}`;
    const kontakBlock = `${m.telepon && m.telepon !== '-' ? m.telepon : '-'}\n${
      m.alamat && m.alamat !== '-' ? m.alamat : '-'
    }`;
    const statusText = r.adaDuaSisi ? `${r.statusLabel}\n(2 Sisi)` : r.statusLabel;
    const netText =
      r.netRekening < 0
        ? `-${formatRupiah(Math.abs(r.netRekening))}`
        : formatRupiah(r.netRekening);

    if (includeKontakAlamat) {
      return [
        String(idx + 1),
        m.kode,
        namaBlock,
        kontakBlock,
        statusText,
        r.piutangAktif > 0 ? formatRupiah(r.piutangAktif) : '-',
        r.hutangPt > 0 ? formatRupiah(r.hutangPt) : '-',
        r.nominalNgunci > 0 ? formatRupiah(r.nominalNgunci) : '-',
        netText,
      ];
    }

    return [
      String(idx + 1),
      m.kode,
      namaBlock,
      statusText,
      r.piutangAktif > 0 ? formatRupiah(r.piutangAktif) : '-',
      r.hutangPt > 0 ? formatRupiah(r.hutangPt) : '-',
      r.nominalNgunci > 0 ? formatRupiah(r.nominalNgunci) : '-',
      netText,
    ];
  });

  const footerRow = includeKontakAlamat
    ? [
        {
          content: `TOTAL (${rows.length} MITRA) :`,
          colSpan: 5,
          styles: { halign: 'right' as const, fontStyle: 'bold' as const },
        },
        {
          content: formatRupiah(totalPiutang),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [146, 64, 14] as [number, number, number] },
        },
        {
          content: formatRupiah(totalHutang),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [107, 33, 168] as [number, number, number] },
        },
        {
          content: formatRupiah(totalNgunci),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [159, 18, 57] as [number, number, number] },
        },
        {
          content:
            totalNet < 0 ? `-${formatRupiah(Math.abs(totalNet))}` : formatRupiah(totalNet),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [6, 95, 70] as [number, number, number] },
        },
      ]
    : [
        {
          content: `TOTAL (${rows.length} MITRA) :`,
          colSpan: 4,
          styles: { halign: 'right' as const, fontStyle: 'bold' as const },
        },
        {
          content: formatRupiah(totalPiutang),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [146, 64, 14] as [number, number, number] },
        },
        {
          content: formatRupiah(totalHutang),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [107, 33, 168] as [number, number, number] },
        },
        {
          content: formatRupiah(totalNgunci),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [159, 18, 57] as [number, number, number] },
        },
        {
          content:
            totalNet < 0 ? `-${formatRupiah(Math.abs(totalNet))}` : formatRupiah(totalNet),
          styles: { halign: 'right' as const, fontStyle: 'bold' as const, textColor: [6, 95, 70] as [number, number, number] },
        },
      ];

  const isLandscape = orientation === 'landscape';
  const columnStyles: Record<number, any> = includeKontakAlamat
    ? {
        0: { cellWidth: isLandscape ? 9 : 7, halign: 'center' },
        1: { cellWidth: isLandscape ? 22 : 16, font: 'courier' },
        2: { cellWidth: isLandscape ? 54 : 34 },
        3: { cellWidth: isLandscape ? 54 : 30 },
        4: { cellWidth: isLandscape ? 22 : 17, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: isLandscape ? 28 : 20, halign: 'right', font: 'courier', textColor: [146, 64, 14] },
        6: { cellWidth: isLandscape ? 28 : 20, halign: 'right', font: 'courier', textColor: [107, 33, 168] },
        7: { cellWidth: isLandscape ? 26 : 19, halign: 'right', font: 'courier', textColor: [159, 18, 57] },
        8: { cellWidth: isLandscape ? 30 : 23, halign: 'right', font: 'courier', fontStyle: 'bold' },
      }
    : {
        0: { cellWidth: isLandscape ? 10 : 8, halign: 'center' },
        1: { cellWidth: isLandscape ? 26 : 18, font: 'courier' },
        2: { cellWidth: isLandscape ? 82 : 44 },
        3: { cellWidth: isLandscape ? 26 : 18, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: isLandscape ? 32 : 24, halign: 'right', font: 'courier', textColor: [146, 64, 14] },
        5: { cellWidth: isLandscape ? 32 : 24, halign: 'right', font: 'courier', textColor: [107, 33, 168] },
        6: { cellWidth: isLandscape ? 30 : 23, halign: 'right', font: 'courier', textColor: [159, 18, 57] },
        7: { cellWidth: isLandscape ? 35 : 27, halign: 'right', font: 'courier', fontStyle: 'bold' },
      };

  autoTable(doc, {
    startY: 56,
    head: [headColumns],
    body:
      bodyRows.length > 0
        ? bodyRows
        : [
            [
              {
                content: 'Tidak ada data mitra yang sesuai dengan filter yang dipilih.',
                colSpan: headColumns.length,
                styles: { halign: 'center', fontStyle: 'italic' },
              },
            ],
          ],
    foot: rows.length > 0 ? [footerRow] : undefined,
    theme: 'grid',
    styles: {
      fontSize: isLandscape ? 7.2 : 6.4,
      cellPadding: 1.8,
      overflow: 'linebreak',
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: isLandscape ? 7 : 6.2,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      lineColor: [15, 23, 42],
      lineWidth: 0.3,
      fontSize: isLandscape ? 7.3 : 6.4,
    },
    columnStyles,
    margin: { left: marginX, right: marginX, bottom: 16 },
  });

  // 4. Signature Block
  if (includeTandaTangan) {
    const lastY = (doc as any).lastAutoTable?.finalY || 120;
    let sigY = lastY + 8;
    if (sigY + 26 > pageHeight - 12) {
      doc.addPage();
      sigY = 18;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Disiapkan Oleh,', marginX + 20, sigY, { align: 'center' });
    doc.text('Mengetahui / Pimpinan,', pageWidth - marginX - 24, sigY, { align: 'center' });

    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.3);
    doc.line(marginX + 2, sigY + 15, marginX + 38, sigY + 15);
    doc.line(pageWidth - marginX - 46, sigY + 15, pageWidth - marginX - 2, sigY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('ADMIN / KASIR', marginX + 20, sigY + 19, { align: 'center' });
    doc.text(activeProfil.penanggungJawab.toUpperCase(), pageWidth - marginX - 24, sigY + 19, {
      align: 'center',
    });
  }

  // Page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `${activeProfil.namaPerusahaan} · Daftar Rekap Mitra · Halaman ${p} / ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  const slugTags: string[] = [];
  if (options.filter.onlySiapKliring) {
    slugTags.push('Kliring');
  } else {
    if (options.filter.includePiutang) slugTags.push('Piutang');
    if (options.filter.includeHutang) slugTags.push('Hutang');
    if (options.filter.includeNgunci) slugTags.push('Ngunci');
    if (options.filter.includeLunas) slugTags.push('Lunas');
  }
  const isoDate = new Date().toISOString().slice(0, 10);
  const fileName = `List_Mitra_${slugTags.join('_') || 'Filter'}_${isoDate}.pdf`;
  doc.save(fileName);
  return { fileName, totalRows: rows.length };
}
