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
  Building2,
  Info,
  Pencil,
  History,
} from 'lucide-react';
import {
  Mitra,
  Produk,
  Rekening,
  StokBarang,
  TransaksiPenjualan,
  isKategoriAlatNonStok,
} from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import { useFuzzyMitraMatches } from '../../utils/nameSimilarity.ts';
import { FuzzyNameWarningCard } from '../common/FuzzyNameWarningCard.tsx';
import {
  ArusKasDivisiSelectorCard,
  DoubleCheckVerifikasiPanel,
  isRealTransferBankAccount,
  useDivisiOptions,
} from '../common/DoubleCheckVerifikasiPanel.tsx';

interface Props {
  produkList: Produk[];
  stokList: StokBarang[];
  mitraList: Mitra[];
  rekeningList: Rekening[];
  penjualanList?: TransaksiPenjualan[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
  onOpenLabaRugi?: () => void;
  onNavigateToKulakan?: () => void;
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
  isNonStokAlat?: boolean;
}

export const PenjualanView: React.FC<Props> = ({
  produkList,
  stokList,
  mitraList,
  rekeningList,
  penjualanList = [],
  onSuccess,
  onRefresh,
  onOpenLabaRugi,
  onNavigateToKulakan,
}) => {
  const [editTxId, setEditTxId] = useState<string | null>(null);
  // Normalized stock lookup map by uppercase trimmed kode
  const stokByKode = React.useMemo(() => {
    const map = new Map<string, StokBarang>();
    for (const s of stokList) {
      map.set(String(s.kode || '').trim().toUpperCase(), s);
    }
    return map;
  }, [stokList]);

  const getStokQty = React.useCallback(
    (kode: string | undefined) => {
      if (!kode) return 0;
      return Math.max(0, Number(stokByKode.get(String(kode).trim().toUpperCase())?.stok) || 0);
    },
    [stokByKode]
  );

  const activeProducts = React.useMemo(() => {
    const list = produkList.filter((p) => p.status === 'AKTIF');
    // Urutkan produk siap jual (stok > 0 atau jasa sewa ALAT tanpa stok) di bagian paling atas
    return [...list].sort((a, b) => {
      const readyA = getStokQty(a.kode) > 0 || isKategoriAlatNonStok(a.kategori);
      const readyB = getStokQty(b.kode) > 0 || isKategoriAlatNonStok(b.kategori);
      if (readyA && !readyB) return -1;
      if (!readyA && readyB) return 1;
      return a.nama.localeCompare(b.nama, 'id');
    });
  }, [produkList, getStokQty]);

  const inStockProducts = React.useMemo(
    () => activeProducts.filter((p) => getStokQty(p.kode) > 0 || isKategoriAlatNonStok(p.kategori)),
    [activeProducts, getStokQty]
  );

  const availableBanks = React.useMemo(
    () => rekeningList.filter(isRealTransferBankAccount),
    [rekeningList]
  );
  const divisiOptions = useDivisiOptions();

  // Buyer type: 'UMUM' (Pelanggan umum/eceran) or 'REKANAN' (Mitra rekanan bisnis/grosir)
  const [tipePembeli, setTipePembeli] = useState<'UMUM' | 'REKANAN'>('UMUM');
  const [namaPembeliManual, setNamaPembeliManual] = useState<string>('');
  const [pelangganUmumMode, setPelangganUmumMode] = useState<'MANUAL' | 'TERDAFTAR'>('MANUAL');
  const [selectedMitraId, setSelectedMitraId] = useState<string>(mitraList[0]?.id || '');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'KASBON' | 'INTERNAL_PT'>('TUNAI');
  const [rekeningTujuan, setRekeningTujuan] = useState<string>(availableBanks[0]?.kode || 'BNI01');
  const [divisi, setDivisi] = useState<string>('CV Wijaya Agro');
  const [keterangan, setKeterangan] = useState<string>('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(
    inStockProducts[0]?.kode || activeProducts[0]?.kode || ''
  );
  const [qtyInput, setQtyInput] = useState<number>(1);

  // Negotiated Price Input (Initial suggestion strictly from purchase HPP / catalog, freely editable)
  const [hargaNegoInput, setHargaNegoInput] = useState<number>(0);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [verifiedDoubleCheck, setVerifiedDoubleCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [kasirKategoriFilter, setKasirKategoriFilter] = useState<string>('ALL');
  const kasirCategories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of activeProducts) {
      const cat = String(p.kategori || '')
        .trim()
        .toUpperCase();
      if (cat) set.add(cat);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [activeProducts]);

  const filteredKasirProducts = React.useMemo(() => {
    if (kasirKategoriFilter === 'ALL') return activeProducts;
    return activeProducts.filter(
      (p) => String(p.kategori || '').trim().toUpperCase() === kasirKategoriFilter
    );
  }, [activeProducts, kasirKategoriFilter]);

  const activeMitras = React.useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );
  const selectedMitraObj = activeMitras.find((m) => m.id === selectedMitraId);

  const [dismissedCustomerWarning, setDismissedCustomerWarning] = useState<string>('');

  const similarCustomers = useFuzzyMitraMatches(namaPembeliManual, activeMitras);

  const isCurrentWarningDismissed =
    dismissedCustomerWarning.length > 0 &&
    dismissedCustomerWarning.toLowerCase() === namaPembeliManual.trim().toLowerCase();

  // Keep rekeningTujuan valid for TRANSFER
  useEffect(() => {
    if (availableBanks.length > 0 && !availableBanks.some((b) => b.kode === rekeningTujuan)) {
      setRekeningTujuan(availableBanks[0].kode);
    }
  }, [rekeningList, rekeningTujuan]);

