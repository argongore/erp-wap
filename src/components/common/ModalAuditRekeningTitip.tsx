import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  RotateCcw,
  Wallet,
  UserCheck,
  FileText,
  ArrowRightLeft,
  AlertCircle,
  X,
  Download,
  FileDown,
  FileSpreadsheet,
  Image as ImageIcon,
} from 'lucide-react';
import type { ProfilPerusahaan, RekeningTitipAuditSummary } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import {
  exportRekeningTitipToCsv,
  exportRekeningTitipToImage,
  exportRekeningTitipToPdf,
  exportRekeningTitipToXlsx,
} from '../../utils/exportRekeningTitip.ts';

interface Props {
  kodeRekening: string | null;
  onClose: () => void;
  onOpenTransfer?: (kodeRekening: string) => void;
  onOpenRekeningKoran?: (idMitra: string) => void;
}

export const ModalAuditRekeningTitip: React.FC<Props> = ({
  kodeRekening,
  onClose,
  onOpenTransfer,
  onOpenRekeningKoran,
}) => {
  const [audit, setAudit] = useState<RekeningTitipAuditSummary | null>(null);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [filterArah, setFilterArah] = useState<'ALL' | 'MASUK' | 'BELANJA' | 'KEMBALI'>('ALL');
  const [downloadingFmt, setDownloadingFmt] = useState<'pdf' | 'xlsx' | 'jpg' | 'png' | 'csv' | null>(null);
  const [downloadBanner, setDownloadBanner] = useState('');

  useEffect(() => {
    if (!kodeRekening) {
      setAudit(null);
      setDownloadBanner('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMsg('');
    setDownloadBanner('');
    setFilterArah('ALL');
    Promise.all([
      api.getRekeningTitipAudit(kodeRekening),
      api.getProfilPerusahaan().catch(() => null),
    ])
      .then(([res, profil]) => {
        if (!cancelled) {
          setAudit(res);
          if (profil) setProfilPerusahaan(profil);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setErrorMsg(err.message || 'Gagal memuat rincian audit rekening titip');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kodeRekening]);

  const handleDownload = async (fmt: 'pdf' | 'xlsx' | 'jpg' | 'png' | 'csv') => {
    if (!audit) return;
    setDownloadingFmt(fmt);
    setDownloadBanner('');
    try {
      if (fmt === 'pdf') {
        const fn = await exportRekeningTitipToPdf(audit, profilPerusahaan, { filterArah });
        setDownloadBanner(`Berhasil mengunduh PDF Rekening Koran Titip: ${fn}`);
      } else if (fmt === 'xlsx') {
        const fn = exportRekeningTitipToXlsx(audit, profilPerusahaan, { filterArah });
        setDownloadBanner(`Berhasil mengunduh Excel Rekening Koran Titip: ${fn}`);
      } else if (fmt === 'jpg' || fmt === 'png') {
        const res = await exportRekeningTitipToImage(audit, profilPerusahaan, {
          format: fmt,
          filterArah,
        });
        setDownloadBanner(
          `Berhasil mengunduh gambar ${fmt.toUpperCase()} (${res.pageCount} halaman): ${res.filenames.join(', ')}`
        );
      } else if (fmt === 'csv') {
        const fn = exportRekeningTitipToCsv(audit, { filterArah });
        setDownloadBanner(`Berhasil mengunduh CSV Rekening Koran Titip: ${fn}`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || `Gagal mengunduh Rekening Koran Titip (${fmt.toUpperCase()})`);
    } finally {
      setDownloadingFmt(null);
    }
  };

  if (!kodeRekening) return null;

  const filteredMutasi = (audit?.mutasi || []).filter((m) =>
    filterArah === 'ALL' ? true : m.arah === filterArah
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-zinc-200 flex flex-col animate-in fade-in">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-sky-900 text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-700/80 border border-sky-500/50 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-sky-200" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base">
                  Audit Rekening Titip Uang: {audit?.namaRekening || kodeRekening}
                </h3>
                <span className="font-mono text-[11px] bg-sky-800 px-2 py-0.5 rounded border border-sky-600">
                  {kodeRekening}
                </span>
              </div>
              <p className="text-[11px] text-sky-200 flex items-center gap-1.5 mt-0.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>
                  Pemegang Amanah Transaksi:{' '}
                  <strong className="text-white">
                    {audit?.namaKaryawanTerkait || audit?.atasNama || '-'}
                  </strong>
                  {' · '}Terpisah dari Kasbon Pribadi (BON01) &amp; Hutang Panen (TIT01)
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenTransfer && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTransfer(kodeRekening);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Titip / Tarik Dana</span>
              </button>
            )}
            {onOpenRekeningKoran && audit?.idMitraTerkait && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenRekeningKoran(audit.idMitraTerkait!);
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white text-sky-900 hover:bg-sky-50 rounded-lg text-xs font-bold cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Buka Rekening Koran</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-sky-200 hover:text-white hover:bg-sky-800 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {loading && (
            <div className="py-12 text-center text-zinc-500">Memuat rincian mutasi dana titip...</div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {audit && !loading && (
            <>
              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-900 uppercase">
                    <span>Total Dana Dititipkan (+)</span>
                    <ArrowDownCircle className="w-4 h-4 text-emerald-700" />
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-emerald-800 tabular-nums">
                    +{formatRupiah(audit.saldoAwal + audit.totalDititipkanMasuk)}
                  </div>
                  <div className="text-[11px] text-emerald-800/80">
                    {audit.saldoAwal !== 0
                      ? `Saldo Awal ${formatRupiah(audit.saldoAwal)} + ${audit.jumlahTransaksiMasuk} Setoran`
                      : `${audit.jumlahTransaksiMasuk} Transaksi Dana Masuk`}
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-amber-900 uppercase">
                    <span>Sudah Dibelanjakan (-)</span>
                    <ArrowUpCircle className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-amber-900 tabular-nums">
                    -{formatRupiah(audit.totalDibelanjakanKeluar)}
                  </div>
                  <div className="text-[11px] text-amber-800/80">
                    {audit.jumlahTransaksiBelanja} Transaksi Belanja / Pengeluaran / Gaji
                  </div>
                </div>

                <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-zinc-700 uppercase">
                    <span>Dikembalikan ke PT (-)</span>
                    <RotateCcw className="w-4 h-4 text-zinc-600" />
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-zinc-800 tabular-nums">
                    -{formatRupiah(audit.totalDikembalikanKePt)}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {audit.jumlahTransaksiKembali} Transfer Balik ke Rekening Perusahaan
                  </div>
                </div>

                <div className="p-3.5 bg-sky-50 border-2 border-sky-300 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-sky-900 uppercase">
                    <span>Sisa Saldo Rekening Titip</span>
                    <Wallet className="w-4 h-4 text-sky-700" />
                  </div>
                  <div className="text-base sm:text-lg font-black font-mono text-sky-950 tabular-nums">
                    {formatRupiah(audit.saldoSaatIni)}
                  </div>
                  <div className="text-[11px] text-sky-800">
                    Dana amanah siap dipakai transaksi
                  </div>
                </div>
              </div>

              {/* Bar Unduh Rekening Koran Khusus Rekening Titip Uang + Filter Arah */}
              <div className="p-3 bg-sky-50/90 border border-sky-200 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center space-x-1.5 text-sky-950 font-bold mr-1">
                    <Download className="w-3.5 h-3.5 text-sky-700" />
                    <span>Unduh Rek. Koran Titip:</span>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(downloadingFmt)}
                    onClick={() => handleDownload('pdf')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    title="Unduh Rekening Koran khusus Rekening Titip format PDF"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>{downloadingFmt === 'pdf' ? '...' : 'PDF'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(downloadingFmt)}
                    onClick={() => handleDownload('xlsx')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    title="Unduh Rekening Koran khusus Rekening Titip format Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{downloadingFmt === 'xlsx' ? '...' : 'Excel'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(downloadingFmt)}
                    onClick={() => handleDownload('jpg')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    title="Unduh gambar JPG siap kirim WhatsApp"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{downloadingFmt === 'jpg' ? '...' : 'JPG'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(downloadingFmt)}
                    onClick={() => handleDownload('png')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                    title="Unduh gambar PNG resolusi HD"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>{downloadingFmt === 'png' ? '...' : 'PNG'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(downloadingFmt)}
                    onClick={() => handleDownload('csv')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    title="Unduh file CSV"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{downloadingFmt === 'csv' ? '...' : 'CSV'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: 'ALL', label: `Semua (${audit.mutasi.length})` },
                      { key: 'MASUK', label: `Dana Masuk (+)` },
                      { key: 'BELANJA', label: `Dibelanjakan (-)` },
                      { key: 'KEMBALI', label: `Kembali ke PT (-)` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilterArah(f.key)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                        filterArah === f.key
                          ? 'bg-sky-800 text-white'
                          : 'bg-white text-zinc-700 border border-sky-200 hover:bg-sky-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {downloadBanner && (
                <div className="px-3.5 py-2 bg-sky-900 text-sky-100 rounded-xl text-[11px] flex items-center justify-between">
                  <span>{downloadBanner}</span>
                  <button
                    type="button"
                    onClick={() => setDownloadBanner('')}
                    className="text-sky-300 hover:text-white font-bold ml-3 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Table */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-100 border-b border-zinc-200 text-zinc-600 uppercase text-[10px] font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Tanggal</th>
                        <th className="py-2.5 px-3">Jenis Transaksi</th>
                        <th className="py-2.5 px-3">Pihak / Sumber / Rincian Belanja</th>
                        <th className="py-2.5 px-3 text-right">Dana Masuk (+)</th>
                        <th className="py-2.5 px-3 text-right">Belanja / Keluar (-)</th>
                        <th className="py-2.5 px-3 text-right">Sisa Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {filteredMutasi.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-zinc-400">
                            Belum ada mutasi transaksi pada Rekening Titip ini.
                          </td>
                        </tr>
                      ) : (
                        filteredMutasi.map((m) => (
                          <tr key={`${m.id}-${m.modulSumber}`} className="hover:bg-sky-50/40 align-top">
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="font-semibold text-zinc-900">{m.tanggal}</div>
                              <div className="text-[10px] font-mono text-zinc-400">{m.jam}</div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <div className="flex flex-wrap items-center gap-1">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    m.arah === 'MASUK'
                                      ? 'bg-emerald-100 text-emerald-900'
                                      : m.arah === 'KEMBALI'
                                      ? 'bg-zinc-200 text-zinc-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {m.jenis}
                                </span>
                                {m.detailItems && m.detailItems.length > 1 && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-sky-100 text-sky-900 border border-sky-200">
                                    {m.detailItems.length} Rincian
                                  </span>
                                )}
                              </div>
                              <div
                                className="text-[10px] font-mono text-zinc-400 mt-0.5"
                                title={
                                  m.mergedIds && m.mergedIds.length > 1
                                    ? `Gabungan Nota: ${m.mergedIds.join(', ')}`
                                    : m.id
                                }
                              >
                                {m.id}
                                {m.mergedIds && m.mergedIds.length > 1 && (
                                  <span className="text-sky-600 ml-1">
                                    (+{m.mergedIds.length - 1} nota)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 max-w-md">
                              <div className="font-semibold text-zinc-900">{m.pihakAtauRekeningLawan}</div>
                              <div className="text-[11px] text-zinc-600 mt-0.5">{m.uraian}</div>
                              {m.detailItems && m.detailItems.length > 1 ? (
                                <div className="mt-1.5 rounded-lg border border-amber-200/90 bg-amber-50/40 overflow-hidden divide-y divide-amber-100/90">
                                  {m.detailItems.map((it, idx) => (
                                    <div
                                      key={idx}
                                      className="px-2.5 py-1.5 flex items-start justify-between gap-3 text-[10.5px]"
                                    >
                                      <div className="min-w-0">
                                        <span className="font-semibold text-zinc-800">
                                          {idx + 1}. {it.nama}
                                        </span>
                                        <span className="text-zinc-500 ml-1.5 font-mono text-[10px]">
                                          ({it.qty.toLocaleString('id-ID')} {it.satuan} ×{' '}
                                          {formatRupiah(it.harga)})
                                        </span>
                                      </div>
                                      <span className="font-mono font-bold text-amber-900 whitespace-nowrap tabular-nums">
                                        {formatRupiah(it.subtotal)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                m.detailItems &&
                                m.detailItems.length === 1 && (
                                  <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-sky-200">
                                    {m.detailItems.map((it, idx) => (
                                      <div key={idx} className="text-[10px] text-zinc-500">
                                        • {it.nama} ({it.qty.toLocaleString('id-ID')} {it.satuan} ×{' '}
                                        {formatRupiah(it.harga)}) = <strong>{formatRupiah(it.subtotal)}</strong>
                                      </div>
                                    ))}
                                  </div>
                                )
                              )}
                              {m.catatan && m.catatan !== m.uraian && (
                                <div className="text-[10px] text-zinc-400 italic mt-0.5">
                                  Ket: {m.catatan}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap tabular-nums">
                              {m.nominalMasuk > 0 ? `+${formatRupiah(m.nominalMasuk)}` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-800 whitespace-nowrap tabular-nums">
                              {m.nominalKeluar > 0 ? `-${formatRupiah(m.nominalKeluar)}` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-sky-950 whitespace-nowrap tabular-nums">
                              {formatRupiah(m.saldoSetelah)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
