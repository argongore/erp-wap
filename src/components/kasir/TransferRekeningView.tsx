import React, { useState } from 'react';
import { ArrowLeftRight, CheckCircle2, AlertCircle, Info, Landmark, History, AlertTriangle, Pencil } from 'lucide-react';
import { Rekening, TransaksiTransferRekening } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';

interface Props {
  rekeningList: Rekening[];
  transferList: TransaksiTransferRekening[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const TransferRekeningView: React.FC<Props> = ({
  rekeningList,
  transferList,
  onSuccess,
  onRefresh,
}) => {
  // Only real active accounts, exclude virtual accounts BON01 and TIT01
  const validAccounts = rekeningList.filter((r) => !r.isVirtual && r.status === 'AKTIF');

  const [rekeningSumber, setRekeningSumber] = useState<string>(validAccounts[0]?.kode || 'KAS01');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>(validAccounts[1]?.kode || 'BNI01');
  const [nominalInput, setNominalInput] = useState<string>('5000000');
  const [keterangan, setKeterangan] = useState<string>('Setor kas operasional ke rekening bank');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [editTxId, setEditTxId] = useState<string | null>(null);

  const nominal = Number(nominalInput) || 0;

  const isAnakPerusahaanAccount = (r?: Rekening) =>
    Boolean(r && (r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN' || r.kode === 'REK-DPPARABO'));

  const sourceObj = validAccounts.find((r) => r.kode === rekeningSumber);
  const destObj = validAccounts.find((r) => r.kode === rekeningTujuan);

  const isSourceAnakPerusahaan = isAnakPerusahaanAccount(sourceObj);
  const isDestAnakPerusahaan = isAnakPerusahaanAccount(destObj);
  const isTouchAnakPerusahaan = isSourceAnakPerusahaan || isDestAnakPerusahaan;

  const isSameAccount = rekeningSumber === rekeningTujuan;
  const isBalanceSufficient = sourceObj
    ? isSourceAnakPerusahaan
      ? true
      : sourceObj.saldoSaatIni >= nominal
    : false;

  const handleProcessSubmit = async () => {
    setErrorMsg('');
    if (nominal <= 0) {
      setErrorMsg('Nominal transfer harus lebih dari Rp 0');
      return;
    }
    if (isSameAccount) {
      setErrorMsg('Rekening sumber dan rekening tujuan tidak boleh sama!');
      return;
    }
    if (!sourceObj || !destObj) {
      setErrorMsg('Rekening tidak valid');
      return;
    }
    if (!isBalanceSufficient) {
      setErrorMsg(
        `Saldo ${sourceObj.nama} (${sourceObj.kode}) tidak mencukupi! Saldo: ${formatRupiah(
          sourceObj.saldoSaatIni
        )}, Nominal: ${formatRupiah(nominal)}`
      );
      return;
    }

    setSubmitting(true);
    try {
      const result: TransaksiTransferRekening = await api.processTransferRekening({
        rekeningSumber,
        rekeningTujuan,
        nominal,
        keterangan,
      });

      setShowConfirmModal(false);
      onRefresh();

      const receipt: ReceiptData = {
        title: isTouchAnakPerusahaan
          ? 'BUKTI TRANSAKSI TERPADU ANAK PERUSAHAAN'
          : 'BUKTI TRANSFER ANTAR REKENING',
        subtitle: isTouchAnakPerusahaan
          ? '1 Transaksi Otomatis di Master Rekening & Mitra Anak Perusahaan'
          : 'Mutasi Dana Internal PT Wijaya Agro',
        nomorTransaksi: result.noTransfer,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitraTerkait || undefined,
        rekening: `${result.rekeningSumber} -> ${result.rekeningTujuan}`,
        kategori: 'TRANSFER_REKENING',
        detailRows: [
          {
            label: 'Jenis Mutasi',
            value: isTouchAnakPerusahaan
              ? '1 TRANSAKSI TERPADU (REKENING & MITRA ANAK PERUSAHAAN)'
              : 'TRANSFER INTERNAL PERUSAHAAN',
          },
          { label: 'Dari Rekening (Pengirim)', value: `${result.rekeningSumber} (${sourceObj?.nama})` },
          { label: 'Ke Rekening (Penerima)', value: `${result.rekeningTujuan} (${destObj?.nama})` },
          ...(result.namaMitraTerkait
            ? [{ label: 'Sinkron Buku Mitra', value: `${result.namaMitraTerkait} (Otomatis 1 Transaksi)` }]
            : []),
          { label: 'Status Transaksi', value: result.status, highlight: true },
          { label: 'Nominal Perpindahan Dana', value: result.nominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Otorisasi Kasir / Keuangan',
      };

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses transfer rekening');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Transfer Antar Rekening Perusahaan</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
              FITUR BARU E
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Perpindahan dana kas/bank internal perusahaan secara aman, tercatat di audit log, dan tanpa distorsi laba rugi
          </p>
        </div>
      </div>

      {/* Info Rules Box */}
      <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-xl text-xs text-sky-950 space-y-1">
        <div className="flex items-center space-x-2 font-bold text-sky-900">
          <Info className="w-4 h-4 text-sky-700" />
          <span>Aturan Ketat Transfer Antar Rekening:</span>
        </div>
        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-sky-900 pl-1">
          <li>
            Murni pergerakan uang internal milik perusahaan sendiri. <strong>TIDAK mempengaruhi</strong> omzet penjualan,
            pembelian hasil bumi, saldo mitra, ataupun bon.
          </li>
          <li>
            <strong>DILARANG</strong> melibatkan rekening virtual BON01 dan TIT01.
          </li>
          <li>
            Rekening sumber dan tujuan tidak boleh sama. Saldo rekening sumber wajib diverifikasi langsung dari server.
          </li>
        </ul>
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
              Formulir Transfer Dana Internal
            </h2>

            {/* Rekening Sumber */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Rekening Sumber (Pengirim Dana) <span className="text-rose-500">*</span>
              </label>
              <select
                value={rekeningSumber}
                onChange={(e) => setRekeningSumber(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-sky-600"
              >
                {validAccounts.map((r) => (
                  <option key={r.kode} value={r.kode}>
                    {r.nama} ({r.kode}){isAnakPerusahaanAccount(r) ? ' [Anak Perusahaan & Mitra]' : ''} — Saldo: {formatRupiah(r.saldoSaatIni)}
                  </option>
                ))}
              </select>
              <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                <span>Saldo Aktual Sumber:</span>
                <span className="font-bold text-emerald-800 font-mono tabular-nums">
                  {formatRupiah(sourceObj?.saldoSaatIni || 0)}
                </span>
              </div>
            </div>

            {/* Rekening Tujuan */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Rekening Tujuan (Penerima Dana) <span className="text-rose-500">*</span>
              </label>
              <select
                value={rekeningTujuan}
                onChange={(e) => setRekeningTujuan(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-sky-600"
              >
                {validAccounts.map((r) => (
                  <option key={r.kode} value={r.kode}>
                    {r.nama} ({r.kode}){isAnakPerusahaanAccount(r) ? ' [Anak Perusahaan & Mitra]' : ''} — Saldo: {formatRupiah(r.saldoSaatIni)}
                  </option>
                ))}
              </select>
              <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                <span>Saldo Aktual Tujuan:</span>
                <span className="font-bold text-sky-800 font-mono tabular-nums">
                  {formatRupiah(destObj?.saldoSaatIni || 0)}
                </span>
              </div>
            </div>

            {/* Banner Mode 1 Transaksi Terpadu Anak Perusahaan */}
            {isTouchAnakPerusahaan && !isSameAccount && (
              <div className="p-3 bg-teal-50/80 border border-teal-300 rounded-lg text-xs text-teal-950 space-y-1">
                <div className="font-bold text-teal-900">
                  Mode 1 Transaksi Terpadu (Rekening &amp; Mitra Anak Perusahaan)
                </div>
                <p className="text-[11px] text-zinc-700 leading-relaxed">
                  {isDestAnakPerusahaan
                    ? `Menyimpan dana ke ${destObj?.nama} (${destObj?.kode}) otomatis tercatat sebagai 1 transaksi di Master Rekening sekaligus di Rekening Koran Mitra ${destObj?.nama}.`
                    : `Menarik / memakai dana dari ${sourceObj?.nama} (${sourceObj?.kode}) otomatis tercatat sebagai 1 transaksi di Master Rekening & Buku Mitra. Jika melebihi saldo tersimpan, otomatis diakui sebagai Dana Talangan Anak Perusahaan ke PT.`}
                </p>
              </div>
            )}

            {/* Same Account Warning */}
            {isSameAccount && (
              <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-800">
                ⚠ Rekening sumber dan tujuan tidak boleh sama!
              </div>
            )}

            {/* Nominal */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Nominal Transfer (Rp) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                required
                value={nominalInput}
                onChange={(e) => setNominalInput(e.target.value)}
                className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg text-sm font-mono font-bold focus:ring-1 focus:ring-sky-600"
              />
              <div className="text-xs font-semibold text-sky-800 mt-1">{formatRupiah(nominal)}</div>
            </div>

            {/* Balance check warning */}
            {!isBalanceSufficient && !isSameAccount && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-800 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Saldo Sumber Tidak Cukup!</strong>
                  <p className="text-[11px] mt-0.5">
                    Saldo {sourceObj?.kode} ({formatRupiah(sourceObj?.saldoSaatIni || 0)}) tidak cukup untuk transfer{' '}
                    {formatRupiah(nominal)}.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Keterangan / Alasan Mutasi
              </label>
              <input
                type="text"
                placeholder="Misal: Penarikan tunai dari bank / Setoran harian"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
              />
            </div>

            <button
              type="button"
              disabled={nominal <= 0 || isSameAccount || !isBalanceSufficient}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
            >
              Eksekusi Transfer Antar Rekening ({formatRupiah(nominal)})
            </button>
          </div>
        </div>

        {/* Right: History Transfer List */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-sky-600" />
                <h2 className="text-xs font-bold text-zinc-900 uppercase">
                  Riwayat Mutasi (DB_TRANSFER_REKENING)
                </h2>
              </div>
              <span className="text-xs text-zinc-500">{transferList.length} Transaksi</span>
            </div>

            <div className="divide-y divide-zinc-100 max-h-[460px] overflow-y-auto text-xs">
              {transferList.length === 0 ? (
                <div className="py-12 text-center text-zinc-400">Belum ada mutasi antar rekening tercatat</div>
              ) : (
                transferList.map((t) => (
                  <div key={t.noTransfer} className="p-3.5 hover:bg-zinc-50/70 transition-colors space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-zinc-900">{t.noTransfer}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                          {t.status}
                        </span>
                      </div>
                      <span className="font-bold text-sky-700 font-mono">{formatRupiah(t.nominal)}</span>
                    </div>

                    <div className="flex items-center space-x-2 text-[11px] font-medium text-zinc-700">
                      <span className="bg-zinc-100 px-1.5 py-0.5 rounded font-mono">{t.rekeningSumber}</span>
                      <ArrowLeftRight className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="bg-sky-50 text-sky-800 px-1.5 py-0.5 rounded font-mono font-bold">
                        {t.rekeningTujuan}
                      </span>
                      {t.namaMitraTerkait && (
                        <span className="text-[10px] text-teal-800 font-semibold">
                          · 1 Transaksi Mitra: {t.namaMitraTerkait}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1">
                      <span className="truncate max-w-[200px]">{t.keterangan}</span>
                      <div className="flex items-center gap-2">
                        <span>
                          {t.tanggal} · {t.jam}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditTxId(t.noTransfer)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 font-semibold text-[10px] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>Edit</span>
                        </button>
                      </div>
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
            <div className="p-4 bg-sky-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Transfer Antar Rekening</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-sky-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Dari Rekening:</span>
                  <span className="font-mono font-bold text-rose-700">
                    {sourceObj?.kode} ({sourceObj?.nama})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Ke Rekening:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {destObj?.kode} ({destObj?.nama})
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Nominal Transfer:</span>
                  <span className="font-bold text-sm text-sky-800">{formatRupiah(nominal)}</span>
                </div>
                <div className="text-[11px] text-zinc-500 space-y-0.5 pt-1">
                  <div className="flex justify-between">
                    <span>Sisa Saldo {sourceObj?.kode}:</span>
                    <span className="font-mono">{formatRupiah((sourceObj?.saldoSaatIni || 0) - nominal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Saldo Baru {destObj?.kode}:</span>
                    <span className="font-mono">{formatRupiah((destObj?.saldoSaatIni || 0) + nominal)}</span>
                  </div>
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
                  className="px-4 py-1.5 bg-sky-700 text-white font-bold rounded-md hover:bg-sky-800 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi & Pindahkan Dana'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal Edit Detail Transfer Rekening */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="TRANSFER_REKENING"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
        }}
      />
    </div>
  );
};
