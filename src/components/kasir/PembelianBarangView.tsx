import React, { useState } from 'react';
import {
  PackagePlus,
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Truck,
  Building2,
  DollarSign,
  TrendingUp,
  Receipt,
  Search,
  Eye,
  Calendar,
  Sparkles,
  ArrowRight,
  UserPlus,
  X,
  Phone,
  MapPin,
  Check,
} from 'lucide-react';
import { Mitra, Produk, Rekening, StokBarang, TransaksiPembelianBarang } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';

interface Props {
  produkList: Produk[];
  stokList: StokBarang[];
  mitraList: Mitra[];
  rekeningList: Rekening[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
  onOpenLabaRugi?: () => void;
}

interface CartKulakanItem {
  kodeProduk: string;
  nama: string;
  satuan: string;
  qty: number;
  hargaBeliSatuan: number;
  subtotal: number;
  sesuaikanHargaJual: number;
  sesuaikanHargaRekanan: number;
  stokSaatIni: number;
}

export const PembelianBarangView: React.FC<Props> = ({
  produkList,
  stokList,
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
  onOpenLabaRugi,
}) => {
  // Suppliers list (Role SUPPLIER or ALL)
  const supplierList = mitraList.filter(
    (m) => (m.role === 'SUPPLIER' || m.role === 'ALL') && m.status === 'AKTIF'
  );

  // Mode Distributor: Registered partner or Manual text for non-fixed distributor
  const [distributorMode, setDistributorMode] = useState<'TERDAFTAR' | 'MANUAL'>('TERDAFTAR');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    supplierList[0]?.id || mitraList[0]?.id || ''
  );
  const [manualDistributorNama, setManualDistributorNama] = useState<string>('');

