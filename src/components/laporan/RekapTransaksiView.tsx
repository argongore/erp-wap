import React, { useState } from 'react';
import { FileText, Search, Filter, ArrowUpRight, ArrowDownLeft, HandCoins, Receipt, ArrowLeftRight, Image, Eye, X, Download } from 'lucide-react';
import { formatRupiah } from '../../utils/format.ts';

interface Props {
  recentTransactions: Array<{
    id: string;
    tanggal: string;
    jam: string;
    createdAt: string;
    kategori: string;
    label: string;
    nominal: number;
    pihakTerkait: string;
    rekening: string;
    status: string;
    fotoNota?: string;
  }>;
}

export const RekapTransaksiView: React.FC<Props> = ({ recentTransactions }) => {
  const [filterKategori, setFilterKategori] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewImage, setPreviewImage] = useState<{ src: string; title: string } | null>(null);

  const filtered = recentTransactions.filter((tx) => {
    const matchCategory = filterKategori === 'ALL' || tx.kategori === filterKategori;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      tx.id.toLowerCase().includes(q) ||
      tx.label.toLowerCase().includes(q) ||
      tx.pihakTerkait.toLowerCase().includes(q) ||
      tx.rekening.toLowerCase().includes(q);
    return matchCategory && matchSearch;
  });

  const totalNominal = filtered.reduce((sum, tx) => sum + tx.nominal, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Laporan Rekapitulasi Transaksi</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-100 text-cyan-800">
              MODUL 9
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Arsip terpadu seluruh transaksi kasir, pembelian kulakan supplier, pembelian hasil bumi, kasbon uang, bayar bon, dan mutasi rekening
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-zinc-500">Total Nominal Terfilter:</span>
          <div className="text-lg font-bold text-zinc-900">{formatRupiah(totalNominal)}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Category buttons */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto text-xs">
          <button
            onClick={() => setFilterKategori('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Semua ({recentTransactions.length})
          </button>
          <button
            onClick={() => setFilterKategori('PEMBELIAN_BARANG')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'PEMBELIAN_BARANG' ? 'bg-indigo-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Kulakan Supplier
          </button>
          <button
            onClick={() => setFilterKategori('PENJUALAN')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'PENJUALAN' ? 'bg-emerald-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Penjualan
          </button>
          <button
            onClick={() => setFilterKategori('PEMBELIAN_HASIL_BUMI')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'PEMBELIAN_HASIL_BUMI' ? 'bg-amber-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Hasil Bumi
          </button>
          <button
            onClick={() => setFilterKategori('KASBON_UANG')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'KASBON_UANG' ? 'bg-rose-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Kasbon Uang
          </button>
          <button
            onClick={() => setFilterKategori('BAYAR_BON')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'BAYAR_BON' ? 'bg-teal-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Bayar Bon
          </button>
          <button
            onClick={() => setFilterKategori('TRANSFER_REKENING')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterKategori === 'TRANSFER_REKENING' ? 'bg-sky-700 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            Transfer Rekening
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <input
            type="text"
            placeholder="Cari ID transaksi, nama, rekening..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-zinc-600"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">NO TRANSAKSI</th>
                <th className="py-3 px-4">TANGGAL &amp; JAM</th>
                <th className="py-3 px-4">KATEGORI</th>
                <th className="py-3 px-4">DESKRIPSI / LABEL</th>
                <th className="py-3 px-4">PIHAK TERKAIT</th>
                <th className="py-3 px-4">REKENING TERLIBAT</th>
                <th className="py-3 px-4 text-right">NOMINAL (RP)</th>
                <th className="py-3 px-4 text-center">BUKTI NOTA</th>
                <th className="py-3 px-4 text-center">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-zinc-400">
                    Tidak ada transaksi yang cocok dengan kriteria pencarian
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">{tx.id}</td>
                    <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                      {tx.tanggal} · {tx.jam}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          tx.kategori === 'PENJUALAN'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tx.kategori === 'PEMBELIAN_HASIL_BUMI'
                            ? 'bg-amber-100 text-amber-800'
                            : tx.kategori === 'PEMBELIAN_BARANG'
                            ? 'bg-indigo-100 text-indigo-800'
                            : tx.kategori === 'KASBON_UANG'
                            ? 'bg-rose-100 text-rose-800'
                            : tx.kategori === 'BAYAR_BON'
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {tx.kategori.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-zinc-900">{tx.label}</td>
                    <td className="py-3 px-4 text-zinc-600">{tx.pihakTerkait}</td>
                    <td className="py-3 px-4 font-mono text-zinc-600">{tx.rekening}</td>
                    <td className="py-3 px-4 text-right font-bold text-zinc-900">{formatRupiah(tx.nominal)}</td>
                    <td className="py-3 px-4 text-center">
                      {tx.fotoNota ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImage({ src: tx.fotoNota!, title: `Bukti Nota Transaksi ${tx.id} (${tx.pihakTerkait})` })}
                          className="inline-flex items-center space-x-1 px-2 py-0.5 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded font-semibold text-[10px] cursor-pointer transition-colors"
                          title="Klik untuk melihat bukti foto nota fisik"
                        >
                          <Image className="w-3 h-3 text-purple-600" />
                          <span>Lihat Nota</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          tx.status === 'LUNAS' || tx.status === 'BERHASIL'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tx.status === 'SEBAGIAN'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lightbox Preview Modal for Foto Nota */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl border border-zinc-200">
            <div className="p-3 bg-zinc-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Image className="w-4 h-4 text-purple-400" />
                <span className="font-bold text-xs truncate max-w-md">{previewImage.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-zinc-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewImage.src}
                alt="Foto Nota Bukti Fisik"
                className="max-h-[70vh] w-auto object-contain rounded-lg border border-zinc-800"
              />
            </div>
            <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
              <span>Bukti fisik nota tersimpan terenkripsi di sistem database.</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
