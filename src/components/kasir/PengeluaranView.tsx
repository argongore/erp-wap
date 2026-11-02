import React, { useState, useEffect, useMemo } from 'react';
import {
  Receipt,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Truck,
  Building,
  Coffee,
  Wrench,
  Search,
  Wallet,
  Camera,
  Layers,
  Scale,
  X,
  Landmark,
  Pencil,
  Fuel,
} from 'lucide-react';
import {
  TransaksiPengeluaran,
  Rekening,
  ItemInventaris,
  Karyawan,
  KategoriInventaris,
  MasterItemPengeluaran,
  DAFTAR_24_ITEM_PENGELUARAN,
  KelompokItemPengeluaran,
  resolveKelompokItemPengeluaran,
  getNomorUrutItemPengeluaran,
} from '../../server/types.ts';
import { formatRupiah, formatRupiahSingkat, getWIBTodayString } from '../../utils/format.ts';
import { api } from '../../api/client.ts';
import { FotoNotaPreviewModal } from '../common/FotoNotaPreviewModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import {
  KATEGORI_INVENTARIS_LABELS,
  getPajakStatusInfo,
} from '../master/MasterInventarisView.tsx';
import { resolveDivisiAccount } from '../common/DoubleCheckVerifikasiPanel.tsx';

interface Props {
  rekeningList: Rekening[];
  inventarisList?: ItemInventaris[];
  karyawanList?: Karyawan[];
  preselectedInventarisId?: string | null;
  onClearPreselectedInventaris?: () => void;
  onOpenInventarisMenu?: () => void;
  onRefresh: () => void;
}

const DEFAULT_DIVISI = [
  'Wijaya Transport',
  'Gudang Wijaya Agro',
  'Wijaya Karya',
  'PT Wijaya Agro Perkasa',
  'CV Wijaya Agro',
  'Okussa',
  'BRILink',
];

interface RecapRowItem {
  nomorUrut: number;
  nama: string;
  kelompok: KelompokItemPengeluaran;
  satuanDefault?: string;
  netNominal: number;
  count: number;
}

