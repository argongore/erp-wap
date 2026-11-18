import React, { useEffect, useMemo, useState } from 'react';
import {
  Printer,
  FileDown,
  X,
  Lock,
  HandCoins,
  Wheat,
  CheckCircle2,
  ArrowRightLeft,
  Search,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  CanonicalRoleMitra,
  DAFTAR_ROLE_MITRA,
  DEFAULT_PT_LOGO_URL,
  ProfilPerusahaan,
  RekapMitraItem,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import {
  computeMitraPrintRow,
  describeListMitraFilter,
  exportListMitraToPdf,
  filterAndSortMitraForPrint,
  ListMitraPrintFilter,
  ListMitraSortOption,
} from '../../utils/exportListMitraPdf.ts';

export type InitialCetakMitraPreset =
  | 'ALL_ACTIVE'
  | 'PIUTANG_ONLY'
  | 'HUTANG_ONLY'
  | 'NGUNCI_ONLY'
  | 'KLIRING_ONLY'
  | 'SEMUA';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: RekapMitraItem[];
  profilPerusahaan?: ProfilPerusahaan | null;
  initialPreset?: InitialCetakMitraPreset;
  initialRoleFilter?: 'ALL' | CanonicalRoleMitra;
  initialSearchTerm?: string;
}

function buildFilterFromPreset(
  preset: InitialCetakMitraPreset,
  roleFilter: 'ALL' | CanonicalRoleMitra = 'ALL',
  searchTerm: string = ''
): ListMitraPrintFilter {
  switch (preset) {
    case 'PIUTANG_ONLY':
      return {
        includePiutang: true,
        includeHutang: false,
        includeNgunci: false,
        includeLunas: false,
        onlySiapKliring: false,
        roleFilter,
        searchTerm,
        sortBy: 'PIUTANG_DESC',
      };
    case 'HUTANG_ONLY':
      return {
        includePiutang: false,
        includeHutang: true,
        includeNgunci: false,
        includeLunas: false,
        onlySiapKliring: false,
        roleFilter,
        searchTerm,
        sortBy: 'HUTANG_DESC',
      };
    case 'NGUNCI_ONLY':
      return {
        includePiutang: false,
        includeHutang: false,
        includeNgunci: true,
        includeLunas: false,
        onlySiapKliring: false,
        roleFilter,
        searchTerm,
        sortBy: 'NGUNCI_DESC',
      };
    case 'KLIRING_ONLY':
      return {
        includePiutang: true,
        includeHutang: true,
        includeNgunci: false,
        includeLunas: false,
        onlySiapKliring: true,
        roleFilter,
        searchTerm,
        sortBy: 'NET_DESC',
      };
    case 'SEMUA':
      return {
        includePiutang: true,
        includeHutang: true,
        includeNgunci: true,
        includeLunas: true,
        onlySiapKliring: false,
        roleFilter,
        searchTerm,
        sortBy: 'NAMA_ASC',
      };
    case 'ALL_ACTIVE':
    default:
      return {
        includePiutang: true,
        includeHutang: true,
        includeNgunci: true,
        includeLunas: false,
        onlySiapKliring: false,
        roleFilter,
        searchTerm,
        sortBy: 'NET_DESC',
      };
  }
}

