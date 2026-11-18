import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { RekapCtrContract, RekapCtrPartaiRow } from '../server/types.ts';

export interface ComputedCtrRowMetrics {
  susut: number | null;
  hargaLdcExact: number;
  hargaLdcRounded: number;
  hargaSuplayerExact: number;
  hargaSuplayerRounded: number;
  danaMasukRaw: number;
  danaMasukRounded: number;
  danaDiTfRaw: number;
  selisihDanaRaw: number;
  selisihDanaRounded: number;
  pajakRaw: number;
  pajakRounded: number;
  komisiNominal: number;
  totLrRaw: number;
  totLrRounded: number;
}

export interface ComputedCtrContractSummary {
  contract: RekapCtrContract;
  rowsWithMetrics: Array<{ row: RekapCtrPartaiRow; metrics: ComputedCtrRowMetrics }>;
  totalQtyAkhir: number;
  sisaCtr: number;
  totalDanaMasuk: number;
  totalDanaDiTf: number;
  totalSelisihDana: number;
  totalPajak: number;
  totalKomisi: number;
  totalLr: number;
  cumulativeLr: number;
}

export function computeCtrRowMetrics(row: RekapCtrPartaiRow): ComputedCtrRowMetrics {
  const basisWap = Number(row.basisWap) || 0;
  const basisSuplayer = Number(row.basisSuplayer) || 0;
  const qtyAkhir = Number(row.qtyAkhir) || 0;
  const rendemen = Number(row.rendemen) || 0;
  const qtyAwal =
    row.qtyAwal !== undefined && row.qtyAwal !== null && Number.isFinite(Number(row.qtyAwal))
      ? Number(row.qtyAwal)
      : null;

  const susut =
    qtyAwal !== null && qtyAwal > 0 && qtyAkhir > 0
      ? Math.round((qtyAwal - qtyAkhir) * 10) / 10
      : null;

  const hargaLdcExact = basisWap * (rendemen / 100);
  const hargaSuplayerExact = basisSuplayer * (rendemen / 100);
  const hargaLdcRounded = Math.round(hargaLdcExact);
  const hargaSuplayerRounded = Math.round(hargaSuplayerExact);

  const danaMasukRaw = qtyAkhir * hargaLdcExact;
  const danaMasukRounded = Math.round(danaMasukRaw);
  const danaDiTfRaw = Math.round(qtyAkhir * hargaSuplayerExact * 100) / 100;

  const selisihDanaRaw = danaMasukRaw - danaDiTfRaw;
  const selisihDanaRounded = Math.round(selisihDanaRaw);

  const hasExplicitPajak =
    row.pajakNominal !== undefined && row.pajakNominal !== null && Number.isFinite(Number(row.pajakNominal));
  const pajakRaw = row.isStokHbPt
    ? hasExplicitPajak
      ? Number(row.pajakNominal)
      : 0
    : hasExplicitPajak
    ? Number(row.pajakNominal)
    : danaDiTfRaw * 0.0025;
  const pajakRounded = Math.round(pajakRaw);

  const komisiNominal = Math.round(Number(row.komisiNominal) || 0);
  const totLrRaw = selisihDanaRaw + pajakRaw + komisiNominal;
  const totLrRounded = Math.round(totLrRaw);

  return {
    susut,
    hargaLdcExact,
    hargaLdcRounded,
    hargaSuplayerExact,
    hargaSuplayerRounded,
    danaMasukRaw,
    danaMasukRounded,
    danaDiTfRaw,
    selisihDanaRaw,
    selisihDanaRounded,
    pajakRaw,
    pajakRounded,
    komisiNominal,
    totLrRaw,
    totLrRounded,
  };
}

