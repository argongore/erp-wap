import React, { useEffect, useMemo, useState } from 'react';
import {
  Printer,
  FileDown,
  FileSpreadsheet,
  X,
  Copy,
  Check,
  AlertTriangle,
  Search,
  Calendar,
  Briefcase,
  Users,
} from 'lucide-react';
import {
  DAFTAR_DIVISI,
  DEFAULT_PT_LOGO_URL,
  ProfilPerusahaan,
  RekapPayrollBulananSummary,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatHariTanggalLabel, formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import {
  buildDetailPekerjaanText,
  buildRekapCatatanText,
  describeRekapGajiFilter,
  exportRekapGajiToPdf,
  filterAndComputeRekapGajiForPrint,
  getPatokanBulanBerikutnyaLabel,
  RekapGajiPrintFilter,
  RekapGajiScopeFilter,
} from '../../utils/exportRekapGajiPdf.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rekapData: RekapPayrollBulananSummary | null;
  initialDivisi?: string;
  initialSearch?: string;
  profilPerusahaan?: ProfilPerusahaan | null;
}

const BULAN_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

const TAHUN_OPTIONS = [2024, 2025, 2026, 2027];

export const CetakRekapGajiModal: React.FC<Props> = ({
  isOpen,
  onClose,
  rekapData,
  initialDivisi = 'ALL',
  initialSearch = '',
  profilPerusahaan,
}) => {
  const [activeRekap, setActiveRekap] = useState<RekapPayrollBulananSummary | null>(rekapData);
  const [modalBulan, setModalBulan] = useState<number>(rekapData?.bulan || new Date().getMonth() + 1);
  const [modalTahun, setModalTahun] = useState<number>(rekapData?.tahun || new Date().getFullYear());
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  const [filter, setFilter] = useState<RekapGajiPrintFilter>({
    scope: 'WITH_ACTIVITY',
    divisi: initialDivisi || 'ALL',
    karyawanId: 'ALL',
    onlyPendingPekerjaan: false,
    searchTerm: initialSearch || '',
  });

  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [includeRingkasan, setIncludeRingkasan] = useState(true);
  const [includeDetailPekerjaan, setIncludeDetailPekerjaan] = useState(true);
  const [includeDetailBon, setIncludeDetailBon] = useState(true);
  const [includeTandaTangan, setIncludeTandaTangan] = useState(true);

  const [loadedProfil, setLoadedProfil] = useState<ProfilPerusahaan | null>(profilPerusahaan || null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [printWarning, setPrintWarning] = useState('');
  const [pdfFeedback, setPdfFeedback] = useState('');
  const [copiedWa, setCopiedWa] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveRekap(rekapData);
    if (rekapData) {
      setModalBulan(rekapData.bulan);
      setModalTahun(rekapData.tahun);
    }
    setFilter({
      scope: 'WITH_ACTIVITY',
      divisi: initialDivisi || 'ALL',
      karyawanId: 'ALL',
      onlyPendingPekerjaan: false,
      searchTerm: initialSearch || '',
    });
    setPrintWarning('');
    setPdfFeedback('');
    setCopiedWa(false);
  }, [isOpen, rekapData, initialDivisi, initialSearch]);

  useEffect(() => {
    if (!isOpen) return;
    if (profilPerusahaan) {
      setLoadedProfil(profilPerusahaan);
      return;
    }
    let cancelled = false;
    api
      .getProfilPerusahaan()
      .then((res) => {
        if (!cancelled && res) setLoadedProfil(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, profilPerusahaan]);

  const handleChangePeriod = async (nextBulan: number, nextTahun: number) => {
    setModalBulan(nextBulan);
    setModalTahun(nextTahun);
    setLoadingPeriod(true);
    setPrintWarning('');
    try {
      const fresh = await api.getRekapPayrollBulanan({
        bulan: nextBulan,
        tahun: nextTahun,
      });
      setActiveRekap(fresh);
    } catch (err: any) {
      setPrintWarning(`Gagal memuat periode ${nextBulan}/${nextTahun}: ${err.message || err}`);
    } finally {
      setLoadingPeriod(false);
    }
  };

  const activeProfil: ProfilPerusahaan = useMemo(() => {
    const src = loadedProfil || profilPerusahaan;
    const rawAlamat = src?.alamat?.trim();
    const rawTelepon = src?.telepon?.trim();
    const rawEmail = src?.email?.trim();
    return {
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
  }, [loadedProfil, profilPerusahaan]);

  const computedRows = useMemo(() => {
    if (!activeRekap) return [];
    return filterAndComputeRekapGajiForPrint(activeRekap, filter);
  }, [activeRekap, filter]);

  const summaryStats = useMemo(() => {
    const totalGajiKotor = computedRows.reduce((s, r) => s + r.totalGajiKotorDisplayed, 0);
    const totalBelumCair = computedRows.reduce((s, r) => s + r.hakUpahBelumCair, 0);
    const totalBon = computedRows.reduce((s, r) => s + r.totalSisaBon, 0);
    const totalTitip = computedRows.reduce((s, r) => s + r.titipPanen, 0);
    const totalPatokanBersihSiapCair = computedRows.reduce(
      (s, r) => s + (r.patokanBersihAwalBulan > 0 ? r.patokanBersihAwalBulan : 0),
      0
    );
    const totalNetKeseluruhan = totalBelumCair + totalTitip - totalBon;
    const totalHari = computedRows.reduce((s, r) => s + r.totalHariDitampilkan, 0);
    const totalLogs = computedRows.reduce((s, r) => s + r.pekerjaanList.length, 0);
    return {
      totalGajiKotor,
      totalBelumCair,
      totalBon,
      totalTitip,
      totalPatokanBersihSiapCair,
      totalNetKeseluruhan,
      totalHari,
      totalLogs,
    };
  }, [computedRows]);

  if (!isOpen || !activeRekap) return null;

  const tglCetak = getWIBTodayString();
  const jamCetak = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const patokanLabel = getPatokanBulanBerikutnyaLabel(activeRekap.bulan, activeRekap.tahun);
  const filterDescription = describeRekapGajiFilter(activeRekap, filter);

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPrintWarning('');
    setPdfFeedback('');
    try {
      const res = await exportRekapGajiToPdf(computedRows, {
        rekapData: activeRekap,
        filter,
        orientation,
        includeRingkasan,
        includeDetailPekerjaan,
        includeDetailBon,
        includeTandaTangan,
        profilPerusahaan: activeProfil,
      });
      setPdfFeedback(
        `Berhasil mengunduh ${res.fileName} (${res.totalEmployees} karyawan · ${res.totalWorkLogs} detail pekerjaan).`
      );
    } catch (err: any) {
      setPrintWarning(`Gagal membuat PDF: ${err.message || err}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadCsvDetail = () => {
    if (computedRows.length === 0) return;

    const escapeCsv = (val: string | number) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const headers = [
      'PERIODE',
      'PATOKAN PENGGAJIAN',
      'NIK',
      'NAMA KARYAWAN',
      'JABATAN',
      'DIVISI AKTIF',
      'TANGGAL KERJA',
      'HARI / TGL LABEL',
      'DIVISI KERJA',
      'DETAIL PEKERJAAN (ITEM & TUGAS)',
      'QTY',
      'TARIF HARIAN',
      'LEMBUR / MAKAN',
      'TOTAL UPAH BARIS',
      'STATUS BARIS',
      'CATATAN KERJA',
      'TOTAL GAJI KOTOR KARYAWAN',
      'UPAH BELUM CAIR (PENDING)',
      'SISA BON UANG',
      'SISA BON BARANG',
      'TOTAL SISA BON',
      'TITIP PANEN',
      'PATOKAN BERSIH AWAL BULAN',
    ];

    const lines: string[] = [headers.join(',')];

    for (const emp of computedRows) {
      const divAktif = emp.item.divisiAktifSaatIni || emp.item.divisiUtama;
      if (emp.pekerjaanList.length === 0) {
        lines.push(
          [
            escapeCsv(activeRekap.periodeBulan),
            escapeCsv(patokanLabel),
            escapeCsv(emp.item.nik),
            escapeCsv(emp.item.nama),
            escapeCsv(emp.item.jabatan),
            escapeCsv(divAktif),
            escapeCsv('-'),
            escapeCsv('-'),
            escapeCsv(divAktif),
            escapeCsv('(Tidak ada log pekerjaan pada filter ini)'),
            0,
            0,
            0,
            0,
            escapeCsv('-'),
            escapeCsv('-'),
            emp.totalGajiKotorDisplayed,
            emp.hakUpahBelumCair,
            emp.sisaBonUang,
            emp.sisaBonBarang,
            emp.totalSisaBon,
            emp.titipPanen,
            emp.patokanBersihAwalBulan,
          ].join(',')
        );
      } else {
        for (const log of emp.pekerjaanList) {
          const tglLabel = log.hariTanggal || formatHariTanggalLabel(log.tanggal) || log.tanggal;
          const qty = log.kuantiti !== undefined ? log.kuantiti : log.totalUpah > 0 ? 1 : 0;
          const tarif = log.harga !== undefined ? log.harga : log.upahHarian || 0;
          const lembur = log.uangMakanLembur || 0;
          const total = log.totalUpah !== undefined ? log.totalUpah : log.jumlah || 0;
          const statusRow =
            log.ket === 'BON' || log.status === 'TERCATAT' ? 'BON (BELUM CAIR)' : 'LUNAS (CAIR)';

          lines.push(
            [
              escapeCsv(activeRekap.periodeBulan),
              escapeCsv(patokanLabel),
              escapeCsv(emp.item.nik),
              escapeCsv(emp.item.nama),
              escapeCsv(emp.item.jabatan),
              escapeCsv(divAktif),
              escapeCsv(log.tanggal),
              escapeCsv(tglLabel),
              escapeCsv(log.divisi),
              escapeCsv(buildDetailPekerjaanText(log)),
              qty,
              tarif,
              lembur,
              total,
              escapeCsv(statusRow),
              escapeCsv(buildRekapCatatanText(log)),
              emp.totalGajiKotorDisplayed,
              emp.hakUpahBelumCair,
              emp.sisaBonUang,
              emp.sisaBonBarang,
              emp.totalSisaBon,
              emp.titipPanen,
              emp.patokanBersihAwalBulan,
            ].join(',')
          );
        }
      }
    }

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekap_Gaji_Detail_Pekerjaan_${activeRekap.periodeBulan.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintNow = () => {
    setPrintWarning('');
    try {
      window.print();
    } catch {
      setPrintWarning(
        'Dialog cetak browser dibatasi oleh iframe. Silakan gunakan tombol "Download PDF (.pdf)" untuk mengunduh dokumen.'
      );
    }
  };

  const handleCopyWa = () => {
    const divider = '====================================';
    const lines: string[] = [
      `*REKAPAN GAJI & DETAIL PEKERJAAN*`,
      `*${activeProfil.namaPerusahaan.toUpperCase()}*`,
      `Periode Kerja : ${activeRekap.periodeBulan}`,
      `Patokan Bayar : ${patokanLabel}`,
      `Tgl Cetak     : ${tglCetak} (${jamCetak} WIB)`,
      divider,
      `• Total Gaji Kotor : ${formatRupiah(summaryStats.totalGajiKotor)} (${summaryStats.totalLogs} log)`,
      `• Upah Belum Cair  : ${formatRupiah(summaryStats.totalBelumCair)}`,
      `• Sisa Bon Aktif   : ${formatRupiah(summaryStats.totalBon)}`,
      `• Patokan Cair     : ${formatRupiah(summaryStats.totalPatokanBersihSiapCair)}`,
      divider,
    ];

    computedRows.forEach((emp, idx) => {
      const divAktif = emp.item.divisiAktifSaatIni || emp.item.divisiUtama;
      const statusStr =
        emp.patokanBersihAwalBulan > 0
          ? `SIAP CAIR ${formatRupiah(emp.patokanBersihAwalBulan)}`
          : emp.patokanBersihAwalBulan < 0
          ? `MIN BON -${formatRupiah(Math.abs(emp.patokanBersihAwalBulan))}`
          : emp.hakUpahBelumCair === 0 && emp.totalGajiKotorDisplayed > 0
          ? 'SUDAH CAIR'
          : 'IMPAS Rp 0';

      lines.push(
        `*${idx + 1}. ${emp.item.nama}* (${divAktif}) · ${emp.totalHariDitampilkan} Hr | Kotor ${formatRupiah(
          emp.totalGajiKotorDisplayed
        )} | Pending ${formatRupiah(emp.hakUpahBelumCair)} | Bon ${formatRupiah(
          emp.totalSisaBon
        )} => *${statusStr}*`
      );
      if (includeDetailPekerjaan && emp.pekerjaanList.length > 0) {
        emp.pekerjaanList.forEach((log) => {
          const tgl = log.hariTanggal || formatHariTanggalLabel(log.tanggal) || log.tanggal;
          const total = log.totalUpah !== undefined ? log.totalUpah : log.jumlah || 0;
          const st = log.ket === 'BON' || log.status === 'TERCATAT' ? 'BON' : 'LUNAS';
          lines.push(
            `   - ${tgl} (${log.divisiKode || log.divisi}): ${buildDetailPekerjaanText(
              log
            )} = ${formatRupiah(total)} [${st}]`
          );
        });
      }
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 3000);
    });
  };

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4 ${orientation};
            margin: 8mm;
          }
          body * {
            visibility: hidden !important;
          }
          html, body {
            overflow: visible !important;
            height: auto !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #printable-rekap-gaji-overlay,
          #printable-rekap-gaji-container,
          #printable-rekap-gaji,
          #printable-rekap-gaji * {
            visibility: visible !important;
          }
          #printable-rekap-gaji-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          #printable-rekap-gaji-container {
            position: static !important;
            display: block !important;
            max-height: none !important;
            max-width: none !important;
            width: 100% !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          #printable-rekap-gaji {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
          }
          #printable-rekap-gaji tr,
          #printable-rekap-gaji .employee-job-card {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print-rekap-gaji {
            display: none !important;
          }
        }
      `}</style>

      <div
        id="printable-rekap-gaji-overlay"
        className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto flex items-start justify-center"
      >
        <div
          id="printable-rekap-gaji-container"
          className="bg-zinc-100 rounded-2xl w-full max-w-6xl my-auto max-h-[95vh] flex flex-col border border-zinc-300 shadow-2xl overflow-hidden text-zinc-900"
        >
          {/* Top Action Bar */}
          <div className="no-print-rekap-gaji px-4 sm:px-5 py-3.5 bg-zinc-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0">
                <Briefcase className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  Unduh &amp; Cetak Rekapan Gaji + Detail Pekerjaan Karyawan
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Patokan penggajian <strong className="text-emerald-300">{patokanLabel}</strong> ·{' '}
                  <strong className="text-amber-300">{computedRows.length} Karyawan</strong> ·{' '}
                  <strong>{summaryStats.totalLogs} Detail Pekerjaan</strong>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyWa}
                disabled={computedRows.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 cursor-pointer disabled:opacity-50"
              >
                {copiedWa ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Tersalin (WA)</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin WA</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadCsvDetail}
                disabled={computedRows.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer disabled:opacity-50"
                title="Unduh file Excel/CSV lengkap beserta baris detail pekerjaan setiap karyawan"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV Detail Kerja</span>
              </button>

              <button
                type="button"
                onClick={handlePrintNow}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf || loadingPeriod}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>{isGeneratingPdf ? 'Membuat PDF...' : 'Download PDF (.pdf)'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                title="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter & Layout Controls */}
          <div className="no-print-rekap-gaji bg-white border-b border-zinc-200 px-4 sm:px-5 py-3.5 space-y-3 shrink-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2.5 text-xs">
              {/* Periode Bulan & Tahun */}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <select
                  value={modalBulan}
                  onChange={(e) => handleChangePeriod(Number(e.target.value), modalTahun)}
                  disabled={loadingPeriod}
                  className="w-full px-2 py-1.5 border border-zinc-300 rounded-lg text-xs font-semibold bg-white"
                >
                  {BULAN_OPTIONS.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <select
                  value={modalTahun}
                  onChange={(e) => handleChangePeriod(modalBulan, Number(e.target.value))}
                  disabled={loadingPeriod}
                  className="px-2 py-1.5 border border-zinc-300 rounded-lg text-xs font-semibold bg-white"
                >
                  {TAHUN_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              {/* Cakupan Karyawan */}
              <div>
                <select
                  value={filter.scope}
                  onChange={(e) =>
                    setFilter((prev) => ({ ...prev, scope: e.target.value as RekapGajiScopeFilter }))
                  }
                  className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium bg-white"
                  title="Cakupan karyawan yang ditampilkan"
                >
                  <option value="WITH_ACTIVITY">Aktif Kerja / Punya Bon / Saldo</option>
                  <option value="ONLY_WORK_LOGS">Hanya yg Ada Catatan Pekerjaan</option>
                  <option value="ONLY_PENDING_UPAH">Hanya yg Ada Upah Belum Cair</option>
                  <option value="ALL_EMPLOYEES">Semua Karyawan Terdaftar</option>
                </select>
              </div>

              {/* Filter Divisi */}
              <div>
                <select
                  value={filter.divisi}
                  onChange={(e) => setFilter((prev) => ({ ...prev, divisi: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium bg-white"
                >
                  <option value="ALL">Semua Divisi</option>
                  {DAFTAR_DIVISI.map((d) => (
                    <option key={d.id} value={d.nama}>
                      {d.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Karyawan Spesifik */}
              <div>
                <select
                  value={filter.karyawanId}
                  onChange={(e) => setFilter((prev) => ({ ...prev, karyawanId: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium bg-white"
                >
                  <option value="ALL">Semua Karyawan ({activeRekap.items.length})</option>
                  {activeRekap.items.map((k) => (
                    <option key={k.idKaryawan} value={k.idKaryawan}>
                      {k.nama} ({k.rincianHarian.length} log)
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={filter.searchTerm}
                  onChange={(e) => setFilter((prev) => ({ ...prev, searchTerm: e.target.value }))}
                  placeholder="Cari nama / pekerjaan..."
                  className="w-full pl-7 pr-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs"
                />
              </div>

              {/* Orientasi Kertas */}
              <div>
                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="w-full px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-semibold bg-white"
                >
                  <option value="landscape">A4 Landscape (Disarankan)</option>
                  <option value="portrait">A4 Portrait</option>
                </select>
              </div>
            </div>

            {/* Checkboxes + Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-700 pt-1 border-t border-zinc-100">
              <div className="flex flex-wrap items-center gap-3.5">
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={filter.onlyPendingPekerjaan}
                    onChange={(e) =>
                      setFilter((prev) => ({ ...prev, onlyPendingPekerjaan: e.target.checked }))
                    }
                    className="accent-amber-600"
                  />
                  <span>Hanya Pekerjaan Belum Cair (BON)</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeRingkasan}
                    onChange={(e) => setIncludeRingkasan(e.target.checked)}
                    className="accent-zinc-900"
                  />
                  <span>Ringkasan Patokan Gaji</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold text-emerald-900">
                  <input
                    type="checkbox"
                    checked={includeDetailPekerjaan}
                    onChange={(e) => setIncludeDetailPekerjaan(e.target.checked)}
                    className="accent-emerald-700"
                  />
                  <span>Detail Pekerjaan Harian</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeDetailBon}
                    onChange={(e) => setIncludeDetailBon(e.target.checked)}
                    className="accent-zinc-900"
                  />
                  <span>Rincian Bon Aktif</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTandaTangan}
                    onChange={(e) => setIncludeTandaTangan(e.target.checked)}
                    className="accent-zinc-900"
                  />
                  <span>Blok Tanda Tangan</span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                {loadingPeriod && (
                  <span className="text-sky-700 font-semibold">Memuat periode...</span>
                )}
                {pdfFeedback && (
                  <span className="font-semibold text-emerald-700">{pdfFeedback}</span>
                )}
                {printWarning && (
                  <span className="font-semibold text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{printWarning}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Printable Preview Sheet */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            <div
              id="printable-rekap-gaji"
              className={`bg-white mx-auto border border-zinc-300 shadow-sm p-4 sm:p-6 text-zinc-900 ${
                orientation === 'landscape' ? 'max-w-[1060px]' : 'max-w-[780px]'
              }`}
            >
              {/* Kop Surat */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-zinc-900">
                <div className="flex items-center gap-3">
                  <img
                    src={activeProfil.logoUrl || DEFAULT_PT_LOGO_URL}
                    alt={activeProfil.namaPerusahaan}
                    className="w-12 h-12 rounded-lg bg-black object-contain border border-zinc-300 shrink-0"
                  />
                  <div>
                    <h3 className="text-sm sm:text-base font-black tracking-tight text-zinc-900 uppercase">
                      {activeProfil.namaPerusahaan}
                    </h3>
                    <p className="text-[11px] text-zinc-600">{activeProfil.alamat}</p>
                    <p className="text-[10px] text-zinc-500">
                      {activeProfil.telepon} · {activeProfil.email}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <div className="text-xs sm:text-sm font-black uppercase tracking-wide text-zinc-900">
                    REKAPITULASI GAJI &amp; DETAIL PEKERJAAN
                  </div>
                  <div className="text-[11px] font-bold text-emerald-800">
                    PATOKAN PENGGAJIAN: {patokanLabel.toUpperCase()}
                  </div>
                  <div className="text-[10.5px] font-mono text-zinc-600">
                    Dicetak: {tglCetak} ({jamCetak} WIB) · {computedRows.length} Karyawan
                  </div>
                </div>
              </div>

              {/* Filter Banner */}
              <div className="mt-3 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-semibold text-zinc-700">
                {filterDescription}
              </div>

              {/* 4 Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
                <div className="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/70">
                  <div className="text-[9px] font-bold text-emerald-900 uppercase">
                    Total Gaji Kotor ({activeRekap.periodeBulan})
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-emerald-950 tabular-nums mt-0.5">
                    {formatRupiah(summaryStats.totalGajiKotor)}
                  </div>
                  <div className="text-[9.5px] text-emerald-800">
                    {summaryStats.totalHari} Hari Kerja ({summaryStats.totalLogs} Pekerjaan)
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50/70">
                  <div className="text-[9px] font-bold text-amber-900 uppercase">
                    Upah Belum Cair (Pending BON)
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-amber-950 tabular-nums mt-0.5">
                    {formatRupiah(summaryStats.totalBelumCair)}
                  </div>
                  <div className="text-[9.5px] text-amber-800">
                    {computedRows.filter((r) => r.hakUpahBelumCair > 0).length} Karyawan belum dicairkan
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-rose-300 bg-rose-50/70">
                  <div className="text-[9px] font-bold text-rose-900 uppercase">
                    Total Sisa Bon Aktif
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-rose-900 tabular-nums mt-0.5">
                    {formatRupiah(summaryStats.totalBon)}
                  </div>
                  <div className="text-[9.5px] text-rose-800">
                    Kasbon Uang + Produk Barang
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-sky-300 bg-sky-50/70">
                  <div className="text-[9px] font-bold text-sky-900 uppercase">
                    Patokan Cair ({patokanLabel})
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-sky-950 tabular-nums mt-0.5">
                    {formatRupiah(summaryStats.totalPatokanBersihSiapCair)}
                  </div>
                  <div className="text-[9.5px] text-sky-800">
                    Estimasi bersih siap dibayar
                  </div>
                </div>
              </div>

              {/* Section I: Ringkasan Patokan Penggajian */}
              {includeRingkasan && (
                <div className="mt-4">
                  <h4 className="text-xs font-black uppercase tracking-wide text-zinc-900 mb-1.5 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-zinc-700" />
                    <span>
                      I. Ringkasan Patokan Penggajian Karyawan ({patokanLabel})
                    </span>
                  </h4>

                  <div className="overflow-x-auto border border-zinc-300 rounded-lg">
                    <table className="w-full text-[11px] text-left border-collapse">
                      <thead className="bg-zinc-900 text-white uppercase text-[9.5px] tracking-wider">
                        <tr>
                          <th className="py-2 px-2 text-center w-8 border-r border-zinc-700">NO</th>
                          <th className="py-2 px-2.5 border-r border-zinc-700">NAMA KARYAWAN &amp; NIK</th>
                          <th className="py-2 px-2 border-r border-zinc-700">DIVISI AKTIF</th>
                          <th className="py-2 px-2 text-center border-r border-zinc-700">HARI</th>
                          <th className="py-2 px-2.5 text-right border-r border-zinc-700">GAJI KOTOR</th>
                          <th className="py-2 px-2.5 text-right border-r border-zinc-700">BELUM CAIR</th>
                          <th className="py-2 px-2.5 text-right border-r border-zinc-700">SISA BON</th>
                          <th className="py-2 px-2.5 text-right border-r border-zinc-700">TITIP PANEN</th>
                          <th className="py-2 px-2.5 text-right">PATOKAN BERSIH</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {computedRows.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-6 text-center text-zinc-500 italic">
                              Tidak ada data karyawan sesuai filter yang dipilih.
                            </td>
                          </tr>
                        ) : (
                          computedRows.map((emp, idx) => {
                            const divAktif = emp.item.divisiAktifSaatIni || emp.item.divisiUtama;
                            return (
                              <tr
                                key={emp.item.idKaryawan}
                                className={idx % 2 === 1 ? 'bg-zinc-50/70' : 'bg-white'}
                              >
                                <td className="py-1.5 px-2 text-center font-mono text-zinc-500 border-r border-zinc-200">
                                  {idx + 1}
                                </td>
                                <td className="py-1.5 px-2.5 border-r border-zinc-200">
                                  <div className="font-bold text-zinc-900">{emp.item.nama}</div>
                                  <div className="text-[9.5px] font-mono text-zinc-500">
                                    {emp.item.nik} · {emp.item.jabatan}
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 border-r border-zinc-200 text-zinc-700">
                                  {divAktif}
                                </td>
                                <td className="py-1.5 px-2 text-center font-mono border-r border-zinc-200 whitespace-nowrap">
                                  <div className="font-bold">{emp.totalHariDitampilkan} Hr</div>
                                  <div className="text-[9px] text-zinc-500">
                                    ({emp.pekerjaanList.length} Log)
                                  </div>
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-800 border-r border-zinc-200 whitespace-nowrap">
                                  {formatRupiah(emp.totalGajiKotorDisplayed)}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-amber-800 border-r border-zinc-200 whitespace-nowrap">
                                  {emp.hakUpahBelumCair > 0 ? formatRupiah(emp.hakUpahBelumCair) : '-'}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono text-rose-800 border-r border-zinc-200 whitespace-nowrap">
                                  {emp.totalSisaBon > 0 ? (
                                    <div>
                                      <div className="font-semibold">{formatRupiah(emp.totalSisaBon)}</div>
                                      <div className="text-[9px] text-zinc-500">
                                        U:{formatRupiah(emp.sisaBonUang).replace('Rp ', '')} | B:
                                        {formatRupiah(emp.sisaBonBarang).replace('Rp ', '')}
                                      </div>
                                    </div>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono text-purple-800 border-r border-zinc-200 whitespace-nowrap">
                                  {emp.titipPanen > 0 ? formatRupiah(emp.titipPanen) : '-'}
                                </td>
                                <td className="py-1.5 px-2.5 text-right font-mono font-bold whitespace-nowrap">
                                  {emp.patokanBersihAwalBulan > 0 ? (
                                    <span className="text-sky-800">
                                      CAIR: {formatRupiah(emp.patokanBersihAwalBulan)}
                                    </span>
                                  ) : emp.patokanBersihAwalBulan < 0 ? (
                                    <span className="text-rose-700">
                                      MIN BON: -{formatRupiah(Math.abs(emp.patokanBersihAwalBulan))}
                                    </span>
                                  ) : emp.hakUpahBelumCair === 0 && emp.totalGajiKotorDisplayed > 0 ? (
                                    <span className="text-emerald-700">SUDAH CAIR</span>
                                  ) : (
                                    <span className="text-zinc-500">IMPAS Rp 0</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {computedRows.length > 0 && (
                        <tfoot className="bg-zinc-100 border-t-2 border-zinc-900 font-bold text-[11px]">
                          <tr>
                            <td colSpan={3} className="py-2 px-2.5 text-right uppercase border-r border-zinc-300">
                              TOTAL ({computedRows.length} KARYAWAN) :
                            </td>
                            <td className="py-2 px-2 text-center font-mono border-r border-zinc-300 whitespace-nowrap">
                              {summaryStats.totalHari} Hr
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-emerald-900 border-r border-zinc-300 whitespace-nowrap">
                              {formatRupiah(summaryStats.totalGajiKotor)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-amber-900 border-r border-zinc-300 whitespace-nowrap">
                              {formatRupiah(summaryStats.totalBelumCair)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-rose-900 border-r border-zinc-300 whitespace-nowrap">
                              {formatRupiah(summaryStats.totalBon)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-purple-900 border-r border-zinc-300 whitespace-nowrap">
                              {formatRupiah(summaryStats.totalTitip)}
                            </td>
                            <td className="py-2 px-2.5 text-right font-mono text-sky-900 whitespace-nowrap">
                              {summaryStats.totalNetKeseluruhan < 0
                                ? `-${formatRupiah(Math.abs(summaryStats.totalNetKeseluruhan))}`
                                : formatRupiah(summaryStats.totalNetKeseluruhan)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {/* Section II: Rincian Detail Pekerjaan Per Karyawan */}
              {includeDetailPekerjaan && computedRows.length > 0 && (
                <div className="mt-5 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wide text-zinc-900 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-zinc-700" />
                    <span>
                      {includeRingkasan ? 'II. ' : ''}Rincian Detail Pekerjaan Harian per Karyawan ({activeRekap.periodeBulan})
                    </span>
                  </h4>

                  {computedRows.map((emp, idx) => {
                    if (emp.pekerjaanList.length === 0 && emp.totalSisaBon === 0) return null;
                    const divAktif = emp.item.divisiAktifSaatIni || emp.item.divisiUtama;

                    return (
                      <div
                        key={`job-${emp.item.idKaryawan}`}
                        className="employee-job-card border border-zinc-300 rounded-lg overflow-hidden"
                      >
                        {/* Employee Header Banner */}
                        <div className="px-3 py-2 bg-zinc-100 border-b border-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div>
                            <div className="text-xs font-black text-zinc-900">
                              {idx + 1}. {emp.item.nama.toUpperCase()}{' '}
                              <span className="font-mono font-semibold text-zinc-600">
                                ({emp.item.nik})
                              </span>{' '}
                              — <span className="text-zinc-700">{divAktif}</span>
                            </div>
                            <div className="text-[10px] text-zinc-600">
                              {emp.item.jabatan} · Hari Kerja: {emp.totalHariDitampilkan} Hari (
                              {emp.pekerjaanList.length} Catatan Pekerjaan)
                            </div>
                          </div>

                          <div className="text-left sm:text-right font-mono text-[10.5px]">
                            <div
                              className={`font-black ${
                                emp.patokanBersihAwalBulan > 0
                                  ? 'text-emerald-800'
                                  : emp.patokanBersihAwalBulan < 0
                                  ? 'text-rose-700'
                                  : 'text-zinc-700'
                              }`}
                            >
                              {emp.patokanBersihAwalBulan > 0
                                ? `Patokan Bersih Cair: ${formatRupiah(emp.patokanBersihAwalBulan)}`
                                : emp.patokanBersihAwalBulan < 0
                                ? `Sisa Hutang Bon: ${formatRupiah(Math.abs(emp.patokanBersihAwalBulan))}`
                                : 'Status: Lunas / Impas'}
                            </div>
                            <div className="text-[10px] text-zinc-600">
                              Kotor: {formatRupiah(emp.totalGajiKotorDisplayed)} · Pending:{' '}
                              {formatRupiah(emp.hakUpahBelumCair)} · Bon:{' '}
                              {formatRupiah(emp.totalSisaBon)}
                            </div>
                          </div>
                        </div>

                        {/* Daily Work Logs Table */}
                        {emp.pekerjaanList.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[10.5px] text-left border-collapse">
                              <thead className="bg-zinc-700 text-white uppercase text-[9px] tracking-wider">
                                <tr>
                                  <th className="py-1.5 px-2 text-center w-7 border-r border-zinc-600">
                                    NO
                                  </th>
                                  <th className="py-1.5 px-2 border-r border-zinc-600 whitespace-nowrap">
                                    HARI &amp; TANGGAL
                                  </th>
                                  <th className="py-1.5 px-2 border-r border-zinc-600">DIVISI</th>
                                  <th className="py-1.5 px-2.5 border-r border-zinc-600">
                                    DETAIL PEKERJAAN (ITEM &amp; TUGAS)
                                  </th>
                                  <th className="py-1.5 px-1.5 text-center border-r border-zinc-600">
                                    QTY
                                  </th>
                                  <th className="py-1.5 px-2 text-right border-r border-zinc-600">
                                    TARIF
                                  </th>
                                  <th className="py-1.5 px-2 text-right border-r border-zinc-600">
                                    LEMBUR
                                  </th>
                                  <th className="py-1.5 px-2 text-right border-r border-zinc-600">
                                    TOTAL UPAH
                                  </th>
                                  <th className="py-1.5 px-2 text-center border-r border-zinc-600">
                                    STATUS
                                  </th>
                                  <th className="py-1.5 px-2">KETERANGAN / CATATAN</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-200">
                                {emp.pekerjaanList.map((log, lIdx) => {
                                  const tglLabel =
                                    log.hariTanggal ||
                                    formatHariTanggalLabel(log.tanggal) ||
                                    log.tanggal;
                                  const qty =
                                    log.kuantiti !== undefined
                                      ? log.kuantiti
                                      : log.totalUpah > 0
                                      ? 1
                                      : 0;
                                  const tarif =
                                    log.harga !== undefined ? log.harga : log.upahHarian || 0;
                                  const lembur = log.uangMakanLembur || 0;
                                  const total =
                                    log.totalUpah !== undefined ? log.totalUpah : log.jumlah || 0;
                                  const isBon = log.ket === 'BON' || log.status === 'TERCATAT';

                                  return (
                                    <tr
                                      key={log.id}
                                      className={lIdx % 2 === 1 ? 'bg-zinc-50/70' : 'bg-white'}
                                    >
                                      <td className="py-1.5 px-2 text-center font-mono text-zinc-500 border-r border-zinc-200">
                                        {lIdx + 1}
                                      </td>
                                      <td className="py-1.5 px-2 font-mono border-r border-zinc-200 whitespace-nowrap">
                                        <div className="font-bold text-zinc-900">{tglLabel}</div>
                                        <div className="text-[9px] text-zinc-500">{log.tanggal}</div>
                                      </td>
                                      <td className="py-1.5 px-2 border-r border-zinc-200 whitespace-nowrap text-zinc-700 font-semibold">
                                        {log.divisiKode || log.divisi}
                                      </td>
                                      <td className="py-1.5 px-2.5 border-r border-zinc-200 font-medium text-zinc-900">
                                        {buildDetailPekerjaanText(log)}
                                      </td>
                                      <td className="py-1.5 px-1.5 text-center font-mono border-r border-zinc-200">
                                        {qty}
                                      </td>
                                      <td className="py-1.5 px-2 text-right font-mono border-r border-zinc-200 whitespace-nowrap">
                                        {tarif > 0 ? formatRupiah(tarif) : '-'}
                                      </td>
                                      <td className="py-1.5 px-2 text-right font-mono border-r border-zinc-200 whitespace-nowrap text-amber-800">
                                        {lembur > 0 ? formatRupiah(lembur) : '-'}
                                      </td>
                                      <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-800 border-r border-zinc-200 whitespace-nowrap">
                                        {formatRupiah(total)}
                                      </td>
                                      <td className="py-1.5 px-2 text-center border-r border-zinc-200 whitespace-nowrap">
                                        <span
                                          className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                            isBon
                                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                              : 'bg-sky-100 text-sky-900 border border-sky-300'
                                          }`}
                                        >
                                          {isBon ? 'BON (BLM CAIR)' : 'LUNAS (CAIR)'}
                                        </span>
                                      </td>
                                      <td className="py-1.5 px-2 text-zinc-600">
                                        {buildRekapCatatanText(log)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot className="bg-zinc-100 border-t border-zinc-400 font-bold text-[10.5px]">
                                <tr>
                                  <td
                                    colSpan={6}
                                    className="py-1.5 px-2.5 text-right uppercase border-r border-zinc-300"
                                  >
                                    Subtotal Pekerjaan {emp.item.nama} ({emp.pekerjaanList.length}{' '}
                                    Log) :
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-amber-900 border-r border-zinc-300 whitespace-nowrap">
                                    {emp.totalLemburDisplayed > 0
                                      ? formatRupiah(emp.totalLemburDisplayed)
                                      : '-'}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono text-emerald-900 border-r border-zinc-300 whitespace-nowrap">
                                    {formatRupiah(emp.totalGajiKotorDisplayed)}
                                  </td>
                                  <td colSpan={2} className="py-1.5 px-2 text-center font-mono">
                                    {emp.hakUpahBelumCair > 0
                                      ? `Belum Cair: ${formatRupiah(emp.hakUpahBelumCair)}`
                                      : 'Semua Sudah Cair'}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        ) : (
                          <div className="px-3 py-2 text-[10.5px] text-zinc-500 italic">
                            Tidak ada catatan pekerjaan pada filter ini.
                          </div>
                        )}

                        {/* Optional Active Bon Summary */}
                        {includeDetailBon &&
                          ((emp.item.rincianBonBarang?.length || 0) > 0 ||
                            (emp.item.rincianBonUang?.length || 0) > 0) && (
                            <div className="px-3 py-2 bg-rose-50 border-t border-rose-200 text-[10px] text-rose-900 space-y-0.5">
                              <div className="font-bold">Rincian Bon Aktif:</div>
                              {(emp.item.rincianBonBarang || []).map((bb) => (
                                <div key={bb.noPenjualan}>
                                  • Bon Barang {bb.noPenjualan} ({bb.tanggal}): Sisa{' '}
                                  <strong>{formatRupiah(bb.sisaPiutang)}</strong>
                                  {bb.items?.length > 0
                                    ? ` — ${bb.items
                                        .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
                                        .join(', ')}`
                                    : ''}
                                </div>
                              ))}
                              {(emp.item.rincianBonUang || []).map((bu) => (
                                <div key={bu.idTransaksi}>
                                  • Bon Uang {bu.idTransaksi} ({bu.tanggal}): Sisa{' '}
                                  <strong>{formatRupiah(bu.sisaKasbon)}</strong> ({bu.keterangan})
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Signature Block */}
              {includeTandaTangan && (
                <div className="mt-6 grid grid-cols-2 gap-8 text-center text-[11px] text-zinc-700 pt-2">
                  <div>
                    <div>Disiapkan Oleh,</div>
                    <div className="h-12" />
                    <div className="font-bold text-zinc-900 border-t border-zinc-400 inline-block px-8 pt-1">
                      ADMIN / KASIR PAYROLL
                    </div>
                  </div>
                  <div>
                    <div>Mengetahui / Pimpinan,</div>
                    <div className="h-12" />
                    <div className="font-bold text-zinc-900 border-t border-zinc-400 inline-block px-8 pt-1">
                      {activeProfil.penanggungJawab.toUpperCase()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
