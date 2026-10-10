import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Briefcase,
  Layers,
  DollarSign,
  HandCoins,
  Receipt,
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Printer,
  Plus,
  FileSpreadsheet,
  Wheat,
  ShoppingBag,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import {
  DetailHarianKaryawanResponse,
  NamaDivisi,
  Rekening,
  TransaksiPenggajian,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';

interface DetailHarianKaryawanModalProps {
  idKaryawan: string;
  rekeningList: Rekening[];
  onClose: () => void;
  onOpenInputKerja: (idKaryawan: string) => void;
  onRefreshAll: () => void;
}

export const DetailHarianKaryawanModal: React.FC<DetailHarianKaryawanModalProps> = ({
  idKaryawan,
  rekeningList,
  onClose,
  onOpenInputKerja,
  onRefreshAll,
}) => {
  const [detail, setDetail] = useState<DetailHarianKaryawanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'LOG_HARIAN' | 'MUTASI_BON' | 'RIWAYAT_GAJI'>('LOG_HARIAN');

  // Settlement Form Modal State
  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleDivisi, setSettleDivisi] = useState<NamaDivisi>('Gudang Wijaya Agro');
  const [settleRekening, setSettleRekening] = useState<string>('KAS01');
  const [settlePersenBon, setSettlePersenBon] = useState<number>(100);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState('');

  const loadDetail = async () => {
    setLoading(true);
    try {
      const res = await api.getDetailHarianKaryawan(idKaryawan);
      setDetail(res);
      setSettleDivisi(res.karyawan.divisiTerakhir || 'Gudang Wijaya Agro');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat detail harian karyawan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [idKaryawan]);

  const handleProcessSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setSettleError('');
    setSettleSubmitting(true);
    try {
      await api.settleHakUpahKaryawan(idKaryawan, {
        divisi: settleDivisi,
        rekeningSumber: settleRekening,
        persentasePotongKasbon: settlePersenBon,
      });
      setShowSettleModal(false);
      onRefreshAll();
      loadDetail();
    } catch (err: any) {
      setSettleError(err.message || 'Gagal memproses settlement upah');
    } finally {
      setSettleSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center space-x-3 text-xs">
          <span className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></span>
          <span>Memuat detail harian karyawan...</span>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl text-center space-y-3 max-w-sm">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-xs text-rose-700">{errorMsg || 'Data tidak ditemukan'}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 text-white text-xs rounded-lg font-semibold"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  const { karyawan, logHarian, riwayatGaji, riwayatKasbonBarang, riwayatKasbonUang, riwayatBayarBon } = detail;
  const pendingLogs = logHarian.filter((u) => u.status === 'TERCATAT');

  const validRekeningList = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'BON01' && r.kode !== 'TIT01' && r.status === 'AKTIF'
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-zinc-200 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden text-zinc-900 flex flex-col max-h-[94vh] animate-in fade-in">
        {/* Modal Top Header */}
        <div className="p-4 bg-zinc-900 text-white flex items-center justify-between border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold font-mono">
              {karyawan.nama.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-sm text-white">{karyawan.nama}</h2>
                <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 border border-zinc-700">
                  {karyawan.nik}
                </span>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-semibold px-2 py-0.5 rounded border border-emerald-800">
                  {karyawan.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                {karyawan.jabatan} · {karyawan.departemen} · Divisi Terakhir: <strong>{karyawan.divisiTerakhir}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => window.print()}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
              title="Cetak Rekap Karyawan"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Financial KPI Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-zinc-50 border-b border-zinc-200 text-xs">
          {/* Card 1: Hak Upah Berjalan */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Hak Upah Berjalan
            </span>
            <div className="text-base font-black font-mono text-emerald-700">
              +{formatRupiah(karyawan.totalUpahBelumDibayar)}
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              {pendingLogs.length} Hari Kerja Belum Dicairkan
            </span>
          </div>

          {/* Card 2: Total Bon Barang */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Bon Barang Toko
            </span>
            <div className="text-base font-black font-mono text-rose-700">
              -{formatRupiah(karyawan.totalKasbonBarang)}
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              Pupuk/Saprotan dari Toko
            </span>
          </div>

          {/* Card 3: Total Bon Uang */}
          <div className="p-3 bg-white rounded-xl border border-zinc-200 space-y-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
              Bon Pinjaman Uang
            </span>
            <div className="text-base font-black font-mono text-amber-700">
              -{formatRupiah(karyawan.totalKasbonUang)}
            </div>
            <span className="text-[10px] text-zinc-500 block truncate">
              Kasbon Uang Tunai/Transfer
            </span>
          </div>

          {/* Card 4: Posisi Bersih */}
          <div
            className={`p-3 rounded-xl border space-y-1 ${
              karyawan.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                ? 'bg-purple-50/80 border-purple-200 text-purple-950'
                : karyawan.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider block">
              {karyawan.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                ? 'SISA HAK UPAH BERSIH'
                : karyawan.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                ? 'SISA HUTANG BON'
                : 'POSISI IMPAS / LUNAS'}
            </span>
            <div className="text-base font-black font-mono">
              {formatRupiah(Math.abs(karyawan.saldoBersih))}
            </div>
            <span className="text-[10px] opacity-80 block truncate">
              {karyawan.posisiStatus === 'PERUSAHAAN_BERHUTANG_UPAH'
                ? 'Perusahaan wajib bayar'
                : karyawan.posisiStatus === 'KARYAWAN_BERHUTANG_BON'
                ? 'Bon melebihi hak upah'
                : 'Bebas kewajiban'}
            </span>
          </div>
        </div>

        {/* Quick Action Buttons Bar */}
        <div className="px-4 py-2.5 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 text-xs">
            <button
              onClick={() => setActiveTab('LOG_HARIAN')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'LOG_HARIAN'
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Log Kerja Harian ({logHarian.length})
            </button>
            <button
              onClick={() => setActiveTab('MUTASI_BON')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'MUTASI_BON'
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Mutasi Bon ({riwayatKasbonBarang.length + riwayatKasbonUang.length})
            </button>
            <button
              onClick={() => setActiveTab('RIWAYAT_GAJI')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'RIWAYAT_GAJI'
                  ? 'bg-zinc-900 text-white shadow-2xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Slip Gaji Cair ({riwayatGaji.length})
            </button>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenInputKerja(karyawan.id)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Input Kerja Hari Ini</span>
            </button>

            {pendingLogs.length > 0 && (
              <button
                onClick={() => setShowSettleModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Cairkan {pendingLogs.length} Hari Kerja &amp; Potong Bon</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 overflow-y-auto flex-1 text-xs">
          {/* TAB 1: Log Pekerjaan Harian */}
          {activeTab === 'LOG_HARIAN' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-zinc-500 text-[11px]">
                <span>Daftar penugasan divisi dan tugas yang dikerjakan per hari</span>
                <span className="font-semibold text-emerald-800">
                  Total Upah Tercatat: {formatRupiah(karyawan.totalHakUpahHarian)}
                </span>
              </div>

              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">TANGGAL / HARI</th>
                      <th className="py-2.5 px-3">DIVISI</th>
                      <th className="py-2.5 px-3">ITEM PEKERJAAN</th>
                      <th className="py-2.5 px-2 text-center w-14">QTY</th>
                      <th className="py-2.5 px-3 text-right">HARGA</th>
                      <th className="py-2.5 px-3 text-right">JUMLAH</th>
                      <th className="py-2.5 px-2 text-center w-16">KET</th>
                      <th className="py-2.5 px-3">CATATAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-800 text-[11px]">
                    {logHarian.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-zinc-400">
                          Belum ada log pekerjaan harian tercatat untuk karyawan ini
                        </td>
                      </tr>
                    ) : (
                      logHarian.map((log) => {
                        const qty = log.kuantiti !== undefined ? log.kuantiti : (log.totalUpahHarian > 0 ? 1 : 0);
                        const harga = log.harga !== undefined ? log.harga : log.upahHarian;
                        const jumlah = log.jumlah !== undefined ? log.jumlah : log.totalUpahHarian;
                        const isBon = log.ket === 'BON' || log.status === 'TERCATAT';

                        return (
                          <tr key={log.id} className="hover:bg-zinc-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-bold text-zinc-800 whitespace-nowrap">
                              {log.hariTanggal || log.tanggalKerja}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-zinc-100 text-zinc-800 border border-zinc-200">
                                {log.divisiKode || log.divisi}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-zinc-900 uppercase">
                              {log.item || log.keterangan || `Tugas harian di ${log.divisi}`}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono font-bold">
                              {qty}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-zinc-600">
                              {harga > 0 ? formatRupiah(harga) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {jumlah > 0 ? formatRupiah(jumlah) : '-'}
                            </td>
                            <td className="py-2.5 px-2 text-center whitespace-nowrap">
                              {isBon ? (
                                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                                  BON
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-sky-100 text-sky-800 border border-sky-300">
                                  LUNAS
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-600 text-xs">
                              {log.catatan || (log.uangMakanLembur > 0 ? `Lembur/Makan +${formatRupiah(log.uangMakanLembur)}` : '-')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: Mutasi Bon Karyawan */}
          {activeTab === 'MUTASI_BON' && (
            <div className="space-y-4">
              {/* Kasbon Barang Toko */}
              <div className="space-y-2">
                <h3 className="font-bold text-zinc-800 text-xs flex items-center space-x-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-700" />
                  <span>1. Kasbon Barang dari Kasir Toko Saprotan</span>
                </h3>
                <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">NO NOTA</th>
                        <th className="py-2 px-3">TANGGAL</th>
                        <th className="py-2 px-3">RINCIAN BARANG</th>
                        <th className="py-2 px-3 text-right">TOTAL TAGIHAN</th>
                        <th className="py-2 px-3 text-right">SISA KASBON</th>
                        <th className="py-2 px-3 text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-800">
                      {riwayatKasbonBarang.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-zinc-400">
                            Tidak ada riwayat kasbon barang toko
                          </td>
                        </tr>
                      ) : (
                        riwayatKasbonBarang.map((p) => (
                          <tr key={p.noPenjualan}>
                            <td className="py-2 px-3 font-mono font-bold">{p.noPenjualan}</td>
                            <td className="py-2 px-3">{p.tanggal}</td>
                            <td className="py-2 px-3">
                              <div className="space-y-1">
                                {p.items?.map((it: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between text-[11px] gap-2">
                                    <span className="font-semibold text-zinc-900">• {it.namaProduk || it.nama}</span>
                                    <span className="font-mono text-zinc-600">
                                      {it.qty} {it.satuan} &times; {formatRupiah(it.harga || 0)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{formatRupiah(p.totalNominal)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                              {formatRupiah(p.sisaPiutang)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  p.statusPembayaran === 'LUNAS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {p.statusPembayaran}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Kasbon Uang Tunai */}
              <div className="space-y-2">
                <h3 className="font-bold text-zinc-800 text-xs flex items-center space-x-2">
                  <HandCoins className="w-4 h-4 text-amber-700" />
                  <span>2. Kasbon Uang Tunai / Pinjaman dari Kasir</span>
                </h3>
                <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2 px-3">ID TRANSAKSI</th>
                        <th className="py-2 px-3">TANGGAL</th>
                        <th className="py-2 px-3">KETERANGAN</th>
                        <th className="py-2 px-3">SUMBER</th>
                        <th className="py-2 px-3 text-right">PINJAMAN</th>
                        <th className="py-2 px-3 text-right">SISA KASBON</th>
                        <th className="py-2 px-3 text-center">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-zinc-800">
                      {riwayatKasbonUang.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-zinc-400">
                            Tidak ada riwayat pinjaman kasbon uang
                          </td>
                        </tr>
                      ) : (
                        riwayatKasbonUang.map((k) => (
                          <tr key={k.idTransaksi}>
                            <td className="py-2 px-3 font-mono font-bold">{k.idTransaksi}</td>
                            <td className="py-2 px-3">{k.tanggal}</td>
                            <td className="py-2 px-3">{k.keterangan}</td>
                            <td className="py-2 px-3">{k.rekeningSumber} ({k.metode})</td>
                            <td className="py-2 px-3 text-right font-mono">{formatRupiah(k.nominal)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                              {formatRupiah(k.sisaKasbon)}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  k.status === 'LUNAS'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {k.status}
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
          )}

          {/* TAB 3: Riwayat Slip Gaji */}
          {activeTab === 'RIWAYAT_GAJI' && (
            <div className="space-y-3">
              <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">NO SLIP GAJI</th>
                      <th className="py-2.5 px-3">TANGGAL</th>
                      <th className="py-2.5 px-3">DIVISI</th>
                      <th className="py-2.5 px-3 text-right">UPAH KOTOR</th>
                      <th className="py-2.5 px-3 text-right">POTONG BON</th>
                      <th className="py-2.5 px-3 text-right">BERSIH DIBAYAR</th>
                      <th className="py-2.5 px-3">SUMBER KAS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-zinc-800">
                    {riwayatGaji.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-zinc-400">
                          Belum ada slip gaji yang dicairkan untuk karyawan ini
                        </td>
                      </tr>
                    ) : (
                      riwayatGaji.map((g) => (
                        <tr key={g.id} className="hover:bg-zinc-50/80">
                          <td className="py-2.5 px-3 font-mono font-bold text-zinc-900">{g.slipNomor}</td>
                          <td className="py-2.5 px-3">{g.tanggal}</td>
                          <td className="py-2.5 px-3 font-semibold">{g.divisi}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{formatRupiah(g.totalGajiKotor)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                            {g.potonganKasbon > 0 ? `-${formatRupiah(g.potonganKasbon)}` : 'Rp 0'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                            {formatRupiah(g.gajiBersihDibayar)}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-600">{g.rekeningSumber} ({g.metodePembayaran})</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-3 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between text-xs">
          <span className="text-zinc-500 text-[11px]">
            ERP Wijaya Agro · Detail Mutasi SDM &amp; Penggajian
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Settle Modal Sub-window */}
      {showSettleModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden animate-in fade-in">
            <div className="p-4 bg-amber-600 text-white font-bold text-sm flex justify-between items-center">
              <span>Cairkan {pendingLogs.length} Hari Kerja &amp; Potong Bon</span>
              <button
                onClick={() => setShowSettleModal(false)}
                className="text-amber-200 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessSettlement} className="p-5 space-y-3.5 text-xs">
              {settleError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
                  {settleError}
                </div>
              )}

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                <div className="flex justify-between">
                  <span>Akumulasi Upah {pendingLogs.length} Hari:</span>
                  <strong className="font-mono text-emerald-800">
                    {formatRupiah(karyawan.totalUpahBelumDibayar)}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Total Bon Karyawan:</span>
                  <strong className="font-mono text-rose-800">
                    {formatRupiah(karyawan.totalBonKaryawan)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Beban Divisi Pembayar
                </label>
                <select
                  value={settleDivisi}
                  onChange={(e) => setSettleDivisi(e.target.value as NamaDivisi)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold"
                >
                  <option value="Gudang Wijaya Agro">Gudang Wijaya Agro</option>
                  <option value="Wijaya Karya">Wijaya Karya</option>
                  <option value="Wijaya Transport">Wijaya Transport</option>
                  <option value="CV Wijaya Agro">CV Wijaya Agro</option>
                  <option value="PT Wijaya Agro Perkasa">PT Wijaya Agro Perkasa</option>
                  <option value="Okussa">Okussa</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Rekening Sumber Pencairan
                </label>
                <select
                  value={settleRekening}
                  onChange={(e) => setSettleRekening(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold"
                >
                  {validRekeningList.map((r) => (
                    <option key={r.kode} value={r.kode}>
                      {r.nama} ({r.kode}) - Saldo: {formatRupiah(r.saldoSaatIni)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Pilihan Pemotongan Bon Karyawan
                </label>
                <select
                  value={settlePersenBon}
                  onChange={(e) => setSettlePersenBon(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold"
                  disabled={karyawan.totalBonKaryawan <= 0}
                >
                  <option value={100}>Potong 100% (Lunaskan Bon Sebanyak Upah)</option>
                  <option value={50}>Potong 50% dari Bon</option>
                  <option value={25}>Potong 25% dari Bon</option>
                  <option value={0}>0% (Tanpa Potongan Bon)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowSettleModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={settleSubmitting}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {settleSubmitting ? 'Memproses...' : 'Proses Pencairan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
