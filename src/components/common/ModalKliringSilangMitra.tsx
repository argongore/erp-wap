import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  HandCoins,
  Scale,
  Wallet,
  Wheat,
  X,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { HasilKliringSilangResponse, Rekening } from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat } from '../../utils/format.ts';
import { ReceiptData } from './PrintReceiptModal.tsx';

export interface KliringSilangTargetMitra {
  id: string;
  kode: string;
  nama: string;
  totalBonMitra: number;
  nominalPiutangAktif?: number;
  nominalNotaNgunci?: number;
  totalHutangTitipPanen: number;
  totalTitipPanenMurni?: number;
  totalUpahBelumDibayar?: number;
}

export type KliringModalMode = 'KLIRING_SILANG' | 'AMBIL_UANG_DULU';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mitra: KliringSilangTargetMitra | null;
  rekeningList?: Rekening[];
  initialMode?: KliringModalMode;
  onSuccess: (result: HasilKliringSilangResponse, receipt: ReceiptData) => void;
}

export const ModalKliringSilangMitra: React.FC<Props> = ({
  isOpen,
  onClose,
  mitra,
  rekeningList = [],
  initialMode = 'KLIRING_SILANG',
  onSuccess,
}) => {
  const [activeMode, setActiveMode] = useState<KliringModalMode>('KLIRING_SILANG');
  const [nominalPotongInput, setNominalPotongInput] = useState<string>('');
  const [aksiSisa, setAksiSisa] = useState<
    'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON'
  >('HANYA_POTONG_SILANG');
  const [nominalFisikInput, setNominalFisikInput] = useState<string>('');
  const [nominalAmbilDuluInput, setNominalAmbilDuluInput] = useState<string>('');
  const [metodeFisik, setMetodeFisik] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningFisik, setRekeningFisik] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const bankAccounts = useMemo(
    () =>
      (rekeningList || []).filter(
        (r) =>
          r.status === 'AKTIF' &&
          !r.isVirtual &&
          r.kode !== 'BON01' &&
          r.kode !== 'TIT01' &&
          r.kode !== 'KAS01'
      ),
    [rekeningList]
  );

  const kasirAccount = useMemo(
    () => (rekeningList || []).find((r) => r.kode === 'KAS01'),
    [rekeningList]
  );

  const totalPiutang = Math.max(0, Math.round(mitra?.totalBonMitra || 0));
  const nominalNgunci = Math.max(0, Math.round(mitra?.nominalNotaNgunci || 0));
  const piutangAktif = Math.max(
    0,
    Math.round(mitra?.nominalPiutangAktif ?? Math.max(0, totalPiutang - nominalNgunci))
  );
  const totalHutangPt = Math.max(0, Math.round(mitra?.totalHutangTitipPanen || 0));
  const maxPotongSilang = Math.min(totalPiutang, totalHutangPt);
  const selisihHutangAwal = Math.max(0, totalHutangPt - totalPiutang);
  const selisihPiutangAwal = Math.max(0, totalPiutang - totalHutangPt);

  useEffect(() => {
    if (isOpen && mitra) {
      const piutang = Math.max(0, Math.round(mitra.totalBonMitra || 0));
      const hutang = Math.max(0, Math.round(mitra.totalHutangTitipPanen || 0));
      const defaultMax = Math.min(piutang, hutang);
      const netHutang = Math.max(0, hutang - piutang);

      const resolvedMode: KliringModalMode =
        initialMode === 'AMBIL_UANG_DULU' || defaultMax <= 0
          ? 'AMBIL_UANG_DULU'
          : 'KLIRING_SILANG';

      setActiveMode(resolvedMode);
      setNominalPotongInput(defaultMax > 0 ? defaultMax.toLocaleString('id-ID') : '');
      setAksiSisa('HANYA_POTONG_SILANG');
      setNominalFisikInput('');
      setNominalAmbilDuluInput(
        netHutang > 0
          ? netHutang.toLocaleString('id-ID')
          : hutang > 0
            ? hutang.toLocaleString('id-ID')
            : ''
      );
      setMetodeFisik('TUNAI');
      setRekeningFisik(bankAccounts[0]?.kode || '');
      setKeterangan('');
      setErrorMsg('');
    }
  }, [isOpen, mitra, initialMode, bankAccounts]);

  if (!isOpen || !mitra) return null;

  const parseDigits = (raw: string): number => {
    const digits = raw.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  };

  const isAmbilDuluMode = activeMode === 'AMBIL_UANG_DULU';

  const nominalPotong = isAmbilDuluMode ? 0 : parseDigits(nominalPotongInput);
  const sisaPiutangSetelahPotong = Math.max(0, totalPiutang - nominalPotong);
  const sisaHutangSetelahPotong = Math.max(0, totalHutangPt - nominalPotong);

  const nominalFisik = isAmbilDuluMode
    ? parseDigits(nominalAmbilDuluInput)
    : parseDigits(nominalFisikInput);

  const effectiveAksiSisa:
    | 'HANYA_POTONG_SILANG'
    | 'CAIRKAN_SISA_TITIPAN'
    | 'TERIMA_PELUNASAN_SISA_BON' = isAmbilDuluMode ? 'CAIRKAN_SISA_TITIPAN' : aksiSisa;

  const sisaPiutangAkhir =
    effectiveAksiSisa === 'TERIMA_PELUNASAN_SISA_BON'
      ? Math.max(0, sisaPiutangSetelahPotong - nominalFisik)
      : sisaPiutangSetelahPotong;
  const sisaHutangAkhir =
    effectiveAksiSisa === 'CAIRKAN_SISA_TITIPAN'
      ? Math.max(0, sisaHutangSetelahPotong - nominalFisik)
      : sisaHutangSetelahPotong;

  const selisihHutangAkhir = Math.max(0, sisaHutangAkhir - sisaPiutangAkhir);
  const selisihPiutangAkhir = Math.max(0, sisaPiutangAkhir - sisaHutangAkhir);

  const labelYangHarusDibayarAwal =
    selisihHutangAwal > 0
      ? `HUTANG ${formatRupiah(selisihHutangAwal)}`
      : selisihPiutangAwal > 0
        ? `PIUTANG ${formatRupiah(selisihPiutangAwal)}`
        : 'IMPAS (Rp 0)';

  const labelYangHarusDibayarAkhir =
    selisihHutangAkhir > 0
      ? `HUTANG ${formatRupiah(selisihHutangAkhir)}`
      : selisihPiutangAkhir > 0
        ? `PIUTANG ${formatRupiah(selisihPiutangAkhir)}`
        : 'LUNAS / IMPAS (Rp 0)';

  const handleSelectAksiSisa = (
    nextAksi: 'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON'
  ) => {
    setAksiSisa(nextAksi);
    if (nextAksi === 'CAIRKAN_SISA_TITIPAN') {
      setNominalFisikInput(
        sisaHutangSetelahPotong > 0 ? sisaHutangSetelahPotong.toLocaleString('id-ID') : ''
      );
    } else if (nextAksi === 'TERIMA_PELUNASAN_SISA_BON') {
      setNominalFisikInput(
        sisaPiutangSetelahPotong > 0 ? sisaPiutangSetelahPotong.toLocaleString('id-ID') : ''
      );
    } else {
      setNominalFisikInput('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (isAmbilDuluMode) {
      if (nominalFisik <= 0) {
        setErrorMsg('Masukkan nominal pengambilan uang titipan lebih dari Rp 0.');
        return;
      }
      if (nominalFisik > totalHutangPt) {
        setErrorMsg(
          `Nominal pengambilan uang (${formatRupiah(nominalFisik)}) melebihi total saldo titipan mitra (${formatRupiah(totalHutangPt)}).`
        );
        return;
      }
      if (metodeFisik === 'TRANSFER' && !rekeningFisik) {
        setErrorMsg('Pilih rekening bank sumber pembayaran.');
        return;
      }
    } else {
      if (nominalPotong <= 0 && nominalFisik <= 0) {
        setErrorMsg('Masukkan nominal kliring potong bon lebih dari Rp 0.');
        return;
      }
      if (nominalPotong > maxPotongSilang) {
        setErrorMsg(
          `Nominal potong silang melebihi batas maksimal silang (${formatRupiah(maxPotongSilang)}).`
        );
        return;
      }
      if (effectiveAksiSisa === 'CAIRKAN_SISA_TITIPAN') {
        if (nominalFisik <= 0 || nominalFisik > sisaHutangSetelahPotong) {
          setErrorMsg('Nominal pencairan sisa hutang/titipan tidak valid.');
          return;
        }
        if (metodeFisik === 'TRANSFER' && !rekeningFisik) {
          setErrorMsg('Pilih rekening bank sumber pencairan.');
          return;
        }
      }
      if (effectiveAksiSisa === 'TERIMA_PELUNASAN_SISA_BON') {
        if (nominalFisik <= 0 || nominalFisik > sisaPiutangSetelahPotong) {
          setErrorMsg('Nominal setoran pelunasan sisa piutang tidak valid.');
          return;
        }
        if (metodeFisik === 'TRANSFER' && !rekeningFisik) {
          setErrorMsg('Pilih rekening bank penerima setoran.');
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const res = await api.processKliringSilang({
        idMitra: mitra.id,
        nominalPotongSilang: nominalPotong,
        aksiSisa: effectiveAksiSisa,
        nominalPenyelesaianFisik:
          effectiveAksiSisa === 'HANYA_POTONG_SILANG' ? 0 : nominalFisik,
        metodeFisik,
        rekeningFisik: metodeFisik === 'TUNAI' ? 'KAS01' : rekeningFisik,
        keterangan:
          keterangan.trim() ||
          (isAmbilDuluMode && totalPiutang > 0
            ? `Ambil Uang Titipan Tanpa Potong Bon (Piutang ${formatRupiah(totalPiutang)} Tetap)`
            : undefined),
      });

      const netAkhirHutang = Math.max(0, res.saldoTitipanAkhir - res.sisaKasbonAkhir);
      const netAkhirPiutang = Math.max(0, res.sisaKasbonAkhir - res.saldoTitipanAkhir);
      const ketAkhirLabel =
        netAkhirHutang > 0
          ? `HUTANG ${formatRupiah(netAkhirHutang)}`
          : netAkhirPiutang > 0
            ? `PIUTANG ${formatRupiah(netAkhirPiutang)}`
            : 'LUNAS / IMPAS (Rp 0)';

      const receipt: ReceiptData = {
        title: isAmbilDuluMode
          ? 'BUKTI PENGAMBILAN UANG TITIPAN MITRA'
          : 'BUKTI KLIRING SILANG REKENING MITRA',
        subtitle: isAmbilDuluMode
          ? 'Pengambilan Dana Titipan Tanpa Potong Bon (Piutang Tetap)'
          : 'Kompensasi Piutang Mitra vs Hutang / Titipan PT',
        nomorTransaksi: res.idReferensiKliring,
        tanggal: res.tanggal,
        jam: res.jam,
        namaMitra: res.namaMitra,
        rekening: res.rekeningFisik || 'KOMPENSASI NON-TUNAI',
        kategori: isAmbilDuluMode ? 'AMBIL UANG TITIPAN' : 'KLIRING SILANG MITRA',
        total:
          isAmbilDuluMode
            ? res.nominalPenyelesaianFisik || 0
            : res.nominalPotongSilang + (res.nominalPenyelesaianFisik || 0),
        detailRows: [
          { label: 'Total Piutang Awal Mitra', value: formatRupiah(res.totalKasbonAwal) },
          { label: 'Total Titipan / Hak Awal Mitra', value: formatRupiah(res.saldoTitipanAwal) },
          ...(res.nominalPotongSilang > 0
            ? [
                {
                  label: 'Potong / Angsur Bon (Kliring Silang)',
                  value: formatRupiah(res.nominalPotongSilang),
                  highlight: true,
                },
              ]
            : []),
          ...(res.nominalPenyelesaianFisik > 0
            ? [
                {
                  label:
                    res.aksiSisa === 'CAIRKAN_SISA_TITIPAN'
                      ? isAmbilDuluMode
                        ? 'Uang Titipan Diambil Mitra (Tanpa Potong Bon)'
                        : 'Pencairan Sisa Titipan (Kas/Bank)'
                      : 'Setoran Pelunasan Sisa Piutang (Kas/Bank)',
                  value: formatRupiah(res.nominalPenyelesaianFisik),
                  highlight: isAmbilDuluMode,
                },
              ]
            : []),
          { label: 'Sisa Piutang Akhir Mitra', value: formatRupiah(res.sisaKasbonAkhir) },
          { label: 'Sisa Titipan Akhir Mitra', value: formatRupiah(res.saldoTitipanAkhir) },
          { label: 'Yang Harus Dibayar Sesudahnya', value: ketAkhirLabel, isTotal: true },
        ],
        catatan:
          keterangan.trim() ||
          `Transaksi berhasil diproses. Posisi Yang Harus Dibayar sekarang: ${ketAkhirLabel}.`,
      };

      onSuccess(res, receipt);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses transaksi rekening mitra.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-xl w-full border border-zinc-200 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
              {isAmbilDuluMode ? (
                <Wallet className="w-4 h-4 text-emerald-400" />
              ) : (
                <ArrowRightLeft className="w-4 h-4 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                Pembayaran Titipan &amp; Kliring Silang Mitra
              </h3>
              <p className="text-[11px] text-zinc-300 truncate">
                {mitra.nama} ({mitra.kode}) · Yang Harus Dibayar: {labelYangHarusDibayarAwal}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-zinc-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Ringkasan Posisi Sebelum Pembayaran / Kliring */}
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white border border-amber-200 space-y-0.5">
                <div className="text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                  <HandCoins className="w-3.5 h-3.5 text-amber-700" />
                  <span>Piutang Mitra (Bon)</span>
                </div>
                <div className="text-base font-black text-amber-950 font-mono tabular-nums">
                  {formatRupiah(totalPiutang)}
                </div>
                <div className="text-[11px] text-zinc-500">
                  Aktif <span className="font-mono font-semibold text-zinc-700">{formatRupiahSingkat(piutangAktif)}</span>
                  {nominalNgunci > 0 && (
                    <span className="text-rose-700">
                      {' '}
                      · Ngunci <span className="font-mono font-semibold">{formatRupiahSingkat(nominalNgunci)}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-emerald-200 space-y-0.5">
                <div className="text-[11px] font-semibold text-emerald-900 flex items-center gap-1.5">
                  <Wheat className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Titipan / Hak Mitra</span>
                </div>
                <div className="text-base font-black text-emerald-950 font-mono tabular-nums">
                  {formatRupiah(totalHutangPt)}
                </div>
                <div className="text-[11px] text-zinc-500">
                  {(mitra.totalUpahBelumDibayar || 0) > 0
                    ? `Titip ${formatRupiahSingkat(mitra.totalTitipPanenMurni || 0)} · Upah ${formatRupiahSingkat(
                        mitra.totalUpahBelumDibayar || 0
                      )}`
                    : 'Titip Hasil Panen & Uang Titip'}
                </div>
              </div>
            </div>

            <div className="pt-2.5 border-t border-zinc-200 flex items-center justify-between gap-2">
              <span className="text-zinc-600 font-semibold">
                Yang Harus Dibayar Saat Ini (Belum Kliring):
              </span>
              <span
                className={`font-mono tabular-nums font-black text-sm ${
                  selisihHutangAwal > 0
                    ? 'text-emerald-800'
                    : selisihPiutangAwal > 0
                      ? 'text-rose-800'
                      : 'text-zinc-800'
                }`}
              >
                {labelYangHarusDibayarAwal}
              </span>
            </div>
          </div>

          {/* Segmented Mode Selector: Kliring Silang vs Ambil Uang Dulu Tanpa Potong Bon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
            <button
              type="button"
              disabled={maxPotongSilang <= 0}
              onClick={() => setActiveMode('KLIRING_SILANG')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                !isAmbilDuluMode
                  ? 'bg-white text-zinc-900 shadow-2xs border border-zinc-200/80'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              1. Kliring Silang (Potong / Angsur Bon)
            </button>
            <button
              type="button"
              disabled={totalHutangPt <= 0}
              onClick={() => setActiveMode('AMBIL_UANG_DULU')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                isAmbilDuluMode
                  ? 'bg-white text-emerald-900 shadow-2xs border border-emerald-200'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              2. Ambil Uang Dulu (Tanpa Potong Bon)
            </button>
          </div>

          {!isAmbilDuluMode ? (
            <>
              {/* MODE 1: KLIRING SILANG (POTONG / ANGSUR BON) */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="font-bold text-zinc-800">
                    Nominal Potong / Angsur Bon dari Titipan (Rp)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selisihHutangAwal > 0 && selisihHutangAwal < maxPotongSilang && (
                      <button
                        type="button"
                        onClick={() =>
                          setNominalPotongInput(selisihHutangAwal.toLocaleString('id-ID'))
                        }
                        className="px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold cursor-pointer"
                        title="Gunakan nominal sebesar selisih hutang untuk mengangsur piutang bon"
                      >
                        Angsur Senilai Hutang ({formatRupiahSingkat(selisihHutangAwal)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setNominalPotongInput(maxPotongSilang.toLocaleString('id-ID'))
                      }
                      className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold cursor-pointer"
                    >
                      {totalHutangPt < totalPiutang
                        ? `Pakai Semua Sisa Titip (${formatRupiahSingkat(maxPotongSilang)})`
                        : `Lunasi Penuh Piutang (${formatRupiahSingkat(maxPotongSilang)})`}
                    </button>
                    {maxPotongSilang > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setNominalPotongInput(
                            Math.round(maxPotongSilang / 2).toLocaleString('id-ID')
                          )
                        }
                        className="px-2 py-1 rounded bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 text-[11px] font-semibold cursor-pointer"
                      >
                        50%
                      </button>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={nominalPotongInput}
                  onChange={(e) => {
                    const val = parseDigits(e.target.value);
                    setNominalPotongInput(val > 0 ? val.toLocaleString('id-ID') : '');
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-sm text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-zinc-900"
                />
                <p className="text-[11px] text-zinc-500">
                  Mengurangi Piutang Mitra sekaligus mengurangi Saldo Titipan tanpa mutasi kas fisik (Maksimal {formatRupiah(maxPotongSilang)}).
                </p>
              </div>

              {/* Opsi Penyelesaian Sisa Saldo */}
              {(sisaHutangSetelahPotong > 0 || sisaPiutangSetelahPotong > 0) && (
                <div className="space-y-2 pt-1">
                  <label className="block font-bold text-zinc-800">
                    Tindak Lanjut Sisa Saldo Setelah Kliring Silang
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <label
                      className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                        aksiSisa === 'HANYA_POTONG_SILANG'
                          ? 'bg-zinc-100 border-zinc-500'
                          : 'bg-white border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="aksiSisaKliring"
                        checked={aksiSisa === 'HANYA_POTONG_SILANG'}
                        onChange={() => handleSelectAksiSisa('HANYA_POTONG_SILANG')}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-zinc-900">
                          Hanya Potong / Angsur Bon Non-Tunai (Biarkan Sisa Tercatat)
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          Tidak ada uang keluar atau masuk rekening kas/bank saat ini.
                        </div>
                      </div>
                    </label>

                    {sisaHutangSetelahPotong > 0 && (
                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                          aksiSisa === 'CAIRKAN_SISA_TITIPAN'
                            ? 'bg-emerald-50/70 border-emerald-500'
                            : 'bg-white border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="aksiSisaKliring"
                          checked={aksiSisa === 'CAIRKAN_SISA_TITIPAN'}
                          onChange={() => handleSelectAksiSisa('CAIRKAN_SISA_TITIPAN')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-bold text-emerald-950">
                            Sekalian Bayarkan Sisa Hutang / Titipan ke Mitra (
                            {formatRupiah(sisaHutangSetelahPotong)})
                          </div>
                          <div className="text-[11px] text-zinc-600">
                            Serahkan sisa hak mitra melalui Kas Kasir atau Transfer Bank PT.
                          </div>
                        </div>
                      </label>
                    )}

                    {sisaPiutangSetelahPotong > 0 && (
                      <label
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                          aksiSisa === 'TERIMA_PELUNASAN_SISA_BON'
                            ? 'bg-amber-50/70 border-amber-500'
                            : 'bg-white border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="aksiSisaKliring"
                          checked={aksiSisa === 'TERIMA_PELUNASAN_SISA_BON'}
                          onChange={() => handleSelectAksiSisa('TERIMA_PELUNASAN_SISA_BON')}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="font-bold text-amber-950">
                            Sekalian Terima Setoran Sisa Piutang dari Mitra (
                            {formatRupiah(sisaPiutangSetelahPotong)})
                          </div>
                          <div className="text-[11px] text-zinc-600">
                            Terima pembayaran sisa bon ke Kas Kasir atau Rekening Bank PT.
                          </div>
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Form Penyelesaian Fisik bila dipilih pada Mode Kliring */}
              {aksiSisa !== 'HANYA_POTONG_SILANG' && (
                <div className="p-3.5 rounded-lg bg-zinc-50 border border-zinc-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Nominal Penyelesaian Fisik (Rp)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={nominalFisikInput}
                        onChange={(e) => {
                          const val = parseDigits(e.target.value);
                          setNominalFisikInput(val > 0 ? val.toLocaleString('id-ID') : '');
                        }}
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-zinc-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">Metode Kas/Bank</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['TUNAI', 'TRANSFER'] as const).map((mtd) => (
                          <button
                            key={mtd}
                            type="button"
                            onClick={() => setMetodeFisik(mtd)}
                            className={`py-2 px-3 rounded-lg font-bold transition-colors cursor-pointer ${
                              metodeFisik === mtd
                                ? 'bg-zinc-900 text-white'
                                : 'bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                            }`}
                          >
                            {mtd}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {metodeFisik === 'TRANSFER' && (
                    <div>
                      <label className="block font-semibold text-zinc-700 mb-1">
                        Pilih Rekening Bank PT
                      </label>
                      <select
                        value={rekeningFisik}
                        onChange={(e) => setRekeningFisik(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg font-semibold text-zinc-800"
                      >
                        {bankAccounts.map((rek) => (
                          <option key={rek.kode} value={rek.kode}>
                            {rek.nama} ({rek.kode}) — Saldo: {formatRupiah(rek.saldoSaatIni)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            /* MODE 2: AMBIL UANG DULU (TANPA POTONG BON) */
            <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3.5">
              <div className="space-y-1">
                <div className="font-bold text-emerald-950">
                  Pengambilan Uang Titipan Tanpa Potong Bon
                </div>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  Gunakan opsi ini bila mitra membutuhkan dana titipannya untuk putar modal atau keperluan lain sehingga belum memotong bon.{' '}
                  <strong className="text-zinc-900">
                    Piutang {formatRupiah(totalPiutang)} tetap tercatat utuh.
                  </strong>
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <label className="font-bold text-zinc-800">
                    Nominal Uang Diambil Mitra (Rp)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selisihHutangAwal > 0 && selisihHutangAwal < totalHutangPt && (
                      <button
                        type="button"
                        onClick={() =>
                          setNominalAmbilDuluInput(selisihHutangAwal.toLocaleString('id-ID'))
                        }
                        className="px-2 py-1 rounded bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold cursor-pointer"
                      >
                        Senilai Hutang ({formatRupiahSingkat(selisihHutangAwal)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setNominalAmbilDuluInput(totalHutangPt.toLocaleString('id-ID'))
                      }
                      className="px-2 py-1 rounded bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Ambil Penuh Titip ({formatRupiahSingkat(totalHutangPt)})
                    </button>
                    {totalHutangPt > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setNominalAmbilDuluInput(
                            Math.round(totalHutangPt / 2).toLocaleString('id-ID')
                          )
                        }
                        className="px-2 py-1 rounded bg-white hover:bg-zinc-50 text-zinc-700 border border-zinc-300 text-[11px] font-semibold cursor-pointer"
                      >
                        50%
                      </button>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  value={nominalAmbilDuluInput}
                  onChange={(e) => {
                    const val = parseDigits(e.target.value);
                    setNominalAmbilDuluInput(val > 0 ? val.toLocaleString('id-ID') : '');
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2.5 bg-white border border-emerald-400 rounded-lg font-mono tabular-nums font-bold text-sm text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                />
                <div className="text-[11px] text-zinc-600">
                  Batas maksimal uang titipan yang bisa diambil:{' '}
                  <strong className="font-mono text-zinc-900">{formatRupiah(totalHutangPt)}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Metode Penyerahan Uang
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['TUNAI', 'TRANSFER'] as const).map((mtd) => (
                      <button
                        key={mtd}
                        type="button"
                        onClick={() => setMetodeFisik(mtd)}
                        className={`py-2 px-3 rounded-lg font-bold transition-colors cursor-pointer ${
                          metodeFisik === mtd
                            ? 'bg-zinc-900 text-white'
                            : 'bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100'
                        }`}
                      >
                        {mtd}
                      </button>
                    ))}
                  </div>
                  {metodeFisik === 'TUNAI' && kasirAccount && (
                    <div className="text-[10px] text-zinc-500 mt-1 font-mono tabular-nums">
                      Kas Kasir (KAS01): {formatRupiah(kasirAccount.saldoSaatIni)}
                    </div>
                  )}
                </div>

                {metodeFisik === 'TRANSFER' && (
                  <div>
                    <label className="block font-semibold text-zinc-700 mb-1">
                      Rekening Bank Sumber
                    </label>
                    <select
                      value={rekeningFisik}
                      onChange={(e) => setRekeningFisik(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg font-semibold text-zinc-800"
                    >
                      {bankAccounts.map((rek) => (
                        <option key={rek.kode} value={rek.kode}>
                          {rek.nama} ({rek.kode}) — {formatRupiah(rek.saldoSaatIni)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Simulasi Hasil Akhir */}
          <div className="p-3.5 rounded-xl bg-zinc-900 text-white space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Simulasi Posisi Rekening Setelah Diproses</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
              <div className="flex justify-between bg-zinc-800/90 px-2.5 py-2 rounded-lg border border-zinc-700">
                <span className="font-sans text-zinc-300">Sisa Piutang:</span>
                <strong className="text-amber-300">{formatRupiah(sisaPiutangAkhir)}</strong>
              </div>
              <div className="flex justify-between bg-zinc-800/90 px-2.5 py-2 rounded-lg border border-zinc-700">
                <span className="font-sans text-zinc-300">Sisa Titipan:</span>
                <strong className="text-emerald-300">{formatRupiah(sisaHutangAkhir)}</strong>
              </div>
            </div>
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2">
              <span className="text-zinc-300 font-semibold">
                Tampilan &ldquo;Yang Harus Dibayar&rdquo; Nanti:
              </span>
              <span
                className={`font-mono tabular-nums font-black text-sm ${
                  selisihHutangAkhir > 0
                    ? 'text-emerald-400'
                    : selisihPiutangAkhir > 0
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}
              >
                {labelYangHarusDibayarAkhir}
              </span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Catatan / Keterangan Transaksi (Opsional)
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder={
                isAmbilDuluMode
                  ? 'Contoh: Ambil uang panen untuk modal kebun dulu (belum potong bon)'
                  : 'Contoh: Angsur bon dari sisa hutang titipan hasil panen'
              }
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-zinc-800"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                (isAmbilDuluMode
                  ? nominalFisik <= 0 || nominalFisik > totalHutangPt
                  : nominalPotong <= 0 && nominalFisik <= 0)
              }
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-white rounded-lg font-bold shadow-xs cursor-pointer disabled:opacity-50 ${
                isAmbilDuluMode
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-zinc-900 hover:bg-zinc-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Memproses...'
                  : isAmbilDuluMode
                    ? `Serahkan Uang Titipan (${formatRupiah(nominalFisik)})`
                    : `Proses Kliring Silang (${formatRupiah(nominalPotong)})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
