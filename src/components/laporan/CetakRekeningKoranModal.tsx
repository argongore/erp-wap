import React, { useState } from 'react';
import {
  Printer,
  X,
  Copy,
  Download,
  Check,
  FileText,
  AlertCircle,
  Building2,
  Calendar,
  User,
  Phone,
  MapPin,
} from 'lucide-react';
import { RekeningKoranMitraSummary } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';

interface Props {
  statement: RekeningKoranMitraSummary | null;
  onClose: () => void;
}

export const CetakRekeningKoranModal: React.FC<Props> = ({ statement, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [printWarning, setPrintWarning] = useState('');

  if (!statement) return null;

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const noDokumen = `RK/${statement.kodeMitra}/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}/${statement.history.length}`;

  const handlePrint = () => {
    setPrintWarning('');
    try {
      window.print();
    } catch (err: unknown) {
      console.warn('Window print error:', err);
      setPrintWarning(
        'Dialog cetak browser dibatasi oleh keamanan iframe. Anda dapat menggunakan tombol "Salin WhatsApp" atau "Download File".'
      );
    }
  };

  const generateTextSummary = () => {
    const divider = '==================================================';
    const lines = [
      `*REKENING KORAN & BUKU BESAR MITRA*`,
      `*PT WIJAYA AGRO - Blitar, Jawa Timur*`,
      `Tanggal Cetak: ${tglCetak} jam ${jamCetak} WIB`,
      `No. Dokumen: ${noDokumen}`,
      divider,
      `*IDENTITAS MITRA:*`,
      `Nama: ${statement.namaMitra} (${statement.kodeMitra})`,
      `Kategori: ${statement.role} | Status: ${statement.status}`,
      `Telepon: ${statement.telepon}`,
      `Alamat: ${statement.alamat}`,
      divider,
      `*RINGKASAN SALDO:*`,
      `• Kasbon Barang Toko : ${formatRupiah(statement.totalKasbonBarang)}`,
      `• Kasbon Uang Tunai  : ${formatRupiah(statement.totalKasbonUang)}`,
      `• *TOTAL SISA BON*   : *${formatRupiah(statement.totalBonKeseluruhan)}*`,
      `• Titip Hasil Panen  : ${formatRupiah(statement.totalTitip)}`,
      divider,
      `*HISTORI MUTASI:*`,
    ];

    if (statement.history.length === 0) {
      lines.push('Belum ada catatan mutasi.');
    } else {
      statement.history.forEach((h, idx) => {
        const mutasiStr =
          h.debet > 0
            ? `+Bon: ${formatRupiah(h.debet)}`
            : h.kredit > 0
            ? `-Bayar: ${formatRupiah(h.kredit)}`
            : 'Rp 0';
        lines.push(
          `${idx + 1}. [${h.tanggal} ${h.jam}] ${h.jenis}\n   Ket: ${h.keterangan}\n   Mutasi: ${mutasiStr} | Saldo Bon: ${formatRupiah(h.saldoAkumulasi)}`
        );
      });
    }

    lines.push(divider);
    lines.push(`Total Sisa Hutang Bon: ${formatRupiah(statement.totalBonKeseluruhan)}`);
    lines.push(`Harap konfirmasi apabila terdapat ketidaksesuaian.`);
    lines.push(`_Dicetak resmi via ERP Wijaya Agro_`);

    return lines.join('\n');
  };

  const handleCopyWhatsApp = () => {
    const text = generateTextSummary();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleDownloadText = () => {
    const text = generateTextSummary();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Rekening_Koran_${statement.kodeMitra}_${statement.namaMitra.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white text-zinc-900 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]">
        {/* Modal Top Header (Interactive Actions) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 bg-zinc-900 text-white gap-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-400">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                Pratinjau &amp; Cetak Rekening Koran
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {statement.kodeMitra}
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Dokumen resmi buku besar mutasi kasbon &amp; hasil bumi mitra
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={handleCopyWhatsApp}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-emerald-100 transition-colors"
              title="Salin rekap mutasi dalam format pesan WhatsApp"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin!' : 'Salin WhatsApp'}</span>
            </button>

            <button
              onClick={handleDownloadText}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              title="Download file rekap (.txt)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Dokumen</span>
            </button>

            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {printWarning && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{printWarning}</span>
          </div>
        )}

        {/* Scrollable Printable Document Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-zinc-100">
          <div
            id="printable-rekening-koran"
            className="bg-white rounded-xl shadow-xs border border-zinc-200 p-6 sm:p-8 space-y-6 max-w-3xl mx-auto text-zinc-900"
          >
            {/* Kop Surat Resmi */}
            <div className="border-b-2 border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <Building2 className="w-6 h-6 text-emerald-800" />
                  <span className="text-xl font-black text-zinc-900 tracking-tight">PT WIJAYA AGRO</span>
                </div>
                <p className="text-xs font-semibold text-zinc-700 mt-0.5">
                  PERDAGANGAN SARANA PERTANIAN &amp; PEMBELIAN HASIL BUMI
                </p>
                <p className="text-[11px] text-zinc-500">
                  Jl. Raya Agro Industri No. 88, Wlingi, Blitar · Telp: (021) 8892-0192 · Email: admin@wijayaagro.com
                </p>
              </div>

              <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-200">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-200">
                  REKENING KORAN MITRA
                </span>
                <p className="text-[10px] font-mono text-zinc-500 mt-2">No. Dokumen: {noDokumen}</p>
                <p className="text-[10px] text-zinc-500">
                  Dicetak: {tglCetak} · {jamCetak} WIB
                </p>
              </div>
            </div>

            {/* Biodata Mitra */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2 text-zinc-500 text-[11px]">
                  <User className="w-3.5 h-3.5 text-zinc-400" />
                  <span>IDENTITAS MITRA / PETANI:</span>
                </div>
                <div className="text-sm font-bold text-zinc-900">
                  {statement.namaMitra}{' '}
                  <span className="text-xs font-normal text-zinc-500">({statement.kodeMitra})</span>
                </div>
                <div className="text-zinc-600">
                  Peran / Kategori: <strong className="text-zinc-900">{statement.role}</strong>
                </div>
                <div>
                  Status Akun:{' '}
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {statement.status}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 sm:border-l sm:border-zinc-200 sm:pl-4">
                <div className="flex items-center space-x-2 text-zinc-500 text-[11px]">
                  <Phone className="w-3.5 h-3.5 text-zinc-400" />
                  <span>KONTAK &amp; ALAMAT:</span>
                </div>
                <div className="text-zinc-700">
                  Kontak Telp / WA: <span className="font-mono font-semibold">{statement.telepon}</span>
                </div>
                <div className="flex items-start space-x-1.5 text-zinc-600">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                  <span>{statement.alamat || 'Tidak ada alamat tercatat'}</span>
                </div>
              </div>
            </div>

            {/* Saldo Summary Cards (Print Friendly) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="text-[10px] font-bold text-zinc-500 uppercase">Kasbon Barang</span>
                <p className="text-sm font-bold text-zinc-900 mt-0.5">
                  {formatRupiah(statement.totalKasbonBarang)}
                </p>
                <span className="text-[9px] text-zinc-500">Pupuk &amp; obat saprotan</span>
              </div>

              <div className="p-3 bg-rose-50/50 rounded-lg border border-rose-200">
                <span className="text-[10px] font-bold text-rose-700 uppercase">Kasbon Uang</span>
                <p className="text-sm font-bold text-rose-800 mt-0.5">
                  {formatRupiah(statement.totalKasbonUang)}
                </p>
                <span className="text-[9px] text-rose-600">Pinjaman tunai aktif</span>
              </div>

              <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-300">
                <span className="text-[10px] font-bold text-amber-900 uppercase">TOTAL SISA BON</span>
                <p className="text-base font-black text-amber-950 mt-0.5">
                  {formatRupiah(statement.totalBonKeseluruhan)}
                </p>
                <span className="text-[9px] font-semibold text-amber-800">Total piutang mitra</span>
              </div>

              <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200">
                <span className="text-[10px] font-bold text-purple-900 uppercase">Titip Hasil Bumi</span>
                <p className="text-sm font-bold text-purple-950 mt-0.5">
                  {formatRupiah(statement.totalTitip)}
                </p>
                <span className="text-[9px] text-purple-700">Hasil panen belum cair</span>
              </div>
            </div>

            {/* Tabel Rincian Mutasi Kronologis */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
                  Rincian Mutasi Transaksi ({statement.history.length} Catatan)
                </span>
                <span className="text-zinc-500 text-[10px]">Mata Uang: IDR (Rupiah)</span>
              </div>

              <div className="border border-zinc-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-zinc-100 text-zinc-700 font-bold uppercase text-[9px] border-b border-zinc-200">
                    <tr>
                      <th className="py-2.5 px-3">TGL &amp; JAM</th>
                      <th className="py-2.5 px-3">NO. TRANSAKSI</th>
                      <th className="py-2.5 px-3">JENIS TRANSAKSI</th>
                      <th className="py-2.5 px-3">URAIAN / KETERANGAN</th>
                      <th className="py-2.5 px-3 text-right">MUTASI BON (+)</th>
                      <th className="py-2.5 px-3 text-right">BAYAR BON (-)</th>
                      <th className="py-2.5 px-3 text-right">SALDO BON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 text-zinc-800 text-[11px]">
                    {statement.history.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-zinc-400">
                          Belum ada histori transaksi untuk mitra ini
                        </td>
                      </tr>
                    ) : (
                      statement.history.map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-50/50">
                          <td className="py-2.5 px-3 text-zinc-500 whitespace-nowrap text-[10px]">
                            {row.tanggal} {row.jam}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-zinc-900 whitespace-nowrap">
                            {row.id}
                          </td>
                          <td className="py-2.5 px-3 font-semibold whitespace-nowrap">
                            {row.jenis.replace(/_/g, ' ')}
                          </td>
                          <td className="py-2.5 px-3 max-w-[200px] text-zinc-600">{row.keterangan}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                            {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                            {row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-900">
                            {formatRupiah(row.saldoAkumulasi)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {statement.history.length > 0 && (
                    <tfoot className="bg-zinc-50 border-t-2 border-zinc-300 font-bold text-xs text-zinc-900">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right uppercase">
                          Saldo Akhir Bon Mitra:
                        </td>
                        <td colSpan={3} className="py-2.5 px-3 text-right font-mono text-amber-900 text-sm">
                          {formatRupiah(statement.totalBonKeseluruhan)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Kolom Tanda Tangan Resmi */}
            <div className="pt-6 border-t border-dashed border-zinc-300 grid grid-cols-2 text-center text-xs text-zinc-600 gap-8">
              <div>
                <p className="font-semibold text-zinc-800">Bagian Keuangan / Kasir</p>
                <p className="text-[10px] text-zinc-500">PT Wijaya Agro</p>
                <div className="h-16 flex items-end justify-center">
                  <div className="border-b border-zinc-400 w-40 text-center text-[10px] text-zinc-400 pb-0.5">
                    ( Tanda Tangan &amp; Cap )
                  </div>
                </div>
              </div>

              <div>
                <p className="font-semibold text-zinc-800">Mitra / Petani Penerima</p>
                <p className="text-[10px] text-zinc-500">Konfirmasi Saldo Mutasi</p>
                <div className="h-16 flex items-end justify-center">
                  <div className="border-b border-zinc-400 w-40 text-center font-semibold text-zinc-800 pb-0.5">
                    ( {statement.namaMitra} )
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center text-[10px] text-zinc-400 border-t border-zinc-100 pt-3">
              Catatan: Dokumen mutasi ini sah dan diterbitkan secara elektronik oleh Sistem ERP PT Wijaya Agro.
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-zinc-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-500">
            Total Kewajiban Bon: <strong className="text-amber-900 font-bold">{formatRupiah(statement.totalBonKeseluruhan)}</strong>
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            >
              Tutup Pratinjau
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Sekarang</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
