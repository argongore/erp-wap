import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeftRight,
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Search,
  Building2,
  Users,
  FileText,
  History,
  ArrowUpRight,
  Pencil,
  Banknote,
  Landmark,
  User,
  HardHat,
} from 'lucide-react';
import {
  Mitra,
  ModeNotaSilang,
  NotaSilangItemInput,
  NotaSilangRecordSummary,
  Rekening,
} from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';
import { SearchableMitraSelect } from '../common/SearchableMitraSelect.tsx';

interface Props {
  mitraList: Mitra[];
  rekeningList: Rekening[];
  onSuccess: (receipt: ReceiptData) => void;
  onRefresh: () => void;
  onOpenRekeningKoranMitra?: (idMitra: string) => void;
}

interface CartSilangRow extends NotaSilangItemInput {
  id: string;
  subtotal: number;
}

export const NotaSilangView: React.FC<Props> = ({
  mitraList,
  rekeningList,
  onSuccess,
  onRefresh,
  onOpenRekeningKoranMitra,
}) => {
  const activeMitras = useMemo(
    () => mitraList.filter((m) => m.status === 'AKTIF'),
    [mitraList]
  );

  // Anak Perusahaan list (Fokus Utama: DP Parabot / MTR-DPPARABOT)
  const anakPerusahaanOptions = useMemo(() => {
    const subs = activeMitras.filter(
      (m) =>
        m.isAnakPerusahaan ||
        m.id === 'MTR-DPPARABOT' ||
        m.nama.toUpperCase().includes('PARABOT')
    );
    return subs.length > 0 ? subs : activeMitras;
  }, [activeMitras]);

  const defaultAnakId = useMemo(() => {
    const dp = anakPerusahaanOptions.find(
      (m) => m.id === 'MTR-DPPARABOT' || m.nama.toUpperCase().includes('PARABOT')
    );
    return dp?.id || anakPerusahaanOptions[0]?.id || 'MTR-DPPARABOT';
  }, [anakPerusahaanOptions]);

  // Rekening Kas / Bank PT aktif (non-virtual, non-operasional divisi, non-titip)
  const rekeningKasPtOptions = useMemo(() => {
    const filtered = rekeningList.filter(
      (r) =>
        !r.isVirtual &&
        r.status === 'AKTIF' &&
        r.kode !== 'BON01' &&
        r.kode !== 'TIT01' &&
        r.kode !== 'SINKRON' &&
        r.kategori !== 'OPERASIONAL_DIVISI' &&
        !r.isAnakPerusahaan &&
        !r.isRekeningTitip &&
        !r.kode.startsWith('REK-')
    );
    return filtered.length > 0
      ? filtered
      : rekeningList.filter(
          (r) =>
            !r.isVirtual &&
            r.status === 'AKTIF' &&
            r.kode !== 'BON01' &&
            r.kode !== 'TIT01' &&
            r.kode !== 'SINKRON'
        );
  }, [rekeningList]);

  const defaultBankTransferKode = useMemo(() => {
    const bank = rekeningKasPtOptions.find((r) => r.kode !== 'KAS01');
    return bank?.kode || rekeningKasPtOptions[0]?.kode || 'KAS01';
  }, [rekeningKasPtOptions]);

  // Mode Nota Silang:
  // 1. ANAK_PERUSAHAAN (Bon Mitra di DP Parabot)
  // 2. BAYAR_LUNAS_KAS_PT (Customer/Mitra bayar lunas di DP Parabot, uang masuk Kas/Bank PT -> Hutang PT ke DP Parabot)
  // 3. PROYEK_BERSAMA (Proyek Bersama PT WAP & DP Parabot: DP otomatis Lunas Sinkron Rp 0 hutang, tercatat di buku proyek)
  // 4. SESAMA_MITRA (Opsi silang piutang sesama mitra)
  const [modeNotaSilang, setModeNotaSilang] = useState<ModeNotaSilang>('ANAK_PERUSAHAAN');
  const [statusProyek, setStatusProyek] = useState<'BON_PROYEK' | 'LUNAS_SINKRON'>('BON_PROYEK');

  const mitraPengambilBaseOptions = useMemo(
    () => activeMitras.filter((m) => m.id !== defaultAnakId),
    [activeMitras, defaultAnakId]
  );

  const defaultProyekMitraId = useMemo(() => {
    const rmWap = mitraPengambilBaseOptions.find((m) =>
      /BANGUNAN RUMAH MAKAN/i.test(m.nama)
    );
    if (rmWap) return rmWap.id;
    const anyProyek = mitraPengambilBaseOptions.find((m) =>
      /BANGUNAN|PROYEK|KONSTRUKSI/i.test(m.nama)
    );
    return anyProyek?.id || '';
  }, [mitraPengambilBaseOptions]);

  const [idMitraPengambil, setIdMitraPengambil] = useState<string>(
    mitraPengambilBaseOptions[0]?.id || ''
  );
  const [tipePembeliLunas, setTipePembeliLunas] = useState<'UMUM' | 'MITRA'>('UMUM');
  const [namaPembeliUmum, setNamaPembeliUmum] = useState<string>('');
  const [metodeBayarKasPt, setMetodeBayarKasPt] = useState<'TUNAI' | 'TRANSFER'>('TUNAI');
  const [rekeningTujuanKasPt, setRekeningTujuanKasPt] = useState<string>('KAS01');

  const [idMitraAnakPerusahaan, setIdMitraAnakPerusahaan] = useState<string>(defaultAnakId);
  const [tanggalInput, setTanggalInput] = useState<string>(getWIBTodayString());
  const [noNotaToko, setNoNotaToko] = useState<string>('');
  const [keterangan, setKeterangan] = useState<string>('');
  const [fotoNota, setFotoNota] = useState<string>('');

  // Input Item Keranjang Nota Silang (Nama Barang, Qty, Harga)
  const [namaBarangInput, setNamaBarangInput] = useState<string>('');
  const [qtyInput, setQtyInput] = useState<string>('1');
  const [satuanInput, setSatuanInput] = useState<string>('PCS');
  const [hargaInput, setHargaInput] = useState<string>('');
  const [cart, setCart] = useState<CartSilangRow[]>([]);

  const [historyList, setHistoryList] = useState<NotaSilangRecordSummary[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [searchHistory, setSearchHistory] = useState<string>('');
  const [filterModeHistory, setFilterModeHistory] = useState<'ALL' | ModeNotaSilang>('ALL');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<NotaSilangRecordSummary | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [editTxId, setEditTxId] = useState<string | null>(null);

  useEffect(() => {
    if (!idMitraPengambil && mitraPengambilBaseOptions.length > 0) {
      setIdMitraPengambil(mitraPengambilBaseOptions[0].id);
    }
  }, [mitraPengambilBaseOptions, idMitraPengambil]);

  // Sinkronkan rekening tujuan Kas/Bank PT saat metode pembayaran berubah
  useEffect(() => {
    if (metodeBayarKasPt === 'TUNAI') {
      const hasKas01 = rekeningKasPtOptions.some((r) => r.kode === 'KAS01');
      if (hasKas01 && rekeningTujuanKasPt !== 'KAS01') {
        setRekeningTujuanKasPt('KAS01');
      } else if (!hasKas01 && rekeningKasPtOptions[0]) {
        setRekeningTujuanKasPt(rekeningKasPtOptions[0].kode);
      }
    } else {
      const validTransfer = rekeningKasPtOptions.some(
        (r) => r.kode === rekeningTujuanKasPt && r.kode !== 'KAS01'
      );
      if (!validTransfer && defaultBankTransferKode) {
        setRekeningTujuanKasPt(defaultBankTransferKode);
      }
    }
  }, [metodeBayarKasPt, rekeningKasPtOptions, defaultBankTransferKode]);

  // Synchronize counterparty & project mitra selection when switching mode
  useEffect(() => {
    if (
      modeNotaSilang === 'ANAK_PERUSAHAAN' ||
      modeNotaSilang === 'BAYAR_LUNAS_KAS_PT' ||
      modeNotaSilang === 'PROYEK_BERSAMA'
    ) {
      const validAnak = anakPerusahaanOptions.some((m) => m.id === idMitraAnakPerusahaan);
      if (!validAnak && defaultAnakId) {
        setIdMitraAnakPerusahaan(defaultAnakId);
      }
      if (modeNotaSilang === 'PROYEK_BERSAMA') {
        setPakaiHargaMusiman(false);
        const currObj = activeMitras.find((m) => m.id === idMitraPengambil);
        const isAlreadyProject = currObj && /BANGUNAN|PROYEK|KONSTRUKSI/i.test(currObj.nama);
        if (!isAlreadyProject && defaultProyekMitraId) {
          setIdMitraPengambil(defaultProyekMitraId);
        }
      }
    } else {
      // SESAMA_MITRA: pilih mitra reguler yang berbeda dari idMitraPengambil
      const peerCandidates = activeMitras.filter(
        (m) =>
          m.id !== idMitraPengambil &&
          !m.isAnakPerusahaan &&
          m.id !== 'MTR-DPPARABOT'
      );
      const fallbackPeers = activeMitras.filter((m) => m.id !== idMitraPengambil);
      const pool = peerCandidates.length > 0 ? peerCandidates : fallbackPeers;
      const stillValid = pool.some((m) => m.id === idMitraAnakPerusahaan);
      if (!stillValid && pool[0]) {
        setIdMitraAnakPerusahaan(pool[0].id);
      }
    }
  }, [
    modeNotaSilang,
    idMitraPengambil,
    activeMitras,
    anakPerusahaanOptions,
    defaultAnakId,
    defaultProyekMitraId,
  ]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.getNotaSilangList();
      setHistoryList(data || []);
    } catch (err) {
      console.warn('Gagal memuat riwayat Nota Silang:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredMitraPengambil = useMemo(
    () => activeMitras.filter((m) => m.id !== idMitraAnakPerusahaan),
    [activeMitras, idMitraAnakPerusahaan]
  );

  const filteredSesamaMitraOptions = useMemo(() => {
    const nonSubPeers = activeMitras.filter(
      (m) =>
        m.id !== idMitraPengambil &&
        !m.isAnakPerusahaan &&
        m.id !== 'MTR-DPPARABOT'
    );
    return nonSubPeers.length > 0
      ? nonSubPeers
      : activeMitras.filter((m) => m.id !== idMitraPengambil);
  }, [activeMitras, idMitraPengambil]);

  const selectedMitraObj = useMemo(
    () => activeMitras.find((m) => m.id === idMitraPengambil),
    [activeMitras, idMitraPengambil]
  );

  const selectedCounterpartyObj = useMemo(
    () => activeMitras.find((m) => m.id === idMitraAnakPerusahaan),
    [activeMitras, idMitraAnakPerusahaan]
  );

  const selectedRekeningKasPtObj = useMemo(
    () => rekeningKasPtOptions.find((r) => r.kode === rekeningTujuanKasPt),
    [rekeningKasPtOptions, rekeningTujuanKasPt]
  );

  const isModeSesamaMitra = modeNotaSilang === 'SESAMA_MITRA';
  const isModeBayarLunasKasPt = modeNotaSilang === 'BAYAR_LUNAS_KAS_PT';
  const isModeProyekBersama = modeNotaSilang === 'PROYEK_BERSAMA';

  const displayNamaPembeli = useMemo(() => {
    if (isModeBayarLunasKasPt && tipePembeliLunas === 'UMUM') {
      return namaPembeliUmum.trim() || 'Customer Umum';
    }
    return selectedMitraObj?.nama || 'Mitra Pengambil';
  }, [isModeBayarLunasKasPt, tipePembeliLunas, namaPembeliUmum, selectedMitraObj]);

  const handleAddItem = () => {
    setErrorMsg('');
    const nama = namaBarangInput.trim();
    const qty = Number(qtyInput) || 0;
    const harga = Number(hargaInput) || 0;
    if (!nama) {
      setErrorMsg('Nama barang yang diambil wajib diisi (contoh: TV Politron 24" Set).');
      return;
    }
    if (qty <= 0) {
      setErrorMsg('Qty barang harus lebih dari 0.');
      return;
    }
    if (harga <= 0) {
      setErrorMsg('Harga satuan barang harus lebih dari Rp 0.');
      return;
    }

    const row: CartSilangRow = {
      id: `NSI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      namaBarang: nama,
      qty,
      satuan: satuanInput.trim().toUpperCase() || 'PCS',
      harga,
      subtotal: Math.round(qty * harga),
    };
    setCart((prev) => [...prev, row]);
    setNamaBarangInput('');
    setQtyInput('1');
    setHargaInput('');
  };

  const handleUpdateCartRow = (
    id: string,
    patch: Partial<
      Pick<CartSilangRow, 'namaBarang' | 'qty' | 'harga' | 'satuan'> & {
        markupPerSatuan?: number;
      }
    >
  ) => {
    setCart((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const nextQty = patch.qty !== undefined ? Math.max(0.01, patch.qty) : row.qty;
        const nextHarga = patch.harga !== undefined ? Math.max(0, patch.harga) : row.harga;
        return {
          ...row,
          ...patch,
          qty: nextQty,
          harga: nextHarga,
          subtotal: Math.round(nextQty * nextHarga),
        };
      })
    );
  };

  const handleRemoveCartRow = (id: string) => {
    setCart((prev) => prev.filter((r) => r.id !== id));
  };

  const [pakaiHargaMusiman, setPakaiHargaMusiman] = useState<boolean>(false);

  const grandTotal = useMemo(
    () => cart.reduce((sum, r) => sum + r.subtotal, 0),
    [cart]
  );

  const totalMarkupMusiman = useMemo(
    () =>
      cart.reduce(
        (sum, r) => sum + Math.round(r.qty * Math.max(0, Number((r as any).markupPerSatuan || 0))),
        0
      ),
    [cart]
  );

  const totalPiutangMitra = useMemo(
    () => grandTotal + (pakaiHargaMusiman ? totalMarkupMusiman : 0),
    [grandTotal, pakaiHargaMusiman, totalMarkupMusiman]
  );

  const handleSubmitNotaSilang = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    let itemsToSubmit = cart;
    if (itemsToSubmit.length === 0 && namaBarangInput.trim() && Number(hargaInput) > 0) {
      const q = Math.max(1, Number(qtyInput) || 1);
      const h = Number(hargaInput) || 0;
      itemsToSubmit = [
        {
          id: 'AUTO-1',
          namaBarang: namaBarangInput.trim(),
          qty: q,
          satuan: satuanInput.trim().toUpperCase() || 'PCS',
          harga: h,
          subtotal: Math.round(q * h),
        },
      ];
    }

    const isUmumLunas = isModeBayarLunasKasPt && tipePembeliLunas === 'UMUM';

    if (!isUmumLunas && !idMitraPengambil) {
      setErrorMsg('Pilih Mitra yang mengambil barang terlebih dahulu.');
      return;
    }
    if (!idMitraAnakPerusahaan || (!isUmumLunas && idMitraPengambil === idMitraAnakPerusahaan)) {
      setErrorMsg('Pihak pengambil dan pihak penyedia barang tidak boleh mitra yang sama.');
      return;
    }
    if (isModeBayarLunasKasPt && !rekeningTujuanKasPt) {
      setErrorMsg('Pilih Rekening Kas / Bank PT tujuan penerimaan pembayaran lunas.');
      return;
    }
    if (itemsToSubmit.length === 0) {
      setErrorMsg('Tambahkan minimal 1 barang ke Keranjang Nota Silang (Nama Barang, Qty, Harga).');
      return;
    }

    setSubmitting(true);
    try {
      const effectivePakaiMarkup = pakaiHargaMusiman && !isModeProyekBersama;
      const res = await api.processNotaSilang({
        idMitraPengambil: isUmumLunas ? 'UMUM' : idMitraPengambil,
        tipePembeli: isModeBayarLunasKasPt ? tipePembeliLunas : 'MITRA',
        namaPembeliUmum: isUmumLunas ? namaPembeliUmum.trim() || 'Customer Umum' : undefined,
        idMitraAnakPerusahaan,
        modeNotaSilang,
        statusProyek: isModeProyekBersama ? statusProyek : undefined,
        metodeBayarKasPt: isModeBayarLunasKasPt ? metodeBayarKasPt : undefined,
        rekeningTujuanKasPt: isModeBayarLunasKasPt ? rekeningTujuanKasPt : undefined,
        tanggal: tanggalInput,
        noNotaToko: noNotaToko.trim() || undefined,
        fotoNota: fotoNota || undefined,
        keterangan: keterangan.trim() || undefined,
        items: itemsToSubmit.map((it) => ({
          namaBarang: it.namaBarang,
          qty: it.qty,
          satuan: it.satuan,
          harga: it.harga,
          markup: effectivePakaiMarkup ? Math.max(0, Number((it as any).markupPerSatuan || 0)) : 0,
        })),
        ...(effectivePakaiMarkup && totalMarkupMusiman > 0
          ? { tambahanHargaMusiman: totalMarkupMusiman }
          : {}),
      });

      setCart([]);
      setNamaBarangInput('');
      setQtyInput('1');
      setHargaInput('');
      setNoNotaToko('');
      setKeterangan('');
      setFotoNota('');
      setNamaPembeliUmum('');
      setPakaiHargaMusiman(false);
      const totalHppDP = res.bukuAnakPerusahaan
        ? Number(res.bukuAnakPerusahaan.totalNominal) || grandTotal
        : grandTotal;
      const totalJualMitra =
        Number(res.totalNominal) || Number(res.penjualanMitra?.totalNominal) || totalPiutangMitra;
      const labaSelisih = isModeProyekBersama ? 0 : Math.max(0, totalJualMitra - totalHppDP);
      const rekLabel =
        selectedRekeningKasPtObj?.nama || rekeningTujuanKasPt || 'Kas Utama Kasir';

      if (isModeProyekBersama) {
        const statusDesc =
          statusProyek === 'LUNAS_SINKRON'
            ? 'Langsung Lunas SINKRON (Rp 0 piutang aktif, masuk rekap total biaya bangunan)'
            : 'Akumulasi Biaya Proyek di Saldo Berjalan (dapat ditutup SINKRON kapan saja)';
        setSuccessMsg(
          `Nota Proyek Bersama ${res.noNotaSilang} berhasil dicatat di buku ${
            res.mitraPengambilNama
          } senilai ${formatRupiah(totalJualMitra)} (${statusDesc}). Nota di ${
            res.anakPerusahaanNama
          } otomatis LUNAS SINKRON (Rp 0 hutang PT, tidak mengganggu Rekening Koran ${
            res.anakPerusahaanNama
          }).`
        );
      } else if (isModeBayarLunasKasPt) {
        setSuccessMsg(
          `Nota Lunas DP → Kas PT ${res.noNotaSilang} berhasil dibukukan! Pembayaran ${metodeBayarKasPt} dari ${res.mitraPengambilNama} sebesar ${formatRupiah(
            totalJualMitra
          )} masuk ke ${rekLabel} (${rekeningTujuanKasPt}), dan Hutang PT ke ${
            res.anakPerusahaanNama
          } otomatis bertambah ${formatRupiah(totalHppDP)} (tanpa bon pembeli).`
        );
      } else {
        setSuccessMsg(
          `Nota Silang ${res.noNotaSilang} (${
            isModeSesamaMitra ? 'Sesama Mitra' : 'Mitra ⇄ Anak Perusahaan'
          }) berhasil dibukukan! Piutang ${res.mitraPengambilNama} tercatat ${formatRupiah(
            totalJualMitra
          )} & Hutang ke ${res.anakPerusahaanNama} tercatat ${formatRupiah(totalHppDP)}${
            labaSelisih > 0 ? ` [Selisih Markup Toko: +${formatRupiah(labaSelisih)}]` : ''
          }.`
        );
      }
      loadHistory();
      onRefresh();

      const receipt: ReceiptData = {
        title: isModeProyekBersama
          ? 'BUKTI MATERIAL PROYEK BERSAMA (LUNAS SINKRON DP)'
          : isModeBayarLunasKasPt
          ? 'BUKTI NOTA LUNAS ANAK PERUSAHAAN → KAS / BANK PT'
          : isModeSesamaMitra
          ? 'BUKTI PEMBUKUAN NOTA SILANG (SESAMA MITRA PT)'
          : 'BUKTI PEMBUKUAN NOTA SILANG (MITRA & ANAK PERUSAHAAN)',
        subtitle: `${
          isModeProyekBersama
            ? 'Akun Proyek'
            : isModeBayarLunasKasPt
            ? 'Pembeli (Lunas)'
            : 'Pengambil'
        }: ${res.mitraPengambilNama} | ${
          isModeSesamaMitra ? 'Mitra Penyedia' : 'Anak Perusahaan'
        }: ${res.anakPerusahaanNama}`,
        nomorTransaksi: res.noNotaSilang,
        tanggal: res.penjualanMitra.tanggal,
        jam: res.penjualanMitra.jam,
        mitra: res.mitraPengambilNama,
        rekening: isModeProyekBersama
          ? statusProyek === 'LUNAS_SINKRON'
            ? 'PROYEK BERSAMA · LUNAS SINKRON (NON-KAS / RP 0 HUTANG DP)'
            : 'PROYEK BERSAMA · AKUMULASI BIAYA (DP OTOMATIS LUNAS SINKRON)'
          : isModeBayarLunasKasPt
          ? `LUNAS (${metodeBayarKasPt}) → ${rekLabel} (${rekeningTujuanKasPt})`
          : isModeSesamaMitra
          ? 'NOTA SILANG SESAMA MITRA (PIUTANG MITRA → PT → MITRA PENYEDIA)'
          : 'NOTA SILANG UTAMA (PIUTANG MITRA → PT → ANAK PERUSAHAAN)',
        kategori: 'NOTA_SILANG',
        fotoNota: res.penjualanMitra.fotoNota,
        items: itemsToSubmit.map((it) => {
          const mk = effectivePakaiMarkup
            ? Math.max(0, Number((it as any).markupPerSatuan || 0))
            : 0;
          const hJual = it.harga + mk;
          return {
            nama: mk > 0 ? `${it.namaBarang} (+Markup ${formatRupiah(mk)})` : it.namaBarang,
            qty: it.qty,
            satuan: it.satuan || 'PCS',
            harga: hJual,
            subtotal: Math.round(it.qty * hJual),
          };
        }),
        detailRows: isModeProyekBersama
          ? [
              { label: 'Akun Proyek / Bangunan', value: res.mitraPengambilNama },
              { label: 'Sumber Material (Toko Anak Perusahaan)', value: res.anakPerusahaanNama },
              { label: 'No. Nota Referensi', value: noNotaToko.trim() || '-' },
              {
                label: `Status Nota di ${res.anakPerusahaanNama}`,
                value: 'OTOMATIS LUNAS SINKRON (Rp 0 Hutang PT)',
                highlight: true,
              },
              {
                label: `Pencatatan di Buku ${res.mitraPengambilNama}`,
                value:
                  statusProyek === 'LUNAS_SINKRON'
                    ? 'Lunas SINKRON (Rekap Biaya Proyek)'
                    : 'Akumulasi Biaya Proyek (Saldo Berjalan)',
              },
              {
                label: 'Mutasi Kas / Bank PT',
                value: 'Rp 0 (Non-Kas / Sinkron)',
              },
              {
                label: 'Total Biaya Material Proyek',
                value: totalJualMitra,
                isTotal: true,
              },
            ]
          : isModeBayarLunasKasPt
          ? [
              { label: 'Pembeli Barang (Status LUNAS)', value: res.mitraPengambilNama },
              { label: 'Toko / Anak Perusahaan', value: res.anakPerusahaanNama },
              { label: 'No. Nota Referensi', value: noNotaToko.trim() || '-' },
              {
                label: `Uang Masuk ke ${rekLabel} (${rekeningTujuanKasPt})`,
                value: `+${formatRupiah(totalJualMitra)} (${metodeBayarKasPt})`,
                highlight: true,
              },
              {
                label: `Hutang PT ke ${res.anakPerusahaanNama}`,
                value: `+${formatRupiah(totalHppDP)} (Buku JML UANG)`,
              },
              {
                label: 'Status Piutang / Bon Pembeli',
                value: 'LUNAS (Rp 0)',
              },
              {
                label: 'Total Pembayaran Diterima PT',
                value: totalJualMitra,
                isTotal: true,
              },
            ]
          : [
              { label: 'Mitra Pengambil Barang', value: res.mitraPengambilNama },
              {
                label: isModeSesamaMitra ? 'Mitra Penyedia Barang' : 'Toko / Anak Perusahaan',
                value: res.anakPerusahaanNama,
              },
              { label: 'No. Nota Referensi', value: noNotaToko.trim() || '-' },
              {
                label: `Nota Piutang ${res.mitraPengambilNama} ke PT`,
                value: `${formatRupiah(totalJualMitra)} (Harga Jual ke Mitra)`,
                highlight: true,
              },
              {
                label: `Nota Hutang ke ${res.anakPerusahaanNama}`,
                value: `${formatRupiah(totalHppDP)} (Harga Pokok Struk Toko)`,
              },
              ...(labaSelisih > 0
                ? [{ label: 'Laba / Markup Toko', value: `+${formatRupiah(labaSelisih)}` }]
                : []),
              {
                label: 'Total Tagihan Piutang Mitra',
                value: totalJualMitra,
                isTotal: true,
              },
            ],
        catatan:
          keterangan ||
          (isModeProyekBersama
            ? `Material proyek bersama PT WAP & ${res.anakPerusahaanNama}. Nota di ${res.anakPerusahaanNama} otomatis LUNAS SINKRON (tidak menambah hutang PT) dan seluruh item terekap di buku ${res.mitraPengambilNama}.`
            : isModeBayarLunasKasPt
            ? `Pembeli sudah membayar LUNAS (${metodeBayarKasPt}) masuk ke ${rekLabel}. Dana tercatat sebagai hutang PT di buku ${res.anakPerusahaanNama}.`
            : `Saat ${res.mitraPengambilNama} melunasi ke PT, pelunasan hanya mengurangi bon Mitra ke PT tanpa melunasi buku ${res.anakPerusahaanNama}.`),
        kasir: 'Kasir Wijaya Agro',
      };

      try {
        onSuccess(receipt);
      } catch {}
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan Nota Silang');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteNotaSilang(deleteTarget.noNotaSilang);
      const rowMode = resolveHistoryRowMode(deleteTarget);
      const wasLunas = rowMode === 'BAYAR_LUNAS_KAS_PT';
      const wasProyek = rowMode === 'PROYEK_BERSAMA';
      setDeleteTarget(null);
      setSuccessMsg(
        wasProyek
          ? `Nota Proyek Bersama ${deleteTarget.noNotaSilang} berhasil dihapus dari catatan biaya ${deleteTarget.namaMitra} (Buku ${deleteTarget.namaAnakPerusahaan} dan Kas PT tidak terpengaruh).`
          : wasLunas
          ? `Nota Lunas ${deleteTarget.noNotaSilang} berhasil dibatalkan. Saldo Kas/Bank PT dan hutang PT ke ${deleteTarget.namaAnakPerusahaan} otomatis dikembalikan.`
          : `Nota Silang ${deleteTarget.noNotaSilang} berhasil dibatalkan dari kedua buku.`
      );
      loadHistory();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membatalkan Nota Silang');
    } finally {
      setDeleting(false);
    }
  };

  const resolveHistoryRowMode = (ns: NotaSilangRecordSummary): ModeNotaSilang => {
    if (ns.modeNotaSilang) return ns.modeNotaSilang;
    const targetMitra = mitraList.find((m) => m.id === ns.idMitraAnakPerusahaan);
    if (
      targetMitra?.isAnakPerusahaan ||
      ns.idMitraAnakPerusahaan === 'MTR-DPPARABOT' ||
      (ns.namaAnakPerusahaan || '').toUpperCase().includes('PARABOT')
    ) {
      return 'ANAK_PERUSAHAAN';
    }
    return 'SESAMA_MITRA';
  };

  const filteredHistory = useMemo(() => {
    const q = searchHistory.trim().toLowerCase();
    return historyList.filter((h) => {
      const rowMode = resolveHistoryRowMode(h);
      if (filterModeHistory !== 'ALL' && rowMode !== filterModeHistory) return false;
      if (!q) return true;
      return (
        h.noNotaSilang.toLowerCase().includes(q) ||
        h.namaMitra.toLowerCase().includes(q) ||
        h.namaAnakPerusahaan.toLowerCase().includes(q) ||
        (h.noNotaToko || '').toLowerCase().includes(q) ||
        h.items.some((i) => i.namaBarang.toLowerCase().includes(q))
      );
    });
  }, [historyList, searchHistory, filterModeHistory, mitraList]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-indigo-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-700 text-white shrink-0">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-zinc-900 tracking-tight">
              Pembukuan Nota Silang, Titipan Lunas &amp; Proyek Bersama
            </h1>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              Kelola pengambilan barang di toko Anak Perusahaan (<strong>DP Parabot</strong>) untuk{' '}
              <strong>Bon / Piutang Mitra</strong>,{' '}
              <strong>Bayar Lunas masuk Kas/Bank PT</strong>,{' '}
              <strong>Proyek Bersama PT WAP &amp; DP Parabot (Lunas Sinkron · Rp 0 Hutang DP)</strong>, serta opsi{' '}
              <strong>Sesama Mitra</strong>.
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Pilih Jenis Nota Silang, Pihak Terkait & Input Keranjang */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4 text-xs">
            {/* Mode Switcher: 4 Mode Transaksi (2x2 Grid) */}
            <div className="space-y-2">
              <div className="font-bold text-zinc-800 uppercase tracking-wider text-[11px]">
                Pilih Jenis Pembukuan Nota Silang
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setModeNotaSilang('ANAK_PERUSAHAAN')}
                  className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    modeNotaSilang === 'ANAK_PERUSAHAAN'
                      ? 'bg-indigo-700 text-white border-indigo-800'
                      : 'bg-indigo-50/50 hover:bg-indigo-50 text-indigo-950 border-indigo-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs">1. Bon Mitra ⇄ DP Parabot</span>
                    <Building2 className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-snug ${
                      modeNotaSilang === 'ANAK_PERUSAHAAN'
                        ? 'text-indigo-100'
                        : 'text-indigo-800/80'
                    }`}
                  >
                    Mitra ambil barang bon di DP Parabot (+Bon Mitra, +Hutang PT ke DP)
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setModeNotaSilang('BAYAR_LUNAS_KAS_PT')}
                  className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    modeNotaSilang === 'BAYAR_LUNAS_KAS_PT'
                      ? 'bg-emerald-700 text-white border-emerald-800'
                      : 'bg-emerald-50/60 hover:bg-emerald-50 text-emerald-950 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs">2. Bayar Lunas DP → Kas PT</span>
                    <Banknote className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-snug ${
                      modeNotaSilang === 'BAYAR_LUNAS_KAS_PT'
                        ? 'text-emerald-100'
                        : 'text-emerald-800/80'
                    }`}
                  >
                    Ambil barang di DP Parabot bayar lunas, uang masuk Kas/Bank PT → Hutang PT ke DP
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setModeNotaSilang('PROYEK_BERSAMA')}
                  className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    modeNotaSilang === 'PROYEK_BERSAMA'
                      ? 'bg-violet-700 text-white border-violet-800'
                      : 'bg-violet-50/60 hover:bg-violet-50 text-violet-950 border-violet-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs">3. Proyek Bersama (Sinkron DP)</span>
                    <HardHat className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-snug ${
                      modeNotaSilang === 'PROYEK_BERSAMA'
                        ? 'text-violet-100'
                        : 'text-violet-900/80'
                    }`}
                  >
                    Material proyek (cth: Bangunan RM WAP) ambil di DP: DP otomatis Lunas Sinkron (Rp 0 hutang), tercatat per item di buku proyek
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setModeNotaSilang('SESAMA_MITRA')}
                  className={`p-3 rounded-xl border-2 text-left transition-all cursor-pointer ${
                    modeNotaSilang === 'SESAMA_MITRA'
                      ? 'bg-teal-700 text-white border-teal-800'
                      : 'bg-zinc-50 hover:bg-teal-50/50 text-zinc-900 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs">4. Sesama Mitra (Opsi)</span>
                    <Users className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-snug ${
                      modeNotaSilang === 'SESAMA_MITRA' ? 'text-teal-100' : 'text-zinc-500'
                    }`}
                  >
                    Opsi tambahan: Silang piutang barang dari Mitra A ke Mitra B via PT
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-zinc-100">
              {/* Pembeli / Pengambil Barang */}
              <div className="space-y-1.5">
                {isModeBayarLunasKasPt ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-bold text-zinc-700">
                        Pembeli Barang (Lunas / Tanpa Bon)
                      </label>
                      <div className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 p-0.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setTipePembeliLunas('UMUM')}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                            tipePembeliLunas === 'UMUM'
                              ? 'bg-emerald-700 text-white'
                              : 'text-emerald-900 hover:bg-emerald-100'
                          }`}
                        >
                          Customer Umum
                        </button>
                        <button
                          type="button"
                          onClick={() => setTipePembeliLunas('MITRA')}
                          className={`px-2 py-0.5 rounded font-bold cursor-pointer ${
                            tipePembeliLunas === 'MITRA'
                              ? 'bg-emerald-700 text-white'
                              : 'text-emerald-900 hover:bg-emerald-100'
                          }`}
                        >
                          Mitra Terdaftar
                        </button>
                      </div>
                    </div>

                    {tipePembeliLunas === 'UMUM' ? (
                      <div className="relative">
                        <User className="w-3.5 h-3.5 text-emerald-700 absolute left-3 top-2.5" />
                        <input
                          type="text"
                          value={namaPembeliUmum}
                          onChange={(e) => setNamaPembeliUmum(e.target.value)}
                          placeholder="Nama Customer Umum (cth: Bapak Budi / Pembeli Cash)"
                          className="w-full pl-8 pr-3 py-2 border border-emerald-300 bg-emerald-50/30 rounded-lg font-semibold text-zinc-900 focus:bg-white focus:border-emerald-600 focus:outline-none"
                        />
                        <p className="text-[10px] text-zinc-500 mt-1">
                          Boleh dikosongkan jika ingin dicatat sebagai <strong>Customer Umum</strong>.
                        </p>
                      </div>
                    ) : (
                      <SearchableMitraSelect
                        mitras={filteredMitraPengambil}
                        value={idMitraPengambil}
                        onChange={(id) => setIdMitraPengambil(id)}
                        placeholder="Cari & pilih mitra yang bayar lunas..."
                        searchPlaceholder="Ketik nama mitra (cth: SAMLAWI)..."
                        accent="emerald"
                      />
                    )}
                  </>
                ) : (
                  <>
                    <label className="block font-bold text-zinc-700 flex items-center justify-between">
                      <span>
                        {isModeProyekBersama
                          ? 'Akun Proyek / Bangunan (Pencatatan Biaya)'
                          : 'Mitra Pengambil Barang (+Bon ke PT)'}{' '}
                        <span className="text-rose-500">*</span>
                      </span>
                      <span className="text-[10px] font-semibold text-indigo-700">
                        Cari Nama / Kode
                      </span>
                    </label>
                    <SearchableMitraSelect
                      mitras={filteredMitraPengambil}
                      value={idMitraPengambil}
                      onChange={(id) => setIdMitraPengambil(id)}
                      placeholder={
                        isModeProyekBersama
                          ? 'Pilih akun proyek (cth: BANGUNAN RUMAH MAKAN WAP)...'
                          : 'Cari & pilih mitra pengambil...'
                      }
                      searchPlaceholder={
                        isModeProyekBersama
                          ? 'Ketik BANGUNAN / nama proyek...'
                          : 'Ketik nama mitra pengambil (cth: SAMLAWI)...'
                      }
                      accent="indigo"
                    />
                  </>
                )}
              </div>

              {/* Pihak Kedua: Anak Perusahaan (DP Parabot) ATAU Mitra Penyedia */}
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-700 flex items-center justify-between">
                  <span>
                    {isModeSesamaMitra
                      ? 'Mitra Penyedia Barang (+JML UANG di Buku Mitra)'
                      : isModeProyekBersama
                      ? 'Toko Anak Perusahaan (Otomatis Lunas Sinkron · Rp 0 Hutang)'
                      : isModeBayarLunasKasPt
                      ? 'Toko Anak Perusahaan (+Hutang PT)'
                      : 'Toko Anak Perusahaan Penyedia (Fokus Utama)'}{' '}
                    <span className="text-rose-500">*</span>
                  </span>
                  <span
                    className={`text-[10px] font-semibold ${
                      isModeSesamaMitra
                        ? 'text-teal-700'
                        : isModeProyekBersama
                        ? 'text-violet-700'
                        : isModeBayarLunasKasPt
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    Cari Nama / Kode
                  </span>
                </label>

                <SearchableMitraSelect
                  mitras={isModeSesamaMitra ? filteredSesamaMitraOptions : anakPerusahaanOptions}
                  value={idMitraAnakPerusahaan}
                  onChange={(id) => setIdMitraAnakPerusahaan(id)}
                  placeholder={
                    isModeSesamaMitra
                      ? 'Cari & pilih mitra penyedia barang...'
                      : 'Cari & pilih toko anak perusahaan...'
                  }
                  searchPlaceholder={
                    isModeSesamaMitra
                      ? 'Ketik nama mitra penyedia, kode, atau HP...'
                      : 'Ketik nama toko anak perusahaan atau kode...'
                  }
                  accent={isModeSesamaMitra ? 'teal' : isModeBayarLunasKasPt ? 'emerald' : 'amber'}
                />

                <p className="text-[10px] text-zinc-500 leading-snug">
                  {isModeProyekBersama ? (
                    <>
                      Rekening Koran{' '}
                      <strong>{selectedCounterpartyObj?.nama || 'DP Parabot'}</strong>{' '}
                      <strong>TIDAK berubah sama sekali (Rp 0 Hutang PT)</strong> karena proyek
                      bersama sudah otomatis dianggap <strong>LUNAS SINKRON</strong>.
                    </>
                  ) : (
                    <>
                      Otomatis tercatat di buku{' '}
                      <strong>
                        {selectedCounterpartyObj?.nama ||
                          (isModeSesamaMitra ? 'Mitra Penyedia' : 'DP Parabot')}
                      </strong>{' '}
                      pada kolom <strong>JML UANG</strong> (Hutang PT) atas transaksi{' '}
                      <strong>{displayNamaPembeli}</strong>.
                    </>
                  )}
                </p>
              </div>
            </div>

            {/* Pengaturan Status Pencatatan di Buku Proyek (Khusus Mode PROYEK_BERSAMA) */}
            {isModeProyekBersama && (
              <div className="p-3.5 rounded-xl border border-violet-200 bg-violet-50/70 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-violet-950 flex items-center gap-1.5">
                    <HardHat className="w-4 h-4 text-violet-700" />
                    <span>Cara Pencatatan di Buku {selectedMitraObj?.nama || 'Proyek / Bangunan'}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatusProyek('BON_PROYEK')}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      statusProyek === 'BON_PROYEK'
                        ? 'bg-violet-700 text-white border-violet-800'
                        : 'bg-white text-violet-950 border-violet-200 hover:bg-violet-50'
                    }`}
                  >
                    <div className="font-bold text-[11px]">
                      Akumulasi Biaya (Saldo Berjalan)
                    </div>
                    <p
                      className={`text-[10px] mt-0.5 leading-snug ${
                        statusProyek === 'BON_PROYEK' ? 'text-violet-100' : 'text-zinc-600'
                      }`}
                    >
                      Digabung langsung dengan material Toko WAP di Saldo Berjalan agar total belanja bangunan langsung terlihat; dapat di-lunas SINKRON kapan saja.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusProyek('LUNAS_SINKRON')}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      statusProyek === 'LUNAS_SINKRON'
                        ? 'bg-violet-700 text-white border-violet-800'
                        : 'bg-white text-violet-950 border-violet-200 hover:bg-violet-50'
                    }`}
                  >
                    <div className="font-bold text-[11px]">
                      Langsung Lunas SINKRON (Rp 0 Piutang)
                    </div>
                    <p
                      className={`text-[10px] mt-0.5 leading-snug ${
                        statusProyek === 'LUNAS_SINKRON' ? 'text-violet-100' : 'text-zinc-600'
                      }`}
                    >
                      Tidak menambah angka Piutang/Bon PT; langsung tercatat per item di History &amp; Rekap Total Biaya Bangunan.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* Pembayaran Masuk ke Kas / Bank PT (Khusus Mode BAYAR_LUNAS_KAS_PT) */}
            {isModeBayarLunasKasPt && (
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Landmark className="w-4 h-4 text-emerald-700" />
                    <span>Rekening Penerimaan Uang Lunas (Masuk Kas / Bank PT)</span>
                  </div>
                  <div className="inline-flex rounded-lg border border-emerald-300 bg-white p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMetodeBayarKasPt('TUNAI')}
                      className={`px-3 py-1 rounded-md font-bold cursor-pointer ${
                        metodeBayarKasPt === 'TUNAI'
                          ? 'bg-emerald-700 text-white'
                          : 'text-emerald-900 hover:bg-emerald-50'
                      }`}
                    >
                      Tunai / Cash Kasir
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodeBayarKasPt('TRANSFER')}
                      className={`px-3 py-1 rounded-md font-bold cursor-pointer ${
                        metodeBayarKasPt === 'TRANSFER'
                          ? 'bg-emerald-700 text-white'
                          : 'text-emerald-900 hover:bg-emerald-50'
                      }`}
                    >
                      Transfer Bank PT
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-emerald-950 mb-1">
                    Pilih Rekening Kas / Bank PT Penerima Uang <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={rekeningTujuanKasPt}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRekeningTujuanKasPt(val);
                      if (val === 'KAS01') {
                        setMetodeBayarKasPt('TUNAI');
                      } else {
                        setMetodeBayarKasPt('TRANSFER');
                      }
                    }}
                    className="w-full px-3 py-2 border border-emerald-300 rounded-lg bg-white font-bold text-zinc-900"
                  >
                    {rekeningKasPtOptions.map((rk) => (
                      <option key={rk.kode} value={rk.kode}>
                        {rk.nama} ({rk.kode}) — Saldo: {formatRupiah(rk.saldoSaatIni)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-100">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Tanggal Nota</label>
                <input
                  type="text"
                  value={tanggalInput}
                  onChange={(e) => setTanggalInput(e.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  {isModeSesamaMitra ? 'No. Nota / Ref (Opsional)' : 'No. Nota Toko (Opsional)'}
                </label>
                <input
                  type="text"
                  value={noNotaToko}
                  onChange={(e) => setNoNotaToko(e.target.value)}
                  placeholder="Contoh: #16581"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">
                  Ringkasan Keterangan
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Cth: TV dan Parabola Satu Set"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Step 2: Form Tambah Barang ke Keranjang Nota Silang */}
          <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-bold text-zinc-800 uppercase tracking-wider text-[11px] flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                <span>Input Barang ke Keranjang Nota Silang (Nama Barang, Qty, Harga)</span>
              </div>
              <span className="text-[11px] text-zinc-500">Bisa banyak barang sekaligus</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-5">
                <label className="block font-bold text-zinc-700 mb-1">
                  Nama Barang <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={namaBarangInput}
                  onChange={(e) => setNamaBarangInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                  placeholder='Cth: TV Politron 24" Set / Parabola'
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-semibold text-zinc-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-zinc-700 mb-1">Qty</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="w-full px-2.5 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-center"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-zinc-700 mb-1">Satuan</label>
                <select
                  value={satuanInput}
                  onChange={(e) => setSatuanInput(e.target.value)}
                  className="w-full px-2 py-2 border border-zinc-300 rounded-lg font-semibold"
                >
                  <option value="PCS">PCS</option>
                  <option value="SET">SET</option>
                  <option value="UNIT">UNIT</option>
                  <option value="SAK">SAK</option>
                  <option value="KG">KG</option>
                  <option value="BATANG">BTG</option>
                  <option value="METER">MTR</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block font-bold text-zinc-700 mb-1">
                  Harga Satuan (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={hargaInput}
                  onChange={(e) => setHargaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddItem();
                    }
                  }}
                  placeholder="2800000"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg font-mono tabular-nums font-bold text-zinc-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
              <div className="text-xs text-zinc-600">
                Subtotal baris ini:{' '}
                <strong className="font-mono tabular-nums text-zinc-900">
                  {formatRupiah((Number(qtyInput) || 0) * (Number(hargaInput) || 0))}
                </strong>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Masukkan ke Keranjang</span>
              </button>
            </div>

            <div className="pt-2 border-t border-zinc-100">
              <ImageUploadZone
                label="Upload Foto Struk / Nota Referensi (Opsional)"
                sublabel={
                  isModeSesamaMitra
                    ? 'Bukti serah terima barang sesama mitra'
                    : 'Contoh: Struk Toko Devi Perabot #16581'
                }
                value={fotoNota}
                onChange={setFotoNota}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Keranjang Nota Silang + Simulasi Pembukuan Silang */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`bg-white rounded-xl border overflow-hidden ${
              isModeProyekBersama
                ? 'border-violet-200'
                : isModeBayarLunasKasPt
                ? 'border-emerald-200'
                : 'border-indigo-200'
            }`}
          >
            <div
              className={`p-4 text-white flex items-center justify-between ${
                isModeProyekBersama
                  ? 'bg-violet-900'
                  : isModeBayarLunasKasPt
                  ? 'bg-emerald-900'
                  : isModeSesamaMitra
                  ? 'bg-teal-900'
                  : 'bg-indigo-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isModeProyekBersama
                    ? `Keranjang Material Proyek (${cart.length} Item)`
                    : isModeBayarLunasKasPt
                    ? `Keranjang Nota Lunas DP (${cart.length} Barang)`
                    : `Keranjang Nota Silang (${cart.length} Barang)`}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] text-rose-300 hover:text-white underline cursor-pointer"
                >
                  Kosongkan
                </button>
              )}
            </div>

            <div className="p-3.5 divide-y divide-zinc-100 max-h-72 overflow-y-auto text-xs">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-zinc-400">
                  Belum ada barang di keranjang Nota Silang. Input{' '}
                  <strong>Nama Barang, Qty, dan Harga</strong> lalu klik{' '}
                  <strong>+ Masukkan ke Keranjang</strong>.
                </div>
              ) : (
                cart.map((row, idx) => (
                  <div key={row.id} className="py-2.5 first:pt-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={row.namaBarang}
                        onChange={(e) =>
                          handleUpdateCartRow(row.id, { namaBarang: e.target.value })
                        }
                        className="flex-1 px-2 py-1 border border-transparent hover:border-zinc-300 focus:border-indigo-500 rounded font-bold text-zinc-900 bg-transparent focus:bg-white"
                      />
                      <span className="text-[10px] font-mono text-zinc-400">#{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCartRow(row.id)}
                        className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-zinc-50 p-2 rounded-lg font-mono tabular-nums text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0.01"
                          step="any"
                          value={row.qty}
                          onChange={(e) =>
                            handleUpdateCartRow(row.id, { qty: Number(e.target.value) || 1 })
                          }
                          className="w-14 px-1.5 py-0.5 border border-zinc-300 rounded bg-white text-center font-bold"
                        />
                        <span className="text-zinc-500">{row.satuan} ×</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.harga}
                          onChange={(e) =>
                            handleUpdateCartRow(row.id, { harga: Number(e.target.value) || 0 })
                          }
                          className="w-24 px-1.5 py-0.5 border border-zinc-300 rounded bg-white text-right font-bold"
                        />
                      </div>
                      <span className="font-bold text-indigo-800">{formatRupiah(row.subtotal)}</span>
                    </div>
                    {pakaiHargaMusiman && (
                      <div className="flex items-center justify-between gap-2 bg-amber-50/80 px-2 py-1.5 rounded-lg border border-amber-200 text-[11px]">
                        <span className="text-amber-900 font-semibold">
                          +Markup Musiman / {row.satuan || 'PCS'}:
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            value={(row as any).markupPerSatuan || ''}
                            onChange={(e) =>
                              handleUpdateCartRow(row.id, {
                                markupPerSatuan: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                            className="w-24 px-2 py-0.5 rounded border border-amber-300 bg-white font-mono text-right text-amber-900 font-bold"
                          />
                          <span className="font-mono text-amber-800">
                            (+{formatRupiah(Math.round(row.qty * Number((row as any).markupPerSatuan || 0)))})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-zinc-50 border-t border-zinc-200 space-y-3 text-xs">
              <div className="flex items-center justify-between text-base font-black text-zinc-900">
                <span>Total Nota Silang:</span>
                <span className="font-mono tabular-nums text-indigo-800">
                  {formatRupiah(grandTotal)}
                </span>
              </div>

              {/* Opsi Harga Musiman (Piutang Mitra Per Item) - tidak perlu pada Proyek Bersama */}
              {!isModeProyekBersama && (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-amber-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pakaiHargaMusiman}
                      onChange={(e) => setPakaiHargaMusiman(e.target.checked)}
                      className="rounded border-amber-400"
                    />
                    <span>Gunakan Harga Musiman (Markup Per Item di Keranjang)</span>
                  </label>
                  <p className="text-[11px] text-amber-800">
                    Piutang ke <strong>DP Parabot</strong> tetap sesuai{' '}
                    <strong>Harga Struk ({formatRupiah(grandTotal)})</strong>. Jika dicentang, isi{' '}
                    <strong>+Markup Musiman</strong> pada masing-masing barang di keranjang di atas
                    (Total Markup: <strong>+{formatRupiah(totalMarkupMusiman)}</strong>).
                  </p>
                </div>
              )}

              {/* Simulasi Efek Pembukuan */}
              <div
                className={`p-3 rounded-xl border space-y-1.5 text-[11px] ${
                  isModeProyekBersama
                    ? 'bg-violet-50/80 border-violet-200 text-violet-950'
                    : isModeBayarLunasKasPt
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                    : isModeSesamaMitra
                    ? 'bg-teal-50/80 border-teal-200 text-teal-950'
                    : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                }`}
              >
                <div className="font-bold uppercase tracking-wider text-[10px]">
                  Alur Pembukuan Otomatis (
                  {isModeProyekBersama
                    ? 'Proyek Bersama · DP Parabot Lunas Sinkron'
                    : isModeBayarLunasKasPt
                    ? 'Bayar Lunas DP → Masuk Kas / Bank PT'
                    : isModeSesamaMitra
                    ? 'Opsi Sesama Mitra'
                    : 'Fokus Utama: Bon Anak Perusahaan'}
                  ):
                </div>
                {isModeProyekBersama ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span>1. Buku {selectedMitraObj?.nama || 'Proyek / Bangunan'}:</span>
                      <strong className="font-mono tabular-nums text-violet-900">
                        {statusProyek === 'LUNAS_SINKRON'
                          ? `Lunas SINKRON ${formatRupiah(grandTotal)}`
                          : `+Biaya Proyek ${formatRupiah(grandTotal)}`}
                      </strong>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>2. Buku {selectedCounterpartyObj?.nama || 'DP Parabot'}:</span>
                      <strong className="font-mono tabular-nums text-emerald-700">
                        OTOMATIS LUNAS (Rp 0 Hutang)
                      </strong>
                    </div>
                    <div className="text-[10px] pt-1 border-t border-violet-300/60 leading-snug opacity-95">
                      3. Kas/Bank PT <strong>tetap Rp 0 berubah (Non-Kas / Sinkron)</strong>. Setiap
                      material tercatat rinci per item di Rekening Koran{' '}
                      <strong>{selectedMitraObj?.nama || 'Bangunan'}</strong> dan otomatis masuk ke
                      panel <strong>Rekap Total Biaya Bangunan</strong> tanpa menyentuh saldo{' '}
                      {selectedCounterpartyObj?.nama || 'DP Parabot'}.
                    </div>
                  </>
                ) : isModeBayarLunasKasPt ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span>
                        1. {selectedRekeningKasPtObj?.nama || rekeningTujuanKasPt} (
                        {rekeningTujuanKasPt}):
                      </span>
                      <strong className="font-mono tabular-nums text-emerald-800">
                        +Uang Masuk {formatRupiah(totalPiutangMitra)}
                      </strong>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>
                        2. Buku {selectedCounterpartyObj?.nama || 'DP Parabot'} (Hutang PT):
                      </span>
                      <strong className="font-mono tabular-nums text-sky-800">
                        +JML UANG {formatRupiah(grandTotal)}
                      </strong>
                    </div>
                    <div className="text-[10px] pt-1 border-t border-emerald-300/60 leading-snug opacity-95">
                      3. Pembeli <strong>{displayNamaPembeli}</strong> berstatus{' '}
                      <strong>LUNAS ({metodeBayarKasPt})</strong> — tidak dicatat sebagai bon /
                      piutang (Rp 0). Pembayaran dari PT ke{' '}
                      {selectedCounterpartyObj?.nama || 'DP Parabot'} dilakukan nanti lewat menu
                      Bayar Titipan / Hutang.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <span>1. Buku {selectedMitraObj?.nama || 'Mitra Pengambil'}:</span>
                      <strong className="font-mono tabular-nums text-amber-800">
                        +Bon ke PT {formatRupiah(totalPiutangMitra)}
                      </strong>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>
                        2. Buku{' '}
                        {selectedCounterpartyObj?.nama ||
                          (isModeSesamaMitra ? 'Mitra Penyedia' : 'DP Parabot')}
                        :
                      </span>
                      <strong className="font-mono tabular-nums text-sky-800">
                        +JML UANG {formatRupiah(grandTotal)}
                      </strong>
                    </div>
                    <div className="text-[10px] pt-1 border-t border-zinc-300/60 leading-snug opacity-90">
                      3. Kas/Bank PT saat ini <strong>tetap Rp 0 berubah</strong>. Saat{' '}
                      {selectedMitraObj?.nama || 'Mitra'} membayar bon ke PT nanti, uang masuk ke PT
                      dan hanya melunasi bon {selectedMitraObj?.nama || 'Mitra'} ke PT.
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                disabled={
                  submitting ||
                  (cart.length === 0 && (!namaBarangInput.trim() || Number(hargaInput) <= 0))
                }
                onClick={handleSubmitNotaSilang}
                className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  isModeProyekBersama
                    ? 'bg-violet-700 hover:bg-violet-800'
                    : isModeBayarLunasKasPt
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : isModeSesamaMitra
                    ? 'bg-teal-700 hover:bg-teal-800'
                    : 'bg-indigo-700 hover:bg-indigo-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Menyimpan Pembukuan...'
                    : isModeProyekBersama
                    ? `Catat Material Proyek Bersama (${formatRupiah(grandTotal)})`
                    : isModeBayarLunasKasPt
                    ? `Simpan Nota Lunas → Kas PT (${formatRupiah(totalPiutangMitra)})`
                    : `Simpan Nota Silang (${formatRupiah(totalPiutangMitra)})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History Table Nota Silang */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <div className="p-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-zinc-50/70">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-700" />
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Daftar Rekapan Nota Silang Tercatat ({filteredHistory.length})
              </h2>
              <p className="text-[11px] text-zinc-500">
                Klik tombol Edit untuk mengubah nama mitra, nama barang, qty, atau harga satuan kapan saja.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setFilterModeHistory('ALL')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterModeHistory === 'ALL'
                    ? 'bg-white text-zinc-900 shadow-2xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setFilterModeHistory('ANAK_PERUSAHAAN')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterModeHistory === 'ANAK_PERUSAHAAN'
                    ? 'bg-indigo-700 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Bon DP
              </button>
              <button
                type="button"
                onClick={() => setFilterModeHistory('BAYAR_LUNAS_KAS_PT')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterModeHistory === 'BAYAR_LUNAS_KAS_PT'
                    ? 'bg-emerald-700 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Lunas → Kas PT
              </button>
              <button
                type="button"
                onClick={() => setFilterModeHistory('PROYEK_BERSAMA')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterModeHistory === 'PROYEK_BERSAMA'
                    ? 'bg-violet-700 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Proyek Bersama
              </button>
              <button
                type="button"
                onClick={() => setFilterModeHistory('SESAMA_MITRA')}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                  filterModeHistory === 'SESAMA_MITRA'
                    ? 'bg-teal-700 text-white'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Sesama Mitra
              </button>
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchHistory}
                onChange={(e) => setSearchHistory(e.target.value)}
                placeholder="Cari mitra, barang, no nota..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-zinc-100 border-b border-zinc-200 text-[10px] font-bold uppercase text-zinc-600">
              <tr>
                <th className="py-2.5 px-3.5">No. Nota Silang</th>
                <th className="py-2.5 px-3.5">Tanggal</th>
                <th className="py-2.5 px-3.5">Mitra Pengambil</th>
                <th className="py-2.5 px-3.5">Pihak Penyedia</th>
                <th className="py-2.5 px-3.5">Rincian Keranjang Barang</th>
                <th className="py-2.5 px-3.5 text-right">Total Nominal</th>
                <th className="py-2.5 px-3.5 text-center">Edit, Buku &amp; Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loadingHistory ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400">
                    Memuat data Nota Silang...
                  </td>
                </tr>
              ) : filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400">
                    Belum ada transaksi Nota Silang tercatat pada filter ini.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((ns) => {
                  const rowMode = resolveHistoryRowMode(ns);
                  const isSesama = rowMode === 'SESAMA_MITRA';
                  const isLunasKasPt = rowMode === 'BAYAR_LUNAS_KAS_PT';
                  const isProyek = rowMode === 'PROYEK_BERSAMA';
                  return (
                    <tr key={ns.noNotaSilang} className="hover:bg-zinc-50/80">
                      <td
                        className={`py-3 px-3.5 font-mono font-bold whitespace-nowrap ${
                          isProyek
                            ? 'text-violet-800'
                            : isLunasKasPt
                            ? 'text-emerald-800'
                            : 'text-indigo-800'
                        }`}
                      >
                        <div>{ns.noNotaSilang}</div>
                        <div className="text-[10px] font-sans font-normal text-zinc-500">
                          {isProyek
                            ? 'Proyek Bersama · Sinkron DP'
                            : isLunasKasPt
                            ? 'Bayar Lunas → Kas PT'
                            : isSesama
                            ? 'Sesama Mitra'
                            : 'Bon Anak Perusahaan'}
                          {ns.noNotaToko ? ` · Ref: ${ns.noNotaToko}` : ''}
                        </div>
                        {isLunasKasPt && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-sans font-bold">
                            <span>
                              LUNAS · {ns.metodeBayarKasPt || 'TUNAI'} →{' '}
                              {ns.rekeningTujuanKasPt || 'KAS01'}
                            </span>
                          </div>
                        )}
                        {isProyek && (
                          <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-800 text-[10px] font-sans font-bold">
                            <span>
                              DP LUNAS SINKRON ·{' '}
                              {ns.statusProyek === 'LUNAS_SINKRON'
                                ? 'Lunas Sinkron'
                                : 'Akumulasi Biaya'}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                        {ns.tanggal}
                      </td>
                      <td className="py-3 px-3.5">
                        <div className="font-bold text-zinc-900">{ns.namaMitra}</div>
                        {isLunasKasPt && (
                          <div className="text-[10px] text-emerald-700 font-semibold">
                            {ns.idMitra === 'UMUM' ? 'Customer Umum · Lunas' : 'Mitra · Lunas'}
                          </div>
                        )}
                        {isProyek && (
                          <div className="text-[10px] text-violet-700 font-semibold">
                            Akun Proyek Bersama
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5">
                        <div
                          className={`font-bold ${
                            isProyek
                              ? 'text-violet-900'
                              : isSesama
                              ? 'text-teal-800'
                              : isLunasKasPt
                              ? 'text-emerald-900'
                              : 'text-amber-900'
                          }`}
                        >
                          {ns.namaAnakPerusahaan}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {isProyek
                            ? 'Otomatis Lunas Sinkron (Rp 0 Hutang)'
                            : isSesama
                            ? 'Mitra Penyedia'
                            : isLunasKasPt
                            ? 'Hutang PT ke Toko Anak Perusahaan'
                            : 'Anak Perusahaan PT'}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-zinc-700 min-w-[280px]">
                        <div className="border border-zinc-200 rounded-lg overflow-hidden bg-white">
                          <table className="w-full text-[11px] border-collapse">
                            <thead className="bg-zinc-50 border-b border-zinc-200 text-[9px] font-bold uppercase text-zinc-500">
                              <tr>
                                <th className="py-1 px-2 text-left">Item Barang</th>
                                <th className="py-1 px-2 text-center">Qty</th>
                                <th className="py-1 px-2 text-right">Harga</th>
                                <th className="py-1 px-2 text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              {ns.items.map((it, i) => (
                                <tr key={i}>
                                  <td className="py-1 px-2 font-semibold text-zinc-900">
                                    {i + 1}. {it.namaBarang}
                                  </td>
                                  <td className="py-1 px-2 text-center font-mono tabular-nums text-zinc-700 whitespace-nowrap">
                                    {it.qty} {it.satuan || 'PCS'}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                                    {formatRupiah(it.harga)}
                                  </td>
                                  <td className="py-1 px-2 text-right font-mono tabular-nums font-semibold text-zinc-900 whitespace-nowrap">
                                    {formatRupiah(it.subtotal || it.qty * it.harga)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {ns.keterangan && (
                          <div className="mt-1 text-[10px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
                            <strong>Ket:</strong> {ns.keterangan}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-indigo-900 whitespace-nowrap align-top">
                        <div>{formatRupiah(ns.totalNominal)}</div>
                        <div className="text-[10px] font-sans font-normal text-zinc-500">
                          {ns.items.length} item digabung
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditTxId(ns.noNotaSilang)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-900 text-zinc-800 hover:text-white border border-zinc-200 text-[10px] font-semibold cursor-pointer transition-colors"
                            title="Edit nama mitra, nama barang, qty, harga, atau tanggal Nota Silang"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>

                          {onOpenRekeningKoranMitra && (
                            <>
                              {ns.idMitra && ns.idMitra !== 'UMUM' && (
                                <button
                                  type="button"
                                  onClick={() => onOpenRekeningKoranMitra(ns.idMitra)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 hover:bg-amber-600 text-amber-900 hover:text-white border border-amber-300 text-[10px] font-bold cursor-pointer transition-colors"
                                  title={`Buka Rekening Koran ${ns.namaMitra}`}
                                >
                                  <span>{isProyek ? 'Buku Proyek' : 'Buku Mitra'}</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onOpenRekeningKoranMitra(ns.idMitraAnakPerusahaan)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-50 hover:bg-sky-700 text-sky-900 hover:text-white border border-sky-300 text-[10px] font-bold cursor-pointer transition-colors"
                                title={`Buka Rekening Koran ${ns.namaAnakPerusahaan}`}
                              >
                                <span>
                                  {isProyek ? 'Buku DP' : isSesama ? 'Buku Mitra 2' : 'Buku Toko'}
                                </span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(ns)}
                            className="p-1 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            title="Batalkan Nota Silang"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Modal Universal Edit Nota Silang */}
      <ModalEditTransaksiUniversal
        isOpen={Boolean(editTxId)}
        transactionId={editTxId}
        jenisHint="NOTA_SILANG"
        onClose={() => setEditTxId(null)}
        onSuccess={() => {
          loadHistory();
          onRefresh();
        }}
      />

      {/* Modal Konfirmasi Hapus Nota Silang */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 border border-zinc-200 shadow-2xl text-xs">
            <div className="font-bold text-sm text-rose-800">
              Batalkan Nota Silang {deleteTarget.noNotaSilang}?
            </div>
            <p className="text-zinc-600 leading-relaxed">
              {resolveHistoryRowMode(deleteTarget) === 'PROYEK_BERSAMA' ? (
                <>
                  Membatalkan Nota Proyek Bersama ini hanya akan menghapus catatan biaya material
                  senilai <strong>{formatRupiah(deleteTarget.totalNominal)}</strong> dari buku{' '}
                  <strong>{deleteTarget.namaMitra}</strong>. Rekening Koran{' '}
                  <strong>{deleteTarget.namaAnakPerusahaan}</strong> dan Kas PT tidak berubah.
                </>
              ) : resolveHistoryRowMode(deleteTarget) === 'BAYAR_LUNAS_KAS_PT' ? (
                <>
                  Membatalkan Nota Lunas ini akan mengurangi kembali saldo{' '}
                  <strong>
                    {deleteTarget.rekeningTujuanNama ||
                      deleteTarget.rekeningTujuanKasPt ||
                      'Kas Utama Kasir'}
                  </strong>{' '}
                  sekaligus menghapus catatan hutang PT (JML UANG) pada buku{' '}
                  <strong>{deleteTarget.namaAnakPerusahaan}</strong> senilai{' '}
                  <strong>{formatRupiah(deleteTarget.totalNominal)}</strong>.
                </>
              ) : (
                <>
                  Membatalkan Nota Silang ini akan menghapus piutang pada buku{' '}
                  <strong>{deleteTarget.namaMitra}</strong> sekaligus menghapus catatan JML UANG
                  pada buku <strong>{deleteTarget.namaAnakPerusahaan}</strong> senilai{' '}
                  <strong>{formatRupiah(deleteTarget.totalNominal)}</strong>.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Batalkan Nota Silang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
