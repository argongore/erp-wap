import React, { useState } from 'react';
import { Wheat, CheckCircle2, AlertCircle, Scale, Wallet, AlertTriangle } from 'lucide-react';
import { Mitra, Rekening, StokHasilBumi, TransaksiPembelianHasilBumi } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';

interface Props {
  stokHasilBumiList: StokHasilBumi[];
  mitraList: Mitra[];
  rekeningList: Rekening[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

export const PembelianHasilBumiView: React.FC<Props> = ({
  stokHasilBumiList,
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
}) => {
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');
  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );
  const kas01 = rekeningList.find((r) => r.kode === 'KAS01');

  const [selectedMitraId, setSelectedMitraId] = useState<string>(activeMitras[0]?.id || '');
  const [selectedKomoditasKode, setSelectedKomoditasKode] = useState<string>(stokHasilBumiList[0]?.kode || '');

  const [beratKotorInput, setBeratKotorInput] = useState<string>('1000');
  const [rafaksiInput, setRafaksiInput] = useState<string>('3');
  const [hargaPerKgInput, setHargaPerKgInput] = useState<string>(
    stokHasilBumiList[0]?.hargaBeliStandar?.toString() || '4800'
  );

  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'TITIP'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('BNI01');
  const [keterangan, setKeterangan] = useState<string>('');

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Calculations
  const beratKotor = Number(beratKotorInput) || 0;
  const rafaksi = Number(rafaksiInput) || 0;
  const beratBersih = Math.max(0, Math.round(beratKotor * (1 - rafaksi / 100) * 100) / 100);
  const hargaPerKg = Number(hargaPerKgInput) || 0;
  const totalTagihan = Math.round(beratBersih * hargaPerKg);

  const selectedKomoditas = stokHasilBumiList.find((k) => k.kode === selectedKomoditasKode);
  const selectedMitra = activeMitras.find((m) => m.id === selectedMitraId);

  const handleKomoditasChange = (kode: string) => {
    setSelectedKomoditasKode(kode);
    const kom = stokHasilBumiList.find((k) => k.kode === kode);
    if (kom) {
      setHargaPerKgInput(kom.hargaBeliStandar.toString());
    }
  };

  const handleProcessSubmit = async () => {
    setErrorMsg('');
    if (beratKotor <= 0) {
      setErrorMsg('Berat kotor timbangan harus lebih dari 0 kg');
      return;
    }
    if (hargaPerKg <= 0) {
      setErrorMsg('Harga per kg harus lebih dari Rp 0');
      return;
    }

    setSubmitting(true);
    try {
      const result: TransaksiPembelianHasilBumi = await api.processPembelianHasilBumi({
        idMitra: selectedMitraId,
        komoditasKode: selectedKomoditasKode,
        beratKotor,
        potonganRafaksi: rafaksi,
        hargaPerKg,
        metodePembayaran: metode,
        rekeningSumber: metode === 'TRANSFER' ? rekeningSumber : undefined,
        keterangan,
      });

      setShowConfirmModal(false);
      onRefresh();

      const receipt: ReceiptData = {
        title: 'SLIP PEMBELIAN HASIL BUMI',
        subtitle: `Metode: ${result.metodePembayaran} (${result.status})`,
        nomorTransaksi: result.noPembelian,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra,
        rekening: result.rekeningSumber,
        kategori: 'PEMBELIAN_HASIL_BUMI',
        detailRows: [
          { label: 'Komoditas', value: result.komoditasNama },
          { label: 'Berat Timbangan Kotor', value: `${result.beratKotor.toLocaleString('id-ID')} Kg` },
          { label: 'Potongan Rafaksi / Kadar Air', value: `${result.potonganRafaksi}%` },
          { label: 'Berat Bersih Diterima', value: `${result.beratBersih.toLocaleString('id-ID')} Kg`, highlight: true },
          { label: 'Harga Satuan / Kg', value: formatRupiah(result.hargaPerKg) },
          { label: 'Metode Pembayaran', value: result.metodePembayaran },
          { label: 'Rekening Pengeluaran / Status', value: `${result.rekeningSumber} (${result.status})` },
          { label: 'Total Pembayaran', value: result.totalNominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses pembelian hasil bumi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Kasir Pembelian Hasil Bumi</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              MODUL 2.B
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Penimbangan, pemotongan rafaksi, dan pembayaran hasil panen petani (Tunai, Transfer, Titip)
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Timbangan & Komoditas */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mitra Selector */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs space-y-3">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
              1. Identitas Petani / Supplier <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedMitraId}
              onChange={(e) => setSelectedMitraId(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-amber-600"
            >
              {activeMitras.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama} ({m.kode}) - {m.role} - {m.telepon}
                </option>
              ))}
            </select>
          </div>

          {/* Commodity & Weighing Details */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs space-y-4">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
              2. Data Penimbangan &amp; Mutu Komoditas
            </label>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Jenis Hasil Bumi</label>
              <select
                value={selectedKomoditasKode}
                onChange={(e) => handleKomoditasChange(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-amber-600"
              >
                {stokHasilBumiList.map((hb) => (
                  <option key={hb.kode} value={hb.kode}>
                    {hb.nama} (Stok Saat Ini: {hb.stok.toLocaleString('id-ID')} {hb.satuan})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Berat Kotor Timbang (Kg) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={beratKotorInput}
                    onChange={(e) => setBeratKotorInput(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                  />
                  <Scale className="w-4 h-4 text-zinc-400 absolute right-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Potongan Rafaksi (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={rafaksiInput}
                  onChange={(e) => setRafaksiInput(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                  Harga Beli per Kg (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={hargaPerKgInput}
                  onChange={(e) => setHargaPerKgInput(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-amber-600"
                />
              </div>
            </div>

            {/* Calculated Weight Result Card */}
            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between text-xs">
              <div>
                <span className="text-zinc-600">Berat Bersih Dihitung:</span>
                <div className="text-base font-bold text-amber-900 font-mono">
                  {beratBersih.toLocaleString('id-ID')} Kg
                </div>
                <div className="text-[10px] text-zinc-500">
                  Potongan susut/kotor: {((beratKotor * rafaksi) / 100).toFixed(1)} Kg
                </div>
              </div>
              <div className="text-right">
                <span className="text-zinc-600">Total Nominal Pembelian:</span>
                <div className="text-lg font-bold text-zinc-900">{formatRupiah(totalTagihan)}</div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">Keterangan / Nomor Kendaraan</label>
              <input
                type="text"
                placeholder="Misal: Truk Colt Diesel Plat AB 1234 CD"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* Right Form: Payment Method & Source Account */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs p-5 space-y-4">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
              3. Metode Pembayaran Hasil Panen
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setMetode('TUNAI')}
                className={`py-2 px-2 text-center rounded-lg font-semibold text-xs border transition-all ${
                  metode === 'TUNAI'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                }`}
              >
                Tunai (KAS01)
              </button>

              <button
                type="button"
                onClick={() => setMetode('TRANSFER')}
                className={`py-2 px-2 text-center rounded-lg font-semibold text-xs border transition-all ${
                  metode === 'TRANSFER'
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                }`}
              >
                Transfer Bank
              </button>

              <button
                type="button"
                onClick={() => setMetode('TITIP')}
                className={`py-2 px-2 text-center rounded-lg font-semibold text-xs border transition-all ${
                  metode === 'TITIP'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                }`}
              >
                Titip / Hutang
              </button>
            </div>

            {metode === 'TUNAI' && (
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-600">Rekening Sumber Kas:</span>
                  <span className="font-mono font-bold text-zinc-900">KAS01 (Kas Utama Kasir)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">Saldo Kas Saat Ini:</span>
                  <span className="font-bold text-emerald-800">{formatRupiah(kas01?.saldoSaatIni || 0)}</span>
                </div>
                {(kas01?.saldoSaatIni || 0) < totalTagihan && (
                  <div className="text-[11px] text-rose-600 font-semibold pt-1 border-t border-zinc-200">
                    ⚠ Saldo KAS01 tidak mencukupi untuk pembayaran tunai ini!
                  </div>
                )}
              </div>
            )}

            {metode === 'TRANSFER' && (
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs space-y-2">
                <label className="block font-semibold text-sky-900">Pilih Rekening Bank Pengeluaran:</label>
                <select
                  value={rekeningSumber}
                  onChange={(e) => setRekeningSumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-sky-300 rounded bg-white text-xs font-medium"
                >
                  {availableBanks.map((b) => (
                    <option key={b.kode} value={b.kode}>
                      {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {metode === 'TITIP' && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-xs text-purple-900 space-y-1">
                <div className="font-bold">Konsep Titip / Belum Diambil:</div>
                <p className="text-[11px]">
                  Barang masuk ke persediaan gudang, namun dana belum dibayarkan kepada petani (pembayaran ditangguhkan).
                  Otomatis tersinkronisasi ke rekening virtual <strong>TIT01 (Hutang Supplier)</strong>.
                </p>
              </div>
            )}

            {/* Total Recap Card */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Komoditas:</span>
                <span className="font-semibold text-zinc-900">{selectedKomoditas?.nama}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Berat Bersih:</span>
                <span className="font-bold font-mono text-zinc-900">{beratBersih.toLocaleString('id-ID')} Kg</span>
              </div>
              <div className="flex justify-between text-base font-bold text-zinc-900 pt-2 border-t border-zinc-200">
                <span>Total Biaya Pembelian:</span>
                <span className="text-amber-900">{formatRupiah(totalTagihan)}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={beratBersih <= 0 || totalTagihan <= 0}
              onClick={() => setShowConfirmModal(true)}
              className="w-full py-2.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
            >
              Simpan &amp; Proses Timbangan ({formatRupiah(totalTagihan)})
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-amber-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Pembelian Hasil Bumi</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-amber-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Petani / Supplier:</span>
                  <span className="font-bold text-zinc-900">{selectedMitra?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Komoditas:</span>
                  <span className="font-semibold text-zinc-900">{selectedKomoditas?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Berat Bersih:</span>
                  <span className="font-bold font-mono">{beratBersih.toLocaleString('id-ID')} Kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Metode Bayar:</span>
                  <span className="font-bold text-amber-800">{metode}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Total Nilai:</span>
                  <span className="font-bold text-sm text-zinc-900">{formatRupiah(totalTagihan)}</span>
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
                  className="px-4 py-1.5 bg-amber-700 text-white font-bold rounded-md hover:bg-amber-800 disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Konfirmasi & Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