export function computeCtrDatasetWithTotals(
  contracts: RekapCtrContract[]
): {
  openingCumulativeLr: number;
  items: ComputedCtrContractSummary[];
  grandCumulativeLr: number;
} {
  const sorted = [...contracts].sort((a, b) => a.noUrut - b.noUrut);
  const openingCumulativeLr =
    sorted.length > 0 && sorted[0].openingCumulativeLr !== undefined
      ? Number(sorted[0].openingCumulativeLr) || 0
      : 2884751;

  let runningCumulativeRaw = openingCumulativeLr;
  const items: ComputedCtrContractSummary[] = sorted.map((contract) => {
    let totalQtyAkhir = 0;
    let totalDanaMasukRaw = 0;
    let totalDanaDiTfRaw = 0;
    let totalSelisihDanaRaw = 0;
    let totalPajakRaw = 0;
    let totalKomisi = 0;
    let totalLrRaw = 0;

    const rowsWithMetrics = (contract.rows || []).map((row) => {
      const metrics = computeCtrRowMetrics(row);
      totalQtyAkhir += Number(row.qtyAkhir) || 0;
      totalDanaMasukRaw += metrics.danaMasukRaw;
      totalDanaDiTfRaw += metrics.danaDiTfRaw;
      totalSelisihDanaRaw += metrics.selisihDanaRaw;
      totalPajakRaw += metrics.pajakRaw;
      totalKomisi += metrics.komisiNominal;
      totalLrRaw += metrics.totLrRaw;
      return { row, metrics };
    });

    const roundedTotalLr = Math.round(totalLrRaw);
    runningCumulativeRaw += roundedTotalLr;

    const qtyCtr = Number(contract.qtyCtr) || 0;
    const sisaCtr = qtyCtr > 0 ? Math.round((qtyCtr - totalQtyAkhir) * 10) / 10 : 0;

    return {
      contract,
      rowsWithMetrics,
      totalQtyAkhir: Math.round(totalQtyAkhir * 10) / 10,
      sisaCtr,
      totalDanaMasuk: Math.round(totalDanaMasukRaw),
      totalDanaDiTf: Math.round(totalDanaDiTfRaw * 100) / 100,
      totalSelisihDana: Math.round(totalSelisihDanaRaw),
      totalPajak: Math.round(totalPajakRaw),
      totalKomisi,
      totalLr: roundedTotalLr,
      cumulativeLr: Math.round(runningCumulativeRaw),
    };
  });

  return {
    openingCumulativeLr,
    items,
    grandCumulativeLr: Math.round(runningCumulativeRaw),
  };
}

