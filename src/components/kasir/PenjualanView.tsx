import React, { useState } from 'react';
import { ShoppingCart, Plus, Trash2, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Mitra, Produk, Rekening, StokBarang, TransaksiPenjualan } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';

interface Props {
  produkList: Produk[];
  stokList: StokBarang[];
  mitraList: Mitra[];
  rekeningList: Rekening[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
}

interface CartItem {
  kodeProduk: string;
  nama: string;
  satuan: string;
  qty: number;
  harga: number;
  subtotal: number;
  stokTersedia: number;
}

export const PenjualanView: React.FC<Props> = ({
  produkList,
  stokList,
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
}) => {
  const [selectedMitraId, setSelectedMitraId] = useState<string>(mitraList[0]?.id || '');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'KASBON'>('TUNAI');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>('BNI01');
  const [keterangan, setKeterangan] = useState<string>('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(produkList[0]?.kode || '');
  const [qtyInput, setQtyInput] = useState<number>(1);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );

  const activeProducts = produkList.filter((p) => p.status === 'AKTIF');
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');

  // Find stock info for selected product code
  const currentStokInfo = stokList.find((s) => s.kode === selectedProductCode);
  const currentProductInfo = produkList.find((p) => p.kode === selectedProductCode);

  const handleAddToCart = () => {
    setErrorMsg('');
    if (!selectedProductCode) return;
    if (qtyInput <= 0) {
      setErrorMsg('Jumlah qty harus lebih dari 0');
      return;
    }

    const prod = activeProducts.find((p) => p.kode === selectedProductCode);
    const stokItem = stokList.find((s) => s.kode === selectedProductCode);

    if (!prod || !stokItem) {
      setErrorMsg('Data produk atau stok tidak ditemukan');
      return;
    }

    const existingCartItem = cart.find((i) => i.kodeProduk === selectedProductCode);
    const existingQty = existingCartItem ? existingCartItem.qty : 0;
    const totalRequestedQty = existingQty + qtyInput;

    // Real-time stock validation check
    if (totalRequestedQty > stokItem.stok) {
      setErrorMsg(
        `Stok tidak mencukupi untuk "${prod.nama}". Tersedia: ${stokItem.stok} ${stokItem.satuan}, diminta di keranjang: ${totalRequestedQty} ${stokItem.satuan}`
      );
      return;
    }

    if (existingCartItem) {
      setCart(
        cart.map((item) =>
          item.kodeProduk === selectedProductCode
            ? {
                ...item,
                qty: totalRequestedQty,
                subtotal: totalRequestedQty * item.harga,
              }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          kodeProduk: prod.kode,
          nama: prod.nama,
          satuan: prod.satuan,
          qty: qtyInput,
          harga: prod.hargaJual,
          subtotal: qtyInput * prod.hargaJual,
          stokTersedia: stokItem.stok,
        },
      ]);
    }

    setQtyInput(1);
  };

  const handleRemoveFromCart = (kode: string) => {
    setCart(cart.filter((item) => item.kodeProduk !== kode));
  };

