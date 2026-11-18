import React, { useState, useEffect } from 'react';
import { ArrowLeftRight, ShieldCheck, AlertCircle, UserCheck } from 'lucide-react';
import type { Rekening, TransaksiTransferRekening } from '../../server/types.ts';
import { formatRupiah, dmyToIsoInput } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from './PrintReceiptModal.tsx';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  rekeningList: Rekening[];
  targetRekeningKode?: string;
  initialArah?: 'TITIP' | 'KEMBALIKAN';
  onSuccess: (receipt?: ReceiptData) => void;
}

export const ModalTransaksiRekeningTitip: React.FC<Props> = ({
  isOpen,
  onClose,
  rekeningList,
  targetRekeningKode,
  initialArah = 'TITIP',
  onSuccess,
}) => {
  const isRekeningTitip = (r?: Rekening) =>
    Boolean(r && (r.isRekeningTitip || r.kategori === 'REKENING_TITIP'));
  const isRekeningPerusahaan = (r?: Rekening) =>
    Boolean(
      r &&
        !r.isVirtual &&
        !isRekeningTitip(r) &&
        !r.isAnakPerusahaan &&
        r.kategori !== 'ANAK_PERUSAHAAN' &&
        r.kategori !== 'OPERASIONAL_DIVISI' &&
        r.status === 'AKTIF' &&
        (r.kategori === 'PERUSAHAAN' || !r.kode.startsWith('REK-'))
    );

  const titipAccounts = rekeningList.filter((r) => !r.isVirtual && isRekeningTitip(r));
  const perusahaanAccounts = rekeningList.filter(isRekeningPerusahaan);

  const [arahMutasi, setArahMutasi] = useState<'TITIP' | 'KEMBALIKAN'>(initialArah);
  const [kodeTitip, setKodeTitip] = useState<string>(
    targetRekeningKode || titipAccounts[0]?.kode || ''
  );
  const [kodeLawan, setKodeLawan] = useState<string>(
    perusahaanAccounts.find((p) => p.kode === 'BCA01')?.kode ||
      perusahaanAccounts[0]?.kode ||
      'KAS01'
  );
  const [tanggalInput, setTanggalInput] = useState<string>(dmyToIsoInput());
  const [nominalInput, setNominalInput] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setArahMutasi(initialArah);
      setKodeTitip(targetRekeningKode || titipAccounts[0]?.kode || '');
      if (
        perusahaanAccounts.length > 0 &&
        !perusahaanAccounts.some((p) => p.kode === kodeLawan)
      ) {
        setKodeLawan(
          perusahaanAccounts.find((p) => p.kode === 'BCA01')?.kode ||
            perusahaanAccounts[0].kode
        );
      }
      setTanggalInput(dmyToIsoInput());
      setErrorMsg('');
    }
  }, [isOpen, targetRekeningKode, initialArah]);

  if (!isOpen) return null;

  const titipRek =
    rekeningList.find((r) => r.kode === kodeTitip) || titipAccounts[0];
  const lawanRek = rekeningList.find((r) => r.kode === kodeLawan);
  const nominal = Number(nominalInput) || 0;
  const namaKaryawan =
    titipRek?.namaKaryawanTerkait || titipRek?.namaMitraTerkait || titipRek?.atasNama || 'Karyawan';

  const estimasiSaldoTitipSetelah =
    (titipRek?.saldoSaatIni || 0) + (arahMutasi === 'TITIP' ? nominal : -nominal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!titipRek || !lawanRek) {
      setErrorMsg('Pilih rekening perusahaan dan rekening titip uang yang valid.');
      return;
    }
    if (nominal <= 0) {
      setErrorMsg('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }
    if (arahMutasi === 'TITIP' && lawanRek.saldoSaatIni < nominal) {
      setErrorMsg(
        `Saldo ${lawanRek.nama} (${lawanRek.kode}) tidak mencukupi. Tersedia: ${formatRupiah(
          lawanRek.saldoSaatIni
        )}.`
      );
      return;
    }
    if (arahMutasi === 'KEMBALIKAN' && titipRek.saldoSaatIni < nominal) {
      setErrorMsg(
        `Saldo Rekening Titip ${titipRek.nama} (${titipRek.kode}) hanya ${formatRupiah(
          titipRek.saldoSaatIni
        )}.`
      );
      return;
    }

    const rekeningSumber = arahMutasi === 'TITIP' ? lawanRek.kode : titipRek.kode;
    const rekeningTujuan = arahMutasi === 'TITIP' ? titipRek.kode : lawanRek.kode;
    const defaultKet =
      arahMutasi === 'TITIP'
        ? `Titip dana backup transaksi dari ${lawanRek.nama} ke ${titipRek.nama} (Pemegang: ${namaKaryawan})`
        : `Pengembalian sisa uang titip dari ${titipRek.nama} (${namaKaryawan}) ke ${lawanRek.nama}`;

    setSubmitting(true);
    try {
      const result: TransaksiTransferRekening = await api.processTransferRekening({
        rekeningSumber,
        rekeningTujuan,
        nominal,
        tanggal: tanggalInput,
        keterangan: keterangan.trim() || defaultKet,
      });

      const receipt: ReceiptData = {
        title:
          arahMutasi === 'TITIP'
            ? 'BUKTI PENITIPAN DANA PERUSAHAAN'
            : 'BUKTI PENGEMBALIAN DANA TITIP',
        subtitle: `Rekening Titip Uang · Terhubung ke Rekening Koran ${namaKaryawan}`,
        nomorTransaksi: result.noTransfer,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: namaKaryawan,
        rekening: `${result.rekeningSumber} -> ${result.rekeningTujuan}`,
        kategori: 'TRANSFER_REKENING',
        detailRows: [
          {
            label: 'Jenis Mutasi Amanah',
            value:
              arahMutasi === 'TITIP'
                ? `Titip Dana ke ${titipRek.nama}`
                : `Kembalikan Sisa Dana dari ${titipRek.nama}`,
          },
          { label: 'Karyawan Pemegang Amanah', value: namaKaryawan },
          {
            label: arahMutasi === 'TITIP' ? 'Sumber Rekening PT' : 'Masuk ke Rekening PT',
            value: `${lawanRek.kode} (${lawanRek.nama})`,
          },
          {
            label: 'Saldo Rekening Titip Setelah Mutasi',
            value: formatRupiah(estimasiSaldoTitipSetelah),
            highlight: true,
          },
          { label: 'Nominal Transaksi', value: result.nominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Keuangan PT. Wijaya Agro Perkasa',
      };

      setNominalInput('');
      setKeterangan('');
      onClose();
      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses mutasi rekening titip uang.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-zinc-200 animate-in fade-in">
        <div className="p-4 bg-sky-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-5 h-5 text-sky-200 shrink-0" />
            <div>
              <h3 className="font-bold text-sm">Titip / Tarik Dana Rekening Titip Uang</h3>
              <p className="text-[11px] text-sky-100">
                Terhubung otomatis ke Rekening Koran Karyawan untuk audit belanja transaksi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sky-200 hover:text-white text-sm px-2 py-1 cursor-pointer"
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
                setArahMutasi('TITIP');
                setErrorMsg('');
              }}
              className={`py-2 px-3 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                arahMutasi === 'TITIP'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              + Titipkan Dana PT
            </button>
            <button
              type="button"
              onClick={() => {
                setArahMutasi('KEMBALIKAN');
                setErrorMsg('');
              }}
              className={`py-2 px-3 rounded-lg font-bold transition-colors cursor-pointer text-xs ${
                arahMutasi === 'KEMBALIKAN'
                  ? 'bg-amber-700 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              ↩ Kembalikan Sisa Dana
            </button>
          </div>

          {/* Info Pemegang Rekening Titip */}
          {titipRek && (
            <div className="p-3.5 bg-sky-50/80 border border-sky-200 rounded-xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] text-sky-950 font-bold truncate">
                  {titipRek.nama} · <span className="font-mono">{titipRek.kode}</span>
                </div>
                <div className="flex items-center space-x-1 text-[11px] text-sky-800 mt-0.5">
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Pemegang Amanah: <strong>{namaKaryawan}</strong>
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] text-zinc-500">Sisa Dana Titip</div>
                <div className="font-mono text-sm font-black tabular-nums text-sky-900">
                  {formatRupiah(titipRek.saldoSaatIni)}
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

          {titipAccounts.length > 1 && (
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Pilih Rekening Titip Tujuan/Sumber
              </label>
              <select
                value={kodeTitip}
                onChange={(e) => setKodeTitip(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-medium bg-white"
              >
                {titipAccounts.map((t) => (
                  <option key={t.kode} value={t.kode}>
                    {t.nama} ({t.kode}) — Pemegang: {t.namaKaryawanTerkait || t.atasNama} · Saldo:{' '}
                    {formatRupiah(t.saldoSaatIni)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              {arahMutasi === 'TITIP'
                ? 'Sumber Kas / Bank Perusahaan (Misal: BCA / BNI / KAS01)'
                : 'Tujuan Setor Balik ke Rekening Perusahaan'}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={kodeLawan}
              onChange={(e) => setKodeLawan(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold bg-white focus:ring-1 focus:ring-sky-600"
            >
              {perusahaanAccounts.map((p) => (
                <option key={p.kode} value={p.kode}>
                  {p.nama} ({p.kode}) — Saldo: {formatRupiah(p.saldoSaatIni)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">
                Nominal (Rp) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="any"
                required
                placeholder="Misal: 50000000"
                value={nominalInput}
                onChange={(e) => setNominalInput(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono text-sm font-bold tabular-nums focus:ring-1 focus:ring-sky-600"
              />
            </div>
            <div>
              <label className="block font-semibold text-zinc-700 mb-1">Tanggal Mutasi</label>
              <input
                type="date"
                value={tanggalInput}
                onChange={(e) => setTanggalInput(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-medium bg-white"
              />
            </div>
          </div>

          {nominal > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px]">
              <span className="text-zinc-600">
                Estimasi saldo <strong>{titipRek?.nama}</strong> setelah mutasi:
              </span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  estimasiSaldoTitipSetelah >= 0 ? 'text-sky-900' : 'text-rose-700'
                }`}
              >
                {formatRupiah(estimasiSaldoTitipSetelah)}
              </span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">Keterangan / Tujuan Penitipan</label>
            <input
              type="text"
              placeholder={
                arahMutasi === 'TITIP'
                  ? 'Misal: Dana cadangan backup BCA selama owner perjalanan luar kota...'
                  : 'Misal: Pengembalian sisa dana titip backup transaksi...'
              }
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
            />
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
              disabled={submitting}
              className={`px-5 py-2 text-white font-bold rounded-lg disabled:opacity-50 shadow-xs cursor-pointer flex items-center space-x-1.5 ${
                arahMutasi === 'TITIP'
                  ? 'bg-sky-700 hover:bg-sky-800'
                  : 'bg-amber-700 hover:bg-amber-800'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Memproses...'
                  : arahMutasi === 'TITIP'
                  ? 'Titipkan Dana Sekarang'
                  : 'Kembalikan Dana'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