function normalizeCompact(str: string): string {
  return String(str || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export const PengeluaranView: React.FC<Props> = ({
  rekeningList,
  inventarisList = [],
  karyawanList = [],
  preselectedInventarisId,
  onClearPreselectedInventaris,
  onOpenInventarisMenu,
  onRefresh,
}) => {
  const [list, setList] = useState<TransaksiPengeluaran[]>([]);
  const [localInventaris, setLocalInventaris] = useState<ItemInventaris[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submittingKelompok, setSubmittingKelompok] = useState<KelompokItemPengeluaran | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Custom divisions state with localStorage persistence
  const [customDivisi, setCustomDivisi] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('wijaya_agro_custom_divisi');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [showAddDivisiModal, setShowAddDivisiModal] = useState<boolean>(false);
  const [newDivisiName, setNewDivisiName] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; ket: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  const allDivisiList = useMemo(() => {
    const set = new Set<string>(DEFAULT_DIVISI);
    customDivisi.forEach((d) => set.add(d));
    list.forEach((item) => {
      if (item.divisi) set.add(item.divisi);
    });
    return Array.from(set);
  }, [customDivisi, list]);

  // Master 24 Item Pengeluaran (+ item tambahan jika ada)
  const [masterItems, setMasterItems] = useState<MasterItemPengeluaran[]>([]);
  const [showAddMasterItemModal, setShowAddMasterItemModal] = useState<boolean>(false);
  const [newMasterItemName, setNewMasterItemName] = useState<string>('');
  const [newMasterItemKelompok, setNewMasterItemKelompok] =
    useState<KelompokItemPengeluaran>('INVENTARIS');
  const [newMasterItemSatuan, setNewMasterItemSatuan] = useState<string>('');
  const [newMasterItemKet, setNewMasterItemKet] = useState<string>('');
  const [savingMasterItem, setSavingMasterItem] = useState<boolean>(false);

  // Filter states
  const [filterKategoriItem, setFilterKategoriItem] = useState<string>('ALL');
  const [filterKelompok, setFilterKelompok] = useState<'ALL' | KelompokItemPengeluaran>('ALL');
  const [filterDivisi, setFilterDivisi] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ============================================================================
  // FORM 1 (WARNA HIJAU): PENGELUARAN UNTUK INVENTARIS (ITEM 1 - 16)
  // ============================================================================
  const [invKategori, setInvKategori] = useState<string>('L300');
  const [invDivisi, setInvDivisi] = useState<string>('Wijaya Transport');
  const [invArahMutasi, setInvArahMutasi] = useState<'TAMBAH' | 'KURANG'>('TAMBAH');
  const [invQty, setInvQty] = useState<string>('');
  const [invSatuan, setInvSatuan] = useState<string>('PCS');
  const [invHargaSatuan, setInvHargaSatuan] = useState<string>('');
  const [invNominal, setInvNominal] = useState<string>('');
  const [invKeterangan, setInvKeterangan] = useState<string>('');
  const [invRekeningSumber, setInvRekeningSumber] = useState<string>('KAS01');
  const [invSelectedUnitId, setInvSelectedUnitId] = useState<string>('');
  const [invPenerimaManual, setInvPenerimaManual] = useState<string>('');
  const [invTanggal, setInvTanggal] = useState<string>(getWIBTodayString());
  const [invFotoKuitansi, setInvFotoKuitansi] = useState<string>('');

  // ============================================================================
  // FORM 2 (WARNA ORANYE): PENGELUARAN BIASA / HARIAN (ITEM 17 - 24)
  // ============================================================================
  const [biasaKategori, setBiasaKategori] = useState<string>('SOLAR');
  const [biasaDivisi, setBiasaDivisi] = useState<string>('Gudang Wijaya Agro');
  const [biasaArahMutasi, setBiasaArahMutasi] = useState<'TAMBAH' | 'KURANG'>('TAMBAH');
  const [biasaQty, setBiasaQty] = useState<string>('');
  const [biasaSatuan, setBiasaSatuan] = useState<string>('LITER');
  const [biasaHargaSatuan, setBiasaHargaSatuan] = useState<string>('');
  const [biasaNominal, setBiasaNominal] = useState<string>('');
  const [biasaKeterangan, setBiasaKeterangan] = useState<string>('');
  const [biasaRekeningSumber, setBiasaRekeningSumber] = useState<string>('KAS01');
  const [biasaPenerima, setBiasaPenerima] = useState<string>('');
  const [biasaTanggal, setBiasaTanggal] = useState<string>(getWIBTodayString());
  const [biasaFotoKuitansi, setBiasaFotoKuitansi] = useState<string>('');

  // Quick Add Inventaris Modal inside Pengeluaran
  const [showQuickAddInventaris, setShowQuickAddInventaris] = useState<boolean>(false);
  const [quickInvKategori, setQuickInvKategori] = useState<KategoriInventaris>('TRUCK_ANGKUTAN');
  const [quickInvNama, setQuickInvNama] = useState<string>('');
  const [quickInvPlat, setQuickInvPlat] = useState<string>('');
  const [quickInvDriver, setQuickInvDriver] = useState<string>('');
  const [quickInvTahun, setQuickInvTahun] = useState<string>(String(new Date().getFullYear()));
  const [quickInvPajak, setQuickInvPajak] = useState<string>('');
  const [quickInvMerk, setQuickInvMerk] = useState<string>('');
  const [quickInvSaving, setQuickInvSaving] = useState<boolean>(false);
  const [quickInvError, setQuickInvError] = useState<string>('');

  // Preview Photo Modal
  const [previewPhoto, setPreviewPhoto] = useState<{
    imageUrl: string;
    title: string;
    nomorBukti?: string;
    namaMitra?: string;
    tanggal?: string;
    nominalText?: string;
    keterangan?: string;
  } | null>(null);

  const mergedInventarisList = useMemo(() => {
    const map = new Map<string, ItemInventaris>();
    inventarisList.forEach((i) => map.set(i.id, i));
    localInventaris.forEach((i) => map.set(i.id, i));
    return Array.from(map.values()).filter((i) => i.status === 'AKTIF');
  }, [inventarisList, localInventaris]);

  const selectedInvUnitObj = useMemo(
    () => mergedInventarisList.find((i) => i.id === invSelectedUnitId) || null,
    [mergedInventarisList, invSelectedUnitId]
  );

  useEffect(() => {
    api
      .getInventaris()
      .then((res) => setLocalInventaris(res || []))
      .catch(() => {});
  }, []);

  // Auto-match inventaris unit when invKategori changes
  const findMatchingInventarisUnit = (kategoriName: string): ItemInventaris | undefined => {
    const target = normalizeCompact(kategoriName);
    if (!target) return undefined;
    return mergedInventarisList.find((unit) => {
      const plat = normalizeCompact(unit.nomorPlat || '');
      const nama = normalizeCompact(unit.namaItem || '');
      return (
        (plat && (plat === target || plat.includes(target) || target.includes(plat))) ||
        (nama && (nama === target || nama.includes(target) || target.includes(nama)))
      );
    });
  };

  useEffect(() => {
    if (preselectedInventarisId) {
      const target = mergedInventarisList.find((i) => i.id === preselectedInventarisId);
      if (target) {
        setInvSelectedUnitId(target.id);
        if (target.divisi) setInvDivisi(target.divisi);
        // Match canonical 1-16 item if possible
        const platNorm = normalizeCompact(target.nomorPlat || '');
        const namaNorm = normalizeCompact(target.namaItem || '');
        const matchedDef = DAFTAR_24_ITEM_PENGELUARAN.filter(
          (d) => d.kelompok === 'INVENTARIS'
        ).find((d) => {
          const dn = normalizeCompact(d.nama);
          return (
            (platNorm && (dn === platNorm || platNorm.includes(dn))) ||
            (namaNorm && (dn === namaNorm || namaNorm.includes(dn)))
          );
        });
        if (matchedDef) {
          setInvKategori(matchedDef.nama);
        }
        onClearPreselectedInventaris?.();
      }
    }
  }, [preselectedInventarisId, mergedInventarisList, onClearPreselectedInventaris]);

  const loadData = async (silent = false) => {
    if (!silent && list.length === 0) setLoading(true);
    try {
      const [data, divList, masterList] = await Promise.all([
        api.getPengeluaran(),
        api.getDivisi().catch(() => []),
        api.getMasterItemPengeluaran().catch(() => []),
      ]);
      setList(data || []);
      if (Array.isArray(masterList)) {
        setMasterItems(masterList);
      }
      if (Array.isArray(divList) && divList.length > 0) {
        const customNames = divList.filter((d: any) => d.isCustom).map((d: any) => d.nama);
        if (customNames.length > 0) {
          setCustomDivisi((prev) => Array.from(new Set([...prev, ...customNames])));
        }
      }
    } catch (err: any) {
      console.warn('Gagal memuat daftar pengeluaran:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const onErpUpdated = () => loadData(true);
    window.addEventListener('erp:data-updated', onErpUpdated);
    return () => window.removeEventListener('erp:data-updated', onErpUpdated);
  }, []);

  // Build ordered 24 Canonical Items + any custom MasterItems / Historical Categories
  const recapRows = useMemo<RecapRowItem[]>(() => {
    const mapByUpper = new Map<string, RecapRowItem>();

    // 1. Seed exact 24 canonical items first (No 1..16 HIJAU INVENTARIS, No 17..24 ORANYE BIASA)
    for (const def of DAFTAR_24_ITEM_PENGELUARAN) {
      mapByUpper.set(def.nama.toUpperCase(), {
        nomorUrut: def.nomorUrut,
        nama: def.nama,
        kelompok: def.kelompok,
        satuanDefault: def.satuanDefault,
        netNominal: 0,
        count: 0,
      });
    }

    // 2. Merge custom MasterItemPengeluaran if any beyond the 24
    let extraOrder = 25;
    for (const m of masterItems) {
      const key = (m.nama || '').trim().toUpperCase();
      if (!key) continue;
      if (!mapByUpper.has(key)) {
        mapByUpper.set(key, {
          nomorUrut: m.nomorUrut || extraOrder++,
          nama: m.nama.trim().toUpperCase(),
          kelompok: m.kelompok || resolveKelompokItemPengeluaran(m.nama),
          satuanDefault: m.satuanDefault,
          netNominal: 0,
          count: 0,
        });
      }
    }

    // 3. Accumulate transaction totals (respecting filterDivisi if active so Bos can inspect per-divisi or all)
    const relevantTx =
      filterDivisi === 'ALL' ? list : list.filter((t) => t.divisi === filterDivisi);

    for (const tx of relevantTx) {
      const rawKat = (tx.kategori || '').trim();
      if (!rawKat) continue;
      const key = rawKat.toUpperCase();
      const existing = mapByUpper.get(key);
      if (existing) {
        existing.netNominal += Number(tx.nominal) || 0;
        existing.count += 1;
      } else {
        const kel = tx.kelompokPengeluaran || resolveKelompokItemPengeluaran(rawKat);
        mapByUpper.set(key, {
          nomorUrut: getNomorUrutItemPengeluaran(rawKat) ?? extraOrder++,
          nama: rawKat,
          kelompok: kel,
          netNominal: Number(tx.nominal) || 0,
          count: 1,
        });
      }
    }

    return Array.from(mapByUpper.values()).sort((a, b) => a.nomorUrut - b.nomorUrut);
  }, [masterItems, list, filterDivisi]);

  const inventarisItems = useMemo(
    () => recapRows.filter((r) => r.kelompok === 'INVENTARIS'),
    [recapRows]
  );

  const biasaItems = useMemo(
    () => recapRows.filter((r) => r.kelompok === 'BIASA'),
    [recapRows]
  );

  const totalInventarisHijau = useMemo(
    () => inventarisItems.reduce((s, r) => s + r.netNominal, 0),
    [inventarisItems]
  );

  const totalBiasaOranye = useMemo(
    () => biasaItems.reduce((s, r) => s + r.netNominal, 0),
    [biasaItems]
  );

  const totalRecapGrand = useMemo(
    () => recapRows.reduce((s, r) => s + r.netNominal, 0),
    [recapRows]
  );

  const activeCashAccounts = useMemo(
    () =>
      rekeningList.filter(
        (r) => !r.isVirtual && r.kategori !== 'OPERASIONAL_DIVISI' && r.status === 'AKTIF'
      ),
    [rekeningList]
  );

  const handleSelectInvKategori = (katName: string) => {
    setInvKategori(katName);
    const foundDef = inventarisItems.find((i) => i.nama.toUpperCase() === katName.toUpperCase());
    if (foundDef?.satuanDefault) {
      setInvSatuan(foundDef.satuanDefault);
    }
    const matchedUnit = findMatchingInventarisUnit(katName);
    if (matchedUnit) {
      setInvSelectedUnitId(matchedUnit.id);
      if (matchedUnit.divisi) setInvDivisi(matchedUnit.divisi);
    }
  };

  const handleSelectBiasaKategori = (katName: string) => {
    setBiasaKategori(katName);
    const foundDef = biasaItems.find((i) => i.nama.toUpperCase() === katName.toUpperCase());
    if (foundDef?.satuanDefault) {
      setBiasaSatuan(foundDef.satuanDefault);
    }
  };

  const handleInvQtyOrHargaChange = (nextQtyStr: string, nextHargaStr: string) => {
    setInvQty(nextQtyStr);
    setInvHargaSatuan(nextHargaStr);
    const q = Number(nextQtyStr);
    const h = Number(nextHargaStr);
    if (q > 0 && h > 0) {
      setInvNominal(String(Math.round(q * h)));
    }
  };

  const handleBiasaQtyOrHargaChange = (nextQtyStr: string, nextHargaStr: string) => {
    setBiasaQty(nextQtyStr);
    setBiasaHargaSatuan(nextHargaStr);
    const q = Number(nextQtyStr);
    const h = Number(nextHargaStr);
    if (q > 0 && h > 0) {
      setBiasaNominal(String(Math.round(q * h)));
    }
  };

  const handleSubmitFormInventaris = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const nominal = Math.abs(Number(invNominal));
    if (!nominal || nominal <= 0) {
      setErrorMsg('Nominal Pengeluaran Inventaris (Hijau) harus lebih dari Rp 0.');
      return;
    }

    const keteranganFinal =
      invKeterangan.trim() ||
      `Pengeluaran Inventaris ${invKategori}${
        Number(invQty) > 0 ? ` (${invQty} ${invSatuan || 'PCS'})` : ''
      }`;

    const isNonKas = invRekeningSumber === 'SINKRON';
    const selectedRek = isNonKas
      ? undefined
      : rekeningList.find((r) => r.kode === invRekeningSumber);
    const isRekAnak = Boolean(
      selectedRek &&
        (selectedRek.isAnakPerusahaan ||
          selectedRek.kategori === 'ANAK_PERUSAHAAN' ||
          selectedRek.kode === 'REK-DPPARABO')
    );

    if (
      !isNonKas &&
      invArahMutasi === 'TAMBAH' &&
      selectedRek &&
      !isRekAnak &&
      selectedRek.saldoSaatIni < nominal
    ) {
      setErrorMsg(
        `Saldo rekening ${selectedRek.nama} tidak mencukupi (Tersedia: ${formatRupiah(
          selectedRek.saldoSaatIni
        )}).`
      );
      return;
    }

    const unitLabel = selectedInvUnitObj
      ? `${
          selectedInvUnitObj.nomorPlat && selectedInvUnitObj.nomorPlat !== '-'
            ? `${selectedInvUnitObj.nomorPlat} — `
            : ''
        }${selectedInvUnitObj.namaItem}`
      : invPenerimaManual.trim() || invKategori;

    setSubmittingKelompok('INVENTARIS');
    try {
      await api.createPengeluaran({
        divisi: invDivisi,
        kategori: invKategori,
        kelompokPengeluaran: 'INVENTARIS',
        keterangan: keteranganFinal,
        nominal,
        qty: Number(invQty) > 0 ? Number(invQty) : undefined,
        satuan: Number(invQty) > 0 ? invSatuan.trim().toUpperCase() || 'PCS' : undefined,
        hargaSatuan: Number(invHargaSatuan) > 0 ? Number(invHargaSatuan) : undefined,
        arahMutasi: invArahMutasi,
        isNonKas,
        rekeningSumber: invRekeningSumber,
        penerima: unitLabel || undefined,
        idInventaris: invSelectedUnitId || undefined,
        tanggal: invTanggal,
        fotoKuitansi: invFotoKuitansi || undefined,
      });

      setSuccessMsg(
        invArahMutasi === 'KURANG'
          ? `Koreksi Pengeluaran Inventaris (Hijau) "${invKategori}" sebesar −${formatRupiah(nominal)} berhasil disimpan.`
          : `Pengeluaran Inventaris (Hijau) "${invKategori}" sebesar +${formatRupiah(nominal)} berhasil dicatat!`
      );
      setInvQty('');
      setInvHargaSatuan('');
      setInvNominal('');
      setInvKeterangan('');
      setInvPenerimaManual('');
      setInvFotoKuitansi('');
      loadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan pengeluaran inventaris');
    } finally {
      setSubmittingKelompok(null);
    }
  };

  const handleSubmitFormBiasa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const nominal = Math.abs(Number(biasaNominal));
    if (!nominal || nominal <= 0) {
      setErrorMsg('Nominal Pengeluaran Biasa (Oranye) harus lebih dari Rp 0.');
      return;
    }

    const keteranganFinal =
      biasaKeterangan.trim() ||
      `Pengeluaran ${biasaKategori}${
        Number(biasaQty) > 0 ? ` (${biasaQty} ${biasaSatuan || 'PCS'})` : ''
      }`;

    const isNonKas = biasaRekeningSumber === 'SINKRON';
    const selectedRek = isNonKas
      ? undefined
      : rekeningList.find((r) => r.kode === biasaRekeningSumber);
    const isRekAnak = Boolean(
      selectedRek &&
        (selectedRek.isAnakPerusahaan ||
          selectedRek.kategori === 'ANAK_PERUSAHAAN' ||
          selectedRek.kode === 'REK-DPPARABO')
    );

    if (
      !isNonKas &&
      biasaArahMutasi === 'TAMBAH' &&
      selectedRek &&
      !isRekAnak &&
      selectedRek.saldoSaatIni < nominal
    ) {
      setErrorMsg(
        `Saldo rekening ${selectedRek.nama} tidak mencukupi (Tersedia: ${formatRupiah(
          selectedRek.saldoSaatIni
        )}).`
      );
      return;
    }

    setSubmittingKelompok('BIASA');
    try {
      await api.createPengeluaran({
        divisi: biasaDivisi,
        kategori: biasaKategori,
        kelompokPengeluaran: 'BIASA',
        keterangan: keteranganFinal,
        nominal,
        qty: Number(biasaQty) > 0 ? Number(biasaQty) : undefined,
        satuan: Number(biasaQty) > 0 ? biasaSatuan.trim().toUpperCase() || 'PCS' : undefined,
        hargaSatuan: Number(biasaHargaSatuan) > 0 ? Number(biasaHargaSatuan) : undefined,
        arahMutasi: biasaArahMutasi,
        isNonKas,
        rekeningSumber: biasaRekeningSumber,
        penerima: biasaPenerima.trim() || undefined,
        tanggal: biasaTanggal,
        fotoKuitansi: biasaFotoKuitansi || undefined,
      });

      setSuccessMsg(
        biasaArahMutasi === 'KURANG'
          ? `Koreksi Pengeluaran Biasa (Oranye) "${biasaKategori}" sebesar −${formatRupiah(nominal)} berhasil disimpan.`
          : `Pengeluaran Biasa (Oranye) "${biasaKategori}" sebesar +${formatRupiah(nominal)} berhasil dicatat!`
      );
      setBiasaQty('');
      setBiasaHargaSatuan('');
      setBiasaNominal('');
      setBiasaKeterangan('');
      setBiasaPenerima('');
      setBiasaFotoKuitansi('');
      loadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan pengeluaran biasa');
    } finally {
      setSubmittingKelompok(null);
    }
  };

  const handleCreateMasterItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMasterItemName.trim();
    if (!trimmed) return;
    setSavingMasterItem(true);
    setErrorMsg('');
    try {
      const created = await api.createMasterItemPengeluaran({
        nama: trimmed,
        kelompok: newMasterItemKelompok,
        satuanDefault: newMasterItemSatuan.trim() || undefined,
        deskripsi: newMasterItemKet.trim() || undefined,
      });
      setMasterItems((prev) => [...prev, created]);
      if (newMasterItemKelompok === 'INVENTARIS') {
        setInvKategori(created.nama);
      } else {
        setBiasaKategori(created.nama);
      }
      setNewMasterItemName('');
      setNewMasterItemSatuan('');
      setNewMasterItemKet('');
      setShowAddMasterItemModal(false);
      setSuccessMsg(
        `Item Pengeluaran "${created.nama}" (${
          newMasterItemKelompok === 'INVENTARIS' ? 'Hijau - Inventaris' : 'Oranye - Biasa'
        }) berhasil ditambahkan!`
      );
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menambah item pengeluaran baru');
    } finally {
      setSavingMasterItem(false);
    }
  };

  const handleQuickCreateInventaris = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickInvError('');
    if (!quickInvNama.trim()) {
      setQuickInvError('Nama kendaraan / item wajib diisi.');
      return;
    }
    setQuickInvSaving(true);
    try {
      const pajakFormatted =
        quickInvPajak && /^\d{4}-\d{2}-\d{2}$/.test(quickInvPajak)
          ? `${quickInvPajak.slice(8, 10)}/${quickInvPajak.slice(5, 7)}/${quickInvPajak.slice(0, 4)}`
          : quickInvPajak;
      const created = await api.createInventaris({
        namaItem: quickInvNama.trim(),
        kategori: quickInvKategori,
        nomorPlat: quickInvPlat.trim().toUpperCase() || '-',
        merkTipe: quickInvMerk.trim() || '-',
        tahunKeluaran: quickInvTahun.trim() || '-',
        driverPenanggungJawab: quickInvDriver.trim() || '-',
        divisi: invDivisi || 'Wijaya Transport',
        tanggalPajakTahunan: pajakFormatted,
        kondisi: 'BAIK',
      });
      setLocalInventaris((prev) => [created, ...prev]);
      setInvSelectedUnitId(created.id);
      setShowQuickAddInventaris(false);
      setQuickInvNama('');
      setQuickInvPlat('');
      setQuickInvDriver('');
      setQuickInvMerk('');
      setQuickInvPajak('');
      onRefresh();
    } catch (err: any) {
      setQuickInvError(err.message || 'Gagal menambah item inventaris');
    } finally {
      setQuickInvSaving(false);
    }
  };

  const handleDelete = (id: string, ket: string) => {
    setDeleteTarget({ id, ket });
  };

  const executeConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.deletePengeluaran(deleteTarget.id);
      setSuccessMsg('Pengeluaran berhasil dibatalkan dan saldo kas dipulihkan.');
      setDeleteTarget(null);
      loadData();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus pengeluaran');
    } finally {
      setIsDeleting(false);
    }
  };

  const getDivisiTheme = (divisi: string) => {
    const d = divisi.toUpperCase();
    if (d.includes('TRANS')) {
      return {
        icon: Truck,
        bg: 'bg-blue-50/70 border-blue-200 text-blue-900',
        activeBorder: 'border-blue-600 ring-2 ring-blue-500/30 bg-blue-50',
        desc: 'Perbaikan dump/truck, L300, exca, towing & armada',
      };
    }
    if (d.includes('GUDANG') || d === 'GWA') {
      return {
        icon: Coffee,
        bg: 'bg-amber-50/70 border-amber-200 text-amber-900',
        activeBorder: 'border-amber-600 ring-2 ring-amber-500/30 bg-amber-50',
        desc: 'Solar, konsumsi karyawan & logistik gudang',
      };
    }
    if (d.includes('KARYA')) {
      return {
        icon: Wrench,
        bg: 'bg-orange-50/70 border-orange-200 text-orange-900',
        activeBorder: 'border-orange-600 ring-2 ring-orange-500/30 bg-orange-50',
        desc: 'Bahan bangunan, alat proyek & material teknik',
      };
    }
    if (d.includes('BRILINK')) {
      return {
        icon: Wallet,
        bg: 'bg-sky-50/70 border-sky-200 text-sky-900',
        activeBorder: 'border-sky-600 ring-2 ring-sky-500/30 bg-sky-50',
        desc: 'Admin tarik tunai/cash & perbankan operasional',
      };
    }
    if (d.includes('OKUSSA')) {
      return {
        icon: Scale,
        bg: 'bg-purple-50/70 border-purple-200 text-purple-900',
        activeBorder: 'border-purple-600 ring-2 ring-purple-500/30 bg-purple-50',
        desc: 'Timbangan & operasional unit timbang',
      };
    }
    if (d.includes('PT') || d === 'PTWAP') {
      return {
        icon: Landmark,
        bg: 'bg-emerald-50/70 border-emerald-200 text-emerald-900',
        activeBorder: 'border-emerald-600 ring-2 ring-emerald-500/30 bg-emerald-50',
        desc: 'Kantor pusat, manajemen & legalitas',
      };
    }
    if (d.includes('CV') || d === 'CV WA') {
      return {
        icon: Building,
        bg: 'bg-teal-50/70 border-teal-200 text-teal-900',
        activeBorder: 'border-teal-600 ring-2 ring-teal-500/30 bg-teal-50',
        desc: 'Unit usaha kemitraan & lapangan',
      };
    }
    return {
      icon: Layers,
      bg: 'bg-zinc-50 border-zinc-200 text-zinc-900',
      activeBorder: 'border-zinc-700 ring-2 ring-zinc-500/30 bg-zinc-100',
      desc: 'Operasional & kebutuhan unit kerja',
    };
  };

  const totalPengeluaranAll = useMemo(
    () => list.reduce((sum, item) => sum + (item.nominal || 0), 0),
    [list]
  );

  const divisiStats = useMemo(() => {
    return allDivisiList.map((div) => {
      const subList = list.filter((i) => i.divisi === div);
      const total = subList.reduce((s, i) => s + (i.nominal || 0), 0);
      return {
        divisi: div,
        total,
        count: subList.length,
        meta: getDivisiTheme(div),
      };
    });
  }, [allDivisiList, list]);

  const handleAddNewDivisi = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newDivisiName.trim();
    if (!trimmed) return;
    if (allDivisiList.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setErrorMsg(`Divisi "${trimmed}" sudah terdaftar.`);
      return;
    }
    try {
      await api.createDivisi({
        nama: trimmed,
        deskripsi: `Unit operasional & pengeluaran ${trimmed}`,
      });
    } catch (err: any) {
      console.warn('Simpan divisi via API:', err);
    }
    const updated = [...customDivisi, trimmed];
    setCustomDivisi(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('wijaya_agro_custom_divisi', JSON.stringify(updated));
    }
    setInvDivisi(trimmed);
    setBiasaDivisi(trimmed);
    setNewDivisiName('');
    setShowAddDivisiModal(false);
    setSuccessMsg(`Divisi "${trimmed}" berhasil ditambahkan!`);
    onRefresh();
  };

  const filteredList = useMemo(() => {
    return list.filter((item) => {
      const itemKelompok =
        item.kelompokPengeluaran || resolveKelompokItemPengeluaran(item.kategori);
      const matchDivisi = filterDivisi === 'ALL' || item.divisi === filterDivisi;
      const matchKelompok = filterKelompok === 'ALL' || itemKelompok === filterKelompok;
      const matchKat =
        filterKategoriItem === 'ALL' ||
        item.kategori.toUpperCase() === filterKategoriItem.toUpperCase();
      const matchQuery =
        !searchQuery.trim() ||
        item.keterangan.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.kategori.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.penerima || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.idTransaksi.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDivisi && matchKelompok && matchKat && matchQuery;
    });
  }, [list, filterDivisi, filterKelompok, filterKategoriItem, searchQuery]);

  const formatAngkaTabel = (val: number): string => {
    if (!val) return '-';
    const absStr = Math.abs(Math.round(val)).toLocaleString('id-ID');
    return val < 0 ? `-${absStr}` : absStr;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
            Rekapan 24 Item Pengeluaran &amp; Dual Form Input (Hijau Inventaris · Oranye Biasa)
          </h1>
          <p className="text-xs text-zinc-600 mt-0.5 leading-relaxed">
            Item pengeluaran dibagi tegas menjadi <strong>16 Item Hijau (Pengeluaran Untuk Inventaris / Armada)</strong> dan <strong>8 Item Oranye (Pengeluaran Biasa Harian)</strong> sesuai buku rekapan PT. Klik baris pada tabel rekapan untuk memilih item dan memfilter histori.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setNewMasterItemKelompok('INVENTARIS');
              setShowAddMasterItemModal(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Item Pengeluaran</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddDivisiModal(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-800 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Divisi</span>
          </button>

          <button
            type="button"
            onClick={() => {
              loadData();
              onRefresh();
            }}
            className="text-xs font-medium px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-700 cursor-pointer"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg('')}
            className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg('')}
            className="text-rose-700 hover:text-rose-950 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================
          MAIN WORKSPACE: TABEL REKAPAN 24 ITEM (LEFT) + 2 FORM BERBEDA (RIGHT)
         ======================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (4 Cols): TABEL REKAPAN 24 ITEM PENGELUARAN (PERSIS BUKU REKAPAN) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-zinc-300 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-900 text-white flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider">
                Tabel Rekapan {recapRows.length} Item Pengeluaran
              </h2>
              <p className="text-[11px] text-zinc-300">
                1–16 Hijau (Inventaris) · 17–24 Oranye (Biasa)
              </p>
            </div>
            {(filterKategoriItem !== 'ALL' || filterKelompok !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setFilterKategoriItem('ALL');
                  setFilterKelompok('ALL');
                }}
                className="px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-[11px] font-semibold text-white cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-amber-400 text-zinc-950 border-b border-zinc-700">
                  <th className="py-2 px-2.5 text-center font-bold border-r border-zinc-700 w-10">
                    NO
                  </th>
                  <th className="py-2 px-3 text-left font-black tracking-wide border-r border-zinc-700">
                    PENGELUARAN
                  </th>
                  <th className="py-2 px-3 text-right font-black tracking-wide">
                    JUMLAH (Rp)
                  </th>
                </tr>
              </thead>
              <tbody>
                {recapRows.map((row) => {
                  const isHijau = row.kelompok === 'INVENTARIS';
                  const isSelected =
                    filterKategoriItem.toUpperCase() === row.nama.toUpperCase();

                  const rowBgClass = isHijau
                    ? isSelected
                      ? 'bg-emerald-500 text-zinc-950 ring-2 ring-inset ring-zinc-900'
                      : 'bg-emerald-300/85 hover:bg-emerald-400/90 text-zinc-950'
                    : isSelected
                    ? 'bg-orange-500 text-white ring-2 ring-inset ring-zinc-900'
                    : 'bg-amber-400/85 hover:bg-amber-400 text-zinc-950';

                  return (
                    <tr
                      key={`${row.nomorUrut}-${row.nama}`}
                      onClick={() => {
                        const toggleOff =
                          filterKategoriItem.toUpperCase() === row.nama.toUpperCase();
                        setFilterKategoriItem(toggleOff ? 'ALL' : row.nama);
                        if (isHijau) {
                          handleSelectInvKategori(row.nama);
                        } else {
                          handleSelectBiasaKategori(row.nama);
                        }
                      }}
                      title={`Klik untuk pilih ${row.nama} pada Form ${
                        isHijau ? 'Hijau (Inventaris)' : 'Oranye (Biasa)'
                      } & filter tabel histori`}
                      className={`border-b border-zinc-700/70 transition-colors cursor-pointer ${rowBgClass}`}
                    >
                      <td className="py-1.5 px-2 text-center font-mono tabular-nums font-bold border-r border-zinc-700/70">
                        {row.nomorUrut}
                      </td>
                      <td className="py-1.5 px-3 font-bold tracking-tight border-r border-zinc-700/70">
                        <div className="flex items-center justify-between gap-1">
                          <span>{row.nama}</span>
                          {row.count > 0 && (
                            <span className="text-[10px] font-mono opacity-75">
                              {row.count}x
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                        {formatAngkaTabel(row.netNominal)}
                      </td>
                    </tr>
                  );
                })}

                {/* Subtotal Ringkas Hijau & Oranye */}
                <tr className="bg-emerald-50 text-emerald-950 border-b border-zinc-300 text-[11px]">
                  <td colSpan={2} className="py-1.5 px-3 font-bold border-r border-zinc-300">
                    SUBTOTAL HIJAU (INVENTARIS 1–16)
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold">
                    {formatAngkaTabel(totalInventarisHijau)}
                  </td>
                </tr>
                <tr className="bg-orange-50 text-orange-950 border-b border-zinc-700 text-[11px]">
                  <td colSpan={2} className="py-1.5 px-3 font-bold border-r border-zinc-300">
                    SUBTOTAL ORANYE (BIASA 17–24)
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold">
                    {formatAngkaTabel(totalBiasaOranye)}
                  </td>
                </tr>

                {/* GRAND TOTAL ROW: TOT */}
                <tr className="bg-white text-zinc-950 font-black text-sm border-t-2 border-zinc-900">
                  <td className="py-2.5 px-2 text-center border-r border-zinc-700">-</td>
                  <td className="py-2.5 px-3 tracking-wider border-r border-zinc-700">TOT</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatAngkaTabel(totalRecapGrand)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN (8 Cols): 2 FORM INPUT BERBEDA (HIJAU INVENTARIS & ORANYE BIASA) */}
        <div className="lg:col-span-8 grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {/* ====================================================================
              FORM 1 (WARNA HIJAU): PENGELUARAN UNTUK INVENTARIS (ITEM 1 - 16)
             ==================================================================== */}
          <div className="bg-white rounded-xl border-2 border-emerald-500 overflow-hidden">
            <div className="px-4 py-3.5 bg-emerald-700 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Truck className="w-5 h-5 text-emerald-200 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-black tracking-tight truncate">
                    Form Hijau: Pengeluaran Inventaris
                  </h2>
                  <p className="text-[11px] text-emerald-100 truncate">
                    Khusus Item No. 1–16 (L300, Traga, Dump, Exca, Plat Mobil &amp; Motor)
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmitFormInventaris}
              className="p-4 space-y-3.5 text-xs bg-emerald-50/25"
            >
              {/* Pilih Item Inventaris (Hijau 1-16) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-emerald-950">
                    Pilih Item Inventaris (No. 1–16) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewMasterItemKelompok('INVENTARIS');
                      setShowAddMasterItemModal(true);
                    }}
                    className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
                  >
                    + Item Hijau Baru
                  </button>
                </div>
                <select
                  required
                  value={invKategori}
                  onChange={(e) => handleSelectInvKategori(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-emerald-400 bg-emerald-100/60 rounded-lg font-bold text-zinc-950 focus:outline-none focus:border-emerald-700"
                >
                  {inventarisItems.map((it) => (
                    <option key={it.nama} value={it.nama}>
                      {it.nomorUrut}. {it.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit Kendaraan PT & Divisi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-zinc-700">
                      Divisi Beban <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <select
                    required
                    value={invDivisi}
                    onChange={(e) => {
                      if (e.target.value === '__ADD_DIVISI__') {
                        setShowAddDivisiModal(true);
                      } else {
                        setInvDivisi(e.target.value);
                      }
                    }}
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-semibold text-zinc-900"
                  >
                    {allDivisiList.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                    <option value="__ADD_DIVISI__">+ Tambah Divisi Baru...</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-zinc-700">Link Aset / Unit PT</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setQuickInvError('');
                          setQuickInvNama(invKategori);
                          setShowQuickAddInventaris(true);
                        }}
                        className="text-[10px] font-bold text-emerald-800 hover:underline cursor-pointer"
                      >
                        + Unit Baru
                      </button>
                      {onOpenInventarisMenu && (
                        <button
                          type="button"
                          onClick={onOpenInventarisMenu}
                          className="text-[10px] text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
                        >
                          Master
                        </button>
                      )}
                    </div>
                  </div>
                  <select
                    value={invSelectedUnitId}
                    onChange={(e) => setInvSelectedUnitId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-800"
                  >
                    <option value="">-- Otomatis Sesuai Nama Item ({invKategori}) --</option>
                    {mergedInventarisList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nomorPlat && u.nomorPlat !== '-' ? `${u.nomorPlat} — ` : ''}
                        {u.namaItem}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedInvUnitObj && (
                <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-[11px] text-zinc-700 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Driver: <strong>{selectedInvUnitObj.driverPenanggungJawab || '-'}</strong>
                  </span>
                  <span>
                    Pajak STNK:{' '}
                    <strong>
                      {getPajakStatusInfo(selectedInvUnitObj.tanggalPajakTahunan).label}
                    </strong>
                  </span>
                </div>
              )}

              {/* Arah Mutasi (+ / -) */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Jenis Pencatatan Inventaris
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInvArahMutasi('TAMBAH')}
                    className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                      invArahMutasi === 'TAMBAH'
                        ? 'bg-emerald-700 text-white border-emerald-800'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    + Tambah Biaya Inventaris
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvArahMutasi('KURANG')}
                    className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                      invArahMutasi === 'KURANG'
                        ? 'bg-zinc-800 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    − Kurangi / Koreksi
                  </button>
                </div>
              </div>

              {/* Qty x Harga Satuan (Opsional) & Nominal Total */}
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <label className="block font-semibold text-zinc-700 mb-1">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={invQty}
                    onChange={(e) => handleInvQtyOrHargaChange(e.target.value, invHargaSatuan)}
                    placeholder="1"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono tabular-nums text-zinc-900"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block font-semibold text-zinc-700 mb-1">Satuan</label>
                  <input
                    type="text"
                    value={invSatuan}
                    onChange={(e) => setInvSatuan(e.target.value.toUpperCase())}
                    placeholder="PCS"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono uppercase text-zinc-900"
                  />
                </div>
                <div className="col-span-6">
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Harga Satuan (Opsional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={invHargaSatuan}
                    onChange={(e) => handleInvQtyOrHargaChange(invQty, e.target.value)}
                    placeholder="Otomatis hitung total"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono tabular-nums text-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-emerald-950 mb-1">
                  Total Nominal Pengeluaran Inventaris (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-bold text-zinc-400">Rp</span>
                  <input
                    type="number"
                    required
                    min="1"
                    value={invNominal}
                    onChange={(e) => setInvNominal(e.target.value)}
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2 border-2 border-emerald-400 bg-white rounded-lg font-mono tabular-nums font-bold text-sm text-zinc-950 focus:outline-none focus:border-emerald-700"
                  />
                </div>
              </div>

              {/* Keterangan Servis / Sparepart */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Rincian Servis / Sparepart / Kebutuhan Unit
                </label>
                <input
                  type="text"
                  value={invKeterangan}
                  onChange={(e) => setInvKeterangan(e.target.value)}
                  placeholder={`Cth: Ganti oli & filter solar ${invKategori}, servis rem...`}
                  className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-900"
                />
              </div>

              {/* Sumber Kas & Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Sumber Kas / Bank / Sinkron
                  </label>
                  <select
                    value={invRekeningSumber}
                    onChange={(e) => setInvRekeningSumber(e.target.value)}
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-800"
                  >
                    {activeCashAccounts.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({formatRupiahSingkat(r.saldoSaatIni)})
                      </option>
                    ))}
                    <option value="SINKRON">SINKRON (Non-Kas / Tanpa Potong Kas)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Tanggal</label>
                  <input
                    type="text"
                    value={invTanggal}
                    onChange={(e) => setInvTanggal(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono tabular-nums text-zinc-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Bengkel / Sopir / Penerima (Opsional)
                </label>
                <input
                  type="text"
                  value={invPenerimaManual}
                  onChange={(e) => setInvPenerimaManual(e.target.value)}
                  placeholder="Cth: Bengkel Jaya / Sopir Argon"
                  className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-800"
                />
              </div>

              <ImageUploadZone
                label="Foto Nota Bengkel / Struk (Opsional)"
                sublabel="Bukti kuitansi servis atau sparepart armada"
                value={invFotoKuitansi}
                onChange={setInvFotoKuitansi}
              />

              <button
                type="submit"
                disabled={submittingKelompok !== null || Number(invNominal) <= 0}
                className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Truck className="w-4 h-4" />
                <span>
                  {submittingKelompok === 'INVENTARIS'
                    ? 'Menyimpan...'
                    : `Simpan Pengeluaran Inventaris (${invKategori})`}
                </span>
              </button>
            </form>
          </div>

          {/* ====================================================================
              FORM 2 (WARNA ORANYE): PENGELUARAN BIASA / HARIAN (ITEM 17 - 24)
             ==================================================================== */}
          <div className="bg-white rounded-xl border-2 border-orange-500 overflow-hidden">
            <div className="px-4 py-3.5 bg-orange-600 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Fuel className="w-5 h-5 text-orange-100 shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-sm font-black tracking-tight truncate">
                    Form Oranye: Pengeluaran Biasa
                  </h2>
                  <p className="text-[11px] text-orange-100 truncate">
                    Khusus Item No. 17–24 (Rumah, Solar, Rokok, Akua, Nasi, Token, Sedekah, Gorengan)
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={handleSubmitFormBiasa}
              className="p-4 space-y-3.5 text-xs bg-orange-50/25"
            >
              {/* Pilih Item Biasa (Oranye 17-24) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-orange-950">
                    Pilih Item Pengeluaran Biasa (No. 17–24){' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewMasterItemKelompok('BIASA');
                      setShowAddMasterItemModal(true);
                    }}
                    className="text-[11px] font-bold text-orange-800 hover:underline cursor-pointer"
                  >
                    + Item Oranye Baru
                  </button>
                </div>
                <select
                  required
                  value={biasaKategori}
                  onChange={(e) => handleSelectBiasaKategori(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-orange-400 bg-amber-100/70 rounded-lg font-bold text-zinc-950 focus:outline-none focus:border-orange-700"
                >
                  {biasaItems.map((it) => (
                    <option key={it.nama} value={it.nama}>
                      {it.nomorUrut}. {it.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* Divisi Beban */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-zinc-700">
                    Unit / Divisi Beban <span className="text-rose-500">*</span>
                  </label>
                  {(() => {
                    const divAcc = resolveDivisiAccount(biasaDivisi, rekeningList);
                    return (
                      <span className="text-[10px] font-mono text-zinc-500">
                        Saldo {divAcc.kode}: {formatRupiahSingkat(divAcc.saldoSaatIni)}
                      </span>
                    );
                  })()}
                </div>
                <select
                  required
                  value={biasaDivisi}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_DIVISI__') {
                      setShowAddDivisiModal(true);
                    } else {
                      setBiasaDivisi(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg font-semibold text-zinc-900"
                >
                  {allDivisiList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                  <option value="__ADD_DIVISI__">+ Tambah Divisi Baru...</option>
                </select>
              </div>

              {/* Arah Mutasi (+ / -) */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Jenis Pencatatan Pengeluaran Biasa
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBiasaArahMutasi('TAMBAH')}
                    className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                      biasaArahMutasi === 'TAMBAH'
                        ? 'bg-orange-600 text-white border-orange-700'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    + Tambah Pengeluaran
                  </button>
                  <button
                    type="button"
                    onClick={() => setBiasaArahMutasi('KURANG')}
                    className={`py-1.5 px-2.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                      biasaArahMutasi === 'KURANG'
                        ? 'bg-zinc-800 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    − Kurangi / Koreksi
                  </button>
                </div>
              </div>

              {/* Qty x Harga Satuan (Opsional) */}
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <label className="block font-semibold text-zinc-700 mb-1">Qty</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={biasaQty}
                    onChange={(e) =>
                      handleBiasaQtyOrHargaChange(e.target.value, biasaHargaSatuan)
                    }
                    placeholder="1"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono tabular-nums text-zinc-900"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block font-semibold text-zinc-700 mb-1">Satuan</label>
                  <input
                    type="text"
                    value={biasaSatuan}
                    onChange={(e) => setBiasaSatuan(e.target.value.toUpperCase())}
                    placeholder="LITER"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono uppercase text-zinc-900"
                  />
                </div>
                <div className="col-span-6">
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Harga Satuan (Opsional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={biasaHargaSatuan}
                    onChange={(e) => handleBiasaQtyOrHargaChange(biasaQty, e.target.value)}
                    placeholder="Otomatis hitung total"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono tabular-nums text-zinc-900"
                  />
                </div>
              </div>

              {/* Total Nominal */}
              <div>
                <label className="block font-bold text-orange-950 mb-1">
                  Total Nominal Pengeluaran Biasa (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-bold text-zinc-400">Rp</span>
                  <input
                    type="number"
                    required
                    min="1"
                    value={biasaNominal}
                    onChange={(e) => setBiasaNominal(e.target.value)}
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2 border-2 border-orange-400 bg-white rounded-lg font-mono tabular-nums font-bold text-sm text-zinc-950 focus:outline-none focus:border-orange-700"
                  />
                </div>
              </div>

              {/* Keterangan Kebutuhan Harian */}
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Rincian Kebutuhan / Catatan Harian
                </label>
                <input
                  type="text"
                  value={biasaKeterangan}
                  onChange={(e) => setBiasaKeterangan(e.target.value)}
                  placeholder={`Cth: Pembelian ${biasaKategori} untuk operasional gudang...`}
                  className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-900"
                />
              </div>

              {/* Sumber Kas & Tanggal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">
                    Sumber Kas / Bank / Sinkron
                  </label>
                  <select
                    value={biasaRekeningSumber}
                    onChange={(e) => setBiasaRekeningSumber(e.target.value)}
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-800"
                  >
                    {activeCashAccounts.map((r) => (
                      <option key={r.kode} value={r.kode}>
                        {r.nama} ({formatRupiahSingkat(r.saldoSaatIni)})
                      </option>
                    ))}
                    <option value="SINKRON">SINKRON (Non-Kas / Tanpa Potong Kas)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Tanggal</label>
                  <input
                    type="text"
                    value={biasaTanggal}
                    onChange={(e) => setBiasaTanggal(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-2.5 py-2 border border-zinc-300 bg-white rounded-lg font-mono tabular-nums text-zinc-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Oleh / Penerima (Opsional)
                </label>
                <input
                  type="text"
                  list="karyawan-penerima-list"
                  value={biasaPenerima}
                  onChange={(e) => setBiasaPenerima(e.target.value)}
                  placeholder="Cth: Dapur Gudang / Kasir / Karyawan"
                  className="w-full px-3 py-2 border border-zinc-300 bg-white rounded-lg text-zinc-800"
                />
                <datalist id="karyawan-penerima-list">
                  {karyawanList
                    .filter((k) => k.status === 'AKTIF')
                    .map((k) => (
                      <option key={k.id} value={`${k.nama} (${k.jabatan})`} />
                    ))}
                </datalist>
              </div>

              <ImageUploadZone
                label="Foto Nota / Struk Belanja (Opsional)"
                sublabel="Bukti kuitansi pembelian harian"
                value={biasaFotoKuitansi}
                onChange={setBiasaFotoKuitansi}
              />

              <button
                type="submit"
                disabled={submittingKelompok !== null || Number(biasaNominal) <= 0}
                className="w-full py-2.5 px-4 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>
                  {submittingKelompok === 'BIASA'
                    ? 'Menyimpan...'
                    : `Simpan Pengeluaran Biasa (${biasaKategori})`}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Ringkasan Per Divisi */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
          <span className="font-bold uppercase tracking-wider text-[11px] text-zinc-800">
            Ringkasan Beban Pengeluaran Per Divisi ({allDivisiList.length} Divisi)
          </span>
          <span className="text-[11px] text-zinc-500">
            {filterDivisi === 'ALL'
              ? 'Menampilkan semua divisi · Klik kartu divisi untuk memfilter rekapan & histori'
              : `Filter aktif: ${filterDivisi} (Klik lagi untuk semua divisi)`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div
            onClick={() => setFilterDivisi('ALL')}
            className={`p-4 rounded-xl border transition-all cursor-pointer min-w-0 ${
              filterDivisi === 'ALL'
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white border-zinc-200 hover:border-zinc-400 text-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-bold mb-1">
              <span className="truncate">TOTAL SEMUA DIVISI</span>
              <Receipt className="w-4 h-4 shrink-0 opacity-80" />
            </div>
            <div
              className="text-xl font-black font-mono tabular-nums truncate"
              title={formatRupiah(totalPengeluaranAll)}
            >
              {formatRupiahSingkat(totalPengeluaranAll)}
            </div>
            <div
              className={`text-[11px] mt-1.5 ${
                filterDivisi === 'ALL' ? 'text-zinc-300' : 'text-zinc-500'
              }`}
            >
              {list.length} transaksi tercatat
            </div>
          </div>

          {divisiStats.map((stat) => {
            const Icon = stat.meta.icon;
            const isSelected = filterDivisi === stat.divisi;
            return (
              <div
                key={stat.divisi}
                onClick={() => setFilterDivisi(isSelected ? 'ALL' : stat.divisi)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between min-w-0 ${
                  isSelected ? stat.meta.activeBorder : `${stat.meta.bg}`
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between text-xs font-bold mb-1 gap-1">
                    <span className="truncate text-zinc-900">{stat.divisi}</span>
                    <Icon className="w-4 h-4 shrink-0 opacity-80" />
                  </div>
                  <div
                    className="text-lg font-black font-mono tabular-nums text-zinc-900 truncate"
                    title={formatRupiah(stat.total)}
                  >
                    {formatRupiahSingkat(stat.total)}
                  </div>
                  <div className="text-[11px] text-zinc-600 mt-1">
                    {stat.count} transaksi · Klik untuk filter
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* History Table Full-Width */}
      <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900">
              Histori Rincian Pengeluaran ({filteredList.length} Transaksi)
            </h2>
            <p className="text-[11px] text-zinc-500">
              Setiap transaksi dapat diubah nama item, qty, harga, nominal, tanggal, dan rekening melalui tombol Edit
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Segmented Filter Kelompok: Semua / Hijau Inventaris / Oranye Biasa */}
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterKelompok('ALL')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterKelompok === 'ALL'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setFilterKelompok('INVENTARIS')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterKelompok === 'INVENTARIS'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-800 hover:text-emerald-950'
                }`}
              >
                Hijau · Inventaris
              </button>
              <button
                type="button"
                onClick={() => setFilterKelompok('BIASA')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterKelompok === 'BIASA'
                    ? 'bg-orange-600 text-white'
                    : 'text-orange-800 hover:text-orange-950'
                }`}
              >
                Oranye · Biasa
              </button>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Cari item, rincian, nota..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-semibold uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-3">TANGGAL</th>
                <th className="py-2.5 px-3">ITEM &amp; KELOMPOK</th>
                <th className="py-2.5 px-3">DIVISI</th>
                <th className="py-2.5 px-3">RINCIAN &amp; QTY</th>
                <th className="py-2.5 px-3 text-right">NOMINAL</th>
                <th className="py-2.5 px-3">SUMBER KAS</th>
                <th className="py-2.5 px-3 text-center">BUKTI</th>
                <th className="py-2.5 px-3 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-400">
                    {loading ? 'Memuat data pengeluaran...' : 'Belum ada catatan pengeluaran pada filter ini'}
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const kel =
                    item.kelompokPengeluaran || resolveKelompokItemPengeluaran(item.kategori);
                  const noUrut = getNomorUrutItemPengeluaran(item.kategori);
                  const isHijau = kel === 'INVENTARIS';

                  return (
                    <tr key={item.idTransaksi} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600 font-mono tabular-nums">
                        <div>{item.tanggal}</div>
                        <div className="text-[10px] text-zinc-400">{item.jam}</div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div
                          className={`font-bold ${
                            isHijau ? 'text-emerald-800' : 'text-orange-800'
                          }`}
                        >
                          {noUrut ? `${noUrut}. ` : ''}
                          {item.kategori}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {isHijau ? 'Inventaris (Hijau)' : 'Pengeluaran Biasa (Oranye)'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-zinc-800">
                        {item.divisi}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-zinc-900">{item.keterangan}</div>
                        <div className="text-[11px] text-zinc-500">
                          {item.qty && item.qty > 0 ? (
                            <span className="font-mono tabular-nums text-zinc-700">
                              {item.qty} {item.satuan || 'PCS'}
                              {item.hargaSatuan && item.hargaSatuan > 0
                                ? ` × ${formatRupiah(item.hargaSatuan)}`
                                : ''}
                              {item.penerima ? ' · ' : ''}
                            </span>
                          ) : null}
                          {item.penerima ? `Oleh/Unit: ${item.penerima}` : ''}
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                          item.nominal < 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {item.nominal < 0
                          ? `−${formatRupiah(Math.abs(item.nominal))}`
                          : formatRupiah(item.nominal)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-zinc-700">
                        {item.rekeningSumber}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.fotoKuitansi ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewPhoto({
                                imageUrl: item.fotoKuitansi!,
                                title: `Kuitansi: ${item.keterangan}`,
                                nomorBukti: item.idTransaksi,
                                namaMitra: item.divisi,
                                tanggal: item.tanggal,
                                nominalText: formatRupiah(item.nominal),
                                keterangan: item.keterangan,
                              })
                            }
                            className="p-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded transition-colors cursor-pointer"
                            title="Lihat Foto Kuitansi"
                          >
                            <Camera className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        ) : (
                          <span className="text-zinc-300">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditTxId(item.idTransaksi)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-700 hover:text-white border border-zinc-200 text-[10px] font-semibold transition-colors cursor-pointer"
                            title="Edit item, qty, harga, nominal, tanggal, atau rekening"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.idTransaksi, item.keterangan)}
                            className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="Batalkan & Hapus Pengeluaran"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Buat Item Pengeluaran Baru */}
      {showAddMasterItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-200">
            <div
              className={`p-4 text-white font-bold text-sm flex justify-between items-center ${
                newMasterItemKelompok === 'INVENTARIS' ? 'bg-emerald-700' : 'bg-orange-600'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Plus className="w-4 h-4" />
                <span>Tambah Item Pengeluaran Baru</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMasterItemModal(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateMasterItem} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1.5">
                  Pilih Kelompok Warna Item <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewMasterItemKelompok('INVENTARIS')}
                    className={`py-2 px-3 rounded-lg border font-bold text-xs cursor-pointer ${
                      newMasterItemKelompok === 'INVENTARIS'
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    }`}
                  >
                    Hijau · Inventaris
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMasterItemKelompok('BIASA')}
                    className={`py-2 px-3 rounded-lg border font-bold text-xs cursor-pointer ${
                      newMasterItemKelompok === 'BIASA'
                        ? 'bg-orange-600 text-white border-orange-700'
                        : 'bg-orange-50 text-orange-900 border-orange-300'
                    }`}
                  >
                    Oranye · Biasa
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 mb-1">
                  Nama Item Pengeluaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newMasterItemName}
                  onChange={(e) => setNewMasterItemName(e.target.value)}
                  placeholder={
                    newMasterItemKelompok === 'INVENTARIS'
                      ? 'Contoh: HINO RANGER / EXC 03'
                      : 'Contoh: KOPI / GAS LPG'
                  }
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-bold text-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Satuan Default</label>
                  <input
                    type="text"
                    value={newMasterItemSatuan}
                    onChange={(e) => setNewMasterItemSatuan(e.target.value)}
                    placeholder="Contoh: PCS / LITER"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-zinc-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Keterangan</label>
                  <input
                    type="text"
                    value={newMasterItemKet}
                    onChange={(e) => setNewMasterItemKet(e.target.value)}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-zinc-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddMasterItemModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingMasterItem || !newMasterItemName.trim()}
                  className={`px-4 py-1.5 rounded-lg disabled:opacity-50 text-white font-bold cursor-pointer ${
                    newMasterItemKelompok === 'INVENTARIS'
                      ? 'bg-emerald-700 hover:bg-emerald-800'
                      : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {savingMasterItem ? 'Menyimpan...' : 'Simpan Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Tambah Divisi Baru */}
      {showAddDivisiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-zinc-200">
            <div className="p-4 bg-zinc-900 text-white font-bold text-sm flex justify-between items-center">
              <span>Tambah Divisi / Unit Kerja Baru</span>
              <button
                type="button"
                onClick={() => {
                  setShowAddDivisiModal(false);
                  setNewDivisiName('');
                }}
                className="text-zinc-300 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddNewDivisi} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Nama Divisi Baru <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Contoh: Wijaya Logistik"
                  value={newDivisiName}
                  onChange={(e) => setNewDivisiName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold text-zinc-900"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDivisiModal(false);
                    setNewDivisiName('');
                  }}
                  className="px-3.5 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-lg font-medium cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!newDivisiName.trim()}
                  className="px-4 py-1.5 bg-zinc-900 text-white font-bold rounded-lg hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
                >
                  Simpan Divisi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Foto Kuitansi Modal */}
      {previewPhoto && (
        <FotoNotaPreviewModal
          isOpen={true}
          onClose={() => setPreviewPhoto(null)}
          imageUrl={previewPhoto.imageUrl}
          title={previewPhoto.title}
          nomorBukti={previewPhoto.nomorBukti}
          namaMitra={previewPhoto.namaMitra}
          tanggal={previewPhoto.tanggal}
          nominalText={previewPhoto.nominalText}
          keterangan={previewPhoto.keterangan}
        />
      )}

      {/* Confirmation Modal for Deleting Pengeluaran */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mx-auto border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-zinc-900">
                Batalkan &amp; Hapus Pengeluaran?
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Yakin ingin membatalkan pengeluaran{' '}
                <strong className="text-zinc-900">"{deleteTarget.ket}"</strong>? Saldo kas akan
                dipulihkan secara otomatis.
              </p>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl border border-zinc-300 text-zinc-700 font-semibold text-xs hover:bg-zinc-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeConfirmDelete}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Universal Edit Detail Pengeluaran Divisi */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="PENGELUARAN_DIVISI"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          loadData();
          onRefresh();
        }}
      />

      {/* Quick Add Inventaris Modal inside Pengeluaran */}
      {showQuickAddInventaris && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tambah Kendaraan / Item ke Inventaris PT
                </h3>
                <p className="text-[11px] text-slate-500">
                  Otomatis tersimpan ke Menu Inventaris &amp; langsung terpilih di Form Hijau
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddInventaris(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCreateInventaris} className="p-5 space-y-3.5 text-xs">
              {quickInvError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {quickInvError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori Unit</label>
                  <select
                    value={quickInvKategori}
                    onChange={(e) => setQuickInvKategori(e.target.value as KategoriInventaris)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    {(Object.keys(KATEGORI_INVENTARIS_LABELS) as KategoriInventaris[]).map(
                      (kat) => (
                        <option key={kat} value={kat}>
                          {KATEGORI_INVENTARIS_LABELS[kat]}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Kendaraan / Item *
                  </label>
                  <input
                    type="text"
                    required
                    value={quickInvNama}
                    onChange={(e) => setQuickInvNama(e.target.value)}
                    placeholder="Cth: Dump Dutro / L300"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nomor Plat / Polisi
                  </label>
                  <input
                    type="text"
                    value={quickInvPlat}
                    onChange={(e) => setQuickInvPlat(e.target.value.toUpperCase())}
                    placeholder="Cth: BE 8206 AMN"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Keluaran Tahun Berapa
                  </label>
                  <input
                    type="number"
                    min="1980"
                    max="2035"
                    value={quickInvTahun}
                    onChange={(e) => setQuickInvTahun(e.target.value)}
                    placeholder="2021"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Driver / Penanggung Jawab
                  </label>
                  <input
                    type="text"
                    value={quickInvDriver}
                    onChange={(e) => setQuickInvDriver(e.target.value)}
                    placeholder="Cth: Argon / Fahlevi"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Jatuh Tempo Pajak STNK
                  </label>
                  <input
                    type="date"
                    value={quickInvPajak}
                    onChange={(e) => setQuickInvPajak(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Merk / Tipe Kendaraan (Opsional)
                </label>
                <input
                  type="text"
                  value={quickInvMerk}
                  onChange={(e) => setQuickInvMerk(e.target.value)}
                  placeholder="Cth: Hino Dutro 130 HD"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowQuickAddInventaris(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={quickInvSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold cursor-pointer disabled:opacity-50"
                >
                  {quickInvSaving ? 'Menyimpan...' : 'Simpan & Pilih Unit Ini'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
