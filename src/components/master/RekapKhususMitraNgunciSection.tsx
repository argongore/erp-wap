import React, { useMemo, useState } from 'react';
import {
  Lock,
  Unlock,
  Search,
  FileText,
  Plus,
  Camera,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  getRoleMitraLabel,
  NotaNgunciDetailItem,
  RekapMasterMitraSummary,
  RekapMitraItem,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { KaryawanAvatar } from '../karyawan/ModalProfilKaryawan.tsx';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

interface RekapMitraViewProps {
  rekapData: RekapMasterMitraSummary | null;
  items: RekapMitraItem[];
  onOpenStatement: (idMitra: string) => void;
  onRequestToggleNgunci: (params: {
    idMitra: string;
    namaMitra: string;
    idNota?: string;
    noNota?: string;
    nominal: number;
    targetNgunci: boolean;
    currentCatatan?: string;
  }) => void;
  onOpenInputNotaLalu: (opts?: { mitraId?: string; defaultNgunci?: boolean }) => void;
  onPreviewFotoMitra?: (payload: { nama: string; roleLabel?: string; fotoUrl: string }) => void;
}

export const RekapMitraPosisiUangSection: React.FC<RekapMitraViewProps> = ({
  rekapData,
  items,
  onOpenStatement,
  onRequestToggleNgunci,
  onOpenInputNotaLalu,
  onPreviewFotoMitra,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'SEMUA' | 'ADA_NOMINAL' | 'NOTA_AKTIF' | 'NOTA_NGUNCI' | 'NOTA_SUPPLIER'
  >('SEMUA');

  const totalSeluruhPiutang =
    rekapData?.totalSeluruhPiutangMitra ?? rekapData?.totalBonMitra ?? 0;
  const totalNotaNgunci = rekapData?.totalNominalNotaNgunci ?? 0;
  const totalPiutangAktif =
    rekapData?.totalPiutangAktifMitra ?? Math.max(0, totalSeluruhPiutang - totalNotaNgunci);
  const totalNotaSupplierHutangKita =
    rekapData?.totalNotaSupplierRekeningMitra ??
    rekapData?.totalHutangPerusahaanKeMitra ??
    0;
  const uangKitaDiMitra =
    rekapData?.uangKitaDiMitra ?? totalSeluruhPiutang - totalNotaSupplierHutangKita;
  const uangKitaEfektif =
    rekapData?.uangKitaDiMitraEfektif ?? totalPiutangAktif - totalNotaSupplierHutangKita;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((m) => {
      const piutang = m.totalBonMitra || 0;
      const hutangSupplier = m.totalHutangTitipPanen || 0;
      const isNgunci = Boolean(m.isNotaNgunci || (m.nominalNotaNgunci || 0) > 0);

      if (statusFilter === 'ADA_NOMINAL' && piutang === 0 && hutangSupplier === 0) return false;
      if (statusFilter === 'NOTA_NGUNCI' && !isNgunci) return false;
      if (statusFilter === 'NOTA_AKTIF' && !(piutang > 0 && !isNgunci)) return false;
      if (statusFilter === 'NOTA_SUPPLIER' && hutangSupplier === 0) return false;

      if (!q) return true;
      const roleLabel = getRoleMitraLabel(m.role, {
        isAnakPerusahaan: m.isAnakPerusahaan,
        isKaryawan: m.isKaryawan || Boolean(m.idKaryawanTerkait),
      }).toLowerCase();
      return (
        m.nama.toLowerCase().includes(q) ||
        m.kode.toLowerCase().includes(q) ||
        (m.alamat || '').toLowerCase().includes(q) ||
        (m.telepon || '').toLowerCase().includes(q) ||
        roleLabel.includes(q)
      );
    });
  }, [items, search, statusFilter]);

  const filteredSumPiutang = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.totalBonMitra || 0), 0),
    [filteredRows]
  );
  const filteredSumNotaSupplier = useMemo(
    () => filteredRows.reduce((s, r) => s + (r.totalHutangTitipPanen || 0), 0),
    [filteredRows]
  );

  return (
    <div className="space-y-5">
      {/* Header & Filter Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
          <div>
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">
              Rekap Mitra Bisnis &amp; Perhitungan Uang Kita di Mitra
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Daftar lengkap status nota, nama, alamat, nomor HP, nominal piutang mitra, serta total nota supplier / rekening mitra
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenInputNotaLalu({ defaultNgunci: false })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Input Nota Lalu Mitra</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {[
              { id: 'SEMUA', label: `Semua Mitra (${items.length})` },
              {
                id: 'ADA_NOMINAL',
                label: `Ada Saldo Nota (${
                  items.filter((i) => (i.totalBonMitra || 0) > 0 || (i.totalHutangTitipPanen || 0) > 0).length
                })`,
              },
              {
                id: 'NOTA_AKTIF',
                label: `Nota Aktif (${
                  items.filter((i) => (i.totalBonMitra || 0) > 0 && !i.isNotaNgunci).length
                })`,
              },
              {
                id: 'NOTA_NGUNCI',
                label: `Nota Ngunci (${rekapData?.mitraNotaNgunciCount || 0})`,
              },
              {
                id: 'NOTA_SUPPLIER',
                label: `Nota Supplier / Rekening Mitra (${rekapData?.mitraDenganHutangTitipCount || 0})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? tab.id === 'NOTA_NGUNCI'
                      ? 'bg-rose-700 text-white'
                      : 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari nama, alamat, nomor HP, kode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg focus:ring-1 focus:ring-zinc-900 text-zinc-800"
            />
          </div>
        </div>
      </div>

      {/* Main Rekap Mitra Table */}
      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-3 w-10 text-center">NO</th>
                <th className="py-3 px-3">STATUS NOTA</th>
                <th className="py-3 px-4">NAMA MITRA</th>
                <th className="py-3 px-4">ALAMAT</th>
                <th className="py-3 px-3">NOMOR HP</th>
                <th className="py-3 px-4 text-right">
                  NOMINAL PIUTANG MITRA
                  <div className="text-[9px] font-normal text-amber-700 normal-case">
                    (Uang Kita di Nota Mitra)
                  </div>
                </th>
                <th className="py-3 px-4 text-right">
                  NOTA SUPPLIER / REKENING MITRA
                  <div className="text-[9px] font-normal text-purple-700 normal-case">
                    (Hutang Kita ke Mitra)
                  </div>
                </th>
                <th className="py-3 px-3 text-center">AKSI NOTA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-zinc-500">
                    Tidak ada data mitra yang sesuai dengan filter atau pencarian.
                  </td>
                </tr>
              ) : (
                filteredRows.map((m, idx) => {
                  const piutangTotal = m.totalBonMitra || 0;
                  const nominalNgunci = m.nominalNotaNgunci || 0;
                  const nominalAktif = m.nominalPiutangAktif ?? Math.max(0, piutangTotal - nominalNgunci);
                  const hutangSupplier = m.totalHutangTitipPanen || 0;
                  const isNgunci = Boolean(m.isNotaNgunci || nominalNgunci > 0);
                  const roleLabel = getRoleMitraLabel(m.role, {
                    isAnakPerusahaan: m.isAnakPerusahaan,
                    isKaryawan: m.isKaryawan || Boolean(m.idKaryawanTerkait),
                  });

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        isNgunci ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center font-mono text-zinc-400 tabular-nums">
                        {idx + 1}
                      </td>

                      {/* Status Nota */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isNgunci ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800">
                              <Lock className="w-3 h-3 text-rose-700" />
                              <span>NOTA NGUNCI</span>
                            </span>
                            <div className="text-[10px] text-rose-700 mt-0.5">
                              Tidak ada respon / macet
                              {(m.jumlahNotaNgunci || 0) > 0 ? ` · ${m.jumlahNotaNgunci} nota` : ''}
                            </div>
                          </div>
                        ) : piutangTotal > 0 ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                              <CheckCircle2 className="w-3 h-3 text-amber-600" />
                              <span>NOTA AKTIF</span>
                            </span>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Piutang berjalan{hutangSupplier > 0 ? ' · +Titipan' : ''}
                            </div>
                          </div>
                        ) : hutangSupplier > 0 ? (
                          <div>
                            <span className="text-[11px] font-bold text-purple-800">
                              NOTA SUPPLIER
                            </span>
                            <div className="text-[10px] text-zinc-500 mt-0.5">
                              Saldo rekening mitra
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] font-medium text-zinc-400">
                            LUNAS / IMPAS
                          </span>
                        )}
                      </td>

                      {/* Nama Mitra */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <KaryawanAvatar
                            nama={m.nama}
                            fotoUrl={m.fotoUrl}
                            size="sm"
                            onClick={
                              m.fotoUrl && onPreviewFotoMitra
                                ? () =>
                                    onPreviewFotoMitra({
                                      nama: m.nama,
                                      roleLabel,
                                      fotoUrl: m.fotoUrl!,
                                    })
                                : undefined
                            }
                          />
                          <div>
                            <div className="font-bold text-zinc-900 text-xs sm:text-sm">
                              {m.nama}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              <span className="font-mono">{m.kode}</span> · {roleLabel}
                            </div>
                            {isNgunci && m.catatanNgunci && (
                              <div className="text-[10px] text-rose-700 mt-0.5 max-w-xs truncate" title={m.catatanNgunci}>
                                Ket: {m.catatanNgunci}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Alamat */}
                      <td className="py-3 px-4 text-zinc-700 max-w-xs">
                        <div className="line-clamp-2 text-xs">
                          {m.alamat && m.alamat !== '-' ? m.alamat : '-'}
                        </div>
                      </td>

                      {/* Nomor HP */}
                      <td className="py-3 px-3 font-mono text-zinc-700 whitespace-nowrap">
                        {m.telepon && m.telepon !== '-' ? m.telepon : '-'}
                      </td>

                      {/* Nominal Piutang Mitra */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {piutangTotal > 0 ? (
                          <div>
                            <div
                              className={`font-mono font-bold text-sm tabular-nums ${
                                isNgunci ? 'text-rose-700' : 'text-amber-800'
                              }`}
                            >
                              {formatRupiah(piutangTotal)}
                            </div>
                            {nominalNgunci > 0 && nominalAktif > 0 ? (
                              <div className="text-[10px] font-mono tabular-nums text-zinc-500 mt-0.5">
                                Aktif {formatRupiah(nominalAktif)} ·{' '}
                                <span className="text-rose-700 font-semibold">
                                  Ngunci {formatRupiah(nominalNgunci)}
                                </span>
                              </div>
                            ) : isNgunci ? (
                              <div className="text-[10px] text-rose-700 font-medium">
                                Uang tertahan (Nota Ngunci)
                              </div>
                            ) : (
                              <div className="text-[10px] text-zinc-500">Piutang aktif</div>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-zinc-400">Rp 0</span>
                        )}
                      </td>

                      {/* Nominal Nota Supplier / Rekening Mitra */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {hutangSupplier > 0 ? (
                          <div>
                            <div className="font-mono font-bold text-sm text-purple-800 tabular-nums">
                              {formatRupiah(hutangSupplier)}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              {(m.totalTitipPanenMurni || 0) > 0 && (m.totalUpahBelumDibayar || 0) > 0
                                ? `Nota Supplier ${formatRupiah(m.totalTitipPanenMurni || 0)} · Upah ${formatRupiah(
                                    m.totalUpahBelumDibayar || 0
                                  )}`
                                : (m.totalUpahBelumDibayar || 0) > 0
                                ? 'Hak upah kerja belum cair'
                                : 'Nota supplier / titipan panen'}
                            </div>
                          </div>
                        ) : (
                          <span className="font-mono text-zinc-400">Rp 0</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {piutangTotal > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                onRequestToggleNgunci({
                                  idMitra: m.id,
                                  namaMitra: m.nama,
                                  nominal: piutangTotal,
                                  targetNgunci: !isNgunci,
                                  currentCatatan: m.catatanNgunci,
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                                isNgunci
                                  ? 'bg-white hover:bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                              }`}
                              title={
                                isNgunci
                                  ? 'Pulihkan status nota mitra ini menjadi Nota Aktif'
                                  : 'Tandai piutang mitra ini sebagai NOTA NGUNCI (tidak ada respon & kepastian bayar)'
                              }
                            >
                              {isNgunci ? (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  <span>Aktifkan</span>
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  <span>Set Ngunci</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenStatement(m.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Buku Nota</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="bg-zinc-50 border-t-2 border-zinc-300 text-xs font-bold">
                <tr>
                  <td colSpan={5} className="py-3.5 px-4 text-right text-zinc-700 uppercase tracking-wider text-[11px]">
                    Subtotal Baris Ditampilkan ({filteredRows.length} Mitra):
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm text-amber-900 tabular-nums whitespace-nowrap">
                    {formatRupiah(filteredSumPiutang)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm text-purple-900 tabular-nums whitespace-nowrap">
                    {formatRupiah(filteredSumNotaSupplier)}
                  </td>
                  <td className="py-3.5 px-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* BAGIAN BAWAH: REKAPITULASI TOTAL & RUMUS UANG KITA YANG MASIH ADA DI MITRA */}
      <div className="bg-zinc-900 text-white rounded-2xl p-5 sm:p-6 border border-zinc-800 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-zinc-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold tracking-tight text-white">
              Perhitungan Akhir Posisi Uang Kita di Mitra (Seluruh Master Mitra)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Rumus: <span className="text-zinc-200 font-semibold">Total Seluruh Piutang Mitra − Total Hutang Kita ke Mitra (Nota Supplier / Rekening Mitra)</span>
            </p>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            Total {rekapData?.totalMitra ?? items.length} Mitra Terdaftar
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Komponen 1: Total Seluruh Piutang Mitra */}
          <div className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700/80 space-y-1.5">
            <div className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
              1. Total Seluruh Piutang Mitra
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
              {formatRupiah(totalSeluruhPiutang)}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono tabular-nums pt-1 border-t border-zinc-700/70 flex flex-wrap justify-between gap-2">
              <span>Aktif: {formatRupiah(totalPiutangAktif)}</span>
              <span className="text-rose-300">Ngunci: {formatRupiah(totalNotaNgunci)}</span>
            </div>
          </div>

          {/* Komponen 2: Total dari Nota Supplier / Rekening Mitra (Hutang Kita ke Mitra) */}
          <div className="p-4 rounded-xl bg-zinc-800/80 border border-zinc-700/80 space-y-1.5">
            <div className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider">
              2. Total Nota Supplier / Rekening Mitra
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-white">
              {formatRupiah(totalNotaSupplierHutangKita)}
            </div>
            <div className="text-[11px] text-zinc-400 pt-1 border-t border-zinc-700/70">
              Total hutang kita ke mitra ({rekapData?.mitraDenganHutangTitipCount || 0} rekening mitra/supplier)
            </div>
          </div>

          {/* Hasil Rumus: Uang Kita yang Masih Ada di Mitra */}
          <div className="p-4 rounded-xl bg-emerald-950/70 border border-emerald-700/70 space-y-1.5">
            <div className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              3. Uang Kita yang Masih Ada di Mitra
            </div>
            <div
              className={`text-xl sm:text-2xl font-bold font-mono tabular-nums ${
                uangKitaDiMitra >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              {uangKitaDiMitra < 0
                ? `-${formatRupiah(Math.abs(uangKitaDiMitra))}`
                : formatRupiah(uangKitaDiMitra)}
            </div>
            <div className="text-[11px] text-emerald-100/80 font-mono tabular-nums pt-1 border-t border-emerald-800/70">
              {formatRupiah(totalSeluruhPiutang)} − {formatRupiah(totalNotaSupplierHutangKita)}
            </div>
          </div>
        </div>

        {/* Informasi Tambahan Eksekutif: Posisi Bersih Jika Nota Ngunci Dikeluarkan */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-zinc-800 text-xs text-zinc-300">
          <div>
            Catatan Realisasi Penagihan (di luar <strong className="text-rose-300">Nota Ngunci {formatRupiah(totalNotaNgunci)}</strong> yang tidak bisa kembali):
          </div>
          <div className="font-mono font-bold tabular-nums text-sm text-white">
            Uang Efektif Dapat Kembali:{' '}
            <span className={uangKitaEfektif >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {uangKitaEfektif < 0
                ? `-${formatRupiah(Math.abs(uangKitaEfektif))}`
                : formatRupiah(uangKitaEfektif)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const KhususNotaNgunciSection: React.FC<RekapMitraViewProps> = ({
  rekapData,
  items,
  onOpenStatement,
  onRequestToggleNgunci,
  onOpenInputNotaLalu,
  onPreviewFotoMitra,
}) => {
  const [search, setSearch] = useState('');
  const [modeTabel, setModeTabel] = useState<'PER_MITRA' | 'PER_NOTA'>('PER_MITRA');
  const [previewFotoNota, setPreviewFotoNota] = useState<{
    imageUrl: string;
    title: string;
    nomorBukti?: string;
    namaMitra?: string;
    tanggal?: string;
    nominalText?: string;
    keterangan?: string;
  } | null>(null);

  const totalUangTidakBisaKembali = rekapData?.totalNominalNotaNgunci ?? 0;
  const totalSeluruhPiutang =
    rekapData?.totalSeluruhPiutangMitra ?? rekapData?.totalBonMitra ?? 0;
  const persenMacet =
    totalSeluruhPiutang > 0 ? (totalUangTidakBisaKembali / totalSeluruhPiutang) * 100 : 0;

  const mitraNgunciList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((m) => Boolean(m.isNotaNgunci || (m.nominalNotaNgunci || 0) > 0))
      .filter((m) => {
        if (!q) return true;
        return (
          m.nama.toLowerCase().includes(q) ||
          m.kode.toLowerCase().includes(q) ||
          (m.alamat || '').toLowerCase().includes(q) ||
          (m.telepon || '').toLowerCase().includes(q) ||
          (m.catatanNgunci || '').toLowerCase().includes(q)
        );
      });
  }, [items, search]);

  const daftarNotaNgunci: NotaNgunciDetailItem[] = useMemo(() => {
    const raw = rekapData?.daftarNotaNgunci || [];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter(
      (n) =>
        n.namaMitra.toLowerCase().includes(q) ||
        n.kodeMitra.toLowerCase().includes(q) ||
        n.noNota.toLowerCase().includes(q) ||
        (n.alamat || '').toLowerCase().includes(q) ||
        (n.telepon || '').toLowerCase().includes(q) ||
        (n.rincian || '').toLowerCase().includes(q) ||
        (n.catatanNgunci || '').toLowerCase().includes(q)
    );
  }, [rekapData?.daftarNotaNgunci, search]);

  return (
    <div className="space-y-5">
      {/* Executive Summary Banner: Nominal Uang Tidak Bisa Kembali */}
      <div className="bg-white border border-rose-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-800 uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5 text-rose-700" />
              <span>Rekap Khusus Status Nota Kunci / Ngunci (Piutang Macet)</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 tracking-tight">
              Daftar Mitra &amp; Nota Kunci yang Uangnya Tidak Bisa Kembali
            </h2>
            <p className="text-xs text-zinc-500 max-w-2xl">
              Menampilkan mitra berstatus Nota Kunci (tidak ada respon/kepastian membayar). Apabila mitra melakukan cicilan atau pelunasan di Rekening Mitra maupun Pelunasan Bon, nominal uang tidak bisa kembali di bawah otomatis langsung berkurang.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenInputNotaLalu({ defaultNgunci: true })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Input Migrasi Nota Ngunci</span>
            </button>
          </div>
        </div>

        {/* 3 Core Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
            <div className="text-[11px] font-semibold text-rose-900 uppercase tracking-wider">
              Total Nominal Uang Tidak Bisa Kembali
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-800">
              {formatRupiah(totalUangTidakBisaKembali)}
            </div>
            <div className="text-[11px] text-rose-900/75">
              Otomatis berkurang saat mitra Nota Kunci membayar
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
            <div className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">
              Jumlah Mitra &amp; Lembar Nota Ngunci
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
              {rekapData?.mitraNotaNgunciCount || 0} Mitra{' '}
              <span className="text-sm font-normal text-zinc-500">
                · {rekapData?.totalLembarNotaNgunci || 0} Nota
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">
              Mitra tanpa respon / kepastian pelunasan
            </div>
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1">
            <div className="text-[11px] font-semibold text-zinc-600 uppercase tracking-wider">
              Rasio Terhadap Seluruh Piutang Mitra
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-zinc-900">
              {persenMacet.toFixed(1)}%
            </div>
            <div className="text-[11px] text-zinc-500 font-mono tabular-nums">
              Dari total piutang {formatRupiah(totalSeluruhPiutang)}
            </div>
          </div>
        </div>

        {/* Mode Toggle & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl self-start text-xs">
            <button
              type="button"
              onClick={() => setModeTabel('PER_MITRA')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                modeTabel === 'PER_MITRA'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Rekap Per Mitra Ngunci ({mitraNgunciList.length})
            </button>
            <button
              type="button"
              onClick={() => setModeTabel('PER_NOTA')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                modeTabel === 'PER_NOTA'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Rincian Per Lembar Nota ({daftarNotaNgunci.length})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari nama mitra, alamat, HP, no nota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-lg focus:ring-1 focus:ring-rose-600 text-zinc-800"
            />
          </div>
        </div>
      </div>

      {/* TABLE MODE 1: REKAP PER MITRA NGUNCI */}
      {modeTabel === 'PER_MITRA' ? (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">NO</th>
                  <th className="py-3 px-3">STATUS NOTA</th>
                  <th className="py-3 px-4">NAMA MITRA</th>
                  <th className="py-3 px-4">ALAMAT</th>
                  <th className="py-3 px-3">NOMOR HP</th>
                  <th className="py-3 px-4">KRONOLOGI / CATATAN NGUNCI</th>
                  <th className="py-3 px-4 text-right">
                    NOMINAL UANG TIDAK BISA KEMBALI
                  </th>
                  <th className="py-3 px-3 text-center">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {mitraNgunciList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-zinc-500">
                      <div className="max-w-md mx-auto space-y-2">
                        <div className="font-bold text-sm text-zinc-800">
                          Belum Ada Mitra dengan Status Nota Ngunci (Rp 0)
                        </div>
                        <p className="text-xs text-zinc-500">
                          Saat Anda memigrasikan Nota Lalu yang piutangnya macet / tidak ada kepastian bayar, pilih{' '}
                          <strong>Status NOTA NGUNCI</strong> atau klik tombol di bawah.
                        </p>
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => onOpenInputNotaLalu({ defaultNgunci: true })}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Input Migrasi Nota Ngunci</span>
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  mitraNgunciList.map((m, idx) => {
                    const nominalNgunci = m.nominalNotaNgunci || m.totalBonMitra || 0;
                    const roleLabel = getRoleMitraLabel(m.role, {
                      isAnakPerusahaan: m.isAnakPerusahaan,
                      isKaryawan: m.isKaryawan || Boolean(m.idKaryawanTerkait),
                    });
                    return (
                      <tr key={m.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="py-3 px-3 text-center font-mono text-zinc-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800">
                            <Lock className="w-3 h-3 text-rose-700" />
                            <span>NOTA NGUNCI</span>
                          </div>
                          <div className="text-[10px] text-zinc-500">
                            {m.jumlahNotaNgunci || 1} lembar nota
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <KaryawanAvatar
                              nama={m.nama}
                              fotoUrl={m.fotoUrl}
                              size="sm"
                              onClick={
                                m.fotoUrl && onPreviewFotoMitra
                                  ? () =>
                                      onPreviewFotoMitra({
                                        nama: m.nama,
                                        roleLabel,
                                        fotoUrl: m.fotoUrl!,
                                      })
                                  : undefined
                              }
                            />
                            <div>
                              <div className="font-bold text-zinc-900 text-xs sm:text-sm">
                                {m.nama}
                              </div>
                              <div className="text-[10px] text-zinc-500">
                                <span className="font-mono">{m.kode}</span> · {roleLabel}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-zinc-700 max-w-xs">
                          {m.alamat && m.alamat !== '-' ? m.alamat : '-'}
                        </td>
                        <td className="py-3 px-3 font-mono text-zinc-700 whitespace-nowrap">
                          {m.telepon && m.telepon !== '-' ? m.telepon : '-'}
                        </td>
                        <td className="py-3 px-4 text-zinc-600 max-w-xs">
                          <div>
                            {m.catatanNgunci ||
                              'Mitra memiliki piutang namun sudah tidak ada respon & kepastian membayar'}
                          </div>
                          {m.tanggalNgunci && (
                            <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                              Ditandai: {m.tanggalNgunci}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-sm text-rose-700 tabular-nums whitespace-nowrap">
                          {formatRupiah(nominalNgunci)}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                onRequestToggleNgunci({
                                  idMitra: m.id,
                                  namaMitra: m.nama,
                                  nominal: nominalNgunci,
                                  targetNgunci: false,
                                  currentCatatan: m.catatanNgunci,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 transition-colors cursor-pointer"
                              title="Pulihkan ke Nota Aktif apabila mitra merespon / membayar"
                            >
                              <Unlock className="w-3 h-3" />
                              <span>Pulihkan Aktif</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenStatement(m.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-900 hover:text-white transition-colors cursor-pointer"
                              title="Buka Rekening Mitra untuk kelola status Nota Kunci atau terima pembayaran"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Rekening &amp; Terima Bayar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {mitraNgunciList.length > 0 && (
                <tfoot className="bg-rose-50/80 border-t-2 border-rose-300 font-bold">
                  <tr>
                    <td colSpan={6} className="py-3.5 px-4 text-right uppercase tracking-wider text-[11px] text-rose-950">
                      Total Nominal Uang yang Tidak Bisa Kembali ({mitraNgunciList.length} Mitra):
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-base text-rose-800 tabular-nums whitespace-nowrap">
                      {formatRupiah(
                        mitraNgunciList.reduce(
                          (s, m) => s + (m.nominalNotaNgunci || m.totalBonMitra || 0),
                          0
                        )
                      )}
                    </td>
                    <td className="py-3.5 px-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        /* TABLE MODE 2: RINCIAN PER LEMBAR NOTA NGUNCI */
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-3">NO. NOTA &amp; TANGGAL</th>
                  <th className="py-3 px-4">NAMA MITRA</th>
                  <th className="py-3 px-4">ALAMAT &amp; NO. HP</th>
                  <th className="py-3 px-4">RINCIAN BARANG &amp; KRONOLOGI NGUNCI</th>
                  <th className="py-3 px-4 text-right">UANG TIDAK BISA KEMBALI</th>
                  <th className="py-3 px-3 text-center">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-800">
                {daftarNotaNgunci.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-zinc-500">
                      Belum ada lembar nota berstatus Nota Ngunci.
                    </td>
                  </tr>
                ) : (
                  daftarNotaNgunci.map((n) => (
                    <tr key={`${n.idMitra}-${n.idNota}`} className="hover:bg-rose-50/30 transition-colors">
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1 font-mono font-bold text-rose-800">
                          <Lock className="w-3 h-3" />
                          <span>{n.noNota}</span>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          Tgl Nota: {n.tanggal}
                        </div>
                        <div className="text-[10px] text-zinc-500">{n.jenisNotaLabel}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-zinc-900">{n.namaMitra}</div>
                        <div className="text-[10px] text-zinc-500">
                          <span className="font-mono">{n.kodeMitra}</span> ·{' '}
                          {getRoleMitraLabel(n.roleMitra)}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-zinc-700">{n.alamat || '-'}</div>
                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                          HP: {n.telepon || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 max-w-sm">
                        <div className="font-medium text-zinc-900">{n.rincian}</div>
                        {n.catatanNgunci && (
                          <div className="text-[11px] text-rose-700 mt-0.5">
                            Kronologi: {n.catatanNgunci}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm text-rose-700 tabular-nums whitespace-nowrap">
                        {formatRupiah(n.sisaNominalNgunci)}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {n.fotoNota && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewFotoNota({
                                  imageUrl: n.fotoNota!,
                                  title: `Bukti Nota Ngunci — ${n.noNota}`,
                                  nomorBukti: n.noNota,
                                  namaMitra: n.namaMitra,
                                  tanggal: n.tanggal,
                                  nominalText: formatRupiah(n.sisaNominalNgunci),
                                  keterangan: n.rincian,
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 cursor-pointer"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Foto Nota</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onRequestToggleNgunci({
                                idMitra: n.idMitra,
                                namaMitra: n.namaMitra,
                                idNota: n.idNota,
                                noNota: n.noNota,
                                nominal: n.sisaNominalNgunci,
                                targetNgunci: false,
                                currentCatatan: n.catatanNgunci,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 cursor-pointer"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Pulihkan</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenStatement(n.idMitra)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-zinc-800 bg-zinc-100 hover:bg-zinc-900 hover:text-white cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Buku</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {daftarNotaNgunci.length > 0 && (
                <tfoot className="bg-rose-50/80 border-t-2 border-rose-300 font-bold">
                  <tr>
                    <td colSpan={4} className="py-3.5 px-4 text-right uppercase tracking-wider text-[11px] text-rose-950">
                      Total Nominal Nota Ngunci ({daftarNotaNgunci.length} Lembar Nota):
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-base text-rose-800 tabular-nums whitespace-nowrap">
                      {formatRupiah(
                        daftarNotaNgunci.reduce((s, n) => s + (n.sisaNominalNgunci || 0), 0)
                      )}
                    </td>
                    <td className="py-3.5 px-3"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {previewFotoNota && (
        <FotoNotaPreviewModal
          isOpen={true}
          onClose={() => setPreviewFotoNota(null)}
          imageUrl={previewFotoNota.imageUrl}
          title={previewFotoNota.title}
          nomorBukti={previewFotoNota.nomorBukti}
          namaMitra={previewFotoNota.namaMitra}
          tanggal={previewFotoNota.tanggal}
          nominalText={previewFotoNota.nominalText}
          keterangan={previewFotoNota.keterangan}
        />
      )}
    </div>
  );
};

interface ModalToggleNotaNgunciProps {
  target: {
    idMitra: string;
    namaMitra: string;
    idNota?: string;
    noNota?: string;
    nominal: number;
    targetNgunci: boolean;
    currentCatatan?: string;
  } | null;
  submitting: boolean;
  errorMsg?: string;
  onClose: () => void;
  onConfirm: (catatanNgunci: string) => void;
}

export const ModalToggleNotaNgunci: React.FC<ModalToggleNotaNgunciProps> = ({
  target,
  submitting,
  errorMsg,
  onClose,
  onConfirm,
}) => {
  const [catatan, setCatatan] = useState(target?.currentCatatan || '');

  React.useEffect(() => {
    setCatatan(target?.currentCatatan || '');
  }, [target]);

  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-zinc-200 overflow-hidden">
        <div
          className={`p-4 text-white font-bold text-sm flex items-center justify-between ${
            target.targetNgunci ? 'bg-rose-800' : 'bg-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {target.targetNgunci ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            <span>
              {target.targetNgunci
                ? 'Ubah Status Piutang Menjadi NOTA KUNCI'
                : 'Pulihkan ke Status NOTA PIUTANG AKTIF'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-white/80 hover:text-white cursor-pointer px-1"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs text-zinc-700">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
            <div className="text-zinc-500">
              Mitra: <strong className="text-zinc-900">{target.namaMitra}</strong>
              {target.noNota ? (
                <>
                  {' '}
                  · Nota: <strong className="font-mono text-zinc-900">{target.noNota}</strong>
                </>
              ) : null}
            </div>
            <div className="font-mono text-base font-bold text-zinc-900 tabular-nums">
              Nominal Piutang: {formatRupiah(target.nominal)}
            </div>
          </div>

          {target.targetNgunci ? (
            <>
              <p className="leading-relaxed text-zinc-600">
                Piutang ini akan diubah menjadi status{' '}
                <strong className="text-rose-800">NOTA KUNCI / NGUNCI (Uang Tidak Bisa Kembali)</strong>. Apabila ke depannya mitra melakukan pembayaran sebagian maupun lunas, nominal uang tidak bisa kembali akan otomatis langsung berkurang.
              </p>
              <div>
                <label className="block font-semibold text-zinc-800 mb-1">
                  Catatan / Alasan Nota Ngunci (Opsional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Sudah ditagih berkali-kali tidak ada respon / nomor WA mati..."
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-1 focus:ring-rose-600"
                />
              </div>
            </>
          ) : (
            <p className="leading-relaxed text-zinc-600">
              Status nota akan dikembalikan menjadi <strong className="text-emerald-800">NOTA AKTIF</strong>{' '}
              dan dikeluarkan dari daftar uang tidak bisa kembali.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => onConfirm(catatan)}
              className={`px-4 py-2 text-white rounded-lg font-bold cursor-pointer disabled:opacity-50 ${
                target.targetNgunci
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              {submitting
                ? 'Menyimpan...'
                : target.targetNgunci
                ? 'Simpan Jadi NOTA KUNCI'
                : 'Ya, Pulihkan ke Nota Aktif'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