  const totalBelanja = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleProcessSubmit = async () => {
    if (cart.length === 0) {
      setErrorMsg('Keranjang penjualan masih kosong');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);

    try {
      const result: TransaksiPenjualan = await api.processPenjualan({
        idMitra: selectedMitraId,
        metode,
        rekeningTujuan: metode === 'TRANSFER' ? rekeningTujuan : undefined,
        items: cart.map((i) => ({ kodeProduk: i.kodeProduk, qty: i.qty, harga: i.harga })),
        keterangan,
      });

      setShowConfirmModal(false);
      setCart([]);
      setKeterangan('');
      onRefresh();

      // Trigger print receipt
      const receipt: ReceiptData = {
        title: 'NOTA PENJUALAN KASIR',
        subtitle: `Metode Pembayaran: ${result.metode}`,
        nomorTransaksi: result.noPenjualan,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra,
        rekening: result.rekeningTujuan,
        kategori: 'PENJUALAN',
        items: result.items.map((i) => ({
          nama: i.namaProduk,
          qty: i.qty,
          satuan: i.satuan,
          harga: i.harga,
          subtotal: i.subtotal,
        })),
        detailRows: [
          { label: 'Metode Pembayaran', value: result.metode },
          { label: 'Rekening Transaksi', value: result.rekeningTujuan },
          {
            label: 'Status Pembayaran',
            value: result.statusPembayaran === 'LUNAS' ? 'LUNAS (UANG MASUK)' : 'BELUM BAYAR (PIUTANG KASBON)',
            highlight: true,
          },
          { label: 'Total Transaksi', value: result.totalNominal, isTotal: true },
        ],
        catatan: result.keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      onSuccess(receipt);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses penjualan');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMitraObj = activeMitras.find((m) => m.id === selectedMitraId);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Kasir Penjualan Toko</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              MODUL 2.A
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Penjualan sarana produksi dengan metode Tunai (KAS01), Transfer Bank, atau Kasbon (Piutang)
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: POS Left (Items) & Right (Cart & Checkout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Selection & Partner */}
        <div className="lg:col-span-7 space-y-4">
          {/* Mitra Selector */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs space-y-3">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
              1. Pilih Pelanggan / Mitra Pembeli <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedMitraId}
              onChange={(e) => setSelectedMitraId(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-600"
            >
              {activeMitras.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama} ({m.kode}) - {m.role} - {m.telepon}
                </option>
              ))}
            </select>
          </div>

          {/* Product Selector with Real-time Stock */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs space-y-3">
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider">
              2. Pilih Produk &amp; Jumlah
            </label>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Daftar Produk Aktif</label>
                <select
                  value={selectedProductCode}
                  onChange={(e) => setSelectedProductCode(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-600"
                >
                  {activeProducts.map((p) => {
                    const st = stokList.find((s) => s.kode === p.kode);
                    return (
                      <option key={p.kode} value={p.kode}>
                        {p.nama} — Harga: {formatRupiah(p.hargaJual)} (Stok: {st?.stok || 0} {p.satuan})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Real-time Stock Indicator Badge */}
              {currentStokInfo && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    currentStokInfo.stok <= currentStokInfo.minimum
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div>
                    <span className="font-semibold">Stok Real-Time Tersedia:</span>{' '}
                    <strong className="text-sm font-mono">{currentStokInfo.stok} {currentStokInfo.satuan}</strong>
                  </div>
                  <div className="text-[11px] text-zinc-600">
                    Harga Satuan: <strong className="text-zinc-900">{formatRupiah(currentProductInfo?.hargaJual)}</strong>
                  </div>
                </div>
              )}

              {/* Qty & Add Button */}
              <div className="flex items-center space-x-3 pt-2">
                <div className="w-32">
                  <label className="block text-[11px] text-zinc-500 mb-1">Jumlah (Qty)</label>
                  <input
                    type="number"
                    min="1"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div className="flex-1 pt-4">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambahkan ke Keranjang</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Cart Table & Payment Method */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden flex flex-col justify-between">
            <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-bold text-zinc-900 uppercase">Keranjang Kasir ({cart.length} Item)</span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] text-rose-600 hover:underline"
                >
                  Kosongkan
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="p-4 divide-y divide-zinc-100 max-h-60 overflow-y-auto text-xs">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">Keranjang masih kosong</div>
              ) : (
                cart.map((item) => (
                  <div key={item.kodeProduk} className="py-2.5 flex items-center justify-between">
                    <div className="pr-2 flex-1">
                      <div className="font-semibold text-zinc-900">{item.nama}</div>
                      <div className="text-[11px] text-zinc-500">
                        {item.qty} {item.satuan} x {formatRupiah(item.harga)}
                      </div>
                    </div>
                    <div className="text-right flex items-center space-x-3">
                      <span className="font-bold text-zinc-900">{formatRupiah(item.subtotal)}</span>
                      <button
                        onClick={() => handleRemoveFromCart(item.kodeProduk)}
                        className="text-zinc-400 hover:text-rose-600 p-1 transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total Summary */}
            <div className="p-4 bg-emerald-50/60 border-t border-emerald-100 space-y-1">
              <div className="flex justify-between items-center text-xs text-zinc-600">
                <span>Subtotal Barang:</span>
                <span>{formatRupiah(totalBelanja)}</span>
              </div>
              <div className="flex justify-between items-center text-base font-bold text-emerald-950 pt-1 border-t border-emerald-200">
                <span>Total Tagihan:</span>
                <span>{formatRupiah(totalBelanja)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="p-4 space-y-3 border-t border-zinc-200 text-xs">
              <label className="block font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
                3. Metode Pembayaran <span className="text-rose-500">*</span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMetode('TUNAI')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all ${
                    metode === 'TUNAI'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  Tunai (KAS01)
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('TRANSFER')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all ${
                    metode === 'TRANSFER'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  Transfer Bank
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('KASBON')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all ${
                    metode === 'KASBON'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-300 hover:bg-zinc-100'
                  }`}
                >
                  Kasbon (Bon)
                </button>
              </div>

              {/* Explanations & Bank selection */}
              {metode === 'TUNAI' && (
                <div className="p-2.5 bg-emerald-50 rounded border border-emerald-200 text-[11px] text-emerald-800">
                  Uang tunai akan otomatis masuk menambah saldo fisik rekening <strong>KAS01 (Kas Utama Kasir)</strong>.
                </div>
              )}

              {metode === 'TRANSFER' && (
                <div className="space-y-1.5 p-2.5 bg-sky-50 rounded border border-sky-200 text-[11px]">
                  <label className="block font-semibold text-sky-900">Pilih Rekening Bank Perusahaan:</label>
                  <select
                    value={rekeningTujuan}
                    onChange={(e) => setRekeningTujuan(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-sky-300 rounded bg-white font-medium"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                  <p className="text-sky-700">Saldo rekening bank yang dipilih akan bertambah secara langsung.</p>
                </div>
              )}

              {metode === 'KASBON' && (
                <div className="p-2.5 bg-amber-50 rounded border border-amber-200 text-[11px] text-amber-900 space-y-1">
                  <div className="font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Penjualan Kasbon (Piutang Customer)</span>
                  </div>
                  <p>
                    Barang keluar dan stok berkurang. Mitra memiliki piutang (status: BELUM BAYAR). Transaksi{' '}
                    <strong>TIDAK dianggap sebagai uang masuk kas</strong>, dan otomatis masuk ke rekening virtual BON01.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] text-zinc-500 mb-1">Catatan Transaksi</label>
                <input
                  type="text"
                  placeholder="Keterangan tambahan nota..."
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-1.5 border border-zinc-300 rounded text-xs"
                />
              </div>

              {/* Submit Trigger */}
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-sm transition-all"
              >
                Simpan &amp; Proses Penjualan ({formatRupiah(totalBelanja)})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200 animate-in fade-in">
            <div className="p-4 bg-emerald-800 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Transaksi Penjualan</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-emerald-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-700">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Pelanggan:</span>
                  <span className="font-bold text-zinc-900">{selectedMitraObj?.nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Metode Pembayaran:</span>
                  <span className="font-bold text-emerald-800">{metode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Tujuan Saldo / Akun:</span>
                  <span className="font-mono font-semibold">
                    {metode === 'TUNAI' ? 'KAS01 (Kas Utama)' : metode === 'TRANSFER' ? rekeningTujuan : 'BON01 (Piutang Customer)'}
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-zinc-200">
                  <span className="text-zinc-500 font-bold">Total Pembayaran:</span>
                  <span className="font-bold text-sm text-zinc-900">{formatRupiah(totalBelanja)}</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 italic">
                Pastikan data pesanan dan metode pembayaran telah sesuai sebelum menyimpan ke sistem. Stok barang akan
                langsung berkurang.
              </p>

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
                  className="px-4 py-1.5 bg-emerald-700 text-white font-bold rounded-md hover:bg-emerald-800 disabled:opacity-50"
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
