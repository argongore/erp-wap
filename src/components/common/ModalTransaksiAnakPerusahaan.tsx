import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, Building2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Rekening, TransaksiTransferRekening } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from './PrintReceiptModal.tsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rekeningList: Rekening[];
  targetRekeningKode?: string;
  onSuccess: (receipt?: ReceiptData) => void;
}

export const ModalTransaksiAnakPerusahaan: React.FC<Props> = ({
  isOpen,
  onClose,
  rekeningList,
  targetRekeningKode = 'REK-DPPARABO',
  onSuccess,
}) => {
  const isAnakPerusahaanRek = (r?: Rekening) =>
    Boolean(r && (r.isAnakPerusahaan || r.kategori === 'ANAK_PERUSAHAAN' || r.kode === 'REK-DPPARABO'));

  const anakPerusahaanAccounts = rekeningList.filter((r) => !r.isVirtual && isAnakPerusahaanRek(r));
  const perusahaanAccounts = rekeningList.filter(
    (r) => !r.isVirtual && !isAnakPerusahaanRek(r) && r.status === 'AKTIF'
  );

  const [arahMutasi, setArahMutasi] = useState<'SIMPAN' | 'TARIK'>('SIMPAN');
  const [kodeAnakPerusahaan, setKodeAnakPerusahaan] = useState<string>(targetRekeningKode);
  const [kodeRekeningLawannya, setKodeRekeningLawannya] = useState<string>(
    perusahaanAccounts[0]?.kode || 'KAS01'
  );
  const [nominalInput, setNominalInput] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setKodeAnakPerusahaan(targetRekeningKode || anakPerusahaanAccounts[0]?.kode || 'REK-DPPARABO');
      if (perusahaanAccounts.length > 0 && !perusahaanAccounts.some((p) => p.kode === kodeRekeningLawannya)) {
        setKodeRekeningLawannya(perusahaanAccounts[0].kode);
      }
      setErrorMsg('');
    }
  }, [isOpen, targetRekeningKode]);

  if (!isOpen) return null;

  const anakRek =
    rekeningList.find((r) => r.kode === kodeAnakPerusahaan) || anakPerusahaanAccounts[0];
  const lawanRek = rekeningList.find((r) => r.kode === kodeRekeningLawannya);
  const nominal = Number(nominalInput) || 0;

  const isLawanBalanceSufficient =
    arahMutasi === 'SIMPAN' ? (lawanRek ? lawanRek.saldoSaatIni >= nominal : false) : true;

  const estimasiSaldoAnakSetelah =
    (anakRek?.saldoSaatIni || 0) + (arahMutasi === 'SIMPAN' ? nominal : -nominal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!anakRek || !lawanRek) {
      setErrorMsg('Pilih rekening perusahaan dan rekening anak perusahaan yang valid.');
      return;
    }
    if (nominal <= 0) {
      setErrorMsg('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }
    if (arahMutasi === 'SIMPAN' && lawanRek.saldoSaatIni < nominal) {
      setErrorMsg(
        `Saldo ${lawanRek.nama} (${lawanRek.kode}) tidak mencukupi. Tersedia: ${formatRupiah(
          lawanRek.saldoSaatIni
        )}.`
      );
      return;
    }

    const rekeningSumber = arahMutasi === 'SIMPAN' ? lawanRek.kode : anakRek.kode;
    const rekeningTujuan = arahMutasi === 'SIMPAN' ? anakRek.kode : lawanRek.kode;
    const defaultKet =
      arahMutasi === 'SIMPAN'
        ? `Simpan dana PT dari ${lawanRek.nama} ke Anak Perusahaan ${anakRek.nama}`
        : `Tarik / pakai dana dari Anak Perusahaan ${anakRek.nama} ke ${lawanRek.nama}`;

    setSubmitting(true);
    try {
      const result: TransaksiTransferRekening = await api.processTransferRekening({
        rekeningSumber,
        rekeningTujuan,
        nominal,
        keterangan: keterangan.trim() || defaultKet,
      });

      const receipt: ReceiptData = {
        title: 'BUKTI TRANSAKSI TERPADU ANAK PERUSAHAAN',
        subtitle: '1 Transaksi Otomatis Tersimpan di Master Rekening & Mitra',
        nomorTransaksi: result.noTransfer,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitraTerkait || anakRek.nama,
        rekening: `${result.rekeningSumber} -> ${result.rekeningTujuan}`,
        kategori: 'TRANSAKSI_ANAK_PERUSAHAAN',
        detailRows: [
          {
            label: 'Jenis Mutasi Terpadu',
            value:
              arahMutasi === 'SIMPAN'
                ? `Simpan Dana PT ke ${anakRek.nama}`
                : `Tarik / Talangan Dana dari ${anakRek.nama}`,
          },
          { label: 'Entitas Anak Perusahaan & Mitra', value: `${anakRek.nama} (${anakRek.kode})` },
          {
            label: arahMutasi === 'SIMPAN' ? 'Dari Kas/Bank PT' : 'Masuk ke Kas/Bank PT',
            value: `${lawanRek.kode} (${lawanRek.nama})`,
          },
          {
            label: 'Saldo Anak Perusahaan Setelah Transaksi',
            value: formatRupiah(estimasiSaldoAnakSetelah),
            highlight: true,
          },
          { label: 'Nominal Transaksi Terpadu', value: result.nominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Keuangan PT. Wijaya Agro Perkasa',
      };

      setNominalInput('');
      setKeterangan('');
      onClose();
      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan transaksi terpadu anak perusahaan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in fade-in">
        <div className="p-4 bg-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Building2 className="w-5 h-5 text-teal-200 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Transaksi Terpadu Anak Perusahaan &amp; Mitra</h3>
              <p className="text-[11px] text-teal-100">
                Otomatis tercatat sebagai 1 transaksi di Master Rekening &amp; Rekening Koran Mitra
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-teal-200 hover:text-white text-sm px-2 py-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Toggle Arah Mutasi */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setArahMutasi('SIMPAN');
                setErrorMsg('');
              }}
              className={`py-2 px-3 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                arahMutasi === 'SIMPAN'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Simpan Dana ke {anakRek?.nama || 'DP Parabot'}
            </button>
            <button
              type="button"
              onClick={() => {
                setArahMutasi('TARIK');
                setErrorMsg('');
              }}
              className={`py-2 px-3 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                arahMutasi === 'TARIK'
                  ? 'bg-amber-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tarik / Pakai Dana {anakRek?.nama || 'DP Parabot'}
            </button>
          </div>

          {/* Info Saldo Anak Perusahaan Saat Ini */}
          {anakRek && (
            <div className="p-3.5 bg-teal-50/70 border border-teal-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[11px] text-teal-900 font-semibold">
                  {anakRek.nama} · <span className="font-mono">{anakRek.kode}</span>
                </div>
                <div className="text-[11px] text-zinc-600 mt-0.5">
                  {anakRek.saldoSaatIni > 0
                    ? 'Dana PT. Wijaya Agro Perkasa tersimpan di anak perusahaan'
                    : anakRek.saldoSaatIni < 0
                    ? 'Dana talangan dari anak perusahaan ke PT. Wijaya Agro Perkasa'
                    : 'Posisi saldo saat ini impas (Rp 0)'}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-mono text-sm font-black tabular-nums ${
                    anakRek.saldoSaatIni >= 0 ? 'text-teal-900' : 'text-rose-700'
                  }`}
                >
                  {formatRupiah(anakRek.saldoSaatIni)}
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {anakPerusahaanAccounts.length > 1 && (
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Rekening Anak Perusahaan
              </label>
              <select
                value={kodeAnakPerusahaan}
                onChange={(e) => setKodeAnakPerusahaan(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-medium bg-white"
              >
                {anakPerusahaanAccounts.map((a) => (
                  <option key={a.kode} value={a.kode}>
                    {a.nama} ({a.kode}) — Saldo: {formatRupiah(a.saldoSaatIni)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pilih Kas/Bank PT */}
          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              {arahMutasi === 'SIMPAN'
                ? 'Sumber Kas / Bank PT (Pengirim Dana)'
                : 'Tujuan Kas / Bank PT (Penerima Dana)'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={kodeRekeningLawannya}
              onChange={(e) => setKodeRekeningLawannya(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold bg-white focus:ring-1 focus:ring-teal-600"
            >
              {perusahaanAccounts.map((p) => (
                <option key={p.kode} value={p.kode}>
                  {p.nama} ({p.kode}) — Saldo: {formatRupiah(p.saldoSaatIni)}
                </option>
              ))}
            </select>
          </div>

          {/* Nominal */}
          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Nominal Transaksi (Rp) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="1000"
              required
              placeholder="Masukkan nominal rupiah..."
              value={nominalInput}
              onChange={(e) => setNominalInput(e.target.value)}
              className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg font-mono text-sm font-bold tabular-nums focus:ring-1 focus:ring-teal-600"
            />
            {nominal > 0 && (
              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500">Estimasi saldo {anakRek?.nama} setelah mutasi:</span>
                <span
                  className={`font-mono font-bold tabular-nums ${
                    estimasiSaldoAnakSetelah >= 0 ? 'text-teal-800' : 'text-amber-800'
                  }`}
                >
                  {formatRupiah(estimasiSaldoAnakSetelah)}
                  {estimasiSaldoAnakSetelah < 0 ? ' (Talangan ke PT)' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Keterangan */}
          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Keterangan Transaksi
            </label>
            <input
              type="text"
              placeholder={
                arahMutasi === 'SIMPAN'
                  ? 'Contoh: Titip simpan setoran kas harian di DP Parabot'
                  : 'Contoh: Pakai dana DP Parabot untuk tambahan kasir gudang'
              }
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
            />
          </div>

          {/* Info 1 Transaksi */}
          <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] text-zinc-600 flex items-start space-x-2">
            <ArrowLeftRight className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <span>
              Transaksi ini otomatis tersimpan sebagai <strong>1 Transaksi Terpadu</strong> di{' '}
              <strong>Master Rekening ({anakRek?.kode})</strong> sekaligus di{' '}
              <strong>Buku Besar / Rekening Koran Mitra ({anakRek?.nama})</strong> di Cloud Supabase.
            </span>
          </div>

          <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || nominal <= 0 || !isLawanBalanceSufficient}
              className="px-5 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-lg shadow-xs cursor-pointer flex items-center space-x-1.5"
            >
              {submitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{submitting ? 'Menyimpan...' : 'Simpan 1 Transaksi Terpadu'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
