import React, { useState, useEffect } from 'react';
import { Printer, Copy, Check, Download, X, Wallet, Building2, User, CheckCircle2, Receipt } from 'lucide-react';
import { TransaksiPenggajian, CatatanUpahHarian, ProfilPerusahaan } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { DownloadHistoryGajiButton } from './DownloadHistoryGajiButton.tsx';
import { PrintReceiptModal, ReceiptData } from '../common/PrintReceiptModal.tsx';
import { buildThermalReceiptFromSlipGaji } from '../../utils/thermalPayrollReceipt.ts';

interface SlipGajiModalProps {
  slip: TransaksiPenggajian | null;
  onClose: () => void;
}

const HARI_INDO = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
function getNamaHariIndo(dmy?: string): string {
  if (!dmy) return '-';
  const parts = dmy.split('/');
  if (parts.length !== 3) return '-';
  const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  if (Number.isNaN(d.getTime())) return '-';
  return HARI_INDO[d.getDay()] || '-';
}

export const SlipGajiModal: React.FC<SlipGajiModalProps> = ({ slip, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [rincianKerja, setRincianKerja] = useState<CatatanUpahHarian[]>([]);
  const [profilPerusahaan, setProfilPerusahaan] = useState<ProfilPerusahaan | null>(null);
  const [thermalReceipt, setThermalReceipt] = useState<ReceiptData | null>(null);

  useEffect(() => {
    if (!slip) {
      setRincianKerja([]);
      setThermalReceipt(null);
      return;
    }
    api
      .getProfilPerusahaan()
      .then((p) => {
        if (p) setProfilPerusahaan(p);
      })
      .catch(() => null);
    api
      .getUpahHarian()
      .then((list) => {
        if (!Array.isArray(list)) return;
        const idSet = new Set(slip.daftarUpahHarianIds || []);
        let matched = list.filter(
          (u) =>
            u.idKaryawan === slip.idKaryawan &&
            (idSet.has(u.id) || u.idPayrollSettlement === slip.id)
        );
        if (matched.length === 0 && slip.tanggal) {
          const slipParts = slip.tanggal.split('/');
          if (slipParts.length === 3) {
            const [, sm, sy] = slipParts;
            matched = list.filter((u) => {
              if (u.idKaryawan !== slip.idKaryawan) return false;
              const uParts = (u.tanggalKerja || '').split('/');
              return uParts.length === 3 && uParts[1] === sm && uParts[2] === sy;
            });
          }
        }
        setRincianKerja(matched);
      })
      .catch(() => setRincianKerja([]));
  }, [slip]);

  if (!slip) return null;

  const handleOpenThermalSlip = () => {
    setThermalReceipt(buildThermalReceiptFromSlipGaji(slip, rincianKerja));
  };

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
    const nominalDititipkan = Math.max(0, Number(slip.nominalDititipkan) || 0);
    const hakSetelahPotong =
      slip.hakGajiSetelahPotongBon !== undefined
        ? Number(slip.hakGajiSetelahPotongBon) || 0
        : Math.max(0, (Number(slip.totalGajiKotor) || 0) - (Number(slip.potonganKasbon) || 0));

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
*POTONGAN PIUTANG / KASBON*
• Piutang/Bon Awal  : ${formatRupiah(slip.totalKasbonAwal)}
• Potongan Piutang  : -${formatRupiah(slip.potonganKasbon)}${slip.persentasePotongKasbon ? ` (${slip.persentasePotongKasbon}%)` : ''}
• Sisa Piutang Akhir: ${formatRupiah(slip.sisaKasbonAkhir)}
-----------------------------------------${
      nominalDititipkan > 0
        ? `
*ALOKASI SISA GAJI*
• Hak Gaji Bersih   : ${formatRupiah(hakSetelahPotong)}
• Dititipkan (Titip): ${formatRupiah(nominalDititipkan)}
-----------------------------------------
*UANG DIAMBIL (CASH / TRANSFER)*`
        : `
*TOTAL GAJI BERSIH (TAKE HOME PAY)*`
    }
>>> ${formatRupiah(slip.gajiBersihDibayar)} <<<
-----------------------------------------
Metode  : ${nominalDititipkan > 0 && slip.gajiBersihDibayar === 0 ? 'TITIP 100% (SALDO TITIPAN)' : `${slip.metodePembayaran} (${slip.rekeningSumber})`}
Status  : ${nominalDititipkan > 0 ? (slip.gajiBersihDibayar === 0 ? 'LUNAS · 100% DITITIPKAN' : 'LUNAS · CAIR + TITIP SISA') : 'LUNAS & DIBAYARKAN'}

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
              <h1 className="text-xl font-black tracking-wider text-emerald-900 uppercase">
                {profilPerusahaan?.namaPerusahaan || 'PT. WIJAYA AGRO PERKASA'}
              </h1>
              <p className="text-[11px] text-zinc-600 font-medium">
                {profilPerusahaan?.catatanHeaderNota ||
                  profilPerusahaan?.badanHukum ||
                  'Pusat Sarana Produksi Pertanian, Saprotan & Perdagangan Komoditas Hasil Bumi'}
              </p>
              <p className="text-[10px] text-zinc-500">
                {profilPerusahaan?.alamat || '-'}
                {profilPerusahaan?.telepon ? ` | Telp: ${profilPerusahaan.telepon}` : ''}
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

            {/* 3. Rincian Kerja Harian */}
            {rincianKerja.length > 0 && (
              <div className="border border-zinc-200 rounded-lg overflow-hidden mb-4">
                <div className="bg-zinc-100 px-3 py-1.5 font-bold text-zinc-800 text-[11px] flex justify-between">
                  <span>3. RINCIAN KERJA HARIAN ({rincianKerja.length} Hari)</span>
                  <span>UPAH</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                        <th className="py-1.5 px-2.5">Tanggal &amp; Hari</th>
                        <th className="py-1.5 px-2.5">Jenis Kerjaan</th>
                        <th className="py-1.5 px-2.5">Detail / Keterangan</th>
                        <th className="py-1.5 px-2.5 text-right">Gaji</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {rincianKerja.map((u) => (
                        <tr key={u.id}>
                          <td className="py-1.5 px-2.5 font-mono whitespace-nowrap">
                            {u.tanggalKerja} ({getNamaHariIndo(u.tanggalKerja)})
                            {(u as any).jam ? ` · ${(u as any).jam}` : ''}
                          </td>
                          <td className="py-1.5 px-2.5 font-semibold text-zinc-800">
                            {(u as any).pekerjaan || u.divisi}
                          </td>
                          <td className="py-1.5 px-2.5 text-zinc-600">
                            {u.keterangan || '-'}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold text-emerald-800">
                            {formatRupiah(u.totalUpahHarian)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Alokasi Titipan Sisa Gaji (jika ada) */}
            {(Number(slip.nominalDititipkan) || 0) > 0 && (
              <div className="bg-amber-50 border border-amber-300 text-amber-950 p-3 rounded-lg mb-3 text-[11px] space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Hak Gaji Bersih (Setelah Potong Piutang/Bon):</span>
                  <span className="font-mono">
                    {formatRupiah(
                      slip.hakGajiSetelahPotongBon !== undefined
                        ? slip.hakGajiSetelahPotongBon
                        : Math.max(0, (Number(slip.totalGajiKotor) || 0) - (Number(slip.potonganKasbon) || 0))
                    )}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-amber-900">
                  <span>Dititipkan ke Saldo Titipan Karyawan/Mitra ({slip.idTitipanGajiTerkait || 'TIT01'}):</span>
                  <span className="font-mono">{formatRupiah(Number(slip.nominalDititipkan) || 0)}</span>
                </div>
              </div>
            )}

            {/* Total Take Home Pay */}
            <div className="bg-emerald-900 text-white p-3.5 rounded-lg flex items-center justify-between mb-4 shadow-xs">
              <div>
                <p className="text-[10px] font-bold tracking-wider uppercase text-emerald-200">
                  {(Number(slip.nominalDititipkan) || 0) > 0
                    ? 'UANG GAJI DIAMBIL (CASH / TRANSFER)'
                    : 'GAJI BERSIH DITERIMA KARYAWAN (TAKE HOME PAY)'}
                </p>
                <p className="text-[11px] text-emerald-100">
                  {(Number(slip.nominalDititipkan) || 0) > 0 && slip.gajiBersihDibayar === 0 ? (
                    <>Seluruh sisa gaji dititipkan ke <span className="font-bold underline">Saldo Titipan (TIT01)</span></>
                  ) : (
                    <>Ditransfer / dibayarkan via rekening <span className="font-bold underline">{slip.rekeningSumber}</span></>
                  )}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-black font-mono tracking-tight">
                  {formatRupiah(slip.gajiBersihDibayar)}
                </span>
                <span className="block text-[10px] text-emerald-300 font-semibold">
                  {(Number(slip.nominalDititipkan) || 0) > 0
                    ? slip.gajiBersihDibayar === 0
                      ? 'STATUS: LUNAS · 100% DITITIPKAN'
                      : 'STATUS: LUNAS · CAIR + TITIP SISA'
                    : 'STATUS: LUNAS & DIBAYAR'}
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenThermalSlip}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer"
              title="Cetak struk thermal 80mm / 58mm lengkap dengan rincian per hari kerja (USB / Bluetooth / RawBT)"
            >
              <Receipt className="w-4 h-4" />
              <span>Cetak Thermal (80mm/58mm)</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak A4</span>
            </button>
            <button
              onClick={handleCopyText}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
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
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs font-medium border border-zinc-600 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download (.txt)</span>
            </button>
            <DownloadHistoryGajiButton
              idKaryawan={slip.idKaryawan}
              namaKaryawan={slip.namaKaryawan}
              variant="sky"
              label="Unduh History Gaji"
            />
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      <PrintReceiptModal
        receipt={thermalReceipt}
        onClose={() => setThermalReceipt(null)}
        profilPerusahaan={profilPerusahaan}
      />
    </div>
  );
};