export const CetakListMitraModal: React.FC<Props> = ({
  isOpen,
  onClose,
  items,
  profilPerusahaan,
  initialPreset = 'ALL_ACTIVE',
  initialRoleFilter = 'ALL',
  initialSearchTerm = '',
}) => {
  const [filter, setFilter] = useState<ListMitraPrintFilter>(() =>
    buildFilterFromPreset(initialPreset, initialRoleFilter, initialSearchTerm)
  );
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [includeKontakAlamat, setIncludeKontakAlamat] = useState(true);
  const [includeTandaTangan, setIncludeTandaTangan] = useState(true);
  const [loadedProfil, setLoadedProfil] = useState<ProfilPerusahaan | null>(
    profilPerusahaan || null
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [printWarning, setPrintWarning] = useState('');
  const [copiedWa, setCopiedWa] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFilter(buildFilterFromPreset(initialPreset, initialRoleFilter, initialSearchTerm));
    setPrintWarning('');
    setPdfFeedback('');
    setCopiedWa(false);
  }, [isOpen, initialPreset, initialRoleFilter, initialSearchTerm]);

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

  const counts = useMemo(() => {
    let piutang = 0;
    let hutang = 0;
    let ngunci = 0;
    let lunas = 0;
    let siapKliring = 0;
    for (const m of items) {
      const r = computeMitraPrintRow(m);
      if (r.hasPiutang) piutang += 1;
      if (r.hasHutang) hutang += 1;
      if (r.hasNgunci) ngunci += 1;
      if (r.isLunas) lunas += 1;
      if ((m.totalBonMitra || 0) > 0 && r.hutangPt > 0) siapKliring += 1;
    }
    return { total: items.length, piutang, hutang, ngunci, lunas, siapKliring };
  }, [items]);

  const filteredRows = useMemo(() => filterAndSortMitraForPrint(items, filter), [items, filter]);

  const summary = useMemo(() => {
    const totalPiutang = filteredRows.reduce((s, r) => s + r.piutangAktif, 0);
    const totalHutang = filteredRows.reduce((s, r) => s + r.hutangPt, 0);
    const totalNgunci = filteredRows.reduce((s, r) => s + r.nominalNgunci, 0);
    const totalNet = totalPiutang - totalHutang;
    return { totalPiutang, totalHutang, totalNgunci, totalNet };
  }, [filteredRows]);

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

  if (!isOpen) return null;

  const tglCetak = getWIBTodayString();
  const jamCetak = new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const filterDescription = describeListMitraFilter(filter);

  const applyPreset = (preset: InitialCetakMitraPreset) => {
    setFilter((prev) => buildFilterFromPreset(preset, prev.roleFilter, prev.searchTerm));
  };

  const toggleFlag = (
    key: 'includePiutang' | 'includeHutang' | 'includeNgunci' | 'includeLunas'
  ) => {
    setFilter((prev) => ({
      ...prev,
      onlySiapKliring: false,
      [key]: !prev[key],
    }));
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

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    setPrintWarning('');
    setPdfFeedback('');
    try {
      const res = await exportListMitraToPdf(filteredRows, {
        filter,
        orientation,
        includeKontakAlamat,
        includeTandaTangan,
        profilPerusahaan: activeProfil,
      });
      setPdfFeedback(`Berhasil mengunduh ${res.fileName} (${res.totalRows} mitra).`);
    } catch (err: any) {
      setPrintWarning(`Gagal membuat PDF: ${err.message || err}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleCopyWa = () => {
    const divider = '====================================';
    const lines = [
      `*DAFTAR POSISI KEUANGAN MITRA*`,
      `*${activeProfil.namaPerusahaan.toUpperCase()}*`,
      `Tgl Cetak: ${tglCetak} (${jamCetak} WIB)`,
      filterDescription,
      divider,
      `• 1. Piutang Aktif : ${formatRupiah(summary.totalPiutang)}`,
      `• 2. Hutang PT     : ${formatRupiah(summary.totalHutang)}`,
      `• Net (Piu − Hut)  : ${
        summary.totalNet < 0
          ? `-${formatRupiah(Math.abs(summary.totalNet))}`
          : formatRupiah(summary.totalNet)
      }`,
      `• 3. Nota Ngunci   : ${formatRupiah(summary.totalNgunci)}`,
      divider,
      `*RINCIAN (${filteredRows.length} Mitra):*`,
    ];

    filteredRows.forEach((r, idx) => {
      const m = r.item;
      const parts: string[] = [];
      if (r.piutangAktif > 0) parts.push(`Piutang ${formatRupiah(r.piutangAktif)}`);
      if (r.hutangPt > 0) parts.push(`Hutang PT ${formatRupiah(r.hutangPt)}`);
      if (r.nominalNgunci > 0) parts.push(`Ngunci ${formatRupiah(r.nominalNgunci)}`);
      if (parts.length === 0) parts.push('Lunas Rp 0');
      lines.push(
        `${idx + 1}. ${m.nama} (${m.kode}) [${r.statusLabel}] → ${parts.join(' | ')}`
      );
    });

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedWa(true);
      setTimeout(() => setCopiedWa(false), 3000);
    });
  };

  const isPresetActive = (preset: InitialCetakMitraPreset) => {
    if (preset === 'KLIRING_ONLY') return Boolean(filter.onlySiapKliring);
    if (filter.onlySiapKliring) return false;
    if (preset === 'ALL_ACTIVE') {
      return (
        filter.includePiutang &&
        filter.includeHutang &&
        filter.includeNgunci &&
        !filter.includeLunas
      );
    }
    if (preset === 'PIUTANG_ONLY') {
      return (
        filter.includePiutang &&
        !filter.includeHutang &&
        !filter.includeNgunci &&
        !filter.includeLunas
      );
    }
    if (preset === 'HUTANG_ONLY') {
      return (
        !filter.includePiutang &&
        filter.includeHutang &&
        !filter.includeNgunci &&
        !filter.includeLunas
      );
    }
    if (preset === 'NGUNCI_ONLY') {
      return (
        !filter.includePiutang &&
        !filter.includeHutang &&
        filter.includeNgunci &&
        !filter.includeLunas
      );
    }
    return (
      filter.includePiutang &&
      filter.includeHutang &&
      filter.includeNgunci &&
      filter.includeLunas
    );
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
          #printable-list-modal-overlay,
          #printable-list-modal-container,
          #printable-list-mitra,
          #printable-list-mitra * {
            visibility: visible !important;
          }
          #printable-list-modal-overlay {
            position: static !important;
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }
          #printable-list-modal-container {
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
          #printable-list-mitra {
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
          #printable-list-mitra tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .no-print-list {
            display: none !important;
          }
        }
      `}</style>

      <div
        id="printable-list-modal-overlay"
        className="fixed inset-0 z-50 bg-zinc-950/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto flex items-start justify-center"
      >
        <div
          id="printable-list-modal-container"
          className="bg-zinc-100 rounded-2xl w-full max-w-6xl my-auto max-h-[95vh] flex flex-col border border-zinc-300 shadow-2xl overflow-hidden"
        >
          {/* Top Action Bar */}
          <div className="no-print-list px-4 sm:px-5 py-3.5 bg-zinc-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-600 text-white shrink-0">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold tracking-tight">
                  Cetak &amp; Ekspor PDF List Mitra (Filter Hutang / Piutang / Ngunci)
                </h2>
                <p className="text-[11px] text-zinc-400">
                  Pilih filter kategori saldo di bawah ·{' '}
                  <strong className="text-emerald-300">{filteredRows.length} Mitra</strong> siap dicetak
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyWa}
                disabled={filteredRows.length === 0}
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
                    <span>Salin Ringkasan WA</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrintNow}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Langsung</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
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

          {/* Filter & Print Controls Panel */}
          <div className="no-print-list bg-white border-b border-zinc-200 px-4 sm:px-5 py-3.5 space-y-3 shrink-0">
            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mr-1">
                Preset Cepat:
              </span>
              {[
                {
                  id: 'ALL_ACTIVE' as const,
                  label: `Hutang + Piutang + Ngunci`,
                  activeClass: 'bg-zinc-900 text-white',
                },
                {
                  id: 'PIUTANG_ONLY' as const,
                  label: `Hanya Piutang (${counts.piutang})`,
                  activeClass: 'bg-amber-700 text-white',
                },
                {
                  id: 'HUTANG_ONLY' as const,
                  label: `Hanya Hutang PT (${counts.hutang})`,
                  activeClass: 'bg-purple-700 text-white',
                },
                {
                  id: 'NGUNCI_ONLY' as const,
                  label: `Hanya Nota Ngunci (${counts.ngunci})`,
                  activeClass: 'bg-rose-700 text-white',
                },
                {
                  id: 'KLIRING_ONLY' as const,
                  label: `Hutang & Piutang / Kliring (${counts.siapKliring})`,
                  activeClass: 'bg-indigo-700 text-white',
                },
                {
                  id: 'SEMUA' as const,
                  label: `Semua Termasuk Lunas (${counts.total})`,
                  activeClass: 'bg-emerald-700 text-white',
                },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    isPresetActive(p.id)
                      ? p.activeClass
                      : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Multi-Checkbox Filter (Hutang / Piutang / Ngunci / Lunas) + Role + Sort + Search */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-center">
              {/* Checkboxes */}
              <div className="xl:col-span-6 flex flex-wrap items-center gap-2 text-xs">
                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer font-semibold transition-colors ${
                    !filter.onlySiapKliring && filter.includePiutang
                      ? 'bg-amber-50 border-amber-400 text-amber-900'
                      : 'bg-white border-zinc-200 text-zinc-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!filter.onlySiapKliring && filter.includePiutang}
                    onChange={() => toggleFlag('includePiutang')}
                    className="accent-amber-700"
                  />
                  <HandCoins className="w-3.5 h-3.5 text-amber-700" />
                  <span>Piutang ({counts.piutang})</span>
                </label>

                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer font-semibold transition-colors ${
                    !filter.onlySiapKliring && filter.includeHutang
                      ? 'bg-purple-50 border-purple-400 text-purple-900'
                      : 'bg-white border-zinc-200 text-zinc-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!filter.onlySiapKliring && filter.includeHutang}
                    onChange={() => toggleFlag('includeHutang')}
                    className="accent-purple-700"
                  />
                  <Wheat className="w-3.5 h-3.5 text-purple-700" />
                  <span>Hutang PT ({counts.hutang})</span>
                </label>

                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer font-semibold transition-colors ${
                    !filter.onlySiapKliring && filter.includeNgunci
                      ? 'bg-rose-50 border-rose-400 text-rose-900'
                      : 'bg-white border-zinc-200 text-zinc-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!filter.onlySiapKliring && filter.includeNgunci}
                    onChange={() => toggleFlag('includeNgunci')}
                    className="accent-rose-700"
                  />
                  <Lock className="w-3.5 h-3.5 text-rose-700" />
                  <span>Ngunci ({counts.ngunci})</span>
                </label>

                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer font-semibold transition-colors ${
                    !filter.onlySiapKliring && filter.includeLunas
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                      : 'bg-white border-zinc-200 text-zinc-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!filter.onlySiapKliring && filter.includeLunas}
                    onChange={() => toggleFlag('includeLunas')}
                    className="accent-emerald-700"
                  />
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Lunas Rp 0 ({counts.lunas})</span>
                </label>

                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer font-semibold transition-colors ${
                    filter.onlySiapKliring
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                      : 'bg-white border-zinc-200 text-zinc-600'
                  }`}
                  title="Tampilkan hanya mitra yang memiliki Piutang sekaligus Hutang dalam satu akun"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(filter.onlySiapKliring)}
                    onChange={() =>
                      setFilter((prev) => ({
                        ...prev,
                        onlySiapKliring: !prev.onlySiapKliring,
                      }))
                    }
                    className="accent-indigo-700"
                  />
                  <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-700" />
                  <span>2 Sisi</span>
                </label>
              </div>

              {/* Search, Role, Sort & Layout */}
              <div className="xl:col-span-6 flex flex-wrap items-center gap-2 text-xs">
                <div className="relative flex-1 min-w-[140px]">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={filter.searchTerm}
                    onChange={(e) =>
                      setFilter((prev) => ({ ...prev, searchTerm: e.target.value }))
                    }
                    placeholder="Filter nama / kode / HP..."
                    className="w-full pl-7 pr-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs"
                  />
                </div>

                <select
                  value={filter.roleFilter}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      roleFilter: e.target.value as 'ALL' | CanonicalRoleMitra,
                    }))
                  }
                  className="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium bg-white"
                >
                  <option value="ALL">Semua Role</option>
                  {DAFTAR_ROLE_MITRA.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>

                <select
                  value={filter.sortBy}
                  onChange={(e) =>
                    setFilter((prev) => ({
                      ...prev,
                      sortBy: e.target.value as ListMitraSortOption,
                    }))
                  }
                  className="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium bg-white"
                >
                  <option value="NET_DESC">Urut: Selisih Terbesar</option>
                  <option value="PIUTANG_DESC">Urut: Piutang Terbesar</option>
                  <option value="HUTANG_DESC">Urut: Hutang PT Terbesar</option>
                  <option value="NGUNCI_DESC">Urut: Ngunci Terbesar</option>
                  <option value="NAMA_ASC">Urut: Nama A–Z</option>
                  <option value="KODE_ASC">Urut: Kode A–Z</option>
                </select>

                <select
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as 'landscape' | 'portrait')}
                  className="px-2.5 py-1.5 border border-zinc-300 rounded-lg text-xs font-medium bg-white"
                  title="Orientasi Kertas"
                >
                  <option value="landscape">A4 Landscape</option>
                  <option value="portrait">A4 Portrait</option>
                </select>
              </div>
            </div>

            {/* Extra toggles & warnings */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600 pt-1 border-t border-zinc-100">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeKontakAlamat}
                    onChange={(e) => setIncludeKontakAlamat(e.target.checked)}
                    className="accent-zinc-900"
                  />
                  <span>Tampilkan Kolom No. HP &amp; Alamat</span>
                </label>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTandaTangan}
                    onChange={(e) => setIncludeTandaTangan(e.target.checked)}
                    className="accent-zinc-900"
                  />
                  <span>Tampilkan Kolom Tanda Tangan</span>
                </label>
              </div>

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

          {/* Live Printable Preview Sheet */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5">
            <div
              id="printable-list-mitra"
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
                    DAFTAR &amp; REKAP POSISI MITRA
                  </div>
                  <div className="text-[11px] font-mono text-zinc-600">
                    Dicetak: {tglCetak} ({jamCetak} WIB)
                  </div>
                  <div className="text-[11px] font-bold text-zinc-800">
                    Total Tercetak: {filteredRows.length} Mitra
                  </div>
                </div>
              </div>

              {/* Active Filter Banner */}
              <div className="mt-3 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-semibold text-zinc-700">
                {filterDescription}
              </div>

              {/* 4 Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
                <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50/70">
                  <div className="text-[9px] font-bold text-amber-900 uppercase">
                    1. Piutang (Mitra Berhutang)
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-amber-950 tabular-nums mt-0.5">
                    {formatRupiah(summary.totalPiutang)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-purple-300 bg-purple-50/70">
                  <div className="text-[9px] font-bold text-purple-900 uppercase">
                    2. Hutang (PT Berhutang)
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-purple-950 tabular-nums mt-0.5">
                    {formatRupiah(summary.totalHutang)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-emerald-300 bg-emerald-50/70">
                  <div className="text-[9px] font-bold text-emerald-900 uppercase">
                    Selisih (Piutang − Hutang)
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-emerald-950 tabular-nums mt-0.5">
                    {summary.totalNet < 0
                      ? `-${formatRupiah(Math.abs(summary.totalNet))}`
                      : formatRupiah(summary.totalNet)}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-rose-300 bg-rose-50/70">
                  <div className="text-[9px] font-bold text-rose-900 uppercase">
                    3. Ngunci (Tak Kembali)
                  </div>
                  <div className="font-mono font-black text-xs sm:text-sm text-rose-900 tabular-nums mt-0.5">
                    {formatRupiah(summary.totalNgunci)}
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="mt-3 overflow-x-auto border border-zinc-300 rounded-lg">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-zinc-900 text-white uppercase text-[9.5px] tracking-wider">
                    <tr>
                      <th className="py-2 px-2 text-center w-8 border-r border-zinc-700">NO</th>
                      <th className="py-2 px-2 border-r border-zinc-700">KODE</th>
                      <th className="py-2 px-2.5 border-r border-zinc-700">NAMA MITRA &amp; ROLE</th>
                      {includeKontakAlamat && (
                        <th className="py-2 px-2.5 border-r border-zinc-700">NO. HP &amp; ALAMAT</th>
                      )}
                      <th className="py-2 px-2 text-center border-r border-zinc-700">STATUS</th>
                      <th className="py-2 px-2.5 text-right border-r border-zinc-700">1. PIUTANG</th>
                      <th className="py-2 px-2.5 text-right border-r border-zinc-700">2. HUTANG PT</th>
                      <th className="py-2 px-2.5 text-right border-r border-zinc-700">3. NGUNCI</th>
                      <th className="py-2 px-2.5 text-right">NET (PIU−HUT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={includeKontakAlamat ? 9 : 8}
                          className="py-8 text-center text-zinc-500 italic"
                        >
                          Tidak ada mitra yang cocok dengan kombinasi filter Hutang / Piutang / Ngunci yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r, idx) => {
                        const m = r.item;
                        return (
                          <tr
                            key={m.id}
                            className={idx % 2 === 1 ? 'bg-zinc-50/70' : 'bg-white'}
                          >
                            <td className="py-1.5 px-2 text-center font-mono text-zinc-500 border-r border-zinc-200">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-2 font-mono font-semibold text-zinc-800 border-r border-zinc-200 whitespace-nowrap">
                              {m.kode}
                            </td>
                            <td className="py-1.5 px-2.5 border-r border-zinc-200">
                              <div className="font-bold text-zinc-900">{m.nama}</div>
                              <div className="text-[9.5px] text-zinc-500">{r.roleLabel}</div>
                              {r.hasNgunci && m.catatanNgunci && (
                                <div className="text-[9.5px] text-rose-700">
                                  Ket Ngunci: {m.catatanNgunci}
                                </div>
                              )}
                            </td>
                            {includeKontakAlamat && (
                              <td className="py-1.5 px-2.5 border-r border-zinc-200 text-zinc-700">
                                <div className="font-mono text-[10px]">
                                  {m.telepon && m.telepon !== '-' ? m.telepon : '-'}
                                </div>
                                <div className="text-[9.5px] text-zinc-500">
                                  {m.alamat && m.alamat !== '-' ? m.alamat : '-'}
                                </div>
                              </td>
                            )}
                            <td className="py-1.5 px-2 text-center border-r border-zinc-200 whitespace-nowrap">
                              <span
                                className={`font-extrabold text-[10px] uppercase ${
                                  r.statusLabel === 'PIUTANG'
                                    ? 'text-amber-800'
                                    : r.statusLabel === 'HUTANG'
                                    ? 'text-purple-800'
                                    : r.statusLabel === 'NGUNCI'
                                    ? 'text-rose-800'
                                    : r.statusLabel === 'SEIMBANG'
                                    ? 'text-sky-800'
                                    : 'text-emerald-800'
                                }`}
                              >
                                {r.statusLabel}
                              </span>
                              {r.adaDuaSisi && (
                                <div className="text-[9px] text-indigo-700 font-semibold">
                                  2 Sisi
                                </div>
                              )}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-amber-800 tabular-nums border-r border-zinc-200 whitespace-nowrap">
                              {r.piutangAktif > 0 ? formatRupiah(r.piutangAktif) : '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-purple-800 tabular-nums border-r border-zinc-200 whitespace-nowrap">
                              {r.hutangPt > 0 ? formatRupiah(r.hutangPt) : '-'}
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono font-semibold text-rose-700 tabular-nums border-r border-zinc-200 whitespace-nowrap">
                              {r.nominalNgunci > 0 ? formatRupiah(r.nominalNgunci) : '-'}
                            </td>
                            <td
                              className={`py-1.5 px-2.5 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                                r.netRekening > 0
                                  ? 'text-emerald-800'
                                  : r.netRekening < 0
                                  ? 'text-purple-800'
                                  : 'text-zinc-500'
                              }`}
                            >
                              {r.netRekening < 0
                                ? `-${formatRupiah(Math.abs(r.netRekening))}`
                                : formatRupiah(r.netRekening)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredRows.length > 0 && (
                    <tfoot className="bg-zinc-100 border-t-2 border-zinc-900 font-bold text-[11px]">
                      <tr>
                        <td
                          colSpan={includeKontakAlamat ? 5 : 4}
                          className="py-2 px-2.5 text-right uppercase border-r border-zinc-300"
                        >
                          TOTAL ({filteredRows.length} MITRA) :
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-amber-900 tabular-nums border-r border-zinc-300 whitespace-nowrap">
                          {formatRupiah(summary.totalPiutang)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-purple-900 tabular-nums border-r border-zinc-300 whitespace-nowrap">
                          {formatRupiah(summary.totalHutang)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-rose-800 tabular-nums border-r border-zinc-300 whitespace-nowrap">
                          {formatRupiah(summary.totalNgunci)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono text-emerald-900 tabular-nums whitespace-nowrap">
                          {summary.totalNet < 0
                            ? `-${formatRupiah(Math.abs(summary.totalNet))}`
                            : formatRupiah(summary.totalNet)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Signature Block */}
              {includeTandaTangan && (
                <div className="mt-6 grid grid-cols-2 gap-8 text-center text-[11px] text-zinc-700 pt-2">
                  <div>
                    <div>Disiapkan Oleh,</div>
                    <div className="h-12" />
                    <div className="font-bold text-zinc-900 border-t border-zinc-400 inline-block px-8 pt-1">
                      ADMIN / KASIR
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
