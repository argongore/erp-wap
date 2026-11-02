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
} from 'lucide-react';
import { Mitra, NotaSilangItemInput, NotaSilangRecordSummary } from '../../server/types.ts';
import { api } from '../../api/client.ts';
import { formatRupiah, getWIBTodayString } from '../../utils/format.ts';
import { ReceiptData } from '../common/PrintReceiptModal.tsx';
import { ImageUploadZone } from '../common/ImageUploadZone.tsx';
import { ModalEditTransaksiUniversal } from '../common/ModalEditTransaksiUniversal.tsx';

interface Props {
  mitraList: Mitra[];
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

  // Mode Nota Silang: Fokus Utama = ANAK_PERUSAHAAN, Opsi Tambahan = SESAMA_MITRA
  const [modeNotaSilang, setModeNotaSilang] = useState<'ANAK_PERUSAHAAN' | 'SESAMA_MITRA'>(
    'ANAK_PERUSAHAAN'
  );

  const mitraPengambilBaseOptions = useMemo(
    () => activeMitras.filter((m) => m.id !== defaultAnakId),
    [activeMitras, defaultAnakId]
  );

  const [idMitraPengambil, setIdMitraPengambil] = useState<string>(
    mitraPengambilBaseOptions[0]?.id || ''
  );
  const [searchMitra, setSearchMitra] = useState<string>('');
  const [searchMitraPenyedia, setSearchMitraPenyedia] = useState<string>('');
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
  const [filterModeHistory, setFilterModeHistory] = useState<
    'ALL' | 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA'
  >('ALL');
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

