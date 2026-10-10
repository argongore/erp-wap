import React, { useState } from 'react';
import { Wheat, TrendingUp, History, Scale, PlusCircle, Sparkles, Layers } from 'lucide-react';
import { StokHasilBumi, TransaksiPembelianHasilBumi } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo, formatJamIndo } from '../../utils/format.ts';
import { ModalInputStokAwalHasilBumi } from './ModalInputStokAwalHasilBumi.tsx';

interface Props {
  stokList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  onRefresh: () => void;
}

export const StokHasilBumiView: React.FC<Props> = ({ stokList, pembelianList, onRefresh }) => {
  // Filter out KOPI JALAN
  const activeStokList = stokList.filter(
    (h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN')
  );

  const [showSaldoAwalModal, setShowSaldoAwalModal] = useState(false);
  const [selectedModalKode, setSelectedModalKode] = useState<string | undefined>(undefined);

  const totalVolumeKg = activeStokList.reduce((s, h) => s + h.stok, 0);

  // Total uang modal keluar seluruh pembelian hasil bumi (termasuk saldo awal manual lama)
  const totalModalAwalSemua = activeStokList.reduce(
    (sum, h) => sum + (h.modalAwalTotal || ((h.stokAwal || 0) * (h.rataRataModalAwal || 0))),
    0
  );
  const totalStokAwalSemuaKg = activeStokList.reduce((sum, h) => sum + (h.stokAwal || 0), 0);

  const totalPembelianBaruUang = pembelianList.reduce((sum, p) => sum + (p.totalNominal || 0), 0);
  const totalPembelianBaruKg = pembelianList.reduce((sum, p) => sum + (p.beratBersih || 0), 0);

  const totalSeluruhUangKeluar = totalModalAwalSemua + totalPembelianBaruUang;
  const totalSeluruhKgBeli = totalStokAwalSemuaKg + totalPembelianBaruKg;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Stok Hasil Bumi &amp; Komoditas Pertanian</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              MODUL 7
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Persediaan fisik komoditas panen petani di gudang (Saldo Rekap Lama + Pembelian Berjalan Realtime)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSelectedModalKode(undefined);
              setShowSaldoAwalModal(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer"
          >
            <Scale className="w-4 h-4 text-amber-200" />
            <span>Input Rekap Stok Lama &amp; Modal Awal</span>
          </button>

          <div className="flex items-center space-x-4 text-right bg-white px-3.5 py-1.5 rounded-xl border border-zinc-200 shadow-2xs">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Total Fisik Gudang:</div>
              <div className="text-sm font-bold text-amber-900">
                {(totalVolumeKg / 1000).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}{' '}
                Ton ({totalVolumeKg.toLocaleString('id-ID')} Kg)
              </div>
            </div>
            <div className="pl-3 border-l border-zinc-200">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Total Modal Keluar:</div>
              <div className="text-sm font-bold text-emerald-800 font-mono">
                {formatRupiah(totalSeluruhUangKeluar)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Commodity Cards with Weighted Average Modal Cost (Total Uang Keluar ÷ Total Kg) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeStokList.map((hb, idx) => {
          const isKopiTitip = hb.kode === 'HB-08' || hb.isBelumPutusHarga;

          // Pembelian baru berjalan di aplikasi
          const purchases = pembelianList.filter(
            (p) =>
              p.komoditasKode === hb.kode ||
              p.komoditasNama.toUpperCase().trim() === hb.nama.toUpperCase().trim()
          );

          const totalUangKeluarBaru = purchases.reduce((sum, p) => sum + (p.totalNominal || 0), 0);
          const totalKgBeliBaru = purchases.reduce((sum, p) => sum + (p.beratBersih || 0), 0);

          // Saldo awal dari rekap manual lama sebelum aplikasi
          const stokAwalKg = hb.stokAwal || 0;
          const modalAwalUang = hb.modalAwalTotal || (stokAwalKg * (hb.rataRataModalAwal || 0));

          // Penggabungan untuk kalkulasi seimbang (balance)
          const totalUangKeluar = modalAwalUang + totalUangKeluarBaru;
          const totalKgBeli = stokAwalKg + totalKgBeliBaru;

          const rataRataModalPerKg =
            totalKgBeli > 0 && totalUangKeluar > 0
              ? Math.round(totalUangKeluar / totalKgBeli)
              : (hb.rataRataModalAwal || 0);

          return (
            <div
              key={hb.kode}
              className={`bg-white rounded-xl border p-4 shadow-2xs space-y-2.5 relative transition-all flex flex-col justify-between ${
                isKopiTitip ? 'border-amber-400 bg-amber-50/20 ring-1 ring-amber-300' : 'border-zinc-200'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    No {idx + 1}. {hb.kode}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-500">
                    {isKopiTitip ? (
                      <span className="text-amber-800 font-extrabold flex items-center space-x-1">
                        <span>☕ TITIP</span>
                      </span>
                    ) : (
                      <Wheat className="w-4 h-4 text-amber-600" />
                    )}
                  </span>
                </div>

                <div className="font-bold text-zinc-900 text-sm flex items-center justify-between">
                  <span>{hb.nama}</span>
                </div>

                {isKopiTitip && (
                  <div className="text-[10px] text-amber-800 font-semibold bg-amber-100/80 px-2 py-0.5 rounded inline-block">
                    BELUM PUTUS HARGA
                  </div>
                )}

                {/* Physical Stock in Warehouse */}
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-semibold block">Stok Fisik Gudang:</span>
                  <div className="text-2xl font-black text-amber-800 tracking-tight">
                    {hb.stok.toLocaleString('id-ID')} <span className="text-xs font-medium text-zinc-500">{hb.satuan}</span>
                  </div>
                </div>

                {/* RATA-RATA MODAL YANG DIKELUARKAN UNTUK MEMBELI (TOTAL UANG KELUAR ÷ TOTAL BARANG KG) */}
                <div className="p-2.5 bg-emerald-50/40 rounded-lg border border-emerald-200/80 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-700 font-bold">Rata-rata Modal Beli:</span>
                    <span className="font-extrabold font-mono text-emerald-800 text-xs">
                      {rataRataModalPerKg > 0 ? (
                        `${formatRupiah(rataRataModalPerKg)} / Kg`
                      ) : isKopiTitip ? (
                        'Mengambang (Titip)'
                      ) : (
                        'Rp 0 (Belum ada beli)'
                      )}
                    </span>
                  </div>

                  {stokAwalKg > 0 && (
                    <div className="text-[10px] bg-amber-100/70 text-amber-900 p-1 rounded font-semibold flex items-center justify-between">
                      <span>Rekap Lama: {stokAwalKg.toLocaleString('id-ID')} Kg</span>
                      <span>@ {formatRupiah(hb.rataRataModalAwal || 0)}</span>
                    </div>
                  )}

                  <div className="text-[10px] text-zinc-500 flex justify-between pt-1 border-t border-emerald-200/60">
                    <span>Total Uang Keluar:</span>
                    <span className="font-mono font-semibold text-zinc-800">{formatRupiah(totalUangKeluar)}</span>
                  </div>

                  <div className="text-[10px] text-zinc-500 flex justify-between">
                    <span>Total Barang Masuk:</span>
                    <span className="font-mono text-zinc-700 font-semibold">{totalKgBeli.toLocaleString('id-ID')} Kg</span>
                  </div>

                  <div className="text-[9px] text-emerald-800 bg-emerald-100/70 p-1 rounded font-mono text-center">
                    {totalKgBeli > 0 && totalUangKeluar > 0 ? (
                      `Rumus: ${formatRupiah(totalUangKeluar)} ÷ ${totalKgBeli.toLocaleString('id-ID')} Kg = ${formatRupiah(rataRataModalPerKg)}/Kg`
                    ) : (
                      'Total Uang Keluar ÷ Total Barang (Kg)'
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[10px]">
                <span className="text-zinc-400">
                  Update: {formatTanggalIndo(hb.updateTerakhir)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModalKode(hb.kode);
                    setShowSaldoAwalModal(true);
                  }}
                  className="font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer flex items-center space-x-1"
                >
                  <span>✏️ Input Saldo Awal</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* History Pembelian Hasil Bumi Masuk */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-amber-700" />
            <h2 className="text-sm font-bold text-zinc-900">Riwayat Timbangan &amp; Pembelian Masuk Terbaru</h2>
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
            <tbody className="divide-y divide-zinc-200">
              {pembelianList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-400">
                    Belum ada riwayat transaksi timbangan pembelian yang dicatat
                  </td>
                </tr>
              ) : (
                pembelianList.slice(0, 50).map((p) => {
                  const isBelumPutus = p.isBelumPutusHarga || p.status === 'BELUM_PUTUS_HARGA';
                  return (
                    <tr key={p.noPembelian} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-amber-900">{p.noPembelian}</td>
                      <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                        {p.tanggal} <span className="text-[10px] text-zinc-400">{p.jam}</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-zinc-800">{p.namaMitra}</td>
                      <td className="py-3 px-4 font-bold text-zinc-900">{p.komoditasNama}</td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-600">
                        {p.beratKotor.toLocaleString('id-ID')} Kg
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-zinc-500">{p.potonganRafaksi}%</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-900">
                        {p.beratBersih.toLocaleString('id-ID')} Kg
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-700">
                        {isBelumPutus ? (
                          <span className="text-amber-800 font-bold">Mengambang (Titip)</span>
                        ) : (
                          formatRupiah(p.hargaPerKg)
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                        {isBelumPutus && p.totalNominal === 0 ? (
                          <span className="text-amber-800">Rp 0 (Belum Putus)</span>
                        ) : (
                          formatRupiah(p.totalNominal)
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isBelumPutus
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Input Stok Awal & Modal Rekap Manual */}
      <ModalInputStokAwalHasilBumi
        isOpen={showSaldoAwalModal}
        onClose={() => setShowSaldoAwalModal(false)}
        stokList={stokList}
        pembelianList={pembelianList}
        onSuccess={onRefresh}
        initialSelectedKode={selectedModalKode}
      />
    </div>
  );
};
