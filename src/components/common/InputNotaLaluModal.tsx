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
  HardDrive,
} from 'lucide-react';
import { Mitra } from '../../server/types.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ImageUploadZone } from './ImageUploadZone.tsx';
import {
  getAccessToken,
  uploadNotaProofToDrive,
  googleSignIn,
} from '../../services/googleSheetsService.ts';

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
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');

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

  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(false);
  const [connectingDrive, setConnectingDrive] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitStep, setSubmitStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Smart suggestion for manual name vs registered contacts (Customer / Supplier / Mitra Tani)
  const queryMitra = namaUmumManual.trim().toLowerCase();
  const matchingMitras =
    queryMitra.length >= 1
      ? mitraList.filter(
          (m) =>
            m.status === 'AKTIF' &&
            (m.nama.toLowerCase().includes(queryMitra) ||
              m.kode.toLowerCase().includes(queryMitra) ||
              (m.telepon && m.telepon.includes(queryMitra)))
        )
      : [];

  useEffect(() => {
    if (preselectedMitraId) {
      setSelectedMitraId(preselectedMitraId);
      setMitraInputMode('TERDAFTAR');
    } else if (!selectedMitraId && activeMitras.length > 0) {
      setSelectedMitraId(activeMitras[0].id);
    }
  }, [preselectedMitraId, activeMitras, selectedMitraId]);

  // Check Drive connection status
  useEffect(() => {
    if (isOpen) {
      getAccessToken().then((token) => {
        setIsDriveConnected(!!token);
      });
    }
  }, [isOpen]);

  // Set default no nota if empty
  useEffect(() => {
    if (!noNotaLalu && isOpen) {
      const prefix = tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'NL-BRG' : 'NL-TTP';
      setNoNotaLalu(`${prefix}-${Date.now().toString().slice(-4)}`);
    }
  }, [isOpen, tipe, noNotaLalu]);

  if (!isOpen) return null;

  const nominal = Number(nominalInput) || 0;
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);
  const driveFolderName =
    tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'PIUTANG NOTA LAMA' : 'HUTANG NOTA LAMA';

  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    setErrorMsg('');
    try {
      const res = await googleSignIn();
      if (res) {
        setIsDriveConnected(true);
      }
    } catch (err: any) {
      console.warn('Google sign-in error:', err);
      setErrorMsg('Gagal menghubungkan Google Drive. Transaksi tetap bisa disimpan di database.');
    } finally {
      setConnectingDrive(false);
    }
  };

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

        // Check if matching registered exists
        const matchedExisting = mitraList.find(
          (m) => m.nama.toLowerCase() === trimmedNama.toLowerCase()
        );

        if (matchedExisting) {
          finalMitraId = matchedExisting.id;
          finalMitraNama = matchedExisting.nama;
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
      let driveFolderPath = `NOTA LALU - PT WIJAYA AGRO / ${driveFolderName}`;

      // Step 1: Upload proof photo to Google Drive with non-blocking 5s safety timeout
      if (fotoNota && fotoNota.startsWith('data:image/')) {
        const token = await getAccessToken();
        if (token) {
          setSubmitStep(`Mengunggah foto bukti ke Google Drive (${driveFolderName})...`);
          try {
            const fileName = `NOTA_${(finalMitraNama || 'UMUM').replace(/[^a-zA-Z0-9]/g, '_')}_${noNotaLalu || Date.now()}.jpg`;
            const driveUpload = await Promise.race([
              uploadNotaProofToDrive({
                imageBase64: fotoNota,
                fileName,
                folderType:
                  tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'PIUTANG_NOTA_LAMA' : 'HUTANG_NOTA_LAMA',
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Drive upload timeout')), 5000)
              ),
            ]);
            driveFileUrl = driveUpload.webViewLink;
            driveFileId = driveUpload.fileId;
            driveFolderPath = driveUpload.folderPath;
          } catch (uploadErr: any) {
            console.warn('Upload Drive dilewati (timeout/gagal), menyimpan langsung di database lokal:', uploadErr);
          }
        }
      }

      // Step 2: Store transaction into ERP database
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
      onSuccess(result);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan transaksi nota lalu');
    } finally {
      setSubmitting(false);
      setSubmitStep('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200 animate-in fade-in my-8">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-700 via-amber-800 to-zinc-900 text-white flex items-center justify-between">
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
                Konversi bon bertahun-tahun lalu &amp; simpan bukti foto fisik langsung ke Google Drive
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
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

                {/* Smart Suggestion if name matches existing supplier/customer */}
                {matchingMitras.length > 0 && (
                  <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-lg space-y-1.5 text-xs animate-in fade-in">
                    <div className="flex items-center space-x-1.5 text-sky-900 font-bold text-[11px]">
                      <span>💡</span>
                      <span>Sugesti: Nama ini sudah mirip dengan kontak terdaftar! Apakah pihak ini?</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {matchingMitras.slice(0, 3).map((match) => (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => {
                            setSelectedMitraId(match.id);
                            setMitraInputMode('TERDAFTAR');
                            setNamaUmumManual('');
                          }}
                          className="px-2 py-1 bg-white hover:bg-sky-100 border border-sky-300 rounded-lg text-[10px] font-bold text-sky-950 flex items-center space-x-1 shadow-2xs cursor-pointer transition-colors"
                          title="Klik untuk memilih kontak terdaftar ini"
                        >
                          <span>{match.nama}</span>
                          <span className="px-1 py-0.2 bg-sky-200 text-sky-900 rounded font-semibold text-[9px]">
                            {match.role}
                          </span>
                          <span className="text-emerald-700 font-bold">✓ Pilih</span>
                        </button>
                      ))}
                    </div>
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

          {/* GOOGLE DRIVE STORAGE STRUCTURE BANNER (User suggestion) */}
          <div className="p-3 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-sky-950">
                <HardDrive className="w-4 h-4 text-sky-600" />
                <span>Penyimpanan Bukti Nota ke Google Drive:</span>
              </div>
              {isDriveConnected ? (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Drive Terhubung</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  disabled={connectingDrive}
                  className="text-[10px] bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-0.5 rounded-lg flex items-center space-x-1 cursor-pointer transition-colors"
                >
                  <FolderSync className="w-3 h-3" />
                  <span>{connectingDrive ? 'Menghubungkan...' : 'Hubungkan Drive'}</span>
                </button>
              )}
            </div>

            <div className="text-[11px] text-zinc-700 font-mono bg-white/80 p-2 rounded-lg border border-sky-200/80">
              <span className="text-zinc-500 font-sans">Folder Tujuan: </span>
              <strong>NOTA LALU - PT WIJAYA AGRO / </strong>
              <span className={tipe === 'PIUTANG_BARANG_NOTA_LALU' ? 'text-rose-700 font-bold' : 'text-purple-700 font-bold'}>
                {driveFolderName}
              </span>
            </div>

            <p className="text-[10px] text-zinc-500">
              Foto bukti nota lama otomatis diunggah ke subfolder terpisah (Piutang Nota Lama / Hutang Nota Lama) di dalam satu Folder Nota Lalu di Drive Anda.
            </p>
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
                sublabel="Kamera HP atau Galeri Gambar"
                value={fotoNota}
                onChange={setFotoNota}
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
