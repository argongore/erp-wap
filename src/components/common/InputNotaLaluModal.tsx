import React, { useState, useEffect } from 'react';
import {
  FileText,
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Wheat,
  Info,
  Calendar,
  Layers,
  Sparkles,
  FolderSync,
  ExternalLink,
  RefreshCw,
  Database,
} from 'lucide-react';
import { Mitra } from '../../server/types.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ImageUploadZone } from './ImageUploadZone.tsx';
import { findSimilarMitra, useFuzzyMitraMatches } from '../../utils/nameSimilarity.ts';
import { FuzzyNameWarningCard } from './FuzzyNameWarningCard.tsx';

interface InputNotaLaluModalProps {
  isOpen: boolean;
  onClose: () => void;
  mitraList: Mitra[];
  preselectedMitraId?: string;
  onSuccess: (result: any) => void;
}

export const InputNotaLaluModal: React.FC<InputNotaLaluModalProps> = ({
  isOpen,
  onClose,
  mitraList,
  preselectedMitraId,
  onSuccess,
}) => {
  const activeMitras = React.useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );

  const [tipe, setTipe] = useState<'PIUTANG_BARANG_NOTA_LALU' | 'TITIP_UANG_NOTA_LALU'>(
    'PIUTANG_BARANG_NOTA_LALU'
  );

  // Mitra Selection: Terdaftar vs Umum/Manual
  const [mitraInputMode, setMitraInputMode] = useState<'TERDAFTAR' | 'UMUM'>(
    activeMitras.length > 0 ? 'TERDAFTAR' : 'UMUM'
  );
  const [selectedMitraId, setSelectedMitraId] = useState<string>(
    preselectedMitraId || activeMitras[0]?.id || ''
  );
  const [namaUmumManual, setNamaUmumManual] = useState<string>('');
  const [teleponUmumManual, setTeleponUmumManual] = useState<string>('');

  const [nominalInput, setNominalInput] = useState<string>('1500000');
  const [noNotaLalu, setNoNotaLalu] = useState<string>('');
  const [tanggalNotaLalu, setTanggalNotaLalu] = useState<string>(getWIBTodayString());
  const [rincianBarang, setRincianBarang] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoNota, setFotoNota] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitStep, setSubmitStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [dismissedNotaLaluWarning, setDismissedNotaLaluWarning] = useState<string>('');

  // Non-blocking fuzzy name matching & duplicate prevention (lag-free typing)
  const similarMitras = useFuzzyMitraMatches(namaUmumManual, activeMitras);

  const isCurrentNotaLaluWarningDismissed =
    dismissedNotaLaluWarning.length > 0 &&
    dismissedNotaLaluWarning.toLowerCase() === namaUmumManual.trim().toLowerCase();

  useEffect(() => {
    if (preselectedMitraId) {
      setSelectedMitraId(preselectedMitraId);
      setMitraInputMode('TERDAFTAR');
    } else if (!selectedMitraId && activeMitras.length > 0) {
      setSelectedMitraId(activeMitras[0].id);
    }
  }, [preselectedMitraId, activeMitras, selectedMitraId]);

  // Reset clean form state whenever modal opens so previous Mitra's photo/notes never carry over
  useEffect(() => {
    if (isOpen) {
      const prefix = tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'NL-BRG' : 'NL-TTP';
      setNoNotaLalu(`${prefix}-${Date.now().toString().slice(-4)}`);
      setFotoNota('');
      setRincianBarang('');
      setKeterangan('');
      setNamaUmumManual('');
      setTeleponUmumManual('');
      setErrorMsg('');
    }
  }, [isOpen]);

  // Update prefix when tipe changes if user hasn't typed custom note number
  useEffect(() => {
    if (isOpen && (!noNotaLalu || noNotaLalu.startsWith('NL-BRG-') || noNotaLalu.startsWith('NL-TTP-'))) {
      const prefix = tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'NL-BRG' : 'NL-TTP';
      setNoNotaLalu(`${prefix}-${Date.now().toString().slice(-4)}`);
    }
  }, [tipe]);

  if (!isOpen) return null;

  const nominal = Number(nominalInput) || 0;
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (nominal <= 0) {
      setErrorMsg('Nominal nota lalu harus lebih dari Rp 0');
      return;
    }

    setSubmitting(true);
    setSubmitStep('Memvalidasi rincian pihak & transaksi...');

    let finalMitraId = selectedMitraId;
    let finalMitraNama = selectedMitra?.nama || '';

    try {
      // Step 0: Handle Umum / Manual contact
      if (mitraInputMode === 'UMUM') {
        const trimmedNama = namaUmumManual.trim();
        if (!trimmedNama) {
          setErrorMsg('Silakan masukkan nama pihak / orang umum terlebih dahulu.');
          setSubmitting(false);
          return;
        }

        // Check if exact matching registered exists
        const matchedExisting = mitraList.find(
          (m) => m.nama.toLowerCase() === trimmedNama.toLowerCase()
        );

        // Check if dangerous fuzzy duplicate exists synchronously on submit
        const latestMatches = trimmedNama.length >= 2 ? findSimilarMitra(trimmedNama, activeMitras) : [];
        const highRiskMatch = latestMatches.find(
          (s) => s.isHighRiskDuplicate || s.matchType === 'PHONETIC' || s.similarity >= 80
        );

        if (matchedExisting) {
          finalMitraId = matchedExisting.id;
          finalMitraNama = matchedExisting.nama;
        } else if (highRiskMatch && !isCurrentNotaLaluWarningDismissed) {
          setErrorMsg(
            `⚠️ BAHAYA DUPLIKASI: Anda mengetik "${trimmedNama}", tetapi di database sudah ada Mitra: "${highRiskMatch.mitra.nama}" (${highRiskMatch.mitra.kode}). Jika orang ini sama, silakan klik tombol "Pakai Akun Resmi" di kotak sugesti agar piutang/titipan tidak terpecah dua! Jika yakin orang berbeda, klik "Bukan, Ini Orang Berbeda" lalu simpan ulang.`
          );
          setSubmitting(false);
          return;
        } else {
          setSubmitStep(`Mendaftarkan ${trimmedNama} ke Master Mitra...`);
          const createdMitra = await api.createMitra({
            nama: trimmedNama,
            role: tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'CUSTOMER' : 'MITRA_TANI',
            telepon: teleponUmumManual.trim() || undefined,
            alamat: 'Input Umum (Nota Lalu)',
            catatan: 'Didaftarkan otomatis dari pencatatan Nota Lalu',
          });
          finalMitraId = createdMitra.id;
          finalMitraNama = createdMitra.nama;
        }
      } else {
        if (!finalMitraId) {
          setErrorMsg('Pilih mitra terdaftar terlebih dahulu atau gunakan mode Input Umum.');
          setSubmitting(false);
          return;
        }
      }

      let driveFileUrl = '';
      let driveFileId = '';
      let driveFolderPath = 'Database ERP & Cloud Supabase';

      // Store transaction into ERP database
      setSubmitStep('Mencatat transaksi ke rekening koran & buku pembukuan...');
      const defaultKet =
        tipe === 'PIUTANG_BARANG_NOTA_LALU'
          ? `Nota Lalu (Piutang Bon Barang): ${rincianBarang ? rincianBarang.trim() : 'Bon Barang Bertahun-Tahun Lalu'}`
          : `Nota Lalu (Titipan Uang / Hasil Panen): ${rincianBarang ? rincianBarang.trim() : 'Saldo Titip Panen Belum Diambil'}`;

      const result = await api.processInputNotaLalu({
        idMitra: finalMitraId,
        tipe,
        nominal,
        tanggalNotaLalu: tanggalNotaLalu || getWIBTodayString(),
        noNotaLalu: noNotaLalu.trim() || undefined,
        rincianBarang: rincianBarang.trim() || undefined,
        fotoNota: fotoNota || undefined,
        driveFileUrl: driveFileUrl || undefined,
        driveFileId: driveFileId || undefined,
        driveFolderPath,
        keterangan: keterangan.trim() || defaultKet,
      });

      setSubmitStep('Selesai!');
      setFotoNota('');
      setRincianBarang('');
      setKeterangan('');
      setNamaUmumManual('');
      setTeleponUmumManual('');
      setNoNotaLalu('');
      try {
        onSuccess(result);
      } catch (e) {
        console.warn('onSuccess callback error:', e);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan transaksi nota lalu');
    } finally {
      setSubmitting(false);
      setSubmitStep('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto overflow-x-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto max-h-[92vh] flex flex-col border border-zinc-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-700 via-amber-800 to-zinc-900 text-white flex items-center justify-between rounded-t-2xl shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <FileText className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Pencatatan Nota Lalu (Manual)
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 uppercase tracking-wider">
                  Pondasi Piutang &amp; Titipan
                </span>
              </div>
              <p className="text-xs text-amber-100/90 mt-0.5">
                Konversi bon masa lalu &amp; simpan bukti foto fisik otomatis ke Cloud Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs flex-1 overflow-y-auto overflow-x-auto overscroll-contain">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="text-xs font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* Submission Step Banner */}
          {submitting && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex items-center space-x-2.5 animate-pulse">
              <RefreshCw className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
              <div className="text-xs font-bold">{submitStep || 'Memproses transaksi...'}</div>
            </div>
          )}

          {/* Toggle Type: Piutang Bon Barang vs Titip Uang */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-700 uppercase tracking-wider mb-2">
              Pilih Kategori Transaksi Nota Lalu: <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTipe('PIUTANG_BARANG_NOTA_LALU')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  tipe === 'PIUTANG_BARANG_NOTA_LALU'
                    ? 'border-rose-500 bg-rose-50/80 shadow-xs ring-1 ring-rose-500'
                    : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      tipe === 'PIUTANG_BARANG_NOTA_LALU'
                        ? 'bg-rose-600 text-white'
                        : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-zinc-900 text-xs">Piutang Bon Barang (Nota Lalu)</div>
                    <div className="text-[10px] text-zinc-500">
                      Masuk ke Kasbon Uang atas nama Nota Lalu (BON01)
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTipe('TITIP_UANG_NOTA_LALU')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  tipe === 'TITIP_UANG_NOTA_LALU'
                    ? 'border-purple-500 bg-purple-50/80 shadow-xs ring-1 ring-purple-500'
                    : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      tipe === 'TITIP_UANG_NOTA_LALU'
                        ? 'bg-purple-600 text-white'
                        : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    <Wheat className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-zinc-900 text-xs">Titip Uang / Panen (Nota Lalu)</div>
                    <div className="text-[10px] text-zinc-500">
                      Masuk ke Saldo Titipan / Kewajiban PT (TIT01)
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Explanation Banner */}
          <div
            className={`p-3 rounded-xl border text-[11px] leading-relaxed flex items-start space-x-2 ${
              tipe === 'PIUTANG_BARANG_NOTA_LALU'
                ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                : 'bg-purple-50/70 border-purple-200 text-purple-950'
            }`}
          >
            <Info
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'text-rose-600' : 'text-purple-600'
              }`}
            />
            <div>
              {tipe === 'PIUTANG_BARANG_NOTA_LALU' ? (
                <span>
                  <strong>Piutang Bon Barang Masa Lalu:</strong> Barang toko/saprotan yang sudah diambil oleh
                  mitra bertahun-tahun lalu. Dicatat ke dalam <strong>Kasbon Uang</strong> rekening kliring virtual{' '}
                  <strong>BON01</strong>, tanpa memotong saldo kasir riil tahun 2026.
                </span>
              ) : (
                <span>
                  <strong>Titipan Uang / Hasil Panen Masa Lalu:</strong> Saldo panen atau titipan mitra yang belum
                  diambil. Dicatat ke sistem <strong>Titip Pembelian Hasil Bumi</strong> dengan rekening virtual{' '}
                  <strong>TIT01</strong>.
                </span>
              )}
            </div>
          </div>

          {/* Mitra Selector / Input Umum Mode */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-semibold text-zinc-700">
                Pihak Transaksi Nota Lalu: <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center p-0.5 bg-zinc-100 rounded-lg border border-zinc-200 text-[10px]">
                <button
                  type="button"
                  onClick={() => setMitraInputMode('TERDAFTAR')}
                  className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                    mitraInputMode === 'TERDAFTAR'
                      ? 'bg-white text-zinc-900 shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  Mitra Terdaftar ({activeMitras.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMitraInputMode('UMUM')}
                  className={`px-2 py-0.5 rounded font-semibold transition-all cursor-pointer ${
                    mitraInputMode === 'UMUM'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  + Input Umum / Non-Mitra
                </button>
              </div>
            </div>

            {mitraInputMode === 'TERDAFTAR' ? (
              activeMitras.length > 0 ? (
                <select
                  value={selectedMitraId}
                  onChange={(e) => setSelectedMitraId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-600 bg-white"
                >
                  {activeMitras.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.kode}) - {m.role} - Telp: {m.telepon || '-'}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between">
                  <span>Belum ada mitra terdaftar di database. Silakan gunakan tab <strong>Input Umum</strong>.</span>
                  <button
                    type="button"
                    onClick={() => setMitraInputMode('UMUM')}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[10px] cursor-pointer"
                  >
                    Beralih ke Input Umum
                  </button>
                </div>
              )
            ) : (
              <div className="space-y-2 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                      Nama Orang / Mitra Umum <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Pak Slamet, UD Jaya, Toko Berkah..."
                      value={namaUmumManual}
                      onChange={(e) => setNamaUmumManual(e.target.value)}
                      className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-600 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-600 mb-0.5">
                      No. Telepon / WhatsApp (Opsional)
                    </label>
                    <input
                      type="tel"
                      placeholder="08xxxxxxxxxx"
                      value={teleponUmumManual}
                      onChange={(e) => setTeleponUmumManual(e.target.value)}
                      className="w-full px-3 py-1.5 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-600 bg-white"
                    />
                  </div>
                </div>

                {/* Advanced Fuzzy Name Suggestion & Anti-Duplicate Warning */}
                <FuzzyNameWarningCard
                  inputName={namaUmumManual}
                  matches={similarMitras}
                  contextLabel="Pihak Nota Lalu"
                  theme="light"
                  isDismissed={isCurrentNotaLaluWarningDismissed}
                  onDismissDifferentPerson={() => setDismissedNotaLaluWarning(namaUmumManual.trim())}
                  onSelectRegistered={(m) => {
                    setSelectedMitraId(m.id);
                    setMitraInputMode('TERDAFTAR');
                    setNamaUmumManual('');
                  }}
                  onApplyCorrectedName={(corrected) => {
                    setNamaUmumManual(corrected);
                  }}
                />

                {/* Unregistered notification badge when truly no similar names exist */}
                {namaUmumManual.trim().length >= 2 && similarMitras.length === 0 && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Nama <strong>"{namaUmumManual}"</strong> belum ada di database. Saat disimpan, sistem akan otomatis mendaftarkannya sebagai akun Mitra baru.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Grid Nominal, Tanggal, No Nota */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Total Nominal (Rp) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1000"
                step="1000"
                required
                value={nominalInput}
                onChange={(e) => setNominalInput(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
              />
              <div className="text-[11px] font-bold text-amber-800 mt-1">{formatRupiah(nominal)}</div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                No. Faktur / Nota Fisik
              </label>
              <input
                type="text"
                placeholder="Contoh: NL-2023-088"
                value={noNotaLalu}
                onChange={(e) => setNoNotaLalu(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-semibold focus:ring-1 focus:ring-amber-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                Tanggal Nota Lalu (Bisa Mundur)
              </label>
              <input
                type="text"
                placeholder="DD/MM/YYYY misal 12/04/2023"
                value={tanggalNotaLalu}
                onChange={(e) => setTanggalNotaLalu(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-amber-600"
              />
            </div>
          </div>

          {/* Rincian Barang yang Di-bon */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
              {tipe === 'PIUTANG_BARANG_NOTA_LALU'
                ? 'Rincian Barang yang Di-bon Tempo Hari'
                : 'Rincian Komoditas / Titipan Panen'}
            </label>
            <textarea
              rows={2}
              placeholder={
                tipe === 'PIUTANG_BARANG_NOTA_LALU'
                  ? 'Contoh: Beras Belitang 5 Sak, Solar 2 Drigent, Balok 10 Btg'
                  : 'Contoh: Titipan hasil panen kopi 450 Kg belum dicairkan'
              }
              value={rincianBarang}
              onChange={(e) => setRincianBarang(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-600"
            />
          </div>

          {/* Keterangan Tambahan */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
              Keterangan Transaksi
            </label>
            <input
              type="text"
              placeholder="Keterangan pengingat tambahan..."
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs focus:ring-1 focus:ring-amber-600"
            />
          </div>

          {/* Cloud Database Status Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs">
            <div className="flex items-center space-x-2 text-emerald-950 font-medium text-[11px]">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Penyimpanan: Database ERP &amp; Cloud Supabase PostgreSQL</span>
            </div>
            <span className="text-[10px] text-emerald-700 font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Tersinkron Otomatis</span>
            </span>
          </div>

          {/* Capture Foto Fisik Nota Manual (Dasar Penguat) */}
          <div className="pt-2 border-t border-zinc-200">
            <div className="bg-amber-50/40 p-3 rounded-xl border border-amber-200 space-y-2">
              <div className="flex items-center space-x-2 text-xs font-bold text-amber-950">
                <Camera className="w-4 h-4 text-amber-600" />
                <span>Dasar Penguat: Capture / Foto Fisik Lembaran Nota Manual</span>
              </div>
              <p className="text-[11px] text-zinc-600">
                Ambil foto nota kertas asli menggunakan kamera HP atau upload file. Gambar dikompresi ringan secara instan tanpa membuat aplikasi lambat/stagnan.
              </p>
              <ImageUploadZone
                label="Foto Nota Kertas Manual"
                sublabel="Kamera HP atau Galeri Gambar (Bisa Lampirkan Lebih Dari 1 Foto Nota)"
                value={fotoNota}
                onChange={setFotoNota}
                multiple={true}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-zinc-600 hover:bg-zinc-100 rounded-lg font-semibold text-xs cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting || nominal <= 0}
              className={`px-5 py-2 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer ${
                tipe === 'PIUTANG_BARANG_NOTA_LALU'
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-purple-700 hover:bg-purple-800'
              } disabled:opacity-50 flex items-center space-x-1.5`}
            >
              {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {submitting
                  ? 'Menyimpan...'
                  : `Simpan ${tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'Piutang Nota Lalu' : 'Titip Uang Nota Lalu'} (${formatRupiah(nominal)})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