  // Auto-select a ready product (in-stock or ALAT service) if current selection has 0 stock
  useEffect(() => {
    const currentCodeNorm = String(selectedProductCode || '').trim().toUpperCase();
    const currentObj = activeProducts.find(
      (p) => String(p.kode || '').trim().toUpperCase() === currentCodeNorm
    );
    const currentIsReady = currentObj
      ? getStokQty(currentObj.kode) > 0 || isKategoriAlatNonStok(currentObj.kategori)
      : false;

    if (!currentObj && (inStockProducts[0] || activeProducts[0])) {
      setSelectedProductCode((inStockProducts[0] || activeProducts[0]).kode);
    } else if (!currentIsReady && inStockProducts.length > 0 && cart.length === 0) {
      const inCurrentFilter = inStockProducts.find(
        (p) =>
          kasirKategoriFilter === 'ALL' ||
          String(p.kategori || '').trim().toUpperCase() === kasirKategoriFilter
      );
      if (inCurrentFilter && inCurrentFilter.kode !== selectedProductCode) {
        setSelectedProductCode(inCurrentFilter.kode);
      }
    }
  }, [produkList, stokList]);

  // Find info for currently selected product
  const normSelected = String(selectedProductCode || '').trim().toUpperCase();
  const currentProduct =
    filteredKasirProducts.find((p) => String(p.kode || '').trim().toUpperCase() === normSelected) ||
    activeProducts.find((p) => String(p.kode || '').trim().toUpperCase() === normSelected) ||
    filteredKasirProducts[0] ||
    activeProducts[0];
  const currentStok = currentProduct
    ? stokByKode.get(String(currentProduct.kode || '').trim().toUpperCase())
    : undefined;
  const isCurrentAlatJasa = isKategoriAlatNonStok(currentProduct?.kategori);
  const stokTersediaCurrent = Math.max(0, Number(currentStok?.stok) || 0);

  // Suggested price strictly from purchase capital (HPP) & catalog (zero invented numbers)
  const baseModalCurrent = Math.max(0, Number(currentProduct?.hargaBeli) || 0);
  const baseUmumCurrent =
    currentProduct && currentProduct.hargaJual > 0 ? currentProduct.hargaJual : baseModalCurrent;
  const baseRekananCurrent =
    currentProduct && currentProduct.hargaKhususRekanan && currentProduct.hargaKhususRekanan > 0
      ? currentProduct.hargaKhususRekanan
      : baseUmumCurrent;

  const currentSugestiPrice = currentProduct
    ? tipePembeli === 'REKANAN'
      ? baseRekananCurrent
      : baseUmumCurrent
    : 0;

  // Whenever product, buyer type, or catalog HPP/suggested prices change (e.g. right after Pembelian), sync price!
  useEffect(() => {
    if (currentProduct) {
      setHargaNegoInput(currentSugestiPrice);
    }
  }, [
    selectedProductCode,
    tipePembeli,
    currentProduct?.kode,
    currentProduct?.hargaBeli,
    currentProduct?.hargaJual,
    currentProduct?.hargaKhususRekanan,
  ]);

  // When switching to REKANAN, ensure a partner is selected
  useEffect(() => {
    if (tipePembeli === 'REKANAN') {
      const partner = activeMitras.find((m) => m.role !== 'CUSTOMER') || activeMitras[0];
      if (partner && (!selectedMitraId || selectedMitraId === mitraList[0]?.id)) {
        setSelectedMitraId(partner.id);
      }
    }
  }, [tipePembeli]);

  // Auto-switch to INTERNAL_PT when all items in cart are Rp 0
  useEffect(() => {
    if (cart.length > 0 && cart.every((it) => it.harga === 0)) {
      if (metode !== 'INTERNAL_PT') {
        setMetode('INTERNAL_PT');
      }
    }
  }, [cart]);

  const handleResetToSuggestion = () => {
    setHargaNegoInput(currentSugestiPrice);
  };

  const handleSetHargaNol = () => {
    setHargaNegoInput(0);
    if (!keterangan) {
      setKeterangan('Pemakaian sendiri untuk kebutuhan operasional PT');
    }
  };

  const handleSelectPemakaianInternalPT = () => {
    setTipePembeli('UMUM');
    setPelangganUmumMode('MANUAL');
    setNamaPembeliManual('Internal PT Wijaya Agro (Operasional)');
    setMetode('INTERNAL_PT');
    setDivisi('PT Wijaya Agro Perkasa');
    setHargaNegoInput(0);
    if (!keterangan) {
      setKeterangan('Pemakaian barang toko untuk kebutuhan operasional internal PT');
    }
  };

  const buildPendingSaleItem = (): CartItem | null => {
    if (!currentProduct || qtyInput <= 0 || hargaNegoInput < 0) return null;
    const isAlatJasa = isKategoriAlatNonStok(currentProduct.kategori);
    if (!isAlatJasa && (stokTersediaCurrent <= 0 || qtyInput > stokTersediaCurrent)) return null;
    const modalHpp = Math.max(0, Number(currentProduct.hargaBeli) || 0);
    return {
      kodeProduk: currentProduct.kode,
      nama: currentProduct.nama,
      satuan: currentProduct.satuan,
      qty: qtyInput,
      hargaBeli: modalHpp,
      hargaSugesti: currentSugestiPrice,
      harga: hargaNegoInput,
      subtotal: qtyInput * hargaNegoInput,
      labaKotor: (hargaNegoInput - modalHpp) * qtyInput,
      stokTersedia: stokTersediaCurrent,
      isNonStokAlat: isAlatJasa,
    };
  };

