import React, { useState, useEffect } from 'react';
import {
  Printer,
  AlertCircle,
  FileText,
  Copy,
  Check,
  Eye,
  LayoutTemplate,
  Building2,
  Calendar,
  User,
  Phone,
  MapPin,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  X,
  FileDown,
  Camera,
} from 'lucide-react';
import { Mitra, RekeningKoranMitraSummary } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { CetakRekeningKoranModal } from './CetakRekeningKoranModal.tsx';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';

// Generated authentic visual preview mockup
import rekeningKoranMockupImg from '../../assets/images/rekening_koran_preview_1790406863342.jpg';

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
  const [viewMode, setViewMode] = useState<'TABEL' | 'LEMBAR_CETAK'>('TABEL');
  const [showMockupPreview, setShowMockupPreview] = useState<boolean>(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{
    imageUrl: string;
    title: string;
    nomorBukti?: string;
    namaMitra?: string;
    tanggal?: string;
    nominalText?: string;
    keterangan?: string;
  } | null>(null);

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

  const now = new Date();
  const tglCetak = formatTanggalIndo(now.toISOString().split('T')[0]);
  const jamCetak = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Rekening Koran / Buku Besar Kasbon Mitra
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
              MODUL 8
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Rekap mutasi kasbon barang (pupuk/obat), kasbon uang tunai, setoran panen, dan pelunasan bon dengan kolom kuantitas (Qty) &amp; harga satuan
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Layout Mode Selector */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200 text-xs">
            <button
              onClick={() => setViewMode('TABEL')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'TABEL'
                  ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              <span>Tampilan Tabel</span>
            </button>
            <button
              onClick={() => setViewMode('LEMBAR_CETAK')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'LEMBAR_CETAK'
                  ? 'bg-indigo-600 text-white shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Format Lembar Cetak A4</span>
            </button>
          </div>

          {/* Button to view visual sample mockup */}
          <button
            onClick={() => setShowMockupPreview(!showMockupPreview)}
            className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            title="Lihat cuplikan gambar contoh rekening koran mitra / format backup harian"
          >
            <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
            <span>{showMockupPreview ? 'Tutup Cuplikan' : 'Cuplikan Dokumen Fisik'}</span>
          </button>

          {statement && (
            <button
              onClick={handleQuickCopy}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
              title="Salin rekap ringkas ke clipboard"
            >
              {quickCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-zinc-500" />}
              <span>{quickCopied ? 'Tersalin!' : 'Salin Rekap'}</span>
            </button>
          )}

          <button
            onClick={handlePrintClick}
            disabled={loading}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{loading ? 'Memuat Data...' : 'Cetak & PDF'}</span>
          </button>
        </div>
      </div>

      {/* Visual Sample Mockup Drawer / Card */}
      {showMockupPreview && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 sm:p-5 relative animate-in fade-in duration-200">
          <button
            onClick={() => setShowMockupPreview(false)}
            className="absolute top-3 right-3 text-amber-800 hover:text-amber-950 p-1 rounded-md hover:bg-amber-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col md:flex-row gap-5 items-start">
            <div className="md:w-80 shrink-0">
              <div className="rounded-lg overflow-hidden border border-amber-300 shadow-sm bg-white">
                <img
                  src={rekeningKoranMockupImg}
                  alt="Cuplikan Contoh Format Rekening Koran Mitra Harian"
                  className="w-full h-auto object-cover max-h-56"
                />
              </div>
              <span className="block text-[10px] text-amber-800/80 mt-1 text-center font-medium">
                Cuplikan Rekening Koran / Lembar Mutasi Harian
              </span>
            </div>

            <div className="space-y-2 text-xs text-amber-950">
              <h3 className="font-bold text-sm text-amber-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-700" />
                Format Rekening Koran Mitra Harian &amp; Kolom Quantity (Qty)
              </h3>
              <p className="text-zinc-700 leading-relaxed">
                Format tata letak di bawah ini telah disesuaikan agar persis menyerupai buku besar mutasi harian dan rekening koran fisik:
              </p>
              <ul className="list-disc list-inside space-y-1 text-zinc-700">
                <li>
                  <strong>Kop Surat &amp; Identitas Mitra:</strong> Mencantumkan nama PT Wijaya Agro, No. HP, alamat, status, dan role mitra petani.
                </li>
                <li>
                  <strong>Kolom Qty (Kuantitas) &amp; Harga Satuan:</strong> Kasbon barang toko (pupuk/obat) menampilkan jumlah sak/botol/kg beserta harga satuan. Untuk kasbon uang tunai, otomatis terisi <strong>Qty: 1 Trx</strong> dengan harga satuan nominal uang.
                </li>
                <li>
                  <strong>Debet (+) &amp; Kredit (-):</strong> Mutasi kasbon bertambah di kolom Debet, dan pembayaran/potongan hasil panen mengurangi di kolom Kredit.
                </li>
                <li>
                  <strong>Kolom Tanda Tangan:</strong> Pengesahan resmi dua arah antara Bagian Keuangan / Kasir dan Mitra Petani penerima.
                </li>
              </ul>
              <div className="pt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setViewMode('LEMBAR_CETAK')}
                  className="text-xs bg-amber-700 text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-800 transition-colors shadow-2xs"
                >
                  Beralih ke Format Lembar Cetak A4 Sekarang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Select Mitra Card */}
      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 max-w-md">
          <label className="block text-xs font-bold text-zinc-700 mb-1 uppercase tracking-wider">
            Pilih Nama Mitra / Petani:
          </label>
          <select
            value={currentMitraId}
            onChange={(e) => onSelectMitra(e.target.value)}
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-indigo-600 bg-white"
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
              Alamat: <span className="text-zinc-800 font-medium">{statement.alamat || '-'}</span>
            </div>
            <div>
              Kontak HP/WA: <span className="font-mono text-zinc-800">{statement.telepon || '-'}</span>
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

          {/* VIEW MODE 1: MODERN RESPONSIVE TABLE VIEW */}
          {viewMode === 'TABEL' && (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-zinc-900">
                    Buku Besar Mutasi: {statement.namaMitra} ({statement.kodeMitra})
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Daftar kronologis lengkap dengan kuantitas (Qty), harga satuan, dan rincian per barang
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 font-medium">
                    {statement.history.length} Catatan Transaksi
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3 w-24">TANGGAL &amp; JAM</th>
                      <th className="py-3 px-3 w-28">NO. BUKTI</th>
                      <th className="py-3 px-3 w-28">JENIS</th>
                      <th className="py-3 px-3">KETERANGAN &amp; RINCIAN</th>
                      <th className="py-3 px-3 text-center w-20">QTY</th>
                      <th className="py-3 px-3 text-right w-24">HARGA SATUAN</th>
                      <th className="py-3 px-3 text-right w-24">MUTASI BON (+)</th>
                      <th className="py-3 px-3 text-right w-24">BAYAR BON (-)</th>
                      <th className="py-3 px-3 text-right font-bold w-28">SALDO BON</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-800">
                    {statement.history.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-zinc-400">
                          Belum ada histori transaksi untuk mitra ini
                        </td>
                      </tr>
                    ) : (
                      statement.history.map((row) => {
                        const isExpanded = expandedRowId === row.id;
                        const hasItems = row.itemsDetail && row.itemsDetail.length > 0;

                        return (
                          <React.Fragment key={row.id}>
                            <tr className="hover:bg-zinc-50/80 transition-colors">
                              <td className="py-3 px-3 text-zinc-500 whitespace-nowrap text-[11px]">
                                <div>{row.tanggal}</div>
                                <div className="text-[10px] text-zinc-400">{row.jam}</div>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-zinc-900 whitespace-nowrap text-[11px]">
                                {row.id}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
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
                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1 flex-wrap">
                                    <div className="flex items-center space-x-1.5 flex-wrap">
                                      {row.isNotaLalu && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                                          📑 NOTA LALU {row.noNotaLalu ? `(${row.noNotaLalu})` : ''}
                                        </span>
                                      )}
                                      <span className="font-medium text-zinc-900">{row.keterangan || '-'}</span>
                                    </div>

                                    <div className="flex items-center space-x-1.5 shrink-0">
                                      {row.fotoNota && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setPreviewPhoto({
                                              imageUrl: row.fotoNota!,
                                              title: `Foto Fisik Nota Manual - ${row.id}`,
                                              nomorBukti: row.id,
                                              namaMitra: statement?.namaMitra,
                                              tanggal: row.tanggal,
                                              nominalText:
                                                row.debet > 0
                                                  ? `+${formatRupiah(row.debet)}`
                                                  : `-${formatRupiah(row.kredit)}`,
                                              keterangan: row.keterangan,
                                            })
                                          }
                                          className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-semibold text-[10px] flex items-center space-x-1 transition-colors cursor-pointer"
                                          title="Lihat Foto Fisik Nota Manual"
                                        >
                                          <Camera className="w-3 h-3 text-amber-700" />
                                          <span>Foto Nota</span>
                                        </button>
                                      )}

                                      {hasItems && row.itemsDetail!.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                          className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer font-medium ml-1"
                                        >
                                          <span>{row.itemsDetail!.length} item</span>
                                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Quantity Column */}
                              <td className="py-3 px-3 text-center whitespace-nowrap">
                                <span className="inline-block px-2 py-0.5 bg-zinc-100 rounded text-zinc-800 font-bold text-[11px]">
                                  {row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1' : '-')}
                                </span>
                              </td>

                              {/* Harga Satuan Column */}
                              <td className="py-3 px-3 text-right font-mono text-zinc-700 whitespace-nowrap text-[11px]">
                                {row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-')}
                              </td>

                              {/* Mutasi Bon (+) */}
                              <td className="py-3 px-3 text-right font-mono text-rose-700 whitespace-nowrap font-medium text-[11px]">
                                {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                              </td>

                              {/* Bayar Bon (-) */}
                              <td className="py-3 px-3 text-right font-mono text-emerald-700 whitespace-nowrap font-medium text-[11px]">
                                {row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-'}
                              </td>

                              {/* Saldo Bon Mitra */}
                              <td className="py-3 px-3 text-right font-mono font-bold text-zinc-900 whitespace-nowrap text-[11px]">
                                {formatRupiah(row.saldoAkumulasi)}
                              </td>
                            </tr>

                            {/* Sub-item breakdown row if expanded */}
                            {isExpanded && hasItems && (
                              <tr className="bg-amber-50/40">
                                <td colSpan={9} className="py-2.5 px-6">
                                  <div className="bg-white rounded-lg border border-amber-200 p-3 space-y-1.5 shadow-2xs">
                                    <span className="text-[10px] font-bold text-amber-900 uppercase tracking-wider block">
                                      Rincian Item Pembelian Kasbon:
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                      {row.itemsDetail!.map((it, idx) => (
                                        <div
                                          key={idx}
                                          className="p-2 bg-zinc-50 rounded border border-zinc-200 text-[11px] flex justify-between items-center"
                                        >
                                          <div>
                                            <div className="font-semibold text-zinc-800">{it.nama}</div>
                                            <div className="text-[10px] text-zinc-500">
                                              {it.qty} {it.satuan} &times; {formatRupiah(it.harga)}
                                            </div>
                                          </div>
                                          <div className="font-mono font-bold text-zinc-900">
                                            {formatRupiah(it.subtotal)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                  {statement.history.length > 0 && (
                    <tfoot className="bg-zinc-50 font-bold border-t-2 border-zinc-300">
                      <tr>
                        <td colSpan={6} className="py-3 px-4 text-right uppercase text-[11px] text-zinc-700">
                          Total Sisa Kewajiban Bon Mitra:
                        </td>
                        <td colSpan={3} className="py-3 px-4 text-right font-mono text-base text-amber-900">
                          {formatRupiah(statement.totalBonKeseluruhan)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: AUTHENTIC PRINT PAPER A4 LAYOUT (PERSIS DOKUMEN CETAK & BACKUP HARIAN) */}
          {viewMode === 'LEMBAR_CETAK' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-xs text-indigo-900">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-indigo-700 shrink-0" />
                  <span>
                    <strong>Mode Lembar Cetak A4 Aktif:</strong> Format tata letak dokumen fisik dengan kop resmi, biodata mitra, tabel mutasi rincian Qty/Harga, dan kolom tanda tangan siap cetak.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handlePrintClick}
                  className="bg-indigo-700 hover:bg-indigo-800 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-2xs shrink-0 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Buka Dialog Cetak / PDF</span>
                </button>
              </div>

              {/* Physical Document Paper Simulation */}
              <div className="bg-white rounded-xl shadow-md border border-zinc-300 p-6 sm:p-10 space-y-6 max-w-4xl mx-auto text-zinc-900 print:shadow-none print:border-none print:p-0">
                {/* 1. KOP SURAT RESMI */}
                <div className="border-b-2 border-zinc-900 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-7 h-7 text-emerald-800" />
                      <span className="text-2xl font-black text-zinc-900 tracking-tight">PT WIJAYA AGRO</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-700 mt-0.5">
                      PERDAGANGAN SARANA PERTANIAN &amp; PEMBELIAN HASIL BUMI
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      Jl. Raya Agro Industri No. 88, Wlingi, Blitar · Telp: (021) 8892-0192 · Email: admin@wijayaagro.com
                    </p>
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-zinc-200">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-950 bg-indigo-50 px-3 py-1 rounded border border-indigo-300">
                      REKENING KORAN MITRA
                    </span>
                    <p className="text-[11px] text-zinc-500 font-mono mt-1.5">
                      No. Dokumen: RK/{statement.kodeMitra}/{now.getFullYear()}{String(now.getMonth() + 1).padStart(2, '0')}{String(now.getDate()).padStart(2, '0')}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Dicetak: {tglCetak} · {jamCetak} WIB
                    </p>
                  </div>
                </div>

                {/* 2. IDENTITAS MITRA BOX */}
                <div className="bg-zinc-50 rounded-lg border border-zinc-300 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      DATA MITRA / PETANI
                    </span>
                    <div className="text-sm font-bold text-zinc-900">
                      {statement.namaMitra}{' '}
                      <span className="font-mono text-xs font-normal text-zinc-600">
                        ({statement.kodeMitra})
                      </span>
                    </div>
                    <div className="text-zinc-600">
                      Peran: <strong className="text-zinc-800">{statement.role}</strong> · Status: <strong className="text-emerald-700">{statement.status}</strong>
                    </div>
                  </div>

                  <div className="space-y-1 sm:text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      KONTAK &amp; LOKASI
                    </span>
                    <div className="font-medium text-zinc-800">
                      HP / WA: <span className="font-mono font-bold">{statement.telepon || '-'}</span>
                    </div>
                    <div className="text-zinc-600">
                      Alamat: {statement.alamat || '-'}
                    </div>
                  </div>
                </div>

                {/* 3. RINGKASAN SALDO 4 BOX */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase">Kasbon Barang</span>
                    <p className="text-sm font-bold text-zinc-900 mt-0.5">
                      {formatRupiah(statement.totalKasbonBarang)}
                    </p>
                    <span className="text-[9px] text-zinc-400">Pupuk / benih / obat</span>
                  </div>

                  <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200">
                    <span className="text-[10px] font-bold text-rose-700 uppercase">Kasbon Uang</span>
                    <p className="text-sm font-bold text-rose-800 mt-0.5">
                      {formatRupiah(statement.totalKasbonUang)}
                    </p>
                    <span className="text-[9px] text-rose-500">Pinjaman tunai aktif</span>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-lg border-2 border-amber-400 shadow-2xs">
                    <span className="text-[10px] font-black text-amber-900 uppercase">TOTAL SISA BON</span>
                    <p className="text-base font-black text-amber-950 mt-0.5 font-mono">
                      {formatRupiah(statement.totalBonKeseluruhan)}
                    </p>
                    <span className="text-[9px] font-semibold text-amber-800">Wajib dibayar mitra</span>
                  </div>

                  <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-200">
                    <span className="text-[10px] font-bold text-purple-900 uppercase">Titip Hasil Bumi</span>
                    <p className="text-sm font-bold text-purple-950 mt-0.5">
                      {formatRupiah(statement.totalTitip)}
                    </p>
                    <span className="text-[9px] text-purple-600">Hasil panen tersimpan</span>
                  </div>
                </div>

                {/* 4. TABEL BUKU BESAR MUTASI RINCIAN */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                    <span>RINCIAN MUTASI TRANSAKSI BUKU BESAR</span>
                    <span className="text-[10px] text-zinc-400 font-mono">Mata Uang: IDR</span>
                  </div>

                  <div className="border border-zinc-300 rounded-lg overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-zinc-100 text-zinc-800 font-bold uppercase text-[9px] border-b border-zinc-300">
                        <tr>
                          <th className="py-2.5 px-2.5 w-20">TGL &amp; JAM</th>
                          <th className="py-2.5 px-2.5 w-24">NO. BUKTI</th>
                          <th className="py-2.5 px-2.5 w-24">JENIS</th>
                          <th className="py-2.5 px-2.5">URAIAN / KETERANGAN BARANG</th>
                          <th className="py-2.5 px-2 text-center w-16">QTY</th>
                          <th className="py-2.5 px-2 text-right w-24">HRG SATUAN</th>
                          <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">KASBON (+)</th>
                          <th className="py-2.5 px-2 text-right w-22 whitespace-nowrap">BAYAR (-)</th>
                          <th className="py-2.5 px-2.5 text-right w-26 whitespace-nowrap">SALDO BON</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 text-zinc-900 text-[11px]">
                        {statement.history.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-zinc-400">
                              Belum ada transaksi pada rekening koran ini
                            </td>
                          </tr>
                        ) : (
                          statement.history.map((row) => (
                            <tr key={row.id} className="hover:bg-zinc-50/50">
                              <td className="py-2 px-2.5 text-zinc-500 text-[10px] whitespace-nowrap">
                                <div>{row.tanggal}</div>
                                <div className="text-[9px] text-zinc-400">{row.jam}</div>
                              </td>
                              <td className="py-2 px-2.5 font-mono font-medium text-zinc-900 text-[10px] whitespace-nowrap">
                                {row.id}
                              </td>
                              <td className="py-2 px-2.5 font-semibold text-[10px] whitespace-nowrap">
                                {row.jenis.replace(/_/g, ' ')}
                              </td>
                              <td className="py-2 px-2.5 text-zinc-700 text-[10px]">
                                <div>{row.keterangan || '-'}</div>
                                {row.itemsDetail && row.itemsDetail.length > 1 && (
                                  <div className="mt-1 space-y-0.5 text-[9px] text-zinc-500 bg-zinc-50 p-1 rounded border border-zinc-200">
                                    {row.itemsDetail.map((it, idx) => (
                                      <div key={idx} className="flex justify-between">
                                        <span>• {it.nama}</span>
                                        <span className="font-mono">{it.qty} {it.satuan} @ {formatRupiah(it.harga)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-bold text-zinc-800 text-[10px] whitespace-nowrap">
                                {row.qtyDisplay || (row.jenis === 'KASBON_UANG' ? '1' : '-')}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-zinc-700 text-[10px] whitespace-nowrap">
                                {row.hargaSatuanDisplay || (row.jenis === 'KASBON_UANG' ? formatRupiah(row.debet) : '-')}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-rose-700 whitespace-nowrap text-[10px]">
                                {row.debet > 0 ? `+${formatRupiah(row.debet)}` : '-'}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-emerald-700 whitespace-nowrap text-[10px]">
                                {row.kredit > 0 ? `-${formatRupiah(row.kredit)}` : '-'}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-zinc-900 whitespace-nowrap text-[10px]">
                                {formatRupiah(row.saldoAkumulasi)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {statement.history.length > 0 && (
                        <tfoot className="bg-zinc-100 font-bold border-t-2 border-zinc-300">
                          <tr>
                            <td colSpan={6} className="py-2.5 px-3 text-right uppercase text-[10px]">
                              Total Sisa Saldo Bon:
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

                {/* 5. KOLOM TANDA TANGAN RESMI PENGESAHAN DOKUMEN */}
                <div className="pt-6 border-t border-zinc-200 grid grid-cols-2 gap-8 text-xs text-center text-zinc-600">
                  <div className="space-y-16">
                    <div>
                      <p className="font-semibold text-zinc-800">Bagian Keuangan / Kasir,</p>
                      <p className="text-[10px] text-zinc-500">PT Wijaya Agro</p>
                    </div>
                    <div>
                      <div className="w-36 border-b border-zinc-400 mx-auto" />
                      <p className="text-[11px] font-bold text-zinc-800 mt-1">( Kasir &amp; Keuangan )</p>
                    </div>
                  </div>

                  <div className="space-y-16">
                    <div>
                      <p className="font-semibold text-zinc-800">Mitra / Petani Penerima,</p>
                      <p className="text-[10px] text-zinc-500">Konfirmasi Saldo &amp; Bon</p>
                    </div>
                    <div>
                      <div className="w-36 border-b border-zinc-400 mx-auto" />
                      <p className="text-[11px] font-bold text-zinc-800 mt-1">( {statement.namaMitra} )</p>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-center text-zinc-400 italic pt-2">
                  Dokumen rekening koran ini sah diterbitkan oleh Sistem ERP PT Wijaya Agro sebagai bukti mutasi buku besar mitra.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Official Rekening Koran Print Modal */}
      {showPrintModal && (
        <CetakRekeningKoranModal
          statement={statement}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Foto Nota Preview Modal */}
      {previewPhoto && (
        <FotoNotaPreviewModal
          isOpen={Boolean(previewPhoto)}
          onClose={() => setPreviewPhoto(null)}
          imageUrl={previewPhoto.imageUrl}
          title={previewPhoto.title}
          nomorBukti={previewPhoto.nomorBukti}
          namaMitra={previewPhoto.namaMitra}
          tanggal={previewPhoto.tanggal}
          nominalText={previewPhoto.nominalText}
          keterangan={previewPhoto.keterangan}
        />
      )}
    </div>
  );
};
