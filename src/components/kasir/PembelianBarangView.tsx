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
  Pencil,
} from 'lucide-react';
import { Mitra, Produk, Rekening, StokBarang, TransaksiPembelianBarang } from '../../server/types.ts';
import { formatRupiah } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import { findSimilarMitra, useFuzzyMitraMatches } from '../../utils/nameSimilarity.ts';
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
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
  onOpenLabaRugi?: () => void;
  onNavigateToPenjualan?: () => void;
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
  hppLama: number;
  estimasiHppBaru: number;
}

export const PembelianBarangView: React.FC<Props> = ({
  produkList,
  stokList,
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
  onOpenLabaRugi,
  onNavigateToPenjualan,
}) => {
  // Suppliers list (Role SUPPLIER, ANAK_PERUSAHAAN, or ALL)
  const supplierList = mitraList.filter(
    (m) =>
      (m.role === 'SUPPLIER' || m.role === 'ALL' || m.role === 'ANAK_PERUSAHAAN' || m.isAnakPerusahaan) &&
      m.status === 'AKTIF'
  );

  const availableBanks = React.useMemo(
    () => rekeningList.filter(isRealTransferBankAccount),
    [rekeningList]
  );
  const divisiOptions = useDivisiOptions();
  const kasAccount = rekeningList.find((r) => r.kode === 'KAS01');

  // Mode Distributor: Registered partner or Manual text for non-fixed distributor
  const [distributorMode, setDistributorMode] = useState<'TERDAFTAR' | 'MANUAL'>('TERDAFTAR');
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    supplierList[0]?.id || mitraList[0]?.id || ''
  );
  const [manualDistributorNama, setManualDistributorNama] = useState<string>('');

  const [dismissedDistributorWarning, setDismissedDistributorWarning] = useState<string>('');

  // Non-blocking fuzzy name matching & duplicate prevention (lag-free typing)
  const similarDistributors = useFuzzyMitraMatches(manualDistributorNama, mitraList);

  const isCurrentDistributorWarningDismissed =
    dismissedDistributorWarning.length > 0 &&
    dismissedDistributorWarning.toLowerCase() === manualDistributorNama.trim().toLowerCase();
  const [noFakturSupplier, setNoFakturSupplier] = useState<string>('');
  const [metode, setMetode] = useState<'TUNAI' | 'TRANSFER' | 'HUTANG'>('TUNAI');
  const [rekeningSumber, setRekeningSumber] = useState<string>(
    availableBanks[0]?.kode || 'BNI01'
  );
  const [divisi, setDivisi] = useState<string>('CV Wijaya Agro');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoNota, setFotoNota] = useState<string>('');

  // Default wajib RINCIAN agar pembelian barang otomatis menambah stok gudang & memperbarui HPP dari modal beli
  const [entryMode, setEntryMode] = useState<'REKAPAN' | 'RINCIAN'>('RINCIAN');
  const [judulRekapan, setJudulRekapan] = useState<string>('');
  const [totalNominalRekapan, setTotalNominalRekapan] = useState<number>(0);
  const [previewFotoNotaModal, setPreviewFotoNotaModal] = useState<string | null>(null);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState<string>('');

  // Cart Kulakan State (tanpa angka default karangan)
  const [cart, setCart] = useState<CartKulakanItem[]>([]);
  const [selectedProductCode, setSelectedProductCode] = useState<string>(
    produkList[0]?.kode || ''
  );
  const [qtyInput, setQtyInput] = useState<number>(0);
  const [hargaBeliInput, setHargaBeliInput] = useState<number>(
    produkList[0]?.hargaBeli || 0
  );
  const [hargaJualBaru, setHargaJualBaru] = useState<number>(
    produkList[0]?.hargaJual || produkList[0]?.hargaBeli || 0
  );
  const [hargaRekananBaru, setHargaRekananBaru] = useState<number>(
    produkList[0]?.hargaKhususRekanan || produkList[0]?.hargaJual || produkList[0]?.hargaBeli || 0
  );
  const [customJualTouched, setCustomJualTouched] = useState<boolean>(
    Boolean(produkList[0]?.hargaJual && produkList[0].hargaJual !== produkList[0]?.hargaBeli)
  );
  const [customRekananTouched, setCustomRekananTouched] = useState<boolean>(
    Boolean(produkList[0]?.hargaKhususRekanan && produkList[0].hargaKhususRekanan !== produkList[0]?.hargaBeli)
  );

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [verifiedDoubleCheck, setVerifiedDoubleCheck] = useState(false);
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
  const [dismissedSupplierModalWarning, setDismissedSupplierModalWarning] = useState('');
  const quickModalSimilarSuppliers = useFuzzyMitraMatches(newSupplierNama, mitraList);

  // Quick Add Product Modal State (tanpa harga/qty karangan)
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newProdKode, setNewProdKode] = useState('');
  const [newProdNama, setNewProdNama] = useState('');
  const [newProdKategori, setNewProdKategori] = useState('');
  const [newProdSatuan, setNewProdSatuan] = useState('SAK');
  const [newProdHargaBeli, setNewProdHargaBeli] = useState<number>(0);
  const [newProdHargaJual, setNewProdHargaJual] = useState<number>(0);
  const [newProdHargaRekanan, setNewProdHargaRekanan] = useState<number>(0);
  const [newProdQtyKulakan, setNewProdQtyKulakan] = useState<number>(0);
  const [submittingProduct, setSubmittingProduct] = useState(false);

  // Purchase History & Cancellation State
  const [historyPembelian, setHistoryPembelian] = useState<TransaksiPembelianBarang[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<TransaksiPembelianBarang | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  // Active products & dynamic categories
  const activeProducts = produkList.filter((p) => p.status === 'AKTIF');
  const existingCategories = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of produkList) {
      const clean = String(p.kategori || '')
        .trim()
        .replace(/_/g, ' ')
        .toUpperCase();
      if (clean) set.add(clean);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [produkList]);

  // Keep rekeningSumber valid for TRANSFER (never stuck on KAS01)
  React.useEffect(() => {
    if (availableBanks.length > 0 && !availableBanks.some((b) => b.kode === rekeningSumber)) {
      setRekeningSumber(availableBanks[0].kode);
    }
  }, [rekeningList, rekeningSumber]);

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
    const trimmed = newSupplierNama.trim();
    if (!trimmed) return;

    const similar = findSimilarMitra(trimmed, mitraList);
    const highRisk = similar.find((s) => s.isHighRiskDuplicate || s.matchType === 'PHONETIC' || s.similarity >= 80);
    const isDismissed =
      dismissedSupplierModalWarning.length > 0 &&
      dismissedSupplierModalWarning.toLowerCase() === trimmed.toLowerCase();

    if (highRisk && !isDismissed) {
      setErrorMsg(
        `⚠️ Peringatan Duplikasi Nama: Di database sudah ada Mitra "${highRisk.mitra.nama}" (${highRisk.mitra.kode}). Jika ini distributor yang sama, pilih akun yang sudah ada agar pencatatan hutang/faktur tidak terpecah! Jika yakin beda, klik 'Bukan, Ini Orang Berbeda' lalu simpan kembali.`
      );
      return;
    }

    setSubmittingSupplier(true);
    setErrorMsg('');
    try {
      const created = await api.createMitra({
        nama: trimmed,
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
      const cleanKategori = (newProdKategori.trim() || existingCategories[0] || 'LAINNYA').toUpperCase();
      const createdRes = await api.createProduk({
        kode: cleanKode,
        nama: newProdNama.trim(),
        kategori: cleanKategori,
        satuan: newProdSatuan.trim() || 'Sak',
        hargaBeli: Math.max(0, newProdHargaBeli),
        hargaJual: Math.max(0, newProdHargaJual),
        hargaKhususRekanan: Math.max(0, newProdHargaRekanan),
        stokAwal: 0,
        status: 'AKTIF',
      });
      const created = createdRes?.produk || createdRes;

      // If user specified an initial kulakan qty, directly put into Cart!
      if (newProdQtyKulakan > 0 && created.hargaBeli > 0) {
        const modalBeli = created.hargaBeli;
        setCart((prev) => [
          ...prev,
          {
            kodeProduk: created.kode,
            nama: created.nama,
            satuan: created.satuan,
            qty: newProdQtyKulakan,
            hargaBeliSatuan: modalBeli,
            subtotal: newProdQtyKulakan * modalBeli,
            sesuaikanHargaJual: created.hargaJual || modalBeli,
            sesuaikanHargaRekanan: created.hargaKhususRekanan || created.hargaJual || modalBeli,
            stokSaatIni: 0,
            hppLama: 0,
            estimasiHppBaru: modalBeli,
          },
        ]);
        setSuccessInfo(`Produk "${created.nama}" [${created.kategori}] berhasil dibuat dan dimasukkan ke keranjang pembelian (${newProdQtyKulakan} ${created.satuan})!`);
      } else {
        setSuccessInfo(`Produk "${created.nama}" [${created.kategori}] berhasil dibuat & siap dibeli!`);
      }
      setTimeout(() => setSuccessInfo(''), 5000);

      setShowAddProductModal(false);
      setNewProdKode('');
      setNewProdNama('');
      setNewProdKategori('');
      setNewProdHargaBeli(0);
      setNewProdHargaJual(0);
      setNewProdHargaRekanan(0);
      setNewProdQtyKulakan(0);
      setSelectedProductCode(created.kode);
      setHargaBeliInput(created.hargaBeli || 0);
      setHargaJualBaru(created.hargaJual || created.hargaBeli || 0);
      setHargaRekananBaru(created.hargaKhususRekanan || created.hargaJual || created.hargaBeli || 0);
      setCustomJualTouched(Boolean(created.hargaJual && created.hargaJual !== created.hargaBeli));
      setCustomRekananTouched(Boolean(created.hargaKhususRekanan && created.hargaKhususRekanan !== created.hargaBeli));
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mendaftarkan produk baru');
    } finally {
      setSubmittingProduct(false);
    }
  };

  const loadHistory = async (silentArg?: boolean | React.MouseEvent) => {
    const silent = silentArg === true;
    if (!silent && historyPembelian.length === 0) setLoadingHistory(true);
    try {
      const data = await api.getPembelianBarang();
      setHistoryPembelian(data);
    } catch (err) {
      console.error('Error loading history pembelian:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load history on mount & auto-refresh on ERP updates
  React.useEffect(() => {
    loadHistory(false);
    const onErpUpdated = () => loadHistory(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  const currentProduct = activeProducts.find(
    (p) => String(p.kode || '').trim().toUpperCase() === String(selectedProductCode || '').trim().toUpperCase()
  );
  const currentStok = stokList.find(
    (s) => String(s.kode || '').trim().toUpperCase() === String(selectedProductCode || '').trim().toUpperCase()
  );

  const stokGudangSaatIni = Math.max(0, Number(currentStok?.stok) || 0);
  const hppLamaProduk = Math.max(0, Number(currentProduct?.hargaBeli) || 0);

  // Kalkulasi HPP Baru murni dari Modal Pembelian (Rata-rata tertimbang jika stok gudang > 0, atau 100% modal beli baru jika stok 0)
  const computeHppDariModal = (stokLama: number, hppLama: number, qtyBeli: number, modalSatuan: number): number => {
    if (modalSatuan <= 0) return hppLama;
    if (stokLama > 0 && hppLama > 0 && qtyBeli > 0) {
      return Math.round((stokLama * hppLama + qtyBeli * modalSatuan) / (stokLama + qtyBeli));
    }
    return Math.round(modalSatuan);
  };

  const estimasiHppBaruForm = computeHppDariModal(
    stokGudangSaatIni,
    hppLamaProduk,
    qtyInput,
    hargaBeliInput
  );

  // When selected product changes, load only real stored purchase/catalog prices (0 if never purchased)
  const handleProductSelect = (code: string) => {
    setSelectedProductCode(code);
    const prod = produkList.find(
      (p) => String(p.kode || '').trim().toUpperCase() === String(code || '').trim().toUpperCase()
    );
    if (prod) {
      const modal = prod.hargaBeli || 0;
      const jual = prod.hargaJual || modal || 0;
      const rekanan = prod.hargaKhususRekanan || jual || modal || 0;
      setHargaBeliInput(modal);
      setHargaJualBaru(jual);
      setHargaRekananBaru(rekanan);
      setCustomJualTouched(Boolean(prod.hargaJual && prod.hargaJual > 0 && prod.hargaJual !== modal));
      setCustomRekananTouched(Boolean(prod.hargaKhususRekanan && prod.hargaKhususRekanan > 0 && prod.hargaKhususRekanan !== modal));
    }
  };

  const handleHargaBeliChange = (val: number) => {
    const cleanModal = Math.max(0, val);
    setHargaBeliInput(cleanModal);
    const nextHpp = computeHppDariModal(stokGudangSaatIni, hppLamaProduk, qtyInput > 0 ? qtyInput : 1, cleanModal);
    if (!customJualTouched) {
      setHargaJualBaru(nextHpp);
    }
    if (!customRekananTouched) {
      setHargaRekananBaru(nextHpp);
    }
  };

  const buildPendingCartItem = (): CartKulakanItem | null => {
    if (entryMode !== 'RINCIAN' || !currentProduct || qtyInput <= 0 || hargaBeliInput <= 0) {
      return null;
    }
    const nextHpp = computeHppDariModal(stokGudangSaatIni, hppLamaProduk, qtyInput, hargaBeliInput);
    const finalJual = hargaJualBaru > 0 ? hargaJualBaru : nextHpp;
    const finalRekanan = hargaRekananBaru > 0 ? hargaRekananBaru : finalJual;
    return {
      kodeProduk: currentProduct.kode,
      nama: currentProduct.nama,
      satuan: currentProduct.satuan,
      qty: qtyInput,
      hargaBeliSatuan: hargaBeliInput,
      subtotal: Math.round(qtyInput * hargaBeliInput),
      sesuaikanHargaJual: finalJual,
      sesuaikanHargaRekanan: finalRekanan,
      stokSaatIni: stokGudangSaatIni,
      hppLama: hppLamaProduk,
      estimasiHppBaru: nextHpp,
    };
  };

  const handleAddToCart = () => {
    setErrorMsg('');
    if (!selectedProductCode || !currentProduct) {
      setErrorMsg('Pilih produk yang ingin dibeli/dikulak');
      return;
    }
    if (qtyInput <= 0) {
      setErrorMsg('Jumlah kuantitas beli harus lebih dari 0');
      return;
    }
    if (hargaBeliInput <= 0) {
      setErrorMsg('Harga beli satuan (modal pembelian) harus lebih dari Rp 0');
      return;
    }

    const existingIndex = cart.findIndex(
      (i) => String(i.kodeProduk).trim().toUpperCase() === String(currentProduct.kode).trim().toUpperCase()
    );

    if (existingIndex >= 0) {
      const updated = [...cart];
      const newQty = updated[existingIndex].qty + qtyInput;
      const nextHpp = computeHppDariModal(stokGudangSaatIni, hppLamaProduk, newQty, hargaBeliInput);
      const finalJual = hargaJualBaru > 0 ? hargaJualBaru : nextHpp;
      const finalRekanan = hargaRekananBaru > 0 ? hargaRekananBaru : finalJual;
      updated[existingIndex] = {
        ...updated[existingIndex],
        qty: newQty,
        hargaBeliSatuan: hargaBeliInput,
        subtotal: Math.round(newQty * hargaBeliInput),
        sesuaikanHargaJual: finalJual,
        sesuaikanHargaRekanan: finalRekanan,
        estimasiHppBaru: nextHpp,
      };
      setCart(updated);
    } else {
      const pending = buildPendingCartItem();
      if (pending) {
        setCart([...cart, pending]);
      }
    }

    // Reset qty ke 0 setelah masuk keranjang agar tidak ada angka gantung
    setQtyInput(0);
  };

  const handleRemoveFromCart = (code: string) => {
    setCart(cart.filter((item) => item.kodeProduk !== code));
  };

  const pendingItemPreview = cart.length === 0 ? buildPendingCartItem() : null;
  const effectiveItemsForTotal = cart.length > 0 ? cart : pendingItemPreview ? [pendingItemPreview] : [];
  const totalBelanjaKulakan =
    entryMode === 'REKAPAN'
      ? Math.max(0, Number(totalNominalRekapan) || 0)
      : effectiveItemsForTotal.reduce((sum, item) => sum + item.subtotal, 0);

  const handleOpenConfirmModal = () => {
    setErrorMsg('');
    if (distributorMode === 'MANUAL' && !manualDistributorNama.trim()) {
      setErrorMsg('Nama distributor / pemasok manual wajib diisi pada bagian 1');
      return;
    }
    if (distributorMode === 'TERDAFTAR' && !selectedSupplierId) {
      setErrorMsg('Pilih distributor / supplier pemasok barang pada bagian 1');
      return;
    }
    if (metode === 'TRANSFER' && (!rekeningSumber || rekeningSumber === 'KAS01')) {
      setErrorMsg('Pilih rekening bank sumber dana transfer terlebih dahulu');
      return;
    }

    if (entryMode === 'RINCIAN') {
      // Jika kasir sudah mengisi form barang (Qty & Harga Beli > 0) dan langsung klik Simpan tanpa klik "+ Masukkan Keranjang", masukkan otomatis!
      if (cart.length === 0) {
        const autoItem = buildPendingCartItem();
        if (!autoItem) {
          setErrorMsg('Isi Jumlah Qty Beli & Harga Beli Satuan (Modal) terlebih dahulu untuk menambah stok barang.');
          return;
        }
        setCart([autoItem]);
        setQtyInput(0);
      }
    } else {
      if ((Number(totalNominalRekapan) || 0) <= 0) {
        setErrorMsg('Total nominal rekapan nota pembelian harus lebih dari Rp 0');
        return;
      }
    }

    setVerifiedDoubleCheck(false);
    setShowConfirmModal(true);
  };

  const handleProcessSubmit = async () => {
    const itemsToSubmit = cart.length > 0 ? cart : buildPendingCartItem() ? [buildPendingCartItem()!] : [];

    if (entryMode === 'RINCIAN' && itemsToSubmit.length === 0) {
      setErrorMsg('Keranjang pembelian barang distributor masih kosong. Isi Qty & Harga Beli produk terlebih dahulu.');
      return;
    }
    if (entryMode === 'REKAPAN' && (Number(totalNominalRekapan) || 0) <= 0) {
      setErrorMsg('Total nominal pembelian nota rekapan harus lebih dari Rp 0');
      return;
    }
    if (!verifiedDoubleCheck) {
      setErrorMsg('Harap centang verifikasi rekening sumber uang riil & divisi terkait terlebih dahulu.');
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
      const isRekap = entryMode === 'REKAPAN' && itemsToSubmit.length === 0;
      const validRekeningTransfer =
        availableBanks.find((b) => b.kode === rekeningSumber)?.kode || availableBanks[0]?.kode || rekeningSumber;

      const record = await api.processPembelianBarang({
        idMitra: distributorMode === 'TERDAFTAR' ? selectedSupplierId : undefined,
        namaDistributorManual: distributorMode === 'MANUAL' ? manualDistributorNama.trim() : undefined,
        noFakturSupplier,
        divisi,
        metodePembayaran: metode,
        rekeningSumber: metode === 'TRANSFER' ? validRekeningTransfer : undefined,
        fotoNota: fotoNota || undefined,
        isRekapanGlobal: isRekap,
        judulRekapan: isRekap ? (judulRekapan.trim() || `Rekapan Nota Pembelian Supplier (${supplierNameDisplay})`) : undefined,
        totalNominalRekapan: isRekap ? totalNominalRekapan : undefined,
        items: !isRekap
          ? itemsToSubmit.map((i) => ({
              kodeProduk: i.kodeProduk,
              qty: i.qty,
              hargaBeliSatuan: i.hargaBeliSatuan,
              sesuaikanHargaJual: i.sesuaikanHargaJual,
              sesuaikanHargaRekanan: i.sesuaikanHargaRekanan,
            }))
          : undefined,
        keterangan:
          keterangan ||
          (isRekap
            ? `Rekapan Nota Pembelian dari Distributor ${supplierNameDisplay}`
            : `Pembelian stok barang dari distributor ${supplierNameDisplay} (${itemsToSubmit.length} produk)`),
      });

      const receipt: ReceiptData = {
        title: isRekap ? 'NOTA REKAPAN PEMBELIAN SUPPLIER' : 'NOTA PEMBELIAN DARI DISTRIBUTOR / PEMASOK',
        subtitle: `Distributor: ${record?.namaMitra || supplierNameDisplay} | Divisi: ${record?.divisi || divisi}`,
        nomorTransaksi: record?.noPembelian || `PB-${Date.now().toString().slice(-4)}`,
        tanggal: record?.tanggal || new Date().toISOString().split('T')[0],
        jam: record?.jam || '00:00:00',
        mitra: record?.namaMitra || supplierNameDisplay,
        rekening: record?.rekeningSumber,
        kategori: 'PEMBELIAN_BARANG',
        fotoNota: record?.fotoNota || fotoNota,
        items: (record?.items || []).map((it) => ({
          nama: it?.namaProduk || '-',
          qty: it?.qty ?? 0,
          satuan: it?.satuan || 'SAK',
          harga: it?.hargaBeliSatuan ?? 0,
          subtotal: it?.subtotal ?? 0,
        })),
        detailRows: [
          { label: 'Distributor / Pemasok', value: `${record?.namaMitra || supplierNameDisplay} ${distributorMode === 'MANUAL' ? '(Non-Tetap)' : '(Terdaftar)'}` },
          { label: 'Divisi Terkait', value: record?.divisi || divisi },
          { label: 'No Faktur / Surat Jalan', value: record?.noFakturSupplier || '-' },
          { label: 'Tipe Input', value: isRekap ? 'Rekapan Nota Global (Tanpa Stok)' : 'Rincian Produk Satuan (+Stok Gudang & HPP)' },
          { label: 'Lampiran Foto Fisik', value: (record?.fotoNota || fotoNota) ? 'Tersimpan di Sistem' : 'Tidak Ada' },
          { label: 'Metode Pembayaran', value: record?.metodePembayaran || metode },
          { label: 'Rekening Uang Riil', value: record?.rekeningSumber || '-' },
          { label: 'Status Pembayaran', value: record?.status || 'LUNAS', highlight: true },
          { label: 'Total Pembelian', value: record?.totalNominal ?? 0, isTotal: true },
        ],
        catatan: `Faktur: ${record?.noFakturSupplier || '-'} | ${record?.keterangan || ''}`,
        kasir: 'Pengadaan Wijaya Agro',
      };

      const ringkasanStok = !isRekap
        ? (record?.items || [])
            .map((it) => `${it.namaProduk}: +${it.qty} ${it.satuan} (Stok gudang kini ${it.stokSetelah} ${it.satuan})`)
            .join(' • ')
        : '';

      setCart([]);
      setQtyInput(0);
      setTotalNominalRekapan(0);
      setJudulRekapan('');
      setManualDistributorNama('');
      setNoFakturSupplier('');
      setKeterangan('');
      setFotoNota('');
      setVerifiedDoubleCheck(false);
      setShowConfirmModal(false);
      if (ringkasanStok) {
        setSuccessInfo(`Pembelian berhasil disimpan! Stok bertambah & siap dijual di Kasir Penjualan: ${ringkasanStok}`);
      } else {
        setSuccessInfo(`Rekapan nota pembelian ${record.noPembelian} berhasil disimpan.`);
      }
      onRefresh();
      loadHistory();
      try {
        onSuccess(receipt);
      } catch (err) {
        console.warn('onSuccess callback error in PembelianBarangView:', err);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses transaksi pembelian barang');
      setShowConfirmModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoidPembelian = async (noPembelian: string) => {
    setVoidingId(noPembelian);
    setErrorMsg('');
    try {
      await api.deletePembelianBarang(noPembelian);
      setConfirmVoidId(null);
      if (selectedDetail?.noPembelian === noPembelian) {
        setSelectedDetail(null);
      }
      setSuccessInfo(`Transaksi ${noPembelian} berhasil dibatalkan. Saldo rekening & stok gudang telah dikembalikan.`);
      onRefresh();
      await loadHistory();
    } catch (err: any) {
      setErrorMsg(err.message || `Gagal membatalkan transaksi ${noPembelian}`);
      setConfirmVoidId(null);
    } finally {
      setVoidingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-900 p-5 rounded-xl border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <PackagePlus className="w-6 h-6 text-amber-400" />
            <h1 className="text-xl font-bold text-zinc-100">Pembelian Barang dari Distributor &amp; Pemasok</h1>
            <span className="text-xs bg-amber-950 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-800">
              STOK &amp; MODAL HPP RIIL
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Catat pembelian barang dagang (Beras, Pupuk, Material, dll.) dari Pemasok. Otomatis menambah stok gudang untuk Kasir Penjualan serta menghitung HPP murni dari modal pembelian (tanpa angka karangan).
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {onNavigateToPenjualan && (
            <button
              type="button"
              onClick={onNavigateToPenjualan}
              className="flex items-center space-x-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Buka Kasir Penjualan →</span>
            </button>
          )}
          {onOpenLabaRugi && (
            <button
              type="button"
              onClick={onOpenLabaRugi}
              className="flex items-center space-x-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <TrendingUp className="w-4 h-4 text-emerald-300" />
              <span>Lihat Laba-Rugi →</span>
            </button>
          )}
        </div>
      </div>

      {successInfo && (
        <div className="p-3.5 bg-emerald-950/90 border border-emerald-500 rounded-xl text-xs text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-md">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successInfo}</span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            {onNavigateToPenjualan && (
              <button
                type="button"
                onClick={onNavigateToPenjualan}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-[11px] cursor-pointer"
              >
                Jual Barang di Kasir Penjualan →
              </button>
            )}
            <button onClick={() => setSuccessInfo('')} className="text-emerald-400 hover:text-white text-xs cursor-pointer px-1">
              ✕
            </button>
          </div>
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
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
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
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    distributorMode === 'MANUAL'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Input Manual (Bebas)
                </button>
              </div>
            </div>

            {/* Entry Mode Switcher: Default RINCIAN (Menambah Stok & HPP), Opsional REKAPAN */}
            <div className="bg-zinc-800/90 p-3 rounded-xl border border-emerald-500/40 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-300 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Pilih Mode Input Pembelian:</span>
                </span>
                <div className="flex items-center space-x-1 bg-zinc-900 p-1 rounded-lg border border-zinc-700 text-xs">
                  <button
                    type="button"
                    onClick={() => setEntryMode('RINCIAN')}
                    className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      entryMode === 'RINCIAN'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Rincian Produk Satuan (+Stok &amp; HPP)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMode('REKAPAN')}
                    className={`px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                      entryMode === 'REKAPAN'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Rekapan Nota Global (Tanpa Stok)
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-300">
                {entryMode === 'RINCIAN'
                  ? 'Mode Utama: Setiap barang yang dibeli otomatis menambah stok gudang, siap dijual di Kasir Penjualan, dan HPP dihitung murni dari modal pembelian.'
                  : 'Perhatian: Mode Rekapan Global hanya mencatat total rupiah tagihan nota tanpa menambah stok barang per item.'}
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

                  {/* Supplier search box */}
                  <div className="relative mb-1.5">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Ketik cari nama / kode supplier..."
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
                      placeholder="Contoh: UD Padi Rejeki, Filly Kirana, CV Beras Makmur..."
                      className="w-full bg-zinc-800 border border-amber-500/80 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-400 placeholder:text-zinc-500 font-medium"
                    />
                  </div>

                  {/* Advanced Fuzzy Name Suggestion & Anti-Duplicate Warning */}
                  <FuzzyNameWarningCard
                    inputName={manualDistributorNama}
                    matches={similarDistributors}
                    contextLabel="Distributor / Supplier"
                    theme="dark"
                    isDismissed={isCurrentDistributorWarningDismissed}
                    onDismissDifferentPerson={() => setDismissedDistributorWarning(manualDistributorNama.trim())}
                    onSelectRegistered={(m) => {
                      setDistributorMode('TERDAFTAR');
                      setSelectedSupplierId(m.id);
                    }}
                    onApplyCorrectedName={(corrected) => {
                      setManualDistributorNama(corrected);
                    }}
                  />

                  {manualDistributorNama.trim().length >= 2 && similarDistributors.length === 0 && (
                    <div className="p-2 bg-emerald-950/40 border border-emerald-800/80 rounded-lg text-[11px] text-emerald-300 flex items-center space-x-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Nama <strong>"{manualDistributorNama}"</strong> dicatat sebagai pemasok manual.
                      </span>
                    </div>
                  )}
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
                  placeholder="Contoh: INV-LPN-8910 / SJ-2026/10"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                />
              </div>

              {/* Insert Image Nota / Faktur */}
              <div className="sm:col-span-2 pt-1 border-t border-zinc-800">
                <ImageUploadZone
                  label="Sisipkan / Upload Foto Nota Fisik Asli (Opsional)"
                  sublabel="Foto struk, surat jalan, atau nota tagihan fisik dari pemasok"
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
                  className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold cursor-pointer ${
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
                  onClick={() => {
                    setMetode('TRANSFER');
                    if (!availableBanks.some((b) => b.kode === rekeningSumber) && availableBanks[0]) {
                      setRekeningSumber(availableBanks[0].kode);
                    }
                  }}
                  className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold cursor-pointer ${
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
                  className={`p-2.5 rounded-lg border text-center transition-all text-xs font-semibold cursor-pointer ${
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
                    Pilih Rekening Bank Sumber Uang Riil
                  </label>
                  <select
                    value={rekeningSumber}
                    onChange={(e) => setRekeningSumber(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  >
                    {availableBanks.map((b) => (
                      <option key={b.kode} value={b.kode}>
                        {b.nama} ({b.kode})
                        {b.isAnakPerusahaan || b.kategori === 'ANAK_PERUSAHAAN' || b.kode === 'REK-DPPARABO'
                          ? ' [Anak Perusahaan & Mitra - 1 Transaksi]'
                          : ''}{' '}
                        - Saldo: {formatRupiah(b.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-3">
                <ArusKasDivisiSelectorCard
                  direction="KELUAR"
                  transactionKind="MODAL_PEMBELIAN"
                  metode={metode}
                  nominal={totalBelanjaKulakan}
                  divisi={divisi}
                  divisiOptions={divisiOptions}
                  onChangeDivisi={setDivisi}
                  rekeningList={rekeningList}
                  theme="dark"
                  onDivisiCreated={onRefresh}
                />
              </div>
            </div>
          </div>

          {/* Card #2: RINCIAN PRODUK SATUAN vs REKAPAN NOTA GLOBAL */}
          {entryMode === 'RINCIAN' ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-400" />
                  <span>2. Tambah Barang yang Dikulak</span>
                </div>
                <span className="text-[11px] text-emerald-400 font-semibold">
                  Stok otomatis bertambah &amp; siap dijual
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
                      Belum ada produk barang terdaftar di toko.
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
                      const s = stokList.find(
                        (item) => String(item.kode || '').trim().toUpperCase() === String(p.kode || '').trim().toUpperCase()
                      );
                      const stokNow = s?.stok || 0;
                      const hppInfo = p.hargaBeli > 0 ? formatRupiah(p.hargaBeli) : 'Belum ada modal beli';
                      return (
                        <option key={p.kode} value={p.kode}>
                          [{p.kategori}] {p.nama} — Stok saat ini: {stokNow} {p.satuan} | HPP: {hppInfo}
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
                      {stokGudangSaatIni} {currentProduct.satuan}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">HPP Modal Saat Ini</span>
                    <span className="font-semibold text-zinc-300 font-mono">
                      {hppLamaProduk > 0 ? formatRupiah(hppLamaProduk) : 'Rp 0 (Belum Kulak)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 text-[10px] block">Sugesti Jual Saat Ini</span>
                    <span className="font-semibold text-amber-300 font-mono">
                      {currentProduct.hargaJual > 0 ? formatRupiah(currentProduct.hargaJual) : 'Rp 0 (Ikut Modal)'}
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
                      placeholder="Contoh: 50"
                      value={qtyInput === 0 ? '' : qtyInput}
                      onChange={(e) => setQtyInput(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                    />
                    <span className="absolute right-3 top-2 text-xs text-zinc-400 pointer-events-none">
                      {currentProduct?.satuan}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Harga Beli Satuan / Modal Pembelian <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">Rp</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Contoh: 154500"
                      value={hargaBeliInput === 0 ? '' : hargaBeliInput}
                      onChange={(e) => handleHargaBeliChange(e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Live HPP Calculation strictly from Modal Pembelian */}
              {hargaBeliInput > 0 && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/70 rounded-lg text-[11px] text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div>
                    <span className="font-bold text-emerald-300">HPP Baru dari Modal Pembelian: </span>
                    <span className="font-mono font-extrabold text-white">{formatRupiah(estimasiHppBaruForm)}</span>
                    <span className="text-emerald-300/80"> / {currentProduct?.satuan}</span>
                  </div>
                  <span className="text-[10px] text-zinc-400">
                    {stokGudangSaatIni > 0 && hppLamaProduk > 0 && qtyInput > 0
                      ? `Rata-rata tertimbang (${stokGudangSaatIni} stok lama + ${qtyInput} beli baru)`
                      : '100% sesuai harga modal pembelian pemasok'}
                  </span>
                </div>
              )}

              {/* Suggested Selling Prices anchored strictly to Modal HPP */}
              <div className="p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/60 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-xs font-semibold text-zinc-300 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sugesti Harga Jual Kasir (Dihitung dari Modal HPP {formatRupiah(estimasiHppBaruForm)})</span>
                  </span>
                  {estimasiHppBaruForm > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setHargaJualBaru(estimasiHppBaruForm);
                        setHargaRekananBaru(estimasiHppBaruForm);
                        setCustomJualTouched(false);
                        setCustomRekananTouched(false);
                      }}
                      className="text-[10px] text-amber-300 hover:underline cursor-pointer"
                    >
                      Samakan dengan Modal HPP
                    </button>
                  )}
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
                        min="0"
                        placeholder={estimasiHppBaruForm > 0 ? String(estimasiHppBaruForm) : '0'}
                        value={hargaJualBaru === 0 ? '' : hargaJualBaru}
                        onChange={(e) => {
                          setCustomJualTouched(true);
                          setHargaJualBaru(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)));
                        }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                    {estimasiHppBaruForm > 0 && hargaJualBaru > 0 && (
                      <span
                        className={`text-[10px] mt-0.5 block font-medium ${
                          hargaJualBaru >= estimasiHppBaruForm ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {hargaJualBaru >= estimasiHppBaruForm
                          ? `Selisih di atas HPP: +${formatRupiah(hargaJualBaru - estimasiHppBaruForm)} (+${Math.round(
                              ((hargaJualBaru - estimasiHppBaruForm) / estimasiHppBaruForm) * 100
                            )}% dari modal)`
                          : `Di bawah modal HPP: -${formatRupiah(estimasiHppBaruForm - hargaJualBaru)}`}
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
                        min="0"
                        placeholder={estimasiHppBaruForm > 0 ? String(estimasiHppBaruForm) : '0'}
                        value={hargaRekananBaru === 0 ? '' : hargaRekananBaru}
                        onChange={(e) => {
                          setCustomRekananTouched(true);
                          setHargaRekananBaru(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)));
                        }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-zinc-200 font-mono"
                      />
                    </div>
                    {estimasiHppBaruForm > 0 && hargaRekananBaru > 0 && (
                      <span
                        className={`text-[10px] mt-0.5 block font-medium ${
                          hargaRekananBaru >= estimasiHppBaruForm ? 'text-sky-400' : 'text-rose-400'
                        }`}
                      >
                        {hargaRekananBaru >= estimasiHppBaruForm
                          ? `Selisih Rekanan: +${formatRupiah(hargaRekananBaru - estimasiHppBaruForm)} (+${Math.round(
                              ((hargaRekananBaru - estimasiHppBaruForm) / estimasiHppBaruForm) * 100
                            )}% dari modal)`
                          : `Di bawah modal HPP: -${formatRupiah(estimasiHppBaruForm - hargaRekananBaru)}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Subtotal preview & Add Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div>
                  <span className="text-xs text-zinc-400">Subtotal Item Ini:</span>
                  <span className="ml-2 text-base font-bold text-amber-400 font-mono">
                    {formatRupiah(qtyInput * hargaBeliInput)}
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold ml-2">
                    (Stok gudang: {stokGudangSaatIni} → {stokGudangSaatIni + qtyInput} {currentProduct?.satuan})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Masukkan Keranjang Kulakan</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-amber-700/70 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  <span>2. Input Rekapan Nota Global (Tanpa Rincian Stok)</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setEntryMode('RINCIAN')}
                  className="text-[11px] text-emerald-400 hover:underline font-bold cursor-pointer"
                >
                  Ganti ke Rincian Produk (+Stok) →
                </button>
              </div>

              <div className="p-3 bg-amber-950/50 border border-amber-700/70 rounded-lg text-xs text-amber-200">
                <strong>Catatan Penting:</strong> Mode Rekapan Global tidak menambah stok produk satuan di gudang. Jika Anda membeli Beras/Pupuk/Barang untuk dijual kembali di Kasir Penjualan, gunakan <strong>Mode Rincian Produk Satuan</strong>.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Judul / Keterangan Nota Rekapan
                  </label>
                  <input
                    type="text"
                    value={judulRekapan}
                    onChange={(e) => setJudulRekapan(e.target.value)}
                    placeholder="Contoh: Nota Tagihan Gabungan Supplier"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Total Nominal Tagihan Nota <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-zinc-400 font-mono">Rp</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Masukkan total sesuai nota asli"
                      value={totalNominalRekapan === 0 ? '' : totalNominalRekapan}
                      onChange={(e) => setTotalNominalRekapan(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                      className="w-full bg-zinc-800 border border-amber-500 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-100 font-mono font-bold focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Cart Kulakan & Confirmation (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-amber-400" />
                  <span>
                    {entryMode === 'REKAPAN'
                      ? 'Ringkasan Rekapan Nota'
                      : `Daftar Keranjang Kulakan (${effectiveItemsForTotal.length} Item)`}
                  </span>
                </h3>
                {cart.length > 0 && entryMode === 'RINCIAN' && (
                  <button
                    onClick={() => setCart([])}
                    className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {entryMode === 'REKAPAN' ? (
                <div className="p-4 bg-zinc-800/70 border border-amber-700/50 rounded-lg space-y-2 text-xs">
                  <div className="font-semibold text-amber-300">
                    {judulRekapan.trim() || 'Rekapan Nota Pembelian Supplier'}
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Total tagihan: <span className="font-mono font-bold text-zinc-100">{formatRupiah(totalNominalRekapan)}</span>
                  </div>
                  <div className="text-[10px] text-amber-400">
                    Stok barang satuan tidak bertambah pada mode ini.
                  </div>
                </div>
              ) : cart.length === 0 && pendingItemPreview ? (
                <div className="space-y-2">
                  <div className="p-3 bg-emerald-950/40 border border-emerald-700/70 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        Siap Disimpan Langsung (Dari Form Kiri)
                      </span>
                      <span className="text-[10px] bg-emerald-900/80 text-emerald-200 px-2 py-0.5 rounded font-mono">
                        +{pendingItemPreview.qty} {pendingItemPreview.satuan}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-zinc-100">{pendingItemPreview.nama}</div>
                    <div className="text-[11px] text-zinc-300 font-mono">
                      {pendingItemPreview.qty} {pendingItemPreview.satuan} × {formatRupiah(pendingItemPreview.hargaBeliSatuan)} ={' '}
                      <span className="text-amber-400 font-bold">{formatRupiah(pendingItemPreview.subtotal)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 flex flex-wrap gap-x-3">
                      <span>
                        Stok: {pendingItemPreview.stokSaatIni} →{' '}
                        <strong className="text-emerald-400">
                          {pendingItemPreview.stokSaatIni + pendingItemPreview.qty} {pendingItemPreview.satuan}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        HPP Baru: <strong className="text-zinc-200">{formatRupiah(pendingItemPreview.estimasiHppBaru)}</strong>
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      Sugesti Jual Umum: <strong className="text-amber-300">{formatRupiah(pendingItemPreview.sesuaikanHargaJual)}</strong> | Rekanan:{' '}
                      <strong className="text-sky-300">{formatRupiah(pendingItemPreview.sesuaikanHargaRekanan)}</strong>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400">
                    Klik <strong>Simpan Transaksi Pembelian Kulakan</strong> di bawah untuk langsung menyimpan stok ini, atau klik <strong>+ Masukkan Keranjang Kulakan</strong> jika ingin menambah beberapa jenis barang sekaligus.
                  </p>
                </div>
              ) : cart.length === 0 ? (
                <div className="text-center py-10 text-zinc-500 text-xs">
                  <PackagePlus className="w-10 h-10 mx-auto text-zinc-700 mb-2" />
                  <p>Keranjang kulakan masih kosong.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    Pilih produk, isi Jumlah Qty Beli &amp; Harga Beli Satuan di sebelah kiri.
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
                        <div className="text-[10px] text-zinc-400 mt-1 flex flex-wrap gap-x-2">
                          <span>
                            Stok: {item.stokSaatIni} →{' '}
                            <span className="text-emerald-400 font-semibold">
                              {item.stokSaatIni + item.qty} {item.satuan}
                            </span>
                          </span>
                          <span>•</span>
                          <span>
                            HPP Baru: <span className="text-zinc-200 font-mono">{formatRupiah(item.estimasiHppBaru)}</span>
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">
                          Jual Umum: {formatRupiah(item.sesuaikanHargaJual)} | Rekanan: {formatRupiah(item.sesuaikanHargaRekanan)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveFromCart(item.kodeProduk)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded-sm transition-colors cursor-pointer"
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
                  placeholder="Contoh: Pembelian beras 50 sak dari pemasok"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>
            </div>

            {/* Bottom Total & Action */}
            <div className="mt-5 pt-4 border-t border-zinc-800 space-y-3">
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
                    ? `Transfer Bank (${rekeningSumber})`
                    : 'Hutang Usaha (TIT01)'}
                </span>
              </div>

              <button
                type="button"
                disabled={
                  submitting ||
                  (entryMode === 'RINCIAN' ? effectiveItemsForTotal.length === 0 : totalNominalRekapan <= 0)
                }
                onClick={handleOpenConfirmModal}
                className={`w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-2 ${
                  submitting ||
                  (entryMode === 'RINCIAN' ? effectiveItemsForTotal.length === 0 : totalNominalRekapan <= 0)
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-amber-600 hover:bg-amber-500 text-white shadow-md cursor-pointer'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Transaksi Pembelian Kulakan</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal with Double-Check Verifikasi */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full my-auto max-h-[92vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <PackagePlus className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Verifikasi &amp; Konfirmasi Pembelian Kulakan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-zinc-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-zinc-800 p-3 rounded-lg space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Pemasok / Supplier:</span>
                <span className="font-semibold text-zinc-100">
                  {distributorMode === 'MANUAL'
                    ? `${manualDistributorNama.trim()} (Manual)`
                    : mitraList.find((m) => m.id === selectedSupplierId)?.nama || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">No Faktur:</span>
                <span className="font-mono text-zinc-200">{noFakturSupplier || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Mode Input:</span>
                <span className="font-semibold text-emerald-400">
                  {entryMode === 'RINCIAN' ? `Rincian Produk (${cart.length} Item)` : 'Rekapan Nota Global'}
                </span>
              </div>
              {entryMode === 'RINCIAN' && cart.length > 0 && (
                <div className="pt-2 border-t border-zinc-700 space-y-1">
                  {cart.map((it) => (
                    <div key={it.kodeProduk} className="flex justify-between text-[11px]">
                      <span className="text-zinc-200">
                        {it.nama} ({it.qty} {it.satuan})
                      </span>
                      <span className="text-emerald-400 font-mono tabular-nums">
                        Stok: {it.stokSaatIni} → {it.stokSaatIni + it.qty}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-zinc-700 font-bold">
                <span className="text-zinc-300">Total Pembelian:</span>
                <span className="text-amber-400 font-mono tabular-nums text-sm">
                  {formatRupiah(totalBelanjaKulakan)}
                </span>
              </div>
            </div>

            {/* Panel Double-Check Verifikasi Uang Riil & Divisi Terkait */}
            <DoubleCheckVerifikasiPanel
              direction="KELUAR"
              transactionKind="MODAL_PEMBELIAN"
              metode={metode}
              nominal={totalBelanjaKulakan}
              rekeningList={rekeningList}
              selectedTransferKode={rekeningSumber}
              onChangeTransferKode={setRekeningSumber}
              divisi={divisi}
              divisiOptions={divisiOptions}
              onChangeDivisi={setDivisi}
              verified={verifiedDoubleCheck}
              onToggleVerified={setVerifiedDoubleCheck}
              theme="dark"
            />

            <p className="text-[11px] text-zinc-400">
              {entryMode === 'RINCIAN'
                ? 'Stok produk akan langsung ditambahkan ke gudang dan siap dijual di Kasir Penjualan. HPP & sugesti harga diperbarui sesuai modal pembelian ini.'
                : 'Tagihan rekapan akan dicatat tanpa menambah stok barang satuan.'}
            </p>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Batal / Cek Lagi
              </button>
              <button
                type="button"
                disabled={submitting || !verifiedDoubleCheck}
                onClick={handleProcessSubmit}
                className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
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
              Daftar faktur pembelian stok toko dan beras dari distributor/pemasok. Anda dapat membatalkan transaksi yang salah input.
            </p>
          </div>

          <button
            onClick={loadHistory}
            className="text-xs text-emerald-400 hover:underline self-start sm:self-auto font-semibold cursor-pointer"
          >
            ↻ Segarkan Riwayat
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-800/80 text-[11px] uppercase tracking-wider text-zinc-400 font-semibold border-b border-zinc-700">
              <tr>
                <th className="py-2.5 px-3">No. Pembelian</th>
                <th className="py-2.5 px-3">Tanggal &amp; Jam</th>
                <th className="py-2.5 px-3">Supplier</th>
                <th className="py-2.5 px-3">Daftar Produk &amp; Stok</th>
                <th className="py-2.5 px-3">Metode / Rek</th>
                <th className="py-2.5 px-3 text-right">Total Nilai</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {historyPembelian.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500 font-sans text-xs">
                    Belum ada data pembelian barang tercatat.
                  </td>
                </tr>
              ) : (
                historyPembelian.map((pb) => {
                  const isRekapRow = pb.items.some((i) => i.kodeProduk === 'REKAP-NOTA');
                  return (
                    <tr key={pb.noPembelian} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-zinc-200">{pb.noPembelian}</td>
                      <td className="py-2.5 px-3 font-sans text-zinc-400">
                        {pb.tanggal} <span className="text-[10px] text-zinc-500">{pb.jam}</span>
                      </td>
                      <td className="py-2.5 px-3 font-sans font-semibold text-zinc-200">
                        {pb.namaMitra}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-zinc-300">
                        <div className="truncate max-w-[250px]">
                          {pb.items.map((i) => `${i.namaProduk} (${i.qty} ${i.satuan})`).join(', ')}
                        </div>
                        {isRekapRow && (
                          <span className="text-[10px] text-amber-400">Rekapan Tanpa Stok</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {pb.metodePembayaran} ({pb.rekeningSumber || '-'})
                        </span>
                        {pb.divisi && (
                          <div className="text-[10px] text-sky-400 font-medium mt-0.5">
                            {pb.divisi}
                          </div>
                        )}
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
                        {confirmVoidId === pb.noPembelian ? (
                          <div className="inline-flex items-center space-x-1">
                            <button
                              type="button"
                              disabled={voidingId === pb.noPembelian}
                              onClick={() => handleVoidPembelian(pb.noPembelian)}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              {voidingId === pb.noPembelian ? '...' : 'Ya, Hapus'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmVoidId(null)}
                              className="px-2 py-1 bg-zinc-700 text-zinc-200 rounded text-[10px] cursor-pointer"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => setEditTxId(pb.noPembelian)}
                              className="inline-flex items-center space-x-1 px-2 py-1 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white border border-amber-500/40 rounded text-[11px] font-semibold transition-colors cursor-pointer"
                              title="Edit qty barang, harga modal beli, atau rekening"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDetail(pb)}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              Rincian
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmVoidId(pb.noPembelian)}
                              className="px-2 py-1 bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/70 rounded text-[11px] font-medium transition-colors cursor-pointer"
                              title="Batalkan transaksi & kembalikan saldo"
                            >
                              Hapus
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
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
                className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer"
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
                <span className="text-zinc-500 text-[10px] block">Metode &amp; Rekening</span>
                <span className="font-bold text-amber-400">
                  {selectedDetail.metodePembayaran} ({selectedDetail.rekeningSumber || '-'})
                </span>
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

            <div className="flex items-center gap-2">
              {confirmVoidId === selectedDetail.noPembelian ? (
                <>
                  <button
                    type="button"
                    disabled={voidingId === selectedDetail.noPembelian}
                    onClick={() => handleVoidPembelian(selectedDetail.noPembelian)}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                  >
                    {voidingId === selectedDetail.noPembelian
                      ? 'Membatalkan...'
                      : 'Konfirmasi Batalkan & Kembalikan Saldo'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmVoidId(null)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Tidak Jadi
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const no = selectedDetail.noPembelian;
                      setSelectedDetail(null);
                      setEditTxId(no);
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Detail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmVoidId(selectedDetail.noPembelian)}
                    className="px-4 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Batalkan Transaksi Salah
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(null)}
                    className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold cursor-pointer"
                  >
                    Tutup Rincian
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Tambah Supplier Baru Cepat (Scrollable Up/Down & Left/Right) */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto overflow-x-auto flex items-start sm:items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-lg w-full my-auto max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Tambah Distributor / Supplier Baru</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSupplierModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs cursor-pointer px-1"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={handleQuickAddSupplier}
              className="p-6 space-y-3.5 text-xs flex-1 overflow-y-auto overflow-x-auto overscroll-contain"
            >
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

                {/* Advanced Fuzzy Name Suggestion & Anti-Duplicate Warning */}
                <FuzzyNameWarningCard
                  inputName={newSupplierNama}
                  matches={quickModalSimilarSuppliers}
                  contextLabel="Distributor / Supplier"
                  theme="dark"
                  isDismissed={
                    dismissedSupplierModalWarning.length > 0 &&
                    dismissedSupplierModalWarning.toLowerCase() === newSupplierNama.trim().toLowerCase()
                  }
                  onDismissDifferentPerson={() => setDismissedSupplierModalWarning(newSupplierNama.trim())}
                  onSelectRegistered={(m) => {
                    setSelectedSupplierId(m.id);
                    setDistributorMode('TERDAFTAR');
                    setShowAddSupplierModal(false);
                  }}
                  onApplyCorrectedName={(corrected) => {
                    setNewSupplierNama(corrected);
                  }}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-zinc-300 font-semibold">
                      Kategori Barang <span className="text-rose-400">*</span>
                    </label>
                    <span className="text-[10px] text-amber-400">Ketik sendiri / pilih</span>
                  </div>
                  <input
                    type="text"
                    required
                    list="kulakan-kategori-datalist"
                    placeholder="Ketik kategori riil (misal: MATERIAL BANGUNAN, KOPI OLAHAN)..."
                    value={newProdKategori}
                    onChange={(e) => setNewProdKategori(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-semibold"
                  />
                  <datalist id="kulakan-kategori-datalist">
                    {existingCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                  {existingCategories.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mt-1.5">
                      {existingCategories.slice(0, 5).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setNewProdKategori(cat)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer ${
                            newProdKategori.trim().toUpperCase() === cat
                              ? 'bg-amber-600 text-white border-amber-500 font-bold'
                              : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Satuan Kemasan <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="kulakan-satuan-datalist"
                    placeholder="Ketik satuan (Sak / Kg / Kemasan / Meter Kubik...)"
                    value={newProdSatuan}
                    onChange={(e) => setNewProdSatuan(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500"
                  />
                  <datalist id="kulakan-satuan-datalist">
                    {['Sak', 'Kg', 'Kemasan', 'Botol', 'Meter Kubik', 'Biji/Buah', 'Drigent', 'Dus', 'Liter', 'Pack'].map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Harga Beli / Modal (HPP)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Contoh: 154500"
                    value={newProdHargaBeli === 0 ? '' : newProdHargaBeli}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                      setNewProdHargaBeli(val);
                    }}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono font-bold"
                  />
                  <span className="text-[10px] text-zinc-400">Modal beli riil dari pemasok</span>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Sugesti Jual Umum
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={newProdHargaBeli > 0 ? String(newProdHargaBeli) : 'Sesuai modal'}
                    value={newProdHargaJual === 0 ? '' : newProdHargaJual}
                    onChange={(e) => setNewProdHargaJual(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-zinc-400">Kosongkan = ikut modal HPP</span>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Sugesti Harga Rekanan
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder={newProdHargaJual > 0 ? String(newProdHargaJual) : newProdHargaBeli > 0 ? String(newProdHargaBeli) : 'Sesuai modal'}
                    value={newProdHargaRekanan === 0 ? '' : newProdHargaRekanan}
                    onChange={(e) => setNewProdHargaRekanan(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                  <span className="text-[10px] text-zinc-400">Kosongkan = ikut sugesti umum</span>
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
                      placeholder="0"
                      value={newProdQtyKulakan === 0 ? '' : newProdQtyKulakan}
                      onChange={(e) => setNewProdQtyKulakan(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                      className="w-20 bg-zinc-900 border border-amber-500 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-mono font-bold text-center"
                    />
                    <span className="text-xs text-zinc-300 font-semibold">{newProdSatuan}</span>
                  </div>
                </div>
                <p className="text-[10px] text-zinc-400">
                  Jika diisi &gt; 0 beserta Harga Beli, produk langsung masuk ke keranjang pembelian dan menambah stok gudang.
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

      {/* Modal Universal Edit Detail Pembelian Barang */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="PEMBELIAN_BARANG"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          onRefresh();
          loadHistory();
        }}
      />
    </div>
  );
};
