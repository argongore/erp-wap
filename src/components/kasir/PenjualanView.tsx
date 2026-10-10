import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Users,
  Handshake,
  Tag,
  DollarSign,
  Package,
  RotateCcw,
  Search,
  Phone,
  MapPin,
  Check,
} from 'lucide-react';
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
  onOpenLabaRugi?: () => void;
}

interface CartItem {
  kodeProduk: string;
  nama: string;
  satuan: string;
  qty: number;
  hargaBeli: number; // HPP Modal
  hargaSugesti: number; // Suggested Price
  harga: number; // Negotiated / Deal Price
  subtotal: number;
  labaKotor: number;
  stokTersedia: number;
}

export const PenjualanView: React.FC<Props> = ({
  produkList,
  stokList,
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
  onOpenLabaRugi,
}) => {
  // Buyer type: 'UMUM' (Pelanggan umum/eceran) or 'REKANAN' (Mitra rekanan bisnis/grosir)
  const [tipePembeli, setTipePembeli] = useState<'UMUM' | 'REKANAN'>('UMUM');
  const [namaPembeliManual, setNamaPembeliManual] = useState<string>('');
  const [pelangganUmumMode, setPelangganUmumMode] = useState<'MANUAL' | 'TERDAFTAR'>('MANUAL');
  const [selectedMitraId, setSelectedMitraId] = useState<string>(mitraList[0]?.id || '');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'KASBON'>('TUNAI');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>('BNI01');
  const [keterangan, setKeterangan] = useState<string>('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(
    produkList[0]?.kode || ''
  );
  const [qtyInput, setQtyInput] = useState<number>(1);

  // Negotiated Price Input (Initial suggestion, but freely editable!)
  const [hargaNegoInput, setHargaNegoInput] = useState<number>(
    produkList[0]?.hargaJual || 0
  );

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );

  const activeProducts = produkList.filter((p) => p.status === 'AKTIF');
  const activeMitras = mitraList.filter((m) => m.status === 'AKTIF');
  const selectedMitraObj = activeMitras.find((m) => m.id === selectedMitraId);

  // Smart suggestion for manual customer name vs registered contacts (Customer / Mitra / Supplier)
  const queryCustomer = namaPembeliManual.trim().toLowerCase();
  const matchingCustomers = queryCustomer.length >= 1
    ? activeMitras.filter(
        (m) =>
          m.nama.toLowerCase().includes(queryCustomer) ||
          m.kode.toLowerCase().includes(queryCustomer) ||
          (m.telepon && m.telepon.includes(queryCustomer))
      )
    : [];

  // Find info for currently selected product
  const currentProduct = activeProducts.find((p) => p.kode === selectedProductCode) || activeProducts[0];
  const currentStok = stokList.find((s) => s.kode === currentProduct?.kode);

  // Suggested price depends on buyer type
  const currentSugestiPrice = currentProduct
    ? tipePembeli === 'REKANAN' && currentProduct.hargaKhususRekanan
      ? currentProduct.hargaKhususRekanan
      : currentProduct.hargaJual
    : 0;

  // Whenever product or buyer type changes, update the suggested price input
  useEffect(() => {
    if (currentProduct) {
      const suggested =
        tipePembeli === 'REKANAN' && currentProduct.hargaKhususRekanan
          ? currentProduct.hargaKhususRekanan
          : currentProduct.hargaJual;
      setHargaNegoInput(suggested);
    }
  }, [selectedProductCode, tipePembeli, currentProduct?.kode]);

  // When switching to REKANAN, ensure a partner is selected
  useEffect(() => {
    if (tipePembeli === 'REKANAN') {
      const partner = activeMitras.find((m) => m.role !== 'CUSTOMER') || activeMitras[0];
      if (partner && (!selectedMitraId || selectedMitraId === mitraList[0]?.id)) {
        setSelectedMitraId(partner.id);
      }
    }
  }, [tipePembeli]);

  const handleResetToSuggestion = () => {
    setHargaNegoInput(currentSugestiPrice);
  };

  const handleAddToCart = () => {
    setErrorMsg('');
    if (!currentProduct) return;
    if (qtyInput <= 0) {
      setErrorMsg('Jumlah qty harus lebih dari 0');
      return;
    }
    if (hargaNegoInput <= 0) {
      setErrorMsg('Harga jual harus lebih dari Rp 0');
      return;
    }

    const stokItem = stokList.find((s) => s.kode === currentProduct.kode);
    const stokTersedia = stokItem?.stok || 0;

    const existingCartItem = cart.find((i) => i.kodeProduk === currentProduct.kode);
    const existingQty = existingCartItem ? existingCartItem.qty : 0;
    const totalRequestedQty = existingQty + qtyInput;

    if (totalRequestedQty > stokTersedia) {
      setErrorMsg(
        `Stok tidak mencukupi untuk "${currentProduct.nama}". Stok tersedia: ${stokTersedia} ${currentProduct.satuan}, diminta: ${totalRequestedQty} ${currentProduct.satuan}`
      );
      return;
    }

    const modalHpp = currentProduct.hargaBeli || 0;
    const subtotal = totalRequestedQty * hargaNegoInput;
    const labaKotor = (hargaNegoInput - modalHpp) * totalRequestedQty;

    if (existingCartItem) {
      setCart(
        cart.map((item) =>
          item.kodeProduk === currentProduct.kode
            ? {
                ...item,
                qty: totalRequestedQty,
                harga: hargaNegoInput,
                subtotal,
                labaKotor,
              }
            : item
        )
      );
    } else {
      setCart([
        ...cart,
        {
          kodeProduk: currentProduct.kode,
          nama: currentProduct.nama,
          satuan: currentProduct.satuan,
          qty: qtyInput,
          hargaBeli: modalHpp,
          hargaSugesti: currentSugestiPrice,
          harga: hargaNegoInput,
          subtotal: qtyInput * hargaNegoInput,
          labaKotor: (hargaNegoInput - modalHpp) * qtyInput,
          stokTersedia,
        },
      ]);
    }

    setQtyInput(1);
  };

  // Inline edit price in cart
  const handleUpdateCartPrice = (kode: string, newPrice: number) => {
    setCart(
      cart.map((item) => {
        if (item.kodeProduk === kode) {
          const price = Math.max(0, newPrice);
          const subtotal = item.qty * price;
          const labaKotor = (price - item.hargaBeli) * item.qty;
          return {
            ...item,
            harga: price,
            subtotal,
            labaKotor,
          };
        }
        return item;
      })
    );
  };

  // Inline edit qty in cart
  const handleUpdateCartQty = (kode: string, newQty: number) => {
    if (newQty <= 0) return;
    setCart(
      cart.map((item) => {
        if (item.kodeProduk === kode) {
          if (newQty > item.stokTersedia) {
            setErrorMsg(`Maksimal stok tersedia untuk ${item.nama}: ${item.stokTersedia} ${item.satuan}`);
            return item;
          }
          const subtotal = newQty * item.harga;
          const labaKotor = (item.harga - item.hargaBeli) * newQty;
          return {
            ...item,
            qty: newQty,
            subtotal,
            labaKotor,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveFromCart = (kode: string) => {
    setCart(cart.filter((item) => item.kodeProduk !== kode));
  };

  // Summary calculations
  const totalOmzet = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const totalModalHpp = cart.reduce((sum, item) => sum + item.hargaBeli * item.qty, 0);
  const totalLabaKotor = totalOmzet - totalModalHpp;
  const persentaseMargin = totalOmzet > 0 ? (totalLabaKotor / totalOmzet) * 100 : 0;

  const finalBuyerName =
    tipePembeli === 'UMUM'
      ? pelangganUmumMode === 'MANUAL'
        ? (namaPembeliManual.trim() || 'Pelanggan Umum')
        : (selectedMitraObj?.nama || 'Pelanggan Umum')
      : (selectedMitraObj?.nama || 'Mitra Rekanan');

  const handleProcessSubmit = async () => {
    if (cart.length === 0) {
      setErrorMsg('Keranjang penjualan masih kosong');
      return;
    }
    if (metode === 'KASBON' && tipePembeli === 'UMUM' && pelangganUmumMode === 'MANUAL') {
      setErrorMsg('Metode KASBON piutang hanya berlaku untuk mitra/karyawan terdaftar');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);

    try {
      const isManualUmum = tipePembeli === 'UMUM' && pelangganUmumMode === 'MANUAL';
      const result: TransaksiPenjualan = await api.processPenjualan({
        idMitra: isManualUmum ? 'UMUM' : selectedMitraId,
        namaPembeliManual: isManualUmum ? finalBuyerName : undefined,
        tipePembeli,
        metode,
        rekeningTujuan: metode === 'TRANSFER' ? rekeningTujuan : undefined,
        items: cart.map((i) => ({
          kodeProduk: i.kodeProduk,
          qty: i.qty,
          harga: i.harga,
          hargaSugesti: i.hargaSugesti,
        })),
        keterangan,
      });

      setShowConfirmModal(false);
      setCart([]);
      setKeterangan('');
      if (isManualUmum) {
        setNamaPembeliManual('');
      }
      onRefresh();

      // Trigger print receipt
      const receipt: ReceiptData = {
        title: 'NOTA PENJUALAN KASIR',
        subtitle: `Tipe: ${result.tipePembeli || tipePembeli} | Pembayaran: ${result.metode}`,
        nomorTransaksi: result.noPenjualan,
        tanggal: result.tanggal,
        jam: result.jam,
        mitra: result.namaMitra || finalBuyerName,
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
          { label: 'Tipe Pelanggan', value: result.tipePembeli || tipePembeli },
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

  const currentModalHpp = currentProduct?.hargaBeli || 0;
  const currentLabaPerUnit = hargaNegoInput - currentModalHpp;
  const isLoss = currentLabaPerUnit < 0;

  return (
    <div className="space-y-6">
      {/* Title & Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-5 rounded-xl border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <ShoppingCart className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-zinc-100">Kasir Penjualan Toko (Harga Nego & Rekanan)</h1>
            <span className="text-xs bg-emerald-950 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-800">
              FLEKSIBEL NEGO
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Input harga bersifat sugesti/rekomendasi (bukan harga mati). Kasir leluasa menegosiasikan harga jual sesuai kesepakatan eceran atau rekanan bisnis, dengan estimasi laba-rugi realtime.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenLabaRugi && (
            <button
              onClick={onOpenLabaRugi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-700/60 rounded-lg text-xs font-semibold transition-colors"
            >
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Cek Analisis Laba-Rugi →</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: POS Left (Items) & Right (Cart & Checkout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Selection & Pricing */}
        <div className="lg:col-span-7 space-y-4">
          {/* Section 1: Tipe Pembeli (Umum vs Rekanan) */}
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>1. Tipe Pembeli &amp; Identitas Pelanggan</span>
              </label>

              {/* Tipe Pembeli Switcher */}
              <div className="flex items-center bg-zinc-800 p-1 rounded-lg border border-zinc-700">
                <button
                  type="button"
                  onClick={() => setTipePembeli('UMUM')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    tipePembeli === 'UMUM'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Pelanggan Umum</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTipePembeli('REKANAN')}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    tipePembeli === 'REKANAN'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Handshake className="w-3.5 h-3.5" />
                  <span>Mitra / Rekanan</span>
                </button>
              </div>
            </div>

            {/* Notification Banner based on buyer type */}
            {tipePembeli === 'REKANAN' ? (
              <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-lg text-xs text-amber-300 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Handshake className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    <strong>Mode Pembeli Rekanan:</strong> Sistem otomatis menyugestikan harga khusus rekanan/grosir untuk setiap item.
                  </span>
                </div>
                <span className="text-[10px] bg-amber-900 text-amber-200 px-2 py-0.5 rounded font-mono">
                  HARGA MITRA
                </span>
              </div>
            ) : (
              <div className="p-2 bg-zinc-800/60 border border-zinc-700/60 rounded-lg text-[11px] text-zinc-400 flex items-center space-x-2">
                <Tag className="w-3.5 h-3.5 text-zinc-500" />
                <span>
                  <strong>Mode Pelanggan Umum:</strong> Sugesti harga default adalah harga eceran toko. Kasir tetap bebas mengubah/nego harga jika ada diskon.
                </span>
              </div>
            )}

            {/* Sub-mode Pelanggan Umum: Manual input vs Terdaftar */}
            {tipePembeli === 'UMUM' ? (
              <div className="space-y-3 p-3 bg-zinc-800/60 rounded-xl border border-zinc-700/80">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    Identitas Pelanggan Umum
                  </span>
                  <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-zinc-700">
                    <button
                      type="button"
                      onClick={() => setPelangganUmumMode('MANUAL')}
                      className={`px-2.5 py-0.5 text-[11px] font-semibold rounded transition-all ${
                        pelangganUmumMode === 'MANUAL'
                          ? 'bg-emerald-700 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Ketik Nama Bebas (Manual)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPelangganUmumMode('TERDAFTAR')}
                      className={`px-2.5 py-0.5 text-[11px] font-semibold rounded transition-all ${
                        pelangganUmumMode === 'TERDAFTAR'
                          ? 'bg-emerald-700 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      Pilih dari Mitra
                    </button>
                  </div>
                </div>

                {pelangganUmumMode === 'MANUAL' ? (
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[11px] text-zinc-300 font-semibold">
                          Nama Pembeli / Pelanggan Umum <span className="text-emerald-400">*</span>
                        </label>
                        <span className="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                          TIDAK MASUK MASTER MITRA
                        </span>
                      </div>
                      <input
                        type="text"
                        value={namaPembeliManual}
                        onChange={(e) => setNamaPembeliManual(e.target.value)}
                        placeholder="Contoh: Bpk. Bambang / Ibu Siti / Warung Barokah (Kosongkan = Pelanggan Umum)"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
                      />
                    </div>

                    {/* Smart Suggestion for Matching Customers / Partners */}
                    {matchingCustomers.length > 0 && (
                      <div className="p-2.5 bg-zinc-900 border border-emerald-500/50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-emerald-400 flex items-center space-x-1">
                            <Search className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Ditemukan {matchingCustomers.length} Rekanan Terdaftar dengan nama serupa:</span>
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">SUGESTI MITRA</span>
                        </div>

                        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                          {matchingCustomers.map((m) => {
                            const roleBadge =
                              m.role === 'CUSTOMER'
                                ? '🛒 Customer'
                                : m.role === 'MITRA_TANI'
                                ? '🌾 Mitra Tani'
                                : m.role === 'SUPPLIER'
                                ? '🏢 Supplier'
                                : '🔄 Mitra';

                            return (
                              <div
                                key={m.id}
                                className="p-2 bg-zinc-800/90 rounded-lg border border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-xs text-zinc-100">{m.nama}</span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded">
                                      {m.kode}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-300 rounded border border-emerald-800">
                                      {roleBadge}
                                    </span>
                                  </div>
                                  {m.telepon && m.telepon !== '-' && (
                                    <div className="text-[10px] text-zinc-400 flex items-center space-x-1">
                                      <Phone className="w-3 h-3 text-zinc-500" />
                                      <span>{m.telepon}</span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center space-x-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTipePembeli('REKANAN');
                                      setSelectedMitraId(m.id);
                                    }}
                                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shadow-2xs flex items-center space-x-1 cursor-pointer transition-colors"
                                    title="Gunakan akun rekanan terdaftar ini (aktifkan harga rekanan & kasbon)"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Gunakan Akun Terdaftar Ini</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setNamaPembeliManual(m.nama);
                                    }}
                                    className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-[11px] font-medium border border-zinc-600 cursor-pointer transition-colors"
                                    title="Gunakan nama ini saja tanpa masuk ke akun rekanan terdaftar"
                                  >
                                    <span>Gunakan Nama Saja (Tetap Umum)</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Unregistered notification badge */}
                    {queryCustomer.length >= 2 && matchingCustomers.length === 0 && (
                      <div className="p-2 bg-emerald-950/50 border border-emerald-800/80 rounded-lg text-[11px] text-emerald-300 flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Nama <strong>"{namaPembeliManual}"</strong> belum terdaftar di database Customer. Transaksi ini akan disimpan sebagai <strong>Pelanggan Umum</strong> tanpa masuk ke daftar Master Mitra.
                        </span>
                      </div>
                    )}

                    <p className="text-[10px] text-zinc-400">
                      💡 Nama pembeli manual ini langsung tercetak pada nota kasir &amp; tercatat pada riwayat penjualan tanpa menambah data ke Master Mitra.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] text-zinc-300">Pilih Akun Mitra / Pelanggan Terdaftar:</label>
                    {activeMitras.length === 0 ? (
                      <p className="text-xs text-amber-400 bg-amber-950/40 p-2 rounded border border-amber-900">
                        Belum ada mitra terdaftar. Gunakan mode "Ketik Nama Bebas (Manual)" di samping.
                      </p>
                    ) : (
                      <select
                        value={selectedMitraId}
                        onChange={(e) => setSelectedMitraId(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                      >
                        {activeMitras.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nama} ({m.kode}) - {m.role}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2 p-3 bg-amber-950/40 rounded-xl border border-amber-900/60">
                <div className="flex items-center justify-between text-xs text-amber-300">
                  <div className="flex items-center space-x-1.5 font-bold">
                    <Handshake className="w-4 h-4 text-amber-400" />
                    <span>Mode Rekanan Grosir (Harga Khusus Mitra)</span>
                  </div>
                </div>
                <label className="block text-[11px] text-zinc-300 font-semibold">
                  Pilih Mitra / Rekanan Terdaftar:
                </label>
                {activeMitras.length === 0 ? (
                  <p className="text-xs text-amber-400 bg-amber-950/60 p-2 rounded border border-amber-900">
                    Belum ada mitra terdaftar di database. Anda dapat beralih ke mode <strong>Pelanggan Umum</strong> atau input di Master Mitra.
                  </p>
                ) : (
                  <select
                    value={selectedMitraId}
                    onChange={(e) => setSelectedMitraId(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  >
                    {activeMitras.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.role === 'KARYAWAN' ? `[KARYAWAN] ${m.nama}` : m.nama} ({m.kode}) - {m.role} - {m.telepon}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Product Picker with Negotiable Price */}
          <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span>2. Pilih Produk &amp; Input Harga Nego</span>
              </label>
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                HARGA HANYA SUGESTI
              </span>
            </div>

            {/* Product selection */}
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Daftar Produk Toko &amp; Beras</label>
              <select
                value={selectedProductCode}
                onChange={(e) => setSelectedProductCode(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-100 focus:outline-hidden focus:border-emerald-500 font-medium"
              >
                {activeProducts.map((p) => {
                  const st = stokList.find((s) => s.kode === p.kode);
                  return (
                    <option key={p.kode} value={p.kode}>
                      [{p.kategori}] {p.nama} — Stok: {st?.stok || 0} {p.satuan} | Sugesti: {formatRupiah(p.hargaJual)}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Real-time Stock & Cost Information Card */}
            {currentProduct && (
              <div className="bg-zinc-800/80 border border-zinc-700/80 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500 text-[10px] block">Stok Tersedia</span>
                  <span className={`font-bold font-mono ${currentStok && currentStok.stok <= 10 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {currentStok?.stok || 0} {currentProduct.satuan}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Modal HPP</span>
                  <span className="font-semibold text-zinc-300 font-mono">
                    {formatRupiah(currentProduct.hargaBeli)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Sugesti Eceran</span>
                  <span className="font-semibold text-zinc-300 font-mono">
                    {formatRupiah(currentProduct.hargaJual)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[10px] block">Sugesti Rekanan</span>
                  <span className="font-semibold text-amber-400 font-mono">
                    {formatRupiah(currentProduct.hargaKhususRekanan || currentProduct.hargaJual)}
                  </span>
                </div>
              </div>
            )}

            {/* Pricing & Negotiation Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              {/* Qty Input (4 cols) */}
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Qty ({currentProduct?.satuan})
                </label>
                <input
                  type="number"
                  min="1"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Editable Suggested / Negotiated Price (8 cols) */}
              <div className="sm:col-span-8">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-zinc-200 flex items-center space-x-1.5">
                    <span>Harga Deal / Nego Satuan</span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      (Sugesti: {formatRupiah(currentSugestiPrice)})
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={handleResetToSuggestion}
                    className="text-[10px] text-emerald-400 hover:underline flex items-center space-x-1"
                    title="Kembalikan ke harga sugesti rekomendasi"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Sugesti</span>
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={hargaNegoInput}
                    onChange={(e) => setHargaNegoInput(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-amber-600/80 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Realtime Profit/Loss Margin Indicator for this item */}
            <div className="pt-1">
              {isLoss ? (
                <div className="p-2 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>
                      <strong>Peringatan Rugi:</strong> Harga nego di bawah modal HPP ({formatRupiah(currentModalHpp)})!
                    </span>
                  </div>
                  <span className="font-mono font-bold text-rose-400">
                    Rugi: {formatRupiah(currentLabaPerUnit)} / {currentProduct?.satuan}
                  </span>
                </div>
              ) : (
                <div className="p-2 bg-emerald-950/60 border border-emerald-800/80 rounded-lg text-emerald-300 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      <strong>Estimasi Laba Kotor:</strong> Modal HPP {formatRupiah(currentModalHpp)} → Jual {formatRupiah(hargaNegoInput)}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400">
                    +{formatRupiah(currentLabaPerUnit)} / {currentProduct?.satuan} (
                    {hargaNegoInput > 0 ? Math.round((currentLabaPerUnit / hargaNegoInput) * 100) : 0}%)
                  </span>
                </div>
              )}
            </div>

            {/* Subtotal & Add Button */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <div>
                <span className="text-xs text-zinc-400">Subtotal Item:</span>
                <span className="ml-2 text-base font-bold text-zinc-100 font-mono">
                  {formatRupiah(qtyInput * hargaNegoInput)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>+ Masukkan Keranjang</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Cart Table & Payment Method */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden flex flex-col justify-between">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-800/60">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-zinc-100 uppercase tracking-wider">
                  Keranjang Penjualan ({cart.length} Item)
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] text-rose-400 hover:underline"
                >
                  Kosongkan
                </button>
              )}
            </div>

            {/* Cart Items List with Inline Nego Price Edit */}
            <div className="p-3 divide-y divide-zinc-800 max-h-72 overflow-y-auto text-xs space-y-2">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-zinc-500">Keranjang kasir masih kosong</div>
              ) : (
                cart.map((item) => {
                  const itemProfit = (item.harga - item.hargaBeli) * item.qty;
                  const itemIsLoss = itemProfit < 0;

                  return (
                    <div key={item.kodeProduk} className="pt-2 first:pt-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-zinc-200 truncate">{item.nama}</div>
                          <div className="text-[10px] text-zinc-400 flex items-center space-x-2 mt-0.5">
                            <span>HPP: {formatRupiah(item.hargaBeli)}</span>
                            <span>•</span>
                            <span>Sugesti: {formatRupiah(item.hargaSugesti)}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveFromCart(item.kodeProduk)}
                          className="text-zinc-500 hover:text-rose-400 p-1 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Inline Qty and Negotiated Price adjustments */}
                      <div className="flex items-center justify-between gap-2 bg-zinc-800/80 p-2 rounded-lg text-[11px]">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-zinc-400 text-[10px]">Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) =>
                              handleUpdateCartQty(item.kodeProduk, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-100 font-mono text-center"
                          />
                          <span className="text-zinc-400 text-[10px]">{item.satuan}</span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <span className="text-zinc-400 text-[10px]">Harga Nego:</span>
                          <div className="relative">
                            <span className="absolute left-1.5 top-0.5 text-[10px] text-zinc-500 font-mono">Rp</span>
                            <input
                              type="number"
                              min="0"
                              step="500"
                              value={item.harga}
                              onChange={(e) =>
                                handleUpdateCartPrice(item.kodeProduk, Number(e.target.value))
                              }
                              className="w-24 bg-zinc-900 border border-amber-600/60 rounded pl-6 pr-1.5 py-0.5 text-xs text-amber-300 font-mono text-right font-semibold"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Item Subtotal & Profit Indicator */}
                      <div className="flex items-center justify-between text-[11px] px-1 font-mono">
                        <span className={itemIsLoss ? 'text-rose-400' : 'text-emerald-400 font-medium'}>
                          {itemIsLoss ? '🔴 Rugi: ' : '🟢 Laba: '}
                          {formatRupiah(itemProfit)}
                        </span>
                        <span className="font-bold text-zinc-100">
                          Subtotal: {formatRupiah(item.subtotal)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Total Summary with Profit/Loss Preview */}
            <div className="p-4 bg-zinc-800/80 border-t border-zinc-700/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-zinc-400">
                <span>Total Omzet Penjualan:</span>
                <span className="font-mono text-zinc-200 font-semibold">{formatRupiah(totalOmzet)}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400">
                <span>Total Modal HPP Barang:</span>
                <span className="font-mono text-zinc-400">{formatRupiah(totalModalHpp)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-zinc-700">
                <span className="font-semibold text-zinc-300 flex items-center space-x-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Estimasi Laba Kotor Transaksi:</span>
                </span>
                <span
                  className={`font-mono font-bold ${
                    totalLabaKotor >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {totalLabaKotor >= 0 ? '+' : ''}
                  {formatRupiah(totalLabaKotor)} ({Math.round(persentaseMargin)}%)
                </span>
              </div>
              <div className="flex justify-between items-center text-base font-bold text-zinc-100 pt-1.5 border-t border-zinc-700">
                <span>Total Tagihan:</span>
                <span className="text-amber-400 font-mono text-lg">{formatRupiah(totalOmzet)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="p-4 space-y-3 border-t border-zinc-800 text-xs">
              <label className="block font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                3. Metode Pembayaran <span className="text-rose-400">*</span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMetode('TUNAI')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all ${
                    metode === 'TUNAI'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
                  }`}
                >
                  Tunai (KAS01)
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('TRANSFER')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all ${
                    metode === 'TRANSFER'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
                  }`}
                >
                  Transfer Bank
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('KASBON')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all ${
                    metode === 'KASBON'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
                  }`}
                >
                  Kasbon (Bon)
                </button>
              </div>

              {metode === 'TRANSFER' && (
                <div className="space-y-1.5 p-2.5 bg-zinc-800 rounded-lg border border-zinc-700 text-[11px]">
                  <label className="block font-semibold text-zinc-300">Pilih Rekening Bank Perusahaan:</label>
                  <select
                    value={rekeningTujuan}
                    onChange={(e) => setRekeningTujuan(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-zinc-700 rounded-md bg-zinc-900 text-zinc-200 font-medium"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) — Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {metode === 'KASBON' && (
                <div className="p-2.5 bg-amber-950/60 rounded-lg border border-amber-800/80 text-[11px] text-amber-300 space-y-1">
                  <div className="font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Penjualan Kasbon (Piutang Customer/Karyawan)</span>
                  </div>
                  <p>
                    Barang keluar dan stok berkurang. Mitra memiliki kewajiban piutang kasbon barang (BON01).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Catatan Nota / Transaksi</label>
                <input
                  type="text"
                  placeholder="Keterangan tambahan nota, kesepakatan nego..."
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setShowConfirmModal(true)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Transaksi ({formatRupiah(totalOmzet)})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal with Profit Preview */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-800">
            <div className="p-4 bg-emerald-700 text-white font-bold text-sm flex justify-between items-center">
              <span>Konfirmasi Penjualan Kasir</span>
              <button onClick={() => setShowConfirmModal(false)} className="text-emerald-200 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-300">
              <div className="p-3 bg-zinc-800/80 rounded-lg border border-zinc-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Tipe Pembeli:</span>
                  <span className="font-bold text-amber-400">{tipePembeli}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Pelanggan / Mitra:</span>
                  <span className="font-bold text-zinc-100">{finalBuyerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Metode Bayar:</span>
                  <span className="font-bold text-emerald-400">{metode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total Modal HPP:</span>
                  <span className="font-mono text-zinc-300">{formatRupiah(totalModalHpp)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Estimasi Laba Kotor:</span>
                  <span className={`font-mono font-bold ${totalLabaKotor >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {totalLabaKotor >= 0 ? '+' : ''}
                    {formatRupiah(totalLabaKotor)} ({Math.round(persentaseMargin)}%)
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-zinc-700">
                  <span className="text-zinc-300 font-bold">Total Nilai Penjualan:</span>
                  <span className="font-bold text-sm text-amber-400 font-mono">{formatRupiah(totalOmzet)}</span>
                </div>
              </div>

              <p className="text-[11px] text-zinc-400">
                Stok barang akan otomatis berkurang secara realtime. Data laba-rugi transaksi ini langsung tercatat di laporan.
              </p>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 rounded-md font-medium"
                >
                  Batal / Cek Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleProcessSubmit}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Memproses...' : 'Ya, Simpan Transaksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
