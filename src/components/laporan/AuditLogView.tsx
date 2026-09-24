import React, { useState } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { AuditLog } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';

interface Props {
  logs: AuditLog[];
  onRefresh: () => void;
}

export const AuditLogView: React.FC<Props> = ({ logs, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filtered = logs.filter((log) => {
    const q = searchQuery.toLowerCase();
    return (
      log.jenisTransaksi.toLowerCase().includes(q) ||
      log.idTransaksi.toLowerCase().includes(q) ||
      log.user.toLowerCase().includes(q) ||
      log.detail.toLowerCase().includes(q) ||
      (log.rekeningTerkait && log.rekeningTerkait.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Audit Trail &amp; Log Keamanan Transaksi</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">
              MODUL 10
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Jejak audit otomatis sistem untuk setiap transaksi finansial, koreksi saldo, dan pergerakan stok
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="px-3.5 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50 shadow-2xs"
        >
          Segarkan Log
        </button>
      </div>

      {/* Security Note */}
      <div className="p-3 bg-zinc-900 text-zinc-300 rounded-xl text-xs flex items-center space-x-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <span className="font-bold text-white">Integritas Data Terproteksi:</span> Seluruh log audit bersifat{' '}
          <em>append-only</em> (hanya bertambah) dan tidak dapat dimanipulasi atau dihapus oleh operator.
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-zinc-200 shadow-2xs flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            placeholder="Cari ID transaksi, aksi, operator, atau keterangan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-zinc-300 rounded-lg text-xs"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
        </div>
        <span className="text-xs text-zinc-500">{filtered.length} Catatan Log</span>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">WAKTU (WIB)</th>
                <th className="py-3 px-4">JENIS AKSI</th>
                <th className="py-3 px-4">ID TRANSAKSI</th>
                <th className="py-3 px-4">OPERATOR</th>
                <th className="py-3 px-4">RINCIAN DATA LOG</th>
                <th className="py-3 px-4 text-right">NOMINAL (RP)</th>
                <th className="py-3 px-4 text-center">REKENING</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400">
                    Tidak ada log audit ditemukan
                  </td>
                </tr>
              ) : (
                filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                      {log.tanggal} · {log.jam}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                        {log.jenisTransaksi}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-zinc-900">{log.idTransaksi}</td>
                    <td className="py-3 px-4 text-zinc-600">{log.user}</td>
                    <td className="py-3 px-4 text-zinc-700 max-w-md">{log.detail}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900">
                      {log.nominal > 0 ? formatRupiah(log.nominal) : '-'}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-[11px] text-zinc-600">
                      {log.rekeningTerkait || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