export function getDefaultRekapCtrContracts(): RekapCtrContract[] {
  return [
    {
      id: 'CTR-21',
      noUrut: 21,
      tglCtr: '4 Oktober',
      gudang: 'LDC',
      qtyCtr: 25000,
      openingCumulativeLr: 2884751,
      rows: [
        {
          id: 'CTR-21-1',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'ALAM',
          qtySuplayer: 8500,
          tglMasuk: '5/10/2026',
          truck: 'BG8038MY',
          qtyAwal: 8630.6,
          qtyAkhir: 8598.0,
          rendemen: 92.8,
          komisiNominal: 800000,
          cekList: false,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-21-2',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'ALAM',
          qtySuplayer: 6000,
          tglMasuk: '5/10/2026',
          truck: 'BE9306BU',
          qtyAwal: 6269.6,
          qtyAkhir: 6254.0,
          rendemen: 88.0,
          komisiNominal: 400000,
          cekList: false,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-21-3',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'ALAM',
          qtySuplayer: 2500,
          tglMasuk: '10/5/2026',
          truck: 'BE9306BU',
          qtyAwal: 2330.8,
          qtyAkhir: 2324.0,
          rendemen: 91.5,
          komisiNominal: 400000,
          cekList: false,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-21-4',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'ALAM',
          qtySuplayer: 8500,
          tglMasuk: '5/10/2026',
          truck: 'BG8785V',
          qtyAwal: 8784.8,
          qtyAkhir: 8767.0,
          rendemen: 88.8,
          komisiNominal: 800000,
          cekList: false,
          sourceType: 'MANUAL',
        },
      ],
    },
    {
      id: 'CTR-22',
      noUrut: 22,
      tglCtr: '5 Oktober',
      gudang: 'LDC',
      qtyCtr: 17000,
      rows: [
        {
          id: 'CTR-22-1',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'JUMADI',
          qtySuplayer: 8500,
          tglMasuk: '',
          truck: 'BG8541VE',
          qtyAwal: 2529.0,
          qtyAkhir: 2523.0,
          rendemen: 84.0,
          komisiNominal: 400000,
          cekList: false,
          highlightTglYellow: true,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-22-2',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'JUMADI',
          qtySuplayer: null,
          tglMasuk: '',
          truck: 'BG8541VE',
          qtyAwal: 6053.9,
          qtyAkhir: 6034.0,
          rendemen: 86.0,
          komisiNominal: 400000,
          cekList: false,
          highlightTglYellow: true,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-22-3',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'GWA',
          qtySuplayer: 8500,
          tglMasuk: '',
          truck: 'BG8038MY',
          qtyAwal: 4686.0,
          qtyAkhir: 4657.0,
          rendemen: 85.0,
          komisiNominal: 0,
          cekList: false,
          highlightTglYellow: true,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-22-4',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'RONI',
          qtySuplayer: null,
          tglMasuk: '',
          truck: 'BG8038MY',
          qtyAwal: 4032.0,
          qtyAkhir: 4009.0,
          rendemen: 89.9,
          komisiNominal: 400000,
          cekList: false,
          highlightTglYellow: true,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
      ],
    },
    {
      id: 'CTR-23',
      noUrut: 23,
      tglCtr: '5 Oktober',
      gudang: 'OLAM',
      qtyCtr: 17000,
      rows: [
        {
          id: 'CTR-23-1',
          basisWap: 66500,
          basisSuplayer: 66500,
          namaSuplayer: 'HENDRA',
          qtySuplayer: 8500,
          tglMasuk: '5/10/2026',
          truck: 'BG8015LV',
          qtyAwal: null,
          qtyAkhir: 8606.6,
          rendemen: 87.17,
          komisiNominal: 800000,
          cekList: false,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-23-2',
          basisWap: 66500,
          basisSuplayer: 66500,
          namaSuplayer: 'HENDRA',
          qtySuplayer: 4500,
          tglMasuk: '5/10/2026',
          truck: 'BE8169AE',
          qtyAwal: null,
          qtyAkhir: 4218.3,
          rendemen: 83.8,
          komisiNominal: 400000,
          cekList: false,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-23-3',
          basisWap: 66500,
          basisSuplayer: 66500,
          namaSuplayer: 'HENDRA',
          qtySuplayer: 4000,
          tglMasuk: '5/10/2026',
          truck: 'BE8169AE',
          qtyAwal: null,
          qtyAkhir: 4407.7,
          rendemen: 84.76,
          komisiNominal: 400000,
          cekList: false,
          highlightQtyAwalYellow: true,
          sourceType: 'MANUAL',
        },
      ],
    },
    {
      id: 'CTR-24',
      noUrut: 24,
      tglCtr: '12 Oktober',
      gudang: 'TORABIKA',
      qtyCtr: 8500,
      rows: [
        {
          id: 'CTR-24-1',
          basisWap: 65500,
          basisSuplayer: 65500,
          namaSuplayer: 'ALAM',
          qtySuplayer: 8500,
          tglMasuk: '12/10/2026',
          truck: 'BE9306BU',
          qtyAwal: 8585.9,
          qtyAkhir: 8559.0,
          rendemen: 95.58,
          komisiNominal: 800000,
          cekList: false,
          sourceType: 'MANUAL',
        },
      ],
    },
    {
      id: 'CTR-25',
      noUrut: 25,
      tglCtr: '13 Oktober',
      gudang: 'LDC',
      qtyCtr: 8500,
      rows: [
        {
          id: 'CTR-25-1',
          basisWap: 65500,
          basisSuplayer: 65500,
          namaSuplayer: 'GWA',
          qtySuplayer: 5000,
          tglMasuk: '10/13/2026',
          truck: 'BG8038MY',
          qtyAwal: 4920.8,
          qtyAkhir: 4901.8,
          rendemen: 83.9,
          komisiNominal: 0,
          cekList: false,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-25-2',
          basisWap: 65500,
          basisSuplayer: 65500,
          namaSuplayer: 'JUMARI',
          qtySuplayer: 3500,
          tglMasuk: '10/13/2026',
          truck: 'BG8038MY',
          qtyAwal: 3623.5,
          qtyAkhir: 3613.2,
          rendemen: 81.8,
          komisiNominal: 400000,
          cekList: false,
          sourceType: 'MANUAL',
        },
      ],
    },
    {
      id: 'CTR-26',
      noUrut: 26,
      tglCtr: '17 Oktober',
      gudang: 'OLAM',
      qtyCtr: 8500,
      rows: [
        {
          id: 'CTR-26-1',
          basisWap: 66000,
          basisSuplayer: 66000,
          namaSuplayer: 'GWA',
          qtySuplayer: 3000,
          tglMasuk: '10/19/2026',
          truck: 'BE8206AMN',
          qtyAwal: 3094.0,
          qtyAkhir: 3081.0,
          rendemen: 84.62,
          komisiNominal: 0,
          cekList: false,
          sourceType: 'MANUAL',
        },
        {
          id: 'CTR-26-2',
          basisWap: 66000,
          basisSuplayer: 65750,
          namaSuplayer: 'RONI',
          qtySuplayer: 5500,
          tglMasuk: '10/19/2026',
          truck: 'BE8206AMN',
          qtyAwal: 5512.0,
          qtyAkhir: 5495.6,
          rendemen: 87.46,
          komisiNominal: 400000,
          cekList: false,
          sourceType: 'MANUAL',
        },
      ],
    },
    {
      id: 'CTR-27',
      noUrut: 27,
      tglCtr: '4 November',
      gudang: 'SKA',
      qtyCtr: 0,
      rows: [
        {
          id: 'CTR-27-RONI',
          basisWap: 62000,
          basisSuplayer: 61500,
          namaSuplayer: 'RONI ANGGARA',
          idMitra: 'MTR-2790',
          qtySuplayer: 1416,
          tglMasuk: '04/11/2026',
          truck: 'BE8206AMN',
          qtyAwal: 1423,
          qtyAkhir: 1416,
          rendemen: 90.05,
          pajakNominal: 196048,
          komisiNominal: 400000,
          cekList: false,
          statusPencairan: 'LUNAS',
          sourceType: 'SURAT_JALAN',
          sourceRefId: 'WAP20261106-351',
          isStokHbPt: false,
          keterangan: '',
        },
      ],
    },
  ];
}

function fmtNum(val: number | null | undefined, digits = 1): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '';
  return val.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtRp(val: number | null | undefined, dec = 0): string {
  const num = Number(val) || 0;
  return `Rp${num.toLocaleString('id-ID', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

export function exportRekapCtrExcel(contracts: RekapCtrContract[]): void {
  const { openingCumulativeLr, items } = computeCtrDatasetWithTotals(contracts);
  const aoa: any[][] = [
    ['REKAP CTR WAP - SURAT JALAN'],
    [],
    [
      'NO',
      'TGL CTR S-D',
      'GUDANG',
      'QTY',
      'BASIS WAP',
      'BASIS SUPLAYER',
      'NAMA SUPLAYER',
      'QTY SUPLAYER',
      'TGL MASUK',
      'TRUCK',
      'QTY AWAL',
      'QTY AKHIR',
      'SUSUT',
      'RENDEMEN (%)',
      'SISA CTR',
      'HARGA LDC',
      'HARGA SUPLAYER',
      'DANA MASUK',
      'DANA DI TF',
      'SELISIH DANA',
      'PAJAK',
      'KOMISI',
      'TOT L/R',
      'AKUMULASI L/R / CEK LIST',
      'KETERANGAN',
    ],
    [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      openingCumulativeLr,
      '',
      '',
    ],
  ];

  for (const item of items) {
    const { contract, rowsWithMetrics } = item;
    rowsWithMetrics.forEach(({ row, metrics }, idx) => {
      const ket =
        row.statusPencairan === 'PENDING'
          ? 'BELUM CAIR'
          : row.keterangan && row.keterangan !== 'BELUM CAIR'
          ? row.keterangan
          : '';
      aoa.push([
        idx === 0 ? contract.noUrut : '',
        idx === 0 ? contract.tglCtr : '',
        idx === 0 ? contract.gudang : '',
        idx === 0 ? contract.qtyCtr : '',
        row.basisWap,
        row.basisSuplayer,
        row.namaSuplayer,
        row.qtySuplayer ?? '',
        row.tglMasuk || '',
        row.truck || '',
        row.qtyAwal ?? '',
        row.qtyAkhir,
        metrics.susut ?? '',
        row.rendemen,
        idx === 0 && contract.qtyCtr > 0 ? item.sisaCtr : '',
        metrics.hargaLdcRounded,
        metrics.hargaSuplayerRounded,
        metrics.danaMasukRounded,
        metrics.danaDiTfRaw,
        metrics.selisihDanaRounded,
        metrics.pajakRounded,
        metrics.komisiNominal,
        metrics.totLrRounded,
        row.cekList ? 'SUDAH CEK' : 'BELUM',
        ket,
      ]);
    });

    aoa.push([
      `TOTAL #${contract.noUrut}`,
      contract.tglCtr,
      contract.gudang,
      contract.qtyCtr || '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      item.totalQtyAkhir,
      '',
      '',
      contract.qtyCtr > 0 ? item.sisaCtr : '',
      '',
      '',
      item.totalDanaMasuk,
      item.totalDanaDiTf,
      item.totalSelisihDana,
      item.totalPajak,
      item.totalKomisi,
      item.totalLr,
      item.cumulativeLr,
      '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'REKAP CTR WAP');
  XLSX.writeFile(wb, 'REKAP_CTR_WAP_SURAT_JALAN.xlsx');
}

export function exportRekapCtrPdf(contracts: RekapCtrContract[]): void {
  const { openingCumulativeLr, items } = computeCtrDatasetWithTotals(contracts);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('REKAP CTR WAP — REKAP DATA CTR SURAT JALAN', 148.5, 11, { align: 'center' });

  const body: any[] = [
    [
      { content: '', colSpan: 15, styles: { fillColor: [29, 112, 216] } },
      { content: 'Rp0', styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], halign: 'right' } },
      { content: 'Rp0', styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], halign: 'right' } },
      { content: 'Rp0', styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], halign: 'right' } },
      { content: 'Rp0,00', styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], halign: 'right' } },
      { content: 'Rp0', styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], halign: 'right' } },
      { content: 'Rp0', styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], halign: 'right' } },
      { content: '', styles: { fillColor: [29, 112, 216] } },
      {
        content: fmtRp(openingCumulativeLr),
        styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      },
      { content: '', styles: { fillColor: [29, 112, 216] } },
      { content: '', styles: { fillColor: [29, 112, 216] } },
    ],
  ];

  for (const item of items) {
    const { contract, rowsWithMetrics } = item;
    rowsWithMetrics.forEach(({ row, metrics }, idx) => {
      const ket =
        row.statusPencairan === 'PENDING'
          ? 'BELUM CAIR'
          : row.keterangan && row.keterangan !== 'BELUM CAIR'
          ? row.keterangan
          : '';
      body.push([
        idx === 0 ? String(contract.noUrut) : '',
        idx === 0 ? contract.tglCtr : '',
        idx === 0 ? contract.gudang : '',
        idx === 0 && contract.qtyCtr > 0 ? fmtNum(contract.qtyCtr, 1) : '',
        fmtRp(row.basisWap),
        fmtRp(row.basisSuplayer),
        row.namaSuplayer,
        row.qtySuplayer ? fmtNum(row.qtySuplayer, 1) : '',
        row.tglMasuk || '',
        row.truck || '',
        row.qtyAwal !== null && row.qtyAwal !== undefined ? fmtNum(row.qtyAwal, 1) : '',
        fmtNum(row.qtyAkhir, 1),
        metrics.susut !== null ? fmtNum(metrics.susut, 1) : '',
        `${(Number(row.rendemen) || 0).toFixed(2).replace('.', ',')}%`,
        idx === 0 && contract.qtyCtr > 0 ? fmtNum(item.sisaCtr, 1) : '',
        fmtRp(metrics.hargaLdcRounded),
        fmtRp(metrics.hargaSuplayerRounded),
        fmtRp(metrics.danaMasukRounded),
        fmtRp(metrics.danaDiTfRaw, 2),
        fmtRp(metrics.selisihDanaRounded),
        fmtRp(metrics.pajakRounded),
        fmtRp(metrics.komisiNominal),
        fmtRp(metrics.totLrRounded),
        row.cekList ? 'V' : '',
        ket,
      ]);
    });

    body.push([
      {
        content: '',
        colSpan: 22,
        styles: { fillColor: [29, 112, 216] },
      },
      {
        content: fmtRp(item.totalLr),
        styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      },
      {
        content: fmtRp(item.cumulativeLr),
        styles: { fillColor: [29, 112, 216], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'right' },
      },
      {
        content: '',
        styles: { fillColor: [29, 112, 216] },
      },
    ]);
  }

  autoTable(doc, {
    startY: 15,
    margin: { left: 6, right: 6 },
    head: [
      [
        'NO',
        'TGL CTR',
        'GDG',
        'QTY',
        'BS WAP',
        'BS SUP',
        'SUPLAYER',
        'QTY SUP',
        'TGL MSK',
        'TRUCK',
        'AWAL',
        'AKHIR',
        'SUSUT',
        'REND',
        'SISA',
        'HRG LDC',
        'HRG SUP',
        'DANA MSK',
        'DANA TF',
        'SELISIH',
        'PAJAK',
        'KOMISI',
        'TOT L/R',
        'AKUM / CEK',
        'KET',
      ],
    ],
    body,
    theme: 'grid',
    styles: {
      fontSize: 5.1,
      cellPadding: 0.85,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [226, 232, 240],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 5.0,
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 6 },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      7: { halign: 'right' },
      10: { halign: 'right' },
      11: { halign: 'right' },
      12: { halign: 'right' },
      13: { halign: 'right' },
      14: { halign: 'right' },
      15: { halign: 'right' },
      16: { halign: 'right' },
      17: { halign: 'right' },
      18: { halign: 'right' },
      19: { halign: 'right' },
      20: { halign: 'right' },
      21: { halign: 'right' },
      22: { halign: 'right' },
      23: { halign: 'right' },
      24: { halign: 'center' },
    },
  });

  doc.save('REKAP_CTR_WAP_SURAT_JALAN.pdf');
}
