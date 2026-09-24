import React from 'react';
import { Wheat, TrendingUp, History } from 'lucide-react';
import { StokHasilBumi, TransaksiPembelianHasilBumi } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo, formatJamIndo } from '../../utils/format.ts';

interface Props {
  stokList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  onRefresh: () => void;
}

export const StokHasilBumiView: React.FC<Props> = ({ stokList, pembelianList, onRefresh }) => {
  const totalVolumeKg = stokList.reduce((s, h) => s + h.stok, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Stok Hasil Bumi & Komoditas Pertanian</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              MODUL 7
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Persediaan fisik komoditas hasil panen petani di gudang penampungan PT Wijaya Agro
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-zinc-500">Total Akumulasi Komoditas:</div>
          <div className="text-lg font-bold text-amber-800">
            {(totalVolumeKg / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}{' '}
            Ton ({totalVolumeKg.toLocaleString('id-ID')} Kg)
          </div>
        </div>
      </div>

      {/* Commodity Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stokList.map((hb) => (
          <div key={hb.kode} className="bg-white rounded-xl border border-zinc-200 p-4 shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                {hb.kode}
              </span>
              <Wheat className="w-4 h-4 text-amber-600" />
            </div>
            <div className="font-bold text-zinc-900 text-sm">{hb.nama}</div>
            <div className="text-2xl font-black text-amber-800 tracking-tight">
              {hb.stok.toLocaleString('id-ID')} <span className="text-xs font-medium text-zinc-500">{hb.satuan}</span>
            </div>
            <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500 flex justify-between">
              <span>HPP Patokan:</span>
              <span className="font-semibold text-zinc-700">{formatRupiah(hb.hargaBeliStandar)} / {hb.satuan}</span>
            </div>
            <div className="text-[10px] text-zinc-400">
              Update: {formatTanggalIndo(hb.updateTerakhir)} · {formatJamIndo(hb.updateTerakhir)}
            </div>
          </div>
        ))}
      </div>

      {/* History Pembelian Hasil Bumi Masuk */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Timbangan & Pembelian Masuk Terbaru</h2>
          </div>
          <span className="text-xs text-zinc-500">{pembelianList.length} Transaksi Tercatat</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">NO NOTA</th>
                <th className="py-3 px-4">TANGGAL/JAM</th>
                <th className="py-3 px-4">PETANI / SUPPLIER</th>
                <th className="py-3 px-4">KOMODITAS</th>
                <th className="py-3 px-4 text-right">BERAT KOTOR</th>
                <th className="py-3 px-4 text-center">RAFAKSI</th>
                <th className="py-3 px-4 text-right">BERAT BERSIH</th>
                <th className="py-3 px-4 text-right">HARGA / KG</th>
                <th className="py-3 px-4 text-right">TOTAL (RP)</th>
                <th className="py-3 px-4 text-center">METODE / STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {pembelianList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-zinc-400">
                    Belum ada riwayat pembelian hasil bumi
                  </td>
                </tr>
              ) : (
                pembelianList.map((pb) => (
                  <tr key={pb.noPembelian} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-zinc-900">{pb.noPembelian}</td>
                    <td className="py-3 px-4 text-zinc-500">
                      {pb.tanggal} · {pb.jam}
                    </td>
                    <td className="py-3 px-4 font-semibold text-zinc-900">{pb.namaMitra}</td>
                    <td className="py-3 px-4">{pb.komoditasNama}</td>
                    <td className="py-3 px-4 text-right font-mono">{pb.beratKotor.toLocaleString('id-ID')} Kg</td>
                    <td className="py-3 px-4 text-center text-rose-600 font-mono">-{pb.potonganRafaksi}%</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-zinc-900">
                      {pb.beratBersih.toLocaleString('id-ID')} Kg
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-600">{formatRupiah(pb.hargaPerKg)}</td>
                    <td className="py-3 px-4 text-right font-bold text-amber-900">{formatRupiah(pb.totalNominal)}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          pb.status === 'LUNAS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {pb.metodePembayaran} ({pb.status})
                      </span>
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
