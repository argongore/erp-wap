import React, { useState, useEffect } from 'react';
import {
  Receipt,
  CheckCircle2,
  AlertCircle,
  Info,
  History,
  AlertTriangle,
  ArrowRight,
  Wallet,
} from 'lucide-react';
import { Mitra, Rekening, RekeningKoranMitraSummary, TransaksiBayarBon } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  bayarBonList: TransaksiBayarBon[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const BayarBonView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  bayarBonList,
  onSuccess,
  onRefresh,
}) => {
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');
  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );
  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');

  const [selectedMitraId, setSelectedMitraId] = useState<string>(activeMitras[0]?.id || '');
  const [statementData, setStatementData] = useState<RekeningKoranMitraSummary | null>(null);
  const [loadingStatement, setLoadingStatement] = useState<boolean>(false);

  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>('BNI01');
  const [nominalBayarInput, setNominalBayarInput] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('Pembayaran angsuran bon');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch statement data when selected Mitra changes
  useEffect(() => {
    if (!selectedMitraId) return;
    let isMounted = true;
    setLoadingStatement(true);
    setErrorMsg('');

    api
      .getRekeningKoranMitra(selectedMitraId)
      .then((data) => {
        if (isMounted) {
          setStatementData(data);
          // Set default nominal bayar to total bon outstanding if available
          if (data.totalBonKeseluruhan > 0) {
            setNominalBayarInput(data.totalBonKeseluruhan.toString());
          } else {
            setNominalBayarInput('0');
          }
        }
      })
      .catch((err) => {
        if (isMounted) setErrorMsg(err.message || 'Gagal memuat saldo bon mitra');
      })
      .finally(() => {
        if (isMounted) setLoadingStatement(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMitraId]);

  const nominalBayar = Number(nominalBayarInput) || 0;
  const totalBon = statementData?.totalBonKeseluruhan || 0;
  const isPartial = nominalBayar > 0 && nominalBayar < totalBon;
  const isFull = nominalBayar > 0 && nominalBayar === totalBon;
  const isOver = nominalBayar > totalBon;

  const handleProcessSubmit = async () => {
    setErrorMsg('');
    if (nominalBayar <= 0) {
      setErrorMsg('Nominal pembayaran bon harus lebih dari Rp 0');
      return;
    }
    if (totalBon <= 0) {
      setErrorMsg('Mitra ini tidak memiliki kewajiban bon yang harus dibayar');
      return;
    }
    if (nominalBayar > totalBon) {
      setErrorMsg(
        `Nominal bayar (${formatRupiah(nominalBayar)}) melebihi total bon mitra (${formatRupiah(totalBon)})`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result: TransaksiBayarBon = await api.processBayarBon({
        idMitra: selectedMitraId,
        nominalBayar,
        metode,
        rekeningTujuan: metode === 'TRANSFER' ? rekeningTujuan : undefined,
        keterangan,
      });

      setShowConfirmModal(false);
      onRefresh();

      // Refresh statement data
      const updatedStatement = await api.getRekeningKoranMitra(selectedMitraId);
      setStatementData(updatedStatement);
      setNominalBayarInput(updatedStatement.totalBonKeseluruhan.toString());

      const receipt: ReceiptData = {
        title: 'KUITANSI RESMI PELUNASAN BON',
        subtitle: isFull ? 'Status: LUNAS PENUH' : 'Status: PEMBAYARAN SEBAGIAN (ANGSURAN)',
        nomorTransaksi: result.idTransaksi,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra,
        rekening: result.rekeningTujuan,
        kategori: 'BAYAR_BON',
        detailRows: [
          { label: 'Pembayar / Mitra', value: result.namaMitra },
          { label: 'Metode Pembayaran', value: result.metode },
          { label: 'Rekening Penerima Kas', value: result.rekeningTujuan },
          { label: 'Total Bon Sebelum Bayar', value: result.totalBonSebelum },
          { label: 'Nominal Pembayaran Diterima', value: result.nominalBayar, isTotal: true },
          {
            label: 'Sisa Bon Tersisa',
            value: result.sisaBonSetelah,
            highlight: result.sisaBonSetelah > 0,
          },
        ],
        catatan: result.keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pembayaran bon');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Kasir Bayar Bon (Pelunasan Piutang)</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              FITUR BARU D
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Penerimaan pembayaran pelunasan kasbon barang & pinjaman kasbon uang mitra (lunas penuh / sebagian)
          </p>
        </div>
      </div>

      {/* Info Rules Box */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1">
        <div className="flex items-center space-x-2 font-bold text-emerald-900">
          <Info className="w-4 h-4 text-emerald-700" />
          <span>Mekanisme Pembayaran Bon PT Wijaya Agro:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Sistem secara otomatis menghitung <strong>TOTAL BON KESELURUHAN</strong> (Kasbon Barang + Kasbon Uang).
          Dukungan pembayaran lunas penuh ataupun cicilan/sebagian secara aman. Dana masuk langsung menambah saldo fisik
          kas/bank perusahaan dan mengurangi rekening virtual <strong>BON01</strong>.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input & Summary */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
              1. Pilih Mitra &amp; Cek Kewajiban Bon
            </h2>

            {/* Select Mitra */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Pilih Mitra Yang Membayar <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-600"
              >
                {activeMitras.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.kode}) - {m.role}
                  </option>
                ))}
              </select>
            </div>

            {/* Live Bon Breakdown Cards */}
            {loadingStatement ? (
              <div className="p-6 text-center text-xs text-zinc-400">Menghitung rincian bon aktual...</div>
            ) : statementData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs">
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">Kasbon Barang (Toko)</span>
                    <div className="text-sm font-bold text-zinc-800 mt-1">
                      {formatRupiah(statementData.totalKasbonBarang)}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-zinc-50 border border-zinc-200 text-xs">
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">Kasbon Uang Tunai</span>
                    <div className="text-sm font-bold text-rose-700 mt-1">
                      {formatRupiah(statementData.totalKasbonUang)}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase">TOTAL BON KESELURUHAN</span>
                    <div className="text-base font-extrabold text-emerald-950 mt-1 font-mono">
                      {formatRupiah(statementData.totalBonKeseluruhan)}
                    </div>
                  </div>
                </div>

                {statementData.totalBonKeseluruhan === 0 && (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Mitra ini bersih dari segala kewajiban bon (Saldo Bon: Rp 0).</span>
                  </div>
                )}
              </div>
            ) : null}

            {/* Input Nominal Pembayaran */}
            <div className="pt-2 border-t border-zinc-100 space-y-3">
              <label className="block text-xs font-bold text-zinc-900 uppercase tracking-wider">
                2. Input Nominal Pembayaran
              </label>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Nominal Diterima Kasir (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    max={totalBon || undefined}
                    value={nominalBayarInput}
                    onChange={(e) => setNominalBayarInput(e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono font-bold focus:ring-1 focus:ring-emerald-600"
                  />
                  {totalBon > 0 && (
                    <button
                      type="button"
                      onClick={() => setNominalBayarInput(totalBon.toString())}
                      className="px-3 py-2.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-bold rounded-lg transition-colors shrink-0"
                    >
                      Bayar Lunas Penuh
                    </button>
                  )}
                </div>
                <div className="text-xs font-semibold text-emerald-800 mt-1">{formatRupiah(nominalBayar)}</div>
              </div>

              {/* Status Indicator */}
              {isFull && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-xs font-medium">
                  ✓ Pembayaran Lunas Penuh — Seluruh kewajiban bon mitra akan ditutup menjadi LUNAS.
                </div>
              )}
              {isPartial && (
                <div className="p-2.5 bg-amber-50 text-amber-800 rounded-lg border border-amber-200 text-xs font-medium">
                  ℹ Pembayaran Sebagian (Cicilan) — Sisa bon mitra setelah pembayaran:{' '}
                  <strong>{formatRupiah(totalBon - nominalBayar)}</strong>.
                </div>
              )}
              {isOver && (
                <div className="p-2.5 bg-rose-50 text-rose-800 rounded-lg border border-rose-200 text-xs font-medium">
                  ⚠ Nominal bayar melebihi total bon mitra!
                </div>
              )}

              {/* Payment Method */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Metode Penerimaan Uang <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMetode('TUNAI')}
                    className={`py-2 px-3 text-center rounded-lg font-semibold text-xs border transition-all ${
                      metode === 'TUNAI'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    Tunai (Masuk KAS01)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetode('TRANSFER')}
                    className={`py-2 px-3 text-center rounded-lg font-semibold text-xs border transition-all ${
                      metode === 'TRANSFER'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                    }`}
                  >
                    Transfer Rekening Bank
                  </button>
                </div>
              </div>

              {metode === 'TUNAI' ? (
                <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Rekening Tujuan Penerima:</span>
                    <span className="font-mono font-bold text-zinc-900">KAS01 (Kas Utama)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Saldo KAS01 Saat Ini:</span>
                    <span className="font-bold text-emerald-800">{formatRupiah(kas01?.saldoSaatIni || 0)}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    Kas fisik di kasir akan bertambah langsung sebesar nominal pembayaran.
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs">
                  <label className="block font-semibold text-sky-900">
                    Pilih Rekening Bank Penerima Dana <span className="text-rose-500">*</span>:
                  </label>
                  <select
                    value={rekeningTujuan}
                    onChange={(e) => setRekeningTujuan(e.target.value)}
                    className="w-full px-2.5 py-2 border border-sky-300 rounded bg-white text-xs font-medium"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">Keterangan / Catatan</label>
                <input
                  type="text"
                  placeholder="Misal: Pelunasan bon pupuk musim tanam 1"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
                />
              </div>

              <button
                type="button"
                disabled={nominalBayar <= 0 || totalBon <= 0 || isOver}
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
              >
                Proses Bayar Bon ({formatRupiah(nominalBayar)})
              </button>
            </div>
          </div>
        </div>

        {/* Right: History Bayar Bon */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-emerald-700" />
                <h2 className="text-xs font-bold text-zinc-900 uppercase">Riwayat Bayar Bon (DB_BAYAR_BON)</h2>
              </div>
              <span className="text-xs text-zinc-500">{bayarBonList.length} Transaksi</span>
            </div>

            <div className="divide-y divide-zinc-100 max-h-[520px] overflow-y-auto text-xs">
              {bayarBonList.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">Belum ada riwayat pembayaran bon</div>
              ) : (
                bayarBonList.map((b) => (
                  <div key={b.idTransaksi} className="p-3.5 hover:bg-zinc-50/70 transition-colors space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-zinc-900">{b.idTransaksi}</span>
                      <span className="font-bold text-emerald-800 font-mono">{formatRupiah(b.nominalBayar)}</span>
                    </div>

                    <div className="flex justify-between text-[11px] text-zinc-600">
                      <span>
                        Mitra: <strong>{b.namaMitra}</strong>
                      </span>
                      <span>
                        Rekening: <strong className="font-mono">{b.rekeningTujuan}</strong> ({b.metode})
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] text-zinc-500 pt-0.5">
                      <span>Sebelum: {formatRupiah(b.totalBonSebelum)}</span>
                      <span>
                        Sisa:{' '}
                        <strong className={b.sisaBonSetelah > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                          {formatRupiah(b.sisaBonSetelah)}
                        </strong>
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span className="truncate max-w-[200px]">{b.keterangan}</span>
                      <span>
                        {b.tanggal} · {b.jam}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-emerald-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Pembayaran Bon</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-emerald-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Mitra Pembayar:</span>
                  <span className="font-bold text-zinc-900">{statementData?.namaMitra}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Total Bon Sebelumnya:</span>
                  <span className="font-semibold text-zinc-800">{formatRupiah(totalBon)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Rekening Masuk Kas:</span>
                  <span className="font-mono font-bold text-emerald-800">
                    {metode === 'TUNAI' ? 'KAS01' : rekeningTujuan}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Nominal Pembayaran:</span>
                  <span className="font-bold text-sm text-emerald-800">{formatRupiah(nominalBayar)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500 pt-1">
                  <span>Sisa Bon Mitra Setelahnya:</span>
                  <span className="font-mono font-bold text-zinc-900">{formatRupiah(totalBon - nominalBayar)}</span>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md font-medium"
                >
                  Batal / Cek Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleProcessSubmit}
                  className="px-4 py-1.5 bg-emerald-700 text-white font-bold rounded-md hover:bg-emerald-800 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi & Terima Pembayaran'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
