import React, { useState, useEffect } from 'react';
import {
  Wheat,
  Scale,
  Calculator,
  Save,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Layers,
  Coffee,
  Check,
} from 'lucide-react';
import { StokHasilBumi, TransaksiPembelianHasilBumi } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  stokList: StokHasilBumi[];
  pembelianList: TransaksiPembelianHasilBumi[];
  onSuccess: () => void;
  initialSelectedKode?: string;
}

interface CommodityFormData {
  kode: string;
  nama: string;
  satuan: string;
  stokAwal: string;
  rataRataModalAwal: string;
  keterangan: string;
}

export const ModalInputStokAwalHasilBumi: React.FC<Props> = ({
  isOpen,
  onClose,
  stokList,
  pembelianList,
  onSuccess,
  initialSelectedKode,
}) => {
  // Filter out KOPI JALAN
  const activeStokList = stokList.filter(
    (h) => h.kode !== 'HB-01B' && !h.nama.toUpperCase().includes('KOPI JALAN')
  );

  const [selectedKode, setSelectedKode] = useState<string>(
    initialSelectedKode || activeStokList[0]?.kode || 'HB-01'
  );

  // Form states per commodity
  const [formData, setFormData] = useState<Record<string, { stokAwal: string; rataRataModalAwal: string; keterangan: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [viewMode, setViewMode] = useState<'SINGLE' | 'TABLE'>('SINGLE');

  // Initialize form data from current stokList
  useEffect(() => {
    if (activeStokList.length > 0) {
      const initial: Record<string, { stokAwal: string; rataRataModalAwal: string; keterangan: string }> = {};
      activeStokList.forEach((h) => {
        initial[h.kode] = {
          stokAwal: h.stokAwal !== undefined && h.stokAwal > 0 ? h.stokAwal.toString() : (formData[h.kode]?.stokAwal || '0'),
          rataRataModalAwal: h.rataRataModalAwal !== undefined && h.rataRataModalAwal > 0
            ? h.rataRataModalAwal.toString()
            : (formData[h.kode]?.rataRataModalAwal || (h.hargaBeliStandar ? h.hargaBeliStandar.toString() : '0')),
          keterangan: h.keteranganStokAwal || formData[h.kode]?.keterangan || 'Rekap stok manual gudang sebelum aplikasi',
        };
      });
      setFormData(initial);
    }
  }, [stokList, isOpen]);

  useEffect(() => {
    if (initialSelectedKode) {
      setSelectedKode(initialSelectedKode);
    }
  }, [initialSelectedKode]);

  if (!isOpen) return null;

  const currentHb = activeStokList.find((h) => h.kode === selectedKode) || activeStokList[0];
  const currentForm = formData[selectedKode] || { stokAwal: '0', rataRataModalAwal: '0', keterangan: '' };

  const handleInputChange = (kode: string, field: 'stokAwal' | 'rataRataModalAwal' | 'keterangan', val: string) => {
    setFormData((prev) => ({
      ...prev,
      [kode]: {
        ...prev[kode],
        [field]: val,
      },
    }));
  };

  // Calculations for current selected commodity
  const purchasesCurrent = pembelianList.filter(
    (p) =>
      p.komoditasKode === currentHb?.kode ||
      p.komoditasNama.toUpperCase().trim() === currentHb?.nama.toUpperCase().trim()
  );

  const pembelianBaruKg = purchasesCurrent.reduce((sum, p) => sum + (p.beratBersih || 0), 0);
  const pembelianBaruNominal = purchasesCurrent.reduce((sum, p) => sum + (p.totalNominal || 0), 0);

  const stokAwalInputKg = Number(currentForm.stokAwal) || 0;
  const modalAwalInputRp = Number(currentForm.rataRataModalAwal) || 0;
  const modalAwalTotalNominal = Math.round(stokAwalInputKg * modalAwalInputRp);

  const totalStokBalanceKg = stokAwalInputKg + pembelianBaruKg;
  const totalUangKeluarSemua = modalAwalTotalNominal + pembelianBaruNominal;
  const totalKgBeliSemua = stokAwalInputKg + pembelianBaruKg;
  const rataRataModalTergabung =
    totalKgBeliSemua > 0 && totalUangKeluarSemua > 0
      ? Math.round(totalUangKeluarSemua / totalKgBeliSemua)
      : modalAwalInputRp;

  // Handle Save (either single active commodity or all)
  const handleSave = async (saveAll: boolean = false) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      const itemsToUpdate = (saveAll ? activeStokList : [currentHb]).map((hb) => {
        const form = formData[hb.kode] || { stokAwal: '0', rataRataModalAwal: '0', keterangan: '' };
        const sAwal = Number(form.stokAwal) || 0;
        const rModal = Number(form.rataRataModalAwal) || 0;
        return {
          kode: hb.kode,
          stokAwal: sAwal,
          rataRataModalAwal: rModal,
          modalAwalTotal: Math.round(sAwal * rModal),
          keterangan: form.keterangan || 'Rekap manual lama sebelum aplikasi',
        };
      });

      await api.updateSaldoAwalHasilBumi({ items: itemsToUpdate });

      setSuccessMsg(
        saveAll
          ? 'Berhasil menyimpan dan menyeimbangkan saldo awal untuk seluruh 8 komoditas hasil bumi!'
          : `Berhasil menyimpan saldo awal & modal lama untuk ${currentHb.nama}!`
      );

      onSuccess();
      setTimeout(() => {
        setSuccessMsg('');
      }, 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan saldo awal hasil bumi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-800 via-amber-900 to-amber-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-700/60 border border-amber-600/60">
              <Scale className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight flex items-center space-x-2">
                <span>Input Rekap Stok Lama &amp; Modal Awal Hasil Bumi</span>
                <span className="text-[10px] bg-amber-600/80 text-white font-mono px-2 py-0.5 rounded-full uppercase">
                  Saldo Awal Manual
                </span>
              </h2>
              <p className="text-xs text-amber-200/90 mt-0.5">
                Sinkronkan rekap stok fisik gudang dan rata-rata harga beli yang sudah dicatat sebelum menggunakan aplikasi
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <div className="bg-amber-950/80 p-0.5 rounded-lg border border-amber-700/60 hidden sm:flex">
              <button
                type="button"
                onClick={() => setViewMode('SINGLE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  viewMode === 'SINGLE' ? 'bg-amber-700 text-white shadow-xs' : 'text-amber-300 hover:text-white'
                }`}
              >
                Fokus Per Komoditas
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                  viewMode === 'TABLE' ? 'bg-amber-700 text-white shadow-xs' : 'text-amber-300 hover:text-white'
                }`}
              >
                Tabel Semua Komoditas (1-8)
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-amber-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {viewMode === 'SINGLE' ? (
            <div className="space-y-5">
              {/* Commodity Selector Chips */}
              <div>
                <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
                  Pilih Komoditas Hasil Bumi:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {activeStokList.map((hb, idx) => {
                    const isSelected = hb.kode === selectedKode;
                    const isTitip = hb.kode === 'HB-08' || hb.isBelumPutusHarga;
                    const fData = formData[hb.kode] || { stokAwal: '0', rataRataModalAwal: '0' };
                    const hasInput = Number(fData.stokAwal) > 0;

                    return (
                      <button
                        key={hb.kode}
                        type="button"
                        onClick={() => setSelectedKode(hb.kode)}
                        className={`p-2.5 rounded-xl border text-left transition-all relative ${
                          isSelected
                            ? 'bg-amber-50 border-amber-600 ring-2 ring-amber-500/20 shadow-xs'
                            : 'bg-white hover:bg-zinc-50 border-zinc-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono font-bold text-zinc-500">
                            {idx + 1}. {hb.kode}
                          </span>
                          {hasInput && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Ada saldo awal" />
                          )}
                        </div>
                        <div className="text-xs font-bold text-zinc-900 truncate flex items-center space-x-1">
                          {isTitip && <Coffee className="w-3 h-3 text-amber-700 shrink-0" />}
                          <span>{hb.nama}</span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 flex justify-between">
                          <span>Stok: {hb.stok.toLocaleString('id-ID')} Kg</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Input Form for Selected Commodity */}
              <div className="bg-amber-50/40 rounded-2xl border border-amber-200/80 p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-amber-200/80">
                  <div className="flex items-center space-x-2">
                    <Wheat className="w-5 h-5 text-amber-700" />
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">
                        {currentHb.nama} ({currentHb.kode})
                      </h3>
                      <p className="text-[11px] text-zinc-500">
                        Masukkan rekap jumlah kilogram lama dan patokan modal pembelian manual sebelumnya
                      </p>
                    </div>
                  </div>
                  {currentHb.kode === 'HB-08' && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                      ☕ TITIP PANEN (BELUM PUTUS HARGA)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-800 mb-1">
                      1. Rekap Stok Fisik Gudang Lama (Kg) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={currentForm.stokAwal}
                        onChange={(e) => handleInputChange(selectedKode, 'stokAwal', e.target.value)}
                        placeholder="Contoh: 2500"
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-amber-500 focus:border-amber-500 pr-12"
                      />
                      <span className="absolute right-3 top-2.5 text-xs font-bold text-zinc-400">Kg</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Kuantitas hasil bumi yang sudah ada di gudang sebelum sistem aplikasi ini dijalankan.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-800 mb-1">
                      2. Rata-rata Modal Beli Lama (Rp / Kg) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-zinc-400">Rp</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={currentForm.rataRataModalAwal}
                        onChange={(e) => handleInputChange(selectedKode, 'rataRataModalAwal', e.target.value)}
                        placeholder="Contoh: 42000"
                        className="w-full px-3 py-2 pl-9 bg-white border border-zinc-300 rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Rata-rata uang modal keluar per kilogram yang dikeluarkan saat membeli stok lama tersebut.
                    </p>
                  </div>
                </div>

                {/* Subtotal uang modal lama */}
                <div className="p-3 bg-white rounded-xl border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="text-zinc-600">
                    <span className="font-semibold">Akumulasi Modal Fisik Lama:</span>
                    <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                      {stokAwalInputKg.toLocaleString('id-ID')} Kg × {formatRupiah(modalAwalInputRp)}/Kg
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 uppercase font-semibold">Total Nilai Modal Keluar Lalu:</div>
                    <div className="text-base font-extrabold text-amber-900 font-mono">
                      {formatRupiah(modalAwalTotalNominal)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                    Catatan / Referensi Rekap Manual (Opsional)
                  </label>
                  <input
                    type="text"
                    value={currentForm.keterangan}
                    onChange={(e) => handleInputChange(selectedKode, 'keterangan', e.target.value)}
                    placeholder="Contoh: Rekap fisik gudang s/d tanggal 30 September dari buku catatan"
                    className="w-full px-3 py-1.5 bg-white border border-zinc-300 rounded-xl text-xs text-zinc-800"
                  />
                </div>
              </div>

              {/* LIVE BALANCE CALCULATOR & PREVIEW */}
              <div className="bg-emerald-950 text-emerald-100 p-4 rounded-2xl border border-emerald-800 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-800/80 pb-2">
                  <div className="flex items-center space-x-2">
                    <Calculator className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Simulasi Keseimbangan Stok &amp; Modal Beli Tergabung
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 border border-emerald-700">
                    REALTIME BALANCE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-emerald-900/60 border border-emerald-800 space-y-1">
                    <span className="text-[10px] text-emerald-300 uppercase block font-semibold">A. Rekap Manual Lama:</span>
                    <div className="font-bold text-white text-sm">
                      {stokAwalInputKg.toLocaleString('id-ID')} Kg
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Modal: {formatRupiah(modalAwalTotalNominal)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-900/60 border border-emerald-800 space-y-1">
                    <span className="text-[10px] text-emerald-300 uppercase block font-semibold">B. Pembelian Berjalan Apps:</span>
                    <div className="font-bold text-white text-sm">
                      {pembelianBaruKg.toLocaleString('id-ID')} Kg
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono">
                      Total Uang: {formatRupiah(pembelianBaruNominal)} ({purchasesCurrent.length} Nota)
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-emerald-900 border border-emerald-600/80 space-y-1 ring-1 ring-emerald-400/20">
                    <span className="text-[10px] text-emerald-200 uppercase block font-bold">C. Stok Total Seimbang (A + B):</span>
                    <div className="font-extrabold text-white text-base font-mono">
                      {totalStokBalanceKg.toLocaleString('id-ID')} Kg
                    </div>
                    <div className="text-[10px] text-emerald-300 font-mono">
                      {(totalStokBalanceKg / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} Ton
                    </div>
                  </div>
                </div>

                {/* Final Weighted Average Formula */}
                <div className="p-3 bg-emerald-900/90 rounded-xl border border-emerald-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="text-emerald-300 font-bold block">
                      Rata-rata Modal Beli Akhir (Total Keluar ÷ Total Kg):
                    </span>
                    <span className="text-[10px] text-emerald-400/90 font-mono">
                      ({formatRupiah(modalAwalTotalNominal)} + {formatRupiah(pembelianBaruNominal)}) ÷ ({stokAwalInputKg.toLocaleString('id-ID')} + {pembelianBaruKg.toLocaleString('id-ID')} Kg)
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black text-amber-300 font-mono">
                      {formatRupiah(rataRataModalTergabung)} / Kg
                    </div>
                    <span className="text-[10px] text-emerald-300">Otomatis update di Card Stok &amp; Rekapan</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Table View: All 8 commodities at a glance */
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold">📋 Input Masal untuk 8 Komoditas:</span> Anda dapat mengisi stok awal dan rata-rata modal lama untuk seluruh komoditas sekaligus pada tabel di bawah ini.
              </div>

              <div className="overflow-x-auto border border-zinc-200 rounded-xl shadow-2xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-zinc-100 text-zinc-700 font-bold uppercase text-[10px] tracking-wider border-b border-zinc-200">
                    <tr>
                      <th className="py-2.5 px-3">No / Komoditas</th>
                      <th className="py-2.5 px-3">Stok Lama (Kg)</th>
                      <th className="py-2.5 px-3">Modal Lama (Rp/Kg)</th>
                      <th className="py-2.5 px-3 text-right">Total Uang Modal Lalu</th>
                      <th className="py-2.5 px-3 text-center">Beli Baru (Apps)</th>
                      <th className="py-2.5 px-3 text-right">Stok Balance</th>
                      <th className="py-2.5 px-3 text-right">Rata-rata Gabungan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {activeStokList.map((hb, idx) => {
                      const f = formData[hb.kode] || { stokAwal: '0', rataRataModalAwal: '0', keterangan: '' };
                      const sAwal = Number(f.stokAwal) || 0;
                      const rModal = Number(f.rataRataModalAwal) || 0;
                      const mTotal = Math.round(sAwal * rModal);

                      const pList = pembelianList.filter(
                        (p) =>
                          p.komoditasKode === hb.kode ||
                          p.komoditasNama.toUpperCase().trim() === hb.nama.toUpperCase().trim()
                      );
                      const bKg = pList.reduce((sum, p) => sum + (p.beratBersih || 0), 0);
                      const bNom = pList.reduce((sum, p) => sum + (p.totalNominal || 0), 0);

                      const balKg = sAwal + bKg;
                      const totUang = mTotal + bNom;
                      const avgGabung = balKg > 0 && totUang > 0 ? Math.round(totUang / balKg) : rModal;

                      return (
                        <tr key={hb.kode} className="hover:bg-amber-50/30">
                          <td className="py-2.5 px-3 font-semibold text-zinc-900">
                            <span className="font-mono text-[10px] text-zinc-400 block">{idx + 1}. {hb.kode}</span>
                            <span>{hb.nama}</span>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              value={f.stokAwal}
                              onChange={(e) => handleInputChange(hb.kode, 'stokAwal', e.target.value)}
                              className="w-24 px-2 py-1 border border-zinc-300 rounded-lg text-xs font-mono font-bold"
                              placeholder="0"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              value={f.rataRataModalAwal}
                              onChange={(e) => handleInputChange(hb.kode, 'rataRataModalAwal', e.target.value)}
                              className="w-28 px-2 py-1 border border-zinc-300 rounded-lg text-xs font-mono"
                              placeholder="0"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-700">
                            {formatRupiah(mTotal)}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-[11px] text-zinc-500">
                            {bKg.toLocaleString('id-ID')} Kg
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-900">
                            {balKg.toLocaleString('id-ID')} Kg
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-900">
                            {formatRupiah(avgGabung)}/Kg
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-zinc-500 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              Perubahan saldo awal akan langsung memperbarui stok fisik gudang dan rata-rata modal beli pada card stok.
            </span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              Batal
            </button>

            {viewMode === 'SINGLE' ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSave(false)}
                className="flex-1 sm:flex-none px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Simpan {currentHb.nama}</span>
              </button>
            ) : null}

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSave(true)}
              className="flex-1 sm:flex-none px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan Seluruh Komoditas (1-8)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
