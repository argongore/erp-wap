import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  DollarSign,
  ArrowRight,
  Info,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { formatRupiah } from '../../utils/format.ts';

interface ModalContohPatokanExcelProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectKaryawan?: (nama: string) => void;
}

const CONTOH_KARYAWAN_DATA = [
  {
    nama: 'WIWIT',
    jabatan: 'Tenaga Gudang & Surjal',
    divisi: 'CV WA & PTWAP',
    totalBulan: 5770000,
    totalHari: 26,
    keterangan: 'Tugas rutin kerja gudang CV WA (Rp 140.000) dan surjal PTWAP (Rp 100.000), ada catatan sakit setengah hari (0.5) dan lembur.',
    sampleRows: [
      { tgl: 'SELASA 01 SEP', div: 'CV WA', item: 'KERJA GUDANG', qty: 1, harga: 140000, jml: 140000, ket: 'BON', cat: '-' },
      { tgl: 'SELASA 01 SEP', div: 'PTWAP', item: 'SURJAL', qty: 0, harga: 0, jml: 0, ket: 'LUNAS', cat: '-' },
      { tgl: 'RABU 2 SEP', div: 'CV WA', item: 'KERJA GUDANG', qty: 1, harga: 140000, jml: 140000, ket: 'BON', cat: '-' },
      { tgl: 'JUMAT 4', div: 'PTWAP', item: 'SURJAL', qty: 2, harga: 100000, jml: 200000, ket: 'BON', cat: '-' },
      { tgl: 'KAMIS 10', div: 'CV WA', item: 'KERJA GUDANG', qty: 0.5, harga: 140000, jml: 70000, ket: 'BON', cat: 'SAKIT' },
      { tgl: 'SELASA 15', div: 'PTWAP', item: 'SURJAL', qty: 3, harga: 100000, jml: 300000, ket: 'BON', cat: '-' },
    ],
  },
  {
    nama: 'LAWI',
    jabatan: 'Tenaga Gudang & Rosting',
    divisi: 'GWA & OKUSSA',
    totalBulan: 2685000,
    totalHari: 24,
    keterangan: 'Tugas kerja gudang GWA (Rp 100.000 - Rp 110.000) dan lembur rosting beras premium Okussa (Rp 70.000).',
    sampleRows: [
      { tgl: 'SELASA 01 SEP', div: 'GWA', item: 'KERJA GUDANG', qty: 1, harga: 100000, jml: 100000, ket: 'BON', cat: '-' },
      { tgl: 'SABTU 5', div: 'GWA', item: 'KERJA GUDANG', qty: 1, harga: 100000, jml: 100000, ket: 'BON', cat: '-' },
      { tgl: 'SABTU 5', div: 'OKUSSA', item: 'LEMBUR', qty: 1, harga: 70000, jml: 70000, ket: 'BON', cat: 'ROSTING' },
      { tgl: 'SELASA 8', div: 'GWA', item: 'KERJA GUDANG', qty: 0, harga: 0, jml: 0, ket: 'BON', cat: 'LIBUR' },
      { tgl: 'SELASA 15', div: 'GWA', item: 'KERJA GUDANG', qty: 1, harga: 110000, jml: 110000, ket: 'BON', cat: '-' },
    ],
  },
  {
    nama: 'YUDA',
    jabatan: 'Tenaga Bongkar Muat & Gudang',
    divisi: 'GWA & WIJAYA KARYA',
    totalBulan: 2730000,
    totalHari: 25,
    keterangan: 'Tugas kerja gudang GWA (Rp 70.000 - Rp 75.000), ngebal gabah, lembur ngipas, dan bongkar muatan barang mobil Arya (Rp 50.000 - Rp 65.000).',
    sampleRows: [
      { tgl: 'SELASA 01 SEP', div: 'GWA', item: 'KERJA GUDANG', qty: 1, harga: 75000, jml: 75000, ket: 'BON', cat: '-' },
      { tgl: 'SABTU 5', div: 'GWA', item: 'LEMBUR', qty: 1, harga: 50000, jml: 50000, ket: 'BON', cat: 'NGIPAS' },
      { tgl: 'SELASA 8', div: 'WIJAYA KARYA', item: 'BONGKAR BARANG', qty: 1, harga: 50000, jml: 50000, ket: 'BON', cat: '-' },
      { tgl: 'RABU 16', div: 'GWA', item: 'LEMBUR', qty: 1, harga: 100000, jml: 100000, ket: 'BON', cat: 'NGEPAK BKF' },
      { tgl: 'RABU 16', div: 'WIJAYA KARYA', item: 'BONGKAR BARANG', qty: 2, harga: 50000, jml: 100000, ket: 'BON', cat: 'ARYA MIN' },
      { tgl: '29/07/2026', div: 'GWA', item: 'NGEBAL', qty: 1, harga: 70000, jml: 70000, ket: 'BON', cat: '-' },
    ],
  },
  {
    nama: 'SUKARMIN',
    jabatan: 'Driver Truk Logistik',
    divisi: 'WIJAYA TRANS',
    totalBulan: 800000,
    totalHari: 1,
    keterangan: 'Tugas pengemudi ekspedisi logistik armada truk Wijaya Transport, standby dan jalan ekspedisi kopi roni.',
    sampleRows: [
      { tgl: 'SELASA 01 SEP', div: 'WIJAYA TRANS', item: 'JALAN', qty: 0, harga: 0, jml: 0, ket: 'LUNAS', cat: 'SAKIT' },
      { tgl: 'SENIN 7', div: 'WIJAYA TRANS', item: 'JALAN', qty: 0, harga: 0, jml: 0, ket: 'BON', cat: 'SUDAH DI GAJ' },
      { tgl: 'SABTU 12', div: 'WIJAYA TRANS', item: 'DRIVER TRUK', qty: 1, harga: 800000, jml: 800000, ket: 'BON', cat: 'KOPI RONI' },
      { tgl: 'RABU 16', div: 'WIJAYA TRANS', item: 'JAJAN', qty: 0, harga: 0, jml: 0, ket: 'LUNAS', cat: '-' },
      { tgl: 'MINGGU 27', div: 'WIJAYA TRANS', item: 'JAJAN', qty: 0, harga: 0, jml: 0, ket: 'BON', cat: 'STAND BY' },
    ],
  },
];