  // Synchronize counterparty selection when switching between Fokus Utama (Anak Perusahaan) & Opsi Sesama Mitra
  useEffect(() => {
    if (modeNotaSilang === 'ANAK_PERUSAHAAN') {
      const validAnak = anakPerusahaanOptions.some((m) => m.id === idMitraAnakPerusahaan);
      if (!validAnak && defaultAnakId) {
        setIdMitraAnakPerusahaan(defaultAnakId);
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
  }, [modeNotaSilang, idMitraPengambil, activeMitras, anakPerusahaanOptions, defaultAnakId]);

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

  const filteredMitraPengambil = useMemo(() => {
    const q = searchMitra.trim().toLowerCase();
    const base = activeMitras.filter((m) => m.id !== idMitraAnakPerusahaan);
    if (!q) return base;
    return base.filter(
      (m) =>
        m.nama.toLowerCase().includes(q) ||
        m.kode.toLowerCase().includes(q) ||
        (m.alamat || '').toLowerCase().includes(q)
    );
  }, [activeMitras, idMitraAnakPerusahaan, searchMitra]);

  const filteredSesamaMitraOptions = useMemo(() => {
    const q = searchMitraPenyedia.trim().toLowerCase();
    const nonSubPeers = activeMitras.filter(
      (m) =>
        m.id !== idMitraPengambil &&
        !m.isAnakPerusahaan &&
        m.id !== 'MTR-DPPARABOT'
    );
    const base =
      nonSubPeers.length > 0
        ? nonSubPeers
        : activeMitras.filter((m) => m.id !== idMitraPengambil);
    if (!q) return base;
    return base.filter(
      (m) =>
        m.nama.toLowerCase().includes(q) ||
        m.kode.toLowerCase().includes(q) ||
        (m.alamat || '').toLowerCase().includes(q)
    );
  }, [activeMitras, idMitraPengambil, searchMitraPenyedia]);

  const selectedMitraObj = useMemo(
    () => activeMitras.find((m) => m.id === idMitraPengambil),
    [activeMitras, idMitraPengambil]
  );

  const selectedCounterpartyObj = useMemo(
    () => activeMitras.find((m) => m.id === idMitraAnakPerusahaan),
    [activeMitras, idMitraAnakPerusahaan]
  );

  const isModeSesamaMitra = modeNotaSilang === 'SESAMA_MITRA';

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
    patch: Partial<Pick<CartSilangRow, 'namaBarang' | 'qty' | 'harga' | 'satuan'>>
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

  const grandTotal = useMemo(
    () => cart.reduce((sum, r) => sum + r.subtotal, 0),
    [cart]
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

    if (!idMitraPengambil) {
      setErrorMsg('Pilih Mitra yang mengambil barang terlebih dahulu.');
      return;
    }
    if (!idMitraAnakPerusahaan || idMitraPengambil === idMitraAnakPerusahaan) {
      setErrorMsg('Pihak pengambil dan pihak penyedia barang tidak boleh mitra yang sama.');
      return;
    }
    if (itemsToSubmit.length === 0) {
      setErrorMsg('Tambahkan minimal 1 barang ke Keranjang Nota Silang (Nama Barang, Qty, Harga).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.processNotaSilang({
        idMitraPengambil,
        idMitraAnakPerusahaan,
        modeNotaSilang,
        tanggal: tanggalInput,
        noNotaToko: noNotaToko.trim() || undefined,
        fotoNota: fotoNota || undefined,
        keterangan: keterangan.trim() || undefined,
        items: itemsToSubmit.map((it) => ({
          namaBarang: it.namaBarang,
          qty: it.qty,
          satuan: it.satuan,
          harga: it.harga,
        })),
      });

      setCart([]);
      setNamaBarangInput('');
      setQtyInput('1');
      setHargaInput('');
      setNoNotaToko('');
      setKeterangan('');
      setFotoNota('');
      setSuccessMsg(
        `Nota Silang ${res.noNotaSilang} (${
          isModeSesamaMitra ? 'Sesama Mitra' : 'Mitra ⇄ Anak Perusahaan'
        }) berhasil dibukukan! Piutang ${res.mitraPengambilNama} ke PT bertambah +${formatRupiah(
          res.totalNominal
        )} dan Buku ${res.anakPerusahaanNama} tercatat JML UANG +${formatRupiah(res.totalNominal)}.`
      );
      loadHistory();
      onRefresh();

      const receipt: ReceiptData = {
        title: isModeSesamaMitra
          ? 'BUKTI PEMBUKUAN NOTA SILANG (SESAMA MITRA PT)'
          : 'BUKTI PEMBUKUAN NOTA SILANG (MITRA & ANAK PERUSAHAAN)',
        subtitle: `Pengambil: ${res.mitraPengambilNama} | ${
          isModeSesamaMitra ? 'Mitra Penyedia' : 'Anak Perusahaan'
        }: ${res.anakPerusahaanNama}`,
        nomorTransaksi: res.noNotaSilang,
        tanggal: res.penjualanMitra.tanggal,
        jam: res.penjualanMitra.jam,
        mitra: res.mitraPengambilNama,
        rekening: isModeSesamaMitra
          ? 'NOTA SILANG SESAMA MITRA (PIUTANG MITRA → PT → MITRA PENYEDIA)'
          : 'NOTA SILANG UTAMA (PIUTANG MITRA → PT → ANAK PERUSAHAAN)',
        kategori: 'NOTA_SILANG',
        fotoNota: res.penjualanMitra.fotoNota,
        items: itemsToSubmit.map((it) => ({
          nama: it.namaBarang,
          qty: it.qty,
          satuan: it.satuan || 'PCS',
          harga: it.harga,
          subtotal: it.subtotal,
        })),
        detailRows: [
          { label: 'Mitra Pengambil Barang', value: res.mitraPengambilNama },
          {
            label: isModeSesamaMitra ? 'Mitra Penyedia Barang' : 'Toko / Anak Perusahaan',
            value: res.anakPerusahaanNama,
          },
          { label: 'No. Nota Referensi', value: noNotaToko.trim() || '-' },
          {
            label: `Efek Buku ${res.mitraPengambilNama}`,
            value: `+Piutang / Bon ke PT (${formatRupiah(res.totalNominal)})`,
            highlight: true,
          },
          {
            label: `Efek Buku ${res.anakPerusahaanNama}`,
            value: `+JML UANG / Hak atas nama ${res.mitraPengambilNama}`,
          },
          {
            label: 'Total Nilai Nota Silang',
            value: res.totalNominal,
            isTotal: true,
          },
        ],
        catatan:
          keterangan ||
          `Saat ${res.mitraPengambilNama} melunasi ke PT, pelunasan hanya mengurangi bon Mitra ke PT tanpa melunasi buku ${res.anakPerusahaanNama}.`,
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
      setDeleteTarget(null);
      setSuccessMsg(
        `Nota Silang ${deleteTarget.noNotaSilang} berhasil dibatalkan dari kedua buku.`
      );
      loadHistory();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal membatalkan Nota Silang');
    } finally {
      setDeleting(false);
    }
  };

  const resolveHistoryRowMode = (
    ns: NotaSilangRecordSummary
  ): 'ANAK_PERUSAHAAN' | 'SESAMA_MITRA' => {
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
              Pembukuan Nota Silang (Fokus Utama: Mitra ⇄ Anak Perusahaan · Opsi: Sesama Mitra)
            </h1>
            <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
              <strong>Fokus Utama:</strong> Mitra PT mengambil barang piutang di toko Anak Perusahaan (contoh: <strong>DP Parabot</strong>) dengan PT sebagai penanggung jawab. Tersedia juga <strong>Opsi Nota Silang Sesama Mitra</strong> apabila transaksi silang dilakukan antar sesama mitra PT.
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
            {/* Mode Switcher: Fokus Utama (Anak Perusahaan) vs Opsi Sesama Mitra */}
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
                    <span className="font-black text-xs">
                      1. Mitra ⇄ Anak Perusahaan (Utama)
                    </span>
                    <Building2 className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-snug ${
                      modeNotaSilang === 'ANAK_PERUSAHAAN'
                        ? 'text-indigo-100'
                        : 'text-indigo-800/80'
                    }`}
                  >
                    Fokus utama: Mitra ambil barang di DP Parabot / Anak Perusahaan PT
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
                    <span className="font-black text-xs">
                      2. Nota Silang Sesama Mitra (Opsi)
                    </span>
                    <Users className="w-4 h-4 shrink-0 opacity-85" />
                  </div>
                  <p
                    className={`text-[11px] mt-1 leading-snug ${
                      modeNotaSilang === 'SESAMA_MITRA' ? 'text-teal-100' : 'text-zinc-500'
                    }`}
                  >
                    Opsi tambahan: Silang piutang barang dari Mitra A ke Mitra B melalui PT
                  </p>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-zinc-100">
              {/* Mitra Pengambil */}
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-700">
                  Mitra Pengambil Barang (+Bon ke PT) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchMitra}
                    onChange={(e) => setSearchMitra(e.target.value)}
                    placeholder="Cari mitra pengambil (cth: SAMLAWI)..."
                    className="w-full pl-8 pr-3 py-1.5 border border-zinc-300 rounded-lg text-xs mb-1.5"
                  />
                </div>
                <select
                  value={idMitraPengambil}
                  onChange={(e) => setIdMitraPengambil(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-300 bg-indigo-50/40 rounded-lg font-bold text-zinc-900"
                >
                  {filteredMitraPengambil.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nama} ({m.kode})
                    </option>
                  ))}
                </select>
              </div>

              {/* Pihak Kedua: Anak Perusahaan (Fokus Utama) ATAU Mitra Penyedia (Sesama Mitra) */}
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-700">
                  {isModeSesamaMitra
                    ? 'Mitra Penyedia Barang (+JML UANG di Buku Mitra)'
                    : 'Toko Anak Perusahaan Penyedia (Fokus Utama)'}{' '}
                  <span className="text-rose-500">*</span>
                </label>

                {isModeSesamaMitra && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={searchMitraPenyedia}
                      onChange={(e) => setSearchMitraPenyedia(e.target.value)}
                      placeholder="Cari mitra penyedia barang..."
                      className="w-full pl-8 pr-3 py-1.5 border border-zinc-300 rounded-lg text-xs mb-1.5"
                    />
                  </div>
                )}

                <select
                  value={idMitraAnakPerusahaan}
                  onChange={(e) => setIdMitraAnakPerusahaan(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg font-bold ${
                    isModeSesamaMitra
                      ? 'border-teal-300 bg-teal-50/50 text-teal-950'
                      : 'border-amber-300 bg-amber-50/50 text-amber-950'
                  }`}
                >
                  {(isModeSesamaMitra ? filteredSesamaMitraOptions : anakPerusahaanOptions).map(
                    (m) => (
                      <option key={m.id} value={m.id}>
                        {m.nama} ({m.kode})
                      </option>
                    )
                  )}
                </select>

                <p className="text-[10px] text-zinc-500 leading-snug">
                  Otomatis tercatat di buku{' '}
                  <strong>
                    {selectedCounterpartyObj?.nama ||
                      (isModeSesamaMitra ? 'Mitra Penyedia' : 'DP Parabot')}
                  </strong>{' '}
                  pada kolom <strong>JML UANG</strong> atas nama{' '}
                  <strong>{selectedMitraObj?.nama || 'Mitra'}</strong>.
                </p>
              </div>
            </div>

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
          <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
            <div
              className={`p-4 text-white flex items-center justify-between ${
                isModeSesamaMitra ? 'bg-teal-900' : 'bg-indigo-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Keranjang Nota Silang ({cart.length} Barang)
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

              {/* Simulasi Efek Pembukuan */}
              <div
                className={`p-3 rounded-xl border space-y-1.5 text-[11px] ${
                  isModeSesamaMitra
                    ? 'bg-teal-50/80 border-teal-200 text-teal-950'
                    : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                }`}
              >
                <div className="font-bold uppercase tracking-wider text-[10px]">
                  Alur Pembukuan Otomatis (
                  {isModeSesamaMitra ? 'Opsi Sesama Mitra' : 'Fokus Utama: Anak Perusahaan'}):
                </div>
                <div className="flex justify-between gap-2">
                  <span>1. Buku {selectedMitraObj?.nama || 'Mitra Pengambil'}:</span>
                  <strong className="font-mono tabular-nums text-amber-800">
                    +Bon ke PT {formatRupiah(grandTotal)}
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
              </div>

              <button
                type="button"
                disabled={
                  submitting ||
                  (cart.length === 0 && (!namaBarangInput.trim() || Number(hargaInput) <= 0))
                }
                onClick={handleSubmitNotaSilang}
                className={`w-full py-2.5 px-4 rounded-xl disabled:opacity-50 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  isModeSesamaMitra
                    ? 'bg-teal-700 hover:bg-teal-800'
                    : 'bg-indigo-700 hover:bg-indigo-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Menyimpan Nota Silang...'
                    : `Simpan Nota Silang (${formatRupiah(grandTotal)})`}
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
                Anak Perusahaan
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
                  return (
                    <tr key={ns.noNotaSilang} className="hover:bg-zinc-50/80">
                      <td className="py-3 px-3.5 font-mono font-bold text-indigo-800 whitespace-nowrap">
                        <div>{ns.noNotaSilang}</div>
                        <div className="text-[10px] font-sans font-normal text-zinc-500">
                          {isSesama ? 'Sesama Mitra' : 'Anak Perusahaan'}
                          {ns.noNotaToko ? ` · Ref: ${ns.noNotaToko}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-mono tabular-nums text-zinc-600 whitespace-nowrap">
                        {ns.tanggal}
                      </td>
                      <td className="py-3 px-3.5 font-bold text-zinc-900">{ns.namaMitra}</td>
                      <td className="py-3 px-3.5">
                        <div
                          className={`font-bold ${
                            isSesama ? 'text-teal-800' : 'text-amber-900'
                          }`}
                        >
                          {ns.namaAnakPerusahaan}
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {isSesama ? 'Mitra Penyedia' : 'Anak Perusahaan PT'}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-zinc-700">
                        <div className="space-y-0.5">
                          {ns.items.map((it, i) => (
                            <div key={i} className="text-[11px]">
                              • <strong>{it.namaBarang}</strong> (
                              <span className="font-mono tabular-nums">
                                {it.qty} {it.satuan || 'PCS'} × {formatRupiah(it.harga)}
                              </span>
                              )
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono tabular-nums font-bold text-indigo-900 whitespace-nowrap">
                        {formatRupiah(ns.totalNominal)}
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
                              <button
                                type="button"
                                onClick={() => onOpenRekeningKoranMitra(ns.idMitra)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 hover:bg-amber-600 text-amber-900 hover:text-white border border-amber-300 text-[10px] font-bold cursor-pointer transition-colors"
                                title={`Buka Rekening Koran ${ns.namaMitra}`}
                              >
                                <span>Buku Mitra</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenRekeningKoranMitra(ns.idMitraAnakPerusahaan)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-sky-50 hover:bg-sky-700 text-sky-900 hover:text-white border border-sky-300 text-[10px] font-bold cursor-pointer transition-colors"
                                title={`Buka Rekening Koran ${ns.namaAnakPerusahaan}`}
                              >
                                <span>{isSesama ? 'Buku Mitra 2' : 'Buku Toko'}</span>
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
              Membatalkan Nota Silang ini akan menghapus piutang pada buku{' '}
              <strong>{deleteTarget.namaMitra}</strong> sekaligus menghapus catatan JML UANG pada
              buku <strong>{deleteTarget.namaAnakPerusahaan}</strong> senilai{' '}
              <strong>{formatRupiah(deleteTarget.totalNominal)}</strong>.
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