  const handleAddToCart = () => {
    setErrorMsg('');
    if (!currentProduct) return;
    if (qtyInput <= 0) {
      setErrorMsg('Jumlah qty harus lebih dari 0');
      return;
    }
    if (hargaNegoInput < 0) {
      setErrorMsg('Harga jual / tarif sewa tidak boleh bernilai negatif');
      return;
    }

    const isAlatJasa = isKategoriAlatNonStok(currentProduct.kategori);
    const stokTersedia = stokTersediaCurrent;
    const existingCartItem = cart.find(
      (i) => String(i.kodeProduk).trim().toUpperCase() === String(currentProduct.kode).trim().toUpperCase()
    );
    const existingQty = existingCartItem ? existingCartItem.qty : 0;
    const totalRequestedQty = existingQty + qtyInput;

    if (!isAlatJasa && totalRequestedQty > stokTersedia) {
      setErrorMsg(
        `Stok tidak mencukupi untuk "${currentProduct.nama}". Stok tersedia dari pembelian: ${stokTersedia} ${currentProduct.satuan}, diminta: ${totalRequestedQty} ${currentProduct.satuan}`
      );
      return;
    }

    const modalHpp = Math.max(0, Number(currentProduct.hargaBeli) || 0);
    const subtotal = totalRequestedQty * hargaNegoInput;
    const labaKotor = (hargaNegoInput - modalHpp) * totalRequestedQty;

    if (existingCartItem) {
      setCart(
        cart.map((item) =>
          String(item.kodeProduk).trim().toUpperCase() === String(currentProduct.kode).trim().toUpperCase()
            ? {
                ...item,
                qty: totalRequestedQty,
                harga: hargaNegoInput,
                subtotal,
                labaKotor,
                stokTersedia,
                isNonStokAlat: isAlatJasa,
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
          isNonStokAlat: isAlatJasa,
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
          if (!item.isNonStokAlat && newQty > item.stokTersedia) {
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

  const pendingSalePreview = cart.length === 0 ? buildPendingSaleItem() : null;
  const effectiveSaleItems = cart.length > 0 ? cart : pendingSalePreview ? [pendingSalePreview] : [];

  // Summary calculations
  const totalOmzet = effectiveSaleItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalModalHpp = effectiveSaleItems.reduce((sum, item) => sum + item.hargaBeli * item.qty, 0);
  const totalLabaKotor = totalOmzet - totalModalHpp;
  const persentaseMargin = totalOmzet > 0 ? (totalLabaKotor / totalOmzet) * 100 : 0;

  const finalBuyerName =
    tipePembeli === 'UMUM'
      ? pelangganUmumMode === 'MANUAL'
        ? (namaPembeliManual.trim() || 'Pelanggan Umum')
        : (selectedMitraObj?.nama || 'Pelanggan Umum')
      : (selectedMitraObj?.nama || 'Mitra Rekanan');

  const handleOpenConfirmSale = () => {
    setErrorMsg('');
    if (cart.length === 0) {
      const autoSale = buildPendingSaleItem();
      if (!autoSale) {
        if (!isCurrentAlatJasa && stokTersediaCurrent <= 0) {
          setErrorMsg(
            `Stok "${currentProduct?.nama || 'Produk'}" masih 0. Lakukan Pembelian Barang dari Pemasok terlebih dahulu agar stok tersedia.`
          );
        } else {
          setErrorMsg('Masukkan item ke keranjang atau periksa jumlah Qty transaksi.');
        }
        return;
      }
      setCart([autoSale]);
    }
    if (metode === 'KASBON' && tipePembeli === 'UMUM' && pelangganUmumMode === 'MANUAL') {
      setErrorMsg('Metode KASBON piutang hanya berlaku untuk mitra/karyawan terdaftar');
      return;
    }
    if (metode === 'TRANSFER' && totalOmzet > 0 && !rekeningTujuan) {
      setErrorMsg('Pilih rekening bank tujuan transfer');
      return;
    }
    setVerifiedDoubleCheck(false);
    setShowConfirmModal(true);
  };

  const handleProcessSubmit = async () => {
    const itemsToSell = cart.length > 0 ? cart : buildPendingSaleItem() ? [buildPendingSaleItem()!] : [];
    if (itemsToSell.length === 0) {
      setErrorMsg('Keranjang penjualan masih kosong');
      return;
    }
    if (metode === 'KASBON' && tipePembeli === 'UMUM' && pelangganUmumMode === 'MANUAL') {
      setErrorMsg('Metode KASBON piutang hanya berlaku untuk mitra/karyawan terdaftar');
      return;
    }
    if (metode === 'TRANSFER' && totalOmzet > 0 && !rekeningTujuan) {
      setErrorMsg('Pilih rekening bank tujuan transfer');
      return;
    }
    if (!verifiedDoubleCheck) {
      setErrorMsg('Harap centang verifikasi rekening uang riil & divisi terkait terlebih dahulu');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);

    try {
      const isManualUmum = tipePembeli === 'UMUM' && pelangganUmumMode === 'MANUAL';
      const effectiveMetode = (totalOmzet === 0 && metode !== 'KASBON') ? 'INTERNAL_PT' : metode;
      const result: TransaksiPenjualan = await api.processPenjualan({
        idMitra: isManualUmum ? 'UMUM' : selectedMitraId,
        namaPembeliManual: isManualUmum ? finalBuyerName : undefined,
        tipePembeli,
        divisi,
        metode: effectiveMetode,
        rekeningTujuan: effectiveMetode === 'TRANSFER' ? rekeningTujuan : undefined,
        items: itemsToSell.map((i) => ({
          kodeProduk: i.kodeProduk,
          qty: i.qty,
          harga: i.harga,
          hargaSugesti: i.hargaSugesti,
        })),
        keterangan: keterangan || (effectiveMetode === 'INTERNAL_PT' ? 'Pemakaian barang toko untuk operasional internal PT' : undefined),
      });

      setShowConfirmModal(false);
      setVerifiedDoubleCheck(false);
      setCart([]);
      setKeterangan('');
      if (isManualUmum) {
        setNamaPembeliManual('');
      }
      onRefresh();

      const isInternalPT = result?.metode === 'INTERNAL_PT' || (result?.totalNominal ?? 0) === 0;

      // Trigger print receipt
      const receipt: ReceiptData = {
        title: isInternalPT ? 'BUKTI PENGELUARAN BARANG (KEBUTUHAN INTERNAL PT)' : 'NOTA PENJUALAN KASIR',
        subtitle: isInternalPT
          ? 'Pemakaian Sendiri / Operasional PT Wijaya Agro (Harga Rp 0)'
          : `Tipe: ${result?.tipePembeli || tipePembeli} | Divisi: ${result?.divisi || divisi}`,
        nomorTransaksi: result?.noPenjualan || `PJ-${Date.now().toString().slice(-4)}`,
        tanggal: result?.tanggal || new Date().toISOString().split('T')[0],
        jam: result?.jam || '00:00:00',
        mitra: result?.namaMitra || finalBuyerName,
        rekening: result?.rekeningTujuan || (isInternalPT ? 'INTERNAL_PT' : '-'),
        kategori: 'PENJUALAN',
        items: (result?.items || []).map((i) => ({
          nama: i?.namaProduk || '-',
          qty: i?.qty ?? 0,
          satuan: i?.satuan || 'Pcs',
          harga: i?.harga ?? 0,
          subtotal: i?.subtotal ?? 0,
        })),
        detailRows: [
          { label: 'Penerima / Pihak', value: result?.namaMitra || finalBuyerName },
          { label: 'Divisi Terkait', value: result?.divisi || divisi },
          { label: 'Jenis Transaksi', value: isInternalPT ? '🏢 PEMAKAIAN KEBUTUHAN INTERNAL PT' : (result?.tipePembeli || tipePembeli) },
          {
            label: 'Metode Transaksi',
            value: isInternalPT ? 'PEMAKAIAN SENDIRI (HARGA RP 0)' : (result?.metode || effectiveMetode),
          },
          {
            label: 'Rekening Uang Riil',
            value: isInternalPT ? 'BIAYA OPERASIONAL INTERNAL PT' : (result?.rekeningTujuan || '-'),
          },
          {
            label: 'Status Transaksi',
            value: isInternalPT
              ? 'SELESAI (STOK DIKELUARKAN UNTUK OPERASIONAL PT)'
              : (result?.statusPembayaran === 'LUNAS' ? 'LUNAS (UANG MASUK)' : 'BELUM BAYAR (PIUTANG KASBON)'),
            highlight: true,
          },
          {
            label: isInternalPT ? 'Total Biaya Modal HPP' : 'Total Tagihan Penjualan',
            value: isInternalPT ? (result?.totalModalHpp ?? totalModalHpp) : (result?.totalNominal ?? 0),
            isTotal: true,
          },
        ],
        catatan: result?.keterangan || keterangan,
        kasir: 'Kasir Wijaya Agro',
      };

      try {
        onSuccess(receipt);
      } catch (err) {
        console.warn('onSuccess callback error in PenjualanView:', err);
      }
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

        <div className="flex items-center flex-wrap gap-2">
          {onNavigateToKulakan && (
            <button
              type="button"
              onClick={onNavigateToKulakan}
              className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              <Package className="w-4 h-4" />
              <span>Pembelian Stok Pemasok →</span>
            </button>
          )}
          {onOpenLabaRugi && (
            <button
              type="button"
              onClick={onOpenLabaRugi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-700/60 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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
                      <div className="flex items-center justify-between mt-1.5 flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={handleSelectPemakaianInternalPT}
                          className="px-2.5 py-1 rounded-lg bg-blue-950/80 hover:bg-blue-900 border border-blue-700/80 text-blue-200 text-[11px] font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
                        >
                          <Building2 className="w-3.5 h-3.5 text-blue-400" />
                          <span>🏢 Set Untuk Kebutuhan Internal PT (Operasional)</span>
                        </button>
                        {namaPembeliManual.includes('Internal PT') && (
                          <span className="text-[10px] text-blue-300 font-semibold bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700">
                            Mode Pemakaian Sendiri
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Advanced Fuzzy Name Suggestion & Anti-Duplicate Warning */}
                    <FuzzyNameWarningCard
                      inputName={namaPembeliManual}
                      matches={similarCustomers}
                      contextLabel="Pembeli / Customer"
                      theme="dark"
                      isDismissed={isCurrentWarningDismissed}
                      onDismissDifferentPerson={() => setDismissedCustomerWarning(namaPembeliManual.trim())}
                      onSelectRegistered={(m) => {
                        setSelectedMitraId(m.id);
                        setTipePembeli('REKANAN');
                      }}
                      onApplyCorrectedName={(corrected) => {
                        setNamaPembeliManual(corrected);
                      }}
                    />

                    {/* Unregistered notification badge when truly no similar names exist */}
                    {namaPembeliManual.trim().length >= 2 && similarCustomers.length === 0 && (
                      <div className="p-2 bg-emerald-950/50 border border-emerald-800/80 rounded-lg text-[11px] text-emerald-300 flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                          Nama <strong>"{namaPembeliManual}"</strong> belum ada yang mirip di database. Transaksi ini akan disimpan sebagai <strong>Pelanggan Umum</strong> tanpa menambah daftar Master Mitra.
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

            {/* Dynamic Category Filter + Product selection */}
            <div className="space-y-2">
              {kasirCategories.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] text-zinc-400 shrink-0">Filter Kategori:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setKasirKategoriFilter('ALL');
                      if (activeProducts[0]) setSelectedProductCode(activeProducts[0].kode);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer shrink-0 ${
                      kasirKategoriFilter === 'ALL'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
                    }`}
                  >
                    Semua ({activeProducts.length})
                  </button>
                  {kasirCategories.map((cat) => {
                    const count = activeProducts.filter(
                      (p) => String(p.kategori || '').trim().toUpperCase() === cat
                    ).length;
                    const isSelected = kasirKategoriFilter === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setKasirKategoriFilter(cat);
                          const firstInCat = activeProducts.find(
                            (p) => String(p.kategori || '').trim().toUpperCase() === cat
                          );
                          if (firstInCat) setSelectedProductCode(firstInCat.kode);
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer shrink-0 ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
                        }`}
                      >
                        {cat.replace(/_/g, ' ')} ({count})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quick-pick Barang & Jasa Sewa Siap Transaksi */}
              {inStockProducts.length > 0 ? (
                <div className="p-2.5 bg-emerald-950/35 border border-emerald-800/70 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-300">
                      Barang &amp; Jasa Sewa Siap Transaksi ({inStockProducts.length} Item):
                    </span>
                    <span className="text-[10px] text-zinc-400">Klik cepat produk / sewa alat</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {inStockProducts.map((p) => {
                      const sq = getStokQty(p.kode);
                      const isAlat = isKategoriAlatNonStok(p.kategori);
                      const isSel = currentProduct?.kode === p.kode;
                      return (
                        <button
                          key={p.kode}
                          type="button"
                          onClick={() => setSelectedProductCode(p.kode)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                            isSel
                              ? 'bg-emerald-600 text-white border-emerald-400 shadow-xs'
                              : isAlat
                              ? 'bg-zinc-900 text-sky-200 border-sky-800 hover:bg-sky-950'
                              : 'bg-zinc-900 text-emerald-200 border-emerald-800 hover:bg-emerald-950'
                          }`}
                        >
                          {p.nama} ({isAlat ? `Sewa / ${p.satuan}` : `${sq} ${p.satuan}`})
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-amber-950/40 border border-amber-800/70 rounded-lg flex items-center justify-between gap-2 text-xs text-amber-200">
                  <span>Belum ada barang dengan stok &gt; 0 atau item sewa jasa ALAT.</span>
                  {onNavigateToKulakan && (
                    <button
                      type="button"
                      onClick={onNavigateToKulakan}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold text-[11px] shrink-0 cursor-pointer"
                    >
                      Input Pembelian →
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Daftar Produk &amp; Jasa Sewa Alat</label>
                <select
                  value={currentProduct?.kode || selectedProductCode}
                  onChange={(e) => setSelectedProductCode(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs text-zinc-100 focus:outline-hidden focus:border-emerald-500 font-medium"
                >
                  {filteredKasirProducts.map((p) => {
                    const stQty = getStokQty(p.kode);
                    const isAlat = isKategoriAlatNonStok(p.kategori);
                    const cleanKat = String(p.kategori || 'LAINNYA').replace(/_/g, ' ');
                    const sugestiOpt = p.hargaJual > 0 ? p.hargaJual : p.hargaBeli || 0;
                    return (
                      <option key={p.kode} value={p.kode}>
                        {isAlat
                          ? `[SEWA JASA - TANPA STOK] `
                          : stQty > 0
                          ? `[SIAP JUAL: ${stQty} ${p.satuan}] `
                          : '[STOK 0] '}
                        [{cleanKat}] {p.nama} | HPP: {formatRupiah(p.hargaBeli || 0)} | Sugesti: {formatRupiah(sugestiOpt)}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Real-time Stock & Cost Information Card */}
            {currentProduct && (
              <div className="bg-zinc-800/80 border border-zinc-700/80 rounded-lg p-3 space-y-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-zinc-500 text-[10px] block">
                      {isCurrentAlatJasa ? 'Jenis Layanan' : 'Stok Tersedia (Dari Pembelian)'}
                    </span>
                    {isCurrentAlatJasa ? (
                      <span className="font-bold text-sky-400">
                        Tanpa Stok (Sewa Jasa)
                      </span>
                    ) : (
                      <span className={`font-bold font-mono ${stokTersediaCurrent === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {stokTersediaCurrent} {currentProduct.satuan}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">
                      {isCurrentAlatJasa ? 'Modal Dasar' : 'Modal HPP Pembelian'}
                    </span>
                    <span className="font-semibold text-zinc-300 font-mono">
                      {baseModalCurrent > 0
                        ? formatRupiah(baseModalCurrent)
                        : isCurrentAlatJasa
                        ? 'Rp 0 (Jasa Sewa)'
                        : 'Rp 0 (Belum Kulak)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">
                      {isCurrentAlatJasa ? 'Tarif Sewa Umum' : 'Sugesti Eceran'}
                    </span>
                    <span className="font-semibold text-zinc-300 font-mono">
                      {formatRupiah(baseUmumCurrent)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-[10px] block">Sugesti Rekanan</span>
                    <span className="font-semibold text-amber-400 font-mono">
                      {formatRupiah(baseRekananCurrent)}
                    </span>
                  </div>
                </div>
                {!isCurrentAlatJasa && stokTersediaCurrent > 0 && qtyInput > 0 && (
                  <div className="pt-1.5 border-t border-zinc-700/70 text-[11px] flex items-center justify-between text-zinc-300">
                    <span>Mutasi Stok Penjualan Ini:</span>
                    <span className="font-mono font-semibold">
                      Tersedia {stokTersediaCurrent} − Jual {qtyInput} ={' '}
                      <strong className={stokTersediaCurrent - qtyInput < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                        Sisa {stokTersediaCurrent - qtyInput} {currentProduct.satuan}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Pricing & Negotiation Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              {/* Qty Input (4 cols) */}
              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Qty / Durasi ({currentProduct?.satuan})
                </label>
                <input
                  type="number"
                  min="1"
                  max={!isCurrentAlatJasa && stokTersediaCurrent > 0 ? stokTersediaCurrent : undefined}
                  value={qtyInput === 0 ? '' : qtyInput}
                  onChange={(e) => setQtyInput(e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Editable Suggested / Negotiated Price (8 cols) */}
              <div className="sm:col-span-8">
                <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                  <label className="text-xs font-bold text-zinc-200 flex items-center space-x-1.5">
                    <span>Harga Deal / Nego Satuan</span>
                    <span className="text-[10px] text-zinc-400 font-normal">
                      (Sugesti: {formatRupiah(currentSugestiPrice)})
                    </span>
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={handleSetHargaNol}
                      className="text-[10px] font-semibold text-amber-300 hover:text-amber-200 bg-amber-950/80 hover:bg-amber-900 px-2 py-0.5 rounded border border-amber-800 flex items-center space-x-1 transition-colors cursor-pointer"
                      title="Set harga jual Rp 0 untuk barang kebutuhan operasional PT sendiri"
                    >
                      <Building2 className="w-3 h-3 text-amber-400" />
                      <span>Set Harga Rp 0 (Kebutuhan PT)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResetToSuggestion}
                      className="text-[10px] text-emerald-400 hover:underline flex items-center space-x-1 cursor-pointer"
                      title="Kembalikan ke harga sugesti rekomendasi"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">Rp</span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={hargaNegoInput}
                    onChange={(e) => setHargaNegoInput(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-zinc-800 border border-amber-600/80 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-400"
                  />
                </div>
                <div className="text-[10px] text-zinc-400 mt-1 flex items-center justify-between">
                  <span>💡 Bisa ketik <strong>0</strong> jika barang diambil untuk operasional PT sendiri.</span>
                  {hargaNegoInput === 0 && (
                    <span className="text-blue-400 font-bold font-mono">
                      (BIAYA INTERNAL PT - RP 0)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Realtime Profit/Loss Margin Indicator for this item */}
            <div className="pt-1">
              {hargaNegoInput === 0 ? (
                <div className="p-2.5 bg-blue-950/80 border border-blue-800 rounded-lg text-blue-200 text-xs flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                    <div>
                      <strong className="text-blue-100">Pemakaian Kebutuhan Internal PT (Harga Rp 0):</strong>
                      <div className="text-[11px] text-blue-300 mt-0.5">
                        Stok gudang otomatis berkurang {qtyInput} {currentProduct?.satuan}. Modal HPP ({formatRupiah(currentModalHpp * qtyInput)}) dibukukan sebagai biaya operasional PT.
                      </div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-blue-300 shrink-0 text-right ml-2">
                    Beban HPP: {formatRupiah(currentModalHpp * qtyInput)}
                  </span>
                </div>
              ) : isLoss ? (
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
              {cart.length === 0 && pendingSalePreview ? (
                <div className="p-2.5 bg-emerald-950/35 border border-emerald-800/70 rounded-lg space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400 uppercase">
                    <span>Siap Disimpan Langsung</span>
                    <span>
                      {pendingSalePreview.isNonStokAlat
                        ? 'Sewa Jasa (Tanpa Stok)'
                        : `Stok: ${pendingSalePreview.stokTersedia} → ${pendingSalePreview.stokTersedia - pendingSalePreview.qty} ${pendingSalePreview.satuan}`}
                    </span>
                  </div>
                  <div className="font-semibold text-zinc-100">{pendingSalePreview.nama}</div>
                  <div className="font-mono text-[11px] text-zinc-300">
                    {pendingSalePreview.qty} {pendingSalePreview.satuan} × {formatRupiah(pendingSalePreview.harga)} ={' '}
                    <strong className="text-amber-400">{formatRupiah(pendingSalePreview.subtotal)}</strong>
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {pendingSalePreview.isNonStokAlat ? 'Modal Dasar' : 'Modal HPP Pembelian'}:{' '}
                    {formatRupiah(pendingSalePreview.hargaBeli)} / {pendingSalePreview.satuan}
                  </div>
                </div>
              ) : cart.length === 0 ? (
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
                                handleUpdateCartPrice(item.kodeProduk, Math.max(0, Number(e.target.value)))
                              }
                              className="w-24 bg-zinc-900 border border-amber-600/60 rounded pl-6 pr-1.5 py-0.5 text-xs text-amber-300 font-mono text-right font-semibold"
                            />
                          </div>
                          {item.harga > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateCartPrice(item.kodeProduk, 0)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                              title="Ubah harga menjadi Rp 0 untuk pemakaian PT"
                            >
                              Rp 0 (PT)
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateCartPrice(item.kodeProduk, item.hargaSugesti)}
                              className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                              title="Reset kembali ke harga sugesti normal"
                            >
                              Normal
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Item Subtotal & Profit Indicator */}
                      <div className="flex items-center justify-between text-[11px] px-1 font-mono">
                        {item.harga === 0 ? (
                          <span className="text-blue-400 font-semibold flex items-center space-x-1">
                            <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            <span>🏢 Pemakaian Internal PT (Rp 0)</span>
                          </span>
                        ) : (
                          <span className={itemIsLoss ? 'text-rose-400' : 'text-emerald-400 font-medium'}>
                            {itemIsLoss ? '🔴 Rugi: ' : '🟢 Laba: '}
                            {formatRupiah(itemProfit)}
                          </span>
                        )}
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
              {totalOmzet === 0 ? (
                <div className="flex justify-between items-center pt-1 border-t border-zinc-700 text-blue-300">
                  <span className="font-semibold flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span>Status Transaksi Internal PT:</span>
                  </span>
                  <span className="font-mono font-bold text-blue-300">
                    Beban Operasional PT ({formatRupiah(totalModalHpp)})
                  </span>
                </div>
              ) : (
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
              )}
              <div className="flex justify-between items-center text-base font-bold text-zinc-100 pt-1.5 border-t border-zinc-700">
                <span>Total Tagihan:</span>
                <span className={`font-mono text-lg font-bold ${totalOmzet === 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                  {totalOmzet === 0 ? 'Rp 0 (Pemakaian Internal PT)' : formatRupiah(totalOmzet)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="p-4 space-y-3 border-t border-zinc-800 text-xs">
              <div className="flex items-center justify-between">
                <label className="block font-bold text-zinc-300 uppercase tracking-wider text-[11px]">
                  3. Metode Pembayaran <span className="text-rose-400">*</span>
                </label>
                {totalOmzet === 0 && (
                  <span className="text-[10px] text-blue-300 font-semibold bg-blue-950 px-2 py-0.5 rounded border border-blue-800">
                    Tagihan Rp 0 (Internal PT)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setMetode('TUNAI')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all cursor-pointer ${
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
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all cursor-pointer ${
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
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all cursor-pointer ${
                    metode === 'KASBON'
                      ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
                  }`}
                >
                  Kasbon (Bon)
                </button>

                <button
                  type="button"
                  onClick={() => setMetode('INTERNAL_PT')}
                  className={`py-2 px-2 text-center rounded-lg font-semibold border transition-all cursor-pointer ${
                    metode === 'INTERNAL_PT'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-750'
                  }`}
                >
                  🏢 Internal PT (Rp 0)
                </button>
              </div>

              {metode === 'INTERNAL_PT' && (
                <div className="p-2.5 bg-blue-950/70 rounded-lg border border-blue-800 text-[11px] text-blue-200 space-y-1">
                  <div className="font-bold flex items-center space-x-1.5 text-blue-100">
                    <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>Pemakaian Sendiri untuk Kebutuhan Operasional PT (Harga Rp 0)</span>
                  </div>
                  <p className="text-[10px] text-blue-300 leading-relaxed">
                    Barang toko dikeluarkan untuk operasional kebun / kantor PT Wijaya Agro tanpa penerimaan uang kas. Stok fisik gudang tetap dipotong secara akurat dan modal HPP barang ({formatRupiah(totalModalHpp)}) dibukukan sebagai beban operasional perusahaan.
                  </p>
                </div>
              )}

              {metode === 'TRANSFER' && (
                <div className="space-y-1.5 p-2.5 bg-zinc-800 rounded-lg border border-zinc-700 text-[11px]">
                  <label className="block font-semibold text-zinc-300">
                    Pilih Rekening Bank Perusahaan (Uang Riil Masuk):
                  </label>
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
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Penjualan Kasbon (Piutang Customer/Karyawan)</span>
                  </div>
                  <p>
                    Barang keluar dan stok berkurang. Mitra memiliki kewajiban piutang kasbon barang (BON01).
                  </p>
                </div>
              )}

              <ArusKasDivisiSelectorCard
                direction="MASUK"
                metode={totalOmzet === 0 && metode !== 'KASBON' ? 'INTERNAL_PT' : metode}
                nominal={totalOmzet}
                divisi={divisi}
                divisiOptions={divisiOptions}
                onChangeDivisi={setDivisi}
                rekeningList={rekeningList}
                theme="dark"
                onDivisiCreated={onRefresh}
              />

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Catatan Nota / Transaksi</label>
                <input
                  type="text"
                  placeholder="Keterangan keperluan barang, lokasi kebun, atau kesepakatan nego..."
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <button
                type="button"
                disabled={effectiveSaleItems.length === 0 || submitting}
                onClick={handleOpenConfirmSale}
                className={`w-full py-2.5 disabled:opacity-50 text-white font-bold text-sm rounded-lg shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  metode === 'INTERNAL_PT' || totalOmzet === 0
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {metode === 'INTERNAL_PT' || totalOmzet === 0
                    ? `Simpan Pengeluaran Internal PT (${effectiveSaleItems.length} Item)`
                    : `Simpan Transaksi (${formatRupiah(totalOmzet)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Riwayat Transaksi Penjualan Kasir Terbaru + Opsi Edit Detail */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                Riwayat Transaksi Penjualan Kasir Terbaru
              </h2>
              <p className="text-[11px] text-zinc-400">
                Klik tombol Edit Detail untuk mengoreksi qty barang, harga jual satuan, metode bayar, atau pembeli.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {penjualanList.length} Transaksi
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300 border-collapse">
            <thead className="bg-zinc-950/70 border-b border-zinc-800 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="py-2.5 px-3">No. Nota</th>
                <th className="py-2.5 px-3">Waktu</th>
                <th className="py-2.5 px-3">Pembeli / Mitra</th>
                <th className="py-2.5 px-3">Rincian Item</th>
                <th className="py-2.5 px-3 text-right">Total Nilai</th>
                <th className="py-2.5 px-3 text-center">Metode</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {penjualanList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    Belum ada transaksi penjualan kasir tercatat.
                  </td>
                </tr>
              ) : (
                penjualanList.slice(0, 25).map((pj) => (
                  <tr key={pj.noPenjualan} className="hover:bg-zinc-800/40">
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-400 whitespace-nowrap">
                      {pj.noPenjualan}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-zinc-400 whitespace-nowrap">
                      {pj.tanggal} <span className="text-[10px] text-zinc-500">{pj.jam}</span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-zinc-100">{pj.namaMitra}</td>
                    <td className="py-2.5 px-3 text-zinc-300">
                      {(pj.items || [])
                        .map((it) => `${it.namaProduk} (${it.qty} ${it.satuan})`)
                        .join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-amber-400 whitespace-nowrap">
                      {formatRupiah(pj.totalNominal)}
                    </td>
                    <td className="py-2.5 px-3 text-center text-[11px] font-semibold text-zinc-300 whitespace-nowrap">
                      <div>
                        {pj.metode} ({pj.rekeningTujuan})
                      </div>
                      {pj.divisi && (
                        <div className="text-[10px] text-sky-400 font-medium mt-0.5">{pj.divisi}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditTxId(pj.noPenjualan)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Edit Detail</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal with Profit Preview + Double-Check Verifikasi */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="bg-zinc-900 rounded-xl shadow-2xl w-full max-w-lg my-auto max-h-[92vh] flex flex-col overflow-hidden border border-zinc-800">
            <div
              className={`p-4 text-white font-bold text-sm flex justify-between items-center shrink-0 ${
                metode === 'INTERNAL_PT' || totalOmzet === 0 ? 'bg-blue-700' : 'bg-emerald-700'
              }`}
            >
              <span>
                {metode === 'INTERNAL_PT' || totalOmzet === 0
                  ? 'Verifikasi & Konfirmasi Pengeluaran Internal PT'
                  : 'Verifikasi & Konfirmasi Penjualan Kasir'}
              </span>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs text-zinc-300 overflow-y-auto">
              <div className="p-3 bg-zinc-800/80 rounded-lg border border-zinc-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Tipe Pembeli:</span>
                  <span className="font-bold text-amber-400">{tipePembeli}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Penerima / Pemakai:</span>
                  <span className="font-bold text-zinc-100">{finalBuyerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Metode Transaksi:</span>
                  <span className={`font-bold ${metode === 'INTERNAL_PT' || totalOmzet === 0 ? 'text-blue-400' : 'text-emerald-400'}`}>
                    {metode === 'INTERNAL_PT' || totalOmzet === 0 ? '🏢 PEMAKAIAN KEBUTUHAN INTERNAL PT (RP 0)' : metode}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Total Modal HPP:</span>
                  <span className="font-mono tabular-nums text-zinc-300">{formatRupiah(totalModalHpp)}</span>
                </div>
                {metode === 'INTERNAL_PT' || totalOmzet === 0 ? (
                  <div className="flex justify-between pt-1 border-t border-zinc-700 text-blue-300">
                    <span className="font-semibold">Alokasi Biaya:</span>
                    <span className="font-bold">Beban Operasional PT Wijaya Agro</span>
                  </div>
                ) : (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Estimasi Laba Kotor:</span>
                    <span className={`font-mono tabular-nums font-bold ${totalLabaKotor >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {totalLabaKotor >= 0 ? '+' : ''}
                      {formatRupiah(totalLabaKotor)} ({Math.round(persentaseMargin)}%)
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-zinc-700">
                  <span className="text-zinc-300 font-bold">Total Nilai Penjualan:</span>
                  <span className={`font-bold text-sm font-mono tabular-nums ${totalOmzet === 0 ? 'text-blue-400' : 'text-amber-400'}`}>
                    {totalOmzet === 0 ? 'Rp 0 (Pemakaian Internal PT)' : formatRupiah(totalOmzet)}
                  </span>
                </div>
              </div>

              {/* Panel Double-Check Verifikasi Uang Riil & Divisi Terkait */}
              <DoubleCheckVerifikasiPanel
                direction="MASUK"
                metode={totalOmzet === 0 && metode !== 'KASBON' ? 'INTERNAL_PT' : metode}
                nominal={totalOmzet}
                rekeningList={rekeningList}
                selectedTransferKode={rekeningTujuan}
                onChangeTransferKode={setRekeningTujuan}
                divisi={divisi}
                divisiOptions={divisiOptions}
                onChangeDivisi={setDivisi}
                verified={verifiedDoubleCheck}
                onToggleVerified={setVerifiedDoubleCheck}
                theme="dark"
              />

              <p className="text-[11px] text-zinc-400">
                Stok barang akan otomatis berkurang secara realtime di gudang. Transaksi dicatat resmi di pembukuan dan audit log.
              </p>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 rounded-md font-medium cursor-pointer"
                >
                  Batal / Cek Lagi
                </button>
                <button
                  type="button"
                  disabled={submitting || !verifiedDoubleCheck}
                  onClick={handleProcessSubmit}
                  className={`px-4 py-1.5 text-white font-bold rounded-md shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                    metode === 'INTERNAL_PT' || totalOmzet === 0
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {submitting ? 'Memproses...' : 'Ya, Simpan Transaksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal Edit Detail Penjualan */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="PENJUALAN"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
        }}
      />
    </div>
  );
};