export const ModalContohPatokanExcel: React.FC<ModalContohPatokanExcelProps> = ({
  isOpen,
  onClose,
  onSelectKaryawan,
}) => {
  const [activeKaryawanIdx, setActiveKaryawanIdx] = useState<number>(0);

  if (!isOpen) return null;

  const current = CONTOH_KARYAWAN_DATA[activeKaryawanIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh] animate-in fade-in">
        {/* Header Modal */}
        <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-950 text-emerald-400 rounded-lg border border-emerald-800">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                <span>Contoh Format Patokan Catatan Keuangan Gaji Harian Karyawan</span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-mono px-2 py-0.5 rounded border border-emerald-800">
                  PT WIJAYA AGRO PERKASA
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Gambaran detail gaji masing-masing karyawan yang di-input perhari dan dijadikan patokan penggajian
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* Employee Selection Chips */}
          <div className="flex flex-wrap gap-2 pb-2 border-b border-zinc-800">
            {CONTOH_KARYAWAN_DATA.map((k, idx) => {
              const isSelected = activeKaryawanIdx === idx;
              return (
                <button
                  key={k.nama}
                  type="button"
                  onClick={() => setActiveKaryawanIdx(idx)}
                  className={`px-3 py-2 rounded-xl text-left border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-amber-600 text-white border-amber-500 shadow-md font-bold'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
                  }`}
                >
                  <div className="font-bold text-xs">{k.nama}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">
                    Total: {formatRupiah(k.totalBulan)} ({k.divisi})
                  </div>
                </button>
              );
            })}
          </div>

          {/* Explanation Box */}
          <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-3.5 space-y-1.5 text-xs text-emerald-200">
            <div className="flex items-center space-x-2 font-bold text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Patokan Penggajian: Karyawan {current.nama} — Total Akumulasi Gaji: {formatRupiah(current.totalBulan)}
              </span>
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              {current.keterangan} Data ini sudah disinkronkan dan dapat langsung dilihat di <strong>Tab 1 (List Nama Karyawan &amp; Rekap Gaji)</strong> dengan menekan tombol <em>Format Excel Patokan</em> pada baris karyawan.
            </p>
          </div>

          {/* Authentic Excel Preview Box */}
          <div className="bg-zinc-950 border-2 border-emerald-900 rounded-xl overflow-hidden shadow-xl">
            {/* Kop Excel */}
            <div className="bg-gradient-to-r from-emerald-950 via-zinc-900 to-emerald-950 p-3.5 border-b border-emerald-800 text-center">
              <div className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase font-bold">
                CATATAN KEUANGAN
              </div>
              <h3 className="text-sm font-black text-white tracking-wider">
                PT WIJAYA AGRO PERKASA
              </h3>
              <p className="text-[11px] text-zinc-300 mt-0.5">
                LEMBAR CATATAN GAJI HARIAN KARYAWAN: <strong className="text-amber-400">{current.nama}</strong> ({current.divisi})
              </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-zinc-900 text-zinc-300 uppercase text-[10px] tracking-wider border-b-2 border-emerald-800">
                  <tr>
                    <th className="py-2 px-2 text-center border-r border-zinc-800 w-8">NO</th>
                    <th className="py-2 px-3 border-r border-zinc-800">TANGGAL</th>
                    <th className="py-2 px-3 border-r border-zinc-800">DIVISI</th>
                    <th className="py-2 px-3 border-r border-zinc-800">KARYAWAN</th>
                    <th className="py-2 px-3 border-r border-zinc-800">ITEM</th>
                    <th className="py-2 px-2 text-center border-r border-zinc-800 w-14">KUANTITI</th>
                    <th className="py-2 px-3 text-right border-r border-zinc-800">HARGA</th>
                    <th className="py-2 px-3 text-right border-r border-zinc-800">JUMLAH</th>
                    <th className="py-2 px-2 text-center border-r border-zinc-800 w-16">KET</th>
                    <th className="py-2 px-3">CATATAN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 font-mono text-[11px]">
                  {current.sampleRows.map((r, i) => (
                    <tr key={i} className="hover:bg-zinc-900/60 transition-colors">
                      <td className="py-1.5 px-2 text-center border-r border-zinc-800 text-zinc-500 text-[10px]">
                        {i + 1}
                      </td>
                      <td className="py-1.5 px-3 border-r border-zinc-800 whitespace-nowrap font-bold text-zinc-200">
                        {r.tgl}
                      </td>
                      <td className="py-1.5 px-3 border-r border-zinc-800 whitespace-nowrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {r.div}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 border-r border-zinc-800 font-sans font-bold text-zinc-300">
                        {current.nama}
                      </td>
                      <td className="py-1.5 px-3 border-r border-zinc-800 font-sans font-semibold text-zinc-100">
                        {r.item}
                      </td>
                      <td className="py-1.5 px-2 text-center border-r border-zinc-800 font-bold">
                        {r.qty}
                      </td>
                      <td className="py-1.5 px-3 text-right border-r border-zinc-800 text-zinc-400">
                        {r.harga > 0 ? formatRupiah(r.harga) : '-'}
                      </td>
                      <td className="py-1.5 px-3 text-right border-r border-zinc-800 font-bold text-emerald-400">
                        {r.jml > 0 ? formatRupiah(r.jml) : '-'}
                      </td>
                      <td className="py-1.5 px-2 text-center border-r border-zinc-800">
                        {r.ket === 'BON' ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500 text-zinc-950">
                            BON
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black bg-sky-500 text-white">
                            LUNAS
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 font-sans text-[11px] text-amber-300">
                        {r.cat}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-900 border-t-2 border-emerald-800 font-bold text-xs">
                  <tr>
                    <td colSpan={7} className="py-2.5 px-3 text-right uppercase text-zinc-300 border-r border-zinc-800">
                      TOTAL REKAP BULANAN PATOKAN {current.nama}:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm text-emerald-400 border-r border-zinc-800">
                      {formatRupiah(current.totalBulan)}
                    </td>
                    <td colSpan={2} className="py-2.5 px-3 text-[11px] text-zinc-400 font-sans">
                      Terakumulasi dari input harian berjalan
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Quick Guidance Column Mapping */}
          <div className="p-3 bg-zinc-800/80 rounded-xl border border-zinc-700 space-y-2">
            <h4 className="font-bold text-zinc-200 text-xs flex items-center space-x-1.5">
              <Info className="w-4 h-4 text-amber-400" />
              <span>Petunjuk Standarisasi Kolom Format Patokan:</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-zinc-400">
              <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-zinc-200 font-bold block">1. TANGGAL &amp; DIVISI</span>
                <span>Mencatat hari/tanggal kerja serta unit divisi penugasan (GWA, CV WA, WT, PTWAP, Okussa).</span>
              </div>
              <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-zinc-200 font-bold block">2. ITEM &amp; KUANTITI</span>
                <span>Pekerjaan riil (KERJA GUDANG, SURJAL, JALAN, DRIVER, NGEBAL). Qty 0 untuk Libur/Sakit.</span>
              </div>
              <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-zinc-200 font-bold block">3. HARGA &amp; JUMLAH</span>
                <span>Tarif upah harian dan hasil kali Qty x Harga yang diakumulasi ke total gaji bulanan.</span>
              </div>
              <div className="p-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <span className="text-zinc-200 font-bold block">4. STATUS (BON/LUNAS)</span>
                <span>Badge BON untuk hak upah berjalan sebelum dicairkan, LUNAS untuk hari libur atau upah yang telah dibayarkan.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-[11px] text-zinc-400">
            Pilih karyawan untuk melihat format dan rekapitulasi data patokan.
          </span>
          <div className="flex items-center space-x-2">
            {onSelectKaryawan && (
              <button
                type="button"
                onClick={() => {
                  onSelectKaryawan(current.nama);
                  onClose();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Buka Rekap {current.nama} di Tabel →</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
