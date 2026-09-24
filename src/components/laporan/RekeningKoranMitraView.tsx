import React, { useState, useEffect } from 'react';
import {
  Printer,
  AlertCircle,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { Mitra, RekeningKoranMitraSummary } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { CetakRekeningKoranModal } from './CetakRekeningKoranModal.tsx';

interface Props {
  mitraList: Mitra[];
  selectedMitraId?: string;
  onSelectMitra: (id: string) => void;
}

export const RekeningKoranMitraView: React.FC<Props> = ({
  mitraList,
  selectedMitraId,
  onSelectMitra,
}) => {
  const currentMitraId = selectedMitraId || mitraList[0]?.id || '';
  const [statement, setStatement] = useState<RekeningKoranMitraSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [quickCopied, setQuickCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!currentMitraId) return;
    let isMounted = true;
    setLoading(true);
    setErrorMsg('');

    api
      .getRekeningKoranMitra(currentMitraId)
      .then((data) => {
        if (isMounted) setStatement(data);
      })
      .catch((err) => {
        if (isMounted) setErrorMsg(err.message || 'Gagal memuat rekening koran mitra');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentMitraId]);

  const handlePrintClick = () => {
    if (!statement) {
      if (currentMitraId) {
        setLoading(true);
        api
          .getRekeningKoranMitra(currentMitraId)
          .then((data) => {
            setStatement(data);
            setShowPrintModal(true);
          })
          .catch((err) => {
            setErrorMsg(err.message || 'Gagal memuat rekening koran');
          })
          .finally(() => setLoading(false));
      }
      return;
    }
    setShowPrintModal(true);
  };

  const handleQuickCopy = () => {
    if (!statement) return;
    const lines = [
      `*REKENING KORAN MITRA - PT WIJAYA AGRO*`,
      `Mitra: ${statement.namaMitra} (${statement.kodeMitra}) - ${statement.role}`,
      `Total Kasbon Barang: ${formatRupiah(statement.totalKasbonBarang)}`,
      `Total Kasbon Uang: ${formatRupiah(statement.totalKasbonUang)}`,
      `*TOTAL SISA BON: ${formatRupiah(statement.totalBonKeseluruhan)}*`,
      `Titip Hasil Bumi: ${formatRupiah(statement.totalTitip)}`,
      `Jumlah Riwayat Transaksi: ${statement.history.length}`,
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 2500);
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Rekening Koran / Buku Besar Mitra</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
              MODUL 8
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Rekap seluruh pergerakan kasbon barang, pinjaman uang tunai, pembelian hasil panen, dan pelunasan bon
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {statement && (
            <button
              onClick={handleQuickCopy}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Salin rekap ringkas ke clipboard"
            >
              {quickCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
              <span>{quickCopied ? 'Tersalin!' : 'Salin Ringkasan'}</span>
            </button>
          )}

          <button
            onClick={handlePrintClick}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{loading ? 'Memuat Data...' : 'Cetak Rekening Koran'}</span>
          </button>
        </div>
      </div>

      {/* Select Mitra Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <label className="block text-xs font-bold text-zinc-700 mb-1 uppercase tracking-wider">
            Pilih Nama Mitra / Petani:
          </label>
          <select
            value={currentMitraId}
            onChange={(e) => onSelectMitra(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-600"
          >
            {mitraList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nama} ({m.kode}) - {m.role} - {m.telepon}
              </option>
            ))}
          </select>
        </div>

        {statement && (
          <div className="text-xs text-zinc-600 sm:text-right space-y-0.5">
            <div>
              Status: <strong className="text-emerald-700 font-bold">{statement.status}</strong> ({statement.role})
            </div>
            <div>
              Alamat: <span className="text-zinc-800 font-medium">{statement.alamat}</span>
            </div>
            <div>
              Kontak HP/WA: <span className="font-mono text-zinc-800">{statement.telepon}</span>
            </div>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-zinc-400 text-xs flex items-center justify-center space-x-2">
          <div className="animate-spin w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full" />
          <span>Memuat data rekening koran...</span>
        </div>
      )}

      {statement && !loading && (
        <div className="space-y-6">
          {/* Summary Balance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Kasbon Barang */}
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Kasbon Barang (Toko)
              </span>
              <div className="text-lg font-bold text-zinc-900 mt-1">
                {formatRupiah(statement.totalKasbonBarang)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Pupuk &amp; obat saprotan belum lunas</div>
            </div>

            {/* Total Kasbon Uang */}
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                Kasbon Uang Tunai
              </span>
              <div className="text-lg font-bold text-rose-700 mt-1">
                {formatRupiah(statement.totalKasbonUang)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">Pinjaman kas operasional aktif</div>
            </div>

            {/* TOTAL BON KESELURUHAN */}
            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">
                TOTAL BON KESELURUHAN
              </span>
              <div className="text-xl font-black text-amber-900 mt-1 font-mono">
                {formatRupiah(statement.totalBonKeseluruhan)}
              </div>
              <div className="text-[11px] text-amber-800 font-medium mt-1">
                Total piutang yang wajib dibayar mitra
              </div>
            </div>

            {/* Total Titip Hasil Bumi */}
            <div className="bg-purple-50/70 p-4 rounded-xl border border-purple-200 shadow-2xs">
              <span className="text-[10px] font-bold text-purple-900 uppercase tracking-wider">
                Titip Hasil Bumi (TIT01)
              </span>
              <div className="text-xl font-black text-purple-950 mt-1 font-mono">
                {formatRupiah(statement.totalTitip)}
              </div>
              <div className="text-[11px] text-purple-800 font-medium mt-1">
                Hasil panen disetor belum diambil uangnya
              </div>
            </div>
          </div>

          {/* Statement Table */}
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-zinc-900">
                  Riwayat Mutasi &amp; Rekening Koran: {statement.namaMitra}
                </h2>
                <p className="text-xs text-zinc-500">
                  Daftar transaksi kronologis terinci dengan running balance bon
                </p>
              </div>
              <span className="text-xs text-zinc-500">{statement.history.length} Catatan Transaksi</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">TANGGAL &amp; JAM</th>
                    <th className="py-3 px-4">NO TRANSAKSI</th>
                    <th className="py-3 px-4">JENIS AKTIVITAS</th>
                    <th className="py-3 px-4">KETERANGAN / RINCIAN</th>
                    <th className="py-3 px-4 text-right">MUTASI BON (+)</th>
                    <th className="py-3 px-4 text-right">BAYAR BON (-)</th>
                    <th className="py-3 px-4 text-right font-bold">SALDO BON MITRA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800">
                  {statement.history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-zinc-400">
                        Belum ada histori transaksi untuk mitra ini
                      </td>
                    </tr>
                  ) : (
                    statement.history.map((row) => (
                      <tr key={row.id} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                          {row.tanggal} · {row.jam}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-zinc-900 whitespace-nowrap">
                          {row.id}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${
                              row.jenis === 'PENJUALAN_KASBON'
                                ? 'bg-amber-100 text-amber-800'
                                : row.jenis === 'KASBON_UANG'
                                ? 'bg-rose-100 text-rose-800'
                                : row.jenis === 'BAYAR_BON'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.jenis === 'PEMBELIAN_TITIP'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            {row.jenis.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs">{row.keterangan}</td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700">
                          {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700">
                          {row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900">
                          {formatRupiah(row.saldoAkumulasi)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Official Rekening Koran Print Modal */}
      {showPrintModal && (
        <CetakRekeningKoranModal
          statement={statement}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </div>
  );
};
