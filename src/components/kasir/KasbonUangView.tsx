import React, { useState } from 'react';
import { HandCoins, CheckCircle2, AlertCircle, Info, Landmark, History, AlertTriangle } from 'lucide-react';
import { Mitra, Rekening, TransaksiKasbonUang } from '../../server/types.ts';
import { formatRupiah, formatTanggalIndo } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  kasbonUangList: TransaksiKasbonUang[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const KasbonUangView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  kasbonUangList,
  onSuccess,
  onRefresh,
}) => {
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');
  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );
  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');

  const [selectedMitraId, setSelectedMitraId] = useState<string>(activeMitras[0]?.id || '');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('BNI01');
  const [nominalInput, setNominalInput] = useState<string>('2000000');
  const [keterangan, setKeterangan] = useState<string>('Kasbon uang operasional tanam');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const nominal = Number(nominalInput) || 0;
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);

  // Check live balance of chosen source account
  const activeSourceAccount =
    metode === 'TUNAI' ? kas01 : availableBanks.find((b) => b.kode === rekeningSumber);

  const isBalanceSufficient = activeSourceAccount ? activeSourceAccount.saldoSaatIni >= nominal : false;

  const handleProcessSubmit = async () => {
    setErrorMsg('');
    if (nominal <= 0) {
      setErrorMsg('Nominal kasbon uang harus lebih dari Rp 0');
      return;
    }

    if (!activeSourceAccount) {
      setErrorMsg('Rekening sumber pengeluaran tidak valid');
      return;
    }

    if (activeSourceAccount.saldoSaatIni < nominal) {
      setErrorMsg(
        `Saldo ${activeSourceAccount.nama} (${activeSourceAccount.kode}) tidak mencukupi! Saldo: ${formatRupiah(
          activeSourceAccount.saldoSaatIni
        )}, Nominal: ${formatRupiah(nominal)}`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result: TransaksiKasbonUang = await api.processKasbonUang({
        idMitra: selectedMitraId,
        metode,
        rekeningSumber: metode === 'TRANSFER' ? rekeningSumber : undefined,
        nominal,
        keterangan,
      });

      setShowConfirmModal(false);
      onRefresh();

      const receipt: ReceiptData = {
        title: 'BUKTI PENGELUARAN KASBON UANG',
        subtitle: 'Pemberian Pinjaman Dana Tunai / Kasbon ke Mitra',
        nomorTransaksi: result.idTransaksi,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra,
        rekening: result.rekeningSumber,
        kategori: 'KASBON_UANG',
        detailRows: [
          { label: 'Penerima Kasbon', value: result.namaMitra },
          { label: 'Jenis Transaksi', value: 'KASBON UANG' },
          { label: 'Metode Pengeluaran', value: result.metode },
          { label: 'Rekening Sumber Dana', value: `${result.rekeningSumber} (${activeSourceAccount?.nama})` },
          { label: 'Status Pinjaman', value: result.status, highlight: true },
          { label: 'Nominal Kasbon Uang', value: result.nominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses kasbon uang');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Kasir Kasbon Uang</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
              FITUR BARU C
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Pemberian pinjaman uang tunai/transfer kepada mitra tani yang dicatat sebagai piutang kasbon uang
          </p>
        </div>
      </div>

      {/* Info Rules Box */}
      <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-1">
        <div className="flex items-center space-x-2 font-bold text-rose-900">
          <Info className="w-4 h-4 text-rose-600" />
          <span>Prinsip Keuangan Kasbon Uang:</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          Kasbon Uang <strong>BUKAN</strong> Penjualan Kasbon, Pembelian Barang, atau Titip. Saat transaksi ini disimpan,{' '}
          <strong>saldo kas/bank aktual perusahaan langsung berkurang</strong> dan piutang kasbon mitra bertambah.
          Rekening virtual BON01 otomatis bertambah sinkron.
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
        {/* Left Input Form */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
              Formulir Pengeluaran Kasbon Uang
            </h2>

            {/* Select Mitra */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Pilih Mitra Penerima <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedMitraId}
                onChange={(e) => setSelectedMitraId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-rose-600"
              >
                {activeMitras.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.kode}) - {m.role} - {m.telepon}
                  </option>
                ))}
              </select>
            </div>

            {/* Nominal */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Nominal Uang Diberikan (Rp) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                required
                value={nominalInput}
                onChange={(e) => setNominalInput(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono font-bold focus:ring-1 focus:ring-rose-600"
              />
              <div className="text-xs font-semibold text-rose-700 mt-1">{formatRupiah(nominal)}</div>
            </div>

            {/* Metode */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Metode Penyerahan Uang <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMetode('TUNAI')}
                  className={`py-2 px-3 text-center rounded-lg font-semibold text-xs border transition-all ${
                    metode === 'TUNAI'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  Tunai (Auto KAS01)
                </button>
                <button
                  type="button"
                  onClick={() => setMetode('TRANSFER')}
                  className={`py-2 px-3 text-center rounded-lg font-semibold text-xs border transition-all ${
                    metode === 'TRANSFER'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  Transfer Bank Perusahaan
                </button>
              </div>
            </div>

            {/* Account Details based on Method */}
            {metode === 'TUNAI' ? (
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Rekening Sumber Otomatis:</span>
                  <span className="font-mono font-bold text-zinc-900">KAS01 (Kas Utama)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Saldo Aktual KAS01:</span>
                  <span className="font-bold text-emerald-800">{formatRupiah(kas01?.saldoSaatIni || 0)}</span>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Untuk metode tunai, rekening otomatis KAS01 tanpa perlu memilih rekening lain.
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs">
                <label className="block font-semibold text-sky-900">
                  Pilih Rekening Bank Pengeluaran <span className="text-rose-500">*</span>:
                </label>
                <select
                  value={rekeningSumber}
                  onChange={(e) => setRekeningSumber(e.target.value)}
                  className="w-full px-2.5 py-2 border border-sky-300 rounded bg-white text-xs font-medium"
                >
                  {availableBanks.map((b) => (
                    <option key={b.kode} value={b.kode}>
                      {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                    </option>
                  ))}
                </select>
                <div className="flex justify-between text-[11px] pt-1 border-t border-sky-200">
                  <span className="text-sky-800">Saldo Rekening Terpilih:</span>
                  <span className="font-bold text-sky-950 font-mono">
                    {formatRupiah(activeSourceAccount?.saldoSaatIni || 0)}
                  </span>
                </div>
              </div>
            )}

            {/* Balance check warning */}
            {!isBalanceSufficient && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-800 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Saldo Tidak Mencukupi!</strong>
                  <p className="text-[11px] mt-0.5">
                    Saldo rekening sumber ({formatRupiah(activeSourceAccount?.saldoSaatIni || 0)}) lebih kecil dari
                    nominal kasbon yang diajukan ({formatRupiah(nominal)}). Transaksi akan ditolak oleh sistem.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Keterangan / Keperluan Kasbon
              </label>
              <input
                type="text"
                placeholder="Misal: Modal beli pupuk / operasional panen"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
              />
            </div>

            <button
              type="button"
              disabled={nominal <= 0 || !isBalanceSufficient}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-2.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
            >
              Proses Kasbon Uang ({formatRupiah(nominal)})
            </button>
          </div>
        </div>

        {/* Right: History Kasbon Uang List */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-rose-600" />
                <h2 className="text-xs font-bold text-zinc-900 uppercase">Riwayat Kasbon Uang (DB_KASBON_UANG)</h2>
              </div>
              <span className="text-xs text-zinc-500">{kasbonUangList.length} Transaksi</span>
            </div>

            <div className="divide-y divide-zinc-100 max-h-[460px] overflow-y-auto text-xs">
              {kasbonUangList.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">Belum ada transaksi kasbon uang tercatat</div>
              ) : (
                kasbonUangList.map((k) => (
                  <div key={k.idTransaksi} className="p-3.5 hover:bg-zinc-50/70 transition-colors space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-zinc-900">{k.idTransaksi}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                            k.status === 'LUNAS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : k.status === 'SEBAGIAN'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {k.status}
                        </span>
                      </div>
                      <span className="font-bold text-rose-700 font-mono">{formatRupiah(k.nominal)}</span>
                    </div>

                    <div className="flex justify-between text-[11px] text-zinc-600">
                      <span>
                        Penerima: <strong>{k.namaMitra}</strong>
                      </span>
                      <span>
                        Sumber: <strong className="font-mono">{k.rekeningSumber}</strong> ({k.metode})
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px] text-zinc-400 pt-0.5">
                      <span className="truncate max-w-[240px]">{k.keterangan}</span>
                      <span>
                        {k.tanggal} · {k.jam}
                      </span>
                    </div>

                    {k.status !== 'LUNAS' && (
                      <div className="text-[10px] text-amber-700 font-medium">
                        Sisa Belum Dibayar: {formatRupiah(k.sisaKasbon)}
                      </div>
                    )}
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
            <div className="p-4 bg-rose-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Pengeluaran Kasbon Uang</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-rose-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Mitra Penerima:</span>
                  <span className="font-bold text-zinc-900">{selectedMitra?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Rekening Sumber Kas:</span>
                  <span className="font-mono font-bold text-zinc-900">
                    {activeSourceAccount?.nama} ({activeSourceAccount?.kode})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Saldo Sumber Saat Ini:</span>
                  <span className="font-semibold text-zinc-700">
                    {formatRupiah(activeSourceAccount?.saldoSaatIni || 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Nominal Kasbon:</span>
                  <span className="font-bold text-sm text-rose-700">{formatRupiah(nominal)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500">
                  <span>Estimasi Saldo Sumber Setelahnya:</span>
                  <span className="font-mono font-semibold">
                    {formatRupiah((activeSourceAccount?.saldoSaatIni || 0) - nominal)}
                  </span>
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
                  className="px-4 py-1.5 bg-rose-700 text-white font-bold rounded-md hover:bg-rose-800 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi & Berikan Uang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
