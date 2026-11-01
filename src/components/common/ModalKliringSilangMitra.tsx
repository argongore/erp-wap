import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  HandCoins,
  Scale,
  Wheat,
  X,
} from 'lucide-react';
import { api } from '../../api/client.ts';
import { HasilKliringSilangResponse, Rekening } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
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

interface Props {
  isOpen: boolean;
  onClose: () => void;
  mitra: KliringSilangTargetMitra | null;
  rekeningList?: Rekening[];
  onSuccess: (result: HasilKliringSilangResponse, receipt: ReceiptData) => void;
}

export const ModalKliringSilangMitra: React.FC<Props> = ({
  isOpen,
  onClose,
  mitra,
  rekeningList = [],
  onSuccess,
}) => {
  const [nominalPotongInput, setNominalPotongInput] = useState<string>('');
  const [aksiSisa, setAksiSisa] = useState<
    'HANYA_POTONG_SILANG' | 'CAIRKAN_SISA_TITIPAN' | 'TERIMA_PELUNASAN_SISA_BON'
  >('HANYA_POTONG_SILANG');
  const [nominalFisikInput, setNominalFisikInput] = useState<string>('');
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

  const totalPiutang = Math.max(0, Math.round(mitra?.totalBonMitra || 0));
  const nominalNgunci = Math.max(0, Math.round(mitra?.nominalNotaNgunci || 0));
  const piutangAktif = Math.max(
    0,
    Math.round(mitra?.nominalPiutangAktif ?? Math.max(0, totalPiutang - nominalNgunci))
  );
  const totalHutangPt = Math.max(0, Math.round(mitra?.totalHutangTitipPanen || 0));
  const maxPotongSilang = Math.min(totalPiutang, totalHutangPt);

  useEffect(() => {
    if (isOpen && mitra) {
      const defaultMax = Math.min(
        Math.max(0, Math.round(mitra.totalBonMitra || 0)),
        Math.max(0, Math.round(mitra.totalHutangTitipPanen || 0))
      );
      setNominalPotongInput(defaultMax > 0 ? defaultMax.toLocaleString('id-ID') : '0');
      setAksiSisa('HANYA_POTONG_SILANG');
      setNominalFisikInput('');
      setMetodeFisik('TUNAI');
      setRekeningFisik(bankAccounts[0]?.kode || '');
      setKeterangan('');
      setErrorMsg('');
    }
  }, [isOpen, mitra, bankAccounts]);

  if (!isOpen || !mitra) return null;

  const parseDigits = (raw: string): number => {
    const digits = raw.replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  };

  const nominalPotong = parseDigits(nominalPotongInput);
  const sisaPiutangSetelahPotong = Math.max(0, totalPiutang - nominalPotong);
  const sisaHutangSetelahPotong = Math.max(0, totalHutangPt - nominalPotong);

  const nominalFisik = parseDigits(nominalFisikInput);
  const sisaPiutangAkhir =
    aksiSisa === 'TERIMA_PELUNASAN_SISA_BON'
      ? Math.max(0, sisaPiutangSetelahPotong - nominalFisik)
      : sisaPiutangSetelahPotong;
  const sisaHutangAkhir =
    aksiSisa === 'CAIRKAN_SISA_TITIPAN'
      ? Math.max(0, sisaHutangSetelahPotong - nominalFisik)
      : sisaHutangSetelahPotong;

  const statusSebelum =
    totalPiutang > totalHutangPt
      ? 'PIUTANG (Piutang > Hutang)'
      : totalHutangPt > totalPiutang
        ? 'HUTANG (Hutang > Piutang)'
        : 'SEIMBANG (Piutang = Hutang)';

  const statusSesudah =
    sisaPiutangAkhir > sisaHutangAkhir
      ? 'PIUTANG'
      : sisaHutangAkhir > sisaPiutangAkhir
        ? 'HUTANG'
        : 'LUNAS / IMPAS';

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

    if (nominalPotong <= 0 && nominalFisik <= 0) {
      setErrorMsg('Masukkan nominal potong silang lebih dari Rp 0.');
      return;
    }
    if (nominalPotong > maxPotongSilang) {
      setErrorMsg(
        `Nominal potong silang melebihi batas maksimal silang (${formatRupiah(maxPotongSilang)}).`
      );
      return;
    }
    if (aksiSisa === 'CAIRKAN_SISA_TITIPAN') {
      if (nominalFisik <= 0 || nominalFisik > sisaHutangSetelahPotong) {
        setErrorMsg('Nominal pencairan sisa hutang/titipan tidak valid.');
        return;
      }
      if (metodeFisik === 'TRANSFER' && !rekeningFisik) {
        setErrorMsg('Pilih rekening bank sumber pencairan.');
        return;
      }
    }
    if (aksiSisa === 'TERIMA_PELUNASAN_SISA_BON') {
      if (nominalFisik <= 0 || nominalFisik > sisaPiutangSetelahPotong) {
        setErrorMsg('Nominal setoran pelunasan sisa piutang tidak valid.');
        return;
      }
      if (metodeFisik === 'TRANSFER' && !rekeningFisik) {
        setErrorMsg('Pilih rekening bank penerima setoran.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.processKliringSilang({
        idMitra: mitra.id,
        nominalPotongSilang: nominalPotong,
        aksiSisa,
        nominalPenyelesaianFisik: aksiSisa === 'HANYA_POTONG_SILANG' ? 0 : nominalFisik,
        metodeFisik,
        rekeningFisik: metodeFisik === 'TUNAI' ? 'KAS01' : rekeningFisik,
        keterangan: keterangan.trim() || undefined,
      });

      const receipt: ReceiptData = {
        title: 'BUKTI KLIRING SILANG REKENING MITRA',
        subtitle: 'Kompensasi Otomatis Piutang Mitra vs Hutang / Titipan PT',
        nomorTransaksi: res.idReferensiKliring,
        tanggal: res.tanggal,
        jam: res.jam,
        namaMitra: res.namaMitra,
        rekening: res.rekeningFisik || 'KOMPENSASI NON-TUNAI',
        kategori: 'KLIRING SILANG MITRA',
        total: res.nominalPotongSilang + (res.nominalPenyelesaianFisik || 0),
        detailRows: [
          { label: 'Total Piutang Awal Mitra', value: formatRupiah(res.totalKasbonAwal) },
          { label: 'Total Hutang / Titipan Awal PT', value: formatRupiah(res.saldoTitipanAwal) },
          {
            label: 'Potong Silang Non-Tunai',
            value: formatRupiah(res.nominalPotongSilang),
            highlight: true,
          },
          ...(res.nominalPenyelesaianFisik > 0
            ? [
                {
                  label:
                    res.aksiSisa === 'CAIRKAN_SISA_TITIPAN'
                      ? 'Pencairan Sisa Hutang/Titipan (Kas/Bank)'
                      : 'Setoran Pelunasan Sisa Piutang (Kas/Bank)',
                  value: formatRupiah(res.nominalPenyelesaianFisik),
                },
              ]
            : []),
          { label: 'Sisa Piutang Akhir Mitra', value: formatRupiah(res.sisaKasbonAkhir) },
          { label: 'Sisa Hutang / Titipan Akhir PT', value: formatRupiah(res.saldoTitipanAkhir) },
        ],
        catatan:
          keterangan.trim() ||
          `Kliring silang berhasil diproses. Status akhir rekening mitra: ${statusSesudah}.`,
      };

      onSuccess(res, receipt);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses kliring silang rekening mitra.');
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
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">
                Kliring Silang Piutang &amp; Hutang Rekening Mitra
              </h3>
              <p className="text-[11px] text-zinc-300 truncate">
                {mitra.nama} ({mitra.kode}) · Status Saat Ini: {statusSebelum}
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

          {/* Ringkasan Posisi Piutang vs Hutang */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1">
              <div className="text-[10px] font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                <HandCoins className="w-3.5 h-3.5 text-amber-700" />
                <span>Total Piutang Mitra (Bon)</span>
              </div>
              <div className="text-base font-black text-amber-950 font-mono tabular-nums">
                {formatRupiah(totalPiutang)}
              </div>
              <div className="text-[11px] text-zinc-600">
                Aktif: <strong className="font-mono">{formatRupiah(piutangAktif)}</strong>
                {nominalNgunci > 0 && (
                  <span className="text-rose-700">
                    {' '}
                    · Ngunci: <strong className="font-mono">{formatRupiah(nominalNgunci)}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-purple-50/70 border border-purple-200 space-y-1">
              <div className="text-[10px] font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1">
                <Wheat className="w-3.5 h-3.5 text-purple-700" />
                <span>Total Hutang PT ke Mitra</span>
              </div>
              <div className="text-base font-black text-purple-950 font-mono tabular-nums">
                {formatRupiah(totalHutangPt)}
              </div>
              <div className="text-[11px] text-zinc-600">
                {(mitra.totalUpahBelumDibayar || 0) > 0
                  ? `Titip ${formatRupiah(mitra.totalTitipPanenMurni || 0)} · Upah ${formatRupiah(
                      mitra.totalUpahBelumDibayar || 0
                    )}`
                  : 'Uang Titip & Hasil Bumi Titip'}
              </div>
            </div>
          </div>

          {/* Input Nominal Potong Silang */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-zinc-800">
                Nominal Potong Silang Non-Tunai (Rp)
              </label>
              <button
                type="button"
                onClick={() => setNominalPotongInput(maxPotongSilang.toLocaleString('id-ID'))}
                className="text-[11px] font-bold text-indigo-700 hover:underline cursor-pointer"
              >
                Gunakan Maksimal ({formatRupiah(maxPotongSilang)})
              </button>
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
              className="w-full px-3 py-2.5 border border-zinc-300 rounded-lg font-mono font-bold text-sm text-zinc-900 focus:ring-1 focus:ring-indigo-600"
            />
            <p className="text-[11px] text-zinc-500">
              Potong silang langsung mengurangi Piutang Mitra dan Hutang PT sekaligus tanpa mutasi kas fisik.
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
                      ? 'bg-indigo-50/70 border-indigo-400'
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
                      Hanya Potong Silang Non-Tunai (Biarkan Sisa Tercatat di Buku Mitra)
                    </div>
                    <div className="text-[11px] text-zinc-600">
                      Tidak ada uang keluar/masuk rekening kas atau bank saat ini.
                    </div>
                  </div>
                </label>

                {sisaHutangSetelahPotong > 0 && (
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      aksiSisa === 'CAIRKAN_SISA_TITIPAN'
                        ? 'bg-purple-50/70 border-purple-400'
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
                      <div className="font-bold text-purple-950">
                        Sekaligus Cairkan Sisa Hutang / Titipan ke Mitra (
                        {formatRupiah(sisaHutangSetelahPotong)})
                      </div>
                      <div className="text-[11px] text-zinc-600">
                        Bayarkan sisa hak mitra melalui Kas Utama atau Transfer Bank PT.
                      </div>
                    </div>
                  </label>
                )}

                {sisaPiutangSetelahPotong > 0 && (
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                      aksiSisa === 'TERIMA_PELUNASAN_SISA_BON'
                        ? 'bg-emerald-50/70 border-emerald-400'
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
                      <div className="font-bold text-emerald-950">
                        Sekaligus Terima Pelunasan Sisa Piutang dari Mitra (
                        {formatRupiah(sisaPiutangSetelahPotong)})
                      </div>
                      <div className="text-[11px] text-zinc-600">
                        Terima setoran sisa bon mitra ke Kas Utama atau Rekening Bank PT.
                      </div>
                    </div>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Form Penyelesaian Fisik bila dipilih */}
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
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg font-mono font-bold text-zinc-900"
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

          {/* Simulasi Hasil Akhir */}
          <div className="p-3.5 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-950">
              <span className="flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-emerald-700" />
                <span>Estimasi Posisi Akhir Setelah Kliring Silang</span>
              </span>
              <span className="text-emerald-800 uppercase">Status Baru: {statusSesudah}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono tabular-nums">
              <div className="flex justify-between bg-white px-2.5 py-1.5 rounded border border-emerald-200">
                <span className="font-sans text-zinc-600">Sisa Piutang:</span>
                <strong className="text-amber-900">{formatRupiah(sisaPiutangAkhir)}</strong>
              </div>
              <div className="flex justify-between bg-white px-2.5 py-1.5 rounded border border-emerald-200">
                <span className="font-sans text-zinc-600">Sisa Hutang PT:</span>
                <strong className="text-purple-900">{formatRupiah(sisaHutangAkhir)}</strong>
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 mb-1">
              Catatan Kliring (Opsional)
            </label>
            <input
              type="text"
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Contoh: Kliring silang nota hasil bumi terhadap kasbon pupuk"
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
              disabled={submitting || (nominalPotong <= 0 && nominalFisik <= 0)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-bold shadow-xs cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Memproses Kliring...'
                  : `Proses Kliring Silang (${formatRupiah(nominalPotong)})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