  // Smart suggestion for manual distributor/supplier vs registered contacts
  const queryDistributor = manualDistributorNama.trim().toLowerCase();
  const matchingDistributors = queryDistributor.length >= 1
    ? mitraList.filter(
        (m) =>
          m.status === 'AKTIF' &&
          (m.nama.toLowerCase().includes(queryDistributor) ||
            m.kode.toLowerCase().includes(queryDistributor) ||
            (m.telepon && m.telepon.includes(queryDistributor)))
      )
    : [];
  const [noFakturSupplier, setNoFakturSupplier] = useState<string>('');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'HUTANG'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>('KAS01');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoNota, setFotoNota] = useState<string>('');

  // Mode Input: Rekapan Cepat (Untuk >150 supplier tanpa input ulang produk satu-satu) vs Rincian Barang Satuan
  const [entryMode, setEntryMode] = useState<'REKAPAN' | 'RINCIAN'>('REKAPAN');
  const [judulRekapan, setJudulRekapan] = useState<string>('Rekap Nota Pembelian Supplier');
  const [totalNominalRekapan, setTotalNominalRekapan] = useState<number>(1500000);
  const [previewFotoNotaModal, setPreviewFotoNotaModal] = useState<string | null>(null);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState<string>('');

  // Cart Kulakan State
  const [cart, setCart] = useState<CartKulakanItem[]>([]);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(
    produkList[0]?.kode || ''
  );
  const [qtyInput, setQtyInput] = useState<number>(10);
  const [hargaBeliInput, setHargaBeliInput] = useState<number>(
    produkList[0]?.hargaBeli || 0
  );
  const [hargaJualBaru, setHargaJualBaru] = useState<number>(
    produkList[0]?.hargaJual || 0
  );
  const [hargaRekananBaru, setHargaRekananBaru] = useState<number>(
    produkList[0]?.hargaKhususRekanan || produkList[0]?.hargaJual || 0
  );

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState('');

  // Quick Add Supplier Modal State
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [newSupplierNama, setNewSupplierNama] = useState('');
  const [newSupplierTelepon, setNewSupplierTelepon] = useState('');
  const [newSupplierAlamat, setNewSupplierAlamat] = useState('');
  const [newSupplierCatatan, setNewSupplierCatatan] = useState('');
  const [submittingSupplier, setSubmittingSupplier] = useState(false);

  // Quick Add Product Modal State
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProdKode, setNewProdKode] = useState('');
  const [newProdNama, setNewProdNama] = useState('');
  const [newProdKategori, setNewProdKategori] = useState('PUPUK & SAPROTAN');
  const [newProdSatuan, setNewProdSatuan] = useState('Sak');
  const [newProdHargaBeli, setNewProdHargaBeli] = useState<number>(100000);
  const [newProdHargaJual, setNewProdHargaJual] = useState<number>(120000);
  const [newProdHargaRekanan, setNewProdHargaRekanan] = useState<number>(115000);
  const [newProdQtyKulakan, setNewProdQtyKulakan] = useState<number>(10);
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Purchase History State
  const [historyPembelian, setHistoryPembelian] = useState<TransaksiPembelianBarang[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<TransaksiPembelianBarang | null>(null);

  // Active products & stock
  const activeProducts = produkList.filter((p) => p.status === 'AKTIF');
  const availableBanks = rekeningList.filter(
    (r) => !r.isVirtual && r.kode !== 'KAS01' && r.status === 'AKTIF'
  );

  const kasAccount = rekeningList.find((r) => r.kode === 'KAS01');

  // Auto select product when list changes
  React.useEffect(() => {
    if ((!selectedProductCode || !activeProducts.some((p) => p.kode === selectedProductCode)) && activeProducts.length > 0) {
      handleProductSelect(activeProducts[0].kode);
    }
  }, [produkList]);

  // Auto select supplier when list changes
  React.useEffect(() => {
    if ((!selectedSupplierId || !supplierList.some((s) => s.id === selectedSupplierId)) && supplierList.length > 0) {
      setSelectedSupplierId(supplierList[0].id);
    }
  }, [mitraList]);

  // Quick Add Supplier Handler
  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierNama.trim()) return;
    setSubmittingSupplier(true);
    setErrorMsg('');
    try {
      const created = await api.createMitra({
        nama: newSupplierNama.trim(),
        role: 'SUPPLIER',
        telepon: newSupplierTelepon.trim() || '-',
        alamat: newSupplierAlamat.trim() || 'Distributor Saprotan Toko',
        catatan: newSupplierCatatan.trim(),
      });
      setShowAddSupplierModal(false);
      setNewSupplierNama('');
      setNewSupplierTelepon('');
      setNewSupplierAlamat('');
      setNewSupplierCatatan('');
      setDistributorMode('TERDAFTAR');
      setSelectedSupplierId(created.id);
      setSuccessInfo(`Distributor "${created.nama}" berhasil ditambahkan & dipilih!`);
      setTimeout(() => setSuccessInfo(''), 5000);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambah supplier baru');
    } finally {
      setSubmittingSupplier(false);
    }
  };

  // Quick Add Product Handler
  const handleQuickAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdNama.trim()) return;
    setSubmittingProduct(true);
    setErrorMsg('');
    try {
      const cleanKode = newProdKode.trim().toUpperCase() || `PRD-${Date.now().toString().slice(-4)}`;
      const created = await api.createProduk({
        kode: cleanKode,
        nama: newProdNama.trim(),
        kategori: newProdKategori,
        satuan: newProdSatuan,
        hargaBeli: Math.max(0, newProdHargaBeli),
        hargaJual: Math.max(0, newProdHargaJual),
        hargaKhususRekanan: Math.max(0, newProdHargaRekanan),
        stokAwal: 0,
        status: 'AKTIF',
      });

      // If user specified an initial kulakan qty, directly put into Cart!
      if (newProdQtyKulakan > 0) {
        setCart((prev) => [
          ...prev,
          {
            kodeProduk: created.kode,
            nama: created.nama,
            satuan: created.satuan,
            qty: newProdQtyKulakan,
            hargaBeliSatuan: created.hargaBeli,
            subtotal: newProdQtyKulakan * created.hargaBeli,
            sesuaikanHargaJual: created.hargaJual,
            sesuaikanHargaRekanan: created.hargaKhususRekanan || created.hargaJual,
            stokSaatIni: 0,
          },
        ]);
        setSuccessInfo(`Produk "${created.nama}" berhasil dibuat dan dimasukkan ke keranjang pembelian (${newProdQtyKulakan} ${created.satuan})!`);
      } else {
        setSuccessInfo(`Produk "${created.nama}" berhasil dibuat & siap dibeli!`);
      }
      setTimeout(() => setSuccessInfo(''), 5000);

      setShowAddProductModal(false);
      setNewProdKode('');
      setNewProdNama('');
      setNewProdHargaBeli(100000);
      setNewProdHargaJual(120000);
      setNewProdHargaRekanan(115000);
      setNewProdQtyKulakan(10);
      setSelectedProductCode(created.kode);
      setHargaBeliInput(created.hargaBeli);
      setHargaJualBaru(created.hargaJual);
      setHargaRekananBaru(created.hargaKhususRekanan || created.hargaJual);
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mendaftarkan produk baru');
    } finally {
      setSubmittingProduct(false);
    }
  };

  // Load history on mount
  React.useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getPembelianBarang();
      setHistoryPembelian(data);
    } catch (err) {
      console.error('Error loading history pembelian:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // When selected product changes, prefill purchase price and selling price
  const handleProductSelect = (code: string) => {
    setSelectedProductCode(code);
    const prod = produkList.find((p) => p.kode === code);
    if (prod) {
      setHargaBeliInput(prod.hargaBeli || 0);
      setHargaJualBaru(prod.hargaJual || 0);
      setHargaRekananBaru(prod.hargaKhususRekanan || prod.hargaJual || 0);
    }
  };

  const handleAddToCart = () => {
    setErrorMsg('');
    if (!selectedProductCode) {
      setErrorMsg('Pilih produk yang ingin dibeli/dikulak');
      return;
    }
    if (qtyInput <= 0) {
      setErrorMsg('Jumlah kuantiti harus lebih dari 0');
      return;
    }
    if (hargaBeliInput <= 0) {
      setErrorMsg('Harga beli satuan kulakan harus lebih dari Rp 0');
      return;
    }

    const prod = activeProducts.find((p) => p.kode === selectedProductCode);
    const stokItem = stokList.find((s) => s.kode === selectedProductCode);

    if (!prod) {
      setErrorMsg('Data produk tidak ditemukan');
      return;
    }

    const stokSaatIni = stokItem?.stok || 0;
    const existingIndex = cart.findIndex((i) => i.kodeProduk === selectedProductCode);

    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].qty + qtyInput;
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty: newQty,
        hargaBeliSatuan: hargaBeliInput,
        subtotal: newQty * hargaBeliInput,
        sesuaikanHargaJual: hargaJualBaru,
        sesuaikanHargaRekanan: hargaRekananBaru,
      };
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          kodeProduk: prod.kode,
          nama: prod.nama,
          satuan: prod.satuan,
          qty: qtyInput,
          hargaBeliSatuan: hargaBeliInput,
          subtotal: qtyInput * hargaBeliInput,
          sesuaikanHargaJual: hargaJualBaru,
          sesuaikanHargaRekanan: hargaRekananBaru,
          stokSaatIni,
        },
      ]);
    }

    // Reset qty
    setQtyInput(10);
  };

  const handleRemoveFromCart = (code: string) => {
    setCart(cart.filter((item) => item.kodeProduk !== code));
  };

  const totalBelanjaKulakan = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleProcessSubmit = async () => {
    if (entryMode === 'RINCIAN' && cart.length === 0) {
      setErrorMsg('Keranjang pembelian barang distributor masih kosong. Masukkan minimal 1 barang atau gunakan Mode Rekapan Nota.');
      return;
    }
    if (entryMode === 'REKAPAN' && (Number(totalNominalRekapan) || 0) <= 0) {
      setErrorMsg('Total nominal pembelian nota rekapan harus lebih dari Rp 0');
      return;
    }

    let supplierNameDisplay = '';
    if (distributorMode === 'MANUAL') {
      if (!manualDistributorNama || !manualDistributorNama.trim()) {
        setErrorMsg('Nama distributor / pemasok manual wajib diisi');
        return;
      }
      supplierNameDisplay = manualDistributorNama.trim();
    } else {
      if (!selectedSupplierId) {
        setErrorMsg('Pilih supplier / distributor pemasok barang');
        return;
      }
      const sObj = mitraList.find((m) => m.id === selectedSupplierId);
      supplierNameDisplay = sObj?.nama || 'Distributor Terdaftar';
    }

    setErrorMsg('');
    setSubmitting(true);

    try {
      const isRekap = entryMode === 'REKAPAN';
      const record = await api.processPembelianBarang({
        idMitra: distributorMode === 'TERDAFTAR' ? selectedSupplierId : undefined,
        namaDistributorManual: distributorMode === 'MANUAL' ? manualDistributorNama.trim() : undefined,
        noFakturSupplier,
        metodePembayaran: metode,
        rekeningSumber: metode === 'TRANSFER' ? rekeningSumber : undefined,
        fotoNota: fotoNota || undefined,
        isRekapanGlobal: isRekap,
        judulRekapan: isRekap ? (judulRekapan.trim() || `Rekapan Nota Pembelian Supplier (${supplierNameDisplay})`) : undefined,
        totalNominalRekapan: isRekap ? totalNominalRekapan : undefined,
        items: !isRekap ? cart.map((i) => ({
          kodeProduk: i.kodeProduk,
          qty: i.qty,
          hargaBeliSatuan: i.hargaBeliSatuan,
          sesuaikanHargaJual: i.sesuaikanHargaJual,
          sesuaikanHargaRekanan: i.sesuaikanHargaRekanan,
        })) : undefined,
        keterangan: keterangan || (isRekap
          ? `Rekapan Nota Pembelian dari Distributor ${supplierNameDisplay}`
          : `Pembelian stok barang dari distributor ${supplierNameDisplay} (${cart.length} item)`),
      });

      // Prepare receipt data
      const receipt: ReceiptData = {
        title: isRekap ? 'NOTA REKAPAN PEMBELIAN SUPPLIER' : 'NOTA PEMBELIAN DARI DISTRIBUTOR / PEMASOK',
        subtitle: `Distributor: ${record.namaMitra} | Faktur: ${record.noFakturSupplier || '-'}`,
        nomorTransaksi: record.noPembelian,
        tanggal: record.tanggal,
        jam: record.jam,
        mitra: record.namaMitra,
        rekening: record.rekeningSumber,
        kategori: 'PEMBELIAN_BARANG',
        fotoNota: record.fotoNota || fotoNota,
        items: record.items.map((it) => ({
          nama: it.namaProduk,
          qty: it.qty,
          satuan: it.satuan,
          harga: it.hargaBeliSatuan,
          subtotal: it.subtotal,
        })),
        detailRows: [
          { label: 'Distributor / Pemasok', value: `${record.namaMitra} ${distributorMode === 'MANUAL' ? '(Non-Tetap)' : '(Terdaftar)'}` },
          { label: 'No Faktur / Surat Jalan', value: record.noFakturSupplier || '-' },
          { label: 'Tipe Input', value: isRekap ? '📑 Rekapan Nota Global (Bukti Fisik)' : '📦 Rincian Satuan Produk' },
          { label: 'Lampiran Foto Fisik', value: record.fotoNota || fotoNota ? '✅ Tersimpan di Sistem' : 'Tidak Ada' },
          { label: 'Metode Pembayaran', value: record.metodePembayaran },
          { label: 'Rekening Sumber', value: record.rekeningSumber || '-' },
          { label: 'Status Pembayaran', value: record.status, highlight: true },
          { label: 'Total Pembelian', value: record.totalNominal, isTotal: true },
        ],
        catatan: `Faktur: ${record.noFakturSupplier || '-'} | ${record.keterangan || ''}`,
        kasir: 'Pengadaan Wijaya Agro',
      };

      setCart([]);
      setManualDistributorNama('');
      setNoFakturSupplier('');
      setKeterangan('');
      setFotoNota('');
      setShowConfirmModal(false);
      onSuccess(receipt);
      loadHistory();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses transaksi pembelian barang');
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const currentProduct = activeProducts.find((p) => p.kode === selectedProductCode);
  const currentStok = stokList.find((s) => s.kode === selectedProductCode);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-5 rounded-xl border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <PackagePlus className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-zinc-100">Pembelian Barang dari Distributor &amp; Pemasok</h1>
            <span className="text-xs bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
              DISTRIBUTOR &amp; PEMASOK
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Catat penerimaan dan pembelian stok barang dagang (Beras, Sembako, Pupuk, Pakan) dari Distributor &amp; Pemasok (baik mitra terdaftar maupun distributor bebas/tidak tetap). Otomatis menambah stok dan mencatat modal HPP.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenLabaRugi && (
            <button
              onClick={onOpenLabaRugi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
            >
              <TrendingUp className="w-4 h-4 text-emerald-300" />
              <span>Lihat Laba-Rugi Penjualan →</span>
            </button>
          )}
        </div>
      </div>

      {successInfo && (
        <div className="p-3 bg-emerald-950/80 border border-emerald-500 rounded-xl text-xs text-emerald-200 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successInfo}</span>
          </div>
          <button onClick={() => setSuccessInfo('')} className="text-emerald-400 hover:text-white text-xs cursor-pointer">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-950/80 border border-rose-500 rounded-xl text-xs text-rose-200 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-semibold">{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-rose-400 hover:text-white text-xs cursor-pointer">✕</button>
        </div>
      )}

      {/* Main Grid: Purchase Form (Left) & Cart / Summary (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 space-y-5">
          {/* Supplier & Payment Header */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center space-x-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>1. Data Distributor Pemasok &amp; Pembayaran</span>
              </h2>

              {/* Mode Selector Toggle: Terdaftar vs Manual */}
              <div className="flex items-center bg-zinc-800 p-0.5 rounded-lg border border-zinc-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDistributorMode('TERDAFTAR')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    distributorMode === 'TERDAFTAR'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Mitra Terdaftar ({supplierList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDistributorMode('MANUAL')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    distributorMode === 'MANUAL'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Input Manual (Bebas)
                </button>
              </div>
            </div>

            {/* Entry Mode Switcher: Rekapan Cepat (Untuk >150 Supplier) vs Rincian Satuan */}
            <div className="bg-zinc-800/90 p-3 rounded-xl border border-amber-500/40 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Pilih Mode Input Pembelian:</span>
                </span>
                <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-lg border border-zinc-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setEntryMode('REKAPAN')}
                    className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      entryMode === 'REKAPAN'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    📑 Mode Rekapan Nota (Dengan Foto Bukti)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMode('RINCIAN')}
                    className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      entryMode === 'RINCIAN'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    📦 Mode Rincian Produk Satuan
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-300">
                {entryMode === 'REKAPAN'
                  ? '⚡ Solusi Cepat untuk 150+ Mitra Supplier! Cukup lampirkan foto nota fisik & total nilai rekapan tanpa perlu input ulang produk satu per satu.'
                  : 'Gunakan mode ini jika Anda ingin menginput kuantitas per produk secara rinci untuk menambah stok fisik gudang & update HPP.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Distributor Input based on mode */}
              {distributorMode === 'TERDAFTAR' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-zinc-300">
                      Pilih Distributor / Supplier <span className="text-rose-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowAddSupplierModal(true)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Buat Supplier Baru</span>
                    </button>
                  </div>

                  {/* Supplier search box for 150+ partners */}
                  <div className="relative mb-1.5">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Ketik cari nama / kode supplier (150+ mitra)..."
                      value={supplierSearchQuery}
                      onChange={(e) => setSupplierSearchQuery(e.target.value)}
                      className="w-full bg-zinc-800/90 border border-zinc-700 rounded-md pl-8 pr-2 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <select
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500 font-medium"
                  >
                    {supplierList
                      .filter((sup) =>
                        !supplierSearchQuery.trim() ||
                        sup.nama.toLowerCase().includes(supplierSearchQuery.toLowerCase()) ||
                        sup.kode.toLowerCase().includes(supplierSearchQuery.toLowerCase()) ||
                        (sup.alamat && sup.alamat.toLowerCase().includes(supplierSearchQuery.toLowerCase()))
                      )
                      .map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.nama} ({sup.kode}) - {sup.catatan || sup.alamat}
                        </option>
                      ))}
                    {supplierList.length === 0 &&
                      mitraList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nama} ({m.role})
                        </option>
                      ))}
                  </select>
                  {supplierList.length === 0 && (
                    <p className="text-[11px] text-amber-400 mt-1">
                      Belum ada supplier/distributor. Klik "+ Buat Supplier Baru" atau pilih "Input Manual (Bebas)".
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-amber-300">
                        Nama Distributor / Pemasok Manual <span className="text-rose-400">*</span>
                      </label>
                      <span className="text-[10px] text-amber-400 font-medium">Bisa ganti-ganti (Lepas)</span>
                    </div>
                    <input
                      type="text"
                      value={manualDistributorNama}
                      onChange={(e) => setManualDistributorNama(e.target.value)}
                      placeholder="Contoh: UD Padi Rejeki, H. Rusdi Demak, CV Beras Makmur..."
                      className="w-full bg-zinc-800 border border-amber-500/80 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-400 placeholder:text-zinc-500 font-medium"
                    />
                  </div>

                  {/* Smart Suggestions for Matching Registered Partners */}
                  {matchingDistributors.length > 0 && (
                    <div className="p-2.5 bg-zinc-900 border border-amber-500/60 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-amber-300 flex items-center space-x-1">
                          <Search className="w-3.5 h-3.5 text-amber-400" />
                          <span>Ditemukan {matchingDistributors.length} Supplier / Mitra Terdaftar:</span>
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">SUGESTI MITRA</span>
                      </div>

                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {matchingDistributors.map((m) => (
                          <div
                            key={m.id}
                            className="p-2 bg-zinc-800 rounded-lg border border-zinc-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-xs text-zinc-100">{m.nama}</span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-900 text-zinc-400 rounded">
                                  {m.kode}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.2 bg-amber-950 text-amber-300 rounded border border-amber-800">
                                  {m.role}
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
                                  setDistributorMode('TERDAFTAR');
                                  setSelectedSupplierId(m.id);
                                }}
                                className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[11px] font-bold shadow-2xs flex items-center space-x-1 cursor-pointer transition-colors"
                              >
                                <Check className="w-3 h-3" />
                                <span>Pilih Distributor Terdaftar Ini</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setManualDistributorNama(m.nama);
                                }}
                                className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded text-[11px] font-medium border border-zinc-600 cursor-pointer transition-colors"
                              >
                                <span>Gunakan Nama Saja (Tetap Manual)</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unregistered notification badge */}
                  {queryDistributor.length >= 2 && matchingDistributors.length === 0 && (
                    <div className="p-2 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-[11px] text-emerald-300 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Nama <strong>"{manualDistributorNama}"</strong> belum terdaftar sebagai Supplier. Transaksi dicatat sebagai distributor lepas/manual tanpa menambah data Master Mitra.
                      </span>
                    </div>
                  )}

                  <span className="block text-[10px] text-zinc-400 mt-1">
                    💡 Ketik bebas nama distributor/pemasok lepas tanpa harus daftar mitra.
                  </span>
                </div>
              )}

              {/* No Faktur Supplier */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  No. Faktur / Surat Jalan / Nota Distributor
                </label>
                <input
                  type="text"
                  value={noFakturSupplier}
                  onChange={(e) => setNoFakturSupplier(e.target.value)}
                  placeholder="Contoh: INV-LPN-8910 / SJ-2026/09"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                />
              </div>

              {/* Insert Image Nota / Faktur */}
              <div className="sm:col-span-2 pt-1 border-t border-zinc-800">
                <ImageUploadZone
                  label="Sisipkan / Upload Foto Nota Fisik Asli (Faktur Distributor)"
                  sublabel="Foto struk, surat jalan, atau nota tagihan fisik dari supplier (agar tersimpan otomatis di rekapan tanpa harus input manual ulang)"
                  value={fotoNota}
                  onChange={setFotoNota}
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="block text-xs font-medium text-zinc-300 mb-2">
                Metode Pembayaran Kulakan
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMetode('TUNAI')}
                  className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold ${
                    metode === 'TUNAI'
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <div className="font-bold">Tunai (Kas Toko)</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">
                    Saldo: {formatRupiah(kasAccount?.saldoSaatIni || 0)}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('TRANSFER')}
                  className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold ${
                    metode === 'TRANSFER'
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <div className="font-bold">Transfer Bank</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Potong Rekening Bank</div>
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('HUTANG')}
                  className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold ${
                    metode === 'HUTANG'
                      ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  <div className="font-bold">Hutang Usaha</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Tempo ke Supplier</div>
                </button>
              </div>

              {metode === 'TRANSFER' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Pilih Rekening Bank Sumber Dana
                  </label>
                  <select
                    value={rekeningSumber}
                    onChange={(e) => setRekeningSumber(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode}) - Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Product Picker & Item Input */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-emerald-400" />
                <span>2. Tambah Barang yang Dikulak</span>
              </div>
              <span className="text-[11px] text-zinc-400 font-normal">
                Stok otomatis bertambah setelah disimpan
              </span>
            </h2>

            {/* Product selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Pilih Produk Dagang
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(true)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center space-x-1 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Tambah Produk Baru</span>
                </button>
              </div>

              {activeProducts.length === 0 ? (
                <div className="p-4 bg-zinc-800/80 border border-zinc-700 rounded-lg text-center space-y-2">
                  <p className="text-xs text-amber-300 font-medium">
                    Belum ada produk barang terdaftar di toko saprotan.
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Klik tombol di bawah ini untuk menambahkan barang dagangan baru (pupuk, benih, pestisida, beras, sembako, dll.) dan menambah stok kulakan.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddProductModal(true)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold inline-flex items-center space-x-1.5 shadow-sm cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Daftarkan Barang Baru &amp; Mulai Kulakan</span>
                  </button>
                </div>
              ) : (
                <select
                  value={selectedProductCode}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-100 focus:outline-hidden focus:border-emerald-500 font-medium"
                >
                  {activeProducts.map((p) => {
                    const s = stokList.find((item) => item.kode === p.kode);
                    return (
                      <option key={p.kode} value={p.kode}>
                        [{p.kategori}] {p.nama} — Stok saat ini: {s?.stok || 0} {p.satuan} | HPP: {formatRupiah(p.hargaBeli)}
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {/* Current Product Info Banner */}
            {currentProduct && (
              <div className="bg-zinc-800/80 border border-zinc-700/80 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-zinc-400 text-[10px] block">Kategori</span>
                  <span className="font-semibold text-zinc-200">{currentProduct.kategori}</span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] block">Stok Gudang Saat Ini</span>
                  <span className="font-bold text-emerald-400">
                    {currentStok?.stok || 0} {currentProduct.satuan}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] block">HPP Beli Lama</span>
                  <span className="font-semibold text-zinc-300 font-mono">
                    {formatRupiah(currentProduct.hargaBeli)}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 text-[10px] block">Harga Jual Saat Ini</span>
                  <span className="font-semibold text-amber-300 font-mono">
                    {formatRupiah(currentProduct.hargaJual)}
                  </span>
                </div>
              </div>
            )}

            {/* Price & Quantity Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Jumlah Qty Beli ({currentProduct?.satuan || 'Unit'}) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(Math.max(1, Number(e.target.value)))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-hidden focus:border-amber-500"
                  />
                  <span className="absolute right-3 top-2 text-xs text-zinc-400 pointer-events-none">
                    {currentProduct?.satuan}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Harga Beli Satuan (HPP Baru) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={hargaBeliInput}
                    onChange={(e) => setHargaBeliInput(Number(e.target.value))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Optional price update */}
            <div className="p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Perbarui Sugesti Harga Jual (Otomatis Tersimpan ke Katalog)</span>
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Sugesti Harga Jual Umum / Eceran
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-mono">Rp</span>
                    <input
                      type="number"
                      value={hargaJualBaru}
                      onChange={(e) => setHargaJualBaru(Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  {hargaBeliInput > 0 && hargaJualBaru > hargaBeliInput && (
                    <span className="text-[10px] text-emerald-400 mt-0.5 block">
                      Margin: +{formatRupiah(hargaJualBaru - hargaBeliInput)} (+
                      {Math.round(((hargaJualBaru - hargaBeliInput) / hargaJualBaru) * 100)}%)
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">
                    Sugesti Harga Khusus Rekanan / Mitra
                  </label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-zinc-400 font-mono">Rp</span>
                    <input
                      type="number"
                      value={hargaRekananBaru}
                      onChange={(e) => setHargaRekananBaru(Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-zinc-200 font-mono"
                    />
                  </div>
                  {hargaBeliInput > 0 && hargaRekananBaru > hargaBeliInput && (
                    <span className="text-[10px] text-sky-400 mt-0.5 block">
                      Margin Rekanan: +{formatRupiah(hargaRekananBaru - hargaBeliInput)} (+
                      {Math.round(((hargaRekananBaru - hargaBeliInput) / hargaRekananBaru) * 100)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Subtotal preview & Add Button */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <span className="text-xs text-zinc-400">Subtotal Item Ini:</span>
                <span className="ml-2 text-base font-bold text-amber-400 font-mono">
                  {formatRupiah(qtyInput * hargaBeliInput)}
                </span>
                <span className="text-[11px] text-zinc-400 ml-2">
                  (Stok baru: {(currentStok?.stok || 0) + qtyInput} {currentProduct?.satuan})
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="flex items-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ Masukkan Keranjang Kulakan</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Cart Kulakan & Confirmation (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  <span>Daftar Keranjang Kulakan ({cart.length} Item)</span>
                </h3>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {/* Cart Items List */}
              {cart.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  <PackagePlus className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                  <p>Keranjang kulakan masih kosong.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Pilih produk di sebelah kiri lalu klik tombol tambah.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.kodeProduk}
                      className="bg-zinc-800/80 border border-zinc-700/80 p-3 rounded-lg flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-xs text-zinc-100 truncate">
                          {item.nama}
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5 flex flex-wrap gap-x-3">
                          <span>
                            {item.qty} {item.satuan} x {formatRupiah(item.hargaBeliSatuan)}
                          </span>
                          <span className="text-emerald-400 font-mono font-medium">
                            = {formatRupiah(item.subtotal)}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-400 mt-1">
                          Stok: {item.stokSaatIni} →{' '}
                          <span className="text-amber-400 font-semibold">
                            {item.stokSaatIni + item.qty} {item.satuan}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveFromCart(item.kodeProduk)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded-sm transition-colors"
                        title="Hapus dari keranjang"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Keterangan */}
              <div className="mt-4 pt-3 border-t border-zinc-800">
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Catatan / Keterangan Transaksi
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Contoh: Pengiriman via armada truk supplier, tempo 14 hari"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>
            </div>

            {/* Bottom Total & Action */}
            <div className="mt-5 pt-4 border-t border-zinc-800 space-y-3">
              {errorMsg && (
                <div className="p-2.5 bg-rose-950/80 border border-rose-800 rounded-lg text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-400 font-medium">Total Nilai Kulakan:</span>
                <span className="text-xl font-bold text-amber-400 font-mono">
                  {formatRupiah(totalBelanjaKulakan)}
                </span>
              </div>

              <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Sumber Bayar:</span>
                <span className="font-semibold text-zinc-300">
                  {metode === 'TUNAI'
                    ? 'Kas Toko (KAS01)'
                    : metode === 'TRANSFER'
                    ? `Transfer (${rekeningSumber})`
                    : 'Hutang Usaha (TIT01)'}
                </span>
              </div>

              <button
                type="button"
                disabled={cart.length === 0 || submitting}
                onClick={() => setShowConfirmModal(true)}
                className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                  cart.length === 0 || submitting
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Transaksi Pembelian Kulakan</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2">
              <PackagePlus className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-zinc-100">Konfirmasi Pembelian Kulakan</h3>
            </div>

            <div className="bg-zinc-800 p-3 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Supplier:</span>
                <span className="font-semibold text-zinc-100">
                  {mitraList.find((m) => m.id === selectedSupplierId)?.nama}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">No Faktur:</span>
                <span className="font-mono text-zinc-200">{noFakturSupplier || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Jumlah Produk:</span>
                <span className="font-semibold text-zinc-100">{cart.length} Item</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Metode Bayar:</span>
                <span className="font-semibold text-amber-400">{metode}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-zinc-700 font-bold">
                <span className="text-zinc-300">Total Pembelian:</span>
                <span className="text-amber-400 font-mono text-sm">
                  {formatRupiah(totalBelanjaKulakan)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-zinc-400">
              Stok produk akan langsung ditambahkan ke gudang, dan harga modal (HPP) produk di sistem akan diperbarui sesuai harga beli kulakan ini.
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleProcessSubmit}
                className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                {submitting ? 'Memproses...' : 'Ya, Simpan & Tambah Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Pembelian Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>Riwayat Transaksi Pembelian Barang (Kulakan)</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Daftar faktur pembelian stok toko dan beras dari distributor/supplier.
            </p>
          </div>

          <button
            onClick={loadHistory}
            className="text-xs text-emerald-400 hover:underline self-start sm:self-auto font-semibold"
          >
            ↻ Segarkan Riwayat
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-800/80 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-700">
              <tr>
                <th className="py-2.5 px-3">No. Pembelian</th>
                <th className="py-2.5 px-3">Tanggal & Jam</th>
                <th className="py-2.5 px-3">Supplier</th>
                <th className="py-2.5 px-3">No Faktur</th>
                <th className="py-2.5 px-3">Daftar Produk</th>
                <th className="py-2.5 px-3">Metode</th>
                <th className="py-2.5 px-3 text-right">Total Nilai</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {historyPembelian.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-zinc-500 font-sans text-xs">
                    Belum ada data pembelian barang tercatat.
                  </td>
                </tr>
              ) : (
                historyPembelian.map((pb) => (
                  <tr key={pb.noPembelian} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-zinc-200">{pb.noPembelian}</td>
                    <td className="py-2.5 px-3 font-sans text-zinc-400">
                      {pb.tanggal} <span className="text-[10px] text-zinc-500">{pb.jam}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                      {pb.namaMitra}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400">{pb.noFakturSupplier || '-'}</td>
                    <td className="py-2.5 px-3 font-sans text-zinc-300">
                      <div className="truncate max-w-[220px]">
                        {pb.items.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ')}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {pb.metodePembayaran}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-400">
                      {formatRupiah(pb.totalNominal)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pb.status === 'LUNAS'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {pb.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      <button
                        onClick={() => setSelectedDetail(pb)}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-medium transition-colors"
                      >
                        Rincian
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Rincian Pembelian: {selectedDetail.noPembelian}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-zinc-400 hover:text-zinc-200 text-xs"
              >
                ✕ Tutup
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-800/60 p-3 rounded-lg">
              <div>
                <span className="text-zinc-500 text-[10px] block">Supplier</span>
                <span className="font-semibold text-zinc-200">{selectedDetail.namaMitra}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px] block">Waktu Transaksi</span>
                <span className="font-mono text-zinc-300">
                  {selectedDetail.tanggal} {selectedDetail.jam}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px] block">No. Faktur Supplier</span>
                <span className="font-mono text-zinc-300">{selectedDetail.noFakturSupplier || '-'}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px] block">Metode Pembayaran</span>
                <span className="font-bold text-amber-400">{selectedDetail.metodePembayaran}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-zinc-400">Rincian Barang yang Dibeli:</h4>
              <div className="divide-y divide-zinc-800 border border-zinc-800 rounded-lg overflow-hidden text-xs">
                {selectedDetail.items.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-zinc-800/40 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-zinc-200">{item.namaProduk}</div>
                      <div className="text-[11px] text-zinc-400">
                        {item.qty} {item.satuan} x {formatRupiah(item.hargaBeliSatuan)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-amber-400">
                        {formatRupiah(item.subtotal)}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        Stok: {item.stokSebelum ?? '-'} → {item.stokSetelah ?? '-'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
              <span className="text-xs font-medium text-zinc-400">Total Nominal Pembelian:</span>
              <span className="text-base font-bold text-amber-400 font-mono">
                {formatRupiah(selectedDetail.totalNominal)}
              </span>
            </div>

            <button
              onClick={() => setSelectedDetail(null)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold cursor-pointer"
            >
              Tutup Rincian
            </button>
          </div>
        </div>
      )}

      {/* Modal: Tambah Supplier Baru Cepat */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Tambah Distributor / Supplier Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddSupplier} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Nama Supplier / Distributor <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: PT Petrokimia Gresik Distributor / UD Tani Makmur"
                  value={newSupplierNama}
                  onChange={(e) => setNewSupplierNama(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  No. Telepon / WhatsApp
                </label>
                <input
                  type="text"
                  placeholder="Contoh: 081234567890"
                  value={newSupplierTelepon}
                  onChange={(e) => setNewSupplierTelepon(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Alamat / Wilayah Gudang
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Jl. Industri No. 45, Demak"
                  value={newSupplierAlamat}
                  onChange={(e) => setNewSupplierAlamat(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Catatan / Keterangan
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pemasok pupuk urea & phonska subsidi/nonsubsidi"
                  value={newSupplierCatatan}
                  onChange={(e) => setNewSupplierCatatan(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingSupplier || !newSupplierNama.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  {submittingSupplier ? (
                    <span>Menyimpan...</span>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Simpan &amp; Pilih Supplier</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah Produk Baru Langsung (Untuk Kulakan) */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <PackagePlus className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">Tambah Produk Barang Dagangan Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddProductModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-zinc-400">
              Daftarkan produk baru yang dibeli untuk menambah stok barang toko (otomatis membuat kode dan HPP modal).
            </p>

            <form onSubmit={handleQuickAddProduct} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Nama Barang / Produk <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Contoh: Pupuk NPK Mutiara 16-16-16 50kg"
                    value={newProdNama}
                    onChange={(e) => setNewProdNama(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Kode Produk
                  </label>
                  <input
                    type="text"
                    placeholder="Otomatis (atau ketik)"
                    value={newProdKode}
                    onChange={(e) => setNewProdKode(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Kategori Barang
                  </label>
                  <select
                    value={newProdKategori}
                    onChange={(e) => setNewProdKategori(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="PUPUK & SAPROTAN">PUPUK &amp; SAPROTAN</option>
                    <option value="BENIH & BIBIT">BENIH &amp; BIBIT</option>
                    <option value="OBAT & PESTISIDA">OBAT &amp; PESTISIDA</option>
                    <option value="ALAT & MESIN">ALAT &amp; MESIN PERTANIAN</option>
                    <option value="SEMBAKO & BERAS">SEMBAKO &amp; BERAS</option>
                    <option value="PAKAN TERNAK">PAKAN TERNAK</option>
                    <option value="LAINNYA">LAINNYA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Satuan Kemasan
                  </label>
                  <select
                    value={newProdSatuan}
                    onChange={(e) => setNewProdSatuan(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="Sak">Sak (50 Kg / 25 Kg)</option>
                    <option value="Botol">Botol (500ml / 1L)</option>
                    <option value="Pcs">Pcs / Buah</option>
                    <option value="Kg">Kg (Kilogram)</option>
                    <option value="Dus">Dus / Karton</option>
                    <option value="Liter">Liter</option>
                    <option value="Pack">Pack / Bungkus</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Harga Beli / Kulakan (HPP) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newProdHargaBeli}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setNewProdHargaBeli(val);
                      setNewProdHargaJual(Math.round(val * 1.15));
                      setNewProdHargaRekanan(Math.round(val * 1.1));
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono font-bold"
                  />
                  <span className="text-[10px] text-zinc-400">Modal beli dari supplier</span>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Harga Jual Eceran
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newProdHargaJual}
                    onChange={(e) => setNewProdHargaJual(Number(e.target.value) || 0)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-zinc-400">Harga jual ke umum</span>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Harga Khusus Rekanan
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newProdHargaRekanan}
                    onChange={(e) => setNewProdHargaRekanan(Number(e.target.value) || 0)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-zinc-400">Harga jual ke petani mitra</span>
                </div>
              </div>

              <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-200 flex items-center space-x-1.5">
                    <ShoppingCart className="w-4 h-4 text-amber-400" />
                    <span>Jumlah Yang Dibeli Sekarang (Masuk Keranjang Kulakan):</span>
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="number"
                      min="0"
                      value={newProdQtyKulakan}
                      onChange={(e) => setNewProdQtyKulakan(Math.max(0, Number(e.target.value)))}
                      className="w-20 bg-zinc-900 border border-amber-500 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-mono font-bold text-center"
                    />
                    <span className="text-xs text-zinc-300 font-semibold">{newProdSatuan}</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400">
                  Jika diisi &gt; 0, produk akan langsung otomatis dimasukkan ke keranjang pembelian toko dan menambah stok.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddProductModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingProduct || !newProdNama.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-md cursor-pointer flex items-center space-x-1.5"
                >
                  {submittingProduct ? (
                    <span>Menyimpan...</span>
                  ) : (
                    <>
                      <PackagePlus className="w-4 h-4" />
                      <span>Daftarkan &amp; Masukkan Pembelian</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
