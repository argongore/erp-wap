import React, { useState } from 'react';
import { Printer, Copy, Check, Download, X, Wallet, Building2, User, CheckCircle2 } from 'lucide-react';
import { TransaksiPenggajian } from '../../server/types.ts';

interface SlipGajiModalProps {
  slip: TransaksiPenggajian | null;
  onClose: () => void;
}

export const SlipGajiModal: React.FC<SlipGajiModalProps> = ({ slip, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!slip) return null;

  const formatRupiah = (val: number) => {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      handleCopyText();
    }
  };

  const generateTextSummary = () => {
    return `*SLIP GAJI KARYAWAN - PT WIJAYA AGRO*
=========================================
No. Slip : ${slip.slipNomor}
Tanggal  : ${slip.tanggal} ${slip.jam} WIB
Periode  : ${slip.periodeBulan}
Divisi   : ${slip.divisi || 'Gudang Wijaya Agro'} (${slip.tipeGaji || 'Harian'})
-----------------------------------------
*DATA KARYAWAN*
NIK      : ${slip.nikKaryawan}
Nama     : ${slip.namaKaryawan}
Jabatan  : ${slip.jabatan}
Bagian   : ${slip.departemen}
Penugasan: ${slip.divisi || 'Gudang Wijaya Agro'}
-----------------------------------------
*PENGHASILAN (KOTOR)*
• Upah Pokok/Harian : ${formatRupiah(slip.gajiPokok)}
• Tunjangan Tetap   : ${formatRupiah(slip.tunjangan)}
• Bonus/Lembur      : ${formatRupiah(slip.bonus)}
*Total Gaji Kotor   : ${formatRupiah(slip.totalGajiKotor)}*
-----------------------------------------
*POTONGAN KASBON*
• Kasbon Awal       : ${formatRupiah(slip.totalKasbonAwal)}
• Potongan Kasbon   : -${formatRupiah(slip.potonganKasbon)} (${slip.persentasePotongKasbon}%)
• Sisa Kasbon Akhir : ${formatRupiah(slip.sisaKasbonAkhir)}
-----------------------------------------
*TOTAL GAJI BERSIH (TAKE HOME PAY)*
>>> ${formatRupiah(slip.gajiBersihDibayar)} <<<
-----------------------------------------
Metode  : ${slip.metodePembayaran} (${slip.rekeningSumber})
Status  : LUNAS & DIBAYARKAN

_Dokumen ini merupakan slip upah/gaji resmi PT Wijaya Agro._`;
  };

  const handleCopyText = async () => {
    const text = generateTextSummary();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (e) {
      console.error('Clipboard copy failed:', e);
    }
  };

  const handleDownload = () => {
    const text = generateTextSummary();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Slip_Gaji_${slip.nikKaryawan}_${slip.periodeBulan.replace(/\s+/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden text-zinc-100 flex flex-col max-h-[92vh]">
        {/* Modal Top Bar */}
        <div className="p-4 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <h2 className="font-semibold text-zinc-100">Slip Gaji & Bukti Potong Kasbon</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-zinc-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Printable Slip Document */}
        <div className="p-6 overflow-y-auto flex-1 bg-zinc-950/80">
          <div
            id="printable-slip-gaji"
            className="bg-white text-zinc-900 p-6 rounded-lg shadow-sm border border-zinc-200 text-xs font-sans"
          >
            {/* Kop Surat PT Wijaya Agro */}
            <div className="border-b-2 border-zinc-900 pb-3 mb-4 text-center relative">
              <h1 className="text-xl font-black tracking-wider text-emerald-900">
                PT WIJAYA AGRO NUSANTARA
              </h1>
              <p className="text-[11px] text-zinc-600 font-medium">
                Pusat Sarana Produksi Pertanian, Saprotan & Perdagangan Komoditas Hasil Bumi
              </p>
              <p className="text-[10px] text-zinc-500">
                Jl. Raya Agro Niaga No. 88, Blitar, Jawa Timur | Telp: (0342) 889900 | WA: 0812-3456-7890
              </p>
              <div className="mt-2 inline-block bg-zinc-900 text-white font-bold px-4 py-0.5 rounded text-[11px] tracking-wide uppercase">
                SLIP GAJI KARYAWAN & POTONGAN KASBON
              </div>
            </div>

            {/* Nomor & Periode */}
            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-200 text-[11px]">
              <div>
                <p className="text-zinc-500">Nomor Dokumen Slip:</p>
                <p className="font-mono font-bold text-zinc-900">{slip.slipNomor}</p>
                <p className="text-zinc-500 mt-1">Tanggal Bayar:</p>
                <p className="font-semibold text-zinc-800">{slip.tanggal} pk {slip.jam} WIB</p>
              </div>
              <div className="text-right">
                <p className="text-zinc-500">Periode Penggajian:</p>
                <p className="text-emerald-800 font-bold text-sm uppercase">{slip.periodeBulan}</p>
                <p className="text-zinc-500 mt-1">Metode & Rekening:</p>
                <p className="font-semibold text-zinc-800">{slip.metodePembayaran} ({slip.rekeningSumber})</p>
              </div>
            </div>

            {/* Biodata Karyawan */}
            <div className="bg-zinc-50 p-3 rounded border border-zinc-200 my-3 text-[11px] grid grid-cols-2 gap-3">
              <div>
                <span className="text-zinc-500 block">NIK / ID Karyawan:</span>
                <span className="font-mono font-bold text-zinc-900">{slip.nikKaryawan}</span>
                <span className="text-zinc-500 block mt-1">Nama Lengkap:</span>
                <span className="font-bold text-zinc-900 text-xs">{slip.namaKaryawan}</span>
              </div>
              <div>
                <span className="text-zinc-500 block">Jabatan / Posisi:</span>
                <span className="font-semibold text-zinc-800">{slip.jabatan} ({slip.departemen})</span>
                <span className="text-zinc-500 block mt-1">Divisi Penugasan Hari Ini:</span>
                <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block text-[11px]">
                  {slip.divisi || 'Gudang Wijaya Agro'}
                </span>
                <span className="ml-2 text-zinc-600 text-[10px]">[{slip.tipeGaji || 'HARIAN'}]</span>
              </div>
            </div>

            {/* Tabel Rincian Gaji & Potongan */}
            <div className="grid grid-cols-2 gap-4 my-4">
              {/* Kolom Kiri: Penerimaan */}
              <div className="border border-zinc-200 rounded overflow-hidden">
                <div className="bg-emerald-50 px-3 py-1.5 font-bold text-emerald-900 text-[11px] border-b border-emerald-100 flex justify-between">
                  <span>1. PENGHASILAN</span>
                  <span>JUMLAH</span>
                </div>
                <div className="p-3 space-y-2 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Upah Pokok / Harian:</span>
                    <span className="font-mono font-semibold">{formatRupiah(slip.gajiPokok)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Tunjangan Tetap:</span>
                    <span className="font-mono font-semibold">{formatRupiah(slip.tunjangan)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Bonus / Lembur:</span>
                    <span className="font-mono font-semibold">{formatRupiah(slip.bonus)}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-200 flex justify-between font-bold text-emerald-950">
                    <span>Total Penghasilan Kotor:</span>
                    <span className="font-mono">{formatRupiah(slip.totalGajiKotor)}</span>
                  </div>
                </div>
              </div>

              {/* Kolom Kanan: Potongan Kasbon */}
              <div className="border border-zinc-200 rounded overflow-hidden">
                <div className="bg-rose-50 px-3 py-1.5 font-bold text-rose-900 text-[11px] border-b border-rose-100 flex justify-between">
                  <span>2. POTONGAN KASBON</span>
                  <span>JUMLAH</span>
                </div>
                <div className="p-3 space-y-2 text-[11px]">
                  <div className="flex justify-between text-zinc-500">
                    <span>Total Bon Awal:</span>
                    <span className="font-mono">{formatRupiah(slip.totalKasbonAwal)}</span>
                  </div>
                  <div className="flex justify-between text-rose-700 font-semibold">
                    <span>Potong Bon ({slip.persentasePotongKasbon}%):</span>
                    <span className="font-mono font-bold">-{formatRupiah(slip.potonganKasbon)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>Sisa Bon Berikutnya:</span>
                    <span className="font-mono">{formatRupiah(slip.sisaKasbonAkhir)}</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-200 flex justify-between font-bold text-rose-950">
                    <span>Total Potongan:</span>
                    <span className="font-mono">-{formatRupiah(slip.potonganKasbon)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Take Home Pay */}
            <div className="bg-emerald-900 text-white p-3.5 rounded-lg flex items-center justify-between mb-4 shadow-xs">
              <div>
                <p className="text-[10px] font-bold tracking-wider uppercase text-emerald-200">
                  GAJI BERSIH DITERIMA KARYAWAN (TAKE HOME PAY)
                </p>
                <p className="text-[11px] text-emerald-100">
                  Ditransfer / dibayarkan via rekening <span className="font-bold underline">{slip.rekeningSumber}</span>
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-black font-mono tracking-tight">
                  {formatRupiah(slip.gajiBersihDibayar)}
                </span>
                <span className="block text-[10px] text-emerald-300 font-semibold">
                  STATUS: LUNAS & DIBAYAR
                </span>
              </div>
            </div>

            {/* Kolom Tanda Tangan */}
            <div className="grid grid-cols-2 gap-8 text-center pt-3 border-t border-zinc-200 text-[11px]">
              <div>
                <p className="text-zinc-500 mb-12">Kasir / Keuangan PT Wijaya Agro</p>
                <div className="border-t border-zinc-400 inline-block px-8 pt-1 font-bold text-zinc-800">
                  ( Bagian Keuangan / Kasir )
                </div>
              </div>
              <div>
                <p className="text-zinc-500 mb-12">Penerima Gaji (Karyawan)</p>
                <div className="border-t border-zinc-400 inline-block px-8 pt-1 font-bold text-zinc-800">
                  ( {slip.namaKaryawan} )
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 bg-zinc-800/90 border-t border-zinc-700 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Slip Gaji</span>
            </button>
            <button
              onClick={handleCopyText}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                copied
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 border-zinc-600'
              }`}
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Tersalin!' : 'Salin WhatsApp'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-600 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download (.txt)</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
